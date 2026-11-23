import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeQueueTimes, normalizeThemeParks, normalizeDpa, attachDpa, applyOfficialPrices } from "../sources.js";

test("Queue-Times のデータをエリアつきで共通の形に変換できる", () => {
  const result = normalizeQueueTimes({
    lands: [{ id: 1, name: "トゥモローランド", rides: [
      { id: 10, name: "スペース・マウンテン", is_open: true, wait_time: 70, last_updated: "2026-10-01T01:00:00Z" },
      { id: 11, name: "バズ", is_open: false, wait_time: 0, last_updated: "2026-10-01T01:00:00Z" },
    ] }],
    rides: [{ id: 20, name: "どこにも属さない", is_open: true, wait_time: 5 }],
  });
  const translated = normalizeQueueTimes({ lands: [{ name: "Fantasy Springs", rides: [{ id: 1, name: "Anna and Elsa's Frozen Journey", is_open: true, wait_time: 140 }] }] });
  assert.equal(translated[0].area, "ファンタジースプリングス"); // 英語のエリア名は日本語に
  assert.equal(translated[0].name, "アナとエルサのフローズンジャーニー"); // アトラクション名も日本語に
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], {
    id: "qt-10", name: "スペース・マウンテン", nameEn: "スペース・マウンテン", area: "トゥモローランド",
    status: "OPERATING", waitTime: 70, updatedAt: "2026-10-01T01:00:00Z",
  });
  assert.equal(result[1].status, "CLOSED");
  assert.equal(result[1].waitTime, null); // 休止中は 0 分ではなく「なし」
  assert.equal(result[2].area, "その他");
});

test("ThemeParks.wiki のデータからアトラクションだけを取り出せる", () => {
  const result = normalizeThemeParks({
    liveData: [
      { id: "a", name: "Indiana Jones Adventure®: Temple of the Crystal Skull", entityType: "ATTRACTION", status: "OPERATING", queue: { STANDBY: { waitTime: 55 } } },
      { id: "b", name: "レイジングスピリッツ", entityType: "ATTRACTION", status: "DOWN", queue: { STANDBY: { waitTime: null } } },
      { id: "c", name: "ショー", entityType: "SHOW", status: "OPERATING" },
    ],
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].waitTime, 55);
  assert.equal(result[0].name, "インディ・ジョーンズ・アドベンチャー：クリスタルスカルの魔宮"); // ® があっても一致する
  assert.equal(result[1].status, "DOWN");
  assert.equal(result[1].waitTime, null);
});

test("おかしなデータが来ても落ちずに空配列を返す", () => {
  assert.deepEqual(normalizeQueueTimes({}), []);
  assert.deepEqual(normalizeThemeParks({}), []);
});

test("DPA：販売中・販売終了を取り出し、データ元の金額と時間枠は使わない", () => {
  const dpa = normalizeDpa({
    liveData: [
      { id: "a", name: "Toy Story Mania!", queue: { PAID_RETURN_TIME: { state: "AVAILABLE", returnStart: null, returnEnd: null, price: { amount: 2000 } } } },
      { id: "b", name: "Peter Pan's Never Land Adventure", queue: { PAID_RETURN_TIME: { state: "AVAILABLE", price: { amount: null } } } },
      { id: "c", name: "Soaring: Fantastic Flight", queue: { PAID_RETURN_TIME: { state: "FINISHED", price: { amount: 2500 } } } },
      { id: "d", name: "Raging Spirits", queue: { PAID_RETURN_TIME: { state: "TEMP_FULL", price: { amount: 1500 } } } },
      { id: "e", name: "Aquatopia", queue: { STANDBY: { waitTime: 10 } } },
      { id: "f", name: "Turtle Talk", queue: { PAID_RETURN_TIME: { state: "AVAILABLE" } } },
    ],
  });
  assert.deepEqual(dpa.map((d) => [d.id, d.dpa]), [
    ["tpw-a", { state: "SELLING", price: null }], // データ元の金額（2000）は使わない（公式価格マスタだけで決める）
    ["tpw-b", { state: "SELLING", price: null }],
    ["tpw-c", { state: "FINISHED", price: null }],
    ["tpw-f", { state: "SELLING", price: null }], // price 自体がなくてもエラーにしない
  ]); // TEMP_FULL など知らない状態・DPA 対象外はバッジなし
  for (const d of dpa) assert.deepEqual(Object.keys(d.dpa), ["state", "price"]); // returnStart / returnEnd は持たない
});

test("DPA：一覧に残っている施設にだけ付き、除外済みの施設は復活しない", () => {
  const dpa = normalizeDpa({
    liveData: [
      { id: "x", name: "Toy Story Mania!", queue: { PAID_RETURN_TIME: { state: "AVAILABLE", price: { amount: 2000 } } } },
      { id: "y", name: "Haunted Mansion “Holiday Nightmare”", queue: { PAID_RETURN_TIME: { state: "FINISHED", price: { amount: null } } } },
      { id: "z", name: "Journey to the Center of the Earth", queue: { PAID_RETURN_TIME: { state: "AVAILABLE", price: { amount: 2000 } } } },
    ],
  });
  const list = [
    { id: "qt-1", name: "トイ・ストーリー・マニア！", nameEn: "Toy Story Mania!", waitTime: 120 },
    { id: "qt-2", name: "ホーンテッドマンション“ホリデーナイトメアー”", nameEn: "Haunted Mansion \"Holiday Nightmare\"", waitTime: 40 }, // 引用符の違いは無視
    { id: "qt-3", name: "海底2万マイル", nameEn: "20,000 Leagues Under the Sea", waitTime: 30 },
  ];
  const result = attachDpa(list, applyOfficialPrices("sea", dpa, { today: "2026-10-17" }));
  assert.equal(result.length, 3); // センター・オブ・ジ・アース（除外済み）は増えない
  assert.deepEqual(result[0].dpa, { state: "SELLING", price: 2000 });
  assert.deepEqual(result[1].dpa, { state: "FINISHED", price: null });
  assert.equal("dpa" in result[2], false); // DPA 対象外にはバッジなし
  assert.equal(result[0].waitTime, 120); // 待ち時間はそのまま
});

test("DPA が取れなくても待ち時間の一覧は返る", async () => {
  const { loadWaitTimes } = await import("../sources.js");
  const { rename } = await import("node:fs/promises");
  const file = new URL("../data/mock-dpa-sea.json", import.meta.url);
  const moved = new URL("../data/mock-dpa-sea.json.bak", import.meta.url);
  await rename(file, moved); // DPA のサンプルを一時的に消して「取得失敗」を再現
  try {
    const data = await loadWaitTimes("sea", { mock: true });
    assert.ok(data.attractions.length > 0);
    assert.equal(data.dpaAvailable, false);
    assert.ok(data.attractions.every((a) => !("dpa" in a)));
  } finally {
    await rename(moved, file);
  }
});

test("DPA：金額は公式価格マスタだけで決める（名前が一致して期間内の施設だけ）", () => {
  const paid = (id, name, amount = null) => ({ id, name, queue: { PAID_RETURN_TIME: { state: "AVAILABLE", price: { amount } } } });
  const land = normalizeDpa({ liveData: [
    paid("hm", "Haunted Mansion “Holiday Nightmare”"),
    paid("pooh", "Pooh's Hunny Hunt", 9999),
    paid("pf", "Peter Pan's Flight", 1200),
    paid("mi", "Monsters, Inc. Ride & Go Seek!", 1200),
  ] });
  const r = applyOfficialPrices("land", land, { today: "2026-10-17" });
  assert.equal(r[0].dpa.price, 1000); // ホーンテッドマンション（季節版の名前でも別名で一致）
  assert.equal(r[1].dpa.price, 1500); // データ元が違う金額でもマスタの金額
  assert.equal(r[2].dpa.price, null); // マスタにない施設は、データ元に金額があっても出さない
  assert.equal(r[3].dpa.price, 1000); // データ元の 1200 ではなくマスタの 1000
  assert.equal(applyOfficialPrices("land", land, { today: "2027-01-08" })[0].dpa.price, null); // ホーンテッドマンションの対象期間外

  const sea = normalizeDpa({ liveData: [
    paid("pp", "Peter Pan's Never Land Adventure"),
    paid("toy", "Toy Story Mania!"),
    paid("indy", "Indiana Jones Adventure®: Temple of the Crystal Skull"),
  ] });
  const s1 = applyOfficialPrices("sea", sea, { today: "2026-10-17" });
  assert.deepEqual(s1.map((d) => d.dpa.price), [2000, 2000, null]); // インディは 11/30 から
  assert.equal(applyOfficialPrices("sea", sea, { today: "2026-11-30" })[2].dpa.price, 1500);
  assert.equal(applyOfficialPrices("land", sea, { today: "2026-10-17" })[0].dpa.price, null); // 別のパークのマスタは使わない
  assert.equal(s1[0].dpa.state, "SELLING"); // 販売状況はデータ元のまま
});
