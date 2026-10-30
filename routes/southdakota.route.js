import express from "express";
import { search as sd_govtech } from "../controllers/SD/govtech_sd.controller.js";

// Author:- Bhagyashree Badadal
import { search as edmunds_search } from "../controllers/SD/edmunds.controller.js";

const route = express.Router();

// Author: Mayank Nandgowle
route.post("/clark",     sd_govtech);
route.post("/codington", sd_govtech);
route.post("/custer",    sd_govtech);
route.post("/deuel",     sd_govtech);
route.post("/hamlin",    sd_govtech);
route.post("/kingsbury", sd_govtech);
route.post("/moody",     sd_govtech);
route.post("/yankton",   sd_govtech);

// Author:- Bhagyashree Badadal
route.post("/edmunds", edmunds_search);

export default route;
