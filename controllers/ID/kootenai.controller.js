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
        property_address: "",
        parcel_number: "",
        land_value: "",
        improvements: "",
        total_assessed_value: "N/A",
        exemption: "",
        total_taxable_value: "N/A",
        delinquent: "NONE",
        taxing_authority: "Kootenai County Treasurer, 451 Government Way, Coeur d'Alene, ID 83814",
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
const generate_notes = (year, keys, status1, status2) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${status1.toUpperCase()}, 2ND INSTALLMENT IS ${status2.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE 12/20 AND 06/20`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// for getting assessedValue
async function extractAssessedValue(page) {
    const tableSelector = "table[aria-label*='view.group.data.table.label']";
    await page.waitForSelector(tableSelector, { visible: true });

    const taxableValue = await page.evaluate((selector) => {
        const table = document.querySelector(selector);
        if (!table) return null;

        // Get all rows in the tbody
        const rows = table.querySelectorAll("tbody tr");

        // Ensure the 9th row exists (index 8)
        if (rows.length > 9) {
            const eighthRow = rows[8];
            const cells = eighthRow.querySelectorAll("td");

            // Index 2 corresponds to "Taxable Value" based on the headers order
            if (cells.length >= 3) {
                return cells[2].textContent.trim();
            }
        }
        return null;
    }, tableSelector);
    return taxableValue;
}

// search for the parcel-number
async function searchAccountNumber(accountNumber, page) {

    // Bypassing the search by directly navigating through url
    const url = `https://id-kootenai.publicaccessnow.com/Treasurer/TaxSearch.aspx?s=ParcelID:${accountNumber}&pg=1&g=1&moduleId=449`;
    await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

    // click on the "View Account" button 
    const resultLinkSelector = `a[title='View Account ${accountNumber}']`;
    await page.waitForSelector(resultLinkSelector, { visible: true }, timeout_option);
    const fetchedUrl = await page.evaluate((selector) => {
        return document.querySelector(selector).getAttribute('href');
    }, resultLinkSelector);

    // navigating throught url extraction
    const currentUrl = page.url();
    const splitUrl = currentUrl.split('/Treasurer')[0];

    const targetUrl = `${splitUrl}${fetchedUrl}`;
    await page.goto(targetUrl, { waitUntil: "networkidle2" });
}

// for fetching all the details
async function fetchDetails(page) {
    await page.waitForSelector("#dnn_ctr584_ModuleContent", { visible: true });

    // get ownerName, address
    const details = await page.evaluate(() => {
        let owner = "";
        let address = "";
        const dlElements = document.querySelectorAll("div[aria-label='Account summary information'] dl");
        dlElements.forEach(dl => {
            const dt = dl.querySelector("dt");
            const dd = dl.querySelector("dd");
            if (dt && dd) {
                const label = dt.textContent.trim();
                const value = dd.textContent.trim();
                if (label.includes("Owner:")) {
                    owner = value;
                }
                if (label.includes("Property Address:")) {
                    address = value;
                }
            }
        });
        return { owner, address };
    });

    // get the amountDue
    await page.waitForSelector("#dnn_ctr464_ModuleContent", { visible: true });
    const due = await page.evaluate(() => {
        const spanElement = document.querySelector(".grand-total-bill-amount");
        return spanElement ? spanElement.textContent.trim() : null;
    });

    let numericDue = 0;
    if (due) numericDue = parseFloat(due.replace(/[\$,]/g, ''));
    let installments = [];
    let rowsData = [];
    let assessedValue = null;

    // If we have Due records
    // Else we have paid history

    // If due is > 0, expand the specific card and extract table data ---
    if (numericDue > 0) {
        try {

            const buttonSelector = "button[aria-label='Taxing District Charge Breakdown']";

            // Wait for it to be visible and click it
            await page.waitForSelector(buttonSelector, { visible: true });
            await Promise.all([
                page.waitForNavigation({ waitUntil: "domcontentloaded" }),
                page.click(buttonSelector)
            ]);
            // get the assessed value when we have due records
            assessedValue = await extractAssessedValue(page);

            await page.goBack();
            // expand the card buuton to fetch installments details
            const expandBtnSelector = 'payment-bill-group button.card.red-expand';
            const expandBtn = await page.$(expandBtnSelector);

            if (expandBtn) {
                await expandBtn.click();
                await page.waitForSelector('payment-bill-grid table tbody tr', { visible: true, timeout: 5000 });

                // expand the "Taxes and Charges" to get "base tax" data from it
                await page.evaluate(() => {
                    const btns = document.querySelectorAll("payment-bill-grid table tbody button.expandable-header");
                    btns.forEach(btn => {
                        // Check aria-expanded to ensure we don't accidentally close an already open tab
                        if (btn.getAttribute('aria-expanded') !== 'true') {
                            btn.click();
                        }
                    });
                });

                // Give the DOM and Angular a moment to render all the inner tables simultaneously
                await new Promise(resolve => setTimeout(resolve, 1500));

                // fetch all the listed installments 
                installments = await page.evaluate(() => {
                    try {
                        const rows = document.querySelectorAll("payment-bill-grid table tbody tr");
                        const results = [];

                        const titleYearEl = document.querySelector('payment-bill-group button.card.red-expand .tile-header__value');
                        const billYear = titleYearEl ? titleYearEl.textContent.trim() : "";

                        rows.forEach(row => {
                            const cells = row.querySelectorAll("td");
                            if (cells.length >= 6) {
                                let baseTax = "";
                                const totalCell = cells[3];
                                // getting the base tax
                                if (totalCell) {
                                    const totalValueElements = totalCell.querySelectorAll(".total-values");
                                    totalValueElements.forEach(el => {
                                        if (el.textContent.includes("Tax:")) {
                                            const currencySpan = el.querySelector(".total-values__currency");
                                            if (currencySpan) {
                                                baseTax = currencySpan.textContent.trim();
                                            }
                                        }
                                    });
                                }

                                results.push({
                                    year: billYear,
                                    status: cells[0].textContent.replace('●', '').trim(),
                                    installment: cells[1].textContent.trim(),
                                    dueDate: cells[2].textContent.trim(),
                                    baseTax: baseTax,
                                    paidAmount: cells[4].textContent.trim(),
                                    owed: cells[5].textContent.trim()
                                });
                            }
                        });
                        return results;
                    } catch (err) {
                        return [{ error: err.toString() }];
                    }
                });
            }

            // It is handling a edge case where 1 installment is paid and another is unpaid
            // so we go to the "payment history" and get the first row, as it will be the 1 paid installment record
            if (installments.length === 1 && !installments[0].error) {
                rowsData = await page.evaluate(() => {
                    const rows = document.querySelectorAll("table[aria-label*='view.group.data.table.label'] tbody tr");
                    const results = [];
                    if (rows.length > 0) {
                        const cells = rows[0].querySelectorAll("td");
                        if (cells.length >= 6) {
                            results.push({
                                year: cells[0].textContent.trim(),
                                paidDate: cells[2].textContent.trim(),
                                paidAmount: cells[5].textContent.trim()
                            });
                        }
                    }
                    return results;
                });
            }

        } catch (e) {
            console.error("Error expanding delinquent tables:", e);
        }
    }
    // If we have only paid records
    else {
        await page.waitForSelector("#dnn_ctr607_ModuleContent", { visible: true });
        // get first 2 records hoping they are the paid installments of recent tax year
        rowsData = await page.evaluate(() => {
            const rows = document.querySelectorAll("table[aria-label*='view.group.data.table.label'] tbody tr");
            const results = [];
            const limit = Math.min(rows.length, 2);
            for (let i = 0; i < limit; i++) {
                const cells = rows[i].querySelectorAll("td");
                if (cells.length >= 6) {
                    results.push({
                        year: cells[0].textContent.trim(),
                        paidDate: cells[2].textContent.trim(),
                        paidAmount: cells[5].textContent.trim()
                    });
                }
            }
            return results;
        });

        // click on the recent year, to fetch the assessedValue
        const taxYearSelector = `span.thumbnail[title="Tax Year - ${rowsData[0].year}"]`;
        await page.waitForSelector(taxYearSelector, { visible: true });
        await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
            page.click(taxYearSelector)
        ]);
        // get assessedValue
        await page.waitForSelector("#dnn_ctr468_ModuleContent", { visible: true });
        assessedValue = await extractAssessedValue(page);
    }

    return { details, due, rowsData, assessedValue, installments, numericDue };
}

// populate the object
async function populateTheObject(details, due, rowsData, assessedValue, installments, numericDue) {
    const result = createPropertyObject();
    result.owner_name.push(details.owner.toUpperCase());
    result.property_address = details.address.toUpperCase();
    result.total_assessed_value = assessedValue;
    result.total_taxable_value = assessedValue;

    // if we have unpaid records
    if (numericDue > 0 && installments.length > 0) {
        // For all the records in the installments[] array
        installments.forEach((inst) => {
            const record = createTaxHistory();
            record.year = inst.year;
            record.base_amount = inst.baseTax;
            record.amount_paid = inst.paidAmount;
            record.amount_due = inst.owed;
            const [month, day, year] = inst.dueDate.split("/");
            record.due_date = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/20${year}`;  // To make ex: 12/03/25 -> 12/03/2025

            // setting delinquent date
            const dueDate = new Date(inst.dueDate);
            dueDate.setDate(dueDate.getDate() + 1);
            const monthDel = String(dueDate.getMonth() + 1).padStart(2, '0');
            const dayDel = String(dueDate.getDate()).padStart(2, '0');
            const yearDel = dueDate.getFullYear();
            record.delq_date = `${monthDel}/${dayDel}/${yearDel}`;

            if (String(inst.installment) === "1") {
                record.payment_type = "INSTALLMENT 1";
            }
            else record.payment_type = "INSTALLMENT 2";

            const today = new Date();
            const dueDateObj = new Date(record.due_date);

            if (today <= dueDateObj) {
                record.status = "DUE";
            } else {
                record.status = "DELINQUENT";
            }
            result.tax_history.push(record);
        });

        // Process the Paid Installment if 1 is due and 1 is paid for the same year
        if (installments.length === 1 && rowsData && rowsData.length > 0) {
            const dueInst = installments[0];
            const paidRow = rowsData[0];

            // now adding paid record from rowsData[] array
            if (dueInst.year === paidRow.year) {
                const record = createTaxHistory();
                record.year = paidRow.year;
                record.status = "PAID";
                record.base_amount = paidRow.paidAmount;
                record.amount_paid = paidRow.paidAmount;
                record.amount_due = "$0.00";

                const [pMonth, pDay, pYear] = paidRow.paidDate.split("/");
                record.paid_date = `${pMonth.padStart(2, '0')}/${pDay.padStart(2, '0')}/20${pYear}`;

                // Deduce which installment was paid
                let paidInstNum = "1";
                if (String(dueInst.installment).includes("1")) {
                    paidInstNum = "2";
                }

                const yearInt = parseInt(record.year);
                record.payment_type = `INSTALLMENT ${paidInstNum}`;
                record.due_date = paidInstNum === "1" ? `12/20/${yearInt}` : `06/20/${yearInt + 1}`;
                record.delq_date = paidInstNum === "1" ? `12/21/${yearInt}` : `06/21/${yearInt + 1}`;

                result.tax_history.push(record);
            }
        }
    }
    // If we have only paid records
    else {
        if (rowsData.length > 0) {

            const firstRow = rowsData[0];
            const secondRow = rowsData.length > 1 ? rowsData[1] : null;

            // iff both paid records are of same tax Year 
            if (secondRow && firstRow.year === secondRow.year) {
                const sortedRows = [...rowsData].sort((a, b) => new Date(a.paidDate) - new Date(b.paidDate));
                sortedRows.forEach((row, index) => {
                    const record = createTaxHistory();
                    record.year = row.year;
                    record.status = "PAID";
                    record.base_amount = row.paidAmount;
                    record.amount_paid = row.paidAmount;
                    record.amount_due = due;
                    const [pMonth, pDay, pYear] = row.paidDate.split("/");
                    record.paid_date = `${pMonth.padStart(2, '0')}/${pDay.padStart(2, '0')}/20${pYear}`;

                    const yearInt = parseInt(record.year);
                    record.due_date = index === 0 ? `12/20/${yearInt}` : `06/20/${yearInt + 1}`;
                    record.delq_date = index === 0 ? `12/21/${yearInt}` : `06/21/${yearInt + 1}`;
                    if (index === 0) record.payment_type = "INSTALLMENT 1";
                    else record.payment_type = "INSTALLMENT 2";
                    result.tax_history.push(record);
                });
            }
            // suppose if we have only 1 recent paid record (paid annualy)
            else {
                // choose the first row as it will be the recent paid record
                const yearInt = parseInt(firstRow.year);
                const rawAmount = parseFloat(firstRow.paidAmount.replace(/[\$,]/g, '')) || 0;
                // dividing by 2 to make into installments
                const halfAmount = (rawAmount / 2).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

                const record1 = createTaxHistory();
                record1.year = firstRow.year;
                record1.status = "PAID";
                record1.base_amount = halfAmount;
                record1.amount_paid = halfAmount;
                record1.amount_due = due;
                const [month1, day1, year1] = firstRow.paidDate.split("/");
                record1.paid_date = `${month1}/${day1}/20${year1}`;
                record1.payment_type = "INSTALLMENT 1";
                record1.due_date = `12/20/${yearInt}`;
                record1.delq_date = `12/21/${yearInt}`;
                result.tax_history.push(record1);

                const record2 = createTaxHistory();
                record2.year = firstRow.year;
                record2.status = "PAID";
                record2.base_amount = halfAmount;
                record2.amount_paid = halfAmount;
                record2.amount_due = due;
                const [month2, day2, year2] = firstRow.paidDate.split("/");
                record2.paid_date = `${month2}/${day2}/20${year2}`;
                record2.payment_type = "INSTALLMENT 2";
                record2.due_date = `06/20/${yearInt + 1}`;
                record2.delq_date = `06/21/${yearInt + 1}`;
                result.tax_history.push(record2);
            }
        }
    }

    // sort the records
    result.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) {
            return yearA - yearB;
        }
        if (a.status === "PAID" && b.status !== "PAID") return -1;
        if (a.status !== "PAID" && b.status === "PAID") return 1;
        return 0;
    });

    // deciding notes and delinquency
    if (result.tax_history.length > 0) {
        // Check if ANY tax is delinquent for the main delinquency flag
        const hasDelinquent = result.tax_history.some(
            (t) => t.status === "DELINQUENT",
        );
        result.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        // Get the latest tax record (the array is sorted ascending by year)
        const latestTax = result.tax_history[result.tax_history.length - 1];

        // Find individual statuses for the 1st and 2nd installments of the latest year
        const latestYearRecords = result.tax_history.filter(t => String(t.year) === String(latestTax.year));
        const inst1 = latestYearRecords.find(t => t.payment_type === "INSTALLMENT 1");
        const inst2 = latestYearRecords.find(t => t.payment_type === "INSTALLMENT 2");

        const status1 = inst1 ? inst1.status : "UNKNOWN";
        const status2 = inst2 ? inst2.status : "UNKNOWN";

        // Check if any PRIOR year is delinquent (exclude the latest year)
        const hasPriorDelinquent = result.tax_history.some(
            (t) => t.status === "DELINQUENT" && String(t.year) !== String(latestTax.year)
        );

        // If priors are delinquent, keys = 0. If priors are paid, keys = 1.
        const keys = hasPriorDelinquent ? 0 : 1;
        result.notes = generate_notes(latestTax.year, keys, status1, status2);
    }

    return result;
}

// Main Flow starts from here
const account_search = async (page, url, accountNumber) => {
    try {
        await page.setViewport({ width: 1920, height: 1080 });

        // 1. Search for the Parcel-ID
        await searchAccountNumber(accountNumber, page);

        // 2. Get all the required details
        const { details, due, rowsData, assessedValue, installments, numericDue } = await fetchDetails(page);

        // 3. Populate the main object with obtained details
        const result = await populateTheObject(details, due, rowsData, assessedValue, installments, numericDue);
        result.parcel_number = accountNumber;

        // 4. Return the result
        return result;

    } catch (error) {
        console.log("Error inside account_search:", error);
        throw new Error(error.message);
    }
};

const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    if (account) account = String(account).trim();
    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://id-kootenai.publicaccessnow.com/Treasurer/TaxSearch.aspx";

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        const blockedResources = [
            'image', 'stylesheet', 'media', 'font',
            'texttrack', 'object', 'beacon', 'csp_report', 'imageset'
        ];
        page.on('request', (req) => {
            if (blockedResources.includes(req.resourceType())) {
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