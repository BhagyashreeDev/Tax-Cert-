// Author Name :- Bhagyashree Badadal
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
  timeout: 90000,
};

function createPropertyObject() {
  return {
    processed_date: "",
    order_number: "",
    borrower_name: "",
    owner_name: [],
    property_address: "",
    parcel_number: "",
    land_value: "",
    improvements: "",
    total_assessed_value: "",
    exemption: "",
    total_taxable_value: "",
    taxing_authority: "",
    notes: "",
    delinquent: "",
    tax_history: [],
  };
}

function createTaxHistory() {
  return {
    jurisdiction: "County",
    year: "",
    payment_type: "Annual",
    status: "",
    base_amount: "",
    amount_paid: "",
    amount_due: "",
    mailing_date: "N/A",
    due_date: "",
    delq_date: "",
    paid_date: "N/A",
    good_through_date: "-",
  };
}

async function searchAccountNumber(page, accountNumber) {
  const searchIdSelector = "#P3_SERIAL";
  await page.waitForSelector(searchIdSelector);
  await page.type(searchIdSelector, accountNumber);

  const searchButtonSelector = "#B58332429791730314";
  await page.waitForSelector(searchButtonSelector);
  await page.click(searchButtonSelector);
}

async function clickFirstResultRow(page) {
  // wait until we get response from the server that fills the table
  await page.waitForNetworkIdle({ idleTime: 1000 });
  const linkSelector = "tbody tr td:nth-child(4) a";
  await page.waitForSelector(linkSelector, { timeout: 15000, visible: true });
  // Extract the href
  const relativeUrl = await page.$eval(linkSelector, (el) =>
    el.getAttribute("href"),
  );
  const baseUrl = "https://apps.uintah.utah.gov/";
  const fullUrl = new URL(relativeUrl, baseUrl).toString();
  await page.goto(fullUrl, { waitUntil: "networkidle2" });
}

async function parseThePage(page) {
  await page.waitForNetworkIdle({ idleTime: 1000 });

  const result = createPropertyObject();

  const ownerSelector = "#P4_OWNER_DISPLAY";
  const ownerName = await page.$(ownerSelector);
  const rawName = await ownerName.evaluate((el) => el.textContent.trim());
  result.owner_name = rawName ? [rawName] : [];

  const propertSelector = "#P4_ADDRESS_DISPLAY";
  const propertyName = await page.$(propertSelector);
  result.property_address = propertyName
    ? (await propertyName.evaluate((el) => el.textContent.trim())) || "N/A"
    : "N/A";

  const taxableSelector = "#P4_ASSESSED_DISPLAY";
  const taxableValue = await page.$(taxableSelector);
  result.total_taxable_value = taxableValue
    ? (await taxableValue.evaluate((el) => el.textContent.trim())) || "N/A"
    : "N/A";
  result.total_assessed_value = result.total_taxable_value;

  return result;
}

async function getCurrencyValue(page, selector) {
  const el = await page.$(selector);
  if (!el) return 0;
  const text = await el.evaluate((el) => el.textContent.trim());
  const numericValue = parseFloat(text.replace(/[$,]/g, ""));
  return isNaN(numericValue) ? 0 : numericValue;
}

async function parseTaxHistory(page) {
  const tax = createTaxHistory();

  const yearSelector = "#P4_YEAR_T_DISPLAY";
  const yearValue = await page.$(yearSelector);
  tax.year = yearValue
    ? (await yearValue.evaluate((el) => el.textContent.trim())) || "N/A"
    : "N/A";

  const taxesSelector = "#P4_TAXES_DISPLAY";
  const taxesValue = await page.$(taxesSelector);
  tax.base_amount = taxesValue
    ? (await taxesValue.evaluate((e1) => e1.textContent.trim())) || "N/A"
    : "N/A";

  const paidNum = await getCurrencyValue(page, "#P4_PAYMENTS_DISPLAY");
  tax.amount_paid = paidNum > 0 ? `$${paidNum.toFixed(2)}` : "$0.00";

  const dueNum = await getCurrencyValue(page, "#P4_BALANCE_DISPLAY");
  tax.amount_due = dueNum > 0 ? `$${dueNum.toFixed(2)}` : "$0.00";

  tax.due_date = `11/30/${tax.year}`;
  tax.delq_date = `12/01/${tax.year}`;

  const today = new Date();
  const dueDate = new Date(tax.due_date);
  const delqDate = new Date(tax.delq_date);

  if (dueNum === 0) {
    tax.status = "Paid";
  } else if (today <= dueDate) {
    tax.status = "Due";
  } else if (today >= delqDate) {
    tax.status = "Delinquent";
  }

  return tax;
}

const uintah_county_scrape = async (browser, page, url, accountNumber) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });
      await page.waitForSelector("body", { visible: true });
      await searchAccountNumber(page, accountNumber);
      await clickFirstResultRow(page);
      const result = await parseThePage(page);
      result.parcel_number = accountNumber;

      const tax = await parseTaxHistory(page);
      result.tax_history.push(tax);

      // Finalize statuses and sorting
      result.tax_history.sort((a, b) => parseInt(a.year) - parseInt(b.year));

      // Check if any tax year is delinquent
      const hasDelinquency = result.tax_history.some(
        (t) => t.status === "Delinquent",
      );

      const currentYear = result.tax_history[result.tax_history.length - 1];
      result.taxing_authority = "Uintah County Treasurer, County Building 147 E Main, Vernal, UT 84078";
      result.delinquent = hasDelinquency
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
        : "NONE";
      result.notes = hasDelinquency
        ? `PRIOR TAXES ARE DELINQUENT, ${currentYear.year} TAXES ARE ${currentYear.status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 11/30`
        : `ALL PRIORS ARE PAID, ${currentYear.year} TAXES ARE ${currentYear.status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 11/30`;

      resolve(result);
    } catch (error) {
      reject(new Error(error.message));
    }
  });
};

const account_search = async (browser, page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      uintah_county_scrape(browser, page, url, account)
        .then((data) => resolve(data))
        .catch((error) => reject(new Error(error.message)));
    } catch (error) {
      reject(new Error(error.message));
    }
  });
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

    const url =
      "https://apps.uintah.utah.gov/ords/ucdev/r/public-searches/property-search";

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36",
    );

    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.resourceType() === "font" || req.resourceType() === "image") {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type == "html") {
      account_search(browser, page, url, account)
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
      account_search(browser, page, url, account)
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
