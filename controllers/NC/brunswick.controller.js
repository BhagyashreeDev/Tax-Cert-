// Author:- Bhagyashree Badadal

// Brunswick County Parcel ID Search Controller

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
        taxing_authority: "Brunswick County Tax Administrator, 30 Government Center Dr NE, PO Box 249, Bolivia, NC 28422",
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
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} TAXES ARE ${(status).toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        notes += ` NORMAL DUE DATE IS 09/01`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

function determineStatus(record) {
    const cleanAmount = (val) => Number(String(val).replace(/[^0-9.-]/g, "")) || 0;

    if (cleanAmount(record.amount_due) === 0) {
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
// STEP 1 – SEARCH BY PARCEL ID ON BASIC SEARCH
// -------------------------------------------------------------
async function searchAccountNumber(accountNumber, page) {
    await page.waitForSelector("#searchType", timeout_option);
    await page.select("#searchType", "ParcelNumber");

    await page.click("#select-search-type");

    await page.waitForSelector("#search-by-parcel", timeout_option);

    await page.evaluate((account) => {
        const hiddenInput = document.querySelector("#ParcelNumber");
        if (hiddenInput) hiddenInput.value = account;

        const parcelInput = document.querySelector("#PARCEL");
        if (parcelInput) {
            parcelInput.value = account;
            parcelInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }, accountNumber);

    await page.click("#search-by-parcel");

    await page.waitForSelector("#BasicSearch tbody tr", timeout_option);
}

// -------------------------------------------------------------
// STEP 2 – SELECT LATEST ROW AND EXTRACT PROPERTY DETAILS
// -------------------------------------------------------------
async function getDetails(page, accountNumber) {
    // 1. Identify row with the highest Tax Year matching our exact parcel
    const targetRowId = await page.evaluate((targetParcel) => {
        const rows = Array.from(document.querySelectorAll("#BasicSearch tbody tr"));
        let maxYear = 0;
        let bestId = null;

        for (const row of rows) {
            const cellParcel = row.cells[4]?.innerText?.trim() || "";
            if (cellParcel.toUpperCase() === targetParcel.toUpperCase()) {
                const yr = parseInt(row.cells[6]?.innerText?.trim() || "0", 10);
                if (yr > maxYear) {
                    maxYear = yr;
                    bestId = row.id;
                }
            }
        }
        return bestId;
    }, accountNumber);

    if (targetRowId) {
        // Click row via DOM dispatch to guarantee it triggers
        await page.evaluate((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.scrollIntoView({ block: "center" });
                el.click();
            }
        }, targetRowId);

        await page.waitForFunction(() => {
            return document.querySelectorAll("#view-item-partial fieldset").length > 0;
        }, { timeout: 10000 }).catch(() => null);
    }

    // 2. Extract details from page and #view-item-partial
    const propertyData = await page.evaluate((targetRowId) => {
        const getText = (el) => (el ? el.innerText.trim() : "");

        let ownerNames = [];
        let address = "";

        // Read primary and co-owner directly from selected table row
        if (targetRowId) {
            const row = document.getElementById(targetRowId);
            if (row) {
                const o1 = getText(row.cells[0]);
                const o2 = getText(row.cells[1]);
                if (o1) ownerNames.push(o1);
                if (o2) ownerNames.push(o2);
                address = getText(row.cells[2]);
            }
        }

        // If owners not extracted from table, fallback to Owner Information fieldset
        if (ownerNames.length === 0) {
            const fieldsets = Array.from(document.querySelectorAll("#view-item-partial fieldset"));
            for (const fs of fieldsets) {
                const legend = getText(fs.querySelector("legend"));
                if (legend.includes("Owner Information")) {
                    const lis = Array.from(fs.querySelectorAll("ol li"))
                        .map(li => getText(li))
                        .filter(Boolean);

                    for (const line of lis) {
                        if (!line.match(/[A-Z]{2}\s+\d{5}/)) {
                            ownerNames.push(line);
                        }
                    }
                }
            }
        }

        // Parse Property Values fieldset if present in BasicSearch
        let landValue = "";
        let buildingValue = 0;
        let obxfValue = 0;
        let totalAssessed = "";
        let exemption = "";

        const fieldsets = Array.from(document.querySelectorAll("#view-item-partial fieldset"));
        for (const fs of fieldsets) {
            const legend = getText(fs.querySelector("legend"));
            if (legend.includes("Property Values")) {
                const lis = Array.from(fs.querySelectorAll("ol li"));
                for (const li of lis) {
                    const label = getText(li.querySelector(".info-row-label"));
                    const val = getText(li.querySelector(".info-row-text"));

                    if (label.includes("Land")) {
                        landValue = val;
                    } else if (label.includes("Building")) {
                        buildingValue = Number(val.replace(/[^0-9.-]/g, "")) || 0;
                    } else if (label.includes("Obxf")) {
                        obxfValue = Number(val.replace(/[^0-9.-]/g, "")) || 0;
                    } else if (label.includes("Market")) {
                        totalAssessed = val;
                    } else if (label.includes("Exemption")) {
                        exemption = val;
                    }
                }
            }
        }

        const improvements = buildingValue + obxfValue;

        return {
            owners: ownerNames,
            address: address,
            landValue: landValue,
            improvements: improvements,
            totalAssessedValue: totalAssessed,
            exemption: exemption,
            totalTaxableValue: totalAssessed,
        };
    }, targetRowId);

    return propertyData;
}

// -------------------------------------------------------------
// STEP 3 – EXTRACT TAX BILLS, PAYMENT HISTORY & ASSESSED VALUES
// -------------------------------------------------------------
async function getPaymentDetails(page, accountNumber) {
    const taxBillUrl = `https://tax.brunsco.net/itsnet/TaxBillSearch/Parcel?id=${encodeURIComponent(accountNumber)}`;
    await page.goto(taxBillUrl, { waitUntil: "domcontentloaded", ...timeout_option });

    await page.waitForSelector("#TaxBillSearch tbody tr", timeout_option);

    // Read all bill rows from the table
    const bills = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("#TaxBillSearch tbody tr"));
        return rows.map((row) => {
            const cells = row.cells;
            return {
                id: row.id,
                year: cells[0]?.innerText?.trim() || "",
                billNumber: cells[1]?.innerText?.trim() || "",
                accountNumber: cells[2]?.innerText?.trim() || "",
                ownerName: cells[3]?.innerText?.trim() || "",
                baseAmount: cells[4]?.innerText?.trim() || "0.00",
                balance: cells[5]?.innerText?.trim() || "0.00",
            };
        }).filter(b => Boolean(b.year && !isNaN(parseInt(b.year, 10))));
    });

    // Group bills by tax year
    const yearMap = new Map();
    for (const b of bills) {
        const yr = parseInt(b.year, 10);
        if (!yearMap.has(yr)) {
            yearMap.set(yr, []);
        }
        yearMap.get(yr).push(b);
    }

    // Sort years descending (newest first)
    const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b - a);

    let isFirstValidYear = true;
    const taxHistoryRecords = [];
    let hasPriorDelinquency = false;
    let assessedValues = null;

    for (const yr of sortedYears) {
        const yearBills = yearMap.get(yr);

        const recordsForYear = [];
        for (const bill of yearBills) {
            const record = createTaxHistory();
            record.year = String(yr);
            record.payment_type = "Annual";

            const baseNum = Number(bill.baseAmount.replace(/[^0-9.-]/g, "")) || 0;
            const dueNum = Number(bill.balance.replace(/[^0-9.-]/g, "")) || 0;
            const paidNum = Math.max(0, baseNum - dueNum);

            record.base_amount = `$${baseNum.toFixed(2)}`;
            record.amount_due = `$${dueNum.toFixed(2)}`;
            record.amount_paid = `$${paidNum.toFixed(2)}`;

            // Statutory North Carolina Due Dates
            record.due_date = `09/01/${yr}`;
            record.delq_date = `01/06/${yr + 1}`;

            // Load bill detail card via DOM click if this is the newest year (for values) OR bill is paid (for payment date)
            if (isFirstValidYear || (dueNum === 0 && bill.id)) {
                try {
                    // Click row via DOM dispatch to bypass viewport scrolling issues
                    await page.evaluate((id) => {
                        const el = document.getElementById(id);
                        if (el) {
                            el.scrollIntoView({ block: "center" });
                            el.click();
                        }
                    }, bill.id);

                    // Wait explicitly for #view-item-partial to load this specific bill's details
                    const billTag = `${bill.year}-${bill.billNumber}`;
                    await page.waitForFunction((tag) => {
                        const el = document.querySelector("#view-item-partial");
                        return el && el.innerText.includes(tag);
                    }, { timeout: 15000 }, billTag);

                    // Extract assessed values from the newest bill
                    if (isFirstValidYear && !assessedValues) {
                        assessedValues = await page.evaluate(() => {
                            const getText = (el) => (el ? el.innerText.trim() : "");
                            let landValue = "";
                            let buildingValue = 0;
                            let outbuildingValue = 0;
                            let totalAssessed = "";
                            let exemption = "";
                            let taxableValue = "";

                            const fieldsets = Array.from(document.querySelectorAll("#view-item-partial fieldset"));
                            for (const fs of fieldsets) {
                                const legend = getText(fs.querySelector("legend"));

                                if (legend.includes("Taxable Values")) {
                                    const lis = Array.from(fs.querySelectorAll("ol li"));
                                    for (const li of lis) {
                                        const lbl = getText(li.querySelector(".info-row-label"));
                                        const val = getText(li.querySelector(".info-row-text"));

                                        if (lbl.includes("Building Value")) {
                                            buildingValue = Number(val.replace(/[^0-9.-]/g, "")) || 0;
                                        } else if (lbl.includes("Outbuilding Value")) {
                                            outbuildingValue = Number(val.replace(/[^0-9.-]/g, "")) || 0;
                                        } else if (lbl.includes("Land Value")) {
                                            landValue = val;
                                        } else if (lbl.includes("Parcel Value Total")) {
                                            totalAssessed = val;
                                        } else if (lbl.includes("Taxable Value")) {
                                            taxableValue = val;
                                        }
                                    }
                                }

                                if (legend.includes("Balance Info")) {
                                    const lis = Array.from(fs.querySelectorAll("ol li"));
                                    for (const li of lis) {
                                        const lbl = getText(li.querySelector(".info-row-label"));
                                        const val = getText(li.querySelector(".info-row-text"));

                                        if (lbl.includes("Exemption")) {
                                            exemption = val;
                                        } else if (lbl.includes("Total Valuation") && !totalAssessed) {
                                            totalAssessed = val;
                                        } else if (lbl.includes("Net Taxable Valuation") && !taxableValue) {
                                            taxableValue = val;
                                        }
                                    }
                                }
                            }

                            const improvements = buildingValue + outbuildingValue;

                            return {
                                landValue,
                                improvements,
                                totalAssessedValue: totalAssessed,
                                exemption: exemption || "0",
                                totalTaxableValue: taxableValue || totalAssessed,
                            };
                        });
                    }

                    // Extract paid date from Balance Info
                    const paidDate = await page.evaluate(() => {
                        const lis = Array.from(document.querySelectorAll("#view-item-partial fieldset ol li"));
                        for (const li of lis) {
                            const lbl = li.querySelector(".info-row-label")?.innerText || "";
                            if (lbl.includes("Last Payment Date")) {
                                return li.querySelector(".info-row-text")?.innerText?.trim() || "";
                            }
                        }
                        return "";
                    });

                    if (paidDate) {
                        record.paid_date = paidDate;
                    }
                } catch (e) {
                    // Non-fatal if row detail fails
                }
            }

            determineStatus(record);
            recordsForYear.push(record);
        }

        const isYearPaid = recordsForYear.every(r => r.status.toUpperCase() === "PAID");

        // Tax History Inclusion Rule:
        // 1. Insert recent year paid data.
        // 2. If recent year is unpaid, check priors backwards until first paid year is reached,
        //    and do NOT add that paid year.
        if (isFirstValidYear) {
            isFirstValidYear = false;
            taxHistoryRecords.push(...recordsForYear);
            if (isYearPaid) {
                // Recent year is paid: stop immediately
                break;
            }
        } else {
            // Looking at prior year because recent year was unpaid
            if (!isYearPaid) {
                taxHistoryRecords.push(...recordsForYear);
                hasPriorDelinquency = true;
            } else {
                // First paid prior year reached: DO NOT add it, stop!
                break;
            }
        }
    }

    return {
        taxHistoryRecords,
        hasPriorDelinquency,
        assessedValues,
    };
}

// -------------------------------------------------------------
// STEP 4 – POPULATE AND NORMALIZE OBJECT
// -------------------------------------------------------------
function formatCurrency(val) {
    if (val === undefined || val === null || val === "") return "$0.00";
    const cleaned = String(val).replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? "$0.00" : `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function populateObject(summary, paymentData, accountNumber) {
    const result = createPropertyObject();

    result.owner_name = summary.owners;
    result.property_address = summary.address;
    result.parcel_number = accountNumber;

    // Use official assessed values from Tax Bill page, fallback to summary
    const values = paymentData.assessedValues || {};
    result.total_assessed_value = formatCurrency(values.totalAssessedValue || summary.totalAssessedValue);
    result.total_taxable_value = formatCurrency(values.totalTaxableValue || summary.totalTaxableValue);

    result.tax_history = paymentData.taxHistoryRecords;

    // Sort history by year ascending
    result.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        return yearA - yearB;
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

        const hasPriorDelinquent = result.tax_history.some(
            (t) => t.status.toUpperCase() === "DELINQUENT" && String(t.year) !== String(latestTax.year)
        ) || paymentData.hasPriorDelinquency;

        const keys = hasPriorDelinquent ? 0 : 1;
        result.notes = generate_notes(latestTax.year, keys, latestTax.status);
    } else {
        result.notes = "NO TAX HISTORY FOUND, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 09/01";
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
        const propertySummary = await getDetails(page, accountNumber);
        const paymentDetails = await getPaymentDetails(page, accountNumber);

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

        const url = "https://tax.brunsco.net/itsnet/";

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
