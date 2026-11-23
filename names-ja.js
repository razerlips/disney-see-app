// アトラクション名の「英語 → 日本語」対応表。
// API は英語名で返してくるので、ここで公式の日本語名に置き換える。
// 表にない名前は英語のまま表示される（新アトラクションが増えたらここに足す）。
//
// 英語名は「小文字にして、英数字以外（空白・記号・®・引用符など）を取り除いた形」で照合するので、
// "Indiana Jones Adventure®: ..." と "Indiana Jones Adventure: ..." のような表記ゆれも同じ扱いになる。

const NAMES = {
  // ---- 東京ディズニーランド ----
  "Omnibus": "オムニバス",
  "Penny Arcade": "ペニーアーケード",
  "Jungle Cruise: Wildlife Expeditions": "ジャングルクルーズ：ワイルドライフ・エクスペディション",
  "Pirates of the Caribbean": "カリブの海賊",
  "Swiss Family Treehouse": "スイスファミリー・ツリーハウス",
  "The Enchanted Tiki Room: Stitch Presents \"Aloha E Komo Mai!\"": "魅惑のチキルーム：スティッチ・プレゼンツ“アロハ・エ・コモ・マイ！”",
  "Western River Railroad": "ウエスタンリバー鉄道",
  "Big Thunder Mountain": "ビッグサンダー・マウンテン",
  "Country Bear Theater": "カントリーベア・シアター",
  "Mark Twain Riverboat": "蒸気船マークトウェイン号",
  "Tom Sawyer Island Rafts": "トムソーヤ島いかだ",
  "Westernland Shootin' Gallery": "ウエスタンランド・シューティングギャラリー",
  "Woodchuck Greeting Trail": "ウッドチャック・グリーティングトレイル",
  "Beaver Brothers Explorer Canoes": "ビーバーブラザーズのカヌー探険",
  "Splash Mountain": "スプラッシュ・マウンテン",
  "it's a small world": "イッツ・ア・スモールワールド",
  "Alice's Tea Party": "アリスのティーパーティー",
  "Castle Carrousel": "キャッスルカルーセル",
  "Cinderella's Fairy Tale Hall": "シンデレラのフェアリーテイル・ホール",
  "Dumbo The Flying Elephant": "空飛ぶダンボ",
  "Haunted Mansion": "ホーンテッドマンション",
  "Haunted Mansion \"Holiday Nightmare\"": "ホーンテッドマンション“ホリデーナイトメアー”",
  "Mickey's PhilharMagic": "ミッキーのフィルハーマジック",
  "Peter Pan's Flight": "ピーターパン空の旅",
  "Pinocchio's Daring Journey": "ピノキオの冒険旅行",
  "Pooh's Hunny Hunt": "プーさんのハニーハント",
  "Snow White's Adventures": "白雪姫と七人のこびと",
  "Enchanted Tale of Beauty and the Beast": "美女と野獣“魔法のものがたり”",
  "Chip 'n Dale's Treehouse": "チップとデールのツリーハウス",
  "Donald's Boat": "ドナルドのボート",
  "Gadget's Go Coaster": "ガジェットのゴーコースター",
  "Goofy's Paint 'n' Play House": "グーフィーのペイント＆プレイハウス",
  "Mickey's House and Meet Mickey": "ミッキーの家とミート・ミッキー",
  "Minnie's House": "ミニーの家",
  "Minnie's Style Studio": "ミニーのスタイルスタジオ",
  "Roger Rabbit's Car Toon Spin": "ロジャーラビットのカートゥーンスピン",
  "Toon Park": "トゥーンパーク",
  "Buzz Lightyear's Astro Blasters": "バズ・ライトイヤーのアストロブラスター",
  "Monsters, Inc. Ride & Go Seek!": "モンスターズ・インク“ライド＆ゴーシーク！”",
  "Space Mountain": "スペース・マウンテン",
  "Star Tours: The Adventures Continue": "スター・ツアーズ：ザ・アドベンチャーズ・コンティニュー",
  "Stitch Encounter": "スティッチ・エンカウンター",
  "The Happy Ride with Baymax": "ベイマックスのハッピーライド",

  // ---- 東京ディズニーシー ----
  "Soaring: Fantastic Flight": "ソアリン：ファンタスティック・フライト",
  "Venetian Gondolas": "ヴェネツィアン・ゴンドラ",
  "Fortress Explorations": "フォートレス・エクスプロレーション",
  "The Leonardo Challenge": "ザ・レオナルドチャレンジ",
  "DisneySea Transit Steamer Line (Mediterranean Harbor)": "ディズニーシー・トランジットスチーマーライン（メディテレーニアンハーバー）",
  "DisneySea Transit Steamer Line (American Waterfront)": "ディズニーシー・トランジットスチーマーライン（アメリカンウォーターフロント）",
  "DisneySea Transit Steamer Line (Lost River Delta)": "ディズニーシー・トランジットスチーマーライン（ロストリバーデルタ）",
  "DisneySea Electric Railway (American Waterfront)": "ディズニーシー・エレクトリックレールウェイ（アメリカンウォーターフロント）",
  "DisneySea Electric Railway (Port Discovery)": "ディズニーシー・エレクトリックレールウェイ（ポートディスカバリー）",
  "Big City Vehicles": "ビッグシティ・ヴィークル",
  "Tower of Terror": "タワー・オブ・テラー",
  "Toy Story Mania!": "トイ・ストーリー・マニア！",
  "Turtle Talk": "タートル・トーク",
  "Aquatopia": "アクアトピア",
  "Nemo & Friends SeaRider": "ニモ＆フレンズ・シーライダー",
  "Indiana Jones Adventure: Temple of the Crystal Skull": "インディ・ジョーンズ・アドベンチャー：クリスタルスカルの魔宮",
  "Raging Spirits": "レイジングスピリッツ",
  "Lost River Delta (Miguel: until 1:00 p.m.)": "ロストリバーデルタでミゲルに会おう（〜13:00）",
  "Lost River Delta (Miguel: from 1:30 p.m.)": "ロストリバーデルタでミゲルに会おう（13:30〜）",
  "Caravan Carousel": "キャラバンカルーセル",
  "Jasmine's Flying Carpets": "ジャスミンのフライングカーペット",
  "Sindbad's Storybook Voyage": "シンドバッド・ストーリーブック・ヴォヤッジ",
  "The Magic Lamp Theater": "マジックランプシアター",
  "Ariel's Playground": "アリエルのプレイグラウンド",
  "Blowfish Balloon Race": "ブローフィッシュ・バルーンレース",
  "Flounder's Flying Fish Coaster": "フランダーのフライングフィッシュコースター",
  "Jumpin' Jellyfish": "ジャンピン・ジェリーフィッシュ",
  "Scuttle's Scooters": "スカットルのスクーター",
  "Mermaid Lagoon Theater": "マーメイドラグーンシアター",
  "The Whirlpool": "ワールプール",
  "Journey to the Center of the Earth": "センター・オブ・ジ・アース",
  "20,000 Leagues Under the Sea": "海底2万マイル",
  "Anna and Elsa's Frozen Journey": "アナとエルサのフローズンジャーニー",
  "Fairy Tinker Bell's Busy Buggies": "フェアリー・ティンカーベルのビジーバギー",
  "Peter Pan's Never Land Adventure": "ピーターパンのネバーランドアドベンチャー",
  "Rapunzel's Lantern Festival": "ラプンツェルのランタンフェスティバル",
};

const key = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
const LOOKUP = new Map(Object.entries(NAMES).map(([en, ja]) => [key(en), ja]));

// 日本語名があればそれを、なければ英語名をそのまま返す
export function nameJa(englishName) {
  return LOOKUP.get(key(englishName)) ?? englishName;
}

export function hasJapaneseName(englishName) {
  return LOOKUP.has(key(englishName));
}
