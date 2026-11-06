// Author:- Bhagyashree Badadal

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
        taxing_authority: "Rockingham County Tax Administrator, 371 NC Highway 65, Suite 107, Wentworth, NC 27375",
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
        paid_date: "",
        good_through_date: "-",
    };
}

const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID, ${year} `
                : `PRIORS ARE DELINQUENT, ${year} `;
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        notes += ` NORMAL DUE DATE IS 11/01`;
    } catch (error) {
        console.log("Error in generate_notes:", error);
    } finally {
        return notes;
    }
};


// Helper: Formats string dates (e.g., '1-05-2028' or '09-28-2026') to MM/DD/YYYY
function formatDate(dateStr) {
    if (!dateStr || dateStr === "N/A" || dateStr === "-") return "";
    const clean = dateStr.replace(/\s+/g, "");
    const parts = clean.split("-");
    if (parts.length === 3) {
        const mm = parts[0].padStart(2, "0");
        const dd = parts[1].padStart(2, "0");
        const yyyy = parts[2];
        return `${mm}/${dd}/${yyyy}`;
    }
    return dateStr;
}

// Helper: Formats numbers/strings into standard currency ($XX.XX)
function formatCurrency(val) {
    if (!val) return "$0.00";
    const cleaned = val.replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? "$0.00" : `$${num.toFixed(2)}`;
}

// Scrapes View Tax Bill page (taxbill.cfm) dynamically
async function parseTaxBillPage(browser, url) {
    if (!url) return null;
    let tempPage = null;
    try {
        tempPage = await browser.newPage();
        await tempPage.goto(url, { waitUntil: "domcontentloaded" });

        return await tempPage.evaluate(() => {
            // 1. Extract Due Date & Assessed Value from table cells
            const cells = Array.from(document.querySelectorAll("td.Taxbill_white"));
            const dueDate = cells[3]?.innerText?.trim() || "";
            const assessedVal = cells[4]?.innerText?.trim() || "";

            // 2. Extract Owner Name & Property Address from seal section
            const ownerTd = document.querySelector('table[background*="taxbill_page_seal"] td[valign="top"]');
            const lines = ownerTd ? ownerTd.innerText.split("\n").map(l => l.trim()).filter(Boolean) : [];
            const ownerName = lines[0] || "";
            const propertyAddress = lines.slice(1).join(", ");

            // 3. Extract Total Due Amount
            const totalDueEl = document.querySelector("td.redbox div.style3");
            const totalDue = totalDueEl ? totalDueEl.innerText.trim() : "";

            // 4. Extract Parcel Number if available
            const parcelEl = Array.from(document.querySelectorAll("td.smallT1"))
                .find(td => td.innerText.includes("Parcel Number:"));
            let parcelNumber = "";
            if (parcelEl) {
                parcelNumber = parcelEl.innerText.replace("Parcel Number:", "").trim();
            }

            return { dueDate, assessedVal, ownerName, propertyAddress, totalDue, parcelNumber };
        });
    } catch (err) {
        console.error(`Error loading Tax Bill from ${url}:`, err.message);
        return null;
    } finally {
        if (tempPage) await tempPage.close();
    }
}

// Scrapes Transaction History page (transhistory.cfm) dynamically
async function parseTransactionHistoryPage(browser, url, targetBillNo) {
    if (!url) return null;
    let tempPage = null;
    try {
        tempPage = await browser.newPage();
        await tempPage.goto(url, { waitUntil: "domcontentloaded" });

        return await tempPage.evaluate((targetBill) => {
            const table = document.querySelector('table[class*="10arial"]') ||
                Array.from(document.querySelectorAll("table")).find(t =>
                    t.innerText.includes("Tax Year") && t.innerText.includes("Bill No.")
                );
            if (!table) return null;

            const rows = Array.from(table.querySelectorAll("tr"));
            if (rows.length < 2) return null;

            // Map header indices dynamically
            const headerCols = Array.from(rows[0].querySelectorAll("td")).map(td => td.innerText.trim().toLowerCase());
            const billIdx = headerCols.findIndex(h => h.includes("bill"));
            const datePaidIdx = headerCols.findIndex(h => h.includes("date") && h.includes("paid"));
            const amountPaidIdx = headerCols.findIndex(h => h.includes("amount") && h.includes("paid"));
            const dueDateIdx = headerCols.findIndex(h => h.includes("due"));
            const statusIdx = headerCols.findIndex(h => h.includes("status"));

            // Search for target bill or take the first record (most recent)
            for (let i = 1; i < rows.length; i++) {
                const cols = rows[i].querySelectorAll("td");
                const currentBill = cols[billIdx !== -1 ? billIdx : 3]?.innerText?.trim() || "";

                if (!targetBill || currentBill === targetBill || i === 1) {
                    return {
                        billNo: currentBill,
                        datePaid: cols[datePaidIdx !== -1 ? datePaidIdx : 4]?.innerText?.trim() || "",
                        amountPaid: cols[amountPaidIdx !== -1 ? amountPaidIdx : 5]?.innerText?.trim() || "",
                        dueDate: cols[dueDateIdx !== -1 ? dueDateIdx : 6]?.innerText?.trim() || "",
                        status: cols[statusIdx !== -1 ? statusIdx : 7]?.innerText?.trim() || "PAID IN FULL",
                    };
                }
            }
            return null;
        }, targetBillNo);
    } catch (err) {
        console.error(`Error loading Transaction History from ${url}:`, err.message);
        return null;
    } finally {
        if (tempPage) await tempPage.close();
    }
}

// Orchestrates table scraping and conditional workflow
async function getDetails(page, browser) {
    // 1. Scrape all records from the search results table
    const tableRows = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table.a1 tr.style16"));
        const results = [];

        for (const row of rows) {
            const cells = row.querySelectorAll("td");
            if (cells.length < 10) continue;

            const year = cells[1]?.innerText?.trim() || "";
            const account = cells[2]?.innerText?.trim() || "";
            const billNo = cells[3]?.innerText?.trim() || "";

            // Clean owner name
            let rawOwner = cells[4]?.innerText?.trim() || "";
            const ownerName = rawOwner.replace(/\/.*$/, "").replace(/\s+/g, " ").trim();

            const assetDesc = cells[5]?.innerText?.trim() || "";

            // Dynamic status detection from image src
            const img = cells[6]?.querySelector("img");
            const src = img ? img.getAttribute("src") : "";
            let status = "DUE";
            if (src.includes("bill_paid.gif")) {
                status = "PAID";
            } else if (src.includes("bill_open.gif") || src.includes("bill_partial.gif")) {
                status = "DUE";
            }

            const taxesOwed = cells[7]?.innerText?.trim() || "$0.00";

            // Resolve full URLs
            const taxBillAnchor = cells[8]?.querySelector("a");
            const taxBillUrl = taxBillAnchor ? new URL(taxBillAnchor.getAttribute("href"), window.location.href).href : null;

            const transAnchor = cells[9]?.querySelector("a");
            const transHistoryUrl = transAnchor ? new URL(transAnchor.getAttribute("href"), window.location.href).href : null;

            results.push({
                year,
                account,
                billNo,
                ownerName,
                assetDesc,
                status,
                taxesOwed,
                taxBillUrl,
                transHistoryUrl,
            });
        }
        return results;
    });

    if (tableRows.length === 0) return { records: [], propertyInfo: null };

    const firstRow = tableRows[0];
    const collectedRecords = [];
    const propertyInfo = {
        ownerName: firstRow.ownerName,
        propertyAddress: "",
        parcelNumber: firstRow.account,
        assessedValue: "",
    };

    // --- CASE 1: Recent Year is PAID ---
    if (firstRow.status === "PAID") {
       
        // Fetch payment details from Transaction History
        const transDetails = await parseTransactionHistoryPage(browser, firstRow.transHistoryUrl, firstRow.billNo);
    
        // Fetch address & assessed value from View Tax Bill
        const billDetails = await parseTaxBillPage(browser, firstRow.taxBillUrl);
        
        if (billDetails) {
            propertyInfo.propertyAddress = billDetails.propertyAddress || "";
            propertyInfo.assessedValue = billDetails.assessedVal ? `$${billDetails.assessedVal}` : "";
            if (billDetails.parcelNumber) propertyInfo.parcelNumber = billDetails.parcelNumber;
        }

        collectedRecords.push({
            year: firstRow.year,
            status: "Paid",
            baseAmount: transDetails ? formatCurrency(transDetails.amountPaid) : formatCurrency(firstRow.taxesOwed),
            amountPaid: transDetails ? formatCurrency(transDetails.amountPaid) : "$0.00",
            amountDue: "$0.00",
            dueDate: transDetails ? formatDate(transDetails.dueDate) : (billDetails ? formatDate(billDetails.dueDate) : ""),
            paidDate: transDetails ? formatDate(transDetails.datePaid) : "",
        });

        return { records: collectedRecords, propertyInfo };
    }

    // --- CASE 2: Consecutive DUE rows downwards ---
    for (let i = 0; i < tableRows.length; i++) {
        const row = tableRows[i];

        // Stop processing when a PAID row is reached
        if (row.status === "PAID") {
            break;
        }

        const billDetails = await parseTaxBillPage(browser, row.taxBillUrl);

        if (billDetails) {
            if (!propertyInfo.propertyAddress && billDetails.propertyAddress) {
                propertyInfo.propertyAddress = billDetails.propertyAddress;
            }
            if (!propertyInfo.assessedValue && billDetails.assessedVal) {
                propertyInfo.assessedValue = `$${billDetails.assessedVal}`;
            }
            if (billDetails.parcelNumber) {
                propertyInfo.parcelNumber = billDetails.parcelNumber;
            }
        }

        const dueAmount = billDetails?.totalDue ? formatCurrency(billDetails.totalDue) : formatCurrency(row.taxesOwed);

        collectedRecords.push({
            year: row.year,
            status: "Due",
            baseAmount: dueAmount,
            amountPaid: "$0.00",
            amountDue: dueAmount,
            dueDate: billDetails ? formatDate(billDetails.dueDate) : "",
            paidDate: "",
        });
    }

    return { records: collectedRecords, propertyInfo };
}

async function populateTheObject(accountNumber, scrapedData) {
    const property = createPropertyObject();
    property.processed_date = new Date().toISOString().split("T")[0];
    property.parcel_number = accountNumber;

    const { records, propertyInfo } = scrapedData;
    if (!records || records.length === 0) {
        property.notes = "No tax records found.";
        return property;
    }

    if (propertyInfo) {
        property.owner_name = propertyInfo.ownerName ? [propertyInfo.ownerName] : ["N/A"];
        property.property_address = propertyInfo.propertyAddress || "N/A";
        property.parcel_number = propertyInfo.parcelNumber || accountNumber;
        property.total_assessed_value = formatCurrency(propertyInfo.assessedValue) || "N/A";
        property.total_taxable_value = formatCurrency(propertyInfo.assessedValue) || "N/A";
    }

    let hasDue = false;

    for (const rec of records) {
        const item = createTaxHistory();
        item.year = rec.year;
        item.status = rec.status;
        item.base_amount = rec.baseAmount || "$0.00";
        item.amount_paid = rec.amountPaid || "$0.00";
        item.amount_due = rec.amountDue || "$0.00";
        item.due_date = rec.dueDate || "";
        item.paid_date = rec.paidDate || "";
        const nextYear = parseInt(item.year) + 1;
        item.delq_date = `01/06/${nextYear}`;

        if (item.status === "Due") {
            const today = new Date();
            const delqDateObj = new Date(item.delq_date);

            if (today <= delqDateObj) {
                item.status = "Due";
            } else {
                item.status = "Delinquent";
            }
            hasDue = true;
        }

        property.tax_history.push(item);
    }

    property.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) { return yearA - yearB; }
        return 0;
    });

    if (property.tax_history.length > 0) {
        const hasDelinquent = property.tax_history.some(t => t.status === "Delinquent");
        property.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

        const latestIndex = property.tax_history.length - 1;
        const latestTax = property.tax_history[latestIndex];

        const hasPriorDelinquent = property.tax_history.some((t, index) => t.status === "Delinquent" && index !== latestIndex);

        const keys = hasPriorDelinquent ? 0 : 1;
        property.notes = generate_notes(latestTax.year, keys, latestTax.status);
    }


    return property;
}


const account_search = async (page, url, accountNumber, browser) => {
    try {
        await page.goto(url, {
            waitUntil: "networkidle2",
            ...timeout_option,
        });

        const scrapedData = await getDetails(page, browser);
        const result = await populateTheObject(accountNumber, scrapedData);
        return result;
    } catch (error) {
        console.log("Error inside account_search:", error);
        throw new Error(error.message);
    }
};


const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    if (account) {
        account = String(account).trim();
    }
    let context;
    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        // by-passing the search by using direct url
        const url = `https://www.ustaxdata.com/nc/rockingham/Rockinghamtaxlist.cfm?accountNum=${account}`;

        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            account_search(page, url, account, browser)
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
            account_search(page, url, account, browser)
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

        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}

export { search };