// Author:- Sanam Poojitha / Antigravity
// Transylvania County, North Carolina (NC) Parcel ID Search Controller

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000,
};

function createPropertyObject() {
    return {
        processed_date: "",
        order_number: "",
        borrower_name: "",
        owner_name: [],
        property_address: "",
        parcel_number: "",
        land_value: "",
        improvements: "",
        total_assessed_value: "",
        exemption: "",
        total_taxable_value: "",
        taxing_authority: "Transylvania County Tax Administration, 101 S Broad St, Brevard, NC 28712",
        notes: "",
        delinquent: "NONE",
        tax_history: [],
    };
}

function createTaxHistory() {
    return {
        jurisdiction: "County",
        year: "",
        payment_type: "Annual",
        status: "",
        base_amount: "",
        amount_paid: "",
        amount_due: "",
        mailing_date: "N/A",
        due_date: "",
        delq_date: "",
        paid_date: "-",
        good_through_date: "-",
    };
}

function formatCurrency(val) {
    if (val === undefined || val === null || val === "") return "$0.00";
    const cleaned = String(val).replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? "$0.00" : `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function determineStatus(amountDue, dueDateStr, delqDateStr) {
    const cleanDue = parseFloat(String(amountDue).replace(/[^0-9.]/g, "")) || 0;
    if (cleanDue <= 0) return "Paid";

    const today = new Date();
    const delqDate = new Date(delqDateStr);
    return today > delqDate ? "Delinquent" : "Due";
}

// -------------------------------------------------------------
// STEP 1: SEARCH PARCEL ID
// -------------------------------------------------------------
async function searchAccountNumber(page, account) {
    await page.goto("https://tax.transylvaniacounty.org/TaxBillSearch", {
        waitUntil: "domcontentloaded",
        ...timeout_option,
    });

    // Enter parcel into segmented input boxes
    await page.waitForSelector("#ParcelTextFormat input.parcel-format", { visible: true, ...timeout_option });
    await page.evaluate((p) => {
        const clean = String(p).replace(/[^0-9A-Za-z]/g, "");
        const inputs = document.querySelectorAll("#ParcelTextFormat input.parcel-format");
        let idx = 0;
        inputs.forEach((input) => {
            const max = input.maxLength;
            input.value = clean.substr(idx, max);
            idx += max;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        const hidden = document.querySelector("#ParcelNumber");
        if (hidden) hidden.value = clean;
    }, account);

    // Leave #TaxYear as "All Years" (default value "") to retrieve full tax bill list
    await page.click("#tax-bill-search-submit");

    // Wait for search results table
    await page.waitForSelector("#PayTaxBills tbody tr", { visible: true, timeout: 30000 });
}

// -------------------------------------------------------------
// STEP 2: SCRAPE DETAILS & TAX HISTORY
// -------------------------------------------------------------
async function getPropertyAndTaxDetails(page, account) {
    // 1. Read all summary rows from the search results table
    const tableRows = await page.$$eval("#PayTaxBills tbody tr", (trs) => {
        return trs.map((tr) => {
            const tds = [...tr.querySelectorAll("td")].map((td) => td.innerText.trim());
            return {
                id: tr.id,
                year: tds[0] || "",
                billNo: tds[1] || "",
                accountNo: tds[2] || "",
                owner: tds[3] || "",
                description: tds[4] || "",
                levy: tds[5] || "0.00",
                balance: tds[6] || "0.00",
                cart: tds[7] || "",
            };
        });
    });

    if (!tableRows || tableRows.length === 0) {
        throw new Error(`No tax records found for parcel ${account}`);
    }

    // 2. Click the first row (most recent tax year) to load full details
    await page.click("#PayTaxBills tbody tr");

    await page.waitForFunction(
        () => !!document.querySelector("#view-item-partial .info-row-label"),
        { timeout: 20000 }
    );
    await page.waitForSelector("#TaxDistrictsData-footer td", { timeout: 20000 });

    // 3. Scrape detail values from #view-item-partial
    const details = await page.evaluate(() => {
        const getText = (el) => (el ? el.innerText.trim() : "");

        // Owner Info
        const accountFieldset = [...document.querySelectorAll("fieldset legend")].find((l) =>
            l.innerText.includes("Account Info")
        );
        const accountOL = accountFieldset?.nextElementSibling;
        let owner_names = [];
        let mailing_address = "";
        if (accountOL) {
            const lis = [...accountOL.querySelectorAll("li")].map((li) => getText(li)).filter(Boolean);
            for (let i = 1; i < lis.length; i++) {
                if (i === 1) owner_names.push(lis[i]);
                else mailing_address += (mailing_address ? ", " : "") + lis[i];
            }
        }

        // Bill Info
        const billFieldset = [...document.querySelectorAll("fieldset legend")].find((l) =>
            l.innerText.includes("Bill Info")
        );
        let parcel_number = "";
        let yearBill = "";
        if (billFieldset) {
            const lis = billFieldset.nextElementSibling?.querySelectorAll("li") || [];
            lis.forEach((li) => {
                const label = getText(li.querySelector(".info-row-label"));
                const text = getText(li.querySelector(".info-row-text"));
                if (label.includes("Parcel Number")) parcel_number = text;
                if (label.includes("Year-Bill Number")) yearBill = text;
            });
        }

        // Taxable Values
        const taxableFieldset = [...document.querySelectorAll("fieldset legend")].find((l) =>
            l.innerText.includes("Taxable Values")
        );
        let assessedVal = "";
        let taxableVal = "";
        if (taxableFieldset) {
            const lis = taxableFieldset.nextElementSibling?.querySelectorAll("li") || [];
            lis.forEach((li) => {
                const label = getText(li.querySelector(".info-row-label"));
                const text = getText(li.querySelector(".info-row-text"));
                if (label.includes("Parcel Value Total")) assessedVal = text;
                if (label.includes("Taxable Value")) taxableVal = text;
            });
        }

        // Balance Info
        const balanceFieldset = [...document.querySelectorAll("fieldset legend")].find((l) =>
            l.innerText.includes("Balance Info")
        );
        let paid_date = "-";
        if (balanceFieldset) {
            const lis = balanceFieldset.nextElementSibling?.querySelectorAll("li") || [];
            lis.forEach((li) => {
                const label = getText(li.querySelector(".info-row-label"));
                const text = getText(li.querySelector(".info-row-text"));
                if (label.includes("Last Payment Date") && text) paid_date = text;
            });
        }

        // Footer amounts
        const footerCells = [...document.querySelectorAll("#TaxDistrictsData-footer td")].map((td) => getText(td));
        const base_amount = footerCells[1] || "0.00";
        const interest_fees = footerCells[2] || "0.00";
        const discount = footerCells[4] || "0.00";
        const collected = footerCells[5] || "0.00";
        const balance = footerCells[6] || "0.00";

        return {
            owner_names,
            mailing_address,
            parcel_number,
            yearBill,
            assessedVal,
            taxableVal,
            paid_date,
            base_amount,
            interest_fees,
            discount,
            collected,
            balance,
        };
    });

    // 4. Construct Property Object
    const result = createPropertyObject();
    result.owner_name = details.owner_names.length > 0 ? details.owner_names : [tableRows[0].owner];
    result.parcel_number = details.parcel_number || account;
    result.total_assessed_value = formatCurrency(details.assessedVal);
    result.total_taxable_value = formatCurrency(details.taxableVal);

    // Property Address extraction
    let propAddress = "";
    if (tableRows[0]?.description) {
        const lines = tableRows[0].description.split("\n").map((s) => s.trim()).filter(Boolean);
        const streetLine = lines.find((l) =>
            /^\d+\s+[A-Za-z0-9\s]+(?:ST|RD|CT|AVE|BLVD|DR|LN|WAY|CIR|TRL|HWY|PKWY)/i.test(l)
        );
        const cityZipMatch = (details.mailing_address || "").match(/([A-Za-z\s]+,\s*NC\s*\d{5})/i);
        if (streetLine && cityZipMatch) {
            propAddress = `${streetLine}, ${cityZipMatch[1].trim()}`;
        } else if (streetLine) {
            propAddress = streetLine;
        }
    }
    result.property_address = propAddress || details.mailing_address || "N/A";

    // 5. Construct Tax History
    const latestYear = parseInt(tableRows[0].year, 10);
    const dueDate = `09/01/${latestYear}`;
    const delqDate = `01/05/${latestYear + 1}`;
    const status = determineStatus(details.balance, dueDate, delqDate);

    const latestTaxRecord = createTaxHistory();
    latestTaxRecord.year = String(latestYear);
    latestTaxRecord.status = status;
    latestTaxRecord.base_amount = formatCurrency(details.base_amount);
    latestTaxRecord.amount_paid = formatCurrency(details.collected);
    latestTaxRecord.amount_due = formatCurrency(details.balance);
    latestTaxRecord.due_date = dueDate;
    latestTaxRecord.delq_date = delqDate;
    latestTaxRecord.paid_date = details.paid_date || "-";

    result.tax_history.push(latestTaxRecord);

    // Check prior years in search results table
    let priorsDelinquent = false;
    const isLatestPaid = status === "Paid";

    for (let i = 1; i < tableRows.length; i++) {
        const row = tableRows[i];
        const yr = parseInt(row.year, 10);
        if (isNaN(yr)) continue;

        const rowDueDate = `09/01/${yr}`;
        const rowDelqDate = `01/05/${yr + 1}`;
        const rowStatus = determineStatus(row.balance, rowDueDate, rowDelqDate);

        if (rowStatus !== "Paid") {
            priorsDelinquent = true;
        }

        // If the latest year is unpaid, include unpaid prior years until the first paid prior year
        if (!isLatestPaid) {
            if (rowStatus !== "Paid") {
                const priorRec = createTaxHistory();
                priorRec.year = String(yr);
                priorRec.status = rowStatus;
                priorRec.base_amount = formatCurrency(row.levy);
                priorRec.amount_paid = "$0.00";
                priorRec.amount_due = formatCurrency(row.balance);
                priorRec.due_date = rowDueDate;
                priorRec.delq_date = rowDelqDate;
                priorRec.paid_date = "-";
                result.tax_history.push(priorRec);
            } else {
                // First paid prior year reached: stop adding
                break;
            }
        }
    }

    // Sort tax_history ascending by year
    result.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        return yearA - yearB;
    });

    // 6. Notes and Delinquency
    const hasDelinquent =
        result.tax_history.some((t) => t.status.toUpperCase() === "DELINQUENT") || priorsDelinquent;
    result.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

    const priorsTxt = priorsDelinquent ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";
    const suffix =
        ", NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE AND DELQ DATES ARE 09/01 01/05, CITY TAX NEED TO CONFIRM";
    result.notes = `${priorsTxt}, ${latestYear} TAXES ARE ${status.toUpperCase()}${suffix}`;

    return result;
}

// -------------------------------------------------------------
// MAIN ORCHESTRATOR
// -------------------------------------------------------------
const account_search = async (page, account) => {
    await searchAccountNumber(page, account);
    return await getPropertyAndTaxDetails(page, account);
};

// -------------------------------------------------------------
// EXPRESS HANDLER
// -------------------------------------------------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    try {
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(90000);

        if (fetch_type === "html") {
            account_search(page, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.error("Transylvania search html error:", error);
                    res.status(200).render("error_data", {
                        error: true,
                        message: error.message,
                    });
                })
                .finally(async () => {
                    // await context.close();
                });
        } else if (fetch_type === "api") {
            account_search(page, account)
                .then((data) => {
                    res.status(200).json({ result: data });
                })
                .catch((error) => {
                    console.error("Transylvania search api error:", error);
                    res.status(500).json({
                        error: true,
                        message: error.message,
                    });
                })
                .finally(async () => {
                    // await context.close();
                });
        }
    } catch (error) {
        console.error("Transylvania handler error:", error);
        if (fetch_type === "html") {
            res.status(200).render("error_data", {
                error: true,
                message: error.message,
            });
        } else if (fetch_type === "api") {
            res.status(500).json({
                error: true,
                message: error.message,
            });
        }
    }
};

export { search };
