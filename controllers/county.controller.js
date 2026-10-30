import connectDB from "../db/connection.js";

const add_county_form = (req, res) => {
	try{
		res.render('county/add_county_form');
	}
	catch(error){
		console.log(error);
		return res.redirect('/login');
	}
}

const add_county = async (req, res) => {
	try{
		const { state_code, state_name, county_name, website_link, path, status } = req.body;

		if(!state_code || !state_name || !county_name || !website_link || !path || !status){
			return res.status(500).json({
				error: true,
				message: "Please fill all the input"
			});
		}

		// CHECK IF THE DATA IS ALREADY PRESENT
		const conn = await connectDB();
		const sql = `SELECT COUNT(*) AS existingCount FROM county_test_2 WHERE (state_code='${state_code}' AND county_name='${county_name}') or path='${path}'`;
		const [sqlResult] = await conn.query(sql);
		const existingCount = sqlResult[0].existingCount;

		if(existingCount > 0){
			return res.status(500).json({
				error: true,
				message: "State and County already exists"
			}); 
		}

		// INSERT NEW DATA TO DATABASE
		const insertQuery = `INSERT INTO county_test_2(state_name, state_code, county_name, property_tax_link, path, status) VALUES ('${state_name}', '${state_code}', '${county_name}', '${website_link}', '${path}', '${status}')`;
		const [result] = await conn.query(insertQuery);
		await conn.end();

		return res.status(200).json({
			status: true,
			message: "County data successfully added"
		});
		
	}
	catch(error){
		console.log(error);
		return res.status(500).json({
			error: true,
			message: error.message
		})
	}
}
const edit_county_form = (req, res) => {
	try{
		res.render('county/edit_county_form');
	}
	catch(error){
		console.log(error);
		return res.redirect('/login');
	}
}

const delete_county_form = (req, res) => {
	try{
		res.render('county/delete_county_form');
	}
	catch(error){
		console.log(error);
		return res.redirect('/login');
	}
}

const search_county = async (req, res) => {
	try{
		const { state_code, county_name } = req.query;

		const conn = await connectDB();
		let sql = `SELECT * FROM county_test_2 WHERE 1=1`;
		
		if(state_code && state_code !== '') {
			sql += ` AND state_code='${state_code}'`;
		}
		
		if(county_name && county_name !== '') {
			sql += ` AND county_name LIKE '%${county_name}%'`;
		}

		sql += ` ORDER BY state_code, county_name`;

		const [result] = await conn.query(sql);
		await conn.end();

		return res.status(200).json({
			status: true,
			data: result
		});
		
	}
	catch(error){
		console.log(error);
		return res.status(500).json({
			error: true,
			message: error.message
		})
	}
}

const get_county = async (req, res) => {
	try{
		const { id } = req.params;

		if(!id) {
			return res.status(400).json({
				error: true,
				message: "County ID is required"
			});
		}

		const conn = await connectDB();
		const sql = `SELECT * FROM county_test_2 WHERE id='${id}'`;
		const [result] = await conn.query(sql);
		await conn.end();

		if(result.length === 0) {
			return res.status(404).json({
				error: true,
				message: "County not found"
			});
		}

		return res.status(200).json({
			status: true,
			data: result[0]
		});
		
	}
	catch(error){
		console.log(error);
		return res.status(500).json({
			error: true,
			message: error.message
		})
	}
}

const edit_county = async (req, res) => {
	try{
		const { id, state_code, state_name, county_name, website_link, path, status } = req.body;

		if(!id || !state_code || !state_name || !county_name || !website_link || !path || !status){
			return res.status(500).json({
				error: true,
				message: "Please fill all the input"
			});
		}

		// CHECK IF THE DATA EXISTS
		const conn = await connectDB();
		const checkSql = `SELECT COUNT(*) AS existingCount FROM county_test_2 WHERE id='${id}'`;
		const [checkResult] = await conn.query(checkSql);
		const existingCount = checkResult[0].existingCount;

		if(existingCount === 0){
			await conn.end();
			return res.status(404).json({
				error: true,
				message: "County not found"
			}); 
		}

		// CHECK IF ANOTHER COUNTY HAS THE SAME PATH (excluding current county)
		const pathCheckSql = `SELECT COUNT(*) AS pathCount FROM county_test_2 WHERE path='${path}' AND id!='${id}'`;
		const [pathCheckResult] = await conn.query(pathCheckSql);
		const pathCount = pathCheckResult[0].pathCount;

		if(pathCount > 0){
			await conn.end();
			return res.status(500).json({
				error: true,
				message: "Path already exists for another county"
			}); 
		}

		// UPDATE DATA IN DATABASE
		const updateQuery = `UPDATE county_test_2 SET state_name='${state_name}', state_code='${state_code}', county_name='${county_name}', property_tax_link='${website_link}', path='${path}', status='${status}' WHERE id='${id}'`;
		const [result] = await conn.query(updateQuery);
		await conn.end();

		return res.status(200).json({
			status: true,
			message: "County data successfully updated"
		});
		
	}
	catch(error){
		console.log(error);
		return res.status(500).json({
			error: true,
			message: error.message
		})
	}
}

const delete_county = async (req, res) => {
	try{
		const { id } = req.params;

		if(!id) {
			return res.status(400).json({
				error: true,
				message: "County ID is required"
			});
		}

		// CHECK IF THE COUNTY EXISTS
		const conn = await connectDB();
		const checkSql = `SELECT COUNT(*) AS existingCount FROM county_test_2 WHERE id='${id}'`;
		const [checkResult] = await conn.query(checkSql);
		const existingCount = checkResult[0].existingCount;

		if(existingCount === 0){
			await conn.end();
			return res.status(404).json({
				error: true,
				message: "County not found"
			}); 
		}

		// DELETE THE COUNTY
		const deleteQuery = `DELETE FROM county_test_2 WHERE id='${id}'`;
		const [result] = await conn.query(deleteQuery);
		await conn.end();

		return res.status(200).json({
			status: true,
			message: "County successfully deleted"
		});
		
	}
	catch(error){
		console.log(error);
		return res.status(500).json({
			error: true,
			message: error.message
		})
	}
}

export {
	add_county_form,
	add_county,
	edit_county_form,
	delete_county_form,
	search_county,
	get_county,
	edit_county,
	delete_county
}
