/* Ghat Watch upload engine (BR-90 to BR-93): reads a CSV of new readings, checks every row, and previews the ranking
   with the same rules as src/engine.py (rules come from data.js, which the build writes from rules.yaml).
   Pure JS, no network. Works in the browser and in Node (tests prove it reproduces the official scores exactly). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GW_UPLOAD = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DO = "Dissolved oxygen", BOD = "BOD", PH = "pH";
  var LIMITS = { bytes: 1000000, rows: 20000, errors: 60 };
  var REQUIRED = ["year", "festival", "site", "phase", "parameter", "source_page"];
  var COLUMNS = ["year", "festival", "site", "water_body", "phase", "parameter", "value", "unit_assumed", "flag",
    "value_as_printed", "parameter_as_printed", "site_as_printed", "site_match_confidence", "source_page"];

  /* ---------- CSV ---------- */
  /** RFC 4180 style: quoted fields, doubled quotes, CRLF or LF, optional BOM. */
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, "");
    var rows = [], row = [], field = "", q = false, i = 0, n = text.length;
    for (; i < n; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    return rows;
  }
  function csvField(v) {
    v = v == null ? "" : String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toCSV(rows) {
    return COLUMNS.join(",") + "\n" + rows.map(function (r) { return COLUMNS.map(function (c) { return csvField(r[c]); }).join(","); }).join("\n") + "\n";
  }
  function template() { return COLUMNS.join(",") + "\n"; }

  /* ---------- status of one reading (BR-01, BR-02, same as src/load.py reading_status) ---------- */
  function readingStatus(value, flag, rules) {
    flag = String(flag || "").trim();
    if (rules.flags.bdl.indexOf(flag) >= 0) return "bdl";
    if (rules.flags.missing.indexOf(flag) >= 0 && flag !== "") return "missing";
    var v = String(value == null ? "" : value).trim();
    return v !== "" && isFinite(Number(v)) ? "valid" : "missing";
  }

  /* ---------- existing readings, back from data.js ---------- */
  function existing(D) {
    var R = D.readings, site = {};
    D.scopes.all.forEach(function (g) { site[g.id] = g.site; });
    return R.rows.map(function (r) {
      return { site: site[R.ghat_ids[r[0]]], year: r[1], festival: R.festivals[r[2]], phase: R.phases[r[3]],
        parameter: R.parameters[r[4]], value: r[5], status: r[6], page: r[7] };
    });
  }
  function keyOf(r) { return [r.site, r.year, r.festival, r.phase, r.parameter].join("|"); }

  /* ---------- validation (BR-90) ---------- */
  /** Returns { rows (normalised, valid), errors [{row, code, p}], warnings, counts, fatal }. Row numbers match the file (header = 1). */
  function validate(D, text, opts) {
    opts = opts || {};
    var out = { rows: [], errors: [], warnings: [], skipped: [], fatal: null, total: 0 };
    if (String(text).length > LIMITS.bytes) { out.fatal = { code: "big" }; return out; }
    var table = parseCSV(text);
    if (table.length < 2) { out.fatal = { code: "empty" }; return out; }
    if (table.length - 1 > LIMITS.rows) { out.fatal = { code: "big" }; return out; }
    var head = table[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var missingCols = REQUIRED.filter(function (c) { return head.indexOf(c) < 0; });
    if (head.indexOf("value") < 0 && head.indexOf("flag") < 0) missingCols.push("value");
    if (missingCols.length) { out.fatal = { code: "columns", p: { col: missingCols.join(", ") } }; return out; }
    var col = {}; head.forEach(function (h, i) { if (col[h] == null) col[h] = i; });
    var get = function (r, c) { return col[c] == null ? "" : String(r[col[c]] == null ? "" : r[col[c]]).trim(); };

    var R = D.readings, rules = D.rules;
    var sites = {}; D.scopes.all.forEach(function (g) { sites[g.site.toLowerCase()] = g; sites[g.id.toLowerCase()] = g; });
    var params = {}; R.parameters.forEach(function (p) { params[p.toLowerCase()] = p; });
    var fests = {}; R.festivals.forEach(function (f) { fests[f.toLowerCase()] = f; });
    var present = {}; existing(D).forEach(function (r) { present[keyOf(r)] = r; });
    var seen = {};
    out.total = table.length - 1;

    function err(row, code, p) { if (out.errors.length < LIMITS.errors) out.errors.push({ row: row, code: code, p: p || {} }); out.errorCount = (out.errorCount || 0) + 1; }

    for (var i = 1; i < table.length; i++) {
      var r = table[i], rowNo = i + 1, bad = false;
      var yearS = get(r, "year"), year = /^\d{4}$/.test(yearS) ? +yearS : NaN;
      if (!(year >= 2000 && year <= 2100)) { err(rowNo, "year"); bad = true; }
      var fest = fests[get(r, "festival").toLowerCase()];
      if (!fest) { err(rowNo, "festival"); bad = true; }
      var g = sites[get(r, "site").toLowerCase()];
      if (!g) { err(rowNo, "site", { site: get(r, "site") }); bad = true; }
      var phase = get(r, "phase").toLowerCase();
      if (R.phases.indexOf(phase) < 0) { err(rowNo, "phase"); bad = true; }
      var param = params[get(r, "parameter").toLowerCase()];
      if (!param) { err(rowNo, "param", { param: get(r, "parameter") }); bad = true; }
      var pageS = get(r, "source_page"), page = /^\d{1,3}$/.test(pageS) ? +pageS : 0;
      if (page < 1) { err(rowNo, "page"); bad = true; }
      var value = get(r, "value"), flag = get(r, "flag");
      var flagKnown = !flag || rules.flags.bdl.concat(rules.flags.missing).map(function (x) { return x.toLowerCase(); }).indexOf(flag.toLowerCase()) >= 0;
      if (flag) {
        var canon = rules.flags.bdl.concat(rules.flags.missing).filter(function (x) { return x.toLowerCase() === flag.toLowerCase(); })[0];
        if (canon) flag = canon;
      }
      if (!flagKnown) { err(rowNo, "flag"); bad = true; }
      else if (value && flag) { err(rowNo, "both"); bad = true; }
      else if (!value && !flag) { err(rowNo, "novalue"); bad = true; }
      else if (value && !/^-?\d+(\.\d+)?$/.test(value)) { err(rowNo, "value"); bad = true; }
      else if (value && +value < 0) { err(rowNo, "neg"); bad = true; }
      if (bad) continue;
      var rec = { site: g.site, year: year, festival: fest, phase: phase, parameter: param, page: page,
        status: readingStatus(value, flag, rules), row: rowNo };
      rec.value = rec.status === "valid" ? Number(value) : null;
      var k = keyOf(rec);
      if (seen[k]) { err(rowNo, "dup_file", { row: seen[k] }); continue; }
      seen[k] = rowNo;
      rec.out = { year: year, festival: fest, site: g.site, water_body: g.water_body, phase: phase, parameter: param, value: rec.status === "valid" ? value : "",
        unit_assumed: R.units[param] || "", flag: rec.status === "bdl" || rec.status === "missing" ? (flag || "not sampled") : "", value_as_printed: value || flag,
        parameter_as_printed: get(r, "parameter_as_printed") || param, site_as_printed: get(r, "site_as_printed") || g.site,
        site_match_confidence: get(r, "site_match_confidence") || "high", source_page: page };
      if (present[k]) {
        if (opts.duplicates === "replace") { rec.replaces = present[k]; out.rows.push(rec); } else out.skipped.push(rec);
      } else out.rows.push(rec);
    }
    var known = D.dataset.years, newYears = {};
    out.rows.forEach(function (x) { if (known.indexOf(x.year) < 0) newYears[x.year] = 1; });
    out.newYears = Object.keys(newYears).map(Number).sort();
    out.duplicates = out.skipped.length + out.rows.filter(function (x) { return x.replaces; }).length;
    out.counts = { valid: 0, bdl: 0, missing: 0 };
    out.rows.forEach(function (x) { out.counts[x.status] += 1; });
    return out;
  }

  /* ---------- scoring: a port of src/engine.py (BR-20 to BR-24, BR-30, BR-32, BR-34) ---------- */
  function pyRound(x, n) { return Number(x.toFixed(n)); }
  function share(n, d) { return d ? n / d : 0; }

  function scoreGhat(recs, scope, years, rules) {
    var W = rules.weights, L = rules.limits || {}, conf = rules.confidence;
    var fests = scope === "durga" ? ["Durga"] : conf.festivals;
    var sub = recs.filter(function (r) { return scope !== "durga" || r.festival === "Durga"; });
    var idx = {};
    sub.forEach(function (r) { var k = [r.year, r.festival, r.phase, r.parameter].join("|"); if (!idx[k]) idx[k] = r; });
    var valid = function (p) { return sub.filter(function (r) { return r.parameter === p && r.status === "valid"; }); };

    var doV = valid(DO).map(function (r) { return r.value; });
    var w = W.oxygen;
    var oxygen = w.share_below_min * share(doV.filter(function (v) { return v < L.do_min; }).length, doV.length) +
      (doV.some(function (v) { return v < w.any_below_value; }) ? w.any_below : 0) + (doV.some(function (v) { return v === 0; }) ? w.any_zero : 0);

    var bodR = valid(BOD), wo = W.organic;
    var duringHigh = bodR.filter(function (r) { return r.phase === "during" && r.value >= wo.during_high_value; }).length > 0;
    var organic = wo.share_above_max * share(bodR.filter(function (r) { return r.value > L.bod_max; }).length, bodR.length) + (duringHigh ? wo.during_high : 0);

    var phV = valid(PH).map(function (r) { return r.value; });
    var ph = W.ph.share_outside * share(phV.filter(function (v) { return !(L.ph_min <= v && v <= L.ph_max); }).length, phV.length);

    function pairs(later, wt, strict) {
      var tested = 0, worse = 0;
      years.forEach(function (y) {
        fests.forEach(function (f) {
          [DO, BOD].forEach(function (p) {
            var a = idx[[y, f, "pre", p].join("|")], b = idx[[y, f, later, p].join("|")];
            if (!a || !b || a.status !== "valid" || b.status !== "valid") return;
            var change = p === BOD ? b.value - a.value : a.value - b.value;
            tested += 1;
            if (strict ? change > wt.min_change : change >= wt.min_change - 1e-9) worse += 1;
          });
        });
      });
      return wt.share_worse * share(worse, tested);
    }
    var impact = pairs("during", W.impact, false), recovery = pairs("after", W.recovery, true);
    var comps = { oxygen: oxygen, organic: organic, ph: ph, impact: impact, recovery: recovery };
    var total = 0;
    Object.keys(comps).forEach(function (k) { comps[k] = pyRound(comps[k], 2); total += comps[k]; });
    total = pyRound(total, 1);

    var cells = 0, ok = 0;
    years.forEach(function (y) { fests.forEach(function (f) { conf.phases.forEach(function (ph2) { [DO, BOD].forEach(function (p) {
      cells += 1; var r = idx[[y, f, ph2, p].join("|")]; if (r && r.status === "valid") ok += 1;
    }); }); }); });
    var tier = total >= rules.tiers.priority_1 ? 1 : total >= rules.tiers.priority_2 ? 2 : 3;
    var doAll = doV.slice(), bodDur = bodR.filter(function (r) { return r.phase === "during"; }).map(function (r) { return r.value; });
    return { total: total, tier: tier, components: comps, confidence: cells ? ok / cells : 0, count: sub.length,
      minDO: doAll.length ? Math.min.apply(null, doAll) : Infinity, maxDuringBOD: bodDur.length ? Math.max.apply(null, bodDur) : 0 };
  }

  /** Rank every ghat that has readings, like rank_scope(). `recs` = all readings (existing + added). */
  function rank(D, recs, scope) {
    var rules = Object.assign({}, D.rules, { limits: D.limits });
    var yearSet = {}; (rules.confidence.years || []).forEach(function (y) { yearSet[y] = 1; });
    recs.forEach(function (r) { yearSet[r.year] = 1; });
    var years = Object.keys(yearSet).map(Number).sort();
    var by = {}; recs.forEach(function (r) { (by[r.site] = by[r.site] || []).push(r); });
    var scored = [], none = [];
    D.scopes.all.forEach(function (g) {
      var mine = by[g.site] || [];
      if (!g.has_history && !mine.length) { none.push({ id: g.id, site: g.site, has_history: false }); return; }
      var s = scoreGhat(mine, scope, years, rules); s.id = g.id; s.site = g.site; s.has_history = true;
      scored.push(s);
    });
    scored.sort(function (a, b) { return (b.total - a.total) || (a.minDO - b.minDO) || (b.maxDuringBOD - a.maxDuringBOD); });
    scored.forEach(function (s, i) { s.rank = i + 1; });
    return scored.concat(none);
  }

  /** Before and after: official rows come from data.js; "after" is recomputed with the added readings. */
  function preview(D, added, scope) {
    var base = existing(D), replaced = {};
    added.forEach(function (r) { if (r.replaces) replaced[keyOf(r)] = 1; });
    var merged = base.filter(function (r) { return !replaced[keyOf(r)]; }).concat(added.map(function (r) {
      return { site: r.site, year: r.year, festival: r.festival, phase: r.phase, parameter: r.parameter, value: r.value, status: r.status, page: r.page };
    }));
    var after = rank(D, merged, scope), before = {};
    D.scopes[scope].forEach(function (g) { before[g.id] = g; });
    var addedBy = {}; added.forEach(function (r) { var id = D.scopes.all.filter(function (g) { return g.site === r.site; })[0].id; addedBy[id] = (addedBy[id] || 0) + 1; });
    return after.map(function (a) {
      var b = before[a.id] || {};
      return { id: a.id, site: a.site, has_history: a.has_history, rank: a.rank || null, total: a.has_history ? a.total : null, tier: a.has_history ? a.tier : null,
        confidence: a.confidence, before_rank: b.rank || null, before_total: b.has_history ? b.total : null, before_tier: b.has_history ? b.tier : null,
        added: addedBy[a.id] || 0, components: a.components };
    });
  }

  return { parseCSV: parseCSV, toCSV: toCSV, template: template, validate: validate, readingStatus: readingStatus, existing: existing, rank: rank,
    preview: preview, scoreGhat: scoreGhat, COLUMNS: COLUMNS, REQUIRED: REQUIRED, LIMITS: LIMITS };
});
