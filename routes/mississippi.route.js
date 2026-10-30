
import express from "express";

const route = express.Router();

import { search as pike_search } from "../controllers/MS/pike.controller.js";

route.post("/pike", pike_search);

export default route;
