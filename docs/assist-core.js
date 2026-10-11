/* Ghat Watch evidence engine (BR-80 to BR-86). Shared by the browser (no-AI answers) and api/gemini.js
   (evidence sent to Gemini, and checks on Gemini's reply). Plain JS, no dependencies, no network calls.
   The scoring engine's numbers in data.js are the only source of scores, tiers and ranks. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GW_CORE = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DO = "Dissolved oxygen", BOD = "BOD", PH = "pH";
  var MAX_GHATS = 4, MAX_RECORDS = 90, MAX_TEXT = 4000;

  /* ---------- question parsing (BR-80) ---------- */
  var PARAM_WORDS = {
    "Dissolved oxygen": ["dissolved oxygen", "oxygen", "घुलित ऑक्सीजन", "ऑक्सीजन", "डीओ"],
    "BOD": ["bod", "biochemical oxygen", "बीओडी", "जैव-रासायनिक", "जैव रासायनिक"],
    "pH": ["ph", "पीएच", "acidity", "अम्लीय"],
    "COD": ["cod", "chemical oxygen", "सीओडी"],
    "Turbidity": ["turbidity", "गंदलापन", "टर्बिडिटी"],
    "Conductivity": ["conductivity", "चालकता"],
    "Total solids": ["total solids", "कुल ठोस"],
    "Dissolved solids": ["dissolved solids", "tds", "घुलित ठोस"],
    "Suspended solids": ["suspended solids", "निलंबित ठोस"],
    "Chromium": ["chromium", "क्रोमियम"],
    "Lead": ["lead", "सीसा", "लेड"],
    "Zinc": ["zinc", "जस्ता", "ज़िंक"],
    "Copper": ["copper", "तांबा", "कॉपर"]
  };
  var INTENT_WORDS = {
    health: ["safe", "safety", "unsafe", "swim", "bathe", "bathing in", "drink", "drinking", "health", "harm", "disease", "sick",
      "सुरक्षित", "स्वास्थ्य", "नहाना", "नहाने", "पीने", "पीना", "बीमारी", "नुकसान"],
    live: ["today", "right now", "now", "current", "currently", "live", "at present", "this week", "this year",
      "अभी", "आज", "वर्तमान", "इस समय", "इस साल"],
    terms: ["what is", "what are", "meaning", "mean", "explain do", "explain dissolved", "simple", "define",
      "क्या है", "क्या होता", "अर्थ", "मतलब", "समझा", "सरल"],
    verify: ["verify", "before acting", "check before", "caution", "rely", "trust", "सत्यापित", "कार्रवाई से पहले", "भरोसा"],
    gaps: ["gap", "missing", "coverage", "not sampled", "data quality", "incomplete", "कमी", "अनुपलब्ध", "उपलब्धता", "छूटे"],
    compare: ["compare", "comparison", "versus", " vs ", "difference", "तुलना", "बनाम", "अंतर"],
    change: ["before", "during", "after", "change", "changed", "immersion impact", "पहले", "दौरान", "बाद", "बदल"],
    brief: ["brief", "briefing", "summary", "summarise", "summarize", "note", "नोट", "सारांश"],
    why: ["why", "reason", "ranked", "क्यों", "कारण"],
    top: ["highest", "top", "rank", "ranking", "priority", "worst", "most", "first", "सबसे", "शीर्ष", "प्राथमिकता", "क्रम"]
  };
  var GENERIC = ["ghat", "kund", "lake", "dam", "घाट", "कुंड", "झील", "डैम"];

  function norm(s) {
    return " " + String(s || "").toLowerCase().replace(/[?!.,;:()"'“”‘’/\\|]+/g, " ").replace(/\s+/g, " ").trim() + " ";
  }
  function has(text, word) {
    var w = word.toLowerCase();
    if (/^[a-z0-9 -]+$/.test(w)) return text.indexOf(" " + w + " ") >= 0 || text.indexOf(" " + w + "s ") >= 0;
    return text.indexOf(w) >= 0;
  }

  function aliases(g) {
    var out = [];
    [g.site, g.name_hi].forEach(function (full) {
      String(full || "").split(/\s*[\/()]\s*/).forEach(function (part) {
        var words = part.trim().toLowerCase().split(/\s+/).filter(function (w) { return w && GENERIC.indexOf(w) < 0; });
        if (!words.length) return;
        out.push(words.join(" "));
        words.forEach(function (w) { if (w.length >= 6) out.push(w); });
      });
    });
    return out.filter(function (a, i) { return out.indexOf(a) === i; });
  }

  function ghatList(D) { return D.scopes.all; }

  function parseQuestion(D, question) {
    var raw = String(question || ""), t = norm(raw), p = { ghats: [], params: [], years: [], festivals: [], phases: [], intents: [] };
    ghatList(D).forEach(function (g) {
      if (aliases(g).some(function (a) { return has(t, a); })) p.ghats.push(g.id);
    });
    if (/\bDO\b/.test(raw)) p.params.push(DO);       // "DO" only in capitals, so the verb "do" is not a parameter
    Object.keys(PARAM_WORDS).forEach(function (k) {
      if (p.params.indexOf(k) < 0 && PARAM_WORDS[k].some(function (w) { return has(t, w); })) p.params.push(k);
    });
    if (has(t, "metal") || has(t, "heavy metal") || t.indexOf("धातु") >= 0) {
      (D.no_limit_parameters || []).slice(-4).forEach(function (k) { if (p.params.indexOf(k) < 0) p.params.push(k); });
    }
    if (has(t, "hindi") || t.indexOf("हिन्दी में") >= 0 || t.indexOf("हिंदी में") >= 0) p.lang = "hi";
    else if (has(t, "english") || t.indexOf("अंग्रेज़ी में") >= 0) p.lang = "en";
    (D.dataset.years || []).forEach(function (y) { if (t.indexOf(" " + y + " ") >= 0) p.years.push(y); });
    if (has(t, "ganesh") || t.indexOf("गणेश") >= 0) p.festivals.push("Ganesh");
    if (has(t, "durga") || t.indexOf("दुर्गा") >= 0) p.festivals.push("Durga");
    Object.keys(INTENT_WORDS).forEach(function (k) {
      if (INTENT_WORDS[k].some(function (w) { return has(t, w); })) p.intents.push(k);
    });
    return p;
  }

  /* ---------- evidence (BR-81) ---------- */
  function fmt(x) { var r = Math.round(x * 1000) / 1000; return String(r); }
  function pct(x) { return Math.round(x * 100) + "%"; }
  function gname(g, lang) { return lang === "hi" ? g.name_hi : g.site; }

  function rowsFor(D, scope) { return D.scopes[scope] || D.scopes.all; }
  function findGhat(D, scope, id) { return rowsFor(D, scope).filter(function (g) { return g.id === id; })[0]; }

  function readingRecord(D, i) {
    var R = D.readings, r = R.rows[i];
    if (!r) return null;
    var param = R.parameters[r[4]], year = r[1];
    var lim = D.limits, verdict = r[6] === "missing" ? "not_sampled" : r[6] === "bdl" ? "bdl" : "no_limit";
    if (r[6] === "valid") {
      if (param === DO) verdict = r[5] < lim.do_min ? "fail" : "pass";
      else if (param === BOD) verdict = r[5] > lim.bod_max ? "fail" : "pass";
      else if (param === PH) verdict = r[5] < lim.ph_min || r[5] > lim.ph_max ? "fail" : "pass";
    }
    return {
      id: "r" + i, ghat: R.ghat_ids[r[0]], year: year, festival: R.festivals[r[2]], phase: R.phases[r[3]],
      parameter: param, value: r[6] === "valid" ? r[5] : r[6] === "bdl" ? "BDL" : "missing",
      unit: R.units[param] || null, verdict: verdict, page: r[7],
      link: D.reports[String(year)] ? D.reports[String(year)] + "#page=" + r[7] : null
    };
  }

  /** BR-85: resolve an evidence id against the data. Unknown ids return null, never a guess. */
  function resolve(D, id, scope) {
    if (typeof id !== "string") return null;
    var m = id.match(/^r(\d{1,5})$/);
    if (m) return readingRecord(D, +m[1]);
    m = id.match(/^g:([\w-]{1,40})$/);
    if (m) {
      var g = findGhat(D, scope || "all", m[1]);
      return g ? { id: id, ghat: g.id, kind: "calc", total: g.total, tier: g.tier, rank: g.rank, link: "#/ghat/" + g.id } : null;
    }
    return null;
  }

  function filterRows(D, f) {
    var R = D.readings, out = [];
    R.rows.forEach(function (r, i) {
      if (f.ghats && f.ghats.length && f.ghats.indexOf(R.ghat_ids[r[0]]) < 0) return;
      if (f.params && f.params.length && f.params.indexOf(R.parameters[r[4]]) < 0) return;
      if (f.years && f.years.length && f.years.indexOf(r[1]) < 0) return;
      if (f.festivals && f.festivals.length && f.festivals.indexOf(R.festivals[r[2]]) < 0) return;
      if (f.phases && f.phases.length && f.phases.indexOf(R.phases[r[3]]) < 0) return;
      out.push(i);
    });
    return out;
  }

  function rankingSummary(D, scope, lang) {
    return rowsFor(D, scope).map(function (g) {
      var s = { id: "g:" + g.id, ghat: g.id, name: gname(g, lang), has_history: g.has_history,
        flags: g.flags.map(function (f) { return (D.i18n[lang].flag || {})[f] || f; }),
        designated_2026: g.designated_2026 };
      if (g.has_history) {
        s.rank = g.rank; s.score = g.total; s.tier = g.tier; s.coverage = pct(g.confidence);
        s.rank_range = g.rank_range ? [g.rank_range.min, g.rank_range.max] : null;
        s.reason = g.reason[lang] || g.reason.en;
        s.parts = {};
        g.components.forEach(function (c) { s.parts[c.key] = [Math.round(c.points * 10) / 10, c.max]; });
      }
      return s;
    });
  }

  /** BR-81: the minimum evidence for one question. Deterministic; no AI involved. */
  function buildPack(D, parsed, ctx) {
    ctx = ctx || {};
    var scope = D.scopes[ctx.scope] ? ctx.scope : "all", lang = ctx.lang === "hi" ? "hi" : "en";
    var known = rowsFor(D, scope).map(function (g) { return g.id; });
    var ctxGhats = (ctx.ghats || []).filter(function (id) { return known.indexOf(id) >= 0; });
    var ghats = parsed.ghats.length ? parsed.ghats : ctxGhats.length ? ctxGhats :
      rowsFor(D, scope).filter(function (g) { return g.has_history; }).slice(0, 3).map(function (g) { return g.id; });
    ghats = ghats.slice(0, MAX_GHATS);
    var f = ctx.filters || {};
    var params = parsed.params.length ? parsed.params : f.param ? [f.param] : [DO, BOD, PH];
    var festivals = parsed.festivals.length ? parsed.festivals : scope === "durga" ? ["Durga"] : f.festival ? [f.festival] : [];
    var idx = filterRows(D, {
      ghats: ghats, params: params.slice(0, 4), festivals: festivals,
      years: parsed.years.length ? parsed.years : f.year ? [+f.year] : [], phases: f.phase ? [f.phase] : []
    }).slice(0, MAX_RECORDS);
    var records = idx.map(function (i) { return readingRecord(D, i); });
    var ranking = rankingSummary(D, scope, lang);
    var pack = {
      scope: scope, data_period: D.dataset.years[0] + "-" + D.dataset.years[D.dataset.years.length - 1],
      limits: D.limits, headline: D.headline, tiers: D.tiers, ranking: ranking,
      focus_ghats: ghats, records: records, truncated: idx.length >= MAX_RECORDS
    };
    pack.allowed = allowedNumbers(D, pack);
    return pack;
  }

  function addNums(set, x) {
    String(x).replace(/\d+(?:\.\d+)?/g, function (n) { set[String(+n)] = 1; return n; });
  }
  function allowedNumbers(D, pack) {
    var s = {};
    for (var i = 0; i <= 12; i++) s[String(i)] = 1;
    [100, D.stability_runs, D.event && D.event.after_days].forEach(function (x) { if (x != null) addNums(s, x); });
    addNums(s, D.event ? D.event.date : "");
    addNums(s, D.dataset.years.join(" "));
    addNums(s, JSON.stringify(D.headline)); addNums(s, JSON.stringify(D.limits)); addNums(s, JSON.stringify(D.tiers));
    addNums(s, JSON.stringify(D.component_max));
    pack.records.forEach(function (r) { addNums(s, [r.value, r.page, r.year].join(" ")); });
    pack.ranking.forEach(function (g) { addNums(s, JSON.stringify([g.rank, g.score, g.tier, g.coverage, g.rank_range, g.parts])); addNums(s, g.reason || ""); });
    return s;
  }

  function numbersNotIn(text, allowed) {
    var bad = [];
    String(text).replace(/\d+(?:\.\d+)?/g, function (n) { if (!allowed[String(+n)]) bad.push(n); return n; });
    return bad;
  }

  /* ---------- checks on Gemini's reply (BR-84, BR-85) ---------- */
  var URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
  var HEALTH_RE = /\b(safe|unsafe|safety|healthy|unhealthy|potable|drinkable|disease|diseases|harmful)\b|fit for (bathing|drinking|swimming|human)|सुरक्षित|असुरक्षित|स्वस्थ|पीने योग्य|बीमारी/i;

  function cleanText(s, w) {
    s = String(s == null ? "" : s).slice(0, MAX_TEXT);
    if (URL_RE.test(s)) { w.urls += 1; s = s.replace(URL_RE, ""); }
    URL_RE.lastIndex = 0;
    var parts = s.split(/(?<=[.!?।])\s+/), kept = parts.filter(function (x) { return !HEALTH_RE.test(x); });
    if (kept.length !== parts.length) w.health += parts.length - kept.length;
    return kept.join(" ").replace(/\s+/g, " ").trim();
  }

  function isStrArray(a, max) { return Array.isArray(a) && a.length <= max && a.every(function (x) { return typeof x === "string"; }); }

  /** BR-84 / BR-85: validate Gemini's JSON against the schema, the evidence ids and the evidence numbers. */
  function validateReply(D, reply, pack) {
    if (!reply || typeof reply !== "object" || Array.isArray(reply)) return { ok: false, error: "bad_ai_response" };
    if (typeof reply.answer !== "string" || !reply.answer.trim() || !Array.isArray(reply.key_findings) ||
      reply.key_findings.length > 8 || !isStrArray(reply.limitations || [], 8) ||
      !isStrArray(reply.recommended_next_steps || [], 6) ||
      (reply.insufficient_evidence !== undefined && typeof reply.insufficient_evidence !== "boolean")) {
      return { ok: false, error: "bad_ai_response" };
    }
    var w = { dropped: 0, numbers: 0, urls: 0, health: 0 };
    var valid = {};
    pack.records.forEach(function (r) { valid[r.id] = 1; });
    pack.ranking.forEach(function (g) { valid[g.id] = 1; });
    var findings = [];
    for (var i = 0; i < reply.key_findings.length; i++) {
      var k = reply.key_findings[i];
      if (!k || typeof k.text !== "string" || !isStrArray(k.evidence_ids || [], 12)) return { ok: false, error: "bad_ai_response" };
      var text = cleanText(k.text, w);
      if (!text) continue;
      var ids = (k.evidence_ids || []).filter(function (id) {
        var ok = valid[id] && resolve(D, id, pack.scope);
        if (!ok) w.dropped += 1;
        return ok;
      });
      var badNums = numbersNotIn(text, pack.allowed);
      if (badNums.length) w.numbers += 1;
      findings.push({ text: text, evidence: ids, verified: ids.length > 0 && !badNums.length });
    }
    var answer = cleanText(reply.answer, w);
    var answerUnverified = numbersNotIn(answer, pack.allowed).length > 0;
    if (answerUnverified) w.numbers += 1;
    return {
      ok: true, answer: answer, answer_verified: !answerUnverified, findings: findings,
      limitations: (reply.limitations || []).map(function (x) { return cleanText(x, w); }).filter(Boolean),
      next_steps: (reply.recommended_next_steps || []).map(function (x) { return cleanText(x, w); }).filter(Boolean),
      insufficient: !!reply.insufficient_evidence, warnings: w
    };
  }

  /* ---------- deterministic answers (BR-83) ---------- */
  function T(D, lang) { return D.i18n[lang].assist; }
  function fill(tpl, p) { return String(tpl).replace(/\{(\w+)\}/g, function (_, k) { return p[k] == null ? "" : p[k]; }); }
  function tierName(D, t, lang) { return D.glossary.tier[t][lang]; }
  function limits(D, lang, keys) { var a = T(D, lang); return keys.map(function (k) { return a["lim_" + k]; }); }

  function facts(D, scope, ids) {
    return ids.map(function (id) { return findGhat(D, scope, id); }).filter(Boolean).map(function (g) {
      return { ghat: g.id, rank: g.rank, total: g.total, tier: g.tier, has_history: g.has_history };
    });
  }

  function answerTop(D, scope, lang) {
    var a = T(D, lang), top = rowsFor(D, scope).filter(function (g) { return g.has_history; }).slice(0, 3);
    var list = top.map(function (g) {
      return fill(a.a_top_item, { rank: g.rank, name: gname(g, lang), total: g.total, tier: tierName(D, g.tier, lang) });
    }).join("; ");
    var scopeName = D.i18n[lang].ui[scope === "durga" ? "scope_durga" : "scope_all"];
    return {
      answer: fill(a.a_top, { scope: scopeName, list: list }),
      findings: top.map(function (g) { return { text: gname(g, lang) + ": " + g.reason[lang], evidence: ["g:" + g.id], verified: true, kind: "calc" }; }),
      limitations: limits(D, lang, ["hist", "relative", "few"]), next_steps: [a.step_open, a.step_test],
      facts: facts(D, scope, top.map(function (g) { return g.id; }))
    };
  }

  function answerWhy(D, scope, lang, id) {
    var a = T(D, lang), g = findGhat(D, scope, id);
    if (!g) return null;
    if (!g.has_history) {
      return { answer: fill(a.a_nohist, { name: gname(g, lang) }), findings: [], limitations: limits(D, lang, ["hist"]),
        next_steps: [D.i18n[lang].focus.baseline_test], facts: facts(D, scope, [id]) };
    }
    var parts = g.components.map(function (c) { return D.glossary.component[c.key][lang] + " " + c.points.toFixed(1) + "/" + c.max; }).join("; ");
    var ev = [];
    g.components.forEach(function (c) {
      if (c.key !== "oxygen" && c.key !== "organic") return;
      c.evidence.forEach(function (r) {
        if (r.verdict !== "fail") return;
        var i = indexOf(D, g.id, r.year, r.festival, r.phase, r.parameter);
        if (i >= 0 && ev.length < 8) ev.push("r" + i);
      });
    });
    return {
      answer: fill(a.a_why, { name: gname(g, lang), total: g.total, tier: tierName(D, g.tier, lang), rank: g.rank,
        reason: g.reason[lang], coverage: pct(g.confidence), stability: g.stability ? g.stability[lang] : "" }),
      findings: [{ text: fill(a.a_why_parts, { parts: parts }), evidence: ["g:" + g.id], verified: true, kind: "calc" },
        { text: g.reason[lang], evidence: ev, verified: ev.length > 0, kind: "fact" }],
      limitations: limits(D, lang, ["hist", "units", "relative"]), next_steps: [a.step_open, a.step_plan],
      facts: facts(D, scope, [id])
    };
  }

  var KEY_CACHE = null;
  function indexOf(D, ghat, year, festival, phase, param) {
    if (!KEY_CACHE || KEY_CACHE.D !== D) {
      var R = D.readings, map = {};
      R.rows.forEach(function (r, i) { map[[R.ghat_ids[r[0]], r[1], R.festivals[r[2]], R.phases[r[3]], R.parameters[r[4]]].join("|")] = i; });
      KEY_CACHE = { D: D, map: map };
    }
    var v = KEY_CACHE.map[[ghat, year, festival, phase, param].join("|")];
    return v == null ? -1 : v;
  }

  function answerGaps(D, scope, lang) {
    var a = T(D, lang), rows = rowsFor(D, scope);
    var items = rows.map(function (g) {
      var missing = g.coverage.filter(function (c) { return c.status === "missing"; }).length;
      return { g: g, missing: missing };
    }).filter(function (x) { return !x.g.has_history || x.g.confidence < 1; })
      .sort(function (x, y) { return x.g.confidence - y.g.confidence; });
    var list = items.map(function (x) {
      return x.g.has_history ? fill(a.a_gap_item, { name: gname(x.g, lang), coverage: pct(x.g.confidence), missing: x.missing })
        : fill(a.a_nohist, { name: gname(x.g, lang) });
    }).join("; ");
    return {
      answer: fill(a.a_gaps, { list: list }),
      findings: items.slice(0, 6).map(function (x) {
        return { text: x.g.has_history ? fill(a.a_gap_item, { name: gname(x.g, lang), coverage: pct(x.g.confidence), missing: x.missing }) : fill(a.a_nohist, { name: gname(x.g, lang) }),
          evidence: ["g:" + x.g.id], verified: true, kind: "calc" };
      }),
      limitations: limits(D, lang, ["hist", "few"]), next_steps: [D.i18n[lang].focus.fill_gap, a.step_test],
      facts: facts(D, scope, items.map(function (x) { return x.g.id; }))
    };
  }

  /** BR-82: like-for-like comparison of 2 to 4 ghats for one parameter and phase. */
  function compare(D, scope, ids, param, phase) {
    var R = D.readings, fests = scope === "durga" ? ["Durga"] : R.festivals, events = [];
    D.dataset.years.forEach(function (y) {
      fests.forEach(function (f) {
        var cells = ids.map(function (id) {
          var i = indexOf(D, id, y, f, phase, param);
          return i < 0 ? { id: null, status: "no_table" } : { id: "r" + i, status: R.rows[i][6], value: R.rows[i][5] };
        });
        events.push({ year: y, festival: f, cells: cells, fair: cells.every(function (c) { return c.status === "valid"; }) });
      });
    });
    return { param: param, phase: phase, ghats: ids, events: events, fair: events.filter(function (e) { return e.fair; }).length };
  }

  function answerCompare(D, scope, lang, ids, param, phase) {
    var a = T(D, lang), ui = D.i18n[lang].ui, cmp = compare(D, scope, ids, param, phase);
    var fairTxt = fill(ui.cmp_fair, { n: cmp.fair, m: cmp.events.length }) + (cmp.fair < cmp.events.length ? " " + ui.cmp_flag : "");
    var findings = cmp.events.filter(function (e) { return e.fair; }).map(function (e) {
      return {
        text: e.year + " " + D.glossary.festival[e.festival][lang] + ": " + ids.map(function (id, k) {
          return gname(findGhat(D, scope, id), lang) + " " + fmt(e.cells[k].value);
        }).join(", "),
        evidence: e.cells.map(function (c) { return c.id; }), verified: true, kind: "fact"
      };
    });
    return {
      answer: fill(a.a_compare, { param: D.glossary.parameter[param] ? D.glossary.parameter[param][lang] : param,
        phase: D.glossary.phase[phase][lang], fair: fairTxt }),
      findings: findings, limitations: limits(D, lang, ["hist", "units", "few"]), next_steps: [a.step_open],
      facts: facts(D, scope, ids), compare: cmp
    };
  }

  function answerChange(D, scope, lang, ghats, params) {
    var a = T(D, lang), R = D.readings, list = [];
    (params.length ? params : [DO, BOD]).slice(0, 2).forEach(function (param) {
      if (param !== DO && param !== BOD) return;
      var pairs = 0, worse = 0, missing = 0, ev = [];
      rowsFor(D, scope).forEach(function (g) {
        if (!g.has_history || (ghats.length && ghats.indexOf(g.id) < 0)) return;
        D.dataset.years.forEach(function (y) {
          (scope === "durga" ? ["Durga"] : R.festivals).forEach(function (f) {
            var i = indexOf(D, g.id, y, f, "pre", param), j = indexOf(D, g.id, y, f, "during", param);
            if (i < 0 || j < 0) return;
            var pr = R.rows[i], du = R.rows[j];
            if (pr[6] !== "valid" || du[6] !== "valid") { missing += 1; return; }
            pairs += 1;
            var d = param === BOD ? du[5] - pr[5] : pr[5] - du[5];
            if (d >= 1 - 1e-9) { worse += 1; if (ev.length < 6) ev.push("r" + i, "r" + j); }
          });
        });
      });
      list.push({ text: fill(a.a_change, { param: D.glossary.parameter[param][lang], worse: worse, pairs: pairs, missing: missing }),
        evidence: ev, verified: true, kind: "calc" });
    });
    return { answer: list.map(function (x) { return x.text; }).join(" "), findings: list,
      limitations: limits(D, lang, ["hist", "units", "few"]), next_steps: [D.i18n[lang].focus.test_during], facts: [] };
  }

  /** BR-83: answer common questions straight from the data. Returns null when the data alone cannot. */
  function deterministicAnswer(D, question, ctx) {
    ctx = ctx || {};
    var scope = D.scopes[ctx.scope] ? ctx.scope : "all", p = parseQuestion(D, question);
    var lang = p.lang || (ctx.lang === "hi" ? "hi" : "en"), a = T(D, lang), is = function (k) { return p.intents.indexOf(k) >= 0; };
    var ghats = p.ghats.length ? p.ghats : (ctx.ghats || []);
    var out = null;
    if (is("health")) out = { answer: a.a_health, findings: [], limitations: limits(D, lang, ["coliform", "relative"]), next_steps: [a.step_test], facts: [], refusal: true };
    else if (is("live")) out = { answer: a.a_live, findings: [], limitations: limits(D, lang, ["hist"]), next_steps: [a.step_test], facts: [], refusal: true };
    else if (is("terms") && (p.params.indexOf(DO) >= 0 || p.params.indexOf(BOD) >= 0)) {
      out = { answer: fill(a.a_terms, D.headline), findings: [], limitations: limits(D, lang, ["units"]), next_steps: [], facts: [] };
    } else if (is("verify")) out = { answer: a.a_verify, findings: [], limitations: limits(D, lang, ["hist", "units", "coliform", "relative"]), next_steps: [a.step_open, a.step_test], facts: [] };
    else if (is("gaps")) out = answerGaps(D, scope, lang);
    else if (is("compare") && ghats.length >= 2) {
      var ids = ghats.filter(function (id) { var g = findGhat(D, scope, id); return g && g.has_history; }).slice(0, MAX_GHATS);
      if (ids.length >= 2) out = answerCompare(D, scope, lang, ids, p.params[0] || (ctx.filters && ctx.filters.param) || DO,
        (ctx.filters && ctx.filters.phase) || "during");
    } else if (is("change") && !p.ghats.length) out = answerChange(D, scope, lang, ghats, p.params);
    else if (is("brief")) out = { answer: a.a_brief, findings: answerTop(D, scope, lang).findings, limitations: limits(D, lang, ["hist", "relative"]), next_steps: [a.step_plan], facts: [], link: "#/brief" };
    else if (p.ghats.length === 1 && (is("why") || is("top") || (!p.intents.length && !p.params.length))) out = answerWhy(D, scope, lang, p.ghats[0]);
    else if (is("top") && !p.ghats.length) out = answerTop(D, scope, lang);
    if (!out) return null;
    out.mode = "computed";
    out.lang = lang;
    out.insufficient = false;
    return out;
  }

  return {
    parseQuestion: parseQuestion, buildPack: buildPack, validateReply: validateReply, resolve: resolve,
    deterministicAnswer: deterministicAnswer, compare: compare, filterRows: filterRows, readingRecord: readingRecord,
    numbersNotIn: numbersNotIn, indexOf: indexOf, aliases: aliases, LIMITS: { MAX_GHATS: MAX_GHATS, MAX_RECORDS: MAX_RECORDS }
  };
});
