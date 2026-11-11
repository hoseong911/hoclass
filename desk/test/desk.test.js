// 파베판 수첩을 가짜 파이어스토어·Auth로 끝까지 시험한다. 실제 계정과 실제 파베는 건드리지 않는다.
// 쓰는 법: node desk/test/desk.test.js
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
const listeners = new Map();             // 경로 → 듣는 함수들
const clone = (o) => JSON.parse(JSON.stringify(o));
function mkSnap(p) {
  const has = store.has(p);
  const body = has ? JSON.parse(store.get(p)) : undefined;
  return { id: p.split("/").pop(), exists: () => has, data: () => body, metadata: { fromCache: false, hasPendingWrites: false } };
}
function notify(p) { for (const fn of listeners.get(p) || []) setTimeout(() => fn(mkSnap(p)), 4); }
const writes = [];
function makeFB() {
  const user = { uid: "t1", email: "ho0911seong@gmail.com", displayName: "" };
  let current = null, authCbs = [];
  return {
    db: { _fake: true }, auth: { _fake: true },
    doc: (_db, col, id) => ({ _p: col + "/" + id }),
    collection: (_db, col) => ({ _c: col }),
    getDoc: async (ref) => mkSnap(ref._p),
    setDoc: async (ref, body) => {
      if (!current) { const e = new Error("no auth"); e.code = "permission-denied"; throw e; }
      writes.push(ref._p);
      store.set(ref._p, JSON.stringify(clone(body)));
      notify(ref._p);
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
      setTimeout(() => next(mkSnap(p)), 4);
      return () => listeners.get(p).delete(next);
    },
    signInWithEmailAndPassword: async (_a, email, pw) => {
      if (email !== user.email || pw !== "계정비밀번호") { const e = new Error("bad"); e.code = "auth/invalid-credential"; throw e; }
      current = user;
      authCbs.forEach(cb => cb(current));
      return { user: current };
    },
    signOut: async () => { current = null; authCbs.forEach(cb => cb(null)); },
    onAuthStateChanged: (_a, cb) => { authCbs.push(cb); setTimeout(() => cb(current), 0); return () => {}; },
    query: (c) => c, where: () => ({}), orderBy: () => ({}), limit: () => ({}),
    runTransaction: async (_db, fn) => fn({
      get: async (ref) => mkSnap(ref._p),
      set: (ref, body) => { writes.push(ref._p); store.set(ref._p, JSON.stringify(clone(body))); notify(ref._p); },
    }),
  };
}

/* ---------- 화면 띄우기 ---------- */
const errs = [], saved = [];
function device() {
  const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
  const dom = new JSDOM(html, {
    runScripts: "outside-only", url: "https://hoseong911.github.io/hoclass/desk/", pretendToBeVisual: true,
  });
  const w = dom.window, d = w.document;
  Object.defineProperty(w, "crypto", { value: webcrypto });
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.__FB__ = makeFB();
  // 내려받기는 흉내만 낸다: 파일 내용을 들고 있는다.
  w.URL.createObjectURL = (blob) => { saved.push(blob); return "blob:fake/" + saved.length; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { this.dispatchEvent(new w.Event("click")); };
  w.addEventListener("error", (e) => errs.push("페이지 오류: " + e.message));
  w.addEventListener("unhandledrejection", (e) => errs.push("처리 안 된 거부: " + (e.reason && e.reason.message)));
  const code = fs.readFileSync(path.join(DIR, "desk.js"), "utf8")
    .replace(/^import \{ FB \} from "\.\/fb-desk\.js";$/m, "const FB = window.__FB__;");
  if (code.includes("import ")) throw new Error("import 를 못 걷어냈다");
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
  };
}

const PASS = "수첩비밀번호2027";
const NAMES = ["김지우", "이주서", "박세찌"];
const allStored = () => [...store.values()].join("\n");

(async () => {
  const A = device();

  /* ---------- 로그인 문 ---------- */
  await until(() => !A.$("gate").hidden, "로그인 문이 먼저 보인다");
  assert(A.$("app").hidden, "로그인 전에는 수첩이 가려져 있다");
  A.fill("gateEmail", "ho0911seong@gmail.com"); A.fill("gatePass", "틀린비번");
  A.submit("gateForm");
  await until(() => A.$("gateErr").textContent.includes("맞지 않아요"), "틀린 계정 비밀번호 거부");
  assert.strictEqual(store.size, 0, "로그인 전에는 아무것도 저장하지 않는다");

  A.fill("gateEmail", "ho0911seong@gmail.com"); A.fill("gatePass", "계정비밀번호");
  A.submit("gateForm");
  await until(() => A.$("gate").hidden && !A.$("app").hidden, "로그인하면 수첩이 열린다");

  /* ---------- 수첩 비밀번호 (두 번째 겹) ---------- */
  await until(() => A.$("setupForm"), "수첩 비밀번호 만들기 화면");
  assert(A.book().includes("비밀번호를 먼저 만들면"), "수첩은 아직 잠겨 있다");
  A.fill("setupPass", PASS); A.fill("setupPass2", PASS);
  A.submit("setupForm");
  await until(() => A.$("recoveryCode"), "복구 키 화면");
  const rec = A.$("recoveryCode").textContent;
  assert(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/.test(rec), "복구 키 형식: " + rec);
  A.$("recoveryOk").checked = true; A.$("recoveryOk").dispatchEvent(new A.w.Event("change"));
  A.$("recoveryDone").click();
  await until(() => A.$("setBtn"), "설정 단추");

  /* ---------- 문서가 컬렉션으로 갈라져 저장된다 ---------- */
  await until(() => store.has("desk_crypto/keys"), "desk_crypto/keys");
  for (const p of ["desk_settings/general", "desk_years/all", "desk_todos/all", "desk_ddays/all", "desk_memo/all", "desk_calendar/all"]) {
    await until(() => store.has(p), p);
  }
  assert(!allStored().includes(rec.replace(/-/g, "")), "복구 키 평문 저장 금지");

  /* ---------- 올해 설정: 2027, 3학년 1~6반 ---------- */
  A.$("setBtn").click();
  await until(() => A.$("setForm"), "설정 패널");
  A.fill("setYear", "2027"); A.fill("setHome", ""); A.fill("setClasses", "3-1, 3-2, 3-3, 3-4, 3-5, 3-6");
  A.fill("setSchool", "인천테스트중학교");
  A.submit("setForm");
  await until(() => A.$("className").textContent === "3학년 1반", "첫 수업 반");
  const yrBody = () => JSON.parse(store.get("desk_years/all"));
  await until(() => yrBody().state.years["2027"], "학년도 저장");
  assert.deepStrictEqual(yrBody().state.years["2027"].classes, ["3-1", "3-2", "3-3", "3-4", "3-5", "3-6"]);
  assert.deepStrictEqual([...A.d.querySelectorAll("#classPick .cpick")].map(x => x.textContent),
    ["3-1", "3-2", "3-3", "3-4", "3-5", "3-6"], "반 고르는 줄");

  /* ---------- 명단과 출결 ---------- */
  A.$("rosterBtn").click();
  await until(() => A.$("rNames"), "명단 편집");
  A.fill("rCount", "3"); A.fill("rNames", NAMES.join("\n"));
  A.$("rSave").click();
  await until(() => A.d.querySelectorAll("#classBody .stu").length === 3, "학생 3명");
  await until(() => store.has("desk_roster/2027"), "desk_roster/2027");

  A.d.querySelectorAll("#classBody .stu")[0].click();
  await until(() => A.d.querySelectorAll("#classBody .stu.결석").length === 1, "결석 1명");
  const attKey = await (async () => {
    await until(() => [...store.keys()].some(k => k.startsWith("desk_att/")), "출결 문서 저장");
    return [...store.keys()].find(k => k.startsWith("desk_att/"));
  })();
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  assert.strictEqual(attKey, "desk_att/2027_3-1_" + day, "출결 문서 이름: " + attKey);

  // 꼬리표는 평문, 내용은 암호문
  const att = JSON.parse(store.get(attKey));
  assert.deepStrictEqual(Object.keys(att).sort(), ["at", "c", "date", "iv", "room", "v", "year"], "출결 본문 칸: " + Object.keys(att));
  assert.strictEqual(att.year, "2027"); assert.strictEqual(att.room, "3-1"); assert.strictEqual(att.date, day);
  await wait(900);
  for (const nm of NAMES) assert(!allStored().includes(nm), "서버에 평문 금지: " + nm);
  assert(!allStored().includes("결석"), "출결 내용도 평문 금지");

  /* ---------- 반을 바꾸면 그 반의 출결 문서가 따로 열린다 ---------- */
  A.pick("3-2");
  await until(() => A.$("className").textContent === "3학년 2반", "3-2로 바뀜");
  await until(() => A.text().includes("학생 명단이 비어"), "3-2는 명단이 없다");
  A.$("rosterBtn").click();
  await until(() => A.$("rNames"), "3-2 명단 편집");
  A.fill("rCount", "2"); A.fill("rNames", "최이반\n정이반");
  A.$("rSave").click();
  await until(() => A.d.querySelectorAll("#classBody .stu").length === 2, "3-2 학생 2명");
  A.d.querySelectorAll("#classBody .stu")[0].click();
  await until(() => A.d.querySelectorAll("#classBody .stu.결석").length === 1, "3-2 결석 1명");
  await until(() => store.has("desk_att/2027_3-2_" + day), "3-2 출결 문서가 따로 생긴다");
  A.pick("3-1");
  await until(() => A.d.querySelectorAll("#classBody .stu.결석").length === 1 && A.text().includes(NAMES[0]), "3-1 출결은 그대로");

  /* ---------- 수첩 다섯 화면 ---------- */
  for (const p of ["today", "student", "consult", "lesson", "work"]) {
    A.tab(p); await wait(40);
    assert(A.d.querySelectorAll("#bookBody .panel").length > 0, p + " 화면이 비었다");
  }
  A.tab("today");
  await until(() => A.book().includes("3-1") && A.book().includes("3-2"), "오늘 출결에 두 반이 다 보인다");
  await until(() => A.book().includes("1번 " + NAMES[0]), "오늘 출결에 결석 학생 이름");

  A.tab("consult");
  await wait(40);
  A.fill("coTitle", "지각 잦음 상담");
  A.submit("coForm");
  await until(() => A.book().includes("지각 잦음 상담"), "상담 기록");
  await until(() => store.has("desk_consults/2027"), "desk_consults/2027");
  await wait(900);
  assert(!allStored().includes("지각 잦음"), "상담 내용 평문 금지");

  A.tab("work");
  await wait(40);
  A.fill("woTitle", "학교폭력 실태조사 회신"); A.fill("woDue", "2027-03-20");
  A.submit("woForm");
  await until(() => A.book().includes("학교폭력 실태조사"), "업무 기록");
  await until(() => store.has("desk_works/2027"), "desk_works/2027");

  /* ---------- 백업 파일 ---------- */
  A.$("setBtn").click();
  await until(() => A.$("bkSave"), "백업 칸");
  A.$("bkSave").click();
  await until(() => saved.length === 1, "백업 파일 만들기");
  const file = JSON.parse(await saved[0].text());
  assert.strictEqual(file.tag, "my-desk-backup"); assert.strictEqual(file.v, 2, "백업 판 번호");
  for (const k of ["desk_crypto/keys", "desk_years/all", "desk_roster/2027", "desk_consults/2027", attKey]) {
    assert(file.docs[k], "백업에 " + k);
  }
  for (const nm of NAMES) assert(!JSON.stringify(file).includes(nm), "백업 파일에 이름 평문 금지: " + nm);

  /* ---------- 나가기 ---------- */
  A.$("signOut").click();
  await until(() => !A.$("gate").hidden, "나가면 로그인 문으로");
  assert(!A.$("classBody").textContent.includes(NAMES[0]), "나간 뒤 화면에 이름이 없다");

  await wait(200);
  assert.deepStrictEqual(errs, [], "오류 없음");
  console.log("전부 통과. 저장 문서:", [...store.keys()].sort().join(", "));
  process.exit(0);
})().catch((e) => {
  console.error("실패:", e.message);
  if (errs.length) console.error(errs.join("\n"));
  console.error(e.stack);
  process.exit(1);
});
