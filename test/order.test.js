import { test } from "node:test";
import assert from "node:assert/strict";
import { sortByCustomOrder, moveInOrder } from "../public/order.js";

const a = (name, waitTime) => ({ name, waitTime });
const byWait = (x, y) => x.waitTime - y.waitTime;

test("カスタム順：覚えた順番に並べ、知らない施設は待ち時間順で後ろに付ける", () => {
  const list = [a("A", 30), a("B", 10), a("C", 20), a("新施設", 5)];
  assert.deepEqual(sortByCustomOrder(list, ["C", "A", "B"], byWait).map((x) => x.name), ["C", "A", "B", "新施設"]);
  // 覚えた順番がなければ（初期状態）今の並び（待ち時間順）のまま
  assert.deepEqual(sortByCustomOrder(list, undefined, byWait).map((x) => x.name), ["新施設", "B", "C", "A"]);
  // 覚えているが今日はデータにない施設があっても大丈夫
  assert.deepEqual(sortByCustomOrder(list, ["休止中", "B", "A", "C"], byWait).map((x) => x.name), ["B", "A", "C", "新施設"]);
});

test("カスタム順：上下に動かした結果を全体の順番にする", () => {
  const all = ["A", "B", "C", "D"];
  assert.deepEqual(moveInOrder(all, all, 3, 0), ["D", "A", "B", "C"]); // 一番下を一番上へ
  assert.deepEqual(moveInOrder(all, all, 0, 2), ["B", "C", "A", "D"]); // 上から下へ
  assert.deepEqual(moveInOrder(all, all, 1, 1), all); // 動かさなければそのまま
});

test("カスタム順：★だけ表示中に動かしても、隠れている施設の位置は変わらない", () => {
  const all = ["A", "x", "B", "y", "C"]; // x・y は★なしで隠れている
  assert.deepEqual(moveInOrder(all, ["A", "B", "C"], 2, 0), ["C", "x", "A", "y", "B"]);
});

test("カスタム順：今のデータにない施設の順番も消さずに残す", () => {
  assert.deepEqual(moveInOrder(["A", "B"], ["A", "B"], 1, 0, ["B", "休止中", "A"]), ["B", "A", "休止中"]);
});
