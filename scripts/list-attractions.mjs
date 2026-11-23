// 実データの全施設を「ID・英語名・日本語名・エリア・状態」で一覧表示する。
// 除外リスト（exclusions.js）を ID で書くときの確認用。  使い方: node scripts/list-attractions.mjs

import { loadFromSource } from "../sources.js";
import { EXCLUDED, isExcluded, normalizeName } from "../exclusions.js";

for (const source of ["Queue-Times.com", "ThemeParks.wiki"]) {
  for (const park of ["land", "sea"]) {
    console.log(`\n=== ${source} / ${park} ===`);
    try {
      const list = await loadFromSource(source, park);
      for (const a of list) console.log([isExcluded(park, a) ? "除外" : "表示", a.id, a.nameEn, a.name, a.area, a.status].join(" | "));
      // 除外リストの各項目が、実データの ID と名前の両方で一致しているかを確認する
      const prefix = source === "Queue-Times.com" ? "qt-" : "tpw-";
      const problems = [];
      for (const e of EXCLUDED[park]) {
        const id = prefix + (source === "Queue-Times.com" ? e.qt : e.tpw);
        const hit = list.find((a) => a.id === id);
        if (!hit) problems.push(`ID が見つからない: ${e.ja} (${id})`);
        else if (normalizeName(hit.nameEn) !== normalizeName(e.en)) problems.push(`ID と名前が食い違う: ${e.ja} (${id}) → 実データは「${hit.nameEn}」`);
      }
      const excludedCount = list.filter((a) => isExcluded(park, a)).length;
      console.log(`→ 除外 ${excludedCount} 件 / 表示 ${list.length - excludedCount} 件（除外リスト ${EXCLUDED[park].length} 件）`);
      console.log(problems.length ? `⚠️ 除外リストの不一致 ${problems.length} 件:\n  ${problems.join("\n  ")}` : "✅ 除外リストは全件、実データの ID・名前と一致");
    } catch (err) {
      console.log("取得失敗:", err.message);
    }
  }
}
