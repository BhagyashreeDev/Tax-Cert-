// Author :- Bhagyashree Badadal

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "leon": {
        url: "https://wwwtax2.leoncountyfl.gov/itm/PropertySearchAccount.aspx",
        auth: "Leon County Tax Collector, 1276 Metropolitan Boulevard, Suite 102, Tallahassee, FL 32312"
    },
    "marion": {
        url: "https://www.mariontax.com/itm/PropertySearchAccount.aspx",
        auth: "Marion County Tax Collector, 503 SE 25th Avenue, Ocala, FL 34471"
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

// for searching the account
async function searchAccountNumber(accountNumber, page) {
    const inputSelector = 'input[id$="txtAccount"]';
    const searchBtnSelector = 'input[id$="btnSearch"]';

    await page.waitForSelector(inputSelector, timeout_option);
    await page.type(inputSelector, accountNumber);

    await page.waitForSelector(searchBtnSelector, timeout_option);

    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", ...timeout_option }).catch(() => { }),
        page.click(searchBtnSelector)
    ]);
}

// get the details
async function getDetails(page) {
    const ownerSelector = 'span[id$="lblItem2"]';

    await page.waitForSelector(ownerSelector, timeout_option);

    // get ownerName, address, status - paid, cer sold, mintax, no tax due
    const propertyDetails = await page.evaluate(() => {
        const getText = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
        };

        const ownerName = getText('span[id$="lblItem2"]');
        const address = getText('span[id$="lblItem4"]');

        let status = '';
        const bTags = Array.from(document.querySelectorAll('b'));
        const statusBTag = bTags.find(b => b.textContent.trim() === 'Status');

        if (statusBTag) {
            const parentTd = statusBTag.closest('td');

            if (parentTd && parentTd.nextElementSibling) {
                const statusTd = parentTd.nextElementSibling.querySelector('td');
                if (statusTd) {
                    status = statusTd.textContent.replace(/\s+/g, ' ').trim();
                } else {
                    // Fallback just in case the HTML structure changes and there is no nested table
                    status = parentTd.nextElementSibling.textContent.replace(/\s+/g, ' ').trim();
                }
            }
        }
        return { ownerName, address, status };
    });

    const accountLinkSelector = 'a[id$="lnkDetails1"]';
    const linkExists = await page.$(accountLinkSelector);
    let status = propertyDetails.status.toLowerCase();

    // Add a flag to let the main script know if we successfully navigated
    let navigated = false;

    if (linkExists) {
        if (status == "paid" || status == "cer sold") {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', ...timeout_option }),
                page.click(accountLinkSelector)
            ]);
            navigated = true;
        }
    } 
    // Return the details along with our navigation flag
    return { ...propertyDetails, navigated };
}

// get the data from the table after navigation
async function getRecentYearTaxBill(page) {
    const tableSelector = 'table[id$="tblSummary"]';
    await page.waitForSelector(tableSelector, timeout_option);

    const { recentData, taxBillUrl } = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table[id$="tblSummary"] tr.text'));
        if (rows.length === 0) return { recentData: null, taxBillUrl: null };

        // 1. Identify highest/most recent tax year
        let maxYear = -1;
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 4) {
                const yearNum = parseInt(cells[0].textContent.trim(), 10);
                if (!isNaN(yearNum) && yearNum > maxYear) {
                    maxYear = yearNum;
                }
            }
        });

        // 2. Collect all rows matching the most recent year
        const recentYearRows = rows.filter(row => {
            const yearNum = parseInt(row.querySelectorAll('td')[0]?.textContent.trim(), 10);
            return yearNum === maxYear;
        });

        if (recentYearRows.length === 0) return { recentData: null, taxBillUrl: null };

        // 3. Find regular roll row and certificate roll row (if CER SOLD)
        const regularRow = recentYearRows.find(row => row.querySelectorAll('td')[1]?.textContent.trim() === 'R') || recentYearRows[0];
        const certRow = recentYearRows.find(row => row.querySelectorAll('td')[1]?.textContent.trim() === 'CER');

        const regCells = regularRow.querySelectorAll('td');
        const statusText = regCells[3]?.textContent.trim() || '';
        const isCerSold = statusText.toUpperCase() === 'CER SOLD';

        let certDetails = null;
        if (certRow) {
            const cCells = certRow.querySelectorAll('td');
            certDetails = {
                certAccount: cCells[2]?.textContent.trim(),
                certStatus: cCells[3]?.textContent.trim(),
                datePaid: cCells[4]?.textContent.trim(),
                amountPaid: cCells[5]?.textContent.trim(),
                balanceDue: cCells[6]?.textContent.trim()
            };
        }

        const recentData = {
            year: maxYear,
            roll: regCells[1]?.textContent.trim(),
            accountNumber: regCells[2]?.textContent.trim(),
            status: statusText,
            isCerSold: isCerSold,
            datePaid: regCells[4]?.textContent.trim(),
            amountPaid: regCells[5]?.textContent.trim(),
            balanceDue: regCells[6]?.textContent.trim(),
            certificateInfo: certDetails
        };

        // 4. Safely extract bill link URL targeting the PropertyAcctBill anchor tag
        const billAnchor = regularRow.querySelector('a[href*="PropertyAcctBill.aspx"]') || regularRow.querySelector('a.label');
        const taxBillUrl = billAnchor ? billAnchor.href : null;

        return { recentData, taxBillUrl };
    });

    if (taxBillUrl) {
        await page.goto(taxBillUrl, { waitUntil: 'networkidle2', ...timeout_option });
    }
    return recentData;
}

// parse the page
async function parseTaxBillPage(page) {
    await page.waitForSelector('span[id$="lblTAssessedValue"]', timeout_option);

    const extractedData = await page.evaluate(() => {
        const cleanText = (str) => (str ? str.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '');

        // Extract Assessed Value and Taxable Value
        const assessedValueEl = document.querySelector('span[id$="lblTAssessedValue"]');
        const taxableValueEl = document.querySelector('span[id$="lblTTaxableValue"]');

        const assessedValue = cleanText(assessedValueEl?.textContent);
        const taxableValue = cleanText(taxableValueEl?.textContent);

        // Extract Base Tax from Table3
        let baseTax = '';
        const table3 = document.querySelector('table[id$="Table3"]');

        if (table3) {
            const tableText = table3.innerText || table3.textContent;
            const combinedMatch = tableText.match(/COMBINED\s+TAXES\s+&\s+ASSESSMENTS\s+TOTAL:\s*([\d,.]+)/i);

            if (combinedMatch) {
                baseTax = combinedMatch[1];
            } else {
                const adValoremMatch = tableText.match(/\d+\.\d{5}\s+([\d,.]+)/);
                if (adValoremMatch) {
                    baseTax = adValoremMatch[1];
                }
            }
        }

        let paidDate = null;
        const cells = document.querySelectorAll('#Table8 .PropBillText');
        const dateRegex = /\b(\d{2}\/\d{2}\/\d{2})\b/;
        for (const cell of cells) {
            const text = cell.textContent;
            const match = text.match(dateRegex);

            if (match && text.includes('PERIOD')) {
                let rawDate = match[1]; // e.g., "12/01/25"
                const parts = rawDate.split('/');
                
                if (parts.length === 3 && parts[2].length === 2) {
                    const yearNum = parseInt(parts[2], 10);
                    // Safely convert 2-digit year to 4-digit year (assumes 20xx for < 50, 19xx otherwise)
                    const fullYear = yearNum < 50 ? `20${parts[2]}` : `19${parts[2]}`;
                    paidDate = `${parts[0]}/${parts[1]}/${fullYear}`;
                } else {
                    paidDate = rawDate;
                }
                break;
            }
        }
        return { assessedValue, taxableValue, baseTax, paidDate };
    });
    return extractedData;
}

// populate the object
async function populateTheObject(data, page) {
    const result = createPropertyObject();
    result.owner_name.push(data.ownerName);
    result.property_address = data.address;
    result.total_taxable_value = `$${data.taxableValue}.00`;
    result.total_assessed_value = `$${data.assessedValue}.00`;

    const record = createTaxHistory();
    record.year = data.year;
    record.due_date = `03/31/${record.year}`;
    record.delq_date = `04/01/${record.year}`;

    if (data.isCerSold === true) {
        record.base_amount = `$${data.baseTax}`;
        record.amount_due = `$${data.certificateInfo["balanceDue"]}`;
        record.amount_paid = "$0.00";
        const today = new Date();
        const dueDateObj = new Date(record.due_date);
        if (today <= dueDateObj) {
            record.status = "Due";
        } else {
            record.status = "Delinquent";
        }
    } else {
        record.base_amount = `$${data.baseTax}`;
        record.amount_paid = `$${data.amountPaid}`;
        record.paid_date = data.paidDate;
        record.amount_due = "$0.00";
        record.status = "Paid";
    }

    result.tax_history.push(record);

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

        // 2. Accept agreement terms if present
        const agreeBtn = await page.$('#btnAgree');
        if (agreeBtn) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle2", ...timeout_option }).catch(() => { }),
                page.click('#btnAgree')
            ]);
        }

        // 3. Search for the account number
        await searchAccountNumber(accountNumber, page);

        // 4. If their exists no info for that account
        const searchError = await page.evaluate(() => {
            const msgEl = document.querySelector('span[id$="lblMessage"]');
            return msgEl ? msgEl.textContent : '';
        });

        if (searchError && searchError.includes('NOT MATCHED EXACTLY')) {
            return `No data for this account number (${accountNumber}) is available.`;
        }

        // 5. Get all the property details
        const propertyDetails = await getDetails(page);

        // 6. Handle scenario where status is not "paid" or "cer sold" - 
        if (!propertyDetails.navigated) {
            const partialResult = createPropertyObject();
            if (propertyDetails.ownerName) partialResult.owner_name.push(propertyDetails.ownerName);
            partialResult.property_address = propertyDetails.address || "";
            partialResult.parcel_number = accountNumber;
            partialResult.taxing_authority = tax_auth;
            return partialResult; // Early exit mapping only owner and address
        }

        // 7. Fetch the tax records
        const recentSummary = await getRecentYearTaxBill(page);
        const billDetails = await parseTaxBillPage(page);

        const finalOutput = {
            ...propertyDetails,
            ...recentSummary,
            ...billDetails
        };

        // 8. Populate the object
        const finalPopulatedObj = await populateTheObject(finalOutput, page);
        finalPopulatedObj.parcel_number = accountNumber;
        finalPopulatedObj.taxing_authority = tax_auth;

        // 9. Return the result
        return finalPopulatedObj;

    } catch (error) {
        console.log("Error inside account_search:", error);
        // --- ADDED SCREENSHOT LOGIC FOR DEBUGGING ---
        try {
            const screenshotPath = `debug_screenshot_${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Saved error screenshot to: ${screenshotPath}`);
        } catch (screenshotError) {
            console.log("Could not take debugging screenshot:", screenshotError);
        }
        // --------------------------------------------
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