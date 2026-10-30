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
        taxing_authority: "Barton County Collector-Treasurer, 1004 Gulf Street, Lamar, MO 64759",
        delinquent: "NONE",
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

// Generation of notes
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

// Search Account Number
async function searchAccountNumber(accountNumber, page) {
    const inputSelector = "#searchIn";
    await page.waitForSelector(inputSelector);
    await page.type(inputSelector, accountNumber);

    const searchButtonSelector = "#searchSubmit";
    await page.waitForSelector(searchButtonSelector);
    await Promise.all([
        page.waitForNavigation(),
        page.click(searchButtonSelector)
    ]);
}

// Get all details present in that selected div
async function scrapeResults(page) {
    // 1. Wait for the list of items to load
    await page.waitForSelector('#searchList .parClick', { timeout: 15000 });
    
    // 2. Determine how many clickable items exist
    const itemsCount = await page.evaluate(() => {
        return document.querySelectorAll('#searchList .parClick').length;
    });
    
    const allExtractedData = [];

    // 3. Iterate through each item (div)
    for (let i = 0; i < itemsCount; i++) {
        const elements = await page.$$('#searchList .parClick');
        const currentElement = elements[i];
        await currentElement.click();
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Pass (i === 0) to flag if this is the first div
        const isFirstDiv = (i === 0);
        const data = await goToDiv(page, isFirstDiv);

        if (data) {
            const rawAmount = data.amountDue || "0";
            const amountDueNum = parseFloat(rawAmount.replace(/[^\d.-]/g, '')) || 0;
            const isPaid = amountDueNum === 0;

            if (i === 0) {
                allExtractedData.push(data);
                if (isPaid) break;
            } else {
                if (isPaid) break;
                else allExtractedData.push(data);
            }
        }
        
        // Handle Back button if we didn't break out of the loop
        const isBackBtnVisible = await page.evaluate(() => {
            const btn = document.querySelector('#btnBackToList');
            return btn && window.getComputedStyle(btn).display !== 'none';
        });

        if (isBackBtnVisible) {
            await page.click('#btnBackToList');
            await new Promise(resolve => setTimeout(resolve, 1000)); 
        }
    }
    return allExtractedData;
}

// Build tax history schema
async function buildSchema(scrapedData) {
    if (!scrapedData || scrapedData.length === 0) return [];
    const history = [];
    
    for (let i = 0; i < scrapedData.length; i++) {
        const item = scrapedData[i];
        const year = item.taxYear;
        const nextYear = parseInt(year) + 1;
        
        const record = createTaxHistory();
        record.year = year;
        record.base_amount = formatCurrency(item.baseTaxAmount);
        record.amount_paid = formatCurrency(item.paidAmount);
        record.amount_due = formatCurrency(item.amountDue);
        record.due_date = `12/31/${year}`;
        record.delq_date = `01/01/${nextYear}`;
        record.paid_date = item.paidDate;

        if (record.amount_due === "$0.00") {
            record.status = "Paid";
        } else {
            const today = new Date();
            const dueDateObj = new Date(year, 11, 31);
            if (today <= dueDateObj) {
                record.status = "Due";
            } else {
                record.status = "Delinquent";
            }
        }
        history.push(record);
    }
    return history;
}

// Get details of property + tax
async function goToDiv(page, isFirstDiv) {
    let propertyData = null;
    
    // Only parse the property level DOM details if it's the first div
    if (isFirstDiv) {
        propertyData = await propertyDetails(page);
    }

    const taxData = await page.evaluate(() => {
        const container = document.querySelector('.parDtl[style*="display: block"]');
        if (!container) return null;
        
        const data = {
            taxYear: "",
            baseTaxAmount: "",
            amountDue: "",
            totalTaxesAndPenalties: "",
            paidDate: "",
            paidAmount: ""
        };

        let totalPaid = 0;
        const paymentDates = [];
        
        const rows = container.querySelectorAll(".row");
        for (const row of rows) {
            const text = row.innerText.trim();
            if (text.includes("Total Taxes:")) {
                const cols = row.querySelectorAll("div");
                data.baseTaxAmount = cols[cols.length - 1].innerText.trim();
            } else if (text.includes("Total Taxes, Interest and Penalties:")) {
                const cols = row.querySelectorAll("div");
                data.totalTaxesAndPenalties = cols[cols.length - 1].innerText.trim();
            } else if (text.includes("Total Due:")) {
                const cols = row.querySelectorAll("div");
                data.amountDue = cols[cols.length - 1].innerText.trim();
            } 
            // Matches any layout beginning with "Payment"
            else if (text.startsWith("Payment (") || text.startsWith("Payment")) {
                const cols = row.querySelectorAll("div");
                if (cols.length >= 3) {
                    const dateText = cols[1].innerText.trim();
                    if (dateText) {
                        paymentDates.push(dateText);
                    }
                    const rawAmount = cols[cols.length - 1].innerText.trim();
                    const cleanAmount = parseFloat(rawAmount.replace(/[^\d.-]/g, '')) || 0;
                    totalPaid += cleanAmount;
                }
            }
        }

        // Process aggregated payments if any were found
        if (paymentDates.length > 0) {
            data.paidAmount = totalPaid.toFixed(2);

            // Parse valid dates and sort chronologically to find the latest date
            const parsedDates = paymentDates.map(d => {
                const timestamp = Date.parse(d);
                return { original: d, timestamp };
            }).filter(item => !isNaN(item.timestamp));

            if (parsedDates.length > 0) {
                // Sort descending (latest timestamp first)
                parsedDates.sort((a, b) => b.timestamp - a.timestamp);
                data.paidDate = parsedDates[0].original;
            } else {
                // Fallback to the first raw string if parsing fails
                data.paidDate = paymentDates[0];
            }
        }

        return data;
    });

    if (!taxData) return null;

    // If it's the first div, merge the property data into the returned object
    if (isFirstDiv && propertyData && propertyData.data) {
        return { ...taxData, ...propertyData.data };
    }

    return taxData;
}

// Scrape Property Information (Called only once per account)
async function propertyDetails(page) {
    const parsedData = await page.evaluate(() => {
        const container = document.querySelector('.parDtl[style*="display: block"]');
        if (!container) return null;
        
        const data = {
            ownerName: "",
            propertyAddress: "",
            assessedValue: "N/A",
            taxYear: ""
        };
        
        const headerDivs = container.querySelectorAll('.parHdr .col-md-12');
        if (headerDivs.length >= 4) {
            const year = headerDivs[0].innerText.trim();
            const yearMatch = year.match(/\((\d{4})\)/);
            data.taxYear = yearMatch ? yearMatch[1] : '';
            data.ownerName = headerDivs[1].innerText.trim();
            const addressLine1 = headerDivs[2].innerText.trim();
            const addressLine2 = headerDivs[3].innerText.trim();
            data.propertyAddress = `${addressLine1}, ${addressLine2}`;
        }

        const allDivs = container.querySelectorAll('div');
        for (let j = 0; j < allDivs.length; j++) {
            const text = allDivs[j].innerText.trim();
            if (text === 'Valuation:') {
                data.assessedValue = allDivs[j + 1]?.innerText.trim();
            }
        }
        return { data, isFirstDivParsed: true };
    });
    return parsedData;
}

const account_search = async (page, url, account) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });
        
        // 1. Search parcel-ID 
        await searchAccountNumber(account, page);

        // 2. Scrape details (property + tax)
        const scrapedData = await scrapeResults(page);

        // 3. Populate property details
        const result = createPropertyObject();
        result.parcel_number = account;
        
        if (scrapedData.length > 0) {
            const primaryRecord = scrapedData[0];
            result.owner_name = primaryRecord.ownerName ? [primaryRecord.ownerName] : [];
            result.property_address = primaryRecord.propertyAddress || "";
            result.total_assessed_value = formatCurrency(primaryRecord.assessedValue);
            result.total_taxable_value = result.total_assessed_value;

            // 4. Build tax history schema 
            result.tax_history = await buildSchema(scrapedData);
        }

        // 5. Sort the records
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

        // 6. Attach delinquency and notes
        if (result.tax_history.length > 0) {
            const hasDelinquent = result.tax_history.some(t => t.status === "Delinquent");
            result.delinquent = hasDelinquent
                ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                : "NONE";

            const latestTax = result.tax_history[result.tax_history.length - 1];
            const hasPriorDelinquent = result.tax_history.some(
                t => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
            );

            const keys = hasPriorDelinquent ? 0 : 1;
            result.notes = generate_notes(latestTax.year, keys, latestTax.status);
        }
        
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

        const url = "https://bartoncountycollector.org/";

        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);
        
        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'font' || req.resourceType() === 'image') {
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