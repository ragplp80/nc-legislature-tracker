// Loads the live site and prints what the page would show. Run by .github/workflows/smoke.yml.
const SITE = process.env.SITE || "https://nc-legislature-tracker.vercel.app";
const cases = [""];
const page = await fetch(SITE + "/");
console.log("page", page.status, (await page.text()).includes("Can Democrats take a chamber?") ? "ok" : "MISSING TITLE");
let bad = 0;
for (const q of cases) {
  const t0 = Date.now();
  const r = await fetch(SITE + "/api/results" + q);
  const ms = Date.now() - t0;
  const j = await r.json().catch(() => ({ error: "not json" }));
  if (!r.ok || j.error) { bad++; console.log(q || "(live)", r.status, ms + "ms", "ERROR", j.error); continue; }
  const c = (ch) => { const x = j.chambers[ch]; return `${ch} D${x.D}-R${x.R} called ${x.calledD}/${x.calledR} range ${x.range} flip@${x.swingToFlip} "${x.verdict.text}" tip ${x.tipping}`; };
  console.log(q || "(live)", r.status, ms + "ms", `mode="${j.mode}" in ${j.pctIn}% swing24 ${j.swing.vs2024} swing22 ${j.swing.vs2022} (${j.swing.counties22} counties) cache=${r.headers.get("x-vercel-cache")}`);
  console.log("    methods:", j.byMethod.map((m) => `${m.method} ${m.vs2024} turnout ${m.turnout24 && m.turnout24.toFixed(2)} votes ${m.votes}`).join(" | "), "turnout22", j.turnout.vs2022);
  console.log("   ", c("H"));
  console.log("   ", c("S"));
  const sample = j.chambers.H.races.slice(0, 3).map((x) => `${x.id} ${x.cands.DEM || "?"} v ${x.cands.REP || "?"} now ${x.now} proj ${x.proj}`);
  console.log("    races:", sample.join(" | "));
}


// Is the download file keeping up with the State Board's live dashboard?
const zip = await fetch("https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2026_11_03/results_pct_20261103.zip", { method: "HEAD" });
console.log("zip", zip.status, "last-modified", zip.headers.get("last-modified"), "size", zip.headers.get("content-length"));
const er = await fetch("https://er.ncsbe.gov/enr/20261103/data/results_0.txt").then((r) => r.json()).catch(() => []);
const sen = er.filter((x) => /^US SENATE/.test(x.cnm));
console.log("dashboard US Senate:", sen.map((x) => `${x.bnm} ${x.vct} (ev ${x.evc}, mail ${x.avc}, ed ${x.ovc})`).join(" | "), "precincts", sen[0] && `${sen[0].prt}/${sen[0].ptl}`);
// Where does the dashboard load its data tonight?
try {
  const home = await (await fetch("https://er.ncsbe.gov/")).text();
  const refs = [...new Set([...home.matchAll(/(?:src|href)="([^"]+\.(?:js|txt|json)[^"]*)"/g)].map((m) => m[1]))].slice(0, 12);
  console.log("dashboard assets:", refs.join(" "));
  const elect = await fetch("https://er.ncsbe.gov/enr/elections.txt").then((r) => r.text()).catch(() => "");
  console.log("elections list:", elect.slice(0, 400).replace(/\s+/g, " "));
  for (const f of ["results_0.txt", "results_92.txt", "county.txt", "lastupdated.txt", "precincts.txt"]) {
    const r = await fetch("https://er.ncsbe.gov/enr/20261103/data/" + f);
    const t = await r.text();
    console.log("data", f, r.status, r.headers.get("last-modified"), t.length, t.slice(0, 160).replace(/\s+/g, " "));
  }
} catch (e) { console.log("dashboard probe error", e.message); }
if (bad) process.exit(1);
