import express from "express";
import { search as skagitSearch } from "../controllers/WA/skagit.controller.js";

const route = express.Router(); 

route.post("/skagit", skagitSearch);

export default route;
