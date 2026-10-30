// Author :- Bhagyashree Badadal

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000,
};

function createPropertyObject() {
    return {
        processed_date: "",
        order_number: "",
        borrower_name: "",
        owner_name: "",
        property_address: "",
        parcel_number: "",
        land_value: "",
        improvements: "",
        total_assessed_value: "",
        exemption: "",
        total_taxable_value: "",
        taxing_authority: "Wasco County Assessment & Taxation Department, 511 Washington St, Suite 208, The Dalles, OR 97058",
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
        paid_date: "N/A",
        good_through_date: "-",
    };
}

// Formatting the date
function formatToUSADate(dateInput) {
    const strInput = String(dateInput || "");
    if (!strInput || strInput.toUpperCase() === "N/A") return "N/A";
    const d = new Date(strInput);
    if (isNaN(d.getTime())) return strInput;
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
}


// Notes generation
const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID, ${year} `
                : `PRIORS ARE DELINQUENT, ${year} `;
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE 11/15, 02/15 AND 05/15`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// For searching parcel-ID 
async function searchAccountNumber(page, accountNumber) {
    const searchIdSelector = "#mParcelID2";
    await page.waitForSelector(searchIdSelector);
    await page.type(searchIdSelector, accountNumber);

    const searchButtonSelector = "#mSubmit";
    await page.waitForSelector(searchButtonSelector);
    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }),
        page.click(searchButtonSelector)
    ]);
}

// For searching ownerName
async function searchOwnerName(page, account) {
    const addressSelector = "#mSitusAddress";
    await page.waitForSelector(addressSelector);

    const address = await page.$eval(addressSelector, el =>
        el.textContent.replace(/\s+/g, ' ').replace(/\s+,\s*/g, ', ').trim()
    );

    // extract the address details from the one single text
    const parts = address.split(",").map(part => part.trim());
    const [street, city, stateZip] = parts;
    const stateZipMatch = stateZip ? stateZip.match(/([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/) : null;

    await page.goto("https://public.co.wasco.or.us/webtax/(S(hlozrpl1phz0kiqhkr5tvizw))/default.aspx", { waitUntil: "networkidle2" });

    const streetSelector = "#mStreetAddress";
    await page.waitForSelector(streetSelector);
    await page.type(streetSelector, street);

    const citySelector = "#mCity";
    await page.waitForSelector(citySelector);
    await page.type(citySelector, city);

    const stateSelector = "#mStateProvince";
    await page.waitForSelector(stateSelector);
    await page.type(stateSelector, stateZipMatch ? stateZipMatch[1] : "");

    const zipSelector = "#mPostalCode";
    await page.waitForSelector(zipSelector);
    await page.type(zipSelector, stateZipMatch ? stateZipMatch[2] : "");

    const searchButtonSelector = "#mSubmit";
    await page.waitForSelector(searchButtonSelector);
    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }),
        page.click(searchButtonSelector)
    ]);

    await page.waitForSelector("#mGrid");

    // From the table of ownerNames fetch the one with row accountNumber matches and the last one among those rows
    const matchInfo = await page.evaluate((accountStr) => {
        const rows = Array.from(document.querySelectorAll("#mGrid tr")).slice(1);
        let targetRowIndex = -1;
        let ownerName = "";
        let url = "";

        for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll("td");
            if (cells.length > 0) {
                const parcelNum = cells[0].textContent.trim();
                if (parcelNum === String(accountStr)) {
                    targetRowIndex = i;
                    ownerName = cells[1].textContent.trim();
                    const linkEl = cells[0].querySelector("a");
                    if (linkEl) {
                        url = linkEl.href;
                    }
                }
            }
        }
        return { targetRowIndex, ownerName, url };
    }, account);

    if (matchInfo.targetRowIndex === -1 || !matchInfo.url) {
        throw new Error(`Account number ${account} not found in the search results.`);
    }

    // going back to the main Page
    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }),
        page.goto(matchInfo.url)
    ]);

    return { ownerName: matchInfo.ownerName, address };
}

// this is the main dashboard page
async function parseMainPage(page, result, accountNumber) {

    // get taxable and assessed value
    const getValueByLabel = async (label) => {
        const xpath = `//table[@id='mPropertyValues']//tr[td[contains(., '${label}')]]/td[2]`;
        const value = await page.evaluate((xpathStr) => {
            const res = document.evaluate(
                xpathStr,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            );
            const element = res.singleNodeValue;
            return element ? element.textContent.trim() : null;
        }, xpath);
        return (value && value.length > 0) ? value : "N/A";
    };

    result.total_assessed_value = await getValueByLabel("Assessed Value Regular (AVR)");
    result.total_taxable_value = await getValueByLabel("Taxable Value Regular (TVR)");

    let balanceYears = []; // Using an array to track all years that have a balance
    const taxBalanceExists = await page.$("#mTaxChargesBalancePayment");

    // Iff "Tax Balance" table exist
    if (taxBalanceExists) {
        // Use $$eval instead of $eval to grab ALL rows (skipping the title row)
        const balanceDataArray = await page.$$eval("#mTaxChargesBalancePayment tr:not(.DataGridTitle)", rows => {
            return rows.map(row => {
                const cells = row.querySelectorAll("td");
                if (cells.length >= 7) {
                    return {
                        year: cells[0].textContent.trim(),
                        dueDate: cells[2].textContent.trim(),
                        principal: cells[3].textContent.trim(),
                        totalDue: cells[5].textContent.trim()
                    };
                }
                return null;
            }).filter(item => item !== null); // Filter out any empty/invalid rows
        }).catch(() => []);

        // Loop through all collected rows
        if (balanceDataArray && balanceDataArray.length > 0) {
            for (const balanceData of balanceDataArray) {
                balanceYears.push(balanceData.year); // Store year for receipts filtering

                const taxRecord = createTaxHistory();
                taxRecord.year = balanceData.year;
                taxRecord.payment_type = "Installment";
                taxRecord.due_date = formatToUSADate(balanceData.dueDate);
                taxRecord.base_amount = balanceData.principal;
                taxRecord.amount_due = balanceData.totalDue;
                taxRecord.amount_paid = "$0.00";
                taxRecord.paid_date = "";

                if (balanceData.dueDate) {
                    const d = new Date(balanceData.dueDate);
                    if (!isNaN(d.getTime())) {
                        d.setDate(d.getDate() + 1);
                        taxRecord.delq_date = formatToUSADate(d);
                    }
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const targetDue = new Date(taxRecord.due_date);
                const targetDelq = new Date(taxRecord.delq_date);

                if (today >= targetDelq) {
                    taxRecord.status = "Delinquent";
                } else if (today <= targetDue) {
                    taxRecord.status = "Due";
                } else {
                    taxRecord.status = "Due";
                }

                result.tax_history.push(taxRecord);
            }
        }
    }

    // if their exist no "Tax Balance" table (i.e no due records then parse paid records from "Receipts")
    if (balanceYears.length === 0) {
        // get all the paid records
        let rawReceipts = await page.$$eval("#mReceipts tr:not(.DataGridTitle)", rows => {
            return rows.map(row => {
                const cells = row.querySelectorAll("td");
                if (cells.length >= 3) {
                    const linkEl = cells[1] ? cells[1].querySelector("a") : null;
                    const rawDateText = cells[0] ? cells[0].textContent.trim() : "";
                    const chargeText = cells[2] ? cells[2].textContent.trim() : "";

                    let rowYear = "";
                    const dateMatch = rawDateText.match(/\d{4}/);
                    if (dateMatch) rowYear = dateMatch[0];

                    return {
                        url: linkEl ? linkEl.href : null,
                        paidDateAndTime: rawDateText,
                        chargeAmount: chargeText,
                        year: rowYear
                    };
                }
                return null;
            }).filter(item => item && item.url);
        });

        // Filter out $0.00 charges
        const validReceipts = rawReceipts.filter(item => item.chargeAmount !== "$0.00");

        if (validReceipts.length > 0) {
            // Sort descending to easily find the most recent year
            validReceipts.sort((a, b) => parseInt(b.year || 0) - parseInt(a.year || 0));

            // "I want to add only recent year paid data"
            const mostRecentYear = validReceipts[0].year;

            // Grab all receipts that match the most recent year (handles installments)
            const filteredReceipts = validReceipts.filter(item => item.year === mostRecentYear);

            // Determine if they paid annually or in installments
            const dynamicPaymentType = filteredReceipts.length > 1 ? "Installment" : "Annual";

            for (const receiptItem of filteredReceipts) {
                try {
                    await page.goto(receiptItem.url, { waitUntil: "networkidle2", timeout: 90000 });

                    const receiptData = await page.evaluate((targetParcel) => {
                        let parsed = { year: "", baseAmount: "", paidAmount: "", parcelNo: "" };

                        // 1. Loop through all rows in mGrid (skipping the header)
                        const gridRows = document.querySelectorAll("#mGrid tr:not(.GridHeader)");

                        for (const row of gridRows) {
                            const cells = row.querySelectorAll("td");

                            // Make sure row has all 5 columns (Parcel No, Year, TCA, Amount, Description)
                            if (cells.length >= 5) {
                                const rowParcelNo = cells[0].textContent.trim();
                                const rowYear = cells[1].textContent.trim();
                                const rowAmount = cells[3].textContent.trim();
                                const rowDesc = cells[4].textContent.trim();

                                // Check if this row matches our target parcel AND is "Property Tax Principal"
                                const isParcelMatch = rowParcelNo === targetParcel || rowParcelNo.includes(targetParcel);
                                const isDescMatch = rowDesc.includes("Property Tax Principal");

                                if (isParcelMatch && isDescMatch) {
                                    parsed.parcelNo = rowParcelNo;
                                    parsed.year = rowYear;
                                    parsed.baseAmount = rowAmount;
                                    break; // Found the matching row, stop looking
                                }
                            }
                        }

                        // 2. Payer logic remains exactly unchanged
                        const payerRow = document.querySelector("#mReceiptPayers tr:nth-child(2)");
                        if (payerRow) {
                            const cells = payerRow.querySelectorAll("td");
                            if (cells.length >= 3) {
                                parsed.paidAmount = cells[2].textContent.trim();
                            }
                        }

                        return parsed;
                    }, accountNumber); 

                    const isParcelMatch = receiptData.parcelNo === accountNumber || receiptData.parcelNo.includes(accountNumber);

                    if (isParcelMatch && (receiptData.year || receiptData.baseAmount || receiptData.paidAmount)) {
                        const taxRecord = createTaxHistory();
                        taxRecord.year = receiptData.year;
                        taxRecord.payment_type = dynamicPaymentType;
                        taxRecord.base_amount = receiptData.baseAmount;
                        taxRecord.amount_paid = receiptData.paidAmount;
                        taxRecord.amount_due = "$0.00";
                        taxRecord.status = "Paid";
                        taxRecord.paid_date = formatToUSADate(receiptItem.paidDateAndTime);

                        if (taxRecord.year) {
                            taxRecord.due_date = `11/15/${taxRecord.year}`;
                            taxRecord.delq_date = `11/16/${taxRecord.year}`;
                        }

                        result.tax_history.push(taxRecord);
                    }
                } catch (err) {
                    console.log(`Error processing receipt for year ${receiptItem.year}:`, err);
                }
            }
        }
    }
}


const account_search = async (page, url, account) => {
    const result = createPropertyObject();
    await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });
    // 1. Search Account Number
    await searchAccountNumber(page, account);
    // 2. Search OwnerName
    const { ownerName, address } = await searchOwnerName(page, account);
    // 3. Parse the main dashboard page
    await parseMainPage(page, result, account);

    result.parcel_number = account;
    result.owner_name = ownerName ? [ownerName] : ["N/A"];
    result.property_address = address;

    // for deciding delinquency and generation of notes
    if (result.tax_history.length > 0) {
        const hasDelinquent = result.tax_history.some((t) => t.status === "Delinquent");
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

        const url = "https://public.co.wasco.or.us/webtax/(S(hlozrpl1phz0kiqhkr5tvizw))/default.aspx";

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