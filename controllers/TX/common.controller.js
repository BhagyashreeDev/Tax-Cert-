// Author: M M Prateek

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 30000
};

// MULTI-COUNTY CONFIGURATION
const county_data = {
    "jasper": {
        url: "https://jaspercotxtax.com/",
        auth: "Jasper County Tax Office, TX"
    },
    "anderson": {
        url: "http://tax.co.anderson.tx.us/",
        auth: "Anderson County Tax Office, TX"
    },
    "franklin": {
        url: "http://franklincountytaxoffice.com/",
        auth: "Franklin County Tax Office, TX"
    },
    "guadalupe": {
        url: "https://property.guadalupetx.gov/",
        auth: "Guadalupe County Tax Office, TX" 
    },
    "lubbock": {
        url: "https://lubbockcad.org/",
        auth: "Lubbock Central Appraisal District, TX" 
    },
    "waller": {
        url: "http://tax.co.waller.tx.us/",
        auth: "Waller County Tax Office, TX"
    },
    "limestone": {
        url: "https://www.limestonetexas-tax.com/",
        auth: "Limestone County Tax Office, TX"
    },
    "hutchinson": {
        url: "http://hutchinsoncountytax.com/",
        auth: "Hutchinson County Tax Office, TX"
    },
    "lavaca": {
        url: "https://www.lavacacountytax.com/",
        auth: "Lavaca County Tax Office, TX"
    }
    // newly added
    ,
    "medina": {
        url: "http://www.medinacountytx.org/",
        auth: "Medina County Tax Office, TX"
    },
    "san-jacinto": {
        url: "https://sjc-tax.us/",
        auth: "San Jacinto County Tax Office, TX"
    }
    
};

const account_search = (page, countyConfig, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Format the account and bypass the search page
            const formattedAccount = encodeURIComponent(account.replace(/[-.]/g, '').trim());
            
            // Generate the dynamic search URL
            const baseUrl = countyConfig.url.endsWith('/') ? countyConfig.url.slice(0, -1) : countyConfig.url;
            const searchUrl = `${baseUrl}/Property-Search-Result/searchtext/${formattedAccount}`;
            
            await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

            // Robust selector handling both older (Jasper) and newer (Guadalupe) grid versions
            const rowSelector = '.k-grid-content tbody tr:first-child, .k-grid-table tbody tr:first-child';
            await page.waitForSelector(rowSelector, timeout_option);

            // Check if no properties were found
            const noData = await page.evaluate((sel) => {
                const row = document.querySelector(sel);
                return row && row.innerText.includes("No properties found");
            }, rowSelector);

            if (noData) {
                throw new Error("No Record Found / Invalid Parcel");
            }

            // Click the result row robustly via Kendo UI API or fallback click
            await Promise.all([
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
                page.evaluate((sel) => {
                    // 1. Try modern Kendo UI Grid extraction (Guadalupe, etc.)
                    try {
                        if (window.jQuery && jQuery("#grid").data("kendoGrid")) {
                            var gview = jQuery("#grid").data("kendoGrid");
                            var firstRow = jQuery("#grid tbody tr:first").get(0);
                            if (firstRow) {
                                var selectedItem = gview.dataItem(firstRow);
                                if (selectedItem && selectedItem.PropertyQuickRefID) {
                                    var partyId = selectedItem.PartyQuickRefID || "";
                                    window.location.href = "/Property-Detail/PropertyQuickRefID/" + selectedItem.PropertyQuickRefID + "/PartyQuickRefID/" + partyId + "/";
                                    return;
                                }
                            }
                        }
                    } catch(e) {}

                    // 2. Fallback: Native click on standard elements
                    const row = document.querySelector(sel);
                    if (row) {
                        const link = row.querySelector('a');
                        if (link) {
                            link.click();
                        } else {
                            row.click();
                        }
                    }
                }, rowSelector)
            ]);

            // Ensure detail page loads using the universal "ends with" selector [id$="..."]
            await page.waitForSelector('[id$="_tdOIOwnerName"]', timeout_option);

            // Click the Bills tab (Silently catches if it's a CAD like Lubbock that has no bills)
            await page.click('#tabBills').catch(() => {});
            await new Promise(r => setTimeout(r, 1500)); // Allow time for the bills tab DOM to populate

            // Extract the data
            const page_content = await page.evaluate((params) => {
                const acc = params.acc;
                const authName = params.auth;
                
                const cleanText = (selector) => {
                    const el = document.querySelector(selector);
                    if (!el) return "N/A";
                    const clone = el.cloneNode(true);
                    const spans = clone.querySelectorAll('.table-responsive-stack-thead');
                    spans.forEach(s => s.remove());
                    return clone.innerText.trim() || "N/A";
                };

                // Use "ends with" selector [id$="..."] to bypass the random DNN Module Numbers across counties
                const owner_name = cleanText('[id$="_tdOIOwnerName"]');
                const property_address = cleanText('[id$="_tdPropertyAddress"]');
                const assessed_value = cleanText('[id$="_tdVITotalAssessedValueRP"]') !== "N/A" 
                    ? cleanText('[id$="_tdVITotalAssessedValueRP"]') 
                    : cleanText('[id$="_tdPropertyValueHeader"]');
                const exemption = cleanText('[id$="_tdOIExemptions"]');
                
                let taxable_value = assessed_value;
                const entitiesTable = document.querySelector('#tblEntitiesAndExemptionsData') || document.querySelector('[id$="_divEntitiesAndExemptionsData"] table');
                if (entitiesTable) {
                    const dataRows = entitiesTable.querySelectorAll('tbody tr');
                    let firstDataRow = null;
                    for(let r of dataRows) {
                        if(!r.classList.contains('tableHeaders')) {
                            firstDataRow = r;
                            break;
                        }
                    }
                    if (firstDataRow) {
                        const tds = firstDataRow.querySelectorAll('td');
                        if (tds.length >= 4) {
                            let tv = tds[3].innerText.replace('TAXABLE VALUE:', '').trim();
                            if (tv) taxable_value = tv;
                        }
                    }
                }

                // Extract tax history safely targeting only inner datatables
                const extractedHistory = [];
                const billTables = document.querySelectorAll('table.datatable[id^="tblBills"]');
                
                const todayDate = new Date();

                billTables.forEach((table) => {
                    const prevTable = table.previousElementSibling;
                    const year = prevTable ? prevTable.querySelector('.sectionHeader')?.innerText.trim() : "N/A";
                    
                    const totalsRow = table.querySelector('tr.totals');
                    if (!totalsRow) return;
                    
                    const tds = totalsRow.querySelectorAll('td');
                    const totalDue = tds[1]?.innerText.replace(/[^0-9.$-]/g, '').trim() || "$0.00";
                    const amountPaid = tds[3]?.innerText.replace(/[^0-9.$-]/g, '').trim() || "$0.00";
                    const balanceStr = tds[4]?.innerText.replace(/[^0-9.$-]/g, '').trim() || "$0.00";
                    
                    let paidDate = "N/A";
                    const firstSummary = table.querySelector('tr.summaryRow');
                    if (firstSummary) {
                        let dateTxt = firstSummary.querySelectorAll('td')[2]?.innerText.replace('DATE PAID:', '').trim();
                        if (dateTxt && dateTxt !== "-" && dateTxt !== "") {
                            paidDate = dateTxt.replace(/-/g, '/');
                        }
                    }
                    
                    const numBalance = parseFloat(balanceStr.replace(/[$,]/g, "")) || 0;
                    
                    // Texas Rules Calculation
                    const yearNum = parseInt(year);
                    const dueDate = !isNaN(yearNum) ? `01/31/${yearNum + 1}` : "N/A";
                    const delqDate = !isNaN(yearNum) ? `02/01/${yearNum + 1}` : "N/A";
                    
                    let status = "Paid";
                    if (numBalance > 0) {
                        const delqD = new Date(delqDate);
                        if (todayDate >= delqD) {
                            status = "Delinquent";
                        } else {
                            status = "Due";
                        }
                    }
                    
                    extractedHistory.push({
                        jurisdiction: "County",
                        year: year,
                        payment_type: "Annual",
                        status: status,
                        base_amount: totalDue,
                        amount_paid: amountPaid,
                        amount_due: balanceStr,
                        mailing_date: "N/A",
                        due_date: dueDate,
                        delq_date: delqDate,
                        paid_date: paidDate,
                        good_through_date: "N/A",
                        _numBalance: numBalance
                    });
                });

                // Format final history array
                const taxHistory = [];
                let totalDueAccumulator = 0;
                let holdsDelinquency = false;
                
                for (let i = 0; i < extractedHistory.length; i++) {
                    const row = extractedHistory[i];
                    
                    if (row.status !== "Paid") {
                        totalDueAccumulator += row._numBalance;
                        if (row.status === "Delinquent") holdsDelinquency = true;
                    }
                    
                    delete row._numBalance;
                    
                    if (i === 0) {
                        taxHistory.push(row);
                        if (row.status === "Paid") break;
                    } else {
                        if (row.status === "Paid") break;
                        taxHistory.push(row);
                    }
                }

                const formattedDate = `${String(todayDate.getMonth() + 1).padStart(2, '0')}/${String(todayDate.getDate()).padStart(2, '0')}/${todayDate.getFullYear()}`;

                // Dynamic Notes Logic
                let hasPriorDue = false;
                for (let i = 1; i < taxHistory.length; i++) {
                    if (taxHistory[i].status !== "Paid") {
                        hasPriorDue = true;
                        break;
                    }
                }

                let notesText = "ALL PRIORS ARE PAID";
                if (taxHistory.length > 0) {
                    const topYear = taxHistory[0];
                    if (hasPriorDue) {
                        notesText = `PRIORS ARE DELINQUENT, ${topYear.year} TAXES ARE ${topYear.status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS 01/31`;
                    } else {
                        notesText = `ALL PRIORS ARE PAID, ${topYear.year} TAXES ARE ${topYear.status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS 01/31`;
                    }
                } else {
                    notesText = "NO TAX BILL HISTORY AVAILABLE (APPRAISAL DISTRICT)";
                }

                // ASCENDING SORT LOGIC: Ensures taxHistory is ordered from oldest to newest
                taxHistory.sort((a, b) => parseInt(a.year) - parseInt(b.year));

                return {
                    processed_date: formattedDate,
                    order_number: "N/A",
                    borrower_name: "N/A",
                    owner_name: owner_name !== "N/A" ? [owner_name] : ["N/A"], 
                    property_address: property_address,
                    parcel_number: acc,
                    land_value: "N/A", 
                    improvements: "N/A",
                    total_assessed_value: assessed_value,
                    exemption: exemption,
                    total_taxable_value: taxable_value,
                    taxing_authority: authName, // Dynamically injected 
                    notes: notesText, 
                    delinquent: holdsDelinquency ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE", 
                    total_amount_due: `$${totalDueAccumulator.toFixed(2)}`,
                    tax_history: taxHistory
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

    // Dynamically get the county from the endpoint route
    const county = req.path.replace('/', '').toLowerCase(); 

    try {
        if (!county_data[county]) {
            return res.status(404).json({ error: true, message: "County configuration not found." });
        }

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
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

        if (fetch_type == "html") {
            account_search(page, config, account)
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
        else if (fetch_type == "api") {
            account_search(page, config, account)
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
