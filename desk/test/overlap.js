/* 칸(위젯) 안에서 글자가 겹치거나 잘리는지 전수 조사한다.  (cd desk && npm run overlap)
 *
 * 왜 따로 돌리나: jsdom 은 글자 크기와 자리를 재지 못한다. 그래서 두 단계로 한다.
 *   1단계  가짜 파베로 수첩을 끝까지 띄우고(desk.test.js 와 같은 방법) 칸 속 HTML 을 뽑는다.
 *   2단계  그 HTML 을 헤드리스 크롬(창이 안 뜨는 크롬)에 넣고, 칸 크기를 2×2 부터 24×16 까지
 *          바꿔 가며 글자 네모가 서로 포개지는지, 잘려 사라지는지 잰다.
 *
 * 줄이는 셈(fitCard)은 desk.js 에서 그대로 떼어다 쓴다. 베껴 두면 언젠가 서로 달라진다.
 * 크롬이 없는 컴퓨터에서는 그냥 건너뛴다(시험이 아니라 점검 도구다).
 */
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");
const webcrypto = require("crypto").webcrypto;

const DIR = path.join(__dirname, "..");
const TMP = path.join(__dirname, ".overlap.html");
const CHROMES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA.replace(/\\/g, "/") + "/Google/Chrome/Application/chrome.exe" : "",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
];
/* 작은 창도 넣는다. --k 가 0.75 에서 멈추므로 창이 작을수록 글이 상대적으로 커져 더 잘 넘친다. */
const SCREENS = ["1024,640", "1280,800", "1366,768", "1920,1080", "2560,1440", "3840,2160"];
const SIZES = [[2,2],[3,2],[2,3],[3,3],[4,3],[4,4],[5,4],[6,4],[6,6],[6,8],[8,6],[9,6],[12,8],[18,16],[24,16]];

const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, label, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) {} await wait(25); }
  throw new Error("시간 초과: " + label);
}

/* ══════════ 1단계: 가짜 파베로 띄워 칸 속 HTML 뽑기 ══════════ */
const store = new Map(), listeners = new Map();
const clone = (o) => JSON.parse(JSON.stringify(o));
const put = (p, body) => store.set(p, JSON.stringify(body));
function mkSnap(p) {
  const has = store.has(p), body = has ? JSON.parse(store.get(p)) : undefined;
  return { id: p.split("/").pop(), exists: () => has, data: () => body, metadata: { fromCache: false, hasPendingWrites: false } };
}
function notify(p) { for (const fn of listeners.get(p) || []) setTimeout(() => fn(mkSnap(p)), 4); }

const TODAY = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
/* 이름을 일부러 길고 많게 섞는다. 긴 글이 겹침을 만든다. */
const HC_NAMES = {
  "301": ["김지우", "이주서", "박세찌", "황보라미", "남궁민수", "선우진하", "제갈현우", "독고영재",
          "김하늘", "이서연", "박민준", "최예은", "정우성", "강다니엘", "윤서아", "임채원",
          "오하준", "신지민", "배수지", "류현진", "한소희", "조정석", "권나라", "홍길동"],
  "302": ["최이반", "정이반"],
};
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
  put("hoclass_lessons/L1", { id: "L1", title: "3단원 조선의 성립과 발전 — 제목이 긴 경우", order: 1, parts: { concept: true, mission: true, question: true } });
  put("hoclass_course_lessons/cl1", { id: "cl1", courseId: "c_h301", lessonId: "L1", order: "1", isOpen: true, date: TODAY });
}

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
    runTransaction: async (_db, fn) => fn({ get: async (ref) => mkSnap(ref._p), set: (ref, body) => { put(ref._p, clone(body)); notify(ref._p); } }),
  };
}

function device() {
  const dom = new JSDOM(fs.readFileSync(path.join(DIR, "index.html"), "utf8"), {
    runScripts: "outside-only", url: "https://hoseong911.github.io/hoclass/desk/", pretendToBeVisual: true,
  });
  const w = dom.window, d = w.document;
  const style = d.createElement("style");
  style.textContent = fs.readFileSync(path.join(DIR, "desk.css"), "utf8");
  d.head.append(style);
  Object.defineProperty(w, "crypto", { value: webcrypto });
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.__FB__ = makeFB();
  w.__GCAL__ = {
    savedToken: () => null, forgetToken: () => {},
    connect: async () => { throw new Error("점검할 때는 연결하지 않는다"); },
    listEvents: async () => [], byDay: () => [],
    why: (e) => ({ step: 0, msg: String((e && e.message) || "") }),
    CONSOLE_URL: "https://example.invalid/",
  };
  w.URL.createObjectURL = () => "blob:fake";
  w.URL.revokeObjectURL = () => {};
  const sideCode = ["grid.js", "hoclass.js"].map(f => fs.readFileSync(path.join(DIR, f), "utf8").replace(/^export /gm, "")).join("\n");
  const deskCode = fs.readFileSync(path.join(DIR, "desk.js"), "utf8")
    .replace(/^import \{ FB \} from "\.\/fb-desk\.js";$/m, "const FB = window.__FB__;")
    .replace(/^import \{[^}]*\} from "\.\/hoclass\.js";$/m, "")
    .replace(/^import \{[^}]*\} from "\.\/grid\.js";$/m, "")
    .replace(/^import \* as GCal from "\.\/gcal\.js";$/m, "const GCal = window.__GCAL__;");
  w.eval(sideCode + "\n" + deskCode);
  return { w, d, $: (id) => d.getElementById(id) };
}

async function dumpWidgets() {
  seedHoclass();
  const A = device(), d = A.d, w = A.w;
  const fill = (id, v) => { A.$(id).value = v; };
  const submit = (id) => A.$(id).dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));

  await until(() => !A.$("gate").hidden, "로그인 문");
  fill("gateEmail", "ho0911seong@gmail.com"); fill("gatePass", "계정비밀번호");
  submit("gateForm");
  await until(() => A.$("gate").hidden && !A.$("app").hidden, "로그인");

  await until(() => A.$("setupForm"), "수첩 비밀번호 만들기");
  fill("setupPass", "수첩비밀번호2027"); fill("setupPass2", "수첩비밀번호2027");
  submit("setupForm");
  await until(() => A.$("recoveryCode"), "복구 키");
  A.$("recoveryOk").checked = true; A.$("recoveryOk").dispatchEvent(new w.Event("change"));
  A.$("recoveryDone").click();
  await until(() => A.$("setBtn"), "설정 단추");

  A.$("setBtn").click();
  await until(() => A.$("setForm"), "설정 패널");
  fill("setYear", "2027"); fill("setHome", "3-1"); fill("setClasses", "3-1, 3-2");
  submit("setForm");
  await until(() => A.$("setPanel").hidden, "설정 저장");

  await until(() => [...d.querySelectorAll("#classPick .cpick")].length >= 2, "반 고르기");
  const pick = [...d.querySelectorAll("#classPick .cpick")].find(x => x.textContent.startsWith("3-1"));
  if (pick) pick.click();
  await until(() => d.querySelectorAll("#classBody .stu").length > 5, "학생 명단");

  A.$("memo").value = "교무회의 2시 — 생활기록부 마감 안내\n3학년 수련회 답사 보고서\n학부모 상담 주간 일정 조정";
  A.$("memo").dispatchEvent(new w.Event("input", { bubbles: true }));

  const qCells = () => [...d.querySelectorAll("#todoQuad .q-cell")];
  for (const [text, q] of [["긴급 공문 회신 — 교육청 제출 기한 오늘까지", 0], ["성적 처리 마감 확인", 1],
                           ["동아리 명부 정리", 2], ["도서 신청 목록 작성하기", 3], ["학급 게시판 교체", 3]]) {
    const c = qCells()[q];
    c.querySelector(".q-in").value = text;
    c.querySelector(".q-add").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await wait(30);
  }

  fill("ddayName", "2학기 기말고사 — 전 학년"); fill("ddayDate", "2026-12-14");
  submit("ddayForm");
  await wait(400);

  const widgets = {};
  for (const el of d.querySelectorAll(".deck .wg")) widgets[el.dataset.w] = el.innerHTML;

  /* 뽑는 순간의 글만 재면 짧은 때를 우연히 집는다. 때에 따라 길어지는 칸은 가장 긴 글로 하나 더 잰다.
     (renderNow 의 점심 안내와 다음 교시 줄, renderPeriods 의 긴 반 이름) */
  const nowEl = d.querySelector('.wg[data-w="now"]');
  if (nowEl) {
    const copy = nowEl.cloneNode(true);
    copy.querySelector("#nowMain").textContent = "3교시 2-2";
    copy.querySelector("#nowSub").textContent = "13:30에 5교시 시작, 1시간 10분 남음";
    copy.querySelector("#nowNext").innerHTML =
      '<span>다음 <b>5교시 2-1</b></span><span class="num">13:30 시작, 2시간 10분 후</span>';
    copy.querySelector("#nowAside").textContent = "오늘 수업 7시간";
    widgets["now:긴글"] = copy.innerHTML;
  }
  for (const p of ["today", "student", "consult", "lesson", "work"]) {
    [...d.querySelectorAll("#bookSeg button")].find(x => x.dataset.page === p).click();
    await wait(80);
    widgets["book:" + p] = d.querySelector('.wg[data-w="book"]').innerHTML;
  }
  return widgets;
}

/* ══════════ 2단계: 헤드리스 크롬으로 재기 ══════════ */
function fitCodeFromDesk() {
  const src = fs.readFileSync(path.join(DIR, "desk.js"), "utf8");
  const grab = (head) => {
    const i = src.indexOf(head);
    if (i < 0) throw new Error("desk.js 에서 못 찾음: " + head);
    let depth = 0, started = false;
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (c === "{") { depth++; started = true; }
      else if (c === "}") { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
    }
    throw new Error("끝을 못 찾음: " + head);
  };
  const pick = (re) => { const m = re.exec(src); if (!m) throw new Error("desk.js 에서 못 찾음: " + re); return m[0]; };
  return [
    pick(/const FIT_MIN = [^\n]+/), pick(/const FIT_TRIES = [^\n]+/),
    "const arranging = false;",          // 배치 중이 아닐 때를 잰다
    "const isStacked = () => false;",    // PC 칸 배치를 잰다
    grab("function clipOverflow("), grab("function fitCard("),
  ].join("\n");
}

function buildPage(widgets) {
  const cssHref = "file:///" + path.join(DIR, "desk.css").replace(/\\/g, "/");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="${cssHref}">
<style>html,body{margin:0}#out{position:fixed;inset:0;background:#fff;color:#000;font:12px monospace;white-space:pre;overflow:auto;z-index:9}</style>
</head><body>
<div id="app"><div class="deck" id="deck"></div></div><pre id="out"></pre>
<script id="DATA" type="application/json">${JSON.stringify(widgets).replace(/<\//g, "<\\/")}</script>
<script>
${fitCodeFromDesk()}
const DATA = JSON.parse(document.getElementById("DATA").textContent);
const SIZES = ${JSON.stringify(SIZES)};
const deck = document.getElementById("deck");
document.documentElement.style.setProperty("--k",
  Math.max(0.75, Math.min(2.5, Math.min(innerWidth/1920, innerHeight/1080) || 1)).toFixed(3));

/* 넘침을 자르는 조상까지 따라가 "눈에 실제로 보이는" 네모만 남긴다.
   이걸 안 하면 말줄임표로 잘린 글과 .sr(화면낭독기용 숨은 글)이 겹침으로 잡힌다. */
function seen(el, q) {
  let l = q.left, t = q.top, r = q.right, b = q.bottom;
  for (let x = el; x && x !== document.documentElement; x = x.parentElement) {
    const cs = getComputedStyle(x);
    const cx = cs.overflowX !== "visible", cy = cs.overflowY !== "visible";
    const cl = cs.clip && cs.clip !== "auto";
    if (!cx && !cy && !cl) continue;
    const p = x.getBoundingClientRect();
    if (cx || cl) { l = Math.max(l, p.left); r = Math.min(r, p.right); }
    if (cy || cl) { t = Math.max(t, p.top); b = Math.min(b, p.bottom); }
    if (r - l <= 0.5 || b - t <= 0.5) return null;
  }
  return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
}
function clipperY(el) {
  for (let x = el; x && x !== document.documentElement; x = x.parentElement) {
    const cs = getComputedStyle(x);
    if (cs.overflowY !== "visible" || (cs.clip && cs.clip !== "auto")) return x;
  }
  return null;
}
/* 글자 네모(getClientRects)는 글꼴이 위아래로 쓰는 여유까지 품고 있어서,
   줄 간격을 좁게 준 큰 글씨는 실제로 안 닿는데도 겹친 것처럼 잡힌다.
   그래서 네모를 "줄 높이(line-height)"만큼으로 가운데만 남긴다. 이게 눈에 보이는 띠다.
   zf 는 칸에 걸린 zoom 배율이다. getBoundingClientRect 는 배율이 먹은 화면 픽셀로,
   getComputedStyle 은 배율이 먹기 전 픽셀로 답해서 그냥 비교하면 어긋난다. */
function band(q, cs, zf) {
  const lh = parseFloat(cs.lineHeight) * zf;
  if (!Number.isFinite(lh) || q.height <= lh + 0.5) return q;
  const pad = (q.height - lh) / 2;
  return { left: q.left, right: q.right, width: q.width, top: q.top + pad, bottom: q.bottom - pad, height: lh };
}

function boxes(root) {
  const zf = parseFloat(getComputedStyle(root).zoom) || 1;
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.nodeValue.replace(/\\s+/g, " ").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || el.closest("[hidden]")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || +cs.opacity === 0) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const q0 of rg.getClientRects()) {
      if (q0.width < 1.5 || q0.height < 1.5) continue;
      const q = band(q0, cs, zf);
      const v = seen(el, q);
      if (!v || v.width < 1.5 || v.height < 1.5) continue;
      out.push({ el, r: v, raw: q, t: t.slice(0, 20) });
    }
  }
  for (const el of root.querySelectorAll("input, textarea")) {
    if (el.closest("[hidden]") || el.type === "hidden") continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const q = el.getBoundingClientRect();
    if (q.width < 1.5 || q.height < 1.5) continue;
    const v = seen(el, q);
    if (!v || v.width < 1.5 || v.height < 1.5) continue;
    out.push({ el, r: v, raw: q, t: "[칸]" + String(el.value || el.placeholder || el.type).slice(0, 14) });
  }
  return out;
}
const kin = (a, b) => a.contains(b) || b.contains(a);
const sel = (el) => {
  const p = [];
  for (let x = el; x && x !== deck; x = x.parentElement) {
    let s = x.tagName.toLowerCase();
    if (x.id) s += "#" + x.id;
    else if (x.className && typeof x.className === "string") s += "." + x.className.trim().split(/\\s+/).slice(0, 2).join(".");
    p.unshift(s);
    if (p.length >= 3) break;
  }
  return p.join(">");
};

/* 담는 글이 정해져 있어 "굴리지 않고 한눈에" 보여야 하는 칸.
   desk.css 에서 이 칸들의 카드에 overflow: hidden 을 걸어 fitCards() 가 줄이게 해 둔다. */
const MUST_FIT = ["clock", "now", "periods", "todos"];
const bad = [];
function one(name, html, w, h) {
  deck.style.setProperty("--cols", 24); deck.style.setProperty("--rows", 16);
  const wg = document.createElement("section");
  wg.className = "wg"; wg.dataset.w = name.split(":")[0];
  wg.style.gridArea = "1 / 1 / span " + h + " / span " + w;
  wg.innerHTML = html;
  deck.replaceChildren(wg);
  void wg.offsetHeight;
  fitCard(wg, true);                       // 실제 앱이 하는 것과 같이 줄여 놓고 잰다

  const card = wg.querySelector(".card") || wg;
  const cr = card.getBoundingClientRect();
  const bs = boxes(wg);
  const where = name + " " + w + "x" + h + (wg.style.getPropertyValue("--z") ? " (줄임 " + wg.style.getPropertyValue("--z") + ")" : "");

  /* ① 글자끼리 포개짐. 글꼴이 아래로 뻗는 여유(디센더)까지 안고 있어서 몇 px 는 늘 스친다.
        작은 쪽 넓이의 1/4 넘게 겹칠 때만 "겹침"으로 본다. */
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    if (kin(a.el, b.el)) continue;
    const ow = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const oh = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ow <= 1 || oh <= 1) continue;
    const small = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
    const pct = Math.round(ow * oh / small * 100);
    if (pct < 25) continue;
    bad.push("겹침   " + where + "  " + sel(a.el) + " «" + a.t + "» ∩ " + sel(b.el) + " «" + b.t + "»  " +
             Math.round(ow) + "x" + Math.round(oh) + "px, " + pct + "%");
  }
  /* ② 세로로 영구히 잘린 글자(스크롤로도 못 본다) */
  for (const x of bs) {
    const a = clipperY(x.el);
    if (!a) continue;
    const acs = getComputedStyle(a);
    if ((acs.overflowY === "auto" || acs.overflowY === "scroll") && a.scrollHeight - a.clientHeight > 1) continue;
    const p = a.getBoundingClientRect();
    const lost = Math.max(0, p.top - x.raw.top) + Math.max(0, x.raw.bottom - p.bottom);
    if (lost < 2) continue;
    bad.push("세로잘림 " + where + "  " + sel(x.el) + " «" + x.t + "» " + Math.round(lost) + "px 깎임");
  }
  /* ③ 위로 넘쳐 스크롤로도 못 올라가는 글자 */
  for (const x of bs) {
    if (x.raw.top >= cr.top - 2 || card.scrollTop !== 0) continue;
    bad.push("위로넘침 " + where + "  " + sel(x.el) + " «" + x.t + "» " + Math.round(cr.top - x.raw.top) + "px 위로");
  }
  /* ④ 한눈에 다 보여야 하는 칸이 굴려야 보이는 상태.
     스크롤 막대를 숨겨 두어서 선생님 눈에는 그냥 "글자가 잘린 것"으로 보인다.
     (실제로 2026-11-12에 "지금 수업"이 이것으로 잘려 보였다.) */
  if (MUST_FIT.includes(name.split(":")[0])) {
    const over = card.scrollHeight - card.clientHeight;
    if (over > 1) bad.push("칸넘침  " + where + "  굴려야 보이는 높이 " + Math.round(over) + "px");
  }
}

for (const [name, html] of Object.entries(DATA)) for (const [w, h] of SIZES) one(name, html, w, h);
deck.replaceChildren();
document.getElementById("out").textContent =
  "화면 " + innerWidth + "x" + innerHeight + "\\n" + (bad.length ? bad.join("\\n") : "모두 괜찮음");
</script></body></html>`;
}

function findChrome() {
  for (const p of CHROMES) { try { if (p && fs.existsSync(p)) return p; } catch (e) {} }
  return "";
}

(async () => {
  const chrome = findChrome();
  if (!chrome) {
    console.log("크롬을 못 찾아 건너뜁니다. (이 점검은 크롬이 있는 컴퓨터에서 돌리면 됩니다)");
    process.exit(0);
  }
  const widgets = await dumpWidgets();
  console.log("칸 " + Object.keys(widgets).length + "개 × 크기 " + SIZES.length + "가지 × 화면 " + SCREENS.length + "가지를 잽니다…");
  fs.writeFileSync(TMP, buildPage(widgets), "utf8");
  const url = "file:///" + TMP.replace(/\\/g, "/");
  let bad = 0;
  for (const s of SCREENS) {
    const dom = execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
      "--window-size=" + s, "--virtual-time-budget=8000", "--dump-dom", url],
      { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
    const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom);
    const txt = (m ? m[1] : "결과 없음")
      .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    const lines = txt.split("\n");
    console.log("\n── " + s + " ──\n" + txt);
    bad += lines.filter(l => /^(겹침|세로잘림|위로넘침)/.test(l)).length;
  }
  try { fs.unlinkSync(TMP); } catch (e) {}
  if (bad) { console.error("\n글자가 겹치거나 잘리는 곳 " + bad + "군데."); process.exit(1); }
  console.log("\n전부 괜찮음. 어느 크기에서도 글자가 겹치거나 잘리지 않습니다.");
  process.exit(0);
})().catch(e => { console.error("실패:", e.message); process.exit(1); });
