import axios from 'axios';
import fs from 'fs';

// ---------- 1. PARCEL DATA (your list) ----------
const countyParcels = {
  abbeville: ["054-00-00-424"],
  allendale: ["119-01-00-017.02"],
  bamberg: ["0013-00-00-017."],
  barnwell: ["111-00-00-154.02"],
  calhoun: ["118-00-00-018"],
  cherokee: ["101-00-00-098.000"],
  chesterfield: ["031 004 001 004"],
  clarendon: ["090-00-03-057-01"],
  colleton: ["115-00-00-237.001"],
  darlington: ["056-03-03-020"],
  dillon: ["104-12-12-005"],
  edgefield: ["078-00-01-037-100"],
  horry: ["0690001072"],
  kershaw: ["338-01-00-004-SCK"],
  lancaster: ["0042 -00-059.03"],
  laurens: ["901-01-18-011"],
  lee: ["023-00-00-286-000", "068-00-00-110-000"],
  lexington: ["004493-01-010", "010044-01-039"],
  marlboro: ["013-00-03-132"],
  mccormick: ["110-00-00-038."],
  newberry: ["641-18"],
  oconee: ["134-00-07-004"],
  orangeburg: ["03030001039000"],
  saluda: ["114-00-00-034"],
  sumter: ["2050404049"],
  union: ["058-00-00-114 000", "074-00-00-083 000"],
  williamsburg: ["45-035-067"],
  spartanburg: ["7-13-09-120.01"]
};

const BASE_URL = "https://tax-cert-project-test.onrender.com/tax/SC";

const csvRows = ["county,parcel,status,response_preview"];
const jsonLog = [];

// ---------- 2. MAIN LOOP ----------
(async () => {
  for (const [county, parcels] of Object.entries(countyParcels)) {
    for (const parcel of parcels) {
      const payload = {
        fetch_type: "api",
        account: parcel.trim()
      };

      const url = `${BASE_URL}/${county}`;
      let status = "FAIL";
      let responseData = null;

      try {
        const res = await axios.post(url, payload, {
          timeout: 90000,
          headers: { "Content-Type": "application/json" }
        });
        responseData = res.data;
        status = res.status === 200 ? "PASS" : "FAIL";
      } catch (err) {
        responseData = err.response?.data || { error: err.message };
      }

      // CSV preview (first 120 chars)
      const preview = JSON.stringify(responseData)
        .replace(/"/g, '""')
        .slice(0, 120);

      csvRows.push(`${county},${parcel.trim()},${status},"${preview}..."`);

      // Full JSON log
      jsonLog.push({
        county,
        parcel: parcel.trim(),
        url,
        status,
        request: payload,
        response: responseData,
        timestamp: new Date().toISOString()
      });

      console.log(`${county} | ${parcel.trim()} → ${status}`);
    }
  }

  // ---------- 3. SAVE RESULTS ----------
  fs.writeFileSync("results_summary.csv", csvRows.join("\n"));
  fs.writeFileSync("full_responses.json", JSON.stringify(jsonLog, null, 2));

  console.log("\nAll done!");
  console.log("→ results_summary.csv");
  console.log("→ full_responses.json");
})();
