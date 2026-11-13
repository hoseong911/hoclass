/* 나이스 교육정보 열린데이터(open.neis.go.kr) 에서 읽어 온다. 읽기만 한다.
   열쇠(인증키) 없이도 되지만 하루 쓸 수 있는 횟수가 적다. 설정에 넣으면 그것을 쓴다. */
const BASE = "https://open.neis.go.kr/hub/";

/* 학교 종류에 따라 시간표 주소가 다르다 */
const TT_PATH = { 초등학교: "elsTimetable", 중학교: "misTimetable", 고등학교: "hisTimetable" };

function url(path, params, key, pIndex) {
  const u = new URL(BASE + path);
  u.searchParams.set("Type", "json");
  u.searchParams.set("pIndex", String(pIndex || 1));
  u.searchParams.set("pSize", String(params.pSize || 100));
  if (key) u.searchParams.set("KEY", key);
  for (const [k, v] of Object.entries(params)) {
    if (k !== "pSize" && v != null && v !== "") u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/* 나이스는 결과가 없을 때도 200 으로 답하고 몸속에 까닭을 적어 보낸다. */
async function page(path, params, key, pIndex) {
  const r = await fetch(url(path, params, key, pIndex), { cache: "no-store" });
  if (!r.ok) throw new Error("나이스에 닿지 못했습니다 (" + r.status + ")");
  const j = await r.json().catch(() => null);
  if (!j) throw new Error("나이스가 보낸 것을 읽지 못했습니다.");
  if (j.RESULT) {
    const code = j.RESULT.CODE || "";
    if (code === "INFO-200") return { rows: [], total: 0 };    // 해당하는 자료가 없다
    throw new Error(neisMsg(code, j.RESULT.MESSAGE));
  }
  const body = j[path];
  if (!Array.isArray(body)) return { rows: [], total: 0 };
  const head = body.find(x => x && x.head);
  const res = head && head.head.find(x => x && x.RESULT);
  if (res && res.RESULT.CODE && res.RESULT.CODE !== "INFO-000") {
    if (res.RESULT.CODE === "INFO-200") return { rows: [], total: 0 };
    throw new Error(neisMsg(res.RESULT.CODE, res.RESULT.MESSAGE));
  }
  const cnt = head && head.head.find(x => x && x.list_total_count);
  const rows = body.find(x => x && x.row);
  return { rows: rows ? rows.row : [], total: cnt ? Number(cnt.list_total_count) : 0 };
}

/* 인증키가 없으면 나이스가 **다섯 줄만** 준다(전체 수는 알려 준다).
   그래서 잘렸는지 보고, 잘렸으면 부르는 쪽이 알 수 있게 알린다. */
async function call(path, params, key) {
  const first = await page(path, params, key, 1);
  let rows = first.rows;
  if (key) {
    for (let i = 2; rows.length < first.total && i <= 20; i++) {
      const next = await page(path, params, key, i);
      if (!next.rows.length) break;
      rows = rows.concat(next.rows);
    }
  }
  return { rows, total: first.total, short: first.total > rows.length };
}

function neisMsg(code, msg) {
  if (code === "INFO-300" || code === "ERROR-290") return "나이스 인증키가 맞지 않습니다. 설정에서 다시 넣어 주세요.";
  if (code === "ERROR-337") return "오늘 나이스에서 받을 수 있는 횟수를 다 썼습니다. 인증키를 넣으면 늘어납니다.";
  if (code === "ERROR-290") return "나이스 인증키가 등록되지 않았습니다.";
  return "나이스가 거절했습니다. " + (msg || code || "");
}

/* ---------- 학교 찾기 ---------- */
export async function findSchools(name, key) {
  const { rows } = await call("schoolInfo", { SCHUL_NM: name, pSize: 20 }, key);
  return rows.map(r => ({
    name: r.SCHUL_NM,
    atpt: r.ATPT_OFCDC_SC_CODE,
    code: r.SD_SCHUL_CODE,
    kind: r.SCHUL_KND_SC_NM || "",
    office: r.ATPT_OFCDC_SC_NM || "",
    address: r.ORG_RDNMA || "",
  }));
}

/* ---------- 학사 일정 ---------- */
/* 돌려주는 모양은 수첩의 state.cal 과 같다: { d: "YYYY-MM-DD", name } */
export const KEY_HINT = "나이스 인증키가 없어 다섯 줄만 받았습니다. 설정에 인증키를 넣으면 다 받아옵니다.";
export async function loadSchedule(school, year, key) {
  const from = year + "0301", to = (Number(year) + 1) + "0228";
  const { rows, short } = await call("SchoolSchedule", {
    ATPT_OFCDC_SC_CODE: school.atpt, SD_SCHUL_CODE: school.code,
    AA_FROM_YMD: from, AA_TO_YMD: to, pSize: 1000,
  }, key);
  const out = [];
  for (const r of rows) {
    const ymd = String(r.AA_YMD || "");
    const name = String(r.EVENT_NM || "").trim();
    if (ymd.length !== 8 || !name) continue;
    if (/토요휴업일/.test(name)) continue;   // 토요휴업일은 너무 많다
    const d = ymd.slice(0, 4) + "-" + ymd.slice(4, 6) + "-" + ymd.slice(6, 8);
    if (!out.some(x => x.d === d && x.name === name)) out.push({ d, name });
  }
  out.sort((a, b) => a.d.localeCompare(b.d));
  out.short = short;
  return out;
}

/* ---------- 급식 ---------- */
export async function loadMeal(school, ymd, key) {
  const { rows } = await call("mealServiceDietInfo", {
    ATPT_OFCDC_SC_CODE: school.atpt, SD_SCHUL_CODE: school.code, MLSV_YMD: ymd, pSize: 10,
  }, key);
  return rows.map(r => ({
    kind: String(r.MMEAL_SC_NM || "").trim(),
    dishes: String(r.DDISH_NM || "").split("<br/>").map(cleanDish).filter(Boolean),
    kcal: String(r.CAL_INFO || "").trim(),
  }));
}
/* "흑미밥* <5.6.>" 처럼 알레르기 번호와 별표가 붙어 온다 */
function cleanDish(s) {
  return String(s).replace(/<[^>]*>/g, "").replace(/\([^)]*\)/g, "")
    .replace(/[0-9.]+\.?$/, "").replace(/[*]/g, "").replace(/\s+/g, " ").trim();
}

/* ---------- 시간표 ---------- */
/* 반 하나의 하루 시간표. [{ period, subject }] */
export async function loadClassDay(school, ay, sem, ymd, grade, room, key) {
  const path = TT_PATH[school.kind] || "misTimetable";
  const { rows, short } = await call(path, {
    ATPT_OFCDC_SC_CODE: school.atpt, SD_SCHUL_CODE: school.code,
    AY: String(ay), SEM: String(sem), ALL_TI_YMD: ymd,
    GRADE: String(grade), CLASS_NM: String(room), pSize: 30,
  }, key);
  const out = rows.map(r => ({ period: Number(r.PERIO), subject: String(r.ITRT_CNTNT || "").trim() }))
    .filter(x => x.period >= 1 && x.period <= 7 && x.subject);
  out.short = short;
  return out;
}

/* 학년별 반 수 { "1": 5, "2": 6, "3": 6 }. 인증키가 없으면 다섯 줄만 오므로
   학년마다 한 줄만 묻고 전체 수(list_total_count)를 읽는다.
   shortcut: 특수학급도 반 하나로 센다. 그런 학교에서 쓰게 되면 CLASS_NM 을 보고 거른다. */
export async function loadRoomCounts(school, ay, key) {
  const out = {};
  const grades = school.kind === "초등학교" ? 6 : 3;
  for (let g = 1; g <= grades; g++) {
    const { total } = await page("classInfo", {
      ATPT_OFCDC_SC_CODE: school.atpt, SD_SCHUL_CODE: school.code, AY: String(ay), GRADE: String(g), pSize: 1,
    }, key, 1);
    if (total > 0) out[g] = total;
  }
  return out;
}

/* 과목마다 가르치는 반이 다르다(역사는 1~6반, 사회는 3~6반 같은 식). 그래서 과목 줄을 받는다.
   subjects = [{ name: "역사", classes: ["3-1", "3-2"] }, ...]
   같은 과목을 다른 선생님도 가르치면 그 칸까지 들어오므로 뒤에 손으로 고친다.
   homeroom 을 주면 담임 반의 창체 시간(진로활동, 동아리활동 같은 것)을 빈칸에 그 이름으로 넣는다.
   진로테마학습 같은 날은 하루가 다 창체라 내 과목으로는 한 칸도 안 잡힌다. */
export const CC_RE = /진로|자율|자치|동아리|봉사/;
export async function loadMyWeek(school, ay, sem, mondayYmd, subjects, key, homeroom) {
  const tt = Array.from({ length: 5 }, () => Array.from({ length: 7 }, () => ""));
  const got = new Map();   // 같은 날 같은 반을 두 번 받지 않는다(과목 줄끼리, 담임 반과 반이 겹친다)
  const classDay = async (ymd, cls) => {
    const m = /^(\d+)-(\d+)$/.exec(cls || "");
    if (!m) return [];
    const k = ymd + " " + cls;
    if (!got.has(k)) got.set(k, await loadClassDay(school, ay, sem, ymd, m[1], m[2], key));
    const rows = got.get(k);
    if (rows.short) tt.short = true;
    return rows;
  };
  for (let day = 0; day < 5; day++) {
    const ymd = addDays(mondayYmd, day);
    for (const s of subjects || []) {
      const want = String(s.name || "").trim();
      if (!want) continue;
      for (const cls of s.classes || []) {
        for (const x of await classDay(ymd, cls)) {
          if (!x.subject.includes(want)) continue;
          if (!tt[day][x.period - 1]) tt[day][x.period - 1] = cls;
        }
      }
    }
    // 내 수업이 먼저다. 창체는 빈칸에만 넣는다.
    for (const x of await classDay(ymd, homeroom)) {
      if (CC_RE.test(x.subject) && !tt[day][x.period - 1]) tt[day][x.period - 1] = x.subject;
    }
  }
  return tt;
}

export function addDays(ymd, n) {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(4, 6)), d = Number(ymd.slice(6, 8));
  const t = new Date(y, m - 1, d + n);
  return String(t.getFullYear()) + String(t.getMonth() + 1).padStart(2, "0") + String(t.getDate()).padStart(2, "0");
}
/* 그 주의 월요일 */
export function mondayOf(date) {
  const t = new Date(date);
  const w = t.getDay();
  t.setDate(t.getDate() - (w === 0 ? 6 : w - 1));
  return String(t.getFullYear()) + String(t.getMonth() + 1).padStart(2, "0") + String(t.getDate()).padStart(2, "0");
}
/* 3월부터 8월까지 1학기, 9월부터 2월까지 2학기 */
export const semesterOf = (date) => (date.getMonth() + 1 >= 3 && date.getMonth() + 1 <= 8 ? 1 : 2);
