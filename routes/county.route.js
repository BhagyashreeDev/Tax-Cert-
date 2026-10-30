import express from "express";

import {
	add_county_form,
	add_county,
	edit_county_form,
	delete_county_form,
	search_county,
	get_county,
	edit_county,
	delete_county
} from "../controllers/county.controller.js";

const route = express.Router();

route.get("/add", add_county_form);
route.post("/add", add_county);

route.get("/edit", edit_county_form);
route.put("/edit", edit_county);

route.get("/delete", delete_county_form);
route.delete("/delete/:id", delete_county);

route.get("/search", search_county);
route.get("/get/:id", get_county);

export default route;
