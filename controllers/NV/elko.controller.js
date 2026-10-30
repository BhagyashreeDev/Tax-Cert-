// Author: M M Prateek

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 60000
};

// MULTI-COUNTY CONFIGURATION FOR GSA CORP PLATFORM (NEVADA)
const county_data = {
    "elko": {
        baseUrl: "https://elko-search.gsacorp.io",
        auth: "Elko County Treasurer, NV"
    },
    "humboldt": {
        baseUrl: "https://humboldt-search.gsacorp.io",
        auth: "Humboldt County Treasurer, NV"
    },
    "lincoln": {
        baseUrl: "https://tax.lincolncountynv.gov",
        auth: "Lincoln County Treasurer, NV"
    }
};

const account_search = async (page, countyConfig, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // 1. DEEP LINKING
            // Strip out hyphens (-) but keep numbers and alphabets for the URL
            const cleanAccount = account.trim().replace(/-/g, '');
            const formattedAccount = encodeURIComponent(cleanAccount);
            const dataUrl = `${countyConfig.baseUrl}/tax/${formattedAccount}`;

            await page.goto(dataUrl, { waitUntil: "domcontentloaded", ...timeout_option });

            // Gracefully check if the property loaded by looking for the summary section
            try {
                await page.waitForSelector('.summary', { timeout: 10000 });
            } catch (e) {
                throw new Error("No Record Found / Invalid Parcel");
            }

            // 2. EXTRACT DATA (Passing the original 'account' to preserve format in JSON)
            const extractedData = await page.evaluate((acc, authName) => {
                
                // Helper to decode HTML entities like &amp; to &
                const decodeHtml = (html) => {
                    const txt = document.createElement("textarea");
                    txt.innerHTML = html;
                    return txt.value;
                };

                const formatDollar = (val, returnZero = false) => {
                    if (!val || val === "N/A" || val.trim() === "" || val.toLowerCase() === "not applicable") {
                        return returnZero ? "$0.00" : "N/A";
                    }
                    if (val.toString().trim().startsWith("$")) return val.trim();
                    return "$" + val.trim();
                };

                const parseD = (val) => parseFloat((val || "0").replace(/[$,]/g, '')) || 0;

                const todayDate = new Date();
                todayDate.setHours(0, 0, 0, 0);
                const processedDate = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

                // --- EXTRACT GENERAL INFO ---
                let owner_name = "N/A";
                let property_address = "N/A";
                let current_year_text = "N/A";

                // Owner Name
                const ownerEl = document.querySelector('.owners-box p');
                if (ownerEl) {
                    let rawName = ownerEl.innerHTML.split('<br>')[0].replace(/<[^>]*>?/gm, '').trim();
                    owner_name = decodeHtml(rawName);
                }

                // Property Address
                const summaryRows = document.querySelectorAll('.summary table.grid tr');
                summaryRows.forEach(tr => {
                    const th = tr.querySelector('th');
                    const td = tr.querySelector('td');
                    if (th && td) {
                        if (th.innerText.trim().toLowerCase() === "location") {
                            let rawLoc = td.innerHTML.split('<br>')[0].replace(/<[^>]*>?/gm, '').trim();
                            property_address = decodeHtml(rawLoc);
                        }
                    }
                });

                if (!property_address || property_address === "") property_address = "N/A";

                // Current Year Description
                const currYearRow = document.querySelector('.tax-current_yr table.grid tr td.left');
                if (currYearRow) {
                    const desc = currYearRow.innerText.trim();
                    const yearMatch = desc.match(/\d{4}/);
                    if (yearMatch) current_year_text = yearMatch[0];
                }

                const taxHistory = [];
                let totalAmountDue = 0;
                let holdsDelinquency = false;

                // --- EXTRACT CURRENT YEAR INSTALLMENTS (QUARTERLY) ---
                const installmentRows = document.querySelectorAll('.installments table.grid2 tbody tr');
                const instCount = installmentRows.length;
                let pType = instCount === 4 ? "Quarterly" : (instCount >= 2 ? "Semi-Annual" : "Annual");

                let lastDueDateStr = "N/A";
                let lastDelqDateStr = "N/A";

                installmentRows.forEach(tr => {
                    const tds = tr.querySelectorAll('td');
                    if (tds.length >= 10) {
                        const dueDateStr = tds[1].innerText.trim();
                        const penaltyDateStr = tds[2].innerText.trim(); // Mapped directly from Penalty Date column
                        const rawStatus = tds[3].innerText.trim().toLowerCase();
                        const baseTaxStr = tds[4].innerText.trim();
                        const penaltyStr = tds[5].innerText.trim();
                        const interestStr = tds[6].innerText.trim();
                        const paidTaxStr = tds[8].innerText.trim();
                        const dueTaxStr = tds[9].innerText.trim();

                        // Keep track of the final installment dates to apply to past years
                        lastDueDateStr = dueDateStr !== "" ? dueDateStr : "N/A";
                        lastDelqDateStr = penaltyDateStr !== "" ? penaltyDateStr : "N/A";

                        const numDue = parseD(dueTaxStr);
                        const numPenalty = parseD(penaltyStr);
                        const numInterest = parseD(interestStr);
                        const totalFees = numPenalty + numInterest;

                        let status = "Paid";
                        
                        // FIX: Only mark as Due/Delinquent if there is an actual amount owed or explicitly "past due"
                        if (rawStatus.includes("past due")) {
                            status = "Delinquent";
                            holdsDelinquency = true;
                        } else if (numDue > 0) {
                            status = "Due";
                            // Check if past due date by comparing against the Penalty Date
                            if (penaltyDateStr && penaltyDateStr !== "N/A") {
                                const pDateObj = new Date(penaltyDateStr);
                                if (todayDate >= pDateObj) {
                                    status = "Delinquent";
                                    holdsDelinquency = true;
                                }
                            }
                        }

                        if (numDue > 0) {
                            totalAmountDue += numDue;
                        }

                        taxHistory.push({
                            jurisdiction: "County",
                            year: current_year_text,
                            payment_type: pType,
                            status: status,
                            base_amount: formatDollar(baseTaxStr),
                            county_tax: "N/A",
                            city_tax: "N/A",
                            fees: formatDollar(totalFees.toString()),
                            penalty: "N/A",
                            cost: "N/A",
                            amount_paid: formatDollar(paidTaxStr),
                            amount_due: formatDollar(dueTaxStr),
                            paid_date: "N/A",
                            due_date: dueDateStr !== "" ? dueDateStr : "N/A",
                            delq_date: penaltyDateStr !== "" ? penaltyDateStr : "N/A",
                            land_value: "N/A",
                            improvements: "N/A",
                            total_assessed_value: "N/A",
                            exemptions_breakdown: {
                                residential_exemption: "0.00",
                                homestead_exemption: "0.00",
                                other_exemptions: "0.00",
                                local_option_credit: "0.00"
                            }
                        });
                    }
                });

                // --- EXTRACT PAST YEARS (ONLY IF CURRENT YEAR HAS DUE) ---
                const currentYearHasDue = taxHistory.some(t => t.status !== "Paid");

                if (currentYearHasDue) {
                    const pastYearRows = document.querySelectorAll('.tax-pastdue table.grid2 tbody tr');
                    pastYearRows.forEach(tr => {
                        const tds = tr.querySelectorAll('td');
                        if (tds.length >= 7) {
                            const desc = tds[0].innerText.trim();
                            const baseStr = tds[1].innerText.trim();
                            const penStr = tds[2].innerText.trim();
                            const intStr = tds[3].innerText.trim();
                            const paidStr = tds[4].innerText.trim();
                            const dueStr = tds[6].innerText.trim();

                            const numDue = parseD(dueStr);
                            if (numDue > 0) {
                                holdsDelinquency = true;
                                totalAmountDue += numDue;
                                
                                let pastYear = "PRIOR";
                                const yrMatch = desc.match(/\d{4}/);
                                if (yrMatch) pastYear = yrMatch[0];

                                const totalFees = parseD(penStr) + parseD(intStr);

                                // Dynamic Historical Date Calculation based on Current Year's Last Installment
                                let pastDueDate = "N/A";
                                let pastDelqDate = "N/A";

                                if (pastYear !== "PRIOR") {
                                    if (lastDueDateStr !== "N/A" && lastDueDateStr.includes('/')) {
                                        let parts = lastDueDateStr.split('/');
                                        if (parts.length === 3) pastDueDate = `${parts[0]}/${parts[1]}/${parseInt(pastYear) + 1}`;
                                    }
                                    if (lastDelqDateStr !== "N/A" && lastDelqDateStr.includes('/')) {
                                        let parts = lastDelqDateStr.split('/');
                                        if (parts.length === 3) pastDelqDate = `${parts[0]}/${parts[1]}/${parseInt(pastYear) + 1}`;
                                    }
                                }

                                taxHistory.push({
                                    jurisdiction: "County",
                                    year: pastYear,
                                    payment_type: "Annual",
                                    status: "Delinquent",
                                    base_amount: formatDollar(baseStr),
                                    county_tax: "N/A",
                                    city_tax: "N/A",
                                    fees: formatDollar(totalFees.toString()),
                                    penalty: "N/A",
                                    cost: "N/A",
                                    amount_paid: formatDollar(paidStr),
                                    amount_due: formatDollar(dueStr),
                                    paid_date: "N/A",
                                    due_date: pastDueDate,
                                    delq_date: pastDelqDate,
                                    land_value: "N/A",
                                    improvements: "N/A",
                                    total_assessed_value: "N/A",
                                    exemptions_breakdown: {
                                        residential_exemption: "0.00",
                                        homestead_exemption: "0.00",
                                        other_exemptions: "0.00",
                                        local_option_credit: "0.00"
                                    }
                                });
                            }
                        }
                    });
                }

                // --- DYNAMIC NOTES LOGIC (Supports Quarterly 4-Installments) ---
                let generatedNotes = "";
                let delinquentStatus = "NONE";

                try {
                    if (taxHistory.length > 0) {
                        const isAnyDelinquent = taxHistory.some(h => h.status.toUpperCase() === "DELINQUENT");
                        delinquentStatus = isAnyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

                        const allYears = taxHistory.map(h => parseInt(h.year, 10)).filter(y => !isNaN(y));
                        const maxYear = allYears.length > 0 ? Math.max(...allYears) : current_year_text;
                        const yearVal = maxYear.toString();

                        const isPriorYearPaid = !taxHistory.some(h => h.year !== yearVal && h.status.toUpperCase() === "DELINQUENT");
                        const currentYearInst = taxHistory.filter(h => h.year === yearVal);

                        let dynamicDueDatesNote = "";
                        let currStatusStr = "";
                        let pTypeStr = "ANNUALLY";

                        if (currentYearInst.length === 4) {
                            pTypeStr = "QUARTERLY";
                            const d1 = currentYearInst[0].due_date.substring(0, 5);
                            const d2 = currentYearInst[1].due_date.substring(0, 5);
                            const d3 = currentYearInst[2].due_date.substring(0, 5);
                            const d4 = currentYearInst[3].due_date.substring(0, 5);
                            dynamicDueDatesNote = `NORMAL DUE DATES ARE ${d1}, ${d2}, ${d3}, AND ${d4}`;
                            
                            currStatusStr = `${yearVal} 1ST INSTALLMENT IS ${currentYearInst[0].status.toUpperCase()}, 2ND INSTALLMENT IS ${currentYearInst[1].status.toUpperCase()}, 3RD INSTALLMENT IS ${currentYearInst[2].status.toUpperCase()}, 4TH INSTALLMENT IS ${currentYearInst[3].status.toUpperCase()}`;
                        } 
                        else if (currentYearInst.length >= 2) {
                            pTypeStr = "SEMI-ANNUALLY";
                            const d1 = currentYearInst[0].due_date.substring(0, 5);
                            const d2 = currentYearInst[1].due_date.substring(0, 5);
                            dynamicDueDatesNote = `NORMAL DUE DATES ARE ${d1} AND ${d2}`;
                            
                            currStatusStr = `${yearVal} 1ST INSTALLMENT IS ${currentYearInst[0].status.toUpperCase()}, 2ND INSTALLMENT IS ${currentYearInst[1].status.toUpperCase()}`;
                        } 
                        else if (currentYearInst.length === 1) {
                            pTypeStr = "ANNUALLY";
                            const d1 = currentYearInst[0].due_date !== "N/A" ? currentYearInst[0].due_date.substring(0, 5) : "N/A";
                            dynamicDueDatesNote = `NORMAL DUE DATE IS ${d1}`;
                            currStatusStr = `${yearVal} TAXES ARE ${currentYearInst[0].status.toUpperCase()}`;
                        }

                        const priorStatusStr = isPriorYearPaid ? "ALL PRIORS ARE PAID" : "PRIORS ARE DELINQUENT";
                        generatedNotes = `${priorStatusStr}, ${currStatusStr}, NORMALLY TAXES ARE PAID ${pTypeStr}, ${dynamicDueDatesNote}`;
                    }
                } catch (err) {
                    generatedNotes = "Error generating notes: " + err.message;
                }

                taxHistory.sort((a, b) => parseInt(a.year) - parseInt(b.year));

                return {
                    result: {
                        processed_date: processedDate,
                        owner_name: owner_name !== "N/A" ? [owner_name] : ["N/A"],
                        property_address: property_address,
                        parcel_number: acc,
                        land_value: "N/A",
                        improvements: "N/A",
                        total_assessed_value: "N/A",
                        exemption: "N/A",
                        total_taxable_value: "N/A",
                        taxing_authority: authName,
                        notes: generatedNotes,
                        delinquent: delinquentStatus,
                        total_amount_due: `$${totalAmountDue.toFixed(2)}`,
                        tax_history: taxHistory,
                        property_details: {
                            record_type: "Real Estate",
                            acres: "N/A",
                            lots: "N/A",
                            buildings: "N/A",
                            description: "N/A",
                            district_levy: "N/A",
                            city_levy: "N/A",
                            total_appraisal: "N/A"
                        }
                    }
                };
            }, account, countyConfig.auth);

            resolve(extractedData);

        } catch (error) {
            console.log(error);
            reject(new Error("No Record Found / Invalid Parcel"));
        }
    });
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    
    const county = req.path.replace('/', '').toLowerCase(); 

    try {
        if (!county_data[county]) {
            return res.status(404).json({ error: true, message: `County endpoint '${county}' not found in configuration.` });
        }

        if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const config = county_data[county];

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if(fetch_type == "html") {
            account_search(page, config, account)
            .then((data) => {
                res.status(200).render("parcel_data_official", data.result);
            })
            .catch((error) => {
                console.log(error);
                res.status(200).render('error_data', {
                    error: true,
                    message: error.message
                });
            })
            .finally(async () => {
                await context.close();
            });
        }
        else if(fetch_type == "api"){
            account_search(page, config, account)
            .then((data) => {
                res.status(200).json(data);
            })
            .catch((error) => {
                console.log(error);
                res.status(500).json({
                    error: true,
                    message: error.message
                });
            })
            .finally(async() => {
                await context.close();
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

export {
    search
}
