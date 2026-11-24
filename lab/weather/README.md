# Natural Gas Weather Revision Monitor

Choose an earlier and a later GFS run, a heating/cooling measure, and a geography. The map shows each state's cumulative revision across the shared dates, in °F·days. Select a state to see each daily value in the chart and table. Previous pair, Next pair, and Play replay walk adjacent archived cycles that have overlapping forecast dates. Export daily CSV saves the selected geography, forecast vintages, valid dates and degree-day values. Filenames identify the weather measure. The address bar preserves the selected pair, measure and geography so a comparison can be bookmarked or shared. Replay stops at the newest pair; restarting it is explicit.

## Published archive

Eight 00 UTC initializations from August 9–11 and November 18–22, 2026 cover a summer and late-autumn period. Each cycle supplies nine complete UTC days starting on the day after initialization. The static files work on any HTTP server without credentials. The page identifies the newest archived initialization, compilation timestamp and data sources. To serve locally from this directory, run `python3 -m http.server 8000` and open `http://localhost:8000`.

## Computation

1. The builder locates the 2 m air-temperature entry in each NOAA GFS 0.5° GRIB2 index and downloads only the byte range containing that field. It checks the HTTP range and validates the GRIB variable, height, units, initialization and valid time. The included eight cycles used 288 fields.
2. Each 2020 Census county mean center of population samples the nearest grid cell. Average its temperature at 00, 06, 12 and 18 UTC on each valid date. Compute county heating degree days as max(65 − mean °F, 0), and cooling degree days as max(mean °F − 65, 0).
3. Average county exposures by their 2020 resident population inside each state. The file stores state values to four decimal places. The national series weights those state values by their populations. The 3,108 county/county-equivalent weights represent 329,260,619 residents across the 48 contiguous states and DC.
4. Intersect the two original runs' UTC valid dates. Subtract earlier exposure from later exposure for each matched date. A state map value adds those daily revisions across the shared window. Its color scale is symmetric around zero and fixed for each weather measure across all chronological pairs in the loaded archive, so replay colors use the same scale. Matched-window lengths still need to be compared separately. An empty intersection produces a message.

Degree days describe temperature exposure. Conversion into gas demand would require a sector- and region-specific demand model. Four instantaneous temperature samples approximate the daily mean; a local gas day or a min/max-based index can yield a different estimate. The state averages are population weighted and the population weights are fixed to the 2020 Census.

## Reading the archived JSON

The `states` array defines the order of areas in each daily array. For `runs[i].days["YYYY-MM-DD"][j]`, look up the area in `states[j]`. Its two values are heating and cooling degree days in that order. `init` identifies the run, while the day key identifies the period forecast. To reproduce the national figure, weight each state's daily value by its share of the archive's total population before summing the matched days.

For a state, the map sums its own revisions. A large state-map value describes a change in exposure within that state. Its contribution to the national change equals that value multiplied by its population share. The national average can therefore move very little while individual states see large revisions.

## Update or reproduce

Use Python 3, NumPy and GDAL with the GRIB driver. The app itself uses plain HTML, JavaScript and CSS. On Debian/Ubuntu the builder can use the system interpreter with `python3-gdal` and `python3-numpy`. Run from this directory. Write an independent reconstruction to a separate file so it can be compared with the checked-in archive.

```bash
/usr/bin/python3 research/build_runs.py --out /tmp/gfs-weather-rebuilt.json
node --test research/*.test.js
python3 -m unittest discover -s research -p "test_*.py"
```

Add original cycles by giving their UTC initialization dates after NOAA publishes the required lead hours. The merge retains earlier cycles and rejects a differing replacement for an existing initialization. After investigating a deliberate correction, `--merge --replace-existing` permits replacing that cycle. Method, units and weighting must match even with that flag; publish the resulting `runs.json` alongside the app. For example, copy the published archive and check the last two cycles against that copy.

```bash
cp runs.json /tmp/gfs-weather-merge.json
/usr/bin/python3 research/build_runs.py --out /tmp/gfs-weather-merge.json --merge --dates 2026-11-21 2026-11-22
```

The builder caches sampled temperatures and the Census input in the system temporary directory. Cached temperatures are checked against the same finite-value and physical-range rules as fresh samples. Use a new `--cache` directory to repeat the upstream download. For a reconstruction, compare the `states` and `runs` arrays in the two files. The compilation timestamp changes on each build, so the complete file can have a new digest even when all forecast values match. The `retrieved_utc` field is the archive compilation time, including when a local input cache was used. The NOAA reference time remains recorded separately for every run. Use the default nine-day horizon to extend this archive consistently.

The map can be rebuilt independently with the Python standard library.

```bash
python3 research/build_map.py --out map.json
```

## Public sources

- NOAA Global Forecast System operational archive and field indexes, [AWS Open Data Registry](https://registry.opendata.aws/noaa-gfs-bdp-pds/).
- U.S. Census Bureau, 2020 county [centers of population with resident counts](https://www2.census.gov/geo/docs/reference/cenpop2020/county/CenPop2020_Mean_CO.txt). The input file's SHA-256 digest is in `runs.json`.
- U.S. Census Bureau 2017 cartographic boundaries, in [us-atlas 3.0.1](https://github.com/topojson/us-atlas). The map builder verifies the input release's SHA-256 checksum. The accompanying `research/US_ATLAS_LICENSE` covers the us-atlas transformation.
