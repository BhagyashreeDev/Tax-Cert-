// Author : Harikrishna B

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const county_data = {
  hays: {
    url: "https://tax.co.hays.tx.us/Property-Detail/PropertyQuickRefID/",
    auth: "Hays County Tax Authority"
  }
};

const timeout_option = {
  timeout: 90000 
};

// --- STAGE 1: SCRAPE MAIN WEB DATA & TAX HISTORY ---
const ac_1 = async (page, baseUrl, account, tax_auth) => {
  try {
    const target_url = `${baseUrl}${account}`;
    await page.goto(target_url, { waitUntil: "domcontentloaded"});
    try {
      await page.waitForSelector("h5.text-sm-uppercase span.font-weight-light", timeout_option);
    } catch (e) {
      await page.waitForSelector("[id*='View_divOwnersLabel']", timeout_option);
    }

    const data = await page.evaluate((params) => {
      const { targetAccount, tax_auth } = params;

      const is_delq = (dateStr) => {
        const [m, d, y] = dateStr.split('/').map(Number);
        let today = new Date();
        today.setHours(0, 0, 0, 0);
        let delq_date = new Date(y, m - 1, d);
        return today >= delq_date ? "Delinquent" : "Due";
      };
      const formatDate = (dateStr) => {
        if (!dateStr || dateStr.toLowerCase().includes('n/a')) return "N/A";
        const parsedDate = new Date(dateStr);           
        if (isNaN(parsedDate.getTime())) return "N/A";
        const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(parsedDate.getDate()).padStart(2, '0');
        const yyyy = parsedDate.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
      };

      const extractedData = {
        processed_date: formatDate(new Date().toLocaleDateString('en-US')),
        order_number: "",
        borrower_name: "",
        owner_name: ['N/A'],
        property_address: "N/A",
        parcel_number: targetAccount,
        land_value: "-",
        improvements: "-",
        total_assessed_value: "$0.00",
        exemption: "-",
        total_taxable_value: "$0.00",
        taxing_authority: tax_auth,
        notes: "",
        delinquent: "NONE",
        tax_history: []
      };

      // OWNER NAME
      const ownerName = document.querySelector("[id*='View_divOwnersLabel']")?.textContent?.trim();
      if (ownerName) {
        extractedData.owner_name = [ownerName];
      }

      // Property Address
      const property_address = document.querySelector("[id*='View_tdPropertyAddress']")?.lastChild?.textContent?.trim();
      if (property_address) {
        extractedData.property_address = property_address;
      }

      // Assessed 
      const Assessed = document.querySelector("[id*='View_tdPropertyValueHeader']")?.textContent?.trim();
      extractedData['_raw_assessed_val'] = Assessed || "$0.00";

      // Amount Due
      const amount_due = document.querySelector("[id*='View_tdPMTotalDue']")?.innerText?.trim() || "$0.00";
      const numericDue = parseFloat(amount_due.replace(/[^0-9.]/g, '')) || 0;

      let base_amount = "$0.00";
      const allTds = document.querySelectorAll("#tblBills0 tr.totals td");
      for (const td of allTds) {
        const txt = td.innerText?.toLowerCase() ?? "";
        if (txt.includes("total taxes due:")) {
          base_amount = txt.replace("total taxes due:", "").trim() || "$0.00";
          break;
        }
      }

      const numericBaseAmount = parseFloat(base_amount.replace(/[^0-9.]/g, '')) || 0;

      const tbody = document.querySelectorAll("#tblPaymentHistory tbody")[1];
      if (tbody) {
        const rows = tbody.querySelectorAll("tr:not(.tableHeaders)");

        let allParsedRows = [];
        rows.forEach(row => {
          const cells = row.querySelectorAll("td");
          if (cells.length >= 4) {
            const tax_year = parseInt(cells[0]?.innerText.replace(/tax year:/i, "").trim() || "0", 10);
            const raw_paid_date = cells[1]?.innerText.replace(/transaction date:/i, "").trim();
            const parsedDateObj = new Date(raw_paid_date);

            allParsedRows.push({ 
              tax_year, 
              cells, 
              timestamp: isNaN(parsedDateObj.getTime()) ? 0 : parsedDateObj.getTime()
            });
          }
        });

        if (allParsedRows.length > 0) {
          const latestYear = Math.max(...allParsedRows.map(r => r.tax_year));
          let latestRows = allParsedRows.filter(r => r.tax_year === latestYear);

          // Sort ascending internally first so remaining balance subtracts sequentially
          latestRows.sort((a, b) => a.timestamp - b.timestamp);

          let runningRemainingBalance = numericBaseAmount;

          latestRows.forEach(({ tax_year, cells }) => {
            const str_tax_year = tax_year.toString();
            const raw_paid_date = cells[1]?.innerText.replace(/transaction date:/i, "").trim();
            const raw_amount_paid = cells[3]?.innerText.replace(/payment amount:/i, "").trim();

            const due_date = `01/31/${str_tax_year}`;
            const delq_date = `03/02/${Number(str_tax_year) + 1}`;
            
            const rowNumericPaid = parseFloat((raw_amount_paid || "").replace(/[^0-9.]/g, '')) || 0;
            
            runningRemainingBalance = Math.max(0, runningRemainingBalance - rowNumericPaid);
            
            const calculatedAmountDue = "$" + runningRemainingBalance.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            const final_amount_paid = rowNumericPaid > 0 ? raw_amount_paid : "$0.00";
            
            let status = "Delinquent";
            let paidDateString = "N/A";

            if (rowNumericPaid > 0 || numericDue <= 0) {
              status = "Paid";
              paidDateString = formatDate(raw_paid_date);
            } else {
              status = is_delq(delq_date);
            }

            extractedData.tax_history.push({
              jurisdiction: "County",
              year: str_tax_year,
              payment_type: "Annual",
              status: status,
              base_amount: base_amount, 
              amount_paid: final_amount_paid,
              amount_due: calculatedAmountDue,
              mailing_date: "N/A",
              due_date: due_date,
              delq_date: delq_date,
              paid_date: paidDateString,
              good_through_date: ""
            });
          });
        }
      }

      if (extractedData.tax_history.length === 0) {
        const currentYear = new Date().getFullYear().toString();
        extractedData.tax_history.push({
          jurisdiction: "County",
          year: currentYear,
          payment_type: "Annual",
          status: numericDue <= 0 ? "Paid" : is_delq(`02/01/${Number(currentYear) + 1}`),
          base_amount: base_amount, 
          amount_paid: numericDue <= 0 ? base_amount : "$0.00",
          amount_due: amount_due,
          mailing_date: "N/A",
          due_date: `01/31/${currentYear}`,
          delq_date: `03/02/${Number(currentYear) + 1}`,
          paid_date: "N/A",
          good_through_date: ""
        });
      }

      return extractedData;
    }, { targetAccount: account, tax_auth });

    // --- ENTIRE ROW ARRAY IS SORTED TO DESCENDING ORDER BASED ON PAID DATE ---
    if (data && data.tax_history) {
      data.tax_history.sort((a, b) => {
        const timeA = a.paid_date === "N/A" ? 0 : new Date(a.paid_date).getTime();
        const timeB = b.paid_date === "N/A" ? 0 : new Date(b.paid_date).getTime();
        return timeB - timeA; // Structural flip: Newest transaction records come first
      });
      
      // Update our temporary validation parameters to match our freshly sorted index
      data['_raw_total_due'] = data.tax_history[0]?.amount_due || "$0.00";
    }

    return data;
  } catch (error) {
    console.error("Error in ac_1:", error);
    throw error;
  }
};

// --- STAGE 2: PARSE DETAILED VALUES & MAP FINANCIAL HISTORIES ---
const ac_2 = async (page, main_data) => {
  try {
    const raw_numeric_value = main_data._raw_assessed_val
      ? parseFloat(main_data._raw_assessed_val.replace(/[^0-9.]/g, ''))
      : 0;

    const formatted_value = isNaN(raw_numeric_value) || raw_numeric_value === 0
      ? "$0.00"
      : "$" + raw_numeric_value.toLocaleString('en-US');

    main_data['total_assessed_value'] = formatted_value;
    main_data['total_taxable_value'] = formatted_value;

    delete main_data._raw_assessed_val;
    delete main_data._raw_total_due;

    const history = main_data['tax_history'] || [];
    const unpaid_entries = history.filter(entry => entry.status !== "Paid");
    
    const all_years = history.map(entry => parseInt(entry.year, 10));
    const latest_overall_year = all_years.length > 0 ? Math.max(...all_years) : new Date().getFullYear();

    const latest_year_entry = history.find(entry => parseInt(entry.year, 10) === latest_overall_year);
    const is_latest_year_paid = latest_year_entry && latest_year_entry.status === "Paid";

    if (unpaid_entries.length === 0) {
      main_data['notes'] = `ALL PRIORS ARE PAID, ${latest_overall_year} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/31`;
      main_data['delinquent'] = "NONE";
    } else if (is_latest_year_paid) {
      main_data['notes'] = `PRIORS ARE DELINQUENT, ${latest_overall_year} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/31`;
      main_data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else {
      main_data['notes'] = `PRIORS ARE DELINQUENT, ${latest_overall_year} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/31`;
      main_data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    }

    return main_data;
  } catch (error) {
    console.error("Error in ac_2:", error);
    throw error;
  }
};
// --- STAGE 3: AGGREGATE PROMISE CHAIN CONTROL FLOW ---
const account_search = async (page, url, account, tax_auth) => {
  const data1 = await ac_1(page, url, account, tax_auth);
  return await ac_2(page, data1);
};

// --- MAIN SEARCH CONTROLLER INTERFACE ---
const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
    return res.status(200).render('error_data', { error: true, message: "Invalid Access" });
  }
  
  const county = req.path.split("/").pop().toLowerCase();
  if (!county || !county_data[county]) {
    return res.status(200).render('error_data', { error: true, message: `Unknown county: ${county}` });
  }
  
  const url = county_data[county]['url'];
  const tax_auth = county_data[county]['auth'];
  let context;

  try {
    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on('request', (reqInterceptor) => {
      // Let style resources cross to avoid breaking JS visibility scripts 
      if (reqInterceptor.resourceType() === 'image') {
        reqInterceptor.abort();
      } else {
        reqInterceptor.continue();
      }
    });

    // CHANGE 3: Switched to clean Async/Await structure for request completion handling
    const finalScrapedData = await account_search(page, url, account, tax_auth);
    if (context) await context.close();

    if (fetch_type === "html") {
      return res.status(200).render("parcel_data_official", finalScrapedData);
    } else {
      return res.status(200).json({ result: finalScrapedData });
    }

  } catch (error) {
    console.error("Scraper Failure Context Error:", error);
    if (context) await context.close();

    if (fetch_type === "html") {
      return res.status(200).render('error_data', { error: true, message: error.message });
    } else {
      return res.status(500).json({ error: true, message: error.message });
    }
  }
};

export { search };
