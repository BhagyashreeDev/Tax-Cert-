// Author: M M Prateek
// Multi-County Controller: wright, blue-earth, chisago, stearns, kittson

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000
};

const county_data = {
    "wright": {
        url: "https://propertyaccess.co.wright.mn.us/search/commonsearch.aspx?mode=combined",
        auth: "Wright County Property Records & Taxation, 10 2nd Street NW, Room 120, Buffalo, MN 55313, Ph: (763) 682-7369"
    },
    "blue-earth": {
        url: "https://publicaccess.blueearthcountymn.gov/search/commonsearch.aspx?mode=realprop",
        auth: "Blue Earth County Property & Environmental Resources, 410 S 5th Street, Mankato, MN 56001, Ph: (507) 304-4251"
    },
    "chisago": {
        url: "https://propertyrecords.chisagocountymn.gov/search/commonsearch.aspx?mode=realprop",
        auth: "Chisago County Property Records, 313 N Main Street, Center City, MN 55012, Ph: (651) 213-8500"
    },
    "stearns": {
        url: "https://propertyaccess.stearnscountymn.gov/search/commonsearch.aspx?mode=realprop",
        auth: "Stearns County Property & Records, 705 Courthouse Square, St. Cloud, MN 56303, Ph: (320) 656-3680"
    },
    "kittson": {
        url: "https://propertysearch.co.kittson.mn.us/search/commonsearch.aspx?mode=realprop",
        auth: "Kittson County Property Records, 410 S 5th Street, Hallock, MN 56728, Ph: (218) 843-3632"
    }
};

// ─── HELPERS ────────────────────────────────────────────

const formatDateToAmerican = (dateStr) => {
    if (!dateStr || dateStr.trim() === "" || dateStr === "N/A") return "N/A";

    const monthMap = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
        'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
        'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };

    let match = dateStr.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/i);
    if (match) return `${monthMap[match[2].toUpperCase()]}/${match[1].padStart(2, '0')}/${match[3]}`;

    match = dateStr.match(/^(\d{1,2})-([A-Z]{3})-(\d{2})$/i);
    if (match) {
        let yr = parseInt(match[3], 10);
        yr = yr < 50 ? 2000 + yr : 1900 + yr;
        return `${monthMap[match[2].toUpperCase()]}/${match[1].padStart(2, '0')}/${yr}`;
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
    return dateStr;
};

const calculateDelqDate = (dueDateStr) => {
    if (!dueDateStr || dueDateStr === "N/A") return "N/A";
    const match = dueDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return "N/A";

    const date = new Date(parseInt(match[3], 10), parseInt(match[1], 10) - 1, parseInt(match[2], 10));
    date.setDate(date.getDate() + 1);

    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
};

const extractMonthDay = (dateStr) => {
    if (!dateStr || dateStr === "N/A") return null;
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return { month: match[1], day: match[2], formatted: `${match[1]}/${match[2]}` };
    return null;
};

// ─── 1. SEARCH ──────────────────────────────────────────

const ac_1 = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", ...timeout_option });
            account = account.replace(/[- ]/g, '');

            try {
                await page.waitForSelector('#btAgree', { timeout: 10000 });
                await Promise.all([
                    page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
                    page.click('#btAgree')
                ]);
            } catch (e) { }

            await page.waitForSelector('#inpParid', timeout_option);
            await page.locator('#inpParid').fill(account);

            await Promise.all([
                page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
                page.locator('#btSearch').click()
            ]);

            const onResultsPage = await page.evaluate(() => !!document.querySelector('#tblResult'));
            if (onResultsPage) {
                const firstLink = await page.evaluate(() => {
                    const table = document.querySelector('#tblResult');
                    const link = table ? table.querySelector('a[href*="datalet"]') : null;
                    return link ? link.href : null;
                });
                if (!firstLink) return reject(new Error("Record not found"));

                await Promise.all([
                    page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
                    page.goto(firstLink, { waitUntil: "domcontentloaded", ...timeout_option })
                ]);
            }

            await page.waitForSelector('#frmMain', timeout_option);
            resolve();
        } catch (error) {
            console.log(error);
            reject(new Error("No Record Found / Invalid Parcel"));
        }
    });
};

// ─── 2. PROPERTY OVERVIEW ──────────────────────────────

const ac_2 = async (page, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            const onOverview = await page.evaluate(() => /mode=profileall/i.test(location.href));
            if (!onOverview) {
                const overviewHref = await page.evaluate(() => {
                    const link = document.querySelector('#sidemenu a[href*="mode=profileall"]');
                    return link ? link.href : null;
                });
                if (overviewHref) {
                    await page.goto(overviewHref, { waitUntil: "domcontentloaded", ...timeout_option });
                }
            }

            await page.waitForSelector('#sidemenu', timeout_option);

            const data = await page.evaluate(() => {
                let owner_name = "N/A";
                let property_address = "N/A";
                let parcel_number = "N/A";

                // PARID from header top
                const topCells = document.querySelectorAll('.DataletHeaderTop');
                topCells.forEach(c => {
                    const text = (c.innerText || "").trim();
                    if (/^(PARID|PARCEL ID):/i.test(text)) {
                        parcel_number = text.replace(/^(PARID|PARCEL ID):\s*/i, '').trim();
                    }
                });

                // Name from 1st td, Address from 2nd td of tr.DataletHeaderBottom
                const headerBottomRow = document.querySelector('tr.DataletHeaderBottom');
                if (headerBottomRow) {
                    const tdCells = headerBottomRow.querySelectorAll(':scope > td');
                    if (tdCells.length >= 1) {
                        const nameText = (tdCells[0].innerText || "").trim();
                        if (nameText && nameText !== "&nbsp;") owner_name = nameText;
                    }
                    if (tdCells.length >= 2) {
                        const addrText = (tdCells[1].innerText || "").trim();
                        if (addrText && addrText !== "&nbsp;" && !/^ROLL:/i.test(addrText)) property_address = addrText;
                    }
                }

                // Find tax link. "Taxes Due" (exact text) is the real datalet page with the
                // Current/Delinquent tables and ALWAYS wins if present. "Pay Taxes Online" /
                // "Pay Property Tax" / "Pay Taxes" are payment-portal links (e.g. taxesdue.aspx)
                // that should only be used as a fallback for counties with no "Taxes Due" link,
                // since "Pay Taxes Online" contains the substring "pay taxes" and was previously
                // overwriting the correct "Taxes Due" match whenever it appeared later in the DOM.
                let futureTaxUrl = null;
                let fallbackTaxUrl = null;
                const navLinks = document.querySelectorAll('#sidemenu .navigation a, #sidemenu a');
                navLinks.forEach(l => {
                    const text = (l.textContent || "").trim().toLowerCase();
                    if (text === "taxes due") {
                        futureTaxUrl = l.href; // highest priority, exact match
                    } else if (!fallbackTaxUrl && (
                        text.includes("pay property tax") ||
                        text.includes("pay taxes") ||
                        text.includes("taxes due")
                    )) {
                        fallbackTaxUrl = l.href; // first substring match only
                    }
                });
                if (!futureTaxUrl) futureTaxUrl = fallbackTaxUrl;

                return { owner_name, property_address, parcel_number, futureTaxUrl };
            });

            resolve({ data, tax_auth });
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// ─── 3. TAX DATA (payableChargesContainer OR FUTURE_TAX_CD_CURR/DELQ fallback) ──

const ac_3 = async (page, ctx) => {
    return new Promise(async (resolve, reject) => {
        try {
            const { data } = ctx;

            if (!data.futureTaxUrl) {
                ctx.taxRows = [];
                return resolve(ctx);
            }

            await page.goto(data.futureTaxUrl, { waitUntil: "domcontentloaded", ...timeout_option });

            // Quick check: if the page has an empty datalet_div with no children
            // and no payableChargesContainer, exit immediately (no tax records).
            const hasContent = await page.evaluate(() => {
                const container = document.querySelector('#payableChargesContainer');
                if (container && container.children.length > 0) return true;

                const dataletDiv = document.querySelector('#datalet_div');
                if (dataletDiv && dataletDiv.children.length > 0) return true;

                return false;
            });

            if (!hasContent) {
                // Neither container has any content — no tax records exist
                ctx.taxRows = [];
                return resolve(ctx);
            }

            // Wait for EITHER known structure to show up before extracting.
            await page.waitForFunction(() => {
                const container = document.querySelector('#payableChargesContainer');
                if (container && container.children.length > 0) return true;

                const currDiv = document.querySelector('div[name="FUTURE_TAX_CD_CURR"]');
                const delqDiv = document.querySelector('div[name="FUTURE_TAX_CD_DELQ"]');
                return !!(currDiv || delqDiv);
            }, { timeout: 10000 });  // Reduced timeout since we already confirmed content exists

            const extraction = await page.evaluate(() => {
                const parseD = (val) => parseFloat((val || "0").replace(/[$,]/g, '')) || 0;

                const allRows = [];

                // Pull every <tr> with >=5 <td> cells from a given table, tagging rows with `source`.
                // For "current" rows: due_date comes from cells[1] verbatim.
                // For "delinquent" rows: there is no usable due_date (column 1 is blank or dashes), so
                // due_date is always forced to "N/A" regardless of what's in that cell.
                const extractRowsFromTable = (table, source) => {
                    if (!table) return;
                    const tbody = table.querySelector('tbody') || table;
                    const rows = tbody.querySelectorAll('tr');
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length < 5) return;

                        const yearText = cells[0].innerText.trim();
                        if (!/^\d{4}$/.test(yearText)) return; // skips header + "Total:" rows

                        allRows.push({
                            year: yearText,
                            due_date: source === "delinquent" ? "N/A" : cells[1].innerText.trim(),
                            base_due: parseD(cells[2].innerText),
                            penalty: parseD(cells[3].innerText),
                            total_due: parseD(cells[4].innerText),
                            total_paid: 0,
                            last_payment: "N/A",
                            source
                        });
                    });
                };

                // ── Preferred structure: #payableChargesContainer ──
                const container = document.querySelector('#payableChargesContainer');
                if (container) {
                    const tables = container.querySelectorAll('table');
                    tables.forEach(table => extractRowsFromTable(table, "current"));
                    return allRows;
                }

                // ── Fallback structure: FUTURE_TAX_CD_CURR / FUTURE_TAX_CD_DELQ divs ──
                const currDiv = document.querySelector('div[name="FUTURE_TAX_CD_CURR"]');
                if (currDiv) {
                    const currTable = currDiv.querySelector('table:nth-of-type(2)') || currDiv.querySelectorAll('table')[1];
                    extractRowsFromTable(currTable, "current");
                }

                const delqDiv = document.querySelector('div[name="FUTURE_TAX_CD_DELQ"]');
                if (delqDiv) {
                    const delqTable = delqDiv.querySelector('table:nth-of-type(2)') || delqDiv.querySelectorAll('table')[1];
                    extractRowsFromTable(delqTable, "delinquent");
                }

                return allRows;
            });

            ctx.taxRows = extraction;
            resolve(ctx);
        } catch (error) {
            console.log(error);
            ctx.taxRows = [];
            resolve(ctx);
        }
    });
};

// ─── 4. ASSEMBLY ────────────────────────────────────────

const ac_4 = async (ctx) => {
    return new Promise((resolve, reject) => {
        try {
            const { data, tax_auth, taxRows } = ctx;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const processedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const currentYear = today.getFullYear().toString();
            const formatDollar = (num) => "$" + Number(num).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');

            let taxHistoryArray = [];
            let totalDueAcc = 0;
            let isAnyDelinquentGlobal = false;

            const dueByYear = {};
            taxRows.forEach(r => {
                // Delinquent-table rows: only keep if there's an actual balance owed.
                if (r.source === "delinquent" && r.total_due <= 0) return;

                // Current-table rows (existing rule): always keep current year; past years only if still owed.
                if (r.source !== "delinquent" && r.year !== currentYear && r.total_due <= 0) return;

                if (!dueByYear[r.year]) dueByYear[r.year] = [];
                dueByYear[r.year].push(r);
            });

            Object.keys(dueByYear).sort().forEach(year => {
                const installments = dueByYear[year];
                installments.forEach(r => {
                    const isDue = r.total_due > 0;
                    let status, formattedDueDate, delqDate;

                    if (r.source === "delinquent") {
                        // County has already classified this as delinquent by listing it in this table.
                        // There's no usable due date here, so we don't run the date comparison at all.
                        status = "Delinquent";
                        formattedDueDate = "N/A";
                        delqDate = "N/A";
                    } else {
                        formattedDueDate = formatDateToAmerican(r.due_date);
                        delqDate = calculateDelqDate(formattedDueDate);
                        status = "Paid";
                        if (isDue) {
                            status = (delqDate !== "N/A" && today >= new Date(delqDate)) ? "Delinquent" : "Due";
                        }
                    }

                    if (status === "Delinquent") isAnyDelinquentGlobal = true;

                    const formattedLastPayment = formatDateToAmerican(r.last_payment);

                    taxHistoryArray.push({
                        jurisdiction: "County",
                        year: year,
                        payment_type: installments.length > 1 ? "Semi-Annual" : "Annual",
                        status: status,
                        base_amount: formatDollar(r.base_due),
                        county_tax: "N/A",
                        city_tax: "N/A",
                        fees: formatDollar(r.penalty),
                        penalty: "N/A",
                        cost: "N/A",
                        amount_paid: formatDollar(r.total_paid),
                        amount_due: formatDollar(r.total_due),
                        mailing_date: "N/A",
                        due_date: formattedDueDate,
                        delq_date: delqDate,
                        paid_date: formattedLastPayment,
                        good_through_date: "N/A",
                        land_value: "N/A",
                        improvements: "N/A",
                        total_assessed_value: "N/A",
                        exemptions_breakdown: { residential_exemption: "0.00", homestead_exemption: "0.00", other_exemptions: "0.00", local_option_credit: "0.00" }
                    });
                    totalDueAcc += r.total_due;
                });
            });

            taxHistoryArray.sort((a, b) => parseInt(a.year) - parseInt(b.year));

            let delinquentStatus = isAnyDelinquentGlobal ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            let generatedNotes = "";
            try {
                if (taxHistoryArray.length === 0) {
                    generatedNotes = "NO TAX RECORDS FOUND";
                } else {
                    const allYears = [...new Set(taxHistoryArray.map(h => parseInt(h.year, 10)))];
                    const maxYear = Math.max(...allYears).toString();
                    const currentYearInst = taxHistoryArray.filter(h => h.year === maxYear);

                    const hasPastDue = taxHistoryArray.some(h =>
                        h.year !== maxYear &&
                        (h.status.toUpperCase() === "DUE" || h.status.toUpperCase() === "DELINQUENT")
                    );
                    const isPriorYearPaid = !hasPastDue;

                    let normalDueDatesNote = "";
                    if (currentYearInst.length >= 2) {
                        const dueDates = currentYearInst.map(inst => extractMonthDay(inst.due_date)).filter(d => d !== null);
                        if (dueDates.length >= 2) normalDueDatesNote = `, NORMAL DUE DATES ARE ${dueDates[0].formatted} AND ${dueDates[1].formatted}`;
                        else if (dueDates.length === 1) normalDueDatesNote = `, NORMAL DUE DATE IS ${dueDates[0].formatted}`;
                    } else if (currentYearInst.length === 1) {
                        const dueDate = extractMonthDay(currentYearInst[0].due_date);
                        if (dueDate) normalDueDatesNote = `, NORMAL DUE DATE IS ${dueDate.formatted}`;
                    }

                    if (currentYearInst.length >= 2) {
                        const statusOne = currentYearInst[0].status.toUpperCase();
                        const statusTwo = currentYearInst[1].status.toUpperCase();
                        const statusString = `${maxYear} 1ST INSTALLMENT IS ${statusOne}, 2ND INSTALLMENT IS ${statusTwo}`;

                        if (isAnyDelinquentGlobal) {
                            generatedNotes = isPriorYearPaid
                                ? `ALL PRIORS ARE PAID, ${maxYear} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY${normalDueDatesNote}`
                                : `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY${normalDueDatesNote}`;
                        } else {
                            generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY${normalDueDatesNote}`;
                        }
                    } else if (currentYearInst.length === 1) {
                        const status = currentYearInst[0].status.toUpperCase();

                        if (isAnyDelinquentGlobal) {
                            generatedNotes = isPriorYearPaid
                                ? `ALL PRIORS ARE PAID, ${maxYear} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY${normalDueDatesNote}`
                                : `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY${normalDueDatesNote}`;
                        } else {
                            generatedNotes = `ALL PRIORS ARE PAID, ${maxYear} TAXES ARE ${status}, NORMALLY TAXES ARE PAID ANNUALLY${normalDueDatesNote}`;
                        }
                    } else {
                        generatedNotes = isAnyDelinquentGlobal ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";
                    }
                }
            } catch (err) {
                generatedNotes = "Error generating notes: " + err.message;
            }

            const finalData = {
                processed_date: processedDate,
                owner_name: data.owner_name !== "N/A" && data.owner_name ? [data.owner_name].flat() : ["N/A"],
                property_address: data.property_address,
                parcel_number: data.parcel_number,
                land_value: "N/A",
                improvements: "N/A",
                total_assessed_value: "N/A",
                exemption: "N/A",
                total_taxable_value: "N/A",
                taxing_authority: tax_auth,
                notes: generatedNotes,
                delinquent: delinquentStatus,
                total_amount_due: formatDollar(totalDueAcc),
                tax_history: taxHistoryArray,
                property_details: {
                    record_type: "Real Estate",
                    acres: "N/A",
                    lots: "N/A",
                    buildings: "N/A",
                    description: "N/A",
                    district_levy: "N/A",
                    city_levy: "N/A",
                    total_appraisal: "N/A"
                }
            };

            resolve(finalData);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// ─── PIPELINE ────────────────────────────────────────────

const account_search = async (page, url, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            await ac_1(page, url, account);
            const ctx2 = await ac_2(page, tax_auth);
            const ctx3 = await ac_3(page, ctx2);
            const finalData = await ac_4(ctx3);
            resolve({ result: finalData });
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// ─── SEARCH HANDLER ──────────────────────────────────────

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        const county = req.path.replace('/', '').toLowerCase();

        if (!county_data[county]) {
            return res.status(404).json({ error: true, message: `County endpoint '${county}' not found in configuration.` });
        }

        const url = county_data[county]['url'];
        const tax_auth = county_data[county]['auth'];

        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', { error: true, message: "Invalid Access" });
        }

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

        if (fetch_type === "html") {
            account_search(page, url, account, tax_auth)
                .then((data) => res.status(200).render("parcel_data_official", data.result))
                .catch((error) => {
                    console.log(error);
                    res.status(200).render('error_data', { error: true, message: error.message });
                })
                .finally(async () => await context.close());
        } else if (fetch_type === "api") {
            account_search(page, url, account, tax_auth)
                .then((data) => res.status(200).json(data))
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({ error: true, message: error.message });
                })
                .finally(async () => await context.close());
        }
    } catch (error) {
        console.log(error);
        if (fetch_type === "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else if (fetch_type === "api") {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

export { search };
