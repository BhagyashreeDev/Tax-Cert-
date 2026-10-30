// Author :- Bhagyashree Badadal

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "holmes": {
        url: "https://www.holmescountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Holmes County Tax Collector, 201 N Oklahoma Street, Bonifay, FL 32425"
    },
    "jefferson": {
        url: "https://www.jeffersoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Jefferson County Tax Collector, 450 W Walnut Street, Monticello, FL 32344"
    },
    "washington": {
        url: "https://www.washingtoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=true",
        auth: "Washington County Tax Collector, 1331 South Boulevard, Chipley, FL 32428"
    },
    "baker": {
        url: "https://www.bakertaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Baker County Tax Collector, 32 W Macclenny Avenue, Macclenny, FL 32063"
    },
    "bradford": {
        url: "https://www.bradfordtaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Bradford County Tax Collector, 945 North Temple Avenue, Starke, FL 32091"
    },
    "gulf": {
        url: "https://www.gulfcountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Gulf County Tax Collector, 1000 Cecil G. Costin Sr. Boulevard, Port St. Joe, FL 32456"
    },
    "liberty": {
        url: "https://www.libertycountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Liberty County Tax Collector, 10818 NW State Road 20, Bristol, FL 32321"
    },
    "madison": {
        url: "https://www.madisoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Madison County Tax Collector, 125 SW Range Avenue, Madison, FL 32340"
    },
    "glades": {
        url: "https://www.mygladescountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Glades County Tax Collector, 500 Avenue J, Moore Haven, FL 33471"
    },
    "hardee": {
        url: "https://www.hardeecountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Hardee County Tax Collector, 412 West Orange Street, Wauchula, FL 33873"
    },
    "desoto": {
        url: "https://www.desotocountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "DeSoto County Tax Collector, 201 East Oak Street, Arcadia, FL 34266"
    },
    "jackson": {
        url: "https://www.jacksoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Jackson County Tax Collector, 4445 Lafayette Street, Marianna, FL 32446"
    },
    "okeechobee": {
        url: "https://okeechobeecountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Okeechobee County Tax Collector, 409 NW 2nd Avenue, Okeechobee, FL 34972"
    },
    "wakulla": {
        url: "https://www.wakullacountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Wakulla County Tax Collector, 3115 Crawfordville Highway, Crawfordville, FL 32327"
    },
    "franklin": {
        url: "https://www.franklincountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Franklin County Tax Collector, 33 Market Street, Suite 202, Apalachicola, FL 32320"
    },
    "hamilton": {
        url: "https://www.hamiltoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Hamilton County Tax Collector, 207 NE 1st Street, Jasper, FL 32052"
    },
    "calhoun": {
        url: "https://www.calhouncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Calhoun County Tax Collector, 20859 Central Avenue East, Blountstown, FL 32424"
    },
    "union": {
        url: "https://www.unioncountytc.com/Property/SearchSelect?Accept=true&ClearData=True",
        auth: "Union County Tax Collector, 55 West Main Street, Lake Butler, FL 32054"
    }
};

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

// search for account number
async function searchAccountNumber(accountNumber, page) {
    await page.waitForSelector("#propertynumber", timeout_option);
    await page.type("#propertynumber", accountNumber);

    await page.waitForSelector("#search", timeout_option);
    await Promise.all([
        page.waitForNavigation(),
        page.click("#search")
    ]);

    // Selector targets the last <tr> in the table body and grabs the property link anchor
    const lastRowPropertyLink = '#filter-results-table tbody tr:last-child td.tax-detail-link a';
    await page.waitForSelector(lastRowPropertyLink);

    await page.click(lastRowPropertyLink);

    page.once('dialog', async dialog => {
        await dialog.accept();
    });
}

// get all the details
async function getDetails(page) {

    await page.waitForSelector("#ctl00_ContentPlaceHolder1_lblName", timeout_option);
    const ownerName = await page.$eval("#ctl00_ContentPlaceHolder1_lblName", el => el.textContent.trim());
   
    await page.waitForSelector("#ctl00_ContentPlaceHolder1_lblPropertyAddress", timeout_option);
    const propertyAddress = await page.$eval("#ctl00_ContentPlaceHolder1_lblPropertyAddress", el => el.textContent.trim());

    const tableElement = await page.$("#Table3");

    // if we dont have delinquent table then we dont have "#Table 3" selector
    if (!tableElement) {
        await page.waitForSelector("#ctl00_ContentPlaceHolder1_lblGrossTaxValue", timeout_option);
        const assessedValue = await page.$eval("#ctl00_ContentPlaceHolder1_lblGrossTaxValue", el => el.textContent.trim());
    
        await page.waitForSelector("#ctl00_ContentPlaceHolder1_lblCoNetTaxValue", timeout_option);
        const taxableValue = await page.$eval("#ctl00_ContentPlaceHolder1_lblCoNetTaxValue", el => el.textContent.trim());

        await page.waitForSelector("#ctl00_ContentPlaceHolder1_plCert", timeout_option);

        const extractionResult = await page.evaluate(() => {
            const headers = Array.from(document.querySelectorAll('.HdHeaderBk'));
            const isPaid = headers.some(header => header.textContent.includes('** PAID **'));

            if (isPaid) return null;

            const container = document.querySelector("#ctl00_ContentPlaceHolder1_plCert");
            const table = container.querySelector("table");

            // extract all rows but skipping the first header row
            const rows = Array.from(table.querySelectorAll("tr")).slice(1);
            let installments = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll("td");
                if (cells.length < 6) return;
                const dueDate = cells[1].innerText.trim();
                let year = 0;
                if (dueDate) {
                    const dateParts = dueDate.split("/");
                    if (dateParts.length === 3) {
                        const rawYear = dateParts[2];
                        // Handle 2-digit vs 4-digit years safely
                        year = parseInt(rawYear.length === 2 ? `20${rawYear}` : rawYear, 10);
                    }
                }

                installments.push({
                    installmentNumber: cells[0].innerText.trim(),
                    dueDate: dueDate,
                    year: year,
                    amount: cells[2].innerText.trim(),
                    paidAmount: cells[4].innerText.trim(),
                    amountDue: cells[5].innerText.trim(),
                    paidDate: cells[6] ? cells[6].innerText.trim().split(" ")[0] : null
                });
            });

            // Filter for only the most recent year
            const mostRecentYear = Math.max(...installments.map(i => i.year));
            const recentInstallments = installments.filter(i => i.year === mostRecentYear);

            return recentInstallments;
        });

        let paidRecord = null;
        if (extractionResult === null) {
            await page.waitForSelector("tr.TitleColor", timeout_option);
            paidRecord = await page.evaluate(() => {
                const headerRow = document.querySelector("tr.TitleColor");
                if (!headerRow) return null; // Safety check in case the table isn't found
                console.log("Inside the table...");
                const table = headerRow.closest("table");
                const rows = Array.from(table.querySelectorAll("tr"));
                let summaryRecords = [];

                rows.forEach(row => {
                    const cells = row.querySelectorAll("td");

                    // CRITICAL FIX: Skip this row if it doesn't have at least 7 cells 
                    // (since you are trying to access cells[6] later)
                    if (cells.length < 7) return;

                    const yearText = cells[2].innerText.trim();
                    const year = parseInt(yearText, 10);

                    // Optional: Skip if the year isn't a valid number (e.g., a total row)
                    if (isNaN(year)) return;

                    console.log("year:", year);
                    summaryRecords.push({
                        year: year,
                        baseAmount: cells[3].innerText.trim(),
                        datePaid: cells[5].innerText.trim(),
                        amountPaid: cells[6].innerText.trim(),
                    });
                });

                // Find the most recent year safely
                if (summaryRecords.length === 0) return null;

                const mostRecentYear = Math.max(...summaryRecords.map(r => r.year));
                const recentRecord = summaryRecords.find(r => r.year === mostRecentYear);

                return recentRecord;
            });
        }
        return populateTheObject(ownerName, propertyAddress, assessedValue, taxableValue, extractionResult, paidRecord, null);
    }
    else { 
        await page.waitForSelector("#ctl00_ContentPlaceHolder1_lblTaxableValue", timeout_option);
        const taxableValue = await page.$eval("#ctl00_ContentPlaceHolder1_lblTaxableValue", el => el.textContent.trim());

        const delqRecords = await page.evaluate(() => {
            const table = document.querySelector("#ctl00_ContentPlaceHolder1_dgDelinquentHistory");

            const rows = Array.from(table.querySelectorAll("tr")).slice(1, -1);
            const records = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll("td");
                const yearText = cells[0].innerText.trim();
                const year = parseInt(yearText, 10);
                records.push({
                    year: year,
                    baseTax: cells[3].innerText.trim(),
                    amountDue: cells[5].innerText.trim()
                });
            });
            return records;
        });
        return populateTheObject(ownerName, propertyAddress, taxableValue, taxableValue, null, null, delqRecords);
    }
}


async function populateTheObject(ownerName, propertyAddress, assessedValue, taxableValue, extractionResult, paidRecord, delqRecords) {

    const result = createPropertyObject();
    result.owner_name.push(ownerName);
    result.property_address = propertyAddress.replace(/\s+/g, " ").trim();
    result.total_taxable_value = taxableValue;
    result.total_assessed_value = assessedValue;

    if (extractionResult) {
        for (const item of extractionResult) {
            const record = createTaxHistory();
            record.year = item.year;
            record.base_amount = `$${item.amount}`;
            record.amount_paid = `$${item.paidAmount}`;
            record.amount_due = item.amountDue;
            record.due_date = item.dueDate;
            record.paid_date = item.paidDate;

            if (item.dueDate) {
                const dueDateObj = new Date(item.dueDate);
                // Create a new date instance so original remains unmutated
                const delqDateObj = new Date(dueDateObj);
                delqDateObj.setDate(delqDateObj.getDate() + 1);

                const month = String(delqDateObj.getMonth() + 1).padStart(2, '0');
                const day = String(delqDateObj.getDate()).padStart(2, '0');
                const year = delqDateObj.getFullYear();
                record.delq_date = `${month}/${day}/${year}`;
            }

            if (record.amount_due === "$0.00" || record.amount_due === "0.00") {
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
            result.tax_history.push(record);
        }
    } else if (paidRecord) {
        const record = createTaxHistory();
        record.year = paidRecord.year;
        record.base_amount = paidRecord.baseAmount;
        record.amount_paid = paidRecord.amountPaid;
        record.paid_date = paidRecord.datePaid;

        record.due_date = `03/31/${record.year}`;
        record.delq_date = `04/01/${record.year}`;
        record.amount_due = "$0.00";
        record.status = "Paid";
        result.tax_history.push(record);
    } else if (delqRecords && delqRecords.length > 0) {
        for (const item of delqRecords) {
            const record = createTaxHistory();
            record.year = item.year;
            record.base_amount = item.baseTax;
            record.amount_due = item.amountDue;
            record.amount_paid = "$0.00";
            record.due_date = `03/31/${item.year}`;
            record.delq_date = `04/01/${item.year}`;
            const today = new Date();
            const dueDateObj = new Date(record.due_date);
            if (today <= dueDateObj) {
                record.status = "Due";
            } else {
                record.status = "Delinquent";
            }
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

const account_search = async (page, url, accountNumber, tax_auth) => {
    try {
        await page.setViewport({ width: 1920, height: 1080 });

        // 1. Go to the URL
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // 2 . Search for the Account number
        await searchAccountNumber(accountNumber, page);

        // 3. Get all the details
        const result = await getDetails(page);
        result.parcel_number = accountNumber;
        result.taxing_authority = tax_auth;

        // 4. return the result
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

        const url = county_data[req_county].url;
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