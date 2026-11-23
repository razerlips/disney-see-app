// 待ち時間 API 候補の疎通テスト。
// 各候補にランド・シーそれぞれ複数回リクエストして、
// つながるか・速さ・取れる項目（待ち時間／運営状況／エリア）・データの新しさを表にする。
//   使い方: node scripts/check-apis.mjs   （GitHub Actions の「API check」からも実行される）

const ROUNDS = Number(process.env.ROUNDS) || 3;
const DUMP = process.env.DUMP === "1"; // 1 にすると生データの先頭も表示する

async function get(url, headers = {}) {
  const started = performance.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": "tdr-wait-app api-check", ...headers }, signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, ms: Math.round(performance.now() - started), json, text, cors: res.headers.get("access-control-allow-origin") };
  } catch (err) {
    return { status: 0, ms: Math.round(performance.now() - started), error: err.cause?.code ?? err.message };
  }
}

const minutesAgo = (iso) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : null);

// 各候補：パークごとの URL を決める setup（一度だけ）と、レスポンスを共通の形に変える parse
const CANDIDATES = [
  {
    name: "Queue-Times.com",
    async setup() {
      const r = await get("https://queue-times.com/parks.json");
      const parks = (r.json ?? []).flatMap((g) => g.parks.map((p) => ({ ...p, group: g.name })));
      const tokyo = parks.filter((p) => /tokyo/i.test(p.name));
      console.log("  parks.json の東京パーク:", JSON.stringify(tokyo.map(({ id, name, group, timezone }) => ({ id, name, group, timezone }))));
      const find = (re) => tokyo.find((p) => re.test(p.name))?.id;
      return { land: find(/disneyland/i), sea: find(/disneysea/i) };
    },
    url: (ids, park) => `https://queue-times.com/parks/${ids[park]}/queue_times.json`,
    parse(json) {
      const rides = [...(json.lands ?? []).flatMap((l) => l.rides.map((r) => ({ ...r, area: l.name }))), ...(json.rides ?? [])];
      return rides.map((r) => ({ name: r.name, area: r.area, open: r.is_open, wait: r.wait_time, updated: r.last_updated }));
    },
  },
  {
    name: "ThemeParks.wiki",
    async setup() {
      const r = await get("https://api.themeparks.wiki/v1/destinations");
      const tdr = (r.json?.destinations ?? []).find((d) => /tokyo\s*disney/i.test(d.name));
      console.log("  destinations の東京:", JSON.stringify(tdr ? { id: tdr.id, name: tdr.name, slug: tdr.slug } : null), `HTTP ${r.status}`);
      const parks = tdr?.parks ?? [];
      console.log("  tokyodisneyresort のパーク:", JSON.stringify(parks.map(({ id, name, slug }) => ({ id, name, slug }))));
      const find = (re) => parks.find((p) => re.test(p.name))?.id;
      return { land: find(/disneyland/i), sea: find(/disneysea/i) };
    },
    url: (ids, park) => `https://api.themeparks.wiki/v1/entity/${ids[park]}/live`,
    parse(json) {
      return (json.liveData ?? []).filter((e) => e.entityType === "ATTRACTION").map((e) => ({
        name: e.name, area: null, open: e.status === "OPERATING", status: e.status, wait: e.queue?.STANDBY?.waitTime, updated: e.lastUpdated,
      }));
    },
  },
  {
    name: "RopeDrop Planner",
    async setup() { return { land: "tokyo_disneyland", sea: "tokyo_disneysea" }; },
    url: (ids, park) => `https://ropedropplanner.com/api/parks/wait-times?park_id=${ids[park]}`,
    parse(json) {
      // 形がドキュメント未確認なので、配列っぽいものを探して主要な項目を拾う
      const arr = Array.isArray(json) ? json : json.rides ?? json.attractions ?? json.data ?? json.wait_times ?? [];
      return (Array.isArray(arr) ? arr : []).map((r) => ({
        name: r.name ?? r.ride_name, area: r.land ?? r.area ?? null, status: r.status,
        open: r.is_open ?? (r.status ? /operat|open/i.test(r.status) : undefined),
        wait: r.wait_time ?? r.standby_wait ?? r.wait ?? r.posted_wait, updated: r.last_updated ?? r.updated_at ?? r.timestamp,
      }));
    },
  },
];

const results = [];
for (const c of CANDIDATES) {
  console.log(`\n=== ${c.name} ===`);
  let ids;
  try { ids = await c.setup(); } catch (e) { ids = {}; console.log("  setup 失敗:", e.message); }
  for (const park of ["land", "sea"]) {
    const row = { candidate: c.name, park, ok: 0, rounds: ROUNDS, ms: [], count: 0, withWait: 0, operating: 0, hasArea: false, maxAgeMin: null, cors: null, sample: "" };
    if (!ids[park]) { console.log(`  ${park}: パーク ID が見つからない`); results.push(row); continue; }
    for (let i = 0; i < ROUNDS; i++) {
      const r = await get(c.url(ids, park));
      row.ms.push(r.ms);
      row.cors = r.cors;
      const items = r.json ? c.parse(r.json) : [];
      console.log(`  ${park} #${i + 1}: HTTP ${r.status}${r.error ? " " + r.error : ""} ${r.ms}ms 件数=${items.length}`);
      if (r.status === 200 && items.length > 0) {
        row.ok++;
        row.count = items.length;
        row.withWait = items.filter((x) => Number.isFinite(x.wait) && x.open).length;
        row.operating = items.filter((x) => x.open).length;
        row.hasArea = items.some((x) => x.area);
        const ages = items.map((x) => minutesAgo(x.updated)).filter((x) => x != null);
        row.maxAgeMin = ages.length ? Math.min(...ages) : null;
        row.sample = items.slice(0, 4).map((x) => `${x.name}[${x.area ?? "-"}|${x.status ?? (x.open ? "open" : "closed")}|${x.wait ?? "-"}]`).join(", ");
      }
      if (DUMP && r.status === 200 && !row.dumped) {
        row.dumped = true;
        console.log("  raw:", (r.text ?? "").slice(0, 1500));
      }
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    results.push(row);
  }
}

const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : "-");
console.log("\n=== まとめ ===");
console.log("候補 | パーク | 成功 | 平均ms | 件数 | 運営中 | 待ち時間あり | エリア | 最新更新(分前) | CORS");
for (const r of results) {
  console.log([r.candidate, r.park, `${r.ok}/${r.rounds}`, avg(r.ms), r.count, r.operating, r.withWait, r.hasArea ? "○" : "×", r.maxAgeMin ?? "-", r.cors ?? "なし"].join(" | "));
}
console.log("\n=== サンプル ===");
for (const r of results) console.log(`${r.candidate} ${r.park}: ${r.sample}`);
