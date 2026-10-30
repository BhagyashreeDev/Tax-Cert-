// Author:- Mayank Nandgowle

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION & HELPERS (17 Counties)
// ==========================================

const county_data = {
    blount: { url: "https://altags.com/blount_license/property.aspx", auth: "Blount County Revenue, AL" },
    butler: { url: "https://ingproperty.com/Butler_Revenue/property.aspx", auth: "Butler County Revenue, AL" },
    calhoun: { url: "https://altags.com/Calhoun_Revenue/property.aspx", auth: "Calhoun County Revenue, AL" },
    clay: { url: "https://www.ingproperty.com/Clay_Revenue/property.aspx", auth: "Clay County Revenue, AL" },
    conecuh: { url: "https://altags.com/Conecuh_Revenue/property.aspx", auth: "Conecuh County Revenue, AL" },
    covington: { url: "https://altags.com/Covington_Revenue/Property.aspx", auth: "Covington County Revenue, AL" },
    dale: { url: "https://www.altags.com/Dale_Revenue/property.aspx", auth: "Dale County Revenue, AL" },
    houston: { url: "https://www.ingproperty.com/Houston_Revenue/property.aspx", auth: "Houston County Revenue, AL" },
    lauderdale: { url: "https://altags.com/Lauderdale_Revenue/property.aspx", auth: "Lauderdale County Revenue, AL" },
    lee: { url: "https://www.altags.com/Lee_License/property.aspx", auth: "Lee County Revenue, AL" },
    marengo: { url: "https://www.altags.com/Marengo_Revenue/property.aspx", auth: "Marengo County Revenue, AL" },
    marion: { url: "https://www.ingproperty.com/Marion_Revenue/property.aspx", auth: "Marion County Revenue, AL" },
    pike: { url: "https://www.altags.com/Pike_Revenue/property.aspx", auth: "Pike County Revenue, AL" },
    randolph: { url: "https://www.ingproperty.com/Randolph_Revenue/property.aspx", auth: "Randolph County Revenue, AL" },
    stclair: { url: "https://www.ingproperty.com/StClair_Revenue/property.aspx", auth: "St. Clair County Revenue, AL" },
    tallapoosa: { url: "https://altags.com/Tallapoosa_Revenue/property.aspx", auth: "Tallapoosa County Revenue, AL" },
    walker: { url: "https://altags.com/walker_revenue/property.aspx", auth: "Walker County Revenue, AL" }
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

const generate_notes = (yearsArr, keys, status, systemDueDate) => {
    let notes = "";
    try {
        const targetYear = yearsArr[0] || new Date().getFullYear().toString();
        
        let cleanTextDate = "12/31";
        if (systemDueDate && systemDueDate.includes("/")) {
            const dateParts = systemDueDate.split("/");
            if (dateParts.length >= 2) {
                cleanTextDate = `${dateParts[1]}/${dateParts[0]}`;
            }
        }

        notes = (keys == 1) ? `ALL PRIORS ARE PAID. ${targetYear} ` : `PRIORS ARE DELINQUENT. ${targetYear} `;  
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;  
        notes += ` NORMAL DUE DATE IS ${cleanTextDate}`;
    } catch (error) {
        console.error("Error generating notes:", error);
    } finally {
        return notes;
    }
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
        let dropDownSelector = "#ctl00_ContentPlaceHolder2_ddlSearchType";
        
        try {
            await page.waitForSelector(dropDownSelector, { timeout: 5000 });
        } catch (e) {
            dropDownSelector = await page.evaluate(() => {
                const selectEl = document.querySelector("select");
                return selectEl ? `#${selectEl.id}` : null;
            });
            if (!dropDownSelector) throw new Error("Search Type Select element not found");
        }
        
        await page.select(dropDownSelector, 'parcel');

        // Wait for ASP.NET PostBack
        await Promise.race([
            page.waitForNavigation({ waitUntil: "networkidle0", timeout: 3000 }).catch(() => {}),
            new Promise(r => setTimeout(r, 3000))
        ]);

        let inputSelector = "#ctl00_ContentPlaceHolder2_tbSearch";
        try {
            await page.waitForSelector(inputSelector, { timeout: 5000 });
        } catch (e) {
            inputSelector = await page.evaluate(() => {
                const textInput = document.querySelector("input[type='text']");
                return textInput ? `#${textInput.id}` : null;
            });
            if (!inputSelector) throw new Error("Search Text input box not found");
        }
        
        // 1. THE TARGET: The exact parcel the user wants (e.g., 07-03-08-0-000-003.000L2)
        let fullTargetAccount = account.trim();

        // 2. THE SEARCH TERM: Strips any letters at the end to satisfy the server's regex
        // Converts "07-03-08-0-000-003.000L2" -> "07-03-08-0-000-003.000"
        let safeSearchAccount = fullTargetAccount.replace(/[A-Za-z].*$/, '').trim();

        // DEEP FRAMEWORK BYPASS: Injects the SAFE string directly into the form
        await page.evaluate((sel, val) => {
            const el = document.querySelector(sel);
            if (el) {
                if (typeof window.Sys !== 'undefined' && window.Sys.Application) {
                    try {
                        const components = window.Sys.Application.getComponents();
                        for (let i = 0; i < components.length; i++) {
                            const comp = components[i];
                            if (comp.get_element && comp.get_element() === el) {
                                comp.dispose(); 
                            }
                        }
                    } catch(e) {}
                }

                el.onblur = null;
                el.onchange = null;
                if (typeof window.jQuery !== 'undefined') {
                    try { window.jQuery(el).off(); } catch(e) {}
                }

                el.value = '';
                el.value = val;

                const hiddenField = document.getElementById(el.id + '_MaskedEditHiddenField');
                if (hiddenField) hiddenField.value = val;
            }
        }, inputSelector, safeSearchAccount);

        let searchButtonSelector = "#ctl00_ContentPlaceHolder2_btnSearch";
        try {
            await page.waitForSelector(searchButtonSelector, { timeout: 5000 });
        } catch (e) {
            searchButtonSelector = await page.evaluate(() => {
                const submitBtn = document.querySelector("input[type='submit'], button.btn-success");
                return submitBtn ? `#${submitBtn.id}` : null;
            });
            if (!searchButtonSelector) throw new Error("Search submission button not found");
        }
        
        await page.evaluate((sel) => {
            document.querySelector(sel).click();
        }, searchButtonSelector);

        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});

        const pageError = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            if (bodyText.includes("Invalid Parcel Search")) return "Invalid Parcel Search";
            if (bodyText.includes("No records found")) return "No records found";
            return null;
        });

        if (pageError) {
            throw new Error(pageError);
        }

        // ==============================================================
        // SMART LIST SCANNER: Uses the FULL string to find the exact match
        // ==============================================================
        try {
            const detailsUrl = await page.evaluate((targetAccount) => {
                const allLinks = Array.from(document.querySelectorAll('a'));
                const detailLinks = allLinks.filter(a => a.href && a.href.toLowerCase().includes('propertydetails.aspx'));
                
                // FAST EXIT: Normal properties return exactly 1 result. 0ms impact.
                if (detailLinks.length === 1) {
                    return detailLinks[0].href;
                }
                
                // If the list pops up, scan for the EXACT full target (e.g. L2)
                if (detailLinks.length > 1) {
                    for (let link of detailLinks) {
                        let parentRow = link.closest('.row') || link.parentElement.parentElement;
                        if (parentRow && parentRow.innerText.includes(targetAccount)) {
                            return link.href;
                        }
                    }
                    return detailLinks[0].href; // Fallback
                }

                return null;
            }, fullTargetAccount); // Pass the FULL target (with suffix) into the evaluator

            if (detailsUrl) {
                await page.goto(detailsUrl, { waitUntil: "domcontentloaded" });
            }
        } catch (bridgeError) {
            // Already inside details loop
        }

        return true;
    } catch (error) {
        console.error("Error in ac_2:", error);
        throw new Error(error.message === "Invalid Parcel Search" || error.message === "No records found" ? error.message : "Record not found");
    }
};

const ac_3 = async (page, account, county) => {
    try {
        await page.waitForSelector("#ctl00_ContentPlaceHolder2_lblParcel", timeout_option);

        let extracted_payload = await page.evaluate(() => {
            const grabText = (id) => document.getElementById(id)?.textContent?.trim() || "";
            
            const parcel_number = grabText("ctl00_ContentPlaceHolder2_lblParcel");
            const ppin = grabText("ctl00_ContentPlaceHolder2_lblPPIN");
            const account_number = grabText("ctl00_ContentPlaceHolder2_lblAcct");
            const physical_address = grabText("ctl00_ContentPlaceHolder2_lblPhysAddr") || "N/A";
            const owner_name = grabText("ctl00_ContentPlaceHolder2_lblOwner") || "N/A";
            const total_assessed_value = grabText("ctl00_ContentPlaceHolder2_lblAssessed") || "0.00";
            
            let parsed_history = [];
            
            // 1. ACTIVE TAX TRANSACTION MATRIX
            const currentTaxBlock = document.querySelector("#ctl00_ContentPlaceHolder2_tblDivTrans");
            if (currentTaxBlock) {
                const targetRows = Array.from(currentTaxBlock.querySelectorAll(".row")).filter(row => {
                    const text = row.innerText.toUpperCase();
                    return (text.includes("202") || text.includes("203")) && !text.includes("AMOUNTS");
                });

                const activeRow = targetRows[0];
                if (activeRow) {
                    const innerDivs = Array.from(activeRow.querySelectorAll("div"));
                    const textTokens = innerDivs.map(d => d.textContent.trim()).filter(Boolean);
                    
                    const activeYear = textTokens.find(token => /^\d{4}$/.test(token)) || new Date().getFullYear().toString();
                    let activePaidDate = textTokens.find(token => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(token)) || "";
                    
                    const currencies = textTokens.filter(token => token.includes(".") || token.includes("$"));
                    const baseTaxAmount = currencies[currencies.length - 1] || "$0.00";
                    
                    let taxDueRaw = document.getElementById("ctl00_ContentPlaceHolder2_lblTaxDue")?.textContent?.trim() || "$0.00";
                    let taxDueNum = parseFloat(taxDueRaw.replace(/[^0-9.-]+/g, "")) || 0;

                    const rowRawText = activeRow.innerText.toUpperCase();
                    if (rowRawText.includes("SALE") || rowRawText.includes("LIEN")) {
                        taxDueRaw = baseTaxAmount;
                        taxDueNum = parseFloat(baseTaxAmount.replace(/[^0-9.-]+/g, "")) || 1.00;
                        activePaidDate = "N/A";
                    }

                    parsed_history.push({
                        year: activeYear,
                        amount_due: taxDueRaw,
                        amount_due_num: taxDueNum,
                        paid_date: activePaidDate || "N/A",
                        base_amount: baseTaxAmount,
                        amount_paid: taxDueNum === 0 ? baseTaxAmount : "$0.00",
                        is_current_year: true
                    });
                }
            }

            // 2. HISTORICAL RECORD EXTRACTION MATRIX
            const historyContainer = document.querySelector("#ctl00_ContentPlaceHolder2_tblPayHist");
            if (historyContainer) {
                const rows = historyContainer.querySelectorAll(".roweven, .rowodd");
                rows.forEach(row => {
                    const columns = row.querySelectorAll(".col-md-1, .col-md-2, .col-md-3, .col-md-4");
                    if (columns.length >= 4) {
                        const hYear = columns[0]?.querySelector(".text-right")?.textContent?.trim() || "";
                        const hTotalPaid = columns[2]?.querySelector(".text-right")?.textContent?.trim() || "0.00";
                        const hPaidByString = columns[4]?.textContent?.trim() || "";
                        
                        if (/^\d{4}$/.test(hYear)) {
                            const dateRegex = /(\d{1,2}\/\d{1,2}\/\d{4})/;
                            const dateMatch = hPaidByString.match(dateRegex);
                            const hPaidDate = dateMatch ? dateMatch[1] : "";

                            const isUnpaid = parseFloat(hTotalPaid.replace(/[^0-9.-]+/g, "")) === 0 || hPaidByString.toUpperCase().includes("SALE") || hPaidByString.toUpperCase().includes("LIEN");

                            parsed_history.push({
                                year: hYear,
                                amount_due: isUnpaid ? ("$" + hTotalPaid) : "$0.00",
                                amount_due_num: isUnpaid ? 1 : 0, 
                                paid_date: hPaidDate || "N/A",
                                base_amount: hTotalPaid.includes("$") ? hTotalPaid : "$" + hTotalPaid,
                                amount_paid: isUnpaid ? "$0.00" : (hTotalPaid.includes("$") ? hTotalPaid : "$" + hTotalPaid),
                                is_current_year: false
                            });
                        }
                    }
                });
            }

            return {
                parcel_number,
                ppin,
                account_number,
                physical_address,
                owner_name,
                total_assessed_value,
                parsed_history
            };
        });

        // 3. MAPPING STAGE TO STANDARDIZED MAIN GRID OBJECT
        let main_data = {
            processed_date: "",
            order_number: "",
            borrower_name: "",
            owner_name: [extracted_payload.owner_name],
            property_address: extracted_payload.physical_address,
            parcel_number: extracted_payload.parcel_number || account,
            land_value: "",
            improvements: "",
            total_assessed_value: extracted_payload.total_assessed_value.includes("$") ? extracted_payload.total_assessed_value : "$" + extracted_payload.total_assessed_value,
            exemption: "",
            total_taxable_value: extracted_payload.total_assessed_value.includes("$") ? extracted_payload.total_assessed_value : "$" + extracted_payload.total_assessed_value,
            taxing_authority: county_data[county]['auth'],
            notes: "",
            delinquent: "NONE",
            tax_history: []
        };

        extracted_payload.parsed_history.sort((a, b) => parseInt(b.year) - parseInt(a.year));

        let delinquentYearsCollected = [];
        let globalStatus = "Paid";
        let trackingKeys = 1;
        let activeTaxDueDate = "";

        for (let i = 0; i < extracted_payload.parsed_history.length; i++) {
            const record = extracted_payload.parsed_history[i];
            let recordStatus = "Paid";
            
            if (record.amount_due_num > 0 || record.paid_date === "N/A") {
                recordStatus = is_delq(`01/01/${parseInt(record.year) + 1}`);
                if (recordStatus === "Delinquent") {
                    delinquentYearsCollected.push(record.year);
                    globalStatus = "Delinquent";
                    trackingKeys = 0; 
                }
            }

            const systemGeneratedDueDate = `31/12/${record.year}`;
            if (record.is_current_year) {
                activeTaxDueDate = systemGeneratedDueDate;
            }

            let cleanPaidDate = record.paid_date || "N/A";
            if (cleanPaidDate !== "N/A") {
                cleanPaidDate = cleanPaidDate.replace(/PAID\s*:\s*/i, "").replace(/PAID/i, "").trim();
            }

            if (record.is_current_year) {
                main_data.tax_history.push({
                    jurisdiction: "County",
                    year: record.year,
                    payment_type: "Annual",
                    status: recordStatus,
                    base_amount: record.base_amount.includes("$") ? record.base_amount : "$" + record.base_amount,
                    amount_paid: record.amount_paid.includes("$") ? record.amount_paid : "$" + record.amount_paid,
                    amount_due: record.amount_due.includes("$") ? record.amount_due : "$" + record.amount_due,
                    mailing_date: "N/A",
                    due_date: systemGeneratedDueDate,
                    delq_date: `01/01/${parseInt(record.year) + 1}`,
                    paid_date: cleanPaidDate,
                    good_through_date: ""
                });

                if (recordStatus === "Paid") {
                    break;
                }
            } 
            else if (recordStatus === "Delinquent") {
                main_data.tax_history.push({
                    jurisdiction: "County",
                    year: record.year,
                    payment_type: "Annual",
                    status: recordStatus,
                    base_amount: record.base_amount.includes("$") ? record.base_amount : "$" + record.base_amount,
                    amount_paid: record.amount_paid.includes("$") ? record.amount_paid : "$" + record.amount_paid,
                    amount_due: record.amount_due.includes("$") ? record.amount_due : "$" + record.amount_due,
                    mailing_date: "N/A",
                    due_date: systemGeneratedDueDate,
                    delq_date: `01/01/${parseInt(record.year) + 1}`,
                    paid_date: cleanPaidDate,
                    good_through_date: ""
                });
            } 
            else {
                break;
            }
        }

        const finalYearsTracked = main_data.tax_history.map(item => item.year);
        main_data['notes'] = generate_notes(finalYearsTracked, trackingKeys, globalStatus, activeTaxDueDate);
        
        if (globalStatus === "Delinquent") {
            main_data['delinquent'] = `TAXES ARE DELINQUENT FOR YEAR(S): ${delinquentYearsCollected.join(", ")}, NEED TO CALL FOR PAYOFF`;
        }

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
    const { county, url_str } = req;
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
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
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
