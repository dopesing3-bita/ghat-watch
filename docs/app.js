/* Ghat Watch UI. Reads window.GHAT_DATA from data.js. No network calls, no external code. */
(function () {
  "use strict";
  var D = window.GHAT_DATA;
  var app = document.getElementById("app");
  var q = new URLSearchParams(location.search);
  var state = { lang: q.get("lang") || load("lang", "en"), scope: q.get("scope") || load("scope", D.default_scope) };
  if (["en", "hi"].indexOf(state.lang) < 0) state.lang = "en";
  if (!D.scopes[state.scope]) state.scope = D.default_scope;

  function load(k, d) { try { return localStorage.getItem("gw-" + k) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("gw-" + k, v); } catch (e) { /* file:// may block storage */ } }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fill(tpl, p) { return tpl.replace(/\{(\w+)\}/g, function (_, k) { return p[k] == null ? "" : p[k]; }); }
  function ui(k, p) { var s = D.i18n[state.lang].ui[k]; return p ? fill(s, p) : s; }
  function gl(group, k) { var g = D.glossary[group][k]; return g ? g[state.lang] : k; }
  function name(g) { return state.lang === "hi" ? g.name_hi : g.site; }
  function rows() { return D.scopes[state.scope]; }
  function find(id) { return rows().filter(function (g) { return g.id === id; })[0]; }
  function pct(x) { return Math.round(x * 100) + "%"; }

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

  /* Screen 1: Ranking */
  function renderRanking() {
    var top = D.top_stable[state.scope] ? ui("top_stable") : ui("top_unstable");
    var html = '<h1 class="screen-title">' + esc(ui("nav_ranking")) + " · " +
      esc(ui(state.scope === "all" ? "scope_all" : "scope_durga")) + "</h1>" +
      '<p class="stability">' + esc(top) + "</p><ol class=\"ranking\">";
    rows().forEach(function (g) {
      var score = g.has_history
        ? '<div class="score"><span class="num">' + esc(g.total) + '</span><span class="of">' + esc(ui("of_100")) +
          '</span><div class="bar"><i style="width:' + g.total + '%"></i></div></div>'
        : '<div class="score none">—</div>';
      var meta = g.has_history
        ? esc(ui("confidence")) + ": " + pct(g.confidence) + " · " + esc(g.stability[state.lang])
        : esc(D.i18n[state.lang].focus.baseline_test);
      html += '<li class="row' + (g.has_history ? "" : " nohist") + '">' +
        '<a href="#/ghat/' + esc(g.id) + '" class="rowlink">' +
        '<span class="rank">' + (g.rank || "–") + "</span>" +
        '<div class="body"><div class="line1"><span class="name">' + esc(name(g)) + "</span> " + tierBadge(g) + "</div>" +
        '<p class="reason">' + esc(g.reason[state.lang]) + "</p>" +
        '<p class="meta">' + meta + "</p>" +
        '<p class="meta">' + designated(g) + "</p>" +
        '<div class="badges">' + badges(g) + "</div></div>" + score + "</a></li>";
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
    return h + "</tbody></table>";
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
    h += "</tbody></table>";
    if (c.not_testable.length) {
      h += '<p class="nt"><strong>' + esc(ui("not_testable")) + ":</strong> " + c.not_testable.map(function (p) {
        var why = p.reason === "no_table" ? ui("no_table") : gl("verdict", "not_sampled");
        return esc(p.year + " " + gl("festival", p.festival) + " " + gl("parameter", p.parameter) + " (" + why + ")");
      }).join("; ") + "</p>";
    }
    return h;
  }

  function coverageGrid(g) {
    var events = [];
    g.coverage.forEach(function (c) {
      var k = c.year + "|" + c.festival;
      if (events.indexOf(k) < 0) events.push(k);
    });
    var phases = ["pre", "during", "after"], params = ["Dissolved oxygen", "BOD"];
    var h = '<table class="grid"><thead><tr><th></th>';
    phases.forEach(function (ph) { h += '<th colspan="2">' + esc(gl("phase", ph)) + "</th>"; });
    h += "</tr><tr><th></th>";
    phases.forEach(function () { h += "<th>DO</th><th>BOD</th>"; });
    h += "</tr></thead><tbody>";
    events.forEach(function (k) {
      var parts = k.split("|");
      h += "<tr><th>" + parts[0] + " " + esc(gl("festival", parts[1])) + "</th>";
      phases.forEach(function (ph) {
        params.forEach(function (pa) {
          var c = g.coverage.filter(function (x) {
            return String(x.year) === parts[0] && x.festival === parts[1] && x.phase === ph && x.parameter === pa;
          })[0];
          if (c.status === "missing") {
            h += '<td class="cell missing" title="' + esc(c.no_table ? ui("no_table") : gl("verdict", "not_sampled")) +
              '">' + esc(c.no_table ? ui("no_table") : gl("verdict", "not_sampled")) + "</td>";
          } else {
            var v = c.status === "bdl" ? "BDL" : c.value;
            var fail = c.status === "valid" && (pa === "BOD" ? c.value > parseFloat(D.headline.bod_max) : c.value < parseFloat(D.headline.do_min));
            h += '<td class="cell ' + (fail ? "fail" : "ok") + '">' + esc(v) + "</td>";
          }
        });
      });
      h += "</tr>";
    });
    return h + "</tbody></table>";
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
    h += '<details><summary>' + esc(ui("readings")) + '</summary><table class="ev"><thead><tr><th>' +
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
    return h + "</tbody></table></details>";
  }

  function renderDetail(id) {
    var g = find(id);
    if (!g) return renderRanking();
    var h = '<p><a href="#/" class="back">← ' + esc(ui("back")) + "</a></p>" +
      '<h1 class="screen-title">' + esc(name(g)) + " " + tierBadge(g) + "</h1>" +
      '<p class="meta">' + esc(g.water_body) + " · " + designated(g) + "</p>" +
      '<div class="badges">' + badges(g) + "</div>";
    if (g.flags.indexOf("scope_shift") >= 0) {
      h += '<p class="note">' + esc(ui("scope_shift", {
        n: Math.abs(g.rank - g.other_scope_rank),
        other: ui(state.scope === "all" ? "scope_durga" : "scope_all") + ": #" + g.other_scope_rank
      })) + "</p>";
    }
    h += '<p class="reason big">' + esc(g.reason[state.lang]) + "</p>";
    h += "<h2>" + esc(ui("focus")) + '</h2><ul class="focus">' + g.focus.map(function (f) {
      return "<li>" + esc(D.i18n[state.lang].focus[f]) + "</li>";
    }).join("") + "</ul>";
    if (!g.has_history) return h;
    h += '<p class="meta">' + esc(ui("score")) + ": <strong>" + g.total + "</strong> " + esc(ui("of_100")) + " · " +
      esc(ui("confidence")) + ": " + pct(g.confidence) + " · " + esc(g.stability[state.lang]) + "</p>";
    h += "<h2>" + esc(ui("components")) + "</h2>";
    g.components.forEach(function (c) {
      h += '<section class="comp"><div class="comphead"><h3>' + esc(gl("component", c.key)) + '</h3><span class="pts">' +
        c.points.toFixed(1) + " / " + c.max + '</span></div><div class="bar"><i style="width:' +
        (100 * c.points / c.max) + '%"></i></div><details' + (c.points > 0 ? " open" : "") + "><summary>" +
        esc(ui("readings")) + "</summary>" + (c.key === "impact" || c.key === "recovery" ? pairTable(c) : readingTable(c)) +
        "</details></section>";
    });
    h += "<h2>" + esc(ui("coverage")) + "</h2>" + coverageGrid(g) + metalsTable(g);
    return h;
  }

  /* Screen 3: Brief */
  function renderBrief() {
    var b = D.briefs[state.scope][state.lang];
    var h = '<div class="brief-actions"><button type="button" id="copy">' + esc(ui("copy")) + "</button> " +
      '<a class="button" id="wa" target="_blank" rel="noopener" href="https://wa.me/?text=' +
      encodeURIComponent(b.text) + '">' + esc(ui("whatsapp")) + "</a> " +
      '<button type="button" id="print">' + esc(ui("print")) + "</button></div>" +
      '<article class="brief" lang="' + state.lang + '">';
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

  function wireBrief() {
    var b = D.briefs[state.scope][state.lang];
    var copy = document.getElementById("copy");
    if (!copy) return;
    copy.onclick = function () {
      var done = function () { copy.textContent = ui("copied"); setTimeout(function () { copy.textContent = ui("copy"); }, 1500); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(b.text).then(done, function () { fallbackCopy(b.text); done(); });
      } else { fallbackCopy(b.text); done(); }
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

  function chrome() {
    document.documentElement.lang = state.lang;
    document.body.classList.toggle("hi", state.lang === "hi");
    document.getElementById("t-title").textContent = ui("title");
    document.getElementById("t-subtitle").textContent = ui("subtitle");
    document.getElementById("nav-ranking").textContent = ui("nav_ranking");
    document.getElementById("nav-brief").textContent = ui("nav_brief");
    document.getElementById("scope-all").textContent = ui("scope_all");
    document.getElementById("scope-durga").textContent = ui("scope_durga");
    document.getElementById("lang-toggle").textContent = ui("lang");
    document.getElementById("headline").textContent = ui("headline", D.headline);
    document.getElementById("coliform").textContent = ui("coliform");
    document.getElementById("footer").textContent = ui("footer") + " · " + D.generated;
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
    document.body.dataset.screen = m ? "detail" : h.indexOf("#/brief") === 0 ? "brief" : "ranking";
    document.getElementById("nav-ranking").classList.toggle("on", document.body.dataset.screen === "ranking");
    document.getElementById("nav-brief").classList.toggle("on", document.body.dataset.screen === "brief");
    app.innerHTML = m ? renderDetail(m[1]) : document.body.dataset.screen === "brief" ? renderBrief() : renderRanking();
    wireBrief();
  }

  document.querySelectorAll("[data-scope]").forEach(function (b) {
    b.addEventListener("click", function () { state.scope = b.dataset.scope; save("scope", state.scope); route(); });
  });
  document.getElementById("lang-toggle").addEventListener("click", function () {
    state.lang = state.lang === "en" ? "hi" : "en"; save("lang", state.lang); route();
  });
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); });
  route();
})();
