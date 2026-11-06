import express from "express";
import { search as rockingham_search } from "../controllers/NC/rockingham.controller.js";


const route = express.Router();
route.post("/rockingham", rockingham_search);

export default route;