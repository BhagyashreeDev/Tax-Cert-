// Author:- MM Prateek

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "cleburne": {
        url: "https://cleburne.capturecama.com/propsearch",
        auth: "Cleburne County Revenue Commissioner, 120 Vickery Street, Heflin AL 36264"
    },
    "autauga": {
        url: "https://autauga.capturecama.com/propsearch",
        auth: "Autauga County Revenue Commissioner"
    },
    "coosa": {
        url: "https://coosa.capturecama.com/propsearch",
        auth: "Coosa County Revenue Commissioner"
    },
    "hale": {
        url: "https://hale.capturecama.com/propsearch",
        auth: "Hale County Revenue Commissioner"
    },
    "barbour": {
        url: "https://barbour.capturecama.com/propsearch",
        auth: "Barbour County Revenue Commissioner"
    },
    "morgan": {
        url: "https://morgan.capturecama.com/propsearch",
        auth: "Morgan County Revenue Commissioner"
    },
    "sumter": {
        url: "https://sumter.capturecama.com/propsearch",
        auth: "Sumter County Revenue Commissioner"
    },
    "wilcox": {
        url: "https://wilcox.capturecama.com/propsearch",
        auth: "Wilcox County Revenue Commissioner"
    },
    "elmore": {
        url: "https://elmorerevenuecommissioner.net/propsearch",
        auth: "Elmore County Revenue Commissioner"
    },
    "monroe": {
        url: "https://monroe.capturecama.com/propsearch",
        auth: "Monroe County Revenue Commissioner"
    },
    "henry": {
        url: "https://henry.capturecama.com/propsearch",
        auth: "Henry County Revenue Commissioner"
    }
};

const timeout_option = {
    timeout: 30000
};

// Date format helper
function convertYear(dateStr) {
    if (!dateStr || dateStr === "N/A") return "N/A";
    const parts = dateStr.split("/");
    if (parts.length === 3 && parts[2].length === 2) {
        parts[2] = "20" + parts[2];
    }
    return parts.join("/");
}

// Delinquent Date helper
function getDelqDate(dateStr) {
    if (!dateStr || dateStr === "N/A") return "N/A";
    const parts = dateStr.split("/");
    if (parts.length !== 3) return "N/A";
    const dateObj = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
    dateObj.setDate(dateObj.getDate() + 1);
    return `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
}

// Delinquency Checker
function isDelinquent(delqDateStr) {
    if (!delqDateStr || delqDateStr === "N/A") return false;
    const delqDate = new Date(delqDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    return today >= delqDate;
}

const account_search = (page, url, account, tax_auth, county) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

            await page.waitForSelector("select", timeout_option);
            await page.select('select', '2'); 

            await page.waitForSelector('#searchText', timeout_option);
            
            // INJECTION HACK: Force exact value into DOM to bypass React auto-formatter
            await page.evaluate((acc) => {
                const input = document.querySelector('#searchText');
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeInputValueSetter.call(input, acc);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }, account.trim());

            await new Promise(r => setTimeout(r, 300));

            await page.waitForSelector('#btnSearch', timeout_option);
            await page.click('#btnSearch');

            const viewDetailsSelector = 'a[href*="/parcelDetail/"]'; 
            
            await page.waitForSelector(viewDetailsSelector, { timeout: 15000 });

            await page.click(viewDetailsSelector);

            await page.waitForSelector("#valuation table", timeout_option);

            const propertyData = await page.evaluate(() => {
                const result = {
                    owner_name: "N/A",
                    parcel_number: "N/A",
                    property_address: "N/A",
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemption: "N/A",
                    total_taxable_value: "N/A"
                };

                document.querySelectorAll("h2").forEach(h2 => {
                    const text = h2.innerText.trim();

                    // Owner Name Extraction
                    if (text.includes("Owner:")) {
                        const nextSpan = h2.nextElementSibling;
                        if (nextSpan) result.owner_name = nextSpan.innerText.trim();
                    }
                    
                    // Parcel Number Extraction
                    if (text.includes("Parcel #:")) {
                        const nextSpan = h2.nextElementSibling;
                        if (nextSpan) result.parcel_number = nextSpan.innerText.trim();
                    }

                    // PROPERTY ADDRESS EXTRACTION
                    if (text === "Property Address") {
                        let addressParts = [];
                        let sibling = h2.nextElementSibling;
                        
                        // Loop through siblings until we hit the next h2 (Mailing Address)
                        while (sibling && sibling.tagName !== 'H2') {
                            if (sibling.tagName === 'SPAN' || sibling.tagName === 'DIV') {
                                const txt = sibling.innerText.trim().replace(/\s+/g, ' ');
                                if (txt) addressParts.push(txt);
                            }
                            sibling = sibling.nextElementSibling;
                        }
                        
                        if (addressParts.length > 0) {
                            result.property_address = addressParts.join(", ");
                        }
                    }
                });

                document.querySelectorAll("#valuation table tr").forEach(tr => {
                    const tds = tr.querySelectorAll("td");
                    if (tds.length >= 2) {
                        const label = tds[0].innerText.trim();
                        const value = tds[1].innerText.trim().replace("[CU VALUE]", "").trim();

                        if (label.includes("Total Improvement Value")) {
                            result.improvements = value;
                        } else if (label.includes("Total Land Value")) {
                            result.land_value = value;
                        } else if (label.includes("Taxable Value")) {
                            // Only extracts Taxable Value if explicitly found
                            result.total_taxable_value = value; 
                        } else if (label.includes("Assessed Value")) {
                            result.total_assessed_value = value;
                        }
                    }
                });

                // Post-processing fallback logic: 
                // If Assessed Value exists but Taxable Value is missing, Taxable Value = Assessed Value.
                // If both are missing, they remain "N/A".
                if (result.total_assessed_value !== "N/A" && result.total_taxable_value === "N/A") {
                    result.total_taxable_value = result.total_assessed_value;
                }

                return result;
            });
            
            const toggleBtn = await page.$("#toggleTaxPmt");
            if (toggleBtn) {
                const btnText = await page.evaluate(el => el.innerText, toggleBtn);
                if (btnText.includes("Show Historical")) {
                    await toggleBtn.click();
                }
            }

            await page.waitForFunction(() => {
                const rows = document.querySelectorAll("#taxpmt table tbody tr");
                return rows.length > 0 && rows[0].querySelectorAll("td").length >= 6;
            }, { timeout: 10000 }).catch(() => {});

            const extractedHistory = await page.evaluate(() => {
                const rows = [];
                document.querySelectorAll("#taxpmt table tbody tr").forEach(tr => {
                    const cols = Array.from(tr.querySelectorAll("td")).map(td => td.innerText.trim());
                    if (cols.length >= 6) {
                        rows.push({
                            year: cols[0],
                            paid_by: cols[1],
                            paid_date: cols[2],
                            receipt: cols[3],
                            total_taxes: cols[4],
                            total_paid: cols[5]
                        });
                    }
                });
                return rows;
            });

            const taxHistory = [];
            let holdsDelinquency = false;
            let totalDueAccumulator = 0;

            for (const row of extractedHistory) {
                const numericTaxes = parseFloat(row.total_taxes.replace(/[$,]/g, "")) || 0;
                const numericPaid = parseFloat(row.total_paid.replace(/[$,]/g, "")) || 0;
                const numericDue = Math.max(0, numericTaxes - numericPaid);
                
                const formattedDueDate = `12/31/${row.year}`;
                const formattedDelqDate = `01/01/${parseInt(row.year) + 1}`;
                
                let rowStatus = "Paid";

                if (numericDue > 0) {
                    rowStatus = isDelinquent(formattedDelqDate) ? "Delinquent" : "Due";
                    totalDueAccumulator += numericDue;
                    if (rowStatus === "Delinquent") holdsDelinquency = true;
                }

                taxHistory.push({
                    jurisdiction: "County",
                    year: row.year,
                    payment_type: "Annual",
                    status: rowStatus,
                    base_amount: row.total_taxes,
                    amount_paid: row.total_paid,
                    amount_due: `$${numericDue.toFixed(2)}`,
                    mailing_date: "N/A",
                    due_date: formattedDueDate,
                    delq_date: formattedDelqDate,
                    paid_date: row.paid_date !== "" ? convertYear(row.paid_date) : "N/A",
                    good_through_date: "N/A"
                });

                if (rowStatus === "Paid") {
                    break;
                }
            }

            // SORTING LOGIC: This ensures the array is always sorted in Ascending order
            taxHistory.sort((a, b) => parseInt(a.year) - parseInt(b.year));

            const today = new Date();
            const formattedDate = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
            
            let notesText = "ALL PRIORS ARE PAID";
            if (taxHistory.length > 0) {
                // Because the array is now sorted ascending, the latest year is at the very end of the array
                const latestYear = taxHistory[taxHistory.length - 1];
                notesText = `ALL PRIORS ARE PAID, ${latestYear.year} TAXES ARE ${latestYear.status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS 12/31`;
            }

            const output = {
                processed_date: formattedDate,
                order_number: "N/A",
                borrower_name: "N/A",
                owner_name: propertyData.owner_name !== "N/A" ? [propertyData.owner_name] : ["N/A"], 
                property_address: propertyData.property_address,
                parcel_number: account,
                land_value: propertyData.land_value,
                improvements: propertyData.improvements,
                total_assessed_value: propertyData.total_assessed_value,
                exemption: propertyData.exemption,
                total_taxable_value: propertyData.total_taxable_value,
                taxing_authority: tax_auth, 
                notes: notesText, 
                delinquent: holdsDelinquency ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE", 
                total_amount_due: `$${totalDueAccumulator.toFixed(2)}`,
                tax_history: taxHistory
            };

            resolve(output);

        } catch (error) {
            console.log(error);
            reject(new Error("No Record Found / Invalid Parcel"));
        }
    });
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {        
        // Extract the county name directly from the Express route path
        // Example: "/cleburne" becomes "cleburne"
        const county_name = req.path.replace('/', '').toLowerCase();

        // Safety check to ensure the county exists in our dictionary
        if (!county_data[county_name]) {
            throw new Error(`The county '${county_name}' is not configured in the scraper.`);
        }

        const url = county_data[county_name]['url'];
        const tax_auth = county_data[county_name]['auth']+", AL";

        if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if(fetch_type == "html"){
            // FRONTEND ENDPOINT
            account_search(page, url, account, tax_auth, county_name)
            .then((data) => {
                res.status(200).render("parcel_data_official", data, (err, html) => {
                    if (err) return res.status(200).render("parcel_data_official", data);
                    
                    const outputHtml = html.replace(
                        /Processed Date<\/td>\s*<td contenteditable class="report-table-bg-data"><\/td>/i,
                        `Processed Date</td>\n                    <td contenteditable class="report-table-bg-data">${data.processed_date}</td>`
                    );
                    res.send(outputHtml);
                });
            })
            .catch((error) => {
                console.log(error);
                res.status(200).render('error_data', {
                    error: true,
                    message: error.message
                });
            })
            .finally(async () => {
                await context.close().catch(() => null);
            });
        }
        else if(fetch_type == "api"){
            // API ENDPOINT
            account_search(page, url, account, tax_auth, county_name)
            .then((data) => {
                res.status(200).json({
                    result: data
                })
            })
            .catch((error) => {
                console.log(error);
                res.status(500).json({
                    error: true,
                    message: error.message
                })
            })
            .finally(async () => {
                await context.close().catch(() => null);
            });
        }

    }
    catch(error){
        console.log(error);
        if(fetch_type == "html"){
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if(fetch_type == "api"){
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}

export { search };
