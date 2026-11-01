// A made-up state for tests: every district has 10 precincts x 4 vote types.
// The 2024 result in each district is set so House is 71R-49D and Senate 30R-20D.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const METHODS = ["EV", "MAIL", "ED", "PROV"];
const LEAN = { EV: 0.0, MAIL: 0.08, ED: -0.05, PROV: 0.05 }; // vote types lean differently

function makeBase(seed = 1) {
  const rand = rng(seed), districts = {}, units = {};
  for (const [ch, seats, dWins] of [["H", 120, 49], ["S", 50, 20]]) {
    for (let n = 1; n <= seats; n++) {
      // Democratic share by district: spread so exactly dWins are above 50%.
      const rank = (n - 1) / (seats - 1);
      const cut = 1 - dWins / seats;
      const s = rank >= cut ? 0.5 + 0.02 + (rank - cut) * 0.6 : 0.5 - 0.01 - (cut - rank) * 0.5;
      const id = ch + n;
      let D = 0, R = 0;
      for (let p = 0; p < 10; p++) {
        for (const m of METHODS) {
          const votes = Math.round((m === "PROV" ? 20 : 800) * (0.6 + rand() * 0.8));
          const us = Math.min(0.95, Math.max(0.05, s + LEAN[m] + (rand() - 0.5) * 0.1));
          const d = Math.round(votes * us), r = votes - d;
          D += d; R += r;
          units[`C${n % 9}|${ch}${n}-P${p}|${m}|${ch}`] = { dist: id, b24: [d, r], leg24: true, b22: [Math.round(d * 0.7), Math.round(r * 0.75)] };
        }
      }
      districts[id] = { ch, n, held: D > R ? "D" : "R", m24: ((D - R) / (D + R)) * 100 };
    }
  }
  return { districts, units };
}

// 2026 results: every unit swings by `swing` margin points, turnout `turn` x 2024.
// `reported(key)` decides which units have reported.
function makeLive(base, { swing = 0, turn = 0.8, reported = () => true, contested = () => true } = {}) {
  const units = {}, districts = {};
  for (const [key, b] of Object.entries(base.units)) {
    const on = reported(key);
    const tot = Math.round((b.b24[0] + b.b24[1]) * turn);
    const s = Math.min(1, Math.max(0, b.b24[0] / (b.b24[0] + b.b24[1]) + swing / 200));
    const d = on ? Math.round(tot * s) : 0;
    units[key] = { dist: b.dist, d, r: on ? tot - d : 0, o: 0 };
  }
  for (const id of Object.keys(base.districts)) districts[id] = { parties: contested(id) ? ["DEM", "REP"] : ["REP"], cands: {} };
  return { units, districts };
}
module.exports = { makeBase, makeLive };
