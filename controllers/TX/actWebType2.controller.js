// Author:- Mayank Nandgowle
// Target:- Texas ACT Automated Collection Technology (Multiple Counties) - Type 2 Multi-Page Optimization

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION & HELPERS
// ==========================================

const county_data = {
    angelina: { url: "https://actweb.acttax.com/angelina/angelina/index.jsp", auth: "Angelina County, TX" },
    bee: { url: "https://actweb.acttax.com/bee/bee/index.jsp", auth: "Bee County, TX" },
    chambers: { url: "https://actweb.acttax.com/chambers/chambers/index.jsp", auth: "Chambers County, TX" },
    elpaso: { url: "https://actweb.acttax.com/act_webdev/elpaso/index.jsp", auth: "El Paso County, TX" },
    ellis: { url: "https://actweb.acttax.com/ellis/ellis/index.jsp", auth: "Ellis County, TX" },
    jackson: { url: "https://actweb.acttax.com/jackson/jackson/index.jsp", auth: "Jackson County, TX" },
    kaufman: { url: "https://actweb.acttax.com/kaufman/kaufman/index.jsp", auth: "Kaufman County, TX" },
    kleberg: { url: "https://actweb.acttax.com/kleberg/kleberg/index.jsp", auth: "Kleberg County, TX" },
    nueces: { url: "https://actweb.acttax.com/nueces/nueces/index.jsp", auth: "Nueces County, TX" },
    victoria: { url: "https://actweb.acttax.com/victoria/victoria/index.jsp", auth: "Victoria County, TX" }
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

const format_to_us_date = (dateStr) => {
    if (!dateStr || dateStr.trim() === "") return "N/A";
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
        let safeSearchAccount = account.trim();

        if (county === "elpaso") {
            const tabMatched = await page.evaluate(() => {
                const tabs = Array.from(document.querySelectorAll('a, button, div, th, td'));
                const accountTab = tabs.find(el => el.innerText && el.innerText.toUpperCase().includes("ACCOUNT SEARCH"));
                if (accountTab) {
                    accountTab.click();
                    return true;
                }
                return false;
            });
            
            if (!tabMatched) {
                await page.click('td[bgcolor="#E3E3E3"]a, #cmdAccount, th:nth-child(3) a').catch(() => {});
            }
            await page.waitForTimeout(1000); 
        } else {
            await page.waitForSelector('select[name="search-type"], #search-type', timeout_option);
            await page.select('select[name="search-type"], #search-type', 'account');
        }

        await page.waitForSelector('input[name="criteria"], input[name="txtAccount"], #criteria', timeout_option);
        await page.focus('input[name="criteria"], input[name="txtAccount"], #criteria');
        await page.type('input[name="criteria"], input[name="txtAccount"], #criteria', safeSearchAccount);

        await Promise.all([
            page.keyboard.press('Enter'),
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {})
        ]);

        const pageError = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            // FIXED: Removed "unable to find your account" to stop Chambers/Jackson from throwing false positive errors on multi-result tables
            if (bodyText.includes("No records exist") || bodyText.includes("criteria is required")) return "No records found";
            return null;
        });

        if (pageError) throw new Error(pageError);

        const detailUrl = await page.evaluate((targetAccount) => {
            const allLinks = Array.from(document.querySelectorAll('a[href*="account-details.jsp"], a[href*="prop-detail.jsp"]'));
            if (allLinks.length === 1) return allLinks[0].href;
            
            if (allLinks.length > 1) {
                const normalize = (str) => str.replace(/[^A-Za-z0-9]/g, '').toLowerCase().replace(/^0+/, '');
                const normalizedTarget = normalize(targetAccount);

                for (let link of allLinks) {
                    if (normalize(link.innerText) === normalizedTarget) {
                        return link.href;
                    }
                }

                for (let link of allLinks) {
                    const normalizedLinkText = normalize(link.innerText);
                    if (normalizedLinkText.includes(normalizedTarget) || normalizedTarget.includes(normalizedLinkText)) {
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
            if (!page.url().includes("account-details.jsp") && !page.url().includes("prop-detail.jsp")) {
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
        await page.waitForSelector(".list-group-item, table, #property-details", timeout_option);

        let detailPayload = await page.evaluate(() => {
            
            const findListItemPlain = (label) => {
                const item = Array.from(document.querySelectorAll('.list-group-item')).find(el => el.textContent.includes(label));
                if (item) return item.querySelector('p')?.textContent?.trim() || "";
                
                const matches = Array.from(document.querySelectorAll('td, th')).filter(el => el.innerText && el.innerText.includes(label));
                if (matches.length > 0) {
                    matches.sort((a, b) => a.innerText.length - b.innerText.length);
                    return matches[0].innerText.split(label)[1]?.split('\n')[0].trim() || "";
                }
                return "";
            };

            const findListItemText = (label) => {
                const item = Array.from(document.querySelectorAll('.list-group-item')).find(el => el.textContent.includes(label));
                if (item) return item.querySelector('p')?.innerHTML?.trim() || "";
                
                const matches = Array.from(document.querySelectorAll('td, th')).filter(el => el.innerText && el.innerText.includes(label));
                if (matches.length > 0) {
                    matches.sort((a, b) => a.innerText.length - b.innerText.length);
                    return matches[0].innerHTML.split(label)[1]?.split(/<br\s*\/?>/i)[0].trim() || "";
                }
                return "";
            };

            let rawAddressHtml = findListItemText("Address:");
            let owner_name = "N/A";
            if (rawAddressHtml) {
                let firstLine = rawAddressHtml.split(/<br\s*\/?>/i)[0].trim();
                let ownerNameMatch = firstLine.match(/^([^\d]+)/);
                let parsedName = ownerNameMatch ? ownerNameMatch[1].trim() : firstLine;
                owner_name = parsedName.replace(/&amp;/gi, ',').replace(/&/g, ',').replace(/\s*,\s*/g, ', ').trim();
            }

            let property_address = findListItemPlain("Property Site Address:") || findListItemPlain("Location:");
            if (!property_address || property_address.trim() === "") {
                property_address = "N/A";
            }

            const extractBodyValue = (marker) => {
                const matches = Array.from(document.querySelectorAll('td, div, li, b, span, th'))
                    .filter(el => el.innerText && el.innerText.includes(marker));
                if (matches.length > 0) {
                    matches.sort((a, b) => a.innerText.length - b.innerText.length);
                    const bestMatch = matches[0].innerText;
                    const token = bestMatch.split(marker)[1];
                    if (token) return token.split('\n')[0].trim();
                }
                return "0.00";
            };

            let market_value = extractBodyValue("Market Value:");
            let land_value = extractBodyValue("Land Value:");
            let improvements = extractBodyValue("Improvement Value:");
            let current_due = extractBodyValue("Current Year Due:") || extractBodyValue("Current Due:");
            let prior_due = extractBodyValue("Prior Year Due:") || extractBodyValue("Prior Due:");

            const dueDetailsLink = document.querySelector('a[href*="tax-due-by-year.jsp"], a[href*="tax-due.jsp"]');
            const paidHistoryLink = document.querySelector('a[href*="payment-info.jsp"], a[href*="payment-history.jsp"]');

            let yearMatch = document.body.innerText.match(/Payment Information for (\d{4})/i) || document.body.innerText.match(/Tax Year:\s*(\d{4})/i);
            let base_year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

            return {
                owner_name,
                property_address,
                market_value,
                land_value,
                improvements,
                current_due,
                prior_due,
                dueDetailsUrl: dueDetailsLink ? dueDetailsLink.href : null,
                paidHistoryUrl: paidHistoryLink ? paidHistoryLink.href : null,
                base_year
            };
        });

        let main_data = {
            processed_date: "",
            order_number: "",
            borrower_name: "",
            owner_name: [detailPayload.owner_name],
            property_address: detailPayload.property_address,
            parcel_number: account,
            land_value: detailPayload.land_value.includes("$") ? detailPayload.land_value : "$" + detailPayload.land_value,
            improvements: detailPayload.improvements.includes("$") ? detailPayload.improvements : "$" + detailPayload.improvements,
            total_assessed_value: detailPayload.market_value.includes("$") ? detailPayload.market_value : "$" + detailPayload.market_value,
            exemption: "", 
            total_taxable_value: detailPayload.market_value.includes("$") ? detailPayload.market_value : "$" + detailPayload.market_value,
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

        if (detailPayload.dueDetailsUrl) {
            await page.goto(detailPayload.dueDetailsUrl, { waitUntil: "domcontentloaded" });
            await page.waitForSelector('#levy-due-by-year, table', { timeout: 5000 }).catch(() => {});

            let outstandingRecords = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('#levy-due-by-year tbody tr, table tbody tr'));
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

                if (recYearNum < currentYear) {
                    trackingKeys = 0; 
                }

                if (recordStatus === "Delinquent") {
                    globalStatus = "Delinquent";
                    delinquentYearsCollected.push(recYearNum);
                } else if (globalStatus !== "Delinquent") {
                    globalStatus = "Due";
                }

                main_data.tax_history.push({
                    jurisdiction: "County",
                    year: record.year,
                    payment_type: "Annual",
                    status: recordStatus,
                    base_amount: record.base_tax_due,
                    amount_paid: "$0.00",
                    amount_due: record.total_due,
                    mailing_date: `10/01/${recYearNum}`,
                    due_date: `01/31/${recYearNum + 1}`,
                    delq_date: `02/01/${recYearNum + 1}`,
                    paid_date: "N/A",
                    good_through_date: ""
                });
            }
        }

        if (priorDueNum > 0) {
            trackingKeys = 0;
            if (!delinquentYearsCollected.includes(currentYear - 1)) {
                delinquentYearsCollected.push(currentYear - 1);
            }
        }

        if (detailPayload.paidHistoryUrl) {
            await page.goto(detailPayload.paidHistoryUrl, { waitUntil: "domcontentloaded" });
            await page.waitForSelector('#jurisdiction-data, table', { timeout: 5000 }).catch(() => {});

            let paidHistoryRecords = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('#jurisdiction-data tbody tr, table tbody tr'));
                return rows.map(row => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    if (cells.length >= 4) {
                        return {
                            receipt_date: cells[0].textContent.trim(),
                            amount: cells[1].textContent.trim(),
                            year: cells[2].textContent.trim(),
                            description: cells[3].textContent.trim()
                        };
                    }
                    return null;
                }).filter(Boolean);
            });

            for (let record of paidHistoryRecords) {
                const yearExists = main_data.tax_history.some(item => item.year === record.year);
                if (!yearExists && record.description.toUpperCase().includes("PAYMENT")) {
                    let recYear = parseInt(record.year);
                    if (isNaN(recYear)) continue;
                    main_data.tax_history.push({
                        jurisdiction: "County",
                        year: record.year,
                        payment_type: "Annual",
                        status: "Paid",
                        base_amount: record.amount,
                        amount_paid: record.amount,
                        amount_due: "$0.00",
                        mailing_date: `10/01/${recYear}`,
                        due_date: `01/31/${recYear + 1}`,
                        delq_date: `02/01/${recYear + 1}`,
                        paid_date: format_to_us_date(record.receipt_date), 
                        good_through_date: ""
                    });
                }
            }
        }

        if (main_data.tax_history.length === 0) {
            main_data.tax_history.push({
                jurisdiction: "County",
                year: currentYear.toString(),
                payment_type: "Annual",
                status: "Paid",
                base_amount: "N/A",
                amount_paid: "N/A",
                amount_due: "$0.00",
                mailing_date: `10/01/${currentYear}`,
                due_date: `01/31/${currentYear + 1}`,
                delq_date: `02/01/${currentYear + 1}`,
                paid_date: "N/A",
                good_through_date: ""
            });
        }

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
            throw new Error(`Configuration for county '${county}' is missing.`);
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
                console.log(error);
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
                console.log(error);
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
        console.log(error);
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
