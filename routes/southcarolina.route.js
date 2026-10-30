import express from "express";

const route = express.Router();

import { search as qpaySearch } from "../controllers/SC/multi_county_qpay.controller.js";

import { search as richland_search } from "../controllers/SC/richland.controller.js";

route.post("/marlboro", qpaySearch);
route.post("/union", qpaySearch);
route.post("/bamberg", qpaySearch);
route.post("/williamsburg", qpaySearch);
route.post("/dillon", qpaySearch);
route.post("/colleton", qpaySearch);
route.post("/calhoun", qpaySearch);
route.post("/mccormick", qpaySearch);
route.post("/newberry", qpaySearch);
route.post("/abbeville", qpaySearch);
route.post("/chesterfield", qpaySearch);
route.post("/spartanburg", qpaySearch);
route.post("/barnwell", qpaySearch);
route.post("/allendale", qpaySearch);
route.post("/sumter", qpaySearch);
route.post("/cherokee", qpaySearch);
route.post("/darlington", qpaySearch);
route.post("/kershaw", qpaySearch);
route.post("/laurens", qpaySearch);
route.post("/horry", qpaySearch);
route.post("/oconee", qpaySearch);
route.post("/lexington", qpaySearch);
route.post("/saluda", qpaySearch);
route.post("/lancaster", qpaySearch);
route.post("/clarendon", qpaySearch);
route.post("/lee", qpaySearch);
route.post("/edgefield", qpaySearch);
route.post("/orangeburg", qpaySearch);

route.post("/richland", richland_search);

export default route;