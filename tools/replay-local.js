// Quick check against the real baseline without the State Board file: rebuilds 2024 legislative
// votes from the baseline (contested races only) and replays them. node tools/replay-local.js 40 4
const Core = require("../core.js");
const base = require("../data/baseline.json");
const [pct = 100, shift = 0] = process.argv.slice(2).map(Number);
function liveFrom(pct, shift, seed = 7) {
  let s = seed; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const places = (re) => { const p = [...new Set(Object.keys(base.units).filter((k) => re.test(k.split("|")[2])).map((k) => k.split("|").slice(0, 3).join("|")))]; for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; };
  const order = [...places(/^(EV|MAIL)$/), ...places(/^(ED|PROV)$/)];
  const on = new Set(order.slice(0, Math.round(order.length * pct / 100)));
  const units = {}, districts = {};
  for (const [key, b] of Object.entries(base.units)) {
    const dd = base.districts[b.dist];
    let d = 0, rr = 0;
    if (on.has(key.split("|").slice(0, 3).join("|"))) {
      const tot = b.b24[0] + b.b24[1];
      const sh = Math.min(1, Math.max(0, b.b24[0] / tot + shift / 200));
      if (b.leg24) { d = Math.round(tot * sh); rr = tot - d; }
      else if (dd.held === "D") d = tot; else rr = tot;
    }
    units[key] = { dist: b.dist, d, r: rr, o: 0 };
  }
  for (const [id, d] of Object.entries(base.districts)) districts[id] = { parties: d.m24 == null ? [d.held === "D" ? "DEM" : "REP"] : ["DEM", "REP"], cands: { DEM: d.cands24.DEM, REP: d.cands24.REP } };
  return { units, districts };
}
if (require.main === module) {
const t0 = Date.now();
const out = Core.summarize(liveFrom(pct, shift), base);
console.log(`pct ${pct} shift ${shift} -> in ${out.pctIn}% swing ${out.swing.vs2024} (vs22 ${out.swing.vs2022}) in ${Date.now() - t0}ms`);
for (const ch of ["H", "S"]) { const c = out.chambers[ch]; console.log(ch, `D ${c.D} R ${c.R} called ${c.calledD}/${c.calledR} range ${c.range} | flips at ${c.swingToFlip} | GOP super below ${c.gopSuperBelow} | need ${c.flipsNeeded} flips | ${c.verdict.text}`); }
}
module.exports = { liveFrom };
