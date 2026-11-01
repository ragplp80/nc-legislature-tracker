const test = require("node:test");
const assert = require("node:assert");
const Core = require("../core.js");
const { makeBase, makeLive } = require("./fake.js");
const base = makeBase();

test("fake state starts at the 2024 split", () => {
  const h = Object.values(base.districts).filter((d) => d.ch === "H");
  assert.equal(h.filter((d) => d.held === "R").length, 71);
  const s = Object.values(base.districts).filter((d) => d.ch === "S");
  assert.equal(s.filter((d) => d.held === "R").length, 30);
});

test("before any votes: waiting, projection equals 2024", () => {
  const out = Core.summarize(makeLive(base, { reported: () => false }), base);
  assert.equal(out.pctIn, 0);
  assert.equal(out.chambers.H.verdict.tone, "wait");
  assert.equal(out.chambers.H.D, 49);
  assert.equal(out.chambers.S.D, 20);
});

test("all votes in with no swing reproduces 2024 exactly", () => {
  const out = Core.summarize(makeLive(base, { swing: 0 }), base);
  assert.equal(out.pctIn, 100);
  assert.ok(Math.abs(out.swing.vs2024) < 0.05);
  assert.equal(out.chambers.H.R, 71);
  assert.equal(out.chambers.S.R, 30);
  assert.equal(out.chambers.H.verdict.text, "Republicans keep control");
});

test("swing is measured correctly from early votes alone", () => {
  const live = makeLive(base, { swing: 6, reported: (k) => k.includes("|EV|") });
  const out = Core.summarize(live, base);
  assert.ok(Math.abs(out.swing.vs2024 - 6) < 0.3, "swing " + out.swing.vs2024);
  // Election Day votes not in yet: still projects the full-count result
  const full = Core.summarize(makeLive(base, { swing: 6 }), base);
  assert.ok(Math.abs(out.chambers.H.D - full.chambers.H.D) <= 1, `${out.chambers.H.D} vs ${full.chambers.H.D}`);
});

test("vote order does not fool the projection: Election-Day-leaning R units counted last", () => {
  // Mail (D-leaning) and early in; raw count looks bluer than the final, projection shouldn't.
  const part = Core.summarize(makeLive(base, { swing: 2, reported: (k) => /\|(MAIL|EV)\|/.test(k) }), base);
  const full = Core.summarize(makeLive(base, { swing: 2 }), base);
  assert.ok(Math.abs(part.chambers.S.D - full.chambers.S.D) <= 1);
  assert.ok(Math.abs(part.chambers.H.D - full.chambers.H.D) <= 1);
});

test("swing needed to flip is consistent with seat counts", () => {
  const out = Core.summarize(makeLive(base, { swing: 1, reported: (k) => k.includes("|EV|") }), base);
  const need = out.chambers.S.swingToFlip;
  assert.ok(need > 1, "need " + need);
  const at = Core.summarize(makeLive(base, { swing: need + 0.6 }), base);
  assert.ok(at.chambers.S.D >= 25, "at need+0.6 got " + at.chambers.S.D);
  const below = Core.summarize(makeLive(base, { swing: need - 0.6 }), base);
  assert.ok(below.chambers.S.D < 25, "at need-0.6 got " + below.chambers.S.D);
});

test("big swing flips both chambers and calls them", () => {
  const out = Core.summarize(makeLive(base, { swing: 30 }), base);
  assert.equal(out.chambers.H.verdict.tone, "D");
  assert.equal(out.chambers.S.verdict.tone, "D");
  assert.ok(out.chambers.H.D >= 61);
});

test("uncontested seats go to the only party on the ballot", () => {
  const out = Core.summarize(makeLive(base, { contested: (id) => id !== "H120" }), base);
  const r = Core.projectAll(makeLive(base, { contested: (id) => id !== "H120" }), base,
    Core.prepare(makeLive(base), base), 0, Core.compare(makeLive(base), base)).H120;
  assert.equal(r.winner, "R");
  assert.equal(r.status, "uncontested");
  assert.ok(out.chambers.H.D <= 49);
});

test("2022 comparison and turnout are reported", () => {
  const out = Core.summarize(makeLive(base, { swing: 0, turn: 0.9 }), base);
  assert.ok(out.swing.vs2022 != null);
  assert.ok(Math.abs(out.turnout.vs2024 - 0.9) < 0.01);
  assert.equal(out.swing.counties22, 9);
  // 2022 is only compared for counties that have finished counting
  const part = Core.summarize(makeLive(base, { reported: (k) => !k.includes("|ED|") }), base);
  assert.equal(part.swing.counties22, 0);
  assert.equal(part.swing.vs2022, null);
});
