// Author:- Bhagyashree Badadal

// Franklin County Parcel ID Search Controller

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
        taxing_authority: "Franklin County Treasurer, 373 S. High St., Columbus, OH 43215",
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

const generate_notes = (year, keys, status1, status2) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${(status1).toUpperCase()}, 2ND INSTALLMENT IS ${(status2).toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE 03/02 AND 07/20`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

function determineStatus(record) {
    const cleanAmount = (val) => Number(String(val).replace(/[^0-9.-]/g, "")) || 0;

    if (cleanAmount(record.amount_due) === 0 || !record.amount_due) {
        record.status = "Paid";
    } else {
        const today = new Date();
        const delqDateObj = new Date(record.delq_date || record.due_date);

        if (today < delqDateObj) {
            record.status = "Due";
        } else {
            record.status = "Delinquent";
        }
    }
}

// -------------------------------------------------------------
// STEP 1 — SEARCH BY PARCEL ID
// -------------------------------------------------------------
async function searchAccountNumber(accountNumber, page) {
    await page.waitForSelector("#searchBoxUserControl", timeout_option);

    const prefix = await page.evaluate(() => {
        if (document.querySelector("#ctl00_cphBodyContent_sbPropertySearch2_rbSearchByParcelID")) {
            return "#ctl00_cphBodyContent_sbPropertySearch2";
        }
        return "#ctl00_cphBodyContent_sbPropertySearch";
    });

    const radio = `${prefix}_rbSearchByParcelID`;
    const input = `${prefix}_tbSearch`;
    const btn = `${prefix}_btnSearch`;

    await page.click(radio);
    await page.$eval(input, el => (el.value = ""));
    await page.type(input, String(accountNumber).trim(), { delay: 40 });

    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", ...timeout_option }),
        page.click(btn)
    ]);

    await page.waitForSelector("#propertyHeaderList", timeout_option);
}

// -------------------------------------------------------------
// STEP 2 — EXTRACT SUMMARY DETAILS
// -------------------------------------------------------------
async function getDetails(page) {
    await page.waitForSelector("#tabs-0", timeout_option);

    const propertyData = await page.evaluate(() => {
        const getText = (sel) => document.querySelector(sel)?.innerText.trim() || "";

        const rawParcel = getText("#ctl00_cphBodyContent_lblDNum1");
        const parcelNumber = rawParcel.replace(/Parcel:\s*/i, "").trim();

        const owners = [
            getText("#ctl00_cphBodyContent_lblOwn1_1"),
            getText("#ctl00_cphBodyContent_lblOwn1_2")
        ].filter(Boolean);

        const addr1 = getText("#ctl00_cphBodyContent_fcDetailsHeader_LocationAddressLine1");
        const addr2 = getText("#ctl00_cphBodyContent_fcDetailsHeader_LocationAddressLine2");
        const propertyAddress = `${addr1} ${addr2}`.trim();

        return {
            parcelNumber,
            ownerName: owners,
            propertyAddress,
            landValue: getText("#ctl00_cphBodyContent_fcDetailsHeader_lblLand"),
            improvements: getText("#ctl00_cphBodyContent_fcDetailsHeader_lblImprovement"),
            totalAssessedValue: getText("#ctl00_cphBodyContent_fcDetailsHeader_lblTotal"),
            totalTaxableValue: getText("#ctl00_cphBodyContent_fcDetailsHeader_TaxableValue")
        };
    });

    return propertyData;
}

// -------------------------------------------------------------
// STEP 3 — SCRAPE TAX BILL & PAYMENTS
// -------------------------------------------------------------
const normalizeDate = (d) => {
    if (!d) return "";
    const parts = d.split("/");
    return parts.length === 3
        ? `${parts[0].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[2]}`
        : d;
};

const findClosestPaidDate = (delqDate, payments) => {
    const target = new Date(delqDate);
    if (isNaN(target) || !payments || !payments.length) return "";

    const validPayments = payments
        .map(p => ({ ...p, dateObj: new Date(p.date) }))
        .filter(p => !isNaN(p.dateObj));

    if (!validPayments.length) return "";

    let closest = validPayments[0];
    let minDiff = Math.abs(closest.dateObj - target);

    for (const p of validPayments) {
        const diff = Math.abs(p.dateObj - target);
        if (diff < minDiff) {
            minDiff = diff;
            closest = p;
        }
    }

    const mm = String(closest.dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(closest.dateObj.getDate()).padStart(2, "0");
    const yyyy = closest.dateObj.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
};

async function clickYearTab(page, year) {
    const isAlreadySelected = await page.evaluate((yr) => {
        const active = document.querySelector("ul.yearTabs li.ui-tabs-selected a, ul.yearTabs li a.current");
        return active && active.textContent.trim() === String(yr);
    }, year);

    if (isAlreadySelected) {
        return true;
    }

    const tabExists = await page.evaluate((yr) => {
        const tabs = Array.from(document.querySelectorAll("ul.yearTabs li a"));
        return tabs.some(t => t.textContent.trim() === String(yr));
    }, year);

    if (!tabExists) return false;

    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", ...timeout_option }),
        page.evaluate((yr) => {
            const tabs = Array.from(document.querySelectorAll("ul.yearTabs li a"));
            const tab = tabs.find(t => t.textContent.trim() === String(yr));
            if (tab) tab.click();
        }, year)
    ]);

    await page.waitForSelector("#propertyHeaderList", timeout_option).catch(() => {});
    return true;
}

async function scrapeYearData(page, year) {
    const clicked = await clickYearTab(page, year);
    if (!clicked) return null;

    // Switch to Account Balance Tab (Tab 1)
    await page.waitForSelector('#propertyHeaderList a[href="#tabs-1"]', timeout_option);
    await page.click('#propertyHeaderList a[href="#tabs-1"]');
    await page.waitForSelector(
        "#firstHalf table.taxbill-data, #secondHalf table.taxbill-data",
        { timeout: 15000 }
    ).catch(() => {});

    // Scrape Bill Amounts using robust suffix selectors
    const bill = await page.evaluate(() => {
        const getText = (selector) => document.querySelector(selector)?.innerText.trim() || "";
        return {
            first_total: getText("[id$='_TaxRP1']"),
            first_paid: getText("[id$='_TaxPaidRP1']"),
            first_due: getText("[id$='_BalanceDueRP1']"),
            second_total: getText("[id$='_TaxRP2']"),
            second_paid: getText("[id$='_TaxPaidRP2']"),
            second_due: getText("[id$='_BalanceDueRP2']"),
            prior_due: getText("[id$='_BalanceDuePrior']")
        };
    });

    const clean = (v) => Number(String(v).replace(/[^0-9.-]/g, "")) || 0;

    // Skip unbilled years (e.g. 2026 where charges are not yet generated)
    if (clean(bill.first_total) === 0 && clean(bill.second_total) === 0 && clean(bill.first_paid) === 0) {
        return null;
    }

    // Switch to Payments Tab (Tab 3) for matching payment dates
    await page.waitForSelector('#propertyHeaderList a[href="#tabs-3"]', timeout_option);
    await page.click('#propertyHeaderList a[href="#tabs-3"]');
    await page.waitForSelector("div[id*='fcPaymentContainer']", { timeout: 15000 }).catch(() => {});

    const payments = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(
            "div[id*='fcPaymentContainer'] table.grid tbody tr.grid, " +
            "div[id*='fcPaymentContainer'] table.grid tbody tr.grid.alt"
        )).map(r => {
            const cols = r.querySelectorAll("td");
            return {
                date: cols[0]?.innerText.trim() || "",
                amount: cols[1]?.innerText.trim() || ""
            };
        });
    });

    const payableYear = parseInt(year, 10) + 1;

    // Build 1st Half
    const inst1 = createTaxHistory();
    inst1.year = String(year);
    inst1.payment_type = "Semi-Annual";
    inst1.base_amount = bill.first_total || "$0.00";
    inst1.amount_paid = bill.first_paid || "$0.00";
    inst1.amount_due = bill.first_due || "$0.00";
    inst1.due_date = `03/02/${payableYear}`;
    inst1.delq_date = `03/03/${payableYear}`;
    inst1.paid_date = normalizeDate(findClosestPaidDate(inst1.delq_date, payments));
    determineStatus(inst1);

    // Build 2nd Half
    const inst2 = createTaxHistory();
    inst2.year = String(year);
    inst2.payment_type = "Semi-Annual";
    inst2.base_amount = bill.second_total || "$0.00";
    inst2.amount_paid = bill.second_paid || "$0.00";
    inst2.amount_due = bill.second_due || "$0.00";
    inst2.due_date = `07/20/${payableYear}`;
    inst2.delq_date = `07/21/${payableYear}`;
    inst2.paid_date = normalizeDate(findClosestPaidDate(inst2.delq_date, payments));
    determineStatus(inst2);

    const hasPriorDue = clean(bill.prior_due) > 0;

    return {
        records: [inst1, inst2],
        isPaid: inst1.status === "Paid" && inst2.status === "Paid",
        hasPriorDue
    };
}

async function getPaymentDetails(page) {
    const availableYears = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll("ul.yearTabs li a"));
        const years = tabs
            .map(t => parseInt(t.textContent.trim(), 10))
            .filter(y => !isNaN(y));
        return [...new Set(years)].sort((a, b) => b - a);
    });

    const taxHistoryRecords = [];
    let hasPriorDelinquency = false;
    let isFirstValidYear = true; // Tracks the most recent year with actual data

    for (let i = 0; i < availableYears.length; i++) {
        const year = availableYears[i];
        const data = await scrapeYearData(page, year);

        // Skip years that have no bills created yet (e.g. 2026)
        if (!data || !data.records.length) continue;

        if (data.hasPriorDue) {
            hasPriorDelinquency = true;
        }

        if (data.isPaid) {
            // If the recent year is paid: only insert recent year paid data and stop
            if (isFirstValidYear) {
                taxHistoryRecords.push(...data.records);
            }
            // If it is a prior year: do NOT add the first paid year and stop
            break;
        } else {
            // Unpaid year: add to history and check previous years
            taxHistoryRecords.push(...data.records);
            isFirstValidYear = false;
        }
    }

    return {
        taxHistoryRecords,
        hasPriorDelinquency
    };
}

// -------------------------------------------------------------
// STEP 4 — POPULATE STANDARD OBJECT
// -------------------------------------------------------------
function populateObject(summary, paymentData, accountNumber) {
    const result = createPropertyObject();

    const formatCurrency = (val) => {
        if (!val) return "";
        const str = String(val).trim();
        return str.startsWith("$") ? str : `$${str}`;
    };

    result.owner_name = summary.ownerName && summary.ownerName.length ? summary.ownerName : ["N/A"];
    result.property_address = summary.propertyAddress || "N/A";
    result.parcel_number = accountNumber;

    result.land_value = formatCurrency(summary.landValue);
    result.improvements = formatCurrency(summary.improvements);
    result.total_assessed_value = formatCurrency(summary.totalAssessedValue);
    result.total_taxable_value = formatCurrency(summary.totalTaxableValue);

    result.tax_history = paymentData.taxHistoryRecords;

    // Sort history by year ascending
    result.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) return yearA - yearB;
        return a.due_date.localeCompare(b.due_date);
    });

    // Notes and Delinquency Logic
    if (result.tax_history.length > 0) {
        const hasDelinquent = result.tax_history.some(
            (t) => t.status.toUpperCase() === "DELINQUENT"
        ) || paymentData.hasPriorDelinquency;

        result.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        const latestTax = result.tax_history[result.tax_history.length - 1];
        const latestYearRecords = result.tax_history.filter(t => String(t.year) === String(latestTax.year));

        const inst1 = latestYearRecords[0];
        const inst2 = latestYearRecords[1];

        const status1 = inst1 ? inst1.status : "UNKNOWN";
        const status2 = inst2 ? inst2.status : "UNKNOWN";

        const hasPriorDelinquent = result.tax_history.some(
            (t) => t.status.toUpperCase() === "DELINQUENT" && String(t.year) !== String(latestTax.year)
        ) || paymentData.hasPriorDelinquency;

        const keys = hasPriorDelinquent ? 0 : 1;
        result.notes = generate_notes(latestTax.year, keys, status1, status2);
    } else {
        result.notes = "NO TAX HISTORY FOUND, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 03/02 AND 07/20";
    }

    return result;
}

// -------------------------------------------------------------
// MAIN ORCHESTRATOR
// -------------------------------------------------------------
const account_search = async (page, url, accountNumber) => {
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", ...timeout_option });

        await searchAccountNumber(accountNumber, page);
        const propertySummary = await getDetails(page);
        const paymentDetails = await getPaymentDetails(page);

        const result = populateObject(propertySummary, paymentDetails, accountNumber);
        return result;

    } catch (error) {
        console.error("Error inside account_search:", error);
        throw new Error(error.message);
    }
};

// -------------------------------------------------------------
// EXPRESS HANDLER
// -------------------------------------------------------------
const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    if (account) {
        account = String(account).trim();
    }

    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render("error_data", {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://treapropsearch.franklincountyohio.gov/";

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36");
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["font", "image"].includes(req.resourceType())) {
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
                    res.status(200).render("error_data", {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        } else if (fetch_type === "api") {
            account_search(page, url, account)
                .then((data) => {
                    res.status(200).json({ result: data });
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
        if (fetch_type === "html") {
            res.status(200).render("error_data", {
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