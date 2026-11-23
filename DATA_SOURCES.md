# Data use and attribution

This repository presents independent research and educational applications. Public access to source data does not necessarily grant unrestricted redistribution or commercial reuse.

| Source | Material used | Where documented |
| :--- | :--- | :--- |
| U.S. Energy Information Administration (EIA) | Lower 48 storage, Henry Hub spot observations and historical futures archive | [Shared source notes](lab/data/README.md), [EIA data](https://www.eia.gov/naturalgas/) |
| NOAA Climate Prediction Center | Observed population-weighted degree days | [Shared source notes](lab/data/README.md) |
| NOAA GFS operational archive | Archived temperature forecast fields | [Weather methodology](lab/weather/README.md) |
| U.S. Census Bureau / us-atlas | Population sampling weights and state geometry | [Weather methodology](lab/weather/README.md), [us-atlas license](lab/weather/research/US_ATLAS_LICENSE) |
| SEC filings | Selected reconstructed futures curve snapshots and archived price examples | [Curve explorer](https://neurax-jb.github.io/Henry-Hub-Futures-Curve-Explorer-How-the-Natural-Gas-Market-prices-winter/), [Industrial simulator](https://neurax-jb.github.io/Henry-Hub-Futures-Curve-Explorer-How-the-Natural-Gas-Market-prices-winter/lab/industrial/) |

EIA attributes the underlying Henry Hub spot price data to Refinitiv, an LSEG business. Check the relevant third-party terms before redistributing or using those quotes commercially. Filings may include third-party information and do not automatically confer a redistribution license.

The [source manifest](lab/data/manifest.json) documents retrieval times and hashes; the [API metadata](lab/api/v1/index.json) documents coverage and units. Historical source files may contain revisions.

No repository-wide license is declared. The separate us-atlas license remains applicable to its covered material. A repository-wide license and the rights to any third-party datasets or media should be reviewed independently before relicensing or commercial distribution. Nothing in this document grants new rights to third-party content.
