// Author:- Bhagyashree Badadal

// search by Account Number
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "amelia": {
        url: "https://eservices.ameliacova.com/applications/REPublicInquiry/webform1.aspx",
        auth: "Amelia County Treasurer, 16441 Court Street, Amelia Court House, VA 23002"
    },
    "bristol-city": {
        url: "https://eservices.bristolva.org/applications/REPublicInquiry/webform1.aspx",
        auth: "City of Bristol Treasurer, 300 Lee Street, Bristol, VA 24201"
    },
    "caroline": {
        url: "https://e-services.co.caroline.va.us/applications/REPublicInquiry/webform1.aspx",
        auth: "Caroline County Treasurer, 212 North Main Street, Bowling Green, VA 22427"
    },
    "cumberland": {
        url: "https://eservices.cumberlandcounty.virginia.gov/applications/REPublicInquiry/webform1.aspx",
        auth: "Cumberland County Treasurer, 1 Courthouse Circle, Cumberland, VA 23040"
    },
    "king-and-queen": {
        url: "https://eservices.kingandqueenco.net/Applications/REPublicInquiry/webform1.aspx",
        auth: "King and Queen County Treasurer, 242 Allens Circle, King and Queen Court House, VA 23085"
    },
    "page": {
        url: "https://eservices.pagecounty.virginia.gov/applications/REPublicInquiry/webform1.aspx",
        auth: "Page County Treasurer, 103 South Court Street, Luray, VA 22835"
    },
    "rockbridge": {
        url: "https://eservices.rockbridgecountyva.gov/applications/republicinquiry/webform1.aspx",
        auth: "Rockbridge County Treasurer, 150 South Main Street, Lexington, VA 24450"
    },
    "shenandoah": {
        url: "https://eservices.shenandoahcountyva.us/applications/REPublicInquiry/webform1.aspx",
        auth: "Shenandoah County Treasurer, 600 North Main Street, Suite 102, Woodstock, VA 22664"
    },
    "surry": {
        url: "https://eservices.surrycountyva.gov/applications/REPublicInquiry/webform1.aspx",
        auth: "Surry County Treasurer, 45 School Street, Surry, VA 23883"
    },
    "sussex": {
        url: "https://eservices.sussexcountyva.gov/applications/REPublicInquiry/webform1.aspx",
        auth: "Sussex County Treasurer, 15074 Courthouse Road, Sussex, VA 23884"
    },
    "warren": {
        url: "https://eservices.warrencountyva.gov/applications/REPublicInquiry/webform1.aspx",
        auth: "Warren County Treasurer, 220 North Commerce Avenue, Front Royal, VA 22630"
    },
    "westmoreland": {
        url: "https://eservices.westmoreland-county.org/applications/REPublicInquiry/webform1.aspx",
        auth: "Westmoreland County Treasurer, 111 Polk Street, Montross, VA 22520"
    },
    "king-george": {
        url: "https://eservices.kinggeorgecountyva.gov/applications/REPublicInquiry/webform1.aspx",
        auth: "King George County Treasurer, 10459 Courthouse Drive, Suite 100, King George, VA 22485"
    },
    "lunenburg": {
        url: "https://eservices.lunenburgva.org/Applications/REPublicInquiry/webform1.aspx",
        auth: "Lunenburg County Treasurer, Lunenburg, VA 23952"
    },
    "prince-edward": {
        url: "https://epayments.co.prince-edward.va.us/applications/REPublicInquiry/webform1.aspx",
        auth: "Prince Edward County Treasurer, 124 N. Main St., 2nd Floor, Farmville, VA 23901"
    },
    "bath": {
        url: "https://treasurer.bathcountyva.gov/Applications/REPublicInquiry/webform1.aspx",
        auth: "Bath County Treasurer, 65 Courthouse Hill Rd, Warm Springs, VA 24484"
    },
    "campbell": {
        url: "https://bai.co.campbell.va.us/applications/REPublicInquiry/webform1.aspx",
        auth: "Campbell County Treasurer, 85 Carden Lane, Rustburg, VA 24588"
    },
    "greene": {
        url: "https://treasurer.gcva.us/Applications/REPublicInquiry/webform1.aspx",
        auth: "Greene County Treasurer, 36 Stanard Street, Stanardsville, VA 22973"
    },
    "greensville": {
        url: "https://tr.greensvillecountyva.com/applications/REPublicInquiry/webform1.aspx",
        auth: "Greensville County Treasurer, 1781 Greensville County Circle, Emporia, VA 23847"
    },
    "dickenson": {
        url: "https://eservices.dickensonva.org/applications/REPublicInquiry/webform1.aspx",
        auth: "Dickenson County Treasurer, 2767 Dickenson Highway, Clintwood, VA 24228"
    },
    "mecklenburg": {
        url: "https://meckweb.mecklenburgva.com/Applications/REPublicInquiry/webform1.aspx",
        auth: "Mecklenburg County Treasurer, 311 Washington Street, Boydton, VA 23917"
    }
};

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

// generating notes
const generate_notes = (year, keys, status1, status2, noOfInstallments) => {
    let notes = "";
    try {
        notes = keys === 1 ? `ALL PRIORS ARE PAID,` : `PRIORS ARE DELINQUENT,`;

        if (noOfInstallments === 1) {
            notes += ` ${year} TAXES ARE ${status1.toUpperCase()},`;
        } else {
            notes += ` ${year} 1ST INSTALLMENT IS ${status1.toUpperCase()}, 2ND INSTALLMENT IS ${status2.toUpperCase()},`;
        }
        notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
        notes += ` NORMAL DUE DATES ARE 06/05 AND 12/05`;
    } catch (error) {
        console.log("Error generating notes:", error);
    } finally {
        return notes;
    }
};

async function handleDisclaimer(page, browser, county) {
    if (county === "sussex") {
        await page.waitForSelector("#ctl00_MainContent_txtDisclaimer", timeout_option);
        await page.waitForSelector("#ctl00_MainContent_btnAccept", timeout_option);

        const newPagePromise = new Promise(resolve =>
            browser.once("targetcreated", async target => {
                const newPage = await target.page();
                resolve(newPage);
            })
        );

        await page.click("#ctl00_MainContent_btnAccept", timeout_option);
        const newPage = await newPagePromise;
        await page.close();
        return newPage;
    } else {
        await page.waitForSelector("#ctl00_MainContent_txtDisclaimer", timeout_option);
        await page.waitForSelector("#ctl00_MainContent_btnAccept", timeout_option);

        await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
            page.click("#ctl00_MainContent_btnAccept", timeout_option)
        ]);
        return page;
    }
}

async function searchAccountNumber(accountNumber, page) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.waitForSelector("#ctl00_MainContent_contentbody", timeout_option);

    const accountBtnSelector = "#ctl00_MainContent_btnAccount";
    await page.waitForSelector(accountBtnSelector, { visible: true, ...timeout_option });

    await page.evaluate(selector => {
        document.querySelector(selector).click();
    }, accountBtnSelector);

    const inputSelector = "#ctl00_MainContent_txtAccount";
    await page.waitForSelector(inputSelector, { visible: true, ...timeout_option });

    await page.click(inputSelector);
    await page.type(inputSelector, accountNumber, { delay: 100 });

    const searchBtnSelector = "#ctl00_MainContent_btnSearch";
    await page.waitForSelector(searchBtnSelector, { visible: true, ...timeout_option });

    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
        page.evaluate(selector => {
            document.querySelector(selector).click();
        }, searchBtnSelector)
    ]);
}

function populateTheObject(item, data) {
    const record = createTaxHistory();

    record.year = data.Year;
    const [monthD, dayD, yearD] = data.Due.split("/");
    record.due_date = `${monthD.padStart(2, '0')}/${dayD.padStart(2, '0')}/${yearD}`;
    record.base_amount = item.baseTax;
    record.amount_paid = item.paidAmount;
    record.amount_due = item.due;
    record.payment_type = "Semi-Annual";

    record.seq = data.Seq;

    const dueDate = new Date(data.Due);
    dueDate.setDate(dueDate.getDate() + 1);
    const month = String(dueDate.getMonth() + 1).padStart(2, '0');
    const day = String(dueDate.getDate()).padStart(2, '0');
    const year = dueDate.getFullYear();

    record.delq_date = `${month}/${day}/${year}`;

    if (record.amount_due === "$0.00") {
        record.status = "Paid";
        record.paid_date = item.paidDate;
    } else {
        const today = new Date();
        const dueDateObj = new Date(record.due_date);
        if (today <= dueDateObj) {
            record.status = "Due";
        } else {
            record.status = "Delinquent";
        }
    }
    return record;
}

async function getDetails(page, county) {
    await page.waitForSelector("#ctl00_MainContent_gvSearch", timeout_option);

    // 1. Go to the LAST page
    const dtCounties = ["amelia", "cumberland", "warren", "lunenburg", "campbell"];
    if (dtCounties.includes(county)) {
        await page.waitForSelector('.dt-paging.paging_full_numbers', timeout_option);
        const isLastPageDisabled = await page.evaluate(() => {
            const lastButton = document.querySelector('button.page-link.last');
            if (!lastButton) return true;
            const parentLi = lastButton.closest('li');
            return parentLi ? (parentLi.classList.contains('disabled') || lastButton.getAttribute('aria-disabled') === 'true') : true;
        });

        if (!isLastPageDisabled) {
            await page.click('button.page-link.last');
            await new Promise(r => setTimeout(r, 1500));
        }
    } else {
        await page.waitForSelector('#ctl00_MainContent_gvSearch_paginate', timeout_option);

        const isLastPageDisabled = await page.evaluate(() => {
            const lastButton = document.querySelector("#ctl00_MainContent_gvSearch_last");
            return lastButton ? (lastButton.classList.contains("disabled") || lastButton.tagName === "SPAN") : true;
        });

        if (!isLastPageDisabled) {
            const previousFirstRow = await page.evaluate(() => {
                const firstRow = document.querySelector('#ctl00_MainContent_gvSearch tbody tr');
                return firstRow ? firstRow.innerText : '';
            });

            await page.evaluate(() => {
                const btn = document.querySelector("#ctl00_MainContent_gvSearch_last a") || document.querySelector("#ctl00_MainContent_gvSearch_last");
                if (btn) btn.click();
            });

            await page.waitForFunction(
                (oldText) => {
                    const currentFirstRow = document.querySelector('#ctl00_MainContent_gvSearch tbody tr');
                    return currentFirstRow && currentFirstRow.innerText !== oldText;
                },
                { timeout: 30000 },
                previousFirstRow
            ).catch(() => { });

            await page.waitForSelector("#ctl00_MainContent_gvSearch", timeout_option);
        }
    }

    const scrapeRowsFromCurrentPage = async () => {
        return await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#ctl00_MainContent_gvSearch tbody tr:not(.child)'));
            return rows.map((row) => {
                const cells = row.querySelectorAll("td");
                const deptText = cells[0] ? cells[0].innerText.trim() : "";
                const seqText = cells[2] ? cells[2].innerText.trim() : "1";
                const match = deptText.match(/RE(\d{4})/i);
                const detailsBtn = row.querySelector('a[href*="GETTICKET"]');
                const clickTarget = detailsBtn ? detailsBtn.getAttribute("href") : null;

                return {
                    taxYear: match ? parseInt(match[1], 10) : 0,
                    seq: parseInt(seqText, 10),
                    accountNo: cells[3] ? cells[3].innerText.trim() : null,
                    dueDate: cells[4] ? cells[4].innerText.trim() : null,
                    name: cells[5] ? cells[5].innerText.trim() : null,
                    clickTarget: clickTarget
                };
            }).filter(item => item.taxYear > 0 && item.clickTarget);
        });
    };

    // Scrape last page rows
    const tableData = await scrapeRowsFromCurrentPage();

    if (!tableData.length) {
        return createPropertyObject();
    }

    // Identify maximum year from last page
    const latestYear = Math.max(...tableData.map(d => d.taxYear));

    const latestYearRows = tableData
        .filter(d => d.taxYear === latestYear)
        .sort((a, b) => a.seq - b.seq);

    const result = createPropertyObject();

    // Helper function to click into rows and get detail page information
    const processRows = async (rows) => {
        for (let i = 0; i < rows.length; i++) {
            const rowData = rows[i];

            const data = {
                Due: rowData.dueDate,
                Year: rowData.taxYear,
                Seq: rowData.seq
            };

            // Click into details
            await Promise.all([
                page.waitForNavigation({ waitUntil: "domcontentloaded", ...timeout_option }),
                page.evaluate((href) => {
                    const btn = document.querySelector(`a[href="${href}"]`);
                    if (btn) btn.click();
                }, rowData.clickTarget)
            ]);

            await page.waitForSelector("#ctl00_MainContent_ORIGBILL", timeout_option);
            const baseTax = await page.$eval("#ctl00_MainContent_ORIGBILL", el => el.textContent.trim());

            await page.waitForSelector("#ctl00_MainContent_PAYMENTS", timeout_option);
            const rawPaidAmount = await page.$eval("#ctl00_MainContent_PAYMENTS", el => el.textContent.trim());
            const paidAmount = rawPaidAmount.replace(/-/g, '').trim();

            await page.waitForSelector("#ctl00_MainContent_LASTDATE", timeout_option);
            const paidDate = await page.$eval("#ctl00_MainContent_LASTDATE", el => el.textContent.trim());

            await page.waitForSelector("#ctl00_MainContent_AMOUNTOWED", timeout_option);
            const due = await page.$eval("#ctl00_MainContent_AMOUNTOWED", el => el.textContent.trim());

            const fullAddress = await page.evaluate(() => {
                const getText = (id) => {
                    const el = document.querySelector(id);
                    return el ? el.textContent.trim() : "";
                };

                const add1 = getText("#ctl00_MainContent_ADDRESS1");
                const add2 = getText("#ctl00_MainContent_ADDRESS2");
                const add3 = getText("#ctl00_MainContent_ADDRESS3");
                const zip = getText("#ctl00_MainContent_ZIP1");

                return [add1, add2, `${add3} ${zip}`.trim()]
                    .filter(part => part.length > 0)
                    .join(', ');
            });

            const item = { baseTax, paidAmount, paidDate, due };

            if (rowData.seq === 1 || !result.property_address) {
                if (rowData.name && !result.owner_name.includes(rowData.name)) {
                    result.owner_name.push(rowData.name);
                }
                result.parcel_number = rowData.accountNo;
                result.property_address = fullAddress;
            }

            const record = populateTheObject(item, data);
            result.tax_history.push(record);

            // SAFELY RETURN TO PREVIOUS PAGE
            await page.goBack({ waitUntil: "domcontentloaded", ...timeout_option });

            await page.waitForSelector("#ctl00_MainContent_gvSearch", timeout_option);
        }
    };

    // Process all latestYear rows found on the last page
    await processRows(latestYearRows);

    // 2. Go to the PREVIOUS page directly to check for remaining latestYear records
    let isPrevDisabled = true;

    if (dtCounties.includes(county)) {
        await page.waitForSelector('.dt-paging.paging_full_numbers', timeout_option);
        isPrevDisabled = await page.evaluate(() => {
            const prevButton = document.querySelector('button.page-link.previous');
            if (!prevButton) return true;
            const parentLi = prevButton.closest('li');
            return parentLi ? (parentLi.classList.contains('disabled') || prevButton.getAttribute('aria-disabled') === 'true') : true;
        });

        if (!isPrevDisabled) {
            await page.evaluate(() => document.querySelector('button.page-link.previous').click());
            await new Promise(r => setTimeout(r, 1500));
            await page.waitForSelector('.dt-paging.paging_full_numbers', timeout_option);
        }
    } else {
        await page.waitForSelector('#ctl00_MainContent_gvSearch_paginate', timeout_option);
        isPrevDisabled = await page.evaluate(() => {
            const prevButton = document.querySelector("#ctl00_MainContent_gvSearch_previous");
            return prevButton ? (prevButton.classList.contains("disabled") || prevButton.tagName === "SPAN") : true;
        });

        if (!isPrevDisabled) {

            const previousFirstRow = await page.evaluate(() => {
                const firstRow = document.querySelector('#ctl00_MainContent_gvSearch tbody tr');
                return firstRow ? firstRow.innerText : '';
            });

            await page.evaluate(() => {
                const btn = document.querySelector("#ctl00_MainContent_gvSearch_previous a") || document.querySelector("#ctl00_MainContent_gvSearch_previous");
                if (btn) btn.click();
            });

            await page.waitForFunction(
                (oldText) => {
                    const currentFirstRow = document.querySelector('#ctl00_MainContent_gvSearch tbody tr');
                    return currentFirstRow && currentFirstRow.innerText !== oldText;
                },
                { timeout: 30000 },
                previousFirstRow
            ).catch(() => { });

            await page.waitForSelector("#ctl00_MainContent_gvSearch", timeout_option);
        }
    }

    // 3. Scrape previous page and filter using latestYear directly
    if (!isPrevDisabled) {
        const prevTableData = await scrapeRowsFromCurrentPage();
        const prevLatestYearRows = prevTableData
            .filter(d => d.taxYear === latestYear)
            .sort((a, b) => a.seq - b.seq);

        if (prevLatestYearRows.length > 0) {
            await processRows(prevLatestYearRows);
        }
    }

    // Sort tax history by year, then status
    result.tax_history.sort((a, b) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        if (yearA !== yearB) return yearA - yearB;
        if (a.status === "Paid" && b.status !== "Paid") return -1;
        if (a.status !== "Paid" && b.status === "Paid") return 1;
        return 0;
    });

    // Determine notes and delinquency
    if (result.tax_history.length > 0) {
        const hasDelinquent = result.tax_history.some(t => t.status === "Delinquent");
        result.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

        const latestTax = result.tax_history[result.tax_history.length - 1];
        const latestYearRecords = result.tax_history.filter(t => String(t.year) === String(latestTax.year));
        const noOfInstallments = latestYearRecords.length;

        let status1 = "UNKNOWN";
        let status2 = "UNKNOWN";

        if (noOfInstallments === 1) {
            status1 = latestYearRecords[0] ? latestYearRecords[0].status : "UNKNOWN";
        } else {
            const inst1 = latestYearRecords.find(t => t.seq === 1);
            const inst2 = latestYearRecords.find(t => t.seq === 2);
            status1 = inst1 ? inst1.status : "UNKNOWN";
            status2 = inst2 ? inst2.status : "UNKNOWN";
        }

        const hasPriorDelinquent = result.tax_history.some(
            t => t.status === "Delinquent" && String(t.year) !== String(latestTax.year)
        );

        const keys = hasPriorDelinquent ? 0 : 1;
        result.notes = generate_notes(latestTax.year, keys, status1, status2, noOfInstallments);
    }

    result.tax_history.forEach(t => delete t.seq);
    return result;
}

const account_search = async (page, browser, url, account, tax_auth, req_county) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", ...timeout_option });

        const isServiceUnavailable = await page.evaluate(() => {
            const bodyText = document.body ? document.body.innerText : "";
            return bodyText.includes("Our e-Government services options are currently unavailable");
        });

        if (isServiceUnavailable) {
            throw new Error("Our e-Government services options are currently unavailable. Please check back soon.");
        }

        page = await handleDisclaimer(page, browser, req_county);
        await searchAccountNumber(account, page);

        const result = await getDetails(page, req_county);
        result.taxing_authority = tax_auth;

        return result;
    } catch (error) {
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

        const url = county_data[req_county].url;
        const tax_auth = county_data[req_county].auth;

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
            account_search(page, browser, url, account, tax_auth, req_county)
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
        } else if (fetch_type === "api") {
            account_search(page, browser, url, account, tax_auth, req_county)
                .then((data) => {
                    res.status(200).json({ result: data });
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