"""Pure validation rules shared by the GFS builder and offline tests."""
import math

METHOD_FIELDS = (
    "schema", "model", "cycle", "units", "base_f", "sample_hours_utc",
    "hours_per_day", "weight", "census_sha256", "county_count", "states", "components",
)


def validate_temperatures(values, expected_size):
    """Cached and freshly sampled temperatures use the same Fahrenheit bounds."""
    try:
        valid = getattr(values, "shape", (len(values),)) == (expected_size,) and len(values) == expected_size and all(
            math.isfinite(value) and -100 <= value <= 150 for value in values
        )
    except (TypeError, ValueError):
        valid = False
    if not valid:
        raise ValueError("County temperatures must be a complete finite vector within -100 to 150 °F.")
    return values


def merge_runs(old, new, replace_existing=False):
    """Keep recorded cycles immutable unless replacement is explicitly requested."""
    if any(key not in old or key not in new or old[key] != new[key] for key in METHOD_FIELDS):
        raise ValueError("Old archive uses different method, units or weights; cannot merge.")
    existing = {run["init"]: run for run in old["runs"]}
    if len(existing) != len(old["runs"]):
        raise ValueError("Old archive contains duplicate initializations.")
    for run in new["runs"]:
        previous = existing.get(run["init"])
        if previous is not None and previous != run and not replace_existing:
            raise ValueError(f"Archived cycle {run['init']} differs; use --replace-existing only after reviewing the change.")
        existing[run["init"]] = run
    return sorted(existing.values(), key=lambda run: run["init"])
