/* docs/upload-core.js tests (BR-90 to BR-93): the browser engine must reproduce the official scores, and reject bad rows. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const U = require(path.join(ROOT, "docs", "upload-core.js"));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "docs", "data.js"), "utf8"), sandbox);
const D = sandbox.window.GHAT_DATA;
const HEAD = "year,festival,site,phase,parameter,value,flag,source_page\n";
const row = (o) => [o.year || 2026, o.festival || "Durga", o.site || "Prempura ghat", o.phase || "pre", o.parameter || "Dissolved oxygen", o.value == null ? (o.flag ? "" : 5) : o.value, o.flag || "", o.page == null ? 12 : o.page].join(",") + "\n";

test("with no uploaded rows the preview equals the official ranking exactly, in both views", () => {
  for (const scope of ["all", "durga"]) {
    const prev = U.preview(D, [], scope);
    for (const a of prev) {
      const g = D.scopes[scope].find((x) => x.id === a.id);
      assert.equal(a.has_history, g.has_history);
      if (!g.has_history) continue;
      assert.equal(a.total, g.total, `${scope} ${a.id} total`);
      assert.equal(a.tier, g.tier);
      assert.equal(a.rank, g.rank);
      assert.ok(Math.abs(a.confidence - g.confidence) < 1e-3);
      g.components.forEach((c) => assert.equal(a.components[c.key], c.points, `${a.id} ${c.key}`));
    }
  }
});

test("a good file is accepted; BDL and not sampled keep their status and never become 0", () => {
  const text = HEAD + row({ value: 6.2 }) + row({ phase: "during", value: 1.8 }) + row({ parameter: "Lead", phase: "during", flag: "BDL", page: 13 }) +
    row({ parameter: "BOD", phase: "after", flag: "not sampled" }) + row({ parameter: "BOD", phase: "pre", flag: "*" });
  const r = U.validate(D, text);
  assert.equal(r.errorCount || 0, 0);
  assert.deepEqual(r.counts, { valid: 2, bdl: 1, missing: 2 });
  r.rows.filter((x) => x.status !== "valid").forEach((x) => assert.equal(x.value, null));
  assert.deepEqual(r.newYears, [2026]);
});

test("every kind of bad row is reported with its row number and nothing is added", () => {
  const bad = [row({ year: 26 }), row({ festival: "Holi" }), row({ site: "Nowhere ghat" }), row({ phase: "midway" }), row({ parameter: "Salinity" }),
    row({ parameter: "BOD", value: "abc" }), row({ parameter: "BOD", value: 3, flag: "BDL" }), row({ parameter: "BOD", value: "" }), row({ parameter: "BOD", value: -3 }),
    row({ parameter: "BOD", value: 3, page: 0 }), row({ parameter: "BOD", flag: "sometimes" })];
  const r = U.validate(D, HEAD + bad.join(""));
  assert.equal(r.errorCount, bad.length);
  assert.deepEqual(r.errors.map((e) => e.code), ["year", "festival", "site", "phase", "param", "value", "both", "novalue", "neg", "page", "flag"]);
  assert.deepEqual(r.errors.map((e) => e.row), bad.map((_, i) => i + 2));
  assert.equal(r.rows.length, 0);
});

test("a repeated reading in the file is an error", () => {
  const r = U.validate(D, HEAD + row({ value: 5 }) + row({ value: 6 }));
  assert.equal(r.errors[0].code, "dup_file");
  assert.equal(r.errors[0].p.row, 2);
});

test("readings already in the data are kept or replaced as chosen", () => {
  const text = HEAD + row({ year: 2025, site: "Shahpura lake ghat", festival: "Durga", phase: "during", value: 9.9, page: 65 });
  assert.equal(U.validate(D, text, { duplicates: "keep" }).rows.length, 0);
  assert.equal(U.validate(D, text, { duplicates: "keep" }).skipped.length, 1);
  const rep = U.validate(D, text, { duplicates: "replace" });
  assert.equal(rep.rows.length, 1);
  assert.ok(rep.rows[0].replaces);
  const before = D.scopes.durga.find((g) => g.id === "shahpura").total;
  const after = U.preview(D, rep.rows, "durga").find((g) => g.id === "shahpura").total;
  assert.notEqual(after, before);
});

test("file-level problems: missing columns, empty, too large", () => {
  assert.equal(U.validate(D, "year,festival\n2026,Durga\n").fatal.code, "columns");
  assert.equal(U.validate(D, "").fatal.code, "empty");
  assert.equal(U.validate(D, HEAD).fatal.code, "empty");
  assert.equal(U.validate(D, "x".repeat(U.LIMITS.bytes + 1)).fatal.code, "big");
});

test("added readings change the preview only for the right ghats; a ghat with no readings can gain history", () => {
  const rows = [row({ site: "Arch Bridge", value: 4 }), row({ site: "Arch Bridge", phase: "during", value: 1 }), row({ site: "Arch Bridge", parameter: "BOD", phase: "during", value: 12 })];
  const r = U.validate(D, HEAD + rows.join(""));
  const prev = U.preview(D, r.rows, "all");
  const arch = prev.find((g) => g.id === "arch-bridge");
  assert.ok(arch.has_history && arch.before_rank === null && arch.added === 3);
  assert.ok(arch.confidence < D.rules.confidence.limited_below);
  const bair = prev.find((g) => g.id === "bairagarh");
  assert.equal(bair.added, 0);
});

test("CSV reading and writing handle quotes, commas and Windows line endings", () => {
  assert.deepEqual(U.parseCSV('a,b\r\n"x, y","say ""hi"""\r\n1,2'), [["a", "b"], ["x, y", 'say "hi"'], ["1", "2"]]);
  const r = U.validate(D, HEAD + row({ value: 6.2 }));
  const csv = U.toCSV(r.rows.map((x) => x.out));
  const back = U.parseCSV(csv);
  assert.deepEqual(back[0], U.COLUMNS);
  assert.equal(back[1][U.COLUMNS.indexOf("site")], "Prempura ghat");
  assert.equal(U.validate(D, "﻿" + HEAD + row({ value: 6.2 })).rows.length, 1);
});

test("the upload code makes no network calls and keeps nothing", () => {
  for (const f of ["upload-core.js", "upload.js"]) {
    const js = fs.readFileSync(path.join(ROOT, "docs", f), "utf8");
    for (const bad of ["fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "localStorage", "sessionStorage", "indexedDB", "GW.ask", "api/gemini"]) {
      assert.ok(!js.includes(bad), `${f} contains ${bad}`);
    }
    assert.ok(!/https?:\/\//.test(js), f);
  }
});
