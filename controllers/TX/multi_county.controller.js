// AUTHOR: Vadiraj Joshi

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "atascosa": { url: "https://esearch.atascosacountytax.com", auth: "Atascosa County, TX" },
    "bandera": { url: "https://esearch.banderacounty.org", auth: "Bandera County, TX" },
    "brewster": { url: "https://esearch.brewstercotad.org", auth: "Brewster County, TX" },
    "caldwell": { url: "https://esearch.caldwellcad.org", auth: "Caldwell County, TX" },
    "calhoun": { url: "https://esearch.calhouncad.org", auth: "Calhoun County, TX" },
    "camp": { url: "https://esearch.campcad.org", auth: "Camp County, TX" },
    "dallam": { url: "https://esearch.dallamcad.org", auth: "Dallam County, TX" },
    "dimmit": { url: "https://esearch.dimmitcounty.org", auth: "Dimmit County, TX" },
    "edwards": { url: "https://esearch.edwardscad.org", auth: "Edwards County, TX" },
    "falls": { url: "https://esearch.fallscad.net", auth: "Falls County, TX" },
    "gillespie": { url: "https://esearch.gillespiecad.org", auth: "Gillespie County, TX" },
    "howard": { url: "https://esearch.howardcad.org", auth: "Howard County, TX" },
    "kendall": { url: "https://esearch.kendallad.org", auth: "Kendall County, TX" },
    "kenedy": { url: "https://esearch.kenedycad.org", auth: "Kenedy County, TX" },
    "kerr": { url: "https://esearch.co.kerr.tx.us", auth: "Kerr County, TX" },
    "lamb": { url: "https://esearch.lambcad.org", auth: "Lamb County, TX" },
    "lampasas": { url: "https://esearch.lampasascad.com", auth: "Lampasas County, TX" },
    "llano": { url: "https://esearch.llanocad.net", auth: "Llano County, TX" },
    "parmer": { url: "https://esearch.parmercad.org", auth: "Parmer County, TX" },
    "polk": { url: "https://esearch.polk-tax.com", auth: "Polk County, TX" },
    "rains": { url: "https://esearch.rainscad.org", auth: "Rains County, TX" },
    "real": { url: "https://esearch.realcad.org", auth: "Real County, TX" }, 
    "schleicher": { url: "https://esearch.schleichercad.org", auth: "Schleicher County, TX" },
    "shackelford": { url: "https://esearch.shackelfordcad.com", auth: "Shackelford County, TX" },
    "walker": { url: "https://esearch.walkercad.org", auth: "Walker County, TX" },
    "yoakum": { url: "https://esearch.yoakumcad.org", auth: "Yoakum County, TX" },
    "zapata": { url: "https://esearch.zapatacad.com", auth: "Zapata County, TX" },
    "bell": { url: "https://esearchgsa.bellcad.org", auth: "Bell County, TX" },
    "burleson": { url: "https://esearch.burlesoncountytax.org", auth: "Burleson County, TX" },
    "burnet": { url: "https://esearch.burnet-cad.org/", auth: "Burnet County, TX" }, 
    "colorado": { url: "https://esearch.coloradocad.org", auth: "Colorado County, TX" }, 
    "deafsmith": { url: "https://esearch.deafsmithcad.org", auth: "Deaf Smith County, TX" },
    "delta": { url: "https://esearch.delta-cad.org", auth: "Delta County, TX" },
    "fayette": { url: "https://esearch.fayettecad.org", auth: "Fayette County, TX" }, 
    "gaines": { url: "https://esearch.gainescad.org", auth: "Gaines County, TX" },
    "garza": { url: "https://esearch.garzacad.org", auth: "Garza County, TX" },
    "hale": { url: "https://esearch.halecad.org", auth: "Hale County, TX" },
    "hill": { url: "https://esearch.hilltax.org", auth: "Hill County, TX" }, 
    "hudspeth": { url: "https://esearch.hudspethcad.org", auth: "Hudspeth County, TX" }, 
    "lamar": { url: "https://esearch.lamarcad.org", auth: "Lamar County, TX" }, 
    "lee": { url: "https://esearch.leetax.org", auth: "Lee County, TX" }, 
    "mcmullen": { url: "https://esearch.mcmullencad.org", auth: "McMullen County, TX" }, 
    "newton": { url: "https://esearch.newtontax.org", auth: "Newton County, TX" }, 
    "sutton": { url: "https://esearch.suttoncad.com", auth: "Sutton County, TX" },
    "swisher": { url: "https://esearch.swisher-cad.org", auth: "Swisher County, TX" },    
    "throckmorton": { url: "https://esearch.throckmortoncad.org", auth: "Throckmorton County, TX" }, 
    "uvalde": { url: "https://esearch.uvaldecad.org", auth: "Uvalde County, TX" },
    "young": { url: "https://esearch.youngcad.org", auth: "Young County, TX" }, 
    "zavala": { url: "https://esearch.zavalacad.com", auth: "Zavala County, TX" },
    "wilson": { url : "https://esearch.wilson-cad.org/",  auth: "Wilson County, TX" }
};

const timeout_option = { timeout: 90000 };

const ac_1 = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            const targetUrl = `${baseUrl}/Property/View/${account}`;
            
            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeout_option.timeout });

            await page.waitForSelector("table.table-bordered", timeout_option);

            const page_content = await page.evaluate((account, authName) => {
                const data = {
                    processed_date : new Date().toLocaleDateString(),
                    order_number : "",
                    borrower_name: "",
                    owner_name: ['N/A'],
                    property_address: "N/A",
                    parcel_number: account,
                    land_value: "",
                    improvements: "",
                    total_assessed_value: "",
                    exemption: "",
                    total_taxable_value: "",
                    taxing_authority: authName, 
                    notes: "",
                    delinquent: "NONE",              
                    tax_history: []
                };

                // STEP 2 & 3: Extract Parcel No, Address, and Owner Name
                const ths = Array.from(document.querySelectorAll('th'));
                ths.forEach(th => {
                    const text = th.textContent.trim();
                    if (text === 'Property ID:') {
                        data.parcel_number = th.nextElementSibling?.textContent.trim() || account;
                    } else if (text === 'Situs Address:') {
                        data.property_address = th.nextElementSibling?.textContent.trim() || "N/A";
                    } else if (text === 'Name:') {
                        const owner = th.nextElementSibling?.textContent.trim();
                        if (owner) data.owner_name = [owner];
                    }
                });

                // STEP 5: Dynamically extract Assessed Value
                const allThElements = Array.from(document.querySelectorAll('table th'));
                const assessedTh = allThElements.find(th => th.textContent.trim() === 'Assessed');
                
                if (assessedTh) {
                    const targetTable = assessedTh.closest('table');
                    const siblingThs = Array.from(assessedTh.parentElement.children);
                    const columnIndex = siblingThs.indexOf(assessedTh);

                    if (columnIndex !== -1) {
                        const firstDataRow = targetTable.querySelector('tbody tr:not(:first-child)') || targetTable.querySelectorAll('tr')[1];
                        if (firstDataRow) {
                            const tds = firstDataRow.querySelectorAll('td');
                            if (tds[columnIndex]) {
                                data.total_assessed_value = tds[columnIndex].textContent.trim();
                                data.total_taxable_value = data.total_assessed_value; 
                            }
                        }
                    }
                }

                // STEP 4: Extract Tax History (Looping backward until Paid)
                const yearRows = document.querySelectorAll('tr[id^="propertyBillDataContainer-"]');
                let isPriorYearPaid = true;
                let primaryYearStatus = "";
                let yearVal = "";

                // FALLBACK LOGIC: If no rows are present, return N/A defaults
                if (yearRows.length === 0) {
                    data.tax_history.push({
                        jurisdiction: "County",
                        year: "N/A",
                        payment_type: "N/A",
                        status: "N/A",
                        base_amount: "N/A",
                        amount_paid: "N/A",
                        amount_due: "N/A",
                        due_date: "N/A",
                        delq_date: "N/A",
                        paid_date: "N/A"
                    });
                } else {
                    for (let i = 0; i < yearRows.length; i++) {
                        const row = yearRows[i];
                        const year = row.getAttribute('data-property-year');
                        if (i === 0) yearVal = year;

                        const tds = Array.from(row.querySelectorAll('td'));
                        const isPaidBadge = row.querySelector('.label .fa-check') !== null || row.textContent.includes('Paid');
                        
                        let amountDueStr = tds[tds.length - 1]?.textContent.trim() || "$0.00";
                        let baseAmountStr = tds[tds.length - 6]?.textContent.trim() || "$0.00";
                        let amountPaidStr = tds[tds.length - 5]?.textContent.trim() || "$0.00";
                        
                        let numericDue = parseFloat(amountDueStr.replace(/[$,]/g, '')) || 0;
                        let status = (isPaidBadge || numericDue === 0) ? "PAID" : "DELINQUENT";

                        if (i === 0) { primaryYearStatus = status; }

                        let nextYear = parseInt(year) + 1;

                        const historyItem = {
                            jurisdiction: "County", 
                            year: year,
                            payment_type: "ANNUAL", 
                            status: status,
                            base_amount: baseAmountStr,
                            amount_paid: amountPaidStr,
                            amount_due: amountDueStr,
                            mailing_date: "",
                            due_date: `01/31/${nextYear}`,
                            delq_date: `02/01/${nextYear}`,
                            paid_date: "N/A",
                            good_through_date: ""
                        };

                        // STOPS EXTRACTION BEFORE PUSHING BLOCKED ROWS
                        if (status === "PAID") {
                            if (i === 0) {
                                // Rule 1: First row is paid -> include it and stop
                                data.tax_history.push(historyItem);
                            }
                            // Rule 2: Subsequent row is paid -> stop immediately WITHOUT pushing
                            break;
                        } 

                        // Only runs if the status is DELINQUENT / DUE
                        data.tax_history.push(historyItem);
                        if (i > 0) isPriorYearPaid = false;
                    }

                    // Sort the extracted array in ascending order based on the year (e.g., 2024, 2025, 2026)
                    data.tax_history.sort((a, b) => parseInt(a.year) - parseInt(b.year));
                }

                // STEP 6: Apply the specific Notes Logic
                let basePaymentType = "ANNUAL"; 
                let dynamicDueDatesNote = "NORMAL DUE DATE IS 01/31";
                let generatedNotes = "";

                // Note generation is modified slightly to handle the fallback case where yearVal is empty
                if (yearRows.length === 0) {
                    data.notes = "NO TAX DATA AVAILABLE";
                    data.delinquent = "NONE";
                } else if (!isPriorYearPaid) {
                    generatedNotes = `PRIORS ARE DELINQUENT, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
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
                    data.notes = generatedNotes;
                }

                return data;
            }, account, tax_auth);

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
            return res.status(404).json({ error: true, message: "County not configured or route mismatch." });
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
