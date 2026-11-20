// Author:- Bhagyashree Badadal / Dhanush
// Wake County, North Carolina (NC) Property Tax Controller

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
        taxing_authority: "Wake County Tax Administration, PO Box 580084, Charlotte NC 28258-0084, Ph: 919-856-5400",
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
        notes += ` NORMAL DUE DATE IS 09/01`;
    } catch (error) {
        console.log("Error in generate_notes:", error);
    } finally {
        return notes;
    }
};

// ----------------------------------------------------
// Step 1: Search by Account Number
// ----------------------------------------------------
async function searchAccount(page, account) {
    const url = "https://services.wake.gov/ptax/main/billing/";
    await page.goto(url, { waitUntil: "domcontentloaded", ...timeout_option });

    // Select Account search & wait for ASP.NET PostBack
    await page.waitForSelector("#ddlSearchBy", timeout_option);
    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
        page.select("#ddlSearchBy", "acct"),
    ]);

    // Select "Last 2 Years", fill account and submit
    await page.waitForSelector("#txtAccount", timeout_option);
    await page.select("#ddlYears", "2").catch(() => {});
    await page.type("#txtAccount", account);

    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
        page.click("#Search"),
    ]);

    const errorMsg = await page.$eval("#lblValidationMsg", (el) => el.innerText.trim()).catch(() => null);
    if (errorMsg) throw new Error(errorMsg);

    await page.waitForSelector("tr[style*='background-color']", timeout_option);
}

// ----------------------------------------------------
// Step 2: Extract Account Summary Rows
// ----------------------------------------------------
async function getSummaryBills(page) {
    const bills = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("tr[style*='background-color']"));
        return rows.map((r) => {
            const link = r.querySelector("a[title='Go To Billing Statement']");
            const acctText = link ? link.textContent.trim() : "";
            const href = link ? link.getAttribute("href") : "";
            const pkMatch = href.match(/Statement-(\d+)/);
            const pk = pkMatch ? pkMatch[1] : "";

            const finCell = r.querySelector("td:nth-child(4)");
            const finText = finCell ? finCell.innerText.trim().replace(/\s+/g, " ") : "";

            return { acctText, pk, finText };
        });
    });

    if (!bills.length) throw new Error("No billing records found for this account");

    return bills.map((b) => {
        const yearMatch = b.acctText.match(/-\d{4}-(\d{4})-/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;

        const dueMatch = b.finText.match(/Current Due:[^$]*\$([\d,]+\.\d{2})/i);
        const currentDue = dueMatch ? `$${dueMatch[1]}` : "$0.00";
        const dueNum = parseFloat(currentDue.replace(/[^0-9.]/g, "")) || 0;

        const dueDateMatch = b.finText.match(/Due Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
        const dueDate = dueDateMatch ? dueDateMatch[1] : `09/01/${year}`;

        const delqDateMatch = b.finText.match(/Interest Begins:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
        const delqDate = delqDateMatch ? delqDateMatch[1] : `01/06/${year + 1}`;

        const paidDateMatch = b.finText.match(/Paid\s*(?:in full)?\s*on:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
        const paidDate = paidDateMatch ? paidDateMatch[1] : "-";

        const isPaid = dueNum === 0 || currentDue === "$0.00";
        const status = isPaid ? "Paid" : (is_delq(delqDate) ? "Delinquent" : "Due");

        return { year, currentDue, dueDate, delqDate, paidDate, status, pk: b.pk };
    }).filter((b) => b.year > 0).sort((a, b) => b.year - a.year);
}

// ----------------------------------------------------
// Step 3: Extract Statement Details (Latest Year)
// ----------------------------------------------------
async function getStatementDetails(page, pk) {
    const linkSelector = `a[href*="Statement-${pk}"]`;
    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
        page.click(linkSelector),
    ]);

    await page.waitForSelector("#Table22, #Table33", timeout_option);

    return await page.evaluate(() => {
        // Owner names from Table22
        const ownerNames = Array.from(document.querySelectorAll("#Table22 td.medFontBold"))
            .map((td) => td.innerText.trim().replace(/\s+/g, " "))
            .filter((t) => t.length > 2);

        // Location address, REID, PIN
        const bodyText = document.body ? document.body.innerText : "";
        const addressMatch = bodyText.match(/Location:\s*\n*([^\n]+)/);
        const reidMatch = bodyText.match(/REID:\s*(\d+)/);
        const pinMatch = bodyText.match(/PIN:\s*(\d+)/);

        // Assessed values from Table33
        let realVal = "$0.00";
        let personalVal = "$0.00";
        let totalVal = "$0.00";

        document.querySelectorAll("#Table33 tr").forEach((tr) => {
            const text = tr.innerText;
            const numMatch = text.match(/[\d,]+/);
            if (!numMatch) return;
            const formatted = "$" + numMatch[0];
            if (/real/i.test(text)) realVal = formatted;
            if (/personal/i.test(text)) personalVal = formatted;
            if (/total value/i.test(text)) totalVal = formatted;
        });

        if ((totalVal === "$0.00" || totalVal === "$0") && personalVal !== "$0.00") {
            totalVal = personalVal;
        }

        // Financial totals & paid date
        const billedMatch = bodyText.match(/Total Billed\s*\n*\$?([\d,]+\.\d{2})/);
        const paidMatch = bodyText.match(/Total Paid\s*\n*\$?([\d,]+\.\d{2})/);
        const paidDateMatch = bodyText.match(/Paid\s*(?:in full)?\s*on:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

        return {
            ownerNames: ownerNames.length ? ownerNames : ["N/A"],
            property_address: addressMatch ? addressMatch[1].trim().replace(/\s+/g, " ") : "N/A",
            reid: reidMatch ? reidMatch[1] : "",
            pin: pinMatch ? pinMatch[1] : "",
            land_value: realVal,
            total_assessed_value: totalVal,
            total_billed: billedMatch ? "$" + billedMatch[1] : "$0.00",
            total_paid: paidMatch ? "$" + paidMatch[1] : "$0.00",
            paid_date: paidDateMatch ? paidDateMatch[1] : "",
        };
    });
}

// ----------------------------------------------------
// Main Account Search
// ----------------------------------------------------
const account_search = async (page, account) => {
    const cleanAccount = account.includes("-") ? account.split("-")[0].trim() : account.trim();
    const result = createPropertyObject();

    // 1. Search account
    await searchAccount(page, cleanAccount);

    // 2. Extract summary bills (sorted newest first)
    const bills = await getSummaryBills(page);
    const latestBill = bills[0];

    // 3. Extract statement details from the newest bill
    const stmtData = await getStatementDetails(page, latestBill.pk);

    result.parcel_number = stmtData.reid || stmtData.pin || cleanAccount;
    result.property_address = stmtData.property_address;
    result.owner_name = stmtData.ownerNames;
    result.land_value = stmtData.land_value;
    result.total_assessed_value = stmtData.total_assessed_value;
    result.total_taxable_value = stmtData.total_assessed_value;

    // 4. Build tax_history:
    // - Most recent year is always added.
    // - If it's Paid, stop immediately (only first paid record added).
    // - If it's Unpaid, add unpaid priors until first paid prior year is reached, then stop.
    for (let i = 0; i < bills.length; i++) {
        const b = bills[i];
        if (i > 0 && b.status === "Paid") break;

        const th = createTaxHistory();
        th.year = String(b.year);
        th.status = b.status;
        th.due_date = b.dueDate;
        th.delq_date = b.delqDate;
        th.paid_date = (i === 0 && stmtData.paid_date !== "-") ? stmtData.paid_date : (b.paidDate || "-");

        if (b.status === "Paid") {
            th.amount_due = "$0.00";
            th.amount_paid = (i === 0 && stmtData.total_paid !== "$0.00") ? stmtData.total_paid : (stmtData.total_billed || "$0.00");
            th.base_amount = stmtData.total_billed || th.amount_paid;
            result.tax_history.push(th);
            break;
        } else {
            th.amount_due = b.currentDue;
            th.amount_paid = "$0.00";
            th.base_amount = (i === 0 && stmtData.total_billed) ? stmtData.total_billed : b.currentDue;
            result.tax_history.push(th);
        }
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
        const errorMsg = "Enter the Account / Parcel Number...";
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

        const data = await account_search(page, cleanAccount);

        if (fetch_type === "html") {
            return res.status(200).render("parcel_data_official", data);
        }
        return res.status(200).json({ result: data });
    } catch (error) {
        console.error("Error in Wake County search:", error.message);
        if (fetch_type === "html") {
            return res.status(200).render("error_data", { error: true, message: error.message });
        }
        return res.status(500).json({ error: true, message: error.message });
    } finally {
        if (context) await context.close();
    }
};

export { search };
