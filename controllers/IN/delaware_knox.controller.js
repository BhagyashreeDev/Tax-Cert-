// Author:- Mayank Nandgowle
// File: delaware_knox.controller.js

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ==========================================
// 1. CONFIGURATION
// ==========================================

const COUNTY_DATA = {
    delaware: { url: "https://enoticesonline.com/dlw", auth: "Delaware County Treasurer, IN" },
    knox:     { url: "https://enoticesonline.com/knx", auth: "Knox County Treasurer, IN" },
};

const BLOCKED_RESOURCES = new Set(["stylesheet", "font", "image", "media"]);

// ==========================================
// 2. UTILITIES
// ==========================================

const toFloat = (v) => parseFloat((v || "0").replace(/[^0-9.-]/g, "")) || 0;
const fmtRaw  = (n) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "May 12 2025" → "05/12/2025"
const fmtDate = (dateStr) => {
    if (!dateStr || dateStr === "N/A") return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d)) return "N/A";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
};

// delq date = due date + 1 day, formatted MM/DD/YYYY
const delqDate = (dateStr) => {
    if (!dateStr || dateStr === "N/A") return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d)) return "N/A";
    d.setDate(d.getDate() + 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}/${dd}/${d.getFullYear()}`;
};

const isPastDue = (dateStr) => {
    if (!dateStr || dateStr === "N/A") return false;
    const d = new Date(dateStr);
    return !isNaN(d) && new Date() > d;
};

// ==========================================
// 3. BROWSER PAGE FACTORY
// ==========================================

const createPage = async (browser) => {
    const context = await browser.createBrowserContext();
    const page    = await context.newPage();
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(90000);
    await page.setRequestInterception(true);
    page.on("request", (req) =>
        BLOCKED_RESOURCES.has(req.resourceType()) ? req.abort() : req.continue()
    );
    return { page, context };
};

// ==========================================
// 4. NAVIGATE TO PORTAL
// ==========================================

const navigateToPortal = async (page, url, county) => {
    try {
        await page.goto(url, { waitUntil: "networkidle0" });
    } catch (err) {
        console.error(`[${county}] navigateToPortal:`, err.message);
        throw new Error("Portal Connection Unsuccessful");
    }
};

// ==========================================
// 5. SEARCH & GO TO DETAILS
// ==========================================

const searchAndNavigate = async (page, account, county) => {
    const cleanAccount = account.replace(/[^a-zA-Z0-9]/g, "");
    const isKnox = county === "knox" || county === "knx";

    try {
        await page.waitForSelector("#lpSearch", { timeout: 15000 });
        await page.evaluate(() => { document.getElementById("lpSearch").value = ""; });
        await page.type("#lpSearch", account, { delay: 0 });
        await page.click("#submit");

        await page.waitForFunction(
            () => {
                const el = document.getElementById("lpSearchResults");
                return el && el.innerText.trim().length > 0;
            },
            { timeout: 20000 }
        );

        const resultText = await page.evaluate(
            () => document.getElementById("lpSearchResults").innerText
        );

        if (resultText.includes("No results found")) {
            throw new Error("Record not found");
        }

        if (!isKnox) {
            if (!resultText.includes(account) && !resultText.includes(cleanAccount)) {
                throw new Error("Record not found");
            }
            await page.goto(
                `https://enoticesonline.com/DLW/details?bn=${cleanAccount}`,
                { waitUntil: "networkidle0" }
            );
            await page.waitForSelector('span[name="OWNER_NAME_1"]', { timeout: 15000 });
        }

    } catch (err) {
        console.error(`[${county}] searchAndNavigate:`, err.message);
        throw new Error(
            err.message === "Record not found" ? "Record not found" : "Search processing failed"
        );
    }
};

// ==========================================
// 6. SCRAPE ONE YEAR'S DATA FROM PAGE
// ==========================================

const scrapeYearData = async (page) => {
    return page.evaluate(() => {
        const g = (name) => {
            const el = document.querySelector(`span[name="${name}"]`);
            return el ? el.textContent.trim() : "0";
        };

        const ownerCheck = g("OWNER_NAME_1");
        const taxYearRaw = g("TAX_YEAR");
        if (!ownerCheck && !taxYearRaw) return null;

        return {
            taxYearRaw,
            springDueDate:   g("SPRING_DUE_DATE"),
            fallDueDate:     g("FALL_DUE_DATE"),
            springTaxNet:    g("CHSPRINGTAXNET"),
            springDitch:     g("CHSPRINGDITCH"),
            springStorm:     g("CHSPRINGSTORM"),
            springStmtFee:   g("CHSPRINGSTMENTFEE"),
            springTotalDue:  g("CHSPRINGTOTALDUE"),
            springAmtTotal:  g("SPRING_AMT_TOTAL"),
            spDelqTax:       g("SpDelqTax"),
            spDelqTaxPen:    g("SpDelqTaxPen"),
            fallTaxNet:      g("CHFALLTAXNET"),
            fallDitch:       g("CHFALLDITCH"),
            fallStorm:       g("CHFALLSTORM"),
            fallTaxSale:     g("CHTAXSALEFEE"),
            fallTotalDue:    g("CHFALLTOTALDUE"),
            fallAmtTotal:    g("FALL_TOTAL"),
            fallDelqTax:     g("FallDelqTax"),
            fallDelqTaxPen:  g("FallDelqTaxPen"),
        };
    });
};

// ==========================================
// 7. BUILD TAX HISTORY ROWS FROM RAW DATA
// ==========================================

const buildRows = (raw, isCurrentYear = false) => {
    const taxYear = raw.taxYearRaw.split(" ")[2] || "";
    const rows = [];

    const makeRow = (dueDateStr, billedStr, outstandingStr, delqTaxStr, delqPenStr) => {
        const billed      = toFloat(billedStr);
        const outstanding = toFloat(outstandingStr);
        const delqAmt     = toFloat(delqTaxStr) + toFloat(delqPenStr);

        // Keep 0.00 rows if it is the current year, otherwise skip
        if (!isCurrentYear && billed === 0 && delqAmt === 0) return;

        let status;
        if (outstanding === 0 && delqAmt === 0) {
            status = "Paid";
        } else if (delqAmt > 0 || isPastDue(dueDateStr)) {
            status = "Delinquent";
        } else {
            status = "Due";
        }

        const amountPaid = Math.max(0, billed - outstanding);
        const amountDue  = outstanding + delqAmt;
        const dueFmt     = fmtDate(dueDateStr);

        rows.push({
            jurisdiction:      "County",
            year:              taxYear,
            payment_type:      "Semi-Annual",
            status,
            base_amount:       fmtRaw(billed),
            amount_paid:       fmtRaw(amountPaid),
            amount_due:        fmtRaw(amountDue),
            mailing_date:      "N/A",
            due_date:          dueFmt,
            delq_date:         delqDate(dueDateStr),
            paid_date:         "N/A",
            good_through_date: ""
        });
    };

    makeRow(raw.springDueDate, raw.springTotalDue, raw.springAmtTotal, raw.spDelqTax, raw.spDelqTaxPen);
    makeRow(raw.fallDueDate,   raw.fallTotalDue,   raw.fallAmtTotal,   raw.fallDelqTax, raw.fallDelqTaxPen);

    return { taxYear, rows };
};

// ==========================================
// 8. GENERATE NOTES
// ==========================================

const generateNotes = (taxHistoryArray, yearVal) => {
    const isSemiAnnual      = true;
    const isAnyDelinquent   = taxHistoryArray.some(h => h.status === "Delinquent");
    const isPriorYearPaid   = !taxHistoryArray.some(
        h => h.status === "Delinquent" && parseInt(h.year) < parseInt(yearVal)
    );

    const delinquentStatus  = isAnyDelinquent
        ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF"
        : "NONE";

    let dynamicDueDatesNote = "";
    if (isSemiAnnual && taxHistoryArray.length >= 2) {
        const d1 = (taxHistoryArray[0].due_date || "").slice(0, 5);
        const d2 = (taxHistoryArray[1].due_date || "").slice(0, 5);
        dynamicDueDatesNote = `NORMAL DUE DATES ARE ${d1} AND ${d2}`;
    } else if (taxHistoryArray[0] && taxHistoryArray[0].due_date !== "N/A") {
        const d1 = (taxHistoryArray[0].due_date || "").slice(0, 5);
        dynamicDueDatesNote = `NORMAL DUE DATE IS ${d1}`;
    }

    let generatedNotes = "";

    if (isSemiAnnual && taxHistoryArray.length >= 2) {
        const s1 = taxHistoryArray[0].status.toUpperCase();
        const s2 = taxHistoryArray[1].status.toUpperCase();
        const statusString = `${yearVal} 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}`;

        if (isAnyDelinquent) {
            generatedNotes = isPriorYearPaid
                ? `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`
                : `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
        } else {
            generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
        }
    } else {
        if (isAnyDelinquent) {
            generatedNotes = isPriorYearPaid
                ? `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`
                : `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
        } else {
            generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dynamicDueDatesNote}`;
        }
    }

    return { generatedNotes, delinquentStatus };
};

// ==========================================
// 9. EXTRACT DELAWARE
// ==========================================

const extractDelaware = async (page, account) => {
    const cleanAccount = account.replace(/[^a-zA-Z0-9]/g, "");

    const currentRaw = await scrapeYearData(page);
    if (!currentRaw) throw new Error("Failed to extract property data from portal.");

    const { taxYear: currentYear, rows: currentRows } = buildRows(currentRaw, true);

    const meta = await page.evaluate(() => {
        const g = (name) => {
            const el = document.querySelector(`span[name="${name}"]`);
            return el ? el.textContent.trim() : "";
        };
        return {
            owner1:      g("OWNER_NAME_1"),
            owner2:      g("OWNER_NAME_2"),
            addr1:       g("PROPERTY_ADDRESS_1"),
            addr2:       g("PROPERTY_ADDRESS_2"),
            city:        g("PROPERTY_CITY"),
            zip:         g("PROPERTY_ZIP"),
            parcel:      g("LOCAL_PARCEL_NO"),
            rLand:       g("R_LAND_TOTAL"),
            nrLand:      g("NR_LAND_TOTAL"),
            rImp:        g("R_IMPROVEMENT_TOTAL"),
            nrImp:       g("NR_IMPROVEMENT_TOTAL"),
            assessed:    g("TOTALASSVALUE"),
            exHomestead: g("HOMESTEAD"),
            exOver65:    g("OVER_65"),
            exMortgage:  g("MORTGAGE"),
            exSupple:    g("HOMESUPPLE"),
            exBlind:     g("BLIND"),
            exRehab:     g("REHAB"),
            exVeteran:   g("VETERAN"),
            exAbate:     g("ABATEMENT"),
            exNonprofit: g("NONPROFIT"),
            exFert:      g("FERT"),
            exHbarn:     g("HBARN"),
        };
    });

    const allRows = [];
    const currentYearNum = parseInt(currentYear);
    let priorYearSupported = true;

    for (let yr = currentYearNum - 1; yr >= currentYearNum - 3 && priorYearSupported; yr--) {
        try {
            await page.goto(
                `https://enoticesonline.com/DLW/details?bn=${cleanAccount}&year=${yr}`,
                { waitUntil: "networkidle0", timeout: 20000 }
            );

            const priorRaw = await scrapeYearData(page);
            if (!priorRaw) break;

            const { taxYear: priorYear, rows: priorRows } = buildRows(priorRaw, false);
            if (!priorYear) break;

            if (parseInt(priorYear) === currentYearNum) {
                priorYearSupported = false;
                break;
            }

            const relevantRows = priorRows.filter(r => r.status !== "Paid");
            if (relevantRows.length === 0) break;

            allRows.push(...relevantRows);
        } catch (_) {
            break;
        }
    }

    const tax_history = [...allRows, ...currentRows];

    if (tax_history.length === 0) {
        tax_history.push({
            jurisdiction:      "County",
            year:              "N/A",
            payment_type:      "N/A",
            status:            "N/A",
            base_amount:       "N/A",
            amount_paid:       "N/A",
            amount_due:        "N/A",
            mailing_date:      "N/A",
            due_date:          "N/A",
            delq_date:         "N/A",
            paid_date:         "N/A",
            good_through_date: "N/A"
        });
    }

    const totalLand = toFloat(meta.rLand)  + toFloat(meta.nrLand);
    const totalImp  = toFloat(meta.rImp)   + toFloat(meta.nrImp);
    const assessedN = toFloat(meta.assessed);
    const totalExemption =
        toFloat(meta.exHomestead) + toFloat(meta.exOver65)    + toFloat(meta.exMortgage) +
        toFloat(meta.exSupple)    + toFloat(meta.exBlind)     + toFloat(meta.exRehab)    +
        toFloat(meta.exVeteran)   + toFloat(meta.exAbate)     + toFloat(meta.exNonprofit)+
        toFloat(meta.exFert)      + toFloat(meta.exHbarn);
    const taxableN = Math.max(0, assessedN - totalExemption);

    const { generatedNotes, delinquentStatus } = generateNotes(tax_history, currentYear);

    return {
        owner_name:           [`${meta.owner1} ${meta.owner2}`.trim() || "N/A"],
        property_address:     `${meta.addr1}${meta.addr2 ? " " + meta.addr2 : ""} ${meta.city} IN ${meta.zip}`.trim() || "N/A",
        parcel_number:        meta.parcel || account,
        land_value:           totalLand > 0 ? fmtRaw(totalLand) : "-",
        improvements:         totalImp  > 0 ? fmtRaw(totalImp)  : "-",
        total_assessed_value: assessedN  > 0 ? fmtRaw(assessedN) : "N/A",
        exemption:            totalExemption > 0 ? fmtRaw(totalExemption) : "-",
        total_taxable_value:  taxableN   > 0 ? fmtRaw(taxableN)  : "N/A",
        notes:                generatedNotes,
        delinquent:           delinquentStatus,
        tax_history,
    };
};

// ==========================================
// 10. EXTRACT KNOX
// ==========================================

const extractKnox = async (page, account) => {
    const extracted = await page.evaluate((searchAccount) => {
        const container = document.getElementById("lpSearchResults");
        const rows      = container.innerText.split("\n").filter((l) => l.trim());

        let owner       = "N/A";
        let address     = "N/A";
        let foundParcel = searchAccount;

        for (let i = 0; i < rows.length; i++) {
            const isParcelLabel = rows[i].trim() === "Parcel ID";
            const nextIsAccount = rows[i + 1] && rows[i + 1].trim() === searchAccount;
            const isSameLine = rows[i].includes("Parcel ID") && rows[i].includes(searchAccount);

            if (isSameLine || (isParcelLabel && nextIsAccount)) {
                const offset = isSameLine ? 0 : 1;
                foundParcel  = isSameLine
                    ? rows[i].replace("Parcel ID", "").trim()
                    : rows[i + 1].trim();

                const naIdx = rows.findIndex(
                    (r, idx) => idx > i + offset && r.trim() === "Name/Address"
                );

                if (naIdx !== -1) {
                    const addrLines = [];
                    let j = naIdx + 1;

                    while (j < rows.length && !rows[j].includes("Parcel ID")) {
                        const line = rows[j].trim();
                        if (line && line !== "NA") addrLines.push(line);
                        j++;
                    }

                    if (addrLines.length > 0) owner   = addrLines[0];
                    if (addrLines.length > 1) address = addrLines.slice(1).join(", ");
                }
                break;
            }
        }
        return { owner, address, parcel: foundParcel };
    }, account);

    const placeholderRow = {
        jurisdiction:      "County",
        year:              "N/A",
        payment_type:      "N/A",
        status:            "N/A",
        base_amount:       "N/A",
        amount_paid:       "N/A",
        amount_due:        "N/A",
        mailing_date:      "N/A",
        due_date:          "N/A",
        delq_date:         "N/A",
        paid_date:         "N/A",
        good_through_date: "N/A"
    };

    return {
        owner_name:           [extracted.owner],
        property_address:     extracted.address,
        parcel_number:        extracted.parcel,
        land_value:           "N/A",
        improvements:         "N/A",
        total_assessed_value: "N/A",
        exemption:            "N/A",
        total_taxable_value:  "N/A",
        delinquent:           "UNKNOWN",
        notes:                "TAX DATA NOT AVAILABLE ONLINE. PLEASE CALL COUNTY TREASURER FOR TAX STATUS AND PAYOFF DETAILS.",
        tax_history:          [placeholderRow],
    };
};

// ==========================================
// 11. ORCHESTRATOR
// ==========================================

const runSearch = async (account, county) => {
    const countyKey = county.toLowerCase();
    const url       = COUNTY_DATA[countyKey]?.url;
    if (!url) throw new Error(`County '${countyKey}' is not supported.`);

    const browser           = await getBrowserInstance();
    const { page, context } = await createPage(browser);

    try {
        await navigateToPortal(page, url, countyKey);
        await searchAndNavigate(page, account, countyKey);

        const extracted = (countyKey === "delaware" || countyKey === "dlw")
            ? await extractDelaware(page, account)
            : await extractKnox(page, account);

        return {
            processed_date:   "",
            order_number:     "",
            borrower_name:    "",
            parcel_number:    account,
            taxing_authority: COUNTY_DATA[countyKey].auth,
            ...extracted,
        };
    } finally {
        try { await context.close(); } catch (_) {}
    }
};

// ==========================================
// 12. REQUEST HANDLER
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
        console.error(`[${county}] search error:`, err.message);
        return fetch_type === "html"
            ? res.status(200).render("error_data", { error: true, message: err.message })
            : res.status(500).json({ error: true, message: err.message });
    }
};

export { search };
