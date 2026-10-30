import express from "express";
// Author:- Bhagyashree Badadal
import {search as hawkins_search} from "../controllers/TN/hawkins.controller.js";
import { search as clay_multi_county_search } from "../controllers/TN/clay.controller.js";
import {search as anderson_search} from "../controllers/TN/anderson.controller.js";
import {search as shelby_search} from "../controllers/TN/shelby.controller.js";

const route = express.Router();

// Author:- Bhagyashree Badadal
route.post("/hawkins", hawkins_search);
route.post("/claiborne", hawkins_search);
route.post("/warren", hawkins_search);

route.post("/shelby", shelby_search);

route.post("/clay", clay_multi_county_search);
route.post("/crockett", clay_multi_county_search);
route.post("/fentress", clay_multi_county_search);
route.post("/hamilton", clay_multi_county_search);
route.post("/macon", clay_multi_county_search);
route.post("/rhea", clay_multi_county_search);
route.post("/sequatchie", clay_multi_county_search);
route.post("/trousdale", clay_multi_county_search);


route.post("/blount", anderson_search);
route.post("/anderson", anderson_search);
route.post("/hamblen", anderson_search);
route.post("/knox", anderson_search);
route.post("/lincoln", anderson_search);
route.post("/loudon", anderson_search);
route.post("/madison", anderson_search);


export default route;