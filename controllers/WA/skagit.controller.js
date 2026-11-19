// Author:- Bhagyashree Badadal
// Skagit County, Washington (WA) Controller

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
        total_assessed_value: "N/A",
        exemption: "",
        total_taxable_value: "N/A",
        delinquent: "NONE",
        taxing_authority: "Skagit County Treasurer's Office 700 S. 2nd Street, Room 205 Mount Vernon, WA 98273 P.O. Box 518 Mount Vernon, WA 98273",
        notes: "",
        tax_history: []
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
        good_through_date: "-",
    };
}

// for generating notes
const generate_notes = (year, keys, status1, status2) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${status1.toUpperCase()}, 2ND INSTALLMENT IS ${status2.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE 12/20 AND 06/20`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// search for the parcel-ID
async function searchAccountNumber(accountNumber, page) {
    const url = "https://classic.skagitcountywa.gov/Search/Property/";
    await page.goto(url, { waitUntil: "domcontentloaded", ...timeout_option });

    // Select "Parcel #" radio button
    await page.waitForSelector("#propid", { visible: true, ...timeout_option });
    await page.click("#propid");

    // Enter parcel number
    await page.type("#tbAuto", String(accountNumber), { delay: 30 });

    // Submit search (press Enter) and wait for navigation
    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }).catch(() => null),
        page.keyboard.press("Enter")
    ]);
}

// fetch property details
async function fetchPropertyDetails(page) {
    await page.waitForSelector("b", { visible: true, timeout: 15000 });

    return await page.evaluate(() => {
        const normalize = (str) => str?.replace(/\s+/g, " ").trim() || "";

        let owner_name = [];
        let property_address = "";

        const ownerHeader = Array.from(document.querySelectorAll("b")).find((b) =>
            /owner information/i.test(normalize(b.innerText))
        );

        if (ownerHeader) {
            const ownerTable = ownerHeader.closest("table");
            if (ownerTable) {
                const rows = Array.from(ownerTable.querySelectorAll("tr")).slice(1);
                owner_name = [normalize(rows[0]?.innerText)];
            }
        }

        const siteHeader = Array.from(document.querySelectorAll("b, th")).find((el) =>
            /site address/i.test(normalize(el.innerText))
        );

        if (siteHeader) {
            const siteTable = siteHeader.closest("table");
            if (siteTable) {
                const rows = Array.from(siteTable.querySelectorAll("tr")).slice(1);
                for (const r of rows) {
                    const txt = normalize(r.innerText);
                    if (txt && !txt.toLowerCase().includes("site address") && !txt.toLowerCase().includes("lookup") && !txt.toLowerCase().includes("jurisdiction")) {
                        property_address = txt;
                        break;
                    }
                }
            }
        }

        let parcel_number = "N/A";
        const tables = Array.from(document.querySelectorAll("table"));
        for (const tbl of tables) {
            const headerRow = tbl.querySelector("tr");
            if (!headerRow) continue;
            const firstB = headerRow.querySelector("b");
            if (firstB && normalize(firstB.innerText).includes("Parcel Number")) {
                const rows = Array.from(tbl.querySelectorAll("tr"));
                if (rows.length >= 2) {
                    const b = rows[1].querySelector("b");
                    if (b) parcel_number = normalize(b.innerText);
                }
            }
        }

        let total_assessed_value = "N/A";
        let total_taxable_value = "N/A";
        const allRows = Array.from(document.querySelectorAll("tr"));
        for (const row of allRows) {
            const tds = row.querySelectorAll("td");
            if (tds.length < 2) continue;
            const label = normalize(tds[0].innerText).toLowerCase();
            const val = normalize(tds[1].innerText);
            if (/^assessed value/i.test(label) && /^\$[\d,]+(\.\d{2})?$/.test(val)) {
                total_assessed_value = val;
            }
            if (/^taxable value/i.test(label) && /^\$[\d,]+(\.\d{2})?$/.test(val)) {
                total_taxable_value = val;
            }
        }

        return {
            owner_name,
            property_address,
            parcel_number,
            total_assessed_value,
            total_taxable_value
        };
    });
}

// fetch tax details
async function fetchTaxDetails(page) {
    try {
        await page.waitForSelector("#propmenu a[href='Taxes']", { visible: true, timeout: 15000 });
        await page.click("#propmenu a[href='Taxes']");
        await page.waitForFunction(() => {
            return Array.from(document.querySelectorAll("tr")).some((tr) =>
                /installment/i.test(tr.innerText)
            );
        }, { timeout: 15000 }).catch(() => null);
    } catch (e) {
        console.log("Error opening taxes tab:", e.message);
    }

    const currentTaxes = await page.evaluate(() => {
        const normalize = (s) => s?.replace(/\s+/g, " ").trim() || "";
        const history = [];
        const rows = Array.from(document.querySelectorAll("tr")).filter((tr) =>
            /installment/i.test(tr.innerText)
        );

        rows.forEach((tr) => {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 4) return;

            const label = normalize(tds[2].innerText);
            const payment = normalize(tds[3].innerText);
            const yearMatch = label.match(/(20\d{2})/);
            if (!yearMatch) return;
            const year = yearMatch[1];

            let payment_type = "INSTALLMENT 1";
            if (/second/i.test(label)) payment_type = "INSTALLMENT 2";

            const amount = (payment.match(/([\$0-9\.,]+)/) || ["$0.00"])[0];
            let due_date = "N/A", delq_date = "N/A";
            if (payment_type === "INSTALLMENT 1") {
                due_date = `04/30/${year}`;
                delq_date = `05/01/${year}`;
            } else {
                due_date = `10/31/${year}`;
                delq_date = `11/01/${year}`;
            }

            let status = "DUE";
            const today = new Date();
            const delqParts = delq_date.split("/");
            const delq = new Date(delqParts[2], delqParts[0] - 1, delqParts[1]);
            if (/paid/i.test(payment)) status = "Paid";
            else if (today > delq) status = "DELINQUENT";

            let amount_paid = "$0.00";
            let amount_due = "$0.00";
            if (status === "Paid") {
                amount_paid = amount;
                amount_due = "$0.00";
            } else {
                amount_paid = "$0.00";
                amount_due = amount;
            }

            history.push({
                year,
                jurisdiction: "County",
                base_amount: amount,
                amount_due,
                amount_paid,
                paid_date: "",
                receipt_no: "",
                payment_type,
                mailing_date: "N/A",
                due_date,
                delq_date,
                status
            });
        });
        return history;
    });

    const delinquentTaxes = await page.evaluate(() => {
        const normalize = (s) => s?.replace(/\s+/g, " ").trim() || "";
        const tbl = document.querySelector("#tblDelinquent");
        if (!tbl) return [];

        const rows = Array.from(tbl.querySelectorAll("tr")).slice(2, -1);
        const delqList = [];
        for (const tr of rows) {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 5) continue;

            const year = normalize(tds[0].innerText);
            const base_amount = normalize(tds[1].innerText);
            const total = normalize(tds[4].innerText);
            if (!/^\d{4}$/.test(year)) continue;

            delqList.push({
                year,
                jurisdiction: "County",
                base_amount,
                amount_due: total,
                amount_paid: "$0.00",
                paid_date: "",
                receipt_no: "",
                payment_type: "Annual",
                mailing_date: "N/A",
                due_date: `04/30/${year}`,
                delq_date: `05/01/${year}`,
                status: "DELINQUENT"
            });
        }
        return delqList;
    });

    const combined = [...currentTaxes];
    delinquentTaxes.forEach((d) => {
        if (!combined.some((h) => h.year === d.year)) {
            combined.push(d);
        }
    });

    return combined;
}

// populate the main object
async function populateTheObject(propertyDetails, taxHistory) {
    const result = createPropertyObject();

    result.owner_name = propertyDetails.owner_name || [];
    result.property_address = propertyDetails.property_address || "";
    result.parcel_number = propertyDetails.parcel_number || "";
    result.total_assessed_value = propertyDetails.total_assessed_value || "N/A";
    result.total_taxable_value = propertyDetails.total_taxable_value || "N/A";
    result.taxing_authority = "Skagit County Treasurer's Office 700 S. 2nd Street, Room 205 Mount Vernon, WA 98273 P.O. Box 518 Mount Vernon, WA 98273";

    taxHistory.forEach((tax) => {
        const item = createTaxHistory();
        item.year = tax.year;
        item.jurisdiction = tax.jurisdiction || "County";
        item.payment_type = tax.payment_type;
        item.status = tax.status;
        item.base_amount = tax.base_amount;
        item.amount_paid = tax.amount_paid;
        item.amount_due = tax.amount_due;
        item.mailing_date = tax.mailing_date || "N/A";
        item.due_date = tax.due_date;
        item.delq_date = tax.delq_date;
        item.paid_date = tax.paid_date || "";
        item.receipt_no = tax.receipt_no || "";
        result.tax_history.push(item);
    });

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
            (t) => t.status === "DELINQUENT"
        );
        result.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        // Get the latest tax record (the array is sorted ascending by year)
        const latestTax = result.tax_history[result.tax_history.length - 1];

        // Find individual statuses for the 1st and 2nd installments of the latest year
        const latestYearRecords = result.tax_history.filter(
            (t) => String(t.year) === String(latestTax.year)
        );
        const inst1 = latestYearRecords.find((t) => t.payment_type === "INSTALLMENT 1");
        const inst2 = latestYearRecords.find((t) => t.payment_type === "INSTALLMENT 2");
        const status1 = inst1 ? inst1.status : "UNKNOWN";
        const status2 = inst2 ? inst2.status : "UNKNOWN";

        // Check if any PRIOR year is delinquent (exclude the latest year)
        const hasPriorDelinquent = result.tax_history.some(
            (t) => t.status === "DELINQUENT" && String(t.year) !== String(latestTax.year)
        );

        // If priors are delinquent, keys = 0. If priors are paid, keys = 1.
        const keys = hasPriorDelinquent ? 0 : 1;
        result.notes = generate_notes(latestTax.year, keys, status1, status2);
    }

    return result;
}

// Main Flow starts from here
const account_search = async (page, url, accountNumber) => {
    try {
        await page.setViewport({ width: 1920, height: 1080 });

        // 1. Search for the Parcel-ID
        await searchAccountNumber(accountNumber, page);

        // 2. Fetch Property Details
        const propertyDetails = await fetchPropertyDetails(page);

        // 3. Fetch Tax Details
        const taxHistory = await fetchTaxDetails(page);

        // 4. Populate Object
        const result = await populateTheObject(propertyDetails, taxHistory);
        if (result.parcel_number === "N/A" || !result.parcel_number) {
            result.parcel_number = accountNumber;
        }

        return result;
    } catch (error) {
        console.log("Error inside account_search:", error);
        throw new Error(error.message);
    }
};

const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    if (account) account = String(account).trim();
    let context;
    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://classic.skagitcountywa.gov/Search/Property/";

        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        const blockedResources = [
            'image', 'media', 'font',
            'texttrack', 'object', 'beacon', 'csp_report', 'imageset'
        ];
        page.on('request', (req) => {
            if (blockedResources.includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            // FRONTEND ENDPOINT
            account_search(page, url, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error);
                    res.status(200).render('error_data', {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => { await context.close(); });
        } else if (fetch_type === "api") {
            // API ENDPOINT
            account_search(page, url, account)
                .then((data) => {
                    res.status(200).json({
                        result: data
                    });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => { await context.close(); });
        }

    } catch (error) {
        console.log("Error inside search:", error);
        if (context) await context.close();

        if (fetch_type === "html") {
            res.status(200).render('error_data', {
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
