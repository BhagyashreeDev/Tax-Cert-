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
        const searchUrl = `https://mn-polk-treasurer.publicaccessnow.com/TaxSearch.aspx`;
        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: timeout_option.timeout });
        return true;
    } catch (error) {
        console.error("Error in ac_1:", error);
        throw new Error("Portal Connection Unsuccessful");
    }
};

const ac_2 = async (page, account) => {
    try {
        await page.waitForSelector("#selSearchBy", timeout_option);
        await page.select("#selSearchBy", "Column1=");
        
        await page.type("#fldInput", account.trim());
        
        await Promise.all([
            page.click("button#btnsearch"),
            page.waitForFunction(() => {
                return document.querySelector('#grm-search') !== null || document.body.innerText.includes("Total records: 0");
            }, timeout_option)
        ]);

        const isInvalidRecord = await page.evaluate(() => {
            return document.body.innerText.includes("Total records: 0");
        });

        if (isInvalidRecord) throw new Error("Record not found");

        const detailUrl = await page.evaluate(() => {
            const row = document.querySelector('#grm-search tbody tr[p]');
            if (!row) return null;
            const p = row.getAttribute('p');
            const a = row.getAttribute('a');
            return `https://mn-polk-treasurer.publicaccessnow.com/TaxSearch/AccountDetail.aspx?p=${encodeURIComponent(p)}&a=${encodeURIComponent(a)}`;
        });

        if (!detailUrl) throw new Error("Record not found");

        await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: timeout_option.timeout });

        return true;
    } catch (error) {
        console.error("Error in ac_2:", error);
        throw new Error(error.message === "Record not found" ? error.message : "Verification failed");
    }
};

const ac_3 = async (page, account) => {
    try {
        await page.waitForSelector("body", timeout_option);

        // 1. Extract Web Data & Bill Detail Link
        let detailPayload = await page.evaluate(() => {
            let owner_name = "N/A";
            let property_address = "N/A";

            const addressCells = Array.from(document.querySelectorAll('.ui-table td.width-half'));
            addressCells.forEach(td => {
                if (td.innerHTML.includes('Mailing Address:')) {
                    const lines = td.innerHTML.split('<br>');
                    if (lines.length > 1) {
                        owner_name = lines[1].replace(/<[^>]*>?/gm, '').trim();
                    }
                }
                if (td.innerHTML.includes('SITUS:')) {
                    const lines = td.innerHTML.split('<br>');
                    if (lines.length > 1) {
                        property_address = lines[1].replace(/<[^>]*>?/gm, '').trim();
                    }
                }
            });

            let history = [];
            const container = document.getElementById('462');
            const taxRows = container ? Array.from(container.querySelectorAll('table tbody tr')) : [];
            
            taxRows.forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length >= 8) {
                    let yearText = tds[0].innerText.trim();
                    if (!yearText || isNaN(yearText)) return;

                    const anchor = tds[0].querySelector('a');
                    let subPath = anchor ? anchor.getAttribute('href') : null;

                    history.push({
                        year: yearText,
                        net_tax: tds[2].innerText.trim(),
                        total_paid: tds[3].innerText.trim(),
                        amount_due: tds[7].innerText.trim(),
                        raw_due_date: tds[6].innerText.trim(),
                        subPath: subPath
                    });
                }
            });

            return { owner_name, property_address, history };
        });

        // 2. Filter & Sort History (Ascending Order)
        let latestYear = detailPayload.history.length > 0 ? detailPayload.history[0].year : new Date().getFullYear().toString();
        let filteredHistory = detailPayload.history.filter(record => {
            let dueNum = parseFloat(record.amount_due.replace(/[^0-9.-]/g, "")) || 0;
            return record.year === latestYear || dueNum > 0;
        });

        filteredHistory.sort((a, b) => parseInt(a.year) - parseInt(b.year));

        // 3. Navigate to Bill Detail Page for Math Calculation and Paid Date
        let calculatedValuation = "0.00";
        let fetchedPaidDate = "N/A";

        const targetRecord = detailPayload.history.find(r => r.year === latestYear);
        if (targetRecord && targetRecord.subPath) {
            try {
                const subDetailUrl = `https://mn-polk-treasurer.publicaccessnow.com${targetRecord.subPath}`;
                await page.goto(subDetailUrl, { waitUntil: "domcontentloaded", timeout: timeout_option.timeout });

                let billDetails = await page.evaluate(() => {
                    let multiplierVal = 0;
                    let lastPaid = "N/A";

                    // Calculate Assessed/Taxable via * 100 logic dynamically
                    // We grab the FIRST valid data row (which represents the local City or Township)
                    const fundsRows = Array.from(document.querySelectorAll('.funds tr'));
                    for (let i = 1; i < fundsRows.length; i++) {
                        const tr = fundsRows[i];
                        const tds = tr.querySelectorAll('td');
                        // Ensure it's a data row and not a subtotal or dropdown container
                        if (tds.length >= 2 && !tr.classList.contains('fund-detail') && !tr.innerText.toUpperCase().includes('TOTAL')) {
                            let grossTaxRaw = tds[1].innerText.replace(/[^0-9.-]/g, '');
                            if (grossTaxRaw) {
                                multiplierVal = parseFloat(grossTaxRaw) * 100;
                                break; // Stop after extracting the first jurisdiction's tax
                            }
                        }
                    }

                    // Extract Last Paid Date from Payment History
                    const ths = Array.from(document.querySelectorAll('th'));
                    const lastPaidHeader = ths.find(th => th.innerText.includes('Last Paid'));
                    if (lastPaidHeader) {
                        const table = lastPaidHeader.closest('table');
                        const rows = table.querySelectorAll('tr');
                        if (rows.length > 1) {
                            const tds = rows[1].querySelectorAll('td');
                            // The 5th column (index 4) contains the Last Paid date
                            if (tds.length >= 5) {
                                lastPaid = tds[4].innerText.trim();
                            }
                        }
                    }

                    return { multiplierVal, lastPaid };
                });

                if (billDetails.multiplierVal > 0) {
                    // Use toFixed to prevent javascript floating point errors (e.g., 63751.00000001)
                    calculatedValuation = billDetails.multiplierVal.toFixed(2);
                }
                fetchedPaidDate = billDetails.lastPaid;

            } catch (err) {
                console.error("Failed to fetch bill details natively:", err.message);
            }
        }

        // 4. Build Final Payload
        let main_data = {
            processed_date: format_to_us_date(new Date().toLocaleDateString('en-US')),
            order_number: "",
            borrower_name: "",
            owner_name: [decodeHtmlEntities(detailPayload.owner_name)],
            property_address: detailPayload.property_address,
            parcel_number: account,
            land_value: "N/A", 
            improvements: "N/A",
            total_assessed_value: safe_currency_format(calculatedValuation), 
            exemption: "N/A", 
            total_taxable_value: safe_currency_format(calculatedValuation),   
            taxing_authority: "Polk County Finance",
            notes: "",
            delinquent: "NONE",
            tax_history: []
        };

        let isDelqFlag = false;
        let rightNow = new Date();

        // 5. Process Installments (Semi-Annual Split)
        filteredHistory.forEach(record => {
            let netTaxNum = parseFloat(record.net_tax.replace(/[^0-9.-]/g, "")) || 0;
            let totalPaidNum = parseFloat(record.total_paid.replace(/[^0-9.-]/g, "")) || 0;
            
            let halfBase = netTaxNum / 2;
            
            let firstPaid = totalPaidNum >= halfBase ? halfBase : totalPaidNum;
            let firstDue = halfBase - firstPaid;
            
            let secondPaid = totalPaidNum > halfBase ? totalPaidNum - halfBase : 0;
            let secondDue = halfBase - secondPaid;

            let date1 = `05/15/${record.year}`;
            let date2 = `10/15/${record.year}`;

            let stat1 = "Paid";
            let goodThrough1 = "";
            let pDate1 = "N/A";
            
            if (firstDue > 0) {
                stat1 = rightNow > new Date(date1) ? "Delq" : "Due";
                goodThrough1 = format_to_us_date(date1); 
                isDelqFlag = true;
            } else {
                pDate1 = (record.year === latestYear) ? format_to_us_date(fetchedPaidDate) : "N/A";
            }

            let stat2 = "Paid";
            let goodThrough2 = "";
            let pDate2 = "N/A";
            
            if (secondDue > 0) {
                stat2 = rightNow > new Date(date2) ? "Delq" : "Due";
                goodThrough2 = format_to_us_date(date2); 
                isDelqFlag = true;
            } else {
                pDate2 = (record.year === latestYear) ? format_to_us_date(fetchedPaidDate) : "N/A";
            }

            main_data.tax_history.push({
                jurisdiction: "County",
                year: record.year,
                payment_type: "Semi-Annual", 
                status: stat1,
                base_amount: safe_currency_format(halfBase),
                amount_paid: safe_currency_format(firstPaid),
                amount_due: safe_currency_format(firstDue),
                mailing_date: "N/A",
                due_date: format_to_us_date(date1),
                delq_date: format_to_us_date(date1), 
                paid_date: pDate1,
                good_through_date: goodThrough1 
            });

            main_data.tax_history.push({
                jurisdiction: "County",
                year: record.year,
                payment_type: "Semi-Annual", 
                status: stat2,
                base_amount: safe_currency_format(halfBase),
                amount_paid: safe_currency_format(secondPaid),
                amount_due: safe_currency_format(secondDue),
                mailing_date: "N/A",
                due_date: format_to_us_date(date2),
                delq_date: format_to_us_date(date2),
                paid_date: pDate2,
                good_through_date: goodThrough2 
            });
        });

        // 6. Template Notes Logic
        let latestYearTaxes = main_data.tax_history.filter(t => t.year === latestYear);
        let priorTaxes = main_data.tax_history.filter(t => t.year !== latestYear);
        
        let hasPriorDelq = priorTaxes.some(t => t.status === "Delq" || t.status === "Due");

        if (latestYearTaxes.length >= 2) {
            let stat1 = latestYearTaxes[0].status.toUpperCase();
            let stat2 = latestYearTaxes[1].status.toUpperCase();
            
            if (hasPriorDelq) {
                main_data.notes = `PRIOR TAXES SHOW BALANCE DUE. ${latestYear} 1ST INSTALLMENT IS ${stat1}, 2ND INSTALLMENT IS ${stat2}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 05/15 AND 10/15.`;
                main_data.delinquent = priorTaxes[0].year; 
            } else {
                main_data.notes = `ALL PRIORS ARE PAID, ${latestYear} 1ST INSTALLMENT IS ${stat1}, 2ND INSTALLMENT IS ${stat2}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 05/15 AND 10/15.`;
                if (stat1 === "DELQ" || stat2 === "DELQ") main_data.delinquent = latestYear;
            }
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

const account_search = async (page, account) => {
    try {
        await ac_1(page); 
        await ac_2(page, account);   
        const scrapingResults = await ac_3(page, account); 
        return scrapingResults;
    } catch (error) {
        console.error("Error in account_search lifecycle:", error);
        throw new Error(error.message);
    }
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    
    try {    
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', { error: true, message: "Invalid Access" });
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
            account_search(page, account)
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
            account_search(page, account)
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
