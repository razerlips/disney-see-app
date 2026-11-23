// 訪問日の運営予定（data/operating-hours.json）の施設名が、実データの表示名と全部対応付くか確認する。
//   使い方: node scripts/check-hours.mjs
import { readFile } from "node:fs/promises";
import { loadWaitTimes } from "../sources.js";
import { addOperatingHours } from "../hours.js";
import { normalizeName } from "../exclusions.js";

const table = JSON.parse(await readFile(new URL("../data/operating-hours.json", import.meta.url), "utf8"));
let failed = false;
for (const [date, parks] of Object.entries(table).filter(([k]) => !k.startsWith("_"))) {
  for (const [park, entries] of Object.entries(parks)) {
    const { attractions } = await loadWaitTimes(park);
    const withHours = await addOperatingHours(park, attractions.map(({ hours, ...a }) => a), { date });
    const shown = withHours.filter((a) => a.hours);
    const names = new Set(attractions.map((a) => normalizeName(a.name)));
    const unmatched = entries.filter((e) => ![e.name, ...(e.aliases ?? [])].some((n) => names.has(normalizeName(n))));
    console.log(`${date} ${park}: 登録 ${entries.length} 件 / 一覧 ${attractions.length} 件中 ${shown.length} 件に表示 / 一覧にない登録 ${unmatched.length} 件 ${unmatched.map((e) => e.name).join(", ")}`);
    for (const a of withHours) console.log(`  ${a.hours ? (a.hours.differs ? "⚠" : "○") : "×"} ${a.name} ${a.hours ? `${a.hours.open}〜${a.hours.close}` : "（運営予定なし）"}`);
    if (unmatched.length) failed = true;
  }
}
process.exit(failed ? 1 : 0);
