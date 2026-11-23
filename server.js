// アプリ本体のサーバー。追加ライブラリなし（Node.js だけ）で動く。
//   - public/ フォルダの HTML・CSS・JS をブラウザに返す
//   - /api/waits?park=land（または sea）で待ち時間データを返す
//   - /api/shows で東京ディズニーシーの今日のショー時間を返す（shows.js）
//
// ブラウザから直接 Queue-Times などを呼ばないのは、
// 他サイトへのアクセスがブラウザのセキュリティ（CORS）で止められるため。
// サーバーが代わりに取りに行き、5 分間は結果を使い回して相手サイトに負担をかけないようにしている。

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { PARKS, loadWaitTimes } from "./sources.js";
import { loadShows } from "./shows.js";
import { todayJst } from "./hours.js";

const PORT = Number(process.env.PORT) || 3000;
const MOCK = process.env.MOCK === "1";
const CACHE_MS = 5 * 60 * 1000;
const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

const cache = new Map(); // park -> { at, data }

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function handleApi(url, res) {
  const park = url.searchParams.get("park");
  if (!PARKS[park]) return sendJson(res, 400, { error: "park には land か sea を指定してください" });

  const hit = cache.get(park);
  if (hit && Date.now() - hit.at < CACHE_MS) return sendJson(res, 200, hit.data);

  try {
    const data = await loadWaitTimes(park, { mock: MOCK });
    cache.set(park, { at: Date.now(), data });
    sendJson(res, 200, data);
  } catch (err) {
    console.error(`[${park}] 取得失敗:`, err.message);
    // 前回取れたデータがあれば、古いと分かる印をつけて返す（何も出ないよりは役に立つ）
    if (hit) return sendJson(res, 200, { ...hit.data, stale: true });
    sendJson(res, 502, { error: "待ち時間データを取得できませんでした", detail: err.message });
  }
}

// ショー時間。待ち時間と同じく 5 分間は使い回す（日付が変わったら取り直す）
let showCache = null; // { at, data }
async function handleShows(url, res) {
  if (showCache && Date.now() - showCache.at < CACHE_MS && showCache.data.date === (process.env.SHOWS_DATE || todayJst())) {
    return sendJson(res, 200, showCache.data);
  }
  try {
    const data = await loadShows({ mock: MOCK });
    showCache = { at: Date.now(), data };
    sendJson(res, 200, data);
  } catch (err) {
    console.error("[shows] 取得失敗:", err.message);
    sendJson(res, 500, { error: "ショー時間を読み込めませんでした", detail: err.message });
  }
}

async function handleStatic(url, res) {
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = normalize(join(PUBLIC_DIR, path));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("見つかりません");
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const handler = url.pathname === "/api/waits" ? handleApi : url.pathname === "/api/shows" ? handleShows : handleStatic;
  handler(url, res).catch((err) => {
    // 想定外のエラーでもサーバーは止めない
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: "サーバーでエラーが起きました" });
  });
});

server.listen(PORT, () => {
  console.log(`起動しました 👉 http://localhost:${PORT}${MOCK ? "  （サンプルデータモード）" : ""}`);
});
