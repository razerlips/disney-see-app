import { test } from "node:test";
import assert from "node:assert/strict";
import { EXCLUDED, isExcluded, removeExcluded } from "../exclusions.js";

const a = (id, nameEn, name, status = "OPERATING") => ({ id, nameEn, name, status });

test("除外リストの件数（ランド 24・シー 21）", () => {
  assert.equal(EXCLUDED.land.length, 24);
  assert.equal(EXCLUDED.sea.length, 21);
});

test("ID で除外できる（Queue-Times と ThemeParks.wiki の両方）", () => {
  assert.ok(isExcluded("land", a("qt-8007", "x", "x")));
  assert.ok(isExcluded("land", a("tpw-cfaa7d1c-111e-49b9-b21b-134eac4000e8", "x", "x")));
  assert.ok(isExcluded("sea", a("qt-17809", "x", "x")));
});

test("ID が違っても名前の表記揺れを吸収して除外できる", () => {
  assert.ok(isExcluded("land", a("qt-1", "The Enchanted Tiki Room: Stitch Presents “Aloha E Komo Mai!”", "")));
  assert.ok(isExcluded("sea", a("qt-1", "Jasmine’s Flying Carpets", ""))); // 引用符の違い
  assert.ok(isExcluded("land", a("mock-1", "", "グーフィーのペイント&プレイハウス"))); // 半角 &
  assert.ok(isExcluded("land", a("mock-2", "", "スティッチ エンカウンター"))); // 中黒なし
});

test("インディ・ジョーンズは一覧に出す（11 月下旬の再開に合わせて除外リストから外した）", () => {
  assert.ok(!isExcluded("sea", a("qt-8027", "Indiana Jones Adventure®: Temple of the Crystal Skull", "")));
  assert.ok(!isExcluded("sea", a("tpw-f66e072d-8bab-48e5-b8cf-6d1947bd291b", "x", "インディ・ジョーンズ・アドベンチャー：クリスタルスカルの魔宮")));
});

test("似た名前の別施設は除外しない", () => {
  const kept = [
    a("qt-8032", "DisneySea Transit Steamer Line (American Waterfront)", "ディズニーシー・トランジットスチーマーライン（アメリカンウォーターフロント）"),
    a("qt-8033", "DisneySea Transit Steamer Line (Lost River Delta)", "ディズニーシー・トランジットスチーマーライン（ロストリバーデルタ）"),
    a("qt-8036", "DisneySea Electric Railway (American Waterfront)", "ディズニーシー・エレクトリックレールウェイ（アメリカンウォーターフロント）"),
  ];
  for (const x of kept) assert.equal(isExcluded("sea", x), false, x.name);
  assert.equal(isExcluded("land", a("qt-8005", "Haunted Mansion “Holiday Nightmare”", "ホーンテッドマンション“ホリデーナイトメアー”")), false);
});

test("追加した 4 施設（スター・ツアーズ／ビッグサンダー／スプラッシュ／レオナルドチャレンジ）を除外できる", () => {
  assert.ok(isExcluded("land", a("qt-8015", "Star Tours: The Adventures Continue", "スター・ツアーズ：ザ・アドベンチャーズ・コンティニュー")));
  assert.ok(isExcluded("land", a("tpw-e3577b4a-f1d9-4ec5-aacf-b99977ea88c9", "x", "x")));
  assert.ok(isExcluded("land", a("x", "", "スプラッシュ マウンテン")));
  assert.ok(isExcluded("land", a("qt-7985", "Omnibus", "オムニバス")));
  assert.ok(isExcluded("land", a("qt-7991", "Westernland Shootin' Gallery", "ウエスタンランド・シューティングギャラリー")));
  assert.ok(isExcluded("land", a("tpw-4876ec54-92ed-4b0c-8b1b-292bba89c61c", "x", "x")));
  assert.ok(isExcluded("land", a("x", "Westernland Shootin’ Gallery", ""))); // 曲がった ’ でも一致
  assert.ok(isExcluded("land", a("qt-8254", "The Happy Ride with Baymax", "ベイマックスのハッピーライド")));
  assert.ok(isExcluded("land", a("tpw-ca00a0e8-f069-4d0a-9d5e-10cb63010956", "x", "x")));
  assert.equal(isExcluded("land", a("qt-8018", "Monsters, Inc. Ride & Go Seek!", "モンスターズ・インク“ライド＆ゴーシーク！”")), false); // 同じトゥモローランドでも別施設
  assert.ok(isExcluded("land", a("tpw-cf1e721e-ba51-4e48-a2bc-b07883091e88", "x", "x")));
  assert.ok(isExcluded("sea", a("qt-8049", "The Leonardo Challenge", "ザ・レオナルドチャレンジ")));
  assert.ok(isExcluded("sea", a("x", "", "フォートレス・エクスプロレーション“ザ・レオナルドチャレンジ”"))); // 公式の正式表記
  assert.ok(isExcluded("sea", a("qt-8028", "Journey to the Center of the Earth", "センター・オブ・ジ・アース")));
  assert.ok(isExcluded("sea", a("tpw-c8526be3-e82c-4692-ae44-e8f2d1142c8a", "x", "x")));
  assert.ok(isExcluded("sea", a("x", "", "センター オブ ジ アース")));
});

test("追加分と似た名前の別施設は除外しない", () => {
  assert.equal(isExcluded("land", a("qt-7988", "Western River Railroad", "ウエスタンリバー鉄道")), false);
  assert.equal(isExcluded("land", a("x", "Space Mountain", "スペース・マウンテン")), false);
  assert.equal(isExcluded("land", a("qt-7993", "Mark Twain Riverboat", "蒸気船マークトウェイン号")), false); // 同じウエスタンランドでも別施設
  assert.equal(isExcluded("sea", a("qt-8029", "20,000 Leagues Under the Sea", "海底2万マイル")), false); // センター・オブ・ジ・アースと同じエリアでも別施設
  // ランドの追加分はシーに影響しない／シーの追加分はランドに影響しない
  assert.equal(isExcluded("sea", a("qt-7994", "Big Thunder Mountain", "ビッグサンダー・マウンテン")), false);
  assert.equal(isExcluded("land", a("qt-7993", "Mark Twain Riverboat", "蒸気船マークトウェイン号")), false); // 同じ乗り物系でも別施設
  assert.equal(isExcluded("land", a("qt-8049", "The Leonardo Challenge", "ザ・レオナルドチャレンジ")), false);
});

test("ミゲルのグリーティングは時間帯ごとに別々に扱う", () => {
  assert.ok(isExcluded("sea", a("x", "", "ロストリバーデルタでミゲルに会おう（〜13:00）")));
  assert.ok(isExcluded("sea", a("x", "", "ロストリバーデルタでミゲルに会おう（13:30〜）")));
  assert.equal(isExcluded("sea", a("x", "", "ロストリバーデルタでミゲルに会おう（15:00〜）")), false);
});

test("休止・案内終了という理由だけでは除外しない／エリアごとは除外しない", () => {
  const list = [
    a("qt-8023", "Toy Story Mania!", "トイ・ストーリー・マニア！", "CLOSED"),
    { ...a("qt-99999", "New Mermaid Ride", "マーメイドの新アトラクション"), area: "マーメイドラグーン" },
    a("qt-8026", "Mermaid Lagoon Theater", "マーメイドラグーンシアター"),
  ];
  assert.deepEqual(removeExcluded("sea", list).map((x) => x.id), ["qt-8023", "qt-99999"]);
});

test("ランドの除外リストはシーに影響しない", () => {
  assert.equal(isExcluded("sea", a("qt-8007", "Alice's Tea Party", "アリスのティーパーティー")), false);
});

test("シーのヴェネツィアン・ゴンドラを除外する（ID・英語名・日本語名のどれでも）", () => {
  const a = (id, name, nameEn) => ({ id, name, nameEn });
  assert.ok(isExcluded("sea", a("qt-8034", "x", "x")));
  assert.ok(isExcluded("sea", a("tpw-2ca8f848-b8e2-4ba5-aa6e-e0fb37e85d0b", "x", "x")));
  assert.ok(isExcluded("sea", a("mock", "ヴェネツィアン・ゴンドラ", undefined)));
  assert.ok(isExcluded("sea", a("mock", "x", "Venetian Gondolas")));
  assert.ok(!isExcluded("land", a("qt-8034", "ヴェネツィアン・ゴンドラ", "Venetian Gondolas"))); // ランドの除外リストとは別
});
