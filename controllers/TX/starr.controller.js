import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
  starr: {
    url: "https://starr.go2gov.net/faces/search.jsp",
    auth: "Starr County, Ameida Salinas - Tax Assessor-Collector, 100 N. FM 3167, Ste 201, Rio Grande City, TX 78582",
  },
  webb: {
    url: "https://webb.go2gov.net/faces/search.jsp",
    auth: "Webb County, Patricia A. Barrera - Tax Assessor/Collector, P. O. Box 420128, Laredo, TX 78042, (956) 523-4200",
  },
  cameron: {
    url: "https://camerontax.go2gov.net/faces/search.jsp",
    auth: "Cameron County, PO BOX 952, BROWNSVILLE TX 78522-0952",
  },
};

const timeout_option = {
  timeout: 90000,
};

// --- USER'S LOGIC HELPERS ---

function getTaxDates(year) {
  const nextYear = Number(year) + 1;
  return {
    due_date: `01/31/${nextYear}`,
    delq_date: `02/01/${nextYear}`,
  };
}

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
    delinquent: "NONE",
    tax_history: [],
  };
}

function createTaxHistory() {
  return {
    jurisdiction: "County",
    year: "",
    payment_type: "",
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
}

const generate_notes = (year, keys, status) => {
  let notes = "";
  try {
    notes =
      keys === 1
        ? `ALL PRIORS ARE PAID, ${year} `
        : `PRIORS ARE DELINQUENT, ${year} `;
    notes += `TAXES ARE ${status.toUpperCase()},`;
    notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;

    const dates = getTaxDates(year);
    notes += ` NORMAL DUE DATE IS ${dates.due_date.substring(0, 5)}`;
  } catch (error) {
    console.log(error);
  } finally {
    return notes;
  }
};

function applyStatusLogic(taxRecord, baseAmount, totalPaid, paidDateStr) {
  const today = new Date();
  const dueDate = new Date(taxRecord.due_date);
  const delqDate = new Date(taxRecord.delq_date);

  if (!paidDateStr || paidDateStr === "N/A" || paidDateStr === "") {
    taxRecord.amount_paid = "N/A";
    taxRecord.base_amount = baseAmount || "N/A";
    taxRecord.amount_due = baseAmount || "N/A";
    taxRecord.status = today < dueDate ? "Due" : "Delinquent";
    return;
  }

  const paidDate = new Date(paidDateStr);
  taxRecord.paid_date = paidDateStr;
  taxRecord.base_amount = baseAmount;
  taxRecord.amount_paid = totalPaid;

  if (paidDate <= dueDate) {
    taxRecord.status = "Paid";
    taxRecord.amount_due = "N/A";
    return;
  }

  if (paidDate >= delqDate) {
    taxRecord.status = "Paid";
    taxRecord.amount_due = totalPaid;
    return;
  }

  taxRecord.status = "Paid";
  taxRecord.amount_due = "N/A";
}


// Get the ownerName, propertyAddress
async function scrapePropertyInfo(page) {
  await page.waitForSelector("span.boldresult");
  const info = await page.evaluate(() => {
    const dataRow = document.querySelector("span.boldresult")?.closest("tr");
    if (!dataRow) {
      return { accountNo: "", ownerName: "", locationAddress: "" };
    }
    return {
      accountNo:
        dataRow.querySelector("td:nth-child(3)")?.textContent?.trim() || "",
      ownerName:
        dataRow.querySelector("td:nth-child(4)")?.textContent?.trim() || "",
      locationAddress:
        dataRow.querySelector("td:nth-child(5)")?.textContent?.trim() || "",
    };
  });
  return info;
}

async function scrapeCurrentTaxes(page) {
  const currentTable1 = await page
    .$("#etaxTemplateForm\\:current1")
    .catch(() => null);
  if (!currentTable1) {
    return { rows: [], totalAssessedValue: "N/A", totalTaxableValue: "N/A" };
  }

  const rows = await page.evaluate(() => {
    const trs = document.querySelectorAll(
      "#etaxTemplateForm\\:current1 tbody tr",
    );
    return [...trs].map((row) => ({
      year: row.querySelector('[id$="year1"]')?.textContent?.trim() || "",
      base: row.querySelector('[id$="taxesDue1"]')?.textContent?.trim() || "",
      total: row.querySelector('[id$="totalDue1"]')?.textContent?.trim() || "",
    }));
  });

  let details = { totalAssessedValue: "N/A", totalTaxableValue: "N/A" };

  if (rows.length > 0) {
    try {
      details = await scrapeCurrentTaxDetails(page);
    } catch (error) { }
  }

  return { rows, ...details };
}

async function scrapeCurrentTaxDetails(page) {
  await page.waitForSelector("#etaxTemplateForm\\:current1\\:0\\:year1");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null),
    page.click("#etaxTemplateForm\\:current1\\:0\\:year1"),
  ]);

  await page.waitForSelector("#etaxTemplateForm\\:entities1");

  const values = await page.evaluate(() => {
    let taxable = document
      .querySelector("#etaxTemplateForm\\:entities1\\:0\\:netTaxableValue1")
      ?.textContent?.trim();

    if (!taxable) {
      taxable = document
        .querySelector('[id*="netTaxableValue"]')
        ?.textContent?.trim();
    }

    if (!taxable) {
      return {
        totalAssessedValue: "N/A",
        totalTaxableValue: "N/A",
      };
    }

    if (parseFloat(taxable) === 0) {
      return {
        totalAssessedValue: "0.0",
        totalTaxableValue: "0.0",
      };
    }

    return {
      totalAssessedValue: taxable,
      totalTaxableValue: taxable,
    };
  });

  await page.goBack({ waitUntil: "networkidle2" });
  return values;
}

async function scrapePaymentHistory(page, tax, result) {
  const delinquentTable = await page
    .$("#etaxTemplateForm\\:delinquent1")
    .catch(() => null);
  const hasDelinquentTable = delinquentTable !== null;

  await page.waitForSelector("#etaxTemplateForm\\:text71paymenth");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click("#etaxTemplateForm\\:text71paymenth"),
  ]);
  await page.waitForSelector("#etaxTemplateForm\\:tableEx1");

  const firstRow = await page.evaluate(() => {
    const row = document.querySelector("#etaxTemplateForm\\:tableEx1 tbody tr");
    if (!row) return null;
    return {
      year: row.querySelector('[id$="text6"]')?.textContent?.trim() || "",
      base_amount:
        row.querySelector('[id$="text7"]')?.textContent?.trim() || "",
      total_paid:
        row.querySelector('[id$="text10"]')?.textContent?.trim() || "",
    };
  });

  const isExactMatch = firstRow && firstRow.year === tax.year;
  const isFallbackMatch = firstRow && !isExactMatch && !hasDelinquentTable;

  if (isExactMatch || isFallbackMatch) {
    const record = createTaxHistory();
    record.year = firstRow.year;
    record.base_amount = firstRow.base_amount;
    record.amount_paid = firstRow.total_paid;
    record.status = "Paid";
    record.amount_due = "$0.00";

    const dates = getTaxDates(firstRow.year);
    record.due_date = dates.due_date;
    record.delq_date = dates.delq_date;

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click(`#etaxTemplateForm\\:tableEx1\\:0\\:link1`),
    ]);
    await page.waitForSelector("#etaxTemplateForm\\:tableEx1");

    const rowCount = await page.$$eval(
      "#etaxTemplateForm\\:tableEx1 tbody tr",
      (rows) => rows.length,
    );

    let paymentType = "N/A";
    if (rowCount === 1) paymentType = "Annual";
    else if (rowCount === 2) paymentType = "Semi Annual";
    else if (rowCount === 4) paymentType = "Quarterly";

    const paidDate = await page.$$eval(
      "#etaxTemplateForm\\:tableEx1 tbody tr",
      (rows) => {
        const dates = rows
          .map((row) =>
            row.querySelector('[id$="text11"]')?.textContent?.trim(),
          )
          .filter(Boolean);
        if (dates.length === 0) return "N/A";
        return dates.reduce((max, current) =>
          new Date(current) > new Date(max) ? current : max,
        );
      },
    );

    record.paid_date = paidDate;
    record.payment_type = paymentType;
    result.tax_history.push(record);

    await page.goBack({ waitUntil: "networkidle2" });
    await page.goBack({ waitUntil: "networkidle2" });
  } else {
    await page.goBack({ waitUntil: "networkidle2" });
  }
}

// Scraping of second table (delinquent table)
async function scrapeDelinquentTaxes(page) {
  const currentTable2 = await page
    .$("#etaxTemplateForm\\:delinquent1")
    .catch(() => null);
  if (!currentTable2) {
    return [];
  }

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click("#etaxTemplateForm\\:delinquent1\\:0\\:year2"),
  ]);

  const delinquentTable = await page.$("#etaxTemplateForm\\:delinquent1");
  let rows = [];
  if (delinquentTable) {
    rows = await page.evaluate(() => {
      const trs = document.querySelectorAll(
        "#etaxTemplateForm\\:delinquent1 tbody tr",
      );
      return [...trs].map((row) => ({
        year: row.querySelector('[id$="year1"]')?.textContent?.trim() || "",
        baseDue:
          row.querySelector('[id$="taxesDue1"]')?.textContent?.trim() || "",
        totalDue:
          row.querySelector('[id$="totalDue1"]')?.textContent?.trim() || "",
      }));
    });
  }
  await page.goBack({ waitUntil: "networkidle2" });
  return rows;
}

// 
const ac_1 = (page, url) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "networkidle2" });
      resolve(true);
    } catch (error) {
      reject(new Error("Navigation Unsuccessful"));
    }
  });
};

const ac_2 = (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const frameElement = await page.waitForSelector(
        'iframe[src*="/cart/entry-cart.jsp"]',
      );
      const frame = await frameElement.contentFrame();
      if (!frame)
        throw new Error("[search] Could not access iframe content frame");

      const inputSelector = "input[name='criteria.id']";
      await frame.waitForSelector(inputSelector, { visible: true });
      await frame.type(inputSelector, account);

      const searchSelector = 'input[name="criteria.id"] ~ input[type="submit"]';
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }),
        frame.click(searchSelector),
      ]);

      // get ownerName, propertyAddress
      const propertyInfo = await scrapePropertyInfo(page);
      const result = createPropertyObject();
      result.owner_name = propertyInfo.ownerName
        ? [propertyInfo.ownerName]
        : ["N/A"];
      result.property_address = propertyInfo.locationAddress || "N/A";
      result.parcel_number = propertyInfo.accountNo;

      const accountNumberSelector =
        "span.boldresult a[href*='doShowAccountPage']";
      await page
        .waitForSelector(accountNumberSelector, {
          visible: true,
          timeout: 15000,
        })
        .catch(() => {
          throw new Error(
            `Account ${account} actually not found on main page.`,
          );
        });

      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null),
        page.click(accountNumberSelector),
      ]);
      resolve(result);
    } catch (error) {
      reject(new Error("Record not found"));
    }
  });
};

const ac_3 = (page, county, result) => {
  return new Promise(async (resolve, reject) => {
    try {
      result.taxing_authority = county_data[county]?.auth || "";

      const taxData = await scrapeCurrentTaxes(page);
      result.total_assessed_value = taxData.totalAssessedValue;
      result.total_taxable_value = taxData.totalTaxableValue;

      for (const tax of taxData.rows) {
        const totalDue =
          parseFloat(String(tax.total).replace(/[$,]/g, "")) || 0;

        if (totalDue === 0) {
          await scrapePaymentHistory(page, tax, result);
        } else {
          const record = createTaxHistory();
          record.year = tax.year;
          const dates = getTaxDates(tax.year);
          record.due_date = dates.due_date;
          record.delq_date = dates.delq_date;
          record.base_amount = tax.base;
          record.amount_due = tax.total;
          record.status = "Delinquent";
          record.amount_paid = "$0.00";
          record.payment_type = "Annual";
          record.paid_date = "N/A";

          result.tax_history.push(record);
        }
      }

      const delinquentRows = await scrapeDelinquentTaxes(page);

      for (const tax of delinquentRows) {
        let record = result.tax_history.find((t) => t.year === tax.year);
        if (!record) {
          record = createTaxHistory();
          record.year = tax.year;
          result.tax_history.push(record);
        }

        const dates = getTaxDates(tax.year);
        record.payment_type = "Annual";
        record.status = "Delinquent";
        record.base_amount = tax.baseDue;
        record.amount_paid = "$0.00";
        record.amount_due = tax.totalDue;
        record.due_date = dates.due_date;
        record.delq_date = dates.delq_date;
        record.paid_date = "";
      }

      result.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) {
          return yearA - yearB;
        }
        if (a.status === "Paid" && b.status !== "Paid") return -1;
        if (a.status !== "Paid" && b.status === "Paid") return 1;
        return 0;
      });


      if (result.tax_history.length > 0) {

        const hasDelinquent = result.tax_history.some(
          (t) => t.status === "Delinquent",
        );
        result.delinquent = hasDelinquent
          ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
          : "NONE";

        const latestTax = result.tax_history[result.tax_history.length - 1];
        const hasPriorDelinquent = result.tax_history.some(
          (t) => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
        );
        
        // If priors are delinquent, keys = 0. If priors are paid, keys = 1.
        const keys = hasPriorDelinquent ? 0 : 1;
        result.notes = generate_notes(latestTax.year, keys, latestTax.status);
      }
      if (result.tax_history.length === 0) {
        result.tax_history = ["N/A"];
      }
      resolve(result);
    } catch (error) {
      reject(new Error(error.message));
    }
  });
};

const account_search = async (page, url, account, county) => {
  try {
    await ac_1(page, url);
    const result = await ac_2(page, account);
    const finalData = await ac_3(page, county, result);
    return finalData;
  } catch (error) {
    throw new Error(error.message);
  }
};

// Main controller function
const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  const county = (
    req.params.county || req.path.split("/").filter(Boolean).pop()
  ).toLowerCase();
  try {
    if (!county_data[county]) {
      return res.status(404).json({
        error: true,
        message: `County endpoint '${county}' not found in configuration.`,
      });
    }

    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    const url = county_data[county]["url"];

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
      account_search(page, url, account, county)
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
          try {
            await context.close();
          } catch (error) {
            console.log(error);
          }
        });
    } else if (fetch_type == "api") {
      // API ENDPOINT
      account_search(page, url, account, county)
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
          try {
            await context.close();
          } catch (error) {
            console.log(error);
          }
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