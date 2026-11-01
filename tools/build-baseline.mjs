// Builds data/baseline.json from the State Board's 2024 and 2022 precinct results.
// Runs in GitHub Actions (see .github/workflows/baseline.yml). Usage: node tools/build-baseline.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { unzipSync, strFromU8 } from "fflate";
const require = createRequire(import.meta.url);
const P = require("../parse.js");

const BUCKET = "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS";
const FILES = { 2024: `${BUCKET}/2024_11_05/results_pct_20241105.zip`, 2022: `${BUCKET}/2022_11_08/results_pct_20221108.zip` };

async function rowsFor(year) {
  const r = await fetch(FILES[year]);
  if (!r.ok) throw new Error(`${year} file HTTP ${r.status}`);
  const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
  const name = Object.keys(files).find((n) => n.endsWith(".txt"));
  return P.parseTsv(strFromU8(files[name], true));
}

const contested = (d) => d && d.parties.includes("DEM") && d.parties.includes("REP");
const r24 = await rowsFor(2024), r22 = await rowsFor(2022);
const L24 = P.legislative(r24), L22 = P.legislative(r22);
const pres = P.statewide(r24, P.isPresident);

const districts = {}, units = {};
for (const [id, d] of Object.entries(L24.districts)) {
  const v = d.votes;
  const held = contested(d) ? (v.d > v.r ? "D" : "R") : d.parties.includes("DEM") ? "D" : "R";
  districts[id] = { ch: id[0], n: +id.slice(1), held, m24: contested(d) ? round(((v.d - v.r) / (v.d + v.r)) * 100) : null, p24: null, cands24: d.cands };
}
// 2022 votes by county and chamber, all vote types together. 2022 used other district lines and
// voters have since moved between early, mail and Election Day voting, so 2022 is compared whole
// county against whole county once a county has finished counting.
const county22 = {};
for (const [key, u] of Object.entries(L22.units)) {
  if (!contested(L22.districts[u.dist])) continue;
  const k = `${key.split("|")[0]}|${u.dist[0]}`;
  const a = (county22[k] ||= [0, 0]);
  a[0] += u.d; a[1] += u.r;
}
const presDist = {};
for (const [key, u] of Object.entries(L24.units)) {
  const [county, precinct, method] = key.split("|");
  const leg = contested(L24.districts[u.dist]);
  const p = pres[`${county}|${precinct}|${method}`];
  if (u.real && p) { const pd = (presDist[u.dist] ||= { d: 0, r: 0 }); pd.d += p.d; pd.r += p.r; }
  let b24 = null;
  if (leg) b24 = [u.d, u.r];
  else if (u.real && p) b24 = [p.d, p.r];
  if (!b24 || b24[0] + b24[1] === 0) continue;
  units[key] = { dist: u.dist, b24, leg24: leg };
}
for (const [id, p] of Object.entries(presDist)) if (districts[id]) districts[id].p24 = round(((p.d - p.r) / (p.d + p.r)) * 100);

const tally = (ch) => ["D", "R"].map((x) => x + " " + Object.values(districts).filter((d) => d.ch === ch && d.held === x).length).join(", ");
const report = [
  `2024 rows ${r24.length}, 2022 rows ${r22.length}`,
  `districts ${Object.keys(districts).length} · House ${tally("H")} · Senate ${tally("S")}`,
  `uncontested in 2024: ${Object.entries(L24.districts).filter(([, d]) => !contested(d)).map(([id]) => id).join(" ")}`,
  `units ${Object.keys(units).length} (pooled ${Object.keys(units).filter((k) => k.includes("|~|")).length}) · 2022 county totals ${Object.keys(county22).length}`,
  `by method: ` + P.METHODS.map((m) => m + " " + Object.keys(units).filter((k) => k.split("|")[2] === m).length).join(", "),
];
console.log(report.join("\n"));
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/baseline.json", JSON.stringify({ built: new Date().toISOString(), sources: FILES, report, districts, units, county22 }));
fs.writeFileSync("data/baseline-report.txt", report.join("\n") + "\n");
function round(x) { return Math.round(x * 10) / 10; }
