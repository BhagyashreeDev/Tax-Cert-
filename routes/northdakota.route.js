import express from "express";

// Author:- Bhagyashree Badadal
import { search as cass_search } from "../controllers/ND/cass.controller.js";

const route = express.Router();
// Author:- Bhagyashree Badadal
route.post("/cass", cass_search);

export default route;