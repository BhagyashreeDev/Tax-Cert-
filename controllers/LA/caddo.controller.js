// Author:- Bhagyashree Badadal

// This county is similar to starr.controller.js(multi-county) of TX

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000,
};

// for due and delinquent dates
function getTaxDates(year) {
    const nextYear = Number(year) + 1;
    return {
        due_date: `12/31/${year}`,
        delq_date: `01/01/${nextYear}`,
    };
}

// for currency formatting
const formatCurrency = (amount) => {
    if (!amount || amount === "N/A" || amount === "-") return "$0.00";
    let num = String(amount).replace(/[$,]/g, "").trim();
    if (isNaN(num) || num === "") return "$0.00";
    let formatted = parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return "$" + formatted;
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
        taxing_authority: "Caddo Parish Sheriff's Office – Tax Division, 501 Texas Street, Room 101, Shreveport, LA 71101",
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

// generating notes
const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID, ${year} `
                : `PRIORS ARE DELINQUENT, ${year} `;
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        const dates = getTaxDates(year);
        notes += ` NORMAL DUE DATE IS ${dates.due_date.substring(0, 5)}`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// get owner_name, location, due
async function scrapePropertyInfo(page) {
    await page.waitForSelector("span.boldresult");
    const info = await page.evaluate(() => {
        const dataRow = document.querySelector("span.boldresult")?.closest("tr");
        if (!dataRow) {
            return { accountNo: "", ownerName: "", locationAddress: "", dueAmount: "" };
        }
        return {
            accountNo:
                dataRow.querySelector("td:nth-child(3)")?.textContent?.trim() || "",
            ownerName:
                dataRow.querySelector("td:nth-child(4)")?.textContent?.trim() || "",
            locationAddress:
                dataRow.querySelector("td:nth-child(5)")?.textContent?.trim() || "",
            dueAmount:
                dataRow.querySelector("td:nth-child(6)")?.textContent?.trim() || ""
        };
    });
    return info;
}

// scrape first table if exists, return assessed_value, year, base, due
async function scrapeCurrentTaxes(page) {
    const currentTable1 = await page
        .$("#etaxTemplateForm\\:current1")
        .catch(() => null);
    // if the first table does not exists 
    if (!currentTable1) {
        return { rows: [], totalAssessedValue: "N/A", totalTaxableValue: "N/A" };
    }

    // if the first table exists then fetch year, base, due
    const rows = await page.evaluate(() => {
        const trs = document.querySelectorAll(
            "#etaxTemplateForm\\:current1 tbody tr",
        );
        return [...trs].map((row) => ({
            year: row.querySelector('[id$="year1"]')?.textContent?.trim() || "",
            base: row.querySelector('[id$="taxesDue1"]')?.textContent?.trim() || "",
            total: row.querySelector('[id$="totalDue1"]')?.textContent?.trim() || "",
        }));
    });

    let details = { totalAssessedValue: "N/A", totalTaxableValue: "N/A" };

    // to fetch assessed value
    if (rows.length > 0) {
        try {
            details = await scrapeCurrentTaxDetails(page);
        } catch (error) { }
    }

    return { rows, ...details };
}

// return assessed value that we will get from first table
async function scrapeCurrentTaxDetails(page) {
    await page.waitForSelector("#etaxTemplateForm\\:current1\\:0\\:year1");
    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null),
        page.click("#etaxTemplateForm\\:current1\\:0\\:year1"),
    ]);

    await page.waitForSelector("#etaxTemplateForm\\:entities1");
    const values = await page.evaluate(() => {
        let taxable = document
            .querySelector("#etaxTemplateForm\\:entities1\\:0\\:netTaxableValue1")
            ?.textContent?.trim();
        if (!taxable) {
            taxable = document
                .querySelector('[id*="netTaxableValue"]')
                ?.textContent?.trim();
        }
        if (!taxable) {
            return {
                totalAssessedValue: "N/A",
                totalTaxableValue: "N/A",
            };
        }
        if (parseFloat(taxable) === 0) {
            return {
                totalAssessedValue: "$0.00",
                totalTaxableValue: "$0.00",
            };
        }
        return {
            totalAssessedValue: taxable,
            totalTaxableValue: taxable,
        };
    });
    await page.goBack({ waitUntil: "networkidle2" });
    return values;
}

// scrape second table (delinquent table)
async function scrapeDelinquentTaxes(page) {
    const currentTable2 = await page
        .$("#etaxTemplateForm\\:delinquent1")
        .catch(() => null);
    if (!currentTable2) {
        return [];
    }
    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }),
        page.click("#etaxTemplateForm\\:delinquent1\\:0\\:year2"),
    ]);
    const delinquentTable = await page.$("#etaxTemplateForm\\:delinquent1");
    let rows = [];
    if (delinquentTable) {
        rows = await page.evaluate(() => {
            const trs = document.querySelectorAll(
                "#etaxTemplateForm\\:delinquent1 tbody tr",
            );
            return [...trs].map((row) => ({
                year: row.querySelector('[id$="year1"]')?.textContent?.trim() || "",
                baseDue:
                    row.querySelector('[id$="taxesDue1"]')?.textContent?.trim() || "",
                totalDue:
                    row.querySelector('[id$="totalDue1"]')?.textContent?.trim() || "",
            }));
        });
    }
    await page.goBack({ waitUntil: "networkidle2" });
    return rows;
}

const ac_1 = (page, url) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "networkidle2" });
            resolve(true);
        } catch (error) {
            reject(new Error("Navigation Unsuccessful"));
        }
    });
};

const ac_2 = (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // selecting frame
            const frameElement = await page.waitForSelector('iframe[src*="/cart/entry-cart.jsp"]');
            const frame = await frameElement.contentFrame();
            if (!frame) throw new Error("[search] Could not access iframe content frame");

            // select the input box and type
            const inputSelector = "input[name='criteria.id']";
            await frame.waitForSelector(inputSelector, { visible: true });
            await frame.type(inputSelector, account);
            const searchSelector = 'input[name="criteria.id"] ~ input[type="submit"]';

            // click on search and go to new url page
            await Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle2" }),
                frame.click(searchSelector),
            ]);

            // parse owner_name, location, parcel_ID, due
            const propertyInfo = await scrapePropertyInfo(page);

            const result = createPropertyObject();
            result.owner_name = propertyInfo.ownerName
                ? [propertyInfo.ownerName]
                : ["N/A"];
            result.property_address = propertyInfo.locationAddress || "N/A";
            result.parcel_number = propertyInfo.accountNo;


            const accountNumberSelector =
                "span.boldresult a[href*='doShowAccountPage']";
            await page
                .waitForSelector(accountNumberSelector, {
                    visible: true,
                    timeout: 15000,
                })
                .catch(() => {
                    throw new Error(
                        `Account ${account} actually not found on main page.`,
                    );
                });
            // click on account number link    
            await Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null),
                page.click(accountNumberSelector),
            ]);
            resolve(result);
        } catch (error) {
            reject(new Error("Record not found"));
        }
    });
};

async function goToReceipts(page) {
    const receiptSelector = "#etaxTemplateForm\\:text72";
    await page.waitForSelector(receiptSelector, { visible: true, timeout: 15000 });

    // Click the receipt link and allow time for rendering
    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null),
        page.click(receiptSelector),
    ]);

    // Add a safe timeout option to see if the table appears
    try {
        await page.waitForSelector("#etaxTemplateForm\\:tableEx1", { visible: true, timeout: 15000 });
    } catch (e) {
        console.log("Receipts table did not appear or account has no receipt history.");
        // Make sure to navigate back even if the element is missing!
        await page.goBack({ waitUntil: "networkidle2" }).catch(() => null);
        return null;
    }

    const receiptTable = await page.$("#etaxTemplateForm\\:tableEx1").catch(() => null);
    if (!receiptTable) {
        await page.goBack({ waitUntil: "networkidle2" }).catch(() => null);
        return null;
    }

    const firstRow = await page.evaluate(() => {
        const cells = document.querySelectorAll("#etaxTemplateForm\\:tableEx1 tbody tr:first-child td");
        if (cells.length === 0) return null;
        return {
            year: cells[1]?.textContent?.trim() || "",
            payment_date: cells[2]?.textContent?.trim() || "",
            payment_amount: cells[3]?.textContent?.trim() || ""
        };
    });

    // Go back to the main page so the rest of the script can execute safely
    await page.goBack({ waitUntil: "networkidle2" }).catch(() => null);

    if (!firstRow) return null;

    const record = createTaxHistory();
    record.year = firstRow.year;
    record.base_amount = formatCurrency(firstRow.payment_amount);
    record.amount_paid = formatCurrency(firstRow.payment_amount);
    record.paid_date = firstRow.payment_date ? firstRow.payment_date : "";
    record.status = "Paid";
    record.amount_due = "$0.00";

    const dates = getTaxDates(firstRow.year);
    record.due_date = dates.due_date;
    record.delq_date = dates.delq_date;

    return record;
}

const ac_3 = (page, result) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Scraping the first table
            const taxData = await scrapeCurrentTaxes(page);

            result.total_assessed_value = taxData.totalAssessedValue;
            result.total_taxable_value = taxData.totalTaxableValue;

            // for the data we got from first table, either go to receipts(paid) or they might be delinquent
            for (const tax of taxData.rows) {
                const totalDue =
                    parseFloat(String(tax.total).replace(/[$,]/g, "")) || 0;

                // if you have no due then go to Receipts link as it might be paid
                if (totalDue === 0) {
                    const receiptRecord = await goToReceipts(page);
                    if (receiptRecord !== null) {
                      result.tax_history.push(receiptRecord);
                    }
                }
                // either you have second table(which means it can be delinquent) 
                else {
                    const record = createTaxHistory();
                    record.year = tax.year;
                    const dates = getTaxDates(tax.year);
                    record.due_date = dates.due_date;
                    record.delq_date = dates.delq_date;
                    record.base_amount = formatCurrency(tax.base);
                    record.amount_due = formatCurrency(tax.total);
                    const today = new Date();
                    const dueDateObj = new Date(record.due_date);
                    if (today <= dueDateObj) {
                        record.status = "Due";
                    } else {
                        record.status = "Delinquent";
                    }
                    record.amount_paid = "$0.00";
                    record.payment_type = "Annual";
                    record.paid_date = "";
                    result.tax_history.push(record);
                }
            }

            // scrape second table
            const delinquentRows = await scrapeDelinquentTaxes(page);

            // if we have data in second table
            for (const tax of delinquentRows) {
                let record = result.tax_history.find((t) => t.year === tax.year);
                if (!record) {
                    record = createTaxHistory();
                    record.year = tax.year;
                    result.tax_history.push(record);
                }
                const dates = getTaxDates(tax.year);
                record.payment_type = "Annual";
                record.status = "Delinquent";
                record.base_amount = formatCurrency(tax.baseDue);
                record.amount_paid = "$0.00";
                record.amount_due = formatCurrency(tax.totalDue);
                record.due_date = dates.due_date;
                record.delq_date = dates.delq_date;
                record.paid_date = "";
            }

            // if dont have first table and second table, then check receipts it might have some data
            if ((!taxData.rows || taxData.rows.length === 0) && (!delinquentRows || delinquentRows.length === 0)) {
                const receiptRecord = await goToReceipts(page);
                if (receiptRecord !== null) {
                    result.tax_history.push(receiptRecord);
                }
            }

            // Filter out old "Paid" records BEFORE sorting and notes generation
            if (result.tax_history.length > 0) {
                // Find the most recent year in the array
                const latestYear = Math.max(...result.tax_history.map(t => parseInt(t.year, 10) || 0));
                result.tax_history = result.tax_history.filter(record => {
                    const recordYear = parseInt(record.year, 10) || 0;
                    // If it's Paid, keep it ONLY if it's the latest year
                    if (record.status === "Paid") {
                        return recordYear === latestYear;
                    }
                    // Keep all other statuses (Delinquent, Due, etc.)
                    return true;
                });
            }

            // sort the tax history
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
                // Check if ANY tax is delinquent for the main delinquency flag
                const hasDelinquent = result.tax_history.some(
                    (t) => t.status === "Delinquent",
                );
                result.delinquent = hasDelinquent
                    ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                    : "NONE";

                // Get the latest tax record (the array is sorted ascending by year)
                const latestTax = result.tax_history[result.tax_history.length - 1];

                // Check if any PRIOR year is delinquent (exclude the latest year)
                const hasPriorDelinquent = result.tax_history.some(
                    (t) => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
                );

                // If priors are delinquent, keys = 0. If priors are paid, keys = 1.
                const keys = hasPriorDelinquent ? 0 : 1;

                result.notes = generate_notes(latestTax.year, keys, latestTax.status);
            }

            if (result.tax_history.length === 0) {
                result.tax_history = ["N/A"];
            }
            resolve(result);
        } catch (error) {
            reject(new Error(error.message));
        }
    });
};

const account_search = async (page, url, account) => {
    try {
        // Going to the URL
        await ac_1(page, url);
        // Get owner_name, location, due and then click on parcel-ID link
        const result = await ac_2(page, account);
        const finalData = await ac_3(page, result);
        return finalData;
    } catch (error) {
        throw new Error(error.message);
    }
};

// Main controller function
const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    try {
        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://caddosheriff.go2gov.net/caddo/tax/faces/search.jsp";

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
            // FRONTEND ENDPOINT
            account_search(page, url, account)
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
                    try {
                        await context.close();
                    } catch (error) {
                        console.log(error);
                    }
                });
        } else if (fetch_type == "api") {
            // API ENDPOINT
            account_search(page, url, account, county)
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
                    try {
                        await context.close();
                    } catch (error) {
                        console.log(error);
                    }
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

