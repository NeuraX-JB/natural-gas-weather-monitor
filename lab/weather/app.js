(async function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    NS = "http://www.w3.org/2000/svg";
  const node = (tag, text = "", cls = "") => {
    const e = document.createElement(tag);
    if (text !== "") e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const svg = (name, attrs, text) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {}))
      e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const format = (iso, year = false) =>
    new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso).toLocaleDateString(
      "en-GB",
      {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        ...(year ? { year: "numeric" } : {}),
      },
    );
  const fmt = (n) => (Math.abs(n) < 0.005 ? "0.00" : n.toFixed(2));
  const sign = (n) =>
    Math.abs(n) < 0.005 ? "0.00" : (n > 0 ? "+" : "−") + Math.abs(n).toFixed(2);
  const colorClass = (n) => (n > 0.005 ? "pos" : n < -0.005 ? "neg" : "");
  function downloads(text, name) {
    const u = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const a = node("a");
    a.href = u;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2500);
  }
  let data,
    geo,
    validPairs,
    timer,
    comparison,
    daily,
    geography,
    metric,
    earlier,
    later;
  function color(n, limit) {
    const neutral = [242, 240, 230],
      end = n < 0 ? [172, 84, 46] : [8, 118, 104],
      p = Math.min(1, Math.abs(n) / limit);
    return (
      "rgb(" +
      neutral.map((v, i) => Math.round(v + (end[i] - v) * p)).join(",") +
      ")"
    );
  }
  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    $("play").textContent = "Play replay";
    $("play").setAttribute("aria-pressed", "false");
  }
  function selectPair(i) {
    const [a, b] = validPairs[(i + validPairs.length) % validPairs.length];
    $("earlier").value = a;
    $("later").value = b;
    render();
  }
  function step(direction) {
    const cur = validPairs.findIndex(
      (p) => p[0] === $("earlier").value && p[1] === $("later").value,
    );
    selectPair(
      cur === -1
        ? direction > 0
          ? 0
          : validPairs.length - 1
        : cur + direction,
    );
  }
  function setGeo(code) {
    $("region").value = code;
    render();
  }
  function drawMap(rev) {
    const map = $("map");
    map.replaceChildren();
    map.setAttribute("viewBox", geo.viewBox);
    const maxAbs = Math.max(0.1, ...rev.map((s) => Math.abs(s.change)));
    const limit = Math.max(1, Math.ceil(maxAbs));
    $("low").textContent = sign(-limit);
    $("high").textContent =
      sign(limit) + " " + metric.toUpperCase().replace("BOTH", "DD");
    $("mapcaption").textContent =
      metricLabel() + " change, later minus earlier · matched window";
    const updateNote = (s) => {
      $("mapnote").textContent = s
        ? s.name +
          " · " +
          sign(s.change) +
          " " +
          metricLabel() +
          " across matched dates."
        : "Select a state on the map or from the geography menu.";
    };
    const selected = rev.find((s) => s.code === geography);
    updateNote(selected);
    const shapes = [];
    rev.forEach((s) => {
      const shape = geo.states[s.code];
      if (!shape) throw Error("Missing state map for " + s.code);
      const path = svg("path", {
        d: shape.path,
        fill: color(s.change, limit),
        "fill-rule": "evenodd",
        role: "button",
        tabindex: "0",
        "aria-label": s.name + " " + sign(s.change) + " " + metricLabel(),
        "aria-pressed": s.code === geography ? "true" : "false",
      });
      if (s.code === geography) path.classList.add("active");
      path.append(svg("title", {}, s.name + " · " + sign(s.change)));
      path.addEventListener("pointerenter", () => updateNote(s));
      path.addEventListener("pointerleave", () => updateNote(selected));
      path.addEventListener("focus", () => updateNote(s));
      path.addEventListener("blur", () => updateNote(selected));
      path.addEventListener("click", () => setGeo(s.code));
      path.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setGeo(s.code);
          $("region").focus();
        }
      });
      shapes.push([s.code, path]);
    });
    // Small jurisdictions stay above surrounding shapes and are also available from the menu.
    for (const [, path] of shapes.sort(
      (a, b) => (a[0] === "DC") - (b[0] === "DC"),
    ))
      map.append(path);
  }
  function metricLabel() {
    return metric === "hdd" ? "HDD" : metric === "cdd" ? "CDD" : "HDD + CDD";
  }
  function drawChart(rows) {
    const W = 550,
      H = 165,
      left = 39,
      right = W - 26,
      top = 15,
      bottom = 132;
    const chart = svg("svg", {
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      "aria-label":
        "Earlier and later " +
        metricLabel() +
        " by matched date; exact values in the table below.",
    });
    const max = Math.max(1, ...rows.flatMap((r) => [r.old, r.now])),
      rough = max / 4,
      mag = Math.pow(10, Math.floor(Math.log10(rough))),
      step = [1, 2, 5, 10].map((n) => n * mag).find((n) => n >= rough);
    const limit = Math.ceil(max / step) * step;
    const x = (i) =>
        rows.length === 1
          ? (left + right) / 2
          : left + (i * (right - left)) / (rows.length - 1),
      y = (v) => bottom - (v / limit) * (bottom - top);
    for (let i = 0; i <= Math.ceil(limit / step); i++) {
      const v = i * step;
      chart.append(
        svg("line", {
          x1: left,
          x2: right,
          y1: y(v),
          y2: y(v),
          stroke: "#dfe6e0",
        }),
        svg(
          "text",
          {
            x: left - 5,
            y: y(v) + 4,
            "text-anchor": "end",
            fill: "#566b64",
            "font-size": 12,
          },
          Number(v.toFixed(2)),
        ),
      );
    }
    rows.forEach((r, i) => {
      if (
        i === 0 ||
        i === rows.length - 1 ||
        i % Math.max(1, Math.round(rows.length / 4)) === 0
      )
        chart.append(
          svg(
            "text",
            {
              x: x(i),
              y: 153,
              "text-anchor": "middle",
              fill: "#566b64",
              "font-size": 12,
            },
            format(r.day),
          ),
        );
    });
    for (const [key, col, dash] of [
      ["old", "#ac5b34", "4 4"],
      ["now", "#087668", "none"],
    ]) {
      chart.append(
        svg("path", {
          d: rows
            .map(
              (r, i) =>
                (i ? "L" : "M") + x(i).toFixed(1) + " " + y(r[key]).toFixed(1),
            )
            .join(" "),
          fill: "none",
          stroke: col,
          "stroke-width": 2.3,
          "stroke-dasharray": dash,
        }),
      );
      rows.forEach((r, i) => {
        const dot = svg("circle", {
          cx: x(i),
          cy: y(r[key]),
          r: 3,
          fill: "white",
          stroke: col,
          "stroke-width": 1.8,
        });
        dot.append(
          svg(
            "title",
            {},
            format(r.day, true) +
              " · " +
              (key === "old" ? "earlier" : "later") +
              " " +
              fmt(r[key]),
          ),
        );
        chart.append(dot);
      });
    }
    $("dailychart").replaceChildren(chart);
  }
  function render() {
    earlier = $("earlier").value;
    later = $("later").value;
    metric = $("metric").value;
    geography = $("region").value;
    comparison = WeatherEngine.calculate(data, earlier, later, metric);
    const days = comparison.dates;
    const bad =
      earlier >= later
        ? "Choose a later initialization that follows the earlier one."
        : !days.length
          ? "These forecast horizons have no shared valid dates. Select a closer pair or use the replay controls."
          : "";
    $("content").hidden = !!bad;
    $("message").hidden = !bad;
    $("message").textContent = bad;
    if (bad) return;
    daily = comparison.series(geography);
    const a = daily.reduce((s, r) => s + r.old, 0),
      b = daily.reduce((s, r) => s + r.now, 0),
      measure = metricLabel();
    const name =
      geography === "US"
        ? "Lower 48 + DC"
        : data.states.find((s) => s.code === geography).name;
    $("headline").textContent = name + " · " + measure + " outlook";
    $("window").textContent =
      days.length +
      " matched UTC " +
      (days.length === 1 ? "date" : "dates") +
      " · " +
      format(days[0], true) +
      (days.length === 1 ? "" : " – " + format(days.at(-1), true)) +
      " · " +
      (comparison.oldCount - days.length) +
      " earlier-only and " +
      (comparison.newCount - days.length) +
      " later-only excluded";
    $("stats").replaceChildren(
      ...[
        ["Earlier run", fmt(a), format(earlier, true) + " · 00Z"],
        ["Later run", fmt(b), format(later, true) + " · 00Z"],
        ["Revision", sign(b - a), measure + " over matched window"],
      ].map(([title, value, sub]) => {
        const card = node("article");
        card.append(
          node("small", title),
          node("strong", value),
          node("span", sub),
        );
        return card;
      }),
    );
    $("chartcaption").textContent = name + " · " + measure + " per UTC day";
    drawMap(comparison.byState);
    drawChart(daily);
    $("dailytbody").replaceChildren(
      ...daily.map((r) => {
        const tr = node("tr");
        tr.append(
          node("td", format(r.day, true)),
          node("td", fmt(r.old)),
          node("td", fmt(r.now)),
          node("td", sign(r.change), colorClass(r.change)),
        );
        return tr;
      }),
    );
    $("statetbody").replaceChildren(
      ...comparison.byState
        .slice()
        .sort(
          (s, t) =>
            Math.abs(t.change) - Math.abs(s.change) ||
            s.name.localeCompare(t.name),
        )
        .map((s) => {
          const tr = node("tr"),
            c = node("td"),
            button = node("button", s.name);
          button.type = "button";
          button.onclick = () => {
            setGeo(s.code);
            $("headline").scrollIntoView({ block: "start" });
          };
          c.append(button);
          tr.append(
            c,
            node("td", fmt(s.old)),
            node("td", fmt(s.now)),
            node("td", sign(s.change), colorClass(s.change)),
          );
          return tr;
        }),
    );
  }
  try {
    const load = async (path) => {
      const r = await fetch(path);
      if (!r.ok) throw Error(path + " unavailable");
      return r.json();
    };
    [data, geo] = await Promise.all([load("runs.json"), load("map.json")]);
    WeatherEngine.check(data);
    validPairs = WeatherEngine.pairs(data);
    if (!validPairs.length) throw Error("No overlapping archived runs.");
    const runs = data.runs.slice().sort((a, b) => b.init.localeCompare(a.init));
    ["earlier", "later"].forEach((id) =>
      $(id).replaceChildren(
        ...runs.map((r) => new Option(format(r.init, true) + " · 00Z", r.init)),
      ),
    );
    $("region").replaceChildren(
      new Option("Lower 48 + DC", "US"),
      ...data.states
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => new Option(s.name, s.code)),
    );
    ["earlier", "later", "metric", "region"].forEach(
      (id) =>
        ($(id).onchange = () => {
          stop();
          render();
        }),
    );
    $("vintage").textContent =
      "Archived GFS · latest initialization " +
      format(runs[0].init, true) +
      " at 00:00 UTC";
    $("coverage").textContent =
      data.runs.length +
      " initializations · " +
      data.county_count.toLocaleString("en-US") +
      " counties / county equivalents · " +
      data.states.length +
      " areas · archive compiled " +
      data.retrieved_utc.replace("T", " ").replace("Z", " UTC") +
      ". Alaska, Hawaii and U.S. territories are outside the coverage area.";
    $("back").onclick = () => {
      stop();
      step(-1);
    };
    $("next").onclick = () => {
      stop();
      step(1);
    };
    $("latest").onclick = () => {
      stop();
      selectPair(validPairs.length - 1);
    };
    $("play").onclick = () => {
      if (timer) {
        stop();
        return;
      }
      step(1);
      $("play").textContent = "Pause replay";
      $("play").setAttribute("aria-pressed", "true");
      timer = setInterval(() => step(1), 2600);
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
    });
    $("csv").onclick = () => {
      const header =
        "geography,metric,earlier_initialization_utc,later_initialization_utc,valid_utc_date,earlier_degree_days,later_degree_days,revision_degree_days";
      downloads(
        [
          header,
          ...daily.map((r) =>
            [
              geography,
              metric,
              earlier,
              later,
              r.day,
              r.old.toFixed(5),
              r.now.toFixed(5),
              r.change.toFixed(5),
            ].join(","),
          ),
        ].join("\r\n") + "\r\n",
        "gfs-revision_" +
          geography +
          "_" +
          earlier.slice(0, 10) +
          "_" +
          later.slice(0, 10) +
          ".csv",
      );
    };
    selectPair(validPairs.length - 1);
  } catch (err) {
    $("message").hidden = false;
    $("message").textContent =
      "The weather archive could not be opened. Reload this page and check the data links below.";
    $("vintage").textContent = "Archive unavailable.";
    console.error(err);
  }
})();
