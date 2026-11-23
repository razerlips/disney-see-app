import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeThemeParksShows, normalizeManualShows, mergeShows, normalizeTime, toJst, showNameJa, loadShows } from "../shows.js";
import { performanceState, timeline, upNext, untilText, nowMinutesJst, toMinutes } from "../public/show-time.js";

const live = (showtimes, extra = {}) => ({
  liveData: [
    { id: "a", name: "Believe! Sea of Dreams", entityType: "SHOW", showtimes, ...extra },
    { id: "r", name: "Soaring: Fantastic Flight", entityType: "ATTRACTION", showtimes: [{ startTime: "2026-11-24T10:00:00+09:00" }] },
  ],
});

test("ThemeParks.wiki：SHOW の、その日（日本時間）の回だけを HH:MM にして取り出す", () => {
  const r = normalizeThemeParksShows(
    live([
      { startTime: "2026-11-24T10:15:00Z", endTime: "2026-11-24T10:45:00Z" }, // UTC → 19:15〜19:45
      { startTime: "2026-11-24T09:30:00+09:00" },
      { startTime: "2026-11-25T09:30:00+09:00" }, // 別の日は入れない
    ]),
    "2026-11-24",
  );
  assert.equal(r.length, 1); // ATTRACTION は入らない
  assert.equal(r[0].name, "ビリーヴ！～シー・オブ・ドリームス～");
  assert.equal(r[0].source, "auto");
  assert.deepEqual(r[0].times, [{ start: "09:30", end: null }, { start: "19:15", end: "19:45" }]);
});

test("ThemeParks.wiki：時間が 1 つもないショーは出さない（推測しない）", () => {
  assert.deepEqual(normalizeThemeParksShows(live([]), "2026-11-24"), []);
  assert.deepEqual(normalizeThemeParksShows(live(undefined), "2026-11-24"), []);
  assert.deepEqual(normalizeThemeParksShows({}, "2026-11-24"), []);
});

test("日本語名がないショーは英語名のまま。(Tokyo DisneySea) は取る", () => {
  assert.equal(showNameJa("Sky Full of Colors (Tokyo DisneySea)"), "Sky Full of Colors");
  assert.equal(showNameJa("Duffy and Friends' Wonderful Friendship"), "ダッフィー＆フレンズのワンダフル・フレンドシップ"); // 引用符の違いは無視
});

test("手入力：文字列とオブジェクトの両方の書き方を読み、変な時刻は捨てる", () => {
  const r = normalizeManualShows([
    { name: "ショーA", times: ["13:40", { start: "9:05", end: "9:35" }, "あとで", "25:61"] },
    { name: "時間なし", times: [] },
    { times: ["10:00"] },
  ]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].times, [{ start: "09:05", end: "09:35" }, { start: "13:40", end: null }]);
  assert.equal(normalizeTime("7:5"), null);
  assert.equal(toJst("not a date"), null);
});

test("同じショーが両方にあれば手入力を使い、ほかは合わせて最初の回の順に並べる", () => {
  const auto = normalizeThemeParksShows(
    {
      liveData: [
        { id: "a", name: "Believe! Sea of Dreams", entityType: "SHOW", showtimes: [{ startTime: "2026-11-24T19:00:00+09:00" }] },
        { id: "b", name: "Sky Full of Colors (Tokyo DisneySea)", entityType: "SHOW", showtimes: [{ startTime: "2026-11-24T20:30:00+09:00" }] },
      ],
    },
    "2026-11-24",
  );
  const manual = normalizeManualShows([
    { name: "ビリーヴ", en: "Believe! Sea of Dreams", times: ["19:15"] },
    { name: "グリーティング", times: ["10:00"] },
  ]);
  const r = mergeShows(manual, auto);
  assert.deepEqual(r.map((s) => [s.name, s.source, s.times[0].start]), [
    ["グリーティング", "manual", "10:00"],
    ["ビリーヴ", "manual", "19:15"],
    ["Sky Full of Colors", "auto", "20:30"],
  ]);
});

test("サンプルデータで読み込める（時間はその日の日付になる）", async () => {
  const r = await loadShows({ mock: true, date: "2026-11-24" });
  assert.equal(r.date, "2026-11-24");
  assert.equal(r.autoAvailable, true);
  assert.equal(r.shows.length, 5); // 時間のない Dance the Globe! と ATTRACTION は入らない
  assert.ok(r.shows.every((s) => s.times.length > 0));
});

test("上演の状態：これから／上演中（終わりが分かるときだけ）／終了", () => {
  const t = { start: "10:00", end: "10:30" };
  assert.equal(performanceState(t, toMinutes("09:59")), "upcoming");
  assert.equal(performanceState(t, toMinutes("10:00")), "ongoing");
  assert.equal(performanceState(t, toMinutes("10:30")), "past");
  assert.equal(performanceState({ start: "10:00", end: null }, toMinutes("10:05")), "past"); // 上演中かは推測しない
});

test("次のショー：上演中とこれからの回を時間順に", () => {
  const shows = [
    { name: "B", times: [{ start: "13:00", end: null }, { start: "16:00", end: null }] },
    { name: "A", times: [{ start: "11:00", end: "11:30" }, { start: "15:00", end: null }] },
  ];
  const now = toMinutes("11:10");
  assert.deepEqual(upNext(shows, now).map((p) => `${p.show.name}${p.time.start}${p.state[0]}`), ["A11:00o", "B13:00u", "A15:00u"]);
  assert.equal(timeline(shows, now).length, 4);
  assert.equal(untilText({ start: "11:35" }, now), "あと 25 分");
  assert.equal(untilText({ start: "13:00" }, now), "あと 1 時間 50 分");
  assert.equal(untilText({ start: "12:10" }, now), "あと 1 時間");
});

test("今の時刻は日本時間で数える", () => {
  assert.equal(nowMinutesJst(new Date("2026-11-24T01:05:00Z")), 10 * 60 + 5);
});

import { parseTimes, mergeLocal } from "../public/show-time.js";
import { normalizeCatalog, officialScheduleUrl } from "../shows.js";

test("時間の入力：いろいろな書き方を読み、読めないものは知らせる", () => {
  const r = parseTimes("13:00 10:30、１５：３０ 1650 9時05分 あとで 25:70 19:15-19:45 12:00～11:00");
  assert.deepEqual(r.times.map((t) => t.start + (t.end ? "-" + t.end : "")), ["09:05", "10:30", "13:00", "15:30", "16:50", "19:15-19:45"]);
  assert.deepEqual(r.bad, ["あとで", "25:70", "12:00~11:00"]); // 終わりが始まりより前のものも読まない
  assert.deepEqual(parseTimes(""), { times: [], bad: [] });
});

test("端末で入力した時間は、同じショーのサーバー側の時間より優先する", () => {
  const server = [
    { name: "ビリーヴ！～シー・オブ・ドリームス～", nameEn: "Believe! Sea of Dreams", source: "auto", times: [{ start: "19:00", end: "19:30" }] },
    { name: "Sky Full of Colors", nameEn: "Sky Full of Colors", source: "auto", times: [{ start: "20:30", end: null }] },
  ];
  const r = mergeLocal(server, [
    { name: "ビリーヴ！～シー・オブ・ドリームス～", en: "Believe! Sea of Dreams", times: ["19:15"] },
    { name: "グリーティング", times: [{ start: "12:00", end: "12:30" }, "10:00"] },
    { name: "空", times: [] },
  ]);
  assert.deepEqual(r.map((s) => `${s.name}/${s.source}/${s.times.map((t) => t.start).join(",")}`), [
    "グリーティング/device/10:00,12:00",
    "ビリーヴ！～シー・オブ・ドリームス～/device/19:15",
    "Sky Full of Colors/auto/20:30",
  ]);
});

test("ショー一覧と公式スケジュールのリンク", () => {
  const c = normalizeCatalog({ children: [
    { name: "Sky Full of Colors (Tokyo DisneySea)", entityType: "SHOW", externalId: "1" },
    { name: "Soaring", entityType: "ATTRACTION" },
  ] });
  assert.deepEqual(c, [{ name: "Sky Full of Colors", nameEn: "Sky Full of Colors", officialId: "1" }]);
  assert.equal(officialScheduleUrl("2026-11-24"), "https://www.tokyodisneyresort.jp/tds/show.html#day=20261124");
});
