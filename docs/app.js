/* Ghat Watch UI. Reads window.GHAT_DATA from data.js. No network calls, no external code. */
(function () {
  "use strict";
  var D = window.GHAT_DATA;
  var app = document.getElementById("app");
  var q = new URLSearchParams(location.search);
  var state = {
    lang: q.get("lang") || load("lang", "en"),
    scope: q.get("scope") || load("scope", D.default_scope),
    size: load("size", "m"),
    tips: load("tips", "show")
  };
  if (["en", "hi"].indexOf(state.lang) < 0) state.lang = "en";
  if (!D.scopes[state.scope]) state.scope = D.default_scope;
  if (["s", "m", "l"].indexOf(state.size) < 0) state.size = "m";

  function load(k, d) { try { return localStorage.getItem("gw-" + k) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("gw-" + k, v); } catch (e) { /* file:// may block storage */ } }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fill(tpl, p) { return tpl.replace(/\{(\w+)\}/g, function (_, k) { return p[k] == null ? "" : p[k]; }); }
  function ui(k, p) { var s = D.i18n[state.lang].ui[k]; return p ? fill(s, p) : s; }
  function gl(group, k) { var g = D.glossary[group] && D.glossary[group][k]; return g ? g[state.lang] : k; }
  function name(g) { return state.lang === "hi" ? g.name_hi : g.site; }
  function rows() { return D.scopes[state.scope]; }
  function find(id) { return rows().filter(function (g) { return g.id === id; })[0]; }
  function pct(x) { return Math.round(x * 100) + "%"; }
  function wa(text) { return "https://wa.me/?text=" + encodeURIComponent(text); }
  function tw(table) { return '<div class="tw" tabindex="0">' + table + "</div>"; }

  /* BR-62: event dates come from rules.yaml; the countdown uses this device's clock. */
  function day(iso, plus) {
    var p = iso.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2] + (plus || 0));
  }
  function fmtDate(d) {
    try {
      return new Intl.DateTimeFormat(state.lang === "hi" ? "hi-IN" : "en-IN",
        { day: "numeric", month: "long", year: "numeric" }).format(d);
    } catch (e) { return d.toDateString(); }
  }
  function eventDay() { return day(D.event.date); }
  function afterDay() { return day(D.event.date, D.event.after_days); }
  function daysLeft() {
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((eventDay() - today) / 86400000);
  }
  function countdown() {
    var n = daysLeft();
    if (n > 1) return ui("countdown_days", { n: n });
    if (n === 1) return ui("countdown_one");
    if (n === 0) return ui("countdown_today");
    return ui("countdown_past", { date: fmtDate(eventDay()) });
  }

  function srcLink(r) {
    return '<a class="src" href="' + esc(r.link) + '" target="_blank" rel="noopener" title="' +
      esc(r.report) + '">' + esc(ui("report_page", { page: r.source_page })) + "</a>";
  }

  function badges(g) {
    return g.flags.map(function (f) {
      var label = D.i18n[state.lang].flag[f] || f;
      return '<span class="badge b-' + f + '">' + esc(label) + "</span>";
    }).join(" ");
  }

  function tierBadge(g) {
    if (!g.has_history) return '<span class="tier t-none">' + esc(ui("no_history")) + "</span>";
    return '<span class="tier t' + g.tier + '">' + esc(gl("tier", g.tier)) + "</span>";
  }

  function designated(g) {
    var v = g.designated_2026 === "yes" ? ui("designated_yes") : ui("designated_unknown");
    return esc(ui("designated", { value: v }));
  }

  function ghatCount(n) { return n === 1 ? ui("stat_ghat") : ui("stat_ghats", { n: n }); }

  /* Screen 1: Ranking, with the overview and the three-step guide */
  function overview() {
    var counts = { 1: 0, 2: 0, 3: 0, none: 0 };
    rows().forEach(function (g) { counts[g.has_history ? g.tier : "none"] += 1; });
    var stats = [1, 2, 3].map(function (t) {
      return '<div class="stat"><dt><i class="key t' + t + '"></i>' + esc(gl("tier", t)) + "</dt><dd>" +
        esc(ghatCount(counts[t])) + "</dd></div>";
    });
    var n = daysLeft();
    if (n >= 0) {
      stats.unshift('<div class="stat"><dt>' + esc(ui("stat_days")) + "</dt><dd>" + n + "</dd></div>");
    }
    if (counts.none) {
      stats.push('<div class="stat"><dt><i class="key t-none"></i>' + esc(ui("no_history")) + "</dt><dd>" +
        esc(ghatCount(counts.none)) + "</dd></div>");
    }
    return '<section class="hero reveal"><p class="eyebrow">' + esc(ui("hero_eyebrow", { date: fmtDate(eventDay()) })) + '</p><h1 class="display">' + esc(ui("hero_title")) + '</h1><p class="lede">' +
      esc(ui("hero_lede")) + '</p><dl class="stats">' + stats.join("") + "</dl>" + snapshot() + "</section>";
  }

  /* BR-65: dataset facts, computed by the build from the CSV. */
  function snapshot() {
    var ds = D.dataset, sc = ds.status_counts, y = ds.years;
    return '<p class="snapshot">' + esc(ui("snapshot", { rows: ds.rows.toLocaleString("en-IN"), years: y[0] + "–" + y[y.length - 1],
      ghats: ds.ghats_with_data, nohist: ds.ghats_in_register - ds.ghats_with_data, valid: sc.valid, bdl: sc.bdl, missing: sc.missing })) +
      ' <a href="#/data" class="textlink">' + esc(ui("snapshot_link")) + " →</a> · " +
      '<a href="#/upload" class="textlink">' + esc(ui("nav_upload")) + " →</a></p>";
  }

  function howto() {
    if (state.tips === "hide") return "";
    return '<section class="howto reveal" aria-labelledby="howto-h"><h2 id="howto-h" class="kicker">' +
      esc(ui("howto_title")) + '</h2><ol class="steps">' + [1, 2, 3].map(function (i) {
        return '<li><span class="step-n">' + i + "</span><p>" + esc(ui("howto_" + i)) + "</p></li>";
      }).join("") + '</ol><p class="howto-actions"><a href="#/help" class="textlink">' + esc(ui("howto_more")) +
      ' →</a> <button type="button" class="ghost" id="tips-hide">' + esc(ui("howto_hide")) + "</button></p></section>";
  }

  function renderRanking() {
    var top = D.top_stable[state.scope] ? ui("top_stable") : ui("top_unstable");
    var html = overview() + howto() + '<section class="list-head reveal"><h2 class="screen-title">' +
      esc(ui("ranked_list")) + " · " + esc(ui(state.scope === "all" ? "scope_all" : "scope_durga")) + "</h2>" +
      '<p class="stability">' + esc(top) + "</p></section><ol class=\"ranking\">";
    rows().forEach(function (g, i) {
      var score = g.has_history
        ? '<div class="score"><span class="num">' + esc(g.total) + '</span><span class="of">' + esc(ui("of_100")) +
          '</span><div class="bar t' + g.tier + '"><i style="width:' + g.total + '%"></i></div></div>'
        : '<div class="score none">—</div>';
      var meta = g.has_history
        ? esc(ui("confidence")) + ": " + pct(g.confidence) + " · " + esc(g.stability[state.lang])
        : esc(D.i18n[state.lang].focus.baseline_test);
      html += '<li class="row reveal' + (g.has_history ? "" : " nohist") + '" style="--i:' + i + '">' +
        '<a href="#/ghat/' + esc(g.id) + '" class="rowlink">' +
        '<span class="rank">' + (g.rank || "–") + "</span>" +
        '<div class="body"><div class="line1"><span class="name">' + esc(name(g)) + "</span> " + tierBadge(g) + "</div>" +
        '<p class="reason">' + esc(g.reason[state.lang]) + "</p>" +
        '<p class="meta">' + meta + "</p>" +
        '<p class="meta">' + designated(g) + "</p>" +
        '<div class="badges">' + badges(g) + "</div></div>" + score +
        '<span class="go" aria-hidden="true">→</span></a></li>';
    });
    return html + "</ol>";
  }

  /* Screen 2: Ghat detail */
  function readingTable(c) {
    var unit = c.key === "ph" ? "" : " (" + ui("unit_assumed", { unit: "mg/l" }) + ")";
    var h = '<table class="ev"><thead><tr><th>' + esc(ui("col_year")) + "</th><th>" + esc(ui("col_festival")) +
      "</th><th>" + esc(ui("col_phase")) + "</th><th>" + esc(ui("col_value")) + esc(unit) + "</th><th>" +
      esc(ui("col_limit")) + "</th><th>" + esc(ui("col_result")) + "</th><th>" + esc(ui("col_source")) +
      "</th></tr></thead><tbody>";
    c.evidence.forEach(function (r) {
      var val = r.status === "valid" ? r.value : r.status === "bdl" ? "BDL" : "—";
      h += '<tr class="v-' + r.verdict + '"><td>' + r.year + "</td><td>" + esc(gl("festival", r.festival)) +
        "</td><td>" + esc(gl("phase", r.phase)) + '</td><td class="n">' + esc(val) + "</td><td>" +
        esc(r.limit || "—") + '</td><td><span class="chip c-' + r.verdict + '">' + esc(gl("verdict", r.verdict)) +
        "</span></td><td>" + srcLink(r) + "</td></tr>";
    });
    return tw(h + "</tbody></table>");
  }

  function pairTable(c) {
    var later = c.key === "impact" ? "during" : "after";
    var h = '<table class="ev"><caption>' + esc(ui("pairs")) + " · " + esc(gl("phase", "pre")) + " / " +
      esc(gl("phase", later)) + " (" + esc(ui("unit_assumed", { unit: "mg/l" })) + ")</caption><thead><tr><th>" +
      esc(ui("col_year")) + "</th><th>" + esc(ui("col_festival")) + "</th><th>" + esc(ui("col_parameter")) +
      "</th><th>" + esc(ui("col_pre")) + "</th><th>" + esc(ui("col_later")) + "</th><th>" + esc(ui("col_change")) +
      "</th><th>" + esc(ui("col_worse")) + "</th><th>" + esc(ui("col_source")) + "</th></tr></thead><tbody>";
    c.evidence.forEach(function (p) {
      h += '<tr class="' + (p.worse ? "v-fail" : "") + '"><td>' + p.year + "</td><td>" + esc(gl("festival", p.festival)) +
        "</td><td>" + esc(gl("parameter", p.parameter)) + '</td><td class="n">' + esc(p.pre) + '</td><td class="n">' +
        esc(p[later]) + '</td><td class="n">' + esc(p.change) + "</td><td>" +
        (p.worse ? '<span class="chip c-fail">' + esc(ui("ans_yes")) + "</span>" : esc(ui("ans_no"))) + "</td><td>" +
        srcLink(p) + "</td></tr>";
    });
    h = tw(h + "</tbody></table>");
    if (c.not_testable.length) {
      h += '<p class="nt"><strong>' + esc(ui("not_testable")) + ":</strong> " + c.not_testable.map(function (p) {
        var why = p.reason === "no_table" ? ui("no_table") : gl("verdict", "not_sampled");
        return esc(p.year + " " + gl("festival", p.festival) + " " + gl("parameter", p.parameter) + " (" + why + ")");
      }).join("; ") + "</p>";
    }
    return h;
  }

  function events(cells) {
    var out = [];
    cells.forEach(function (c) {
      var k = c.year + "|" + c.festival;
      if (out.indexOf(k) < 0) out.push(k);
    });
    return out;
  }

  function cellAt(cells, k, ph, pa) {
    var parts = k.split("|");
    return cells.filter(function (x) {
      return String(x.year) === parts[0] && x.festival === parts[1] && x.phase === ph && x.parameter === pa;
    })[0];
  }

  function isFail(c, pa) {
    return c.status === "valid" &&
      (pa === "BOD" ? c.value > parseFloat(D.headline.bod_max) : c.value < parseFloat(D.headline.do_min));
  }

  function coverageGrid(g) {
    var evs = events(g.coverage);
    var phases = ["pre", "during", "after"], params = ["Dissolved oxygen", "BOD"];
    var h = '<table class="grid"><thead><tr><th></th>';
    phases.forEach(function (ph) { h += '<th colspan="2">' + esc(gl("phase", ph)) + "</th>"; });
    h += "</tr><tr><th></th>";
    phases.forEach(function () { h += "<th>DO</th><th>BOD</th>"; });
    h += "</tr></thead><tbody>";
    evs.forEach(function (k) {
      var parts = k.split("|");
      h += "<tr><th>" + parts[0] + " " + esc(gl("festival", parts[1])) + "</th>";
      phases.forEach(function (ph) {
        params.forEach(function (pa) {
          var c = cellAt(g.coverage, k, ph, pa);
          if (c.status === "missing") {
            h += '<td class="cell missing" title="' + esc(c.no_table ? ui("no_table") : gl("verdict", "not_sampled")) +
              '">' + esc(c.no_table ? ui("no_table") : gl("verdict", "not_sampled")) + "</td>";
          } else {
            var v = c.status === "bdl" ? "BDL" : c.value;
            h += '<td class="cell ' + (isFail(c, pa) ? "fail" : "ok") + '">' + esc(v) + "</td>";
          }
        });
      });
      h += "</tr>";
    });
    return tw(h + "</tbody></table>");
  }

  /* Readings chart: one per parameter (one axis each). Missing is a hatched slot, never a point. */
  function niceTop(v) {
    var raw = v / 4, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var step = [1, 2, 2.5, 5, 10].map(function (s) { return s * mag; }).filter(function (s) { return s >= raw; })[0];
    return { top: Math.ceil(v / step) * step, step: step };
  }

  function chartSvg(g, pa, width) {
    var cells = g.coverage.filter(function (c) { return c.parameter === pa; });
    var evs = events(cells), phases = ["pre", "during", "after"], isDO = pa === "Dissolved oxygen";
    var lim = parseFloat(isDO ? D.headline.do_min : D.headline.bod_max);
    var vals = cells.filter(function (c) { return c.status === "valid"; }).map(function (c) { return c.value; });
    var sc = niceTop(Math.max.apply(null, vals.concat([lim])) * 1.08 || 1);
    var W = Math.max(300, Math.round(width)), H = 236, L = 38, R = 12, T = 16, B = 46;
    var pw = W - L - R, ph = H - T - B, gw = pw / evs.length, small = gw < 40;
    var id = "h-" + (isDO ? "do" : "bod");
    function x(ei, pi) { return L + gw * ei + gw * (0.2 + 0.3 * pi); }
    function y(v) { return T + ph * (1 - v / sc.top); }
    var fail = 0, missing = 0, valid = 0, links = "", dots = "";
    var s = '<svg class="chart" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H +
      '" role="img" aria-labelledby="' + id + '-t"><title id="' + id + '-t">';
    var body = '<defs><pattern id="' + id + '" width="6" height="6" patternUnits="userSpaceOnUse" ' +
      'patternTransform="rotate(45)"><rect width="6" height="6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" ' +
      'class="hatch-ln"/></pattern></defs>';
    for (var t = 0; t <= sc.top + 1e-9; t += sc.step) {
      body += '<line class="grid-ln" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' +
        '<text class="tick" x="' + (L - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + +t.toFixed(2) + "</text>";
    }
    evs.forEach(function (k, ei) {
      var parts = k.split("|"), cx = L + gw * ei + gw / 2, prev = null;
      if (ei) body += '<line class="sep" x1="' + (L + gw * ei) + '" x2="' + (L + gw * ei) + '" y1="' + T + '" y2="' + (T + ph) + '"/>';
      body += '<text class="xl" x="' + cx + '" y="' + (H - B + 18) + '" text-anchor="middle">' + parts[0] + "</text>" +
        '<text class="xl2" x="' + cx + '" y="' + (H - B + 33) + '" text-anchor="middle">' +
        esc(small ? gl("festival", parts[1]).slice(0, state.lang === "hi" ? 3 : 1) : gl("festival", parts[1])) + "</text>";
      phases.forEach(function (phs, pi) {
        var c = cellAt(cells, k, phs, pa), px = x(ei, pi);
        var where = parts[0] + " " + gl("festival", parts[1]) + ", " + gl("phase", phs) + ": ";
        if (c.status === "missing") {
          missing += 1;
          body += '<g class="pt"><title>' + esc(where + (c.no_table ? ui("no_table") : gl("verdict", "not_sampled"))) +
            '</title><rect x="' + (px - 6) + '" y="' + T + '" width="12" height="' + ph + '" fill="url(#' + id + ')"/></g>';
          prev = null;
          return;
        }
        var v = c.status === "bdl" ? 0 : c.value, py = y(v), f = isFail(c, pa);
        if (c.status === "valid") valid += 1;
        if (f) fail += 1;
        if (prev && c.status === "valid") {
          links += '<line class="link" x1="' + prev[0] + '" y1="' + prev[1] + '" x2="' + px + '" y2="' + py + '"/>';
        }
        prev = c.status === "valid" ? [px, py] : null;
        var label = where + (c.status === "bdl" ? "BDL" : c.value + " mg/l") + " · " +
          ui("report_page", { page: c.source_page });
        dots += '<g class="pt" tabindex="0"><title>' + esc(label) + '</title><circle class="hit" cx="' + px + '" cy="' + py +
          '" r="12"/><circle class="dot ' + (c.status === "bdl" ? "d-bdl" : f ? "d-fail" : "d-pass") + '" cx="' + px +
          '" cy="' + py + '" r="5"/></g>';
      });
    });
    body += '<line class="limit" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(lim) + '" y2="' + y(lim) + '"/>' + links + dots;
    var summary = ui("chart_summary", { param: gl("parameter", pa), expected: cells.length, valid: valid,
      missing: missing, fail: fail });
    return s + esc(summary) + "</title>" + body + "</svg>";
  }

  function charts() {
    var legend = '<ul class="legend"><li><i class="lk d-fail"></i>' + esc(ui("legend_fail")) + '</li><li><i class="lk d-pass"></i>' +
      esc(ui("legend_pass")) + '</li><li><i class="lk d-bdl"></i>' + esc(ui("legend_bdl")) +
      '</li><li><i class="lk hatch"></i>' + esc(ui("legend_missing")) + '</li><li><i class="lk lim"></i>' +
      esc(ui("legend_limit")) + "</li></ul>";
    var order = ["pre", "during", "after"].map(function (p) { return gl("phase", p); }).join(" → ");
    return '<section class="charts reveal"><h2>' + esc(ui("chart_title")) + "</h2>" + legend +
      '<p class="note">' + esc(order) + "</p>" +
      '<figure class="fig"><figcaption>' + esc(ui("chart_do", { lim: D.headline.do_min })) +
      '</figcaption><div class="chart-slot" data-param="Dissolved oxygen"></div></figure>' +
      '<figure class="fig"><figcaption>' + esc(ui("chart_bod", { lim: D.headline.bod_max })) +
      '</figcaption><div class="chart-slot" data-param="BOD"></div></figure></section>';
  }

  function drawCharts() {
    var m = (location.hash || "").match(/^#\/ghat\/([\w-]+)/), g = m && find(m[1]);
    if (!g) return;
    document.querySelectorAll(".chart-slot").forEach(function (el) {
      el.innerHTML = chartSvg(g, el.dataset.param, el.clientWidth || 640);
    });
  }

  function metalsTable(g) {
    if (!g.metals.length) return "";
    var spikes = g.spikes.map(function (s) {
      var how = s.kind === "ratio" ? s.pre + " → " + s.during + " (×" + s.ratio + ")" : "BDL → " + s.during;
      return "<li>" + esc(s.year + " " + gl("festival", s.festival) + " · " + gl("parameter", s.parameter) + ": " + how) +
        " " + srcLink(s) + "</li>";
    }).join("");
    var h = "<h3>" + esc(ui("metals")) + "</h3><p class=\"note\">" + esc(ui("metals_note")) + "</p>";
    if (spikes) h += '<ul class="spikes">' + spikes + "</ul>";
    h += '<details><summary>' + esc(ui("readings")) + '</summary><div class="tw" tabindex="0"><table class="ev"><thead><tr><th>' +
      esc(ui("col_year")) + "</th><th>" + esc(ui("col_festival")) + "</th><th>" + esc(ui("col_phase")) + "</th><th>" +
      esc(ui("col_parameter")) + "</th><th>" + esc(ui("col_value")) + " (" + esc(ui("unit_assumed", { unit: "mg/l" })) +
      ")</th><th>" + esc(ui("col_result")) + "</th><th>" + esc(ui("col_source")) + "</th></tr></thead><tbody>";
    g.metals.forEach(function (r) {
      var val = r.status === "valid" ? r.value : r.status === "bdl" ? "BDL" : "—";
      h += "<tr><td>" + r.year + "</td><td>" + esc(gl("festival", r.festival)) + "</td><td>" + esc(gl("phase", r.phase)) +
        "</td><td>" + esc(gl("parameter", r.parameter)) + '</td><td class="n">' + esc(val) +
        (r.reporting_limit ? ' <span class="badge b-reporting_limit">' + esc(ui("reporting_limit")) + "</span>" : "") +
        '</td><td><span class="chip c-' + r.verdict + '">' + esc(gl("verdict", r.verdict)) + "</span></td><td>" +
        srcLink(r) + "</td></tr>";
    });
    return h + "</tbody></table></div></details>";
  }

  function renderDetail(id) {
    var g = find(id);
    if (!g) return renderRanking();
    var h = '<p class="reveal"><a href="#/" class="back">← ' + esc(ui("back")) + "</a></p>" +
      '<header class="detail-head reveal"><p class="eyebrow">' + esc(gl("water_body", g.water_body)) +
      (g.rank ? " · #" + g.rank : "") + '</p><h1 class="display sm">' + esc(name(g)) + "</h1>" +
      '<div class="line1">' + tierBadge(g) + " " + badges(g) + "</div>" +
      '<p class="meta">' + designated(g) + "</p>" + (g.has_history ? '<p class="detail-actions"><a class="button sm" href="#/ask" data-ask="' +
      esc(g.id) + '">' + esc(ui("nav_ask")) + '</a> <a class="ghost sm" href="#/analytics" data-compare="' + esc(g.id) + '">' +
      esc(ui("col_compare")) + "</a></p>" : "") + '<p class="note kinds">' + kind("fact") + kind("calc") + kind("rec") + " " +
      esc(ui("kind_note")) + "</p></header>";
    if (g.flags.indexOf("scope_shift") >= 0) {
      h += '<p class="note">' + esc(ui("scope_shift", {
        n: Math.abs(g.rank - g.other_scope_rank),
        other: ui(state.scope === "all" ? "scope_durga" : "scope_all") + ": #" + g.other_scope_rank
      })) + "</p>";
    }
    h += '<p class="reason big reveal">' + esc(g.reason[state.lang]) + "</p>";
    if (g.has_history) {
      h += '<dl class="stats compact reveal"><div class="stat"><dt>' + esc(ui("score")) + "</dt><dd>" + g.total +
        ' <small>' + esc(ui("of_100")) + '</small></dd></div><div class="stat"><dt>' + esc(ui("confidence")) +
        "</dt><dd>" + pct(g.confidence) + '</dd></div><div class="stat"><dt>' + esc(ui("stat_range")) + "</dt><dd>" +
        (g.rank_range.min === g.rank_range.max ? g.rank_range.min : g.rank_range.min + "–" + g.rank_range.max) +
        " <small>" + esc(ui("stat_range_runs", { runs: D.stability_runs })) + "</small></dd></div></dl>";
    }
    h += '<section class="focus-box reveal"><h2>' + kind("rec") + esc(ui("focus")) + '</h2><ul class="focus">' + g.focus.map(function (f) {
      return "<li>" + esc(D.i18n[state.lang].focus[f]) + "</li>";
    }).join("") + '</ul><p><a href="#/plan" class="textlink">' + esc(ui("nav_plan")) + " →</a></p></section>";
    if (!g.has_history) return h;
    h += charts();
    h += '<section class="reveal"><h2>' + kind("calc") + esc(ui("components")) + "</h2>";
    g.components.forEach(function (c) {
      h += '<section class="comp"><div class="comphead"><h3>' + esc(gl("component", c.key)) + '</h3><span class="pts">' +
        c.points.toFixed(1) + " / " + c.max + '</span></div><div class="bar"><i style="width:' +
        (100 * c.points / c.max) + '%"></i></div><details' + (c.points > 0 ? " open" : "") + "><summary>" +
        esc(ui("readings")) + "</summary>" + (c.key === "impact" || c.key === "recovery" ? pairTable(c) : readingTable(c)) +
        "</details></section>";
    });
    h += '</section><section class="reveal"><h2>' + esc(ui("coverage")) + "</h2>" + coverageGrid(g) + metalsTable(g) +
      "</section>";
    return h;
  }

  /* Screen 3: Action plan (BR-61). Ticks live in this browser only. */
  function ticks() { try { return JSON.parse(load("plan", "{}")) || {}; } catch (e) { return {}; } }
  function tickKey(g, a) { return state.scope + "|" + g.id + "|" + a; }
  function siteKey(phase, i) { return state.scope + "|site|" + phase + "|" + i; }
  function checkbox(k, t, text) {
    return '<li><label><input type="checkbox" data-key="' + esc(k) + '"' + (t[k] ? " checked" : "") + "> <span>" +
      esc(text) + "</span></label></li>";
  }

  function planGroups() {
    return ["before", "during", "after"].map(function (k) {
      var items = rows().map(function (g) {
        return { g: g, actions: g.focus.filter(function (f) { return D.plan[k].indexOf(f) >= 0; }) };
      }).filter(function (x) { return x.actions.length; });
      var date = fmtDate(k === "after" ? afterDay() : eventDay());
      return { key: k, title: ui("plan_" + k, { date: date }), items: items };
    });
  }

  function planText() {
    var lines = ["*" + ui("plan_text_title", { date: fmtDate(eventDay()) }) + "*",
      ui("view") + ": " + ui(state.scope === "all" ? "scope_all" : "scope_durga")];
    planGroups().forEach(function (grp) {
      lines.push("", "*" + grp.title + "*");
      var site = D.i18n[state.lang].site;
      lines.push("- " + site.title + " (" + site.tag + "): " + site[grp.key].join("; "));
      grp.items.forEach(function (x) {
        var tier = x.g.has_history ? gl("tier", x.g.tier) : ui("no_history");
        lines.push("- " + name(x.g) + " (" + tier + "): " + x.actions.map(function (a) {
          return D.i18n[state.lang].focus[a];
        }).join("; "));
      });
    });
    lines.push("", D.i18n[state.lang].site.note);
    return lines.join("\n");
  }

  function planCounts() {
    var t = ticks(), done = 0, total = 0;
    planGroups().forEach(function (grp) {
      grp.items.forEach(function (x) {
        x.actions.forEach(function (a) { total += 1; if (t[tickKey(x.g, a)]) done += 1; });
      });
      D.i18n[state.lang].site[grp.key].forEach(function (_, i) { total += 1; if (t[siteKey(grp.key, i)]) done += 1; });
    });
    return { done: done, total: total };
  }

  /* BR-61: each suggested action with why (from the scoring engine's facts), a suggested role and what to verify. */
  function whyText(g, a) {
    var A = D.i18n[state.lang].actions, c = {};
    (g.components || []).forEach(function (x) { c[x.key] = x; });
    var comp = { do_check: "oxygen", cleaning: "organic", test_during: "impact", retest_after: "recovery" }[a];
    var p = { do_min: D.headline.do_min, bod_max: D.headline.bod_max };
    if (comp && c[comp]) {
      Object.keys(c[comp].facts).forEach(function (k) { p[k] = c[comp].facts[k]; });
      p.points = c[comp].points.toFixed(1); p.max = c[comp].max;
    }
    if (a === "metals") {
      p.spikes = g.spikes.map(function (s) {
        return gl("parameter", s.parameter) + " " + s.year + " " + gl("festival", s.festival) + " " + s.pre + " → " + s.during;
      }).join("; ");
    }
    if (a === "fill_gap") p.missing = g.coverage.filter(function (x) { return x.status === "missing"; }).length;
    return fill(A[a + "_why"], p);
  }
  function details(why, role, verify) {
    var A = D.i18n[state.lang].actions;
    return '<details class="why"><summary>' + esc(A.why) + " · " + esc(A.role) + " · " + esc(A.verify) + "</summary><dl>" +
      "<dt>" + esc(A.why) + "</dt><dd>" + esc(why) + "</dd><dt>" + esc(A.role) + "</dt><dd>" + esc(role) +
      "</dd><dt>" + esc(A.verify) + "</dt><dd>" + esc(verify) + "</dd></dl></details>";
  }
  function actionItem(g, a, t) {
    var A = D.i18n[state.lang].actions;
    return checkbox(tickKey(g, a), t, D.i18n[state.lang].focus[a]).replace("</li>", "") +
      details(whyText(g, a), A[a + "_role"], A[a + "_verify"]) + "</li>";
  }
  function kind(k) { return '<span class="kind k-' + k + '">' + esc(ui("kind_" + k)) + "</span>"; }

  function renderPlan() {
    var t = ticks(), c = planCounts(), A = D.i18n[state.lang].actions;
    var h = '<header class="page-head reveal"><p class="eyebrow">' + esc(countdown()) + '</p><h1 class="display sm">' +
      esc(ui("plan_title")) + '</h1><p class="lede">' + esc(ui("plan_lede")) + "</p></header>" +
      '<div class="actions reveal"><button type="button" id="copy">' + esc(ui("copy")) + "</button> " +
      '<a class="button" id="wa" target="_blank" rel="noopener" href="' + esc(wa(planText())) + '">' +
      esc(ui("whatsapp")) + "</a> " + '<button type="button" id="print">' + esc(ui("print")) + "</button> " +
      '<button type="button" class="ghost" id="plan-reset">' + esc(ui("plan_reset")) + "</button>" +
      '<p class="progress" id="plan-progress" aria-live="polite">' + esc(ui("plan_progress", c)) + "</p></div>" +
      '<div class="guidance reveal"><p>' + kind("rec") + esc(A.guidance) + "</p><p>" + esc(A.tick_note) + "</p></div>" +
      '<div class="plan">';
    planGroups().forEach(function (grp, gi) {
      h += '<section class="phase reveal" style="--i:' + gi + '"><h2><span class="phase-n">' + (gi + 1) + "</span>" +
        esc(grp.title) + "</h2>";
      if (!grp.items.length) h += '<p class="note">' + esc(ui("plan_none")) + "</p>";
      grp.items.forEach(function (x) {
        h += '<div class="task"><p class="task-ghat"><a href="#/ghat/' + esc(x.g.id) + '">' + esc(name(x.g)) + "</a> " +
          tierBadge(x.g) + '</p><ul class="checks">' + x.actions.map(function (a) {
            return actionItem(x.g, a, t);
          }).join("") + "</ul></div>";
      });
      var site = D.i18n[state.lang].site;
      h += '<div class="task site"><p class="task-ghat">' + esc(site.title) + ' <span class="badge">' + esc(site.tag) +
        '</span></p><ul class="checks">' + site[grp.key].map(function (text, i) {
          return checkbox(siteKey(grp.key, i), t, text);
        }).join("") + "</ul>" + details(A.site_why, A.site_role, A.site_verify) + "</div></section>";
    });
    return h + '</div><p class="note plan-note">' + esc(D.i18n[state.lang].site.note) + "</p>";
  }

  function wirePlan() {
    var list = document.querySelectorAll(".checks input[data-key]");
    if (!list.length) return;
    list.forEach(function (box) {
      box.addEventListener("change", function () {
        var t = ticks();
        if (box.checked) t[box.dataset.key] = 1; else delete t[box.dataset.key];
        save("plan", JSON.stringify(t));
        document.getElementById("plan-progress").textContent = ui("plan_progress", planCounts());
      });
    });
    document.getElementById("plan-reset").onclick = function () {
      var t = ticks();
      Object.keys(t).forEach(function (k) { if (k.indexOf(state.scope + "|") === 0) delete t[k]; });
      save("plan", JSON.stringify(t));
      route();
    };
  }

  /* Screen 4: Brief */
  function renderBrief() {
    var b = D.briefs[state.scope][state.lang];
    var h = '<div class="actions brief-actions reveal"><button type="button" id="copy">' + esc(ui("copy")) + "</button> " +
      '<a class="button" id="wa" target="_blank" rel="noopener" href="' + esc(wa(b.text)) + '">' + esc(ui("whatsapp")) +
      "</a> " + '<button type="button" id="print">' + esc(ui("print")) + "</button></div>" +
      '<article class="brief reveal" lang="' + state.lang + '">';
    var inList = false;
    b.blocks.forEach(function (x) {
      var li = x.type === "li" || x.type === "box" || x.type === "src";
      if (li && !inList) { h += x.type === "box" ? '<ul class="honesty">' : "<ul>"; inList = true; }
      if (!li && inList) { h += "</ul>"; inList = false; }
      if (x.type === "h1") h += "<h1>" + esc(x.text) + "</h1>";
      else if (x.type === "h2") h += "<h2>" + esc(x.text) + "</h2>";
      else if (x.type === "h3") h += "<h3>" + esc(x.text) + "</h3>";
      else if (x.type === "box_h") h += '<h2 class="honesty-h">' + esc(x.text) + "</h2>";
      else if (x.type === "src") h += '<li><a href="' + esc(x.text) + '" target="_blank" rel="noopener">' + esc(x.text) + "</a></li>";
      else if (li) h += "<li>" + esc(x.text) + "</li>";
      else h += "<p>" + esc(x.text) + "</p>";
    });
    if (inList) h += "</ul>";
    return h + "</article>";
  }

  function wireCopy(text) {
    var copy = document.getElementById("copy");
    if (!copy) return;
    copy.onclick = function () {
      var done = function () { copy.textContent = ui("copied"); setTimeout(function () { copy.textContent = ui("copy"); }, 1500); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    };
    document.getElementById("print").onclick = function () { window.print(); };
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* nothing else to try offline */ }
    document.body.removeChild(ta);
  }

  /* Screen 5: How to use (BR-63). Numbers in the text come from rules.yaml and the data. */
  function helpParams() {
    var maxes = {};
    rows().filter(function (g) { return g.has_history; }).slice(0, 1).forEach(function (g) {
      g.components.forEach(function (c) { maxes[c.key] = c.max; });
    });
    var p = { p1: D.tiers.priority_1, p2: D.tiers.priority_2, runs: D.stability_runs,
      limited: pct(D.limited_below), event: fmtDate(eventDay()) };
    Object.keys(D.headline).forEach(function (k) { p[k] = D.headline[k]; });
    Object.keys(maxes).forEach(function (k) { p[k] = maxes[k]; });
    return p;
  }

  function renderHelp() {
    var H = D.i18n[state.lang].help, p = helpParams();
    var h = '<header class="page-head reveal"><p class="eyebrow">' + esc(ui("nav_help")) + '</p><h1 class="display sm">' +
      esc(H.title) + '</h1><p class="lede">' + esc(fill(H.lede, p)) + '</p></header><nav class="toc reveal" aria-label="' +
      esc(H.title) + '">' + H.sections.map(function (s) {
        return '<button type="button" class="chipbtn" data-target="help-' + s.id + '">' + esc(s.h) + "</button>";
      }).join("") + "</nav>";
    H.sections.forEach(function (s, i) {
      h += '<section class="help-sec reveal" id="help-' + s.id + '" style="--i:' + i + '"><h2>' + esc(s.h) + "</h2>" +
        (s.p ? "<p>" + esc(fill(s.p, p)) + "</p>" : "") + '<dl class="' + (s.id === "steps" ? "steps-dl" : "terms") + '">' +
        s.items.map(function (it) {
          return "<div><dt>" + esc(fill(it.t, p)) + "</dt><dd>" + esc(fill(it.d, p)) + "</dd></div>";
        }).join("") + "</dl></section>";
    });
    return h;
  }

  function wireHelp() {
    document.querySelectorAll(".toc [data-target]").forEach(function (b) {
      b.addEventListener("click", function () {
        var el = document.getElementById(b.dataset.target);
        if (el) { el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
      });
    });
  }

  /* Page chrome: utility bar, header, view bar, notice, footer */
  function footer() {
    var links = [["#/", "nav_overview"], ["#/analytics", "nav_analytics"], ["#/ask", "nav_ask"], ["#/plan", "nav_plan"],
      ["#/brief", "nav_brief"], ["#/upload", "nav_upload"], ["#/data", "nav_data"], ["#/help", "nav_help"]];
    var reports = Object.keys(D.reports).sort().map(function (y) {
      return '<li><a href="' + esc(D.reports[y]) + '" target="_blank" rel="noopener">' + esc(ui("report_year", { year: y })) + "</a></li>";
    }).join("") + '<li><a href="' + esc(D.criteria_url) + '" target="_blank" rel="noopener">' + esc(ui("cpcb_criteria")) + "</a></li>";
    var waves = '<svg class="foot-waves" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M0 14c50 0 50-10 100-10s50 10 100 10 50-10 100-10 50 10 100 10 50-10 100-10 50 10 100 10 50-10 100-10 50 10 100 10 50-10 100-10 50 10 100 10 50-10 100-10 50 10 100 10"/>' +
      '<path d="M0 30c50 0 50-10 100-10s50 10 100 10 50-10 100-10 50 10 100 10 50-10 100-10 50 10 100 10 50-10 100-10 50 10 100 10 50-10 100-10 50 10 100 10 50-10 100-10 50 10 100 10"/></svg>';
    return waves + '<div class="wrap foot-inner"><div class="foot-brand"><p class="foot-mark">' + esc(ui("title")) + "</p><p>" +
      esc(ui("footer_about_text")) + '</p></div><nav class="foot-col" aria-label="' + esc(ui("footer_screens")) + '"><h2>' +
      esc(ui("footer_screens")) + "</h2><ul>" + links.map(function (l) {
        return '<li><a href="' + l[0] + '">' + esc(ui(l[1])) + "</a></li>";
      }).join("") + '</ul></nav><div class="foot-col"><h2>' + esc(ui("footer_sources")) + "</h2><ul>" + reports +
      '</ul></div><div class="foot-col"><h2>' + esc(ui("footer_about")) + "</h2><p>" + esc(ui("footer")) +
      '</p><p><a href="' + esc(D.repo_url) + '" target="_blank" rel="noopener">' + esc(ui("footer_code")) + "</a></p></div></div>" +
      '<div class="wrap foot-base"><span>' + esc(ui("footer_offered")) + "</span><span>" + esc(ui("updated", { date: D.generated })) +
      "</span></div>";
  }

  function chrome() {
    var root = document.documentElement;
    root.lang = state.lang;
    root.dataset.size = state.size;
    document.body.classList.toggle("hi", state.lang === "hi");
    document.title = ui("title") + " · " + ui("subtitle");
    document.getElementById("skip").textContent = ui("skip");
    document.getElementById("t-title").textContent = ui("title");
    document.getElementById("t-subtitle").textContent = ui("subtitle");
    document.getElementById("countdown").textContent = countdown();
    NAV.forEach(function (k) {
      document.querySelector("#nav-" + k + " .nav-label").textContent = ui(k === "ranking" ? "nav_overview" : "nav_" + k);
    });
    document.getElementById("hist").textContent = ui("hist_badge");
    GW.hooks.forEach(function (f) { f(); });
    document.getElementById("view-label").textContent = ui("view");
    document.getElementById("scope-all").textContent = ui("scope_all");
    document.getElementById("scope-durga").textContent = ui("scope_durga");
    document.getElementById("lang-toggle").textContent = ui("lang");
    document.getElementById("lang-toggle").setAttribute("lang", state.lang === "en" ? "hi" : "en");
    document.getElementById("size-label").textContent = ui("text_size");
    [["s", "size_down"], ["m", "size_reset"], ["l", "size_up"]].forEach(function (x) {
      var b = document.querySelector('[data-size="' + x[0] + '"]');
      b.setAttribute("aria-label", ui(x[1]));
      b.setAttribute("title", ui(x[1]));
      b.setAttribute("aria-pressed", state.size === x[0]);
    });
    document.getElementById("headline").textContent = ui("headline", D.headline);
    document.getElementById("coliform").textContent = ui("coliform");
    document.getElementById("footer").innerHTML = footer();
    ["all", "durga"].forEach(function (s) {
      var b = document.getElementById("scope-" + s);
      b.classList.toggle("on", state.scope === s);
      b.setAttribute("aria-pressed", state.scope === s);
    });
  }

  function route() {
    chrome();
    var h = location.hash || "#/";
    var m = h.match(/^#\/ghat\/([\w-]+)/);
    var ext = (h.match(/^#\/(\w+)/) || [])[1];
    var screen = m ? "detail" : h.indexOf("#/brief") === 0 ? "brief" : h.indexOf("#/plan") === 0 ? "plan" :
      h.indexOf("#/help") === 0 ? "help" : GW.screens[ext] ? ext : "ranking";
    document.body.dataset.screen = screen;
    NAV.forEach(function (k) {
      var on = screen === k || (k === "ranking" && screen === "detail");
      var a = document.getElementById("nav-" + k);
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    app.innerHTML = m ? renderDetail(m[1]) : screen === "brief" ? renderBrief() : screen === "plan" ? renderPlan() :
      screen === "help" ? renderHelp() : GW.screens[screen] ? GW.screens[screen].render() : renderRanking();
    if (GW.screens[screen] && GW.screens[screen].wire) GW.screens[screen].wire();
    document.querySelectorAll("[data-ask]").forEach(function (a) {
      a.addEventListener("click", function () { GW.state.selected = [a.dataset.ask]; });
    });
    document.querySelectorAll("[data-compare]").forEach(function (a) {
      a.addEventListener("click", function () { if (GW.state.selected.indexOf(a.dataset.compare) < 0) GW.state.selected.push(a.dataset.compare); });
    });
    if (screen === "brief") wireCopy(D.briefs[state.scope][state.lang].text);
    if (screen === "plan") { wireCopy(planText()); wirePlan(); }
    if (screen === "help") wireHelp();
    if (screen === "detail") drawCharts();
    var hide = document.getElementById("tips-hide");
    if (hide) hide.onclick = function () { state.tips = "hide"; save("tips", "hide"); route(); };
  }

  /* Shared with analytics.js and assistant.js, which register extra screens in GW.screens. */
  var NAV = ["ranking", "analytics", "ask", "plan", "brief", "upload", "data", "help"];
  var GW = window.GW = {
    D: D, state: state, ui: ui, gl: gl, esc: esc, fill: fill, name: name, rows: rows, find: find, pct: pct, tw: tw,
    srcLink: srcLink, tierBadge: tierBadge, badges: badges, kind: kind, save: save, load: load, route: route, wa: wa,
    wireCopy: wireCopy, fmtDate: fmtDate, screens: {}, hooks: []
  };
  state.selected = [];

  document.querySelectorAll("[data-scope]").forEach(function (b) {
    b.addEventListener("click", function () { state.scope = b.dataset.scope; save("scope", state.scope); route(); });
  });
  document.querySelectorAll("[data-size]").forEach(function (b) {
    b.addEventListener("click", function () { state.size = b.dataset.size; save("size", state.size); chrome(); drawCharts(); });
  });
  document.getElementById("skip").addEventListener("click", function (e) {
    e.preventDefault();  // "#app" would otherwise go through the hash router
    app.focus();
    app.scrollIntoView();
  });
  document.getElementById("lang-toggle").addEventListener("click", function () {
    state.lang = state.lang === "en" ? "hi" : "en"; save("lang", state.lang); route();
  });
  window.addEventListener("hashchange", function () {
    route();
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  });
  var lastW = window.innerWidth, timer;
  window.addEventListener("resize", function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; drawCharts(); GW.hooks.forEach(function (f) { f("resize"); }); }
    }, 150);
  });
  // analytics.js and assistant.js load after this file and register their screens before the first render
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", route); else setTimeout(route, 0);

  /* Installable and offline when served over http(s), e.g. GitHub Pages. Skipped when opened from disk. */
  if (/^https?:$/.test(location.protocol) && "serviceWorker" in navigator) {
    var link = document.createElement("link");
    link.rel = "manifest"; link.href = "manifest.webmanifest";
    document.head.appendChild(link);
    navigator.serviceWorker.register("sw.js").catch(function () { /* the app works without it */ });
  }
})();
