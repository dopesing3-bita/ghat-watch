/* Ghat Watch assistant (BR-80 to BR-87). Common questions are answered from the data with no AI (assist-core.js).
   Other questions go to the same-origin api/gemini endpoint, only when the user asks, and only on a deployment
   that has it. The browser never holds an API key. Answers live in memory only and are never cached. */
(function () {
  "use strict";
  var GW = window.GW, D = GW.D, C = window.GW_CORE, S = GW.state, esc = GW.esc;
  var A = function () { return D.i18n[S.lang].assist; };
  var ui = function (k, p) { return GW.ui(k, p); };
  var conv = [];            // { role: "user" | "bot", ... } kept in memory for this tab only
  var busy = false;
  GW.ai = "checking";

  /* ---------- AI availability (BR-87) ---------- */
  function hostedWithApi() {
    return /^https?:$/.test(location.protocol) && !/\.github\.io$/.test(location.hostname);
  }
  function checkAI() {
    if (!hostedWithApi()) return setAI("static");
    if (navigator.onLine === false) return setAI("offline");
    var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, 5000);
    fetch("api/gemini", { headers: { "X-Requested-With": "ghat-watch" }, signal: ctrl.signal, cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { clearTimeout(t); setAI(j && j.ai_configured ? "ready" : j ? "off" : "static"); })
      .catch(function () { clearTimeout(t); setAI(navigator.onLine === false ? "offline" : "static"); });
  }
  function setAI(s) { GW.ai = s; pill(); if (document.body.dataset.screen === "ask") paintStatus(); }
  function pill() {
    var el = document.getElementById("ai-status");
    if (!el) return;
    var k = { ready: "ai_ready", static: "ai_static", offline: "ai_offline", off: "ai_off", checking: "ai_checking" }[GW.ai];
    el.textContent = ui(k);
    el.className = "ai-pill ai-" + GW.ai;
  }
  window.addEventListener("online", checkAI);
  window.addEventListener("offline", function () { setAI("offline"); });

  /* ---------- context ---------- */
  function ctx() {
    var f = S.filters || {};
    return { lang: S.lang, scope: S.scope, ghats: S.selected.slice(0, 4),
      filters: { param: f.param || undefined, phase: f.phase || undefined, festival: f.festival || undefined, year: f.year || undefined } };
  }
  function contextLine() {
    var names = S.selected.map(function (id) { var g = GW.find(id); return g ? GW.name(g) : null; }).filter(Boolean);
    var scope = ui(S.scope === "all" ? "scope_all" : "scope_durga");
    return '<p class="ctx"><strong>' + esc(A().context) + ":</strong> " + esc(names.length ? GW.fill(A().context_ghats, { names: names.join(", ") }) :
      GW.fill(A().context_all, { scope: scope })) + (names.length ? ' <button type="button" class="ghost sm" id="ctx-clear">' + esc(A().context_clear) + "</button>" : "") + "</p>";
  }

  /* ---------- rendering ---------- */
  function evidenceChip(id) {
    var r = C.resolve(D, id, S.scope);                     // BR-85: re-checked against this browser's own data
    if (!r) return "";
    if (r.kind === "calc") {
      var g = GW.find(r.ghat);
      var what = g.has_history ? ui("score") + " " + r.total + " · " + GW.gl("tier", r.tier) : ui("no_history");
      return '<a class="ev-chip calc" href="' + esc(r.link) + '">' + esc(GW.name(g) + " · " + what) + "</a>";
    }
    var g2 = GW.find(r.ghat), val = r.value === "BDL" ? "BDL" : r.value === "missing" ? GW.gl("verdict", "not_sampled") : r.value + (r.unit ? " " + r.unit : "");
    var label = (g2 ? GW.name(g2) : r.ghat) + " · " + r.year + " " + GW.gl("festival", r.festival) + ", " + GW.gl("phase", r.phase) + ": " +
      GW.gl("parameter", r.parameter) + " " + val;
    return '<a class="ev-chip fact" href="' + esc(r.link) + '" target="_blank" rel="noopener" title="' + esc(ui("report_page", { page: r.page })) + '">' +
      esc(label) + " · " + esc(ui("report_page", { page: r.page })) + "</a>";
  }
  function factsBox(facts) {
    if (!facts || !facts.length) return "";
    return '<div class="facts"><p class="facts-h">' + GW.kind("calc") + esc(A().facts) + '</p><ul>' + facts.map(function (f) {
      var g = GW.find(f.ghat);
      if (!g) return "";
      return '<li><a href="#/ghat/' + esc(g.id) + '">' + esc(GW.name(g)) + "</a>: " + (f.has_history ? "#" + g.rank + " · " + esc(ui("score")) + " " + g.total + " " +
        esc(ui("of_100")) + " · " + esc(GW.gl("tier", g.tier)) : esc(ui("no_history"))) + "</li>";
    }).join("") + "</ul></div>";
  }
  function list(title, items, cls) {
    if (!items || !items.length) return "";
    return '<div class="' + cls + '"><p class="sub-h">' + esc(title) + "</p><ul>" + items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
  }
  function warnings(w) {
    if (!w) return "";
    var a = A(), out = [];
    if (w.dropped) out.push(GW.fill(a.warn_dropped, { n: w.dropped }));
    if (w.numbers) out.push(GW.fill(a.warn_numbers, { n: w.numbers }));
    if (w.urls) out.push(a.warn_urls);
    if (w.health) out.push(a.warn_health);
    return out.length ? '<div class="warnbox">' + out.map(function (x) { return "<p>" + esc(x) + "</p>"; }).join("") + "</div>" : "";
  }
  function botMessage(m, i) {
    var a = A();
    if (m.error) {
      return '<div class="msg bot err" role="alert"><p>' + esc(m.error) + "</p>" + (m.fallback || "") +
        (m.retry ? '<p><button type="button" class="ghost sm" data-retry="' + i + '">' + esc(a.retry) + "</button></p>" : "") + "</div>";
    }
    var d = m.data, isAI = d.mode === "ai";
    var findings = (d.findings || []).map(function (f) {
      var chips = (f.evidence || []).map(evidenceChip).filter(Boolean);
      var verified = f.verified && (!isAI || chips.length > 0);
      return '<li class="' + (verified ? "" : "unv") + '">' + (verified ? "" : '<span class="unv-tag">' + esc(a.unverified) + "</span> ") + esc(f.text) +
        (chips.length ? '<span class="chips">' + chips.join("") + "</span>" : "") + "</li>";
    }).join("");
    return '<div class="msg bot" lang="' + esc(d.lang || S.lang) + '"><p class="msg-badge ' + (isAI ? "b-ai" : "b-calc") + '">' + esc(isAI ? a.ai_badge : a.computed) + "</p>" +
      (d.answer_verified === false ? '<p class="unv-tag">' + esc(a.unverified) + "</p>" : "") + '<p class="answer">' + esc(d.answer) + "</p>" +
      (d.insufficient ? '<p class="warnline">' + esc(a.insufficient) + "</p>" : "") + factsBox(d.facts) +
      (findings ? '<div class="findings"><p class="sub-h">' + esc(a.findings) + "</p><ul>" + findings + "</ul></div>" : "") +
      list(a.limitations, d.limitations, "lims") + list(a.next_steps, d.next_steps, "steps-l") + warnings(d.warnings) +
      (d.link ? '<p><a class="textlink" href="' + esc(d.link) + '">' + esc(ui("nav_brief")) + " →</a></p>" : "") +
      '<p class="msg-actions"><button type="button" class="ghost sm" data-copy="' + i + '">' + esc(a.copy) + "</button>" +
      (!isAI && !d.refusal && GW.ai === "ready" ? ' <button type="button" class="ghost sm" data-explain="' + i + '">' + esc(a.ask_ai) + "</button>" : "") + "</p></div>";
  }
  function messages() {
    if (!conv.length) return '<p class="empty">' + esc(A().empty) + "</p>";
    return conv.map(function (m, i) {
      return m.role === "user" ? '<div class="msg user"><p>' + esc(m.text) + "</p></div>" : botMessage(m, i);
    }).join("") + (busy ? '<div class="msg bot loading" role="status"><span class="spinner" aria-hidden="true"></span> ' + esc(A().thinking) + "</div>" : "");
  }
  function statusNote() {
    var a = A(), k = { static: a.err_unavailable, off: a.err_unavailable, offline: a.err_offline }[GW.ai];
    return k ? '<p class="note ai-note">' + esc(k) + "</p>" : "";
  }
  function render() {
    var a = A();
    return '<header class="page-head reveal"><p class="eyebrow">' + esc(ui("nav_ask")) + ' · <span id="ai-inline"></span></p><h1 class="display sm">' + esc(a.title) +
      '</h1><p class="lede">' + esc(a.lede) + '</p><p class="notice-ai" role="note">' + esc(a.notice) + "</p></header>" +
      '<div class="ask reveal"><div class="ask-side">' + contextLine() + '<div id="ai-note">' + statusNote() + '</div><p class="sub-h">' + esc(ui("nav_ask")) + '</p><div class="qchips">' +
      a.chips.map(function (c, i) { return '<button type="button" class="chipbtn" data-chip="' + i + '">' + esc(c) + "</button>"; }).join("") +
      '</div></div><div class="ask-main"><div class="conv" id="conv" aria-live="polite">' + messages() + "</div>" +
      '<form class="askform" id="askform"><label class="vh" for="q">' + esc(a.placeholder) + '</label><textarea id="q" rows="2" maxlength="600" placeholder="' +
      esc(a.placeholder) + '"></textarea><div class="ask-btns"><button type="submit" id="send">' + esc(a.send) + '</button><button type="button" class="ghost" id="clear">' +
      esc(a.clear) + "</button></div></form></div></div>";
  }
  function paintStatus() {
    var inline = document.getElementById("ai-inline");
    if (inline) inline.textContent = ui({ ready: "ai_ready", static: "ai_static", offline: "ai_offline", off: "ai_off", checking: "ai_checking" }[GW.ai]);
    var note = document.getElementById("ai-note");
    if (note) note.innerHTML = statusNote();
  }
  function repaint() {
    var c = document.getElementById("conv");
    if (!c) return;
    c.innerHTML = messages();
    wireMessages();
    var last = c.lastElementChild;
    if (last && last.scrollIntoView) last.scrollIntoView({ block: "nearest" });
  }

  /* ---------- asking ---------- */
  function ask(question, opts) {
    opts = opts || {};
    question = String(question || "").trim();
    if (question.length < 3 || question.length > 600) { conv.push({ role: "bot", error: A().err_invalid }); return repaint(); }
    if (!opts.again) conv.push({ role: "user", text: question });
    if (!opts.forceAI) {
      var det = C.deterministicAnswer(D, question, ctx());
      if (det) { conv.push({ role: "bot", data: det, q: question }); return repaint(); }
    }
    if (GW.ai !== "ready") {
      var reason = { offline: A().err_offline }[GW.ai] || A().err_unavailable;
      conv.push({ role: "bot", error: reason, fallback: '<p class="note">' + esc(A().no_match) + "</p>", q: question });
      return repaint();
    }
    busy = true; repaint();
    var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 35000);
    var c = ctx();
    fetch("api/gemini", {
      method: "POST", signal: ctrl.signal, cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Requested-With": "ghat-watch" },
      body: JSON.stringify({ question: question, lang: c.lang, scope: c.scope, ghats: c.ghats, filters: c.filters })
    }).then(function (r) {
      return r.json().catch(function () { return { error: "upstream" }; }).then(function (j) { return { status: r.status, body: j }; });
    }).then(function (res) {
      clearTimeout(timer); busy = false;
      var b = res.body || {};
      if (b.error || !b.answer) { conv.push(errorFor(b.error, question)); return repaint(); }
      conv.push({ role: "bot", data: b, q: question });
      repaint();
    }).catch(function (e) {
      clearTimeout(timer); busy = false;
      conv.push(errorFor(e && e.name === "AbortError" ? "timeout" : navigator.onLine === false ? "offline" : "upstream", question));
      repaint();
    });
  }
  function errorFor(code, q) {
    var a = A();
    var text = { timeout: a.err_timeout, rate_limited: a.err_rate, quota: a.err_quota, ai_unavailable: a.err_unavailable, config_invalid: a.err_unavailable,
      bad_ai_response: a.err_bad, offline: a.err_offline, invalid_question: a.err_invalid }[code] || a.err_generic;
    return { role: "bot", error: text, retry: code !== "invalid_question" && code !== "ai_unavailable", q: q,
      fallback: '<p class="note">' + esc(a.no_match) + "</p>" };
  }
  function plain(m) {
    var d = m.data, a = A(), lines = [d.answer];
    (d.findings || []).forEach(function (f) { lines.push("- " + (f.verified ? "" : "[" + a.unverified + "] ") + f.text); });
    if (d.limitations && d.limitations.length) lines.push("", a.limitations + ":", "- " + d.limitations.join("\n- "));
    lines.push("", "(" + (d.mode === "ai" ? a.ai_badge : a.computed) + ")");
    return lines.join("\n");
  }

  function wireMessages() {
    document.querySelectorAll("[data-copy]").forEach(function (b) {
      b.onclick = function () {
        var text = plain(conv[+b.dataset.copy]);
        var done = function () { b.textContent = A().copied; setTimeout(function () { b.textContent = A().copy; }, 1500); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, done); else done();
      };
    });
    document.querySelectorAll("[data-explain]").forEach(function (b) {
      b.onclick = function () { var m = conv[+b.dataset.explain]; ask(m.q, { forceAI: true, again: true }); };
    });
    document.querySelectorAll("[data-retry]").forEach(function (b) {
      b.onclick = function () { var m = conv[+b.dataset.retry]; conv.splice(+b.dataset.retry, 1); ask(m.q, { forceAI: true, again: true }); };
    });
  }
  function wire() {
    paintStatus();
    var a = A();
    document.querySelectorAll("[data-chip]").forEach(function (b) {
      b.onclick = function () { if (!busy) ask(a.chips[+b.dataset.chip]); };
    });
    var form = document.getElementById("askform"), q = document.getElementById("q");
    form.onsubmit = function (e) { e.preventDefault(); if (busy) return; var v = q.value; q.value = ""; ask(v); };
    q.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.onsubmit(e); } });
    document.getElementById("clear").onclick = function () { conv = []; repaint(); };
    var cc = document.getElementById("ctx-clear");
    if (cc) cc.onclick = function () { S.selected = []; GW.route(); };
    wireMessages();
  }

  GW.screens.ask = { render: render, wire: wire };
  GW.hooks.push(function (why) { if (!why) pill(); });
  checkAI();
})();
