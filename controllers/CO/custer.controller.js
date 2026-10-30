// Author:- Bhagyashree Badadal
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "custer": {
        url: "https://co1467.cichosting.com/CTASWebPortal/parcelSearch.aspx",
        auth: "Custer County Treasurer, PO Box 209, Westcliffe, CO 81252"
    },

    "chaffee": {
        url: "https://co118.cichosting.com/CTASWebPortal/parcelSearch.aspx",
        auth: "Chaffee County Treasurer, 104 Crestone Avenue, Salida, CO 81201"
    },

    "cheyenne": {
        url: "https://co1347.cichosting.com/CTASWebportal/parcelSearch.aspx",
        auth: "Cheyenne County Treasurer, 51 S 1st St E, Cheyenne Wells, CO 80810"
    },

    "sedgwick": {
        url: "https://co1245.cichosting.com/CTASWebportal/parcelSearch.aspx",
        auth: "Sedgwick County Treasurer, 315 Cedar St, Suite 210, Julesburg, CO 80737"
    },

    "washington": {
        url: "https://co313.cichosting.com/CTASWebPortal/parcelSearch.aspx",
        auth: "Washington County Treasurer, 150 Ash Avenue, Akron, CO 80720"
    },

    "yuma": {
        url: "https://co1232.cichosting.com/CTASWebPortal/parcelSearch.aspx",
        auth: "Yuma County Treasurer, 310 Ash, Suite C, Wray, CO 80758"
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
        total_assessed_value: "N/A",
        exemption: "",
        total_taxable_value: "N/A",
        delinquent: "NONE",
        taxing_authority: "",
        notes: "",
        tax_history: []
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
const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID,`
                : `PRIORS ARE DELINQUENT,`;
        notes += ` ${year} 1ST INSTALLMENT IS ${status.toUpperCase()}, 2ND INSTALLMENT IS ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE 02/28 AND 06/15`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// generate delinquent date
function getDelinquentDate(dueDateStr) {
    if (!dueDateStr) return null;
    const date = new Date(dueDateStr);
    date.setDate(date.getDate() + 1);

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();

    return `${month}/${day}/${year}`;
}

// search the account number
async function searchAccountNumber(accountNumber, page) {
    const searchSelector = "#MainContent_txtParcelNumber";
    await page.waitForSelector(searchSelector, { visible: true });
    await page.type(searchSelector, accountNumber);

    const submitBtnSelector = "#MainContent_btnSearch2";
    await page.waitForSelector(submitBtnSelector, { visible: true });
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click(submitBtnSelector)
    ]);

    const selectSelector = "input[value='Select Property']";
    await page.waitForSelector(selectSelector, { visible: true });
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click(selectSelector)
    ]);
}

// get the ownerName, address
async function getPropertyDetails(page) {
    const propertyDetails = await page.evaluate(() => {
        // Select the first data row (skipping the <th> header row)
        const row = document.querySelector('#MainContent_gvParcelSearchResults tr:nth-child(2)');
        if (!row) return null;

        const cells = row.querySelectorAll('td');

        // Index 3 corresponds to Parcel Address (4th <td>)
        // Index 4 corresponds to Owner Name (5th <td>)
        const propertyAddress = cells[3]?.innerText.replace(/\s+/g, ' ').trim();
        const ownerName = cells[4]?.innerText.replace(/\s+/g, ' ').trim();

        return { propertyAddress, ownerName };
    });

    return propertyDetails;
}

// go to "Taxes " link
async function goToTaxes(page) {
    await page.waitForSelector('#Taxes a');

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('#Taxes a')
    ]);
}

// get the tax record
async function getTaxRecords(page) {
    await page.waitForSelector("#MainContent_ddlTaxYear", { visible: true });

    const installmentData = await page.evaluate(() => {
        const getText = (id) => {
            const el = document.getElementById(id);
            return el ? el.innerText.trim() : '';
        };

        return {
            taxYear: getText('MainContent_ddlTaxYear'),
            firstInstallment: {
                dueDate: getText('MainContent_Label11'),
                taxesDue: getText('MainContent_Label12'),
                datePaid: getText('MainContent_Label17'),
                totalPaid: getText('MainContent_Label201'),
                amtDue: getText('MainContent_Label203')
            },
            secondInstallment: {
                dueDate: getText('MainContent_Label21'),
                taxesDue: getText('MainContent_Label22'),
                datePaid: getText('MainContent_Label27'),
                totalPaid: getText('MainContent_Label301'),
                amtDue: getText('MainContent_Label303')
            }
        };
    });
    return installmentData;
}

// populate the object
async function populateTheObject(details, data, page) {
    const result = createPropertyObject();
    result.owner_name.push(details.ownerName);
    result.property_address = details.propertyAddress;

    const usCurrencyFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    });

    const parseAmt = (str) => {
        if (!str) return 0;
        return parseFloat(str.replace(/,/g, '')) || 0;
    };

    const record1 = createTaxHistory();
    record1.year = data.taxYear;
    record1.base_amount = usCurrencyFormatter.format(parseAmt(data.firstInstallment.taxesDue));
    record1.amount_paid = usCurrencyFormatter.format(parseAmt(data.firstInstallment.totalPaid));
    record1.amount_due = usCurrencyFormatter.format(parseAmt(data.firstInstallment.amtDue));
    record1.due_date = data.firstInstallment.dueDate;
    record1.delq_date = getDelinquentDate(record1.due_date);
    record1.paid_date = data.firstInstallment.datePaid;
    record1.payment_type = "Installment 1";

    if (record1.amount_due === "$0.00") {
        record1.status = "Paid";
    } else {
        const today = new Date();
        const dueDateObj = new Date(record1.due_date);
        if (today <= dueDateObj) {
            record1.status = "Due";
        } else {
            record1.status = "Delinquent";
        }
    }

    // --- RECORD 2 ---
    const record2 = createTaxHistory();
    record2.year = data.taxYear;
    record2.base_amount = usCurrencyFormatter.format(parseAmt(data.secondInstallment.taxesDue));
    record2.amount_paid = usCurrencyFormatter.format(parseAmt(data.secondInstallment.totalPaid));
    record2.amount_due = usCurrencyFormatter.format(parseAmt(data.secondInstallment.amtDue));
    record2.due_date = data.secondInstallment.dueDate;
    record2.delq_date = getDelinquentDate(record2.due_date);
    record2.paid_date = data.secondInstallment.datePaid;
    record2.payment_type = "Installment 2";

    if (record2.amount_due === "$0.00") {
        record2.status = "Paid";
    } else {
        const today = new Date();
        const dueDateObj = new Date(record2.due_date);
        if (today <= dueDateObj) {
            record2.status = "Due";
        } else {
            record2.status = "Delinquent";
        }
    }

    result.tax_history.push(record1, record2);

    // sort the records
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

    // decide the delinquency and notes
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
}

const account_search = async (page, url, accountNumber, auth) => {
    try {

        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // 1. Search the account number
        await searchAccountNumber(accountNumber, page);
        // 2. Get ownerName and address
        const details = await getPropertyDetails(page);
        // 3. Go to "Taxes" page
        await goToTaxes(page);
        // 4. Get the tax record
        const data = await getTaxRecords(page);
        // 5. Populate the object with obtained data
        const result = await populateTheObject(details, data, page);
        result.parcel_number = accountNumber;
        result.taxing_authority = auth;

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
    const county = (
        req.params.county || req.path.split("/").filter(Boolean).pop()
    ).toLowerCase();

    if (county === "yuma") {
        const errorMessage = "This Website is not working";

        if (fetch_type == "html") {
            return res.status(200).render("error_data", {   
                error: true,
                message: errorMessage,
            });
        } else {
            return res.status(200).json({                   
                error: true,
                message: errorMessage,
            });
        }
    }

    try {
        const url = county_data[county]["url"];
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36",
        );

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (req.resourceType() === "font" || req.resourceType() === "image") {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            // FRONTEND ENDPOINT
            account_search(page, url, account, county_data[county].auth)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error);
                    res.status(200).render("error_data", {
                        error: true,
                        message: error.message,
                    });
                })
                .finally(async () => {
                    try {

                    } catch (error) {
                        console.log(error);
                    }
                });
        } else if (fetch_type == "api") {
            // API ENDPOINT
            account_search(page, url, account, county_data[county].auth)
                .then((data) => {
                    res.status(200).json({
                        result: data,
                    });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({
                        error: true,
                        message: error.message,
                    });
                })
                .finally(async () => {
                    try {

                    } catch (error) {
                        console.log(error);
                    }
                });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render("error_data", {
                error: true,
                message: error.message,
            });
        } else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message,
            });
        }
    }
};

export { search };