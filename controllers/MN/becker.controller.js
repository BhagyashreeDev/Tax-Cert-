// Author :- Vadiraj Joshi

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000
};

const ac_1 = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const cleanPropNo = account.toString().trim();
            
            // DIRECT URL APPROACH
            const targetUrl = `${url}${cleanPropNo}`;
            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

            // Evaluate Page Content
            const page_content = await page.evaluate((propNoInput) => {
                // --- Extract #GenInfo Details ---
                let parcel = propNoInput;
                let propertyAddress = "";
                let ownerName = "";

                const genRows = document.querySelectorAll('#GenInfo tr');
                genRows.forEach(row => {
                    const thTds = row.querySelectorAll('td, th');
                    if (thTds.length >= 2) {
                        const label = thTds[0].innerText.trim();
                        const val = thTds[1].innerText.trim();
                        
                        if (label.includes("Parcel Number:")) {
                            const strongTag = thTds[1].querySelector('strong');
                            parcel = strongTag ? strongTag.innerText.trim() : val.split('\n')[0];
                        }
                        if (label.includes("Property Address:")) {
                            propertyAddress = val.replace(/\n/g, ', ').trim();
                        }
                        if (label.includes("Owner Name:")) {
                            ownerName = val.replace(/&/g, ','); // Replacing & with comma
                        }
                    }
                });

                // --- Extract #ValAndTax Details ---
                let taxableValue = "";
                let taxHistoryArray = [];

                const valTaxTable = document.querySelector('#ValAndTax');
                if (valTaxTable) {
                    // Find Years from Header
                    const payableRow = Array.from(valTaxTable.querySelectorAll('tr')).find(r => r.innerText.includes('Tax Payable Year'));
                    let years = [];
                    if (payableRow) {
                        const tds = payableRow.querySelectorAll('td');
                        for (let i = 1; i < tds.length; i++) {
                            const yrMatch = tds[i].innerText.match(/\d{4}/);
                            if (yrMatch) years.push({ index: i, year: yrMatch[0] });
                        }
                    }

                    // Helper to extract row values by column index
                    const getRowValues = (labelText) => {
                        const row = Array.from(valTaxTable.querySelectorAll('tr')).find(r => r.innerText.includes(labelText));
                        let values = {};
                        if (row) {
                            const tds = row.querySelectorAll('td');
                            let dataTds = Array.from(tds).slice(1); // Skip the label column
                            years.forEach((y, idx) => {
                                if (dataTds[idx]) values[y.year] = dataTds[idx].innerText.trim();
                            });
                        }
                        return values;
                    };

                    const taxableValues = getRowValues('Taxable Market Value');
                    const totalLevied = getRowValues('Total Tax Levied');
                    const totalPayments = getRowValues('Total Payments');
                    const unpaidBalances = getRowValues('Unpaid Balance');

                    // Get Latest Taxable Market Value
                    if (years.length > 0) {
                        taxableValue = taxableValues[years[0].year] || "";
                    }

                    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
                    const today = new Date();

                    // Build History Array
                    for (let i = 0; i < years.length; i++) {
                        const y = years[i].year;
                        const leviedStr = totalLevied[y] || "$0.00";
                        const paymentsStr = totalPayments[y] || "$0.00";
                        const unpaidStr = unpaidBalances[y] || "$0.00";

                        const leviedNum = parseFloat(leviedStr.replace(/[^0-9.-]/g, '')) || 0;
                        const paidNum = Math.abs(parseFloat(paymentsStr.replace(/[^0-9.-]/g, '')) || 0); // payments are listed negatively
                        const unpaidNum = parseFloat(unpaidStr.replace(/[^0-9.-]/g, '')) || 0;

                        const isFullyPaid = (unpaidNum === 0);

                        // Skip prior years if they are fully paid 
                        if (isFullyPaid && i !== 0) {
                            break; 
                        }

                        const halfLevied = leviedNum / 2;
                        
                        let amtDue1 = 0, amtPaid1 = 0, status1 = "Due";
                        let amtDue2 = 0, amtPaid2 = 0, status2 = "Due";

                        const dueOneStr = `05/15/${y}`;
                        const delqOneStr = `05/16/${y}`;
                        const dueTwoStr = `10/15/${y}`;
                        const delqTwoStr = `10/16/${y}`;

                        // --- Payment Splitting Logic ---
                        if (unpaidNum === 0) {
                            amtPaid1 = halfLevied;
                            amtDue1 = 0;
                            status1 = "Paid";
                            
                            amtPaid2 = halfLevied;
                            amtDue2 = 0;
                            status2 = "Paid";
                        } else if (paidNum === 0) {
                            amtPaid1 = 0;
                            amtDue1 = halfLevied;
                            status1 = today > new Date(dueOneStr) ? "Delinquent" : "Due";
                            
                            amtPaid2 = 0;
                            amtDue2 = halfLevied;
                            status2 = today > new Date(dueTwoStr) ? "Delinquent" : "Due";
                        } else {
                            // Partial Payments
                            if (paidNum >= halfLevied) {
                                amtPaid1 = halfLevied;
                                amtDue1 = 0;
                                status1 = "Paid";
                                
                                amtPaid2 = paidNum - halfLevied;
                                amtDue2 = unpaidNum; // Rely on exact unpaid balance
                                status2 = today > new Date(dueTwoStr) ? "Delinquent" : "Due";
                            } else {
                                amtPaid1 = paidNum;
                                amtDue1 = halfLevied - paidNum;
                                status1 = today > new Date(dueOneStr) ? "Delinquent" : "Due";
                                
                                amtPaid2 = 0;
                                amtDue2 = halfLevied;
                                status2 = today > new Date(dueTwoStr) ? "Delinquent" : "Due";
                            }
                        }

                        // Installment 1
                        taxHistoryArray.push({
                            jurisdiction: "County",
                            year: y,
                            payment_type: "Semi-Annual",
                            status: status1,
                            base_amount: formatter.format(halfLevied),
                            amount_paid: formatter.format(amtPaid1),
                            amount_due: formatter.format(amtDue1),
                            mailing_date: "",
                            due_date: dueOneStr,
                            delq_date: delqOneStr,
                            paid_date: "N/A", 
                            good_through_date: "-"
                        });

                        // Installment 2
                        taxHistoryArray.push({
                            jurisdiction: "County",
                            year: y,
                            payment_type: "Semi-Annual",
                            status: status2,
                            base_amount: formatter.format(halfLevied),
                            amount_paid: formatter.format(amtPaid2),
                            amount_due: formatter.format(amtDue2),
                            mailing_date: "",
                            due_date: dueTwoStr,
                            delq_date: delqTwoStr,
                            paid_date: "N/A", 
                            good_through_date: "-"
                        });

                        // Terminate loop if we reach the first paid year on current pass
                        if (isFullyPaid) {
                            break; 
                        }
                    }
                }

                // =========================================================
                // --- DYNAMIC NOTES & DELINQUENCY CALCULATIONS ---
                // =========================================================
                let generatedNotes = "";
                let delinquentStatus = "NONE";

                try {
                    if (taxHistoryArray.length > 0) {
                        const isAnyDelinquent = taxHistoryArray.some(h => h.status.toUpperCase() === "DELINQUENT");
                        delinquentStatus = isAnyDelinquent ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF" : "NONE";

                        const allYears = taxHistoryArray.map(h => parseInt(h.year, 10));
                        const maxYear = Math.max(...allYears);
                        const yearVal = maxYear.toString();

                        const isPriorYearPaid = !taxHistoryArray.some(h => h.year !== yearVal && h.status.toUpperCase() === "DELINQUENT");
                        const currentYearInst = taxHistoryArray.filter(h => h.year === yearVal);

                        let dynamicDueDatesNote = "";
                        if (currentYearInst.length >= 2) {
                            const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
                            const shortDueTwo = currentYearInst[1].due_date.substring(0, 5);
                            dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} , ${shortDueTwo}`;
                        } else if (currentYearInst.length === 1) {
                            const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
                            dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
                        }

                        // Build Note String
                        if (currentYearInst.length >= 2) {
                            const statusOne = currentYearInst[0].status.toUpperCase();
                            const statusTwo = currentYearInst[1].status.toUpperCase();
                            const statusString = `${yearVal} 1ST INSTALLMENT IS ${statusOne}, 2ND INSTALLMENT IS ${statusTwo}`;

                            if (isAnyDelinquent) {
                                if (isPriorYearPaid) {
                                    generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
                                } else {
                                    generatedNotes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
                                }
                            } else {
                                generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
                            }
                        } else {
                            if (isAnyDelinquent) {
                                if (isPriorYearPaid) {
                                    generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
                                } else {
                                    generatedNotes = `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
                                }
                            } else {
                                generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
                            }
                        }
                    }
                } catch (err) {
                    generatedNotes = "Error generating notes: " + err.message;
                }

                // --- Sort Tax History (Ascending Order) ---
                taxHistoryArray.sort((a, b) => {
                    const yearA = parseInt(a.year, 10) || 0;
                    const yearB = parseInt(b.year, 10) || 0;

                    if (yearA !== yearB) {
                        return yearA - yearB;
                    }

                    const dateA = new Date(a.due_date).getTime() || 0;
                    const dateB = new Date(b.due_date).getTime() || 0;

                    return dateA - dateB;
                });

                return {
                    processed_date: "",
                    order_number: "",
                    borrower_name: "",
                    owner_name: ownerName ? [ownerName] : ["N/A"],
                    property_address: propertyAddress,
                    parcel_number: parcel,
                    land_value: "",
                    improvements: "",
                    total_assessed_value: taxableValue,
                    exemption: "",
                    total_taxable_value: taxableValue,
                    taxing_authority: "Becker County, MN",
                    notes: generatedNotes,
                    delinquent: delinquentStatus,
                    tax_history: taxHistoryArray
                };
            }, cleanPropNo);

            resolve(page_content);

        } catch (error) {
            console.error("Becker County ac_1 Internal Method Error: ", error);
            reject(new Error(error.message));
        }
    });
};

const account_search = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {   
            ac_1(page, url, account)
            .then((data) => {
                resolve(data);
            })
            .catch((error) => {
                console.error("Pipeline failure: ", error);
                reject(new Error(error.message));
            });
        } catch (error) {
            console.error(error);
            reject(new Error(error.message));
        }
    });
};

// -------------------------------------------------------------------------------------------------------------------------------------------------
// DO NOT TOUCH OR UPDATE THE CODE BELOW THIS BOX - SEARCH METHOD MANAGES CHROMIUM INSTANTIATION ENVIRONMENT AND ROUTING
// -------------------------------------------------------------------------------------------------------------------------------------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://gis-server.co.becker.mn.us/www/parcel_info.aspx?PARCEL=";

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            // FRONTEND ENDPOINT
            account_search(page, url, account)
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
                    await context.close();
                });
        }
        else if (fetch_type == "api") {
            // API ENDPOINT
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
                .finally(async () => {
                    await context.close();
                });
        }

    }
    catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if (fetch_type == "api") {
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
