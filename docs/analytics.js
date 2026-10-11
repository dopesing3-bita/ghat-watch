/* Ghat Watch analytics (BR-65, BR-82): filters, ranking table, readings charts, comparison, Data & method page.
   Reads only window.GHAT_DATA. Scores, tiers and ranks always come from the scoring engine (data.js). No network. */
(function () {
  "use strict";
  var GW = window.GW, D = GW.D, C = window.GW_CORE, R = D.readings;
  var esc = GW.esc, ui = function (k, p) { return GW.ui(k, p); }, gl = function (g, k) { return GW.gl(g, k); };
  var DO = "Dissolved oxygen", BOD = "BOD", PH = "pH";
  var FACTOR_COLORS = { oxygen: "#0A8AA3", organic: "#D9822B", ph: "#6E5CC4", impact: "#B39B10", recovery: "#C2457A" }; // validated, see README
  var S = GW.state;
  S.filters = S.filters || { ghat: "", year: "", festival: "", phase: "", param: DO, priority: "" };
  S.sort = S.sort || { key: "rank", dir: 1 };
  S.search = S.search || "";

  function lang() { return S.lang; }
  function scopeRows() { return GW.rows(); }
  function ghatById(id) { return GW.find(id); }
  function hasLimit(p) { return p === DO || p === BOD || p === PH; }
  function unit(p) { return R.units[p] ? " (" + ui("unit_assumed", { unit: R.units[p] }) + ")" : ""; }
  function paramName(p) { return gl("parameter", p); }
  function fmtV(v) { return String(Math.round(v * 1000) / 1000); }

  function verdict(p, v) {
    if (p === DO) return v < D.limits.do_min ? "fail" : "pass";
    if (p === BOD) return v > D.limits.bod_max ? "fail" : "pass";
    if (p === PH) return v < D.limits.ph_min || v > D.limits.ph_max ? "fail" : "pass";
    return "no_limit";
  }
  function limitText(p) {
    if (p === DO) return "≥ " + D.limits.do_min; if (p === BOD) return "≤ " + D.limits.bod_max;
    if (p === PH) return D.limits.ph_min + "–" + D.limits.ph_max; return "";
  }

  /* ---------- filters ---------- */
  function festivals() { return S.scope === "durga" ? ["Durga"] : R.festivals; }
  function visibleGhats() {
    var f = S.filters;
    return scopeRows().filter(function (g) {
      if (f.ghat && g.id !== f.ghat) return false;
      if (f.priority === "none") return !g.has_history;
      if (f.priority && String(g.tier) !== f.priority) return false;
      return true;
    });
  }
  function filteredIdx(withParam) {
    var f = S.filters, ids = visibleGhats().map(function (g) { return g.id; });
    return C.filterRows(D, { ghats: ids.length ? ids : ["-"], params: withParam ? [f.param] : [], years: f.year ? [+f.year] : [],
      festivals: f.festival ? [f.festival] : festivals(), phases: f.phase ? [f.phase] : [] });
  }
  function events() {
    var out = [];
    D.dataset.years.forEach(function (y) {
      if (S.filters.year && +S.filters.year !== y) return;
      festivals().forEach(function (fe) { if (!S.filters.festival || S.filters.festival === fe) out.push([y, fe]); });
    });
    return out;
  }
  function phases() { return S.filters.phase ? [S.filters.phase] : R.phases; }
  function cell(id, y, fe, ph, p) {
    var i = C.indexOf(D, id, y, fe, ph, p);
    return i < 0 ? { i: -1, status: "no_table" } : { i: i, status: R.rows[i][6], v: R.rows[i][5], page: R.rows[i][7] };
  }
  function srcHref(y, page) { return D.reports[String(y)] + "#page=" + page; }

  function select(id, label, options, value) {
    return '<label class="fld"><span>' + esc(label) + '</span><select id="' + id + '">' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(value) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>";
    }).join("") + "</select></label>";
  }
  function filterBar() {
    var f = S.filters, all = ui("f_all");
    return '<form class="filters reveal" id="filters" onsubmit="return false">' +
      select("f-ghat", ui("f_ghat"), [["", all]].concat(scopeRows().map(function (g) { return [g.id, GW.name(g)]; })), f.ghat) +
      select("f-year", ui("f_year"), [["", all]].concat(D.dataset.years.map(function (y) { return [y, y]; })), f.year) +
      select("f-festival", ui("f_fest"), [["", all]].concat(festivals().map(function (x) { return [x, gl("festival", x)]; })), f.festival) +
      select("f-phase", ui("f_phase"), [["", all]].concat(R.phases.map(function (x) { return [x, gl("phase", x)]; })), f.phase) +
      select("f-param", ui("f_param"), R.parameters.map(function (x) { return [x, paramName(x)]; }), f.param) +
      select("f-priority", ui("f_priority"), [["", all], ["1", gl("tier", 1)], ["2", gl("tier", 2)], ["3", gl("tier", 3)], ["none", ui("no_history")]], f.priority) +
      '<button type="button" class="ghost sm" id="f-reset">' + esc(ui("f_reset")) + "</button></form>" +
      '<p class="note filtered" aria-live="polite">' + esc(ui("filtered_note", { n: filteredIdx(true).length.toLocaleString("en-IN"),
        total: D.dataset.rows.toLocaleString("en-IN") })) + "</p>";
  }

  /* ---------- ranking table ---------- */
  function tableRows() {
    var q = S.search.trim().toLowerCase();
    var list = visibleGhats().filter(function (g) {
      return !q || (g.site + " " + g.name_hi).toLowerCase().indexOf(q) >= 0;
    });
    var k = S.sort.key, d = S.sort.dir;
    var val = function (g) {
      if (k === "name") return GW.name(g);
      if (k === "coverage") return g.confidence;
      if (k === "range") return g.rank_range ? g.rank_range.max - g.rank_range.min : 99;
      if (k === "score") return g.has_history ? g.total : -1;
      return g.rank || 99;
    };
    return list.slice().sort(function (a, b) { var x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * d * (k === "score" || k === "coverage" ? -1 : 1); });
  }
  function th(key, label) {
    var on = S.sort.key === key;
    return '<th scope="col" aria-sort="' + (on ? (S.sort.dir > 0 ? "ascending" : "descending") : "none") + '"><button type="button" class="sortbtn" data-sort="' +
      key + '" title="' + esc(ui("sort_by", { col: label })) + '">' + esc(label) + (on ? (S.sort.dir > 0 ? " ↑" : " ↓") : "") + "</button></th>";
  }
  function rankingTable() {
    var rows = tableRows();
    var h = '<section class="reveal"><h2>' + GW.kind("calc") + esc(ui("sec_table")) + '</h2><div class="tablebar"><label class="fld grow"><span>' +
      esc(ui("search")) + '</span><input type="search" id="t-search" value="' + esc(S.search) + '" autocomplete="off"></label>' +
      '<p class="note">' + esc(ui("compare_hint")) + "</p></div>";
    h += GW.tw('<table class="ev rank-table"><thead><tr><th scope="col">' + esc(ui("col_compare")) + "</th>" + th("rank", ui("col_rank")) +
      th("name", ui("col_ghat")) + th("score", ui("col_score")) + '<th scope="col">' + esc(ui("col_tier")) + "</th>" +
      '<th scope="col">' + esc(ui("col_reason")) + "</th>" + th("coverage", ui("col_coverage")) + th("range", ui("col_range")) +
      '<th scope="col">' + esc(ui("col_flags")) + "</th></tr></thead><tbody>" + rows.map(function (g) {
        var sel = S.selected.indexOf(g.id) >= 0;
        return "<tr" + (sel ? ' class="sel"' : "") + '><td><input type="checkbox" data-pick="' + esc(g.id) + '"' + (sel ? " checked" : "") +
          (g.has_history ? "" : " disabled") + ' aria-label="' + esc(ui("col_compare") + " " + GW.name(g)) + '"></td><td class="n">' + (g.rank || "–") +
          '</td><td><a href="#/ghat/' + esc(g.id) + '">' + esc(GW.name(g)) + '</a></td><td class="n">' + (g.has_history ? g.total : "—") +
          "</td><td>" + GW.tierBadge(g) + '</td><td class="wrap">' + esc(g.reason[lang()]) + '</td><td class="n">' + GW.pct(g.confidence) +
          '</td><td class="n">' + (g.rank_range ? g.rank_range.min + (g.rank_range.max !== g.rank_range.min ? "–" + g.rank_range.max : "") : "—") +
          '</td><td class="wrap">' + GW.badges(g) + "</td></tr>";
      }).join("") + "</tbody></table>");
    h += '<p class="pickbar"><span id="pick-count">' + S.selected.length + "</span> · " +
      '<a class="button sm" href="#/ask" id="ask-sel">' + esc(ui("ask_selected")) + '</a> <a class="ghost sm" href="#cmp" id="go-cmp">' +
      esc(ui("sec_compare")) + "</a></p></section>";
    return h;
  }

  /* ---------- readings matrix ---------- */
  function matrix() {
    var p = S.filters.param, ev = events(), ph = phases(), gs = visibleGhats().filter(function (g) { return g.has_history; });
    if (!gs.length || !ev.length) return '<section class="reveal"><h2>' + esc(ui("sec_matrix")) + '</h2><p class="note">' + esc(ui("no_rows")) + "</p></section>";
    var h = '<table class="grid matrix"><caption>' + esc(paramName(p) + unit(p)) + (hasLimit(p) ? " · " + esc(ui("col_limit")) + " " + esc(limitText(p)) : "") +
      '</caption><thead><tr><th scope="col"></th>' + ev.map(function (e) { return '<th scope="colgroup" colspan="' + ph.length + '">' + e[0] + " " + esc(gl("festival", e[1])) + "</th>"; }).join("") +
      '</tr><tr><th scope="col">' + esc(ui("col_ghat")) + "</th>" + ev.map(function () {
        return ph.map(function (x) { return '<th scope="col" title="' + esc(gl("phase", x)) + '">' + esc(gl("phase", x).split(" ")[0]) + "</th>"; }).join("");
      }).join("") + "</tr></thead><tbody>";
    gs.forEach(function (g) {
      h += '<tr><th scope="row"><a href="#/ghat/' + esc(g.id) + '">' + esc(GW.name(g)) + "</a></th>";
      ev.forEach(function (e) {
        ph.forEach(function (x) {
          var c = cell(g.id, e[0], e[1], x, p), where = e[0] + " " + gl("festival", e[1]) + ", " + gl("phase", x);
          if (c.status === "no_table" || c.status === "missing") {
            var why = c.status === "no_table" ? ui("no_table") : gl("verdict", "not_sampled");
            h += '<td class="cell missing" title="' + esc(where + ": " + why) + '">' + esc(c.status === "no_table" ? "—" : "n/s") + "</td>";
          } else if (c.status === "bdl") {
            h += '<td class="cell bdl" title="' + esc(where + ": BDL") + '"><a href="' + esc(srcHref(e[0], c.page)) + '" target="_blank" rel="noopener">BDL</a></td>';
          } else {
            var vd = verdict(p, c.v);
            h += '<td class="cell ' + (vd === "fail" ? "fail" : vd === "pass" ? "ok" : "nolimit") + '" title="' + esc(where + ": " + fmtV(c.v) + " · " +
              ui("report_page", { page: c.page })) + '"><a href="' + esc(srcHref(e[0], c.page)) + '" target="_blank" rel="noopener">' + fmtV(c.v) + "</a></td>";
          }
        });
      });
      h += "</tr>";
    });
    return '<section class="reveal"><h2>' + GW.kind("fact") + esc(ui("sec_matrix")) + '</h2><p class="note">' + esc(ui("matrix_note")) +
      (hasLimit(p) ? "" : " " + esc(ui("nolimit_note", { param: paramName(p) }))) + "</p>" + GW.tw(h + "</tbody></table>") + "</section>";
  }

  /* ---------- before vs during (dumbbell) ---------- */
  function changeChart(width) {
    var p = S.filters.param, pairs = [], missing = 0;
    visibleGhats().filter(function (g) { return g.has_history; }).forEach(function (g) {
      events().forEach(function (e) {
        var a = cell(g.id, e[0], e[1], "pre", p), b = cell(g.id, e[0], e[1], "during", p);
        if (a.status === "no_table" && b.status === "no_table") return;
        if (a.status !== "valid" || b.status !== "valid") { missing += 1; return; }
        var worse = p === DO ? a.v - b.v >= 1 : p === BOD ? b.v - a.v >= 1 : null;
        pairs.push({ g: g, e: e, a: a, b: b, worse: worse });
      });
    });
    var note = '<p class="note">' + esc(ui("change_note")) + " " + esc(ui("not_comparable", { n: missing })) + "</p>";
    if (!pairs.length) return note + '<p class="note">' + esc(ui("no_rows")) + "</p>";
    var W = Math.max(320, width), L = Math.min(230, W * 0.42), Rr = 16, row = 24, T = 26, H = T + pairs.length * row + 8;
    var vals = []; pairs.forEach(function (x) { vals.push(x.a.v, x.b.v); });
    var lim = p === DO ? D.limits.do_min : p === BOD ? D.limits.bod_max : null;
    var lo = Math.min.apply(null, vals.concat(lim == null ? [] : [lim])), hi = Math.max.apply(null, vals.concat(lim == null ? [] : [lim]));
    if (p === DO || p === BOD || lo > 0) lo = Math.min(0, lo);
    if (hi === lo) hi = lo + 1;
    var x = function (v) { return L + (W - L - Rr) * (v - lo) / (hi - lo); };
    var s = '<svg class="chart dumbbell" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' +
      esc(ui("sec_change") + ": " + paramName(p)) + '">';
    [lo, (lo + hi) / 2, hi].forEach(function (t) {
      s += '<line class="grid-ln" x1="' + x(t) + '" x2="' + x(t) + '" y1="' + (T - 6) + '" y2="' + (H - 4) + '"/><text class="tick" x="' + x(t) +
        '" y="' + (T - 10) + '" text-anchor="middle">' + fmtV(t) + "</text>";
    });
    if (lim != null) s += '<line class="limit" x1="' + x(lim) + '" x2="' + x(lim) + '" y1="' + (T - 6) + '" y2="' + (H - 4) + '"/>';
    pairs.forEach(function (d, i) {
      var y = T + i * row + row / 2, lbl = GW.name(d.g) + " · " + d.e[0] + " " + gl("festival", d.e[1]);
      var tip = lbl + ": " + fmtV(d.a.v) + " → " + fmtV(d.b.v) + (d.worse === true ? " (" + ui("worse_label") + ")" : "");
      s += '<g class="pt" tabindex="0"><title>' + esc(tip) + '</title><text class="xl2" x="' + (L - 10) + '" y="' + (y + 4) + '" text-anchor="end">' +
        esc(lbl.length > 34 ? lbl.slice(0, 33) + "…" : lbl) + '</text><line class="link" x1="' + x(d.a.v) + '" x2="' + x(d.b.v) + '" y1="' + y + '" y2="' + y +
        '"/><circle class="dot d-bdl" cx="' + x(d.a.v) + '" cy="' + y + '" r="5"/><circle class="dot ' + (d.worse ? "d-fail" : "d-pass") + '" cx="' +
        x(d.b.v) + '" cy="' + y + '" r="5"/></g>';
    });
    return note + s + "</svg>";
  }

  /* ---------- small multiples: every reading per ghat ---------- */
  function mini(g, p, width) {
    var ev = events(), ph = phases(), W = Math.max(260, width), H = 150, L = 34, Rr = 8, T = 10, B = 30;
    var vals = [];
    ev.forEach(function (e) { ph.forEach(function (x) { var c = cell(g.id, e[0], e[1], x, p); if (c.status === "valid") vals.push(c.v); }); });
    var lim = p === DO ? D.limits.do_min : p === BOD ? D.limits.bod_max : null;
    var hi = Math.max.apply(null, vals.concat(lim == null ? [0] : [lim])) * 1.1 || 1;
    var pw = W - L - Rr, phh = H - T - B, gw = pw / Math.max(1, ev.length);
    var X = function (ei, pi) { return L + gw * ei + gw * ((pi + 0.5) / ph.length); }, Y = function (v) { return T + phh * (1 - v / hi); };
    var s = '<svg class="chart" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(GW.name(g) + ", " + paramName(p)) + '">' +
      '<defs><pattern id="hm-' + g.id + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="hatch-ln"/></pattern></defs>' +
      '<line class="grid-ln" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/><text class="tick" x="' + (L - 5) + '" y="' + (Y(0) + 4) + '" text-anchor="end">0</text>' +
      '<text class="tick" x="' + (L - 5) + '" y="' + (Y(hi) + 8) + '" text-anchor="end">' + fmtV(Math.round(hi * 10) / 10) + "</text>";
    if (lim != null) s += '<line class="limit" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(lim) + '" y2="' + Y(lim) + '"/>';
    var links = "", dots = "";
    ev.forEach(function (e, ei) {
      if (ei) s += '<line class="sep" x1="' + (L + gw * ei) + '" x2="' + (L + gw * ei) + '" y1="' + T + '" y2="' + (T + phh) + '"/>';
      s += '<text class="xl2" x="' + (L + gw * ei + gw / 2) + '" y="' + (H - 16) + '" text-anchor="middle">' + String(e[0]).slice(2) + " " +
        esc(gl("festival", e[1]).slice(0, lang() === "hi" ? 3 : 1)) + "</text>";
      var prev = null;
      ph.forEach(function (x, pi) {
        var c = cell(g.id, e[0], e[1], x, p), cx = X(ei, pi), where = e[0] + " " + gl("festival", e[1]) + ", " + gl("phase", x) + ": ";
        if (c.status === "valid") {
          var cy = Y(c.v), vd = verdict(p, c.v);
          if (prev) links += '<line class="link" x1="' + prev[0] + '" y1="' + prev[1] + '" x2="' + cx + '" y2="' + cy + '"/>';
          prev = [cx, cy];
          dots += '<g class="pt" tabindex="0"><title>' + esc(where + fmtV(c.v) + " · " + ui("report_page", { page: c.page })) + '</title><circle class="hit" cx="' + cx +
            '" cy="' + cy + '" r="10"/><circle class="dot ' + (vd === "fail" ? "d-fail" : "d-pass") + '" cx="' + cx + '" cy="' + cy + '" r="4"/></g>';
        } else {
          prev = null;
          if (c.status === "bdl") dots += '<g class="pt"><title>' + esc(where + "BDL") + '</title><circle class="dot d-bdl" cx="' + cx + '" cy="' + Y(0) + '" r="4"/></g>';
          else s += '<g class="pt"><title>' + esc(where + (c.status === "no_table" ? ui("no_table") : gl("verdict", "not_sampled"))) + '</title><rect x="' + (cx - 4) +
            '" y="' + T + '" width="8" height="' + phh + '" fill="url(#hm-' + g.id + ')"/></g>';
        }
      });
    });
    return s + links + dots + "</svg>";
  }

  /* ---------- coverage and factor bars ---------- */
  function coverage() {
    var counts = {};
    filteredIdx(true).forEach(function (i) { var r = R.rows[i], id = R.ghat_ids[r[0]]; counts[id] = counts[id] || { valid: 0, bdl: 0, missing: 0 }; counts[id][r[6]] += 1; });
    var gs = visibleGhats().filter(function (g) { return counts[g.id]; });
    var max = Math.max.apply(null, gs.map(function (g) { var c = counts[g.id]; return c.valid + c.bdl + c.missing; }).concat([1]));
    return '<ul class="legend"><li><i class="lk sw-valid"></i>' + esc(ui("lbl_valid")) + '</li><li><i class="lk sw-bdl"></i>' + esc(ui("lbl_bdl")) +
      '</li><li><i class="lk hatch"></i>' + esc(ui("lbl_missing")) + "</li></ul>" + '<div class="hbars">' + gs.map(function (g) {
        var c = counts[g.id], tot = c.valid + c.bdl + c.missing;
        var seg = function (k, cls) { return c[k] ? '<i class="' + cls + '" style="width:' + (100 * c[k] / max) + '%" title="' + esc(ui("lbl_" + k) + ": " + c[k]) + '"></i>' : ""; };
        return '<div class="hbar"><span class="hb-l">' + esc(GW.name(g)) + '</span><span class="hb-t">' + seg("valid", "sw-valid") + seg("bdl", "sw-bdl") +
          seg("missing", "hatch") + '</span><span class="hb-v">' + c.valid + " / " + c.bdl + " / " + c.missing + " (" + tot + ")</span></div>";
      }).join("") + "</div>";
  }
  function factors() {
    var gs = visibleGhats().filter(function (g) { return g.has_history; }), keys = Object.keys(D.component_max);
    return '<ul class="legend">' + keys.map(function (k) { return '<li><i class="lk" style="background:' + FACTOR_COLORS[k] + '"></i>' + esc(gl("component", k)) + " (" + D.component_max[k] + ")</li>"; }).join("") +
      '</ul><div class="hbars">' + gs.map(function (g) {
        return '<div class="hbar"><span class="hb-l">' + esc(GW.name(g)) + '</span><span class="hb-t stack">' + g.components.map(function (c) {
          return c.points > 0 ? '<i style="width:' + c.points + "%;background:" + FACTOR_COLORS[c.key] + '" title="' + esc(gl("component", c.key) + ": " + c.points.toFixed(1) + " / " + c.max) + '"></i>' : "";
        }).join("") + '</span><span class="hb-v">' + g.total + " / 100</span></div>";
      }).join("") + "</div>";
  }

  /* ---------- comparison (BR-82) ---------- */
  function comparison() {
    var ids = S.selected.filter(function (id) { var g = ghatById(id); return g && g.has_history; }).slice(0, 4);
    var h = '<section class="reveal" id="cmp"><h2>' + GW.kind("fact") + esc(ui("sec_compare")) + '</h2><p class="note">' + esc(ui("cmp_lede")) + "</p>";
    if (ids.length < 2) return h + '<p class="empty">' + esc(ui("cmp_none")) + " " + esc(ui("compare_hint")) + "</p></section>";
    var p = S.filters.param, ph = S.filters.phase || "during", cmp = C.compare(D, S.scope, ids, p, ph);
    var t = '<table class="ev"><caption>' + esc(paramName(p) + unit(p) + " · " + gl("phase", ph)) + '</caption><thead><tr><th scope="col">' + esc(ui("col_event")) + "</th>" +
      ids.map(function (id) { return '<th scope="col">' + esc(GW.name(ghatById(id))) + "</th>"; }).join("") + "</tr></thead><tbody>";
    cmp.events.forEach(function (e) {
      if (S.filters.year && +S.filters.year !== e.year) return;
      t += "<tr" + (e.fair ? "" : ' class="unfair"') + "><th scope=\"row\">" + e.year + " " + esc(gl("festival", e.festival)) + (e.fair ? "" : " ⚠") + "</th>" + e.cells.map(function (c) {
        if (c.status === "valid") { var r = C.readingRecord(D, +c.id.slice(1)); return '<td class="n ' + (r.verdict === "fail" ? "fail" : "") + '"><a href="' + esc(r.link) + '" target="_blank" rel="noopener">' + fmtV(c.value) + "</a></td>"; }
        return '<td class="cell missing">' + esc(c.status === "bdl" ? "BDL" : c.status === "no_table" ? ui("no_table") : gl("verdict", "not_sampled")) + "</td>";
      }).join("") + "</tr>";
    });
    h += '<p class="' + (cmp.fair < cmp.events.length ? "warnline" : "note") + '">' + esc(ui("cmp_fair", { n: cmp.fair, m: cmp.events.length })) +
      (cmp.fair < cmp.events.length ? " " + esc(ui("cmp_flag")) : "") + "</p>" + GW.tw(t + "</tbody></table>") +
      '<p><a class="button sm" href="#/ask" id="ask-cmp">' + esc(ui("ask_selected")) + "</a></p></section>";
    return h;
  }

  function renderAnalytics() {
    var p = S.filters.param;
    return '<header class="page-head reveal"><p class="eyebrow">' + esc(ui("nav_analytics")) + '</p><h1 class="display sm">' + esc(ui("analytics_title")) +
      '</h1><p class="lede">' + esc(ui("analytics_lede")) + '</p><p class="note kinds">' + GW.kind("fact") + GW.kind("calc") + GW.kind("rec") + " " + esc(ui("kind_note")) + "</p></header>" +
      filterBar() + rankingTable() + matrix() +
      '<section class="reveal"><h2>' + GW.kind("fact") + esc(ui("sec_change")) + " · " + esc(paramName(p)) + '</h2><div class="slot" data-slot="change"></div></section>' +
      '<section class="reveal"><h2>' + GW.kind("fact") + esc(ui("sec_trend")) + '</h2><p class="note">' + esc(ui("trend_note", { param: paramName(p) + unit(p) })) +
      (hasLimit(p) ? " " + esc(ui("col_limit")) + " " + esc(limitText(p)) + "." : " " + esc(ui("nolimit_note", { param: paramName(p) }))) + '</p><div class="minis" data-slot="minis"></div></section>' +
      '<section class="reveal"><h2>' + GW.kind("fact") + esc(ui("sec_cover")) + '</h2><p class="note">' + esc(ui("cover_note")) + "</p>" + coverage() + "</section>" +
      '<section class="reveal"><h2>' + GW.kind("calc") + esc(ui("sec_factors")) + '</h2><p class="note">' + esc(ui("factors_note")) + "</p>" + factors() + "</section>" +
      comparison();
  }

  function draw() {
    if (document.body.dataset.screen !== "analytics") return;
    var c = document.querySelector('[data-slot="change"]');
    if (c) c.innerHTML = changeChart(c.clientWidth || 640);
    var m = document.querySelector('[data-slot="minis"]');
    if (m) {
      var gs = visibleGhats().filter(function (g) { return g.has_history; });
      var w = m.clientWidth >= 760 ? (m.clientWidth - 24) / 2 : m.clientWidth;
      m.innerHTML = gs.map(function (g) { return '<figure class="mini"><figcaption><a href="#/ghat/' + esc(g.id) + '">' + esc(GW.name(g)) + "</a> " + GW.tierBadge(g) + "</figcaption>" + mini(g, S.filters.param, w - 2) + "</figure>"; }).join("");
    }
  }

  function wireAnalytics() {
    var map = { "f-ghat": "ghat", "f-year": "year", "f-festival": "festival", "f-phase": "phase", "f-param": "param", "f-priority": "priority" };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", function () { S.filters[map[id]] = el.value; rerender(id); });
    });
    var reset = document.getElementById("f-reset");
    if (reset) reset.onclick = function () { S.filters = { ghat: "", year: "", festival: "", phase: "", param: DO, priority: "" }; rerender("f-reset"); };
    var search = document.getElementById("t-search");
    if (search) search.addEventListener("input", function () { S.search = search.value; rerender("t-search"); });
    document.querySelectorAll("[data-sort]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.sort = { key: b.dataset.sort, dir: S.sort.key === b.dataset.sort ? -S.sort.dir : 1 };
        rerender(null, '[data-sort="' + b.dataset.sort + '"]');
      });
    });
    document.querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("change", function () {
        var id = b.dataset.pick, i = S.selected.indexOf(id);
        if (b.checked && i < 0) S.selected.push(id); if (!b.checked && i >= 0) S.selected.splice(i, 1);
        if (S.selected.length > 4) S.selected.shift();
        rerender(null, '[data-pick="' + id + '"]');
      });
    });
    var go = document.getElementById("go-cmp");
    if (go) go.onclick = function (e) { e.preventDefault(); var t = document.getElementById("cmp"); if (t) t.scrollIntoView(); };
    draw();
  }

  /* Re-render in place and keep keyboard focus where it was. */
  function rerender(focusId, focusSel) {
    var y = window.scrollY, pos = null, active = document.activeElement;
    if (active && active.id === "t-search") pos = active.selectionStart;
    document.getElementById("app").innerHTML = renderAnalytics();
    wireAnalytics();
    window.scrollTo(0, y);
    var el = focusId ? document.getElementById(focusId) : focusSel ? document.querySelector(focusSel) : null;
    if (el) { el.focus({ preventScroll: true }); if (pos != null && el.setSelectionRange) el.setSelectionRange(pos, pos); }
    document.querySelectorAll("#app .reveal").forEach(function (n) { n.classList.remove("reveal"); });
  }

  /* ---------- Data & method (transparency) ---------- */
  function renderData() {
    var P = D.i18n[lang()].datapage, ds = D.dataset, y = ds.years, cm = D.component_max;
    var p = { file: ds.file, rows: ds.rows.toLocaleString("en-IN"), years: y[0] + "–" + y[y.length - 1], ghats_with_data: ds.ghats_with_data,
      nohist: ds.ghats_in_register - ds.ghats_with_data, valid: ds.status_counts.valid, bdl: ds.status_counts.bdl, missing: ds.status_counts.missing,
      units: R.parameters.map(function (x) { return paramName(x) + (R.units[x] ? " " + R.units[x] : ""); }).join(", "),
      do_min: D.limits.do_min, bod_max: D.limits.bod_max, ph_min: D.limits.ph_min, ph_max: D.limits.ph_max,
      oxygen: cm.oxygen, organic: cm.organic, ph: cm.ph, impact: cm.impact, recovery: cm.recovery,
      p1: D.tiers.priority_1, p2: D.tiers.priority_2, runs: D.stability_runs };
    var h = '<header class="page-head reveal"><p class="eyebrow">' + esc(ui("nav_data")) + '</p><h1 class="display sm">' + esc(P.title) + '</h1><p class="lede">' +
      esc(P.lede) + "</p></header>";
    P.sections.forEach(function (s, i) {
      h += '<section class="help-sec reveal" style="--i:' + i + '"><h2>' + esc(s.h) + "</h2><div>" + s.p.map(function (x) { return "<p>" + esc(GW.fill(x, p)) + "</p>"; }).join("") + "</div></section>";
    });
    var issues = D.reporting_limits.map(function (r) {
      return GW.fill(P.issue_rl, { param: paramName(r.parameter), year: r.year, festival: gl("festival", r.festival), value: r.value, count: r.count });
    });
    D.scopes.all.filter(function (g) { return g.flags.indexOf("identity_uncertain") >= 0; }).forEach(function (g) { issues.push(GW.fill(P.issue_identity, { name: GW.name(g) })); });
    var noTable = {};
    D.scopes.all.forEach(function (g) { g.coverage.forEach(function (c) { if (c.no_table) { var k = c.year + "|" + c.festival; noTable[k] = noTable[k] || []; if (noTable[k].indexOf(g) < 0) noTable[k].push(g); } }); });
    Object.keys(noTable).sort().forEach(function (k) {
      var parts = k.split("|");
      issues.push(GW.fill(P.issue_notable, { names: noTable[k].map(GW.name).join("; "), year: parts[0], festival: gl("festival", parts[1]) }));
    });
    h += '<section class="help-sec reveal"><h2>' + esc(P.issues) + '</h2><div><ul class="issues">' + issues.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") +
      '</ul><p><a class="textlink" href="VERIFICATION.md" target="_blank" rel="noopener">docs/VERIFICATION.md</a> · <a class="textlink" href="BUSINESS_RULES.md" target="_blank" rel="noopener">docs/BUSINESS_RULES.md</a></p></div></section>';
    return h;
  }

  GW.screens.analytics = { render: renderAnalytics, wire: wireAnalytics };
  GW.screens.data = { render: renderData };
  GW.hooks.push(function (why) { if (why === "resize") draw(); });
  GW.analytics = { comparison: C.compare };
})();
