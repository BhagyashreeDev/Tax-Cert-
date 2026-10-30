// Author :- Vadiraj Joshi
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "warren": { url: "https://warrencountyintaxpayments.us/#/WildfireSearch", auth: "Warren County, IN" },
};

const timeout_option = {
    timeout: 90000
};

// --- HELPER: ROBUST ACCEPT BUTTON HANDLER ---
const handleAcceptButton = async (page) => {
    try {
        await page.waitForSelector('button[ng-click="wildfireAccept()"]', { timeout: 8000 });

        await page.waitForFunction(() => {
            const btn = document.querySelector('button[ng-click="wildfireAccept()"]');
            return btn && !btn.hasAttribute('disabled');
        }, { timeout: 8000 });

        await page.evaluate(() => {
            const btn = document.querySelector('button[ng-click="wildfireAccept()"]');
            if (btn) btn.click();
        });

        await new Promise(res => setTimeout(res, 1000));
    } catch (e) {
        // Silently continue if modal is not present
    }
};

// --- AVALON SPA SCRAPER PIPELINE ---
const ac_1 = async (page, baseUrl, account, tax_auth) => {
    try {
        if (!account) {
            throw new Error('Invalid format. Property Number/Account is missing.');
        }

        // STEP 1: Navigate and handle terms
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await handleAcceptButton(page);

        // STEP 2 & 3: Input Account and Search (Robust Angular Override)
        await page.waitForSelector('#searchBox', { timeout: 10000 });
        await page.evaluate((acc) => {
            const input = document.querySelector('#searchBox');
            input.value = acc;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, account.toString().trim());

        await new Promise(res => setTimeout(res, 800));
        await page.keyboard.press('Enter');
        await page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"]');
            if (btn && !btn.disabled) btn.click();
        });

        // STEP 4: Wait for results and map configuration
        try {
            await page.waitForSelector('tr[data-btn-view-record]', { timeout: 15000 });
            await new Promise(res => setTimeout(res, 1500));
        } catch (e) {
            throw new Error('Property Number not found or no records returned.');
        }

        const rowsConfig = await page.evaluate(() => {
            const trs = document.querySelectorAll('tr[data-btn-view-record]');
            let configs = [];
            let seenYears = new Set();

            for (let i = 0; i < trs.length; i++) {
                const tds = trs[i].querySelectorAll('td');
                if (tds.length < 2) continue;

                const yearText = tds[1].innerText.trim();

                const statusNodes = trs[i].querySelectorAll('.payStatus');
                let isFullyPaid = true;
                statusNodes.forEach(node => {
                    const text = node.innerText.toLowerCase();
                    if (text.includes('unpaid') || text.includes('due')) {
                        isFullyPaid = false;
                    }
                });

                const statusText = isFullyPaid ? 'Paid' : 'Due';

                if (!seenYears.has(yearText)) {
                    seenYears.add(yearText);
                    configs.push({ index: i, status: statusText, year: yearText });

                    if (isFullyPaid) {
                        break;
                    }
                }
            }
            return configs;
        });

        if (rowsConfig.length === 0) {
            throw new Error('No valid tax year rows found for extraction.');
        }

        let taxHistoryArray = [];
        let primaryData = {};

        // Loop through required records
        for (let j = 0; j < rowsConfig.length; j++) {
            const config = rowsConfig[j];

            if (j > 0) {
                await page.goto('about:blank');
                await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
                await handleAcceptButton(page);

                await page.waitForSelector('#searchBox', { timeout: 10000 });
                await page.evaluate((acc) => {
                    const input = document.querySelector('#searchBox');
                    input.value = acc;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }, account.toString().trim());

                await new Promise(res => setTimeout(res, 800));
                await page.keyboard.press('Enter');
                await page.evaluate(() => {
                    const btn = document.querySelector('button[type="submit"]');
                    if (btn && !btn.disabled) btn.click();
                });

                await page.waitForSelector('tr[data-btn-view-record]', { timeout: 15000 });
            }

            await new Promise(res => setTimeout(res, 2000));

            // STEP 5: Click View
            await page.evaluate((idx) => {
                const trs = document.querySelectorAll('tr[data-btn-view-record]');
                if (trs[idx]) {
                    const btn = trs[idx].querySelector('button.btnView');
                    if (btn) btn.click();
                }
            }, config.index);

            await page.waitForSelector('.infoTable', { timeout: 15000 });
            await new Promise(res => setTimeout(res, 1200));

            // STEPS 6-9: Extract structural data blocks from inner page
            const yearDetails = await page.evaluate(() => {
                const formatCurrency = (num) => '$' + parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                let data = {
                    ownerName: "N/A", address: "", location: "", propId: "", taxYear: "",
                    assessedValue: "N/A", installments: []
                };

                const cleanText = (node) => node ? node.innerText.trim() : "";

                // General details mapped from UL structure
                document.querySelectorAll('ul.infoTable li.row').forEach(row => {
                    const labelDiv = row.querySelector('div.col-xs-5');
                    const valDiv = row.querySelector('div.col-xs-7');
                    if (labelDiv && valDiv) {
                        const label = cleanText(labelDiv).replace(/:/g, '').trim();
                        const valHtml = valDiv.innerHTML;
                        const valText = cleanText(valDiv);

                        if (label === 'Name') {
                            // Target any <br> variation (including Angular ng-show bindings) to strictly pull the primary name
                            data.ownerName = valHtml
                                .split(/<br\b[^>]*>/i)[0]
                                .replace(/<[^>]+>/g, "")
                                .replace(/&amp;|amp;/gi, ", ")
                                .replace(/\s*&\s*/g, ", ")
                                .replace(/\s*,\s*/g, ", ")
                                .trim();
                        }
                        if (label === 'Parcel Number') data.propId = valText;
                        if (label === 'Year') data.taxYear = valText;
                        if (label === 'Address') {
                            const sectionHeading = row.closest('.section').querySelector('h2');
                            if (sectionHeading && sectionHeading.innerText.includes('Owner')) {
                                data.address = valHtml.replace(/<br\b[^>]*>/gi, ', ').replace(/(<([^>]+)>)/gi, "").trim();
                            } else if (sectionHeading && sectionHeading.innerText.includes('Parcel')) {
                                data.location = valHtml.replace(/<br\b[^>]*>/gi, ', ').replace(/(<([^>]+)>)/gi, "").trim();
                            }
                        }
                    }
                });

                // Installments mapping from sequential tables
                const instContainers = document.querySelectorAll('div[style*="display: flex; flex-direction: row"]');
                instContainers.forEach(container => {
                    const headingDiv = container.querySelector('strong[id*="-installment-heading"]');
                    if (!headingDiv) return;

                    let instStatus = "Due";
                    const statusSpan = container.querySelector('.payStatusAda');
                    if (statusSpan) {
                        const rawStatus = cleanText(statusSpan).toUpperCase();
                        if (rawStatus.includes("PAID")) instStatus = "Paid";
                        if (rawStatus.includes("UNPAID") || rawStatus.includes("DUE")) instStatus = "Due";
                    }

                    let dueDate = "";
                    const dueSpan = Array.from(container.querySelectorAll('span')).find(s => s.innerText.includes('Due:'));
                    if (dueSpan) dueDate = dueSpan.innerText.replace('Due:', '').trim();

                    let taxAmt = 0, paidAmt = 0, balAmt = 0;
                    const rows = container.querySelectorAll('table.infoTable tbody tr');
                    rows.forEach(tr => {
                        const tds = tr.querySelectorAll('td');
                        if (tds.length === 2) {
                            const lbl = cleanText(tds[0]);
                            const val = parseFloat(cleanText(tds[1]).replace(/[^0-9.-]+/g, "")) || 0;
                            if (lbl === 'Tax') taxAmt = val;
                            if (lbl === 'Paid') paidAmt = val;
                            if (lbl === 'Balance') balAmt = val;
                        }
                    });

                    let delqDate = "";
                    if (dueDate) {
                        let parts = dueDate.split('/');
                        if (parts.length === 3) {
                            let d = new Date(parts[2], parts[0] - 1, parts[1]);
                            d.setDate(d.getDate() + 1);
                            delqDate = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
                        }
                    }

                    if (instStatus === "Due" && delqDate) {
                        const today = new Date();
                        const d1 = new Date(delqDate);
                        today.setHours(0, 0, 0, 0);
                        d1.setHours(0, 0, 0, 0);
                        if (today >= d1) instStatus = "Delinquent";
                    }

                    if (taxAmt > 0 || paidAmt > 0 || balAmt > 0) {
                        data.installments.push({
                            jurisdiction: "County",
                            year: data.taxYear,
                            payment_type: "SEMI ANNUALLY",
                            status: instStatus,
                            base_amount: formatCurrency(taxAmt),
                            amount_paid: formatCurrency(paidAmt),
                            amount_due: formatCurrency(balAmt),
                            mailing_date: "N/A",
                            due_date: dueDate,
                            delq_date: delqDate,
                            paid_date: "N/A",
                            good_through_date: "-"
                        });
                    }
                });

                if (data.installments.length === 1) {
                    data.installments[0].payment_type = "Annual";
                }

                return data;
            });

            // Enforce expected year
            if (yearDetails.installments.length > 0 && !yearDetails.installments[0].year && config.year) {
                yearDetails.installments.forEach(inst => inst.year = config.year);
            }

            yearDetails.installments.forEach(inst => taxHistoryArray.push(inst));

            if (j === 0) {
                primaryData = {
                    ownerName: yearDetails.ownerName,
                    address: yearDetails.address,
                    location: yearDetails.location,
                    propId: yearDetails.propId,
                    assessedValue: yearDetails.assessedValue
                };
            }
        }

        taxHistoryArray.sort((a, b) => parseInt(a.year, 10) - parseInt(b.year, 10));

        // --- Notes & Delinquent Logic ---
        const allYears = taxHistoryArray.map(h => parseInt(h.year, 10));
        const maxYear = Math.max(...allYears);
        const maxYearStr = maxYear.toString();

        // Check strictly for "Delinquent" status. A status of "Due" is not delinquent.
        const isAnyDelinquent = taxHistoryArray.some(h => h.status === "Delinquent");

        // Check if PRIOR years are Due or Delinquent
        const isPriorYearPaid = !taxHistoryArray.some(h => parseInt(h.year) !== maxYear && (h.status === "Delinquent" || h.status === "Due"));

        // Box should only say PRIORS ARE DELINQUENT if actual prior years are unpaid
        const delinquentStatus = !isPriorYearPaid ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF" : "NONE";

        const currentYearInst = taxHistoryArray.filter(h => parseInt(h.year) === maxYear);

        let dynamicDueDatesNote = "";
        let basePaymentType = "ANNUALLY";
        let statusString = "";

        if (currentYearInst.length >= 2) {
            basePaymentType = "SEMI ANNUALLY";
            const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
            const shortDueTwo = currentYearInst[1].due_date.substring(0, 5);
            dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} AND ${shortDueTwo}`;
            statusString = `${maxYearStr} 1ST INSTALLMENT IS ${currentYearInst[0].status.toUpperCase()}, 2ND INSTALLMENT IS ${currentYearInst[1].status.toUpperCase()}`;
        } else if (currentYearInst.length === 1) {
            basePaymentType = "ANNUALLY";
            const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
            dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
            statusString = `${maxYearStr} TAXES ARE ${currentYearInst[0].status.toUpperCase()}`;
        }

        let generatedNotes = "";
        if (isAnyDelinquent) {
            if (isPriorYearPaid) {
                generatedNotes = `ALL PRIORS ARE PAID, ${maxYearStr} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
            } else {
                generatedNotes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
            }
        } else {
            generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
        }

        let outputTaxHistory = [...taxHistoryArray];
        if (maxYear !== Math.min(...allYears)) {
            const currentYearState = outputTaxHistory[outputTaxHistory.length - 1].status.toUpperCase();
            const oldestYearState = outputTaxHistory[0].status.toUpperCase();

            if (currentYearState !== "PAID" && oldestYearState === "PAID") {
                outputTaxHistory = outputTaxHistory.filter(t => parseInt(t.year) > Math.min(...allYears));
            }
        }

        return {
            processed_date: new Date().toLocaleDateString("en-US"),
            order_number: "",
            borrower_name: "",
            owner_name: primaryData.ownerName ? [primaryData.ownerName] : ["N/A"],
            property_address: primaryData.location || primaryData.address || "",
            parcel_number: primaryData.propId || account.toString().trim(),
            land_value: "-",
            improvements: "-",
            total_assessed_value: primaryData.assessedValue !== "N/A" ? primaryData.assessedValue : "N/A",
            exemption: "-",
            total_taxable_value: primaryData.assessedValue !== "N/A" ? primaryData.assessedValue : "N/A",
            taxing_authority: tax_auth,
            notes: generatedNotes,
            delinquent: delinquentStatus,
            tax_history: outputTaxHistory
        };

    } catch (error) {
        console.error("Avalon ac_1 Internal Method Error: ", error);
        throw error;
    }
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
}

// -------------------------------------------------------------------------------------------------------------------------------------------------
// DO NOT TOUCH OR UPDATE THE CODE BELOW THIS BOX - SEARCH METHOD MANAGES CHROMIUM INSTANTIATION ENVIRONMENT AND ROUTING
// -------------------------------------------------------------------------------------------------------------------------------------------------
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
        page.setDefaultNavigationTimeout(timeout_option.timeout);

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
}

export { search }
