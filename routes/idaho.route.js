import express from "express";

// Author:- Bhagyashree Badadal
import { search as kootenai_search } from "../controllers/ID/kootenai.controller.js";
import { search as canyon_search } from "../controllers/ID/canyon.controller.js";
import { search as payette_search } from "../controllers/ID/payette.controller.js";

const route = express.Router();

// Author:- Bhagyashree Badadal
route.post("/kootenai", kootenai_search);
route.post("/canyon", canyon_search);
route.post("/payette", payette_search);

export default route;