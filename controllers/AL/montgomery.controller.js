// Author:- Bhagyashree Badadal

// In this county currently we are considering only Real Property Taxes, but we also have Personal Property, which as of now we are not considering.

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000,
};

const formatCurrency = (amount) => {
    if (!amount || amount === "N/A" || amount === "-") return "$0.00";
    let num = String(amount).replace(/[$,]/g, "").trim();
    if (isNaN(num) || num === "") return "$0.00";
    let formatted = parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return "$" + formatted;
};

const formatDate = (dateStr) => {
    if (!dateStr || dateStr === "N/A" || dateStr === "-") return "N/A";
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    let month = ("0" + (d.getMonth() + 1)).slice(-2);
    let day = ("0" + d.getDate()).slice(-2);
    let year = d.getFullYear();
    return `${month}/${day}/${year}`;
};

const generate_notes = (year, status, dueDate, hasDelinquent) => {
    let notes = hasDelinquent
        ? `PRIOR TAXES ARE DELINQUENT, ${year} `
        : `ALL PRIORS ARE PAID, ${year} `;

    notes += `TAXES ARE ${status.toUpperCase()}, `;
    notes += `NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS ${dueDate.substring(0, 5)}`;
    return notes;
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
        total_assessed_value: "N/A",
        exemption: "",
        total_taxable_value: "N/A",
        taxing_authority: "Montgomery County Revenue Commissioner, 100 S. Lawrence St., Montgomery, AL 36104",
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
        paid_date: "",
        good_through_date: "-",
    };
}

async function searchAccountNumber(page, accountNumber) {
    const propertyLinkId = "#PTCInfo";
    await page.waitForSelector(propertyLinkId, timeout_option);
    await page.click(propertyLinkId);

    const iframeSelector = "#Iframe1";
    await page.waitForSelector(iframeSelector, timeout_option);
    await new Promise(resolve => setTimeout(resolve, 2000));

    let iframeHandle = await page.$(iframeSelector);
    let frame = await iframeHandle.contentFrame();
    if (!frame) {
        throw new Error("Could not access the content inside #Iframe1.");
    }

    const searchByParcelId = "#SearchByParcel";
    await frame.waitForSelector(searchByParcelId, timeout_option);
    await frame.click(searchByParcelId);

    const searchInputId = "#SearchText";
    await frame.waitForSelector(searchInputId, timeout_option);
    await frame.click(searchInputId, { clickCount: 3 });
    await frame.type(searchInputId, accountNumber, { delay: 50 });

    const searchButtonId = "#Search";
    await frame.waitForSelector(searchButtonId, timeout_option);

    await frame.click(searchButtonId);
    await new Promise(resolve => setTimeout(resolve, 3000));

    //refetch the frame reference after the click
    iframeHandle = await page.$(iframeSelector);
    const activeFrame = await iframeHandle.contentFrame();
    if (!activeFrame) {
        throw new Error("Could not re-verify #Iframe1 content frame after searching.");
    }

    // store initial year
    const originalTaxYear = await activeFrame.evaluate(() => {
        const taxYearDropdown = document.querySelector('#TaxYear');
        return taxYearDropdown ? taxYearDropdown.value : null;
    });

    // get due amount of initial year
    const totalDue = await activeFrame.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('td'));
        const leafTds = cells.filter(td => !td.querySelector('table'));
        const targetCell = leafTds.find(td => td.textContent.includes('TOTAL DUE:'));
        if (targetCell) {
            const valueCell = targetCell.nextElementSibling;
            return valueCell ? valueCell.textContent.trim() : null;
        }
        return null;
    });

    // if due is N/A, then move to year-1 from drop down entity
    if (totalDue === null || totalDue === "NA" || totalDue === "PLEASE CONTACT COUNTY") {
        let currentDropdownYear = await activeFrame.evaluate(() => {
            const select = document.querySelector("#TaxYear");
            return select ? select.value : null;
        });
        if (currentDropdownYear) {
            const targetYear = String(parseInt(currentDropdownYear, 10) - 1);
            try {
                await activeFrame.select('#TaxYear', targetYear);
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (dropdownError) {
                console.log(dropdownError);
            }
        }
    }

    // store the year, of which we can get values of baseAmount, due, paid etc.
    const newTaxYear = await activeFrame.evaluate(() => {
        const taxYearDropdown = document.querySelector('#TaxYear');
        return taxYearDropdown ? taxYearDropdown.value : null;
    });

    // get the base, due, paid values
    const taxData = await activeFrame.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('td'));
        // This stops wrapper tables from matching the string and failing the nextElementSibling check.
        const leafTds = cells.filter(td => !td.querySelector('table'));
        const cleanText = (text) => text ? text.replace(/[\u00A0\s]+/g, ' ').trim() : "";
        const extractAmount = (label) => {
            const targetCell = leafTds.find(td => cleanText(td.textContent).includes(label));
            if (targetCell && targetCell.nextElementSibling) {
                const rawValueText = cleanText(targetCell.nextElementSibling.textContent);
                const match = rawValueText.match(/\$[\d,]+\.\d{2}/);
                return match ? match[0] : rawValueText;
            }
            return "$0.00";
        };
        let baseAmount = extractAmount('TOTAL TAX:');
        let paidAmount = extractAmount('PAID:');
        let dueAmount = extractAmount('TOTAL DUE:');

        // handling a edge case where sometimes we wont get numeric values of base, due, paid
        if (baseAmount === 'TAX SALE') baseAmount = '***';
        if (paidAmount === '***') paidAmount = '***';
        if (dueAmount === 'PLEASE CONTACT COUNTY') dueAmount = '***';
        return { baseAmount, paidAmount, dueAmount };
    });
    const { baseAmount, paidAmount, dueAmount } = taxData;

    // now goback to the initial year where due was "N/A", because only that year enables navigation to main page of that parcel ID.
    await activeFrame.select('#TaxYear', originalTaxYear);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // click on the parcel-ID link
    const parcelIdSelector = "#BodyTable > tbody > tr > td > fieldset > legend > span";
    await activeFrame.waitForSelector(parcelIdSelector, timeout_option);
    await activeFrame.click(parcelIdSelector);
    return {
        frame: activeFrame,
        newTaxYear,
        taxDetails: { baseAmount, paidAmount, dueAmount }
    };
}

async function mainPageOfParcelId(page, frame, newTaxYear) {
    // Parent iframe:- IFrame 1, that has child1 iframe:- Iframe2 and child2 iframe:-Iframe1
    // get Iframe2 to get property details
    const childIframeHandle1 = await frame.waitForSelector('#Iframe2', timeout_option);
    let childFrame1 = await childIframeHandle1.contentFrame();
    if (!childFrame1) {
        throw new Error("Could not access the content inside #Iframe2.");
    }
    // changing the year from drop-down
    await childFrame1.select('#YearDDL', newTaxYear);
    await new Promise(resolve => setTimeout(resolve, 3000));
    const extractPropertyData = async (targetFrame) => {
        return await targetFrame.evaluate(() => {
            const getNextColumnValue = (labelText) => {
                const allTds = Array.from(document.querySelectorAll('td'));
                const leafTds = allTds.filter(td => !td.querySelector('table'));
                const labelTd = leafTds.find(td => td.textContent.trim() === labelText);
                if (labelTd && labelTd.nextElementSibling) {
                    return labelTd.nextElementSibling.textContent.replace(/\s+/g, ' ').trim();
                }
                return "N/A";
            };
            return {
                parcelID: getNextColumnValue("PARCEL #:"),
                owner: getNextColumnValue("OWNER:"),
                location: getNextColumnValue("LOCATION:")
            };
        });
    };
    const propertyDetails = await extractPropertyData(childFrame1);

    // get back the parent iframe reference
    const parentIframeHandle = await page.$("#Iframe1");
    const activeParentFrame = await parentIframeHandle.contentFrame();
    return { parentFrame: activeParentFrame, propertyDetails };
}

async function parseDataOfMainPage(frame) {
    // get second child refernce to parse assessed and payment information
    const childIframeHandle2 = await frame.waitForSelector('#Iframe1', timeout_option);
    const childFrame2 = await childIframeHandle2.contentFrame();
    if (!childFrame2) {
        throw new Error("Could not access the content inside child #Iframe1 of parent frame.");
    }

    // get assessed value from "TAX INFO" legend
    const taxInfoData = await childFrame2.evaluate(() => {
        const legends = Array.from(document.querySelectorAll('legend'));
        const taxInfoLegend = legends.find(legend => legend.textContent.trim() === 'TAX INFO');
        if (!taxInfoLegend) return { assessedValue: null };
        const fieldset = taxInfoLegend.closest('fieldset');
        const rows = Array.from(fieldset.querySelectorAll('table tbody tr'));
        const finalSummaryRow = rows[rows.length - 1];
        if (finalSummaryRow) {
            const cells = finalSummaryRow.querySelectorAll('td');
            const assdText = cells[0] ? cells[0].textContent.trim() : '';
            const assessedValue = assdText.includes(':') ? assdText.split(':')[1].trim() : null;
            return { assessedValue };
        }
        return { assessedValue: null };
    });

    // get payment info from "PAYMENT INFO" legend
    const paidInfo = await childFrame2.evaluate(() => {
        const legends = Array.from(document.querySelectorAll("legend"));
        const paymentInfoLegend = legends.find(legend => legend.textContent.trim() === "PAYMENT INFO");
        if (!paymentInfoLegend) return { paidDate: "N/A", taxYear: "N/A", paidAmount: "$0.00" };
        const fieldset = paymentInfoLegend.closest("fieldset");
        const rows = Array.from(fieldset.querySelectorAll("table tbody tr"));
        const firstRow = rows[1];
        if (firstRow) {
            const cells = firstRow.querySelectorAll("td");
            const paidDate = cells[0] ? cells[0].textContent.trim() : "N/A";
            const taxYear = cells[1] ? cells[1].textContent.trim() : "N/A";
            const paidAmount = cells[3] ? cells[3].textContent.trim() : "$0.00";
            return { paidDate, taxYear, paidAmount };
        }
        return { paidDate: "N/A", taxYear: "N/A", paidAmount: "$0.00" };
    });
    return { taxInfoData, paidInfo };
}

const account_search = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });
            const cleanAccountNumber = account.replace(/\s/g, "");
            const searchObj = await searchAccountNumber(page, cleanAccountNumber);
            const decisionObj = await mainPageOfParcelId(page, searchObj.frame, searchObj.newTaxYear);
            const dataObj = await parseDataOfMainPage(decisionObj.parentFrame);

            const { propertyDetails } = decisionObj;
            const { taxInfoData, paidInfo } = dataObj;

            const result = createPropertyObject();
            result.parcel_number = cleanAccountNumber;
            result.owner_name = propertyDetails.owner ? [propertyDetails.owner] : ["N/A"];
            result.property_address = propertyDetails.location || "N/A";
            if(taxInfoData.assessedValue === null) {
                result.total_assessed_value = "N/A";
                result.total_taxable_value = "N/A";
            } else {
                result.total_assessed_value = formatCurrency(taxInfoData.assessedValue);
                result.total_taxable_value = result.total_assessed_value;
            }
            const record = createTaxHistory();
            // As of now both these years are matching, in future we can handle mismatch years in else{} if exists..
            if (searchObj.newTaxYear === paidInfo.taxYear) {
                record.year = paidInfo.taxYear;
                if (searchObj.taxDetails.baseAmount !== "***")
                    record.base_amount = formatCurrency(searchObj.taxDetails.baseAmount);
                else record.base_amount = formatCurrency(paidInfo.paidAmount);
                record.amount_paid = formatCurrency(paidInfo.paidAmount);
                record.paid_date = formatDate(paidInfo.paidDate);
            }
            if (searchObj.taxDetails.dueAmount !== "***") record.amount_due = formatCurrency(searchObj.taxDetails.dueAmount);

            record.due_date = formatDate(`10/01/${record.year}`);
            const nextYear = parseInt(record.year, 10) + 1;
            record.delq_date = formatDate(`01/01/${nextYear}`);

            // status calculation
            if (record.amount_due === "$0.00") {
                record.status = "Paid";
            } else {
                const today = new Date();
                const dueDateObj = new Date(record.due_date);

                if (today <= dueDateObj) {
                    record.status = "Due";
                } else {
                    record.status = "Delinquent";
                }
                record.amount_due = record.base_amount;
            }
            result.tax_history.push(record);

            // sorting of records in ascending order of year, and for same year paid as first one to sit on top
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

            // deciding the notes and delinquent
            if (result.tax_history.length > 0) {
                const hasDelinquent = result.tax_history.some(
                    (t) => t.status === "Delinquent"
                );
                result.delinquent = hasDelinquent
                    ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                    : "NONE";

                const latestTax = result.tax_history[result.tax_history.length - 1];
                result.notes = generate_notes(
                    latestTax.year,
                    latestTax.status,
                    latestTax.due_date,
                    hasDelinquent
                );
            }
            resolve(result);

        } catch (error) {
            console.log("Error inside account_search:", error);
            reject(new Error(error.message));
        }
    });
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    let context;
    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const url = "https://montgomery.capturecama.com/";

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
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

        if (fetch_type === "html") {
            // FRONTEND ENDPOINT
            account_search(page, url, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error);
                    res.status(200).render('error_data', {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => { await context.close(); });
        } else if (fetch_type === "api") {
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
                .finally(async () => { await context.close(); });
        }

    } catch (error) {
        console.log("Error inside search:", error);
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
        };
    }
}

export { search };