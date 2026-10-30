import express from "express";
import { search as kansas_search} from "../controllers/KS/ks_multi_county.controller.js";

// Author: M M Prateek
import { search as kansas_common_search } from "../controllers/KS/common_kansas.controller.js";
//Author : Harikrishna B
import { search as cowley_search} from "../controllers/KS/cowley.controller.js";

// Author:- Mayank Nandgowle
import { search as ks_search } from "../controllers/KS/kscounties.controller.js";

const route = express.Router();

// Author : - Harikrishna B
route.post("/cowley",cowley_search);

// Author :- Vadiraj Joshi
route.post("/haskell", kansas_search);
route.post("/clark", kansas_search);
route.post("/morton", kansas_search);

// Author: M M Prateek
route.post("/cherokee", kansas_common_search);
route.post("/ellis", kansas_common_search);
route.post("/lincoln", kansas_common_search);
route.post("/miami", kansas_common_search);
route.post("/stafford", kansas_common_search);
route.post("/seward", kansas_common_search);
route.post("/clay", kansas_common_search);
route.post("/finney", kansas_common_search);
route.post("/atchison", kansas_common_search);
route.post("/barber", kansas_common_search);
route.post("/marshall", kansas_common_search);
route.post("/lyon", kansas_common_search);
route.post("/crawford", kansas_common_search);
route.post("/kingman", kansas_common_search);
route.post("/nemaha", kansas_common_search);
route.post("/osage", kansas_common_search);
route.post("/mcpherson", kansas_common_search);
route.post("/ness", kansas_common_search);
route.post("/wabaunsee", kansas_common_search);
route.post("/dickinson", kansas_common_search);
route.post("/morris", kansas_common_search);
route.post("/geary", kansas_common_search);
route.post("/ottawa", kansas_common_search);
route.post("/wilson", kansas_common_search);
route.post("/barton", kansas_common_search);
route.post("/smith", kansas_common_search);

// Author:- Mayank Nandgowle
route.post("/johnson", ks_search);
route.post("/franklin", ks_search);
route.post("/wyandotte", ks_search);

export default route;
