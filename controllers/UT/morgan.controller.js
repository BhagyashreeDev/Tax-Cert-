
//Author:- Bhagyashree Badadal
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
  timeout: 90000,
};

const is_delq = (date) => {
  let today = new Date();
  let delq_date = new Date(date);
  return today >= delq_date;
};

const parseCurrency = (val) => {
  if (!val) return 0;
  return parseFloat(val.toString().replace(/[\$,]/g, "")) || 0;
};

const createPropertyObject = () => {
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
};

const createTaxHistory = () => {
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
    paid_date: "",
    good_through_date: "-",
  };
};

const formatCurrency = (val) => {
  const num = parseCurrency(val);
  return num > 0 ? `$${num.toFixed(2)}` : "$0.00";
};

const populatePropertyData = (extractedData) => {
  const property = createPropertyObject();
  const tax = createTaxHistory();

  property.parcel_number = extractedData["Parcel Number"] || "";
  const rawName = extractedData["Owner Name"];
  property.owner_name = rawName ? [rawName] : [];
  property.property_address = extractedData["Property Address"] || "";

  const taxableValue = extractedData["Total Taxable Value"] || "";
  property.total_assessed_value = taxableValue;
  property.total_taxable_value = taxableValue;

  tax.year = extractedData["TaxYear_Dropdown"] || new Date().getFullYear().toString();
  tax.base_amount = formatCurrency(extractedData["Taxes Charged"]);
  tax.amount_due = formatCurrency(extractedData["Taxes Balance Due"]);
  tax.amount_paid = formatCurrency(extractedData["Tax Prepayments"]);

  const yearNum = parseInt(tax.year, 10);
  const delqDate = new Date(yearNum, 11, 1);
  const today = new Date();

  tax.due_date = `11/30/${yearNum}`;
  tax.delq_date = `12/01/${yearNum}`;

  const numericAmountDue = parseCurrency(tax.amount_due);

  if (numericAmountDue > 0) {
    if (today >= delqDate) {
      tax.status = "Delinquent";
    } else {
      tax.status = "Due";
    }
    tax.paid_date = "N/A";
  } else {
    tax.status = "Paid";
    tax.paid_date = "N/A";
  }

  property.tax_history.push(tax);
  return property;
};

// parse that year data full and store in result
const extractXojoData = async (page) => {
  return await page.evaluate(() => {
    const labels = [];
    const values = [];
    const result = {};

    const activeYearEl =
      document.querySelector(".dropdown-item.active span") ||
      document.querySelector("button.dropdown-toggle span");
    if (activeYearEl) {
      result["TaxYear_Dropdown"] = activeYearEl.innerText.trim();
    }

    const elements = document.querySelectorAll("div.XojoContainer .XojoLabel");

    elements.forEach((el) => {
      const text = el.innerText.trim();
      if (!text) return;

      const topStyle = el.style.top;
      if (!topStyle) return;

      const topVal = parseInt(topStyle.replace("px", ""), 10);
      const leftVal = parseInt(el.style.left.replace("px", ""), 10);

      if (text.endsWith(":") || leftVal < 400) {
        labels.push({ text: text.replace(":", "").trim(), top: topVal });
      } else {
        values.push({ text: text, top: topVal });
      }
    });

    labels.forEach((label) => {
      const matchingValue = values.find(
        (val) => Math.abs(val.top - label.top) <= 5,
      );
      result[label.text] = matchingValue ? matchingValue.text : "N/A";
    });

    return result;
  });
};

const morgan_county_scrape = async (browser, page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

      const agreeBtnHandle = await page.waitForFunction(
        () => {
          const buttons = Array.from(document.querySelectorAll("button"));
          const targetBtn = buttons.find(
            (btn) =>
              btn.textContent.trim() === "I AGREE" ||
              btn.textContent.trim() === "I agree",
          );
          return targetBtn || null;
        },
        { timeout: 30000 },
      );

      await page.evaluate(() => {
        const textarea =
          document.querySelector('textarea[name="wlDisclamerWords"]') ||
          document.querySelector("textarea");
        if (textarea) {
          textarea.scrollTop = textarea.scrollHeight;
          textarea.dispatchEvent(new Event("scroll", { bubbles: true }));
        }
      });

      await new Promise((r) => setTimeout(r, 1000));
      await agreeBtnHandle.click();

      const parcelInputSelector = 'input[name="fParcel"]';
      await page.waitForSelector(parcelInputSelector);
      await page.click(parcelInputSelector);
      await page.type(parcelInputSelector, account, { delay: 100 });

      const searchBtnHandle = await page.waitForFunction(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        return buttons.find((b) => b.textContent.trim() === "Search");
      });

      await searchBtnHandle.click();
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const rowSelector = ".dt-scroll-body table tbody tr:not(.dt-empty)";
      await page.waitForSelector(rowSelector);
      await page.click(rowSelector, { clickCount: 2 });

      const xojoContainerSelector = "div.XojoContainer";
      await page.waitForSelector(xojoContainerSelector, {
        visible: true,
        timeout: 30000,
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Extract initial record like 2026
      const extractedData = await extractXojoData(page);
      const propertyRecord = populatePropertyData(extractedData);

      // Conditional Iteration Logic
      const backTaxFlag = extractedData["Back Tax Flag"] || "";
      if (!backTaxFlag.includes("No Back Taxes Owed")) {
        const currentYear = parseInt(propertyRecord.tax_history[0].year, 10);

        // Get list of available years from the dropdown
        const allYears = await page.evaluate(() => {
          const items = Array.from(
            document.querySelectorAll(".dropdown-menu .dropdown-item"),
          );
          return items
            .map((item) => item.innerText.trim())
            .filter((text) => !isNaN(parseInt(text, 10)));
        });

        // limiting the search for only last 5 years back
        const limitYear = currentYear - 5;

        const olderYears = allYears
          .map((y) => parseInt(y, 10))
          .filter((y) => y < currentYear && y >= limitYear)
          .sort((a, b) => b - a)
          .map(String);

        for (const year of olderYears) {
          const dropdownToggleSelector = "button.dropdown-toggle";
          await page.waitForSelector(dropdownToggleSelector);
          await page.click(dropdownToggleSelector);
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Locate and click the year
          const itemData = await page.$$eval(
            ".dropdown-menu .dropdown-item",
            (els) => els.map((el) => el.innerText.trim()),
          );
          const targetIndex = itemData.indexOf(year);

          if (targetIndex !== -1) {
            const itemHandles = await page.$$(".dropdown-menu .dropdown-item");
            await itemHandles[targetIndex].click();
          }

          // Wait for UI to update
          await new Promise((resolve) => setTimeout(resolve, 4000));

          // Extract and create new history item
          const historicalData = await extractXojoData(page);

          const numericAmountDue = parseCurrency(
            historicalData["Taxes Balance Due"],
          );

          // If 0 or less, skip this iteration entirely
          if (numericAmountDue <= 0) {
            continue;
          }
          const histTax = createTaxHistory();
          histTax.year = year;
          histTax.base_amount = formatCurrency(historicalData["Taxes Charged"]);
          histTax.amount_due = formatCurrency(
            historicalData["Taxes Balance Due"],
          );
          histTax.amount_paid = "$0.00";
          histTax.payment_type = "Annual";

          const yearNum = parseInt(year, 10);
          histTax.due_date = `11/30/${yearNum}`;
          histTax.delq_date = `12/01/${yearNum}`;
          histTax.status = "Delinquent";
          propertyRecord.tax_history.push(histTax);
        }
      }

      // Finalize statuses and sorting
      propertyRecord.tax_history.sort(
        (a, b) => parseInt(a.year) - parseInt(b.year),
      );

      // Check if any tax year is delinquent
      const hasDelinquency = propertyRecord.tax_history.some(
        (t) => t.status === "Delinquent",
      );

      const currentYearRecord =
        propertyRecord.tax_history[propertyRecord.tax_history.length - 1];
      propertyRecord.taxing_authority =
        "Morgan County Treasurer, 48 WEST YOUNG STREET, P.O. BOX 886 MORGAN, UTAH 84050";
      propertyRecord.delinquent = hasDelinquency
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
        : "NONE";
      propertyRecord.notes = hasDelinquency
        ? `PRIOR TAXES ARE DELINQUENT, ${currentYearRecord.year} TAXES ARE ${currentYearRecord.status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 11/30`
        : `ALL PRIORS ARE PAID, ${currentYearRecord.year} TAXES ARE ${currentYearRecord.status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 11/30`;

      resolve(propertyRecord);
    } catch (error) {
      reject(new Error(error.message));
    }
  });
};

const account_search = async (browser, page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      morgan_county_scrape(browser, page, url, account)
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

    const url = "https://taxroll.cloudapput.com/";

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
