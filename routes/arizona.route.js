import express from "express";
const route = express.Router();

import { search as coconino_lapaz_gila_search } from "../controllers/AZ/coconino_lapaz_gila.controller.js";
import { search as graham_santacruz_search } from "../controllers/AZ/graham_santacruz.controller.js";

route.post("/coconino", (req, res, next)=>{ req.county="coconino"; next(); }, coconino_lapaz_gila_search);
route.post("/la-paz", (req, res, next)=>{ req.county="la-paz"; next(); }, coconino_lapaz_gila_search);
route.post("/gila", (req, res, next)=>{ req.county="gila"; next(); }, coconino_lapaz_gila_search);

route.post("/graham", (req, res, next)=>{ req.county="graham"; next(); }, graham_santacruz_search);
route.post("/santa-cruz", (req, res, next)=>{ req.county="santa-cruz"; next(); }, graham_santacruz_search);

export default route;