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
        taxing_authority: "Riverside County Treasurer-Tax Collector, 4080 Lemon St, Riverside, CA 92501",
        notes: "",
        tax_history: [],
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
        paid_date: "N/A",
        good_through_date: "-",
    };
}

// For generating notes
const generate_notes = (year, keys, latestYearRecords) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID, ${year} `
                : `PRIORS ARE DELINQUENT, ${year} `;

        const formatShortDate = (dateStr) => {
            if (!dateStr) return "";
            return dateStr.split("/").slice(0, 2).join("/");
        };

        // if we have both the installments (real-estate)
        if (latestYearRecords.length === 2) {
            const th_1 = latestYearRecords[0];
            const th_2 = latestYearRecords[1];
            notes += `1ST INSTALLMENT IS ${th_1.status.toUpperCase()}, 2ND INSTALLMENT IS ${th_2.status.toUpperCase()}, `
            notes += `NORMALLY TAXES ARE PAID SEMI-ANNUALLY, `;
            notes += `NORMAL DUE DATES ARE 11/01 AND 02/01`;
        } 
        // if we have only 1 installment (personal property)
        else if (latestYearRecords.length === 1) {
            const th_1 = latestYearRecords[0];
            notes += `1ST INSTALLMENT IS ${th_1.status.toUpperCase()}, `;
            notes += `NORMALLY TAXES ARE PAID SEMI-ANNUALLY, `;
            notes += `NORMAL DUE DATE IS ${formatShortDate(th_1.due_date)}`;
        }
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// For searching parcel-ID
async function searchAccountNumber(accountNumber, page) {
  const inputSelector = 'input[title="PIN (9-digits)"]';
  const searchBtnSelector = 'button[title="Search"]';

  await page.waitForSelector(inputSelector, { visible: true });
  await page.click(inputSelector);
  await page.type(inputSelector, accountNumber, { delay: 50 });

  await page.waitForSelector(`${searchBtnSelector}:not([disabled])`, { visible: true });
  await page.click(searchBtnSelector);
}

// For getting ownerName
async function extractOwnerName(page) {
    const ownerName = await page.evaluate(() => {
        const h2s = Array.from(document.querySelectorAll("td.ui-widget-content h2"));
        const ownerH2 = h2s.find(h => h.textContent.includes("Current Owner:"));
        if (ownerH2) {
            return ownerH2.textContent.replace("Current Owner:", '').trim();
        }
        return null;
    });
    return ownerName;
}

// For getting status of the property(Active/Inactive)
async function extractPropertyStatus(page) {
    return await page.evaluate(()=>{
        const row = document.querySelector('table.table-bordered tbody tr');
        if (!row) return "";
        const tds = row.querySelectorAll('td');
        return tds[2] ? tds[2].textContent.trim() : "";
    });
}

// For getting address, propertyType(personal/real-estate)
async function extractAndNavigateToResult(page) {
  const linkSelector = 'a[href^="/AccountSearch/Processing.aspx"]';
  await page.waitForSelector(linkSelector, { visible: true, ...timeout_option });

  // get the address and propertyType
  const propertyInfo = await page.evaluate(() => {
    const row = document.querySelector('.table-condensed tbody tr');
    if (!row) return { address: "", propertyType: "" };

    const tds = row.querySelectorAll('td');
    const address = tds[1] ? tds[1].textContent.replace('Property Addr.', '').trim() : "";
    const propertyType = tds[2] ? tds[2].textContent.trim() : "";
    return { address, propertyType };
  });

  // store url from "ViewAccount" button, to go to the main page
  const relativeUrl = await page.$eval(linkSelector, el => el.getAttribute("href"));
  const baseUrl = "https://ca-riverside-ttc.publicaccessnow.com";
  const fullUrl = new URL(relativeUrl, baseUrl).href;
  await page.goto(fullUrl, { waitUntil: "networkidle2", ...timeout_option });
  await page.waitForSelector('td.ui-widget-content h2', { visible: true, ...timeout_option });

  return propertyInfo;
}

// Extract the table data
async function extractBillTableData(page, isPaidSection) {
    return await page.evaluate((isPaid) => {
        const tables = Array.from(document.querySelectorAll('table.table-bordered'));
        const targetTable = isPaid ? tables.find(t => t.closest('#collapsePaid') && t.textContent.includes('Tax Year')) : tables.find(t => !t.closest('#collapsePaid') && t.textContent.includes('Tax Year'));

        if (!targetTable) return null;

        const linkElement = targetTable.querySelector('a[href^="/AccountSearch/AccountSummary/BillDetail.aspx"]') ||
            document.querySelector('a[href^="/AccountSearch/AccountSummary/BillDetail.aspx"]');
        // Store the url from "View Bill Detail" to fetch assessed value
        const billUrl = linkElement ? linkElement.getAttribute("href") : null;

        // get the taxYear
        const yearHeader = targetTable.querySelector('th') ? Array.from(targetTable.querySelectorAll('th')).find(th => th.textContent.includes('Tax Year')) : null;
        const taxYear = yearHeader ? yearHeader.textContent.replace('Tax Year', '').replace(':', '').trim() : "";
        const rows = Array.from(targetTable.querySelectorAll('tbody tr')).filter(row =>
            !row.textContent.includes('Total Bill') && row.textContent.includes('Installment')
        );

        // get the data from the table
        const installments = rows.map((row, index) => {
            const cells = row.querySelectorAll('td');
            const rawInstallmentText = cells[0] ? cells[0].textContent.trim() : "";
            const numericMatch = rawInstallmentText.match(/\d+/);
            const installmentNum = numericMatch ? parseInt(numericMatch[0], 10) : 1;
            return {
                installment: installmentNum,
                tax: cells[1] ? cells[1].textContent.trim() : "$0.00",
                otherCharges: cells[2] ? cells[2].textContent.trim() : "$0.00",
                totalPaid: cells[3] ? cells[3].textContent.trim() : "$0.00",
                total: cells[4] ? cells[4].textContent.trim() : "$0.00",
                tableDueDate: cells[5] ? cells[5].textContent.trim() : "",
                paidDate: isPaid ? (cells[6] ? cells[6].textContent.trim() : "") : "",
                status: isPaid ? "Paid" : "Due"
            };
        });
        return { taxYear, billUrl, installments };
    }, isPaidSection);
}

// this will click on the "Click here to view previously paid tax bills" and load the paid tax history
async function expandPaidBillsSection(page) {
    const expandBtnSelector = 'button[data-target="#collapsePaid"]';
    await page.waitForSelector(expandBtnSelector, { visible: true });
    await page.evaluate((selector) => {
        document.querySelector(selector).scrollIntoView();
    }, expandBtnSelector);

    await page.click(expandBtnSelector);

    const firstTableSelector = '#collapsePaid table.table-bordered';
    await page.waitForSelector(firstTableSelector, { visible: true, ...timeout_option });
    await new Promise(r => setTimeout(r, 1000));
}

// For getting the assessed value, just navigate to this url
async function navigateToBillDetail(page, relativeUrl) {
    const baseUrl = "https://ca-riverside-ttc.publicaccessnow.com";
    const fullUrl = new URL(relativeUrl, baseUrl).href;

    await page.goto(fullUrl, { waitUntil: "domcontentloaded", ...timeout_option });
    await page.waitForSelector('.table-bordered td.ui-widget-content.left', { visible: true, ...timeout_option });
}

// For getting assessed value
async function extractNetTaxableValue(page) {
    const netTaxableValue = await page.evaluate(() => {
        const leftCells = Array.from(document.querySelectorAll('td.ui-widget-content.left'));
        const targetCell = leftCells.find(cell => cell.textContent.includes('Net Taxable Value'));
        if (targetCell && targetCell.nextElementSibling) {
            return targetCell.nextElementSibling.textContent.trim();
        }
        return "N/A";
    });
    return netTaxableValue;
}

// Main dashboard of the account
async function extractAccountDetailsAndBill(page, propertyInfo, accountNumber) {
    // creating main object
    const result = createPropertyObject();

    // populating parcel-id, address, ownerName
    result.parcel_number = accountNumber;
    result.property_address = propertyInfo.address;
    const ownerName = await extractOwnerName(page);
    result.owner_name = ownerName ? [ownerName] : ["N/A"];

    // Get the propertyStatus(Active/Inactive)
    const propertyStatus = await extractPropertyStatus(page);

    // If it is not active than we return object with (parcel-id, address, ownerName)
    if (propertyStatus !== "Active") {
        return result;
    }

    // Checking for unpaid due table
    const hasUnpaidTable = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table.table-bordered'));
        return !!tables.find(t => !t.closest('#collapsePaid') && t.textContent.includes('Tax Year'));
    });

    let billData = null;

    // If the account have unpaid due table
    if (hasUnpaidTable) {
        // If the property is of "Real-estate" then it might have 2 installments (both paid/ both unpaid/ one paid-one unpaid)
        if (propertyInfo.propertyType == "Real") {
            // this will be unpaid 2nd installment data
            const billData2 = await extractBillTableData(page, false);
            const hasInstallment2 = billData2.installments.some(inst => inst.installment === 2);
            // if we have 2nd installment, then we check in paid table for 1st installment
            if (hasInstallment2) {
                await expandPaidBillsSection(page);
                // this will be paid 1st installment data
                const billData1 = await extractBillTableData(page, true);
                // Combine both billData1 and billData2 into billData
                billData = {
                    ...billData2,
                    installments: [
                        ...(billData1 ? billData1.installments : []),
                        ...billData2.installments
                    ]
                };
            } else {
                billData = billData2;
            }
        }
        // If the property is Personal property
        else { 
            billData = await extractBillTableData(page, false);
        }
    }
    // If the property has only paid table (i.e their are no dues to be paid) 
    else {
        await expandPaidBillsSection(page);
        billData = await extractBillTableData(page, true);
    }

    // Iterate over the obtained data and populate
    if (billData && billData.installments.length > 0) {
        for (const inst of billData.installments) {
            // create record for each installment
            const record = createTaxHistory();
            record.year = billData.taxYear;
            record.base_amount = inst.tax;
            record.amount_paid = inst.totalPaid ? inst.totalPaid.replace(/[()]/g, '') : "$0.00";
            record.amount_due = inst.total;
            record.paid_date = inst.paidDate;
            record.payment_type = `Installment ${inst.installment}`;
            record.due_date = inst.tableDueDate;
            record.status = inst.status;

            // due and delq date
            let d = new Date(record.due_date);
            d.setDate(d.getDate() + 1);
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const yyyy = d.getFullYear();
            record.delq_date = `${mm}/${dd}/${yyyy}`;

            // status 
            if (inst.status === "Due") {
                const today = new Date();
                const dueDate = new Date(record.due_date);
                const delqDate = new Date(record.delq_date);

                if (today >= delqDate) record.status = "Delinquent";
                else record.status = "Due";
            }

            result.tax_history.push(record);
        }

        // get the assessed value
        if (billData.billUrl) {
            await navigateToBillDetail(page, billData.billUrl);
            result.total_taxable_value = await extractNetTaxableValue(page);
            result.total_assessed_value = result.total_taxable_value;
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

    // deciding notes and delinquency
    if (result.tax_history.length > 0) {
       
        const hasDelinquent = result.tax_history.some(
            (t) => t.status === "Delinquent",
        );
        result.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        // Get the latest tax record (the array is sorted ascending by year)
        const latestTax = result.tax_history[result.tax_history.length - 1];

        // becuase we have installments 
        const latestYearRecords = result.tax_history
            .filter(t => String(t.year) === String(latestTax.year))
            .sort((a, b) => {
                const numA = parseInt(a.payment_type.match(/\d+/)?.[0] || 1);
                const numB = parseInt(b.payment_type.match(/\d+/)?.[0] || 1);
                return numA - numB;
            });

        // Check if any PRIOR year is delinquent (exclude the latest year)
        const hasPriorDelinquent = result.tax_history.some(
            (t) => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
        );

        // If priors are delinquent, keys = 0. If priors are paid, keys = 1.
        const keys = hasPriorDelinquent ? 0 : 1;
        result.notes = generate_notes(latestTax.year, keys, latestYearRecords);
    }
    return result;
}

const account_search = async (page, url, account) => {
  try {
    await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

    // 1. Search parcel-ID 
    await searchAccountNumber(account, page);

    // 2. Tap on the "ViewAccount" button
    const propertyInfo = await extractAndNavigateToResult(page);

    // 3. Parse Main dashboard page
    const result = await extractAccountDetailsAndBill(page, propertyInfo, account);

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

        const url = "https://ca-riverside-ttc.publicaccessnow.com/PropertySearch.aspx";

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