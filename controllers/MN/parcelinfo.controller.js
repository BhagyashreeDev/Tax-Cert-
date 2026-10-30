// Author:- Mayank Nandgowle

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION & HELPERS
// ==========================================

const parcelinfo_county_data = {
    itasca: { param: "Itasca", auth: "Itasca County, MN" },
    koochiching: { param: "Koochiching", auth: "Koochiching County, MN" },
    lake: { param: "Lake", auth: "Lake County, MN" },
    lac_qui_parle: { param: "Lac_qui_Parle", auth: "Lac qui Parle County, MN" }
};

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
    if (!value || value.trim() === "" || value.trim() === "-" || value.toUpperCase().includes("N/A")) return "$0.00";
    let strVal = value.trim().replace(/[^0-9.-]/g, "");
    if (!strVal || isNaN(parseFloat(strVal))) return "$0.00";
    return "$" + parseFloat(strVal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ==========================================
// 2. SCRAPER ACTION MODULES 
// ==========================================

const ac_1 = async (page, county) => {
    try {
        const loginUrl = `https://parcelinfo.com/processlogin.php?county=${parcelinfo_county_data[county].param}`;
        await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 45000 });
        return true;
    } catch (error) {
        console.error("Error in ac_1:", error);
        throw new Error("Portal Connection Unsuccessful");
    }
};

const ac_2 = async (page, account) => {
    try {
        const directDetailsUrl = `https://parcelinfo.com/parcels/details.php?id=${encodeURIComponent(account.trim())}`;
        await page.goto(directDetailsUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

        const isInvalidRecord = await page.evaluate(() => {
            const bodyTxt = document.body.innerText;
            if (bodyTxt.includes("clear your browser cache and cookies") || bodyTxt.includes("array(0)")) {
                return true;
            }
            if (!bodyTxt.includes("Assessor's Market Values") && !bodyTxt.includes("Record Details")) {
                return true;
            }
            return false;
        });

        if (isInvalidRecord) throw new Error("Record not found");
        return true;
    } catch (error) {
        console.error("Error in ac_2:", error);
        throw new Error(error.message === "Record not found" ? error.message : "Verification failed");
    }
};

const ac_3 = async (page, account, county) => {
    try {
        await page.waitForSelector("body", timeout_option);

        let detailPayload = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);

            // 1. Precise Owner Box Text Segment Splitter (Table 3 text boundaries)
            let owner_name = "N/A";
            const tables = Array.from(document.querySelectorAll('table'));
            const dataTable = tables.find(t => t.innerText.toUpperCase().includes("OWNER OF RECORD") || t.innerText.toUpperCase().includes("OWNER\nOF\nRECORD"));
            
            if (dataTable) {
                let tableText = dataTable.innerText;
                let marker = "Record";
                let idx = tableText.indexOf(marker);
                
                if (idx !== -1) {
                    let textChunk = tableText.slice(idx + marker.length).trim();
                    let chunkLines = textChunk.split('\n').map(l => l.trim()).filter(Boolean);
                    
                    if (chunkLines.length > 0) {
                        let potentialName = chunkLines[0];
                        potentialName = potentialName
                            .replace(/^of\s+record/i, '')
                            .replace(/^record/i, '')
                            .trim();
                        
                        if (potentialName && !/[0-9]/.test(potentialName) && !potentialName.toUpperCase().includes("CLICK HERE")) {
                            owner_name = potentialName.replace(/\s+/g, ' ').trim();
                        }
                    }
                }
            }

            if (owner_name === "N/A" || !owner_name) {
                let taxIndex = lines.findIndex(l => l.toUpperCase().includes("OWNER OF RECORD") || l.toUpperCase().includes("TAXPAYER OF RECORD"));
                if (taxIndex !== -1 && lines[taxIndex + 1]) {
                    owner_name = lines[taxIndex + 1].replace(/\s+/g, ' ').trim();
                }
            }

            // Replace '+' symbol with '&' globally in the owner name text
            if (owner_name && owner_name !== "N/A") {
                owner_name = owner_name.replace(/\+/g, '&').replace(/\s+/g, ' ').trim();
            }

            // 2. Physical Location Address Parsing
            let property_address = "N/A";
            let physicalLine = lines.find(l => l.toUpperCase().includes("PHYSICAL ADDRESS:"));
            if (physicalLine) {
                property_address = physicalLine.slice(physicalLine.indexOf(':') + 1).trim();
            }

            // 3. Regex-Targeted Valuation Parser
            let land_val = "0.00";
            let bldg_val = "0.00";
            let total_assessed = "0.00";
            let total_taxable = "0.00";
            let isAgricultural = false;

            let landMatch = bodyText.match(/Total\s+Land\s+Value\s*=\s*\$?([0-9,.]+)/i);
            let bldgMatch = bodyText.match(/Total\s+Building\s+Value\s*=\s*\$?([0-9,.]+)/i);
            let assessedMatch = bodyText.match(/Estimated\s+Market\s+Value:?\s*([0-9,.]+)/i) || bodyText.match(/Grand\s+Total\s+Value\s*=\s*\$?([0-9,.]+)/i);
            let taxableMatch = bodyText.match(/Taxable\s+Market\s+Value:?\s*([0-9,.]+)/i);

            if (landMatch) land_val = landMatch[1].trim();
            if (bldgMatch) bldg_val = bldgMatch[1].trim();
            if (assessedMatch) total_assessed = assessedMatch[1].trim();
            if (taxableMatch) {
                total_taxable = taxableMatch[1].trim();
            } else {
                total_taxable = total_assessed;
            }

            for (let line of lines) {
                let uLine = line.toUpperCase();
                if (uLine.includes("CLASS CODE") && (uLine.includes("AG") || uLine.includes("AGRICULTURAL"))) {
                    isAgricultural = true;
                }
            }

            // Corrected MN Tax Year Calculation Logic (Points directly to assessment base)
            let yearMatch = bodyText.match(/Taxes\s+Payable\s+In\s+(20\d{2})/i) || bodyText.match(/For\s+Taxes\s+Payable\s+In\s+(20\d{2})/i) || bodyText.match(/(20\d{2})\s+Assessor's/i);
            let base_year = yearMatch ? (parseInt(yearMatch[1]) - 1).toString() : new Date().getFullYear().toString();

            return {
                owner_name,
                property_address,
                base_year,
                land_value: land_val,
                improvements: bldg_val,
                market_value: total_assessed,
                taxable_value: total_taxable,
                isAgricultural
            };
        });

        // 4. Construct Data Payload Object Structure
        let main_data = {
            processed_date: format_to_us_date(new Date().toLocaleDateString('en-US')),
            order_number: "",
            borrower_name: "",
            owner_name: [detailPayload.owner_name],
            property_address: detailPayload.property_address,
            parcel_number: account,
            land_value: safe_currency_format(detailPayload.land_value),
            improvements: safe_currency_format(detailPayload.improvements),
            total_assessed_value: safe_currency_format(detailPayload.market_value),
            exemption: "N/A", 
            total_taxable_value: safe_currency_format(detailPayload.taxable_value), 
            taxing_authority: parcelinfo_county_data[county].auth,
            notes: "",
            delinquent: "NONE",
            tax_history: []
        };

        // Navigate cleanly to the specific targeted taxrecord summary link
        const currentTaxUrl = `https://parcelinfo.com/parcels/taxrecord.php?id=${encodeURIComponent(account.trim())}`;
        await page.goto(currentTaxUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
        
        let taxHistoryPayload = await page.evaluate((baseYear, isAg) => {
            const innerTxt = document.body.innerText;
            const lines = innerTxt.split('\n').map(l => l.trim()).filter(Boolean);
            
            let baseTaxAmt = "0.00";
            let totalTaxMatch = innerTxt.match(/(?:TOTAL\s+TAX\s+AND\s+ASSESSMENTS|TOTAL\s+TAX\s+DUE):\s*\$?([0-9,.]+)/i);
            if (totalTaxMatch) baseTaxAmt = totalTaxMatch[1];

            let firstHalfSiteStatus = "Paid";
            let secondHalfSiteStatus = "Paid";

            for (let line of lines) {
                if (line.toUpperCase().includes("FIRST HALF")) {
                    firstHalfSiteStatus = line.toUpperCase().includes("NOT PAID") ? "Not Paid" : "Paid";
                }
                if (line.toUpperCase().includes("SECOND HALF")) {
                    secondHalfSiteStatus = line.toUpperCase().includes("NOT PAID") ? "Not Paid" : "Paid";
                }
            }

            let numGrossValue = parseFloat(baseTaxAmt.replace(/[^0-9.]/g, "")) || 0;
            let halfInstallmentAmount = (numGrossValue / 2).toFixed(2);

            let secondHalfDueDay = isAg ? "11/15" : "10/15";
            let secondHalfDelqDay = isAg ? "11/16" : "10/16";

            // Date tracking instances for dynamic status mapping
            let rightNow = new Date();
            let firstHalfDelqDate = new Date(`05/16/${parseInt(baseYear) + 1}`);
            let secondHalfDelqDate = new Date(`${secondHalfDelqDay}/${parseInt(baseYear) + 1}`);

            // Apply business logic workflow parameters for Status flags
            let finalFirstStatus = "Paid";
            if (firstHalfSiteStatus === "Not Paid") {
                finalFirstStatus = rightNow >= firstHalfDelqDate ? "Delq" : "Due";
            }

            let finalSecondStatus = "Paid";
            if (secondHalfSiteStatus === "Not Paid") {
                finalSecondStatus = rightNow >= secondHalfDelqDate ? "Delq" : "Due";
            }

            return [
                {
                    jurisdiction: "County",
                    year: baseYear,
                    payment_type: "Semi-Annual",
                    status: finalFirstStatus,
                    base_amount: halfInstallmentAmount,
                    amount_paid: finalFirstStatus === "Paid" ? halfInstallmentAmount : "0.00",
                    amount_due: finalFirstStatus !== "Paid" ? halfInstallmentAmount : "0.00",
                    mailing_date: `10/01/${baseYear}`,
                    due_date: `05/15/${parseInt(baseYear) + 1}`,
                    delq_date: `05/16/${parseInt(baseYear) + 1}`,
                    paid_date: "N/A",
                    good_through_date: ""
                },
                {
                    jurisdiction: "County",
                    year: baseYear,
                    payment_type: "Semi-Annual",
                    status: finalSecondStatus,
                    base_amount: halfInstallmentAmount,
                    amount_paid: finalSecondStatus === "Paid" ? halfInstallmentAmount : "0.00",
                    amount_due: finalSecondStatus !== "Paid" ? halfInstallmentAmount : "0.00",
                    mailing_date: `10/01/${baseYear}`,
                    due_date: `${secondHalfDueDay}/${parseInt(baseYear) + 1}`,
                    delq_date: `${secondHalfDelqDay}/${parseInt(baseYear) + 1}`,
                    paid_date: "N/A",
                    good_through_date: ""
                }
            ];
        }, detailPayload.base_year, detailPayload.isAgricultural);

        taxHistoryPayload.forEach(row => {
            row.base_amount = safe_currency_format(row.base_amount);
            row.amount_paid = safe_currency_format(row.amount_paid);
            row.amount_due = safe_currency_format(row.amount_due);
            main_data.tax_history.push(row);
        });

        const isFirstDelq = main_data.tax_history[0].status === "Delq";
        const isSecondDelq = main_data.tax_history[1].status === "Delq";
        const targetTaxYear = (parseInt(detailPayload.base_year) + 1).toString();
        const secondHalfDueDateStr = detailPayload.isAgricultural ? "11/15" : "10/15";

        let notesText = `ALL PRIORS ARE PAID, ${targetTaxYear} 1ST INSTALLMENT IS ${main_data.tax_history[0].status.toUpperCase()}, 2ND INSTALLMENT IS ${main_data.tax_history[1].status.toUpperCase()}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 05/15 AND ${secondHalfDueDateStr}`;
        
        if (isFirstDelq || isSecondDelq) {
            main_data.delinquent = detailPayload.base_year;
        }
        main_data.notes = notesText;

        return main_data;
    } catch (error) {
        console.error("Error in ac_3:", error);
        throw new Error(error.message);
    }
};

// ==========================================
// 3. ORCHESTRATION & CONTROLLER
// ==========================================

const account_search = async (page, account, county) => {
    try {
        await ac_1(page, county); 
        await ac_2(page, account);   
        const scrapingResults = await ac_3(page, account, county); 
        return scrapingResults;
    } catch (error) {
        console.error("Error in account_search lifecycle:", error);
        throw new Error(error.message);
    }
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    let county = req.county;

    if (!county && req.originalUrl) {
        const urlParts = req.originalUrl.split('?')[0].split('/').filter(Boolean);
        county = urlParts[urlParts.length - 1].toLowerCase().trim();
    }
    
    try {    
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', { error: true, message: "Invalid Access" });
        }

        if (!parcelinfo_county_data[county]) {
            throw new Error(`Configuration for county '${county}' is missing.`);
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
        page.setDefaultNavigationTimeout(60000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['stylesheet', 'font', 'image', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            account_search(page, account, county)
            .then((data) => {
                res.status(200).render("parcel_data_official", data);
            })
            .catch((error) => {
                res.status(200).render('error_data', { error: true, message: error.message });
            })
            .finally(async () => {
                try { await context.close(); } catch(e) {}
            });
        }
        else if (fetch_type === "api") {
            account_search(page, account, county)
            .then((data) => {
                res.status(200).json({ result: data });
            })
            .catch((error) => {
                res.status(500).json({ error: true, message: error.message });
            })
            .finally(async () => {
                try { await context.close(); } catch(e) {}
            });
        }
    }
    catch(error) {
        if(fetch_type === "html"){
            res.status(200).render('error_data', { error: true, message: error.message });
        }
        else if(fetch_type === "api"){
            res.status(500).json({ error: true, message: error.message });
        }
    }
}

export { search };
