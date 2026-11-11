// 화면 전체를 칸(그리드)에 놓는 틀 (2026-11-11).
// 선생님 지시: "교무 수첩은 4단 구성으로 해줘. 그리드는 24칸 16칸으로 해봐.
//              그거 조정하는 설정 기능도 만들어줘" (위젯은 15×10, 수첩은 전체 화면이라 24×16)
//
// 칸 수는 설정에서 바꾼다. 자리는 { x, y, w, h, on } 으로 적어 두고(1부터 센다),
// 배치 모드에서 끌어 옮기거나 테두리를 잡아 크기를 바꾼다.
// mydesk 레포의 방식을 그대로 따랐다: 새로 놓을 때 이미 있는 것을 밀지 않고 빈자리를 찾는다.

export const GAP = 10, PAD = 12;                 // desk.css 의 .deck 과 같아야 한다
export const GRID_MIN = { cols: 6, rows: 4 };
export const GRID_MAX = { cols: 48, rows: 32 };
export const DEFAULT_GRID = { cols: 24, rows: 16 };

/* 우젯 목록. min 은 더 작게 줄일 수 없는 칸 수 [가로, 세로] 다. */
export const WIDGETS = [
  { id: "clock",   name: "시계",        min: [3, 2] },
  { id: "links",   name: "바로가기",    min: [3, 1] },
  { id: "now",     name: "지금 수업",   min: [3, 3] },
  { id: "periods", name: "오늘 시간표", min: [3, 4] },
  { id: "class",   name: "우리 반",     min: [4, 6] },
  { id: "book",    name: "교무수첩",    min: [5, 6] },
  { id: "gcal",    name: "구글 캘린더", min: [3, 3] },
  { id: "todos",   name: "할 일",       min: [3, 3] },
  { id: "ddays",   name: "학사 일정",   min: [3, 3] },
  { id: "memo",    name: "메모",        min: [3, 2] },
  { id: "tt",      name: "주간 시간표", min: [6, 3] },
];
export const widgetDef = (id) => WIDGETS.find(w => w.id === id) || null;

/* 기본 배치: 24칸을 넷으로 나눈 4단(한 단이 6칸). 열 여섯 줄을 꽉 채운다.
   주간 시간표는 자리가 없어 기본으로 꺼 둔다(설정에서 켜면 빈자리를 찾아 놓인다). */
export const DEFAULT_LAYOUT = {
  clock:   { x: 1,  y: 1,  w: 6,  h: 3,  on: true },
  links:   { x: 1,  y: 4,  w: 6,  h: 2,  on: true },
  now:     { x: 1,  y: 6,  w: 6,  h: 4,  on: true },
  periods: { x: 1,  y: 10, w: 6,  h: 7,  on: true },
  class:   { x: 7,  y: 1,  w: 6,  h: 16, on: true },
  book:    { x: 13, y: 1,  w: 6,  h: 16, on: true },
  gcal:    { x: 19, y: 1,  w: 6,  h: 5,  on: true },
  todos:   { x: 19, y: 6,  w: 6,  h: 4,  on: true },
  ddays:   { x: 19, y: 10, w: 6,  h: 4,  on: true },
  memo:    { x: 19, y: 14, w: 6,  h: 3,  on: true },
  tt:      { x: 1,  y: 1,  w: 12, h: 4,  on: false },
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
export const okGrid = (g) => ({
  cols: clamp(g && g.cols, GRID_MIN.cols, GRID_MAX.cols) || DEFAULT_GRID.cols,
  rows: clamp(g && g.rows, GRID_MIN.rows, GRID_MAX.rows) || DEFAULT_GRID.rows,
});

/* 저장해 둔 자리를 지금 칸 수에 맞게 다듬는다. 칸 수를 줄였을 때 밖으로 나간 것을 들여온다. */
export function normalize(saved, grid) {
  const { cols, rows } = okGrid(grid);
  const out = {};
  for (const def of WIDGETS) {
    const s = (saved && saved[def.id]) || DEFAULT_LAYOUT[def.id] || { x: 1, y: 1, w: 4, h: 4, on: true };
    const w = clamp(s.w, Math.min(def.min[0], cols), cols);
    const h = clamp(s.h, Math.min(def.min[1], rows), rows);
    out[def.id] = {
      w, h,
      x: clamp(s.x, 1, Math.max(1, cols - w + 1)),
      y: clamp(s.y, 1, Math.max(1, rows - h + 1)),
      on: s.on !== false,
    };
  }
  return out;
}

const overlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/* 켜져 있는 다른 우젯과 겹치는가 */
export function hits(layout, id, box) {
  for (const [k, g] of Object.entries(layout)) {
    if (k === id || !g.on) continue;
    if (overlap(box, g)) return true;
  }
  return false;
}

/* 빈자리를 찾는다. 위에서 아래로, 왼쪽에서 오른쪽으로 훑는다. 없으면 null. */
export function freeSlot(layout, id, grid, w, h) {
  const { cols, rows } = okGrid(grid);
  for (let y = 1; y <= rows - h + 1; y++) {
    for (let x = 1; x <= cols - w + 1; x++) {
      if (!hits(layout, id, { x, y, w, h })) return { x, y };
    }
  }
  return null;
}

/* 우젯을 켠다. 지금 자리가 비어 있으면 그대로, 아니면 빈자리를 찾는다.
   자리를 못 찾으면 조금 줄여서 다시 본다. 그래도 없으면 false. */
export function turnOn(layout, id, grid) {
  const def = widgetDef(id);
  if (!def) return false;
  const g = layout[id];
  const tries = [[g.w, g.h], [def.min[0], def.min[1]]];
  for (const [w, h] of tries) {
    if (!hits(layout, id, { x: g.x, y: g.y, w, h })) {
      layout[id] = { x: g.x, y: g.y, w, h, on: true };
      return true;
    }
    const s = freeSlot(layout, id, grid, w, h);
    if (s) { layout[id] = { x: s.x, y: s.y, w, h, on: true }; return true; }
  }
  return false;
}

/* 한 칸이 화면에서 몇 픳셀인가. 끌어 옮긴 거리를 칸 수로 바꿀 때 쓴다. */
export function cellSize(rect, grid) {
  const { cols, rows } = okGrid(grid);
  return {
    uw: (rect.width - 2 * PAD - (cols - 1) * GAP) / cols + GAP,
    uh: (rect.height - 2 * PAD - (rows - 1) * GAP) / rows + GAP,
  };
}

/* 끌거나 크기를 바꾼 결과를 칸에 맞춰 돌려준다. dir 가 없으면 옮기기. */
export function moved(g0, grid, dCol, dRow, dir) {
  const { cols, rows } = okGrid(grid);
  if (!dir) {
    return {
      x: clamp(g0.x + dCol, 1, cols + 1 - g0.w),
      y: clamp(g0.y + dRow, 1, rows + 1 - g0.h),
      w: g0.w, h: g0.h, on: true,
    };
  }
  let { x, y, w, h } = g0;
  if (dir.includes("e")) w = clamp(g0.w + dCol, 1, cols + 1 - g0.x);
  if (dir.includes("s")) h = clamp(g0.h + dRow, 1, rows + 1 - g0.y);
  if (dir.includes("w")) { const nx = clamp(g0.x + dCol, 1, g0.x + g0.w - 1); w = g0.w + (g0.x - nx); x = nx; }
  if (dir.includes("n")) { const ny = clamp(g0.y + dRow, 1, g0.y + g0.h - 1); h = g0.h + (g0.y - ny); y = ny; }
  return { x, y, w, h, on: true };
}
