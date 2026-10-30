// Author:- Bhagyashree Badadal

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import fs from "fs";
import PDFParser from "pdf2json";
import path from "path";

const county_data = {
    "caldwell": {
        url: "https://caldwellcountymo.municipalonlinepayments.com/caldwellcountymo/tax/search",
        auth: "Caldwell County Collector of Revenue, Kingston, MO 64650"
    },
    "texas": {
        url: "https://texascountymo.municipalonlinepayments.com/texascountymo/tax/search",
        auth: "Texas County Collector/Treasurer, 210 N Grand Ave, Suite 101, Houston, MO 65483"
    },
};

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
        delinquent: "NONE",
        taxing_authority: "",
        notes: "",
        tax_history: []
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

const formatCurrency = (value) => {
    if (!value) return "$0.00";
    const num = parseFloat(value.toString().replace(/[^\d.-]/g, ''));
    if (isNaN(num)) return "$0.00";
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
};

// Generating notes
const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes = keys === 1
            ? `ALL PRIORS ARE PAID, ${year} `
            : `PRIORS ARE DELINQUENT, ${year} `;
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        notes += ` NORMAL DUE DATE IS 12/31`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// Searching account number
async function searchAccountNumber(accountNumber, page) {
    const parcelToggleSelector = 'forge-button-toggle[value="Parcels"]';
    await page.waitForSelector(parcelToggleSelector, { visible: true });
    await page.click(parcelToggleSelector);

    const inputSelector = 'input#ParcelNumber';
    await page.waitForSelector(inputSelector, { visible: true });

    await page.evaluate((sel) => {
        const input = document.querySelector(sel);
        if (input) input.value = '';
    }, inputSelector);

    await page.type(inputSelector, accountNumber, { delay: 50 });

    const searchBtnSelector = '#Parcel forge-button[type="submit"]';
    await page.waitForSelector(searchBtnSelector, { visible: true });

    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", ...timeout_option }),
        page.click(searchBtnSelector)
    ]);
}

// PDF download 
//Ex: https://texascountymo.municipalonlinepayments.com/texascountymo/tax/search/statement?receiptNumber=...&year=...)
async function downloadStatementPdf(page, receiptNumber, year, countyBaseUrl) {
    const statementUrl = `${countyBaseUrl}/statement?receiptNumber=${receiptNumber}&year=${year}`;

    const downloadPath = path.resolve('./pdfs');
    if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });
    const filePath = path.join(downloadPath, `statement_${receiptNumber}_${year}.pdf`);

    const base64 = await page.evaluate(async (url) => {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }, statementUrl);

    const buffer = Buffer.from(base64, 'base64');

    if (buffer.slice(0, 5).toString('latin1') !== '%PDF-') {
        throw new Error('Downloaded content is not a valid PDF (missing %PDF- header)');
    }

    fs.writeFileSync(filePath, buffer);
    return filePath;
}

// PDF parsing
function reconstructLines(pdfData) {
    let allLines = [];

    // Loop through all pages in the PDF
    pdfData.Pages.forEach(page => {
        let rows = {}; // Object to hold text grouped by Y-coordinate

        page.Texts.forEach(t => {
            let text = decodeURIComponent(t.R[0].T).trim();
            if (!text) return; // Skip empty strings

            let y = t.y; // Vertical position
            let x = t.x; // Horizontal position

            // Allow a tiny tolerance (0.5) because some characters on the same line
            // might be offset by a fraction of a pixel
            let foundY = Object.keys(rows).find(existingY => Math.abs(parseFloat(existingY) - y) < 0.5);
            let keyY = foundY ? foundY : y;

            if (!rows[keyY]) {
                rows[keyY] = [];
            }

            // Push the text chunk and its X coordinate
            rows[keyY].push({ text: text, x: x });
        });

        // Sort the rows from top to bottom (Y ascending)
        let sortedY = Object.keys(rows).sort((a, b) => parseFloat(a) - parseFloat(b));

        // For each row, sort elements left-to-right (X ascending) and join them
        sortedY.forEach(y => {
            let rowItems = rows[y];
            rowItems.sort((a, b) => a.x - b.x);

            // Join the pieces together tightly to fix the fragmented letters
            let lineStr = rowItems.map(item => item.text).join("");

            // Clean up multiple spaces if any were formed
            lineStr = lineStr.replace(/\s+/g, " ").trim();

            if (lineStr) {
                allLines.push(lineStr);
            }
        });
    });

    return allLines;
}


function findAfterLabel(lines, label, moneyOnly = false) {
    // moneyOnly requires a decimal amount like 123.45 (avoids grabbing bare
    // integers from an unrelated column that happens to follow the label)
    const numPattern = moneyOnly ? '([\\d,]+\\.\\d{2})' : '([\\d,]+(?:\\.\\d+)?)';
    const re = new RegExp(label.replace(/\s+/g, '') + '\\s*' + numPattern, 'i');
    for (const line of lines) {
        const m = line.match(re);
        if (m) return m[1];
    }
    return null;
}

// Pull every "TOTAL PAID <tax> <fees> <total>" style line and return the
// first dollar figure on it (the tax-paid amount), regardless of how many
// figures are fused onto that line.
function firstAmountOnLabeledLine(lines, label) {
    const startRe = new RegExp('^' + label.replace(/\s+/g, ''), 'i');
    const line = lines.find(l => startRe.test(l));
    if (!line) return null;
    const nums = line.match(/[\d,]+\.\d{2}/g);
    return nums && nums.length ? nums[0] : null;
}

// core logic to extract the data from pdf
function extractDataFromPdf(filePath, isPaid) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();

        pdfParser.on("pdfParser_dataError", (errData) => {
            console.error(errData.parserError);
            reject(errData.parserError);
        });

        pdfParser.on("pdfParser_dataReady", (pdfData) => {
            try {
                const lines = reconstructLines(pdfData);
                let extracted = { valuation: null, baseTax: null, amountPaid: null, amountDue: null };
                // Works for both counties: "Total Assessed Value" always
                // precedes the assessed value figure, whatever else is
                // fused onto the same line.
                extracted.valuation = findAfterLabel(lines, "TotalAssessedValue");
                if (isPaid) {
                    // Texas paid receipts itemize "TOTAL TAX"; Caldwell paid
                    // receipts only itemize "TAX DUE" - try both.
                    extracted.baseTax =
                        findAfterLabel(lines, "TOTALTAX", true) ||
                        findAfterLabel(lines, "TAXDUE", true);
                        console.log(extracted.baseTax);
                    extracted.amountPaid = firstAmountOnLabeledLine(lines, "TOTALPAID");
                } else {
                    extracted.baseTax = findAfterLabel(lines, "BASETAX", true);
                    extracted.amountDue =
                        findAfterLabel(lines, "TOTALTAX", true) ||
                        findAfterLabel(lines, "TAXDUE", true);
                }
                resolve(extracted);
            } catch (error) {
                console.log(error);
                resolve(null);
            }
        });
        pdfParser.loadPDF(filePath);
    });
}

async function downloadAndParseStatement(page, receiptNumber, year, countyBaseUrl, isPaid) {
    let downloadedFilePath;
    try {
        // for downloading the pdf
        downloadedFilePath = await downloadStatementPdf(page, receiptNumber, year, countyBaseUrl);
    } catch (err) {
        console.log("Failed to capture PDF:", err.message);
        return null;
    }
    try {
        // for extracting the data from pdf
        const pdfData = await extractDataFromPdf(downloadedFilePath, isPaid);
        return pdfData;
    } catch (err) {
        console.log("Failed to parse PDF:", err.message);
        return null;
    } finally {
        fs.unlink(downloadedFilePath, (err) => {
            if (err) console.log(`Error deleting PDF: ${err.message}`);
        });
    }
}


// blocks for Address/Type/Receipt/Year/Taxable value/Due/Paid
async function parseResultsTable(page, countyBaseUrl) {
    try {
        await page.waitForSelector('.search_results .card-list', { timeout: 15000 });
    } catch (e) {
        console.log("No parcel rows found.");
        return [];
    }

    const rows = await page.$$('.search_results .card-list');
    const results = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowData = await row.evaluate((el) => {
            const owner = el.querySelector('.forge-typography--heading2')?.textContent.trim() || null;
            const parcelNo = el.querySelector('.forge-typography--subheading1')?.textContent.trim() || null;
            const labelValues = {};
            el.querySelectorAll('forge-label-value').forEach((lv) => {
                const label = lv.querySelector('[slot="label"]')?.textContent.trim();
                const valueEl = lv.querySelector('[slot="value"]');
                let value = null;
                let extra = null;
                if (valueEl) {
                    const small = valueEl.querySelector('small');
                    if (small) {
                        extra = small.textContent.trim();
                        const clone = valueEl.cloneNode(true);
                        clone.querySelector('small')?.remove();
                        value = clone.textContent.trim();
                    } else {
                        value = valueEl.textContent.trim();
                    }
                }
                if (label) labelValues[label] = { value, extra };
            });
            const btn = el.querySelector('forge-icon-button');
            const onclick = btn ? btn.getAttribute('onclick') : null;
            return { owner, parcelNo, labelValues, onclick };
        });

        const isPaid = !!rowData.labelValues['Paid'];
        const address = rowData.labelValues['Address']?.value || "N/A";
        const taxYear = rowData.labelValues['Year']?.value || null;
        const taxableValue = rowData.labelValues['Taxable value']?.value || "N/A";
        let receiptNumber = null, urlYear = null;
        if (rowData.onclick) {
            const match = rowData.onclick.match(/receiptNumber=([^&']+)&(?:amp;)?year=([^&']+)/);
            if (match) {
                receiptNumber = match[1];
                urlYear = match[2];
            }
        }

        if (isPaid) {
            // Only recent year paid record we need
            if (i === 0) {
                // If the TaxYear is Paid
                const paidAmount = rowData.labelValues['Paid'].value;
                const paidDate = rowData.labelValues['Paid'].extra
                    ? rowData.labelValues['Paid'].extra.replace(/^on\s*/i, '')
                    : null;

                // PDF parsing starts from here...
                const pdfData = await downloadAndParseStatement(page, receiptNumber, urlYear, countyBaseUrl, isPaid);

                results.push({
                    owner: rowData.owner,
                    parcelNo: rowData.parcelNo,
                    taxYear,
                    address,
                    taxableValue,
                    assessedValue: pdfData?.valuation || "N/A",
                    baseTax: pdfData?.baseTax || null,
                    totalDue: pdfData?.amountDue || null,
                    paidAmount,
                    paidDate,
                    status: "Paid",
                });
            }
            break; // current year is paid -- no need to look at prior years at all
        } else {

            // If the TaxYear is Unpaid
            const dueAmount = rowData.labelValues['Due']?.value || null;
            const pdfData = await downloadAndParseStatement(page, receiptNumber, urlYear, countyBaseUrl, isPaid);

            results.push({
                owner: rowData.owner,
                parcelNo: rowData.parcelNo,
                taxYear,
                address,
                taxableValue,
                assessedValue: pdfData?.valuation || "N/A",
                totalDue: dueAmount || pdfData?.amountDue,
                baseTax: pdfData?.baseTax || "$0.00",
                paidAmount: "",
                paidDate: "",
                status: "Unpaid",
            });
        }
    }

    return results;
}

// Populate the format-objects with fetched data from pdf
function buildSchema(scrapedData, searchAccount, tax_auth) {
    if (!scrapedData || scrapedData.length === 0) return null;

    const result = createPropertyObject();
    const primaryRecord = scrapedData[0];

    result.owner_name = [primaryRecord.owner];
    result.property_address = primaryRecord.address;
    result.parcel_number = searchAccount || primaryRecord.parcelNo;

    if (primaryRecord.assessedValue && primaryRecord.assessedValue !== "N/A") {
        result.total_assessed_value = formatCurrency(primaryRecord.assessedValue);
        result.total_taxable_value = formatCurrency(primaryRecord.taxableValue || primaryRecord.assessedValue);
    } else {
        result.total_assessed_value = "N/A";
        result.total_taxable_value = primaryRecord.taxableValue
            ? formatCurrency(primaryRecord.taxableValue)
            : "N/A";
    }

    const history = [];
    for (let i = 0; i < scrapedData.length; i++) {
        const item = scrapedData[i];
        const record = createTaxHistory();

        record.year = item.taxYear;
        const nextYear = parseInt(item.taxYear) + 1;
        record.due_date = `12/31/${item.taxYear}`;
        record.delq_date = `01/01/${nextYear}`;

        if (item.status === "Paid") {
            record.status = "Paid";
            record.base_amount = formatCurrency(item.baseTax || item.paidAmount);
            record.amount_paid = formatCurrency(item.paidAmount);
            record.amount_due = "$0.00";
            record.paid_date = item.paidDate || "";
        } else {
            record.base_amount = formatCurrency(item.baseTax || item.totalDue);
            record.amount_paid = "$0.00";
            record.amount_due = formatCurrency(item.totalDue);

            const today = new Date();
            const delqDateObj = new Date(record.delq_date);
            record.status = today >= delqDateObj ? "Delinquent" : "Due";
        }
        history.push(record);
    }
    result.taxing_authority = tax_auth;
    result.tax_history = history;

    // Sort the records
    result.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) return yearA - yearB;
        if (a.status === "Paid" && b.status !== "Paid") return -1;
        if (a.status !== "Paid" && b.status === "Paid") return 1;
        return 0;
    });

    // Decide the delinquency and notes
    if (result.tax_history.length > 0) {
        const hasDelinquent = result.tax_history.some(t => t.status === "Delinquent");
        result.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        const latestTax = result.tax_history[result.tax_history.length - 1];
        const hasPriorDelinquent = result.tax_history.some(
            (t) => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
        );

        const keys = hasPriorDelinquent ? 0 : 1;
        result.notes = generate_notes(latestTax.year, keys, latestTax.status);
    }
    return result;
}

const account_search = async (page, url, account, tax_auth) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // 1. search the parcel - ID
        await searchAccountNumber(account, page);
        // `url` (countyInfo.url) is passed through as the statement PDF base URL
        // 2. Parse the result table
        const rawScrapedData = await parseResultsTable(page, url);
        const result = buildSchema(rawScrapedData, account, tax_auth);

        return result;
    } catch (error) {
        console.log("Error inside account_search:", error);
        throw new Error(error.message);
    }
};

const search = async (req, res) => {
    const requestedCountyKey = req.path.replace('/', '').toLowerCase();
    const countyInfo = county_data[requestedCountyKey];
    const { fetch_type, account } = req.body;

    try {
        if (!countyInfo) {
            return res.status(404).json({ error: true, message: "County configuration context lost." });
        }

        if (fetch_type !== "html" && fetch_type !== "api") {
            return res.status(200).render('error_data', { error: true, message: "Invalid Access" });
        }

        const baseUrl = countyInfo.url;
        const tax_auth = countyInfo.auth;

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(timeout_option.timeout);

        if (fetch_type == "html") {
            account_search(page, baseUrl, account, tax_auth)
                .then((data) => { res.status(200).render("parcel_data_official", data); })
                .catch((error) => {
                    console.log(error);
                    res.status(200).render('error_data', { error: true, message: error.message });
                })
                .finally(async () => { await context.close(); });
        } else if (fetch_type == "api") {
            account_search(page, baseUrl, account, tax_auth)
                .then((data) => { res.status(200).json({ result: data }); })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({ error: true, message: error.message });
                })
                .finally(async () => { await context.close(); });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

export { search };