"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../engine.js");
const archive = require("../runs.json");
const geo = require("../map.json");
const vintage = (day) => day + "T00:00:00Z";
function closeTo(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-7,
    `Expected ${actual} to be close to ${expected}`,
  );
}
const old = vintage("2026-11-21");
const next = vintage("2026-11-22");

test("archive validates and geography covers exactly the Census-weighted areas", () => {
  assert.equal(engine.check(archive), archive);
  assert.deepEqual(
    archive.states.map((s) => s.code).sort(),
    Object.keys(geo.states).sort(),
  );
  assert.equal(
    archive.states.reduce((sum, s) => sum + s.population, 0),
    329260619,
  );
  assert.equal(archive.county_count, 3108);
  for (const s of archive.states)
    assert.match(geo.states[s.code].path, /^M.*Z$/);
});

test("moving forecast window retains only UTC dates present in both runs", () => {
  const result = engine.calculate(archive, old, next, "hdd");
  assert.equal(result.oldCount, 9);
  assert.equal(result.newCount, 9);
  assert.equal(result.dates.length, 8);
  assert.equal(result.dates[0], "2026-11-23");
  assert.equal(result.dates.at(-1), "2026-11-30");
  assert.ok(!result.dates.includes("2026-12-01"));
  assert.ok(!result.dates.includes("2026-11-22"));
});

test("disjoint cycles yield no comparison and playback skips the archive gap", () => {
  const august = vintage("2026-08-11");
  const november = vintage("2026-11-18");
  assert.deepEqual(
    engine.calculate(archive, august, november, "hdd").dates,
    [],
  );
  const pairs = engine.pairs(archive);
  assert.ok(pairs.some(([a, b]) => a === old && b === next));
  assert.ok(!pairs.some(([a, b]) => a === august && b === november));
  for (const [a, b] of pairs) {
    assert.ok(a < b);
    assert.ok(engine.calculate(archive, a, b, "both").dates.length > 0);
  }
});

test("national series weights states and revision equals later minus earlier", () => {
  const result = engine.calculate(archive, old, next, "hdd");
  const prior = archive.runs.find((r) => r.init === old);
  const later = archive.runs.find((r) => r.init === next);
  const population = archive.states.reduce((a, s) => a + s.population, 0);
  let totalChange = 0;
  for (const day of result.series("US")) {
    const sum = (run) =>
      run.days[day.day].reduce(
        (acc, point, i) => acc + point[0] * archive.states[i].population,
        0,
      ) / population;
    closeTo(day.old, sum(prior));
    closeTo(day.now, sum(later));
    closeTo(day.change, sum(later) - sum(prior));
    totalChange += day.change;
  }
  closeTo(totalChange, -7.1122650473487035);
  const pennsylvania = result.byState.find((s) => s.code === "PA");
  closeTo(pennsylvania.change, -25.473);
  closeTo(
    pennsylvania.change,
    result.series("PA").reduce((sum, day) => sum + day.change, 0),
  );
});

test("heating and cooling are separate positive exposures, combined measure is additive", () => {
  const [a, b] = [vintage("2026-08-09"), vintage("2026-08-10")];
  const combine = (metric) =>
    engine.calculate(archive, a, b, metric).series("US");
  const h = combine("hdd"),
    c = combine("cdd"),
    both = combine("both");
  assert.ok(c.some((r) => r.now > 5));
  for (let i = 0; i < both.length; i++) {
    for (const key of ["old", "now", "change"])
      closeTo(both[i][key], h[i][key] + c[i][key]);
  }
});
