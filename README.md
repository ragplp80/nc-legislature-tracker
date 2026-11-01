# NC Legislature — Election Night

Live tracker for the NC House and NC Senate on election night: are Republicans on track to keep each chamber, or can Democrats take one?

- **Page:** `index.html`. Refreshes every minute.
- **Results:** `api/results.js` downloads the NC State Board of Elections precinct results file and projects both chambers.
- **Projection:** `core.js`. Every precinct and vote type is compared with the same place and vote type in 2024 (and 2022). The average swing is applied to votes not yet counted.
- **Baseline:** `data/baseline.json`, built by the *Build baseline* GitHub job from the State Board's 2022 and 2024 files.

Rehearse with 2024 votes: `/?replay=2024&pct=40&shift=4`
