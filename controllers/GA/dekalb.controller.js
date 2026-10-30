// Author:- Bhagyashree Badadal

// IN TEST SERVER CAPTCHA CAME


import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

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
        taxing_authority: "DeKalb County Tax Commissioner, 4380 Memorial Drive, Suite 100, Decatur, GA 30032",
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
        paid_date: "-",
        good_through_date: "-",
    };
}

const generateNotes = (taxHistoryArray, yearVal) => {
    if (!taxHistoryArray || taxHistoryArray.length === 0) {
        return { generateNotes: "NO VALID TAX RECORDS FOUND.", delinquentStatus: "NONE" };
    }

    const currentYearItems = taxHistoryArray.filter(h => String(h.year) === String(yearVal));
    const olderItems = taxHistoryArray.filter(h => parseInt(h.year, 10) < parseInt(yearVal, 10));

    const isAnyDelinquent = taxHistoryArray.some(h => h.status === "Delinquent");
    const delinquentStatus = isAnyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

    const isPriorYearPaid = !olderItems.some(h => h.status === "Delinquent");
    const priorText = isPriorYearPaid ? "ALL PRIORS ARE PAID" : "PRIORS ARE DELINQUENT";

    const buildDueDatesNote = `NORMAL DUE DATES ARE 09/30 AND 11/15`;

    let generateNotes = "";
    if (currentYearItems.length === 1) {
        const s1 = currentYearItems[0].status.toUpperCase();
        generateNotes = `${priorText}, ${yearVal} TAXES ARE ${s1}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${buildDueDatesNote}`;
    } else if (currentYearItems.length >= 2) {
        const s1 = currentYearItems[0].status.toUpperCase();
        const s2 = currentYearItems[1].status.toUpperCase();
        const statusString = `${yearVal} 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}`;

        generateNotes = `${priorText}, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${buildDueDatesNote}`;
    } else {
        generateNotes = `${priorText}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${buildDueDatesNote}`;
    }

    return { generateNotes, delinquentStatus };
};

// Handle the welcome pop-up disclaimer
async function handleDisclaimer(page) {
    const btnSelector = '[data-test="intro-modal-button"]';
    try {
        // Wait for modal button to appear
        const modalButton = await page.waitForSelector(btnSelector, { visible: true, timeout: 15000 });
        if (modalButton) {
            // Click using evaluate to prevent click interception issues
            await page.evaluate((selector) => {
                const btn = document.querySelector(selector);
                if (btn) btn.click();
            }, btnSelector);

            // Wait for the modal element to detach/hide completely from DOM
            await page.waitForSelector(btnSelector, { hidden: true, timeout: 8000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 1000)); // Smooth buffer for DOM transition
        }
    } catch (e) {
        console.log("Disclaimer modal not found or timed out. Proceeding directly...");
    }
}

// Search the parcel-ID
async function searchAccountNumber(accountNumber, page) {
    // Primary & Fallback selectors for Vue InstantSearch component
    const searchSelector = 'input[placeholder="Enter a name, address, parcel ID, or PIN"], .ais-Autocomplete input, input[aria-label*="Enter a name"]';
    const searchButtonSelector = 'button[data-test="search-button"]';

    try {
        const inputElement = await page.waitForSelector(searchSelector, { visible: true, timeout: 20000 });
        
        // Focus, clear, and type into input
        await inputElement.click({ clickCount: 3 });
        await inputElement.type(accountNumber, { delay: 50 });

        // Submit via search icon button if available, or fall back to Enter key
        const searchBtn = await page.$(searchButtonSelector);
        if (searchBtn) {
            await searchBtn.click();
        } else {
            await page.keyboard.press("Enter");
        }
    } catch (error) {
        console.error("Failed to find or interact with the search input element.");
        throw error; 
    }
}

// Select the result from the ResultGrid
async function checkingTheResultGrid(page) {
    const firstViewButtonSelector = 'div[data-test="property"] button[data-test="view"]';
    try {
        const viewButton = await page.waitForSelector(firstViewButtonSelector, { visible: true, timeout: 10000 });
        if (viewButton) {
            await viewButton.click();
        }
    } catch (error) {
        return;
    }
}

// Get ownerName, address, paid records, and due records
async function getPropertyDetails(page) {
    const addressSelector = "[data-test='situs-address']";
    await page.waitForSelector(addressSelector, { visible: true, timeout: 15000 });
    const address = await page.$eval(addressSelector, el => el.textContent.trim());

    const ownerSelector = '[data-test="owner-name"]';
    await page.waitForSelector(ownerSelector, { visible: true, timeout: 10000 });
    const owner = await page.$eval(ownerSelector, el => el.textContent.trim());

    const duesResult = await getDuesIfExist(page);

    const propertyDetailSelector = '[data-test="property.details.property_details"]';
    let propertyDetailLink = null;
    try {
        await page.waitForSelector(propertyDetailSelector, { visible: true, timeout: 5000 });
        propertyDetailLink = await page.$eval(propertyDetailSelector, el => el.href);
    } catch (e) {
    }

    if (propertyDetailLink) {
        await page.goto(propertyDetailLink, { waitUntil: "networkidle2" });
    }

    let legacyTaxData = null;
    if (!duesResult.doesDueExist && propertyDetailLink) {
        const tableSelector = 'table[id="Tax (Penalties and Interest Included through Current Date)"]';
        try {
            await page.waitForSelector(tableSelector, { visible: true, timeout: 10000 });
            legacyTaxData = await page.evaluate((selector) => {
                const table = document.querySelector(selector);
                if (!table) return null;

                const rows = Array.from(table.querySelectorAll("tr"));
                if (rows.length < 2) return null;

                const firstDataRowCells = rows[1].querySelectorAll("td");
                if (firstDataRowCells.length < 5) return null;

                const targetYear = firstDataRowCells[0].textContent.trim();

                let totalBilled = 0;
                let totalPaid = 0;
                let totalDue = 0;

                for (let i = 1; i < rows.length; i++) {
                    const cells = rows[i].querySelectorAll("td");
                    if (cells.length < 5) continue;

                    const rowYear = cells[0].textContent.trim();
                    if (rowYear === 'Total:') break;

                    if (rowYear === targetYear) {
                        const billed = parseFloat(cells[2].textContent.replace(/,/g, '')) || 0;
                        const paid = parseFloat(cells[3].textContent.replace(/,/g, '')) || 0;
                        const due = parseFloat(cells[4].textContent.replace(/,/g, '')) || 0;

                        totalBilled += billed;
                        totalPaid += paid;
                        totalDue += due;
                    }
                }

                return {
                    year: targetYear,
                    baseTax: totalBilled.toFixed(2),
                    paidAmount: totalPaid.toFixed(2),
                    due: totalDue.toFixed(2)
                };
            }, tableSelector);
        } catch (e) {
        }
    }

    return {
        address,
        owner,
        duesData: duesResult.data,
        doesDueExist: duesResult.doesDueExist,
        taxInfo: legacyTaxData
    };
}

// Get all due records
async function getDuesIfExist(page) {
    const tableSelector = 'table.bill-summary-desktop';
    try {
        await page.waitForSelector(tableSelector, { timeout: 5000 });
    } catch (e) {
        return { data: [], doesDueExist: false };
    }

    const records = await page.evaluate(() => {
        const rows = document.querySelectorAll('table.bill-summary-desktop tbody tr');
        let taxYear = null;
        const records = [];

        rows.forEach(row => {
            if (row.matches('tr[data-test="bill-group-header"]')) {
                const text = row.innerText.trim();
                const match = text.match(/\d{4}/);
                if (match) {
                    taxYear = match[0];
                }
                return;
            }

            const installmentCell = row.querySelector('td[data-test="installment-description"]');
            if (!installmentCell) return;

            const getText = (selector) => {
                const element = row.querySelector(selector);
                return element ? element.innerText.trim() : '';
            };

            records.push({
                taxYear: taxYear,
                installment: installmentCell.innerText.trim(),
                dueDate: getText('td[data-test="installment-due-date"]'),
                status: getText('[data-test="installment-status-badge"]'),
                amountBilled: getText('td[data-test="installment-amount-billed"]'),
                balance: getText('td[data-test="installment-balance"]')
            });
        });

        return records;
    });

    const doesDueExist = Array.isArray(records) && records.length > 0;
    return { data: records, doesDueExist };
}

// Get assessed values
async function getAssessedValue(page) {
    const urls = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("#sidemenu ul.navigation li a"));
        const valueHistoryLink = links.find(a => a.textContent.trim() === "Value History")?.href;
        const paymentSummaryLink = links.find(a => a.textContent.trim() === "Payment Summary")?.href;
        return { valueHistoryLink, paymentSummaryLink };
    });

    if (urls.valueHistoryLink) {
        await page.goto(urls.valueHistoryLink, { waitUntil: "networkidle2" });
    }

    const assessedSelector = 'table[id="Assessed Values"]';
    let assessedValue = "0.00";
    try {
        await page.waitForSelector(assessedSelector, { visible: true, timeout: 10000 });
        assessedValue = await page.evaluate((selector) => {
            const table = document.querySelector(selector);
            const headerRow = table ? table.querySelector("tr") : null;
            const firstRow = headerRow ? headerRow.nextElementSibling : null;
            const cells = firstRow ? firstRow.querySelectorAll("td") : [];
            return cells[2]?.textContent.trim() || "0.00";
        }, assessedSelector);
    } catch (e) {
    }
    return { assessedValue, link: urls.paymentSummaryLink };
}

// Get mapped payment history
async function getMappedPaymentHistory(page, targetYear) {
    const paymentTableSelector = 'table[id="Payment *reversals in bold"]';
    try {
        await page.waitForSelector(paymentTableSelector, { visible: true, timeout: 10000 });
    } catch (e) {
        return { inst1: { paidAmount: 0, paidDate: null }, inst2: { paidAmount: 0, paidDate: null } };
    }

    const rawPayments = await page.evaluate((selector, year) => {
        const table = document.querySelector(selector);
        const rows = Array.from(table.querySelectorAll("tr")).slice(1);
        const yearSuffix = year ? year.toString().slice(-2) : "";
        const payments = [];

        for (const row of rows) {
            const cells = row.querySelectorAll("td");
            if (cells.length < 6) continue;

            const pymtType = cells[0].textContent.trim();
            const dateStr = cells[2].textContent.trim();
            const amountStr = cells[5].textContent.trim().replace(/,/g, '');

            if (!yearSuffix || pymtType.endsWith(yearSuffix)) {
                payments.push({
                    date: dateStr,
                    amount: parseFloat(amountStr) || 0
                });
            }
        }
        return payments;
    }, paymentTableSelector, targetYear);

    rawPayments.sort((a, b) => new Date(a.date) - new Date(b.date));

    let inst1 = { paidAmount: 0, paidDate: null };
    let inst2 = { paidAmount: 0, paidDate: null };

    if (rawPayments.length === 1) {
        inst1.paidAmount = rawPayments[0].amount;
        inst1.paidDate = rawPayments[0].date;
    } else if (rawPayments.length >= 2) {
        inst1.paidAmount = rawPayments[0].amount;
        inst1.paidDate = rawPayments[0].date;

        inst2.paidAmount = rawPayments[1].amount;
        inst2.paidDate = rawPayments[1].date;
    }
    return { inst1, inst2 };
}

// Populate the final object
async function populateObject(page, data, assessedValue, details) {
    const usCurrencyFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    });

    const parseCurrency = (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        return parseFloat(val.replace(/[^0-9.-]+/g, "")) || 0;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
    };

    const calculateDelinquentDate = (dueDateStr) => {
        if (!dueDateStr) return "";
        const d = new Date(dueDateStr);
        if (isNaN(d.getTime())) return "";
        d.setDate(d.getDate() + 1);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
    };

    const result = createPropertyObject();
    if (data.owner) result.owner_name.push(data.owner);
    result.property_address = data.address || "";

    const numAssessed = parseCurrency(assessedValue);
    result.total_assessed_value = usCurrencyFormatter.format(numAssessed);
    result.total_taxable_value = usCurrencyFormatter.format(numAssessed);

    let targetYear = "";

    if (data.doesDueExist && data.duesData && data.duesData.length > 0) {
        targetYear = data.duesData[0].taxYear || "";

        data.duesData.forEach(item => {
            const record = createTaxHistory();
            record.year = item.taxYear;

            if (item.installment) {
                if (String(item.installment).includes("1")) {
                    record.payment_type = "Installment 1";
                } else if (String(item.installment).includes("2")) {
                    record.payment_type = "Installment 2";
                } else {
                    record.payment_type = item.installment;
                }
            }

            const billedVal = parseCurrency(item.amountBilled);
            const dueVal = parseCurrency(item.balance);
            const paidVal = Math.max(0, billedVal - dueVal);

            record.base_amount = usCurrencyFormatter.format(billedVal);
            record.amount_due = usCurrencyFormatter.format(dueVal);
            record.amount_paid = usCurrencyFormatter.format(paidVal);

            record.due_date = item.dueDate ? formatDate(item.dueDate) : "";
            record.delq_date = item.dueDate ? calculateDelinquentDate(item.dueDate) : "";

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const dueDateObj = new Date(item.dueDate);
            dueDateObj.setHours(0, 0, 0, 0);

            if (!isNaN(dueDateObj.getTime()) && today <= dueDateObj) {
                record.status = "Due";
            } else {
                record.status = "Delinquent";
            }

            result.tax_history.push(record);
        });
    } else if (data.taxInfo) {
        targetYear = data.taxInfo.year;
        const { inst1, inst2 } = details || { inst1: { paidAmount: 0, paidDate: null }, inst2: { paidAmount: 0, paidDate: null } };
        const baseTaxVal = parseCurrency(data.taxInfo.baseTax || data.taxInfo.paidAmount || 0);
        const dueVal = parseCurrency(data.taxInfo.due || 0);

        if (inst2.paidAmount === 0 && inst2.paidDate === null) {
            const record = createTaxHistory();
            record.year = data.taxInfo.year;
            record.base_amount = usCurrencyFormatter.format(baseTaxVal);
            record.amount_paid = usCurrencyFormatter.format(inst1.paidAmount || 0);
            record.amount_due = usCurrencyFormatter.format(dueVal);

            record.paid_date = inst1.paidDate || "-";
            record.status = dueVal > 0 ? "Delinquent" : "Paid";

            const yrNum = parseInt(record.year, 10);
            record.due_date = `09/30/${yrNum}`;
            record.delq_date = `10/01/${yrNum}`;
            result.tax_history.push(record);
        } else {
            const halfBaseTax = Math.round((baseTaxVal / 2) * 100) / 100;
            const yrNum = parseInt(data.taxInfo.year, 10);

            const record1 = createTaxHistory();
            record1.year = data.taxInfo.year;
            record1.base_amount = usCurrencyFormatter.format(halfBaseTax || 0);
            record1.amount_paid = usCurrencyFormatter.format(inst1.paidAmount || 0);
            record1.amount_due = "$0.00";
            record1.paid_date = inst1.paidDate;
            record1.status = "Paid";
            record1.due_date = `09/30/${yrNum}`;
            record1.delq_date = `10/01/${yrNum}`;

            const record2 = createTaxHistory();
            record2.year = data.taxInfo.year;
            record2.base_amount = usCurrencyFormatter.format(halfBaseTax || 0);
            record2.amount_paid = usCurrencyFormatter.format(inst2.paidAmount || 0);
            record2.amount_due = "$0.00";
            record2.paid_date = inst2.paidDate;
            record2.status = "Paid";
            record2.due_date = `11/15/${yrNum}`;
            record2.delq_date = `11/16/${yrNum}`;

            result.tax_history.push(record1, record2);
        }
    }

    result.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) return yearA - yearB;

        const getInstNum = (paymentType) => {
            if (!paymentType) return 99;
            if (paymentType.includes("1")) return 1;
            if (paymentType.includes("2")) return 2;
            return 99;
        };

        return getInstNum(a.payment_type) - getInstNum(b.payment_type);
    });

    const noteData = generateNotes(result.tax_history, targetYear);
    result.notes = noteData.generateNotes;
    result.delinquent = noteData.delinquentStatus;
    return result;
}

const account_search = async (page, url, accountNumber) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2" });
        
        // 1. Handle the disclaimer modal
        await handleDisclaimer(page);

        // 2. Search for the parcel-ID
        await searchAccountNumber(accountNumber, page);

        // 3. Select from the result grid
        await checkingTheResultGrid(page);

        // 4. Get the property details
        const data = await getPropertyDetails(page);

        // 5. Get assessedValue and important links
        const { assessedValue, link: paymentSummaryLink } = await getAssessedValue(page);

        // 6. Map paid dates for paid records
        let details = null;
        if (paymentSummaryLink && data.taxInfo) {
            await page.goto(paymentSummaryLink, { waitUntil: "networkidle2" });
            details = await getMappedPaymentHistory(page, data.taxInfo.year);
        }

        // 7. Populate object with gathered data
        const result = await populateObject(page, data, assessedValue, details);
        return result;
    } catch (error) {
        console.error("Error inside account_search:", error);
        throw error;
    }
};

const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    if (account) {
        account = String(account).trim();
    }
    
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
        return res.status(200).render('error_data', {
            error: true,
            message: "Invalid Access"
        });
    }

    let context;
    try {
        const url = `https://govhub.com/tax/ga-dekalb/`;

        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        
        // Ensure standardized viewport dimensions
        await page.setViewport({ width: 1280, height: 800 });

        // Modernized User Agent string
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            // Block heavy non-essential assets to boost speed
            if (req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        const data = await account_search(page, url, account);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else {
            res.status(200).json({ result: data });
        }

    } catch (error) {
        console.log("Error inside search:", error);
        
        if (fetch_type === "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    } finally {
        if (context) {
            await context.close();
        }
    }
};

export { search };