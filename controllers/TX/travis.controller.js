// Author:- Bhagyashree Badadal

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import fs from "fs";
import path from "path";
import PDFParser from "pdf2json";

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
        taxing_authority: "Travis County Tax Assessor-Collector, 2433 Ridgepoint Dr, Austin, TX 78754",
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

// Notes For Annual
const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID, ${year} `
                : `PRIORS ARE DELINQUENT, ${year} `;
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        notes += ` NORMAL DUE DATE IS 01/31`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// For formatting the values correctly
const usCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// Helper function to strip non-numeric characters (like $ and ,) before parsing
const parseCurrency = (val) => {
    if (!val) return 0;
    const cleanVal = String(val).replace(/[^0-9.-]+/g, "");
    const parsed = parseFloat(cleanVal);
    return isNaN(parsed) ? 0 : parsed;
};

// Getting ownerName and fallback links(receipt, property)
async function getOwnerNameAndLinks(page) {
    await page.waitForSelector("#app-content", { visible: true });

    return await page.evaluate(() => {
        let ownerName = "";
        const labels = Array.from(document.querySelectorAll("label"));
        for (let label of labels) {
            if (label.innerText.includes("Owner Name")) {
                ownerName = label.parentElement.innerText.replace("Owner Name", "").trim();
            }
        }
        const receiptsLink = document.querySelector('a[href^="showPaymentReceipts.do"]')?.href;
        const propertyLink = document.querySelector('a[href^="showPropertyInfo.do"]')?.href;

        return { ownerName, receiptsLink, propertyLink };
    });
}

// Processing recent(2025) year tax
async function processRecentYearTax(page, receiptsLink, accountNumber) {
    await page.waitForSelector("table.u-full-width tbody tr", { visible: true });

    // Get the current year tax details
    const taxDetails = await page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll("h4"));
        const targetH4 = headers.find(h => h.innerText.includes("2025 Tax Year Taxes Due"));
        if (!targetH4) return null;

        let sibling = targetH4.nextElementSibling;
        let table = null;
        while (sibling) {
            table = sibling.tagName === 'TABLE' ? sibling : sibling.querySelector("table.u-full-width");
            if (table) break;
            sibling = sibling.nextElementSibling;
        }

        if (!table) return null;
        const row = table.querySelector("tbody tr");
        if (!row) return null;

        const cells = row.querySelectorAll("td");
        const yearEle = cells[0].querySelector("a");
        return {
            taxYear: cells[0].innerText.trim(),
            yearLink: yearEle ? yearEle.href : "",
            baseDue: cells[1].innerText.trim(),
            totalDue: cells[4].innerText.trim()
        };
    });

    let assessedAndTaxableValue = { assessedValue: "", taxableValue: "" };
    const record = createTaxHistory();

    if (taxDetails) {

        // 1. Get the Assessed Value first
        if (taxDetails.yearLink) {
            await page.goto(taxDetails.yearLink, { waitUntil: "networkidle2", ...timeout_option });
            assessedAndTaxableValue = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll("table.u-full-width tbody tr"));
                if (rows.length > 0) {
                    const cells = rows[0].querySelectorAll("td");
                    return {
                        assessedValue: cells[1]?.innerText.trim() || "",
                        taxableValue: cells[2]?.innerText.trim() || ""
                    };
                }
                return { assessedValue: "", taxableValue: "" };
            });
        }

        record.year = taxDetails.taxYear;
        record.due_date = `01/31/${parseInt(record.year) + 1}`;
        record.delq_date = `02/01/${parseInt(record.year) + 1}`;

        // 2. Checking whether current year tax is paid or unpaid
        const isZero = (val) => !val || parseFloat(val.replace(/[^0-9.]/g, '')) === 0;
        
        if (isZero(taxDetails.baseDue) && isZero(taxDetails.totalDue)) {
            // Paid -> Download Receipt
            record.status = "Paid";
            record.amount_due = "$0.00";

            if (receiptsLink) {
                await page.goto(receiptsLink, { waitUntil: "networkidle2", ...timeout_option });
                await page.waitForSelector("table.u-full-width tbody tr", { visible: true });

                const receiptNumber = await page.evaluate((targetYear) => {
                    const rows = Array.from(document.querySelectorAll("table.u-full-width tbody tr"));
                    for (let row of rows) {
                        const cells = row.querySelectorAll("td");
                        if (cells.length >= 2 && cells[1].innerText.trim() === targetYear) {
                            const link = cells[0].querySelector("a");
                            const paidDate = cells[2].innerText.trim();
                            const paidAmount = cells[3].innerText.trim();
                            return { paidDate, paidAmount, receiptNumber: link ? link.innerText.trim() : cells[0].innerText.trim() };
                        }
                    }
                    return null;
                }, record.year);

                // pdf preview 
                const statementUrl = `https://travis.go2gov.net/exportReceipt?receipt=${receiptNumber.receiptNumber}&account=${accountNumber}`;

                let downloadedFilePath;
                try {
                    downloadedFilePath = await downloadStatementPdf(page, statementUrl, `${accountNumber}_${record.year}.pdf`);
                    const baseTax = await extractDataFromPdf(downloadedFilePath);
                   
                    record.base_amount = usCurrencyFormatter.format(parseCurrency(baseTax));
                    record.amount_paid = usCurrencyFormatter.format(parseCurrency(receiptNumber.paidAmount));
                    record.paid_date = receiptNumber.paidDate;
                } catch (err) {
                    console.error(`Failed to download/parse the pdf`);
                }
                finally {
                    if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                        fs.unlink(downloadedFilePath, (err) => {
                            if (err) console.log(`Error deleting PDF: ${err.message}`);
                        });
                    }
                }
            }
        } else {
            // If current year is unpaid 
            record.base_amount = usCurrencyFormatter.format(parseCurrency(taxDetails.baseDue));
            record.amount_due = usCurrencyFormatter.format(parseCurrency(taxDetails.totalDue));
            record.amount_paid = "$0.00";

            const today = new Date();
            const dueDateObj = new Date(record.due_date);
            record.status = (today <= dueDateObj) ? "Due" : "Delinquent";
        }
    }

    return { record, assessedAndTaxableValue };
}

// Processing previous year due records
async function processPreviousDueYears(page, propertyUrl) {
    await page.goto(propertyUrl, { waitUntil: "networkidle2", ...timeout_option });
    await page.waitForSelector("table.u-full-width tbody tr", { visible: true });

    const yearsUrl = await page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll("h4"));
        const targetH4 = headers.find(h => h.innerText.includes("Previous Tax Year Taxes Due"));
        if (!targetH4) return null;

        let sibling = targetH4.nextElementSibling;
        let table = null;
        while (sibling) {
            table = sibling.tagName === 'TABLE' ? sibling : sibling.querySelector("table.u-full-width");
            if (table) break;
            sibling = sibling.nextElementSibling;
        }

        if (!table) return null;
        const row = table.querySelector("tbody tr");
        return row ? row.querySelector("td a")?.href : null;
    });

    let records = [];
    if (yearsUrl) {
        await page.goto(yearsUrl, { waitUntil: "networkidle2", ...timeout_option });
        await page.waitForSelector("table.u-full-width", { visible: true });

        const allTaxRecords = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll("table.u-full-width tbody tr"));
            return rows.map(row => {
                const cells = row.querySelectorAll("td");
                if (cells.length < 5) return null;
                return {
                    taxYear: cells[0].innerText.trim(),
                    baseDue: cells[1].innerText.trim(),
                    totalDue: cells[4].innerText.trim()
                };
            }).filter(Boolean);
        });

        // Populating all due records in "records[]"
        for (const item of allTaxRecords) {
            const record = createTaxHistory();
            record.year = item.taxYear;
            record.base_amount = usCurrencyFormatter.format(parseCurrency(item.baseDue));
            record.amount_due = usCurrencyFormatter.format(parseCurrency(item.totalDue));
            record.amount_paid = "$0.00";
            record.due_date = `01/31/${parseInt(record.year) + 1}`;
            record.delq_date = `02/01/${parseInt(record.year) + 1}`;

            const today = new Date();
            const dueDateObj = new Date(record.due_date);
            record.status = (today <= dueDateObj) ? "Due" : "Delinquent";

            records.push(record);
        }
    }
    return records;
}

// Getting the property address by adding the property into the cart
async function getThePropertyAddress(page, url, cartLink) {
    await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

    // Add to cart
    await page.waitForSelector("#addToCartButton1", { visible: true });
    await page.click("#addToCartButton1");

    await page.waitForFunction(() => {
        return document.querySelector("#cartResults .ajax ul li a") !== null;
    }, { timeout: 15000 }).catch(() => console.log("Proceeding to cart anyway."));

    // Navigate to cart
    await page.goto(cartLink, { waitUntil: "networkidle2", ...timeout_option });
    await page.waitForSelector("#cartResultsTable", { visible: true });

    return await page.evaluate(() => {
        const addressEle = document.querySelector('td[headers="locationAddressHeader"] div');
        return addressEle ? addressEle.innerText.trim() : "";
    });
}

// For downloading the pdf 
async function downloadStatementPdf(page, statementUrl, filename = 'receipt.pdf') {
    const downloadPath = path.resolve('./pdfs');
    if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });
    const filePath = path.join(downloadPath, filename);
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

// Core logic to extract the data lies here...
function extractDataFromPdf(filePath) {
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
                            data.push(text); // This builds the array of elements
                        }
                    });
                });

                // We are getting only base tax from the pdf
                const baseTax = data[78];
                resolve(baseTax);
            } catch (error) {
                console.log("Error extracting text data:", error);
                reject(error);
            }
        });
        pdfParser.loadPDF(filePath);
    });
}

const account_search = async (page, url, accountNumber) => {
    try {
        const result = createPropertyObject();
        result.parcel_number = accountNumber;

        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // 1. Basic Info
        const { ownerName, receiptsLink, propertyLink } = await getOwnerNameAndLinks(page);
        if (ownerName) {
            result.owner_name.push(ownerName);
        } else result.owner_name = ["N/A"];

        // 2. Checking for 2 tables existence
        const taxYearStatus = await page.evaluate(() => {
            const h4Elements = Array.from(document.querySelectorAll("h4"));
            return {
                has2025Tax: h4Elements.some(h4 => h4.innerHTML.includes("2025 Tax Year Taxes Due")),
                hasPreviousTax: h4Elements.some(h4 => h4.innerText.includes("Previous Tax Year Taxes Due")),
            };
        });

        // 3. If 2025 tax table exists...
        if (taxYearStatus.has2025Tax) {
            const { record, assessedAndTaxableValue } = await processRecentYearTax(page, receiptsLink, accountNumber);
            if (record && record.year) result.tax_history.push(record);

            if (assessedAndTaxableValue) {
                result.total_assessed_value = assessedAndTaxableValue.assessedValue;
                result.total_taxable_value = assessedAndTaxableValue.taxableValue;
            }
        }

        // 4. If we have previous year dues...
        if (taxYearStatus.hasPreviousTax) {
            const previousRecords = await processPreviousDueYears(page, propertyLink || url);
            result.tax_history.push(...previousRecords);
        }

        // 5. Get Address
        const cartLink = "https://travis.go2gov.net/cart/responsive/cart/display.do?cartId=null&referenceId=null";
        result.property_address = await getThePropertyAddress(page, url, cartLink);

        // 6. Sorting the records
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

        // 7. Deciding delinquency and notes
        if (result.tax_history.length > 0) {
            // Check if ANY tax is delinquent for the main delinquency flag
            const hasDelinquent = result.tax_history.some(
                (t) => t.status === "Delinquent",
            );
            result.delinquent = hasDelinquent
                ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                : "NONE";

            // Get the latest tax record (the array is sorted ascending by year)
            const latestTax = result.tax_history[result.tax_history.length - 1];

            // Check if any PRIOR year is delinquent (exclude the latest year)
            const hasPriorDelinquent = result.tax_history.some(
                (t) => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
            );

            // If priors are delinquent, keys = 0. If priors are paid, keys = 1.
            const keys = hasPriorDelinquent ? 0 : 1;
            result.notes = generate_notes(latestTax.year, keys, latestTax.status);
        }
        return result; 

    } catch (error) {
        console.error("Error inside account_search:", error);
        throw error;
    }
}

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

        // by-passing the search, directly using the url
        const url = `https://travis.go2gov.net/showPropertyInfo.do?account=${account}`;

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