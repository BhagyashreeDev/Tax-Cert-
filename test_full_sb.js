import getBrowserInstance from "./utils/chromium/browserLaunch.js";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const timeout_option = { timeout: 90000 };

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

// Step 1: Navigate to county page, accept cookie if present, search account, and get the nested iframe URL
const ac_1 = async (page, url, account) => {
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", ...timeout_option });

    // Cookie Banner Check (keep as requested)
    try {
        const cookieBtn = await page.waitForSelector('button[aria-label="Accept cookies"]', { timeout: 3000 });
        if (cookieBtn) {
            await cookieBtn.click();
            console.log("Accepted cookies");
            await delay(1000);
        }
    } catch (e) {
        console.log("Cookie banner not present, proceeding...");
    }

    // Wait for the main embedded iframe
    console.log("Waiting for iframe#gsg-public-site...");
    const iframeEl = await page.waitForSelector('iframe#gsg-public-site', timeout_option);
    const iframe = await iframeEl.contentFrame();
    if (!iframe) throw new Error("Could not access iframe contentFrame");

    // Wait for typeahead search input
    console.log("Waiting for search input...");
    const inputSelector = 'input[id^="typeahead-input-"]';
    await iframe.waitForSelector(inputSelector, timeout_option);

    // Type the account number
    console.log("Typing account number:", account);
    await iframe.type(inputSelector, account.trim(), { delay: 50 });

    // Wait for autocomplete dropdown item or direct nested iframe
    console.log("Waiting for autocomplete results...");
    const itemSelector = '.typeahead-list-item, .vbst-item, .list-group-item';

    const outcome = await Promise.race([
        iframe.waitForSelector(itemSelector, { timeout: 15000 }).then(() => 'autocomplete'),
        iframe.waitForSelector('iframe[title="Main Content"]', { timeout: 15000 }).then(() => 'nested_iframe')
    ]).catch(() => null);

    let targetSrc = null;
    if (outcome === 'autocomplete') {
        console.log("Clicking autocomplete result...");
        await iframe.click(itemSelector);
        const nestedIframeEl = await iframe.waitForSelector('iframe[title="Main Content"]', timeout_option);
        targetSrc = await iframe.evaluate(el => el.src, nestedIframeEl);
    } else if (outcome === 'nested_iframe') {
        const nestedIframeEl = await iframe.$('iframe[title="Main Content"]');
        targetSrc = await iframe.evaluate(el => el.src, nestedIframeEl);
    } else {
        // Fallback: press Enter
        console.log("Pressing Enter...");
        await iframe.keyboard.press('Enter');
        const nestedIframeEl = await iframe.waitForSelector('iframe[title="Main Content"]', timeout_option);
        targetSrc = await iframe.evaluate(el => el.src, nestedIframeEl);
    }

    if (!targetSrc) {
        throw new Error("No Record Found");
    }

    console.log("Extracted Account Summary iframe src:", targetSrc);
    return targetSrc;
};

// Step 2: Navigate to Account Summary iframe and extract account details and bill history
const ac_2 = async (page, summaryUrl, account) => {
    console.log("Navigating to Account Summary URL...");
    await page.goto(summaryUrl, { waitUntil: "domcontentloaded", ...timeout_option });
    await page.waitForSelector('#bill-history-content, #amount-due-content', timeout_option);

    const summaryData = await page.evaluate((acct) => {
        const data = {
            processed_date: new Date().toISOString().split('T')[0],
            order_number: "",
            borrower_name: "",
            owner_name: ["N/A"],
            property_address: "",
            parcel_number: acct,
            land_value: "$0.00",
            improvements: "$0.00",
            total_assessed_value: "$0.00",
            exemption: "$0.00",
            total_taxable_value: "$0.00",
            taxing_authority: "SAN BERNARDINO COUNTY TAX COLLECTOR",
            delinquent: "NONE",
            notes: "",
            tax_history: []
        };

        // Extract parcel number and address from header
        const headerSpan = document.querySelector('h1 span[translate="no"]');
        if (headerSpan) {
            const parts = headerSpan.textContent.split('—');
            if (parts.length >= 1 && parts[0].trim()) data.parcel_number = parts[0].trim();
            if (parts.length >= 2 && parts[1].trim()) data.property_address = parts[1].trim();
        }

        // Fallback address from .account-detail
        document.querySelectorAll('.account-detail').forEach(row => {
            const label = row.querySelector('div:first-child')?.textContent.trim();
            const val = row.querySelector('.value')?.textContent.trim().replace(/\s+/g, ' ');
            if (label === 'Address:' && val) {
                data.property_address = val;
            }
        });

        // Check owner name if present
        const assesseeEl = document.querySelector('.assessee, [class*="assessee"]');
        if (assesseeEl) {
            const assesseeText = assesseeEl.textContent.replace(/Assessee:/i, '').trim();
            if (assesseeText && assesseeText !== 'Current Owner') {
                data.owner_name = [assesseeText];
            }
        }

        // Scan Amount Due section for Defaulted bills
        let has_priors_unpaid = false;
        const amountDueBills = document.querySelectorAll('#amount-due-content .bill, #amount-due-content table');
        amountDueBills.forEach(el => {
            const text = el.innerText || '';
            if (/default/i.test(text) && /\$[\d,]+\.\d{2}/.test(text)) {
                has_priors_unpaid = true;
            }
        });

        // Scan all bill rows in #bill-history-content
        const allTbodies = Array.from(document.querySelectorAll('#bill-history-content tbody[data-bill-number]'));

        const billsMap = {};
        let maxYear = 0;

        allTbodies.forEach(tb => {
            const bNum = tb.getAttribute('data-bill-number');
            if (!bNum) return;

            if (!billsMap[bNum]) {
                billsMap[bNum] = { billNumber: bNum, year: 0, billType: "Annual", detailUrl: "", installments: [] };
            }

            if (tb.classList.contains('installment')) {
                // Installment row
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
                // Header row
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

        // Check if any prior year has an unpaid balance
        Object.values(billsMap).forEach(b => {
            if (b.year > 0 && b.year < maxYear) {
                b.installments.forEach(inst => {
                    const balNum = parseFloat(inst.balance.replace(/[$,]/g, '')) || 0;
                    const isUnpaid = balNum > 0 || (/unpaid/i.test(inst.statusText) || !/paid/i.test(inst.statusText));
                    if (isUnpaid && balNum > 0) {
                        has_priors_unpaid = true;
                    }
                });
            }
        });

        // Find the latest bill
        let latestBill = Object.values(billsMap).find(b => b.year === maxYear && b.billType === "Annual");
        if (!latestBill) {
            latestBill = Object.values(billsMap).find(b => b.year === maxYear);
        }

        return {
            data,
            maxYear,
            has_priors_unpaid,
            latestBill
        };
    }, account);

    return summaryData;
};

// Step 3: Navigate to Latest Bill Details page and extract assessed values
const ac_3 = async (page, summaryData, summaryUrl) => {
    const { data, maxYear, has_priors_unpaid, latestBill } = summaryData;

    if (!latestBill) {
        throw new Error("No bill found for account");
    }

    console.log(`Latest bill is ${latestBill.year} (Bill #${latestBill.billNumber})`);

    // Build the bill detail URL inside the iframe-taxsys domain
    let detailUrl = latestBill.detailUrl;
    if (detailUrl && detailUrl.includes('/bills/')) {
        const billPath = detailUrl.substring(detailUrl.indexOf('/bills/'));
        const baseSummary = summaryUrl.split('?')[0];
        detailUrl = `${baseSummary}${billPath}`;
    }

    console.log("Navigating to Bill Detail URL:", detailUrl);
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
        Object.assign(data, assessedValues);
    }

    // Build tax_history from latest bill's installments
    const tax_history = [];
    let hasDelinquent = false;

    if (latestBill.installments && latestBill.installments.length > 0) {
        latestBill.installments.forEach((inst, idx) => {
            const isFirst = inst.description.includes('1') || idx === 0;
            const instNum = isFirst ? 1 : 2;
            const payment_type = `${instNum}${instNum === 1 ? 'st' : 'nd'} Installment`;

            // CAUTION: "Unpaid" contains "paid", so explicitly check /unpaid/ first
            const isUnpaid = /unpaid/i.test(inst.statusText) || (parseFloat(inst.balance.replace(/[$,]/g, '')) || 0) > 0;
            const isPaid = !isUnpaid && /paid/i.test(inst.statusText);

            // Extract amounts
            let base_amount = "$0.00";
            let amount_paid = "$0.00";
            let amount_due = "$0.00";
            let paid_date = "-";
            let delq_date = isFirst ? `12/10/${maxYear}` : `04/10/${maxYear + 1}`;

            if (isPaid) {
                const paidMatch = inst.statusText.match(/\$([\d,]+\.\d{2})/);
                amount_paid = paidMatch ? `$${paidMatch[1]}` : "$0.00";
                base_amount = amount_paid;
                amount_due = "$0.00";
                paid_date = inst.asOfText.match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] || inst.asOfText;
            } else {
                amount_due = inst.balance;
                base_amount = inst.balance;
                amount_paid = "$0.00";
                paid_date = "-";
                const delqMatch = inst.asOfText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
                if (delqMatch) delq_date = delqMatch[0];
            }

            // Determine status
            let status = isPaid ? "Paid" : "Due";
            if (!isPaid && is_delq(delq_date)) {
                status = "Delinquent";
                hasDelinquent = true;
            }

            const due_date = isFirst ? `11/01/${maxYear}` : `02/01/${maxYear + 1}`;

            tax_history.push({
                jurisdiction: "County",
                year: maxYear,
                payment_type,
                status,
                base_amount,
                amount_paid,
                amount_due,
                mailing_date: "N/A",
                due_date,
                delq_date,
                paid_date,
                good_through_date: "-"
            });
        });
    }

    data.tax_history = tax_history;

    // Determine Delinquency & Notes
    data.delinquent = (has_priors_unpaid || hasDelinquent)
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
        : "NONE";

    const priorsMsg = has_priors_unpaid ? "PRIORS ARE DELINQUENT." : "ALL PRIORS ARE PAID.";
    const instMsg = tax_history.length
        ? tax_history.map(i => `${i.payment_type.toUpperCase()} IS ${i.status.toUpperCase()}`).join(", ")
        : "NO INSTALLMENTS FOUND";

    data.notes = `${priorsMsg} ${maxYear} ${instMsg}. NORMALLY TAXES ARE PAID IN TWO INSTALLMENTS. NORMAL DUE DATES ARE 12/10 (1ST) & 04/10 (2ND).`;

    return data;
};

// Full Orchestrator
const account_search = async (page, url, account) => {
    const summaryUrl = await ac_1(page, url, account);
    const summaryData = await ac_2(page, summaryUrl, account);
    const finalData = await ac_3(page, summaryData, summaryUrl);
    return finalData;
};

(async () => {
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    page.setDefaultNavigationTimeout(90000);

    const url = "https://www.sbcountyatc.gov/tax-services/property-tax";
    const testAccount = "0127-152-01";

    try {
        const result = await account_search(page, url, testAccount);
        console.log("=== FINAL CERTIFICATE RESULT ===");
        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("Test failed:", err);
    } finally {
        await context.close();
        process.exit(0);
    }
})();
