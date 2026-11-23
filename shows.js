// 東京ディズニーシーのショー時間の取得と整形を担当するファイル。
//
// ショー時間は 2 つの元から集めて、1 つの一覧にまとめる。
//   1. 手入力（data/show-times.json）… 公式サイト／公式アプリで目視確認した時間。こちらを優先する
//   2. ThemeParks.wiki の公開データ   … liveData の entityType: "SHOW" に showtimes が入っていれば使う
//      （東京のショーに時間が入るかはデータ元しだい。入っていなければ手入力だけで表示する）
//
// どちらにもない時間は出さない（推測・補完はしない）。
//
// アプリ側に返す形：
//   { date, fetchedAt, autoAvailable, officialUrl, catalog: [{ name, nameEn, officialId }], shows: [{ id, name, nameEn, area, note, source, times: [{ start: "10:15", end: "10:45" | null }] }] }
//   source は "manual"（手入力）か "auto"（ThemeParks.wiki）

import { readFile } from "node:fs/promises";
import { normalizeName } from "./exclusions.js";
import { todayJst } from "./hours.js";

const TPW = "https://api.themeparks.wiki/v1";
// ThemeParks.wiki の東京ディズニーシーの ID（/v1/destinations で確認済み。2026-11-23）
const SEA_ID = "67b290d5-3478-4f23-b601-2f8fb71ba803";
const TIMEOUT_MS = 8000;

// ショー名の「英語 → 日本語」対応表。自信を持って公式名と言えるものだけ載せる。
// 載っていないショーは英語名のまま出す（手入力の name で日本語にできる）。
const SHOW_NAMES = {
  "Believe! Sea of Dreams": "ビリーヴ！～シー・オブ・ドリームス～",
  "Duffy and Friends’ Wonderful Friendship": "ダッフィー＆フレンズのワンダフル・フレンドシップ",
};
const SHOW_INDEX = new Map(Object.entries(SHOW_NAMES).map(([en, ja]) => [normalizeName(en), ja]));
// "(Tokyo DisneySea)" のような付け足しは表示しない
const cleanEn = (name) => String(name ?? "").replace(/\s*\(Tokyo DisneySea\)\s*$/i, "").trim();
export const showNameJa = (en) => SHOW_INDEX.get(normalizeName(cleanEn(en))) ?? cleanEn(en);

// ---- 時刻のあつかい -----------------------------------------------------------

const JST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" });
const JST_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// ISO 形式の日時 → 日本時間の { date: "2026-11-24", time: "10:15" }。読めなければ null
export function toJst(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  return { date: JST_DATE.format(d), time: JST_TIME.format(d) };
}

// "9:05" や "09:05" → "09:05"。時刻として読めなければ null
export function normalizeTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? "").trim());
  if (!m || Number(m[1]) > 29 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

const byStart = (a, b) => a.start.localeCompare(b.start);

// ---- 1. ThemeParks.wiki ---------------------------------------------------------

// liveData のうち、その日（日本時間）の上演時間が入っているショーだけを取り出す
export function normalizeThemeParksShows(json, date) {
  return (json.liveData ?? [])
    .filter((e) => e.entityType === "SHOW")
    .map((e) => {
      const times = (e.showtimes ?? [])
        .map((s) => ({ start: toJst(s.startTime), end: toJst(s.endTime) }))
        .filter((s) => s.start?.date === date)
        .map((s) => ({ start: s.start.time, end: s.end?.date === date ? s.end.time : null }))
        .sort(byStart);
      return {
        id: `tpw-${e.id}`,
        name: showNameJa(e.name),
        nameEn: cleanEn(e.name),
        area: null,
        note: null,
        source: "auto",
        times,
      };
    })
    .filter((s) => s.times.length > 0);
}

async function fetchThemeParksShows(date) {
  const res = await fetch(`${TPW}/entity/${SEA_ID}/live`, {
    headers: { "User-Agent": "disney-see-app (personal use)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ThemeParks.wiki が ${res.status} を返しました`);
  return normalizeThemeParksShows(await res.json(), date);
}

// ショーの一覧（時間は入っていない）。画面の「時間を入力」で選べるようにするためだけに使う。
// externalId は公式サイトのショー個別ページの番号（/tds/show/detail/番号/。tdr-wait-app で 2026-10-01 に確認）
export function normalizeCatalog(json) {
  return (json.children ?? json.liveData ?? [])
    .filter((e) => e.entityType === "SHOW")
    .map((e) => ({ name: showNameJa(e.name), nameEn: cleanEn(e.name), officialId: e.externalId ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

let catalogCache = null; // { at, list }（ショーの一覧はめったに変わらないので 6 時間使い回す）
async function fetchCatalog() {
  if (catalogCache && Date.now() - catalogCache.at < 6 * 60 * 60 * 1000) return catalogCache.list;
  const res = await fetch(`${TPW}/entity/${SEA_ID}/children`, {
    headers: { "User-Agent": "disney-see-app (personal use)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ThemeParks.wiki が ${res.status} を返しました`);
  catalogCache = { at: Date.now(), list: normalizeCatalog(await res.json()) };
  return catalogCache.list;
}

// 公式サイトのその日のショースケジュール（リンクとして使うだけ。自動取得はしない）
export const officialScheduleUrl = (date) => `https://www.tokyodisneyresort.jp/tds/show.html#day=${date.replaceAll("-", "")}`;

// ---- 2. 手入力（data/show-times.json）-------------------------------------------

// times は "10:15" か { "start": "10:15", "end": "10:45" } のどちらの書き方でもよい
export function normalizeManualShows(entries = []) {
  return entries
    .map((e, i) => {
      const times = (e.times ?? [])
        .map((t) => (typeof t === "string" ? { start: t } : t ?? {}))
        .map((t) => ({ start: normalizeTime(t.start), end: normalizeTime(t.end) }))
        .filter((t) => t.start)
        .sort(byStart);
      return {
        id: `manual-${i}`,
        name: String(e.name ?? "").trim(),
        nameEn: e.en ?? null,
        aliases: e.aliases ?? [],
        area: e.area ?? null,
        note: e.note ?? null,
        source: "manual",
        times,
      };
    })
    .filter((s) => s.name && s.times.length > 0);
}

// ---- まとめ ---------------------------------------------------------------------

// 同じショーが両方にあれば手入力を使う（目で確かめた時間なので）。名前は日本語名・英語名・aliases で照合
export function mergeShows(manual, auto) {
  const keysOf = (s) => [s.name, s.nameEn, ...(s.aliases ?? [])].filter(Boolean).map(normalizeName);
  const taken = new Set(manual.flatMap(keysOf));
  const rest = auto.filter((s) => !keysOf(s).some((k) => taken.has(k)));
  return [...manual, ...rest]
    .map(({ aliases, ...s }) => s)
    .sort((a, b) => a.times[0].start.localeCompare(b.times[0].start) || a.name.localeCompare(b.name, "ja"));
}

const FILE = new URL("./data/show-times.json", import.meta.url);
// サンプルデータの日時は "MOCKDATE" と書いてあり、読み込むときにその日の日付に置き換える
const MOCK_FILE = new URL("./data/mock-shows-sea.json", import.meta.url);

// 日付は日本時間の今日。動作確認のときだけ環境変数 SHOWS_DATE=2026-11-24 で日付を変えられる
export async function loadShows({ mock = false, date = process.env.SHOWS_DATE || todayJst() } = {}) {
  const table = JSON.parse(await readFile(FILE, "utf8"));
  const manual = normalizeManualShows(table[date]?.sea ?? []);

  // 自動取得は「おまけ」：失敗しても手入力の分はそのまま出す
  let auto = [];
  let catalog = [];
  let autoAvailable = true;
  try {
    if (mock) {
      const json = JSON.parse((await readFile(MOCK_FILE, "utf8")).replaceAll("MOCKDATE", date));
      auto = normalizeThemeParksShows(json, date);
      catalog = normalizeCatalog(json);
    } else {
      [auto, catalog] = await Promise.all([fetchThemeParksShows(date), fetchCatalog().catch(() => [])]);
    }
  } catch (err) {
    console.error("[shows] ThemeParks.wiki の取得失敗（手入力の分だけ表示）:", err.message);
    autoAvailable = false;
  }

  return {
    date,
    fetchedAt: new Date().toISOString(),
    autoAvailable,
    officialUrl: officialScheduleUrl(date),
    catalog,
    shows: mergeShows(manual, auto),
  };
}
