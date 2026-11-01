// Looks for where the State Board posts 2026 results. Run in GitHub Actions.
const BUCKET = "https://s3.amazonaws.com/dl.ncsbe.gov";
async function list(prefix, delim = "/") {
  let out = [], token = "";
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${BUCKET}/?list-type=2&delimiter=${delim}&prefix=${encodeURIComponent(prefix)}${token ? "&continuation-token=" + encodeURIComponent(token) : ""}`);
    const x = await r.text();
    out = out.concat([...x.matchAll(/<Prefix>([^<]+)<\/Prefix>/g)].map((m) => m[1]).filter((p) => p !== prefix));
    out = out.concat([...x.matchAll(/<Key>([^<]+)<\/Key><LastModified>([^<]+)/g)].map((m) => m[1] + "  " + m[2]));
    const t = x.match(/<NextContinuationToken>([^<]+)</);
    if (!t) break; token = t[1];
  }
  return out;
}
const enrs = await list("ENRS/");
console.log("ENRS folders from 2024 on:", enrs.filter((p) => /20(2[4-9])/.test(p)).join("\n  "));
for (const p of enrs.filter((p) => /ENRS\/2025|ENRS\/2026/.test(p))) console.log(p, (await list(p)).slice(0, 15).join("\n    "));
const top = await list("");
console.log("top level:", top.join(" | "));
const el = await list("Elections/");
console.log("Elections/:", el.filter((p) => /202[5-6]/.test(p)).join(" | "));
for (const p of el.filter((p) => /2026/.test(p))) console.log(p, (await list(p)).slice(0, 30).join("\n    "));
for (const u of ["https://er.ncsbe.gov/", "https://er.ncsbe.gov/enr/20261103/data/results_0.txt", "https://er.ncsbe.gov/enr/20260303/data/results_0.txt", "https://er.ncsbe.gov/enr/20241105/data/results_0.txt"]) {
  try { const r = await fetch(u); const t = await r.text(); console.log(u, r.status, t.slice(0, 300).replace(/\s+/g, " ")); } catch (e) { console.log(u, "ERR", e.message); }
}
