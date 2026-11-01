// NC General Assembly tracker: the projection math. Pure functions, no network.
//
// Words used here:
//   unit     one reporting place for one vote type and one district, keyed "COUNTY|PRECINCT|METHOD|DIST"
//            (METHOD is ED, EV, MAIL or PROV; DIST like H32 or S11). Votes the State Board files under
//            stand-in precincts (early-voting sites, ABSENTEE...) are pooled per county as PRECINCT "~".
//   share    Democratic share of the two-party vote, 0..1
//   swing    change in the Democratic margin, in points (D+4 = Democrats 4 points better on margin)
//
// Baseline (built once from the State Board's 2022 and 2024 files, see tools/build-baseline.mjs):
//   { districts: { H32: { ch, n, held, m24, p24 } },  units: { key: { dist, b24:[d,r], leg24:bool, b22:[d,r]|null } } }
//   b24 is the 2024 legislative race in that unit, or the 2024 presidential race where the
//   legislative race had no opponent (leg24 false). b22 is the 2022 race for the same chamber in
//   that precinct. pool22 holds 2022 pooled votes by "COUNTY|METHOD|CH" (2022 had other districts).
// Live (parsed from the 2026 file, see parse.js):
//   { units: { key: { dist, d, r, o } }, districts: { H32: { parties: ["DEM","REP"], cands: {DEM:"..", REP:".."} } } }

const CHAMBERS = {
  H: { name: "NC House", seats: 120, demControl: 61, gopSuper: 72 },
  S: { name: "NC Senate", seats: 50, demControl: 25, gopSuper: 30 }, // Democratic Lt. Governor breaks a 25-25 tie
};
const METHODS = ["EV", "MAIL", "ED", "PROV"];
const LOCAL_WEIGHT = 3000; // votes of a district's own reporting before its local swing outweighs the statewide one
const DEFAULT_TURNOUT = 0.8; // 2026 votes per 2024 vote before any results exist (a midterm turns out less)

const share = (d, r) => (d + r > 0 ? d / (d + r) : null);
const methodOf = (key) => key.split("|")[2];
const round1 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);

// Average swing and turnout across units counted in 2026 that can be compared with the same
// unit in an earlier year. Only units where both years had a Democrat and a Republican count
// toward swing. Returns overall and per-method numbers.
function compare(live, base, year) {
  const bkey = year === 2022 ? "b22" : "b24";
  const acc = { all: blank() };
  METHODS.forEach((m) => (acc[m] = blank()));
  for (const [key, u] of Object.entries(live.units)) {
    const tot = u.d + u.r + (u.o || 0);
    if (tot <= 0) continue;
    const b = base.units[key];
    if (!b || !b[bkey]) continue;
    const [bd, br] = b[bkey];
    const s0 = share(bd, br), s1 = share(u.d, u.r);
    const m = methodOf(key);
    for (const a of [acc.all, acc[m]]) {
      a.turnNow += u.d + u.r;
      a.turnThen += bd + br;
      if (s0 != null && s1 != null && u.d > 0 && u.r > 0 && bd > 0 && br > 0 && (year === 2022 || b.leg24)) {
        a.w += u.d + u.r;
        a.sw += (u.d + u.r) * (s1 - s0) * 200;
      }
    }
  }
  // 2022 pooled votes: compare county by county, since the 2022 districts were different.
  if (year === 2022 && base.pool22) {
    const pools = {};
    for (const [key, u] of Object.entries(live.units)) {
      const [county, precinct, method] = key.split("|");
      if (precinct !== "~" || !(u.d > 0 && u.r > 0)) continue;
      const k = `${county}|${method}|${u.dist[0]}`;
      const p = (pools[k] ||= [0, 0]);
      p[0] += u.d; p[1] += u.r;
    }
    for (const [k, [d, r]] of Object.entries(pools)) {
      const b = base.pool22[k];
      if (!b || !(b[0] > 0 && b[1] > 0)) continue;
      const m = k.split("|")[1];
      for (const a of [acc.all, acc[m]]) {
        a.turnNow += d + r; a.turnThen += b[0] + b[1];
        a.w += d + r; a.sw += (d + r) * (share(d, r) - share(b[0], b[1])) * 200;
      }
    }
  }
  const fin = (a) => ({ swing: a.w ? a.sw / a.w : null, votes: a.w, turnout: a.turnThen ? a.turnNow / a.turnThen : null });
  const out = { all: fin(acc.all) };
  METHODS.forEach((m) => (out[m] = fin(acc[m])));
  return out;
  function blank() { return { w: 0, sw: 0, turnNow: 0, turnThen: 0 }; }
}

// Index live and baseline units by district once, so projections can be rerun quickly.
function prepare(live, base) {
  const byDist = {};
  const get = (id) => (byDist[id] ||= { counted: [], waiting: [] });
  for (const [key, u] of Object.entries(live.units)) {
    const tot = u.d + u.r + (u.o || 0);
    const b = base.units[key];
    if (tot > 0) get(u.dist).counted.push({ key, u, b });
    else if (b) get(u.dist).waiting.push({ key, b });
    // A unit in the 2026 file with no 2024 match and no votes yet adds nothing until it reports.
  }
  // Units the 2024 file had but the 2026 file doesn't list were renamed or merged: their voters
  // are under new names in the 2026 file, so they are not counted as still to come.
  return byDist;
}

// Project every district at a statewide swing S (points). cmp = compare(live, base, 2024).
function projectAll(live, base, prep, S, cmp) {
  const out = {};
  for (const [id, info] of Object.entries(base.districts)) {
    const ld = live.districts[id] || { parties: [] };
    const dem = ld.parties.includes("DEM"), rep = ld.parties.includes("REP");
    const p = prep[id] || { counted: [], waiting: [] };
    let D = 0, R = 0, O = 0, counted = 0;
    for (const { u } of p.counted) { D += u.d; R += u.r; O += u.o || 0; }
    counted = D + R;
    // Local swing: what this district's own counted units show against 2024, blended with S.
    let lw = 0, ls = 0;
    for (const { u, b } of p.counted) {
      if (!b || !b.b24 || !b.leg24 || !(u.d > 0 && u.r > 0)) continue;
      lw += u.d + u.r;
      ls += (u.d + u.r) * (share(u.d, u.r) - share(b.b24[0], b.b24[1])) * 200;
    }
    const localS = lw ? (ls + LOCAL_WEIGHT * S) / (lw + LOCAL_WEIGHT) : S;
    let remD = 0, remR = 0;
    for (const { key, b } of p.waiting) {
      const t = (cmp[methodOf(key)] && cmp[methodOf(key)].turnout) || (cmp.all && cmp.all.turnout) || DEFAULT_TURNOUT;
      const votes = (b.b24[0] + b.b24[1]) * t;
      const s = clamp(share(b.b24[0], b.b24[1]) + localS / 200, 0, 1);
      remD += votes * s;
      remR += votes * (1 - s);
    }
    const expected = counted + remD + remR;
    let winner, margin, status;
    if (dem && !rep) { winner = "D"; margin = 100; status = "uncontested"; }
    else if (rep && !dem) { winner = "R"; margin = -100; status = "uncontested"; }
    else {
      const pd = D + remD, pr = R + remR;
      margin = pd + pr > 0 ? ((pd - pr) / (pd + pr)) * 100 : (info.m24 ?? 0) + S;
      winner = margin >= 0 ? "D" : "R";
      const lead = Math.abs(D - R), left = (remD + remR) * 1.25; // 25% cushion on what's still out
      status = counted > 0 && lead > left && (left === 0 ? lead > 0 : true) ? "called" : rating(margin);
    }
    out[id] = {
      id, ch: info.ch, n: info.n, held: info.held, m24: info.m24,
      d: D, r: R, o: O, counted, expected,
      pctIn: expected > 0 ? Math.min(100, (counted / expected) * 100) : 0,
      now: counted > 0 ? ((D - R) / counted) * 100 : null,
      localSwing: lw ? (ls / lw) : null,
      margin, winner, status, flip: winner !== info.held,
      cands: ld.cands || {},
    };
  }
  return out;
}

function rating(m) {
  const a = Math.abs(m);
  return a < 2 ? "tossup" : a < 6 ? "lean" : "likely";
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function tally(proj, ch) {
  let D = 0, R = 0, calledD = 0, calledR = 0;
  for (const p of Object.values(proj)) {
    if (p.ch !== ch) continue;
    const sure = p.status === "called" || p.status === "uncontested";
    if (p.winner === "D") { D++; if (sure) calledD++; } else { R++; if (sure) calledR++; }
  }
  return { D, R, calledD, calledR };
}

// The statewide swing from 2024 at which a chamber changes hands, if every district moved by the
// same amount. It doesn't depend on tonight's counting, so it is a fixed line to watch "Now" against.
function uniformSeats(base, live, ch, S) {
  let D = 0, R = 0;
  for (const [id, info] of Object.entries(base.districts)) {
    if (info.ch !== ch) continue;
    const parties = (live.districts[id] || {}).parties || ["DEM", "REP"];
    const dem = parties.includes("DEM"), rep = parties.includes("REP");
    const m = dem && !rep ? 1 : rep && !dem ? -1 : (info.m24 ?? info.p24 ?? 0) + S;
    if (m >= 0) D++; else R++;
  }
  return { D, R };
}
function swingFor(base, live, ch, test) {
  let lo = -40, hi = 40;
  if (!test(uniformSeats(base, live, ch, hi))) return null;
  if (test(uniformSeats(base, live, ch, lo))) return lo;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (test(uniformSeats(base, live, ch, mid))) hi = mid; else lo = mid;
  }
  return hi;
}

// Everything the page shows, in one object.
function summarize(live, base, opts = {}) {
  const cmp24 = compare(live, base, 2024);
  const cmp22 = compare(live, base, 2022);
  const S = cmp24.all.swing ?? 0;
  const prep = prepare(live, base);
  const proj = projectAll(live, base, prep, S, cmp24);

  // How much of the expected vote is in, statewide (House races cover every voter once).
  let cnt = 0, exp = 0;
  for (const p of Object.values(proj)) if (p.ch === "H") { cnt += p.counted; exp += p.expected; }
  const frac = exp > 0 ? cnt / exp : 0;
  const sigma = 1 + 5 * (1 - frac); // uncertainty in the statewide swing, shrinking as votes come in

  const chambers = {};
  for (const ch of ["H", "S"]) {
    const c = CHAMBERS[ch];
    const t = tally(proj, ch);
    const lo = tally(projectAll(live, base, prep, S - sigma, cmp24), ch);
    const hi = tally(projectAll(live, base, prep, S + sigma, cmp24), ch);
    const held = Object.values(base.districts).filter((d) => d.ch === ch);
    const held24 = { D: held.filter((d) => d.held === "D").length, R: held.filter((d) => d.held === "R").length };
    const flipNeed = swingFor(base, live, ch, (x) => x.D >= c.demControl);
    const superAt = swingFor(base, live, ch, (x) => x.R < c.gopSuper); // GOP veto-proof at swings below this
    const list = Object.values(proj).filter((p) => p.ch === ch);
    // Seats in the order Democrats would win them: most Democratic projected margin first.
    const order = list.slice().sort((a, b) => b.margin - a.margin);
    const tipping = order[c.demControl - 1];
    chambers[ch] = {
      ...c, ...t, held24,
      net: t.D - held24.D,
      range: [lo.D, hi.D],
      verdict: verdict(ch, t, lo, hi, c, frac),
      swingToFlip: round1(flipNeed),
      gopSuperBelow: round1(superAt),
      gopSuperHeld: t.R >= c.gopSuper,
      tipping: tipping && tipping.id,
      flipsNeeded: c.demControl - list.filter((p) => p.held === "D" && p.winner === "D").length,
      races: order.filter((p) => p.status !== "uncontested" && (Math.abs(p.margin) < 15 || p.flip)).map(slim),
    };
  }
  return {
    updated: live.updated || null,
    source: live.source || null,
    pctIn: Math.round(frac * 1000) / 10,
    swing: { vs2024: round1(cmp24.all.swing), vs2022: round1(cmp22.all.swing), sigma: round1(sigma) },
    byMethod: METHODS.map((m) => ({
      method: m,
      vs2024: round1(cmp24[m].swing), vs2022: round1(cmp22[m].swing),
      turnout24: cmp24[m].turnout, turnout22: cmp22[m].turnout,
      votes: cmp24[m].votes,
    })),
    turnout: { vs2024: cmp24.all.turnout, vs2022: cmp22.all.turnout },
    chambers,
  };
}

function slim(p) {
  return {
    id: p.id, held: p.held, m24: round1(p.m24), now: round1(p.now), proj: round1(p.margin),
    localSwing: round1(p.localSwing), pctIn: Math.round(p.pctIn), status: p.status, winner: p.winner, flip: p.flip, cands: p.cands,
  };
}

function verdict(ch, t, lo, hi, c, frac) {
  if (frac === 0) return { tone: "wait", text: "Waiting for results" };
  const need = c.demControl;
  if (t.calledD >= need) return { tone: "D", text: "Democrats win control" };
  if (t.calledR > c.seats - need) return { tone: "R", text: "Republicans keep control" };
  if (lo.D >= need) return { tone: "D", text: "Democrats on track to take control" };
  if (hi.D < need) return { tone: "R", text: "Republicans on track to keep control" };
  const gap = need - t.D;
  if (gap > 0) return { tone: "close", text: `Too close — Democrats ${gap} seat${gap > 1 ? "s" : ""} short` };
  return { tone: "close", text: `Too close — Democrats ${t.D - need + 1 > 1 ? (t.D - need + 1) + " seats" : "1 seat"} over the line` };
}

module.exports = { CHAMBERS, METHODS, compare, prepare, projectAll, tally, summarize, share };
