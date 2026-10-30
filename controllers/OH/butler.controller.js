// Author:- Bhagyashree Badadal

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000,
};

function createpropertyect() {
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
        taxing_authority: "Butler County Auditor, 130 High Street, Hamilton, OH 45011",
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
        good_through_date: "-",
    };
}

// Notes generation helper
const generate_notes = (year, keys, status1, status2) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${(status1 || "PAID").toUpperCase()}, 2ND INSTALLMENT IS ${(status2 || "PAID").toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE 02/26 AND 08/19`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// search account number
async function searchAccountNumber(accountNumber, page) {
    await page.waitForSelector("#inpParid", timeout_option);
    await page.type("#inpParid", accountNumber);

    await page.waitForSelector("#btSearch", timeout_option);
    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
        page.click("#btSearch")
    ]);
}

// get all the details
async function getDetails(page) {
    const ownerData = await page.evaluate(() => {
        const nameElement = document.querySelector('.DataletHeaderBottom[align="left"]');
        const addressElement = document.querySelector('.DataletHeaderBottom[align="right"]');
        return {
            ownerName: nameElement ? nameElement.innerText.trim() : "N/A",
            address: addressElement ? addressElement.innerText.trim() : "N/A"
        };
    });

    const propertyValues = await page.evaluate(() => {
        const rows = document.querySelectorAll('table[id="Current Value"] tr');
        let data = {};
        rows.forEach(row => {
            const heading = row.querySelector('.DataletSideHeading');
            const value = row.querySelector('.DataletData');
            if (heading && value) {
                const key = heading.innerText.trim();
                const val = value.innerText.trim();
                data[key] = val;
            }
        });
        return data;
    });

    const assessedTotalKey = Object.keys(propertyValues).find(key => key.includes('Assessed Total'));
    const assessedTotal = assessedTotalKey ? propertyValues[assessedTotalKey] : "";
    const taxYear = propertyValues["Assessed Tax Year"];

    const taxSummarySelector = 'a[href*="mode=tax_info_all"]';
    await page.waitForSelector(taxSummarySelector, { timeout: 30000 });
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
        page.click(taxSummarySelector)
    ]);

    // Extract grouped tax summary and match payment dates in a single unified routine
    const finalStructuredData = await page.evaluate((targetYear) => {
        // 1. Parse Grouped Tax Summary
        const summaryRows = document.querySelectorAll('table[id="Real Estate Tax Summary"] tr');
        let priorYearData = {};
        let firstHalfData = {};
        let secondHalfData = {};

        for (let i = 1; i < summaryRows.length - 1; i++) {
            const cols = summaryRows[i].querySelectorAll("td");
            if (cols.length >= 4) {
                const taxType = cols[0].innerText.trim();
                if (taxType.toLowerCase().includes('total:')) continue; 

                priorYearData[taxType] = cols[1].innerText.trim();
                firstHalfData[taxType] = cols[2].innerText.trim();
                secondHalfData[taxType] = cols[3].innerText.trim();
            }
        }

        // 2. Parse Payment History Table
        const tables = document.querySelectorAll('table');
        let rawPayments = [];

        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length >= 8) {
                    const rowTaxYear = cols[0].innerText.trim();
                    const action = cols[1].innerText.trim();
                    const codeVal = cols[2].innerText.trim();
                    const dateVal = cols[3].innerText.trim();
                    const firstHalfVal = cols[5].innerText.trim();
                    const secondHalfVal = cols[6].innerText.trim();

                    if (rowTaxYear === targetYear && action === "PAY") {
                        rawPayments.push({
                            code: codeVal,
                            date: dateVal,
                            firstHalf: firstHalfVal,
                            secondHalf: secondHalfVal
                        });
                    }
                }
            });
        });

        const uniquePaymentsMap = new Map();
        rawPayments.forEach(p => {
            const uniqueKey = `${p.date}-${p.code}-${p.firstHalf}-${p.secondHalf}`;
            if (!uniquePaymentsMap.has(uniqueKey)) {
                uniquePaymentsMap.set(uniqueKey, p);
            }
        });
        const uniquePayments = Array.from(uniquePaymentsMap.values());

        let firstHalfDate = "N/A";
        let secondHalfDate = "N/A";

        uniquePayments.forEach(p => {
            const fhNum = parseFloat(p.firstHalf.replace(/,/g, ''));
            const shNum = parseFloat(p.secondHalf.replace(/,/g, ''));
            
            if (fhNum !== 0) firstHalfDate = p.date;
            if (shNum !== 0) secondHalfDate = p.date;
        });

        return {
            "prior year": { details: priorYearData, paidDate: "N/A" },
            "first half": { details: firstHalfData, paidDate: firstHalfDate },
            "second half": { details: secondHalfData, paidDate: secondHalfDate }
        };
    }, taxYear);

    // RETURN the scraped data so populateTheObject can use it
    return {
        ownerData,
        propertyValues,
        assessedTotal,
        taxYear,
        finalStructuredData
    };
}

async function populateTheObject(accountNumber, scrapedData) {
    const property = createpropertyect();
    
    // Fill top-level property data
    property.parcel_number = accountNumber;
    property.owner_name = [scrapedData.ownerData.ownerName];
    property.property_address = scrapedData.ownerData.address;
    property.total_assessed_value = scrapedData.assessedTotal;
    property.total_taxable_value = property.total_assessed_value;
   
    const taxYearNum = parseInt(scrapedData.taxYear, 10);
    const collectionYear = isNaN(taxYearNum) ? new Date().getFullYear() : taxYearNum + 1;

    // Helper: Standardize date to MM/DD/YYYY format
    function formatToDate(dateStr) {
        if (!dateStr || dateStr === "N/A" || dateStr === "-") return "";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
    }

    // Helper: Remove negative sign
    function cleanAmountPaid(val) {
        if (!val) return "$0.00";
        return val.replace(/-/g, "").trim();
    }

    // Helper: Calculate Due based on amount paid > 0
    function getAmountDue(paidVal) {
        const numericPaid = parseFloat(paidVal.replace(/[$,]/g, "")) || 0;
        if (numericPaid > 0) return "$0.00";
        return "$0.00";
    }

    // --- Installment 1 (First Half) ---
    const inst1 = createTaxHistory();
    inst1.year = scrapedData.taxYear;
    inst1.payment_type = "Installment 1";
    inst1.due_date = `02/26/${collectionYear}`;
    inst1.delq_date = `02/27/${collectionYear}`;
    inst1.paid_date = formatToDate(scrapedData.finalStructuredData["first half"].paidDate);
    
    inst1.base_amount = `$${scrapedData.finalStructuredData["first half"]["details"]["Real Estate"] || "$0.00"}`;
    inst1.amount_paid = `$${cleanAmountPaid(scrapedData.finalStructuredData["first half"]["details"]["Tot Payments"])}`;
    inst1.amount_due = getAmountDue(inst1.amount_paid);

    // Status logic for Installment 1
    if (inst1.amount_due === "$0.00") {
        inst1.status = "Paid";
    } else {
        const today = new Date();
        const dueDateObj = new Date(inst1.due_date);
        inst1.status = (today <= dueDateObj) ? "Due" : "Delinquent";
    }

    // --- Installment 2 (Second Half) ---
    const inst2 = createTaxHistory();
    inst2.year = scrapedData.taxYear;
    inst2.payment_type = "Installment 2";
    inst2.due_date = `08/19/${collectionYear}`;
    inst2.delq_date = `08/20/${collectionYear}`;
    inst2.paid_date = formatToDate(scrapedData.finalStructuredData["second half"].paidDate);
    
    inst2.base_amount = `$${scrapedData.finalStructuredData["second half"]["details"]["Real Estate"] || "$0.00"}`;
    inst2.amount_paid = `$${cleanAmountPaid(scrapedData.finalStructuredData["second half"]["details"]["Tot Payments"])}`;
    inst2.amount_due = getAmountDue(inst2.amount_paid);

    // Status logic for Installment 2
    if (inst2.amount_due === "$0.00") {
        inst2.status = "Paid";
    } else {
        const today = new Date();
        const dueDateObj = new Date(inst2.due_date);
        inst2.status = (today <= dueDateObj) ? "Due" : "Delinquent";
    }

    // Push installments to array
    property.tax_history.push(inst1, inst2);

    // decide notes and delinquency
    if (property.tax_history.length > 0) {
        const hasDelinquent = property.tax_history.some(
            (t) => t.status === "Delinquent",
        );
        property.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        const latestTax = property.tax_history[property.tax_history.length - 1];
        const latestYearRecords = property.tax_history.filter(t => String(t.year) === String(latestTax.year));

        const inst1 = latestYearRecords.find(t => t.payment_type === "Installment 1");
        const inst2 = latestYearRecords.find(t => t.payment_type === "Installment 2");

        const status1 = inst1 ? inst1.status : "UNKNOWN";
        const status2 = inst2 ? inst2.status : "UNKNOWN";

        const hasPriorDelinquent = property.tax_history.some(
            (t) => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
        );

        const keys = hasPriorDelinquent ? 0 : 1;

        // Added county_config to maintain the dynamic due dates 
        property.notes = generate_notes(latestTax.year, keys, status1, status2);
    }
    
    return property;
}

// Main flows starts from here
const account_search = async (page, url, accountNumber) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        await searchAccountNumber(accountNumber, page);
        
        const scrapedData = await getDetails(page);
        
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
    try {
        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://propertysearch.bcohio.gov/search/commonsearch.aspx?mode=parid";

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
            account_search(page, url, account)
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
            account_search(page, url, account)
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