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

// 담임 반(3-2): 하루 시간표는 tt.cls 에 다 담고, 창체는 임장하는 것만 내 시간표에 넣는다(2026-11-17)
{
  const HOME = [
    row("20261110", 3, 2, 1, "진로활동"),     // 담임이 들어간다 → 내 시간표에도
    row("20261110", 3, 2, 2, "동아리활동"),   // 내가 안 들어간다 → tt.cls 에만
    row("20261110", 3, 2, 3, "스포츠클럽"),   // 내가 안 들어간다
    row("20261110", 3, 2, 4, "창의적체험활동"), // 어느 것인지 몰라 넣지 않는다
    row("20261111", 3, 2, 5, "자율활동"),
    row("20261113", 3, 2, 4, "사회"),          // 내 수업(아래에서 내 것으로 남는지 본다)
  ];
  const { M } = fake(() => HOME);
  const tt = await M.loadMyWeek(school, 2026, 2, "20261109", subjects, "KEY32", "3-2");
  assert.strictEqual(tt[1][0], "진로활동", "담임 반 진로활동은 내 시간표에 들어온다");
  assert.strictEqual(tt.subj[1][0], "진로활동");
  assert.strictEqual(tt[2][4], "자율활동");
  assert.strictEqual(tt[1][1], "", "동아리활동은 넣지 않는다");
  assert.strictEqual(tt[1][2], "", "스포츠클럽은 넣지 않는다");
  assert.strictEqual(tt[1][3], "", "뭉뚱그린 창의적체험활동은 넣지 않는다");
  assert.strictEqual(tt[4][3], "3-2", "내 수업은 그대로 반 이름이다(창체가 덮지 않는다)");
  assert.strictEqual(tt.cls[1][1], "동아리활동", "우리 반 줄에는 다 담긴다(오늘 시간표 위젯이 쓴다)");
  assert.strictEqual(tt.cls[4][3], "사회");
  assert.strictEqual(tt.cls[0][0], "", "수업이 없는 칸은 빈다");
}

// 담임을 주지 않으면(비담임) 창체도 우리 반 줄도 없다
{
  const { M } = fake(() => [row("20261110", 3, 2, 1, "진로활동"), ...WEEK]);
  const tt = await M.loadMyWeek(school, 2026, 2, "20261109", subjects, "KEY32");
  assert.strictEqual(tt[1][0], "", "담임 반을 안 주면 창체는 들어오지 않는다");
  assert.strictEqual(tt.cls.flat().filter(Boolean).length, 0);
}

}
main().then(() => console.log("나이스 주간 시간표 시험 통과"), (e) => { console.error(e); process.exit(1); });
