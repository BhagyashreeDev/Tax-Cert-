// Author:- Mayank Nandgowle
// File: govtech_parke.controller.js

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION
// ==========================================

const COUNTY_DATA = {
    parke: {
        url:        "https://www.govtechtaxpro.com/index.php?module=parceldetail",
        stateId:    "15",
        id:         "15061",
        auth:       "Parke County Treasurer, IN",
        stateEl:    "#stateselection",
        countyEl:   "#countyselectionresult",
    },
};

const BLOCKED_RESOURCES = new Set(["stylesheet", "font", "image", "media"]);
// NOTE: "script" is NOT blocked — the county dropdown JS must execute to set the session

// ==========================================
// 2. SESSION CACHE (module-level singleton)
// ==========================================

let _sessionCookies = null; // [{ name, value, domain, path }]
let _sessionExpiry  = 0;
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ==========================================
// 3. UTILITIES
// ==========================================

const toFloat  = (v) => parseFloat((v || "0").replace(/[^0-9.-]/g, "")) || 0;

// ── UPDATED: adds thousand-separator commas (e.g. $12,000.00) ──
const fmtAmt = (n) =>
    "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (dateStr) => {
    if (!dateStr || dateStr === "N/A" || !dateStr.trim()) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
};

const addOneDay = (dateStr) => {
    if (!dateStr || dateStr === "N/A") return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d)) return "N/A";
    d.setDate(d.getDate() + 1);
    return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
};

const cookieHeader = (cookies) =>
    cookies.map((c) => `${c.name}=${c.value}`).join("; ");

// ==========================================
// 4. SESSION HARVESTER (one-time Puppeteer run)
// ==========================================

const harvestSession = async (browser, config) => {
    const context = await browser.createBrowserContext();
    const page    = await context.newPage();

    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Only block heavy non-script resources during harvest
    await page.setRequestInterception(true);
    page.on("request", (req) =>
        BLOCKED_RESOURCES.has(req.resourceType()) ? req.abort() : req.continue()
    );

    try {
        await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 30000 });

        // Step 1: Select State
        await page.waitForSelector(config.stateEl, { timeout: 10000 });
        await page.select(config.stateEl, config.stateId);

        // Step 2: Wait for county dropdown to populate, then select county
        await page.waitForFunction(
            (el, val) => {
                const s = document.querySelector(el);
                return s && [...s.options].some((o) => o.value === val);
            },
            { timeout: 10000 },
            config.countyEl,
            config.id
        );
        await page.select(config.countyEl, config.id);

        // Step 3: Fire change event so server-side session variable is set
        await page.evaluate((el) => {
            document.querySelector(el).dispatchEvent(new Event("change", { bubbles: true }));
        }, config.countyEl);

        // Brief pause for any XHR triggered by the change event
        await new Promise((r) => setTimeout(r, 600));

        const cookies = await page.cookies();
        return cookies; // full cookie jar
    } finally {
        await context.close();
    }
};

// ==========================================
// 5. CORE EXTRACTION (pure fetch, no Puppeteer page needed)
// ==========================================

const extractGovTech = async (browser, account, countyKey) => {
    const config = COUNTY_DATA[countyKey];

    // --- Session: reuse cached or harvest fresh ---
    if (!_sessionCookies || Date.now() > _sessionExpiry) {
        console.log("[govtech] Harvesting fresh session...");
        _sessionCookies = await harvestSession(browser, config);
        _sessionExpiry  = Date.now() + SESSION_TTL_MS;
    }
    const cookieStr = cookieHeader(_sessionCookies);
    const baseUrl   = "https://www.govtechtaxpro.com";
    const headers   = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie":        cookieStr,
        "User-Agent":    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer":       config.url,
    };

    // --- Step 1: POST search to get results HTML ---
    const payload = `idCounty=${config.id}&parcelnumber=${encodeURIComponent(account)}&formsubmit=Parcel+Search&taxyear=All&offset=0`;

    const searchRes  = await fetch(`${baseUrl}/index.php?module=parceldetail`, {
        method:  "POST",
        headers,
        body:    payload,
    });
    const searchHtml = await searchRes.text();

    // Guard: session failure detection
    if (
        searchHtml.includes("Property Search") &&
        searchHtml.includes("stateselection") &&
        !searchHtml.includes("parceldetailpopup")
    ) {
        // Invalidate cache and throw — caller can retry once
        _sessionCookies = null;
        throw new Error("SESSION_FAILURE: Server returned search page. Session invalidated.");
    }

    // --- Step 2: Extract internal ID ---
    const idMatch =
        searchHtml.match(/modules\/parceldetailpopup\.php\?id=(\d+)/i) ||
        searchHtml.match(/parceldetailpopup\.php',\s*data:\s*\{[^}]*id:\s*'(\d+)'/i) ||
        searchHtml.match(/id=(\d+)&print=1/i);

    if (!idMatch) throw new Error("Record not found for account: " + account);
    const internalId = idMatch[1];

    // --- Step 3: Fetch popup + group details in parallel ---
    const [popupRes, groupRes] = await Promise.all([
        fetch(`${baseUrl}/modules/parceldetailpopup.php?id=${internalId}`, { headers }),
        fetch(`${baseUrl}/modules/parcelgroupdetails.php?id=${internalId}`, { headers }),
    ]);

    const [popupHtml, groupHtml] = await Promise.all([
        popupRes.text(),
        groupRes.text(),
    ]);

    // --- Step 4: Parse popup HTML (current year) ---
    const parsed = parsePopup(popupHtml, account);

    // --- Step 5: Parse group details HTML ---
    const group = parseGroupDetails(groupHtml);

    // --- Step 6: Fetch prior year popup (taxyear = currentYear - 1) ---
    // The search POST with taxyear=All returns current year by default.
    // To get prior year we POST with the specific prior year value.
    try {
        const currentYear = parsed.tax_history?.[0]?.year;
        if (currentYear && currentYear !== "N/A") {
            const priorYear    = String(parseInt(currentYear) - 1);
            const priorPayload = `idCounty=${config.id}&parcelnumber=${encodeURIComponent(account)}&formsubmit=Parcel+Search&taxyear=${priorYear}&offset=0`;
            const priorSearchRes  = await fetch(`${baseUrl}/index.php?module=parceldetail`, {
                method: "POST", headers, body: priorPayload,
            });
            const priorSearchHtml = await priorSearchRes.text();

            const priorIdMatch =
                priorSearchHtml.match(/modules\/parceldetailpopup\.php\?id=(\d+)/i) ||
                priorSearchHtml.match(/id=(\d+)&print=1/i);

            if (priorIdMatch && priorIdMatch[1] !== internalId) {
                const priorPopupRes  = await fetch(`${baseUrl}/modules/parceldetailpopup.php?id=${priorIdMatch[1]}`, { headers });
                const priorPopupHtml = await priorPopupRes.text();
                const priorParsed    = parsePopup(priorPopupHtml, account);

                // Only prepend rows that are Due or Delinquent
                const priorDueRows = priorParsed.tax_history.filter(
                    (r) => r.status === "Due" || r.status === "Delinquent"
                );
                if (priorDueRows.length > 0) {
                    const merged = [...priorDueRows, ...parsed.tax_history];
                    // Sort ascending: by year, then by due_date (1st inst before 2nd)
                    merged.sort((a, b) => {
                        const yearDiff = parseInt(a.year) - parseInt(b.year);
                        if (yearDiff !== 0) return yearDiff;
                        // Same year — sort by due_date chronologically
                        const da = new Date(a.due_date);
                        const db = new Date(b.due_date);
                        return (isNaN(da) ? 0 : da) - (isNaN(db) ? 0 : db);
                    });
                    parsed.tax_history   = merged;
                    parsed.delinquent    = "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF";
                    parsed.notes = `PRIORS ARE DELINQUENT, ` + parsed.notes;
                }
            }
        }
    } catch (priorErr) {
        console.warn("[govtech] Prior year fetch failed (non-fatal):", priorErr.message);
    }

    // Merge group data into result
    parsed.annual_amount     = group.annualAmount  || "N/A";
    parsed.escrow_payment    = group.escrowPayment || "N/A";
    parsed.escrow_note       = group.escrowNote    || "";
    parsed.group_fields      = group.extra;

    return parsed;
};

// ==========================================
// 6. POPUP PARSER
// ==========================================

const stripTags  = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const cellVal    = (block, label) => {
    const rx = new RegExp(label + "[\\s\\S]*?<td[^>]*>\\s*\\$?([\\d,]+\\.?\\d*)", "i");
    const m  = block.match(rx);
    return m ? toFloat(m[1]) : 0;
};
const cellStr    = (block, label) => {
    const rx = new RegExp(label + "[\\s\\S]*?<td[^>]*>([^<]{1,60})", "i");
    const m  = block.match(rx);
    return m ? m[1].trim() : "N/A";
};

const parsePopup = (html, account) => {
    // ── Owner & Property Address ──
    // Header row contains: Owner | Owner Address | Property Address
    // Data row immediately follows with the three valign=top tds.
    const ownerSectionMatch = html.match(
        /Property Address[\s\S]{0,100}?<\/tr>\s*<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i
    );
    const owner   = ownerSectionMatch ? stripTags(ownerSectionMatch[1]).replace(/\s+/g, " ").trim() : "N/A";
    // col 3 = Property Address — strip the Google Maps "Map" link text
    const address = ownerSectionMatch
        ? stripTags(ownerSectionMatch[3]).replace(/\bMap\b/gi, "").replace(/\s+/g, " ").trim()
        : "N/A";

    // ── Assessed Value ──
    const avMatch     = html.match(/Assessed Value[\s\S]{0,200}?<td[^>]*>\s*([\d,]+\.?\d*)/i);
    const assessedVal = avMatch ? toFloat(avMatch[1]) : 0;

    // ── Tax Year ──
    const yearMatch = html.match(/<td>\s*(\d{4})\s*<\/td>\s*<td>\s*Current Tax/i);
    const year      = yearMatch ? yearMatch[1] : "N/A";

    // ── Web Payments: collect all paid dates + amounts for current year ──
    // Structure: Paid on MM/DD/YYYY appears in order — most recent first
    // We need to map them back to installments by due date month
    const webPaySection = html.match(/Web Payments([\s\S]*?)(?:<\/table>|$)/i);
    // Build array of { amount, date } sorted by date desc (already that way in HTML)
    const webPayments = [];
    if (webPaySection) {
        const payRowRx = /<td[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>\s*<span[^>]*>([\d,]+\.?\d*)<\/span>\s*<\/td>\s*<td[^>]*>Paid on\s*([\d\/]+)/gi;
        let pm;
        while ((pm = payRowRx.exec(webPaySection[1])) !== null) {
            webPayments.push({ amount: toFloat(pm[1]), date: fmtDate(pm[2]) });
        }
        // Fallback if span not present
        if (webPayments.length === 0) {
            const fallRx = /Paid on\s*([\d\/]+)/gi;
            let fm;
            while ((fm = fallRx.exec(webPaySection[1])) !== null) {
                webPayments.push({ amount: 0, date: fmtDate(fm[1]) });
            }
        }
    }

    // ── Installment blocks — ALWAYS emit both rows even if base=0/total=0 ──
    const rows    = [];
    const instRx  = /(<td[^>]*colspan[^>]*>\s*(First|Second)\s+Installment\s*<\/td>)([\s\S]*?)(?=<td[^>]*colspan|Web Payments|Totals|$)/gi;
    let instMatch;
    let instIndex = 0;

    while ((instMatch = instRx.exec(html)) !== null) {
        const block    = instMatch[3];
        const baseDue  = cellVal(block, "Base Due");
        const totalDue = cellVal(block, "Total Due");
        const dueDate  = cellStr(block, "Due Date");

        // Amount paid: try "Payment" row first, then derive from base - total
        let amtPaid = cellVal(block, "Payment");
        if (amtPaid === 0 && baseDue > 0 && totalDue === 0) {
            amtPaid = baseDue; // fully paid — base minus zero due
        }

        const isPastDue = dueDate !== "N/A" && new Date() > new Date(dueDate);
        const status    = totalDue === 0
            ? (baseDue === 0 ? "Paid" : "Paid")   // zero bill or fully paid = Paid
            : (isPastDue ? "Delinquent" : "Due");

        // Match paid date from web payments — use the payment closest to this installment's due date
        let paidDate = "N/A";
        if (status === "Paid" && webPayments.length > instIndex) {
            paidDate = webPayments[instIndex]?.date || "N/A";
        }

        rows.push({
            jurisdiction:      "County",
            year,
            payment_type:      "Semi-Annual",
            status,
            base_amount:       fmtAmt(baseDue),
            amount_paid:       fmtAmt(amtPaid),
            amount_due:        fmtAmt(totalDue),
            mailing_date:      "N/A",
            due_date:          fmtDate(dueDate),
            delq_date:         addOneDay(dueDate),
            paid_date:         paidDate,
            good_through_date: "",
        });
        instIndex++;
    }

    // ── Dynamic Notes & Delinquency (your pattern) ──
    const isSemiAnnual     = true; // GovTech Parke is always semi-annual
    const isAnyDelinquent  = rows.some((r) => r.status === "Delinquent");
    const isPriorYearPaid  = !isAnyDelinquent; // no prior delinquency = priors paid
    const delinquentStatus = isAnyDelinquent
        ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF"
        : "NONE";

    const shortDue = (i) => rows[i]?.due_date?.slice(0, 5) || "";
    const dynamicDueDatesNote = rows.length >= 2
        ? `NORMAL DUE DATES ARE ${shortDue(0)} AND ${shortDue(1)}`
        : rows.length === 1 ? `NORMAL DUE DATE IS ${shortDue(0)}` : "";

    let notes = "";
    if (isSemiAnnual && rows.length >= 2) {
        const s1 = rows[0].status.toUpperCase();
        const s2 = rows[1].status.toUpperCase();
        const statusStr = `${year} 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}`;
        if (isAnyDelinquent) {
            notes = isPriorYearPaid
                ? `ALL PRIORS ARE PAID, ${year} TAXES ARE DELINQUENT, ${statusStr}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`
                : `PRIORS ARE DELINQUENT, ${statusStr}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
        } else {
            notes = `ALL PRIORS ARE PAID, ${statusStr}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
        }
    } else {
        if (isAnyDelinquent) {
            notes = isPriorYearPaid
                ? `ALL PRIORS ARE PAID, ${year} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`
                : `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
        } else {
            notes = `ALL PRIORS ARE PAID, ${year} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
        }
    }

    return {
        owner_name:           [owner],
        property_address:     address,
        parcel_number:        account,
        land_value:           "-",
        improvements:         "-",
        total_assessed_value: assessedVal > 0 ? fmtAmt(assessedVal) : "N/A",
        exemption:            "-",
        total_taxable_value:  assessedVal > 0 ? fmtAmt(assessedVal) : "N/A",
        notes,
        delinquent:           delinquentStatus,
        tax_history:          rows.length > 0 ? rows : [{
            jurisdiction: "County", year: "N/A", payment_type: "N/A", status: "N/A",
            base_amount: "N/A", amount_paid: "N/A", amount_due: "N/A",
            mailing_date: "N/A", due_date: "N/A", delq_date: "N/A",
            paid_date: "N/A", good_through_date: "N/A",
        }],
    };
};

// ==========================================
// 7. GROUP DETAILS PARSER
// ==========================================

const parseGroupDetails = (html) => {
    const result = { annualAmount: "N/A", escrowPayment: "N/A", escrowNote: "", extra: {} };

    // Annual Amount
    const annualMatch = html.match(/Annual Amount[\s\S]*?<td[^>]*>\s*\$?([\d,]+\.?\d*)/i);
    if (annualMatch) result.annualAmount = fmtAmt(toFloat(annualMatch[1]));

    // Escrow Payment / Note
    const escrowMatch = html.match(/[Ee]scrow[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
    if (escrowMatch) {
        const raw = escrowMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        // If it's a dollar amount
        if (/[\d,]+\.?\d*/.test(raw)) {
            result.escrowPayment = fmtAmt(toFloat(raw));
        } else {
            result.escrowNote = raw;
        }
    }

    // Capture ALL remaining label→value pairs from table rows
    const rowRx = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = rowRx.exec(html)) !== null) {
        const label = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        const value = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (label && value && label.length < 60) {
            result.extra[label] = value;
        }
    }

    return result;
};

// ==========================================
// 8. ORCHESTRATOR (with one auto-retry on session failure)
// ==========================================

const runSearch = async (account, county) => {
    const countyKey = county.toLowerCase();
    const config    = COUNTY_DATA[countyKey];
    if (!config) throw new Error(`County '${countyKey}' is not supported.`);

    const browser = await getBrowserInstance();

    const attempt = async () => {
        const extracted = await extractGovTech(browser, account, countyKey);
        return {
            processed_date:   "",
            order_number:     "",
            borrower_name:    "",
            parcel_number:    account,
            taxing_authority: config.auth,
            ...extracted,
        };
    };

    try {
        return await attempt();
    } catch (err) {
        if (err.message.startsWith("SESSION_FAILURE")) {
            console.warn("[govtech] Session failure — retrying once with fresh session...");
            return await attempt(); // _sessionCookies already invalidated above
        }
        throw err;
    }
};

// ==========================================
// 9. REQUEST HANDLER
// ==========================================

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    const county = req.path.split("/").pop().toLowerCase();

    if (fetch_type !== "html" && fetch_type !== "api") {
        return res.status(400).json({ error: true, message: "Invalid Access" });
    }
    if (!account?.trim()) {
        const msg = "Account number is required.";
        return fetch_type === "html"
            ? res.status(200).render("error_data", { error: true, message: msg })
            : res.status(400).json({ error: true, message: msg });
    }
    if (!COUNTY_DATA[county]) {
        const msg = `County '${county}' is not supported.`;
        return fetch_type === "html"
            ? res.status(200).render("error_data", { error: true, message: msg })
            : res.status(400).json({ error: true, message: msg });
    }

    try {
        const data = await runSearch(account.trim(), county);
        return fetch_type === "html"
            ? res.status(200).render("parcel_data_official", data)
            : res.status(200).json({ result: data });
    } catch (err) {
        return fetch_type === "html"
            ? res.status(200).render("error_data", { error: true, message: err.message })
            : res.status(500).json({ error: true, message: err.message });
    }
};

export { search };
