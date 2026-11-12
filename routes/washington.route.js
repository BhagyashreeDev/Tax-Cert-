import express from "express";
import { search as skagitSearch } from "../controllers/WA/skagit.controller.js";
import { search as lewisSearch } from "../controllers/WA/lewis.controller.js";

const route = express.Router(); 

route.post("/skagit", skagitSearch);
route.post("/lewis", lewisSearch);

export default route;
