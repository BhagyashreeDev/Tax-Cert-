// Author :- Vadiraj Joshi

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Mapping specifically for Alabama CAD Portals
const county_data = {
    "crenshaw": { url: "https://crenshaw.alabamagis.com/Crenshaw/frameset.cfm?cfid=3f4dba23-6f58-4531-bb22-a1cf9a169412&cftoken=0", auth: "Crenshaw County, AL" },
    "lamar": { url: "https://lamar.alabamagis.com/Lamar/frameset.cfm?cfid=790cf05c-411e-428f-ab75-65d2a965b0d8&cftoken=0", auth: "Lamar County, AL" }
};

const timeout_option = { timeout: 90000 };

// Helper function to format strings safely to clean currency format ($XX.XX)
const formatCurrency = (valStr) => {
    if (!valStr || valStr.trim() === "" || valStr.trim() === "N/A" || valStr.trim() === "-") return "$0.00";
    let clean = valStr.replace(/[$,]/g, "").trim();
    let num = parseFloat(clean);
    if (isNaN(num)) return "$0.00";
    return "$" + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ac_1 = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        let newPage = null; // Track new tab for memory cleanup
        try {
            // Navigate directly to the frameset URL
            await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: timeout_option.timeout });
            
            // Allow time for the ColdFusion frameset to render children
            await new Promise(r => setTimeout(r, 2000));

            // Safely locate the initial Search Frame 
            const searchFrame = page.frames().find(f => f.name() === 'searchFrame' || f.url().includes('Search.cfm'));
            if (!searchFrame) throw new Error("Search frame could not be located in the DOM layout.");

            // ---------------------------------------------------------
            // STEP 1: Parse the account string and fill the 7 input map
            // ---------------------------------------------------------
            // Sanitize input: Strip non-numbers and strictly grab the first 16 digits to drop trailing garbage
            let cleanAccount = account.replace(/[^0-9]/g, '').substring(0, 16);
            
            if (cleanAccount.length < 16) throw new Error("Invalid parcel number length. Expected at least 16 digits.");

            // Extract the parts backwards to ensure exact mapping regardless of prefix padding
            let map7 = cleanAccount.slice(-3);
            let map6 = cleanAccount.slice(-6, -3);
            let map5 = cleanAccount.slice(-9, -6);
            let map4 = cleanAccount.slice(-10, -9);
            let map3 = cleanAccount.slice(-12, -10);
            let map2 = cleanAccount.slice(-14, -12);
            let map1 = cleanAccount.slice(-16, -14);

            await searchFrame.waitForSelector('input[name="Master__Map1"]', timeout_option);
            
            // Clear and type into each box safely
            await searchFrame.evaluate(() => { document.querySelectorAll('input[name^="Master__Map"]').forEach(el => el.value = ''); });
            await searchFrame.type('input[name="Master__Map1"]', map1);
            await searchFrame.type('input[name="Master__Map2"]', map2);
            await searchFrame.type('input[name="Master__Map3"]', map3);
            await searchFrame.type('input[name="Master__Map4"]', map4);
            await searchFrame.type('input[name="Master__Map5"]', map5);
            await searchFrame.type('input[name="Master__Map6"]', map6);
            await searchFrame.type('input[name="Master__Map7"]', map7);

            // ---------------------------------------------------------
            // STEP 2: Click Search
            // ---------------------------------------------------------
            await Promise.all([
                searchFrame.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => null),
                searchFrame.evaluate(() => {
                    const searchBtn = document.querySelector('input[value="Search"][name="submit"]');
                    if (searchBtn) searchBtn.click();
                })
            ]);

            // Give the application a brief moment to update frames with content
            await new Promise(r => setTimeout(r, 2000));

            // ---------------------------------------------------------
            // STEP 3: Dynamically Find Results Frame & Trigger Click
            // ---------------------------------------------------------
            let resultsFrame = null;
            
            for (const frame of page.frames()) {
                try {
                    const found = await frame.$('img[alt*="property record card"], img[src*="detail.gif"], a[href*="prc_Main.cfm"]');
                    if (found) {
                        resultsFrame = frame;
                        break;
                    }
                } catch (err) {
                    // Fail silently for isolated cross-origin frames
                }
            }

            if (!resultsFrame) {
                resultsFrame = searchFrame;
            }

            await resultsFrame.waitForSelector('img[src*="detail.gif"], a[href*="prc_Main.cfm"]', timeout_option);
            
            const browser = page.browser();
            const pageTarget = page.target();
            
            await resultsFrame.evaluate(() => {
                const element = document.querySelector('img[alt*="property record card"]') || 
                                document.querySelector('img[src*="detail.gif"]') || 
                                document.querySelector('a[href*="prc_Main.cfm"]');
                
                if (element) {
                    const clickableAnchor = element.tagName === 'A' ? element : element.closest('a');
                    if (clickableAnchor) {
                        clickableAnchor.click();
                    } else {
                        element.click();
                    }
                } else {
                    throw new Error("Unable to locate the Open Property Record Card element context.");
                }
            });

            const newTarget = await browser.waitForTarget(target => target.opener() === pageTarget, timeout_option);
            newPage = await newTarget.page();

            await newPage.bringToFront();
            await newPage.waitForSelector("table", timeout_option);
            await new Promise(r => setTimeout(r, 2000));

            // ---------------------------------------------------------
            // STEPS 4, 5, 6, 7: Extract from the New Tab
            // ---------------------------------------------------------
            const extractedData = await newPage.evaluate((tax_auth_name) => {
                const data = {
                    processed_date: new Date().toLocaleDateString(),
                    order_number: "",
                    borrower_name: "",
                    owner_name: [],
                    property_address: "N/A",
                    parcel_number: "",
                    land_value: "$0.00",
                    improvements: "$0.00",
                    total_assessed_value: "$0.00",
                    exemption: "",
                    total_taxable_value: "$0.00",
                    taxing_authority: tax_auth_name,
                    notes: "",
                    delinquent: "NONE",
                    tax_history: []
                };

                const cleanStr = (s) => s ? s.replace(/\s+/g, ' ').trim() : "";
                
                const bodyText = document.body.innerText;
                const parcelMatch = bodyText.match(/\b\d{15,18}\b/);
                if (parcelMatch) data.parcel_number = parcelMatch[0];

                const allCells = document.querySelectorAll("td, th");
                for (let el of allCells) {
                    let text = cleanStr(el.textContent);
                    
                    if (text === "Name" && el.nextElementSibling) {
                        data.owner_name = [cleanStr(el.nextElementSibling.textContent)];
                    }
                    if (text === "Physical Addr" && el.nextElementSibling) {
                        let addr = cleanStr(el.nextElementSibling.textContent);
                        if (addr && addr !== "") data.property_address = addr;
                    }
                    if (text === "Land Total:" && el.nextElementSibling) {
                        data.land_value = cleanStr(el.nextElementSibling.textContent);
                    }
                    if (text === "Building Total:" && el.nextElementSibling) {
                        data.improvements = cleanStr(el.nextElementSibling.textContent);
                    }
                    if (text === "Appraised Value:" && el.nextElementSibling) {
                        let val = cleanStr(el.nextElementSibling.textContent);
                        data.total_assessed_value = val;
                        data.total_taxable_value = val; 
                    }
                }

                const historyHeaderTd = Array.from(document.querySelectorAll("td.rowHeader")).find(td => cleanStr(td.textContent).includes("Payment History"));
                
                if (historyHeaderTd) {
                    const table = historyHeaderTd.closest("table");
                    if (table) {
                        const rows = Array.from(table.querySelectorAll("tr"));
                        let startIdx = rows.findIndex(r => cleanStr(r.textContent).includes("Tax Year") && cleanStr(r.textContent).includes("Date Paid"));
                        
                        if (startIdx !== -1) {
                            let tempHistory = [];
                            for (let i = startIdx + 1; i < rows.length; i++) {
                                const cells = rows[i].querySelectorAll("td");
                                if (cells.length >= 3) {
                                    const year = cleanStr(cells[0].textContent);
                                    const datePaid = cleanStr(cells[1].textContent);
                                    const amount = cleanStr(cells[2].textContent);
                                    
                                    if (!year.match(/\d{4}/)) continue;

                                    let status = (datePaid && datePaid !== "") ? "PAID" : "DELINQUENT";

                                    // Dynamically set Due and Delinquent dates based on the County
                                    let dynamicDueDate = `12/31/${year}`;
                                    let dynamicDelqDate = `01/01/${parseInt(year) + 1}`;

                                    const authUpper = tax_auth_name.toUpperCase();
                                    if (authUpper.includes("CRENSHAW")) {
                                        dynamicDueDate = `10/01/${year}`;
                                        dynamicDelqDate = `01/01/${parseInt(year) + 1}`;
                                    } else if (authUpper.includes("LAMAR")) {
                                        dynamicDueDate = `11/15/${year}`;
                                        dynamicDelqDate = `11/16/${year}`;
                                    }
                                    
                                    tempHistory.push({
                                        jurisdiction: "County",
                                        year: year,
                                        calendarYear: year,
                                        payment_type: "ANNUAL",
                                        status: status,
                                        base_amount: amount || "$0.00",
                                        amount_paid: status === "PAID" ? amount : "$0.00",
                                        amount_due: status === "DELINQUENT" ? amount : "$0.00",
                                        mailing_date: "N/A",
                                        due_date: dynamicDueDate,
                                        delq_date: dynamicDelqDate,
                                        paid_date: datePaid || "N/A",
                                        good_through_date: "-"
                                    });
                                }
                            }

                            // Dynamic cutoff: Append until the first PAID year is hit
                            if (tempHistory.length > 0) {
                                for (let record of tempHistory) {
                                    data.tax_history.push(record);
                                    if (record.status === "PAID") {
                                        break; 
                                    }
                                }
                            }
                        }
                    }
                }

                // =========================================================
                // Notes Generation Logic
                // =========================================================
                let generatedNotes = "";
                let delinquentStatus = "NONE";

                try {
                    if (data.tax_history.length > 0) {
                        const isAnyDelinquent = data.tax_history.some(h => h.status.toUpperCase() === "DELINQUENT");
                        delinquentStatus = isAnyDelinquent ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF" : "NONE";

                        const allYears = data.tax_history.map(h => parseInt(h.year, 10));
                        const maxYear = Math.max(...allYears);
                        const yearVal = maxYear.toString();

                        const isPriorYearPaid = !data.tax_history.some(h => h.year !== yearVal && h.status.toUpperCase() === "DELINQUENT");
                        const currentYearInst = data.tax_history.filter(h => h.year === yearVal);

                        let dynamicDueDatesNote = "";
                        if (currentYearInst.length === 1) {
                            // This automatically grabs "10/01" or "11/15" based on the county mappings above
                            const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
                            dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
                        }

                        if (isAnyDelinquent) {
                            if (isPriorYearPaid) {
                                generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY, ${dynamicDueDatesNote}`;
                            } else {
                                generatedNotes = `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY, ${dynamicDueDatesNote}`;
                            }
                        } else {
                            generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, ${dynamicDueDatesNote}`;
                        }
                    }
                } catch (err) {
                    generatedNotes = "Error generating notes: " + err.message;
                }

                data.delinquent = delinquentStatus;
                data.notes = generatedNotes;

                return data;
            }, tax_auth);

            extractedData.land_value = formatCurrency(extractedData.land_value);
            extractedData.improvements = formatCurrency(extractedData.improvements);
            extractedData.total_assessed_value = formatCurrency(extractedData.total_assessed_value);
            extractedData.total_taxable_value = formatCurrency(extractedData.total_taxable_value);

            resolve(extractedData);

        } catch (error) {
            console.log(error);
            reject(new Error("No Record Found"));
        } finally {
            if (newPage && !newPage.isClosed()) {
                await newPage.close();
            }
        }
    });
};

const account_search = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, baseUrl, account, tax_auth)
                .then((data1) => resolve(data1))
                .catch((error) => {
                    console.log(error);
                    reject(new Error(error.message));
                });
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

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
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
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
                .finally(async () => { await context.close(); });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

export { search };
