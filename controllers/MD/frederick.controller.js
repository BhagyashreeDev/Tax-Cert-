// Author:- Bhagyashree Badadal
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
    "frederick": { url: "https://frederickcountymd.munisselfservice.com/citizens/RealEstate/Default.aspx?mode=new", auth: "Frederick County Treasury Department, 30 N Market St Frederick, MD 21701" },
    "worcester": { url: "https://selfservice.co.worcester.md.us/css/citizens/RealEstate/Default.aspx?mode=new", auth: "Worcester County Treasurer, 1 West Market Street Snow Hill, MD 21863" },
    "cecil": { url: "https://cecilco.munisselfservice.com/css/citizens/RealEstate/Default.aspx?mode=new", auth: "Cecil County Government, 200 Chesapeake Blvd Elkton, MD 21921" },
    "calvert": { url: "https://calvertcountymd.munisselfservice.com/css/citizens/RealEstate/Default.aspx?mode=new", auth: "Calvert County Treasurer’s Office, 150 Main Street Prince Frederick, MD 20678" },
    "wicomico": { url: "https://wicomicomd.munisselfservice.com/citizens/RealEstate/Default.aspx?mode=new", auth: "Wicomico County Department of Finance, 125 N Division Street Salisbury, MD 21803" },
    "washington": { url: "https://washingtoncountymd.munisselfservice.com/css/citizens/RealEstate/Default.aspx?mode=new", auth: "Washington County Treasurer's Office, 35 W Washington St Suite 102 Hagerstown, MD 21740" },
    "howard": { url: "https://howardcountymd.munisselfservice.com/css/citizens/RealEstate/Default.aspx?mode=new", auth: "Howard County Department of Finance 3430, Courthouse Drive Ellicott City, MD 21043" },
    "talbot": { url: "https://talbotcountymd.munisselfservice.com/css/citizens/RealEstate/Default.aspx?mode=new", auth: "Talbot County Finance Department, 11 N Washington Street Suite 9 Easton, MD 21601" },
    "anne-arundel": { url: "https://aacounty.munisselfservice.com/citizens/RealEstate/Default.aspx?mode=new", auth: "Anne Arundel County Office of Finance, 44 Calvert Street Room 110 Annapolis, MD 21401" },
    "caroline": { url: "https://selfservice.carolinemd.org/css/citizens/RealEstate/Default.aspx?mode=new", auth: "Caroline County Tax Office, 109 Market Street Room 133 Denton, MD 21629" },
    "queen-anne-s": { url: "https://queenannescountymd.munisselfservice.com/css/citizens/RealEstate/Default.aspx?mode=new", auth: "Queen Anne's County Treasury, Division 107 N Liberty Street Centreville, MD 21617" },
    "allegany": {url: "https://alleganymd.munisselfservice.com/citizens/RealEstate/Default.aspx?mode=new", auth: "Allegany County Tax & Utility Office, 701 Kelly Road Suite 201 Cumberland, MD 21502"}
};

const timeout_option = { timeout: 30000 };

const formatCurrency = (amount) => {
    if (amount === undefined || amount === null || amount === "N/A" || amount === "") return "N/A";
    const num = parseFloat(amount.toString().replace(/[\$,]/g, ""));
    if (isNaN(num)) return amount;
    return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const createPropertyObject = () => { return { processed_date: "", order_number: "", borrower_name: "", owner_name: [], property_address: "", parcel_number: "", land_value: "", improvements: "", total_assessed_value: "", exemption: "", total_taxable_value: "", taxing_authority: "", notes: "", delinquent: "", tax_history: [] }; };

const createTaxHistory = () => { return { jurisdiction: "County", year: "", payment_type: "Annual", status: "", base_amount: "", amount_paid: "", amount_due: "", mailing_date: "N/A", due_date: "", delq_date: "", paid_date: "N/A", good_through_date: "-" }; };

const statusCalculator = (taxHistoryItem) => {
    const today = new Date();
    const dueDate = new Date(taxHistoryItem.due_date);
    const delqDate = new Date(taxHistoryItem.delq_date);
    if (today <= dueDate) return "Due";
    else if (today >= delqDate) return "Delinquent";
    return "Paid";
};

async function searchAccountNumber(page, accountNumber) {
  const searchIdSelector = "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_Control_ParcelIdSearchFieldLayout_ctl01_ParcelIDTextBox";
  await page.waitForSelector(searchIdSelector);
  await page.type(searchIdSelector, accountNumber);

  const searchButtonSelector = "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_Control_FormLayoutItem7_ctl01_Button1";
  await page.waitForSelector(searchButtonSelector);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click(searchButtonSelector)
  ]);
}

const goToSearchResultsGrid = async (page) => {
    const searchResultsSelector = '#primarynav a[href*="ParcelBrowse.aspx"]';
    await page.waitForSelector(searchResultsSelector, { visible: true });
    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {
            console.log(`[Navigation] Warning: waitForNavigation timed out for Search Results, continuing...`);
        }),
        page.evaluate((sel) => { document.querySelector(sel).click(); }, searchResultsSelector)
    ]);
    const gridSelector = "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_BillsGridView";
    await page.waitForSelector(gridSelector, { visible: true });
};

const getAvailableBillsMetadata = async (page) => {
    const tableSelector = "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_BillsGridView";
    await page.waitForSelector(tableSelector, timeout_option);
    const bills = await page.evaluate((selector) => {
        const rows = Array.from(document.querySelectorAll(`${selector} tr`)).slice(1);
        return rows.map((row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 7) return null;
            const yearText = cells[4].textContent.trim();
            const billType = cells[5].textContent.trim();
            const linkId = cells[6].querySelector("a")?.id || "";
            return { year: parseInt(yearText, 10), billType: billType, linkSelector: `#${linkId}` };
        }).filter(b => b !== null);
    }, tableSelector);
    return bills;
};

const scrapeBillYear = async (page) => {
    const ownerSelector = "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_OwnerLabel";
    await page.waitForSelector(ownerSelector, timeout_option);
    // get the owner name
    const ownerName = await page.$eval(ownerSelector, (el) => el.textContent.trim());

    // get the values present in the table
    const extractedData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll(".datatable tbody tr"));
        const validInstallmentRows = rows.filter((row) => {
            const firstCell = row.querySelector("td");
            if (!firstCell) return false;
            const cellText = firstCell.innerText.trim();
            return !isNaN(parseInt(cellText, 10));
        });
        const parseCurrency = (str) => {
            if (!str || str.trim() === "") return 0;
            return parseFloat(str.replace(/[\$,]/g, ""));
        };
        return validInstallmentRows.map((row) => {
            const cells = row.querySelectorAll("td");
            const payByDateText = cells[1].innerText.trim();
            const amount = parseCurrency(cells[2].innerText);
            const paymentsCredits = parseCurrency(cells[3].innerText);
            const balance = parseCurrency(cells[4].innerText);
            let dueAmount = parseCurrency(cells[6].innerText);

            if (paymentsCredits === 0 && dueAmount === 0) dueAmount = balance || amount;

            const dueDateObj = new Date(payByDateText);
            dueDateObj.setDate(dueDateObj.getDate() + 1);
            const delinquentDateStr = `${dueDateObj.getMonth() + 1}/${dueDateObj.getDate()}/${dueDateObj.getFullYear()}`;
            return { installment: cells[0].innerText.trim(), dueDate: payByDateText, delinquentDate: delinquentDateStr, baseAmount: amount, paymentsCredits: paymentsCredits, balance: balance, dueAmount: dueAmount };
        });
    });
    return { ownerName, installments: extractedData };
};

const goToPaymentsOrAdjustments = async (page) => {
    const paymentSelector = "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_ViewPaymentsLinkButton";
    const exists = await page.$(paymentSelector);
    if (exists) {
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2" }),
            page.click(paymentSelector)
        ]);
    }
};

const scrapePaymentsAndMap = async (page, installments, taxYear, billType) => {
    let paymentRows = [];
    try {
        await page.waitForSelector(".datatable.nomargin tbody tr", { timeout: 5000 });
        paymentRows = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll(".datatable.nomargin tbody tr"));
            const payments = [];
            for (let i = 1; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll("td");
                if (cells.length > 0) {
                    const activity = cells[0].innerText.trim();
                    if (activity === "Payment") {
                        // get the posted date
                        const postedDate = cells[1].innerText.trim();
                        const amountRaw = cells[5].innerText.trim();
                        const amount = parseFloat(amountRaw.replace(/[\$,()]/g, ""));
                        payments.push({ postedDate: postedDate, amountPaid: amount });
                    }
                }
            }
            return payments;
        });
    } catch (error) {
        console.log(`Payments table not found or error occurred: ${error.message}`);
    }

    const isSemiAnnual = billType.toLowerCase().includes("semi") || installments.length === 2;
    if (isSemiAnnual && installments.length === 2 && paymentRows.length === 1) {
        const totalInstallmentBase = installments[0].baseAmount + installments[1].baseAmount;
        const totalPaymentsCredits = installments[0].paymentsCredits + installments[1].paymentsCredits;
        const singlePayment = paymentRows[0].amountPaid;
        if (Math.abs(totalInstallmentBase - singlePayment) < 0.02 || Math.abs(totalPaymentsCredits - singlePayment) < 0.02) {
            const taxHistoryItem = createTaxHistory();
            taxHistoryItem.year = taxYear;
            taxHistoryItem.payment_type = "Annual";
            taxHistoryItem.base_amount = formatCurrency(totalInstallmentBase);
            taxHistoryItem.amount_paid = formatCurrency(singlePayment);
            taxHistoryItem.amount_due = formatCurrency(installments[0].dueAmount + installments[1].dueAmount);
            taxHistoryItem.due_date = installments[0].dueDate;
            taxHistoryItem.delq_date = installments[1].delinquentDate || installments[0].delinquentDate;
            taxHistoryItem.paid_date = paymentRows[0].postedDate;
            taxHistoryItem.status = (installments[0].balance + installments[1].balance === 0) ? "Paid" : statusCalculator(taxHistoryItem);
            return [taxHistoryItem];
        }
    }
    let availablePayments = [...paymentRows];
    return installments.map((installment, idx) => {
        const taxHistoryItem = createTaxHistory();
        taxHistoryItem.year = taxYear;
        taxHistoryItem.payment_type = isSemiAnnual ? "Semi-Annual" : "Annual";
        taxHistoryItem.base_amount = formatCurrency(installment.baseAmount);
        taxHistoryItem.amount_due = formatCurrency(installment.dueAmount);
        taxHistoryItem.due_date = installment.dueDate;
        taxHistoryItem.delq_date = installment.delinquentDate;
        let matchedPayment = null;
        if (availablePayments.length > 0) {
            const candidates = availablePayments.map((p, pIdx) => {
                const diffs = [
                    Math.abs(p.amountPaid - installment.paymentsCredits),
                    Math.abs(p.amountPaid - installment.baseAmount),
                    Math.abs(p.amountPaid - installment.balance),
                    Math.abs(p.amountPaid - installment.dueAmount)
                ];
                return { payment: p, originalIndex: pIdx, minDiff: Math.min(...diffs) };
            });
            let bestCandidates = candidates.filter(c => c.minDiff < 0.02);
            if (bestCandidates.length === 0) {
                const absoluteMinDiff = Math.min(...candidates.map(c => c.minDiff));
                bestCandidates = candidates.filter(c => c.minDiff === absoluteMinDiff);
            }
            if (bestCandidates.length > 0) {
                bestCandidates.sort((a, b) => new Date(a.payment.postedDate) - new Date(b.payment.postedDate));
                matchedPayment = bestCandidates[0].payment;
                const matchIdx = availablePayments.indexOf(matchedPayment);
                if (matchIdx !== -1) availablePayments.splice(matchIdx, 1);
            }
        }
        if (matchedPayment) {
            taxHistoryItem.amount_paid = formatCurrency(matchedPayment.amountPaid);
            taxHistoryItem.paid_date = matchedPayment.postedDate;
        } else {
            taxHistoryItem.amount_paid = formatCurrency(installment.paymentsCredits);
            taxHistoryItem.paid_date = "N/A";
        }
        if (installment.balance === 0 && installment.dueAmount === 0 && installment.baseAmount === installment.paymentsCredits) {
            taxHistoryItem.status = "Paid";
        } else {
            taxHistoryItem.status = statusCalculator(taxHistoryItem);
        }
        return taxHistoryItem;
    });
};

const mapHistoryDirectly = (installments, taxYear, billType) => {
    return installments.map((inst) => {
        const historyItem = createTaxHistory();
        historyItem.year = taxYear;
        const typeLower = billType.toLowerCase();
        historyItem.payment_type = typeLower.includes("semi") ? "Semi-Annual" : "Annual";
        historyItem.base_amount = formatCurrency(inst.baseAmount);
        historyItem.amount_due = formatCurrency(inst.dueAmount);
        historyItem.due_date = inst.dueDate;
        historyItem.delq_date = inst.delinquentDate;
        historyItem.amount_paid = formatCurrency(inst.paymentsCredits);
        historyItem.paid_date = "N/A";
        if (inst.balance === 0 && inst.dueAmount === 0 && inst.baseAmount > 0 && inst.baseAmount === inst.paymentsCredits) {
            historyItem.status = "Paid";
        } else {
            historyItem.status = statusCalculator(historyItem);
        }
        return historyItem;
    });
};

const gotToCharges = async (page) => {
    try {
        const chargeSelector = '#primarynav a[href*="TaxCharges.aspx"]';
        await page.waitForSelector(chargeSelector, { timeout: 5000 });
        await page.evaluate((sel) => document.querySelector(sel).click(), chargeSelector);
        const tableSelector = "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_TaxChargesTable";
        await page.waitForSelector(tableSelector, { timeout: 5000 });
        const value = await page.evaluate((selector) => {
            const table = document.querySelector(selector);
            if (!table) return "";
            const rows = Array.from(table.querySelectorAll("tr"));
            for (const row of rows) {
                const headerCell = row.querySelector("th.leftheader");
                if (headerCell && headerCell.textContent.toUpperCase().includes("COUNTY")) {
                    const numericCells = row.querySelectorAll("td.numericdata");
                    if (numericCells.length > 0) return numericCells[0].textContent.trim();
                }
            }
            return "";
        }, tableSelector);
        return value;
    } catch (error) {
        return "";
    }
};

const goToPropertyDetail = async (page) => {
    const propertySelector = '#primarynav a[href*="ParcelDetail.aspx"]';
    await page.waitForSelector(propertySelector, timeout_option);
    await page.evaluate(el => document.querySelector(el).click(), propertySelector);
    const locationSelector = "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_LocationLabel";
    await page.waitForSelector(locationSelector, timeout_option);
    const address = await page.$eval(locationSelector, el => el.textContent.replace(/\s+/g, ' ').trim());
    const assessedSelector = "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_AssessedValueLabel";
    await page.waitForSelector(assessedSelector, timeout_option);
    const assessed = await page.$eval(assessedSelector, el => el.textContent.trim());
    return { address, assessed };
};

const generateNotes = (taxHistoryArray, yearVal) => {
    if (!taxHistoryArray || taxHistoryArray.length === 0) {
        return { generatedNotes: "NO VALID TAX RECORDS FOUND.", delinquentStatus: "NONE" };
    }
    const isAnyDelinquent = taxHistoryArray.some(h => h.status === "Delinquent");
    const delinquentStatus = isAnyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
    const currentYearItems = taxHistoryArray.filter(h => h.year === yearVal);
    const olderItems = taxHistoryArray.filter(h => parseInt(h.year) < parseInt(yearVal));
    const isPriorYearPaid = !olderItems.some(h => h.status === "Delinquent");
    const priorText = isPriorYearPaid ? "ALL PRIORS ARE PAID" : "PRIORS ARE DELINQUENT";
    const formatMMDD = (dateStr) => {
        if (!dateStr || dateStr === "N/A" || dateStr === "-") return "N/A";
        const parts = dateStr.split("/");
        if (parts.length >= 2) return `${parts[0].padStart(2, "0")}/${parts[1].padStart(2, "0")}`;
        return dateStr;
    };
    const buildDueDatesNote = (items) => {
        if (items.length >= 2) {
            const d1 = formatMMDD(items[0].due_date);
            const d2 = formatMMDD(items[1].due_date);
            return `NORMALLY DUE DATE IS ${d1} FOR ANNUAL AND ${d1} AND ${d2} FOR SEMI-ANNUAL`;
        } else if (items.length === 1) {
            const d1 = formatMMDD(items[0].due_date);
            return `NORMALLY DUE DATE IS ${d1} FOR ANNUAL AND ${d1} AND 12/31 FOR SEMI-ANNUAL`;
        }
        return "";
    };
    let generatedNotes = "";
    if (currentYearItems.length >= 2) {
        const dynamicDueDatesNote = buildDueDatesNote(currentYearItems);
        const s1 = currentYearItems[0].status.toUpperCase();
        const s2 = currentYearItems[1].status.toUpperCase();
        const statusString = `${yearVal} 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}`;
        const isSemiAnnualRecent = currentYearItems[0].payment_type === "Semi-Annual";
        const freqText = isSemiAnnualRecent ? "SEMI ANNUALLY" : "ANNUALLY";
        const currentYearDelinquent = currentYearItems.some(h => h.status === "Delinquent");
        if (currentYearDelinquent || isAnyDelinquent) {
            generatedNotes = isPriorYearPaid ? `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${freqText}, ${dynamicDueDatesNote}` 
                                             : `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID ${freqText}, ${dynamicDueDatesNote}`;
        } else {
            generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID ${freqText}, ${dynamicDueDatesNote}`;
        }
    } else if (currentYearItems.length === 1) {
        const dynamicDueDatesNote = buildDueDatesNote(currentYearItems);
        const s1 = currentYearItems[0].status.toUpperCase();
        const isSemiAnnualRecent = currentYearItems[0].payment_type === "Semi-Annual";
        const freqText = isSemiAnnualRecent ? "SEMI ANNUALLY" : "ANNUALLY";
        const currentYearDelinquent = currentYearItems[0].status === "Delinquent";
        if (currentYearDelinquent || isAnyDelinquent) {
            generatedNotes = isPriorYearPaid ? `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${freqText}, ${dynamicDueDatesNote}`
                                             : `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID ${freqText}, ${dynamicDueDatesNote}`;
        } else {
            generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE ${s1}, NORMALLY TAXES ARE PAID ${freqText}, ${dynamicDueDatesNote}`;
        }
    } else {
        generatedNotes = priorText;
    }
    return { generatedNotes, delinquentStatus };
};

const account_search = (page, url, account, tax_auth, county) => new Promise(async (resolve, reject) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
        await searchAccountNumber(page, account);

        // if the county is queen-annes
        if (county === "queen-anne-s") {
            const tableSelector = "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_BillDetailsUpdatePanel";
            await page.waitForSelector(tableSelector, timeout_option);
            // go to scrape the bill year
            const billData = await scrapeBillYear(page);
            let finalTaxHistory = [];
            let targetYear = new Date().getFullYear().toString(); 
            const yearSelector = "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_FiscalYearLabel";
            const text = await page.$eval(yearSelector, el => el.textContent.trim());
            if (text) targetYear = text;
            let billType = "Annual"; 
            if(billData.installments.length==2) {
                billType = "Semi-Annual";
            }

            // i think no need of ghost year
            
            // const isGhostYear = billData.installments.length === 0 || billData.installments.every(inst => {
            //     return inst.baseAmount === 0 && inst.paymentsCredits === 0 && inst.balance === 0 && inst.dueAmount === 0;
            // });
            
            // if (isGhostYear) {
            //     if (billData.installments.length > 0) {
            //         const parsedHistory = billData.installments.map(inst => {
            //             const historyItem = createTaxHistory();
            //             historyItem.year = targetYear;
            //             historyItem.payment_type = billType;
            //             historyItem.base_amount = formatCurrency(0);
            //             historyItem.amount_due = formatCurrency(0);
            //             historyItem.amount_paid = formatCurrency(0);
            //             historyItem.due_date = inst.dueDate || "N/A";
            //             historyItem.delq_date = inst.delinquentDate || "N/A";
            //             historyItem.paid_date = "N/A";
            //             historyItem.status = "Paid";
            //             return historyItem;
            //         });
            //         finalTaxHistory.push(...parsedHistory);
            //     } else {
            //         const historyItem = createTaxHistory();
            //         historyItem.year = targetYear;
            //         historyItem.payment_type = "Annual";
            //         historyItem.base_amount = formatCurrency(0);
            //         historyItem.amount_due = formatCurrency(0);
            //         historyItem.amount_paid = formatCurrency(0);
            //         historyItem.due_date = "N/A";
            //         historyItem.delq_date = "N/A";
            //         historyItem.paid_date = "N/A";
            //         historyItem.status = "Paid";
            //         finalTaxHistory.push(historyItem);
            //     }
            // } else {
                const isFullyPaid = billData.installments.every(inst => inst.baseAmount === inst.paymentsCredits && inst.balance === 0 && inst.dueAmount === 0);
                let parsedHistory = [];
                if (isFullyPaid) {
                    await goToPaymentsOrAdjustments(page);
                    parsedHistory = await scrapePaymentsAndMap(page, billData.installments, targetYear, billType);
                } else {
                    parsedHistory = mapHistoryDirectly(billData.installments, targetYear, billType);
                }
                if (parsedHistory.length > 0) {
                    finalTaxHistory.push(...parsedHistory);
                }
            // }
            
            let latestTaxable = "";
            let latestAddress = "N/A";
            let latestAssessed = "N/A";
            // go to charges to get taxable value
            const currentTaxable = await gotToCharges(page);
            if (currentTaxable) latestTaxable = currentTaxable;
            // go to property detail to get assessed and address details
            const propData = await goToPropertyDetail(page);
            if (propData.address) latestAddress = propData.address;
            if (propData.assessed) latestAssessed = propData.assessed;

            finalTaxHistory.sort((a, b) => {
                const statusWeightA = a.status.toLowerCase() === "paid" ? 0 : 1;
                const statusWeightB = b.status.toLowerCase() === "paid" ? 0 : 1;
                return statusWeightA - statusWeightB;
            });

            const propertyObj = createPropertyObject();
            let taxableValue = latestTaxable;
            if (!taxableValue || taxableValue.trim() === "") taxableValue = latestAssessed;
            propertyObj.parcel_number = account;
            propertyObj.owner_name = billData.ownerName !== "N/A" ? [billData.ownerName] : ["N/A"];
            propertyObj.property_address = latestAddress;
            propertyObj.total_assessed_value = formatCurrency(latestAssessed);
            propertyObj.total_taxable_value = formatCurrency(taxableValue);
            propertyObj.tax_history = finalTaxHistory;
            propertyObj.taxing_authority = tax_auth;
            if (finalTaxHistory.length === 0) {
                propertyObj.notes = "NO VALID TAX RECORDS FOUND.";
                propertyObj.delinquent = "NONE";
            } else {
                const notesData = generateNotes(finalTaxHistory, targetYear);
                propertyObj.notes = notesData.generatedNotes;
                propertyObj.delinquent = notesData.delinquentStatus;
            }
            resolve(propertyObj);
        } else {
            const allBillsMeta = await getAvailableBillsMetadata(page);
            if (allBillsMeta.length === 0) {
                return reject(new Error("No bills found for this account."));
            }
            allBillsMeta.sort((a, b) => b.year - a.year);
            const uniqueYears = [...new Set(allBillsMeta.map(b => b.year))].slice(0, 5);
            let actualLatestYear = null;
            let finalTaxHistory = [];
            let discoveredOwnerName = "N/A";
            let fallbackOwner = "N/A";
            let ownerLocked = false;
            let latestAddress = "N/A";
            let latestAssessed = "N/A";
            let latestTaxable = "";
            let isFirstIteration = true;
            let propertyDetailsLevel = 0;
            let isMostRecentYear = true;
            
            for (const targetYear of uniqueYears) {
                const yearRows = allBillsMeta.filter(b => b.year === targetYear);
                let currentYearRecords = [];
                let containsGhost = false;
                let allPaid = false;
                
                for (const rowMeta of yearRows) {
                    if (!isFirstIteration) {
                        await goToSearchResultsGrid(page);
                    }
                    isFirstIteration = false;
                    
                    await page.waitForSelector(rowMeta.linkSelector, timeout_option);
                    await page.click(rowMeta.linkSelector);
                    const billData = await scrapeBillYear(page);
                    
                    if (actualLatestYear === null && fallbackOwner === "N/A") {
                        if (billData.ownerName && billData.ownerName !== "N/A") fallbackOwner = billData.ownerName;
                    }
                    
                    const isGhostYear = billData.installments.length === 0 || billData.installments.every(inst => {
                        return inst.baseAmount === 0 && inst.paymentsCredits === 0 && inst.balance === 0 && inst.dueAmount === 0;
                    });
                    
                    if (actualLatestYear === null) actualLatestYear = targetYear;
                    if (!ownerLocked) {
                        discoveredOwnerName = (billData.ownerName && billData.ownerName !== "N/A") ? billData.ownerName : fallbackOwner;
                        ownerLocked = true;
                    }

                    let parsedHistory = [];

                    if (isGhostYear) {
                        containsGhost = true;
                        if (billData.installments.length > 0) {
                            parsedHistory = billData.installments.map(inst => {
                                const historyItem = createTaxHistory();
                                historyItem.year = targetYear.toString();
                                historyItem.payment_type = rowMeta.billType.toLowerCase().includes("semi") ? "Semi-Annual" : "Annual";
                                historyItem.base_amount = formatCurrency(0);
                                historyItem.amount_due = formatCurrency(0);
                                historyItem.amount_paid = formatCurrency(0);
                                historyItem.due_date = inst.dueDate || "N/A";
                                historyItem.delq_date = inst.delinquentDate || "N/A";
                                historyItem.paid_date = "N/A";
                                historyItem.status = "Paid";
                                return historyItem;
                            });
                        } else {
                            const historyItem = createTaxHistory();
                            historyItem.year = targetYear.toString();
                            historyItem.payment_type = "Annual";
                            historyItem.base_amount = formatCurrency(0);
                            historyItem.amount_due = formatCurrency(0);
                            historyItem.amount_paid = formatCurrency(0);
                            historyItem.due_date = "N/A";
                            historyItem.delq_date = "N/A";
                            historyItem.paid_date = "N/A";
                            historyItem.status = "Paid";
                            parsedHistory.push(historyItem);
                        }
                    } else {
                        const isFullyPaid = billData.installments.every(inst => inst.baseAmount === inst.paymentsCredits && inst.balance === 0 && inst.dueAmount === 0);
                        if (isFullyPaid) {
                            await goToPaymentsOrAdjustments(page);
                            parsedHistory = await scrapePaymentsAndMap(page, billData.installments, targetYear.toString(), rowMeta.billType);
                        } else {
                            parsedHistory = mapHistoryDirectly(billData.installments, targetYear.toString(), rowMeta.billType);
                        }
                    }

                    if (parsedHistory.length > 0) {
                        currentYearRecords.push(...parsedHistory);
                    }

                    if (propertyDetailsLevel < 2) {
                        const currentTaxable = await gotToCharges(page);
                        if (currentTaxable) latestTaxable = currentTaxable;
                        const propData = await goToPropertyDetail(page);
                        if (propData.address) latestAddress = propData.address;
                        if (propData.assessed) latestAssessed = propData.assessed;
                        propertyDetailsLevel = 2;
                    }
                }
                
                allPaid = currentYearRecords.every(h => h.status === "Paid");

                if (isMostRecentYear) {
                    // Always store the most recent year's record(s)
                    if (currentYearRecords.length > 0) {
                        finalTaxHistory.push(...currentYearRecords);
                    }
                    isMostRecentYear = false;
                    if (containsGhost || allPaid) {
                        break;
                    }
                } else {
                    if (containsGhost || allPaid) {
                        break;
                    } else {
                        // Only add if the older year records are Due or Delinquent
                        if (currentYearRecords.length > 0) {
                            finalTaxHistory.push(...currentYearRecords);
                        }
                    }
                }
            }
            
            if (!ownerLocked) {
                discoveredOwnerName = fallbackOwner;
            }
            finalTaxHistory.sort((a, b) => {
                const yearA = parseInt(a.year, 10);
                const yearB = parseInt(b.year, 10);
                if (yearA !== yearB) return yearA - yearB;
                const statusWeightA = a.status.toLowerCase() === "paid" ? 0 : 1;
                const statusWeightB = b.status.toLowerCase() === "paid" ? 0 : 1;
                return statusWeightA - statusWeightB;
            });
            const propertyObj = createPropertyObject();
            let taxableValue = latestTaxable;
            if (!taxableValue || taxableValue.trim() === "") taxableValue = latestAssessed;
            propertyObj.parcel_number = account;
            propertyObj.owner_name = discoveredOwnerName !== "N/A" ? [discoveredOwnerName] : ["N/A"];
            propertyObj.property_address = latestAddress;
            propertyObj.total_assessed_value = formatCurrency(latestAssessed);
            propertyObj.total_taxable_value = formatCurrency(taxableValue);
            propertyObj.tax_history = finalTaxHistory;
            propertyObj.taxing_authority = tax_auth;
            
            if (finalTaxHistory.length === 0 || !actualLatestYear) {
                propertyObj.notes = "NO VALID TAX RECORDS FOUND.";
                propertyObj.delinquent = "NONE";
            } else {
                const notesData = generateNotes(finalTaxHistory, actualLatestYear.toString());
                propertyObj.notes = notesData.generatedNotes;
                propertyObj.delinquent = notesData.delinquentStatus;
            }
            resolve(propertyObj);
        }
    } catch (e) {
        reject(new Error("No Record Found / Invalid Parcel"));
    }
});

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        const cName = req.path.replace('/', '').toLowerCase();
        if (!county_data[cName]) throw new Error(`County '${cName}' not configured.`);
        
        if (!fetch_type || !["html", "api"].includes(fetch_type)) {
            return res.status(200).render('error_data', { error: true, message: "Invalid Access" });
        }
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);
        await page.setRequestInterception(true);
        page.on('request', (r) => ['stylesheet', 'font', 'image'].includes(r.resourceType()) ? r.abort() : r.continue());
        try {
            const data = await account_search(page, county_data[cName].url, account, county_data[cName].auth, cName);
            if (fetch_type === "html") res.status(200).render("parcel_data_official", data);
            else res.status(200).json({ result: data });
        } catch (err) {
            if (fetch_type === "html") res.status(200).render('error_data', { error: true, message: err.message });
            else res.status(500).json({ error: true, message: err.message });
        } finally {
            await context.close().catch(() => null);
        }
    } catch (e) {
        if (fetch_type === "html") res.status(200).render('error_data', { error: true, message: e.message });
        else res.status(500).json({ error: true, message: e.message });
    }
};

export { search };