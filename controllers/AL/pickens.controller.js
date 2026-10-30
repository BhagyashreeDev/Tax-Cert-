// Author = Harikrishna B

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const timeout_option = {
    timeout: 90000
};

const ac_1 = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded" });

            // BYPASS MODAL IF PRESENT
            try {
                await page.waitForSelector(".modal-dialog", { timeout: 5000 });
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll("button"));
                    const closeBtn = buttons.find(b => b.textContent.includes("Close") || b.textContent.includes("Don't show"));
                    if (closeBtn) closeBtn.click();
                });
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                console.log("No modal found, continuing...");
            }

            // CLICK THE VIEW BUTTON IN THE RESULTS TABLE
            const viewButtonSelector = ".wildfireResults table.table tbody tr button";
            await page.waitForSelector(viewButtonSelector, timeout_option);
            await page.click(viewButtonSelector);

            // WAIT FOR DETAIL TABS TO RENDER
            await page.waitForSelector(".tab-content .tab-pane.ng-scope.active", timeout_option);
            await new Promise(r => setTimeout(r, 1500));

            const page_content = await page.evaluate((account) => {
                const data = {
                    processed_date: new Date().toLocaleDateString(),
                    order_number: "",
                    borrower_name: "",
                    owner_name: ["N/A"],
                    property_address: "N/A",
                    parcel_number: account,
                    land_value: "",
                    improvements: "",
                    total_assessed_value: "",
                    exemption: "",
                    total_taxable_value: "",
                    taxing_authority: "Pickens County Revenue Commissioner",
                    notes: "",
                    delinquent: "NONE",
                    tax_history: []
                };

                let tax_year   = "N/A";
                let due_date   = "N/A";
                let status     = "N/A";
                let base_tax   = "$0.00";
                let amount_paid = "$0.00";
                let total_due  = "$0.00";
                let last_payment_date = "N/A";
                let assessed_value = "$0"; // Initialized here

                // PARSE BILL INFORMATION & PAYMENT INFORMATION SECTIONS
                const headers = document.querySelectorAll(".col-md-4.section h4");
                headers.forEach(header => {
                    const headerText = header.textContent.trim();

                    if (headerText === "Bill Information") {
                        const rows = header.parentElement.querySelectorAll("tbody tr");
                        
                        rows.forEach(row => {
                            const tds = row.querySelectorAll("td");
                            
                            if (tds.length >= 2) {
                                const label = tds[0].textContent.replace(":", "").toLowerCase().trim();
                                const value = tds[1].textContent.trim();

                                if (label.includes("name")) {
                                    data["owner_name"] = [value];
                                }
                                if (label.includes("address")) {
                                    data["property_address"] = value.replace(/\s+/g, " ").trim();
                                }
                                if (label.includes("tax year")) {
                                    tax_year = value; 
                                    data["tax_year"] = value; 
                                }
                            }
                        });
                    }

                    if (headerText === "Payment Information") {
                        const rows = header.parentElement.querySelectorAll("tbody tr");
                        rows.forEach(row => {
                            const tds = row.querySelectorAll("td");
                            if (tds.length >= 2) {
                                const label = tds[0].textContent.replace(":", "").toLowerCase().trim();
                                const value = tds[1].textContent.trim();

                                if (label.includes("due date"))          due_date          = value;
                                if (label.includes("status"))            status            = value.replace(/[^a-zA-Z]/g, "").trim().toUpperCase();
                                if (label.includes("base tax"))          base_tax          = value;
                                if (label.includes("amount paid"))       amount_paid       = value;
                                if (label.includes("total due"))         total_due         = value;
                                if (label.includes("last payment date")) last_payment_date = value || "N/A";
                            }
                        });
                    }
                });

                // PARSE PROPERTY DETAILS SECTION
                const values = [];

                // 1. Extract values
                document.querySelectorAll(".col-md-12 tbody tr").forEach(row => {
                    const tds = row.querySelectorAll("td");
                    if (tds.length >= 4) {
                        const num = parseFloat(tds[3].textContent.replace(/,/g, "")) || 0;
                        values.push(num);
                    }
                });

                // 2. Sum and Format (FIXED: removed 'let' keyword below to reuse top variable)
                if (values.length > 0) {
                    const totalSum = values.reduce((acc, curr) => acc + curr, 0);
                    
                    // Format the number as USD currency ($45,920)
                    assessed_value = new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                    }).format(totalSum);
                }

                // ASSESSED / TAXABLE VALUE
                data["total_assessed_value"] = assessed_value;
                data["total_taxable_value"]  = assessed_value;

                // DELINQUENT DATE (next year calculation)
                let delq_date = "N/A";
                if (tax_year !== "N/A" && !isNaN(tax_year)) {
                    delq_date = "01/01/"+String(Number(tax_year) + 1);
                }

                // --- NEW LOGIC FOR DYNAMIC STATUS VERIFICATION ---
                let dynamicStatus = status; 
                const numericDue = parseFloat(total_due.replace(/[^0-9.-]+/g, ""));

                if (numericDue === 0 || total_due === "$0.00") {
                    dynamicStatus = "Paid";
                } else {
                    // Compare target due date against today's date
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    
                    let parsedDueDate = new Date("10/01/"+due_date);
                    
                    if (isNaN(parsedDueDate.getTime()) && delq_date !== "N/A") {
                        parsedDueDate = new Date(delq_date);
                    }

                    if (!isNaN(parsedDueDate.getTime())) {
                        if (today > parsedDueDate) {
                            dynamicStatus = "Delinquent";
                        } else {
                            dynamicStatus = "Due";
                        }
                    } else {
                        dynamicStatus = "Due"; // Fallback if no valid date found
                    }
                }

                // POPULATE TAX HISTORY ARRAY FIRST
                data["tax_history"].push({
                    jurisdiction: "County",
                    year: tax_year,
                    payment_type: "Annual",
                    status: dynamicStatus, // Using our modified conditional status
                    base_amount: base_tax,
                    amount_paid: dynamicStatus === "Paid" ? amount_paid : "$0.00",
                    amount_due: dynamicStatus !== "Paid"  ? total_due   : "$0.00",
                    mailing_date: "N/A",
                    due_date: due_date,
                    delq_date: delq_date,
                    paid_date: last_payment_date,
                    good_through_date: ""
                });

                const paid_entries = data['tax_history'].filter(entry => entry.status === "Paid");
                const paid_year = paid_entries.map(entry => entry.year).join(", ");
                const unpaid_entries = data['tax_history'].filter(entry => entry.status !== "Paid");

                if (unpaid_entries.length === 0) {
                    data['notes'] = `ALL PRIORS ARE PAID, ${paid_year ? paid_year : 'CURRENT'} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 12/31`;
                    data['delinquent'] = "NONE";
                } else {
                    const sorted_unpaid = unpaid_entries.sort((a, b) => parseInt(b.year) - parseInt(a.year));
                    const latest_unpaid_year = sorted_unpaid[0]?.year || "CURRENT";
                    
                    if (dynamicStatus === "Delinquent") {
                        data['notes'] = `PRIORS ARE DELINQUENT, ${latest_unpaid_year} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 12/31`;
                        data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
                    } else {
                        data['notes'] = `TAXES ARE CURRENTLY DUE, ${latest_unpaid_year} TAXES ARE DUE, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 12/31`;
                        data['delinquent'] = "NONE (CURRENTLY DUE)";
                    }
                }

                return data;
            }, account);

            resolve(page_content);
        }
        catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

const account_search = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, url, account)
            .then((data) => {
                resolve(data);
            })
            .catch((error) => {
                console.log(error);
                reject(new Error(error.message));
            });
        }
        catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render("error_data", {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = `https://taxes.pickensalabama.com/taxes.html#/WildfireSearch/${account}`;

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page    = await context.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36");

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (req.resourceType() === "font" || req.resourceType() === "image") {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            // FRONTEND ENDPOINT
            account_search(page, url, account)
            .then((data) => {
                res.status(200).render("parcel_data_official", data);
            })
            .catch((error) => {
                console.log(error);
                res.status(200).render("error_data", {
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
            res.status(200).render("error_data", {
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
};
export {
    search
};
