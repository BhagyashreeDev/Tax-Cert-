// Author :- Vadiraj Joshi
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "allen": { url: "https://lowtaxinfo.com/allencounty", auth: "Allen County, IN" },
    "cass": { url: "https://lowtaxinfo.com/casscounty", auth: "Cass County, IN" },
    "clark": { url: "https://lowtaxinfo.com/clarkcounty", auth: "Clark County, IN" },
    "clay": { url: "https://lowtaxinfo.com/claycounty", auth: "Clay County, IN" },
    "dekalb": { url: "https://lowtaxinfo.com/dekalbcounty", auth: "DeKalb County, IN" },
    "fayette": { url: "https://lowtaxinfo.com/fayettecounty", auth: "Fayette County, IN" },
    "floyd": { url: "https://lowtaxinfo.com/floydcounty", auth: "Floyd County, IN" },
    "fountain": { url: "https://lowtaxinfo.com/fountaincounty", auth: "Fountain County, IN" },
    "franklin": { url: "https://lowtaxinfo.com/franklincounty", auth: "Franklin County, IN" },
    "fulton": { url: "https://lowtaxinfo.com/fultoncounty", auth: "Fulton County, IN" },
    "grant": { url: "https://lowtaxinfo.com/grantcounty", auth: "Grant County, IN" },
    "hancock": { url: "https://lowtaxinfo.com/hancockcounty", auth: "Hancock County, IN" },
    "hendricks": { url: "https://lowtaxinfo.com/hendrickscounty", auth: "Hendricks County, IN" },
    "howard": { url: "https://lowtaxinfo.com/howardcounty", auth: "Howard County, IN" },
    "jackson": { url: "https://lowtaxinfo.com/jacksoncounty", auth: "Jackson County, IN" },
    "johnson": { url: "https://lowtaxinfo.com/johnsoncounty", auth: "Johnson County, IN" },
    "monroe": { url: "https://lowtaxinfo.com/monroecounty", auth: "Monroe County, IN" },
    "owen": { url: "https://lowtaxinfo.com/owencounty", auth: "Owen County, IN" },
    "perry": { url: "https://lowtaxinfo.com/perrycounty", auth: "Perry County, IN" },
    "porter": { url: "https://lowtaxinfo.com/portercounty", auth: "Porter County, IN" },
    "pulaski": { url: "https://lowtaxinfo.com/pulaskicounty", auth: "Pulaski County, IN" },
    "randolph": { url: "https://lowtaxinfo.com/randolphcounty", auth: "Randolph County, IN" },
    "scott": { url: "https://lowtaxinfo.com/scottcounty", auth: "Scott County, IN" },
    "st-joseph": { url: "https://lowtaxinfo.com/sjcounty", auth: "St. Joseph County, IN" },
    "starke": { url: "https://lowtaxinfo.com/starkecounty", auth: "Starke County, IN" },
    "sullivan": { url: "https://lowtaxinfo.com/sullivancounty", auth: "Sullivan County, IN" },
    "tipton": { url: "https://lowtaxinfo.com/tiptoncounty", auth: "Tipton County, IN" },
    "vermillion": { url: "https://lowtaxinfo.com/vermillioncounty", auth: "Vermillion County, IN" },
    "vigo": { url: "https://lowtaxinfo.com/vigocounty", auth: "Vigo County, IN" },
    "warrick": { url: "https://lowtaxinfo.com/warrickcounty", auth: "Warrick County, IN" },
    "white": { url: "https://lowtaxinfo.com/whitecounty", auth: "White County, IN" },
    "whitley": { url: "https://lowtaxinfo.com/whitleycounty", auth: "Whitley County, IN" }
};

const timeout_option = { timeout: 90000 };

const ac_1 = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            let targetUrl = baseUrl;
            if (!targetUrl.includes('#/')) {
                targetUrl = `${targetUrl}/#/SearchView`;
            }

            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeout_option.timeout });

            await page.waitForSelector("#parcel-number", timeout_option);
            await new Promise(res => setTimeout(res, 500)); 
            
            await page.type("#parcel-number", account, { delay: 50 });
            await page.keyboard.press("Enter");

            await page.waitForSelector(".owner-sub-address", timeout_option);
            await new Promise(res => setTimeout(res, 800));

            const page_content = await page.evaluate((accountInput, taxAuthName) => {
                const data = {
                    processed_date: new Date().toLocaleDateString(),
                    order_number: "",
                    borrower_name: "",
                    owner_name: ["N/A"],
                    property_address: "N/A",
                    parcel_number: accountInput,
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemption: "N/A",
                    total_taxable_value: "N/A",
                    taxing_authority: taxAuthName,
                    notes: "",
                    delinquent: "NONE",
                    tax_history: []
                };

                const h1Address = document.querySelector('.col h1.mb-0');
                const pLeadCity = document.querySelector('.col p.lead');
                if (h1Address || pLeadCity) {
                    const str1 = h1Address ? h1Address.textContent.trim() : "";
                    const str2 = pLeadCity ? pLeadCity.textContent.trim() : "";
                    data.property_address = `${str1} ${str2}`.trim();
                }

                const ownerH4 = document.querySelector('.owner-sub-address h4.mb-0');
                if (ownerH4) {
                    data.owner_name = [ownerH4.textContent.trim()];
                }

                // ------------------------------------------------------------------------------------------------
                // TAX HISTORY PARSING & MAX YEAR DETECTION
                // ------------------------------------------------------------------------------------------------
                let rawHistory = [];
                const histRows = document.querySelectorAll('#tax-history tbody tr');
                let stopParsing = false;

                for (let i = 0; i < histRows.length; i++) {
                    if (stopParsing) break;

                    const th = histRows[i].querySelector('th');
                    const tds = histRows[i].querySelectorAll('td');
                    if (!th || tds.length < 5) continue;

                    const rowYear = th.textContent.trim();
                    const springHistoryAmt = tds[0].textContent.trim();
                    const fallHistoryAmt = tds[1].textContent.trim();
                    
                    const rDelq = parseFloat(tds[2].textContent.replace(/[^0-9.-]/g, '')) || 0;
                    const rTotalTax = parseFloat(tds[3].textContent.replace(/[^0-9.-]/g, '')) || 0;
                    const rPayments = parseFloat(tds[4].textContent.replace(/[^0-9.-]/g, '')) || 0;
                    
                    const totalDueInRow = rTotalTax - rPayments;
                    const isFullyPaid = totalDueInRow <= 0.01;

                    rawHistory.push({
                        year: rowYear,
                        springHistoryAmt: springHistoryAmt,
                        fallHistoryAmt: fallHistoryAmt,
                        springNum: parseFloat(springHistoryAmt.replace(/[^0-9.-]/g, '')) || 0,
                        fallNum: parseFloat(fallHistoryAmt.replace(/[^0-9.-]/g, '')) || 0,
                        rDelq: rDelq,
                        totalTaxNum: rTotalTax,
                        paymentsAmt: rPayments,
                        isPaid: isFullyPaid
                    });

                    if (i === 0) {
                        if (isFullyPaid) stopParsing = true; 
                    } else {
                        if (isFullyPaid) {
                            rawHistory.pop();
                            stopParsing = true;
                        }
                    }
                }

                let maxYearStr = "";
                if (rawHistory.length > 0) {
                    const years = rawHistory.map(r => parseInt(r.year)).filter(y => !isNaN(y));
                    if (years.length > 0) {
                        maxYearStr = Math.max(...years).toString();
                    }
                }

                let latestPaymentDate = "N/A";
                const paymentRows = document.querySelectorAll('#payment-history tbody tr');
                paymentRows.forEach(tr => {
                    const tds = tr.querySelectorAll('td');
                    const th = tr.querySelector('th');
                    if (th && tds.length > 0) {
                        if (th.textContent.trim() === maxYearStr) {
                            latestPaymentDate = tds[0].textContent.trim();
                        }
                    }
                });

                let currentSpringBase = "$0.00";
                let currentFallBase = "$0.00";
                let accountBalanceStr = "$0.00";
                
                const billingRows = document.querySelectorAll('#billing-detail tbody tr, section#billing table tbody tr');
                billingRows.forEach(tr => {
                    const th = tr.querySelector('th');
                    const tds = tr.querySelectorAll('td');
                    if (th && tds.length > 0) {
                        const rowHeader = th.textContent.trim();
                        if (rowHeader === 'Spring Tax:') {
                            currentSpringBase = tds[0].textContent.trim();
                        } else if (rowHeader === 'Fall Tax:') {
                            currentFallBase = tds[0].textContent.trim();
                        } else if (rowHeader === 'Account Balance:') {
                            accountBalanceStr = tds[tds.length - 1].textContent.trim();
                        }
                    }
                });

                const today = new Date();
                
                let priorYearsAreCleared = false;
                let maxYearRow = rawHistory.find(r => r.year === maxYearStr);
                if (maxYearRow && maxYearRow.paymentsAmt >= maxYearRow.rDelq) {
                    priorYearsAreCleared = true;
                }

                if (priorYearsAreCleared) {
                    rawHistory = rawHistory.filter(r => r.year === maxYearStr);
                }
                
                rawHistory.forEach(rh => {
                    // =======================================================================================
                    // ANNUAL ROLLUP OVERRIDE (For Edge-Case Partial Payments & Past Delinquencies)
                    // =======================================================================================
                    let isPartialLessThanSpring = rh.paymentsAmt > 0 && rh.paymentsAmt < rh.springNum;
                    let isPastDelinquent = rh.year !== maxYearStr && !rh.isPaid;

                    if (isPartialLessThanSpring || isPastDelinquent) {
                        let amountDueNum = rh.totalTaxNum - rh.paymentsAmt;
                        if (amountDueNum < 0) amountDueNum = 0;

                        let rollupDueStr = `11/10/${rh.year}`;
                        let annualStatus = "Due";
                        
                        // TRUE DATE DELINQUENCY CHECK FOR ANNUAL ROW
                        if (today > new Date(rollupDueStr)) {
                            annualStatus = "Delinquent";
                        }

                        data.tax_history.push({
                            jurisdiction: "County",
                            year: rh.year,
                            payment_type: "Annual",
                            status: annualStatus,
                            base_amount: `$${rh.totalTaxNum.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
                            amount_paid: `$${rh.paymentsAmt.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
                            amount_due: `$${amountDueNum.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
                            mailing_date: "N/A",
                            due_date: rollupDueStr,
                            delq_date: `11/11/${rh.year}`,
                            paid_date: "N/A",
                            good_through_date: "-"
                        });
                        return; // Skip standard Semi-Annual splitting
                    }

                    // =======================================================================================
                    // STANDARD SEMI-ANNUAL LOGIC
                    // =======================================================================================
                    let sStatus = "Due", fStatus = "Due";
                    let sDate = "N/A", fDate = "N/A";
                    let sPaidNum = 0, fPaidNum = 0;
                    let sDueNum = rh.springNum, fDueNum = rh.fallNum;
                    let sBase = rh.springHistoryAmt;
                    let fBase = rh.fallHistoryAmt;
                    
                    let sPaidDisplayNum = 0; 

                    if (rh.year === maxYearStr) {
                        sBase = currentSpringBase || sBase;
                        fBase = currentFallBase || fBase;
                        
                        let remainingPayment = rh.paymentsAmt;
                        
                        let delqPaid = Math.min(rh.rDelq, remainingPayment);
                        remainingPayment -= delqPaid;

                        sPaidNum = Math.min(rh.springNum, remainingPayment);
                        remainingPayment -= sPaidNum;

                        fPaidNum = Math.min(rh.fallNum, remainingPayment);

                        sDueNum = rh.springNum - sPaidNum;
                        fDueNum = rh.fallNum - fPaidNum;

                        const numBalance = parseFloat(accountBalanceStr.replace(/[^0-9.-]/g, '')) || 0;
                        if (numBalance <= 0.01) {
                            sPaidNum = rh.springNum; fPaidNum = rh.fallNum;
                            sDueNum = 0; fDueNum = 0;
                        } else if (fDueNum > 0 && Math.abs(fDueNum - numBalance) < 0.05 && sDueNum === 0) {
                             fDueNum = numBalance; 
                        }

                        sPaidDisplayNum = delqPaid + sPaidNum;

                        if (sPaidDisplayNum > 0) sDate = latestPaymentDate;
                        if (fPaidNum > 0) fDate = latestPaymentDate;

                        sStatus = sDueNum <= 0.01 ? "Paid" : "Due";
                        fStatus = fDueNum <= 0.01 ? "Paid" : "Due";

                    } else {
                        let remainingPayment = rh.paymentsAmt;
                        sPaidNum = Math.min(rh.springNum, remainingPayment);
                        remainingPayment -= sPaidNum;
                        fPaidNum = Math.min(rh.fallNum, remainingPayment);

                        sDueNum = rh.springNum - sPaidNum;
                        fDueNum = rh.fallNum - fPaidNum;

                        if (sDueNum < 0) sDueNum = 0;
                        if (fDueNum < 0) fDueNum = 0;
                        
                        sPaidDisplayNum = sPaidNum;
                        
                        sStatus = sDueNum <= 0.01 ? "Paid" : "Due";
                        fStatus = fDueNum <= 0.01 ? "Paid" : "Due";
                    }

                    const dueOneStr = `05/11/${rh.year}`;
                    const dueTwoStr = `11/10/${rh.year}`;

                    if (sStatus === "Due" && today > new Date(dueOneStr)) sStatus = "Delinquent";
                    if (fStatus === "Due" && today > new Date(dueTwoStr)) fStatus = "Delinquent";

                    let sPaidStr = `$${sPaidDisplayNum.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
                    let fPaidStr = `$${fPaidNum.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
                    let sDueStr = `$${sDueNum.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
                    let fDueStr = `$${fDueNum.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

                    data.tax_history.push({
                        jurisdiction: "County",
                        year: rh.year,
                        payment_type: "Semi-Annual",
                        status: sStatus,
                        base_amount: sBase,
                        amount_paid: sPaidStr,
                        amount_due: sDueStr,
                        mailing_date: "N/A",
                        due_date: dueOneStr,
                        delq_date: `05/12/${rh.year}`,
                        paid_date: sDate,
                        good_through_date: "-"
                    });

                    data.tax_history.push({
                        jurisdiction: "County",
                        year: rh.year,
                        payment_type: "Semi-Annual",
                        status: fStatus,
                        base_amount: fBase,
                        amount_paid: fPaidStr,
                        amount_due: fDueStr,
                        mailing_date: "N/A",
                        due_date: dueTwoStr,
                        delq_date: `11/11/${rh.year}`,
                        paid_date: fDate,
                        good_through_date: "-"
                    });
                });

                data.tax_history.sort((a, b) => parseInt(a.year) - parseInt(b.year) || new Date(a.due_date) - new Date(b.due_date));

                // ------------------------------------------------------------------------------------------------
                // EXACT STRING EXTRACTION: Total Gross Assessed Value 
                // ------------------------------------------------------------------------------------------------
                const allTablesForAssessment = document.querySelectorAll('table');
                for (let table of allTablesForAssessment) {
                    const targetRow = Array.from(table.querySelectorAll('tr')).find(tr => 
                        tr.textContent.includes('Equals total gross assessed value')
                    );
                    
                    if (targetRow) {
                        const headerRow = Array.from(table.querySelectorAll('tr')).find(tr => tr.textContent.includes(maxYearStr));
                        let colIdx = -1;
                        
                        if (headerRow) {
                            const headers = Array.from(headerRow.querySelectorAll('th, td'));
                            for (let i = 0; i < headers.length; i++) {
                                if (headers[i].textContent.includes(maxYearStr)) {
                                    colIdx = i;
                                    break;
                                }
                            }
                        }
                        
                        const tds = Array.from(targetRow.querySelectorAll('td'));
                        
                        if (colIdx !== -1 && tds[colIdx]) {
                            const matchedVal = tds[colIdx].textContent.trim();
                            data.total_assessed_value = matchedVal;
                            data.total_taxable_value = matchedVal;
                        } else if (tds.length > 1) {
                            const matchedVal = tds[tds.length - 1].textContent.trim();
                            data.total_assessed_value = matchedVal;
                            data.total_taxable_value = matchedVal;
                        }
                        break; 
                    }
                }

                // Reference Notes Generation Block
                const isAnyDelinquent = data.tax_history.some(h => h.status === "Delinquent");
                data.delinquent = isAnyDelinquent ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF" : "NONE";

                const basePaymentType = "SEMI ANNUALLY";
                const dynamicDueDatesNote = "NORMAL DUE DATES ARE 05/11 , 11/10";

                const currYearHist = data.tax_history.filter(h => h.year === maxYearStr);
                
                const priorHist = data.tax_history.filter(h => parseInt(h.year) < parseInt(maxYearStr));
                const isPriorYearPaid = !priorHist.some(h => h.status === "Delinquent");

                if (currYearHist.length >= 2) {
                    const statusOne = currYearHist[0].status.toUpperCase();
                    const statusTwo = currYearHist[1].status.toUpperCase();
                    const statusString = `${maxYearStr} 1ST INSTALLMENT IS ${statusOne}, 2ND INSTALLMENT IS ${statusTwo}`;

                    if (isAnyDelinquent) {
                        if (isPriorYearPaid) {
                            data.notes = `ALL PRIORS ARE PAID, ${maxYearStr} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        } else {
                            data.notes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        }
                    } else {
                        data.notes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    }
                } else if (currYearHist.length === 1) {
                    // Fallback note generation if the current year was rolled into a single Annual row
                    const currStatus = currYearHist[0].status.toUpperCase();
                    if (isAnyDelinquent) {
                        if (isPriorYearPaid) {
                            data.notes = `ALL PRIORS ARE PAID, ${maxYearStr} TAXES ARE ${currStatus}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        } else {
                            data.notes = `PRIORS ARE DELINQUENT, ${maxYearStr} TAXES ARE ${currStatus}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        }
                    } else {
                        data.notes = `ALL PRIORS ARE PAID, ${maxYearStr} TAXES ARE ${currStatus}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    }
                }

                return data;
            }, account, tax_auth);

            resolve(page_content);
        } catch(error) {
            console.log(error);
            reject(new Error("No Record Found / Invalid Parcel Format"));
        }
    });
}

const account_search = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, baseUrl, account, tax_auth)
                .then((data1) => resolve(data1))
                .catch((error) => {
                    console.log(error);
                    reject(new Error(error.message));
                });
        } catch(error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
}

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
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'image' || req.resourceType() === 'media' || req.resourceType() === 'font') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if(fetch_type == "html"){
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
            .finally(async() => { await context.close(); });
        }
    } catch(error) {
        console.log(error);
        if(fetch_type == "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
}

export { search }
