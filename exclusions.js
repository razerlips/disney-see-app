// 自分が行かない施設の除外リスト。ここに載っている施設は一覧に出さない。
// （運営状況が「休止・案内終了」かどうかとは関係なく、この表に載っているものだけを除外する）
//
// 各施設は次の 3 通りで照合する：
//   1. ID（実データで名前との対応を確認済み。2026-10-01）
//        qt = Queue-Times の ID、tpw = ThemeParks.wiki の ID
//   2. 英語名（ID が変わったときの保険）
//   3. 日本語名（サンプルデータなど ID がないときの保険）
//   4. 別名（aliases。公式の正式表記などデータ元と違う書き方があるとき）
// 名前は空白・記号・全角半角の違いだけを無視した「完全一致」で比べる。
// 部分一致はしないので、似た名前の別施設（例：トランジットスチーマーラインの別の乗り場）は除外されない。

const LIST = {
  land: [
    { ja: "アリスのティーパーティー", en: "Alice's Tea Party", qt: 8007, tpw: "cfaa7d1c-111e-49b9-b21b-134eac4000e8" },
    { ja: "ガジェットのゴーコースター", en: "Gadget's Go Coaster", qt: 8012, tpw: "52c5e406-67e2-4d37-aee8-987644d87b63" },
    { ja: "キャッスルカルーセル", en: "Castle Carrousel", qt: 8004, tpw: "1fb05b7d-953a-4fa7-b7ed-db2eb62b85bf" },
    { ja: "カントリーベア・シアター", en: "Country Bear Theater", qt: 7992, tpw: "83f11a48-0d22-4429-8e59-43fd611d6795" },
    { ja: "グーフィーのペイント＆プレイハウス", en: "Goofy's Paint 'n' Play House", qt: 8014, tpw: "74f17654-ceb1-4f12-9c19-ce6ed0587f33" },
    { ja: "シンデレラのフェアリーテイル・ホール", en: "Cinderella's Fairy Tale Hall", qt: 8000, tpw: "f82709b6-51a3-4b65-8d6f-c2472f5053df" },
    { ja: "スイスファミリー・ツリーハウス", en: "Swiss Family Treehouse", qt: 7989, tpw: "f9321bc7-aa96-4a70-b963-681482384d1b" },
    { ja: "スティッチ・エンカウンター", en: "Stitch Encounter", qt: 8021, tpw: "05c7400b-866d-4d47-9cb1-8722fe6b22da" },
    { ja: "チップとデールのツリーハウス", en: "Chip 'n Dale's Treehouse", qt: 8011, tpw: "a0a63e1c-3fc6-4433-b9b1-f5e798ab1f00" },
    { ja: "トゥーンパーク", en: "Toon Park", qt: 8020, tpw: "5f0425c4-7d35-4afd-bb28-6c73f1920b1f" },
    { ja: "ドナルドのボート", en: "Donald's Boat", qt: 8013, tpw: "2d215a6d-77a2-4c44-a2e3-c293c1289876" },
    { ja: "トムソーヤ島いかだ", en: "Tom Sawyer Island Rafts", qt: 7995, tpw: "077c390c-c214-40c4-83e9-93d8f8621141" },
    { ja: "ペニーアーケード", en: "Penny Arcade", qt: 8019, tpw: "55458c39-ee47-4b8d-ab07-991d12a0313d" },
    { ja: "ビーバーブラザーズのカヌー探険", en: "Beaver Brothers Explorer Canoes", qt: 7997, tpw: "037a13bf-b06e-4902-aa12-02d758d1718d" },
    { ja: "ミニーの家", en: "Minnie's House", qt: 8010, tpw: "534ca90a-2626-4a45-9b7b-1964ed15678e" },
    { ja: "ロジャーラビットのカートゥーンスピン", en: "Roger Rabbit's Car Toon Spin", qt: 8009, tpw: "73384e33-a86a-4601-996f-61dbffba6ec2" },
    { ja: "空飛ぶダンボ", en: "Dumbo The Flying Elephant", qt: 8003, tpw: "78510449-ec64-47d3-a140-7b473dbaddf2" },
    { ja: "魅惑のチキルーム：スティッチ・プレゼンツ“アロハ・エ・コモ・マイ！”", en: "The Enchanted Tiki Room: Stitch Presents \"Aloha E Komo Mai!\"", qt: 7990, tpw: "4f0b3416-0b0a-419b-ba8c-6ee00b7d7144" },
    // 2026-10-01 追加
    { ja: "スター・ツアーズ：ザ・アドベンチャーズ・コンティニュー", en: "Star Tours: The Adventures Continue", qt: 8015, tpw: "512fd34c-2f0a-4e0a-bcc1-ef4d15c5f803" },
    { ja: "ビッグサンダー・マウンテン", en: "Big Thunder Mountain", qt: 7994, tpw: "e3577b4a-f1d9-4ec5-aacf-b99977ea88c9" },
    { ja: "スプラッシュ・マウンテン", en: "Splash Mountain", qt: 7996, tpw: "dfe25d8e-e234-4020-a261-30c6825d0680" },
    { ja: "オムニバス", en: "Omnibus", qt: 7985, tpw: "cf1e721e-ba51-4e48-a2bc-b07883091e88" },
    { ja: "ウエスタンランド・シューティングギャラリー", en: "Westernland Shootin' Gallery", qt: 7991, tpw: "4876ec54-92ed-4b0c-8b1b-292bba89c61c" },
    { ja: "ベイマックスのハッピーライド", en: "The Happy Ride with Baymax", qt: 8254, tpw: "ca00a0e8-f069-4d0a-9d5e-10cb63010956" },
  ],
  sea: [
    { ja: "アクアトピア", en: "Aquatopia", qt: 8038, tpw: "2159960b-4f42-4974-93be-7519816de45d" },
    { ja: "アリエルのプレイグラウンド", en: "Ariel's Playground", qt: 8022, tpw: "a674e149-8ae3-4338-b1e3-c9f6b804f475" },
    { ja: "キャラバンカルーセル", en: "Caravan Carousel", qt: 8040, tpw: "76aed95a-dce8-4d03-8c2a-8ad69b3d0d4a" },
    { ja: "ジャスミンのフライングカーペット", en: "Jasmine's Flying Carpets", qt: 8025, tpw: "abbf5b3e-94e5-420a-8257-34594cd9d590" },
    { ja: "ジャンピン・ジェリーフィッシュ", en: "Jumpin' Jellyfish", qt: 8043, tpw: "c6c0d34d-531a-40d9-b711-3497fd53c28b" },
    { ja: "スカットルのスクーター", en: "Scuttle's Scooters", qt: 8042, tpw: "58815e8e-7c01-4a42-8a00-1bd1c82a0252" },
    // メディテレーニアンハーバー乗り場だけ。アメリカンウォーターフロント／ロストリバーデルタ乗り場は除外しない
    { ja: "ディズニーシー・トランジットスチーマーライン（メディテレーニアンハーバー）", en: "DisneySea Transit Steamer Line (Mediterranean Harbor)", qt: 8031, tpw: "7afc3143-befb-4a61-9c86-8d6869eb2ce3" },
    { ja: "タワー・オブ・テラー", en: "Tower of Terror", qt: 8047, tpw: "4ca7254c-7abc-4e52-82e0-9c562c096494" },
    { ja: "ニモ＆フレンズ・シーライダー", en: "Nemo & Friends SeaRider", qt: 8051, tpw: "179e4e82-26ed-4b04-bf21-f03808b61df4" },
    { ja: "ビッグシティ・ヴィークル", en: "Big City Vehicles", qt: 8037, tpw: "5449e9da-ee4c-47d8-a60a-8a964b94c32d" },
    // フォートレス・エクスプロレーションだけ。中の「ザ・レオナルドチャレンジ」は別施設なので除外しない
    { ja: "フォートレス・エクスプロレーション", en: "Fortress Explorations", qt: 8048, tpw: "6e44f5c0-f996-45ad-aa7e-9738df6a6047" },
    { ja: "フランダーのフライングフィッシュコースター", en: "Flounder's Flying Fish Coaster", qt: 8041, tpw: "2d56558a-d4d2-4f79-898c-178c2c20cf67" },
    { ja: "ブローフィッシュ・バルーンレース", en: "Blowfish Balloon Race", qt: 8044, tpw: "f37d7fe8-169f-459d-86f3-4843655358bd" },
    // 施設「マーメイドラグーンシアター」だけ。エリア「マーメイドラグーン」全体は除外しない
    { ja: "マーメイドラグーンシアター", en: "Mermaid Lagoon Theater", qt: 8026, tpw: "70c16669-c9ba-4f83-bd25-3cd9ea5a0b0c" },
    { ja: "レイジングスピリッツ", en: "Raging Spirits", qt: 8046, tpw: "dd942cd2-b364-4262-af12-ca1a5012528b" },
    { ja: "ロストリバーデルタでミゲルに会おう（〜13:00）", en: "Lost River Delta (Miguel: until 1:00 p.m.)", qt: 17809, tpw: "1c49eef4-5a98-4616-a463-9dd714d42be2" },
    { ja: "ロストリバーデルタでミゲルに会おう（13:30〜）", en: "Lost River Delta (Miguel: from 1:30 p.m.)", qt: 17810, tpw: "8fab2b22-4bc1-48d5-bd0a-5d5a1a4aea50" },
    { ja: "ワールプール", en: "The Whirlpool", qt: 8045, tpw: "7594d3f2-b3d1-47a0-b64f-8bc01d373830" },
    // 2026-10-01 追加。同じミステリアスアイランドの「海底2万マイル」は除外しない
    { ja: "センター・オブ・ジ・アース", en: "Journey to the Center of the Earth", qt: 8028, tpw: "c8526be3-e82c-4692-ae44-e8f2d1142c8a" },
    // 2026-10-01 追加。データ上の名前は「ザ・レオナルドチャレンジ」。公式の正式表記でも照合できるよう別名を登録
    {
      ja: "ザ・レオナルドチャレンジ",
      en: "The Leonardo Challenge",
      aliases: ["フォートレス・エクスプロレーション“ザ・レオナルドチャレンジ”", "Fortress Explorations \"The Leonardo Challenge\""],
      qt: 8049,
      tpw: "44df35ec-28cb-4465-9ae1-95a4d6445a82",
    },
    // 2026-10-14 追加
    { ja: "ヴェネツィアン・ゴンドラ", en: "Venetian Gondolas", qt: 8034, tpw: "2ca8f848-b8e2-4ba5-aa6e-e0fb37e85d0b" },
  ],
};

// 全角／半角・大文字／小文字をそろえ、文字と数字以外（空白・記号・引用符・®など）を取り除く
export const normalizeName = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const INDEX = Object.fromEntries(
  Object.entries(LIST).map(([park, entries]) => [
    park,
    {
      ids: new Set(entries.flatMap((e) => [`qt-${e.qt}`, `tpw-${e.tpw}`])),
      names: new Set(entries.flatMap((e) => [e.ja, e.en, ...(e.aliases ?? [])].map(normalizeName))),
    },
  ]),
);

export function isExcluded(park, attraction) {
  const index = INDEX[park];
  if (!index) return false;
  return (
    index.ids.has(attraction.id) ||
    index.names.has(normalizeName(attraction.nameEn)) ||
    index.names.has(normalizeName(attraction.name))
  );
}

export function removeExcluded(park, attractions) {
  return attractions.filter((a) => !isExcluded(park, a));
}

export const EXCLUDED = LIST;
