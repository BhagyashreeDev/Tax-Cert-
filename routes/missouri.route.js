import express from "express";

import { search as cape_girardeau_search } from "../controllers/MO/cape_girardeau.controller.js";
import { search as mo_counties_search } from "../controllers/MO/mocounties.controller.js";

// Author:- Bhagyashree Badadal
import { search as cass_search } from "../controllers/MO/cass.coontroller.js";
import { search as barton_search } from "../controllers/MO/barton.controller.js";
import { search as cedar_search } from "../controllers/MO/cedar.controller.js";
import { search as caldwell_search } from "../controllers/MO/caldwell.controller.js";
import { search as vernon_search } from "../controllers/MO/vernon.controller.js";
import { search as polk_search } from "../controllers/MO/polk.controller.js";

const route = express.Router();

//Author : Harikrishna B
route.post("/cape-girardeau", cape_girardeau_search)

// Author:- Mayank Nandgowle
route.post("/dade", mo_counties_search);
route.post("/camden", mo_counties_search);
route.post("/miller", mo_counties_search);

// Author:- Bhagyashree Badadal
route.post("/cass", cass_search);
route.post("/barton", barton_search);
route.post("/cedar", cedar_search);
route.post("/caldwell", caldwell_search);
route.post("/texas", caldwell_search);
route.post("/vernon", vernon_search);
route.post("/polk", polk_search);

export default route;
