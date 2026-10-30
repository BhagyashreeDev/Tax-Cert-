// Author:- Bhagyashree Badadal

// In this county currently we are considering only Real Estate Property Taxes, but we also have Personal Property, which as of now we are not considering.

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
        taxing_authority: "Cass County Collector of Revenue, 2725 Cantrell Road, Harrisonville, MO 64701",
        notes: "",
        delinquent: "NONE",
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
        good_through_date: "-",
    };
}

// Formatting helpers
const formatCurrency = (amount) => {
    if (!amount || amount === "N/A" || amount === "-") return "$0.00";
    let num = String(amount).replace(/[$,]/g, "").trim();
    if (isNaN(num) || num === "") return "$0.00";
    let formatted = parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return "$" + formatted;
};

const formatDate = (dateStr) => {
    if (!dateStr || dateStr === "N/A" || dateStr === "-") return "N/A";
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    let month = ("0" + (d.getMonth() + 1)).slice(-2);
    let day = ("0" + d.getDate()).slice(-2);
    let year = d.getFullYear();
    return `${month}/${day}/${year}`;
};

// Notes logic builder
const generate_notes = (year, keys, status, dueDate) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID, ${year} `
                : `PRIORS ARE DELINQUENT, ${year} `;
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        notes += ` NORMAL DUE DATE IS ${dueDate.substring(0, 5)}`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

async function searchAccountNumber(page, accountNumber) {
    await page.waitForSelector('mat-select');
    let selects = await page.$$('mat-select');
    if (selects.length < 2) {
        throw new Error("Expected form dropdown elements (mat-select) were not found on the page.");
    }
    await page.evaluate((el) => el.click(), selects[0]);
    await new Promise(r => setTimeout(r, 800));

    // select Real Estate from the drop down menu
    await page.waitForSelector('.mat-mdc-option, .mat-option', { timeout: 10000 });
    await page.evaluate(() => {
        const options = Array.from(document.querySelectorAll('.mat-mdc-option, .mat-option'));
        const targetOption = options.find(el => el.textContent.trim().includes('Real Estate'));
        if (targetOption) {
            targetOption.click();
        } else if (options.length > 0) {
            options[0].click();
        }
    });

    await new Promise(r => setTimeout(r, 800));

    // select recent year from the drop down menu
    const refreshedSelects = await page.$$('mat-select');
    await page.evaluate((el) => el.click(), refreshedSelects[1]);
    await new Promise(r => setTimeout(r, 800));
    await page.waitForSelector('.mat-mdc-option, .mat-option', { timeout: 10000 });
    await page.evaluate(() => {
        const options = Array.from(document.querySelectorAll('.mat-mdc-option, .mat-option'));
        if (options.length > 0) {
            options[0].click();
        }
    });

    // Collapse overlays and trigger initial Search to load the next view layout stage
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));

    // click on search button
    await page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"]') ||
            document.querySelector('button.mat-mdc-raised-button') ||
            document.querySelector('button.mat-raised-button');
        if (btn) btn.click();
    });

    // Wait for the URL change and the new view state layout to load completely
    await new Promise(r => setTimeout(r, 3000));

    // Explicitly check for a visible input element on the updated layout page
    const searchInputFound = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const activeInput = inputs.find(i => {
            const style = window.getComputedStyle(i);
            return !['checkbox', 'radio', 'submit', 'button', 'hidden', 'file'].includes(i.type) &&
                style.display !== 'none' &&
                style.visibility !== 'hidden';
        });
        if (activeInput) {
            activeInput.focus();
            activeInput.value = '';
            activeInput.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }
        return false;
    });

    if (!searchInputFound) {
        throw new Error("Could not find a valid visible search account input field after performing the initial dropdown submission.");
    }

    // type the account number in Parcel-ID
    await page.keyboard.type(accountNumber, { delay: 50 });
    await new Promise(r => setTimeout(r, 500));

    // click on the search button
    await page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"]') ||
            document.querySelector('button.mat-mdc-raised-button') ||
            document.querySelector('button.mat-raised-button');
        if (btn) btn.click();
    });
}

async function selectAccountRow(page, accountNumber) {
    await page.waitForSelector('mat-row', { timeout: 20000 });
    // getting the table that has parcel id info as a row and click on that row
    const targetRowFound = await page.evaluate((accNum) => {
        const rows = document.querySelectorAll('mat-row');
        for (const row of rows) {
            const accountCell = row.querySelector('[class*="column-account"], .cdk-column-account');
            if (accountCell && accountCell.textContent.replace(/\s+/g, '').includes(accNum)) {
                row.click(); // Click the row container directly 
                return true;
            }
            if (row.textContent.replace(/\s+/g, '').includes(accNum)) {
                row.click();
                return true;
            }
        }
        return false;
    }, accountNumber);

    if (!targetRowFound) {
        throw new Error(`Target account row containing value "${accountNumber}" not found in search results.`);
    }
}

async function parsePropertyDetails(page) {
    await page.waitForSelector('app-address .name', { timeout: 20000 });

    return await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('mat-label'));
        const findValueByLabel = (labelTxt) => {
            const labelElement = labels.find(el => el.textContent.trim() === labelTxt);
            return labelElement ? labelElement.nextElementSibling?.textContent.trim() : "";
        };

        // Extract tax year, due, paid_amount, paid_date
        const ownerName = document.querySelector('app-address .name')?.textContent.trim() || "";
        const taxYear = findValueByLabel('Tax Year');
        const totalDueStr = findValueByLabel('Total Due');
        const totalPaidStr = findValueByLabel('Total Paid');
        const paidOnStr = findValueByLabel('Paid On');

        // Extract pure Situs Address for property_address
        const situsLabel = labels.find(el => el.textContent.trim() === 'Situs Address');
        let propertyLocation = "";
        if (situsLabel && situsLabel.nextElementSibling) {
            const containerHtml = situsLabel.nextElementSibling.innerHTML;
            const matchParts = containerHtml.split(/<br\s*\/?>/i);
            if (matchParts.length >= 2) {
                propertyLocation = `${matchParts[0].trim()}, ${matchParts[1].trim()}`;
            } else {
                propertyLocation = situsLabel.nextElementSibling.textContent.trim().split("SEC:")[0].trim();
            }
        }

        // Extract assessed value
        const tds = Array.from(document.querySelectorAll('td'));
        const totalAssessedCell = tds.find(el => el.textContent.trim() === 'Total Assessed:');
        const totalAssessedValue = totalAssessedCell ? totalAssessedCell.nextElementSibling?.textContent.trim() : "N/A";

        // Extract base_amount
        const taxAmtCell = tds.find(el => el.textContent.trim() === 'Tax Amount:');
        let baseTaxAmount = "";
        if (taxAmtCell) {
            const parentRowCells = taxAmtCell.parentElement.querySelectorAll('td');
            if (parentRowCells.length >= 3) {
                baseTaxAmount = parentRowCells[2].textContent.trim();
            }
        }

        return {
            ownerName,
            taxYear,
            totalDueStr,
            totalPaidStr,
            paidOnStr,
            propertyLocation,
            totalAssessedValue,
            baseTaxAmount
        };
    });
}

// Helper to process scraped data into a tax history row
function processHistoryRow(rawScrapedData, result) {
    const historyRow = createTaxHistory();
    historyRow.year = rawScrapedData.taxYear;

    const due_date_raw = `12/31/${historyRow.year}`;
    const delq_date_raw = `01/01/${parseInt(historyRow.year) + 1}`;
    historyRow.due_date = formatDate(due_date_raw);
    historyRow.delq_date = formatDate(delq_date_raw);

    const paymentDateStr = rawScrapedData.paidOnStr ? rawScrapedData.paidOnStr.trim() : "";
    const isPaid = (paymentDateStr !== "" && paymentDateStr.toUpperCase() !== "NOT PAID");

    if (isPaid) {
        historyRow.status = "Paid";
        historyRow.paid_date = formatDate(paymentDateStr);
        historyRow.amount_paid = formatCurrency(rawScrapedData.totalPaidStr);
        historyRow.amount_due = "$0.00";
    } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const standardDueDateObj = new Date(due_date_raw);
        standardDueDateObj.setHours(0, 0, 0, 0);

        if (today.getTime() <= standardDueDateObj.getTime()) {
            historyRow.status = "Due";
        } else {
            historyRow.status = "Delinquent";
        }
        historyRow.paid_date = "N/A";
        historyRow.amount_paid = "$0.00";
        historyRow.amount_due = formatCurrency(rawScrapedData.totalDueStr);
    }

    historyRow.base_amount = formatCurrency(rawScrapedData.baseTaxAmount);
    result.tax_history.push(historyRow);
}

const account_search = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

            // 1. Perform Multi-step Search Sequence Workflow
            await searchAccountNumber(page, account);
            await selectAccountRow(page, account);

            // 2. Scrape data elements for the CURRENT year
            const rawScrapedData = await parsePropertyDetails(page);

            const result = createPropertyObject();
            if (rawScrapedData.ownerName) result.owner_name.push(rawScrapedData.ownerName);
            result.property_address = rawScrapedData.propertyLocation;
            result.parcel_number = account;

            if (rawScrapedData.totalAssessedValue!=="N/A") {
                result.total_assessed_value = formatCurrency(rawScrapedData.totalAssessedValue.replace(/,/g, '').trim());
                result.total_taxable_value = result.total_assessed_value;
            }

            processHistoryRow(rawScrapedData, result);

            // 3. Extract all delinquent years from the UI list directly
            const delinquentYears = await page.evaluate(() => {
                const listItems = Array.from(document.querySelectorAll('app-delinquent-years ul li'));
                const years = [];
                listItems.forEach(li => {
                    // Extract the 4-digit year from text like "Tax Year: 2024 — View Statement"
                    const match = li.textContent.match(/Tax Year:\s*(\d{4})/);
                    if (match && match[1]) {
                        years.push(match[1]);
                    }
                });
                return years;
            });

            // 4. Navigate directly via URL for each historical year found
            for (const year of delinquentYears) {
                // don't re-process the year we are already on
                if (result.tax_history.some(t => t.year === year)) continue;

                // Construct the direct Angular route URL
                const directUrl = `https://casscountycollector.com/detailRealEstate;year=${year};account=${account}`;

                await page.goto(directUrl, { waitUntil: "networkidle2", ...timeout_option });

                // Wait for the new page's data to paint
                await page.waitForSelector('app-address .name', { timeout: 20000 });

                // Parse and push
                const historicalData = await parsePropertyDetails(page);
                processHistoryRow(historicalData, result);
            }

            // 5. Sort the records
            result.tax_history.sort((a, b) => {
                const yearA = parseInt(a.year, 10) || 0;
                const yearB = parseInt(b.year, 10) || 0;
                if (yearA !== yearB) return yearA - yearB;
                if (a.status === "Paid" && b.status !== "Paid") return -1;
                if (a.status !== "Paid" && b.status === "Paid") return 1;
                return 0;
            });

            // 6. Notes Processing
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
                result.notes = generate_notes(latestTax.year, keys, latestTax.status, latestTax.due_date);
            }

            resolve(result);

        } catch (error) {
            console.log("Error inside account_search:", error);
            reject(new Error(error.message));
        }
    });
};



const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    let context;
    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://casscountycollector.com/search";

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
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
        };
    }
}

export { search };