// Author :- Vadiraj Joshi

/**
* =========================================================================
* VERIFIED TEST CASES STATUS:
* -------------------------------------------------------------------------
* Fannin:         ["R000101026"]   -> PASS
* Hamilton:       ["R000016892"]   -> PASS
* Somervell:      ["N000130639"]   -> PASS
* =========================================================================
*/

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Mapping specifically for Fannin, Hamilton, and Somervell CAD Portals
const county_data = {
    "fannin": { url: "https://fannincad.southwestdatasolutions.com/PropertySearch", auth: "Fannin County, TX" },
    "hamilton": { url: "https://hamiltoncad.southwestdatasolutions.com/PropertySearch", auth: "Hamilton County, TX" },
    "somervell": { url: "https://somervellcad.southwestdatasolutions.com/PropertySearch", auth: "Somervell County, TX" }
};

const timeout_option = { timeout: 90000 };

// Helper function to format strings safely to clean currency format ($XX.XX)
const formatCurrency = (valStr) => {
    if (!valStr || valStr.trim() === "" || valStr.trim() === "N/A" || valStr.trim() === "-") return "$0.00";
    let clean = valStr.replace(/[$,]/g, "").trim();
    let num = parseFloat(clean);
    if (isNaN(num)) return "$0.00";
    return "$" + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ac_1 = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Navigate directly to the baseline Property Search Portal URL
            await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: timeout_option.timeout });

            // Step 1: Click the "Property ID" filtering chip option safely via direct text matching
            await page.waitForSelector(".sdx-chipp", timeout_option);
            await page.evaluate(() => {
                const chips = Array.from(document.querySelectorAll(".sdx-chipp"));
                const propertyIdChip = chips.find(chip => chip.textContent.trim().includes("Property ID"));
                if (propertyIdChip) {
                    propertyIdChip.click();
                } else {
                    throw new Error("Property ID filtration option chip missing from DOM layout.");
                }
            });

            // Allow the dynamic Blazor framework layer UI to transform state variables
            await new Promise(r => setTimeout(r, 1500));

            // Step 2: Focus the dynamic input search box container and write out the parcel account value
            await page.waitForSelector(".sdx-searchbox input.sdx-input", timeout_option);
            await page.focus(".sdx-searchbox input.sdx-input");

            // Clean out potential static residual text strings before typing
            await page.evaluate(() => {
                const inputEl = document.querySelector(".sdx-searchbox input.sdx-input");
                if (inputEl) inputEl.value = "";
            });
            await page.type(".sdx-searchbox input.sdx-input", account.trim());

            // Step 3: Use Keyboard submission to register Blazor form state dispatch handlers reliably
            await page.keyboard.press('Enter');

            // Step 4: Wait for dynamic data rows to return across active WebSockets
            await page.waitForSelector("tr.rz-data-row", timeout_option);
            await new Promise(r => setTimeout(r, 1000));

            // Click the exact cell text content anchor to switch inside the Blazor Single Page View layout
            await page.evaluate((accountStr) => {
                const dataRows = Array.from(document.querySelectorAll("tr.rz-data-row"));
                const matchingRow = dataRows.find(row => row.textContent.trim().includes(accountStr.trim())) || dataRows[0];
                if (matchingRow) {
                    const interactiveCell = matchingRow.querySelector("td") || matchingRow;
                    interactiveCell.click();
                } else {
                    throw new Error("Search output trace missing required targeting results data row.");
                }
            }, account);

            // Wait until the details tab view layout paints completely
            await page.waitForSelector(".rz-tabview-nav", timeout_option);

            // CRITICAL SYNC: Explicitly wait until the dynamic Blazor loading finishes and genuine profile container elements mount
            await page.waitForSelector(".mt-2 div.fw-bold", timeout_option);
            await new Promise(r => setTimeout(r, 3000));

            // Steps 5, 6, & 7: Parse core parcel values directly from the open Property Year profile tab view
            const currentTabContent = await page.evaluate((account, authName) => {
                const data = {
                    processed_date: new Date().toLocaleDateString(),
                    order_number: "",
                    borrower_name: "",
                    owner_name: ['N/A'],
                    property_address: "N/A",
                    parcel_number: account,
                    land_value: "-",
                    improvements: "-",
                    total_assessed_value: "N/A",
                    exemption: "",
                    total_taxable_value: "N/A",
                    taxing_authority: authName,
                    notes: "",
                    delinquent: "NONE",
                    tax_history: [],
                    extractedYear: "" 
                };

                // Extract Year directly from the selected tab label string (e.g., "Property Year 2025" -> "2025")
                const activeTabSpan = document.querySelector(".rz-tabview-nav li.rz-tabview-selected .rz-tabview-title");
                let targetYear = new Date().getFullYear().toString(); 
                if (activeTabSpan) {
                    let yearMatch = activeTabSpan.textContent.match(/\d{4}/);
                    if (yearMatch) {
                        targetYear = yearMatch[0];
                    }
                }
                data.extractedYear = targetYear;

                // Step 5: Capture Owner bold text row string matching rule
                const ownerElement = document.querySelector(".mt-2 div.fw-bold");
                if (ownerElement) {
                    data.owner_name = [ownerElement.textContent.trim()];
                }

                // Step 6: Target the narrow text elements inside the profile box cleanly to get Situs address
                const strongElements = Array.from(document.querySelectorAll("div.mt-2 div strong"));
                const situsLabel = strongElements.find(el => el.textContent.includes("Situs:"));
                if (situsLabel && situsLabel.parentElement) {
                    data.property_address = situsLabel.parentElement.textContent.replace(/^(Situs:\s*)+/i, "").trim();
                } else {
                    const smallDivs = Array.from(document.querySelectorAll("div.mt-2 div"));
                    const dynamicSitusDiv = smallDivs.find(d => d.textContent.includes("Situs:") && d.textContent.length < 200);
                    if (dynamicSitusDiv) {
                        data.property_address = dynamicSitusDiv.textContent.replace(/^(Situs:\s*)+/i, "").trim();
                    }
                }

                // Step 7: Capture Assessed value by mapping lookups against dynamic table text columns using targetYear
                const allTables = Array.from(document.querySelectorAll("table"));
                const valuationTable = allTables.find(t => t.textContent.includes("Values by Year") || t.textContent.includes("Total Assessed"));

                if (valuationTable) {
                    const headers = Array.from(valuationTable.querySelectorAll("thead th, tr th"));
                    let matchedColumnIndex = -1;

                    // Match calculated target column index matching the calendar year digits structure
                    for (let idx = 0; idx < headers.length; idx++) {
                        if (headers[idx].textContent.trim().includes(targetYear)) {
                            matchedColumnIndex = idx;
                            break;
                        }
                    }

                    if (matchedColumnIndex === -1) matchedColumnIndex = 1;

                    const dataRows = Array.from(valuationTable.querySelectorAll("tbody tr"));

                    // Capture dynamic breakdown lines
                    const impRow = dataRows.find(r => r.textContent.includes("Improvements"));
                    if (impRow) data.improvements = impRow.querySelectorAll("td")[matchedColumnIndex]?.textContent.trim() || "-";

                    const landRow = dataRows.find(r => r.textContent.includes("Land"));
                    if (landRow) data.land_value = landRow.querySelectorAll("td")[matchedColumnIndex]?.textContent.trim() || "-";

                    const assessedRow = dataRows.find(r => r.textContent.includes("Total Assessed"));
                    if (assessedRow) {
                        const cellText = assessedRow.querySelectorAll("td")[matchedColumnIndex]?.textContent.trim();
                        data.total_assessed_value = cellText || "N/A";
                        data.total_taxable_value = cellText || "N/A";
                    }
                }

                return data;
            }, account, tax_auth);

            const targetYearVal = currentTabContent.extractedYear;
            delete currentTabContent.extractedYear; 

            // =========================================================
            // Step 8: Trigger click on the 'Tax Summary' navigation tab
            // =========================================================
            await page.evaluate(() => {
                const navigations = Array.from(document.querySelectorAll(".rz-tabview-nav .rz-tabview-title"));
                const exactTabLink = navigations.find(el => el.textContent.trim().toLowerCase() === "tax summary");
                if (exactTabLink) {
                    const triggerButton = exactTabLink.tagName === "BUTTON" ? exactTabLink : exactTabLink.closest("button");
                    if (triggerButton) {
                        triggerButton.click();
                        return;
                    }
                }
                throw new Error("Unable to execute interactive click trace matching Tax Summary layout button.");
            });

            // Wait for the new Tax Summary table records to render
            await page.waitForSelector(".rz-grid-table tbody tr.rz-data-row", timeout_option);
            await new Promise(r => setTimeout(r, 2000)); // Buffer for Blazor DOM swap

            // =========================================================
            // Step 9: Extract History from the PROPERTY TAX BILLS Table
            // =========================================================
            const structuralHistory = await page.evaluate((fallbackYear) => {
                const tables = Array.from(document.querySelectorAll("table"));
                // Target the specific table that contains chronological Taxing Details
                const historyTable = tables.find(t => t.textContent.includes("PROPERTY TAX BILLS") || t.textContent.includes("Taxing Detail"));
                
                if (!historyTable) return [];

                const tabularLines = Array.from(historyTable.querySelectorAll("tbody tr.rz-data-row"));
                const localizedLogs = [];

                tabularLines.forEach(line => {
                    const rowCells = Array.from(line.querySelectorAll("td"));
                    if (rowCells.length >= 6) { 
                        const rawYear = rowCells[0].textContent.trim();
                        const baseTaxableAmount = rowCells[2].textContent.trim(); 
                        const processedPaidTax = rowCells[3].textContent.trim();   
                        const activeAmountDue = rowCells[rowCells.length - 1].textContent.trim(); // Always grab last column

                        let calculatedDue = parseFloat(activeAmountDue.replace(/[$,]/g, '')) || 0;
                        let extractionStatus = (calculatedDue === 0 || line.textContent.toLowerCase().includes('paid')) ? "PAID" : "DELINQUENT";

                        // Extract valid 4-digit year format (e.g. "2025")
                        let numericYearMatch = rawYear.match(/\d{4}/);
                        let calculatedCalendarYear = numericYearMatch ? numericYearMatch[0] : fallbackYear;

                        let dynamicNextYearVal = parseInt(calculatedCalendarYear) + 1;

                        localizedLogs.push({
                            jurisdiction: "County",
                            year: calculatedCalendarYear, 
                            calendarYear: calculatedCalendarYear,
                            payment_type: "ANNUAL",
                            status: extractionStatus,
                            base_amount: baseTaxableAmount,
                            amount_paid: processedPaidTax,
                            amount_due: activeAmountDue,
                            mailing_date: "N/A",
                            due_date: `01/31/${dynamicNextYearVal}`,
                            delq_date: `02/01/${dynamicNextYearVal}`,
                            paid_date: "N/A",
                            good_through_date: ""
                        });
                    }
                });

                return localizedLogs;
            }, targetYearVal);

            let isPriorYearPaid = true;
            let primaryYearStatus = "";
            let originalYearLabel = "";

            const safeTaxHistory = [];

            if (structuralHistory.length > 0) {
                originalYearLabel = structuralHistory[0].year;
                primaryYearStatus = structuralHistory[0].status;

                for (let idx = 0; idx < structuralHistory.length; idx++) {
                    const calculatedItem = structuralHistory[idx];

                    // Format values safely
                    calculatedItem.base_amount = formatCurrency(calculatedItem.base_amount);
                    calculatedItem.amount_paid = formatCurrency(calculatedItem.amount_paid);
                    calculatedItem.amount_due = formatCurrency(calculatedItem.amount_due);

                    if (calculatedItem.status === "PAID") {
                        if (idx === 0) {
                            safeTaxHistory.push(calculatedItem);
                        }
                        break;
                    } else {
                        safeTaxHistory.push(calculatedItem);
                        if (idx > 0) isPriorYearPaid = false;
                    }
                }

                // Sort the extracted array in ascending order based on the year (e.g., 2025 -> 2026)
                safeTaxHistory.sort((a, b) => parseInt(a.year) - parseInt(b.year));
            }

            // Merge clean mapped histories and format metrics values inside parent container data blocks
            currentTabContent.tax_history = safeTaxHistory;
            currentTabContent.total_assessed_value = formatCurrency(currentTabContent.total_assessed_value);
            currentTabContent.total_taxable_value = formatCurrency(currentTabContent.total_taxable_value);
            currentTabContent.land_value = formatCurrency(currentTabContent.land_value);
            currentTabContent.improvements = formatCurrency(currentTabContent.improvements);

            // Reference Notes Logical Assessment Tree
            let basePaymentType = "ANNUAL";
            let dynamicDueDatesNote = "NORMAL DUE DATE IS 01/31";
            let compiledSummaryNotes = "";

            if (!isPriorYearPaid) {
                compiledSummaryNotes = `PRIORS ARE DELINQUENT, ${originalYearLabel} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                currentTabContent.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
            } else {
                if (primaryYearStatus === "DELINQUENT") {
                    compiledSummaryNotes = `ALL PRIORS ARE PAID, ${originalYearLabel} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    currentTabContent.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
                } else if (primaryYearStatus === "DUE") {
                    compiledSummaryNotes = `ALL PRIORS ARE PAID, ${originalYearLabel} TAXES ARE DUE, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    currentTabContent.delinquent = "NONE";
                } else {
                    compiledSummaryNotes = `ALL PRIORS ARE PAID, ${originalYearLabel} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    currentTabContent.delinquent = "NONE";
                }
            }
            currentTabContent.notes = compiledSummaryNotes;

            resolve(currentTabContent);
        } catch (error) {
            console.log(error);
            reject(new Error("No Record Found"));
        }
    });
};

const account_search = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, baseUrl, account, tax_auth)
                .then((data1) => resolve(data1))
                .catch((error) => {
                    console.log(error);
                    reject(new Error(error.message));
                });
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

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
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
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
                .finally(async () => { await context.close(); });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

export { search };
