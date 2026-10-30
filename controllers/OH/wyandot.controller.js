// Author:- Bhagyashree Badadal

// Parcel No

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "wyandot": {
        url: (cleanAccount) => `http://realestate.co.wyandot.oh.us/re/re-chg.php?account=${cleanAccount}&rec=&detail=Y`,
        auth: "Wyandot County Treasurer, 109 S Sandusky Avenue, Upper Sandusky, OH 43351",
        first_half_due: "02/20",
        first_half_delq: "02/21",
        second_half_due: "08/17",
        second_half_delq: "08/18"
    },
    "noble": {
        url: (cleanAccount) => `http://70.62.18.11/reaweb/re-chg.php?account=${cleanAccount}&rec=1&detail=Y`,
        auth: "Noble County Treasurer, 290 Courthouse Square, Caldwell, OH 43724",
        first_half_due: "02/11",
        first_half_delq: "02/12",
        second_half_due: "08/05",
        second_half_delq: "08/06"
    },
    "hardin": {
        url: (cleanAccount) => `http://realestate.co.hardin.oh.us/re-chg.php?account=${cleanAccount}&rec=1&detail=Y`,
        auth: "Hardin County Treasurer, One Courthouse Square, Suite 230, Kenton, OH 43326",
        first_half_due: "02/11",
        first_half_delq: "02/12",
        second_half_due: "08/05",
        second_half_delq: "08/06"
    }
};

const timeout_option = {
    timeout: 90000,
};

function createPropertyObject(taxing_authority) {
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
        taxing_authority: taxing_authority,
        notes: "",
        delinquent: "NONE",
        tax_history: [],
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

const generate_notes = (year, keys, status1, status2, county_config) => {
    let notes = "";
    try {
        const firstDue = county_config?.first_half_due || "02/20";
        const secondDue = county_config?.second_half_due || "07/17";

        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${(status1).toUpperCase()}, 2ND INSTALLMENT IS ${(status2).toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE ${firstDue} AND ${secondDue}`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

const formatCurrency = (val) => {
    if (val === null || val === undefined || val === '') return '$0.00';
    const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    if (isNaN(num)) return '$0.00';
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const parseCurrency = (str) => {
    if (!str) return 0;
    return parseFloat(String(str).replace(/[^0-9.-]/g, '')) || 0;
};

const formatDate = (dateStr) => {
    if (!dateStr || dateStr === "N/A" || dateStr === "-") return "";
    const clean = dateStr.trim();
    const parts = clean.split('/');
    if (parts.length === 3) {
        const mm = parts[0].padStart(2, '0');
        const dd = parts[1].padStart(2, '0');
        let yyyy = parts[2];
        if (yyyy.length === 2) yyyy = `20${yyyy}`;
        return `${mm}/${dd}/${yyyy}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm}/${dd}/${d.getFullYear()}`;
    }
    return dateStr;
};

function setRecordStatus(record) {
    if (record.amount_due === "$0.00") {
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
}

async function searchAccountNumber(accountNumber, page, url) {
    const cleanAccount = accountNumber ? accountNumber.replace(/[-.]/g, '') : '';
    let targetUrl = '';
    if (typeof url === 'function') {
        targetUrl = url(cleanAccount);
    } else if (typeof url === 'string') {
        targetUrl = url.replace(/\$\{cleanAccount\}|\{cleanAccount\}/g, cleanAccount);
    } else {
        targetUrl = `http://realestate.co.wyandot.oh.us/re/re-chg.php?account=${cleanAccount}&rec=&detail=Y`;
    }

    try {
        await page.goto(targetUrl, { waitUntil: "networkidle2", ...timeout_option });
    } catch (err) {
        console.log("Navigation note:", err?.message || err);
    }
}

async function getDetails(page) {

    const data = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("#maintable tbody tr"));

        const getCleanText = (row, selector = 'td:first-child') => {
            const cell = row?.querySelector(selector);
            return cell ? cell.textContent.replace(/\s+/g, ' ').trim() : '';
        };

        const ownerLine1 = getCleanText(rows[1]);
        const addressLine1 = getCleanText(rows[3]);
        const addressLine2 = getCleanText(rows[4]);
        const assessedValue = getCleanText(rows[3], 'td:last-child');

        const lastRow = rows[rows.length - 1];
        const firstDue = getCleanText(lastRow, 'td:nth-child(3)');
        const secondDue = getCleanText(lastRow, 'td:nth-child(4)');

        return {
            ownerName: `${ownerLine1}`.trim(),
            propertyAddress: `${addressLine1}, ${addressLine2}`.trim(),
            assessedValue,
            firstDue,
            secondDue
        };
    });

    const taxData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#maintable2 tbody tr'));

        const getCleanText = (row, selector) => {
            const cell = row?.querySelector(selector);
            return cell ? cell.textContent.replace(/\s+/g, ' ').trim() : '0.00';
        };

        return {
            firstInstallment: {
                charge: getCleanText(rows[1], 'td:nth-child(4)'),
                credit: getCleanText(rows[2], 'td:nth-child(4)'),
                remitter: getCleanText(rows[3], 'td:nth-child(4)'),
                paid: getCleanText(rows[4], 'td:nth-child(4)')
            },
            secondInstallment: {
                charge: getCleanText(rows[1], 'td:nth-child(6)'),
                credit: getCleanText(rows[2], 'td:nth-child(6)'),
                remitter: getCleanText(rows[3], 'td:nth-child(6)'),
                paid: getCleanText(rows[4], 'td:nth-child(6)')
            }
        };
    });

    const paymentData = await page.evaluate(() => {
        const getCleanText = (row, selector) => {
            const cell = row?.querySelector(selector);
            return cell ? cell.textContent.replace(/\s+/g, ' ').trim() : '';
        };

        const paymentTable = Array.from(document.querySelectorAll('table#maintable2'))
            .find(table => table.textContent.includes('Payment Information'));

        if (!paymentTable) return [];

        const dataRows = Array.from(paymentTable.querySelectorAll('tbody tr'))
            .filter(row => row.querySelectorAll('td').length >= 2);

        return dataRows.map(row => ({
            date: getCleanText(row, 'td:nth-child(1)'),
            amount: getCleanText(row, 'td:nth-child(2)')
        }));
    });

    let taxYear = '';
    try {
        await page.waitForSelector('#history a', { timeout: 10000 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.click('#history a')
        ]);

        const taxYearEl = await page.$('#maintable tbody tr:nth-child(2) td:first-child');
        if (taxYearEl) {
            taxYear = await page.evaluate(el => el.textContent.replace(/\s+/g, ' ').trim(), taxYearEl);
        }
    }
    catch (err) {
        // Silently catch the timeout/navigation error and proceed with taxYear = ''
    }

    // Always return the data, regardless of try/catch outcomes
    return {
        ...data,
        ...taxData,
        paymentData: paymentData,
        taxYear: taxYear || ''
    };
}

async function populateTheObject(data, county_config) {
    const result = createPropertyObject(county_config?.auth);
    if (county_config?.auth) {
        result.taxing_authority = county_config.auth;
    }
    result.owner_name.push(data.ownerName);
    result.property_address = data.propertyAddress;
    result.total_assessed_value = formatCurrency(data.assessedValue);
    result.total_taxable_value = result.total_assessed_value;

    // Check if installment data actually exists before populating tax_history
    const hasInstallmentData =
        data.firstInstallment &&
        data.secondInstallment &&
        (parseCurrency(data.firstInstallment.charge) > 0 ||
            parseCurrency(data.secondInstallment.charge) > 0 ||
            parseCurrency(data.firstInstallment.credit) > 0 ||
            parseCurrency(data.secondInstallment.credit) > 0);

    if (!hasInstallmentData || !data.taxYear) {
        // Keep tax_history empty when no installment data exists
        result.tax_history = [];
        return result;
    }

    const nxtYear = parseInt(data.taxYear, 10) + 1;

    const firstDue = county_config?.first_half_due || "02/20";
    const firstDelq = county_config?.first_half_delq || "02/21";
    const secondDue = county_config?.second_half_due || "08/17";
    const secondDelq = county_config?.second_half_delq || "08/18";

    // IDENTIFY IF HARDIN COUNTY
    const isHardin = county_config?.auth?.toLowerCase().includes("hardin");

    const record1 = createTaxHistory();
    record1.payment_type = "Installment 1";
    record1.year = data.taxYear;
    record1.base_amount = formatCurrency(data.firstInstallment.charge);
    // USE 'PAID' FOR HARDIN, DEFAULT TO 'CREDIT' FOR OTHERS
    record1.amount_paid = isHardin ? formatCurrency(data.firstInstallment.paid) : formatCurrency(data.firstInstallment.credit); 
    record1.amount_due = data.firstDue === "$.00" ? "$0.00" : formatCurrency(data.firstDue);
    record1.due_date = `${firstDue}/${nxtYear}`;
    record1.delq_date = `${firstDelq}/${nxtYear}`;
    setRecordStatus(record1);

    const record2 = createTaxHistory();
    record2.payment_type = "Installment 2";
    record2.year = data.taxYear;
    record2.base_amount = formatCurrency(data.secondInstallment.charge);
    // USE 'PAID' FOR HARDIN, DEFAULT TO 'CREDIT' FOR OTHERS
    record2.amount_paid = isHardin ? formatCurrency(data.secondInstallment.paid) : formatCurrency(data.secondInstallment.credit);
    record2.amount_due = data.secondDue === "$.00" ? "$0.00" : formatCurrency(data.secondDue);
    record2.due_date = `${secondDue}/${nxtYear}`;
    record2.delq_date = `${secondDelq}/${nxtYear}`;
    setRecordStatus(record2);

    const paid1 = parseCurrency(record1.amount_paid);
    const paid2 = parseCurrency(record2.amount_paid);
    const sumOfPaidAmount = +(paid1 + paid2).toFixed(2);
    const isPaid1 = paid1 > 0;
    const isPaid2 = paid2 > 0;
    
    // Filter valid payments (exclude 'remitter' text, zero amounts, and invalid dates)
    // and sort chronologically (earliest to latest)
    const validPayments = (data.paymentData || [])
        .filter(p => p && p.date && /\d/.test(p.date) && parseCurrency(p.amount) > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    let paidDate1 = "";
    let paidDate2 = "";

    const combinedPayment = isPaid1 && isPaid2 && validPayments.find(p =>
        Math.abs(parseCurrency(p.amount) - sumOfPaidAmount) < 0.01
    );
    if (combinedPayment) {
        // Both installments were paid together in this single combined payment
        const singleDate = formatDate(combinedPayment.date);
        paidDate1 = singleDate;
        paidDate2 = singleDate;
    } else {
        // 2. PAID ON DIFFERENT DATES (Image 1) OR ONLY ONE INSTALLMENT PAID
        // Match each installment by its exact amount paid
        const match1 = validPayments.find(p => Math.abs(parseCurrency(p.amount) - paid1) < 0.01);
        const match2 = validPayments.find(p => p !== match1 && Math.abs(parseCurrency(p.amount) - paid2) < 0.01);
        if (match1 && match2) {
            paidDate1 = formatDate(match1.date);
            paidDate2 = formatDate(match2.date);
        }
    }

    record1.paid_date = isPaid1 ? paidDate1 : "";
    record2.paid_date = isPaid2 ? paidDate2 : "";

    result.tax_history.push(record1, record2);

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
            (t) => t.status === "DELINQUENT",
        );
        result.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        // Get the latest tax record (the array is sorted ascending by year)
        const latestTax = result.tax_history[result.tax_history.length - 1];

        // Find individual statuses for the 1st and 2nd installments of the latest year
        const latestYearRecords = result.tax_history.filter(t => String(t.year) === String(latestTax.year));
        const inst1 = latestYearRecords.find(t => t.payment_type === "Installment 1");
        const inst2 = latestYearRecords.find(t => t.payment_type === "Installment 2");

        const status1 = inst1 ? inst1.status : "UNKNOWN";
        const status2 = inst2 ? inst2.status : "UNKNOWN";

        // Check if any PRIOR year is delinquent (exclude the latest year)
        const hasPriorDelinquent = result.tax_history.some(
            (t) => t.status === "DELINQUENT" && String(t.year) !== String(latestTax.year)
        );

        // If priors are delinquent, keys = 0. If priors are paid, keys = 1.
        const keys = hasPriorDelinquent ? 0 : 1;
        result.notes = generate_notes(latestTax.year, keys, status1, status2, county_config);
    }
    return result;
}

// Main flows starts from here
const account_search = async (page, url, accountNumber, county_config) => {
    try {
        if (accountNumber === undefined && county_config === undefined) {
            accountNumber = url;
            county_config = county_data["wyandot"];
            url = county_config.url;
        }

        await searchAccountNumber(accountNumber, page, url);
        const data = await getDetails(page);
        const result = await populateTheObject(data, county_config);
        if (result) {
            result.parcel_number = accountNumber;
        }
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

        const county_config = county_data[req_county];
        const url = county_config.url;

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
            account_search(page, url, account, county_config)
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
                    // await context.close();
                });
        } else if (fetch_type === "api") {
            account_search(page, url, account, county_config)
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
                    // await context.close();
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