// actWebType3.controller.js
// Author:- Mayank Nandgowle
// Target:- MONTGOMERY - Legacy Texas ACT (Type 3: Modern UI / Zero-Click Detail Bypass)


import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION & HELPERS
// ==========================================

const modern_county_data = {
    bexar: { url: "https://bexar.acttax.com/act_webdev/bexar", auth: "Bexar County, TX" },
    elpaso: { url: "https://actweb.acttax.com/act_webdev/elpaso", auth: "El Paso County, TX" },
    montgomery: { url: "https://actweb.acttax.com/act_webdev/montgomery", auth: "Montgomery County, TX" }
};

const timeout_option = { timeout: 45000 };

const is_delq = (dateStr) => {
    let today = new Date();
    let delq_date = new Date(dateStr);
    return (today >= delq_date) ? "Delinquent" : "Not Paid";
};

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
    let strVal = value.trim();
    if (strVal === "0" || strVal === "$0") return "$0.00";
    return strVal.includes("$") ? strVal : "$" + strVal;
};

// ==========================================
// 2. SCRAPER ACTION MODULES 
// ==========================================

const ac_1 = async (page, url) => {
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        return true;
    } catch (error) {
        console.error("Error in ac_1:", error);
        throw new Error("Portal Connection Unsuccessful");
    }
};

const ac_2 = async (page, account) => {
    try {
        const pageError = await page.evaluate((acc) => {
            const bodyText = document.body.innerText;
            if (bodyText.includes("unable to find your account") || bodyText.includes("No matching records") || bodyText.includes("There are 100 matches")) {
                return "Record not found";
            }
            if (!bodyText.includes(acc)) {
                return "Record not found";
            }
            return null;
        }, account);

        if (pageError) throw new Error(pageError);
        return true;
    } catch (error) {
        console.error("Error in ac_2:", error);
        throw new Error(error.message === "Record not found" ? error.message : "Verification failed");
    }
};

const ac_3 = async (page, account, baseUrl, county) => {
    try {
        await page.waitForSelector("body", timeout_option);

        let detailPayload = await page.evaluate(() => {
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
                let index = bodyText.indexOf(label);
                if (index === -1) return null;
                
                let substring = bodyText.slice(index + label.length).trim();
                let chunk = substring.slice(0, 80); 
                
                let match = chunk.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
                return match ? match[1] : null; 
            };

            let owner_name = "N/A";
            let rawAddressText = extractBlockData("Address:", ["Prop. Id. No.", "Property Site Address:", "Legal Description:", "Current Tax Levy:", "202"]);
            if (rawAddressText) {
                let lines = rawAddressText.split('\n').map(l => l.trim()).filter(Boolean);
                let nameParts = [];
                for (let line of lines) {
                    if (line.toUpperCase().includes("PROP. ID.") || line.toUpperCase().includes("ACCOUNT NO")) continue;
                    if (/[0-9]/.test(line) && !line.toUpperCase().includes("C/O") && !line.toUpperCase().includes("APT") && !line.toUpperCase().includes("STE") && !line.toUpperCase().includes("#")) break;
                    nameParts.push(line);
                }
                if (nameParts.length > 0) owner_name = nameParts.join(' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
            }

            let property_address = "N/A";
            let rawPropText = extractBlockData("Property Site Address:", ["Legal Description:", "Current Tax Levy:", "Tax Levy:", "Current Amount Due:"]);
            if (rawPropText) {
                 let cleanProp = rawPropText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                 if (cleanProp) property_address = cleanProp;
            }

            let bannerYearMatch = bodyText.match(/tax\s+information\s+for\s+(20\d{2})/i);
            let yearMatch = bodyText.match(/(20\d{2})\s+Year\s+Tax\s+Levy/i) || bodyText.match(/Tax\s+Year:\s*(20\d{2})/i);
            let base_year = bannerYearMatch ? bannerYearMatch[1] : (yearMatch ? yearMatch[1] : new Date().getFullYear().toString());

            let delqMatch = bodyText.match(/(?:Delinquent After|added after|become delinquent on)[\s:]*(\d{2}\/\d{2}\/\d{4})/i);
            let delq_date_scraped = delqMatch ? delqMatch[1] : `02/01/${parseInt(base_year) + 1}`;

            let last_payment_date = "N/A";
            let dateBlockMatch = bodyText.match(/Last\s+Payment\s+Date(?:[\s\S]*?)(\d{2}[-\/]\d{2}[-\/]\d{4})/i);
            if (dateBlockMatch) {
                last_payment_date = dateBlockMatch[1];
            }

            let last_payment_amt = getCurrencyValue("Last Payment Amount for Current Year Taxes:") || getCurrencyValue("Last Payment Amount Received:") || getCurrencyValue("Last Payment Amount:") || "0.00";
            if (bodyText.includes("Not Received")) last_payment_amt = "N/A";

            let is_half_payment = bodyText.toUpperCase().includes("HALF PAYMENT OPTION");

            return {
                owner_name,
                property_address,
                base_year,
                delq_date_scraped,
                is_half_payment,
                market_value: getCurrencyValue("Gross Value:") || getCurrencyValue("Total Market Value:") || getCurrencyValue("Market Value:") || "0.00",
                land_value: getCurrencyValue("Land Value:") || "0.00",
                improvements: getCurrencyValue("Improvement Value:") || getCurrencyValue("Improvements:") || "0.00",
                current_levy: getCurrencyValue("Current Tax Levy:") || getCurrencyValue("Tax Levy:") || "0.00", 
                total_due: getCurrencyValue("Total Amount Due:") || getCurrencyValue("Total Due:") || "0.00",
                prior_due: getCurrencyValue("Prior Year(s) Amount Due:") || getCurrencyValue("Prior Year Amount Due:") || "0.00",
                last_payment_amt: last_payment_amt,
                last_payment_date: last_payment_date
            };
        });

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
            taxing_authority: modern_county_data[county].auth,
            notes: "",
            delinquent: "NONE",
            tax_history: []
        };

        let trackingKeys = 1; 
        let globalStatus = "Paid";
        let currentYear = parseInt(detailPayload.base_year);
        let priorDueNum = parseFloat(detailPayload.prior_due.replace(/[^0-9.-]+/g, "")) || 0;
        let totalDueNum = parseFloat(detailPayload.total_due.replace(/[^0-9.-]+/g, "")) || 0;

        if (priorDueNum > 0) {
            trackingKeys = 0;
            const historyUrl = `${baseUrl}/taxbyyear.jsp?can=${encodeURIComponent(account)}`;
            await page.goto(historyUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
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
                
                let amtDueNum = parseFloat(record.total_due.replace(/[^0-9.-]+/g, "")) || 0;
                
                if (amtDueNum > 0) {
                    let recordStatus = is_delq(`02/01/${recYearNum + 1}`);
                    if (recordStatus === "Delinquent") {
                        globalStatus = "Delinquent";
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
        }

        let scrapedPaymentDates = [];
        if (detailPayload.is_half_payment) {
            const paymentInfoUrl = `${baseUrl}/reports/paymentinfo.jsp?can=${encodeURIComponent(account)}&ownerno=0`;
            try {
                await page.goto(paymentInfoUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
                await page.waitForSelector('table', { timeout: 5000 }).catch(() => {});

                scrapedPaymentDates = await page.evaluate((currYear) => {
                    const rows = Array.from(document.querySelectorAll('table tbody tr'));
                    let dates = [];
                    for (let row of rows) {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 3) {
                            const dateStr = cells[0].textContent.trim();
                            const rollYear = cells[1].textContent.trim();
                            const description = cells[3] ? cells[3].textContent.trim().toUpperCase() : "";
                            // Filter specifically for valid current year "Payment" types to omit reversals/refunds
                            if (rollYear === currYear.toString() && description.includes("PAYMENT")) {
                                dates.push(dateStr);
                            }
                        }
                    }
                    return dates;
                }, currentYear);
            } catch (e) {
                console.error("Error fetching payment history details:", e);
            }
        }

        // Keep oldest transaction first to perfectly line up 1st and 2nd installment timelines
        scrapedPaymentDates.sort((a, b) => new Date(a) - new Date(b));
        let firstHalfScrapedDate = scrapedPaymentDates.length > 0 ? format_to_us_date(scrapedPaymentDates[0]) : "N/A";
        let secondHalfScrapedDate = scrapedPaymentDates.length > 1 ? format_to_us_date(scrapedPaymentDates[1]) : "N/A";

        let cleanPaidDate = format_to_us_date(detailPayload.last_payment_date);

        let currentYearStatus = "Paid";
        if (totalDueNum > 0) {
            currentYearStatus = is_delq(detailPayload.delq_date_scraped);
        }

        let currentYearHistory = [];
        let totalLevyNum = parseFloat(detailPayload.current_levy.replace(/[^0-9.-]+/g, "")) || 0;

        // CRITICAL ROUTING RULE FIX: Real split utilization requires either 2 clean payments or an active outstanding split balance
        let isTrueSplitPayment = detailPayload.is_half_payment && (scrapedPaymentDates.length === 2 || totalDueNum > 0);

        if (isTrueSplitPayment) {
            // Process split rows exactly as instructed
            let halfLevyAmount = totalLevyNum / 2;
            let halfLevyStr = safe_currency_format(halfLevyAmount.toFixed(2));

            let firstHalfPaid = 0, firstHalfDue = 0, secondHalfPaid = 0, secondHalfDue = 0;

            if (totalDueNum === 0) {
                firstHalfPaid = halfLevyAmount;
                secondHalfPaid = halfLevyAmount;
            } else if (Math.abs(totalDueNum - halfLevyAmount) < 0.05) {
                firstHalfPaid = halfLevyAmount;
                secondHalfDue = halfLevyAmount;
            } else if (Math.abs(totalDueNum - totalLevyNum) < 0.05) {
                firstHalfDue = halfLevyAmount;
                secondHalfDue = halfLevyAmount;
            } else {
                if (totalDueNum > halfLevyAmount) {
                    firstHalfDue = halfLevyAmount;
                    secondHalfDue = totalDueNum - halfLevyAmount;
                } else {
                    firstHalfPaid = halfLevyAmount - totalDueNum;
                    firstHalfDue = totalDueNum;
                }
            }

            let firstHalfStatus = firstHalfDue > 0 ? (is_delq(`12/01/${currentYear}`) === "Delinquent" ? "Delinquent" : "Not Paid") : "Paid";
            let secondHalfStatus = secondHalfDue > 0 ? currentYearStatus : "Paid";

            // Row 1: First Half Installment
            currentYearHistory.push({
                jurisdiction: "County",
                year: currentYear.toString(),
                payment_type: "Semi-Annual",
                status: firstHalfStatus,
                base_amount: halfLevyStr,
                amount_paid: safe_currency_format(firstHalfPaid.toFixed(2)),
                amount_due: safe_currency_format(firstHalfDue.toFixed(2)),
                mailing_date: `10/01/${currentYear}`,
                due_date: `11/30/${currentYear}`,
                delq_date: `12/01/${currentYear}`,
                paid_date: firstHalfPaid > 0 ? firstHalfScrapedDate : "N/A", 
                good_through_date: ""
            });

            // Row 2: Second Half Installment
            currentYearHistory.push({
                jurisdiction: "County",
                year: currentYear.toString(),
                payment_type: "Semi-Annual",
                status: secondHalfStatus,
                base_amount: halfLevyStr,
                amount_paid: safe_currency_format(secondHalfPaid.toFixed(2)),
                amount_due: safe_currency_format(secondHalfDue.toFixed(2)),
                mailing_date: `10/01/${currentYear}`,
                due_date: `06/30/${currentYear + 1}`,
                delq_date: detailPayload.delq_date_scraped, 
                paid_date: secondHalfPaid > 0 ? secondHalfScrapedDate : "N/A",
                good_through_date: ""
            });

        } else {
            // Single layout entry for traditional annual accounts or immediate lump-sums
            currentYearHistory.push({
                jurisdiction: "County",
                year: currentYear.toString(),
                payment_type: "Annual",
                status: currentYearStatus,
                base_amount: safe_currency_format(detailPayload.current_levy),
                amount_paid: totalDueNum === 0 ? safe_currency_format(detailPayload.current_levy) : safe_currency_format(detailPayload.last_payment_amt),
                amount_due: safe_currency_format(detailPayload.total_due),
                mailing_date: `10/01/${currentYear}`,
                due_date: `01/31/${currentYear + 1}`,
                delq_date: detailPayload.delq_date_scraped,
                paid_date: cleanPaidDate,
                good_through_date: ""
            });
        }

        currentYearHistory.forEach(row => main_data.tax_history.push(row));
        main_data.tax_history.sort((a, b) => parseInt(b.year) - parseInt(a.year));

        // ==========================================
        // DYNAMIC NOTES INJECTION
        // ==========================================
        const isSemiAnnual = (currentYearHistory.length >= 2 && currentYearHistory[0].payment_type === "Semi-Annual");
        const isAnyDelinquent = main_data.tax_history.some(history => history.status === "Delinquent");
        const isPriorYearPaid = (trackingKeys === 1);
        const basePaymentType = isSemiAnnual ? "SEMI ANNUALLY" : "ANNUALLY";
        const yearVal = currentYear.toString();

        let dynamicDueDatesNote = "";
        if (isSemiAnnual && currentYearHistory.length >= 2) {
            const shortDueOne = currentYearHistory[0].due_date.slice(0, 5); 
            const shortDueTwo = currentYearHistory[1].due_date.slice(0, 5); 
            dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} AND ${shortDueTwo}`;
        } else if (currentYearHistory[0]) {
            const shortDueOne = currentYearHistory[0].due_date.slice(0, 5);
            dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
        }

        let generatedNotes = "";
        if (isSemiAnnual && currentYearHistory.length >= 2) {
            const statusOne = currentYearHistory[0].status.toUpperCase();
            const statusTwo = currentYearHistory[1].status.toUpperCase();
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

        main_data['notes'] = generatedNotes;

        return main_data;
    } catch (error) {
        console.error("Error in ac_3:", error);
        throw new Error(error.message);
    }
};

// ==========================================
// 3. ORCHESTRATION & CONTROLLER
// ==========================================

const account_search = async (page, baseUrl, account, county) => {
    try {
        const detailUrl = `${baseUrl}/showdetail2.jsp?can=${encodeURIComponent(account)}&ownerno=0`;

        await ac_1(page, detailUrl); 
        await ac_2(page, account);   
        const scrapingResults = await ac_3(page, account, baseUrl, county); 
        
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

        if (!modern_county_data[county]) {
            throw new Error(`Configuration for county '${county}' is missing.`);
        }

        const baseUrl = modern_county_data[county]['url'];

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
            account_search(page, baseUrl, account, county)
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
            account_search(page, baseUrl, account, county)
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
