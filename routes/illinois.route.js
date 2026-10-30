import express from "express";

// Author:- Bhagyashree Badadal
import { search as dupage_search } from "../controllers/IL/dupage.controller.js";


const route = express.Router();

// Author:- Bhagyashree Badadal
route.post("/dupage", dupage_search);

export default route;