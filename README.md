# Natural Gas Weather Monitor

**John Barreto · Independent natural gas research**

How much can a regional heating forecast change while the national figure barely moves? On 21 November 2026, the NOAA Global Forecast System (GFS) added just **0.22 heating degree days** across the Lower 48 and DC compared with the previous day's run. Over the same eight forecast dates, Idaho lost **21.88**. Both figures describe revisions to population-weighted forecasts.

[Replay the Idaho comparison](https://neurax-jb.github.io/natural-gas-weather-monitor/lab/weather/?earlier=2026-11-20T00:00:00Z&later=2026-11-21T00:00:00Z&metric=hdd&region=ID) · [Open the full monitor](https://neurax-jb.github.io/natural-gas-weather-monitor/lab/weather/) · [Research portfolio](https://neurax-jb.github.io/Henry-Hub-Futures-Curve-Explorer-How-the-Natural-Gas-Market-prices-winter/lab/)

## Two comparisons from the archive

Each row sums daily exposure across dates present in **both** 00 UTC runs. Revision equals the later total minus the earlier total, in °F·days. Positive heating degree days (HDD) accumulate below a 65°F base. Cooling degree days (CDD) accumulate above it.

| Model runs, 2026 | Common forecast dates (UTC) | Geography and measure | Earlier | Later | Revision |
| --- | --- | --- | ---: | ---: | ---: |
| 9 → 10 Aug | 11–18 Aug | Lower 48 + DC · CDD | 96.41 | 105.77 | +9.36 |
| 20 → 21 Nov | 22–29 Nov | Lower 48 + DC · HDD | 127.70 | 127.92 | +0.22 |
| 20 → 21 Nov | 22–29 Nov | Idaho · HDD | 241.36 | 219.48 | −21.88 |

The August pair shows why the dates matter. The older run includes 10 August and the newer run includes 19 August. Comparing all nine days would mix a change in the forecast with a change in the calendar. Select a state to inspect each day's contribution. **Export daily CSV** saves that geography, measure, both run times and the matched daily values. [Replay the August cooling forecast](https://neurax-jb.github.io/natural-gas-weather-monitor/lab/weather/?earlier=2026-08-09T00:00:00Z&later=2026-08-10T00:00:00Z&metric=cdd&region=US)

## What the monitor measures

The archive contains eight deterministic 0.5° GFS runs initialized on 9–11 August and 18–22 November 2026. Each covers nine complete UTC days beginning the day after initialization. The two groups support six adjacent-run replays with overlapping dates.

The builder samples near each county's 2020 Census population center four times per UTC day. It calculates degree days for each county before weighting them by resident population across 48 states and DC. A gas-demand estimate in billion cubic feet would require a separate model of regional fuel use. To measure forecast accuracy, the projected temperatures would also need to be compared with observations.

[Calculation and sample times](lab/weather/README.md) · [Archive and weights](lab/weather/runs.json) · [Python archive builder](lab/weather/research/build_runs.py) · [JavaScript comparison engine](lab/weather/engine.js)

## Run and verify

From the repository root, start a local server. The viewer reads the two bundled JSON files.

```sh
python -m http.server 8000
```

Open [the local monitor](http://localhost:8000/lab/weather/). For the offline checks, run `python scripts/validate.py` with Python and Node.js installed. The checks cover local links, frozen data hashes, date matching, population weights, replay and export behavior. GDAL and NumPy are used when rebuilding the forecast archive. [Validation guide](VALIDATION.md) · [Calculation tests](lab/weather/research/weather.test.js)

This repository publishes a fixed extract from the [research lab](https://github.com/NeuraX-JB/Henry-Hub-Futures-Curve-Explorer-How-the-Natural-Gas-Market-prices-winter). The manifest records the source revision and data hashes. The archive records model initialization and compilation times. The original public release time for each field is unverified. Source terms apply and this repository grants no additional license. Research and educational use only. [Snapshot manifest](SOURCE_SNAPSHOT.json) · [Data sources and attribution](DATA_SOURCES.md)
