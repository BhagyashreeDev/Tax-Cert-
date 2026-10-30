// Author :- Vadiraj Joshi

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// UPDATED: Added due and delq dates to the county configuration
const county_data = {
    "forsyth": { url: "https://forsythproperty.assurancegov.com/Property/Search", auth: "Forsyth County, GA", due: "04/01", delq: "04/02" },
    "schley": { url: "https://schleyproperty.assurancegov.com/Property/Search", auth: "Schley County, GA", due: "12/31", delq: "01/01" },
    "seminole": { url: "https://seminoleproperty.assurancegov.com/Property/Search", auth: "Seminole County, GA", due: "05/01", delq: "05/02" },
    "carroll": { url: "https://carrollproperty.assurancegov.com/Property/Search", auth: "Carroll County, GA", due: "04/01", delq: "04/02" },
    "emanuel": { url: "https://emanuelproperty.assurancegov.com/Property/Search", auth: "Emanuel County, GA", due: "01/20", delq: "01/21" },
    "walker": { url: "https://walkerproperty.assurancegov.com/Property/Search", auth: "Walker County, GA", due: "04/01", delq: "04/02" },
    "grady": { url: "https://gradyproperty.assurancegov.com/Property/Search", auth: "Grady County, GA", due: "04/01", delq: "04/02" },
    "long": { url: "https://longproperty.assurancegov.com/Property/Search", auth: "Long County, GA", due: "06/01", delq: "06/02" },
    "burke": { url: "https://burkeproperty.assurancegov.com/Property/Search", auth: "Burke County, GA", due: "04/01", delq: "04/02" },
    "dade": { url: "https://dadeproperty.assurancegov.com/Property/Search", auth: "Dade County, GA", due: "04/01", delq: "04/02" },
    "toombs": { url: "https://toombsproperty.assurancegov.com/Property/Search", auth: "Toombs County, GA", due: "12/20", delq: "12/21" },
    "jasper": { url: "https://jasperproperty.assurancegov.com/Property/Search", auth: "Jasper County, GA", due: "12/20", delq: "12/21" },
    "lee": { url: "https://leeproperty.assurancegov.com/Property/Search", auth: "Lee County, GA", due: "12/20", delq: "12/21" },
    "spalding": { url: "https://spaldingproperty.assurancegov.com/Property/Search", auth: "Spalding County, GA", due: "12/20", delq: "12/21" },
    "gordon": { url: "https://gordonproperty.assurancegov.com/Property/Search", auth: "Gordon County, GA", due: "12/20", delq: "12/21" }
};


const timeout_option = {
    timeout: 90000
};

const get_half_amount = (amount) => {
    let num = String(amount).replace(/[$,]/g, "");
    let half = (num / 2).toFixed(2);
    return "$" + half;
}

const ac_1 = async (page, url, account, tax_auth, due_base, delq_base) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded" });

            // STEP 1: Select the radio button for Parcel
            await page.waitForSelector("#parcel", timeout_option);
            await page.evaluate(() => {
                const parcelRadio = document.getElementById("parcel");
                if (parcelRadio) parcelRadio.click();
            });

            // STEP 2: Type the parcel number
            await page.waitForSelector("#pt-search-editor-1", timeout_option);
            await page.locator("#pt-search-editor-1").fill(account);

            // STEP 3: Click search
            await page.evaluate(() => {
                const searchBtn = document.getElementById("pt-search-button");
                if (searchBtn) searchBtn.click();
            });

            // STEP 4: Handle multiple rows by selecting the one with the highest year
            const detailsBtnSelector = 'a.btn.btn-primary[href*="/Property/Summary"]';
            await page.waitForSelector(detailsBtnSelector, timeout_option);
            
            const targetIndex = await page.evaluate((sel) => {
                const buttons = Array.from(document.querySelectorAll(sel));
                if (buttons.length === 0) return -1;
                
                let maxYear = -1;
                let bestIndex = 0;

                buttons.forEach((btn, index) => {
                    const tr = btn.closest("tr");
                    if (tr) {
                        const tds = tr.querySelectorAll("td");
                        if (tds.length > 5) {
                            const yearNum = parseInt(tds[5].textContent.trim(), 10);
                            if (!isNaN(yearNum) && yearNum > maxYear) {
                                maxYear = yearNum;
                                bestIndex = index;
                            }
                        }
                    }
                });
                return bestIndex;
            }, detailsBtnSelector);

            if (targetIndex === -1) {
                return reject(new Error("No Record Found"));
            }

            // SET UP LISTENER FOR THE NEW TAB
            const context = page.browserContext();
            const newPagePromise = new Promise(resolve => {
                context.once('targetcreated', async target => {
                    if (target.type() === 'page') {
                        resolve(await target.page());
                    }
                });
            });

            // CLICK THE SPECIFIC DETAILS BUTTON FOR THE LATEST YEAR
            await page.evaluate((sel, idx) => {
                const buttons = document.querySelectorAll(sel);
                if (buttons[idx]) buttons[idx].click();
            }, detailsBtnSelector, targetIndex);

            // WAIT FOR AND SWITCH TO THE NEW TAB
            const newPage = await newPagePromise;
            await newPage.bringToFront();
            
            // Wait SPECIFICALLY for the Tax History table to finish loading via AJAX
            await newPage.waitForFunction(() => {
                const tables = document.querySelectorAll("table");
                for (let t of tables) {
                    const caption = t.querySelector("caption");
                    if (caption && caption.textContent.toLowerCase().includes("tax history")) return true;
                    if (t.textContent.includes("YEAR") && t.textContent.includes("OWNER(S)")) return true;
                }
                return false;
            }, timeout_option).catch(e => console.log("Tax history wait timeout."));

            // STEP 5, 6 & 7: Extract data from the NEW page
            const page_content = await newPage.evaluate((account, tax_auth, due_base, delq_base) => {
                
                // UPDATED: Added fallback string parameter to return N/A if it is just "$" or empty
                const formatUSCurrency = (amountStr, fallbackStr = "N/A") => {
                    let numStr = String(amountStr).replace(/[^0-9.-]+/g, "");
                    if (numStr === "") return fallbackStr;
                    
                    let num = parseFloat(numStr);
                    if (isNaN(num)) return fallbackStr;
                    
                    if (num === 0) return "$0.00"; 
                    
                    let hasDecimals = num % 1 !== 0;
                    return new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: hasDecimals ? 2 : 0,
                        maximumFractionDigits: 2
                    }).format(num);
                };

                const data = {
                    processed_date : "",
                    order_number : "",
                    borrower_name: "",
                    owner_name: ['N/A'],
                    property_address: "N/A",
                    parcel_number: account,
                    land_value: "",
                    improvements: "",
                    total_assessed_value: "$0.00",
                    exemption: "",
                    total_taxable_value: "$0.00",
                    taxing_authority: tax_auth,
                    notes: "",
                    delinquent: "NONE",              
                    tax_history: []
                };

                // STEP 5: Extract Owner, Address, and other summary fields
                const summaryRows = document.querySelectorAll("table tbody tr");
                summaryRows.forEach(tr => {
                    const th = tr.querySelector("th.pt-table-left-hdr");
                    const td = tr.querySelector("td");
                    if (th && td) {
                        const header = th.textContent.trim().toUpperCase();
                        const val = td.textContent.trim();
                        
                        if (header === "OWNER") data.owner_name = [val];
                        if (header === "PROPERTY ADDRESS") data.property_address = val || "N/A";
                        if (header === "EXEMPT CODE") data.exemption = val;
                    }
                });

                // Extract global LAST PAYMENT DATE specifically for the latest year
                let globalLastPaymentDate = null;
                const paymentInfoDivs = document.querySelectorAll(".pt-summary-payment-info");
                paymentInfoDivs.forEach(div => {
                    const text = div.textContent.trim();
                    if (text.toUpperCase().includes("LAST PAYMENT DATE")) {
                        const match = text.match(/DATE\s+(.*)/i);
                        if (match && match[1]) {
                            globalLastPaymentDate = match[1].trim();
                        }
                    }
                });

                // Extract specialized tax details mapping from pt-taxinfo-table
                const taxInfoMap = {};
                const taxInfoTables = document.querySelectorAll("table.pt-taxinfo-table");
                taxInfoTables.forEach(table => {
                    const rows = table.querySelectorAll("tbody tr");
                    rows.forEach(tr => {
                        const tds = tr.querySelectorAll("td");
                        if (tds.length >= 8) {
                            const year = tds[1].textContent.trim();
                            const baseTax = tds[3].textContent.trim();
                            const amtPaid = tds[6].textContent.trim();
                            const balDue = tds[7].textContent.trim();
                            taxInfoMap[year] = { baseTax, amtPaid, balDue };
                        }
                    });
                });

                // STEP 6 & 7: Extract Tax History Table & Generate Custom Notes
                const allTables = document.querySelectorAll("table");
                let taxTable = null;
                allTables.forEach(t => {
                    const caption = t.querySelector("caption");
                    if (caption && caption.textContent.toLowerCase().includes("tax history")) {
                        taxTable = t;
                    } else if (t.textContent.includes("YEAR") && t.textContent.includes("OWNER(S)")) {
                        taxTable = t;
                    }
                });

                if (taxTable) {
                    const tbody = taxTable.querySelector("tbody");
                    if (tbody) {
                        const rawRows = Array.from(tbody.querySelectorAll("tr"));
                        let validRecords = [];
                        
                        for (let i = 0; i < rawRows.length; i++) {
                            const tr = rawRows[i];
                            const tds = tr.querySelectorAll("td");
                            if (tds.length >= 6) {
                                const year = tds[0].textContent.trim();
                                const totalTax = tds[2].textContent.trim();
                                const paidRaw = tds[3].textContent.trim();
                                const assessed = tds[5].textContent.trim();
                                const isPaidStr = paidRaw.toUpperCase().startsWith("Y");
                                
                                validRecords.push({ year, totalTax, paidRaw, assessed, isPaidStr });
                            }
                        }

                        Object.keys(taxInfoMap).forEach(infoYear => {
                            if (!validRecords.find(r => r.year === infoYear)) {
                                const info = taxInfoMap[infoYear];
                                const balDueNum = parseFloat(info.balDue.replace(/[^0-9.-]+/g, ""));
                                const isPaidStr = (balDueNum === 0);
                                
                                // UPDATED: Prevent passing empty string if there's no digit
                                let prevAssessed = validRecords.length > 0 ? validRecords[0].assessed : "N/A";
                                if (prevAssessed.replace(/[^0-9.-]+/g, "") === "") prevAssessed = "N/A";

                                validRecords.push({
                                    year: infoYear,
                                    totalTax: info.baseTax,
                                    paidRaw: isPaidStr ? "Y" : "N",
                                    assessed: prevAssessed,
                                    isPaidStr: isPaidStr
                                });
                            }
                        });

                        validRecords.sort((a, b) => parseInt(b.year, 10) - parseInt(a.year, 10));

                        let foundPaid = false;
                        let isPriorYearPaid = true;
                        let primaryYearStatus = "";
                        let yearVal = "";
                        let today = new Date();

                        validRecords.forEach((record, index) => {
                            if (foundPaid) return; 

                            let status = "DUE";
                            let paid_date = "";
                            
                            if (record.isPaidStr) {
                                status = "PAID";
                                const parts = record.paidRaw.split(/[\s\u00A0]+/);
                                if (parts.length > 1) {
                                    paid_date = parts[1];
                                }
                            }

                            const parsedYear = parseInt(record.year, 10);

                            const delqParts = delq_base.split('/');
                            const delqMonth = parseInt(delqParts[0], 10) - 1; 
                            const delqDay = parseInt(delqParts[1], 10);
                            const delqDateObj = new Date(parsedYear, delqMonth, delqDay); 

                            if (status !== "PAID" && today > delqDateObj) {
                                status = "DELINQUENT";
                            }

                            // UPDATED: Apply N/A specifically to Assessed value if blank or "$"
                            const formattedAssessed = formatUSCurrency(record.assessed, "N/A");
                            const formattedTotalTax = formatUSCurrency(record.totalTax, "$0.00");

                            if (index === 0) {
                                data.total_assessed_value = formattedAssessed;
                                data.total_taxable_value = formattedAssessed; 
                                yearVal = record.year; 
                                primaryYearStatus = status; 
                            } else {
                                if (status !== "PAID") {
                                    isPriorYearPaid = false; 
                                }
                            }

                            let mappedBaseAmount = formattedTotalTax;
                            let mappedAmountPaid = status === "PAID" ? formattedTotalTax : "$0.00";
                            let mappedAmountDue = status !== "PAID" ? formattedTotalTax : "$0.00";
                            
                            let mappedPaidDate = paid_date || "N/A";
                            if (index === 0 && globalLastPaymentDate) {
                                mappedPaidDate = globalLastPaymentDate;
                            }

                            mappedPaidDate = mappedPaidDate.replace(/\*/g, "").trim();

                            if (taxInfoMap[record.year]) {
                                mappedBaseAmount = formatUSCurrency(taxInfoMap[record.year].baseTax, "$0.00");
                                mappedAmountPaid = formatUSCurrency(taxInfoMap[record.year].amtPaid, "$0.00");
                                mappedAmountDue = formatUSCurrency(taxInfoMap[record.year].balDue, "$0.00");
                            }

                            const th_obj = {
                                jurisdiction: "County",
                                year: record.year,
                                payment_type: "Annual",
                                status: status,
                                base_amount: mappedBaseAmount,
                                amount_paid: mappedAmountPaid,
                                amount_due: mappedAmountDue,
                                mailing_date: "N/A",
                                due_date: `${due_base}/${record.year}`,
                                delq_date: `${delq_base}/${record.year}`,
                                paid_date: mappedPaidDate,
                                good_through_date: "",
                            };

                            if (status === "PAID") {
                                if (index === 0) {
                                    data.tax_history.push(th_obj);
                                }
                                foundPaid = true; 
                            } else {
                                data.tax_history.push(th_obj);
                            }
                        });

                        data.tax_history.reverse();

                        let basePaymentType = "ANNUALLY";
                        let dynamicDueDatesNote = `NORMAL DUE DATE IS ${due_base}`;
                        let generatedNotes = "";

                        if (!isPriorYearPaid) {
                            generatedNotes = `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                            data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
                        } else {
                            if (primaryYearStatus === "DELINQUENT") {
                                generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                                data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
                            } else if (primaryYearStatus === "DUE") {
                                generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DUE, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                                data.delinquent = "NONE";
                            } else {
                                generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                                data.delinquent = "NONE";
                            }
                        }

                        data.notes = generatedNotes;
                    }
                }

                return data;
            }, account, tax_auth, due_base, delq_base);

            resolve(page_content);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
}

const account_search = async (page, targetUrl, account, tax_auth, due_base, delq_base) => {
    return new Promise(async (resolve, reject) => {
        try {            
            ac_1(page, targetUrl, account, tax_auth, due_base, delq_base)
            .then((data1) => {
                resolve(data1);
            })
            .catch((error) => {
                console.log(error);
                reject(new Error(error.message));
            });

        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
}

const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    
    if (account) account = account.replace(/[^a-zA-Z0-9]/g, "");

    try {
        const req_county = req.path.replace(/\//g, "").toLowerCase();

        if (!county_data[req_county]) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid or unsupported county."
            });
        }
        
        const url = county_data[req_county].url;
        const tax_auth = county_data[req_county].auth;
        const due_base = county_data[req_county].due;
        const delq_base = county_data[req_county].delq;

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

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
            account_search(page, url, account, tax_auth, due_base, delq_base)
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
            account_search(page, url, account, tax_auth, due_base, delq_base)
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
