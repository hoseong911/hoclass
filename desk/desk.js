import { FB } from "./fb-desk.js";
import * as GCal from "./gcal.js";
import { WIDGETS, widgetDef, DEFAULT_GRID, DEFAULT_PAGES, MAX_PAGES, GRID_MIN, GRID_MAX,
         okGrid, okPages, normalize, pagesIn, hits, freeSlot, turnOn, moveToPage,
         cellSize, moved } from "./grid.js";
import { loadHoclass, loadLessons, loadSubmissions, setAbsent, fillLessonDate,
         nameChanges, snapshotNames, clsToRoom, studentNoOf } from "./hoclass.js";

const $ = (id) => document.getElementById(id);
// 로그인 칸 아래 진단 줄에 한 줄 적는다. 선생님이 콘솔을 안 열어도 보이게.
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
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids) if (c != null && c !== false) el.append(c);
  return el;
}
let toastT = null;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = h("div", { class: "toast", role: "status" }); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("복사했어요"); }
  catch (e) {
    const ta = h("textarea", { value: text, style: "position:fixed;left:-9999px" });
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove(); toast(ok ? "복사했어요" : "복사가 막혀 있어요. 직접 선택해 복사해 주세요");
  }
}

/* ---------- 일반 정보 (시간표·할 일·일정·메모): 잠금 없이 보이는 자료 ---------- */
const DEFAULT_BELLS = [
  { s: "09:00", e: "09:45" }, { s: "09:55", e: "10:40" }, { s: "10:50", e: "11:35" }, { s: "11:45", e: "12:30" },
  { s: "13:30", e: "14:15" }, { s: "14:25", e: "15:10" }, { s: "15:20", e: "16:05" },
];
const EXAMPLE_TT = [
  ["2-1", "", "2-3", "2-5", "", "2-2", ""],
  ["", "2-4", "2-1", "", "2-3", "", ""],
  ["2-2", "2-5", "", "2-4", "", "창체", "창체"],
  ["", "2-3", "2-2", "", "2-1", "2-4", ""],
  ["2-5", "", "2-4", "2-2", "", "동아리", ""],
];
const TEACHER_LINKS = () => [
  { id: uid(), name: "에듀넷·티-클리어", url: "https://www.edunet.net" },
  { id: uid(), name: "학교알리미", url: "https://www.schoolinfo.go.kr" },
  { id: uid(), name: "구글 클래스룸", url: "https://classroom.google.com" },
  { id: uid(), name: "클래스팅", url: "https://www.classting.com" },
  { id: uid(), name: "패들렛", url: "https://padlet.com" },
  { id: uid(), name: "띵커벨", url: "https://www.tkbell.co.kr" },
];
const TEACHER_TODOS = () => [
  { id: uid(), text: "주간 시간표를 내 시간표로 바꾸기", done: false },
  { id: uid(), text: "'올해 설정'에서 담임 반과 수업 반 넣기", done: false },
  { id: uid(), text: "기말고사·방학식 날짜를 D-day에 등록하기", done: false },
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
    hcErr = "호클래스 명단을 읽지 못했어요. 새로고침해 보세요.";
  } finally {
    hcBusy = false;
    renderClass(); renderBook();
  }
}
let hcLessons = {};                 // 반 → 차시 목록
const subCache = new Map();         // 차시id → { 학번: { 칸: true } }
let sendBusy = false, sendPlan = null;

async function loadHcLessons() {
  if (!hc) return;
  try { hcLessons = await loadLessons(FB, hc); } catch (e) { hcLessons = {}; }
  renderBook();
}
const lessonsOf = (cls) => hcLessons[cls] || [];
async function wantSubs(clId) {
  if (!clId || subCache.has(clId)) return;
  subCache.set(clId, {});                            // 두 번 받지 않게 먼저 자리를 잡는다
  try { subCache.set(clId, await loadSubmissions(FB, clId)); } catch (e) {}
  renderClass(); renderBook();   // 수합은 가운데 카드에 있다
}

// 호클래스가 명단을 들고 있는 반
const hcClasses = () => (hc && hc.year === String(state.year.current) ? hc.classes : []);
const hcHas = (cls) => hcClasses().includes(cls);

// 가운데 카드에서 볼 수 있는 반. 담임 반이 맨 앞, 그 뒤로 호클래스 수업 반, 그 뒤로 손으로 넣은 반.
function cardClasses() {
  const c = cfg(), out = [];
  if (c.homeroom) out.push(c.homeroom);
  for (const x of hcClasses()) if (x && !out.includes(x)) out.push(x);
  for (const x of c.classes || []) if (x && !out.includes(x)) out.push(x);
  return out;
}
let pickedCls = "";
// 지금 보고 있는 반. 설정이 바뀌어 없어진 반이면 맨 앞 반으로 돌아간다.
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
    pick: () => ({ links: state.links, bells: state.bells, lunchAfter: state.lunchAfter, tt: state.tt, ttExample: state.ttExample, idleMin: state.idleMin, school: state.school }),
    put: (s) => {
      if (arr(s.links)) state.links = s.links.filter(l => l && typeof l.url === "string");
      if (arr(s.bells) && s.bells.length === 7) state.bells = s.bells.map(b => ({ s: String(b.s || ""), e: String(b.e || "") }));
      if (Number.isInteger(s.lunchAfter)) state.lunchAfter = s.lunchAfter;
      if (arr(s.tt) && s.tt.length === 5) state.tt = s.tt.map(r => Array.from({ length: 7 }, (_, i) => String((r || [])[i] || "")));
      state.ttExample = !!s.ttExample;
      if ([5, 15, 30, 60].includes(s.idleMin)) state.idleMin = s.idleMin;
      if (typeof s.school === "string") state.school = s.school.slice(0, 40);
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
  // 칸 수와 우젯 자리. 기기마다 화면이 다르지만 한 벌로 쓴다(선생님이 바꾸면 모두 따라간다).
  { key: "desk_grid",
    pick: () => ({ grid: state.grid, pages: state.pages, layout: state.layout }),
    put: (s) => {
      state.grid = okGrid(s.grid);
      // 페이지 수가 안 적혀 있으면 자리에 적힌 가장 큰 쪽수로 센다(옛 저장본 대비).
      state.pages = okPages(s.pages || pagesIn(s.layout));
      state.layout = normalize(s.layout, state.grid, state.pages);
    } },
  // 학사일정은 바깥에서 채워 준다. 이 쪽은 읽기만 하고 그대로 돌려 쓴다.
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

/* ---------- 암호화: 비밀번호와 복구 키가 각각 같은 자료 키를 감싼다 ---------- */
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

/* ---------- 저장: 문서를 나눠서 기기끼리 덮어쓰지 않게 한다 ---------- */
const LS_PREFIX = "my-desk-v3:";
function lsGet(k) { try { const r = localStorage.getItem(LS_PREFIX + k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); } catch (e) {} }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let cloud = null, cloudFailed = false, syncNote = "";
let signedIn = null;

/* ---------- 저장 창구 ----------
   화면 코드는 논리 이름 하나(y2027_roster 같은 것)로만 말을 건다.
   어느 컬렉션의 어느 문서인지는 여기서만 안다. */
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
// 백업이 훑을 컬렉션 전부
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
// 꼬리표는 평문으로 함께 적는다. 찾기와 보안 규칙에 쓰고, 내용은 암호문이다.
function docTags(key) {
  const m = RE_ATT.exec(key);
  if (m) return { year: m[1], room: m[3], date: m[2] };
  const y = /^y(\d{4})_/.exec(key);
  return y ? { year: y[1] } : {};
}
// 파이어스토어 쪽 모양을 예전 보관함과 같게 감싼다. 그래서 화면 코드가 그대로 돈다.
const wrapSnap = (s) => ({ exists: s.exists(), data: () => s.data(), metadata: s.metadata });
function cloudRef(key) {
  const [col, id] = docPath(key);
  const ref = FB.doc(FB.db, col, id);
  return {
    get: async () => wrapSnap(await FB.getDoc(ref)),
    set: (body) => FB.setDoc(ref, body),
    onSnapshot: (next, err) => FB.onSnapshot(ref, (snap) => next(wrapSnap(snap)), err),
    // 비어 있을 때만 넣는다. 읽기와 쓰기를 한 묶음(트랜잭션)으로 해서
    // 두 기기가 동시에 만들어도 한 쪽만 들어간다.
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
function setSync(cls, text) { sync.className = "sync " + cls; sync.textContent = text; }

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

function refreshSync() {
  if (!cloud) { setSync("warn", "이 브라우저에만 저장됨"); return; }
  if (syncNote) { setSync("warn", syncNote); return; }
  if (allDocs().some(d => d.dirty || d.writing || d.pendingBody)) setSync("", "저장 중");
  else setSync("ok", "모든 기기에 저장됨");
}
function goOffline() {
  cloud = null; cloudFailed = true;
  for (const d of allDocs()) { if (d.unsub) d.unsub(); d.unsub = null; d.ref = null; }
  refreshSync(); softClass();
}
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
          d.pendingBody = null; syncNote = "저장 권한이 없어요. 다시 로그인해 주세요."; goOffline(); break;
        }
        if (code.includes("invalid-argument") || code.includes("not-found")) { d.pendingBody = null; goOffline(); break; }
        if (code.includes("resource-exhausted") || code.includes("quota")) {
          d.pendingBody = null; syncNote = "저장 공간이 가득 찼어요. 지난 기록을 줄여 주세요."; break;
        }
        setSync("warn", "저장 재시도 중");
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
  try { d.ref = cloud(d.key); } catch (e) { goOffline(); return; }
  d.unsub = d.ref.onSnapshot((snap) => {
    const { fromCache, hasPendingWrites } = snap.metadata;
    if (hasPendingWrites) return;
    if (!fromCache) d.confirmed = true;
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
  }, () => { goOffline(); });
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
// 출결은 한 반의 하루가 문서 한 장이다. 금요일에 여섯 반을 적어도 서로 덮어쓰지 않는다.
function ensureAtt(day, cls) {
  if (yearOpen == null) return;
  const c = cls || picked();
  if (!c) return;
  if (attDay === day && attCls === c) return;
  // 떠나는 반의 값을 사본으로 남긴다. 오늘 출결 요약이 그걸 읽는다.
  if (docs.att) { if (docs.att.ready) attCache.set(docs.att.key, docs.att.value); closeDoc(docs.att); }
  attDay = day; attCls = c;
  docs.att = makeDoc(`y${yearOpen}_att_${day}_${c}`, { enc: true, makeDefault: () => ({ marks: {} }) });
  attach(docs.att);
}
function openYearDocs() {
  const y = state.year.current;
  if (yearOpen === y) return;
  for (const d of encDocs()) closeDoc(d);
  // 학년도가 바뀌면 보던 반을 놓고 담임 반부터 다시 본다.
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
function afterPlain() {
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
  if (C.confirmed) return "none";
  if (cloudFailed) return "offline";
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
  for (const d of encDocs()) {
    clearTimeout(d.timer);
    if (d.dirty) {
      d.dirty = false;
      const b = await encodeBody(d);
      d.pendingBody = b; d.body = b; lsSet(d.key, b);
      flushDoc(d);
    }
  }
  dataKey = null; recoveryToShow = null;
  for (const d of encDocs()) { d.value = null; d.ready = false; }
  rosterOpen = false; activeCollect = null;
  renderRoster(); renderClass();
  if (setOpen) renderSet();
}
async function setupKey(pass) {
  if (!cloud || !C.confirmed || !C.ref) throw new Error("저장소에 연결된 뒤에 만들 수 있어요. 잠시 뒤 다시 시도해 주세요.");
  const raw = rnd(32), rec = makeRecovery();
  const meta = { v: 1, at: Date.now(), pass: await wrapRaw(raw, normPass(pass), "pass"), rec: await wrapRaw(raw, rec, "rec") };
  const got = await C.ref.createOnce(meta, (d) => !!d.pass);
  if (!got.ok) {
    C.body = got.body; lsSet(C.key, got.body); renderClass();
    throw new Error("이미 다른 기기에서 비밀번호를 만들었어요. 그 비밀번호로 열어 주세요.");
  }
  C.body = meta; lsSet(C.key, meta);
  recoveryToShow = rec;
  await useRaw(raw);
}
async function unlock(pass) {
  let raw;
  try { raw = await unwrapRaw(C.body.pass, normPass(pass), "pass"); }
  catch (e) { throw new Error("비밀번호가 맞지 않아요. 다시 입력해 주세요."); }
  await useRaw(raw);
}
async function rewrap(secret, newPass) {
  let raw;
  try { raw = await unwrapRaw(C.body.pass, normPass(secret), "pass"); }
  catch (e) {
    try { raw = await unwrapRaw(C.body.rec, normRec(secret), "rec"); }
    catch (e2) { throw new Error("비밀번호나 복구 키가 맞지 않아요."); }
  }
  const meta = { ...C.body, at: Date.now(), pass: await wrapRaw(raw, normPass(newPass), "pass") };
  C.body = meta; lsSet(C.key, meta);
  if (cloud && C.ref) await C.ref.set(meta);
  return raw;
}

let userName = "";
/* ---------- 구글 캘린더 ---------- */
/* 세 가지 중 ①승인된 도메인과 ③Calendar API 는 2026-11-11에 관리 API로 켜 두었다.
   ②구글 로그인만 콘솔에서 해야 한다(OAuth 클라이언트를 만드는 공개 API가 없다). */
const GCAL_STEPS = [
  { done: true,  text: "승인된 도메인에 hoseong911.github.io 넣기" },
  { done: false, text: "파베 Authentication → Sign-in method → Google 켜기" },
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

  if (!signedIn) { box.replaceChildren(h("p", { class: "empty", text: "로그인하면 쓸 수 있어요." })); return; }
  if (gcalErr) {
    const kids = [h("p", { class: "hint", text: gcalErr })];
    if (gcalStep >= 1) {
      kids.push(h("p", { class: "tip", text: "세 가지가 켜져 있어야 해요. 둘은 제가 켜 두었습니다." }));
      kids.push(h("ul", { class: "lines" }, ...GCAL_STEPS.map((st, i) =>
        h("li", { class: "line" + (st.done ? " done" : "") },
          h("div", { class: "top" },
            h("span", { class: "ttl", text: (i + 1) + ". " + st.text }),
            h("span", { class: "tag " + (st.done ? "cls" : "open"), text: st.done ? "켜 둠" : "남음" }))))));
      if (gcalStep === 2) {
        kids.push(h("p", { class: "row" },
          h("a", { class: "btn small", href: GCal.CONSOLE_URL, target: "_blank", rel: "noopener", text: "파베 로그인 설정 열기" })));
        kids.push(h("p", { class: "tip", text: "그 화면에서 Google 을 누르고 '사용 설정'만 켜면 돼요. 지원 이메일은 선생님 메일을 고르면 됩니다. 켜고 나서 아래 '다시 해 보기'를 눌러 주세요." }));
      }
    }
    kids.push(h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "다시 해 보기", onclick: () => gcalConnect() })));
    box.replaceChildren(...kids);
    return;
  }
  if (!linked) {
    box.replaceChildren(
      h("p", { class: "empty", text: "구글 캘린더를 이어 붙이면 앞으로 3주 일정이 여기 보여요." }),
      h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "구글 캘린더 연결", onclick: () => gcalConnect() })),
      h("p", { class: "tip", text: "읽기만 합니다. 캘린더에 쓰지 않아요." }));
    return;
  }
  if (!gcalDays.length) {
    box.replaceChildren(h("p", { class: "empty", text: "앞으로 3주에 일정이 없어요." }));
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

// 페이지에 무엇이 있는지로 이름을 짓는다(교무수첩만 있으면 "교무수첩").
function pageName(p) {
  const on = WIDGETS.filter(d => state.layout[d.id].on && state.layout[d.id].pg === p);
  if (!on.length) return p + "장 (빈 장)";
  const big = on.slice().sort((a, b) => {
    const A = state.layout[a.id], B = state.layout[b.id];
    return (B.w * B.h) - (A.w * A.h);
  })[0];
  return p + "장 · " + big.name + (on.length > 1 ? " 외 " + (on.length - 1) : "");
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
  for (const def of WIDGETS) {
    const el = deck.querySelector('.wg[data-w="' + def.id + '"]');
    if (!el) continue;
    const b = state.layout[def.id];
    el.hidden = !b.on || b.pg !== curPage;
    el.style.gridArea = b.y + " / " + b.x + " / span " + b.h + " / span " + b.w;
  }
  renderPagebar();
}

/* 아래 가운데 페이지 바. 배치 중에는 장을 더하고 지우는 단추도 나온다. */
function renderPagebar() {
  const bar = $("pagebar");
  if (!bar) return;
  const n = okPages(state.pages);
  bar.classList.toggle("show", arranging);
  const kids = [
    h("button", { class: "pg-arrow", type: "button", "aria-label": "앞 장", text: "‹", onclick: () => gotoPage(curPage - 1) }),
    h("div", { class: "pg-dots" }, ...Array.from({ length: n }, (_, i) => h("button", {
      class: "pg-dot" + (i + 1 === curPage ? " cur" : ""), type: "button",
      "data-page": String(i + 1), "aria-label": pageName(i + 1),
      title: pageName(i + 1), onclick: () => gotoPage(i + 1),
    }))),
    h("button", { class: "pg-arrow", type: "button", "aria-label": "다음 장", text: "›", onclick: () => gotoPage(curPage + 1) }),
  ];
  if (arranging) {
    kids.push(h("span", { class: "pg-name", text: pageName(curPage) }));
    if (n < MAX_PAGES) kids.push(h("button", { class: "pg-add", type: "button", "aria-label": "장 더하기", text: "+", onclick: () => addPage() }));
    if (n > 1) kids.push(h("button", { class: "pg-del", type: "button", "aria-label": "이 장 지우기", text: "×", onclick: () => delPage() }));
  }
  bar.replaceChildren(...kids);
}
function addPage() {
  if (okPages(state.pages) >= MAX_PAGES) { toast("장은 " + MAX_PAGES + "개까지예요"); return; }
  state.pages = okPages(state.pages + 1);
  save(true); curPage = state.pages; applyGrid();
  if (setOpen) renderSet();
  toast(state.pages + "장이 됐어요. 우젯을 끌어다 페이지 점에 놓으면 옮겨져요");
}
function delPage() {
  const n = okPages(state.pages);
  if (n <= 1) return;
  const here = WIDGETS.filter(d => state.layout[d.id].on && state.layout[d.id].pg === curPage);
  if (here.length) { toast("이 장에 우젯이 " + here.length + "개 있어요. 다른 장으로 옮기거나 끄고 지워 주세요"); return; }
  // 뒷장들을 한 칸 당긴다
  for (const def of WIDGETS) {
    const g = state.layout[def.id];
    if (g.pg > curPage) g.pg -= 1;
  }
  state.pages = n - 1;
  if (curPage > state.pages) curPage = state.pages;
  save(true); applyGrid();
  if (setOpen) renderSet();
  toast("장을 지웠어요");
}
// 키보드 화살표로도 넘긴다(글을 치는 중이면 넘기지 않는다)
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
  $("arrange").title = arranging ? "배치 끝내기" : "위젯 이동·크기조절";
  if (arranging) addHandles(); else dropHandles();
  let tip = document.querySelector(".drag-tip");
  if (arranging && !tip) {
    document.body.append(h("div", { class: "drag-tip", text: "가운데를 끌면 옮기기 · 테두리를 끌면 크기 · 아래 페이지 점에 놓으면 그 장으로" }));
  } else if (!arranging && tip) { tip.remove(); }
  renderPagebar();
}
$("arrange").addEventListener("click", () => setArrange(!arranging));
$("toolSet").addEventListener("click", () => { setOpen = !setOpen; renderSet(); });

// 끌어 옮기기와 크기 바꾸기. 겹치는 자리에는 놓지 않는다.
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
    // 페이지 점 위에 놓으면 그 장으로 옮긴다
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const dot = under && under.closest && under.closest(".pg-dot");
    if (dot !== overDot) {
      if (overDot) overDot.classList.remove("over");
      overDot = dot || null;
      if (overDot) overDot.classList.add("over");
    }
  };
  const move = (ev) => {
    if (!dir) markDot(ev);
    const dC = Math.round((ev.clientX - sx) / uw), dR = Math.round((ev.clientY - sy) / uh);
    const cand = moved(g0, G, dC, dR, dir);
    if (cand.w < minW || cand.h < minH) return;
    if (hits(state.layout, id, cand)) return;
    state.layout[id] = cand;
    el.style.gridArea = cand.y + " / " + cand.x + " / span " + cand.h + " / span " + cand.w;
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
        if (moveToPage(state.layout, id, G, to)) toast(def.name + "을 " + to + "장으로 옮겼어요");
        else toast(to + "장에 놓을 빈자리가 없어요");
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

/* 칸 수 조정과 우젯 켜고 끄기 (설정 패널에 들어간다) */
function gridPanel() {
  const G = okGrid(state.grid);
  const colIn = h("input", { type: "number", id: "setCols", value: String(G.cols), min: String(GRID_MIN.cols), max: String(GRID_MAX.cols) });
  const rowIn = h("input", { type: "number", id: "setRows", value: String(G.rows), min: String(GRID_MIN.rows), max: String(GRID_MAX.rows) });
  const err = h("p", { class: "form-err", role: "alert" });
  const apply = () => {
    const next = okGrid({ cols: colIn.value, rows: rowIn.value });
    state.grid = next;
    state.layout = normalize(state.layout, next, state.pages);
    save(true); applyGrid(); renderSet();
    toast(`칸을 ${next.cols}×${next.rows}로 바꿨어요`);
  };
  const toggles = h("div", { class: "wg-list" }, ...WIDGETS.map(def => {
    const b = state.layout[def.id];
    return h("button", {
      class: "wg-toggle", type: "button", "aria-pressed": String(b.on),
      onclick: () => {
        if (b.on) { b.on = false; }
        else if (!turnOn(state.layout, def.id, state.grid)) {
          // 4단으로 꽉 채워 두었으니 빈자리가 없는 게 보통이다. 세로를 늘려서 놓아 준다.
          let G = okGrid(state.grid), done = false;
          while (!done && G.rows < GRID_MAX.rows) {
            G = okGrid({ cols: G.cols, rows: G.rows + 2 });
            state.grid = G;
            state.layout = normalize(state.layout, G);
            done = turnOn(state.layout, def.id, G);
          }
          if (!done) { err.textContent = def.name + "을 놓을 자리를 못 찾았어요. 다른 것을 끄고 다시 해 주세요."; return; }
          toast(`자리가 없어서 세로를 ${G.rows}칸으로 늘렸어요`);
        }
        err.textContent = "";
        save(true); applyGrid(); renderSet();
      },
    }, def.name, h("span", { class: "sz", text: b.on ? `${b.pg}장 ${b.w}×${b.h}` : "꺼짐" }));
  }));
  return h("div", { class: "lock-panel divided grid-set" },
    h("h3", { text: "칸 수와 자리" }),
    h("p", { text: "화면을 가로 몇 칸, 세로 몇 칸으로 나눌지 정해요. 기본은 24×16이고, 24를 넷으로 나눠 4단으로 놓았어요. 바탕화면 위젯은 15×10을 씁니다." }),
    h("div", { class: "row" },
      h("label", { class: "field" }, "가로 칸", colIn),
      h("label", { class: "field" }, "세로 칸", rowIn),
      h("button", { class: "btn small", type: "button", text: "칸 수 바꾸기", onclick: apply })),
    h("div", { class: "row" },
      h("span", { class: "tip", text: `지금 ${okPages(state.pages)}장, ${curPage}장을 보고 있어요.` }),
      h("button", { class: "btn small secondary", type: "button", text: "장 더하기", onclick: () => addPage() }),
      h("button", { class: "btn small secondary", type: "button", text: "이 장 지우기", onclick: () => delPage() })),
    h("p", { class: "tip", text: "자리를 옮기려면 아래 도구줄의 '배치'를 누르고 우젯을 끌어 주세요. 테두리를 잡으면 크기가 바뀝니다." }),
    toggles, err,
    h("div", { class: "row" },
      h("button", { class: "btn small secondary", type: "button", text: arranging ? "배치 끝내기" : "배치 시작", onclick: () => { setArrange(!arranging); renderSet(); } }),
      armed("되돌리기", "기본 배치로 되돌리기", () => {
        state.grid = { ...DEFAULT_GRID };
        state.pages = DEFAULT_PAGES; curPage = 1;
        state.layout = normalize(null, state.grid, state.pages);
        save(true); applyGrid(); renderSet();
        toast("기본 배치로 되돌렸어요");
      })));
}

/* ---------- 로그인 문 ---------- */
function authMsg(e) {
  const c = (e && e.code) || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return "메일이나 비밀번호가 맞지 않아요.";
  if (c.includes("too-many-requests")) return "너무 여러 번 시도했어요. 잠시 뒤에 다시 해 주세요.";
  if (c.includes("network")) return "인터넷 연결을 확인해 주세요.";
  if (c.includes("user-disabled")) return "잠긴 계정이에요.";
  return "들어가지 못했어요. " + (c || (e && e.message) || "까닭을 모르겠어요");
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
  const nm = (user.displayName || user.email || "").split("@")[0];
  if (nm) { userName = nm; renderGreeting(); }
  cloud = cloudRef;
  if (GCal.savedToken()) gcalLoad().then(renderGcal);
  renderGcal();
  setSync("", "연결 중");
  const loadTimer = setTimeout(() => { if (!C.confirmed) setSync("warn", "저장소에 연결하는 중이에요. 그동안 이 브라우저에 저장돼요."); }, 10000);
  for (const d of allDocs()) subscribe(d);
  const wait = setInterval(() => { if (C.confirmed) { clearTimeout(loadTimer); clearInterval(wait); refreshSync(); softClass(); } }, 300);
}
async function signOutNow() {
  await lockNow();
  for (const d of allDocs()) { if (d.unsub) d.unsub(); d.unsub = null; d.ref = null; }
  cloud = null; signedIn = null;
  GCal.forgetToken(); gcalDays = []; gcalErr = "";
  try { await FB.signOut(FB.auth); } catch (e) {}
  showGate("나왔습니다.");
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

// 타우리 앱에서만 쓰는 단추. 수첩 창을 숨기면 바탕화면 위젯이 다시 보인다.
if (window.__TAURI__ && window.__TAURI__.window) {
  $("toWidget").hidden = false;
  $("toWidget").addEventListener("click", async () => {
    try { await window.__TAURI__.window.getCurrentWindow().hide(); } catch (e) {}
  });
}

function connect() {
  step("로그인 상태 확인 시작");
  FB.onAuthStateChanged(FB.auth, (user) => {
    step(user ? "로그인되어 있음" : "로그인 안 되어 있음");
    if (user) openApp(user);
    else if (signedIn) { signedIn = null; showGate("로그인이 풀렸어요. 다시 들어와 주세요."); }
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

/* ---------- 시계 · 지금 ---------- */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}
function renderGreeting() {
  const hr = new Date().getHours();
  const part = hr < 5 ? "늦은 밤이에요" : hr < 12 ? "좋은 아침이에요" : hr < 18 ? "좋은 오후예요" : "오늘도 수고하셨어요";
  $("greet").textContent = userName ? `${part}, ${userName} 선생님` : `${part}, 선생님`;
}
function renderNow(now) {
  const s = status(now);
  const card = $("nowCard"), main = $("nowMain"), sub = $("nowSub"), next = $("nowNext"), bar = $("nowBar"), wrap = $("nowBarWrap");
  card.classList.toggle("break", s.kind === "break" || s.kind === "lunch" || s.kind === "free");
  const row = todayRow(now);
  const B = state.bells;
  const label = (i) => `${i + 1}교시`;
  const nextLine = (j, until) => j >= 0
    ? [h("span", null, "다음 ", h("b", { text: `${label(j)} · ${row[j]}` })), h("span", { class: "num", text: `${B[j].s} 시작 · ${fmtLeft(until)} 후` })]
    : [h("span", { text: "오늘 남은 수업이 없어요" }), h("span", { text: "종례 준비" })];
  $("nowAside").textContent = row ? `오늘 수업 ${classCount(row)}시간` : "";
  let mainKids, subText = "", prog = null, nextKids = null;
  switch (s.kind) {
    case "weekend": mainKids = ["주말이에요"]; subText = "월요일 시간표는 아래 주간 시간표에서 볼 수 있어요."; break;
    case "noclass": mainKids = ["오늘은 수업이 없어요"]; subText = "주간 시간표에서 오늘 칸을 채우면 여기에 표시돼요."; break;
    case "invalid": mainKids = ["종 시간을 확인해 주세요"]; subText = "주간 시간표 편집에서 교시별 시작·끝 시간을 넣어 주세요."; break;
    case "before": mainKids = ["수업 전"]; subText = `첫 수업까지 ${fmtLeft(s.until)}`; nextKids = nextLine(s.next, s.until); break;
    case "class": mainKids = [`${label(s.i)} · `, h("span", { class: "cls", text: row[s.i] })]; subText = `${B[s.i].e} 종료 · ${fmtLeft(s.left)} 남음`; prog = s.prog; nextKids = nextLine(s.next, s.until); break;
    case "free": mainKids = [`${label(s.i)} · 공강`]; subText = `${B[s.i].e}까지 · ${fmtLeft(s.left)} 남음`; prog = s.prog; nextKids = nextLine(s.next, s.until); break;
    case "break": mainKids = ["쉬는 시간"]; subText = `${fmtLeft(s.left)} 뒤 ${label(s.i + 1)} 종`; prog = s.prog; nextKids = nextLine(s.next, s.until); break;
    case "lunch": mainKids = ["점심시간"]; subText = `${B[s.i + 1].s}에 ${label(s.i + 1)} 시작 · ${fmtLeft(s.left)} 남음`; prog = s.prog; nextKids = nextLine(s.next, s.until); break;
    case "after": mainKids = ["오늘 수업 끝"]; subText = "종례하고 업무 할 일을 정리해 보세요."; break;
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
    $("dateMain").textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${WD[now.getDay()]}요일`;
    ensureAtt(k); renderDdays(); renderClass();
  }
  if (dataKey && Date.now() - lastActive > state.idleMin * 60000) lockNow();
  renderNow(now);
  const mm = now.getHours() * 60 + now.getMinutes();
  if (mm !== lastMinute) { lastMinute = mm; renderGreeting(); renderMeta(now); renderPeriods(now); renderTT(); }
}
function renderMeta(now) {
  const row = todayRow(now);
  const chips = [h("span", { class: "chip", text: `${isoWeek(now)}주차` })];
  if (row) {
    const total = classCount(row);
    const m = now.getHours() * 60 + now.getMinutes();
    const done = row.filter((c, i) => c.trim() && toMin(state.bells[i].e) <= m).length;
    chips.push(h("span", { class: "chip", text: `수업 ${done} / ${total} 완료` }));
  }
  const upcoming = state.ddays.map(x => ({ ...x, diff: Math.round((parseDate(x.date) - parseDate(todayKey(now))) / 86400000) })).filter(x => x.diff >= 0).sort((a, b) => a.diff - b.diff)[0];
  if (upcoming) chips.push(h("span", { class: "chip", text: `${upcoming.title} ${upcoming.diff === 0 ? "D-DAY" : "D-" + upcoming.diff}` }));
  $("dateMeta").replaceChildren(...chips);
}

/* ---------- 오늘 시간표 ---------- */
function renderPeriods(now = new Date()) {
  const list = $("periods");
  const row = todayRow(now);
  if (!row) { $("todayAside").textContent = WD[now.getDay()] + "요일"; list.replaceChildren(h("li", { class: "empty", text: "주말에는 수업이 없어요." })); return; }
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
      h("span", { class: "tm", text: `${b.s}–${b.e}` }),
      h("span", { class: "c", text: row[i].trim() || "공강" })
    ));
    if (i + 1 === state.lunchAfter) {
      const ls = toMin(b.e), le = toMin(state.bells[i + 1].s);
      items.push(h("li", { class: "period lunch" + (ls <= m && m < le ? " current" : le <= m ? " past" : "") },
        h("span", { class: "p", text: "" }), h("span", { class: "tm", text: `${b.e}–${state.bells[i + 1].s}` }), h("span", { class: "c", text: "점심시간" })));
    }
  }
  list.replaceChildren(...items);
}

/* ---------- 주간 시간표 ---------- */
let ttEditing = false;
function renderTT() {
  if (ttEditing && $("tt").contains(document.activeElement)) return; // 입력 중엔 다시 그리지 않음
  const now = new Date(), di = dayIdx(now), m = now.getHours() * 60 + now.getMinutes();
  $("ttHint").hidden = !state.ttExample;
  $("ttEdit").textContent = ttEditing ? "편집 완료" : "편집";
  const head = h("tr", null, h("th", { class: "ph", text: "교시" }), ...["월", "화", "수", "목", "금"].map((d, i) => h("th", { class: i === di ? "today" : "", text: d + (i === di ? " · 오늘" : "") })));
  const rows = [head];
  for (let p = 0; p < 7; p++) {
    const b = state.bells[p];
    const ph = ttEditing
      ? h("th", { class: "ph" }, h("div", null, `${p + 1}교시`), h("div", { class: "bell" },
          h("input", { type: "time", value: b.s, "aria-label": `${p + 1}교시 시작`, onchange: (e) => { b.s = e.target.value; state.ttExample = false; save(); renderPeriods(); } }),
          h("input", { type: "time", value: b.e, "aria-label": `${p + 1}교시 끝`, onchange: (e) => { b.e = e.target.value; state.ttExample = false; save(); renderPeriods(); } })))
      : h("th", { class: "ph" }, `${p + 1}교시`, h("span", { class: "tm", text: `${b.s}–${b.e}` }));
    const cells = [0, 1, 2, 3, 4].map((d) => {
      const v = state.tt[d][p];
      if (ttEditing) {
        return h("td", null, h("input", { type: "text", value: v, maxlength: "12", "aria-label": `${["월", "화", "수", "목", "금"][d]} ${p + 1}교시`, placeholder: "—",
          oninput: (e) => { state.tt[d][p] = e.target.value; state.ttExample = false; save(); } }));
      }
      const cls = [];
      if (!v.trim()) cls.push("empty-cell");
      if (d === di) { cls.push("todaycol"); if (v.trim() && toMin(b.s) <= m && m < toMin(b.e)) cls.push("nowcell"); }
      return h("td", { class: cls.join(" "), text: v.trim() || "·" });
    });
    rows.push(h("tr", null, ph, ...cells));
    if (p + 1 === state.lunchAfter) rows.push(h("tr", { class: "lunch" }, h("td", { colspan: "6", text: "점심" })));
  }
  $("tt").replaceChildren(...rows);
}
$("ttEdit").addEventListener("click", () => {
  ttEditing = !ttEditing;
  if (!ttEditing) { document.activeElement && document.activeElement.blur(); renderPeriods(); renderNow(new Date()); renderMeta(new Date()); }
  renderTT();
});

/* ---------- 바로가기 ---------- */
const linksEl = $("links");
let editingLinks = false, showLinkForm = false;
const TILE_COLORS = ["#0E7A5C", "#3567AE", "#B5543A", "#7A5AB8", "#B07C14", "#3C7F8C", "#A2456E", "#4F6B2E"];
function tileColor(s) { let x = 0; for (const c of s) x = (x * 31 + c.codePointAt(0)) >>> 0; return TILE_COLORS[x % TILE_COLORS.length]; }
function normalizeUrl(u) {
  u = u.trim(); if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { const p = new URL(u); return p.protocol.startsWith("http") ? p.href : ""; } catch (e) { return ""; }
}
function officialLink(name, sub, url, tile) {
  return h("a", { class: "link official", href: url, target: "_blank", rel: "noopener" },
    h("span", { class: "mono-tile", style: "background:var(--accent)", text: tile }),
    h("span", null, name, " ", h("span", { class: "sub", text: sub })));
}
function renderLinks() {
  linksEl.classList.toggle("editing", editingLinks);
  const kids = [
    officialLink("업무포털", "인천", "https://ice.eduptl.kr", "업"),
    officialLink("나이스", "인천", "https://ice.neis.go.kr", "N"),
  ];
  for (const l of state.links) {
    const label = l.name || (() => { try { return new URL(l.url).hostname.replace(/^www\./, ""); } catch (e) { return l.url; } })();
    const a = h("a", { class: "link custom", href: l.url, target: "_blank", rel: "noopener" },
      h("span", { class: "mono-tile", style: `background:${tileColor(label)}`, text: [...label][0].toUpperCase() }),
      h("span", { text: label }),
      h("button", { class: "x", type: "button", "aria-label": `${label} 삭제`, text: "×", onclick: (e) => {
        e.preventDefault(); e.stopPropagation();
        state.links = state.links.filter(x => x.id !== l.id); save(); renderLinks();
      } }));
    if (editingLinks) a.addEventListener("click", (e) => e.preventDefault());
    kids.push(a);
  }
  kids.push(h("button", { class: "ghost-btn", type: "button", text: "+ 사이트 추가", onclick: () => { showLinkForm = !showLinkForm; renderLinks(); if (showLinkForm) $("linkName").focus(); } }));
  const home = cfg().homeroom;
  kids.push(h("button", { class: "region", type: "button", id: "setBtn", text: `${state.year.current}학년도 · ${!state.year.configured ? "올해 설정" : home ? "담임 " + home : "비담임"}`, onclick: () => { setOpen = !setOpen; renderSet(); } }));
  if (showLinkForm) {
    kids.push(h("form", { class: "link-form", onsubmit: (e) => {
      e.preventDefault();
      const url = normalizeUrl($("linkUrl").value);
      if (!url) { $("linkUrl").setCustomValidity("올바른 주소를 입력해 주세요"); $("linkUrl").reportValidity(); return; }
      state.links.push({ id: uid(), name: $("linkName").value.trim().slice(0, 30), url });
      showLinkForm = false; save(); renderLinks();
    } },
      h("input", { type: "text", id: "linkName", placeholder: "이름 (예: 학교 홈페이지)", maxlength: "30", autocomplete: "off" }),
      h("input", { type: "text", id: "linkUrl", placeholder: "주소 (예: 학교 홈페이지 주소)", autocomplete: "off", oninput: (e) => e.target.setCustomValidity("") }),
      h("button", { class: "btn", type: "submit", text: "추가" }),
      h("button", { class: "btn secondary", type: "button", text: "취소", onclick: () => { showLinkForm = false; renderLinks(); } })));
  }
  linksEl.replaceChildren(...kids);
  $("editLinks").textContent = editingLinks ? "편집 완료" : "바로가기 편집";
}
$("editLinks").addEventListener("click", () => { editingLinks = !editingLinks; renderLinks(); });

/* ---------- 올해 설정 ---------- */
let setOpen = false;
function guardForm(btn, errEl, fn) {
  return async (e) => {
    e.preventDefault();
    errEl.textContent = "";
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "처리 중";
    try { await fn(); }
    catch (x) { errEl.textContent = (x && x.message) || "처리하지 못했어요. 다시 시도해 주세요."; }
    finally { btn.disabled = false; btn.textContent = label; }
  };
}
function passField(id, label, auto) {
  return h("label", { class: "field" }, label, h("input", { type: "password", id, autocomplete: auto }));
}
function renderSet() {
  const p = $("setPanel");
  p.hidden = !setOpen;
  if (!setOpen) { p.replaceChildren(); return; }
  const y = cfg();
  const yearIn = h("input", { type: "number", id: "setYear", value: String(state.year.current), min: "2020", max: "2099" });
  const homeIn = h("input", { type: "text", id: "setHome", value: y.homeroom || "", placeholder: "예: 2-3", maxlength: "12", autocomplete: "off" });
  const clsIn = h("input", { type: "text", id: "setClasses", value: (y.classes || []).join(", "), placeholder: "예: 2-1, 2-2, 2-3", autocomplete: "off" });
  const schoolIn = h("input", { type: "text", id: "setSchool", value: state.school || "", placeholder: "예: 인천OO중학교", maxlength: "40", autocomplete: "off" });
  const idleSel = h("select", { id: "setIdle" }, ...[5, 15, 30, 60].map(m => h("option", { value: String(m), text: `${m}분` })));
  idleSel.value = String(state.idleMin);
  const err = h("p", { class: "form-err", role: "alert" });
  const saveBtn = h("button", { class: "btn small", type: "submit", id: "setSave", text: "저장" });
  const form = h("form", { class: "lock-panel", id: "setForm", onsubmit: (e) => {
    e.preventDefault();
    const Y = Number(yearIn.value);
    if (!Number.isInteger(Y) || Y < 2020 || Y > 2099) { err.textContent = "학년도를 2026처럼 네 자리로 넣어 주세요."; return; }
    const homeRaw = homeIn.value.trim(), home = parseClasses(homeRaw)[0] || "";
    if (homeRaw && !home) { err.textContent = "담임 반은 2-3이나 2학년 3반처럼 넣어 주세요. 담임이 아니면 비워 두세요."; return; }
    state.year.years[Y] = { homeroom: home, classes: parseClasses(clsIn.value) };
    state.year.current = Y;
    state.year.configured = true;
    state.idleMin = Number(idleSel.value);
    state.school = schoolIn.value.trim().slice(0, 40);
    save(true);
    setOpen = false;
    openYearDocs();
    renderSet(); renderLinks(); renderClass(); renderBook();
    hc = null; loadHc();
    toast("올해 설정을 저장했어요");
  } },
    h("div", { class: "set-grid" },
      h("label", { class: "field" }, "학년도", yearIn),
      h("label", { class: "field" }, "담임 반 (담임이 아니면 비워 두세요)", homeIn),
      h("label", { class: "field" }, "자동 잠금", idleSel)),
    h("label", { class: "field" }, "학교 (학사일정을 받아 넣을 때 씁니다)", schoolIn),
    h("label", { class: "field" }, "수업 반", clsIn),
    err,
    h("div", { class: "row" }, saveBtn,
      h("button", { class: "btn small secondary", type: "button", id: "setFromTT", text: "시간표에서 가져오기", onclick: () => {
        const found = parseClasses(state.tt.flat().filter(c => /^\s*\d+\s*-\s*\d+\s*$/.test(c)).join(", ")).sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
        clsIn.value = found.join(", ");
      } }),
      h("button", { class: "btn small secondary", type: "button", text: "닫기", onclick: () => { setOpen = false; renderSet(); } })));
  const kids = [h("div", { class: "card-head" }, h("h2", { class: "card-title", id: "setTitle", text: "올해 설정" })), form];
  if (C.body && C.body.pass) {
    const cur = h("input", { type: "password", id: "chgCur", autocomplete: "current-password" });
    const err2 = h("p", { class: "form-err", role: "alert" });
    const btn2 = h("button", { class: "btn small secondary", type: "submit", id: "chgSave", text: "비밀번호 바꾸기" });
    kids.push(h("form", { class: "lock-panel divided", id: "chgForm", onsubmit: guardForm(btn2, err2, async () => {
      const a = $("chgNew").value, b = $("chgNew2").value;
      if (a.length < 8) throw new Error("새 비밀번호는 8자 이상으로 넣어 주세요.");
      if (a !== b) throw new Error("새 비밀번호 두 칸이 서로 달라요.");
      const raw = await rewrap(cur.value, a);
      raw.fill(0);
      cur.value = ""; $("chgNew").value = ""; $("chgNew2").value = "";
      toast("비밀번호를 바꿨어요. 다른 기기에서도 새 비밀번호로 열어 주세요");
    }) },
      h("div", { class: "set-grid" },
        h("label", { class: "field" }, "현재 비밀번호 또는 복구 키", cur),
        passField("chgNew", "새 비밀번호", "new-password"),
        passField("chgNew2", "새 비밀번호 확인", "new-password")),
      err2, h("div", { class: "row" }, btn2)));
  }
  kids.push(gridPanel());
  kids.push(backupPanel());
  p.replaceChildren(...kids);
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
// 출결 문서 한 장은 한 반의 하루다. 그래서 칸을 그대로 꺼낸다.
function attMarks() {
  const v = docs.att.value;
  if (!v.marks || typeof v.marks !== "object") v.marks = {};
  attCache.set(docs.att.key, v);   // 살아 있는 값을 사본 자리에도 꽂아 둔다
  return v.marks;
}
/* 학번에 기록이 붙어 있으므로, 같은 학번의 이름이 달라지면 기록이 다른 학생에게
   붙었다는 뜻이다. 조용히 엉키지 않게 알려만 주고, 옮길지는 선생님이 정하신다. */
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
  toast("새 이름을 기준으로 삼았어요");
}
function warnBanner() {
  if (!hcWarns.length) return null;
  const lines = hcWarns.slice(0, 8).map(w => `${w.cls} ${w.no}번: ${w.was} → ${w.now}`);
  return h("div", { class: "lock-panel" },
    h("h3", { text: "학번에 붙은 이름이 달라졌어요" }),
    h("p", { text: "전입·전출로 번호가 밀린 것 같아요. 기록은 학번에 붙어 있으니, 아래 학번의 지난 출결과 상담이 다른 학생 것일 수 있어요." }),
    h("div", { class: "missing", text: lines.join(" · ") + (hcWarns.length > 8 ? ` 외 ${hcWarns.length - 8}건` : "") }),
    h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "확인했어요", onclick: () => acceptNames() })));
}

// 수합·전달사항은 문서 하나에 모아 두고 반 이름으로 갈라 본다.
// 반 이름이 없는 항목은 1단계에서 담임 반에 적은 것이다.
const itemCls = (x) => x.cls || cfg().homeroom;
const mine = (list) => list.filter(x => itemCls(x) === picked());
// 1단계에 적어 둔 항목에 반 이름을 한 번만 박아 둔다. 담임 반을 지워도 길을 잃지 않게.
function stampCls(D) {
  let n = 0;
  for (const x of D.value.items) if (!x.cls) { x.cls = cfg().homeroom || picked(); n++; }
  if (n) saveEnc(D);
}
// 가운데 카드가 보는 명단. 호클래스에 있는 반은 호클래스 것, 없는 반은 수첩에 손으로 넣은 것.
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
  const ta = h("textarea", { id: "rNames", value: Array.from(lines, x => x || "").join("\n"), placeholder: "한 줄에 한 명씩, 번호 순서대로\n김민준\n이서연\n…" });
  box.replaceChildren(h("div", { class: "roster-editor" },
    h("div", { class: "row" }, h("label", { class: "grow" }, "반", h("input", { type: "text", value: classLabel(picked()), disabled: true })), h("label", null, "학생 수", cntIn)),
    h("label", null, "학생 이름 (붙여넣기 가능)", ta),
    h("p", { class: "tip", text: "이름은 이 기기에서 암호화한 뒤 저장해요. 전출로 빠진 번호는 줄을 비워 두면 번호가 밀리지 않아요. 호클래스에 있는 반은 호클래스 명단을 그대로 쓰니 여기서 고치지 않습니다." }),
    h("div", { class: "row" },
      h("button", { class: "btn small", type: "button", id: "rSave", text: "저장", onclick: () => {
        const names = ta.value.split(/\r?\n/).map(s => s.replace(/^\s*\d+[.)\s]*/, "").trim());
        while (names.length && !names[names.length - 1]) names.pop();
        const count = Math.max(1, Math.min(60, Math.max(Number(cntIn.value) || 1, names.length)));
        saveRoster(names.slice(0, 60), count);
        rosterOpen = false; renderRoster(); renderClass(); toast("명단을 저장했어요");
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
  // 학번(반 + 두 자리 번호)으로 묶는다. 호클래스와 같은 기준이어야 짝이 맞는다.
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
    if (a !== b) throw new Error("비밀번호 두 칸이 서로 달라요.");
    await setupKey(a);
    renderClass();
  }) },
    h("h3", { text: "학생 정보 보호 비밀번호 만들기" }),
    h("p", { text: "명단과 출결은 이 비밀번호로 암호화한 뒤 저장해요. 서버와 Claude는 내용을 읽을 수 없어요. 쓰시는 기기마다 같은 비밀번호로 엽니다." }),
    passField("setupPass", "비밀번호 (8자 이상)", "new-password"),
    passField("setupPass2", "비밀번호 확인", "new-password"),
    err, h("div", { class: "row" }, btn))];
}
function recoveryView() {
  const code = showRecovery(recoveryToShow);
  const ok = h("input", { type: "checkbox", id: "recoveryOk" });
  const go = h("button", { class: "btn small", type: "button", id: "recoveryDone", text: "다 적었어요", disabled: true, onclick: () => { recoveryToShow = null; renderClass(); } });
  ok.addEventListener("change", () => { go.disabled = !ok.checked; });
  return [h("div", { class: "lock-panel" },
    h("h3", { text: "복구 키를 적어 두세요" }),
    h("p", { text: "비밀번호를 잊으면 이 키로만 열 수 있어요. 이 화면을 닫으면 다시 볼 수 없고, 키와 비밀번호를 모두 잃으면 아무도 기록을 복구할 수 없어요." }),
    h("div", { class: "recovery-code", id: "recoveryCode", text: code }),
    h("div", { class: "row" }, h("button", { class: "btn small secondary", type: "button", text: "복구 키 복사", onclick: () => copyText(code) })),
    h("label", { class: "check-row" }, ok, "복구 키를 학교 밖 안전한 곳에 적어 두었어요"),
    h("div", { class: "row" }, go))];
}
function unlockView() {
  const err = h("p", { class: "form-err", role: "alert" });
  if (recoverMode) {
    const btn = h("button", { class: "btn small", type: "submit", id: "recoverSave", text: "새 비밀번호로 열기" });
    return [h("form", { class: "lock-panel", id: "recoverForm", onsubmit: guardForm(btn, err, async () => {
      const a = $("recoverNew").value, b = $("recoverNew2").value;
      if (a.length < 8) throw new Error("새 비밀번호는 8자 이상으로 넣어 주세요.");
      if (a !== b) throw new Error("새 비밀번호 두 칸이 서로 달라요.");
      const raw = await rewrap($("recoverKey").value, a);
      await useRaw(raw);
      recoverMode = false;
      renderClass();
    }) },
      h("h3", { text: "복구 키로 열기" }),
      h("label", { class: "field" }, "복구 키", h("input", { type: "text", id: "recoverKey", autocomplete: "off", spellcheck: "false" })),
      passField("recoverNew", "새 비밀번호 (8자 이상)", "new-password"),
      passField("recoverNew2", "새 비밀번호 확인", "new-password"),
      err, h("div", { class: "row" }, btn, h("button", { class: "btn small secondary", type: "button", text: "취소", onclick: () => { recoverMode = false; renderClass(); } })))];
  }
  const btn = h("button", { class: "btn small", type: "submit", id: "unlockBtn", text: "열기" });
  return [h("form", { class: "lock-panel", id: "unlockForm", onsubmit: guardForm(btn, err, async () => {
    await unlock($("unlockPass").value);
    renderClass();
  }) },
    h("h3", { text: "잠겨 있어요" }),
    h("p", { text: "명단과 출결을 보려면 비밀번호를 넣어 주세요. 시간표와 할 일은 잠겨 있어도 쓸 수 있어요." }),
    passField("unlockPass", "비밀번호", "current-password"),
    err,
    h("div", { class: "row" }, btn, h("button", { class: "text-btn", type: "button", id: "recoverLink", text: "비밀번호를 잊었어요", onclick: () => { recoverMode = true; renderClass(); } })))];
}
const openSetBtn = () => h("button", { class: "btn small", type: "button", text: "올해 설정 열기", onclick: () => { setOpen = true; renderSet(); } });

function softClass() {
  if (!booted) return;
  const a = document.activeElement;
  const typing = (id) => a && $(id).contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  const ks = keyStateNow();
  // 입력 폼은 자료가 도착해도 다시 그리지 않는다
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
  $("className").textContent = pick ? classLabel(pick) : state.year.configured ? "반 없음" : "올해 설정 전";
  $("classPick").hidden = !(open && list.length > 1);
  if (open && list.length > 1) renderPick(list, pick);
  $("classSeg").hidden = !tabs;
  // 호클래스가 명단을 들고 있는 반은 여기서 고치지 않는다.
  $("rosterBtn").hidden = !tabs || hcHas(pick);
  $("hideBtn").hidden = !open;
  $("lockBtn").hidden = !open;
  $("hideBtn").textContent = hideNames ? "이름 보이기" : "이름 가리기";
  const body = $("classBody");
  const note = (text) => [h("p", { class: "empty", text })];
  if (ks === "loading") { body.replaceChildren(...note("저장소를 확인하는 중이에요.")); return; }
  if (ks === "unsupported") { body.replaceChildren(...note("이 화면에서는 암호화를 쓸 수 없어요. 학생 정보를 저장하지 않도록 명단과 출결을 닫아 두었어요. 다른 브라우저에서 열어 주세요.")); return; }
  if (ks === "offline") { body.replaceChildren(...note("저장소에 연결되지 않아 보호 비밀번호를 만들 수 없어요. claude.ai에 로그인된 브라우저에서 열어 주세요.")); return; }
  if (ks === "none") { body.replaceChildren(...setupView()); return; }
  if (ks === "recovery") { body.replaceChildren(...recoveryView()); return; }
  if (ks === "locked") { body.replaceChildren(...unlockView()); return; }
  const rollover = state.year.configured && academicYear() > state.year.current
    ? h("p", { class: "hint", text: `${academicYear()}학년도가 시작됐어요. '올해 설정'에서 담임 반과 수업 반을 새로 넣어 주세요.` }) : null;
  const banner = warnBanner();
  const hcNote = hcErr ? h("p", { class: "hint", text: hcErr })
    : (hcBusy && !hc) ? h("p", { class: "tip", text: "호클래스 명단을 읽는 중이에요." }) : null;
  const head = [rollover, banner, hcNote].filter(Boolean);
  const wrap = (kids) => body.replaceChildren(...[...head, ...kids]);
  if (!state.year.configured) { wrap([h("div", { class: "lock-panel" }, h("h3", { text: "올해 담임 반과 수업 반을 넣어 주세요" }), h("p", { text: "담임이 아닌 해에는 담임 반을 비워 두시면 돼요." }), h("div", { class: "row" }, openSetBtn()))]); return; }
  ensureAtt(todayKey(), pick);
  if (!pick) { wrap([h("div", { class: "lock-panel" }, h("h3", { text: "올해 들어가는 반이 없어요" }), h("p", { text: "'올해 설정'에서 담임 반이나 수업 반을 넣으면 출결과 수합을 쓸 수 있어요." }), h("div", { class: "row" }, openSetBtn()))]); return; }
  if (encDocs().some(d => d.broken)) { wrap(note("일부 기록을 풀지 못했어요. 페이지를 새로고침한 뒤 다시 열어 주세요. 기록은 그대로 있어요.")); return; }
  if (encDocs().some(d => !d.ready)) { wrap(note("기록을 여는 중이에요.")); return; }
  if (!roster().length) {
    wrap([h("div", { class: "lock-panel" }, h("h3", { text: "학생 명단이 비어 있어요" }),
      h("p", { text: hcHas(pick) ? "호클래스 이 강의실에 학생이 아직 없어요. 호클래스 어드민의 학생 관리에서 넣어 주세요."
        : "오른쪽 위 '명단 편집'에서 학생 이름을 붙여 넣으면 출결과 수합을 쓸 수 있어요." }))]);
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
    h("div", { class: "summary" }, sum("", "재적 · 출석", `${present}/${list.length}`), sum("absent", "결석", absent.length), sum("late", "지각", late.length), sum("early", "조퇴", early.length)),
    h("p", { class: "tip", text: "학생 칸을 누를 때마다 결석 → 지각 → 조퇴 → 출석 순으로 바뀌어요." }),
    h("div", { class: "students" }, ...tiles),
    h("div", { class: "row" },
      h("button", { class: "btn small", type: "button", text: "출결 요약 복사", onclick: () => copyText(report()) }),
      Object.keys(day).length ? h("button", { class: "btn small secondary", type: "button", text: "오늘 기록 초기화", onclick: (e) => {
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
  } }, h("input", { type: "text", id: "colName", class: "grow", placeholder: "새 수합 항목 (예: 현장체험학습 동의서)", maxlength: "40", autocomplete: "off" }),
    myLessons.length ? colCl : null, myLessons.length ? colPart : null,
    h("button", { class: "btn small", type: "submit", text: "추가" }));
  if (!activeCollect) return [addForm, h("p", { class: "empty", text: "가정통신문 회신, 동의서처럼 걷어야 할 것을 추가해 보세요." })];
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
    if (linked) { toast("이 항목은 호클래스 제출을 그대로 봐요"); return; }
    c.got = gotSet.has(st.id) ? c.got.filter(id => id !== st.id) : [...c.got, st.id];
    saveEnc(D); renderClass();
  }, String(gotSet.has(st.id))));
  const missText = missing.length ? `${c.title} 미제출 ${missing.length}명: ${missing.map(who).join(", ")}` : `${c.title} 전원 제출`;
  return [
    addForm, tabs,
    linked ? h("p", { class: "tip", text: "호클래스 제출을 그대로 보는 항목이에요. 손으로 체크하지 않습니다." }) : null,
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
  } }, h("input", { type: "text", id: "noticeIn", class: "grow", placeholder: "조·종례 때 전할 내용", maxlength: "200", autocomplete: "off" }), h("button", { class: "btn small", type: "submit", text: "추가" }));
  const ours = mine(items);
  const list = ours.length ? ours.map(n => {
    const chk = h("button", { class: "check", type: "button", "aria-label": n.done ? "전달 취소" : "전달함으로 표시", "aria-pressed": String(!!n.done), onclick: () => { n.done = !n.done; saveEnc(D); renderClass(); } });
    chk.innerHTML = CHECK;
    return h("li", { class: "todo" + (n.done ? " done" : "") }, chk, h("span", { class: "todo-text", text: n.text }),
      h("button", { class: "del", type: "button", "aria-label": "삭제", text: "×", onclick: () => { D.value.items = items.filter(x => x.id !== n.id); saveEnc(D); renderClass(); } }));
  }) : [h("li", { class: "empty", text: "전달할 내용을 적어두고, 전달하면 체크하세요." })];
  const doneCount = ours.filter(n => n.done).length;
  return [
    form,
    h("ul", { class: "todo-list" }, ...list),
    h("div", { class: "row" },
      ours.length ? h("button", { class: "btn small", type: "button", text: "전달사항 복사", onclick: () => copyText(ours.filter(n => !n.done).map((n, i) => `${i + 1}. ${n.text}`).join("\n") || "전달할 내용이 없어요") }) : null,
      doneCount ? h("button", { class: "btn small secondary", type: "button", text: `전달한 ${doneCount}개 지우기`, onclick: () => { D.value.items = items.filter(n => !(n.done && itemCls(n) === picked())); saveEnc(D); renderClass(); } }) : null),
  ];
}

/* ---------- 학사일정 가져오기 ---------- */
// 아티팩트 안에서는 바깥 주소를 직접 부를 수 없다. 그래서 두 길로 받는다.
// 1) 선생님이 학사일정을 붙여넣으면 날짜를 뽑아 D-day로 넣는다.
// 2) desk_calendar 문서를 밖에서 채워 주면 읽어서 함께 보여 준다. (나이스 공개 API는 바깥에서 받아 넣는다)
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

// 나이스에서 받아 둔 일정과 손으로 넣은 D-day를 한 줄로 합친다.
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
  const ta = h("textarea", { id: "calText", placeholder: "학사일정을 그대로 붙여넣으세요.\n예)\n12.24.(수) 겨울방학식\n2027-02-05 졸업식\n3월 2일 시업식" });
  const err = h("p", { class: "form-err", role: "alert" });
  const note = h("p", { class: "tip", text: "나이스나 학교 홈페이지의 학사일정을 긁어 붙이면 날짜를 찾아 D-day로 넣어요." });
  box.replaceChildren(h("div", { class: "roster-editor" }, ta, note, err,
    h("div", { class: "row" },
      h("button", { class: "btn small", type: "button", id: "calAdd", text: "날짜 찾아 넣기", onclick: () => {
        const found = parseSchedule(ta.value, state.year.current);
        if (!found.length) { err.textContent = "날짜를 찾지 못했어요. 12.24 겨울방학식처럼 날짜와 이름이 한 줄에 있어야 해요."; return; }
        const have = new Set(state.ddays.map(x => x.date + " " + x.title));
        let added = 0;
        for (const f of found) {
          if (have.has(f.date + " " + f.title)) continue;
          have.add(f.date + " " + f.title);
          state.ddays.push({ id: uid(), title: f.title, date: f.date });
          added++;
        }
        save(true); calOpen = false; renderCalBox(); renderDdays(); renderMeta(new Date()); renderBook();
        toast(added ? `일정 ${added}개를 넣었어요` : "이미 들어 있는 일정이에요");
      } }),
      h("button", { class: "btn small secondary", type: "button", text: "취소", onclick: () => { calOpen = false; renderCalBox(); } }))));
}

/* ---------- 백업 파일과 복원 ---------- */
// 암호화된 기록은 암호문 그대로 파일에 담는다. 파일만 새어 나가도 내용은 열리지 않는다.
const BACKUP_TAG = "my-desk-backup";
let bkBusy = false, bkPicked = null, bkNote = "", bkErr = ""; // 안내 글은 동기화로 다시 그려도 남아 있게 들고 있는다

async function collectBodies() {
  const out = {};
  for (const col of DESK_COLS) {
    const snap = await FB.getDocs(FB.collection(FB.db, col));
    snap.forEach(d => { out[col + "/" + d.id] = d.data(); });
  }
  return { docs: out };
}
async function exportBackup() {
  if (!cloud) throw new Error("저장소에 연결되지 않아 백업을 만들 수 없어요.");
  const got = await collectBodies();
  const keys = Object.keys(got.docs);
  if (!keys.length) throw new Error("저장된 기록이 아직 없어요.");
  const data = JSON.stringify({ tag: BACKUP_TAG, v: 2, at: new Date().toISOString(), count: keys.length, docs: got.docs });
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = `나의책상-백업-${todayKey()}.json`;
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
        no(new Error("나의 책상 백업 파일이 아니에요."));
        return;
      }
      if (o.v !== 2) {
        no(new Error("예전 아티팩트판 백업이에요. 이 판으로는 되돌릴 수 없어요."));
        return;
      }
      ok(o);
    };
    r.onerror = () => no(new Error("파일을 읽지 못했어요."));
    r.readAsText(file);
  });
}
async function restoreBackup(o) {
  if (!cloud) throw new Error("저장소에 연결되지 않아 되돌릴 수 없어요.");
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
function backupPanel() {
  const err = h("p", { class: "form-err", role: "alert", text: bkErr });
  const note = h("p", { class: "tip", text: bkNote });
  const setErr = (t) => { bkErr = t; err.textContent = t; };
  const setNote = (t) => { bkNote = t; note.textContent = t; };
  const expBtn = h("button", { class: "btn small secondary", type: "button", id: "bkSave", text: "백업 파일 내보내기" });
  expBtn.addEventListener("click", async () => {
    if (bkBusy) return;
    bkBusy = true; setErr(""); expBtn.disabled = true; expBtn.textContent = "모으는 중…";
    try {
      const r = await exportBackup();
      setNote(`기록 ${r.count}개를 파일로 보냈어요.` + (r.capped ? " 기록이 많아 앞의 1000개만 담았어요." : ""));
      toast("백업 파일을 내보냈어요");
    } catch (e) {
      if (e && e.code === "declined") setNote("내려받기를 취소했어요.");
      else setErr((e && e.message) || "백업 파일을 만들지 못했어요.");
    } finally { bkBusy = false; expBtn.disabled = false; expBtn.textContent = "백업 파일 내보내기"; }
  });

  const fileIn = h("input", { type: "file", id: "bkFile", accept: ".json,application/json" });
  const pickNote = h("p", { class: "tip", text: bkPicked ? bkPickedNote() : "" });
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
      toast(`기록 ${n}개를 되돌렸어요. 그때 쓰던 비밀번호로 다시 열어 주세요`);
    } catch (e) {
      setErr((e && e.message) || "되돌리지 못했어요.");
    } finally { bkBusy = false; impBtn.disabled = false; resetArm(); }
  });

  return h("div", { class: "lock-panel divided backup" },
    h("h3", { text: "백업" }),
    h("p", { text: "기록을 파일 한 장으로 내려받아 둘 수 있어요. 암호로 잠근 기록은 잠긴 채로 담기니, 되돌릴 때 그때 쓰던 비밀번호나 복구 키가 있어야 열려요." }),
    h("div", { class: "row" }, expBtn),
    note,
    h("div", { class: "file-row" }, fileIn),
    pickNote,
    h("div", { class: "row" }, impBtn),
    err,
    h("p", { class: "tip", text: "되돌리면 지금 저장된 기록을 백업 파일 내용으로 덮어씁니다." }));
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

// 보는 반은 카드와 수첩이 하나다. 카드에서 바꾸면 수첩도 따라간다.
const bCls = () => picked();
// 반을 바꾼다. 카드와 수첩을 같이 다시 그린다.
function goClass(c) {
  if (pickedCls === c) return;
  pickedCls = c; bookSid = ""; rosterOpen = false; activeCollect = null; sendPlan = null;
  renderRoster(); renderClass(); renderBook();
}
// 호클래스에 있는 반은 호클래스가 정본이다. 없는 반(담임 반 같은 것)만 수첩에 손으로 넣는다.
function rosterOf(cls) {
  if (hcHas(cls)) return (hc.byCls[cls] || []).map(s => ({ id: s.id, n: s.n, name: s.name }));
  const v = docs.roster && docs.roster.value;
  const c = v && v.classes && v.classes[cls];
  const list = c && Array.isArray(c.students) ? c.students : [];
  return list.filter(s => !s.gone).sort((a, b) => a.no - b.no).map(s => ({ id: s.id, n: s.no, name: (s.name || "").trim() }));
}
function stuOf(cls, sid) { return rosterOf(cls).find(s => s.id === sid) || null; }
// 받아 둔 출결 문서에서 칸을 꺼낸다. 고치지 않고 읽기만 한다.
function marksIn(v) { return (v && v.marks) || {}; }
const attKeyOf = (day, cls) => `y${yearOpen}_att_${day}_${cls}`;
// 지금 열려 있는 반은 살아 있는 값을, 나머지는 받아 둔 사본을 쓴다.
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
// 한 문서를 받아 풀어서 사본으로 둔다.
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
// 오늘 출결 요약은 반별 문서를 따로 받아야 한다. 오늘 화면을 열면 한 번만 받는다.
let todayAttLoaded = "";
async function loadTodayAtt() {
  const day = todayKey(), want = day + "|" + cardClasses().join(",");
  if (todayAttLoaded === want || attBusy || !cloud || !dataKey) return;
  todayAttLoaded = want;
  for (const c of cardClasses()) {
    if (attDay === day && attCls === c) continue;   // 열려 있는 반은 살아 있는 값을 쓴다
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
    body.replaceChildren(noneLine(ks === "locked" || ks === "recovery" ? "수첩은 잠겨 있어요. 위 '우리 반'에서 비밀번호를 넣으면 열려요."
      : ks === "none" ? "비밀번호를 먼저 만들면 수첩을 쓸 수 있어요."
      : "수첩을 여는 중이에요."));
    return;
  }
  if (!state.year.configured) { body.replaceChildren(noneLine("'올해 설정'에서 담임 반과 수업 반을 넣으면 수첩을 쓸 수 있어요.")); return; }
  if (!bookReady()) { body.replaceChildren(noneLine("기록을 여는 중이에요.")); return; }
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
  const goCls = (c) => { goClass(c); toast(classLabel(c) + "으로 옮겼어요"); };

  const classes = panel("오늘 수업", (() => {
    if (!row) return noneLine("주말에는 수업이 없어요.");
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
        parts.length ? h("div", { class: "body", text: parts.join(" · ") }) : h("div", { class: "body", text: "전원 출석" }),
        h("div", { class: "marks" }, h("button", { class: "btn small secondary", type: "button", text: "이 반 보기", onclick: () => goCls(c) })));
    }).filter(Boolean);
    return rows.length ? h("ul", { class: "lines" }, ...rows) : noneLine("명단을 넣은 반이 아직 없어요.");
  })());

  const notes = panel("오늘 전달사항", (() => {
    const items = docs.notices.value.items.filter(n => !n.done);
    if (!items.length) return noneLine("전달할 내용이 없어요.");
    return h("ul", { class: "lines" }, ...items.map(n => h("li", { class: "line" },
      h("div", { class: "top" },
        h("span", { class: "ttl", text: n.text }),
        h("span", { class: "tag cls", text: itemCls(n) || "반 없음" })))));
  })());

  const jobs = panel("오늘 할 일 · 마감", (() => {
    const todos = state.todos.filter(t => !t.done).slice(0, 6);
    const works = docs.works.value.items.filter(w => !w.done && w.due && dnum(w.due) <= 7)
      .sort((a, b) => a.due.localeCompare(b.due));
    if (!todos.length && !works.length) return noneLine("급한 일이 없어요.");
    return h("ul", { class: "lines" },
      ...works.map(w => {
        const n = dnum(w.due);
        return h("li", { class: "line" }, h("div", { class: "top" },
          h("span", { class: "ttl", text: w.title }),
          h("span", { class: "due " + dueCls(n), text: dLabel(n) })));
      }),
      ...todos.map(t => h("li", { class: "line" }, h("div", { class: "top" }, h("span", { class: "ttl", text: t.text }), h("span", { class: "when", text: "할 일" })))));
  })());

  const cons = panel("오늘 상담·민원", (() => {
    const items = docs.consults.value.items.filter(x => x.at === today);
    const addBtn = h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "상담·민원 적기", onclick: () => { bookPage = "consult"; renderBook(); } }));
    if (!items.length) return h("div", { class: "panel-body" }, noneLine("오늘 적은 기록이 없어요."), addBtn);
    return h("div", null, h("ul", { class: "lines" }, ...items.map(consultLine)), addBtn);
  })());

  return [classes, attToday, jobs, notes, cons];
}

/* ---------- 학생 ---------- */
function studentPage() {
  const cls = bCls(), list = rosterOf(cls), ym = ymOf(todayKey());
  const pickRow = clsRow(cls, goClass);
  if (!list.length) return [panel("학생", pickRow, noneLine("이 반은 명단이 비어 있어요. 위 카드의 '명단 편집'에서 넣어 주세요."))];
  if (!list.find(s => s.id === bookSid)) bookSid = "";
  const grid = h("div", { class: "stu-pick" }, ...list.map(s => h("button", {
    type: "button", "aria-pressed": String(s.id === bookSid), "aria-label": who(s),
    onclick: () => { bookSid = s.id === bookSid ? "" : s.id; renderBook(); },
  }, h("span", { class: "n", text: String(s.n) }), shownName(s) ? h("span", { class: "nm", text: s.name }) : null)));
  const left = panel("학생 고르기", pickRow, grid, h("p", { class: "tip", text: "학생을 누르면 그 학생의 기록이 옆에 열려요." }));
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
    })),
    h("p", { class: "tip", text: "지난 날짜의 출결은 날마다 따로 보관돼서, 누를 때 모아 와요." }));

  const miss = panel("수합 미제출", (() => {
    const items = docs.collects.value.items.filter(c => itemCls(c) === cls && !(c.got || []).includes(bookSid));
    return items.length ? h("ul", { class: "lines" }, ...items.map(c => h("li", { class: "line" },
      h("div", { class: "top" }, h("span", { class: "ttl", text: c.title }), h("span", { class: "tag open", text: "미제출" })))))
      : noneLine("미제출이 없어요.");
  })());

  const mine = docs.consults.value.items.filter(x => x.sid === bookSid);
  const cons = panel("이 학생 상담·민원",
    mine.length ? h("ul", { class: "lines" }, ...mine.slice().sort((a, b) => b.at.localeCompare(a.at)).map(consultLine)) : noneLine("기록이 없어요."),
    h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "이 학생 상담 적기", onclick: () => { bookPage = "consult"; renderBook(); } })));

  const noteEl = h("textarea", { id: "stuNote", placeholder: "학급 운영에 필요한 것만 짧게. 건강·가정 형편처럼 민감한 내용은 꼭 필요할 때만 적어 주세요.", value: rec.note || "" });
  const note = panel("학생 메모", noteEl,
    h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "저장", onclick: () => {
      S.value.byId[bookSid] = { ...rec, note: noteEl.value.trim() };
      saveEnc(S); toast("메모를 저장했어요"); renderBook();
    } })),
    h("p", { class: "tip", text: "이 메모는 이 기기에서 암호로 잠근 뒤 저장돼요." }));

  const head = panel("학생",
    h("div", { class: "who" },
      h("span", { class: "nm", text: shownName(st) ? st.name : st.n + "번" }),
      h("span", { class: "meta", text: classLabel(cls) + " " + st.n + "번" })),
    h("div", { class: "row" }, h("button", { class: "btn small secondary", type: "button", text: "출결 요약 복사", onclick: () => {
      copyText(`${classLabel(cls)} ${who(st)} ${ym} 결석 ${cnt.결석} 지각 ${cnt.지각} 조퇴 ${cnt.조퇴}`);
    } })));
  return [left, head, att, miss, cons, note];
}

/* ---------- 상담·민원 ---------- */
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
      h("button", { class: "btn small secondary", type: "button", text: x.done ? "다시 진행 중" : "마무리", onclick: () => { x.done = !x.done; saveEnc(D); renderBook(); } }),
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
  const titleIn = h("input", { type: "text", id: "coTitle", placeholder: "무슨 일인지 한 줄 (예: 지각 잦음 상담)", maxlength: "80", autocomplete: "off" });
  const bodyIn = h("textarea", { id: "coBody", placeholder: "오고 간 이야기" });
  const actIn = h("textarea", { id: "coAction", placeholder: "조치와 다음에 할 일" });
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
    saveEnc(D); bookSid = sidIn.value || bookSid; renderBook(); toast("기록했어요");
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
  const list = panel("기록 " + items.length + "건" + (open ? " · 진행 중 " + open : ""),
    items.length ? h("ul", { class: "lines" }, ...items.map(consultLine)) : noneLine("상담이나 민원을 적어 두면 여기 쌓여요."));
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
  const unitIn = h("input", { type: "text", id: "leUnit", placeholder: "단원 (예: 3단원 조선의 성립)", maxlength: "60", autocomplete: "off" });
  // 호클래스 차시를 고르면 날짜와 단원을 채워 준다.
  const clIn = h("select", { id: "leCl" }, h("option", { value: "", text: "고르지 않음" }),
    ...lessons.map(x => h("option", { value: x.clId, text: `${x.order}차시 ${x.title || "제목 없음"}${x.date ? " · " + x.date : ""}` })));
  clIn.addEventListener("change", () => {
    const x = lessons.find(y => y.clId === clIn.value);
    if (!x) return;
    if (x.date) atIn.value = x.date;
    if (x.title && !unitIn.value.trim()) unitIn.value = x.title;
  });
  const bodyIn = h("textarea", { id: "leBody", placeholder: "한 것, 남은 것" });
  const hwIn = h("input", { type: "text", id: "leHw", placeholder: "과제 (없으면 비워 두세요)", maxlength: "120", autocomplete: "off" });
  const err = h("p", { class: "form-err", role: "alert" });
  const form = h("form", { class: "book-form", id: "leForm", onsubmit: (e) => {
    e.preventDefault();
    if (!cls) { err.textContent = "'올해 설정'에서 수업 반을 먼저 넣어 주세요."; return; }
    if (!unitIn.value.trim() && !bodyIn.value.trim()) { err.textContent = "단원이나 내용 하나는 적어 주세요."; return; }
    D.value.items.unshift({
      id: uid(), cls, at: atIn.value || todayKey(), period: Number(perIn.value),
      unit: unitIn.value.trim().slice(0, 60), body: bodyIn.value.trim().slice(0, 1000), hw: hwIn.value.trim().slice(0, 120),
      clId: clIn.value || "",
    });
    saveEnc(D); renderBook(); toast(classLabel(cls) + " 수업을 적었어요");
  } },
    h("div", { class: "form-grid" },
      field("날짜", atIn), field("교시", perIn),
      lessons.length ? h("label", { class: "field wide" }, "호클래스 차시 (고르면 날짜와 단원을 채워 줘요)", clIn) : null,
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
    panel(classLabel(cls) + " 기록 " + mine.length + "건", lines.length ? h("ul", { class: "lines" }, ...lines) : noneLine("이 반 수업을 적어 두면 여기 쌓여요.")),
    hcPanel(cls, lessons),
  ];
}

/* ---------- 호클래스 차시 칸 (연동) ---------- */
function hcPanel(cls, lessons) {
  if (!hcHas(cls)) return null;
  if (!lessons.length) return panel("호클래스 차시", noneLine("이 강의실에 꽂힌 차시가 없어요. 호클래스 어드민에서 강의를 꽂아 주세요."));
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
    h("p", { class: "tip", text: "결석을 보내면 호클래스에서 그 차시 성적 영역이 미달성으로 고정돼요. 지각·조퇴는 성적과 상관없으니 보내지 않습니다." }));
}
async function putDate(x) {
  if (sendBusy) return;
  sendBusy = true;
  try {
    const ok = await fillLessonDate(FB, x.clId, todayKey());
    toast(ok ? "차시 날짜를 넣었어요" : "이미 날짜가 적혀 있어요");
    await loadHcLessons();
  } catch (e) { toast("날짜를 넣지 못했어요"); }
  finally { sendBusy = false; renderBook(); }
}
// 그 차시 날짜의 수첩 출결에서 결석만 골라 확인 화면을 만든다.
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
      h("span", { class: "meta", text: `${classLabel(p.cls)} · ${p.day}` })),
  ];
  if (!p.absent.length) {
    kids.push(noneLine("그날 그 반에 결석으로 적은 학생이 없어요."));
  } else {
    kids.push(h("p", { class: "tip", text: "보낼 학생을 확인해 주세요. 빼고 싶으면 눌러서 꺼 주세요." }));
    kids.push(h("div", { class: "stu-pick" }, ...p.absent.map(st => h("button", {
      type: "button", "aria-pressed": String(p.picked.has(st.id)),
      onclick: () => { if (p.picked.has(st.id)) p.picked.delete(st.id); else p.picked.add(st.id); renderBook(); },
    }, h("span", { class: "n", text: String(st.n) }), shownName(st) ? h("span", { class: "nm", text: st.name }) : null))));
  }
  if (p.other.length) {
    kids.push(h("div", { class: "missing", text: "지각·조퇴 " + p.other.map(who).join(", ") + " 는 성적과 상관없어서 보내지 않아요." }));
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
    toast(`호클래스 ${p.x.order}차시에 결석 ${nos.length}명을 보냈어요`);
    sendPlan = null;
  } catch (e) {
    toast("보내지 못했어요. 다시 해 보세요");
  } finally { sendBusy = false; renderBook(); }
}

/* ---------- 업무 ---------- */
function workPage() {
  const D = docs.works, items = D.value.items;
  const titleIn = h("input", { type: "text", id: "woTitle", placeholder: "업무 (예: 학교폭력 실태조사 회신)", maxlength: "100", autocomplete: "off" });
  const dueIn = h("input", { type: "date", id: "woDue" });
  const fromIn = h("input", { type: "text", id: "woFrom", placeholder: "어디서 온 일 (예: 교육청 공문)", maxlength: "60", autocomplete: "off" });
  const memoIn = h("textarea", { id: "woMemo", placeholder: "해야 할 것, 참고" });
  const err = h("p", { class: "form-err", role: "alert" });
  const form = h("form", { class: "book-form", id: "woForm", onsubmit: (e) => {
    e.preventDefault();
    if (!titleIn.value.trim()) { err.textContent = "업무 이름을 적어 주세요."; return; }
    D.value.items.unshift({
      id: uid(), title: titleIn.value.trim().slice(0, 100), due: dueIn.value || "",
      from: fromIn.value.trim().slice(0, 60), memo: memoIn.value.trim().slice(0, 1000), done: false,
    });
    saveEnc(D); renderBook(); toast("업무를 적었어요");
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
        h("button", { class: "btn small secondary", type: "button", text: x.done ? "다시 하기" : "다 했어요", onclick: () => { x.done = !x.done; saveEnc(D); renderBook(); } }),
        armed("삭제", "삭제", () => { D.value.items = items.filter(y => y.id !== x.id); saveEnc(D); renderBook(); })));
  });
  const left = items.filter(x => !x.done).length;
  const over = items.filter(x => !x.done && x.due && dnum(x.due) < 0).length;
  return [
    panel("새 업무", form),
    panel("업무 " + left + "건 남음" + (over ? " · 기한 지남 " + over : ""),
      lines.length ? h("ul", { class: "lines" }, ...lines) : noneLine("공문이나 맡은 일을 적어 두면 기한 가까운 것부터 보여 줘요.")),
  ];
}

/* ---------- 할 일 ---------- */
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';
function renderTodos() {
  const list = $("todoList");
  const total = state.todos.length, done = state.todos.filter(t => t.done).length;
  $("todoCount").textContent = `${done} / ${total} 완료`;
  $("todoBar").style.width = total ? (done / total * 100) + "%" : "0%";
  $("clearDone").hidden = done === 0;
  if (!total) { list.replaceChildren(h("li", { class: "empty", text: "처리할 업무를 위에 적어보세요." })); return; }
  const ordered = [...state.todos.filter(t => !t.done), ...state.todos.filter(t => t.done)];
  list.replaceChildren(...ordered.map((t) => {
    const chk = h("button", { class: "check", type: "button", "aria-label": t.done ? "완료 취소" : "완료로 표시", "aria-pressed": String(!!t.done), onclick: () => { t.done = !t.done; save(); renderTodos(); } });
    chk.innerHTML = CHECK;
    return h("li", { class: "todo" + (t.done ? " done" : "") }, chk, h("span", { class: "todo-text", text: t.text }),
      h("button", { class: "del", type: "button", "aria-label": "삭제", text: "×", onclick: () => { state.todos = state.todos.filter(x => x.id !== t.id); save(); renderTodos(); } }));
  }));
}
$("todoForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("todoInput").value.trim(); if (!v) return;
  state.todos.push({ id: uid(), text: v.slice(0, 200), done: false });
  $("todoInput").value = ""; save(); renderTodos();
});
$("clearDone").addEventListener("click", () => { state.todos = state.todos.filter(t => !t.done); save(); renderTodos(); });

/* ---------- D-day ---------- */
function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function renderDdays() {
  const list = $("ddayList");
  const t0 = parseDate(todayKey());
  const items = allDdays();
  if (!items.length) { list.replaceChildren(h("li", { class: "empty", text: "기말고사, 방학식, 생기부 마감일을 추가해 보세요. '일정 붙여넣기'로 한 번에 넣을 수도 있어요." })); return; }
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
      x.src ? null : h("button", { class: "del", type: "button", "aria-label": `${x.title} 삭제`, text: "×", onclick: () => { state.ddays = state.ddays.filter(y => y.id !== x.id); save(); renderDdays(); renderMeta(new Date()); } }));
  }));
  if (state.calAt) list.append(h("li", { class: "cal-src", text: `나이스 학사일정 ${state.calSchool ? state.calSchool + " " : ""}· ${state.calAt.slice(0, 10)} 받음` }));
}
$("ddayForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("ddayName").value.trim(), date = $("ddayDate").value;
  if (!title) { $("ddayName").focus(); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $("ddayDate").focus(); return; }
  state.ddays.push({ id: uid(), title: title.slice(0, 60), date });
  $("ddayName").value = ""; $("ddayDate").value = ""; save(); renderDdays(); renderMeta(new Date());
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
  renderPeriods(now); renderTT(); renderMeta(now); renderNow(now);
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
