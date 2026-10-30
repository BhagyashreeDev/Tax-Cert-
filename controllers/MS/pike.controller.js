//AUTHOR: Mayank Nandgowle

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const SEARCH_URL =
  "https://www.deltacomputersystems.com/MS/MS57MAI/plinkquerym.html";

const DEFAULT_VALUE = "N/A";
const TAXING_AUTHORITY = "Pike County Tax Collector, Magnolia, MS";

function normalizeValue(value) {
  if (!value || !String(value).trim()) {
    return DEFAULT_VALUE;
  }

  const normalized = String(value).replace(/\s+/g, " ").trim();

  if (/^(?:\*\*NA\*\*|NA|N\/A|NONE)$/i.test(normalized)) {
    return DEFAULT_VALUE;
  }

  return normalized;
}

function formatProcessedDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extract(patterns, text) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeValue(match[1]);
    }
  }

  return DEFAULT_VALUE;
}

function extractMoneyTriplet(text) {
  const totalPatterns = [
    /TOTAL\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i,
    /TOTALS?\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);

    if (match) {
      return {
        taxDue: normalizeValue(match[1]),
        taxPaid: normalizeValue(match[2]),
        taxBalance: normalizeValue(match[3])
      };
    }
  }

  return {
    taxDue: DEFAULT_VALUE,
    taxPaid: DEFAULT_VALUE,
    taxBalance: DEFAULT_VALUE
  };
}

function numericValue(value) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isNaN(parsed) ? null : parsed;
}

function formatCurrency(value) {
  const numeric = numericValue(value);

  if (numeric === null) {
    return "$0.00";
  }

  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function normalizeDateValue(value) {
  if (!value || value === DEFAULT_VALUE) {
    return DEFAULT_VALUE;
  }

  const match = String(value).match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/);

  if (!match) {
    return normalizeValue(value);
  }

  const [, month, day, year] = match;
  return `${month.padStart(2, "0")}/${day.padStart(2, "0")}/${year}`;
}

function firstMeaningfulValue(...values) {
  for (const value of values) {
    if (value && value !== DEFAULT_VALUE) {
      return value;
    }
  }

  return DEFAULT_VALUE;
}

function inferDueDate(taxYear) {
  if (!/^\d{4}$/.test(String(taxYear))) {
    return DEFAULT_VALUE;
  }

  return `02/01/${Number(taxYear) + 1}`;
}

function getLastMondayOfAugust(year) {
  const augustLastDay = new Date(year, 7, 31);
  const dayOfWeek = augustLastDay.getDay();
  const diffToMonday = dayOfWeek >= 1 ? dayOfWeek - 1 : 6;

  augustLastDay.setDate(augustLastDay.getDate() - diffToMonday);

  const month = String(augustLastDay.getMonth() + 1).padStart(2, "0");
  const day = String(augustLastDay.getDate()).padStart(2, "0");

  return `${month}/${day}/${augustLastDay.getFullYear()}`;
}

function inferDelinquentDate(taxYear) {
  if (!/^\d{4}$/.test(String(taxYear))) {
    return DEFAULT_VALUE;
  }

  return `02/02/${Number(taxYear) + 1}`;
}

function getPaymentStatus({ taxPaid, taxBalance }) {
  const paid = numericValue(taxPaid);
  const balance = numericValue(taxBalance);

  if (balance !== null && balance > 0) {
    return "Delinquent";
  }

  if (paid !== null && paid > 0) {
    return "Paid";
  }

  return "Open";
}

function extractTaxYear(text) {
  const match = text.match(/Tax Year\s+(\d{4})/i);
  return match?.[1] ? match[1] : DEFAULT_VALUE;
}

function normalizeExemption(value) {
  const normalized = normalizeValue(value);

  if (
    normalized === DEFAULT_VALUE ||
    /LEGAL|HOMESTEAD|TAX DISTRICT|PPIN|SECTION|TOWNSHIP|RANGE/i.test(normalized) ||
    normalized === "None" ||
    normalized === "**NA**"
  ) {
    return DEFAULT_VALUE;
  }

  return normalized;
}

function formatNotes({ taxYear, status, dueDate }) {
  const normalizedYear = normalizeValue(taxYear);
  const normalizedDueDate = normalizeDateValue(dueDate);
  const dueMonthDay = /^\d{2}\/\d{2}\/\d{4}$/.test(normalizedDueDate)
    ? normalizedDueDate.slice(0, 5)
    : DEFAULT_VALUE;

  if (status === "Paid") {
    return `ALL PRIORS ARE PAID, ${normalizedYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS ${dueMonthDay}`;
  }

  if (status === "Delinquent") {
    return `ALL PRIORS ARE PAID, ${normalizedYear} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS ${dueMonthDay}`;
  }

  return `ALL PRIORS ARE PAID, ${normalizedYear} TAXES ARE OPEN, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS ${dueMonthDay}`;
}

function formatDelinquentSummary(status) {
  return status === "Delinquent"
    ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
    : "NONE";
}

function buildCountyRecord(rawRecord) {
  const totalAssessedValue = formatCurrency(rawRecord.assessed);
  const status = getPaymentStatus(rawRecord);
  const dueDate = normalizeDateValue(
    firstMeaningfulValue(rawRecord.dueDate, inferDueDate(rawRecord.taxYear))
  );
  const paidDate = normalizeDateValue(rawRecord.paidDate);
  const delinquentDate = normalizeDateValue(
    firstMeaningfulValue(rawRecord.delinquentDate, inferDelinquentDate(rawRecord.taxYear))
  );
  const exemption = normalizeExemption(rawRecord.exemption);
  const notes = formatNotes({
    taxYear: rawRecord.taxYear,
    status,
    dueDate
  });

  return {
    processed_date: formatProcessedDate(),
    order_number: "",
    borrower_name: "",
    owner_name: [normalizeValue(rawRecord.owner)],
    property_address: normalizeValue(rawRecord.address),
    parcel_number: normalizeValue(rawRecord.parcel),
    land_value: formatCurrency(rawRecord.landValue),
    improvements: formatCurrency(rawRecord.improvements),
    total_assessed_value: totalAssessedValue,
    exemption: exemption === DEFAULT_VALUE ? "$0.00" : exemption,
    total_taxable_value: totalAssessedValue,
    taxing_authority: TAXING_AUTHORITY,
    notes,
    delinquent: formatDelinquentSummary(status),
    tax_history: [
      {
        jurisdiction: "County",
        year: normalizeValue(rawRecord.taxYear),
        status,
        payment_type: "Annual",
        base_amount: formatCurrency(rawRecord.taxDue),
        county_tax: DEFAULT_VALUE,
        city_tax: DEFAULT_VALUE,
        fees: "$0.00",
        penalty: DEFAULT_VALUE,
        cost: DEFAULT_VALUE,
        amount_paid: formatCurrency(rawRecord.taxPaid),
        amount_due: formatCurrency(rawRecord.taxBalance),
        mailing_date: DEFAULT_VALUE,
        paid_date: paidDate,
        due_date: dueDate,
        delq_date: delinquentDate,
        good_through_date: "",
        land_value: formatCurrency(rawRecord.landValue),
        improvements: formatCurrency(rawRecord.improvements),
        total_assessed_value: totalAssessedValue,
        exemptions_breakdown: {
          residential_exemption: "0.00",
          homestead_exemption: "0.00",
          other_exemptions: "0.00",
          local_option_credit: exemption === DEFAULT_VALUE ? "0.00" : exemption
        }
      }
    ],
    property_details: {
      record_type: "Real Estate",
      acres: DEFAULT_VALUE,
      lots: DEFAULT_VALUE,
      buildings: DEFAULT_VALUE,
      description: DEFAULT_VALUE,
      district_levy: DEFAULT_VALUE,
      city_levy: DEFAULT_VALUE,
      total_appraisal: DEFAULT_VALUE
    }
  };
}

function buildNotFound(parcelId, message) {
  return {
    processed_date: formatProcessedDate(),
    order_number: "",
    borrower_name: "",
    owner_name: ["No records found"],
    property_address: "No records found",
    parcel_number: parcelId,
    land_value: "$0.00",
    improvements: "$0.00",
    total_assessed_value: "$0.00",
    exemption: "$0.00",
    total_taxable_value: "$0.00",
    taxing_authority: TAXING_AUTHORITY,
    notes: message,
    delinquent: "N/A",
    tax_history: [
      {
        jurisdiction: "County",
        year: DEFAULT_VALUE,
        status: DEFAULT_VALUE,
        payment_type: DEFAULT_VALUE,
        base_amount: "$0.00",
        county_tax: DEFAULT_VALUE,
        city_tax: DEFAULT_VALUE,
        fees: "$0.00",
        penalty: DEFAULT_VALUE,
        cost: DEFAULT_VALUE,
        amount_paid: "$0.00",
        amount_due: "$0.00",
        mailing_date: DEFAULT_VALUE,
        paid_date: DEFAULT_VALUE,
        due_date: DEFAULT_VALUE,
        delq_date: DEFAULT_VALUE,
        good_through_date: "",
        land_value: "$0.00",
        improvements: "$0.00",
        total_assessed_value: "$0.00",
        exemptions_breakdown: {
          residential_exemption: "0.00",
          homestead_exemption: "0.00",
          other_exemptions: "0.00",
          local_option_credit: "0.00"
        }
      }
    ],
    property_details: {
      record_type: DEFAULT_VALUE,
      acres: DEFAULT_VALUE,
      lots: DEFAULT_VALUE,
      buildings: DEFAULT_VALUE,
      description: DEFAULT_VALUE,
      district_levy: DEFAULT_VALUE,
      city_levy: DEFAULT_VALUE,
      total_appraisal: DEFAULT_VALUE
    }
  };
}

function parseDetailLines(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => normalizeValue(line))
    .filter((line) => line !== DEFAULT_VALUE);

  const fieldLabels = [
    "OWNER",
    "ACRES :",
    "LAND VALUE :",
    "IMPROVEMENTS :",
    "TOTAL VALUE:",
    "ASSESSED :",
    "PARCEL",
    "ADDRESS"
  ];

  const matchesLabel = (line, label) => line === label || line.startsWith(`${label} `);
  const isAnyFieldLabel = (line) => fieldLabels.some((label) => matchesLabel(line, label));
  const findLineIndex = (label) => lines.findIndex((line) => matchesLabel(line, label));
  const firstNumericLine = (value) => /^\d/.test(value);
  const streetLikeLine = (value) => /^\d+\D+/.test(value);
  const ownerStopLabels = ["LAND VALUE :", "PARCEL", "ADDRESS", "TAX INFORMATION"];

  const ownerIndex = findLineIndex("OWNER");
  let owner = DEFAULT_VALUE;
  let addressFromOwnerBlock = DEFAULT_VALUE;

  if (ownerIndex !== -1) {
    const ownerParts = [];
    const firstOwnerLine = lines[ownerIndex].replace(/^OWNER\s*/i, "").trim();

    if (firstOwnerLine) {
      ownerParts.push(firstOwnerLine);
    }

    for (let index = ownerIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];

      if (ownerStopLabels.some((label) => matchesLabel(line, label))) {
        break;
      }

      if (streetLikeLine(line)) {
        break;
      }

      if (isAnyFieldLabel(line)) {
        continue;
      }

      if (/^[.\d]+$/.test(line)) {
        continue;
      }

      ownerParts.push(line);
    }

    if (ownerParts.length) {
      owner = normalizeValue(ownerParts.join(" "));
    }
  }

  const extractFieldValue = (label) => {
    const index = findLineIndex(label);
    if (index === -1) {
      return DEFAULT_VALUE;
    }

    const inlineValue = lines[index].replace(new RegExp(`^${label}\\s*`, "i"), "").trim();
    if (inlineValue && inlineValue !== label) {
      return inlineValue;
    }

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];

      if (isAnyFieldLabel(line)) {
        break;
      }

      if (line !== DEFAULT_VALUE) {
        return line;
      }
    }

    return DEFAULT_VALUE;
  };

  const addressField = extractFieldValue("ADDRESS");
  const landValueIndex = findLineIndex("LAND VALUE :");
  const improvementsIndex = findLineIndex("IMPROVEMENTS :");

  if (landValueIndex !== -1 && improvementsIndex !== -1) {
    for (let index = landValueIndex + 1; index < improvementsIndex; index += 1) {
      const line = lines[index];
      if (streetLikeLine(line)) {
        addressFromOwnerBlock = line;
        break;
      }
    }
  }

  const propertyAddress = firstMeaningfulValue(
    addressField,
    addressFromOwnerBlock
  );

  return {
    owner,
    parcel: extractFieldValue("PARCEL"),
    address: propertyAddress,
    landValue: extractFieldValue("LAND VALUE :"),
    improvements: extractFieldValue("IMPROVEMENTS :"),
    assessed: extractFieldValue("ASSESSED :")
  };
}

async function findParcelLink(page, parcelId) {
  const parcelCandidates = await page.$$eval("a", (links) =>
    links
      .map((link) => ({
        text: link.innerText.trim(),
        href: link.href
      }))
      .filter((link) => link.href && link.text)
  );

  return (
    parcelCandidates.find((link) => link.text === parcelId) ||
    parcelCandidates.find((link) => link.text.startsWith(`${parcelId} `)) ||
    null
  );
}

async function submitSearch(page, parcelId) {
  const selectors = [
    'input[name="HTMPARCELNUMBER"]',
    'input[name*="PARCEL"]',
    'input[type="text"]'
  ];

  for (const selector of selectors) {
    const input = await page.$(selector);

    if (input) {
      await input.click({ clickCount: 3 });
      await input.type(parcelId);

      const button = await page.$('input[type="submit"], button[type="submit"]');

      if (!button) {
        throw new Error("Search button not found on the county site.");
      }

      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
        button.click()
      ]);

      return;
    }
  }

  throw new Error("Search field not found on the county site.");
}

async function getTaxData(page, parcelId) {
  await page.goto(SEARCH_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  await submitSearch(page, parcelId);

  const target = await findParcelLink(page, parcelId);

  if (!target) {
    return buildNotFound(parcelId, "No tax records found for this parcel number.");
  }

  await page.goto(target.href, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  const bodyText = await page.$eval("body", (element) => element.innerText);
  const totals = extractMoneyTriplet(bodyText);
  const detailLines = parseDetailLines(bodyText);

  return buildCountyRecord({
    owner: detailLines.owner,
    parcel: detailLines.parcel,
    address: detailLines.address,
    taxYear: extractTaxYear(bodyText),
    landValue: detailLines.landValue,
    improvements: detailLines.improvements,
    assessed: detailLines.assessed,
    exemption: extract([/EXEMPT CODE\s+([^\n]+)/i, /HOMESTEAD CODE\s+([^\n]+)/i], bodyText),
    paidDate: extract([/LAST PAYMENT DATE\s+([^\n]+)/i, /PAID DATE\s+([^\n]+)/i], bodyText),
    dueDate: extract([/DUE DATE\s+([^\n]+)/i], bodyText),
    delinquentDate: extract([/DELINQUENT DATE\s+([^\n]+)/i, /DELQ(?:UENT)? DATE\s+([^\n]+)/i], bodyText),
    taxDue: totals.taxDue,
    taxPaid: totals.taxPaid,
    taxBalance: totals.taxBalance
  });
}

const search = async (req, res) => {
  const { fetch_type, account } = req.body || {};

  if (!fetch_type || !["html", "api"].includes(fetch_type)) {
    return res.status(400).json({ error: true, message: "fetch_type must be 'html' or 'api'" });
  }

  if (!account || !String(account).trim()) {
    return res.status(400).json({ error: true, message: "account is required" });
  }

  let browserContext = null;

  try {
    const browser = await getBrowserInstance();
    browserContext = await browser.createBrowserContext();
    const page = await browserContext.newPage();

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (["stylesheet", "font", "image", "media"].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    const data = await getTaxData(page, String(account).trim());

    if (fetch_type === "html") {
      return res.status(200).render("parcel_data_official", data);
    }

    return res.status(200).json({ result: data });
  } catch (error) {
    if (fetch_type === "html") {
      return res.status(500).render("error_data", {
        error: true,
        message: error.message || "Unable to fetch property details."
      });
    }

    return res.status(500).json({
      error: true,
      message: error.message || "Unable to fetch property details."
    });
  } finally {
    if (browserContext) {
      try {
        await browserContext.close();
      } catch {}
    }
  }
};

export { search };
