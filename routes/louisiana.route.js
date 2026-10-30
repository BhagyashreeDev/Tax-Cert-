import express from "express";

// Author:- Bhagyashree Badadal
import { search as caddo_search } from "../controllers/LA/caddo.controller.js";


const route = express.Router();

// Author:- Bhagyashree Badadal
route.post("/caddo", caddo_search);

export default route;