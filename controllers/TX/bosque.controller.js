// Author  : Harikrishna B 

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const county_data = {
  "bosque": {
    url: "https://www.bosquecountytaxoffice.com/Accounts/AccountDetails?taxAccountNumber=",
    auth: "Bosque County Tax Office, P.O. Box 716, Meridian, TX 76665"
  },
  "liberty": {
    url: "https://www.libertycountytax.com/Accounts/AccountDetails?taxAccountNumber=",
    auth: "Liberty County Tax Office, P.O. Box 10288, Liberty, TX 77575"
  },
  "wise": {
    url : "https://tax.co.wise.tx.us/Accounts/AccountDetails?taxAccountNumber=",
    auth : " Wise County Tax Office,Monte Shaw Tax Assessor-Collector"
  },
  "potter":{
    url : "https://www.pottercountytax.com/Accounts/AccountDetails?taxAccountNumber=",
    auth : "Potter County Tax Office, Thomos Warren is Tax Assessor-Collector "
  }
}
const timeout_option = {
  timeout: 90000
};

// --- STAGE 1: SCRAPE MAIN WEB DATA & TAX HISTORY ---
const ac_1 = async (page, url, account, tax_auth) => {
  try {
    const target_url = `${url}${account}`;
    await page.goto(target_url, { waitUntil: "domcontentloaded" });

    await page.waitForSelector("h5.text-sm-uppercase span.font-weight-light", timeout_option);

    const data = await page.evaluate((params) => {
      const { account, tax_auth } = params;

      const is_delq = (date) => {
        let today = new Date();
        let delq_date = new Date(date);
        return today >= delq_date ? "Delinquent" : "Due";
      };

      const extractedData = {
        processed_date: "",
        order_number: "",
        borrower_name: "",
        owner_name: ['N/A'],
        property_address: "N/A",
        parcel_number: account,
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

      // 1. OWNER AND ADDRESS EXTRACTION
      const ownerElement = Array.from(document.querySelectorAll('small')).find(
        el => el.textContent.trim().toLowerCase() === 'owner information' ||
              el.textContent.trim().toLowerCase() === 'owner'
      );
      if (ownerElement) {
        const owner_details = ownerElement.closest('div[class*="col"]');
        if (owner_details) {
          const ownerSpan = owner_details.querySelector('span');
          if (ownerSpan) extractedData['owner_name'] = [ownerSpan.textContent.trim()];

          let lines = Array.from(owner_details.querySelectorAll('div'));
          let LocationLine1 = lines[2] ? lines[2].textContent.trim() : "";
          let LocationLine2 = lines[3] ? lines[3].textContent.trim() : "";
          extractedData['property_address'] = `${LocationLine1} ${LocationLine2}`.trim() || "N/A";
        }
      }

      // 2. ASSESSED VALUE EXTRACTION
      let assessed_val = "$0.00";
      const Assessed = Array.from(document.querySelectorAll('small')).find(el => el.textContent.includes('values'));
      if (Assessed) {
        let valuesContainer = Assessed.closest('div[class*="col-"]');
        if (valuesContainer) {
          let targetDiv = valuesContainer.querySelector('div[class*="flex-column"] div');
          if (targetDiv && targetDiv.textContent.includes(':')) {
            assessed_val = targetDiv.textContent.split(':')[1].trim();
          }
        }
      }
      extractedData['_raw_assessed_val'] = assessed_val;

      let cards = document.querySelectorAll('.account-property-tax-record');

      cards.forEach(card => {
        const yearElement = card.querySelector('h2.font-weight-light');
        const tax_year = yearElement ? yearElement.textContent.trim() : null;

        if (tax_year) {
          const dueElement = card.querySelector('h3.font-weight-light');
          let amount_due = dueElement ? dueElement.textContent.trim() : "$0.00";
          const numericDue = parseFloat(amount_due.replace(/[^0-9.-]/g, ""));

          let levyAmount = "$0.00";
          const smallLabels = card.querySelectorAll('small');
          smallLabels.forEach(label => {
            if (label.textContent.trim().toLowerCase() === 'levy amount') {
              const parentDiv = label.parentElement;
              if (parentDiv) {
                const structuralSibling = parentDiv.nextElementSibling || parentDiv.parentElement.querySelectorAll('div')[1];
                if (structuralSibling) {
                  levyAmount = structuralSibling.textContent.trim();
                }
              }
            }
          });

          const due_date = `01/31/${tax_year}`;
          const delq_date = `02/01/${Number(tax_year) + 1}`;
          let status = "Delinquent";
          let amount_paid = "$0.00";
          let paidDateString = "N/A"; 
          
          const formatDate = (dateStr) => {
            if (!dateStr || dateStr.toLowerCase().includes('n/a')) return "N/A";
            const parsedDate = new Date(dateStr);           
            if (isNaN(parsedDate.getTime())) return "N/A";
            const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const dd = String(parsedDate.getDate()).padStart(2, '0');
            const yyyy = parsedDate.getFullYear();
            return `${mm}/${dd}/${yyyy}`;
          };

          if (isNaN(numericDue) || numericDue <= 0) {
            status = "Paid";
            amount_paid = levyAmount; 
            amount_due = "$0.00";

            const modalDateEl = document.querySelector('.modal-body tbody td .row .col-8');
            if (modalDateEl) {
              let rawDate = modalDateEl.textContent.trim();
              paidDateString = formatDate(rawDate);
            }
          } else {
            status = is_delq(delq_date);
          }

          extractedData.tax_history.push({
            jurisdiction: "County",
            year: tax_year,
            payment_type: "Annual",
            status: status,
            base_amount: levyAmount, 
            amount_paid: amount_paid,
            amount_due: amount_due,
            mailing_date: "N/A",
            due_date: due_date,
            delq_date: delq_date,
            paid_date: paidDateString,
            good_through_date: ""
          });
        }
      });

      // MODIFIED: Changed sort to display in ascending order (oldest year first)
      extractedData.tax_history.sort((a, b) => parseInt(a.year, 10) - parseInt(b.year, 10));
      return extractedData;
    }, { account, tax_auth });

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

    const history = main_data['tax_history'];

    if (!history || history.length === 0) {
      main_data['notes'] = "NO TAX HISTORY FOUND";
      main_data['delinquent'] = "NONE";
      return main_data;
    }
    const unpaid_entries = history.filter(entry => entry.status !== "Paid");
        const all_years = history.map(entry => parseInt(entry.year, 10));
    const latest_overall_year = Math.max(...all_years);

    // 3. Check status of that specific latest year
    const latest_year_entry = history.find(entry => parseInt(entry.year, 10) === latest_overall_year);
    const is_latest_year_paid = latest_year_entry && latest_year_entry.status === "Paid";

    if (unpaid_entries.length === 0) {
      // Case A: Everything is fully paid
      const paid_years = history.map(entry => entry.year).join(", ");
      main_data['notes'] = `ALL PRIORS ARE PAID, ${paid_years ? latest_overall_year : 'CURRENT'} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/31`;
      main_data['delinquent'] = "NONE";
    } else if (is_latest_year_paid) {
      // Case B: Prior years are delinquent, but the latest year is paid 
      main_data['notes'] = `PRIORS ARE DELINQUENT, ${latest_overall_year} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/31`;
      main_data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else {
      // Case C: The latest year itself is the delinquent 
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
  const data2 = await ac_2(page, data1);
  return data2;
};
// --- MAIN SEARCH CONTROLLER INTERFACE ---
const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
    return res.status(200).render('error_data', {
      error: true,
      message: "Invalid Access"
    });
  }
  const county = req.path.split("/").pop().toLowerCase();
  if (!county || !county_data[county]) {
    return res.status(200).render('error_data', {
      error: true,
      message: `Unknown county: ${county}`
    });
  }
  const url = county_data[county]['url'];
  const tax_auth = county_data[county]['auth'];
  let context;

  try {
    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
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
        .then((data) => {
          res.status(200).render("parcel_data_official", data);
        })
        .catch((error) => {
          console.log(error);
          res.status(200).render('error_data', {
            error: true,
            message: error.message
          });
        })
        .finally(async () => {
          if (context) await context.close();
        });

    } else if (fetch_type === "api") {
      account_search(page, url, account, tax_auth)
        .then((data) => {
          res.status(200).json({
            result: data
          });
        })
        .catch((error) => {
          console.log(error);
          res.status(500).json({
            error: true,
            message: error.message
          });
        })
        .finally(async () => {
          if (context) await context.close();
        });
    }

  } catch (error) {
    console.log(error);
    if (context) await context.close();

    if (fetch_type === "html") {
      res.status(200).render('error_data', {
        error: true,
        message: error.message
      });
    } else if (fetch_type === "api") {
      res.status(500).json({
        error: true,
        message: error.message
      });
    }
  }
};
export { 
  search
 };
