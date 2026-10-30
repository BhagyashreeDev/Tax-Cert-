// Author   : Harikrishna B
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const county_data = {
   "lake-of-the-woods" : {
    url : "https://beacon.schneidercorp.com/Application.aspx?AppID=1040&LayerID=22694&PageTypeID=4&PageID=9592&Q=1637999122&KeyValue=",
    auth : "Lake of the Woods County, MN"
  },
  "cottonwood" : {
    url : "https://beacon.schneidercorp.com/Application.aspx?AppID=132&LayerID=1693&PageTypeID=4&PageID=859&Q=1740445284&KeyValue=",
    auth : "Cottonwood County, MN"
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
      // Handled silently
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

      // --- PROPERTY ADDRESS PARSING ---
      const addressSpan = document.querySelector('span[id*="_lblPropertyAddress"]');
      if (addressSpan && addressSpan.innerText.trim()) {
        extractedData.property_address = addressSpan.innerText
          .split(/\n/)
          .map(line => line.replace(/["\r]/g, '').trim())
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
          return text.includes('owner') || text.includes('taxpayer');
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

      // --- BASE AND TAXPAID TAXATION TABLE PARSING ---
      let baseTable = allTables.find(table => 
        table.id.includes("CurrentTaxes") ||
        table.id.includes("lstTaxes") ||
        table.id.includes("CurrentYearTaxes")
      );

      if (!baseTable) {
        const headerBlock = Array.from(document.querySelectorAll('header, .module-header, h2, div'));
        const baseheader = headerBlock.find(h => 
          h.textContent.trim().toLowerCase() === 'current taxes' ||
          h.textContent.trim().toLowerCase() === 'current year taxes'
        );
        if (baseheader) {
          baseTable = baseheader.closest('section')?.querySelector('table')
            || baseheader.nextElementSibling?.querySelector('table');
        }
      }

      let netTaxDue = "$0.00";
      let remainDue = "$0.00";

      if (baseTable) {
        const extractValueByRowLabel = (exactLabel) => {
          const rows = Array.from(baseTable.querySelectorAll('tr'));
          const targetRow = rows.find(r => {
            const firstCellText = r.querySelector('th, td')?.textContent.trim().toLowerCase() || "";
            return firstCellText === exactLabel.toLowerCase();
          });
          
          if (targetRow) {
            const targetSpan = targetRow.querySelector('span[id*="TXNETTLabel"], span[id*="TXRBALLabel"]');
            if (targetSpan) return targetSpan.textContent.trim();

            const cells = Array.from(targetRow.querySelectorAll('td'));
            return cells.length >= 1 ? cells[cells.length - 1].textContent.trim() : "$0.00";
          }
          return "$0.00";
        };

        netTaxDue = extractValueByRowLabel('Net Tax Due');
        remainDue = extractValueByRowLabel('Remain Due');
      }

      const fullBaseAmountStr = String(netTaxDue !== "$0.00" ? netTaxDue : "$0.00").trim();
      
      let latestYear = new Date().getFullYear().toString();
      const taxHeader = document.querySelector('header:has(div)');
      if (taxHeader) {
        const yearMatch = taxHeader.textContent.match(/\b\d{4}\b/);
        if (yearMatch) latestYear = yearMatch[0];
      }
      let currentYear = latestYear;

      // --- DYNAMIC TAXES PAID ROW PARSING ---
      const latestYearTransactions = [];
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

        const dateIdx = headers.findIndex(h => h.includes('receiptprintdate') || h.includes('receiptdate') || h.includes('batchdate'));
        const paymentIdx = headers.findIndex(h => h.includes('amtpayment') || h.includes('paymentamount') || h.includes('totalamount'));

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
      const parseValuationTable = () => {
        let valuationTable = null;
        const headersBlock = Array.from(document.querySelectorAll('header[id*="divHeader"], .module-header'));
        const valuationHeader = headersBlock.find(h => {
          const text = h.textContent.trim().toLowerCase();
          return text.includes('values for pay') || text.includes('current valuation');
        });
        if (valuationHeader) {
          valuationTable = valuationHeader.closest('section')?.querySelector('table');
        }
        if (!valuationTable) {
          valuationTable = allTables.find(table => {
            const captionText = table.querySelector('caption')?.textContent.toLowerCase() || "";
            return captionText.includes('values for pay');
          });
        }
        if (!valuationTable) {
          return "$0.00";
        }

        const headers = Array.from(valuationTable.querySelectorAll('thead th, thead td'));
        let marketColumnIndex = headers.findIndex(cell => cell.textContent.trim().toLowerCase() === 'market');
        if (marketColumnIndex === -1) {
          marketColumnIndex = 1;
        }

        const rows = Array.from(valuationTable.querySelectorAll('tbody tr'));
        const totalValueRow = rows.find(row => {
          const text = row.textContent;
          return text.includes('Total Value') || row.classList.contains('double-total-line');
        });

        if (totalValueRow) {
          const cells = Array.from(totalValueRow.querySelectorAll('td, th'));
          let totalMarketValue = cells[marketColumnIndex]?.textContent.trim();
          if (!totalMarketValue || totalMarketValue.includes('Value')) {
            const targetSpan = totalValueRow.querySelector('span[id*="PVTMKTLabel"], span[id*="Market"]');
            totalMarketValue = targetSpan ? targetSpan.textContent.trim() : cells[1]?.textContent.trim();
          }
          return totalMarketValue || "$0.00";
        }
        return "$0.00";
      };
      extractedData.total_assessed_value = parseValuationTable();

      // --- STAGE 2 LAYER: DYNAMIC DIRECT MATRIX MAPPING ---
      if (extractedData.tax_history.length === 0) {
        const totalBaseNumeric = parseFloat(fullBaseAmountStr.replace(/[^0-9.-]/g, '')) || 0;
        const totalRemainNumeric = parseFloat(remainDue.replace(/[^0-9.-]/g, '')) || 0;
        const halfLevied = totalBaseNumeric / 2;

        // Convert the divided numerical 'halfLevied' into currency string formatting
        const halfBaseAmountFormatted = formatCurrency(halfLevied);

        const dueOneStr = `05/15/${currentYear}`;
        const delqOneStr = `05/16/${currentYear}`;
        const dueTwoStr = `10/15/${currentYear}`;
        const delqTwoStr = `10/16/${currentYear}`;

        const today = new Date();

        let displayPaidDate1 = latestYearTransactions.length > 0 ? latestYearTransactions[0].receipt_print_date : "N/A";
        let displayPaidAmt1 = latestYearTransactions.length > 0 ? latestYearTransactions[0].amt_payment : "$0.00";

        let displayPaidDate2 = latestYearTransactions.length > 1 ? latestYearTransactions[1].receipt_print_date : "N/A";
        let displayPaidAmt2 = latestYearTransactions.length > 1 ? latestYearTransactions[1].amt_payment : "$0.00";

        const numericPaid1 = parseFloat(displayPaidAmt1.replace(/[^0-9.-]/g, '')) || 0;

        let amtDue1 = halfLevied;
        let amtDue2 = halfLevied;
        let status1 = today > new Date(dueOneStr) ? "Delinquent" : "Due";
        let status2 = today > new Date(dueTwoStr) ? "Delinquent" : "Due";

        if (totalRemainNumeric === 0) {
          amtDue1 = 0;
          amtDue2 = 0;
          status1 = "Paid";
          status2 = "Paid";
        } else if (numericPaid1 > 0 && totalRemainNumeric > 0) {
          if (numericPaid1 >= halfLevied) {
            amtDue1 = 0;
            status1 = "Paid";
            amtDue2 = totalRemainNumeric;
          } else {
            amtDue1 = 0;
            amtDue2 = halfLevied;
          }
        }

        // Installment 1
        extractedData.tax_history.push({
          jurisdiction: "County",
          year: currentYear,
          payment_type: "Semi-Annual",
          status: status1,
          base_amount: halfBaseAmountFormatted, 
          amount_paid: displayPaidAmt1, 
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
          base_amount: halfBaseAmountFormatted, 
          amount_paid: displayPaidAmt2, 
          amount_due: totalRemainNumeric === totalBaseNumeric ? formatCurrency(halfLevied) : remainDue, 
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
      data.tax_history.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

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
