const test = require("node:test");
const assert = require("node:assert");
const { zipSync, strToU8 } = require("fflate");

const H = "County\tElection Date\tPrecinct\tContest Group ID\tContest Type\tContest Name\tChoice\tChoice Party\tVote For\tElection Day\tEarly Voting\tAbsentee by Mail\tProvisional\tTotal Votes\tReal Precinct\t";
const base = require("../data/baseline.json");

function fileFrom(scale) {
  // A results file built from the 2024 baseline (contested races), votes multiplied by `scale`.
  const lines = [H];
  for (const [key, b] of Object.entries(base.units)) {
    if (!b.leg24) continue;
    const [county, precinct, method, dist] = key.split("|");
    const contest = dist[0] === "H" ? `NC HOUSE OF REPRESENTATIVES DISTRICT ${String(dist.slice(1)).padStart(3, "0")}` : `NC STATE SENATE DISTRICT ${dist.slice(1)}`;
    const cols = { ED: 0, EV: 0, MAIL: 0, PROV: 0 };
    for (const [party, v] of [["DEM", b.b24[0]], ["REP", b.b24[1]]]) {
      cols[method] = Math.round(v * scale);
      lines.push([county, "11/03/2026", precinct === "~" ? "EV POOL" : precinct, "1", "S", contest, party + " CANDIDATE", party, "1", cols.ED, cols.EV, cols.MAIL, cols.PROV, 0, precinct === "~" ? "N" : "Y", ""].join("\t"));
    }
  }
  return zipSync({ "results_pct_20261103.txt": strToU8(lines.join("\n")) });
}

function call(handler, query) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b, headers: this.headers }); } };
    handler({ query }, res);
  });
}

test("live file missing: waiting, 2024 picture", async () => {
  global.fetch = async () => ({ status: 403, ok: false, headers: new Map() });
  delete require.cache[require.resolve("../api/results.js")];
  const r = await call(require("../api/results.js"), {});
  assert.equal(r.code, 200);
  assert.match(r.body.mode, /WAITING/);
  assert.equal(r.body.chambers.H.verdict.tone, "wait");
});

test("live file present: parses and projects", async () => {
  const zip = fileFrom(1);
  global.fetch = async () => ({ status: 200, ok: true, headers: { get: (k) => (k === "last-modified" ? "Tue, 03 Nov 2026 23:45:00 GMT" : null) }, arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) });
  delete require.cache[require.resolve("../api/results.js")];
  const r = await call(require("../api/results.js"), {});
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.mode, null);
  assert.equal(r.body.swing.vs2024, 0);
  assert.equal(r.body.updated, "2026-11-03T23:45:00.000Z");
  assert.match(r.headers["Cache-Control"], /s-maxage/);
});

test("rehearsal mode shifts and subsets", async () => {
  const zip = fileFrom(1);
  global.fetch = async () => ({ status: 200, ok: true, headers: { get: () => null }, arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) });
  delete require.cache[require.resolve("../api/results.js")];
  const r = await call(require("../api/results.js"), { replay: "2024", pct: "40", shift: "5" });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.match(r.body.mode, /REHEARSAL/);
  assert.ok(Math.abs(r.body.swing.vs2024 - 5) < 0.2, String(r.body.swing.vs2024));
  assert.ok(r.body.pctIn > 0 && r.body.pctIn < 100);
});
