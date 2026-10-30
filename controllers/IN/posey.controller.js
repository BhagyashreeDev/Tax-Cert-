import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// --- HELPER: ROBUST ACCEPT BUTTON HANDLER ---
const handleAcceptButton = async (page) => {
    try {
        await page.waitForSelector('button[ng-click="wildfireAccept()"]', { timeout: 8000 });

        await page.waitForFunction(() => {
            const btn = document.querySelector('button[ng-click="wildfireAccept()"]');
            return btn && !btn.hasAttribute('disabled');
        }, { timeout: 8000 });

        await page.evaluate(() => {
            const btn = document.querySelector('button[ng-click="wildfireAccept()"]');
            if (btn) btn.click();
        });

        await new Promise(res => setTimeout(res, 1000));
    } catch (e) {
        // Silently continue if modal is not present
    }
};

// --- HELPER: SEARCH FOR ACCOUNT ---
const performSearch = async (page, url, account) => {
    await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });

    await handleAcceptButton(page);

    // Wait for search box
    await page.waitForSelector("#searchBox", {
        visible: true,
        timeout: 15000
    });

    // Enter account
    await page.evaluate((acc) => {
        const input = document.querySelector("#searchBox");
        input.value = "";
        input.focus();
        input.value = acc;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }, account.toString().trim());

    await new Promise(res => setTimeout(res, 800));

    // Search
    await page.keyboard.press("Enter");

    await page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"]');
        if (btn && !btn.disabled) {
            btn.click();
        }
    });

    // Wait for Angular to render
    await new Promise(res => setTimeout(res, 3000));

    // Wait for View button
    await page.waitForSelector("button.btnView", {
        visible: true,
        timeout: 30000
    });

    // Verify rows
    const rows = await page.$$eval(
        "tbody tr.ng-scope",
        rows => rows.length
    );

    if (rows === 0) {
        throw new Error("No records returned.");
    }
};

// --- POSEY COUNTY IN DATA SCRAPER PIPELINE ---
const ac_1 = async (page, url, account) => {
    try {
        if (!account) {
            throw new Error('Invalid format. Property Number/Account is missing.');
        }

        // STEP 1: Navigate, accept terms, and search
        await performSearch(page, url, account);

        // STEP 2: Map result rows - smart collection based on latest year status
        const rowsConfig = await page.evaluate(() => {
            const trs = document.querySelectorAll('tbody tr.ng-scope');
            if (trs.length === 0) return [];

            let configs = [];
            let seenYears = new Set();

            // First, get the latest year info
            let latestYearIndex = -1;
            let latestYear = null;
            let latestInst1Status = '';
            let latestInst2Status = '';

            for (let i = 0; i < trs.length; i++) {
                const tds = trs[i].querySelectorAll('td');
                if (tds.length < 2) continue;

                const yearText = tds[1].innerText.trim();
                const payStatusNodes = trs[i].querySelectorAll('.payStatus');
                const inst1Status = payStatusNodes[0] ? payStatusNodes[0].innerText.trim() : '';
                const inst2Status = payStatusNodes[1] ? payStatusNodes[1].innerText.trim() : '';

                if (latestYearIndex === -1) {
                    latestYearIndex = i;
                    latestYear = yearText;
                    latestInst1Status = inst1Status;
                    latestInst2Status = inst2Status;
                    break;
                }
            }

            if (latestYearIndex === -1) return [];

            // Check latest year status
            const latestBothPaid = latestInst1Status.toLowerCase().includes('paid') &&
                                   latestInst2Status.toLowerCase().includes('paid');
            const latestHasUnpaid = !latestBothPaid;
            const latestFirstUnpaid = !latestInst1Status.toLowerCase().includes('paid');

            // Now collect based on logic
            for (let i = 0; i < trs.length; i++) {
                const tds = trs[i].querySelectorAll('td');
                if (tds.length < 2) continue;

                const yearText = tds[1].innerText.trim();
                const payStatusNodes = trs[i].querySelectorAll('.payStatus');
                const inst1Status = payStatusNodes[0] ? payStatusNodes[0].innerText.trim() : '';
                const inst2Status = payStatusNodes[1] ? payStatusNodes[1].innerText.trim() : '';

                if (!seenYears.has(yearText)) {
                    seenYears.add(yearText);
                    
                    const bothPaid = inst1Status.toLowerCase().includes('paid') &&
                                   inst2Status.toLowerCase().includes('paid');
                    
                    configs.push({ index: i, year: yearText, inst1Status, inst2Status, bothPaid });

                    // Decision logic:
                    // 1. If latest year is fully paid → only return latest year
                    if (configs.length === 1 && latestBothPaid) {
                        break;
                    }

                    // 2. If latest year has unpaid but first installment is paid (only 2nd unpaid) → only return latest year
                    if (configs.length === 1 && latestHasUnpaid && !latestFirstUnpaid) {
                        break;
                    }

                    // 3. If latest year has unpaid AND first installment is unpaid → get latest + one prior year only
                    if (configs.length === 2 && latestHasUnpaid && latestFirstUnpaid) {
                        break;
                    }
                }
            }

            return configs;
        });

        if (rowsConfig.length === 0) {
            throw new Error('No valid tax year rows found for extraction.');
        }

        let taxHistoryArray = [];
        let primaryData = {};

        // STEP 3: Loop through each year row
        for (let j = 0; j < rowsConfig.length; j++) {
            const config = rowsConfig[j];

            // SPA Reset for iterations after the first
            if (j > 0) {
                await page.goto('about:blank');
                await performSearch(page, url, account);
            }

            await new Promise(res => setTimeout(res, 2000));

            // STEP 4: Click View on the mapped row
            await page.evaluate((idx) => {
                const trs = document.querySelectorAll('tbody tr.ng-scope');
                if (trs[idx]) {
                    const btn = trs[idx].querySelector('button.btnView');
                    if (btn) btn.click();
                }
            }, config.index);

            await page.waitForSelector('.col-md-4.section', {
                visible: true,
                timeout: 30000
            });

            await new Promise(res => setTimeout(res, 1200));

            // STEP 5: Extract owner info, year, due dates, and tax amounts
            const yearDetails = await page.evaluate(() => {
                let result = {
                    ownerName: "",
                    address: "",
                    parcelNumber: "",
                    taxYear: "",
                    inst1DueDate: "",
                    inst2DueDate: "",
                    inst1BaseTax: "$0.00",
                    inst2BaseTax: "$0.00",
                    inst1TotalPaid: "$0.00",
                    inst1AmountDue: "$0.00",
                    inst2TotalPaid: "$0.00",
                    inst2AmountDue: "$0.00"
                };

                // --- Owner Info ---
                const sections = document.querySelectorAll('.col-md-4.section');
                sections.forEach(sec => {
                    const h4 = sec.querySelector('h4');
                    if (h4 && h4.innerText.trim() === 'Owner Information') {
                        const clone = sec.cloneNode(true);
                        clone.querySelector('h4').remove();

                        const raw = clone.innerHTML
                            .replace(/<br\s*[\/]?>/gi, '\n')
                            .replace(/(<([^>]+)>)/gi, '')
                            .replace(/&amp;/g, '&')
                            .replace(/&nbsp;/g, ' ')
                            .trim();

                        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

                        result.ownerName = lines[0] || "";
                        result.address = lines.slice(1).join(', ') || "";
                    }
                });

                // --- Year & Property Number ---
                const allTds = document.querySelectorAll('td');

                for (let i = 0; i < allTds.length; i++) {
                    const label = allTds[i].innerText.trim();

                    if (label === 'Year' && allTds[i + 1]) {
                        result.taxYear = allTds[i + 1].innerText.trim();
                    }

                    if (label === 'Property Number' && allTds[i + 1]) {
                        result.parcelNumber = allTds[i + 1].innerText.trim();
                    }
                }

                // --- Payment Information from infoTable ---
                const infoTables = document.querySelectorAll('table.infoTable');
                infoTables.forEach(table => {
                    const rows = table.querySelectorAll('tr');
                    rows.forEach(row => {
                        const tds = row.querySelectorAll('td');
                        if (tds.length >= 2) {
                            const label = tds[0].innerText.trim();
                            const value = tds[1].innerText.trim();

                            if (label === 'First Half Total Paid') {
                                result.inst1TotalPaid = value;
                            } else if (label === 'First Half Amount Due') {
                                result.inst1AmountDue = value;
                            } else if (label === 'Second Half Total Paid') {
                                result.inst2TotalPaid = value;
                            } else if (label === 'Second Half Amount Due') {
                                result.inst2AmountDue = value;
                            }
                        }
                    });
                });

                // --- Installment Table (for base tax and due dates) ---
                const tbodyRows = document.querySelectorAll('tbody tr');

                let inFirst = false;
                let inSecond = false;

                for (let i = 0; i < tbodyRows.length; i++) {
                    const tds = tbodyRows[i].querySelectorAll('td');
                    if (tds.length === 0) continue;

                    const col0 = tds[0] ? tds[0].innerText.trim() : '';
                    const col1 = tds[1] ? tds[1].innerText.trim() : '';
                    const col2 = tds[2] ? tds[2].innerText.trim() : '';

                    if (col0 === 'First Installment' && col1 === 'Tax') {
                        inFirst = true;
                        inSecond = false;
                        result.inst1BaseTax = col2 || "$0.00";
                        continue;
                    }

                    if (col0 === 'Second Installment' && col1 === 'Tax') {
                        inFirst = false;
                        inSecond = true;
                        result.inst2BaseTax = col2 || "$0.00";
                        continue;
                    }

                    if (inFirst && col0.startsWith('Due:') && !result.inst1DueDate) {
                        result.inst1DueDate = col0.replace('Due:', '').trim();
                    }

                    if (inSecond && col0.startsWith('Due:') && !result.inst2DueDate) {
                        result.inst2DueDate = col0.replace('Due:', '').trim();
                    }
                }

                return result;
            });

            // Fallback year from config if page didn't render it
            if (!yearDetails.taxYear && config.year) {
                yearDetails.taxYear = config.year;
            }

            const taxYear = yearDetails.taxYear;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Parse amounts from Payment Information table
            const parseAmount = (amountStr) => {
                if (!amountStr) return 0;
                const cleaned = amountStr.replace(/[$,]/g, '');
                return parseFloat(cleaned) || 0;
            };

            const inst1DueAmount = parseAmount(yearDetails.inst1AmountDue);
            const inst2DueAmount = parseAmount(yearDetails.inst2AmountDue);

            // Determine status based on Amount Due from Payment Information table
            // If amount due is $0.00, it means PAID
            const resolveStatus = (amountDue, dueDateStr) => {
                if (amountDue === 0) return 'PAID';
                if (!dueDateStr) return 'DUE';
                const [month, day, year] = dueDateStr.split('/').map(Number);
                const dueDate = new Date(year, month - 1, day);
                dueDate.setHours(0, 0, 0, 0);
                return today > dueDate ? 'Delinquent' : 'DUE';
            };

            const inst1Status = resolveStatus(inst1DueAmount, yearDetails.inst1DueDate);
            const inst2Status = resolveStatus(inst2DueAmount, yearDetails.inst2DueDate);

            // Use amounts directly from Payment Information table
            const inst1Paid = yearDetails.inst1TotalPaid || '$0.00';
            const inst1Due = yearDetails.inst1AmountDue || '$0.00';
            const inst2Paid = yearDetails.inst2TotalPaid || '$0.00';
            const inst2Due = yearDetails.inst2AmountDue || '$0.00';

            // Base amount logic:
            // - If PAID: base = Total Paid (includes penalties/fees)
            // - If Due/Delinquent: base = Base Tax only (from Tax Information table)
            const inst1Base = inst1Status === 'PAID' ? inst1Paid : yearDetails.inst1BaseTax;
            const inst2Base = inst2Status === 'PAID' ? inst2Paid : yearDetails.inst2BaseTax;

            // Delinquent date = day after due date
            const shiftDate = (dueDateStr) => {
                if (!dueDateStr) return '';
                const [month, day, year] = dueDateStr.split('/').map(Number);
                const d = new Date(year, month - 1, day + 1);
                return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
            };

            // Push 1st installment row
            taxHistoryArray.push({
                jurisdiction: "County",
                year: taxYear,
                payment_type: "SEMI ANNUAL",
                status: inst1Status,
                base_amount: inst1Base,
                amount_paid: inst1Paid,
                amount_due: inst1Due,
                mailing_date: "N/A",
                due_date: yearDetails.inst1DueDate || "N/A",
                delq_date: shiftDate(yearDetails.inst1DueDate),
                paid_date: "N/A",
                good_through_date: "-",
                installment_number: 1
            });

            // Push 2nd installment row
            taxHistoryArray.push({
                jurisdiction: "County",
                year: taxYear,
                payment_type: "SEMI ANNUAL",
                status: inst2Status,
                base_amount: inst2Base,
                amount_paid: inst2Paid,
                amount_due: inst2Due,
                mailing_date: "N/A",
                due_date: yearDetails.inst2DueDate || "N/A",
                delq_date: shiftDate(yearDetails.inst2DueDate),
                paid_date: "N/A",
                good_through_date: "-",
                installment_number: 2
            });

            // Capture primary data from the first (latest) year only
            if (j === 0) {
                primaryData = {
                    ownerName: yearDetails.ownerName,
                    address: yearDetails.address,
                    parcelNumber: yearDetails.parcelNumber || account.toString().trim()
                };
            }
        }

        // --- SORT: oldest year first ---
        taxHistoryArray.sort((a, b) => {
            const yearDiff = parseInt(a.year, 10) - parseInt(b.year, 10);
            if (yearDiff !== 0) return yearDiff;
            // Within same year: 1st Installment before 2nd
            return a.installment_number - b.installment_number;
        });

        // --- Notes Logic ---
        const isAnyDelinquent = taxHistoryArray.some(r => r.status === 'Delinquent');
        const delinquentStatus = isAnyDelinquent
            ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF"
            : "NONE";

        // Latest year = highest year value in array
        const allYears = [...new Set(taxHistoryArray.map(r => parseInt(r.year, 10)))];
        const maxYear = Math.max(...allYears);
        const minYear = Math.min(...allYears);
        const latestYearRows = taxHistoryArray.filter(r => parseInt(r.year, 10) === maxYear);

        // Determine current year's overall state
        const latestAllPaid = latestYearRows.every(r => r.status === 'PAID');
        const latestHasDelinquent = latestYearRows.some(r => r.status === 'Delinquent');
        const latestHasDue = latestYearRows.some(r => r.status === 'DUE');

        // Prior years (all except maxYear rows)
        const priorRows = taxHistoryArray.filter(r => parseInt(r.year, 10) !== maxYear);
        const priorsDelinquent = priorRows.some(r => r.status === 'Delinquent');

        // 1st and 2nd inst due dates for notes
        const first1stInstRow = latestYearRows.find(r => r.installment_number === 1);
        const inst1DueMM_DD = first1stInstRow?.due_date
            ? first1stInstRow.due_date.slice(0, 5)
            : '';
        const second2ndInstRow = latestYearRows.find(r => r.installment_number === 2);
        const inst2DueMM_DD = second2ndInstRow?.due_date
            ? second2ndInstRow.due_date.slice(0, 5)
            : '';

        const dueDatesNote = inst1DueMM_DD && inst2DueMM_DD
            ? `NORMAL DUE DATES ARE ${inst1DueMM_DD}  AND ${inst2DueMM_DD} `
            : `NORMAL DUE DATE IS ${inst1DueMM_DD || inst2DueMM_DD}`;

        let generatedNotes = "";
        const priorsLabel = priorsDelinquent ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

        if (latestHasDelinquent) {
            generatedNotes = `${priorsLabel}. ${maxYear} TAXES ARE DELINQUENT. NORMALLY TAXES ARE PAID IN SEMI ANNUALLY. ${dueDatesNote}`;
        } else if (latestHasDue) {
            generatedNotes = `${priorsLabel}. ${maxYear} TAXES ARE DUE. NORMALLY TAXES ARE PAID IN SEMI ANNUALLY. ${dueDatesNote}`;
        } else {
            generatedNotes = `${priorsLabel}. ${maxYear} TAXES ARE PAID. NORMALLY TAXES ARE PAID IN SEMI ANNUALLY. ${dueDatesNote}`;
        }

        // --- History Filter ---
        // Smart filtering based on latest year status
        let outputTaxHistory = [...taxHistoryArray];
        
        if (latestAllPaid) {
            // Latest year is fully paid - only show latest year
            outputTaxHistory = latestYearRows;
        } else {
            // Latest year has unpaid installments
            const latestFirstInstRow = latestYearRows.find(r => r.installment_number === 1);
            const latestFirstInstDelinquent = latestFirstInstRow?.status === 'Delinquent';

            if (!latestFirstInstDelinquent) {
                // First installment is not delinquent (it's Due or Paid) - only show latest year
                outputTaxHistory = latestYearRows;
            } else {
                // First installment is delinquent - include prior years but exclude fully paid years
                if (maxYear !== minYear) {
                    const oldestRows = outputTaxHistory.filter(r => parseInt(r.year, 10) === minYear);
                    const oldestAllPaid = oldestRows.every(r => r.status === 'PAID');

                    if (oldestAllPaid) {
                        // Remove the oldest year if it's fully paid
                        outputTaxHistory = outputTaxHistory.filter(r => parseInt(r.year, 10) !== minYear);
                    }
                }
            }
        }

        return {
            processed_date: "",
            order_number: "",
            borrower_name: "",
            owner_name: primaryData.ownerName ? [primaryData.ownerName] : ["N/A"],
            property_address: primaryData.address || "",
            parcel_number: primaryData.parcelNumber || account.toString().trim(),
            land_value: "",
            improvements: "",
            total_assessed_value: "N/A",
            exemption: "",
            total_taxable_value: "N/A",
            taxing_authority: "Posey County, IN",
            notes: generatedNotes,
            delinquent: delinquentStatus,
            tax_history: outputTaxHistory
        };

    } catch (error) {
        console.error("Posey County ac_1 Internal Method Error: ", error);
        throw error;
    }
};

const account_search = async (page, url, account) => {
    try {
        const data = await ac_1(page, url, account);
        return data;
    } catch (error) {
        console.error("Pipeline failure: ", error);
        throw error;
    }
};

// -------------------------------------------------------------------------------------------------------------------------------------------------
// DO NOT TOUCH OR UPDATE THE CODE BELOW THIS BOX - SEARCH METHOD MANAGES CHROMIUM INSTANTIATION ENVIRONMENT AND ROUTING
// -------------------------------------------------------------------------------------------------------------------------------------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://poseycountytax.com/taxes.html#/";

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

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

        if (fetch_type == "html") {
            account_search(page, url, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error)
                    res.status(200).render('error_data', {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        }
        else if (fetch_type == "api") {
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
                .finally(async () => {
                    await context.close();
                });
        }

    }
    catch (error) {
        console.log(error);
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

export {
    search
}
