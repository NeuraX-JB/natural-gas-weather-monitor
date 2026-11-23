(function (root) {
  "use strict";
  function check(data) {
    if (
      data.schema !== 1 ||
      !Array.isArray(data.states) ||
      data.states.length !== 49 ||
      !Array.isArray(data.runs)
    )
      throw Error("Incomplete archive metadata.");
    const stateCodes = data.states.map((s) => s.code);
    if (
      new Set(stateCodes).size !== 49 ||
      !data.states.every(
        (s) => Number.isFinite(s.population) && s.population > 0,
      )
    )
      throw Error("Invalid geographic weights.");
    const seen = new Set();
    data.runs.forEach((run) => {
      if (seen.has(run.init) || !/^\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(run.init))
        throw Error("Invalid run initialization.");
      seen.add(run.init);
      for (const [day, states] of Object.entries(run.days)) {
        if (
          day <= run.init.slice(0, 10) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
          states.length !== stateCodes.length
        )
          throw Error("Invalid valid date or incomplete state set.");
        if (
          !states.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              p.every((x) => Number.isFinite(x) && x >= 0),
          )
        )
          throw Error("Invalid degree-day value.");
      }
    });
    return data;
  }
  function calculate(data, earlier, later, metric) {
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
  const api = { check, calculate, pairs };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WeatherEngine = api;
})(globalThis);
