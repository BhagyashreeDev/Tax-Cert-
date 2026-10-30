// Author :- Vadiraj Joshi
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Dedicated Mapping for New UI Layout Style Counties (CAD Portals)
const county_data = {
    "mills": { url: "https://esearch.millscad.org", auth: "Mills County, TX" },
    "concho": { url: "https://esearch.conchocad.org", auth: "Concho County, TX" },
    "houston": { url: "https://esearch.houstoncountytaxoffice.com", auth: "Houston County, TX" },
    "hunt": { url: "https://esearch.hctax.info", auth: "Hunt County, TX" },
    "kimble": { url: "https://esearch.kimblecad.org", auth: "Kimble County, TX" },
    "kinney": { url: "https://esearch.kinneycad.org", auth: "Kinney County, TX" },
    "mason": { url: "https://esearch.masoncad.org", auth: "Mason County, TX" },
    "matagorda": { url: "https://esearch.matagorda-cad.org", auth: "Matagorda County, TX" },
    "callahan": { url: "https://esearch.callahancad.org", auth: "Callahan County, TX" },
    "washington": { url: "https://esearch.washingtoncad.org", auth: "Washington County, TX" },
    "taylor": { url: "https://esearch.taylor-cad.org", auth: "Taylor County, TX" },
    "nacogdoches": { url: "https://esearch.nacocad.org", auth: "Nacogdoches County, TX" },
    "cochran": { url: "https://esearch.cochrancad.com", auth: "Cochran County, TX" },
    "titus": { url: "https://esearch.co.titus.tx.us", auth: "Titus County, TX" },
    "colorado": { url: "https://esearch.coloradocad.org", auth: "Colorado County, TX" },
    "marion": { url: "https://esearch.marioncountytaxoffice.com", auth: "Marion County, TX" },
    "moore": { url: "https://esearch.moorecad.org", auth: "Moore County, TX" },
    "aransas": { url: "https://esearch.aransascad.org", auth: "Aransas County, TX" },
    "borden": { url : "https://esearch.bordencad.org/",  auth: "Borden County, TX" }
};

const timeout_option = { timeout: 90000 };

const ac_1 = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            const targetUrl = `${baseUrl}/Property/View/${account.trim()}`;
            
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
                    total_assessed_value: "N/A", // Default to N/A
                    exemption: "",
                    total_taxable_value: "N/A",  // Default to N/A
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

                // STEP 4: Extract Tax History (Looping backward until Paid)
                const allTrs = Array.from(document.querySelectorAll('table tr'));
                const totalRows = allTrs.filter(tr => tr.textContent.includes('Total:'));

                let isPriorYearPaid = true;
                let primaryYearStatus = "";
                let yearVal = "";
                
                // Track years to avoid duplicates from responsive/hidden mobile tables
                const seenYears = new Set(); 

                for (let i = 0; i < totalRows.length; i++) {
                    const row = totalRows[i];
                    
                    const yearMatch = row.textContent.match(/(\d{4})\s+Total:/);
                    const year = yearMatch ? yearMatch[1] : "";
                    
                    // Skip if we've already processed this year (duplicate row)
                    if (!year || seenYears.has(year)) continue;
                    
                    if (seenYears.size === 0) yearVal = year;

                    const tds = Array.from(row.querySelectorAll('td'));
                    const isPaidBadge = row.querySelector('.label .fa-check') !== null || row.textContent.toLowerCase().includes('paid');
                    
                    let amountDueStr = tds[tds.length - 1]?.textContent.trim() || "$0.00";
                    let baseAmountStr = tds[tds.length - 6]?.textContent.trim() || "$0.00";
                    let amountPaidStr = tds[tds.length - 5]?.textContent.trim() || "$0.00";
                    
                    let numericDue = parseFloat(amountDueStr.replace(/[$,]/g, '')) || 0;
                    let status = (isPaidBadge || numericDue === 0) ? "PAID" : "DELINQUENT";

                    if (seenYears.size === 0) { primaryYearStatus = status; }

                    let nextYear = parseInt(year) + 1;

                    const historyItem = {
                        jurisdiction: "County", 
                        year: year,
                        payment_type: "ANNUAL", 
                        status: status,
                        base_amount: baseAmountStr,
                        amount_paid: amountPaidStr,
                        amount_due: amountDueStr,
                        mailing_date: "N/A",
                        due_date: `01/31/${nextYear}`,
                        delq_date: `02/01/${nextYear}`,
                        paid_date: "N/A",
                        good_through_date: "",
                    };

                    if (status === "PAID") {
                        if (seenYears.size === 0) {
                            data.tax_history.push(historyItem);
                            seenYears.add(year);
                        }
                        break;
                    } else {
                        data.tax_history.push(historyItem);
                        seenYears.add(year);
                        if (seenYears.size > 1) isPriorYearPaid = false;
                    }
                }

                // Sort the extracted array in ascending order based on the year (e.g., 2024, 2025, 2026)
                data.tax_history.sort((a, b) => parseInt(a.year) - parseInt(b.year));

                // STEP 5: Dynamically extract Assessed Value matching the specific tax year (with fallback to N/A)
                const allThElements = Array.from(document.querySelectorAll('table th'));
                const assessedTh = allThElements.find(th => th.textContent.trim() === 'Assessed');
                
                if (assessedTh) {
                    const targetTable = assessedTh.closest('table');
                    const siblingThs = Array.from(assessedTh.parentElement.children);
                    const columnIndex = siblingThs.indexOf(assessedTh);

                    if (columnIndex !== -1) {
                        const valuationRows = Array.from(targetTable.querySelectorAll('tbody tr, tr')).filter(tr => tr.querySelector('td'));
                        
                        let fallbackValue = "";
                        let exactMatchValue = "";

                        for (const row of valuationRows) {
                            const tds = row.querySelectorAll('td');
                            if (tds.length > columnIndex) {
                                const rowYear = tds[0].textContent.trim();
                                const rowValue = tds[columnIndex].textContent.trim();

                                const isValid = rowValue && rowValue.toUpperCase() !== 'N/A' && rowValue !== '';

                                // Capture the first valid numeric valuation row as the baseline fallback
                                if (isValid && !fallbackValue) {
                                    fallbackValue = rowValue;
                                }

                                // Capture the exact targeted tax year match
                                if (rowYear === yearVal && isValid) {
                                    exactMatchValue = rowValue;
                                    break;
                                }
                            }
                        }

                        // Prioritize exact match, use fallback next, default to "N/A" if empty
                        const finalValuation = exactMatchValue || fallbackValue || "N/A";
                        data.total_assessed_value = finalValuation;
                        data.total_taxable_value = finalValuation;
                    }
                }

                // STEP 6: Apply the specific Notes Logic
                let basePaymentType = "ANNUAL"; 
                let dynamicDueDatesNote = "NORMAL DUE DATE IS 01/31";
                let generatedNotes = "";

                if (!isPriorYearPaid) {
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
                }
                data.notes = generatedNotes;

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
