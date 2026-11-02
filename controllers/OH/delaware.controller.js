// Author:- Bhagyashree Badadal

// Parcel-ID

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "delaware": {
        url: (account) => `https://delaware-auditor-ohio.manatron.com/Property.aspx?mpropertynumber=${account}`,
        auth: "Delaware County Treasurer, 145 N Union St, Delaware, OH 43015",
        first_half_due: "02/10",
        first_half_delq: "02/11",
        second_half_due: "07/10",
        second_half_delq: "07/11"
    },

    "columbiana": {
        url: (account) => `https://oh-columbiana-auditor.publicaccessnow.com/Property.aspx?mpropertynumber=${account}`,
        auth: "Columbiana County Treasurer, 105 S. Market St., Lisbon, OH 44432",
        first_half_due: "02/20",
        first_half_delq: "02/21",
        second_half_due: "10/02",
        second_half_delq: "10/03"
    }
}


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
        taxing_authority: "",
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

const generate_notes = (year, keys, status1, status2, county_config) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${(status1).toUpperCase()}, 2ND INSTALLMENT IS ${(status2).toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        // Inject dynamic due dates based on the county configuration
        notes += ` NORMAL DUE DATES ARE ${county_config.first_half_due} AND ${county_config.second_half_due}`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

function populateObject(accountNumber, propData, taxData, county_config) {
    const result = createPropertyObject();

    result.parcel_number = accountNumber;
    // Map the dynamic taxing authority
    result.taxing_authority = county_config.auth; 
    
    if (propData.ownerName) {
        result.owner_name = propData.ownerName.split("&").map(name => name.trim());
    }
    result.property_address = propData.propertyAddress || "N/A";
    result.total_assessed_value = taxData.totalAssessedValue || "N/A";
    result.total_taxable_value = taxData.totalTaxableValue || "N/A";

    if (taxData.taxYear !== "Unknown") {
        const dueYear = parseInt(taxData.taxYear, 10) + 1;

        const inst1 = createTaxHistory();
        inst1.year = taxData.taxYear;
        inst1.payment_type = "Installment 1";
        inst1.base_amount = taxData.firstHalf.netTaxDue || "";
        inst1.amount_paid = taxData.firstHalf.totalPaid || "";
        inst1.amount_due = taxData.firstHalf.balanceDue || "";
        // Map dynamic due and delinquent dates
        inst1.due_date = `${county_config.first_half_due}/${dueYear}`;
        inst1.delq_date = `${county_config.first_half_delq}/${dueYear}`;
        inst1.paid_date = taxData.firstHalf.paidDate !== "Not Paid / Not Found" ? taxData.firstHalf.paidDate : "";

        const inst2 = createTaxHistory();
        inst2.year = taxData.taxYear;
        inst2.payment_type = "Installment 2";
        inst2.base_amount = taxData.secondHalf.netTaxDue || "";
        inst2.amount_paid = taxData.secondHalf.totalPaid || "";
        inst2.amount_due = taxData.secondHalf.balanceDue || "";
        // Map dynamic due and delinquent dates
        inst2.due_date = `${county_config.second_half_due}/${dueYear}`;
        inst2.delq_date = `${county_config.second_half_delq}/${dueYear}`;
        inst2.paid_date = taxData.secondHalf.paidDate !== "Not Paid / Not Found" ? taxData.secondHalf.paidDate : "";

        result.tax_history.push(inst1, inst2);
    }

    result.tax_history.forEach((record) => {
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
        }
    });

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
        const hasDelinquent = result.tax_history.some(
            (t) => t.status.toUpperCase() === "DELINQUENT"
        );
        
        result.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        const latestTax = result.tax_history[result.tax_history.length - 1];
        const latestYearRecords = result.tax_history.filter(t => String(t.year) === String(latestTax.year));
        
        const inst1 = latestYearRecords.find(t => t.payment_type === "Installment 1");
        const inst2 = latestYearRecords.find(t => t.payment_type === "Installment 2");

        const status1 = inst1 ? inst1.status : "UNKNOWN";
        const status2 = inst2 ? inst2.status : "UNKNOWN";

        const hasPriorDelinquent = result.tax_history.some(
            (t) => t.status.toUpperCase() === "DELINQUENT" && String(t.year) !== String(latestTax.year)
        );

        const keys = hasPriorDelinquent ? 0 : 1;
        // Pass county_config into generate_notes
        result.notes = generate_notes(latestTax.year, keys, status1, status2, county_config);
    }

    return result;
}

async function getDetails(page, accountNumber, county_config) {
    // 1. Verify Property Exists before scraping
    try {
        await page.waitForSelector("td.ui-state-default", { timeout: 10000 });
    } catch (error) {
        console.log(`No property found for account number: ${accountNumber}`);
        return null; // Exit early
    }

    // 2. Extract General Property Details
    const propertyDetails = await page.evaluate(() => {
        const getValueByLabel = (labelText) => {
            const cells = Array.from(document.querySelectorAll("td.ui-state-default"));
            const targetCell = cells.find(td => td.textContent.trim() === labelText);
            if (targetCell && targetCell.nextElementSibling) {
                return targetCell.nextElementSibling.textContent.trim().replace(/\s+/g, " ");
            }
            return null;
        };

        const getPropertyAddress = () => {
            const cells = Array.from(document.querySelectorAll("td.ui-state-default"));
            const labelCell = cells.find(td => td.textContent.trim() === "Property Address:");
            if (labelCell && labelCell.parentElement && labelCell.parentElement.nextElementSibling) {
                const addressCell = labelCell.parentElement.nextElementSibling.querySelector("td");
                return addressCell ? addressCell.textContent.trim().replace(/\s+/g, " ") : null;
            }
            return null;
        };

        return {
            ownerName: getValueByLabel("Owner Name"),
            propertyAddress: getPropertyAddress(),
        };
    });

    // 3. Navigate to the Tax page dynamically based on the county_config URL
    const taxUrl = county_config.url(accountNumber).replace("Property.aspx", "Tax.aspx");
    await page.goto(taxUrl, { waitUntil: "networkidle2", ...timeout_option });

    // Verify Tax Data Exists
    try {
        await page.waitForSelector("td.ui-state-default", { timeout: 10000 });
    } catch (error) {
        console.log(`No tax data found for account number: ${accountNumber}`);
        return null;
    }

    // 4. Extract Tax Details (Using your updated robust Assessed/Taxable extraction logic)
    const taxData = await page.evaluate(() => {
        const clean = (str) => (str ? str.trim().replace(/\s+/g, " ") : null);
        const tds = Array.from(document.querySelectorAll("td.ui-state-default"));

        let totalAssessedValue = null;
        let totalTaxableValue = null;

        const spans = Array.from(document.querySelectorAll("span"));
        
        const assessedHeader = spans.find(s => s.textContent.trim() === "Market/Assessed Value");
        if (assessedHeader) {
            const table = assessedHeader.closest("table");
            if (table) {
                const labelTd = Array.from(table.querySelectorAll("td")).find(td => td.textContent.trim() === "Total");
                if (labelTd && labelTd.nextElementSibling) {
                    totalAssessedValue = clean(labelTd.nextElementSibling.textContent);
                }
            }
        }

        const taxableHeader = spans.find(s => s.textContent.trim() === "Taxable Value");
        if (taxableHeader) {
            const table = taxableHeader.closest("table");
            if (table) {
                const labelTd = Array.from(table.querySelectorAll("td")).find(td => td.textContent.trim() === "Total");
                if (labelTd && labelTd.nextElementSibling) {
                    totalTaxableValue = clean(labelTd.nextElementSibling.textContent);
                }
            }
        }

        if (!totalAssessedValue && !totalTaxableValue) {
            const totalTds = tds.filter(td => td.textContent.trim() === "Total" && td.nextElementSibling && td.nextElementSibling.textContent.includes("$"));
            
            if (totalTds.length >= 2) {
                totalAssessedValue = clean(totalTds[0].nextElementSibling.textContent);
                totalTaxableValue = clean(totalTds[1].nextElementSibling.textContent);
            } else if (totalTds.length === 1) {
                totalAssessedValue = clean(totalTds[0].nextElementSibling.textContent);
                totalTaxableValue = totalAssessedValue;
            }
        } else if (totalAssessedValue && !totalTaxableValue) {
            totalTaxableValue = totalAssessedValue;
        }

        const getValueByTdLabel = (label) => {
            const targetTd = tds.find(td => td.textContent.trim() === label && td.nextElementSibling && td.nextElementSibling.textContent.includes("$"));
            return targetTd ? clean(targetTd.nextElementSibling.textContent) : null;
        };

        const landValue = getValueByTdLabel("Land");
        const improvementsValue = getValueByTdLabel("Improvements");

        const getTaxRowValues = (rowLabel) => {
            const labelTd = tds.find(td => td.textContent.trim() === rowLabel);
            if (labelTd && labelTd.parentElement) {
                const cells = labelTd.parentElement.children;
                return {
                    firstHalf: cells.length > 3 ? clean(cells[3].textContent) : null,
                    secondHalf: cells.length > 5 ? clean(cells[5].textContent) : null,
                };
            }
            return { firstHalf: null, secondHalf: null };
        };

        const netTaxDue = getTaxRowValues("Net Tax Due");
        const totalPaid = getTaxRowValues("Total Paid");
        const balanceDue = getTaxRowValues("Balance Due");

        let firstHalfPaidDate = null;
        let secondHalfPaidDate = null;
        let taxYear = null;

        const headers = Array.from(document.querySelectorAll("th"));
        const dateHeader = headers.find(th => th.textContent.trim() === "Date");

        if (dateHeader) {
            const paymentTable = dateHeader.closest("table");
            const paymentRows = Array.from(paymentTable.querySelectorAll("tbody tr"));

            for (const row of paymentRows) {
                const cells = row.children;
                if (cells.length >= 5) {
                    const date = clean(cells[0].textContent);
                    const halfStr = clean(cells[1].textContent);
                    const amount1stHalf = clean(cells[3].textContent);
                    const amount2ndHalf = clean(cells[4].textContent);

                    if (!firstHalfPaidDate && totalPaid.firstHalf && totalPaid.firstHalf !== "$0.00" && amount1stHalf === totalPaid.firstHalf) {
                        firstHalfPaidDate = date;
                        if (halfStr && !taxYear) {
                            const yearPart = halfStr.split("-")[1];
                            if (yearPart) taxYear = "20" + yearPart;
                        }
                    }

                    if (!secondHalfPaidDate && totalPaid.secondHalf && totalPaid.secondHalf !== "$0.00" && amount2ndHalf === totalPaid.secondHalf) {
                        secondHalfPaidDate = date;
                        if (halfStr && !taxYear) {
                            const yearPart = halfStr.split("-")[1];
                            if (yearPart) taxYear = "20" + yearPart;
                        }
                    }
                }
            }
        }

        return {
            landValue,
            improvementsValue,
            totalAssessedValue,
            totalTaxableValue,
            taxYear: taxYear || "Unknown",
            firstHalf: {
                netTaxDue: netTaxDue.firstHalf,
                totalPaid: totalPaid.firstHalf,
                balanceDue: balanceDue.firstHalf,
                paidDate: firstHalfPaidDate || "Not Paid / Not Found",
            },
            secondHalf: {
                netTaxDue: netTaxDue.secondHalf,
                totalPaid: totalPaid.secondHalf,
                balanceDue: balanceDue.secondHalf,
                paidDate: secondHalfPaidDate || "Not Paid / Not Found",
            },
        };
    });

    return { propertyDetails, taxData };
}

const account_search = async (page, url, account, county_config) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // Pass county_config down the chain
        const { propertyDetails, taxData } = await getDetails(page, account, county_config);
        const finalResult = populateObject(account, propertyDetails, taxData, county_config);
        
        return finalResult;
    } catch (error) {
        console.log("Error inside account_search:", error);
        throw new Error(error.message);
    }
};

const search = async (req, res) => {
    let { fetch_type, account } = req.body;
    if (account) account = account.trim();

    try {
        const req_county = req.path.replace(/\//g, "").toLowerCase();
        if (!county_data[req_county]) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid or unsupported county."
            });
        }

        const county_config = county_data[req_county];
        const url = county_config.url(account);

        if (fetch_type !== "html" && fetch_type !== "api") {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

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

        if (fetch_type === "html") {
            account_search(page, url, account, county_config, req_county)
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
                .finally(async () => {
                    await context.close();
                });
        } else if (fetch_type === "api") {
            account_search(page, url, account, county_config, req_county)
                .then((data) => {
                    res.status(200).json({ result: data });
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
    } catch (error) {
        console.log(error);
        if (fetch_type === "html") {
            res.status(200).render('error_data', {
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

