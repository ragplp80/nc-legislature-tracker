// Local preview with made-up data: node tools/dev.mjs, then open http://localhost:8787/?shift=4&pct=50
import http from "node:http";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Core = require("../core.js");
const { makeBase, makeLive } = require("../tests/fake.js");
const base = makeBase();
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/results") {
    const pct = +(u.searchParams.get("pct") ?? 60), shift = +(u.searchParams.get("shift") ?? 4);
    const keys = Object.keys(base.units);
    const order = keys.filter((k) => /\|(EV|MAIL)\|/.test(k)).concat(keys.filter((k) => /\|(ED|PROV)\|/.test(k)));
    const on = new Set(order.slice(0, Math.round((order.length * pct) / 100)));
    const live = makeLive(base, { swing: shift, turn: 0.78, reported: (k) => on.has(k) });
    for (const [id, d] of Object.entries(live.districts)) d.cands = { DEM: "Dem Candidate " + id, REP: "Rep Candidate " + id };
    const out = Core.summarize({ ...live, updated: new Date().toISOString() }, base);
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ ...out, mode: "MADE-UP DATA" }));
  }
  res.setHeader("content-type", "text/html");
  res.end(fs.readFileSync(new URL("../index.html", import.meta.url)));
}).listen(8787, () => console.log("http://localhost:8787"));
