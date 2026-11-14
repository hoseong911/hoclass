// 가짜 파이어스토어와 Auth 로 끝까지 돌린다. 실제 파베는 건드리지 않는다. (cd desk && npm test)
const fs = require("fs"), path = require("path"), assert = require("assert");
const { JSDOM } = require("jsdom");
const { checkKorean } = require("./korean.js");
const { checkFirestoreValue } = require("./fsvalue.js");
const webcrypto = require("crypto").webcrypto;

const DIR = path.join(__dirname, "..");
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, label, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) {} await wait(25); }
  throw new Error("시간 초과: " + label);
}

/* ---------- 가짜 파이어스토어 ---------- */
const store = new Map();
const listeners = new Map();
const clone = (o) => JSON.parse(JSON.stringify(o));
const put = (p, body) => store.set(p, JSON.stringify(body));
function mkSnap(p) {
  const has = store.has(p);
  const body = has ? JSON.parse(store.get(p)) : undefined;
  return { id: p.split("/").pop(), exists: () => has, data: () => body, metadata: { fromCache: false, hasPendingWrites: false } };
}
function notify(p) { for (const fn of listeners.get(p) || []) setTimeout(() => fn(mkSnap(p)), 4); }

/* ---------- 호클래스 쪽 밑자료 (실제와 같은 모양) ---------- */
const HC_NAMES = { "301": ["김지우", "이주서", "박세찌"], "302": ["최이반", "정이반"] };
function seedHoclass() {
  for (const room of Object.keys(HC_NAMES)) {
    const cid = "c_h" + room;
    put("hoclass_courses/" + cid, { id: cid, year: "2027", subject: "역사", grade: room[0], classNo: String(Number(room.slice(1))), schedule: "금", status: "active" });
    HC_NAMES[room].forEach((name, i) => {
      const no = room + String(i + 1).padStart(2, "0");
      put("hoclass_course_students/" + cid + "_" + no, { courseId: cid, studentNo: no, name });
      put("hoclass_course_roster/2027_" + no, { id: "2027_" + no, year: "2027", studentNo: no, name });
    });
  }
  put("hoclass_courses/c_h201", { id: "c_h201", year: "2026", subject: "역사", grade: "2", classNo: "1", status: "active" });

  put("hoclass_lessons/L1", { id: "L1", title: "3단원 조선의 성립", order: 1, parts: { concept: true, mission: true, question: true } });
  put("hoclass_lessons/L2", { id: "L2", title: "4단원 조선의 문화", order: 2, parts: { concept: true, mission: true } });
  put("hoclass_course_lessons/cl1", { id: "cl1", courseId: "c_h301", lessonId: "L1", order: "1", isOpen: true, date: TODAY });
  put("hoclass_course_lessons/cl2", { id: "cl2", courseId: "c_h301", lessonId: "L2", order: "2", isOpen: true, date: "" });
  for (const no of ["30101", "30103"]) {
    put("hoclass_course_submissions/cl1_mission_" + no, { clId: "cl1", part: "mission", courseId: "c_h301", studentNo: no, answer: "냈어요" });
  }
}
function renameHoclassStudent(room, idx, newName) {
  const no = room + String(idx).padStart(2, "0");
  const p = "hoclass_course_students/c_h" + room + "_" + no;
  const b = JSON.parse(store.get(p));
  b.name = newName; put(p, b);
}

const writes = [], hcWrites = [];
/* 저장소 연결이 끊긴 것을 흉내 낼 때 부를 콜백들 */
const errCbs = new Set();
function breakCloud() { const all = [...errCbs]; errCbs.clear(); for (const f of all) f(new Error("끊김")); }
function makeFB() {
  const user = { uid: "t1", email: "ho0911seong@gmail.com", displayName: "" };
  let current = null; const authCbs = [];
  return {
    db: { _fake: true }, auth: { _fake: true },
    doc: (_db, col, id) => ({ _p: col + "/" + id }),
    collection: (_db, col) => ({ _c: col }),
    getDoc: async (ref) => mkSnap(ref._p),
    setDoc: async (ref, body) => {
      if (!current) { const e = new Error("no auth"); e.code = "permission-denied"; throw e; }
      checkFirestoreValue(body, ref._p, false);
      (ref._p.startsWith("hoclass_") ? hcWrites : writes).push(ref._p);
      put(ref._p, clone(body)); notify(ref._p);
    },
    getDocs: async (q) => {
      const want = q._c + "/";
      const docs = [...store.keys()].filter(k => k.startsWith(want)).sort().map(mkSnap);
      return { docs, forEach: (fn) => docs.forEach(fn) };
    },
    onSnapshot: (ref, next, err) => {
      const p = ref._p;
      if (!listeners.has(p)) listeners.set(p, new Set());
      listeners.get(p).add(next);
      if (err) errCbs.add(err);
      setTimeout(() => next(mkSnap(p)), 4);
      return () => listeners.get(p).delete(next);
    },
    signInWithEmailAndPassword: async (_a, email, pw) => {
      if (email !== user.email || pw !== "계정비밀번호") { const e = new Error("bad"); e.code = "auth/invalid-credential"; throw e; }
      current = user; authCbs.forEach(cb => cb(current));
      return { user: current };
    },
    signOut: async () => { current = null; authCbs.forEach(cb => cb(null)); },
    onAuthStateChanged: (_a, cb) => { authCbs.push(cb); setTimeout(() => cb(current), 0); return () => {}; },
    query: (c) => c, where: () => ({}), orderBy: () => ({}), limit: () => ({}),
    runTransaction: async (_db, fn) => fn({
      get: async (ref) => mkSnap(ref._p),
      set: (ref, body) => { checkFirestoreValue(body, ref._p, false); writes.push(ref._p); put(ref._p, clone(body)); notify(ref._p); },
    }),
  };
}

/* ---------- 화면 띄우기 ---------- */
let neisArgs = {};   // 나이스 가짜가 받은 인수를 여기 적어 둔다
const errs = [], saved = [];
function device(ls = {}) {        // ls: 이 기기 브라우저에 미리 있던 localStorage
  const dom = new JSDOM(fs.readFileSync(path.join(DIR, "index.html"), "utf8"), {
    runScripts: "outside-only", url: "https://hoseong911.github.io/hoclass/desk/", pretendToBeVisual: true,
  });
  const w = dom.window, d = w.document;
  // jsdom 은 <link> 를 따라가지 않아 desk.css 를 직접 넣는다.
  const style = d.createElement("style");
  style.textContent = fs.readFileSync(path.join(DIR, "desk.css"), "utf8");
  d.head.append(style);
  Object.defineProperty(w, "crypto", { value: webcrypto });
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.__FB__ = makeFB();
  w.__GCAL__ = {
    savedToken: () => null, forgetToken: () => {},
    connect: async () => { const e = new Error("시험에서는 연결하지 않는다"); throw e; },
    listEvents: async () => [], byDay: () => [],
    why: (e) => ({ step: 0, msg: String((e && e.message) || "") }),
    CONSOLE_URL: "https://example.invalid/",
  };
  /* 나이스는 바깥 인터넷이라 시험에서는 부르지 않는다 */
  neisArgs = {};
  w.__NEIS__ = {
    findSchools: async () => [{ name: "인천동양중학교", atpt: "E10", code: "7331219", kind: "중학교", office: "인천광역시교육청", address: "" }],
    loadSchedule: async () => [{ d: "2027-03-02", name: "입학식" }, { d: "2027-07-20", name: "여름방학식" }],
    loadMeal: async () => [{ kind: "중식", dishes: ["흑미밥", "된장국"], kcal: "800 Kcal" }],
    loadMyWeek: async (...a) => { neisArgs.week = a;
      const subjects = a[4] || [];
      if (!subjects.length || subjects.some(x => !x.name || !x.classes.length)) {
        throw new Error("과목과 반 없이 받아오면 첫 반이 모든 칸을 먹는다");
      }
      return [["3-1", "", "", "", "", "", ""], ["", "", "", "", "", "", ""],
              ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""]]; },
    loadClassDay: async () => [],
    loadRoomCounts: async () => ({ 1: 10, 2: 10, 3: 10 }),
    mondayOf: () => "20261109", semesterOf: () => 2, addDays: (y) => y, KEY_HINT: "",
  };
  w.URL.createObjectURL = (blob) => { saved.push(blob); return "blob:fake/" + saved.length; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { this.dispatchEvent(new w.Event("click")); };
  w.addEventListener("error", (e) => errs.push("페이지 오류: " + e.message));
  w.addEventListener("unhandledrejection", (e) => errs.push("처리 안 된 거부: " + (e.reason && e.reason.message)));
  // jsdom 은 import 를 못 따라가서 모듈을 이어 붙인다.
  const sideCode = ["../shared/icons.js", "grid.js", "hoclass.js"]
    .map(f => fs.readFileSync(path.join(DIR, f), "utf8").replace(/^export /gm, ""))
    .join("\n");
  const deskCode = fs.readFileSync(path.join(DIR, "desk.js"), "utf8")
    .replace(/^import \{ FB \} from "\.\/fb-desk\.js";$/m, "const FB = window.__FB__;")
    .replace(/^import \{[^}]*\} from "\.\/hoclass\.js";$/m, "")
    .replace(/^import \{[^}]*\} from "\.\/grid\.js";$/m, "")
    .replace(/^import \* as GCal from "\.\/gcal\.js";$/m, "const GCal = window.__GCAL__;")
    .replace(/^import \* as Neis from "\.\/neis\.js";$/m, "const Neis = window.__NEIS__;")
    .replace(/^import \{ icon as svgIc, resolveIcon \} from "\.\.\/shared\/icons\.js";$/m,
             "const svgIc = icon;");
  const code = sideCode + "\n" + deskCode;
  if (/^\s*(import|export)\s/m.test(code)) throw new Error("import/export 를 못 걷어냈다");
  for (const [k, v] of Object.entries(ls)) w.localStorage.setItem(k, v);
  w.eval('"use strict"; ' + code);   // 브라우저처럼 엄격 모드로: 없는 이름에 쓰면 시험에서 걸린다
  const $ = (id) => d.getElementById(id);
  return {
    w, d, $,
    fill: (id, v) => { $(id).value = v; },
    submit: (id) => $(id).dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })),
    text: () => $("classBody").textContent,
    book: () => $("classBody").textContent,
    /* 교무수첩 장으로 가기(아래 장 이름 단추)와 장 안 작은 페이지 고르기 */
    go: (name) => [...d.querySelectorAll("#pagebar .pg-nb")].find(b => b.textContent === name).click(),
    sub: (k) => d.querySelector('#nbSeg [data-tab="' + k + '"]').click(),
    tab: (p) => {
      const page = { student: "담임", consult: "담임", ann: "담임", lesson: "수업", prog: "수업", work: "업무", todo: "업무", week: "업무" }[p];
      [...d.querySelectorAll("#pagebar .pg-nb")].find(b => b.textContent === page).click();
      d.querySelector('#nbSeg [data-tab="' + p + '"]').click();
    },
    setTab: (k) => {
      if ($("setPanel").hidden) $("toolSet").click();
      const b = d.querySelector('#setPanel .set-tab[data-tab="' + k + '"]');
      if (!b) throw new Error("설정 탭이 없다: " + k);
      b.click();
    },
    pickRoom: (id, g, r) => {
      d.querySelector("#" + id + ' [data-grade="' + g + '"]').click();
      d.querySelector("#" + id + ' .cpick[data-cls="' + g + "-" + r + '"]').click();
    },
    btn: (where, label) => [...d.querySelectorAll(where + " button")].find(b => b.textContent.includes(label)),
    pick: (c) => [...d.querySelectorAll("#classPick .cpick")].find(x => x.textContent.startsWith(c)).click(),
    stu: () => [...d.querySelectorAll("#classBody .stu")],
    /* 출결 한 건 적기: 학생 칸을 눌러 고르개를 열고 종류, 사유, 교시(조회 0, 1~7, 종례 8), 메모 */
    mark: async (i, k, r, ps = [], memo = "") => {
      [...d.querySelectorAll("#classBody .stu")][i].click();
      await until(() => $("attEd"), "출결 고르개");
      d.querySelector('#attEd .att-k [data-v="' + k + '"]').click();
      d.querySelector('#attEd .att-r [data-v="' + r + '"]').click();
      for (const p of ps) d.querySelector('#attEd .att-p [data-v="' + p + '"]').click();
      if (memo) { $("attMemo").value = memo; $("attMemo").dispatchEvent(new w.Event("input", { bubbles: true })); }
      $("attAdd").click();
      await until(() => !$("attEd"), "출결 한 건 저장");
    },
    wg: (id) => d.querySelector('.wg[data-w="' + id + '"]'),
    area: (id) => {
      const el = d.querySelector('.wg[data-w="' + id + '"]');
      return el ? el.style.gridArea : "";
    },
    absent: () => d.querySelectorAll("#classBody .stu.결석").length,
  };
}

const PASS = "수첩비밀번호2027";
const allStored = () => [...store.keys()].filter(k => k.startsWith("desk_")).map(k => store.get(k)).join("\n");
const TODAY = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/* jsdom 은 CSS 우선순위와 컨테이너 쿼리를 재지 못해서 규칙을 글자로 확인한다. */
function checkShrinkRules() {
  const css = fs.readFileSync(path.join(DIR, "desk.css"), "utf8");
  const need = [
    [".wg { container-type: size; }", "칸 크기를 재는 바탕"],
    ["scrollbar-width: none", "스크롤 막대 치우기"],
    [".deck.arranging .wg > .card { overflow: hidden; }", "배치 중에는 안 넘치게 자르기"],
    ["container-type: inline-size", "좁은 화면에서는 가로만 재기(안 하면 칸 높이가 0으로 접힌다)"],
    [".links { display: flex; flex-wrap: wrap; justify-content: center; align-content: center;",
     "바로가기를 작업 표시줄처럼 가운데로 모으기(몇 개 없어도 왼쪽에 쏠리지 않게)"],
    [".links { flex-wrap: nowrap; }",
     "가로로 긴 띠에서는 한 줄에 눕히고 이름은 그대로 두기"],
  ];
  for (const [text, why] of need) {
    assert(css.includes(text), "desk.css 에 `" + text + "` 가 있어야 한다: " + why);
  }
  const sizeAt = css.indexOf(".wg { container-type: size; }");
  const phoneAt = css.lastIndexOf("container-type: inline-size");
  assert(phoneAt > sizeAt, "폰에서 가로만 재는 규칙이 .wg { container-type: size } 보다 뒤에 있어야 한다");
  const js = fs.readFileSync(path.join(DIR, "desk.js"), "utf8");
  for (const name of ["STACK_MQ", "TWO_MQ"]) {
    const m = new RegExp("const " + name + ' = "([^"]+)"').exec(js);
    assert(m, "desk.js 에 " + name + " 가 있어야 한다");
    assert(css.includes("@media " + m[1] + " {"), "desk.css 에 desk.js 의 " + name + " 와 같은 조건이 있어야 한다: " + m[1]);
  }
  const wg = fs.readFileSync(path.join(DIR, "widget.js"), "utf8");
  const bells = (t) => String((/const DEFAULT_BELLS = \[([\s\S]*?)\];/.exec(t) || [])[1]).replace(/\s+/g, "");
  assert(bells(js).length > 40 && bells(js) === bells(wg),
    "desk.js 와 widget.js 의 종 시간 기본값이 같아야 한다(바탕화면 위젯이 다른 시각을 보인다)");
  assert(css.includes("grid-template-rows: none;"), "2단에서는 PC용 세로 칸 줄을 지워야 한다(안 지우면 간격이 틀어진다)");
  assert(css.includes(".wg { zoom: calc(var(--k, 1) * var(--z, 1)); }"),
    "해상도 배율(--k)과 칸 배율(--z)을 곱하는 규칙이 있어야 한다");
  assert(/justify-content:\s*center/.test(css.slice(css.indexOf(".wg-clock"), css.indexOf(".wg-clock") + 200)) === false,
    ".wg-clock 에 justify-content: center 를 쓰면 넘칠 때 위가 잘려 스크롤로도 못 본다. 자동 여백을 쓴다");
  assert(js.includes("function fitCard(") && js.includes("function clipOverflow("),
    "desk.js 에 칸 크기에 맞춰 줄이는 fitCard()/clipOverflow() 가 있어야 한다");
  assert(js.includes("fitCards(true)"), "칸을 옮기거나 창이 바뀌면 1배부터 다시 재야 한다");
  const n = (css.match(/@container/g) || []).length;
  assert(n >= 7, "칸 크기에 따라 줄이는 규칙이 모자란다(@container " + n + "개)");
}

/* wttr.in 코드 옮김표가 비·눈·뇌우를 제대로 가르는지 */
function checkWeatherCodes() {
  const js = fs.readFileSync(path.join(DIR, "desk.js"), "utf8");
  const m = /const WWO_WMO = [\s\S]*?^}/m.exec(js);
  assert(m, "desk.js 에 wttr.in → WMO 코드 옮김표가 있어야 한다");
  const to = new Function(m[0] + "; return wwoToWmo;")();
  for (const [wwo, wmo] of [[113, 0], [122, 3], [248, 45], [296, 61], [326, 71], [395, 95]]) {
    assert.equal(to(wwo), wmo, `wttr.in 코드 ${wwo} 는 WMO ${wmo} 로 가야 한다`);
  }
}

/* 고르개에 적어 둔 아이콘 이름이 호클래스 아이콘 묶음에 다 있는지 */
function checkIconNames() {
  const js = fs.readFileSync(path.join(DIR, "desk.js"), "utf8");
  const m = /const ICON_PICK = \[([\s\S]*?)\];/.exec(js);
  assert(m, "desk.js 에 ICON_PICK 이 있어야 한다");
  const names = m[1].match(/"[a-z0-9-]+"/g).map(s => s.slice(1, -1));
  const have = fs.readFileSync(path.join(DIR, "..", "shared", "icons.js"), "utf8");
  for (const n of names) {
    assert(have.includes('"' + n + '":"<svg'), "shared/icons.js 에 없는 아이콘: " + n);
  }
  assert(names.length >= 12, "고를 아이콘이 너무 적다: " + names.length);
}

/* 오늘 시간표 줄은 가로 구분선만. 둥근 알약과 왼쪽 색 막대로 되돌아가지 않게 */
function checkPeriodRows() {
  const css = fs.readFileSync(path.join(DIR, "desk.css"), "utf8");
  const block = css.slice(css.indexOf(".periods {"), css.indexOf(".period.lunch .c"));
  assert(block, "desk.css 에서 오늘 시간표 규칙을 못 찾았다");
  assert(!/border-radius/.test(block), "쌓인 목록 줄에 모서리를 둥글리지 않는다(네일팁처럼 보인다)");
  assert(!/box-shadow/.test(block), "지금 교시를 왼쪽 색 막대로 알리지 않는다. 바탕 하나로만 알린다");
  assert(!/opacity/.test(block), "지난 교시를 투명도로 흐리지 않는다. 글자색만 내린다");
  assert(block.includes(".period + .period { border-top: 1px solid var(--line); }"),
    "줄 사이는 가로 구분선 하나다(레포 화면 규칙)");
  assert(block.includes(".period.current { background: var(--accent-fade); }"),
    "지금 교시는 레드 반투명 바탕으로 알린다(레포 화면 규칙)");
  const px = [...block.matchAll(/(?:padding|gap|padding-inline|padding-block)[^;]*?(\d+)px/g)].map(m => +m[1]);
  for (const v of px) assert(v % 4 === 0, "오늘 시간표 여백이 4px 격자 밖이다: " + v + "px");
}

/* 할 일 네 칸도 같다. 채운 바탕 위의 색 막대와 색 넷으로 되돌아가지 않게 */
function checkTodoCells() {
  const css = fs.readFileSync(path.join(DIR, "desk.css"), "utf8");
  const block = css.slice(css.indexOf(".q-cell {"), css.indexOf(".q-list {"));
  // 바탕과 색 막대는 기본 .q-cell 규칙만 본다(.over 의 바탕 한 단은 끌어 놓는 자리 표시라 둔다)
  const base = css.slice(css.indexOf(".q-cell {"), css.indexOf(".q-cell.q0"));
  assert(block && base, "desk.css 에서 할 일 네 칸 규칙을 못 찾았다");
  assert(!/border-top:/.test(base), "칸 한 변에 색 막대를 박지 않는다(네일팁처럼 보인다)");
  assert(!/background:/.test(base), "네 칸에 바탕을 두루 채우지 않는다(레포 화면 규칙)");
  // 바탕을 칠하는 것은 가장 급한 한 칸뿐이다. 둘 이상이면 강조가 사라진다.
  const bgCells = [0, 1, 2, 3].filter(q => block.includes(".q-cell.q" + q + " { background:"));
  assert(bgCells.length === 1 && bgCells[0] === 0, "바탕은 중요 긴급 한 칸에만 칠한다");
  assert(!/--qc/.test(css), "색 넷으로 가르지 않는다. 중요 긴급만 레드이고 나머지는 회색 단계다");
  assert(!/dashed/.test(block), "끌어 놓는 자리를 점선으로 두르지 않는다. 바탕 한 단으로 알린다");
  // 네 칸이 같아 보이지 않게 이름 색 네 단계는 그대로 둔다(선생님 지시 2026-11-13)
  for (const [q, c] of [[0, "--accent"], [1, "--ink"], [2, "--sub"], [3, "--faint"]])
    assert(block.includes(".q-cell.q" + q + " .q-name { color: var(" + c + ");"),
      "q" + q + " 이름 색이 " + c + " 여야 한다");
  const px = [...css.matchAll(/\.q-(?:cell|head|list|add)[^{]*\{[^}]*?(?:padding|gap)[^;]*?(\d+)px/g)].map(m => +m[1]);
  // 2px 는 작은 조작 칸 안의 미세 조정이라 격자 밖이어도 둔다
  for (const v of px) assert(v % 4 === 0 || v === 2, "할 일 칸 여백이 4px 격자 밖이다: " + v + "px");
  const js = fs.readFileSync(path.join(DIR, "desk.js"), "utf8");
  assert(!/q-hint/.test(js) && !/hint:/.test(js.slice(js.indexOf("const QUADS"), js.indexOf("const todoQ"))),
    "칸 이름 옆에 작은 글씨 설명을 달지 않는다(레포 화면 규칙)");
}

/* 글꼴: 지금 수업 큰 글씨는 잘난체, 모노체는 남아 있지 않아야 한다 */
function checkFonts() {
  const css = fs.readFileSync(path.join(DIR, "desk.css"), "utf8");
  assert(css.includes(".now-main { font-family: var(--font-head)"),
    "지금 수업의 큰 글씨는 여기어때 잘난체(--font-head)여야 한다");
  assert(css.includes("--font-num: var(--font-body);"), "--font-num 은 수트체(--font-body)를 가리켜야 한다");
  for (const page of ["desk.css", "widget.html", "index.html"]) {
    const s = fs.readFileSync(path.join(DIR, page), "utf8");
    assert(!/monospace|Menlo|IBM Plex Mono/.test(s), page + " 에 모노체가 남아 있다");
  }
}

function checkHiddenRule() {
  const css = fs.readFileSync(path.join(DIR, "desk.css"), "utf8");
  assert(/\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/.test(css),
    "desk.css 에 [hidden] { display: none !important } 가 있어야 한다. 없으면 로그인 창이 수첩 위를 덮는다");
}

/* 출결 한 건 읽기: 옛 기록("결석" 글자 하나)은 사유 미정 한 건으로, 새 기록은 배열로 읽는다 */
function checkEntries() {
  const src = fs.readFileSync(path.join(DIR, "desk.js"), "utf8");
  const a = src.indexOf("function marksIn(v)"), b = src.indexOf("function entryText(e)");
  const c = src.indexOf("\n}", b) + 2;
  assert(a > 0 && b > a && c > b, "desk.js 에서 출결 읽기 함수를 못 찾았다");
  const { entriesOf, entryText } = new Function(src.slice(a, c) + "; return { entriesOf, entryText };")();
  assert.deepStrictEqual(entriesOf({ marks: { s1: "결석" } }, "s1"), [{ k: "결석", r: "", p: [], memo: "" }], "옛 글자 기록");
  assert.strictEqual(entryText(entriesOf({ marks: { s1: "지각" } }, "s1")[0]), "사유 미정 지각", "옛 기록은 사유 미정");
  assert.deepStrictEqual(entriesOf({ marks: { s1: "출석" } }, "s1"), [], "모르는 글자는 버린다");
  const v = { marks: { s1: [{ k: "결과", r: "미인정", p: [3, 2] }, { k: "지각", r: "인정", p: [0] }, { k: "x" }] } };
  assert.deepStrictEqual(entriesOf(v, "s1").map(entryText), ["미인정 결과(2교시, 3교시)", "출석인정 지각(조회까지)"], "새 기록, 교시 차례");
  assert.strictEqual(entryText({ k: "조퇴", r: "질병", p: [8], memo: "" }), "질병 조퇴(종례부터)");
}

(async () => {
  checkEntries();
  checkHiddenRule();
  checkShrinkRules();
  checkWeatherCodes();
  checkIconNames();
  checkFonts();
  checkPeriodRows();
  checkTodoCells();
  seedHoclass();
  const A = device();

  /* ---------- 로그인 문 ---------- */
  await until(() => !A.$("gate").hidden, "로그인 문이 먼저 보인다");
  assert(A.$("app").hidden, "로그인 전에는 수첩이 가려져 있다");
  A.fill("gateEmail", "ho0911seong@gmail.com"); A.fill("gatePass", "틀린비번");
  A.submit("gateForm");
  await until(() => A.$("gateErr").textContent.includes("맞지 않습니다"), "틀린 계정 비밀번호 거부");
  assert(![...store.keys()].some(k => k.startsWith("desk_")), "로그인 전에는 수첩 자료를 저장하지 않는다");
  /* 옛 배치(2026-11-13 전): 1장 가운데 우리 반, 2장 교무수첩과 주간 시간표. 교무수첩 장으로 옮긴 뒤에도
     기본 배치와 똑같이 풀려야 한다(주간 시간표가 우리 반 자리로, 빈 2장은 걷는다). 아래 배치 시험이 이를 확인한다. */
  put("desk_grid/all", { at: 1, state: { grid: { cols: 24, rows: 16 }, pages: 2, layout: {
    clock: { pg: 1, x: 1, y: 1, w: 6, h: 4, on: true }, links: { pg: 1, x: 1, y: 5, w: 6, h: 4, on: true },
    now: { pg: 1, x: 1, y: 9, w: 6, h: 4, on: true }, periods: { pg: 1, x: 1, y: 13, w: 6, h: 4, on: true },
    class: { pg: 1, x: 7, y: 1, w: 6, h: 16, on: true }, gcal: { pg: 1, x: 13, y: 1, w: 6, h: 8, on: true },
    todos: { pg: 1, x: 13, y: 9, w: 6, h: 8, on: true }, ddays: { pg: 1, x: 19, y: 1, w: 6, h: 8, on: true },
    memo: { pg: 1, x: 19, y: 9, w: 6, h: 8, on: true }, book: { pg: 2, x: 1, y: 1, w: 18, h: 16, on: true },
    tt: { pg: 2, x: 19, y: 1, w: 6, h: 16, on: true } } } });

  A.fill("gateEmail", "ho0911seong@gmail.com"); A.fill("gatePass", "계정비밀번호");
  A.submit("gateForm");
  await until(() => A.$("gate").hidden && !A.$("app").hidden, "로그인하면 수첩이 열린다");

  /* ---------- 수첩 비밀번호 ---------- */
  assert(!A.$("setupForm"), "대시보드는 잠금 없이 보인다");
  A.go("담임");
  await until(() => A.$("setupForm"), "수첩 비밀번호 만들기");
  assert(A.$("deck").hidden && A.d.querySelector("#classBody > .nb-lock #setupForm"), "교무수첩 장 가운데 잠금 카드 하나");
  if (process.env.DUMP_CLASS) fs.writeFileSync(process.env.DUMP_CLASS + "_lock.html", A.$("nb").outerHTML + A.$("pagebar").outerHTML);
  A.fill("setupPass", PASS); A.fill("setupPass2", PASS);
  A.submit("setupForm");
  await until(() => A.$("recoveryCode"), "복구 키 화면");
  const rec = A.$("recoveryCode").textContent;
  assert(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/.test(rec), "복구 키 형식");
  A.$("recoveryOk").checked = true; A.$("recoveryOk").dispatchEvent(new A.w.Event("change"));
  A.$("recoveryDone").click();
  await until(() => A.d.querySelector("#links .link"), "바로가기가 그려짐");
  for (const p of ["desk_crypto/keys", "desk_settings/general", "desk_years/all", "desk_todos/all", "desk_ddays/all", "desk_memo/all", "desk_calendar/all"]) {
    await until(() => store.has(p), p);
  }
  assert(!allStored().includes(rec.replace(/-/g, "")), "복구 키 평문 저장 금지");
  A.go("대시보드");
  await until(() => !A.$("deck").hidden && A.$("nb").hidden, "대시보드로 돌아온다");

  /* ---------- 올해 설정: 2027, 담임 반은 호클래스에 없는 3-9 ---------- */
  A.$("toolSet").click();
  await until(() => A.$("setForm"), "설정 패널");
  assert.strictEqual(A.$("setTitle").textContent, "설정", "패널 머리줄 제목");
  assert(A.$("setClose"), "머리줄에 닫기 단추가 있다");
  assert(!A.$("setScrim").hidden, "열면 뒤가 가려진다");
  assert.deepStrictEqual([...A.d.querySelectorAll("#setPanel .set-tab")].map(b => b.textContent),
    ["기본", "화면", "수업", "담임", "업무"], "탭 다섯");
  assert(A.$("setPanel").classList.contains("set-full"), "설정은 팝업이 아니라 전체 화면");
  A.$("setClose").click();
  await until(() => A.$("setPanel").hidden && A.$("setScrim").hidden, "닫기 단추로 닫힌다");
  A.$("toolSet").click();
  await until(() => A.$("setForm"), "다시 열면 기본 탭");
  /* 학년도를 더하고, 담임 반은 글이 아니라 고르개로 정한다 */
  A.$("setYearAdd").click();                      // 다음 학년도(2027)를 더하고 고른다
  await until(() => A.d.querySelector('#setPanel .cpick[data-year="2027"][aria-pressed="true"]'), "2027학년도를 더하고 고른다");
  assert(!A.d.querySelector("#setPanel input[id=setSchool]"), "학교 이름 칸은 없다. 학교는 나이스 학교 찾기 한 곳에서만 정한다");
  assert(!A.$("setSave"), "기본 탭은 누르는 즉시 저장하므로 저장 단추가 없다");
  assert(!A.$("setHome") && !A.$("setClasses"), "담임 반, 수업 반은 기본 탭이 아니라 담임, 수업 탭에 있다");
  A.setTab("home");
  await until(() => A.$("setHome"), "담임 탭");
  A.d.querySelector('#setHome [data-home="1"]').click();   // 담임을 고르면 반 고르개가 나온다
  await until(() => A.$("setHomeCls"), "담임 반 고르개");
  A.pickRoom("setHomeCls", 3, 9);                 // 담임 반 3-9
  await until(() => A.d.querySelector('#setHomeCls [data-grade="3"][aria-pressed="true"]'), "다시 그려도 3학년이 펼쳐져 있다");
  A.setTab("lesson");
  await until(() => A.$("setClasses"), "수업 탭");
  A.pickRoom("setClasses", 3, 1);                 // 수업 반 3-1 (담임 반 3-9 와 따로)
  await until(() => { const y = JSON.parse(store.get("desk_years/all") || "{}").state;
    return y && y.years && y.years["2027"] && y.years["2027"].homeroom === "3-9" && y.years["2027"].classes.join() === "3-1"; },
    "누르는 즉시 담임 반 3-9, 수업 반 3-1 로 저장된다");
  A.setTab("year");

  /* ---------- 이 기기에서 교무수첩 잠그지 않기 ---------- */
  const kept = () => { try { return JSON.parse(A.w.localStorage.getItem("my-desk-v3:keepKey")); } catch (e) { return null; } };
  assert(!A.$("keepOpen").checked && A.$("setIdle"), "처음에는 꺼져 있고 자동 잠금 칸이 있다");
  A.$("keepOpen").click();
  await until(() => A.$("keepPass"), "켜려면 비밀번호 칸이 열린다");
  A.fill("keepPass", "틀린비밀번호"); A.$("keepGo").click();
  await until(() => A.$("setPanel").textContent.includes("비밀번호가 맞지 않습니다"), "틀린 비밀번호는 거부");
  assert(!kept(), "틀리면 열쇠를 두지 않는다");
  A.fill("keepPass", PASS); A.$("keepGo").click();
  await until(() => kept() && A.$("keepOpen").checked && !A.$("setIdle"), "켜면 이 브라우저에 열쇠를 두고 자동 잠금 칸을 숨긴다");
  assert(!allStored().includes(kept()), "열쇠는 저장소(클라우드)로 가지 않는다");
  A.$("keepOpen").click();
  await until(() => !kept() && A.$("setIdle"), "끄면 열쇠를 지운다");
  A.$("keepOpen").click(); A.fill("keepPass", PASS); A.$("keepGo").click();
  await until(() => kept(), "다시 켠다");
  {
    /* 같은 브라우저에서 다시 열면(열쇠가 남아 있으면) 비밀번호를 묻지 않고 열린다 */
    const B = device({ "my-desk-v3:keepKey": JSON.stringify(kept()) });
    await until(() => !B.$("gate").hidden, "다시 연 수첩의 로그인 문");
    B.fill("gateEmail", "ho0911seong@gmail.com"); B.fill("gatePass", "계정비밀번호");
    B.submit("gateForm");
    await until(() => B.$("gate").hidden && !B.$("app").hidden, "다시 연 수첩 로그인");
    B.go("담임");
    await until(() => B.$("nbSeg") && !B.$("nbSeg").hidden, "비밀번호 없이 교무수첩이 열린다");
    assert(!B.$("unlockForm"), "잠금 칸이 뜨지 않는다");
    B.$("lockBtn").click();
    await until(() => B.$("unlockForm"), "손으로 잠그면 잠긴다(다시 저절로 열지 않는다)");
  }
  A.$("setClose").click();

  /* ---------- 시계 ---------- */
  const clockText = A.wg("clock").textContent;
  for (const gone of ["주차", "완료", "D-"]) assert(!clockText.includes(gone), "시계에서 뺀 것이 남았다: " + gone);
  assert(A.$("dateMain").textContent.includes("년"), "날짜가 보인다");
  await until(() => A.$("wx").textContent.includes("날씨"), "날씨 칸");

  /* ---------- 할 일 ---------- */
  const qCells = () => [...A.d.querySelectorAll("#todoQuad .q-cell")];
  assert.strictEqual(qCells().length, 4, "할 일 칸 넷");
  const q2 = qCells()[2];
  q2.querySelector(".q-in").value = "급한 공문 회신";
  q2.querySelector(".q-add").dispatchEvent(new A.w.Event("submit", { bubbles: true, cancelable: true }));
  await until(() => qCells()[2].textContent.includes("급한 공문 회신"), "일반 긴급 칸에 들어간다");
  await until(() => (JSON.parse(store.get("desk_todos/all") || "{}").state || { items: [] }).items
    .some(t => t.text === "급한 공문 회신" && t.q === 2), "칸 번호(q)와 함께 저장");
  // jsdom 은 위치를 재지 못해 손끝 아래 칸을 정해 준다.
  const ptr = (type, target, kind, x, y) => {
    const ev = new A.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(ev, "pointerId", { value: 1 });
    Object.defineProperty(ev, "pointerType", { value: kind });
    target.dispatchEvent(ev);
  };
  const itemIn = (cell, text) => [...cell.querySelectorAll(".q-todo")].find(li => li.textContent.includes(text));
  A.d.elementFromPoint = () => qCells()[0];
  ptr("pointerdown", itemIn(qCells()[2], "급한 공문 회신").querySelector(".q-tx"), "mouse", 10, 10);
  ptr("pointermove", A.d, "mouse", 40, 40);
  ptr("pointerup", A.d, "mouse", 40, 40);
  await until(() => qCells()[0].textContent.includes("급한 공문 회신") && !qCells()[2].textContent.includes("급한 공문 회신"), "마우스로 끌면 칸이 바뀐다");
  A.d.elementFromPoint = () => qCells()[3];
  ptr("pointerdown", itemIn(qCells()[0], "급한 공문 회신").querySelector(".q-tx"), "touch", 10, 10);
  ptr("pointermove", A.d, "touch", 10, 60);
  ptr("pointerup", A.d, "touch", 10, 60);
  await wait(400);
  assert(qCells()[0].textContent.includes("급한 공문 회신"), "누르자마자 움직인 손가락은 옮기지 않는다");
  ptr("pointerdown", itemIn(qCells()[0], "급한 공문 회신").querySelector(".q-tx"), "touch", 10, 10);
  await wait(400);
  assert(A.d.querySelector(".q-ghost"), "꾹 누르면 집어 든다");
  ptr("pointermove", A.d, "touch", 50, 80);
  ptr("pointerup", A.d, "touch", 50, 80);
  await until(() => qCells()[3].textContent.includes("급한 공문 회신"), "손가락으로 끌면 칸이 바뀐다");
  assert(!A.d.querySelector(".q-ghost"), "놓으면 집어 든 그림이 사라진다");

  /* ---------- 구글 캘린더 위젯 ---------- */
  await until(() => A.$("gcalBody").textContent.includes("이어 붙이면"), "연결 전에는 안내가 보인다");
  assert(!A.$("gcalBtn").hidden, "연결 단추가 보인다");

  /* ---------- 칸(그리드) 배치 ---------- */
  const deck = A.$("deck");
  const dots = () => [...A.d.querySelectorAll("#pagebar .pg-dot")];
  const named = () => [...A.d.querySelectorAll("#pagebar .pg-nb")].map(b => b.textContent);
  assert.strictEqual(deck.style.getPropertyValue("--cols"), "24", "가로 24칸");
  assert.strictEqual(deck.style.getPropertyValue("--rows"), "16", "세로 16칸");
  assert.strictEqual(A.area("clock"), "1 / 1 / span 4 / span 6", "1단 머리: " + A.area("clock"));
  assert.strictEqual(A.area("tt"), "1 / 7 / span 16 / span 6", "2단 주간 시간표(옛 우리 반 자리)");
  assert.strictEqual(A.area("gcal"), "1 / 13 / span 8 / span 6", "3단 구글 캘린더");
  assert.strictEqual(A.area("ddays"), "1 / 19 / span 8 / span 6", "4단 학사 일정");
  assert(!A.wg("class") && !A.wg("book"), "우리 반, 교무수첩 위젯은 없다(교무수첩 장으로 갔다)");
  assert(!A.wg("tt").hidden, "1장에 주간 시간표가 보인다");
  assert(A.wg("meal").hidden, "급식 위젯은 꺼진 채로 시작한다");
  assert.deepStrictEqual(named(), ["대시보드", "수업", "담임", "업무"], "장 이름 단추");
  const spanOf = (id) => {
    const parts = A.area(id).split(" / ");
    return { y: +parts[0], x: +parts[1], h: +String(parts[2]).replace("span ", ""), w: +String(parts[3]).replace("span ", "") };
  };
  for (const id of ["clock", "links", "now", "periods", "gcal", "todos", "ddays", "memo", "tt"]) {
    const g = spanOf(id);
    assert(g.w >= 4 && g.h >= 4, id + " 가 4×4 보다 작다: " + g.w + "×" + g.h);
  }
  /* 바로가기만 한 칸까지 줄일 수 있다 */
  const gridSrc = fs.readFileSync(path.join(DIR, "grid.js"), "utf8");
  assert(/\{ id: "links",\s+name: "바로가기",\s+min: \[1, 1\] \}/.test(gridSrc),
    "바로가기는 min 이 [1, 1] 이어야 한 칸으로 줄일 수 있다");
  assert(/export const MIN_SIZE = \[2, 2\];/.test(gridSrc), "다른 칸은 2×2 가 한계로 남아야 한다");
  await until(() => store.has("desk_grid/all"), "desk_grid/all 저장");
  assert.strictEqual(JSON.parse(store.get("desk_grid/all")).state.pages, 1, "대시보드 한 장으로 저장");

  A.go("담임");
  await until(() => A.$("deck").hidden && !A.$("nb").hidden && A.$("nbTitle").textContent === "담임", "담임 장");
  A.d.querySelector('#pagebar [aria-label="앞 장"]').click();
  await until(() => A.$("nbTitle").textContent === "수업", "앞 장은 수업");
  A.go("업무"); A.sub("todo");
  await until(() => A.$("nbTitle").textContent === "업무" && A.$("classBody").querySelector("#todoQuad"), "업무 장 할 일은 대시보드 할 일 위젯 그대로");
  assert(!A.wg("todos").querySelector("#todoQuad"), "할 일 카드는 한 벌만(업무 장으로 옮겨 왔다)");
  A.go("대시보드");
  await until(() => !A.$("deck").hidden && A.wg("todos").querySelector("#todoQuad"), "대시보드로 오면 할 일 카드가 제자리로");

  /* 바로가기: 위젯에는 타일만, 더하고 지우는 것은 설정 창에서 */
  const picks = () => [...A.d.querySelectorAll("#setPanel .emoji-pick button")];
  const mode = (k) => A.d.querySelector('#setPanel .seg button[data-mode="' + k + '"]').click();
  const made = (name) => [...A.d.querySelectorAll("#links .link")].find(a => a.textContent.includes(name));
  const lkRow = (name) => [...A.d.querySelectorAll("#setPanel .lk-row")].find(r => r.textContent.includes(name));
  const type = (id, v) => { A.fill(id, v); A.$(id).dispatchEvent(new A.w.Event("input", { bubbles: true })); };
  const lkBtn = (name, text) => [...lkRow(name).querySelectorAll("button")].find(b => b.textContent === text);

  assert(!A.d.querySelector("#links button"), "위젯에는 누를 타일만 있고 단추는 없다");
  assert(!A.$("editLinks"), "바로가기 편집 단추는 설정 창으로 옮겼다");

  A.setTab("screen");
  await until(() => A.$("linkForm"), "바로가기 탭");
  type("linkName", "이모지 시험"); type("linkUrl", "example.com");
  picks()[2].click();   // 다시 그려도 적던 이름과 주소가 남아야 한다
  const em = picks().find(b => b.getAttribute("aria-pressed") === "true").dataset.ic;
  assert.strictEqual(A.$("linkName").value, "이모지 시험", "아이콘을 골라도 적던 이름이 지워지지 않는다");
  A.submit("linkForm");
  const one = made("이모지 시험");
  assert(one, "새 사이트가 바로가기에 생긴다");
  assert(one.querySelector(".link-ico.svg svg"), "고른 아이콘이 단색 SVG 로 붙는다");
  assert(new RegExp("lucide-" + em + String.fromCharCode(34)).test(one.querySelector(".link-ico.svg").innerHTML),
    "고른 아이콘(" + em + ")이 그대로 붙는다");
  assert.strictEqual(one.getAttribute("href"), "https://example.com/", "주소에 https 를 붙인다");
  assert.strictEqual(A.$("linkName").value, "", "추가하면 적던 칸이 비워진다");

  type("linkName", "파비콘 시험"); type("linkUrl", "padlet.com");
  mode("favicon");
  A.submit("linkForm");
  const two = made("파비콘 시험");
  assert(/s2\/favicons\?domain=padlet\.com/.test(two.querySelector("img.link-ico").getAttribute("src")),
    "파비콘은 연결된 사이트 주소로 받아 온다");

  type("linkName", "타일 시험"); type("linkUrl", "example.org");
  mode("none");
  A.submit("linkForm");
  const three = made("타일 시험");
  assert(three.querySelector(".mono-tile") && !three.querySelector(".link-ico"),
    "설정 안 함은 첫 글자 타일만 나온다");

  /* 있는 사이트 고치기: 같은 줄에 되쓰고 새로 생기지 않는다 */
  const before = [...A.d.querySelectorAll("#links .link")].length;
  lkBtn("타일 시험", "고치기").click();
  assert.strictEqual(A.$("linkName").value, "타일 시험", "고치기를 누르면 적힌 이름이 칸에 들어온다");
  assert.strictEqual(A.$("linkUrl").value, "https://example.org/", "주소도 그대로 들어온다");
  assert(A.btn("#setPanel", "저장"), "고치는 중에는 단추가 저장이 된다");
  type("linkName", "고친 이름"); type("linkUrl", "example.net");
  mode("favicon");
  A.submit("linkForm");
  assert.strictEqual([...A.d.querySelectorAll("#links .link")].length, before, "고치면 개수가 늘지 않는다");
  assert(!made("타일 시험"), "옛 이름은 사라진다");
  const fixed = made("고친 이름");
  assert(fixed, "고친 이름으로 바뀐다");
  assert.strictEqual(fixed.getAttribute("href"), "https://example.net/", "주소도 바뀐다");
  assert(fixed.querySelector("img.link-ico"), "아이콘 고른 것도 바뀐다");
  assert(A.btn("#setPanel", "추가"), "저장하면 다시 추가 상태로 돌아온다");
  assert.strictEqual(A.$("linkName").value, "", "저장하면 적던 칸이 비워진다");

  /* 그만두기를 누르면 아무것도 안 바뀐다 */
  lkBtn("고친 이름", "고치기").click();
  type("linkName", "안 쓸 이름");
  A.btn("#setPanel", "그만두기").click();
  assert(made("고친 이름") && !made("안 쓸 이름"), "그만두기를 누르면 고치기 전 그대로다");
  assert(A.btn("#setPanel", "추가"), "그만두면 추가 상태로 돌아온다");

  /* 업무포털과 나이스도 설정 창에서 지울 수 있다 */
  assert(made("업무포털") && made("나이스"), "업무포털과 나이스도 보통 바로가기다");
  for (const name of ["업무포털", "나이스", "이모지 시험", "파비콘 시험", "고친 이름"]) {
    assert(lkRow(name), "설정 창에 " + name + " 줄이 있다");
    lkBtn(name, "삭제").click();
  }
  assert(!made("업무포털") && !made("나이스") && !made("이모지 시험"), "설정 창에서 지우면 위젯에서도 없어진다");
  /* officials 표가 저장돼야 다음에 열 때 업무포털과 나이스가 되살아나지 않는다 */
  await until(() => String(store.get("desk_settings/general")).includes('"officials":true'), "officials 표 저장");
  A.$("setClose").click();

  A.setTab("screen");
  await until(() => A.$("setCols"), "화면 탭 열림");
  A.btn("#setPanel", "장 추가").click();
  await until(() => dots().length === 2, "대시보드가 두 장이 됐다");
  await until(() => JSON.parse(store.get("desk_grid/all")).state.pages === 2, "두 장으로 저장");
  assert.deepStrictEqual(named(), ["수업", "담임", "업무"], "대시보드가 여러 장이면 점, 교무수첩은 이름 단추");
  A.btn("#setPanel", "장 삭제").click();
  await until(() => dots().length === 0 && named()[0] === "대시보드", "빈 장은 지워진다");
  A.btn("#setPanel", "장 삭제").click();
  await wait(120);
  assert.strictEqual(named()[0], "대시보드", "위젯이 있는 장은 안 지워진다");

  A.fill("setCols", "12"); A.fill("setRows", "8");
  A.btn("#setPanel", "바꾸기").click();
  await until(() => deck.style.getPropertyValue("--cols") === "12", "가로 12칸으로");
  assert.strictEqual(deck.style.getPropertyValue("--rows"), "8", "세로 8칸으로");
  for (const id of ["clock", "gcal", "todos", "ddays", "memo", "tt"]) {
    const m = /^(\d+) \/ (\d+) \/ span (\d+) \/ span (\d+)$/.exec(A.area(id));
    assert(m, id + " 자리 모양: " + A.area(id));
    const [y, x, h, w] = m.slice(1).map(Number);
    assert(x + w - 1 <= 12 && y + h - 1 <= 8, id + " 가 칸 밖으로 나갔다: " + A.area(id));
  }

  /* 장을 드롭다운으로 고르고, 그 장에 넣을 위젯을 체크로 고른다 */
  const ttBox = () => A.d.querySelector('#setPanel .wg-check input[data-wg="tt"]');
  const pageSel = () => A.$("setPageSel");
  const goPage = async (n) => {
    pageSel().value = String(n);
    pageSel().dispatchEvent(new A.w.Event("change", { bubbles: true }));
    await until(() => pageSel().value === String(n), n + "장 고르기");
  };
  assert.strictEqual(pageSel().options.length, 1, "대시보드 장 수만큼 고를 수 있다");
  assert(ttBox().checked, "주간 시간표는 1장에 있다");
  ttBox().click();
  await until(() => !ttBox().checked, "체크를 풀면 꺼진다");
  assert(A.wg("tt").hidden, "꺼진 위젯은 화면에서 사라진다");
  ttBox().click();
  await until(() => ttBox().checked, "다시 체크하면 1장으로 돌아온다");

  A.btn("#setPanel", "장 추가").click();
  await until(() => pageSel().options.length === 2, "장을 더하면 고를 수 있는 장도 늘어난다");
  await goPage(2);
  ttBox().click();
  await until(() => ttBox().checked, "2장에서 체크하면 그 장으로 옮겨진다");
  await goPage(1);
  assert(!ttBox().checked, "1장에서는 빠졌다");
  ttBox().click();
  await until(() => ttBox().checked, "1장으로 되돌린다");
  dots()[1].click();
  await until(() => A.wg("tt").hidden, "2장으로 넘어간다");
  A.btn("#setPanel", "장 삭제").click();
  await until(() => dots().length === 0, "빈 2장은 지워진다");

  const back = () => A.btn("#setPanel", "기본 배치로 되돌리기") || A.btn("#setPanel", "한 번 더 누르면 되돌리기");
  back().click(); back().click();
  await until(() => deck.style.getPropertyValue("--cols") === "24", "되돌리면 24칸");
  assert.strictEqual(A.area("tt"), "1 / 7 / span 16 / span 6", "되돌린 2단 자리");
  A.d.dispatchEvent(new A.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await until(() => A.$("setPanel").hidden, "ESC 로 닫힌다");
  A.setTab("screen");
  await until(() => A.$("setCols"), "다시 열림");
  A.$("setScrim").click();
  await until(() => !A.$("setCols") && A.$("setScrim").hidden, "가림막으로 닫힌다");

  /* ---------- 호클래스 명단이 저절로 들어온다 ---------- */
  A.go("수업");
  await until(() => [...A.d.querySelectorAll("#classPick .cpick")].length === 2, "수업 장: 호클래스 두 반");
  assert.deepStrictEqual([...A.d.querySelectorAll("#classPick .cpick")].map(x => x.textContent),
    ["3-1", "3-2"], "수업 장에는 담임 반(3-9)이 없다. 수업 반에 넣지 않았다");
  A.pick("3-1");
  A.sub("att");
  await until(() => A.stu().length === 3, "3-1 학생 3명이 호클래스에서 들어온다");
  assert(A.text().includes("김지우") && A.text().includes("박세찌"), "호클래스 이름: " + A.text().slice(0, 80));
  assert(A.$("rosterBtn").hidden, "호클래스 반은 명단 편집을 막는다");

  /* ---------- 출결은 학번으로 묶인다 ---------- */
  await A.mark(0, "결석", "미인정");
  await until(() => A.absent() === 1, "3-1 결석 1명");
  const day = todayKey();
  await until(() => store.has("desk_att/2027_3-1_" + day), "3-1 출결 문서");
  const att = JSON.parse(store.get("desk_att/2027_3-1_" + day));
  assert.deepStrictEqual(Object.keys(att).sort(), ["at", "c", "date", "iv", "room", "v", "year"], "꼬리표는 평문, 내용은 암호문");
  assert.strictEqual(att.room, "3-1"); assert.strictEqual(att.year, "2027"); assert.strictEqual(att.date, day);
  await wait(900);
  for (const nm of ["김지우", "이주서", "박세찌"]) assert(!allStored().includes(nm), "수첩 쪽에 평문 금지: " + nm);

  /* ---------- 담임 반은 손으로 넣고, 학번을 만들어 준다 ---------- */
  A.go("담임");
  await until(() => A.$("className").textContent.includes("9반") && A.text().includes("학생 명단이 비어"), "담임 장은 3-9, 명단이 없다");
  assert(A.$("classPick").hidden, "담임 장에는 반 고르기가 없다");
  assert(!A.$("rosterBtn").hidden, "호클래스에 없는 반은 명단 편집을 쓸 수 있다");
  A.$("rosterBtn").click();
  await until(() => A.$("rNames"), "3-9 명단 편집");
  A.fill("rCount", "2"); A.fill("rNames", "담임하나\n담임둘");
  A.$("rSave").click();
  await until(() => A.stu().length === 2, "3-9 학생 2명");
  await A.mark(1, "결석", "질병");
  await until(() => store.has("desk_att/2027_3-9_" + day), "3-9 출결 문서");

  /* ---------- 출결 열두 가지: 종류 넷 x 사유 셋, 교시, 메모, 하루 여러 건 ---------- */
  await A.mark(0, "결과", "미인정", [2, 3], "보건실");
  await A.mark(0, "조퇴", "질병", [6]);
  await until(() => A.stu()[0].textContent.includes("결과 외 1"), "학생 칸에 첫 건과 나머지 수");
  A.stu()[0].click();
  await until(() => A.$("attEd"), "고르개를 다시 연다");
  A.d.querySelector('#attEd .att-k [data-v="결과"]').click(); A.d.querySelector('#attEd .att-p [data-v="5"]').click();
  if (process.env.DUMP_CLASS) { for (const i of A.d.querySelectorAll("#nb input")) i.setAttribute("value", i.value); fs.writeFileSync(process.env.DUMP_CLASS + "_ed.html", A.$("nb").outerHTML + A.$("pagebar").outerHTML); }
  A.d.querySelector('#attEd .att-k [data-v="결석"]').click();
  const edText = () => A.$("attEd").textContent;
  assert(edText().includes("미인정 결과(2교시, 3교시)") && edText().includes("보건실"), "결과는 빠진 교시 여럿과 메모: " + edText());
  assert(edText().includes("질병 조퇴(6교시부터)"), "조퇴는 몇 교시부터");
  A.$("attAdd").click();
  await until(() => A.$("attEd").querySelector(".form-err").textContent.includes("사유"), "사유 없이는 안 들어간다");
  A.d.querySelector('#attEd .att-k [data-v="지각"]').click();
  A.d.querySelector('#attEd .att-r [data-v="인정"]').click();
  A.$("attAdd").click();
  await until(() => A.$("attEd").querySelector(".form-err").textContent.includes("몇 교시까지"), "지각은 교시를 골라야 한다");
  A.d.querySelector("#attEd .att-ed-item .del").click();
  await until(() => A.d.querySelectorAll("#attEd .att-ed-item").length === 1, "한 건만 지운다");
  A.btn("#attEd", "닫기").click();
  await until(() => !A.$("attEd") && A.d.querySelector("#classBody .stu.조퇴"), "남은 조퇴 한 건");
  await wait(900);
  assert(!allStored().includes("보건실"), "출결 메모 평문 금지");

  /* ---------- 출결: 지난날 고치기와 한 달 표 ---------- */
  const prev = (() => { const d = new Date(); do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
  assert(A.$("attDate").textContent.includes("오늘"), "출결은 오늘부터 연다");
  assert(A.d.querySelector('#classBody [aria-label="다음 날"]').disabled, "오늘보다 앞날로는 못 간다");
  A.d.querySelector('#classBody [aria-label="앞 날"]').click();
  await until(() => A.$("attToday") && A.stu().length === 2 && !A.d.querySelector("#classBody .stu.결석"), "앞 평일로 가면 그날 기록(빈 것)이 열린다");
  await A.mark(0, "지각", "미인정", [1]);         // 1번 1교시까지 지각
  await until(() => store.has("desk_att/2027_3-9_" + prev), "지난날 출결도 그날 문서에 저장된다");
  A.$("attToday").click();
  await until(() => A.$("attDate").textContent.includes("오늘") && A.d.querySelectorAll("#classBody .stu.결석").length === 1, "오늘로 돌아오면 오늘 기록");
  if (process.env.DUMP_CLASS) fs.writeFileSync(process.env.DUMP_CLASS + "_day.html", A.$("nb").outerHTML + A.$("pagebar").outerHTML);
  A.d.querySelector('#attMode [data-mode="month"]').click();
  await until(() => A.$("attMonth") && A.$("attMonthCopy"), "한 달 표");
  const monthRows = () => [...A.$("attMonth").querySelectorAll("tbody tr")];
  assert.strictEqual(monthRows().length, 2, "학생 줄 둘");
  const weekend = [0, 6].includes(new Date().getDay());   // 한 달 표는 평일 칸만 있어 주말엔 오늘 칸이 없다
  if (!weekend) await until(() => monthRows()[1].textContent.includes("결"), "오늘 결석이 표에 찍힌다");
  if (process.env.DUMP_CLASS) fs.writeFileSync(process.env.DUMP_CLASS + "_month.html", A.$("nb").outerHTML + A.$("pagebar").outerHTML);
  if (prev.slice(0, 7) === day.slice(0, 7)) {
    await until(() => monthRows()[0].textContent.includes("지"), "지난날 지각도 표에 찍힌다");
    const cell = [...monthRows()[0].querySelectorAll("td.m")].find(td => td.textContent === "지");
    cell.click();
    await until(() => A.$("attToday") && A.d.querySelectorAll("#classBody .stu.지각").length === 1, "표의 칸을 누르면 그날 하루 보기로 간다");
    A.$("attToday").click();
    await until(() => A.$("attDate").textContent.includes("오늘"), "다시 오늘");
  } else {
    A.d.querySelector('#attMode [data-mode="day"]').click();
    await until(() => A.$("attDate"), "하루 보기로");
  }

  /* ---------- 교무수첩 장의 기록 화면 ---------- */
  for (const p of ["student", "consult", "lesson", "work"]) {
    A.tab(p); await wait(40);
    assert(A.d.querySelectorAll("#classBody .panel").length > 0, p + " 화면이 비었다");
  }

  A.tab("consult");
  await wait(40);
  A.fill("coTitle", "지각 잦음 상담");
  A.submit("coForm");
  await until(() => A.book().includes("지각 잦음 상담"), "상담 기록");
  await until(() => store.has("desk_consults/2027"), "desk_consults/2027");
  await wait(900);
  assert(!allStored().includes("지각 잦음"), "상담 내용 평문 금지");

  /* ---------- 업무 장: 주간 계획 ---------- */
  A.tab("work");
  await until(() => A.$("woForm"), "업무 기록");
  const mon = (() => { const t = new Date(), w = t.getDay(); t.setDate(t.getDate() + (w === 0 ? 1 : w === 6 ? 2 : 1 - w));
    return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); })();
  A.fill("woTitle", "생기부 점검 제출"); A.fill("woDue", mon);
  A.submit("woForm");
  await until(() => A.book().includes("생기부 점검 제출"), "업무 기록 추가");
  A.tab("week");
  await until(() => A.$("wkGrid") && A.d.querySelectorAll("#wkGrid .wk-day").length === 5, "주간 계획 다섯 칸");
  const monCol = () => A.d.querySelector('#wkGrid .wk-day[data-day="' + mon + '"]');
  assert(monCol().textContent.includes("생기부 점검 제출"), "월요일 칸에 업무 기한이 보인다");
  A.fill("plan_" + mon, "교과협의회 자료 준비");
  A.$("plan_" + mon).closest("form").dispatchEvent(new A.w.Event("submit", { bubbles: true, cancelable: true }));
  await until(() => monCol().textContent.includes("교과협의회 자료 준비"), "월요일 칸에 계획을 적는다");
  monCol().querySelector(".wk-plan .check").click();
  await until(() => monCol().querySelector(".wk-plan .todo.done"), "계획을 다 했음으로");
  A.d.querySelector('#classBody [aria-label="다음 주"]').click();
  await until(() => A.$("wkThis") && !A.d.querySelector('#wkGrid .wk-day[data-day="' + mon + '"]'), "다음 주로 넘긴다");
  A.$("wkThis").click();
  await until(() => monCol() && monCol().textContent.includes("교과협의회 자료 준비"), "이번 주로 돌아온다");
  if (process.env.DUMP_CLASS) fs.writeFileSync(process.env.DUMP_CLASS + "_week.html", A.$("nb").outerHTML + A.$("pagebar").outerHTML);
  await wait(900);
  assert(!allStored().includes("교과협의회 자료"), "계획 내용 평문 금지");

  /* ---------- 파수꾼: 학번의 이름이 달라지면 알린다 ---------- */
  renameHoclassStudent("301", 2, "전학온애");
  A.setTab("lesson");
  await until(() => A.$("setClasses"), "설정 다시");
  A.pickRoom("setClasses", 3, 1); A.pickRoom("setClasses", 3, 1);   // 껐다 켜면 다시 저장된다
  await until(() => A.text().includes("학번에 붙은 이름이 달라졌습니다"), "파수꾼이 알린다", 30000);
  await until(() => { const y = JSON.parse(store.get("desk_years/all") || "{}").state;
    return y && y.years && y.years["2027"] && y.years["2027"].homeroom === "3-9"; }, "다시 저장해도 담임 반이 지워지지 않는다");
  assert(A.text().includes("30102번: 이주서에서 전학온애(으)로"), "바뀐 학번과 이름: " + A.text().slice(0, 160));
  A.btn("#classBody", "확인").click();
  await until(() => !A.text().includes("학번에 붙은 이름이 달라졌습니다"), "확인하면 경고가 사라진다");

  /* ---------- 여기까지 호클래스에는 한 번도 쓰지 않았다 ---------- */
  assert.deepStrictEqual(hcWrites, [], "단추를 누르기 전에는 호클래스에 쓰지 않는다");

  /* ---------- 5단계: 차시와 제출 현황 ---------- */
  A.go("수업"); A.pick("3-1"); A.sub("att");
  await until(() => A.stu().length === 3, "3-1로 돌아옴");
  A.tab("lesson");
  await until(() => A.book().includes("호클래스 차시"), "차시 칸이 보인다");
  await until(() => A.book().includes("1차시 3단원 조선의 성립"), "1차시");
  assert(A.book().includes("2차시 4단원 조선의 문화"), "2차시");
  assert(A.book().includes("날짜 없음"), "2차시는 날짜가 없다");

  A.$("leCl").value = "cl1";
  A.$("leCl").dispatchEvent(new A.w.Event("change"));
  assert.strictEqual(A.$("leAt").value, TODAY, "차시 날짜가 채워진다");
  assert.strictEqual(A.$("leUnit").value, "3단원 조선의 성립", "차시 단원이 채워진다");
  A.submit("leForm");
  await until(() => A.book().includes("3단원 조선의 성립"), "수업 기록 저장");

  /* ---------- 수업 장: 진도와 수업 메모 ---------- */
  A.sub("prog");
  await until(() => A.$("progTable"), "진도 표");
  if (process.env.DUMP_CLASS) fs.writeFileSync(process.env.DUMP_CLASS + "_prog.html", A.$("nb").outerHTML + A.$("pagebar").outerHTML);
  const progRow = (c) => A.d.querySelector('#progTable tr[data-cls="' + c + '"]');
  assert(progRow("3-1") && progRow("3-2"), "수업 반마다 한 줄");
  assert(progRow("3-1").textContent.includes("3단원 조선의 성립"), "3-1 마지막 수업 단원: " + progRow("3-1").textContent);
  assert(progRow("3-1").textContent.includes("1차시"), "3-1 호클래스 차시(오늘 날짜인 1차시)");
  assert(progRow("3-2").textContent.includes("기록 없음"), "3-2 는 기록이 없다");
  progRow("3-2").click();
  await until(() => A.$("className").textContent.includes("2반") && A.$("leForm"), "진도 줄을 누르면 그 반 수업 기록으로");
  A.pick("3-1"); A.sub("student");
  await until(() => A.d.querySelector("#classBody .stu-pick button"), "수업 장 학생 화면");
  A.d.querySelector("#classBody .stu-pick button").click();
  await until(() => A.$("stuNote"), "학생을 고르면 메모 칸");
  assert(A.book().includes("수업 메모") && !A.book().includes("상담 민원"), "수업 장 학생 화면은 수업 메모, 상담은 뺀다");
  A.sub("lesson");
  await until(() => A.$("leForm"), "다시 수업 기록");

  A.btn("#classBody", "오늘 날짜 넣기").click();
  await until(() => !A.book().includes("날짜 없음"), "2차시에 날짜가 들어간다", 30000);
  assert.strictEqual(JSON.parse(store.get("hoclass_course_lessons/cl2")).date, TODAY, "2차시 날짜");
  assert(hcWrites.includes("hoclass_course_lessons/cl2"), "차시 문서에 썼다");

  A.sub("col");
  await until(() => A.$("colName"), "수합 칸");
  A.fill("colName", "1차시 미션");
  A.$("colCl").value = "cl1"; A.$("colPart").value = "mission";
  A.submit("colForm");
  await until(() => A.d.querySelectorAll("#classBody .stu.got").length === 2, "1번과 3번만 제출로 보인다", 30000);
  assert(A.text().includes("미제출 1명"), "미제출 1명: " + A.text().slice(0, 120));

  /* ---------- 6단계: 결석 보내기 ---------- */
  A.sub("att");
  await until(() => A.d.querySelectorAll("#classBody .stu").length === 3, "출결 탭");
  await A.mark(1, "지각", "질병", [0]);
  await until(() => A.d.querySelectorAll("#classBody .stu.지각").length === 1, "2번 지각");
  if (process.env.DUMP_CLASS) {                   // 우리 반 세 보기를 떠 둔다(눈으로 볼 때)
    for (const t of ["att", "col"]) { A.sub(t); await wait(60);
      fs.writeFileSync(process.env.DUMP_CLASS + "_" + t + ".html", A.$("nb").outerHTML + A.$("pagebar").outerHTML); }
    A.sub("att"); await wait(60);
  }

  A.tab("lesson");
  await until(() => A.book().includes("호클래스 차시"), "차시 칸");
  A.btn("#classBody", "결석 보내기").click();
  await until(() => A.book().includes("결석 보내기 확인"), "확인 화면", 30000);
  assert(A.book().includes("지각, 조퇴"), "지각은 안 보낸다고 알려 준다");
  assert(A.book().includes("결석 1명 보내기"), "결석 1명: " + A.book().slice(0, 200));
  A.btn("#classBody", "결석 1명 보내기").click();
  await until(() => !A.book().includes("결석 보내기 확인"), "보내고 나면 확인 화면이 닫힌다", 30000);

  const g = JSON.parse(store.get("hoclass_course_grades/cl1_30101"));
  assert.strictEqual(g.absent, true, "결석 표시");
  assert.strictEqual(g.clId, "cl1"); assert.strictEqual(g.studentNo, "30101");
  assert.strictEqual(g.courseId, "c_h301"); assert.strictEqual(g.lessonId, "L1");
  for (const a of ["concept", "mission", "question"]) {
    assert.deepStrictEqual(g[a], { achievedN: 0, onTimeN: 0 }, a + " 는 미달성으로 고정");
    assert.strictEqual(g.manual[a], true, a + " manual 표시");
  }
  assert(!store.has("hoclass_course_grades/cl1_30102"), "지각한 학생은 보내지 않았다");
  assert(!store.has("hoclass_course_grades/cl1_30103"), "출석한 학생은 보내지 않았다");
  assert.deepStrictEqual([...new Set(hcWrites.map(p => p.split("/")[0]))].sort(),
    ["hoclass_course_grades", "hoclass_course_lessons"], "호클래스에 쓴 컬렉션: " + hcWrites.join(", "));

  /* ---------- 나이스에서 받아오기 ---------- */
  A.setTab("year");
  await until(() => A.$("neisKey"), "인증키는 기본 탭");
  A.fill("neisKey", "시험열쇠");
  A.$("neisSave").click();
  await until(() => A.$("neisKey") && A.$("neisKey").value === "시험열쇠", "인증키가 남는다");
  A.setTab("year");                                // 학교는 기본 탭에서 정한다
  await until(() => A.$("neisFindBtn"), "기본 탭의 학교 찾기");
  A.$("neisFindBtn").click();
  await until(() => A.d.querySelector("#neisFound .cpick"), "학교를 찾아 보여 준다");
  A.d.querySelector("#neisFound .cpick").click();
  await until(() => A.$("schoolEdit") && A.$("setForm").textContent.includes("인천동양중학교"), "정한 학교가 보인다");
  // 눈으로 볼 때: DUMP_SET=파일 npm test 하면 학교를 정한 뒤 기본 탭을 떠 둔다. 브라우저로 찍어 본다.
  if (process.env.DUMP_SET) fs.writeFileSync(process.env.DUMP_SET, A.$("setPanel").outerHTML);
  A.setTab("work");
  await until(() => A.$("neisCal"), "학교를 정하면 업무 탭에 학사 일정 받기 단추가 생긴다");
  A.$("neisCal").click();
  await until(() => A.$("ddayList").textContent.includes("입학식"), "학사 일정이 D-day 에 들어온다");
  /* 과목 줄이 없으면 받아오지 않는다. 거를 것이 없어 첫 반이 35칸을 다 먹는다. */
  A.setTab("lesson");
  await until(() => A.$("neisTT"), "시간표 받기는 수업 탭");
  A.$("neisTT").click();
  await until(() => [...A.d.querySelectorAll("#setPanel .form-err")].some(e => e.textContent.includes("내 과목")),
    "과목 줄이 없으면 까닭을 알리고 멈춘다");

  /* 과목마다 가르치는 반이 다르다. 줄을 둘 두고 반을 달리 고른다. */
  A.$("neisSubjAdd").click();
  await until(() => A.d.querySelector("#neisSubjects .nsub"), "과목 줄이 생긴다");
  const nsubs = () => [...A.d.querySelectorAll("#neisSubjects .nsub")];
  const nameSubj = (row, v) => { const i = row.querySelector(".nsub-nm"); i.value = v;
    i.dispatchEvent(new A.w.Event("change", { bubbles: true })); };
  const clsBtn = (row, c) => [...row.querySelectorAll(".cpick")].find(b => b.textContent === c);
  for (const c of ["3-1", "3-9"])
    assert(clsBtn(nsubs()[0], c) && clsBtn(nsubs()[0], c).getAttribute("aria-pressed") === "true",
      "새 과목 줄은 수업 반과 담임 반이 다 켜진 채로 시작한다: " + c);
  nameSubj(nsubs()[0], "역사");
  A.$("neisSubjAdd").click();
  await until(() => nsubs().length === 2, "과목 줄 둘");
  nameSubj(nsubs()[1], "사회");
  clsBtn(nsubs()[1], "3-1").click();            // 사회는 3-1 을 안 가르친다
  await until(() => clsBtn(nsubs()[1], "3-1").getAttribute("aria-pressed") === "false",
    "반을 끌 수 있다");
  await until(() => { const st = JSON.parse(store.get("desk_settings/general") || "{}").state;
    const sj = st && st.neis && st.neis.subjects;
    return sj && sj.length === 2 && sj[0].name === "역사" && sj[1].name === "사회"
      && sj[0].classes.includes("3-1") && !sj[1].classes.includes("3-1"); },
    "과목 줄이 반까지 저장된다");
  /* 시간표는 하루 한 번 저절로 받는다. 받은 날이 설정에 남아 같은 날 되풀이하지 않는다. */
  await until(() => { const st = JSON.parse(store.get("desk_settings/general") || "{}").state;
    const d = new Date(), day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    return st && st.ttAuto === day; }, "시간표를 저절로 받고 그날을 적어 둔다");
  await until(() => A.$("tt").textContent.includes("3-1"), "저절로 받은 시간표가 주간 시간표에 들어온다");

  A.$("neisTT").click();
  await until(() => A.$("tt").textContent.includes("3-1"), "시간표가 주간 시간표에 들어온다");
  /* 나이스에 묻는 학년도는 받아오는 그 주의 학년도다. 수첩이 보는 학년도를 넘기면 0칸이 온다. */
  {
    const d = new Date(), ay = d.getMonth() >= 2 ? d.getFullYear() : d.getFullYear() - 1;
    assert.strictEqual(neisArgs.week[1], ay, "나이스 시간표는 그 주의 학년도로 물어야 한다");
    const sent = neisArgs.week[4];
    assert.strictEqual(sent.length, 2, "과목 줄 둘을 그대로 넘긴다");
    assert(sent[0].classes.includes("3-1") && sent[0].classes.includes("3-9"),
      "역사는 두 반 다 넘어간다");
    assert(!sent[1].classes.includes("3-1") && sent[1].classes.includes("3-9"),
      "사회는 끈 반을 빼고 넘어간다");
  }
  await until(() => { const st = JSON.parse(store.get("desk_settings/general") || "{}").state;
    return st && st.neis && st.neis.school && st.neis.school.code === "7331219"; }, "학교가 저장된다");
  A.$("setClose").click();
  await until(() => A.$("setPanel").hidden, "설정 닫기");
  await until(() => A.$("mealBody").textContent.includes("흑미밥"), "오늘 급식이 급식 위젯에 보인다");

  /* ---------- 시정 채우기 (설정 창 시간표 탭) ---------- */
  assert(!A.$("ttEdit"), "위젯의 편집 단추는 설정 창으로 옮겼다");
  assert(!A.d.querySelector('.wg[data-w="tt"] input'), "위젯의 시간표는 보기만 한다");
  A.setTab("lesson");
  await until(() => A.$("ttSet"), "시간표 탭");
  if (process.env.DUMP_TT) { for (const i of A.d.querySelectorAll("#setPanel input")) i.setAttribute("value", i.value);
    fs.writeFileSync(process.env.DUMP_TT, A.$("setPanel").outerHTML); }
  /* 채우면 패널을 다시 그리므로 칸을 그때그때 다시 찾는다 */
  const bells = () => [...A.d.querySelectorAll("#setPanel .tt-bells input")];
  const fillBtn = () => A.btn("#setPanel", "채우기");
  const times = () => [...A.d.querySelectorAll("#ttSet .bell input")].map(i => i.value);
  const b1 = bells();
  b1[0].value = "09:00"; b1[1].value = "40"; b1[2].value = "10"; b1[3].value = "50";
  fillBtn().click();
  await until(() => times()[0] === "09:00", "1교시 시작이 공식대로 채워진다");
  assert(times().slice(0, 4).join(",") === "09:00,09:40,09:50,10:30", "수업 40분, 쉬는 시간 10분");
  assert(times()[6] === "11:30" && times()[8] === "13:00", "4교시 뒤 점심 50분");
  bells()[1].value = "999";
  fillBtn().click();
  await wait(40);
  assert(times()[0] === "09:00" && times()[1] === "09:40", "말이 안 되는 값으로는 채우지 않는다");
  /* 설정 창에서 고치면 위젯 표도 따라 바뀐다 */
  const cell = A.d.querySelector('#ttSet td input[type="text"]');
  cell.value = "3-7"; cell.dispatchEvent(new A.w.Event("input", { bubbles: true }));
  await until(() => A.$("tt").textContent.includes("3-7"), "설정 창에서 고치면 위젯에 바로 보인다");
  A.$("setClose").click();
  await until(() => A.$("setPanel").hidden, "시간표 탭 닫기");

  /* ---------- 백업 ---------- */
  A.setTab("year");
  await until(() => A.$("bkSave"), "백업 탭");
  A.$("bkSave").click();
  await until(() => saved.length === 1, "백업 파일");
  // jsdom 26 의 Blob 에는 .text() 가 없어서 FileReader 로 읽는다.
  const file = JSON.parse(await new Promise((ok, no) => {
    const fr = new A.w.FileReader();
    fr.onload = () => ok(fr.result); fr.onerror = () => no(fr.error);
    fr.readAsText(saved[0]);
  }));
  assert.strictEqual(file.v, 2, "백업 판 번호");
  for (const k of ["desk_crypto/keys", "desk_years/all", "desk_roster/2027", "desk_att/2027_3-1_" + day]) {
    assert(file.docs[k], "백업에 " + k);
  }
  assert(!Object.keys(file.docs).some(k => k.startsWith("hoclass_")), "백업에 호클래스 자료는 담지 않는다");
  for (const nm of ["김지우", "담임하나"]) assert(!JSON.stringify(file).includes(nm), "백업 파일에 이름 평문 금지: " + nm);

  /* ---------- 설정: 학생 명단 양식 받기, 올리기, 호클래스에서 가져오기 ---------- */
  A.setTab("home");
  await until(() => A.$("rsList") && A.$("rsList").textContent.includes("2명"), "담임 탭에 3-9 명단 2명");
  let tpl = null;   // 엑셀 도구(SheetJS)는 시험에서 가짜로 둔다
  A.w.XLSX = { utils: { aoa_to_sheet: (rows) => ({ rows }), book_new: () => ({}), book_append_sheet: (wb, ws) => { wb.ws = ws; } },
    writeFile: (wb, name) => { tpl = { rows: wb.ws.rows, name }; } };
  A.$("rsTpl").click();
  await until(() => tpl, "양식 받기");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(tpl.rows)), [["학년", "반", "번호", "이름"], [3, 9, 1, "담임하나"], [3, 9, 2, "담임둘"]], "양식에 지금 담임 반 명단이 채워진다");
  assert(tpl.name === "학생명단_담임_2027.xlsx", "양식 파일 이름: " + tpl.name);
  const upload = (name, body) => {
    Object.defineProperty(A.$("rsFile"), "files", { value: [new A.w.File([body], name)], configurable: true });
    A.$("rsFile").dispatchEvent(new A.w.Event("change"));
  };
  const planRows = () => [...A.$("rsPlan").querySelectorAll(".rs-row")].map(r => r.textContent);
  // 한글 윈도 엑셀이 저장한 CSV(EUC-KR)
  const eucKr = (t) => new Uint8Array(require("iconv-lite").encode(t, "euc-kr"));
  upload("명단.csv", eucKr(["학년,반,번호,이름", "3,9,1,담임하나", "3,9,2,새친구", "3,9,3,셋째", "3,1,1,남의반", ",,,", ""].join("\r\n")));
  await until(() => A.$("rsPlan"), "미리보기");
  assert(planRows().some(t => t.includes("3학년 9반") && t.includes("3명") && t.includes("바꿈")), "3-9 세 명: " + planRows());
  assert(planRows().some(t => t.includes("3학년 1반") && t.includes("담임 반이 아닙니다")), "담임 반이 아니면 건너뛴다");
  assert(A.$("rsList").textContent.includes("2명"), "적용 전에는 그대로");
  A.$("rsApply").click();
  await until(() => !A.$("rsPlan") && A.$("rsList").textContent.includes("3명"), "적용하면 3명");
  upload("겹침.csv", ["이름,학번", "가,30901", "나,30901", ""].join("\n"));
  await until(() => A.$("rsPlan") && planRows()[0].includes("1번이 두 번"), "학번 칸도 읽고, 같은 번호가 둘이면 막는다");
  assert(A.$("rsApply").disabled, "저장할 반이 없으면 적용을 못 누른다");
  A.$("rsCancel").click();
  put("hoclass_course_roster/2027_30901", { id: "2027_30901", year: "2027", studentNo: "30901", name: "명부하나" });
  put("hoclass_course_roster/2027_30902", { id: "2027_30902", year: "2027", studentNo: "30902", name: "명부둘" });
  put("hoclass_course_roster/2026_30903", { id: "2026_30903", year: "2026", studentNo: "30903", name: "작년애" });
  A.$("rsHc").click();
  await until(() => A.$("rsPlan") && A.$("rsPlan").textContent.includes("호클래스 학생 명부"), "호클래스 명부 미리보기");
  assert.strictEqual(planRows().length, 1, "내 반(3-9)만");
  assert(planRows()[0].includes("2명"), "그 학년도 학생만: " + planRows());
  A.$("rsApply").click();
  await until(() => A.$("rsList").textContent.includes("2명"), "호클래스 명부로 바꾼다");
  A.setTab("lesson");
  await until(() => A.$("rsList"), "수업 탭 명단");
  assert(A.$("rsList").textContent.includes("호클래스 강의실"), "강의실 반은 호클래스 명단을 쓴다고 보인다");
  await wait(900);
  for (const nm of ["새친구", "명부하나"]) assert(!allStored().includes(nm), "올린 명단 평문 금지: " + nm);
  A.$("setClose").click();
  await until(() => A.$("setPanel").hidden, "설정 닫기");

  /* ---------- 끊겨도 스스로 다시 붙는다 ---------- */
  // 전에는 한 번 끊기면 새로고침 전까지 영영 끊긴 채였고, 그동안 "우리 반" 은
  // 눌러도 "저장소에 연결된 뒤에 할 수 있습니다" 만 나오는 칸을 보여 주었다.
  assert(A.$("sync").textContent.includes("저장"), "끊기기 전: " + A.$("sync").textContent);
  breakCloud();
  await until(() => A.$("sync").textContent.includes("끊"), "끊기면 까닭을 알린다: " + A.$("sync").textContent);
  assert(A.$("tools").classList.contains("alert"), "저장이 어긋나면 우상단 도구가 저절로 보인다");
  await until(() => A.$("sync").textContent.includes("모든 기기에 저장됨"), "스스로 다시 붙는다", 30000);
  assert(!A.$("tools").classList.contains("alert"), "다시 붙으면 도구가 다시 숨는다");

  /* ---------- 나가기 ---------- */
  A.$("signOut").click();
  await until(() => !A.$("gate").hidden, "나가면 로그인 문으로");
  assert(!JSON.parse(A.w.localStorage.getItem("my-desk-v3:keepKey") || "null"), "나가면 이 기기에 둔 열쇠도 지운다");
  assert(!A.$("classBody").textContent.includes("김지우"), "나간 뒤 화면에 이름이 없다");

  await wait(200);
  assert.deepStrictEqual(errs, [], "오류 없음");
  console.log("전부 통과. 수첩 문서:", [...store.keys()].filter(k => k.startsWith("desk_")).sort().join(", "));
  process.exit(0);
})().catch((e) => {
  console.error("실패:", e.message);
  if (errs.length) console.error(errs.join("\n"));
  console.error(e.stack);
  process.exit(1);
});
