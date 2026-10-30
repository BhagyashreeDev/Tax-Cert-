import express from "express";
import {search as charlotte_search} from "../controllers/VA/charlotte.controller.js";
import {search as amelia_search} from "../controllers/VA/amelia.controller.js";

const route = express.Router();

route.post("/charlotte", charlotte_search);

route.post("/amelia", amelia_search);
route.post("/caroline", amelia_search);
route.post("/bristol-city", amelia_search);
route.post("/cumberland", amelia_search);
route.post("/king-and-queen", amelia_search);
route.post("/page", amelia_search);
route.post("/rockbridge", amelia_search);
route.post("/shenandoah", amelia_search);
route.post("/surry", amelia_search);
route.post("/sussex", amelia_search);
route.post("/warren", amelia_search);
route.post("/westmoreland", amelia_search);
route.post("/king-george", amelia_search);
route.post("/lunenburg", amelia_search);
route.post("/mathews", amelia_search);
route.post("/prince-edward", amelia_search);
route.post("/bath", amelia_search);
route.post("/campbell", amelia_search);
route.post("/greene", amelia_search);
route.post("/greensville", amelia_search);
route.post("/dickenson", amelia_search);
route.post("/mecklenburg", amelia_search);

export default route;