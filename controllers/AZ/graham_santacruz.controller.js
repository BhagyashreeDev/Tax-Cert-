import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
	"graham": {
		url: "https://gcwebinfo.graham.az.gov/WebPayments/PropertyInformation",
		auth: "Graham County Treasurer, 921 Thatcher Boulevard, 1st Floor, Safford, AZ 85546"
	},
	"santa-cruz": {
		url: "https://parcelsearch.santacruzcountyaz.gov/santacruzwebpay/propertyinformation",
		auth: "Santa Cruz County Treasurer, 2150 N Congress Dr, Ste 104, Nogales, AZ 85621-1090"
	}
};

const timeout_option = {
	timeout: 90000
};

const is_delq = (date) => {
	let today = new Date();
	let delq_date = new Date(date);
	if(today >= delq_date){
		return "Delinquent";
	}
	return "Due";
}

const generate_notes = (year, keys, status, type) => {
	let notes = "";
	try{
		notes = (keys == 1) ? `ALL PRIORS ARE PAID. ${year} ` : `PRIORS ARE DELINQUENT. ${year} `;

		if(type == "Annual"){
			notes += `TAXES ARE ${status[0].toUpperCase()},`;
			notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
		}
		else{
			status.forEach((s, i) => {
				notes += `#${i+1} INSTALLMENT IS ${status[i].toUpperCase()}, `
			});
			notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY,`;
		}
		notes += ` NORMAL DUE DATES ARE 12/31 FOR ANNUAL, 10/01 AND 03/01 FOR SEMI-ANNUAL`;
	}
	catch(error){
		console.log(error);
	}
	finally{
		return notes;
	}
}

const ac_1 = (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});
			account = account.replace(/[- ]/g, '');

			await page.waitForSelector("#txtParcelNumber", timeout_option);
			await page.locator("#txtParcelNumber").fill(account);

			await page.waitForSelector("#btnFindAccount", timeout_option);

			Promise.all([
				page.waitForNavigation(),
				page.locator("#btnFindAccount").click()
			])
			.then(() => {
				resolve(true);
			})
			.catch((error) => {
				reject(new Error(error.message));
			});
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

const ac_2 = (page) => {
	return new Promise(async(resolve, reject) => {
		try{
			await page.waitForSelector("#myTab #nextyear-tab", timeout_option);
			await page.locator("#myTab #nextyear-tab").click();
			await page.waitForSelector("#myTabContent #nextyear");
			const owner_values = await page.evaluate(() => {
				let owner = "";
				let av = "$0.00";

				const owner_div = document.querySelector("#myTabContent #nextyear #lblOwnership_NextYear");
				if(owner_div){
					owner = owner_div.innerHTML;
				}

				const av_div = document.querySelector("#myTabContent #nextyear #lblFullCashAssess_NextYear");
				if(av_div){
					av = av_div.textContent.trim();
				}
				return { owner, av };
			});

			await page.waitForSelector("#myTab #taxes-tab", timeout_option);
			await page.locator("#myTab #taxes-tab").click();
			await page.waitForSelector("#myTabContent #taxes #grdTaxHistory");
			const tax_data = await page.evaluate(() => {
				let header = {
					year: "",
					amount_due: "",
					status: "",
					base_amount: "",
					amount_paid: "",
					first_half: "",
					sec_half: ""	
				};
				let max_year = 0;
				let year_map = {};
				const rows = document.querySelectorAll("#myTabContent #taxes #grdTaxHistory tbody tr");
				for(let i=0; i<rows.length; i++){
					if(i == 0){
						let ths = rows[i].querySelectorAll("th");
						ths.forEach((th, j) => {
							let txt = th?.textContent.trim().toLowerCase();
							if(txt.includes('year')){ header['year'] = j; }
							else if(txt.includes('balance')){ header['amount_due'] = j; }
							else if(txt.includes('status')){ header['status'] = j; }
							else if(txt.includes('taxes')){ header['base_amount'] = j; }
							else if(txt.includes('payments')){ header['amount_paid'] = j; }
							else if(txt.includes('1st half')){ header['first_half'] = j; }
							else if(txt.includes('2nd half')){ header['sec_half'] = j; }
						});
					}
					else{
						let tds = rows[i].querySelectorAll("td");

						let year_txt = tds[header['year']]?.textContent.trim();
						let year = year_txt.split(" ")[0];

						let status_str = tds[header['status']]?.textContent.trim();
						let status = (status_str == "Zero Balance") ? "Paid" : "Due";

						if(max_year == 0 || (max_year != 0 && status == "Due")){
							if(max_year == 0){
								max_year = year;
							}													
							year_map[year] = {														
								year: year,							
								status: status,
								base_amount: tds[header['base_amount']]?.textContent.trim(),
								amount_paid: tds[header['amount_paid']]?.textContent.trim(),
								amount_due: tds[header['amount_due']]?.textContent.trim(),								
								first_half: tds[header['first_half']]?.textContent.trim(),
								sec_half: tds[header['sec_half']]?.textContent.trim(),
								a_id: null
							};
							let a_id = tds[header['amount_paid']]?.querySelector('a');
							if(a_id && a_id.getAttribute('href')){
								year_map[year]['a_id'] = a_id.getAttribute('id');
							}
						}					
						else{
							break;
						}
					}
				}
				return {max_year, year_map};
			});
			let {max_year, year_map} = tax_data;
			resolve({owner_values, year_map, max_year});
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_3 = (page, data, account, tax_auth) => {
	return new Promise(async(resolve, reject) => {
		try{
			let owner_values = data['owner_values'];
			let year_map = data['year_map'];
			let max_year = data['max_year'];

			for(let year in year_map){
				year_map[year]['data'] = [];

				let a_id = year_map[year]['a_id'];
				if(a_id){
					await Promise.all([
						page.waitForNavigation(),
						page.evaluate((a_id) => { document.querySelector(`#${a_id}`)?.click(); }, a_id)
					]);
					await page.waitForSelector("#grdPaymentHist", timeout_option);
					let p_data = await page.evaluate(() => {
						let rows = document.querySelectorAll("#grdPaymentHist tbody tr");
						let data = [];
						for(let i=1; i<rows.length; i++){
							let tds = rows[i].querySelectorAll("td");
							let amount_paid = tds[0]?.textContent.trim();
							let paid_date = tds[1]?.textContent.trim();
							let amount_due = "$0.00";
							if(amount_paid && paid_date){
								data.push({amount_paid, paid_date, amount_due, paid: true});
							}						
						}
						return data;
					});
					year_map[year]['data'] = p_data;
				}		
			}

			// DATA MANIPULATION		
			let owner_str = owner_values['owner'];
			let owner_arr = owner_str.split("<br>");
			let owner_name = owner_arr.shift();
			let address = owner_arr.join(",");
			let av = owner_values['av']
			let main_data = {
				processed_date : "",
				order_number : "",
				borrower_name: "",
				owner_name: [owner_name],
				property_address: address,
				parcel_number: account,
				land_value: "",
				improvements: "",
				total_assessed_value: av,
				exemption: "",
				total_taxable_value: av,
				taxing_authority: tax_auth,
				notes: "",
				delinquent:"NONE",			
				tax_history: []
			}; 

			let delq_status = false;
			let status_arr = [];
			let current_payment_type = "Annual";
			let h_template = {							
				jurisdiction: "County",
				year: "",
				payment_type: "Annual",
				status: "",
				base_amount: "",
				amount_paid: "$0.00",
				amount_due: "$0.00",
				mailing_date: "N/A",
				due_date: "",
				delq_date: "",
				paid_date: "",
				good_through_date: "",
			};
			for(let year in year_map){
				let paid_length = year_map[year]['data'].length;
				if(paid_length == 0){				
					let base_amt = +year_map[year]['base_amount'] / 2;
					let amt_due = +year_map[year]['amount_due'] / 2;
					for(let i=1; i<=2; i++){
						let h = {...h_template};
						let status = (i == 1) ? is_delq(year_map[year]['first_half']) : is_delq(year_map[year]['sec_half'])
						delq_status = (status == "Delinquent") ? true : false;
						if(year == max_year){
							status_arr.push(status);
							current_payment_type = "Installment";
						}

						h['year'] = year;
						h['payment_type'] = "Installment "+i;
						h['status'] = status;
						h['base_amount'] = base_amt;
						h['amount_due'] = amt_due;
						h['due_date'] = (i == 1) ? `10/01/${+year}` : `03/01/${+year+1}`;
						h['delq_date'] = (i == 1) ? year_map[year]['first_half'] : year_map[year]['sec_half'];
						main_data['tax_history'].push(h);
					}
				}
				else{
					let base_amt = +year_map[year]['base_amount'];
					let amt_due = +year_map[year]['amount_due'];
					let payment_type = "Annual";

					if(amt_due == 0){
						if(paid_length > 1){
							payment_type = "Installment";
							base_amt = +base_amt / 2;
						}
					}
					else{					
						payment_type = "Installment";
						base_amt = +base_amt / 2;	
						year_map[year]['data'].push({ amount_paid: "$0.00", paid_date: "", amount_due: amt_due, paid: false })
					}
				
					year_map[year]['data'].forEach((row, i) => {
						let h = {...h_template};
						let status = row['paid'] ? "Paid" : (i == 1) ? is_delq(year_map[year]['first_half']) : is_delq(year_map[year]['sec_half']);
						delq_status = (status == "Delinquent") ? true : false;
						if(year == max_year){
							status_arr.push(status);
							current_payment_type = payment_type;
						}

						h['year'] = year;
						h['payment_type'] = (payment_type == "Annual") ? "Annual" : `${payment_type} ${i+1}`;
						h['status'] = status;
						h['base_amount'] = base_amt;
						h['amount_paid'] = row['amount_paid'];
						h['amount_due'] = row['amount_due'];
						h['paid_date'] = row['paid_date'];
						h['due_date'] = (i == 0) ? `10/01/${+year}` : `03/01/${+year+1}`;
						h['delq_date'] = (i == 0) ? year_map[year]['first_half'] : year_map[year]['sec_half'];
						main_data['tax_history'].push(h);
					});					
					
				}
			}
			main_data['notes'] = generate_notes(max_year, Object.keys(year_map).length, status_arr, current_payment_type);
			main_data['delinquent'] = delq_status ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

			resolve(main_data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

const account_search = (page, url, account, tax_auth) => {
	return new Promise(async (resolve, reject) => {
		try{

			ac_1(page, url, account)
			.then((data1) => {	

				ac_2(page)
				.then((data2) => {		

					ac_3(page, data2, account, tax_auth)
					.then((data3) => {		
						resolve(data3);
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

			})
			.catch((error) => {
				console.log(error);
				reject(new Error(error.message));
			});

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

const search = async (req, res) => {
	const { fetch_type, account } = req.body;
	try{		
		const url = county_data[req.county]['url'];
		const tax_auth = county_data[req.county]['auth'];

		if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
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

		// INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
		await page.setRequestInterception(true);
		page.on('request', (req) => {
			if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
				req.abort();
			} else {
				req.continue();
			}
		});

		if(fetch_type == "html"){
			// FRONTEND ENDPOINT
			account_search(page, url, account, tax_auth)
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
			account_search(page, url, account, tax_auth)
			.then((data) => {
				res.status(200).json({
					result: data
				})
			})
			.catch((error) => {
				console.log(error);
				res.status(500).json({
					error: true,
					message: error.message
				})
			})
			.finally(async () => {
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

export { search };