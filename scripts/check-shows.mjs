// ThemeParks.wiki に東京ディズニーシーのショー時間が入っているかの確認（アプリ本体は変更しない）。
//   使い方: node scripts/check-shows.mjs
// パークの営業中（日本時間の昼）に実行すると、その日のショー時間が載っているかが分かる。

import { normalizeThemeParksShows, normalizeCatalog } from "../shows.js";
import { todayJst } from "../hours.js";

const SEA = "https://api.themeparks.wiki/v1/entity/67b290d5-3478-4f23-b601-2f8fb71ba803";
const get = async (path) => (await fetch(`${SEA}${path}`)).json();

const date = todayJst();
const [children, live] = await Promise.all([get("/children"), get("/live")]);
const catalog = normalizeCatalog(children);
console.log(`ショーの一覧（${catalog.length}件）:`, catalog.map((c) => `${c.name}[${c.officialId}]`).join(" / "));

const shows = (live.liveData ?? []).filter((e) => e.entityType === "SHOW");
console.log(`live にある SHOW: ${shows.length}件 / showtimes が入っているもの: ${shows.filter((e) => e.showtimes?.length).length}件`);
const today = normalizeThemeParksShows(live, date);
console.log(`${date}（日本時間）の時間が取れたショー: ${today.length}件`);
for (const s of today) console.log(`  ${s.name}: ${s.times.map((t) => t.start + (t.end ? "-" + t.end : "")).join(" ")}`);
