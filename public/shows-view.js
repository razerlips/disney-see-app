// 「ショー」タブの画面。/api/shows から今日のショー時間をもらって、
//   ・いちばん上に「次のショー」（上演中・これからの回を 3 つ、あと何分かつき）
//   ・その下に「時間順」（全ショーの回を 1 本の時刻表に）か「ショー別」（ショーごとに時間を並べる）
// を出す。時刻は 30 秒ごとに見直して、「あと何分」や終わった回の表示を更新する（通信はしない）。

import { nowMinutesJst, performanceState, timeline, upNext, untilText, shortTime, toMinutes, parseTimes, mergeLocal } from "./show-time.js";

const THEMEPARKS = { name: "ThemeParks.wiki", url: "https://themeparks.wiki/" };
const REFRESH_EVERY_MS = 5 * 60 * 1000; // ショー時間の取り直し（開いている間だけ）
const TICK_MS = 30 * 1000; // 「あと何分」の描き直し

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

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const $ = (sel) => document.querySelector(sel);

const SOURCE_MARK = {
  device: `<span class="src" title="このスマホで入力した時間">📱</span>`,
  manual: `<span class="src" title="公式サイトで確認して手入力した時間">🖊️</span>`,
  auto: `<span class="src" title="ThemeParks.wiki から自動で取った時間">🔄</span>`,
};

export function initShows({ onSource }) {
  const state = {
    data: null,
    active: false,
    lastLoadAt: 0,
    mode: loadSaved("showMode", "time"), // "time"（時間順） / "show"（ショー別）
    showPast: loadSaved("showPast", false),
    favOnly: loadSaved("showFavOnly", false),
    favorites: new Set(loadSaved("showFavorites", [])), // ショー名で覚える
    mine: loadSaved("myShowTimes", {}), // このスマホで入力した時間 { "YYYY-MM-DD": [{ name, en, area, times }] }
  };

  const todayJst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  const currentDate = () => state.data?.date ?? todayJst();
  const myEntries = () => state.mine[currentDate()] ?? [];
  const allShows = () => (state.data ? mergeLocal(state.data.shows, myEntries()) : []);

  function showMessage(text, isError = false) {
    const el = $("#shows-message");
    el.textContent = text;
    el.classList.toggle("error", isError);
    el.hidden = !text;
  }

  async function load({ quiet = false } = {}) {
    state.lastLoadAt = Date.now();
    if (!quiet) showMessage("読み込み中…");
    try {
      const res = await fetch("/api/shows");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `エラー（${res.status}）`);
      state.data = body;
      showMessage("");
    } catch (err) {
      console.error(err);
      if (quiet && state.data) {
        showMessage("自動更新できなかったので、前のデータを表示しています。「更新」を押すと取り直します。", true);
      } else {
        state.data = null;
        showMessage("ショー時間を読み込めませんでした 🙇‍♀️ 時間をおいて「更新」を押してください。", true);
      }
    }
    render();
  }

  const visibleShows = () => {
    const all = allShows();
    return state.favOnly ? all.filter((s) => state.favorites.has(s.name)) : all;
  };

  function favButton(name) {
    const on = state.favorites.has(name);
    return `<button class="fav" type="button" data-show="${escapeHtml(name)}" aria-pressed="${on}"
      aria-label="お気に入り${on ? "から外す" : "に追加"}">${on ? "★" : "☆"}</button>`;
  }

  const timeRange = (t) => (t.end ? `${shortTime(t.start)}〜${shortTime(t.end)}` : shortTime(t.start));

  function badge(p, now) {
    if (p.state === "ongoing") return `<span class="when ongoing">● 上演中</span>`;
    if (p.state === "past") return `<span class="when past">終了</span>`;
    const soon = toMinutes(p.time.start) - now <= 30;
    return `<span class="when ${soon ? "soon" : ""}">${untilText(p.time, now)}</span>`;
  }

  // ---- 次のショー ----
  function renderNext(now) {
    const el = $("#next");
    const next = upNext(visibleShows(), now, 3);
    if (!state.data || !allShows().length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    if (!next.length) {
      el.innerHTML = `<p class="next-label">次のショー</p><p class="next-none">今日の${state.favOnly ? "★の" : ""}ショーはぜんぶ終わりました 🌙 おつかれさまでした！</p>`;
      return;
    }
    const [first, ...rest] = next;
    el.innerHTML = `
      <p class="next-label">${first.state === "ongoing" ? "いま上演中" : "次のショー"}</p>
      <div class="next-main">
        <div class="next-time">${shortTime(first.time.start)}</div>
        <div class="next-info">
          <div class="next-name">${escapeHtml(first.show.name)}</div>
          ${first.show.area ? `<div class="area">📍 ${escapeHtml(first.show.area)}</div>` : ""}
          <div>${badge(first, now)}</div>
        </div>
      </div>
      ${rest.length ? `<ul class="next-rest">${rest.map((p) => `
        <li><span class="t">${shortTime(p.time.start)}</span><span class="n">${escapeHtml(p.show.name)}</span>${badge(p, now)}</li>`).join("")}</ul>` : ""}`;
  }

  // ---- 時間順：全ショーの回を 1 本の時刻表に。「いま」の線を入れる ----
  function renderByTime(now) {
    const rows = timeline(visibleShows(), now);
    const shown = state.showPast ? rows : rows.filter((p) => p.state !== "past");
    const hiddenPast = rows.length - shown.length;
    let nowLine = false;
    const html = [];
    if (hiddenPast) html.push(`<li class="past-note muted">終わった回 ${hiddenPast} 件は隠しています（「終わった回」で表示）</li>`);
    for (const p of shown) {
      // 終わった回も出しているときは、終わった回とこれからの回のあいだに「いま」の線を引く
      if (state.showPast && !nowLine && p.state !== "past") {
        nowLine = true;
        if (rows.some((r) => r.state === "past")) html.push(nowLineHtml(now));
      }
      html.push(`
        <li class="item slot ${p.state}">
          <div class="slot-time">${shortTime(p.time.start)}${p.time.end ? `<small>〜${shortTime(p.time.end)}</small>` : ""}</div>
          <div class="info">
            <div class="name">${escapeHtml(p.show.name)} ${SOURCE_MARK[p.show.source] ?? ""}</div>
            ${p.show.area ? `<div class="area">📍 ${escapeHtml(p.show.area)}</div>` : ""}
            ${p.show.note ? `<div class="note">${escapeHtml(p.show.note)}</div>` : ""}
            <div class="status">${badge(p, now)}</div>
          </div>
        </li>`);
    }
    if (state.showPast && !nowLine && rows.length) html.push(nowLineHtml(now));
    return html.join("");
  }

  const nowLineHtml = (now) =>
    `<li class="now-line" aria-label="現在時刻"><span>いま ${Math.floor(now / 60)}:${String(now % 60).padStart(2, "0")}</span></li>`;

  // ---- ショー別：ショーごとのカードに時間のチップを並べる ----
  function renderByShow(now) {
    return visibleShows()
      .map((show) => {
        const perfs = show.times.map((time) => ({ show, time, state: performanceState(time, now) }));
        const allPast = perfs.every((p) => p.state === "past");
        if (allPast && !state.showPast) return "";
        const nextIdx = perfs.findIndex((p) => p.state !== "past");
        const chips = perfs
          .map((p, i) => `<span class="chip ${p.state} ${i === nextIdx ? "is-next" : ""}">${timeRange(p.time)}</span>`)
          .join("");
        return `
          <li class="item show-card ${allPast ? "past" : ""}">
            ${favButton(show.name)}
            <div class="info">
              <div class="name">${escapeHtml(show.name)} ${SOURCE_MARK[show.source] ?? ""}</div>
              ${show.area ? `<div class="area">📍 ${escapeHtml(show.area)}</div>` : ""}
              ${show.note ? `<div class="note">${escapeHtml(show.note)}</div>` : ""}
              <div class="chips">${chips}</div>
              ${nextIdx >= 0 ? `<div class="chip-next">${badge(perfs[nextIdx], now)}</div>` : ""}
            </div>
          </li>`;
      })
      .join("");
  }

  function render() {
    if (!state.active) return;
    const now = nowMinutesJst();
    renderNext(now);
    onSource?.(THEMEPARKS);

    const list = $("#shows");
    const d = state.data;
    $("#shows-updated").textContent = d
      ? `${d.date.slice(5).replace("-", "/")} ・ 取得 ${new Date(d.fetchedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })}`
      : "";
    if (!d) {
      list.innerHTML = "";
      return;
    }
    $("#official-link").href = d.officialUrl;
    if (!allShows().length) {
      list.innerHTML = `<li class="message empty">
        <p>今日のショー時間はまだありません 🫧</p>
        <p class="muted">ThemeParks.wiki に今日の時間が${d.autoAvailable ? "載っていませんでした" : "取れませんでした"}。
        公式アプリか「公式の今日のスケジュール ↗」で見た時間を、「✏️ ショー時間を入力」から入れると、ここに一目で並びます。</p>
      </li>`;
      return;
    }
    const html = state.mode === "show" ? renderByShow(now) : renderByTime(now);
    list.innerHTML =
      html ||
      `<li class="message">${state.favOnly && !visibleShows().length ? "★を付けたショーはまだありません。「ショー別」で☆を押すと登録できます。" : "今日のショーはぜんぶ終わりました 🌙「終わった回」にチェックすると見られます。"}</li>`;
    list.classList.toggle("by-show", state.mode === "show");
  }

  // ---- 操作 ----
  document.querySelectorAll(".seg button").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.mode === state.mode);
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      save("showMode", state.mode);
      document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", b === btn));
      render();
    });
  });
  $("#showPast").checked = state.showPast;
  $("#showPast").addEventListener("change", (e) => {
    state.showPast = e.target.checked;
    save("showPast", state.showPast);
    render();
  });
  $("#showFavOnly").checked = state.favOnly;
  $("#showFavOnly").addEventListener("change", (e) => {
    state.favOnly = e.target.checked;
    save("showFavOnly", state.favOnly);
    render();
  });
  $("#shows-reload").addEventListener("click", () => load());
  $("#shows").addEventListener("click", (e) => {
    const btn = e.target.closest(".fav");
    if (!btn) return;
    const name = btn.dataset.show;
    if (state.favorites.has(name)) state.favorites.delete(name);
    else state.favorites.add(name);
    save("showFavorites", [...state.favorites]);
    render();
  });

  // ---- ショー時間の入力（このブラウザに保存）----
  const dialog = $("#entry");
  const OTHER = "__other__";

  function fillEntryForm(name = "") {
    const catalog = state.data?.catalog ?? [];
    const known = new Set(catalog.map((c) => c.name));
    const extra = myEntries().map((e) => e.name).filter((n) => !known.has(n));
    $("#entry-show").innerHTML = [
      `<option value="">選んでください</option>`,
      ...catalog.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`),
      ...extra.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`),
      `<option value="${OTHER}">その他（名前を入力）</option>`,
    ].join("");
    $("#entry-show").value = name;
    const saved = myEntries().find((e) => e.name === name);
    $("#entry-times").value = saved ? saved.times.map((t) => (t.end ? `${t.start}-${t.end}` : t.start)).join(" ") : "";
    $("#entry-area").value = saved?.area ?? "";
    $("#entry-name-wrap").hidden = true;
    $("#entry-error").hidden = true;
    $("#entry-date").textContent = currentDate().slice(5).replace("-", "/");
    renderEntryList();
  }

  function renderEntryList() {
    const entries = myEntries();
    $("#entry-list").innerHTML = entries.length
      ? `<li class="muted">入力済み（タップで直す）</li>` +
        entries.map((e, i) => `
          <li><button type="button" class="link" data-edit="${i}">${escapeHtml(e.name)}</button>
            <span class="muted">${e.times.map((t) => shortTime(t.start)).join(" ・ ")}</span>
            <button type="button" class="del" data-del="${i}" aria-label="${escapeHtml(e.name)} を消す">🗑️</button></li>`).join("")
      : "";
  }

  function saveMine(entries) {
    const date = currentDate();
    // 昨日より前の入力は消す（たまり続けないように）
    for (const d of Object.keys(state.mine)) if (d < date) delete state.mine[d];
    if (entries.length) state.mine[date] = entries;
    else delete state.mine[date];
    save("myShowTimes", state.mine);
  }

  $("#entry-open").addEventListener("click", () => {
    fillEntryForm();
    dialog.showModal();
  });
  $("#entry-close").addEventListener("click", () => dialog.close());
  $("#entry-show").addEventListener("change", (e) => {
    const other = e.target.value === OTHER;
    $("#entry-name-wrap").hidden = !other;
    if (other) $("#entry-name").focus();
    else fillEntryForm(e.target.value);
  });
  $("#entry-list").addEventListener("click", (e) => {
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-del]");
    if (edit) fillEntryForm(myEntries()[Number(edit.dataset.edit)].name);
    if (del) {
      const entries = [...myEntries()];
      entries.splice(Number(del.dataset.del), 1);
      saveMine(entries);
      renderEntryList();
      render();
    }
  });
  $("#entry-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const choice = $("#entry-show").value;
    const name = (choice === OTHER ? $("#entry-name").value : choice).trim();
    const { times, bad } = parseTimes($("#entry-times").value);
    const error = !name ? "ショーを選んでください" : bad.length ? `読めない時間があります：${bad.join(" ")}` : !times.length ? "時間を 1 つ以上入れてください" : "";
    if (error) {
      $("#entry-error").textContent = error;
      $("#entry-error").hidden = false;
      return;
    }
    const en = state.data?.catalog?.find((c) => c.name === name)?.nameEn ?? null;
    const entries = myEntries().filter((x) => x.name !== name);
    entries.push({ name, en, area: $("#entry-area").value.trim() || null, times });
    saveMine(entries);
    fillEntryForm(); // 続けて次のショーを入れられるように
    render();
  });

  // 「あと何分」の描き直しと、ときどきの取り直し（タブを開いていて、画面を見ているときだけ）
  setInterval(() => {
    if (!state.active || document.visibilityState !== "visible") return;
    if (Date.now() - state.lastLoadAt > REFRESH_EVERY_MS) load({ quiet: true });
    else render();
  }, TICK_MS);
  document.addEventListener("visibilitychange", () => {
    if (!state.active || document.visibilityState !== "visible") return;
    if (Date.now() - state.lastLoadAt > 60 * 1000) load({ quiet: true });
    else render();
  });

  return {
    activate() {
      state.active = true;
      render();
      if (!state.data || Date.now() - state.lastLoadAt > 60 * 1000) load({ quiet: !!state.data });
    },
    deactivate() {
      state.active = false;
    },
  };
}
