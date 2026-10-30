// controller
// Author:- Mayank Nandgowle
// Target:- Legacy Texas ACT Automated Collection Technology 


import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION & HELPERS
// ==========================================

const county_data = {
    sanpatricio: { url: "https://actweb.acttax.com/act_webdev/sanpatricio/index.jsp", auth: "San Patricio County, TX" },
    refugio: { url: "https://actweb.acttax.com/act_webdev/refugio/index.jsp", auth: "Refugio County, TX" },
    hidalgo: { url: "https://actweb.acttax.com/act_webdev/hidalgo/index.jsp", auth: "Hidalgo County, TX" },
    gregg: { url: "https://actweb.acttax.com/act_webdev/gregg/index.jsp", auth: "Gregg County, TX" },
    fbc: { url: "https://actweb.acttax.com/act_webdev/fbc/index.jsp", auth: "Fort Bend County, TX" },
    duval: { url: "https://actweb.acttax.com/act_webdev/duval/index.jsp", auth: "Duval County, TX" },
    brooks: { url: "https://actweb.acttax.com/act_webdev/brooks/index.jsp", auth: "Brooks County, TX" },
    mclennan: { url: "https://actweb.acttax.com/act_webdev/mclennan/index.jsp", auth: "McLennan County, TX" },
    navarro: { url: "https://actweb.acttax.com/act_webdev/navarro/index.jsp", auth: "Navarro County, TX" },
    upshur: { url: "https://actweb.acttax.com/act_webdev/upshur/index.jsp", auth: "Upshur County, TX" },
    jefferson: { url: "https://actweb.acttax.com/act_webdev/jefferson/index.jsp", auth: "Jefferson County, TX" },
    galveston: { url: "https://actweb.acttax.com/act_webdev/galveston/index.jsp", auth: "Galveston County, TX" }
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
    return "Not Paid";
};

const format_to_us_date = (dateStr) => {
    if (!dateStr || dateStr.trim() === "" || dateStr === "/" || dateStr.toUpperCase().includes("NOT RECEIVED")) return "N/A";
    let parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}/${parts[0]}`; 
    }
    return dateStr;
};

const generate_notes = (yearsArr, keys, status, systemDueDate) => {
    let notes = "";
    try {
        const targetYear = yearsArr[0] || new Date().getFullYear().toString();
        
        notes = (keys == 1) ? `ALL PRIORS ARE PAID. ${targetYear} ` : `PRIORS ARE DELINQUENT. ${targetYear} `;  
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;  
        notes += ` NORMAL DUE DATE IS 01/31`; 
    } catch (error) {
        console.error("Error generating notes:", error);
    } finally {
        return notes;
    }
};

const safe_currency_format = (value) => {
    if (!value || value.trim() === "" || value.trim() === "-" || value.toUpperCase().includes("N/A")) {
        return "$0.00";
    }
    let strVal = value.trim();
    if (strVal === "0" || strVal === "$0") {
        return "$0.00";
    }
    return strVal.includes("$") ? strVal : "$" + strVal;
};

// ==========================================
// 2. SCRAPER ACTION MODULES
// ==========================================

const ac_1 = async (page, url) => {
    try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        return true;
    } catch (error) {
        console.error("Error in ac_1:", error);
        throw new Error("Portal Connection Unsuccessful");
    }
};

const ac_2 = async (page, account) => {
    try {
        let safeSearchAccount = account.trim();

        const radioSelector = 'input[name="searchby"][value="4"], #sc4';
        await page.waitForSelector(radioSelector, timeout_option);
        await page.click(radioSelector);

        const inputSelector = 'input[name="criteria"], input[name="txtAccount"], #criteria';
        await page.waitForSelector(inputSelector, timeout_option);
        await page.focus(inputSelector);
        await page.type(inputSelector, safeSearchAccount);

        await Promise.all([
            page.keyboard.press('Enter'),
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {})
        ]);

        const pageError = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            if (bodyText.includes("No records exist") || bodyText.includes("criteria is required") || bodyText.includes("unable to find your account") || bodyText.includes("No matching records")) return "No records found";
            return null;
        });

        if (pageError) throw new Error(pageError);

        const extractedOwnerName = await page.evaluate((targetAccount) => {
            if (window.location.href.includes("showdetail2.jsp")) {
                return "N/A";
            }
            const rows = Array.from(document.querySelectorAll('.tablesorter tbody tr, table tbody tr'));
            for (let row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length > 1 && cells[0].innerText.includes(targetAccount)) {
                    let textLines = cells[1].innerText.split('\n');
                    let nameParts = [];
                    for (let line of textLines) {
                        let cleanLine = line.trim();
                        if (cleanLine) {
                            if (/[0-9]/.test(cleanLine)) break;
                            nameParts.push(cleanLine);
                        }
                    }
                    if (nameParts.length > 0) {
                        return nameParts.join(' ').replace(/&amp;/gi, '&').replace(/%/g, '&').replace(/\s+/g, ' ').trim();
                    } else if (textLines.length > 0) {
                        return textLines[0].replace(/&amp;/gi, '&').replace(/%/g, '&').trim();
                    }
                }
            }
            return "N/A";
        }, safeSearchAccount);

        page.extractedOwnerName = extractedOwnerName;

        const detailUrl = await page.evaluate((targetAccount) => {
            const allLinks = Array.from(document.querySelectorAll('a[href*="showdetail2.jsp"]'));
            if (allLinks.length === 1) return allLinks[0].href;
            
            if (allLinks.length > 1) {
                const normalize = (str) => str.replace(/[^A-Za-z0-9]/g, '').toLowerCase().replace(/^0+/, '');
                const normalizedTarget = normalize(targetAccount);

                for (let link of allLinks) {
                    if (normalize(link.innerText) === normalizedTarget) {
                        return link.href;
                    }
                }
                return allLinks[0].href;
            }
            return null;
        }, safeSearchAccount);

        if (detailUrl) {
            await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
        } else {
            if (!page.url().includes("showdetail2.jsp")) {
                throw new Error("Account details link could not be isolated.");
            }
        }

        return true;
    } catch (error) {
        console.error("Error in ac_2:", error);
        throw new Error(error.message === "No records found" ? error.message : "Record not found");
    }
};

const ac_3 = async (page, account, county) => {
    try {
        await page.waitForSelector("table", timeout_option);

        let gridOwnerName = page.extractedOwnerName || "N/A";

        let detailPayload = await page.evaluate((gridOwnerName) => {
            const bodyText = document.body.innerText;

            const extractBlockData = (startLabel, stopLabels) => {
                let startIndex = bodyText.indexOf(startLabel);
                if (startIndex === -1) return null;
                
                startIndex += startLabel.length;
                let substring = bodyText.slice(startIndex).trim();
                
                let minEndIndex = substring.length;
                for (let label of stopLabels) {
                    let stopIndex = substring.indexOf(label);
                    if (stopIndex !== -1 && stopIndex < minEndIndex) {
                        minEndIndex = stopIndex;
                    }
                }
                return substring.slice(0, minEndIndex).trim();
            };

            const getCurrencyValue = (label) => {
                let cleanLabel = label.replace(/[:]/g, '').trim();
                let index = bodyText.toUpperCase().indexOf(cleanLabel.toUpperCase());
                
                // Return null if missing so the || fallback operators work
                if (index === -1) return null; 
                
                let rest = bodyText.slice(index + cleanLabel.length).trim();
                let chunk = rest.slice(0, 100); 
                chunk = chunk.replace(/\b(?:19|20)\d{2}\b/g, '') 
                             .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ''); 
                             
                let match = chunk.match(/\$\s*([0-9,]+\.[0-9]{2})/) || 
                            chunk.match(/\$\s*([0-9,]+)/) ||
                            chunk.match(/:\s*([0-9,]+\.[0-9]{2})/) ||
                            chunk.match(/:\s*([0-9,]+)/);
                            
                if (match) return match[1].trim();
                
                let strictMatch = chunk.match(/([0-9,]+\.[0-9]{2})/);
                return strictMatch ? strictMatch[1] : null; 
            };

            const getTextValue = (label) => {
                let cleanLabel = label.replace(/[:]/g, '').trim();
                let index = bodyText.toUpperCase().indexOf(cleanLabel.toUpperCase());
                
                if (index === -1) return null; 
                
                let rest = bodyText.slice(index + cleanLabel.length).trim();
                if (rest.startsWith(':')) {
                    rest = rest.slice(1).trim();
                }
                
                let lines = rest.split('\n').map(l => l.trim()).filter(Boolean);
                return lines.length > 0 ? lines[0] : null; 
            };

            let owner_name = "N/A";
            let rawAddressText = extractBlockData("Address:", ["Property Site Address:", "Legal Description:", "Current Tax Levy:"]);
            
            if (rawAddressText) {
                let lines = rawAddressText.split('\n').map(l => l.trim()).filter(Boolean);
                let nameParts = [];
                for (let line of lines) {
                    if ((/[0-9]/.test(line) && !line.toUpperCase().includes("C/O")) || line.includes("Pending Credit Card")) {
                        break;
                    }
                    nameParts.push(line);
                }
                if (nameParts.length > 0) {
                    owner_name = nameParts.join(' ').replace(/&amp;/gi, '&').replace(/%/g, '&').replace(/\s+/g, ' ').trim();
                }
            }

            const badKWs = ["Begin a New Search", "Go to Your Portfolio", "Tax Office Home Page", "N/A"];
            const isGridBad = badKWs.some(kw => (gridOwnerName || "").includes(kw));
            if (owner_name === "N/A" && !isGridBad && gridOwnerName) {
                owner_name = gridOwnerName;
            }

            let property_address = "N/A";
            let rawPropText = extractBlockData("Property Site Address:", ["Legal Description:", "Current Tax Levy:", "Current Amount Due:"]);
            if (rawPropText) {
                 let cleanProp = rawPropText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                 if (cleanProp) property_address = cleanProp;
            }

            // The fallbacks will now trigger sequentially until one returns a value
            let market_value = getCurrencyValue("Gross Value") || getCurrencyValue("Market Value") || getCurrencyValue("Appraised Value") || "0.00";
            
            return {
                owner_name,
                property_address,
                market_value,
                land_value: getCurrencyValue("Land Value") || "0.00",
                improvements: getCurrencyValue("Improvement Value") || "0.00",
                current_levy: getCurrencyValue("Current Tax Levy") || "0.00",
                total_due: getCurrencyValue("Total Amount Due") || "0.00",
                prior_due: getCurrencyValue("Prior Year Amount Due") || "0.00",
                last_payment_amt: getTextValue("Last Payment Amount for Current Year Taxes") || "N/A",
                last_payment_date: getTextValue("Last Payment Date for Current Year Taxes") || "N/A",
                dueDetailsUrl: document.querySelector('a[href*="taxbyyear.jsp"], a[href*="tax-due"]') ? document.querySelector('a[href*="taxbyyear.jsp"], a[href*="tax-due"]').href : null,
                paidHistoryUrl: document.querySelector('a[href*="paymentinfo.jsp"], a[href*="payment-history"]') ? document.querySelector('a[href*="paymentinfo.jsp"], a[href*="payment-history"]').href : null,
                base_year: (bodyText.match(/Tax Year:\s*(\d{4})/i) || bodyText.match(/Payment Information for (\d{4})/i) || [null, new Date().getFullYear().toString()])[1]
            };
        }, gridOwnerName);

        let main_data = {
            processed_date: "",
            order_number: "",
            borrower_name: "",
            owner_name: [detailPayload.owner_name],
            property_address: detailPayload.property_address,
            parcel_number: account,
            land_value: safe_currency_format(detailPayload.land_value),
            improvements: safe_currency_format(detailPayload.improvements),
            total_assessed_value: safe_currency_format(detailPayload.market_value),
            exemption: "", 
            total_taxable_value: safe_currency_format(detailPayload.market_value),
            taxing_authority: county_data[county] ? county_data[county].auth : "County, TX",
            notes: "",
            delinquent: "NONE",
            tax_history: []
        };

        let trackingKeys = 1; 
        let globalStatus = "Paid";
        let delinquentYearsCollected = [];
        let currentYear = parseInt(detailPayload.base_year);
        let priorDueNum = parseFloat(detailPayload.prior_due.replace(/[^0-9.-]+/g, "")) || 0;
        let totalDueNum = parseFloat(detailPayload.total_due.replace(/[^0-9.-]+/g, "")) || 0;

        if (priorDueNum > 0 && detailPayload.dueDetailsUrl) {
            trackingKeys = 0;
            await page.goto(detailPayload.dueDetailsUrl, { waitUntil: "domcontentloaded" });
            await page.waitForSelector('table', { timeout: 5000 }).catch(() => {});

            let outstandingRecords = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('table tbody tr, .tablesorter tbody tr'));
                return rows.map(row => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    if (cells.length >= 4 && cells[0].textContent.trim() !== "") {
                        return {
                            year: cells[0].textContent.trim(),
                            base_tax_due: cells[1].textContent.trim(),
                            total_due: cells[3].textContent.trim()
                        };
                    }
                    return null;
                }).filter(Boolean);
            });

            for (let record of outstandingRecords) {
                let recYearNum = parseInt(record.year);
                if (isNaN(recYearNum)) continue;
                let recordStatus = is_delq(`02/01/${recYearNum + 1}`);

                if (recordStatus === "Delinquent") {
                    globalStatus = "Delinquent";
                    delinquentYearsCollected.push(recYearNum);
                }

                main_data.tax_history.push({
                    jurisdiction: "County",
                    year: record.year,
                    payment_type: "Annual",
                    status: recordStatus,
                    base_amount: safe_currency_format(record.base_tax_due),
                    amount_paid: "$0.00",
                    amount_due: safe_currency_format(record.total_due),
                    mailing_date: `10/01/${recYearNum}`,
                    due_date: `01/31/${recYearNum + 1}`,
                    delq_date: `02/01/${recYearNum + 1}`,
                    paid_date: "N/A",
                    good_through_date: ""
                });
            }
        }

        let cleanPaidDate = "N/A";
        if (detailPayload.last_payment_date && 
            !detailPayload.last_payment_date.toUpperCase().includes("NOT RECEIVED") && 
            detailPayload.last_payment_date.trim() !== "") {
            
            cleanPaidDate = detailPayload.last_payment_date.replace(/[^0-9\/]/g, "").trim();
            if (!cleanPaidDate || cleanPaidDate === "/" || !/\d/.test(cleanPaidDate)) {
                cleanPaidDate = "N/A"; 
            }
        }

        let currentYearStatus = "Paid";
        if (totalDueNum > 0) {
            currentYearStatus = is_delq(`02/01/${currentYear + 1}`);
        }

        if (currentYearStatus === "Delinquent" && !delinquentYearsCollected.includes(currentYear)) {
            globalStatus = "Delinquent";
            delinquentYearsCollected.push(currentYear);
        } else if (currentYearStatus === "Not Paid" && globalStatus !== "Delinquent") {
            globalStatus = "Not Paid";
        }

        main_data.tax_history.push({
            jurisdiction: "County",
            year: currentYear.toString(),
            payment_type: "Annual",
            status: currentYearStatus,
            base_amount: safe_currency_format(detailPayload.current_levy),
            amount_paid: (detailPayload.last_payment_amt.toUpperCase().includes("NOT RECEIVED") || detailPayload.last_payment_amt.toUpperCase().includes("N/A")) ? "N/A" : safe_currency_format(detailPayload.last_payment_amt),
            amount_due: safe_currency_format(detailPayload.total_due),
            mailing_date: `10/01/${currentYear}`,
            due_date: `01/31/${currentYear + 1}`,
            delq_date: `02/01/${currentYear + 1}`,
            paid_date: cleanPaidDate,
            good_through_date: ""
        });

        main_data.tax_history.sort((a, b) => parseInt(b.year) - parseInt(a.year));

        let delinquentRecords = main_data.tax_history.filter(item => item.status === "Delinquent");
        if (delinquentRecords.length > 0) {
            main_data.tax_history = delinquentRecords;
        } else {
            main_data.tax_history = [main_data.tax_history[0]];
        }

        const activeTaxDueDate = `01/31/${currentYear + 1}`;
        main_data['notes'] = generate_notes([main_data.tax_history[0].year], trackingKeys, globalStatus, activeTaxDueDate);
        
        if (delinquentYearsCollected.length > 0) {
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
        await ac_1(page, url);
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
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        if (!county_data[county]) {
            throw new Error(`Configuration for legacy county '${county}' is missing.`);
        }

        const url = county_data[county]['url'];

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');

        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            account_search(page, url, account, county)
            .then((data) => {
                res.status(200).render("parcel_data_official", data);
            })
            .catch((error) => {
                res.status(200).render('error_data', {
                    error: true,
                    message: error.message
                });
            })
            .finally(async () => {
                try {
                    await context.close();
                } catch(error) {
                    console.log(error);
                }   
            });
        }
        else if (fetch_type === "api") {
            account_search(page, url, account, county)
            .then((data) => {
                res.status(200).json({
                    result: data
                });
            })
            .catch((error) => {
                res.status(500).json({
                    error: true,
                    message: error.message
                });
            })
            .finally(async () => {
                try {
                    await context.close();
                } catch(error) {
                    console.log(error);
                }
            });
        }
    }
    catch(error) {
        if(fetch_type === "html"){
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if(fetch_type === "api"){
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}

export { search };
