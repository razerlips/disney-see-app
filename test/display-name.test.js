import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName } from "../public/display-name.js";

test("スチーマーライン・エレクトリックレールウェイの「ディズニーシー・」を表示から取る（5 施設）", () => {
  const cases = {
    "ディズニーシー・トランジットスチーマーライン（メディテレーニアンハーバー）": "トランジットスチーマーライン（メディテレーニアンハーバー）",
    "ディズニーシー・トランジットスチーマーライン（アメリカンウォーターフロント）": "トランジットスチーマーライン（アメリカンウォーターフロント）",
    "ディズニーシー・トランジットスチーマーライン（ロストリバーデルタ）": "トランジットスチーマーライン（ロストリバーデルタ）",
    "ディズニーシー・エレクトリックレールウェイ（ポートディスカバリー）": "エレクトリックレールウェイ（ポートディスカバリー）",
    "ディズニーシー・エレクトリックレールウェイ（アメリカンウォーターフロント）": "エレクトリックレールウェイ（アメリカンウォーターフロント）",
  };
  for (const [name, shown] of Object.entries(cases)) assert.equal(displayName(name), shown);
});

test("ほかの施設名はそのまま", () => {
  assert.equal(displayName("ソアリン：ファンタスティック・フライト"), "ソアリン：ファンタスティック・フライト");
  assert.equal(displayName("Venetian Gondolas"), "Venetian Gondolas");
});
