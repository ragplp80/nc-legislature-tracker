const test = require("node:test");
const assert = require("node:assert");
const P = require("../parse.js");
const H = "County\tElection Date\tPrecinct\tContest Group ID\tContest Type\tContest Name\tChoice\tChoice Party\tVote For\tElection Day\tEarly Voting\tAbsentee by Mail\tProvisional\tTotal Votes\tReal Precinct\t";
const row = (...c) => c.join("\t");
const txt = [H,
  row("WAKE", "11/03/2026", "04-12", "1", "S", "NC HOUSE OF REPRESENTATIVES DISTRICT 035", "JANE DOE", "DEM", "1", "100", "0", "0", "2", "102", "Y", ""),
  row("WAKE", "11/03/2026", "04-12", "1", "S", "NC HOUSE OF REPRESENTATIVES DISTRICT 035", "JOHN ROE", "REP", "1", "90", "0", "0", "1", "91", "Y", ""),
  row("WAKE", "11/03/2026", "EVCS", "1", "S", "NC HOUSE OF REPRESENTATIVES DISTRICT 035", "JANE DOE", "DEM", "1", "0", "500", "0", "0", "500", "N", ""),
  row("WAKE", "11/03/2026", "EVGR", "1", "S", "NC HOUSE OF REPRESENTATIVES DISTRICT 035", "JANE DOE", "DEM", "1", "0", "300", "0", "0", "300", "N", ""),
  row("WAKE", "11/03/2026", "EVGR", "1", "S", "NC HOUSE OF REPRESENTATIVES DISTRICT 040", "AL SMITH", "REP", "1", "0", "200", "0", "0", "200", "N", ""),
  row("WAKE", "11/03/2026", "04-12", "1", "S", "NC STATE SENATE DISTRICT 13", "LISA GRAFSTEIN", "DEM", "1", "120", "0", "0", "0", "120", "Y", ""),
  row("WAKE", "11/03/2026", "04-12", "1", "S", "US SENATE", "X", "DEM", "1", "120", "0", "0", "0", "120", "Y", ""),
].join("\n");

test("reads the State Board layout and pools early-vote sites by county and district", () => {
  const rows = P.parseTsv(txt);
  assert.equal(rows.length, 7);
  const L = P.legislative(rows);
  assert.deepEqual(L.units["WAKE|04-12|ED|H35"], { dist: "H35", d: 100, r: 90, o: 0, real: true });
  assert.equal(L.units["WAKE|04-12|PROV|H35"].d, 2);
  assert.equal(L.units["WAKE|~|EV|H35"].d, 800);
  assert.equal(L.units["WAKE|~|EV|H40"].r, 200);
  assert.deepEqual(L.districts.H35.parties.sort(), ["DEM", "REP"]);
  assert.equal(L.districts.H35.cands.DEM, "Jane Doe");
  assert.deepEqual(L.districts.S13.parties, ["DEM"]);
  assert.equal(Object.keys(L.units).some((k) => k.includes("US SENATE")), false);
});

test("2022 column name One Stop is read as early voting", () => {
  const rows = P.parseTsv(txt.replace("Early Voting", "One Stop"));
  assert.equal(rows[2].EV, 500);
});
