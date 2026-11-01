// Local preview replaying 2024 votes rebuilt from the baseline: node tools/dev.mjs, then open http://localhost:8787/?shift=4&pct=50
import http from "node:http";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Core = require("../core.js");
const base = require("../data/baseline.json");
const { liveFrom } = require("./replay-local.js");
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/results") {
    const pct = +(u.searchParams.get("pct") ?? 60), shift = +(u.searchParams.get("shift") ?? 4);
    const live = liveFrom(pct, shift);
    const out = Core.summarize({ ...live, updated: new Date().toISOString() }, base);
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ ...out, mode: `LOCAL REHEARSAL · ${pct}% · D +${shift}` }));
  }
  res.setHeader("content-type", "text/html");
  res.end(fs.readFileSync(new URL("../index.html", import.meta.url)));
}).listen(8787, () => console.log("http://localhost:8787"));
