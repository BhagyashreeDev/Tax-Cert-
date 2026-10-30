// Author :- Vadiraj Joshi

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "lawrence": {
        url: "https://lawrenceproperty.countygovservices.com/Property/Search",
        auth: "Lawrence County, AL"
    },
    "cullman": {
        url: "https://cullmanproperty.countygovservices.com/Property/Search",
        auth: "Cullman County, AL"
    },
    "marshall": {
        url: "https://marshall.countygovservices.com/Property/Property/Search",
        auth: "Marshall County, AL"
    },
    "cherokee": {
        url: "https://cherokeeproperty.countygovservices.com/Property/Search",
        auth: "Cherokee County, AL"
    },
    "colbert": {
        url: "https://colbertproperty.assurancegov.com/Property/Search",
        auth: "Colbert County, AL"
    },
    "clarke": {
        url: "https://clarkeproperty.countygovservices.com/Property/Search",
        auth: "Clarke County, AL"
    },
    "etowah": {
        url: "https://etowahproperty.assurancegov.com/Property/Search",
        auth: "Etowah County, AL"
    },
    "talladega": {
        url: "https://talladegaproperty.countygovservices.com/Property/Property/Search",
        auth: "Talladega County, AL"
    },
    "dekalb": {
        url: "https://dekalbproperty.assurancegov.com/Property/Search",
        auth: "DeKalb County, AL"
    },
    "franklin": {
        url: "https://franklinproperty.countygovservices.com/Property/Search",
        auth: "Franklin County, AL"
    },
    "winston": {
        url: "https://winstonproperty.assurancegov.com/Property/Search",
        auth: "Winston County, AL"
    }
};

const timeout_option = {
    timeout: 90000
};

const get_half_amount = (amount) => {
    let num = String(amount).replace(/[$,]/g, "");
    let half = (num / 2).toFixed(2);
    return "$" + half;
}

const ac_1 = async (page, url, account, tax_auth) => {
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

            // STEP 4: Wait specifically for the DETAILS anchor tag to render in the grid
            const detailsBtnSelector = 'a.btn.btn-primary[href*="/Property/Summary"]';
            await page.waitForSelector(detailsBtnSelector, timeout_option);
            
            const detailsResult = await page.evaluate((sel) => {
                const detailsButtons = document.querySelectorAll(sel);
                return { count: detailsButtons.length };
            }, detailsBtnSelector);

            if (detailsResult.count === 0) {
                return reject(new Error("No Record Found"));
            } else if (detailsResult.count > 1) {
                return reject(new Error("Multiple accounts of same parcel number"));
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

            // CLICK THE DETAILS BUTTON USING NATIVE PUPPETEER CLICK
            await page.click(detailsBtnSelector);

            // WAIT FOR AND SWITCH TO THE NEW TAB
            const newPage = await newPagePromise;
            await newPage.bringToFront();
            
            // Wait SPECIFICALLY for the Tax History table to finish loading via AJAX
            await newPage.waitForFunction(() => {
                const tables = document.querySelectorAll("table");
                for (let t of tables) {
                    const caption = t.querySelector("caption");
                    if (caption && caption.textContent.toLowerCase().includes("tax history")) {
                        return true;
                    }
                    if (t.textContent.includes("YEAR") && t.textContent.includes("OWNER(S)")) {
                        return true;
                    }
                }
                return false;
            }, timeout_option).catch(e => console.log("Tax history wait timeout."));

            // STEP 5, 6 & 7: Extract data from the NEW page
            const page_content = await newPage.evaluate((account, tax_auth) => {
                
                // Helper to strictly format amounts to US currency standards (e.g., $100,000)
                const formatUSCurrency = (amountStr) => {
                    let num = parseFloat(String(amountStr).replace(/[^0-9.-]+/g, ""));
                    if (isNaN(num)) return amountStr;
                    // Retain decimals if they exist, otherwise format as whole numbers
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
                        if (header === "PROPERTY ADDRESS") data.property_address = val;
                        if (header === "EXEMPT CODE") data.exemption = val;
                    }
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
                        
                        // Extract all rows cleanly
                        for (let i = 0; i < rawRows.length; i++) {
                            const tr = rawRows[i];
                            const tds = tr.querySelectorAll("td");
                            if (tds.length >= 7) {
                                const year = tds[0].textContent.trim();
                                const totalTax = tds[2].textContent.trim();
                                const paidRaw = tds[3].textContent.trim();
                                const assessed = tds[6].textContent.trim();
                                const isPaidStr = paidRaw.startsWith("Y");
                                
                                validRecords.push({ year, totalTax, paidRaw, assessed, isPaidStr });
                            }
                        }

                        let foundPaid = false;
                        let isPriorYearPaid = true;
                        let primaryYearStatus = "";
                        let yearVal = "";
                        let today = new Date();

                        validRecords.forEach((record, index) => {
                            if (foundPaid) return; 

                            let status = "DUE";
                            let paid_date = "";
                            
                            // Parse the "PAID (Y/N)" column
                            if (record.isPaidStr) {
                                status = "PAID";
                                const parts = record.paidRaw.split(/[\s\u00A0]+/);
                                if (parts.length > 1) {
                                    paid_date = parts[1];
                                }
                            }

                            // Calculate Delinquent Date (12/31/YYYY)
                            const parsedYear = parseInt(record.year, 10);
                            const delqDateObj = new Date(parsedYear, 11, 31); // Month 11 is December

                            // If unpaid and past delinquent date, tag as delinquent
                            if (status !== "PAID" && today > delqDateObj) {
                                status = "DELINQUENT";
                            }

                            // Format numerical values specifically to standard US styling
                            const formattedAssessed = formatUSCurrency(record.assessed);
                            const formattedTotalTax = formatUSCurrency(record.totalTax);

                            // Process the active primary year
                            if (index === 0) {
                                data.total_assessed_value = formattedAssessed;
                                data.total_taxable_value = formattedAssessed; 
                                yearVal = record.year; 
                                primaryYearStatus = status; 
                            } else {
                                // If any year after the first is unpaid, priors are delinquent
                                if (status !== "PAID") {
                                    isPriorYearPaid = false; 
                                }
                            }

                            const th_obj = {
                                jurisdiction: "County",
                                year: record.year,
                                payment_type: "Annual",
                                status: status,
                                base_amount: formattedTotalTax,
                                amount_paid: status === "PAID" ? formattedTotalTax : "$0.00",
                                amount_due: status !== "PAID" ? formattedTotalTax : "$0.00",
                                mailing_date: "N/A",
                                due_date: `10/01/${record.year}`,
                                delq_date: `01/01/${Number(record.year) + 1}`,
                                paid_date: paid_date || "N/A",
                                good_through_date: "",
                            };

                            if (status === "PAID") {
                                if (index === 0) {
                                    // If the primary active year is already paid, add it
                                    data.tax_history.push(th_obj);
                                }
                                foundPaid = true; 
                            } else {
                                // Add unpaid years
                                data.tax_history.push(th_obj);
                            }
                        });

                        // Reverses the collected array so older unpaid years come first (Ascending)
                        // If it's just 1 paid year, reverse() does nothing to it.
                        data.tax_history.reverse();

                        // GENERATE THE SPECIFIC NOTES LOGIC
                        let basePaymentType = "ANNUALLY";
                        let dynamicDueDatesNote = "NORMAL DUE DATE IS 10/01";
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
            }, account, tax_auth);

            resolve(page_content);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
}

const account_search = async (page, targetUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {            
            ac_1(page, targetUrl, account, tax_auth)
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
    // Destructure and instantly trim the account string to prevent whitespace issues
    let { fetch_type, account } = req.body;
    if (account) account = account.trim();

    try {
        // Automatically extracts the county name from the path (e.g., "/lawrence" -> "lawrence")
        const req_county = req.path.replace(/\//g, "").toLowerCase();

        if (!county_data[req_county]) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid or unsupported county."
            });
        }
        const url = county_data[req_county].url;
        const tax_auth = county_data[req_county].auth;

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
            // FRONTEND ENDPOINT
            account_search(page, url, account, tax_auth)
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
            // API ENDPOINT
            account_search(page, url, account, tax_auth)
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
