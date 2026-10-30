// Author   : Harikrishna B

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const county_data = {
  "martin": {
    url: "https://beacon.schneidercorp.com/Application.aspx?AppID=139&LayerID=1771&PageTypeID=4&PageID=874&Q=1276054092&KeyValue=",
    auth: "Martin County, MN 201 Lake Avenue Fairmont, MN 56031 (507) 238-3124"
  },
  "winona" : {
    url : "https://beacon.schneidercorp.com/Application.aspx?AppID=597&LayerID=9787&PageTypeID=4&PageID=15344&Q=926981237&KeyValue=",
    auth : "Winona County, 202 W 3rd Street Winona, MN 55987"
  },
  "brown" : {
    url : "https://beacon.schneidercorp.com/Application.aspx?AppID=1055&LayerID=24482&PageTypeID=4&PageID=10115&Q=937202325&KeyValue=",
    auth : "Brown County, MN 14 S State St New Ulm, MN 56073"
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
      // Modal bypassed safely
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

      // --- PROPERTY ADDRESS PARSING ---
      const addressSpan = document.querySelector('span[id*="_lblPropertyAddress"]');
      if (addressSpan && addressSpan.innerHTML.trim()) {
        extractedData.property_address = addressSpan.innerHTML
          .split('<br>')
          .map(line => line.replace(/["\n\r]/g, '').trim())
          .filter(Boolean)
          .join(', ');
      } else {
        const rows = Array.from(document.querySelectorAll('table tr'));
        const addressRow = rows.find(row => row.textContent.includes('Property Address'));
        if (addressRow) {
          extractedData.property_address = addressRow.querySelector('td')?.innerText.replace(/\n/g, ', ').trim() || "N/A";
        }
      }

      // --- OWNER NAME PARSING ---
      const ownerSearchElement = document.querySelector(
        'a[id*="lnkSearch"], [id*="lblPrimaryOwnerName_lblSearch"], span[id*="lnkPrimaryOwnerName_lblSearch"], [id*="sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch"], [id*="sprLnkOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch"]'
      );

      if (ownerSearchElement && ownerSearchElement.innerText.trim()) {
        extractedData.owner_name = [ownerSearchElement.innerText.trim()];
      } else {
        const headersBlock = Array.from(document.querySelectorAll('header[id*="Section_divHeader"], .module-header'));
        const ownerHeader = headersBlock.find(h => {
          const text = h.textContent.trim().toLowerCase();
          return text === 'owner' || text === 'taxpayers';
        });

        if (ownerHeader) {
          const parentSection = ownerHeader.closest('section');
          const nameSpan = parentSection?.querySelector('span[id*="sprOwnerName1"], span[id*="OwnerName"]');
          if (nameSpan && nameSpan.innerText.trim()) {
            extractedData.owner_name = [nameSpan.innerText.trim()];
          } else {
            const taxpayerTable = parentSection?.querySelector('table[id*="grdTaxpayers"], table.tabular-data');
            if (taxpayerTable) {
              const ths = Array.from(taxpayerTable.querySelectorAll('thead th'));
              const nameColIdx = ths.findIndex(th => th.textContent.trim().toLowerCase() === 'name');
              const rows = Array.from(taxpayerTable.querySelectorAll('tbody tr'));
              const ownerRow = rows.find(r => r.textContent.includes('Owner')) || rows[0];

              if (ownerRow && nameColIdx !== -1) {
                const cells = Array.from(ownerRow.querySelectorAll('td, th'));
                const scrapedName = cells[nameColIdx]?.textContent.trim();
                if (scrapedName) {
                  extractedData.owner_name = [scrapedName];
                }
              }
            }
          }
        }
      }

      const allTables = Array.from(document.querySelectorAll('table'));

      // --- MERGED & FIXED TAXATION TABLE PARSING ---
      const base_table = allTables.find(table => table.id.includes('Taxation') || table.id.includes('TaxHistory') || table.id.includes('grdTaxHistory'));
      let latestYear = new Date().getFullYear().toString();
      let latestYearAmount = "$0.00";
      let taxableMarketValue = "$0.00";

      if (base_table) {
        const headers = Array.from(base_table.querySelectorAll('thead th, thead td'));
        const index2026 = headers.findIndex(cell => cell.textContent.includes('2026'));

        if (index2026 !== -1) {
          const yearMatch = headers[index2026].textContent.trim().match(/\d{4}/);
          if (yearMatch) latestYear = yearMatch[0];
        }

        const rows = Array.from(base_table.querySelectorAll('tbody tr'));
        const totalTaxesDueRow = rows.find(row => {
          const normalizedRowText = row.textContent.trim().toLowerCase().replace(/\s+/g, '');
          return normalizedRowText.includes('totaltaxesdue') || normalizedRowText.includes('totaltax');
        });

        if (totalTaxesDueRow && index2026 !== -1) {
          const valueColumns = totalTaxesDueRow.querySelectorAll('.value-column');
          const fallbackCells = totalTaxesDueRow.querySelectorAll('td, th');
          latestYearAmount = valueColumns[0]?.textContent.trim()
            || fallbackCells[index2026]?.textContent.trim()
            || "$0.00";
        }

        const taxableMarketValueRow = rows.find(row => row.textContent.includes('Taxable Market Value'));
        if (taxableMarketValueRow && index2026 !== -1) {
          const valueColumns = taxableMarketValueRow.querySelectorAll('.value-column');
          const fallbackCells = taxableMarketValueRow.querySelectorAll('td, th');
          taxableMarketValue = valueColumns[0]?.textContent.trim()
            || fallbackCells[index2026]?.textContent.trim()
            || "$0.00";
          if (typeof extractedData !== 'undefined') {
            extractedData.total_taxable_value = taxableMarketValue;
          }
        }
      }

      const base_amount = latestYearAmount !== "$0.00" ? latestYearAmount : "$0.00";
      let currentYear = latestYear;

      // --- DYNAMIC TAXES PAID ROW PARSING ---
      let latestYearTransactions = [];
      const paymentTable = allTables.find(table => {
        const headersText = table.querySelector('thead')?.textContent.toLowerCase() || "";
        return headersText.includes('receipt print date') 
          || headersText.includes('amt payment')
          || headersText.includes('receipt date')
          || headersText.includes('payment amount')
          || headersText.includes('batch date')
          || headersText.includes('total amount');
      });

      if (paymentTable) {
        const headers = Array.from(paymentTable.querySelectorAll('thead th')).map(th => 
          th.textContent.trim().toLowerCase().replace(/\s+/g, '')
        );

        const dateIdx = headers.findIndex(h => 
          h.includes('receiptprintdate') || 
          h.includes('receiptdate') || 
          h.includes('batchdate'));
        const paymentIdx = headers.findIndex(h => 
          h.includes('amtpayment') || 
          h.includes('paymentamount') || 
          h.includes('totalamount'));

        if (dateIdx !== -1 && paymentIdx !== -1) {
          const rows = Array.from(paymentTable.querySelectorAll('tbody tr'));
          rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td, th'));
            if (cells.length === 0) return;
            const rawDate = cells[dateIdx]?.textContent.replace(/\u00a0/g, ' ').trim() || "";        
            let extractedYear = "";
            const yearMatch = rawDate.match(/\b\d{4}\b/);
            if (yearMatch) {
              extractedYear = yearMatch[0];
            }
            if (extractedYear === currentYear) {
              let formattedDate = "N/A";
              const dateObj = new Date(rawDate);
              if (!isNaN(dateObj.getTime())) {
                const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                const dd = String(dateObj.getDate()).padStart(2, '0');
                const yyyy = dateObj.getFullYear();
                formattedDate = `${mm}/${dd}/${yyyy}`;
              }

              let amtText = cells[paymentIdx]?.textContent.trim() || "$0.00";
              amtText = amtText.replace(/[()]/g, '').trim();

              latestYearTransactions.push({
                receipt_print_date: formattedDate,
                amt_payment: amtText
              });
            }
          });
        }
      }

      // --- DYNAMIC VALUATION TABLE PARSING ---
      let valuationTable = allTables.find(table => 
        table.id.includes("Valuation") 
        || table.id.includes("grdValuation") 
        || table.id.includes("CurrentValuation")
      );

      if (!valuationTable) {
        const headersBlock = Array.from(document.querySelectorAll('header[id*="divHeader"], .module-header'));
        const valuationHeader = headersBlock.find(h => {
          const text = h.textContent.trim().toLowerCase();
          return text.includes('valuation') 
            || text.includes('current valuation')
            || text.includes('values for pay');
        });
        if (valuationHeader) {
          valuationTable = valuationHeader.closest('section')?.querySelector('table');
        }
      }

      if (valuationTable) {
        const headers = Array.from(valuationTable.querySelectorAll('thead th, thead td'));
        let targetColumnIndex = -1;
        let highestYearFound = 0;

        headers.forEach((cell, index) => {
          const yearMatch = cell.textContent.trim().match(/\b\d{4}\b/);
          if (yearMatch) {
            const parsedYear = parseInt(yearMatch[0], 10);
            if (parsedYear > highestYearFound) {
              highestYearFound = parsedYear;
              targetColumnIndex = index;
            }
          }
        });

        if (targetColumnIndex === -1) {
          targetColumnIndex = headers.findIndex(cell => cell.textContent.trim().toLowerCase().includes('market'));
        }
        if (targetColumnIndex === -1) {
          targetColumnIndex = 1;
        }

        const rows = Array.from(valuationTable.querySelectorAll('tbody tr'));
        const marketValueRow = rows.find(row => {
          const text = row.textContent;
          return text.includes('Estimated Market Value')
            || text.includes('Total Estimated Market Value')
            || text.includes('EMV (Estimated Market Value) Total')
            || text.includes('Total Value');
        });

        if (marketValueRow) {
          const fallbackCells = Array.from(marketValueRow.querySelectorAll('td, th'));
          const valueColumns = Array.from(marketValueRow.querySelectorAll('.value-column'));
          let parsedValue = fallbackCells[targetColumnIndex]?.textContent.trim();

          if (!parsedValue || parsedValue.includes('Value') || parsedValue.includes('Market')) {
            parsedValue = valueColumns[0]?.textContent.trim()
              || fallbackCells.find(cell => cell.textContent.includes('$'))?.textContent.trim();
          }
          extractedData.total_assessed_value = parsedValue || "$0.00";
        }
      }

      // --- STAGE 2 LAYER: REFACTORED SPLITTING HISTORY ENGINE ---
      if (extractedData.tax_history.length === 0) {
        const fullBaseAmountStr = base_amount;
        const totalBaseNumeric = parseFloat(fullBaseAmountStr.replace(/[^0-9.-]/g, '')) || 0;
        const halfLevied = totalBaseNumeric / 2;

        const paidNum1 = latestYearTransactions.length > 0 ? (parseFloat(latestYearTransactions[0].amt_payment.replace(/[^0-9.-]/g, '')) || 0) : 0;
        const paidNum2 = latestYearTransactions.length > 1 ? (parseFloat(latestYearTransactions[1].amt_payment.replace(/[^0-9.-]/g, '')) || 0) : 0;
        const totalPaidSum = paidNum1 + paidNum2;

        const unpaidNum = Math.max(0, totalBaseNumeric - totalPaidSum);

        let amtDue1 = 0, amtPaid1 = 0, status1 = "Due";
        let amtDue2 = 0, amtPaid2 = 0, status2 = "Due";

        const dueOneStr = `05/15/${currentYear}`;
        const delqOneStr = `05/16/${currentYear}`;
        const dueTwoStr = `10/15/${currentYear}`;
        const delqTwoStr = `10/16/${currentYear}`;

        const today = new Date();

        // Financial Allocation Splits
        if (unpaidNum === 0) {
          amtPaid1 = halfLevied;
          amtDue1 = 0;
          status1 = "Paid";
          
          amtPaid2 = halfLevied;
          amtDue2 = 0;
          status2 = "Paid";
        } else if (totalPaidSum === 0) {
          amtPaid1 = 0;
          amtDue1 = halfLevied;
          status1 = today > new Date(dueOneStr) ? "Delinquent" : "Due";
          
          amtPaid2 = 0;
          amtDue2 = halfLevied;
          status2 = today > new Date(dueTwoStr) ? "Delinquent" : "Due";
        } else {
          if (totalPaidSum >= halfLevied) {
            amtPaid1 = halfLevied;
            amtDue1 = 0;
            status1 = "Paid";
            
            amtPaid2 = totalPaidSum - halfLevied;
            amtDue2 = unpaidNum; 
            status2 = today > new Date(dueTwoStr) ? "Delinquent" : "Due";
          } else {
            amtPaid1 = totalPaidSum;
            amtDue1 = halfLevied - totalPaidSum;
            status1 = today > new Date(dueOneStr) ? "Delinquent" : "Due";
            
            amtPaid2 = 0;
            amtDue2 = halfLevied;
            status2 = today > new Date(dueTwoStr) ? "Delinquent" : "Due";
          }
        }
        let displayPaidDate1 = latestYearTransactions.length > 0 ? latestYearTransactions[0].receipt_print_date : "N/A";
        let displayPaidDate2 = latestYearTransactions.length > 1 ? latestYearTransactions[1].receipt_print_date : (amtPaid2 > 0 ? displayPaidDate1 : "N/A");

        // Installment 1
        extractedData.tax_history.push({
          jurisdiction: "County",
          year: currentYear,
          payment_type: "Semi-Annual",
          status: status1,
          base_amount: fullBaseAmountStr,  // ✅ CHANGED: full total, not halfLevied
          amount_paid: formatCurrency(amtPaid1),
          amount_due: formatCurrency(amtDue1),
          mailing_date: "N/A",
          due_date: dueOneStr,
          delq_date: delqOneStr,
          paid_date: displayPaidDate1,
          good_through_date: ""
        });

        // Installment 2
        extractedData.tax_history.push({
          jurisdiction: "County",
          year: currentYear,
          payment_type: "Semi-Annual",
          status: status2,
          base_amount: fullBaseAmountStr,  // ✅ CHANGED: full total, not halfLevied
          amount_paid: formatCurrency(amtPaid2),
          amount_due: formatCurrency(amtDue2),
          mailing_date: "N/A",
          due_date: dueTwoStr,
          delq_date: delqTwoStr,
          paid_date: displayPaidDate2,
          good_through_date: ""
        });
      }

      return extractedData;
    }, { account, tax_auth });
    if (data && data.tax_history) {
      data.tax_history.sort((a, b) => {
        const timeA = a.paid_date === "N/A" ? 0 : new Date(a.paid_date).getTime();
        const timeB = b.paid_date === "N/A" ? 0 : new Date(b.paid_date).getTime();
        return timeB - timeA;
      });
      data['_raw_assessed_val'] = (data.total_assessed_value && data.total_assessed_value !== "$0.00")
        ? data.total_assessed_value
        : (data.tax_history[0]?.base_amount || "$0.00");
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
          dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} AND ${shortDueTwo}`;
        } else if (currentYearInst.length === 1) {
          const shortDueOne = currentYearInst[0].due_date.substring(0, 5);
          dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
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
            generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, ${dynamicDueDatesNote}`;
          }
        }
      }
    } catch (err) {
      generatedNotes = "Error generating notes: " + err.message;
    }

    main_data['notes'] = generatedNotes;
    main_data['delinquent'] = delinquentStatus;

    // --- Sort Tax History (Ascending Order) ---
    taxHistoryArray.sort((a, b) => {
      const yearA = parseInt(a.year, 10) || 0;
      const yearB = parseInt(b.year, 10) || 0;
      if (yearA !== yearB) {
        return yearA - yearB;
      }
      const dateA = new Date(a.due_date).getTime() || 0;
      const dateB = new Date(b.due_date).getTime() || 0;

      return dateA - dateB;
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
