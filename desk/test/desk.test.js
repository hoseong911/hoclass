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
const errs = [], saved = [];
function device() {
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
  w.__NEIS__ = {
    findSchools: async () => [{ name: "인천동양중학교", atpt: "E10", code: "7331219", kind: "중학교", office: "인천광역시교육청", address: "" }],
    loadSchedule: async () => [{ d: "2027-03-02", name: "입학식" }, { d: "2027-07-20", name: "여름방학식" }],
    loadMeal: async () => [{ kind: "중식", dishes: ["흑미밥", "된장국"], kcal: "800 Kcal" }],
    loadMyWeek: async () => [["3-1", "", "", "", "", "", ""], ["", "", "", "", "", "", ""],
                             ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""]],
    loadClassDay: async () => [],
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
  w.eval(code);
  const $ = (id) => d.getElementById(id);
  return {
    w, d, $,
    fill: (id, v) => { $(id).value = v; },
    submit: (id) => $(id).dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })),
    text: () => $("classBody").textContent,
    book: () => $("bookBody").textContent,
    tab: (p) => [...d.querySelectorAll("#bookSeg button")].find(b => b.dataset.page === p).click(),
    setTab: (k) => {
      if ($("setPanel").hidden) $("toolSet").click();
      const b = d.querySelector('#setPanel .set-tab[data-tab="' + k + '"]');
      if (!b) throw new Error("설정 탭이 없다: " + k);
      b.click();
    },
    btn: (where, label) => [...d.querySelectorAll(where + " button")].find(b => b.textContent.includes(label)),
    pick: (c) => [...d.querySelectorAll("#classPick .cpick")].find(x => x.textContent.startsWith(c)).click(),
    stu: () => [...d.querySelectorAll("#classBody .stu")],
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

(async () => {
  checkHiddenRule();
  checkShrinkRules();
  checkWeatherCodes();
  checkIconNames();
  checkFonts();
  seedHoclass();
  const A = device();

  /* ---------- 로그인 문 ---------- */
  await until(() => !A.$("gate").hidden, "로그인 문이 먼저 보인다");
  assert(A.$("app").hidden, "로그인 전에는 수첩이 가려져 있다");
  A.fill("gateEmail", "ho0911seong@gmail.com"); A.fill("gatePass", "틀린비번");
  A.submit("gateForm");
  await until(() => A.$("gateErr").textContent.includes("맞지 않습니다"), "틀린 계정 비밀번호 거부");
  assert(![...store.keys()].some(k => k.startsWith("desk_")), "로그인 전에는 수첩 자료를 저장하지 않는다");

  A.fill("gateEmail", "ho0911seong@gmail.com"); A.fill("gatePass", "계정비밀번호");
  A.submit("gateForm");
  await until(() => A.$("gate").hidden && !A.$("app").hidden, "로그인하면 수첩이 열린다");

  /* ---------- 수첩 비밀번호 ---------- */
  await until(() => A.$("setupForm"), "수첩 비밀번호 만들기");
  assert(A.book().includes("비밀번호를 먼저 만들면"), "수첩은 아직 잠겨 있다");
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

  /* ---------- 올해 설정: 2027, 담임 반은 호클래스에 없는 3-9 ---------- */
  A.$("toolSet").click();
  await until(() => A.$("setForm"), "설정 패널");
  assert.strictEqual(A.$("setTitle").textContent, "설정", "패널 머리줄 제목");
  assert(A.$("setClose"), "머리줄에 닫기 단추가 있다");
  assert(!A.$("setScrim").hidden, "열면 뒤가 가려진다");
  assert.deepStrictEqual([...A.d.querySelectorAll("#setPanel .set-tab")].map(b => b.textContent),
    ["학년도", "바로가기", "화면", "나이스", "백업", "비밀번호"], "탭 여섯");
  A.$("setClose").click();
  await until(() => A.$("setPanel").hidden && A.$("setScrim").hidden, "닫기 단추로 닫힌다");
  A.$("toolSet").click();
  await until(() => A.$("setForm"), "다시 열면 학년도 탭");
  /* 학년도를 더하고, 담임 반은 글이 아니라 고르개로 정한다 */
  A.fill("setYear", "2027");
  A.btn("#setPanel", "학년도 추가").click();
  await until(() => A.d.querySelector('#setPanel .cpick[data-year="2027"][aria-pressed="true"]'), "2027학년도를 더하고 고른다");
  A.$("setHome").value = "home";
  A.$("setHome").dispatchEvent(new A.w.Event("change", { bubbles: true }));
  const [hg, hr] = A.$("setHomeCls").querySelectorAll("input");
  hg.value = "3"; hr.value = "9";
  A.submit("setForm");
  await until(() => A.$("setPanel").hidden, "저장하면 닫힌다");
  await until(() => { const y = JSON.parse(store.get("desk_years/all") || "{}").state; return y && y.years && y.years["2027"] && y.years["2027"].homeroom === "3-9"; }, "담임 반이 3-9 로 저장된다");

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
  assert.strictEqual(deck.style.getPropertyValue("--cols"), "24", "가로 24칸");
  assert.strictEqual(deck.style.getPropertyValue("--rows"), "16", "세로 16칸");
  assert.strictEqual(A.area("clock"), "1 / 1 / span 4 / span 6", "1단 머리: " + A.area("clock"));
  assert.strictEqual(A.area("class"), "1 / 7 / span 16 / span 6", "2단 우리 반");
  assert.strictEqual(A.area("gcal"), "1 / 13 / span 8 / span 6", "3단 구글 캘린더");
  assert.strictEqual(A.area("ddays"), "1 / 19 / span 8 / span 6", "4단 학사 일정");
  assert.strictEqual(A.area("book"), "1 / 1 / span 16 / span 18", "2장 교무수첩");
  assert(A.wg("book").hidden, "1장에서는 교무수첩이 안 보인다");
  assert(A.wg("tt").hidden, "1장에서는 주간 시간표가 안 보인다");
  assert(!A.wg("class").hidden, "1장에서는 우리 반이 보인다");
  assert.strictEqual(dots().length, 2, "페이지 점 두 개");
  const spanOf = (id) => {
    const parts = A.area(id).split(" / ");
    return { y: +parts[0], x: +parts[1], h: +String(parts[2]).replace("span ", ""), w: +String(parts[3]).replace("span ", "") };
  };
  for (const id of ["clock", "links", "now", "periods", "class", "book", "gcal", "todos", "ddays", "memo", "tt"]) {
    const g = spanOf(id);
    assert(g.w >= 4 && g.h >= 4, id + " 가 4×4 보다 작다: " + g.w + "×" + g.h);
  }
  /* 바로가기만 한 칸까지 줄일 수 있다 */
  const gridSrc = fs.readFileSync(path.join(DIR, "grid.js"), "utf8");
  assert(/\{ id: "links",\s+name: "바로가기",\s+min: \[1, 1\] \}/.test(gridSrc),
    "바로가기는 min 이 [1, 1] 이어야 한 칸으로 줄일 수 있다");
  assert(/export const MIN_SIZE = \[2, 2\];/.test(gridSrc), "다른 칸은 2×2 가 한계로 남아야 한다");
  await until(() => store.has("desk_grid/all"), "desk_grid/all 저장");
  assert.strictEqual(JSON.parse(store.get("desk_grid/all")).state.pages, 2, "두 장으로 저장");

  dots()[1].click();
  await until(() => !A.wg("book").hidden, "2장으로 넘기면 교무수첩이 보인다");
  assert(!A.wg("tt").hidden, "2장에 주간 시간표도 있다");
  assert(A.wg("class").hidden, "2장에서는 우리 반이 숨는다");
  A.d.querySelector('#pagebar [aria-label="앞 장"]').click();
  await until(() => !A.wg("class").hidden, "앞 장으로 돌아온다");

  /* 바로가기: 위젯에는 타일만, 더하고 지우는 것은 설정 창에서 */
  const picks = () => [...A.d.querySelectorAll("#setPanel .emoji-pick button")];
  const mode = (k) => A.d.querySelector('#setPanel .seg button[data-mode="' + k + '"]').click();
  const made = (name) => [...A.d.querySelectorAll("#links .link")].find(a => a.textContent.includes(name));
  const lkRow = (name) => [...A.d.querySelectorAll("#setPanel .lk-row")].find(r => r.textContent.includes(name));
  const type = (id, v) => { A.fill(id, v); A.$(id).dispatchEvent(new A.w.Event("input", { bubbles: true })); };

  assert(!A.d.querySelector("#links button"), "위젯에는 누를 타일만 있고 단추는 없다");
  assert(!A.$("editLinks"), "바로가기 편집 단추는 설정 창으로 옮겼다");

  A.setTab("links");
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

  /* 업무포털과 나이스도 설정 창에서 지울 수 있다 */
  assert(made("업무포털") && made("나이스"), "업무포털과 나이스도 보통 바로가기다");
  for (const name of ["업무포털", "나이스", "이모지 시험", "파비콘 시험", "타일 시험"]) {
    const row = lkRow(name);
    assert(row, "설정 창에 " + name + " 줄이 있다");
    row.querySelector("button").click();
  }
  assert(!made("업무포털") && !made("나이스") && !made("이모지 시험"), "설정 창에서 지우면 위젯에서도 없어진다");
  /* officials 표가 저장돼야 다음에 열 때 업무포털과 나이스가 되살아나지 않는다 */
  await until(() => String(store.get("desk_settings/general")).includes('"officials":true'), "officials 표 저장");
  A.$("setClose").click();

  A.setTab("grid");
  await until(() => A.$("setCols"), "화면 탭 열림");
  A.btn("#setPanel", "장 더하기").click();
  await until(() => dots().length === 3, "세 장이 됐다");
  await until(() => JSON.parse(store.get("desk_grid/all")).state.pages === 3, "세 장으로 저장");
  A.btn("#setPanel", "이 장 지우기").click();
  await until(() => dots().length === 2, "빈 장은 지워진다");
  dots()[0].click();
  await until(() => !A.wg("class").hidden, "1장");
  A.btn("#setPanel", "이 장 지우기").click();
  await wait(120);
  assert.strictEqual(dots().length, 2, "위젯이 있는 장은 안 지워진다");

  A.fill("setCols", "12"); A.fill("setRows", "8");
  A.btn("#setPanel", "바꾸기").click();
  await until(() => deck.style.getPropertyValue("--cols") === "12", "가로 12칸으로");
  assert.strictEqual(deck.style.getPropertyValue("--rows"), "8", "세로 8칸으로");
  for (const id of ["clock", "class", "book", "gcal", "todos", "ddays", "memo", "tt"]) {
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
  assert.strictEqual(pageSel().options.length, 2, "장 수만큼 고를 수 있다");
  await goPage(2);
  assert(ttBox().checked, "주간 시간표는 2장에 있다");
  await goPage(1);
  assert(!ttBox().checked, "1장에는 없다");

  await goPage(2);
  ttBox().click();
  await until(() => !ttBox().checked, "체크를 풀면 꺼진다");
  assert(A.wg("tt").hidden, "꺼진 위젯은 화면에서 사라진다");
  ttBox().click();
  await until(() => ttBox().checked, "다시 체크하면 2장으로 돌아온다");

  A.btn("#setPanel", "장 더하기").click();
  await until(() => pageSel().options.length === 3, "장을 더하면 고를 수 있는 장도 늘어난다");
  await goPage(3);
  ttBox().click();
  await until(() => ttBox().checked, "3장에서 체크하면 그 장으로 옮겨진다");
  await goPage(2);
  assert(!ttBox().checked, "2장에서는 빠졌다");
  ttBox().click();
  await until(() => ttBox().checked, "2장으로 되돌린다");
  dots()[2].click();
  await until(() => A.wg("class").hidden, "3장으로 넘어간다");
  A.btn("#setPanel", "이 장 지우기").click();
  await until(() => dots().length === 2, "빈 3장은 지워진다");
  dots()[0].click();

  const back = () => A.btn("#setPanel", "기본 배치로 되돌리기") || A.btn("#setPanel", "한 번 더 누르면 되돌리기");
  back().click(); back().click();
  await until(() => deck.style.getPropertyValue("--cols") === "24", "되돌리면 24칸");
  assert.strictEqual(A.area("class"), "1 / 7 / span 16 / span 6", "되돌린 2단 자리");
  A.d.dispatchEvent(new A.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await until(() => A.$("setPanel").hidden, "ESC 로 닫힌다");
  A.setTab("grid");
  await until(() => A.$("setCols"), "다시 열림");
  A.$("setScrim").click();
  await until(() => !A.$("setCols") && A.$("setScrim").hidden, "가림막으로 닫힌다");

  /* ---------- 호클래스 명단이 저절로 들어온다 ---------- */
  await until(() => [...A.d.querySelectorAll("#classPick .cpick")].length === 3, "담임 반 + 호클래스 두 반");
  assert.deepStrictEqual([...A.d.querySelectorAll("#classPick .cpick")].map(x => x.textContent),
    ["3-9담임", "3-1", "3-2"], "담임 반이 맨 앞, 그 뒤로 호클래스 반");
  A.pick("3-1");
  await until(() => A.stu().length === 3, "3-1 학생 3명이 호클래스에서 들어온다");
  assert(A.text().includes("김지우") && A.text().includes("박세찌"), "호클래스 이름: " + A.text().slice(0, 80));
  assert(A.$("rosterBtn").hidden, "호클래스 반은 명단 편집을 막는다");

  /* ---------- 출결은 학번으로 묶인다 ---------- */
  A.stu()[0].click();
  await until(() => A.absent() === 1, "3-1 결석 1명");
  const day = todayKey();
  await until(() => store.has("desk_att/2027_3-1_" + day), "3-1 출결 문서");
  const att = JSON.parse(store.get("desk_att/2027_3-1_" + day));
  assert.deepStrictEqual(Object.keys(att).sort(), ["at", "c", "date", "iv", "room", "v", "year"], "꼬리표는 평문, 내용은 암호문");
  assert.strictEqual(att.room, "3-1"); assert.strictEqual(att.year, "2027"); assert.strictEqual(att.date, day);
  await wait(900);
  for (const nm of ["김지우", "이주서", "박세찌"]) assert(!allStored().includes(nm), "수첩 쪽에 평문 금지: " + nm);

  /* ---------- 담임 반은 손으로 넣고, 학번을 만들어 준다 ---------- */
  A.pick("3-9");
  await until(() => A.text().includes("학생 명단이 비어"), "3-9는 명단이 없다");
  assert(!A.$("rosterBtn").hidden, "호클래스에 없는 반은 명단 편집을 쓸 수 있다");
  A.$("rosterBtn").click();
  await until(() => A.$("rNames"), "3-9 명단 편집");
  A.fill("rCount", "2"); A.fill("rNames", "담임하나\n담임둘");
  A.$("rSave").click();
  await until(() => A.stu().length === 2, "3-9 학생 2명");
  A.stu()[1].click();
  await until(() => store.has("desk_att/2027_3-9_" + day), "3-9 출결 문서");

  /* ---------- 수첩 다섯 화면 ---------- */
  for (const p of ["today", "student", "consult", "lesson", "work"]) {
    A.tab(p); await wait(40);
    assert(A.d.querySelectorAll("#bookBody .panel").length > 0, p + " 화면이 비었다");
  }
  A.tab("today");
  await until(() => A.book().includes("3-1") && A.book().includes("3-9"), "오늘 출결에 반들이 보인다");
  await until(() => A.book().includes("1번 김지우"), "오늘 출결에 결석 학생");

  A.tab("consult");
  await wait(40);
  A.fill("coTitle", "지각 잦음 상담");
  A.submit("coForm");
  await until(() => A.book().includes("지각 잦음 상담"), "상담 기록");
  await until(() => store.has("desk_consults/2027"), "desk_consults/2027");
  await wait(900);
  assert(!allStored().includes("지각 잦음"), "상담 내용 평문 금지");

  /* ---------- 파수꾼: 학번의 이름이 달라지면 알린다 ---------- */
  renameHoclassStudent("301", 2, "전학온애");
  A.setTab("year");
  await until(() => A.$("setForm"), "설정 다시");
  A.submit("setForm");
  await until(() => A.text().includes("학번에 붙은 이름이 달라졌습니다"), "파수꾼이 알린다", 30000);
  await until(() => { const y = JSON.parse(store.get("desk_years/all") || "{}").state;
    return y && y.years && y.years["2027"] && y.years["2027"].homeroom === "3-9"; }, "다시 저장해도 담임 반이 지워지지 않는다");
  assert(A.text().includes("30102번: 이주서에서 전학온애(으)로"), "바뀐 학번과 이름: " + A.text().slice(0, 160));
  A.btn("#classBody", "확인").click();
  await until(() => !A.text().includes("학번에 붙은 이름이 달라졌습니다"), "확인하면 경고가 사라진다");

  /* ---------- 여기까지 호클래스에는 한 번도 쓰지 않았다 ---------- */
  assert.deepStrictEqual(hcWrites, [], "단추를 누르기 전에는 호클래스에 쓰지 않는다");

  /* ---------- 5단계: 차시와 제출 현황 ---------- */
  A.pick("3-1");
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

  A.btn("#bookBody", "오늘 날짜 넣기").click();
  await until(() => !A.book().includes("날짜 없음"), "2차시에 날짜가 들어간다", 30000);
  assert.strictEqual(JSON.parse(store.get("hoclass_course_lessons/cl2")).date, TODAY, "2차시 날짜");
  assert(hcWrites.includes("hoclass_course_lessons/cl2"), "차시 문서에 썼다");

  [...A.d.querySelectorAll("#classSeg button")].find(b => b.dataset.tab === "col").click();
  await until(() => A.$("colName"), "수합 칸");
  A.fill("colName", "1차시 미션");
  A.$("colCl").value = "cl1"; A.$("colPart").value = "mission";
  A.submit("colForm");
  await until(() => A.d.querySelectorAll("#classBody .stu.got").length === 2, "1번과 3번만 제출로 보인다", 30000);
  assert(A.text().includes("미제출 1명"), "미제출 1명: " + A.text().slice(0, 120));

  /* ---------- 6단계: 결석 보내기 ---------- */
  [...A.d.querySelectorAll("#classSeg button")].find(b => b.dataset.tab === "att").click();
  await until(() => A.d.querySelectorAll("#classBody .stu").length === 3, "출결 탭");
  const t2 = A.stu()[1];
  t2.click(); t2.click();
  await until(() => A.d.querySelectorAll("#classBody .stu.지각").length === 1, "2번 지각");

  A.tab("lesson");
  await until(() => A.book().includes("호클래스 차시"), "차시 칸");
  A.btn("#bookBody", "결석 보내기").click();
  await until(() => A.book().includes("결석 보내기 확인"), "확인 화면", 30000);
  assert(A.book().includes("지각, 조퇴"), "지각은 안 보낸다고 알려 준다");
  assert(A.book().includes("결석 1명 보내기"), "결석 1명: " + A.book().slice(0, 200));
  A.btn("#bookBody", "결석 1명 보내기").click();
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
  A.setTab("neis");
  await until(() => A.$("neisKey"), "나이스 탭");
  A.fill("neisKey", "시험열쇠"); A.fill("neisSubject", "역사");
  A.$("neisSave").click();
  await until(() => A.$("neisKey") && A.$("neisKey").value === "시험열쇠", "인증키가 남는다");
  A.$("neisFindBtn").click();
  await until(() => A.d.querySelector("#neisFound .cpick"), "학교를 찾아 보여 준다");
  A.d.querySelector("#neisFound .cpick").click();
  await until(() => A.$("neisCal"), "학교를 정하면 받아오기 단추가 생긴다");
  A.$("neisCal").click();
  await until(() => A.$("ddayList").textContent.includes("입학식"), "학사 일정이 D-day 에 들어온다");
  A.$("neisTT").click();
  await until(() => A.$("tt").textContent.includes("3-1"), "시간표가 주간 시간표에 들어온다");
  await until(() => { const st = JSON.parse(store.get("desk_settings/general") || "{}").state;
    return st && st.neis && st.neis.school && st.neis.school.code === "7331219"; }, "학교가 저장된다");
  A.$("setClose").click();
  await until(() => A.$("setPanel").hidden, "설정 닫기");
  A.tab("today");
  await until(() => A.book().includes("흑미밥"), "오늘 급식이 수첩 오늘 화면에 보인다");

  /* ---------- 시정 채우기 ---------- */
  A.$("ttEdit").click();
  await until(() => A.d.querySelector("#ttBells input"), "편집하면 시정 칸이 나온다");
  const bIn = A.d.querySelectorAll("#ttBells input");
  bIn[0].value = "09:00"; bIn[1].value = "40"; bIn[2].value = "10"; bIn[3].value = "50";
  A.btn("#ttBells", "채우기").click();
  const times = () => [...A.d.querySelectorAll("#tt input[type=\"time\"]")].map(i => i.value);
  await until(() => times()[0] === "09:00", "1교시 시작이 공식대로 채워진다");
  assert(times().slice(0, 4).join(",") === "09:00,09:40,09:50,10:30", "수업 40분, 쉬는 시간 10분");
  assert(times()[6] === "11:30" && times()[8] === "13:00", "4교시 뒤 점심 50분");
  bIn[1].value = "999";
  A.btn("#ttBells", "채우기").click();
  await wait(40);
  assert(times()[0] === "09:00" && times()[1] === "09:40", "말이 안 되는 값으로는 채우지 않는다");
  A.$("ttEdit").click();
  await until(() => A.$("ttBells").hidden, "편집을 끝내면 시정 칸이 숨는다");

  /* ---------- 백업 ---------- */
  A.setTab("back");
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
