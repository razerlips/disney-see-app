// 訪問日の運営予定時間（data/operating-hours.json）をアトラクションに付ける。
// 公式サイトで目視確認して手で登録した「予定」なので、リアルタイムの運営状況（status）は上書きしない。
// 登録した日付・パーク以外では何も付けない（推測・補完はしない）。

import { readFile } from "node:fs/promises";
import { normalizeName } from "./exclusions.js";

const FILE = new URL("./data/operating-hours.json", import.meta.url);
let table = null;

export const todayJst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());

async function loadTable() {
  if (!table) table = JSON.parse(await readFile(FILE, "utf8"));
  return table;
}

// その日・そのパークでいちばん多い運営時間（＝その日の「通常」）。これと違う施設に differs を付ける
function usualHours(entries) {
  const count = new Map();
  for (const e of entries) count.set(`${e.open}-${e.close}`, (count.get(`${e.open}-${e.close}`) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function attachHours(attractions, entries = []) {
  if (!entries.length) return attractions;
  const usual = usualHours(entries);
  return attractions.map((a) => {
    const name = normalizeName(a.name);
    const hit = entries.find((e) => [e.name, ...(e.aliases ?? [])].some((n) => normalizeName(n) === name));
    if (!hit) return a;
    return { ...a, hours: { open: hit.open, close: hit.close, differs: `${hit.open}-${hit.close}` !== usual } };
  });
}

// 日付は日本時間の今日。動作確認のときだけ環境変数 HOURS_DATE=2026-10-17 で日付を変えられる
export async function addOperatingHours(park, attractions, { date = process.env.HOURS_DATE || todayJst() } = {}) {
  const entries = (await loadTable())[date]?.[park] ?? [];
  return attachHours(attractions, entries);
}
