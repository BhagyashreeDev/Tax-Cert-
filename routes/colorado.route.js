import express from "express";
// Author:- Bhagyashree Badadal
import {search as custer_search} from "../controllers/CO/custer.controller.js";

const route = express.Router();

// Author:- Bhagyashree Badadal
route.post("/custer", custer_search);
route.post("/chaffee", custer_search);
route.post("/cheyenne", custer_search);
route.post("/sedgwick", custer_search);
route.post("/washington", custer_search);
route.post("/yuma", custer_search);

export default route;