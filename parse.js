// Reads the NC State Board of Elections precinct results file (tab-separated, inside a zip).
// Column names have changed over the years ("One Stop" became "Early Voting"), so columns are
// found by name, loosely.

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
const COLS = {
  county: ["county"],
  precinct: ["precinct", "precinctname"],
  contest: ["contestname"],
  choice: ["choice", "candidate"],
  party: ["choiceparty", "party"],
  ED: ["electionday"],
  EV: ["earlyvoting", "onestop"],
  MAIL: ["absenteebymail", "absentee"],
  PROV: ["provisional"],
  total: ["totalvotes"],
  real: ["realprecinct"],
};

function parseTsv(text) {
  const lines = text.split(/\r?\n/);
  const head = lines[0].split("\t").map(norm);
  const at = {};
  for (const [k, names] of Object.entries(COLS)) at[k] = head.findIndex((h) => names.includes(h));
  for (const k of ["county", "precinct", "contest", "choice", "party"]) if (at[k] < 0) throw new Error("Results file has no " + k + " column: " + lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line.split("\t");
    const num = (k) => (at[k] >= 0 ? +c[at[k]] || 0 : 0);
    rows.push({
      county: clean(c[at.county]), precinct: clean(c[at.precinct]), contest: clean(c[at.contest]),
      choice: String(c[at.choice] || "").trim(), party: clean(c[at.party]),
      ED: num("ED"), EV: num("EV"), MAIL: num("MAIL"), PROV: num("PROV"),
      total: num("total"), real: at.real >= 0 ? clean(c[at.real]) !== "N" : true,
    });
  }
  return rows;
}
const clean = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, " ");

// "NC HOUSE OF REPRESENTATIVES DISTRICT 032" -> "H32"; "NC STATE SENATE DISTRICT 11" -> "S11"
function districtOf(contest) {
  let m = contest.match(/^NC HOUSE OF REPRESENTATIVES DISTRICT 0*(\d+)$/);
  if (m) return "H" + +m[1];
  m = contest.match(/^NC STATE SENATE DISTRICT 0*(\d+)$/);
  if (m) return "S" + +m[1];
  return null;
}
const isPresident = (c) => /^US PRESIDENT/.test(c);
const isUSSenate = (c) => /^US SENATE/.test(c);
const sideOf = (party) => (party === "DEM" ? "d" : party === "REP" ? "r" : "o");
const METHODS = ["ED", "EV", "MAIL", "PROV"];
const unitKey = (county, precinct, method, ch) => `${county}|${precinct}|${method}|${ch}`;

// Legislative races from a results file, by unit and by district.
function legislative(rows) {
  const units = {}, districts = {};
  for (const row of rows) {
    const dist = districtOf(row.contest);
    if (!dist) continue;
    const ch = dist[0];
    const dd = (districts[dist] ||= { parties: [], cands: {}, votes: { d: 0, r: 0, o: 0 } });
    if (row.party && !dd.parties.includes(row.party)) dd.parties.push(row.party);
    if (row.party === "DEM" || row.party === "REP") dd.cands[row.party] ||= titleCase(row.choice);
    const side = sideOf(row.party);
    for (const m of METHODS) {
      const key = unitKey(row.county, row.precinct, m, ch);
      const u = (units[key] ||= { dist, d: 0, r: 0, o: 0, real: row.real });
      u[side] += row[m];
      dd.votes[side] += row[m];
    }
  }
  return { units, districts };
}

// Two-party votes in a statewide race, by "COUNTY|PRECINCT|METHOD".
function statewide(rows, test) {
  const out = {};
  for (const row of rows) {
    if (!test(row.contest)) continue;
    const side = sideOf(row.party);
    if (side === "o") continue;
    for (const m of METHODS) {
      const key = `${row.county}|${row.precinct}|${m}`;
      const u = (out[key] ||= { d: 0, r: 0 });
      u[side] += row[m];
    }
  }
  return out;
}

function titleCase(s) {
  return String(s).toLowerCase().replace(/(^|[\s\-'(])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\bIi\b/g, "II").replace(/\bIii\b/g, "III");
}

module.exports = { parseTsv, legislative, statewide, districtOf, isPresident, isUSSenate, METHODS, unitKey };
