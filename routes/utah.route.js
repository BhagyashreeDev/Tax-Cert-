import express from "express";
// Author :- Bhagyashree Badadal
import { search as cache_county } from "../controllers/UT/cache.controller.js";
import { search as morgan_county } from "../controllers/UT/morgan.controller.js";
import { search as uintah_county } from "../controllers/UT/uintah.controller.js";

const route = express.Router();

// Author :- Bhagyashree Badadal
route.post("/cache", cache_county);
route.post("/morgan", morgan_county);
route.post("/uintah", uintah_county);

export default route;
