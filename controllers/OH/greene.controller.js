// Author:- Bhagyashree Badadal

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "greene": {
        url: "https://auditor.greenecountyohio.gov/Search/Number",
        auth: "Greene County Auditor, 69 S Detroit St, Xenia, OH 45385",
        first_half_due: "02/27",
        first_half_delq: "02/28",
        second_half_due: "08/14",
        second_half_delq: "08/15"
    },

    "brown": {
        url: "https://realestate.browncountyauditor.org/Search/Number",
        auth: "Brown County Auditor, 800 Mt Orab Pike, Suite 101, Georgetown, OH 45121",
        first_half_due: "02/11",
        first_half_delq: "02/12",
        second_half_due: "07/31",
        second_half_delq: "08/01"
    },

    "belmont": {
        url: "https://www.belmontcountytreasurer.org/Search/Number",
        auth: "Belmont County Treasurer, 101 S Washington St, St Clairsville, OH 43950",
        first_half_due: "02/20",
        first_half_delq: "02/21",
        second_half_due: "07/24",
        second_half_delq: "07/25"
    },

    "shelby": {
        url: "https://realestate.shelbycountyauditors.com/Search/Number",
        auth: "Shelby County Auditor, 129 E Court St, Sidney, OH 45365",
        first_half_due: "02/14",
        first_half_delq: "02/15",
        second_half_due: "07/20",
        second_half_delq: "07/21"
    },

    "morgan": {
        url: "https://www.morgancountyauditor.org/Search/Number",
        auth: "Morgan County Auditor, 155 E Main St, McConnelsville, OH 43756",
        first_half_due: "02/15",
        first_half_delq: "02/16",
        second_half_due: "07/15",
        second_half_delq: "07/16"
    },

    "ottawa": {
        url: "https://auditor.co.ottawa.oh.us/Search/Number",
        auth: "Ottawa County Auditor, 315 Madison St, Port Clinton, OH 43452",
        first_half_due: "02/19",
        first_half_delq: "02/20",
        second_half_due: "08/06",
        second_half_delq: "08/07"
    },

    "clinton": {
        url: "https://clintoncountyauditor.org/Search/Number",
        auth: "Clinton County Auditor, 46 S South St, Wilmington, OH 45177",
        first_half_due: "02/14",
        first_half_delq: "02/15",
        second_half_due: "07/31",
        second_half_delq: "08/01"
    },

    "holmes": {
        url: "https://www.holmescountyauditor.org/Search/Number",
        auth: "Holmes County Auditor, 75 E Clinton St, Millersburg, OH 44654",
        first_half_due: "02/18",
        first_half_delq: "02/19",
        second_half_due: "08/05",
        second_half_delq: "08/06"
    },

    "erie": {
        url: "https://auditor.eriecounty.oh.gov/Search/Number",
        auth: "Erie County Auditor, 247 Columbus Ave, Sandusky, OH 44870",
        first_half_due: "02/18",
        first_half_delq: "02/19",
        second_half_due: "07/29",
        second_half_delq: "07/30"
    },

    "coshocton": {
        url: "https://www.coshcoauditor.org/Search/Number",
        auth: "Coshocton County Auditor, 349 Main St, Coshocton, OH 43812",
        first_half_due: "03/17",
        first_half_delq: "03/18",
        second_half_due: "08/04",
        second_half_delq: "08/05"
    },

    "muskingum": {
        url: "https://www.muskingumcountyauditor.org/Search/Number",
        auth: "Muskingum County Auditor, 401 Main St, Zanesville, OH 43701",
        first_half_due: "02/13",
        first_half_delq: "02/14",
        second_half_due: "07/29",
        second_half_delq: "07/30"
    },

    "champaign": {
        url: "https://treasurer.co.champaign.oh.us/Search/Number",
        auth: "Champaign County Treasurer, 1512 S US Hwy 68, Urbana, OH 43078",
        first_half_due: "02/20",
        first_half_delq: "02/21",
        second_half_due: "07/20",
        second_half_delq: "07/21"
    },

    "fayette": {
        url: "https://www.fayettecountytreasurer.org/Search/Number",
        auth: "Fayette County Treasurer, 133 S Main St, Washington Court House, OH 43160",
        first_half_due: "02/24",
        first_half_delq: "02/25",
        second_half_due: "07/21",
        second_half_delq: "07/22"
    },

    "seneca": {
        url: "https://senecacountytreasurer.org/Search/Number",
        auth: "Seneca County Treasurer, 109 S Washington St, Tiffin, OH 44883",
        first_half_due: "02/20",
        first_half_delq: "02/21",
        second_half_due: "07/31",
        second_half_delq: "08/01"
    },

    "logan": {
        url: "https://treasurer.logancountyohio.gov/Search/Number",
        auth: "Logan County Treasurer, 100 S Madriver St, Bellefontaine, OH 43311",
        first_half_due: "02/11",
        first_half_delq: "02/12",
        second_half_due: "07/08",
        second_half_delq: "07/09"
    },

    "tuscarawas": {
        url: "https://treasurer.co.tuscarawas.oh.us/Search/Number",
        auth: "Tuscarawas County Treasurer, 125 E High Ave, New Philadelphia, OH 44663",
        first_half_due: "02/20",
        first_half_delq: "02/21",
        second_half_due: "07/24",
        second_half_delq: "07/25"
    },
    "huron": {
        url: "https://www.huroncountytreasurer.org/Search/Number",
        auth: "Huron County Auditor, 12 East Main Street, Suite 300, Norwalk, OH 44857",
        first_half_due: "02/13",
        first_half_delq: "02/14",
        second_half_due: "07/31",
        second_half_delq: "08/01"
    },

    "geauga": {
        url: "https://realestate.geauga.oh.gov/Search/Number",
        auth: "Geauga County Auditor, 231 Main St, Suite 1-A, Chardon, OH 44024",
        first_half_due: "02/18",
        first_half_delq: "02/19",
        second_half_due: "08/04",
        second_half_delq: "08/05"
    },

    "carroll": {
        url: "https://www.carrollcountyauditor.us/Search/Number",
        auth: "Carroll County Auditor, 119 S Lisbon Street, Suite 203, Carrollton, OH 44615",
        first_half_due: "02/20",
        first_half_delq: "02/21",
        second_half_due: "07/31",
        second_half_delq: "08/01"
    },

    "lorain": {
        url: "https://loraincountyauditor.gov/Search/Number",
        auth: "Lorain County Auditor, 226 Middle Ave, Elyria, OH 44035",
        first_half_due: "02/13",
        first_half_delq: "02/14",
        second_half_due: "07/31",
        second_half_delq: "08/01"
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
        payment_type: "Semi-Annual",
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

// Helper for formatting currency amounts cleanly
function formatCurrency(val) {
    if (!val || val === "N/A") return "$0.00";
    let str = String(val).trim();
    if (str.startsWith("$")) return str;
    const num = parseFloat(str.replace(/[^0-9.-]+/g, ""));
    if (isNaN(num)) return "$0.00";
    return `$${num.toFixed(2)}`;
}

async function handleDisclaimer(page) {
    try {
        await page.waitForSelector("button[type='submit']", { visible: true, waitUntil: "domcontentloaded" });
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2", ...timeout_option }).catch(() => { }),
            page.click("button[type='submit']")
        ]);
    } catch (err) {
        return;
    }
}

// Search account number on page
async function searchAccountNumber(accountNumber, page) {
    const inputSelector = "#Number";

    // Check if input box is present on current page
    let inputEl = await page.$(inputSelector);

    // If input box is missing (e.g. landed on /Search/Results grid), click Property Search link from navbar
    if (!inputEl) {
        const propertySearchLink = await page.$('a.nav-link[href*="/Search"], a[href*="/Search/Number"], a[href="/Search"]');
        if (propertySearchLink) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle2", ...timeout_option }).catch(() => { }),
                propertySearchLink.click()
            ]);
        }
    }

    // Double-check if a sub-link for Search by Number exists
    inputEl = await page.$(inputSelector);
    if (!inputEl) {
        const numberSearchLink = await page.$('a[href*="/Search/Number"], a[href*="/Search/Account"]');
        if (numberSearchLink) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle2", ...timeout_option }).catch(() => { }),
                numberSearchLink.click()
            ]);
        }
    }

    await page.waitForSelector(inputSelector, { visible: true, ...timeout_option });
    await page.type(inputSelector, accountNumber);

    const btnSelector = "button[type='submit']";
    await page.waitForSelector(btnSelector, { visible: true, ...timeout_option });
    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", ...timeout_option }).catch(() => { }),
        page.click(btnSelector)
    ]);
}

// Extract property details and tax installment info from page
async function getDetails(page, county) {

    if (county === "belmont" || county === "champaign" || county === "fayette" || county === "seneca" || county === "logan" || county === "tuscarawas" || county === "huron") {
        const propertyDetails = await page.evaluate(() => {
            let ownerName = "";
            let address = "";

            const divs = Array.from(document.querySelectorAll('div.col-12'));
            const ownerDiv = divs.find(d => d.textContent.trim().toLowerCase().includes('owner name'));
            if (ownerDiv && ownerDiv.nextElementSibling) {
                ownerName = ownerDiv.nextElementSibling.textContent.replace(/[\s\xa0]+/g, ' ').trim();
            }

            const getText = (selector) => {
                const el = document.querySelector(selector);
                return el ? el.textContent.replace(/[\s\xa0]+/g, ' ').trim() : '';
            };
            address = getText('#HeaderLocation + div');

            const taxableValueEl = document.querySelector('td[aria-labelledby~="ValuesTaxable"][aria-labelledby~="ValuesAppraised"]');
            const taxableValue = taxableValueEl ? taxableValueEl.textContent.replace(/[\s\xa0]+/g, ' ').trim() : '';

            return { ownerName, address, taxableValue };
        });

        const { taxInstallments, paymentHistoryUrl } = await page.evaluate(() => {
            const getVal = (colId, rowId) => {
                const el = document.querySelector(`td[aria-labelledby~="${colId}"][aria-labelledby~="${rowId}"]`);
                return el ? el.textContent.replace(/[\s,\$]+/g, '').trim() : '0.00';
            };

            let taxYear = '';
            const yearEl = document.querySelector('h2, .card-header');
            if (yearEl) {
                const yearMatch = yearEl.textContent.match(/\d{4}/);
                if (yearMatch) {
                    taxYear = yearMatch[0];
                }
            }

            const taxInstallments = {
                taxYear: taxYear,
                firstInstallment: {
                    taxAmount: getVal('ChargesFirst', 'ChargesTax'),
                    totalBilled: getVal('ChargesFirst', 'ChargesTotalRow'),
                    amountPaid: getVal('ChargesFirst', 'ChargesPaid'),
                    amountDue: getVal('ChargesFirst', 'ChargesDue')
                },
                secondInstallment: {
                    taxAmount: getVal('ChargesSecond', 'ChargesTax'),
                    totalBilled: getVal('ChargesSecond', 'ChargesTotalRow'),
                    amountPaid: getVal('ChargesSecond', 'ChargesPaid'),
                    amountDue: getVal('ChargesSecond', 'ChargesDue')
                },
                priorDelinquent: {
                    taxAmount: getVal('ChargesPrior', 'ChargesTax'),
                    totalBilled: getVal('ChargesPrior', 'ChargesTotalRow'),
                    amountPaid: getVal('ChargesPrior', 'ChargesPaid'),
                    amountDue: getVal('ChargesPrior', 'ChargesDue')
                }
            };

            const links = Array.from(document.querySelectorAll('nav#sidebarMenu a.nav-link'));
            const paymentLink = links.find(a => a.textContent.includes('Payment History'));
            const paymentHistoryUrl = paymentLink ? paymentLink.getAttribute('href') : null;

            return { taxInstallments, paymentHistoryUrl };
        });

        return { propertyDetails, taxInstallments, paymentHistoryUrl };
    }

    const propertyDetails = await page.evaluate(() => {
        const getText = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.textContent.replace(/[\s\xa0]+/g, ' ').trim() : '';
        };

        const ownerName = getText('#OwnerName + div');
        const address = getText('#HeaderLocation + div');
        const taxableValue = getText('td[aria-labelledby="ValueTaxable ValueAppraised"]');
        return { ownerName, address, taxableValue };
    });

    const { taxInstallments, paymentHistoryUrl } = await page.evaluate(() => {
        const getVal = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.textContent.replace(/[\s,]+/g, '').trim() : '0.00';
        };

        let taxYear = '';
        const chargeTableElement = document.getElementById('ChargeTax');

        if (chargeTableElement) {
            const parentCard = chargeTableElement.closest('.card');
            if (parentCard) {
                const headerText = parentCard.querySelector('.card-header')?.textContent || '';
                const yearMatch = headerText.match(/\d{4}/);
                if (yearMatch) {
                    taxYear = yearMatch[0];
                }
            }
        }

        const taxInstallments = {
            taxYear: taxYear,
            firstInstallment: {
                taxAmount: getVal('td[aria-labelledby="ChargeTax ChargeFirst"]'),
                totalBilled: getVal('td[aria-labelledby="ChargeTotalRow ChargeFirst"]'),
                amountPaid: getVal('td[aria-labelledby="ChargePaid ChargeFirst"]'),
                amountDue: getVal('td[aria-labelledby="ChargeDue ChargeFirst"]')
            },
            secondInstallment: {
                taxAmount: getVal('td[aria-labelledby="ChargeTax ChargeSecond"]'),
                totalBilled: getVal('td[aria-labelledby="ChargeTotalRow ChargeSecond"]'),
                amountPaid: getVal('td[aria-labelledby="ChargePaid ChargeSecond"]'),
                amountDue: getVal('td[aria-labelledby="ChargeDue ChargeSecond"]')
            },
            priorDelinquent: {
                taxAmount: getVal('td[aria-labelledby="ChargeTax ChargePrior"]'),
                totalBilled: getVal('td[aria-labelledby="ChargeTotalRow ChargePrior"]'),
                amountPaid: getVal('td[aria-labelledby="ChargePaid ChargePrior"]'),
                amountDue: getVal('td[aria-labelledby="ChargeDue ChargePrior"]')
            }
        };

        // Extract the Payment History link from the sidebar
        const links = Array.from(document.querySelectorAll('nav#sidebarMenu a.nav-link'));
        const paymentLink = links.find(a => a.textContent.includes('Payment History'));
        const paymentHistoryUrl = paymentLink ? paymentLink.getAttribute('href') : null;

        return { taxInstallments, paymentHistoryUrl };
    });

    return { propertyDetails, taxInstallments, paymentHistoryUrl };
}

// Fetch payment dates from Payment History sub-page if payments were made
async function getPaymentHistoryDates(page, paymentHistoryUrl, taxInstallments) {
    if (!paymentHistoryUrl) {
        return taxInstallments;
    }

    const absoluteUrl = new URL(paymentHistoryUrl, page.url()).href;
    await page.goto(absoluteUrl, { waitUntil: "networkidle2", ...timeout_option });

    await page.waitForSelector('.table-responsive table tbody tr, table.table tbody tr', { waitUntil: "domcontentloaded", ...timeout_option }).catch(() => { });

    const paymentRecords = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.table-responsive table tbody tr, table.table tbody tr'));
        return rows.map(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds.length >= 2) {
                return {
                    date: tds[0].textContent.trim(),
                    amount: tds[1].textContent.replace(/[\s,]+/g, '').trim()
                };
            }
            return null;
        }).filter(record => record !== null);
    });

    const matchDateForAmount = (amountPaid) => {
        if (!amountPaid || amountPaid === '0.00' || amountPaid === '0') return null;
        const record = paymentRecords.find(p => p.amount === amountPaid);
        return record ? record.date : null;
    };

    taxInstallments.firstInstallment.paidDate = matchDateForAmount(taxInstallments.firstInstallment.amountPaid);
    taxInstallments.secondInstallment.paidDate = matchDateForAmount(taxInstallments.secondInstallment.amountPaid);
    taxInstallments.priorDelinquent.paidDate = matchDateForAmount(taxInstallments.priorDelinquent.amountPaid);

    return taxInstallments;
}

// Populate final result property object and tax history with due/delinquent dates and status
function populateTheObject(accountNumber, propertyDetails, installments, county_config) {
    const propertyObj = createPropertyObject();

    propertyObj.parcel_number = accountNumber;
    propertyObj.taxing_authority = county_config.auth;
    propertyObj.owner_name = propertyDetails.ownerName ? [propertyDetails.ownerName] : ["N/A"];
    propertyObj.property_address = propertyDetails.address || "N/A";
    propertyObj.total_taxable_value = propertyDetails.taxableValue ? formatCurrency(propertyDetails.taxableValue) : "N/A";
    propertyObj.total_assessed_value = propertyObj.total_taxable_value;

    const taxYearStr = installments.taxYear || String(new Date().getFullYear() - 1);
    const yearNum = parseInt(taxYearStr, 10);
    const collectionYear = !isNaN(yearNum) ? yearNum + 1 : new Date().getFullYear();

    const today = new Date();

    const buildTaxHistory = (installmentData, paymentType, dueDateStr, delqDateStr, isPrior = false) => {
        const taxHist = createTaxHistory();

        taxHist.year = isPrior ? "N/A" : taxYearStr;
        taxHist.payment_type = paymentType;
        taxHist.base_amount = formatCurrency(installmentData.taxAmount);
        taxHist.amount_paid = formatCurrency(installmentData.amountPaid);
        taxHist.amount_due = formatCurrency(installmentData.amountDue);
        taxHist.paid_date = installmentData.paidDate || "";
        taxHist.due_date = dueDateStr;
        taxHist.delq_date = delqDateStr;

        const dueFloat = parseFloat(installmentData.amountDue) || 0;

        if (dueFloat <= 0) {
            taxHist.status = "Paid";
        } else {
            if (isPrior) {
                taxHist.status = "Delinquent";
            } else if (dueDateStr && dueDateStr !== "N/A") {
                const dueDateObj = new Date(dueDateStr);
                if (!isNaN(dueDateObj.getTime()) && today <= dueDateObj) {
                    taxHist.status = "Due";
                } else {
                    taxHist.status = "Delinquent";
                }
            } else {
                taxHist.status = "Delinquent";
            }
        }

        return taxHist;
    };

    // Installment 1 (1st Half)
    const inst1Due = `${county_config.first_half_due}/${collectionYear}`;
    const inst1Delq = `${county_config.first_half_delq}/${collectionYear}`;
    propertyObj.tax_history.push(buildTaxHistory(installments.firstInstallment, "Installment 1", inst1Due, inst1Delq));

    // Installment 2 (2nd Half)
    const inst2Due = `${county_config.second_half_due}/${collectionYear}`;
    const inst2Delq = `${county_config.second_half_delq}/${collectionYear}`;
    propertyObj.tax_history.push(buildTaxHistory(installments.secondInstallment, "Installment 2", inst2Due, inst2Delq));

    // Check if Prior Delinquent has any amounts to include
    const priorBilled = parseFloat(installments.priorDelinquent.totalBilled) || 0;
    const priorDue = parseFloat(installments.priorDelinquent.amountDue) || 0;
    const priorPaid = parseFloat(installments.priorDelinquent.amountPaid) || 0;

    if (priorDue > 0) {
        const priorDueStr = `${county_config.first_half_due}/${collectionYear - 1}`;
        const priorDelqStr = `${county_config.first_half_delq}/${collectionYear - 1}`;
        propertyObj.tax_history.push(buildTaxHistory(installments.priorDelinquent, "Semi-Annual", priorDueStr, priorDelqStr, true));
    }

    if (propertyObj.tax_history.length > 0) {
        const hasDelinquent = propertyObj.tax_history.some((t) => t.status === "Delinquent");
        propertyObj.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        const inst1 = propertyObj.tax_history.find(t => t.payment_type === "Installment 1");
        const inst2 = propertyObj.tax_history.find(t => t.payment_type === "Installment 2");
        const status1 = inst1?.status || "Paid";
        const status2 = inst2?.status || "Paid";

        const hasPriorDelinquent = propertyObj.tax_history.some(
            (t) => t.status === "Delinquent" && t.payment_type === "Semi-Annual"
        );

        const keys = hasPriorDelinquent ? 0 : 1;
        propertyObj.notes = generate_notes(taxYearStr, keys, status1, status2, county_config);
    }

    return propertyObj;
}



const account_search = async (page, url, accountNumber, county_config, req_county) => {
    try {
        await page.setViewport({ width: 1920, height: 1080 });

        // 1. Go to the URL
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        await handleDisclaimer(page);

        // If the disclaimer redirects us to /Search/Results (common for Ottawa), go back to /Search/Number
        if (page.url().toLowerCase().includes('/search/results')) {
            await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });
        }

        // 2. Search for the account number
        await searchAccountNumber(accountNumber, page);

        // 3. Get property details & tax installments
        const { propertyDetails, taxInstallments, paymentHistoryUrl } = await getDetails(page, req_county);

        // 4. Check if any installment has payments made
        const isFirstPaid = parseFloat(taxInstallments.firstInstallment.amountPaid) > 0;
        const isSecondPaid = parseFloat(taxInstallments.secondInstallment.amountPaid) > 0;
        const isPriorPaid = parseFloat(taxInstallments.priorDelinquent.amountPaid) > 0;

        let finalInstallments = taxInstallments;
        if (isFirstPaid || isSecondPaid || isPriorPaid) {
            finalInstallments = await getPaymentHistoryDates(page, paymentHistoryUrl, taxInstallments);
        }

        // 5. Populate final result object
        const finalPropertyData = populateTheObject(accountNumber, propertyDetails, finalInstallments, county_config);
        return finalPropertyData;

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
            account_search(page, url, account, county_config, req_county)
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
            account_search(page, url, account, county_config, req_county)
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

