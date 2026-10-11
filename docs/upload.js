/* Ghat Watch "Add data" screen (BR-90 to BR-93). The chosen file is read with FileReader in this browser only:
   nothing is uploaded, stored, cached or passed to the AI assistant. */
(function () {
  "use strict";
  var GW = window.GW, D = GW.D, U = window.GW_UPLOAD, S = GW.state, esc = GW.esc;
  var ui = function (k, p) { return GW.ui(k, p); };
  var st = { name: "", text: "", dup: "keep", big: false };     // in memory only; lost on reload by design

  function msg(e) {
    var key = "up_e_" + e.code, p = e.p || {};
    return GW.fill(ui(key), p);
  }
  function download(name, text) {
    var blob = new Blob([text], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function reportHTML(res) {
    var h = '<section class="reveal"><h2>' + esc(ui("up_report_h")) + "</h2>";
    if (res.fatal) return h + '<div class="msg err" role="alert"><p>' + esc(msg(res.fatal)) + "</p></div></section>";
    h += "<p>" + esc(ui("up_file", { name: st.name, n: res.total })) + "</p>";
    var errs = res.errorCount || 0;
    if (errs) {
      h += '<div class="msg err" role="alert"><p><strong>' + esc(ui("up_errors", { n: errs })) + '</strong></p><ul class="issues">' +
        res.errors.map(function (e) { return "<li>" + esc(ui("up_err_row", { row: e.row, msg: msg(e) })) + "</li>"; }).join("") + "</ul>" +
        (errs > res.errors.length ? "<p>" + esc(ui("up_more", { n: errs - res.errors.length })) + "</p>" : "") + "</div>";
    } else {
      h += '<p class="okline">' + esc(ui("up_ok", { n: res.rows.length, valid: res.counts.valid, bdl: res.counts.bdl, missing: res.counts.missing })) + "</p>";
    }
    if (res.duplicates) {
      h += '<p class="warnline">' + esc(ui("up_w_dup", { n: res.duplicates, action: ui(st.dup === "replace" ? "up_w_dup_replace" : "up_w_dup_keep") })) + "</p>";
    }
    if (res.newYears && res.newYears.length) h += '<p class="warnline">' + esc(ui("up_w_years", { years: res.newYears.join(", ") })) + "</p>";
    return h + "</section>";
  }

  function addedTable(res) {
    var by = {};
    res.rows.forEach(function (r) {
      var k = r.site + "|" + r.year + "|" + r.festival;
      by[k] = by[k] || { site: r.site, year: r.year, festival: r.festival, n: 0 };
      by[k].n += 1;
    });
    var rows = Object.keys(by).sort().map(function (k) { return by[k]; });
    if (!rows.length) return "";
    var gh = {}; D.scopes.all.forEach(function (g) { gh[g.site] = g; });
    return '<section class="reveal"><h2>' + esc(ui("up_added_h")) + "</h2>" + GW.tw('<table class="ev"><thead><tr><th scope="col">' + esc(ui("col_ghat")) +
      '</th><th scope="col">' + esc(ui("col_year")) + '</th><th scope="col">' + esc(ui("col_festival")) + '</th><th scope="col">' + esc(ui("up_col_added")) + "</th></tr></thead><tbody>" +
      rows.map(function (r) {
        return "<tr><td>" + esc(GW.name(gh[r.site])) + '</td><td class="n">' + r.year + "</td><td>" + esc(GW.gl("festival", r.festival)) + '</td><td class="n">' + r.n + "</td></tr>";
      }).join("") + "</tbody></table>") + "</section>";
  }

  function changeText(a) {
    if (!a.has_history) return ui("no_history");
    if (a.before_rank == null) return ui("up_new");
    var d = a.before_rank - a.rank;
    return d > 0 ? ui("up_up", { n: d }) : d < 0 ? ui("up_down", { n: -d }) : ui("up_same");
  }
  function previewHTML(res) {
    var prev = U.preview(D, res.rows, S.scope), g2 = {};
    D.scopes.all.forEach(function (g) { g2[g.id] = g; });
    var h = '<section class="reveal"><h2>' + GW.kind("calc") + esc(ui("up_preview_h")) + '</h2><p class="warnline">' + esc(ui("up_preview_note")) + "</p>" +
      '<p class="note">' + esc(ui("up_view", { scope: ui(S.scope === "all" ? "scope_all" : "scope_durga") })) + (res.rows.length ? "" : " " + esc(ui("up_none_added"))) + "</p>";
    h += GW.tw('<table class="ev"><thead><tr><th scope="col">' + esc(ui("col_ghat")) + '</th><th scope="col">' + esc(ui("up_col_now")) + '</th><th scope="col">' + esc(ui("up_col_with")) +
      '</th><th scope="col">' + esc(ui("up_col_change")) + '</th><th scope="col">' + esc(ui("confidence")) + '</th><th scope="col">' + esc(ui("up_col_added")) + "</th></tr></thead><tbody>" + prev.map(function (a) {
        var g = g2[a.id], cell = function (rank, total, tier) {
          return rank == null ? "—" : "#" + rank + " · " + total + ' <span class="tier t' + tier + '">' + esc(GW.gl("tier", tier)) + "</span>";
        };
        var moved = a.before_rank != null && a.rank != null && a.before_rank !== a.rank || a.before_total !== a.total;
        return "<tr" + (moved ? ' class="sel"' : "") + '><td><a href="#/ghat/' + esc(a.id) + '">' + esc(GW.name(g)) + '</a></td><td class="nw">' + cell(a.before_rank, a.before_total, a.before_tier) +
          '</td><td class="nw">' + (a.has_history ? cell(a.rank, a.total, a.tier) : '<span class="tier t-none">' + esc(ui("no_history")) + "</span>") + "</td><td>" + esc(changeText(a)) +
          '</td><td class="nw">' + (a.has_history ? GW.pct(a.confidence) + (a.confidence < D.rules.confidence.limited_below ? ' <span class="badge b-limited_data">' + esc(D.i18n[S.lang].flag.limited_data) + "</span>" : "") : "—") +
          '</td><td class="n">' + a.added + "</td></tr>";
      }).join("") + "</tbody></table>");
    if (res.rows.length) {
      h += '<p class="pickbar"><button type="button" id="up-dl">' + esc(ui("up_download")) + "</button></p><p class=\"note\">" + esc(ui("up_publish")) + "</p>";
    }
    return h + "</section>";
  }

  function render() {
    var h = '<header class="page-head reveal"><p class="eyebrow">' + esc(ui("nav_upload")) + '</p><h1 class="display sm">' + esc(ui("up_title")) + '</h1><p class="lede">' + esc(ui("up_lede")) +
      '</p></header><section class="upload reveal"><p>' + esc(ui("up_how")) + '</p><div class="up-box" id="up-drop"><p><button type="button" id="up-template" class="ghost">' + esc(ui("up_template")) +
      '</button></p><p><label class="filebtn"><input type="file" id="up-file" accept=".csv,text/csv,text/plain"><span>' + esc(ui("up_choose")) + '</span></label> <span class="note">' + esc(ui("up_drop")) +
      '</span></p><fieldset class="dups"><legend>' + esc(ui("up_dup_h")) + '</legend><label><input type="radio" name="dup" value="keep"' + (st.dup === "keep" ? " checked" : "") + "> " + esc(ui("up_dup_keep")) +
      '</label> <label><input type="radio" name="dup" value="replace"' + (st.dup === "replace" ? " checked" : "") + "> " + esc(ui("up_dup_replace")) + "</label></fieldset>" +
      '<p class="note" id="up-name">' + esc(st.name || ui("up_nofile")) + (st.name ? ' <button type="button" class="ghost sm" id="up-clear">' + esc(ui("up_clear")) + "</button>" : "") + "</p></div>" +
      '<details class="why"><summary>' + esc(ui("up_columns_h")) + "</summary><dl><dt>" + esc(ui("up_columns_h")) + "</dt><dd>" + esc(ui("up_columns")) + "</dd><dt>value / flag</dt><dd>" +
      esc(ui("up_value_help")) + "</dd><dt>source_page</dt><dd>" + esc(ui("up_source_help")) + "</dd></dl></details></section>" + '<div id="up-result" aria-live="polite">' + result() + "</div>";
    return h;
  }
  function result() {
    if (st.big) { st.res = { rows: [], errors: [], counts: { valid: 0, bdl: 0, missing: 0 } }; return reportHTML({ fatal: { code: "big" } }); }
    var res = st.text ? U.validate(D, st.text, { duplicates: st.dup }) : { rows: [], errors: [], total: 0, counts: { valid: 0, bdl: 0, missing: 0 } };
    st.res = res;
    if (!st.text) return previewHTML(res);
    return reportHTML(res) + (res.fatal || res.errorCount ? "" : addedTable(res) + previewHTML(res));
  }
  function refresh() {
    var box = document.getElementById("up-result");
    if (box) { box.innerHTML = result(); wireResult(); }
    var name = document.getElementById("up-name");
    if (name) {
      name.innerHTML = esc(st.name || ui("up_nofile")) + (st.name ? ' <button type="button" class="ghost sm" id="up-clear">' + esc(ui("up_clear")) + "</button>" : "");
      wireClear();
    }
  }
  function wireResult() {
    var dl = document.getElementById("up-dl");
    if (dl) dl.onclick = function () { download("ghat-watch-new-readings.csv", U.toCSV(st.res.rows.map(function (r) { return r.out; }))); };
  }
  function wireClear() {
    var c = document.getElementById("up-clear");
    if (c) c.onclick = function () { st.name = ""; st.text = ""; st.big = false; var f = document.getElementById("up-file"); if (f) f.value = ""; refresh(); };
  }
  function load(file) {
    if (!file) return;
    st.big = file.size > U.LIMITS.bytes;
    if (st.big) { st.name = file.name; st.text = ""; refresh(); return; }
    var reader = new FileReader();
    reader.onload = function () { st.name = file.name; st.text = String(reader.result || ""); refresh(); };
    reader.onerror = function () { st.name = file.name; st.text = ""; refresh(); };
    reader.readAsText(file, "utf-8");
  }
  function wire() {
    document.getElementById("up-template").onclick = function () { download("ghat-watch-template.csv", U.template()); };
    var f = document.getElementById("up-file");
    f.onchange = function () { load(f.files && f.files[0]); };
    var drop = document.getElementById("up-drop");
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { load(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
    document.querySelectorAll('input[name="dup"]').forEach(function (r) { r.onchange = function () { st.dup = r.value; refresh(); }; });
    wireClear(); wireResult();
  }

  GW.screens.upload = { render: render, wire: wire };
  GW.upload = st;
})();
