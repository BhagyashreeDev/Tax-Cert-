// Author: Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const logError = (scope, err) => {
  console.error(`[${scope}]`, err?.message || err);
};

const softWait = async (page, selector, timeout = 15000) => {
  try {
    await page.waitForSelector(selector, { timeout, visible: true });
    return true;
  } catch {
    return false;
  }
};

// --- TAX NOTES LOGIC ---
const applyTaxNotes = (data) => {
  const suffix = ", NORMALLY TAXES ARE PAID ANNUALLY/SEMI-ANNUALLY, NORMAL DUE DATES ARE 4/30 10/31";
  const list = Array.isArray(data.tax_history) ? data.tax_history : [];

  if (!list.length) {
    data.notes = "NO TAX HISTORY FOUND" + suffix;
    data.delinquent = "UNKNOWN";
    return data;
  }

  list.sort((a, b) => +a.year - +b.year);
  const latest = list.at(-1);
  const priors = list.filter((x) => x.year < latest.year);
  const anyDelq = list.some((x) => x.status === "Delinquent");
  const priorsDelq = priors.some((x) => ["Delinquent", "Due"].includes(x.status));

  const priorsTxt = priorsDelq ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

  switch (latest.status) {
    case "Paid":
      data.notes = `${priorsTxt}, ${latest.year} TAXES ARE PAID${suffix}`;
      break;
    case "Due":
      data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DUE${suffix}`;
      break;
    case "Delinquent":
      data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DELINQUENT${suffix}`;
      break;
    default:
      data.notes = `${latest.year} TAX STATUS UNKNOWN, VERIFY MANUALLY${suffix}`;
  }

  if (anyDelq) data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
  else if (priorsDelq || latest.status === "Due") data.delinquent = "YES";
  else data.delinquent = "NONE";

  return data;
};

// --- AC-1: Search Parcel ---
async function ac_1(page, parcel) {
  try {
    const url = "https://parcels.lewiscountywa.gov/";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

    // Enter parcel number in search input and submit
    await page.type("#q", String(parcel), { delay: 30 });
    await page.keyboard.press("Enter");

    // FIX: Wait for direct parcel page load or search result table (handling both direct redirects and result rows)
    await page.waitForSelector("#general dl, .table-link-rows, .no-results, .alert-danger", { timeout: 30000 });

    // FIX: If search results display a table, click the first matching result row to navigate to parcel details
    const firstRow = await page.$("table.table-link-rows tbody tr[data-href]");
    if (firstRow) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
        firstRow.click()
      ]);
    }

    // Check if no results
    const noResult = await page.$(".no-results, .alert-danger");
    if (noResult) throw new Error("Parcel not found");
  } catch (err) {
    logError("AC_1", err);
    throw new Error(`AC_1 failed: ${err.message}`);
  }
}

// --- AC-2: Scrape Property Data ---
async function ac_2(page) {
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

  const determineStatus = ({ amount_due_num, amount_paid_num }) => {
    const due = Number(amount_due_num) || 0;
    const paid = Number(amount_paid_num) || 0;
    if (due === 0 && paid > 0) return "Paid";
    if (due > 0 && paid === 0) return "Delinquent";
    if (due > 0 && paid > 0 && paid < due) return "Partial";
    return "N/A";
  };

  const applyOverdueStatusToData = (data) => {
    if (!data || !Array.isArray(data.tax_history)) return data;
    const today = new Date();
    for (const row of data.tax_history) {
      const dueVal = Number(row.amount_due_num) || 0;
      if (!row.due_date) {
        row.status = determineStatus(row);
        continue;
      }
      const d = new Date(row.due_date);
      row.status = (!isNaN(d.getTime()) && today > d && dueVal > 0)
        ? "Delinquent"
        : determineStatus(row);
    }
    return data;
  };

  const formatPaidDate = (dateText, year) => {
    if (!dateText) return "";
    try {
      const d = new Date(`${dateText} ${year}`);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${mm}/${dd}/${d.getFullYear()}`;
      }
    } catch {}
    return "";
  };

  const monthFromDateText = (dateText, fallbackYear) => {
    if (!dateText) return null;
    try {
      const d = new Date(`${dateText} ${fallbackYear}`);
      if (!isNaN(d.getTime())) return d.getMonth() + 1;
    } catch {}
    const m = (dateText.match(
      /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December/i
    ) || [])[0];
    const map = {
      Jan:1, January:1, Feb:2, February:2, Mar:3, March:3, Apr:4, April:4,
      May:5, Jun:6, June:6, Jul:7, July:7, Aug:8, August:8, Sep:9, September:9,
      Oct:10, October:10, Nov:11, November:11, Dec:12, December:12
    };
    return map[m] || null;
  };

  try {
    const data = {
      owner_name: [],
      property_address: "",
      parcel_number: "N/A",
      total_assessed_value: "N/A",
      total_taxable_value: "N/A",
      taxing_authority: "Lewis County Treasurer's Office, Chehalis, WA",
      // FIX: Corrected contact address from Skagit County (Mount Vernon) to Lewis County Treasurer (Chehalis, WA)
      contact_info: "Lewis County Treasurer's Office, 351 NW North St, Chehalis, WA 98532",
      notes: "",
      delinquent: "",
      tax_history: []
    };

    // General Info
    // FIX: Scrape from DOM directly (falling back to #top-information) so hidden accordion/collapsed panel doesn't time out
    const generalData = await page.evaluate(() => {
      const norm = s => s?.replace(/\s+/g, " ").trim() || "";
      let parcel = norm(document.querySelector("#general dt:nth-of-type(1) + dd")?.innerText);
      let siteAddress = norm(document.querySelector("#general dt:nth-of-type(2) + dd")?.innerText);
      let owner = norm(document.querySelector("#general dd.text-capitalize span")?.innerText);

      // Fallback to top header card which is always present
      if (!parcel) parcel = norm(document.querySelector("#top-information strong")?.innerText);
      if (!siteAddress) siteAddress = norm(document.querySelector("#top-information .success")?.innerText);
      if (!owner) owner = norm(document.querySelector("#top-information a[href*='search_by_owner']")?.innerText);

      let address = siteAddress;
      const ownerDd = document.querySelector("#general dd.text-capitalize");
      if (ownerDd && siteAddress) {
        const lines = ownerDd.innerText.split("\n").map(norm).filter(Boolean);
        const cityStateZip = lines[lines.length - 1];
        if (cityStateZip && /,\s*[A-Z]{2}\s*\d{5}/i.test(cityStateZip) && !address.toLowerCase().includes(cityStateZip.toLowerCase())) {
          address = `${siteAddress}, ${cityStateZip}`;
        }
      }

      return {
        parcel_number: parcel,
        property_address: address,
        owner_name: owner ? [owner] : []
      };
    });
    Object.assign(data, generalData);

    // Property Values
    // FIX: Read assessed & taxable values directly from #property-values table
    const propertyValues = await page.evaluate(() => {
      const norm = s => s?.replace(/\s+/g, " ").trim() || "N/A";
      const table = document.querySelector("#property-values table");
      if (!table) return {};
      const lastRow = table.querySelector("tbody tr.success, tbody tr:first-child");
      if (!lastRow) return {};
      return {
        total_assessed_value: `${norm(lastRow.children[1]?.innerText)}`,
        total_taxable_value: `${norm(lastRow.children[1]?.innerText)}`
      };
    });
    Object.assign(data, propertyValues);

    // Charge History
    // FIX: Scrape billed Property Tax Principal from #charge-history table (tbody[id^='tax-statement-'])
    const chargeHistory = await page.evaluate(() => {
      const norm = s => s?.replace(/\s+/g, " ").trim() || "";
      const tbodies = Array.from(document.querySelectorAll("#charge-history table tbody[id^='tax-statement-']"));
      const charges = {};

      tbodies.forEach(tb => {
        const yrMatch = tb.id.match(/\d{4}/);
        if (!yrMatch) return;
        const yr = Number(yrMatch[0]);

        // Find row where description column is "Principal" to isolate Property Tax Principal
        let principal = 0;
        Array.from(tb.querySelectorAll("tr")).forEach(tr => {
          const desc = norm(tr.querySelector("td:nth-child(2)")?.innerText);
          const amtStr = norm(tr.querySelector("td:nth-child(3)")?.innerText).replace(/[^0-9.]/g, "");
          if (/^Principal$/i.test(desc)) {
            principal = Number(amtStr) || 0;
          }
        });

        const totalRow = tb.querySelector("tr.total td:last-child");
        const total = totalRow ? Number(norm(totalRow.innerText).replace(/[^0-9.]/g, "")) : 0;

        charges[yr] = {
          principal: principal || total,
          total: total
        };
      });

      return charges;
    });

    // Payment History
    // FIX: Scrape Property Tax Principal (for base_amount) AND actual transaction amount paid from "Total for <Date>" row
    const paymentHistory = await page.evaluate(() => {
      const norm = s => s?.replace(/\s+/g, " ").trim() || "";
      const tbodies = Array.from(document.querySelectorAll("#payment-history table tbody"));
      const hist = [];

      tbodies.forEach(tbody => {
        let year = null;
        const header = tbody.querySelector("tr th[colspan]");
        if (header) {
          const m = norm(header.innerText).match(/\d{4}/);
          if (m) year = Number(m[0]);
        }
        if (!year) return;

        let currentDate = "";
        let currentPrincipal = 0;

        Array.from(tbody.querySelectorAll("tr")).forEach(tr => {
          const thColspan = tr.querySelector("th[colspan]");
          const thLast = tr.querySelector("th:last-child");
          const thText = norm(thColspan?.innerText || "");

          // Ignore annual summary row like "Total for 2026"
          if (/Total for \d{4}$/i.test(thText)) {
            return;
          }

          // When encountering "Total for <Date>" row (the actual amount paid for that transaction)
          if (thColspan && /Total for/i.test(thText)) {
            const dateFromTotal = thText.replace(/Total for/i, "").trim();
            const totalPaid = Number(norm(thLast?.innerText).replace(/[^0-9.]/g, "")) || 0;
            const payDate = dateFromTotal || currentDate;

            hist.push({
              year,
              date: payDate,
              principal: currentPrincipal || totalPaid,
              totalPaid: totalPaid
            });

            currentDate = "";
            currentPrincipal = 0;
            return;
          }

          const dateCell = norm(tr.querySelector("td:nth-child(1)")?.innerText);
          const desc = norm(tr.querySelector("td:nth-child(3)")?.innerText);
          const amtRaw = norm(tr.querySelector("td:nth-child(4)")?.innerText || "").replace(/[^0-9.]/g, "");
          const amt = amtRaw ? Number(amtRaw) : 0;

          if (dateCell && !dateCell.toLowerCase().includes("total")) {
            currentDate = dateCell;
          }

          if (desc && /Property Tax Principal/i.test(desc)) {
            currentPrincipal += amt;
          }
        });

        // Flush any trailing payment if total row was omitted
        if (currentPrincipal > 0) {
          hist.push({
            year,
            date: currentDate,
            principal: currentPrincipal,
            totalPaid: currentPrincipal
          });
        }
      });

      return hist;
    });

    // Current Charges
    // FIX: Parse current charges safely if active balance exists
    const currentCharges = await page.evaluate(() => {
      const norm = s => s?.replace(/\s+/g, " ").trim() || "";
      const tb = document.querySelector("#current-charges tbody");
      if (!tb) return [];
      const totalRow = tb.querySelector("tr.total td:last-child");
      const total = totalRow ? Number(norm(totalRow.innerText).replace(/[^0-9.]/g, "")) : 0;
      const yrMatch = tb.querySelector("tr:first-child td:first-child")?.innerText.match(/\d{4}/);
      return [{
        year: yrMatch ? Number(yrMatch[0]) : null,
        totalAmount: total
      }];
    });

    // FIX: Passed chargeHistory into buildTaxHistory: base_amount is Property Tax Principal, amount_paid is actual total paid
    data.tax_history = buildTaxHistory(paymentHistory, chargeHistory, currentCharges, fmt, formatPaidDate, monthFromDateText, determineStatus);

    // Apply notes
    applyTaxNotes(data);

    return applyOverdueStatusToData(data);

  } catch (err) {
    logError("AC_2", err);
    throw new Error(`AC_2 failed: ${err.message}`);
  }
}

// --- Build Tax History Helper ---
// FIX: base_amount is strictly Property Tax Principal; amount_paid is the actual amount paid from "Total for <Date>"
function buildTaxHistory(paymentHistory, chargeHistory, currentCharges, fmt, formatPaidDate, monthFromDateText, determineStatus) {
  const data = [];

  if (paymentHistory.length > 0) {
    const year = Math.max(...paymentHistory.map(p => p.year));
    const payments = paymentHistory.filter(p => p.year === year);

    const firstHalfPayments = payments.filter(p => monthFromDateText(p.date, year) < 7);
    const secondHalfPayments = payments.filter(p => monthFromDateText(p.date, year) >= 7);

    // Sum principals (for base_amount) and total paid amounts (for amount_paid from "Total for <Date>")
    const firstHalfPrincipal = firstHalfPayments.reduce((s, r) => s + r.principal, 0);
    const firstHalfPaid = firstHalfPayments.reduce((s, r) => s + r.totalPaid, 0);

    const secondHalfPrincipal = secondHalfPayments.reduce((s, r) => s + r.principal, 0);
    const secondHalfPaid = secondHalfPayments.reduce((s, r) => s + r.totalPaid, 0);

    // Billed Property Tax Principal from chargeHistory
    const billedPrincipal = chargeHistory[year]?.principal || (firstHalfPrincipal + secondHalfPrincipal);
    const halfPrincipal = billedPrincipal > 0 ? billedPrincipal / 2 : firstHalfPrincipal;

    // Base amounts strictly set to Property Tax Principal
    const base1 = firstHalfPrincipal > 0 ? firstHalfPrincipal : halfPrincipal;
    const base2 = secondHalfPrincipal > 0 ? secondHalfPrincipal : (billedPrincipal > 0 ? (billedPrincipal - base1) : halfPrincipal);

    // Annual Payment (if paid in full in 1st half)
    const totalPrincipalPaid = firstHalfPrincipal + secondHalfPrincipal;
    const totalPaid = firstHalfPaid + secondHalfPaid;
    if (firstHalfPayments.length > 0 && secondHalfPayments.length === 0 && Math.abs(totalPrincipalPaid - billedPrincipal) < 0.05) {
      data.push({
        year,
        jurisdiction: "County",
        base_amount: fmt(billedPrincipal),
        amount_due_num: 0,
        amount_paid_num: totalPaid,
        amount_due: "$0.00",
        amount_paid: fmt(totalPaid),
        paid_date: formatPaidDate(firstHalfPayments[0]?.date, year),
        payment_type: "Annual",
        mailing_date: "N/A",
        due_date: `04/30/${year}`,
        delq_date: `05/01/${year}`,
        status: "Paid"
      });
      return data;
    }

    // Semi-Annual Logic:
    // First Half
    const due1 = firstHalfPaid > 0 ? 0 : base1;
    data.push({
      year,
      jurisdiction: "County",
      base_amount: fmt(base1),
      amount_due_num: due1,
      amount_paid_num: firstHalfPaid,
      amount_due: fmt(due1),
      amount_paid: fmt(firstHalfPaid),
      paid_date: firstHalfPayments[0] ? formatPaidDate(firstHalfPayments[0].date, year) : "",
      payment_type: "Semi-Annual",
      mailing_date: "N/A",
      due_date: `04/30/${year}`,
      delq_date: `05/01/${year}`,
      status: due1 === 0 ? "Paid" : "Delinquent"
    });

    // Second Half
    const due2 = secondHalfPaid > 0 ? 0 : base2;
    data.push({
      year,
      jurisdiction: "County",
      base_amount: fmt(base2),
      amount_due_num: due2,
      amount_paid_num: secondHalfPaid,
      amount_due: fmt(due2),
      amount_paid: fmt(secondHalfPaid),
      paid_date: secondHalfPayments[0] ? formatPaidDate(secondHalfPayments[0].date, year) : "",
      payment_type: "Semi-Annual",
      mailing_date: "N/A",
      due_date: `10/31/${year}`,
      delq_date: `11/01/${year}`,
      status: due2 === 0 ? "Paid" : determineStatus({ amount_due_num: due2, amount_paid_num: secondHalfPaid })
    });

  } else {
    // For unpaid/delinquent parcels, derive tax principal from chargeHistory or currentCharges
    const chargeYears = Object.keys(chargeHistory || {}).map(Number);
    const year = currentCharges[0]?.year || (chargeYears.length > 0 ? Math.max(...chargeYears) : new Date().getFullYear());
    const totalPrincipal = chargeHistory[year]?.principal || currentCharges[0]?.totalAmount || 0;
    const half = totalPrincipal / 2;

    data.push({
      year,
      jurisdiction: "County",
      base_amount: fmt(half),
      amount_due_num: half,
      amount_paid_num: 0,
      amount_due: fmt(half),
      amount_paid: "$0.00",
      paid_date: "",
      payment_type: "Semi-Annual",
      mailing_date: "N/A",
      due_date: `04/30/${year}`,
      delq_date: `05/01/${year}`,
      status: "Delinquent"
    });
    data.push({
      year,
      jurisdiction: "County",
      base_amount: fmt(half),
      amount_due_num: half,
      amount_paid_num: 0,
      amount_due: fmt(half),
      amount_paid: "$0.00",
      paid_date: "",
      payment_type: "Semi-Annual",
      mailing_date: "N/A",
      due_date: `10/31/${year}`,
      delq_date: `11/01/${year}`,
      status: "Delinquent"
    });
  }

  return data;
}

// --- Combined Search ---
async function accountSearch(page, parcel) {
  await ac_1(page, parcel);
  return await ac_2(page);
}

// --- Express Handler ---
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  let browser;

  try {
    if (!account) return res.status(400).json({ error: "parcel must be provided" });
    if (!["html", "api"].includes(fetch_type)) return res.status(400).json({ error: "Invalid fetch_type" });

    browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    const data = await accountSearch(page, account);

    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }

    await context.close();
  } catch (error) {
    if (fetch_type === "html") {
      res.status(200).render("error_data", { error: true, message: error.message });
    } else {
      res.status(500).json({ error: true, message: error.message });
    }
  }
};

export { search };
