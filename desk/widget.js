// 바탕화면 위젯 (2026-11-11).
// 암호가 걸리지 않은 세 문서만 읽는다: 시간표·종 시간(desk_settings), 할 일, 학사 일정.
// 출결·수합·상담·학생 메모는 암호문이라 비밀번호 없이는 읽을 수 없고,
// 뒤로 사람이 지나가도 학생 이름이 보이면 안 되므로 일부러 올리지 않는다.
import { FB } from "./fb-desk.js";

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? (+m[1]) * 60 + (+m[2]) : NaN; };
const dayIdx = (d) => { const w = d.getDay(); return w >= 1 && w <= 5 ? w - 1 : -1; };

const DEFAULT_BELLS = [
  { s: "08:50", e: "09:35" }, { s: "09:45", e: "10:30" }, { s: "10:40", e: "11:25" },
  { s: "11:35", e: "12:20" }, { s: "13:20", e: "14:05" }, { s: "14:15", e: "15:00" },
  { s: "15:10", e: "15:55" },
];
const state = { tt: null, bells: DEFAULT_BELLS, lunchAfter: 4, todos: [], ddays: [], cal: [] };

/* ---------- 시계 ---------- */
function tick() {
  const now = new Date();
  $("wClock").innerHTML = `${pad(now.getHours())}:${pad(now.getMinutes())}<span class="sec">${pad(now.getSeconds())}</span>`;
  $("wDate").textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 ${WD[now.getDay()]}요일`;
  $("wNow").textContent = nowText(now);
  renderPeriods(now);
}
function nowText(now) {
  const di = dayIdx(now);
  if (di < 0) return "주말입니다";
  const row = state.tt ? state.tt[di] : null;
  const m = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < 7; i++) {
    const s = toMin(state.bells[i].s), e = toMin(state.bells[i].e);
    if (m >= s && m < e) {
      const c = row && row[i] && row[i].trim();
      return c ? `${i + 1}교시 ${c}` : `${i + 1}교시 공강`;
    }
    if (i < 6 && m >= e && m < toMin(state.bells[i + 1].s)) return `${i + 1}교시 끝, 쉬는 시간`;
  }
  return m < toMin(state.bells[0].s) ? "수업 전입니다" : "오늘 수업은 끝났습니다";
}
function renderPeriods(now) {
  const list = $("wPeriods"), di = dayIdx(now);
  if (di < 0) { list.replaceChildren(li("", "주말에는 수업이 없습니다", "free")); return; }
  const row = state.tt ? state.tt[di] : null;
  if (!row) { list.replaceChildren(li("", "시간표를 아직 못 읽었습니다", "free")); return; }
  const m = now.getHours() * 60 + now.getMinutes();
  const out = [];
  for (let i = 0; i < 7; i++) {
    const c = (row[i] || "").trim();
    const s = toMin(state.bells[i].s), e = toMin(state.bells[i].e);
    const cls = (s <= m && m < e ? "now " : "") + (c ? "" : "free");
    out.push(li(`${i + 1}교시`, c || "공강", cls.trim()));
  }
  list.replaceChildren(...out);
}
function li(k, v, cls) {
  const el = document.createElement("li");
  if (cls) el.className = cls;
  const a = document.createElement("span"); a.className = "k"; a.textContent = k;
  const b = document.createElement("span"); b.className = "v"; b.textContent = v;
  el.append(a, b);
  return el;
}

function renderTodos() {
  const left = state.todos.filter(t => t && !t.done).slice(0, 7);
  $("wTodos").replaceChildren(...(left.length
    ? left.map(t => li("", String(t.text || "")))
    : [li("", "남은 할 일이 없습니다", "free")]));
}
function renderDdays() {
  const t0 = parseDate(todayKey());
  const mine = state.ddays.map(x => ({ title: x.title, date: x.date }));
  const have = new Set(mine.map(x => x.date + " " + x.title));
  for (const c of state.cal) if (c && c.d && c.name && !have.has(c.d + " " + c.name)) mine.push({ title: c.name, date: c.d });
  const items = mine
    .filter(x => x.date && parseDate(x.date) >= t0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7);
  $("wDdays").replaceChildren(...(items.length
    ? items.map(x => {
        const n = Math.round((parseDate(x.date) - t0) / 86400000);
        return li(n === 0 ? "D-DAY" : "D-" + n, x.title);
      })
    : [li("", "앞으로의 일정이 없습니다", "free")]));
}

/* ---------- 자료 읽기 ---------- */
function watch(col, id, apply) {
  const ref = FB.doc(FB.db, col, id);
  FB.onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const body = snap.data() || {};
    try { apply(body.state || {}); } catch (e) {}
  }, () => {});
}
function start() {
  watch("desk_settings", "general", (s) => {
    if (Array.isArray(s.tt) && s.tt.length === 5) state.tt = s.tt;
    if (Array.isArray(s.bells) && s.bells.length === 7) state.bells = s.bells;
    if (Number.isInteger(s.lunchAfter)) state.lunchAfter = s.lunchAfter;
    tick();
  });
  watch("desk_todos", "all", (s) => { state.todos = Array.isArray(s.items) ? s.items : []; renderTodos(); });
  watch("desk_ddays", "all", (s) => { state.ddays = Array.isArray(s.items) ? s.items : []; renderDdays(); });
  watch("desk_calendar", "all", (s) => { state.cal = Array.isArray(s.items) ? s.items : []; renderDdays(); });
}

FB.onAuthStateChanged(FB.auth, (user) => {
  if (user) {
    $("wNote").textContent = "출결·수합·상담은 잠겨 있습니다. 수첩을 열면 보입니다.";
    start();
  } else {
    $("wNote").textContent = "수첩을 열어 로그인해 주세요.";
    $("wPeriods").replaceChildren(li("", "로그인하면 보입니다", "free"));
    $("wTodos").replaceChildren(li("", "로그인하면 보입니다", "free"));
    $("wDdays").replaceChildren(li("", "로그인하면 보입니다", "free"));
  }
});

/* ---------- 수첩 열기 ---------- */
// 타우리 앱에서는 수첩 창을 띄운다. 브라우저에서는 그냥 그 쪽으로 간다.
$("wOpen").addEventListener("click", async () => {
  const T = window.__TAURI__;
  if (T && T.window) {
    try {
      const all = await T.window.getAllWindows();
      const deskWin = all.find(w => w.label === "desk");
      if (deskWin) { await deskWin.show(); await deskWin.unminimize(); await deskWin.setFocus(); return; }
    } catch (e) {}
  }
  location.href = "./index.html";
});

tick();
setInterval(tick, 1000);
