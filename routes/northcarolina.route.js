import express from "express";
import { search as rockingham_search } from "../controllers/NC/rockingham.controller.js";
import { search as brunswick_search } from "../controllers/NC/brunswick.controller.js";
import { search as transylvania_search } from "../controllers/NC/transylvania.controller.js";

const route = express.Router();
route.post("/rockingham", rockingham_search);
route.post("/brunswick", brunswick_search);
route.post("/transylvania", transylvania_search);

export default route;
