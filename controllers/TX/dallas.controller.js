// Author:- MM Prateek

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000
};

const account_search = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Format account to ensure it safely fits into the URL parameters
            const formattedAccount = encodeURIComponent(account.replace(/[-.]/g, '').trim());
            
            // Bypass the search page and go directly to the details page
            const targetUrl = `${url}showdetail2.jsp?can=${formattedAccount}&ownerno=0`;

            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

            // Wait for the main table or error to load
            await page.waitForSelector('table', timeout_option);

            const page_content = await page.evaluate((acc) => {
                
                // Helper to cleanly format dollars
                const formatDollar = (val) => {
                    if (!val || val === "N/A" || val.trim() === "") return "$0.00";
                    if (val.toString().trim().startsWith("$")) return val.trim();
                    return "$" + val.trim();
                };

                const bElements = Array.from(document.querySelectorAll('b'));
                
                // Check if account is invalid or not found
                const accLabel = bElements.find(el => el.textContent.trim().includes("Account Number:"));
                if (!accLabel) {
                    return { error: "No Record Found / Invalid Parcel" };
                }

                // Helper to extract text following a <b> label in this specific archaic HTML structure
                const getValue = (label) => {
                    const b = bElements.find(el => el.textContent.trim().includes(label));
                    if (!b) return "N/A";
                    let val = "";
                    let curr = b.nextSibling;
                    // Read siblings until we hit the next Bold tag, Anchor tag, or Line break rule
                    while(curr && curr.nodeName !== 'B' && curr.nodeName !== 'A' && curr.nodeName !== 'HR') {
                        if(curr.nodeType === 3) val += " " + curr.textContent.trim();
                        curr = curr.nextSibling;
                    }
                    return val.replace(/\s+/g, ' ').trim() || "N/A";
                };

                // Helper specifically for multi-line address blocks
                const getAddressLines = (label) => {
                    const b = bElements.find(el => el.textContent.trim().includes(label));
                    if (!b) return [];
                    let lines = [];
                    let curr = b.nextSibling;
                    while(curr && curr.nodeName !== 'B' && curr.nodeName !== 'A' && curr.nodeName !== 'HR') {
                        if(curr.nodeType === 3 && curr.textContent.trim()) {
                            lines.push(curr.textContent.replace(/[\n\r]/g, '').trim());
                        }
                        curr = curr.nextSibling;
                    }
                    return lines;
                };

                // Extract Owner Details
                const addressLines = getAddressLines("Address:");
                const owner_name = addressLines.length > 0 ? addressLines[0] : "N/A";
                
                // Extract Values
                const land_value = formatDollar(getValue("Land Value:"));
                const improvements = formatDollar(getValue("Improvement Value:"));
                const market_value = formatDollar(getValue("Market Value:"));
                const capped_value = formatDollar(getValue("Capped Value:"));
                const exemption = getValue("Exemptions:");
                const prop_address = getValue("Property Site Address:");

                // STRICT RULE: Only extract Assessed/Taxable if explicitly stated on the page
                let assessed_val_raw = getValue("Assessed Value:");
                if (assessed_val_raw === "N/A") assessed_val_raw = getValue("Total Assessed Value:");
                const final_assessed_value = assessed_val_raw !== "N/A" ? formatDollar(assessed_val_raw) : "N/A";

                let taxable_val_raw = getValue("Taxable Value:");
                if (taxable_val_raw === "N/A") taxable_val_raw = getValue("Total Taxable Value:");
                const final_taxable_value = taxable_val_raw !== "N/A" ? formatDollar(taxable_val_raw) : "N/A";

                // Extract Dues & Levies
                const currentLevy = formatDollar(getValue("Current Tax Levy:"));
                const currentDueStr = formatDollar(getValue("Current Amount Due:"));
                const priorDueStr = formatDollar(getValue("Prior Year Amount Due:"));
                const totalDueStr = formatDollar(getValue("Total Amount Due:"));

                const numCurrentDue = parseFloat(currentDueStr.replace(/[$,]/g, '')) || 0;
                const numPriorDue = parseFloat(priorDueStr.replace(/[$,]/g, '')) || 0;
                const numTotalDue = parseFloat(totalDueStr.replace(/[$,]/g, '')) || 0;

                // Date & Delinquency Logic
                const todayDate = new Date();
                const processedDate = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
                
                const taxYear = "2025";
                const dueDate = `01/31/${parseInt(taxYear) + 1}`;
                const delqDate = `02/01/${parseInt(taxYear) + 1}`;

                let status = "Paid";
                let holdsDelinquency = false;

                if (numCurrentDue > 0) {
                    if (todayDate >= new Date(delqDate)) {
                        status = "Delinquent";
                        holdsDelinquency = true;
                    } else {
                        status = "Due";
                    }
                }

                if (numPriorDue > 0) {
                    holdsDelinquency = true;
                }

                const finalDelinquentStatus = holdsDelinquency ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

                // Generate Notes
                let notesText = "ALL PRIORS ARE PAID";
                if (numPriorDue > 0) {
                    notesText = `PRIORS ARE DELINQUENT, ${taxYear} TAXES ARE ${status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS 01/31`;
                } else {
                    notesText = `ALL PRIORS ARE PAID, ${taxYear} TAXES ARE ${status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS 01/31`;
                }

                // Dallas only provides the current year summary on this page, so we build the history block manually
                const taxHistory = [{
                    jurisdiction: "County",
                    year: taxYear,
                    payment_type: "Annual",
                    status: status,
                    base_amount: currentLevy !== "$0.00" ? currentLevy : currentDueStr,
                    county_tax: "N/A",
                    city_tax: "N/A",
                    fees: "N/A",
                    penalty: "N/A",
                    cost: "N/A",
                    amount_paid: status === "Paid" ? currentLevy : "$0.00",
                    amount_due: currentDueStr,
                    paid_date: "N/A",
                    due_date: dueDate,
                    delq_date: delqDate,
                    land_value: land_value,
                    improvements: improvements,
                    total_assessed_value: final_assessed_value,
                    exemptions_breakdown: {}
                }];

                // SORTING LOGIC: This ensures the array is always sorted in Ascending order (e.g. 2024, 2025, 2026)
                taxHistory.sort((a, b) => parseInt(a.year) - parseInt(b.year));

                return {
                    result: {
                        processed_date: processedDate,
                        owner_name: owner_name !== "N/A" ? [owner_name] : ["N/A"],
                        property_address: prop_address !== "N/A" ? prop_address : "N/A",
                        parcel_number: acc,
                        land_value: land_value,
                        improvements: improvements,
                        total_assessed_value: final_assessed_value,
                        exemption: exemption,
                        total_taxable_value: final_taxable_value,
                        taxing_authority: "Dallas County Tax Office, TX",
                        notes: notesText,
                        delinquent: finalDelinquentStatus,
                        total_amount_due: formatDollar(numTotalDue.toString()),
                        tax_history: taxHistory,
                        property_details: {
                            record_type: "Real Estate",
                            acres: "N/A",
                            lots: "N/A",
                            buildings: "N/A",
                            description: getValue("Legal Description:"),
                            district_levy: "N/A",
                            city_levy: "N/A",
                            total_appraisal: market_value
                        }
                    }
                };
            }, account);

            if (page_content.error) {
                reject(new Error(page_content.error));
            } else {
                resolve(page_content);
            }

        } catch (error) {
            console.log(error);
            reject(new Error("No Record Found / Invalid Parcel"));
        }
    });
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        
        if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://www.dallasact.com/act_webdev/dallas/";

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

        if(fetch_type == "html") {
            // FRONTEND ENDPOINT
            account_search(page, url, account)
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
            account_search(page, url, account)
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
