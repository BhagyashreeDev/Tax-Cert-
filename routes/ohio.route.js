import express from "express";
import { search as greene_search } from "../controllers/OH/greene.controller.js";
import { search as jackson_search } from "../controllers/OH/jackson.controller.js";
import { search as butler_search } from "../controllers/OH/butler.controller.js";

import {search as wyandot_search} from "../controllers/OH/wyandot.controller.js";

const route = express.Router();

route.post("/greene", greene_search);
route.post("/brown", greene_search);
route.post("/belmont", greene_search);
route.post("/shelby", greene_search);
route.post("/morgan", greene_search);
route.post("/ottawa", greene_search);
route.post("/clinton", greene_search);
route.post("/holmes", greene_search);
route.post("/erie", greene_search);
route.post("/coshocton", greene_search);
route.post("/muskingum", greene_search);
route.post("/champaign", greene_search);
route.post("/fayette", greene_search);
route.post("/seneca", greene_search);
route.post("/logan", greene_search);
route.post("/tuscarawas", greene_search);
route.post("/huron", greene_search);
route.post("/geauga", greene_search);
route.post("/carroll", greene_search);
route.post("/lorain", greene_search);

route.post("/jackson", jackson_search);
route.post("/fairfield", jackson_search);
route.post("/mercer", jackson_search);
route.post("/miami", jackson_search);
route.post("/paulding", jackson_search);

route.post("/butler", butler_search);

route.post("/wyandot", wyandot_search);
route.post("/noble", wyandot_search);
route.post("/hardin", wyandot_search);


export default route;