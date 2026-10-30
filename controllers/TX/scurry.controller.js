// Author: M M Prateek
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 30000
};

// MULTI-COUNTY CONFIGURATION
const county_data = {
    "scurry": {
        url: "https://tax.scurrytax.us/",
        auth: "Scurry County Tax Office, TX"
    },
    "shelby": {
        url: "https://tax.shelbytaxpayment.com/",
        auth: "Shelby County Tax Office, TX"
    },
    "harrison": {
        url: "https://tax.harrisoncad.net/",
        auth: "Harrison County Tax Office, TX"
    }
};

const account_search = async (page, countyConfig, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // PAGE 1: NAVIGATE AND SEARCH
            await page.goto(countyConfig.url, { waitUntil: "domcontentloaded", timeout: 60000 });

            await page.waitForSelector('#SearchTerm', timeout_option);
            
            // Set dropdown to Property Id / Account Key
            await page.select('#SearchableProperty', 'property_id');
            
            // Type Account Number
            await page.type('#SearchTerm', account);

            // Click Search Button and wait for Results Page
            await Promise.all([
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
                page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('input[type="submit"][value="SEARCH"]'));
                    const visibleBtn = btns.find(b => b.offsetParent !== null);
                    if (visibleBtn) visibleBtn.click();
                })
            ]);

            // PAGE 2: RESULTS PAGE
            await page.waitForSelector('.react-bootstrap-table table tbody tr', timeout_option);

            const noData = await page.evaluate(() => {
                const text = document.body.innerText;
                return text.includes("No Record Found") || text.includes("Showing rows 0 to 0");
            });

            if (noData) {
                throw new Error("No Record Found / Invalid Parcel");
            }

            // Click the first result row and wait for Details Page
            await Promise.all([
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
                page.evaluate(() => {
                    const row = document.querySelector('.react-bootstrap-table table tbody tr');
                    if (row) row.click();
                })
            ]);

            // PAGE 3: DETAILS PAGE
            await page.waitForSelector('h4#table-bill-history', timeout_option);

            const page_content = await page.evaluate((params) => {
                const acc = params.acc;
                const authName = params.auth;

                // Helper to extract label values (accepts array for multiple variations)
                const labels = document.querySelectorAll('label');
                const getVal = (texts) => {
                    if (!Array.isArray(texts)) texts = [texts];
                    for (let text of texts) {
                        const lbl = Array.from(labels).find(l => l.textContent.trim().toLowerCase() === text.toLowerCase());
                        if (lbl && lbl.nextElementSibling) {
                            let val = lbl.nextElementSibling.textContent.trim();
                            if (val !== "") return val;
                        }
                    }
                    return "N/A";
                };

                const formatDollar = (val) => {
                    if (!val || val === "N/A" || val.trim() === "") return "$0.00";
                    if (val.toString().trim().startsWith("$")) return val.trim();
                    return "$" + val.trim();
                };

                const owner_name = getVal("Name");
                let pa = getVal(["Property Address", "Situs Address"]);
                const property_address = (pa && pa !== "N/A") ? pa : "N/A";
                
                const assessed_value = formatDollar(getVal("Assessed Value").replace(/[$,]/g, ''));
                
                // Requirement 1: Dynamic Taxable Value extraction (prevents % bugs)
                let taxable_value = assessed_value; 
                const taxBreakdownTable = document.querySelector('#tbYear table');
                if (taxBreakdownTable) {
                    const theadTds = Array.from(taxBreakdownTable.querySelectorAll('thead th')).map(th => th.textContent.trim().toLowerCase());
                    const tvIndex = theadTds.findIndex(h => h.includes('taxable value'));
                    
                    const firstRowTds = taxBreakdownTable.querySelectorAll('tbody tr:first-child td');
                    if (tvIndex > -1 && firstRowTds && firstRowTds.length > tvIndex) {
                        let tv = firstRowTds[tvIndex].textContent.trim();
                        // Ignore if it's a percentage (failsafe)
                        if (tv && tv !== "" && !tv.includes("%")) {
                            taxable_value = formatDollar(tv.replace(/[$,]/g, ''));
                        }
                    }
                }

                const exemption = "N/A"; 

                // Extracted Paid Date for fallback/history matching
                let extractedPaidDate = getVal("Last Payment Date");
                if (!extractedPaidDate || extractedPaidDate === "") extractedPaidDate = "N/A";

                // History Extraction
                const taxHistory = [];
                let holdsDelinquency = false;
                let hasPriorDue = false;
                let totalAmountDue = 0;
                const todayDate = new Date();

                const historySection = document.querySelector('h4#table-bill-history');
                const historyTable = historySection ? historySection.closest('section').querySelector('table') : null;
                
                if (historyTable) {
                    // Extract headers dynamically to map indexes correctly across different counties
                    const hHeaders = Array.from(historyTable.querySelectorAll('thead th'))
                        .filter(th => !th.classList.contains('d-none'))
                        .map(th => th.textContent.trim().toLowerCase());

                    const idxStatus = hHeaders.findIndex(h => h === 'status');
                    const idxYear = hHeaders.findIndex(h => h === 'tax year');
                    const idxDueD = hHeaders.findIndex(h => h.includes('due date'));
                    const idxBPaid = hHeaders.findIndex(h => h === 'base tax paid');
                    const idxBDue = hHeaders.findIndex(h => h === 'base tax due');
                    const idxPen = hHeaders.findIndex(h => h.includes('penalty'));
                    const idxFee = hHeaders.findIndex(h => h.includes('fees'));
                    const idxAmt = hHeaders.findIndex(h => h === 'amount due');

                    const rows = historyTable.querySelectorAll('tbody tr');
                    
                    rows.forEach((tr, index) => {
                        // Skip the "No Information Available" row
                        if (tr.textContent.includes("No Information Available")) return;

                        const tds = tr.querySelectorAll('td');
                        const vTds = Array.from(tds).filter(td => !td.classList.contains('d-none'));

                        if (vTds.length > 0) {
                            const rawStatus = idxStatus > -1 && vTds[idxStatus] ? vTds[idxStatus].textContent.trim() : "Paid";
                            const year = idxYear > -1 && vTds[idxYear] ? vTds[idxYear].textContent.trim() : "N/A";
                            let dueDate = idxDueD > -1 && vTds[idxDueD] ? vTds[idxDueD].textContent.trim() : "N/A";
                            
                            const basePaid = idxBPaid > -1 && vTds[idxBPaid] ? vTds[idxBPaid].textContent.trim() : "N/A";
                            const baseDue = idxBDue > -1 && vTds[idxBDue] ? vTds[idxBDue].textContent.trim() : "N/A";
                            const penalty = idxPen > -1 && vTds[idxPen] ? vTds[idxPen].textContent.trim() : "N/A";
                            const fees = idxFee > -1 && vTds[idxFee] ? vTds[idxFee].textContent.trim() : "N/A";
                            const amountDueStr = idxAmt > -1 && vTds[idxAmt] ? vTds[idxAmt].textContent.trim() : "$0.00";
                            
                            const numAmountDue = parseFloat(amountDueStr.replace(/[$,]/g, '')) || 0;

                            let status = "Paid";
                            let delqDate = "N/A";
                            let paidDate = "N/A";

                            // Due Date and Delinquent Date formatting
                            if (dueDate && dueDate !== "N/A" && dueDate !== "") {
                                const dDate = new Date(dueDate);
                                dDate.setDate(dDate.getDate() + 1);
                                delqDate = `${String(dDate.getMonth() + 1).padStart(2, '0')}/${String(dDate.getDate()).padStart(2, '0')}/${dDate.getFullYear()}`;
                            } else {
                                // Texas standard fallback
                                const yearNum = parseInt(year);
                                dueDate = !isNaN(yearNum) ? `01/31/${yearNum + 1}` : "N/A";
                                delqDate = !isNaN(yearNum) ? `02/01/${yearNum + 1}` : "N/A";
                            }

                            if (rawStatus.toUpperCase() === "UNPAID" || numAmountDue > 0) {
                                totalAmountDue += numAmountDue;
                                
                                const dDateObj = new Date(delqDate);
                                
                                if (delqDate !== "N/A" && todayDate >= dDateObj) {
                                    status = "Delinquent";
                                    holdsDelinquency = true;
                                } else {
                                    status = "Due";
                                }

                            } else {
                                status = "Paid";
                                paidDate = extractedPaidDate; 
                            }

                            let finalBaseAmt = baseDue;
                            if (baseDue === "$0.00" || baseDue === "N/A" || baseDue === "0") {
                                finalBaseAmt = basePaid !== "N/A" ? basePaid : "$0.00";
                            }

                            taxHistory.push({
                                jurisdiction: "County",
                                year: year,
                                payment_type: "Annual",
                                status: status,
                                base_amount: formatDollar(finalBaseAmt),
                                county_tax: "N/A",
                                city_tax: "N/A",
                                fees: formatDollar(fees),
                                penalty: formatDollar(penalty),
                                cost: "N/A",
                                amount_paid: formatDollar(basePaid),
                                amount_due: formatDollar(amountDueStr),
                                paid_date: paidDate,
                                due_date: dueDate,
                                delq_date: delqDate,
                                land_value: "N/A",
                                improvements: "N/A",
                                total_assessed_value: assessed_value,
                                exemptions_breakdown: {
                                    residential_exemption: "0.00",
                                    homestead_exemption: "0.00",
                                    other_exemptions: "0.00",
                                    local_option_credit: "0.00"
                                }
                            });
                        }
                    });
                }

                // Fallback if History Table was blank ("No Information Available")
                if (taxHistory.length === 0) {
                    let year = getVal(["Tax Year", "Year"]) || "2025";
                    if (year === "N/A") year = "2025";

                    let dueDate = getVal("Due Date");
                    if (dueDate === "N/A" || dueDate === "") dueDate = `01/31/${parseInt(year) + 1}`;

                    let delqDate = `02/01/${parseInt(year) + 1}`;
                    
                    let amountDueStr = getVal("Amount Due");
                    if (amountDueStr === "N/A" || amountDueStr === "") amountDueStr = "$0.00";
                    
                    let baseTaxes = getVal("Base Taxes");
                    if (baseTaxes === "N/A" || baseTaxes === "") baseTaxes = "$0.00";
                    
                    let amountPaidStr = getVal("Amount Paid");
                    if (amountPaidStr === "N/A" || amountPaidStr === "") amountPaidStr = "$0.00";

                    let numAmountDue = parseFloat(amountDueStr.replace(/[$,]/g, '')) || 0;
                    
                    let status = "Paid";
                    if (numAmountDue > 0) {
                        totalAmountDue += numAmountDue;
                        if (todayDate >= new Date(delqDate)) {
                            status = "Delinquent";
                            holdsDelinquency = true;
                        } else {
                            status = "Due";
                        }
                    }

                    taxHistory.push({
                        jurisdiction: "County",
                        year: year,
                        payment_type: "Annual",
                        status: status,
                        base_amount: formatDollar(baseTaxes !== "$0.00" ? baseTaxes : amountPaidStr),
                        county_tax: "N/A",
                        city_tax: "N/A",
                        fees: "N/A",
                        penalty: "N/A",
                        cost: "N/A",
                        amount_paid: formatDollar(amountPaidStr),
                        amount_due: formatDollar(amountDueStr),
                        paid_date: status === "Paid" ? extractedPaidDate : "N/A",
                        due_date: dueDate,
                        delq_date: delqDate,
                        land_value: "N/A",
                        improvements: "N/A",
                        total_assessed_value: assessed_value,
                        exemptions_breakdown: {}
                    });
                }

                // Filter History (Keep current year, drop Paid past years)
                const filteredHistory = [];
                for (let i = 0; i < taxHistory.length; i++) {
                    if (i === 0) {
                        filteredHistory.push(taxHistory[i]);
                    } else {
                        if (taxHistory[i].status !== "Paid") {
                            filteredHistory.push(taxHistory[i]);
                            hasPriorDue = true;
                        }
                    }
                }

                const processedDate = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

                // Format the Notes perfectly (Calculated BEFORE sorting so [0] is the most recent year)
                let notesText = "ALL PRIORS ARE PAID";
                if (filteredHistory.length > 0) {
                    const topYear = filteredHistory[0];
                    const shortDueDate = topYear.due_date !== "N/A" ? topYear.due_date.substring(0, 5) : "01/31";
                    
                    if (hasPriorDue) {
                        notesText = `PRIORS ARE DELINQUENT, ${topYear.year} TAXES ARE ${topYear.status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS ${shortDueDate}`;
                    } else {
                        notesText = `ALL PRIORS ARE PAID, ${topYear.year} TAXES ARE ${topYear.status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS ${shortDueDate}`;
                    }
                }

                const finalDelinquentStatus = holdsDelinquency ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

                const legalDesc = getVal(["Legal Description", "Description"]);
                const acres = getVal("Acres") || "N/A";

                // ASCENDING SORT LOGIC: Ensures filteredHistory is ordered from oldest to newest
                filteredHistory.sort((a, b) => parseInt(a.year) - parseInt(b.year));

                return {
                    result: {
                        processed_date: processedDate,
                        owner_name: owner_name !== "N/A" ? [owner_name] : ["N/A"],
                        property_address: property_address,
                        parcel_number: acc,
                        land_value: "$0.00",
                        improvements: "$0.00",
                        total_assessed_value: assessed_value,
                        exemption: exemption,
                        total_taxable_value: taxable_value,
                        taxing_authority: authName,
                        notes: notesText,
                        delinquent: finalDelinquentStatus,
                        total_amount_due: `$${totalAmountDue.toFixed(2)}`,
                        tax_history: filteredHistory,
                        property_details: {
                            record_type: getVal("Record Type") || "Real Estate",
                            acres: acres,
                            lots: "N/A",
                            buildings: "N/A",
                            description: legalDesc,
                            district_levy: "N/A",
                            city_levy: "N/A",
                            total_appraisal: assessed_value
                        }
                    }
                };
            }, { acc: account, auth: countyConfig.auth });

            resolve(page_content);

        } catch (error) {
            console.log(error);
            reject(new Error("No Record Found / Invalid Parcel"));
        }
    });
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    
    // Dynamically grab the county name from the URL path
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

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if(fetch_type == "html") {
            // FRONTEND ENDPOINT
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
            // API ENDPOINT
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
