// Author :- Vadiraj Joshi

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import fs from "fs";

const timeout_option = {
    timeout: 90000
};

// --- HARFORD COUNTY INTERNAL HTML DATA SCRAPER PIPELINE ---
const ac_1 = async (page, url, account) => {
    try {
        const cleanPropNo = account.toString().trim().replace(/-/g, '');
        if (cleanPropNo.length !== 8) {
            throw new Error('Invalid format. Property Number must be exactly 8 digits long.');
        }

        // DIRECT URL APPROACH: Fast navigation directly to the property's detail endpoint
        const targetUrl = `${url}?propertyNumber=${cleanPropNo}`;
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

        const errorState = await page.evaluate(() => {
            const text = document.body.innerText;
            return text.includes("We were not able to process your request") ||
                text.includes("Error occurred") ||
                text.includes("No records found") ||
                text.includes("Invalid Property Number");
        });

        if (errorState) {
            throw new Error('Property Number not found on the county website.');
        }

        // SAFE SELECTOR CHECK: Prevents the API from hanging on a TimeoutError if the account is invalid
        try {
            await page.waitForSelector('.customSilverBkgrd', { timeout: 10000 });
        } catch (e) {
            throw new Error('Property Number not found or data table failed to load.');
        }

        // Force click open the "Payment(s)" accordion container to append hidden sub-elements
        await page.evaluate(() => {
            const btn = document.querySelector('#payments_0, .accordion-toggle');
            if (btn) btn.click();
        });

        // Brief timeout pause to guarantee structural elements transition smoothly into active layout views
        await new Promise(res => setTimeout(res, 600));

        const page_content = await page.evaluate((propNoInput) => {
            // --- Extract Base Header Details ---
            const headers = Array.from(document.querySelectorAll('.customSilverBkgrd th')).map(th => th.innerText.trim());
            const cells = document.querySelectorAll('.customSilverBkgrd + tr td');

            let propertyAddress = "";
            let ownerName = "";
            let currentAssessment = "";

            headers.forEach((header, index) => {
                if (cells[index]) {
                    if (header.includes("Property Address:")) {
                        const divs = cells[index].querySelectorAll('div');
                        propertyAddress = Array.from(divs).map(d => d.innerText.trim()).join(', ');
                    } else if (header.includes("Owner(s):")) {
                        ownerName = cells[index].innerText.trim().replace(/\s+/g, ' ');
                    } else if (header.includes("Current Assessment:")) {
                        currentAssessment = cells[index].innerText.trim();
                    }
                }
            });

            const formattedParcel = propNoInput.slice(0, 2) + '-' + propNoInput.slice(2);

            // --- Detect Account Cycle Operational Year ---
            let yearVal = new Date().getFullYear().toString();
            const yearRow = Array.from(document.querySelectorAll('table tbody tr')).find(row => row.innerText.includes("Acount Year:") || row.innerText.includes("Account Year:"));
            if (yearRow) {
                const yearCells = yearRow.querySelectorAll('td');
                if (yearCells.length >= 2) yearVal = yearCells[1].innerText.trim();
            }

            // --- Evaluate Cross-Year Status Identifiers ---
            const bodyText = document.body.innerText;
            const priorYearInt = parseInt(yearVal) - 1;
            const priorYearStr = priorYearInt.toString();
            const isPriorYearPaid = bodyText.includes(`${priorYearStr} - Real Estate Taxes - Paid in Full`);

            // --- Evaluate Layout Scheduling (Semi-Annual vs Standalone Annual Structure) ---
            let isSemiAnnual = false;
            const activePane = document.querySelector('.tab-content .tab-pane.show.active') || document.body;
            if (activePane.id === 'nav-profile' || document.body.innerText.includes("Installment One") || document.body.innerText.includes("Semi-Annual")) {
                isSemiAnnual = true;
            }

            let taxHistoryArray = [];
            const today = new Date();
            let effectivePaymentType = isSemiAnnual ? "Semi-Annual" : "Annual";

            if (isSemiAnnual) {
                // --- SEMI-ANNUAL PARSING BRANCH ---
                let baseAmountOne = "";
                let baseAmountTwo = "";
                let totalPaidFromUi = "$0.00";

                const rows = Array.from(activePane.querySelectorAll('table tbody tr'));
                rows.forEach(row => {
                    const text = row.innerText;
                    const tds = row.querySelectorAll('td');
                    if (tds.length >= 2) {
                        if (text.includes("Installment One")) baseAmountOne = tds[1].innerText.trim();
                        if (text.includes("Installment Two")) baseAmountTwo = tds[1].innerText.trim();
                    }
                });

                const paymentButton = activePane.querySelector('#payments_0');
                if (paymentButton) {
                    const parentTr = paymentButton.closest('tr');
                    if (parentTr) {
                        const targetTd = parentTr.querySelectorAll('td')[1];
                        if (targetTd) totalPaidFromUi = targetTd.innerText.trim();
                    }
                }

                const paymentRows = Array.from(activePane.querySelectorAll('#semipayments .row, .accordian-body .row, #annualpayments .row'));
                let processedPayments = [];

                paymentRows.forEach(pRow => {
                    const dateDiv = pRow.querySelector('.align_payments');
                    const amtDiv = pRow.querySelectorAll('div')[1];
                    if (dateDiv && amtDiv) {
                        processedPayments.push({
                            date: dateDiv.innerText.replace(/[•\s]/g, '').trim(),
                            amount: amtDiv.innerText.trim()
                        });
                    }
                });

                const numOne = parseFloat((baseAmountOne || "").replace(/[^0-9.]/g, '')) || 0;
                const numTwo = parseFloat((baseAmountTwo || "").replace(/[^0-9.]/g, '')) || 0;
                const numTotalPaid = parseFloat((totalPaidFromUi || "").replace(/[^0-9.]/g, '')) || 0;
                const combinedInstallmentsSum = numOne + numTwo;

                if (processedPayments.length === 1 && numTotalPaid > 0 && Math.abs(numTotalPaid - combinedInstallmentsSum) < 0.05) {
                    effectivePaymentType = "Annual";
                    const dueStr = `09/30/${parseInt(yearVal) - 1}`;
                    const delqStr = `10/01/${parseInt(yearVal) - 1}`;

                    taxHistoryArray.push({
                        jurisdiction: "County",
                        year: yearVal,
                        payment_type: "Annual",
                        status: "Paid",
                        base_amount: totalPaidFromUi,
                        amount_paid: totalPaidFromUi,
                        amount_due: "$0.00",
                        mailing_date: "",
                        due_date: dueStr,
                        delq_date: delqStr,
                        paid_date: processedPayments[0].date || dueStr,
                        good_through_date: ""
                    });
                } else {
                    const payOne = processedPayments[0] || { date: "", amount: "" };
                    const payTwo = processedPayments[1] || { date: "", amount: "" };

                    const dueOneStr = `09/30/${parseInt(yearVal) - 1}`;
                    const delqOneStr = `10/01/${parseInt(yearVal) - 1}`;
                    let statusOne = "Due";

                    if (payOne.amount) {
                        statusOne = "Paid";
                    } else if (today > new Date(dueOneStr)) {
                        statusOne = "Delinquent";
                    }

                    taxHistoryArray.push({
                        jurisdiction: "County",
                        year: yearVal,
                        payment_type: "Semi-Annual",
                        status: statusOne,
                        base_amount: baseAmountOne,
                        amount_paid: payOne.amount || "$0.00",
                        amount_due: statusOne === "Paid" ? "$0.00" : baseAmountOne,
                        mailing_date: "",
                        due_date: dueOneStr,
                        delq_date: delqOneStr,
                        paid_date: payOne.date || "",
                        good_through_date: ""
                    });

                    const dueTwoStr = `12/31/${parseInt(yearVal) - 1}`;
                    const delqTwoStr = `01/01/${yearVal}`;
                    let statusTwo = "Due";

                    if (payTwo.amount) {
                        statusTwo = "Paid";
                    } else if (today > new Date(dueTwoStr)) {
                        statusTwo = "Delinquent";
                    }

                    taxHistoryArray.push({
                        jurisdiction: "County",
                        year: yearVal,
                        payment_type: "Semi-Annual",
                        status: statusTwo,
                        base_amount: baseAmountTwo,
                        amount_paid: payTwo.amount || "$0.00",
                        amount_due: statusTwo === "Paid" ? "$0.00" : baseAmountTwo,
                        mailing_date: "",
                        due_date: dueTwoStr,
                        delq_date: delqTwoStr,
                        paid_date: payTwo.date || "",
                        good_through_date: ""
                    });
                }
            } else {
                // --- ANNUAL TAB PARSING BRANCH ---
                effectivePaymentType = "Annual";
                const annualPane = document.querySelector('#nav-home') || activePane;
                let annualBase = "";
                let annualPaid = "$0.00";
                let annualDue = "$0.00";
                let annualPaidDate = "";

                const rows = Array.from(annualPane.querySelectorAll('table tbody tr'));
                rows.forEach(row => {
                    const tds = row.querySelectorAll('td');
                    if (tds.length >= 2) {
                        if (row.innerText.includes("Annual Installment")) annualBase = tds[1].innerText.trim();
                        if (row.innerText.includes("Total Due")) annualDue = tds[1].innerText.trim();
                    }
                });

                const paymentButton = annualPane.querySelector('button[id^="payments_"], button');
                if (paymentButton && paymentButton.innerText.includes("Payment(s)")) {
                    const parentTr = paymentButton.closest('tr');
                    if (parentTr) {
                        const targetTd = parentTr.querySelectorAll('td')[1];
                        if (targetTd) annualPaid = targetTd.innerText.trim();
                    }
                }

                if (annualPaid === "$0.00") {
                    const paymentRow = annualPane.querySelector('#annualpayments .row');
                    if (paymentRow) {
                        const divs = paymentRow.querySelectorAll('div');
                        if (divs.length >= 2) {
                            annualPaid = divs[1].innerText.trim();
                        }
                    }
                }

                const firstPaymentLine = annualPane.querySelector('#annualpayments .row, .accordian-body .row');
                if (firstPaymentLine) {
                    const dateDiv = firstPaymentLine.querySelector('.align_payments');
                    if (dateDiv) annualPaidDate = dateDiv.innerText.replace(/[•\s]/g, '').trim();
                }

                const dueStr = `09/30/${parseInt(yearVal) - 1}`;
                const delqStr = `10/01/${parseInt(yearVal) - 1}`;
                let annualStatus = "Due";

                const cleanAnnualDue = parseFloat(annualDue.replace(/[^0-9.]/g, '')) || 0;

                if (cleanAnnualDue === 0) {
                    annualStatus = "Paid";             //edge case paid 0 due 0 || case of education account of county
                } else if (today > new Date(dueStr) || cleanAnnualDue > 0) {
                    annualStatus = "Delinquent";
                }

                let finalBaseAmount = annualBase || "$0.00";
                if ((finalBaseAmount === "$0.00" || finalBaseAmount === "") && annualPaid !== "$0.00") {
                    const firstAccordionRow = annualPane.querySelector('#annualpayments .row, .accordian-body .row');
                    if (firstAccordionRow) {
                        const amtDiv = firstAccordionRow.querySelectorAll('div')[1];
                        if (amtDiv) finalBaseAmount = amtDiv.innerText.trim();
                    }
                }

                taxHistoryArray.push({
                    jurisdiction: "County",
                    year: yearVal,
                    payment_type: "Annual",
                    status: annualStatus,
                    base_amount: finalBaseAmount,
                    amount_paid: annualPaid,
                    amount_due: annualDue,
                    mailing_date: "",
                    due_date: dueStr,
                    delq_date: delqStr,
                    paid_date: annualPaidDate || (annualStatus === "Paid" ? dueStr : ""),
                    good_through_date: ""
                });
            }

            // --- Dynamic Notes & Delinquency Calculations ---
            const isAnyDelinquent = taxHistoryArray.some(history => history.status === "Delinquent");
            const delinquentStatus = isAnyDelinquent ? "PRIORS ARE DELINQUENT NEED TO CALL FOR PAYOFF" : "NONE";
            const basePaymentType = (effectivePaymentType === "Semi-Annual") ? "SEMI ANNUALLY" : "ANNUALLY";

            let dynamicDueDatesNote = "";
            if (effectivePaymentType === "Semi-Annual" && taxHistoryArray.length >= 2) {
                const shortDueOne = taxHistoryArray[0].due_date.slice(0, 5);
                const shortDueTwo = taxHistoryArray[1].due_date.slice(0, 5);
                dynamicDueDatesNote = `NORMAL DUE DATES ARE ${shortDueOne} AND ${shortDueTwo}`;
            } else if (taxHistoryArray[0]) {
                const shortDueOne = taxHistoryArray[0].due_date.slice(0, 5);
                dynamicDueDatesNote = `NORMAL DUE DATE IS ${shortDueOne}`;
            }

            let generatedNotes = "";
            if (isSemiAnnual && taxHistoryArray.length >= 2) {
                const statusOne = taxHistoryArray[0].status.toUpperCase();
                const statusTwo = taxHistoryArray[1].status.toUpperCase();
                const statusString = `${yearVal} 1ST INSTALLMENT IS ${statusOne}, 2ND INSTALLMENT IS ${statusTwo}`;

                if (isAnyDelinquent) {
                    if (isPriorYearPaid) {
                        generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    } else {
                        generatedNotes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    }
                } else {
                    generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                }
            } else {
                if (isAnyDelinquent) {
                    if (isPriorYearPaid) {
                        generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    } else {
                        generatedNotes = `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    }
                } else {
                    generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                }
            }


            // --- Sort Tax History ---
            // 1. Sort by Year (Ascending)
            // 2. If the Year is the same, sort by Due Date (Ascending)
            taxHistoryArray.sort((a, b) => {
                const yearA = parseInt(a.year, 10) || 0;
                const yearB = parseInt(b.year, 10) || 0;

                // Compare the years first
                if (yearA !== yearB) {
                    return yearA - yearB;
                }

                // If years are identical (e.g., Semi-Annual installments), sort by due date
                const dateA = new Date(a.due_date).getTime() || 0;
                const dateB = new Date(b.due_date).getTime() || 0;

                return dateA - dateB;
            });
            return {
                processed_date: "",
                order_number: "",
                borrower_name: "",
                owner_name: ownerName ? [ownerName] : ["N/A"], //  Fixed: Wrapped in an array for frontend .join()
                property_address: propertyAddress || "",
                parcel_number: formattedParcel,
                land_value: "",
                improvements: "",
                total_assessed_value: currentAssessment || "",
                exemption: "",
                total_taxable_value: currentAssessment || "",
                taxing_authority: "Harford County, MD",
                notes: generatedNotes,
                delinquent: delinquentStatus,
                tax_history: taxHistoryArray
            };
        }, cleanPropNo);

        return page_content;
    } catch (error) {
        console.error("Harford County ac_1 Internal Method Error: ", error);
        throw error;
    }
};

const account_search = async (page, url, account) => {
    try {
        const data = await ac_1(page, url, account);
        return data;
    } catch (error) {
        console.error("Pipeline failure: ", error);
        throw error;
    }
};

// -------------------------------------------------------------------------------------------------------------------------------------------------
// DO NOT TOUCH OR UPDATE THE CODE BELOW THIS BOX - SEARCH METHOD MANAGES CHROMIUM INSTANTIATION ENVIRONMENT AND ROUTING
// -------------------------------------------------------------------------------------------------------------------------------------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://hcgweb01.harfordcountymd.gov/billpay/Account/Detail";

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            // FRONTEND ENDPOINT
            account_search(page, url, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error)
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
            // API ENDPOINT
            account_search(page, url, account)
                .then((data) => {
                    res.status(200).json({
                        result: data
                    });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        }

    }
    catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}

export {
    search
}

// Test cases and  Edge Cases found

// 02022605         // annual correct test case
// 03321150         // semi annual correct test case  -> paid 2 installments seperately

// 06081509         // delinquent        =========      TAX SALE       =========
// 01045040         // annual pay with penality
// 03015297         // semi annually but paid annually
// 05009200         // semi annually but paid annually
// 03002217         // paid $0.00 due $0.00
// 05010233         // paid and again paid penality 
// 05028132         // semi annualy shown amount different paid different + penality 


// 06018602         delinquent

// 01000276         delinquent
