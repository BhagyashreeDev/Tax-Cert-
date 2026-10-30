// Author:- Bhagyashree Badadal

// using propertyId we search by Map(map, group, parcel number, special interest)

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "clay": {
        url: "https://tennesseetrustee.org/index.php?entity=CLAY&state=TN",
        auth: "Clay County Trustee, 145 Cordell Hull Dr, Celina, TN 38551"
    },

    "crockett": {
        url: "https://tennesseetrustee.org/index.php?entity=crockett&state=TN",
        auth: "Crockett County Trustee, 1 S Bell St, Alamo, TN 38001"
    },

    "fentress": {
        url: "https://tennesseetrustee.org/index.php?entity=FENTRESS&state=TN",
        auth: "Fentress County Trustee, 101 S Main St, Jamestown, TN 38556"
    },

    "hamilton": {
        url: "https://tennesseetrustee.org/index.php?entity=macon&state=TN",
        auth: "Hamilton County Trustee, 625 Georgia Ave, Chattanooga, TN 37402"
    },
    "macon": {
        url: "https://tennesseetrustee.org/index.php?entity=macon&state=TN",
        auth: "Macon County Trustee, 101 E Locust St, Lafayette, TN 37083"
    },
    "rhea": {
        url: "https://tennesseetrustee.org/index.php?entity=RHEA&state=TN",
        auth: "Rhea County Trustee, 375 Church St, Dayton, TN 37321"
    },
    "sequatchie": {
        url: "https://tennesseetrustee.org/index.php?entity=SEQUATCHIE&state=TN",
        auth: "Sequatchie County Trustee, 22 Cherry St, Dunlap, TN 37327"
    },

    "trousdale": {
        url: "https://tennesseetrustee.org/index.php?entity=TROUSDALE&state=TN",
        auth: "Trousdale County Trustee, 200 Broadway, Hartsville, TN 37074"
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
        payment_type: "Annual",
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

// for generating notes
const generate_notes = (year, keys, status) => {
    let notes = "";
    try {
        const dueDate =
            new Date(year, 2, 0).getDate() === 29 ? "02/29" : "02/28";
        notes =
            keys === 1
                ? `ALL PRIORS ARE PAID, ${year} `
                : `PRIORS ARE DELINQUENT, ${year} `;
        notes += `TAXES ARE ${status.toUpperCase()},`;
        notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
        notes += ` NORMAL DUE DATE IS ${dueDate}`;
    } catch (error) {
        console.log(error);
    } finally {
        return notes;
    }
};

// for generating dueDate for that taxYear
async function getDuteDate(year) {
    const targetYear = Number(year) + 1;
    const lastDayOfFeb = new Date(targetYear, 2, 0).getDate();
    return `02/${String(lastDayOfFeb).padStart(2, '0')}/${targetYear}`;
}

// searching the account by map, group, parcel, special interest 
async function searchMapNumber(propertyId, page) {
    const dropDownSelector = "#searchType";
    await page.waitForSelector(dropDownSelector, timeout_option);

    await page.select(dropDownSelector, "mapfields");
    await page.waitForSelector("#mapfields", { visible: true });

    // splitting the propertyId into map, group, parcel, si
    const parts = propertyId.trim().split(/\s+/);
    let controlMap = "";
    let group = "";
    let parcel = "";
    let piSi = "";
    if (parts.length === 3) {
        controlMap = parts[0];
        parcel = parts[1].replace(/\D/g, '');
    } else if (parts.length === 4) {
        controlMap = parts[0];
        group = parts[1];
        parcel = parts[2].replace(/\D/g, '');
    }

    await page.waitForSelector("#map", timeout_option);
    await page.type("#map", controlMap);

    await page.waitForSelector("#group", timeout_option);
    await page.type("#group", group);

    await page.waitForSelector("#parcel", timeout_option);
    await page.type("#parcel", parcel);

    // either click the searchButton or press Enter
    try {
        await page.waitForSelector("#submitbutton", timeout_option);
        await page.click("#submitbutton");
    } catch (error) {
        await page.keyboard.press("Enter");
    }
}

// select the first row(as it will be the exact match for our input search) from the resultGrid
async function resultGrid(page) {
    await page.waitForSelector("#example", { visible: true });

    const viewButtonSelector = '#example tbody tr:first-of-type img[src*="images/view.png"]';

    await page.waitForSelector(viewButtonSelector, { attached: true });

    // click the "View" Button of the first row
    const isClicked = await page.evaluate((selector) => {
        const firstRowViewButton = document.querySelector(selector);
        if (firstRowViewButton) {
            firstRowViewButton.click();
            return true;
        }
        return false;
    }, viewButtonSelector);

    if (!isClicked) {
        throw new Error("View button not found in the first row.");
    }

    await page.waitForSelector("#tax-card-panel", { visible: true });
}

// get all the details from this pop-up grid
async function parseThePopUpGrid(page) {
    const tableSelector = "table.cardInfo";
    await page.waitForSelector(tableSelector, { visible: true });

    // get ownerName, address, assessedValue, status, taxAmount
    const propertyDetails = await page.evaluate((selector) => {
        const rows = document.querySelectorAll(`${selector} tr`);

        let details = {
            owner: "",
            propertyAddress: "",
            status: "",
            taxAmount: "",
            assessedValue: ""
        };

        rows.forEach(row => {
            const cells = row.querySelectorAll("td");
            if (cells.length >= 2) {
                const label = cells[0].innerText.trim().replace(/:$/, '');
                const value = cells[1].innerText.trim();

                if (label === "Owner") details.owner = value;
                if (label === "Property Address") details.propertyAddress = value;
                if (label === "Status") details.status = value;
                if (label === "Tax Amount") details.taxAmount = value;
                if (label === "Assessed Value") details.assessedValue = value;
            }
        });

        return details;
    }, tableSelector);

    // no matter what (paid/unpaid) always go to "View Tax History" tab
    const isClicked = await clickTaxHistoryTab(page);
    let taxData;
    if (isClicked) {
        // get the record details of that taxYear after switching to "View Tax History" tab
        taxData = await getRecordDetails(page);
    }

    const result = await populateTheObjects(propertyDetails, taxData);
    return result;
}

// function to facilitate the switch tab to "View Tax History"
async function clickTaxHistoryTab(page) {
    await page.waitForSelector("#tax-card-tabs", { visible: true });
    const clicked = await page.evaluate(() => {
        const tabLinks = Array.from(document.querySelectorAll("#tax-card-tabs a"));
        const historyLink = tabLinks.find(el => el.innerText.includes("View Tax History"));
        if (historyLink) {
            historyLink.click();
            return true;
        }
        return false;
    });

    return clicked;
}

// getting all the details of that taxYear
async function getRecordDetails(page) {
    const tableSelector = "#main #example";
    await page.waitForSelector(`${tableSelector} tbody tr`, { visible: true });

    const taxData = await page.evaluate((selector) => {
        const rows = document.querySelectorAll(`${selector} tbody tr`);
        let records = [];

        // get the taxYear, taxAmount, paidAmount, paidDate
        for (let row of rows) {
            const cells = row.querySelectorAll("td");
            // Make sure the row has enough columns
            if (cells.length < 5) continue;

            let details = {
                taxYear: cells[0].innerText.trim(),
                taxAmt: cells[2].innerText.trim(),
                paidAmt: cells[3].innerText.trim(),
                paidDate: cells[4].innerText.trim()
            };

            // Stop collecting if the Date Last Paid is a valid date (not "Unpaid" or empty)
            let isUnpaid = details.paidDate && details.paidDate.toLowerCase() === "unpaid";

            if (!isUnpaid) {
                // If the record IS PAID (has a date)...
                if (records.length === 0) {
                    // If we haven't found any unpaid records (meaning the property is fully paid up),
                    // add this very first paid record 
                    records.push(details);
                }
                // Then immediately break the loop so we don't look at older paid years.
                break;
            } else {
                // If the record is UNPAID, always add it.
                records.push(details);
            }
        }
        return records;
    }, tableSelector);
    return taxData;
}

// populate the obtained data into the objects
async function populateTheObjects(propertyDetails, taxData) {
    // main result object
    const result = new createPropertyObject();
    result.owner_name = propertyDetails.owner ? [propertyDetails.owner.toUpperCase()] : ["N/A"];
    result.property_address = propertyDetails.propertyAddress ? propertyDetails.propertyAddress.toUpperCase() : "N/A";
    result.total_assessed_value = propertyDetails.assessedValue ? propertyDetails.assessedValue : "N/A";
    result.total_taxable_value = result.total_assessed_value;

    // add each record in the taxData
    for (const item of taxData) {
        const record = new createTaxHistory();
        record.year = item.taxYear;
        record.due_date = await getDuteDate(record.year);
        record.delq_date = `03/01/${parseInt(record.year, 10) + 1}`;

        if (propertyDetails.status === "PAID") {
            record.status = "Paid";
            record.base_amount = item.taxAmt;
            record.amount_paid = item.paidAmt;
            record.paid_date = item.paidDate;
            record.amount_due = "$0.00";
        } else {
            const today = new Date();
            const dueDateObj = new Date(record.due_date);

            if (today <= dueDateObj) {
                record.status = "Due";
            } else {
                record.status = "Delinquent";
            }
            record.base_amount = item.taxAmt;
            record.amount_due = item.taxAmt;
            record.amount_paid = item.paidAmt;
        }

        result.tax_history.push(record);
    }

    // sorting the records(1. places them in order from oldest to newest  2. For 2 items of same year It prioritizes items where the status is equal to "Paid", pushing them to the top)
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

    // deciding delinquency and notes
    if (result.tax_history.length > 0) {
        // Check if ANY tax is delinquent for the main delinquency flag
        const hasDelinquent = result.tax_history.some(
            (t) => t.status === "Delinquent",
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

const account_search = async (page, url, propertyId, auth) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        // 1. Search for the account
        await searchMapNumber(propertyId, page);
        // 2. Select from result grid
        await resultGrid(page);
        // 3. Parse the pop up grid
        const result = await parseThePopUpGrid(page);
        // 4. Populate parcelId and taxingAuthority
        result.parcel_number = propertyId;
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
                    await context.close();
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
                    await context.close();
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