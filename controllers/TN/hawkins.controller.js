// Author:- Bhagyashree Badadal

// PDF(non-preview) county, parcel-number search 

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import fs from "fs";
import PDFParser from "pdf2json";
import path from "path";
import base64 from 'base64topdf';

const timeout_option = {
    timeout: 90000,
};

const county_data = {
    "hawkins": {
        url: "https://hawkins-tn.renewgov.com/searchResults?keyword=",
        auth: "Hawkins County Trustee, 110 E Main St, Rogersville, TN 37857"
    },
    "claiborne": {
        url: "https://claiborne-tn.renewgov.com/searchResults?keyword=",
        auth: "Claiborne County Trustee, 415 Straight Creek Rd, Tazewell, TN 37879"
    },
    "warren": {
        url: "https://warren-tn.renewgov.com/searchResults?keyword=",
        auth: "Warren County Trustee, 201 Locust St, McMinnville, TN 37110"
    }
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

// for generating notes
const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID, ${year} `
                : `PRIORS ARE DELINQUENT, ${year} `;
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        notes += ` NORMAL DUE DATE IS 1st MONDAY IN OCTOBER`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// cleaning the base tax we get from pdf
function formatBaseAmount(usdString) {
    if (!usdString) return "";
    const num = usdString.replace(/^USD/, "");
    return `$${num}`;
}

// calculating the due date of that tax year
function getFirstMondayOfOctober(year) {
    const d = new Date(year, 9, 1);
    const day = d.getDay();
    const diff = day === 0 ? 1 : (day === 1 ? 0 : 8 - day);
    d.setDate(d.getDate() + diff);

    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

// calculating the delinquent date
function getDelqDate(dueDate) {
    let delqDate;
    if (dueDate) {
        const [mm, dd, yyyy] = dueDate.split("/").map(Number);
        const nextDay = new Date(yyyy, mm - 1, dd + 1);

        const newMM = String(nextDay.getMonth() + 1).padStart(2, "0");
        const newDD = String(nextDay.getDate()).padStart(2, "0");
        delqDate = `${newMM}/${newDD}/${nextDay.getFullYear()}`;
    }
    return delqDate;
}

// selecting the result from the result card
async function resultCard(page, accountNumber) {
    await page.waitForSelector('svg[data-testid="HomeIcon"]', {
        visible: true,
        ...timeout_option
    });
    await Promise.all([
        page.waitForNavigation({visible: true}),
        page.click('svg[data-testid="HomeIcon"]')
    ])
}

// waiting for pdf to download
async function waitForDownload(downloadPath, timeoutMs = 30000) {

    // Take a snapshot of existing files to ensure we don't grab an old PDF
    const filesBefore = new Set(fs.existsSync(downloadPath) ? fs.readdirSync(downloadPath) : []);

    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            // Check for timeout
            if (Date.now() - startTime > timeoutMs) {
                clearInterval(interval);
                reject(new Error('Download timeout'));
                return;
            }

            try {
                if (!fs.existsSync(downloadPath)) return;
                const filesNow = fs.readdirSync(downloadPath);
                // Look for a new file that wasn't there before
                const newFiles = filesNow.filter(f => !filesBefore.has(f));
                // Find the one that finished downloading (has .pdf, no .crdownload)
                const pdfFile = newFiles.find(f => f.toLowerCase().endsWith('.pdf') && !f.toLowerCase().endsWith('.crdownload'));

                if (pdfFile) {
                    clearInterval(interval);
                    // Add a small 1.5s delay to ensure the OS has finished writing the file completely
                    setTimeout(() => resolve(path.join(downloadPath, pdfFile)), 1500);
                }
            } catch (err) {
                // Ignore read errors and try again next tick
            }
        }, 500); // Check every half second
    });
}

// core logic of pdf parsing
function extractDataWithPdf2Json(filePath) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();

        pdfParser.on("pdfParser_dataError", errData => {
            console.error(errData.parserError);
            reject(errData.parserError);
        });

        pdfParser.on("pdfParser_dataReady", async (pdfData) => {
            try {
                let data = [];
                pdfData['Pages'].forEach((p, i) => {
                    p['Texts'].forEach((t, j) => {
                        let text = t["R"][0]["T"];
                        text = decodeURIComponent(text).trim();
                        if (text != null && text != "" && text != " ") {
                            data.push(text);
                        }
                    });
                });

                // the pdf prints 1character at a single line, so we join it
                const joinedText = data.join("");
                const amountMatches = joinedText.match(/USD[\d,]+\.\d{2}/g); // pattern matching to get base tax
                const baseTaxValue = amountMatches ? amountMatches[0] : null;
                resolve(baseTaxValue);
            } catch (error) {
                console.log(error);
                resolve(null);
            }
        });
        pdfParser.loadPDF(filePath);
    });
}

// getting all property detailss
async function parsePropertyDetails(page, accountNumber) {
    const result = createPropertyObject();

    await page.waitForFunction(() => {
        return (
            document.querySelector('svg[data-testid="CheckCircleOutlineIcon"]') ||
            document.querySelector('svg[data-testid="AddShoppingCartOutlinedIcon"]')
        );
    });

    // know whether we have paid/unpaid data for this parcel number
    const status = await page.evaluate(() => {
        if (document.querySelector('svg[data-testid="CheckCircleOutlineIcon"]')) return "Paid";
        if (document.querySelector('svg[data-testid="AddShoppingCartOutlinedIcon"]')) return "Unpaid";
        return "Unknown";
    });

    // get the owner name
    const ownerName = await page.evaluate(() => {
        const labels = [...document.querySelectorAll("p")];
        const ownerLabel = labels.find(p => p.textContent.trim() === "Owner:");
        return ownerLabel?.nextElementSibling?.textContent.trim() || null;
    });

    // get the property address
    const propertyAddress = await page.evaluate(() => {
        const labels = [...document.querySelectorAll("p")];
        const addressLabel = labels.find(p => p.textContent.trim() === "Address:");
        return addressLabel?.nextElementSibling?.textContent.trim() || null;
    });

    // getting the assessed value from the equation
    await page.waitForSelector('[role="combobox"]', { visible: true });

    const currentYear = await page.evaluate(() => {
        const cb = document.querySelector('[role="combobox"]');
        return cb ? cb.textContent.trim() : "";
    });

    // iff the drop down is not equal to 2025 , we select the 2025 from the drop down
    if (currentYear !== "2025") {
        await page.click('[role="combobox"]');
        try {
            await page.waitForFunction(() => {
                const elements = [...document.querySelectorAll('li, [role="option"]')];
                return elements.some(el => el.textContent.trim() === "2025");
            }, { timeout: 5000 });

            await page.evaluate(() => {
                const elements = [...document.querySelectorAll('li, [role="option"]')];
                const option = elements.find(el => el.textContent.trim() === "2025");
                if (option) option.click();
            });
        } catch (err) {
        }
    }

    await page.waitForFunction(() => {
        return !document.body.innerText.includes("Tax data not yet available");
    }, { timeout: 30000 });

    // fetch propertyValue and assessment % from the equation to calcuate assessed value
    const formulaData = await page.evaluate(() => {
        const paragraphs = [...document.querySelectorAll("p")];
        const formulaPara = paragraphs.find(p => p.textContent.includes("x") && p.textContent.includes("%") && p.textContent.includes("="));
        if (!formulaPara) return null;

        const text = formulaPara.textContent.trim();
        const match = text.match(/\$([\d,]+(?:\.\d+)?)\s*x\s*([\d.]+)%/i);
        if (match) {
            return {
                propertyValueStr: match[1],
                assessmentPercentStr: match[2]
            };
        }
        return null;
    });

    // populate the assessed value
    if (formulaData) {
        const propertyValue = parseFloat(formulaData.propertyValueStr.replace(/,/g, ""));
        const assessmentPercent = parseFloat(formulaData.assessmentPercentStr);

        if (!isNaN(propertyValue) && !isNaN(assessmentPercent)) {
            const calculatedAssessedValue = (propertyValue * assessmentPercent) / 100;
            const formattedValue = `$${calculatedAssessedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            result.total_assessed_value = formattedValue;
            result.total_taxable_value = formattedValue;
        }
    }

    result.owner_name = ownerName ? [ownerName] : ["N/A"];
    result.parcel_number = accountNumber;
    result.property_address = propertyAddress ? propertyAddress : "N/A";

    // if the status is paid...
    if (status === "Paid") {
        await page.waitForFunction(() => {
            return [...document.querySelectorAll("p")].some(
                p => p.textContent.trim() === "Amount Paid:"
            );
        }, { timeout: 30000 });

        const taxDetails = await page.evaluate(() => {
            function getValue(label) {
                const labels = [...document.querySelectorAll("p")];
                const element = labels.find(
                    p => p.textContent.trim() === label
                );
                return element?.nextElementSibling?.textContent.trim() || null;
            }

            return {
                year: getValue("Taxable Year"),
                outstandingDue: getValue("Outstanding Due"),
                amountPaid: getValue("Amount Paid:"),
                paidDate: getValue("Payment Date:")
            };
        });

        // we click on download button "Select for Full Property History" as it is paid 
        await page.waitForSelector('svg[data-testid="DownloadIcon"]', { visible: true, ...timeout_option });
        const downloadPath = path.resolve('./pdfs');
        if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath,
        });

        const downloadPromise = waitForDownload(downloadPath);

        // Guaranteed DOM click. This finds the SVG and clicks its parent Button
        // to bypass Puppeteer SVG click issues.
        await page.evaluate(() => {
            const icon = document.querySelector('svg[data-testid="DownloadIcon"]');
            if (icon) {
                const btn = icon.closest('button') || icon;
                btn.click();
            }
        });

        const downloadedFilePath = await downloadPromise;

        const baseTax = await extractDataWithPdf2Json(downloadedFilePath);

        // populating that record
        const record = createTaxHistory();
        record.year = taxDetails.year;
        record.base_amount = formatBaseAmount(baseTax) ? formatBaseAmount(baseTax) : taxDetails.amountPaid;
        record.amount_paid = taxDetails.amountPaid;
        record.amount_due = taxDetails.outstandingDue;

        const numericDue = parseFloat(taxDetails.outstandingDue.replace(/[^0-9.-]+/g, ""));
        if (numericDue > 0) {
            record.base_amount = taxDetails.outstandingDue;
        } else {
            record.base_amount = formatBaseAmount(baseTax) || taxDetails.amountPaid;
        }
        record.amount_paid = taxDetails.amountPaid;
        record.amount_due = taxDetails.outstandingDue;

        // cleaning the paid date
        if (taxDetails.paidDate && taxDetails.paidDate.includes("-")) {
            const datePart = taxDetails.paidDate.split(" ")[0];
            const [yyyy, mm, dd] = datePart.split("-");
            record.paid_date = `${mm}/${dd}/${yyyy}`;
        } else {
            record.paid_date = taxDetails.paidDate || "N/A";
        }

        const yearInt = parseInt(taxDetails.year, 10);
        if (!isNaN(yearInt)) {
            // the first monday of october will be the due date of that taxYear
            record.due_date = getFirstMondayOfOctober(yearInt);
            record.delq_date = getDelqDate(record.due_date);
        }

        if (record.amount_due === "$0.00" || record.amount_due === "$0") {
            record.status = "Paid";
        } else {
            const today = new Date();
            const dueDateObj = new Date(record.due_date);
            if (today <= dueDateObj) {
                record.status = "Due";
            } else {
                record.status = "Delinquent";
            }
        }
        result.tax_history.push(record);
        // deleting the downloaded the file
        fs.unlink(downloadedFilePath, err => {
            if (err) console.log(`An error occurred deleting PDF: ${err.message}`);
        });

    } else {  // iff the status is unpaid...
        await page.waitForFunction(() => {
            return [...document.querySelectorAll("p")].some(
                p => p.textContent.trim() === "Amount Due:"
            );
        }, { timeout: 30000 });
        await page.$('svg[data-testid="CalendarTodayTwoToneIcon"]');

        const taxDetails = await page.evaluate(() => {
            function getValue(label) {
                const labels = [...document.querySelectorAll("p")];
                const element = labels.find(p => p.textContent.trim() === label);
                return element?.nextElementSibling?.textContent.trim() || null;
            }

            return {
                year: getValue("Taxable Year"),
                outstandingDue: getValue("Outstanding Due"),
                amountDue: getValue("Amount Due:"),
                dueDate: getValue("Due Date:")
            };
        });

        // we click on receipt icon to get that year base tax
        await page.waitForSelector('svg[data-testid="ReceiptLongIcon"]', { visible: true, ...timeout_option });
        const downloadPath = path.resolve('./pdfs');
        if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath,
        });

        const downloadPromise = waitForDownload(downloadPath);

        await page.evaluate(() => {
            const icon = document.querySelector('svg[data-testid="ReceiptLongIcon"]');
            if (icon) {
                const btn = icon.closest('button') || icon;
                btn.click();
            }
        });

        const downloadedFilePath = await downloadPromise;

        const baseTax = await extractDataWithPdf2Json(downloadedFilePath);

        // populate the record
        const record = createTaxHistory();
        record.year = taxDetails.year;
        record.base_amount = formatBaseAmount(baseTax) ? formatBaseAmount(baseTax) : taxDetails.outstandingDue;
        record.amount_due = taxDetails.outstandingDue;
        record.due_date = taxDetails.dueDate; // this due date is given in the website
        record.amount_paid = "$0.00";
        record.delq_date = getDelqDate(record.due_date);

        if (record.amount_due === "$0.00" || record.amount_due === "$0") {
            record.status = "Paid";
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDateObj = new Date(record.due_date);

            if (today <= dueDateObj) {
                record.status = "Due";
            } else {
                record.status = "Delinquent";
            }
        }
        result.tax_history.push(record);
        // delete the downloaded file
        fs.unlink(downloadedFilePath, err => {
            if (err) console.log(`An error occurred deleting PDF: ${err.message}`);
        });
    }

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

    // deciding notes and delinquency
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

const account_search = async (page, url, accountNumber, auth) => {
    try {

        // 1. Set viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // 2. Go to that URL
        await page.goto(`${url}${accountNumber}`, { waitUntil: "networkidle2", ...timeout_option });

        // 3. Select the correct account
        await resultCard(page, accountNumber);

        // 4. Get all the data of that pracel number
        const result = await parsePropertyDetails(page, accountNumber);

        result.taxing_authority = auth;

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
    const county = (
        req.params.county || req.path.split("/").filter(Boolean).pop()
    ).toLowerCase();

    try {
        const url = county_data[county]["url"];
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36",
        );

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (req.resourceType() === "font" || req.resourceType() === "image") {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            // FRONTEND ENDPOINT
            account_search(page, url, account, county_data[county].auth)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error);
                    res.status(200).render("error_data", {
                        error: true,
                        message: error.message,
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        } else if (fetch_type == "api") {
            // API ENDPOINT
            account_search(page, url, account, county_data[county].auth)
                .then((data) => {
                    res.status(200).json({
                        result: data,
                    });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({
                        error: true,
                        message: error.message,
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render("error_data", {
                error: true,
                message: error.message,
            });
        } else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message,
            });
        }
    }
};

export { search };
