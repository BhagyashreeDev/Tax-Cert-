// Author:- Bhagyashree Badadal

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "jackson": {
        url: "https://jacksoncountyauditor.org/Search",
        auth: "Jackson County Auditor, 226 E Main St, Jackson, OH 45640",
        first_half_due: "02/25",
        first_half_delq: "02/26",
        second_half_due: "08/14",
        second_half_delq: "08/15"
    },
    "fairfield": {
        url: "https://auditorrealestate.fairfieldcountyohio.gov/Search",
        auth: "Fairfield County Auditor, 108 N High St, Lancaster, OH 43130",
        first_half_due: "02/19",
        first_half_delq: "02/20",
        second_half_due: "07/30",
        second_half_delq: "07/31"
    },
    "mercer": {
        url: "https://auditor.mercercountyohio.gov/Search",
        auth: "Mercer County Auditor, 101 N Main St, Room 105, Celina, OH 45822",
        first_half_due: "02/20",
        first_half_delq: "02/21",
        second_half_due: "07/27",
        second_half_delq: "07/28"
    },
    "miami": {
        url: "https://www.miamicountyohioauditor.gov/Search",
        auth: "Miami County Auditor, 201 W Main St, Troy, OH 45373",
        first_half_due: "02/14",
        first_half_delq: "02/15",
        second_half_due: "07/20",
        second_half_delq: "07/21"
    },
    "paulding": {
        url: "https://www.pauldingcountyauditor.com/Search",
        auth: "Paulding County Auditor, 115 N Williams St, Paulding, OH 45879",
        first_half_due: "02/11",
        first_half_delq: "02/12",
        second_half_due: "07/15",
        second_half_delq: "07/16"
    }
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
        taxing_authority: "",
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
const generate_notes = (year, keys, status1, status2, county_config) => {
    let notes = "";
    try {
        const d1 = county_config?.first_half_due || "02/15";
        const d2 = county_config?.second_half_due || "07/15";
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${(status1 || "PAID").toUpperCase()}, 2ND INSTALLMENT IS ${(status2 || "PAID").toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE ${d1} AND ${d2}`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

async function searchAccountNumber(page, accountNumber) {
    // 1. Enter parcel number and submit search
    await page.waitForSelector("#searchValues_ParcelNumber", { visible: true, ...timeout_option });
    await page.type("#searchValues_ParcelNumber", accountNumber);

    await page.waitForSelector("button[value='ParcelNumber']", { visible: true, ...timeout_option });
    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
        page.click("button[value='ParcelNumber']")
    ]);

    // 2. Target the button and fire its inline onclick / form submission directly in DOM
    const selector = `input[form="ParcelNav"][value="${accountNumber}"]`;
    await page.waitForSelector(selector, { visible: true, ...timeout_option });

    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
        page.$eval(selector, (el) => el.click())
    ]);
}

async function getDetails(page) {

    await page.waitForSelector('table[title="Valuation"]', { visible: true, ...timeout_option });

    const details = await page.evaluate(() => {
        const data = {};
        const rows = document.querySelectorAll('#Location table tr');

        rows.forEach(row => {
            const key = row.querySelector('th')?.innerText.trim();
            const value = row.querySelector('td')?.innerText.trim();
            if (key && value) {
                data[key] = value.replace(/\s+/g, ' ');
            }
        });

        return data;
    });

    const valuationData = await page.evaluate(() => {
        const rows = document.querySelectorAll('table[title="Valuation"] tbody tr');
        const results = [];

        rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length >= 7) {
                results.push({
                    year: cols[0].innerText.trim(),
                    appraisedLand: cols[1].innerText.trim(),
                    appraisedImprovements: cols[2].innerText.trim(),
                    appraisedTotal: cols[3].innerText.trim(),
                    assessedLand: cols[4].innerText.trim(),
                    assessedImprovements: cols[5].innerText.trim(),
                    assessedTotal: cols[6].innerText.trim(),
                    isPreliminary: cols[0].innerText.includes('*')
                });
            }
        });

        return results;
    });

    const pivotedTaxData = await page.evaluate(() => {
        const firstTab = document.querySelector('#taxBill-tabs .nav-link');
        if (!firstTab) return null;

        const yearLabel = firstTab.innerText.trim();
        const targetSelector = firstTab.getAttribute('data-target');
        const pane = document.querySelector(targetSelector);

        if (!pane) return null;

        const rows = pane.querySelectorAll('table tbody tr');
        const pivoted = {
            delinquent: {},
            firstHalf: {},
            secondHalf: {},
            total: {}
        };

        rows.forEach(row => {
            const cols = row.querySelectorAll('td, th');
            if (cols.length >= 4) {
                const label = cols[0].innerText.trim();

                if (label && !label.includes("GROSS TAX RATE") && !label.includes("EFFECTIVE TAX RATE")) {
                    const delinquentVal = cols[1]?.innerText.trim();
                    const firstHalfVal = cols[2]?.innerText.trim();
                    const secondHalfVal = cols[3]?.innerText.trim();
                    const totalVal = cols[4]?.innerText.trim();

                    if (delinquentVal) pivoted.delinquent[label] = delinquentVal;
                    if (firstHalfVal) pivoted.firstHalf[label] = firstHalfVal;
                    if (secondHalfVal) pivoted.secondHalf[label] = secondHalfVal;
                    if (totalVal) pivoted.total[label] = totalVal;
                }
            }
        });

        return { year: yearLabel, details: pivoted };
    });

    const paymentData = await page.evaluate(() => {
        // const rows = document.querySelectorAll('table#taxPayments tbody tr');
        const rows = document.querySelectorAll('table#taxPayments tbody tr, table#DataTables_Table_5 tbody tr');
        const results = [];

        rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length >= 3) {
                results.push({
                    paymentDate: cols[0].innerText.trim(),
                    paymentDateSort: cols[0].getAttribute('data-sort') || '',
                    taxYear: cols[1].innerText.trim(),
                    amount: cols[2].innerText.trim()
                });
            }
        });

        return results;
    });

    console.log("Details: ", details);
    console.log("Valuation data: ", valuationData);
    console.log("Pivoted Tax data: ", pivotedTaxData);
    console.log("Payment data: ", paymentData);

    return { details, valuationData, pivotedTaxData, paymentData };
}


async function populateTheObject(page, accountNumber, county_config) {
    const scrapedData = await getDetails(page);
    const propertyObj = createPropertyObject();

    propertyObj.parcel_number = accountNumber;

    // Add Taxing Authority from county configuration
    propertyObj.taxing_authority = county_config.auth || "";

    if (scrapedData.details["Owner"]) {
        propertyObj.owner_name.push([scrapedData.details["Owner"]]);
    }
    propertyObj.property_address = scrapedData.details["Address"] || "N/A";

    // Map valuation data (using the most recent entry index 0)
    if (scrapedData.valuationData && scrapedData.valuationData.length > 0) {
        const latestVal = scrapedData.valuationData[0];
        propertyObj.total_assessed_value = latestVal.assessedTotal;
        propertyObj.total_taxable_value = latestVal.assessedTotal;
    }

    // Process Tax History & Installments
    if (scrapedData.pivotedTaxData) {
        const taxYearFull = scrapedData.pivotedTaxData.year; // e.g., "2025 Payable 2026"
        const taxYearClean = taxYearFull.split(" ")[0]; // Extracts "2025"

        // Extract payable year for building accurate Date strings (Fallback to taxYearClean)
        const payableMatch = taxYearFull.match(/Payable (\d{4})/i);
        const payableYear = payableMatch ? payableMatch[1] : taxYearClean;

        const details = scrapedData.pivotedTaxData.details;

        // Helper to clean and remove negative signs from payment amounts
        const cleanAmount = (val) => (val ? val.replace('-', '').trim() : "$0.00");
        const parseCurrency = (str) => parseFloat(str.replace(/[^0-9.-]+/g, "")) || 0;

        // Find all payments matching this specific tax year and sort them chronologically (oldest to newest)
        const yearPayments = scrapedData.paymentData
            .filter(p => p.taxYear === taxYearClean)
            .sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));

        // First Half Installment
        const firstHalfObj = createTaxHistory();
        firstHalfObj.year = taxYearClean;
        firstHalfObj.payment_type = "Installment 1";
        firstHalfObj.base_amount = details.firstHalf["Net General"] || "$0.00";
        firstHalfObj.amount_paid = cleanAmount(details.firstHalf["Payments Made"] ?? details.firstHalf["Payments & Adjustments"]);
        firstHalfObj.amount_due = details.firstHalf["Due"] || "$0.00";
        firstHalfObj.due_date = `${county_config.first_half_due}/${payableYear}`;
        firstHalfObj.delq_date = `${county_config.first_half_delq}/${payableYear}`;

        if (parseCurrency(firstHalfObj.amount_due) === 0) {
            firstHalfObj.status = "Paid";
        } else {
            const today = new Date();
            const dueDateObj = new Date(firstHalfObj.due_date);
            if (today <= dueDateObj) {
                firstHalfObj.status = "Due";
            } else {
                firstHalfObj.status = "Delinquent";
            }
        }

        // Second Half Installment
        const secondHalfObj = createTaxHistory();
        secondHalfObj.year = taxYearClean;
        secondHalfObj.payment_type = "Installment 2";
        secondHalfObj.base_amount = details.secondHalf["Net General"] || "$0.00";
        secondHalfObj.amount_paid = cleanAmount(details.secondHalf["Payments Made"] ?? details.firstHalf["Payments & Adjustments"]);
        secondHalfObj.amount_due = details.secondHalf["Due"] ?? details.secondHalf["Owed"] ;
        secondHalfObj.due_date = `${county_config.second_half_due}/${payableYear}`;
        secondHalfObj.delq_date = `${county_config.second_half_delq}/${payableYear}`;

        if (parseCurrency(secondHalfObj.amount_due) === 0) {
            secondHalfObj.status = "Paid";
        } else {
            const today = new Date();
            const dueDateObj = new Date(secondHalfObj.due_date);
            if (today <= dueDateObj) {
                secondHalfObj.status = "Due";
            } else {
                secondHalfObj.status = "Delinquent";
            }
        }

        // Assign payment dates chronologically to fix the identical-amount bug
        if (yearPayments.length === 1) {
            // Only 1 payment record found, apply to both installments
            firstHalfObj.paid_date = yearPayments[0].paymentDate;
            secondHalfObj.paid_date = yearPayments[0].paymentDate;
        } else if (yearPayments.length >= 2) {
            // Assign the earlier date to Installment 1 and the later date to Installment 2
            firstHalfObj.paid_date = yearPayments[0].paymentDate;
            secondHalfObj.paid_date = yearPayments[1].paymentDate;
        }

        propertyObj.tax_history.push(firstHalfObj, secondHalfObj);
    }

    // sort the records (oldest to newest)
    propertyObj.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) {
            return yearA - yearB;
        }
        if (a.status === "Paid" && b.status !== "Paid") return -1;
        if (a.status !== "Paid" && b.status === "Paid") return 1;
        return 0;
    });

    // decide notes and delinquency
    if (propertyObj.tax_history.length > 0) {
        const hasDelinquent = propertyObj.tax_history.some(
            (t) => t.status === "Delinquent",
        );
        propertyObj.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        const latestTax = propertyObj.tax_history[propertyObj.tax_history.length - 1];
        const latestYearRecords = propertyObj.tax_history.filter(t => String(t.year) === String(latestTax.year));

        const inst1 = latestYearRecords.find(t => t.payment_type === "Installment 1");
        const inst2 = latestYearRecords.find(t => t.payment_type === "Installment 2");

        const status1 = inst1 ? inst1.status : "UNKNOWN";
        const status2 = inst2 ? inst2.status : "UNKNOWN";

        const hasPriorDelinquent = propertyObj.tax_history.some(
            (t) => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
        );

        const keys = hasPriorDelinquent ? 0 : 1;

        // Added county_config to maintain the dynamic due dates 
        propertyObj.notes = generate_notes(latestTax.year, keys, status1, status2, county_config);
    }

    return propertyObj;
}

const account_search = async (page, url, accountNumber, county_config) => {
    try {
        await page.setViewport({ width: 1920, height: 1080 });

        // 1. Go to the URL
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        await searchAccountNumber(page, accountNumber);

        // 2. This calls the details() inside it
        const result = await populateTheObject(page, accountNumber, county_config);
        result.taxing_authority = county_config.auth;

        // 3. Return the result
        return result;

    } catch (error) {
        console.log("Error inside account_search:", error);
        throw new Error(error.message);
    }
};

const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    if (account) account = account.trim();

    try {
        const req_county = req.path.replace(/\//g, "").toLowerCase();
        if (!county_data[req_county]) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid or unsupported county."
            });
        }

        const county_config = county_data[req_county];
        const url = county_config.url;

        if (fetch_type !== "html" && fetch_type !== "api") {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

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
            account_search(page, url, account, county_config)
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
                .finally(async () => {
                    // await context.close();
                });
        } else if (fetch_type === "api") {
            account_search(page, url, account, county_config)
                .then((data) => {
                    res.status(200).json({ result: data });
                })
                .catch((error) => {
                    console.log(error);
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
        console.log(error);
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