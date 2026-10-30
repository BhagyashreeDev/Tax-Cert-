import express from "express";

import { search as san_diego_search } from "../controllers/CA/san_diego.controller.js";
import { search as riverside_search } from "../controllers/CA/riverside.controller.js";

const route = express.Router()

route.post("/san-diego", san_diego_search);
route.post("/riverside", riverside_search);

export default route;