// Author:- Bhagyashree Badadal
// North Carolina Multi-County Controller (Guilford, Forsyth, Orange, Henderson)

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ----------------------------------------------------
// County Configuration Data
// ----------------------------------------------------
const county_data = {
    "guilford": {
        bill_url: "https://bcpwa.ncptscloud.com/guilford/bill-search?parcelid=",
        search_url: "https://lrcpwa.ncptscloud.com/guilford/parcel-search",
        use_reid: true,
        auth: "Guilford County Tax Department, PO Box 70939, Charlotte, NC 28272-0939"
    },
    "forsyth": {
        bill_url: "https://bcpwa.ncptscloud.com/forsyth/bill-search?parcelid=",
        search_url: "https://lrcpwa.ncptscloud.com/forsyth/parcel-search",
        use_reid: false,
        auth: "Forsyth County Tax Collector, PO Box 82, Winston-Salem, NC 27102"
    },
    "orange": {
        bill_url: "https://bcpwa.ncptscloud.com/orange/bill-search",
        use_reid: false,
        auth: "Orange County Tax Collector, PO Box 8181, Hillsborough, NC 27278"
    },
    "henderson": {
        bill_url: "https://bcpwa.ncptscloud.com/Henderson/bill-search",
        use_reid: false,
        auth: "Henderson County Tax Collector, 200 N Grove St, Ste 66, Hendersonville, NC 28792"
    }
};

const timeout_option = {
    timeout: 45000,
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: check if today has reached or passed delinquent date (Jan 6)
const is_delq = (dateStr) => {
    if (!dateStr) return false;
    const today = new Date();
    const delqDate = new Date(dateStr);
    return today >= delqDate;
};

// ----------------------------------------------------
// Notes For Annual (Normal Due Date is 09/01)
// ----------------------------------------------------
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
        console.log(error);
    } finally {
        return notes;
    }
};

// ----------------------------------------------------
// Base Object Template
// ----------------------------------------------------
function createPropertyObject() {
    return {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "",
        borrower_name: "",
        owner_name: [],
        property_address: "",
        parcel_number: "",
        land_value: "-",
        improvements: "-",
        total_assessed_value: "",
        exemption: "-",
        total_taxable_value: "",
        delinquent: "NONE",
        taxing_authority: "",
        notes: "",
        tax_history: []
    };
}

// ----------------------------------------------------
// Step 1: Scrape Property Summary (Values, Owners, Address, REID)
// ----------------------------------------------------
const fetchPropertySummary = async (page, propUrl, account) => {
    try {
        await page.goto(propUrl, { waitUntil: "networkidle2", ...timeout_option });
        await page.waitForSelector("#simpleSearch", { timeout: 15000 });
        await page.type("#simpleSearch", account, { delay: 50 });

        // Click search button
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll("button"));
            const btn = buttons.find(b => b.innerText.includes("Search Parcels") || b.innerText.trim() === "Search");
            if (btn) btn.click();
        });

        // Wait for direct Property Summary OR Search Results table OR not found
        await page.waitForFunction(() => {
            const h1s = Array.from(document.querySelectorAll("h1")).map(h => h.innerText);
            const hasSummary = h1s.some(h => h.includes("Property Summary"));
            const hasDetailLink = !!document.querySelector("a[href*='parcel-detail']");
            const hasRows = document.querySelectorAll("table tbody tr a").length > 0;
            const text = document.body ? document.body.innerText : "";
            const notFound = text.includes("Found 0 results") || text.includes("No records found") || text.includes("No data found");
            return hasSummary || hasDetailLink || hasRows || notFound;
        }, { timeout: 20000 });

        await delay(1000);

        // If on search results page (not direct summary), click the first matching result link
        const isOnResultsPage = await page.evaluate(() => {
            const h1s = Array.from(document.querySelectorAll("h1")).map(h => h.innerText);
            return !h1s.some(h => h.includes("Property Summary")) && (!!document.querySelector("a[href*='parcel-detail']") || document.querySelectorAll("table tbody tr a").length > 0);
        });

        if (isOnResultsPage) {
            await page.evaluate(() => {
                // Target the actual parcel detail link instead of the header table
                const firstLink = document.querySelector("a[href*='parcel-detail']");
                if (firstLink) firstLink.click();
            });

            await page.waitForFunction(() => {
                const h1s = Array.from(document.querySelectorAll("h1")).map(h => h.innerText);
                return h1s.some(h => h.includes("Property Summary"));
            }, { timeout: 20000 });

            await delay(1000);
        }

        // Extract property fields
        const propertyData = await page.evaluate(() => {
            const getTextAfterLabel = (labelText) => {
                const spans = document.querySelectorAll("span");
                for (let span of spans) {
                    if (span.innerText.trim().startsWith(labelText)) {
                        const next = span.nextElementSibling;
                        return next ? next.innerText.trim() : "";
                    }
                }
                return "";
            };

            const reid = getTextAfterLabel("REID");
            const pin = getTextAfterLabel("PIN");
            const address = getTextAfterLabel("Location Address").replace(/\n+/g, ", ");
            const landVal = getTextAfterLabel("Total Appraised Land Value");
            const bldgVal = getTextAfterLabel("Total Appraised Building Value");
            const totalVal = getTextAfterLabel("Total Appraised Value");
            const taxableVal = getTextAfterLabel("Total Taxable Value");

            // Extract Owner Names
            let owners = [];
            const spans = document.querySelectorAll("span");
            for (let span of spans) {
                if (span.innerText.trim().startsWith("Property Owner")) {
                    const next = span.nextElementSibling;
                    if (next) {
                        const pTags = next.querySelectorAll("p");
                        if (pTags.length > 0) {
                            pTags.forEach(p => owners.push(p.innerText.trim()));
                        } else if (next.innerText.trim()) {
                            owners.push(next.innerText.trim());
                        }
                    }
                    break;
                }
            }

            return {
                reid: reid,
                parcel_number: pin || reid,
                owner_name: owners,
                property_address: address,
                land_value: landVal || "-",
                improvements: bldgVal || "-",
                total_assessed_value: totalVal || taxableVal || "",
                total_taxable_value: taxableVal || totalVal || ""
            };
        });

        return propertyData;
    } catch (error) {
        return {
            reid: "",
            parcel_number: account,
            owner_name: [],
            property_address: "",
            land_value: "-",
            improvements: "-",
            total_assessed_value: "",
            total_taxable_value: ""
        };
    }
};

// ----------------------------------------------------
// Step 2: Scrape Single Bill Detail Page
// ----------------------------------------------------
const fetchBillDetail = async (page, billUrl) => {
    await page.goto(billUrl, { waitUntil: "networkidle2", ...timeout_option });

    // Wait for dynamic React content to fully render
    await page.waitForFunction(() => {
        const text = document.body ? document.body.innerText : "";
        return text.includes("Bill Due Date:") || text.includes("Original Bill Amount:");
    }, timeout_option);

    await delay(500);

    const detail = await page.evaluate(() => {
        const getSpanValue = (label) => {
            const spans = document.querySelectorAll("span");
            for (let span of spans) {
                if (span.innerText.trim() === label) {
                    const next = span.nextElementSibling;
                    return next ? next.innerText.trim() : "";
                }
            }
            return "";
        };

        const dueDate = getSpanValue("Bill Due Date:");
        const bodyText = document.body.innerText;

        let originalAmount = "$0.00";
        const origMatch = bodyText.match(/Original Bill Amount:\s*(\$[\d,]+\.\d{2})/);
        if (origMatch) originalAmount = origMatch[1];

        let amountDue = "$0.00";
        const dueMatch = bodyText.match(/Amount Due:\s*(\$[\d,]+\.\d{2})/);
        if (dueMatch) amountDue = dueMatch[1];

        let delqDate = "";
        const intMatch = bodyText.match(/Interest Begins:\s*(\d{2}\/\d{2}\/\d{4})/);
        if (intMatch) delqDate = intMatch[1];

        let assessedVal = "";
        const valMatch = bodyText.match(/(?:Real Property Value|Appraised Value of all Properties):\s*(\$[\d,]+(?:\.\d{2})?)/);
        if (valMatch) assessedVal = valMatch[1];

        let taxableVal = "";
        const taxMatch = bodyText.match(/Total Taxable Value:\s*(\$[\d,]+(?:\.\d{2})?)/);
        if (taxMatch) taxableVal = taxMatch[1];

        let detailOwner = "";
        const ownerMatch = bodyText.match(/Owner Name:\s*\n+([^\n]+)/);
        if (ownerMatch) detailOwner = ownerMatch[1].trim();

        let detailAddress = "";
        const locMatch = bodyText.match(/Physical Location:\s*\n+([^\n]+(?:\n+[^\n]+)?)/);
        if (locMatch) detailAddress = locMatch[1].replace(/\n+/g, ", ").trim();

        // Payment History table specifically (targeting rows with data)
        let paidDate = "-";
        let amountPaid = "$0.00";
        const tables = Array.from(document.querySelectorAll("table"));
        const paymentTable = tables.find(
            t => t.getAttribute("aria-label") === "Payment History" && t.querySelectorAll("tbody tr").length > 0
        ) || tables.find(
            t => (t.querySelector("thead") && t.querySelector("thead").innerText.includes("Transaction Number")) && t.querySelectorAll("tbody tr").length > 0
        );

        if (paymentTable) {
            const firstRow = paymentTable.querySelector("tbody tr");
            if (firstRow) {
                const tds = firstRow.querySelectorAll("td");
                for (let td of tds) {
                    const txt = td.innerText.trim();
                    if (/^\d{2}\/\d{2}\/\d{4}$/.test(txt) && paidDate === "-") {
                        paidDate = txt;
                    }
                    if (/^\$[\d,]+\.\d{2}$/.test(txt) && amountPaid === "$0.00") {
                        amountPaid = txt;
                    }
                }
            }
        }

        return {
            due_date: dueDate,
            delq_date: delqDate,
            base_amount: originalAmount,
            amount_due: amountDue,
            amount_paid: amountPaid,
            paid_date: paidDate,
            assessed_value: assessedVal || taxableVal || "",
            owner_name: detailOwner,
            property_address: detailAddress
        };
    });

    return detail;
};

// ----------------------------------------------------
// Step 3: Fetch Bill Search and Build Tax History
// ----------------------------------------------------
const fetchTaxHistory = async (page, searchBaseUrl, searchParam, county) => {

    if (county === "guilford" || county === "forsyth") {
        const billSearchUrl = `${searchBaseUrl}${searchParam}`;
        await page.goto(billSearchUrl, { waitUntil: "networkidle2", ...timeout_option });
    }

    // Wait for either the search table rows or not found message
    await page.waitForFunction(() => {
        const table = document.querySelector('table[aria-label="Bill search results table"]') || document.querySelector("table tbody tr a");
        const text = document.body ? document.body.innerText : "";
        return (table && table.querySelectorAll("tbody tr").length > 0) || text.includes("Found 0 results") || text.includes("No records found");
    }, timeout_option);

    await delay(500);

    const bills = await page.evaluate(() => {
        const rows = document.querySelectorAll('table[aria-label="Bill search results table"] tbody tr');
        const list = [];

        for (let row of rows) {
            const cells = row.querySelectorAll("td");
            const link = row.querySelector("a");

            if (link && cells.length >= 10) {
                const billNumber = cells[0].innerText.trim();
                const year = cells[1].innerText.trim();
                const parcelId = cells[2].innerText.trim();
                const billType = cells[3].innerText.trim();
                const owner = cells[4].innerText.trim();
                const address = cells[5].innerText.trim().replace(/\n+/g, ", ");
                const flag = cells[6].innerText.trim();
                const origAmt = cells[7].innerText.trim();
                const status = cells[8].innerText.trim();
                const amtDue = cells[9].innerText.trim();
                const href = link.getAttribute("href");

                // Filter specifically for Real Property
                if (billType.toLowerCase().includes("real")) {
                    list.push({
                        bill_number: billNumber,
                        year: year,
                        parcel_id: parcelId,
                        bill_type: billType,
                        owner: owner,
                        address: address,
                        flag: flag,
                        original_amount: origAmt,
                        status: status,
                        amount_due: amtDue,
                        bill_url: window.location.origin + href
                    });
                }
            }
        }

        return list;
    });

    if (bills.length === 0) {
        return { taxHistory: [], rawBills: [] };
    }

    // Sort descending by tax year
    bills.sort((a, b) => parseInt(b.year) - parseInt(a.year));

    const taxHistory = [];
    const latestBill = bills[0];
    const isLatestPaid = latestBill.status === "PAID" || latestBill.amount_due === "$0.00";

    if (isLatestPaid) {
        const detail = await fetchBillDetail(page, latestBill.bill_url);
        taxHistory.push({
            jurisdiction: "County",
            year: latestBill.year,
            payment_type: "Annual",
            status: "Paid",
            base_amount: detail.base_amount || latestBill.original_amount,
            amount_paid: detail.amount_paid !== "$0.00" ? detail.amount_paid : (detail.base_amount || latestBill.original_amount),
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: detail.due_date || `09/01/${latestBill.year}`,
            delq_date: detail.delq_date || `01/06/${parseInt(latestBill.year) + 1}`,
            paid_date: detail.paid_date || "-",
            good_through_date: "-",
            assessed_value: detail.assessed_value,
            owner_name: detail.owner_name,
            property_address: detail.property_address
        });
    } else {
        for (let bill of bills) {
            const isPaid = bill.status === "PAID" || bill.amount_due === "$0.00";
            if (isPaid) {
                break;
            }

            const detail = await fetchBillDetail(page, bill.bill_url);
            const delqDate = detail.delq_date || `01/06/${parseInt(bill.year) + 1}`;
            const status = is_delq(delqDate) ? "Delinquent" : "Due";

            taxHistory.push({
                jurisdiction: "County",
                year: bill.year,
                payment_type: "Annual",
                status: status,
                base_amount: detail.base_amount || bill.original_amount,
                amount_paid: detail.amount_paid || "$0.00",
                amount_due: detail.amount_due || bill.amount_due,
                mailing_date: "N/A",
                due_date: detail.due_date || `09/01/${bill.year}`,
                delq_date: delqDate,
                paid_date: detail.paid_date || "-",
                good_through_date: "-",
                assessed_value: detail.assessed_value,
                owner_name: detail.owner_name,
                property_address: detail.property_address
            });
        }
    }

    taxHistory.sort((a, b) => parseInt(a.year) - parseInt(b.year));
    return { taxHistory, rawBills: bills };
};

// ----------------------------------------------------
// Main Account Search
// ----------------------------------------------------
const account_search = async (page, browser, url, account, tax_auth, req_county) => {
    try {
        const config = county_data[req_county] || {};
        let searchUrl;
        let billSearchUrl = config.bill_url;
        let propData = { reid: "", parcel_number: account, owner_name: [], property_address: "", land_value: "-", improvements: "-", total_assessed_value: "", total_taxable_value: "" };

        let result = createPropertyObject();
        result.order_number = "";
        result.borrower_name = "";
        result.parcel_number = account;
        result.taxing_authority = tax_auth;

        if (req_county === "guilford" || req_county === "forsyth") {
            searchUrl = config.search_url;
            billSearchUrl = config.bill_url;

            // 1. Scrape Property Summary (Appraisal Portal)
            propData = await fetchPropertySummary(page, searchUrl, account);

            result.owner_name = propData.owner_name;
            result.property_address = propData.property_address;
            result.parcel_number = propData.parcel_number || account;
            result.land_value = propData.land_value;
            result.improvements = propData.improvements;
            result.total_assessed_value = propData.total_assessed_value;
            result.total_taxable_value = propData.total_taxable_value;
        } else {
            await page.goto(config.bill_url, { waitUntil: "networkidle2", ...timeout_option });
            await page.waitForSelector("#simpleSearch", { timeout: 15000 });
            await page.type("#simpleSearch", account, { delay: 50 });

            // Click search button
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll("button"));
                const btn = buttons.find(b => b.innerText.trim() === "Search Bills" || b.innerText.trim() === "Search Parcels");
                if (btn) btn.click();
            });
            await page.keyboard.press("Enter");
        }

        // 2. Fetch Tax History (Bill Collections Portal)
        const searchParam = config.use_reid ? (propData.reid || account) : account;
        const { taxHistory, rawBills } = await fetchTaxHistory(page, billSearchUrl, searchParam, req_county);
        result.tax_history = taxHistory;

        // Fill missing owner, address, or assessed value from bills if summary was empty
        if (result.tax_history.length > 0) {
            const lastBill = result.tax_history[result.tax_history.length - 1];
            if (result.owner_name.length === 0 && lastBill.owner_name) {
                result.owner_name = [lastBill.owner_name];
            }
            if (!result.property_address && lastBill.property_address) {
                result.property_address = lastBill.property_address;
            }
            if (!result.total_assessed_value && lastBill.assessed_value) {
                result.total_assessed_value = lastBill.assessed_value;
                result.total_taxable_value = lastBill.assessed_value;
            }
        }

        if (rawBills && rawBills.length > 0) {
            const first = rawBills[0];
            if (result.owner_name.length === 0 && first.owner) {
                result.owner_name = first.owner.split("\n").map(o => o.trim()).filter(Boolean);
            }
            if (!result.property_address && first.address) {
                result.property_address = first.address;
            }
        }

        // Clean internal helper field
        result.tax_history.forEach(t => {
            delete t.assessed_value;
            delete t.owner_name;
            delete t.property_address;
        });

        // 3. Delinquency and Notes
        if (result.tax_history.length > 0) {
            const hasDelinquent = result.tax_history.some(
                (t) => t.status === "Delinquent"
            );
            result.delinquent = hasDelinquent
                ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                : "NONE";

            const latestTax = result.tax_history[result.tax_history.length - 1];

            const hasPriorDelinquent = result.tax_history.some(
                (t) => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
            );

            const keys = hasPriorDelinquent ? 0 : 1;
            result.notes = generate_notes(latestTax.year, keys, latestTax.status);
        }

        return result;
    } catch (error) {
        throw new Error(error.message);
    }
};

// ----------------------------------------------------
// Express Controller Entry Point
// ----------------------------------------------------
const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    if (account) account = account.trim();

    const req_county = (req.body.county || req.path.replace(/\//g, "")).toLowerCase();

    if (!county_data[req_county]) {
        return res.status(200).render("error_data", {
            error: true,
            message: "Invalid or unsupported county."
        });
    }

    const url = county_data[req_county].bill_url;
    const tax_auth = county_data[req_county].auth;

    if (fetch_type !== "html" && fetch_type !== "api") {
        return res.status(200).render("error_data", {
            error: true,
            message: "Invalid Access"
        });
    }

    let browser;
    let context;

    try {
        browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36");

        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (req.resourceType() === "font" || req.resourceType() === "image") {
                req.abort();
            } else {
                req.continue();
            }
        });

        const data = await account_search(page, browser, url, account, tax_auth, req_county);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else if (fetch_type === "api") {
            res.status(200).json({ result: data });
        }
    } catch (error) {
        console.error("Error in search:", error);
        if (fetch_type === "html") {
            res.status(200).render("error_data", {
                error: true,
                message: error.message
            });
        } else if (fetch_type === "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    } finally {
        if (context) {
            try {
                await context.close();
            } catch (err) { }
        }
    }
};

export { search };