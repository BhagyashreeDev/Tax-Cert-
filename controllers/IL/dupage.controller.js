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
        total_assessed_value: "",
        exemption: "",
        total_taxable_value: "",
        taxing_authority: "DuPage County Treasurer, 421 N. County Farm Road Wheaton, IL 60187",
        delinquent: "NONE",
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
        good_through_date: "-",
    };
}

// Helper: Format Date from DD-MMM-YYYY to MM/DD/YYYY
function formatToUSDate(dateStr) {
    if (!dateStr || !dateStr.trim()) return "";
    const months = {
        JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
        JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    const parts = dateStr.trim().toUpperCase().split('-');
    if (parts.length === 3) {
        return `${months[parts[1]]}/${parts[0].padStart(2, '0')}/${parts[2]}`;
    }
    return dateStr;
}

// Helper: Add one day to a MM/DD/YYYY date
function getDelinquentDate(dueDateStr) {
    if (!dueDateStr) return "";
    const [m, d, y] = dueDateStr.split('/');
    const date = new Date(y, parseInt(m) - 1, parseInt(d) + 1);
    const nm = String(date.getMonth() + 1).padStart(2, '0');
    const nd = String(date.getDate()).padStart(2, '0');
    const ny = date.getFullYear();
    return `${nm}/${nd}/${ny}`;
}

// For generating notes for semi-annual type
const generateNotes = (taxHistoryArray, yearVal) => {
    if (!taxHistoryArray || taxHistoryArray.length === 0) {
        return { generatedNotes: "NO VALID TAX RECORDS FOUND.", delinquentStatus: "NONE" };
    }
    const currentYearItems = taxHistoryArray.filter(h => h.year === yearVal);

    // suppose we have 0 as base_amount for that tax year
    const isZeroBilled = currentYearItems.length > 0 && currentYearItems.every(h => {
        const baseNum = parseFloat((h.base_amount || "").replace(/[\$,]/g, '').trim());
        return baseNum === 0 || isNaN(baseNum);
    });
    if (isZeroBilled) {
        return { generatedNotes: "", delinquentStatus: "NONE" };
    }

    const olderItems = taxHistoryArray.filter(h => parseInt(h.year) < parseInt(yearVal));
    const isAnyDelinquent = taxHistoryArray.some(h => h.status === "Delinquent");
    const delinquentStatus = isAnyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

    // Condition: only if more than 1 year is delinquent (i.e., prior items have a delinquent status)
    const isPriorYearPaid = !olderItems.some(h => h.status === "Delinquent");
    const priorText = isPriorYearPaid ? "ALL PRIORS ARE PAID" : "PRIORS ARE DELINQUENT";
    const formatMMDD = (dateStr) => {
        if (!dateStr || dateStr === "N/A" || dateStr === "-") return "N/A";
        const parts = dateStr.split("/");
        if (parts.length >= 2) return `${parts[0].padStart(2, "0")}/${parts[1].padStart(2, "0")}`;
        return dateStr;
    };
    const buildDueDatesNote = (items) => {
        if (items.length >= 2) {
            const d1 = formatMMDD(items[0].due_date);
            const d2 = formatMMDD(items[1].due_date);
            return `NORMAL DUE DATES ARE ${d1} AND ${d2}`;
        } else if (items.length === 1) {
            return `NORMAL DUE DATES ARE 06/01 AND 09/01`;
        }
        return "";
    };
    let generatedNotes = "";
    const freqText = "SEMI ANNUALLY";
    if (currentYearItems.length >= 2) {
        const dynamicDueDatesNote = buildDueDatesNote(currentYearItems);
        const s1 = currentYearItems[0].status.toUpperCase();
        const s2 = currentYearItems[1].status.toUpperCase();
        const statusString = `${yearVal} 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}`;
        generatedNotes = `${priorText}, ${statusString}, NORMALLY TAXES ARE PAID ${freqText}, ${dynamicDueDatesNote}`;
    } else if (currentYearItems.length === 1) {
        const dynamicDueDatesNote = buildDueDatesNote(currentYearItems);
        const s1 = currentYearItems[0].status.toUpperCase();
        if (isAnyDelinquent) {
            generatedNotes = `${priorText}, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${freqText}, ${dynamicDueDatesNote}`;
        } else {
            generatedNotes = `${priorText}, ${yearVal} TAXES ARE ${s1}, NORMALLY TAXES ARE PAID ${freqText}, ${dynamicDueDatesNote}`;
        }
    } else {
        generatedNotes = priorText;
    }
    return { generatedNotes, delinquentStatus };
};

// For getting taxable and assessed value
async function getTaxableAndAssessed(page) {
    // Navigate to "Supervisor of Assessment" / "Assessed Value Current" section via side menu
    await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('#sidemenu a'));
        const target = links.find(l => l.innerText.includes('Supervisor of Assessment') || l.innerText.includes('Assessed Value Current'));
        if (target) target.click();
    });
    await page.waitForNavigation({ waitUntil: "networkidle2" });
    // Scrape Assessed Value Summary Table for 'Value after BOR' row
    return await page.evaluate(() => {
        let totalAssessed = "";
        let totalTaxable = "";
        const rows = document.querySelectorAll("table[id='Assessed Value Summary'] tr");
        for (let i = 1; i < rows.length; i++) { // Skip header row
            const cells = rows[i].querySelectorAll("td");
            if (cells.length >= 8) {
                const reasonCode = cells[7].innerText.trim();
                // Check if this is the target row
                if (reasonCode === "Value after BOR") {
                    totalAssessed = cells[5].innerText.trim();
                    totalTaxable = cells[6].innerText.trim();
                    break;
                }
            }
        }
        return { totalAssessed, totalTaxable };
    });
}

// For handling the disclaimer page
async function handleDisclaimerPage(page) {
    const currentUrl = page.url();
    if (currentUrl.includes("Disclaimer.aspx")) {
        const agreeButtonSelector = "#btAgree";
        try {
            await page.waitForSelector(agreeButtonSelector);
            await page.click(agreeButtonSelector);
            await page.waitForNavigation({ waitUntil: "networkidle2" });
        } catch (e) {
            console.log("Could not pass the DISCLAIMER page:", e);
        }
    }
}

// For searching parcel ID
async function searchAccountNumber(page, accountNumber) {
    const inputSelector = "#inpParid";
    await page.waitForSelector(inputSelector);
    await page.type(inputSelector, accountNumber);
    const searchButtonSelector = "#btSearch";
    await page.waitForSelector(searchButtonSelector);
    await Promise.all([
        page.waitForNavigation(),
        page.click(searchButtonSelector)
    ]);
}

// CHANGED IN TESTING
// for getting ownerName, propertyAddress
async function getPropertyInfo(page, propertyObj) {
    const data = await page.evaluate(() => {
        let ownerName = "";
        let propertyAddress = "";
        let billedYear = "";
        let billedAmount = "";

        // 1. Scrape Owner and Street Address (Targeting ONLY td elements)
        const bottomHeaders = Array.from(document.querySelectorAll('td.DataletHeaderBottom'));
        let streetAddress = "";
        if (bottomHeaders.length >= 2) {
            ownerName = bottomHeaders[0].innerText.trim();
            streetAddress = bottomHeaders[1].innerText.trim();
        }

        // 2. Scrape Tax Year and City (Targeting ONLY td elements)
        const topHeaders = Array.from(document.querySelectorAll('td.DataletHeaderTop'));
        const yearCellIndex = topHeaders.findIndex(el => el.innerText.includes('Tax Year:'));
        
        let city = "";
        if (yearCellIndex !== -1) {
            // Extract Tax Year
            const match = topHeaders[yearCellIndex].innerText.match(/Tax Year:\s*(\d{4})/);
            if (match) billedYear = match[1];

            // The City cell is immediately after the Tax Year td cell
            if (yearCellIndex + 1 < topHeaders.length) {
                city = topHeaders[yearCellIndex + 1].innerText.trim();
            }
        }

        // Combine Street and City for the full property address
        if (streetAddress && city) {
            propertyAddress = `${streetAddress}, ${city}`;
        } else if (streetAddress) {
            propertyAddress = streetAddress; // Fallback if city isn't found
        }

        // 3. FALLBACK LOGIC: Extract Base Amount from 'Taxes Billed' table
        const billedTableRows = document.querySelectorAll("table[id='Taxes Billed'] tr");
        if (billedTableRows.length > 1) {
            const cells = billedTableRows[1].querySelectorAll("td");
            if (cells.length >= 2) {
                billedAmount = cells[1].innerText.trim();
            }
        }

        return { ownerName, propertyAddress, billedYear, billedAmount };
    });

    propertyObj.owner_name = [data.ownerName];
    propertyObj.property_address = data.propertyAddress;

    // Store fallback internally so we can use it in compileTaxHistory
    propertyObj._fallbackYear = data.billedYear;
    propertyObj._fallbackAmount = data.billedAmount;
}

// Go to "Taxes Due" link and get the installment details
async function scrapeTaxesDue(page) {
    // Navigate to "Taxes Due" section via side menu
    await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('#sidemenu a'));
        const target = links.find(l => l.innerText.includes('Taxes Due'));
        if (target) target.click();
    });
    await page.waitForNavigation({ waitUntil: "networkidle2" });
    // Extract table rows for installments
    return await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table[id='Taxes Due - Treasurer'] tr"));
        const installments = [];
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length >= 9 && !cells[0].innerText.includes('Total')) {
                installments.push({
                    year: cells[0].innerText.trim(),
                    cycle: cells[1].innerText.trim(),
                    dueDate: cells[2].innerText.trim(),
                    taxes: cells[3].innerText.trim(),
                    dateLastPaid: cells[7].innerText.trim(),
                    totalDue: cells[8].innerText.trim()
                });
            }
        }
        return installments;
    });
}

// Go to "Payment History" link and get the recent paid date and amount
async function scrapePaymentHistory(page) {
    // Navigate to "Tax Payment History" section via side menu
    await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('#sidemenu a'));
        const target = links.find(l => l.innerText.includes('Tax Payment History'));
        if (target) target.click();
    });
    await page.waitForNavigation({ waitUntil: "networkidle2" });
    // Extract historical payments
    return await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table[id='Payments'] tr"));
        const payments = [];
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length >= 3) {
                payments.push({
                    paidDate: cells[0].innerText.trim(),
                    paidAmount: cells[1].innerText.trim(),
                });
            }
        }
        return payments;
    });
}

// Mapping the installments details and the paid details
function compileTaxHistory(taxesDueData, paymentHistoryData, propertyObj) {
    let latestYear = "";
    if (taxesDueData && taxesDueData.length > 0) {
        // STANDARD LOGIC: Map specific installments
        for (let install of taxesDueData) {
            latestYear = install.year;
            const record = createTaxHistory();
            record.year = install.year;
            record.due_date = formatToUSDate(install.dueDate);
            record.delq_date = getDelinquentDate(record.due_date);
            record.payment_type = "Semi-Annual";
            const lastPaidFormatted = formatToUSDate(install.dateLastPaid);
            // Match formatted date with the payment history array
            const matchedPayment = paymentHistoryData.find(p => p.paidDate === lastPaidFormatted);
            if (matchedPayment || lastPaidFormatted !== "") {
                record.paid_date = lastPaidFormatted;
                record.amount_paid = matchedPayment ? matchedPayment.paidAmount : "$0.00";
                record.amount_due = "$0.00";
                record.base_amount = record.amount_paid;
                record.status = "Paid";
            } else {
                record.paid_date = "";
                record.amount_paid = "$0.00";
                record.base_amount = install.taxes;
                record.amount_due = install.totalDue;
                const isPastDue = new Date() > new Date(record.due_date);
                record.status = isPastDue ? "Delinquent" : "Due";
            }
            propertyObj.tax_history.push(record);
        }
    } else if (propertyObj._fallbackYear && propertyObj._fallbackAmount) {
        // EDGE CASE LOGIC: Empty Taxes Due table, so we map fallback values to Annual
        latestYear = propertyObj._fallbackYear;
        const record = createTaxHistory();
        record.year = latestYear;
        record.payment_type = "Annual";
        record.base_amount = propertyObj._fallbackAmount;
        // Standard due date fallback assumption for missing table
        record.due_date = `06/01/${parseInt(latestYear) + 1}`;
        record.delq_date = getDelinquentDate(record.due_date);
        // Try exact match on amount first
        const cleanBase = record.base_amount.replace(/[\$,]/g, '').trim();
        let exactMatchPayment = paymentHistoryData.find(p => p.paidAmount.replace(/[\$,]/g, '').trim() === cleanBase);
        let finalPaidDate = "";
        let finalPaidAmount = "$0.00";
        let isPaid = false;
        if (exactMatchPayment) {
            // Found a single payment that exactly matches the billed amount
            finalPaidDate = exactMatchPayment.paidDate;
            finalPaidAmount = exactMatchPayment.paidAmount;
            isPaid = true;
        } else if (paymentHistoryData.length > 0) {
            // No exact single match found. Check for same-day split payments on the most recent date.
            finalPaidDate = paymentHistoryData[0].paidDate;
            // Filter all payments that happened on this latest date
            const sameDayPayments = paymentHistoryData.filter(p => p.paidDate === finalPaidDate);
            // Sum up the amounts
            let totalSum = 0;
            for (const p of sameDayPayments) {
                const amountVal = parseFloat(p.paidAmount.replace(/[\$,]/g, '').trim());
                if (!isNaN(amountVal)) {
                    totalSum += amountVal;
                }
            }
            // Format the sum back to a currency string (e.g., "$1,234.56")
            finalPaidAmount = `$${totalSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            isPaid = true;
        } 
        // if Due amount is $.00
        let dueAmountIsZero = false;
        if (propertyObj._fallbackAmount == "$.00") {
            record.amount_due = "$0.00";
            record.amount_paid = "$0.00";
            record.base_amount = "$0.00";
            record.status = "Paid";
            dueAmountIsZero = true;
        }
        if (isPaid) {
            record.paid_date = finalPaidDate;
            record.amount_paid = finalPaidAmount;
            record.amount_due = "$0.00";
            record.status = "Paid";
        } else if(!dueAmountIsZero) {
            record.amount_paid = "$0.00";
            record.amount_due = record.base_amount;
            const isPastDue = new Date() > new Date(record.due_date);
            record.status = isPastDue ? "Delinquent" : "Due";
        }
        propertyObj.tax_history.push(record);
    }
    // Clean up temporary variables
    delete propertyObj._fallbackYear;
    delete propertyObj._fallbackAmount;
    return latestYear;
}


const account_search = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

            await handleDisclaimerPage(page);
            await searchAccountNumber(page, account);

            const propertyRecord = createPropertyObject();
            const cleanAccountNumber = account.replace(/[\s-]/g, "");
            propertyRecord.parcel_number = cleanAccountNumber;

            // 1. Get Profile / Summary info (And grab Fallbacks)
            await getPropertyInfo(page, propertyRecord);
            // 2. Get Taxes Due Table
            const taxesDueData = await scrapeTaxesDue(page);
            // 3. Get Payments Table
            const paymentHistoryData = await scrapePaymentHistory(page);
            // 4. Merge Data Structures
            const latestTaxYear = compileTaxHistory(taxesDueData, paymentHistoryData, propertyRecord);
            // 5. Generate Dynamic Notes
            if (latestTaxYear) {
                const { generatedNotes, delinquentStatus } = generateNotes(propertyRecord.tax_history, latestTaxYear);
                propertyRecord.notes = generatedNotes;
                propertyRecord.delinquent = delinquentStatus;
            }
            // 6. Get Taxable and Assessed Value
            const taxData = await getTaxableAndAssessed(page);
            propertyRecord.total_assessed_value = taxData.totalAssessed;
            propertyRecord.total_taxable_value = taxData.totalTaxable;

            // 7. Sort the records
            propertyRecord.tax_history.sort((a, b) => {
                const yearA = parseInt(a.year, 10) || 0;
                const yearB = parseInt(b.year, 10) || 0;
                if (yearA !== yearB) {
                    return yearA - yearB;
                }
                if (a.status === "Paid" && b.status !== "Paid") return -1;
                if (a.status !== "Paid" && b.status === "Paid") return 1;
                return 0;
            });
            resolve(propertyRecord);
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

        const url = "https://propertylookup.dupagecounty.gov/search/commonsearch.aspx?mode=parid";

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