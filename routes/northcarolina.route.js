import express from "express";
import { search as rockingham_search } from "../controllers/NC/rockingham.controller.js";
import { search as brunswick_search } from "../controllers/NC/brunswick.controller.js";

const route = express.Router();
route.post("/rockingham", rockingham_search);
route.post("/brunswick", brunswick_search);

export default route;