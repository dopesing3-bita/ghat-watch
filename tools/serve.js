/* Local development server: serves docs/ like Vercel and routes /api/gemini to the same function.
   Usage:  GEMINI_API_KEY=... node tools/serve.js   (then open http://localhost:8787)
   Without GEMINI_API_KEY everything works except AI explanations. */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const gemini = require("../api/gemini.js");

const ROOT = path.join(__dirname, "..", "docs");
const PORT = +process.env.PORT || 8787;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".md": "text/plain; charset=utf-8" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/gemini") return gemini(req, res);
  const file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    res.end(buf);
  });
}).listen(PORT, () => console.log("Ghat Watch on http://localhost:" + PORT + (process.env.GEMINI_API_KEY ? " (AI on)" : " (AI off: GEMINI_API_KEY not set)")));
