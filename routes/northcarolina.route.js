import express from "express";
import { search as rockingham_search } from "../controllers/NC/rockingham.controller.js";
import { search as brunswick_search } from "../controllers/NC/brunswick.controller.js";
import { search as transylvania_search } from "../controllers/NC/transylvania.controller.js";
import { search as ncpts_search } from "../controllers/NC/guilford.controller.js";
import { search as wake_search } from "../controllers/NC/wake.controller.js";

const route = express.Router();
route.post("/rockingham", rockingham_search);
route.post("/brunswick", brunswick_search);
route.post("/transylvania", transylvania_search);
route.post("/wake", wake_search);

// Multi-controller routes for Guilford, Forsyth, Orange, Henderson
route.post("/guilford", ncpts_search);
route.post("/forsyth", ncpts_search);
route.post("/orange", ncpts_search);
route.post("/henderson", ncpts_search);

export default route;
