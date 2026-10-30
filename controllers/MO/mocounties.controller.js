// mocounties.controller.js
// Author:- Mayank Nandgowle

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION & HELPERS (Missouri Multi-County)
// ==========================================

const county_data = {
    dade: { url: "https://dadecountycollector.org/", auth: "Dade County Collector, MO" },
    camden: { url: "https://collector.camdenmo.org/", auth: "Camden County Collector, MO" },
    miller: { url: "https://collector.millercountymo.gov/", auth: "Miller County Collector, MO" }
};

const timeout_option = {
    timeout: 90000
};

const is_delq = (dateStr) => {
    let today = new Date();
    let delq_date = new Date(dateStr);
    if (today >= delq_date) {
        return "Delinquent";
    }
    return "Due";
};

// ==========================================
// 2. SCRAPER ACTION MODULES
// ==========================================

const ac_1 = async (page, url, account) => {
    try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        return true;
    } catch (error) {
        console.error("Error in ac_1:", error);
        throw new Error("Portal Connection Unsuccessful");
    }
};

const ac_2 = async (page, account, county) => {
    try {
        await page.waitForSelector("#searchIn", { timeout: 5000 });
        
        let safeSearchAccount = account.trim();

        await page.evaluate((val) => {
            const input = document.getElementById("searchIn");
            if (input) input.value = val;
        }, safeSearchAccount);

        await page.evaluate(() => {
            document.getElementById("searchSubmit").click();
        });

        await Promise.race([
            page.waitForSelector("#searchList .parBlk", { visible: true, timeout: 15000 }),
            page.waitForFunction(() => {
                const err = document.getElementById("errOut");
                return err && err.innerText.trim().length > 0;
            }, { timeout: 15000 })
        ]);

        const pageError = await page.evaluate(() => {
            const errBlock = document.getElementById("errOut");
            if (errBlock && errBlock.innerText.trim().length > 0) {
                return errBlock.innerText.trim();
            }
            const results = document.querySelectorAll(".parBlk");
            if (results.length === 0) return "No records found";
            return null;
        });

        if (pageError) {
            throw new Error(pageError);
        }

        return true;
    } catch (error) {
        console.error("Error in ac_2:", error);
        throw new Error(error.message === "No records found" ? error.message : "Record not found");
    }
};

const ac_3 = async (page, account, county) => {
    try {
        const blocksToProcess = await page.evaluate((targetAccount) => {
            const blocks = Array.from(document.querySelectorAll('#searchList .parBlk'));
            let parsedBlocks = blocks.map(block => {
                const id = block.id.replace('parBlk_', '');
                const text = block.innerText;
                const isUnpaid = block.classList.contains('parOpen'); 
                
                let yearMatch = text.match(/(?:-\s*|\規)\b(20\d{2}|19\d{2})\b/);
                let year = yearMatch ? parseInt(yearMatch[1]) : 0;
                
                if (!year) {
                    let tokens = text.replace(/[\(\)]/g, ' ').split(/\s+/);
                    for (let token of tokens) {
                        if (/^\d{4}$/.test(token) && (token.startsWith("20") || token.startsWith("19"))) {
                            year = parseInt(token);
                            break;
                        }
                    }
                }
                
                return { id, text, year, isUnpaid };
            });

            parsedBlocks = parsedBlocks.filter(b => b.text.replace(/\s+/g, '').includes(targetAccount.replace(/\s+/g, '')));
            
            parsedBlocks.sort((a, b) => a.year - b.year);

            let selected = [];
            if (parsedBlocks.length > 0) {
                for (let i = 0; i < parsedBlocks.length; i++) {
                    if (i === parsedBlocks.length - 1 || parsedBlocks[i].isUnpaid) {
                        selected.push(parsedBlocks[i]);
                    }
                }
                selected.sort((a, b) => a.year - b.year);
            }
            return selected;
        }, account);

        if (blocksToProcess.length === 0) {
            throw new Error("No exact match found in results list");
        }

        let extracted_history = [];
        let global_owner = "";
        let global_address = "";
        let global_assessed = "0";
        
        for (let block of blocksToProcess) {
            const blockSelector = `#parBlk_${block.id}`;
            
            await page.waitForSelector(blockSelector);
            await page.evaluate((selector) => {
                const el = document.querySelector(selector);
                if (el) {
                    el.scrollIntoView({ block: 'center' });
                    el.click();
                }
            }, blockSelector);
            
            await new Promise(r => setTimeout(r, 750)); 

            const detailSelector = `#parDtl_${block.id}`;
            await page.waitForSelector(`${detailSelector} .parcelLevies`, { timeout: 10000 });

            const blockData = await page.evaluate((sel, yearStr, isUnpaid) => {
                const container = document.querySelector(sel);
                if (!container) return null;

                const grabTextByLabel = (labelText) => {
                    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
                    let node;
                    while ((node = walker.nextNode())) {
                        if (node.nodeValue.includes(labelText)) {
                            let parent = node.parentElement;
                            if (parent && parent.nextElementSibling) {
                                return parent.nextElementSibling.textContent.trim();
                            }
                        }
                    }
                    return "";
                };

                const grabDollarAmountByLabel = (labelText) => {
                    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
                    let node;
                    while ((node = walker.nextNode())) {
                        if (node.nodeValue.includes(labelText)) {
                            let row = node.parentElement.closest('.row, tr, table, .parDtl');
                            if (row) {
                                let matches = row.textContent.match(/\$[0-9,]+\.\d{2}/g);
                                if (matches && matches.length > 0) return matches[matches.length - 1];
                            }
                        }
                    }
                    return "$0.00";
                };

                // FIX 1: Helper to format a plain numeric string with thousand separators
                const formatAmount = (rawVal) => {
                    if (!rawVal) return "$0.00";
                    // If already has $, return as-is (already formatted from page)
                    if (rawVal.includes("$")) return rawVal;
                    // Strip non-numeric except dot
                    const num = parseFloat(rawVal.replace(/[^0-9.]/g, ""));
                    if (isNaN(num)) return "$0.00";
                    return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                };

                // FIX 1b: Format a plain integer valuation string (no decimals)
                const formatValuation = (rawVal) => {
                    if (!rawVal || rawVal === "0") return "0";
                    const num = parseInt(rawVal.replace(/[^0-9]/g, ""), 10);
                    if (isNaN(num)) return rawVal;
                    return num.toLocaleString("en-US");
                };

                const headerRows = Array.from(container.querySelectorAll('.parHdr .row')).map(r => r.textContent.trim());
                
                let rawOwnerName = headerRows.length > 1 ? headerRows[1] : "";
                let ownerName = rawOwnerName.replace(/^[A-Za-z0-9\-]+\s*-\s*\(\d{4}\)\s*/, '');
                ownerName = ownerName.replace(/^[A-Za-z0-9\-]+\s*-\s*\d{4}\s+/, '').trim();

                let fullAddress = "";
                let cleanLines = headerRows.filter(line => {
                    if (!line) return false;
                    let normLine = line.toUpperCase();
                    let normOwner = ownerName.toUpperCase();
                    if (normLine.includes(normOwner) || normOwner.includes(normLine)) return false;
                    if (normLine.includes("AND OR CURRENT OCCUPANT")) return false;
                    if (normLine.includes(yearStr.toString())) return false;
                    return true;
                });

                let zipIndex = cleanLines.findIndex(line => /\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/i.test(line));
                if (zipIndex !== -1) {
                    let line1 = zipIndex > 0 ? cleanLines[zipIndex - 1] : "";
                    let line2 = cleanLines[zipIndex];
                    fullAddress = line1 ? `${line1}, ${line2}` : line2;
                } else if (cleanLines.length > 0) {
                    fullAddress = cleanLines.join(", ");
                }

                // FIXED: Strip out loose "Address Source" labels and cleaning trails
                fullAddress = fullAddress.replace(/,?\s*Address\s*Source\s*:\s*Assessor/i, '');
                fullAddress = fullAddress.replace(/,?\s*Address\s*Source\s*:\s*Collector/i, '').trim();

                const assessedRaw = grabTextByLabel("Valuation:") || "0";
                // FIX 1: format valuation with thousand separator
                const assessedVal = formatValuation(assessedRaw);

                const totalTaxes = grabDollarAmountByLabel("Total Taxes:") || "$0.00";
                const totalDue = grabDollarAmountByLabel("Total Due:") || "$0.00";

                let paidDateStr = "N/A";
                if (!isUnpaid) {
                    const rawText = container.textContent || "";
                    // FIX 2: also match "Payment (RO)" / "Payment (XX)" date pattern
                    const pdMatch =
                        rawText.match(/Paid Date[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
                        rawText.match(/Payment\s*\([^)]*\)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
                        rawText.match(/Paid[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i);
                    if (pdMatch) {
                        // Normalize to zero-padded MM/DD/YYYY
                        const [m, d, y] = pdMatch[1].split("/");
                        paidDateStr = `${m.padStart(2,"0")}/${d.padStart(2,"0")}/${y}`;
                    }
                }

                return {
                    ownerName,
                    fullAddress,
                    assessedVal,
                    year: yearStr.toString(),
                    totalTaxes,
                    totalDue,
                    status: isUnpaid ? "Delinquent" : "Paid",
                    base_amount: totalTaxes,
                    amount_paid: isUnpaid ? "$0.00" : totalDue,
                    amount_due: isUnpaid ? totalDue : "$0.00",
                    paidDateStr
                };
            }, detailSelector, block.year, block.isUnpaid);

            if (blockData) {
                if (!global_owner) global_owner = blockData.ownerName;
                if (!global_address || global_address.split(',').length < blockData.fullAddress.split(',').length) {
                    global_address = blockData.fullAddress;
                }
                if (global_assessed === "0") global_assessed = blockData.assessedVal;
                
                extracted_history.push(blockData);
            }
        }

        // Always use the latest year's valuation for assessed/taxable value display
        if (extracted_history.length > 0) {
            global_assessed = extracted_history[extracted_history.length - 1].assessedVal;
        }

        let main_data = {
            processed_date: "",
            order_number: "",
            borrower_name: "",
            owner_name: [global_owner],
            property_address: global_address,
            parcel_number: account,
            land_value: "",
            improvements: "",
            total_assessed_value: global_assessed.includes("$") ? global_assessed : "$" + global_assessed,
            exemption: "",
            total_taxable_value: global_assessed.includes("$") ? global_assessed : "$" + global_assessed,
            taxing_authority: county_data[county]['auth'],
            notes: "",
            delinquent: "NONE",
            tax_history: []
        };

        for (let i = 0; i < extracted_history.length; i++) {
            const record = extracted_history[i];
            
            let rawYear = record.year.toString().trim();
            let fourDigitYear = rawYear.length === 2 ? `20${rawYear}` : rawYear;
            
            if (fourDigitYear.length !== 4 || fourDigitYear === "0000" || parseInt(fourDigitYear) > 2050) {
                fourDigitYear = "2025"; 
            }

            const systemGeneratedDueDate = `31/12/${fourDigitYear}`;

            main_data.tax_history.push({
                jurisdiction: "County",
                year: fourDigitYear,
                payment_type: "Annual",
                status: record.status,
                base_amount: record.base_amount.includes("$") ? record.base_amount : "$" + record.base_amount,
                amount_paid: record.amount_paid.includes("$") ? record.amount_paid : "$" + record.amount_paid,
                amount_due: record.amount_due.includes("$") ? record.amount_due : "$" + record.amount_due,
                mailing_date: "N/A",
                due_date: systemGeneratedDueDate,
                delq_date: `01/01/${parseInt(fourDigitYear) + 1}`,
                paid_date: record.paidDateStr, 
                good_through_date: ""
            });
        }

        // --- Dynamic Notes & Delinquency Calculations ---
        const taxHistoryArray = main_data.tax_history;
        const effectivePaymentType = "Annual"; 
        const isSemiAnnual = effectivePaymentType === "Semi-Annual";
        
        const isAnyDelinquent = taxHistoryArray.some(history => history.status === "Delinquent");
        
        let isPriorYearPaid = true;
        if (taxHistoryArray.length > 1) {
            isPriorYearPaid = taxHistoryArray.slice(0, taxHistoryArray.length - 1).every(h => h.status !== "Delinquent");
        }
        
        const yearVal = taxHistoryArray.length > 0 ? taxHistoryArray[taxHistoryArray.length - 1].year : "2025";

        if (isAnyDelinquent) {
            let delinquentYearsCollected = taxHistoryArray.filter(t => t.status === "Delinquent").map(t => t.year);
            main_data.delinquent = `TAXES ARE DELINQUENT FOR YEAR(S): ${delinquentYearsCollected.join(", ")}, NEED TO CALL FOR PAYOFF`;
        }

        const basePaymentType = (effectivePaymentType === "Semi-Annual") ? "SEMI ANNUALLY" : "ANNUALLY";
        let dynamicDueDatesNote = "";

        if (effectivePaymentType === "Semi-Annual" && taxHistoryArray.length >= 2) {
            const shortDueOne = taxHistoryArray[taxHistoryArray.length - 1].due_date.slice(0, 5);
            const shortDueTwo = taxHistoryArray[taxHistoryArray.length - 2].due_date.slice(0, 5);
            dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} AND ${shortDueTwo}`;
        } else if (taxHistoryArray[taxHistoryArray.length - 1]) {
            const shortDueOne = taxHistoryArray[taxHistoryArray.length - 1].due_date.slice(0, 5);
            dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
        }

        let generatedNotes = "";
        if (isSemiAnnual && taxHistoryArray.length >= 2) {
            const statusOne = taxHistoryArray[taxHistoryArray.length - 1].status.toUpperCase();
            const statusTwo = taxHistoryArray[taxHistoryArray.length - 2].status.toUpperCase();
            const statusString = `${yearVal} 1ST INSTALLMENT IS ${statusOne}, 2ND INSTALLMENT IS ${statusTwo}`;
            if (isAnyDelinquent) {
                if (isPriorYearPaid) {
                    generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                } else {
                    generatedNotes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                }
            } else {
                generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
            }
        } else {
            if (isAnyDelinquent) {
                if (isPriorYearPaid) {
                    generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                } else {
                    generatedNotes = `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                }
            } else {
                generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
            }
        }

        main_data.notes = generatedNotes;

        return main_data;
    } catch (error) {
        console.error("Error in ac_3:", error);
        throw new Error(error.message);
    }
};

// ==========================================
// 3. ORCHESTRATION & CONTROLLER
// ==========================================

const account_search = async (page, url, account, county) => {
    try {
        await ac_1(page, url, account);
        await ac_2(page, account, county);
        const scrapingResults = await ac_3(page, account, county);
        return scrapingResults;
    } catch (error) {
        console.error("Error in account_search lifecycle:", error);
        throw new Error(error.message);
    }
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    const county = req.path.replace('/', '').toLowerCase(); 

    try{    
        if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = county_data[county]['url'];

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if(fetch_type == "html"){
            account_search(page, url, account, county)
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
                try{
                    await context.close();
                }
                catch(error){
                    console.log(error)
                }   
            });
        }
        else if(fetch_type == "api"){
            account_search(page, url, account, county)
            .then((data) => {
                res.status(200).json({
                    result: data
                })
            })
            .catch((error) => {
                console.log(error);
                res.status(500).json({
                    error: true,
                    message: error.message
                })
            })
            .finally(async () => {
                try{
                    await context.close();
                }
                catch(error){
                    console.log(error)
                }
            });
        }
    }
    catch(error){
        console.log(error);
        if(fetch_type == "html"){
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if(fetch_type == "api"){
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}

export { search };
