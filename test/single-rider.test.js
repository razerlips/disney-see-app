import { test } from "node:test";
import assert from "node:assert/strict";
import { addSingleRider, markSingleRider } from "../single-rider.js";
import { removeExcluded } from "../exclusions.js";

const a = (name, nameEn) => ({ id: name, name, nameEn, status: "OPERATING", waitTime: 30 });

test("シングルライダー：ランドは美女と野獣だけ", async () => {
  const list = await addSingleRider("land", [a("美女と野獣“魔法のものがたり”", "Enchanted Tale of Beauty and the Beast"), a("プーさんのハニーハント", "Pooh's Hunny Hunt"), a("ピーターパン空の旅", "Peter Pan's Flight")]);
  assert.deepEqual(list.map((x) => !!x.singleRider), [true, false, false]);
});

test("シングルライダー：シーはアナとエルサ・ピーターパン（似た名前の空の旅は別）", async () => {
  const list = await addSingleRider("sea", [a("アナとエルサのフローズンジャーニー"), a("ピーターパンのネバーランドアドベンチャー"), a("トイ・ストーリー・マニア！"), a("ソアリン：ファンタスティック・フライト")]);
  assert.deepEqual(list.map((x) => !!x.singleRider), [true, true, false, false]);
  // 英語名だけでも（予備のデータ元に切り替わったとき）
  assert.equal((await addSingleRider("sea", [a("x", "Peter Pan's Never Land Adventure")]))[0].singleRider, true);
});

test("シングルライダー：除外リストの施設は一覧に戻らない・待ち時間などは変えない", async () => {
  const raw = [a("レイジングスピリッツ", "Raging Spirits"), a("アナとエルサのフローズンジャーニー")];
  const list = await addSingleRider("sea", removeExcluded("sea", raw));
  assert.deepEqual(list.map((x) => x.name), ["アナとエルサのフローズンジャーニー"]);
  assert.equal(list[0].waitTime, 30);
  assert.equal(markSingleRider([a("x")], []).length, 1);
});
