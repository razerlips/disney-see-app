// カスタム順（長押しで並び替えた順番）の計算。画面に依存しない部分だけをここに置く（テストしやすいように）。
// 並び順はアトラクション名の配列で覚える（お気に入りと同じく、データ元が変わっても残るように）。

// 覚えている順番に並べる。覚えていない施設（新しく出てきた施設など）は、fallback の順で後ろに付ける
export function sortByCustomOrder(list, order, fallback) {
  const index = new Map((order ?? []).map((name, i) => [name, i]));
  const known = list.filter((a) => index.has(a.name)).sort((a, b) => index.get(a.name) - index.get(b.name));
  const rest = list.filter((a) => !index.has(a.name)).sort(fallback);
  return [...known, ...rest];
}

// 画面に見えている並び（visibleNames）の from 番目を to 番目へ動かし、全体の新しい順番を返す。
//   allNames  … 今の並び順での全施設（★だけ表示で隠れている施設も含む）
//   oldOrder  … これまで覚えていた順番（今のデータにない施設の分も残しておく）
// ★だけ表示中に動かしても、隠れている施設の位置はそのまま。
export function moveInOrder(allNames, visibleNames, from, to, oldOrder = []) {
  const moved = [...visibleNames];
  const [name] = moved.splice(from, 1);
  moved.splice(to, 0, name);
  const visible = new Set(visibleNames);
  let k = 0;
  const next = allNames.map((n) => (visible.has(n) ? moved[k++] : n));
  return [...next, ...oldOrder.filter((n) => !next.includes(n))];
}
