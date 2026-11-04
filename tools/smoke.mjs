// Loads the live site and prints what the page would show. Run by .github/workflows/smoke.yml.
const SITE = process.env.SITE || "https://nc-legislature-tracker.vercel.app";
const cases = ["", "?replay=2024&pct=100", "?replay=2024&pct=40&shift=4", "?replay=2024&pct=75&shift=-2"];
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
if (bad) process.exit(1);
