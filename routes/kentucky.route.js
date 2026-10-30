import express from "express";

import { search as common_taxkyweb_search } from "../controllers/KY/common_taxkyweb.controller.js";

const route = express.Router();

route.post("/grayson", (req, res, next) => { req.county="grayson"; next(); },  common_taxkyweb_search);
route.post("/letcher", (req, res, next) => { req.county="letcher"; next(); },  common_taxkyweb_search);

export default route;