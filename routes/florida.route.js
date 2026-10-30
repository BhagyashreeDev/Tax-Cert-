import express from "express";

import { search as holmes_search } from "../controllers/FL/holmes.controller.js";
import {search as leon_search} from "../controllers/FL/leon.controller.js";

import {search as dixie_search} from "../controllers/FL/dixie.controller.js";


const route = express.Router();

route.post("/holmes", holmes_search);
route.post("/jefferson", holmes_search);
route.post("/washington", holmes_search);
route.post("/baker", holmes_search);
route.post("/bradford", holmes_search);
route.post("/gulf", holmes_search);
route.post("/liberty", holmes_search);
route.post("/madison", holmes_search);
route.post("/glades", holmes_search);
route.post("/hardee", holmes_search);
route.post("/desoto", holmes_search);
route.post("/jackson", holmes_search);
route.post("/okeechobee", holmes_search);
route.post("/wakulla", holmes_search);
route.post("/franklin", holmes_search);
route.post("/hamilton", holmes_search);
route.post("/calhoun", holmes_search);
route.post("/union", holmes_search);

route.post("/leon", leon_search);
route.post("/marion", leon_search);

route.post("/dixie", dixie_search);


export default route;