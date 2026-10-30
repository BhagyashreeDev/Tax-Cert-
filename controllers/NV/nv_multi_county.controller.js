// Author :- Vadiraj Joshi
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Dedicated Mapping for Nevada Devnet Wedge Counties
const county_data = {
    "white-pine": { url: "https://whitepinenv.devnetwedge.com", auth: "White Pine County, NV" },
    "pershing":  { url: "https://pershingnv.devnetwedge.com",  auth: "Pershing County, NV"  },
    "storey":    { url: "https://storeynv.devnetwedge.com",    auth: "Storey County, NV"    },
    "esmeralda": { url: "https://esmeraldanv.devnetwedge.com", auth: "Esmeralda County, NV" },
    "mineral":   { url: "https://mineralnv.devnetwedge.com",   auth: "Mineral County, NV"   }
};

const timeout_option = { timeout: 90000 };

const ac_1 = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            const cleanBaseUrl = baseUrl.replace(/\/$/, "");
            const targetUrl = `${cleanBaseUrl}/parcel/view/${account.trim()}`;
            
            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeout_option.timeout });
            await page.waitForSelector("#Overview1", timeout_option);

            let rowsToClickIndices = []; 
            try {
                rowsToClickIndices = await page.evaluate(() => {
                    const historyPanel = document.querySelector('#PaymentHistory1');
                    if (!historyPanel) return [0];
                    
                    const mainTableBody = historyPanel.querySelector('table.show-more > tbody');
                    if (!mainTableBody) return [0];

                    const allTopLevelTrs = Array.from(mainTableBody.children).filter(el => el.tagName.toLowerCase() === 'tr');
                    const mainRows = allTopLevelTrs.filter(tr => !tr.hasAttribute('data-subrow'));
                    
                    let rowData = [];
                    for (let i = 0; i < mainRows.length; i++) {
                        const tds = mainRows[i].querySelectorAll(':scope > td');
                        if (tds.length >= 5) {
                            let yearStr = (tds[1]?.textContent.trim() || "").replace(/802(\d)/g, '202$1');
                            let fyYear = yearStr;
                            const dashMatch = yearStr.match(/(\d{4})\s*-\s*(\d{4})/);
                            if (dashMatch) {
                                fyYear = dashMatch[2]; 
                            } else {
                                const singleMatch = yearStr.match(/(\d{4})/);
                                if (singleMatch) fyYear = singleMatch[1];
                            }
                            let year = parseInt(fyYear, 10) || 0;
                            
                            const unpaidStr = tds[4].textContent.trim();
                            const unpaidVal = parseFloat(unpaidStr.replace(/[$,]/g, ''));
                            const isPaid = unpaidVal === 0;
                            
                            rowData.push({ index: i, year: year, isPaid: isPaid });
                        }
                    }
                    
                    // Sort mathematically Descending (Newest Year First)
                    rowData.sort((a, b) => b.year - a.year);
                    
                    let indices = [];
                    for (let i = 0; i < rowData.length; i++) {
                        let data = rowData[i];
                        
                        // If we hit a paid year and it's NOT the very first (newest) year
                        if (data.isPaid && i > 0) {
                            break; // Stop BEFORE adding this paid year to the list
                        }

                        indices.push(data.index);

                        // If the newest year itself is paid, we include it, but don't look further back
                        if (data.isPaid && i === 0) {
                            break;
                        }
                    }
                    return indices;
                });
            } catch(e) {
                console.log("Could not pre-calculate rows to open, defaulting to [0].", e.message);
                rowsToClickIndices = [0];
            }

            try {
                // Expand Assessments panel
                await page.evaluate(() => {
                    const panels = Array.from(document.querySelectorAll('.panel-info'));
                    const assessPanel = panels.find(p => p.querySelector('h2')?.textContent.toUpperCase().includes('ASSESSMENT'));
                    if (assessPanel) {
                        const btn = assessPanel.querySelector('.panel-toggle-button');
                        if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click();
                    }
                });
                
                await page.waitForSelector('#Assessments1 table.table-bordered', { timeout: 10000 });
                
                await page.waitForFunction(() => {
                    const assessPanel = document.querySelector('#Assessments1');
                    if (!assessPanel) return false;
                    const tables = assessPanel.querySelectorAll('table.table-bordered');
                    if (tables.length === 0) return false;
                    const trs = tables[0].querySelectorAll('tbody tr');
                    if (trs.length < 7) return false;
                    
                    for (let tr of trs) {
                        const cells = tr.querySelectorAll('td, th');
                        if (cells.length >= 5 && cells[0].textContent.trim().toLowerCase() === 'total') {
                            return true;
                        }
                    }
                    return false;
                }, { timeout: 10000 });
                
                await new Promise(r => setTimeout(r, 2000));

                // Expand ONLY the target main year rows
                await page.evaluate((indices) => {
                    const historyPanel = document.querySelector('#PaymentHistory1');
                    if (!historyPanel) return;
                    const mainTableBody = historyPanel.querySelector('table.show-more > tbody');
                    if (!mainTableBody) return;
                    
                    const allTopLevelTrs = Array.from(mainTableBody.children).filter(el => el.tagName.toLowerCase() === 'tr');
                    const mainRows = allTopLevelTrs.filter(tr => !tr.hasAttribute('data-subrow'));
                    
                    indices.forEach(idx => {
                        if (mainRows[idx]) {
                            const btn = mainRows[idx].querySelector('.row-toggle button');
                            if (btn) btn.click();
                        }
                    });
                }, rowsToClickIndices);
                await new Promise(r => setTimeout(r, 600)); 

                // Expand ONLY the target inner installment payment tables
                await page.evaluate((indices) => {
                    const historyPanel = document.querySelector('#PaymentHistory1');
                    if (!historyPanel) return;
                    const mainTableBody = historyPanel.querySelector('table.show-more > tbody');
                    if (!mainTableBody) return;
                    
                    const allTopLevelTrs = Array.from(mainTableBody.children).filter(el => el.tagName.toLowerCase() === 'tr');
                    const subRows = allTopLevelTrs.filter(tr => tr.hasAttribute('data-subrow'));
                    
                    indices.forEach(idx => {
                        if (subRows[idx]) {
                            const innerToggles = subRows[idx].querySelectorAll('.panel-toggle-button');
                            innerToggles.forEach(btn => btn.click());
                        }
                    });
                }, rowsToClickIndices);
                await new Promise(r => setTimeout(r, 600));

            } catch (e) {
                console.log("Note: Could not expand some panels.", e.message);
            }

            const page_content = await page.evaluate((account, authName, targetIndices) => {
                const data = {
                    processed_date : new Date().toLocaleDateString("en-US"),
                    order_number : "",
                    borrower_name: "",
                    owner_name: ['N/A'],
                    property_address: "N/A",
                    parcel_number: account,
                    land_value: "-",
                    improvements: "-",
                    total_assessed_value: undefined,
                    exemption: "-",
                    total_taxable_value: undefined,
                    taxing_authority: authName, 
                    notes: "",
                    delinquent: "NONE",              
                    tax_history: []
                };

                const formatCurrency = (val) => {
                    if (val === null || val === undefined || val === 'N/A' || val === '' || val === '-') return '-';
                    let num = parseFloat(val.toString().replace(/[$,]/g, ''));
                    if (isNaN(num)) return '-';
                    return '$' + num.toLocaleString('en-US');
                };

                const formatUSDate = (dateVal) => {
                    if (!dateVal || dateVal === "N/A") return "N/A";
                    let dateStr = String(dateVal);
                    dateStr = dateStr.replace(/802(\d)/g, '202$1');
                    
                    let d = new Date(dateStr);
                    if (isNaN(d)) return dateStr;
                    let mm = (d.getMonth() + 1).toString().padStart(2, '0');
                    let dd = d.getDate().toString().padStart(2, '0');
                    let yyyy = d.getFullYear();
                    return `${mm}/${dd}/${yyyy}`;
                };

                const infoRows = Array.from(document.querySelectorAll('#Overview1 .md\\:flex'));
                infoRows.forEach(row => {
                    const labelDiv = row.querySelector('.inner-label');
                    const valueDiv = row.children[1];
                    if (!labelDiv || !valueDiv) return;

                    const label = labelDiv.textContent.trim();
                    if (label === 'Parcel ID') data.parcel_number = valueDiv.textContent.trim() || account;
                    if (label === 'Site Address') data.property_address = valueDiv.textContent.trim().replace(/\n/g, ', ');
                });

                const ownerLabels = Array.from(document.querySelectorAll('li.border .inner-label'));
                for (let lbl of ownerLabels) {
                    if (lbl.textContent.includes('CURRENT OWNER') || lbl.textContent.includes('Name')) {
                        const parentLi = lbl.closest('li');
                        if (parentLi) {
                            const nameRow = Array.from(parentLi.querySelectorAll('.md\\:flex')).find(r => r.querySelector('.inner-label')?.textContent.trim() === 'Name');
                            if (nameRow) {
                                data.owner_name = [nameRow.children[1].textContent.trim()];
                            }
                        }
                        break;
                    }
                }

                const assessPanel = document.querySelector('#Assessments1');
                if (assessPanel) {
                    const assessTables = assessPanel.querySelectorAll('table.table-bordered');
                    if (assessTables.length > 0) {
                        const trs = assessTables[0].querySelectorAll('tbody tr');
                        let foundTaxable = false;
                        let foundAssessed = false;
                        
                        for (let i = 0; i < trs.length; i++) {
                            const firstTd = trs[i].querySelector('td');
                            if (firstTd) {
                                const text = firstTd.textContent.trim().toLowerCase();
                                
                                if (text === 'total' && !foundTaxable) {
                                    const taxTds = trs[i].querySelectorAll('td');
                                    if (taxTds.length > 0) {
                                        data.total_taxable_value = formatCurrency(taxTds[taxTds.length - 1].textContent);
                                        foundTaxable = true;
                                    }
                                }
                                else if (text === 'total' && foundTaxable && !foundAssessed) {
                                    const assTds = trs[i].querySelectorAll('td');
                                    if (assTds.length > 0) {
                                        data.total_assessed_value = formatCurrency(assTds[assTds.length - 1].textContent);
                                        foundAssessed = true;
                                    }
                                }
                            }
                        }
                    }
                }

                // STEP 4: Payment History & Installment extraction
                const historyPanel = document.querySelector('#PaymentHistory1');
                if (historyPanel) {
                    const mainTableBody = historyPanel.querySelector('table.show-more > tbody');
                    if (mainTableBody) {
                        const allTopLevelTrs = Array.from(mainTableBody.children).filter(el => el.tagName.toLowerCase() === 'tr');
                        const mainRows = allTopLevelTrs.filter(tr => !tr.hasAttribute('data-subrow'));
                        const subRows = allTopLevelTrs.filter(tr => tr.hasAttribute('data-subrow'));

                        let tempHistory = [];

                        // ONLY loop through the precise indices we determined in the pre-check
                        for (let idx of targetIndices) {
                            const mRow = mainRows[idx];
                            const sRow = subRows[idx];
                            
                            if(!mRow) continue;

                            const mtds = mRow.querySelectorAll(':scope > td');
                            const unpaidAllYearsStr = mtds[4]?.textContent.trim() || "$0.00";
                            const isPaid = parseFloat(unpaidAllYearsStr.replace(/[$,]/g, '')) === 0;

                            let yearStr = (mtds[1]?.textContent.trim() || "").replace(/802(\d)/g, '202$1');
                            let fyYear = yearStr;
                            const dashMatch = yearStr.match(/(\d{4})\s*-\s*(\d{4})/);
                            if (dashMatch) {
                                fyYear = dashMatch[2]; 
                            } else {
                                const singleMatch = yearStr.match(/(\d{4})/);
                                if (singleMatch) fyYear = singleMatch[1];
                            }

                            let yearInstallments = [];
                            let extractedBaseYear = null;

                            if (sRow) {
                                const instPanels = Array.from(sRow.querySelectorAll(':scope .panel-info'));
                                
                                let basePaymentType = "ANNUAL";
                                if (instPanels.length === 4) basePaymentType = "INSTALLMENT";
                                else if (instPanels.length === 2) basePaymentType = "SEMI ANNUALLY";
                                
                                instPanels.forEach((panel, i) => {
                                    const instTds = panel.querySelector('table.table-bordered tbody tr.text-center')?.querySelectorAll('td');
                                    
                                    if (instTds && instTds.length >= 7) {
                                        let dueDateRaw = instTds[0].textContent.trim(); 
                                        const taxBilled = instTds[1].textContent.trim(); 
                                        const totalPaid = instTds[5].textContent.trim();
                                        const totalUnpaid = instTds[6].textContent.trim();
                                        
                                        let status = parseFloat(totalUnpaid.replace(/[$,]/g, '')) === 0 ? "PAID" : "DUE";

                                        let formattedDueDate = formatUSDate(dueDateRaw);
                                        let formattedDelqDate = "N/A";
                                        let formattedPaidDate = "N/A";

                                        if (formattedDueDate !== "N/A") {
                                            let dDate = new Date(formattedDueDate);
                                            if (!isNaN(dDate)) {
                                                if (i === 0) {
                                                    extractedBaseYear = dDate.getFullYear().toString();
                                                }
                                                dDate.setDate(dDate.getDate() + 11);
                                                formattedDelqDate = formatUSDate(dDate); 
                                            }
                                        }

                                        const paymentTable = Array.from(panel.querySelectorAll('table')).find(t => {
                                            const ths = Array.from(t.querySelectorAll('th'));
                                            return ths.some(th => th.textContent.includes('Receipt Date'));
                                        });

                                        if (paymentTable) {
                                            const pRows = Array.from(paymentTable.querySelectorAll('tr'));
                                            const pRow = pRows.find(tr => tr.querySelector('td')); 
                                            if (pRow) {
                                                const pTds = pRow.querySelectorAll('td');
                                                const ths = Array.from(paymentTable.querySelectorAll('th'));
                                                const dateIndex = ths.findIndex(th => th.textContent.includes('Receipt Date'));
                                                
                                                if (dateIndex !== -1 && pTds.length > dateIndex) {
                                                    const rawPaidDate = pTds[dateIndex].textContent.trim();
                                                    if (rawPaidDate && rawPaidDate !== '') {
                                                        formattedPaidDate = formatUSDate(rawPaidDate);
                                                    }
                                                } else if (pTds.length >= 2) { 
                                                    const rawPaidDate = pTds[1].textContent.trim();
                                                    if (rawPaidDate && rawPaidDate !== '') {
                                                        formattedPaidDate = formatUSDate(rawPaidDate);
                                                    }
                                                }
                                            }
                                        }

                                        // Delinquent Status Check based on Current Date
                                        if (status === "DUE" && formattedDelqDate !== "N/A") {
                                            const delqDateObj = new Date(formattedDelqDate);
                                            const todayDateObj = new Date();
                                            todayDateObj.setHours(0, 0, 0, 0);
                                            delqDateObj.setHours(0, 0, 0, 0);
                                            
                                            if (todayDateObj > delqDateObj) {
                                                status = "DELINQUENT";
                                            }
                                        }

                                        // Determine payment_type for this specific installment
                                        let installmentPaymentType = basePaymentType;
                                        if (basePaymentType === "INSTALLMENT") {
                                            const ordinals = ["1st", "2nd", "3rd", "4th"];
                                            installmentPaymentType = `${ordinals[i]} Installment`;
                                        }

                                        yearInstallments.push({
                                            jurisdiction: "County", 
                                            year: "TEMP", 
                                            payment_type: installmentPaymentType, 
                                            installment_number: i + 1, 
                                            status: status,
                                            base_amount: taxBilled,
                                            amount_paid: totalPaid,
                                            amount_due: totalUnpaid, 
                                            mailing_date: "N/A",
                                            due_date: formattedDueDate,
                                            delq_date: formattedDelqDate,
                                            paid_date: formattedPaidDate,  
                                            good_through_date: "-" 
                                        });
                                    }
                                });

                                let finalYear = extractedBaseYear || fyYear;
                                yearInstallments.forEach(inst => {
                                    inst.year = finalYear;
                                });
                            }

                            if (yearInstallments.length === 0) {
                                yearInstallments.push({
                                    jurisdiction: "County", 
                                    year: fyYear,
                                    payment_type: "ANNUAL", 
                                    installment_number: 1,
                                    status: isPaid ? "PAID" : "DUE",
                                    base_amount: formatCurrency(mtds[2]?.textContent.trim() || "$0.00"), 
                                    amount_paid: formatCurrency(mtds[3]?.textContent.trim() || "$0.00"), 
                                    amount_due: formatCurrency(unpaidAllYearsStr),
                                    penalty_interest: "$0.00",
                                    due_date: "N/A",
                                    delq_date: "N/A",
                                    paid_date: "N/A",
                                    good_through_date: "-"
                                });
                            }

                            if (yearInstallments.length > 0) {
                                tempHistory.push(...yearInstallments);
                            }
                        }

                        // Final Sort Output ASCENDING (Oldest to Newest)
                        data.tax_history = tempHistory.sort((a, b) => {
                            if (a.year !== b.year) {
                                return parseInt(a.year) - parseInt(b.year);
                            }
                            return (a.installment_number || 0) - (b.installment_number || 0);
                        });
                        
                        data.tax_history.forEach(item => {
                            delete item.installment_number;
                        });
                    }
                }

                // =========================================================
                // STEP 6: DYNAMIC NOTES & DELINQUENCY CALCULATIONS
                // =========================================================
                let generatedNotes = "";
                let delinquentStatus = "NONE";

                try {
                    if (data.tax_history.length > 0) {
                        const taxHistoryArray = data.tax_history;
                        
                        const allYears = taxHistoryArray.map(h => parseInt(h.year, 10));
                        const maxYear = Math.max(...allYears);
                        data.year = maxYear.toString();

                        const isAnyDelinquent = taxHistoryArray.some(h => h.status.toUpperCase().includes("DELINQUENT") || h.status.toUpperCase().includes("DUE"));
                        delinquentStatus = isAnyDelinquent ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF" : "NONE";

                        const isPriorYearPaid = !taxHistoryArray.some(h => h.year !== data.year && (h.status.toUpperCase().includes("DELINQUENT") || h.status.toUpperCase().includes("DUE")));
                        const currentYearInst = taxHistoryArray.filter(h => h.year === data.year);

                        let dynamicDueDatesNote = "";
                        let basePaymentType = "ANNUALLY";
                        let statusString = "";

                        if (currentYearInst.length === 4) {
                            basePaymentType = "4 INSTALLMENTS";
                            const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
                            const shortDueTwo = currentYearInst[1].due_date.substring(0, 5);
                            const shortDueThree = currentYearInst[2].due_date.substring(0, 5);
                            const shortDueFour = currentYearInst[3].due_date.substring(0, 5);
                            dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne}, ${shortDueTwo}, ${shortDueThree} AND ${shortDueFour}`;
                            
                            statusString = `${data.year} 1ST INSTALLMENT IS ${currentYearInst[0].status.toUpperCase()}, 2ND INSTALLMENT IS ${currentYearInst[1].status.toUpperCase()}, 3RD INSTALLMENT IS ${currentYearInst[2].status.toUpperCase()}, 4TH INSTALLMENT IS ${currentYearInst[3].status.toUpperCase()}`;
                        } else if (currentYearInst.length >= 2) {
                            basePaymentType = "SEMI ANNUALLY";
                            const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
                            const shortDueTwo = currentYearInst[1].due_date.substring(0, 5);
                            dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} AND ${shortDueTwo}`;
                            
                            statusString = `${data.year} 1ST INSTALLMENT IS ${currentYearInst[0].status.toUpperCase()}, 2ND INSTALLMENT IS ${currentYearInst[1].status.toUpperCase()}`;
                        } else if (currentYearInst.length === 1) {
                            basePaymentType = "ANNUALLY";
                            const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
                            dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
                            
                            statusString = `${data.year} TAXES ARE ${currentYearInst[0].status.toUpperCase()}`;
                        }

                        if (isAnyDelinquent) {
                            if (isPriorYearPaid) {
                                generatedNotes = `ALL PRIORS ARE PAID, ${data.year} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                            } else {
                                generatedNotes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                            }
                        } else {
                            generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        }
                    }
                    
                    data.notes = generatedNotes;
                    data.delinquent = delinquentStatus;

                } catch (err) {
                    data.notes = "System Output Error: " + err.message;
                    data.delinquent = "NONE";
                }

                return data;
            }, account, tax_auth, rowsToClickIndices);

            resolve(page_content);
        } catch(error) {
            console.log(error);
            reject(new Error("No Record Found"));
        }
    });
}

const account_search = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, baseUrl, account, tax_auth)
                .then((data1) => resolve(data1))
                .catch((error) => {
                    console.log(error);
                    reject(new Error(error.message));
                });
        } catch(error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
}

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
            if (req.resourceType() === 'font' || req.resourceType() === 'image' || req.resourceType() === 'stylesheet') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if(fetch_type == "html"){
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
            .finally(async() => { await context.close(); });
        }
    } catch(error) {
        console.log(error);
        if(fetch_type == "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
}

export { search }
