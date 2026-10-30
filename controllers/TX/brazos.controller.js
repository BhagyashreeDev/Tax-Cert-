// Author :- Vadiraj Joshi

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000
};

// --- HELPER: ROBUST ACCEPT BUTTON HANDLER ---
const handleAcceptButton = async (page) => {
    try {
        await page.waitForSelector('button[ng-click="wildfireAccept()"]', { timeout: 8000 });
        
        // Wait specifically for the ng-disabled to resolve
        await page.waitForFunction(() => {
            const btn = document.querySelector('button[ng-click="wildfireAccept()"]');
            return btn && !btn.hasAttribute('disabled');
        }, { timeout: 8000 });

        await page.evaluate(() => {
            const btn = document.querySelector('button[ng-click="wildfireAccept()"]');
            if (btn) btn.click();
        });
        
        await new Promise(res => setTimeout(res, 1000));
    } catch (e) {
        // Silently continue if modal is not present
    }
};

// --- BRAZOS COUNTY TX DATA SCRAPER PIPELINE ---
const ac_1 = async (page, url, account) => {
    try {
        if (!account) {
            throw new Error('Invalid format. Property Number/Account is missing.');
        }

        // STEP 1: Navigate and handle terms
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await handleAcceptButton(page);

        // STEP 2 & 3: Input Account and Search (Robust Angular Override)
        await page.waitForSelector('#searchBox', { timeout: 10000 });
        await page.evaluate((acc) => { 
            const input = document.querySelector('#searchBox');
            input.value = acc;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, account.toString().trim());
        
        await new Promise(res => setTimeout(res, 800)); 
        await page.keyboard.press('Enter');
        await page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"]');
            if (btn && !btn.disabled) btn.click();
        });

        // STEP 4: Wait for results and map configuration
        try {
            await page.waitForSelector('table.searchResults tbody tr[data-btn-view-record]', { timeout: 15000 });
            await new Promise(res => setTimeout(res, 1500)); // Allow Angular ng-repeat bindings to fully settle
        } catch (e) {
            throw new Error('Property Number not found or no records returned.');
        }

        const rowsConfig = await page.evaluate(() => {
            const trs = document.querySelectorAll('table.searchResults tbody tr[data-btn-view-record]');
            let configs = [];
            let seenYears = new Set();
            
            for (let i = 0; i < trs.length; i++) {
                const tds = trs[i].querySelectorAll('td');
                if (tds.length < 2) continue;

                const yearText = tds[1].innerText.trim();
                const statusNode = trs[i].querySelector('.payStatus');
                const statusText = statusNode ? statusNode.innerText.trim() : '';

                // Only take the FIRST (primary) row for any specific year to avoid duplicates
                if (!seenYears.has(yearText)) {
                    seenYears.add(yearText);
                    configs.push({ index: i, status: statusText, year: yearText });

                    // Stop gathering history entirely once we hit a Paid year
                    if (statusText.includes('Paid')) {
                        break;
                    }
                }
            }

            return configs;
        });

        if (rowsConfig.length === 0) {
            throw new Error('No valid tax year rows found for extraction.');
        }

        let taxHistoryArray = [];
        let primaryData = {};

        // Loop through required records (Max 1 iteration per year)
        for (let j = 0; j < rowsConfig.length; j++) {
            const config = rowsConfig[j];

            // SPA Reset: Force browser to drop stale DOM state before reloading
            if (j > 0) {
                await page.goto('about:blank'); 
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
                await handleAcceptButton(page);
                
                await page.waitForSelector('#searchBox', { timeout: 10000 });
                await page.evaluate((acc) => { 
                    const input = document.querySelector('#searchBox');
                    input.value = acc;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }, account.toString().trim());
                
                await new Promise(res => setTimeout(res, 800));
                await page.keyboard.press('Enter');
                await page.evaluate(() => {
                    const btn = document.querySelector('button[type="submit"]');
                    if (btn && !btn.disabled) btn.click();
                });
                
                await page.waitForSelector('table.searchResults tbody tr[data-btn-view-record]', { timeout: 15000 });
            }

            // Extended delay crucial for Angular to attach the correct scope to the buttons
            await new Promise(res => setTimeout(res, 2000)); 

            // STEP 5: Click View targeting exact mapped row index
            await page.evaluate((idx) => {
                const trs = document.querySelectorAll('table.searchResults tbody tr[data-btn-view-record]');
                if (trs[idx]) {
                    const btn = trs[idx].querySelector('button.btnView');
                    if (btn) btn.click();
                }
            }, config.index);

            // Wait for details page to render
            await page.waitForSelector('.infoTable', { timeout: 15000 });
            await new Promise(res => setTimeout(res, 1200)); 

            // STEPS 6-9: Extract data blocks
            const yearDetails = await page.evaluate(() => {
                let result = {
                    propId: "", taxYear: "", ownerName: "", address: "",
                    baseTax: "$0.00", totalPaid: "$0.00", totalDue: "$0.00",
                    location: "", assessedValue: "$0.00",
                    paymentStatus: "Due", paidDate: ""
                };

                const tables = document.querySelectorAll('.infoTable');
                tables.forEach(table => {
                    const rows = table.querySelectorAll('tr');
                    rows.forEach(row => {
                        const tds = row.querySelectorAll('td');
                        if (tds.length >= 2) {
                            const label = tds[0].innerText.trim();
                            const rawVal = tds[1].innerHTML; 
                            const cleanText = tds[1].innerText.trim();

                            if (label === "Property ID") result.propId = cleanText;
                            if (label === "Tax Year") result.taxYear = cleanText;
                            if (label === "Owner Name") result.ownerName = rawVal.replace(/<br\s*[\/]?>/gi, ' ').replace(/(<([^>]+)>)/gi, "").trim();
                            if (label === "Address") result.address = rawVal.replace(/<br\s*[\/]?>/gi, ', ').replace(/(<([^>]+)>)/gi, "").trim();

                            // Fallback mechanisms for blank cells
                            if (label === "Original Tax Amount") result.baseTax = cleanText || "$0.00";
                            if (label === "Taxes Paid" || label === "Net Taxes Paid") result.totalPaid = cleanText || "$0.00";
                            
                            if (label === "Total Due") {
                                const dueAmt = tds[1].textContent.replace(/[^0-9.$]/g, '').trim();
                                result.totalDue = dueAmt || "$0.00";
                            }

                            if (label === "Property Location") result.location = cleanText;
                            if (label === "Assessed Value") result.assessedValue = cleanText || "$0.00";

                            if (label === "Payment Status") result.paymentStatus = cleanText;
                            if (label === "Last Payment Date") result.paidDate = cleanText;
                        }
                    });
                });

                return result;
            });

            // Enforce expected year from configuration over broken SPA display errors
            if (!yearDetails.taxYear && config.year) {
                yearDetails.taxYear = config.year;
            }

            const yearValInt = parseInt(yearDetails.taxYear, 10);
            const dueDate = `01/31/${yearValInt + 1}`;
            const delqDate = `02/01/${yearValInt + 1}`;

            const numDue = parseFloat(yearDetails.totalDue.replace(/[^0-9.]/g, '')) || 0;
            let finalStatus = "Due";

            if (yearDetails.paymentStatus.includes("Paid") || numDue === 0) {
                finalStatus = "Paid";
            } else {
                const today = new Date();
                const delqDateObj = new Date(delqDate);
                if (today >= delqDateObj) {
                    finalStatus = "Delinquent";
                }
            }

            taxHistoryArray.push({
                jurisdiction: "County",
                year: yearDetails.taxYear,
                payment_type: "Annual",
                status: finalStatus,
                base_amount: yearDetails.baseTax,
                amount_paid: yearDetails.totalPaid,
                amount_due: yearDetails.totalDue,
                mailing_date: "",
                due_date: dueDate,
                delq_date: delqDate,
                paid_date: yearDetails.paidDate || "N/A",
                good_through_date: ""
            });

            if (j === 0) {
                primaryData = {
                    ownerName: yearDetails.ownerName,
                    address: yearDetails.address,
                    location: yearDetails.location,
                    propId: yearDetails.propId,
                    assessedValue: yearDetails.assessedValue
                };
            }
        }

        // --- SORT & ANALYZE ---
        taxHistoryArray.sort((a, b) => parseInt(a.year, 10) - parseInt(b.year, 10));

        // --- Notes Logic ---
        const isAnyDelinquent = taxHistoryArray.some(history => history.status === "Delinquent");
        const delinquentStatus = isAnyDelinquent ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF" : "NONE";
        
        const primaryRecordForDate = taxHistoryArray[taxHistoryArray.length - 1];
        const maxYear = parseInt(primaryRecordForDate.year, 10);
        const minYear = parseInt(taxHistoryArray[0].year, 10);
        
        const shortDue = primaryRecordForDate.due_date.slice(0, 5);
        let dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDue}`;
        let basePaymentType = "ANNUALLY";

        const priorRecords = taxHistoryArray.slice(0, taxHistoryArray.length - 1);
        const isPriorYearPaid = priorRecords.length === 0 || !priorRecords.some(r => r.status.toUpperCase() === "DELINQUENT");

        let generatedNotes = "";

        if (isAnyDelinquent) {
            if (isPriorYearPaid) {
                generatedNotes = `ALL PRIORS ARE PAID, ${maxYear} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
            } else {
                generatedNotes = `PRIORS ARE DELINQUENT, ${maxYear} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
            }
        } else {
            if (primaryRecordForDate.status.toUpperCase() === "DUE") {
                generatedNotes = `ALL PRIORS ARE PAID, ${maxYear} TAXES ARE DUE, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
            } else {
                generatedNotes = `ALL PRIORS ARE PAID, ${maxYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
            }
        }

        // --- History Array Filter ---
        // Exclude the oldest year completely if the current year is Delinquent/Due AND the oldest year is Paid
        let outputTaxHistory = [...taxHistoryArray];
        if (maxYear !== minYear) {
            const currentYearState = outputTaxHistory[outputTaxHistory.length - 1].status.toUpperCase();
            const oldestYearState = outputTaxHistory[0].status.toUpperCase();
            
            if (currentYearState !== "PAID" && oldestYearState === "PAID") {
                outputTaxHistory.shift(); 
            }
        }

        return {
            processed_date: "",
            order_number: "",
            borrower_name: "",
            owner_name: primaryData.ownerName ? [primaryData.ownerName] : ["N/A"],
            property_address: primaryData.location || primaryData.address || "",
            parcel_number: primaryData.propId || account.toString().trim(),
            land_value: "",
            improvements: "",
            total_assessed_value: primaryData.assessedValue || "",
            exemption: "",
            total_taxable_value: primaryData.assessedValue || "",
            taxing_authority: "Brazos County, TX",
            notes: generatedNotes,
            delinquent: delinquentStatus,
            tax_history: outputTaxHistory
        };

    } catch (error) {
        console.error("Brazos County ac_1 Internal Method Error: ", error);
        throw error;
    }
};

const account_search = async (page, url, account) => {
    try {
        const data = await ac_1(page, url, account);
        return data;
    } catch (error) {
        console.error("Pipeline failure: ", error);
        throw error;
    }
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

        const url = "https://www.brazostax.org/taxes.html#/";

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

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
