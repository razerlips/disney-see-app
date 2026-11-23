// アプリを実際に起動して、実データで /api/waits が返ってくるか確認するスクリプト。
//   使い方: node scripts/smoke.mjs
//   予備への切り替え確認: SKIP_SOURCE=Queue-Times.com node scripts/smoke.mjs

import { spawn } from "node:child_process";
import { isExcluded } from "../exclusions.js";
import { normalizeDpa } from "../sources.js";

const PORT = 3210;
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT) }, stdio: "inherit" });

let failed = false;
try {
  await new Promise((ok) => setTimeout(ok, 1000));
  for (const park of ["land", "sea"]) {
    const res = await fetch(`http://localhost:${PORT}/api/waits?park=${park}`);
    const body = await res.json();
    const list = body.attractions ?? [];
    const open = list.filter((a) => a.status === "OPERATING");
    const withWait = open.filter((a) => a.waitTime != null);
    console.log(`${park}: HTTP ${res.status} データ元=${body.source?.name} 件数=${list.length} 運営中=${open.length} 待ち時間あり=${withWait.length}`);
    console.log("  例:", withWait.slice(0, 5).map((a) => `${a.name}（${a.area}）${a.waitTime}分`).join(" / "));
    const untranslated = list.filter((a) => a.nameEn && a.name === a.nameEn).map((a) => a.nameEn);
    console.log(`  日本語名なし（${untranslated.length}件）:`, JSON.stringify(untranslated));
    const leaked = list.filter((a) => isExcluded(park, a)).map((a) => a.name);
    console.log(`  除外リストの施設が混ざっていないか: ${leaked.length ? "❌ " + leaked.join(", ") : "✅ 0件"}`);
    // DPA バッジ（おまけ情報）。取れていなくても失敗にはしない
    const dpa = list.filter((a) => a.dpa);
    console.log(`  DPA: 取得=${body.dpaAvailable ? "OK" : "失敗（待ち時間はそのまま）"} バッジ ${dpa.length}件:`, dpa.map((a) => `${a.name}=${a.dpa.state}${a.dpa.price ? " ¥" + a.dpa.price : ""}`).join(" / "));
    console.log(`  シングルライダー: ${list.filter((a) => a.singleRider).map((a) => a.name).join(" / ") || "なし"}`);
    if (!res.ok || list.length === 0 || leaked.length) failed = true;
  }
  // DPA 対象施設が、一覧のどれかにバッジとして付いたか（付かないのは除外済みか名前の不一致）
  try {
  const dest = await (await fetch("https://api.themeparks.wiki/v1/destinations")).json();
  const tdr = dest.destinations.find((d) => /tokyo\s*disney/i.test(d.name));
  for (const [park, re] of [["land", /disneyland/i], ["sea", /disneysea/i]]) {
    const id = tdr.parks.find((p) => re.test(p.name)).id;
    const live = await (await fetch(`https://api.themeparks.wiki/v1/entity/${id}/live`)).json();
    const shown = (await (await fetch(`http://localhost:${PORT}/api/waits?park=${park}`)).json()).attractions ?? [];
    for (const d of normalizeDpa(live)) {
      const name = live.liveData.find((e) => `tpw-${e.id}` === d.id).name;
      const hit = shown.find((a) => a.dpa && (a.id === d.id || d.keys.has(a.name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))));
      const excluded = isExcluded(park, { id: d.id, name, nameEn: name });
      console.log(`  DPA照合 ${park} | ${name} | ${d.dpa.state} ${d.dpa.price ?? "価格なし"} | ${hit ? "✅ バッジ表示" : excluded ? "除外リスト（表示しない）" : "⚠️ 一覧と照合できず"}`);
    }
  }
  } catch (err) {
    console.log("  DPA照合: 確認できず（アプリの失敗ではない）", err.message);
  }

  const page = await fetch(`http://localhost:${PORT}/`);
  console.log(`画面: HTTP ${page.status}`);
  if (!page.ok) failed = true;
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  server.kill();
}
process.exit(failed ? 1 : 0);
