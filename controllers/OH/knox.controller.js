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
        owner_name: [],
        property_address: "",
        parcel_number: "",
        land_value: "",
        improvements: "",
        total_assessed_value: "",
        exemption: "",
        total_taxable_value: "",
        taxing_authority: "Knox County Auditor, 117 E High St, Suite 120, Mount Vernon, OH 43050",
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

// for notes generation
const generate_notes = (year, keys, status1, status2) => {
    let notes = "";
    try {
        const s1 = (status1 || "PAID").toUpperCase();
        const s2 = (status2 || "PAID").toUpperCase();
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE 02/13 AND 08/26`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// async function searchAccountNumber(accountNumber, page) {
//     const inputSelector = "#ctlBodyPane_ctl03_ctl01_txtParcelID";
//     await page.waitForSelector(inputSelector, timeout_option);
//     await page.type(inputSelector, accountNumber);

//     const btnSelector = "#ctlBodyPane_ctl03_ctl01_btnSearch";
//     await page.waitForSelector(btnSelector, timeout_option);
//     await Promise.all([
//         page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
//         page.click(btnSelector),
//     ]);
// }

async function getDetails(page) {
    await page.waitForSelector("#ctlBodyPane_ctl01_ctl01_lstReport th", timeout_option);

    const scrapedData = await page.evaluate(() => {
        // Helper: Convert "$1,973.09" -> 1973.09
        function parseCurrency(str) {
            if (!str) return 0;
            const clean = str.replace(/[^0-9.-]/g, "");
            const num = parseFloat(clean);
            return isNaN(num) ? 0 : num;
        }

        // Helper: Convert 1973.09 -> "$1,973.09"
        function formatCurrency(num) {
            return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        // 1. Owner Name
        const ownerEl = document.querySelector("#ctlBodyPane_ctl01_ctl01_lstReport th");
        const ownerName = ownerEl ? ownerEl.innerText.trim() : "N/A";

        // 2. Property Address
        const addressEl = document.querySelector('span[editkey*="LocationAddress"]');
        const propertyAddress = addressEl ? addressEl.innerText.trim() : "N/A";

        // 3. Assessed Value (Ohio Beacon uses "Total Value (Assessed 35%)")
        let assessedValue = "";
        const valRows = document.querySelectorAll("#ctlBodyPane_ctl05_ctl01_grdValuation_grdYearData tr");
        valRows.forEach((row) => {
            const th = row.querySelector("th");
            const td = row.querySelector("td.value-column, td");
            if (th && td && th.innerText.includes("Total Value (Assessed 35%)")) {
                assessedValue = td.innerText.trim();
            }
        });
        if (!assessedValue) {
            valRows.forEach((row) => {
                const th = row.querySelector("th");
                const td = row.querySelector("td.value-column, td");
                if (th && td && th.innerText.includes("Total Value (Appraised 100%)")) {
                    assessedValue = td.innerText.trim();
                }
            });
        }

        // 4. Tax History: Recent tax year, 1st & 2nd installment amounts and balance due
        const taxHistoryRows = document.querySelectorAll("#ctlBodyPane_ctl14_ctl01_grdTaxHistory tbody tr");
        let recentTaxYear = "";
        let firstHalfAmtTotal = 0;
        let firstHalfBalDueTotal = 0;
        let secondHalfAmtTotal = 0;
        let secondHalfBalDueTotal = 0;

        // Detect most recent tax year from the first data row (e.g. "2025 Pay 2026")
        if (taxHistoryRows.length > 0) {
            const firstRowTh = taxHistoryRows[0].querySelector("th");
            if (firstRowTh) {
                recentTaxYear = firstRowTh.innerText.trim();
            }
        }

        taxHistoryRows.forEach((row) => {
            const th = row.querySelector("th");
            const cells = row.querySelectorAll("td");
            if (!th || cells.length < 5) return;

            const rowYear = th.innerText.trim();
            if (rowYear !== recentTaxYear) return;

            const description = cells[2] ? cells[2].innerText.trim().toLowerCase() : "";
            const amount = parseCurrency(cells[3]?.innerText);
            const balDue = parseCurrency(cells[4]?.innerText);

            if (description.includes("1st half")) {
                firstHalfAmtTotal += amount;
                firstHalfBalDueTotal += balDue;
            } else if (description.includes("2nd half")) {
                secondHalfAmtTotal += amount;
                secondHalfBalDueTotal += balDue;
            }
        });

        // 5. Payments: Extract paid date for 1st half and 2nd half
        const paymentRows = document.querySelectorAll("#ctlBodyPane_ctl16_ctl01_grdPayments tbody tr");
        let firstHalfPaidDate = "N/A";
        let secondHalfPaidDate = "N/A";
        let firstHalfPaidTotal = 0;
        let secondHalfPaidTotal = 0;

        paymentRows.forEach((row) => {
            const th = row.querySelector("th");
            const cells = row.querySelectorAll("td");
            if (!th || cells.length < 6) return;

            const rowYear = th.innerText.trim();
            if (rowYear !== recentTaxYear) return;

            const effectiveDate = cells[0] ? cells[0].innerText.trim() : "";
            const fhPaid = parseCurrency(cells[3]?.innerText);
            const shPaid = parseCurrency(cells[4]?.innerText);

            if (fhPaid > 0) {
                firstHalfPaidDate = effectiveDate;
                firstHalfPaidTotal += fhPaid;
            }
            if (shPaid > 0) {
                secondHalfPaidDate = effectiveDate;
                secondHalfPaidTotal += shPaid;
            }
        });

        // Clean tax year: keep only the first year (e.g. "2025" from "2025 Pay 2026")
        const baseTaxYear = recentTaxYear.split(/\s+/)[0] || recentTaxYear;

        return {
            ownerName,
            propertyAddress,
            assessedValue,
            rawTaxYear: recentTaxYear,
            taxYear: baseTaxYear,
            firstHalf: {
                amount: formatCurrency(firstHalfAmtTotal),
                balDue: formatCurrency(firstHalfBalDueTotal),
                paidDate: firstHalfPaidDate,
                amountPaid: formatCurrency(firstHalfPaidTotal),
            },
            secondHalf: {
                amount: formatCurrency(secondHalfAmtTotal),
                balDue: formatCurrency(secondHalfBalDueTotal),
                paidDate: secondHalfPaidDate,
                amountPaid: formatCurrency(secondHalfPaidTotal),
            },
        };
    });

    return scrapedData;
}

async function populateTheObject(accountNumber, scrapedData) {
    const property = createPropertyObject();

    const taxYear = scrapedData.taxYear; // "2025" (without "Pay 2026")

    property.processed_date = new Date().toISOString().split("T")[0];
    property.parcel_number = accountNumber;
    property.owner_name = [scrapedData.ownerName];
    property.property_address = scrapedData.propertyAddress;
    property.total_assessed_value = scrapedData.assessedValue;
    property.total_taxable_value = scrapedData.assessedValue;
    property.taxing_authority = "Frederick County Treasury Department, 30 N Market St #3 Frederick, MD 21701";

    // Determine collection year for due dates (e.g. from "2025 Pay 2026" -> 2026, or 2025 + 1)
    let collectionYear = parseInt(taxYear, 10) + 1;
    if (scrapedData.rawTaxYear) {
        const payMatch = scrapedData.rawTaxYear.match(/Pay\s+(\d{4})/i);
        if (payMatch) {
            collectionYear = parseInt(payMatch[1], 10);
        }
    }

    // Helper: format "2/13/2026" -> "02/13/2026"
    function formatToDate(dateStr) {
        if (!dateStr || dateStr === "N/A" || dateStr === "-") return "";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
    }

    // Helper: calculate installment status based on amount due and delinquent date
    function getStatus(amountDueStr, delqDateStr) {
        const bal = parseFloat(amountDueStr.replace(/[$,]/g, "")) || 0;
        if (bal === 0) return "Paid";
        const today = new Date();
        const delqDateObj = new Date(delqDateStr);
        return today >= delqDateObj ? "Delinquent" : "Due";
    }

    // --- Installment 1 (1st Half) ---
    // Due February 13 → Delinquent February 14 of next year (2026)
    const inst1 = createTaxHistory();
    inst1.year = taxYear;
    inst1.payment_type = "Installment 1";
    inst1.due_date = `02/13/${collectionYear}`;
    inst1.delq_date = `02/14/${collectionYear}`;
    inst1.base_amount = scrapedData.firstHalf.amount;
    inst1.amount_paid = scrapedData.firstHalf.amountPaid !== "$0.00" ? scrapedData.firstHalf.amountPaid : scrapedData.firstHalf.amount;
    inst1.amount_due = scrapedData.firstHalf.balDue;
    inst1.status = getStatus(inst1.amount_due, inst1.delq_date);
    inst1.paid_date = formatToDate(scrapedData.firstHalf.paidDate);

    // --- Installment 2 (2nd Half) ---
    // Due August 26 → Delinquent August 27 of next year (2026)
    const inst2 = createTaxHistory();
    inst2.year = taxYear;
    inst2.payment_type = "Installment 2";
    inst2.due_date = `08/26/${collectionYear}`;
    inst2.delq_date = `08/27/${collectionYear}`;
    inst2.base_amount = scrapedData.secondHalf.amount;
    inst2.amount_paid = scrapedData.secondHalf.amountPaid !== "$0.00" ? scrapedData.secondHalf.amountPaid : scrapedData.secondHalf.amount;
    inst2.amount_due = scrapedData.secondHalf.balDue;
    inst2.status = getStatus(inst2.amount_due, inst2.delq_date);
    inst2.paid_date = formatToDate(scrapedData.secondHalf.paidDate);

    // Push installments to tax_history array
    property.tax_history.push(inst1, inst2);

    // sort the records
    property.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) {
            return yearA - yearB;
        }
        if (a.status === "Paid" && b.status !== "Paid") return -1;
        if (a.status !== "Paid" && b.status === "Paid") return 1;
        return 0;
    });

    // decide the delinquency and notes
    if (property.tax_history.length > 0) {
        // Check if ANY tax is delinquent for the main delinquency flag
        const hasDelinquent = property.tax_history.some(
            (t) => t.status === "Delinquent"
        );
        property.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        // Check if any PRIOR year is delinquent (exclude current taxYear)
        const hasPriorDelinquent = property.tax_history.some(
            (t) => t.status === "Delinquent" && String(t.year) !== String(taxYear)
        );

        // If priors are delinquent, keys = 0. If priors are paid, keys = 1.
        const keys = hasPriorDelinquent ? 0 : 1;

        // Pass each installment's status separately
        property.notes = generate_notes(taxYear, keys, inst1.status, inst2.status);
    }

    return property;
}

// Main flows starts from here
const account_search = async (page, url, accountNumber) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // Click Agree button on the Terms and Conditions popup
        await page.waitForSelector("a.btn-primary.button-1", timeout_option);
        await page.click("a.btn-primary.button-1");

        // Search by account number
        // await searchAccountNumber(accountNumber, page);

        // Scrape details from the report page
        const scrapedData = await getDetails(page);

        // Populate and output the standard property object
        const result = await populateTheObject(accountNumber, scrapedData);
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
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = `https://beacon.schneidercorp.com/Application.aspx?AppID=1124&LayerID=28285&PageTypeID=2&PageID=11640&KeyValue=${accountNumber}`;

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'font' || req.resourceType() === 'image') {
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
                    res.status(200).render('error_data', {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        }
        else if (fetch_type == "api") {
            account_search(page, url, account)
                .then((data) => {
                    res.status(200).json({
                        result: data
                    });
                })
                .catch((error) => {
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
        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        } else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}

export {
    search
};