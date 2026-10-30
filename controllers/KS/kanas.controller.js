//Author: Nithyananda R S 
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = { timeout: 90000 };


// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const is_delq = (dateStr) => {
	if (!dateStr) return false;
	return new Date() >= new Date(dateStr);
};
const counties = [
	{
		county: "cherokee",
		base: "https://ks815.cichosting.com/ttp/tax",
		taxing_authority:
			"Cherokee County Treasurer, 110 W Maple St, Columbus, KS 66725, Ph: (620) 429-3848",
	},
	{
		county: "ellis",
		base: "https://ks292.cichosting.com/ttp/tax",
		taxing_authority:
			"Ellis County Treasurer, 718 Main St, Hays, KS 67601, Ph: (785) 628-9460",
	},
	{
		county: "lincoln",
		base: "https://ks497.cichosting.com/ttp/Tax",
		taxing_authority:
			"Lincoln County Treasurer, 216 E Lincoln Ave, Lincoln, KS 67455, Ph: (785) 524-4751",
	},
	{
		county: "miami",
		base: "https://ks244.cichosting.com/ttp/tax",
		taxing_authority:
			"Miami County Treasurer, 201 S Pearl St, Paola, KS 66071, Ph: (913) 294-6164",
	},
	{
		county: "stafford",
		base: "https://ks526.cichosting.com/ttp/tax",
		taxing_authority:
			"Stafford County Treasurer, 209 N Broadway St, St John, KS 67576, Ph: (620) 549-3243",
	},
	{
		county: "seward",
		base: "https://ks1663.cichosting.com/ttp/tax",
		taxing_authority:
			"Seward County Treasurer, 515 N Washington Ave, Liberal, KS 67901, Ph: (620) 626-3355",
	},
	{
		county: "clay",
		base: "https://ks278.cichosting.com/ttp/tax",
		taxing_authority:
			"Clay County Treasurer, 712 5th St, Clay Center, KS 67432, Ph: (785) 632-2413",
	},
	{
		county: "finney",
		base: "https://ks821.cichosting.com/ttp/tax",
		taxing_authority:
			"Finney County Treasurer, 311 N 9th St, Garden City, KS 67846, Ph: (620) 272-3500",
	},
	{
		county: "atchison",
		base: "https://ks825.cichosting.com/ttp/tax",
		taxing_authority:
			"Atchison County Treasurer, 423 N 5th St, Atchison, KS 66002, Ph: (913) 804-6050",
	},
	{
		county: "barber",
		base: "https://ks294.cichosting.com/TTP/tax",
		taxing_authority:
			"Barber County Treasurer, 120 E Washington St, Medicine Lodge, KS 67104, Ph: (620) 886-3961",
	},
	{
		county: "marshall",
		base: "https://ks283.cichosting.com/ttp/tax",
		taxing_authority:
			"Marshall County Treasurer, 1201 Broadway St, Marysville, KS 66508, Ph: (785) 562-5365",
	},
	{
		county: "lyon",
		base: "https://ks1058.cichosting.com/ttp/tax",
		taxing_authority:
			"Lyon County Treasurer, 430 Commercial St, Emporia, KS 66801, Ph: (620) 341-3280",
	},
	{
		county: "crawford",
		base: "https://ks282.cichosting.com/ttp/tax",
		taxing_authority:
			"Crawford County Treasurer, 111 E Forest Ave, Girard, KS 66743, Ph: (620) 724-6115",
	},
	{
		county: "kingman",
		base: "https://ks1080.cichosting.com/ttp/tax",
		taxing_authority:
			"Kingman County Treasurer, 130 N Spruce St, Kingman, KS 67068, Ph: (620) 532-1891",
	},
	{
		county: "nemaha",
		base: "https://ks284.cichosting.com/ttp/tax",
		taxing_authority:
			"Nemaha County Treasurer, 607 Nemaha St, Seneca, KS 66538, Ph: (785) 336-3912",
	},
	{
		county: "osage",
		base: "https://ks827.cichosting.com/ttp/tax",
		taxing_authority:
			"Osage County Treasurer, 717 Topeka Ave, Lyndon, KS 66451, Ph: (785) 828-3121",
	},
	{
		county: "mcpherson",
		base: "https://ks300.cichosting.com/ttp/tax",
		taxing_authority:
			"McPherson County Treasurer, 117 N Maple St, McPherson, KS 67460, Ph: (620) 241-1820",
	},
	{
		county: "ness",
		base: "https://ks527.cichosting.com/ttp/tax",
		taxing_authority:
			"Ness County Treasurer, 202 W Sycamore St, Ness City, KS 67560, Ph: (785) 798-2401",
	},
	{
		county: "wabaunsee",
		base: "https://ks1052.cichosting.com/ttp/tax",
		taxing_authority:
			"Wabaunsee County Treasurer, 215 Kansas Ave, Alma, KS 66401, Ph: (785) 765-3812",
	},
	{
		county: "dickinson",
		base: "https://ks479.cichosting.com/ttp/tax",
		taxing_authority:
			"Dickinson County Treasurer, 109 E 1st St, Abilene, KS 67410, Ph: (785) 263-2551",
	},
	{
		county: "morris",
		base: "https://ks288.cichosting.com/ttp/tax",
		taxing_authority:
			"Morris County Treasurer, 501 W Main St, Council Grove, KS 66846, Ph: (620) 767-5518",
	},
	{
		county: "geary",
		base: "https://ks296.cichosting.com/ttp/tax",
		taxing_authority:
			"Geary County Treasurer, 200 E 8th St, Junction City, KS 66441, Ph: (785) 238-6021",
	},
	{
		county: "ottawa",
		base: "https://ks1497.cichosting.com/ttp/Tax",
		taxing_authority:
			"Ottawa County Treasurer, 307 N Concord St, Minneapolis, KS 67467, Ph: (785) 392-3035",
	},
	{
		county: "wilson",
		base: "https://ks420.cichosting.com/ttp/tax",
		taxing_authority:
			"Wilson County Treasurer, 615 Madison St, Fredonia, KS 66736, Ph: (620) 378-6224",
	},
	{
		county: "barton",
		base: "https://ks761.cichosting.com/ttp/tax",
		taxing_authority:
			"Barton County Treasurer, 1400 Main St, Great Bend, KS 67530, Ph: (620) 793-1831",
	},
	{
		county: "smith",
		base: "https://ks1495.cichosting.com/ttp/Tax",
		taxing_authority:
			"Smith County Treasurer, 218 S Grant St, Smith Center, KS 66967, Ph: (785) 282-5180",
	}
];
// Kansas semi-annual due / delinquency dates
// 1st half : due  Dec 20 of the tax year    | delinquent Jan 1  of (year+1)
// 2nd half : due  May 10 of (year+1)        | delinquent Jun 1  of (year+1)
const ks_dates = (year) => ({
	due_1st: `12/20/${year}`,
	delq_1st: `01/01/${+year + 1}`,
	due_2nd: `05/10/${+year + 1}`,
	delq_2nd: `06/01/${+year + 1}`,
});

// ─────────────────────────────────────────────────────────────
// STEP 1  search_tax.aspx  →  current_tax.aspx
//
//  txtTaxInformation1  = Tax Unit   (e.g. "820")
//  txtTaxInformation2  = Tax Parcel (e.g. "06719")
//  btnFindNow          = <input type="image"> that submits the form
// ─────────────────────────────────────────────────────────────
const gc_1 = async (page, taxUnit, taxParcel, BASE, countyData) => {

	return new Promise(async (resolve, reject) => {
		try {
			await page.goto(`${BASE}/Search/search_tax.aspx`, {
				waitUntil: "domcontentloaded",
			});

			await page.waitForSelector("#txtTaxInformation1", timeout_option);
			await page.waitForSelector("#txtTaxInformation2", timeout_option);

			// .fill() clears the pre-populated value then types the new one
			await page.locator("#txtTaxInformation1").fill(taxUnit);
			await page.locator("#txtTaxInformation2").fill(taxParcel);


			// Click the image-submit button and wait for the resulting navigation
			await page.waitForSelector("#btnFindNow", timeout_option);


			const btn = page.locator("#btnFindNow");

			// await btn.waitFor({ state: "visible" });

			await Promise.all([
				page.waitForNavigation({
					waitUntil: "domcontentloaded",
					timeout: 90000,
				}),
				btn.click({ force: true }),
			]);


			const dest = page.url();

			if (dest.includes("current_tax")) {
				// Single direct match — already on the right page
				return resolve(true);
			}

			if (dest.includes("search_tax_results")) {
				// Multiple results — follow the first link to current_tax
				try {
					await page.waitForSelector(
						"a[href*='current_tax.aspx']",
						timeout_option
					);
					const link = await page.$("a[href*='current_tax.aspx']");
					if (!link) return reject(new Error("No Record Found"));
					await Promise.all([
						page.waitForNavigation({
							waitUntil: "domcontentloaded",
							timeout: 90000,
						}),
						link.click(),
					]);
					return resolve(true);
				} catch (e) {
					return reject(new Error("No Record Found"));
				}
			}

			// Still on search page → nothing found
			if (dest.includes("search_tax")) {
				return reject(new Error("No Record Found"));
			}

			resolve(true);
		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
};

// ─────────────────────────────────────────────────────────────
// STEP 2  current_tax.aspx  →  property info + current-year row
//
//  #tblHeader structure
//  ├── tr[0] td[0](85%) inner table
//  │     tr[0] labels: Type | CAMA Number | Tax Identification
//  │     tr[1] values: RL   | <cama>      | <tax_id>
//  │     tr[2] nested: Owner ID | <id> | <Owner Name>
//  │     tr[3] nested: Taxpayer ID | <id> | <name>
//  │     tr[4] "Situs Address: ..."  (colspan=2)
//  │     tr[5] Subdivision / Section / Township / Range
//  │     tr[6] Tract 1
//  ├── tr[0] td[1](15%)  nav links  (Tax History, etc.)
//  ├── tr[1]             separator bar
//  └── tr[2] td.subwrite[colspan=5]  DATA TABLE
//
//  DATA TABLE column layout (21 TDs, indices 0-20):
//  0  Year(link)  2  Stmt#  4  Line#  6  Warrant#  8  SpecDesc
//  10 SpecPayoff  12 1stHalfDue  14 2ndHalfDue  16 TotalDue
//  18 1stHalfPaid(Yes/No)        20 2ndHalfPaid(Yes/No)
// ─────────────────────────────────────────────────────────────
const gc_2 = async (page, taxUnit, taxParcel, countyData) => {
	return new Promise(async (resolve, reject) => {
		try {
			await page.waitForSelector("#tblHeader", timeout_option);

			const page_data = await page.evaluate((countyData) => {
				const datum = {
					processed_date: "",
					order_number: "",
					borrower_name: "",
					owner_name: [],
					property_address: "",
					parcel_number: "",
					cama_number: "",
					land_value: "",
					improvements: "",
					total_assessed_value: "",
					exemption: "",
					total_taxable_value: "",
					taxing_authority: "",
					notes: "",
					delinquent: "NONE",
					tax_history: [],
					// Internal helpers — removed in gc_5
					_cur_rows: [],
					_history_url: "",
				};

				// ── Property info ─────────────────────────────────────────────────
				const infoTbl = document.querySelector(
					"#tblHeader > tbody > tr:first-child > td:first-child > table"
				);
				if (infoTbl) {
					const trs = infoTbl.querySelectorAll(":scope > tbody > tr");

					// tr[1] → RL | cama_number | tax_identification
					if (trs[1]) {
						const tds = trs[1].querySelectorAll("td");
						datum.cama_number = tds[1]?.textContent.trim() || "";
					}

					// tr[2] → nested table row: [0]"Owner ID" [1]<id> [2]<Owner Name>
					if (trs[2]) {
						const row = trs[2].querySelector("table tr");
						if (row) {
							const ntds = row.querySelectorAll("td");
							datum.owner_name[0] = ntds[2]?.textContent.trim() || "N/A";
						}
					}

					// tr[4] → "Situs Address: 6988 OTTER CREEK RD, E; 66441"
					if (trs[4]) {
						datum.property_address = trs[4]
							.querySelector("td")
							?.textContent.replace("Situs Address:", "")
							.replace(/\s+/g, " ")
							.trim() || "N/A";
					}
				}

				// ── Tax History nav link ──────────────────────────────────────────
				const histLink = document.querySelector("a[href*='tax_history.aspx']");
				datum._history_url = histLink ? histLink.href : "";
				datum.taxing_authority = countyData.taxing_authority;

				// ── Current-year data rows ────────────────────────────────────────
				// Every row in the DATA TABLE that has a link to tax_receipt.aspx
				// Rows have exactly 21 TDs; shorter rows are footers/notes — skip them.
				document.querySelectorAll("a[href*='tax_receipt.aspx']").forEach((link) => {
					const row = link.closest("tr");
					if (!row) return;
					const tds = row.querySelectorAll("td");
					if (tds.length < 21) return;
					const year = tds[0]?.textContent.trim();
					if (!year || isNaN(+year)) return;

					datum._cur_rows.push({
						year,
						first_half_due: tds[12]?.textContent.trim().replace(/,/g, "") || "0",
						second_half_due: tds[14]?.textContent.trim().replace(/,/g, "") || "0",
						total_due: tds[16]?.textContent.trim().replace(/,/g, "") || "0",
						first_half_paid: tds[18]?.textContent.trim() === "Yes",
						second_half_paid: tds[20]?.textContent.trim() === "Yes",
						receipt_url: link.href,
					});
				});
				datum.taxing_authority = countyData?.taxing_authority || "";
				return datum;
			}, countyData);

			page_data.parcel_number = `${taxUnit}-${taxParcel}`;
			resolve(page_data);
		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
};

// ─────────────────────────────────────────────────────────────
// STEP 3  tax_history.aspx  →  all historical year rows
//         Handles pagination: Page=2, Page=3 … in URL
//
//  tax_history DATA TABLE column layout (23 TDs, indices 0-22):
//  0  Year(link)  2  OwnerID  4  Stmt#  6  Line#  8  Warrant#
//  10 SpecDesc   12 SpecPayoff
//  14 1stHalfDue  16 2ndHalfDue  18 TotalDue
//  20 1stHalfPaid(Yes/No)         22 2ndHalfPaid(Yes/No)
//
//  NOTE: history table has one extra column (Owner ID at index 2)
//        compared to current_tax — hence all indices shift by 2.
// ─────────────────────────────────────────────────────────────
const gc_3 = async (page, data) => {
	return new Promise(async (resolve, reject) => {
		try {
			if (!data._history_url) {
				return resolve({
					data,
					all_rows: data._cur_rows,
					max_year: data._cur_rows[0]?.year || "0",
				});
			}

			// Scrapes all data rows from whatever page we are currently on
			const scrape_current_page = async () => {
				return page.evaluate(() => {
					const rows = [];

					document.querySelectorAll("a[href*='tax_receipt.aspx']").forEach((link) => {
						const row = link.closest("tr");
						if (!row) return;
						const tds = row.querySelectorAll("td");
						if (tds.length < 23) return;   // skip short footer/note rows
						const year = tds[0]?.textContent.trim();
						if (!year || isNaN(+year)) return;

						rows.push({
							year,
							first_half_due: tds[14]?.textContent.trim().replace(/,/g, "") || "0",
							second_half_due: tds[16]?.textContent.trim().replace(/,/g, "") || "0",
							total_due: tds[18]?.textContent.trim().replace(/,/g, "") || "0",
							first_half_paid: tds[20]?.textContent.trim() === "Yes",
							second_half_paid: tds[22]?.textContent.trim() === "Yes",
							receipt_url: link.href,
						});
					});

					// Find the next-page link.
					// Current page number appears as plain text in <td class="links1">
					// Other pages are <a href="tax_history.aspx?...&Page=N">N</a>
					const currentPageEl = document.querySelector("td.links1");
					const currentPage = currentPageEl
						? parseInt(currentPageEl.textContent.trim())
						: 1;
					const nextPage = currentPage + 1;

					const nextLink = document.querySelector(
						`a[href*='tax_history.aspx'][href*='Page=${nextPage}']`
					);

					return {
						rows,
						next_url: nextLink ? nextLink.href : "",
					};
				});
			};

			// First page of history
			await page.goto(data._history_url, { waitUntil: "domcontentloaded" });
			await page.waitForSelector("#tblHistory", timeout_option);

			let result = await scrape_current_page();
			let hist_rows = [...result.rows];
			let next_url = result.next_url;
			const visited = new Set([page.url()]);

			// Paginate until no more pages
			while (next_url && !visited.has(next_url)) {
				visited.add(next_url);
				await page.goto(next_url, { waitUntil: "domcontentloaded" });
				await page.waitForSelector("#tblHistory", timeout_option);
				result = await scrape_current_page();
				hist_rows = [...hist_rows, ...result.rows];
				next_url = result.next_url && !visited.has(result.next_url)
					? result.next_url
					: "";
			}

			// Merge: current-year row(s) from gc_2 first, history rows after.
			// De-duplicate by year — first occurrence wins (current-year data wins).
			const seen = new Set();
			const combined = [...data._cur_rows, ...hist_rows].filter((r) => {
				if (seen.has(r.year)) return false;
				seen.add(r.year);
				return true;
			});

			// Sort descending (most recent year first)
			combined.sort((a, b) => +b.year - +a.year);

			const max_year = combined[0]?.year || "0";

			resolve({ data, all_rows: combined, max_year });
		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
};

// ─────────────────────────────────────────────────────────────
// STEP 4  tax_receipt.aspx (most-recent year)  →  assessed value
//         + payment dates
//
//  #tblReceipt contains TWO inner <table> elements:
//
//  [0] Details table  (label-spacer-value):
//      td[0]=label   td[1]=spacer   td[2]=value
//
//  [last] Receipts sub-table (NO spacers — 5 plain columns):
//      td[0]=Receipt#  td[1]=Date  td[2]=TaxYear  td[3]=Tax  td[4]=Int/Fee
// ─────────────────────────────────────────────────────────────
const gc_4 = async (page, main_data) => {
	return new Promise(async (resolve, reject) => {
		try {
			const { data, all_rows, max_year } = main_data;
			const cur_row = all_rows.find((r) => r.year === max_year);
			const receipt_url = cur_row?.receipt_url || "";

			if (!receipt_url) {
				return resolve({ data, all_rows, max_year, paid_dates: {} });
			}

			await page.goto(receipt_url, { waitUntil: "domcontentloaded" });
			await page.waitForSelector("#tblReceipt", timeout_option);

			const receipt_data = await page.evaluate(() => {
				const out = {
					total_assessed_value: "",
					total_tax: "",
					paid_dates: {},   // { "2025": ["12/17/2025", ...] }
				};

				const tbl = document.querySelector("#tblReceipt");
				if (!tbl) return out;

				// ── Details inner table ───────────────────────────────────────────
				const detailsTbl = tbl.querySelector("table");
				if (detailsTbl) {
					detailsTbl.querySelectorAll("tr").forEach((row) => {
						const tds = row.querySelectorAll("td");
						if (tds.length < 3) return;
						const label = tds[0].textContent.trim();
						const value = tds[2].textContent.trim();
						if (label.includes("Total Assessed Value")) {
							out.total_assessed_value = value;
						}
						if (label.includes("Total Tax:")) {
							out.total_tax = value;
						}
					});
				}

				// ── Receipts sub-table (last inner table) ─────────────────────────
				const innerTbls = tbl.querySelectorAll("table");
				const payTbl = innerTbls.length >= 2
					? innerTbls[innerTbls.length - 1]
					: null;

				if (payTbl) {
					payTbl.querySelectorAll("tr").forEach((row) => {
						const tds = row.querySelectorAll("td");
						if (tds.length < 5) return;
						const receipt_num = tds[0].textContent.trim();
						if (!receipt_num || isNaN(receipt_num)) return;   // skip header
						const date = tds[1].textContent.trim();
						const tax_year = tds[2].textContent.trim();
						if (!out.paid_dates[tax_year]) out.paid_dates[tax_year] = [];
						out.paid_dates[tax_year].push(date);
					});
				}

				return out;
			});

			data.total_assessed_value = receipt_data.total_assessed_value;

			resolve({ data, all_rows, max_year, paid_dates: receipt_data.paid_dates });
		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
};

// ─────────────────────────────────────────────────────────────
// STEP 5  Data assembly  →  final output object
// ─────────────────────────────────────────────────────────────
const gc_5 = async (page, main_data) => {
	return new Promise(async (resolve, reject) => {
		try {
			const { data, all_rows, max_year, paid_dates } = main_data;

			const main_history = [];

			all_rows.forEach((row) => {
				const { year } = row;
				const dates = ks_dates(year);
				const pay_ds = paid_dates?.[year] || [];

				const fh_amt = parseFloat(row.first_half_due) || 0;
				const sh_amt = parseFloat(row.second_half_due) || 0;

				// ── 1st-half installment status ───────────────────────────────────
				const fh_status = row.first_half_paid
					? "Paid"
					: is_delq(dates.delq_1st) ? "Delinquent" : "Due";

				// ── 2nd-half installment status ───────────────────────────────────
				const sh_status = row.second_half_paid
					? "Paid"
					: is_delq(dates.delq_2nd) ? "Delinquent" : "Due";

				// Elevate delinquency flag on the parent record
				if (fh_status === "Delinquent" || sh_status === "Delinquent") {
					data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
				}

				// ── Build 1st-half history entry ──────────────────────────────────
				main_history.push({
					jurisdiction: "County",
					year,
					payment_type: "Semi-Annual",
					status: fh_status,
					base_amount: `$${fh_amt.toFixed(2)}`,
					amount_paid: row.first_half_paid ? `$${fh_amt.toFixed(2)}` : "$0.00",
					amount_due: row.first_half_paid ? "$0.00" : `$${fh_amt.toFixed(2)}`,
					mailing_date: "N/A",
					due_date: dates.due_1st,
					delq_date: dates.delq_1st,
					paid_date: row.first_half_paid ? (pay_ds[0] || "") : "",
					good_through_date: "",
				});

				// ── Build 2nd-half history entry ──────────────────────────────────
				main_history.push({
					jurisdiction: "County",
					year,
					payment_type: "Semi-Annual",
					status: sh_status,
					base_amount: `$${sh_amt.toFixed(2)}`,
					amount_paid: row.second_half_paid ? `$${sh_amt.toFixed(2)}` : "$0.00",
					amount_due: row.second_half_paid ? "$0.00" : `$${sh_amt.toFixed(2)}`,
					mailing_date: "N/A",
					due_date: dates.due_2nd,
					delq_date: dates.delq_2nd,
					paid_date: row.second_half_paid
						? (pay_ds[row.first_half_paid ? 1 : 0] || "")
						: "",
					good_through_date: "",
				});

				// ── Max-year note ─────────────────────────────────────────────────
				if (year === max_year) {
					data.notes +=
						`, ${year} 1ST INSTALLMENT IS ${fh_status.toUpperCase()}, ` +
						`2ND INSTALLMENT IS ${sh_status.toUpperCase()}, ` +
						`NORMALLY TAXES ARE PAID SEMI-ANNUALLY.`;
				}
			});

			// ── Prior-years prefix ────────────────────────────────────────────────
			const prior_rows = all_rows.filter((r) => r.year !== max_year);
			const all_priors_paid = prior_rows.every(
				(r) => r.first_half_paid && r.second_half_paid
			);

			data.notes =
				(all_priors_paid ? "ALL PRIORS ARE PAID" : "PRIORS ARE DELINQUENT") +
				data.notes +
				" NORMAL DUE DATES ARE 12/20 FOR 1ST HALF, 05/10 FOR 2ND HALF";

			data.tax_history = main_history;

			// Remove internal helpers before returning
			delete data._cur_rows;
			delete data._history_url;

			resolve(data);
		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
};

// ─────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────
const account_search = async (page, countyData, account) => {
	const BASE = countyData.base;

	const cleaned = account.trim().replace(/\s+/, "-");
	const parts = cleaned.split("-");

	if (parts.length < 2) {
		throw new Error("Invalid account format");
	}

	const taxUnit = parts[0].trim();
	const taxParcel = parts.slice(1).join("-").trim();

	await gc_1(page, taxUnit, taxParcel, BASE, countyData);
	const data1 = await gc_2(page, taxUnit, taxParcel, countyData);
	const data2 = await gc_3(page, data1);
	const data3 = await gc_4(page, data2);
	const final = await gc_5(page, data3);

	return final;
};
// ─────────────────────────────────────────────────────────────
// Express handler  (mirrors Maricopa pattern exactly)
// ─────────────────────────────────────────────────────────────
const search = async (req, res) => {
	const { fetch_type, account } = req.body;

	try {

		const countyKey = req.path.split("/").filter(Boolean).pop().toLowerCase();

		const countyData = counties.find(c => c.county === countyKey);

		if (!countyData) {
			return res.status(400).json({ error: "Invalid county" });
		}

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();

		const data = await account_search(page, countyData, account);

		if (fetch_type === "html") {
			res.render("parcel_data_official", data);
		} else {
			res.json({ result: data });
		}

		await context.close();

	} catch (e) {
		console.log(e);
		res.status(500).json({ error: true, message: e.message });
	}
};
export { search };
