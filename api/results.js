// GET /api/results — downloads the State Board's live results file, projects both chambers.
//   ?replay=2024&pct=40&shift=4   rehearse with the 2024 file: 40% of reporting units in
//                                 (early and mail first, then Election Day in a shuffled order),
//                                 every Democratic margin moved 4 points.
const { unzipSync, strFromU8 } = require("fflate");
const Core = require("../core.js");
const P = require("../parse.js");
const base = require("../data/baseline.json");

const BUCKET = "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS";
const LIVE_URL = process.env.NC_RESULTS_URL || `${BUCKET}/2026_11_03/results_pct_20261103.zip`;
const REPLAY = { 2024: `${BUCKET}/2024_11_05/results_pct_20241105.zip` };
const CACHE_MS = 25_000;
const cache = new Map(); // url -> { at, rows, modified }

async function rowsFrom(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const r = await fetch(url, { headers: hit && hit.etag ? { "if-none-match": hit.etag } : {} });
  if (r.status === 304 && hit) { hit.at = Date.now(); return hit; }
  if (r.status === 404 || r.status === 403) { const miss = { at: Date.now(), rows: null }; cache.set(url, miss); return miss; }
  if (!r.ok) throw new Error("State Board file HTTP " + r.status);
  const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
  const name = Object.keys(files).find((n) => n.endsWith(".txt"));
  const rows = P.parseTsv(strFromU8(files[name], true));
  const entry = { at: Date.now(), rows, etag: r.headers.get("etag"), modified: r.headers.get("last-modified") };
  cache.set(url, entry);
  return entry;
}

// Before the 2026 file exists: every unit present with no votes, both parties assumed on the ballot.
function emptyLive() {
  const units = {}, districts = {};
  for (const [key, b] of Object.entries(base.units)) units[key] = { dist: b.dist, d: 0, r: 0, o: 0 };
  for (const id of Object.keys(base.districts)) districts[id] = { parties: ["DEM", "REP"], cands: {} };
  return { units, districts };
}

function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

// A pretend election night built from the 2024 file.
function rehearse(live, pct, shift, seed) {
  const r = rand(seed);
  const keys = Object.keys(live.units);
  const byPlace = (re) => {
    const places = [...new Set(keys.filter((k) => re.test(k.split("|")[2])).map((k) => k.split("|").slice(0, 3).join("|")))];
    for (let i = places.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [places[i], places[j]] = [places[j], places[i]]; }
    return places;
  };
  const order = [...byPlace(/^(EV|MAIL)$/), ...byPlace(/^(ED|PROV)$/)];
  const on = new Set(order.slice(0, Math.round((order.length * pct) / 100)));
  for (const [key, u] of Object.entries(live.units)) {
    if (!on.has(key.split("|").slice(0, 3).join("|"))) { u.d = u.r = u.o = 0; continue; }
    const tot = u.d + u.r;
    if (shift && tot > 0) {
      const s = Math.min(1, Math.max(0, u.d / tot + shift / 200));
      u.d = Math.round(tot * s); u.r = tot - u.d;
    }
  }
  return live;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const q = req.query || {};
    let live, mode = null, modified = null;
    if (q.replay) {
      const url = REPLAY[q.replay];
      if (!url) return res.status(400).json({ error: "replay must be 2024" });
      const got = await rowsFrom(url);
      const pct = Math.max(0, Math.min(100, +(q.pct ?? 50)));
      const shift = +(q.shift ?? 0) || 0;
      live = rehearse(P.legislative(got.rows), pct, shift, +(q.seed ?? 7) || 7);
      mode = `REHEARSAL · 2024 votes · ${pct}% in${shift ? ` · shifted ${shift > 0 ? "D" : "R"} +${Math.abs(shift)}` : ""}`;
      modified = new Date().toISOString();
    } else {
      const got = await rowsFrom(LIVE_URL);
      if (got.rows) { live = P.legislative(got.rows); modified = got.modified ? new Date(got.modified).toISOString() : new Date(got.at).toISOString(); }
      else { live = emptyLive(); mode = "WAITING FOR 2026 RESULTS FILE"; }
    }
    const out = Core.summarize({ ...live, updated: modified }, base);
    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=40");
    res.status(200).json({ ...out, mode, baselineBuilt: base.built });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e.message || e) });
  }
};
