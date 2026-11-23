// 待ち時間データの取得と整形を担当するファイル。
//
// 東京ディズニーリゾートには一般公開された公式 API がないため、
// 次の 2 つの公開データを使う（詳しくは README.md を参照）。
//   1. Queue-Times.com（メイン）… エリア情報つき。表示時にクレジット表記が必要。
//   2. ThemeParks.wiki（予備）  … メインが落ちたときに使う。エリア情報はない。
//
// どちらから取っても、アプリ側には同じ形のデータを返す：
//   { park, source, fetchedAt, attractions: [{ id, name, area, status, waitTime, updatedAt }] }
//   シングルライダー対象の施設には singleRider: true が付く（single-rider.js）
//   訪問日に登録した施設には hours: { open: "09:00", close: "21:00", differs } が付く（hours.js）
//   DPA 対象施設には dpa: { state: "SELLING"（販売中）| "FINISHED"（販売終了）, price: 円 | null } が付く（下の 4. を参照）
//   status は "OPERATING"（運営中） / "CLOSED"（休止・案内終了） / "DOWN"（一時運営中止） / "REFURBISHMENT"（休止中・改修）

import { readFile } from "node:fs/promises";
import { nameJa } from "./names-ja.js";
import { removeExcluded, normalizeName } from "./exclusions.js";
import { addOperatingHours } from "./hours.js";
import { addSingleRider } from "./single-rider.js";

export const PARKS = {
  land: { label: "東京ディズニーランド", queueTimesId: 274, themeParksName: /disneyland/i },
  sea: { label: "東京ディズニーシー", queueTimesId: 275, themeParksName: /disneysea/i },
};

const TIMEOUT_MS = 8000;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "tdr-wait-app (personal use)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} が ${res.status} を返しました`);
  return res.json();
}

// ---- 1. Queue-Times.com ----------------------------------------------------
// パーク ID は https://queue-times.com/parks.json で確認済み（274 = ランド、275 = シー）。
// エリア名は英語で返ってくるので、日本語に置き換える（知らない名前はそのまま表示）。

const AREA_JA = {
  "World Bazaar": "ワールドバザール",
  Adventureland: "アドベンチャーランド",
  Westernland: "ウエスタンランド",
  "Critter Country": "クリッターカントリー",
  Fantasyland: "ファンタジーランド",
  Toontown: "トゥーンタウン",
  Tomorrowland: "トゥモローランド",
  "Mediterranean Harbor": "メディテレーニアンハーバー",
  "American Waterfront": "アメリカンウォーターフロント",
  "Port Discovery": "ポートディスカバリー",
  "Lost River Delta": "ロストリバーデルタ",
  "Arabian Coast": "アラビアンコースト",
  "Mermaid Lagoon": "マーメイドラグーン",
  "Mysterious Island": "ミステリアスアイランド",
  "Fantasy Springs": "ファンタジースプリングス",
};

export function normalizeQueueTimes(json) {
  // lands: [{ name, rides: [...] }] と、エリアに属さない rides: [...] の 2 か所にアトラクションがある
  const rides = [
    ...(json.lands ?? []).flatMap((land) => (land.rides ?? []).map((r) => ({ ...r, area: AREA_JA[land.name] ?? land.name }))),
    ...(json.rides ?? []).map((r) => ({ ...r, area: "その他" })),
  ];
  return rides.map((r) => ({
    id: `qt-${r.id}`,
    name: nameJa(r.name),
    nameEn: r.name,
    area: r.area,
    status: r.is_open ? "OPERATING" : "CLOSED",
    waitTime: r.is_open && Number.isFinite(r.wait_time) ? r.wait_time : null,
    updatedAt: r.last_updated ?? null,
  }));
}

async function fromQueueTimes(park) {
  const json = await fetchJson(`https://queue-times.com/parks/${PARKS[park].queueTimesId}/queue_times.json`);
  const attractions = normalizeQueueTimes(json);
  if (attractions.length === 0) throw new Error("Queue-Times のデータが空でした");
  return attractions;
}

// ---- 2. ThemeParks.wiki ----------------------------------------------------

const TPW = "https://api.themeparks.wiki/v1";
let themeParksIds = null; // パークの ID は変わらないので一度調べたら覚えておく

async function themeParksParkId(park) {
  if (!themeParksIds) {
    const { destinations } = await fetchJson(`${TPW}/destinations`);
    const tdr = destinations.find((d) => /tokyo\s*disney/i.test(d.name));
    if (!tdr) throw new Error("ThemeParks.wiki に東京ディズニーリゾートが見つかりません");
    themeParksIds = {};
    for (const key of Object.keys(PARKS)) {
      themeParksIds[key] = tdr.parks.find((p) => PARKS[key].themeParksName.test(p.name))?.id;
    }
  }
  const id = themeParksIds[park];
  if (!id) throw new Error("ThemeParks.wiki でパークが見つかりません");
  return id;
}

export function normalizeThemeParks(json) {
  return (json.liveData ?? [])
    .filter((e) => e.entityType === "ATTRACTION")
    .map((e) => {
      const wait = e.queue?.STANDBY?.waitTime;
      return {
        id: `tpw-${e.id}`,
        name: nameJa(e.name),
        nameEn: e.name,
        area: "（エリア情報なし）",
        status: e.status ?? "CLOSED",
        waitTime: e.status === "OPERATING" && Number.isFinite(wait) ? wait : null,
        updatedAt: e.lastUpdated ?? null,
      };
    });
}

async function fromThemeParks(park) {
  const id = await themeParksParkId(park);
  const attractions = normalizeThemeParks(await fetchJson(`${TPW}/entity/${id}/live`));
  if (attractions.length === 0) throw new Error("ThemeParks.wiki のデータが空でした");
  return attractions;
}

// ---- 3. 動作確認用のサンプルデータ（MOCK=1 のときだけ使う）-----------------

async function fromMock(park) {
  const file = new URL(`./data/mock-${park}.json`, import.meta.url);
  return JSON.parse(await readFile(file, "utf8"));
}

// ---- 4. DPA（ディズニー・プレミアアクセス）の販売状況 -------------------
// 販売中／販売終了は ThemeParks.wiki の公開データ queue.PAID_RETURN_TIME.state で決める。
// 金額は下の公式価格マスタ（DPA_PRICE_MASTER）だけを使う（ThemeParks.wiki の price.amount は使わない）。
// 利用時間枠（returnStart / returnEnd）は東京では常に空なので使わない（README 参照）。
// DPA は「おまけ」の情報：取れなくても待ち時間の一覧はそのまま出す。

const DPA_STATE = { AVAILABLE: "SELLING", FINISHED: "FINISHED" }; // それ以外（TEMP_FULL など）はバッジを出さない

export function normalizeDpa(json) {
  return (json.liveData ?? []).flatMap((e) => {
    const paid = e.queue?.PAID_RETURN_TIME;
    const state = DPA_STATE[paid?.state];
    if (!state) return [];
    return [{
      id: `tpw-${e.id}`,
      keys: new Set([normalizeName(e.name), normalizeName(nameJa(e.name))]),
      dpa: { state, price: null }, // 金額は applyOfficialPrices で公式価格マスタから付ける
    }];
  });
}

// 一覧に残っている施設にだけ DPA 情報を付ける（除外した施設を復活させない）
export function attachDpa(attractions, dpaList) {
  return attractions.map((a) => {
    const names = [normalizeName(a.name), normalizeName(a.nameEn)].filter(Boolean);
    const hit = dpaList.find((d) => d.id === a.id || names.some((n) => d.keys.has(n)));
    return hit ? { ...a, dpa: hit.dpa } : a;
  });
}

const todayJst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());

// DPA の公式価格マスタ（公式「ディズニー・プレミアアクセス」ページ基準。利用者が確認して 2026-10-02 に登録）
// https://www.tokyodisneyresort.jp/tdr/guide/app_service/disneypremieraccess.html
// DPA の金額はこの表だけで決める（ThemeParks.wiki の金額は使わない）。表にない施設は金額なし（「DPA 販売中」だけ）。
// 販売中／販売終了かどうかは ThemeParks.wiki の情報だけで決めるので、ここに載っていても DPA 対象でない日はバッジは出ない。
// from / until（日本時間・その日を含む）があるものは、その期間だけ使う。
// 照合は ThemeParks.wiki の英語名か日本語名の完全一致（記号の違いは無視）。似た名前の別施設には使わない。
const DPA_PRICE_MASTER = {
  land: [
    { ja: "美女と野獣“魔法のものがたり”", en: "Enchanted Tale of Beauty and the Beast", price: 2500 },
    { ja: "ベイマックスのハッピーライド", en: "The Happy Ride with Baymax", price: 1500 },
    { ja: "スプラッシュ・マウンテン", en: "Splash Mountain", price: 1500 },
    { ja: "ビッグサンダー・マウンテン", en: "Big Thunder Mountain", price: 1500 },
    { ja: "プーさんのハニーハント", en: "Pooh's Hunny Hunt", price: 1500 },
    { ja: "モンスターズ・インク“ライド＆ゴーシーク！”", en: "Monsters, Inc. Ride & Go Seek!", price: 1000 },
    // 公式の対象期間は 2026-09-15〜2027-01-07。この期間のデータ上の名前は「Haunted Mansion “Holiday Nightmare”」
    { ja: "ホーンテッドマンション", en: "Haunted Mansion", aliases: ["Haunted Mansion “Holiday Nightmare”"], price: 1000, from: "2026-09-15", until: "2027-01-07" },
  ],
  sea: [
    { ja: "アナとエルサのフローズンジャーニー", en: "Anna and Elsa's Frozen Journey", price: 2500 },
    { ja: "ラプンツェルのランタンフェスティバル", en: "Rapunzel's Lantern Festival", price: 2000 },
    { ja: "ピーターパンのネバーランドアドベンチャー", en: "Peter Pan's Never Land Adventure", price: 2000 },
    { ja: "ソアリン：ファンタスティック・フライト", en: "Soaring: Fantastic Flight", price: 2500 },
    { ja: "トイ・ストーリー・マニア！", en: "Toy Story Mania!", price: 2000 },
    { ja: "タワー・オブ・テラー", en: "Tower of Terror", price: 1500 },
    { ja: "センター・オブ・ジ・アース", en: "Journey to the Center of the Earth", price: 2000 },
    { ja: "レイジングスピリッツ", en: "Raging Spirits", price: 1500 },
    // 公式の DPA 対象開始は 2026-11-30 から
    { ja: "インディ・ジョーンズ・アドベンチャー：クリスタルスカルの魔宮", en: "Indiana Jones Adventure: Temple of the Crystal Skull", price: 1500, from: "2026-11-30" },
  ],
};

export function applyOfficialPrices(park, dpaList, { master = DPA_PRICE_MASTER, today = todayJst() } = {}) {
  const active = (master[park] ?? []).filter((m) => (!m.from || m.from <= today) && (!m.until || today <= m.until));
  return dpaList.map((d) => {
    const hit = active.find((m) => [m.ja, m.en, ...(m.aliases ?? [])].some((n) => d.keys.has(normalizeName(n))));
    return { ...d, dpa: { ...d.dpa, price: hit?.price ?? null } };
  });
}

async function loadDpa(park, { mock }) {
  if (mock) {
    const file = new URL(`./data/mock-dpa-${park}.json`, import.meta.url);
    return applyOfficialPrices(park, normalizeDpa(JSON.parse(await readFile(file, "utf8"))));
  }
  const id = await themeParksParkId(park);
  return applyOfficialPrices(park, normalizeDpa(await fetchJson(`${TPW}/entity/${id}/live`)));
}

// ---- まとめ：上から順に試して、最初に成功したものを返す ------------------

const SOURCES = [
  { name: "Queue-Times.com", url: "https://queue-times.com/", load: fromQueueTimes },
  { name: "ThemeParks.wiki", url: "https://themeparks.wiki/", load: fromThemeParks },
];

// データ元を名前で指定して 1 つだけ読む（除外リストの確認スクリプト用）
export async function loadFromSource(sourceName, park) {
  const source = SOURCES.find((s) => s.name === sourceName);
  if (!source) throw new Error(`知らないデータ元: ${sourceName}`);
  return source.load(park);
}

export async function loadWaitTimes(park, { mock = false } = {}) {
  // SKIP_SOURCE=Queue-Times.com のように指定すると、そのデータ元を飛ばす（予備への切り替えを試すため）
  const skip = process.env.SKIP_SOURCE;
  const sources = mock ? [{ name: "サンプルデータ", url: null, load: fromMock }] : SOURCES.filter((s) => s.name !== skip);
  // DPA は待ち時間と並行して取りに行く。失敗しても null になるだけで、待ち時間の取得には影響しない
  const dpaPromise = loadDpa(park, { mock }).catch((err) => {
    console.error(`[${park}] DPA の取得失敗（待ち時間はそのまま表示）:`, err.message);
    return null;
  });
  const errors = [];
  for (const source of sources) {
    try {
      // 自分が行かない施設（exclusions.js）はここで取り除く。画面のどの表示にも出なくなる
      const attractions = await addSingleRider(park, await addOperatingHours(park, removeExcluded(park, await source.load(park))));
      const dpa = await dpaPromise;
      return {
        park,
        source: { name: source.name, url: source.url },
        fetchedAt: new Date().toISOString(),
        dpaAvailable: dpa !== null,
        attractions: dpa ? attachDpa(attractions, dpa) : attractions,
      };
    } catch (err) {
      errors.push(`${source.name}: ${err.message}`);
    }
  }
  throw new Error(errors.join(" / "));
}
