import express from "express";

import { search as roseau_search } from "../controllers/MN/roseau.controller.js";

import { search as parcelinfo_search } from "../controllers/MN/parcelinfo.controller.js";

import { search as polk_search } from "../controllers/MN/polk.controller.js";

import { search as big_stone_search } from "../controllers/MN/big_stone.controller.js";

// Author: M M Prateek
import { search as mn_publicaccess_search } from "../controllers/MN/mn_publicaccess.controller.js";
import { search as chippewa_search } from "../controllers/MN/chippewa.controller.js";
import { search as common_mn_search } from "../controllers/MN/common_mn.controller.js";

import { search as common_mn2_search } from "../controllers/MN/common_mn2.controller.js";


// Author :- Vadiraj Joshi
import { search as becker_search } from "../controllers/MN/becker.controller.js";

// Author :- Bhagyashree Badadal
import { search as hennepin_search} from "../controllers/MN/hennepin.controller.js";


// Author : Harikrishna B
import { search as watonwan_search } from "../controllers/MN/watonwan.controller.js";
import { search as beacon1_search} from "../controllers/MN/beacon1.controller.js";
import { search as beacon2_search} from "../controllers/MN/beacon2.controller.js";




const route = express.Router();

route.post("/roseau",roseau_search)
route.post("/polk", polk_search);



// Author : Harikrishna B
route.post("/lake-of-the-woods",beacon2_search)
route.post("/cottonwood",beacon2_search)

route.post("/martin",beacon1_search);
route.post("/winona",beacon1_search);
route.post("/brown",beacon1_search);

route.post("/watonwan", watonwan_search);
route.post("/kanabec", watonwan_search);
route.post("/nicollet",watonwan_search);
route.post("/morrison",watonwan_search);
route.post("/houston",watonwan_search);
route.post("/faribault",watonwan_search);
route.post("/freeborn",watonwan_search);
route.post("/rice",watonwan_search);
route.post("/fillmore", watonwan_search);
route.post("/jackson",watonwan_search);
route.post("/carlton",watonwan_search);
route.post("/le-sueur",watonwan_search);
route.post("/ramsey",watonwan_search);


// Author:- Mayank Nandgowle
route.post("/itasca", parcelinfo_search);
route.post("/koochiching", parcelinfo_search);
route.post("/lake", parcelinfo_search);
route.post("/lac_qui_parle", parcelinfo_search);
route.post("/big_stone", big_stone_search);

// Author: M M Prateek
route.post("/clay", mn_publicaccess_search);
route.post("/clearwater", mn_publicaccess_search);
route.post("/roseau", mn_publicaccess_search);
route.post("/washington", mn_publicaccess_search);
route.post("/chippewa", chippewa_search);

route.post("/goodhue", common_mn_search);
route.post("/anoka", common_mn_search);
route.post("/mcleod", common_mn_search);
route.post("/scott", common_mn_search);
route.post("/carver", common_mn_search);

route.post("/wright", common_mn2_search);
route.post("/blue-earth", common_mn2_search);
route.post("/chisago", common_mn2_search);
route.post("/stearns", common_mn2_search);
route.post("/kittson", common_mn2_search);


// Author :- Vadiraj Joshi
route.post("/becker", becker_search);

// Author :- Bhagyashree Badadal
route.post("/hennepin", hennepin_search);

export default route;
