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
        taxing_authority: "Cass County Finance Office, 211 9th Street South, Fargo, ND 58103",
        notes: "",
        tax_history: []
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

// generation of notes
const generateNotes = (taxHistoryArray, yearVal) => {
    if (!taxHistoryArray || taxHistoryArray.length === 0) {
        return { generateNotes: "NO VALID TAX RECORDS FOUND.", delinquentStatus: "NONE" };
    }

    const currentYearItems = taxHistoryArray.filter(h => String(h.year) === String(yearVal));
    const olderItems = taxHistoryArray.filter(h => parseInt(h.year) < parseInt(yearVal));

    const isAnyDelinquent = taxHistoryArray.some(h => h.status === "Delinquent");
    const delinquentStatus = isAnyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

    const isPriorYearPaid = !olderItems.some(h => h.status === "Delinquent");
    const priorText = isPriorYearPaid ? "ALL PRIORS ARE PAID" : "PRIORS ARE DELINQUENT";

    const buildDueDatesNote = `NORMAL DUE DATES ARE 03/01 AND 10/15`;

    let generateNotes = "";
    if (currentYearItems.length === 1) {
        const s1 = currentYearItems[0].status.toUpperCase();
        generateNotes = `${priorText}, ${yearVal} TAXES ARE ${s1}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${buildDueDatesNote}`
    } else {
        const s1 = currentYearItems[0].status.toUpperCase();
        const s2 = currentYearItems[1].status.toUpperCase();
        const statusString = `${yearVal} 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}`;

        generateNotes = `${priorText}, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${buildDueDatesNote}`;
    }

    return {generateNotes, delinquentStatus};
};

// get ownerName and address
async function getPropertyDetails(page) {
    await page.waitForSelector("#propertyDetailParcelTemplateDiv", { visible: true });
    const tableSelector = "#propertyDetailParcelTemplateDiv > table > tr";
    const data = await page.evaluate((selector) => {
        const rows = Array.from(document.querySelectorAll('table.propertyDetails tr'));
        let owner = '';
        let address = '';

        rows.forEach(row => {
            const thText = row.querySelector('th')?.innerText.trim();
            const tdElement = row.querySelector('td');

            if (thText === 'Owner:') owner = tdElement ? tdElement.innerText.trim() : '';
            else if (thText === 'Address:') address = tdElement ? tdElement.innerText.trim() : '';
        });
        return { owner, address };
    }, tableSelector);
    return data;
}

// get the assessedValue
async function getAssessedValue(page) {
    await page.waitForSelector("#propertyDetailParcelTemplateDiv, #InactiveMessageDiv", { visible: true });
    const isInactive = await page.evaluate(() => {
        const inactiveMsg = document.querySelector("#InactiveMessageDiv");
        return inactiveMsg && inactiveMsg.style.display === "block";
    });

    if (isInactive) return "Inactive";

    await page.waitForSelector("#propertyDetailAssessmentsTemplateDiv", { visible: true });
    const value = await page.evaluate((containerSelector) => {
        const container = document.querySelector(containerSelector);
        if (!container) return null;

        const firstRow = container.querySelector("table tbody tr.odd");
        if (!firstRow) return null;

        const cells = Array.from(firstRow.querySelectorAll('td'));
        return cells[9] ? cells[9].innerText.trim() : null;
    }, "#propertyDetailAssessmentsTemplateDiv");

    return value;
}

// getting the tax details
async function getRecord(page) {
    await page.waitForSelector("#propertyDetailStatementsTemplateDiv", { visible: true });

    // Extract all relevant columns from the main statement row
    const paidRecord = await page.evaluate((containerSelector) => {
        const container = document.querySelector(containerSelector);
        const firstRow = container.querySelector("table tbody tr.odd");
        if (!firstRow) return null;

        const cells = Array.from(firstRow.querySelectorAll("td"));
        const year = cells[0]?.innerText.trim();
        const baseTax = cells[3]?.innerText.trim();
        const paidTax = cells[7]?.innerText.trim();
        const balanceDue = cells[8]?.innerText.trim();

        if (baseTax === "$0.00" && paidTax === "$0.00") {
            return { year, baseTax, paidTax, balanceDue, history: [] };
        }

        // clicking this link to get "Paid Date"
        const paidLink = cells[7]?.querySelector('a');
        if (paidLink) paidLink.click();

        return { year, baseTax, paidTax, balanceDue };
    }, "#propertyDetailStatementsTemplateDiv");

    if (!paidRecord) return null;
    if (paidRecord.history) return paidRecord;

    await page.waitForFunction(() => {
        const wrappers = document.querySelectorAll("#paymentHistoryWrapperDiv");
        for (const wrapper of wrappers) {
            if (wrapper.offsetParent !== null) {
                const dataRows = wrapper.querySelectorAll("table tbody tr.odd, table tbody tr.even");
                if (dataRows.length > 0) return true;
            }
        }
        return false;
    }, { timeout: 30000 });

    // get all the paid records from the pop-up
    const history = await page.evaluate(() => {
        const wrappers = document.querySelectorAll("#paymentHistoryWrapperDiv");
        let results = [];

        for (const wrapper of wrappers) {
            if (wrapper.offsetParent === null) continue;

            const rows = wrapper.querySelectorAll("table tbody tr");
            for (const row of rows) {
                const cells = row.querySelectorAll("td");
                // Remove parenthesis for negative values in history if any, or just grab the exact string
                if (cells.length >= 3 && cells[0].innerText.trim() !== "Date") {
                    results.push({
                        date: cells[0].innerText.trim(),
                        amount: cells[2].innerText.trim()
                    });
                }
            }
        }
        return results;
    });

    return { ...paidRecord, history };
}

// Helpers for Math
const toCurrency = (num) => "$" + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const parseCurrency = (val) => val ? parseFloat(val.replace(/[^0-9.-]+/g, "")) : 0;

// populate the object
async function populateTheObject(data, assessedValue, taxDetails, accountNumber) {
    const result = createPropertyObject();

    result.parcel_number = accountNumber;
    if (data.owner) result.owner_name.push(data.owner);
    result.property_address = data.address;
    result.total_assessed_value = assessedValue;
    result.total_taxable_value = assessedValue;

    if (!taxDetails) return result;

    const year = parseInt(taxDetails.year);
    const baseTax = parseCurrency(taxDetails.baseTax);
    const paidTax = parseCurrency(taxDetails.paidTax);
    const balanceDue = parseCurrency(taxDetails.balanceDue);
    const history = taxDetails.history || [];

    // Finds the exact date from the history array matching the target amount
    const getExactDateForAmount = (targetAmount) => {
        const exactMatch = history.find(h => Math.abs(parseCurrency(h.amount)) === Math.abs(targetAmount));
        return exactMatch ? exactMatch.date : "";
    };

    // if base and paid tax are ZERO
    if (baseTax === 0 && paidTax === 0) {
        const record = createTaxHistory();
        record.year = year.toString();
        record.status = "Paid";
        record.base_amount = "$0.00";
        record.amount_paid = "$0.00";
        record.amount_due = "$0.00";
        record.due_date = `03/01/${year + 1}`;
        record.delq_date = `03/02/${year + 1}`;
        record.paid_date = "";
        result.tax_history.push(record);
    }
    else {
        // Construct the two standard installments
        let inst1 = createTaxHistory();
        inst1.year = year.toString();
        inst1.due_date = `03/01/${year + 1}`;
        inst1.delq_date = `03/02/${year + 1}`;

        let inst2 = createTaxHistory();
        inst2.year = year.toString();
        inst2.due_date = `10/15/${year + 1}`;
        inst2.delq_date = `10/16/${year + 1}`;

        // if only 1 installment is paid and another is unpaid
        if (balanceDue > 0) {
           
            const halfBase = Math.round((baseTax / 2) * 100) / 100;

            inst1.base_amount = toCurrency(halfBase);
            inst1.amount_paid = toCurrency(paidTax);
            inst1.amount_due = "$0.00";
            inst1.status = "Paid";
            inst1.paid_date = getExactDateForAmount(paidTax); // Exact match from history

            inst2.base_amount = toCurrency(halfBase);
            inst2.amount_paid = "$0.00";
            inst2.amount_due = toCurrency(balanceDue);
            const today = new Date();
            const dueDateObj = new Date(inst2.due_date);

            if (today <= dueDateObj) {
                inst2.status = "Due";
            } else {
                inst2.status = "Delinquent";
            }
            inst2.paid_date = "";

        } else {
            // Fully paid scenario (Balance is 0)
            // They might have paid it in one lump sum or two separate payments.

            // Check if there is one giant lump sum payment matching the total paid amount
            const lumpSumDate = getExactDateForAmount(paidTax);

            if (lumpSumDate) {
                // Paid all at once
                const halfPaid = Math.round((paidTax / 2) * 100) / 100;
                const halfBase = Math.round((baseTax / 2) * 100) / 100;

                inst1.base_amount = toCurrency(halfBase);
                inst1.amount_paid = toCurrency(halfPaid);
                inst1.amount_due = "$0.00";
                inst1.status = "Paid";
                inst1.paid_date = lumpSumDate;

                // Subtracting from the total for the second installment ensures no 1-cent rounding errors
                inst2.base_amount = toCurrency(baseTax - halfBase);
                inst2.amount_paid = toCurrency(paidTax - halfPaid);
                inst2.amount_due = "$0.00";
                inst2.status = "Paid";
                inst2.paid_date = lumpSumDate;
            } else {
                // Handle scenario where it was paid in multiple chunks here if needed
            }
        }
        result.tax_history.push(inst1, inst2);
    }

    // sorting the records
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
    if (year) {
        const noteData = generateNotes(result.tax_history, year.toString());
        result.notes = noteData.generateNotes;
        result.delinquent = noteData.delinquentStatus;
    }
    return result;
}

const account_search = async (page, url, accountNumber) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // 1. Get ownerName, address
        const data = await getPropertyDetails(page);
        // 2. Get assessed Value 
        const assessedValue = await getAssessedValue(page);
        // 3. If account is inactive
        if (assessedValue === "Inactive") {
            const result = createPropertyObject();
            result.owner_name.push(data.owner);
            result.parcel_number = accountNumber;
            result.property_address = data.address;
            return result;
        }
        // 4. Get the record details
        const taxDetails = await getRecord(page);
        // 5. populate the objects
        const result = await populateTheObject(data, assessedValue, taxDetails, accountNumber);

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

        // by-passing the search by using direct url
        const url = `https://proptax.casscountynd.gov/#Property=${account}`;

        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
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