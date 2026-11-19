// Author:- Bhagyashree Badadal / Dhanush
// San Bernardino County, California (CA) Parcel ID Search Controller

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
        taxing_authority: "San Bernardino County Auditor-Controller/Treasurer/Tax Collector, 268 West Hospitality Lane, San Bernardino, CA 92415",
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
        base_amount: "$0.00",
        amount_paid: "$0.00",
        amount_due: "$0.00",
        mailing_date: "N/A",
        due_date: "",
        delq_date: "",
        paid_date: "",
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

// Notes generation technique
const generate_notes = (year, keys, status1, status2) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${status1.toUpperCase()}, 2ND INSTALLMENT IS ${status2.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE 12/10 AND 04/10`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// Modular Step 1: Search parcel number and retrieve summary iframe URL
async function searchAccountNumber(page, url, account) {
    await page.goto(url, { waitUntil: "domcontentloaded", ...timeout_option });

    // Cookie Banner Check
    try {
        const cookieBtn = await page.waitForSelector('button[aria-label="Accept cookies"]', { timeout: 3000 });
        if (cookieBtn) {
            await cookieBtn.click();
            await new Promise((r) => setTimeout(r, 1000));
        }
    } catch (e) {
        // Cookie banner not present, continue
    }

    const iframeEl = await page.waitForSelector('iframe#gsg-public-site', timeout_option);
    const iframe = await iframeEl.contentFrame();
    if (!iframe) throw new Error("Could not access iframe contentFrame");

    const inputSelector = 'input[id^="typeahead-input-"]';
    await iframe.waitForSelector(inputSelector, timeout_option);
    await iframe.type(inputSelector, account.trim(), { delay: 50 });

    const itemSelector = '.typeahead-list-item, .vbst-item, .list-group-item';
    const outcome = await Promise.race([
        iframe.waitForSelector(itemSelector, { timeout: 15000 }).then(() => 'autocomplete'),
        iframe.waitForSelector('iframe[title="Main Content"]', { timeout: 15000 }).then(() => 'nested_iframe')
    ]).catch(() => null);

    let summaryUrl = null;
    if (outcome === 'autocomplete') {
        await iframe.click(itemSelector);
        const nestedIframeEl = await iframe.waitForSelector('iframe[title="Main Content"]', timeout_option);
        summaryUrl = await iframe.evaluate((el) => el.src, nestedIframeEl);
    } else if (outcome === 'nested_iframe') {
        const nestedIframeEl = await iframe.$('iframe[title="Main Content"]');
        summaryUrl = await iframe.evaluate((el) => el.src, nestedIframeEl);
    } else {
        await iframe.keyboard.press('Enter');
        const nestedIframeEl = await iframe.waitForSelector('iframe[title="Main Content"]', timeout_option);
        summaryUrl = await iframe.evaluate((el) => el.src, nestedIframeEl);
    }

    if (!summaryUrl) {
        throw new Error("No Record Found");
    }

    return summaryUrl;
}

// Modular Step 2: Extract Account Summary and Bill History
async function extractAccountSummary(page, summaryUrl, account, result) {
    await page.goto(summaryUrl, { waitUntil: "domcontentloaded", ...timeout_option });
    await page.waitForSelector('#bill-history-content, #amount-due-content', timeout_option);

    const summaryData = await page.evaluate((acct) => {
        let parcel_number = acct;
        let property_address = "";
        let owner_name = ["N/A"];

        const headerSpan = document.querySelector('h1 span[translate="no"]');
        if (headerSpan) {
            const parts = headerSpan.textContent.split('—');
            if (parts.length >= 1 && parts[0].trim()) parcel_number = parts[0].trim();
            if (parts.length >= 2 && parts[1].trim()) property_address = parts[1].trim();
        }

        document.querySelectorAll('.account-detail').forEach((row) => {
            const label = row.querySelector('div:first-child')?.textContent.trim();
            const val = row.querySelector('.value')?.textContent.trim().replace(/\s+/g, ' ');
            if (label === 'Address:' && val) {
                property_address = val;
            }
        });

        const assesseeEl = document.querySelector('.assessee, [class*="assessee"]');
        if (assesseeEl) {
            const assesseeText = assesseeEl.textContent.replace(/Assessee:/i, '').trim();
            if (assesseeText && assesseeText !== 'Current Owner') {
                owner_name = [assesseeText];
            }
        }

        let has_priors_unpaid = false;
        const amountDueBills = document.querySelectorAll('#amount-due-content .bill, #amount-due-content table');
        amountDueBills.forEach((el) => {
            const text = el.innerText || '';
            if (/default/i.test(text) && /\$[\d,]+\.\d{2}/.test(text)) {
                has_priors_unpaid = true;
            }
        });

        const allTbodies = Array.from(document.querySelectorAll('#bill-history-content tbody[data-bill-number]'));
        const billsMap = {};
        let maxYear = 0;

        allTbodies.forEach((tb) => {
            const bNum = tb.getAttribute('data-bill-number');
            if (!bNum) return;

            if (!billsMap[bNum]) {
                billsMap[bNum] = { billNumber: bNum, year: 0, billType: "Annual", detailUrl: "", installments: [] };
            }

            if (tb.classList.contains('installment')) {
                const row = tb.querySelector('tr.d-none.d-md-table-row') || tb.querySelector('tr');
                if (row) {
                    const desc = row.querySelector('th.description')?.innerText.trim() || '';
                    const balance = row.querySelector('td.balance')?.innerText.trim() || '$0.00';
                    const statusText = row.querySelector('td.status')?.innerText.trim() || '';
                    const asOfText = row.querySelector('td.as-of')?.innerText.trim() || '';

                    billsMap[bNum].installments.push({
                        description: desc,
                        balance: balance,
                        statusText: statusText,
                        asOfText: asOfText
                    });
                }
            } else {
                const link = tb.querySelector('th.year-header a');
                if (link) {
                    const text = link.innerText.trim();
                    const href = link.href;
                    const yearMatch = text.match(/(\d{4})/);
                    if (yearMatch) {
                        const yr = parseInt(yearMatch[1], 10);
                        billsMap[bNum].year = yr;
                        if (yr > maxYear) maxYear = yr;
                    }
                    if (/supplemental/i.test(text)) billsMap[bNum].billType = "Supplemental";
                    else if (/unsecured/i.test(text)) billsMap[bNum].billType = "Unsecured";
                    billsMap[bNum].detailUrl = href;
                }
            }
        });

        Object.values(billsMap).forEach((b) => {
            if (b.year > 0 && b.year < maxYear) {
                b.installments.forEach((inst) => {
                    const balNum = parseFloat(inst.balance.replace(/[$,]/g, '')) || 0;
                    const isUnpaid = balNum > 0 || (/unpaid/i.test(inst.statusText) || !/paid/i.test(inst.statusText));
                    if (isUnpaid && balNum > 0) {
                        has_priors_unpaid = true;
                    }
                });
            }
        });

        let latestBill = Object.values(billsMap).find((b) => b.year === maxYear && b.billType === "Annual");
        if (!latestBill) {
            latestBill = Object.values(billsMap).find((b) => b.year === maxYear);
        }

        return {
            parcel_number,
            property_address,
            owner_name,
            maxYear,
            has_priors_unpaid,
            latestBill
        };
    }, account);

    result.parcel_number = summaryData.parcel_number;
    result.property_address = summaryData.property_address;
    result.owner_name = summaryData.owner_name;

    return summaryData;
}

// Modular Step 3: Extract Assessed Values from latest bill
async function extractBillDetails(page, summaryUrl, latestBill, result) {
    if (!latestBill) throw new Error("No bill found for account");

    let detailUrl = latestBill.detailUrl;
    if (detailUrl && detailUrl.includes('/bills/')) {
        const billPath = detailUrl.substring(detailUrl.indexOf('/bills/'));
        const baseSummary = summaryUrl.split('?')[0];
        detailUrl = `${baseSummary}${billPath}`;
    }

    await page.goto(detailUrl, { waitUntil: "domcontentloaded", ...timeout_option });
    await page.waitForSelector('table.assessed-values-table', timeout_option);

    const assessedValues = await page.evaluate(() => {
        const table = document.querySelector('table.assessed-values-table');
        if (!table) return null;

        const tds = Array.from(table.querySelectorAll('tbody tr:first-child td'));
        if (tds.length < 5) return null;

        return {
            land_value: tds[0].innerText.trim() || "$0.00",
            improvements: tds[1].innerText.trim() || "$0.00",
            exemption: tds[3].innerText.trim() || "$0.00",
            total_assessed_value: tds[4].innerText.trim() || "$0.00",
            total_taxable_value: tds[4].innerText.trim() || "$0.00"
        };
    });

    if (assessedValues) {
        result.land_value = assessedValues.land_value;
        result.improvements = assessedValues.improvements;
        result.exemption = assessedValues.exemption;
        result.total_assessed_value = assessedValues.total_assessed_value;
        result.total_taxable_value = assessedValues.total_taxable_value;
    }
}

// Modular Orchestrator
const account_search = async (page, url, account) => {
    const result = createPropertyObject();

    // 1. Search parcel number and get summary iframe URL
    const summaryUrl = await searchAccountNumber(page, url, account);

    // 2. Extract account summary and bill history
    const summaryData = await extractAccountSummary(page, summaryUrl, account, result);
    const { maxYear, has_priors_unpaid, latestBill } = summaryData;

    // 3. Extract assessed values from latest bill
    await extractBillDetails(page, summaryUrl, latestBill, result);

    // 4. Build tax_history using createTaxHistory()
    if (latestBill && latestBill.installments && latestBill.installments.length > 0) {
        latestBill.installments.forEach((inst, idx) => {
            const th = createTaxHistory();
            const isFirst = inst.description.includes('1') || idx === 0;
            const instNum = isFirst ? 1 : 2;
            th.year = maxYear;
            th.payment_type = `${instNum}${instNum === 1 ? 'st' : 'nd'} Installment`;

            const isUnpaid = /unpaid/i.test(inst.statusText) || (parseFloat(inst.balance.replace(/[$,]/g, '')) || 0) > 0;
            const isPaid = !isUnpaid && /paid/i.test(inst.statusText);

            let delq_date = isFirst ? `12/10/${maxYear}` : `04/10/${maxYear + 1}`;

            if (isPaid) {
                const paidMatch = inst.statusText.match(/\$([\d,]+\.\d{2})/);
                th.amount_paid = paidMatch ? `$${paidMatch[1]}` : "$0.00";
                th.base_amount = th.amount_paid;
                th.amount_due = "$0.00";
                th.paid_date = inst.asOfText.match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] || inst.asOfText;
            } else {
                th.amount_due = inst.balance;
                th.base_amount = inst.balance;
                th.amount_paid = "$0.00";
                th.paid_date = "-";
                const delqMatch = inst.asOfText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
                if (delqMatch) delq_date = delqMatch[0];
            }

            let status = isPaid ? "Paid" : "Due";
            if (!isPaid && is_delq(delq_date)) {
                status = "Delinquent";
            }

            th.status = status;
            th.due_date = isFirst ? `11/01/${maxYear}` : `02/01/${maxYear + 1}`;
            th.delq_date = delq_date;

            result.tax_history.push(th);
        });
    }

    // 5. User's exact sorting and notes generation technique
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
        // Check if ANY tax is delinquent for the main delinquency flag
        const hasDelinquent = result.tax_history.some(
            (t) => t.status === "Delinquent" || t.status === "DELINQUENT"
        );
        result.delinquent = (has_priors_unpaid || hasDelinquent)
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        // Get the latest tax record
        const latestTax = result.tax_history[result.tax_history.length - 1];

        // Find individual statuses for the 1st and 2nd installments of the latest year
        const latestYearRecords = result.tax_history
            .filter((t) => String(t.year) === String(latestTax.year))
            .sort((a, b) => {
                const numA = parseInt(a.payment_type.match(/\d+/)?.[0] || 1);
                const numB = parseInt(b.payment_type.match(/\d+/)?.[0] || 1);
                return numA - numB;
            });

        const inst1 = latestYearRecords.find((t) => t.payment_type.toLowerCase().includes("1"));
        const inst2 = latestYearRecords.find((t) => t.payment_type.toLowerCase().includes("2"));
        const status1 = inst1 ? inst1.status : "UNKNOWN";
        const status2 = inst2 ? inst2.status : "UNKNOWN";

        // Check if any PRIOR year is delinquent (exclude latest year)
        const hasPriorDelinquent = has_priors_unpaid || result.tax_history.some(
            (t) => (t.status === "Delinquent" || t.status === "DELINQUENT") && String(t.year) !== String(latestTax.year)
        );

        // If priors are delinquent, keys = 0. If priors are paid, keys = 1.
        const keys = hasPriorDelinquent ? 0 : 1;
        result.notes = generate_notes(latestTax.year, keys, status1, status2);
    }

    return result;
};

const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    if (account) {
        account = String(account).trim();
    }

    if (!account || account === "") {
        const errorMsg = "Enter the Account / Parcel Number...";
        if (fetch_type === "html") {
            return res.status(200).render("error_data", { error: true, message: errorMsg });
        }
        return res.status(400).json({ error: true, message: errorMsg });
    }

    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
        return res.status(400).json({ error: true, message: "Invalid Access" });
    }

    const url = "https://www.sbcountyatc.gov/tax-services/property-tax";
    let context;

    try {
        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        const data = await account_search(page, url, account);

        if (fetch_type === "html") {
            return res.status(200).render("parcel_data_official", data);
        } else if (fetch_type === "api") {
            return res.status(200).json({ result: data });
        }
    } catch (error) {
        console.error("Error in San Bernardino search:", error.message);
        if (fetch_type === "html") {
            return res.status(200).render("error_data", { error: true, message: error.message });
        } else if (fetch_type === "api") {
            return res.status(500).json({ error: true, message: error.message });
        }
    } finally {
        if (context) {
            await context.close();
        }
    }
};

export { search };
