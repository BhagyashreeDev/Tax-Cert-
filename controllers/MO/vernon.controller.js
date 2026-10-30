// Author:- Bhagyashree Badadal

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import fs from "fs";
import PDFParser from "pdf2json";
import path from "path";
import base64 from 'base64topdf';

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
        taxing_authority: "Vernon County Collector, 100 W Cherry St, Nevada, MO 64772",
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

// For Generating notes
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

// Handle the default page
async function handleDefaultPage(page) {
    const currentUrl = page.url();
    if (currentUrl.includes("Default")) {
        const agreeButtonSelector = "#MainContent_btnBeginSearch";
        try {
            await page.waitForSelector(agreeButtonSelector);
            await page.click(agreeButtonSelector);
            await page.waitForNavigation({ waitUntil: "networkidle2" });
        } catch (e) {
            console.log("Could not pass the DISCLAIMER page:", e);
        }
    }
}

// Search for parcel-ID
async function searchAccountNumber(accountNumber, page) {
    const inputSelector = "#MainContent_ParcelId";
    await page.waitForSelector(inputSelector);
    await page.type(inputSelector, accountNumber);

    const btnSelector = "#MainContent_SearchButton";
    await page.waitForSelector(btnSelector);
    await page.click(btnSelector);

    await page.waitForSelector("#MainContent_gvSearch2", { visible: true, ...timeout_option });
}

// Get ownerName, address and click on last row(as it will be the latest year)
async function parseTable(page) {
    const propertyDetails = await page.evaluate(() => {
        const table = document.querySelector('#MainContent_gvSearch2');
        const rows = table.querySelectorAll('tr');
        const lastRow = rows[rows.length - 1];

        const owner = lastRow.cells[4]?.innerText.trim() || "N/A";
        const address = lastRow.cells[5]?.innerText.trim() || "N/A";
        const linkElement = lastRow.cells[2].querySelector('a');
        const link = linkElement ? linkElement.href : null;

        return { owner, address, link };
    });
    if (propertyDetails.link) {
        await page.goto(propertyDetails.link, { waitUntil: "networkidle2", ...timeout_option });
    }
    return propertyDetails;
}

// Get all required data (pdf + table)
async function parseTheTaxYear(page, accountNumber) {
    await page.waitForSelector('#MainContent_gvTaxes', { visible: true, ...timeout_option });

    const rowsData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#MainContent_gvTaxes tbody tr'));
        return rows.map((row) => ({
            taxYear: row.querySelector('[id*="_lblTaxYear_"]')?.innerText.trim() || null,
            taxAmountDue: row.querySelector('[id*="_lblTax_"]')?.innerText.trim() || null,
            penaltiesInterest: row.querySelector('[id*="_lblPenaltiesInterest_"]')?.innerText.trim() || null,
            feesDue: row.querySelector('[id*="_lblFeesDue_"]')?.innerText.trim() || null,
            totalAmountDue: row.querySelector('[id*="_lblAmountDue_"]')?.innerText.trim() || null,
            datePaid: row.querySelector('[id*="_lblPayLine_"]')?.innerText.trim() || null,
        }));
    });

    if (!rowsData.length || !rowsData[0].taxYear) {
        console.log("No tax details found to parse.");
        return [];
    }

    const results = [];
    let isFirstRow = true;

    for (const row of rowsData) {
        const dueNum = parseFloat((row.totalAmountDue || "0").replace(/[^\d.-]/g, '')) || 0;
        const isPaid = dueNum === 0;

        // If the row is Paid...
        if (isPaid) {
            // Parse that row iff that row is the first row(as it will be the recent year)
            if (isFirstRow) {
                const pdfData = await downloadAndParseStatement(page, accountNumber, row.taxYear, isPaid);
                results.push({ ...row, isPaid: true, ...pdfData });
            }
            isFirstRow = false;
            break;
        }
        else {  // If the row is Unpaid...
            // Parse the pdf iff the row is first row(to get latest year assessed value)
            if (isFirstRow) {
                const pdfData = await downloadAndParseStatement(page, accountNumber, row.taxYear, isPaid);
                results.push({ ...row, valuation: pdfData || null, isPaid: false });
                isFirstRow = false;
                continue;
            }
            // if the row is not first-row than no need to parse pdf
            results.push({ ...row, valuation: null, isPaid: false });
            isFirstRow = false;
        }
    }
    return results;
}

// From this url download the pdf
async function downloadAndParseStatement(page, accountNumber, year, isPaid) {
    const statementUrl = `https://mo1458.cichosting.com/MTASWebportal/Statements/${year}-${accountNumber}.pdf?_nocacheId=89c7b401-6fcc-4e7e-a5f6-48707b154cac`;
    let downloadedFilePath;

    try {
        // Download the pdf in ./pdf folder
        downloadedFilePath = await downloadStatementPdf(page, statementUrl, accountNumber, year);
    } catch (err) {
        console.log("Failed to capture PDF:", err.message);
        return null;
    }

    try {
        // Extract the data from pdf
        const pdfData = await extractDataFromPdf(downloadedFilePath, accountNumber, isPaid);
        return pdfData;
    } catch (err) {
        console.log("Failed to parse PDF:", err.message);
        return null;
    } finally {
        if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
            fs.unlink(downloadedFilePath, (err) => {
                if (err) console.log(`Error deleting PDF: ${err.message}`);
            });
        }
    }
}

// Core logic to extract the data lies here...
function extractDataFromPdf(filePath, accountNumber, isPaid) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        pdfParser.on("pdfParser_dataError", (e) => reject(e.parserError));

        pdfParser.on("pdfParser_dataReady", (pdfData) => {
            try {
                let data = [];
                pdfData['Pages'].forEach((p) => {
                    p['Texts'].forEach((t) => {
                        let text = t["R"][0]["T"];
                        text = decodeURIComponent(text).trim();
                        if (text != null && text !== "") {
                            data.push(text);
                        }
                    });
                });

                let result = null;
                let extracted = { valuation: null, baseTax: null, amountPaid: null };

                for (let i = 0; i < data.length; i++) {
                    let d = data[i];

                    // If it is paid then only we need these values
                    if (isPaid) {
                        if (d === "TOTAL VALUATION") {

                            // FIXED IN TESTING
                            if (data[0].includes("Personal Property")) {
                                let val = data[i + 12];

                                // if that i+12 is not a number then search for i+10
                                if (!val || !/^\d/.test(String(val).trim())) {
                                    val = data[i + 10];
                                }
                                // Ensure final value starts with a number, otherwise default to null
                                extracted.valuation = (val && /^\d/.test(String(val).trim())) ? val : null;
                            }

                            if (data[0].includes("Real Estate")) {
                                extracted.valuation = data[i + 11] || null;
                            }
                        }
                        if (d === "Base" && data[i + 1] === "Tax") {
                            extracted.baseTax = data[i - 1] || null;
                        }
                        if (d === "Amount Paid:") {
                            for (let j = 1; j <= 10; j++) {
                                if (data[i + j] && /^[0-9]{1,3}(,[0-9]{3})*\.[0-9]{2}$/.test(data[i + j])) {
                                    extracted.amountPaid = data[i + j];
                                    break;
                                }
                            }
                        }
                        result = extracted;
                    } else { // If it is Unpaid, we need only assessed value
                        if (d === "TOTAL VALUATION") {
                            result = data[i + 23] || null;
                        }
                    }
                }

                resolve(result);
            } catch (error) {
                console.log("Error extracting text data:", error);
                reject(error);
            }
        });
        pdfParser.loadPDF(filePath);
    });
}

// For downloading the pdf 
async function downloadStatementPdf(page, statementUrl, accountNumber, year) {
    const downloadPath = path.resolve('./pdfs');
    if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });
    const filePath = path.join(downloadPath, `statement_${accountNumber}_${year}.pdf`);
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

// For filling the format with parsed data
function buildSchema(propertyDetails, records, accountNumber) {
    if (!propertyDetails || !records || records.length === 0) return null;

    const result = createPropertyObject();
    result.owner_name = [propertyDetails.owner];
    result.parcel_number = accountNumber;
    result.property_address = propertyDetails.address;

    const firstValuation = records.find(r => r.valuation)?.valuation || null;
    result.total_assessed_value = formatCurrency(firstValuation) !== "$0.00" ? formatCurrency(firstValuation) : "N/A";
    result.total_taxable_value = result.total_assessed_value;

    records.forEach((row) => {
        const record = createTaxHistory();
        record.year = row.taxYear || "N/A";
        if (record.year !== "N/A") {
            const nextYear = parseInt(record.year, 10) + 1;
            record.due_date = `12/31/${record.year}`;
            record.delq_date = `01/01/${nextYear}`;
        }

        if (row.isPaid) {
            record.base_amount = formatCurrency(row.baseTax);
            record.amount_paid = formatCurrency(row.amountPaid);
            record.amount_due = formatCurrency(row.totalAmountDue);
            record.paid_date = row.datePaid;
        } else {
            record.base_amount = formatCurrency(row.taxAmountDue);
            record.amount_due = formatCurrency(row.totalAmountDue);
            record.amount_paid = "$0.00";
            if (row.datePaid !== null) {
                record.paid_date = row.datePaid;
            }
        }

        // Status
        if (record.amount_due === "$0.00") {
            record.status = "Paid";
        } else {
            const today = new Date();
            const dueDateObj = new Date(record.due_date);
            record.status = today <= dueDateObj ? "Due" : "Delinquent";
        }
        result.tax_history.push(record);
    });

    // Sort the records
    result.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) return yearA - yearB;
        if (a.status === "Paid" && b.status !== "Paid") return -1;
        if (a.status !== "Paid" && b.status === "Paid") return 1;
        return 0;
    });

    // For deciding delinquency and notes
    if (result.tax_history.length > 0) {
        const hasDelinquent = result.tax_history.some((t) => t.status === "Delinquent");
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


const account_search = async (page, url, accountNumber) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // 1. Handle the Default Page
        await handleDefaultPage(page);

        // 2. Search Account Number
        await searchAccountNumber(accountNumber, page);

        // 3. Get (ownerName, address)
        const propertyDetails = await parseTable(page);

        // 4. Get full records details
        const records = await parseTheTaxYear(page, accountNumber);

        // 5. Populate the format with actual data
        const result = buildSchema(propertyDetails, records, accountNumber);

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
    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://mo1458.cichosting.com/MTASWebportal/Search";

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
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