// Author:- Mayank Nandgowle

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION STRATEGY
// ==========================================
const countyConfigs = {
    franklin: {
        url: "https://franklinks-atpro-pa.tylerhost.net/",
        auth: "Franklin County Treasurer, KS",
        parserKey: "parseFranklin"
    },
    johnson: {
        url: "https://taxbill.jocogov.org/",
        auth: "Johnson County Tax Office, KS",
        parserKey: "parseFranklin"
    },
    wyandotte: {
        url: "https://appr.wycokck.org/",
        auth: "Unified Government Tax Office, KS",
        parserKey: "parseWyandotte"
    }
};

// --- Data Cleansing Helpers ---
const normalizeDate = (dateStr) => {
    if (!dateStr || dateStr.includes("N/A") || dateStr.trim() === "" || dateStr.includes("-")) {
        if (dateStr && dateStr.includes("-")) return dateStr.trim().replace(/-/g, '/');
        return "N/A";
    }
    return dateStr.trim().replace(/\./g, '/');
};

const cleanCurrency = (val) => {
    if (!val || val === "-" || val.trim() === "") return "$0.00";
    let clean = val.replace(/[^0-9.]/g, '');
    return clean ? "$" + parseFloat(clean).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,') : "$0.00";
};

// ==========================================
// 2. PARSERS
// ==========================================
const parsers = {
    // ----------------------------------------------------
    // STRATEGY A: FRANKLIN & JOHNSON (Tabbed Layout)
    // ----------------------------------------------------
    parseFranklin: async (page) => {
        // Click Bills tab
        await page.evaluate(() => {
            const billsTab = document.querySelector("[id$='_tdBillsTab']") || document.getElementById("tdBillsTab");
            if (billsTab) billsTab.click();
        });

        // ✅ FIX 1 (Franklin blank first search):
        // Wait for the Bills tab AJAX to fully settle using a two-phase check:
        // Phase 1 — wait for any loading mask to disappear (AJAX in-flight indicator)
        // Phase 2 — wait for tblBills tables OR a definitive no-bills message
        // A fixed setTimeout or single-selector wait fires too early on cold loads.
        await page.waitForFunction(() => {
            // Phase 1: block while loading mask is visible
            const loadingMask = document.querySelector(
                "[id$='_UpdateProgress1'], .ajaxLoader, .k-loading-mask, [id*='UpdateProgress']"
            );
            if (loadingMask && loadingMask.style.display !== 'none' && loadingMask.offsetParent !== null) {
                return false;
            }
            // Phase 2: Bills tab content has landed
            const hasBillsTables = document.querySelectorAll("table[id*='tblBills']").length > 0;
            const hasNoBillsMsg = !!document.querySelector(
                "[id$='_divNoBillsMessage'], .noBillsMessage, [id*='NoBills']"
            );
            return hasBillsTables || hasNoBillsMsg;
        }, { timeout: 20000 }).catch(() => {
            // Non-fatal: property may genuinely have no bill tables; parser will return empty list
        });

        return await page.evaluate(() => {
            const getVal = (css) => document.querySelector(css)?.textContent.trim() ?? "";

            // ✅ FIX 2 (Johnson owner): Johnson's detail header uses plain text spans
            // in a Bootstrap grid layout, NOT the standard [id$='_tdOwnerName'] pattern.
            // Pull owner from the page header Quick Ref block as a reliable fallback.
            let ownerName = getVal("[id$='_tdOwnerName']")
                || getVal("[id$='_tdOIOwnerName']")
                || getVal(".divOwnersLabel")
                // Johnson header layout selectors
                || (() => {
                    const labels = Array.from(document.querySelectorAll("span, div, td"));
                    for (let i = 0; i < labels.length; i++) {
                        if (labels[i].textContent.trim().toUpperCase() === "OWNER" && labels[i + 1]) {
                            const val = labels[i + 1].textContent.trim();
                            if (val && val.length > 2 && !val.toUpperCase().includes("OWNER")) return val;
                        }
                    }
                    return "";
                })();
            ownerName = ownerName.replace(/Owner:/ig, '').trim();

            let address = getVal("[id$='_tdPropertyAddress']") || getVal("[id$='_tdOIMailingAddress']");
            address = address.replace(/Property Address:/ig, '').trim();

            const quickRef = getVal("[id$='_tdPropertyID']").replace("Quick Ref ID:", "").trim();

            let assessedVal = getVal("[id$='_divPPVITotal']")
                || getVal("[id$='_tdTotalAssessedValue']")
                || getVal("[id$='_tdTotalTaxableValue']");
            assessedVal = assessedVal.replace(/20\d{2}.*Value:/i, '').trim();

            let records = [];
            const tables = document.querySelectorAll("table");

            tables.forEach(table => {
                const idAttr = table.id || "";
                const yearMatch = idAttr.match(/tblBills(\d{4})/);
                if (!yearMatch) return;

                const yearStr = yearMatch[1];
                const installmentHeaders = Array.from(table.querySelectorAll("tr.installmentRow"));

                if (installmentHeaders.length > 0) {
                    installmentHeaders.forEach((insRow) => {
                        let paidDateStr = "N/A";
                        const mobileHeader = insRow.querySelector(".thBillsInstallmentsMobile");
                        if (mobileHeader?.textContent.includes("Last Paid Date:")) {
                            paidDateStr = mobileHeader.textContent.split("Last Paid Date:")[1].trim();
                        }

                        let nextRow = insRow.nextElementSibling;
                        let totalTaxesDue = 0;
                        let amountPaidValue = 0;
                        let hasActualData = false;

                        while (nextRow && !nextRow.classList.contains("installmentRow") && !nextRow.classList.contains("totals")) {
                            const tds = Array.from(nextRow.querySelectorAll("td"));
                            if (tds.length >= 4) {
                                const due = parseFloat(tds[2].textContent.replace(/[^0-9.]/g, '')) || 0;
                                const paid = parseFloat(tds[3].textContent.replace(/[^0-9.]/g, '')) || 0;
                                totalTaxesDue += due;
                                amountPaidValue += paid;
                                // ✅ FIX 3: Track whether any row has non-zero data.
                                // Johnson deactivated parcels show installment HEADER rows
                                // but zero-value line items — we mark these as "no real data"
                                // so they get filtered out downstream instead of poisoning notes.
                                if (due > 0 || paid > 0) hasActualData = true;
                            }
                            nextRow = nextRow.nextElementSibling;
                        }

                        const remainingBalanceDue = totalTaxesDue - amountPaidValue;

                        records.push({
                            year: parseInt(yearStr),
                            payment_type: installmentHeaders.length > 1 ? "Semi-Annual" : "Annual",
                            base_amount: totalTaxesDue.toFixed(2),
                            amount_paid: amountPaidValue.toFixed(2),
                            amount_due: remainingBalanceDue > 0 ? remainingBalanceDue.toFixed(2) : "0.00",
                            paid_date: paidDateStr,
                            has_actual_data: hasActualData  // propagated for downstream filtering
                        });
                    });
                }
            });

            return { ownerName, address, quickRef, assessedVal, taxHistoryList: records };
        });
    },

    // ----------------------------------------------------
    // STRATEGY B: WYANDOTTE COUNTY (Dashboard Layout)
    // ----------------------------------------------------
    parseWyandotte: async (page) => {
        return await page.evaluate(() => {
            const getVal = (css) => document.querySelector(css)?.textContent.trim() ?? "-";

            let ownerName = "";
            const ownerSelect = document.querySelector("select[id$='_ddOwners']");
            if (ownerSelect?.options.length > 0) {
                ownerName = ownerSelect.options[ownerSelect.selectedIndex].text.trim();
            } else {
                ownerName = getVal("[id$='_tdOwnerName']") || getVal("[id$='_tdOIOwnerName']") || getVal(".divOwnersLabel");
            }
            ownerName = ownerName.replace(/Owner:/ig, '').trim();

            const address = getVal("[id$='_tdPropertyAddress']").replace(/Property Address:/ig, '').trim();
            const quickRef = getVal("[id$='_tdPropertyID']").replace("Quick Ref ID:", "").trim();
            const assessedVal = getVal("[id$='_tdTotalAppraisedValue']").replace(/20\d{2}.*Value:/i, '').trim();

            let records = [];
            const taxRollTable = document.querySelector("[id$='_tblTaxRollData']");
            if (taxRollTable) {
                const rows = Array.from(taxRollTable.querySelectorAll("tr:not(.tableHeaders)"));
                rows.forEach(row => {
                    const tds = Array.from(row.querySelectorAll("td"));
                    if (tds.length >= 7) {
                        const yearStr = tds[1].textContent.replace(/YEAR:/i, '').trim();
                        const genTaxes = tds[3].textContent.replace(/GENERAL TAXES:/i, '').trim();
                        const amountDue = tds[6].textContent.replace(/TOTAL DUE:/i, '').trim();
                        records.push({
                            year: parseInt(yearStr),
                            payment_type: "Annual",
                            base_amount: genTaxes,
                            amount_paid: parseFloat(amountDue.replace(/[^0-9.]/g, '')) === 0 ? genTaxes : "$0.00",
                            amount_due: amountDue,
                            paid_date: parseFloat(amountDue.replace(/[^0-9.]/g, '')) === 0 ? "12/20/" + yearStr : "N/A",
                            has_actual_data: true
                        });
                    }
                });
            }

            return { ownerName, address, quickRef, assessedVal, taxHistoryList: records };
        });
    }
};

// ==========================================
// 3. ORGANIC WORKFLOW INTERACTORS
// ==========================================

const ac_1 = async (page, url) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const isJohnson = url.includes("taxbill.jocogov.org");
    if (isJohnson) {
        await page.waitForFunction(() => {
            return !!document.querySelector("#SearchText, input.k-input-inner, input[type='text']");
        }, { timeout: 30000 }).catch(() => {
            throw new Error("Johnson County: Cloudflare challenge did not resolve in time");
        });
    }
};

const ac_2 = async (page, account) => {
    const inputSelector = "#SearchText, input.k-input-inner, input[type='text']";
    await page.waitForSelector(inputSelector, { visible: true, timeout: 15000 });

    await page.evaluate(() => {
        const ddl = window.$ ? window.$("#SearchType").data("kendoDropDownList") : null;
        if (ddl) {
            ddl.value("QuickRefID");
            ddl.trigger("change");
        } else {
            const selectEl = document.querySelector("select[id$='_SearchType']");
            if (selectEl) {
                selectEl.value = "QuickRefID";
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }).catch(() => {});

    let safeAccount = account.trim();

    await page.evaluate((selector, val) => {
        const inputs = document.querySelectorAll(selector);
        const target = Array.from(inputs).find(i =>
            i.id.includes("SearchText") || i.className.includes("k-input-inner") || i.type === "text"
        );
        if (target) {
            target.focus();
            target.value = "";
            target.value = val;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, inputSelector, safeAccount);

    const inputHandle = await page.$(inputSelector);
    if (inputHandle) {
        await inputHandle.focus();
        await page.keyboard.press('Enter');
    }

    await page.waitForFunction((targetVal) => {
        const mask = document.querySelector("#grid .k-loading-mask, .k-loading-image");
        if (mask) return false;

        const tbody = document.querySelector("#grid table tbody");
        if (!tbody) return false;

        const text = tbody.innerText.toUpperCase();
        const hasNoRecords =
            text.includes("NO PROPERTIES FOUND") ||
            text.includes("NO ITEMS TO DISPLAY") ||
            text.includes("NO RECORDS FOUND") ||
            !!document.querySelector('.k-grid-norecords');
        if (hasNoRecords) return true;

        const rows = Array.from(tbody.querySelectorAll("tr.k-master-row, tr"));
        if (rows.length > 0 && tbody.innerText.replace(/\s+/g, '').toUpperCase()
            .includes(targetVal.replace(/\s+/g, '').toUpperCase())) {
            return true;
        }
        return false;
    }, { timeout: 20000 }, safeAccount);

    const validationState = await page.evaluate(() => {
        const tbody = document.querySelector("#grid table tbody");
        if (!tbody) return { isError: true, isEmpty: true };
        const text = tbody.innerText.toUpperCase();
        const structuralFailure = (
            text.includes("NO PROPERTIES FOUND") ||
            text.includes("NO ITEMS TO DISPLAY") ||
            text.includes("NO RECORDS FOUND") ||
            (tbody.children.length === 1 && !!tbody.querySelector('.k-grid-norecords'))
        );
        const isActuallyBlank = tbody.innerText.trim() === "" || tbody.querySelectorAll('tr').length === 0;
        return { isError: structuralFailure, isEmpty: isActuallyBlank };
    });

    if (validationState.isError || validationState.isEmpty) {
        throw new Error("No exact match found or account record does not exist");
    }
};

const ac_3 = async (page, account, county) => {
    const config = countyConfigs[county];

    await page.waitForSelector("#grid .k-grid-content tr.k-master-row", { timeout: 15000 });

    const clicked = await page.evaluate((targetAccount) => {
        const rows = Array.from(document.querySelectorAll("#grid .k-grid-content tr.k-master-row"));
        for (let row of rows) {
            if (row.innerText.replace(/\s+/g, '').toUpperCase()
                .includes(targetAccount.replace(/\s+/g, '').toUpperCase())) {
                const link = row.querySelector("a");
                if (link) { link.click(); return true; }
                row.click();
                return true;
            }
        }
        if (rows.length > 0) {
            const firstRowLink = rows[0].querySelector("a");
            if (firstRowLink) { firstRowLink.click(); return true; }
            rows[0].click();
            return true;
        }
        return false;
    }, account);

    if (!clicked) throw new Error("No exact match found or account record does not exist");

    await page.waitForSelector("[id$='_divPropertyDetails'], #dnn_ContentPane", { timeout: 25000 });

    // ✅ FIX (Johnson timeout): Johnson's detail page uses a Bootstrap header layout —
    // owner text is NOT in [id$='_tdOwnerName'] so the strict owner poll always times out.
    // Strategy: wait for the detail CONTAINER to have substantial text content (>30 chars),
    // which reliably indicates the AJAX render is complete regardless of selector variance.
    // Timeout is 10s (not 20s); catch is non-fatal so parser always runs.
    await page.waitForFunction(() => {
        const pane = document.querySelector("[id$='_divPropertyDetails'], #dnn_ContentPane");
        if (!pane) return false;
        // Container has meaningful content = page is hydrated
        if (pane.innerText.trim().length > 30) return true;
        return false;
    }, { timeout: 10000 }).catch(() => {
        // Non-fatal: parser will extract what it can; empties resolve to N/A
    });

    const parserFunction = parsers[config.parserKey];
    const rawParsed = await parserFunction(page);

    if (!rawParsed) {
        throw new Error("Scraper read validation failed: Parser returned null");
    }

    // ✅ FIX (Johnson zero-value records / wrong notes year):
    // Filter out records where has_actual_data is false BEFORE sorting/filtering.
    // Deactivated Johnson parcels have tblBills{YEAR} tables with installment header
    // rows but zero-value line items — these are structural DOM artifacts, not real bills.
    // Without this filter they produce fake "PAID" records with wrong years in notes.
    const meaningfulRecords = rawParsed.taxHistoryList.filter(r => r.has_actual_data === true);

    let sortedRecords = meaningfulRecords.sort((a, b) => b.year - a.year);
    let finalFilteredRecords = [];

    if (sortedRecords.length > 0) {
        const latestYear = sortedRecords[0].year;
        sortedRecords.forEach(rec => {
            if (rec.year === latestYear) finalFilteredRecords.push(rec);
        });
        sortedRecords.forEach(rec => {
            if (rec.year !== latestYear) {
                const numericalDue = parseFloat(rec.amount_due.replace(/[^0-9.]/g, '')) || 0;
                if (numericalDue > 0) finalFilteredRecords.push(rec);
            }
        });
    }

    finalFilteredRecords.sort((a, b) => a.year - b.year);

    let main_data = {
        processed_date: new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
        order_number: "", borrower_name: "",
        owner_name: [rawParsed.ownerName || "N/A"],
        property_address: rawParsed.address || "N/A",
        parcel_number: rawParsed.quickRef || account,
        land_value: "", improvements: "",
        total_assessed_value: cleanCurrency(rawParsed.assessedVal),
        exemption: "", total_taxable_value: cleanCurrency(rawParsed.assessedVal),
        taxing_authority: config.auth,
        notes: "", delinquent: "NONE", tax_history: []
    };

    // ✅ FIX (empty tax history → N/A note):
    // When no meaningful bill records exist (deactivated parcel, no bills ever issued),
    // output a clear N/A note instead of fabricating a year from current date or DOM garbage.
    if (finalFilteredRecords.length === 0) {
        main_data.notes = "N/A — NO TAX BILL DATA AVAILABLE FOR THIS PARCEL";
        return main_data;
    }

    const isAnyDelinquent = finalFilteredRecords.some(
        h => parseFloat(h.amount_due.replace(/[^0-9.]/g, '')) > 0
    );
    const topYear = finalFilteredRecords[finalFilteredRecords.length - 1]?.year || new Date().getFullYear();
    const globalPaymentType = finalFilteredRecords.some(f => f.payment_type === "Semi-Annual")
        ? "SEMI ANNUALLY" : "ANNUALLY";

    if (isAnyDelinquent) {
        const delqYears = finalFilteredRecords
            .filter(t => parseFloat(t.amount_due.replace(/[^0-9.]/g, '')) > 0)
            .map(t => t.year);
        main_data.delinquent = `TAXES ARE DELINQUENT FOR YEAR(S): ${[...new Set(delqYears)].join(", ")}, NEED TO CALL FOR PAYOFF`;
        main_data.notes = `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID ${globalPaymentType}, NORMAL DUE DATE IS 12/20`;
    } else {
        main_data.notes = `ALL PRIORS ARE PAID, ${topYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${globalPaymentType}, NORMAL DUE DATE IS 12/20`;
    }

    for (let record of finalFilteredRecords) {
        const dueNumeric = parseFloat(record.amount_due.replace(/[^0-9.]/g, '')) || 0;
        main_data.tax_history.push({
            jurisdiction: "County",
            year: record.year.toString(),
            payment_type: record.payment_type || "Annual",
            status: dueNumeric > 0 ? "Delinquent" : "Paid",
            base_amount: cleanCurrency(record.base_amount),
            amount_paid: cleanCurrency(record.amount_paid),
            amount_due: cleanCurrency(record.amount_due),
            mailing_date: "N/A",
            due_date: `12/20/${record.year}`,
            delq_date: `12/21/${record.year}`,
            paid_date: normalizeDate(record.paid_date),
            good_through_date: ""
        });
    }

    return main_data;
};

// ==========================================
// 4. API CONTROLLER ROUTE INTERFACE
// ==========================================
const search = async (req, res) => {
    const county = req.path.replace('/', '').toLowerCase();
    const { fetch_type, account } = req.body;

    if (!countyConfigs[county]) {
        return res.status(400).json({ error: true, message: "County Config Unavailable" });
    }

    let browser, context;
    try {
        browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'permissions', {
                get: () => ({ query: () => Promise.resolve({ state: 'granted' }) })
            });
            window.chrome = { runtime: {} };
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
        page.setDefaultNavigationTimeout(45000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'media', 'font'].includes(type)) req.abort();
            else req.continue();
        });

        await ac_1(page, countyConfigs[county].url);
        await ac_2(page, account);
        const data = await ac_3(page, account, county);

        if (fetch_type === "html") res.status(200).render("parcel_data_official", data);
        else res.status(200).json({ result: data });

    } catch (error) {
        console.error(`[Scraper Error - ${county}]:`, error.message);
        if (fetch_type === "html") res.status(200).render('error_data', { error: true, message: error.message });
        else res.status(500).json({ error: true, message: error.message });
    } finally {
        if (context) await context.close();
    }
};

export { search };
