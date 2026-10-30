import express from "express";

//Author :- Vadiraj Joshi
import { search as texas_search } from "../controllers/TX/multi_county.controller.js";
import { search as multi_county2_search } from "../controllers/TX/multi_county2.controller.js";
import { search as multi_county3_search } from "../controllers/TX/multi_county3.controller.js";
import { search as brazos_search } from "../controllers/TX/brazos.controller.js";
import { search as multi_county4_search } from "../controllers/TX/multi_county4.controller.js";
import { search as multi_county5_search } from "../controllers/TX/multi_county5.controller.js";


// Author: M M Prateek
import { search as common_search } from "../controllers/TX/common.controller.js";
import { search as scurry_search } from "../controllers/TX/scurry.controller.js";
import { search as dallas_search } from "../controllers/TX/dallas.controller.js";
import { search as palo_pinto_search } from "../controllers/TX/palo_pinto.controller.js";
import { search as southwest_search } from "../controllers/TX/tx_southwestdata.controller.js"



// Author :- Mayank Nandgowle
import { search as actWebTexasType2_search } from '../controllers/TX/actWebType2.controller.js';
// Import the new standalone controller for the legacy counties
import { search as actWebLegacy_search } from '../controllers/TX/actWebLegacy.controller.js';
// Import the Type 3 controller
import { search as actWebType3_search } from '../controllers/TX/actWebType3.controller.js';



// Author :- Harikrishna B
import { search as bosque_search } from "../controllers/TX/bosque.controller.js";
import { search as hays_search } from "../controllers/TX/hays.controller.js";


// Author :- Bhagyashree Badadal
import { search as starr_search } from "../controllers/TX/starr.controller.js";
import { search as hood_search } from "../controllers/TX/hood.controller.js";
import { search as travis_search } from "../controllers/TX/travis.controller.js";

const route = express.Router();

// Author:- MM Prateek
route.post("/jasper", common_search);
route.post("/anderson", common_search);
route.post("/franklin", common_search);
route.post("/guadalupe", common_search);
route.post("/lubbock", common_search);
route.post("/waller", common_search);
route.post("/limestone", common_search);
route.post("/hutchinson", common_search);
route.post("/lavaca", common_search);
// newly added county to common.controller.js
route.post("/medina", common_search);
route.post("/san-jacinto", common_search);

route.post("/scurry", scurry_search);
route.post("/shelby", scurry_search);
route.post("/harrison", scurry_search);

route.post("/dallas", dallas_search);

route.post("/palo-pinto", palo_pinto_search);

route.post("/parker", southwest_search);
route.post("/tom-green", southwest_search);





//Author :- Vadiraj Joshi

route.post('/atascosa', texas_search);
route.post('/bandera', texas_search);
route.post('/brewster', texas_search);
route.post('/caldwell', texas_search);
route.post('/calhoun', texas_search);
route.post('/camp', texas_search);
route.post('/dallam', texas_search);
route.post('/dimmit', texas_search);
route.post('/edwards', texas_search);
route.post('/falls', texas_search);
route.post('/gillespie', texas_search);
route.post('/howard', texas_search);
route.post('/kendall', texas_search);
route.post('/kenedy', texas_search);
route.post('/kerr', texas_search);
route.post('/lamb', texas_search);
route.post('/lampasas', texas_search);
route.post('/llano', texas_search);
route.post('/parmer', texas_search);
route.post('/polk', texas_search);
route.post('/rains', texas_search);
route.post('/real', texas_search);
route.post('/schleicher', texas_search);
route.post('/shackelford', texas_search);
route.post('/walker', texas_search);
route.post('/yoakum', texas_search);
route.post('/zapata', texas_search);
route.post('/bell', texas_search);
route.post('/burleson', texas_search);
route.post('/burnet', texas_search);
route.post('/colorado', texas_search);
route.post('/deafsmith', texas_search);
route.post('/delta', texas_search);
route.post('/fayette', texas_search);
route.post('/gaines', texas_search);
route.post('/garza', texas_search);
route.post('/hale', texas_search);
route.post('/hill', texas_search);
route.post('/hudspeth', texas_search);
route.post('/lamar', texas_search);
route.post('/lee', texas_search);
route.post('/mcmullen', texas_search);
route.post('/newton', texas_search);
route.post('/sutton', texas_search);
route.post('/swisher', texas_search);
route.post('/throckmorton', texas_search);
route.post('/uvalde', texas_search);
route.post('/young', texas_search);
route.post('/zavala', texas_search);
route.post('/wilson', texas_search);


route.post('/mills', multi_county2_search);
route.post('/concho', multi_county2_search);
route.post('/houston', multi_county2_search);
route.post('/hunt', multi_county2_search);
route.post('/kimble', multi_county2_search);
route.post('/kinney', multi_county2_search);
route.post('/mason', multi_county2_search);
route.post('/matagorda', multi_county2_search);
route.post('/callahan', multi_county2_search);
route.post('/washington', multi_county2_search);
route.post('/taylor', multi_county2_search);
route.post('/nacogdoches', multi_county2_search);
route.post('/cochran', multi_county2_search);
route.post('/titus', multi_county2_search);
route.post('/colorado', multi_county2_search);
route.post('/marion', multi_county2_search);
route.post('/moore', multi_county2_search);
route.post('/aransas', multi_county2_search);

route.post('/borden', multi_county2_search)


// multi_county3.controller.js
route.post('/fannin', multi_county3_search);
route.post('/hamilton', multi_county3_search);
route.post('/somervell', multi_county3_search);

route.post("/brazos", brazos_search);

route.post("/karnes", multi_county4_search);
route.post("/archer", multi_county4_search);
route.post("/frio", multi_county4_search);
route.post("/panola", multi_county4_search);
route.post("/rusk", multi_county4_search);
route.post("/ward", multi_county4_search);
route.post("/wheeler", multi_county4_search);
route.post("/wilbarger", multi_county4_search);
route.post("/san-augustine", multi_county4_search);
route.post("/fisher", multi_county4_search);
route.post("/freestone", multi_county4_search);

// multi_county5.controller.js
route.post("/cottle", multi_county5_search);
route.post("/clay", multi_county5_search);
route.post("/collingsworth", multi_county5_search);
route.post("/culberson", multi_county5_search);
route.post("/ochiltree", multi_county5_search);
route.post("/sherman", multi_county5_search);
route.post("/stonewall", multi_county5_search);
route.post("/childress", multi_county5_search);
route.post("/donley", multi_county5_search);


// Author :- Mayank Nandgowle
route.post("/angelina", actWebTexasType2_search);
route.post("/bee", actWebTexasType2_search);
route.post("/chambers", actWebTexasType2_search);
route.post("/ellis", actWebTexasType2_search);
route.post("/jackson", actWebTexasType2_search);
route.post("/kaufman", actWebTexasType2_search);
route.post("/nueces", actWebTexasType2_search);
route.post("/victoria", actWebTexasType2_search);
route.post("/kleberg", actWebTexasType2_search);

// Newly Added Legacy Counties
route.post("/sanpatricio", actWebLegacy_search);
route.post("/refugio", actWebLegacy_search);
route.post("/hidalgo", actWebLegacy_search);
route.post("/gregg", actWebLegacy_search);
route.post("/fbc", actWebLegacy_search);
route.post("/duval", actWebLegacy_search);
route.post("/brooks", actWebLegacy_search);
route.post("/mclennan", actWebLegacy_search);
route.post("/navarro", actWebLegacy_search);
route.post("/upshur", actWebLegacy_search);
route.post("/jefferson", actWebLegacy_search);
route.post("/galveston", actWebLegacy_search);

// Type 3 (Modern UI / Zero-Click Detail Bypass)
route.post("/bexar", actWebType3_search);
route.post("/elpaso", actWebType3_search);
route.post("/montgomery", actWebType3_search);



// Author : Harikrishna B
route.post("/bosque", bosque_search);
route.post("/liberty", bosque_search);
route.post("/wise", bosque_search);
route.post("/potter", bosque_search);
route.post("/hays", hays_search)


// Author : Bhagyashree Badadal
route.post("/starr", starr_search);
route.post("/webb", starr_search);
route.post("/cameron", starr_search);
route.post("/hood", hood_search);
route.post("/hartley", hood_search);
route.post("/knox", hood_search);
route.post("/lipscomb", hood_search);
route.post("/travis", travis_search);

export default route;
