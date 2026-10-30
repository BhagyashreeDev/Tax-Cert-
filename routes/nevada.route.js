import express from "express";
import { search as nevada_search } from "../controllers/NV/nv_multi_county.controller.js";

// Author: M M Prateek
import { search as nevada_gsa_search } from "../controllers/NV/elko.controller.js";

const route = express.Router();

// Author :- Vadiraj Joshi
route.post("/mineral",nevada_search)
route.post("/white-pine",nevada_search)
route.post("/pershing",nevada_search)
route.post("/storey",nevada_search)
route.post("/esmeralda",nevada_search)

// Author: M M Prateek
route.post("/elko", nevada_gsa_search);
route.post("/humboldt", nevada_gsa_search);
route.post("/lincoln", nevada_gsa_search);

export default route;
