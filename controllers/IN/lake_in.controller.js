// Author: M M Prateek
// Lake County, IN Controller
// Base URL: https://in-lake.publicaccessnow.com/

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000
};

// ─── HELPERS ────────────────────────────────────────────

const formatDateToAmerican = (dateStr) => {
    if (!dateStr || dateStr.trim() === "" || dateStr === "N/A") return "N/A";

    const monthMap = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
        'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
        'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };

    let match = dateStr.match(/([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})/i);
    if (match) {
        const month = monthMap[match[1].toUpperCase()];
        const day = match[2].padStart(2, '0');
        const year = match[3];
        if (month) return `${month}/${day}/${year}`;
    }

    match = dateStr.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/i);
    if (match) {
        const month = monthMap[match[2].toUpperCase()];
        if (month) return `${month}/${match[1].padStart(2, '0')}/${match[3]}`;
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;

    return dateStr;
};

const calculateDelqDate = (dueDateStr) => {
    if (!dueDateStr || dueDateStr === "N/A") return "N/A";
    const match = dueDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return "N/A";

    const date = new Date(parseInt(match[3], 10), parseInt(match[1], 10) - 1, parseInt(match[2], 10));
    date.setDate(date.getDate() + 1);

    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
};

const extractMonthDay = (dateStr) => {
    if (!dateStr || dateStr === "N/A") return null;
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return { month: match[1], day: match[2], formatted: `${match[1]}/${match[2]}` };
    return null;
};

const parseCurrency = (val) => {
    if (!val || val === "N/A") return 0;
    return parseFloat(String(val).replace(/[$,]/g, '')) || 0;
};

const formatDollar = (num) => "$" + Number(num).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');

// ─── 1. BUILD URL AND NAVIGATE ──────────────────────────

const ac_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const parcelNoDots = account.replace(/[-\.]/g, '');
            const url = `https://in-lake.publicaccessnow.com/PropertyTax/TaxSearch/Account.aspx?p=${parcelNoDots}&a=${account}`;

            await page.goto(url, { waitUntil: "domcontentloaded", ...timeout_option });

            await page.waitForFunction(() => {
                const dds = document.querySelectorAll('#dnn_ctr465_ModuleContent dd');
                return dds.length > 0;
            }, timeout_option);

            await new Promise(resolve => setTimeout(resolve, 3000));

            resolve();
        } catch (error) {
            reject(new Error("No Record Found / Invalid Parcel"));
        }
    });
};

// ─── 2. EXTRACT ALL DATA ────────────────────────────────

const ac_2 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const data = await page.evaluate((account) => {
                const parseCurrencyLocal = (val) => {
                    if (!val || val === "N/A") return 0;
                    return parseFloat(String(val).replace(/[$,]/g, '')) || 0;
                };

                const findDdByDt = (containerSelector, dtText) => {
                    const container = document.querySelector(containerSelector);
                    if (!container) return "N/A";
                    const dls = container.querySelectorAll('dl');
                    for (const dl of dls) {
                        const dt = dl.querySelector('dt');
                        const dd = dl.querySelector('dd');
                        if (dt && dd && dt.innerText.trim().includes(dtText)) {
                            return dd.innerText.trim();
                        }
                    }
                    return "N/A";
                };

                const findDdByDtExact = (containerSelector, dtText) => {
                    const container = document.querySelector(containerSelector);
                    if (!container) return "N/A";
                    const dls = container.querySelectorAll('dl');
                    for (const dl of dls) {
                        const dt = dl.querySelector('dt');
                        const dd = dl.querySelector('dd');
                        if (dt && dd && dt.innerText.trim() === dtText) {
                            return dd.innerText.trim();
                        }
                    }
                    return "N/A";
                };

                const accountContainer = '#dnn_ctr465_ModuleContent';
                
                let owner_name = "N/A";
                const allDds = document.querySelectorAll(`${accountContainer} dd`);
                if (allDds.length >= 2) {
                    owner_name = allDds[1].innerText.trim();
                }

                let property_address = "N/A";
                if (allDds.length >= 4) {
                    const street = allDds[2].innerText.trim();
                    const cityState = allDds[3].innerText.trim();
                    if (street && cityState) {
                        property_address = `${street}, ${cityState}`;
                    }
                }

                const parcel_number = account;
                const property_type = findDdByDt(accountContainer, 'Property Type');
                const taxing_unit = findDdByDt(accountContainer, 'Taxing Unit');
                const legal_description = findDdByDt(accountContainer, 'Legal Description');

                let taxYear = "N/A";
                const taxYearDd = findDdByDt(accountContainer, 'Tax Year');
                if (taxYearDd !== "N/A") {
                    const match = taxYearDd.match(/Pay\s+(\d{4})/);
                    if (match) taxYear = match[1];
                }

                const summaryContainer = '#dnn_ctr462_ModuleContent';

                const totalAssessedRaw = findDdByDtExact(summaryContainer, '2. Equals Total Gross Assessed Value of Property:');
                const total_assessed_value = totalAssessedRaw !== "N/A" ? totalAssessedRaw : "N/A";

                const netAssessedRaw = findDdByDtExact(summaryContainer, '3. Equals Subtotal of Net Assessed Value of Property:');
                const total_taxable_value = netAssessedRaw !== "N/A" ? netAssessedRaw : "N/A";

                const totalTaxLiabilityRaw = findDdByDtExact(summaryContainer, '5. Total Property Tax Liability:');
                const total_tax_liability = totalTaxLiabilityRaw !== "N/A" ? totalTaxLiabilityRaw : "N/A";

                const prevYearContainer = '#dnn_ctr624_ModuleContent';

                const landValueRaw = findDdByDt(prevYearContainer, 'Gross Assessed Value of Land');
                const improvementsRaw = findDdByDt(prevYearContainer, 'Gross Assessed Value of Improvements');

                const installments = [];
                const billContainer = document.querySelector('#dnn_ctr636_ModuleContent');
                if (billContainer) {
                    const gridRows = billContainer.querySelectorAll('payment-bill-grid tbody tr');
                    gridRows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 6) {
                            const statusCell = cells[0].innerText.trim();
                            const dueDateCell = cells[1].innerText.trim();
                            const installmentCell = cells[2].innerText.trim();
                            const taxesChargesCell = cells[3].innerText.trim();
                            const lessPrepaymentsCell = cells[4].innerText.trim();
                            const amountDueCell = cells[5].innerText.trim();

                            let status = "Due";
                            if (statusCell.toLowerCase().includes('paid')) {
                                status = "Paid";
                            }

                            let taxesAmount = 0;
                            if (taxesChargesCell) {
                                const boldMatch = taxesChargesCell.match(/\$[\d,]+\.\d{2}/);
                                if (boldMatch) {
                                    taxesAmount = parseFloat(boldMatch[0].replace(/[$,]/g, '')) || 0;
                                }
                            }

                            let prepaymentsAmount = 0;
                            if (lessPrepaymentsCell) {
                                prepaymentsAmount = Math.abs(parseFloat(lessPrepaymentsCell.replace(/[$,]/g, '')) || 0);
                            }

                            let amountDue = 0;
                            if (amountDueCell) {
                                amountDue = parseFloat(amountDueCell.replace(/[$,]/g, '')) || 0;
                            }

                            installments.push({
                                status: status,
                                due_date: dueDateCell,
                                installment: installmentCell,
                                taxes_amount: taxesAmount,
                                prepayments: prepaymentsAmount,
                                amount_due: amountDue
                            });
                        }
                    });
                }

                const prevInstallments = [];
                const prevInstallContainer = document.querySelector('#dnn_ctr629_ModuleContent');
                if (prevInstallContainer) {
                    const cols = prevInstallContainer.querySelectorAll('.col-md-6');
                    cols.forEach((col) => {
                        const dls = col.querySelectorAll('dl');
                        let installmentData = {
                            status: "Paid",
                            property_tax: 0,
                            other_charges: 0,
                            delinquent_tax: 0,
                            delinquent_penalty: 0,
                            amount_paid: 0,
                            balance_due: 0
                        };

                        dls.forEach(dl => {
                            const dt = dl.querySelector('dt');
                            const dd = dl.querySelector('dd');
                            if (dt && dd) {
                                const label = dt.innerText.trim();
                                const value = dd.innerText.trim();

                                if (label.includes('Property Tax Amount')) installmentData.property_tax = parseCurrencyLocal(value);
                                if (label.includes('Other Charges')) installmentData.other_charges = parseCurrencyLocal(value);
                                if (label.includes('Delinquent Tax')) installmentData.delinquent_tax = parseCurrencyLocal(value);
                                if (label.includes('Delinquent Penalty')) installmentData.delinquent_penalty = parseCurrencyLocal(value);
                                if (label.includes('Amount Paid')) installmentData.amount_paid = parseCurrencyLocal(value);
                                if (label.includes('Balance Due')) installmentData.balance_due = parseCurrencyLocal(value);
                            }
                        });

                        if (installmentData.balance_due > 0) {
                            installmentData.status = "Due";
                        }

                        prevInstallments.push(installmentData);
                    });
                }

                const totalDueContainer = '#dnn_ctr660_ModuleContent';
                const totalDueRaw = findDdByDt(totalDueContainer, 'Total Due');
                const total_due_amount = totalDueRaw !== "N/A" ? totalDueRaw : "N/A";

                return {
                    owner_name,
                    property_address,
                    parcel_number,
                    property_type,
                    taxing_unit,
                    legal_description,
                    tax_year: taxYear,
                    total_assessed_value,
                    total_taxable_value,
                    total_tax_liability,
                    land_value: landValueRaw !== "N/A" ? landValueRaw : "N/A",
                    improvements: improvementsRaw !== "N/A" ? improvementsRaw : "N/A",
                    installments,
                    prev_installments: prevInstallments,
                    total_due_amount
                };
            }, account);

            resolve(data);
        } catch (error) {
            reject(new Error(error.message));
        }
    });
};

// ─── 3. ASSEMBLY ────────────────────────────────────────

const ac_3 = async (pageData) => {
    return new Promise((resolve, reject) => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const processedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const currentYear = today.getFullYear().toString();

            let taxHistoryArray = [];
            let totalDueAcc = 0;
            let isAnyDelinquentGlobal = false;

            const currentTaxYear = pageData.tax_year !== "N/A" ? pageData.tax_year : currentYear;
            const installmentsByYear = {};

            if (!installmentsByYear[currentTaxYear]) installmentsByYear[currentTaxYear] = [];

            pageData.installments.forEach(inst => {
                const formattedDueDate = formatDateToAmerican(inst.due_date);
                const delqDate = calculateDelqDate(formattedDueDate);
                const isDue = inst.amount_due > 0;
                
                let status = inst.status;
                if (isDue && status !== "Paid") {
                    status = (delqDate !== "N/A" && today >= new Date(delqDate)) ? "Delinquent" : "Due";
                }
                if (status === "Delinquent") isAnyDelinquentGlobal = true;

                const amountPaid = status === "Paid" ? (inst.prepayments || inst.taxes_amount || inst.amount_due) : 0;

                installmentsByYear[currentTaxYear].push({
                    year: currentTaxYear,
                    due_date: formattedDueDate,
                    delq_date: delqDate,
                    status: status,
                    amount_due: inst.amount_due,
                    amount_paid: amountPaid,
                    installment: inst.installment
                });
            });

            if (pageData.prev_installments.length > 0) {
                const prevTaxYear = String(parseInt(currentTaxYear) - 1);
                
                pageData.prev_installments.forEach((inst, idx) => {
                    const balanceDue = inst.balance_due || 0;
                    
                    if (balanceDue <= 0 && inst.amount_paid > 0 && inst.status === "Paid") {
                        return;
                    }

                    if (!installmentsByYear[prevTaxYear]) installmentsByYear[prevTaxYear] = [];

                    const springDueDate = `05/10/${parseInt(prevTaxYear) + 1}`;
                    const fallDueDate = `11/10/${parseInt(prevTaxYear) + 1}`;
                    const dueDate = idx === 0 ? springDueDate : fallDueDate;
                    const delqDate = calculateDelqDate(dueDate);

                    let status = inst.status;
                    if (balanceDue > 0) {
                        status = (delqDate !== "N/A" && today >= new Date(delqDate)) ? "Delinquent" : "Due";
                    }
                    if (status === "Delinquent") isAnyDelinquentGlobal = true;

                    installmentsByYear[prevTaxYear].push({
                        year: prevTaxYear,
                        due_date: dueDate,
                        delq_date: delqDate,
                        status: status,
                        amount_due: balanceDue,
                        amount_paid: inst.amount_paid || 0,
                        installment: idx === 0 ? "Spring" : "Fall"
                    });
                });
            }

            Object.keys(installmentsByYear).sort().forEach(year => {
                const installments = installmentsByYear[year];
                const isCurrentYear = year === currentTaxYear;

                installments.forEach(r => {
                    if (!isCurrentYear && r.amount_due <= 0) return;

                    const baseAmount = installments.length > 1 ? 
                        formatDollar(pageData.total_tax_liability !== "N/A" ? parseCurrency(pageData.total_tax_liability) / 2 : r.amount_due + r.amount_paid) :
                        formatDollar(r.amount_due + r.amount_paid);

                    taxHistoryArray.push({
                        jurisdiction: "County",
                        year: year,
                        payment_type: installments.length > 1 ? "Semi-Annual" : "Annual",
                        status: r.status,
                        base_amount: baseAmount,
                        county_tax: "N/A",
                        city_tax: "N/A",
                        fees: "$0.00",
                        penalty: "N/A",
                        cost: "N/A",
                        amount_paid: formatDollar(r.amount_paid),
                        amount_due: formatDollar(r.amount_due),
                        mailing_date: "N/A",
                        due_date: r.due_date,
                        delq_date: r.delq_date,
                        paid_date: "N/A",
                        good_through_date: "N/A",
                        land_value: pageData.land_value !== "N/A" ? `$${pageData.land_value}` : "$0.00",
                        improvements: pageData.improvements !== "N/A" ? `$${pageData.improvements}` : "$0.00",
                        total_assessed_value: pageData.total_assessed_value !== "N/A" ? `$${pageData.total_assessed_value}` : "$0.00",
                        exemptions_breakdown: {
                            residential_exemption: "0.00",
                            homestead_exemption: "0.00",
                            other_exemptions: "0.00",
                            local_option_credit: "0.00"
                        }
                    });
                    totalDueAcc += r.amount_due;
                });
            });

            taxHistoryArray.sort((a, b) => parseInt(a.year) - parseInt(b.year));

            let delinquentStatus = isAnyDelinquentGlobal ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            let generatedNotes = "";
            try {
                if (taxHistoryArray.length === 0) {
                    generatedNotes = "NO TAX RECORDS FOUND";
                } else {
                    const allYears = [...new Set(taxHistoryArray.map(h => parseInt(h.year, 10)))];
                    const maxYear = Math.max(...allYears).toString();
                    const currentYearInst = taxHistoryArray.filter(h => h.year === maxYear);

                    const hasPastDue = taxHistoryArray.some(h =>
                        h.year !== maxYear &&
                        (h.status.toUpperCase() === "DUE" || h.status.toUpperCase() === "DELINQUENT")
                    );
                    const isPriorYearPaid = !hasPastDue;

                    let normalDueDatesNote = "";
                    if (currentYearInst.length >= 2) {
                        const dueDates = currentYearInst.map(inst => extractMonthDay(inst.due_date)).filter(d => d !== null);
                        if (dueDates.length >= 2) normalDueDatesNote = `NORMAL DUE DATES ARE ${dueDates[0].formatted} , ${dueDates[1].formatted}`;
                        else if (dueDates.length === 1) normalDueDatesNote = `NORMAL DUE DATE IS ${dueDates[0].formatted}`;
                    } else if (currentYearInst.length === 1) {
                        const dueDate = extractMonthDay(currentYearInst[0].due_date);
                        if (dueDate) normalDueDatesNote = `NORMAL DUE DATE IS ${dueDate.formatted}`;
                    }

                    if (currentYearInst.length >= 2) {
                        const statusOne = currentYearInst[0].status.toUpperCase();
                        const statusTwo = currentYearInst[1].status.toUpperCase();
                        const statusString = `${maxYear} 1ST INSTALLMENT IS ${statusOne}, 2ND INSTALLMENT IS ${statusTwo}`;

                        if (isAnyDelinquentGlobal) {
                            if (isPriorYearPaid) {
                                generatedNotes = `ALL PRIORS ARE PAID, ${maxYear} TAXES ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${normalDueDatesNote}`;
                            } else {
                                generatedNotes = `PRIORS ARE DELINQUENT, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${normalDueDatesNote}`;
                            }
                        } else {
                            generatedNotes = `ALL PRIORS ARE PAID, ${statusString}, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${normalDueDatesNote}`;
                        }
                    } else {
                        if (isAnyDelinquentGlobal) {
                            if (isPriorYearPaid) {
                                generatedNotes = `ALL PRIORS ARE PAID, ${maxYear} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${normalDueDatesNote}`;
                            } else {
                                generatedNotes = `PRIORS ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${normalDueDatesNote}`;
                            }
                        } else {
                            generatedNotes = `ALL PRIORS ARE PAID, ${maxYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI ANNUALLY, ${normalDueDatesNote}`;
                        }
                    }
                }
            } catch (err) {
                generatedNotes = "Error generating notes: " + err.message;
            }

            const finalData = {
                processed_date: processedDate,
                owner_name: pageData.owner_name !== "N/A" && pageData.owner_name ? [pageData.owner_name] : ["N/A"],
                property_address: pageData.property_address !== "N/A" ? pageData.property_address : "N/A",
                parcel_number: pageData.parcel_number,
                land_value: pageData.land_value !== "N/A" ? `$${pageData.land_value}` : "$0.00",
                improvements: pageData.improvements !== "N/A" ? `$${pageData.improvements}` : "$0.00",
                total_assessed_value: pageData.total_assessed_value !== "N/A" ? `$${pageData.total_assessed_value}` : "$0.00",
                exemption: "N/A",
                total_taxable_value: pageData.total_taxable_value !== "N/A" ? `$${pageData.total_taxable_value}` : "$0.00",
                taxing_authority: `Lake County Treasurer, ${pageData.taxing_unit !== "N/A" ? pageData.taxing_unit : "IN"}, Ph: (219) 755-3760`,
                notes: generatedNotes,
                delinquent: delinquentStatus,
                total_amount_due: formatDollar(totalDueAcc),
                tax_history: taxHistoryArray,
                property_details: {
                    record_type: pageData.property_type !== "N/A" ? pageData.property_type : "Real Estate",
                    acres: "N/A",
                    lots: "N/A",
                    buildings: "N/A",
                    description: pageData.legal_description !== "N/A" ? pageData.legal_description : "N/A",
                    district_levy: "N/A",
                    city_levy: "N/A",
                    total_appraisal: pageData.total_assessed_value !== "N/A" ? `$${pageData.total_assessed_value}` : "N/A"
                }
            };

            resolve(finalData);
        } catch (error) {
            reject(new Error(error.message));
        }
    });
};

// ─── PIPELINE ────────────────────────────────────────────

const account_search = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await ac_1(page, account);
            const pageData = await ac_2(page, account);
            const finalData = await ac_3(pageData);
            resolve({ result: finalData });
        } catch (error) {
            reject(new Error(error.message));
        }
    });
};

// ─── SEARCH HANDLER ──────────────────────────────────────

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
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
            account_search(page, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data.result);
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
            account_search(page, account)
                .then((data) => {
                    res.status(200).json(data);
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
