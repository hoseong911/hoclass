// 호클래스에 쓰는 곳은 맨 아래 셋뿐이다.

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
  const parts = {};
  lessons.forEach(d => { const l = d.data() || {}; title[d.id] = String(l.title || ""); parts[d.id] = l.parts || {}; });
  const idToCls = {}, subjOf = {};
  for (const c of hc.courses) { idToCls[c.id] = c.cls; subjOf[c.id] = c.subject || ""; }
  cls.forEach(d => {
    const cl = d.data() || {};
    const cls2 = idToCls[cl.courseId];
    if (!cls2) return;
    (byCls[cls2] = byCls[cls2] || []).push({
      clId: d.id, courseId: cl.courseId, lessonId: cl.lessonId || "",
      order: Number(cl.order) || 0, date: String(cl.date || ""),
      isOpen: cl.isOpen !== false, title: title[cl.lessonId] || "", subject: subjOf[cl.courseId] || "",
      parts: parts[cl.lessonId] || {}, gradePublished: !!cl.gradePublished,
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

/* ---------- 성적(읽기만) ----------
   model.js studentGrade 와 같은 셈: 성적 설정의 반영 강의 중 그 반에 성적을 공개한 차시만, 영역마다 달성과 기한을 세어
   급간 표(hoclass_settings/grade)로 점수를 낸다. lessons 는 loadLessons 가 준 그 반(그 과목) 차시들. */
const DEFAULT_BANDS = [   // model.js DEFAULT_BANDS 와 같아야 한다
  { min: 90, concept: 30, mission: 40, question: 30 }, { min: 80, concept: 27, mission: 36, question: 27 },
  { min: 70, concept: 24, mission: 32, question: 24 }, { min: 60, concept: 21, mission: 28, question: 21 },
  { min: 50, concept: 18, mission: 24, question: 18 }, { min: 40, concept: 15, mission: 20, question: 15 },
  { min: 30, concept: 12, mission: 16, question: 12 }, { min: 20, concept: 9, mission: 12, question: 9 },
  { min: 10, concept: 6, mission: 8, question: 6 }, { min: 0, concept: 3, mission: 4, question: 3 },
];
export const AREA_NAMES = { concept: "개념 노트", mission: "미션 활동", question: "오늘의 질문" };
export async function loadGrade(FB, lessons, studentNo) {
  const conf = await FB.getDoc(FB.doc(FB.db, "hoclass_settings", "grade"));
  const c = (conf.exists() && conf.data()) || {};
  const bands = Array.isArray(c.bands) && c.bands.length ? c.bands : DEFAULT_BANDS;
  const picked = new Set(c.lessons || []);
  const use = lessons.filter(x => picked.has(x.lessonId) && x.gradePublished).sort((a, b) => a.order - b.order);
  const recs = await Promise.all(use.map(x => FB.getDoc(FB.doc(FB.db, "hoclass_course_grades", x.clId + "_" + studentNo))
    .then(s => (s.exists() && s.data()) || {})));
  const sum = {};
  for (const a of GRADE_AREAS) sum[a] = { achieved: 0, total: 0 };
  const rows = use.map((x, i) => {
    const rec = recs[i];
    for (const a of GRADE_AREAS) {
      if (!x.parts[a]) continue;
      const b = rec[a] || {};
      sum[a].achieved += Math.min(1, b.achievedN || 0) + Math.min(1, b.onTimeN || 0);
      sum[a].total += 2;
    }
    return { order: x.order, title: x.title, absent: !!rec.absent, feedback: String(rec.feedback || "") };
  });
  const areas = {};
  for (const a of GRADE_AREAS) {
    const { achieved, total } = sum[a];
    const pct = total ? Math.round(achieved / total * 100) : 0;
    const band = total ? (bands.find(b => pct >= b.min) || bands[bands.length - 1]) : null;
    areas[a] = { achieved, total, pct, score: band ? (+band[a] || 0) : 0 };
  }
  const maxScore = GRADE_AREAS.reduce((n, a) => n + (+(bands[0] || {})[a] || 0), 0);
  const total = GRADE_AREAS.reduce((n, a) => n + areas[a].score, 0);
  return { areas, total, maxScore, rows, has: use.length > 0 };
}

/* ---------- 세부 특기사항과 메모(선생님 지시 2026-11-15, 어드민 학생 관리와 같이 쓴다) ----------
   hoclass_student_notes, 문서 id = 학년도_과목_학번. 교사만 읽고 쓴다(규칙에서 막음). */
export const noteId = (year, subject, studentNo) => `${year}_${subject}_${studentNo}`;
export async function loadNote(FB, year, subject, studentNo) {
  const s = await FB.getDoc(FB.doc(FB.db, "hoclass_student_notes", noteId(year, subject, studentNo)));
  const v = (s.exists() && s.data()) || {};
  return { seteuk: String(v.seteuk || ""), memo: String(v.memo || ""), at: Number(v.updatedAt) || 0 };
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

export async function saveNote(FB, year, subject, studentNo, { seteuk, memo }) {
  const id = noteId(year, subject, studentNo);
  await FB.setDoc(FB.doc(FB.db, "hoclass_student_notes", id), {
    id, year: String(year), subject: String(subject), studentNo: String(studentNo),
    seteuk: String(seteuk || "").slice(0, 3000), memo: String(memo || "").slice(0, 3000), updatedAt: Date.now(),
  });
}
