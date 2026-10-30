// Author: M M Prateek

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000
};

// MULTI-COUNTY CONFIGURATION FOR KANSAS (CIC Hosting)
const county_data = {
    "cherokee": { base: "https://ks815.cichosting.com/ttp/tax", auth: "Cherokee County Treasurer, 110 W Maple St, Columbus, KS 66725, Ph: (620) 429-3848" },
    "ellis": { base: "https://ks292.cichosting.com/ttp/tax", auth: "Ellis County Treasurer, 718 Main St, Hays, KS 67601, Ph: (785) 628-9460" },
    "lincoln": { base: "https://ks497.cichosting.com/ttp/Tax", auth: "Lincoln County Treasurer, 216 E Lincoln Ave, Lincoln, KS 67455, Ph: (785) 524-4751" },
    "miami": { base: "https://ks244.cichosting.com/ttp/tax", auth: "Miami County Treasurer, 201 S Pearl St, Paola, KS 66071, Ph: (913) 294-6164" },
    "stafford": { base: "https://ks526.cichosting.com/ttp/tax", auth: "Stafford County Treasurer, 209 N Broadway St, St John, KS 67576, Ph: (620) 549-3243" },
    "seward": { base: "https://ks1663.cichosting.com/ttp/tax", auth: "Seward County Treasurer, 515 N Washington Ave, Liberal, KS 67901, Ph: (620) 626-3355" },
    "clay": { base: "https://ks278.cichosting.com/ttp/tax", auth: "Clay County Treasurer, 712 5th St, Clay Center, KS 67432, Ph: (785) 632-2413" },
    "finney": { base: "https://ks821.cichosting.com/ttp/tax", auth: "Finney County Treasurer, 311 N 9th St, Garden City, KS 67846, Ph: (620) 272-3500" },
    "atchison": { base: "https://ks825.cichosting.com/ttp/tax", auth: "Atchison County Treasurer, 423 N 5th St, Atchison, KS 66002, Ph: (913) 804-6050" },
    "barber": { base: "https://ks294.cichosting.com/TTP/tax", auth: "Barber County Treasurer, 120 E Washington St, Medicine Lodge, KS 67104, Ph: (620) 886-3961" },
    "marshall": { base: "https://ks283.cichosting.com/ttp/tax", auth: "Marshall County Treasurer, 1201 Broadway St, Marysville, KS 66508, Ph: (785) 562-5365" },
    "lyon": { base: "https://ks1058.cichosting.com/ttp/tax", auth: "Lyon County Treasurer, 430 Commercial St, Emporia, KS 66801, Ph: (620) 341-3280" },
    "crawford": { base: "https://ks282.cichosting.com/ttp/tax", auth: "Crawford County Treasurer, 111 E Forest Ave, Girard, KS 66743, Ph: (620) 724-6115" },
    "kingman": { base: "https://ks1080.cichosting.com/ttp/tax", auth: "Kingman County Treasurer, 130 N Spruce St, Kingman, KS 67068, Ph: (620) 532-1891" },
    "nemaha": { base: "https://ks284.cichosting.com/ttp/tax", auth: "Nemaha County Treasurer, 607 Nemaha St, Seneca, KS 66538, Ph: (785) 336-3912" },
    "osage": { base: "https://ks827.cichosting.com/ttp/tax", auth: "Osage County Treasurer, 717 Topeka Ave, Lyndon, KS 66451, Ph: (785) 828-3121" },
    "mcpherson": { base: "https://ks300.cichosting.com/ttp/tax", auth: "McPherson County Treasurer, 117 N Maple St, McPherson, KS 67460, Ph: (620) 241-1820" },
    "ness": { base: "https://ks527.cichosting.com/ttp/tax", auth: "Ness County Treasurer, 202 W Sycamore St, Ness City, KS 67560, Ph: (785) 798-2401" },
    "wabaunsee": { base: "https://ks1052.cichosting.com/ttp/tax", auth: "Wabaunsee County Treasurer, 215 Kansas Ave, Alma, KS 66401, Ph: (785) 765-3812" },
    "dickinson": { base: "https://ks479.cichosting.com/ttp/tax", auth: "Dickinson County Treasurer, 109 E 1st St, Abilene, KS 67410, Ph: (785) 263-2551" },
    "morris": { base: "https://ks288.cichosting.com/ttp/tax", auth: "Morris County Treasurer, 501 W Main St, Council Grove, KS 66846, Ph: (620) 767-5518" },
    "geary": { base: "https://ks296.cichosting.com/ttp/tax", auth: "Geary County Treasurer, 200 E 8th St, Junction City, KS 66441, Ph: (785) 238-6021" },
    "ottawa": { base: "https://ks1497.cichosting.com/ttp/Tax", auth: "Ottawa County Treasurer, 307 N Concord St, Minneapolis, KS 67467, Ph: (785) 392-3035" },
    "wilson": { base: "https://ks420.cichosting.com/ttp/tax", auth: "Wilson County Treasurer, 615 Madison St, Fredonia, KS 66736, Ph: (620) 378-6224" },
    "barton": { base: "https://ks761.cichosting.com/ttp/tax", auth: "Barton County Treasurer, 1400 Main St, Great Bend, KS 67530, Ph: (620) 793-1831" },
    "smith": { base: "https://ks1495.cichosting.com/ttp/Tax", auth: "Smith County Treasurer, 218 S Grant St, Smith Center, KS 66967, Ph: (785) 282-5180" }
};

const account_search = async (page, config, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const parts = account.split('-');
            if (parts.length < 2) return reject(new Error("Invalid account format. Ensure it includes the hyphen (e.g. 111-2041...)"));
            const taxUnit = parts[0].trim();
            const taxParcel = parts.slice(1).join('-').trim();

            const baseUrl = config.base;

            // 1. SEARCH PAGE NAVIGATION
            await page.goto(`${baseUrl}/Search/search_tax.aspx`, { waitUntil: "domcontentloaded", ...timeout_option });
            await page.waitForSelector('#txtTaxInformation1', timeout_option);

            await page.type('#txtTaxInformation1', taxUnit, { delay: 10 });
            await page.type('#txtTaxInformation2', taxParcel, { delay: 10 });

            await Promise.all([
                page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
                page.evaluate(() => document.querySelector('#btnFindNow').click())
            ]);

            // If the search generated multiple matches, click the first property link
            if (page.url().includes('search_tax_results.aspx')) {
                const currentTaxLink = await page.$('a[href*="current_tax.aspx"]');
                if (!currentTaxLink) return reject(new Error("No Record Found / Invalid Parcel"));

                await Promise.all([
                    page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
                    page.evaluate(() => document.querySelector('a[href*="current_tax.aspx"]').click())
                ]);
            }

            if (!page.url().includes('current_tax.aspx')) {
                return reject(new Error("No Record Found / Invalid Parcel"));
            }

            // 2. EXTRACT BASIC INFO, NAV LINKS, AND THE "CURRENT TAX" GRID (if present on this page)
            const currentData = await page.evaluate(() => {
                let owner_name = "N/A";
                let property_address = "N/A";

                // TEMPLATE A (Cherokee-style): <dt>/<dd> pairs with these classes.
                const dts = document.querySelectorAll('.tax-result-detail-term');
                const dds = document.querySelectorAll('.tax-result-detail-description');

                for (let i = 0; i < dts.length; i++) {
                    const label = dts[i].innerText.trim();
                    const value = dds[i].innerText.trim();
                    if (label === "Owner") {
                        owner_name = value.replace(/^[A-Z0-9]+\s+/, '').trim();
                    }
                    if (label === "Situs Address") {
                        property_address = value.replace(/;/g, ',').replace(/\s+/g, ' ').trim();
                    }
                }

                // TEMPLATE B (Ellis-style): plain <table id="tblHeader"> rows. Owner row is
                // "Owner ID" label + ID + Name in 3 cells of a nested table; the address sits
                // in the very next <tr> as "<street>" / "<zip>" across 2 cells (colspan=2 each,
                // no separate label). We find them by matching the visible label text.
                if (owner_name === "N/A") {
                    const allCells = document.querySelectorAll('#tblHeader td, #tblResult td');
                    for (let i = 0; i < allCells.length; i++) {
                        const text = allCells[i].innerText.trim();
                        if (text === "Owner ID" && allCells[i + 2]) {
                            owner_name = allCells[i + 2].innerText.trim();
                            break;
                        }
                    }
                }
                if (property_address === "N/A") {
                    // The address row is the lone <tr> whose first <td> is NOT a label
                    // (no nested inner table) and looks like "NNN STREETNAME" / "ZIP".
                    // It's the row immediately after the Taxpayer ID row.
                    const addressRows = document.querySelectorAll('.taxModuleHeader4c');
                    if (addressRows.length >= 2) {
                        const streetPart = addressRows[0].innerText.replace(/\s+/g, ' ').trim();
                        const zipPart = addressRows[1].innerText.replace(/\s+/g, ' ').trim();
                        if (streetPart) {
                            property_address = zipPart ? `${streetPart}, ${zipPart}` : streetPart;
                        }
                    }
                }

                let detailsUrl = "";
                let historyUrl = "";
                // Broadened to match both templates: Cherokee uses class "tax-result-link",
                // Ellis-style uses plain class "links" with a descriptive title attribute.
                const links = document.querySelectorAll('.tax-result-link, a.links');
                links.forEach(l => {
                    if (l.href.includes('Details.aspx')) detailsUrl = l.href;
                    if (l.href.includes('tax_history.aspx')) historyUrl = l.href;
                });

                // Detect the site's own "No Current Tax Year Records Exist" warning.
                // Different county templates render this differently (Cherokee uses a
                // .error-view-message span; Ellis-style plain-table sites put it directly
                // inside #errView), so check the page text broadly rather than one class.
                const errEl = document.querySelector('.error-view-message') || document.querySelector('#errView');
                const noCurrentRecords = !!(errEl && /No Current Tax Year Records Exist/i.test(errEl.innerText || ""));

                // Try to read the "Current Tax Information" grid directly off this page.
                // This section is sometimes absent (varies by county/template), in which
                // case we fall back to the Tax History page later.
                const parseD = (val) => parseFloat((val || "0").replace(/[$,]/g, '')) || 0;
                let currentGridRows = [];

                // TEMPLATE A (Cherokee-style): dedicated CSS classes per cell.
                const cherokeeRows = document.querySelectorAll('.current-tax-detail-grid:not(.current-tax-detail-grid-header)');
                cherokeeRows.forEach(row => {
                    const cells = row.querySelectorAll('.current-tax-detail-cell');
                    if (cells.length >= 11) {
                        const year = cells[0].innerText.trim();
                        if (!year || isNaN(year)) return;
                        currentGridRows.push({
                            year: year,
                            statement_num: cells[1].innerText.trim(),
                            first_due: parseD(cells[6].innerText),
                            second_due: parseD(cells[7].innerText),
                            first_paid: cells[9].innerText.trim().toLowerCase() === "yes",
                            second_paid: cells[10].innerText.trim().toLowerCase() === "yes"
                        });
                    }
                });

                // TEMPLATE B (Ellis-style): plain <table id="tblHeader"> with bare <td>
                // cells (no per-cell classes) and a blank spacer <td>&nbsp;</td> between
                // every real column. Verified column layout for this template:
                // 0=Year, 2=Statement#, 4=Line#, 6=Warrant#, 8=SpecialsDesc, 10=SpecialsPayoff,
                // 12=1stHalfDue, 14=2ndHalfDue, 16=TotalDue, 18=1stHalfPaid, 20=2ndHalfPaid.
                // Only attempted if Template A found nothing, to avoid double-counting.
                if (currentGridRows.length === 0) {
                    const ellisTable = document.querySelector('#tblHeader');
                    if (ellisTable) {
                        // The data rows are the <tr>s after the header row inside the cell
                        // that holds colspan="5"; identify them by checking cell[0] is a
                        // 4-digit year (optionally wrapped in an <a> tag for tax_receipt.aspx).
                        const allRows = ellisTable.querySelectorAll('tr');
                        const yearMap = {};
                        allRows.forEach(row => {
                            const cells = row.querySelectorAll('td');
                            if (cells.length < 21) return;
                            const yearText = cells[0].innerText.trim();
                            if (!/^\d{4}$/.test(yearText)) return; // skip header/non-data rows

                            const firstDue = parseD(cells[12].innerText);
                            const secondDue = parseD(cells[14].innerText);
                            const firstPaid = cells[18].innerText.trim().toLowerCase() === "yes";
                            const secondPaid = cells[20].innerText.trim().toLowerCase() === "yes";

                            if (!yearMap[yearText]) {
                                yearMap[yearText] = {
                                    year: yearText,
                                    statement_num: cells[2].innerText.trim(),
                                    first_due: 0,
                                    second_due: 0,
                                    first_paid: true,
                                    second_paid: true
                                };
                            }
                            // Some Ellis parcels show 2 lines (line 001, 002) under the same
                            // year with different amounts (e.g. base tax + a specials line).
                            // Sum the dollar amounts so nothing is under-reported, and AND the
                            // paid flags so the year is marked unpaid if ANY line is unpaid.
                            yearMap[yearText].first_due += firstDue;
                            yearMap[yearText].second_due += secondDue;
                            yearMap[yearText].first_paid = yearMap[yearText].first_paid && firstPaid;
                            yearMap[yearText].second_paid = yearMap[yearText].second_paid && secondPaid;
                        });
                        currentGridRows = Object.values(yearMap);
                    }
                }

                return { owner_name, property_address, detailsUrl, historyUrl, currentGridRows, noCurrentRecords };
            });

            // 3. EXTRACT PROPERTY DETAILS (Address, Acres, Values)
            let detailsData = {
                property_address_detail: null,
                acres: "N/A",
                legal_desc: "N/A",
                land_value: "N/A",
                improvements: "N/A",
                total_assessed_value: "N/A",
                taxable_value: "N/A"
            };

            if (currentData.detailsUrl) {
                await page.goto(currentData.detailsUrl, { waitUntil: "domcontentloaded", ...timeout_option });

                detailsData = await page.evaluate(() => {
                    const formatDollar = (val, returnZero = false) => {
                        if (!val || val === "N/A" || val.trim() === "" || val.toLowerCase() === "not applicable") return returnZero ? "$0.00" : "N/A";
                        if (val.toString().trim().startsWith("$")) return val.trim();
                        return "$" + val.trim();
                    };
                    const parseD = (val) => parseFloat((val || "0").replace(/[$,]/g, '')) || 0;

                    let property_address_detail = null;
                    let acres = "N/A";
                    let legal_desc = "N/A";
                    let land_value = "N/A";
                    let improvements = "N/A";
                    let total_assessed_value = "N/A";
                    let taxable_value = "N/A";

                    // Appraiser page selectors (Overriding standard address with clean Details page address)
                    const elAddress = document.querySelector('span[id*="PropertyAddress_0"]');
                    if (elAddress) {
                        property_address_detail = elAddress.innerHTML.replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
                    }

                    const elAcres = document.querySelector('span[id*="Acres_0"]');
                    if (elAcres && parseD(elAcres.innerText) > 0) acres = elAcres.innerText.trim();

                    const elLegal = document.querySelector('span[id*="LegalDescription_0"]');
                    if (elLegal) legal_desc = elLegal.innerText.replace(/\s+/g, ' ').trim();

                    const elLand = document.querySelector('span[id*="ValuesFinalLand_0"]');
                    if (elLand && parseD(elLand.innerText) > 0) land_value = formatDollar(elLand.innerText, true);

                    const elImp = document.querySelector('span[id*="ValuesFinalBldg_0"]');
                    if (elImp && parseD(elImp.innerText) > 0) improvements = formatDollar(elImp.innerText, true);

                    // Grab Standard Total Appraised (this site's "Total" column == Appraised/Assessed value)
                    const elTotalAppraisal = document.querySelector('span[id*="ValuesFinalTotal_0"]');
                    if (elTotalAppraisal && parseD(elTotalAppraisal.innerText) > 0) {
                        total_assessed_value = formatDollar(elTotalAppraisal.innerText, false);
                    }

                    // Grab Standard Total Assessed/Taxable (some templates expose a distinct assessed field)
                    const elAssessed = document.querySelector('span[id*="ValuesAssessedTotal_0"]');
                    if (elAssessed && parseD(elAssessed.innerText) > 0) {
                        taxable_value = formatDollar(elAssessed.innerText, false);
                    }

                    // AGRICULTURAL FALLBACKS - Total Assessed Value
                    if (total_assessed_value === "N/A") {
                        const elAgMkt = document.querySelector('span[id*="AgMktTotal_0"]');
                        if (elAgMkt && parseD(elAgMkt.innerText) > 0) total_assessed_value = formatDollar(elAgMkt.innerText, false);
                    }
                    // NOTE: There is intentionally NO agricultural fallback for taxable_value here.
                    // "AgUseTotal_0" is the Agricultural Land Summary's "Total Land Use Value" --
                    // a land-valuation figure, not a real taxable-value field. Using it would print
                    // a false taxable value. If no genuine taxable value is found on the page,
                    // taxable_value stays "N/A" and is mirrored from total_assessed_value below
                    // (the only allowed fallback), never fabricated from an unrelated field.

                    // RULE: Never fabricate a value. Only mirror a REAL scraped value across to the
                    // other field when exactly one of the two was actually found on the page.
                    // If both are missing, both stay "N/A". If both are present, both are kept as-is.
                    if (taxable_value === "N/A" && total_assessed_value !== "N/A") {
                        taxable_value = total_assessed_value;
                    } else if (total_assessed_value === "N/A" && taxable_value !== "N/A") {
                        total_assessed_value = taxable_value;
                    }

                    return { property_address_detail, acres, legal_desc, land_value, improvements, total_assessed_value, taxable_value };
                });
            }

            // Override with the cleaner address if found
            if (detailsData.property_address_detail && detailsData.property_address_detail !== "N/A" && detailsData.property_address_detail !== "") {
                currentData.property_address = detailsData.property_address_detail;
            }

            // 4. DECIDE WHETHER TO EVEN LOOK AT TAX HISTORY, PER THE SITE STATES:
            //   (a) "No Current Tax Year Records Exist" -> tax_history table stays EMPTY, but we
            //       still peek at tax_history.aspx's top year purely to phrase the Notes sentence
            //       correctly (priors paid vs delinquent).
            //   (b) Current grid present and fully paid -> use it as-is, no need to check history.
            //   (c) Current grid present with a due/delinquent half -> also check the TOP
            //       (most recent) year on tax_history.aspx; print it only if it shows a due;
            //       if that top history year is paid/no-due, stop there (no further back-walk).
            const hasCurrentGrid = currentData.currentGridRows && currentData.currentGridRows.length > 0;
            const currentGridHasDue = hasCurrentGrid && currentData.currentGridRows.some(
                y => !y.first_paid || !y.second_paid
            );

            // Reusable: navigate to tax_history.aspx and read only its TOP (most recent) year.
            const fetchTopHistoryRow = async () => {
                const tableTargetUrl = currentData.historyUrl ? currentData.historyUrl : page.url();
                await page.goto(tableTargetUrl, { waitUntil: "domcontentloaded", ...timeout_option });

                return await page.evaluate(() => {
                    const parseD = (val) => parseFloat((val || "0").replace(/[$,]/g, '')) || 0;

                    // TEMPLATE A (Cherokee-style): tax_history.aspx includes an extra "Owner ID"
                    // column vs current_tax.aspx, so its 1st/2nd Half Due are at indices 7/8,
                    // and Paid flags at 10/11 (current_tax.aspx uses 6/7 and 9/10 instead).
                    const rows = document.querySelectorAll('.tax-history-detail-grid:not(.tax-history-detail-grid-header)');
                    if (rows.length > 0) {
                        const topYear = rows[0].querySelectorAll('.tax-history-detail-cell')[0].innerText.trim();
                        if (!topYear || isNaN(topYear)) return null;

                        let result = { year: topYear, first_due: 0, second_due: 0, first_paid: true, second_paid: true };
                        for (const row of rows) {
                            const cells = row.querySelectorAll('.tax-history-detail-cell');
                            if (cells.length < 12) continue;
                            const year = cells[0].innerText.trim();
                            if (year !== topYear) break; // rows are grouped by year in order; stop once year changes
                            result.first_due += parseD(cells[7].innerText);
                            result.second_due += parseD(cells[8].innerText);
                            result.first_paid = result.first_paid && (cells[10].innerText.trim().toLowerCase() === "yes");
                            result.second_paid = result.second_paid && (cells[11].innerText.trim().toLowerCase() === "yes");
                        }
                        return result;
                    }

                    // TEMPLATE B (Ellis-style): plain <table id="tblHistory"> with bare <td>
                    // cells and blank spacers, same pattern as current_tax.aspx but shifted +2
                    // for the extra Owner ID column. Verified layout:
                    // 0=Year, 2=OwnerID, 4=Statement#, 14=1stHalfDue, 16=2ndHalfDue,
                    // 20=1stHalfPaid, 22=2ndHalfPaid.
                    const ellisTable = document.querySelector('#tblHistory');
                    if (ellisTable) {
                        const allRows = ellisTable.querySelectorAll('tr');
                        let topYear = null;
                        let result = null;
                        for (const row of allRows) {
                            const cells = row.querySelectorAll('td');
                            if (cells.length < 23) continue;
                            const yearText = cells[0].innerText.trim();
                            if (!/^\d{4}$/.test(yearText)) continue; // skip header/non-data rows

                            if (topYear === null) topYear = yearText; // first data row = most recent year
                            if (yearText !== topYear) break; // rows are grouped by year in DOM order

                            const firstDue = parseD(cells[14].innerText);
                            const secondDue = parseD(cells[16].innerText);
                            const firstPaid = cells[20].innerText.trim().toLowerCase() === "yes";
                            const secondPaid = cells[22].innerText.trim().toLowerCase() === "yes";

                            if (!result) {
                                result = { year: topYear, first_due: 0, second_due: 0, first_paid: true, second_paid: true };
                            }
                            result.first_due += firstDue;
                            result.second_due += secondDue;
                            result.first_paid = result.first_paid && firstPaid;
                            result.second_paid = result.second_paid && secondPaid;
                        }
                        return result;
                    }

                    return null;
                });
            };

            let rawHistory = [];
            // For state (a) only: tracks what we found in history, used for Notes phrasing.
            // Does NOT get added to tax_history (the table itself stays empty per spec).
            let noCurrentRecordsHistoryCheck = null;

            if (currentData.noCurrentRecords) {
                // State (a): tax_history table stays empty, but peek at history for the Notes wording.
                const topHistoryRow = await fetchTopHistoryRow();
                if (topHistoryRow) {
                    noCurrentRecordsHistoryCheck = {
                        hasDue: !topHistoryRow.first_paid || !topHistoryRow.second_paid,
                        row: topHistoryRow
                    };
                }
                rawHistory = [];
            } else if (!hasCurrentGrid || currentGridHasDue) {
                // State (c), or current grid template absent entirely (legacy fallback):
                // go fetch tax_history.aspx and read its TOP (most recent) row only.
                const topHistoryRow = await fetchTopHistoryRow();

                if (topHistoryRow) {
                    const topHasDue = !topHistoryRow.first_paid || !topHistoryRow.second_paid;
                    if (!hasCurrentGrid) {
                        // Legacy fallback: no current grid section existed on this template at
                        // all, so the top history year effectively IS "current" -- always show it.
                        rawHistory = [topHistoryRow];
                    } else if (topHasDue) {
                        // State (c): current year had a due, and the top history year also
                        // shows a due -> print it. Per spec we stop here (no deeper back-walk).
                        rawHistory = [topHistoryRow];
                    }
                    // else: top history year is fully paid -> per spec, print nothing from
                    // history, stop. rawHistory stays [].
                }
            }
            // else: state (b) - current grid present and fully paid. No history fetch needed;
            // rawHistory stays []. The current grid data itself still flows in via the merge below.

            // 4b. MERGE: the "Current Tax Information" grid (read in step 2, off the
            // current_tax.aspx page itself) always wins for its own year's live numbers,
            // since it's the authoritative current-balance source. rawHistory (if fetched)
            // only contributes the top history year when applicable per the rules above.
            let mergedMap = {};
            rawHistory.forEach(y => { mergedMap[y.year] = y; });
            if (hasCurrentGrid) {
                currentData.currentGridRows.forEach(y => {
                    mergedMap[y.year] = {
                        year: y.year,
                        first_due: y.first_due,
                        second_due: y.second_due,
                        first_paid: y.first_paid,
                        second_paid: y.second_paid
                    };
                });
            }
            const mergedHistory = Object.values(mergedMap).sort((a, b) => parseInt(b.year) - parseInt(a.year));

            // 5. PROCESS AND BUILD FINAL DATA
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const processedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            const formatDollarString = (num) => "$" + Number(num).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');

            let taxHistoryArray = [];
            let totalDueAcc = 0;

            mergedHistory.forEach(yData => {
                const yearNum = parseInt(yData.year);

                // Kansas Standard Due Dates
                const due1 = `12/20/${yearNum}`;
                const delq1 = `01/01/${yearNum + 1}`;
                const due2 = `05/10/${yearNum + 1}`;
                const delq2 = `06/01/${yearNum + 1}`;

                // 1st Half Processor
                let stat1 = "Paid";
                let amtDue1 = 0;
                let amtPaid1 = yData.first_due;
                if (!yData.first_paid) {
                    amtDue1 = yData.first_due;
                    amtPaid1 = 0;
                    stat1 = (today >= new Date(delq1)) ? "Delinquent" : "Due";
                }

                taxHistoryArray.push({
                    jurisdiction: "County",
                    tax_year: yData.year,
                    year: yData.year,
                    payment_type: "Semi-Annual",
                    pay_status: stat1,
                    status: stat1,
                    base_amount: formatDollarString(yData.first_due),
                    county_tax: "N/A",
                    city_tax: "N/A",
                    fees: "$0.00",
                    penalty: "N/A",
                    cost: "N/A",
                    amount_paid: formatDollarString(amtPaid1),
                    amount_due: formatDollarString(amtDue1),
                    mailing_date: "N/A",
                    paid_date: "N/A",
                    due_date: due1,
                    delq_date: delq1,
                    good_through_date: "N/A",
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemptions_breakdown: { residential_exemption: "0.00", homestead_exemption: "0.00", other_exemptions: "0.00", local_option_credit: "0.00" }
                });

                // 2nd Half Processor
                let stat2 = "Paid";
                let amtDue2 = 0;
                let amtPaid2 = yData.second_due;
                if (!yData.second_paid) {
                    amtDue2 = yData.second_due;
                    amtPaid2 = 0;
                    stat2 = (today >= new Date(delq2)) ? "Delinquent" : "Due";
                }

                taxHistoryArray.push({
                    jurisdiction: "County",
                    tax_year: yData.year,
                    year: yData.year,
                    payment_type: "Semi-Annual",
                    pay_status: stat2,
                    status: stat2,
                    base_amount: formatDollarString(yData.second_due),
                    county_tax: "N/A",
                    city_tax: "N/A",
                    fees: "$0.00",
                    penalty: "N/A",
                    cost: "N/A",
                    amount_paid: formatDollarString(amtPaid2),
                    amount_due: formatDollarString(amtDue2),
                    mailing_date: "N/A",
                    paid_date: "N/A",
                    due_date: due2,
                    delq_date: delq2,
                    good_through_date: "N/A",
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemptions_breakdown: { residential_exemption: "0.00", homestead_exemption: "0.00", other_exemptions: "0.00", local_option_credit: "0.00" }
                });

                totalDueAcc += amtDue1 + amtDue2;
            });

            // Sort descending by year (and by due date within year) to find the most current year
            taxHistoryArray.sort((a, b) => {
                if (b.year !== a.year) return parseInt(b.year) - parseInt(a.year);
                return new Date(a.due_date) - new Date(b.due_date);
            });

            const maxYearStr = taxHistoryArray.length > 0 ? taxHistoryArray[0].year : "";

            // FILTER RULE (per spec):
            // - The most current/recent year ALWAYS prints, regardless of paid/due/delinquent.
            // - For past years, walk back from most-recent-past to oldest: print a past year
            //   only while it still has a due/delinquent installment. The moment a past year
            //   is found fully "Paid", stop — don't print that year or anything older.
            const yearsDesc = [...new Set(taxHistoryArray.map(h => h.year))]
                .sort((a, b) => parseInt(b) - parseInt(a));

            const yearsToKeep = new Set([maxYearStr]);
            for (const yr of yearsDesc) {
                if (yr === maxYearStr) continue;
                const rowsForYear = taxHistoryArray.filter(h => h.year === yr);
                const yearFullyPaid = rowsForYear.every(h => h.status === "Paid");
                if (yearFullyPaid) break; // stop walking back further
                yearsToKeep.add(yr);
            }

            taxHistoryArray = taxHistoryArray.filter(h => yearsToKeep.has(h.year));

            // DYNAMIC NOTES
            let generatedNotes = "";
            let delinquentStatus = "NONE";

            try {
                if (currentData.noCurrentRecords) {
                    // State (a): tax_history table is intentionally empty. The Notes sentence
                    // is built purely from the history due/paid check performed above, without
                    // ever populating taxHistoryArray itself.
                    if (noCurrentRecordsHistoryCheck) {
                        const yr = noCurrentRecordsHistoryCheck.row.year;
                        const yearNum = parseInt(yr);
                        const due1Short = `12/20`;
                        const due2Short = `05/10`;
                        const dynamicDueDatesNote = `NORMAL DUE DATES ARE ${due1Short} AND ${due2Short}`;

                        if (noCurrentRecordsHistoryCheck.hasDue) {
                            delinquentStatus = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
                            generatedNotes = `PRIORS ARE DELINQUENT, NO CURRENT TAX YEAR RECORDS FOUND, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
                        } else {
                            delinquentStatus = "NONE";
                            generatedNotes = `PRIORS ARE PAID, NO CURRENT TAX YEAR RECORDS FOUND, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
                        }
                    } else {
                        // No history rows existed either -- nothing further to check against.
                        delinquentStatus = "NONE";
                        generatedNotes = "NO CURRENT TAX YEAR RECORDS FOUND";
                    }
                } else if (taxHistoryArray.length > 0) {
                    const isAnyDelinquent = taxHistoryArray.some(h => h.status.toUpperCase() === "DELINQUENT");
                    delinquentStatus = isAnyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

                    const allYears = taxHistoryArray.map(h => parseInt(h.year, 10));
                    const maxYear = Math.max(...allYears);
                    const yearVal = maxYear.toString();

                    const isPriorYearPaid = !taxHistoryArray.some(h => h.year !== yearVal && h.status.toUpperCase() === "DELINQUENT");
                    const currentYearInst = taxHistoryArray.filter(h => h.year === yearVal);

                    let dynamicDueDatesNote = "";
                    if (currentYearInst.length >= 2) {
                        const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
                        const shortDueTwo = currentYearInst[1].due_date.substring(0, 5);
                        dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} AND ${shortDueTwo}`;
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
                                generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
                            } else {
                                generatedNotes = `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
                            }
                        } else {
                            generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
                        }
                    }
                }
            } catch (err) {
                generatedNotes = "Error generating notes: " + err.message;
            }

            // Reverse to final ascending order
            taxHistoryArray.sort((a, b) => parseInt(a.year) - parseInt(b.year));

            const finalData = {
                processed_date: processedDate,
                owner_name: currentData.owner_name !== "N/A" ? [currentData.owner_name] : ["N/A"],
                property_address: currentData.property_address,
                parcel_number: account,
                land_value: detailsData.land_value,
                improvements: detailsData.improvements,
                total_assessed_value: detailsData.total_assessed_value,
                exemption: "N/A",
                total_taxable_value: detailsData.taxable_value,
                taxing_authority: config.auth,
                notes: generatedNotes,
                delinquent: delinquentStatus,
                total_amount_due: `$${totalDueAcc.toFixed(2)}`,
                tax_history: taxHistoryArray,
                property_details: {
                    record_type: "Real Estate",
                    acres: detailsData.acres,
                    lots: "N/A",
                    buildings: "N/A",
                    description: detailsData.legal_desc,
                    district_levy: "N/A",
                    city_levy: "N/A",
                    total_appraisal: detailsData.total_assessed_value
                }
            };

            resolve({ result: finalData });

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
        else if (fetch_type == "api") {
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
