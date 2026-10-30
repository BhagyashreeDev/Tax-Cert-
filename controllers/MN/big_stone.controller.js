// Author:- Mayank Nandgowle

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION & HELPERS
// ==========================================

const timeout_option = { timeout: 45000 };

const format_to_us_date = (dateStr) => {
    if (!dateStr || dateStr.trim() === "" || dateStr === "/" || dateStr.toUpperCase().includes("NOT RECEIVED")) return "N/A";
    let parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
        if (parts[0].length === 4) return `${parts[1]}/${parts[2]}/${parts[0]}`; // YYYY-MM-DD
        return `${parts[0]}/${parts[1]}/${parts[2]}`; // MM/DD/YYYY
    }
    return dateStr;
};

const safe_currency_format = (value) => {
    if (value === undefined || value === null || value === "N/A") return "$0.00";
    let strVal = String(value).trim().replace(/[^0-9.-]/g, "");
    if (!strVal || isNaN(parseFloat(strVal))) return "$0.00";
    return "$" + parseFloat(strVal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const decodeHtmlEntities = (text) => {
    return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
};

// ==========================================
// 2. SCRAPER ACTION MODULES 
// ==========================================

const ac_1 = async (page) => {
    try {
        const searchUrl = `https://hub.bigstonecounty.gov/propertysearch.html`;
        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: timeout_option.timeout });
        return true;
    } catch (error) {
        console.error("Error in ac_1:", error.message);
        throw new Error("Portal Connection Unsuccessful");
    }
};

const ac_2 = async (page, account) => {
    try {
        await page.waitForSelector("#quickSearchInput", timeout_option);
        
        await page.evaluate(() => document.getElementById("quickSearchInput").value = "");
        await page.type("#quickSearchInput", account.trim());
        await page.keyboard.press('Enter');
        
        await page.waitForFunction(() => {
            const text = document.body.innerText.toUpperCase();
            return text.includes("PROPERTY TAXPAYER INFORMATION") || 
                   text.includes("FOUND") || 
                   text.includes("NO RESULTS") ||
                   text.includes("VIEW DETAILS");
        }, timeout_option);

        const bodyText = await page.evaluate(() => document.body.innerText.toUpperCase());

        if (bodyText.includes("NO RESULTS")) {
            throw new Error("Record not found");
        }

        if (bodyText.includes("VIEW DETAILS") || bodyText.includes("FOUND")) {
            const clicked = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('a, button, div, span'));
                const viewBtn = elements.find(el => el.innerText && el.innerText.toUpperCase().includes('VIEW DETAILS'));
                if (viewBtn) {
                    viewBtn.click();
                    return true;
                }
                return false;
            });

            if (clicked) {
                await page.waitForFunction(() => document.body.innerText.toUpperCase().includes("PROPERTY TAXPAYER INFORMATION"), timeout_option);
            } else {
                await page.goto(`https://hub.bigstonecounty.gov/property-details.html?parcel=${account.trim()}`, { waitUntil: "networkidle2", timeout: timeout_option.timeout });
                await page.waitForFunction(() => document.body.innerText.toUpperCase().includes("PROPERTY TAXPAYER INFORMATION"), timeout_option);
            }
        }

        return true;
    } catch (error) {
        throw new Error(error.message === "Record not found" ? error.message : "Verification failed");
    }
};

const ac_3 = async (page, account) => {
    try {
        await page.waitForFunction(() => {
            const text = document.body.innerText.toUpperCase();
            return text.includes("MARKET VALUATION") && !text.includes("LOADING PAYMENT INFORMATION");
        }, timeout_option);

        let parsedData = await page.evaluate(() => {
            const text = document.body.innerText;

            const extract = (regex) => {
                const match = text.match(regex);
                return match ? match[1].trim() : "N/A";
            };

            const owner_name = extract(/Taxpayer Name:\s*(.+)/i);
            const property_address = extract(/Physical Address:\s*(.+)/i);
            const land_value = extract(/Estimated Land Market Value:\s*([\$0-9,.]+)/i);
            const improvements = extract(/Estimated Building Market Value:\s*([\$0-9,.]+)/i);
            const total_assessed = extract(/Total Estimated Market Value:\s*([\$0-9,.]+)/i);
            const exemption = extract(/Homestead Market Value Exclusion:\s*([-\$0-9,.]+)/i);
            const total_taxable = extract(/Total Taxable Market Value:\s*([\$0-9,.]+)/i);
            const property_tax = extract(/Property Tax:\s*([\$0-9,.]+)/i);
            
            // Extract Exact Paid Date
            const paidDateMatch = text.match(/Last payment of.*?received on\s*(\d{2}\/\d{2}\/\d{4})/i);
            const lastPaidDate = paidDateMatch ? paidDateMatch[1].trim() : "N/A";

            const yearMatch = text.match(/(\d{4})\s+CURRENT TAX INFORMATION/i);
            const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

            let tax_history = [];
            const firstHalfMatch = text.match(/First Half (Paid|Due) \(([^)]+)\):\s*([$0-9,.]+)/i);
            if (firstHalfMatch) {
                tax_history.push({ half: 1, status: firstHalfMatch[1], date: firstHalfMatch[2], amount: firstHalfMatch[3] });
            }

            const secondHalfMatch = text.match(/Second Half (Paid|Due) \(([^)]+)\):\s*([$0-9,.]+)/i);
            if (secondHalfMatch) {
                tax_history.push({ half: 2, status: secondHalfMatch[1], date: secondHalfMatch[2], amount: secondHalfMatch[3] });
            }

            return { owner_name, property_address, land_value, improvements, total_assessed, exemption, total_taxable, property_tax, year, tax_history, lastPaidDate };
        });

        let main_data = {
            processed_date: format_to_us_date(new Date().toLocaleDateString('en-US')),
            order_number: "",
            borrower_name: "",
            owner_name: [decodeHtmlEntities(parsedData.owner_name)],
            property_address: parsedData.property_address,
            parcel_number: account,
            land_value: safe_currency_format(parsedData.land_value), 
            improvements: safe_currency_format(parsedData.improvements),
            total_assessed_value: safe_currency_format(parsedData.total_assessed), 
            exemption: safe_currency_format(parsedData.exemption), 
            total_taxable_value: safe_currency_format(parsedData.total_taxable),   
            taxing_authority: "Big Stone County Auditor, MN",
            notes: "",
            delinquent: "NONE",
            tax_history: []
        };

        let rightNow = new Date();

        parsedData.tax_history.forEach(installment => {
            let dueDateStr = `${installment.date}/${parsedData.year}`;
            let dueDateObj = new Date(dueDateStr);
            
            // Calculate Delq Date (+1 Day from Due Date)
            let delqDateObj = new Date(dueDateObj);
            delqDateObj.setDate(delqDateObj.getDate() + 1);
            let computedDelqDateStr = `${String(delqDateObj.getMonth() + 1).padStart(2, '0')}/${String(delqDateObj.getDate()).padStart(2, '0')}/${delqDateObj.getFullYear()}`;
            
            let stat = installment.status.toUpperCase() === "PAID" ? "Paid" : "Due";
            if (stat === "Due" && rightNow > dueDateObj) {
                stat = "Delq";
            }

            let baseAmtNum = parseFloat(installment.amount.replace(/[^0-9.-]/g, ""));
            let amountPaid = stat === "Paid" ? baseAmtNum : 0;
            let amountDue = stat !== "Paid" ? baseAmtNum : 0;

            main_data.tax_history.push({
                jurisdiction: "County",
                year: parsedData.year,
                payment_type: "Semi-Annual", 
                status: stat,
                base_amount: safe_currency_format(baseAmtNum),
                amount_paid: safe_currency_format(amountPaid),
                amount_due: safe_currency_format(amountDue),
                mailing_date: "N/A",
                due_date: format_to_us_date(dueDateStr),
                delq_date: format_to_us_date(computedDelqDateStr), // Updated Logic
                paid_date: stat === "Paid" ? (parsedData.lastPaidDate !== "N/A" ? format_to_us_date(parsedData.lastPaidDate) : "Paid") : "N/A", // Updated Logic
                good_through_date: stat !== "Paid" ? format_to_us_date(dueDateStr) : "" 
            });
        });

        // ========================================================
        // Dynamic Notes & Delinquency Calculations Integration
        // ========================================================
        if (main_data.tax_history.length > 0) {
            const taxHistoryArray = main_data.tax_history;
            const yearVal = parsedData.year;
            const isSemiAnnual = true;
            const effectivePaymentType = "Semi-Annual";
            const isPriorYearPaid = true;

            const isAnyDelinquent = taxHistoryArray.some(history => history.status.toUpperCase() === "DELQ" || history.status.toUpperCase() === "DELINQUENT");
            
            main_data.delinquent = isAnyDelinquent ? yearVal : "NONE";
            const basePaymentType = (effectivePaymentType === "Semi-Annual") ? "SEMI ANNUALLY" : "ANNUALLY";

            let dynamicDueDatesNote = "";
            if (effectivePaymentType === "Semi-Annual" && taxHistoryArray.length >= 2) {
                const shortDueOne = taxHistoryArray[0].due_date.slice(0, 5);
                const shortDueTwo = taxHistoryArray[1].due_date.slice(0, 5);
                dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} AND ${shortDueTwo}`;
            } else if (taxHistoryArray[0]) {
                const shortDueOne = taxHistoryArray[0].due_date.slice(0, 5);
                dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
            }

            let generatedNotes = "";
            if (isSemiAnnual && taxHistoryArray.length >= 2) {
                const statusOne = taxHistoryArray[0].status.toUpperCase();
                const statusTwo = taxHistoryArray[1].status.toUpperCase();
                const statusString = `${yearVal} 1ST INSTALLMENT IS ${statusOne}, 2ND INSTALLMENT IS ${statusTwo}`;

                if (isAnyDelinquent) {
                    if (isPriorYearPaid) {
                        generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}.`;
                    } else {
                        generatedNotes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}.`;
                    }
                } else {
                    generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}.`;
                }
            } else {
                if (isAnyDelinquent) {
                    if (isPriorYearPaid) {
                        generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}.`;
                    } else {
                        generatedNotes = `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}.`;
                    }
                } else {
                    generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}.`;
                }
            }

            main_data.notes = generatedNotes;
        }

        return main_data;
    } catch (error) {
        throw new Error(error.message);
    }
};

// ==========================================
// 3. ORCHESTRATION & CONTROLLER
// ==========================================

const account_search = async (page, account) => {
    try {
        await ac_1(page); 
        await ac_2(page, account);   
        return await ac_3(page, account); 
    } catch (error) {
        throw new Error(error.message);
    }
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    
    if (!account || account.trim() === "") {
        const msg = "Invalid or missing account number.";
        return fetch_type === "api" ? res.status(400).json({ error: true, message: msg }) : res.status(200).render('error_data', { error: true, message: msg });
    }

    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
        return res.status(200).render('error_data', { error: true, message: "Invalid Access" });
    }

    let context = null;
    let page = null;

    try {    
        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        page = await context.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
        page.setDefaultNavigationTimeout(60000);

        await page.setRequestInterception(true);
        page.on('request', async (req) => {
            if (req.isInterceptResolutionHandled()) return;
            try {
                if (['stylesheet', 'font', 'image', 'media'].includes(req.resourceType())) {
                    await req.abort();
                } else {
                    await req.continue();
                }
            } catch (error) {}
        });

        const data = await account_search(page, account);
        
        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else {
            res.status(200).json({ result: data });
        }

    } catch(error) {
        if (fetch_type === "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    } finally {
        if (page) {
            try {
                page.removeAllListeners(); 
                await page.close();
            } catch (e) {}
        }
        if (context) {
            try {
                await context.close();
            } catch (e) {}
        }
    }
};

export { search };
