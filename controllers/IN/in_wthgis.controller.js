// Author :- Vadiraj Joshi
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Dedicated Mapping for Indiana WTHGIS Counties
const county_data = {
    "ohio": { url: "https://ohioin.wthgis.com/", auth: "Ohio County, IN" },
    "switzerland": { url: "https://switzerlandin.wthgis.com/", auth: "Switzerland County, IN" },
    "union": { url: "https://unionin.wthgis.com/", auth: "Union County, IN" }
};

const timeout_option = { timeout: 90000 };

const ac_1 = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            // STEP 1: Navigate and Search
            await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: timeout_option.timeout });
            await page.waitForSelector("#searchBox", timeout_option);
            
            // Give the map's internal AJAX an extra 2 seconds to initialize
            await new Promise(r => setTimeout(r, 2000));

            await page.click("#searchBox", { clickCount: 3 });
            await page.type("#searchBox", account, { delay: 50 });
            
            await new Promise(r => setTimeout(r, 500));
            await page.keyboard.press('Enter');

            // Wait for General Section to load
            await page.waitForFunction(() => {
                return Array.from(document.querySelectorAll('th.leftheader')).some(th => th.textContent.includes('ParcelNumber'));
            }, timeout_option);

            await new Promise(r => setTimeout(r, 1000)); 

            // STEP 2: Extract General Info 
            let page_content = await page.evaluate((account, tax_auth) => {
                const data = {
                    processed_date: new Date().toLocaleDateString("en-US"),
                    order_number: "",
                    borrower_name: "",
                    owner_name: ["N/A"],
                    property_address: "N/A",
                    parcel_number: account,
                    land_value: "-",
                    improvements: "-",
                    total_assessed_value: undefined,
                    exemption: "-",
                    total_taxable_value: undefined,
                    taxing_authority: tax_auth, 
                    notes: "",
                    delinquent: "NONE",              
                    tax_history: []
                };

                document.querySelectorAll("tr").forEach(tr => {
                    let th = tr.querySelector("th.leftheader");
                    let td = tr.querySelector("td");
                    if (th && td) {
                        let label = th.textContent.trim();
                        if (label === "OwnerName") data.owner_name = [td.textContent.trim()];
                        if (label === "OwnerAddress") data.property_address = td.innerHTML.replace(/<br\s*\/?>/gi, ", ").trim();
                        if (label === "ParcelNumber") data.parcel_number = td.textContent.trim();
                    }
                });

                return data;
            }, account, tax_auth);

            // STEP 3: Assessments Section (Strict Table Isolation & Formatting)
            await page.click('div[onmouseup*="showTab(5"]'); 
            await new Promise(r => setTimeout(r, 1000));
            
            const assessmentData = await page.evaluate(() => {
                let assessedVal = "-";
                let latestYearStr = "";
                
                // STRICT MATCH: Isolate only the specific "Assessment History" table
                const tables = Array.from(document.querySelectorAll('table'));
                let targetTable = tables.find(t => {
                    let caption = t.querySelector('caption');
                    return caption && caption.textContent.toLowerCase().includes('assessment history');
                });

                if (targetTable) {
                    const rows = targetTable.querySelectorAll('tr');
                    for (let tr of rows) {
                        const tds = tr.querySelectorAll('td');
                        if (tds.length >= 2) {
                            const yearText = tds[0].textContent.trim();
                            // EXACT MATCH: "YYYY PAY YYYY" (No reliance on .money class)
                            if (/^\d{4}\s+PAY\s+\d{4}$/i.test(yearText)) {
                                assessedVal = tds[1].textContent.trim();
                                latestYearStr = yearText;
                                break; 
                            }
                        }
                    }
                }
                return { assessedVal, latestYearStr };
            });

            const formatCurrencyHelper = (val) => {
                if (val === null || val === undefined || val === '' || val === 'N/A' || val === '-') return '-';
                let num = parseFloat(val.toString().replace(/[$,]/g, ''));
                if (isNaN(num)) return '-';
                return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };

            page_content.total_assessed_value = formatCurrencyHelper(assessmentData.assessedVal);
            page_content.total_taxable_value = page_content.total_assessed_value;

            // STEP 4: Bills Section (Robust Text Pattern Extraction)
            await page.click('div[onmouseup*="showTab(3"]'); 
            await new Promise(r => setTimeout(r, 1000));
            
            const billsData = await page.evaluate(() => {
                let bills = {};
                // Isolate the Bills table strictly by caption
                const tables = Array.from(document.querySelectorAll('table'));
                let targetTable = tables.find(t => {
                    let caption = t.querySelector('caption');
                    return caption && caption.textContent.toLowerCase().includes('taxbill history');
                });
                
                let searchRows = targetTable ? targetTable.querySelectorAll('tr') : document.querySelectorAll('tr');

                for (let tr of searchRows) {
                    const tds = tr.querySelectorAll('td');
                    // Look for 3 columns where the first matches "YYYY PAY YYYY"
                    if (tds.length >= 3) {
                        let yearLabel = tds[0].textContent.trim();
                        if (/^\d{4}\s+PAY\s+\d{4}$/i.test(yearLabel)) {
                            let yearMatch = yearLabel.match(/^(\d{4})/);
                            if (yearMatch) {
                                let yr = yearMatch[1];
                                if (!bills[yr]) {
                                    // Extract amounts safely without CSS dependency
                                    bills[yr] = { 
                                        inst1: tds[1].textContent.trim(), 
                                        inst2: tds[2].textContent.trim() 
                                    };
                                }
                            }
                        }
                    }
                }
                return bills;
            });

            // STEP 5: Payments Section (Robust Date Pattern Extraction)
            await page.click('div[onmouseup*="showTab(2"]'); 
            await new Promise(r => setTimeout(r, 1000));
            
            const paymentsData = await page.evaluate(() => {
                let payments = [];
                // Isolate the Payments table strictly by caption
                const tables = Array.from(document.querySelectorAll('table'));
                let targetTable = tables.find(t => {
                    let caption = t.querySelector('caption');
                    return caption && caption.textContent.toLowerCase().includes('payment history');
                });
                
                let searchRows = targetTable ? targetTable.querySelectorAll('tr') : document.querySelectorAll('tr');

                for (let tr of searchRows) {
                    const tds = tr.querySelectorAll('td');
                    // Check for standard 4-column layout
                    if (tds.length >= 4) {
                        let dateStr = tds[0].textContent.trim();
                        // Validate Date Format (MM/DD/YYYY) to skip headers and noise
                        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
                            let yearStr = tds[1].textContent.trim();
                            let amount = tds[3].textContent.trim(); 
                            
                            payments.push({
                                date: dateStr,
                                year: yearStr,
                                amount: amount,
                                timestamp: new Date(dateStr).getTime()
                            });
                        }
                    }
                }
                return payments;
            });

            // STEP 6: Process Data & Rules Integration
            page_content = await page.evaluate((data, bills, payments) => {
                const formatCurrency = (val) => {
                    if (val === null || val === undefined || val === '' || val === 'N/A' || val === '-') return '-';
                    let num = parseFloat(val.toString().replace(/[$,]/g, ''));
                    if (isNaN(num)) return '-';
                    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                };

                let rawHistory = [];
                let paymentsByYear = {};
                payments.forEach(p => {
                    if (!paymentsByYear[p.year]) paymentsByYear[p.year] = [];
                    paymentsByYear[p.year].push(p);
                });

                const availableYears = Array.from(new Set([...Object.keys(bills), ...Object.keys(paymentsByYear)])).sort((a, b) => parseInt(a) - parseInt(b));
                
                availableYears.forEach(yr => {
                    let yearBills = bills[yr] || { inst1: "$0.00", inst2: "$0.00" };
                    let yearPayments = paymentsByYear[yr] || [];
                    
                    yearPayments.sort((a, b) => a.timestamp - b.timestamp);

                    let payYear = parseInt(yr) + 1; 

                    let base1 = parseFloat(yearBills.inst1.replace(/[$,]/g, '')) || 0;
                    let base2 = parseFloat(yearBills.inst2.replace(/[$,]/g, '')) || 0;
                    let totalBase = base1 + base2;

                    let paymentType = "SEMI ANNUALLY";
                    let isAnnual = false;
                    
                    // Logic to check if paid Annually (either only 1 bill exists, or exactly 1 payment covers total bills)
                    if (base2 === 0) {
                        isAnnual = true;
                    } else if (yearPayments.length === 1) {
                        let singlePaymentAmt = parseFloat(yearPayments[0].amount.replace(/[$,]/g, '')) || 0;
                        // Tolerance for float issues, effectively singlePayment >= totalBase
                        if (singlePaymentAmt >= (totalBase - 0.01) && totalBase > 0) {
                            isAnnual = true;
                        }
                    }

                    if (isAnnual) {
                        // --- ANNUAL COMBINED ROW ---
                        let paidObj = yearPayments.length > 0 ? yearPayments[0] : null;
                        let paidAmt = paidObj ? parseFloat(paidObj.amount.replace(/[$,]/g, '')) : 0;
                        let paidDate = paidObj ? paidObj.date : "N/A";
                        
                        let due = Math.max(0, totalBase - paidAmt);
                        let status = due === 0 && paidAmt > 0 ? "PAID" : "DUE";
                        
                        let due_date = `05/11/${payYear}`;
                        let delq_date = `05/12/${payYear}`;

                        if (status === "DUE") {
                            const d1 = new Date(delq_date);
                            const today = new Date();
                            d1.setHours(0,0,0,0); today.setHours(0,0,0,0);
                            if (today > d1) status = "DELINQUENT";
                        }

                        rawHistory.push({
                            jurisdiction: "County",
                            year: yr,
                            payment_type: "ANNUALLY",
                            installment_number: 1,
                            status: status,
                            base_amount: formatCurrency(totalBase),
                            amount_paid: formatCurrency(paidAmt),
                            amount_due: formatCurrency(due),
                            penalty_interest: "$0.00",
                            due_date: due_date,
                            delq_date: delq_date,
                            paid_date: paidDate,
                            good_through_date: "-"
                        });

                    } else {
                        // --- Installment 1 (Spring) ---
                        let inst1PaidObj = yearPayments.length > 0 ? yearPayments[0] : null;
                        let paid1 = inst1PaidObj ? parseFloat(inst1PaidObj.amount.replace(/[$,]/g, '')) : 0;
                        let inst1PaidDate = inst1PaidObj ? inst1PaidObj.date : "N/A";
                        
                        let inst1Due = `05/11/${payYear}`;
                        let inst1Delq = `05/12/${payYear}`;
                        let due1 = Math.max(0, base1 - paid1);
                        
                        let status1 = "DUE";
                        if (due1 === 0 && paid1 > 0) status1 = "PAID";
                        
                        if (status1 === "DUE") {
                            const d1 = new Date(inst1Delq);
                            const today = new Date();
                            d1.setHours(0,0,0,0); today.setHours(0,0,0,0);
                            if (today > d1) status1 = "DELINQUENT";
                        }

                        rawHistory.push({
                            jurisdiction: "County",
                            year: yr,
                            payment_type: "SEMI ANNUALLY",
                            installment_number: 1,
                            status: status1,
                            base_amount: formatCurrency(base1),
                            amount_paid: formatCurrency(paid1),
                            amount_due: formatCurrency(due1),
                            penalty_interest: "$0.00",
                            due_date: inst1Due,
                            delq_date: inst1Delq,
                            paid_date: inst1PaidDate,
                            good_through_date: "-"
                        });

                        // --- Installment 2 (Fall) ---
                        let inst2PaidObj = yearPayments.length > 1 ? yearPayments[1] : null;
                        let paid2 = inst2PaidObj ? parseFloat(inst2PaidObj.amount.replace(/[$,]/g, '')) : 0;
                        let inst2PaidDate = inst2PaidObj ? inst2PaidObj.date : "N/A";

                        let inst2Due = `11/11/${payYear}`;
                        let inst2Delq = `11/12/${payYear}`;
                        let due2 = Math.max(0, base2 - paid2);

                        let status2 = "DUE";
                        if (due2 === 0 && paid2 > 0) status2 = "PAID";

                        if (status2 === "DUE") {
                            const d2 = new Date(inst2Delq);
                            const today = new Date();
                            d2.setHours(0,0,0,0); today.setHours(0,0,0,0);
                            if (today > d2) status2 = "DELINQUENT";
                        }

                        rawHistory.push({
                            jurisdiction: "County",
                            year: yr,
                            payment_type: "SEMI ANNUALLY",
                            installment_number: 2,
                            status: status2,
                            base_amount: formatCurrency(base2),
                            amount_paid: formatCurrency(paid2),
                            amount_due: formatCurrency(due2),
                            penalty_interest: "$0.00",
                            due_date: inst2Due,
                            delq_date: inst2Delq,
                            paid_date: inst2PaidDate,
                            good_through_date: "-"
                        });
                    }
                });

                // Sort newest to oldest to apply the trimming rules
                rawHistory.sort((a, b) => {
                    if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year);
                    return b.installment_number - a.installment_number;
                });

                let filteredHistory = [];
                let uniqueYearsDesc = [...new Set(rawHistory.map(h => h.year))];

                for (let i = 0; i < uniqueYearsDesc.length; i++) {
                    let y = uniqueYearsDesc[i];
                    let yearRows = rawHistory.filter(h => h.year === y);
                    
                    // A year is completely delinquent only if NO installments have been paid
                    let isCompletelyDelq = yearRows.every(r => r.status === "DUE" || r.status === "DELINQUENT");
                    
                    // A year is fully paid only if ALL installments are paid
                    let isFullyPaid = yearRows.every(r => r.status === "PAID");

                    if (i === 0) {
                        // Always push the absolute latest year
                        filteredHistory.push(...yearRows);
                        
                        // Stop if ANY payment was applied to the latest year
                        if (!isCompletelyDelq) {
                            break; 
                        }
                    } else {
                        if (isFullyPaid) {
                            break; // Do not include fully paid prior years
                        } else {
                            filteredHistory.push(...yearRows);
                            
                            // Stop going back if this year has any payment applied
                            if (!isCompletelyDelq) {
                                break; 
                            }
                        }
                    }
                }

                // Final sort Output ASCENDING (Oldest to Newest)
                data.tax_history = filteredHistory.sort((a, b) => {
                    if (a.year !== b.year) return parseInt(a.year) - parseInt(b.year);
                    return a.installment_number - b.installment_number;
                });
                
                data.tax_history.forEach(item => delete item.installment_number);

                // --- Note & Delinquent Logic ---
                if (data.tax_history.length > 0) {
                    const allYears = data.tax_history.map(h => parseInt(h.year, 10));
                    const maxYear = Math.max(...allYears);
                    data.year = maxYear.toString();

                    // Check strictly for "DELINQUENT" status. A status of "DUE" is not delinquent.
                    const isAnyDelinquent = data.tax_history.some(h => h.status.includes("DELINQUENT"));
                    
                    // Check if PRIOR years are DUE or DELINQUENT
                    const isPriorYearPaid = !data.tax_history.some(h => h.year !== data.year && (h.status.includes("DELINQUENT") || h.status.includes("DUE")));
                    
                    // Box should only say PRIORS ARE DELINQUENT if actual prior years are unpaid
                    data.delinquent = !isPriorYearPaid ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF" : "NONE";

                    const currentYearInst = data.tax_history.filter(h => h.year === data.year);

                    let dynamicDueDatesNote = "";
                    let basePaymentType = "ANNUALLY";
                    let statusString = "";

                    if (currentYearInst.length >= 2) {
                        basePaymentType = "SEMI ANNUALLY";
                        const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
                        const shortDueTwo = currentYearInst[1].due_date.substring(0, 5);
                        dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} AND ${shortDueTwo}`;
                        statusString = `${data.year} 1ST INSTALLMENT IS ${currentYearInst[0].status}, 2ND INSTALLMENT IS ${currentYearInst[1].status}`;
                    } else if (currentYearInst.length === 1) {
                        basePaymentType = "ANNUALLY";
                        const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
                        dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
                        statusString = `${data.year} TAXES ARE ${currentYearInst[0].status}`;
                    }

                    // Generate notes without falsely injecting "DELINQUENT" into the current year string if it's only DUE
                    if (isAnyDelinquent) {
                        if (isPriorYearPaid) {
                            data.notes = `ALL PRIORS ARE PAID, ${data.year} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        } else {
                            data.notes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        }
                    } else {
                        data.notes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    }
                } else {
                    data.notes = "No tax history extracted.";
                }

                return data;
            }, page_content, billsData, paymentsData);

            resolve(page_content);
        } catch(error) {
            console.log(error);
            reject(new Error("No Record Found / Error in Extraction"));
        }
    });
}

const account_search = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, baseUrl, account, tax_auth)
                .then((data1) => resolve(data1))
                .catch((error) => {
                    console.log(error);
                    reject(new Error(error.message));
                });
        } catch(error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
}

const search = async (req, res) => {
    const requestedCountyKey = req.path.replace('/', '').toLowerCase(); 
    const countyInfo = county_data[requestedCountyKey];
    const { fetch_type, account } = req.body;

    try {
        if (!countyInfo) {
            return res.status(404).json({ error: true, message: "County configuration context lost." });
        }

        if (fetch_type !== "html" && fetch_type !== "api") {
            return res.status(200).render('error_data', { error: true, message: "Invalid Access" });
        }

        const baseUrl = countyInfo.url.replace(/\/$/, ""); 
        const tax_auth = countyInfo.auth;

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(timeout_option.timeout);

        if(fetch_type == "html"){
            account_search(page, baseUrl, account, tax_auth)
            .then((data) => { res.status(200).render("parcel_data_official", data); })
            .catch((error) => {
                console.log(error);
                res.status(200).render('error_data', { error: true, message: error.message });
            })
            .finally(async () => { await context.close(); });
        } else if (fetch_type == "api") {
            account_search(page, baseUrl, account, tax_auth)
            .then((data) => { res.status(200).json({ result: data }); })
            .catch((error) => {
                console.log(error);
                res.status(500).json({ error: true, message: error.message });
            })
            .finally(async() => { await context.close(); });
        }
    } catch(error) {
        console.log(error);
        if(fetch_type == "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
}

export { search }
