// Author:- Bhagyashree Badadal

// Polk County, Iowa (IA) Parcel ID Search Controller

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
        property_address: "N/A",
        parcel_number: "",
        land_value: "",
        improvements: "",
        total_assessed_value: "N/A",
        exemption: "",
        total_taxable_value: "N/A",
        taxing_authority: "Polk County Treasurer, 111 Court Ave, Des Moines, IA 50309",
        notes: "",
        delinquent: "NONE",
        tax_history: [],
    };
}

function createTaxHistory() {
    return {
        jurisdiction: "County",
        year: "",
        payment_type: "Semi-Annual",
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

function formatDate(inputDate) {
    if (!inputDate || inputDate === "-" || inputDate === "N/A") return "-";
    const date = new Date(inputDate);
    if (isNaN(date.getTime())) return "-";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
}

function formatCurrency(val) {
    if (val === undefined || val === null || val === "" || val === "N/A" || val === "-") return "$0.00";
    const num = Number(String(val).replace(/[^0-9.-]/g, ""));
    if (isNaN(num)) return "$0.00";
    return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function determineStatus(record) {
    const cleanAmount = (val) => Number(String(val).replace(/[^0-9.-]/g, "")) || 0;

    if (cleanAmount(record.amount_due) === 0) {
        record.status = "Paid";
    } else {
        const today = new Date();
        const delqDateObj = new Date(record.delq_date || record.due_date);

        if (today < delqDateObj) {
            record.status = "Due";
        } else {
            record.status = "Delinquent";
        }
    }
}

const generate_notes = (year, keys, status1, status2) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? "ALL PRIORS ARE PAID,"
                : "PRIORS ARE DELINQUENT,";

        const s1 = (status1 || "").toUpperCase();
        const s2 = (status2 || "").toUpperCase();

        if (s1 === "PAID" && s2 === "PAID") {
            notes += ` ${year} TAXES ARE PAID,`;
        } else if (s1 === "DUE" && s2 === "DUE") {
            notes += ` ${year} TAXES ARE DUE,`;
        } else if (s1 === "DELINQUENT" && s2 === "DELINQUENT") {
            notes += ` ${year} TAXES ARE DELINQUENT,`;
        } else if (s1 && s2) {
            notes += ` ${year} 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2},`;
        } else {
            notes += ` ${year} TAXES ARE ${s1 || s2 || "PAID"},`;
        }

        notes += " NORMALLY TAXES ARE PAID SEMI-ANNUALLY,";
        notes += " NORMAL DUE DATES ARE 09/30 AND 03/31";
    } catch (error) {
        console.error("Error in generate_notes:", error);
    } finally {
        return notes;
    }
};

// -------------------------------------------------------------
// STEP 1: SEARCH BY PARCEL NUMBER & EXTRACT TOKEN (q)
// -------------------------------------------------------------
async function searchAccountNumber(accountNumber, page) {
    // 1. Accept disclaimer if presented
    await page.waitForSelector("#disclaimerAgreement", { visible: true, timeout: 10000 }).catch(() => null);
    const disclaimerAgree = await page.$("#disclaimerAgreement");
    if (disclaimerAgree) {
        await page.click("#disclaimerAgreement");
        await page.click("#disclaimerCloseBtn");
    }

    // 2. Select Search Type 0 (Parcel Number)
    await page.waitForSelector("#SearchModel_searchType", timeout_option);
    await page.select("#SearchModel_searchType", "0");

    // 3. Enter Parcel Number
    await page.waitForSelector("#SearchModel_searchTerm", timeout_option);
    await page.evaluate(() => {
        const input = document.querySelector("#SearchModel_searchTerm");
        if (input) input.value = "";
    });
    await page.type("#SearchModel_searchTerm", String(accountNumber));

    // 4. Submit Search
    await Promise.all([
        page.click("button[type='submit']"),
        page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option })
    ]);

    // 5. Wait for results table to load via AJAX
    await page.waitForSelector("#selectionTable tbody tr td a", { visible: true, timeout: 30000 });

    // 6. Navigate to Parcel Information page
    const parcelHref = await page.$eval("#selectionTable tbody tr td a", el => el.href);
    await page.goto(parcelHref, { waitUntil: "domcontentloaded", ...timeout_option });

    // 7. Extract token q from URL
    const parcelUrl = new URL(page.url());
    const q = parcelUrl.searchParams.get("q");
    if (!q) {
        throw new Error("Missing parcel token (q) from URL: " + page.url());
    }

    return q;
}

// -------------------------------------------------------------
// STEP 2: EXTRACT PARCEL DETAILS & ASSESSOR VALUATIONS
// -------------------------------------------------------------
async function getDetails(page, accountNumber, browser) {
    // Extract Parcel Information & Owners from current page
    const parcelInfo = await page.evaluate(() => {
        const getVal = (id) => document.querySelector(`#${id}`)?.value?.trim() || "";
        const pin = getVal("ParcelInformationModel_PIN");
        const address = getVal("ParcelInformationModel_PropertyAddress");

        // Extract deed parties from Legal Party table
        const owners = [];
        const rows = document.querySelectorAll(".container.parcel-container .row.clear");
        for (const r of rows) {
            const html = r.innerHTML;
            const partyMatch = html.match(/Legal Party<\/div>\s*<div[^>]*>([^<]+)<\/div>/i);
            const roleMatch = html.match(/Role<\/div>\s*<div[^>]*>([^<]+)<\/div>/i);
            if (partyMatch && roleMatch) {
                const party = partyMatch[1].trim();
                const role = roleMatch[1].trim();
                if (role.toLowerCase().includes("deed") && party && !owners.includes(party)) {
                    owners.push(party);
                }
            }
        }

        // Fallback to title holders if no deed rows found
        if (owners.length === 0) {
            const t1 = getVal("ParcelInformationModel_TitleHolder1");
            const t2 = getVal("ParcelInformationModel_TitleHolder2");
            if (t1) owners.push(t1);
            if (t2) owners.push(t2);
        }

        return { pin, address, owners };
    });

    // Extract Assessor Valuations from Polk County Assessor
    let assessorVals = null;
    try {
        const assessorUrl = `http://web.assess.co.polk.ia.us/cgi-bin/web/tt/infoqry.cgi?tt=card/card&gp=${accountNumber}`;
        const assessorPage = await browser.newPage();
        await assessorPage.goto(assessorUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

        assessorVals = await assessorPage.evaluate(() => {
            const table = document.querySelector("#grid_vals table");
            if (!table) return null;
            const row = table.querySelector("tbody tr");
            if (!row) return null;
            const cells = row.querySelectorAll("td");
            return {
                land: cells[3]?.innerText?.trim() || "",
                bldg: cells[4]?.innerText?.trim() || "",
                total: cells[5]?.innerText?.trim() || "N/A"
            };
        });

        await assessorPage.close();
    } catch (err) {
        console.warn("Assessor fetch warning:", err.message);
    }

    return { parcelInfo, assessorVals };
}

// -------------------------------------------------------------
// STEP 3: EXTRACT INSTALLMENTS & PAYMENT HISTORY
// -------------------------------------------------------------
async function getPaymentDetails(page, q) {
    const base = "https://taxsearch.polkcountyiowa.gov/RealEstate";

    // 1. Fetch Payment History (to map paid dates)
    const paymentsUrl = `${base}/AllRealEstatePayments?q=${q}`;
    await page.goto(paymentsUrl, { waitUntil: "domcontentloaded", ...timeout_option });

    const paymentsMap = await page.evaluate(() => {
        const map = {};
        const rows = document.querySelectorAll("#real-estate-payments .row.clear");
        for (const r of rows) {
            const html = r.innerHTML;
            const instMatch = html.match(/Installment<\/div>\s*<div[^>]*>([^<]+)<\/div>/i);
            const yrMatch = html.match(/Year<\/div>\s*<div[^>]*>([^<]+)<\/div>/i);
            const amtMatch = html.match(/Amount Paid<\/div>\s*<div[^>]*>([^<]+)<\/div>/i);
            const dateMatch = html.match(/Date Paid<\/div>\s*<div[^>]*>([^<]+)<\/div>/i);

            if (instMatch && yrMatch) {
                const inst = instMatch[1].trim();
                const yr = yrMatch[1].trim();
                const amt = amtMatch ? amtMatch[1].trim() : "";
                const date = dateMatch ? dateMatch[1].trim() : "";
                const key = `${yr}_${inst}`;
                if (!map[key]) {
                    map[key] = { amount: amt, date: date };
                }
            }
        }
        return map;
    });

    // 2. Fetch Installments Details
    const installmentsUrl = `${base}/AllRealEstateInstallments?q=${q}`;
    await page.goto(installmentsUrl, { waitUntil: "domcontentloaded", ...timeout_option });

    const yearBlocks = await page.evaluate(() => {
        const container = document.querySelector(".parcel-container.alternating-rows");
        if (!container) return [];

        const children = Array.from(container.children);
        const blocks = [];
        let currentData = null;

        for (const child of children) {
            if (child.classList.contains("blue")) {
                const yrEl = child.querySelector(".orange-display");
                const yrText = yrEl?.innerText?.trim();
                if (yrText && /^\d{4}$/.test(yrText)) {
                    if (currentData) blocks.push(currentData);
                    currentData = { year: yrText, installments: [] };
                }
                continue;
            }

            if (!currentData) continue;

            if (child.classList.contains("clear")) {
                const labelDiv = child.querySelector("div.col-md-2");
                const label = labelDiv?.innerText?.trim() || "";
                const cols = child.querySelectorAll("div.col-md-2.col-xs-6.text-right");

                if (cols.length >= 5) {
                    const tax = cols[0]?.innerText?.trim() || "";
                    const fee = cols[1]?.innerText?.trim() || "";
                    const interest = cols[2]?.innerText?.trim() || "";
                    const total = cols[3]?.innerText?.trim() || "";
                    const date = cols[4]?.innerText?.trim() || "";

                    currentData.installments.push({
                        label,
                        tax,
                        fee,
                        interest,
                        total,
                        date
                    });
                }
            }
        }
        if (currentData) blocks.push(currentData);
        return blocks;
    });

    return { yearBlocks, paymentsMap };
}

// -------------------------------------------------------------
// STEP 4: POPULATE PROPERTY OBJECT & ENFORCE TRACING RULES
// -------------------------------------------------------------
function populateObject(accountNumber, parcelInfo, assessorVals, yearBlocks, paymentsMap) {
    const result = createPropertyObject();
    result.parcel_number = parcelInfo.pin || accountNumber;
    result.property_address = parcelInfo.address || "";
    result.owner_name = parcelInfo.owners || [];

    // Assessor valuations
    if (assessorVals) {
        result.total_assessed_value = formatCurrency(assessorVals.total);
        result.total_taxable_value = formatCurrency(assessorVals.total);
    }

    // Sort year blocks descending (latest first)
    yearBlocks.sort((a, b) => Number(b.year) - Number(a.year));

    const cleanNum = v => Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
    const allYearsData = [];

    for (const block of yearBlocks) {
        const yr = block.year;

        let inst1Orig = null, inst1Paid = null;
        let inst2Orig = null, inst2Paid = null;

        for (const inst of block.installments) {
            if (inst.label.includes("(1) Original")) inst1Orig = inst;
            else if (inst.label.includes("(1) Payments")) inst1Paid = inst;
            else if (inst.label.includes("(2) Original")) inst2Orig = inst;
            else if (inst.label.includes("(2) Payments")) inst2Paid = inst;
        }

        const instRecords = [];

        // Installment 1 (Due 09/30)
        if (inst1Orig) {
            const rec1 = createTaxHistory();
            rec1.year = String(yr);
            rec1.payment_type = "Semi-Annual";
            rec1.base_amount = formatCurrency(inst1Orig.tax || inst1Orig.total);

            const paidAmt = inst1Paid ? cleanNum(inst1Paid.tax || inst1Paid.total) : 0;
            rec1.amount_paid = formatCurrency(paidAmt);

            const baseAmt = cleanNum(rec1.base_amount);
            const dueAmt = Math.max(0, baseAmt - paidAmt);
            rec1.amount_due = formatCurrency(dueAmt);

            rec1.due_date = formatDate(inst1Orig.date || `09/30/${yr}`);
            const dueObj1 = new Date(rec1.due_date);
            if (!isNaN(dueObj1.getTime())) {
                dueObj1.setDate(dueObj1.getDate() + 1);
                rec1.delq_date = formatDate(dueObj1);
            } else {
                rec1.delq_date = `10/01/${yr}`;
            }

            const payKey1 = `${yr}_1`;
            if (paidAmt > 0 && paymentsMap[payKey1]?.date) {
                rec1.paid_date = formatDate(paymentsMap[payKey1].date);
            } else if (paidAmt > 0) {
                rec1.paid_date = formatDate(inst1Paid.date);
            } else {
                rec1.paid_date = "-";
            }

            determineStatus(rec1);
            instRecords.push(rec1);
        }

        // Installment 2 (Due 03/31 of following year)
        if (inst2Orig) {
            const rec2 = createTaxHistory();
            rec2.year = String(yr);
            rec2.payment_type = "Semi-Annual";
            rec2.base_amount = formatCurrency(inst2Orig.tax || inst2Orig.total);

            const paidAmt = inst2Paid ? cleanNum(inst2Paid.tax || inst2Paid.total) : 0;
            rec2.amount_paid = formatCurrency(paidAmt);

            const baseAmt = cleanNum(rec2.base_amount);
            const dueAmt = Math.max(0, baseAmt - paidAmt);
            rec2.amount_due = formatCurrency(dueAmt);

            rec2.due_date = formatDate(inst2Orig.date || `03/31/${Number(yr) + 1}`);
            const dueObj2 = new Date(rec2.due_date);
            if (!isNaN(dueObj2.getTime())) {
                dueObj2.setDate(dueObj2.getDate() + 1);
                rec2.delq_date = formatDate(dueObj2);
            } else {
                rec2.delq_date = `04/01/${Number(yr) + 1}`;
            }

            const payKey2 = `${yr}_2`;
            if (paidAmt > 0 && paymentsMap[payKey2]?.date) {
                rec2.paid_date = formatDate(paymentsMap[payKey2].date);
            } else if (paidAmt > 0) {
                rec2.paid_date = formatDate(inst2Paid.date);
            } else {
                rec2.paid_date = "-";
            }

            determineStatus(rec2);
            instRecords.push(rec2);
        }

        const isYearFullyPaid = instRecords.length > 0 && instRecords.every(r => r.status === "Paid");
        allYearsData.push({ year: yr, isFullyPaid: isYearFullyPaid, records: instRecords });
    }

    // Apply Prior Years Tracing Rule
    const finalTaxHistory = [];
    let hasPriorDelinquent = false;

    if (allYearsData.length > 0) {
        const latestYearData = allYearsData[0];
        finalTaxHistory.push(...latestYearData.records);

        if (!latestYearData.isFullyPaid) {
            for (let i = 1; i < allYearsData.length; i++) {
                const priorYear = allYearsData[i];
                if (priorYear.isFullyPaid) {
                    // First paid prior year reached: stop tracing and do not add it!
                    break;
                } else {
                    finalTaxHistory.push(...priorYear.records);
                }
            }
        }

        // Check if any prior years are delinquent/due
        for (let i = 1; i < allYearsData.length; i++) {
            if (!allYearsData[i].isFullyPaid) {
                hasPriorDelinquent = true;
                break;
            }
        }
    }

    // Sort final tax history by year ascending
    finalTaxHistory.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        return yearA - yearB;
    });

    result.tax_history = finalTaxHistory;

    // Generate Notes & Delinquency
    if (allYearsData.length > 0) {
        const latestYear = allYearsData[0].year;
        const latestRecords = finalTaxHistory.filter(r => r.year === latestYear);
        const status1 = latestRecords[0]?.status || "Paid";
        const status2 = latestRecords[1]?.status || "Paid";

        const keys = hasPriorDelinquent ? 0 : 1;
        result.notes = generate_notes(latestYear, keys, status1, status2);
    } else {
        result.notes = "NO TAX HISTORY FOUND, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 09/30 AND 03/31";
    }

    const hasAnyDelinquent = finalTaxHistory.some(r => r.status === "Delinquent");
    result.delinquent = hasAnyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

    return result;
}

// -------------------------------------------------------------
// MAIN ORCHESTRATOR
// -------------------------------------------------------------
const account_search = async (page, url, accountNumber, browser) => {
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", ...timeout_option });

        const q = await searchAccountNumber(accountNumber, page);
        const { parcelInfo, assessorVals } = await getDetails(page, accountNumber, browser);
        const { yearBlocks, paymentsMap } = await getPaymentDetails(page, q);

        const result = populateObject(accountNumber, parcelInfo, assessorVals, yearBlocks, paymentsMap);
        return result;

    } catch (error) {
        console.error("Error inside Polk account_search:", error);
        throw new Error(error.message);
    }
};

// -------------------------------------------------------------
// EXPRESS HANDLER
// -------------------------------------------------------------
const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    if (account) {
        account = String(account).trim();
    }

    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render("error_data", {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://taxsearch.polkcountyiowa.gov/Search";

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["font", "image"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            account_search(page, url, account, browser)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.error("Polk search html error:", error);
                    res.status(200).render("error_data", {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        } else if (fetch_type === "api") {
            account_search(page, url, account, browser)
                .then((data) => {
                    res.status(200).json({ result: data });
                })
                .catch((error) => {
                    console.error("Polk search api error:", error);
                    res.status(500).json({
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        }

    } catch (error) {
        console.error("Polk handler error:", error);
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
    }
};

export { search };