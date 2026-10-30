// Author: Mayank Nandgowle

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION
// ==========================================

const county_data = {
    adams:    { url: "http://auditor.adamscounty01.us/cgi.exe?CALL_PROGRAM=C009LIST",                    auth: "ADAMS COUNTY TREASURER, IN"    },
    dearborn: { url: "http://treasurer.dearborncounty15.us/cgi.exe?PAGEID=0004&CALL_PROGRAM=C009LIST",  auth: "DEARBORN COUNTY TREASURER, IN" },
    dubois:   { url: "http://auditor.duboiscounty19.us/cgi.exe?CALL_PROGRAM=C009LIST",                  auth: "DUBOIS COUNTY TREASURER, IN"   },
    harrison: { url: "http://treasurer.harrisoncounty31.us/cgi.exe?PAGEID=0013&CALL_PROGRAM=C009LIST",  auth: "HARRISON COUNTY TREASURER, IN" },
    jefferson:{ url: "http://treasurer.jeffersoncounty39.us/cgi.exe?PAGEID=0004&CALL_PROGRAM=C009LIST", auth: "JEFFERSON COUNTY TREASURER, IN"},
    jennings: { url: "http://treasurer.jenningscounty40.us/cgi.exe?PAGEID=0004&CALL_PROGRAM=C009LIST",  auth: "JENNINGS COUNTY TREASURER, IN" },
    madison:  { url: "http://treasurer.madisoncounty48.us/cgi.exe?PAGEID=0003&CALL_PROGRAM=C009LIST",   auth: "MADISON COUNTY TREASURER, IN"  },
    martin:   { url: "http://auditor.martincounty51.us/cgi.exe?PAGEID=0004&CALL_PROGRAM=C009LIST",      auth: "MARTIN COUNTY TREASURER, IN"   },
    morgan:   { url: "http://auditor.morgancounty55.us/cgi.exe?CALL_PROGRAM=C009LIST",                  auth: "MORGAN COUNTY TREASURER, IN"   },
    shelby:   { url: "http://auditor.shelbycounty73.us/cgi.exe?PAGEID=0013&CALL_PROGRAM=C009LIST",      auth: "SHELBY COUNTY TREASURER, IN"   },
    wabash:   { url: "http://assessor.wabashcounty85.us/cgi.exe?PAGEID=0003&CALL_PROGRAM=C009LIST",     auth: "WABASH COUNTY TREASURER, IN"   },
};

const TIMEOUT = { timeout: 90000 };

// ==========================================
// 2. STEP 1 — Navigate to county portal
// ==========================================

const ac_1 = async (page, url) => {
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", ...TIMEOUT });
    } catch {
        throw new Error("Portal Connection Unsuccessful");
    }
};

// ==========================================
// 3. STEP 2 — Search parcel & navigate to record
// ==========================================

const ac_2 = async (page, account) => {
    try {
        const inputSelector = 'input[name="FIND_TAXID"]';
        await page.waitForSelector(inputSelector, { timeout: 15000 });

        await page.evaluate((sel, val) => {
            const el = document.querySelector(sel);
            if (el) el.value = val;
        }, inputSelector, account.trim());

        await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
            page.evaluate(() => {
                const btn = document.querySelector('button[name="SEARCH.X"]');
                if (btn) btn.click();
            })
        ]);

        const navigationLink = await page.evaluate((targetAccount) => {
            const resultsSpan = document.querySelector('span.RESULTS');
            if (resultsSpan && resultsSpan.innerText.trim() === "0") return "NOT_FOUND";

            const rows = document.querySelectorAll('tr[valign="TOP"]');
            if (rows.length === 0) return "NOT_FOUND";

            const cleanTarget = targetAccount.replace(/[-\s]/g, '').toLowerCase();

            for (const row of rows) {
                const aTag = row.querySelector('td:nth-child(2) a');
                if (aTag) {
                    const linkText = aTag.innerText.replace(/[-\s\n\r]/g, '').toLowerCase();
                    if (linkText.includes(cleanTarget)) return aTag.href;
                }
            }

            const fallback = document.querySelector('tr[valign="TOP"] td:nth-child(2) a');
            return fallback ? fallback.href : "NOT_FOUND";
        }, account);

        if (navigationLink === "NOT_FOUND") throw new Error("Record not found");

        await page.goto(navigationLink, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (error) {
        throw new Error(
            error.message === "Record not found"
                ? "Record not found"
                : "Search processing failed"
        );
    }
};

// ==========================================
// 4. STEP 3 — Scrape the record page
// ==========================================

const ac_3 = async (page, account, county) => {
    await page.waitForSelector('table', { timeout: 20000 });
    await new Promise(r => setTimeout(r, 10000));

    const payload = await page.evaluate(() => {

        // ─────────────────────────────────────────────────────────────
        // SAFE-CELL HELPERS — clone+strip nested tables before ANY read.
        // This is the single fix for CGI text-bleeding. Every cell read
        // in this file goes through cellText() or cellHTML(). No raw
        // .innerText / .innerHTML calls anywhere in the scrape logic.
        // ─────────────────────────────────────────────────────────────

        const stripTables = (cell) => {
            if (!cell) return null;
            const clone = cell.cloneNode(true);
            clone.querySelectorAll('table').forEach(t => t.remove());
            return clone;
        };

        const cellText = (cell) => {
            const c = stripTables(cell);
            if (!c) return "";
            return (c.innerText || c.textContent || "").replace(/\s+/g, ' ').trim();
        };

        const cellHTML = (cell) => {
            const c = stripTables(cell);
            return c ? c.innerHTML : "";
        };

        const decodeEntities = (str = "") =>
            str
                .replace(/&nbsp;/gi, ' ')
                .replace(/&amp;/gi,  '&')
                .replace(/&lt;/gi,   '<')
                .replace(/&gt;/gi,   '>');

        const htmlToText = (html = "") =>
            decodeEntities(html)
                .replace(/<br\s*\/?>/gi, ', ')
                .replace(/<[^>]*>/gm,    '')
                .replace(/,\s*,/g,       ',')
                .replace(/\s+/g,         ' ')
                .trim();

        const parseMoney = (raw = "") => {
            const n = parseFloat(String(raw).replace(/[^0-9.-]+/g, "")) || 0;
            return "$" + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        const parseFloat_ = (str) =>
            parseFloat(String(str || "").replace(/[^0-9.-]+/g, "")) || 0;

        const LABEL_BLEED_RE = /property|address|parcel|tax\s*id|map\s*#|acres|lots|district|township|school|section|range|deeded|owner/i;
        const isBleedOrEmpty = (str) =>
            !str || str.endsWith(':') || LABEL_BLEED_RE.test(str);

        // ─────────────────────────────────────────────────────────────
        // STATE
        // ─────────────────────────────────────────────────────────────
        let owner_name       = "N/A";
        let physical_address = "N/A";
        let total_assessed   = "$0.00";
        let taxable_value    = "$0.00";
        const parsed_years   = {};

        const trRows = Array.from(document.querySelectorAll('tr'));

        for (let i = 0; i < trRows.length; i++) {
            const tr    = trRows[i];
            const cells = tr.cells;
            if (!cells || cells.length === 0) continue;

            const label = cellText(cells[0]).toLowerCase();

            // ── Owner / Deeded Owner ─────────────────────────────────
            if (
                (label.includes("deeded owner") || label === "owner:" || label === "owner") &&
                owner_name === "N/A"
            ) {
                let rawHTML = "";
                for (let c = 1; c < cells.length; c++) {
                    if (cellText(cells[c])) { rawHTML = cellHTML(cells[c]); break; }
                }
                if (rawHTML.trim()) {
                    const fullRaw = decodeEntities(rawHTML)
                        .split(/<br\s*\/?>/i)[0]
                        .replace(/<[^>]*>/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    owner_name = isBleedOrEmpty(fullRaw) ? "N/A" : fullRaw;
                }
            }

            // ── Property / Location Address ──────────────────────────
            if (
                (label.includes("property address") || label.includes("location address")) &&
                physical_address === "N/A"
            ) {
                let rawHTML = "";
                for (let c = 1; c < cells.length; c++) {
                    if (cellText(cells[c])) { rawHTML = cellHTML(cells[c]); break; }
                }
                if (!rawHTML.trim() && trRows[i + 1]) {
                    const nc = trRows[i + 1].cells;
                    for (let k = 1; k < nc.length; k++) {
                        const t = cellText(nc[k]);
                        if (t && /\d/.test(t) && /[a-zA-Z]/.test(t)) { rawHTML = cellHTML(nc[k]); break; }
                    }
                    if (!rawHTML.trim() && nc.length > 1) rawHTML = cellHTML(nc[nc.length - 1]);
                }
                if (rawHTML.trim()) {
                    const candidate = htmlToText(rawHTML);
                    physical_address = isBleedOrEmpty(candidate) ? "N/A" : candidate;
                }
            }

            // ── Gross Assessment ─────────────────────────────────────
            if (
                label.includes("gross assessment") &&
                !label.includes("total") &&
                !label.includes("deduction")
            ) {
                if (cells.length > 1) {
                    const val = cellText(cells[cells.length - 1]);
                    if (val && /\d/.test(val)) total_assessed = parseMoney(val);
                }
            }

            // ── Taxable Assessment ───────────────────────────────────
            if (
                (label.includes("taxable assessment") || label.startsWith("= taxable")) &&
                !label.includes("gross")
            ) {
                if (cells.length > 1) {
                    const val = cellText(cells[cells.length - 1]);
                    if (val && /\d/.test(val)) taxable_value = parseMoney(val);
                }
            }

            // ── Payable Year Block Header ────────────────────────────
            // Matches "2025 Payable 2026" in cells[0].
            //
            // The AUTHORITATIVE source of installment amounts is NOT the
            // "Spring/Fall Installment Due" summary labels — those are just
            // a display convenience and can bleed or be absent.
            //
            // The real data lives in the charge rows inside the block:
            //
            //   <tr><td>"990: Solid Waste..."</td><td>"1st Installment Tax"</td><td>24.00</td></tr>
            //   <tr><td>"001: Chester Twp"</td>   <td>"1st Installment Tax"</td><td>562.92</td></tr>
            //   <tr><td>"001: Chester Twp"</td>   <td>"2nd Installment Tax"</td><td>562.92</td></tr>
            //
            // Strategy:
            //   1. Sum all rows where cells[1] contains "1st installment tax" → spring_base
            //   2. Sum all rows where cells[1] contains "2nd installment tax" → fall_base
            //   3. Sum green receipt row amounts (absolute value) → total_paid
            //   4. Read the "Due:" row → remaining_due
            //   5. Derive what's paid vs owed per installment:
            //      - If total_paid >= spring_base → spring fully paid, spring_due = 0
            //      - remaining_due tells us fall_due exactly
            //   6. Fallback: if no 1st/2nd rows found, use "Spring/Fall Installment Due"
            //      header cells or "Balance:" row / 2 as last resort.

            const yearMatch = cellText(cells[0]).match(/^(\d{4})\s+Payable\s+(\d{4})$/i);

            if (yearMatch) {
                const taxYear = yearMatch[1];

                let spring_base      = 0;   // sum of all 1st Installment Tax charges
                let fall_base        = 0;   // sum of all 2nd Installment Tax charges
                let total_paid       = 0;   // sum of receipt row amounts
                let remaining_due    = 0;   // the "Due:" row at the bottom
                let spring_paid_date = "N/A";
                let fall_paid_date   = "N/A";

                // Also track header-cell labels as fallback
                let hdr_spring       = null;
                let hdr_fall         = null;
                let hdr_balance      = 0;

                // ── PASS 1: header-row sibling cells (fallback values only) ──
                for (let k = 1; k + 1 < cells.length; k++) {
                    const hLabel = cellText(cells[k]).toLowerCase();
                    const hVal   = cellText(cells[k + 1]);
                    if (hLabel.includes("spring installment due")) { hdr_spring = parseFloat_(hVal); k++; }
                    else if (hLabel.includes("fall installment due")) { hdr_fall = parseFloat_(hVal); k++; }
                    else if (hLabel.includes("total payments"))       { total_paid = parseFloat_(hVal); k++; }
                    else if (hLabel === "balance:")                   { hdr_balance = parseFloat_(hVal); k++; }
                }

                // ── PASS 2: scan sibling rows for charge lines, receipts, Due row ──
                for (let j = i + 1; j < Math.min(trRows.length, i + 80); j++) {
                    const innerTr = trRows[j];
                    const ic      = innerTr.cells;
                    if (!ic || ic.length === 0) continue;

                    // Stop at the next year block
                    if (/^\d{4}\s+Payable\s+\d{4}$/i.test(cellText(ic[0]))) break;

                    const bg = (innerTr.getAttribute('bgcolor') || "")
                        .replace('#', '').toUpperCase().trim();

                    // ── Green receipt row ────────────────────────────
                    if (bg === "DDFFDD") {
                        // Amount is in the last cell — portal writes it as negative e.g. -586.92
                        const receiptAmt = Math.abs(parseFloat_(cellText(ic[ic.length - 1])));
                        if (receiptAmt > 0) total_paid += receiptAmt;

                        const rowText = Array.from(ic).map(c => cellText(c)).join(' ');
                        const dateHit = rowText.match(/Effective:\s*(\d{2}\/\d{2}\/\d{4})/);
                        if (dateHit) {
                            if (spring_paid_date === "N/A") spring_paid_date = dateHit[1];
                            else                            fall_paid_date   = dateHit[1];
                        }
                        continue;
                    }

                    // Charge rows have 3 cells: Tax Unit | Description | Amount
                    if (ic.length >= 3) {
                        const desc   = cellText(ic[1]).toLowerCase();
                        const charge = parseFloat_(cellText(ic[ic.length - 1]));

                        if (desc.includes("1st installment tax")) spring_base += charge;
                        if (desc.includes("2nd installment tax")) fall_base   += charge;
                    }

                    // "Due:" row — colspan=2 label in cells[0], amount in cells[1]
                    // Matches bold large-font Due row at the bottom of the block
                    const col0 = cellText(ic[0]).toLowerCase();
                    if (col0.includes("due:") && ic.length >= 2) {
                        const amt = parseFloat_(cellText(ic[ic.length - 1]));
                        if (amt > 0) remaining_due = amt;
                    }

                    // "Total Payments:" row (separate row variant)
                    if (col0.includes("total payments") && total_paid === 0) {
                        total_paid = parseFloat_(cellText(ic[ic.length - 1]));
                    }
                }

                // ── Derive spring_due and fall_due ───────────────────
                //
                // We now have:
                //   spring_base   = what spring was billed  (e.g. 586.92)
                //   fall_base     = what fall was billed    (e.g. 562.92)
                //   total_paid    = sum of all receipts     (e.g. 586.92)
                //   remaining_due = what the portal says is still owed (e.g. 562.92)
                //
                // Simple derivation:
                //   spring_due = spring_base - amount applied to spring
                //   fall_due   = remaining_due  (portal's own "Due:" is authoritative)
                //
                // "Amount applied to spring" = min(total_paid, spring_base)
                // because payments are applied spring-first on all Indiana portals.

                let spring_due, fall_due;

                if (spring_base > 0 || fall_base > 0) {
                    // We have real charge rows — use them
                    const spring_paid_amt = Math.min(total_paid, spring_base);
                    spring_due = Math.max(0, spring_base - spring_paid_amt);

                    // Fall due: if the portal gave us a "Due:" row, trust it.
                    // Otherwise derive from fall_base minus leftover payments.
                    if (remaining_due > 0) {
                        fall_due = remaining_due;
                    } else {
                        const leftover_paid = Math.max(0, total_paid - spring_paid_amt);
                        fall_due = Math.max(0, fall_base - leftover_paid);
                    }
                } else if (hdr_spring !== null || hdr_fall !== null) {
                    // Fallback 1: header-cell summary labels were present
                    spring_due = hdr_spring !== null ? Math.max(0, hdr_spring - total_paid) : 0;
                    fall_due   = hdr_fall   !== null ? hdr_fall : (remaining_due || 0);
                    if (hdr_spring !== null) spring_base = hdr_spring;
                    if (hdr_fall   !== null) fall_base   = hdr_fall;
                } else {
                    // Fallback 2: only a "Balance:" row — split evenly
                    spring_base = hdr_balance / 2;
                    fall_base   = hdr_balance / 2;
                    spring_due  = remaining_due > 0 ? 0 : spring_base;
                    fall_due    = remaining_due > 0 ? remaining_due : fall_base;
                }

                // Round to 2dp to avoid floating point noise
                const r2 = (n) => Math.round(n * 100) / 100;

                parsed_years[taxYear] = {
                    year:             taxYear,
                    spring_base:      r2(spring_base),
                    fall_base:        r2(fall_base),
                    spring_due:       r2(spring_due),   // 0 = paid, >0 = delinquent
                    fall_due:         r2(fall_due),
                    total_paid:       r2(total_paid),
                    spring_paid_date,
                    fall_paid_date,
                };
            }
        }

        return {
            owner_name,
            physical_address,
            total_assessed_value: total_assessed,
            taxable_value,
            parsed_years,
        };
    });

    // ─────────────────────────────────────────────────────────────────
    // POST-PROCESSING — build taxHistoryArray (two rows per year)
    // ─────────────────────────────────────────────────────────────────

    const currentYear     = new Date().getFullYear();
    const availableYears  = Object.keys(payload.parsed_years).map(Number).sort((a, b) => b - a);

    let trackingYear      = availableYears[0] || currentYear;
    const targetYearsList = [];

    while (payload.parsed_years[trackingYear]) {
        const yb = payload.parsed_years[trackingYear];
        targetYearsList.push(yb);
        // Walk back to prior years ONLY if the prior year is itself delinquent.
        // A fully-paid prior year must never be included — nothing to show.
        const priorYb = payload.parsed_years[trackingYear - 1];
        if (
            yb.spring_due + yb.fall_due > 0 &&
            priorYb &&
            priorYb.spring_due + priorYb.fall_due > 0
        ) {
            trackingYear--;
        } else {
            break;
        }
    }

    targetYearsList.sort((a, b) => parseInt(a.year) - parseInt(b.year));

    const isPriorYearPaid = !(
        targetYearsList.length > 1 &&
        (targetYearsList[0].spring_due + targetYearsList[0].fall_due) > 0
    );

    const fmt = (n) =>
        "$" + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const taxHistoryArray = [];

    targetYearsList.forEach(yb => {
        const yr1 = parseInt(yb.year) + 1;

        const springDue = yb.spring_due;   // 0 = paid, >0 = delinquent
        const fallDue   = yb.fall_due;

        // Status logic:
        //   amount_due == 0              → Paid
        //   amount_due > 0, today < delq_date → Due (not yet delinquent)
        //   amount_due > 0, today >= delq_date → Delinquent
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const parseDate = (mmddyyyy) => {
            const [m, d, y] = mmddyyyy.split('/');
            return new Date(+y, +m - 1, +d);
        };

        const springDelqDate = parseDate(`05/11/${yr1}`);
        const fallDelqDate   = parseDate(`11/11/${yr1}`);

        const isSpringDelq = springDue > 0 && today >= springDelqDate;
        const isSpringDue  = springDue > 0 && today <  springDelqDate;
        const isFallDelq   = fallDue   > 0 && today >= fallDelqDate;
        const isFallDue    = fallDue   > 0 && today <  fallDelqDate;

        const springStatus = isSpringDelq ? "Delinquent" : isSpringDue ? "Due" : "Paid";
        const fallStatus   = isFallDelq   ? "Delinquent" : isFallDue   ? "Due" : "Paid";

        // spring_base / fall_base were computed from summing the actual
        // charge rows scraped from the portal — no guessing needed here.
        const springBase = yb.spring_base;
        const fallBase   = yb.fall_base;

        // paid = base - due  (what was actually receipted per installment)
        const springPaid = Math.max(0, springBase - springDue);
        const fallPaid   = Math.max(0, fallBase   - fallDue);

        const baseCommon = {
            jurisdiction:      "County",
            year:               yb.year,
            payment_type:      "Semi-Annual",
            mailing_date:      "N/A",
            good_through_date: "",
        };

        // Spring row
        taxHistoryArray.push({
            ...baseCommon,
            status:      springStatus,
            base_amount: fmt(springBase),
            amount_paid: fmt(springPaid),
            amount_due:  fmt(springDue),
            due_date:    `05/10/${yr1}`,
            delq_date:   `05/11/${yr1}`,
            paid_date:   yb.spring_paid_date,
        });

        // Fall row
        taxHistoryArray.push({
            ...baseCommon,
            status:      fallStatus,
            base_amount: fmt(fallBase),
            amount_paid: fmt(fallPaid),
            amount_due:  fmt(fallDue),
            due_date:    `11/10/${yr1}`,
            delq_date:   `11/11/${yr1}`,
            paid_date:   yb.fall_paid_date,
        });
    });

    const isAnyDelinquent  = taxHistoryArray.some(h => h.status === "Delinquent" || h.status === "Due");
    const delinquentStatus = isAnyDelinquent
        ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF"
        : "NONE";

    const latestYear = targetYearsList[targetYearsList.length - 1]?.year || String(currentYear);

    let dueDatesNote = "";
    if (taxHistoryArray.length >= 2) {
        dueDatesNote = `NORMAL DUE DATES ARE ${taxHistoryArray[0].due_date.slice(0, 5)} AND ${taxHistoryArray[1].due_date.slice(0, 5)}`;
    } else if (taxHistoryArray[0]) {
        dueDatesNote = `NORMAL DUE DATE IS ${taxHistoryArray[0].due_date.slice(0, 5)}`;
    }

    let generatedNotes = "";
    if (taxHistoryArray.length >= 2) {
        const s1        = taxHistoryArray[taxHistoryArray.length - 2].status.toUpperCase();
        const s2        = taxHistoryArray[taxHistoryArray.length - 1].status.toUpperCase();
        const statusStr = `${latestYear} 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}`;

        const hasActualDelinquent = taxHistoryArray.some(h => h.status === "Delinquent");
        const hasOnlyDue          = isAnyDelinquent && !hasActualDelinquent;

        if (isAnyDelinquent) {
            const delinqWord = hasOnlyDue ? "DUE" : "DELINQUENT";
            generatedNotes = isPriorYearPaid
                ? `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${delinqWord}, ${statusStr}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dueDatesNote}`
                : `PRIORS ARE DELINQUENT, ${statusStr}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dueDatesNote}`;
        } else {
            generatedNotes = `ALL PRIORS ARE PAID, ${statusStr}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dueDatesNote}`;
        }
    } else {
        generatedNotes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dueDatesNote}`;
    }

    return {
        processed_date:       new Date().toLocaleDateString('en-US'),
        order_number:         "",
        borrower_name:        "",
        owner_name:           [payload.owner_name],
        property_address:     payload.physical_address,
        parcel_number:        account,
        land_value:           "-",
        improvements:         "-",
        total_assessed_value: payload.total_assessed_value,
        exemption:            "-",
        total_taxable_value:  payload.taxable_value,
        taxing_authority:     county_data[county].auth,
        notes:                generatedNotes,
        delinquent:           delinquentStatus,
        tax_history:          taxHistoryArray,
    };
};

// ==========================================
// 5. ORCHESTRATOR
// ==========================================

const account_search = async (page, url, account, county) => {
    try {
        await ac_1(page, url);
        await ac_2(page, account);
        return await ac_3(page, account, county);
    } catch (error) {
        console.error("[account_search]", error.message);
        throw error;
    }
};

// ==========================================
// 6. REQUEST HANDLER
// ==========================================

const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    const rawCounty =
        req.county ||
        req.params?.county ||
        req.body?.county ||
        req.originalUrl?.split('?')[0].split('/').pop() ||
        "";

    const county = rawCounty.toString().trim().toLowerCase();

    if (!county || !county_data[county]) {
        const msg = `County lookup failed for: "${county || 'undefined'}"`;
        console.error("[Scraper]", msg);
        return fetch_type === "api"
            ? res.status(400).json({ error: true, message: msg })
            : res.status(200).render('error_data', { error: true, message: msg });
    }

    if (fetch_type !== "html" && fetch_type !== "api") {
        return res.status(200).render('error_data', { error: true, message: "Invalid Access" });
    }

    let context;
    try {
        const browser = await getBrowserInstance();
        context       = await browser.createBrowserContext();
        const page    = await context.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (intercepted) => {
            const type = intercepted.resourceType();
            if (type === 'stylesheet' || type === 'font' || type === 'image') {
                intercepted.abort();
            } else {
                intercepted.continue();
            }
        });

        const url = county_data[county].url;

        account_search(page, url, account, county)
            .then((data) => {
                if (fetch_type === "html") {
                    res.status(200).render("parcel_data_official", data);
                } else {
                    res.status(200).json({ result: data });
                }
            })
            .catch((error) => {
                console.error("[search handler]", error.message);
                if (fetch_type === "html") {
                    res.status(200).render('error_data', { error: true, message: error.message });
                } else {
                    res.status(500).json({ error: true, message: error.message });
                }
            })
            .finally(async () => {
                try { await context.close(); } catch (e) { console.error("[context.close]", e.message); }
            });

    } catch (error) {
        console.error("[search outer]", error.message);
        try { await context?.close(); } catch {}
        if (fetch_type === "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

export { search };
