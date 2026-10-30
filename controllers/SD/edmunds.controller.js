// Author:- Bhagyashree Badadal

// search by parcel-ID

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
        total_assessed_value: "N/A",
        exemption: "",
        total_taxable_value: "N/A",
        delinquent: "NONE",
        taxing_authority: "Edmunds County Treasurer, 210 2nd Ave Ste 204, Ipswich, SD 57451",
        notes: "",
        tax_history: []
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

// for generating notes
const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${status.toUpperCase()}, 2ND INSTALLMENT IS ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE 01/01 AND 11/01`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// get all property related data
async function getData(page) {
    await page.waitForSelector("#mainPage");

    const propertyData = await page.evaluate(() => {

        const findTableByHeader = (headerText) => {
            const thElements = Array.from(document.querySelectorAll("th"));
            const targetTh = thElements.find(th => th.textContent.includes(headerText));
            return targetTh ? targetTh.closest("table") : null;
        };

        // 1. Get Property Address
        // It's in the first table ("Edmunds County, SD - Property Report")
        let address = "N/A";
        const mainTable = document.querySelector("table");
        if (mainTable) {
            // The address is in the second column (index 1) of the first row of tbody
            const cells = mainTable.querySelectorAll("tbody tr td");
            if (cells.length > 1) {
                address = cells[1].innerText.trim();
            }
        }

        // 2. Get Owner Name
        // It's in the "Owner Information" table
        let ownerName = "N/A";
        const ownerTable = findTableByHeader("Owner Information");
        if (ownerTable) {
            // The owner name is in the first row of tbody, second column
            const ownerCell = ownerTable.querySelector("tbody tr td:nth-child(2)");
            if (ownerCell) {
                ownerName = ownerCell.innerText.trim();
            }
        }

        // 3. Get Total Assessed Value
        // It's in the "Total Assessed Values" table
        let assessedValue = "N/A";
        const assessedTable = findTableByHeader("Total Assessed Values");
        if (assessedTable) {
            // It's in the last column (4th) of the first row of tbody
            const cells = assessedTable.querySelectorAll("tbody tr td");
            if (cells.length >= 4) {
                assessedValue = cells[3].innerText.trim();
            }
        }

        // 4. Get Taxes Payable Table Data
        const taxesData = [];
        const taxesTable = findTableByHeader("Taxes Payable");
        if (taxesTable) {
            const rows = taxesTable.querySelectorAll("tbody tr");
            rows.forEach(row => {
                const cells = row.querySelectorAll("td");
                if (cells.length === 4) {
                    taxesData.push({
                        yearDue: cells[0].innerText.trim(),
                        owner: cells[1].innerText.trim(),
                        address: cells[2].innerText.trim(),
                        totalTax: cells[3].innerText.trim()
                    });
                }
            });

            return {
                address, ownerName, assessedValue, taxesPayable: taxesData
            };
        }
    });
    return propertyData;
}

// populate the obtained data into the format
async function populateData(page, propertyData) {
    // main result object
    const result = createPropertyObject();
    result.owner_name = propertyData.ownerName ? [propertyData.ownerName] : ["N/A"];
    result.property_address = propertyData.address ? propertyData.address : "N/A";
    result.total_assessed_value = propertyData.assessedValue;
    result.total_taxable_value = propertyData.assessedValue;

    const today = new Date();
    // creating record for each item
    for (const item of propertyData.taxesPayable) {
        // Remove '$' and ',' from the string, convert to Float, divide by 2
        const rawTax = parseFloat(item.totalTax.replace(/[$,]/g, ""));
        const installmentValue = isNaN(rawTax) ? 0 : rawTax / 2;
        // Format back to currency string
        const formattedInstallment = `$${installmentValue.toFixed(2)}`;

        // Loop explicitly for the 2 installments
        for (let i = 1; i <= 2; i++) {
            // Create a NEW object for EACH installment inside the loop
            const record = createTaxHistory();
            record.year = item.yearDue;
            record.payment_type = `Installment ${i}`;
            record.amount_paid = "$0.00";
            record.base_amount = formattedInstallment;
            record.amount_due = formattedInstallment;

            record.due_date = `01/01/${record.year}`;
            record.delq_date = i === 1 ? `05/01/${record.year}` : `11/01/${record.year}`;

            // Calculate status specifically for this installment's dates
            const dueDateObj = new Date(record.due_date);
            if (today <= dueDateObj) {
                record.status = "Due";
            } else {
                record.status = "Delinquent";
            }

            // Push the unique installment record exactly once
            result.tax_history.push(record);
        }
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

    // deciding delinquency and notes
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

    return result;
}

const account_search = async (page, url, accountNumber) => {
    try {
        // 1. Directly going to the property-info page (bypassing search)
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // Handle disclaimer
        // await page.locator('button ::-p-text(Agree)').click();

        // await page.goto(
        //     `https://www.1stdistrict.org/Edmunds_PropertyCard_TS/Default.aspx?pin=${accountNumber}&isTinyScreen=false&isDesktop=true`,
        //     { waitUntil: "networkidle2" }
        // );

        // 2. Get all the property data
        const propertyData = await getData(page);

        // 3. Populate the obtained data inside objects
        const result = await populateData(page, propertyData);

        // 4. Assign parcel_number
        result.parcel_number = accountNumber;

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

        // const url = "https://www.1stdistrict.org/edmundsts/#";
        const url = `https://www.1stdistrict.org/Edmunds_PropertyCard_TS/Default.aspx?pin=${account}&isTinyScreen=false&isDesktop=true`

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