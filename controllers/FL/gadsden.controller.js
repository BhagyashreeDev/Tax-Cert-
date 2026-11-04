// Author:- Bhagyashree Badadal

// Parcel - Number

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
        taxing_authority: "Gadsden County Tax Collector, 16 S Calhoun St, Quincy, FL 32351",
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

const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID, ${year} `
                : `PRIORS ARE DELINQUENT, ${year} `;
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        notes += ` NORMAL DUE DATES IS 11/01`;
    } catch (error) {
        console.log("Error in generate_notes:", error);
    } finally {
        return notes;
    }
};

async function searchAccountNumber(accountNumber, page) {
    await page.waitForSelector("#search-input", { waitUntil: "domcontentloaded", ...timeout_option });
    await page.type("#search-input", accountNumber);

    await page.waitForSelector("#search-button", { waitUntil: "domcontentloaded", ...timeout_option });
    await page.click("#search-button");

    await page.waitForSelector("#search-results li:first-child .result-item", { waitUntil: "domcontentloaded", ...timeout_option });
    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
        page.click('#search-results li:first-child .result-item')
    ]);
}

async function getDetails(page) {

    await page.waitForFunction(() => {
        const el = document.querySelector("#tax-year");
        return el && el.textContent.trim().length > 0;
    }, timeout_option);

    const details = await page.evaluate(() => {
        const getText = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.textContent.trim() : "";
        };

        // --- CHECK CERTIFICATE SECTION ---
        const certSection = document.querySelector("#certificate-info-section");
        let faceAmount = "";
        let isCertificateSection = false;
        // Check if the section exists AND is visible (not hidden with display: none)
        if (certSection && window.getComputedStyle(certSection).display !== "none") {
            faceAmount = getText("#cert-face-amount");
            isCertificateSection = true;
        }

        return {
            taxYear: getText("#tax-year"),
            ownerName: getText("#owner-name"),
            siteAddress: getText("#site-address"),
            assessedValue: getText("#assessed-value"),
            amountDue: getText("#amount-due"),
            isCertificateSection,
            faceAmount
        };
    });

    const dueAmount = parseFloat(details.amountDue.replace(/\$/g, '').trim()) || 0;
    const isPaid = dueAmount == 0 ? true : false;
    let paidDetails = null;

    // if it is paid year, then get paid date and paid amount
    if (isPaid) {
        await page.waitForSelector("#certificate-info-section", { waitUntil: "domcontentloaded", ...timeout_option });
        paidDetails = await page.evaluate(() => {

            const getText = (selector) => {
                const el = document.querySelector(selector);
                return el ? el.textContent.trim() : "";
            };

            const firstPaymentRow = document.querySelector("#payment-table .tabulator-row");
            let paymentDate = "";
            let paymentAmount = "";

            if (firstPaymentRow) {
                const dateCell = firstPaymentRow.querySelector('[tabulator-field="date"]');
                const amountCell = firstPaymentRow.querySelector('[tabulator-field="amount"]');

                paymentDate = dateCell ? dateCell.textContent.trim() : "";
                paymentAmount = amountCell ? amountCell.textContent.trim() : "";
            }

            return {
                baseAmount: getText("#cert-face-amount"),
                totalDue: getText("#cert-total-due"),
                paymentDate,
                paymentAmount
            };
        });
    }


    return { details, paidDetails };
}

// switching to the previous tab
async function goToPreviousTaxYear(page, currentYear) {
    const targetYear = (parseInt(currentYear, 10) - 1).toString();
    const buttonSelector = `button.tax-year-button[data-year="${targetYear}"]`;
    const button = await page.$(buttonSelector);
    if (!button) { return false; }
    await page.click(buttonSelector);

    await page.waitForFunction((expectedYear) => {
        const el = document.querySelector("#tax-year");
        return el && el.textContent.trim() === expectedYear;
    }, timeout_option, targetYear);

    return true;
}

// building the actual tax-record
function buildTaxRecord(details, paidDetails) {
    const record = createTaxHistory();
    const yearNum = parseInt(details.taxYear, 10);
    const nextYear = yearNum + 1;
    const dueAmount = parseFloat(details.amountDue.replace(/\$/g, '').trim()) || 0;
    const isPaid = dueAmount == 0 ? true : false;

    record.year = details.taxYear;
    // if we have certificate section, then put face-amount
    if (details.isCertificateSection) {
        record.base_amount = details.faceAmount;
    } else { // or else put amount due
        record.base_amount = isPaid ? paidDetails.baseAmount : details.amountDue;
    }
    record.amount_due = details.amountDue;
    record.amount_paid = isPaid ? paidDetails.paymentAmount : "$0.00";
    record.paid_date = isPaid ? paidDetails.paymentDate : "";

    record.due_date = `11/01/${yearNum}`;
    record.delq_date = `04/01/${nextYear}`;

    if (dueAmount === 0 || dueAmount == 0) {
        record.status = "Paid";
    } else {
        const today = new Date();
        const delqDateObj = new Date(record.delq_date);
        if (today <= delqDateObj) {
            record.status = "Due";
        } else {
            record.status = "Delinquent";
        }
    }

    return record;
}

// Main flows starts from here
const account_search = async (page, url, accountNumber) => {
    try {
        // 1. Go to the URL
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // 2. Search for that parcel
        await searchAccountNumber(accountNumber, page);

        // 3. Populating the tax-record
        const property = createPropertyObject();
        let isFirstYear = true;

        while (true) {
            const { details, paidDetails } = await getDetails(page);
            // only first year owner details are populated
            if (isFirstYear) {
                property.parcel_number = accountNumber;
                property.property_address = details.siteAddress;
                property.total_assessed_value = details.assessedValue;
                property.total_taxable_value = details.assessedValue;
                property.owner_name.push(details.ownerName);
            }

            const taxRecord = buildTaxRecord(details, paidDetails);
            if (isFirstYear) {
                property.tax_history.push(taxRecord);
                if (taxRecord.status === "Paid") break;
                isFirstYear = false;
            } else {
                if (taxRecord.status === "Paid") break;
                property.tax_history.push(taxRecord);
            }

            // go to the previous year tab
            const switched = await goToPreviousTaxYear(page, details.taxYear);
            if (!switched) break;
        }

        // sort the tax record
        property.tax_history.sort((a, b) => {
            const yearA = parseInt(a.year, 10) || 0;
            const yearB = parseInt(b.year, 10) || 0;
            if (yearA !== yearB) { return yearA - yearB; }
            return 0;
        });

        // notes and delinquency
        if (property.tax_history.length > 0) {
            const hasDelinquent = property.tax_history.some(t => t.status === "Delinquent");
            property.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            const latestIndex = property.tax_history.length - 1;
            const latestTax = property.tax_history[latestIndex];

            const hasPriorDelinquent = property.tax_history.some((t, index) => t.status === "Delinquent" && index !== latestIndex);

            const keys = hasPriorDelinquent ? 0 : 1;
            property.notes = generate_notes(latestTax.year, keys, latestTax.status);
        }

        return property;

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

        const url = "https://gadsden.flcounty.com/";

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
                    // await context.close();
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
                    // await context.close();
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