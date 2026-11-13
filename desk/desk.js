import { FB } from "./fb-desk.js";
import * as GCal from "./gcal.js";
import * as Neis from "./neis.js";
import { icon as svgIc, resolveIcon } from "../shared/icons.js";
import { WIDGETS, widgetDef, DEFAULT_GRID, DEFAULT_PAGES, MAX_PAGES, GRID_MIN, GRID_MAX,
         okGrid, okPages, normalize, pagesIn, hits, freeSlot, turnOn, moveToPage,
         cellSize, moved } from "./grid.js";
import { loadHoclass, loadLessons, loadSubmissions, setAbsent, fillLessonDate,
         nameChanges, snapshotNames, clsToRoom, studentNoOf } from "./hoclass.js";

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
  return el;
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
/* 08:50 시작, 45분 수업, 10분 쉬는 시간, 4교시 뒤 1시간 점심. widget.js 의 것과 같아야 한다(시험이 지킨다) */
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
  { id: uid(), text: "'학년도 설정'에서 담임 반과 수업 반 넣기", done: false, q: 0 },
  { id: uid(), text: "기말고사, 방학식 날짜를 D-day에 등록하기", done: false, q: 1 },
];

const academicYear = (d = new Date()) => d.getMonth() >= 2 ? d.getFullYear() : d.getFullYear() - 1;
const clone = (x) => JSON.parse(JSON.stringify(x));
const arr = (x) => Array.isArray(x) ? x : null;

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
  ttExample: true,
  idleMin: 15,
  year: { configured: false, current: academicYear(), years: {} },
  grid: { ...DEFAULT_GRID },
  pages: DEFAULT_PAGES,
  layout: normalize(null, DEFAULT_GRID, DEFAULT_PAGES),
  school: "",
  neis: { key: "", school: null, subject: "" },   // 나이스에서 받아오기
  cal: [], calSchool: "", calAt: "",
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
const lessonsOf = (cls) => hcLessons[cls] || [];
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
function picked() {
  const list = cardClasses();
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
    pick: () => ({ links: state.links, officials: true, bells: state.bells, lunchAfter: state.lunchAfter, tt: state.tt.flat(), ttExample: state.ttExample, idleMin: state.idleMin, school: state.school, neis: state.neis }),
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
      state.ttExample = !!s.ttExample;
      if ([5, 15, 30, 60].includes(s.idleMin)) state.idleMin = s.idleMin;
      if (typeof s.school === "string") state.school = s.school.slice(0, 40);
      if (s.neis && typeof s.neis === "object") {
        const n = s.neis, sc = n.school;
        state.neis = {
          key: typeof n.key === "string" ? n.key : "",
          subject: typeof n.subject === "string" ? n.subject.slice(0, 20) : "",
          school: sc && typeof sc.atpt === "string" && typeof sc.code === "string"
            ? { name: String(sc.name || ""), atpt: sc.atpt, code: sc.code, kind: String(sc.kind || "") } : null,
        };
      }
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
      state.pages = okPages(s.pages || pagesIn(s.layout));
      state.layout = normalize(s.layout, state.grid, state.pages);
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
  yearOpen = y; attDay = ""; attCls = ""; docs.att = null; activeCollect = null; pickedCls = "";
  attCache.clear(); attLoaded = ""; todayAttLoaded = "";
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
const settingsDoc = () => plainDocs[SPECS.findIndex(s => s.key === "desk_settings")] || null;
function afterPlain() {
  /* apply() 가 put() 바로 뒤에 sliceJson 을 새로 적어 "이미 저장됨"으로 봐 버린다.
     끼워 넣은 업무포털과 나이스를 남기려면 그 값을 비우고 save() 를 불러야 한다. */
  if (addOfficials) {
    addOfficials = false;
    const d = settingsDoc();
    if (d) { d.sliceJson = ""; save(true); }
  }
  if (booted) applyGrid();
  openYearDocs();
  if (booted) renderAll();
  if (signedIn && state.year.configured && !hc && !hcBusy) loadHc();
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
async function lockNow() {
  if (!dataKey) return;
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
  rosterOpen = false; activeCollect = null;
  renderRoster(); renderClass();
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
  } catch (e) {
    const w = GCal.why(e);
    gcalErr = w.msg; gcalStep = w.step;
  } finally { gcalBusy = false; renderGcal(); }
}
async function gcalLoad(tokenMaybe) {
  const keep = GCal.savedToken();
  const token = tokenMaybe || (keep && keep.token);
  if (!token) { gcalDays = []; return; }
  try {
    gcalDays = GCal.byDay(await GCal.listEvents(token, { days: 21, max: 30 }));
    gcalAt = Date.now(); gcalErr = ""; gcalStep = 0;
  } catch (e) {
    const w = GCal.why(e);
    gcalErr = w.msg; gcalStep = w.step; gcalDays = [];
    if (w.step === 0 && /만료/.test(w.msg)) GCal.forgetToken();
  }
}
function renderGcal() {
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
  const next = Math.max(1, Math.min(okPages(state.pages), p));
  if (next === curPage) return;
  curPage = next;
  applyGrid(); renderPagebar();
}
function applyGrid() {
  const g = okGrid(state.grid);
  state.pages = okPages(state.pages);
  if (curPage > state.pages) curPage = state.pages;
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
  const kids = [
    h("button", { class: "pg-arrow", type: "button", "aria-label": "앞 장", html: CHEV_L, onclick: () => gotoPage(curPage - 1) }),
    h("div", { class: "pg-dots" }, ...Array.from({ length: n }, (_, i) => h("button", {
      class: "pg-dot" + (i + 1 === curPage ? " cur" : ""), type: "button",
      "data-page": String(i + 1), "aria-label": pageName(i + 1),
      title: pageName(i + 1), onclick: () => gotoPage(i + 1),
    }))),
    h("button", { class: "pg-arrow", type: "button", "aria-label": "다음 장", html: CHEV_R, onclick: () => gotoPage(curPage + 1) }),
  ];
  if (arranging) {
    kids.push(h("span", { class: "pg-name", text: pageName(curPage) }));
    if (n < MAX_PAGES) kids.push(h("button", { class: "pg-add", type: "button", "aria-label": "장 더하기", text: "+", onclick: () => addPage() }));
    if (n > 1) kids.push(h("button", { class: "pg-del", type: "button", "aria-label": "이 장 지우기", text: "×", onclick: () => delPage() }));
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
  if (off.length) {
    pageList.push(h("h4", { class: "set-sub", text: "쓰지 않는 위젯" }));
    pageList.push(h("p", { class: "set-state", text: off.map(d => d.name).join(", ") }));
  }
  return setSec("화면 배치", [
    setBlock("칸 수", [
      h("div", { class: "set-grid" },
        setField("가로 칸", colIn),
        setField("세로 칸", rowIn),
        h("div", { class: "field" }, " ",
          h("button", { class: "btn small", type: "button", text: "바꾸기", onclick: apply }))),
    ]),
    setBlock("장마다 넣을 위젯", [
      h("div", { class: "set-row" }, pgSel,
        h("button", { class: "btn small secondary", type: "button", text: "장 더하기", onclick: () => addPage() }),
        h("button", { class: "btn small secondary", type: "button", text: "이 장 지우기", onclick: () => delPage() })),
      ...pageList,
    ]),
  ], err, [
    h("button", { class: "btn small secondary", type: "button", text: arranging ? "배치 끝내기" : "배치 시작", onclick: () => { setArrange(!arranging); renderSet(); } }),
    armed("되돌리기", "기본 배치로 되돌리기", () => {
      state.grid = { ...DEFAULT_GRID };
      state.pages = DEFAULT_PAGES; curPage = 1;
      state.layout = normalize(null, state.grid, state.pages);
      save(true); applyGrid(); renderSet();
      toast("기본 배치로 되돌렸습니다");
    }),
  ]);
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
  if (GCal.savedToken()) gcalLoad().then(renderGcal);
  renderGcal();
  setSync("", "연결 중");
  const loadTimer = setTimeout(() => { if (!C.confirmed) setSync("warn", "저장소에 연결하는 중입니다. 그동안 이 브라우저에 저장됩니다."); }, 10000);
  for (const d of allDocs()) subscribe(d);
  const wait = setInterval(() => { if (C.confirmed) { clearTimeout(loadTimer); clearInterval(wait); refreshSync(); softClass(); } }, 300);
}
async function signOutNow() {
  await lockNow();
  for (const d of allDocs()) { if (d.unsub) d.unsub(); d.unsub = null; d.ref = null; }
  cloud = null; signedIn = null;
  GCal.forgetToken(); gcalDays = []; gcalErr = "";
  try { await FB.signOut(FB.auth); } catch (e) {}
  showGate();
}
$("gateForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("gateBtn");
  btn.disabled = true; $("gateErr").textContent = "";
  step("로그인 보냄");
  try {
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

if (window.__TAURI__ && window.__TAURI__.window) {
  $("toWidget").hidden = false;
  $("toWidget").addEventListener("click", async () => {
    try { await window.__TAURI__.window.getCurrentWindow().hide(); } catch (e) {}
  });
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

/* hard = true 면 1배부터 다시 잰다(칸을 옮기거나 창 크기가 바뀐 때).
   hard 가 아니면 모자랄 때만 줄이고, 자리가 생겼으면 조금씩 되돌린다(글 하나 지웠을 때). */
function fitCard(wg, hard) {
  const card = wg.firstElementChild;
  if (!card) return;
  const todos = wg.dataset.w === "todos";
  if (todos) trimTodos(card, false);                             // 숨겼던 줄을 다 꺼내 놓고 잰다
  // 시계 칸은 글을 CSS 비례(cqw/cqh)로만 키운다. 여기서 또 줄이면(--z) 둘이 밀당해 크기가 떨린다.
  if (wg.dataset.w === "clock") { wg.style.removeProperty("--z"); return; }
  if (isStacked()) { wg.style.removeProperty("--z"); return; }   // 폰, 세워 둔 태블릿은 칸이 내용만큼 늘어난다
  if (hard) wg.style.removeProperty("--z");
  let z = hard ? 1 : (parseFloat(wg.style.getPropertyValue("--z")) || 1);
  for (let i = 0; i < FIT_TRIES; i++) {
    const r = clipOverflow(card);
    if (r > 1.002) {
      if (z <= FIT_MIN) break;                                   // 더 줄일 수 없으면 거기까지
      z = Math.max(FIT_MIN, z / r);
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
  FB.onAuthStateChanged(FB.auth, (user) => {
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
    ensureAtt(k); renderDdays(); renderClass(); loadMeal();
  }
  if (dataKey && Date.now() - lastActive > state.idleMin * 60000) lockNow();
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
  const items = [];
  for (let i = 0; i < 7; i++) {
    const b = state.bells[i];
    const s = toMin(b.s), e = toMin(b.e);
    const cls = ["period"];
    if (!row[i].trim()) cls.push("free");
    if (e <= m) cls.push("past"); else if (s <= m && m < e) cls.push("current");
    items.push(h("li", { class: cls.join(" ") },
      h("span", { class: "p", text: `${i + 1}교시` }),
      h("span", { class: "tm", text: `${b.s}~${b.e}` }),
      h("span", { class: "c", text: row[i].trim() || "공강" })
    ));
    if (i + 1 === state.lunchAfter) {
      const ls = toMin(b.e), le = toMin(state.bells[i + 1].s);
      items.push(h("li", { class: "period lunch" + (ls <= m && m < le ? " current" : le <= m ? " past" : "") },
        h("span", { class: "p", text: "" }), h("span", { class: "tm", text: `${b.e}~${state.bells[i + 1].s}` }), h("span", { class: "c", text: "점심시간" })));
    }
  }
  list.replaceChildren(...items);
}

/* ---------- 주간 시간표 ---------- */
const WD5 = ["월", "화", "수", "목", "금"];
/* 위젯은 보기만, 설정 창 시간표 탭은 고치기. 같은 함수가 둘 다 그린다. */
function ttRows(edit) {
  const now = new Date(), di = dayIdx(now), m = now.getHours() * 60 + now.getMinutes();
  /* "교시"와 "(오늘)"을 따로 감싸 둔다. 아주 좁은 칸에서는 desk.css 가 접어 "1", "목"만 남긴다. */
  const rows = [h("tr", null, h("th", { class: "ph" }, h("span", { class: "pl", text: "교시" })),
    ...WD5.map((d, i) => !edit && i === di
      ? h("th", { class: "today" }, d, h("span", { class: "td-lbl", text: " (오늘)" }))
      : h("th", { text: d })))];
  for (let p = 0; p < 7; p++) {
    const b = state.bells[p];
    const ph = edit
      ? h("th", { class: "ph" }, h("div", null, `${p + 1}교시`), h("div", { class: "bell" },
          h("input", { type: "time", value: b.s, "aria-label": `${p + 1}교시 시작`, onchange: (e) => { b.s = e.target.value; state.ttExample = false; save(); renderTT(); renderPeriods(); } }),
          h("input", { type: "time", value: b.e, "aria-label": `${p + 1}교시 끝`, onchange: (e) => { b.e = e.target.value; state.ttExample = false; save(); renderTT(); renderPeriods(); } })))
      : h("th", { class: "ph" }, `${p + 1}`, h("span", { class: "pl", text: "교시" }), h("span", { class: "tm", text: `${b.s}~${b.e}` }));
    const cells = [0, 1, 2, 3, 4].map((d) => {
      const v = state.tt[d][p];
      if (edit) {
        return h("td", null, h("input", { type: "text", value: v, maxlength: "12", "aria-label": `${WD5[d]} ${p + 1}교시`,
          oninput: (e) => { state.tt[d][p] = e.target.value; state.ttExample = false; save(); renderTT(); } }));
      }
      const cls = [];
      if (!v.trim()) cls.push("empty-cell");
      if (d === di) { cls.push("todaycol"); if (v.trim() && toMin(b.s) <= m && m < toMin(b.e)) cls.push("nowcell"); }
      return h("td", { class: cls.join(" "), text: v.trim() });
    });
    rows.push(h("tr", null, ph, ...cells));
    if (p + 1 === state.lunchAfter) rows.push(h("tr", { class: "lunch" }, h("td", { colspan: "6", text: "점심" })));
  }
  return rows;
}
function renderTT() { $("tt").replaceChildren(...ttRows(false)); }
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
  const startIn = h("input", { type: "time", value: /^d{1,2}:d{2}$/.test(B[0].s) ? B[0].s : "08:50", "aria-label": "1교시 시작" });
  const clsIn = num(pick(toMin(B[0].e) - toMin(B[0].s), 1, 120, 45), "수업 시간");
  const brkIn = num(pick(toMin(B[1].s) - toMin(B[0].e), 0, 60, 5), "쉬는 시간");
  const lunchIn = num(pick(toMin(B[la].s) - toMin(B[la - 1].e), 0, 180, 60), "점심시간");
  const fill = h("button", { class: "btn small", type: "button", text: "채우기", onclick: () => {
    const cls = Number(clsIn.value), brk = Number(brkIn.value), lunch = Number(lunchIn.value);
    if (!ok(toMin(startIn.value), 0, 1439) || !ok(cls, 1, 120) || !ok(brk, 0, 60) || !ok(lunch, 0, 180)) {
      toast("시정을 확인해 주세요"); return;
    }
    state.bells = makeBells(startIn.value, cls, brk, lunch, la);
    state.ttExample = false; save();
    renderTT(); renderPeriods(); renderNow(new Date()); renderSet();
    toast("시정을 채웠습니다");
  } });
  return h("div", { class: "tt-bells" },
    startIn, h("span", { text: "시작" }),
    clsIn, h("span", { text: "분 수업" }),
    brkIn, h("span", { text: "분 쉬는 시간" }),
    lunchIn, h("span", { text: "분 점심시간" }), fill);
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

/* 위젯에는 누를 타일만 둔다. 더하고 지우는 것은 설정 창의 바로가기 탭에서 한다. */
function renderLinks() {
  linksEl.replaceChildren(...state.links.map(l => {
    const label = linkLabel(l);
    return h("a", { class: "link", href: l.url, target: "_blank", rel: "noopener" },
      linkIcon(l, label),
      h("span", { class: "nm", text: label }));
  }));
}

/* ---------- 설정: 주간 시간표 ---------- */
function ttSection() {
  return setSec("주간 시간표", [
    setBlock("시정", [bellForm()]),
    setBlock("시간표", [h("div", { class: "tt-scroll" }, h("table", { class: "tt", id: "ttSet" }, ...ttRows(true)))]),
  ]);
}

/* ---------- 설정: 바로가기 ---------- */
const linkDraft = { name: "", url: "", mode: "icon", ic: ICON_PICK[0] };
function draftIcon() {
  if (linkDraft.mode === "none") return "";
  if (linkDraft.mode === "favicon") return "favicon";
  return linkDraft.ic || ICON_PICK[0];
}
function linksSection() {
  const rows = state.links.map(l => h("div", { class: "lk-row" },
    linkIcon(l, linkLabel(l)),
    h("div", { class: "lk-txt" }, h("b", { text: linkLabel(l) }), h("span", { text: l.url })),
    h("button", { class: "btn secondary small", type: "button", text: "삭제", onclick: () => {
      state.links = state.links.filter(x => x.id !== l.id);
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
    setBlock("사이트 추가", [
      h("form", { class: "set-form", id: "linkForm", onsubmit: (e) => {
        e.preventDefault();
        const url = normalizeUrl($("linkUrl").value);
        if (!url) { $("linkUrl").setCustomValidity("주소를 다시 넣어 주세요."); $("linkUrl").reportValidity(); return; }
        state.links.push({ id: uid(), name: linkDraft.name.trim().slice(0, 30), url, icon: draftIcon() });
        linkDraft.name = ""; linkDraft.url = "";
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
        linkDraft.mode === "favicon" ? h("p", { class: "set-state", text: "사이트가 쓰는 그림을 가져옵니다. 그림이 없는 사이트는 첫 글자가 나옵니다." }) : null,
        linkDraft.mode === "none" ? h("p", { class: "set-state", text: "이름의 첫 글자가 나옵니다." }) : null,
        h("div", { class: "set-row" }, h("button", { class: "btn", type: "submit", text: "추가" }))),
    ]),
  ]);
}

/* ---------- 학년도 설정 ---------- */
let setOpen = false;
function guardForm(btn, errEl, fn) {
  return async (e) => {
    e.preventDefault();
    errEl.textContent = "";
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "처리 중";
    try { await fn(); }
    catch (x) { errEl.textContent = (x && x.message) || "처리하지 못했습니다. 다시 시도해 주세요."; }
    finally { btn.disabled = false; btn.textContent = label; }
  };
}
function passField(id, label, auto) {
  return h("label", { class: "field" }, label, h("input", { type: "password", id, autocomplete: auto }));
}
const SET_TABS = [
  { key: "year", name: "학년도" },
  { key: "links", name: "바로가기" },
  { key: "tt", name: "시간표" },
  { key: "grid", name: "화면" },
  { key: "neis", name: "나이스" },
  { key: "back", name: "백업" },
  { key: "pass", name: "비밀번호" },
];
let setTab = "year", setPage = 1;
let mealToday = null;          // 오늘 급식 { day, list }
function closeSet() { setOpen = false; renderSet(); }
const setField = (name, el) => h("label", { class: "field" }, name, el);
/* 묶음마다 소제목과 테두리를 둬서 빽빽하지 않게 (선생님 지시 2026-11-12) */
const setBlock = (title, kids) => h("div", { class: "set-block" },
  h("h4", { class: "set-sub", text: title }), ...kids.filter(Boolean));
function setSec(title, body, err, foot) {
  return h("section", { class: "set-sec" },
    h("h3", { text: title }),
    ...(Array.isArray(body) ? body : [body]).filter(Boolean),
    err || null,
    foot ? h("div", { class: "set-foot" }, ...foot.filter(Boolean)) : null);
}

function renderSet() {
  const p = $("setPanel"), scrim = $("setScrim");
  p.hidden = !setOpen;
  scrim.hidden = !setOpen;
  if (!setOpen) { p.replaceChildren(); return; }
  const tabs = SET_TABS.filter(t => t.key !== "pass" || (C.body && C.body.pass));
  if (!tabs.some(t => t.key === setTab)) setTab = "year";
  p.replaceChildren(
    h("div", { class: "set-head" },
      h("h2", { class: "set-title", id: "setTitle", text: "설정" }),
      h("button", { class: "set-x", type: "button", id: "setClose", title: "닫기", "aria-label": "닫기", text: "×", onclick: closeSet })),
    h("div", { class: "set-tabs" }, ...tabs.map(t => h("button", {
      class: "set-tab", type: "button", "aria-pressed": String(t.key === setTab),
      "data-tab": t.key, text: t.name,
      onclick: () => { setTab = t.key; renderSet(); },
    }))),
    setTab === "links" ? linksSection()
      : setTab === "tt" ? ttSection()
      : setTab === "grid" ? gridSection()
      : setTab === "neis" ? neisSection()
      : setTab === "back" ? backupSection()
      : setTab === "pass" ? passSection()
      : yearSection());
}

/* 학년도 설정: 학년도를 고르거나 더하고, 그 해의 담임 반과 수업 반을 정한다.
   반은 글로 적지 않고 고르게 한다(선생님 지시 2026-11-12). */
/* 숫자를 직접 쓴다(선생님 지시 2026-11-12 "드롭다운 말고 n학년 n반 의 n을 쓸 수 있게"). */
function numIn(value, aria) {
  return h("input", { type: "text", inputmode: "numeric", maxlength: "2", "aria-label": aria, value: String(value || "") });
}
function classSel(id, value, onRemove) {
  const m = /^(\d+)-(\d+)$/.exec(value || "");
  const g = numIn(m ? m[1] : "", "학년"), r = numIn(m ? m[2] : "", "반");
  const box = h("div", { class: "cls-pick", id: id || false },
    g, h("span", { text: "학년" }), r, h("span", { text: "반" }),
    onRemove ? h("button", { class: "x", type: "button", title: "이 반 빼기", "aria-label": "이 반 빼기", text: "×", onclick: onRemove }) : null);
  box.read = () => {
    const a = parseInt(g.value, 10), b = parseInt(r.value, 10);
    return a > 0 && b > 0 ? a + "-" + b : "";
  };
  return box;
}

function yearSection() {
  const y = cfg();
  const years = Object.keys(state.year.years).map(Number).sort((a, b) => a - b);
  if (!years.includes(state.year.current)) years.push(state.year.current);
  const err = h("p", { class: "form-err", role: "alert" });

  /* 학년도 고르기와 더하기 */
  const chips = years.map(Y => h("button", {
    class: "cpick", type: "button", "aria-pressed": String(Y === state.year.current), "data-year": String(Y),
    text: Y + "학년도",
    onclick: () => {
      if (Y === state.year.current) return;
      state.year.current = Y;
      if (!state.year.years[Y]) state.year.years[Y] = { homeroom: "", classes: [] };
      save(true); openYearDocs();
      renderSet(); renderClass(); renderBook();
      hc = null; loadHc();
    },
  }));
  const addIn = h("input", { type: "number", id: "setYear", value: String(Math.max(...years) + 1), min: "2020", max: "2099" });
  const addBtn = h("button", { class: "btn small secondary", type: "button", id: "setYearAdd", text: "학년도 추가", onclick: () => {
    const Y = Number(addIn.value);
    if (!Number.isInteger(Y) || Y < 2020 || Y > 2099) { err.textContent = "학년도를 네 자리로 넣어 주세요."; return; }
    if (state.year.years[Y]) { err.textContent = Y + "학년도는 이미 있습니다."; return; }
    err.textContent = "";
    state.year.years[Y] = { homeroom: "", classes: [] };
    state.year.current = Y; state.year.configured = true;
    save(true); openYearDocs();
    renderSet(); renderClass(); renderBook();
    toast(Y + "학년도를 더했습니다");
  } });

  /* 담임 반: 비담임이면 반 고르개를 접는다 */
  const homeSel = h("select", { id: "setHome" },
    h("option", { value: "", text: "비담임" }),
    h("option", { value: "home", text: "담임" }));
  const homePick = classSel("setHomeCls", y.homeroom);
  const homeField = h("div", { class: "field" }, "담임 반", homePick);
  homeSel.value = y.homeroom ? "home" : "";
  homeField.hidden = !y.homeroom;
  homeSel.addEventListener("change", () => { homeField.hidden = homeSel.value !== "home"; });

  /* 수업 반: 줄을 더하고 빼며 숫자를 직접 쓴다 */
  const rows = h("div", { class: "cls-rows", id: "setClasses" });
  const addRow = (v) => {
    const row = classSel(null, v, () => { row.remove(); });
    rows.append(row);
    return row;
  };
  (y.classes || []).forEach(addRow);
  const addClsBtn = h("button", { class: "btn small secondary", type: "button", id: "setClassAdd", text: "반 더하기",
    onclick: () => { addRow(""); } });

  const schoolIn = h("input", { type: "text", id: "setSchool", value: state.school || "", maxlength: "40", autocomplete: "off" });
  const idleSel = h("select", { id: "setIdle" }, ...[5, 15, 30, 60].map(m => h("option", { value: String(m), text: m + "분" })));
  idleSel.value = String(state.idleMin);

  const form = h("form", { class: "set-form", id: "setForm", onsubmit: (e) => {
    e.preventDefault();
    const Y = state.year.current;
    const classes = [...new Set([...rows.children].map(b => b.read()).filter(Boolean))];
    state.year.years[Y] = { homeroom: homeSel.value === "home" ? homePick.read() : "", classes };
    state.year.configured = true;
    state.idleMin = Number(idleSel.value);
    state.school = schoolIn.value.trim().slice(0, 40);
    save(true);
    setOpen = false;
    openYearDocs();
    renderSet(); renderLinks(); renderClass(); renderBook();
    hc = null; loadHc();
    toast(Y + "학년도 설정을 저장했습니다");
  } },
    setBlock("학년도 고르기", [
      h("div", { class: "set-row" }, ...chips),
      h("div", { class: "set-row" }, addIn, addBtn),
    ]),
    setBlock("담임", [
      h("div", { class: "set-grid" }, homeSel, homeField),
    ]),
    setBlock("수업 반", [
      rows,
      h("div", { class: "set-row" }, addClsBtn,
        h("button", { class: "btn small secondary", type: "button", id: "setFromTT", text: "시간표에서 가져오기", onclick: () => {
          const found = parseClasses(state.tt.flat().filter(c => /^\s*\d+\s*-\s*\d+\s*$/.test(c)).join(", "))
            .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
          if (!found.length) { err.textContent = "주간 시간표에 반이 적혀 있지 않습니다."; return; }
          err.textContent = "";
          rows.replaceChildren();
          found.forEach(addRow);
        } })),
    ]),
    setBlock("그 밖에", [
      h("div", { class: "set-grid" }, setField("학교", schoolIn), setField("자동 잠금", idleSel)),
    ]),
    err,
    h("div", { class: "set-foot" },
      h("button", { class: "btn small", type: "submit", id: "setSave", text: "저장" })));
  return h("section", { class: "set-sec" }, h("h3", { text: "학년도 설정" }), form);
}

/* ---------- 나이스에서 받아오기 ---------- */
function neisSection() {
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
  const keyIn = h("input", { type: "text", id: "neisKey", value: N.key || "", autocomplete: "off", spellcheck: "false" });
  const subjIn = h("input", { type: "text", id: "neisSubject", value: N.subject || "", maxlength: "20", autocomplete: "off" });

  /* 학교 찾기 */
  const findIn = h("input", { type: "text", id: "neisFind", value: (N.school && N.school.name) || state.school || "", autocomplete: "off" });
  const found = h("div", { class: "set-row", id: "neisFound" });
  const pickSchool = (s) => {
    state.neis = { ...state.neis, school: { name: s.name, atpt: s.atpt, code: s.code, kind: s.kind } };
    if (!state.school) state.school = s.name;
    save(true); renderSet();
    mealToday = null; loadMeal();
    toast(s.name + "으로 정했습니다");
  };
  const findBtn = doBtn("neisFindBtn", "학교 찾기", async () => {
    const list = await Neis.findSchools(findIn.value.trim(), keyIn.value.trim());
    if (!list.length) { err.textContent = "그 이름의 학교를 찾지 못했습니다."; return; }
    found.replaceChildren(...list.slice(0, 8).map(s => h("button", {
      class: "cpick", type: "button", text: s.name + " (" + s.office.replace("교육청", "") + ")",
      onclick: () => pickSchool(s),
    })));
  });

  const school = N.school;
  const now = new Date();
  const kids = [
    setBlock("인증키", [
      h("div", { class: "set-grid" }, setField("나이스 인증키", keyIn), setField("내 과목", subjIn)),
      h("div", { class: "set-row" },
        h("button", { class: "btn small", type: "button", id: "neisSave", text: "저장", onclick: () => {
          state.neis = { ...state.neis, key: keyIn.value.trim(), subject: subjIn.value.trim().slice(0, 20) };
          save(true); renderSet(); toast("저장했습니다");
        } }),
        h("a", { class: "text-btn", href: "https://open.neis.go.kr", target: "_blank", rel: "noopener", text: "인증키 받으러 가기" })),
    ]),
    setBlock("학교", [
      h("div", { class: "set-row" }, findIn, findBtn),
      found,
      h("p", { class: "set-state", text: school ? school.name + " " + school.kind + " (" + school.atpt + " " + school.code + ")" : "학교를 아직 정하지 않았습니다." }),
    ]),
  ];
  if (school) {
    kids.push(setBlock("받아오기", [
      h("div", { class: "set-row" },
        doBtn("neisCal", "학사 일정", async () => {
          const list = await Neis.loadSchedule(school, state.year.current, N.key);
          if (!list.length) { err.textContent = "그 학년도의 학사 일정이 없습니다."; return; }
          state.cal = list.map(x => ({ d: x.d, name: x.name })).slice(0, 400);
          state.calSchool = school.name;
          state.calAt = new Date().toISOString();
          save(true); renderDdays(); renderCalBox();
          note.textContent = list.length + "건을 받았습니다." + (list.short ? " " + Neis.KEY_HINT : "");
        }),
        doBtn("neisTT", "이번 주 시간표", async () => {
          const classes = (cfg().classes || []).slice();
          if (!classes.length && cfg().homeroom) classes.push(cfg().homeroom);
          if (!classes.length) { err.textContent = "학년도 설정에서 수업 반이나 담임 반을 먼저 넣어 주세요."; return; }
          const tt = await Neis.loadMyWeek(school, state.year.current, Neis.semesterOf(now),
            Neis.mondayOf(now), classes, N.subject, N.key);
          const n = tt.flat().filter(Boolean).length;
          if (!n) { err.textContent = "그 주에 내 과목 수업을 찾지 못했습니다. 과목 이름을 확인해 주세요."; return; }
          state.tt = tt; state.ttExample = false;
          save(true); renderTT(); renderPeriods(); renderNow(new Date());
          note.textContent = n + "칸을 채웠습니다." + (tt.short ? " " + Neis.KEY_HINT : "");
        }),
        doBtn("neisMeal", "오늘 급식", async () => {
          const list = await Neis.loadMeal(school, todayKey().replace(/-/g, ""), N.key);
          mealToday = { day: todayKey(), list };
          renderBook();
          note.textContent = list.length ? list.map(m => m.kind + ": " + m.dishes.join(", ")).join(" / ") : "오늘 급식이 없습니다.";
        })),
      h("p", { class: "set-state", text: "학사 일정은 D-day 에, 시간표는 주간 시간표에, 급식은 교무수첩 오늘 화면에 들어갑니다." }),
    ]));
  }
  kids.push(note);
  return setSec("나이스에서 받아오기", kids, err);
}

/* 비밀번호 바꾸기 */
function passSection() {
  const cur = h("input", { type: "password", id: "chgCur", autocomplete: "current-password" });
  const err = h("p", { class: "form-err", role: "alert" });
  const btn = h("button", { class: "btn small", type: "submit", id: "chgSave", text: "바꾸기" });
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
      passField("chgNew2", "새 비밀번호 확인", "new-password")),
    err,
    h("div", { class: "set-foot" }, btn));
  return h("section", { class: "set-sec" }, h("h3", { text: "비밀번호" }), form);
}

/* ---------- 우리 반 ---------- */
let classTab = "att", activeCollect = null, rosterOpen = false, recoverMode = false;
let hideNames = false;
try { hideNames = localStorage.getItem(LS_PREFIX + "hideNames") === "1"; } catch (e) {}
const STATUSES = ["", "결석", "지각", "조퇴"];
function studentsAll() {
  const v = docs.roster && docs.roster.value;
  const c = v && v.classes && v.classes[picked()];
  return c && Array.isArray(c.students) ? c.students : [];
}
function attMarks() {
  const v = docs.att.value;
  if (!v.marks || typeof v.marks !== "object") v.marks = {};
  attCache.set(docs.att.key, v);
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

document.querySelectorAll("#classSeg button").forEach(b => b.addEventListener("click", () => {
  classTab = b.dataset.tab;
  document.querySelectorAll("#classSeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  renderClass();
}));
$("calPaste").addEventListener("click", () => { calOpen = !calOpen; renderCalBox(); });
$("rosterBtn").addEventListener("click", () => { rosterOpen = !rosterOpen; renderRoster(); });
$("lockBtn").addEventListener("click", () => { lockNow(); });
$("hideBtn").addEventListener("click", () => {
  hideNames = !hideNames;
  try { localStorage.setItem(LS_PREFIX + "hideNames", hideNames ? "1" : "0"); } catch (e) {}
  renderClass();
});

function renderRoster() {
  const box = $("rosterEditor");
  const can = keyStateNow() === "open" && !!picked() && !hcHas(picked()) && !!docs.roster && docs.roster.ready;
  if (!can) rosterOpen = false;
  box.hidden = !rosterOpen;
  $("rosterBtn").textContent = rosterOpen ? "닫기" : "명단 편집";
  if (!rosterOpen) { box.replaceChildren(); return; }
  const list = roster();
  const lines = [];
  for (const s of list) lines[s.n - 1] = s.name;
  const cntIn = h("input", { type: "number", id: "rCount", value: String(list.length ? Math.max(...list.map(s => s.n)) : 28), min: "1", max: "60" });
  const ta = h("textarea", { id: "rNames", value: Array.from(lines, x => x || "").join("\n") });
  box.replaceChildren(h("div", { class: "roster-editor" },
    h("div", { class: "row" }, h("label", { class: "grow" }, "반", h("input", { type: "text", value: classLabel(picked()), disabled: true })), h("label", null, "학생 수", cntIn)),
    h("label", null, "학생 이름 (붙여넣기 가능)", ta),
    h("div", { class: "row" },
      h("button", { class: "btn small", type: "button", id: "rSave", text: "저장", onclick: () => {
        const names = ta.value.split(/\r?\n/).map(s => s.replace(/^\s*\d+[.)\s]*/, "").trim());
        while (names.length && !names[names.length - 1]) names.pop();
        const count = Math.max(1, Math.min(60, Math.max(Number(cntIn.value) || 1, names.length)));
        saveRoster(names.slice(0, 60), count);
        rosterOpen = false; renderRoster(); renderClass(); toast("명단을 저장했습니다");
      } }),
      h("button", { class: "btn small secondary", type: "button", text: "취소", onclick: () => { rosterOpen = false; renderRoster(); } }))));
}
function saveRoster(names, count) {
  // 번호가 바뀌어도 같은 학생의 기록이 이어지도록 이전 명단과 맞춰 고유 ID를 유지한다.
  const prev = studentsAll().filter(s => !s.gone), used = new Set(), slots = new Array(count).fill(null);
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
  const next = slots.map((id, i) => ({ id: id || studentNoOf(picked(), i + 1), no: i + 1, name: nameAt(i) }));
  const gone = studentsAll().filter(s => s.gone || !used.has(s.id)).map(s => ({ ...s, gone: true }));
  const v = docs.roster.value;
  v.classes = v.classes || {};
  v.classes[picked()] = { students: [...next, ...gone] };
  saveEnc(docs.roster);
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
    h("h3", { text: "잠겨 있습니다" }),
    h("p", { text: "명단과 출결을 보려면 비밀번호를 넣어 주세요." }),
    passField("unlockPass", "비밀번호", "current-password"),
    err,
    h("div", { class: "row" }, btn, h("button", { class: "text-btn", type: "button", id: "recoverLink", text: "비밀번호를 잊었습니다", onclick: () => { recoverMode = true; renderClass(); } })))];
}
const openSetBtn = () => h("button", { class: "btn small", type: "button", text: "학년도 설정 열기", onclick: () => { setTab = "year"; setOpen = true; renderSet(); } });

function softClass() {
  if (!booted) return;
  const a = document.activeElement;
  const typing = (id) => a && $(id).contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  const ks = keyStateNow();
  if (!typing("classBody") && !(ks === lastKs && (ks === "none" || ks === "locked" || ks === "recovery"))) renderClass();
  if (!typing("bookBody")) renderBook();
}
let lastKs = "";
function renderPick(list, pick) {
  const home = cfg().homeroom;
  $("classPick").replaceChildren(...list.map(c => h("button", {
    class: "cpick", type: "button", "aria-pressed": String(c === pick),
    onclick: () => goClass(c),
  }, c, c === home ? h("span", { class: "hr", text: "담임" }) : null)));
}
function renderClass() {
  const ks = keyStateNow(), open = ks === "open", home = cfg().homeroom;
  const list = cardClasses(), pick = picked(), tabs = open && !!pick;
  lastKs = ks;
  $("classTitle").textContent = pick && pick !== home ? "수업 반" : "우리 반";
  $("className").textContent = pick ? classLabel(pick) : state.year.configured ? "반 없음" : "설정 전";
  $("classPick").hidden = !(open && list.length > 1);
  if (open && list.length > 1) renderPick(list, pick);
  $("classSeg").hidden = !tabs;
  $("rosterBtn").hidden = !tabs || hcHas(pick);
  $("hideBtn").hidden = !open;
  $("lockBtn").hidden = !open;
  $("hideBtn").textContent = hideNames ? "이름 보이기" : "이름 가리기";
  const body = $("classBody");
  const note = (text) => [h("p", { class: "empty", text })];
  if (ks === "loading") { body.replaceChildren(...note("저장소를 확인하는 중입니다.")); return; }
  if (ks === "unsupported") { body.replaceChildren(...note("이 화면에서는 암호화를 쓸 수 없습니다. 학생 정보를 저장하지 않도록 명단과 출결을 닫아 두었습니다. 다른 브라우저에서 열어 주세요.")); return; }
  if (ks === "offline") { body.replaceChildren(...note("저장소에 연결되지 않아 보호 비밀번호를 만들 수 없습니다. " + (syncNote || "인터넷 연결을 확인해 주세요."))); return; }
  if (ks === "none") { body.replaceChildren(...setupView()); return; }
  if (ks === "recovery") { body.replaceChildren(...recoveryView()); return; }
  if (ks === "locked") { body.replaceChildren(...unlockView()); return; }
  const rollover = state.year.configured && academicYear() > state.year.current
    ? h("p", { class: "hint", text: `${academicYear()}학년도가 시작됐습니다. '학년도 설정'에서 담임 반과 수업 반을 새로 넣어 주세요.` }) : null;
  const banner = warnBanner();
  const hcNote = hcErr ? h("p", { class: "hint", text: hcErr })
    : (hcBusy && !hc) ? h("p", { class: "tip", text: "호클래스 명단을 읽는 중입니다." }) : null;
  const head = [rollover, banner, hcNote].filter(Boolean);
  const wrap = (kids) => body.replaceChildren(...[...head, ...kids]);
  if (!state.year.configured) { wrap([h("div", { class: "lock-panel" }, h("h3", { text: "담임 반과 수업 반을 넣어 주세요" }), h("div", { class: "row" }, openSetBtn()))]); return; }
  ensureAtt(todayKey(), pick);
  if (!pick) { wrap([h("div", { class: "lock-panel" }, h("h3", { text: "이 학년도에 들어가는 반이 없습니다" }), h("p", { text: "'학년도 설정'에서 담임 반이나 수업 반을 넣으면 출결과 수합을 쓸 수 있습니다." }), h("div", { class: "row" }, openSetBtn()))]); return; }
  if (encDocs().some(d => d.broken)) { wrap(note("일부 기록을 풀지 못했습니다. 페이지를 새로고침한 뒤 다시 열어 주세요. 기록은 그대로 있습니다.")); return; }
  if (encDocs().some(d => !d.ready)) { wrap(note("기록을 여는 중입니다.")); return; }
  if (!roster().length) {
    wrap([h("div", { class: "lock-panel" }, h("h3", { text: "학생 명단이 비어 있습니다" }),
      h("p", { text: hcHas(pick) ? "호클래스 이 강의실에 학생이 아직 없습니다. 호클래스 어드민의 학생 관리에서 넣어 주세요."
        : "오른쪽 위 '명단 편집'에서 학생 이름을 붙여 넣으면 출결과 수합을 쓸 수 있습니다." }))]);
    return;
  }
  if (classTab === "att") wrap(attView());
  else if (classTab === "col") wrap(collectView());
  else wrap(noticeView());
}

function stuTile(st, cls, label, statusText, onclick, pressed) {
  const nm = shownName(st);
  return h("button", { class: "stu " + cls, type: "button", "aria-pressed": pressed, "aria-label": label, onclick },
    h("span", { class: "n", text: String(st.n) }), nm ? h("span", { class: "nm", text: nm }) : null, h("span", { class: "st", text: statusText }));
}
function attView() {
  const now = new Date(), A = docs.att, list = roster();
  const day = attMarks();
  const by = (s) => list.filter(st => day[st.id] === s);
  const absent = by("결석"), late = by("지각"), early = by("조퇴");
  const present = list.length - absent.length;
  const label = classLabel(picked());
  const sum = (cls, k2, v) => h("div", { class: "sum " + cls }, h("div", { class: "k", text: k2 }), h("div", { class: "v", text: String(v) }));
  const tiles = list.map(st => {
    const s = day[st.id] || "";
    return stuTile(st, s, `${who(st)} ${s || "출석"}. 눌러서 상태 바꾸기`, s, () => {
      const nx = STATUSES[(STATUSES.indexOf(day[st.id] || "") + 1) % STATUSES.length];
      if (nx) day[st.id] = nx; else delete day[st.id];
      saveEnc(A); renderClass();
    });
  });
  const report = () => {
    const parts = [];
    if (absent.length) parts.push(`결석 ${absent.length}명(${absent.map(who).join(", ")})`);
    if (late.length) parts.push(`지각 ${late.length}명(${late.map(who).join(", ")})`);
    if (early.length) parts.push(`조퇴 ${early.length}명(${early.map(who).join(", ")})`);
    return `${now.getMonth() + 1}월 ${now.getDate()}일 ${label} 출결: 재적 ${list.length}명, 출석 ${present}명` + (parts.length ? ", " + parts.join(", ") : ", 전원 출석");
  };
  return [
    h("div", { class: "summary" }, sum("", "출석/재적", `${present}/${list.length}`), sum("absent", "결석", absent.length), sum("late", "지각", late.length), sum("early", "조퇴", early.length)),
    h("div", { class: "students" }, ...tiles),
    h("div", { class: "row" },
      h("button", { class: "btn small", type: "button", text: "출결 요약 복사", onclick: () => copyText(report()) }),
      Object.keys(day).length ? h("button", { class: "btn small secondary", type: "button", text: "오늘 기록 비우기", onclick: (e) => {
        if (e.currentTarget.dataset.armed) { A.value.marks = {}; saveEnc(A); renderClass(); return; }
        e.currentTarget.dataset.armed = "1"; e.currentTarget.textContent = "한 번 더 누르면 초기화";
      } }) : null),
  ];
}

function collectView() {
  const D = docs.collects;
  stampCls(D);
  const list = roster(), items = D.value.items, ours = mine(items);
  if (!ours.find(c => c.id === activeCollect)) activeCollect = ours[0] ? ours[0].id : null;
  const myLessons = lessonsOf(picked());
  const colCl = h("select", { id: "colCl" }, h("option", { value: "", text: "손으로 걷기" }),
    ...myLessons.map(x => h("option", { value: x.clId, text: `${x.order}차시 ${x.title || ""}`.trim() })));
  const colPart = h("select", { id: "colPart" },
    h("option", { value: "mission", text: "미션 활동" }),
    h("option", { value: "question", text: "오늘의 질문" }),
    h("option", { value: "formative", text: "형성평가" }));
  const addForm = h("form", { class: "row", id: "colForm", onsubmit: (e) => {
    e.preventDefault();
    const t = $("colName").value.trim(); if (!t) return;
    const c = { id: uid(), title: t.slice(0, 40), got: [], cls: picked(), clId: colCl.value || "", part: colPart.value || "" };
    items.unshift(c); activeCollect = c.id; saveEnc(D); renderClass();
  } }, h("input", { type: "text", id: "colName", class: "grow", "aria-label": "새 수합 항목", maxlength: "40", autocomplete: "off" }),
    myLessons.length ? colCl : null, myLessons.length ? colPart : null,
    h("button", { class: "btn small", type: "submit", text: "추가" }));
  if (!activeCollect) return [addForm, h("p", { class: "empty", text: "수합 항목이 없습니다." })];
  const c = ours.find(x => x.id === activeCollect);
  const ids = new Set(list.map(st => st.id));
  const cntOf = (x) => {
    if (!x.clId) return x.got.filter(id => ids.has(id)).length;
    const m = subCache.get(x.clId) || {};
    return list.filter(st => m[st.id] && m[st.id][x.part || "mission"]).length;
  };
  const tabs = h("div", { class: "collect-tabs" }, ...ours.map(x => h("button", { class: "ctab", type: "button", "aria-pressed": String(x.id === activeCollect), onclick: () => { activeCollect = x.id; renderClass(); } },
    x.title, x.clId ? h("span", { class: "tag cls", text: "호클래스" }) : null, h("span", { class: "cnt", text: `${cntOf(x)}/${list.length}` }))));
  const linked = !!c.clId;
  if (linked) wantSubs(c.clId);
  const subs = linked ? (subCache.get(c.clId) || {}) : null;
  const gotSet = linked
    ? new Set(list.filter(st => subs[st.id] && subs[st.id][c.part || "mission"]).map(st => st.id))
    : new Set(c.got);
  const missing = list.filter(st => !gotSet.has(st.id));
  const tiles = list.map(st => stuTile(st, gotSet.has(st.id) ? "got" : "", `${who(st)} ${gotSet.has(st.id) ? "제출함" : "미제출"}`, gotSet.has(st.id) ? "제출" : "", () => {
    if (linked) { toast("이 항목은 호클래스 제출을 그대로 보여 줍니다"); return; }
    c.got = gotSet.has(st.id) ? c.got.filter(id => id !== st.id) : [...c.got, st.id];
    saveEnc(D); renderClass();
  }, String(gotSet.has(st.id))));
  const missText = missing.length ? `${c.title} 미제출 ${missing.length}명: ${missing.map(who).join(", ")}` : `${c.title} 전원 제출`;
  return [
    addForm, tabs,
    h("div", { class: "missing" }, missing.length ? h("b", { text: `미제출 ${missing.length}명 ` }) : h("b", { style: "color:var(--accent)", text: "전원 제출 " }), missing.length ? missing.map(st => st.n).join(", ") : ""),
    h("div", { class: "students" }, ...tiles),
    h("div", { class: "row" },
      h("button", { class: "btn small", type: "button", text: "미제출 명단 복사", onclick: () => copyText(missText) }),
      h("button", { class: "btn small secondary", type: "button", text: "이 항목 삭제", onclick: (e) => {
        if (e.currentTarget.dataset.armed) { D.value.items = items.filter(x => x.id !== c.id); activeCollect = null; saveEnc(D); renderClass(); return; }
        e.currentTarget.dataset.armed = "1"; e.currentTarget.textContent = "한 번 더 누르면 삭제";
      } })),
  ];
}

function noticeView() {
  const D = docs.notices, items = D.value.items;
  stampCls(D);
  const form = h("form", { class: "row", onsubmit: (e) => {
    e.preventDefault();
    const t = $("noticeIn").value.trim(); if (!t) return;
    items.push({ id: uid(), text: t.slice(0, 200), done: false, cls: picked() }); saveEnc(D); renderClass(); $("noticeIn") && $("noticeIn").focus();
  } }, h("input", { type: "text", id: "noticeIn", class: "grow", "aria-label": "전달사항", maxlength: "200", autocomplete: "off" }), h("button", { class: "btn small", type: "submit", text: "추가" }));
  const ours = mine(items);
  const list = ours.length ? ours.map(n => {
    const chk = h("button", { class: "check", type: "button", "aria-label": n.done ? "전달 취소" : "전달함으로 표시", "aria-pressed": String(!!n.done), onclick: () => { n.done = !n.done; saveEnc(D); renderClass(); } });
    chk.innerHTML = CHECK;
    return h("li", { class: "todo" + (n.done ? " done" : "") }, chk, h("span", { class: "todo-text", text: n.text }),
      h("button", { class: "del", type: "button", "aria-label": "삭제", text: "×", onclick: () => { D.value.items = items.filter(x => x.id !== n.id); saveEnc(D); renderClass(); } }));
  }) : [h("li", { class: "empty", text: "전달사항이 없습니다." })];
  const doneCount = ours.filter(n => n.done).length;
  return [
    form,
    h("ul", { class: "todo-list" }, ...list),
    h("div", { class: "row" },
      ours.length ? h("button", { class: "btn small", type: "button", text: "전달사항 복사", onclick: () => copyText(ours.filter(n => !n.done).map((n, i) => `${i + 1}. ${n.text}`).join("\n") || "전달할 내용이 없습니다") }) : null,
      doneCount ? h("button", { class: "btn small secondary", type: "button", text: `전달한 ${doneCount}개 지우기`, onclick: () => { D.value.items = items.filter(n => !(n.done && itemCls(n) === picked())); saveEnc(D); renderClass(); } }) : null),
  ];
}

/* ---------- 학사 일정 가져오기 ---------- */
let calOpen = false;

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

function renderCalBox() {
  const box = $("calBox");
  box.hidden = !calOpen;
  $("calPaste").textContent = calOpen ? "닫기" : "일정 붙여넣기";
  if (!calOpen) { box.replaceChildren(); return; }
  const ta = h("textarea", { id: "calText", "aria-label": "학사 일정" });
  const err = h("p", { class: "form-err", role: "alert" });
  box.replaceChildren(h("div", { class: "roster-editor" }, ta, err,
    h("div", { class: "row" },
      h("button", { class: "btn small", type: "button", id: "calAdd", text: "날짜 찾아 넣기", onclick: () => {
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
        save(true); calOpen = false; renderCalBox(); renderDdays(); renderBook();
        toast(added ? `일정 ${added}개를 넣었습니다` : "이미 들어 있는 일정입니다");
      } }),
      h("button", { class: "btn small secondary", type: "button", text: "취소", onclick: () => { calOpen = false; renderCalBox(); } }))));
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

  const fileIn = h("input", { type: "file", id: "bkFile", accept: ".json,application/json" });
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
    h("h4", { class: "set-sub", text: "내보내기" }),
    h("div", { class: "set-row" }, expBtn),
    note,
    h("h4", { class: "set-sub", text: "되돌리기" }),
    h("div", { class: "file-row" }, fileIn),
    pickNote,
    h("div", { class: "set-row" }, impBtn),
  ], err);
}

/* ---------- 교무수첩 ---------- */
let bookPage = "today", bookSid = "", attLoaded = "", attBusy = false;
const attCache = new Map();
const KINDS = ["상담", "민원"];
const WHOS = ["학생", "학부모", "교직원", "기타"];

document.querySelectorAll("#bookSeg button").forEach(b => b.addEventListener("click", () => {
  bookPage = b.dataset.page;
  renderBook();
}));

const bCls = () => picked();
function goClass(c) {
  if (pickedCls === c) return;
  pickedCls = c; bookSid = ""; rosterOpen = false; activeCollect = null; sendPlan = null;
  renderRoster(); renderClass(); renderBook();
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
    if (d.getDay() === 0 || d.getDay() === 6) continue;
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
let todayAttLoaded = "";
async function loadTodayAtt() {
  const day = todayKey(), want = day + "|" + cardClasses().join(",");
  if (todayAttLoaded === want || attBusy || !cloud || !dataKey) return;
  todayAttLoaded = want;
  for (const c of cardClasses()) {
    if (attDay === day && attCls === c) continue;
    await fetchAtt(attKeyOf(day, c));
  }
  renderBook();
}
function countFor(cls, sid, ym) {
  const out = { 결석: 0, 지각: 0, 조퇴: 0, days: 0 };
  for (const day of monthDays(ym)) {
    const key = attKeyOf(day, cls);
    const v = (attDay === day && attCls === cls && docs.att && docs.att.ready) ? docs.att.value
      : attCache.has(key) ? attCache.get(key) : undefined;
    if (v === undefined) continue;
    out.days++;
    const st = marksIn(v)[sid];
    if (st && out[st] != null) out[st]++;
  }
  return out;
}

function panel(title, ...kids) { return h("section", { class: "panel" }, h("h3", { text: title }), ...kids); }
function noneLine(text) { return h("p", { class: "empty", text }); }
function field(label, el) { return h("label", { class: "field" }, label, el); }
function clsRow(current, onpick) {
  const list = cardClasses(), home = cfg().homeroom;
  if (list.length < 2) return null;
  return h("div", { class: "class-pick" }, ...list.map(c => h("button", {
    class: "cpick", type: "button", "aria-pressed": String(c === current),
    onclick: () => onpick(c),
  }, c, c === home ? h("span", { class: "hr", text: "담임" }) : null)));
}
function armed(btn, text, run) {
  return h("button", { class: "btn small secondary", type: "button", text, onclick: (e) => {
    if (e.currentTarget.dataset.armed) { run(); return; }
    e.currentTarget.dataset.armed = "1"; e.currentTarget.textContent = "한 번 더 누르면 " + btn;
  } });
}

function renderBook() {
  if (!booted) return;
  const body = $("bookBody");
  document.querySelectorAll("#bookSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.page === bookPage)));
  const ks = keyStateNow();
  if (ks !== "open") {
    body.replaceChildren(noneLine(ks === "locked" || ks === "recovery" ? "수첩은 잠겨 있습니다. 위 '우리 반'에서 비밀번호를 넣으면 열립니다."
      : ks === "none" ? "비밀번호를 먼저 만들면 수첩을 쓸 수 있습니다."
      : "수첩을 여는 중입니다."));
    return;
  }
  if (!state.year.configured) { body.replaceChildren(noneLine("'학년도 설정'에서 담임 반과 수업 반을 넣으면 수첩을 쓸 수 있습니다.")); return; }
  if (!bookReady()) { body.replaceChildren(noneLine("기록을 여는 중입니다.")); return; }
  const kids = bookPage === "today" ? todayPage()
    : bookPage === "student" ? studentPage()
    : bookPage === "consult" ? consultPage()
    : bookPage === "lesson" ? lessonPage()
    : workPage();
  body.replaceChildren(h("div", { class: "book-cols" }, ...kids.filter(Boolean)));
}

/* ---------- 오늘 ---------- */
function todayPage() {
  const now = new Date(), st = status(now), row = todayRow(now), today = todayKey();
  const goCls = (c) => { goClass(c); toast(classLabel(c) + "으로 옮겼습니다"); };

  const classes = panel("오늘 수업", (() => {
    if (!row) return noneLine("주말에는 수업이 없습니다.");
    const kids = [];
    for (let i = 0; i < 7; i++) {
      const c = row[i].trim();
      const isNow = (st.kind === "class" || st.kind === "free") && st.i === i;
      kids.push(h("span", { class: "p", text: (i + 1) + "교시" }));
      kids.push(h("div", { class: "c" + (c ? "" : " free") + (isNow ? " now" : "") },
        h("span", { text: c || "공강" }),
        c && cardClasses().includes(c) ? h("div", { class: "row" },
          h("button", { type: "button", text: "이 반 보기", onclick: () => goCls(c) }),
          h("button", { type: "button", text: "수업 기록", onclick: () => { goClass(c); bookPage = "lesson"; renderBook(); } })) : null));
    }
    return h("div", { class: "timeline" }, ...kids);
  })());

  loadTodayAtt();
  const attToday = panel("오늘 출결", (() => {
    const rows = cardClasses().map(c => {
      const marks = marksIn(attValueOf(today, c)), list = rosterOf(c);
      const by = (s) => list.filter(x => marks[x.id] === s);
      const a = by("결석"), l = by("지각"), e = by("조퇴");
      if (!list.length) return null;
      const parts = [];
      if (a.length) parts.push("결석 " + a.map(who).join(", "));
      if (l.length) parts.push("지각 " + l.map(who).join(", "));
      if (e.length) parts.push("조퇴 " + e.map(who).join(", "));
      return h("li", { class: "line" },
        h("div", { class: "top" },
          h("span", { class: "ttl" }, h("span", { class: "tag cls", text: c }), " " + classLabel(c)),
          h("span", { class: "when", text: (list.length - a.length) + "/" + list.length })),
        parts.length ? h("div", { class: "body", text: parts.join(", ") }) : h("div", { class: "body", text: "전원 출석" }),
        h("div", { class: "marks" }, h("button", { class: "btn small secondary", type: "button", text: "이 반 보기", onclick: () => goCls(c) })));
    }).filter(Boolean);
    return rows.length ? h("ul", { class: "lines" }, ...rows) : noneLine("명단을 넣은 반이 아직 없습니다.");
  })());

  const notes = panel("오늘 전달사항", (() => {
    const items = docs.notices.value.items.filter(n => !n.done);
    if (!items.length) return noneLine("전달할 내용이 없습니다.");
    return h("ul", { class: "lines" }, ...items.map(n => h("li", { class: "line" },
      h("div", { class: "top" },
        h("span", { class: "ttl", text: n.text }),
        h("span", { class: "tag cls", text: itemCls(n) || "반 없음" })))));
  })());

  const jobs = panel("오늘 할 일과 마감", (() => {
    const todos = state.todos.filter(t => !t.done).sort((a, b) => todoQ(a) - todoQ(b)).slice(0, 6);
    const works = docs.works.value.items.filter(w => !w.done && w.due && dnum(w.due) <= 7)
      .sort((a, b) => a.due.localeCompare(b.due));
    if (!todos.length && !works.length) return noneLine("급한 일이 없습니다.");
    return h("ul", { class: "lines" },
      ...works.map(w => {
        const n = dnum(w.due);
        return h("li", { class: "line" }, h("div", { class: "top" },
          h("span", { class: "ttl", text: w.title }),
          h("span", { class: "due " + dueCls(n), text: dLabel(n) })));
      }),
      ...todos.map(t => h("li", { class: "line" }, h("div", { class: "top" }, h("span", { class: "ttl", text: t.text }), h("span", { class: "when", text: QUADS[todoQ(t)].name })))));
  })());

  const cons = panel("오늘 상담 민원", (() => {
    const items = docs.consults.value.items.filter(x => x.at === today);
    const addBtn = h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "상담 민원 적기", onclick: () => { bookPage = "consult"; renderBook(); } }));
    if (!items.length) return h("div", { class: "panel-body" }, noneLine("오늘 적은 기록이 없습니다."), addBtn);
    return h("div", null, h("ul", { class: "lines" }, ...items.map(consultLine)), addBtn);
  })());

  const meal = panel("오늘 급식", (() => {
    if (!state.neis.school) return h("div", { class: "panel-body" }, noneLine("설정의 나이스 탭에서 학교를 정하면 급식이 보입니다."));
    const list = mealToday && mealToday.day === today ? mealToday.list : null;
    if (!list) return h("div", { class: "panel-body" }, noneLine("급식을 받는 중입니다."));
    if (!list.length) return h("div", { class: "panel-body" }, noneLine("오늘 급식이 없습니다."));
    return h("ul", { class: "lines" }, ...list.map(m => h("li", { class: "line" },
      h("span", { class: "ttl", text: m.kind }),
      h("span", { class: "body", text: m.dishes.join(", ") }),
      m.kcal ? h("span", { class: "when", text: m.kcal }) : null)));
  })());

  return [classes, attToday, jobs, notes, cons, meal];
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
    renderBook();
  } catch (e) {
    mealToday = { day, list: [] };
  }
  mealBusy = false;
}

/* ---------- 학생 ---------- */
function studentPage() {
  const cls = bCls(), list = rosterOf(cls), ym = ymOf(todayKey());
  const pickRow = clsRow(cls, goClass);
  if (!list.length) return [panel("학생", pickRow, noneLine("이 반은 명단이 비어 있습니다. 위 카드의 '명단 편집'에서 넣어 주세요."))];
  if (!list.find(s => s.id === bookSid)) bookSid = "";
  const grid = h("div", { class: "stu-pick" }, ...list.map(s => h("button", {
    type: "button", "aria-pressed": String(s.id === bookSid), "aria-label": who(s),
    onclick: () => { bookSid = s.id === bookSid ? "" : s.id; renderBook(); },
  }, h("span", { class: "n", text: String(s.n) }), shownName(s) ? h("span", { class: "nm", text: s.name }) : null)));
  const left = panel("학생 고르기", pickRow, grid);
  if (!bookSid) return [left, panel("학생 기록", noneLine("학생을 골라 주세요."))];

  const st = stuOf(cls, bookSid);
  const S = docs.students, rec = S.value.byId[bookSid] || {};
  const cnt = countFor(cls, bookSid, ym);
  const loaded = attLoaded === ym + "|" + cls;
  const att = panel(ym.replace("-", "년 ") + "월 출결",
    h("div", { class: "counts" },
      h("div", { class: "count absent" }, h("div", { class: "k", text: "결석" }), h("div", { class: "v", text: String(cnt.결석) })),
      h("div", { class: "count late" }, h("div", { class: "k", text: "지각" }), h("div", { class: "v", text: String(cnt.지각) })),
      h("div", { class: "count early" }, h("div", { class: "k", text: "조퇴" }), h("div", { class: "v", text: String(cnt.조퇴) })),
      h("div", { class: "count" }, h("div", { class: "k", text: "본 날짜" }), h("div", { class: "v", text: String(cnt.days) }))),
    h("div", { class: "row" }, h("button", {
      class: "btn small" + (loaded ? " secondary" : ""), type: "button",
      text: attBusy ? "불러오는 중…" : loaded ? "다시 불러오기" : "이번 달 출결 모아 보기",
      disabled: attBusy ? "" : null,
      onclick: () => { if (loaded) for (const d of monthDays(ym)) attCache.delete(attKeyOf(d, cls)); loadMonth(ym, cls); },
    })));

  const miss = panel("수합 미제출", (() => {
    const items = docs.collects.value.items.filter(c => itemCls(c) === cls && !(c.got || []).includes(bookSid));
    return items.length ? h("ul", { class: "lines" }, ...items.map(c => h("li", { class: "line" },
      h("div", { class: "top" }, h("span", { class: "ttl", text: c.title }), h("span", { class: "tag open", text: "미제출" })))))
      : noneLine("미제출이 없습니다.");
  })());

  const mine = docs.consults.value.items.filter(x => x.sid === bookSid);
  const cons = panel("이 학생 상담 민원",
    mine.length ? h("ul", { class: "lines" }, ...mine.slice().sort((a, b) => b.at.localeCompare(a.at)).map(consultLine)) : noneLine("기록이 없습니다."),
    h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "이 학생 상담 적기", onclick: () => { bookPage = "consult"; renderBook(); } })));

  const noteEl = h("textarea", { id: "stuNote", value: rec.note || "" });
  const note = panel("학생 메모", noteEl,
    h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "저장", onclick: () => {
      S.value.byId[bookSid] = { ...rec, note: noteEl.value.trim() };
      saveEnc(S); toast("메모를 저장했습니다"); renderBook();
    } })));

  const head = panel("학생",
    h("div", { class: "who" },
      h("span", { class: "nm", text: shownName(st) ? st.name : st.n + "번" }),
      h("span", { class: "meta", text: classLabel(cls) + " " + st.n + "번" })),
    h("div", { class: "row" }, h("button", { class: "btn small secondary", type: "button", text: "출결 요약 복사", onclick: () => {
      copyText(`${classLabel(cls)} ${who(st)} ${ym} 결석 ${cnt.결석} 지각 ${cnt.지각} 조퇴 ${cnt.조퇴}`);
    } })));
  return [left, head, att, miss, cons, note];
}

/* ---------- 상담 민원 ---------- */
function consultLine(x) {
  const D = docs.consults;
  const st = x.sid ? stuOf(x.cls, x.sid) : null;
  return h("li", { class: "line" + (x.done ? " done" : "") },
    h("div", { class: "top" },
      h("span", { class: "ttl", text: x.title || (x.kind + " 기록") }),
      h("span", { class: "when", text: dotDate(x.at) })),
    h("div", { class: "marks" },
      h("span", { class: "tag " + (x.kind === "민원" ? "complaint" : "consult"), text: x.kind }),
      h("span", { class: "tag", text: x.who }),
      x.cls ? h("span", { class: "tag cls", text: x.cls + (st ? " " + who(st) : "") }) : null,
      x.done ? null : h("span", { class: "tag open", text: "진행 중" })),
    x.body ? h("div", { class: "body", text: x.body }) : null,
    x.action ? h("div", { class: "body", text: "조치: " + x.action }) : null,
    h("div", { class: "row" },
      h("button", { class: "btn small secondary", type: "button", text: x.done ? "다시 하는 중" : "마무리", onclick: () => { x.done = !x.done; saveEnc(D); renderBook(); } }),
      h("button", { class: "btn small secondary", type: "button", text: "복사", onclick: () => copyText(
        [`${x.at} ${x.kind} (${x.who}${x.cls ? ", " + x.cls + (st ? " " + who(st) : "") : ""})`, x.title, x.body, x.action ? "조치: " + x.action : ""].filter(Boolean).join("\n")) }),
      armed("삭제", "삭제", () => { D.value.items = D.value.items.filter(y => y.id !== x.id); saveEnc(D); renderBook(); })));
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
      h("label", { class: "field wide" }, "조치", actIn)),
    err,
    h("div", { class: "row" }, h("button", { class: "btn small", type: "submit", text: "기록 추가" })));

  const items = D.value.items.slice().sort((a, b) => (a.done === b.done ? b.at.localeCompare(a.at) : a.done ? 1 : -1));
  const open = items.filter(x => !x.done).length;
  const list = panel("기록 " + items.length + "건" + (open ? ", 진행 중 " + open : ""),
    items.length ? h("ul", { class: "lines" }, ...items.map(consultLine)) : noneLine("기록이 없습니다."));
  return [panel("새 기록", form), list];
}

/* ---------- 수업 ---------- */
function lessonPage() {
  const D = docs.lessons, cls = bCls();
  const pickRow = clsRow(cls, goClass);
  const now = new Date(), row = todayRow(now);
  const lessons = lessonsOf(cls);
  const mine = D.value.items.filter(x => x.cls === cls).slice().sort((a, b) => b.at.localeCompare(a.at) || b.period - a.period);
  const atIn = h("input", { type: "date", id: "leAt", value: todayKey() });
  const perIn = h("select", { id: "lePeriod" }, ...Array.from({ length: 7 }, (_, i) => h("option", { value: String(i + 1), text: (i + 1) + "교시" })));
  if (row) { const i = row.findIndex(c => c.trim() === cls); if (i >= 0) perIn.value = String(i + 1); }
  const unitIn = h("input", { type: "text", id: "leUnit", maxlength: "60", autocomplete: "off" });
  const clIn = h("select", { id: "leCl" }, h("option", { value: "", text: "고르지 않음" }),
    ...lessons.map(x => h("option", { value: x.clId, text: `${x.order}차시 ${x.title || "제목 없음"}${x.date ? " (" + x.date + ")" : ""}` })));
  clIn.addEventListener("change", () => {
    const x = lessons.find(y => y.clId === clIn.value);
    if (!x) return;
    if (x.date) atIn.value = x.date;
    if (x.title && !unitIn.value.trim()) unitIn.value = x.title;
  });
  const bodyIn = h("textarea", { id: "leBody" });
  const hwIn = h("input", { type: "text", id: "leHw", maxlength: "120", autocomplete: "off" });
  const err = h("p", { class: "form-err", role: "alert" });
  const form = h("form", { class: "book-form", id: "leForm", onsubmit: (e) => {
    e.preventDefault();
    if (!cls) { err.textContent = "'학년도 설정'에서 수업 반을 먼저 넣어 주세요."; return; }
    if (!unitIn.value.trim() && !bodyIn.value.trim()) { err.textContent = "단원이나 내용 하나는 적어 주세요."; return; }
    D.value.items.unshift({
      id: uid(), cls, at: atIn.value || todayKey(), period: Number(perIn.value),
      unit: unitIn.value.trim().slice(0, 60), body: bodyIn.value.trim().slice(0, 1000), hw: hwIn.value.trim().slice(0, 120),
      clId: clIn.value || "",
    });
    saveEnc(D); renderBook(); toast(classLabel(cls) + " 수업을 적었습니다");
  } },
    h("div", { class: "form-grid" },
      field("날짜", atIn), field("교시", perIn),
      lessons.length ? h("label", { class: "field wide" }, "호클래스 차시", clIn) : null,
      h("label", { class: "field wide" }, "단원", unitIn),
      h("label", { class: "field wide" }, "내용", bodyIn),
      h("label", { class: "field wide" }, "과제", hwIn)),
    err,
    h("div", { class: "row" }, h("button", { class: "btn small", type: "submit", text: "수업 기록 추가" })));

  const lines = mine.map(x => h("li", { class: "line" },
    h("div", { class: "top" },
      h("span", { class: "ttl", text: x.unit || "수업" }),
      h("span", { class: "when", text: dotDate(x.at) + " " + x.period + "교시" })),
    x.body ? h("div", { class: "body", text: x.body }) : null,
    x.hw ? h("div", { class: "marks" }, h("span", { class: "tag open", text: "과제" }), h("span", { class: "body", text: x.hw })) : null,
    h("div", { class: "row" },
      h("button", { class: "btn small secondary", type: "button", text: "복사", onclick: () => copyText(
        [`${x.at} ${classLabel(x.cls)} ${x.period}교시`, x.unit, x.body, x.hw ? "과제: " + x.hw : ""].filter(Boolean).join("\n")) }),
      armed("삭제", "삭제", () => { D.value.items = D.value.items.filter(y => y.id !== x.id); saveEnc(D); renderBook(); }))));

  return [
    panel("새 수업 기록", pickRow, form),
    panel(classLabel(cls) + " 기록 " + mine.length + "건", lines.length ? h("ul", { class: "lines" }, ...lines) : noneLine("기록이 없습니다.")),
    hcPanel(cls, lessons),
  ];
}

/* ---------- 호클래스 차시 칸 (연동) ---------- */
function hcPanel(cls, lessons) {
  if (!hcHas(cls)) return null;
  if (!lessons.length) return panel("호클래스 차시", noneLine("이 강의실에 연결된 차시가 없습니다. 호클래스 어드민에서 강의를 연결해 주세요."));
  if (sendPlan) return panel("결석 보내기 확인", sendConfirm());
  const rows = lessons.map(x => h("li", { class: "line" },
    h("div", { class: "top" },
      h("span", { class: "ttl", text: `${x.order}차시 ${x.title || "제목 없음"}` }),
      h("span", { class: "when", text: x.date || "날짜 없음" })),
    h("div", { class: "marks" },
      x.isOpen ? h("span", { class: "tag cls", text: "열림" }) : h("span", { class: "tag", text: "닫힘" }),
      h("button", { class: "btn small secondary", type: "button", text: "결석 보내기", onclick: () => planSend(cls, x) }),
      x.date ? null : h("button", { class: "btn small secondary", type: "button", text: "오늘 날짜 넣기", onclick: () => putDate(x) }))));
  return panel("호클래스 차시", h("ul", { class: "lines" }, ...rows),
    h("p", { class: "tip", text: "결석을 보내면 호클래스에서 그 차시 성적 영역이 미달성으로 고정됩니다. 지각과 조퇴는 성적과 상관없으니 보내지 않습니다." }));
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
  const marks = marksIn(attValueOf(day, cls));
  const list = rosterOf(cls);
  const absent = list.filter(st => marks[st.id] === "결석");
  const other = list.filter(st => marks[st.id] === "지각" || marks[st.id] === "조퇴");
  sendPlan = { cls, x, day, absent, other, picked: new Set(absent.map(st => st.id)) };
  bookPage = "lesson"; renderBook();
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
  kids.push(h("div", { class: "row" },
    h("button", {
      class: "btn small", type: "button",
      text: sendBusy ? "보내는 중…" : `결석 ${p.picked.size}명 보내기`,
      disabled: (sendBusy || !p.picked.size) ? "" : null,
      onclick: () => doSend(),
    }),
    h("button", { class: "btn small secondary", type: "button", text: "그만두기", onclick: () => { sendPlan = null; renderBook(); } })));
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

/* ---------- 업무 ---------- */
function workPage() {
  const D = docs.works, items = D.value.items;
  const titleIn = h("input", { type: "text", id: "woTitle", maxlength: "100", autocomplete: "off" });
  const dueIn = h("input", { type: "date", id: "woDue" });
  const fromIn = h("input", { type: "text", id: "woFrom", maxlength: "60", autocomplete: "off" });
  const memoIn = h("textarea", { id: "woMemo" });
  const err = h("p", { class: "form-err", role: "alert" });
  const form = h("form", { class: "book-form", id: "woForm", onsubmit: (e) => {
    e.preventDefault();
    if (!titleIn.value.trim()) { err.textContent = "업무 이름을 적어 주세요."; return; }
    D.value.items.unshift({
      id: uid(), title: titleIn.value.trim().slice(0, 100), due: dueIn.value || "",
      from: fromIn.value.trim().slice(0, 60), memo: memoIn.value.trim().slice(0, 1000), done: false,
    });
    saveEnc(D); renderBook(); toast("업무를 적었습니다");
  } },
    h("div", { class: "form-grid" },
      h("label", { class: "field wide" }, "업무", titleIn),
      field("기한", dueIn), field("출처", fromIn),
      h("label", { class: "field wide" }, "메모", memoIn)),
    err,
    h("div", { class: "row" }, h("button", { class: "btn small", type: "submit", text: "업무 추가" })));

  const sorted = items.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.due !== !b.due) return a.due ? -1 : 1;
    return (a.due || "").localeCompare(b.due || "");
  });
  const lines = sorted.map(x => {
    const n = x.due ? dnum(x.due) : null;
    return h("li", { class: "line" + (x.done ? " done" : "") },
      h("div", { class: "top" },
        h("span", { class: "ttl", text: x.title }),
        x.due ? h("span", { class: "due " + (x.done ? "far" : dueCls(n)), text: dLabel(n) }) : h("span", { class: "when", text: "기한 없음" })),
      h("div", { class: "marks" },
        x.from ? h("span", { class: "tag", text: x.from }) : null,
        x.due ? h("span", { class: "when", text: dotDate(x.due) }) : null),
      x.memo ? h("div", { class: "body", text: x.memo }) : null,
      h("div", { class: "row" },
        h("button", { class: "btn small secondary", type: "button", text: x.done ? "다시 하기" : "다 했습니다", onclick: () => { x.done = !x.done; saveEnc(D); renderBook(); } }),
        armed("삭제", "삭제", () => { D.value.items = items.filter(y => y.id !== x.id); saveEnc(D); renderBook(); })));
  });
  const left = items.filter(x => !x.done).length;
  const over = items.filter(x => !x.done && x.due && dnum(x.due) < 0).length;
  return [
    panel("새 업무", form),
    panel("업무 " + left + "건 남음" + (over ? ", 기한 지남 " + over : ""),
      lines.length ? h("ul", { class: "lines" }, ...lines) : noneLine("업무가 없습니다.")),
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
  $("clearDone").hidden = !state.todos.some(t => t.done);
  const cells = QUADS.map((Q) => {
    const mine = state.todos.filter(t => todoQ(t) === Q.q);
    const ordered = [...mine.filter(t => !t.done), ...mine.filter(t => t.done)];
    const list = h("ul", { class: "q-list" }, ...ordered.map((t) => {
      const chk = h("button", { class: "check", type: "button", "aria-label": t.done ? "완료 취소" : "완료로 표시", "aria-pressed": String(!!t.done), onclick: () => { t.done = !t.done; save(); renderTodos(); } });
      chk.innerHTML = CHECK;
      const li = h("li", {
        class: "q-todo" + (t.done ? " done" : ""), "data-id": t.id,
        onpointerdown: (e) => todoDown(e, t.id, li),
        oncontextmenu: (e) => { if (todoDrag) e.preventDefault(); },
      }, chk, h("span", { class: "q-tx", text: t.text, title: t.text }),
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
let todoDrag = null;
function todoDown(e, id, li) {
  if (e.button > 0 || e.target.closest("button")) return;
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
$("ddayForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("ddayName").value.trim(), date = $("ddayDate").value;
  if (!title) { $("ddayName").focus(); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $("ddayDate").focus(); return; }
  state.ddays.push({ id: uid(), title: title.slice(0, 60), date });
  $("ddayName").value = ""; $("ddayDate").value = ""; save(); renderDdays();
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
  renderLinks(); renderTodos(); renderDdays(); renderMemo(); softClass(); renderBook(); renderCalBox(); if (!rosterOpen) renderRoster();
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
