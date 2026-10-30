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
        property_address: "N/A",
        parcel_number: "",
        land_value: "",
        improvements: "",
        total_assessed_value: "N/A",
        exemption: "",
        total_taxable_value: "N/A",
        delinquent: "NONE",
        taxing_authority: "Shelby County Trustee, 157 Poplar Ave, Memphis, TN 38103",
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
        good_through_date: "",
    };
}

// Helper to parse currency string into a numeric float
function parseAmount(val) {
    if (!val) return 0;
    const clean = val.replace(/[^0-9.-]+/g, "");
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
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
    }
    return notes;
};

// calculating the due date of that tax year (1st Monday of October)
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

async function getDetails(page) {
    // 1. Wait for property information and table rows to render
    await page.waitForSelector("tbody tr", { timeout: 30000 });

    const info = await page.evaluate(() => {
        const getValueByLabel = (labelText) => {
            const labels = Array.from(document.querySelectorAll("span"));
            const targetLabel = labels.find(el => el.textContent.trim() === labelText);
            return targetLabel ? targetLabel.nextElementSibling?.textContent.trim() : null;
        };

        return {
            primaryOwner: getValueByLabel('Primary Owner') || "",
            location: getValueByLabel('Location') || ""
        };
    });


    // 2. Extract ALL rows from the tax bill table
    const allBills = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("tbody tr"));
        return rows.map(row => {
            const cells = row.querySelectorAll("td");
            return {
                billNumber: cells[0]?.textContent.trim() || "",
                taxYear: cells[1]?.textContent.trim() || "",
                authority: cells[2]?.textContent.trim() || "",
                taxDue: cells[3]?.textContent.trim() || "$0.00",
                interest: cells[4]?.textContent.trim() || "$0.00",
                totalFees: cells[5]?.textContent.trim() || "$0.00",
                totalDue: cells[6]?.textContent.trim() || "$0.00",
                assessment: cells[7]?.textContent.trim() || "$0.00"
            };
        });
    });

    return { info, allBills };
}

async function populateData(info, allBills, accountNumber) {
    const result = createPropertyObject();
    result.parcel_number = accountNumber;
    if (info.primaryOwner) result.owner_name.push(info.primaryOwner);
    result.property_address = info.location;
    result.parcel_number = accountNumber;

    if (allBills.length === 0) {
        return result;
    }

    // Set assessed value from the most recent record
    result.total_assessed_value = allBills[0].assessment;
    result.total_taxable_value = allBills[0].assessment;

    // Filter all bills that have dues (totalDue > 0)
    const unpaidBills = allBills.filter(bill => parseAmount(bill.totalDue) > 0);

    let targetBills = [];
    if (unpaidBills.length > 0) {
        // If there are unpaid dues across 1 or more years, include all unpaid bills
        targetBills = unpaidBills;
    } else {
        // If all taxes are paid ($0.00), grab all bills from the most recent year (e.g. 2026 Lakeland & Shelby)
        const latestYear = allBills[0].taxYear;
        targetBills = allBills.filter(bill => bill.taxYear === latestYear);
    }

    const today = new Date();

    // Populate tax_history
    for (const bill of targetBills) {
        const record = createTaxHistory();
        const yearInt = parseInt(bill.taxYear, 10);

        record.jurisdiction = bill.authority || "County";
        record.year = bill.taxYear;
        record.base_amount = bill.taxDue;
        record.amount_due = bill.totalDue;

        // Calculate Due Date and Delinquent Date first
        record.due_date = getFirstMondayOfOctober(yearInt);
        record.delq_date = `03/03/${yearInt + 1}`;

        const totalDueNum = parseAmount(bill.totalDue);

        if (totalDueNum === 0) {
            record.status = "Paid";
            record.amount_paid = bill.taxDue;
        } else {
            record.amount_paid = "$0.00";
            const delqDateObj = new Date(record.delq_date);
            const dueDateObj = new Date(record.due_date);

            if (today >= delqDateObj) {
                record.status = "Delinquent";
            } else {
                record.status = "Due";
            }
        }

        result.tax_history.push(record);
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

// Main flows starts from here
const account_search = async (page, url, accountNumber) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        const { info, allBills } = await getDetails(page);
        const result = await populateData(info, allBills, accountNumber);

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

        const url = `https://apps2.shelbycountytrustee.com/Parcel?parcel=${encodeURIComponent(account)}`;

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