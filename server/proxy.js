/**
 * Мінімальний сервер для сайту M&D (Node 18+, без залежностей).
 *
 *  - віддає статичні файли сайту;
 *  - проксіює /api/*  →  MDS_CONNECT_URL/*  і додає секретний токен у заголовок.
 *    Таким чином токен MDs connect ніколи не потрапляє в браузер.
 *
 * Запуск:
 *   cp .env.example .env   # вписати URL і токен
 *   node server/proxy.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// --- простий .env loader ---
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORT = +process.env.PORT || 8080;
const UPSTREAM = (process.env.MDS_CONNECT_URL || "").replace(/\/$/, "");
const TOKEN = process.env.MDS_CONNECT_TOKEN || "";
const AUTH_HEADER = process.env.MDS_CONNECT_AUTH_HEADER || "Authorization"; // або напр. X-Api-Key
const AUTH_PREFIX = process.env.MDS_CONNECT_AUTH_PREFIX ?? "Bearer ";

// дозволені маршрути (щоб через проксі не можна було дістатись до інших методів MDs connect)
const ALLOWED = [
  ["GET", /^\/categories$/],
  ["GET", /^\/services$/],
  ["GET", /^\/masters$/],
  ["GET", /^\/availability\/days$/],
  ["GET", /^\/availability\/slots$/],
  ["POST", /^\/bookings$/],
];

// захист від спаму записами: не більше 5 POST за 10 хв з однієї IP
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json" };

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

async function proxy(req, res, url) {
  const sub = url.pathname.slice(4) || "/";
  if (!ALLOWED.some(([m, re]) => m === req.method && re.test(sub))) return sendJson(res, 404, { message: "Not found" });
  if (!UPSTREAM || !TOKEN) return sendJson(res, 503, { message: "Інтеграцію з MDs connect ще не налаштовано" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
  if (req.method === "POST" && rateLimited(ip)) return sendJson(res, 429, { message: "Забагато спроб. Спробуйте пізніше або зателефонуйте нам." });

  let body;
  if (req.method === "POST") {
    body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 10_000) return sendJson(res, 413, { message: "Too large" }); }
  }

  try {
    const upstream = await fetch(UPSTREAM + sub + url.search, {
      method: req.method,
      headers: { "Content-Type": "application/json", Accept: "application/json", [AUTH_HEADER]: AUTH_PREFIX + TOKEN },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" });
    res.end(text);
  } catch (e) {
    console.error("[mds-proxy]", e.message);
    sendJson(res, 502, { message: "Розклад тимчасово недоступний" });
  }
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  const parts = path.relative(ROOT, file).split(path.sep);
  // не віддаємо нічого поза сайтом, приховані файли (.env, .git) та службові папки
  if (parts[0] === ".." || parts.some((s) => s.startsWith(".")) || ["server", "docs"].includes(parts[0])) {
    res.writeHead(404); return res.end("Not found");
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) return proxy(req, res, url);
  serveStatic(req, res, url);
}).listen(PORT, () => {
  console.log(`M&D site: http://localhost:${PORT}`);
  console.log(UPSTREAM && TOKEN ? `MDs connect: ${UPSTREAM}` : "MDs connect не налаштовано (.env) — на сайті працює демо-режим (mode: \"mock\")");
});
