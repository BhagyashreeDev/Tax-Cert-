import express from "express";
import { search as harford_search } from "../controllers/MD/harford.controller.js";

// Author:- Bhagyashree Badadal
import { search as frederick_search } from "../controllers/MD/frederick.controller.js";

const route = express.Router();

// Harford County Tax Search Endpoint
route.post("/harford", harford_search);

// Author:- Bhagyashree Badadal
route.post("/frederick", frederick_search);
route.post("/worcester", frederick_search);
route.post("/cecil", frederick_search);
route.post("/calvert", frederick_search);
route.post("/wicomico", frederick_search);
route.post("/washington", frederick_search);
route.post("/allegany", frederick_search);
route.post("/howard", frederick_search);
route.post("/talbot", frederick_search);
route.post("/anne-arundel", frederick_search);
route.post("/caroline", frederick_search);
route.post("/queen-anne-s", frederick_search);


export default route;
