// 호클래스에서 읽어 오는 것만 모은다 (2026-11-11).
// 여기서는 호클래스에 쓰지 않는다. 쓰는 곳은 출결 보내기 하나뿐이고 그건 따로 만든다.
//
// 반 이름 짝
//   호클래스 강의실: grade "3" + classNo "1"  →  방 번호 "301"
//   학번: 방 번호 + 두 자리 번호              →  "30101" (3학년 1반 1번)
//   수첩: "3-1"

export const roomOf = (c) => String(c.grade) + String(c.classNo).padStart(2, "0");
export const roomToCls = (room) => String(room).slice(0, 1) + "-" + String(Number(String(room).slice(1)));
export function clsToRoom(cls) {
  const m = /^(\d+)-(\d+)$/.exec(String(cls || ""));
  return m ? m[1] + String(m[2]).padStart(2, "0") : "";
}
// 학번에서 번호만 꺼낸다. "30101" → 1
export const noOf = (studentNo) => Number(String(studentNo).slice(-2));
// 반과 번호로 학번을 만든다. ("3-1", 7) → "30107"
export const studentNoOf = (cls, no) => clsToRoom(cls) + String(no).padStart(2, "0");

/* 한 학년도의 강의실과 명단을 읽는다.
   강의실과 명단 문서가 다 합쳐 160장 남짓이라 통째로 받아 걸러 쓴다.
   (year가 글자인지 숫자인지 섞여 있어도 되게 String으로 맞춰 본다) */
export async function loadHoclass(FB, year) {
  const [cs, ss] = await Promise.all([
    FB.getDocs(FB.collection(FB.db, "hoclass_courses")),
    FB.getDocs(FB.collection(FB.db, "hoclass_course_students")),
  ]);
  const courses = [];
  cs.forEach(d => {
    const c = d.data() || {};
    if (String(c.year) !== String(year)) return;
    if (c.status && c.status !== "active") return;
    courses.push({ id: d.id, subject: c.subject || "", schedule: c.schedule || "", room: roomOf(c), cls: roomToCls(roomOf(c)) });
  });
  const idToCls = {};
  for (const c of courses) idToCls[c.id] = c.cls;

  const byCls = {};
  ss.forEach(d => {
    const s = d.data() || {};
    const cls = idToCls[s.courseId];
    if (!cls || !s.studentNo) return;
    const id = String(s.studentNo);
    const list = (byCls[cls] = byCls[cls] || []);
    if (list.some(x => x.id === id)) return;
    list.push({ id, n: noOf(id), name: String(s.name || "").trim() });
  });
  for (const k of Object.keys(byCls)) byCls[k].sort((a, b) => a.n - b.n);

  const classes = courses.map(c => c.cls)
    .filter((c, i, a) => a.indexOf(c) === i)
    .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  return { year: String(year), courses, byCls, classes, at: Date.now() };
}

/* 지난번에 본 이름과 달라진 학번을 찾는다.
   호클래스는 기록을 학번(반+번호)에 붙이므로, 학기 중 전입으로 번호가 밀리면
   어제 적은 출결이 다른 학생에게 붙는다. 조용히 엉키지 않게 여기서 알려만 준다. */
export function nameChanges(hc, seen) {
  const out = [];
  if (!hc || !seen) return out;
  for (const cls of hc.classes) {
    const was = seen[cls] || {};
    for (const s of hc.byCls[cls] || []) {
      const old = was[s.id];
      if (old && s.name && old !== s.name) out.push({ cls, no: s.id, was: old, now: s.name });
    }
  }
  return out;
}
// 지금 본 이름을 기준으로 적어 둔다.
export function snapshotNames(hc) {
  const out = {};
  if (!hc) return out;
  for (const cls of hc.classes) {
    const m = {};
    for (const s of hc.byCls[cls] || []) if (s.name) m[s.id] = s.name;
    out[cls] = m;
  }
  return out;
}
