import express from "express";

import { search as alabama_search } from "../controllers/AL/alabama.controller.js";

import {search as alabamagis_search} from "../controllers/AL/alabamaGIS.controller.js"

import { search as cleburne_search } from "../controllers/AL/cleburne.controller.js";


import { search as altags_search } from "../controllers/AL/altags_multi_county.controller.js";
import { search as altags_search_new } from "../controllers/AL/altags_chambers_chilton.controller.js";

import { search as macon_search } from "../controllers/AL/macon_and_russell.controller.js";
import {search as pickens_search} from "../controllers/AL/pickens.controller.js"

// Author:- Bhagyashree Badadal
import { search as montgomery_search } from "../controllers/AL/montgomery.controller.js";

const route = express.Router();


// Author :- Harikrishna B

route.post("/macon", macon_search);
route.post("/russell", macon_search);
route.post("/pickens", pickens_search);


// Author :- Vadiraj Joshi

route.post("/lawrence", alabama_search);
route.post("/cullman", alabama_search);
route.post("/marshall", alabama_search);
route.post("/cherokee", alabama_search);
route.post("/colbert", alabama_search);
route.post("/clarke", alabama_search);
route.post("/etowah", alabama_search);
route.post("/talladega", alabama_search);
route.post("/dekalb", alabama_search);
route.post("/franklin", alabama_search);
route.post("/winston", alabama_search);


// Author:- MM Prateek

route.post("/cleburne", cleburne_search);
route.post("/autauga", cleburne_search);
route.post("/coosa", cleburne_search);
route.post("/hale", cleburne_search);
route.post("/barbour", cleburne_search);
route.post("/morgan", cleburne_search);
route.post("/sumter", cleburne_search);
route.post("/wilcox", cleburne_search);
route.post("/elmore", cleburne_search);
route.post("/monroe", cleburne_search);
route.post("/henry", cleburne_search);



// Author :- Mayank Nandgowle

route.post("/blount", altags_search);
route.post("/butler", altags_search);
route.post("/calhoun", altags_search);
route.post("/clay", altags_search);
route.post("/conecuh", altags_search);
route.post("/covington", altags_search);
route.post("/dale", altags_search);
route.post("/houston", altags_search);
route.post("/lauderdale", altags_search);
route.post("/lee", altags_search);
route.post("/marengo", altags_search);
route.post("/marion", altags_search);
route.post("/pike", altags_search);
route.post("/randolph", altags_search);
route.post("/stclair", altags_search);
route.post("/tallapoosa", altags_search);
route.post("/walker", altags_search);

route.post("/chambers", altags_search_new);
route.post("/chilton", altags_search_new);



// AlbamaGIS

route.post("/crenshaw", alabamagis_search);
route.post("/lamar", alabamagis_search);

// Author:- Bhagyashree Badadal
route.post("/montgomery", montgomery_search);

export default route;
