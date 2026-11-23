(function (root) {
  "use strict";
  function validDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(value + "T00:00:00Z"))
      && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
  }
  function check(data) {
    if (
      !data || typeof data !== "object" ||
      data.schema !== 1 ||
      !Array.isArray(data.states) ||
      data.states.length !== 49 ||
      !Array.isArray(data.runs) || !data.runs.length
    )
      throw Error("Incomplete archive metadata.");
    if (data.base_f !== 65 || data.units !== "°F·day" || data.cycle !== "00 UTC"
        || data.model !== "NOAA GFS deterministic 0.5°" || data.hours_per_day !== 4
        || JSON.stringify(data.components) !== '["hdd","cdd"]'
        || JSON.stringify(data.sample_hours_utc) !== '[0,6,12,18]'
        || data.weight !== "2020 Census county resident population")
      throw Error("Archive method does not match this monitor's units, model or weighting.");
    const expectedCodes = "AL AZ AR CA CO CT DE DC FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ").sort();
    const stateCodes = data.states.map((s) => s.code);
    if (
      new Set(stateCodes).size !== 49 ||
      JSON.stringify([...stateCodes].sort()) !== JSON.stringify(expectedCodes) ||
      !data.states.every(
        (s) => Number.isSafeInteger(s.population) && s.population > 0 && typeof s.name === "string" && s.name.trim(),
      )
    )
      throw Error("Invalid geographic weights.");
    const seen = new Set();
    data.runs.forEach((run) => {
      if (!run || typeof run.init !== "string" || seen.has(run.init)
          || !/^\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(run.init) || !validDate(run.init.slice(0,10)))
        throw Error("Invalid run initialization.");
      if (!run.days || typeof run.days !== "object" || Array.isArray(run.days) || !Object.keys(run.days).length)
        throw Error("Run has no complete valid dates.");
      seen.add(run.init);
      for (const [day, states] of Object.entries(run.days)) {
        if (
          day <= run.init.slice(0, 10) ||
          !validDate(day) || !Array.isArray(states) ||
          states.length !== stateCodes.length
        )
          throw Error("Invalid valid date or incomplete state set.");
        if (
          !states.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              Number.isFinite(p[0]) && p[0] >= 0 && Number.isFinite(p[1]) && p[1] >= 0,
          )
        )
          throw Error("Invalid degree-day value.");
      }
    });
    return data;
  }
  function calculate(data, earlier, later, metric) {
    if (earlier >= later) throw Error("Later initialization must follow earlier initialization.");
    const old = data.runs.find((r) => r.init === earlier),
      modern = data.runs.find((r) => r.init === later);
    if (!old || !modern) throw Error("Unknown initialization.");
    if (!["hdd", "cdd", "both"].includes(metric))
      throw Error("Unknown degree-day measure.");
    const overlap = Object.keys(old.days)
      .filter((day) => Object.hasOwn(modern.days, day))
      .sort();
    const get = (p) =>
      metric === "hdd" ? p[0] : metric === "cdd" ? p[1] : p[0] + p[1];
    const n = data.states.length,
      pop = data.states.reduce((s, x) => s + x.population, 0),
      codes = new Map(data.states.map((s, i) => [s.code, i]));
    const byState = data.states.map((state) => ({
      code: state.code,
      name: state.name,
      old: 0,
      now: 0,
      change: 0,
    }));
    const daily = overlap.map((day) => {
      let a = 0,
        b = 0;
      const states = Array.from({ length: n }, (_, i) => {
        const av = get(old.days[day][i]),
          bv = get(modern.days[day][i]);
        const w = data.states[i].population / pop;
        a += av * w;
        b += bv * w;
        byState[i].old += av;
        byState[i].now += bv;
        return { old: av, now: bv, change: bv - av };
      });
      return { day, old: a, now: b, change: b - a, states };
    });
    for (const s of byState) s.change = s.now - s.old;
    function series(code) {
      if (code === "US")
        return daily.map(({ day, old, now, change }) => ({
          day,
          old,
          now,
          change,
        }));
      const i = codes.get(code);
      if (i === undefined) throw Error("Unknown geography.");
      return daily.map((d) => ({ day: d.day, ...d.states[i] }));
    }
    return {
      dates: overlap,
      byState,
      series,
      oldCount: Object.keys(old.days).length,
      newCount: Object.keys(modern.days).length,
    };
  }
  function pairs(data) {
    const runs = data.runs.slice().sort((a, b) => a.init.localeCompare(b.init));
    return runs
      .slice(1)
      .map((r, i) => [runs[i], r])
      .filter(([a, b]) =>
        Object.keys(a.days).some((x) => Object.hasOwn(b.days, x)),
      )
      .map(([a, b]) => [a.init, b.init]);
  }
  function archiveScale(data, metric) {
    const runs = data.runs.map(r => r.init).sort();
    let maximum = 1;
    for (let i=0;i<runs.length;i++) for (let j=i+1;j<runs.length;j++)
      for (const state of calculate(data,runs[i],runs[j],metric).byState)
        maximum = Math.max(maximum,Math.abs(state.change));
    return Math.ceil(maximum);
  }
  function restoreSelection(data, search) {
    const validPairs = pairs(data), last = validPairs.at(-1);
    if (!last) throw Error("No overlapping archived runs.");
    const fallback = {earlier:last[0],later:last[1],metric:"hdd",region:"US",invalid:false};
    const query = new URLSearchParams(search);
    if (!["earlier","later","metric","region"].some(k=>query.has(k))) return fallback;
    const selected = {...fallback};
    for (const key of ["earlier","later","metric","region"]) if (query.has(key)) selected[key]=query.get(key);
    try {
      if (!["hdd","cdd","both"].includes(selected.metric)
          || !(selected.region === "US" || data.states.some(s=>s.code===selected.region))
          || !calculate(data,selected.earlier,selected.later,selected.metric).dates.length) throw Error("Unavailable selection");
      return selected;
    } catch { return {...fallback,invalid:true}; }
  }
  function csvName(geography, metric, earlier, later) {
    return `gfs-revision_${geography}_${metric}_${earlier.slice(0,10)}_${later.slice(0,10)}.csv`;
  }
  const api = { check, calculate, pairs, validDate, archiveScale, restoreSelection, csvName };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WeatherEngine = api;
})(globalThis);
