// Author :- Bhagyashree Badadal

// After testing in local server, 6 + 2 = Validation CAPTCHA Came

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "dixie": {
        url: "https://dixie.floridatax.us/PropertyDetail",
        auth: "Dixie County Tax Collector, 214 NE 351 Highway, Suite A, Cross City, FL 32628"
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

// Notes generation helper
const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID, ${year} `
                : `PRIORS ARE DELINQUENT, ${year} `;
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        notes += ` NORMAL DUE DATE IS 03/31`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// Populate function to construct final output
function populatePropertyData(rawDetails, accountNumber, tax_auth) {
    const property = createPropertyObject();
    const record = createTaxHistory();

    // 2. Property Identifiers
    property.parcel_number = accountNumber || "";
    property.owner_name = rawDetails.ownerName ? [rawDetails.ownerName] : [];
    property.property_address = rawDetails.propertyAddress || "";
    property.total_assessed_value = rawDetails.assessedValue || "";
    property.total_taxable_value = rawDetails.taxableValue || "";
    property.taxing_authority = tax_auth || "";

    // 3. Tax Year & Due / Delinquent Dates
    const year = String(rawDetails.selectedYear || "");
    record.year = year;
    if (year && !isNaN(year)) {
        const nextYear = parseInt(year, 10) + 1;
        record.due_date = `03/31/${nextYear}`;
        record.delq_date = `04/01/${nextYear}`;
    }

    // 4. Amounts
    record.base_amount = rawDetails.baseTaxAmount || "$0.00";
    record.amount_paid = rawDetails.amountPaid || "$0.00";
    record.amount_due = rawDetails.amountDue || "$0.00";
    record.paid_date = rawDetails.paidDate || "";

    // 5. YOUR EXACT SIMPLIFIED STATUS LOGIC
    if (record.amount_due === "$0.00") {
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

    // 6. Push to tax_history
    property.tax_history.push(record);

    // 7. Sort records
    property.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) {
            return yearA - yearB;
        }
        if (a.status === "Paid" && b.status !== "Paid") return -1;
        if (a.status !== "Paid" && b.status === "Paid") return 1;
        return 0;
    });

    // 8. Delinquency and Notes
    if (property.tax_history.length > 0) {
        const hasDelinquent = property.tax_history.some(
            (t) => t.status === "Delinquent"
        );
        property.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        const latestTax = property.tax_history[property.tax_history.length - 1];

        const hasPriorDelinquent = property.tax_history.some(
            (t) => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
        );

        const keys = hasPriorDelinquent ? 0 : 1;
        property.notes = generate_notes(latestTax.year, keys, latestTax.status);
    }

    return property;
}

async function getDetails(page) {
    // 1. Owner Name & Property Address
    const ownerName = await page.$eval('#MainContent_lblGIOwnerNameBanner', el => el.innerText.trim());

    const propertyAddress = await page.$eval('#MainContent_lblGIPhysicalAddress', el => {
        return el.innerText.replace('PROPERTY ADDRESS:', '').trim();
    });

    // 2. Assessed & Taxable Values
    const assessments = await page.evaluate(() => {
        const table = document.querySelector('#MainContent_PropertyContainer_tpAssessments_TaxableValuesGrid');
        if (!table) return { assessed: null, taxable: null };

        const rows = Array.from(table.querySelectorAll('tr'));
        for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length > 0) {
                return {
                    assessed: cells[1].innerText.trim(),
                    taxable: cells[3].innerText.trim()
                };
            }
        }

        return { assessed: null, taxable: null };
    });

    // 3. Find most recent year from links
    const targetYearInfo = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('.year-links-table a'));
        let maxYear = -1;
        let targetId = null;

        links.forEach(link => {
            const yr = parseInt(link.innerText.trim(), 10);
            if (!isNaN(yr) && yr > maxYear) {
                maxYear = yr;
                targetId = link.id;
            }
        });

        return { maxYear, targetId };
    });

    // Click the year link and navigate
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.click(`#${targetYearInfo.targetId}`)
    ]);

    // 4. Extract Base Tax Amount (Charged)
    const taxes = await page.evaluate(() => {
        const parseCurrency = (str) => {
            if (!str) return 0;
            return parseFloat(str.replace(/[\$,]/g, '').trim()) || 0;
        };

        const getCharged = (tableId, chargedIdx) => {
            const table = document.querySelector(tableId);
            if (!table) return 0;
            const rows = Array.from(table.querySelectorAll('tr'));
            for (const row of rows) {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length > 0 && cells[0].innerText.trim().toUpperCase() === 'TOTAL') {
                    return parseCurrency(cells[chargedIdx]?.innerText);
                }
            }
            return 0;
        };

        const adValCharged = getCharged('#MainContent_PropertyContainer_tpTaxes_TaxesGrid', 2);
        const nonAdCharged = getCharged('#MainContent_PropertyContainer_tpTaxes_TaxesNonAdValoremGrid', 1);

        return {
            baseTaxAmount: `$${(adValCharged + nonAdCharged).toFixed(2)}`
        };
    });

    // 5. Visually switch to Payment History tab (optional)
    const historyTab = await page.$('#__tab_MainContent_PropertyContainer_tpTransactionHistory');
    if (historyTab) {
        await historyTab.click();
    }

    // 6. Extract Paid Date & Paid Amount from Payment History Grid
    const paymentInfo = await page.evaluate((targetYear) => {
        const table = document.querySelector('#MainContent_PropertyContainer_tpTransactionHistory_TransactionHistoryGrid');
        if (!table) return { paidDate: null, amountPaid: "$0.00" };

        const rows = Array.from(table.querySelectorAll('tr'));
        for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length > 5 && cells[0].innerText.trim() === String(targetYear)) {
                return {
                    paidDate: cells[4].innerText.trim(),  // Payment Date
                    amountPaid: cells[5].innerText.trim() // Paid Amount
                };
            }
        }
        return { paidDate: null, amountPaid: "$0.00" };
    }, targetYearInfo.maxYear);

    // Return the raw extracted values
    return {
        ownerName,
        propertyAddress,
        assessedValue: `$${assessments.assessed}`,
        taxableValue: `$${assessments.taxable}`,
        selectedYear: targetYearInfo.maxYear,
        baseTaxAmount: taxes.baseTaxAmount,
        amountPaid: paymentInfo.amountPaid,
        paidDate: paymentInfo.paidDate
    };
}

const account_search = async (page, url, accountNumber, tax_auth) => {
    try {
        await page.setViewport({ width: 1920, height: 1080 });

        // 1. Go to the URL
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // 2. Scrape raw values
        const rawDetails = await getDetails(page);

        // 3. Populate and return the standardized object
        const populatedData = populatePropertyData(rawDetails, accountNumber, tax_auth);
        return populatedData;

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

        // Dynamically build URL with account number
        const url = `${county_data[req_county].url}?p=${account}`;
        const tax_auth = county_data[req_county].auth;

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
            account_search(page, url, account, tax_auth)
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
                    await context.close();
                });
        } else if (fetch_type === "api") {
            account_search(page, url, account, tax_auth)
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
                    await context.close();
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