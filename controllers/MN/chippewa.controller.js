// Author: M M Prateek

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000
};

const get_half_amount = (amount) => {
    let num = amount.replace(/[$,]/g, "");
    let half = (num / 2).toFixed(2);
    return "$" + half;
};

// 1. Extract General Data
const ac_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Deep Link directly to the General tab
            const general_url = `https://tax.chippewa.mn/report.php?cmd=init&thevalue=&featureid=${account}&report=general`;
            await page.goto(general_url, { waitUntil: "domcontentloaded", ...timeout_option });

            const hasTable = await page.$('.resultsrow1, .resultsrow2');
            if (!hasTable) {
                return reject(new Error("No Record Found / Invalid Parcel"));
            }

            const data = await page.evaluate((account) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const processed_date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                const result = {
                    processed_date: processed_date,
                    order_number: "N/A",
                    borrower_name: "N/A",
                    owner_name: [],
                    property_address: "N/A",
                    parcel_number: account,
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemption: "N/A",
                    total_taxable_value: "N/A",
                    taxing_authority: "Chippewa County Auditor-Treasurer",
                    notes: "",
                    delinquent: "NONE",
                    tax_history: [],
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
                };

                const rows = document.querySelectorAll("tr.resultsrow1, tr.resultsrow2");
                rows.forEach(row => {
                    const tds = row.querySelectorAll("td");
                    if (tds.length >= 2) {
                        const label = tds[0].textContent.trim();
                        const value = tds[1].textContent.trim();

                        if (label.includes("Taxpayer Information")) {
                            if (value) result.owner_name.push(value);
                        } else if (label.includes("Property Address")) {
                            if (value) result.property_address = value;
                        } else if (label.includes("UTA #/NAME")) {
                            if (value) result.taxing_authority = value + ", Chippewa County, MN";
                        } else if (label.includes("Acres")) {
                            if (value) result.property_details.acres = value;
                        } else if (label.includes("Description")) {
                            if (value) result.property_details.description = value.replace(/\s+/g, ' ').trim();
                        }
                    }
                });

                if (result.owner_name.length === 0) result.owner_name.push("N/A");
                if (!result.property_address || result.property_address === "") result.property_address = "N/A";

                return result;
            }, account);

            resolve(data);
        } catch (error) {
            console.log(error);
            reject(new Error("No Record Found / Invalid Parcel"));
        }
    });
};

// 2. Extract Tax Data
const ac_2 = async (page, base_data, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Deep Link directly to the Tax tab
            const tax_url = `https://tax.chippewa.mn/report.php?cmd=init&thevalue=&featureid=${account}&report=tax`;
            await page.goto(tax_url, { waitUntil: "domcontentloaded", ...timeout_option });

            const tax_info = await page.evaluate(() => {
                let res = {
                    year: "N/A",
                    market_value: "N/A",
                    land_value: "N/A",
                    building_value: "N/A",
                    taxable_value: "N/A",
                    total_tax: "0.00",
                    payments: "0.00",
                    balance: "0.00",
                    penalty: "0.00",
                    total_due: "0.00",
                    delinquent_tax: "0.00"
                };

                const rows = document.querySelectorAll("tr.resultsrow1, tr.resultsrow2");
                rows.forEach(row => {
                    const tds = row.querySelectorAll("td");
                    if (tds.length >= 2) {
                        const label = tds[0].textContent.trim();
                        const value = tds[1].textContent.trim();

                        if (label.includes("Payable Year")) res.year = value;
                        else if (label.includes("Total Estimated Market Value")) res.market_value = value;
                        else if (label.includes("Taxable Land Value")) res.land_value = value;
                        else if (label.includes("Taxable Building Value")) res.building_value = value;
                        else if (label.includes("Total Taxable Value")) res.taxable_value = value;
                        else if (label.includes("Tax & Special Assessments")) res.total_tax = value;
                        else if (label.includes("Less Payments")) res.payments = value;
                        else if (label.includes("Balance Tax")) res.balance = value;
                        else if (label.includes("Penalty Due")) res.penalty = value;
                        else if (label.includes("Total Amount Due")) res.total_due = value;
                        else if (label.includes("Delinquent")) res.delinquent_tax = value;
                    }
                });
                return res;
            });

            // Map values to base data
            base_data.land_value = tax_info.land_value;
            base_data.improvements = tax_info.building_value;
            base_data.total_assessed_value = tax_info.market_value;
            base_data.total_taxable_value = tax_info.taxable_value;
            base_data.property_details.total_appraisal = tax_info.market_value;

            const parseD = (str) => parseFloat((str || "0").replace(/[$,]/g, '')) || 0;
            const formatD = (num) => "$" + num.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');

            const cy_total = parseD(tax_info.total_tax);
            const cy_paid = parseD(tax_info.payments);
            const cy_due = parseD(tax_info.balance);
            const cy_penalty = parseD(tax_info.penalty) > 0 ? tax_info.penalty : "N/A";
            const cy_year = tax_info.year;

            let holdsDelinquency = false;
            let totalDueAcc = cy_due;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const getNextDay = (dateString) => {
                const parts = dateString.split('/');
                let year = parseInt(parts[2]);
                if (year < 100) year += 2000; 
                const d = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
                d.setDate(d.getDate() + 1);
                return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
            };

            // 1. PROCESS RECENT / CURRENT YEAR (Always Print)
            if (cy_year !== "N/A" && cy_total > 0) {
                // Chippewa logic: Taxes > $100 are split Semi-Annual
                if (cy_total > 100) {
                    let half = cy_total / 2;
                    
                    // Row 1 (First Half)
                    let paid1 = Math.min(cy_paid, half);
                    let due1 = half - paid1;
                    let stat1 = due1 <= 0 ? "Paid" : "Due";
                    let date1 = `05/15/${cy_year}`;
                    
                    let delq1 = getNextDay(date1);
                    if (stat1 === "Due" && today >= new Date(delq1)) {
                        stat1 = "Delinquent";
                        holdsDelinquency = true;
                    }

                    base_data.tax_history.push({
                        jurisdiction: "County",
                        year: cy_year,
                        payment_type: "Semi-Annual",
                        status: stat1,
                        base_amount: formatD(half),
                        county_tax: "N/A",
                        city_tax: "N/A",
                        fees: "$0.00",
                        penalty: cy_penalty,
                        cost: "N/A",
                        amount_paid: formatD(paid1),
                        amount_due: formatD(due1),
                        paid_date: "N/A",
                        due_date: date1,
                        delq_date: delq1,
                        land_value: "N/A",
                        improvements: "N/A",
                        total_assessed_value: "N/A",
                        exemptions_breakdown: { residential_exemption: "0.00", homestead_exemption: "0.00", other_exemptions: "0.00", local_option_credit: "0.00" }
                    });

                    // Row 2 (Second Half)
                    let paid2 = Math.max(0, cy_paid - half);
                    let due2 = half - paid2;
                    let stat2 = due2 <= 0 ? "Paid" : "Due";
                    let date2 = `10/15/${cy_year}`; 
                    
                    let delq2 = getNextDay(date2);
                    if (stat2 === "Due" && today >= new Date(delq2)) {
                        stat2 = "Delinquent";
                        holdsDelinquency = true;
                    }

                    base_data.tax_history.push({
                        jurisdiction: "County",
                        year: cy_year,
                        payment_type: "Semi-Annual",
                        status: stat2,
                        base_amount: formatD(half),
                        county_tax: "N/A",
                        city_tax: "N/A",
                        fees: "$0.00",
                        penalty: "N/A",
                        cost: "N/A",
                        amount_paid: formatD(paid2),
                        amount_due: formatD(due2),
                        paid_date: "N/A",
                        due_date: date2,
                        delq_date: delq2,
                        land_value: "N/A",
                        improvements: "N/A",
                        total_assessed_value: "N/A",
                        exemptions_breakdown: { residential_exemption: "0.00", homestead_exemption: "0.00", other_exemptions: "0.00", local_option_credit: "0.00" }
                    });

                } else {
                    // Annual
                    let stat = cy_due <= 0 ? "Paid" : "Due";
                    let date = `05/15/${cy_year}`;
                    let delq = getNextDay(date);

                    if (stat === "Due" && today >= new Date(delq)) {
                        stat = "Delinquent";
                        holdsDelinquency = true;
                    }

                    base_data.tax_history.push({
                        jurisdiction: "County",
                        year: cy_year,
                        payment_type: "Annual",
                        status: stat,
                        base_amount: tax_info.total_tax,
                        county_tax: "N/A",
                        city_tax: "N/A",
                        fees: "$0.00",
                        penalty: cy_penalty,
                        cost: "N/A",
                        amount_paid: tax_info.payments,
                        amount_due: tax_info.balance,
                        paid_date: "N/A",
                        due_date: date,
                        delq_date: delq,
                        land_value: "N/A",
                        improvements: "N/A",
                        total_assessed_value: "N/A",
                        exemptions_breakdown: { residential_exemption: "0.00", homestead_exemption: "0.00", other_exemptions: "0.00", local_option_credit: "0.00" }
                    });
                }
            }

            // 2. PROCESS PAST YEARS (Only if Delinquent)
            // If the account has past due taxes, Chippewa summarizes it in the "Delinquent" row
            const delq_amt = parseD(tax_info.delinquent_tax);
            if (delq_amt > 0) {
                holdsDelinquency = true;
                totalDueAcc += delq_amt;
                base_data.tax_history.push({
                    jurisdiction: "County",
                    year: "PRIOR",
                    payment_type: "Annual",
                    status: "Delinquent",
                    base_amount: "N/A",
                    county_tax: "N/A",
                    city_tax: "N/A",
                    fees: "$0.00",
                    penalty: "N/A",
                    cost: "N/A",
                    amount_paid: "$0.00",
                    amount_due: tax_info.delinquent_tax,
                    paid_date: "N/A",
                    due_date: "N/A",
                    delq_date: "N/A",
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemptions_breakdown: { residential_exemption: "0.00", homestead_exemption: "0.00", other_exemptions: "0.00", local_option_credit: "0.00" }
                });
            }

            // 3. APPLY DYNAMIC NOTES LOGIC
            let generatedNotes = "";
            let delinquentStatus = "NONE";

            try {
                let taxHistoryArray = base_data.tax_history;
                if (taxHistoryArray.length > 0) {
                    const isAnyDelinquent = taxHistoryArray.some(h => h.status.toUpperCase() === "DELINQUENT");
                    delinquentStatus = isAnyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

                    // Safely calculate the max year by filtering out the "PRIOR" fallback row
                    const validYears = taxHistoryArray.filter(h => h.year !== "PRIOR").map(h => parseInt(h.year, 10));
                    const maxYear = validYears.length > 0 ? Math.max(...validYears) : cy_year;
                    const yearVal = maxYear.toString();

                    const isPriorYearPaid = !taxHistoryArray.some(h => h.year !== yearVal && h.status.toUpperCase() === "DELINQUENT");
                    const currentYearInst = taxHistoryArray.filter(h => h.year === yearVal);

                    let dynamicDueDatesNote = "";
                    if (currentYearInst.length >= 2) {
                        const shortDueOne = currentYearInst[0].due_date !== "N/A" ? currentYearInst[0].due_date.substring(0, 5) : "05/15";
                        const shortDueTwo = currentYearInst[1].due_date !== "N/A" ? currentYearInst[1].due_date.substring(0, 5) : "10/15";
                        dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} AND ${shortDueTwo}`;
                    } else if (currentYearInst.length === 1) {
                        const shortDueOne = currentYearInst[0].due_date !== "N/A" ? currentYearInst[0].due_date.substring(0, 5) : "05/15";
                        dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
                    }

                    // Build Note String
                    if (currentYearInst.length >= 2) {
                        const statusOne = currentYearInst[0].status.toUpperCase();
                        const statusTwo = currentYearInst[1].status.toUpperCase();
                        const statusString = `${yearVal} 1ST INSTALLMENT IS ${statusOne}, 2ND INSTALLMENT IS ${statusTwo}`;

                        if (isAnyDelinquent) {
                            if (isPriorYearPaid) {
                                generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
                            } else {
                                generatedNotes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
                            }
                        } else {
                            generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
                        }
                    } else {
                        if (isAnyDelinquent) {
                            if (isPriorYearPaid) {
                                generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY, ${dynamicDueDatesNote}`;
                            } else {
                                generatedNotes = `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY, ${dynamicDueDatesNote}`;
                            }
                        } else {
                            generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, ${dynamicDueDatesNote}`;
                        }
                    }
                }
            } catch (err) {
                generatedNotes = "ALL PRIORS ARE PAID";
                console.log("Error generating notes: " + err.message);
            }

            base_data.notes = generatedNotes;
            base_data.delinquent = delinquentStatus;
            base_data.total_amount_due = formatD(totalDueAcc);

            // ASCENDING SORT LOGIC
            base_data.tax_history.sort((a, b) => {
                if (a.year === "PRIOR") return -1;
                if (b.year === "PRIOR") return 1;
                return parseInt(a.year) - parseInt(b.year);
            });

            resolve(base_data);

        } catch (error) {
            console.log(error);
            reject(new Error("Failed to extract Tax data"));
        }
    });
};

const account_search = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Reformat account number removing spaces if any
            const clean_account = account.trim().replace(/\s/g, '');

            // Sequential Deep Link Execution (Super Fast)
            let data = await ac_1(page, clean_account);
            data = await ac_2(page, data, clean_account);

            resolve(data); 
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://tax.chippewa.mn/"; // Base URL 

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES for speed
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            // FRONTEND ENDPOINT (Requires flat data object)
            account_search(page, url, account)
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
                await context.close();
            });
        }
        else if (fetch_type === "api") {
            // API ENDPOINT (Requires { result: data } wrapper)
            account_search(page, url, account)
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
            .finally(async() => {
                await context.close();
            });
        }

    } catch (error) {
        console.log(error);
        if (fetch_type === "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if (fetch_type === "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
};

export {
    search
};
