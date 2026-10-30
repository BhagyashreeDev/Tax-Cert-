// Author:- Bhagyashree Badadal

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
  timeout: 90000,
};

function createPropertyObject() {
  return {
    processed_date: "",
    order_number: "",
    borrower_name: "",
    owner_name: "",
    property_address: "",
    parcel_number: "",
    land_value: "",
    improvements: "",
    total_assessed_value: "N/A",
    exemption: "",
    total_taxable_value: "N/A",
    taxing_authority: "Cache County Treasurer, 179 N Main Street, Suite 201 Logan, UT 84321",
    notes: "",
    delinquent: "NONE",
    tax_history: [],
  };
}

function createTaxHistory() {
  return {
    jurisdiction: "County",
    year: "",
    payment_type: "Annual",
    status: "Due",
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

// generating notes
const generate_notes = (year, keys, status) => {
  let notes = "";
  try {
    notes =
      keys === 1
        ? `ALL PRIORS ARE PAID, ${year} `
        : `PRIORS ARE DELINQUENT, ${year} `;
    notes += `TAXES ARE ${status.toUpperCase()},`;
    notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
    notes += ` NORMAL DUE DATE IS 11/30`;
  } catch (error) {
    console.log(error);
  } finally {
    return notes;
  }
};

// changing the year in the slider
const changeSliderYear = async (page, targetYear) => {
  await page.evaluate((year) => {
    const slider = document.querySelector("#myRange");
    if (slider) {
      slider.value = year;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
      if (typeof window.Slide === "function") window.Slide();
      if (typeof window.MoveYearDisplay === "function")
        window.MoveYearDisplay();
    }
  }, targetYear);
  await new Promise((resolve) => setTimeout(resolve, 2500));
};

// get data from that pop up of a particular year
const parseModalData = async (page) => {
  return await page.evaluate(() => {
    const titleEl = document.querySelector(".modal-title");
    let propertyId = "N/A";
    if (titleEl) {
      propertyId = titleEl.textContent
        .replace(/Parcel Summary for/i, "")
        .trim();
    }

    // getting ownerName
    const ownerEl = document.querySelector(".currentOwners p.current");
    let ownerName = "N/A";
    if (ownerEl) {
      ownerName = ownerEl.textContent.split("(")[0].trim().replace(/,$/, "");
    }

    // getting address
    const headers = Array.from(document.querySelectorAll("h5"));
    const addressHeader = headers.find((h) =>
      h.textContent.includes("Property Address"),
    );
    let propertyAddress = "N/A";
    if (addressHeader && addressHeader.parentElement) {
      propertyAddress = Array.from(
        addressHeader.parentElement.querySelectorAll("p"),
      )
        .map((p) => p.textContent.trim())
        .join(", ");
    }

    const yearInput = document.querySelector("#myRange");
    const year = yearInput ? yearInput.value : "N/A";

    let taxableValue = "N/A";
    let taxAmount = "N/A";
    let lastPaymentDate = "N/A";

    const taxCalcRows = Array.from(
      document.querySelectorAll("#taxCalc tbody tr"),
    );
    // getting taxable value, taxAmount, paidDate
    taxCalcRows.forEach((row) => {
      const text = row.textContent;
      if (text.includes("Taxable Value")) {
        taxableValue =
          row.querySelector("td:nth-child(2) .data")?.textContent.trim() ||
          "N/A";
      }
      if (text.includes("Tax Amount")) {
        taxAmount =
          row.querySelector("td:nth-child(2) .data")?.textContent.trim() ||
          "N/A";
      }
      if (text.includes("Last Payment Date")) {
        lastPaymentDate =
          row.querySelector("td:nth-child(2) .data")?.textContent.trim() ||
          "N/A";
      }
    });

    let principal = "N/A";
    let amountDue = "N/A";
    let payments = "N/A";

    const tables = Array.from(document.querySelectorAll("table"));
    const paymentTable = tables.find((t) =>
      t.textContent.includes("Payment Category"),
    );
    // getting principal, amountDue, payments
    if (paymentTable) {
      const paymentRows = Array.from(paymentTable.querySelectorAll("tbody tr"));
      paymentRows.forEach((row) => {
        const text = row.textContent;
        if (text.includes("Principal")) {
          principal =
            row.querySelector("td:nth-child(2) .data")?.textContent.trim() ||
            "N/A";
        }
        if (text.includes("Current Amount Due")) {
          amountDue =
            row.querySelector("td:nth-child(2) .data")?.textContent.trim() ||
            "N/A";
        }
        if (text.includes("Payments")) {
          payments =
            row.querySelector("td:nth-child(2) .data")?.textContent.trim() ||
            "N/A";
        }
      });
    }

    return {
      propertyId,
      ownerName,
      propertyAddress,
      year,
      taxableValue,
      taxAmount,
      principal,
      amountDue,
      payments,
      lastPaymentDate,
    };
  });
};

// Handling the disclamier
async function handleDisclamier(page) {
  const acceptButtonSelector = 'input[value="I agree"]';
  await page.waitForSelector(acceptButtonSelector, { visible: true });
  await page.click(acceptButtonSelector);
}

// search the parcel-ID
async function searchAccountNumber(account, page) {
  const inputSelector = "#Parcel";
  await page.waitForSelector(inputSelector, { visible: true });
  await page.focus(inputSelector);
  await page.evaluate((selector) => {
    document.querySelector(selector).value = "";
  }, inputSelector);

  await page.type(inputSelector, account, { delay: 100 });
  await page.keyboard.press("Enter");

  await page.waitForSelector("#results-table", { visible: true });
}

// wait until the table that had pracel-ID link loads
async function loadResultTable(page) {
  const noResults = await page.evaluate(() => {
    const table = document.querySelector("#results-table");
    return table ? table.textContent.includes("No results") : true;
  });

  if (noResults) {
    return reject(new Error("No Record Found"));
  }

  const linkSelector = "#result_1 .parcel a";
  await page.waitForSelector(linkSelector, { visible: true });
  await page.click(linkSelector);

  await page.waitForSelector("#taxCalc tbody tr", {
    visible: true,
    timeout: 20000,
  });
}

// get all the previous years record details
async function parseBackTaxRecords(page) {
  const initialYear = await page.evaluate(
    () => document.querySelector("#myRange")?.value,
  );

  // check if we have any previous unpaid years
  const backtaxRecords = await page.evaluate(() => {
    const records = [];
    const tables = Array.from(document.querySelectorAll("table"));
    const backtaxTable = tables.find((t) =>
      t.textContent.includes("Backtax Total Past Due"),
    );

    // getting year + respective amountDue
    if (backtaxTable) {
      const rows = Array.from(backtaxTable.querySelectorAll("tbody tr"));
      rows.forEach((row) => {
        const firstCell = row.querySelector("td:nth-child(1)");
        const secondCell = row.querySelector("td:nth-child(2)");
        if (firstCell && secondCell) {
          const yearText = firstCell.textContent.trim();
          if (
            /^\d{4}$/.test(yearText) &&
            !firstCell.classList.contains("error")
          ) {
            const amountDue = secondCell.textContent.trim();
            records.push({ year: yearText, amountDue });
          }
        }
      });
    }
    return records;
  });

  const taxHistoryArray = [];

  // iterate over all the previous unpaid years
  for (const item of backtaxRecords) {
    // change the year with the help of slider
    await changeSliderYear(page, item.year);
    // get the data from the page
    const pastData = await parseModalData(page);

    // creating record for each unpaid tax year
    const record = new createTaxHistory();
    record.year = pastData.year;
    record.payment_type = "Annual";
    record.status = "Delinquent";
    record.base_amount = pastData.principal !== "N/A" ? pastData.principal : pastData.taxAmount;
    record.amount_paid = "$0.00";
    record.amount_due = item.amountDue;
    record.due_date = `11/30/${pastData.year}`;
    record.delq_date = `12/01/${pastData.year}`;

    // pushing that record into the array
    taxHistoryArray.push(record);
  }

  // if we have had moved back to previous years, then move to the initial(current most) year
  if (backtaxRecords.length > 0) {
    await changeSliderYear(page, initialYear);
  }
  return taxHistoryArray;
}

// get the data from the current year tax record
async function praseCurrentYearRecord(page, taxHistoryArray, account) {
  // get current year data
  const currentData = await parseModalData(page);
  let currentBaseAmount = currentData.principal !== "N/A" ? currentData.principal : currentData.taxAmount;
  let currentAmountDue = currentData.amountDue !== "N/A" ? currentData.amountDue : "$0.00";
  // Clean and convert string to a real number
  const numericDue = parseFloat(currentAmountDue.replace(/[^0-9.-]/g, ''));
  let isDue = !isNaN(numericDue) && numericDue > 0;
  let currentStatus = isDue ? "Due" : "Paid";
  let currentAmountPaid = "$0.00";
  if (currentData.payments !== "N/A") {
    currentAmountPaid = currentData.payments;
  } else if (!isDue && currentData.principal !== "N/A") {
    currentAmountPaid = currentData.principal;
  }

  // populating current year tax record
  const record = new createTaxHistory();
  record.year = currentData.year;
  record.status = currentStatus;
  record.base_amount = currentBaseAmount;
  record.amount_paid = currentAmountPaid;
  record.amount_due = currentAmountDue;
  record.due_date = `11/30/${currentData.year}`;
  record.delq_date = `12/01/${currentData.year}`;
  record.paid_date = currentData.lastPaymentDate !== "N/A" ? currentData.lastPaymentDate : "",
  taxHistoryArray.push(record);

  // creating the main property object
  const result = new createPropertyObject();
  result.owner_name = currentData.ownerName ? [currentData.ownerName] : ["N/A"];
  result.property_address = currentData.propertyAddress || "N/A";
  result.parcel_number = account;
  result.total_assessed_value = currentData.taxableValue || "";
  result.total_taxable_value = result.total_assessed_value;
  result.tax_history = taxHistoryArray;

  // sort the records
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

  // deciding delinquency and notes
  if (result.tax_history.length > 0) {
    // Check if ANY tax is delinquent for the main delinquency flag
    const hasDelinquent = result.tax_history.some(
      (t) => t.status === "Delinquent",
    );
    result.delinquent = hasDelinquent
      ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
      : "NONE";

    // Get the latest tax record (the array is sorted ascending by year)
    const latestTax = result.tax_history[result.tax_history.length - 1];

    // Check if any PRIOR year is delinquent (exclude the latest year)
    const hasPriorDelinquent = result.tax_history.some(
      (t) => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
    );

    // If priors are delinquent, keys = 0. If priors are paid, keys = 1.
    const keys = hasPriorDelinquent ? 0 : 1;
    result.notes = generate_notes(latestTax.year, keys, latestTax.status);
  }
  return result;
}

const account_search = async (page, url, account) => {
  try {
    await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

    // 1.Handle disclamier page
    await handleDisclamier(page);

    // 2.Search for this parcel-ID
    await searchAccountNumber(account, page);

    // 3.Load the record table
    await loadResultTable(page);

    // 4.Parse all previous year tax records if exists
    const taxHistoryArray = await parseBackTaxRecords(page);

    // 5.parse current year tax record + populate the format
    const result = await praseCurrentYearRecord(page, taxHistoryArray, account);;

    return result;
  } catch (error) {
    console.log("Error inside account_search:", error);
    throw new Error(error.message);
  }
};

const search = async (req, res) => {
  let { fetch_type, account } = req.body;
  if (account) {
    account = String(account).trim();
  }
  try {
    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    const url = "https://core.cachecounty.org/Search/Public";

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
