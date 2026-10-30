import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
	"grayson": { url:"http://75.146.12.30/Tax_KY_Web/Login.aspx", auth: "Grayson County Sheriff, 117 S. Main St. Leitchfield, KY 42754"},
	"letcher": { url:"http://76.72.195.109/Tax_KY_Web/Login.aspx", auth: "LETCHER CO SHERIFF'S OFFICE, 6 BROADWAY ST., WHITESBURG, KY 41858"},
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

const generate_notes = (year, keys, status) => {
	let notes = "";
	try{
		notes = (keys == 1) ? `ALL PRIORS ARE PAID. ${year} ` : `PRIORS ARE DELINQUENT. ${year} `;	
		notes += `TAXES ARE ${status.toUpperCase()},`;
		notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;	
		notes += ` NORMAL DUE DATE IS 12/31 AND DELINQUENT FROM 01/01`;
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
			await page.goto(url, { waitUntil: "domcontentloaded"});

			// LOGIN
			await page.waitForSelector("#Login", timeout_option);
			Promise.all([
				page.locator("#Login").click(),
				page.waitForNavigation()
			])
			.then(() => {
				resolve(true);
			})
			.catch((error) => {
				console.log(error);
				reject(new Error("Login Unsuccessfull"));
			});		
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_2 = (page, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			// PARCEL IN INPUT
			await page.waitForSelector("#Search", timeout_option);
			await page.locator("#Search").fill(account);

			await page.waitForSelector("#Searchby", timeout_option);
			await page.select('#Searchby', 'Map Number');

			await page.waitForSelector("#btnSearch", timeout_option);

			Promise.all([
				page.locator('#btnSearch').click(),
				page.waitForNavigation()
			])
			.then(() => {
				resolve(true);
			})
			.catch((error) => {
				console.log(error);
				reject(new Error("Record not found"));
			});

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_3 = (page, account, county) => {
	return new Promise(async (resolve, reject) => {
		try{

			// BILL INFO
			await page.waitForSelector("#BillInfo", timeout_option);
			let bill_info = await page.evaluate(() => {
				const table = document.querySelector("#BillInfo");

				let amount_due = table.querySelector("#lblBalanceDueTop")?.textContent.trim() ?? 0;
				let year = table.querySelector("#lblTaxYear")?.textContent.trim();
				let owner_name = table.querySelector("#lblName")?.textContent.trim() ?? "N/A";

				return { amount_due, year, owner_name };
			});

			// PROPERTY INFO
			await page.waitForSelector("#PropInfo", timeout_option);
			let property_address = await page.evaluate(() => {
				const table = document.querySelector("#PropInfo");
				let property_address = table.querySelector("#lblPropertyAddress")?.textContent.trim();
				return property_address ?? "N/A";
			});

			// TAX INFO
			await page.waitForSelector("#TaxInfo #DataGridTaxes", timeout_option);
			let tax_info = await page.evaluate(() => {		
				let assessed_value = "N/A";
				let base_amount = "$0.00";

				const table = document.querySelector("#TaxInfo #DataGridTaxes");
				const trs = table.querySelectorAll("tbody tr");

				let second_row = trs[1];
				let second_tds = second_row.querySelectorAll("td");
				assessed_value = second_tds[second_tds.length - 2]?.textContent.trim() ?? "0.00";

				let last_row = trs[trs.length - 1];
				base_amount = last_row?.lastElementChild?.textContent.trim() ?? "$0.00";

				return { assessed_value, base_amount };
			});

			// PAYMENT INFO
			await page.waitForSelector("#PaymentInfo #GridPayments", timeout_option);
			let payment_info = await page.evaluate(() => {		
				let payment_date = "N/A";
				let amount_paid = "$0.00";

				const table = document.querySelector("#PaymentInfo #GridPayments");
				const trs = table.querySelectorAll("tbody tr");

				let second_row = trs[1];	
				let second_tds = second_row.querySelectorAll("td");	

				if(trs.length > 2){
					payment_date = second_tds[second_tds.length - 2]?.textContent.trim();		
					let date_obj = new Date(payment_date);
					payment_date = (date_obj.getMonth() + 1) +"/"+ date_obj.getDate() +"/"+ date_obj.getFullYear();		
				}
				else{
					payment_date = "";
				}
		
				amount_paid = second_tds[second_tds.length - 1]?.textContent.trim();

				return { payment_date, amount_paid };
			});

			let year = bill_info['year'];
			let status = (+bill_info['amount_due'] == 0) ? "Paid" : is_delq(`01/01/${+year+1}`);

			let main_data = {
				processed_date : "",
				order_number : "",
				borrower_name: "",
				owner_name: [bill_info['owner_name']],
				property_address: property_address,
				parcel_number: account,
				land_value: "",
				improvements: "",
				total_assessed_value: "$"+tax_info['assessed_value'],
				exemption: "",
				total_taxable_value: "$"+tax_info['assessed_value'],
				taxing_authority: county_data[county]['auth'],
				notes: "",
				delinquent:"NONE",
				tax_history: []
			};
			let th = {
				jurisdiction: "County",
				year: year,
				payment_type: "Annual",
				status: status,
				base_amount: "$"+tax_info['base_amount'],
				amount_paid: "$"+payment_info['amount_paid'],
				amount_due: "$"+bill_info['amount_due'],
				mailing_date: "N/A",
				due_date: `31/12/${year}`,
				delq_date: `01/01/${+year+1}`,
				paid_date: payment_info['payment_date'],
				good_through_date: "",
			}; 

			main_data['tax_history'].push(th);
			main_data['notes'] = generate_notes(bill_info['year'], 1, status);
			main_data['delinquent'] = (status == "Delinquent") ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

			resolve(main_data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

const account_search = async (page, url, account, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			ac_1(page, url, account)
			.then((data1) => {
				
				ac_2(page, account)
				.then((data2) => {	

					ac_3(page, account, county)
					.then((data3) => {				
						resolve(data3);				
					})
					.catch((error) =>{
						reject(new Error(error.message));
					});

				})
				.catch((error) =>{
					reject(new Error(error.message));
				});		

			})
			.catch((error) =>{
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
	const { county, url_str } = req;
	try{	

		if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
			return res.status(200).render('error_data', {
				error: true,
				message: "Invalid Access"
			});
		}

		const url = county_data[county]['url'];

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

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
			account_search(page, url, account, county)
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
				try{
					await context.close();
				}
				catch(error){
					console.log(error)
				}	
			});
		}
		else if(fetch_type == "api"){
			// API ENDPOINT
			account_search(page, url, account, county)
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
				try{
					await context.close();
				}
				catch(error){
					console.log(error)
				}
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