// DPA（ディズニー・プレミアアクセス）のリアルタイム情報が、今使っている API から取れるかを調べるスクリプト。
// アプリ本体には影響しない。  使い方: node scripts/check-dpa.mjs

const get = async (url) => {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "tdr-wait-app dpa-check" }, signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  } catch (err) {
    return { status: 0, error: err.message };
  }
};

// ---- Queue-Times：どんな項目があるか ----
console.log("=== Queue-Times.com ===");
for (const id of [274, 275]) {
  const r = await get(`https://queue-times.com/parks/${id}/queue_times.json`);
  const ride = r.json?.lands?.[0]?.rides?.[0];
  console.log(`park ${id}: HTTP ${r.status} アトラクションの項目 =`, ride ? Object.keys(ride) : r.error);
}

// ---- ThemeParks.wiki：queue の種類を全部数える ----
console.log("\n=== ThemeParks.wiki ===");
const dest = await get("https://api.themeparks.wiki/v1/destinations");
const tdr = dest.json?.destinations?.find((d) => /tokyo\s*disney/i.test(d.name));
for (const park of tdr?.parks ?? []) {
  const r = await get(`https://api.themeparks.wiki/v1/entity/${park.id}/live`);
  const live = r.json?.liveData ?? [];
  const types = {};
  for (const e of live) for (const t of Object.keys(e.queue ?? {})) types[t] = (types[t] ?? 0) + 1;
  console.log(`\n${park.name}: HTTP ${r.status} 件数=${live.length} queue の種類 =`, JSON.stringify(types));
  const special = live.filter((e) => Object.keys(e.queue ?? {}).some((t) => t !== "STANDBY"));
  for (const e of special) console.log(`  ${e.name} [${e.status}] ${JSON.stringify(e.queue)}`);
  const other = new Set(live.flatMap((e) => Object.keys(e)));
  console.log("  liveData の項目 =", [...other].join(", "));
}

// ---- RopeDrop Planner：東京向けのパーク指定を探す ----
console.log("\n=== RopeDrop Planner ===");
for (const slug of ["tokyo_disneyland", "tdl", "TDL", "tokyo-disneyland", "tokyodisneyland"]) {
  const r = await get(`https://ropedropplanner.com/api/parks/wait-times?park_id=${slug}`);
  const items = r.json && typeof r.json === "object" ? Object.values(r.json) : [];
  const parks = [...new Set(items.map((x) => x?.park))];
  console.log(`park_id=${slug}: HTTP ${r.status}${r.error ? " " + r.error : ""} 件数=${items.length} park=${JSON.stringify(parks)}`);
  const tokyo = items.filter((x) => /tokyo|tdl|tds/i.test(String(x?.park)));
  for (const x of tokyo.slice(0, 5)) console.log(`  ${x.name} LL=${JSON.stringify(x.lightning_lane)} status=${x.status}`);
}

// ---- 追加調査（2026-10-02）：DPA の時間枠（returnStart / returnEnd）がどこかに入っていないか ----
console.log("\n=== 追加調査：DPA の時間枠 ===");
for (const park of tdr?.parks ?? []) {
  const r = await get(`https://api.themeparks.wiki/v1/entity/${park.id}/live`);
  const live = r.json?.liveData ?? [];
  const paid = live.filter((e) => e.queue?.PAID_RETURN_TIME);
  const states = {};
  for (const e of paid) states[e.queue.PAID_RETURN_TIME.state] = (states[e.queue.PAID_RETURN_TIME.state] ?? 0) + 1;
  const withWindow = paid.filter((e) => e.queue.PAID_RETURN_TIME.returnStart || e.queue.PAID_RETURN_TIME.returnEnd);
  const rt = live.filter((e) => e.queue?.RETURN_TIME);
  console.log(`${park.name}: DPA ${paid.length} 件 / state 内訳 ${JSON.stringify(states)} / 時間枠あり ${withWindow.length} 件 / RETURN_TIME（無料のパス）${rt.length} 件`);
  console.log(`  PAID_RETURN_TIME の項目 = ${[...new Set(paid.flatMap((e) => Object.keys(e.queue.PAID_RETURN_TIME)))].join(", ")}`);
  // liveData のうち queue 以外に時刻が入りそうな項目（showtimes / operatingHours など）があるか
  const extra = live.filter((e) => Object.keys(e).some((k) => !["id", "name", "entityType", "parkId", "externalId", "queue", "status", "lastUpdated"].includes(k)));
  console.log(`  queue 以外の追加項目がある施設 ${extra.length} 件 ${extra.slice(0, 3).map((e) => `${e.name}:${Object.keys(e).join("/")}`).join(" | ")}`);
  const ch = await get(`https://api.themeparks.wiki/v1/entity/${park.id}/children`);
  const kinds = {};
  for (const c of ch.json?.children ?? []) kinds[c.entityType] = (kinds[c.entityType] ?? 0) + 1;
  console.log(`  children の entityType 内訳 = ${JSON.stringify(kinds)}`);
  const sc = await get(`https://api.themeparks.wiki/v1/entity/${park.id}/schedule`);
  const stypes = {};
  for (const s of sc.json?.schedule ?? []) stypes[s.type] = (stypes[s.type] ?? 0) + 1;
  const purchases = (sc.json?.schedule ?? []).flatMap((s) => s.purchases ?? []);
  console.log(`  schedule の type 内訳 = ${JSON.stringify(stypes)} / purchases ${purchases.length} 件 ${JSON.stringify(purchases.slice(0, 2))}`);
}

// 比較：ほかのパークでは returnStart / returnEnd が入っているか（項目の意味の確認用）
console.log("\n=== 比較：ほかのリゾートの PAID_RETURN_TIME ===");
for (const name of [/walt disney world/i, /disneyland resort/i]) {
  const d = dest.json?.destinations?.find((x) => name.test(x.name));
  const p = d?.parks?.[0];
  if (!p) continue;
  const r = await get(`https://api.themeparks.wiki/v1/entity/${p.id}/live`);
  const paid = (r.json?.liveData ?? []).filter((e) => e.queue?.PAID_RETURN_TIME);
  const filled = paid.filter((e) => e.queue.PAID_RETURN_TIME.returnStart);
  console.log(`${p.name}: DPA相当 ${paid.length} 件 / 時間枠あり ${filled.length} 件`);
  for (const e of filled.slice(0, 2)) console.log(`  例 ${e.name} ${JSON.stringify(e.queue.PAID_RETURN_TIME)}`);
}

// ---- アプリの DPA バッジ用データの確認（2026-10-02 追加）----
// 30 秒おきに 6 回、ThemeParks.wiki の生の価格と、アプリが返す価格（同じ日に取れた価格で補ったもの）を並べる
console.log("\n=== アプリの DPA 価格（生データ → アプリ表示）===");
const { loadWaitTimes } = await import("../sources.js");
for (let round = 1; round <= 6; round++) {
  for (const [park, re] of [["land", /disneyland/i], ["sea", /disneysea/i]]) {
    const p = tdr.parks.find((x) => re.test(x.name));
    const raw = (await get(`https://api.themeparks.wiki/v1/entity/${p.id}/live`)).json?.liveData ?? [];
    const data = await loadWaitTimes(park);
    const rows = data.attractions.filter((a) => a.dpa).map((a) => {
      const badge = a.dpa.state === "SELLING" ? `DPA 販売中${a.dpa.price ? " ¥" + a.dpa.price.toLocaleString("ja-JP") : ""}` : "DPA 販売終了";
      return `${a.name}：${badge}`;
    });
    const rawSelling = raw.filter((e) => e.queue?.PAID_RETURN_TIME?.state === "AVAILABLE").map((e) => `${e.name}=${e.queue.PAID_RETURN_TIME.price?.amount ?? "null"}`);
    console.log(`#${round} ${new Date().toISOString().slice(11, 19)}Z ${park}\n  生データ（販売中）: ${rawSelling.join(" / ")}\n  アプリ表示: ${rows.join(" / ")}`);
  }
  if (round < 6) await new Promise((ok) => setTimeout(ok, 30000));
}
