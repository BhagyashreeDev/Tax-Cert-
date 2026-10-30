// Author   : Harikrishna B
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const county_data = {
  "cowley" : {
    url : "https://beacon.schneidercorp.com/Application.aspx?AppID=1237&LayerID=39451&PageTypeID=4&PageID=15647&KeyValue=",
    auth : "Cowley County, 311 E. 9th Avenue Winfield, KS 67156"
  }
};

const timeout_option = {
  timeout: 90000
};

// --- STAGE 1: SCRAPE MAIN WEB DATA & TAX HISTORY ---
const ac_1 = async (page, url, account, tax_auth) => {
  try {
    const target_url = `${url}${account}`;
    await page.goto(target_url, { waitUntil: 'domcontentloaded' });
    const agreeButtonSelector = '.modal-footer a.button-1';
    
    try {
      await page.waitForSelector(agreeButtonSelector, { visible: true, timeout: 5000 });
      await page.evaluate(() => {
        const agreeBtn = document.querySelector('.modal-footer a.button-1')
          || Array.from(document.querySelectorAll('.modal-footer a')).find(el => el.textContent.trim() === 'Agree');
        if (agreeBtn) agreeBtn.click();
      });
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (modalError) {
      }
    try {
      await page.waitForSelector('input[placeholder*="Parcel Number"], input[id*="txtParcelNumber"]', { timeout: 3000 });
      await page.evaluate((acc) => {
        const input = document.querySelector('input[placeholder*="Parcel Number"]')
          || document.querySelector('input[id*="txtParcelNumber"]');
        if (input) {
          input.value = acc;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, account);
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.evaluate(() => {
        const searchBtn = Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.trim() === 'Search')
          || document.querySelector('button[id*="Search"]')
          || document.querySelector('.search-button');
        if (searchBtn) searchBtn.click();
      });
    } catch (notOnSearchFormPage) {
      // Handled seamlessly
    }

    await page.waitForSelector('.module-content, [id*="lblPropertyAddress"]', { timeout: 25000 });
    const data = await page.evaluate((params) => {
      const { account, tax_auth } = params;

      const formatCurrency = (num) => {
        return "$" + num.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
      };

      const extractedData = {
        processed_date: new Date().toLocaleDateString('en-US'),
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

      // --- NAME, TAX YEAR AND PROPERTY ADDRESS PARSING ---
      const summaryTable = document.getElementById('ctlBodyPane_ctl00_ctl01_dtvTaxSummary');
      let extractedTaxYear = new Date().getFullYear().toString(); // Fallback
      
      if (summaryTable) {
        const yearRow = summaryTable.querySelector('tr:nth-child(2) td');
        const nameRow = summaryTable.querySelector('tr:nth-child(3) td');
        const addrRow = summaryTable.querySelector('tr:nth-child(4) td');
        
        if (yearRow) extractedTaxYear = yearRow.textContent.trim();
        if (nameRow) extractedData.owner_name = [nameRow.textContent.trim()];
        if (addrRow) extractedData.property_address = addrRow.textContent.trim();
      }

      // --- ASSESSED, BASE_AMOUNT AND TAXPAID TAXATION TABLE PARSING ---
      const tax_data = document.querySelectorAll('#ctlBodyPane_ctl01_ctl01_gvwTaxHistory tbody tr');
      
      let fullBaseAmountStr = "$0.00";
      let remainDue = "$0.00";
      let currentYear = extractedTaxYear;

      if (tax_data.length > 0) {
        const firstRow = tax_data[0]; 
        const taxYearElement = firstRow.querySelector('th');
        const cells = firstRow.querySelectorAll('td');
               
        if (taxYearElement && cells.length >= 6) {
          currentYear = taxYearElement.textContent.trim() || extractedTaxYear;
          extractedData.total_assessed_value = cells[0].textContent.trim();
          extractedData.total_taxable_value = cells[0].textContent.trim();
          
          fullBaseAmountStr = cells[4].textContent.trim(); // Total Tax Column
          const paidAmtStr = cells[5].textContent.trim();  // Total Paid Column
          
          const baseNum = parseFloat(fullBaseAmountStr.replace(/[^0-9.-]/g, '')) || 0;
          const paidNum = parseFloat(paidAmtStr.replace(/[^0-9.-]/g, '')) || 0;
          
          remainDue = formatCurrency(Math.max(0, baseNum - paidNum));
        }
      }

      // --- STAGE 2 LAYER: DYNAMIC DIRECT MATRIX MAPPING ---
      const totalBaseNumeric = parseFloat(fullBaseAmountStr.replace(/[^0-9.-]/g, '')) || 0;
      const totalRemainNumeric = parseFloat(remainDue.replace(/[^0-9.-]/g, '')) || 0;
      const halfLevied = totalBaseNumeric / 2;

      const dueOneStr = `12/20/${currentYear}`;
      const delqOneStr = `12/21/${currentYear}`;
      const dueTwoStr = `05/10/${parseInt(currentYear, 10) + 1}`;
      const delqTwoStr = `05/10/${parseInt(currentYear, 10) + 1}`;
        const today = new Date();
        let amtDue1 = halfLevied;
        let amtDue2 = halfLevied;
        let status1 = today > new Date(dueOneStr) ? "Delinquent" : "Due";
        let status2 = today > new Date(dueTwoStr) ? "Delinquent" : "Due";

      if (totalRemainNumeric === 0) {
        amtDue1 = 0;
        amtDue2 = 0;
        status1 = "Paid";
        status2 = "Paid";
      } else if (totalBaseNumeric > 0 && totalRemainNumeric > 0) {
        const numericPaid = totalBaseNumeric - totalRemainNumeric;
        if (numericPaid >= halfLevied) {
          amtDue1 = 0;
          status1 = "Paid";
          amtDue2 = totalRemainNumeric;
        } else {
          amtDue1 = halfLevied - numericPaid;
          amtDue2 = halfLevied;
        }
      }

      // Installment 1
      extractedData.tax_history.push({
        jurisdiction: "County",
        year: currentYear,
        payment_type: "Semi-Annual",
        status: status1,
        base_amount: formatCurrency(halfLevied) , 
        amount_paid: formatCurrency(Math.max(0, halfLevied - amtDue1)), 
        amount_due: formatCurrency(amtDue1),
        mailing_date: "N/A",
        due_date: dueOneStr,
        delq_date: delqOneStr,
        paid_date: "N/A",
        good_through_date: ""
      });

      // Installment 2
      extractedData.tax_history.push({
        jurisdiction: "County",
        year: currentYear,
        payment_type: "Semi-Annual",
        status: status2,
        base_amount: formatCurrency(halfLevied), 
        amount_paid: formatCurrency(Math.max(0, halfLevied - amtDue2)), 
        amount_due: formatCurrency(amtDue2), 
        mailing_date: "N/A",
        due_date: dueTwoStr,
        delq_date: delqTwoStr,
        paid_date: "N/A",
        good_through_date: ""
      });

      return extractedData;
    }, { account, tax_auth });

    if (data && data.tax_history) {
      data.tax_history.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
      data['_raw_assessed_val'] = data.total_assessed_value;
      data['_raw_total_due'] = data.tax_history.find(h => h.status === "Delinquent" || h.status === "Due")?.amount_due || "$0.00";
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

    const taxHistoryArray = main_data['tax_history'] || [];

    // --- OVERRIDE PAY STATUS LOGIC BASED ON ZERO BALANCE AMOUNT ---
    taxHistoryArray.forEach(installment => {
      if (installment.amount_due) {
        const numericDue = parseFloat(installment.amount_due.replace(/[^0-9.-]/g, '')) || 0;
        if (numericDue === 0) {
          installment.status = "Paid";
        }
      }
    });

    // --- DYNAMIC NOTES & DELINQUENCY CALCULATIONS ---
    let generatedNotes = "";
    let delinquentStatus = "NONE";

    try {
      if (taxHistoryArray.length > 0) {
        const isAnyDelinquent = taxHistoryArray.some(h => h.status.toUpperCase() === "DELINQUENT");
        delinquentStatus = isAnyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

        const allYears = taxHistoryArray.map(h => parseInt(h.year, 10));
        const maxYear = Math.max(...allYears);
        const yearVal = maxYear.toString();

        const isPriorYearPaid = !taxHistoryArray.some(h => h.year !== yearVal && h.status.toUpperCase() === "DELINQUENT");
        const currentYearInst = taxHistoryArray.filter(h => h.year === yearVal);

        let dynamicDueDatesNote = "";
        if (currentYearInst.length >= 2) {
          const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
          const shortDueTwo = currentYearInst[1].due_date.substring(0, 5);
          dynamicDueDatesNote = `NORMALLY DUE DATES ARE ${shortDueOne} AND ${shortDueTwo}`;
        } else if (currentYearInst.length === 1) {
          const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
          dynamicDueDatesNote = `NORMALLY DUE DATES IS ${shortDueOne}`;
        }

        if (currentYearInst.length >= 2) {
          const statusOne = currentYearInst[0].status.toUpperCase();
          const statusTwo = currentYearInst[1].status.toUpperCase();
          const statusString = `${yearVal} 1ST INSTALLMENT IS ${statusOne}, 2ND INSTALLMENT IS ${statusTwo}`;

          if (isAnyDelinquent) {
            if (isPriorYearPaid) {
              generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
            } else {
              generatedNotes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
            }
          } else {
            generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
          }
        } else {
          if (isAnyDelinquent) {
            if (isPriorYearPaid) {
              generatedNotes = `ALL PRIORS ARE DELINQUENT, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
            } else {
              generatedNotes = `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
            }
          } else {
            generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote} `;
          }
        }
      }
    } catch (err) {
      generatedNotes = "Error generating notes: " + err.message;
    }

    main_data['notes'] = generatedNotes;
    main_data['delinquent'] = delinquentStatus;

    taxHistoryArray.sort((a, b) => {
      const yearA = parseInt(a.year, 10) || 0;
      const yearB = parseInt(b.year, 10) || 0;
      if (yearA !== yearB) return yearA - yearB;
      return (new Date(a.due_date).getTime() || 0) - (new Date(b.due_date).getTime() || 0);
    });

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
    return res.status(200).render('error_data', {
      error: true,
      message: "Invalid Access"
    });
  }
  const county = req.path.split("/").pop().toLowerCase();
  if (!county || !county_data[county]) {
    return res.status(200).render('error_data', {
      error: true,
      message: `Unknown county context target: ${county}`
    });
  }

  const url = county_data[county]['url'];
  const tax_auth = county_data[county]['auth'];
  let context;

  try {
    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.resourceType() === 'font' || request.resourceType() === 'image') {
        request.abort();
      } else {
        request.continue();
      }
    });

    if (fetch_type === "html") {
      account_search(page, url, account, tax_auth)
        .then((data) => {
          res.status(200).render("parcel_data_official", data);
        })
        .catch((error) => {
          console.error(error);
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
          res.status(200).json({ result: data });
        })
        .catch((error) => {
          console.error(error);
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
    console.error(error);
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
export { search };
