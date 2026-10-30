// Author: M M Prateek

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000
};

// MULTI-COUNTY CONFIGURATION
const county_data = {
    "clay": {
        url: "https://mn-clay.publicaccessnow.com/TaxSearch.aspx",
        auth: "Clay County Auditor-Treasurer, MN"
    },
    "clearwater": {
        url: "https://mn-clearwater.manatron.com/TaxSearch.aspx",
        auth: "Clearwater County Auditor-Treasurer, MN"
    },
    "roseau": {
        url: "https://mn-roseau.publicaccessnow.com/TaxSearch.aspx",
        auth: "Roseau County Auditor-Treasurer, MN"
    },
    "washington": {
        url: "https://mn-washington.publicaccessnow.com/TaxSearch.aspx",
        auth: "Washington County Property Records & Taxpayer Services, MN"
    }
};

const get_half_amount = (amount) => {
    let num = amount.replace(/[$,]/g, "");
    let half = (num / 2).toFixed(2);
    return "$" + half;
};

const account_search = async (page, url, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

            // 1. Wait for the Search Input to load
            await page.waitForSelector('input[name="ParcelID"]', timeout_option);
            
            // 2. Type the account at a medium pace like a human to trigger Angular validation
            await page.type('input[name="ParcelID"]', account.trim(), { delay: 100 });
            await page.keyboard.press('Tab');

            // Force Angular to recognize the input explicitly
            await page.evaluate(() => {
                const input = document.querySelector('input[name="ParcelID"]');
                if (input) {
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                }
            });

            // 3. Wait for the Search button to become enabled
            await page.waitForFunction(() => {
                const btn = document.querySelector('button[title="Search"]');
                return btn && !btn.disabled;
            }, timeout_option);

            // 4. Click the Search button
            await page.evaluate(() => {
                const btn = document.querySelector('button[title="Search"]');
                if (btn) btn.click();
            });

            // 5. Wait for the Account Summary to load (proves we are on the details page)
            await page.waitForSelector('payment-account-summary-entry', timeout_option);

            // 6. SPEED OPTIMIZATION: Check for sections dynamically without long timeouts
            // First, wait briefly to see if ANY bill grids (Current or Delinquent) populate
            await page.waitForSelector('payment-bill-grid table tbody tr', { timeout: 5000 }).catch(() => {});

            // Next, check if the Payment History accordion exists. If yes, click and wait briefly.
            const historyExists = await page.$('a[href="#prgmCollapse01"]');
            if (historyExists) {
                await page.evaluate(() => {
                    const historyBtn = document.querySelector('a[href="#prgmCollapse01"]');
                    // Check if it's currently collapsed (aria-expanded="false")
                    if (historyBtn && historyBtn.getAttribute('aria-expanded') === 'false') {
                        historyBtn.click();
                    }
                });
                // Wait for the history rows to inject into the DOM
                await page.waitForSelector('#prgmCollapse01 table.table-striped tbody tr', { timeout: 8000 }).catch(() => {});
            }

            // Small buffer to guarantee Angular rendering is completely finished
            await new Promise(r => setTimeout(r, 1500));

            // 7. Execute extraction
            const page_content = await page.evaluate(({ account, tax_auth }) => {
                
                const formatDollar = (val) => {
                    if (!val || val === "N/A" || val.trim() === "") return "$0.00";
                    if (val.toString().trim().startsWith("$")) return val.trim();
                    return "$" + val.trim();
                };

                const getDlData = (labelStr) => {
                    const dts = Array.from(document.querySelectorAll('dt'));
                    const targetDt = dts.find(dt => dt.textContent.includes(labelStr));
                    if (targetDt) {
                        let next = targetDt.nextElementSibling;
                        while (next && next.tagName !== 'DD' && next.tagName !== 'DT') {
                            next = next.nextElementSibling;
                        }
                        if (next && next.tagName === 'DD') {
                            let val = next.textContent.trim();
                            if (val.toLowerCase() === "not applicable" || val === "") return "N/A";
                            return val;
                        }
                    }
                    return "N/A";
                };

                const standardizeDate = (dateString) => {
                    if (!dateString || dateString === "N/A") return "N/A";
                    const parts = dateString.split('/');
                    if (parts.length === 3) {
                        let y = parts[2];
                        if (y.length === 2) y = "20" + y;
                        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${y}`;
                    }
                    return dateString;
                };

                const getNextDay = (dateString) => {
                    if (!dateString || dateString === "N/A") return "N/A";
                    const parts = dateString.split('/');
                    if (parts.length !== 3) return "N/A";
                    
                    let year = parseInt(parts[2]);
                    if (year < 100) year += 2000; 
                    
                    const d = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
                    if (isNaN(d)) return "N/A";
                    d.setDate(d.getDate() + 1);
                    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
                };

                const parseDollar = (val) => parseFloat(val.replace(/[$,]/g, '')) || 0;

                let allRecords = [];

                // --- EXTRACT CURRENT & DELINQUENT YEARS ---
                const billGrids = document.querySelectorAll('payment-bill-grid table tbody');
                billGrids.forEach(tbody => {
                    const rows = tbody.querySelectorAll('tr');
                    rows.forEach(row => {
                        const cols = row.querySelectorAll('td');
                        // Current Due usually has 6+ columns
                        if (cols.length >= 6) { 
                            const year = cols[0].textContent.trim();
                            const dueDate = standardizeDate(cols[1].textContent.trim());
                            
                            let baseTax = cols[2].textContent.trim();
                            const baseMatch = baseTax.match(/\$([\d,]+\.\d{2})/);
                            if (baseMatch) baseTax = baseMatch[0];

                            const paidTax = cols[3].textContent.trim();
                            const amountDue = cols[4].textContent.trim();
                            const rawStatus = cols[5].textContent.trim().replace(/●/g, '').trim() || "Due";
                            
                            if (year && !year.toLowerCase().includes("total")) {
                                allRecords.push({
                                    year: year,
                                    due_date: dueDate,
                                    paid_date: "N/A",
                                    base_amount: baseTax,
                                    amount_paid: paidTax,
                                    amount_due: amountDue,
                                    status: rawStatus,
                                    isHistory: false
                                });
                            }
                        }
                    });
                });

                // --- EXTRACT PAYMENT HISTORY ---
                const historyTbodies = document.querySelectorAll('#prgmCollapse01 table tbody');
                historyTbodies.forEach(tbody => {
                    const rows = tbody.querySelectorAll('tr');
                    rows.forEach(row => {
                        const cols = row.querySelectorAll('td');
                        // Washington has 5 columns, Clay has 6. >= 5 captures both.
                        if (cols.length >= 5) {
                            const year = cols[0].textContent.trim();
                            let datePaid = cols[2].textContent.trim();
                            // Amount Paid is always the last column
                            const amountPaid = cols[cols.length - 1].textContent.trim();
                            
                            datePaid = datePaid && datePaid !== "" ? standardizeDate(datePaid) : "N/A";

                            if (year && !year.toLowerCase().includes("total")) {
                                allRecords.push({
                                    year: year,
                                    due_date: "N/A",
                                    paid_date: datePaid,
                                    base_amount: amountPaid, 
                                    amount_paid: amountPaid,
                                    amount_due: "$0.00",
                                    status: "Paid",
                                    isHistory: true
                                });
                            }
                        }
                    });
                });

                // MISSING DATA HANDLER
                if (allRecords.length === 0) {
                    return { error: "No Payment Details Found" };
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const processed_date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                // --- EXTRACT ACCOUNT INFORMATION ---
                const owner = getDlData("Owner of Record:");
                const property_address = getDlData("Property Address:");
                const taxing_district = getDlData("Taxing District:");

                let legalDesc = "N/A";
                const ths = Array.from(document.querySelectorAll('th span'));
                const descTh = ths.find(span => span.textContent.includes("Property Description"));
                if (descTh) {
                    const table = descTh.closest('table');
                    if (table) {
                        const tdSpan = table.querySelector('tbody td span');
                        if (tdSpan) legalDesc = tdSpan.textContent.trim();
                    }
                }

                const data = {
                    processed_date: processed_date,
                    order_number: "N/A",
                    borrower_name: "N/A",
                    owner_name: owner !== "N/A" ? [owner] : ["N/A"],
                    property_address: property_address,
                    parcel_number: account,
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemption: "N/A",
                    total_taxable_value: "N/A",
                    taxing_authority: taxing_district !== "N/A" ? taxing_district : tax_auth,
                    notes: "",
                    delinquent: "NONE",
                    tax_history: [],
                    property_details: {
                        record_type: "Real Estate",
                        acres: "N/A",
                        lots: "N/A",
                        buildings: "N/A",
                        description: legalDesc,
                        district_levy: "N/A",
                        city_levy: "N/A",
                        total_appraisal: "N/A"
                    }
                };

                let yearsMap = {};
                allRecords.forEach(r => {
                    if (!yearsMap[r.year]) yearsMap[r.year] = [];
                    yearsMap[r.year].push(r);
                });

                const sortedYears = Object.keys(yearsMap).sort((a, b) => b - a);

                let hasPriorDue = false;
                let holdsDelinquency = false;
                let totalDueAcc = 0;
                let processedHistory = [];

                for (let i = 0; i < sortedYears.length; i++) {
                    let year = sortedYears[i];
                    let rawRecords = yearsMap[year];
                    
                    // Filter exact duplicates to prevent processing the same row twice if scraped redundantly
                    let uniqueRecords = [];
                    let seen = new Set();
                    rawRecords.forEach(r => {
                        let key = `${r.due_date}-${r.paid_date}-${r.amount_due}-${r.amount_paid}-${r.status}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            uniqueRecords.push(r);
                        }
                    });

                    // Check for Semi-Annual vs Annual based on remaining records
                    let isSemiAnnual = uniqueRecords.length > 1;

                    // EXCEPTION LOGIC: If multiple records exist, but all are PAID on the exact same date -> Force Annual
                    if (isSemiAnnual) {
                        let allPaid = uniqueRecords.every(r => r.status === "Paid");
                        let allSamePaidDate = uniqueRecords.every(r => r.paid_date === uniqueRecords[0].paid_date && r.paid_date !== "N/A");
                        
                        if (allPaid && allSamePaidDate) {
                            isSemiAnnual = false; // Override to Annual
                        }
                    }

                    // Check if all records for this year are Paid to handle the loop STOP logic
                    let isFullyPaid = uniqueRecords.every(r => r.status === "Paid");

                    // THE STOP LOGIC: Always print the newest year. Stop at first fully paid past year.
                    if (i > 0 && isFullyPaid) {
                        break; 
                    }

                    if (i > 0 && !isFullyPaid) {
                        hasPriorDue = true;
                    }

                    if (!isSemiAnnual) {
                        // --- AGGREGATE INTO 1 ROW FOR ANNUAL ---
                        let totalDue = 0;
                        let totalPaid = 0;
                        let totalBase = 0;
                        let finalStatus = "Paid";
                        let dueDate = "N/A";
                        let paidDate = "N/A";
                        
                        uniqueRecords.forEach(r => {
                            totalDue += parseDollar(r.amount_due);
                            totalPaid += parseDollar(r.amount_paid);
                            totalBase += parseDollar(r.base_amount);
                            
                            if (r.status !== "Paid") finalStatus = "Due";
                            if (r.status.toLowerCase().includes("past due") || r.status.toLowerCase().includes("delinquent")) finalStatus = "Delinquent";
                            
                            if (r.due_date !== "N/A") dueDate = r.due_date;
                            if (r.paid_date !== "N/A") paidDate = r.paid_date;
                        });

                        // Calculate base amount properly if missing
                        if (totalBase === 0 && (totalDue > 0 || totalPaid > 0)) {
                            totalBase = totalDue + totalPaid;
                        }

                        let delqDate = "N/A";
                        if (finalStatus !== "Paid" && dueDate !== "N/A") {
                            delqDate = getNextDay(dueDate);
                            if (today >= new Date(delqDate)) finalStatus = "Delinquent";
                        }

                        if (finalStatus === "Delinquent") holdsDelinquency = true;
                        if (finalStatus !== "Paid") totalDueAcc += totalDue;

                        processedHistory.push({
                            jurisdiction: "County",
                            year: year,
                            payment_type: "Annual",
                            status: finalStatus,
                            base_amount: formatDollar(totalBase.toString()),
                            county_tax: "N/A",
                            city_tax: "N/A",
                            fees: "$0.00",
                            penalty: "N/A",
                            cost: "N/A",
                            amount_paid: formatDollar(totalPaid.toString()),
                            amount_due: formatDollar(totalDue.toString()),
                            paid_date: paidDate,
                            due_date: dueDate,
                            delq_date: delqDate,
                            land_value: "N/A",
                            improvements: "N/A",
                            total_assessed_value: "N/A",
                            exemptions_breakdown: {
                                residential_exemption: "0.00",
                                homestead_exemption: "0.00",
                                other_exemptions: "0.00",
                                local_option_credit: "0.00"
                            }
                        });
                    } else {
                        // --- KEEP AS 2 SEPARATE ROWS FOR SEMI-ANNUAL ---
                        uniqueRecords.forEach(r => {
                            let finalStatus = r.status;
                            let delqDate = "N/A";
                            
                            if (finalStatus !== "Paid" && r.due_date !== "N/A") {
                                delqDate = getNextDay(r.due_date);
                                if (today >= new Date(delqDate)) finalStatus = "Delinquent";
                            }

                            if (r.status.toLowerCase().includes("past due") || r.status.toLowerCase().includes("delinquent")) {
                                finalStatus = "Delinquent";
                            }

                            if (finalStatus === "Delinquent") holdsDelinquency = true;
                            
                            let amtDueNum = parseDollar(r.amount_due);
                            if (finalStatus !== "Paid") totalDueAcc += amtDueNum;

                            let baseAmtNum = parseDollar(r.base_amount);
                            if (baseAmtNum === 0) baseAmtNum = parseDollar(r.amount_due) + parseDollar(r.amount_paid);

                            processedHistory.push({
                                jurisdiction: "County",
                                year: r.year,
                                payment_type: "Semi-Annual",
                                status: finalStatus,
                                base_amount: formatDollar(baseAmtNum.toString()),
                                county_tax: "N/A",
                                city_tax: "N/A",
                                fees: "$0.00",
                                penalty: "N/A",
                                cost: "N/A",
                                amount_paid: formatDollar(r.amount_paid),
                                amount_due: formatDollar(r.amount_due),
                                paid_date: r.paid_date,
                                due_date: r.due_date,
                                delq_date: delqDate,
                                land_value: "N/A",
                                improvements: "N/A",
                                total_assessed_value: "N/A",
                                exemptions_breakdown: {
                                    residential_exemption: "0.00",
                                    homestead_exemption: "0.00",
                                    other_exemptions: "0.00",
                                    local_option_credit: "0.00"
                                }
                            });
                        });
                    }
                }

                // Dynamic Notes Logic
                let notesText = "ALL PRIORS ARE PAID";
                if (processedHistory.length > 0) {
                    const topYear = processedHistory[0]; // Newest year record
                    const shortDueDate = topYear.due_date !== "N/A" ? topYear.due_date.substring(0, 5) : "10/15";
                    
                    if (hasPriorDue) {
                        notesText = `PRIORS ARE DELINQUENT, ${topYear.year} TAXES ARE ${topYear.status.toUpperCase()}, NORMALLY TAXES ARE PAID ${topYear.payment_type.toUpperCase()}, NORMAL DUE DATE IS ${shortDueDate}`;
                    } else {
                        notesText = `ALL PRIORS ARE PAID, ${topYear.year} TAXES ARE ${topYear.status.toUpperCase()}, NORMALLY TAXES ARE PAID ${topYear.payment_type.toUpperCase()}, NORMAL DUE DATE IS ${shortDueDate}`;
                    }
                }
                
                data.notes = notesText;
                data.delinquent = holdsDelinquency ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
                data.total_amount_due = formatDollar(totalDueAcc.toString());

                // ASCENDING SORT LOGIC: Ensures tax_history is ordered from oldest to newest
                processedHistory.sort((a, b) => parseInt(a.year) - parseInt(b.year));
                data.tax_history = processedHistory;

                return { result: data };
            }, { account, tax_auth });

            if (page_content.error) {
                throw new Error(page_content.error);
            }

            resolve(page_content);

        } catch (error) {
            console.log(error);
            reject(new Error(error.message.includes("No Payment Details Found") ? "No Payment Details Found" : "No Record Found / Invalid Parcel"));
        }
    });
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    const county = req.county || req.path.replace('/', '').toLowerCase();

    try {
        if (!county_data[county]) {
            return res.status(404).json({ error: true, message: `County endpoint '${county}' not found in configuration.` });
        }

        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const target_url = county_data[county].url;
        const target_auth = county_data[county].auth;

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

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
            account_search(page, target_url, account, target_auth)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data.result);
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
            account_search(page, target_url, account, target_auth)
                .then((data) => {
                    res.status(200).json(data);
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
}

export {
    search
}
