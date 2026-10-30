import express from "express";
import { search as georgia_search } from "../controllers/GA/ga_multi_county.controller.js";
import { search as dekalb_search } from "../controllers/GA/dekalb.controller.js";

const route = express.Router();

// Author :- Vadiraj Joshi
route.post("/forsyth", georgia_search);
route.post("/schley", georgia_search);
route.post("/seminole", georgia_search);
route.post("/carroll", georgia_search);
route.post("/emanuel", georgia_search);
route.post("/walker", georgia_search);
route.post("/grady", georgia_search);
route.post("/long", georgia_search);
route.post("/burke", georgia_search);
route.post("/dade", georgia_search);
route.post("/toombs", georgia_search);
route.post("/jasper", georgia_search);
route.post("/lee", georgia_search);
route.post("/spalding", georgia_search);
route.post("/gordon", georgia_search);

route.post("/dekalb", dekalb_search);

export default route;
