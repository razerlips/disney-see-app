// ショー時間の計算（「あと何分」「上演中」「終わった」など）。画面に依存しない部分だけをここに置く（テストしやすいように）。
// 時刻はすべて日本時間の "HH:MM"。分に直して比べる（"25:00" のような 24 時以降の書き方も、そのまま大きい数として扱う）。

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

// 今の日本時間（その日の 0:00 からの分）
export function nowMinutesJst(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return get("hour") * 60 + get("minute");
}

// 1 回分の上演の状態。
//   "upcoming"（これから） / "ongoing"（上演中：終わりの時刻が分かるときだけ） / "past"（終わった）
// 終わりの時刻が分からない回は、始まった時点で「終わった」側に入れる（上演中かどうかは推測しない）
export function performanceState(time, now) {
  const start = toMinutes(time.start);
  if (now < start) return "upcoming";
  if (time.end && now < toMinutes(time.end)) return "ongoing";
  return "past";
}

// 全ショーの上演を 1 本の時間順の一覧にする
export function timeline(shows, now) {
  return shows
    .flatMap((show) => show.times.map((time) => ({ show, time, state: performanceState(time, now) })))
    .sort((a, b) => toMinutes(a.time.start) - toMinutes(b.time.start) || a.show.name.localeCompare(b.show.name, "ja"));
}

// 「次のショー」：上演中のものと、これからのものを時間順に count 件
export function upNext(shows, now, count = 3) {
  return timeline(shows, now).filter((p) => p.state !== "past").slice(0, count);
}

// 「あと 25 分」「あと 1 時間 5 分」
export function untilText(time, now) {
  const diff = toMinutes(time.start) - now;
  if (diff <= 0) return "まもなく";
  if (diff < 60) return `あと ${diff} 分`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m ? `あと ${h} 時間 ${m} 分` : `あと ${h} 時間`;
}

// "09:05" → "9:05"
export const shortTime = (t) => String(t ?? "").replace(/^0(\d)/, "$1");

// ---- この端末で入力したショー時間 ----------------------------------------------

// 「10:30 13:00、15:30」「1030 1300」「10時30分」「10:30-10:55」などを [{ start: "10:30", end: null }, ...] に。
// 読めないものは bad に入れて返す
export function parseTimes(text) {
  const times = [];
  const bad = [];
  const tokens = String(text ?? "")
    .normalize("NFKC")
    .replace(/時/g, ":").replace(/分/g, "")
    .split(/[\s,、/]+/)
    .filter(Boolean);
  const hhmm = (h, m) => (Number(h) <= 29 && Number(m) <= 59 ? `${h.padStart(2, "0")}:${m}` : null);
  for (const tok of tokens) {
    const m = /^(\d{1,2}):?(\d{2})(?:[-~〜](\d{1,2}):?(\d{2}))?$/.exec(tok);
    const start = m && hhmm(m[1], m[2]);
    const end = m?.[3] ? hhmm(m[3], m[4]) : null;
    if (start && (!m[3] || (end && end > start))) times.push({ start, end });
    else bad.push(tok);
  }
  const unique = [...new Map(times.map((t) => [t.start, t])).values()];
  return { times: unique.sort((a, b) => a.start.localeCompare(b.start)), bad };
}

const keyOf = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// サーバーのショー一覧に、この端末で入力した分を重ねる。同じショー（日本語名か英語名が同じ）は端末の入力を使う
export function mergeLocal(serverShows, localEntries = []) {
  const local = localEntries
    .filter((e) => e.name && e.times?.length)
    .map((e) => ({
      id: `device-${keyOf(e.name)}`,
      name: e.name,
      nameEn: e.en ?? null,
      area: e.area || null,
      note: null,
      source: "device",
      times: e.times.map((t) => (typeof t === "string" ? { start: t, end: null } : t)).sort((a, b) => a.start.localeCompare(b.start)),
    }));
  const taken = new Set(local.flatMap((s) => [s.name, s.nameEn].filter(Boolean).map(keyOf)));
  const rest = serverShows.filter((s) => ![s.name, s.nameEn].filter(Boolean).some((n) => taken.has(keyOf(n))));
  return [...local, ...rest].sort((a, b) => a.times[0].start.localeCompare(b.times[0].start) || a.name.localeCompare(b.name, "ja"));
}
