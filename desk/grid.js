
export const GAP = 10, PAD = 12;                 // desk.css 의 .deck 과 같아야 한다
export const GRID_MIN = { cols: 6, rows: 4 };
export const GRID_MAX = { cols: 48, rows: 32 };
export const DEFAULT_GRID = { cols: 24, rows: 16 };
export const DEFAULT_PAGES = 2;
export const MAX_PAGES = 8;

/* 더 작게 줄일 수 없는 칸 수 [가로, 세로] */
export const MIN_SIZE = [4, 4];
export const WIDGETS = [
  { id: "clock",   name: "시계",        min: MIN_SIZE },
  { id: "links",   name: "바로가기",    min: MIN_SIZE },
  { id: "now",     name: "지금 수업",   min: MIN_SIZE },
  { id: "periods", name: "오늘 시간표", min: MIN_SIZE },
  { id: "class",   name: "우리 반",     min: MIN_SIZE },
  { id: "book",    name: "교무수첩",    min: MIN_SIZE },
  { id: "gcal",    name: "구글 캘린더", min: MIN_SIZE },
  { id: "todos",   name: "할 일",       min: MIN_SIZE },
  { id: "ddays",   name: "학사 일정",   min: MIN_SIZE },
  { id: "memo",    name: "메모",        min: MIN_SIZE },
  { id: "tt",      name: "주간 시간표", min: MIN_SIZE },
];
export const widgetDef = (id) => WIDGETS.find(w => w.id === id) || null;

export const DEFAULT_LAYOUT = {
  clock:   { pg: 1, x: 1,  y: 1,  w: 6,  h: 4,  on: true },
  links:   { pg: 1, x: 1,  y: 5,  w: 6,  h: 4,  on: true },
  now:     { pg: 1, x: 1,  y: 9,  w: 6,  h: 4,  on: true },
  periods: { pg: 1, x: 1,  y: 13, w: 6,  h: 4,  on: true },
  class:   { pg: 1, x: 7,  y: 1,  w: 6,  h: 16, on: true },
  gcal:    { pg: 1, x: 13, y: 1,  w: 6,  h: 8,  on: true },
  todos:   { pg: 1, x: 13, y: 9,  w: 6,  h: 8,  on: true },
  ddays:   { pg: 1, x: 19, y: 1,  w: 6,  h: 8,  on: true },
  memo:    { pg: 1, x: 19, y: 9,  w: 6,  h: 8,  on: true },
  book:    { pg: 2, x: 1,  y: 1,  w: 18, h: 16, on: true },
  tt:      { pg: 2, x: 19, y: 1,  w: 6,  h: 16, on: true },
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
export const okGrid = (g) => ({
  cols: clamp(g && g.cols, GRID_MIN.cols, GRID_MAX.cols) || DEFAULT_GRID.cols,
  rows: clamp(g && g.rows, GRID_MIN.rows, GRID_MAX.rows) || DEFAULT_GRID.rows,
});
/* 숫자가 아니면 기본값. clamp 만 쓰면 인자를 빼먹었을 때 모든 우젯이 1장으로 끌려온다. */
export const okPages = (n) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 1 ? Math.min(v, MAX_PAGES) : DEFAULT_PAGES;
};

export function normalize(saved, grid, pages) {
  const { cols, rows } = okGrid(grid);
  const pg = okPages(pages == null ? pagesIn(saved) : pages);
  const out = {};
  for (const def of WIDGETS) {
    const s = (saved && saved[def.id]) || DEFAULT_LAYOUT[def.id] || { pg: 1, x: 1, y: 1, w: 4, h: 4, on: true };
    const w = clamp(s.w, Math.min(def.min[0], cols), cols);
    const h = clamp(s.h, Math.min(def.min[1], rows), rows);
    out[def.id] = {
      w, h,
      pg: clamp(s.pg || 1, 1, pg),
      x: clamp(s.x, 1, Math.max(1, cols - w + 1)),
      y: clamp(s.y, 1, Math.max(1, rows - h + 1)),
      on: s.on !== false,
    };
  }
  return resolveOverlaps(out, { cols, rows });
}

/* 큰 것부터 자리를 지키고 겹친 것만 빈자리로 옮긴다. 빈자리가 없으면 그 자리에 둔다. */
export function resolveOverlaps(layout, grid) {
  const order = WIDGETS.map(d => d.id)
    .filter(id => layout[id] && layout[id].on)
    .sort((a, b) => (layout[b].w * layout[b].h) - (layout[a].w * layout[a].h));
  const kept = {};
  for (const id of order) {
    const g = layout[id];
    if (!hits(kept, id, g, g.pg)) { kept[id] = g; continue; }
    const s = freeSlot(kept, id, grid, g.w, g.h, g.pg);
    kept[id] = s ? { ...g, x: s.x, y: s.y } : g;
  }
  for (const id of order) layout[id] = kept[id];
  return layout;
}
export function pagesIn(layout) {
  let n = 1;
  for (const g of Object.values(layout || {})) if (g && g.on !== false) n = Math.max(n, Number(g.pg) || 1);
  return okPages(n);
}

const overlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function hits(layout, id, box, pg) {
  const page = pg || (layout[id] && layout[id].pg) || 1;
  for (const [k, g] of Object.entries(layout)) {
    if (k === id || !g.on || (g.pg || 1) !== page) continue;
    if (overlap(box, g)) return true;
  }
  return false;
}

export function freeSlot(layout, id, grid, w, h, pg) {
  const { cols, rows } = okGrid(grid);
  for (let y = 1; y <= rows - h + 1; y++) {
    for (let x = 1; x <= cols - w + 1; x++) {
      if (!hits(layout, id, { x, y, w, h }, pg)) return { x, y };
    }
  }
  return null;
}

export function turnOn(layout, id, grid, pg) {
  const def = widgetDef(id);
  if (!def) return false;
  const g = layout[id];
  const page = pg || g.pg || 1;
  const tries = [[g.w, g.h], [def.min[0], def.min[1]]];
  for (const [w, h] of tries) {
    if (!hits(layout, id, { x: g.x, y: g.y, w, h }, page)) {
      layout[id] = { pg: page, x: g.x, y: g.y, w, h, on: true };
      return true;
    }
    const s = freeSlot(layout, id, grid, w, h, page);
    if (s) { layout[id] = { pg: page, x: s.x, y: s.y, w, h, on: true }; return true; }
  }
  return false;
}
export function moveToPage(layout, id, grid, pg) {
  const g = layout[id];
  if (!g) return false;
  const page = okPages(pg);
  if (!hits(layout, id, { x: g.x, y: g.y, w: g.w, h: g.h }, page)) {
    layout[id] = { ...g, pg: page };
    return true;
  }
  const s = freeSlot(layout, id, grid, g.w, g.h, page);
  if (!s) return false;
  layout[id] = { ...g, pg: page, x: s.x, y: s.y };
  return true;
}

export function cellSize(rect, grid) {
  const { cols, rows } = okGrid(grid);
  return {
    uw: (rect.width - 2 * PAD - (cols - 1) * GAP) / cols + GAP,
    uh: (rect.height - 2 * PAD - (rows - 1) * GAP) / rows + GAP,
  };
}

export function moved(g0, grid, dCol, dRow, dir) {
  const { cols, rows } = okGrid(grid);
  const pg = g0.pg || 1;
  if (!dir) {
    return {
      pg,
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
  return { pg, x, y, w, h, on: true };
}
