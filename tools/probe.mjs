// One-off look at the NC State Board of Elections result files, run in GitHub Actions
// (the files can't be downloaded from Claude's workspace). Prints what the build needs to know.
import { execSync } from "node:child_process";
import fs from "node:fs";

const BUCKET = "https://s3.amazonaws.com/dl.ncsbe.gov";
const out = [];
const log = (...a) => { const s = a.join(" "); console.log(s); out.push(s); };

async function list(prefix) {
  const r = await fetch(`${BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}`);
  const x = await r.text();
  return [...x.matchAll(/<Key>([^<]+)<\/Key><LastModified>([^<]+)<\/LastModified><ETag>[^<]*<\/ETag><Size>(\d+)/g)].map((m) => [m[1], m[2], +m[3]]);
}

async function grab(key, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const r = await fetch(`${BUCKET}/${key}`);
  if (!r.ok) throw new Error(key + " HTTP " + r.status);
  fs.writeFileSync(`${dir}/f.zip`, Buffer.from(await r.arrayBuffer()));
  execSync(`cd ${dir} && unzip -o -q f.zip`);
  return fs.readdirSync(dir).filter((f) => f !== "f.zip");
}

function readTsv(path) {
  const txt = fs.readFileSync(path, "latin1");
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split("\t");
  return { head, rows: lines.slice(1).map((l) => l.split("\t")) };
}

for (const p of ["ENRS/2024_11_05/", "ENRS/2022_11_08/", "ENRS/2026_11_03/", "ENRS/2026_03_03/"]) {
  const keys = await list(p);
  log(`\n## ${p} (${keys.length} keys)`);
  keys.filter((k) => !k[0].includes("precinct_sort/") || keys.length < 30).slice(0, 40).forEach((k) => log(" ", k[0], k[1], k[2]));
}
for (const p of ["Elections/2026/Candidate Filing/", "Elections/2026/"]) {
  const keys = await list(p);
  log(`\n## ${p} (${keys.length} keys)`);
  keys.slice(0, 40).forEach((k) => log(" ", k[0], k[2]));
}

const sets = {};
for (const [tag, key] of [["2024", "ENRS/2024_11_05/results_pct_20241105.zip"], ["2022", "ENRS/2022_11_08/results_pct_20221108.zip"]]) {
  try {
    const files = await grab(key, `/tmp/${tag}`);
    log(`\n## ${tag} files:`, files.join(", "));
    const { head, rows } = readTsv(`/tmp/${tag}/${files.find((f) => f.endsWith(".txt"))}`);
    sets[tag] = { head, rows };
    log("header:", JSON.stringify(head));
    log("rows:", rows.length);
    rows.slice(0, 3).forEach((r) => log("sample:", JSON.stringify(r)));
    const H = (n) => head.findIndex((h) => h.toLowerCase().replace(/[^a-z]/g, "") === n);
    const cName = H("contestname"), real = H("realprecinct"), pct = H("precinct"), cty = H("county");
    const contests = [...new Set(rows.map((r) => r[cName]))];
    log("contest count:", contests.length);
    log("legislative contest samples:", JSON.stringify(contests.filter((c) => /HOUSE OF REP|STATE SENATE|NC HOUSE|NC SENATE/i.test(c)).slice(0, 12)));
    log("statewide samples:", JSON.stringify(contests.filter((c) => /US SENATE|PRESIDENT|GOVERNOR/i.test(c))));
    if (real >= 0) {
      const nonreal = {};
      rows.filter((r) => r[real] === "N").forEach((r) => { nonreal[r[pct]] = (nonreal[r[pct]] || 0) + 1; });
      log("non-real precinct names (count rows):", JSON.stringify(Object.entries(nonreal).sort((a, b) => b[1] - a[1]).slice(0, 40)));
    }
    const wake = rows.filter((r) => r[cty] === "WAKE" && /US SENATE|PRESIDENT/i.test(r[cName]));
    wake.slice(0, 12).forEach((r) => log("wake:", JSON.stringify(r)));
    const precincts = new Set(rows.filter((r) => real < 0 || r[real] === "Y").map((r) => r[cty] + "|" + r[pct]));
    sets[tag].precincts = precincts;
    log("real precincts:", precincts.size);
  } catch (e) { log(tag, "ERROR", e.message); }
}
if (sets["2024"] && sets["2022"]) {
  const a = sets["2024"].precincts, b = sets["2022"].precincts;
  const both = [...a].filter((x) => b.has(x));
  log(`\nprecinct overlap: 2024=${a.size} 2022=${b.size} same name=${both.length}`);
  log("2024 only sample:", JSON.stringify([...a].filter((x) => !b.has(x)).slice(0, 25)));
  log("2022 only sample:", JSON.stringify([...b].filter((x) => !a.has(x)).slice(0, 25)));
}
fs.writeFileSync("probe.txt", out.join("\n"));
