// author: m m prateek
// 15.0124101 semi Annual
// 03.0029100 Annual
// 07.0031000 no history 


import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const NAV_TIMEOUT = 90000;
const SELECTOR_TIMEOUT = 30000;

// COMBINED SELECTOR: Matches both Payment History thumbnails AND Current Year hyperlink divs
const YEAR_BTN_SELECTOR = '.thumbnail.font-weight-bold, .hyperlink-field';

// ─── Helpers ────────────────────────────────────────────────────────────────

function convertYear(dateStr) {
    if (!dateStr || dateStr === "N/A") return "N/A";
    const parts = dateStr.split("/");
    if (parts.length === 3 && parts[2].length === 2) parts[2] = "20" + parts[2];
    return parts.join("/");
}

function getDelqDate(dateStr) {
    if (!dateStr || dateStr === "N/A") return "N/A";
    const parts = dateStr.split("/");
    if (parts.length !== 3) return "N/A";
    const d = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
    d.setDate(d.getDate() + 1);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function isDelinquent(delqDateStr) {
    if (!delqDateStr || delqDateStr === "N/A") return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today >= new Date(delqDateStr);
}

function todayFormatted() {
    const t = new Date();
    return `${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}/${t.getFullYear()}`;
}

// ─── Page helpers ───────────────────────────────────────────────────────────

/** Wait for selector, but give up cleanly after `ms` instead of throwing. */
async function waitSafe(page, selector, ms = SELECTOR_TIMEOUT) {
    try {
        await page.waitForSelector(selector, { timeout: ms });
        return true;
    } catch {
        return false;
    }
}

/** Expand the caret panel if it exists. */
async function expandCaret(page) {
    const caret = await page.$("#caretIcon1");
    if (caret) {
        await caret.click();
        // Wait for a generic table to appear instead of just payment history
        await waitSafe(page, "table", 5000);
    }
}

// ─── Main scraper ────────────────────────────────────────────────────────────

const account_search = async (page, url, account) => {
   
    // 1. Navigate and search
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    const inputSel = 'input[title="Enter Parcel ID Number (PIN)"]';
    await page.waitForSelector(inputSel, { timeout: SELECTOR_TIMEOUT });
    await page.type(inputSel, account);

  
    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }),
        page.click('button[title="Search"]')
    ]);

    // ─── ERROR HANDLING FOR INVALID PARCEL ID ─────────────────────────
    const noRecords = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return bodyText.includes("no records found") || 
               bodyText.includes("no results") || 
               bodyText.includes("not found");
    });

    if (noRecords) {
        throw new Error("Records not found. Please check the parcel ID or enter a valid parcel ID.");
    }
    // ──────────────────────────────────────────────────────────────────

    // 2. Extract property data + summary table + payment history in ONE evaluate

    await page.waitForSelector("dt", { timeout: SELECTOR_TIMEOUT });

    // Open caret before scraping so the year buttons are in the DOM
    await expandCaret(page);

    const { propertyData, currentYearDue, paymentHistory } = await page.evaluate(() => {
        // Property
        const propertyData = { owner_name: "N/A", parcel_number: "N/A", property_address: "N/A" };
        document.querySelectorAll("dt").forEach(dt => {
            const label = dt.innerText.trim();
            const value = dt.parentElement?.querySelector("dd")?.innerText.trim() || "N/A";
            if (label.includes("Owner of Record"))   propertyData.owner_name       = value;
            if (label.includes("Parcel Number"))      propertyData.parcel_number    = value;
            if (label.includes("Property Address"))   propertyData.property_address = value || "N/A";
        });

        // Current-year summary rows
        const currentYearDue = [];
        document.querySelectorAll("table").forEach(table => {
            const headers = Array.from(table.querySelectorAll("th")).map(th => th.innerText.trim());
            if (!headers.includes("View Tax Year Bill Information") || !headers.includes("Payment Status")) return;
            table.querySelectorAll("tbody tr").forEach(tr => {
                const cols = Array.from(tr.querySelectorAll("td")).map(td => td.innerText.trim());
                if (cols.length >= 6) {
                    currentYearDue.push({
                        year: cols[0], due_date: cols[1], taxes: cols[2],
                        paid: cols[3], amount_due: cols[4], payment_status: cols[5]
                    });
                }
            });
        });

        // Payment history
        const paymentHistory = [];
        document.querySelectorAll("table").forEach(table => {
            const headers = Array.from(table.querySelectorAll("th")).map(th => th.innerText.trim());
            if (!headers.includes("Tax Year") || !headers.includes("Date Paid")) return;
            table.querySelectorAll("tbody tr").forEach(tr => {
                const cols = Array.from(tr.querySelectorAll("td")).map(td => td.innerText.trim());
                if (cols.length >= 6) {
                    paymentHistory.push({ year: cols[0], bill_number: cols[1], paid_date: cols[2], amount_paid: cols[5] });
                }
            });
        });

        return { propertyData, currentYearDue, paymentHistory };
    });

    // 3. Determine which years to visit
    const currentDueYear = currentYearDue?.[0]?.year;
    let years = [...new Set(paymentHistory.map(p => p.year))];
    if (currentDueYear && !years.includes(currentDueYear)) years.unshift(currentDueYear);

    const emptyOutput = () => ({
        processed_date: todayFormatted(),
        order_number: "N/A", borrower_name: "N/A",
        owner_name: [propertyData.owner_name],
        property_address: propertyData.property_address,
        parcel_number: propertyData.parcel_number,
        land_value: "N/A", improvements: "N/A", total_assessed_value: "N/A",
        exemption: "N/A", total_taxable_value: "N/A",
        taxing_authority: "Roseau County Treasurer, 606 5th Ave SW, Room 140, Roseau, MN 56751",
        notes: "N/A", delinquent: "NONE", total_amount_due: "$0.00",
        tax_history: []
    });

    if (years.length === 0) {
        

        return emptyOutput();
    }

    

    // 4. Collect the landing-page URL so we can navigate directly back
    const landingUrl = page.url();

    const taxHistory   = [];
    let   isFirstYear  = true;

    for (const targetYear of years) {
        


        // Find and click the year button using the combined selector
        const found = await waitSafe(page, YEAR_BTN_SELECTOR, 8000);
        if (!found) {
            

            continue;
        }

        const yearButtons = await page.$$(YEAR_BTN_SELECTOR);
        let yearButton = null;
        for (const btn of yearButtons) {
            const text = await page.evaluate(el => el.innerText.trim(), btn);
            if (text === targetYear) { yearButton = btn; break; }
        }

        if (!yearButton) {
            

            continue;
        }

        // Click and wait for the detail table
        const yearUrl = await page.evaluate(btn => btn.closest("a")?.href || null, yearButton);

        if (yearUrl) {
            // Direct navigation if it's an <a> tag
            await page.goto(yearUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
        } else {
            // Fallback for <div> links (Angular router)
            await Promise.all([
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }),
                yearButton.click()
            ]);
        }

        const tableReady = await waitSafe(page, "tbody tr", 12000);
        if (!tableReady) {
            

            await page.goto(landingUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
            await expandCaret(page);
            continue;
        }

        // Extract bill rows
        const billRows = await page.evaluate(() => {
            const rows = [];
            document.querySelectorAll("tbody tr").forEach(tr => {
                const cols = Array.from(tr.querySelectorAll("td")).map(td => td.innerText.trim());
                if (cols.length >= 9) {
                    rows.push({
                        year: cols[0], period: cols[1], bill_number: cols[2],
                        due_date: cols[3], net_tax: cols[4], penalty_fee: cols[5],
                        interest: cols[6], paid: cols[7], amount_due: cols[8]
                    });
                }
            });
            return rows;
        });

        const tempRecords = [];
        let yearHasDue = false;

        for (const row of billRows) {
            const numericDue   = Number(row.amount_due.replace(/[$,]/g, ""));
            const fmtDueDate   = convertYear(row.due_date);
            const fmtDelqDate  = getDelqDate(fmtDueDate);
            const paymentMatch = paymentHistory.find(ph => ph.year === row.year && ph.amount_paid === row.paid.replace("-", ""));

            let rowStatus = "Paid";
            if (numericDue > 0) {
                yearHasDue = true;
                rowStatus  = isDelinquent(fmtDelqDate) ? "Delinquent" : "Due";
            }

            tempRecords.push({
                jurisdiction: "County",
                year:         row.year,
                payment_type: billRows.length === 1 ? "Annual" : "Semi-Annual",
                status:       rowStatus,
                base_amount:  row.net_tax,
                amount_paid:  row.paid.replace("-", ""),
                amount_due:   row.amount_due,
                mailing_date: "N/A",
                due_date:     fmtDueDate,
                delq_date:    fmtDelqDate,
                paid_date:    paymentMatch ? convertYear(paymentMatch.paid_date) : "N/A",
                good_through_date: "N/A"
            });
        }

        if (isFirstYear) {
            taxHistory.push(...tempRecords);
            if (!yearHasDue) {
                

                await page.goto(landingUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
                break;
            }
        } else {
            if (yearHasDue) {
                taxHistory.push(...tempRecords);
            } else {
                

                await page.goto(landingUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
                break;
            }
        }

        isFirstYear = false;

        await page.goto(landingUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
        await expandCaret(page);
    }

    // 5. Totals and delinquency flag
    let totalDue = 0;
    let holdsDelinquency = false;

    for (const tax of taxHistory) {
        const numericDue = Number(tax.amount_due.replace(/[$,]/g, ""));
        totalDue += numericDue;
        if (tax.status === "Delinquent") holdsDelinquency = true;

        if (tax.status === "Paid") {
            const match = paymentHistory.find(ph => ph.year === tax.year && ph.amount_paid === tax.amount_paid);
            if (match) tax.paid_date = convertYear(match.paid_date);
        }
    }

    // 6. Build notes
    let notesText = "ALL PRIORS ARE PAID";
    if (years.length > 0 && taxHistory.length > 0) {
        const cyRecords = taxHistory.filter(t => t.year === years[0]);
        if (cyRecords.length === 1) {
            notesText = `ALL PRIORS ARE PAID, ${years[0]} TAXES ARE ${cyRecords[0].status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY`;
        } else if (cyRecords.length >= 2) {
            notesText = `ALL PRIORS ARE PAID, ${years[0]} 1ST INSTALLMENT TAXES ARE ${cyRecords[0].status.toUpperCase()}, 2ND INSTALLMENT TAXES ARE ${cyRecords[1].status.toUpperCase()}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY`;
        }
        notesText += `, NORMAL DUE DATES ARE 05/15 AND 10/15`;
    }

   

    return {
        processed_date:      todayFormatted(),
        order_number:        "N/A",
        borrower_name:       "N/A",
        owner_name:          [propertyData.owner_name],
        property_address:    propertyData.property_address,
        parcel_number:       propertyData.parcel_number,
        land_value:          "N/A",
        improvements:        "N/A",
        total_assessed_value:"N/A",
        exemption:           "N/A",
        total_taxable_value: "N/A",
        taxing_authority:    "Roseau County Treasurer, 606 5th Ave SW, Room 140, Roseau, MN 56751",
        notes:               notesText,
        delinquent:          holdsDelinquency ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
        total_amount_due:    `$${totalDue.toFixed(2)}`,
        tax_history:         taxHistory
    };
};

// ─── Express handler ─────────────────────────────────────────────────────────

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    const url = "https://mn-roseau.publicaccessnow.com/";

    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
        return res.status(200).render("error_data", { error: true, message: "Invalid Access" });
    }

    let context;
    try {
        const browser = await getBrowserInstance();
        context        = await browser.createBrowserContext();
        const page     = await context.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(NAV_TIMEOUT);

        // Block heavy resources
        await page.setRequestInterception(true);
        page.on("request", req => {
            ["stylesheet", "font", "image", "media"].includes(req.resourceType())
                ? req.abort()
                : req.continue();
        });

        try {
            const data = await account_search(page, url, account);

            if (fetch_type === "html") {
                res.status(200).render("parcel_data_official", data, (err, html) => {
                    if (err) return res.status(200).render("parcel_data_official", data);
                    const outputHtml = html.replace(
                        /Processed Date<\/td>\s*<td contenteditable class="report-table-bg-data"><\/td>/i,
                        `Processed Date</td>\n                    <td contenteditable class="report-table-bg-data">${data.processed_date}</td>`
                    );
                    res.send(outputHtml);
                });
            } else {
                res.status(200).json({ result: data });
            }
        } catch (error) {
            
            if (fetch_type === "html") {
                res.status(200).render("error_data", { error: true, message: error.message });
            } else {
                res.status(500).json({ error: true, message: error.message });
            }
        } finally {
            await context.close();
        }

    } catch (error) {
        
        
        if (fetch_type === "html") {
            res.status(200).render("error_data", { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

export { search };
