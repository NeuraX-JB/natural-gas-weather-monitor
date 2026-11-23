# Validate this research snapshot

Run these commands from the repository root using Python 3.12 and Node.js 24:

```sh
python -m pip install -r scripts/requirements-ci.txt
python scripts/validate.py
```

The same commands run on pushes and pull requests. The validator checks local HTML/Markdown/CSS links, parses JSON without duplicate keys or non-standard numbers, verifies frozen-data hashes, and runs the project regression commands listed in `scripts/checks.json`. It does not fetch new observations or alter the stored research data. `python scripts/validate.py --static-only` runs only the structural and data-integrity checks.

`SOURCE_SNAPSHOT.json` records the original public source revision, the reviewed baseline, and hashes of the frozen input/data artifacts. A deliberate new data snapshot requires updating its provenance and hashes as part of a reviewed change. CI failure on a changed hash is intentional; it must not be bypassed by silently relabeling the old study.

This is an offline validation gate. It does not establish real-time freshness, historical point-in-time availability, forecast skill, third-party source availability, or visual correctness in every browser. Open the deployed demo and inspect its displayed dates and limitations as well.
