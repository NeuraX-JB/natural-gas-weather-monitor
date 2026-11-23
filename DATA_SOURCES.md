# Data use and attribution

This weather project uses archived GFS temperature forecasts, Census county population weights, and state-map geometry.

| Source | Material | Local evidence |
| --- | --- | --- |
| [NOAA GFS archive](https://registry.opendata.aws/noaa-gfs-bdp-pds/) | Deterministic 00 UTC forecast fields on the 0.5° grid | [Method and archive dates](lab/weather/README.md) · [Archived runs](lab/weather/runs.json) |
| [U.S. Census county population centers](https://www2.census.gov/geo/docs/reference/cenpop2020/county/CenPop2020_Mean_CO.txt) | 2020 resident populations and mean centers | [Sampling method](lab/weather/README.md) · Census input hash in [runs.json](lab/weather/runs.json) |
| [Census geometry via us-atlas](https://github.com/topojson/us-atlas) | State and district boundaries | [Map builder](lab/weather/research/build_map.py) · [us-atlas license](lab/weather/research/US_ATLAS_LICENSE) |

The archive compilation timestamp is distinct from model initialization and original publication time. Cache reuse can avoid new downloads; it does not establish when a forecast first became publicly available. Degree-day revisions measure population-weighted temperature exposure, not gas demand in Bcf.

The us-atlas license remains applicable to its transformation. No repository-wide software or data license is declared. Public access to a source is not a blanket redistribution or commercial-use license; source terms continue to apply.
