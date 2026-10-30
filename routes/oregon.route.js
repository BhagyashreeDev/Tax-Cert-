import express from "express";

// Author:- Bhagyashree Badadal
import { search as wasco_county } from "../controllers/OR/wasco.controller.js";
import {search as multnomah_search} from "../controllers/OR/multnomah.controller.js";


const route = express.Router();

// Author:- Bhagyashree Badadal
route.post("/wasco", wasco_county);
route.post("/multnomah", multnomah_search);

export default route;