# Natural Gas Weather Monitor

**John Barreto · Independent natural gas research**

Compare archived NOAA GFS forecast runs, regional HDD/CDD revisions and common valid dates.

**[Open this project](https://neurax-jb.github.io/natural-gas-weather-monitor/) · [Research portfolio](https://neurax-jb.github.io/Henry-Hub-Futures-Curve-Explorer-How-the-Natural-Gas-Market-prices-winter/lab/)**

**Methods and tools:** Python, GDAL, NumPy, JavaScript, geospatial data.

## Research question
Where and by how much did forecast temperature exposure change between two GFS cycles?

The monitor compares matching UTC valid dates, calculates population-weighted heating and cooling degree days using Census county populations, and visualizes state-level revisions. Degree days describe temperature exposure; they are not direct estimates of natural gas demand.

## Methods and evidence
- [Weather methodology and source attribution](lab/weather/README.md)
- [Forecast archive](lab/weather/runs.json)
- [GRIB sampling and archive builder](lab/weather/research/build_runs.py)
- [Revision calculation tests](lab/weather/research/weather.test.js)

## Run locally
Serve the root with `python -m http.server 8000` and visit `http://localhost:8000/`. Run `node --test lab/weather/research/*.test.js` to check the comparison engine and page behavior, then `python -m unittest discover -s lab/weather/research -p 'test_*.py'` for the archive guards (Python standard library only). Rebuilding raw GFS data requires GDAL and NumPy; follow the project methodology. See [validation instructions](VALIDATION.md) for the complete offline checks and CI environment.

## Source and publication

This repository is a project-specific snapshot of the [canonical research lab](https://github.com/NeuraX-JB/Henry-Hub-Futures-Curve-Explorer-How-the-Natural-Gas-Market-prices-winter). The original automated updates and publication ledger remain there. This repository hosts a separately inspectable historical snapshot; [source revisions and frozen-data hashes](SOURCE_SNAPSHOT.json) identify it. Check the [source and attribution notes](DATA_SOURCES.md) before reusing third-party data. No new license is granted. Research and educational use; not investment advice.
