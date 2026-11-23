// シングルライダー対象のアトラクションに singleRider: true を付ける（data/single-rider.json）。
// 公開データ（ThemeParks.wiki など）には東京のシングルライダー情報がないので、対象施設を手で登録している。
// 「対象施設」という意味で、その時間に実施中かどうかは分からない。

import { readFile } from "node:fs/promises";
import { normalizeName } from "./exclusions.js";

const FILE = new URL("./data/single-rider.json", import.meta.url);
let table = null;

export function markSingleRider(attractions, entries = []) {
  const names = new Set(entries.flatMap((e) => [e.name, e.en].filter(Boolean).map(normalizeName)));
  return attractions.map((a) =>
    names.has(normalizeName(a.name)) || names.has(normalizeName(a.nameEn)) ? { ...a, singleRider: true } : a,
  );
}

export async function addSingleRider(park, attractions) {
  if (!table) table = JSON.parse(await readFile(FILE, "utf8"));
  return markSingleRider(attractions, table[park] ?? []);
}
