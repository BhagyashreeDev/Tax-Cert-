// Author: M M Prateek

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 30000
};

// COUNTY CONFIGURATION
const county_data = {
    "palo-pinto": {
        baseUrl: "https://azurefrontdoor-gwbqhvc2fyhaghgf.z01.azurefd.net",
        dbkey: "PALOPINTOTAX",
        auth: "Palo Pinto County Tax Office, TX"
    }
};

const account_search = async (page, countyConfig, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Format the account 
            const formattedAccount = encodeURIComponent(account.trim());
            
            // 1. DIRECT URL CONSTRUCTION (DEEP LINKING)
            // Bypassing the search page, inputs, clicks, and timestamps entirely.
            const propertyUrl = `${countyConfig.baseUrl}/webProperty.aspx?dbkey=${countyConfig.dbkey}&stype=id&sdata=${formattedAccount}&id=${formattedAccount}`;
            const taxUrl = `${countyConfig.baseUrl}/webPropertyTaxes.aspx?dbkey=${countyConfig.dbkey}&stype=id&sdata=${formattedAccount}&id=${formattedAccount}`;

            // 2. NAVIGATE DIRECTLY TO PROPERTY DETAILS PAGE
            await page.goto(propertyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

            // Handle invalid property IDs gracefully
            try {
                // If the property exists, this element will load.
                await page.waitForSelector('#webprop_name', { timeout: 10000 });
            } catch (e) {
                // If the selector fails to load, it means the property ID is invalid or missing
                throw new Error("No Record Found / Invalid Parcel");
            }

            // 3. EXTRACT PROPERTY DETAILS
            const propertyData = await page.evaluate(() => {
                const formatDollar = (val, returnZero = false) => {
                    if (!val || val === "N/A" || val.trim() === "" || val.toLowerCase() === "not applicable") {
                        return returnZero ? "$0.00" : "N/A";
                    }
                    if (val.toString().trim().startsWith("$")) return val.trim();
                    return "$" + val.trim();
                };

                const cleanText = (id) => {
                    const el = document.getElementById(id);
                    return el && el.innerText.trim() !== "" ? el.innerText.trim() : "N/A";
                };

                const owner_name = cleanText('webprop_name');
                
                // Extract Situs Address cleanly and handle "Not Applicable"
                let property_address = cleanText('webprop_situs');
                if (property_address !== "N/A") {
                    property_address = property_address.replace(/^Situs:\s*/i, '').trim();
                    if (property_address.toLowerCase() === "not applicable" || property_address === "") {
                        property_address = "N/A";
                    }
                }

                let legal_desc = cleanText('webprop_desc');
                if (legal_desc !== "N/A") {
                    legal_desc = legal_desc.replace(/^Legal:\s*/i, '').trim();
                }

                const exemption = cleanText('webprop_exemption');

                // Extract Values from "Property Valuation History" table (Top Row / Current Year)
                const land_value = formatDollar(cleanText('histlnd0_yr'), true);
                const improvements = formatDollar(cleanText('histimp0_yr'), true);
                const assessed_value = formatDollar(cleanText('histassd0_yr'), false);

                // Attempt to grab Taxable Value from the "Property Tax Estimation by Entity" table
                let taxable_value = "N/A";
                const taxEntityTable = document.getElementById('tableTaxing');
                if (taxEntityTable) {
                    const firstRowTds = taxEntityTable.querySelectorAll('tr:first-child td');
                    if (firstRowTds.length >= 3) {
                        const tv = firstRowTds[2].innerText.trim();
                        if (tv && tv !== "" && tv.toLowerCase() !== "not applicable") {
                            // Notice: We are no longer stripping commas out here!
                            taxable_value = formatDollar(tv, false);
                        }
                    }
                }

                // Fallback: If Taxable Value is missing but Assessed is present, Taxable = Assessed
                if (taxable_value === "N/A" && assessed_value !== "N/A") {
                    taxable_value = assessed_value;
                }

                return {
                    owner_name,
                    property_address,
                    legal_desc,
                    exemption,
                    land_value,
                    improvements,
                    assessed_value,
                    taxable_value
                };
            });

            // 4. NAVIGATE DIRECTLY TO TAX SUMMARY PAGE
            await page.goto(taxUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.waitForSelector('#tableBills', { timeout: 15000 }).catch(() => {});

            // 5. EXTRACT TAX HISTORY
            const extractedHistory = await page.evaluate((propData, acc, authName) => {
                
                const formatDollar = (val) => {
                    if (!val || val === "N/A" || val.trim() === "") return "$0.00";
                    if (val.toString().trim().startsWith("$")) return val.trim();
                    return "$" + val.trim();
                };

                const taxHistory = [];
                let holdsDelinquency = false;
                let hasPriorDue = false;
                let totalAmountDue = 0;
                const todayDate = new Date();
                todayDate.setHours(0, 0, 0, 0);

                const billRows = document.querySelectorAll('#tableBills tr');
                
                billRows.forEach((tr, index) => {
                    const tds = tr.querySelectorAll('td');
                    // Ensure it's a valid data row (not the Total Amount Due row)
                    if (tds.length >= 8 && !tds[1].innerText.includes("Total Amount Due")) {
                        const year = tds[0].innerText.trim();
                        const baseTax = tds[2].innerText.trim();
                        const paidTax = tds[3].innerText.trim();
                        
                        // Additional Fees (tds[5]) + Late Fees (tds[6]) = Total Penalty/Fees
                        const feesStr = tds[5].innerText.trim();
                        const penaltyStr = tds[6].innerText.trim();
                        const amountDueStr = tds[7].innerText.trim();

                        const numAmountDue = parseFloat(amountDueStr.replace(/[$,]/g, '')) || 0;

                        // Texas Rules Calculation
                        const yearNum = parseInt(year);
                        const dueDate = !isNaN(yearNum) ? `01/31/${yearNum + 1}` : "N/A";
                        const delqDate = !isNaN(yearNum) ? `02/01/${yearNum + 1}` : "N/A";

                        let status = "Paid";
                        let paidDate = "N/A"; // Explicitly set to N/A as requested

                        if (numAmountDue > 0) {
                            totalAmountDue += numAmountDue;
                            
                            const dDateObj = new Date(delqDate);
                            if (delqDate !== "N/A" && todayDate >= dDateObj) {
                                status = "Delinquent";
                                holdsDelinquency = true;
                            } else {
                                status = "Due";
                            }

                            if (index > 0) hasPriorDue = true;
                        } else {
                            status = "Paid";
                            paidDate = "N/A"; // Enforcing N/A when paid date is not available in the row
                        }

                        let finalBaseAmt = baseTax;
                        if (baseTax === "$0.00" || baseTax === "N/A" || baseTax === "0") {
                            finalBaseAmt = paidTax !== "N/A" ? paidTax : "$0.00";
                        }

                        taxHistory.push({
                            jurisdiction: "County",
                            year: year,
                            payment_type: "Annual",
                            status: status,
                            base_amount: formatDollar(finalBaseAmt),
                            county_tax: "N/A",
                            city_tax: "N/A",
                            fees: formatDollar(feesStr),
                            penalty: formatDollar(penaltyStr),
                            cost: "N/A",
                            amount_paid: formatDollar(paidTax),
                            amount_due: formatDollar(amountDueStr),
                            paid_date: paidDate,
                            due_date: dueDate,
                            delq_date: delqDate,
                            land_value: "N/A",
                            improvements: "N/A",
                            total_assessed_value: propData.assessed_value,
                            exemptions_breakdown: {
                                residential_exemption: "0.00",
                                homestead_exemption: "0.00",
                                other_exemptions: "0.00",
                                local_option_credit: "0.00"
                            }
                        });
                    }
                });

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

                // Format the Notes (Calculated BEFORE sorting so [0] is the most recent year)
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

                // ASCENDING SORT LOGIC: Ensures filteredHistory is ordered from oldest to newest
                filteredHistory.sort((a, b) => parseInt(a.year) - parseInt(b.year));

                return {
                    result: {
                        processed_date: processedDate,
                        owner_name: propData.owner_name !== "N/A" ? [propData.owner_name] : ["N/A"],
                        property_address: propData.property_address,
                        parcel_number: acc,
                        land_value: propData.land_value,
                        improvements: propData.improvements,
                        total_assessed_value: propData.assessed_value,
                        exemption: propData.exemption,
                        total_taxable_value: propData.taxable_value,
                        taxing_authority: authName,
                        notes: notesText,
                        delinquent: finalDelinquentStatus,
                        total_amount_due: `$${totalAmountDue.toFixed(2)}`,
                        tax_history: filteredHistory,
                        property_details: {
                            record_type: "Real Estate",
                            acres: "N/A",
                            lots: "N/A",
                            buildings: "N/A",
                            description: propData.legal_desc,
                            district_levy: "N/A",
                            city_levy: "N/A",
                            total_appraisal: propData.assessed_value
                        }
                    }
                };
            }, propertyData, account, countyConfig.auth);

            resolve(extractedHistory);

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
