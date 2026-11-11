// 파베판 수첩을 가짜 파이어스토어·Auth로 끝까지 시험한다. 실제 계정과 실제 파베는 건드리지 않는다.
// 쓰는 법: cd desk && npm test
const fs = require("fs"), path = require("path"), assert = require("assert");
const { JSDOM } = require("jsdom");
const webcrypto = require("crypto").webcrypto;

const DIR = path.join(__dirname, "..");
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, label, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) {} await wait(25); }
  throw new Error("시간 초과: " + label);
}

/* ---------- 가짜 파이어스토어 ---------- */
const store = new Map();                 // "컬렉션/문서" → 본문(JSON 글자)
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
  // 다른 학년도 강의실 한 개: 섞여 들어오면 안 된다
  put("hoclass_courses/c_h201", { id: "c_h201", year: "2026", subject: "역사", grade: "2", classNo: "1", status: "active" });

  // 강의 본체 둘과, 3-1 강의실에 꽂힌 차시 둘(하나는 날짜 없음)
  put("hoclass_lessons/L1", { id: "L1", title: "3단원 조선의 성립", order: 1, parts: { concept: true, mission: true, question: true } });
  put("hoclass_lessons/L2", { id: "L2", title: "4단원 조선의 문화", order: 2, parts: { concept: true, mission: true } });
  put("hoclass_course_lessons/cl1", { id: "cl1", courseId: "c_h301", lessonId: "L1", order: "1", isOpen: true, date: TODAY });
  put("hoclass_course_lessons/cl2", { id: "cl2", courseId: "c_h301", lessonId: "L2", order: "2", isOpen: true, date: "" });
  // 1차시 미션 제출: 1번과 3번만 냈다
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
      (ref._p.startsWith("hoclass_") ? hcWrites : writes).push(ref._p);
      put(ref._p, clone(body)); notify(ref._p);
    },
    getDocs: async (q) => {
      const want = q._c + "/";
      const docs = [...store.keys()].filter(k => k.startsWith(want)).sort().map(mkSnap);
      return { docs, forEach: (fn) => docs.forEach(fn) };
    },
    onSnapshot: (ref, next) => {
      const p = ref._p;
      if (!listeners.has(p)) listeners.set(p, new Set());
      listeners.get(p).add(next);
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
      set: (ref, body) => { writes.push(ref._p); put(ref._p, clone(body)); notify(ref._p); },
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
  // desk.css 를 직접 꽂는다. jsdom 은 <link> 를 따라가지 않아서,
  // 이걸 안 하면 "hidden 인데도 보인다" 같은 문제를 못 잡는다.
  const style = d.createElement("style");
  style.textContent = fs.readFileSync(path.join(DIR, "desk.css"), "utf8");
  d.head.append(style);
  Object.defineProperty(w, "crypto", { value: webcrypto });
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.__FB__ = makeFB();
  // 구글 캘린더는 창을 띄우므로 시험에서는 가짜로 둔다(연결 안 된 상태).
  w.__GCAL__ = {
    savedToken: () => null, forgetToken: () => {},
    connect: async () => { const e = new Error("시험에서는 연결하지 않는다"); throw e; },
    listEvents: async () => [], byDay: () => [],
    why: (e) => ({ step: 0, msg: String((e && e.message) || "") }),
    CONSOLE_URL: "https://example.invalid/",
  };
  w.URL.createObjectURL = (blob) => { saved.push(blob); return "blob:fake/" + saved.length; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { this.dispatchEvent(new w.Event("click")); };
  w.addEventListener("error", (e) => errs.push("페이지 오류: " + e.message));
  w.addEventListener("unhandledrejection", (e) => errs.push("처리 안 된 거부: " + (e.reason && e.reason.message)));
  // 모듈 셋을 한 덩어리로 이어 붙여 넣는다(jsdom은 import 를 못 따라간다).
  const sideCode = ["grid.js", "hoclass.js"]
    .map(f => fs.readFileSync(path.join(DIR, f), "utf8").replace(/^export /gm, ""))
    .join("\n");
  const deskCode = fs.readFileSync(path.join(DIR, "desk.js"), "utf8")
    .replace(/^import \{ FB \} from "\.\/fb-desk\.js";$/m, "const FB = window.__FB__;")
    .replace(/^import \{[^}]*\} from "\.\/hoclass\.js";$/m, "")
    .replace(/^import \{[^}]*\} from "\.\/grid\.js";$/m, "")
    .replace(/^import \* as GCal from "\.\/gcal\.js";$/m, "const GCal = window.__GCAL__;");
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

/* hidden 을 붙여도 숨지 않을 수 있다. .gate{display:grid} 같은 규칙이 이기기 때문이다.
   실제로 그래서 로그인 창이 안 사라지고 수첩 위를 덮었다(2026-11-11).
   jsdom 은 이 싸움을 그대로 흉내 내지 않아(규칙을 빼도 통과했다) 글자로 확인한다. */
function checkHiddenRule() {
  const css = fs.readFileSync(path.join(DIR, "desk.css"), "utf8");
  assert(/\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/.test(css),
    "desk.css 에 [hidden] { display: none !important } 가 있어야 한다. 없으면 로그인 창이 수첩 위를 덮는다");
}

(async () => {
  checkHiddenRule();
  seedHoclass();
  const A = device();

  /* ---------- 로그인 문 ---------- */
  await until(() => !A.$("gate").hidden, "로그인 문이 먼저 보인다");
  assert(A.$("app").hidden, "로그인 전에는 수첩이 가려져 있다");
  A.fill("gateEmail", "ho0911seong@gmail.com"); A.fill("gatePass", "틀린비번");
  A.submit("gateForm");
  await until(() => A.$("gateErr").textContent.includes("맞지 않아요"), "틀린 계정 비밀번호 거부");
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
  await until(() => A.$("setBtn"), "설정 단추");
  for (const p of ["desk_crypto/keys", "desk_settings/general", "desk_years/all", "desk_todos/all", "desk_ddays/all", "desk_memo/all", "desk_calendar/all"]) {
    await until(() => store.has(p), p);
  }
  assert(!allStored().includes(rec.replace(/-/g, "")), "복구 키 평문 저장 금지");

  /* ---------- 올해 설정: 2027, 담임 반은 호클래스에 없는 3-9 ---------- */
  A.$("setBtn").click();
  await until(() => A.$("setForm"), "설정 패널");
  A.fill("setYear", "2027"); A.fill("setHome", "3-9"); A.fill("setClasses", "");
  A.submit("setForm");

  /* ---------- 구글 캘린더 우젯 ---------- */
  await until(() => A.$("gcalBody").textContent.includes("이어 붙이면"), "연결 전에는 안내가 보인다");
  assert(!A.$("gcalBtn").hidden, "연결 단추가 보인다");

  /* ---------- 칸(그리드) 배치: 24×16, 4단 ---------- */
  const deck = A.$("deck");
  assert.strictEqual(deck.style.getPropertyValue("--cols"), "24", "가로 24칸");
  assert.strictEqual(deck.style.getPropertyValue("--rows"), "16", "세로 16칸");
  // 4단: 한 단이 6칸이고 각 단이 1, 7, 13, 19 열에서 시작한다
  assert.strictEqual(A.area("clock"), "1 / 1 / span 3 / span 6", "1단 머리: " + A.area("clock"));
  assert.strictEqual(A.area("class"), "1 / 7 / span 16 / span 6", "2단 우리 반");
  assert.strictEqual(A.area("book"), "1 / 13 / span 16 / span 6", "3단 교무수첩");
  assert.strictEqual(A.area("gcal"), "1 / 19 / span 5 / span 6", "4단 구글 캘린더");
  assert(A.wg("tt").hidden, "주간 시간표는 기본으로 꺼져 있다");
  await until(() => store.has("desk_grid/all"), "desk_grid/all 저장");

  // 칸 수를 바꾸면 밖으로 나간 것이 들어온다
  if (!A.$("setCols")) A.$("setBtn").click();
  await until(() => A.$("setCols"), "칸 수 칸");
  A.fill("setCols", "12"); A.fill("setRows", "8");
  A.btn("#setPanel", "칸 수 바꾸기").click();
  await until(() => deck.style.getPropertyValue("--cols") === "12", "가로 12칸으로");
  assert.strictEqual(deck.style.getPropertyValue("--rows"), "8", "세로 8칸으로");
  for (const id of ["clock", "class", "book", "gcal", "todos", "ddays", "memo"]) {
    const m = /^(\d+) \/ (\d+) \/ span (\d+) \/ span (\d+)$/.exec(A.area(id));
    assert(m, id + " 자리 모양: " + A.area(id));
    const [y, x, h, w] = m.slice(1).map(Number);
    assert(x + w - 1 <= 12 && y + h - 1 <= 8, id + " 가 칸 밖으로 나갔다: " + A.area(id));
  }

  // 우젯을 켜고 끈다
  const ttBtn = () => [...A.d.querySelectorAll("#setPanel .wg-toggle")].find(b => b.textContent.startsWith("주간 시간표"));
  ttBtn().click();
  await until(() => !A.wg("tt").hidden, "주간 시간표를 켜면 보인다");
  ttBtn().click();
  await until(() => A.wg("tt").hidden, "다시 끄면 사라진다");
  assert(Number(deck.style.getPropertyValue("--rows")) >= 8, "자리가 없어 세로가 늘어났다: " + deck.style.getPropertyValue("--rows"));

  // 기본 배치로 되돌리기 (두 번 눌러야 한다)
  const back = () => A.btn("#setPanel", "기본 배치로 되돌리기") || A.btn("#setPanel", "한 번 더 누르면 되돌리기");
  back().click(); back().click();
  await until(() => deck.style.getPropertyValue("--cols") === "24", "되돌리면 24칸");
  assert.strictEqual(A.area("class"), "1 / 7 / span 16 / span 6", "되돌린 2단 자리");
  A.$("setBtn").click();                        // 설정 닫기
  await until(() => !A.$("setCols"), "설정 닫힘");

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
  A.$("setBtn").click();
  await until(() => A.$("setForm"), "설정 다시");
  A.fill("setYear", "2027"); A.fill("setHome", "3-9");
  A.submit("setForm");                                  // 저장하면 호클래스를 다시 읽는다
  await until(() => A.text().includes("학번에 붙은 이름이 달라졌어요"), "파수꾼이 알린다", 30000);
  assert(A.text().includes("30102번: 이주서 → 전학온애"), "바뀐 학번과 이름: " + A.text().slice(0, 160));
  A.btn("#classBody", "확인했어요").click();
  await until(() => !A.text().includes("학번에 붙은 이름이 달라졌어요"), "확인하면 경고가 사라진다");

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

  // 차시를 고르면 날짜와 단원이 채워진다
  A.$("leCl").value = "cl1";
  A.$("leCl").dispatchEvent(new A.w.Event("change"));
  assert.strictEqual(A.$("leAt").value, TODAY, "차시 날짜가 채워진다");
  assert.strictEqual(A.$("leUnit").value, "3단원 조선의 성립", "차시 단원이 채워진다");
  A.submit("leForm");
  await until(() => A.book().includes("3단원 조선의 성립"), "수업 기록 저장");

  // 차시 날짜 넣기 (호클래스에 쓰는 첫 번째 자리)
  A.btn("#bookBody", "오늘 날짜 넣기").click();
  await until(() => !A.book().includes("날짜 없음"), "2차시에 날짜가 들어간다", 30000);
  assert.strictEqual(JSON.parse(store.get("hoclass_course_lessons/cl2")).date, TODAY, "2차시 날짜");
  assert(hcWrites.includes("hoclass_course_lessons/cl2"), "차시 문서에 썼다");

  // 수합을 차시에 걸면 호클래스 제출을 그대로 본다
  [...A.d.querySelectorAll("#classSeg button")].find(b => b.dataset.tab === "col").click();
  await until(() => A.$("colName"), "수합 칸");
  A.fill("colName", "1차시 미션");
  A.$("colCl").value = "cl1"; A.$("colPart").value = "mission";
  A.submit("colForm");
  await until(() => A.text().includes("호클래스 제출을 그대로 보는"), "호클래스에 걸린 수합", 30000);
  await until(() => A.d.querySelectorAll("#classBody .stu.got").length === 2, "1번·3번만 제출로 보인다");
  assert(A.text().includes("미제출 1명"), "미제출 1명: " + A.text().slice(0, 120));

  /* ---------- 6단계: 결석 보내기 ---------- */
  [...A.d.querySelectorAll("#classSeg button")].find(b => b.dataset.tab === "att").click();
  await until(() => A.d.querySelectorAll("#classBody .stu").length === 3, "출결 탭");
  // 2번을 지각으로 (지각은 보내지 않아야 한다)
  const t2 = A.stu()[1];
  t2.click(); t2.click();                       // 결석 → 지각
  await until(() => A.d.querySelectorAll("#classBody .stu.지각").length === 1, "2번 지각");

  A.tab("lesson");
  await until(() => A.book().includes("호클래스 차시"), "차시 칸");
  A.btn("#bookBody", "결석 보내기").click();
  await until(() => A.book().includes("결석 보내기 확인"), "확인 화면", 30000);
  assert(A.book().includes("지각·조퇴"), "지각은 안 보낸다고 알려 준다");
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
  // 호클래스에 쓴 곳은 차시 날짜와 성적 기록뿐이다
  assert.deepStrictEqual([...new Set(hcWrites.map(p => p.split("/")[0]))].sort(),
    ["hoclass_course_grades", "hoclass_course_lessons"], "호클래스에 쓴 컬렉션: " + hcWrites.join(", "));

  /* ---------- 백업 ---------- */
  A.$("setBtn").click();
  await until(() => A.$("bkSave"), "백업 칸");
  A.$("bkSave").click();
  await until(() => saved.length === 1, "백업 파일");
  const file = JSON.parse(await saved[0].text());
  assert.strictEqual(file.v, 2, "백업 판 번호");
  for (const k of ["desk_crypto/keys", "desk_years/all", "desk_roster/2027", "desk_att/2027_3-1_" + day]) {
    assert(file.docs[k], "백업에 " + k);
  }
  assert(!Object.keys(file.docs).some(k => k.startsWith("hoclass_")), "백업에 호클래스 자료는 담지 않는다");
  for (const nm of ["김지우", "담임하나"]) assert(!JSON.stringify(file).includes(nm), "백업 파일에 이름 평문 금지: " + nm);

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
