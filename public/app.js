// 画面の動きを担当するファイル。
// タブは「ショー／待ち時間」の 2 つ（どちらも東京ディズニーシー）。
// ショーは shows-view.js、待ち時間はこのファイルが担当する。/api/waits から待ち時間（と DPA の販売状況）をもらって一覧表示する。
// カードを長押しすると上下にドラッグして並び替えられる（カスタム順。パークごとにブラウザへ保存）。

import { sortByCustomOrder, moveInOrder } from "./order.js";
import { initShows } from "./shows-view.js";

const STATUS_LABEL = {
  OPERATING: "運営中",
  DOWN: "一時運営中止",
  CLOSED: "休止・案内終了",
  REFURBISHMENT: "休止中（改修）",
};

// お気に入りと表示設定はブラウザ（localStorage）に保存して、次に開いたときも残す。
// プライベートブラウズなどで保存できない環境でも動くように try/catch で囲む。
function loadSaved(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくてもアプリは使えるので何もしない
  }
}

const state = {
  view: loadSaved("view", "shows"), // "shows"（ショー） / "waits"（待ち時間）
  park: "sea", // このアプリはシーだけ
  data: null, // サーバーから受け取った最新データ
  favorites: new Set(loadSaved("favorites", [])), // アトラクション名で覚える（データ元が変わっても残るように）
  sort: loadSaved("sort", "wait"),
  favOnly: loadSaved("favOnly", false),
  customOrder: loadSaved("customOrder", {}), // { land: [名前...], sea: [名前...] }
};

const $ = (sel) => document.querySelector(sel);

function showMessage(text, isError = false) {
  const el = $("#message");
  el.textContent = text;
  el.classList.toggle("error", isError);
  el.hidden = !text;
}

let lastLoadAt = 0; // 最後に読み込みを始めた時刻（自動更新の間隔を決めるのに使う）

// quiet: true は自動更新用。「読み込み中…」を出さず、失敗しても今の一覧を消さない
async function load({ quiet = false } = {}) {
  lastLoadAt = Date.now();
  if (!quiet) showMessage("読み込み中…");
  const park = state.park;
  const stillHere = () => park === state.park;
  try {
    const res = await fetch(`/api/waits?park=${park}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `エラー（${res.status}）`);
    if (!stillHere()) return; // 読み込み中に別のタブに切り替わった
    state.data = body;
    showMessage(body.stale ? "最新データが取れなかったので、前回のデータを表示しています。" : "", body.stale);
  } catch (err) {
    // 取れなくても画面は壊さず、理由を表示する
    console.error(err);
    if (!stillHere()) return;
    if (quiet && state.data) {
      showMessage("自動更新できなかったので、前のデータを表示しています。「更新」を押すと取り直します。", true);
      return;
    }
    state.data = null;
    showMessage("待ち時間を取得できませんでした 🙇‍♀️ 時間をおいて「更新」を押してください。", true);
  }
  render();
}

// ---- 自動更新 ----------------------------------------------------------------
// ・アプリに戻ってきたとき（別のアプリから切り替えた、画面ロックを解除した）に取り直す
// ・開きっぱなしのときは 5 分ごとに取り直す（データ元の更新が 5 分ごとなので、それより細かくしても変わらない）
const REFRESH_ON_RETURN_MS = 60 * 1000; // 戻ってきたとき、前回からこれ以上たっていたら取り直す
const REFRESH_EVERY_MS = 5 * 60 * 1000;
function autoRefresh(minAge) {
  if (state.view !== "waits") return; // 待ち時間タブを開いていないときは取りに行かない
  if (document.visibilityState !== "visible") return; // 画面を見ていない間は通信しない
  if (press || drag) return; // 並び替えの操作中はじゃましない（次の機会に更新される）
  if (Date.now() - lastLoadAt < minAge) return;
  load({ quiet: true });
}
document.addEventListener("visibilitychange", () => autoRefresh(REFRESH_ON_RETURN_MS));
addEventListener("pageshow", (e) => {
  if (e.persisted) autoRefresh(REFRESH_ON_RETURN_MS); // 「戻る」で前の画面がそのまま復元されたとき
});
setInterval(() => autoRefresh(REFRESH_EVERY_MS), 30 * 1000);

function waitClass(min) {
  if (min <= 20) return "short";
  if (min <= 60) return "mid";
  return "long";
}

// 並び替え。運営していないものは、待ち時間順のときは一番下に回す。
const SORTERS = {
  wait: (a, b) => (a.waitTime ?? Infinity) - (b.waitTime ?? Infinity) || a.name.localeCompare(b.name, "ja"),
  area: (a, b) => a.area.localeCompare(b.area, "ja") || a.name.localeCompare(b.name, "ja"),
  name: (a, b) => a.name.localeCompare(b.name, "ja"),
};

// ★だけの絞り込み前の、今の並び順での全施設
function sortedAttractions() {
  const list = state.data?.attractions ?? [];
  if (state.sort === "custom") return sortByCustomOrder(list, state.customOrder[state.park], SORTERS.wait);
  return [...list].sort(SORTERS[state.sort] ?? SORTERS.wait);
}

function visibleAttractions() {
  const list = sortedAttractions();
  return state.favOnly ? list.filter((a) => state.favorites.has(a.name)) : list;
}

// 運営状況バッジ。ひと目で分かるように、色＋記号＋太字で出す（色だけに頼らない）
const STATUS_STYLE = {
  OPERATING: { cls: "open", mark: "●" },
  DOWN: { cls: "down", mark: "▲" },
  CLOSED: { cls: "off", mark: "■" },
  REFURBISHMENT: { cls: "off", mark: "■" },
};
function statusBadge(status) {
  const { cls, mark } = STATUS_STYLE[status] ?? { cls: "off", mark: "■" };
  const label = STATUS_LABEL[status] ?? escapeHtml(status);
  return `<span class="st ${cls}"><span class="st-mark" aria-hidden="true">${mark}</span>${label}</span>`;
}

// DPA の販売状況バッジ（待ち時間の補助情報）。DPA 対象外・情報なしなら何も出さない
function dpaBadge(dpa) {
  if (dpa?.state === "SELLING") {
    const price = Number.isFinite(dpa.price) ? ` ¥${dpa.price.toLocaleString("ja-JP")}` : "";
    return `<span class="dpa selling">DPA 販売中${price}</span>`;
  }
  if (dpa?.state === "FINISHED") return `<span class="dpa finished">DPA 販売終了</span>`;
  return "";
}

// シングルライダー対象のバッジ（人のシルエット＋文字）。対象施設という意味で、実施中かどうかは分からない
const SOLO_ICON = `<svg class="sr-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4" fill="currentColor"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="currentColor"/></svg>`;
function singleRiderBadge(on) {
  return on ? `<span class="sr" title="シングルライダー対象（実施しない時間帯もあります）">${SOLO_ICON}シングルライダー</span>` : "";
}

// 運営予定時間（訪問日に手で登録したもの）。"09:00" → "9:00"。その日の通常と違う時間は目立たせる
const shortTime = (t) => String(t).replace(/^0(\d)/, "$1");
function hoursHtml(h) {
  if (!h) return "";
  const text = `運営予定 ${shortTime(h.open)}〜${shortTime(h.close)}`;
  return h.differs ? `<div class="hours differs">⏰ ${text}</div>` : `<div class="hours">${text}</div>`;
}

function itemHtml(a) {
  const open = a.status === "OPERATING";
  const wait = open && a.waitTime != null
    ? `<div class="wait ${waitClass(a.waitTime)}"><strong>${a.waitTime}</strong> 分</div>`
    : `<div class="wait">—</div>`;
  const fav = state.favorites.has(a.name);
  return `
    <li class="item ${open ? "" : "closed"}" data-name="${escapeHtml(a.name)}">
      <button class="fav" type="button" data-name="${escapeHtml(a.name)}" aria-pressed="${fav}"
        aria-label="お気に入り${fav ? "から外す" : "に追加"}">${fav ? "★" : "☆"}</button>
      <div class="info">
        <div class="name">${escapeHtml(a.name)}</div>
        <div class="area">${escapeHtml(a.area)}</div>
        <div class="status">${statusBadge(a.status)}${dpaBadge(a.dpa)}${singleRiderBadge(a.singleRider)}</div>
        ${hoursHtml(a.hours)}
      </div>
      ${wait}
    </li>`;
}

function render() {
  if (drag) return; // 並び替えの途中は描き直さない（指を離したあとに描き直す）
  const list = visibleAttractions();
  $("#list").innerHTML = list.map(itemHtml).join("");
  if (state.data && list.length === 0 && state.favOnly) {
    $("#list").innerHTML = `<li class="message">このパークのお気に入りはまだありません。☆を押すと登録できます。</li>`;
  }

  $("#updated").textContent = state.data
    ? `取得：${new Date(state.data.fetchedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
    : "";
  if (state.view === "waits") setSource(state.data?.source);
}

// フッターのクレジット表記（今のタブで使っているデータ元）
function setSource(src) {
  $("#source").textContent = src?.name ?? "—";
  $("#source").href = src?.url ?? "#";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---- タブ（ショー／待ち時間）--------------------------------------------------
const shows = initShows({ onSource: (src) => state.view === "shows" && setSource(src) });

function showView(view) {
  state.view = view === "waits" ? "waits" : "shows";
  save("view", state.view);
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === state.view));
  document.querySelectorAll("main[data-view]").forEach((el) => (el.hidden = el.dataset.view !== state.view));
  if (state.view === "shows") {
    shows.activate();
  } else {
    shows.deactivate();
    render();
    if (!state.data || Date.now() - lastLoadAt > REFRESH_ON_RETURN_MS) load();
  }
}
document.querySelectorAll(".tabs button").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
$("#reload").addEventListener("click", () => load());

// ---- 長押し → ドラッグで並び替え ------------------------------------------
// スマホはタッチ、PC はマウスで操作する。短いタップやスクロールでは始まらない。
const LONG_PRESS_MS = 400; // これだけ指を止めて押し続けると並び替え開始
const MOVE_TOLERANCE = 8; // 長押しが成立する前にこれ以上動いたらスクロールとみなしてやめる
const EDGE = 70; // 画面の上下端からこの距離に入ったら自動でスクロール
let press = null; // { li, x, y, timer }
let drag = null; // { li, items, from, to, startPageY, centers, shift, clientY, raf }

function startPress(target, x, y) {
  const li = target.closest?.(".item");
  if (!li || target.closest(".fav") || drag) return;
  li.classList.add("pressing");
  press = { li, x, y, timer: setTimeout(beginDrag, LONG_PRESS_MS) };
}

function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press.li.classList.remove("pressing");
  press = null;
}

function beginDrag() {
  const { li, y } = press;
  cancelPress();
  const items = [...$("#list").querySelectorAll(".item")];
  const rects = items.map((el) => el.getBoundingClientRect());
  const from = items.indexOf(li);
  const gap = rects.length > 1 ? Math.abs(rects[1].top - rects[0].bottom) : 8;
  drag = {
    li, items, from, to: from, clientY: y, startPageY: y + scrollY,
    centers: rects.map((r) => r.top + scrollY + r.height / 2),
    shift: rects[from].height + gap,
  };
  li.classList.add("dragging");
  document.body.classList.add("reordering");
  navigator.vibrate?.(15);
  drag.raf = requestAnimationFrame(autoScroll);
}

function updateDrag() {
  const { li, items, from, centers, shift } = drag;
  const dy = drag.clientY + scrollY - drag.startPageY;
  li.style.transform = `translateY(${dy}px) scale(1.03)`;
  const center = centers[from] + dy;
  // 自分以外で、中心が今の位置より上にあるカードの数 = 落とす位置
  const to = centers.filter((c, i) => i !== from && c < center).length;
  drag.to = to;
  items.forEach((el, i) => {
    if (i === from) return;
    const offset = from < to && i > from && i <= to ? -shift : to < from && i >= to && i < from ? shift : 0;
    el.style.transform = offset ? `translateY(${offset}px)` : "";
  });
}

function autoScroll() {
  if (!drag) return;
  const y = drag.clientY;
  // 持ち上げただけ（まだ指を動かしていない）なら自動スクロールしない。画面の端のカードを持ったとたんに流れないように
  if (Math.abs(y + scrollY - drag.startPageY) > MOVE_TOLERANCE * 2) drag.moved = true;
  const speed = !drag.moved ? 0
    : y < EDGE ? -Math.ceil((EDGE - y) / 6)
    : y > innerHeight - EDGE ? Math.ceil((y - (innerHeight - EDGE)) / 6)
    : 0;
  if (speed) scrollBy(0, speed);
  updateDrag();
  drag.raf = requestAnimationFrame(autoScroll);
}

function endDrag() {
  const { li, items, from, to, raf } = drag;
  cancelAnimationFrame(raf);
  items.forEach((el) => (el.style.transform = ""));
  li.classList.remove("dragging");
  document.body.classList.remove("reordering");
  drag = null;
  if (from !== to) {
    const all = sortedAttractions().map((a) => a.name);
    const visible = items.map((el) => el.dataset.name);
    state.customOrder[state.park] = moveInOrder(all, visible, from, to, state.customOrder[state.park]);
    save("customOrder", state.customOrder);
    state.sort = "custom";
    $("#sort").value = "custom";
    save("sort", state.sort);
  }
  render();
}

const list = $("#list");
// タッチ（スマホ）
list.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) startPress(e.target, e.touches[0].clientX, e.touches[0].clientY);
  else cancelPress();
}, { passive: true });
list.addEventListener("touchmove", (e) => {
  const t = e.touches[0];
  if (drag) {
    e.preventDefault(); // 並び替え中だけスクロールを止める
    drag.clientY = t.clientY;
    updateDrag();
  } else if (press && Math.hypot(t.clientX - press.x, t.clientY - press.y) > MOVE_TOLERANCE) {
    cancelPress(); // 長押しの前に動いた＝スクロール
  }
}, { passive: false });
const touchEnd = (e) => {
  cancelPress();
  if (drag) {
    e.preventDefault();
    endDrag();
  }
};
list.addEventListener("touchend", touchEnd);
list.addEventListener("touchcancel", touchEnd);
// マウス（PC）
list.addEventListener("mousedown", (e) => {
  if (e.button === 0) startPress(e.target, e.clientX, e.clientY);
});
addEventListener("mousemove", (e) => {
  if (drag) {
    drag.clientY = e.clientY;
    updateDrag();
  } else if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) {
    cancelPress();
  }
});
addEventListener("mouseup", () => {
  cancelPress();
  if (drag) endDrag();
});
// 長押しで出るメニュー（Android のコンテキストメニューなど）を出さない
list.addEventListener("contextmenu", (e) => {
  if (press || drag) e.preventDefault();
});

$("#sort").value = state.sort;
$("#sort").addEventListener("change", (e) => {
  state.sort = e.target.value;
  save("sort", state.sort);
  render();
});

$("#favOnly").checked = state.favOnly;
$("#favOnly").addEventListener("change", (e) => {
  state.favOnly = e.target.checked;
  save("favOnly", state.favOnly);
  render();
});

// ☆ボタンは一覧を描き直すたびに作り直されるので、親の #list でまとめてクリックを受け取る
$("#list").addEventListener("click", (e) => {
  const btn = e.target.closest(".fav");
  if (!btn) return;
  const name = btn.dataset.name;
  if (state.favorites.has(name)) state.favorites.delete(name);
  else state.favorites.add(name);
  save("favorites", [...state.favorites]);
  render();
});

showView(state.view);
