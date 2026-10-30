// Author : Harikrishna B


import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
	timeout: 90000
};
// --- STAGE 1: SCRAPE MAIN WEB DATA & TAX HISTORY ---
const ac_1 = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const target_url = `${url}${account}`;
			await page.goto(target_url, { waitUntil: "domcontentloaded" });

			await page.waitForSelector(".main-column forge-card .forge-data-mobile--record-item", timeout_option);

			const page_content = await page.evaluate((account) => {
				const is_delq = (date) => {
					let today = new Date();
					let delq_date = new Date(date);
					if (today >= delq_date) {
						return "Delinquent";
					}
					return "Due";
				};

				const get_next_day = (date) => {
					if (date) {
						const next_date = new Date(date);
						next_date.setDate(next_date.getDate() + 1);
						return (+next_date.getMonth() + 1) + "/" + next_date.getDate() + "/" + next_date.getFullYear();
					}
					return "";
				};

				// Target Initial Base Schema Struct
				const data = {
					processed_date: "",
					order_number: "",
					borrower_name: "",
					owner_name: ['N/A'],
					property_address: "N/A",
					parcel_number: account,
					land_value: "",
					improvements: "",
					total_assessed_value: "",
					exemption: "",
					total_taxable_value: "",
					taxing_authority: "Cape Girardeau County Collector, 1 Barton Square, Suite 301, Jackson, MO 63755",
					notes: "",
					delinquent: "NONE",
					tax_history: []
				};

				// LOCATION AND OWNER NAME EXTRACTION
				const divs = document.querySelectorAll('.forge-data-mobile--record-item');
				let extracted_profile = {};
				divs.forEach(div => {
					let arr = div.textContent;
					if (arr) {
						arr = arr.split('\n').map(x => x.trim()).filter(Boolean);
						if (arr[0] === 'Name' || arr[0] === 'Location') {
							extracted_profile[arr[0]] = arr[1];
						}
					}
				});

				if (extracted_profile['Name']) data['owner_name'] = [extracted_profile['Name']];
				if (extracted_profile['Location']) data['property_address'] = extracted_profile['Location'];

				// TAX HISTORY GENERATION
				let row_data = [];
				let table = document.querySelector('#tax_history');
				if (table) {
					let tbody = table.querySelector('tbody');
					let trs = tbody ? tbody.children : [];
					let index = 0;

					for (let tr of trs) {
						if (tr.classList.contains("forge-table-row")) {
							let tds = tr.querySelectorAll("td");

							let tax_year = tds[2]?.textContent.trim();
							let due_amount = tds[8]?.textContent.trim();
							let paidDate = tds[9]?.textContent.trim() || "N/A";
							let curr_status = "Due";

							const due_date = `12/31/${tax_year}`;
							const delq_date = `01/01/${Number(tax_year) +1 }`; // Directly forces 01/01/NextYear;
							if (due_amount === "$0.00") {
								curr_status = "Paid";
							} else {
								curr_status = is_delq(delq_date);
							}

							if (index == 0 || curr_status != 'Paid') {
								row_data.push({
									jurisdiction: "County",
									year: tax_year,
									payment_type: "Annual",
									status: curr_status,
									base_amount: "", // 
									amount_paid: (curr_status == "Paid") ? tds[7]?.textContent.trim() : "$0.00",
									amount_due: (curr_status != "Paid") ? due_amount : "$0.00",
									mailing_date: "N/A",
									due_date: due_date,
									delq_date: delq_date,
									paid_date: paidDate,
									good_through_date: "",
								});
							}
							index++;
						}
					}
				}
				data['tax_history'] = row_data;
				return data;
			}, account);

			resolve(page_content);
		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
};

// --- STAGE 2: PARSE DETAILED VALUES & MAP FINANCIAL HISTORIES ---
const ac_2 = async (page, main_data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			// Extracting row arrays & values dynamically using page contexts
			const valuation_details = await page.evaluate(() => {
				let row_result = '';
				let annual_taxes = '';
				let header_data = {};

				let header = document.querySelector('.forge-table thead tr');
				if (header) {
					let header_tds = header.querySelectorAll("th");
					header_tds.forEach((th, i) => {
						let txt = th.textContent.trim();
						if (txt.includes("Assessed")) {
							header_data[i + 1] = {
								index: i + 1,
								Ayear: txt.split(" ")[0],
							};
						}
					});
				}
                const base_tax = document.querySelector('#tax_history #row_detail_0 tbody tr td .text-left').textContent.trim() 
				
                let row_values = Array.from(document.querySelectorAll('.forge-table tbody tr'));
				row_values.forEach(rows => {
					let cells = rows.querySelectorAll('td');
					if (cells && cells.length > 0) {
						if (cells[0].innerText.trim() === 'Net Value') {
							row_result = cells[2].innerText.trim();
						} else if (cells[0].innerText.toLowerCase().trim() === "net annual taxes") {
							annual_taxes = cells[2].innerText.trim();
						}
					}
				});

				return {
					total_value: row_result,
					annual_taxes: annual_taxes,
                    base_amount :base_tax
				};
			});

             main_data['tax_history'].forEach(entry => {
                entry.base_amount = valuation_details.base_amount;
                 });

			// Remove any existing dollar signs or commas, then parse as an integer or float
			const raw_numeric_value = valuation_details.total_value 
				? parseFloat(valuation_details.total_value.replace(/[^0-9.]/g, '')) 
				: 0;

			// Format using toLocaleString to enforce commas
			const formatted_value = isNaN(raw_numeric_value) || raw_numeric_value === 0
				? "$0.00" 
				: "$" + raw_numeric_value.toLocaleString('en-US');

			// Normalizing and remapping parameters back into our structural payload
			main_data['total_assessed_value'] = formatted_value;
			main_data['total_taxable_value'] = formatted_value;

			// CALCULATING DYNAMIC SYSTEM NOTES & DELINQUENCY STATUS
			const paid_entries = main_data['tax_history'].filter(entry => entry.status === "Paid");
			const paid_year = paid_entries.map(entry => entry.year).join(", ");

			const unpaid_entries = main_data['tax_history'].filter(entry => entry.status !== "Paid");
			

			if (unpaid_entries.length === 0) {
				main_data['notes'] = `ALL PRIORS ARE PAID, ${paid_year ? paid_year : 'CURRENT'} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 12/31`;
				main_data['delinquent'] = "NONE";
			} else {
				// 1. Sort the unpaid entries so the highest/latest year is at index 0
  				const sorted_unpaid = unpaid_entries.sort((a, b) => parseInt(b.year) - parseInt(a.year));
  
  				// 2. Safely extract only the latest year string
  				const latest_unpaid_year = sorted_unpaid[0]?.year || "CURRENT";
				main_data['notes'] = `PRIORS ARE DELINQUENT, ${latest_unpaid_year} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 12/31`;
				main_data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
			}
			resolve(main_data);
		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
};

// --- STAGE 3: AGGREGATE PROMISE CHAIN CONTROL FLOW ---
const account_search = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			ac_1(page, url, account)
			.then((data1) => {
				ac_2(page, data1, account)
				.then((data2) => {
					resolve(data2);
				})
				.catch((error) => {
					console.log(error);
					reject(new Error(error.message));
				});
			})
			.catch((error) => {
				console.log(error);
				reject(new Error(error.message));
			});
		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
};


const search = async (req, res) => {
	const { fetch_type, account } = req.body;
	try{
		
		if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
			return res.status(200).render('error_data', {
				error: true,
				message: "Invalid Access"
			});
		}

		const url = "https://capegirardeaucounty.municipalonlinepayments.com/capegirardeaucounty/tax/search/detail?id=";

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

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

		if(fetch_type == "html"){
			// FRONTEND ENDPOINT
			account_search(page, url, account)
			.then((data) => {
				res.status(200).render("parcel_data_official", data);
			})
			.catch((error) => {
				console.log(error)
				res.status(200).render('error_data', {
					error: true,
					message: error.message
				});
			})
			.finally(async () => {
				await context.close();
			});
		}
		else if(fetch_type == "api"){
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
			.finally(async() => {
				await context.close();
			});
		}

	}
	catch(error){
		console.log(error);
		if(fetch_type == "html"){
			res.status(200).render('error_data', {
				error: true,
				message: error.message
			});
		}
		else if(fetch_type == "api"){
			res.status(500).json({
				error: true,
				message: error.message
			});
		}
	}
}

export {
	search
}
