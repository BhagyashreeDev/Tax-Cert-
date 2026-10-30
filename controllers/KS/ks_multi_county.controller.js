// AUTHOR :- Vadiraj Joshi
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "haskell": {
        url: "https://ecountyworks.publicaccessnow.com/haskell/TaxSearchAdvanced.php",
        auth: "Haskell County, KS",
        code: "041"
    },
    "clark": {
        url: "https://ecountyworks.publicaccessnow.com/clark/TaxSearchAdvanced.php",
        auth: "Clark County, KS",
        code: "013"
    },
    "morton": {
        url: "https://ecountyworks.publicaccessnow.com/morton/TaxSearchAdvanced.php",
        auth: "Morton County, KS",
        code: "065"
    }
};

const timeout_option = {
    timeout: 90000
};

const is_delq = (date) => {
    let today = new Date();
    let delq_date = new Date(date);
    return today >= delq_date;
};

const parseTaxDetail = async (page) => {
    return await page.evaluate(() => {
        let year = "";
        const yearEl = document.querySelector('td[style*="font-size: 18pt"] strong');
        if (yearEl) {
            const match = yearEl.textContent.match(/Tax Year:\s*(\d{4})/i);
            if (match) year = match[1];
        }

        let parcel_number = "";
        const stmtEl = Array.from(document.querySelectorAll('td')).find(td => td.textContent && td.textContent.includes('Parcel ID:'));
        if (stmtEl) {
            const match = stmtEl.textContent.match(/Parcel ID:\s*([\w-]+)/i);
            if (match) parcel_number = match[1];
        }

        let property_address = "";
        const addrTd = Array.from(document.querySelectorAll('td')).find(td => td.textContent && td.textContent.includes('Property Address:'));
        if (addrTd) {
            const tr1 = addrTd.closest('tr');
            const tr2 = tr1?.nextElementSibling;
            const tr3 = tr2?.nextElementSibling;
            
            const streetLine = tr2?.querySelector('td')?.textContent.trim() || "";
            const cityZipLine = tr3?.querySelector('td')?.textContent.trim() || "";
            
            property_address = [streetLine, cityZipLine].filter(Boolean).join(", ").trim();
        }

        let owner_name = [];
        const ownerTd = Array.from(document.querySelectorAll('td')).find(td => td.textContent && td.textContent.includes('Owner Information:'));
        if (ownerTd) {
            const ownerTextTd = ownerTd.closest('tr')?.nextElementSibling?.querySelector('td');
            if (ownerTextTd) {
                const lines = ownerTextTd.innerHTML.split('<br>').map(s => s.replace(/<[^>]*>?/gm, '').trim().replace(/&amp;/g, ','));
                if (lines[0]) owner_name.push(lines[0]);
            }
        }

        let base_tax = "$0.00";
        let total_tax = "$0.00";
        let total_due = "$0.00";
        const allStrong = Array.from(document.querySelectorAll('strong'));
        const genTaxEl = allStrong.find(s => s.textContent && s.textContent.includes('General Tax:'));
        if (genTaxEl) base_tax = genTaxEl.closest('td').nextElementSibling?.textContent.trim() || "$0.00";
        
        const totalTaxEl = allStrong.find(s => s.textContent && s.textContent.includes('Total Tax:'));
        if (totalTaxEl) total_tax = totalTaxEl.closest('td').nextElementSibling?.textContent.trim() || "$0.00";
        
        const totalDueEl = allStrong.find(s => s.textContent && s.textContent.includes('Total Due:'));
        if (totalDueEl) total_due = totalDueEl.closest('td').nextElementSibling?.textContent.trim() || "$0.00";

        if (!base_tax.startsWith('$')) base_tax = '$' + base_tax;
        if (!total_tax.startsWith('$')) total_tax = '$' + total_tax;
        if (!total_due.startsWith('$')) total_due = '$' + total_due;

        let receipts = [];
        const recTh = Array.from(document.querySelectorAll('th')).find(th => th.textContent && th.textContent.includes('Receipt Information'));
        if (recTh) {
            const recTable = recTh.closest('table');
            const rows = recTable.querySelectorAll('tr');
            
            for (let r of rows) {
                const rowTextContent = r.textContent || "";
                if (rowTextContent.includes('CUR')) {
                    const rowTextArray = Array.from(r.querySelectorAll('td'))
                        .map(td => td.textContent.trim())
                        .filter(txt => txt !== "");
                    
                    if (rowTextArray.length >= 5) {
                        let dateText = rowTextArray[2]; 
                        
                        if (dateText.match(/\d{2}\/\d{2}\/\d{4}/)) {
                            let taxPaid = parseFloat(rowTextArray[3].replace(/[^0-9.-]+/g, "")) || 0;
                            let intFeePaid = parseFloat(rowTextArray[4].replace(/[^0-9.-]+/g, "")) || 0;
                            
                            receipts.push({
                                date: dateText,
                                total_paid: taxPaid + intFeePaid
                            });
                        }
                    }
                }
            }
        }

        return { year, parcel_number, property_address, owner_name, base_tax, total_tax, total_due, receipts };
    });
};

const getPrevYearLink = async (page, year) => {
    return await page.evaluate((prevYearStr) => {
        const th = Array.from(document.querySelectorAll('th')).find(th => th.textContent.includes('Additional Years Statements'));
        if (th) {
            const links = th.closest('table').querySelectorAll('a');
            for (let a of links) {
                if (a.textContent.trim() === prevYearStr) {
                    return a.href;
                }
            }
        }
        return null;
    }, (parseInt(year) - 1).toString());
};

const account_search = async (page, url, searchAccount, originalAccount, tax_auth) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    
    const checkboxesToUncheck = ['16/20MVEH', 'Minerals', 'Gas-Royalty', 'Gas-Working', 'Oil-Royalty', 'Oil-Working', 'StateAssess', 'taxesdue'];
    for (const name of checkboxesToUncheck) {
        await page.evaluate((n) => {
            const cb = document.querySelector(`input[name="${n}"]`);
            if (cb && cb.checked) cb.checked = false;
        }, name);
    }

    await page.type('input[name="searchparcel"]', searchAccount);
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
        page.keyboard.press('Enter')
    ]);

    // Extract both the latest detail link AND the address from the search results table
    const searchPageData = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href^="TaxDetail.php"]');
        let maxYear = 0;
        let targetHref = null;
        let extractedAddress = "";
        let extractedOwnerName = "";

        links.forEach(l => {
            const tr = l.closest('tr');
            const yearTd = tr?.querySelector('td');
            if (yearTd) {
                const yr = parseInt(yearTd.textContent.trim());
                if (!isNaN(yr) && yr > maxYear) {
                    maxYear = yr;
                    targetHref = l.href;

                    // Extracting address from the cell shown in the image
                    const cell = l.closest('td');
                    if (cell) {
                        const clone = cell.cloneNode(true);
                        const anchor = clone.querySelector('a');
                        if (anchor) anchor.remove(); // Remove the link so only the address remains

                        // Process remaining text broken by <br>
                        extractedAddress = clone.innerHTML.split('<br>')
                            .map(s => s.replace(/<[^>]*>?/gm, '').trim())
                            .filter(s => s !== "")
                            .join(', ');
                    }

                    // Extract owner name from the 9th column (Owner Name column)
                    const allTds = Array.from(tr.querySelectorAll('td'));
                    if (allTds.length >= 9) {
                        const ownerCell = allTds[8]; // 9th column (0-indexed)
                        if (ownerCell) {
                            // Get text before the first <br>
                            const ownerHtml = ownerCell.innerHTML;
                            const firstBrIndex = ownerHtml.indexOf('<br>');
                            if (firstBrIndex !== -1) {
                                extractedOwnerName = ownerHtml.substring(0, firstBrIndex)
                                    .replace(/<[^>]*>?/gm, '')
                                    .replace(/&amp;/g, ',')
                                    .trim();
                            } else {
                                // If no <br>, take the entire text content
                                extractedOwnerName = ownerCell.textContent.replace(/&amp;/g, ',').trim();
                            }
                        }
                    }
                }
            }
        });
        return { targetHref, extractedAddress, extractedOwnerName };
    });

    if (!searchPageData.targetHref) throw new Error("Record not found or No Tax Data Available");

    const main_data = {
        processed_date: new Date().toLocaleDateString(),
        order_number: "",
        borrower_name: "",
        owner_name: searchPageData.extractedOwnerName ? [searchPageData.extractedOwnerName] : [],
        property_address: searchPageData.extractedAddress, // Populated from the search results page
        parcel_number: originalAccount, 
        land_value: "N/A",           
        improvements: "N/A",         
        total_assessed_value: "N/A", 
        exemption: "N/A",            
        total_taxable_value: "N/A",  
        taxing_authority: tax_auth,
        notes: "",
        delinquent: "NONE",
        tax_history: []
    };

    let isComplete = false;
    let currentUrl = searchPageData.targetHref;

    while (!isComplete && currentUrl) {
        await page.goto(currentUrl, { waitUntil: "domcontentloaded", ...timeout_option });
        
        const pageData = await parseTaxDetail(page);

        if (main_data.owner_name.length === 0) {
            main_data.owner_name = pageData.owner_name;
            // Only overwrite if the initial search results page didn't provide an address
            if (!main_data.property_address) {
                main_data.property_address = pageData.property_address;
            }
        }

        let isFullyPaid = parseFloat(pageData.total_due.replace(/[^0-9.-]+/g, "")) === 0;
        let baseTaxFloat = parseFloat(pageData.base_tax.replace(/[^0-9.-]+/g, "")) || 0;
        let fullBaseStr = "$" + Number(baseTaxFloat).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        let halfBaseStr = "$" + Number(baseTaxFloat / 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        const receipts = pageData.receipts || [];
        receipts.sort((a, b) => new Date(a.date) - new Date(b.date));

        let nextYear = parseInt(pageData.year) + 1;
        let dec20 = `12/20/${pageData.year}`;
        let dec21 = `12/21/${pageData.year}`;
        let may10 = `05/10/${nextYear}`;
        let may11 = `05/11/${nextYear}`;

        if (receipts.length === 0) {
            let status = is_delq(dec21) ? "DELINQUENT" : "DUE";
            main_data.tax_history.push({
                jurisdiction: "County",
                year: pageData.year,
                payment_type: "Annual",
                status: status,
                base_amount: fullBaseStr,
                amount_paid: "$0.00",
                amount_due: pageData.total_due,
                mailing_date: "N/A",
                due_date: dec20,
                delq_date: dec21,
                paid_date: "N/A",
                good_through_date: "-"
            });
            if (isFullyPaid) isComplete = true; 
        } 
        else if (receipts.length === 1 && isFullyPaid) {
            main_data.tax_history.push({
                jurisdiction: "County",
                year: pageData.year,
                payment_type: "Annual",
                status: "PAID",
                base_amount: fullBaseStr,
                amount_paid: "$" + Number(receipts[0].total_paid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                amount_due: "$0.00",
                mailing_date: "N/A",
                due_date: dec20,
                delq_date: dec21,
                paid_date: receipts[0].date,
                good_through_date: "-"
            });
            isComplete = true;
        }
        else if (receipts.length === 1 && !isFullyPaid) {
            main_data.tax_history.push({
                jurisdiction: "County",
                year: pageData.year,
                payment_type: "Semi-Annual",
                status: "PAID",
                base_amount: halfBaseStr,
                amount_paid: "$" + Number(receipts[0].total_paid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                amount_due: "$0.00",
                mailing_date: "N/A",
                due_date: dec20,
                delq_date: dec21,
                paid_date: receipts[0].date,
                good_through_date: "-"
            });

            main_data.tax_history.push({
                jurisdiction: "County",
                year: pageData.year,
                payment_type: "Semi-Annual",
                status: is_delq(may11) ? "DELINQUENT" : "DUE",
                base_amount: halfBaseStr,
                amount_paid: "$0.00",
                amount_due: pageData.total_due, 
                mailing_date: "N/A",
                due_date: may10,
                delq_date: may11,
                paid_date: "N/A",
                good_through_date: "-"
            });
        }
        else if (receipts.length >= 2) {
            main_data.tax_history.push({
                jurisdiction: "County",
                year: pageData.year,
                payment_type: "Semi-Annual",
                status: "PAID",
                base_amount: halfBaseStr,
                amount_paid: "$" + Number(receipts[0].total_paid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                amount_due: "$0.00",
                mailing_date: "N/A",
                due_date: dec20,
                delq_date: dec21,
                paid_date: receipts[0].date,
                good_through_date: "-"
            });

            main_data.tax_history.push({
                jurisdiction: "County",
                year: pageData.year,
                payment_type: "Semi-Annual",
                status: "PAID",
                base_amount: halfBaseStr,
                amount_paid: "$" + Number(receipts[1].total_paid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                amount_due: "$0.00",
                mailing_date: "N/A",
                due_date: may10,
                delq_date: may11,
                paid_date: receipts[1].date,
                good_through_date: "-"
            });
            
            if (isFullyPaid) isComplete = true; 
        }

        if (!isComplete) {
            const prevYearLink = await getPrevYearLink(page, pageData.year);
            if (prevYearLink) {
                currentUrl = prevYearLink;
            } else {
                isComplete = true; 
            }
        }
    }

    if (main_data.tax_history.length > 0) {
        // Sort tax_history in ascending order by year
        main_data.tax_history.sort((a, b) => {
            const yearA = parseInt(a.year, 10);
            const yearB = parseInt(b.year, 10);
            return yearA - yearB;
        });
        
        let taxHistoryArray = main_data.tax_history;
        
        // Check for quarterly payments (4 payments in same year) and convert to installments
        const yearGroups = {};
        taxHistoryArray.forEach(entry => {
            if (!yearGroups[entry.year]) {
                yearGroups[entry.year] = [];
            }
            yearGroups[entry.year].push(entry);
        });
        
        // Convert payment_type to installments if there are 4 entries for a year
        Object.keys(yearGroups).forEach(year => {
            const entries = yearGroups[year];
            if (entries.length === 4) {
                entries[0].payment_type = "1st Installment";
                entries[1].payment_type = "2nd Installment";
                entries[2].payment_type = "3rd Installment";
                entries[3].payment_type = "4th Installment";
            }
        });
        
        const isAnyDelinquent = taxHistoryArray.some(h => h.status.toUpperCase() === "DELINQUENT");
        main_data.delinquent = isAnyDelinquent ? "PRIORS ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

        const allYears = taxHistoryArray.map(h => parseInt(h.year, 10));
        const maxYear = Math.max(...allYears);
        const yearVal = maxYear.toString();

        const isPriorYearPaid = !taxHistoryArray.some(h => h.year !== yearVal && h.status.toUpperCase() === "DELINQUENT");
        const currentYearInst = taxHistoryArray.filter(h => h.year === yearVal);

        let dynamicDueDatesNote = "";
        let basePaymentType = currentYearInst.length >= 2 ? "SEMI ANNUALLY" : "ANNUAL";

        if (currentYearInst.length >= 2) {
            const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
            const shortDueTwo = currentYearInst[1].due_date.substring(0, 5);
            dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} , ${shortDueTwo}`;
        } else if (currentYearInst.length === 1) {
            const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
            dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
        }

        let generatedNotes = "";
        if (currentYearInst.length >= 2) {
            const statusOne = currentYearInst[0].status.toUpperCase();
            const statusTwo = currentYearInst[1].status.toUpperCase();
            const statusString = `${yearVal} 1ST INSTALLMENT IS ${statusOne}, 2ND INSTALLMENT IS ${statusTwo}`;

            if (isAnyDelinquent) {
                if (isPriorYearPaid) {
                    generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                } else {
                    generatedNotes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                }
            } else {
                generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
            }
        } else {
            const primaryYearStatus = currentYearInst[0].status.toUpperCase();
            if (!isPriorYearPaid) {
                generatedNotes = `PRIORS ARE DELINQUENT, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
            } else {
                if (primaryYearStatus === "DELINQUENT") {
                    generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                } else if (primaryYearStatus === "DUE") {
                    generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DUE, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                } else {
                    generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                }
            }
        }
        main_data.notes = generatedNotes;
    } else {
        main_data.notes = "NO TAX DATA AVAILABLE";
        main_data.delinquent = "NONE";
    }

    return main_data;
};

const search = async (req, res) => {
    let { fetch_type, account, county } = req.body;
    let context = null;

    try {
        if (!county && req.params.county) county = req.params.county;
        if (!county) {
            const urlParts = req.originalUrl.split('?')[0].split('/');
            county = urlParts[urlParts.length - 1]; 
        }

        if (!county || !county_data[county.toLowerCase()]) {
            throw new Error(`Invalid County Code Supplied: ${county}`);
        }

        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const countyInfo = county_data[county.toLowerCase()];
        const url = countyInfo.url;
        const tax_auth = countyInfo.auth;
        const county_code = countyInfo.code;

        let originalAccount = account.trim();
        let searchAccount = originalAccount;
        
        const prefixRegex = new RegExp(`^${county_code}[\\s-]*`, 'i');
        
        if (prefixRegex.test(searchAccount)) {
            // Evaluates as a normal Parcel ID
            searchAccount = searchAccount.replace(prefixRegex, '');
        } else {
            // Evaluates as a Personal Property Record 
            // Extracts only the final segment, e.g., "001 AS SMITK" -> "SMITK"
            const parts = searchAccount.split(/\s+/);
            if (parts.length > 1) {
                searchAccount = parts[parts.length - 1];
            }
        }

        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (['stylesheet', 'font', 'image'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        const data = await account_search(page, url, searchAccount, originalAccount, tax_auth);

        if (fetch_type === "html") {
            return res.status(200).render("parcel_data_official", data);
        } else {
            return res.status(200).json({ result: data });
        }

    } catch (error) {
        console.error("Scraper Controller Failure:", error);
        if (fetch_type === "html") {
            return res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        } else {
            return res.status(500).json({
                error: true,
                message: error.message
            });
        }
    } finally {
        if (context) {
            await context.close().catch(err => console.error("Error closing context safely:", err));
        }
    }
};

export { search };
