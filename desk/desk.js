import { FB } from "./fb-desk.js";
import * as GCal from "./gcal.js";
import * as Neis from "./neis.js";
import { mergePlans, reconcile, livePlans, unsent } from "./plansync.js";
import { icon as svgIc, resolveIcon } from "../shared/icons.js";
import { WIDGETS, widgetDef, DEFAULT_GRID, DEFAULT_PAGES, MAX_PAGES, GRID_MIN, GRID_MAX,
         okGrid, okPages, normalize, pagesIn, hits, freeSlot, turnOn, moveToPage,
         cellSize, moved } from "./grid.js";
import { loadHoclass, loadLessons, loadSubmissions, setAbsent, fillLessonDate,
         nameChanges, snapshotNames, clsToRoom, studentNoOf, loadRegister, roomToCls,
         loadGrade, loadNote, saveNote, AREA_NAMES, GRADE_AREAS } from "./hoclass.js";

const $ = (id) => document.getElementById(id);
const step = (m) => { try { window.__deskShow("단계", m); } catch (e) {} };
let booted = false;
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = (n) => String(n).padStart(2, "0");
const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WD = ["일", "월", "화", "수", "목", "금", "토"];

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "value") el.value = v;
    else if (k === "html") el.innerHTML = v;   // 코드 안에 박아 둔 그림(svg)만 넣는다. 사용자 글은 넣지 않는다.
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids) if (c != null && c !== false) el.append(c);
  if (tag === "button" && props && ICON_FOR[props.text]) iconize(el, props.text);
  return el;
}
/* 추가, 삭제 같은 흔한 동작 단추는 글 대신 SVG 아이콘(선생님 지시 2026-11-14). 이름은 마우스를 올리면(title) 보이고
   화면낭독기(aria-label)가 읽는다. 단추마다 고치지 않고 h() 가 글자를 보고 바꾼다. */
const ICON_FOR = { "추가": "plus", "과목 추가": "plus", "장 추가": "plus", "삭제": "trash-2", "장 삭제": "trash-2",
  "고치기": "square-pen", "편집": "square-pen", "저장": "check", "적용": "check", "취소": "x", "그만두기": "x", "닫기": "x", "×": "x",
  "D-day 추가": "plus", "완료 항목 삭제": "trash-2" };
/* 머리줄 한 줄(화면 규칙): 제목 | 기능 단추 | 안내, 오류 | 맨 오른쪽 아이콘 동작 단추. 그 아래가 내용이고 내용 아래에는 아무것도 두지 않는다.
   items 는 아무 차례로 넘긴다. 아이콘 단추(.icon-btn)는 오른쪽 끝, 글(NOTE_CLS, 글자)은 가운데, 나머지는 제목 옆 기능 자리로 간다. */
const NOTE_CLS = ["hd-note", "form-err", "tip", "hint", "set-state", "att-sum", "card-aside"];
function hd(tag, title, items = [], tcls = "", rcls = "") {
  const fn = [], note = [], acts = [];
  for (const x of [items].flat(2)) {
    if (x == null || x === false || x === "") continue;
    if (typeof x === "string") { note.push(h("span", { class: "hd-note", text: x })); continue; }
    const c = x.classList;
    if (c && c.contains("icon-btn")) acts.push(x);
    else if (c && NOTE_CLS.some(k => c.contains(k))) note.push(x);
    else fn.push(x);
  }
  return h("div", { class: "hd" + (rcls ? " " + rcls : "") },
    title == null || title === "" ? null : typeof title === "string" ? h(tag, { class: "hd-t" + (tcls ? " " + tcls : ""), text: title }) : title,
    ...fn, ...note, acts.length ? h("div", { class: "hd-acts" }, ...acts) : null);
}
/* 글자 없이 아이콘만 있는 동작 단추. 이름은 aria-label 과 title(마우스를 올리면 보인다)로만 둔다. */
function iconBtn(label, ic, onclick, props = {}) {
  const b = h("button", { class: "btn small secondary", type: "button", ...props, onclick });
  b.setAttribute("aria-label", label);
  b.title = label;
  b.classList.add("icon-btn");
  b.innerHTML = svgIc(ic, 16);
  return b;
}
/* 적어 둔 글을 그 자리에서 고친다(할 일, 계획, 옛 업무). 글을 누르면 칸이 되고 Enter 나 다른 데를 누르면 저장, ESC 는 그대로.
   고치는 중인 것은 fix 하나에 둔다. 다른 기기 변경으로 다시 그려도 적던 글과 커서를 잃지 않게 하려는 것이다. */
let fix = null;                                       // { key, v }
const fixing = (key) => !!fix && fix.key === key;
function startFix(key, text, redraw) { fix = { key, v: text }; redraw(); }
function fixInput(key, orig, max, label, onSave, redraw) {
  const inp = h("input", { type: "text", class: "fix-in", "data-fix": key, maxlength: String(max), autocomplete: "off", value: fix.v, "aria-label": label + " 고치기",
    oninput: (e) => { if (fixing(key)) fix.v = e.target.value; } });
  const end = (ok) => {
    if (!fixing(key)) return;
    const v = inp.value.trim();
    fix = null;
    if (ok && v && v !== orig) onSave(v.slice(0, max)); else redraw();
  };
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); end(true); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(false); }
  });
  // 다시 그려 칸이 바뀐 것은 떠난 것이 아니다(옛 칸은 문서에서 빠져 있다)
  inp.addEventListener("blur", () => setTimeout(() => { if (inp.isConnected) end(true); }, 0));
  for (const ev of ["pointerdown", "click"]) inp.addEventListener(ev, (e) => e.stopPropagation());
  setTimeout(() => { if (inp.isConnected && document.activeElement !== inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }, 0);
  return inp;
}
/* 누르면 고치는 글. 끌기(할 일)와 칸 누르기(계획 칸)로 번지지 않게 여기서 멈춘다. */
function fixText(cls, text, title, key, orig, redraw, extra = {}) {
  const go = (e) => { e.stopPropagation(); startFix(key, orig, redraw); };
  return h("span", { class: cls + " fixable", text, title, role: "button", tabindex: "0", onclick: go,
    onkeydown: (e) => { if (e.key === "Enter") go(e); }, ...extra });
}
function iconize(el, label) {
  if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", label);
  if (!el.title) el.title = el.getAttribute("aria-label");
  el.classList.add("icon-btn");
  el.innerHTML = svgIc(ICON_FOR[label], 16);
}
const CHEV = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const CHEV_L = CHEV("M15 6l-6 6 6 6"), CHEV_R = CHEV("M9 6l6 6-6 6");
let toastT = null;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = h("div", { class: "toast", role: "status" }); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
}
/* 지우기는 한 번 누르면 바로, 대신 실행취소(선생님 지시 2026-11-15 "두 번 눌러서 지우기 없애고 한 번 누르면 지우되
   되돌리기 버튼"). 지우기 직전 값을 떠 두었다가 「실행취소」로 되돌린다. 마지막 한 번만 되돌린다.
   back 은 누를 때 값을 떠서 되돌리는 함수를 돌려준다. run 이 글을 돌려주면 그 글을 띄운다. */
let undoBack = null, undoT = 0;
const docBack = (D) => () => { const v = clone(D.value); return () => { D.value = v; saveEnc(D); }; };
function undoable(back, run, msg = "지웠습니다") {
  const b = back(), said = run();
  undoBack = b;
  let bar = document.querySelector(".undo-bar");
  if (!bar) { bar = h("div", { class: "toast undo-bar", role: "status" }); document.body.append(bar); }
  bar.replaceChildren(h("span", { text: typeof said === "string" ? said : msg }),
    h("button", { class: "undo-btn", type: "button", id: "undoBtn", text: "실행취소", onclick: undoNow }));
  bar.hidden = false;
  const t = document.querySelector(".toast:not(.undo-bar)"); if (t) t.hidden = true;
  clearTimeout(undoT); undoT = setTimeout(() => { bar.hidden = true; }, 10000);
}
function undoNow() {
  if (!undoBack) return;
  const b = undoBack; undoBack = null; b();
  const bar = document.querySelector(".undo-bar"); if (bar) bar.hidden = true;
  renderNb(); if (setOpen) renderSet();
  toast("되돌렸습니다");
}
/* 스크롤바 대신 흐림(선생님 지시 2026-11-15 "모든 영역에서 스크롤 대신 아래 페이드아웃, 스크롤할 여지가 있다는 걸"):
   스크롤바는 모두 숨기고(desk.css), 더 내릴 것이 있는 칸에 fade-b(아래), 옆으로 더 있는 칸에 fade-r 을 붙인다. 끝에 닿으면 걷는다.
   화면이 바뀔 때(MutationObserver), 크기가 바뀔 때, 칸을 굴릴 때 다시 본다. */
function fadeOf(el) {
  if (!(el instanceof Element)) return;
  const canY = el.scrollHeight - el.clientHeight > 2, canX = el.scrollWidth - el.clientWidth > 2;
  let y = false, x = false;
  if (canY || canX) {
    const cs = getComputedStyle(el);
    y = canY && /auto|scroll/.test(cs.overflowY) && el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    x = canX && /auto|scroll/.test(cs.overflowX) && el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
  }
  if (el.classList.contains("fade-b") !== y) el.classList.toggle("fade-b", y);
  if (el.classList.contains("fade-r") !== x) el.classList.toggle("fade-r", x);
}
let fadeQ = 0;
function fadeScan() {
  cancelAnimationFrame(fadeQ);
  fadeQ = requestAnimationFrame(() => { for (const el of document.body.querySelectorAll("*")) fadeOf(el); });
}
new MutationObserver(fadeScan).observe(document.body, { childList: true, subtree: true });
window.addEventListener("resize", fadeScan);
document.addEventListener("scroll", (e) => fadeOf(e.target), { capture: true, passive: true });
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("복사했습니다"); }
  catch (e) {
    const ta = h("textarea", { value: text, style: "position:fixed;left:-9999px" });
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove(); toast(ok ? "복사했습니다" : "복사가 막혀 있습니다. 직접 선택해 복사해 주세요");
  }
}

/* ---------- 일반 정보 ---------- */
/* 08:50 시작, 45분 수업, 10분 쉬는 시간, 4교시 뒤 1시간 점심. */
const DEFAULT_BELLS = [
  { s: "08:50", e: "09:35" }, { s: "09:45", e: "10:30" }, { s: "10:40", e: "11:25" }, { s: "11:35", e: "12:20" },
  { s: "13:20", e: "14:05" }, { s: "14:15", e: "15:00" }, { s: "15:10", e: "15:55" },
];
const EXAMPLE_TT = [
  ["2-1", "", "2-3", "2-5", "", "2-2", ""],
  ["", "2-4", "2-1", "", "2-3", "", ""],
  ["2-2", "2-5", "", "2-4", "", "창체", "창체"],
  ["", "2-3", "2-2", "", "2-1", "2-4", ""],
  ["2-5", "", "2-4", "2-2", "", "동아리", ""],
];
/* 업무포털과 나이스도 지울 수 있어야 한다(선생님 지시 2026-11-13). 코드에 박아 두지 않고 목록에 넣는다. */
const OFFICIAL_LINKS = () => [
  { id: uid(), name: "업무포털", url: "https://ice.eduptl.kr", icon: "landmark" },
  { id: uid(), name: "나이스", url: "https://ice.neis.go.kr", icon: "layout-grid" },
];
const TEACHER_LINKS = () => [
  ...OFFICIAL_LINKS(),
  { id: uid(), name: "에듀넷 티-클리어", url: "https://www.edunet.net" },
  { id: uid(), name: "학교알리미", url: "https://www.schoolinfo.go.kr" },
  { id: uid(), name: "구글 클래스룸", url: "https://classroom.google.com" },
  { id: uid(), name: "클래스팅", url: "https://www.classting.com" },
  { id: uid(), name: "패들렛", url: "https://padlet.com" },
  { id: uid(), name: "띵커벨", url: "https://www.tkbell.co.kr" },
];
const TEACHER_TODOS = () => [
  { id: uid(), text: "주간 시간표를 내 시간표로 바꾸기", done: false, q: 0 },
  { id: uid(), text: "설정의 수업, 담임 탭에서 반 넣기", done: false, q: 0 },
  { id: uid(), text: "기말고사, 방학식 날짜를 D-day에 등록하기", done: false, q: 1 },
];

const academicYear = (d = new Date()) => d.getMonth() >= 2 ? d.getFullYear() : d.getFullYear() - 1;
const clone = (x) => JSON.parse(JSON.stringify(x));
const arr = (x) => Array.isArray(x) ? x : null;
/* 학교의 학년도별 학년별 반 수 { "2026": { "1": 5 } } */
function cleanRooms(r) {
  const out = {};
  if (!r || typeof r !== "object") return out;
  for (const [y, gs] of Object.entries(r)) {
    if (!/^\d{4}$/.test(y) || !gs || typeof gs !== "object") continue;
    const g = {};
    for (const [k, n] of Object.entries(gs)) if (/^[1-6]$/.test(k) && Number.isInteger(n) && n > 0 && n <= 30) g[k] = n;
    if (Object.keys(g).length) out[y] = g;
  }
  return out;
}

const state = {
  links: TEACHER_LINKS(),
  todos: TEACHER_TODOS(),
  memo: "",
  ddays: [
    { id: uid(), title: "크리스마스", date: "2026-12-25" },
    { id: uid(), title: "2027년 새해", date: "2027-01-01" },
  ],
  bells: DEFAULT_BELLS.map(b => ({ ...b })),
  lunchAfter: 4,
  tt: EXAMPLE_TT.map(r => [...r]),
  ttSubj: Array.from({ length: 5 }, () => Array(7).fill("")),
  // 담임 반 주간 시간표(과목 이름). 오늘 시간표 위젯이 내 수업 옆에 우리 반 줄을 보인다(선생님 지시 2026-11-17)
  ttCls: Array.from({ length: 5 }, () => Array(7).fill("")),
  // 기초 시간표(선생님 지시 2026-11-15): 진도 계획의 바탕. 칸마다 학급과 과목. 위젯 주간 시간표는 나이스가 매주 덮어써서 따로 둔다
  baseTT: Array.from({ length: 5 }, () => Array(7).fill("")),
  baseSubj: Array.from({ length: 5 }, () => Array(7).fill("")),   // 칸마다 과목(나이스로 받을 때 채운다). 같은 반을 두 과목 가르칠 때 가른다
  ttExample: true,
  ttAuto: "",                   // 시간표를 저절로 받은 날(하루 한 번)
  idleMin: 15,
  year: { configured: false, current: academicYear(), years: {} },
  grid: { ...DEFAULT_GRID },
  pages: DEFAULT_PAGES,
  layout: normalize(null, DEFAULT_GRID, DEFAULT_PAGES),
  school: "",
  neis: { key: "", school: null, subject: "", subjects: [] },   // 나이스에서 받아오기
  cal: [], calSchool: "", calAt: "",
  gcalCal: "", gcalPick: null,  // 구글 「교무수첩」 캘린더 id, 가져올 캘린더(null 이면 기본 캘린더만)
};

const cfg = () => state.year.years[state.year.current] || { homeroom: "", classes: [] };
const classLabel = (c) => { const m = /^(\d+)-(\d+)$/.exec(c || ""); return m ? `${m[1]}학년 ${m[2]}반` : (c || ""); };

/* ---------- 호클래스에서 읽어 온 것 ---------- */
let hc = null, hcBusy = false, hcErr = "", hcWarns = [];
async function loadHc() {
  if (hcBusy || !signedIn || !state.year.configured) return;
  hcBusy = true; hcErr = "";
  try {
    hc = await loadHoclass(FB, state.year.current);
    checkNames();
    loadHcLessons();
  } catch (e) {
    hcErr = "호클래스 명단을 읽지 못했습니다. 새로고침해 보세요.";
  } finally {
    hcBusy = false;
    renderClass(); renderBook();
  }
}
let hcLessons = {};
const subCache = new Map();
let sendBusy = false, sendPlan = null;

async function loadHcLessons() {
  if (!hc) return;
  try { hcLessons = await loadLessons(FB, hc); } catch (e) { hcLessons = {}; }
  renderBook();
}
function lessonsOf(cls) {
  const all = hcLessons[cls] || [], c = curSubj();
  if (!c) return all;
  const mine = all.filter(x => x.subject === c);
  return mine.length || all.some(x => subjOfCls(cls).includes(x.subject)) ? mine : all;
}
async function wantSubs(clId) {
  if (!clId || subCache.has(clId)) return;
  subCache.set(clId, {});
  try { subCache.set(clId, await loadSubmissions(FB, clId)); } catch (e) {}
  renderClass(); renderBook();
}

const hcClasses = () => (hc && hc.year === String(state.year.current) ? hc.classes : []);
const hcHas = (cls) => hcClasses().includes(cls);

function cardClasses() {
  const c = cfg(), out = [];
  if (c.homeroom) out.push(c.homeroom);
  for (const x of hcClasses()) if (x && !out.includes(x)) out.push(x);
  for (const x of c.classes || []) if (x && !out.includes(x)) out.push(x);
  return out;
}
let pickedCls = "";
/* 수업 장에서 고를 반: 호클래스 강의실 반과 수업 반(담임 반도 수업 반에 넣었으면 들어온다) */
function lessonClasses() {
  const out = [];
  for (const x of [...hcClasses(), ...(cfg().classes || [])]) if (x && !out.includes(x)) out.push(x);
  return out.sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
}
/* 지금 보는 반: 담임 장은 담임 반, 그 밖에는 수업 장에서 고른 반 */
function picked() {
  if (nbKey() === "home") return cfg().homeroom || "";
  const list = subjClasses();
  if (!list.includes(pickedCls)) pickedCls = list[0] || "";
  return pickedCls;
}
function parseClasses(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/(\d+)\s*(?:-|학년)\s*(\d+)\s*반?/g)) {
    const c = `${Number(m[1])}-${Number(m[2])}`;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

const SPECS = [
  { key: "desk_settings",
    /* 주간 시간표는 5×7 이지만 **한 줄로 펴서** 담는다.
       파이어스토어는 배열 안에 배열을 담지 못한다(넣으려 들면 저장이 통째로 막힌다). */
    pick: () => ({ links: state.links, officials: true, bells: state.bells, lunchAfter: state.lunchAfter, tt: state.tt.flat(), ttSubj: state.ttSubj.flat(), ttCls: state.ttCls.flat(), baseTT: state.baseTT.flat(), baseSubj: state.baseSubj.flat(), ttExample: state.ttExample, ttAuto: state.ttAuto, idleMin: state.idleMin, school: state.school, neis: state.neis,
      gcalCal: state.gcalCal || "", gcalPick: Array.isArray(state.gcalPick) ? state.gcalPick : null }),
    put: (s) => {
      if (arr(s.links)) {
        state.links = s.links.filter(l => l && typeof l.url === "string")
          .map(l => ({ ...l, icon: typeof l.icon === "string" ? l.icon.slice(0, 20) : "" }));
        /* 옛 자료에는 업무포털과 나이스가 코드에 박혀 있어 목록에 없다. 한 번만 앞에 끼운다.
           주소로 걸러 두 번 끼우지 않는다 — 저장이 늦어 이 길로 다시 들어와도 늘어나지 않는다. */
        if (!s.officials) {
          const have = new Set(state.links.map(l => l.url));
          state.links = [...OFFICIAL_LINKS().filter(o => !have.has(o.url)), ...state.links];
          addOfficials = true;
        }
      }
      if (arr(s.bells) && s.bells.length === 7) state.bells = s.bells.map(b => ({ s: String(b.s || ""), e: String(b.e || "") }));
      if (Number.isInteger(s.lunchAfter) && s.lunchAfter >= 1 && s.lunchAfter <= 6) state.lunchAfter = s.lunchAfter;
      // 펴서 담은 35칸, 옛 5×7 모양 둘 다 읽는다(브라우저에 남은 옛 사본이 있다)
      if (arr(s.tt)) {
        const flat = arr(s.tt[0]) ? s.tt.flat() : s.tt;
        state.tt = Array.from({ length: 5 }, (_, d) => Array.from({ length: 7 }, (_, p) => String(flat[d * 7 + p] || "")));
      }
      const grid35 = (a, n) => Array.from({ length: 5 }, (_, d) => Array.from({ length: 7 }, (_, p) => String(a[d * 7 + p] || "").slice(0, n)));
      if (arr(s.ttSubj)) state.ttSubj = grid35(s.ttSubj, 20);
      if (arr(s.ttCls)) state.ttCls = grid35(s.ttCls, 20);
      if (arr(s.baseTT)) state.baseTT = grid35(s.baseTT, 12);
      if (arr(s.baseSubj)) state.baseSubj = grid35(s.baseSubj, 20);
      state.ttExample = !!s.ttExample;
      if (typeof s.ttAuto === "string") state.ttAuto = s.ttAuto.slice(0, 10);
      if ([5, 15, 30, 60].includes(s.idleMin)) state.idleMin = s.idleMin;
      if (typeof s.school === "string") state.school = s.school.slice(0, 40);
      if (s.neis && typeof s.neis === "object") {
        const n = s.neis, sc = n.school;
        state.neis = {
          key: typeof n.key === "string" ? n.key : "",
          subject: typeof n.subject === "string" ? n.subject.slice(0, 20) : "",
          subjects: (arr(n.subjects) || []).slice(0, 10).map(x => ({
            name: typeof x.name === "string" ? x.name.slice(0, 20) : "",
            classes: (arr(x.classes) || []).map(String).filter(c => /^\d+-\d+$/.test(c)),
          })).filter(x => x.name),
          school: sc && typeof sc.atpt === "string" && typeof sc.code === "string"
            ? { name: String(sc.name || ""), atpt: sc.atpt, code: sc.code, kind: String(sc.kind || ""), rooms: cleanRooms(sc.rooms) } : null,
        };
      }
      // 구글 「교무수첩」 캘린더 id, 가져올 캘린더(null 이면 기본 캘린더만)
      if (typeof s.gcalCal === "string") state.gcalCal = s.gcalCal.slice(0, 200);
      state.gcalPick = arr(s.gcalPick) ? s.gcalPick.map(String).slice(0, 50) : null;
    } },
  { key: "desk_year",
    pick: () => state.year,
    put: (s) => {
      const years = {};
      for (const [y, v] of Object.entries(s.years && typeof s.years === "object" ? s.years : {})) {
        years[y] = { homeroom: typeof v.homeroom === "string" ? v.homeroom : "", classes: (arr(v.classes) || []).map(String) };
      }
      state.year = { configured: !!s.configured, current: Number.isInteger(s.current) ? s.current : academicYear(), years };
    } },
  { key: "desk_grid",
    pick: () => ({ grid: state.grid, pages: state.pages, layout: state.layout }),
    put: (s) => {
      state.grid = okGrid(s.grid);
      const L = s.layout && typeof s.layout === "object" ? { ...s.layout } : s.layout;
      const moved = !!(L && (L.class || L.book));
      if (moved) {
        // 우리 반, 교무수첩 위젯은 교무수첩 장으로 빠졌다(2026-11-13). 우리 반이 1장에 있었으면 주간 시간표가 그 자리로.
        if (L.class && L.class.on !== false && (L.class.pg || 1) === 1 && L.tt && (L.tt.pg || 1) !== 1) L.tt = { ...L.class, on: true };
        delete L.class; delete L.book;
        gridMoved = true;
      }
      state.pages = okPages(s.pages || pagesIn(L));
      state.layout = normalize(L, state.grid, state.pages);
      if (moved) {
        const used = Math.max(1, ...Object.values(state.layout).filter(b => b.on).map(b => b.pg));
        if (state.pages > used) { state.pages = used; state.layout = normalize(state.layout, state.grid, used); }
      }
    } },
  { key: "desk_calendar",
    pick: () => ({ school: state.calSchool, at: state.calAt, items: state.cal }),
    put: (s) => {
      state.cal = arr(s.items) ? s.items.filter(x => x && typeof x.d === "string" && typeof x.name === "string").slice(0, 400) : [];
      state.calSchool = typeof s.school === "string" ? s.school : "";
      state.calAt = typeof s.at === "string" ? s.at : "";
    } },
  { key: "desk_todos",
    pick: () => ({ items: state.todos }),
    put: (s) => { if (arr(s.items)) state.todos = s.items.filter(t => t && typeof t.text === "string"); } },
  { key: "desk_ddays",
    pick: () => ({ items: state.ddays }),
    put: (s) => { if (arr(s.items)) state.ddays = s.items.filter(x => x && typeof x.date === "string"); } },
  { key: "desk_memo",
    pick: () => ({ text: state.memo }),
    put: (s) => { if (document.activeElement !== memoEl && typeof s.text === "string") state.memo = s.text; } },
];

/* ---------- 암호화 ---------- */
const KDF_ITER = 600000, te = new TextEncoder(), td = new TextDecoder();
const hasCrypto = !!(window.crypto && window.crypto.subtle);
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
function b64(buf) {
  const a = new Uint8Array(buf); let s = "";
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const normPass = (s) => String(s).normalize("NFC");
const normRec = (s) => String(s).toUpperCase().replace(/[^0-9A-Z]/g, "");

async function deriveKek(secret, salt, iter) {
  const base = await crypto.subtle.importKey("raw", te.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function wrapRaw(raw, secret, label) {
  const salt = rnd(16), iv = rnd(12);
  const kek = await deriveKek(secret, salt, KDF_ITER);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(label) }, kek, raw);
  return { salt: b64(salt), iter: KDF_ITER, iv: b64(iv), ct: b64(ct) };
}
async function unwrapRaw(w, secret, label) {
  const kek = await deriveKek(secret, unb64(w.salt), w.iter);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(w.iv), additionalData: te.encode(label) }, kek, unb64(w.ct)));
}
const importData = (raw) => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
async function seal(key, docKey, value) {
  const plain = te.encode(JSON.stringify(value)), iv = rnd(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(docKey) }, key, plain);
  return { v: 1, iv: b64(iv), c: b64(ct), at: Date.now() };
}
async function unseal(key, docKey, body) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(body.iv), additionalData: te.encode(docKey) }, key, unb64(body.c));
  return JSON.parse(td.decode(pt));
}
function makeRecovery() {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ", bytes = rnd(20);
  let bits = 0, n = 0, out = "";
  for (const b of bytes) {
    n = (n << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; out += A[(n >>> bits) & 31]; n &= (1 << bits) - 1; }
  }
  return out;
}
const showRecovery = (s) => s.match(/.{1,4}/g).join("-");

let dataKey = null, recoveryToShow = null;

/* ---------- 저장 ---------- */
const LS_PREFIX = "my-desk-v3:";
function lsGet(k) { try { const r = localStorage.getItem(LS_PREFIX + k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); } catch (e) {} }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let cloud = null, cloudFailed = false, syncNote = "";
let retryTimer = null, retryWait = 6000;   // 끊겼을 때 다시 붙기
let signedIn = null;

/* ---------- 저장 창구 ---------- */
const DOC_MAP = {
  desk_settings: ["desk_settings", "general"],
  desk_year:     ["desk_years",    "all"],
  desk_calendar: ["desk_calendar", "all"],
  desk_grid:     ["desk_grid",     "all"],
  desk_todos:    ["desk_todos",    "all"],
  desk_ddays:    ["desk_ddays",    "all"],
  desk_memo:     ["desk_memo",     "all"],
  desk_crypto:   ["desk_crypto",   "keys"],
};
const YEAR_COLS = ["roster", "collects", "notices", "students", "consults", "lessons", "works"];
const DESK_COLS = [...new Set(Object.values(DOC_MAP).map(p => p[0]))]
  .concat(["desk_att"], YEAR_COLS.map(k => "desk_" + k));
const RE_ATT = /^y(\d{4})_att_(\d{4}-\d{2}-\d{2})_(.+)$/;
const RE_YEAR = new RegExp("^y(\\d{4})_(" + YEAR_COLS.join("|") + ")$");

function docPath(key) {
  if (DOC_MAP[key]) return DOC_MAP[key];
  let m = RE_ATT.exec(key);
  if (m) return ["desk_att", m[1] + "_" + m[3] + "_" + m[2]];
  m = RE_YEAR.exec(key);
  if (m) return ["desk_" + m[2], m[1]];
  throw new Error("모르는 문서 이름: " + key);
}
// 꼬리표(year, room, date)는 평문, 내용은 암호문이다.
function docTags(key) {
  const m = RE_ATT.exec(key);
  if (m) return { year: m[1], room: m[3], date: m[2] };
  const y = /^y(\d{4})_/.exec(key);
  return y ? { year: y[1] } : {};
}
const wrapSnap = (s) => ({ exists: s.exists(), data: () => s.data(), metadata: s.metadata });
function cloudRef(key) {
  const [col, id] = docPath(key);
  const ref = FB.doc(FB.db, col, id);
  return {
    get: async () => wrapSnap(await FB.getDoc(ref)),
    set: (body) => FB.setDoc(ref, body),
    onSnapshot: (next, err) => FB.onSnapshot(ref, (snap) => next(wrapSnap(snap)), err),
    // 두 기기가 동시에 만들어도 한쪽만 들어가게 트랜잭션으로 쓴다.
    createOnce: (body, taken) => FB.runTransaction(FB.db, async (tx) => {
      const cur = await tx.get(ref);
      const data = cur.exists() ? cur.data() : null;
      if (data && (!taken || taken(data))) return { ok: false, body: data };
      tx.set(ref, body);
      return { ok: true };
    }),
  };
}
const sync = $("sync");
function setSync(cls, text) {
  sync.className = "sync " + cls;
  sync.textContent = text;
  // 저장이 어긋난 때는 우상단 도구가 마우스 없이도 보이게 한다.
  $("tools").classList.toggle("alert", cls === "warn");
}

function makeDoc(key, o) {
  const local = lsGet(key);
  return { key, enc: !!o.enc, apply: o.apply || null, makeDefault: o.makeDefault || null, pick: o.pick || null, seed: !!o.seed,
    body: local, value: null, ready: false, broken: false, dirty: false, writing: false, pendingBody: null, timer: null, unsub: null, ref: null, confirmed: false, sliceJson: "" };
}
const C = makeDoc("desk_crypto", { apply: () => softClass() });
const plainDocs = SPECS.map((sp) => {
  const d = makeDoc(sp.key, { pick: sp.pick, seed: true, apply: (body) => {
    sp.put(clone(body.state || {}));
    d.sliceJson = JSON.stringify(sp.pick());
    afterPlain();
  } });
  d.sliceJson = JSON.stringify(sp.pick());
  return d;
});
const docs = { roster: null, collects: null, notices: null, att: null, students: null, consults: null, lessons: null, works: null };
const encDocs = () => Object.values(docs).filter(Boolean);
const allDocs = () => [C, ...plainDocs, ...encDocs()];
const sameBody = (a, b) => !!a && !!b && (a.c ? a.c === b.c : a.at === b.at);

/* 끊긴 까닭을 사람이 읽을 말로. 모르면 코드라도 보여 준다(이게 없으면 원인을 못 찾는다). */
function whyOffline(e) {
  const c = (e && e.code) || "";
  if (c.includes("permission-denied")) return "저장소를 읽을 권한이 없습니다";
  if (c.includes("unauthenticated")) return "로그인이 풀렸습니다";
  if (c.includes("unavailable") || c.includes("deadline")) return "저장소에 닿지 않습니다";
  return "저장소 연결이 끊겼습니다" + (c ? " (" + c + ")" : "");
}
function refreshSync() {
  if (!cloud) { setSync("warn", syncNote || (retryTimer ? "다시 연결하는 중" : "이 브라우저에만 저장됨")); return; }
  if (syncNote) { setSync("warn", syncNote); return; }
  if (allDocs().some(d => d.dirty || d.writing || d.pendingBody)) setSync("", "저장 중");
  else setSync("ok", "모든 기기에 저장됨");
}
/* 끊기면 스스로 다시 붙는다. 전에는 한 번 끊기면 새로고침 전까지 영영 끊긴 채였고,
   그동안 "우리 반" 은 눌러도 안 되는 비밀번호 만들기 칸을 계속 보여 주었다. */
function goOffline() {
  cloud = null; cloudFailed = true;
  for (const d of allDocs()) { if (d.unsub) d.unsub(); d.unsub = null; d.ref = null; }
  if (!retryTimer && signedIn) {
    retryTimer = setTimeout(() => { retryTimer = null; reconnect(); }, retryWait);
    retryWait = Math.min(retryWait * 2, 60000);
  }
  refreshSync(); softClass();
}
function reconnect() {
  if (!signedIn || cloud) return;
  cloud = cloudRef; cloudFailed = false; syncNote = "";
  for (const d of allDocs()) subscribe(d);
  refreshSync(); softClass();
}
window.addEventListener("online", () => { retryWait = 6000; reconnect(); });
function encodeBody(d) {
  const tags = docTags(d.key);
  return d.enc
    ? seal(dataKey, d.key, d.value).then(sealed => ({ ...tags, ...sealed }))
    : Promise.resolve({ ...tags, state: clone(d.pick()), at: Date.now() });
}
async function flushDoc(d) {
  if (d.writing) return;
  d.writing = true;
  try {
    while (d.dirty || d.pendingBody) {
      if (d.dirty) {
        if (d.enc && !dataKey) break;
        d.dirty = false;
        const b = await encodeBody(d);
        d.pendingBody = b; d.body = b; lsSet(d.key, b);
      }
      if (!cloud || !d.ref) { d.pendingBody = null; break; }
      const body = d.pendingBody;
      refreshSync();
      try {
        await d.ref.set(body);
        if (d.pendingBody === body) d.pendingBody = null;
        syncNote = "";
      } catch (e) {
        const code = (e && e.code) || "";
        if (code.includes("permission-denied") || code.includes("unauthenticated")) {
          d.pendingBody = null; syncNote = "저장 권한이 없습니다. 다시 로그인해 주세요."; goOffline(); break;
        }
        if (code.includes("invalid-argument") || code.includes("not-found")) {
          d.pendingBody = null;
          syncNote = "저장할 수 없는 자료가 있습니다 (" + d.key + ")";
          goOffline(); break;
        }
        if (code.includes("resource-exhausted") || code.includes("quota")) {
          d.pendingBody = null; syncNote = "저장 공간이 가득 찼습니다. 지난 기록을 줄여 주세요."; break;
        }
        setSync("warn", "다시 저장하는 중");
        await sleep(2000 + Math.random() * 1500);
      }
    }
  } finally {
    d.writing = false;
    refreshSync();
  }
}
function schedule(d, immediate) {
  clearTimeout(d.timer);
  d.timer = setTimeout(() => flushDoc(d), immediate ? 0 : 600);
}
function save(immediate) {
  for (let i = 0; i < plainDocs.length; i++) {
    const d = plainDocs[i], json = JSON.stringify(SPECS[i].pick());
    if (json === d.sliceJson) continue;
    d.sliceJson = json; d.dirty = true; schedule(d, immediate);
  }
}
function saveEnc(d) {
  if (!dataKey || !d.ready || d.broken) return;
  d.dirty = true; schedule(d);
}

async function openEnc(d) {
  const key = dataKey;
  if (!key) { d.value = null; d.ready = false; return; }
  if (!d.body) { d.value = d.makeDefault(); d.ready = true; d.broken = false; return; }
  const body = d.body;
  try {
    const v = await unseal(key, d.key, body);
    if (d.body !== body || dataKey !== key) return;
    d.value = v; d.ready = true; d.broken = false;
  } catch (e) {
    if (d.body === body) { d.value = null; d.ready = false; d.broken = true; }
  }
}
function subscribe(d) {
  if (!cloud || d.unsub) return;
  try { d.ref = cloud(d.key); } catch (e) { syncNote = "저장할 곳을 못 찾았습니다: " + (e && e.message || ""); goOffline(); return; }
  d.unsub = d.ref.onSnapshot((snap) => {
    const { fromCache, hasPendingWrites } = snap.metadata;
    if (hasPendingWrites) return;
    if (!fromCache) { if (!d.confirmed) retryWait = 6000; d.confirmed = true; }
    if (!snap.exists) {
      if (!fromCache) {
        if (d.body) { if (!d.dirty && !d.pendingBody) { d.pendingBody = d.body; flushDoc(d); } }
        else if (d.seed && !d.dirty) { d.dirty = true; flushDoc(d); }
        if (d === C) softClass();
      }
      if (d.enc && !d.ready && dataKey) openEnc(d).then(softClass);
      return;
    }
    const body = snap.data();
    if (d.dirty || d.writing || d.pendingBody) return;
    if (sameBody(d.body, body)) { if (d === C) softClass(); return; }
    d.body = body; lsSet(d.key, body);
    if (d.enc) openEnc(d).then(softClass);
    else if (d.apply) d.apply(body);
  }, (e) => { syncNote = whyOffline(e); goOffline(); });
}
function attach(d) {
  if (d.enc) openEnc(d).then(softClass);
  else if (d.body && d.apply) d.apply(d.body);
  subscribe(d);
}
function closeDoc(d) {
  if (d.dirty) flushDoc(d);
  if (d.unsub) d.unsub();
  d.unsub = null;
}

let yearOpen = null, attDay = "", attCls = "";
function ensureAtt(day, cls) {
  if (yearOpen == null) return;
  const c = cls || picked();
  if (!c) return;
  if (attDay === day && attCls === c) return;
  if (docs.att) { if (docs.att.ready) attCache.set(docs.att.key, docs.att.value); closeDoc(docs.att); }
  attDay = day; attCls = c;
  docs.att = makeDoc(`y${yearOpen}_att_${day}_${c}`, { enc: true, makeDefault: () => ({ marks: {} }) });
  attach(docs.att);
}
function openYearDocs() {
  const y = state.year.current;
  if (yearOpen === y) return;
  for (const d of encDocs()) closeDoc(d);
  yearOpen = y; attDay = ""; attCls = ""; docs.att = null; pickedCls = "";
  attCache.clear(); attLoaded = "";
  docs.roster = makeDoc(`y${y}_roster`, { enc: true, makeDefault: () => ({ classes: {} }) });
  docs.collects = makeDoc(`y${y}_collects`, { enc: true, makeDefault: () => ({ items: [] }) });
  docs.notices = makeDoc(`y${y}_notices`, { enc: true, makeDefault: () => ({ items: [] }) });
  docs.students = makeDoc(`y${y}_students`, { enc: true, makeDefault: () => ({ byId: {} }) });
  docs.consults = makeDoc(`y${y}_consults`, { enc: true, makeDefault: () => ({ items: [] }) });
  docs.lessons = makeDoc(`y${y}_lessons`, { enc: true, makeDefault: () => ({ items: [] }) });
  docs.works = makeDoc(`y${y}_works`, { enc: true, makeDefault: () => ({ items: [] }) });
  for (const d of encDocs()) if (d !== docs.att) attach(d);
  ensureAtt(todayKey());
}
let addOfficials = false;
let gridMoved = false;         // 옛 배치(우리 반, 교무수첩 위젯)를 옮겼다: 한 번 저장해 다른 기기도 새 배치를 읽게
const settingsDoc = () => plainDocs[SPECS.findIndex(s => s.key === "desk_settings")] || null;
function afterPlain() {
  /* apply() 가 put() 바로 뒤에 sliceJson 을 새로 적어 "이미 저장됨"으로 봐 버린다.
     끼워 넣은 업무포털과 나이스를 남기려면 그 값을 비우고 save() 를 불러야 한다. */
  if (gridMoved) {
    gridMoved = false;
    const d = plainDocs[SPECS.findIndex(s => s.key === "desk_grid")];
    if (d) { d.sliceJson = ""; save(true); }
  }
  if (addOfficials) {
    addOfficials = false;
    const d = settingsDoc();
    if (d) { d.sliceJson = ""; save(true); }
  }
  if (booted) applyGrid();
  openYearDocs();
  if (booted) renderAll();
  if (signedIn && state.year.configured && !hc && !hcBusy) loadHc();
  autoWeek();
}

/* ---------- 잠금 ---------- */
const TAB = uid();
let lastActive = Date.now();
const bump = () => { lastActive = Date.now(); };
["pointerdown", "pointermove", "keydown", "touchstart", "wheel"].forEach(ev => document.addEventListener(ev, bump, { passive: true, capture: true }));

function keyStateNow() {
  if (!hasCrypto) return "unsupported";
  if (dataKey) return recoveryToShow ? "recovery" : "open";
  if (C.body && C.body.pass) return "locked";
  // 끊긴 것을 먼저 본다. 뒤에 두면 눌러도 안 되는 '만들기' 칸을 보여 주게 된다.
  if (!cloud) return "offline";
  if (C.confirmed) return "none";
  return "loading";
}
async function openAllEnc() { await Promise.all(encDocs().map(openEnc)); }
async function useRaw(raw) {
  dataKey = await importData(raw);
  raw.fill(0);
  lastActive = Date.now();
  await openAllEnc();
}
/* 이 기기에서 잠그지 않기(선생님 지시 2026-11-13, 설정 기본 탭 보안). 열쇠(raw)를 이 브라우저 localStorage 에 둔다.
   켜 두면 열 때 비밀번호를 묻지 않고, 한참 안 써도 잠그지 않는다. 기기마다 따로이고 나가기를 누르면 지운다.
   열쇠는 가져온 뒤 꺼낼 수 없게(extractable false) 만들므로 켤 때 비밀번호를 한 번 받아 그때 둔다. */
let keepOn = !!lsGet("keepKey"), keepTried = false;
function forgetKeep() { lsSet("keepKey", null); keepOn = false; }
async function keepWith(pass) {
  if (!C.body || !C.body.pass) throw new Error("교무수첩 비밀번호를 먼저 만들어 주세요.");
  let raw;
  try { raw = await unwrapRaw(C.body.pass, normPass(pass), "pass"); }
  catch (e) { throw new Error("비밀번호가 맞지 않습니다."); }
  lsSet("keepKey", b64(raw)); keepOn = true;
  if (!dataKey) await useRaw(raw); else raw.fill(0);
}
/* 잠긴 채로 열렸고 둔 열쇠가 있으면 한 번만 스스로 연다. 손으로 잠근 뒤에는 다시 열지 않는다(keepTried). */
function tryKeep() {
  const k = keepOn && !keepTried && lsGet("keepKey");
  if (!k) return false;
  keepTried = true;
  useRaw(unb64(k)).then(() => { renderNb(); if (setOpen) renderSet(); }).catch(() => { forgetKeep(); renderNb(); });
  return true;
}
async function lockNow() {
  if (!dataKey) return;
  keepTried = true;
  // 다 보낼 때까지 기다린다. 안 기다리면 나가기가 참조를 지워 마지막 글이 안 올라간다.
  const sending = [];
  for (const d of encDocs()) {
    clearTimeout(d.timer);
    if (d.dirty) {
      d.dirty = false;
      const b = await encodeBody(d);
      d.pendingBody = b; d.body = b; lsSet(d.key, b);
      sending.push(flushDoc(d));
    }
  }
  await Promise.all(sending);
  dataKey = null; recoveryToShow = null;
  for (const d of encDocs()) { d.value = null; d.ready = false; }
  renderClass();
  if (setOpen) renderSet();
}
async function setupKey(pass) {
  if (!cloud || !C.ref) throw new Error("저장소에 연결되지 않았습니다. 인터넷 연결을 확인해 주세요.");
  if (!C.confirmed) throw new Error("저장소를 확인하는 중입니다. 잠시 뒤 다시 시도해 주세요.");
  const raw = rnd(32), rec = makeRecovery();
  const meta = { v: 1, at: Date.now(), pass: await wrapRaw(raw, normPass(pass), "pass"), rec: await wrapRaw(raw, rec, "rec") };
  const got = await C.ref.createOnce(meta, (d) => !!d.pass);
  if (!got.ok) {
    C.body = got.body; lsSet(C.key, got.body); renderClass();
    throw new Error("이미 다른 기기에서 비밀번호를 만들었습니다. 그 비밀번호로 열어 주세요.");
  }
  C.body = meta; lsSet(C.key, meta);
  recoveryToShow = rec;
  await useRaw(raw);
}
async function unlock(pass) {
  let raw;
  try { raw = await unwrapRaw(C.body.pass, normPass(pass), "pass"); }
  catch (e) { throw new Error("비밀번호가 맞지 않습니다. 다시 입력해 주세요."); }
  await useRaw(raw);
}
async function rewrap(secret, newPass) {
  let raw;
  try { raw = await unwrapRaw(C.body.pass, normPass(secret), "pass"); }
  catch (e) {
    try { raw = await unwrapRaw(C.body.rec, normRec(secret), "rec"); }
    catch (e2) { throw new Error("비밀번호나 복구 키가 맞지 않습니다."); }
  }
  const meta = { ...C.body, at: Date.now(), pass: await wrapRaw(raw, normPass(newPass), "pass") };
  C.body = meta; lsSet(C.key, meta);
  if (cloud && C.ref) await C.ref.set(meta);
  return raw;
}

/* ---------- 구글 캘린더 ---------- */
const GCAL_STEPS = [
  { done: true,  text: "승인된 도메인에 hoseong911.github.io 넣기" },
  { done: false, text: "파베 콘솔의 Authentication 메뉴, Sign-in method 탭에서 Google 켜기" },
  { done: true,  text: "구글 클라우드에서 Calendar API 켜기" },
];
let gcalBusy = false, gcalErr = "", gcalStep = 0, gcalDays = [], gcalAt = 0;

async function gcalConnect() {
  if (gcalBusy) return;
  gcalBusy = true; gcalErr = ""; gcalStep = 0; renderGcal();
  try {
    const token = await GCal.connect(FB);
    await gcalLoad(token);
    gcalMonths.clear(); planSync(); gcalCals = null;
  } catch (e) {
    const w = GCal.why(e);
    gcalErr = w.msg; gcalStep = w.step;
  } finally { gcalBusy = false; renderGcal(); }
}
/* 가져올 캘린더(설정 업무 탭에서 고름). 고른 적이 없으면 기본 캘린더만 */
const gcalPicked = () => Array.isArray(state.gcalPick) ? state.gcalPick : ["primary"];
async function listPicked(token, opts) {
  const lists = await Promise.all(gcalPicked().map(cal => GCal.listEvents(token, { ...opts, cal })));
  return lists.flat();
}
async function gcalLoad(tokenMaybe) {
  const keep = GCal.savedToken();
  const token = tokenMaybe || (keep && keep.token);
  if (!token) { gcalDays = []; return; }
  try {
    gcalDays = GCal.byDay(await listPicked(token, { days: 21, max: 30 }));
    gcalAt = Date.now(); gcalErr = ""; gcalStep = 0;
  } catch (e) {
    const w = GCal.why(e);
    gcalErr = w.msg; gcalStep = w.step; gcalDays = [];
    if (w.step === 0 && /만료/.test(w.msg)) GCal.forgetToken();
  }
}
/* 가져올 캘린더 고르기. 고른 캘린더 일정은 위젯과 주간, 월간 칸에 보기로만 붙는다(고치는 것은 「교무수첩」 캘린더만). */
let gcalCals = null, gcalCalsBusy = false, gcalCalsErr = "";
async function loadGcalCals() {
  const keep = GCal.savedToken();
  if (!keep || gcalCalsBusy) return;
  gcalCalsBusy = true; gcalCalsErr = "";
  try { gcalCals = await GCal.listCalendars(keep.token, state.gcalCal || ""); }
  catch (e) { gcalCalsErr = GCal.why(e).msg; }
  finally { gcalCalsBusy = false; if (setOpen) renderSet(); }
}
function gcalPickBlock() {
  if (!GCal.savedToken()) return setBlock("가져올 캘린더", [h("p", { class: "set-state", text: "연결하면 고를 수 있습니다." })]);
  if (!gcalCals && !gcalCalsBusy && !gcalCalsErr) loadGcalCals();
  if (!gcalCals) return setBlock("가져올 캘린더", [h("p", { class: "set-state", text: gcalCalsErr || "캘린더 목록을 받는 중입니다." })]);
  const picked = gcalPicked();
  // 기본 캘린더는 id 가 메일 주소지만 고른 적이 없으면 "primary" 로 적혀 있다. 둘 다 같은 것으로 본다.
  const on = (c) => picked.includes(c.id) || (c.primary && picked.includes("primary"));
  const toggle = (c) => {
    const next = gcalCals.filter(x => x.id === c.id ? !on(x) : on(x)).map(x => x.id);
    state.gcalPick = next;
    save(true);
    gcalMonths.clear();
    gcalLoad().then(() => { renderGcal(); renderNb(); });
    renderSet();
  };
  return setBlock(["가져올 캘린더", h("button", { class: "text-btn", type: "button", id: "gcalCalsReload", text: "목록 새로 받기", onclick: () => { gcalCals = null; loadGcalCals(); } })], [
    h("div", { class: "gcal-picks", id: "gcalPicks" }, ...gcalCals.map(c => {
      const box = h("input", { type: "checkbox", "data-cal": c.id, checked: on(c) ? true : null, onchange: () => toggle(c) });
      return h("label", { class: "gcal-pick" + (on(c) ? " on" : "") }, box,
        h("span", { class: "gcal-dot", style: c.color ? "background:" + c.color : null }),
        h("span", { class: "nm", text: c.name }), c.primary ? h("span", { class: "sz", text: "기본" }) : null);
    })),
  ]);
}
/* 설정 업무 탭: 위젯의 연결 단추와 같은 일을 한다 */
function gcalSection() {
  const linked = !!GCal.savedToken(), n = gcalDays.reduce((a, d) => a + d.items.length, 0);
  const note = h("p", { class: "set-state", id: "gcalSetNote", text: !signedIn ? "로그인하면 쓸 수 있습니다."
    : gcalErr || (linked ? `연결되어 있습니다. 앞으로 3주 일정 ${n}건이 위젯과 주간 계획에 보입니다.` : "연결하면 위젯과 주간 계획에 내 일정이 보입니다.") });
  const W = docs.works, ready = W && W.ready && keyStateNow() === "open";
  return setSec(["구글 캘린더", signedIn ? h("button", { class: "btn small secondary", type: "button", id: "gcalSet",
      text: gcalBusy ? "연결 중…" : linked ? "새로 받기" : "연결", disabled: gcalBusy, onclick: async () => {
        if (linked) { await gcalLoad(); renderGcal(); gcalMonths.clear(); planSync(); } else await gcalConnect();
        renderSet();
      } }) : null, note], [
    signedIn ? gcalPickBlock() : null, signedIn ? setBlock(["「교무수첩」 캘린더", ...(ready ? planStatus("set") : [h("p", { class: "set-state", text: "교무수첩을 열면 주고받습니다." })])], [
      h("p", { class: "set-state", text: "구글에 「교무수첩」 캘린더를 따로 만들어 주간, 월간 계획과 양쪽으로 주고받습니다." }),
    ]) : null]);
}
function renderGcal() {
  if (booted) renderWeekPlan();
  const box = $("gcalBody");
  if (!box) return;
  const btn = $("gcalBtn");
  const linked = !!GCal.savedToken();
  btn.hidden = !signedIn;
  btn.textContent = gcalBusy ? "연결 중…" : linked ? "새로 받기" : "연결";
  btn.onclick = () => { if (linked) gcalLoad().then(renderGcal); else gcalConnect(); };

  if (!signedIn) { box.replaceChildren(h("p", { class: "empty", text: "로그인하면 쓸 수 있습니다." })); return; }
  if (gcalErr) {
    const kids = [h("p", { class: "hint", text: gcalErr })];
    if (gcalStep >= 1) {
        kids.push(h("ul", { class: "lines" }, ...GCAL_STEPS.map((st, i) =>
        h("li", { class: "line" + (st.done ? " done" : "") },
          h("div", { class: "top" },
            h("span", { class: "ttl", text: (i + 1) + ". " + st.text }),
            h("span", { class: "tag " + (st.done ? "cls" : "open"), text: st.done ? "켜 둠" : "남음" }))))));
      if (gcalStep === 2) {
        kids.push(h("p", { class: "row" },
          h("a", { class: "btn small", href: GCal.CONSOLE_URL, target: "_blank", rel: "noopener", text: "파베 로그인 설정 열기" })));
        kids.push(h("p", { class: "tip", text: "그 화면에서 Google 을 누르고 '사용 설정'만 켜면 됩니다. 지원 이메일에는 선생님 메일을 고릅니다. 켜고 나서 아래 '다시 해 보기'를 눌러 주세요." }));
      }
    }
    kids.push(h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "다시 해 보기", onclick: () => gcalConnect() })));
    box.replaceChildren(...kids);
    return;
  }
  if (!linked) {
    box.replaceChildren(
      h("p", { class: "empty", text: "구글 캘린더를 이어 붙이면 일정이 보입니다." }),
      h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "구글 캘린더 연결", onclick: () => gcalConnect() })));
    return;
  }
  if (!gcalDays.length) {
    box.replaceChildren(h("p", { class: "empty", text: "앞으로 3주에 일정이 없습니다." }));
    return;
  }
  const t0 = parseDate(todayKey());
  box.replaceChildren(...gcalDays.map(day => {
    const dt = parseDate(day.at);
    const n = Math.round((dt - t0) / 86400000);
    const label = n === 0 ? "오늘" : n === 1 ? "내일" : `${dt.getMonth() + 1}.${dt.getDate()}(${WD[dt.getDay()]})`;
    return h("div", { class: "gcal-day" },
      h("span", { class: "d", text: label }),
      h("div", { class: "lines" }, ...day.items.map(ev => h("div", { class: "gcal-ev" },
        ev.time ? h("span", { class: "tm", text: ev.time }) : null, ev.title))));
  }));
}

/* ---------- 칸(그리드)에 놓기 ---------- */
const deck = $("deck");
let arranging = false, curPage = 1;

/* 교무수첩 장(선생님 지시 2026-11-13): 1장은 대시보드, 그 뒤로 수업, 담임, 업무가 각각 화면 하나.
   장마다 위에서 작은 페이지(탭)를 넘긴다. 위젯 배치(장 추가, 끌어 옮기기)는 대시보드 장에서만 한다. */
const NB = [
  { key: "lesson", name: "수업", tabs: [["prog", "진도"], ["student", "학생"], ["att", "출결"]] },
  { key: "home", name: "담임", tabs: [["att", "출결"], ["col", "수합"], ["ann", "전달사항"], ["student", "학생"], ["consult", "상담 민원"]] },
  { key: "work", name: "업무", tabs: [["plan", "계획과 업무"], ["todo", "할 일"]] },
];
const nbTab = { lesson: "prog", home: "att", work: "plan" };
const dashPages = () => okPages(state.pages);
const allPages = () => dashPages() + NB.length;
const nbOf = (p) => NB[p - dashPages() - 1] || null;
const nbKey = () => { const n = nbOf(curPage); return n ? n.key : ""; };

function pageName(p) {
  const on = WIDGETS.filter(d => state.layout[d.id].on && state.layout[d.id].pg === p);
  if (!on.length) return p + "장 (빈 장)";
  const big = on.slice().sort((a, b) => {
    const A = state.layout[a.id], B = state.layout[b.id];
    return (B.w * B.h) - (A.w * A.h);
  })[0];
  return p + "장 " + big.name + (on.length > 1 ? " 외 " + (on.length - 1) : "");
}
function gotoPage(p) {
  const next = Math.max(1, Math.min(allPages(), p));
  if (next === curPage) return;
  curPage = next;
  applyGrid(); renderPagebar();
}
function applyGrid() {
  const g = okGrid(state.grid);
  state.pages = okPages(state.pages);
  if (curPage > allPages()) curPage = allPages();
  deck.hidden = !!nbOf(curPage);
  deck.style.setProperty("--cols", String(g.cols));
  deck.style.setProperty("--rows", String(g.rows));
  state.layout = normalize(state.layout, g, state.pages);
  const stacked = isStacked(), two = stacked && isTwoCol();
  for (const def of WIDGETS) {
    const el = deck.querySelector('.wg[data-w="' + def.id + '"]');
    if (!el) continue;
    const b = state.layout[def.id];
    el.hidden = !b.on || (!stacked && b.pg !== curPage);
    el.style.gridArea = b.y + " / " + b.x + " / span " + b.h + " / span " + b.w;
    const wide = b.w > g.cols * 0.6, left = (b.x - 1 + b.w / 2) <= g.cols / 2;
    el.style.setProperty("--col", wide ? "1 / -1" : left ? "1" : "2");
  }
  deck.classList.toggle("two", two);
  if (stacked) stackOrder();
  if (two) fitSpans();
  renderPagebar();
  renderNb();
  fitCards(true);
}

/* ---------- 세워 보는 화면: 폰 1단, 세로 태블릿 2단. 조건은 desk.css 와 같아야 한다 ---------- */
const STACK_MQ = "(max-width: 820px), (orientation: portrait) and (max-width: 1100px)";
const TWO_MQ = "(min-width: 600px) and (orientation: portrait) and (max-width: 1100px)";
const mq = (q) => (typeof window.matchMedia === "function" ? window.matchMedia(q) : null);
const stackMq = mq(STACK_MQ), twoMq = mq(TWO_MQ);
const isStacked = () => !!(stackMq && stackMq.matches);
const isTwoCol = () => !!(twoMq && twoMq.matches);
for (const m of [stackMq, twoMq]) if (m && m.addEventListener) m.addEventListener("change", () => applyGrid());

// 순서가 그대로면 옮기지 않는다(옮기면 쓰던 글의 커서가 빠진다).
function stackOrder() {
  const els = [...deck.querySelectorAll(":scope > .wg")];
  const key = (el) => { const b = state.layout[el.dataset.w] || { pg: 9, y: 99, x: 99 }; return b.pg * 1e6 + b.x * 1e3 + b.y; };
  const want = [...els].sort((a, b) => key(a) - key(b));
  if (want.every((el, i) => el === els[i])) return;
  for (const el of want) deck.append(el);
}
const SPAN_UNIT = 4;
let spanObs = null;
function fitSpans() {
  if (typeof ResizeObserver !== "function") return;
  if (!spanObs) spanObs = new ResizeObserver((ents) => { if (deck.classList.contains("two")) for (const e of ents) spanOf(e.target.parentElement); });
  for (const el of deck.querySelectorAll(":scope > .wg")) { spanObs.observe(el.firstElementChild); spanOf(el); }
}
function spanOf(el) {
  if (!el || el.hidden) return;
  const gap = parseFloat(getComputedStyle(deck).getPropertyValue("--gap")) || 10;
  const hgt = el.firstElementChild.getBoundingClientRect().height;
  el.style.setProperty("--span", String(Math.max(1, Math.ceil((hgt + gap) / SPAN_UNIT))));
}

function renderPagebar() {
  const bar = $("pagebar");
  if (!bar) return;
  const n = okPages(state.pages);
  bar.classList.toggle("show", arranging);
  // 대시보드는 한 장이면 이름 단추, 여러 장이면 점(위젯을 끌어다 놓는 자리). 교무수첩 세 장은 늘 이름 단추.
  const named = (p, text) => h("button", { class: "pg-nb" + (p === curPage ? " cur" : ""), type: "button",
    "data-page": String(p), "aria-pressed": String(p === curPage), text, onclick: () => gotoPage(p) });
  const kids = [
    h("button", { class: "pg-arrow", type: "button", "aria-label": "앞 장", html: CHEV_L, onclick: () => gotoPage(curPage - 1) }),
    n === 1 ? named(1, "대시보드") : h("div", { class: "pg-dots" }, ...Array.from({ length: n }, (_, i) => h("button", {
      class: "pg-dot" + (i + 1 === curPage ? " cur" : ""), type: "button",
      "data-page": String(i + 1), "aria-label": pageName(i + 1),
      title: pageName(i + 1), onclick: () => gotoPage(i + 1),
    }))),
    ...NB.map((b, i) => named(n + i + 1, b.name)),
    h("button", { class: "pg-arrow", type: "button", "aria-label": "다음 장", html: CHEV_R, onclick: () => gotoPage(curPage + 1) }),
  ];
  if (arranging) {
    kids.push(h("span", { class: "pg-name", text: pageName(curPage) }));
    if (n < MAX_PAGES) kids.push(h("button", { class: "pg-add", type: "button", "aria-label": "장 추가", text: "+", onclick: () => addPage() }));
    if (n > 1) kids.push(h("button", { class: "pg-del", type: "button", "aria-label": "장 삭제", text: "×", onclick: () => delPage() }));
  }
  bar.replaceChildren(...kids);
}
function addPage() {
  if (okPages(state.pages) >= MAX_PAGES) { toast("장은 " + MAX_PAGES + "개까지입니다"); return; }
  state.pages = okPages(state.pages + 1);
  save(true); curPage = state.pages; applyGrid();
  if (setOpen) renderSet();
  toast(state.pages + "장이 됐습니다. 위젯을 끌어다 페이지 점에 놓으면 옮겨집니다");
}
function delPage() {
  const n = okPages(state.pages);
  if (n <= 1) return;
  const here = WIDGETS.filter(d => state.layout[d.id].on && state.layout[d.id].pg === curPage);
  if (here.length) { toast("이 장에 위젯이 " + here.length + "개 있습니다. 다른 장으로 옮기거나 끄고 지워 주세요"); return; }
  for (const def of WIDGETS) {
    const g = state.layout[def.id];
    if (g.pg > curPage) g.pg -= 1;
  }
  state.pages = n - 1;
  if (curPage > state.pages) curPage = state.pages;
  save(true); applyGrid();
  if (setOpen) renderSet();
  toast("장을 지웠습니다");
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  if ($("app").hidden) return;
  gotoPage(curPage + (e.key === "ArrowRight" ? 1 : -1));
});
function wgEl(id) { return deck.querySelector('.wg[data-w="' + id + '"]'); }

function addHandles() {
  for (const def of WIDGETS) {
    const el = wgEl(def.id);
    if (!el || el.querySelector(".wg-tag")) continue;
    el.append(
      h("span", { class: "wg-tag", text: def.name }),
      h("button", {
        class: "wg-off", type: "button", "aria-label": def.name + " 끄기", text: "×",
        onclick: (e) => { e.stopPropagation(); state.layout[def.id].on = false; save(true); applyGrid(); if (setOpen) renderSet(); },
      }),
      ...["n", "s", "e", "w", "ne", "nw", "se", "sw"].map(d => h("i", { class: "rz rz-" + d, "data-dir": d })));
  }
}
const dropHandles = () => deck.querySelectorAll(".wg-tag, .wg-off, .rz").forEach(el => el.remove());

function setArrange(on) {
  arranging = !!on;
  if (arranging && nbOf(curPage)) gotoPage(1);   // 배치는 대시보드에서만
  deck.classList.toggle("arranging", arranging);
  $("tools").classList.toggle("show", arranging);
  $("arrange").classList.toggle("on", arranging);
  $("arrange").title = arranging ? "배치 끝내기" : "위젯 이동과 크기 조절";
  if (arranging) addHandles(); else dropHandles();
  let tip = document.querySelector(".drag-tip");
  if (arranging && !tip) {
    document.body.append(h("div", { class: "drag-tip", text: "가운데를 끌면 옮기기, 테두리를 끌면 크기 바꾸기, 아래 페이지 점에 놓으면 그 장으로 옮기기" }));
  } else if (!arranging && tip) { tip.remove(); }
  renderPagebar();
}
$("arrange").addEventListener("click", () => setArrange(!arranging));
$("toolSet").addEventListener("click", () => { setOpen = !setOpen; renderSet(); });
$("setScrim").addEventListener("click", closeSet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && setOpen) closeSet(); });

deck.addEventListener("pointerdown", (e) => {
  if (!arranging) return;
  const el = e.target.closest(".wg");
  if (!el || e.target.classList.contains("wg-off")) return;
  const id = el.dataset.w, def = widgetDef(id);
  if (!def) return;
  const G = okGrid(state.grid);
  const dir = e.target.classList.contains("rz") ? (e.target.dataset.dir || "") : "";
  const g0 = { ...state.layout[id] };
  const { uw, uh } = cellSize(deck.getBoundingClientRect(), G);
  const sx = e.clientX, sy = e.clientY;
  const minW = Math.min(def.min[0], G.cols), minH = Math.min(def.min[1], G.rows);
  el.classList.add("dragging");
  try { el.setPointerCapture(e.pointerId); } catch (err) {}
  let overDot = null;
  const markDot = (ev) => {
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const dot = under && under.closest && under.closest(".pg-dot");
    if (dot !== overDot) {
      if (overDot) overDot.classList.remove("over");
      overDot = dot || null;
      if (overDot) overDot.classList.add("over");
    }
  };
  let shown = null;                          // 자리가 진짜 바뀐 때만 다시 그린다
  const move = (ev) => {
    if (!dir) markDot(ev);
    const dC = Math.round((ev.clientX - sx) / uw), dR = Math.round((ev.clientY - sy) / uh);
    const cand = moved(g0, G, dC, dR, dir);
    if (cand.w < minW || cand.h < minH) return;
    if (hits(state.layout, id, cand)) return;
    state.layout[id] = cand;
    const area = cand.y + " / " + cand.x + " / span " + cand.h + " / span " + cand.w;
    if (area === shown) return;
    shown = area;
    el.style.gridArea = area;
    fitCard(el, true);                       // 끌면서 바로 글씨가 줄어드는 게 보이게
  };
  const up = () => {
    el.classList.remove("dragging");
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    if (overDot) {
      const to = Number(overDot.dataset.page);
      overDot.classList.remove("over"); overDot = null;
      if (to && to !== state.layout[id].pg) {
        if (moveToPage(state.layout, id, G, to)) toast(def.name + "을 " + to + "장으로 옮겼습니다");
        else toast(to + "장에 놓을 빈자리가 없습니다");
      }
    }
    save(true); applyGrid();
    if (setOpen) renderSet();
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  e.preventDefault();
});

function gridSection() {
  const G = okGrid(state.grid);
  const colIn = h("input", { type: "number", id: "setCols", value: String(G.cols), min: String(GRID_MIN.cols), max: String(GRID_MAX.cols) });
  const rowIn = h("input", { type: "number", id: "setRows", value: String(G.rows), min: String(GRID_MIN.rows), max: String(GRID_MAX.rows) });
  const err = h("p", { class: "form-err", role: "alert" });
  const apply = () => {
    const next = okGrid({ cols: colIn.value, rows: rowIn.value });
    state.grid = next;
    state.layout = normalize(state.layout, next, state.pages);
    save(true); applyGrid(); renderSet();
    toast(`칸을 ${next.cols}×${next.rows}로 바꿨습니다`);
  };
  /* 장마다 "이 장에 넣을 위젯"을 체크로 고른다(선생님 지시 2026-11-12).
     한 위젯은 한 장에만 있으므로, 다른 장에서 체크하면 그 장으로 옮겨진다. */
  const place = (def, pg) => {
    const b = state.layout[def.id];
    if (b.on && b.pg === pg) { b.on = false; }                       // 이미 이 장이면 끈다
    else if (b.on) {
      if (!moveToPage(state.layout, def.id, state.grid, pg)) { err.textContent = pg + "장에 " + def.name + "을 놓을 빈자리가 없습니다."; return; }
    } else if (!turnOn(state.layout, def.id, state.grid, pg)) {
      let G = okGrid(state.grid), done = false;
      while (!done && G.rows < GRID_MAX.rows) {
        G = okGrid({ cols: G.cols, rows: G.rows + 2 });
        state.grid = G;
        state.layout = normalize(state.layout, G, state.pages);
        done = turnOn(state.layout, def.id, G, pg);
      }
      if (!done) { err.textContent = def.name + "을 놓을 자리를 못 찾았습니다. 다른 것을 끄고 다시 해 주세요."; return; }
      toast(`자리가 없어서 세로를 ${G.rows}칸으로 늘렸습니다`);
    }
    err.textContent = "";
    save(true); applyGrid(); renderSet();
  };
  /* 장은 드롭다운으로 고르고, 고른 장만 체크 칸을 보여 준다(선생님 지시 2026-11-12) */
  const pages = okPages(state.pages);
  if (setPage > pages) setPage = pages;
  const pgSel = h("select", { id: "setPageSel" },
    ...Array.from({ length: pages }, (_, i) => h("option", { value: String(i + 1), text: (i + 1) + "장" })));
  pgSel.value = String(setPage);
  pgSel.addEventListener("change", () => { setPage = Number(pgSel.value); renderSet(); });
  const pageList = [];
  {
    const pg = setPage;
    pageList.push(h("div", { class: "wg-list" }, ...WIDGETS.map(def => {
      const b = state.layout[def.id];
      const here = b.on && b.pg === pg;
      const box = h("input", { type: "checkbox", "data-wg": def.id, "data-pg": String(pg), checked: here });
      box.addEventListener("change", () => place(def, pg));
      return h("label", { class: "wg-check" + (here ? " on" : "") }, box, def.name,
        here ? h("span", { class: "sz", text: `${b.w}×${b.h}` }) : null);
    })));
  }
  const off = WIDGETS.filter(def => !state.layout[def.id].on);
  const offNote = off.length ? h("p", { class: "set-state", text: "쓰지 않는 위젯: " + off.map(d => d.name).join(", ") }) : null;
  return setSec(["화면 배치", h("button", { class: "btn small secondary", type: "button", text: arranging ? "배치 끝내기" : "배치 시작", onclick: () => { setArrange(!arranging); renderSet(); } }),
    delBtn("기본 배치로 되돌리기", () => {
      const s = clone({ grid: state.grid, pages: state.pages, layout: state.layout }), p = curPage;
      return () => { Object.assign(state, s); curPage = p; save(true); applyGrid(); };
    }, () => {
      state.grid = { ...DEFAULT_GRID };
      state.pages = DEFAULT_PAGES; curPage = 1;
      state.layout = normalize(null, state.grid, state.pages);
      save(true); applyGrid(); renderSet();
      return "기본 배치로 되돌렸습니다";
    }, null, null, "rotate-ccw")], [
    setBlock(["칸 수", h("button", { class: "btn small", type: "button", text: "적용", "aria-label": "칸 수 적용", onclick: apply })], [
      h("div", { class: "set-grid" },
        setField("가로 칸", colIn),
        setField("세로 칸", rowIn)),
    ]),
    setBlock(["장마다 넣을 위젯", pgSel, offNote,
      h("button", { class: "btn small secondary", type: "button", text: "장 추가", onclick: () => addPage() }),
      h("button", { class: "btn small secondary", type: "button", text: "장 삭제", onclick: () => delPage() })], pageList),
  ], err);
}

/* ---------- 로그인 문 ---------- */
function authMsg(e) {
  const c = (e && e.code) || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return "메일이나 비밀번호가 맞지 않습니다.";
  if (c.includes("too-many-requests")) return "너무 여러 번 시도했습니다. 잠시 뒤에 다시 해 주세요.";
  if (c.includes("network")) return "인터넷 연결을 확인해 주세요.";
  if (c.includes("user-disabled")) return "잠긴 계정입니다.";
  return "들어가지 못했습니다. " + (c || (e && e.message) || "까닭을 모르겠습니다");
}
function showGate(msg) {
  $("gate").hidden = false;
  $("app").hidden = true;
  // 알릴 말이 있을 때만 쓴다. 방금 띄운 오류를 뒤늦은 확인이 지우면 안 된다.
  if (msg !== undefined) $("gateErr").textContent = msg;
}
function openApp(user) {
  if (signedIn) return;
  signedIn = user;
  $("gate").hidden = true;
  $("app").hidden = false;
  cloud = cloudRef;
  if (GCal.savedToken()) gcalLoad().then(() => { renderGcal(); planSync(); });
  renderGcal();
  setSync("", "연결 중");
  const loadTimer = setTimeout(() => { if (!C.confirmed) setSync("warn", "저장소에 연결하는 중입니다. 그동안 이 브라우저에 저장됩니다."); }, 10000);
  for (const d of allDocs()) subscribe(d);
  const wait = setInterval(() => { if (C.confirmed) { clearTimeout(loadTimer); clearInterval(wait); refreshSync(); softClass(); } }, 300);
}
async function signOutNow() {
  await lockNow();
  forgetKeep();                                       // 나가면 이 기기에 둔 열쇠도 지운다
  for (const d of allDocs()) { if (d.unsub) d.unsub(); d.unsub = null; d.ref = null; }
  cloud = null; signedIn = null;
  GCal.forgetToken(); gcalDays = []; gcalErr = "";
  try { await FB.signOut(FB.auth); } catch (e) {}
  showGate();
}
/* 자동 로그인: 켜면 로그인을 이 기기에 남겨 다음에 켤 때 바로 들어온다. 끄면 창(탭)을 닫을 때 로그인이 풀린다. */
const autoOn = () => lsGet("autoLogin") !== false;
$("gateAuto").checked = autoOn();
$("gateForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("gateBtn"), auto = $("gateAuto").checked;
  btn.disabled = true; $("gateErr").textContent = "";
  lsSet("autoLogin", auto);
  step("로그인 보냄");
  try {
    if (FB.setPersistence) await FB.setPersistence(FB.auth, auto ? FB.browserLocalPersistence : FB.browserSessionPersistence);
    await FB.signInWithEmailAndPassword(FB.auth, $("gateEmail").value.trim(), $("gatePass").value);
    step("로그인 받아들여짐");
  } catch (err) {
    $("gateErr").textContent = authMsg(err);
    step("로그인 거절 " + ((err && err.code) || ""));
  } finally {
    btn.disabled = false; $("gatePass").value = "";
  }
});
$("signOut").addEventListener("click", () => { signOutNow(); });

/* 앱(src-tauri)에서만: 창을 테두리 없이 바탕화면 맨 아래에 깔고(위젯), 다시 보통 창으로 되돌린다.
   쓰는 창 기능은 src-tauri/capabilities/default.json 에 허락해 둔 것뿐이다. 더 쓰면 거기도 더한다. */
const TW = window.__TAURI__ && window.__TAURI__.window;
if (TW) {
  const win = TW.getCurrentWindow(), btn = $("toWidget"), ob = $("wOpacity");
  const CLEAR = [0, 20, 40, 60];   // 바탕화면이 비쳐 보이는 정도(%). 누를 때마다 다음으로 넘어간다
  let pinned = false, before = null, clear = 0;
  try { clear = CLEAR.indexOf(Number(localStorage.getItem(LS_PREFIX + "clear"))); } catch (e) {}
  if (clear < 0) clear = 0;
  const show = () => {
    btn.lastChild.textContent = pinned ? "창으로" : "위젯으로";
    btn.title = pinned ? "보통 창으로 되돌리기" : "바탕화면 위젯으로 내리기";
    // 반투명과 글자 긁힘 막기는 desk.css 의 html.wmode 가 한다. 깔았을 때만 켠다.
    ob.hidden = !pinned;
    ob.lastChild.textContent = "투명 " + CLEAR[clear] + "%";
    document.documentElement.classList.toggle("wmode", pinned);
    document.documentElement.style.setProperty("--w-solid", (100 - CLEAR[clear]) + "%");
  };
  const remember = (on) => { try { localStorage.setItem(LS_PREFIX + "pinned", on ? "1" : "0"); } catch (e) {} };
  async function pin(on) {
    try {
      if (on) {
        before = { pos: await win.outerPosition(), size: await win.innerSize(), max: await win.isMaximized() };   // setSize 는 안쪽 크기를 받는다
        const mon = await TW.currentMonitor();
        const area = mon && (mon.workArea || { position: mon.position, size: mon.size });
        if (before.max) await win.unmaximize();
        await win.setDecorations(false);
        if (area) { await win.setPosition(area.position); await win.setSize(area.size); }
        await win.setAlwaysOnBottom(true);
        gotoPage(1);
      } else {
        await win.setAlwaysOnBottom(false);
        await win.setDecorations(true);
        if (before) {
          await win.setSize(before.size); await win.setPosition(before.pos);
          if (before.max) await win.maximize();
        }
        await win.setFocus();
      }
      pinned = on; remember(on); show();
    } catch (e) { console.warn("위젯 전환 실패", e); }
  }
  btn.hidden = false;
  btn.addEventListener("click", () => pin(!pinned));
  ob.addEventListener("click", () => {
    clear = (clear + 1) % CLEAR.length;
    try { localStorage.setItem(LS_PREFIX + "clear", String(CLEAR[clear])); } catch (e) {}
    show();
  });
  (async () => {
    let was = false;
    try { was = localStorage.getItem(LS_PREFIX + "pinned") === "1"; } catch (e) {}
    if (!was) return;
    // 새로고침이면 창은 이미 깔려 있다(테두리 없음). 앱을 새로 켠 때만 다시 깐다.
    let decorated = true;
    try { decorated = await win.isDecorated(); } catch (e) {}
    if (decorated) pin(true); else { pinned = true; show(); }
  })();
}

let inFrame = true;
try { inFrame = window.self !== window.top; } catch (e) {}
if (!inFrame && !window.__TAURI__) {
  $("toPreview").hidden = false;
  $("toPreview").addEventListener("click", () => { window.open("./preview.html", "_blank", "noopener"); });
}

// desk.css 의 .wg { zoom: calc(var(--k) * var(--z)) } 가 쓴다. 1920×1080 이 1배다.
const SCALE_BASE = { w: 1920, h: 1080 }, SCALE_MIN = 0.75, SCALE_MAX = 2.5;
function fitScale() {
  const k = Math.min(window.innerWidth / SCALE_BASE.w, window.innerHeight / SCALE_BASE.h);
  const v = Math.max(SCALE_MIN, Math.min(SCALE_MAX, k || 1));
  document.documentElement.style.setProperty("--k", v.toFixed(3));
}
window.addEventListener("resize", () => { fitScale(); fitCards(true); });
fitScale();

/* ══════════ 글자가 겹치지 않게 칸마다 줄이기 (--z) ══════════
   칸이 작아 내용이 안 들어가면 글씨만 줄이는 게 아니라 zoom 으로 칸 속을 통째로 줄인다.
   그래야 글씨, 여백, 사이 간격이 전부 같은 비율로 준다.

   어디를 보고 '안 들어간다'고 할까:
   - 넘친 것을 "잘라 버리는"(overflow: hidden) 곳만 센다. 잘린 글자는 스크롤로도 못 보기 때문이다.
   - 스크롤되는 곳(overflow: auto)은 세지 않는다. 학생 명단이나 메모처럼 길어질 수 있는 것까지
     맞추려 들면 글씨가 한없이 작아진다. 그런 곳은 원래대로 굴려 보면 된다.
   - .sr(화면낭독기용 1px 상자) 같은 작은 것은 뺀다. */
const FIT_MIN = 0.45;     // 이보다 더 줄이지는 않는다
/* 바로가기 띠는 더 줄인다(선생님 지적 2026-11-14: 작은 화면이면 더 줄여야지). 1024x640 창의 한 줄(30px)에도 들어가게. */
const FIT_MIN_LINKS = 0.3;
const FIT_TRIES = 5;      // 줄이면 칸 규칙이 바뀌므로 몇 번 다시 잰다

function clipOverflow(card) {
  let worst = 1;
  /* 배치 중에는 desk.css 가 카드마다 overflow: hidden 을 걸어 둔다(끌 때 안 삐져나오게).
     그걸 "잘린다"로 보면 명단이 긴 칸까지 한없이 줄어든다. 그래서 카드 자신은 뺀다. */
  const list = arranging ? [...card.querySelectorAll("*")] : [card, ...card.querySelectorAll("*")];
  for (const el of list) {
    const ch = el.clientHeight, cw = el.clientWidth;
    if (ch <= 0 || cw <= 0) continue;
    // .sr(화면낭독기용 1×1 상자)만 뺀다. 한쪽만 작은 것은 눌린 줄이라 꼭 세야 한다
    // (시간표 한 줄이 2px 까지 눌렸는데 이 기준에 걸려 줄이기가 안 돌던 적이 있다).
    if (ch < 3 && cw < 3) continue;
    const overH = el.scrollHeight - ch, overW = el.scrollWidth - cw;
    if (overH < 1 && overW < 1) continue;          // 넘치지 않으면 모양을 볼 것도 없다
    const cs = getComputedStyle(el);
    const cut = (v) => v === "hidden" || v === "clip";
    if (overH >= 2 && cut(cs.overflowY)) worst = Math.max(worst, el.scrollHeight / ch);
    // 말줄임표(…)로 줄이는 곳은 일부러 자르는 것이므로 가로는 세지 않는다
    if (overW >= 2 && cut(cs.overflowX) && cs.textOverflow !== "ellipsis") worst = Math.max(worst, el.scrollWidth / cw);
  }
  return worst;
}

/* 정해진 한 줄 글(시각, 날짜, 날씨, 위젯 머리줄)은 칸보다 길면 그 글만 줄여 한 줄에 다 넣는다.
   말줄임(…)으로 자르거나 줄을 바꾸지 않는다(선생님 지시 2026-11-17 "줄바꿈이 되거나 짤리는게 어느 해상도에서도 안그러게").
   글자 크기를 CSS(cqw, cqh)로 먼저 정하고, 그래도 넘칠 때만 여기서 px 로 덮는다. 잴 때마다 덮은 것을 걷고 다시 잰다. */
const FIT_LINE = ".wg-clock .clock, .wg-clock .date-main, .wx-temp, .wx-cond, .wx-note, .card-head .card-title, .card-head .card-aside";
function fitLines(card) {
  for (const el of card.querySelectorAll(FIT_LINE)) el.style.removeProperty("font-size");
  for (const el of card.querySelectorAll(FIT_LINE)) {
    // 글자 크기와 폭이 꼭 비례하지는 않아서(글자 사이, 괄호) 한 번에 안 맞으면 몇 번 더 잰다
    for (let i = 0; i < 4; i++) {
      const cw = el.clientWidth;
      if (!cw) break;
      // 글자 자리(Range)로도 잰다. 가운데 맞춘 글은 넘쳐도 scrollWidth 에 다 안 잡힐 때가 있다
      const rg = document.createRange(); rg.selectNodeContents(el);
      const tr = rg.getBoundingClientRect(), br = el.getBoundingClientRect();
      const over = Math.max(el.scrollWidth / cw, br.width > 0 ? tr.width / br.width : 0);
      if (over <= 1.005) break;
      const fs = parseFloat(getComputedStyle(el).fontSize) || 12;
      if (fs <= 6) break;
      el.style.fontSize = Math.max(6, Math.floor(fs / over * 0.97 * 10) / 10) + "px";
    }
  }
}

/* hard = true 면 1배부터 다시 잰다(칸을 옮기거나 창 크기가 바뀐 때).
   hard 가 아니면 모자랄 때만 줄이고, 자리가 생겼으면 조금씩 되돌린다(글 하나 지웠을 때). */
function fitCard(wg, hard) {
  const card = wg.firstElementChild;
  if (!card) return;
  const todos = wg.dataset.w === "todos";
  if (todos) trimTodos(card, false);                             // 숨겼던 줄을 다 꺼내 놓고 잰다
  // 시계 칸은 글을 CSS 비례(cqw/cqh)로만 키운다. 여기서 또 줄이면(--z) 둘이 밀당해 크기가 떨린다.
  if (wg.dataset.w === "clock") { wg.style.removeProperty("--z"); fitLines(card); return; }
  fitLines(card);
  if (isStacked()) { wg.style.removeProperty("--z"); return; }   // 폰, 세워 둔 태블릿은 칸이 내용만큼 늘어난다
  if (hard) wg.style.removeProperty("--z");
  const zMin = wg.dataset.w === "links" ? FIT_MIN_LINKS : FIT_MIN;
  let z = hard ? 1 : (parseFloat(wg.style.getPropertyValue("--z")) || 1);
  for (let i = 0; i < FIT_TRIES; i++) {
    const r = clipOverflow(card);
    if (r > 1.002) {
      if (z <= zMin) break;                                      // 더 줄일 수 없으면 거기까지
      z = Math.max(zMin, z / r);
      wg.style.setProperty("--z", z.toFixed(3));
      continue;
    }
    if (z >= 1) break;
    const back = Math.min(1, z * 1.12);                          // 자리가 생겼으면 조금씩 되돌린다
    if (back <= z) break;
    wg.style.setProperty("--z", back.toFixed(3));
    if (clipOverflow(card) > 1.002) { wg.style.setProperty("--z", z.toFixed(3)); break; }
    z = back;
  }
  if (z >= 1) wg.style.removeProperty("--z");
  fitLines(card);                                                 // 줄인 뒤에 한 번 더(줄이면 칸 폭도 같이 줄어든다)
  if (todos) trimTodos(card, true);
}

/* 할 일 칸은 굴리지 않는다(선생님 지시 2026-11-13). 끝까지 줄여도 다 안 들어가면
   칸마다 아래 줄부터 통째로 숨기고 "외 N개"로 알린다. 칸을 키우면 다시 나온다.
   class 와 data 속성만 바꾸므로 MutationObserver(childList)가 다시 부르지 않는다.
   넘침은 그려진 자리(getBoundingClientRect)로 잰다. zoom 이 걸리면 scrollHeight 와
   clientHeight 가 어긋나 자리가 남는데도 다 숨긴 적이 있다. */
function trimTodos(card, on) {
  for (const list of card.querySelectorAll(".q-list")) {
    const items = [...list.children].filter((li) => li.classList.contains("q-todo"));
    const more = list.querySelector(".q-more");
    for (const li of items) li.classList.remove("cut");
    delete list.dataset.more;
    if (!on || !more) continue;
    const over = () => {
      const lim = list.getBoundingClientRect().bottom + 1;
      return [...list.children].some((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > lim; });
    };
    let n = 0;
    while (n < items.length && over()) {
      items[items.length - 1 - n].classList.add("cut");
      more.dataset.n = String(++n);
      list.dataset.more = "";
    }
  }
}

let fitWait = 0, fitHard = false;
function fitCards(hard) {
  fitHard = fitHard || !!hard;
  if (fitWait) return;
  fitWait = requestAnimationFrame(() => {
    fitWait = 0;
    const h = fitHard; fitHard = false;
    for (const wg of deck.querySelectorAll(":scope > .wg")) if (!wg.hidden) fitCard(wg, h);
  });
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitCards(true)).catch(() => {});

/* 어느 칸이든 내용을 다시 그리면 다시 잰다. 그리는 함수마다 한 줄씩 넣으면 빠뜨리게 된다.
   우리가 고치는 것은 style 속성(--z)뿐이라 childList 만 보면 되돌이표에 빠지지 않는다. */
if (typeof MutationObserver === "function") {
  new MutationObserver(() => fitCards()).observe(deck, { childList: true, subtree: true });
}

function connect() {
  step("로그인 상태 확인 시작");
  // 자동 로그인이면 남은 로그인을 찾는 동안 로그인 창을 띄우지 않는다. 늦어지면 그때 띄운다.
  let answered = false;
  if (autoOn()) { $("gate").hidden = true; setTimeout(() => { if (!answered && !signedIn) showGate(); }, 4000); }
  FB.onAuthStateChanged(FB.auth, (user) => {
    answered = true;
    step(user ? "로그인되어 있음" : "로그인 안 되어 있음");
    if (user) openApp(user);
    else if (signedIn) { signedIn = null; showGate("로그인이 풀렸습니다. 다시 들어와 주세요."); }
    else showGate();
  });
}

/* ---------- 시간 계산 ---------- */
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? (+m[1]) * 60 + (+m[2]) : NaN; };
const fmtLeft = (m) => { m = Math.max(0, Math.ceil(m)); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
const dayIdx = (d) => { const w = d.getDay(); return w >= 1 && w <= 5 ? w - 1 : -1; };
function todayRow(d) { const i = dayIdx(d); return i < 0 ? null : state.tt[i]; }
function classCount(row) { return row ? row.filter(c => c.trim()).length : 0; }

function status(now) {
  const di = dayIdx(now);
  if (di < 0) return { kind: "weekend" };
  const row = state.tt[di];
  const m = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const B = state.bells.map(b => ({ s: toMin(b.s), e: toMin(b.e) }));
  const valid = B.every(b => !isNaN(b.s) && !isNaN(b.e));
  if (!valid) return { kind: "invalid" };
  const nextClass = (from) => { for (let j = from; j < 7; j++) if (row[j].trim()) return j; return -1; };
  const lastClass = (() => { for (let j = 6; j >= 0; j--) if (row[j].trim()) return j; return -1; })();
  if (lastClass < 0) return { kind: "noclass" };
  if (m < B[0].s) return { kind: "before", next: nextClass(0), until: B[nextClass(0)].s - m };
  for (let i = 0; i < 7; i++) {
    if (m >= B[i].s && m < B[i].e) {
      if (i > lastClass) break;
      const nx = nextClass(i + 1);
      return { kind: row[i].trim() ? "class" : "free", i, left: B[i].e - m, prog: (m - B[i].s) / (B[i].e - B[i].s), next: nx, until: nx >= 0 ? B[nx].s - m : 0 };
    }
    if (i < 6 && m >= B[i].e && m < B[i + 1].s) {
      if (i + 1 > lastClass) break;
      const nx = nextClass(i + 1);
      const gap = B[i + 1].s - B[i].e;
      return { kind: gap >= 30 ? "lunch" : "break", i, left: B[i + 1].s - m, prog: (m - B[i].e) / gap, next: nx, until: nx >= 0 ? B[nx].s - m : 0 };
    }
  }
  return { kind: "after" };
}

/* ---------- 날씨 (wttr.in, 인천) ----------
   학교 망이 api.open-meteo.com 을 TLS 손인사 단계에서 끊어 버려 wttr.in 으로 바꿨다.
   shortcut: wttr.in 은 개인이 돌리는 무료 서비스라 가끔 막힌다. 끊기면 기상청 공공데이터 API(키 필요)로 옮긴다. */
const WX_PLACE = { name: "인천", q: "Incheon" };
const WX_EVERY = 30 * 60 * 1000;
const svgIcon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
function wxKind(code) {
  if (code === 0) return { t: "맑음", c: "sun", i: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' };
  if (code <= 2) return { t: "구름 조금", c: "sun", i: '<circle cx="8" cy="9" r="3"/><path d="M18 18a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1"/>' };
  if (code === 3) return { t: "흐림", c: "dim", i: '<path d="M18 18a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1A4 4 0 0 0 7 18z"/>' };
  if (code <= 48) return { t: "안개", c: "dim", i: '<path d="M3 8h18M5 12h14M4 16h16M7 20h10"/>' };
  if (code <= 57 || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { t: "비", c: "rain", i: '<path d="M18 14a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1A4 4 0 0 0 7 13M8 18l-1 2M12 18l-1 2M16 18l-1 2"/>' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { t: "눈", c: "snow", i: '<path d="M18 13a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1A4 4 0 0 0 7 12M8 18h.01M12 20h.01M16 18h.01"/>' };
  if (code >= 95) return { t: "뇌우", c: "sun", i: '<path d="M18 13a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1A4 4 0 0 0 7 12M13 14l-3 5h4l-3 5"/>' };
  return { t: "알 수 없음", c: "dim", i: '<circle cx="12" cy="12" r="4"/>' };
}
/* wttr.in 은 WWO 코드를 준다. 아이콘 표(wxKind)는 WMO 코드용이라 옮겨 준다. */
const WWO_WMO = { 113: 0, 116: 2, 119: 3, 122: 3, 143: 45, 248: 45, 260: 48 };
const WWO_SNOW = [179, 182, 227, 230, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377];
function wwoToWmo(c) {
  if (WWO_WMO[c] != null) return WWO_WMO[c];
  if (c === 200 || c >= 386) return 95;
  if (WWO_SNOW.includes(c)) return 71;
  return 61;
}

let wx = null, wxAt = 0, wxBusy = false;
function renderWx() {
  const box = $("wx");
  if (!wx) { box.replaceChildren(h("div", { class: "wx-note", text: "날씨를 불러오는 중입니다" })); return; }
  if (wx.err) { box.replaceChildren(h("div", { class: "wx-note", text: "날씨를 불러오지 못했습니다" })); return; }
  const k = wxKind(wx.code);
  const ico = h("div", { class: "wx-ico " + k.c }); ico.innerHTML = svgIcon(k.i);
  box.replaceChildren(ico, h("div", { class: "wx-txt" },
    h("div", { class: "wx-temp", text: Math.round(wx.temp) + "°" }),
    h("div", { class: "wx-cond", text: k.t })));
}
async function loadWx(force) {
  if (wxBusy || (!force && wx && Date.now() - wxAt < WX_EVERY)) return;
  wxBusy = true;
  try {
    if (typeof fetch !== "function") throw new Error("fetch 없음");
    const r = await fetch(`https://wttr.in/${WX_PLACE.q}?format=j1`, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const c = j && j.current_condition && j.current_condition[0];
    if (!c || !isFinite(Number(c.temp_C))) throw new Error("모양이 다름");
    wx = { temp: Number(c.temp_C), code: wwoToWmo(Number(c.weatherCode)) };
  } catch (e) {
    if (!wx || wx.err) wx = { err: true };
  }
  wxAt = Date.now(); wxBusy = false;
  renderWx();
}

/* ---------- 지금 ---------- */
function renderNow(now) {
  const s = status(now);
  const card = $("nowCard"), main = $("nowMain"), sub = $("nowSub"), next = $("nowNext"), bar = $("nowBar"), wrap = $("nowBarWrap");
  card.classList.toggle("break", s.kind === "break" || s.kind === "lunch" || s.kind === "free");
  const row = todayRow(now);
  const B = state.bells;
  const label = (i) => `${i + 1}교시`;
  const nextLine = (j, until) => j >= 0
    ? [h("span", null, "다음 ", h("b", { text: `${label(j)} ${row[j]}` })), h("span", { class: "num", text: `${B[j].s} 시작, ${fmtLeft(until)} 후` })]
    : [h("span", { text: "오늘 남은 수업이 없습니다" }), h("span", { text: "종례 준비" })];
  $("nowAside").textContent = row ? `오늘 수업 ${classCount(row)}시간` : "";
  let mainKids, subText = "", prog = null, nextKids = null;
  switch (s.kind) {
    case "weekend": mainKids = ["주말입니다"]; subText = ""; break;
    case "noclass": mainKids = ["오늘은 수업이 없습니다"]; subText = ""; break;
    case "invalid": mainKids = ["종 시간을 확인해 주세요"]; subText = "주간 시간표 편집에서 교시별 시작과 끝 시간을 넣어 주세요."; break;
    case "before": mainKids = ["수업 전"]; subText = `첫 수업까지 ${fmtLeft(s.until)}`; nextKids = nextLine(s.next, s.until); break;
    case "class": mainKids = [`${label(s.i)} `, h("span", { class: "cls", text: row[s.i] })]; subText = `${B[s.i].e} 종료, ${fmtLeft(s.left)} 남음`; prog = s.prog; nextKids = nextLine(s.next, s.until); break;
    case "free": mainKids = [`${label(s.i)} 공강`]; subText = `${B[s.i].e}까지, ${fmtLeft(s.left)} 남음`; prog = s.prog; nextKids = nextLine(s.next, s.until); break;
    case "break": mainKids = ["쉬는 시간"]; subText = `${fmtLeft(s.left)} 뒤 ${label(s.i + 1)} 종`; prog = s.prog; nextKids = nextLine(s.next, s.until); break;
    case "lunch": mainKids = ["점심시간"]; subText = `${B[s.i + 1].s}에 ${label(s.i + 1)} 시작, ${fmtLeft(s.left)} 남음`; prog = s.prog; nextKids = nextLine(s.next, s.until); break;
    case "after": mainKids = ["오늘 수업 끝"]; subText = ""; break;
  }
  main.replaceChildren(...mainKids);
  sub.textContent = subText;
  wrap.hidden = prog == null;
  if (prog != null) bar.style.width = (Math.max(0, Math.min(1, prog)) * 100).toFixed(1) + "%";
  next.hidden = !nextKids;
  if (nextKids) next.replaceChildren(...nextKids);
  return s;
}

let lastDay = "", lastMinute = -1;
function tick() {
  const now = new Date();
  const clock = $("clock");
  clock.firstChild.nodeValue = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  clock.querySelector(".sec").textContent = pad(now.getSeconds());
  const k = todayKey(now);
  if (k !== lastDay) {
    lastDay = k;
    $("dateMain").textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${WD[now.getDay()]})`;
    ensureAtt(k); renderDdays(); renderClass(); loadMeal(); autoWeek();
  }
  if (dataKey && !keepOn && Date.now() - lastActive > state.idleMin * 60000) lockNow();
  renderNow(now);
  const mm = now.getHours() * 60 + now.getMinutes();
  if (mm !== lastMinute) { lastMinute = mm; renderPeriods(now); renderTT(); loadWx(); }
}

/* ---------- 오늘 시간표 ---------- */
function renderPeriods(now = new Date()) {
  const list = $("periods");
  const row = todayRow(now);
  if (!row) { $("todayAside").textContent = WD[now.getDay()] + "요일"; list.replaceChildren(h("li", { class: "empty", text: "주말에는 수업이 없습니다." })); return; }
  $("todayAside").textContent = `${WD[now.getDay()]}요일`;
  const m = now.getHours() * 60 + now.getMinutes();
  // 담임이면 우리 반 줄을 한 단 더 보인다(선생님 지시 2026-11-17). 비담임이거나 아직 못 받았으면 전처럼 세 단
  const crow = cfg().homeroom ? state.ttCls[dayIdx(now)] : null;
  const two = !!crow && crow.some(c => String(c).trim());
  list.className = "periods" + (two ? " two" : "");
  const items = [];
  if (two) items.push(h("li", { class: "period head" },
    h("span", { class: "p", text: "" }), h("span", { class: "tm", text: "" }),
    h("span", { class: "c", text: "내 수업" }), h("span", { class: "hc", text: classLabel(cfg().homeroom) })));
  for (let i = 0; i < 7; i++) {
    const b = state.bells[i];
    const s = toMin(b.s), e = toMin(b.e);
    const cls = ["period"];
    if (!row[i].trim()) cls.push("free");
    if (e <= m) cls.push("past"); else if (s <= m && m < e) cls.push("current");
    items.push(h("li", { class: cls.join(" ") },
      h("span", { class: "p", text: `${i + 1}교시` }),
      h("span", { class: "tm", text: `${b.s}~${b.e}` }),
      h("span", { class: "c", text: actShort(row[i].trim()) }),
      two ? h("span", { class: "hc", text: actShort(String(crow[i] || "").trim()) }) : null
    ));
  }
  list.replaceChildren(...items);
}

/* ---------- 주간 시간표 ---------- */
const WD5 = ["월", "화", "수", "목", "금"];
const actShort = (v) => v.replace(/^(자율|진로|학급)\S*활동$/, "$1");
/* 위젯은 보기만, 설정 수업 탭의 시간표는 고치기. 같은 함수가 둘 다 그린다. */
function ttRows(edit) {
  const now = new Date(), di = dayIdx(now), m = now.getHours() * 60 + now.getMinutes();
  /* "교시"를 따로 감싸 둔다. 아주 좁은 칸에서는 desk.css 가 접어 "1"만 남긴다. 오늘은 색으로만 알린다. */
  const rows = [h("tr", null, h("th", { class: "ph" }, h("span", { class: "pl", text: "교시" })),
    ...WD5.map((d, i) => h("th", { class: !edit && i === di ? "today" : null, text: d })))];
  for (let p = 0; p < 7; p++) {
    const b = state.bells[p];
    const ph = edit
      ? h("th", { class: "ph" }, h("div", { class: "pn", text: `${p + 1}교시` }), h("div", { class: "bell" },
          hmIn(b, "s", `${p + 1}교시 시작`), h("span", { text: "~" }), hmIn(b, "e", `${p + 1}교시 끝`)))
      : h("th", { class: "ph" }, `${p + 1}`, h("span", { class: "pl", text: "교시" }), h("span", { class: "tm", text: `${b.s}~${b.e}` }));
    const cells = [0, 1, 2, 3, 4].map((d) => {
      const v = state.tt[d][p];
      if (edit) {
        const td = h("td", { class: cellKind(v) }, h("input", { type: "text", value: v, maxlength: "12", "aria-label": `${WD5[d]} ${p + 1}교시`,
          oninput: (e) => { state.tt[d][p] = e.target.value; state.ttSubj[d][p] = ""; td.className = cellKind(e.target.value); state.ttExample = false; save(); renderTT(); } }));
        return td;
      }
      const cls = [];
      if (!v.trim()) cls.push("empty-cell");
      if (d === di) { cls.push("todaycol"); if (v.trim() && toMin(b.s) <= m && m < toMin(b.e)) cls.push("nowcell"); }
      return h("td", { class: cls.join(" "), text: actShort(v.trim()) });
    });
    rows.push(h("tr", null, ph, ...cells));
  }
  return rows;
}
function renderTT() { $("tt").replaceChildren(...ttRows(false)); }
/* 설정 창 칸 색: 수업이 든 칸은 칠하고 빈칸은 그대로 */
const cellKind = (v) => String(v).trim() ? "on" : "";
/* 종 시간 칸. type=time 은 좁으면 "오전" 만 보이고 시각이 잘려서 08:50 글자로 받는다(선생님 지적 2026-11-13). */
function hmIn(b, k, label) {
  return h("input", { type: "text", inputmode: "numeric", maxlength: "5", value: b[k], "aria-label": label,
    onchange: (e) => {
      const m = /^(\d{1,2}):?(\d{2})$/.exec(e.target.value.trim());
      if (!m || +m[1] > 23 || +m[2] > 59) { e.target.value = b[k]; toast("시각은 08:50 처럼 넣어 주세요"); return; }
      b[k] = pad(+m[1]) + ":" + m[2]; e.target.value = b[k];
      state.ttExample = false; save(); renderTT(); renderPeriods();
    } });
}
const fmtHM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
function makeBells(start, cls, brk, lunch, lunchAfter) {
  let t = toMin(start);
  const out = [];
  for (let i = 0; i < 7; i++) {
    out.push({ s: fmtHM(t), e: fmtHM(t + cls) });
    t += cls + (i + 1 === lunchAfter ? lunch : brk);
  }
  return out;
}
/* 지금 종 시간에서 공식을 거꾸로 읽어 칸을 채운다. 말이 안 되는 값이면 기본값을 보인다. */
function bellForm() {
  const B = state.bells, la = state.lunchAfter;
  const ok = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
  const pick = (n, lo, hi, dflt) => ok(n, lo, hi) ? n : dflt;
  const num = (v, label) => h("input", { type: "text", inputmode: "numeric", maxlength: "3", value: String(v), "aria-label": label });
  const startIn = h("input", { type: "text", inputmode: "numeric", maxlength: "5", value: /^\d{1,2}:\d{2}$/.test(B[0].s) ? B[0].s : "08:50", "aria-label": "1교시 시작" });
  const clsIn = num(pick(toMin(B[0].e) - toMin(B[0].s), 1, 120, 45), "수업 시간");
  const brkIn = num(pick(toMin(B[1].s) - toMin(B[0].e), 0, 60, 5), "쉬는 시간");
  const lunchIn = num(pick(toMin(B[la].s) - toMin(B[la - 1].e), 0, 180, 60), "점심시간");
  const fill = h("button", { class: "btn small secondary", type: "button", id: "bellFill", text: "시간 채우기", onclick: () => {
    const cls = Number(clsIn.value), brk = Number(brkIn.value), lunch = Number(lunchIn.value);
    if (!ok(toMin(startIn.value), 0, 1439) || !ok(cls, 1, 120) || !ok(brk, 0, 60) || !ok(lunch, 0, 180)) {
      toast("시정을 확인해 주세요"); return;
    }
    state.bells = makeBells(startIn.value, cls, brk, lunch, la);
    state.ttExample = false; save();
    renderTT(); renderPeriods(); renderNow(new Date()); renderSet();
    toast("시정을 채웠습니다");
  } });
  const unit = (el, u) => h("span", { class: "unit" }, el, u ? h("span", { text: u }) : null);
  // [시간 채우기 단추, 칸 줄]: 단추는 블록 머리줄에 선다
  return [fill, h("div", { class: "tt-bells" },
    setField("1교시 시작", unit(startIn)),
    setField("수업", unit(clsIn, "분")),
    setField("쉬는 시간", unit(brkIn, "분")),
    setField("점심", unit(lunchIn, "분")))];
}
/* ---------- 바로가기 ---------- */
const linksEl = $("links");
const TILE_COLORS = ["#0E7A5C", "#3567AE", "#B5543A", "#7A5AB8", "#B07C14", "#3C7F8C", "#A2456E", "#4F6B2E"];
function tileColor(s) { let x = 0; for (const c of s) x = (x * 31 + c.codePointAt(0)) >>> 0; return TILE_COLORS[x % TILE_COLORS.length]; }
function normalizeUrl(u) {
  u = u.trim(); if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { const p = new URL(u); return p.protocol.startsWith("http") ? p.href : ""; } catch (e) { return ""; }
}
const hostOf = (url) => { try { return new URL(url).hostname; } catch (e) { return ""; } };
const linkLabel = (l) => l.name || hostOf(l.url).replace(/^www\./, "") || l.url;
/* 아이콘은 한 칸(icon)에 적는다: 호클래스 아이콘 이름, "favicon", 또는 빈 값(첫 글자 타일).
   옛 자료에 이모지 글자가 적혀 있으면 resolveIcon() 이 아이콘 이름으로 바꿔 준다.
   shortcut: 파비콘은 구글이 모아 주는 것을 쓴다. 구글이 막히면 사이트마다 /favicon.ico 를 직접 읽어야 한다. */
const faviconUrl = (url) => "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(hostOf(url)) + "&sz=64";
function linkIcon(l, label) {
  const tile = () => h("span", { class: "mono-tile", style: `background:${tileColor(label)}`, text: [...label][0].toUpperCase() });
  if (l.icon === "favicon") {
    const img = h("img", { class: "link-ico", src: faviconUrl(l.url), alt: "", loading: "lazy" });
    img.addEventListener("error", () => img.replaceWith(tile()));   // 파비콘이 없는 사이트는 첫 글자로 돌아간다
    return img;
  }
  if (l.icon) return h("span", { class: "link-ico svg", html: svgIc(resolveIcon(l.icon), 22) });
  return tile();
}
/* 호클래스와 같은 단색 아이콘만 쓴다(shared/icons.js). 길잡이용(x, check 같은 것)은 뺐다. */
const ICON_PICK = ["globe", "book-open", "book", "pencil", "scroll-text", "landmark", "castle", "users",
  "calendar-days", "clock", "layout-grid", "message-square", "image", "map", "compass", "list-ordered",
  "star", "trophy", "medal", "crown", "gem", "sparkles", "gift", "party-popper", "vote", "settings",
  "eye", "leaf"];

/* 위젯에는 누를 타일만 둔다. 더하고 지우는 것은 설정 화면 탭의 바로가기에서 한다. */
function renderLinks() {
  linksEl.replaceChildren(...state.links.map(l => {
    const label = linkLabel(l);
    return h("a", { class: "link", href: l.url, target: "_blank", rel: "noopener" },
      linkIcon(l, label),
      h("span", { class: "nm", text: label }));
  }));
}

/* ---------- 설정: 기초 시간표(진도 계획의 바탕) ---------- */
const baseFilled = () => state.baseTT.some(r => r.some(c => String(c).trim()));
function baseSection() {
  const ss = mySubjects();
  if (!ss.length) return setSec("기초 시간표", [h("p", { class: "set-state", text: "기본 탭의 내 과목에서 과목과 가르치는 반을 먼저 넣어 주세요." })]);
  // 칸 하나 = 학급과 과목 하나. 고를 것은 내 과목마다 그 과목을 가르치는 반
  const opts = ss.flatMap(s => s.classes.slice().sort(byClass).map(c => [c + "|" + s.name, c + " " + s.name]));
  const rows = [h("tr", null, h("th", { class: "ph" }, h("span", { class: "pl", text: "교시" })), ...WD5.map(d => h("th", { text: d })))];
  for (let p = 0; p < 7; p++) {
    rows.push(h("tr", null, h("th", { class: "ph", text: (p + 1) + "교시" }), ...[0, 1, 2, 3, 4].map(d => {
      const v = state.baseTT[d][p] ? state.baseTT[d][p] + "|" + state.baseSubj[d][p] : "";
      const sel = h("select", { "aria-label": `기초 ${WD5[d]} ${p + 1}교시`, onchange: (e) => {
        const [c, s] = e.target.value ? e.target.value.split("|") : ["", ""];
        state.baseTT[d][p] = c; state.baseSubj[d][p] = s; save(); td.className = c ? "on" : "";
      } }, h("option", { value: "", text: "" }), ...opts.map(([val, t]) => h("option", { value: val, text: t })));
      sel.value = opts.some(o => o[0] === v) ? v : "";
      const td = h("td", { class: sel.value ? "on" : "" }, sel);
      return td;
    })));
  }
  // 주간 시간표(나이스로 받은 이번 주)를 바탕으로 가져온다. 특별한 주일 수 있어 가져온 뒤 고친다
  const pull = h("button", { class: "btn small secondary", type: "button", id: "basePull", text: "주간 시간표에서 가져오기", onclick: () => {
    let n = 0;
    for (let d = 0; d < 5; d++) for (let p = 0; p < 7; p++) {
      const c = String(state.tt[d][p] || "").trim(), one = subjOfCls(c);
      const s = (state.ttSubj[d] || [])[p] && one.includes(state.ttSubj[d][p]) ? state.ttSubj[d][p] : one.length === 1 ? one[0] : "";
      state.baseTT[d][p] = s ? c : ""; state.baseSubj[d][p] = s; if (s) n++;
    }
    save(); renderSet(); toast(`${n}칸을 가져왔습니다. 이번 주만 다른 칸은 고쳐 주세요`);
  } });
  return setSec(["기초 시간표", pull,
    h("p", { class: "set-state", text: "진도 계획의 바탕입니다. 나이스에 그 주 시간표가 있으면 나이스를 따르고, 없는 주는 이 표로 채웁니다." })], [
    h("div", { class: "tt-scroll" }, h("table", { class: "tt tt-edit tt-base", id: "baseSet" }, ...rows))]);
}

/* ---------- 설정: 주간 시간표 ---------- */
function ttSection() {
  return setSec("주간 시간표", [
    (() => { const [fill, row] = bellForm(); return setBlock(["시정", fill], [row]); })(),
    setBlock("시간표", [h("div", { class: "tt-scroll" }, h("table", { class: "tt tt-edit", id: "ttSet" }, ...ttRows(true)))]),
  ]);
}

/* ---------- 설정: 바로가기 ---------- */
const linkDraft = { id: null, name: "", url: "", mode: "icon", ic: ICON_PICK[0] };
const LINK_DRAFT0 = { ...linkDraft };
const resetDraft = () => Object.assign(linkDraft, LINK_DRAFT0);
/* 있는 사이트를 고치러 들어간다. 아래 넣는 칸을 그대로 쓰고, 다 하면 같은 자리에 되쓴다. */
function editDraft(l) {
  Object.assign(linkDraft, {
    id: l.id, name: l.name || "", url: l.url,
    mode: l.icon === "favicon" ? "favicon" : l.icon ? "icon" : "none",
    ic: l.icon && l.icon !== "favicon" ? resolveIcon(l.icon) : ICON_PICK[0],
  });
  renderSet();
}
function draftIcon() {
  if (linkDraft.mode === "none") return "";
  if (linkDraft.mode === "favicon") return "favicon";
  return linkDraft.ic || ICON_PICK[0];
}
function linksSection() {
  const rows = state.links.map(l => h("div", { class: "lk-row" },
    linkIcon(l, linkLabel(l)),
    h("div", { class: "lk-txt" }, h("b", { text: linkLabel(l) }), h("span", { text: l.url })),
    h("button", { class: "btn secondary small", type: "button", text: "고치기",
      "aria-pressed": String(linkDraft.id === l.id), onclick: () => editDraft(l) }),
    h("button", { class: "btn secondary small", type: "button", text: "삭제", onclick: () => {
      state.links = state.links.filter(x => x.id !== l.id);
      if (linkDraft.id === l.id) resetDraft();
      save(); renderLinks(); renderSet();
    } })));
  const seg = (key, label) => h("button", {
    type: "button", "aria-pressed": String(linkDraft.mode === key), "data-mode": key, text: label,
    onclick: () => { linkDraft.mode = key; renderSet(); },
  });
  return setSec("바로가기", [
    setBlock("지금 있는 사이트", [rows.length
      ? h("div", { class: "lk-list", id: "lkList" }, ...rows)
      : h("p", { class: "set-state", text: "아직 없습니다" })]),
    setBlock([linkDraft.id ? "사이트 고치기" : "사이트 추가",
      h("button", { class: "btn small", type: "submit", form: "linkForm", text: linkDraft.id ? "저장" : "추가" }),
      linkDraft.id ? h("button", { class: "btn small secondary", type: "button", text: "그만두기",
        onclick: () => { resetDraft(); renderSet(); } }) : null,
      linkDraft.mode === "favicon" ? h("p", { class: "set-state", text: "사이트가 쓰는 그림을 가져옵니다. 그림이 없는 사이트는 첫 글자가 나옵니다." }) : null,
      linkDraft.mode === "none" ? h("p", { class: "set-state", text: "이름의 첫 글자가 나옵니다." }) : null], [
      h("form", { class: "set-form", id: "linkForm", onsubmit: (e) => {
        e.preventDefault();
        const url = normalizeUrl($("linkUrl").value);
        if (!url) { $("linkUrl").setCustomValidity("주소를 다시 넣어 주세요."); $("linkUrl").reportValidity(); return; }
        const made = { name: linkDraft.name.trim().slice(0, 30), url, icon: draftIcon() };
        const at = linkDraft.id ? state.links.findIndex(x => x.id === linkDraft.id) : -1;
        if (at >= 0) state.links[at] = { ...state.links[at], ...made };
        else state.links.push({ id: uid(), ...made });
        resetDraft();
        save(); renderLinks(); renderSet();
      } },
        h("div", { class: "set-grid" },
          setField("이름", h("input", { type: "text", id: "linkName", maxlength: "30", autocomplete: "off",
            value: linkDraft.name, oninput: (e) => { linkDraft.name = e.target.value; } })),
          setField("주소", h("input", { type: "text", id: "linkUrl", autocomplete: "off",
            value: linkDraft.url, oninput: (e) => { linkDraft.url = e.target.value; e.target.setCustomValidity(""); } }))),
        h("div", { class: "seg" }, seg("icon", "이모지"), seg("favicon", "파비콘"), seg("none", "설정 안 함")),
        linkDraft.mode === "icon" ? h("div", { class: "emoji-pick" }, ...ICON_PICK.map(name => h("button", {
          type: "button", "aria-pressed": String(linkDraft.ic === name), "data-ic": name,
          title: name, "aria-label": name, html: svgIc(name, 22),
          onclick: () => { linkDraft.ic = name; renderSet(); },
        }))) : null,
      ),
    ]),
  ]);
}

/* ---------- 학년도 설정 ---------- */
let setOpen = false;
function guardForm(btn, errEl, fn) {
  return async (e) => {
    e.preventDefault();
    errEl.textContent = "";
    const icon = btn.classList.contains("icon-btn"), label = btn.textContent;
    btn.disabled = true; if (!icon) btn.textContent = "처리 중";
    try { await fn(); }
    catch (x) { errEl.textContent = (x && x.message) || "처리하지 못했습니다. 다시 시도해 주세요."; }
    finally { btn.disabled = false; if (!icon) btn.textContent = label; }
  };
}
function passField(id, label, auto) {
  return h("label", { class: "field" }, label, h("input", { type: "password", id, autocomplete: auto }));
}
/* 설정은 장 차례대로 다섯 탭(선생님 지시 2026-11-14). 탭 하나가 묶음 여럿을 위아래로 쌓는다. */
const SET_TABS = [
  { key: "year", name: "기본", desc: "학교, 학년도, 나이스 인증키, 잠금과 백업" },
  { key: "screen", name: "화면", desc: "위젯 배치와 바로가기" },
  { key: "lesson", name: "수업", desc: "수업 반, 과목, 시간표, 학생 명단" },
  { key: "home", name: "담임", desc: "담임 반과 학생 명단" },
  { key: "work", name: "업무", desc: "학사 일정, 구글 캘린더, 계획 올리기" },
];
let setTab = "year", setPage = 1;
let mealToday = null;          // 오늘 급식 { day, list }
function closeSet() { setOpen = false; renderSet(); }
/* 뒤로 가기가 교무수첩 밖으로 나가지 않고 설정만 닫게(선생님 지적 2026-11-14). 열 때 방문 기록 한 칸을 얹고,
   뒤로 가기(popstate)면 닫는다. 단추나 Esc 로 닫으면 얹은 칸을 걷는다. 보던 장은 그대로라 손댈 것이 없다. */
let setHist = false;
function setHistory() {
  if (setOpen && !setHist) { setHist = true; history.pushState({ deskSet: 1 }, ""); }
  else if (!setOpen && setHist) { setHist = false; if (history.state && history.state.deskSet) history.back(); }
}
window.addEventListener("popstate", () => { if (setHist) { setHist = false; setOpen = false; renderSet(); } });
const setField = (name, el) => h("label", { class: "field" }, name, el);
/* 묶음마다 소제목과 테두리를 둬서 빽빽하지 않게 (선생님 지시 2026-11-12) */
// 제목이 카드 제목과 겹치면 null 로 둔다(나이스 > 인증키 > 나이스 인증키처럼 세 번 쓰지 않게)
// 제목 자리에 [제목, 단추…] 를 주면 단추를 제목 줄 끝에 둔다(단추 하나만 한 줄에 따로 두지 않게, 2026-11-14)
// 제목 자리에 [제목, 단추, 안내…] 를 주면 머리줄 한 줄에 모은다(hd 가 자리를 가른다)
const titled = (tag, cls, title) => Array.isArray(title) ? hd(tag, title[0], title.slice(1), cls) : hd(tag, title, [], cls);
const setBlock = (title, kids) => h("div", { class: "set-block" },
  title ? titled("h4", "set-sub", title) : null, ...kids.filter(Boolean));
// err(오류 글)는 머리줄에 둔다. 내용 아래에는 아무것도 두지 않는다.
function setSec(title, body, err) {
  const t = Array.isArray(title) ? title : [title];
  return h("section", { class: "set-sec" },
    titled("h3", "", [...t, err || null]),
    ...(Array.isArray(body) ? body : [body]).filter(Boolean));
}

function renderSet() {
  const p = $("setPanel"), scrim = $("setScrim");
  p.hidden = !setOpen;
  scrim.hidden = !setOpen;
  document.body.classList.toggle("set-on", setOpen);   // 장 바, 우상단 도구를 숨긴다(desk.css)
  setHistory();
  if (!setOpen) { p.replaceChildren(); return; }
  if (!SET_TABS.some(t => t.key === setTab)) setTab = "year";
  const cur = SET_TABS.find(t => t.key === setTab);
  const old = p.querySelector(".set-main"), keepTop = old && old.dataset.tab === setTab ? old.scrollTop : 0;
  /* 2단(선생님 지시 2026-11-14: 늘어지지 않게). [왼쪽, 오른쪽, 아래 전체 폭]. 좁으면 왼쪽, 오른쪽, 아래 차례로 한 줄. */
  const [left, right, full] = setTab === "screen" ? [[gridSection()], [linksSection()], []]
    : setTab === "lesson" ? [[yearSection("lesson"), rosterSec("lesson")], [neisSection("lesson"), lessonResetSec()], [baseSection(), ttSection()]]
    : setTab === "home" ? [[yearSection("home")], [rosterSec("home")], []]
    : setTab === "work" ? [[neisSection("work"), calPasteSec()], [gcalSection(), planImportSec()], []]
    : [[yearSection(), C.body && C.body.pass ? passSection() : null], [neisSection("year"), backupSection()], []];
  const col = (list) => h("div", { class: "set-col" }, ...list.filter(Boolean));
  const main = h("div", { class: "set-main", "data-tab": setTab },
    h("div", { class: "set-inner" },
      h("div", { class: "set-lead" }, h("h2", { class: "set-page", text: cur.name }), h("p", { text: cur.desc })),
      h("div", { class: "set-cols" }, col(left), col(right)),
      ...full.filter(Boolean)));
  p.replaceChildren(
    h("div", { class: "set-head" },
      h("h2", { class: "set-title", id: "setTitle", text: "설정" }),
      h("button", { class: "set-x", type: "button", id: "setClose", title: "닫기 (Esc)", "aria-label": "닫기", text: "×", onclick: closeSet })),
    h("div", { class: "set-body" },
      h("nav", { class: "set-tabs", "aria-label": "설정 메뉴" }, ...SET_TABS.map(t => h("button", {
        class: "set-tab", type: "button", "aria-pressed": String(t.key === setTab),
        "data-tab": t.key, text: t.name,
        onclick: () => { setTab = t.key; renderSet(); },
      }))),
      main));
  main.scrollTop = keepTop;   // 같은 탭을 다시 그릴 때(반 고르기 등) 맨 위로 튀지 않게
}

/* 기본(학교, 학년도, 보안), 수업(수업 반), 담임(담임 반) 탭이 나눠 그린다(2026-11-14 탭 재편).
   누르는 즉시 저장한다. 반은 학년 단추와 반 번호 단추로 고르고, 반 수는 학교에 맞게 나이스에서 받는다. */
const ROOM_MAX = 12;           // 반 수를 아직 못 받았을 때(내년 학년도처럼 나이스에 없을 때)
const pickGrade = {};          // 고르개마다 지금 펼친 학년(다시 그려도 남게)
let homeOn = false;            // 담임을 눌렀지만 반은 아직 안 고른 때
let schoolEdit = false;        // 정한 학교를 바꾸려고 찾기 칸을 연 때
const roomTried = new Set();   // 반 수를 한 번 물어본 학교와 학년도(실패해도 되풀이하지 않게)
const byClass = (a, b) => a.localeCompare(b, "ko", { numeric: true });

/* 그 학년도의 학년별 반 수 { "1": 5, ... }. 그 해 것이 없으면 가장 가까운 해 것을 쓴다. */
function roomCounts() {
  const rooms = (state.neis.school && state.neis.school.rooms) || {};
  const Y = String(state.year.current);
  if (rooms[Y]) return rooms[Y];
  const ys = Object.keys(rooms).sort((a, b) => Math.abs(a - Y) - Math.abs(b - Y));
  return ys.length ? rooms[ys[0]] : null;
}
async function fetchRooms() {
  const sc = state.neis.school, Y = state.year.current;
  if (!sc || (sc.rooms && sc.rooms[Y]) || roomTried.has(sc.code + Y)) return;
  roomTried.add(sc.code + Y);
  try {
    const got = await Neis.loadRoomCounts(sc, Y, state.neis.key);
    if (!Object.keys(got).length || state.neis.school !== sc) return;
    sc.rooms = { ...(sc.rooms || {}), [Y]: got };
    save(true); renderSet();
  } catch (e) { /* 못 받으면 12반까지 보인다 */ }
}

function roomPicker(id, picked, onPick) {
  const counts = roomCounts();
  const grades = counts ? Object.keys(counts).map(Number).sort((a, b) => a - b) : [1, 2, 3];
  const g = grades.includes(pickGrade[id]) ? pickGrade[id]
    : grades.find(n => picked.some(c => c.startsWith(n + "-"))) || grades[0];
  const n = (counts && counts[g]) || ROOM_MAX;
  return h("div", { class: "room-pick", id },
    h("div", { class: "seg" }, ...grades.map(x => h("button", {
      type: "button", "data-grade": String(x), "aria-pressed": String(x === g), text: x + "학년",
      onclick: () => { pickGrade[id] = x; renderSet(); } }))),
    h("div", { class: "room-nums" }, ...Array.from({ length: n }, (_, i) => {
      const c = g + "-" + (i + 1);
      return h("button", { class: "cpick", type: "button", "data-cls": c, "aria-pressed": String(picked.includes(c)),
        text: (i + 1) + "반", onclick: () => onPick(c) });
    })));
}
const setLine = (label, ...kids) => h("div", { class: "set-line" },
  h("span", { class: "set-label", text: label }), h("div", { class: "set-val" }, ...kids.filter(Boolean)));

let keepAsk = false;           // 잠그지 않기를 켜려고 비밀번호 칸을 연 때
function keepLine() {
  const err = h("p", { class: "form-err", role: "alert" });
  const box = h("input", { type: "checkbox", id: "keepOpen", checked: keepOn || keepAsk ? true : null,
    onchange: (e) => {
      if (e.target.checked) { keepAsk = true; renderSet(); return; }
      keepAsk = false; forgetKeep(); renderSet(); toast("이 기기에서도 교무수첩을 잠급니다");
    } });
  const passIn = h("input", { type: "password", id: "keepPass", autocomplete: "current-password", "aria-label": "교무수첩 비밀번호" });
  const go = h("button", { class: "btn small", type: "button", id: "keepGo", text: "켜기", onclick: async () => {
    err.textContent = ""; go.disabled = true;
    try { await keepWith(passIn.value); keepAsk = false; renderSet(); renderNb(); toast("이 기기에서는 교무수첩을 잠그지 않습니다"); }
    catch (x) { err.textContent = (x && x.message) || "켜지 못했습니다."; go.disabled = false; }
  } });
  passIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });
  return setLine("잠금",
    h("label", { class: "check-row" }, box, "이 기기에서는 교무수첩을 잠그지 않기"),
    keepAsk && !keepOn ? h("div", { class: "set-row" }, passIn, go) : null,
    err,
    h("p", { class: "set-state", text: keepOn
      ? "이 브라우저에 열쇠를 두었습니다. 비밀번호를 묻지 않고, 한참 안 써도 잠그지 않습니다. 나가기를 누르면 지웁니다."
      : keepAsk ? "교무수첩 비밀번호를 한 번 넣으면 켜집니다. 혼자 쓰는 PC에서만 켜 주세요."
      : "끄면 열 때마다 비밀번호를 묻고, 아래 시간 동안 안 쓰면 잠급니다." }));
}

function yearSection(part) {
  const y = cfg();
  const years = Object.keys(state.year.years).map(Number).sort((a, b) => a - b);
  if (!years.includes(state.year.current)) years.push(state.year.current);
  const err = h("p", { class: "form-err", role: "alert" });
  const putYear = (patch) => {
    state.year.years[state.year.current] = { homeroom: y.homeroom || "", classes: y.classes || [], ...patch };
    state.year.configured = true;
    save(true); openYearDocs();
    renderSet(); renderLinks(); renderClass(); renderBook();
    hc = null; loadHc();
  };
  const goYear = (Y) => {
    state.year.current = Y;
    if (!state.year.years[Y]) state.year.years[Y] = { homeroom: "", classes: [] };
    state.year.configured = true;
    homeOn = false;
    save(true); openYearDocs();
    renderSet(); renderClass(); renderBook();
    hc = null; loadHc();
  };
  fetchRooms();

  /* 학교: 나이스에서 찾는다. 급식, 학사 일정, 시간표, 반 수가 이 학교로 온다. */
  const school = state.neis.school;
  const findIn = h("input", { type: "text", id: "neisFind", value: (school && school.name) || state.school || "", autocomplete: "off", "aria-label": "학교 이름" });
  const found = h("div", { class: "set-row", id: "neisFound" });
  const findBtn = h("button", { class: "btn small secondary", type: "button", id: "neisFindBtn", text: "찾기", onclick: async () => {
    err.textContent = "";
    findBtn.disabled = true;
    try {
      const list = await Neis.findSchools(findIn.value.trim(), state.neis.key);
      if (!list.length) { err.textContent = "그 이름의 학교를 찾지 못했습니다."; return; }
      found.replaceChildren(...list.slice(0, 8).map(s => h("button", {
        class: "cpick", type: "button", text: s.name + " (" + s.office.replace("교육청", "") + ")",
        onclick: () => {
          state.neis = { ...state.neis, school: { name: s.name, atpt: s.atpt, code: s.code, kind: s.kind } };
          schoolEdit = false;
          save(true); renderSet();
          mealToday = null; loadMeal();
          toast(s.name + "으로 정했습니다");
        } })));
    } catch (e) { err.textContent = (e && e.message) || "학교를 찾지 못했습니다."; }
    finally { findBtn.disabled = false; }
  } });
  findIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); findBtn.click(); } });
  const schoolVal = school && !schoolEdit
    ? [h("div", { class: "set-row" }, h("span", { class: "set-now", text: school.name }),
       h("button", { class: "text-btn", type: "button", id: "schoolEdit", text: "고치기", "aria-label": "학교 바꾸기", onclick: () => { schoolEdit = true; renderSet(); } }))]
    : [h("div", { class: "set-row" }, findIn, findBtn), found];

  /* 학년도: 고르기, 다음 학년도 추가 */
  const next = Math.max(...years) + 1;
  const yearVal = [
    ...years.map(Y => h("button", { class: "cpick", type: "button", "aria-pressed": String(Y === state.year.current),
      "data-year": String(Y), text: Y + "학년도", onclick: () => { if (Y !== state.year.current) goYear(Y); } })),
    h("button", { class: "text-btn", type: "button", id: "setYearAdd", text: "+ " + next + "학년도",
      onclick: () => { goYear(next); toast(next + "학년도를 추가했습니다"); } }),
  ];

  /* 담임: 담임, 비담임을 먼저 고르고 담임이면 반을 고른다 */
  const isHome = !!y.homeroom || homeOn;
  const homeVal = [
    h("div", { class: "seg", id: "setHome" },
      h("button", { type: "button", "data-home": "1", "aria-pressed": String(isHome), text: "담임",
        onclick: () => { homeOn = true; renderSet(); } }),
      h("button", { type: "button", "data-home": "0", "aria-pressed": String(!isHome), text: "비담임",
        onclick: () => { homeOn = false; if (y.homeroom) putYear({ homeroom: "" }); else renderSet(); } })),
    isHome ? roomPicker("setHomeCls", y.homeroom ? [y.homeroom] : [], (c) => putYear({ homeroom: c })) : null,
  ];

  const classes = (y.classes || []).slice().sort(byClass);
  const idleSel = h("select", { id: "setIdle", "aria-label": "자동 잠금",
    onchange: (e) => { state.idleMin = Number(e.target.value); save(true); } },
    ...[5, 15, 30, 60].map(m => h("option", { value: String(m), text: m + "분 뒤" })));
  idleSel.value = String(state.idleMin);

  if (part === "home") return h("section", { class: "set-sec", id: "setHomeSec" },
    hd("h3", state.year.current + "학년도 담임 반", [err]),
    setBlock(null, homeVal));
  if (part === "lesson") return h("section", { class: "set-sec", id: "setLessonSec" },
    hd("h3", state.year.current + "학년도 수업 반", [
      h("button", { class: "text-btn", type: "button", id: "setFromTT", text: "시간표에서 가져오기", onclick: () => {
        const got = parseClasses(state.tt.flat().filter(c => /^\s*\d+\s*-\s*\d+\s*$/.test(c)).join(", ")).sort(byClass);
        if (!got.length) { err.textContent = "주간 시간표에 반이 적혀 있지 않습니다."; return; }
        err.textContent = "";
        putYear({ classes: got });
      } }),
      h("p", { class: "set-state", id: "setClassList", text: classes.length ? classes.join(", ") : "고른 반이 없습니다" }),
      err]),
    setBlock(null, [
      roomPicker("setClasses", classes,
        (c) => putYear({ classes: classes.includes(c) ? classes.filter(x => x !== c) : [...classes, c].sort(byClass) })),
    ]));

  return h("section", { class: "set-sec", id: "setForm" },
    hd("h3", "내 정보", [err]),
    setBlock(null, [
      setLine("학교", ...schoolVal),
      setLine("학년도", h("div", { class: "set-row" }, ...yearVal)),
    ]),
    setBlock("보안", [keepLine(), keepOn ? null : setLine("자동 잠금", idleSel)]));
}

/* ---------- 나이스에서 받아오기 ---------- */
function neisSection(part) {
  const N = state.neis;
  const err = h("p", { class: "form-err", role: "alert" });
  const note = h("p", { class: "set-state", id: "neisNote" });
  const busy = (btn, on) => { btn.disabled = on; btn.textContent = on ? "받는 중…" : btn.dataset.label; };
  const run = (btn, fn) => async () => {
    err.textContent = ""; note.textContent = "";
    busy(btn, true);
    try { await fn(); } catch (e) { err.textContent = (e && e.message) || "받지 못했습니다."; }
    busy(btn, false);
  };
  const doBtn = (id, label, fn) => {
    const b = h("button", { class: "btn small secondary", type: "button", id, text: label });
    b.dataset.label = label;
    b.addEventListener("click", run(b, () => fn(b)));
    return b;
  };

  /* 인증키 */
  const keyIn = h("input", { type: "text", id: "neisKey", value: N.key || "", autocomplete: "off", spellcheck: "false", "aria-label": "나이스 인증키" });

  /* 과목마다 가르치는 반이 다르다. 그래서 과목은 줄 여럿이고 줄마다 반을 고른다. */
  const myClasses = () => {
    const c = (cfg().classes || []).slice();
    if (cfg().homeroom && !c.includes(cfg().homeroom)) c.push(cfg().homeroom);
    // 학년이 섞이면 적은 차례가 뒤죽박죽이다. 학년, 반 차례로 세운다.
    return c.sort((x, y) => x.localeCompare(y, "ko", { numeric: true }));
  };
  // 옛 자료는 과목 칸 하나였다. 탭을 열 때 줄 하나로 옮기고 수업 반을 다 켜 둔다.
  if (!N.subjects.length && N.subject) {
    N.subjects.push({ name: N.subject, classes: myClasses() });
    N.subject = "";
    save(true);
  }
  const subjRow = (s, i) => h("div", { class: "nsub" },
    h("input", { type: "text", class: "nsub-nm", maxlength: "20", autocomplete: "off", value: s.name,
      "aria-label": "과목 이름",
      onchange: (e) => { s.name = e.target.value.trim().slice(0, 20); save(true); autoWeek(); } }),
    h("div", { class: "nsub-cls" }, ...myClasses().map(c => h("button", {
      class: "cpick", type: "button", text: c, "aria-pressed": String(s.classes.includes(c)),
      onclick: () => {
        s.classes = s.classes.includes(c) ? s.classes.filter(x => x !== c) : [...s.classes, c];
        save(true); renderSet(); autoWeek();
      } }))),
    h("button", { class: "btn secondary small", type: "button", text: "삭제",
      "aria-label": (s.name || "이 과목") + " 지우기",
      onclick: () => { N.subjects.splice(i, 1); save(true); renderSet(); } }));

  // 학교는 기본 탭에서 한 번만 정한다(선생님 지적 2026-11-13: 학교 이름을 두 군데서 넣었다).
  const school = N.school;
  const now = new Date();
  const noSchool = school ? null : h("p", { class: "set-state", text: "기본 탭에서 학교를 먼저 정해 주세요." });
  // 설정은 탭마다 나눠 담는다: 기본=인증키와 급식, 수업=과목과 시간표, 업무=학사 일정.
  if (part === "lesson") return setSec(["나이스 시간표", note], [
    setBlock(myClasses().length ? ["내 과목", h("button", {
        class: "btn small secondary", type: "button", id: "neisSubjAdd", text: "과목 추가",
        onclick: () => { N.subjects.push({ name: "", classes: myClasses() }); save(true); renderSet(); },
      })] : "내 과목", myClasses().length ? [
      N.subjects.length
        ? h("div", { class: "nsub-list", id: "neisSubjects" }, ...N.subjects.map(subjRow))
        : h("p", { class: "set-state", text: "아직 없습니다" }),
    ] : [h("p", { class: "set-state", text: "위에서 수업 반을 먼저 골라 주세요." })]),
    school ? setBlock(["받아오기", doBtn("neisTT", "이번 주 시간표 받기", async () => {
        const r = await fetchWeek(now);
        note.textContent = r.n + "칸을 채웠습니다." + (r.short ? " " + Neis.KEY_HINT : "");
      }), h("p", { class: "set-state", text: "과목에 맞는 칸만 아래 주간 시간표에 채웁니다. 하루 한 번은 저절로 받습니다." })], []) : noSchool,
  ], err);
  if (part === "work") return setSec(["학사 일정", school ? doBtn("neisCal", "학사 일정 받기", async () => {
        const list = await Neis.loadSchedule(school, state.year.current, N.key);
        if (!list.length) { err.textContent = "그 학년도의 학사 일정이 없습니다."; return; }
        state.cal = list.map(x => ({ d: x.d, name: x.name })).slice(0, 400);
        state.calSchool = school.name;
        state.calAt = new Date().toISOString();
        save(true); renderDdays();
        note.textContent = list.length + "건을 받았습니다." + (list.short ? " " + Neis.KEY_HINT : "");
      }) : null, school ? h("p", { class: "set-state", text: state.cal.length
        ? `${state.calSchool || school.name} 일정 ${state.cal.length}건이 있습니다. D-day 와 주간 계획에 들어갑니다.`
        : "받으면 D-day 와 주간 계획에 들어갑니다." }) : null, note], [noSchool], err);
  return setSec(["나이스", note], [
    setBlock(["인증키",
      h("a", { class: "text-btn", href: "https://open.neis.go.kr", target: "_blank", rel: "noopener", text: "인증키 받으러 가기" }),
      h("button", { class: "btn small", type: "button", id: "neisSave", text: "저장", "aria-label": "인증키 저장", onclick: () => {
        state.neis = { ...state.neis, key: keyIn.value.trim() };
        save(true); renderSet(); toast("저장했습니다");
      } })], [keyIn]),
    school ? setBlock(["급식", doBtn("neisMeal", "오늘 급식 받기", async () => {
        const list = await Neis.loadMeal(school, todayKey().replace(/-/g, ""), N.key);
        mealToday = { day: todayKey(), list };
        renderBook();
        note.textContent = list.length ? list.map(m => m.kind + ": " + m.dishes.join(", ")).join(" / ") : "오늘 급식이 없습니다.";
      })], []) : null,
  ], err);
}

/* 비밀번호 바꾸기 */
function passSection() {
  const cur = h("input", { type: "password", id: "chgCur", autocomplete: "current-password" });
  const err = h("p", { class: "form-err", role: "alert" });
  const btn = iconBtn("비밀번호 바꾸기", "check", null, { type: "submit", id: "chgSave", form: "chgForm" });
  const form = h("form", { class: "set-form", id: "chgForm", onsubmit: guardForm(btn, err, async () => {
    const a = $("chgNew").value, b = $("chgNew2").value;
    if (a.length < 8) throw new Error("새 비밀번호를 8자 이상으로 넣어 주세요.");
    if (a !== b) throw new Error("새 비밀번호 두 칸이 서로 다릅니다. 다시 넣어 주세요.");
    const raw = await rewrap(cur.value, a);
    raw.fill(0);
    cur.value = ""; $("chgNew").value = ""; $("chgNew2").value = "";
    toast("비밀번호를 바꿨습니다. 다른 기기에서도 새 비밀번호로 열어 주세요");
  }) },
    h("div", { class: "set-grid" },
      setField("현재 비밀번호 또는 복구 키", cur),
      passField("chgNew", "새 비밀번호", "new-password"),
      passField("chgNew2", "새 비밀번호 확인", "new-password")));
  return setSec(["비밀번호", btn], [form], err);
}

/* ---------- 우리 반 ---------- */
let recoverMode = false;
let hideNames = false;
try { hideNames = localStorage.getItem(LS_PREFIX + "hideNames") === "1"; } catch (e) {}
function studentsAll() {
  const v = docs.roster && docs.roster.value;
  const c = v && v.classes && v.classes[picked()];
  return c && Array.isArray(c.students) ? c.students : [];
}
function attMarks() { return marksOf(docs.att); }
function marksOf(A) {
  const v = A.value;
  if (!v.marks || typeof v.marks !== "object") v.marks = {};
  attCache.set(A.key, v);
  return v.marks;
}
// 같은 학번의 이름이 바뀌면 기록이 다른 학생에게 붙은 것이다. 알리기만 한다.
function checkNames() {
  const R = docs.roster;
  if (!hc || !R || !R.ready) { hcWarns = []; return; }
  R.value.seen = R.value.seen || {};
  hcWarns = nameChanges(hc, R.value.seen);
  if (!hcWarns.length) {
    const snap = snapshotNames(hc);
    if (JSON.stringify(snap) !== JSON.stringify(R.value.seen)) { R.value.seen = snap; saveEnc(R); }
  }
}
function acceptNames() {
  const R = docs.roster;
  if (!hc || !R || !R.ready) return;
  R.value.seen = snapshotNames(hc);
  saveEnc(R); hcWarns = [];
  renderClass(); renderBook();
  toast("새 이름을 기준으로 삼았습니다");
}
function warnBanner() {
  if (!hcWarns.length) return null;
  const lines = hcWarns.slice(0, 8).map(w => `${w.cls} ${w.no}번: ${w.was}에서 ${w.now}(으)로`);
  return h("div", { class: "lock-panel" },
    h("h3", { text: "학번에 붙은 이름이 달라졌습니다" }),
    h("p", { text: "전입이나 전출로 번호가 밀린 것 같습니다. 기록은 학번에 붙어 있으니, 아래 학번의 지난 출결과 상담이 다른 학생 것일 수 있습니다." }),
    h("div", { class: "missing", text: lines.join(", ") + (hcWarns.length > 8 ? ` 외 ${hcWarns.length - 8}건` : "") }),
    h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "확인", onclick: () => acceptNames() })));
}

// 반 이름이 없는 항목은 1단계에서 담임 반에 적은 것이다.
const itemCls = (x) => x.cls || cfg().homeroom;
const mine = (list) => list.filter(x => itemCls(x) === picked());
function stampCls(D) {
  let n = 0;
  for (const x of D.value.items) if (!x.cls) { x.cls = cfg().homeroom || picked(); n++; }
  if (n) saveEnc(D);
}
const roster = () => rosterOf(picked());
const shownName = (st) => hideNames ? "" : st.name;
const who = (st) => shownName(st) ? `${st.n}번 ${st.name}` : `${st.n}번`;

$("lockBtn").addEventListener("click", () => { lockNow(); });
$("hideBtn").addEventListener("click", () => {
  hideNames = !hideNames;
  try { localStorage.setItem(LS_PREFIX + "hideNames", hideNames ? "1" : "0"); } catch (e) {}
  renderClass();
});

function saveRoster(names, count, cls = picked()) {
  // 번호가 바뀌어도 같은 학생의 기록이 이어지도록 이전 명단과 맞춰 고유 ID를 유지한다.
  const v = docs.roster.value;
  v.classes = v.classes || {};
  const all = (v.classes[cls] && Array.isArray(v.classes[cls].students)) ? v.classes[cls].students : [];
  const prev = all.filter(s => !s.gone), used = new Set(), slots = new Array(count).fill(null);
  const nameAt = (i) => names[i] || "";
  const claim = (i, s) => { slots[i] = s.id; used.add(s.id); };
  for (let i = 0; i < count; i++) {
    const s = prev.find(p => !used.has(p.id) && p.no === i + 1 && (p.name || "") === nameAt(i));
    if (s) claim(i, s);
  }
  for (let i = 0; i < count; i++) {
    if (slots[i] || !nameAt(i)) continue;
    const s = prev.find(p => !used.has(p.id) && (p.name || "") === nameAt(i));
    if (s) claim(i, s);
  }
  for (let i = 0; i < count; i++) {
    if (slots[i]) continue;
    const s = prev.find(p => !used.has(p.id) && p.no === i + 1 && (!(p.name || "") || !nameAt(i)));
    if (s) claim(i, s);
  }
  const next = slots.map((id, i) => ({ id: id || studentNoOf(cls, i + 1), no: i + 1, name: nameAt(i) }));
  const gone = all.filter(s => s.gone || !used.has(s.id)).map(s => ({ ...s, gone: true }));
  v.classes[cls] = { students: [...next, ...gone] };
  saveEnc(docs.roster);
}

/* ---------- 설정: 학생 명단 양식 받기, 올리기, 호클래스에서 가져오기 (선생님 지시 2026-11-14) ----------
   양식은 학년 | 반 | 번호 | 이름. 반을 "3-1" 한 칸으로 두면 엑셀이 날짜(3월 1일)로 바꿔 버려 숫자 칸으로 나눴다.
   올린 파일과 호클래스 명부는 같은 미리보기(rosterPlan)를 거쳐 「적용」해야 저장된다. */
const XLSX_SRC = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
let rosterPlan = null, rosterErr = "";
function loadXlsx() {
  // shortcut: 쓸 때 CDN 에서 받는다. 인터넷 없는 바탕화면 앱에서는 엑셀만 안 된다(CSV 는 된다). 필요하면 vendor 에 사본.
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, no) => {
    const s = h("script", { src: XLSX_SRC });
    s.onload = () => window.XLSX ? ok(window.XLSX) : no(new Error("엑셀 도구를 불러오지 못했습니다."));
    s.onerror = () => { s.remove(); no(new Error("엑셀 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.")); };
    document.head.append(s);
  });
}
/* "3-1", "3학년 1반", "301" 을 반 이름 "3-1" 로 */
function toCls(v) {
  const s = String(v == null ? "" : v).trim();
  const m = /^(\d+)\s*(?:-|학년)\s*(\d+)\s*반?$/.exec(s);
  if (m) return Number(m[1]) + "-" + Number(m[2]);
  return /^\d{3}$/.test(s) ? roomToCls(s) : "";
}
/* 표(줄마다 칸 배열)를 { 반: [{ n, name }] } 로. 머리줄(학년, 반, 번호, 이름, 학번)이 있으면 그 자리를, 없으면 학년 반 번호 이름 차례로 읽는다. */
function parseRosterRows(rows) {
  const clean = (x) => String(x == null ? "" : x).replace(/\s+/g, "");
  let at = rows.findIndex(r => r.some(c => /^(이름|성명)$/.test(clean(c))));
  const head = at >= 0 ? rows[at].map(clean) : [];
  const col = (re) => head.findIndex(c => re.test(c));
  const ci = at >= 0
    ? { g: col(/^학년$/), c: col(/^반$/), n: col(/^번호$/), id: col(/^학번$/), name: col(/^(이름|성명)$/) }
    : { g: 0, c: 1, n: 2, id: -1, name: 3 };
  const byCls = {};
  for (const r of rows.slice(at + 1)) {
    const name = String(r[ci.name] == null ? "" : r[ci.name]).trim().slice(0, 20);
    let cls = "", n = 0;
    if (ci.g >= 0 && ci.c >= 0 && /^\d+$/.test(clean(r[ci.g])) && /^\d+$/.test(clean(r[ci.c]))) cls = Number(clean(r[ci.g])) + "-" + Number(clean(r[ci.c]));
    else if (ci.c >= 0) cls = toCls(r[ci.c]);
    if (ci.n >= 0) n = Number(clean(r[ci.n]));
    const id = ci.id >= 0 ? clean(r[ci.id]) : "";
    if ((!cls || !n) && /^\d{5}$/.test(id)) { cls = roomToCls(id.slice(0, 3)); n = Number(id.slice(3)); }
    if (!name || !cls || !Number.isInteger(n) || n < 1 || n > 60) continue;
    (byCls[cls] = byCls[cls] || []).push({ n, name });
  }
  return byCls;
}
async function readRosterFile(f, dates = false) {
  const buf = await new Promise((ok, no) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result); fr.onerror = () => no(new Error("파일을 읽지 못했습니다."));
    fr.readAsArrayBuffer(f);
  });
  if (/\.csv$/i.test(f.name)) {
    // 한글 윈도 엑셀은 CSV 를 EUC-KR 로 저장한다. UTF-8 로 안 풀리면 그것으로 읽는다.
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { text = new TextDecoder("euc-kr").decode(buf); }
    // shortcut: 따옴표 안 쉼표는 못 읽는다. 명단(숫자와 이름)에는 쉼표가 없다.
    return text.replace(/^﻿/, "").split(/\r?\n/).map(l => l.split(",").map(c => c.replace(/^"|"$/g, "").trim()));
  }
  const X = await loadXlsx();
  const wb = X.read(new Uint8Array(buf), { type: "array", cellDates: dates });
  const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: dates, defval: "" });
  if (!dates) return rows;
  // 날짜 칸은 YYYY-MM-DD 로. 날짜 서식이 없는 엑셀 일련번호(45000 언저리)도 날짜로 본다.
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return rows.map(r => r.map(c => c instanceof Date ? iso(c)
    : typeof c === "number" && c > 30000 && c < 80000 ? iso(new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000 + new Date().getTimezoneOffset() * 60000))
    : String(c)));
}
/* 미리보기: 반마다 몇 명이고 저장할지, 왜 건너뛰는지 */
function makeRosterPlan(kind, classes, byCls, from) {
  const rows = Object.keys(byCls).sort(byClass).map(cls => {
    const list = byCls[cls].slice().sort((a, b) => a.n - b.n);
    const dup = list.find((s, i) => i && list[i - 1].n === s.n);
    const why = !classes.includes(cls) ? (kind === "home" ? "담임 반이 아닙니다" : "수업 반이 아닙니다")
      : hcHas(cls) ? "호클래스 강의실 명단을 씁니다"
      : dup ? dup.n + "번이 두 번 있습니다" : "";
    return { cls, list, why };
  });
  return { kind, from, rows };
}
function applyRosterPlan() {
  const ok = rosterPlan.rows.filter(r => !r.why);
  for (const r of ok) {
    const count = Math.max(...r.list.map(s => s.n)), names = new Array(count).fill("");
    for (const s of r.list) names[s.n - 1] = s.name;
    saveRoster(names, count, r.cls);
  }
  rosterPlan = null; rosterErr = "";
  renderSet(); renderClass(); renderBook();
  toast(ok.map(r => r.cls).join(", ") + " 명단을 저장했습니다");
}
function rosterTemplate(kind, classes) {
  const rows = [["학년", "반", "번호", "이름"]];
  for (const cls of classes) {
    const [g, c] = cls.split("-").map(Number), list = rosterOf(cls);
    if (list.length) for (const s of list) rows.push([g, c, s.n, s.name]);
    else for (let n = 1; n <= 30; n++) rows.push([g, c, n, ""]);
  }
  return rows;
}
/* 설정 수업 탭: 진도와 수업 기록 초기화(모든 과목, 그 학년도 것 전부). 출결, 학생 메모, 수합은 남는다. */
function lessonResetSec() {
  const D = docs.lessons;
  if (!D || !D.ready || keyStateNow() !== "open") return setSec("진도 초기화", [h("p", { class: "set-state", text: "교무수첩을 열면 쓸 수 있습니다." })]);
  const n = D.value.items.length;
  return setSec(["진도 초기화", n ? delBtn("모두 지우기", docBack(D), () => clearLessons(false, true)) : null], [
    h("p", { class: "set-state", id: "lessonCount", text: n
      ? `${state.year.current}학년도 진도표와 수업 기록 ${n}개가 있습니다. 모든 과목 것을 지웁니다. 출결, 학생 메모, 수합은 남습니다.`
      : "진도표와 수업 기록이 없습니다." })]);
}
/* 설정 수업, 담임 탭의 학생 명단 카드 */
function rosterSec(kind) {
  const classes = kind === "home" ? (cfg().homeroom ? [cfg().homeroom] : []) : lessonClasses();
  if (!classes.length) return null;
  const b = rosterBlock(kind, classes);
  return setSec(["학생 명단", ...b.head], b.body);
}
/* 반 하나 손으로 고치기(전에는 교무수첩 장의 「명단 편집」). 한 줄에 한 명, 앞 번호는 떼어 낸다. */
let rsEdit = "";
function rosterEditor(cls) {
  const list = rosterOf(cls), lines = [];
  for (const s of list) lines[s.n - 1] = s.name;
  const cntIn = h("input", { type: "number", id: "rCount", value: String(list.length ? Math.max(...list.map(s => s.n)) : 28), min: "1", max: "60", "aria-label": "학생 수" });
  const ta = h("textarea", { id: "rNames", "aria-label": "학생 이름, 한 줄에 한 명", value: Array.from(lines, x => x || "").join("\n") });
  return h("div", { class: "roster-editor rs-edit" },
    h("div", { class: "set-row" },
      h("label", { class: "rs-cnt" }, "학생 수", cntIn),
      h("span", { class: "set-state", text: "한 줄에 한 명" }),
      h("button", { class: "btn small", type: "button", id: "rSave", text: "저장", onclick: () => {
        const names = ta.value.split(/\r?\n/).map(s => s.replace(/^\s*\d+[.)\s]*/, "").trim());
        while (names.length && !names[names.length - 1]) names.pop();
        const count = Math.max(1, Math.min(60, Math.max(Number(cntIn.value) || 1, names.length)));
        saveRoster(names.slice(0, 60), count, cls);
        rsEdit = ""; renderSet(); renderClass(); renderBook(); toast(classLabel(cls) + " 명단을 저장했습니다");
      } }),
      h("button", { class: "btn small secondary", type: "button", text: "취소", onclick: () => { rsEdit = ""; renderSet(); } })),
    ta);
}
function rosterBlock(kind, classes) {
  const open = keyStateNow() === "open" && docs.roster && docs.roster.ready;
  if (!open) return { head: [h("p", { class: "set-state", text: "교무수첩을 열면 명단을 올릴 수 있습니다. 교무수첩 장에서 비밀번호를 넣어 주세요." })], body: [] };
  const mine = classes.filter(c => !hcHas(c));
  const err = h("p", { class: "form-err", role: "alert", text: rosterErr });
  const fail = (e) => { rosterErr = (e && e.message) || "처리하지 못했습니다."; err.textContent = rosterErr; };
  if (rsEdit && !mine.includes(rsEdit)) rsEdit = "";
  const lines = h("div", { class: "rs-list", id: "rsList" }, ...classes.flatMap(c => {
    const n = rosterOf(c).length;
    const row = h("div", { class: "rs-row", "data-cls": c },
      h("b", { text: classLabel(c) }),
      h("span", { text: hcHas(c) ? `호클래스 강의실 ${n}명` : n ? n + "명" : "비어 있음" }),
      hcHas(c) ? h("span") : h("button", { class: "btn small secondary", type: "button", text: "편집",
        "aria-label": classLabel(c) + " 명단 편집", "aria-pressed": String(rsEdit === c),
        onclick: () => { rsEdit = rsEdit === c ? "" : c; renderSet(); } }));
    return rsEdit === c ? [row, rosterEditor(c)] : [row];
  }));
  const fileIn = h("input", { type: "file", id: "rsFile", accept: ".xlsx,.xls,.csv", hidden: true, onchange: async () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    rosterErr = "";
    try {
      const byCls = parseRosterRows(await readRosterFile(f));
      if (!Object.keys(byCls).length) throw new Error("파일에서 학생을 찾지 못했습니다. 양식의 학년, 반, 번호, 이름 칸을 채워 주세요.");
      rosterPlan = makeRosterPlan(kind, classes, byCls, f.name);
    } catch (e) { rosterPlan = null; fail(e); return; }
    renderSet();
  } });
  const btns = [
    h("button", { class: "btn small secondary", type: "button", id: "rsTpl", text: "양식 받기", disabled: !mine.length, onclick: async () => {
      try {
        const X = await loadXlsx(), ws = X.utils.aoa_to_sheet(rosterTemplate(kind, mine)), wb = X.utils.book_new();
        ws["!cols"] = [{ wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 14 }];
        X.utils.book_append_sheet(wb, ws, "명단");
        X.writeFile(wb, `학생명단_${kind === "home" ? "담임" : "수업"}_${state.year.current}.xlsx`);
      } catch (e) { fail(e); }
    } }),
    h("button", { class: "btn small secondary", type: "button", id: "rsUp", text: "파일 올리기", disabled: !mine.length, onclick: () => { fileIn.value = ""; fileIn.click(); } }),
    h("button", { class: "btn small secondary", type: "button", id: "rsHc", text: "호클래스에서 가져오기", disabled: !mine.length, onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true; rosterErr = "";
      try {
        const reg = await loadRegister(FB, state.year.current), byCls = {};
        for (const c of mine) if (reg[c] && reg[c].length) byCls[c] = reg[c];
        if (!Object.keys(byCls).length) throw new Error(`호클래스 ${state.year.current}학년도 학생 명부에 이 반 학생이 없습니다.`);
        rosterPlan = makeRosterPlan(kind, classes, byCls, "호클래스 학생 명부");
        renderSet();
      } catch (x) { fail(x); b.disabled = false; }
    } }),
    fileIn];
  const plan = rosterPlan && rosterPlan.kind === kind ? rosterPlan : null;
  const okN = plan ? plan.rows.filter(r => !r.why).length : 0;
  // 읽은 것을 미리 보는 동안은 머리줄 끝에 적용, 취소 아이콘
  const preview = plan ? h("div", { class: "rs-plan", id: "rsPlan" },
    h("p", { class: "rs-from", text: plan.from + "에서 읽었습니다. 적용하면 아래 반의 명단을 바꿉니다. 같은 이름은 번호가 바뀌어도 출결과 메모가 이어집니다. 파일에 없는 학생은 명단에서 빠지고 기록은 남습니다." }),
    ...plan.rows.map(r => h("div", { class: "rs-row" + (r.why ? " skip" : ""), "data-cls": r.cls },
      h("b", { text: classLabel(r.cls) }),
      h("span", { text: r.list.length + "명" }),
      h("span", { class: "rs-why", text: r.why || (rosterOf(r.cls).length ? "바꿈" : "새로 넣음") })))) : null;
  return {
    head: [
      ...(mine.length ? btns : []),
      h("p", { class: "set-state", text: mine.length
        ? "양식을 받아 엑셀에서 채운 뒤 올립니다. 호클래스 학생 명부에 있는 반은 바로 가져올 수 있습니다."
        : "모두 호클래스 강의실 반이라 명단을 호클래스에서 그대로 씁니다." }),
      err,
      plan ? h("button", { class: "btn small", type: "button", id: "rsApply", text: "적용", "aria-label": "명단 적용", disabled: !okN, onclick: applyRosterPlan }) : null,
      plan ? h("button", { class: "btn small secondary", type: "button", id: "rsCancel", text: "취소", "aria-label": "명단 올리기 취소", onclick: () => { rosterPlan = null; renderSet(); } }) : null,
    ],
    body: [preview, lines],
  };
}

function setupView() {
  const err = h("p", { class: "form-err", role: "alert" });
  const btn = h("button", { class: "btn small", type: "submit", id: "setupSave", text: "비밀번호 만들기" });
  return [h("form", { class: "lock-panel", id: "setupForm", onsubmit: guardForm(btn, err, async () => {
    const a = $("setupPass").value, b = $("setupPass2").value;
    if (a.length < 8) throw new Error("비밀번호는 8자 이상으로 넣어 주세요.");
    if (a !== b) throw new Error("비밀번호 두 칸이 서로 다릅니다.");
    await setupKey(a);
    renderClass();
  }) },
    h("h3", { text: "학생 정보 보호 비밀번호 만들기" }),
    passField("setupPass", "비밀번호", "new-password"),
    passField("setupPass2", "비밀번호 확인", "new-password"),
    err, h("div", { class: "row" }, btn))];
}
function recoveryView() {
  const code = showRecovery(recoveryToShow);
  const ok = h("input", { type: "checkbox", id: "recoveryOk" });
  const go = h("button", { class: "btn small", type: "button", id: "recoveryDone", text: "다 적었습니다", disabled: true, onclick: () => { recoveryToShow = null; renderClass(); } });
  ok.addEventListener("change", () => { go.disabled = !ok.checked; });
  return [h("div", { class: "lock-panel" },
    h("h3", { text: "복구 키를 적어 두세요" }),
    h("p", { text: "비밀번호를 잊으면 이 키로만 열 수 있습니다. 이 화면을 닫으면 다시 볼 수 없고, 키와 비밀번호를 모두 잃으면 아무도 기록을 복구할 수 없습니다." }),
    h("div", { class: "recovery-code", id: "recoveryCode", text: code }),
    h("div", { class: "row" }, h("button", { class: "btn small secondary", type: "button", text: "복구 키 복사", onclick: () => copyText(code) })),
    h("label", { class: "check-row" }, ok, "복구 키를 학교 밖 안전한 곳에 적어 두었습니다"),
    h("div", { class: "row" }, go))];
}
function unlockView() {
  const err = h("p", { class: "form-err", role: "alert" });
  if (recoverMode) {
    const btn = h("button", { class: "btn small", type: "submit", id: "recoverSave", text: "새 비밀번호로 열기" });
    return [h("form", { class: "lock-panel", id: "recoverForm", onsubmit: guardForm(btn, err, async () => {
      const a = $("recoverNew").value, b = $("recoverNew2").value;
      if (a.length < 8) throw new Error("새 비밀번호는 8자 이상으로 넣어 주세요.");
      if (a !== b) throw new Error("새 비밀번호 두 칸이 서로 다릅니다.");
      const raw = await rewrap($("recoverKey").value, a);
      await useRaw(raw);
      recoverMode = false;
      renderClass();
    }) },
      h("h3", { text: "복구 키로 열기" }),
      h("label", { class: "field" }, "복구 키", h("input", { type: "text", id: "recoverKey", autocomplete: "off", spellcheck: "false" })),
      passField("recoverNew", "새 비밀번호", "new-password"),
      passField("recoverNew2", "새 비밀번호 확인", "new-password"),
      err, h("div", { class: "row" }, btn, h("button", { class: "btn small secondary", type: "button", text: "취소", onclick: () => { recoverMode = false; renderClass(); } })))];
  }
  const btn = h("button", { class: "btn small", type: "submit", id: "unlockBtn", text: "열기" });
  return [h("form", { class: "lock-panel", id: "unlockForm", onsubmit: guardForm(btn, err, async () => {
    await unlock($("unlockPass").value);
    renderClass();
  }) },
    h("h3", { text: "교무수첩이 잠겨 있습니다" }),
    h("p", { text: "학생 명단과 기록을 보려면 비밀번호를 넣어 주세요." }),
    passField("unlockPass", "비밀번호", "current-password"),
    err,
    h("div", { class: "row" }, btn, h("button", { class: "text-btn", type: "button", id: "recoverLink", text: "비밀번호를 잊었습니다", onclick: () => { recoverMode = true; renderClass(); } })))];
}
const openSetBtn = (tab = "lesson") => h("button", { class: "btn small", type: "button", text: "설정 열기", onclick: () => { setTab = tab; setOpen = true; renderSet(); } });

function softClass() {
  if (!booted) return;
  const a = document.activeElement;
  const typing = a && $("classBody").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  const ks = keyStateNow();
  if (!typing && !(ks === lastKs && (ks === "none" || ks === "locked" || ks === "recovery"))) renderNb();
}
let lastKs = "";
function renderPick(list, pick, withAll) {
  // 진도 탭은 맨 앞에 「전체」(차시 x 반 표)
  const all = withAll && progAll;
  $("classPick").replaceChildren(...[
    withAll ? h("button", { class: "cpick", type: "button", "aria-pressed": String(all), onclick: () => { progAll = true; renderNb(); } }, "전체") : null,
    ...list.map(c => h("button", {
      class: "cpick", type: "button", "aria-pressed": String(c === pick && !all),
      onclick: () => { progAll = false; progPick = ""; if (pickedCls === c) renderNb(); else goClass(c); },
    }, c))].filter(Boolean));
}
/* 할 일은 위젯 하나를 대시보드와 업무 장이 같이 쓴다(선생님 지시 2026-11-13).
   업무 장의 할 일 탭을 열면 카드를 옮겨 오고, 다른 데를 보면 대시보드 칸으로 되돌린다. 두 벌을 만들지 않는다. */
const TODO_CARD = document.querySelector(".wg-todo");
function homeTodos() {
  const wg = deck.querySelector('.wg[data-w="todos"]');
  if (wg && TODO_CARD && TODO_CARD.parentElement !== wg) wg.append(TODO_CARD);
}
/* 교무수첩 장 그리기. 잠겨 있으면 장 가운데 잠금 카드 하나만 뜬다
   (전에는 우리 반, 교무수첩 위젯마다 좁은 칸에 따로 떴다. 선생님 지적 2026-11-13). */
function renderNb() {
  if (!booted) return;
  renderWeekPlan();          // 계획이 바뀌거나 잠기고 열릴 때 대시보드 주간 계획 위젯도 같이
  const nb = nbOf(curPage);
  $("nb").hidden = !nb;
  if (!nb) { homeTodos(); return; }
  const ks = keyStateNow(), open = ks === "open";
  lastKs = ks;
  const tab = nbTab[nb.key], usesCls = nb.key !== "work";
  if (open && nb.key === "lesson" && docs.lessons && docs.lessons.ready) {
    if (!subjAuto) { subjAuto = true; autoPickLesson(true); }          // 처음 열 때 지금(또는 다음) 수업 과목
    if (tab === "att" && !attAuto) autoPickLesson();
  }
  const allView = nb.key === "lesson" && tab === "prog" && progAll && subjClasses().length > 1;
  const pick = usesCls ? picked() : "";
  $("nbTitle").textContent = nb.name;
  // 수업 장 머리줄은 제목, 과목, 탭. 반은 둘째 줄 반 고르기가 보여 준다(선생님 지시 2026-11-14)
  $("className").textContent = open && usesCls ? (nb.key === "lesson" && subjClasses().length > 1 ? "" : pick ? classLabel(pick) : nb.key === "home" ? "담임 반 없음" : "수업 반 없음") : "";
  const subjs = open && nb.key === "lesson" ? mySubjects() : [];
  $("nbSubj").hidden = subjs.length < 2;
  $("nbSubj").replaceChildren(...subjs.map(s => h("button", { type: "button", "data-subj": s.name, "aria-pressed": String(s.name === curSubj()), text: s.name,
    onclick: () => { lessonSubj = s.name; progPick = ""; attEdit = ""; renderNb(); } })));
  const list = nb.key === "lesson" ? subjClasses() : [];
  $("classPick").hidden = !(open && list.length > 1);
  if (open && list.length > 1) renderPick(list, pick, nb.key === "lesson" && tab === "prog");
  const seg = $("nbSeg");
  seg.hidden = !open;
  seg.parentElement.hidden = !open;   // 잠겨 있으면 탭 줄(과 그 밑줄)째 숨긴다
  seg.replaceChildren(...nb.tabs.map(([k, name]) => h("button", {
    type: "button", "data-tab": k, "aria-pressed": String(k === tab), text: name,
    onclick: () => { nbTab[nb.key] = k; if (k === "att") attAuto = false; attEdit = ""; renderNb(); },
  })));
  $("hideBtn").hidden = !open || !usesCls;
  $("lockBtn").hidden = !open;
  $("hideBtn").textContent = hideNames ? "이름 보이기" : "이름 가리기";
  const body = $("classBody");
  if (!(open && nb.key === "work" && tab === "todo")) homeTodos();
  const note = (text) => [h("p", { class: "empty", text })];
  const lock = (kids) => { $("nb").classList.add("locked"); body.replaceChildren(h("div", { class: "nb-lock" }, ...kids)); };
  $("nb").classList.remove("locked");
  if (ks === "loading") { body.replaceChildren(...note("저장소를 확인하는 중입니다.")); return; }
  if (ks === "unsupported") { body.replaceChildren(...note("이 화면에서는 암호화를 쓸 수 없습니다. 학생 정보를 저장하지 않도록 교무수첩을 닫아 두었습니다. 다른 브라우저에서 열어 주세요.")); return; }
  if (ks === "offline") { body.replaceChildren(...note("저장소에 연결되지 않아 보호 비밀번호를 만들 수 없습니다. " + (syncNote || "인터넷 연결을 확인해 주세요."))); return; }
  if (ks === "none") { lock(setupView()); return; }
  if (ks === "recovery") { lock(recoveryView()); return; }
  if (ks === "locked") { if (tryKeep()) { body.replaceChildren(...note("여는 중입니다.")); return; } lock(unlockView()); return; }
  const rollover = state.year.configured && academicYear() > state.year.current
    ? h("p", { class: "hint", text: `${academicYear()}학년도가 시작됐습니다. 설정의 수업, 담임 탭에서 반을 새로 넣어 주세요.` }) : null;
  const banner = warnBanner();
  const hcNote = hcErr ? h("p", { class: "hint", text: hcErr })
    : (hcBusy && !hc) ? h("p", { class: "tip", text: "호클래스 명단을 읽는 중입니다." }) : null;
  const head = [rollover, banner, hcNote].filter(Boolean);
  const wrap = (kids) => body.replaceChildren(...[...head, ...kids].filter(Boolean));   // 빈 자리(null)가 "null" 글자로 찍히지 않게
  const cols = (kids) => wrap([h("div", { class: "book-cols" }, ...kids.filter(Boolean))]);
  if (nb.key === "work") {
    if (tab === "todo") { wrap([]); if (TODO_CARD) body.append(TODO_CARD); return; }
    if (!bookReady()) { wrap(note("기록을 여는 중입니다.")); return; }
    wrap(planWorkView()); return;
  }
  if (!state.year.configured) { wrap([h("div", { class: "lock-panel" }, h("h3", { text: "담임 반과 수업 반을 넣어 주세요" }), h("div", { class: "row" }, openSetBtn()))]); return; }
  ensureAtt(attDate(), pick);
  if (!pick) {
    wrap([h("div", { class: "lock-panel" }, h("h3", { text: nb.key === "home" ? "담임 반이 없습니다" : "수업 반이 없습니다" }),
      h("p", { text: "설정의 " + (nb.key === "home" ? "담임 탭에서 담임 반을" : "수업 탭에서 수업 반을") + " 고르면 쓸 수 있습니다." }), h("div", { class: "row" }, openSetBtn(nb.key === "home" ? "home" : "lesson")))]);
    return;
  }
  if (encDocs().some(d => d.broken)) { wrap(note("일부 기록을 풀지 못했습니다. 페이지를 새로고침한 뒤 다시 열어 주세요. 기록은 그대로 있습니다.")); return; }
  if (encDocs().some(d => !d.ready)) { wrap(note("기록을 여는 중입니다.")); return; }
  if (tab === "prog") { wrap(allView ? progressAll() : [progBar(), progressClass(pick)]); return; }
  if (!roster().length && tab !== "lesson") {
    wrap([h("div", { class: "lock-panel" }, h("h3", { text: "학생 명단이 비어 있습니다" }),
      h("p", { text: hcHas(pick) ? "호클래스 이 강의실에 학생이 아직 없습니다. 호클래스 어드민의 학생 관리에서 넣어 주세요."
        : "설정에서 학생 명단을 넣으면 출결과 수합을 쓸 수 있습니다." }),
      hcHas(pick) ? null : h("div", { class: "row" }, openSetBtn(nb.key === "home" ? "home" : "lesson")))]);
    return;
  }
  // 담임 출결은 반 이름 제목 없이 달 줄부터, 표와 아래 칸이 한 화면에 든다(선생님 지시 2026-11-16)
  if (tab === "att") wrap(nb.key === "lesson" ? lessonAttView() : [h("div", { class: "lt-main att-one" }, ...attMonthView())]);
  else if (tab === "col") wrap(collectView());
  else if (tab === "ann") wrap(noticeView());
  else if (tab === "student" && nb.key === "lesson") wrap([lessonStudentPage()]);
  else if (tab === "student") wrap([studentPage()]);
  else cols(consultPage());
}
/* 여러 곳에서 부르던 옛 이름. 둘 다 교무수첩 장을 다시 그린다. */
function renderClass() { renderNb(); }
function renderBook() { renderNb(); }

/* 출결은 날짜를 골라 지난날도 고친다. 한 달 보기는 학생 줄, 날짜 칸으로 쌓아 본다(선생님 지적 2026-11-13:
   "결석은 매일 기록하는 거 아니면 의미 없다"). 기본은 전원 출석이고 결석, 지각, 조퇴만 누른다. */
let attPick = "", attYm = "";      // attYm 이 비면 한 달 표는 위에서 고른 날의 달
const attDate = () => attPick || todayKey();
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mdw = (iso) => { const d = parseDate(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
/* 학사 일정에서 쉬는 날(휴업일, 방학, 공휴일). 한 달 표에서 그 날 칸을 흐리게 한다. */
const OFF_RE = /휴업|방학|휴일|공휴|대체|추석|설날|신정|삼일절|어린이날|부처님|현충일|광복절|개천절|한글날|성탄/;
const offName = (iso) => { const e = (state.cal || []).find(x => x.d === iso && OFF_RE.test(x.name)); return e ? e.name : ""; };
/* 출결 표에만: 표에 남은 주말 칸(오늘이 토, 일인 때)도 쉬는 날로 본다(빗금, 수업 일수에서 뺀다) */
const attOff = (iso) => { const w = parseDate(iso).getDay(); return w === 0 ? "일요일" : w === 6 ? "토요일" : offName(iso); };
const navBtn = (label, svg, fn, off) => h("button", { class: "pg-arrow", type: "button", "aria-label": label, html: svg, disabled: off ? true : null, onclick: fn });
/* 출결 한 건 고르기(선생님 지시 2026-11-13): 종류 넷 x 사유 셋 = 12가지, 교시는 조회, 1~7교시, 종례.
   지각은 몇 교시까지, 조퇴는 몇 교시부터, 결과는 빠진 교시 여럿. 결석은 교시를 안 고른다. 메모 한 줄.
   학생 칸을 누르면 그 학생의 고르개가 열린다. 한 학생이 하루에 여러 건을 가질 수 있다. */
let attEdit = "", attDraft = null;          // 고르개를 연 학생("날짜|반|학생"), 고르는 중인 한 건
const attEditKey = (sid, day = attDate(), cls = picked()) => day + "|" + cls + "|" + sid;
const blankDraft = () => ({ k: "결석", r: "", p: [], memo: "", i: -1 });
// 이미 적은 한 건(i 번째)을 고르개에 올린다. 「저장」을 누르면 새 건을 더하지 않고 그 건을 바꾼다.
const draftOf = (e, i) => ({ k: e.k, r: e.r, p: e.p.slice(), memo: e.memo || "", i });
function openAttEdit(sid, day = attDate(), cls = picked(), entry = null, i = -1) {
  attEdit = attEdit === attEditKey(sid, day, cls) && !entry ? "" : attEditKey(sid, day, cls);
  attDraft = entry ? draftOf(entry, i) : blankDraft();
  renderNb();
}
function attEditor(st, A, day = attDate(), cls = picked()) {
  if (!attDraft) attDraft = blankDraft();
  const d = attDraft, marks = marksOf(A);
  const list = entriesOf(A.value, st.id);
  if (d.i >= list.length) d.i = -1;                  // 다른 기기에서 그 건이 지워졌다
  const fixingOne = d.i >= 0;
  const multi = d.k === "결과", noP = d.k === "결석";
  const pick = (cls, items, cur, on) => h("div", { class: "seg att-pick " + cls }, ...items.map(([v, t]) => h("button", {
    type: "button", "data-v": String(v), "aria-pressed": String(cur(v)), text: t, onclick: () => { on(v); renderNb(); } })));
  const err = h("p", { class: "form-err", role: "alert" });
  const memoIn = h("input", { type: "text", id: "attMemo", maxlength: "60", autocomplete: "off", value: d.memo, "aria-label": "메모",
    oninput: (e) => { d.memo = e.target.value; } });
  const save = () => {
    if (!d.r) { err.textContent = "사유를 골라 주세요."; return; }
    if (!noP && !d.p.length) { err.textContent = d.k === "지각" ? "몇 교시까지 지각인지 골라 주세요." : d.k === "조퇴" ? "몇 교시부터 조퇴인지 골라 주세요." : "결과 교시를 골라 주세요."; return; }
    const cur = entriesOf(A.value, st.id);
    const one = { k: d.k, r: d.r, p: noP ? [] : d.p.slice().sort((a, b) => a - b), memo: d.memo.trim().slice(0, 60) };
    if (d.i >= 0 && d.i < cur.length) cur[d.i] = one; else cur.push(one);
    marks[st.id] = cur;
    attEdit = ""; attDraft = null;
    saveEnc(A); renderNb();
  };
  const remove = (i) => {
    const cur = entriesOf(A.value, st.id).filter((_, j) => j !== i);
    if (cur.length) marks[st.id] = cur; else delete marks[st.id];
    if (d.i === i) attDraft = blankDraft(); else if (d.i > i) d.i -= 1;
    saveEnc(A); renderNb();
  };
  const pickOne = (e, i) => { attDraft = d.i === i ? blankDraft() : draftOf(e, i); renderNb(); };
  return h("section", { class: "att-ed", id: "attEd" },
    hd("h4", (nbKey() === "lesson" ? cls + " " : "") + who(st), [
      h("span", { class: "hd-note", text: mdw(day) }), err,
      h("button", { class: "btn small", type: "button", id: "attAdd", text: fixingOne ? "저장" : "추가", "aria-label": fixingOne ? "출결 고치기" : "출결 추가", onclick: save }),
      h("button", { class: "text-btn", type: "button", text: "닫기", onclick: () => { attEdit = ""; attDraft = null; renderNb(); } })], "", "att-ed-head"),
    list.length ? h("ul", { class: "att-ed-list" }, ...list.map((e, i) => h("li", { class: "att-ed-item click " + e.k + (d.i === i ? " fixing" : ""),
      "aria-pressed": String(d.i === i), onclick: () => pickOne(e, i) },
      h("span", { text: entryText(e) }),
      h("button", { class: "del", type: "button", "aria-label": "이 기록 지우기", text: "×", onclick: (ev) => { ev.stopPropagation(); remove(i); } })))) : null,
    h("div", { class: "att-ed-row" }, h("span", { class: "lbl", text: "종류" }),
      pick("att-k", ATT_KINDS.map(k => [k, k]), v => d.k === v, v => { d.k = v; d.p = []; })),
    h("div", { class: "att-ed-row" }, h("span", { class: "lbl", text: "사유" }),
      pick("att-r", ATT_REASONS, v => d.r === v, v => { d.r = v; })),
    noP ? null : h("div", { class: "att-ed-row" },
      h("span", { class: "lbl", text: d.k === "지각" ? "언제까지" : d.k === "조퇴" ? "언제부터" : "빠진 교시" }),
      pick("att-p", PERIOD_NAMES.map((t, i) => [i, t.replace("교시", "")]), v => d.p.includes(v),
        v => { d.p = multi ? (d.p.includes(v) ? d.p.filter(x => x !== v) : [...d.p, v]) : [v]; })),
    h("div", { class: "att-ed-row" }, h("span", { class: "lbl", text: "메모" }), memoIn));
}
/* 표 아래 칸(선생님 지시 2026-11-16 "하루짜리랑 1달짜리를 아예 하나로 합쳐, 카드 명단은 없애고 칸 클릭하면 아래에서 체크"):
   학생 카드 명단과 오른쪽 칸, 날짜 앞뒤 단추를 걷었다. 한 달 표의 칸을 누르면 그날 그 학생을 여기서 적는다.
   아무 칸도 안 골랐으면 고른 날(처음에는 오늘) 기록 목록. 그날 요약과 요약 복사, 그날 기록 비우기도 여기. */
function attBottom() {
  const A = docs.att, list = roster(), when = attDate();
  attMarks();                                          // marks 자리를 만든다
  const by = (k) => list.filter(st => entriesOf(A.value, st.id).some(e => e.k === k));
  const absent = by("결석"), late = by("지각"), early = by("조퇴"), out = by("결과");
  const present = list.length - absent.length;
  const editing = list.find(st => attEdit === attEditKey(st.id));
  const report = () => {
    const parts = [];
    for (const k of ATT_KINDS) {
      const ss = by(k);
      if (ss.length) parts.push(`${k} ${ss.length}명(${ss.map(st => who(st) + " " + entriesOf(A.value, st.id).filter(e => e.k === k).map(e => entryText({ ...e, memo: "" }).replace(k, "")).join(", ")).join(", ")})`);
    }
    return `${mdw(when).replace(/ \(.\)$/, "")} ${classLabel(picked())} 출결: 재적 ${list.length}명, 출석 ${present}명` + (parts.length ? ", " + parts.join(", ") : ", 전원 출석");
  };
  const sum = (k, arr, cls) => h("span", { class: "k" + (arr.length ? " " + cls : "") }, k + " ", h("b", { text: String(arr.length) }));
  const isToday = when === todayKey(), off = attOff(when);
  return h("section", { class: "att-below", id: "attBelow" },
    hd("h4", h("span", { class: "att-date hd-t" + (isToday ? " today" : ""), id: "attDate", text: mdw(when) + (isToday ? " 오늘" : "") }), [
      isToday ? null : h("button", { class: "text-btn", type: "button", id: "attToday", text: "오늘로",
        onclick: () => { attPick = ""; attYm = ""; attEdit = ""; attDraft = null; renderNb(); } }),
      h("button", { class: "text-btn", type: "button", id: "attCopy", text: "요약 복사", onclick: () => copyText(report()) }),
      h("div", { class: "att-sum", id: "attSum" },
        h("span", { class: "k" }, "출석 ", h("b", { text: `${present}/${list.length}` })),
        sum("결석", absent, "absent"), sum("지각", late, "late"), sum("조퇴", early, "early"), sum("결과", out, "outk"),
        off ? h("span", { class: "att-off", text: off }) : null),
      Object.keys(A.value.marks).length ? delBtn(isToday ? "오늘 기록 비우기" : "이 날 기록 비우기", docBack(A),
        () => { A.value.marks = {}; attEdit = ""; saveEnc(A); renderClass(); }) : null]),
    editing ? attEditor(editing, A) : attDayList(list, A));
}
/* 아래 칸(아무도 안 골랐을 때): 그날 기록 목록. 줄을 누르면 그 학생 고르개 */
function attDayList(list, A) {
  const rows = list.flatMap(st => entriesOf(A.value, st.id).map((e, i) => ({ st, e, i })));
  return h("div", { class: "att-day-list" },
    h("h4", { class: "att-side-hd", text: rows.length ? `기록 ${rows.length}건` : "전원 출석" }),
    rows.length ? h("ul", { class: "att-ed-list" }, ...rows.map(({ st, e, i }) => h("li", { class: "att-ed-item click " + e.k, onclick: () => openAttEdit(st.id, attDate(), picked(), e, i) },
      h("b", { class: "who", text: who(st) }), h("span", { text: entryText(e) })))) : null);
}
const monday = (iso) => parseDate(iso).getDay() === 1;
/* 범례: 종류는 색, 사유는 모양. 칸 글자는 종류 두 글자 그대로다(선생님 지시 2026-11-16) */
function attLegend() {
  const chip = (cls, t, label) => h("span", { class: "att-lg" }, h("span", { class: "ab " + cls, text: t }), label);
  return h("div", { class: "att-legend" },
    ...ATT_KINDS.map(k => chip("m " + k + " r-미인정", k, "")),   // 칸 글자가 곧 이름이라 따로 적지 않는다
    h("span", { class: "att-lg-sep" }),
    chip("m 결석 r-미인정", "결석", "미인정"), chip("m 결석 r-질병", "결석", "질병"), chip("m 결석 r-인정", "결석", "출석인정"));
}
/* 한 달 출결표: 그달 평일마다 그 반 출결 문서를 받아(loadMonth) 학생 줄, 날짜 칸으로 놓는다.
   칸에는 종류 두 글자(여러 건이면 띄어 쓴다), 마우스를 올리면 사유와 교시. 칸을 누르면 그날로 가서 고친다. */
function attMonthView() {
  const cls = picked(), list = roster(), ym = attYm || ymOf(attDate()), today = todayKey(), pickD = attDate();
  if (attLoaded !== ym + "|" + cls && !attBusy) loadMonth(ym, cls);
  const days = monthDays(ym);
  const classDays = days.filter(d => !attOff(d)).length;   // 그달 수업 일수(평일에서 쉬는 날을 뺀 것)
  const esOf = (d, sid) => d > today ? [] : entriesOf(attValueOf(d, cls), sid);
  const [y, m] = ym.split("-").map(Number);
  const goYm = (n) => { const d = new Date(y, m - 1 + n, 1); attYm = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; renderNb(); };
  const rows = list.map(st => {
    const cnt = { 결석: [], 지각: [], 조퇴: [], 결과: [] };
    const cells = days.map(d => {
      const es = esOf(d, st.id);
      for (const e of es) cnt[e.k].push({ d, e });
      const off = attOff(d);
      const k = es.length ? es[0].k : "";
      // 사유는 칸 모양으로: 미인정 진하게 채움, 질병 옅게 채움, 인정 테두리만(범례는 표 위)
      return h("td", { "data-d": d, class: [k ? "m " + k : "", k && es[0].r ? "r-" + es[0].r : "", es.some(e => !e.r) ? "undecided" : "", off ? "off" : "", d === today ? "today" : "", d === pickD && d !== today ? "pick" : "", monday(d) ? "wk" : ""].filter(Boolean).join(" "),
        title: `${mdw(d)} ${es.length ? es.map(e => entryText(e)).join(", ") : off || (d > today ? "" : "출석")}`,
        text: es.map(e => e.k).join(" "),
        onclick: d > today ? null : () => { attPick = d === today ? "" : d; attYm = ym; attDraft = null;
          attEdit = attEditKey(st.id, d, cls); renderNb(); const s = document.getElementById("attBelow"); if (s && s.scrollIntoView) s.scrollIntoView({ block: "nearest" }); } });
    });
    const nm = shownName(st);
    return { st, cnt, tr: h("tr", null, h("th", { class: "who-n", text: String(st.n) }), h("th", { class: "who-nm", text: nm || "" }), ...cells,
      h("td", { class: "fill" }), h("td", { class: "tot first days-tot", text: String(classDays) }),
      ...ATT_KINDS.map(k => h("td", { class: "tot" + (cnt[k].length ? " " + k : ""), text: cnt[k].length ? String(cnt[k].length) : "" }))) };
  });
  const copy = () => {
    const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8)}`;
    const lines = [];
    for (const r of rows) for (const k of ATT_KINDS) for (const { d, e } of r.cnt[k])
      lines.push({ d, line: `${who(r.st)} ${md(d)} ${entryText(e)}` });
    lines.sort((a, b) => a.d.localeCompare(b.d));
    return `${y}년 ${m}월 ${classLabel(cls)} 출결\n` + (lines.length ? lines.map(x => x.line).join("\n") : "결석, 지각, 조퇴, 결과 없음");
  };
  const totals = ATT_KINDS.map(k => rows.reduce((a, r) => a + r.cnt[k].length, 0));
  const undecided = rows.some(r => ATT_KINDS.some(k => r.cnt[k].some(x => !x.e.r)));
  // 달 고르기, 통계, 범례, 복사를 한 줄에(선생님 지시 2026-11-16)
  const legend = attLegend();
  legend.classList.add("hd-note");
  return [
    hd("h4", h("div", { class: "att-nav" },
        navBtn("앞 달", CHEV_L, () => goYm(-1)),
        h("span", { class: "att-date", id: "attYm", text: `${y}년 ${m}월` }),
        navBtn("다음 달", CHEV_R, () => goYm(1), ym >= ymOf(today))), [
      attBusy ? null : h("button", { class: "text-btn", type: "button", id: "attMonthCopy", text: "한 달 요약 복사", onclick: () => copyText(copy()) }),
      attBusy ? h("span", { class: "tip", text: "기록을 모으는 중입니다" }) : null,
      h("div", { class: "att-sum" }, ...ATT_KINDS.map((k, i) => h("span", { class: "k" + (totals[i] ? " " + ["absent", "late", "early", "outk"][i] : "") }, k + " ", h("b", { text: totals[i] + "건" })))),
      legend,
      undecided ? h("p", { class: "hint", text: "사유가 없는 옛 기록이 있습니다(점선 칸). 그날로 가서 지우고 사유를 골라 다시 적어 주세요." }) : null], "", "att-bar"),
    h("div", { class: "att-month-scroll" }, h("table", { class: "att-month", id: "attMonth" },
      h("thead", null, h("tr", null, h("th", { class: "who-n", text: "번호" }), h("th", { class: "who-nm", text: "이름" }),
        ...days.map(d => { const off = attOff(d), wd = parseDate(d).getDay();
          return h("th", { class: ["day", off ? "off" : "", d === today ? "today" : "", d === pickD && d !== today ? "pick" : "", monday(d) ? "wk" : ""].filter(Boolean).join(" "), title: off || mdw(d) },
            h("span", { class: "dn", text: String(+d.slice(8)) }), h("span", { class: "dw", text: "(" + WD[wd] + ")" })); }),
        h("th", { class: "fill" }), h("th", { class: "tot first days-k", text: "수업 일수" }),
        ...ATT_KINDS.map(k => h("th", { class: "tot", text: k })))),
      h("tbody", null, ...rows.map(r => r.tr)))),
    attBottom(),
  ];
}

let colAdding = false;         // 수합 탭에서 새 수합 이름 칸을 연 때
/* 수합은 하나마다 섹션 하나, 섹션은 2단으로 늘어선다. 섹션 안 학생은 4열이고 칸마다 두 줄(번호와 이름, 제출 여부)이다. */
function collectView() {
  const D = docs.collects;
  stampCls(D);
  const list = roster(), items = D.value.items, ours = mine(items);
  const myLessons = lessonsOf(picked());
  const colCl = h("select", { id: "colCl", "aria-label": "호클래스 차시" }, h("option", { value: "", text: "손으로 걷기" }),
    ...myLessons.map(x => h("option", { value: x.clId, text: `${x.order}차시 ${x.title || ""}`.trim() })));
  const colPart = h("select", { id: "colPart", "aria-label": "걷을 것" },
    h("option", { value: "mission", text: "미션 활동" }),
    h("option", { value: "question", text: "오늘의 질문" }),
    h("option", { value: "formative", text: "형성평가" }));
  const adding = colAdding || !ours.length;
  const addSec = adding ? h("section", { class: "panel col-sec" },
    hd("h3", "새 수합", [
      h("button", { class: "btn small", type: "submit", form: "colForm", text: "추가", "aria-label": "수합 추가" }),
      ours.length ? h("button", { class: "text-btn", type: "button", text: "취소", onclick: () => { colAdding = false; renderClass(); } }) : null]),
    h("form", { class: "col-add", id: "colForm", onsubmit: (e) => {
      e.preventDefault();
      const t = $("colName").value.trim(); if (!t) return;
      items.unshift({ id: uid(), title: t.slice(0, 40), got: [], cls: picked(), clId: colCl.value || "", part: colPart.value || "" });
      colAdding = false; saveEnc(D); renderClass();
    } },
      h("label", { class: "field grow" }, "새 수합 이름", h("input", { type: "text", id: "colName", maxlength: "40", autocomplete: "off" })),
      myLessons.length ? colCl : null, myLessons.length ? colPart : null)) : null;
  const section = (c) => {
    const linked = !!c.clId;
    if (linked) wantSubs(c.clId);
    const subs = linked ? (subCache.get(c.clId) || {}) : null;
    const gotSet = linked
      ? new Set(list.filter(st => subs[st.id] && subs[st.id][c.part || "mission"]).map(st => st.id))
      : new Set(c.got);
    const missing = list.filter(st => !gotSet.has(st.id));
    const missText = missing.length ? `${c.title} 미제출 ${missing.length}명: ${missing.map(who).join(", ")}` : `${c.title} 전원 제출`;
    const cells = list.map(st => {
      const got = gotSet.has(st.id), nm = shownName(st);
      return h("button", { class: "col-stu" + (got ? " got" : ""), type: "button", "aria-pressed": String(got), "aria-label": `${who(st)} ${got ? "제출함" : "미제출"}`,
        onclick: () => {
          if (linked) { toast("이 항목은 호클래스 제출을 그대로 보여 줍니다"); return; }
          c.got = got ? c.got.filter(id => id !== st.id) : [...c.got, st.id];
          saveEnc(D); renderClass();
        } },
        h("span", { class: "ln" }, h("span", { class: "n", text: String(st.n) }), nm ? h("span", { class: "nm", text: nm }) : null),
        h("span", { class: "st", text: got ? "제출" : "미제출" }));
    });
    return h("section", { class: "panel col-sec", "data-col": c.id },
      hd("h3", c.title, [
        linked ? h("span", { class: "tag cls", text: "호클래스" }) : null,
        missing.length ? h("button", { class: "text-btn", type: "button", text: "미제출 명단 복사", onclick: () => copyText(missText) }) : null,
        h("div", { class: "att-sum" }, missing.length
          ? h("span", { class: "k absent" }, "미제출 ", h("b", { text: missing.length + "명" }))
          : h("span", { class: "k done" }, h("b", { text: "전원 제출" }))),
        delBtn("이 수합 삭제", docBack(D), () => { D.value.items = items.filter(x => x.id !== c.id); saveEnc(D); renderClass(); })]),
      h("div", { class: "col-list" }, ...cells));
  };
  return [
    hd("h4", "수합", [adding ? null : iconBtn("새 수합", "plus", () => { colAdding = true; renderClass(); }, { id: "colNew" })]),
    h("div", { class: "col-grid" }, addSec, ...ours.map(section)),
  ];
}

function noticeView() {
  const D = docs.notices, items = D.value.items;
  stampCls(D);
  const form = h("form", { class: "col-add", id: "noticeForm", onsubmit: (e) => {
    e.preventDefault();
    const t = $("noticeIn").value.trim(); if (!t) return;
    items.push({ id: uid(), text: t.slice(0, 200), done: false, cls: picked() }); saveEnc(D); renderClass(); $("noticeIn") && $("noticeIn").focus();
  } }, h("input", { class: "grow", type: "text", id: "noticeIn", maxlength: "200", autocomplete: "off", "aria-label": "새 전달사항" }));
  const ours = mine(items);
  const list = ours.length ? ours.map(n => {
    const chk = h("button", { class: "check", type: "button", "aria-label": n.done ? "전달 취소" : "전달함으로 표시", "aria-pressed": String(!!n.done), onclick: () => { n.done = !n.done; saveEnc(D); renderClass(); } });
    chk.innerHTML = CHECK;
    return h("li", { class: "todo" + (n.done ? " done" : "") }, chk, h("span", { class: "todo-text", text: n.text }),
      h("button", { class: "del", type: "button", "aria-label": "삭제", text: "×", onclick: () => { D.value.items = items.filter(x => x.id !== n.id); saveEnc(D); renderClass(); } }));
  }) : [h("li", { class: "empty", text: "전달사항이 없습니다." })];
  const left = ours.filter(n => !n.done), doneCount = ours.length - left.length;
  // 머리줄: 전달사항 | 복사 | 남은 수 | 추가, 전달한 것 지우기 아이콘. 그 아래 넣는 칸과 목록
  return [
    hd("h4", "전달사항", [
      left.length ? h("button", { class: "text-btn", type: "button", text: "전달사항 복사", onclick: () => copyText(left.map((n, i) => `${i + 1}. ${n.text}`).join("\n")) }) : null,
      ours.length ? h("div", { class: "att-sum" }, h("span", { class: "k" }, "남은 것 ", h("b", { text: left.length + "개" }))) : null,
      h("button", { class: "btn small", type: "submit", form: "noticeForm", text: "추가", "aria-label": "전달사항 추가" }),
      doneCount ? iconBtn(`전달한 ${doneCount}개 지우기`, "trash-2", () => { D.value.items = items.filter(n => !(n.done && itemCls(n) === picked())); saveEnc(D); renderClass(); }) : null]),
    form,
    h("ul", { class: "todo-list notice-list" }, ...list),
  ];
}

/* ---------- 학사 일정 가져오기 ---------- */

// 2026-12-24 / 2026.12.24 / 12.24 / 12/24 / 12월 24일 / 12.24.(수) 를 모두 받는다.
function parseSchedule(text, baseYear) {
  const out = [], seen = new Set();
  const DATE = /(?:(\d{4})\s*[-./년]\s*)?(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/\t/g, " ").trim();
    if (!line) continue;
    const m = DATE.exec(line);
    if (!m) continue;
    const mo = Number(m[2]), da = Number(m[3]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
    // 학년도는 3월에 시작한다. 연도가 없으면 1~2월만 다음 해로 본다.
    const y = m[1] ? Number(m[1]) : (mo >= 3 ? baseYear : baseYear + 1);
    let rest = line.slice(m.index + m[0].length);
    rest = rest.replace(/^\s*[~\-–—]\s*(?:\d{4}\s*[-./년]\s*)?\d{1,2}\s*[-./월]\s*\d{1,2}\s*일?/, ""); // 기간이면 끝 날짜를 뗀다
    rest = rest.replace(/^[\s.,]*(\([^)]*\))?[\s.,]*/, "");
    let name = rest.trim() || line.slice(0, m.index).trim();
    name = name.replace(/[\s.,]+$/, "");
    if (!name) continue;
    const date = `${y}-${pad(mo)}-${pad(da)}`;
    const key = date + " " + name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, title: name.slice(0, 60) });
  }
  return out;
}

function allDdays() {
  const mine = state.ddays.map(x => ({ ...x, src: "" }));
  const have = new Set(mine.map(x => x.date + " " + x.title));
  const cal = (state.cal || [])
    .filter(x => x && x.d && x.name && !have.has(x.d + " " + x.name))
    .map(x => ({ id: "cal:" + x.d + x.name, title: x.name, date: x.d, src: "나이스" }));
  return [...mine, ...cal].sort((a, b) => a.date.localeCompare(b.date));
}

/* 설정 업무 탭: 계획 올리기(선생님 지시 2026-11-14). 엑셀, CSV 파일이나 붙여 넣은 글에서 날짜와 할 일을 찾아
   주간, 월간 계획에 넣는다. 양식은 날짜 | 내용. 같은 날 같은 글은 건너뛴다. 넣으면 구글 「교무수첩」 캘린더로도 간다. */
let planPlan = null, planImpErr = "";
function makePlanPlan(lines, from) {
  const have = new Set(livePlans(plansOf()).map(p => p.d + " " + p.text));
  const rows = parseSchedule(lines.join("\n"), state.year.current)
    .map(x => ({ d: x.date, text: x.title, dup: have.has(x.date + " " + x.title) }));
  return { from, rows };
}
function planImportSec() {
  const W = docs.works;
  if (!W || !W.ready || keyStateNow() !== "open") return setSec("계획 올리기", [h("p", { class: "set-state", text: "교무수첩을 열면 올릴 수 있습니다." })]);
  const err = h("p", { class: "form-err", role: "alert", text: planImpErr });
  const fail = (e) => { planImpErr = (e && e.message) || "읽지 못했습니다."; err.textContent = planImpErr; };
  const fileIn = h("input", { type: "file", id: "planFile", accept: ".xlsx,.xls,.csv", hidden: true, onchange: async () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    planImpErr = "";
    try {
      const rows = await readRosterFile(f, true);
      planPlan = makePlanPlan(rows.map(r => r.filter(c => String(c).trim()).join(" ")), f.name);
      if (!planPlan.rows.length) { planPlan = null; throw new Error("파일에서 날짜와 할 일을 찾지 못했습니다. 양식처럼 날짜 칸과 내용 칸을 채워 주세요."); }
    } catch (e) { fail(e); return; }
    renderSet();
  } });
  const ta = h("textarea", { id: "planText", "aria-label": "계획 붙여넣기" });
  const tplBtn = h("button", { class: "btn small secondary", type: "button", id: "planTpl", text: "양식 받기", onclick: async () => {
    try {
      const ym = todayKey().slice(0, 7);
      const rows = [["날짜", "내용"], ...livePlans(plansOf()).filter(p => p.d.startsWith(ym)).sort((a, b) => a.d.localeCompare(b.d)).map(p => [p.d, p.text])];
      const X = await loadXlsx(), ws = X.utils.aoa_to_sheet(rows), wb = X.utils.book_new();
      ws["!cols"] = [{ wch: 12 }, { wch: 40 }];
      X.utils.book_append_sheet(wb, ws, "계획");
      X.writeFile(wb, `업무계획_${ym}.xlsx`);
    } catch (e) { fail(e); }
  } });
  const plan = planPlan;
  const okN = plan ? plan.rows.filter(r => !r.dup).length : 0;
  const preview = plan ? h("div", { class: "rs-plan", id: "planPlan" },
    h("p", { class: "rs-from", text: `${plan.from}에서 ${plan.rows.length}건을 찾았습니다. 적용하면 ${okN}건을 계획에 넣습니다.` }),
    ...plan.rows.slice(0, 60).map(r => h("div", { class: "rs-row" + (r.dup ? " skip" : "") },
      h("b", { text: `${+r.d.slice(5, 7)}월 ${+r.d.slice(8)}일` }), h("span", { text: r.text }),
      h("span", { class: "rs-why", text: r.dup ? "이미 있음" : "넣음" }))),
    plan.rows.length > 60 ? h("p", { class: "set-state", text: `외 ${plan.rows.length - 60}건` }) : null) : null;
  return setSec(["계획 올리기", tplBtn,
    h("button", { class: "btn small secondary", type: "button", id: "planUp", text: "파일 올리기", onclick: () => { fileIn.value = ""; fileIn.click(); } }), fileIn,
    plan ? h("button", { class: "btn small", type: "button", id: "planApply", text: "적용", "aria-label": "계획 적용", disabled: !okN, onclick: () => {
      const now = Date.now();
      for (const r of plan.rows) if (!r.dup) plansOf().push({ id: uid(), d: r.d, text: r.text.slice(0, 100), done: false, at: now });
      saveEnc(W); planPlan = null; planImpErr = "";
      renderSet(); renderNb(); planSyncSoon();
      toast(`계획 ${okN}건을 넣었습니다`);
    } }) : null,
    plan ? h("button", { class: "btn small secondary", type: "button", id: "planCancel", text: "취소", "aria-label": "계획 올리기 취소", onclick: () => { planPlan = null; renderSet(); } }) : null], [
    setBlock(["붙여넣기", h("button", { class: "btn small secondary", type: "button", id: "planFind", text: "날짜 찾기", onclick: () => {
      planImpErr = "";
      planPlan = makePlanPlan(ta.value.split(/\r?\n/), "붙여 넣은 글");
      if (!planPlan.rows.length) { planPlan = null; fail(new Error("날짜를 찾지 못했습니다. 11.20 교과협의회처럼 날짜와 내용이 한 줄에 있어야 합니다.")); return; }
      renderSet();
    } })], [ta]),
    preview], err);
}

/* 설정 업무 탭: 학사 일정을 글로 붙여 넣어 D-day 에 넣는다(전에는 D-day 위젯의 「일정 붙여넣기」) */
function calPasteSec() {
  const ta = h("textarea", { id: "calText", "aria-label": "학사 일정 붙여넣기" });
  const err = h("p", { class: "form-err", role: "alert" });
  const add = h("button", { class: "btn small secondary", type: "button", id: "calAdd", text: "날짜 찾아 넣기", onclick: () => {
    const found = parseSchedule(ta.value, state.year.current);
    if (!found.length) { err.textContent = "날짜를 찾지 못했습니다. 12.24 겨울방학식처럼 날짜와 이름이 한 줄에 있어야 합니다."; return; }
    const have = new Set(state.ddays.map(x => x.date + " " + x.title));
    let added = 0;
    for (const f of found) {
      if (have.has(f.date + " " + f.title)) continue;
      have.add(f.date + " " + f.title);
      state.ddays.push({ id: uid(), title: f.title, date: f.date });
      added++;
    }
    save(true); renderDdays(); renderBook(); renderSet();
    toast(added ? `일정 ${added}개를 넣었습니다` : "이미 들어 있는 일정입니다");
  } });
  return setSec(["일정 붙여넣기", add], [ta], err);
}

/* ---------- 백업 파일과 복원 ---------- */
// 암호화된 기록은 암호문 그대로 파일에 담는다. 파일만 새어 나가도 내용은 열리지 않는다.
const BACKUP_TAG = "my-desk-backup";
let bkBusy = false, bkPicked = null, bkNote = "", bkErr = "";

async function collectBodies() {
  const out = {};
  for (const col of DESK_COLS) {
    const snap = await FB.getDocs(FB.collection(FB.db, col));
    snap.forEach(d => { out[col + "/" + d.id] = d.data(); });
  }
  return { docs: out };
}
async function exportBackup() {
  if (!cloud) throw new Error("저장소에 연결되지 않아 백업을 만들 수 없습니다.");
  const got = await collectBodies();
  const keys = Object.keys(got.docs);
  if (!keys.length) throw new Error("저장된 기록이 아직 없습니다.");
  const data = JSON.stringify({ tag: BACKUP_TAG, v: 2, at: new Date().toISOString(), count: keys.length, docs: got.docs });
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = `교무노트-백업-${todayKey()}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { count: keys.length, capped: false };
}
function readBackupFile(file) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => {
      let o = null;
      try { o = JSON.parse(String(r.result)); } catch (e) {}
      if (!o || o.tag !== BACKUP_TAG || !o.docs || typeof o.docs !== "object" || Array.isArray(o.docs)) {
        no(new Error("오늘, 교무노트 백업 파일이 아닙니다."));
        return;
      }
      if (o.v !== 2) {
        no(new Error("예전 아티팩트판 백업입니다. 이 판으로는 되돌릴 수 없습니다."));
        return;
      }
      ok(o);
    };
    r.onerror = () => no(new Error("파일을 읽지 못했습니다."));
    r.readAsText(file);
  });
}
async function restoreBackup(o) {
  if (!cloud) throw new Error("저장소에 연결되지 않아 되돌릴 수 없습니다.");
  // 되돌리는 동안 이 기기가 들고 있던 내용이 덮어쓰지 않게 멈춘다.
  for (const d of allDocs()) { clearTimeout(d.timer); d.dirty = false; d.pendingBody = null; }
  let n = 0;
  for (const k of Object.keys(o.docs)) {
    const body = o.docs[k];
    if (!body || typeof body !== "object" || Array.isArray(body)) continue;
    const [col, id] = k.split("/");
    if (!col || !id || !DESK_COLS.includes(col)) continue;
    await FB.setDoc(FB.doc(FB.db, col, id), body);
    n++;
  }
  return n;
}
const bkPickedNote = () => `${(bkPicked.at || "").slice(0, 10)}에 만든 백업, 기록 ${Object.keys(bkPicked.docs).length}개.`;
function backupSection() {
  const err = h("p", { class: "form-err", role: "alert", text: bkErr });
  const note = h("p", { class: "set-state", text: bkNote });
  const setErr = (t) => { bkErr = t; err.textContent = t; };
  const setNote = (t) => { bkNote = t; note.textContent = t; };
  const expBtn = h("button", { class: "btn small secondary", type: "button", id: "bkSave", text: "백업 파일 내보내기" });
  expBtn.addEventListener("click", async () => {
    if (bkBusy) return;
    bkBusy = true; setErr(""); expBtn.disabled = true; expBtn.textContent = "모으는 중…";
    try {
      const r = await exportBackup();
      setNote(`기록 ${r.count}개를 파일로 보냈습니다.` + (r.capped ? " 기록이 많아 앞의 1000개만 담았습니다." : ""));
      toast("백업 파일을 내보냈습니다");
    } catch (e) {
      if (e && e.code === "declined") setNote("내려받기를 취소했습니다.");
      else setErr((e && e.message) || "백업 파일을 만들지 못했습니다.");
    } finally { bkBusy = false; expBtn.disabled = false; expBtn.textContent = "백업 파일 내보내기"; }
  });

  const fileIn = h("input", { type: "file", id: "bkFile", accept: ".json,application/json", hidden: true });
  const fileBtn = h("button", { class: "btn small secondary", type: "button", text: "백업 파일 고르기", onclick: () => { fileIn.value = ""; fileIn.click(); } });
  const pickNote = h("p", { class: "set-state", text: bkPicked ? bkPickedNote() : "" });
  const impBtn = h("button", { class: "btn small secondary", type: "button", id: "bkLoad", text: "이 파일로 되돌리기" });
  const resetArm = () => { delete impBtn.dataset.armed; impBtn.textContent = "이 파일로 되돌리기"; };
  fileIn.addEventListener("change", async () => {
    resetArm(); setErr(""); bkPicked = null; pickNote.textContent = "";
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    try {
      bkPicked = await readBackupFile(f);
      pickNote.textContent = bkPickedNote();
    } catch (e) { setErr(e.message); }
  });
  impBtn.addEventListener("click", async () => {
    if (bkBusy) return;
    if (!bkPicked) { setErr("되돌릴 백업 파일을 먼저 골라 주세요."); return; }
    if (!impBtn.dataset.armed) {
      impBtn.dataset.armed = "1";
      impBtn.textContent = "한 번 더 누르면 지금 기록을 덮어씁니다";
      return;
    }
    bkBusy = true; setErr(""); impBtn.disabled = true; impBtn.textContent = "되돌리는 중…";
    try {
      const n = await restoreBackup(bkPicked);
      await lockNow();
      setOpen = false; renderSet();
      toast(`기록 ${n}개를 되돌렸습니다. 그때 쓰던 비밀번호로 다시 열어 주세요`);
    } catch (e) {
      setErr((e && e.message) || "되돌리지 못했습니다.");
    } finally { bkBusy = false; impBtn.disabled = false; resetArm(); }
  });

  return setSec("백업", [
    setBlock(["내보내기", expBtn, note], []),
    setBlock(["되돌리기", fileBtn, impBtn, fileIn, pickNote], []),
  ], err);
}

/* ---------- 교무수첩 ---------- */
let bookSid = "", attLoaded = "", attBusy = false;
const attCache = new Map();
const KINDS = ["상담", "민원"];
const WHOS = ["학생", "학부모", "교직원", "기타"];


const bCls = () => picked();
function goClass(c) {
  if (pickedCls === c) return;
  pickedCls = c; bookSid = ""; sendPlan = null;
  renderClass(); renderBook();
}
function rosterOf(cls) {
  if (hcHas(cls)) return (hc.byCls[cls] || []).map(s => ({ id: s.id, n: s.n, name: s.name }));
  const v = docs.roster && docs.roster.value;
  const c = v && v.classes && v.classes[cls];
  const list = c && Array.isArray(c.students) ? c.students : [];
  return list.filter(s => !s.gone).sort((a, b) => a.no - b.no).map(s => ({ id: s.id, n: s.no, name: (s.name || "").trim() }));
}
function stuOf(cls, sid) { return rosterOf(cls).find(s => s.id === sid) || null; }
function marksIn(v) { return (v && v.marks) || {}; }
/* 출결 한 건: { k: 결석|지각|조퇴|결과, r: 질병|인정|미인정 (빈 글자면 사유 미정), p: [교시 0~8], memo }.
   marks[학생] 은 그 건들의 배열이다. 옛 기록은 "결석" 같은 글자 하나였다: 사유 미정 한 건으로 읽는다. */
const ATT_KINDS = ["결석", "지각", "조퇴", "결과"];
const ATT_REASONS = [["질병", "질병"], ["인정", "출석인정"], ["미인정", "미인정"]];
const PERIOD_NAMES = ["조회", "1교시", "2교시", "3교시", "4교시", "5교시", "6교시", "7교시", "종례"];
function entriesOf(v, sid) {
  const x = marksIn(v)[sid];
  if (!x) return [];
  if (typeof x === "string") return ATT_KINDS.includes(x) ? [{ k: x, r: "", p: [], memo: "" }] : [];
  return Array.isArray(x) ? x.filter(e => e && ATT_KINDS.includes(e.k)).map(e => ({ k: e.k, r: e.r || "", p: Array.isArray(e.p) ? e.p : [], memo: e.memo || "" })) : [];
}
const reasonName = (r) => r === "인정" ? "출석인정" : r || "사유 미정";
/* 한 덩어리로 붙여 쓴다(선생님 지시 2026-11-16 "질병결석(감기) 이런식으로"): 사유+종류에 괄호로 교시와 메모.
   사유를 아직 안 고른 옛 기록만 "사유 미정 결석"처럼 띈다. 메모를 빼려면 { ...e, memo: "" } 로 부른다. */
function entryText(e) {
  const ps = e.p.slice().sort((a, b) => a - b).map(i => PERIOD_NAMES[i]).filter(Boolean);
  const when = !ps.length ? "" : e.k === "지각" ? ps[0] + "까지" : e.k === "조퇴" ? ps[0] + "부터" : e.k === "결과" ? ps.join(", ") : "";
  const inner = [when, e.memo].filter(Boolean).join(", ");
  return `${reasonName(e.r)}${e.r ? "" : " "}${e.k}${inner ? `(${inner})` : ""}`;
}
const attKeyOf = (day, cls) => `y${yearOpen}_att_${day}_${cls}`;
function attValueOf(day, cls) {
  if (docs.att && docs.att.ready && attDay === day && attCls === cls) return docs.att.value;
  return attCache.get(attKeyOf(day, cls)) || null;
}
const bookReady = () => keyStateNow() === "open" && encDocs().every(d => d.ready && !d.broken);
const dnum = (iso) => Math.round((parseDate(iso) - parseDate(todayKey())) / 86400000);
const dLabel = (n) => n === 0 ? "D-DAY" : n > 0 ? "D-" + n : "D+" + (-n);
const dueCls = (n) => n < 0 ? "over" : n <= 3 ? "soon" : "far";
const ymOf = (iso) => iso.slice(0, 7);
const dotDate = (iso) => { const d = parseDate(iso); return `${d.getMonth() + 1}.${d.getDate()}(${WD[d.getDay()]})`; };

function monthDays(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate(), out = [];
  for (let i = 1; i <= last; i++) {
    const d = new Date(y, m - 1, i);
    // 주말은 빼지만 오늘이면 남긴다(하루 보기를 걷어서, 표에 칸이 없으면 그날은 적을 수가 없다)
    if ((d.getDay() === 0 || d.getDay() === 6) && isoOf(d) !== todayKey()) continue;
    out.push(`${y}-${pad(m)}-${pad(i)}`);
  }
  return out;
}
// 지난 날짜의 출결 문서를 하나씩 받아 풀어 둔다. 선생님이 단추를 누를 때만 받는다.
async function fetchAtt(key) {
  if (attCache.has(key)) return;
  if (!cloud || !dataKey) { attCache.set(key, null); return; }
  try {
    const snap = await cloud(key).get();
    attCache.set(key, snap.exists ? await unseal(dataKey, key, snap.data()) : null);
  } catch (e) { attCache.set(key, null); }
}
async function loadMonth(ym, cls) {
  if (attBusy) return;
  attBusy = true; renderBook();
  try {
    for (const day of monthDays(ym)) {
      if (day > todayKey()) break;
      await fetchAtt(attKeyOf(day, cls));
    }
    attLoaded = ym + "|" + cls;
  } finally { attBusy = false; renderBook(); }
}
function countFor(cls, sid, ym) {
  const out = { 결석: 0, 지각: 0, 조퇴: 0, 결과: 0, days: 0 };
  for (const day of monthDays(ym)) {
    const key = attKeyOf(day, cls);
    const v = (attDay === day && attCls === cls && docs.att && docs.att.ready) ? docs.att.value
      : attCache.has(key) ? attCache.get(key) : undefined;
    if (v === undefined) continue;
    out.days++;
    for (const e of entriesOf(v, sid)) out[e.k]++;
  }
  return out;
}

// title 은 글자 하나나 [제목, 단추, 안내…](머리줄 한 줄, hd)
function panel(title, ...kids) { return h("section", { class: "panel" }, titled("h3", "", title), ...kids); }
function noneLine(text) { return h("p", { class: "empty", text }); }
function field(label, el) { return h("label", { class: "field" }, label, el); }
/* 지우는 단추(바로 지우고 실행취소). 아이콘 단추라 머리줄 오른쪽 끝으로 간다. 이름(label)은 마우스를 올리면 보인다. */
function delBtn(label, back, run, _cls, id, ic = "trash-2") {
  return iconBtn(label, ic, () => undoable(back, run), { id });
}

/* ---------- 나이스 시간표, 급식 ---------- */
/* 나이스에서 그 주 시간표를 받아 주간 시간표에 넣는다. 단추와 자동 받기가 같이 쓴다.
   과목이 비면 거를 것이 없어 첫 반이 35칸을 다 먹으므로 막는다. 한 칸도 못 찾으면 덮지 않는다. */
async function fetchWeek(now = new Date()) {
  const N = state.neis;
  const subjects = N.subjects.filter(s => s.name && s.classes.length);
  if (!subjects.length) throw new Error("내 과목과 그 과목을 가르치는 반을 먼저 넣어 주세요.");
  // 나이스가 아는 학년도는 받아오는 그 주의 학년도다. 수첩이 보는 학년도와 다를 수 있다.
  const tt = await Neis.loadMyWeek(N.school, academicYear(now), Neis.semesterOf(now),
    Neis.mondayOf(now), subjects, N.key, cfg().homeroom);
  const n = tt.flat().filter(Boolean).length;
  if (!n) throw new Error(tt.short
    ? "인증키가 없어 1~5교시만 받았습니다. 설정에 인증키를 넣고 다시 받아 주세요."
    : "그 주에 내 과목 수업을 찾지 못했습니다. 과목 이름을 확인해 주세요.");
  state.tt = tt; state.ttSubj = tt.subj; state.ttExample = false;
  state.ttCls = tt.cls || Array.from({ length: 5 }, () => Array(7).fill(""));   // 담임이 아니면 빈 격자
  save(true); renderTT(); renderPeriods(); renderNow(new Date());
  return { n, short: !!tt.short };
}
/* 시간표는 하루 한 번 저절로 받고 토스트로 알린다(선생님 지시 2026-11-13).
   클라우드 설정을 받은 뒤에만 한다: 옛 사본 위에서 받으면 다른 기기 것을 덮는다.
   주말에는 다음 주를 받는다. 손으로 고친 칸은 다음 날 다시 덮인다. */
let weekBusy = false, clsTried = false;
async function autoWeek() {
  const sd = settingsDoc(), day = todayKey();
  // 담임인데 우리 반 줄이 비어 있으면(이 기능이 생기기 전에 받은 사본) 오늘 안에 한 번 더 받는다
  const needCls = !clsTried && !!cfg().homeroom && !state.ttCls.some(r => r.some(c => c));
  if (weekBusy || !sd || !sd.confirmed || !state.neis.school || (state.ttAuto === day && !needCls)) return;
  if (!state.neis.subjects.some(s => s.name && s.classes.length)) return;
  weekBusy = true; clsTried = true;
  state.ttAuto = day;                     // 못 받아도 오늘은 다시 묻지 않는다
  const now = new Date(), w = now.getDay();
  if (w === 6 || w === 0) now.setDate(now.getDate() + (w === 6 ? 2 : 1));
  try {
    await fetchWeek(now);
    toast((w === 6 || w === 0 ? "다음 주" : "이번 주") + " 시간표를 나이스에서 받았습니다");
  } catch (e) { save(true); }
  weekBusy = false;
}

/* 오늘 급식 위젯 */
function renderMeal() {
  const box = $("mealBody");
  if (!box) return;
  const today = todayKey();
  const list = mealToday && mealToday.day === today ? mealToday.list : null;
  // 중식 하나만 오는 날은 "중식" 글자를 뺀다. 조식, 석식까지 오면 그때만 종류를 적는다(선생님 지시 2026-11-17).
  const one = list && list.length === 1;
  box.replaceChildren(!state.neis.school ? noneLine("설정의 기본 탭에서 학교를 정하면 급식이 보입니다.")
    : !list ? noneLine("급식을 받는 중입니다.")
    : !list.length ? noneLine("오늘 급식이 없습니다.")
    : h("ul", { class: "meal" }, ...list.map(m => h("li", null,
        one ? null : h("span", { class: "kind", text: m.kind }),
        h("span", { class: "dish", text: m.dishes.join(", ") }),
        m.kcal ? h("span", { class: "kcal", text: m.kcal }) : null))));
}
/* 오늘 급식은 하루 한 번만 받는다. */
let mealBusy = false;
async function loadMeal() {
  const day = todayKey();
  if (mealBusy || !state.neis.school || (mealToday && mealToday.day === day)) return;
  mealBusy = true;
  try {
    const list = await Neis.loadMeal(state.neis.school, day.replace(/-/g, ""), state.neis.key);
    mealToday = { day, list };
    renderMeal();
  } catch (e) {
    mealToday = { day, list: [] };
  }
  mealBusy = false;
}


/* ---------- 학생 ---------- */
/* 담임 학생(선생님 지시 2026-11-16 "카드가 아니라 세로로 긴 표, 1단만 쓰고 3단에 그 학생 세부"):
   수업 장 학생과 같은 틀(.ls-split). 1단은 학생 표, 오른쪽은 출결과 수합 미제출 | 상담 민원 | 메모 세 섹션. */
function studentPage() {
  const cls = bCls(), list = rosterOf(cls), ym = ymOf(todayKey());
  if (!list.length) return panel("학생", noneLine("이 반은 명단이 비어 있습니다. 설정의 학생 명단에서 넣어 주세요."));
  if (!list.find(s => s.id === bookSid)) bookSid = list[0].id;
  const left = h("section", { class: "panel ls-left" }, hd("h3", "학생"),
    h("ul", { class: "ls-list", id: "stuList" }, ...list.map(s => h("li", null, h("button", {
      class: "ls-row", type: "button", "aria-pressed": String(s.id === bookSid), "aria-label": who(s),
      onclick: () => { bookSid = s.id; renderBook(); },
    }, h("span", { class: "n", text: String(s.n) }), h("span", { class: "nm", text: shownName(s) ? s.name : "" }))))));

  const st = stuOf(cls, bookSid);
  const S = docs.students, rec = S.value.byId[bookSid] || {};
  const cnt = countFor(cls, bookSid, ym);
  const loaded = attLoaded === ym + "|" + cls;
  const att = panel([ym.replace("-", "년 ") + "월 출결", h("button", {
      class: "text-btn", type: "button",
      text: attBusy ? "불러오는 중…" : loaded ? "다시 불러오기" : "이번 달 출결 모아 보기",
      disabled: attBusy ? "" : null,
      onclick: () => { if (loaded) for (const d of monthDays(ym)) attCache.delete(attKeyOf(d, cls)); loadMonth(ym, cls); },
    })],
    h("div", { class: "counts" },
      h("div", { class: "count absent" }, h("div", { class: "k", text: "결석" }), h("div", { class: "v", text: String(cnt.결석) })),
      h("div", { class: "count late" }, h("div", { class: "k", text: "지각" }), h("div", { class: "v", text: String(cnt.지각) })),
      h("div", { class: "count early" }, h("div", { class: "k", text: "조퇴" }), h("div", { class: "v", text: String(cnt.조퇴) })),
      h("div", { class: "count" }, h("div", { class: "k", text: "본 날짜" }), h("div", { class: "v", text: String(cnt.days) }))));

  const missItems = docs.collects.value.items.filter(c => itemCls(c) === cls && !(c.got || []).includes(bookSid));
  att.append(hd("h3", "수합 미제출", [], "", "sub-hd"),
    missItems.length ? h("ul", { class: "lines" }, ...missItems.map(c => h("li", { class: "line" },
      h("div", { class: "top" }, h("span", { class: "ttl", text: c.title }), h("span", { class: "tag open", text: "미제출" })))))
      : noneLine("미제출이 없습니다."));

  const mine = docs.consults.value.items.filter(x => x.sid === bookSid);
  const cons = panel(["이 학생 상담 민원", h("button", { class: "text-btn", type: "button", text: "이 학생 상담 적기", onclick: () => { nbTab.home = "consult"; renderNb(); } })],
    mine.length ? h("ul", { class: "lines" }, ...mine.slice().sort((a, b) => b.at.localeCompare(a.at)).map(consultLine)) : noneLine("기록이 없습니다."));

  const noteEl = h("textarea", { id: "stuNote", value: rec.note || "" });
  const note = panel(["학생 메모", h("button", { class: "btn small", type: "button", id: "stuNoteSave", text: "저장", "aria-label": "학생 메모 저장", onclick: () => {
      S.value.byId[bookSid] = { ...rec, note: noteEl.value.trim().slice(0, 2000) };
      saveEnc(S); toast("메모를 저장했습니다"); renderBook();
    } })], noteEl);

  const head = hd("h3", h("div", { class: "who" },
      h("span", { class: "nm", text: shownName(st) ? st.name : st.n + "번" }),
      h("span", { class: "meta", text: classLabel(cls) + " " + st.n + "번" })), [
    h("button", { class: "text-btn", type: "button", id: "stuCopy", text: "출결 요약 복사", onclick: () => {
      copyText(`${classLabel(cls)} ${who(st)} ${ym} 결석 ${cnt.결석} 지각 ${cnt.지각} 조퇴 ${cnt.조퇴}`);
    } })], "", "ls-head");
  return h("div", { class: "ls-split" }, left,
    h("div", { class: "ls-main" }, head,
      h("div", { class: "ls-cols" }, att, cons, note)));
}

/* ---------- 수업 장 학생(선생님 지시 2026-11-15): 4단. 1단은 학생 목록(세로로 길게), 2~4단은 성적, 세부 특기사항, 메모.
   성적은 호클래스에서 읽기만(성적 입력은 호클래스 어드민). 세특과 메모는 호클래스 hoclass_student_notes 에 같이 쓴다:
   학생을 고르면 호클래스에서 받아 오고, 「호클래스에 저장」으로 올린다. 어드민 학생 관리에서 적은 것도 여기 보인다. */
let lsNote = { key: "", v: null, err: "", dirty: false, busy: false }, lsGrade = { key: "", v: null, err: "" };
// 호클래스 과목 이름: 그 반 강의실 중 고른 과목과 같은 것, 강의실이 하나면 그 과목, 아니면 수첩 과목 이름
function hcSubjOf(cls) {
  const cs = hc ? hc.courses.filter(c => c.cls === cls) : [], c0 = curSubj();
  return (cs.find(c => c.subject === c0) || (cs.length === 1 ? cs[0] : null) || { subject: c0 }).subject || "";
}
async function lsLoadNote(key, year, subj, sid) {
  lsNote = { key, v: null, err: "", dirty: false, busy: false };
  try { const v = await loadNote(FB, year, subj, sid); if (lsNote.key === key) lsNote.v = v; }
  catch (e) { if (lsNote.key === key) lsNote.err = "호클래스에서 받아 오지 못했습니다."; }
  if (lsNote.key === key) renderBook();
}
async function lsLoadGrade(key, cls, sid) {
  lsGrade = { key, v: null, err: "" };
  try { const v = await loadGrade(FB, lessonsOf(cls), sid); if (lsGrade.key === key) lsGrade.v = v; }
  catch (e) { if (lsGrade.key === key) lsGrade.err = "호클래스 성적을 받아 오지 못했습니다."; }
  if (lsGrade.key === key) renderBook();
}
function lessonStudentPage() {
  const cls = bCls(), list = rosterOf(cls);
  if (!list.find(s => s.id === bookSid)) bookSid = list[0] ? list[0].id : "";
  const left = h("section", { class: "panel ls-left" }, hd("h3", "학생"),
    h("ul", { class: "ls-list", id: "lsList" }, ...list.map(s => h("li", null, h("button", {
      class: "ls-row", type: "button", "aria-pressed": String(s.id === bookSid), "aria-label": who(s),
      onclick: () => {
        if (lsNote.dirty && s.id !== bookSid && !confirm("저장하지 않은 세특과 메모가 있습니다. 다른 학생으로 넘어갈까요?")) return;
        bookSid = s.id; renderBook();
      },
    }, h("span", { class: "n", text: String(s.n) }), h("span", { class: "nm", text: shownName(s) ? s.name : "" }))))));
  if (!bookSid) return h("div", { class: "ls-split" }, left, panel("학생 기록", noneLine("명단이 비어 있습니다.")));

  const st = stuOf(cls, bookSid), year = state.year.current, subj = hcSubjOf(cls);
  const nKey = [year, subj, bookSid].join("|"), gKey = [cls, curSubj(), bookSid, Object.keys(hcLessons).length].join("|");
  if (lsNote.key !== nKey) lsLoadNote(nKey, year, subj, bookSid);
  if (hcHas(cls) && lsGrade.key !== gKey) lsLoadGrade(gKey, cls, bookSid);

  const abs = sessOf(cls).filter(s => absOf(s).includes(bookSid)).length;
  const save = async () => {
    if (lsNote.busy || !lsNote.v) return;
    lsNote.busy = true; renderBook();
    try { await saveNote(FB, year, subj, bookSid, lsNote.v); lsNote.dirty = false; lsNote.v.at = Date.now(); toast("호클래스에 저장했습니다"); }
    catch (e) { toast("저장하지 못했습니다. 다시 해 보세요"); }
    finally { lsNote.busy = false; renderBook(); }
  };
  const head = hd("h3", h("div", { class: "who" },
      h("span", { class: "nm", text: shownName(st) ? st.name : st.n + "번" }),
      h("span", { class: "meta", text: `${classLabel(cls)} ${st.n}번${subj ? " " + subj : ""}` })), [
    h("button", { class: "text-btn", type: "button", id: "lsReload", text: "다시 불러오기", onclick: () => {
      if (lsNote.dirty && !confirm("저장하지 않은 세특과 메모가 지워집니다. 다시 불러올까요?")) return;
      lsNote.key = ""; lsGrade.key = ""; renderBook(); } }),
    h("div", { class: "att-sum" },
      h("span", { class: "k" + (abs ? " absent" : "") }, "수업 결석 ", h("b", { text: abs + "회" }))),
    lsNote.busy ? h("span", { class: "tip", text: "저장하는 중입니다" }) : null,
    iconBtn("호클래스에 저장", "check", save, { id: "lsSave", disabled: (!lsNote.v || lsNote.busy || !lsNote.dirty) ? "" : null })], "", "ls-head");

  const G = lsGrade.v;
  const grade = panel("성적", !hcHas(cls) ? noneLine("호클래스 강의실이 없는 반입니다.")
    : lsGrade.err ? noneLine(lsGrade.err) : !G ? h("p", { class: "tip", text: "호클래스에서 받아 오는 중입니다." })
    : !G.has ? noneLine("성적에 반영된 차시가 없습니다.")
    : h("div", { class: "ls-grade", id: "lsGrade" },
      ...GRADE_AREAS.map(a => { const x = G.areas[a];
        return h("div", { class: "ls-g" }, h("span", { text: AREA_NAMES[a] }),
          x.total ? h("span", { class: "muted", text: `${x.achieved}/${x.total} ${x.pct}%` }) : h("span"),
          h("b", { text: x.total ? `${x.score}점` : "미실시" })); }),
      h("div", { class: "ls-g tot" }, h("span", { text: "총점" }), h("span"), h("b", { text: `${G.total} / ${G.maxScore}점` })),
      h("ul", { class: "lines ls-rows" }, ...G.rows.map(r => h("li", { class: "line" },
        h("div", { class: "top" }, h("span", { class: "ttl", text: `${r.order}차시 ${r.title || ""}`.trim() }), r.absent ? h("span", { class: "tag", text: "결석" }) : null),
        r.feedback ? h("p", { class: "muted", text: r.feedback }) : null)))));

  // 옛 수업 메모(수첩에만 있던 lnote)는 호클래스 메모가 한 번도 저장된 적 없을 때 채워 둔다(저장하면 올라간다)
  const old = (docs.students.value.byId[bookSid] || {}).lnote;
  if (lsNote.v && !lsNote.v.memo && !lsNote.v.at && old && !lsNote.dirty) { lsNote.v.memo = old; lsNote.dirty = true; }
  const area = (id, k, title) => {
    if (lsNote.err) return panel(title, noneLine(lsNote.err));
    if (!lsNote.v) return panel(title, h("p", { class: "tip", text: "호클래스에서 받아 오는 중입니다." }));
    return panel(title, h("textarea", { id, class: "ls-ta", maxlength: "3000", value: lsNote.v[k],
      oninput: (e) => { lsNote.v[k] = e.target.value;
        if (!lsNote.dirty) { lsNote.dirty = true; const b = document.getElementById("lsSave"); if (b) b.disabled = false; } } }));
  };
  return h("div", { class: "ls-split" }, left,
    h("div", { class: "ls-main" }, head,
      h("div", { class: "ls-cols" }, grade, area("lsSeteuk", "seteuk", "세부 특기사항"), area("lsMemo", "memo", "메모"))));
}

/* ---------- 상담 민원 ---------- */
function consultLine(x) {
  const D = docs.consults;
  const st = x.sid ? stuOf(x.cls, x.sid) : null;
  return h("li", { class: "line" + (x.done ? " done" : "") },
    hd("span", x.title || (x.kind + " 기록"), [
      h("button", { class: "text-btn", type: "button", text: x.done ? "다시 하는 중" : "마무리", onclick: () => { x.done = !x.done; saveEnc(D); renderBook(); } }),
      h("button", { class: "text-btn", type: "button", text: "복사", onclick: () => copyText(
        [`${x.at} ${x.kind} (${x.who}${x.cls ? ", " + x.cls + (st ? " " + who(st) : "") : ""})`, x.title, x.body, x.action ? "조치: " + x.action : ""].filter(Boolean).join("\n")) }),
      h("span", { class: "hd-note when", text: dotDate(x.at) }),
      delBtn("삭제", docBack(D), () => { D.value.items = D.value.items.filter(y => y.id !== x.id); saveEnc(D); renderBook(); })], "ttl", "top"),
    h("div", { class: "marks" },
      h("span", { class: "tag " + (x.kind === "민원" ? "complaint" : "consult"), text: x.kind }),
      h("span", { class: "tag", text: x.who }),
      x.cls ? h("span", { class: "tag cls", text: x.cls + (st ? " " + who(st) : "") }) : null,
      x.done ? null : h("span", { class: "tag open", text: "진행 중" })),
    x.body ? h("div", { class: "body", text: x.body }) : null,
    x.action ? h("div", { class: "body", text: "조치: " + x.action }) : null);
}
function consultPage() {
  const D = docs.consults, cls = bCls();
  const atIn = h("input", { type: "date", id: "coAt", value: todayKey() });
  const kindIn = h("select", { id: "coKind" }, ...KINDS.map(k => h("option", { value: k, text: k })));
  const whoIn = h("select", { id: "coWho" }, ...WHOS.map(k => h("option", { value: k, text: k })));
  const clsIn = h("select", { id: "coCls" }, h("option", { value: "", text: "반 없음" }), ...cardClasses().map(c => h("option", { value: c, text: classLabel(c) })));
  clsIn.value = cls || "";
  const sidIn = h("select", { id: "coSid" });
  const fillSid = () => {
    const list = clsIn.value ? rosterOf(clsIn.value) : [];
    sidIn.replaceChildren(h("option", { value: "", text: "학생 없음" }), ...list.map(s => h("option", { value: s.id, text: who(s) })));
    sidIn.value = list.find(s => s.id === bookSid) ? bookSid : "";
  };
  fillSid();
  clsIn.addEventListener("change", fillSid);
  const titleIn = h("input", { type: "text", id: "coTitle", maxlength: "80", autocomplete: "off" });
  const bodyIn = h("textarea", { id: "coBody" });
  const actIn = h("textarea", { id: "coAction" });
  const err = h("p", { class: "form-err", role: "alert" });
  const form = h("form", { class: "book-form", id: "coForm", onsubmit: (e) => {
    e.preventDefault();
    if (!atIn.value) { err.textContent = "날짜를 넣어 주세요."; return; }
    if (!titleIn.value.trim() && !bodyIn.value.trim()) { err.textContent = "한 줄 요약이나 내용 하나는 적어 주세요."; return; }
    D.value.items.unshift({
      id: uid(), at: atIn.value, kind: kindIn.value, who: whoIn.value,
      cls: clsIn.value, sid: sidIn.value, title: titleIn.value.trim().slice(0, 80),
      body: bodyIn.value.trim().slice(0, 2000), action: actIn.value.trim().slice(0, 1000), done: false,
    });
    saveEnc(D); bookSid = sidIn.value || bookSid; renderBook(); toast("기록했습니다");
  } },
    h("div", { class: "form-grid" },
      field("날짜", atIn), field("종류", kindIn), field("대상", whoIn),
      field("반", clsIn), field("학생", sidIn),
      h("label", { class: "field wide" }, "한 줄 요약", titleIn),
      h("label", { class: "field wide" }, "내용", bodyIn),
      h("label", { class: "field wide" }, "조치", actIn)));

  const items = D.value.items.slice().sort((a, b) => (a.done === b.done ? b.at.localeCompare(a.at) : a.done ? 1 : -1));
  const open = items.filter(x => !x.done).length;
  const list = panel("기록 " + items.length + "건" + (open ? ", 진행 중 " + open : ""),
    items.length ? h("ul", { class: "lines" }, ...items.map(consultLine)) : noneLine("기록이 없습니다."));
  return [panel(["새 기록", err, h("button", { class: "btn small", type: "submit", form: "coForm", text: "추가", "aria-label": "상담 민원 추가" })], form), list];
}

/* ---------- 수업 ---------- */
/* ---------- 수업 과목(선생님 지시 2026-11-14 "역사랑 사회 구분해야지"): 설정 「내 과목」을 수업 장 머리줄 제목 옆에서 고른다.
   진도표, 진도 계획, 한 달 출결의 열, 호클래스 차시가 고른 과목만. 출결 기록, 학생 메모, 수합은 반 것이라 과목과 상관없이 같이 쓴다. */
let lessonSubj = "", subjAuto = false;
const mySubjects = () => (state.neis.subjects || []).filter(s => s.name && s.classes && s.classes.length);
function curSubj() {
  const ss = mySubjects();
  if (!ss.length) return "";
  if (!ss.some(s => s.name === lessonSubj)) lessonSubj = ss[0].name;
  return lessonSubj;
}
const subjOfCls = (cls) => mySubjects().filter(s => s.classes.includes(cls)).map(s => s.name);
// 과목이 없으면(내 과목을 안 넣었으면) 전처럼 수업 반 전부
function subjClasses() {
  const s = mySubjects().find(x => x.name === curSubj());
  return s ? s.classes.slice().sort(byClass) : lessonClasses();
}
// 이 과목 수업인가: 과목이 적혀 있으면 그것. 없으면 그 반을 한 과목만 가르칠 때 그 과목.
// 둘 이상이면 과목 미정이라 어느 과목에도 안 보이고, 진도 「전체」 위 줄에서 정하거나 지운다
// (선생님 지적 2026-11-15 "역사 진도인데 사회 진도가 같이 포함된다").
function inSubj(x) {
  const c = curSubj();
  if (!c || x.subj === c) return true;
  if (x.subj) return false;
  const ss = subjOfCls(x.cls);
  return ss.length === 1 && ss[0] === c;
}

/* ---------- 진도(수업 장, 선생님 지시 2026-11-14) ----------
   진도와 수업 기록을 한 탭으로. 수업 하나 = docs.lessons.items 한 줄 { id, cls, at, period, unit, plan, body, hw, clId }.
   plan 은 수업 계획, body 는 한 것(기록). 옛 기록은 plan 없이 body 만 있다. 차시는 그 반 수업을 날짜, 교시 차례로 센 번호.
   「전체」는 차시 x 반 표(호클래스 진도표처럼 줄 = 차시, 열 = 반, 칸 = 그 반 날짜). 반을 고르면 왼쪽 진도표, 오른쪽 그 수업 적기. */
let progAll = true, progPick = "", genBusy = false, genNote = "", genFrom = "", genTo = "";
const sessOf = (cls) => docs.lessons.value.items.filter(x => x.cls === cls && inSubj(x))
  .sort((a, b) => a.at.localeCompare(b.at) || a.period - b.period);
// 호클래스 차시: 이어 붙인 것(clId) 먼저, 없으면 같은 날짜
const hcOf = (s) => lessonsOf(s.cls).find(x => s.clId && x.clId === s.clId) || lessonsOf(s.cls).find(x => x.date && x.date === s.at) || null;
const unitOf = (s) => s.unit || (hcOf(s) || {}).title || "";
const sessState = (s, today) => s.at === today ? "today" : s.body ? "done" : s.at < today ? "miss" : "plan";
const mdd = (iso) => { const d = parseDate(iso); return `${d.getMonth() + 1}.${d.getDate()}(${WD[d.getDay()]})`; };

/* 진도 계획 만들기(선생님 지시 2026-11-15 "알고리즘을 다시"): 바탕은 설정의 기초 시간표(칸마다 학급과 과목).
   나이스에 그 주 시간표가 올라와 있으면 그 주는 나이스대로(기초에만 있는 칸은 빼고, 나이스에만 있는 칸은 넣는다:
   재량휴업, 시간표 변경이 나이스에 먼저 올라온다). 나이스에 아직 없는 주는 기초 시간표로. 학사 일정의 쉬는 날은 뺀다.
   이미 있는 반, 날, 교시는 건너뛴다. 나이스 칸은 자리만 잡아 둔 것일 수 있어 진도표에서 줄마다 바로 고치고 지운다. */
async function genPlan(from, to) {
  if (genBusy || !from || !to || from > to) return;
  genBusy = true; genNote = "나이스 시간표를 받는 중입니다"; renderNb();
  const D = docs.lessons, N = state.neis, back = docBack(D)();
  // 과목이 있으면 내 과목 반 전부(과목마다 따로 누르지 않게 한 번에), 없으면 수업 반
  const classes = mySubjects().length ? [...new Set(mySubjects().flatMap(s => s.classes))] : lessonClasses();
  const have = new Set(D.value.items.map(x => x.cls + "|" + x.at + "|" + x.period));
  const subjects = N.subjects.filter(s => s.name && s.classes.length);
  const base = baseFilled() ? { grid: state.baseTT, subj: state.baseSubj } : null;
  let added = 0, byBase = 0, none = 0;
  try {
    for (let mon = mondayIso(parseDate(from)); mon <= to; mon = addDaysIso(mon, 7)) {
      let grid = null;
      if (N.school && subjects.length) {
        try {
          const d = parseDate(mon);
          grid = await Neis.loadMyWeek(N.school, academicYear(d), Neis.semesterOf(d), mon.replace(/-/g, ""), subjects, N.key);
          if (!grid.flat().some(Boolean)) grid = null;
        } catch (e) { grid = null; }
      }
      let subjGrid = grid && grid.subj;
      if (!grid && base) { grid = base.grid; subjGrid = base.subj; byBase++; }
      if (!grid) { none++; continue; }
      for (let di = 0; di < 5; di++) {
        const d = addDaysIso(mon, di);
        if (d < from || d > to || offName(d)) continue;
        for (let p = 0; p < 7; p++) {
          const c = String((grid[di] || [])[p] || "").trim();
          if (!classes.includes(c) || have.has(c + "|" + d + "|" + (p + 1))) continue;
          have.add(c + "|" + d + "|" + (p + 1));
          // 과목: 칸에 적힌 것, 없으면 그 반을 한 과목만 가르칠 때 그 과목, 아니면 과목 미정
          const one = subjOfCls(c);
          const subj = (subjGrid && subjGrid[di] && subjGrid[di][p]) || (one.length === 1 ? one[0] : "");
          D.value.items.push({ id: uid(), cls: c, subj, at: d, period: p + 1, unit: "", plan: "", body: "", hw: "", clId: "" });
          added++;
        }
      }
      genNote = `${+mon.slice(5, 7)}월 ${+mon.slice(8)}일 주까지 받았습니다`; renderNb();
    }
    saveEnc(D);
    if (added) undoBack = back;          // 진도 줄의 「실행취소」로 방금 넣은 것을 걷는다
    genNote = `수업 ${added}개를 넣었습니다.` + (byBase ? ` 나이스에 없는 ${byBase}주는 기초 시간표로 채웠습니다.` : "")
      + (none ? ` 나이스에 없는 ${none}주는 비워 두었습니다. 설정 수업 탭에서 기초 시간표를 넣으면 채웁니다.` : "");
  } finally { genBusy = false; renderNb(); }
}

/* 진도 단추 한 줄(선생님 지시 2026-11-15 "한 줄로 묶어서, 중구난방으로 하지 말고"): 기간, 만들기, 과목 미정 정하기와 지우기,
   빈 계획 지우기, 과목 진도표 모두 지우기, 실행취소. 전체 표와 반 하나 화면이 같이 쓴다. */
function progBar() {
  const t = todayKey(), [y, m] = t.split("-").map(Number);
  const nextEnd = isoOf(new Date(y, m + 1, 0));                // 다음 달 끝(11월이면 12월 31일)
  const fromIn = h("input", { type: "date", id: "genFrom", value: genFrom || `${y}-${pad(m)}-01`, "aria-label": "시작 날", oninput: (e) => { genFrom = e.target.value; } });
  const toIn = h("input", { type: "date", id: "genTo", value: genTo || nextEnd, "aria-label": "끝 날", oninput: (e) => { genTo = e.target.value; } });
  const D = docs.lessons, subj = curSubj();
  const mine = D.value.items.some(inSubj), tb = (label, id, fn) => h("button", { class: "text-btn", type: "button", id, text: label, onclick: fn });
  // 머리줄 한 줄: 진도 계획 | 기간, 만들기, 실행취소 | 결과 글 | 지우기 아이콘 둘
  return hd("h4", "진도 계획", [
    fromIn, h("span", { class: "prog-tilde", text: "~" }), toIn,
    h("button", { class: "btn small", type: "button", id: "genPlan", disabled: genBusy,
      text: genBusy ? "만드는 중…" : "진도 계획 만들기", onclick: () => genPlan(fromIn.value, toIn.value) }),
    undoBack ? tb("실행취소", "progUndo", undoNow) : null,
    genNote ? h("span", { class: "tip", id: "genNote", text: genNote }) : null,
    mine ? delBtn("빈 계획 지우기", docBack(D), () => clearLessons(true), null, "clearEmpty", "circle-x") : null,
    mine ? delBtn((subj ? subj + " " : "") + "진도표 모두 지우기", docBack(D), () => clearLessons(false), null, "clearAll") : null], "", "prog-bar");
}

/* 진도표 지우기. onlyEmpty: 단원, 계획, 기록, 과제, 결석이 다 빈 수업만(만든 뒤 손대지 않은 것). all: 과목 상관없이 전부(설정의 초기화). */
function clearLessons(onlyEmpty, all = false) {
  const D = docs.lessons, before = D.value.items.length;
  const empty = (x) => !(x.unit || x.plan || x.body || x.hw || absOf(x).length);
  D.value.items = D.value.items.filter(x => !((all || inSubj(x)) && (!onlyEmpty || empty(x))));
  const n = before - D.value.items.length;
  progPick = ""; genNote = "";
  saveEnc(D); renderNb(); if (setOpen) renderSet();
  return n ? `수업 ${n}개를 지웠습니다` : "지울 수업이 없습니다";
}
/* 전체: 줄 = 차시, 열 = 반, 칸 = 그 반 그 차시 날짜. 칸을 누르면 그 반 진도표의 그 수업 */
function progressAll() {
  const today = todayKey(), classes = subjClasses(), per = classes.map(sessOf);
  const maxN = Math.max(0, ...per.map(l => l.length));
  const rows = [];
  for (let i = 0; i < maxN; i++) {
    const topic = per.map(l => l[i] ? unitOf(l[i]) : "").find(Boolean) || "";
    rows.push(h("tr", null,
      h("td", { class: "pa-n", text: String(i + 1) }),
      h("td", { class: "pa-topic", text: topic }),
      ...classes.map((c, j) => {
        const s = per[j][i];
        if (!s) return h("td", { class: "pa-cell na" });
        return h("td", { class: "pa-cell " + sessState(s, today), "data-cls": c, title: `${classLabel(c)} ${mdd(s.at)} ${s.period}교시 ${unitOf(s)}`.trim(),
          onclick: () => { progAll = false; progPick = s.id; pickedCls = c; renderNb(); } },
          h("span", { class: "pa-d", text: mdd(s.at) }), h("span", { class: "pa-p", text: s.period + "교시" }),
          h("button", { class: "pa-del", type: "button", "aria-label": `${classLabel(c)} ${mdd(s.at)} ${s.period}교시 수업 지우기`, html: svgIc("x", 14),
            onclick: (e) => { e.stopPropagation(); const D = docs.lessons;
              undoable(docBack(D), () => { D.value.items = D.value.items.filter(y => y.id !== s.id); saveEnc(D); renderNb();
                return `${classLabel(c)} ${mdd(s.at)} ${s.period}교시 수업을 지웠습니다`; }); } }));
      })));
  }
  // 범례는 머리줄의 안내 자리에
  const bar = progBar();
  bar.insertBefore(h("div", { class: "pa-legend hd-note" }, ...[["done", "기록함"], ["today", "오늘"], ["plan", "계획"], ["miss", "지났는데 기록 없음"]]
    .map(([k, t]) => h("span", { class: "pa-lg" }, h("i", { class: "pa-sw " + k }), t))), bar.querySelector(".hd-acts"));
  return [
    bar,
    // 2단(선생님 지시 2026-11-14): 왼쪽 차시와 강의명은 좁게 고정, 오른쪽 반 칸은 남는 폭을 나눠 쓰고 넘치면 옆으로 넘긴다
    maxN ? h("div", { class: "prog-scroll" }, h("table", { class: "prog pa-table", id: "progAll", style: "--pa-n:" + classes.length },
      h("colgroup", null, h("col", { class: "c-n" }), h("col", { class: "c-topic" }), ...classes.map(() => h("col", { class: "c-cls" }))),
      h("thead", null, h("tr", null, h("th", { class: "pa-n", text: "차시" }), h("th", { class: "pa-topic", text: "강의명" }),
        ...classes.map(c => h("th", { class: "pa-cls", text: c })))),
      h("tbody", null, ...rows)))
      : noneLine("진도 계획이 없습니다. 위에서 진도 계획을 만들거나 반을 골라 수업을 추가해 주세요."),
  ];
}

/* 반 하나: 왼쪽 진도표(길게), 오른쪽 고른 수업 적기 */
function progressClass(cls) {
  const D = docs.lessons, today = todayKey(), list = sessOf(cls);
  let cur = list.find(s => s.id === progPick);
  if (!cur) cur = list.find(s => s.at === today) || list.find(s => s.at > today) || list[list.length - 1] || null;
  progPick = cur ? cur.id : "";
  const add = () => {
    const row = todayRow(new Date()), i = row ? row.findIndex(c => c.trim() === cls) : -1;
    const s = { id: uid(), cls, subj: curSubj(), at: today, period: i >= 0 ? i + 1 : 1, unit: "", plan: "", body: "", hw: "", clId: "" };
    D.value.items.push(s); progPick = s.id; saveEnc(D); renderNb();
  };
  const hcL = lessonsOf(cls);
  const fillHc = () => {          // 호클래스 차시 순서대로 단원과 연결을 채운다(비어 있는 수업만)
    const hs = hcL.slice().sort((a, b) => Number(a.order) - Number(b.order));
    let n = 0;
    sessOf(cls).forEach((s, i) => { const x = hs[i]; if (!x) return;
      if (!s.clId) { s.clId = x.clId; n++; } if (!s.unit && x.title) s.unit = x.title; });
    saveEnc(D); renderNb(); toast(n ? `호클래스 차시 ${n}개를 이었습니다` : "이을 차시가 없습니다");
  };
  let month = "";
  const rows = [];
  list.forEach((s, i) => {
    const ym = s.at.slice(0, 7);
    if (ym !== month) { month = ym; rows.push(h("li", { class: "pc-month", text: `${+ym.slice(5)}월` })); }
    const st = sessState(s, today);
    // 줄마다 바로 지우기(나이스 칸은 자리만 잡아 둔 것일 수 있다. 실행취소로 되돌린다)
    const del = h("button", { class: "pc-del", type: "button", "aria-label": `${mdd(s.at)} ${s.period}교시 수업 지우기`, html: svgIc("x", 14),
      onclick: () => undoable(docBack(D), () => { D.value.items = D.value.items.filter(y => y.id !== s.id); if (progPick === s.id) progPick = "";
        saveEnc(D); renderNb(); return `${mdd(s.at)} ${s.period}교시 수업을 지웠습니다`; }) });
    rows.push(h("li", { class: "pc-li" }, h("button", { class: "pc-row " + st, type: "button", "data-id": s.id, "aria-pressed": String(s === cur),
      onclick: () => { progPick = s.id; renderNb(); } },
      h("span", { class: "pc-n", text: (i + 1) + "차시" }),
      h("span", { class: "pc-d", text: mdd(s.at) }),
      h("span", { class: "pc-p", text: s.period + "교시" }),
      h("span", { class: "pc-u", text: (unitOf(s) || (s.plan || "").split("\n")[0] || "") }),
      h("i", { class: "pc-dot", "aria-hidden": "true" })), del));
  });
  const left = h("section", { class: "panel pc-left" },
    hd("h3", `진도표 ${list.length}차시`, [
      hcL.length ? h("button", { class: "text-btn", type: "button", id: "pcFillHc", text: "호클래스 차시 잇기", onclick: fillHc }) : null,
      h("button", { class: "btn small secondary", type: "button", id: "pcAdd", text: "추가", "aria-label": "수업 추가", onclick: add })]),
    list.length ? h("ul", { class: "pc-list", id: "pcList" }, ...rows) : noneLine("수업이 없습니다. 위 「진도 계획 만들기」로 만들거나 「추가」로 넣어 주세요."));
  return h("div", { class: "pc-split" }, left,
    h("div", { class: "pc-side" }, cur ? lessonEditor(cur, list.indexOf(cur) + 1) : null, hcPanel(cls, hcL)));
}
/* 수업 하나 적기. 적는 대로 저장한다(다시 그리지 않아 쓰던 칸이 그대로). 날짜, 교시를 바꾸면 진도표 차례를 다시 세운다. */
function lessonEditor(s, n) {
  const D = docs.lessons, put = (k) => (e) => { s[k] = e.target.value.slice(0, k === "body" || k === "plan" ? 2000 : 120); saveEnc(D); };
  const atIn = h("input", { type: "date", id: "leAt", value: s.at, onchange: (e) => { if (e.target.value) { s.at = e.target.value; saveEnc(D); renderNb(); } } });
  const perIn = h("select", { id: "lePeriod", onchange: (e) => { s.period = Number(e.target.value); saveEnc(D); renderNb(); } },
    ...Array.from({ length: 7 }, (_, i) => h("option", { value: String(i + 1), text: (i + 1) + "교시" })));
  perIn.value = String(s.period);
  const hcL = lessonsOf(s.cls), hx = hcOf(s);
  const clIn = hcL.length ? h("select", { id: "leCl", onchange: (e) => {
      s.clId = e.target.value; const x = hcL.find(y => y.clId === s.clId);
      if (x && !s.unit && x.title) s.unit = x.title;
      saveEnc(D); renderNb(); } },
    h("option", { value: "", text: "잇지 않음" }),
    ...hcL.map(x => h("option", { value: x.clId, text: `${x.order}차시 ${x.title || "제목 없음"}${x.date ? " (" + x.date + ")" : ""}` }))) : null;
  if (clIn) clIn.value = s.clId || (hx ? hx.clId : "");
  const ta = (id, k) => h("textarea", { id, value: s[k] || "", oninput: put(k) });
  const ss = subjOfCls(s.cls);
  const subjIn = ss.length > 1 ? h("select", { id: "leSubj", onchange: (e) => { s.subj = e.target.value; saveEnc(D); renderNb(); } },
    h("option", { value: "", text: "과목 미정" }), ...ss.map(x => h("option", { value: x, text: x }))) : null;
  if (subjIn) subjIn.value = s.subj || "";
  return h("section", { class: "panel le-ed", id: "leEd", "data-id": s.id },
    hd("h3", `${mdw(s.at)} ${s.period}교시, ${n}차시`, [
        h("button", { class: "text-btn", type: "button", text: "복사", onclick: () => copyText(
          [`${s.at} ${classLabel(s.cls)} ${s.period}교시 ${n}차시`, unitOf(s), s.plan ? "계획: " + s.plan : "", s.body ? "기록: " + s.body : "", s.hw ? "과제: " + s.hw : ""].filter(Boolean).join("\n")) }),
        delBtn("삭제", docBack(D), () => { D.value.items = D.value.items.filter(y => y.id !== s.id); progPick = ""; saveEnc(D); renderNb(); })]),
    h("div", { class: "form-grid" },
      field("날짜", atIn), field("교시", perIn), subjIn ? field("과목", subjIn) : null,
      clIn ? h("label", { class: "field wide" }, "호클래스 차시", clIn) : null,
      h("label", { class: "field wide" }, "단원", h("input", { type: "text", id: "leUnit", maxlength: "60", autocomplete: "off", value: s.unit || "", oninput: put("unit") })),
      h("label", { class: "field wide" }, "수업 계획", ta("lePlan", "plan")),
      h("label", { class: "field wide" }, "수업 기록", ta("leBody", "body")),
      h("label", { class: "field wide" }, "과제", h("input", { type: "text", id: "leHw", maxlength: "120", autocomplete: "off", value: s.hw || "", oninput: put("hw") }))));
}

/* ---------- 수업 출결 ---------- */
function nowPeriod(now = new Date()) {
  const m = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < 7; i++) { const b = state.bells[i]; if (b && m >= toMin(b.s) && m < toMin(b.e)) return i + 1; }
  return 0;
}
/* 오늘 수업 반: 진도표에 오늘 수업이 있으면 그것, 없으면 오늘 시간표. 교시 차례 */
function todayLessons(all = false) {
  const today = todayKey(), by = new Map(), c0 = curSubj();
  const classes = all && mySubjects().length ? [...new Set(mySubjects().flatMap(s => s.classes))] : subjClasses();
  const push = (c, p, subj) => { if (!by.has(c)) by.set(c, { ps: [], subj }); if (!by.get(c).ps.includes(p)) by.get(c).ps.push(p); };
  for (const s of docs.lessons.value.items) if (s.at === today && classes.includes(s.cls) && (all || inSubj(s))) push(s.cls, s.period, s.subj || subjOfCls(s.cls)[0] || "");
  if (!by.size && !state.ttExample) {
    const row = todayRow(new Date());
    const di = dayIdx(new Date());
    if (row) row.forEach((c, i) => { c = c.trim(); const ss = subjOfCls(c), sj = (state.ttSubj[di] || [])[i] || (ss.length === 1 ? ss[0] : "");
      if (classes.includes(c) && (all || !c0 || !ss.length || sj === c0)) push(c, i + 1, sj); });
  }
  return [...by.entries()].map(([cls, x]) => ({ cls, ps: x.ps.sort((a, b) => a - b), subj: x.subj })).sort((a, b) => a.ps[0] - b.ps[0]);
}
let attAuto = false;            // 출결 탭을 열 때 한 번, 지금(또는 다음) 수업 반을 고른다
function autoPickLesson(subjOnly = false) {
  if (!subjOnly) attAuto = true;
  const np = nowPeriod(), t = todayLessons(subjOnly);
  const hit = t.find(x => x.ps.includes(np)) || t.find(x => x.ps.some(p => p > np)) || t[0];
  if (!hit) return;
  if (subjOnly) { if (hit.subj && mySubjects().some(s => s.name === hit.subj)) lessonSubj = hit.subj; return; }
  pickedCls = hit.cls;
}
/* 수업 출결(선생님 지시 2026-11-15 "교시별 출결이니까 출석 or 결석이면 된다"): 수업(docs.lessons.items 한 줄)마다
   결석한 학생 번호를 abs 에 둔다. 담임 출결(종류, 사유)과는 따로다. 위에 오늘 수업마다 하루 표(칸을 누르면 출석, 결석이 바뀐다),
   아래 고른 반 한 달 표(열 = 진도표의 그 반 수업 하나하나, 표 모양은 담임 한 달 표와 같다). */
const absOf = (s) => s && Array.isArray(s.abs) ? s.abs : [];
function toggleAbs(s, sid) {
  s.abs = absOf(s).includes(sid) ? absOf(s).filter(x => x !== sid) : [...absOf(s), sid];
  saveEnc(docs.lessons); renderNb();
}
/* 오늘 수업 학생 칸 격자는 걷었다(선생님 지시 2026-11-16 "그냥 표만 뜨게 해").
   한 달 표의 칸에서 바로 출석, 결석을 바꾼다. 오늘 수업이 진도표에 없으면 표가 열을 만들어 준다. */
function lessonAttView() {
  return [h("div", { class: "lt-main" }, ...lessonMonthView(classLabel(picked()) + " 수업 출결"))];
}
let lmYm = "";
function lessonMonthView(title) {
  const cls = picked(), today = todayKey(), ym = lmYm || ymOf(today), [y, m] = ym.split("-").map(Number);
  const goYm = (n) => { const d = new Date(y, m - 1 + n, 1); lmYm = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; renderNb(); };
  const ss = sessOf(cls).filter(s => s.at.startsWith(ym)), list = rosterOf(cls);
  // 하루 표를 걷었으니, 진도표에 아직 없는 오늘 수업(시간표로 잡힌 것)도 열로 둔다. 칸을 처음 누를 때 진도표에 넣는다.
  if (ym === ymOf(today)) for (const t of todayLessons()) if (t.cls === cls) for (const p of t.ps)
    if (!ss.some(s => s.at === today && s.period === p))
      ss.push({ id: "", cls, subj: t.subj || curSubj(), at: today, period: p, unit: "", plan: "", body: "", hw: "", clId: "", abs: [], ghost: true });
  ss.sort((a, b) => a.at.localeCompare(b.at) || a.period - b.period);
  const real = (s) => { if (!s.ghost) return s; delete s.ghost; s.id = uid(); docs.lessons.value.items.push(s); return s; };
  const wk = (i) => i > 0 && mondayIso(parseDate(ss[i].at)) !== mondayIso(parseDate(ss[i - 1].at));   // 주가 바뀌는 열 앞 세로줄
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8)}`;
  const copy = () => {
    const lines = [];
    for (const s of ss) for (const st of list) if (absOf(s).includes(st.id)) lines.push(`${who(st)} ${md(s.at)} ${s.period}교시 결석`);
    return `${y}년 ${m}월 ${classLabel(cls)} 수업 결석\n` + (lines.length ? lines.join("\n") : "결석 없음");
  };
  const total = ss.reduce((n, s) => n + absOf(s).filter(id => list.some(st => st.id === id)).length, 0);
  const nav = hd("h4", title, [
    h("div", { class: "att-nav" },
      navBtn("앞 달", CHEV_L, () => goYm(-1)),
      h("span", { class: "att-date", id: "attYm", text: `${y}년 ${m}월` }),
      navBtn("다음 달", CHEV_R, () => goYm(1))),
    ss.length ? h("button", { class: "text-btn", type: "button", id: "attMonthCopy", text: "한 달 요약 복사", onclick: () => copyText(copy()) }) : null,
    ss.length ? h("div", { class: "att-sum" }, h("span", { class: "k" + (total ? " absent" : "") }, "결석 ", h("b", { text: total + "건" }))) : null,
    ss.length ? h("span", { class: "hd-note", text: "칸을 누르면 출석과 결석이 바뀝니다." }) : null]);
  if (!ss.length) return [nav, noneLine("이 달 진도표에 이 반 수업이 없습니다. 진도 탭에서 수업을 넣으면 열이 생깁니다.")];
  const rows = list.map(st => {
    const n = ss.filter(s => absOf(s).includes(st.id)).length, nm = shownName(st);
    return h("tr", null, h("th", { class: "who-n", text: String(st.n) }), h("th", { class: "who-nm", text: nm || "" }),
      ...ss.map((s, i) => { const a = absOf(s).includes(st.id), fut = s.at > today;
        return h("td", { class: [a ? "m 결석 r-미인정" : "", s.at === today ? "today" : "", wk(i) ? "wk" : "", fut ? "fut" : ""].filter(Boolean).join(" "),
          title: `${mdw(s.at)} ${s.period}교시 ${who(st)} ${a ? "결석" : fut ? "" : "출석"}`.trim(), text: a ? "결석" : "",
          onclick: fut ? null : () => toggleAbs(real(s), st.id) }); }),
      h("td", { class: "fill" }), h("td", { class: "tot first" + (n ? " 결석" : ""), text: n ? String(n) : "" }));
  });
  return [nav,
    h("div", { class: "att-month-scroll" }, h("table", { class: "att-month", id: "attMonth" },
      h("thead", null, h("tr", null, h("th", { class: "who-n", text: "번호" }), h("th", { class: "who-nm", text: "이름" }),
        ...ss.map((s, i) => h("th", { class: ["day", s.at === today ? "today" : "", wk(i) ? "wk" : ""].filter(Boolean).join(" "), title: `${mdw(s.at)} ${s.period}교시` },
          h("span", { class: "dn", text: `${+s.at.slice(5, 7)}.${+s.at.slice(8)}` }), h("span", { class: "dw", text: "(" + WD[parseDate(s.at).getDay()] + ")" }), h("span", { class: "dp", text: s.period + "교시" }))),
        h("th", { class: "fill" }), h("th", { class: "tot first", text: "결석" }))),
      h("tbody", null, ...rows)))];
}

/* ---------- 호클래스 차시 칸 (연동) ---------- */
function hcPanel(cls, lessons) {
  if (!hcHas(cls)) return null;
  if (!lessons.length) return panel("호클래스 차시", noneLine("이 강의실에 연결된 차시가 없습니다. 호클래스 어드민에서 강의를 연결해 주세요."));
  if (sendPlan) {
    const p = sendPlan;
    return panel(["결석 보내기 확인",
      h("button", { class: "btn small", type: "button", id: "sendGo", text: sendBusy ? "보내는 중…" : `결석 ${p.picked.size}명 보내기`,
        disabled: (sendBusy || !p.picked.size) ? "" : null, onclick: () => doSend() }),
      h("button", { class: "text-btn", type: "button", text: "그만두기", onclick: () => { sendPlan = null; renderBook(); } })], sendConfirm());
  }
  const rows = lessons.map(x => h("li", { class: "line" },
    hd("span", `${x.order}차시 ${x.title || "제목 없음"}`, [
      h("button", { class: "text-btn", type: "button", text: "결석 보내기", onclick: () => planSend(cls, x) }),
      x.date ? null : h("button", { class: "text-btn", type: "button", text: "오늘 날짜 넣기", onclick: () => putDate(x) }),
      h("span", { class: "hd-note when", text: x.date || "날짜 없음" }),
      x.isOpen ? h("span", { class: "hd-note tag cls", text: "열림" }) : h("span", { class: "hd-note tag", text: "닫힘" })], "ttl", "top")));
  return panel(["호클래스 차시", h("p", { class: "tip", text: "결석을 보내면 호클래스에서 그 차시 성적 영역이 미달성으로 고정됩니다. 지각과 조퇴는 성적과 상관없으니 보내지 않습니다." })],
    h("ul", { class: "lines" }, ...rows));
}
async function putDate(x) {
  if (sendBusy) return;
  sendBusy = true;
  try {
    const ok = await fillLessonDate(FB, x.clId, todayKey());
    toast(ok ? "차시 날짜를 넣었습니다" : "이미 날짜가 적혀 있습니다");
    await loadHcLessons();
  } catch (e) { toast("날짜를 넣지 못했습니다"); }
  finally { sendBusy = false; renderBook(); }
}
async function planSend(cls, x) {
  const day = x.date || todayKey();
  await fetchAtt(attKeyOf(day, cls));
  const v = attValueOf(day, cls), list = rosterOf(cls);
  const kinds = (st) => entriesOf(v, st.id).map(e => e.k);
  // 그날 그 반 수업 출결(교시별)에서 결석한 학생, 그리고 담임 출결에서 결석인 학생.
  // shortcut: 담임 출결은 사유와 상관없이 결석만 보낸다(전처럼). 출석인정 결석을 뺄지는 따로 정하기로 했다(2026-11-13).
  const sessAbs = new Set(sessOf(cls).filter(s => s.at === day).flatMap(absOf));
  const absent = list.filter(st => sessAbs.has(st.id) || kinds(st).includes("결석"));
  const other = list.filter(st => !absent.includes(st) && kinds(st).length);
  sendPlan = { cls, x, day, absent, other, picked: new Set(absent.map(st => st.id)) };
  nbTab.lesson = "prog"; renderNb();
}
function sendConfirm() {
  const p = sendPlan;
  const kids = [
    h("div", { class: "who" },
      h("span", { class: "nm", text: `${p.x.order}차시` }),
      h("span", { class: "meta", text: `${classLabel(p.cls)} ${p.day}` })),
  ];
  if (!p.absent.length) {
    kids.push(noneLine("그날 그 반에 결석으로 적은 학생이 없습니다."));
  } else {
    kids.push(h("div", { class: "stu-pick" }, ...p.absent.map(st => h("button", {
      type: "button", "aria-pressed": String(p.picked.has(st.id)),
      onclick: () => { if (p.picked.has(st.id)) p.picked.delete(st.id); else p.picked.add(st.id); renderBook(); },
    }, h("span", { class: "n", text: String(st.n) }), shownName(st) ? h("span", { class: "nm", text: st.name }) : null))));
  }
  if (p.other.length) {
    kids.push(h("div", { class: "missing", text: "지각, 조퇴 " + p.other.map(who).join(", ") + " 는 성적과 상관없어서 보내지 않습니다." }));
  }
  return h("div", { class: "lock-panel" }, ...kids);
}
async function doSend() {
  if (sendBusy || !sendPlan) return;
  const p = sendPlan;
  sendBusy = true; renderBook();
  try {
    const nos = [...p.picked];
    await setAbsent(FB, { clId: p.x.clId, courseId: p.x.courseId, lessonId: p.x.lessonId }, nos, true);
    toast(`호클래스 ${p.x.order}차시에 결석 ${nos.length}명을 보냈습니다`);
    sendPlan = null;
  } catch (e) {
    toast("보내지 못했습니다. 다시 해 보세요");
  } finally { sendBusy = false; renderBook(); }
}

/* ---------- 창(모달) ----------
   머리줄 한 줄 = 제목 | 오류 | 추가(아이콘), 닫기(아이콘). 그 아래 넣는 칸. 바깥을 누르거나 ESC 로 닫는다. */
function closeModal(id) { const m = id ? $(id) : document.querySelector(".modal-back"); if (m) m.remove(); }
function openModal({ id, title, form, err, saveLabel, saveId, closeId }) {
  closeModal();
  const back = h("div", { class: "modal-back", id,
    onclick: (e) => { if (e.target === back) closeModal(id); },
    onkeydown: (e) => { if (e.key === "Escape") closeModal(id); } },
    h("section", { class: "modal-card", role: "dialog", "aria-modal": "true", "aria-label": title },
      hd("h3", title, [err,
        h("button", { class: "btn small", type: "submit", form: form.id, id: saveId, text: "추가", "aria-label": saveLabel }),
        iconBtn("닫기", "x", () => closeModal(id), { id: closeId })]),
      form));
  document.body.append(back);
  const first = form.querySelector("input, textarea, select");
  if (first) first.focus();
}

/* ---------- 업무 ----------
   새 업무는 달력, 주간 칸에 바로 적는 계획으로 넣는다. 이 목록은 그 전에 적어 둔 업무가 남아 있을 때만 보인다(없으면 머리줄째 없다). */
function workPage() {
  const D = docs.works, items = D.value.items;
  if (!items.length) return [];
  const sorted = items.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.due !== !b.due) return a.due ? -1 : 1;
    return (a.due || "").localeCompare(b.due || "");
  });
  const lines = sorted.map(x => {
    const n = x.due ? dnum(x.due) : null, key = "work:" + x.id;
    const title = fixing(key)
      ? fixInput(key, x.title, 100, "업무", (v) => { const y = D.value.items.find(z => z.id === x.id); if (y) y.title = v; saveEnc(D); renderBook(); }, renderBook)
      : fixText("hd-t ttl", x.title, null, key, x.title, renderBook);
    return h("li", { class: "line" + (x.done ? " done" : "") },
      hd("span", title, [
        h("button", { class: "text-btn", type: "button", text: x.done ? "다시 하기" : "다 했습니다", onclick: () => { x.done = !x.done; saveEnc(D); renderBook(); } }),
        x.due ? h("span", { class: "hd-note due " + (x.done ? "far" : dueCls(n)), text: dLabel(n) }) : h("span", { class: "hd-note when", text: "기한 없음" }),
        delBtn("삭제", docBack(D), () => { D.value.items = D.value.items.filter(y => y.id !== x.id); saveEnc(D); renderBook(); })], "ttl", "top"),
      h("div", { class: "marks" },
        x.from ? h("span", { class: "tag", text: x.from }) : null,
        x.due ? h("span", { class: "when", text: dotDate(x.due) }) : null),
      x.memo ? h("div", { class: "body", text: x.memo }) : null);
  });
  const over = items.filter(x => !x.done && x.due && dnum(x.due) < 0).length;
  return [
    hd("h4", "업무", [over ? h("span", { class: "hd-note", text: "기한 지남 " + over }) : null]),
    h("ul", { class: "lines" }, ...lines),
  ];
}

/* ---------- 업무 장: 주간 계획 ---------- */
/* 월~금 다섯 칸에 그날 것을 모은다: 학사 일정, D-day, 구글 캘린더, 업무 기한, 내가 적는 계획(4단계, 2026-11-13).
   계획은 업무 문서(암호)에 plan 으로 둔다: { id, d, text, done }. */
let weekMon = "";                                     // 보는 주의 월요일, 빈 글자면 이번 주
function mondayIso(d) {
  const t = new Date(d), w = t.getDay();
  t.setDate(t.getDate() + (w === 0 ? 1 : w === 6 ? 2 : 1 - w));   // 주말에는 다음 주를 본다
  return isoOf(t);
}
const addDaysIso = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return isoOf(d); };
/* ---------- 계획: 주간, 월간이 같은 계획(docs.works.plan)을 본다. 구글 「교무수첩」 캘린더와 양쪽으로 주고받는다 ---------- */
const plansOf = () => { const W = docs.works; if (!Array.isArray(W.value.plan)) W.value.plan = []; return W.value.plan; };
// 고치면 at 을 찍는다. 구글로 보낼지는 at 과 마지막으로 맞춘 때(sat)를 견줘 plansync.js 가 정한다.
function planEdit(fn) { fn(); saveEnc(docs.works); renderNb(); planSyncSoon(); }
const planAdd = (d, text) => planEdit(() => plansOf().push({ id: uid(), d, text: text.slice(0, 100), done: false, at: Date.now() }));
const planToggle = (p) => planEdit(() => { p.done = !p.done; p.at = Date.now(); });
// 고치기를 열면 열려 있던 적는 줄은 닫는다(칸 둘이 한꺼번에 뜨지 않게)
const planFixOpen = () => { planOpen = { d: "", where: "" }; renderNb(); };
const planFixInput = (p, key, label) => fixInput(key, p.text, 100, label + " 계획",
  (v) => planEdit(() => { const x = plansOf().find(y => y.id === p.id); if (x) { x.text = v; x.at = Date.now(); } }), renderNb);
const planDel = (p) => planEdit(() => {
  const W = docs.works;
  if (p.gid) { p.del = true; p.at = Date.now(); }             // 구글에서도 지운 뒤 걷는다
  else W.value.plan = plansOf().filter(x => x.id !== p.id);
});

/* 구글 캘린더(내 다른 캘린더) 일정을 달마다 받아 둔다. 주간, 월간 칸에 보기로만 붙는다. */
const gcalMonths = new Map();                               // "2026-11" -> [{ at, items }]
function gcalOn(d) {
  const ym = d.slice(0, 7);
  if (!gcalMonths.has(ym)) { loadGcalMonth(ym); return (gcalDays.find(x => x.at === d) || {}).items || []; }
  const g = gcalMonths.get(ym).find(x => x.at === d);
  return g ? g.items : [];
}
async function loadGcalMonth(ym) {
  const keep = GCal.savedToken();
  if (!keep || gcalMonths.has(ym)) return;
  gcalMonths.set(ym, []);
  const [y, m] = ym.split("-").map(Number);
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  try { gcalMonths.set(ym, GCal.byDay(await listPicked(keep.token, { start: ym + "-01", end, max: 250 }))); renderNb(); }
  catch (e) { gcalMonths.delete(ym); }
}

/* 맞추기: 연결돼 있을 때 고친 뒤 잠깐 있다가, 연결한 때, 그리고 2분마다 */
let planKicked = false, planBusy = false, planAgain = false, planErr = "", planAt = 0, planT = 0;
const expired = (e) => /401|invalid_token|Invalid Credentials/i.test((e && (e.code || e.message)) || "");
function planSyncSoon() { clearTimeout(planT); planT = setTimeout(() => planSync(), 1500); }
async function planSync() {
  const keep = GCal.savedToken(), W = docs.works;
  if (!keep || !W || !W.ready || keyStateNow() !== "open") return;
  if (planBusy) { planAgain = true; return; }
  planBusy = true; planErr = "";
  const startedAt = Date.now(), token = keep.token;
  try {
    const cal = await GCal.ensureCalendar(token, state.gcalCal || "");
    if (cal !== state.gcalCal) { state.gcalCal = cal; save(true); }
    const from = addDaysIso(todayKey(), -180), to = addDaysIso(todayKey(), 400);
    const r = mergePlans(plansOf(), await GCal.listCal(token, cal, { from, to }), { now: startedAt, from, to });
    const byId = new Map(r.plans.map(p => [p.id, p]));
    for (const o of r.ops) {
      const p = byId.get(o.id);
      try {
        if (o.op === "insert") { const g = await GCal.insertEv(token, cal, p); p.gid = g.gid; p.gat = g.updated; p.sat = p.at || startedAt; }
        else if (o.op === "patch") { const g = await GCal.patchEv(token, cal, p.gid, p); p.gat = g.updated; p.sat = p.at; }
        else { await GCal.deleteEv(token, cal, p.gid); byId.delete(o.id); }
      } catch (e) {
        planErr = GCal.why(e).msg;
        if (expired(e)) { GCal.forgetToken(); break; }
      }
    }
    W.value.plan = reconcile(plansOf(), [...byId.values()], startedAt);
    saveEnc(W);
    planAt = Date.now();
  } catch (e) {
    planErr = GCal.why(e).msg;
    if (expired(e)) GCal.forgetToken();
  } finally {
    planBusy = false;
    renderNb(); if (setOpen) renderSet();
    if (planAgain) { planAgain = false; planSyncSoon(); }
  }
}
setInterval(() => { if (document.visibilityState !== "hidden") planSync(); }, 120000);

/* 계획 줄 상태: 연결 단추(기능)와 구글과 맞춘 때, 안 보낸 것(안내). 머리줄(hd)에 넘기는 조각 둘이다. */
function planStatus(pre = "") {
  // 잠금을 풀고 처음 계획 화면을 열 때 한 번 맞춘다(그 뒤로는 2분마다, 고친 뒤에)
  if (!planKicked && GCal.savedToken()) { planKicked = true; planSyncSoon(); }
  const linked = !!GCal.savedToken(), n = unsent(plansOf());
  const txt = !signedIn ? "" : planErr ? planErr
    : !linked ? (n ? `구글 캘린더에 아직 안 보낸 계획 ${n}건` : "구글 캘린더와 이어지지 않았습니다")
    : planBusy ? "구글 「교무수첩」 캘린더와 맞추는 중"
    : planAt ? `구글 「교무수첩」 캘린더와 맞춤 (${new Date(planAt).toTimeString().slice(0, 5)})` + (n ? `, 보낼 것 ${n}건` : "") : "";
  return [
    signedIn ? h("button", { class: "text-btn", type: "button", id: pre + "planSyncBtn", disabled: planBusy || gcalBusy,
      text: linked ? "지금 맞추기" : "구글 캘린더 연결",
      onclick: async () => { if (linked) planSync(); else { await gcalConnect(); planSync(); } } }) : null,
    txt ? h("span", { class: "hd-note", id: pre + "planSync", text: txt }) : null,
  ];
}

/* 칸을 누르면 그 칸에 적는 줄이 열린다(월간 칸이면 "mo", 주간 칸이면 "wk"). 머리줄 + 아이콘도 같은 일을 한다(오늘, 고른 날). */
let planOpen = { d: "", where: "" };
const planInId = (d, where) => (where === "mo" ? "moplan_" : where === "wg" ? "wgplan_" : "plan_") + d;
function openPlanEdit(d, where) {
  planOpen = { d, where };
  if (where === "mo") { monthPick = d; weekMon = rowMonday(d); }
  renderNb();
  const el = $(planInId(d, where));
  if (el) el.focus();
}
function planInput(d, where, label) {
  const id = planInId(d, where);
  const input = h("input", { type: "text", id, maxlength: "100", autocomplete: "off", "aria-label": label + " 계획",
    onkeydown: (e) => { if (e.key === "Escape") { planOpen = { d: "", where: "" }; renderNb(); } },
    // 비운 채 다른 데를 누르면 닫는다. 적고 나서 다시 그린 경우는 같은 칸에 커서가 돌아와 있으므로 그대로 둔다.
    onblur: () => setTimeout(() => {
      const a = document.activeElement;
      if ((a && a.id === id) || input.value.trim()) return;
      if (planOpen.d === d && planOpen.where === where) { planOpen = { d: "", where: "" }; renderNb(); }
    }, 150) });
  return h("form", { class: "wk-add", onsubmit: (e) => {
    e.preventDefault();
    const t = input.value.trim(); if (!t) return;
    planAdd(d, t);
    const again = $(id); if (again) again.focus();
  } }, input);
}
const isEditing = (d, where) => planOpen.d === d && planOpen.where === where;
const tapOpen = (d, where) => (e) => { if (!e.target.closest("button, input, form, a")) openPlanEdit(d, where); };

/* 하루 칸: 학사 일정, D-day, 구글 일정, 업무 기한(보기만)과 내 계획(적고, 체크, 지우기). */
function dayPanel(d, label, opts = {}) {
  const W = docs.works, today = todayKey(), off = offName(d);
  const ev = [
    ...(state.cal || []).filter(x => x.d === d).map(x => h("li", { class: "wk-ev wk-cal" + (OFF_RE.test(x.name) ? " wk-off" : "") }, h("span", { class: "tag", text: "학사" }), x.name)),
    ...state.ddays.filter(x => x.date === d).map(x => h("li", { class: "wk-ev wk-dday" }, h("span", { class: "tag", text: "D-day" }), x.title)),
    ...gcalOn(d).map(x => h("li", { class: "wk-ev wk-gcal" }, h("span", { class: "tag", text: x.allDay ? "종일" : x.time }), x.title)),
    ...W.value.items.filter(x => x.due === d).map(x => h("li", { class: "wk-ev wk-due" + (x.done ? " done" : "") }, h("span", { class: "tag", text: "기한" }), x.title)),
  ];
  const mine = livePlans(plansOf()).filter(p => p.d === d);
  return h("section", { class: "wk-day" + (d === today ? " today" : "") + (off ? " wk-offday" : "") + (isEditing(d, "wk") ? " editing" : ""), "data-day": d,
    "aria-label": label + " 칸, 누르면 적습니다", onclick: tapOpen(d, "wk") },
    h("h4", { class: "wk-head" }, ...opts.head, d === today ? h("span", { class: "tag", text: "오늘" }) : null),
    isEditing(d, "wk") ? planInput(d, "wk", label) : null,
    ev.length ? h("ul", { class: "wk-evs" }, ...ev) : null,
    h("ul", { class: "wk-plan" }, ...mine.map(p => {
      const chk = h("button", { class: "check", type: "button", "aria-pressed": String(!!p.done), "aria-label": p.done ? "다시 하기" : "다 했음", onclick: () => planToggle(p) });
      chk.innerHTML = CHECK;
      const key = "plan:" + p.id + ":wk";
      return h("li", { class: "todo" + (p.done ? " done" : "") + (fixing(key) ? " fixing" : "") }, chk,
        fixing(key) ? h("form", { class: "wk-add", onsubmit: (e) => e.preventDefault() }, planFixInput(p, key, label))
          : fixText("todo-text", (p.t ? p.t + " " : "") + p.text, null, key, p.text, planFixOpen),
        h("button", { class: "del", type: "button", "aria-label": "삭제", text: "×", onclick: () => planDel(p) }));
    })));
}

/* 업무 장 주간 계획(선생님 지시 2026-11-13). 월~금 다섯 칸. */
function weekView() {
  const thisMon = mondayIso(new Date()), mon = weekMon || thisMon;
  const days = [0, 1, 2, 3, 4].map(i => addDaysIso(mon, i));
  const md = (iso) => `${+iso.slice(5, 7)}월 ${+iso.slice(8)}일`;
  return [
    hd("h4", "주간 계획", [
      h("div", { class: "att-nav" },
        navBtn("앞 주", CHEV_L, () => { weekMon = addDaysIso(mon, -7); renderNb(); }),
        h("span", { class: "att-date wk-range", id: "wkRange", text: `${md(days[0])} ~ ${md(days[4])}` }),
        navBtn("다음 주", CHEV_R, () => { weekMon = addDaysIso(mon, 7); renderNb(); })),
      mon === thisMon ? null : h("button", { class: "text-btn", type: "button", id: "wkThis", text: "이번 주", onclick: () => { weekMon = ""; monthPick = ""; renderNb(); } })]),
    h("div", { class: "wk-grid", id: "wkGrid" }, ...days.map((d, i) => dayPanel(d, WD5[i] + "요일",
      { head: [h("span", { class: "wd", text: WD5[i] }), h("span", { class: "md", text: md(d) })] }))),
  ];
}

/* 업무 장 월간 계획. 달력 칸에는 그날 것을 짧게, 누른 날이 든 주가 아래 주간 계획에 열린다. 주간과 같은 계획이다. */
let monthYm = "", monthPick = "";
const WD7 = ["일", "월", "화", "수", "목", "금", "토"];
// 달력 줄(일~토)의 월요일. 일요일은 다음 날, 토요일은 닷새 전.
const rowMonday = (d) => addDaysIso(d, 1 - parseDate(d).getDay());
function monthView() {
  const today = todayKey(), ym = monthYm || today.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const pick = monthPick;
  const shiftYm = (n) => { const d = new Date(y, m - 1 + n, 1); monthYm = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; renderNb(); };
  const lead = new Date(y, m - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h("div", { class: "mo-cell blank" }));
  for (let day = 1; day <= last; day++) {
    const d = `${ym}-${pad(day)}`, wd = (lead + day - 1) % 7;
    const marks = [
      ...(state.cal || []).filter(x => x.d === d).map(x => ({ c: OFF_RE.test(x.name) ? "off" : "cal", t: x.name })),
      ...state.ddays.filter(x => x.date === d).map(x => ({ c: "dday", t: x.title })),
      ...gcalOn(d).map(x => ({ c: "gcal", t: x.title })),
      ...docs.works.value.items.filter(x => x.due === d).map(x => ({ c: "due", t: x.title })),
      ...livePlans(plansOf()).filter(p => p.d === d).map(p => ({ c: "plan" + (p.done ? " done" : ""), t: p.text })),
    ];
    cells.push(h("div", { class: "mo-cell" + (d === today ? " today" : "") + (d === pick ? " pick" : "") + (wd === 0 ? " sun" : wd === 6 ? " sat" : "") + (offName(d) ? " offday" : ""),
      role: "button", tabindex: "0", "data-day": d, "aria-pressed": String(d === pick), "aria-label": `${m}월 ${day}일 ${marks.length}건, 누르면 적습니다`,
      onclick: tapOpen(d, "mo"), onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openPlanEdit(d, "mo"); } } },
      h("span", { class: "mo-num", text: String(day) }),
      isEditing(d, "mo") ? planInput(d, "mo", `${m}월 ${day}일`) : null,
      ...marks.slice(0, 3).map(x => h("span", { class: "mo-ev " + x.c, text: x.t })),
      marks.length > 3 ? h("span", { class: "mo-more", text: `외 ${marks.length - 3}` }) : null));
  }
  // 머리줄 한 줄: 월간 계획 | 달 넘김, 이번 달, 지금 맞추기 | 구글과 맞춘 때 | 업무 추가 아이콘
  return [
    hd("h4", "월간 계획", [
      h("div", { class: "att-nav" },
        navBtn("앞 달", CHEV_L, () => shiftYm(-1)),
        h("span", { class: "att-date", id: "moRange", text: `${y}년 ${m}월` }),
        navBtn("다음 달", CHEV_R, () => shiftYm(1))),
      ym === today.slice(0, 7) ? null : h("button", { class: "text-btn", type: "button", id: "moThis", text: "이번 달", onclick: () => { monthYm = ""; monthPick = ""; weekMon = ""; renderNb(); } }),
      ...planStatus(),
      iconBtn("업무 추가", "plus", () => {
        // 고른 날이 있으면 그날, 없으면 오늘. 주간 칸에 있는 날(평일)은 주간 칸에서, 주말은 달력 칸에서 적는다.
        const d = monthPick || todayKey(), w = parseDate(d).getDay();
        monthYm = d.slice(0, 7);
        if (w === 0 || w === 6) openPlanEdit(d, "mo");
        else { weekMon = rowMonday(d); openPlanEdit(d, "wk"); }
      }, { id: "woAdd" })]),
    h("div", { class: "mo-grid", id: "moGrid" }, ...WD7.map((w, i) => h("div", { class: "mo-wd" + (i === 0 ? " sun" : i === 6 ? " sat" : ""), text: w })), ...cells),
  ];
}

/* 대시보드 주간 계획 위젯: 오늘이 든 주 일~토 일곱 칸(일, 토는 좁게). 학사 일정, D-day, 구글 일정은 늘 보이고
   내 계획과 업무 기한은 교무수첩이 열려 있을 때만 보인다(계획은 암호 문서다). 열려 있으면 칸을 눌러 그 칸에 바로 적는다. */
function renderWeekPlan() {
  const box = $("wplan");
  if (!box) return;
  const today = todayKey(), sun = addDaysIso(today, -parseDate(today).getDay());
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(sun, i));
  const W = docs.works, open = !!(W && W.ready && keyStateNow() === "open");
  const md = (iso) => `${+iso.slice(5, 7)}.${+iso.slice(8)}`;
  $("wplanAside").textContent = `${md(days[0])} ~ ${md(days[6])}` + (open ? "" : ", 교무수첩을 열면 계획이 보입니다");
  box.replaceChildren(...days.map((d, i) => {
    const items = [
      ...(state.cal || []).filter(x => x.d === d).map(x => ({ c: OFF_RE.test(x.name) ? "off" : "cal", t: x.name })),
      ...state.ddays.filter(x => x.date === d).map(x => ({ c: "dday", t: x.title })),
      ...gcalOn(d).map(x => ({ c: "gcal", t: (x.allDay ? "" : x.time + " ") + x.title })),
      ...(open ? W.value.items.filter(x => x.due === d).map(x => ({ c: "due" + (x.done ? " done" : ""), t: x.title })) : []),
      ...(open ? livePlans(plansOf()).filter(p => p.d === d).map(p => ({ c: "plan" + (p.done ? " done" : ""), t: (p.t ? p.t + " " : "") + p.text, p })) : []),
    ];
    const li = (x) => {
      if (!x.p) return h("li", { class: "mo-ev " + x.c, text: x.t, title: x.t });
      const key = "plan:" + x.p.id + ":wg";
      if (fixing(key)) return h("li", { class: "wp-fix" }, h("form", { class: "wk-add", onsubmit: (e) => e.preventDefault() }, planFixInput(x.p, key, WD7[i] + "요일")));
      return h("li", { class: "mo-ev " + x.c }, fixText("wp-tx", x.t, x.t, key, x.p.text, planFixOpen));
    };
    return h("div", { class: "wp-day" + (i === 0 ? " we sun" : i === 6 ? " we sat" : "") + (d === today ? " today" : "") + (open ? " can" : ""),
      "data-day": d, onclick: open ? tapOpen(d, "wg") : null },
      h("div", { class: "wp-head" }, h("b", { text: WD7[i] }), h("span", { text: md(d) })),
      open && isEditing(d, "wg") ? planInput(d, "wg", WD7[i] + "요일") : null,
      h("ul", { class: "wp-list" }, ...items.map(li)));
  }));
}

/* 업무 장 한 화면: 월간 달력과 주간 닷새가 스크롤 없이 한 화면(.pw-fit). 옛 업무가 남아 있으면 그 목록이 아래. 오늘은 달력과 주간 둘 다 칠한다. */
function planWorkView() {
  return [
    h("div", { class: "pw-fit" },
      h("div", { class: "pw-sec pw-month" }, ...monthView()),
      h("div", { class: "pw-sec pw-week" }, ...weekView())),
    ...workPage(),
  ];
}

/* ---------- 할 일 ---------- */
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';
// q 가 없는 옛 할 일은 0번 칸에 둔다.
const QUADS = [
  { q: 0, name: "중요 긴급", c: "q0" },
  { q: 1, name: "중요 여유", c: "q1" },
  { q: 2, name: "일반 긴급", c: "q2" },
  { q: 3, name: "일반 여유", c: "q3" },
];
const todoQ = (t) => [0, 1, 2, 3].includes(t.q) ? t.q : 0;
function renderTodos() {
  // 다른 기기에서 고친 것이 들어와 다시 그려도 쓰던 글을 잃지 않게 한다.
  const act = document.activeElement;
  const typing = act && act.classList && act.classList.contains("q-in") ? { q: act.dataset.q, v: act.value } : null;
  // 자리는 늘 잡아 둔다. hidden 으로 지우면 머리글 높이가 바뀌어 칸이 들썩였다.
  $("clearDone").classList.toggle("off", !state.todos.some(t => t.done));
  const cells = QUADS.map((Q) => {
    const mine = state.todos.filter(t => todoQ(t) === Q.q);
    const ordered = [...mine.filter(t => !t.done), ...mine.filter(t => t.done)];
    const list = h("ul", { class: "q-list" }, ...ordered.map((t) => {
      const chk = h("button", { class: "check", type: "button", "aria-label": t.done ? "완료 취소" : "완료로 표시", "aria-pressed": String(!!t.done), onclick: () => { t.done = !t.done; save(); renderTodos(); } });
      chk.innerHTML = CHECK;
      const key = "todo:" + t.id;
      const tx = fixing(key)
        ? fixInput(key, t.text, 200, "할 일", (v) => { const x = state.todos.find(y => y.id === t.id); if (x) x.text = v; save(); renderTodos(); }, renderTodos)
        : fixText("q-tx", t.text, t.text, key, t.text, renderTodos, { onclick: (e) => { if (Date.now() - todoDropAt < 400) return; e.stopPropagation(); startFix(key, t.text, renderTodos); } });
      const li = h("li", {
        class: "q-todo" + (t.done ? " done" : "") + (fixing(key) ? " fixing" : ""), "data-id": t.id,
        onpointerdown: (e) => todoDown(e, t.id, li),
        oncontextmenu: (e) => { if (todoDrag) e.preventDefault(); },
      }, chk, tx,
        h("button", { class: "del", type: "button", "aria-label": `${t.text} 삭제`, text: "×", onclick: () => { state.todos = state.todos.filter(x => x.id !== t.id); save(); renderTodos(); } }));
      return li;
    }), h("li", { class: "q-more", "aria-hidden": "true" }));   // "외 N개". trimTodos() 가 켠다
    const inp = h("input", { type: "text", class: "q-in", "data-q": String(Q.q), maxlength: "200", autocomplete: "off", "aria-label": `${Q.name}에 할 일 더하기` });
    const form = h("form", { class: "q-add", onsubmit: (e) => {
      e.preventDefault();
      const v = inp.value.trim(); if (!v) return;
      state.todos.push({ id: uid(), text: v.slice(0, 200), done: false, q: Q.q });
      inp.value = ""; save(); renderTodos();
      const again = document.querySelector(`#todoQuad .q-in[data-q="${Q.q}"]`); if (again) again.focus();
    } }, inp, h("button", { class: "q-plus", type: "submit", "aria-label": `${Q.name}에 더하기`, text: "+" }));
    return h("div", { class: "q-cell " + Q.c, "data-q": String(Q.q) },
      h("div", { class: "q-head" }, h("span", { class: "q-name", text: Q.name })), list, form);
  });
  $("todoQuad").replaceChildren(...cells);
  if (typing) {
    const again = document.querySelector(`#todoQuad .q-in[data-q="${typing.q}"]`);
    if (again) { again.value = typing.v; again.focus(); }
  }
}

// 마우스는 조금 움직이면 집고, 손가락은 꾹 눌러야 집는다(먼저 움직이면 스크롤).
const HOLD_MS = 280, MOVE_PX = 6;
let todoDrag = null, todoDropAt = 0;               // 끌어 놓은 때. 놓으면서 글을 눌러도 고치기로 열지 않는다
function todoDown(e, id, li) {
  if (e.button > 0 || e.target.closest("button, input")) return;
  todoEnd();
  const r = li.getBoundingClientRect();
  todoDrag = { id, li, pid: e.pointerId, mouse: e.pointerType === "mouse", x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, live: false, ghost: null, over: null, timer: null };
  if (!todoDrag.mouse) todoDrag.timer = setTimeout(todoLift, HOLD_MS);
}
function todoLift() {
  const d = todoDrag;
  if (!d || d.live || !d.li.isConnected) return;
  d.live = true;
  const r = d.li.getBoundingClientRect();
  const wg = d.li.closest(".wg");
  const z = (wg && parseFloat(getComputedStyle(wg).zoom)) || 1;
  const copy = d.li.cloneNode(true);
  copy.style.width = (r.width / z) + "px";
  copy.style.zoom = String(z);
  d.ghost = h("div", { class: "q-ghost" }, copy);
  document.body.append(d.ghost);
  d.li.classList.add("lifted");
  try { if (!d.mouse && navigator.vibrate) navigator.vibrate(12); } catch (_) {}
  todoGhost();
}
function todoGhost() {
  const d = todoDrag;
  if (!d || !d.ghost) return;
  d.ghost.style.transform = `translate(${d.x - d.ox}px, ${d.y - d.oy}px)`;
  const at = document.elementFromPoint(d.x, d.y);
  const cell = at && at.closest ? at.closest("#todoQuad .q-cell") : null;
  if (cell !== d.over) {
    if (d.over) d.over.classList.remove("over");
    d.over = cell;
    if (cell) cell.classList.add("over");
  }
}
function todoEnd() {
  const d = todoDrag;
  if (!d) return;
  clearTimeout(d.timer);
  if (d.ghost) d.ghost.remove();
  if (d.over) d.over.classList.remove("over");
  if (d.li) d.li.classList.remove("lifted");
  todoDrag = null;
}
document.addEventListener("pointermove", (e) => {
  const d = todoDrag;
  if (!d || e.pointerId !== d.pid) return;
  d.x = e.clientX; d.y = e.clientY;
  if (!d.live) {
    if (Math.hypot(d.x - d.x0, d.y - d.y0) <= MOVE_PX) return;
    if (d.mouse) todoLift(); else { todoEnd(); return; }
  }
  todoGhost();
});
document.addEventListener("pointerup", (e) => {
  const d = todoDrag;
  if (!d || e.pointerId !== d.pid) return;
  const q = d.live && d.over ? Number(d.over.dataset.q) : null;
  const t = state.todos.find(x => x.id === d.id);
  if (d.live) todoDropAt = Date.now();
  todoEnd();
  if (t && q != null && todoQ(t) !== q) { t.q = q; save(); renderTodos(); }
});
document.addEventListener("pointercancel", () => todoEnd());
// 집은 뒤에는 손가락을 움직여도 화면이 스크롤되지 않게 한다.
document.addEventListener("touchmove", (e) => { if (todoDrag && todoDrag.live) e.preventDefault(); }, { passive: false });
$("clearDone").addEventListener("click", () => { state.todos = state.todos.filter(t => !t.done); save(); renderTodos(); });

/* ---------- D-day ---------- */
function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function renderDdays() {
  if (booted) renderWeekPlan();
  const list = $("ddayList");
  const t0 = parseDate(todayKey());
  const items = allDdays();
  if (!items.length) { list.replaceChildren(h("li", { class: "empty", text: "일정이 없습니다." })); return; }
  list.replaceChildren(...items.map((x) => {
    const dt = parseDate(x.date);
    const diff = Math.round((dt - t0) / 86400000);
    const label = diff === 0 ? "D-DAY" : diff > 0 ? `D-${diff}` : `D+${-diff}`;
    const cls = (diff === 0 ? " today" : diff < 0 ? " past" : "") + (x.src ? " cal" : "");
    return h("li", { class: "dday" + cls },
      h("span", { class: "d", text: label }),
      h("div", null,
        h("div", { class: "t" }, x.title, x.src ? h("span", { class: "src", text: x.src }) : null),
        h("div", { class: "dt", text: `${dt.getFullYear()}.${pad(dt.getMonth() + 1)}.${pad(dt.getDate())} (${WD[dt.getDay()]})` })),
      x.src ? null : h("button", { class: "del", type: "button", "aria-label": `${x.title} 삭제`, text: "×", onclick: () => { state.ddays = state.ddays.filter(y => y.id !== x.id); save(); renderDdays(); } }));
  }));
  if (state.calAt) list.append(h("li", { class: "cal-src", text: `나이스 학사 일정 ${state.calSchool ? state.calSchool + " " : ""}${state.calAt.slice(0, 10)} 받음` }));
}
/* D-day 추가는 창으로(위젯 아래에 넣는 칸을 두지 않는다). index.html 에 박힌 단추도 아이콘으로 */
iconize($("ddayAdd"), "D-day 추가");
iconize($("clearDone"), "완료 항목 삭제");
$("ddayAdd").addEventListener("click", () => {
  const nameIn = h("input", { type: "text", id: "ddayName", maxlength: "60", autocomplete: "off" });
  const dateIn = h("input", { type: "date", id: "ddayDate" });
  const err = h("p", { class: "form-err", role: "alert" });
  const form = h("form", { class: "book-form", id: "ddayForm", onsubmit: (e) => {
    e.preventDefault();
    const title = nameIn.value.trim(), date = dateIn.value;
    if (!title) { err.textContent = "일정 이름을 적어 주세요."; nameIn.focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { err.textContent = "날짜를 골라 주세요."; dateIn.focus(); return; }
    state.ddays.push({ id: uid(), title: title.slice(0, 60), date });
    save(); renderDdays(); closeModal("ddayModal");
  } }, h("div", { class: "form-grid" }, h("label", { class: "field wide" }, "일정 이름", nameIn), field("날짜", dateIn)));
  openModal({ id: "ddayModal", title: "D-day 추가", form, err, saveLabel: "D-day 추가", saveId: "ddaySave", closeId: "ddayClose" });
});

/* ---------- 메모 ---------- */
const memoEl = $("memo");
let memoTimer = null;
memoEl.addEventListener("input", () => {
  state.memo = memoEl.value;
  $("memoStatus").textContent = "입력 중…";
  clearTimeout(memoTimer);
  memoTimer = setTimeout(() => { save(); $("memoStatus").textContent = "저장됨"; }, 600);
});
function renderMemo() { if (document.activeElement !== memoEl) memoEl.value = state.memo; }

/* ---------- 시작 ---------- */
function renderAll() {
  const now = new Date();
  applyGrid();
  renderGcal();
  renderLinks(); renderTodos(); renderDdays(); renderMemo(); renderMeal(); renderWeekPlan(); softClass();
  renderPeriods(now); renderTT(); renderNow(now);
  fitCards(true);
}
plainDocs.forEach(attach);
attach(C);
openYearDocs();
booted = true;
renderAll(); renderClass(); tick();
setInterval(tick, 1000);
setSync("", "연결 중");
window.__deskReady = true;   // index.html 의 안내가 이걸 본다
step("화면 다 불러옴");
connect();
