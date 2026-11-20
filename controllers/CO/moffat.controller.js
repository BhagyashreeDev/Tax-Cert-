// Author:- Bhagyashree Badadal / Dhanush
// Moffat County, Colorado (CO) Property Tax Controller

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000,
};

function createPropertyObject() {
    return {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "",
        borrower_name: "",
        owner_name: [],
        property_address: "",
        parcel_number: "",
        land_value: "$0.00",
        improvements: "$0.00",
        total_assessed_value: "$0.00",
        exemption: "$0.00",
        total_taxable_value: "$0.00",
        taxing_authority: "Moffat County Treasurer, 221 W Victory Way Suite 130, Craig, CO 81625, Ph: 970-824-9111",
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
        status: "",
        base_amount: "$0.00",
        amount_paid: "$0.00",
        amount_due: "$0.00",
        mailing_date: "N/A",
        due_date: "",
        delq_date: "",
        paid_date: "-",
        good_through_date: "-",
    };
}

const is_delq = (dateStr) => {
    if (!dateStr || dateStr === "-" || dateStr === "N/A") return false;
    const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!parts) return false;
    const [_, m, d, y] = parts.map(Number);
    const delqDate = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today >= delqDate;
};

const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID, ${year} `
                : `PRIORS ARE DELINQUENT, ${year} `;
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        notes += ` NORMAL DUE DATE IS 04/30`;
    } catch (error) {
        console.log("Error in generate_notes:", error);
    } finally {
        return notes;
    }
};

// Extracts target schedule number from formats like "R R009541 (2024)", "M N007897 2025"
function cleanAccountNumber(raw) {
    if (!raw) return "";
    const cleanStr = String(raw).trim();
    const match = cleanStr.match(/\b([A-Z]\d{6,7}|\d{6,8})\b/i);
    if (match) return match[1].toUpperCase();

    const parts = cleanStr.split(/\s+/).map((p) => p.replace(/[()]/g, ""));
    const token = parts.find((p) => p.length > 3 && !/^\d{4}$/.test(p));
    return token ? token.toUpperCase() : parts[0].toUpperCase();
}

// ----------------------------------------------------
// Step 1: Search Schedule Number and Fetch Bill Links
// ----------------------------------------------------
async function searchSchedule(page, scheduleNumber) {
    const resultsUrl = `http://moffat.visualgov.com/Results.aspx?ScheduleNumber=${encodeURIComponent(scheduleNumber)}&RollType=All&TaxYear=0&SearchType=4`;
    await page.goto(resultsUrl, { waitUntil: "domcontentloaded", ...timeout_option });

    // Fallback if redirected to standard search form
    const isSearchPage = await page.$("#ctl00_ContentPlaceHolder1_txtScheduleNumber");
    if (isSearchPage) {
        await page.type("#ctl00_ContentPlaceHolder1_txtScheduleNumber", scheduleNumber);
        await page.select("#ctl00_ContentPlaceHolder1_ddlRollType", "All").catch(() => { });
        await page.select("#ctl00_ContentPlaceHolder1_ddlYear", "0").catch(() => { });
        await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
            page.click("#ctl00_ContentPlaceHolder1_btnSearch"),
        ]);
    }

    const noRecords = await page.evaluate(() => {
        const text = document.body ? document.body.innerText : "";
        return text.includes("No records found") || text.includes("Invalid Schedule");
    });
    if (noRecords) {
        throw new Error("Invalid Schedule Number or No Records Found");
    }

    await page.waitForSelector("#ctl00_ContentPlaceHolder1_grdResults", timeout_option);

    // Extract all year bill links and sort descending by year
    const bills = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("#ctl00_ContentPlaceHolder1_grdResults tr"));
        const list = [];
        for (const row of rows) {
            const link = row.querySelector("a[href*='TaxBill.aspx']");
            if (!link) continue;
            const href = link.getAttribute("href") || "";
            const text = link.innerText.trim();
            const yearMatch = href.match(/TaxYear=(\d{4})/i) || text.match(/\((\d{4})\)/);
            if (yearMatch) {
                list.push({
                    year: parseInt(yearMatch[1], 10),
                    url: href.startsWith("http") ? href : `http://moffat.visualgov.com/${href.replace(/^\//, "")}`,
                });
            }
        }
        return list;
    });

    if (!bills.length) {
        throw new Error("No tax bill records found for this schedule");
    }

    bills.sort((a, b) => b.year - a.year);
    return bills;
}

// ----------------------------------------------------
// Step 2: Extract Details from TaxBill & PrintBill
// ----------------------------------------------------
async function getTaxBillDetails(page, billUrl, year) {
    await page.goto(billUrl, { waitUntil: "domcontentloaded", ...timeout_option });
    await page.waitForSelector("#ctl00_ContentPlaceHolder1_lblTax, #ctl00_ContentPlaceHolder1_lblUnpaidBalance", timeout_option);

    const data = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

        const addrEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblPropertyAddress");
        const property_address = clean(addrEl ? addrEl.innerText : "");

        const ownerEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblAddress");
        let owner_name = [];
        if (ownerEl) {
            const lines = ownerEl.innerHTML.split(/<br\s*\/?>/i).map((l) => clean(l.replace(/<[^>]*>/g, ""))).filter(Boolean);
            if (lines.length > 0) owner_name.push(lines[0]);
        }

        const taxableEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblTaxableValue");
        const total_taxable_value = clean(taxableEl ? taxableEl.innerText : "$0.00");

        const actualEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblActualValue");
        const total_assessed_value = clean(actualEl ? actualEl.innerText : "$0.00");

        const taxEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblTax");
        const totalEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblTotal");
        const base_amount = clean(totalEl ? totalEl.innerText : (taxEl ? taxEl.innerText : "$0.00"));

        const unpaidEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblUnpaidBalance");
        const unpaid_balance = clean(unpaidEl ? unpaidEl.innerText : "$0.00");

        const fullEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblFullBalance");
        const full_balance = clean(fullEl ? fullEl.innerText : "");

        const unpaidNum = parseFloat(unpaid_balance.replace(/[^0-9.]/g, "")) || 0;
        const isPaid = unpaidNum === 0 || full_balance.toLowerCase().includes("paid");

        return {
            property_address,
            owner_name: owner_name.length ? owner_name : ["N/A"],
            total_taxable_value: total_taxable_value || "$0.00",
            total_assessed_value: total_assessed_value || "$0.00",
            base_amount: base_amount || "$0.00",
            unpaid_balance: unpaid_balance || "$0.00",
            isPaid,
        };
    });

    const y = parseInt(year, 10);
    const due_date = `04/30/${y + 1}`;
    const delq_date = `05/01/${y + 1}`;

    let status = "Paid";
    let paid_date = "-";
    let amount_paid = "$0.00";
    let amount_due = "$0.00";

    if (data.isPaid) {
        status = "Paid";
        amount_paid = data.base_amount;
        amount_due = "$0.00";

        // Extract paid date from PrintBill.aspx
        try {
            const printUrl = billUrl.replace("TaxBill.aspx", "PrintBill.aspx") + "&Status=BL";
            await page.goto(printUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
            paid_date = await page.evaluate(() => {
                const el = document.querySelector("#lblLastPaid");
                if (el && el.innerText.trim()) return el.innerText.trim();
                const bodyText = document.body ? document.body.innerText : "";
                const m = bodyText.match(/Last\s*(?:Payment|Paid)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
                return m ? m[1] : "";
            });
        } catch (err) {
            paid_date = "";
        }
    } else {
        status = is_delq(delq_date) ? "Delinquent" : "Due";
        amount_paid = "$0.00";
        amount_due = data.unpaid_balance;
        paid_date = "";
    }

    return {
        ...data,
        due_date,
        delq_date,
        status,
        paid_date,
        amount_paid,
        amount_due,
    };
}

// ----------------------------------------------------
// Main Account Search
// ----------------------------------------------------
const account_search = async (page, rawAccount) => {
    const scheduleNumber = cleanAccountNumber(rawAccount);
    const result = createPropertyObject();

    // 1. Search schedule number and get all bill links sorted newest first
    const bills = await searchSchedule(page, scheduleNumber);

    // 2. Process bills following the "only first paid record" rule
    for (let i = 0; i < bills.length; i++) {
        const bill = bills[i];
        const billData = await getTaxBillDetails(page, bill.url, bill.year);

        // If a prior year is paid, stop tracing immediately
        if (i > 0 && billData.status === "Paid") break;

        // Populate property details from the most recent tax bill
        if (i === 0) {
            result.parcel_number = scheduleNumber;
            result.property_address = billData.property_address;
            result.owner_name = billData.owner_name;
            result.total_assessed_value = billData.total_assessed_value;
            result.total_taxable_value = billData.total_taxable_value;
        }

        const th = createTaxHistory();
        th.year = String(bill.year);
        th.status = billData.status;
        th.base_amount = billData.base_amount;
        th.amount_paid = billData.amount_paid;
        th.amount_due = billData.amount_due;
        th.due_date = billData.due_date;
        th.delq_date = billData.delq_date;
        th.paid_date = billData.paid_date;
        result.tax_history.push(th);

        // If the recent year is paid, only that first paid record is added
        if (billData.status === "Paid") break;
    }

    // Sort tax_history ascending by year
    result.tax_history.sort((a, b) => parseInt(a.year, 10) - parseInt(b.year, 10));

    // Calling generateNotes() for Annual
    // deciding notes and delinquency
    if (result.tax_history.length > 0) {
        // Check if ANY tax is delinquent for the main delinquency flag
        const hasDelinquent = result.tax_history.some(
            (t) => t.status === "Delinquent"
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
};

// ----------------------------------------------------
// Express Route Handler
// ----------------------------------------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    const cleanAccount = account ? String(account).trim() : "";

    if (!cleanAccount) {
        const errorMsg = "Enter the Schedule / Account Number...";
        return fetch_type === "html"
            ? res.status(200).render("error_data", { error: true, message: errorMsg })
            : res.status(400).json({ error: true, message: errorMsg });
    }

    if (fetch_type !== "html" && fetch_type !== "api") {
        return res.status(400).json({ error: true, message: "Invalid Access" });
    }

    let context;
    try {
        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(90000);

        // Force HTTP and prevent HTTPS upgrade 404 errors
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            const reqUrl = req.url();
            if (reqUrl.startsWith("https://moffat.visualgov.com")) {
                req.continue({ url: reqUrl.replace(/^https:/, "http:") });
            } else if (["font"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        const data = await account_search(page, cleanAccount);

        if (fetch_type === "html") {
            return res.status(200).render("parcel_data_official", data);
        }
        return res.status(200).json({ result: data });
    } catch (error) {
        console.error("Error in Moffat County search:", error.message);
        if (fetch_type === "html") {
            return res.status(200).render("error_data", { error: true, message: error.message });
        }
        return res.status(500).json({ error: true, message: error.message });
    } finally {
        if (context) await context.close();
    }
};

export { search };
