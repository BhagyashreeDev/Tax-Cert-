// Author:- Sanam Poojitha / Antigravity
// Skagit County, Washington (WA) Parcel ID Search Controller

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
        taxing_authority: "Skagit County Treasurer, 700 S. 2nd Street, Room 205, Mount Vernon, WA 98273",
        notes: "",
        delinquent: "NONE",
        tax_history: [],
    };
}

function createTaxHistory() {
    return {
        jurisdiction: "County",
        year: "",
        payment_type: "",
        status: "",
        base_amount: "",
        amount_paid: "",
        amount_due: "",
        mailing_date: "N/A",
        due_date: "",
        delq_date: "",
        paid_date: "",
        good_through_date: "",
    };
}

function formatDate(inputDate) {
    if (!inputDate || inputDate === "-" || inputDate === "N/A") return "-";
    const date = new Date(inputDate);
    if (isNaN(date.getTime())) return "-";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
}

function formatCurrency(val) {
    if (val === undefined || val === null || val === "" || val === "N/A" || val === "-") return "$0.00";
    const num = Math.abs(Number(String(val).replace(/[^0-9.-]/g, "")));
    if (isNaN(num)) return "$0.00";
    return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAssessedValue(val) {
    if (val === undefined || val === null || val === "" || val === "N/A" || val === "-") return "N/A";
    const cleaned = String(val).replace(/[^0-9.-]/g, "");
    if (!cleaned) return "N/A";
    const num = Number(cleaned);
    if (isNaN(num)) return "N/A";
    return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const generate_notes = (year, keys, status1, status2) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${status1.toUpperCase()}, 2ND INSTALLMENT IS ${status2.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE 04/30 AND 10/31`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// -------------------------------------------------------------
// STEP 1: SEARCH BY PARCEL NUMBER
// -------------------------------------------------------------
async function searchAccountNumber(accountNumber, page) {
    const url = "https://classic.skagitcountywa.gov/search/Property/";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Select "Parcel #" radio button
    await page.waitForSelector("#propid", timeout_option);
    await page.click("#propid");

    // Clear and enter parcel number
    await page.waitForSelector("#tbAuto", timeout_option);
    await page.evaluate(() => {
        const tb = document.querySelector("#tbAuto");
        if (tb) tb.value = "";
    });
    await page.type("#tbAuto", String(accountNumber), { delay: 40 });

    // Submit search
    await page.keyboard.press("Enter");

    // Wait for property details to populate inside #content_pdata
    await page.waitForFunction(() => {
        const pdata = document.querySelector("#content_pdata");
        if (!pdata) return false;
        const text = pdata.innerText || "";
        return text.includes("Details for Parcel") || text.includes("Owner Information") || text.includes("No matching records found");
    }, { timeout: 30000 });

    const notFound = await page.evaluate(() => {
        const text = document.querySelector("#content_pdata")?.innerText || "";
        return text.includes("No matching records found");
    });
    if (notFound) {
        throw new Error(`Parcel not found: ${accountNumber}`);
    }
}

// -------------------------------------------------------------
// STEP 2: SCRAPE PROPERTY & VALUATION DETAILS (Summary Tab)
// -------------------------------------------------------------
async function getPropertyDetails(page) {
    return await page.evaluate(() => {
        const normalize = s => s?.replace(/\s+/g, " ").trim() || "";

        let parcel_number = "";
        let owner_name = [];
        let property_address = "N/A";
        let land_value = "N/A";
        let improvements = "N/A";
        let total_assessed_value = "N/A";
        let exemption = "";
        let total_taxable_value = "N/A";

        // 1. Parcel Number from header
        const pdata = document.querySelector("#content_pdata");
        const headerMatch = pdata?.innerText?.match(/Details for Parcel:\s*([A-Za-z0-9]+)/i);
        if (headerMatch) {
            parcel_number = headerMatch[1].trim();
        }

        // 2. Owner Information
        const tables = Array.from(document.querySelectorAll("table"));
        for (const tbl of tables) {
            const text = tbl.innerText || "";
            if (text.includes("Owner Information")) {
                const rows = Array.from(tbl.querySelectorAll("tr"));
                if (rows.length >= 2) {
                    const primaryOwner = normalize(rows[1]?.innerText);
                    if (primaryOwner) owner_name = [primaryOwner];
                }
            }
        }

        // 3. Property Site Address
        for (const tbl of tables) {
            const text = tbl.innerText || "";
            if (text.includes("Site Address(es)") || text.includes("Site Addresses")) {
                const rows = Array.from(tbl.querySelectorAll("tr"));
                const addrRows = rows
                    .map(r => normalize(r.innerText))
                    .filter(t => t && !t.includes("Site Address") && !t.includes("Old Address") && !t.includes("Zip Code"));

                if (addrRows.length > 0) {
                    const primaryStreet = addrRows[0];
                    const countyState = addrRows.find(a => a.includes("Skagit County, WA") || a.includes("WA"));
                    if (countyState && !primaryStreet.includes("WA")) {
                        property_address = `${primaryStreet}, ${countyState.replace(/\(.*\)/, "").trim()}`;
                    } else {
                        property_address = primaryStreet;
                    }
                }
            }
        }

        // 4. Valuation Table (e.g. 2026 Values for 2027 Taxes)
        for (const tbl of tables) {
            const rows = Array.from(tbl.querySelectorAll("tr"));
            for (const row of rows) {
                const cells = Array.from(row.querySelectorAll("td, th")).map(c => normalize(c.innerText));
                if (cells.length < 2) continue;
                const label = cells[0].toLowerCase();
                const val = cells[1];

                if (/^land market value/i.test(label)) {
                    land_value = val;
                } else if (/^building market value/i.test(label)) {
                    improvements = val;
                } else if (/^assessed value/i.test(label)) {
                    total_assessed_value = val;
                } else if (/^taxable value/i.test(label)) {
                    total_taxable_value = val;
                } else if (/current use adj|exemption/i.test(label)) {
                    exemption = val;
                }
            }
        }

        // Fallback for assessed value if "Assessed Value" row was not found
        if (total_assessed_value === "N/A") {
            for (const tbl of tables) {
                const rows = Array.from(tbl.querySelectorAll("tr"));
                for (const row of rows) {
                    const cells = Array.from(row.querySelectorAll("td, th")).map(c => normalize(c.innerText));
                    if (cells.length >= 2 && /^total market value/i.test(cells[0])) {
                        total_assessed_value = cells[1];
                        break;
                    }
                }
            }
        }

        return {
            parcel_number,
            owner_name,
            property_address,
            land_value,
            improvements,
            total_assessed_value,
            exemption,
            total_taxable_value
        };
    });
}

// -------------------------------------------------------------
// STEP 3: NAVIGATE TO TAXES TAB & SCRAPE TAX DETAILS
// -------------------------------------------------------------


async function getTaxDetails(page) {
    // 1. Click Taxes tab link (no offsetParent restriction)
    await page.waitForSelector("#propmenu a[href='Taxes']", { waitUntil: "domcontentloaded", ...timeout_option });
    const clicked = await page.evaluate(() => {
        const allLinks = Array.from(document.querySelectorAll("a"));
        const taxLink = allLinks.find(a => a.textContent.trim() === "Taxes" || a.getAttribute("href") === "Taxes");
        if (taxLink) {
            taxLink.click();
            return true;
        }
        return false;
    });

    if (!clicked) {
        throw new Error("Could not find Taxes tab");
    }

    // 2. Wait for Taxes tab content to load (confirmed by #cboYear selector)
    await page.waitForSelector("#cboYear", timeout_option);

    // 3. Extract tax records
    return await page.evaluate(() => {
        const normalize = s => s?.replace(/\s+/g, " ").trim() || "";
        const history = [];

        // Current selected year from #cboYear
        const cbo = document.querySelector("#cboYear");
        const currentYear = cbo ? cbo.value : String(new Date().getFullYear());

        // Find rows matching First/Second installment
        const allRows = Array.from(document.querySelectorAll("tr"));
        const installmentRows = allRows.filter(tr => /installment/i.test(tr.innerText));

        const today = new Date();

        installmentRows.forEach(tr => {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 4) return;

            const label = normalize(tds[2].innerText);
            const paymentText = normalize(tds[3].innerText);

            const isFirst = /first/i.test(label);
            const isSecond = /second/i.test(label);
            if (!isFirst && !isSecond) return;

            const due_date = isFirst ? `04/30/${currentYear}` : `10/31/${currentYear}`;
            const delq_date = isFirst ? `05/01/${currentYear}` : `11/01/${currentYear}`;

            const amountMatch = paymentText.match(/[\$0-9\.,]+/);
            const base_amount = amountMatch ? amountMatch[0] : "$0.00";

            let status = "Due";
            const isPaid = /paid/i.test(paymentText);
            if (isPaid) {
                status = "Paid";
            } else {
                const delqParts = delq_date.split("/");
                const delqObj = new Date(delqParts[2], delqParts[0] - 1, delqParts[1]);
                if (today >= delqObj) {
                    status = "Delinquent";
                } else {
                    status = "Due";
                }
            }

            const amount_paid = status === "Paid" ? base_amount : "$0.00";
            const amount_due = status === "Paid" ? "$0.00" : base_amount;

            history.push({
                jurisdiction: "County",
                year: currentYear,
                installment: isFirst ? "1st Half" : "2nd Half",
                payment_type: isFirst ? "INSTALLMENT 1" : "INSTALLMENT 2",
                status,
                base_amount,
                amount_paid,
                amount_due,
                mailing_date: "N/A",
                due_date,
                delq_date,
                paid_date: "-",
                good_through_date: "-",
            });
        });

        return {
            currentInstallments: history,
            currentYear
        };
    });
}

// -------------------------------------------------------------
// STEP 4: POPULATE PROPERTY OBJECT
// -------------------------------------------------------------
function populateObject(accountNumber, propData, taxData) {
    const result = createPropertyObject();
    result.processed_date = formatDate(new Date());
    result.parcel_number = propData.parcel_number || accountNumber;
    result.owner_name = propData.owner_name;
    result.property_address = propData.property_address;
    result.total_assessed_value = formatAssessedValue(propData.total_assessed_value);
    result.total_taxable_value = formatAssessedValue(propData.total_taxable_value);

    // Current year installments
    result.tax_history = (taxData.currentInstallments || []).map(c => ({
        jurisdiction: c.jurisdiction,
        year: c.year,
        payment_type: c.payment_type,
        status: c.status,
        base_amount: formatCurrency(c.base_amount),
        amount_paid: formatCurrency(c.amount_paid),
        amount_due: formatCurrency(c.amount_due),
        mailing_date: c.mailing_date,
        due_date: formatDate(c.due_date),
        delq_date: formatDate(c.delq_date),
        paid_date: c.paid_date,
        good_through_date: c.good_through_date,
    }));

    result.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) {
            return yearA - yearB;
        }
        if (a.status === "Paid" && b.status !== "Paid") return -1;
        if (a.status !== "Paid" && b.status === "Paid") return 1;
        return 0;
    });

    if (result.tax_history.length > 0) {
        // Check if ANY tax is delinquent for the main delinquency flag
        const hasDelinquent = result.tax_history.some(
            (t) => (t.status || "").toUpperCase() === "DELINQUENT"
        );
        result.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        // Get the latest tax record (the array is sorted ascending by year)
        const latestTax = result.tax_history[result.tax_history.length - 1];

        // Find individual statuses for the 1st and 2nd installments of the latest year
        const latestYearRecords = result.tax_history.filter(t => String(t.year) === String(latestTax.year));
        const inst1 = latestYearRecords.find(t => (t.payment_type || "").toUpperCase() === "INSTALLMENT 1");
        const inst2 = latestYearRecords.find(t => (t.payment_type || "").toUpperCase() === "INSTALLMENT 2");

        const status1 = inst1 ? inst1.status : "UNKNOWN";
        const status2 = inst2 ? inst2.status : "UNKNOWN";

        // Check if any PRIOR year is delinquent (exclude the latest year)
        const hasPriorDelinquent = result.tax_history.some(
            (t) => (t.status || "").toUpperCase() === "DELINQUENT" && String(t.year) !== String(latestTax.year)
        );

        // If priors are delinquent, keys = 0. If priors are paid, keys = 1.
        const keys = hasPriorDelinquent ? 0 : 1;

        result.notes = generate_notes(latestTax.year, keys, status1, status2);
    }

    return result;
}

// -------------------------------------------------------------
// MAIN ORCHESTRATOR
// -------------------------------------------------------------
const account_search = async (page, accountNumber) => {
    try {
        await searchAccountNumber(accountNumber, page);
        const propData = await getPropertyDetails(page);
        const taxData = await getTaxDetails(page);
        return populateObject(accountNumber, propData, taxData);
    } catch (error) {
        console.error("Error inside Skagit account_search:", error);
        throw new Error(error.message);
    }
};

// -------------------------------------------------------------
// EXPRESS HANDLER
// -------------------------------------------------------------
const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    if (account) {
        account = String(account).trim();
    }

    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render("error_data", {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        page.setDefaultNavigationTimeout(90000);

        if (fetch_type === "html") {
            account_search(page, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.error("Skagit search html error:", error);
                    res.status(200).render("error_data", {
                        error: true,
                        message: error.message
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
                    console.error("Skagit search api error:", error);
                    res.status(500).json({
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    // await context.close();
                });
        }

    } catch (error) {
        console.error("Skagit handler error:", error);
        if (fetch_type === "html") {
            res.status(200).render("error_data", {
                error: true,
                message: error.message
            });
        } else if (fetch_type === "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
};

export { search };
