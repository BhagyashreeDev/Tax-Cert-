import express from "express";
import { search as indiana_search } from "../controllers/IN/in_multi_county.controller.js";
import { search as cgi_search } from "../controllers/IN/cgiportal.controller.js";
import { search as in_dlw_knx } from "../controllers/IN/delaware_knox.controller.js";
import { search as in_parke } from "../controllers/IN/govtech_parke.controller.js";


import { search as wthgis_search } from "../controllers/IN/in_wthgis.controller.js"
import { search as wthgis2_search } from "../controllers/IN/in_wthgis2.controller.js"
import { search as pike_search } from "../controllers/IN/in_pike.controller.js"
import { search as warren_search } from "../controllers/IN/warren.controller.js"
import { search as posey_search } from "../controllers/IN/posey.controller.js"

import { search as lake_in_search } from "../controllers/IN/lake_in.controller.js";

const route = express.Router();

// Author: M M Prateek
route.post("/lake", lake_in_search);

// Author :- Vadiraj Joshi
route.post("/allen", indiana_search);
route.post("/cass", indiana_search);
route.post("/clark", indiana_search);
route.post("/clay", indiana_search);
route.post("/dekalb", indiana_search);
route.post("/fayette", indiana_search);
route.post("/floyd", indiana_search);
route.post("/fountain", indiana_search);
route.post("/franklin", indiana_search);
route.post("/fulton", indiana_search);
route.post("/grant", indiana_search);
route.post("/hancock", indiana_search);
route.post("/hendricks", indiana_search);
route.post("/howard", indiana_search);
route.post("/jackson", indiana_search);
route.post("/johnson", indiana_search);
route.post("/monroe", indiana_search);
route.post("/owen", indiana_search);
route.post("/perry", indiana_search);
route.post("/porter", indiana_search);
route.post("/pulaski", indiana_search);
route.post("/randolph", indiana_search);
route.post("/scott", indiana_search);
route.post("/st-joseph", indiana_search);
route.post("/starke", indiana_search);
route.post("/sullivan", indiana_search);
route.post("/tipton", indiana_search);
route.post("/vermillion", indiana_search);
route.post("/vigo", indiana_search);
route.post("/warrick", indiana_search);
route.post("/white", indiana_search);
route.post("/whitley", indiana_search);

route.post("/ohio", wthgis_search);
route.post("/switzerland", wthgis_search);
route.post("/union", wthgis_search);

route.post("/putnam", wthgis2_search)
route.post("/spencer", wthgis2_search)

route.post("/pike", pike_search)

route.post("/warren",warren_search)
route.post("/posey",posey_search)

// Author: Mayank Nandgowle
route.post("/adams",     cgi_search);
route.post("/dearborn",  cgi_search);
route.post("/dubois",    cgi_search);
route.post("/harrison",  cgi_search);
route.post("/jefferson", cgi_search);
route.post("/jennings",  cgi_search);
route.post("/madison",   cgi_search);
route.post("/martin",    cgi_search);
route.post("/morgan",    cgi_search);
route.post("/shelby",    cgi_search);
route.post("/wabash",    cgi_search);

route.post("/delaware", in_dlw_knx);
route.post("/knox", in_dlw_knx);

route.post("/parke", in_parke);

export default route;
