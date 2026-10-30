// Author: Nithyananda R S 
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ─── Utilities ───────────────────────────────────────────────────────────────

const isDate = (str) => {
  const trimmed = str?.trim() || "";
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed);
};

const normalizeDate = (str) => {
  const trimmed = str?.trim() || "";
  if (!isDate(trimmed)) return "";
  const [month, day, year] = trimmed.split("/");
  return `${month.padStart(2, "0")}/${day.padStart(2, "0")}/${year}`;
};

// Parse "Apr 21, 2026" or "April 21, 2026" → "04/21/2026"
const parseMonthNameDate = (str) => {
  if (!str) return "";
  const trimmed = str.trim();
  const months = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (match) {
    const m = months[match[1].toLowerCase().slice(0, 3)];
    if (m) return `${m}/${match[2].padStart(2, "0")}/${match[3]}`;
  }
  return "";
};

const formatCurrency = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return "$0.00";
  const formatted = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num < 0
    ? `-$${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${formatted}`;
};

const isDatePastDue = (dateStr, currentDate) => {
  if (!isDate(dateStr)) return false;
  const [month, day, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day) < currentDate;
};

const parseCurrencyValue = (str) => {
  if (!str) return 0;
  return parseFloat(str.replace(/[$,()]/g, "").trim()) || 0;
};

// ─── County Config ─────────────────────────────────────────────────────────
const countyConfig = {
  adams:       { id: 14, name: "Adams County",       authority: "Adams County Treasurer, Adams County Courthouse, Hastings, NE" },
  antelope:    { id: 26, name: "Antelope County",    authority: "Antelope County Treasurer, Antelope County Courthouse, Neligh, NE" },
  banner:      { id: 85, name: "Banner County",      authority: "Banner County Treasurer, Banner County Courthouse, Harrisburg, NE 69345, Ph: (308) 436-5260" },
  boone:       { id: 23, name: "Boone County",       authority: "Boone County Treasurer, Boone County Courthouse, 222 S 4th St, Albion, NE 68620, Ph: (402) 395-2513" },
  boxbutte:    { id: 65, name: "Box Butte County",   authority: "Box Butte County Treasurer, Box Butte County Courthouse, Alliance, NE" },
  buffalo:     { id: 9,  name: "Buffalo County",     authority: "Buffalo County Treasurer, Brenda R. Rohrich, 1512 Central Ave, Kearney, NE 68848, Ph: (308) 236-1250" },
  burt:        { id: 31, name: "Burt County",        authority: "Burt County Treasurer, Burt County Courthouse, Tekamah, NE" },
  cass:        { id: 20, name: "Cass County",        authority: "Cass County Treasurer, Cass County Courthouse, Plattsmouth, NE 68048, Ph: (402) 296-9320" },
  cedar:       { id: 13, name: "Cedar County",       authority: "Cedar County Treasurer, Jean Wiebelhaus, Cedar County Courthouse, Hartington, NE 68739, Ph: (402) 254-7421" },
  chase:       { id: 72, name: "Chase County",       authority: "Chase County Treasurer, Chase County Courthouse, Imperial, NE" },
  cherry:      { id: 66, name: "Cherry County",      authority: "Cherry County Treasurer, Cherry County Courthouse, Valentine, NE" },
  cheyenne:    { id: 39, name: "Cheyenne County",    authority: "Cheyenne County Treasurer, Shelley Bowlin, Cheyenne County Courthouse, Sidney, NE 69162, Ph: (308) 254-2733" },
  clay:        { id: 30, name: "Clay County",        authority: "Clay County Treasurer, Robin Gilbert, Clay County Courthouse, Clay Center, NE 68933, Ph: (402) 762-3505" },
  colfax:      { id: 43, name: "Colfax County",      authority: "Colfax County Treasurer, Colfax County Courthouse, Schuyler, NE" },
  cuming:      { id: 24, name: "Cuming County",      authority: "Cuming County Treasurer, Cuming County Courthouse, West Point, NE" },
  dakota:      { id: 70, name: "Dakota County",      authority: "Dakota County Treasurer, Dakota County Courthouse, 1601 Broadway, Dakota City, NE 68731, Ph: (402) 987-2135" },
  dawes:       { id: 69, name: "Dawes County",       authority: "Dawes County Treasurer, Dawes County Courthouse, Chadron, NE" },
  dawson:      { id: 18, name: "Dawson County",      authority: "Dawson County Treasurer, Dawson County Courthouse, Lexington, NE 68850" },
  deuel:       { id: 78, name: "Deuel County",       authority: "Deuel County Treasurer, Deuel County Courthouse, Chappell, NE 69129, Ph: (308) 874-3307" },
  dixon:       { id: 35, name: "Dixon County",       authority: "Dixon County Treasurer, Dixon County Courthouse, 302 3rd St, Ponca, NE 68770, Ph: (402) 755-5603" },
  dundy:       { id: 76, name: "Dundy County",       authority: "Dundy County Treasurer, Dundy County Courthouse, Benkelman, NE" },
  fillmore:    { id: 34, name: "Fillmore County",    authority: "Fillmore County Treasurer, Darcy Nun, Fillmore County Courthouse, Geneva, NE 68361, Ph: (402) 759-3812" },
  franklin:    { id: 50, name: "Franklin County",    authority: "Franklin County Treasurer, Franklin County Courthouse, Franklin, NE 68939" },
  frontier:    { id: 60, name: "Frontier County",    authority: "Frontier County Treasurer, Frontier County Courthouse, Stockville, NE 69042" },
  furnas:      { id: 38, name: "Furnas County",      authority: "Furnas County Treasurer, Barbara Powell, Furnas County Courthouse, Beaver City, NE 68926, Ph: (308) 268-2195" },
  gage:        { id: 3,  name: "Gage County",        authority: "Gage County Treasurer, Gage County Courthouse, Beatrice, NE" },
  garden:      { id: 77, name: "Garden County",      authority: "Garden County Treasurer, Garden County Courthouse, 611 Main St, Oshkosh, NE 69154, Ph: (308) 772-3622" },
  garfield:    { id: 83, name: "Garfield County",    authority: "Garfield County Treasurer, Garfield County Courthouse, Burwell, NE 68823, Ph: (308) 346-4125" },
  gosper:      { id: 73, name: "Gosper County",      authority: "Gosper County Treasurer, Gosper County Courthouse, Elwood, NE" },
  grant:       { id: 92, name: "Grant County",       authority: "Grant County Treasurer, Grant County Courthouse, Hyannis, NE" },
  greeley:     { id: 62, name: "Greeley County",     authority: "Greeley County Treasurer, Greeley County Courthouse, Greeley, NE 68842" },
  hall:        { id: 8,  name: "Hall County",        authority: "Hall County Treasurer, Hall County Courthouse, Grand Island, NE" },
  hamilton:    { id: 28, name: "Hamilton County",    authority: "Hamilton County Treasurer, Hamilton County Courthouse, Aurora, NE 68818" },
  harlan:      { id: 51, name: "Harlan County",      authority: "Harlan County Treasurer, Sandy Artz, Harlan County Courthouse, Alma, NE 68920, Ph: (308) 928-2171" },
  hayes:       { id: 79, name: "Hayes County",       authority: "Hayes County Treasurer, Tammy Schwenk, Hayes County Courthouse, Hayes Center, NE 69032, Ph: (308) 286-3214" },
  hitchcock:   { id: 67, name: "Hitchcock County",   authority: "Hitchcock County Treasurer, Hitchcock County Courthouse, Trenton, NE 69044" },
  holt:        { id: 36, name: "Holt County",        authority: "Holt County Treasurer, Holt County Courthouse, 204 N 4th St, O'Neill, NE 68763, Ph: (402) 336-1291" },
  jefferson:   { id: 33, name: "Jefferson County",   authority: "Jefferson County Treasurer, Jefferson County Courthouse, Fairbury, NE" },
  johnson:     { id: 57, name: "Johnson County",     authority: "Johnson County Treasurer, Johnson County Courthouse, Tecumseh, NE" },
  kearney:     { id: 52, name: "Kearney County",     authority: "Kearney County Treasurer, Kearney County Courthouse, 424 N Colorado Ave, Minden, NE 68959, Ph: (308) 832-2730" },
  keith:       { id: 68, name: "Keith County",       authority: "Keith County Treasurer, Keith County Courthouse, Ogallala, NE 69153" },
  kimball:     { id: 71, name: "Kimball County",     authority: "Kimball County Treasurer, Kimball County Courthouse, Kimball, NE" },
  knox:        { id: 12, name: "Knox County",        authority: "Knox County Treasurer, Lori Ebel, Knox County Courthouse, Center, NE 68724, Ph: (402) 288-5615" },
  lincoln:     { id: 15, name: "Lincoln County",     authority: "Lincoln County Treasurer, Lincoln County Courthouse, North Platte, NE" },
  logan:       { id: 87, name: "Logan County",       authority: "Logan County Treasurer, Logan County Courthouse, 317 Main St, Stapleton, NE 69163, Ph: (308) 636-2441" },
  madison:     { id: 7,  name: "Madison County",     authority: "Madison County Treasurer, Madison County Courthouse, Madison, NE" },
  mcpherson:   { id: 90, name: "McPherson County",   authority: "McPherson County Treasurer, McPherson County Courthouse, Tryon, NE" },
  merrick:     { id: 46, name: "Merrick County",     authority: "Merrick County Treasurer, Sharon Gilg, Merrick County Courthouse, Central City, NE 68826, Ph: (308) 946-2171" },
  morrill:     { id: 64, name: "Morrill County",     authority: "Morrill County Treasurer, Morrill County Courthouse, 606 L St, Bridgeport, NE 69336, Ph: (308) 262-1177" },
  nance:       { id: 58, name: "Nance County",       authority: "Nance County Treasurer, Nance County Courthouse, Fullerton, NE 68638" },
  nemaha:      { id: 44, name: "Nemaha County",      authority: "Nemaha County Treasurer, Jana Gerdes, Nemaha County Courthouse, 1824 N St #201, Auburn, NE 68305, Ph: (402) 274-3319" },
  nuckolls:    { id: 42, name: "Nuckolls County",    authority: "Nuckolls County Treasurer, Tami Sharp, 150 Main Street, Nelson, NE 68961, Ph: (402) 225-4351" },
  otoe:        { id: 11, name: "Otoe County",        authority: "Otoe County Treasurer, Otoe County Courthouse, Nebraska City, NE" },
  pawnee:      { id: 54, name: "Pawnee County",      authority: "Pawnee County Treasurer, Pawnee County Courthouse, Pawnee City, NE" },
  perkins:     { id: 74, name: "Perkins County",     authority: "Perkins County Treasurer, Perkins County Courthouse, Grant, NE" },
  phelps:      { id: 37, name: "Phelps County",      authority: "Phelps County Treasurer, Phelps County Courthouse, Holdrege, NE" },
  pierce:      { id: 40, name: "Pierce County",      authority: "Pierce County Treasurer, Pierce County Courthouse, 111 W Court St, Pierce, NE 68767, Ph: (402) 329-6335" },
  platte:      { id: 10, name: "Platte County",      authority: "Platte County Treasurer, Platte County Courthouse, Columbus, NE" },
  redwillow:   { id: 48, name: "Red Willow County",  authority: "Red Willow County Treasurer, Red Willow County Courthouse, McCook, NE 69001" },
  richardson:  { id: 19, name: "Richardson County",  authority: "Richardson County Treasurer, Richardson County Courthouse, Falls City, NE 68355" },
  rock:        { id: 81, name: "Rock County",        authority: "Rock County Treasurer, Rock County Courthouse, 400 State St, Bassett, NE 68714, Ph: (402) 684-3515" },
  saline:      { id: 22, name: "Saline County",      authority: "Saline County Treasurer, Saline County Courthouse, Wilber, NE" },
  saunders:    { id: 6,  name: "Saunders County",    authority: "Saunders County Treasurer, Saunders County Courthouse, Wahoo, NE" },
  scottsbluff: { id: 21, name: "Scotts Bluff County", authority: "Scotts Bluff County Treasurer, Scotts Bluff County Courthouse, Gering, NE" },
  seward:      { id: 16, name: "Seward County",      authority: "Seward County Treasurer, Seward County Courthouse, Seward, NE" },
  sheridan:    { id: 61, name: "Sheridan County",    authority: "Sheridan County Treasurer, Sheridan County Courthouse, 301 E 2nd St, Rushville, NE 69360, Ph: (308) 327-5651" },
  sioux:       { id: 80, name: "Sioux County",       authority: "Sioux County Treasurer, Sioux County Courthouse, 325 Main St, Harrison, NE 69346, Ph: (308) 668-2422" },
  stanton:     { id: 53, name: "Stanton County",     authority: "Stanton County Treasurer, Stanton County Courthouse, Stanton, NE" },
  thayer:      { id: 32, name: "Thayer County",      authority: "Thayer County Treasurer, Thayer County Courthouse, Hebron, NE" },
  thomas:      { id: 89, name: "Thomas County",      authority: "Thomas County Treasurer, Thomas County Courthouse, Thedford, NE" },
  thurston:    { id: 55, name: "Thurston County",    authority: "Thurston County Treasurer, Thurston County Courthouse, Pender, NE" },
  valley:      { id: 47, name: "Valley County",      authority: "Valley County Treasurer, Valley County Courthouse, 125 S 15th St, Ord, NE 68862, Ph: (308) 728-5606" },
  washington:  { id: 29, name: "Washington County",  authority: "Washington County Treasurer, Washington County Courthouse, 1555 Colfax St, Blair, NE 68008, Ph: (402) 426-6888" },
  wayne:       { id: 27, name: "Wayne County",       authority: "Wayne County Treasurer, Wayne County Courthouse, Wayne, NE" },
  webster:     { id: 45, name: "Webster County",     authority: "Webster County Treasurer, Webster County Courthouse, Red Cloud, NE" },
  wheeler:     { id: 84, name: "Wheeler County",     authority: "Wheeler County Treasurer, Wheeler County Courthouse, 3rd & Main, Bartlett, NE 68622, Ph: (308) 654-3236" },
  york:        { id: 17, name: "York County",        authority: "York County Treasurer, York County Courthouse, York, NE" },
};

// ─── Step 1: Search + Parcel Card ─────────────────────────────────────────────

const nto_1 = async (page, county, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const countyId = countyConfig[county].id;
      const url = `https://nebraskataxesonline.us/County/${countyId}`;
      await page.goto(url, { waitUntil: "networkidle0", timeout: 90000 });

      await page.waitForSelector("input.mud-select-input", { timeout: 60000 });
      await new Promise(r => setTimeout(r, 2000));

      const pasteAndWaitForDropdown = async () => {
        await page.click("input.mud-select-input", { clickCount: 3 });
        await page.keyboard.press("Backspace");
        await new Promise(r => setTimeout(r, 300));

        await page.evaluate((val) => navigator.clipboard.writeText(val), account);
        await page.click("input.mud-select-input");
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.down("Control");
        await page.keyboard.press("v");
        await page.keyboard.up("Control");
        await new Promise(r => setTimeout(r, 1500));

        return await page.waitForSelector(".mud-list-item", { timeout: 8000 }).catch(() => null);
      };

      let hasDropdown = await pasteAndWaitForDropdown();

      if (!hasDropdown) {
        console.log("Dropdown not found on 1st attempt, retrying...");
        await new Promise(r => setTimeout(r, 1000));
        hasDropdown = await pasteAndWaitForDropdown();
      }

      if (!hasDropdown) return reject(new Error("account number is invalid"));

      const clicked = await page.evaluate((acc) => {
        const items = document.querySelectorAll(".mud-list-item");
        for (const item of items) {
          if (item.textContent.includes(acc)) {
            item.click();
            return true;
          }
        }
        if (items.length > 0) {
          items[0].click();
          return true;
        }
        return false;
      }, account);

      if (!clicked) return reject(new Error("account number is invalid"));

      await page.waitForSelector(".card-content-grid, .noluck, .no-results", { timeout: 35000 });

      const noResults = await page.evaluate(() => {
        return !!(document.querySelector(".noluck") || document.querySelector(".no-results"));
      });
      if (noResults) return reject(new Error("account number is invalid"));

      const parcelData = await page.evaluate(() => {
        const grid = document.querySelector(".card-content-grid");
        if (!grid) return null;

        const parcelId = grid.querySelector(".data-value")?.textContent?.trim() || "";

        let propertyAddress = "";
        const infoSections = grid.querySelectorAll(".info-section");
        for (const sec of infoSections) {
          const labels = sec.querySelectorAll(".data-label");
          for (const lbl of labels) {
            if (lbl.textContent.trim() === "Situs Address") {
              const val = lbl.nextElementSibling;
              if (val) {
                // FIX: only keep actual text nodes (nodeType === 3). The previous
                // filter only excluded <strong> elements by nodeName, which let
                // HTML comment nodes (e.g. "<!--!-->", rendered by the framework
                // as markup markers) slip through. A comment node's textContent
                // is its literal content ("!"), which is truthy and was leaking
                // a stray "!" onto the front of every scraped address.
                const lines = Array.from(val.childNodes)
                  .filter(n => n.nodeType === 3)
                  .map(n => n.textContent?.trim())
                  .filter(Boolean);
                propertyAddress = lines.join(" ").replace(/\s+/g, " ").trim();
              }
            }
          }
        }

        const ownerNames = [];
        for (const sec of infoSections) {
          const labels = sec.querySelectorAll(".data-label");
          for (const lbl of labels) {
            if (lbl.textContent.trim() === "Owner of Record") {
              const val = lbl.nextElementSibling;
              if (val) {
                const rawHtml = val.innerHTML;
                const parts = rawHtml.split(/<br\s*\/?>/i)
                  .map(p => p.replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").trim())
                  .filter(Boolean);
                ownerNames.push(...parts);
              }
            }
          }
        }

        const moneyRows = grid.querySelectorAll(".money-row");
        let grossTax = "", netTax = "", stillDue = "";
        for (const row of moneyRows) {
          const label = row.querySelector("span:first-child")?.textContent?.trim() || "";
          const value = row.querySelector("span:last-child")?.textContent?.trim() || "";
          if (label === "Gross Tax:") grossTax = value;
          if (label === "Net Tax:") netTax = value;
          if (label === "Still Due:") stillDue = value;
        }

        return { parcelId, propertyAddress, ownerNames, grossTax, netTax, stillDue };
      });

      if (!parcelData || !parcelData.parcelId) return reject(new Error("account number is invalid"));

      // Click "View Details" to load history table + pending section
      await page.click(".action-btn");
      await page.waitForSelector(".nto-history-table, .pending-section", { timeout: 30000 });

      // Scrape tax history table
      const taxHistoryEntries = await page.evaluate(() => {
        const entries = [];
        const table = document.querySelector(".nto-history-table");
        if (!table) return entries;

        let currentYear = "";
        const rows = table.querySelectorAll("tbody tr");
        for (const row of rows) {
          if (row.classList.contains("year-group-header")) {
            currentYear = row.querySelector(".year-label")?.textContent?.trim() || "";
          } else {
            const cells = row.querySelectorAll("td");
            if (cells.length >= 9) {
              const stmtNumber = cells[1]?.textContent?.trim() || "";
              const type       = cells[2]?.textContent?.trim() || "";
              const grossTax   = cells[3]?.textContent?.trim() || "";
              const penalty    = cells[4]?.textContent?.trim() || "";
              const credits    = cells[5]?.textContent?.trim() || "";
              const netTax     = cells[6]?.textContent?.trim() || "";
              const totalPaid  = cells[7]?.textContent?.trim() || "";
              const taxDue     = cells[8]?.textContent?.trim() || "";
              entries.push({ year: currentYear, stmtNumber, type, grossTax, penalty, credits, netTax, totalPaid, taxDue });
            }
          }
        }
        return entries;
      });

      if (taxHistoryEntries.length === 0) return reject(new Error("No tax data found on parcel page"));

      // ─── Scrape pending section ───────────────────────────────────────────
      const pendingData = await page.evaluate(() => {
        const result = [];
        const pendingSection = document.querySelector(".pending-section");
        if (!pendingSection) return result;

        const yearGroups = pendingSection.querySelectorAll(".pending-year-group");
        for (const group of yearGroups) {
          const yearLabel = group.querySelector(".pending-year-label")?.textContent?.trim() || "";
          const year = yearLabel.replace("Tax Year", "").trim();

          const stmtGroups = group.querySelectorAll(".pending-stmt-group");
          for (const sg of stmtGroups) {
            const stmtNumber = sg.querySelector(".pending-stmt-number")?.textContent?.replace("Stmt #", "").trim() || "";

            const paymentRows = sg.querySelectorAll(".pending-payment-row");
            for (const row of paymentRows) {
              const label = row.querySelector(".pending-payment-label")?.textContent?.trim() || "";
              const isSummaryRow = /total due/i.test(label);

              if (!isSummaryRow) {
                // ── Individual installment row ──────────────────────────────
                // Determine installment number from label first, then pill date as fallback
                let installmentNumber = 0;
                if (/1st/i.test(label)) {
                  installmentNumber = 1;
                } else if (/2nd/i.test(label)) {
                  installmentNumber = 2;
                } else {
                  const pillDate = row.querySelector(".pending-delinq-pill-date")?.textContent?.trim() || "";
                  const pillDateLower = pillDate.toLowerCase();
                  if (pillDateLower.startsWith("may")) installmentNumber = 1;
                  else if (pillDateLower.startsWith("sep")) installmentNumber = 2;
                }

                if (installmentNumber === 0) continue;

                // NOTE: pill STATE is determined from the pill's CSS class, never
                // from its text content — the text can be misleading/stale, the
                // class is the authoritative signal.
                const pillEl    = row.querySelector(".pending-delinq-pill");
                const pillClass = pillEl?.className || "";
                const pillState = pillClass.includes("delinquent") ? "Delinquent" : "Due";
                const pillDate  = row.querySelector(".pending-delinq-pill-date")?.textContent?.trim() || "";

                const amountCells = row.querySelectorAll(".pending-amount-cell");
                let taxAmount = "", interestAmount = "", totalAmount = "";
                for (const cell of amountCells) {
                  const cellLabel = cell.querySelector(".pending-amount-label")?.textContent?.trim() || "";
                  const cellVal   = cell.querySelector(".pending-amount-value")?.textContent?.trim() || "";
                  if (cellLabel === "Tax")      taxAmount      = cellVal;
                  if (cellLabel === "Interest") interestAmount = cellVal;
                  if (cellLabel === "Total")    totalAmount    = cellVal;
                }

                result.push({
                  year, stmtNumber, label, pillState, pillDate, installmentNumber,
                  taxAmount, interestAmount, totalAmount,
                });

              } else {
                let totalTaxVal = 0, totalInterestVal = 0;
                const summaryCells = row.querySelectorAll(".pending-amount-cell");
                for (const cell of summaryCells) {
                  const cellLabel = cell.querySelector(".pending-amount-label")?.textContent?.trim() || "";
                  const raw = cell.querySelector(".pending-amount-value")?.textContent?.trim() || "0";
                  const val = parseFloat(raw.replace(/[$,]/g, "")) || 0;
                  if (cellLabel === "Tax")      totalTaxVal      = val;
                  if (cellLabel === "Interest") totalInterestVal = val;
                }

                const pills = row.querySelectorAll(".pending-delinq-pill");
                for (const pill of pills) {
                  const halfEl = pill.querySelector(".pending-delinq-pill-half");
                  if (!halfEl) continue;

                  const half       = halfEl.textContent.trim(); // "1st" or "2nd"
                  const installNum = half === "1st" ? 1 : half === "2nd" ? 2 : 0;
                  if (installNum === 0) continue;

                  // Skip if already captured from an individual row
                  const alreadyCaptured = result.some(
                    r => r.year === year && r.stmtNumber === stmtNumber && r.installmentNumber === installNum
                  );
                  if (alreadyCaptured) continue;

                  const pillClass = pill.className || "";
                  const pillState = pillClass.includes("delinquent") ? "Delinquent" : "Due";
                  const pillDate  = pill.querySelector(".pending-delinq-pill-date")?.textContent?.trim() || "";

                  const capturedTax = result
                    .filter(r => r.year === year && r.stmtNumber === stmtNumber)
                    .reduce((sum, r) => sum + (parseFloat(r.taxAmount.replace(/[$,]/g, "")) || 0), 0);
                  const capturedInterest = result
                    .filter(r => r.year === year && r.stmtNumber === stmtNumber)
                    .reduce((sum, r) => sum + (parseFloat((r.interestAmount || "0").replace(/[$,]/g, "")) || 0), 0);

                  const installTax = totalTaxVal - capturedTax;
                  // Interest only accrues on a Delinquent installment.
                  const installInterest = pillState === "Delinquent"
                    ? (totalInterestVal - capturedInterest)
                    : 0;
                  const installTotal = installTax + installInterest;

                  result.push({
                    year,
                    stmtNumber,
                    label: `${half} Installment`,
                    pillState,
                    pillDate,
                    installmentNumber: installNum,
                    taxAmount: `$${installTax.toFixed(2)}`,
                    interestAmount: `$${installInterest.toFixed(2)}`,
                    totalAmount: `$${installTotal.toFixed(2)}`,
                  });
                }
              }
            }
          }
        }
        return result;
      });

      // Compute total balance due
      let totalBalance = 0;
      taxHistoryEntries.forEach(e => {
        totalBalance += parseCurrencyValue(e.taxDue);
      });

      resolve({
        balanceStr: formatCurrency(totalBalance),
        ownerNames: parcelData.ownerNames,
        propertyAddress: parcelData.propertyAddress,
        parcelId: parcelData.parcelId,
        netTax: parcelData.netTax,
        taxHistoryEntries,
        pendingData,
      });
    } catch (err) {
      reject(new Error(err.message));
    }
  });
};

// ─── Step 2: Build Base Data Object ──────────────────────────────────────────

const nto_2 = async (nto1Data, account, county) => {
  return new Promise((resolve, reject) => {
    try {
      const { balanceStr, ownerNames, propertyAddress } = nto1Data;
      const today = new Date();
      const processed_date = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

      const datum = {
        processed_date,
        order_number: "",
        borrower_name: "",
        owner_name: ownerNames.length > 0 ? ownerNames : [],
        property_address: propertyAddress,
        parcel_number: String(account),
        land_value: "",
        improvements: "",
        total_assessed_value: "",
        exemption: "",
        total_taxable_value: "",
        taxing_authority: countyConfig[county.toLowerCase()].authority,
        notes: "",
        delinquent: "",
        tax_history: [],
      };

      resolve({ data: datum, balance: balanceStr });
    } catch (err) {
      reject(new Error(err.message));
    }
  });
};

// ─── Step 3: Build Tax History ────────────────────────────────────────────────

const buildTaxHistory = async (page, taxHistoryEntries, pendingData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const entries = [];
      let assessedValue = "";

      // Sort: year desc, statement asc
      const sorted = [...taxHistoryEntries].sort((a, b) => {
        const yearDiff = parseInt(b.year) - parseInt(a.year);
        if (yearDiff !== 0) return yearDiff;
        return a.stmtNumber.localeCompare(b.stmtNumber);
      });

      for (const entry of sorted) {
        const yearNum   = parseInt(entry.year);
        const netTaxVal = parseCurrencyValue(entry.netTax);
        const base      = netTaxVal / 2;

        const dueDate1  = `05/01/${yearNum + 1}`;
        const delqDate1 = `05/02/${yearNum + 1}`;
        const dueDate2  = `09/01/${yearNum + 1}`;
        const delqDate2 = `09/02/${yearNum + 1}`;

        // ── Click "View Details →" for this year ──────────────────────────
        const clicked = await page.evaluate((yr) => {
          const headers = document.querySelectorAll("tr.year-group-header");
          for (const header of headers) {
            const label = header.querySelector(".year-label")?.textContent?.trim();
            if (label === String(yr)) {
              const btn = header.querySelector(".view-link-btn");
              if (btn) { btn.click(); return true; }
            }
          }
          return false;
        }, yearNum);

        let stmtAssessedValue = "";

        if (clicked) {
          try {
            await page.waitForSelector(".syd-stmt-body, .syd-payment-ledger, .syd-payment-table", { timeout: 15000 });
          } catch (_) { /* may not appear */ }

          // Grab assessed value
          stmtAssessedValue = await page.evaluate(() => {
            const assessedEl = document.querySelector("td.syd-val-gross");
            return assessedEl ? assessedEl.textContent.trim() : "";
          });

          if (!assessedValue && stmtAssessedValue) {
            assessedValue = stmtAssessedValue;
          }
        }

        // ── Scrape payment ledger ─────────────────────────────────────────
        // Each .syd-payment-group = one paid installment.
        // Groups appear in chronological order → first group = installment 1, second = installment 2.
        // The .syd-pay-date holds the actual payment date.
        // The .syd-pay-total holds the amount paid.
        const ledgerGroups = await page.evaluate(() => {
          const groups = [];
          const ledger = document.querySelector(".syd-payment-ledger");
          if (!ledger) return groups;

          const paymentGroups = ledger.querySelectorAll(".syd-payment-group");
          for (const group of paymentGroups) {
            const stmtNum = group.querySelector(".syd-pay-stmt-num")?.textContent?.replace("#", "").trim() || "";

            const rows = group.querySelectorAll("tbody tr");
            for (const row of rows) {
              const dateCell   = row.querySelector(".syd-pay-date")?.textContent?.trim() || "";
              const totalCell  = row.querySelector(".syd-pay-total")?.textContent?.trim() || "";
              if (dateCell) {
                groups.push({
                  stmtNum,
                  paidDate: dateCell,
                  totalPaid: totalCell,
                });
              }
            }
          }
          return groups;
        });

        // ── Scrape pending rows for this year/statement ───────────────────
        const pendingRows = pendingData.filter(
          p => p.year === String(yearNum) && p.stmtNumber === entry.stmtNumber
        );

        // ── Determine installment statuses ────────────────────────────────

        let status1     = "Due";
        let paidDate1   = "N/A";
        let paidAmount1 = 0;
        let amountDue1  = base;

        let status2     = "Due";
        let paidDate2   = "N/A";
        let paidAmount2 = 0;
        let amountDue2  = base;

        const pending1 = pendingRows.find(p => p.installmentNumber === 1);
        const pending2 = pendingRows.find(p => p.installmentNumber === 2);

        // ── Installment 1 ─────────────────────────────────────────────────
        if (!pending1) {
          // Not in pending → must be paid. Use first ledger group as payment record.
          const ledger1 = ledgerGroups[0];
          status1     = "Paid";
          paidDate1   = ledger1 ? normalizeDate(ledger1.paidDate) : "N/A";
          paidAmount1 = ledger1 ? parseCurrencyValue(ledger1.totalPaid) : base;
          amountDue1  = 0;
        } else {
          // In pending → still owed. Pill state is the sole authority on status.
          status1     = pending1.pillState === "Delinquent" ? "Delinquent" : "Due";
          paidAmount1 = 0;
          // FIX: a Delinquent installment owes tax + accrued interest. A merely
          // "Due" (not-yet-delinquent) installment owes tax only — no interest
          // has accrued yet, so base/tax-only is correct for that case.
          if (status1 === "Delinquent") {
            amountDue1 =
              parseCurrencyValue(pending1.totalAmount) ||
              (parseCurrencyValue(pending1.taxAmount) + parseCurrencyValue(pending1.interestAmount)) ||
              base;
          } else {
            amountDue1 = parseCurrencyValue(pending1.taxAmount) || base;
          }
        }

        // ── Installment 2 ─────────────────────────────────────────────────
        if (!pending2) {
          // Not in pending → must be paid.
          const ledger2 = ledgerGroups.length >= 2 ? ledgerGroups[1] : ledgerGroups[0];
          status2     = "Paid";
          paidDate2   = ledger2 ? normalizeDate(ledger2.paidDate) : "N/A";
          paidAmount2 = ledger2 ? parseCurrencyValue(ledger2.totalPaid) : base;
          amountDue2  = 0;
        } else {
          // In pending → still owed. Pill state is the sole authority on status.
          status2     = pending2.pillState === "Delinquent" ? "Delinquent" : "Due";
          paidAmount2 = 0;
          if (status2 === "Delinquent") {
            amountDue2 =
              parseCurrencyValue(pending2.totalAmount) ||
              (parseCurrencyValue(pending2.taxAmount) + parseCurrencyValue(pending2.interestAmount)) ||
              base;
          } else {
            amountDue2 = parseCurrencyValue(pending2.taxAmount) || base;
          }
        }

        // ── Annual detection ──────────────────────────────────────────────
        const singleGroupFullyPaid =
          ledgerGroups.length === 1 &&
          status1 === "Paid" &&
          status2 === "Paid";

        const bothPaidSameDay =
          ledgerGroups.length >= 2 &&
          status1 === "Paid" &&
          status2 === "Paid" &&
          paidDate1 !== "N/A" &&
          paidDate2 !== "N/A" &&
          paidDate1 === paidDate2;

        const isAnnual = singleGroupFullyPaid || bothPaidSameDay;

        if (isAnnual) {
          const totalBase = netTaxVal;
          const totalPaid = singleGroupFullyPaid
            ? parseCurrencyValue(ledgerGroups[0].totalPaid)
            : paidAmount1 + paidAmount2;
          const totalDue  = amountDue1 + amountDue2;
          entries.push({
            jurisdiction: "County",
            year: yearNum,
            payment_type: "Annual",
            status: "Paid",
            base_amount: formatCurrency(totalBase),
            amount_paid: formatCurrency(totalPaid),
            amount_due: formatCurrency(totalDue),
            mailing_date: "N/A",
            due_date: `09/01/${yearNum + 1}`,
            delq_date: `09/02/${yearNum + 1}`,
            paid_date: paidDate1,
            good_through_date: "N/A",
            delinquent: "NONE",
          });
        } else {
          // FIX: tag each installment explicitly with `installment: 1 / 2` so
          // downstream note-building (nto_unpaid) can reliably identify which
          // entry is the 1st vs 2nd installment, instead of matching against a
          // `payment_type` string ("Installment #1") that never existed here.
          entries.push({
            jurisdiction: "County",
            year: yearNum,
            payment_type: "Semi-Annual",
            installment: 1,
            status: status1,
            base_amount: formatCurrency(base),
            amount_paid: formatCurrency(paidAmount1),
            amount_due: formatCurrency(amountDue1),
            mailing_date: "N/A",
            due_date: dueDate1,
            delq_date: delqDate1,
            paid_date: paidDate1,
            good_through_date: "N/A",
            delinquent: status1 === "Delinquent" ? "YES" : "NONE",
          });
          entries.push({
            jurisdiction: "County",
            year: yearNum,
            payment_type: "Semi-Annual",
            installment: 2,
            status: status2,
            base_amount: formatCurrency(base),
            amount_paid: formatCurrency(paidAmount2),
            amount_due: formatCurrency(amountDue2),
            mailing_date: "N/A",
            due_date: dueDate2,
            delq_date: delqDate2,
            paid_date: paidDate2,
            good_through_date: "N/A",
            delinquent: status2 === "Delinquent" ? "YES" : "NONE",
          });
        }
      }

      resolve({ entries, assessedValue });
    } catch (err) {
      reject(new Error(err.message));
    }
  });
};

// ─── Process Paid ─────────────────────────────────────────────────────────────

const nto_paid = async (page, data, taxHistoryEntries, pendingData) => {
  return new Promise(async (resolve, reject) => {
    try {
      taxHistoryEntries.sort((a, b) => parseInt(b.year) - parseInt(a.year));
      const latestYear = taxHistoryEntries[0].year;
      const latestEntries = taxHistoryEntries.filter(e => e.year === latestYear);

      const { entries: taxEntries, assessedValue } = await buildTaxHistory(page, latestEntries, pendingData);
      if (taxEntries.length === 0) return reject(new Error("No tax data"));

      const latestYearNum = parseInt(latestYear);
      data.tax_history = taxEntries;

      if (assessedValue) {
        data.total_assessed_value = assessedValue;
        data.total_taxable_value  = assessedValue;
      }

      const isAnnual = taxEntries.some(e => e.year === latestYearNum && e.payment_type === "Annual");

      if (isAnnual) {
        data.notes = `ALL PRIORS ARE PAID, ${latestYearNum} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 05/01 & 09/01`;
      } else {
        data.notes = `ALL PRIORS ARE PAID, ${latestYearNum} TAXES ARE PAID, 1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 05/01 & 09/01`;
      }

      data.delinquent = "NONE";
      resolve(data);
    } catch (err) {
      reject(new Error(err.message));
    }
  });
};

// ─── Process Unpaid ───────────────────────────────────────────────────────────

const nto_unpaid = async (page, data, taxHistoryEntries, pendingData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const currentDate = new Date();
      taxHistoryEntries.sort((a, b) => parseInt(b.year) - parseInt(a.year));
      const currentTaxYear = parseInt(taxHistoryEntries[0].year);

      const unpaidEntries      = taxHistoryEntries.filter(e => parseCurrencyValue(e.taxDue) > 0);
      const unpaidYears        = [...new Set(unpaidEntries.map(e => e.year))];
      const allRelevantEntries = taxHistoryEntries.filter(e => unpaidYears.includes(e.year));

      const { entries: taxEntries, assessedValue } = await buildTaxHistory(page, allRelevantEntries, pendingData);
      if (taxEntries.length === 0) return reject(new Error("No tax data"));

      if (assessedValue) {
        data.total_assessed_value = assessedValue;
        data.total_taxable_value  = assessedValue;
      }

      data.tax_history = taxEntries.sort((a, b) => {
        const yearDiff = a.year - b.year;
        if (yearDiff !== 0) return yearDiff;
        return a.payment_type.localeCompare(b.payment_type);
      });

      const years = [...new Set(taxEntries.map(e => e.year))].sort((a, b) => a - b);
      const hasDelinquent = taxEntries.some(e => e.delinquent === "YES");
      data.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

      let notes = "";

      if (unpaidYears.length === 0) {
        const latestYear = Math.max(...taxEntries.map(h => h.year));
        const isAnnual   = taxEntries.some(e => e.year === latestYear && e.payment_type === "Annual");
        const paymentTypeNote = isAnnual ? "ANNUALLY" : "SEMI-ANNUALLY";
        notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${paymentTypeNote}, NORMAL DUE DATES ARE 05/01 & 09/01`;
      } else {
        const priorYearsUnpaid = taxHistoryEntries.some(
          e => parseInt(e.year) < currentTaxYear - 1 && parseCurrencyValue(e.taxDue) > 0
        );
        const priorNote = priorYearsUnpaid ? "PRIORS ARE DELINQUENT, " : "ALL PRIORS ARE PAID, ";
        const yearNotes = [];

        for (const year of years) {
          const yearPayments = taxEntries.filter(p => p.year === year);
          const isAnnual     = yearPayments.some(e => e.payment_type === "Annual");

          if (isAnnual) {
            const annualEntry = yearPayments.find(e => e.payment_type === "Annual");
            yearNotes.push(`${year} ANNUAL TAXES ARE ${annualEntry.status.toUpperCase()}`);
          } else {
            // FIX: match by the explicit `installment` number tagged in
            // buildTaxHistory, instead of a `payment_type` string that was
            // never actually set to "Installment #1" / "Installment #2".
            const first  = yearPayments.find(p => p.installment === 1) || { status: "Due" };
            const second = yearPayments.find(p => p.installment === 2) || { status: "Due" };
            let yearNote = `${year} `;
            if (first.status === "Paid" && second.status === "Paid") {
              yearNote += "1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID";
            } else if (first.status === "Paid") {
              yearNote += `1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
            } else if (second.status === "Paid") {
              yearNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS PAID`;
            } else {
              yearNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
            }
            yearNotes.push(yearNote);
          }
        }

        // Include current year if not already in list
        if (!years.includes(currentTaxYear)) {
          const currentYearPayments = taxEntries.filter(p => p.year === currentTaxYear);
          if (currentYearPayments.length > 0) {
            const isCurrentAnnual = currentYearPayments.some(e => e.payment_type === "Annual");
            if (isCurrentAnnual) {
              const annualEntry = currentYearPayments.find(e => e.payment_type === "Annual");
              yearNotes.push(`${currentTaxYear} ANNUAL TAXES ARE ${annualEntry.status.toUpperCase()}`);
            } else {
              // FIX: same installment-number matching fix applied here.
              const first  = currentYearPayments.find(p => p.installment === 1) || { status: "Due" };
              const second = currentYearPayments.find(p => p.installment === 2) || { status: "Due" };
              let currentNote = `${currentTaxYear} `;
              if (first.status === "Paid" && second.status === "Paid") {
                currentNote += "1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID";
              } else if (first.status === "Paid") {
                currentNote += `1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
              } else if (second.status === "Paid") {
                currentNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS PAID`;
              } else {
                currentNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
              }
              yearNotes.push(currentNote);
            }
          }
        }

        const paymentTypeNote = taxEntries.some(e => e.payment_type === "Annual") ? "ANNUALLY" : "SEMI-ANNUALLY";
        notes = `${priorNote}${yearNotes.join(", ")}, NORMALLY TAXES ARE PAID ${paymentTypeNote}, NORMAL DUE DATES ARE 05/01 & 09/01`;
      }

      data.notes = notes;
      resolve(data);
    } catch (err) {
      reject(new Error(err.message));
    }
  });
};

// ─── Orchestrator ─────────────────────────────────────────────────────────────

const account_search = async (page, county, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      nto_1(page, county, account)
        .then((nto1Data) => {
          nto_2(nto1Data, account, county)
            .then(({ data, balance }) => {
              const totalBalance = parseCurrencyValue(balance);
              if (totalBalance <= 0) {
                nto_paid(page, data, nto1Data.taxHistoryEntries, nto1Data.pendingData)
                  .then(resolve)
                  .catch((err) => { console.log(err); reject(err); });
              } else {
                nto_unpaid(page, data, nto1Data.taxHistoryEntries, nto1Data.pendingData)
                  .then(resolve)
                  .catch((err) => { console.log(err); reject(err); });
              }
            })
            .catch((err) => { console.log(err); reject(err); });
        })
        .catch((err) => { console.log(err); reject(err); });
    } catch (err) {
      console.log(err);
      reject(new Error(err.message));
    }
  });
};

// ─── Express Handler ──────────────────────────────────────────────────────────

const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  if (!account || account.trim() === "") {
    return res.status(200).render("error_data", {
      error: true,
      message: "Account number is required.",
    });
  }

  const county = req.path.replace(/^\/+/, "").toLowerCase();
  if (!countyConfig[county]) {
    return res.status(400).json({ error: true, message: "Invalid county" });
  }

  if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
    return res.status(200).render("error_data", {
      error: true,
      message: "Invalid Access",
    });
  }

  try {
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page    = await context.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type === "html") {
      account_search(page, county, account)
        .then((data) => res.status(200).render("parcel_data_official", data))
        .catch((error) => {
          console.log(error);
          res.status(200).render("error_data", { error: true, message: error.message });
        })
        .finally(async () => { await context.close(); });
    } else if (fetch_type === "api") {
      account_search(page, county, account)
        .then((data) => res.status(200).json({ result: data }))
        .catch((error) => {
          console.log(error);
          res.status(500).json({ error: true, message: error.message });
        })
        .finally(async () => { await context.close(); });
    }
  } catch (error) {
    console.log(error);
    if (fetch_type === "html") {
      res.status(200).render("error_data", { error: true, message: error.message });
    } else {
      res.status(500).json({ error: true, message: error.message });
    }
  }
};

export { search };
