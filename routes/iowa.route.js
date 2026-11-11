import express from "express";
import { search as polk_search } from "../controllers/IA/polk.controller.js";

const route = express.Router();

route.post("/polk", polk_search);

export default route;
