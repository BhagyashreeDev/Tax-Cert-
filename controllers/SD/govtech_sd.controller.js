// Author:- Mayank Nandgowle
// File: govtech_sd.controller.js
// State: South Dakota — 8 counties on GovTech platform

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION
// ==========================================

const SD_STATE_ID  = "46"; // GovTech internal state ID for South Dakota (discovered at runtime)
const BASE_URL     = "https://www.govtechtaxpro.com";

const COUNTY_DATA = {
    clark:     { idCounty: null,    urlPath: "/index.php?module=parceldetail",        auth: "Clark County Treasurer, SD" },
    codington: { idCounty: "42029", urlPath: "/parceldetail.php",                     auth: "Codington County Treasurer, SD" },
    custer:    { idCounty: null,    urlPath: "/parceldetail.php",                     auth: "Custer County Treasurer, SD" },
    deuel:     { idCounty: "42039", urlPath: "/parceldetail.php",                     auth: "Deuel County Treasurer, SD" },
    hamlin:    { idCounty: "42057", urlPath: "/parceldetail.php",                     auth: "Hamlin County Treasurer, SD" },
    kingsbury: { idCounty: null,    urlPath: "/parceldetail.php",                     auth: "Kingsbury County Treasurer, SD" },
    moody:     { idCounty: null,    urlPath: "/parceldetail.php",                     auth: "Moody County Treasurer, SD" },
    yankton:   { idCounty: null,    urlPath: "/parceldetail.php",                     auth: "Yankton County Treasurer, SD" },
};

// County names as they appear in the GovTech dropdown (for auto-discovery)
const COUNTY_DROPDOWN_NAMES = {
    clark:     ["Clark County, SD", "Clark County"],
    custer:    ["Custer County, SD", "Custer County"],
    moody:     ["Moody County, SD", "Moody County"],
    kingsbury: ["Kingsbury County, SD", "Kingsbury County"],
    yankton:   ["Yankton County, SD", "Yankton County"],
};

const BLOCKED_RESOURCES = new Set(["stylesheet", "font", "image", "media"]);

// ==========================================
// 2. SESSION CACHE
// ==========================================

let _sessionCookies = null;
let _sessionExpiry  = 0;
let _sdStateId      = null; // discovered at runtime
const SESSION_TTL_MS = 10 * 60 * 1000;

// ==========================================
// 3. UTILITIES
// ==========================================

const toFloat  = (v) => parseFloat((v || "0").replace(/[^0-9.-]/g, "")) || 0;
const fmtAmt   = (n) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate  = (dateStr) => {
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

const cookieHeader = (cookies) => cookies.map((c) => `${c.name}=${c.value}`).join("; ");

const stripTags = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const cellVal = (block, label) => {
    const rx = new RegExp(label + "[\\s\\S]*?<td[^>]*>\\s*\\$?([\\d,]+\\.?\\d*)", "i");
    const m  = block.match(rx);
    return m ? toFloat(m[1]) : 0;
};

const cellStr = (block, label) => {
    const rx = new RegExp(label + "[\\s\\S]*?<td[^>]*>([^<]{1,60})", "i");
    const m  = block.match(rx);
    return m ? m[1].trim() : "N/A";
};

// ==========================================
// 4. SESSION HARVESTER + COUNTY ID DISCOVERY
// ==========================================

const harvestSession = async (browser) => {
    const context = await browser.createBrowserContext();
    const page    = await context.newPage();

    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setRequestInterception(true);
    page.on("request", (req) =>
        BLOCKED_RESOURCES.has(req.resourceType()) ? req.abort() : req.continue()
    );

    try {
        // Use /parceldetail.php as the harvest page (shared by 7 of 8 counties)
        await page.goto(`${BASE_URL}/parceldetail.php`, { waitUntil: "domcontentloaded", timeout: 30000 });

        // --- Discover SD state ID from the state dropdown ---
        await page.waitForSelector("#stateselection", { timeout: 10000 });
        const sdStateId = await page.evaluate(() => {
            const opts = [...document.querySelectorAll("#stateselection option")];
            const sd   = opts.find((o) => o.textContent.trim() === "South Dakota");
            return sd ? sd.value : null;
        });
        if (sdStateId) _sdStateId = sdStateId;

        // Select SD to populate county dropdown
        await page.select("#stateselection", _sdStateId || "46");
        await page.waitForFunction(
            () => document.querySelectorAll("#countyselectionresult option").length > 1,
            { timeout: 10000 }
        );

        // --- Auto-discover missing county IDs ---
        const countyOptions = await page.evaluate(() =>
            [...document.querySelectorAll("#countyselectionresult option")].map((o) => ({
                value: o.value,
                text:  o.textContent.trim(),
            }))
        );

        for (const [key, names] of Object.entries(COUNTY_DROPDOWN_NAMES)) {
            if (COUNTY_DATA[key].idCounty) continue; // already known
            const match = countyOptions.find((o) =>
                names.some((n) => o.text.toLowerCase().includes(n.toLowerCase()))
            );
            if (match) {
                COUNTY_DATA[key].idCounty = match.value;
                console.log(`[govtech-sd] Discovered idCounty for ${key}: ${match.value}`);
            } else {
                console.warn(`[govtech-sd] Could not find idCounty for ${key} in dropdown`);
            }
        }

        // Fire change event so session is primed
        await page.evaluate(() => {
            document.querySelector("#countyselectionresult")
                ?.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await new Promise((r) => setTimeout(r, 600));

        return await page.cookies();
    } finally {
        await context.close();
    }
};

// ==========================================
// 5. CORE EXTRACTION
// ==========================================

const extractGovTech = async (browser, account, countyKey) => {
    const config = COUNTY_DATA[countyKey];

    // Session + ID discovery
    if (!_sessionCookies || Date.now() > _sessionExpiry) {
        console.log("[govtech-sd] Harvesting fresh session...");
        _sessionCookies = await harvestSession(browser);
        _sessionExpiry  = Date.now() + SESSION_TTL_MS;
    }

    if (!config.idCounty) {
        throw new Error(`idCounty for '${countyKey}' could not be discovered. Check the county dropdown.`);
    }

    const cookieStr = cookieHeader(_sessionCookies);
    const headers   = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie":        cookieStr,
        "User-Agent":    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer":       `${BASE_URL}${config.urlPath}`,
    };

    // --- Step 1: POST search ---
    // Clark uses index.php endpoint, all others use parceldetail.php
    const searchEndpoint = countyKey === "clark"
        ? `${BASE_URL}/index.php?module=parceldetail`
        : `${BASE_URL}/parceldetail.php`;

    const payload    = `idCounty=${config.idCounty}&parcelnumber=${encodeURIComponent(account)}&formsubmit=Parcel+Search&taxyear=All&offset=0`;
    const searchRes  = await fetch(searchEndpoint, { method: "POST", headers, body: payload });
    const searchHtml = await searchRes.text();

    // Session guard
    if (
        searchHtml.includes("stateselection") &&
        searchHtml.includes("Property Search") &&
        !searchHtml.includes("parceldetailpopup")
    ) {
        _sessionCookies = null;
        throw new Error("SESSION_FAILURE");
    }

    // --- Step 2: Extract internal ID ---
    const idMatch =
        searchHtml.match(/modules\/parceldetailpopup\.php\?id=(\d+)/i) ||
        searchHtml.match(/parceldetailpopup\.php\?id=(\d+)/i) ||
        searchHtml.match(/parceldetailpopup\.php',\s*data:\s*\{[^}]*id:\s*'(\d+)'/i) ||
        searchHtml.match(/id=(\d+)&print=1/i);

    if (!idMatch) throw new Error("Record not found for account: " + account);
    const internalId = idMatch[1];

    // --- Step 3: Fetch popup + group details in parallel ---
    const popupBase = `${BASE_URL}`;

    const [popupRes, groupRes] = await Promise.all([
        fetch(`${popupBase}/modules/parceldetailpopup.php?id=${internalId}`, { headers }),
        fetch(`${popupBase}/frontmodules/parcelgroupdetails.php?id=${internalId}&idGroupParcel=${internalId}`, { headers }),
    ]);

    const [popupHtml, groupHtml] = await Promise.all([
        popupRes.text(),
        groupRes.text(),
    ]);

    // --- Step 4 & 5: Parse ---
    const parsed = parsePopup(popupHtml, account);
    const group  = parseGroupDetails(groupHtml);

    // --- Step 6: Prior year check ---
    try {
        const currentYear = parsed.tax_history?.[0]?.year;
        if (currentYear && currentYear !== "N/A") {
            const priorYear    = String(parseInt(currentYear) - 1);
            const priorPayload = `idCounty=${config.idCounty}&parcelnumber=${encodeURIComponent(account)}&formsubmit=Parcel+Search&taxyear=${priorYear}&offset=0`;
            const priorRes     = await fetch(searchEndpoint, { method: "POST", headers, body: priorPayload });
            const priorHtml    = await priorRes.text();

            const priorIdMatch =
                priorHtml.match(/modules\/parceldetailpopup\.php\?id=(\d+)/i) ||
                priorHtml.match(/parceldetailpopup\.php\?id=(\d+)/i) ||
                priorHtml.match(/id=(\d+)&print=1/i);

            if (priorIdMatch && priorIdMatch[1] !== internalId) {
                const priorPopupRes  = await fetch(`${popupBase}/modules/parceldetailpopup.php?id=${priorIdMatch[1]}`, { headers });
                const priorPopupHtml = await priorPopupRes.text();
                const priorParsed    = parsePopup(priorPopupHtml, account);

                const priorDueRows = priorParsed.tax_history.filter(
                    (r) => r.status === "Due" || r.status === "Delinquent"
                );
                if (priorDueRows.length > 0) {
                    const merged = [...priorDueRows, ...parsed.tax_history];
                    merged.sort((a, b) => {
                        const yd = parseInt(a.year) - parseInt(b.year);
                        if (yd !== 0) return yd;
                        const da = new Date(a.due_date), db = new Date(b.due_date);
                        return (isNaN(da) ? 0 : da) - (isNaN(db) ? 0 : db);
                    });
                    parsed.tax_history = merged;
                    parsed.delinquent  = "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF";
                    parsed.notes       = "PRIORS ARE DELINQUENT, " + parsed.notes;
                }
            }
        }
    } catch (priorErr) {
        console.warn("[govtech-sd] Prior year fetch failed (non-fatal):", priorErr.message);
    }

    parsed.annual_amount  = group.annualAmount  || "N/A";
    parsed.escrow_payment = group.escrowPayment || "N/A";
    parsed.escrow_note    = group.escrowNote    || "";
    parsed.group_fields   = group.extra;

    return parsed;
};

// ==========================================
// 6. POPUP PARSER
// ==========================================

const parsePopup = (html, account) => {
    // Owner & Property Address
    const ownerSectionMatch = html.match(
        /Property Address[\s\S]{0,100}?<\/tr>\s*<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i
    );
    const owner   = ownerSectionMatch ? stripTags(ownerSectionMatch[1]).replace(/\s+/g, " ").trim() : "N/A";
    const address = ownerSectionMatch
        ? stripTags(ownerSectionMatch[3]).replace(/\bMap\b/gi, "").replace(/\s+/g, " ").trim()
        : "N/A";

    // Assessed Value
    const avMatch     = html.match(/Assessed Value[\s\S]{0,200}?<td[^>]*>\s*([\d,]+\.?\d*)/i);
    const assessedVal = avMatch ? toFloat(avMatch[1]) : 0;

    // Tax Year
    const yearMatch = html.match(/<td>\s*(\d{4})\s*<\/td>\s*<td>\s*Current Tax/i);
    const year      = yearMatch ? yearMatch[1] : "N/A";

    // Web Payments — kept as fallback only
    const webPaySection = html.match(/Web Payments([\s\S]*?)(?:<\/table>|$)/i);
    const webPayments   = [];
    if (webPaySection) {
        const payRowRx = /<td[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>\s*<span[^>]*>([\d,]+\.?\d*)<\/span>\s*<\/td>\s*<td[^>]*>Paid on\s*([\d\/]+)/gi;
        let pm;
        while ((pm = payRowRx.exec(webPaySection[1])) !== null) {
            webPayments.push({ amount: toFloat(pm[1]), date: fmtDate(pm[2]) });
        }
        if (webPayments.length === 0) {
            const fallRx = /Paid on\s*([\d\/]+)/gi;
            let fm;
            while ((fm = fallRx.exec(webPaySection[1])) !== null) {
                webPayments.push({ amount: 0, date: fmtDate(fm[1]) });
            }
        }
    }

    // Installments — always emit both rows
    const rows   = [];
    const instRx = /(<td[^>]*colspan[^>]*>\s*(First|Second)\s+Installment\s*<\/td>)([\s\S]*?)(?=<td[^>]*colspan|Web Payments|Totals|$)/gi;
    let instMatch;
    let instIndex = 0;

    while ((instMatch = instRx.exec(html)) !== null) {
        const block    = instMatch[3];
        const baseDue  = cellVal(block, "Base Due");
        const totalDue = cellVal(block, "Total Due");
        const dueDate  = cellStr(block, "Due Date");

        let amtPaid = cellVal(block, "Payment");
        if (amtPaid === 0 && baseDue > 0 && totalDue === 0) amtPaid = baseDue;

        const isPastDue = dueDate !== "N/A" && new Date() > new Date(dueDate);
        const status    = totalDue === 0 ? "Paid" : (isPastDue ? "Delinquent" : "Due");

        // Extract paid date from "Paid on M/D/YYYY" in the Payment row's 3rd <td>
        // HTML structure: <td>Payment</td><td><span>amount</span></td><td>Paid on 4/27/2026</td>
        let paidDate = "N/A";
        if (status === "Paid") {
            const paidOnMatch = block.match(/[Pp]aid\s+on\s+([\d]{1,2}\/[\d]{1,2}\/[\d]{4})/);
            if (paidOnMatch) {
                paidDate = fmtDate(paidOnMatch[1]);
            } else {
                // Fallback to web payments array by index if inline date not found
                paidDate = webPayments[instIndex]?.date || "N/A";
            }
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

    // Dynamic Notes
    const isAnyDelinquent  = rows.some((r) => r.status === "Delinquent");
    const delinquentStatus = isAnyDelinquent ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF" : "NONE";
    const shortDue         = (i) => rows[i]?.due_date?.slice(0, 5) || "";
    const dueDatesNote     = rows.length >= 2
        ? `NORMAL DUE DATES ARE ${shortDue(0)} AND ${shortDue(1)}`
        : rows.length === 1 ? `NORMAL DUE DATE IS ${shortDue(0)}` : "";

    let notes = "";
    if (rows.length >= 2) {
        const s1  = rows[0].status.toUpperCase();
        const s2  = rows[1].status.toUpperCase();
        const str = `${year} 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}`;
        notes = isAnyDelinquent
            ? `ALL PRIORS ARE PAID, ${year} TAXES ARE DELINQUENT, ${str}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dueDatesNote}`
            : `ALL PRIORS ARE PAID, ${str}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dueDatesNote}`;
    } else {
        notes = isAnyDelinquent
            ? `ALL PRIORS ARE PAID, ${year} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dueDatesNote}`
            : `ALL PRIORS ARE PAID, ${year} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dueDatesNote}`;
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

    const annualMatch = html.match(/Annual Amount[\s\S]{0,200}?\$?([\d,]+\.?\d*)/i);
    if (annualMatch) result.annualAmount = fmtAmt(toFloat(annualMatch[1]));

    const escrowMatch = html.match(/[Ee]scrow[^<]{0,60}?<\/font>\s*([^<]{1,80})/i)
        || html.match(/[Ee]scrow([\s\S]*?)<\/div>/i);
    if (escrowMatch) {
        const raw = escrowMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (/[\d,]+\.?\d*/.test(raw)) {
            result.escrowPayment = fmtAmt(toFloat(raw));
        } else if (raw.length < 120) {
            result.escrowNote = raw;
        }
    }

    const rowRx = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = rowRx.exec(html)) !== null) {
        const label = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        const value = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (label && value && label.length < 60) result.extra[label] = value;
    }

    return result;
};

// ==========================================
// 8. ORCHESTRATOR
// ==========================================

const runSearch = async (account, county) => {
    const countyKey = county.toLowerCase();
    if (!COUNTY_DATA[countyKey]) throw new Error(`County '${countyKey}' is not supported.`);

    const browser = await getBrowserInstance();
    const config  = COUNTY_DATA[countyKey];

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
        if (err.message === "SESSION_FAILURE") {
            console.warn("[govtech-sd] Session failure — retrying with fresh session...");
            return await attempt();
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
