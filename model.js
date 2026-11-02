// model.js: LMS2027 뼈대 (2026-10-26 제로베이스 재설계)
// ───────────────────────────────────────────────────────────────────────────
// 데이터 모델의 단일 출처. 컬렉션 이름, 칸/메뉴 표, (지금은) 데모 데이터와 조회를 한곳에 둔다.
// 학생 화면(index.js)과 어드민(admin.js)이 이 파일 하나만 읽어 같은 표를 쓴다.
//
// 조직 원리:
//   강의실(course)은 "강의(차시)"와 "복습"을 담고,
//   강의 하나는 개념 노트, 미션 활동, 오늘의 질문, 형성평가 네 칸을 각각 있거나 없거나로 채운다.
//   각 종류 최대 1개, 순서 자유. 사료, 사진, 영상은 개념 노트 안의 내용.
//
// ※ 지금은 Firestore 대신 아래 DEMO(메모리)로 돈다. 화면 뼈대를 먼저 보기 위함.
//   컬렉션 이름과 문서 모양은 실제와 같게 맞춰 두었으므로, 다음 단계에서 이 파일의
//   조회 함수만 Firestore 호출로 바꾸면 화면은 그대로 둔다.
// ───────────────────────────────────────────────────────────────────────────

import { db, collection, getDocs, doc, getDoc, setDoc, deleteDoc } from './shared/fb.js?v=20261028a';
import { CLAUDE_PROXY_URL } from './shared/util.js?v=20261028f';
// 슬라이드 축과 덱 모양은 shared/slide-axis.js 한 곳에서. 아래에서 그대로 다시 내보낸다
import { normalizeDeck, toPages, fromPages, blankDeck, AXIS_ORDER, pagesFilled } from './shared/slide-axis.js?v=20261101f';

/* 컬렉션 설계: 제로베이스 재합의 (2026-10-27, 선생님 Q&A)
 * 규칙:
 *   - 이름에 연도/버전을 박지 않는다. 학년도는 문서의 year 필드로 구분하고,
 *     지난 해는 status:'archived'로 숨긴다. (2028이 와도 같은 컬렉션을 그대로 쓴다)
 *   - 강의실에 매인 것은 전부 course_ 접두, 재사용 창고는 접두 없는 복수형.
 *   - 저장은 전부 Firestore 하나로. (RTDB는 나중에 실시간 미션의 '그 순간' 상태 전용으로만,
 *     끝나면 최종 결과를 course_submissions에 남긴다)
 *
 * 학생이 낸 답은 종류를 가리지 않고 course_submissions 한 곳에 모은다(제출물 통합).
 *   종류는 part 필드(question/formative/mission)로 구분. 성적은 따로 컬렉션을 두지 않고
 *   이 제출물에서 뽑아 보여 주는 것으로 시작한다. */
// 전 컬렉션은 hoclass_ 접두어로 통일한다(2026-10-29). 한 Firebase 프로젝트를
// 아카이브(hoistory)·구 LMS(lms_*)와 공유하므로, 이 앱 것은 접두어로 딱 가른다.
// 공용 컬렉션(mission_submissions: 미니앱 제출, settings: 공용 설정)만 예외로 둔다.
export const COLLECTIONS = {
  // ── 지금 쓰는 7개 ──
  schoolYears:        'hoclass_school_years',   // { year, status }  문서 id = '2027'
  subjects:           'hoclass_subjects',       // 과목 목록 { year, name } (전역 과목 드롭다운이 쓴다, 일반설정에서 관리)
  courses:            'hoclass_courses',        // 강의실 { year, subject, grade, classNo, status }
  courseStudents:     'hoclass_course_students',// 명단 { courseId, studentNo, name }  id = 강의실id_학번
  courseRoster:       'hoclass_course_roster',  // 학년도 학생 명부 { year, studentNo, name }  id = 학년도_학번
                                        //   강의실 명단에서 다 빠져도 학생은 여기 남는다(2026-10-29)
  courseAuth:         'hoclass_course_auth',    // 비밀번호 해시 { hash }  id = 학년도_학번 (로그인 때만 읽음)
  courseLessons:      'hoclass_course_lessons', // 강의실 연결 콘텐츠(차시) { courseId, lessonId, order, isOpen, date }
  lessons:            'hoclass_lessons',        // 강의 본체 창고(과목 없음). parts 4칸 + order
  courseSubmissions:  'hoclass_course_submissions', // 제출물 통합 { clId, part, courseId, studentNo, answer, score, ... }
  courseGrades:       'hoclass_course_grades',  // 성적 기록 { clId, studentNo, 영역별 달성/기한, absent, feedback }
                                        //   id = 연결강의id_학번. 급간 표와 반영 강의는 hoclass_settings/grade

  // ── 나중(예약): 해당 단계에서 실제로 만든다 ──
  quizzes:            'hoclass_quizzes',        // 복습 문제 창고            (5단계 복습 허브)
  courseQuizzes:      'hoclass_course_quizzes', // 강의실에 걸린 복습        (5단계)
  missionApps:        'hoclass_mission_apps',   // 미션 미니앱 등록부 { name, studentUrl, adminUrl, lessonId, archive }
  courseConsent:      'hoclass_course_consent', // 학생 동의서              (학생 화면 붙일 때)
  courseScores:       'hoclass_course_scores',  // 안 쓴다. 성적은 grades와 제출물에서 집계한다
  courseXp:           'hoclass_course_xp',       // 경험치/포인트            (6단계 게임 요소)

  // 공지사항 (선생님 지시 2026-10-30). 학년도와 과목에 매인 글이다. 강의실(반)마다 따로 쓰지는 않는다
  notices:            'hoclass_notices',        // { year, subject, title, body, createdAt, pinned, commentsOff }  과목마다 따로
  noticeReads:        'hoclass_notice_reads',    // 공지 열람+좋아요 { noticeId, studentNo, name, liked }  id = 공지id_학번
  noticeComments:     'hoclass_notice_comments', // 공지 댓글 { noticeId, studentNo, name, text, createdAt }
  noticeBans:         'hoclass_notice_bans',     // 댓글 작성 차단 { }  id = 학번(있으면 차단). 교사만 건다
};

// 강의 안 네 칸: 각 강의에 최대 1개, 순서 자유.
//   portfolio: 성적(포트폴리오)에 들어가는가   submits: 학생 제출물이 생기는가
export const PART_TYPES = [
  { key:'concept',   name:'개념 노트',   icon:'book-open',      portfolio:true,  submits:false },
  { key:'mission',   name:'미션 활동',   icon:'target',         portfolio:true,  submits:true  },
  { key:'question',  name:'오늘의 질문', icon:'message-square', portfolio:true,  submits:true  },
  { key:'formative', name:'형성평가',  icon:'circle-check',   portfolio:false, submits:true  },
];
export const PART_ORDER = PART_TYPES.map(p => p.key);
export function partDef(key){ return PART_TYPES.find(p => p.key === key) || null; }

// 독립 메뉴
export const REVIEW = { key:'review', name:'복습', icon:'list-ordered' };

/* 학생이 강의실 안에서 보는 메뉴 (선생님 지시 2026-10-30, 요구사항 108)
 * 전에는 배치 셋(강의 보기 / 메뉴 / 콘텐츠)을 탭으로 넘겼다(요구사항 85, 90).
 * 이제 강의실 안은 메뉴 한 화면뿐이다. 맨 위에 공지사항 글 목록, 그 아래 첫 묶음(강의 보기, 성적),
 * 둘째 묶음(칸 넷과 복습). 강의 보기는 예전 강의 보기 배치를 그대로 여는 메뉴가 됐다.
 * 콘텐츠(뽑기, 게임)는 강의실 밖, 강의실 고르기 쪽으로 옮길 자리라 강의실 안에서 뺐다.
 * group: 'main'(첫 묶음) | 'part'(세부 영역 묶음) */
export const STUDENT_MENUS = [
  { key:'lessons', name:'강의 보기', icon:'monitor',     kind:'lessons', group:'main' },
  { key:'score',   name:'성적',      icon:'bar-chart-3', kind:'score',   group:'main' },
  ...PART_TYPES.map(p => ({ key:p.key, name:p.name, icon:p.icon, kind:'part', group:'part' })),
  // 복습은 일단 뺐다(선생님 지시 2026-10-30, 요구사항 120). 되살릴 때 kind:'review'로 다시 넣는다.
];

// 어드민 왼쪽 메뉴
// 가운데 넷(개념 노트, 미션 활동, 오늘의 질문, 형성평가)은 강의 안 네 칸을 각각 관리하는 자리다.
// 칸 이름(PART_TYPES)과 메뉴 이름은 같다: 선생님이 부르는 이름 하나로 통일했다(2026-10-28).
export const ADMIN_MENUS = [
  { key:'rooms',     name:'강의실 관리',     icon:'graduation-cap' },
  { key:'students',  name:'학생 관리',       icon:'users' },
  { key:'progress',  name:'진도 관리',       icon:'clipboard-list' },
  { key:'notice',    name:'공지사항',        icon:'megaphone' },
  { key:'concept',   name:'강의 라이브러리', icon:'book-open' },
  { key:'mission',   name:'미션 활동',       icon:'target' },
  { key:'question',  name:'오늘의 질문',     icon:'message-square' },
  { key:'formative', name:'형성평가',        icon:'circle-check' },
  { key:'scores',    name:'성적',            icon:'bar-chart-3' },
  { key:'general',   name:'일반 설정',       icon:'settings' },
];

/* 어드민 메뉴 이름과 순서는 일반 설정에서 바꾼다(선생님 지시 2026-10-29).
   위 ADMIN_MENUS의 이름은 "아직 안 바꿨을 때 보일 기본값"이다. 바꾼 이름은 settings/general의
   texts 맵에 `menu_키`로, 순서는 menuOrder 배열로 들어간다.
   순서 안의 MENU_SEP는 구분선이다. 메뉴처럼 위아래로 옮길 수 있다. */
export const MENU_SEP = '|';
export const DEFAULT_MENU_ORDER = ['rooms','students','progress','notice', MENU_SEP,
  'concept','mission','question','formative','scores', MENU_SEP, 'general'];
let menuOrder = null;   // 관리자가 정한 순서. loadCore가 settings/general에서 채운다.
export function menuName(key){
  const v = siteTexts['menu_' + key];
  if (v != null && v !== '') return v;
  return ADMIN_MENUS.find(m => m.key === key)?.name || '';
}
// 저장된 순서를 지금 있는 메뉴에 맞춘다: 없어진 메뉴는 빼고, 새로 생긴 메뉴는
// ADMIN_MENUS에서 바로 앞에 있는 메뉴 뒤에 끼운다(공지사항이 일반 설정 밑으로 떨어지지 않게, 2026-10-30).
export function getMenuOrder(){
  const keys = ADMIN_MENUS.map(m => m.key);
  const src = Array.isArray(menuOrder) ? menuOrder : DEFAULT_MENU_ORDER;
  const out = [];
  src.forEach(k => { if (k === MENU_SEP || (keys.includes(k) && !out.includes(k))) out.push(k); });
  keys.forEach((k, i) => {
    if (out.includes(k)) return;
    const at = i > 0 ? out.indexOf(keys[i - 1]) : -1;
    out.splice(at + 1, 0, k);
  });
  return out;
}
// 왼쪽 메뉴에 그릴 차례: { sep:true } 또는 { key, name, icon }
export function adminMenus(){
  return getMenuOrder().map(k => k === MENU_SEP ? { sep:true }
    : { ...ADMIN_MENUS.find(m => m.key === k), name:menuName(k) });
}
export async function setMenuOrder(order){
  menuOrder = [...order];
  await setDoc(doc(db, 'hoclass_settings', 'general'), { menuOrder }, { merge:true });
}

/* 메뉴 안의 서브 메뉴. 미션 활동은 열어 둔 앱이 탭이 되므로 여기 적지 않는다.
   강의 라이브러리(key는 그대로 concept) 메뉴 아래에 강의 관리 / 슬라이드 / 디자인 셋을 둔다
   (선생님 지시 2026-10-30): 좁은 뜻의 개념 노트는 슬라이드의 한 단계일 뿐이고, 여기서 하는 일은
   강의(차시)를 만들고 슬라이드를 채우고 꾸미는 것이라 메뉴 이름을 강의 라이브러리로 올렸다.
   "슬라이드" 탭이 곧 축 편집기다(아래 content 값은 그대로 두어 상태·분기 코드를 건드리지 않는다). */
export const ADMIN_SUBMENUS = {
  concept:  [ { v:'library', label:'강의 관리' }, { v:'content', label:'슬라이드' }, { v:'design',  label:'디자인' } ],
  question: [ { v:'manage',  label:'질문 관리' }, { v:'answers', label:'답변' }, { v:'pick', label:'PICK' } ],
  // 형성평가는 문제를 만드는 자리와 학생들이 푼 결과를 보는 자리 둘이다(선생님 지시 2026-10-29).
  formative:[ { v:'manage',  label:'문제 관리' }, { v:'result',  label:'성취도 관리' } ],
  // 성적은 hoistory/lms의 성적 Check 세 화면(입력, 설정, 조회)을 그대로 옮긴 것이다.
  scores:   [ { v:'input',   label:'입력' }, { v:'setting', label:'설정' }, { v:'view',  label:'조회' } ],
};

/* ── 일반 설정에서 바꾸는 글 (2026-10-28, 2026-10-29 줄임) ──────────────────
   처음(2026-10-28)엔 화면 문구를 전부 여기서 바꾸게 했는데, 2026-10-29에 선생님이
   "오류문구는 그냥 하드코딩 해도 될거 같고, 다른 문구들도 하드코딩 해"라고 해서
   **일반 묶음(탭 제목, 사이트 이름, 어드민 이름, 링크 둘)만** 남겼다. 메뉴 이름과 순서는 위 menuName, getMenuOrder.
   어드민의 "일반 설정"은 이 표를 돌며 입력 칸을 그린다. 화면은 getText(key)로 읽는다.
   관리자가 고친 값은 settings/general 문서(texts 맵)에 저장된다. 안 고치면 기본값을 쓴다. */
export const TEXT_FIELDS = [
  { group:'일반', items:[
    { key:'browserTitle', label:'브라우저 탭 제목',   def:'HOCLASS' },
    { key:'siteName',     label:'사이트 이름',         def:'호성T 수업 : 학습 관리 시스템' },
    { key:'adminName',    label:'어드민 이름',         def:'hoclass' },
    { key:'kakaoUrl',     label:'오픈카톡 링크',       def:'' },
    { key:'installUrl',   label:'홈 화면에 추가 안내 링크', def:'' },
  ]},
  // 학생 로그인 화면 문구와 오류 문구 묶음은 뺐다(선생님 지시 2026-10-29: 하드코딩해도 된다).
  // 그 글은 index.js에 바로 적혀 있다.
];
let siteTexts = {};   // 관리자가 고친 값만. loadCore가 settings/general에서 채운다.
let slideDesign = {}; // 슬라이드 글자 크기(디자인 탭). 전체 공통, settings/general의 slideDesign 맵.
export function getText(key){
  const v = siteTexts[key];
  if (v != null && v !== '') return v;
  for (const g of TEXT_FIELDS){ const f = g.items.find(i => i.key === key); if (f) return f.def; }
  return '';
}
// 일반 설정의 저장 버튼이 한 번에 부른다: 필드마다 따로 쓰지 않고 texts 맵 전체를 한 번에 쓴다.
export async function setTexts(patch){
  Object.entries(patch).forEach(([k, v]) => { siteTexts[k] = String(v ?? '').trim(); });
  await setDoc(doc(db, 'hoclass_settings', 'general'), { texts: siteTexts }, { merge:true });
}

// 형성평가 문제 유형 다섯 (선생님 지시 2026-10-29: 진위형 초성형 단답형 선택형 합답형 순서)
export const FORMATIVE_TYPES = [
  { key:'ox',      name:'진위형' },
  { key:'initial', name:'초성형' },
  { key:'short',   name:'단답형' },
  { key:'choice',  name:'선택형' },
  { key:'combo',   name:'합답형' },
];
export function formativeTypeDef(key){ return FORMATIVE_TYPES.find(t => t.key === key) || null; }

// 표시 이름 헬퍼
const pad2 = n => String(n).padStart(2, '0');
/* 강의실 이름에는 과목명을 붙이지 않는다(선생님 지시 2026-11-02: "모든 강의실 이름에서 과목명
   다 빼야 하는데 여전히 잔존하는게 많네"). 과목은 늘 머리줄 드롭다운으로 따로 고르므로 이름에
   또 적으면 겹친다. 그래서 roomName과 roomNo는 같은 글자를 돌려준다("301").
   둘을 하나로 합치지 않고 남겨 둔 까닭: 부르는 자리의 뜻이 다르다(이름 = 안내 문구, 번호 = 칸 글자).
   나중에 이름 모양을 다시 바꿀 일이 생기면 roomName만 고치면 된다. */
export function roomName(course){ return roomNo(course); }
export function roomNo(course){ return `${course.grade}${pad2(course.classNo)}`; }

/* 수업일자는 연도 없이 'M/D'로만 적는다(진도 관리, hoistory와 같다).
   오늘과 가장 가까운 해로 읽어 학기가 연말을 넘어가도 자연스럽게 맞는다.
   Date 또는 null(빈 값, 형식 오류)을 돌려준다. 진도표 색칠과 성적 기한 판정이 같이 쓴다. */
export function resolveMmdd(mmdd, today = new Date()){
  const mt = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(String(mmdd ?? '').trim());
  if (!mt) return null;
  const m = +mt[1], d = +mt[2];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let best = null;
  [base.getFullYear() - 1, base.getFullYear(), base.getFullYear() + 1].forEach(yy => {
    const cand = new Date(yy, m - 1, d), diff = Math.abs(cand - base);
    if (!best || diff < best.diff) best = { date:cand, diff };
  });
  return best.date;
}
// 'past' | 'today' | 'future' | 'none'. 진도표와 강의 진도의 날짜 강조에 쓴다.
export function dateStatus(mmdd, today = new Date()){
  const d = resolveMmdd(mmdd, today);
  if (!d) return 'none';
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (d.getTime() === base.getTime()) return 'today';
  return d < base ? 'past' : 'future';
}

// ───────────────────────────────────────────────────────────────────────────
// 메모리 캐시: 화면은 이 메모리를 보고, loadCore가 Firestore에서 채운다.
// 제로베이스(2026-10-27): 가짜 시드 없이 빈 상태로 시작한다. 어드민에서 학년도,
// 강의실, 학생, 강의를 차례로 만들면 그때부터 Firestore에 쌓인다. 각 문서 모양은 아래 주석 참고.
// ───────────────────────────────────────────────────────────────────────────
const DEMO = {
  years:        [],   // school_years   { id:'2027', year:2027, status:'active' }
  subjects:     [],   // subjects       { id, year, name }
  courses:      [],   // courses        { id, year, subject, grade, classNo, status }
  students:     [],   // course_students{ id:'강의실id_학번', courseId, studentNo, name }
  roster:       [],   // course_roster  { id:'학년도_학번', year, studentNo, name }
  lessons:      [],   // lessons        { id, title, parts:{concept,mission,question,formative}, order:[] }
  courseLessons:[],   // course_lessons { id, courseId, lessonId, order, isOpen, date:'M/D' }
  submissions:  [],   // course_submissions { id:'연결강의id_칸_학번', clId, part, courseId, studentNo, name, answer, score, at, shared }
  grades:       [],   // course_grades   { id:'연결강의id_학번', clId, studentNo, concept:{achievedN,onTimeN}, mission, question, absent, feedback, manual }
  gradeConf:    { bands:null, lessons:[], feedbackTemplates:[] },  // settings/grade  급간 표 + 반영 강의 + 피드백 템플릿
  notices:      [],   // notices        { id, year, subject, title, body, createdAt, pinned, commentsOff }
  noticeReads:  [],   // notice_reads   { id:'공지id_학번', noticeId, studentNo, name, liked }
  noticeComments: [], // notice_comments{ id, noticeId, studentNo, name, text, createdAt }
  noticeBans:   [],   // notice_bans    { id:'학번' }

  // ── 나중 단계에서 채운다(지금은 비움) ──
  quizzes:       [],  // quizzes        { id, title, source, items:[] }
  courseQuizzes: [],  // course_quizzes { id, courseId, quizId, isOpen }
  missionApps:   [],  // mission_apps   { id:앱키, name, studentUrl, adminUrl }
  xp:            [],  // course_xp      { id:'강의실id_학번', courseId, studentNo, xp, point }
};

/* 레벨 표: 2026 LMS shared/xp.js의 기본값을 그대로 옮겼다(누적 경험치 기준).
   표 끝을 넘으면 공식으로 이어 간다(마지막 간격 550, 레벨마다 25씩 커짐). */
export const XP_LEVELS = [0,100,225,375,550,750,975,1225,1500,1800,
                          2125,2475,2850,3250,3675,4125,4600,5100,5625,6175];
const XP_FORMULA = { lastGap:550, increment:25 };
export function levelFromXp(total){
  const t = +total || 0;
  for (let i = XP_LEVELS.length - 1; i >= 0; i--){
    if (t >= XP_LEVELS[i]){ if (i < XP_LEVELS.length - 1) return i + 1; break; }
  }
  let threshold = XP_LEVELS[XP_LEVELS.length - 1], gap = XP_FORMULA.lastGap, lv = XP_LEVELS.length;
  while (t >= threshold + gap){ threshold += gap; gap += XP_FORMULA.increment; lv++; }
  return lv;
}

/* ── Firestore 연결 (2026-10-27 제로베이스) ──
   부팅 때 '지금 쓰는' 컬렉션을 메모리(DEMO)로 한 번 불러오고, 이후 화면은 이 메모리를 본다.
   쓰기는 메모리를 먼저 고치고(화면 즉시 반영) Firestore에도 보낸다(백그라운드).
   비밀번호(course_auth)는 로그인 때만 읽으므로 여기서 통째로 불러오지 않는다.
   나중 단계 컬렉션(복습, 미션앱, 성적요약, 경험치)은 그 단계에서 붙인다. */
function put(coll, obj){ setDoc(doc(db, coll, obj.id), obj).catch(e => console.error('save', coll, obj.id, e)); }
function del(coll, id){ deleteDoc(doc(db, coll, id)).catch(e => console.error('del', coll, id, e)); }

export async function loadCore(){
  const C = COLLECTIONS;
  const [ys, cs, ss, rs, cls, ls, subs, grs, mas, nts, gen, grc, sjs, nrd, ncm, nbn] = await Promise.all([
    getDocs(collection(db, C.schoolYears)),
    getDocs(collection(db, C.courses)),
    getDocs(collection(db, C.courseStudents)),
    getDocs(collection(db, C.courseRoster)),
    getDocs(collection(db, C.courseLessons)),
    getDocs(collection(db, C.lessons)),
    getDocs(collection(db, C.courseSubmissions)),
    getDocs(collection(db, C.courseGrades)),
    getDocs(collection(db, C.missionApps)),
    getDocs(collection(db, C.notices)),
    getDoc(doc(db, 'hoclass_settings', 'general')),
    getDoc(doc(db, 'hoclass_settings', 'grade')),
    // 과목 목록은 못 읽어도(규칙 미배포/학생 권한) 전체 로드를 깨지 않는다. 학생은 강의실에서 과목을 얻는다.
    getDocs(collection(db, C.subjects)).catch(() => ({ docs: [] })),
    // 공지 소셜(열람·좋아요·댓글·차단). 규칙 미배포여도 로드를 깨지 않게 각각 catch.
    getDocs(collection(db, C.noticeReads)).catch(() => ({ docs: [] })),
    getDocs(collection(db, C.noticeComments)).catch(() => ({ docs: [] })),
    getDocs(collection(db, C.noticeBans)).catch(() => ({ docs: [] })),
  ]);
  const rows = snap => snap.docs.map(d => ({ ...d.data(), id:d.id }));
  DEMO.years       = rows(ys).sort((a,b) => b.year - a.year);
  DEMO.courses     = rows(cs);
  DEMO.students    = rows(ss);
  DEMO.roster      = rows(rs);
  DEMO.courseLessons = rows(cls);
  DEMO.lessons     = rows(ls);
  DEMO.submissions = rows(subs);
  DEMO.grades      = rows(grs);
  DEMO.missionApps = rows(mas);
  DEMO.notices     = rows(nts);
  DEMO.subjects    = rows(sjs);
  DEMO.noticeReads = rows(nrd);
  DEMO.noticeComments = rows(ncm);
  DEMO.noticeBans  = rows(nbn);
  siteTexts       = gen.exists() ? (gen.data().texts || {}) : {};
  menuOrder        = gen.exists() ? (gen.data().menuOrder || null) : null;
  slideDesign      = gen.exists() ? (gen.data().slideDesign || {}) : {};
  DEMO.gradeConf   = grc.exists()
    ? { bands:grc.data().bands || null, lessons:grc.data().lessons || [],
        feedbackTemplates: grc.data().feedbackTemplates || [] }
    : { bands:null, lessons:[], feedbackTemplates:[] };
}

// ── 조회 (메모리에서. loadCore가 Firestore에서 채워 둔다) ──
export function getYears(){ return [...DEMO.years]; }
export function getCourses(year){ return DEMO.courses.filter(c => !year || c.year === +year); }
export function getCourse(id){ return DEMO.courses.find(c => c.id === id) || null; }
export function getStudentsByCourse(courseId){ return DEMO.students.filter(s => s.courseId === courseId); }
/* 한 학년도의 학생 전부 { studentNo, name }. 학년도 명부(course_roster)가 기준이고, 명부가 생기기 전에
   강의실 명단에만 들어간 학생도 같이 센다. 강의실에서 다 빠져도 명부에 남으므로 학생 관리에서 사라지지 않는다
   (선생님 지시 2026-10-29). */
export function getStudentsByYear(year){
  const out = new Map();
  DEMO.roster.filter(r => r.year === +year).forEach(r => out.set(r.studentNo, { studentNo:r.studentNo, name:r.name }));
  const ids = new Set(DEMO.courses.filter(c => c.year === +year).map(c => c.id));
  DEMO.students.filter(s => ids.has(s.courseId) && !out.has(s.studentNo))
    .forEach(s => out.set(s.studentNo, { studentNo:s.studentNo, name:s.name }));
  return [...out.values()];
}
// 학년도 명부에 없으면 넣는다. 학생을 추가하거나 강의실에 넣고 뺄 때 부른다.
function ensureRoster(year, studentNo, name){
  const id = `${year}_${studentNo}`;
  if (DEMO.roster.some(r => r.id === id)) return;
  const r = { id, year:+year, studentNo, name: name || '' };
  DEMO.roster.push(r); put(COLLECTIONS.courseRoster, r);
}
// 한 학년도에서 한 학번이 든 강의실들
export function getCoursesOfStudent(year, studentNo){
  const mine = DEMO.students.filter(s => s.studentNo === studentNo);
  return DEMO.courses.filter(c => c.year === +year && mine.some(m => m.courseId === c.id));
}
/* ── 최신순 (선생님 지시 2026-10-30, 요구사항 112) ──
   "특정 정렬 조건이 없다면 무조건 최신순." 새로 등록한 것이 늘 맨 위다.
   만든 시각은 createdAt(2026-10-30부터 새 문서에 적는다)이고, 그 전에 만든 문서는
   id에서 읽는다: nid()가 '접두 + Date.now()의 36진수 8자리 + 순번'으로 만들기 때문이다.
   접두가 소문자면 시각 글자와 붙어 경계를 못 가르므로 접두를 받아서 자른다.
   읽지 못하면 0(가장 오래된 것)으로 둔다. */
const MS_2020 = Date.UTC(2020, 0, 1), MS_2100 = Date.UTC(2100, 0, 1);
export function createdMs(o, prefix = ''){
  if (typeof o?.createdAt === 'number') return o.createdAt;
  const id = String(o?.id ?? '');
  if (!id.startsWith(prefix)) return 0;
  const n = parseInt(id.slice(prefix.length, prefix.length + 8), 36);
  return (n > MS_2020 && n < MS_2100) ? n : 0;
}
export function newestFirst(list, prefix = ''){
  return [...list].sort((a, b) => createdMs(b, prefix) - createdMs(a, prefix));
}

export function getLessons(){ return [...DEMO.lessons]; }
// 강의 창고를 최신순으로(강의 라이브러리, 개념 노트 콘텐츠 목록). 강의 id 접두는 'L'이다(addLesson).
export function getLessonsNewest(){ return newestFirst(DEMO.lessons, 'L'); }
export function getLesson(id){ return DEMO.lessons.find(l => l.id === id) || null; }
// 강의실 연결 콘텐츠 (order 순). 각 항목에 lesson 본체를 붙여 준다.
export function getCourseLessons(courseId){
  return DEMO.courseLessons
    .filter(cl => cl.courseId === courseId)
    .sort((a,b) => a.order - b.order)
    .map(cl => ({ ...cl, lesson: getLesson(cl.lessonId) }));
}
/* 메뉴별 배치가 쓰는 조회: 한 강의실에서 그 칸을 가진 공개 강의만 차례로.
   돌려주는 것은 { cl(연결 자리), lesson, part(그 칸의 내용), no(몇 번째 강의인가) }. */
export function getPartItems(courseId, partKey){
  return getCourseLessons(courseId)
    .filter(cl => cl.isOpen && cl.lesson)
    // 차수(no)는 그 반에서의 순번이 아니라 강의 고정 번호(lesson.num)다(선생님 지시 2026-10-31:
    // 반마다 다르게 세지 않는다). 번호는 생성 때 필수라 늘 있다. 표시는 lessonBadge로 29강/[OT].
    .map(cl => ({ cl, lesson:cl.lesson, part:cl.lesson.parts?.[partKey], no:cl.lesson.num }))
    .filter(x => !!x.part);
}
/* 연도+과목+강 번호(lesson.num)로 강의 하나를 찾는다(슬라이드 URL이 랜덤 id 대신 차수로 열리게).
   강의엔 연도/과목이 없으므로 그 해 그 과목 강의실(course)에 배치된 강의 중 num이 같은 것을 고른다.
   같은 번호가 여럿이면 첫째(교사가 과목·연도 안에서 번호를 겹치지 않게 매기는 전제). */
export function getLessonByYSNum(year, subject, num){
  const n = String(num ?? '').trim(); if (!n) return null;
  const courseIds = new Set(DEMO.courses
    .filter(c => c.year === +year && c.subject === subject).map(c => c.id));
  const lessonIds = new Set(DEMO.courseLessons
    .filter(cl => courseIds.has(cl.courseId)).map(cl => cl.lessonId));
  return DEMO.lessons.find(l => lessonIds.has(l.id) && String(l.num).trim() === n) || null;
}

// 그 칸(개념 노트, 미션 활동, 오늘의 질문, 형성평가)을 가진 강의만, 최신순. 칸별 메뉴 넷이 쓴다.
export function getLessonsWithPart(key){ return getLessonsNewest().filter(l => !!l.parts?.[key]); }

// 미션 앱은 order 오름차순(작을수록 위). 새 앱은 늘 맨 위로 들어간다(addMissionApp).
// order가 없는 옛 문서는 order 있는 것들 뒤에 불러온 차례대로 선다.
/* 미션 앱도 최신순이다(선생님 지시 2026-10-30, 요구사항 114). 전에 있던 위, 아래 단추는 걷었다.
   앱 id는 앱 키(폴더 이름)라 시각이 안 들어 있으므로 createdAt으로만 가른다.
   createdAt이 없는 옛 앱끼리는 예전 순서(order, 작을수록 위)를 그대로 따른다. 예전에도 새 앱이 맨 위였다. */
const missionOrder = a => (typeof a.order === 'number' ? a.order : Infinity);
export function getMissionApps(){
  return [...DEMO.missionApps].sort((a, b) => createdMs(b) - createdMs(a) || missionOrder(a) - missionOrder(b));
}
export function getMissionApp(appKey){ return DEMO.missionApps.find(a => a.id === appKey) || null; }

export function getQuizzes(){ return [...DEMO.quizzes]; }
export function getCourseQuizzes(courseId){
  return DEMO.courseQuizzes
    .filter(cq => cq.courseId === courseId)
    .map(cq => ({ ...cq, quiz: DEMO.quizzes.find(q => q.id === cq.quizId) }));
}
export function getXp(courseId, studentNo){
  return DEMO.xp.find(x => x.courseId === courseId && x.studentNo === studentNo) || null;
}

// ── 변경 (메모리를 고치고 Firestore에도 보낸다) ──
// id는 새로고침해도 겹치지 않게 시각+증가값으로 만든다(예전 c_101 같은 재사용 충돌 방지).
let seq = 0;
const nid = p => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
/* 학년도: 강의실이 없어도 학년도가 먼저 있어야 한다(요구사항 5, 16).
   비어 있는 데이터베이스에서 제일 먼저 만드는 것이 이것이다. */
export function addYear(year){
  const y = +year;
  if (!(y >= 2000 && y <= 2199)) throw new Error('학년도를 확인해 주세요.');
  if (DEMO.years.some(x => x.year === y)) throw new Error(`${y}학년도는 이미 있습니다.`);
  const row = { id:String(y), year:y };
  DEMO.years.push(row);
  DEMO.years.sort((a, b) => b.year - a.year);   // 큰 해부터
  put(COLLECTIONS.schoolYears, row);
  return row;
}

/* 한 강의실을 지우면 같이 없어지는 것. 삭제 확인 창이 숫자를 보여 주는 데 쓴다. */
export function courseDeps(id){
  return {
    students: DEMO.students.filter(s => s.courseId === id).length,
    lessons:  DEMO.courseLessons.filter(cl => cl.courseId === id).length,
    quizzes:  DEMO.courseQuizzes.filter(cq => cq.courseId === id).length,
    subs:     DEMO.submissions.filter(s => s.courseId === id).length,
    grades:   DEMO.grades.filter(g => g.courseId === id).length,
  };
}

export function addCourse({ year, subject, grade, classNo }){
  const c = { id:nid('c_'), year:+year, subject:String(subject).trim(), grade:+grade, classNo:+classNo, status:'active' };
  if (!c.subject) throw new Error('과목을 적어 주세요.');
  if (!(c.grade >= 1 && c.grade <= 6)) throw new Error('학년을 확인해 주세요.');
  if (!(c.classNo >= 1 && c.classNo <= 99)) throw new Error('반을 확인해 주세요.');
  if (sameRoomExists(c)) throw new Error(`${roomName(c)} 강의실이 이미 있습니다.`);
  DEMO.courses.push(c); put(COLLECTIONS.courses, c);
  ensureSubject(c.year, c.subject);   // 과목 목록에도 반영(새 과목이면 추가)
  return c;
}

/* 과목 목록(선생님 지시 2026-11-01): 전역 과목 드롭다운이 쓰는 과목을 일반 설정에서 관리한다.
   연도별 { id, year, name }. 강의실을 만들면 그 과목도 여기 들어간다(ensureSubject). */
// 과목 목록 = 관리 목록(hoclass_subjects) ∪ 지금 강의실이 쓰는 과목. 합집합이라 기존 강의실의
// 과목도 바로 보이고(마이그레이션 쓰기 없음), 학생앱 loadCore가 아무것도 쓰지 않는다.
export function getSubjectRows(year){
  const y = +year;
  const managed = DEMO.subjects.filter(s => s.year === y);
  const names = new Set(managed.map(s => s.name));
  const rows = managed.slice();
  [...new Set(DEMO.courses.filter(c => c.year === y).map(c => c.subject))].forEach(nm => {
    if (nm && !names.has(nm)){ names.add(nm); rows.push({ id:null, year:y, name:nm }); }   // id 없음 = 강의실이 쓰는 중(삭제 불가)
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
export function getSubjects(year){ return getSubjectRows(year).map(s => s.name); }
function ensureSubject(year, name){
  const nm = String(name || '').trim(); if (!nm) return;
  if (DEMO.subjects.some(s => s.year === +year && s.name === nm)) return;
  const row = { id: nid('sub_'), year: +year, name: nm };
  DEMO.subjects.push(row); put(COLLECTIONS.subjects, row);
}
export function addSubject(year, name){
  const nm = String(name || '').trim();
  if (!nm) throw new Error('과목 이름을 적어 주세요.');
  if (DEMO.subjects.some(s => s.year === +year && s.name === nm)) throw new Error(`${nm} 과목이 이미 있습니다.`);
  const row = { id: nid('sub_'), year: +year, name: nm };
  DEMO.subjects.push(row); put(COLLECTIONS.subjects, row); return row;
}
export function subjectInUse(year, name){
  return DEMO.courses.some(c => c.year === +year && c.subject === name);
}
export function removeSubject(id){
  const s = DEMO.subjects.find(x => x.id === id); if (!s) return;
  if (subjectInUse(s.year, s.name)) throw new Error(`${s.name} 과목의 강의실이 있어 지울 수 없습니다. 강의실을 먼저 지우세요.`);
  DEMO.subjects = DEMO.subjects.filter(x => x.id !== id); del(COLLECTIONS.subjects, id);
}
/* 학년도 삭제: 강의실이나 학생이 있으면 막는다(실수 방지). 과목 목록은 같이 정리한다. */
export function removeYear(year){
  const y = +year;
  if (DEMO.courses.some(c => c.year === y)) throw new Error('이 학년도에 강의실이 있어 지울 수 없습니다.');
  if (DEMO.roster.some(r => r.year === y)) throw new Error('이 학년도에 학생이 있어 지울 수 없습니다.');
  DEMO.years = DEMO.years.filter(x => x.year !== y); del(COLLECTIONS.schoolYears, String(y));
  DEMO.subjects.filter(s => s.year === y).forEach(s => del(COLLECTIONS.subjects, s.id));
  DEMO.subjects = DEMO.subjects.filter(s => s.year !== y);
}

// 같은 학년도에 과목과 학년과 반이 똑같은 강의실이 또 있는가(자기 자신은 뺀다)
function sameRoomExists({ id, year, subject, grade, classNo }){
  return DEMO.courses.some(c => c.id !== id && c.year === +year &&
    c.subject === subject && c.grade === +grade && c.classNo === +classNo);
}

export function updateCourse(id, { subject, grade, classNo }){
  const c = getCourse(id); if (!c) throw new Error('강의실을 찾지 못했습니다.');
  const next = { id, year:c.year, subject:String(subject).trim(), grade:+grade, classNo:+classNo };
  if (!next.subject) throw new Error('과목을 적어 주세요.');
  if (!(next.grade >= 1 && next.grade <= 6)) throw new Error('학년을 확인해 주세요.');
  if (!(next.classNo >= 1 && next.classNo <= 99)) throw new Error('반을 확인해 주세요.');
  if (sameRoomExists(next)) throw new Error(`${roomName(next)} 강의실이 이미 있습니다.`);
  Object.assign(c, { subject:next.subject, grade:next.grade, classNo:next.classNo });
  put(COLLECTIONS.courses, c); return c;
}

/* 강의실 하나 삭제: 그 강의실에 매인 것(course_ 접두)이 전부 같이 없어진다.
   창고(lessons, quizzes)는 건드리지 않는다. 강의 내용 자체는 남는다. */
export function deleteCourse(id){
  const c = getCourse(id); if (!c) return null;
  // 같이 없어지는 것(course_ 접두). 지울 id를 먼저 모아 Firestore에서도 지운다.
  // 강의실이 없어져도 학생은 학년도 명부에 남긴다.
  DEMO.students.filter(s => s.courseId === id).forEach(s => { ensureRoster(c.year, s.studentNo, s.name); del(COLLECTIONS.courseStudents, s.id); });
  DEMO.courseLessons.filter(cl => cl.courseId === id).forEach(cl => del(COLLECTIONS.courseLessons, cl.id));
  DEMO.courses = DEMO.courses.filter(x => x.id !== id);
  DEMO.students = DEMO.students.filter(s => s.courseId !== id);
  DEMO.courseLessons = DEMO.courseLessons.filter(cl => cl.courseId !== id);
  DEMO.courseQuizzes = DEMO.courseQuizzes.filter(cq => cq.courseId !== id);
  DEMO.submissions.filter(s => s.courseId === id).forEach(s => del(COLLECTIONS.courseSubmissions, s.id));
  DEMO.submissions = DEMO.submissions.filter(s => s.courseId !== id);
  DEMO.grades.filter(g => g.courseId === id).forEach(g => del(COLLECTIONS.courseGrades, g.id));
  DEMO.grades = DEMO.grades.filter(g => g.courseId !== id);
  del(COLLECTIONS.courses, id);
  return c;
}
export function addStudent({ year, grade, classNo, studentNo, name }){
  // 그 학년도, 그 반(과목 무관)의 강의실 전부에 등록
  const rooms = DEMO.courses.filter(c =>
    c.year === +year && c.grade === +grade && c.classNo === +classNo && c.status === 'active');
  const added = [];
  rooms.forEach(c => {
    const id = `${c.id}_${studentNo}`;
    if (DEMO.students.some(s => s.id === id)) return;
    const s = { id, courseId:c.id, studentNo, name };
    DEMO.students.push(s); added.push(s); put(COLLECTIONS.courseStudents, s);
  });
  if (rooms.length) ensureRoster(year, studentNo, name);
  return { rooms, added };
}
// 학생 삭제: 그 학년도 강의실 명단과 학년도 명부에서 다 지운다(성적, 제출물, 비밀번호는 남는다).
export function removeStudentEverywhere(year, studentNo){
  const rid = `${year}_${studentNo}`;
  if (DEMO.roster.some(r => r.id === rid)){ DEMO.roster = DEMO.roster.filter(r => r.id !== rid); del(COLLECTIONS.courseRoster, rid); }
  const ids = new Set(DEMO.courses.filter(c => c.year === +year).map(c => c.id));
  DEMO.students.filter(s => ids.has(s.courseId) && s.studentNo === studentNo)
    .forEach(s => del(COLLECTIONS.courseStudents, s.id));
  DEMO.students = DEMO.students.filter(s => !(ids.has(s.courseId) && s.studentNo === studentNo));
}
// 학생 한 명을 한 강의실에 넣고 빼기: 수강 과목(강의실) 체크에 쓴다.
export function enrollStudent(courseId, studentNo, name){
  const c = getCourse(courseId); if (!c) return null;
  const id = `${courseId}_${studentNo}`;
  if (DEMO.students.some(s => s.id === id)) return null;
  const s = { id, courseId, studentNo, name: name || '' };
  DEMO.students.push(s); put(COLLECTIONS.courseStudents, s);
  ensureRoster(c.year, studentNo, name);
  return s;
}
// 강의실에서만 뺀다. 빼기 전에 학년도 명부에 올려 두어 학생 자체는 남는다.
export function unenrollStudent(courseId, studentNo){
  const id = `${courseId}_${studentNo}`;
  const c = getCourse(courseId), cur = DEMO.students.find(s => s.id === id);
  if (c && cur) ensureRoster(c.year, studentNo, cur.name);
  const before = DEMO.students.length;
  DEMO.students = DEMO.students.filter(s => s.id !== id);
  if (DEMO.students.length < before){ del(COLLECTIONS.courseStudents, id); return true; }
  return false;
}
// 강의 본체를 Firestore에 통째로 저장한다(parts, order, 개념 콘텐츠, 질문이 다 lessons 문서 안에 있다).
function saveLesson(lessonId){ const l = getLesson(lessonId); if (l) put(COLLECTIONS.lessons, l); }

export function addLesson(title, num = ''){
  // 강 번호는 필수다(선생님 지시 2026-10-31: 애초에 고정 번호 없이는 강의 생성 불가). 모든 생성 경로가
  // 여기를 지나므로 여기서 막으면 번호 없는 강의가 생길 수 없다. 숫자면 N강, OT 같은 말이면 [OT]로 쓴다.
  const n = String(num ?? '').trim();
  if (!n) throw new Error('강 번호를 입력해 주세요. 번호 없이는 강의를 만들 수 없습니다.');
  const l = { id:nid('L'), title, num:n, parts:{}, order:[], createdAt:Date.now() };
  DEMO.lessons.push(l); put(COLLECTIONS.lessons, l); return l;
}
/* 강의 번호/라벨(선생님 지시 2026-10-30). 숫자면 슬라이드 표지에 "N강", 그 밖이면 "[OT]"로 보인다
   (보이는 규칙은 shared/slide-axis.js의 lessonBadge). 강의 라이브러리에서 만들 때와 편집할 때 적는다. */
export function setLessonNum(lessonId, num){
  const l = getLesson(lessonId); if (!l) return null;
  l.num = String(num ?? '').trim(); saveLesson(lessonId); return l;
}
// 강의 제목 고치기(진도표의 주제 칸, 강의 라이브러리 공용).
export function setLessonTitle(lessonId, title){
  const l = getLesson(lessonId); if (!l) return null;
  const t = String(title ?? '').trim();
  if (!t) throw new Error('강의 제목을 적어 주세요.');
  l.title = t; saveLesson(lessonId); return l;
}
// 진도 관리의 강의 메모(진도가 바뀐 것 같은 것을 적어 둔다, 선생님 지시 2026-10-29). 강의마다 하나.
export function setLessonMemo(lessonId, memo){
  const l = getLesson(lessonId); if (!l) return null;
  l.memo = String(memo ?? '').trim(); saveLesson(lessonId); return l;
}
export function setLessonPart(lessonId, key, on){
  const l = getLesson(lessonId); if (!l) return;
  if (on){
    // 칸 제목은 비워 둔 채로 만든다. 전에는 칸 종류 이름("개념 노트")을 그대로 넣었는데,
    // 화면이 종류 이름과 제목을 위아래로 같이 보여 줘서 "개념 노트 / 개념 노트"로 겹쳐 보였다
    // (선생님 지적 2026-11-02). 비면 화면이 종류 이름만 보여 준다.
    if (!l.parts[key]) l.parts[key] = { title:'' };
    if (!l.order.includes(key)) l.order.push(key);
  } else {
    delete l.parts[key];
    l.order = l.order.filter(k => k !== key);
  }
  saveLesson(lessonId);
}
export function moveLessonPart(lessonId, key, dir){
  const l = getLesson(lessonId); if (!l) return;
  const i = l.order.indexOf(key); if (i < 0) return;
  const j = i + dir; if (j < 0 || j >= l.order.length) return;
  [l.order[i], l.order[j]] = [l.order[j], l.order[i]];
  saveLesson(lessonId);
}
export function placeLesson(courseId, lessonId){
  const order = DEMO.courseLessons.filter(c => c.courseId === courseId).length + 1;
  const cl = { id:nid('cl'), courseId, lessonId, order, isOpen:false, date:'' };
  DEMO.courseLessons.push(cl); put(COLLECTIONS.courseLessons, cl); return cl;
}
export function toggleCourseLessonOpen(id){
  const cl = DEMO.courseLessons.find(c => c.id === id);
  if (cl){ cl.isOpen = !cl.isOpen; put(COLLECTIONS.courseLessons, cl); }
}
// 한 강의실 안에서 연결 강의의 차례를 위/아래로(dir: -1 위, +1 아래). order 값을 맞바꾼다.
export function moveCourseLesson(courseId, clId, dir){
  const arr = DEMO.courseLessons.filter(c => c.courseId === courseId).sort((a,b) => a.order - b.order);
  const i = arr.findIndex(c => c.id === clId); if (i < 0) return;
  const j = i + dir; if (j < 0 || j >= arr.length) return;
  const a = arr[i], b = arr[j]; const t = a.order; a.order = b.order; b.order = t;
  put(COLLECTIONS.courseLessons, a); put(COLLECTIONS.courseLessons, b);
}
export function toggleCourseQuizOpen(id){
  const cq = DEMO.courseQuizzes.find(c => c.id === id); if (cq) cq.isOpen = !cq.isOpen;
}
// 수업일자('M/D') 저장: 진도표와 강의실 상세가 같은 course_lessons를 써서 서로 맞물린다.
export function setCourseLessonDate(clId, date){
  const cl = DEMO.courseLessons.find(c => c.id === clId); if (!cl) return null;
  cl.date = String(date ?? '').trim(); put(COLLECTIONS.courseLessons, cl); return cl;
}
// 연결 강의 하나를 그 강의실에서 뺀다. 강의 내용 자체는 창고에 남는다.
export function unplaceLesson(clId){
  const cl = DEMO.courseLessons.find(c => c.id === clId); if (!cl) return null;
  DEMO.courseLessons = DEMO.courseLessons.filter(c => c.id !== clId);
  del(COLLECTIONS.courseLessons, clId);
  DEMO.grades.filter(g => g.clId === clId).forEach(g => del(COLLECTIONS.courseGrades, g.id));
  DEMO.grades = DEMO.grades.filter(g => g.clId !== clId);
  DEMO.submissions.filter(s => s.clId === clId).forEach(s => del(COLLECTIONS.courseSubmissions, s.id));
  DEMO.submissions = DEMO.submissions.filter(s => s.clId !== clId);
  return cl;
}

/* 강의 하나를 지우면 무엇이 같이 없어지는가. 확인 창 문구를 쓰려고 미리 센다. */
export function lessonUsage(lessonId){
  const cls = DEMO.courseLessons.filter(cl => cl.lessonId === lessonId);
  const ids = new Set(cls.map(cl => cl.id));
  return {
    rooms:   new Set(cls.map(cl => cl.courseId)).size,
    links:   cls.length,
    grades:  DEMO.grades.filter(g => ids.has(g.clId)).length,
    subs:    DEMO.submissions.filter(s => ids.has(s.clId)).length,
    apps:    DEMO.missionApps.filter(a => a.lessonId === lessonId).length,
    inGrade: isGradeLesson(lessonId),
  };
}
/* 강의 본체 하나 삭제. 스물다섯째 글이 "어드민에는 강의를 지우는 단추가 아직 없다"고
   남긴 구멍을 메운 것이다(2027 예시를 넣어 보고 지울 길이 없었다).
   창고에서 지우는 것이라 되돌릴 수 없고
   연결한 강의실에서도 다 빠진다. deleteCourse와 방향이 반대다: 그쪽은 강의실을 지워도
   강의 내용이 창고에 남지만, 이쪽은 내용 자체가 없어진다.
   같이 지우는 것
   - 연결(course_lessons)과 그 연결에 매인 성적, 제출물: unplaceLesson이 한다
   - 성적 반영 강의 목록(settings/grade): 지운 강의 id가 남으면 없는 강의를 집계에 센다
   - 미션 앱이 걸어 둔 강의 고리: 앱 자체는 남기고 고리만 끊는다
   돌려주는 inGrade가 참이면 부르는 쪽이 saveGradeConfig()로 설정을 다시 써야 한다
   (settings/grade는 put이 아니라 문서를 통째로 쓰는 자리라 여기서 혼자 저장하지 않는다). */
export function deleteLesson(lessonId){
  const l = getLesson(lessonId); if (!l) return null;
  const used = lessonUsage(lessonId);
  DEMO.courseLessons.filter(cl => cl.lessonId === lessonId).forEach(cl => unplaceLesson(cl.id));
  if (used.inGrade) toggleGradeLesson(lessonId, false);
  DEMO.missionApps.filter(a => a.lessonId === lessonId).forEach(a => {
    a.lessonId = null; put(COLLECTIONS.missionApps, a);
  });
  DEMO.lessons = DEMO.lessons.filter(x => x.id !== lessonId);
  del(COLLECTIONS.lessons, lessonId);
  return { lesson:l, ...used };
}

/* ── 진도표의 강의 줄 (hoistory 진도 계획 틀 이식, 선생님 지시 2026-10-28) ──
   hoistory에서는 진도표 한 줄이 모든 반에 공통이고 반마다 날짜만 달랐다. 2027도 같게 둔다:
   진도표에서 강의를 더하면 **그 과목의 강의실 전부에 같이 연결된다**(요구사항 49의 과목 일괄).
   돌려주는 것은 만든 강의와 연결한 강의실 수다. */
export function addLessonToSubject(year, subject, title, num){
  const t = String(title ?? '').trim();
  if (!t) throw new Error('강의 제목을 적어 주세요.');
  const n = String(num ?? '').trim();
  if (!n) throw new Error('강 번호를 적어 주세요.');
  const rooms = DEMO.courses.filter(c => c.year === +year && c.subject === subject && c.status === 'active');
  if (!rooms.length) throw new Error(`${subject} 강의실이 없습니다.`);
  const lesson = addLesson(t, n);
  rooms.forEach(c => placeLesson(c.id, lesson.id));
  return { lesson, rooms: rooms.length };
}
// 진도표 한 줄(= 한 강의)을 그 과목 강의실 전부에서 뺀다.
export function removeLessonFromSubject(year, subject, lessonId){
  const ids = new Set(DEMO.courses
    .filter(c => c.year === +year && c.subject === subject).map(c => c.id));
  const targets = DEMO.courseLessons.filter(cl => cl.lessonId === lessonId && ids.has(cl.courseId));
  targets.forEach(cl => unplaceLesson(cl.id));
  return targets.length;
}
/* 반별 수업 요일(hoistory 진도표 머리줄의 "수1, 목5"). 강의실 문서에 적어 둔다.
   시간표 자체를 쓰는 것이 아니라 선생님이 눈으로 보는 메모라 자유 입력으로 둔다. */
export function setCourseSchedule(courseId, schedule){
  const c = getCourse(courseId); if (!c) return null;
  c.schedule = String(schedule ?? '').trim();
  put(COLLECTIONS.courses, c);
  return c;
}
/* ── 성적 (hoistory/lms 성적 Check 기본 틀 이식, 선생님 지시 2026-10-28) ────────
   2026 lms에서 돌려 본 방식을 그대로 가져온다. 점수를 강의마다 직접 적는 것이 아니라,
   강의마다 영역별로 **달성**과 **기한** 두 칸을 체크하고, 전체 달성률을 **급간 표**로
   점수로 환산한다. 그래서 강의가 몇 개든 만점이 흔들리지 않는다.

     1) 강의마다 학생마다 영역(개념 노트, 미션 활동, 오늘의 질문)별로 달성 칸과 기한 칸.
        영역을 끄면 그 강의에서 미실시가 된다(칸이 있는가가 곧 실시, 미실시다)
     2) 달성률 = 켜진 칸 / 가능한 칸. 성적 설정의 반영 강의 목록에 든 강의만 센다
     3) 급간 표(bands)에서 그 달성률에 맞는 줄을 찾아 영역 점수를 읽는다
     4) 세 영역 점수를 더한 것이 포트폴리오 성적

   손으로 쓰기와 자동 끌어오기를 둘 다 둔다(선생님 지시):
     자동 : 미션 활동과 오늘의 질문은 제출물(course_submissions)에서 달성과 기한을 계산한다.
            기한은 그 강의의 수업일자(course_lessons.date, 진도 관리에서 넣는 그 값)와
            제출 시각을 견준다. 진도 관리와 성적이 여기서 맞물린다
     손   : 어느 칸이든 교사가 눌러 바꾸면 그 영역은 manual로 표시되고, 다시 불러와도
            자동 감지가 덮어쓰지 않는다. 개념 노트는 LMS 밖 활동지라 늘 손으로만 넣는다
   형성평가와 복습은 성적에서 빠진다(요구사항 70). */

// 성적에 드는 영역 셋. PART_TYPES의 portfolio 칸과 같다.
export const GRADE_AREAS = PART_TYPES.filter(p => p.portfolio).map(p => ({ key:p.key, name:p.name }));

/* 급간 표 기본값: hoistory/lms의 DEFAULT_BANDS를 그대로 옮겼다(생각체크 = 오늘의 질문).
   달성률이 min 이상인 첫 줄의 점수를 쓴다. 개념 30, 미션 40, 질문 30으로 100점. */
export const DEFAULT_BANDS = [
  { min:90, concept:30, mission:40, question:30 },
  { min:80, concept:27, mission:36, question:27 },
  { min:70, concept:24, mission:32, question:24 },
  { min:60, concept:21, mission:28, question:21 },
  { min:50, concept:18, mission:24, question:18 },
  { min:40, concept:15, mission:20, question:15 },
  { min:30, concept:12, mission:16, question:12 },
  { min:20, concept: 9, mission:12, question: 9 },
  { min:10, concept: 6, mission: 8, question: 6 },
  { min: 0, concept: 3, mission: 4, question: 3 },
];

export function getBands(){
  const b = DEMO.gradeConf.bands;
  return (Array.isArray(b) && b.length) ? b : DEFAULT_BANDS;
}
// 성적에 반영할 강의(lessons의 id 목록). 비어 있으면 아무것도 집계하지 않는다.
export function getGradeLessons(){ return [...(DEMO.gradeConf.lessons || [])]; }
export function isGradeLesson(lessonId){ return (DEMO.gradeConf.lessons || []).includes(lessonId); }
export function toggleGradeLesson(lessonId, on){
  const list = DEMO.gradeConf.lessons || (DEMO.gradeConf.lessons = []);
  const i = list.indexOf(lessonId);
  if (on && i < 0) list.push(lessonId);
  if (!on && i >= 0) list.splice(i, 1);
  return list;
}
/* 피드백 템플릿: 성적 설정에서 한 줄에 하나씩 적고, 성적 입력의 피드백 칸 옆 고르개에서 고른다
   (선생님 지시 2026-10-28). 빈 줄과 중복은 버린다. */
export function getFeedbackTemplates(){ return [...(DEMO.gradeConf.feedbackTemplates || [])]; }
export function setFeedbackTemplates(list){
  const clean = [];
  (Array.isArray(list) ? list : String(list ?? '').split('\n')).forEach(t => {
    const v = String(t ?? '').trim();
    if (v && !clean.includes(v)) clean.push(v);
  });
  DEMO.gradeConf.feedbackTemplates = clean;
  return clean;
}
// 성적 설정의 저장 버튼이 한 번에 부른다(급간 표, 반영 강의 목록, 피드백 템플릿을 같이 쓴다).
export async function saveGradeConfig(bands){
  const clean = (bands || getBands()).map(b => ({
    min: Math.max(0, Math.min(100, Math.round(+b.min) || 0)),
    concept: Math.max(0, Math.round(+b.concept) || 0),
    mission: Math.max(0, Math.round(+b.mission) || 0),
    question: Math.max(0, Math.round(+b.question) || 0),
  })).sort((a, b) => b.min - a.min);
  DEMO.gradeConf = { bands:clean, lessons:getGradeLessons(), feedbackTemplates:getFeedbackTemplates() };
  await setDoc(doc(db, 'hoclass_settings', 'grade'), DEMO.gradeConf);
  return DEMO.gradeConf;
}

/* 그 강의의 그 칸이 성적에서 몇 칸을 차지하는가. 칸이 켜져 있으면 1, 꺼져 있으면 0(미실시)이다.
   배수(1배, 2배) 고르개는 선생님 지시로 걷어냈다(2026-10-28). 강의는 창고에 있는 것이라
   켜고 끄기는 그 강의를 연결한 모든 강의실에 같이 걸린다. */
export function partWeight(lessonId, partKey){
  return getLesson(lessonId)?.parts?.[partKey] ? 1 : 0;
}

// ── 성적 기록 (course_grades, 문서 id = 연결강의id_학번) ──
const emptyBlock = () => ({ achievedN:0, onTimeN:0 });
function blankRec(clId, studentNo){
  const cl = DEMO.courseLessons.find(x => x.id === clId);
  const rec = { id:`${clId}_${studentNo}`, clId, courseId:cl?.courseId || '', lessonId:cl?.lessonId || '',
                studentNo, absent:false, feedback:'', manual:{} };
  GRADE_AREAS.forEach(a => { rec[a.key] = emptyBlock(); });
  return rec;
}
// 기록이 없으면 빈 것을 돌려준다(저장은 하지 않는다. 화면이 읽기만 할 때가 많다).
export function gradeRec(clId, studentNo){
  return DEMO.grades.find(g => g.clId === clId && g.studentNo === studentNo) || blankRec(clId, studentNo);
}
function gradeRecLive(clId, studentNo){
  let g = DEMO.grades.find(x => x.clId === clId && x.studentNo === studentNo);
  if (!g){ g = blankRec(clId, studentNo); DEMO.grades.push(g); }
  GRADE_AREAS.forEach(a => { if (!g[a.key]) g[a.key] = emptyBlock(); });
  if (!g.manual) g.manual = {};
  return g;
}
function saveGrade(g){ put(COLLECTIONS.courseGrades, g); return g; }

/* 칸 하나를 켜고 끈다. field는 'achievedN' 또는 'onTimeN', n은 0부터 가중치까지.
   교사가 누른 것이므로 그 영역을 manual로 표시한다(자동 감지가 덮어쓰지 못하게). */
export function setGradeCell(clId, studentNo, area, field, n){
  const cl = DEMO.courseLessons.find(x => x.id === clId);
  if (!cl) throw new Error('강의를 찾지 못했습니다.');
  const w = partWeight(cl.lessonId, area);
  if (!w) throw new Error('그 칸이 없는 강의입니다.');
  const g = gradeRecLive(clId, studentNo);
  if (g.absent) throw new Error('결석으로 둔 학생은 미달성으로 고정됩니다.');
  g[area][field] = Math.max(0, Math.min(w, Math.round(+n) || 0));
  g.manual[area] = true;
  return saveGrade(g);
}
// 이름을 누르면 결석. 결석은 전부 미달성으로 고정한다(hoistory와 같다).
export function toggleGradeAbsent(clId, studentNo){
  const g = gradeRecLive(clId, studentNo);
  g.absent = !g.absent;
  if (g.absent) GRADE_AREAS.forEach(a => { g[a.key] = emptyBlock(); g.manual[a.key] = true; });
  return saveGrade(g);
}
// 한 학생의 실시 중인 모든 칸을 한 번에 켜고 끈다(이름 앞 체크박스).
export function setGradeRowAll(clId, studentNo, on){
  const cl = DEMO.courseLessons.find(x => x.id === clId);
  if (!cl) throw new Error('강의를 찾지 못했습니다.');
  const g = gradeRecLive(clId, studentNo);
  if (g.absent) throw new Error('결석으로 둔 학생은 미달성으로 고정됩니다.');
  GRADE_AREAS.forEach(a => {
    const w = partWeight(cl.lessonId, a.key); if (!w) return;
    g[a.key] = { achievedN: on ? w : 0, onTimeN: on ? w : 0 };
    g.manual[a.key] = true;
  });
  return saveGrade(g);
}
/* 한 열을 한 번에 켜고 끈다(머리줄의 달성, 기한 옆 체크표시). 결석 학생은 건너뛴다. */
export function setGradeColAll(clId, studentNos, area, field, on){
  const cl = DEMO.courseLessons.find(x => x.id === clId);
  if (!cl) throw new Error('강의를 찾지 못했습니다.');
  const w = partWeight(cl.lessonId, area);
  if (!w) throw new Error('그 칸이 꺼져 있는 강의입니다.');
  (studentNos || []).forEach(no => {
    const g = gradeRecLive(clId, no);
    if (g.absent) return;
    g[area][field] = on ? w : 0;
    g.manual[area] = true;
    saveGrade(g);
  });
}
export function setGradeFeedback(clId, studentNo, text){
  const g = gradeRecLive(clId, studentNo);
  g.feedback = String(text ?? '').trim();
  return saveGrade(g);
}
// 그 반에 이 강의 성적을 공개했는가. 2027은 연결 강의가 이미 반 단위라 거기에 붙인다.
export function toggleGradePublished(clId){
  const cl = DEMO.courseLessons.find(x => x.id === clId); if (!cl) return null;
  cl.gradePublished = !cl.gradePublished;
  cl.gradePublishedAt = cl.gradePublished ? Date.now() : null;
  put(COLLECTIONS.courseLessons, cl);
  return cl;
}

/* ── 자동 감지 ──
   제출물에서 달성과 기한을 계산한다. 기한은 수업일자(cl.date)의 끝(자정)까지를 본다.
   날짜를 안 넣은 강의는 기한을 따지지 않고 통과로 둔다(진도 관리에서 날짜를 넣으면 그때 걸린다).
   오늘의 질문은 hoistory thinkVerdict의 뼈대를 옮겼다: 50자 미만은 미달성, 지연 제출은
   달성이지만 기한에서 깎인다. 미제출은 둘 다 0이다. */
function lessonDueMs(cl){
  const d = resolveMmdd(cl?.date);
  return d ? d.getTime() + 24 * 60 * 60 * 1000 - 1 : null;
}
export function autoDetect(clId){
  const cl = DEMO.courseLessons.find(x => x.id === clId);
  if (!cl) return {};
  const due = lessonDueMs(cl);
  const out = {};
  DEMO.submissions.filter(s => s.clId === clId).forEach(s => {
    if (s.part !== 'mission' && s.part !== 'question') return;
    const w = partWeight(cl.lessonId, s.part); if (!w) return;
    const at = +s.at || 0;
    const onTime = (!due || !at) ? true : at <= due;
    let achieved = true, note = '통과';
    // 오늘의 질문은 답변 채점 화면과 같은 판정(AI 채점, 선생님의 통과/미흡까지)을 쓴다.
    if (s.part === 'question'){ const v = questionVerdict(s); achieved = v.achieved; note = v.verdict; }
    else if (!onTime) note = '미흡(지연 제출)';
    out[s.studentNo] = out[s.studentNo] || {};
    out[s.studentNo][s.part] = { achievedN: achieved ? w : 0, onTimeN: onTime ? w : 0, at, note };
  });
  return out;
}
/* 자동 감지를 기록에 넣는다. manual로 표시된 영역과 결석 학생은 건드리지 않는다.
   돌려주는 것은 { touched, skipped } : 몇 명을 끌어왔는지 화면에 알리는 데 쓴다. */
export function applyAutoDetect(clId){
  const cl = DEMO.courseLessons.find(x => x.id === clId);
  if (!cl) throw new Error('강의를 찾지 못했습니다.');
  const auto = autoDetect(clId);
  let touched = 0, skipped = 0;
  Object.entries(auto).forEach(([studentNo, areas]) => {
    const g = gradeRecLive(clId, studentNo);
    if (g.absent){ skipped++; return; }
    let changed = false;
    Object.entries(areas).forEach(([area, v]) => {
      if (g.manual?.[area]){ skipped++; return; }
      if (g[area].achievedN !== v.achievedN || g[area].onTimeN !== v.onTimeN){
        g[area] = { achievedN:v.achievedN, onTimeN:v.onTimeN };
        changed = true;
      }
    });
    if (changed){ saveGrade(g); touched++; }
  });
  return { touched, skipped };
}
// 손으로 고친 표시를 지운다(그 영역을 자동 감지에 다시 맡긴다).
export function clearGradeManual(clId, studentNo, area){
  const g = gradeRecLive(clId, studentNo);
  if (area) delete g.manual[area]; else g.manual = {};
  return saveGrade(g);
}

/* ── 집계 ──
   한 학생의 한 강의실 성적. 반영 강의 목록(성적 설정)에 들고 그 반에 공개된 강의만 센다.
   돌려주는 것: { areas:{키:{achieved,total,pct,score}}, total, maxScore, lessonCount, rows }
   rows는 강의별 내역이다(어디서 깎였는지 바로 보이게. hoistory 2026-09-03과 같은 뜻). */
export function studentGrade(courseId, studentNo){
  const bands = getBands();
  const picked = new Set(getGradeLessons());
  const cls = getCourseLessons(courseId).filter(cl => picked.has(cl.lessonId) && cl.gradePublished);
  const sum = {}; GRADE_AREAS.forEach(a => { sum[a.key] = { achieved:0, total:0 }; });
  const rows = cls.map((cl, i) => {
    const rec = gradeRec(cl.id, studentNo);
    const row = { clId:cl.id, no:i + 1, num:cl.lesson?.num || '', title:cl.lesson?.title || '(삭제된 강의)',
                  areas:{}, absent:!!rec.absent, feedback:rec.feedback || '' };
    GRADE_AREAS.forEach(a => {
      const w = partWeight(cl.lessonId, a.key);
      if (!w){ row.areas[a.key] = null; return; }
      const got = Math.min(w, rec[a.key]?.achievedN || 0) + Math.min(w, rec[a.key]?.onTimeN || 0);
      sum[a.key].achieved += got; sum[a.key].total += 2 * w;
      row.areas[a.key] = { weight:w, achievedN:rec[a.key]?.achievedN || 0, onTimeN:rec[a.key]?.onTimeN || 0 };
    });
    return row;
  });
  const areas = {};
  GRADE_AREAS.forEach(a => {
    const { achieved, total } = sum[a.key];
    const pct = total ? Math.round(achieved / total * 100) : 0;
    const band = total ? (bands.find(b => pct >= b.min) || bands[bands.length - 1]) : null;
    areas[a.key] = { achieved, total, pct, score: band ? (+band[a.key] || 0) : 0 };
  });
  const top = bands[0] || {};
  const maxScore = GRADE_AREAS.reduce((n, a) => n + (+top[a.key] || 0), 0);
  const total = GRADE_AREAS.reduce((n, a) => n + areas[a.key].score, 0);
  return { areas, total, maxScore, lessonCount: cls.length, rows, has: cls.length > 0 };
}

// 한 강의, 한 반의 달성 통계(성적 입력 화면의 칩). 영역마다 "달성한 학생 / 전체".
export function gradeStats(clId, studentNos){
  const cl = DEMO.courseLessons.find(x => x.id === clId);
  const out = {};
  GRADE_AREAS.forEach(a => {
    const w = cl ? partWeight(cl.lessonId, a.key) : 0;
    if (!w){ out[a.key] = null; return; }
    let done = 0;
    studentNos.forEach(no => { if ((gradeRec(clId, no)[a.key]?.achievedN || 0) >= w) done++; });
    out[a.key] = { done, all: studentNos.length };
  });
  return out;
}

/* ── 개념 노트와 미션 활동의 페이지 (선생님 지시 2026-10-30) ──
   둘은 같은 모양이다: 페이지(제목) 안에 "라벨 + 내용" 묶음. 모양과 옛 줄 옮기기는
   shared/slide-axis.js의 toPages, fromPages에 있다(슬라이드 엔진과 활동지 변환이 같이 쓴다).
   개념 노트는 parts.concept.content, 미션 활동은 deck.mission.content에 저장한다.

   편집기는 페이지 배열을 받아 고친 뒤 통째로 돌려준다(setPages). 줄 하나 고칠 때마다
   길을 따로 두지 않은 까닭: 묶음을 더하고 지우고 옮기는 일이 전부 "페이지 배열을 고친다"로 같다. */
function pagesContent(lessonId, key){
  const l = getLesson(lessonId); if (!l) return null;
  if (key === 'concept'){
    if (!l.parts?.concept) return null;
    if (!Array.isArray(l.parts.concept.content)) l.parts.concept.content = [];
    return l.parts.concept.content;
  }
  if (key === 'mission') return normalizeDeck(l).mission.content;
  return null;
}
export function getPages(lessonId, key){ return toPages(pagesContent(lessonId, key)); }
export function setPages(lessonId, key, pages){
  const l = getLesson(lessonId); if (!l || pagesContent(lessonId, key) === null) return;
  if (key === 'concept') l.parts.concept.content = fromPages(pages);
  else l.deck.mission.content = fromPages(pages);
  saveLesson(lessonId);
}

/* ══ 강의 슬라이드의 축과 덱 (선생님 지시 2026-10-30, 요구사항 125) ══════════
   축 정의와 덱 모양은 shared/slide-axis.js 한 곳에 있다(슬라이드 엔진과 변환 도구가
   Firebase 없이 쓸 수 있어야 해서 갈라 두었다). 여기에는 고치고 저장하는 길만 둔다.
   어드민과 학생 화면은 M.SLIDE_AXIS로 쓴다(아래에서 그대로 다시 내보낸다). */
export { SLIDE_AXIS, AXIS_ORDER, axisStep, REVIEW_TYPES, reviewTypeDef,
  lineLevel, indentText, stripIndent, blankCompare, rowFilled, pagesFilled,
  ROW_TYPES, rowKind, convertRow, lessonBadge,
  SLIDE_DESIGN, SLIDE_DESIGN_ROWS, SLIDE_DESIGN_GLOBAL, slideDesignDefault, designVarsCss } from './shared/slide-axis.js?v=20261101f';
import { slideDesignDefault as _sdDef, designVarsCss as _sdCss,
  SLIDE_DESIGN_ROWS as _sdRows, SLIDE_DESIGN_GLOBAL as _sdG } from './shared/slide-axis.js?v=20261101f';

/* 슬라이드 글자 크기 설정(디자인 탭, 전체 공통). 기본값 위에 관리자가 고친 값을 얹어 돌려준다.
   슬라이드에 걸 CSS는 designCss()가 만든다(슬라이드 문서가 <style>로 끼운다). */
export function getSlideDesign(){ return { ..._sdDef(), ...slideDesign }; }
export function designCss(){ return _sdCss(getSlideDesign()); }
/* 값 하나 저장. val이 null/빈 값이면 그 키를 null로 둔다(요소별 자간·줄간격을 "전체"로 되돌릴 때).
   null은 designVarsCss가 건너뛰어 "미설정"으로 본다(merge:true라 중첩 맵 키를 못 지우므로 null로 표시한다).
   0과 음수도 그대로 저장한다(자간은 음수가 흔하다). */
/* 크기·자간은 pt, 줄간격은 퍼센트라 셋 다 정수로 반올림한다(1.6배는 160으로 적는다). */
const roundDesign = (key, val) => Math.round(+val);
export async function setSlideDesignValue(key, val){
  const v = (val === null || val === '' || !Number.isFinite(+val)) ? null : roundDesign(key, val);
  slideDesign = { ...slideDesign, [key]: v };
  await setDoc(doc(db, 'hoclass_settings', 'general'), { slideDesign: { [key]: v } }, { merge:true });
}
export async function resetSlideDesign(){
  // merge:true는 중첩 맵 키를 지우지 못하므로, 지금까지 넣은 키를 전부 null로 덮어 "미설정"으로 되돌린다.
  const cleared = {}; Object.keys(slideDesign).forEach(k => cleared[k] = null);
  slideDesign = {};
  await setDoc(doc(db, 'hoclass_settings', 'general'), { slideDesign: cleared }, { merge:true });
}
/* 전체(global) 자간('ls') 또는 줄간격('lh')을 정한다. 이때 그 축의 요소별 개별값은 전부 지워(null)
   전체값이 다시 먹게 한다(선생님 지시 2026-10-31: 개별로 바꿨다가 전체를 다시 움직이면 전체가 우선). */
export async function setSlideDesignGlobal(axis, val){
  const suffix = axis === 'ls' ? 'Ls' : 'Lh';
  const patch = { [_sdG[axis].key]: roundDesign(_sdG[axis].key, val) };
  _sdRows.forEach(r => { const k = r.key + suffix; if (slideDesign[k] != null) patch[k] = null; });
  slideDesign = { ...slideDesign, ...patch };
  await setDoc(doc(db, 'hoclass_settings', 'general'), { slideDesign: patch }, { merge:true });
}

export function getDeck(lessonId){ return normalizeDeck(getLesson(lessonId)); }

// 표지 메타(단원, 교과서 쪽수). 강 번호와 강의 제목은 이미 있는 것에서 온다
export function deckSetCover(lessonId, patch){
  const d = getDeck(lessonId); if (!d) return;
  Object.assign(d.cover, patch); saveLesson(lessonId);
}
// 맺음말의 다음 학습 주제('NEXT CLASS' 아래에 뜨는 글). 'NEXT CLASS'는 슬라이드에 고정이라 안 저장한다
export function deckSetClosingTopic(lessonId, topic){
  const d = getDeck(lessonId); if (!d) return;
  d.closing.nextTopic = String(topic ?? ''); saveLesson(lessonId);
}

/* 단계 안의 줄을 더하고 고치고 옮기고 지운다. 줄의 모양이 단계마다 달라서(글자 하나,
   문답 둘, 사진 셋) 더하는 것만 단계별로 가르고 나머지는 한 길로 쓴다. */
function deckItems(lessonId, key){
  const d = getDeck(lessonId);
  return d && d[key] && Array.isArray(d[key].items) ? d[key].items : null;
}
export function deckAddItem(lessonId, key){
  const arr = deckItems(lessonId, key); if (!arr) return;
  // 전시학습확인은 새 문항을 단답형으로 시작한다(유형 셋 중 첫째, 선생님이 말씀하신 순서)
  if (key === 'review')    arr.push({ type:'short', q:'', a:'' });
  else if (key === 'hook') arr.push({ kind:'image', url:'', caption:'' });
  else                     arr.push('');
  saveLesson(lessonId);
}
/* 전시학습확인에만: 문항 사이에 페이지 나누기 마커를 넣는다(선생님 지시 2026-10-31: 2쪽 이상으로).
   마커는 문항이 아니라 쪽을 가르는 표시라 q/a가 없다. 슬라이드(slide-deck.js의 buildSlides)가
   이 마커에서 쪽을 나누고, 번호는 쪽을 넘어 이어진다. normalizeDeck은 이 마커에 유형을 매기지 않는다. */
export function deckAddReviewBreak(lessonId){
  const arr = deckItems(lessonId, 'review'); if (!arr) return;
  arr.push({ pagebreak:true }); saveLesson(lessonId);
}
// 페이지 안 '문제 추가': 그 페이지 끝 자리(at)에 빈 단답형 문항을 끼운다(선생님 지시 2026-10-31).
export function deckInsertReviewItem(lessonId, at){
  const arr = deckItems(lessonId, 'review'); if (!arr) return;
  const i = Math.max(0, Math.min(+at || 0, arr.length));
  arr.splice(i, 0, { type:'short', q:'', a:'' }); saveLesson(lessonId);
}
/* 전시학습확인 페이지 삭제: 페이지를 여는 마커(bi)와 그 안 문항(cnt개)을 함께 지운다.
   bi가 -1이면 마커 없이 시작하는 첫 페이지라 문항만 지운다(마커가 없다). */
export function deckDelReviewPage(lessonId, bi, cnt){
  const arr = deckItems(lessonId, 'review'); if (!arr) return;
  const start = bi < 0 ? 0 : bi;
  const len = (bi < 0 ? 0 : 1) + Math.max(0, +cnt || 0);
  arr.splice(start, len); saveLesson(lessonId);
}
// field가 없으면 줄 전체가 글자 하나인 단계(학습 목표, 미션 안내, 맺음말)다.
export function deckSetItem(lessonId, key, idx, field, value){
  const arr = deckItems(lessonId, key); if (!arr || arr[idx] === undefined) return;
  if (field) arr[idx][field] = value; else arr[idx] = value;
  saveLesson(lessonId);
}
export function deckMoveItem(lessonId, key, idx, dir){
  const arr = deckItems(lessonId, key); if (!arr) return;
  const j = idx + dir; if (j < 0 || j >= arr.length) return;
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
  saveLesson(lessonId);
}
export function deckDelItem(lessonId, key, idx){
  const arr = deckItems(lessonId, key); if (!arr || arr[idx] === undefined) return;
  arr.splice(idx, 1); saveLesson(lessonId);
}
/* 줄 목록(학습 목표, 맺음말처럼 items가 글자 배열인 단계)을 통째로 갈아 끼운다.
   활동지 변환(admin.js의 importWorksheet)이 학습 목표를 한꺼번에 넣을 때 쓴다. */
export function deckSetItems(lessonId, key, items){
  const d = getDeck(lessonId);
  if (!d || !d[key] || !Array.isArray(d[key].items)) return;
  d[key].items = (items || []).map(t => String(t ?? '')); saveLesson(lessonId);
}

/* 그 단계에 적은 것이 있는가. 어드민 왼쪽 축 목록이 채움 표시로 쓴다.
   슬라이드를 펼 때 빈 단계를 건너뛰는 기준은 slide-deck.js의 buildSlides에 있다
   (여기와 저기가 어긋나면 "채웠다고 나오는데 쪽이 없다"가 되므로 기준을 같게 둔다). */
export function deckStepFilled(lessonId, key){
  const l = getLesson(lessonId); if (!l) return false;
  if (key === 'cover') return true;                       // 표지는 제목만 있어도 선다
  // 페이지 제목이나 묶음 칸 중 하나라도 적혀 있으면 쪽이 선다(slide-deck.js의 pageSlides와 같은 기준.
  // 비교 묶음은 네 칸을 다 본다: slide-axis.js의 rowFilled)
  const pageFilled = content => pagesFilled(toPages(content));
  if (key === 'concept') return pageFilled(l.parts?.concept?.content);
  if (key === 'question') return !!String(l.parts?.question?.question || '').trim();
  const d = getDeck(lessonId);
  if (key === 'mission') return pageFilled(d.mission.content)
    || !!String(l.parts?.mission?.title || '').trim();
  if (key === 'closing') return !!String(d.closing?.nextTopic || '').trim();   // 맺음말 = 다음 학습 주제
  const arr = d[key]?.items || [];
  if (key === 'review') return arr.some(it => String(it?.q || '').trim());
  if (key === 'hook')   return arr.some(it => String((it?.kind === 'text' ? it?.text : it?.url) || '').trim());  // 종류가 글이면 글 칸을 본다(2026-11-01)
  return arr.some(t => String(t).trim());
}

/* ── 강의 내용 비우기 (선생님 지시 2026-10-30, 요구사항 134) ──
   "활동지를 지웠는데 왜 강의는 그대로지? 강의 콘텐츠도 없어저야지.
    콘텐츠에서 지우는 건 변형되서 올라온 콘텐츠 자체를 지우는거잖아."
   처음에는 개념 노트와 미션 활동 페이지만 비웠더니 표지, 전시학습확인, 학습 목표, 동기 유발,
   맺음말이 남아 강의가 그대로인 것처럼 보였다. 이제 축 여덟 단계의 내용을 다 비운다.

   비우는 것은 내용뿐이다. 다음은 그대로 둔다:
     강의 자체와 칸(parts)        다시 올리면 바로 채워지게. 강의를 지우는 것은 강의 라이브러리의 일이다
     강의실 연결 콘텐츠          학생 화면의 자리는 그대로
     성적(course_grades)과 진도   강의 내용과 매여 있지 않다
     오늘의 질문(parts.question)  그 메뉴에서 고치는 것이고 활동지가 넣는 것도 아니다
     미션 활동 메뉴의 이름        같은 까닭(parts.mission.title)

   덱이 든 단계 여섯은 덱을 빈 모양으로 되돌리는 것으로 한 번에 비운다: 빈 모양의 출처는
   blankDeck 하나다. 단계를 늘릴 때 여기에 또 적지 않아도 같이 비워진다. */
function stepHasContent(lessonId, key){
  const l = getLesson(lessonId); if (!l) return false;
  const d = getDeck(lessonId);
  const pageFilled = content => pagesFilled(toPages(content));   // 비교 묶음은 네 칸까지(rowFilled)
  /* deckStepFilled를 쓰지 않고 따로 세는 까닭: 저기와 여기가 묻는 것이 다르다.
     저기는 "슬라이드에 쪽이 서는가", 여기는 "비울 것이 있는가"다.
       표지는 저기서 늘 true다(강의 제목만 있어도 쪽이 선다). 여기서는 비울 것,
       곧 단원과 교과서 쪽수가 적혀 있는지만 본다.
       미션 활동은 저기서 미션 활동 메뉴의 이름도 센다. 그 이름은 여기서 지우지 않으므로 뺀다.
     이 함수가 세는 것과 clearLessonContent가 지우는 것이 정확히 같아야 한다
     (어긋나면 "지운다고 했는데 남아 있다"가 된다). 둘을 늘 같이 고친다. */
  if (key === 'cover')    return !!(String(d.cover.unit).trim() || String(d.cover.pages).trim());
  if (key === 'concept')  return pageFilled(l.parts?.concept?.content);
  if (key === 'mission')  return pageFilled(d.mission.content);
  if (key === 'question') return false;              // 다른 메뉴 소유라 비우지 않는다
  if (key === 'closing')  return !!String(d.closing?.nextTopic || '').trim();   // 맺음말 = 다음 학습 주제
  const arr = d[key]?.items || [];
  if (key === 'review') return arr.some(it => String(it?.q || '').trim());
  if (key === 'hook')   return arr.some(it => String((it?.kind === 'text' ? it?.text : it?.url) || '').trim());  // 종류가 글이면 글 칸을 본다(2026-11-01)
  return arr.some(t => String(t).trim());
}
// 비울 내용이 있는 단계들(축 순서). 어드민이 확인 창에 "무엇을 지우는지" 적는 데 쓴다
export function lessonContentSteps(lessonId){
  return AXIS_ORDER.filter(k => stepHasContent(lessonId, k));
}
// 비우고 무엇을 비웠는지 돌려준다. 비울 것이 없으면 아무것도 하지 않는다
export function clearLessonContent(lessonId){
  const l = getLesson(lessonId); if (!l) return [];
  const had = lessonContentSteps(lessonId);
  if (!had.length) return [];
  l.deck = blankDeck();                              // 덱이 든 단계 여섯이 한 번에 빈다
  if (l.parts?.concept) l.parts.concept.content = [];
  saveLesson(lessonId);
  return had;
}

// ── 오늘의 질문 ──
/* 질문 관리(선생님 지시 2026-10-28): 강의별 카드에서 편집 버튼을 눌러 질문과 설명문을 고친다.
   오늘의 질문이 필요 없는 강의는 토글로 칸을 통째로 끈다(칸이 있는가가 곧 성적의 실시, 미실시다).
   끌 때 적어 둔 질문과 설명문은 partsOff에 맡겨 두었다가 다시 켜면 되살린다. */
export function setQuestion(lessonId, patch){
  const l = getLesson(lessonId);
  if (!l?.parts?.question) throw new Error('오늘의 질문을 먼저 켜 주세요.');
  Object.assign(l.parts.question, patch);
  saveLesson(lessonId);
}
/* 칸 하나를 통째로 켜고 끈다. 끌 때 적어 둔 내용은 partsOff에 맡겨 두었다가 다시 켜면 되살린다.
   오늘의 질문 관리의 스위치와 성적 입력의 영역 머리줄 버튼이 같이 쓴다(선생님 지시 2026-10-28). */
export function setPartEnabled(lessonId, key, on){
  const l = getLesson(lessonId); if (!l || !PART_ORDER.includes(key)) return;
  if (!on){
    if (!l.parts?.[key]) return;
    l.partsOff = { ...(l.partsOff || {}), [key]:{ ...l.parts[key] } };
    setLessonPart(lessonId, key, false);
    return;
  }
  if (l.parts?.[key]) return;
  const kept = l.partsOff?.[key];
  if (l.partsOff) delete l.partsOff[key];
  setLessonPart(lessonId, key, true);
  if (kept){ Object.assign(l.parts[key], kept); saveLesson(lessonId); }
}
export function setQuestionEnabled(lessonId, on){ return setPartEnabled(lessonId, 'question', on); }
export function setFormativeEnabled(lessonId, on){ return setPartEnabled(lessonId, 'formative', on); }

/* ── 형성평가 문항 만들기 (선생님 지시 2026-10-29) ──────────────────────────
   "문제 내는건 ZEP에서 하는 거처럼": 유형을 고르면 그 유형에 맞는 칸이 뜨고 적어서 넣는다.
   문항 하나의 모양은 유형마다 다르다(선생님 지시 2026-10-29).
     ox      진위형 { type, q, a:'O'|'X' }
     initial 초성형 { type, q, a }                         초성은 교사가 문제 글에 직접 적는다(자동 생성 안 한다)
     short   단답형 { type, q, a }                         a는 글자
     choice  선택형 { type, q, passage, choices:[5], a }   passage는 제시문(비워도 됨), a는 choices의 자리(0부터)
     combo   합답형 { type, q, passage, options, choices:[5], a }   options는 보기(ㄱㄴㄷㄹ 텍스트)
   답은 문항 안에 둔다. 채점은 읽을 때 formativeResult가 하므로 점수를 따로 적어 두지 않는다. */
/* 화면에서 받은 날것을 문항 하나로 다듬는다. 빈 보기는 떨어뜨리고 정답 자리를 그만큼 당긴다.
   무엇이 비었으면 던진다: 화면이 그 글을 그대로 토스트로 보여 준다. */
export function normFormativeItem({ type, q, a, choices, passage, options }){
  if (!FORMATIVE_TYPES.some(t => t.key === type)) throw new Error('문제 유형을 골라 주세요.');
  const quest = String(q ?? '').trim();
  if (!quest) throw new Error('문제를 입력하시길 바랍니다.');
  if (type === 'choice' || type === 'combo'){
    const list = (choices || []).map(c => String(c ?? '').trim());
    const keep = list.map((c, i) => ({ c, i })).filter(x => x.c);
    if (keep.length < 2) throw new Error('선택지를 두 개 이상 입력하시길 바랍니다.');
    const at = keep.findIndex(x => x.i === +a);
    if (at < 0) throw new Error('정답인 선택지를 골라 주세요.');
    const out = { type, q:quest, choices:keep.map(x => x.c), a:at };
    const pass = String(passage ?? '').trim();
    if (pass) out.passage = pass;
    if (type === 'combo'){
      const opt = String(options ?? '').trim();
      if (!opt) throw new Error('보기를 입력하시길 바랍니다.');
      out.options = opt;
    }
    return out;
  }
  if (type === 'ox'){
    const v = String(a ?? '').trim().toUpperCase();
    if (v !== 'O' && v !== 'X') throw new Error('정답을 O 또는 X로 골라 주세요.');
    return { type, q:quest, a:v };
  }
  const ans = String(a ?? '').trim();
  if (!ans) throw new Error('정답을 입력하시길 바랍니다.');
  return { type, q:quest, a:ans };
}
function formativeItems(lessonId){
  const l = getLesson(lessonId);
  if (!l?.parts?.formative) throw new Error('형성평가를 먼저 켜 주세요.');
  if (!Array.isArray(l.parts.formative.items)) l.parts.formative.items = [];
  return { l, items:l.parts.formative.items };
}
export function addFormativeItem(lessonId, raw){
  const { items } = formativeItems(lessonId);
  items.push(normFormativeItem(raw));
  saveLesson(lessonId);
}
export function setFormativeItem(lessonId, i, raw){
  const { items } = formativeItems(lessonId);
  if (i < 0 || i >= items.length) return;
  items[i] = normFormativeItem(raw);
  saveLesson(lessonId);
}
export function delFormativeItem(lessonId, i){
  const { items } = formativeItems(lessonId);
  if (i < 0 || i >= items.length) return;
  items.splice(i, 1);
  saveLesson(lessonId);
}
export function moveFormativeItem(lessonId, i, dir){
  const { items } = formativeItems(lessonId);
  const j = i + dir;
  if (i < 0 || i >= items.length || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  saveLesson(lessonId);
}
export function getQuestionSubs(clId){
  return DEMO.submissions.filter(s => s.clId === clId && s.part === 'question');
}
/* 제출물 저장: 학생 화면과 미션 미니앱이 쓰는 한 길. 문서 id가 연결강의, 칸, 학번이라
   다시 내면 같은 줄을 고친다. 처음 적힌 at(제출 시각)은 기한 판정의 기준이라 덮어쓰지 않는다
   (2026 네컷에서 다시 낼 때마다 시각이 덮여 기한이 지각으로 뒤집힌 적이 있다). */
export function saveSubmission({ clId, part, studentNo, answer, score, answers }){
  const cl = DEMO.courseLessons.find(x => x.id === clId);
  if (!cl) throw new Error('강의를 찾지 못했습니다.');
  if (!PART_ORDER.includes(part)) throw new Error('칸 종류를 확인해 주세요.');
  const id = `${clId}_${part}_${studentNo}`;
  const i = DEMO.submissions.findIndex(s => s.id === id);
  const stu = DEMO.students.find(s => s.courseId === cl.courseId && s.studentNo === studentNo);
  const prev = i >= 0 ? DEMO.submissions[i] : null;
  const row = { ...(prev || {}), id, clId, part, courseId:cl.courseId, studentNo,
                name: stu?.name || prev?.name || '', at: prev?.at || Date.now() };
  if (answer != null) row.answer = String(answer);
  if (score != null) row.score = +score;
  // 형성평가는 문항마다 답이 있어 배열로 받는다(글자 또는 선택형 번호). 문항 순서와 같은 자리다
  if (answers != null) row.answers = Array.isArray(answers) ? answers.slice() : [];
  if (i >= 0) DEMO.submissions[i] = row; else DEMO.submissions.push(row);
  put(COLLECTIONS.courseSubmissions, row);
  return row;
}
/* ── 형성평가 성취도 (선생님 지시 2026-10-29) ───────────────────────────────
   성적에 들어가지 않는다(요구사항 70). 어드민의 "성취도 관리"가 반 명단을 끌어와
   학생마다 정답률과 오답률을 본다.
   답이 문제 안에 있으므로(lessons.parts.formative.items[].a) 점수를 따로 적어 두지 않고
   읽을 때 센다. 선택형과 합답형은 답이 번호(choices의 자리)고 나머지(진위형, 초성형, 단답형)는 글자다.
   글자는 공백을 떼고 대소문자를 맞춰 견준다.
   안 쓴 문항은 오답으로 센다: 정답률 + 오답률이 늘 100이 되게 한다(선생님이 둘을 같이 본다). */
export function getFormativeSubs(clId){
  return DEMO.submissions.filter(s => s.clId === clId && s.part === 'formative');
}
export function formativeResult(sub, items){
  const list = items || [];
  const given = Array.isArray(sub?.answers) ? sub.answers : [];
  const norm = v => String(v ?? '').replace(/\s+/g, '').toLowerCase();
  let correct = 0, answered = 0;
  list.forEach((it, i) => {
    const g = given[i];
    if (g == null || g === '') return;
    answered++;
    if (it.type === 'choice' || it.type === 'combo' ? +g === +it.a : norm(g) === norm(it.a)) correct++;
  });
  const total = list.length;
  return { total, answered, correct, wrong: total - correct,
           pct: total ? Math.round(correct / total * 100) : 0,
           wrongPct: total ? 100 - Math.round(correct / total * 100) : 0 };
}

export function setSubScore(subId, score){
  const s = DEMO.submissions.find(x => x.id === subId); if (!s) return;
  s.score = (score === '' || score == null) ? null : +score;
  put(COLLECTIONS.courseSubmissions, s);
}
export function toggleSubShared(subId){
  const s = DEMO.submissions.find(x => x.id === subId); if (!s) return;
  s.shared = !s.shared;
  put(COLLECTIONS.courseSubmissions, s);
}

/* 답변 판정 (hoistory/lms thinkVerdict 이식) ────────────────────────────────
   자동으로 통과와 미흡을 가린다. 선생님이 손으로 통과/미흡을 못박으면(verdict 필드)
   그것이 이긴다. 성적의 자동 감지(autoDetect)와 같은 기준을 쓴다.
     50자 미만         : 미흡. 기한은 깎지 않는다
     지연 제출         : 달성은 주고 기한만 깎는다
     그 밖             : 통과
   hoistory의 이탈(cheatCount) 규칙은 학생 화면에 이탈 감시가 아직 없어 다음 단계로 둔다. */
export function questionVerdict(sub){
  const cl = DEMO.courseLessons.find(x => x.id === sub?.clId);
  const due = (() => { const d = resolveMmdd(cl?.date); return d ? d.getTime() + 24*60*60*1000 - 1 : null; })();
  const at = +sub?.at || 0;
  const onTime = (!due || !at) ? true : at <= due;
  const len = (sub?.answer == null) ? (sub?.textLength || 0) : String(sub.answer).trim().length;
  let verdict, achieved;
  if (len < 50){ verdict = '미흡(50자 미만)'; achieved = false; }
  // 정확히 '조금 미흡'(AI 품질 미달)만 잡는다. '미흡(지연 제출)'까지 걸면 지연 제출의 달성이 꺼진다.
  else if (sub?.graded && sub?.aiVerdict === '조금 미흡'){ verdict = '조금 미흡'; achieved = false; }
  else if (!onTime){ verdict = '미흡(지연 제출)'; achieved = true; }
  else { verdict = '통과'; achieved = true; }
  if (sub?.verdict === 'pass'){ verdict = '통과(교사)'; achieved = true; }
  if (sub?.verdict === 'fail'){ verdict = '미흡(교사)'; achieved = false; }
  return { verdict, achieved, onTime, length:len };
}
// 통과/미흡을 손으로 못박는다(같은 값을 다시 누르면 자동 판정으로 되돌린다).
export function setSubVerdict(subId, v){
  const s = DEMO.submissions.find(x => x.id === subId); if (!s) return null;
  s.verdict = (s.verdict === v) ? null : v;
  put(COLLECTIONS.courseSubmissions, s);
  return s;
}

/* AI 채점 (hoistory/lms 생각 Check 채점 모달의 thRunGrading 이식) ──────────────────
   아직 채점 안 된 제출만 매긴다(채점된 것은 고정). 결과는 제출 문서에 그대로 남긴다:
   graded, aiScore(품질 0~100), aiVerdict, aiPt.
     50자 미만        : 미흡(50자 미만), 0pt. AI에 보내지 않는다
     품질 40 미만      : 조금 미흡, 5pt (성적 달성도 꺼진다, questionVerdict)
     그 밖            : 통과 또는 미흡(지연 제출), 10~30pt
   hoistory는 여기서 경험치를 바로 줬다. 2027은 경험치(course_xp)가 아직 없어
   aiPt만 적어 둔다. 이탈(cheatCount)은 학생 화면에 이탈 감시가 없어 뺐다. */
const QUESTION_MAX_PT = 30;
const QUESTION_FULL_Q = 94;   // 이 품질부터 만점(hoistory THINK_FULL_Q)

export async function gradeQuestionsAI(clId, onStatus = () => {}){
  const cl = DEMO.courseLessons.find(x => x.id === clId);
  const lesson = cl && getLesson(cl.lessonId);
  const q = lesson?.parts?.question;
  if (!q) throw new Error('질문이 걸린 강의가 아닙니다.');
  const course = getCourse(cl.courseId);
  const ungraded = getQuestionSubs(clId).filter(s => !s.graded);
  if (!ungraded.length) return 0;

  const short = [], needAi = [];
  ungraded.forEach(s => (questionVerdict({ ...s, verdict:null }).length < 50 ? short : needAi).push(s));

  const quality = {};
  if (needAi.length){
    onStatus(`${needAi.length}개 답변을 채점하고 있습니다.`);
    const who = course ? `${course.subject} 수업(중학교 ${course.grade}학년)` : '수업';
    const prompt = `${who}의 질문에 대한 학생 답변을 채점합니다. 학생 답변은 보통 공백 제외 150자 안팎으로 짧습니다. 길이가 짧다는 이유로 감점하지 마세요. "질문 취지에 맞게 자기 생각을 근거와 함께 썼는가"를 봅니다. 중학생 눈높이에서 격려하는 태도로 보되, 점수는 실제 품질에 따라 분명히 구분해서 매기세요. 성의 있게 자기 생각을 쓴 보통 수준의 답은 75~85 구간이 기본입니다. 자기 입장이 분명하고 근거나 구체적 사례를 갖춘 답에는 90점 이상을 주는 데 인색하지 마세요.
- 90~100: 자기 입장이 분명하고 이유, 근거나 구체적 사례를 갖춰 설득력이 있음
- 75~89: 질문 취지에 맞게 자기 생각을 성의 있게 씀 (성실한 답의 대부분이 여기)
- 60~74: 자기 생각은 있으나 근거 없이 단편적이거나 질문과 살짝 어긋남
- 45~59: 관련은 있으나 한두 문장으로 성의가 뚜렷이 부족
- 0~44: 질문과 완전히 무관, 무의미한 반복이나 복붙, 장난 답변
질문: "${q.question || ''}"
${q.guide ? `수업 참고: "${String(q.guide).slice(0, 300)}"` : ''}
답변 목록(JSON): ${JSON.stringify(needAi.map(s => ({ subId:s.id, text:s.answer || '' })))}
응답은 JSON 배열만 출력(다른 텍스트 없이): [{"subId":"...","quality":0~100 정수}]`;
    const res = await fetch(CLAUDE_PROXY_URL, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:1024, messages:[{ role:'user', content:prompt }] })
    });
    if (!res.ok) throw new Error(`채점에 실패했습니다. (API ${res.status})`);
    const data = await res.json();
    const arr = JSON.parse((data.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim());
    arr.forEach(r => { const n = Math.round(Number(r.quality)); if (isFinite(n)) quality[r.subId] = Math.max(0, Math.min(100, n)); });
  }

  onStatus('채점 결과를 저장하고 있습니다.');
  const commit = (s, pt, verdict, score) => {
    Object.assign(s, { graded:true, aiPt:pt, aiVerdict:verdict, aiScore:score == null ? null : score });
    put(COLLECTIONS.courseSubmissions, s);
  };
  short.forEach(s => commit(s, 0, '미흡(50자 미만)', null));
  needAi.forEach(s => {
    const n = quality[s.id];
    if (n == null || n < 40){ commit(s, 5, '조금 미흡', n); return; }
    const pt = Math.max(10, Math.min(QUESTION_MAX_PT,
      Math.round(10 + (n - 40) / (QUESTION_FULL_Q - 40) * (QUESTION_MAX_PT - 10))));
    const late = !questionVerdict({ ...s, verdict:null }).onTime;
    commit(s, pt, late ? '미흡(지연 제출)' : '통과', n);
  });
  onStatus('');
  return short.length + needAi.length;
}

// 재채점: 그 강의의 채점 결과와 손으로 정한 통과/미흡을 지운 뒤 다시 매긴다.
export async function regradeQuestionsAI(clId, onStatus){
  getQuestionSubs(clId).filter(s => s.graded).forEach(s => {
    Object.assign(s, { graded:false, aiPt:null, aiScore:null, aiVerdict:null, verdict:null });
    put(COLLECTIONS.courseSubmissions, s);
  });
  return gradeQuestionsAI(clId, onStatus);
}

/* ── 미션 앱 등록부 (hoistory/lms 미션 Check 카드 틀 이식) ──
   문서 id가 곧 앱 키(apps/ 아래 폴더 이름)다. hoistory 카드가 들고 있던 것을 그대로 옮겼다:
   제목, 학생 주소, 어드민 주소, 아이콘, 연결할 강의, 팝업으로 열기, 아카이브 세 칸
   (수업 주제, 활동 의도, 아카이브 내용). 아카이브는 나중에 공개 페이지가 그대로 읽는다. */
export function addMissionApp({ name, studentUrl, adminUrl, key, icon, lessonId, modal, archive }){
  const nm = String(name || '').trim(); if (!nm) throw new Error('앱 이름을 적어 주세요.');
  const id = String(key || '').trim() || nid('app_');
  if (DEMO.missionApps.some(a => a.id === id)) throw new Error('이미 있는 앱 키입니다.');
  // 새 앱은 무조건 맨 위(선생님 지시 2026-10-29). 지금은 createdAt이 그 일을 한다(getMissionApps).
  // order는 createdAt이 없는 옛 앱과 섞일 때를 위해 계속 가장 작게 적어 둔다.
  const top = Math.min(0, ...DEMO.missionApps.map(x => x.order).filter(n => typeof n === 'number'));
  const a = { id, name:nm, studentUrl:String(studentUrl || '').trim(), adminUrl:String(adminUrl || '').trim(),
              icon:String(icon || '').trim(), lessonId:lessonId || '', modal:!!modal, order:top - 1, createdAt:Date.now(),
              archive:{ topic:'', intent:'', content:'', ...(archive || {}) } };
  DEMO.missionApps.push(a); put(COLLECTIONS.missionApps, a); return a;
}
export function updateMissionApp(id, patch){
  const a = getMissionApp(id); if (!a) return null;
  ['name','studentUrl','adminUrl','icon'].forEach(k => { if (patch[k] != null) a[k] = String(patch[k]).trim(); });
  if (patch.lessonId != null) a.lessonId = patch.lessonId || '';
  if (patch.modal != null) a.modal = !!patch.modal;
  if (patch.archive) a.archive = { ...(a.archive || {}), ...patch.archive };
  put(COLLECTIONS.missionApps, a); return a;
}
export function deleteMissionApp(id){
  DEMO.missionApps = DEMO.missionApps.filter(a => a.id !== id);
  del(COLLECTIONS.missionApps, id);
}
/* 앱 키(= 문서 id)를 바꾼다. 활동지로 자동 등록한 앱은 임시 키(app_...)로 서는데, 교사가 미션 활동
   메뉴에서 실제 키(예: j_sahwa)를 적으면 그 키로 문서를 옮긴다(선생님 지시 2026-10-30: "비워놓고
   내가 넣을 수 있게"). 앱 키를 가리키는 다른 문서가 없어서(강의와는 lessonId 필드로 이어진다) 옮겨도
   딸린 것이 깨지지 않는다. 옛 문서를 지우고 새 id로 같은 내용을 다시 쓴다. */
export function setMissionAppKey(oldId, newKey){
  const a = getMissionApp(oldId); if (!a) return null;
  const key = String(newKey || '').trim();
  if (!key) throw new Error('앱 키를 적어 주세요.');
  if (key === oldId) return a;
  if (DEMO.missionApps.some(x => x.id === key)) throw new Error('이미 있는 앱 키입니다.');
  const moved = { ...a, id: key };
  DEMO.missionApps = DEMO.missionApps.filter(x => x.id !== oldId).concat(moved);
  del(COLLECTIONS.missionApps, oldId);
  put(COLLECTIONS.missionApps, moved);
  return moved;
}

/* ── 공지 글 서식 (선생님 지시 2026-11-02: "공지사항 작성 시 편집기를 생성해서 정렬, 굵기,
   글색상을 바꿀 수 있게") ───────────────────────────────────────────────────
   공지 내용은 이제 글자 모양을 가진다. 그래서 저장하는 값이 그냥 글자가 아니라 아주 좁은
   HTML 조각이다. 어드민 편집기는 contenteditable이라 브라우저가 제멋대로 태그를 끼워 넣는데
   (크롬, 사파리, 파이어폭스가 다 다르다), 저장할 때와 화면에 띄울 때 두 번 여기를 지나며
   **아는 태그와 아는 스타일만** 남긴다. 걸러 내는 것이 아니라 아는 것만 남기는 쪽이다:
   새 브라우저가 모르는 태그를 내놔도 글자는 살고 모양만 빠진다.
     남기는 태그  굵게/기울임/밑줄/취소선, 줄바꿈, 묶음(div, p, span, font)
     남기는 스타일 정렬(text-align), 글자색(color), 굵기, 기울임, 밑줄
   링크(a)와 그림(img)은 넣지 않는다: 공지에서 쓸 일이 없고 넣는 순간 걸러 낼 것이 늘어난다.
   학생 화면(index.js)과 어드민이 같이 쓴다. 옛 글(그냥 글자)은 그대로 보이게 따로 다룬다. */
const RICH_TAGS = new Set(['B','STRONG','I','EM','U','S','STRIKE','BR','DIV','P','SPAN','FONT']);
const RICH_DROP = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META|FORM|INPUT|SVG)$/;
const RICH_STYLES = ['text-align', 'color', 'font-weight', 'font-style',
  'text-decoration', 'text-decoration-line'];

export function sanitizeRich(html){
  const src = String(html ?? '');
  if (!src) return '';
  const doc = new DOMParser().parseFromString('<div id="r"></div>', 'text/html');
  const root = doc.getElementById('r');
  root.innerHTML = src;
  // 1) 위험한 태그는 안에 든 것까지 통째로 먼저 버린다. 아래 루프에 맡기지 않고 여기서 한 번에
  //    쓸어 내는 까닭: 루프에는 무한 루프를 막는 횟수 제한이 있어서, 쓰레기가 아주 많이 붙은 글을
  //    붙여 넣으면 제한에 걸려 남을 수 있다. 남아선 안 되는 것은 제한 밖에서 지운다.
  root.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,svg').forEach(n => n.remove());
  // 2) 모르는 태그는 껍데기만 벗긴다(안의 글은 살린다).
  //    한 번 벗기면 안쪽이 바깥으로 나오므로 더 없을 때까지 돈다(무한 루프 방지로 횟수를 둔다).
  for (let i = 0; i < 2000; i++){
    const bad = [...root.querySelectorAll('*')].find(n => !RICH_TAGS.has(n.tagName));
    if (!bad) break;
    if (RICH_DROP.test(bad.tagName)) bad.remove();
    else bad.replaceWith(...bad.childNodes);
  }
  // 3) 남은 태그에서 속성을 다 떼고 아는 스타일만 다시 붙인다(onclick 같은 것이 끼지 못하게)
  root.querySelectorAll('*').forEach(n => {
    // 옛 execCommand는 글자색을 <font color="red">로 내놓는다. 스타일로 옮겨 두고 같이 거른다
    if (n.tagName === 'FONT'){
      const c = n.getAttribute('color');
      if (c) n.style.color = c;
    }
    const keep = RICH_STYLES.map(k => [k, n.style.getPropertyValue(k)]).filter(([, v]) => v);
    [...n.attributes].forEach(a => n.removeAttribute(a.name));
    keep.forEach(([k, v]) => n.style.setProperty(k, v));
  });
  return root.innerHTML;
}

/* 공지 내용을 화면에 띄울 HTML. 글을 그대로 innerHTML에 넣는 자리가 쓴다(어드민 편집기, 학생 모달).
   **글 하나를 통째로 받는다**(내용 글자만이 아니라). 서식이 든 글인지를 글자를 뜯어 보고 짐작하지 않고
   글에 붙은 bodyRich 표시로 가리기 때문이다.
     bodyRich 있음  편집기로 쓴 글. 아는 태그만 남겨 그대로 띄운다
     bodyRich 없음  편집기가 생기기 전(2026-11-02 앞)에 올린 그냥 글자. escape하고 줄바꿈만 <br>로
   처음에는 "글 안에 태그처럼 보이는 것이 있는가"로 가렸는데, 그러면 선생님이 글자로 적어 둔
   "<b>" 같은 것이 든 옛 글이 서식 글로 오해받아 그 글의 **줄바꿈이 통째로 사라졌다**(저장하기 전에
   확인하다 잡았다). 표시로 가리면 그런 일이 없다: 옛 글에는 표시가 없고 표시는 저장할 때만 붙는다. */
export function noticeBodyHtml(notice){
  if (!notice) return '';
  const s = String(notice.body ?? '');
  if (!s) return '';
  if (!notice.bodyRich)
    return s.replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]))
            .replace(/\r?\n/g, '<br>');
  return sanitizeRich(s);
}

/* ── 공지사항 (선생님 지시 2026-10-30, 요구사항 109, 110, 115) ──
   어드민 공지사항 메뉴에서 쓰고, 학생 화면은 강의실 안 맨 위에 글 목록으로 띄운다(최대 5개, 더보기).
   **과목마다 따로다**(115): 학년도와 과목에 매인 글이라 그 과목 강의실(반) 전부에 같은 글이 뜬다.
   강의실마다 따로 쓰지는 않는다. 늘 최신순(createdAt 큰 것이 위). */
export function getNotices(year, subject){
  // 상단 고정(pinned)이 맨 위, 그 안에서 최신순(선생님 지시 2026-11-01).
  return DEMO.notices.filter(n => n.year === +year && n.subject === subject)
    .slice().sort((a, b) => (b.pinned === true) - (a.pinned === true) || (b.createdAt || 0) - (a.createdAt || 0));
}
export function getNotice(id){ return DEMO.notices.find(n => n.id === id) || null; }
export function addNotice(year, subject, { title, body }){
  const t = String(title ?? '').trim();
  if (!t) throw new Error('제목을 입력하시길 바랍니다.');
  if (!subject) throw new Error('과목을 골라 주세요.');
  // 내용은 서식이 든 HTML 조각이다. 저장 전에 아는 태그만 남기고(sanitizeRich) 서식 글이라는
  // 표시를 붙인다(bodyRich). 표시가 없는 글은 띄울 때 그냥 글자로 다룬다(2026-11-02)
  const n = { id:nid('n_'), year:+year, subject, title:t,
    body:sanitizeRich(body), bodyRich:true, createdAt:Date.now() };
  DEMO.notices.push(n); put(COLLECTIONS.notices, n); return n;
}
export function updateNotice(id, { title, body }){
  const n = getNotice(id); if (!n) throw new Error('글을 찾지 못했습니다.');
  const t = String(title ?? '').trim();
  if (!t) throw new Error('제목을 입력하시길 바랍니다.');
  n.title = t; n.body = sanitizeRich(body); n.bodyRich = true;
  put(COLLECTIONS.notices, n); return n;
}
export function deleteNotice(id){
  DEMO.notices = DEMO.notices.filter(n => n.id !== id);
  del(COLLECTIONS.notices, id);
  // 딸린 열람·좋아요·댓글도 같이 지운다(교사만 부른다)
  DEMO.noticeReads.filter(r => r.noticeId === id).forEach(r => del(COLLECTIONS.noticeReads, r.id));
  DEMO.noticeReads = DEMO.noticeReads.filter(r => r.noticeId !== id);
  DEMO.noticeComments.filter(c => c.noticeId === id).forEach(c => del(COLLECTIONS.noticeComments, c.id));
  DEMO.noticeComments = DEMO.noticeComments.filter(c => c.noticeId !== id);
}

/* ── 공지 소셜(선생님 지시 2026-11-01, 기존 lms 이식): 상단고정·좋아요·댓글·댓글막기·작성차단·조회수 ──
   학생은 Firebase Auth가 아니라서(커스텀 로그인) 좋아요/댓글은 비인증 쓰기다. 규칙이 필드를 검증한다.
   열람/좋아요 문서 id = 공지id_학번(한 학생당 하나). 댓글은 문서 하나가 한 건. */
const readId = (noticeId, studentNo) => `${noticeId}_${studentNo}`;
export function noticeStats(noticeId){
  const rs = DEMO.noticeReads.filter(r => r.noticeId === noticeId);
  return { reads: rs.length, likes: rs.filter(r => r.liked === true).length,
    comments: DEMO.noticeComments.filter(c => c.noticeId === noticeId).length };
}
export function getNoticeComments(noticeId){
  return DEMO.noticeComments.filter(c => c.noticeId === noticeId)
    .slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
export function isCommentBanned(studentNo){ return DEMO.noticeBans.some(b => b.id === String(studentNo)); }
export function isNoticeLiked(noticeId, studentNo){
  const r = DEMO.noticeReads.find(x => x.id === readId(noticeId, studentNo));
  return r ? r.liked === true : false;
}
// 학생: 글을 열면 열람 기록을 남긴다(이미 있으면 좋아요는 그대로 두고 readAt만 갱신)
export function markNoticeRead(noticeId, studentNo, name){
  const id = readId(noticeId, studentNo);
  let r = DEMO.noticeReads.find(x => x.id === id);
  if (!r){ r = { id, noticeId, studentNo:String(studentNo), name:String(name || ''), liked:false }; DEMO.noticeReads.push(r); }
  r.name = String(name || ''); r.readAt = Date.now();
  put(COLLECTIONS.noticeReads, r); return r;
}
// 학생: 좋아요 토글. 새 상태를 돌려준다
export function toggleNoticeLike(noticeId, studentNo, name){
  const id = readId(noticeId, studentNo);
  let r = DEMO.noticeReads.find(x => x.id === id);
  if (!r){ r = { id, noticeId, studentNo:String(studentNo), name:String(name || ''), liked:false }; DEMO.noticeReads.push(r); }
  r.liked = !r.liked; r.name = String(name || ''); r.likedAt = Date.now(); r.readAt = r.readAt || Date.now();
  put(COLLECTIONS.noticeReads, r); return r.liked;
}
// 학생: 댓글 달기(차단/댓글막기면 막는다)
export function addNoticeComment(noticeId, studentNo, name, text){
  const t = String(text ?? '').trim();
  if (!t) throw new Error('댓글을 입력해 주세요.');
  if (t.length > 300) throw new Error('댓글은 300자까지 쓸 수 있습니다.');
  if (isCommentBanned(studentNo)) throw new Error('댓글 작성이 제한된 학생입니다.');
  const n = getNotice(noticeId);
  if (n?.commentsOff) throw new Error('댓글을 받지 않는 글입니다.');
  const c = { id:nid('nc_'), noticeId, studentNo:String(studentNo), name:String(name || ''), text:t, createdAt:Date.now() };
  DEMO.noticeComments.push(c); put(COLLECTIONS.noticeComments, c); return c;
}
// 댓글 삭제(교사, 또는 글쓴이 본인)
export function deleteNoticeComment(id){
  DEMO.noticeComments = DEMO.noticeComments.filter(c => c.id !== id);
  del(COLLECTIONS.noticeComments, id);
}
// 교사: 상단 고정 토글
export function setNoticePinned(id, on){
  const n = getNotice(id); if (!n) return; n.pinned = !!on; put(COLLECTIONS.notices, n); return n;
}
// 교사: 댓글 막기 토글
export function setNoticeCommentsOff(id, on){
  const n = getNotice(id); if (!n) return; n.commentsOff = !!on; put(COLLECTIONS.notices, n); return n;
}
// 교사: 댓글 작성 차단 걸고/풀기
export function setCommentBan(studentNo, on){
  const id = String(studentNo);
  if (on){ if (!DEMO.noticeBans.some(b => b.id === id)){ const b = { id }; DEMO.noticeBans.push(b); put(COLLECTIONS.noticeBans, b); } }
  else { DEMO.noticeBans = DEMO.noticeBans.filter(b => b.id !== id); del(COLLECTIONS.noticeBans, id); }
}

/* ── 학생 로그인: 학번, 이름, 비밀번호 (선생님 지시 2026-10-28) ──────────────────
   Firebase Auth를 쓰지 않는다(2026-10-23 결정). course_auth 문서 { pw, courseId }를
   학년도_학번 id로 두고, 로그인 때만 그 한 건을 읽는다(통째로 불러오지 않는다).
   처음 온 학생(그 문서가 없음)은 비밀번호를 만드는 쪽으로, 그다음부터는
   비밀번호를 맞혀야 들어오는 쪽으로 index.js가 나눠 보낸다.

   필드 이름과 문서 모양은 hoistory의 firestore.rules가 이미 정해 둔 것을 그대로 따른다
   (create 전용, hoistory/firestore.rules 506~516행): `keys().hasOnly(['pw','courseId'])`,
   `pw`는 `^[0-9a-f]{64}$`, `onYearRoster(id, courseId)`가 그 학번이 courseId 강의실
   명단(course_students)에 있고 그 강의실이 이 학년도인지를 본다. 필드 이름이나 모양을
   바꾸면 규칙에 막혀 학생이 비밀번호를 아예 못 만든다. */
async function sha256Hex(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// 그 학년도에 든 강의실 중 한 곳이라도 명단 이름이 같으면 통과
export function matchesRosterName(year, studentNo, name){
  const nm = String(name ?? '').trim(); if (!nm) return false;
  return getCoursesOfStudent(year, studentNo)
    .some(c => DEMO.students.find(s => s.courseId === c.id && s.studentNo === studentNo)?.name === nm);
}
export async function getAuthRecord(year, studentNo){
  const snap = await getDoc(doc(db, COLLECTIONS.courseAuth, `${year}_${studentNo}`));
  return snap.exists() ? snap.data() : null;
}
// 처음 한 번만 만든다(이미 있으면 안 덮어쓴다: 비번 초기화는 어드민의 다음 단계).
// courseId는 그 학번이 든 강의실 중 아무 곳(규칙은 명단에 있는지만 본다).
export async function createPassword(year, studentNo, password, courseId){
  const id = `${year}_${studentNo}`;
  if (await getAuthRecord(year, studentNo)) throw new Error('이미 비밀번호가 있습니다.');
  await setDoc(doc(db, COLLECTIONS.courseAuth, id), { pw: await sha256Hex(password), courseId });
}
export async function verifyPassword(year, studentNo, password){
  const rec = await getAuthRecord(year, studentNo);
  return !!rec && rec.pw === await sha256Hex(password);
}
/* 비밀번호 초기화(어드민): course_auth 문서를 지워 학생이 다음 로그인 때 다시 만들게 한다.
   비밀번호를 잊은 학생을 선생님이 풀어 주는 길이다(2026-10-29: 초기화 살리기).
   규칙(hoistory/firestore.rules course_auth)이 `allow update, delete: if isAdmin()`이라
   로그인한 선생님은 지울 수 있다. 혹시 실패하면 화면이 오류를 안내한다. */
export async function resetPassword(year, studentNo){
  await deleteDoc(doc(db, COLLECTIONS.courseAuth, `${year}_${studentNo}`));
}
