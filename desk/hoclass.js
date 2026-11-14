// 호클래스에 쓰는 곳은 맨 아래 둘뿐이다.

export const roomOf = (c) => String(c.grade) + String(c.classNo).padStart(2, "0");
export const roomToCls = (room) => String(room).slice(0, 1) + "-" + String(Number(String(room).slice(1)));
export function clsToRoom(cls) {
  const m = /^(\d+)-(\d+)$/.exec(String(cls || ""));
  return m ? m[1] + String(m[2]).padStart(2, "0") : "";
}
export const noOf = (studentNo) => Number(String(studentNo).slice(-2));
export const studentNoOf = (cls, no) => clsToRoom(cls) + String(no).padStart(2, "0");

/* year 가 글자인지 숫자인지 섞여 있어 String 으로 맞춰 본다. */
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

/* 학년도 학생 명부(hoclass_course_roster). 강의실이 없는 반(담임 반 등)도 여기 있다. { "3-9": [{ n, name }] } */
export async function loadRegister(FB, year) {
  const ss = await FB.getDocs(FB.collection(FB.db, "hoclass_course_roster"));
  const byCls = {};
  ss.forEach(d => {
    const s = d.data() || {};
    const no = String(s.studentNo || "");
    if (String(s.year) !== String(year) || !/^\d{5}$/.test(no)) return;
    const list = (byCls[roomToCls(no.slice(0, 3))] = byCls[roomToCls(no.slice(0, 3))] || []);
    if (!list.some(x => x.n === noOf(no))) list.push({ n: noOf(no), name: String(s.name || "").trim() });
  });
  for (const k of Object.keys(byCls)) byCls[k].sort((a, b) => a.n - b.n);
  return byCls;
}

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

/* ---------- 차시 ---------- */
export async function loadLessons(FB, hc) {
  const byCls = {};
  if (!hc || !hc.courses.length) return byCls;
  const [cls, lessons] = await Promise.all([
    FB.getDocs(FB.collection(FB.db, "hoclass_course_lessons")),
    FB.getDocs(FB.collection(FB.db, "hoclass_lessons")),
  ]);
  const title = {};
  lessons.forEach(d => { const l = d.data() || {}; title[d.id] = String(l.title || ""); });
  const idToCls = {};
  for (const c of hc.courses) idToCls[c.id] = c.cls;
  cls.forEach(d => {
    const cl = d.data() || {};
    const cls2 = idToCls[cl.courseId];
    if (!cls2) return;
    (byCls[cls2] = byCls[cls2] || []).push({
      clId: d.id, courseId: cl.courseId, lessonId: cl.lessonId || "",
      order: Number(cl.order) || 0, date: String(cl.date || ""),
      isOpen: cl.isOpen !== false, title: title[cl.lessonId] || "",
    });
  });
  for (const k of Object.keys(byCls)) byCls[k].sort((a, b) => a.order - b.order);
  return byCls;
}

/* ---------- 제출 현황 ---------- */
export async function loadSubmissions(FB, clId) {
  const out = {};
  if (!clId) return out;
  const ss = await FB.getDocs(FB.collection(FB.db, "hoclass_course_submissions"));
  ss.forEach(d => {
    const r = d.data() || {};
    if (r.clId !== clId || !r.studentNo) return;
    const no = String(r.studentNo);
    (out[no] = out[no] || {})[String(r.part || "")] = true;
  });
  return out;
}

/* ---------- 호클래스에 쓰는 곳 ---------- */
// model.js 의 GRADE_AREAS 와 같아야 한다.
export const GRADE_AREAS = ["concept", "mission", "question"];
const emptyBlock = () => ({ achievedN: 0, onTimeN: 0 });

/* 결석을 켜면 그 차시 성적 영역이 미달성으로 잠긴다. model.js toggleGradeAbsent 와 같게 처리한다. */
export async function setAbsent(FB, { clId, courseId, lessonId }, studentNos, on = true) {
  const done = [];
  for (const no of studentNos) {
    const id = clId + "_" + no;
    const ref = FB.doc(FB.db, "hoclass_course_grades", id);
    const cur = await FB.getDoc(ref);
    const g = cur.exists() ? { ...cur.data() } : { id, clId, courseId, lessonId, studentNo: String(no), feedback: "" };
    g.id = id; g.clId = clId; g.studentNo = String(no);
    if (courseId) g.courseId = courseId;
    if (lessonId) g.lessonId = lessonId;
    g.manual = g.manual || {};
    g.absent = !!on;
    if (on) for (const a of GRADE_AREAS) { g[a] = emptyBlock(); g.manual[a] = true; }
    await FB.setDoc(ref, g);
    done.push(String(no));
  }
  return done;
}

export async function fillLessonDate(FB, clId, date) {
  const ref = FB.doc(FB.db, "hoclass_course_lessons", clId);
  const cur = await FB.getDoc(ref);
  if (!cur.exists()) throw new Error("그 차시를 찾지 못했습니다.");
  const cl = { ...cur.data() };
  if (String(cl.date || "")) return false;
  cl.date = date;
  await FB.setDoc(ref, cl);
  return true;
}
