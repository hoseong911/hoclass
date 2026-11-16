// 나이스 주간 시간표 받아오기 시험 (cd desk && npm test)
const fs = require("fs"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "neis.js"), "utf8").replace(/^export /gm, "");

/* 가짜 나이스. calls 에 부른 주소를 다 적어 둔다. */
function fake(rowsOf) {
  const calls = [];
  const fetch = async (u) => {
    const q = new URL(u).searchParams;
    calls.push(q);
    const rows = rowsOf(q);
    return {
      ok: true,
      json: async () => ({ misTimetable: [
        { head: [{ list_total_count: rows.length }, { RESULT: { CODE: "INFO-000" } }] },
        { row: rows },
      ] }),
    };
  };
  const M = new Function("fetch", src + "; return { loadMyWeek };")(fetch);
  return { M, calls };
}
const row = (ymd, grade, room, perio, subject) =>
  ({ ALL_TI_YMD: ymd, GRADE: String(grade), CLASS_NM: String(room), PERIO: String(perio), ITRT_CNTNT: subject });

const school = { atpt: "E10", code: "7331219", kind: "중학교" };
const subjects = [{ name: "역사", classes: ["3-1", "3-2"] }, { name: "사회", classes: ["3-2"] }];
// 월요일 2026-11-09 ~ 금요일 2026-11-13
const WEEK = [
  row("20261109", 3, 1, 1, "역사"),        // 내 것
  row("20261109", 3, 1, 2, "수학"),        // 내 과목이 아니다
  row("20261109", 3, 9, 3, "역사"),        // 내가 안 가르치는 반
  row("20261113", 3, 2, 4, "사회"),        // 내 것(금요일)
  row("20261113", 3, 2, 8, "역사"),        // 8교시는 칸이 없다
  row("20261116", 3, 1, 1, "역사"),        // 다음 주 월요일 — 이 주에 섞여 들어오면 안 된다
];

async function main() {
// 인증키가 있으면 한 주를 한 번에 받는다
{
  const { M, calls } = fake(() => WEEK);
  const tt = await M.loadMyWeek(school, 2026, 2, "20261109", subjects, "KEY32");
  assert.strictEqual(calls.length, 1, "인증키가 있으면 호출은 한 번이어야 한다 (전에는 5일 × 반 개수)");
  const q = calls[0];
  assert.strictEqual(q.get("TI_FROM_YMD"), "20261109");
  assert.strictEqual(q.get("TI_TO_YMD"), "20261113");
  assert.strictEqual(q.get("GRADE"), null, "학교 전체를 받으므로 학년, 반을 묻지 않는다");
  assert.strictEqual(q.get("CLASS_NM"), null);
  assert.strictEqual(q.get("KEY"), "KEY32");
  assert.strictEqual(tt[0][0], "3-1"); assert.strictEqual(tt.subj[0][0], "역사");
  assert.strictEqual(tt[4][3], "3-2"); assert.strictEqual(tt.subj[4][3], "사회");
  assert.strictEqual(tt[0][1], "", "내 과목이 아닌 칸은 비어 있어야 한다");
  assert.strictEqual(tt[0][2], "", "내가 안 가르치는 반은 들어오지 않아야 한다");
  const filled = tt.flat().filter(Boolean).length;
  assert.strictEqual(filled, 2, "채워진 칸은 둘뿐이어야 한다(8교시와 다음 주는 빠진다). 지금: " + filled);
}

// 인증키가 없으면 다섯 줄 제한 때문에 전처럼 하루 × 반으로 쪼개 묻는다
{
  const { M, calls } = fake((q) => WEEK.filter(r =>
    r.ALL_TI_YMD === q.get("ALL_TI_YMD") && r.GRADE === q.get("GRADE") && r.CLASS_NM === q.get("CLASS_NM")));
  const tt = await M.loadMyWeek(school, 2026, 2, "20261109", subjects, "");
  assert.strictEqual(calls.length, 10, "닷새 × 반 둘 = 열 번 (같은 날 같은 반은 두 번 묻지 않는다). 지금: " + calls.length);
  assert.strictEqual(calls[0].get("ALL_TI_YMD"), "20261109");
  assert.strictEqual(tt[0][0], "3-1"); assert.strictEqual(tt.subj[0][0], "역사");
  assert.strictEqual(tt[4][3], "3-2"); assert.strictEqual(tt.subj[4][3], "사회");
  assert.strictEqual(tt.flat().filter(Boolean).length, 2);
}

// 과목을 안 넣으면 아무것도 받지 않는다(빈 과목은 거르기가 꺼져 첫 반이 모든 칸을 먹는다, 일흔하나째)
{
  const { M, calls } = fake(() => WEEK);
  const tt = await M.loadMyWeek(school, 2026, 2, "20261109", [], "KEY32");
  assert.strictEqual(tt.flat().filter(Boolean).length, 0);
  assert.strictEqual(calls.length, 1, "과목이 없어도 받아는 오지만(호출 한 번) 채우지 않는다");
}

}
main().then(() => console.log("나이스 주간 시간표 시험 통과"), (e) => { console.error(e); process.exit(1); });
