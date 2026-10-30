//Author:- Bhagyashree Badadal

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const formatDateUSA = (date) => {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const scrapeInstallment = async (page, config) => {
  const data = await page.evaluate((cfg) => {
    const getText = (selector) => {
      const el = document.querySelector(selector);
      return el ? el.textContent.trim() : null;
    };
    const dueDateText = getText(cfg.dueDateSelector);
    if (!dueDateText) return null;
    const match = dueDateText.match(/\d{2}\/\d{2}\/\d{4}/);
    const dueDateStr = match ? match[0] : null;
    const balanceValue = getText(cfg.balanceSelector) || "$0.00";
    const baseAmount = getText(cfg.baseAmountSelector) || "$0.00";
    let paidAmount = getText(cfg.paidAmountSelector);
    if (!paidAmount) paidAmount = baseAmount;
    return { dueDateStr, balanceValue, baseAmount, paidAmount };
  }, config);
  if (!data) {
    return null;
  }
  if (!data.dueDateStr) {
    return null;
  }
  const dueDate = new Date(data.dueDateStr);
  const currentDate = new Date();
  const delinquentDate = new Date(dueDate);
  delinquentDate.setDate(delinquentDate.getDate() + 1);
  let paymentStatus = "";
  let amountDue = "$0.00";
  let paidAmount = "$0.00";
  if (data.balanceValue === "$0.00") {
    paymentStatus = "Paid";
    paidAmount = data.paidAmount || "$0.00";
  } else {
    amountDue = data.balanceValue;
    paymentStatus = currentDate >= delinquentDate ? "Delinquent" : "Due";
  }
  const processedRecord = {
    payment_type: config.type,
    status: paymentStatus,
    base_amount: data.baseAmount,
    amount_paid: paidAmount,
    amount_due: amountDue,
    mailing_date: "N/A",
    due_date: formatDateUSA(dueDate),
    delq_date: formatDateUSA(delinquentDate),
    paid_date: "N/A",
    good_through_date: "-",
  };
  return processedRecord;
};

const ac_1 = async (page, inheritedUrl, account) => {
  try {
    // Clean the account number
    const cleanAccount = account.replace(/[- \.]/g, "");

    // Direct bypass URL
    const targetUrl = `https://www16.co.hennepin.mn.us/pins/pidresult.jsp?pid=${cleanAccount}`;
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    try {
      await page.waitForSelector(".row", { visible: true, timeout: 15000 });
    } catch (e) {
      throw new Error(
        `Property data not found or failed to load for account: ${account}`,
      );
    }

    // Extract Property Info
    const propertyInfo = await page.evaluate(() => {
      const rows = [...document.querySelectorAll(".row")];
      const getValue = (label) => {
        const row = rows.find((r) => {
          const cols = r.querySelectorAll(".col");
          return cols.length >= 2 && cols[0].textContent.trim() === label;
        });
        return row
          ? row
            .querySelectorAll(".col")[1]
            .textContent.replace(/\s+/g, " ")
            .trim()
          : null;
      };
      return {
        propertyId: getValue("Property ID number:") || "N/A",
        address: getValue("Address:") || "N/A",
        ownerName: getValue("Owner name:") || "N/A",
        taxableMarketValue: getValue("Taxable market value:") || "N/A",
      };
    });

    let taxYear = new Date().getFullYear().toString();
    try {
      taxYear = await page.$eval("#year", (el) => el.value.trim());
      const currentYear = String(new Date().getFullYear());

      if (taxYear !== currentYear) {
        await page.select("#year", currentYear);
        await page.waitForFunction(
          (yr) => document.querySelector("#year").value === yr,
          { timeout: 10000 },
          currentYear,
        );
        taxYear = currentYear;
      }
    } catch (e) { }
    const taxDueUrl = await page.evaluate(() => {
      const link = [...document.querySelectorAll("a")].find(
        (a) => a.textContent.trim() === "Current year taxes due",
      );
      return link?.href || null;
    });

    if (taxDueUrl) {
      await page.goto(taxDueUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }

    const installmentsConfig = [
      {
        type: "Semi-Annual",
        dueDateSelector: "#TD20",
        baseAmountSelector: "#TD21",
        paidAmountSelector: "#TD23",
        balanceSelector:
          "#TABLE_SEL > tbody > tr:nth-child(1) > td:nth-child(4) > b",
      },
      {
        type: "Semi-Annual",
        dueDateSelector: "#TD24",
        baseAmountSelector: "#TD25",
        paidAmountSelector: "#TD27",
        balanceSelector:
          "#TABLE_SEL > tbody > tr:nth-child(2) > td:nth-child(4) > b",
      },
    ];

    let taxHistoryArray = [];
    let tempRecords = [];
    for (const config of installmentsConfig) {
      const record = await scrapeInstallment(page, config);
      if (record) {
        tempRecords.push(record);
      }
    }
    const allZeros = tempRecords.every((record) => {
      const cleanBase = parseFloat((record.base_amount || "").replace(/[^0-9.]/g, "")) || 0;
      const cleanDue = parseFloat((record.amount_due || "").replace(/[^0-9.]/g, "")) || 0;
      return cleanBase === 0 && cleanDue === 0;
    });
    if (!allZeros) {
      for (const record of tempRecords) {
        const cleanBase = parseFloat((record.base_amount || "").replace(/[^0-9.]/g, "")) || 0;
        const cleanDue = parseFloat((record.amount_due || "").replace(/[^0-9.]/g, "")) || 0;

        // If a single installment has base and due as 0, update properties to 0 and Paid status
        if (cleanBase === 0 && cleanDue === 0) {
          record.base_amount = "$0.00";
          record.amount_due = "$0.00";
          record.amount_paid = "$0.00";
          record.paid_date = "N/A";
          record.status = "Paid";
        }

        record.jurisdiction = "County";
        record.year = taxYear;
        taxHistoryArray.push(record);
      }
    }
    const isAnyDelinquent = taxHistoryArray.some(
      (history) => history.status === "Delinquent",
    );
    const delinquentStatus = isAnyDelinquent
      ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF"
      : "NONE";

    let generatedNotes = "";
    if (taxHistoryArray.length > 0) {
      const statusOne = taxHistoryArray[0]?.status.toUpperCase() || "N/A";
      const statusTwo = taxHistoryArray[1]?.status.toUpperCase() || "N/A";
      const statusString =
        taxHistoryArray.length > 1
          ? `${taxYear} 1ST INSTALLMENT IS ${statusOne}, 2ND INSTALLMENT IS ${statusTwo}`
          : `${taxYear} INSTALLMENT IS ${statusOne}`;

      const dueOne = taxHistoryArray[0]?.due_date && taxHistoryArray[0].due_date !== "N/A"
        ? taxHistoryArray[0].due_date.substring(0, 5)
        : "N/A";
      const dueTwo = taxHistoryArray[1]?.due_date && taxHistoryArray[1].due_date !== "N/A"
        ? taxHistoryArray[1].due_date.substring(0, 5)
        : "N/A";

      const dueString =
        taxHistoryArray.length > 1
          ? `NORMAL DUE DATES ARE ${dueOne} AND ${dueTwo}`
          : `NORMAL DUE DATE IS ${dueOne}`;

      generatedNotes = isAnyDelinquent
        ? `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dueString}`
        : `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${dueString}`;
    }

    return {
      processed_date: "",
      order_number: "",
      borrower_name: "",
      owner_name:
        propertyInfo.ownerName && propertyInfo.ownerName !== "N/A"
          ? [propertyInfo.ownerName]
          : ["N/A"],
      property_address: propertyInfo.address || "N/A",
      parcel_number: propertyInfo.propertyId || account,
      land_value: "",
      improvements: "",
      total_assessed_value: propertyInfo.taxableMarketValue || "N/A",
      exemption: "",
      total_taxable_value: propertyInfo.taxableMarketValue || "N/A",
      taxing_authority:
        "Hennepin County Treasurer, A-600 Government Center, 300 South 6th Street, Minneapolis, MN 55487-0060",
      notes: generatedNotes,
      delinquent: delinquentStatus,
      tax_history: taxHistoryArray,
    };
  } catch (error) {
    throw new Error(
      `Hennepin County ac_1 Internal Method Error: ${error.message}`,
    );
  }
};

const account_search = async (page, url, account) => {
  try {
    return await ac_1(page, url, account);
  } catch (error) {
    throw error;
  }
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    const url = "https://hcgweb01.harfordcountymd.gov/billpay/Account/Detail";

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36",
    );

    page.setDefaultNavigationTimeout(90000);

    // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.resourceType() === "font" || req.resourceType() === "image") {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type == "html") {
      // FRONTEND ENDPOINT
      account_search(page, url, account)
        .then((data) => {
          res.status(200).render("parcel_data_official", data);
        })
        .catch((error) => {
          console.log(error);
          res.status(200).render("error_data", {
            error: true,
            message: error.message,
          });
        })
        .finally(async () => {
          await context.close();
        });
    } else if (fetch_type == "api") {
      // API ENDPOINT
      account_search(page, url, account)
        .then((data) => {
          res.status(200).json({
            result: data,
          });
        })
        .catch((error) => {
          console.log(error);
          res.status(500).json({
            error: true,
            message: error.message,
          });
        })
        .finally(async () => {
          await context.close();
        });
    }
  } catch (error) {
    console.log(error);
    if (fetch_type == "html") {
      res.status(200).render("error_data", {
        error: true,
        message: error.message,
      });
    } else if (fetch_type == "api") {
      res.status(500).json({
        error: true,
        message: error.message,
      });
    }
  }
};

export { search };
