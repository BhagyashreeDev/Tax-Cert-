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
        taxing_authority: "Polk County Collector, 102 E Broadway #6, Bolivar, MO 65613",
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

// for notes generation
const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes =
            keys === 1
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

// do initial navigations
async function doInitialNavigations(page) {
    const targetHref = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const realStatusLink = links.find(a => a.innerText.trim() === 'Paid Status - Real');
        return realStatusLink ? realStatusLink.getAttribute('href') : null;
    });

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.click(`a[href="${targetHref}"]`)
    ]);

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.click("input[value='Continue']")
    ]);
}

// search for the parcel number
async function searchAccountNumber(accountNumber, page) {
    const [bookNo, idNo, splitNo] = accountNumber.split("-");
    await page.waitForSelector('input[name="book_no[]"]');

    await page.evaluate((b, i, s) => {
        document.querySelector('input[name="book_no[]"]').value = b;
        document.querySelector('input[name="id_no[]"]').value = i;
        document.querySelector('input[name="split_no[]"]').value = s;
    }, bookNo, idNo, splitNo);

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.click('input[value="Search Record(s)"]')
    ]);
}

// get the property details
async function getPropertyDetails(page, browser) {

    // listen to the new tab where our pdf is going to open
    const newPagePromise = new Promise(resolve => browser.once('targetcreated', async target => {
        const newPage = await target.page();
        resolve(newPage);
    }));

    // get ownerName, address, base tax from the table
    const recordData = await page.evaluate(() => {
        const dataTables = Array.from(document.querySelectorAll('table')).filter(table => {
            return table.querySelector('td.row1, td.row2');
        });

        if (dataTables.length === 0) return null;

        // Get the last data table (latest year)
        const lastTable = dataTables[dataTables.length - 1];
        const cells = lastTable.querySelectorAll('td');

        return {
            ownerName: cells[2] ? cells[2].innerText.trim() : '',
            address: cells[3] ? cells[3].innerText.trim() : '',
            baseTax: cells[5] ? cells[5].innerText.trim() : ''
        };
    });



    // Click the print button (which opens the new tab)
    await page.evaluate(() => {
        // Find all print buttons and click the last one
        const buttons = document.querySelectorAll('input[name="p2"][value="Print"]');
        if (buttons.length > 0) {
            buttons[buttons.length - 1].click();
        }
    });

    const pdfPage = await newPagePromise;
    await pdfPage.waitForNetworkIdle();

    // now its time for pdf parsing
    const pdfData = await doPDFParsing(pdfPage);

    return {
        ownerName: recordData.ownerName,
        address: recordData.address,
        baseTax: recordData.baseTax,
        ...pdfData
    };
}

async function doPDFParsing(targetPage) {
    const pdfUrl = targetPage.url();

    // download the pdf
    const downloadedFilePath = await downloadStatementPdf(targetPage, pdfUrl, "print.pdf");

    // extract the data from the pdf
    const data = await extractDataFromPdf(downloadedFilePath);

    // delete the downloaded file
    if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
        try {
            fs.unlinkSync(downloadedFilePath);
        } catch (err) {
            console.log(`Error deleting PDF: ${err.message}`);
        }
    }
    return data;
}

// download the file
async function downloadStatementPdf(page, statementUrl, fileName) {
    const downloadPath = path.resolve('./pdfs');
    if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });
    const filePath = path.join(downloadPath, fileName);
    const base64 = await page.evaluate(async (url) => {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }, statementUrl);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

// core logic to extract the data form pdf
function extractDataFromPdf(filePath) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        pdfParser.on("pdfParser_dataError", (e) => reject(e.parserError));

        pdfParser.on("pdfParser_dataReady", (pdfData) => {
            try {
                let data = [];
                pdfData['Pages'].forEach((p) => {
                    p['Texts'].forEach((t) => {
                        let text = decodeURIComponent(t["R"][0]["T"]).trim();
                        if (text) data.push(text);
                    });
                });

                // get assessed value
                const valIndex = data.findIndex(text => text.toUpperCase().includes("TOTAL VALUATION"));
                const assessedValue = valIndex !== -1 && (valIndex + 1 < data.length) ? data[valIndex + 1] : null;

                // get paid date
                const dateIndex = data.findIndex(text => text.toUpperCase().includes("DATE:"));
                const paidDate = dateIndex !== -1 && (dateIndex + 3 < data.length) ? data[dateIndex + 3] : null;

                // get amount paid
                const amountIndex = data.findIndex(text => text.toUpperCase().includes("AMOUNT PAID:"));
                const amountPaid = amountIndex !== -1 && (amountIndex + 3 < data.length) ? data[amountIndex + 3] : null;

                // get tax year
                const fullTextStr = data.join(" ");
                const yearMatch = fullTextStr.match(/(\d{4})\s+REAL\s+ESTATE/i);
                const year = yearMatch ? yearMatch[1] : null;

                // get parcel number
                const parcelIdMatch = data.find(item => item.match(/^\d+-\d+-\d+-\d+/));
                const parcelId = parcelIdMatch ? parcelIdMatch : data[10];

                resolve({ paidDate, amountPaid, year, parcelId, assessedValue });
            } catch (error) {
                console.log("Error extracting text data:", error);
                reject(error);
            }
        });

        pdfParser.loadPDF(filePath);
    });
}

// populate the object with obtained data
async function populateTheObject(data) {
    const result = createPropertyObject();
    result.owner_name.push(data.ownerName);
    result.property_address = data.address;
    result.parcel_number = data.parcelId;

    if (data.assessedValue) {
        const cleanStr = String(data.assessedValue).replace(/,/g,'');
        const numVal = parseFloat(cleanStr);
        const formatAssessedValue = "$" + numVal.toLocaleString('en-US',{minimumFractionDigits: 2});
        result.total_assessed_value = formatAssessedValue;
    }

    result.total_taxable_value = result.total_assessed_value;

    const record = createTaxHistory();
    record.year = data.year;
    record.base_amount = data.baseTax;
    record.amount_paid = `$${data.amountPaid}`;
    record.paid_date = data.paidDate;
    record.amount_due = "$0.00";
    record.status = "Paid";
    record.due_date = `12/31/${record.year}`;
    record.delq_date = `01/01/${Number(record.year) + 1}`;
    result.tax_history.push(record);

    // sort the records
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

    // decide delinquency and notes
    if (result.tax_history.length > 0) {
        const hasDelinquent = result.tax_history.some(
            (t) => t.status === "Delinquent",
        );
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

// Main flows starts from here
const account_search = async (page, url, accountNumber, browser) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // 1. Handle the Default Page
        await doInitialNavigations(page);

        // 2. Search Account Number
        await searchAccountNumber(accountNumber, page);

        // 3. Get the property Details
        const data = await getPropertyDetails(page, browser);
        
        // 4. Populate the object with obtained data
        const result = await populateTheObject(data);

        // 5. Return the result
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
        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://polkcountycollector.com/";

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

        if (fetch_type == "html") {
            account_search(page, url, account, browser)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    res.status(200).render('error_data', {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        }
        else if (fetch_type == "api") {
            account_search(page, url, account, browser)
                .then((data) => {
                    res.status(200).json({
                        result: data
                    });
                })
                .catch((error) => {
                    res.status(500).json({
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        }

    } catch (error) {
        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        } else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}

export {
    search
};