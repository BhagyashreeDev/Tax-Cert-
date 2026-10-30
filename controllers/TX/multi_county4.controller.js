// Author :- Vadiraj Joshi
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Dedicated Mapping for Search-First Layout Style Counties
const county_data = {
    "karnes": { url: "https://www.karnescountytax.org/Home/Details?parcelId=", auth: "Karnes County, TX" },
    "archer": { url: "https://www.archercountytax.org/Home/Details?parcelId=", auth: "Archer County, TX" },
    "frio": { url: "https://www.friocountytax.org/Home/Details?parcelId=", auth: "Frio County, TX" },
    "panola": { url: "https://www.panolacountytax.org/Home/Details?parcelId=", auth: "Panola County, TX" },
    "rusk": { url: "https://ruskcountytax.com/Home/Details?parcelId=", auth: "Rusk County, TX" },
    "ward": { url: "http://www.wardcountytax.org/Home/Details?parcelId=", auth: "Ward County, TX" },
    "wheeler": { url: "https://wheelercountytax.org/Home/Details?parcelId=", auth: "Wheeler County, TX" },
    "wilbarger": { url: "https://wilbargertax.org/Home/Details?parcelId=", auth: "Wilbarger County, TX" },
    "san-augustine": { url: "http://www.sanaugustinetax.org/Home/Details?parcelId=", auth: "San Augustine County, TX" },
    "fisher": { url: "https://www.fishercad.org/Home/Details?parcelId=", auth: "Fisher County, TX" },

     "freestone": { url: "https://freestonetax.org/Home/Details?parcelId=", auth: "Freestone County, TX" }
};

const timeout_option = { timeout: 90000 };

const ac_1 = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            const safeAccount = String(account).trim();
            const rootUrl = baseUrl.split('/Home')[0];

            const searchUrl = `${rootUrl}/Home/Search?searchObj=%7B%22keyword%22%3A%22OnlyShowNonZero%3Afalse%3BCustomFieldsSearch%3Afalse%3BCategorySearch%3Afalse%3BAcreSearch%3Afalse%3BValueSearch%3Afalse%22%2C%22searchOption%22%3A%22basic%22%2C%22sortBy%22%3A%22Parcel%20Id%22%2C%22taxYear%22%3A%220%22%2C%22onlyShowNonZero%22%3A%22false%22%2C%22page%22%3A%221%22%2C%22pageSize%22%3A%2220%22%2C%22parcelId%22%3A%22%22%2C%22propStrNum%22%3A%22%22%2C%22propStrDir%22%3A%22%22%2C%22propStr%22%3A%22%22%2C%22propCity%22%3A%22%22%2C%22propState%22%3A%22%22%2C%22propZip%22%3A%22%22%2C%22ownershipId%22%3A%22%22%2C%22ownerId%22%3A%22%22%2C%22account%22%3A%22%22%2C%22ownerName%22%3A%22%22%2C%22propertyType%22%3A%22%22%2C%22strNum%22%3A%22%22%2C%22strName%22%3A%22%22%2C%22city%22%3A%22%22%2C%22state%22%3A%22%22%2C%22zip%22%3A%22%22%2C%22legal%22%3A%22%22%2C%22abstract%22%3A%22%22%2C%22subdivision%22%3A%22%22%2C%22leaseName%22%3A%22%22%2C%22leaseNumber%22%3A%22%22%2C%22agentCode%22%3A%22%22%2C%22isEmptySearch%22%3Afalse%2C%22protestStatus%22%3A%22%22%2C%22filter%22%3Anull%2C%22paymentStatus%22%3A%22%22%2C%22customFieldsSearch%22%3A%22false%22%2C%22customFields%22%3A%22%22%2C%22customFieldKey%22%3A%22%22%2C%22categorySearch%22%3A%22false%22%2C%22categories%22%3A%22%22%2C%22acreSearch%22%3A%22false%22%2C%22acres%22%3A%22%22%2C%22matchAcre%22%3A%22%22%2C%22valueSearch%22%3A%22false%22%2C%22valueField%22%3A%22%22%2C%22valueFieldKeyMin%22%3A%22%22%2C%22valueFieldKeyMax%22%3A%22%22%7D&keyword=${safeAccount}&page=0&taxYear=0&filter=Keyword&rows=20&taxDue=false&PaymentStatus=&strSortBy=0%2Casc&PropertyType=`;

            await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: timeout_option.timeout });

            await page.waitForSelector('#id_search_list tbody tr td', timeout_option);
            await new Promise(resolve => setTimeout(resolve, 1500));

            const searchData = await page.evaluate(async (searchAccount) => {
                const getRows = () => Array.from(document.querySelectorAll('#id_search_list tbody tr'));
                const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

                let targetRow = null;
                let address = "N/A";
                let detailHref = null;
                let hasNextPage = true;
                let pageCount = 0;
                const maxPages = 5;

                while (hasNextPage && !targetRow && pageCount < maxPages) {
                    pageCount++;
                    const rows = getRows();
                    if (rows.length === 0 || (rows.length === 1 && rows[0].querySelector('.dataTables_empty'))) break;

                    const ths = Array.from(document.querySelectorAll('#id_search_list thead th'));
                    const addressIndex = ths.findIndex(th => th.textContent.includes('Property Address'));
                    const parcelIndex = ths.findIndex(th => th.textContent.includes('Parcel') || th.textContent.includes('Property ID'));

                    for (const row of rows) {
                        const tds = row.querySelectorAll('td');
                        if (parcelIndex !== -1 && tds.length > parcelIndex) {
                            if (tds[parcelIndex].textContent.trim() === searchAccount) {
                                targetRow = row;
                                break;
                            }
                        } else {
                            if (Array.from(tds).some(td => td.textContent.trim() === searchAccount)) {
                                targetRow = row;
                                break;
                            }
                        }
                    }

                    if (targetRow) {
                        const tds = targetRow.querySelectorAll('td');
                        if (addressIndex !== -1 && tds.length > addressIndex) {
                            address = tds[addressIndex].textContent.trim();
                        } else if (tds.length >= 8) {
                            address = tds[7].textContent.trim();
                        }
                        const link = targetRow.querySelector('a.detail-link');
                        detailHref = link ? link.getAttribute('href') : null;
                        break;
                    }

                    if (pageCount < maxPages) {
                        const nextBtn = document.querySelector('#id_search_list_next');
                        if (nextBtn && !nextBtn.classList.contains('disabled')) {
                            nextBtn.click();
                            await delay(1500);
                        } else {
                            hasNextPage = false;
                        }
                    } else {
                        hasNextPage = false;
                    }
                }

                if (!targetRow || !detailHref) return null;
                return { address: address || "N/A", detailHref: detailHref };
            }, safeAccount);

            if (!searchData || !searchData.detailHref) throw new Error("No Record Found");

            const finalDetailUrl = searchData.detailHref.startsWith('http')
                ? searchData.detailHref
                : `${rootUrl}/Home/${searchData.detailHref.replace(/^Home\//, '')}`;

            await page.goto(finalDetailUrl, { waitUntil: "domcontentloaded", timeout: timeout_option.timeout });
            await page.waitForSelector(".card, table", timeout_option);

            // =========================================================
            // STEP 1: Extract from main tax table first (existing logic)
            // =========================================================
            const page_content = await page.evaluate((account, authName, propertyAddress) => {
                const formatCurrency = (val) => {
                    const num = typeof val === 'string' ? parseFloat(val.replace(/[$,]/g, '')) : parseFloat(val);
                    if (isNaN(num)) return "N/A";
                    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
                };

                const data = {
                    processed_date: new Date().toLocaleDateString(),
                    order_number: "",
                    borrower_name: "",
                    owner_name: ['N/A'],
                    property_address: propertyAddress,
                    parcel_number: account,
                    land_value: "",
                    improvements: "",
                    total_assessed_value: "N/A",
                    exemption: "",
                    total_taxable_value: "N/A",
                    taxing_authority: authName,
                    notes: "",
                    delinquent: "NONE",
                    tax_history: [],
                    _needsPaidHistoryFallback: false  // internal flag, stripped before resolve
                };

                const parcelTrs = Array.from(document.querySelectorAll('.detail-wrap table tr, #owner-card table tr'));
                for (const tr of parcelTrs) {
                    const tds = tr.querySelectorAll('td');
                    if (tds.length >= 2) {
                        const label = tds[0].textContent.trim().toLowerCase();
                        const val = tds[1].textContent.trim();
                        if (label === 'parcel id') data.parcel_number = val || account;
                        if (label === 'name') data.owner_name = [val.replace(/&/g, ',')];

                        if (label.includes('market value') || label.includes('appraised') || label.includes('assessed')) {
                            const valNum = parseFloat(val.replace(/[$,]/g, ''));
                            if (!isNaN(valNum) && valNum > 0) {
                                data.total_assessed_value = formatCurrency(valNum);
                                data.total_taxable_value = formatCurrency(valNum);
                            }
                        }
                    }
                }

                const allYearsData = {};

                // =========================================================
                // 4A: Parcel Paid History - GET MOST RECENT YEAR ONLY
                // =========================================================
                const allTables = Array.from(document.querySelectorAll('table'));
                let paidTable = null;

                for (const table of allTables) {
                    const headerText = table.textContent.toLowerCase();
                    const hasPaymentAmount = headerText.includes('payment amount') || headerText.includes('amount paid');
                    const hasTaxYearPaid = headerText.includes('tax year') || headerText.includes('year paid');
                    const hasPaymentDate = headerText.includes('payment date');

                    if (hasPaymentAmount && hasTaxYearPaid && hasPaymentDate) {
                        paidTable = table;
                        break;
                    }
                }

                if (paidTable) {
                    const ths = Array.from(paidTable.querySelectorAll('thead th'));
                    const headers = ths.map(th => th.textContent.trim().toLowerCase());

                    let yearIdx = headers.findIndex(h => h.includes('tax year') && h.includes('paid'));
                    if (yearIdx === -1) {
                        yearIdx = headers.findIndex(h => h.includes('tax year'));
                    }
                    const amtIdx = headers.findIndex(h => h.includes('payment') && h.includes('amount'));
                    const dateIdx = headers.findIndex(h => h.includes('payment') && h.includes('date'));

                    if (yearIdx !== -1 && amtIdx !== -1) {
                        const paidRows = Array.from(paidTable.querySelectorAll('tbody tr'));
                        const uniquePayments = new Set();
                        const yearGroups = {};

                        paidRows.forEach(row => {
                            if (row.classList.contains('child') || row.classList.contains('dtrg-group') || row.closest('.DTFC_Cloned')) return;

                            const tds = row.querySelectorAll('td');
                            if (tds.length > Math.max(amtIdx, yearIdx)) {
                                const yearStr = tds[yearIdx]?.textContent?.trim() || '';
                                const amountStr = tds[amtIdx]?.textContent?.trim() || '';

                                if (yearStr && amountStr) {
                                    const amount = parseFloat(amountStr.replace(/[$,]/g, '')) || 0;
                                    if (amount > 0) {
                                        const rowData = Array.from(tds).map(td => td.textContent.trim()).join('|');

                                        if (!uniquePayments.has(rowData)) {
                                            uniquePayments.add(rowData);

                                            if (!yearGroups[yearStr]) {
                                                yearGroups[yearStr] = [];
                                            }
                                            yearGroups[yearStr].push({ amount, date: dateIdx !== -1 ? tds[dateIdx]?.textContent?.trim() : "N/A" });
                                        }
                                    }
                                }
                            }
                        });

                        const sortedYears = Object.keys(yearGroups).sort((a, b) => parseInt(b) - parseInt(a));
                        if (sortedYears.length > 0) {
                            const mostRecentYear = sortedYears[0];
                            const totalPaid = yearGroups[mostRecentYear].reduce((sum, p) => sum + p.amount, 0);
                            const paidDate = yearGroups[mostRecentYear][0].date;

                            allYearsData[mostRecentYear] = {
                                base_amount: 0,
                                amount_due: 0,
                                amount_paid: totalPaid,
                                paid_date: paidDate || "N/A"
                            };
                        }
                    }
                }

                // =========================================================
                // 4B: Main Tax History Table
                // =========================================================
                let latestTaxValueYear = 0;
                let latestTaxValueNum = null;
                let taxTable = null;

                for (const table of allTables) {
                    const headerText = table.textContent.toLowerCase();
                    const hasTaxYear = headerText.includes('tax year');
                    const hasBase = headerText.includes('base') && (headerText.includes('tax') || headerText.includes('amount'));
                    const hasDue = headerText.includes('amount due') || headerText.includes('total due');

                    if (hasTaxYear && hasBase && hasDue) {
                        taxTable = table;
                        break;
                    }
                }

                // Check if tax table is empty or all-zero — flag for fallback
                let taxTableIsEmptyOrZero = true;

                if (taxTable) {
                    const taxTbodyRows = Array.from(taxTable.querySelectorAll('tbody tr'));

                    if (taxTbodyRows.length > 0) {
                        // Check if every data row has all-zero/null numeric values
                        const allZero = taxTbodyRows.every(row => {
                            const tds = Array.from(row.querySelectorAll('td'));
                            const numericCells = tds.filter((td, i) => i > 1); // skip parcel/year cols
                            return numericCells.every(td => {
                                const val = parseFloat(td.textContent.replace(/[$,]/g, '')) || 0;
                                return val === 0;
                            });
                        });
                        taxTableIsEmptyOrZero = allZero;
                    }
                    // else tbody is empty → stays true
                }

                if (taxTableIsEmptyOrZero) {
                    // =========================================================
                    // FALLBACK: Tax table empty/zero — build PAID record from
                    // allYearsData already collected in section 4A above
                    // =========================================================
                    const currentYear = new Date().getFullYear();
                    const expectedTaxYear = currentYear - 1;
                    const basePaymentType = "ANNUAL";
                    const dynamicDueDatesNote = "NORMAL DUE DATE IS 01/31";

                    const phSortedYears = Object.keys(allYearsData).sort((a, b) => parseInt(b) - parseInt(a));

                    const phFallbackRow = {
                        jurisdiction: "County", year: "N/A", payment_type: "N/A", status: "N/A",
                        base_amount: "N/A", amount_paid: "N/A", amount_due: "N/A",
                        mailing_date: "", due_date: "N/A", delq_date: "N/A", paid_date: "N/A", good_through_date: "-"
                    };

                    if (phSortedYears.length > 0) {
                        const phMostRecentYear = phSortedYears[0];
                        const phGroup = allYearsData[phMostRecentYear];
                        const phYearNum = parseInt(phMostRecentYear);
                        const phNextYear = phYearNum + 1;
                        const phTotalPaid = phGroup.amount_paid;

                        const phRecord = {
                            jurisdiction: "County",
                            year: phMostRecentYear,
                            payment_type: "ANNUAL",
                            status: "PAID",
                            base_amount: formatCurrency(phTotalPaid),
                            amount_paid: formatCurrency(phTotalPaid),
                            amount_due: formatCurrency(0),
                            mailing_date: "",
                            due_date: `01/31/${phNextYear}`,
                            delq_date: `02/01/${phNextYear}`,
                            paid_date: phGroup.paid_date || "N/A",
                            good_through_date: "-"
                        };

                        data.tax_history = [phRecord];
                        data.notes = `ALL PRIORS ARE PAID, ${phMostRecentYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        data.delinquent = "NONE";
                    } else {
                        // No paid history data at all
                        data.tax_history = [phFallbackRow];
                        data.notes = `NO RECENT TAX DATA FOUND FOR ${expectedTaxYear}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        data.delinquent = "NONE";
                    }

                    delete data._needsPaidHistoryFallback;
                    return data;
                }

                // Normal tax table processing (only runs when table has real data)
                if (taxTable) {
                    const ths = Array.from(taxTable.querySelectorAll('thead th'));
                    const headers = ths.map(th => th.textContent.trim().toLowerCase());

                    const yearIdx = headers.findIndex(h => h === 'tax year' || h === 'year');
                    const baseIdx = headers.findIndex(h => (h.includes('base') || h.includes('tax amount')));
                    const dueIdx = headers.findIndex(h => h.includes('amount due') || (h.includes('due') && !h.includes('date')));
                    const valIdx = headers.findIndex(h => h.includes('tax value') || h.includes('market value'));

                    if (yearIdx !== -1 && baseIdx !== -1) {
                        const taxRows = Array.from(taxTable.querySelectorAll('tbody tr'));
                        const seenTax = new Set();
                        const taxYearGroups = {};

                        taxRows.forEach(row => {
                            if (row.classList.contains('child') || row.classList.contains('dtrg-group') || row.closest('.DTFC_Cloned')) return;

                            const tds = row.querySelectorAll('td');
                            if (!tds.length) return;

                            const firstCol = tds[0]?.textContent?.trim().toLowerCase() || '';
                            if (firstCol.includes('total')) return;

                            if (tds.length > Math.max(yearIdx, baseIdx)) {
                                const yearStr = tds[yearIdx]?.textContent?.trim() || '';
                                const baseStr = tds[baseIdx]?.textContent?.trim() || '';

                                if (yearStr && !isNaN(parseInt(yearStr)) && baseStr) {
                                    const rowData = Array.from(tds).map(td => td.textContent.trim()).join('|');

                                    if (!seenTax.has(rowData)) {
                                        seenTax.add(rowData);

                                        const baseTax = parseFloat(baseStr.replace(/[$,]/g, '')) || 0;
                                        const amountDue = dueIdx !== -1 ? parseFloat((tds[dueIdx]?.textContent || '0').replace(/[$,]/g, '')) || 0 : 0;
                                        const taxValue = valIdx !== -1 ? parseFloat((tds[valIdx]?.textContent || '0').replace(/[$,]/g, '')) || 0 : 0;

                                        if (!isNaN(taxValue) && taxValue > 0) {
                                            const yearInt = parseInt(yearStr);
                                            if (yearInt > latestTaxValueYear) {
                                                latestTaxValueYear = yearInt;
                                                latestTaxValueNum = taxValue;
                                            } else if (yearInt === latestTaxValueYear && taxValue > (latestTaxValueNum || 0)) {
                                                latestTaxValueNum = taxValue;
                                            }
                                        }

                                        if (!taxYearGroups[yearStr]) {
                                            taxYearGroups[yearStr] = [];
                                        }
                                        taxYearGroups[yearStr].push({ baseTax, amountDue });
                                    }
                                }
                            }
                        });

                        const allTaxYears = Object.keys(taxYearGroups).sort((a, b) => parseInt(b) - parseInt(a));
                        for (const yearStr of allTaxYears) {
                            const totalBase = taxYearGroups[yearStr].reduce((sum, t) => sum + t.baseTax, 0);
                            const totalDue = taxYearGroups[yearStr].reduce((sum, t) => sum + t.amountDue, 0);

                            if (allYearsData[yearStr]) {
                                allYearsData[yearStr].base_amount = totalBase;
                                allYearsData[yearStr].amount_due = totalDue;
                            } else {
                                allYearsData[yearStr] = {
                                    base_amount: totalBase,
                                    amount_due: totalDue,
                                    amount_paid: 0,
                                    paid_date: "N/A"
                                };
                            }
                        }
                    }
                }

                if (latestTaxValueNum !== null && latestTaxValueNum > 0) {
                    data.total_taxable_value = formatCurrency(latestTaxValueNum);
                    data.total_assessed_value = formatCurrency(latestTaxValueNum);
                }

                // =========================================================
                // 4C: Build final history - PAID + DELINQUENT YEARS
                // =========================================================
                let rawHistory = [];

                const allYears = Object.keys(allYearsData)
                    .map(y => parseInt(y))
                    .sort((a, b) => b - a);

                let firstPaidYear = null;
                for (const year of allYears) {
                    const yearStr = year.toString();
                    if (allYearsData[yearStr].amount_due === 0) {
                        firstPaidYear = year;
                        break;
                    }
                }

                let paidYears = [];
                let delinquentYears = [];

                if (firstPaidYear !== null) {
                    delinquentYears = allYears.filter(y => y > firstPaidYear);
                    paidYears = allYears.filter(y => y <= firstPaidYear);
                } else {
                    delinquentYears = allYears;
                }

                delinquentYears.sort((a, b) => a - b);

                for (const yearNum of delinquentYears) {
                    const yearStr = yearNum.toString();
                    const group = allYearsData[yearStr];
                    const nextYear = yearNum + 1;

                    let finalBaseAmount = group.base_amount > 0 ? group.base_amount : 0;
                    let finalAmountPaid = group.amount_paid > 0 ? group.amount_paid : 0;

                    if (finalBaseAmount === 0 && finalAmountPaid > 0) {
                        finalBaseAmount = finalAmountPaid;
                    }

                    rawHistory.push({
                        jurisdiction: "County",
                        year: yearNum,
                        payment_type: "ANNUAL",
                        status: "DELINQUENT",
                        base_amount: formatCurrency(finalBaseAmount),
                        amount_paid: formatCurrency(finalAmountPaid),
                        amount_due: formatCurrency(group.amount_due),
                        mailing_date: "",
                        due_date: `01/31/${nextYear}`,
                        delq_date: `02/01/${nextYear}`,
                        paid_date: group.paid_date,
                        good_through_date: "-",
                    });
                }

                rawHistory.sort((a, b) => b.year - a.year);

                let filteredHistory = [];
                for (let i = 0; i < rawHistory.length; i++) {
                    const record = rawHistory[i];
                    if (record.status === "PAID") {
                        if (i === 0) filteredHistory.push(record);
                        break;
                    } else {
                        filteredHistory.push(record);
                    }
                }

                const currentYear = new Date().getFullYear();
                const expectedTaxYear = currentYear - 1;

                const fallbackRow = {
                    jurisdiction: "County", year: "N/A", payment_type: "N/A", status: "N/A",
                    base_amount: "N/A", amount_paid: "N/A", amount_due: "N/A",
                    mailing_date: "", due_date: "N/A", delq_date: "N/A", paid_date: "N/A", good_through_date: "-"
                };

                if (filteredHistory.length === 0) {
                    filteredHistory.push(fallbackRow);
                } else if (parseInt(filteredHistory[0].year) < expectedTaxYear) {
                    const hasDelinquent = filteredHistory.some(r => r.status === "DELINQUENT");
                    if (!hasDelinquent) filteredHistory = [fallbackRow];
                }

                data.tax_history = filteredHistory.map(item => ({
                    ...item,
                    year: item.year.toString()
                })).sort((a, b) => {
                    const yearA = parseInt(a.year);
                    const yearB = parseInt(b.year);
                    if (isNaN(yearA)) return -1;
                    if (isNaN(yearB)) return 1;
                    return yearA - yearB;
                });

                // 4D: Notes Logic 
                const validRows = data.tax_history.filter(r => r.year !== "N/A");
                const descHistory = [...validRows].sort((a, b) => parseInt(b.year) - parseInt(a.year));

                let isPriorYearPaid = true;
                let primaryYearStatus = descHistory.length > 0 ? descHistory[0].status : "N/A";
                let yearVal = descHistory.length > 0 ? descHistory[0].year : expectedTaxYear.toString();

                for (let i = 1; i < descHistory.length; i++) {
                    if (descHistory[i].status === "DELINQUENT") isPriorYearPaid = false;
                }

                let basePaymentType = "ANNUAL";
                let dynamicDueDatesNote = "NORMAL DUE DATE IS 01/31";
                let generatedNotes = "";

                if (primaryYearStatus === "N/A" && isPriorYearPaid) {
                    generatedNotes = `NO RECENT TAX DATA FOUND FOR ${yearVal}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    data.delinquent = "NONE";
                } else if (!isPriorYearPaid) {
                    generatedNotes = `PRIORS ARE DELINQUENT, ${yearVal} TAXES ARE ${primaryYearStatus === "DELINQUENT" ? "DELINQUENT" : "PAID"}, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                    data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
                } else {
                    if (primaryYearStatus === "DELINQUENT") {
                        generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
                    } else if (primaryYearStatus === "DUE") {
                        generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE DUE, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        data.delinquent = "NONE";
                    } else {
                        generatedNotes = `ALL PRIORS ARE PAID, ${yearVal} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${basePaymentType}, ${dynamicDueDatesNote}`;
                        data.delinquent = "NONE";
                    }
                }
                data.notes = generatedNotes;

                return data;
            }, safeAccount, tax_auth, searchData.address);

            // page_content is fully built inside page.evaluate for both normal and fallback paths
            resolve(page_content);

        } catch (error) {
            console.log(error);
            reject(new Error("No Record Found"));
        }
    });
}

const account_search = async (page, baseUrl, account, tax_auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, baseUrl, account, tax_auth)
                .then((data1) => resolve(data1))
                .catch((error) => { reject(new Error(error.message)); });
        } catch (error) {
            reject(new Error(error.message));
        }
    });
}

const search = async (req, res) => {
    const requestedCountyKey = req.path.replace('/', '').toLowerCase();
    const countyInfo = county_data[requestedCountyKey];

    let { fetch_type, account } = req.body;
    account = String(account).trim();

    try {
        if (!countyInfo) return res.status(404).json({ error: true, message: "County configuration context lost." });
        if (fetch_type !== "html" && fetch_type !== "api") return res.status(200).render('error_data', { error: true, message: "Invalid Access" });

        const baseUrl = countyInfo.url.replace(/\/$/, "");
        const tax_auth = countyInfo.auth;

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'font' || req.resourceType() === 'image' || req.resourceType() === 'stylesheet') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            account_search(page, baseUrl, account, tax_auth)
                .then((data) => { res.status(200).render("parcel_data_official", data); })
                .catch((error) => { res.status(200).render('error_data', { error: true, message: error.message }); })
                .finally(async () => { await context.close(); });
        } else if (fetch_type == "api") {
            account_search(page, baseUrl, account, tax_auth)
                .then((data) => { res.status(200).json({ result: data }); })
                .catch((error) => { res.status(500).json({ error: true, message: error.message }); })
                .finally(async () => { await context.close(); });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
}

export { search }
