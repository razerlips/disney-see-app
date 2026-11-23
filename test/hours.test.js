import { test } from "node:test";
import assert from "node:assert/strict";
import { addOperatingHours, attachHours } from "../hours.js";

// 2026-10-02 時点で実際にアプリに表示されている施設名（Actions の実データ確認より）
const LAND = ["ジャングルクルーズ：ワイルドライフ・エクスペディション", "カリブの海賊", "ウエスタンリバー鉄道", "イッツ・ア・スモールワールド", "美女と野獣“魔法のものがたり”", "ホーンテッドマンション“ホリデーナイトメアー”", "ミッキーのフィルハーマジック", "ピーターパン空の旅", "ピノキオの冒険旅行", "プーさんのハニーハント", "白雪姫と七人のこびと", "モンスターズ・インク“ライド＆ゴーシーク！”", "蒸気船マークトウェイン号"];
const SEA = ["ディズニーシー・エレクトリックレールウェイ（アメリカンウォーターフロント）", "ディズニーシー・トランジットスチーマーライン（アメリカンウォーターフロント）", "トイ・ストーリー・マニア！", "タートル・トーク", "シンドバッド・ストーリーブック・ヴォヤッジ", "マジックランプシアター", "アナとエルサのフローズンジャーニー", "フェアリー・ティンカーベルのビジーバギー", "ピーターパンのネバーランドアドベンチャー", "ラプンツェルのランタンフェスティバル", "ディズニーシー・トランジットスチーマーライン（ロストリバーデルタ）", "ソアリン：ファンタスティック・フライト", "海底2万マイル", "ディズニーシー・エレクトリックレールウェイ（ポートディスカバリー）"];
const toList = (names) => names.map((name, i) => ({ id: `x${i}`, name, status: i % 2 ? "CLOSED" : "OPERATING", waitTime: i }));
const byName = (list) => Object.fromEntries(list.map((a) => [a.name, a.hours && `${a.hours.open}-${a.hours.close}${a.hours.differs ? "!" : ""}`]));

test("10/17 シー：表示中の 14 施設すべてに運営予定が付き、通常と違う 2 施設に印が付く", async () => {
  const r = byName(await addOperatingHours("sea", toList(SEA), { date: "2026-10-17" }));
  assert.equal(Object.values(r).filter(Boolean).length, 14);
  assert.equal(r["マジックランプシアター"], "10:00-20:35!");
  assert.equal(r["ディズニーシー・トランジットスチーマーライン（アメリカンウォーターフロント）"], "09:00-20:45!");
  assert.equal(r["ディズニーシー・トランジットスチーマーライン（ロストリバーデルタ）"], "09:00-21:00"); // 同じ名前の別乗り場は通常
  assert.equal(r["ソアリン：ファンタスティック・フライト"], "09:00-21:00");
  assert.equal(r["ヴェネツィアン・ゴンドラ"], undefined); // 除外リストに入れたので登録もなし
  assert.equal(Object.values(r).filter((v) => v?.endsWith("!")).length, 2);
});

test("10/18 ランド：表示中の 13 施設すべてに付き、ホーンテッドマンションの名前の違いも吸収する", async () => {
  const r = byName(await addOperatingHours("land", toList(LAND), { date: "2026-10-18" }));
  assert.equal(Object.values(r).filter(Boolean).length, 13);
  assert.equal(r["ウエスタンリバー鉄道"], "09:30-19:30!");
  assert.equal(r["蒸気船マークトウェイン号"], "10:00-19:25!");
  assert.equal(r["ホーンテッドマンション“ホリデーナイトメアー”"], "09:00-21:00"); // 公式の「ホーンテッドマンション」と同じ施設
  assert.equal(r["ピーターパン空の旅"], "09:00-21:00");
  assert.equal(Object.values(r).filter((v) => v?.endsWith("!")).length, 2);
});

test("登録した日・パーク以外では何も付けない（推測しない）", async () => {
  for (const [park, names, date] of [["sea", SEA, "2026-10-18"], ["land", LAND, "2026-10-17"], ["sea", SEA, "2026-10-16"], ["land", LAND, "2026-10-19"], ["land", LAND, "2026-10-02"]]) {
    const list = await addOperatingHours(park, toList(names), { date });
    assert.ok(list.every((a) => !("hours" in a)), `${park} ${date}`);
  }
});

test("運営予定はリアルタイムの状態・待ち時間を変えない。名前が違う施設には付かない", async () => {
  const list = toList(LAND);
  const result = await addOperatingHours("land", list, { date: "2026-10-18" });
  assert.deepEqual(result.map(({ hours, ...a }) => a), list); // hours 以外はそのまま
  const other = attachHours([{ name: "ホーンテッドマンション“ほかの名前”" }, { name: "ピーターパン" }], [{ name: "ピーターパン空の旅", open: "09:00", close: "21:00" }]);
  assert.ok(other.every((a) => !("hours" in a)));
});
