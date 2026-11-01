// 2027 LMS 어드민: 제로베이스 뼈대 (2026-10-26)
// 왼쪽 메뉴는 model.js의 ADMIN_MENUS 한 곳에서 나온다.
// 가운데 넷(개념 노트 / 미션 활동 / 오늘의 질문 / 형성평가)은 강의 안 네 칸의 관리 화면이다(2026-10-27).
// 조직 원리: 강의실은 강의(차시)와 복습을 담고, 강의 하나는 개념 노트, 미션 활동, 오늘의 질문, 형성평가
//           네 칸을 각각 있거나 없거나로 채운다(순서 자유).
// 지금은 데모 데이터(model.js)로 돈다. 규칙: data-act + 위임, 상태는 state 하나,
// 알약 금지, 태그/카테고리는 구분선, 액션은 아이콘 버튼, 숫자 칸은 text+inputmode.

import * as M from './model.js?v=20261101a';
import { icon } from './shared/icons.js?v=20261031e';
import { buildSlides, renderSlide } from './slide-deck.js?v=20261101a';
import { auth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from './shared/fb.js?v=20261028a';

const YEAR = 2027;
const $side = document.getElementById('side');
const $main = document.getElementById('main');

const state = {
  page: 'rooms',
  year: YEAR,
  roomGroup: 'subject',            // 강의실 묶음 축: 'subject'(과목별) | 'class'(반별)
  fSubject: null, fClass: null,    // 강의실 관리 필터(과목 / 반)
  roomDetailId: null,              // 아래로 펼친 강의실(인라인 상세)
  roomLessonsMore: false,          // 강의 진도 30강 넘겨 더 보기
  openScore: null,                 // 상세를 펼친 학생 키(`강의실id_학번`)
  roomStudentEdit: false,          // 강의실 상세 명단 편집(체크 선택) 모드
  editRoomId: null,                // 그 자리에서 고치는 중인 강의실
  progSubject: null,               // 진도 관리에서 보고 있는 과목(탭)
  studentClass: 'all',             // 학생 관리 반 필터(roomNo)
  studentDetailNo: null,           // 아래로 펼친 학생(학번)
  studentQuery: '',                // 학생 관리 학번 검색어
  stuScoreCourseId: null,          // 학생 관리 상세에서 성적을 보는 과목(강의실 id)
  lessonId: null, lessonTab: 'edit',

  // 칸별 메뉴 넷 (2026-10-27)
  conceptTab: 'content',           // 개념 노트 서브 메뉴 'content' | 'design'
  conceptLessonId: null,           // 콘텐츠(축 편집기)에서 고른 강의
  axisStep: 'cover',               // 축 편집기에서 펼친 단계(shared/slide-axis.js의 key)
  pgCut: null,                     // 페이지 내용 칸에서 커서를 둔 자리 { id, k, p, r, line }(가위 단추가 쓴다)
  questionTab: 'manage',           // 오늘의 질문 서브 메뉴 'manage' | 'answers' | 'pick'
  questionSubject: null,           // 오늘의 질문 과목 탭(서브 메뉴 셋 공통)
  questionSel: null,               // 질문 관리에서 고른 강의(오른쪽 편집 칸)
  questionLessonId: null,          // 답변, 채점에서 고른 강의(lessons id)
  questionRoom: 'all',             // 답변, 채점에서 고른 반: 'all' 또는 강의실 id
  questionGradeTab: 'grade',       // 답변, 채점의 탭 'grade' | 'pass' | 'fail' (hoistory 채점 모달)
  questionAiBusy: false,           // AI 채점이 도는 중인가
  questionAiStatus: '',            // AI 채점 진행 문구
  formativeTab: 'manage',          // 서브 메뉴 'manage'(문제 관리) | 'result'(성취도 관리)
  formativeSubject: null,          // 과목 탭(오늘의 질문과 같이 과목 아래에서 움직인다)
  formativeLessonId: null,         // 문제 관리에서 문항을 편집 중인 강의
  fmNewType: null,                 // 문제 만들기에서 고른 유형(null이면 FORMATIVE_TYPES의 첫째)
  fmEditIdx: null,                 // 고치는 중인 문항 자리(null이면 새로 만드는 중)
  formativeResultId: null,         // 성취도 관리에서 고른 것: 강의 id 또는 FM_ALL(전체 누적)
  formativeRoom: 'all',            // 성취도 관리에서 고른 반: 'all' 또는 강의실 id
  missionSel: null,                // 미션 활동에서 고른 앱 키, 새로 만드는 중이면 'new'
  noticeSubject: null,             // 공지사항 과목 탭(과목마다 따로 쓴다)
  noticeSel: null,                 // 공지사항에서 고른 글 id, 새로 쓰는 중이면 'new'

  progAdding: false,               // 진도표에서 강의 추가 줄을 열었는가
  progMemoId: null,                // 진도표에서 메모를 적고 있는 강의(lessons id)

  // 일반 설정: 저장 버튼을 누르기 전까지 고친 것(메뉴를 옮겨 다시 그려도 적던 글이 남게)
  genDraft: null,                  // { 문구 키: 값 }
  menuDraft: null,                 // 메뉴 순서(구분선 포함)

  // 성적 (hoistory 성적 Check 틀 이식, 2026-10-28)
  scTab: 'input',                  // 서브 메뉴 'input' | 'setting' | 'view'
  scSubject: null,                 // 과목 탭
  scCourseId: null,                // 반 탭(강의실)
  scClId: null,                    // 성적 입력에서 고른 연결 강의
  scOpenNo: null,                  // 성적 조회에서 강의별 내역을 펼친 학생(학번)
};

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const val = id => (document.getElementById(id)?.value || '').trim();

/* 최신순 (선생님 지시 2026-10-30, 요구사항 112): "특정 정렬 조건이 없다면 무조건 최신순."
   연결 강의는 차수를 연결한 차례대로 매긴 다음 마지막 차수(가장 최근 강의)부터 늘어놓는다.
   돌려주는 것은 [{ x:원래 항목, no:차수 }]. 진도표와 성적 조회 표는 차수 순서 자체가 내용이라 쓰지 않는다. */
const numberedNewest = list => list.map((x, i) => ({ x, no:i + 1 })).reverse();

// 수업일자('M/D')의 과거/오늘/미래 판정은 model.js로 옮겼다(성적 기한 판정과 같은 함수를 쓴다).
const MAX_LESSONS = 30;            // 강의 진도에 한 번에 보여 줄 강의 수(요구사항 1)

// 넓은 화면(PC)에서는 강의실 관리, 학생 관리가 왼쪽 목록 + 오른쪽 상세 두 칸이 된다(선생님 지시 2026-10-29).
// 좁으면(패드, 폰) 목록 줄 아래로 펼친다. 폭이 바뀌어 넘나들면 다시 그린다.
const WIDE = matchMedia('(min-width:1100px)');
WIDE.addEventListener('change', () => { if (!document.getElementById('shell').hidden) render(); });

function boot(){
  const ok = getComputedStyle(document.documentElement).getPropertyValue('--lms-css-ok').trim() === '1';
  if (!ok){ document.getElementById('boot').textContent = '화면을 불러오지 못했습니다. 새로고침해 주세요.'; return; }
  document.documentElement.classList.add('lms-ready');
  if (!document.getElementById('toast')){
    const t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t);
  }
  // 로그인해야 Firestore에 쓸 수 있다(규칙 isAdmin). 로그인 전엔 로그인 화면만 보인다.
  onAuthStateChanged(auth, async user => {
    if (!user){ showLogin(); return; }
    document.getElementById('login')?.remove();
    document.getElementById('boot').textContent = '불러오는 중…';
    document.getElementById('boot').style.display = 'grid';
    try { await M.loadCore(); document.title = `${M.getText('browserTitle')} : 관리자 모드`; }
    catch(e){ console.error(e); toast('데이터를 불러오지 못했습니다.'); }
    document.getElementById('boot').style.display = 'none';
    document.getElementById('shell').hidden = false;
    render();
  });
}

// ── 어드민 로그인 화면 (Firebase Auth 이메일/비밀번호) ──
function showLogin(msg){
  document.getElementById('shell').hidden = true;
  document.getElementById('boot').style.display = 'none';
  let el = document.getElementById('login');
  if (!el){ el = document.createElement('div'); el.id = 'login'; document.body.appendChild(el); }
  el.innerHTML = `<form class="login-card" id="login-form">
    <h1>2027 관리자</h1>
    <label class="m-label">이메일</label>
    <input class="f" id="lg-email" type="email" autocomplete="username">
    <label class="m-label">비밀번호</label>
    <input class="f" id="lg-pw" type="password" autocomplete="current-password">
    <button class="btn-text" type="submit">로그인</button>
    <div class="m-err" id="lg-err">${esc(msg || '')}</div>
  </form>`;
  const form = el.querySelector('#login-form');
  el.querySelector('#lg-email').focus();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = el.querySelector('#lg-email').value.trim();
    const pw = el.querySelector('#lg-pw').value;
    const err = el.querySelector('#lg-err');
    err.textContent = '';
    try { await signInWithEmailAndPassword(auth, email, pw); }   // 성공하면 onAuthStateChanged가 화면을 바꾼다
    catch(_){ err.textContent = '이메일 또는 비밀번호를 확인해 주세요.'; }
  });
}

function toast(msg){
  const t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 1800);
}

/* 확인 창: 브라우저 기본 confirm을 쓰지 않는다(코드 규칙).
   되돌릴 수 없는 삭제에만 쓴다. 보통 입력은 인라인 폼으로 받는다(요구사항 66).
   needText를 주면 그 글자를 그대로 쳐야 확인 버튼이 켜진다(강의실 삭제, 화면 규칙 2026-10-25). */
function confirmDelete({ title, bodyHtml = '', needText = null, okText = '삭제' }){
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3>
      <div class="m-body">${bodyHtml}</div>
      ${needText ? `<input class="f" id="m-text" placeholder="${esc(needText)}" autocomplete="off">` : ''}
      <div class="m-err" id="m-err"></div>
      <div class="m-acts">
        <button class="btn-ghost" data-m="cancel">취소</button>
        <button class="btn-danger" data-m="ok" ${needText ? 'disabled' : ''}>${esc(okText)}</button>
      </div></div>`;
    document.body.appendChild(back);

    const ok = back.querySelector('[data-m="ok"]');
    const inp = back.querySelector('#m-text');
    const close = v => { document.removeEventListener('keydown', onKey); back.remove(); resolve(v); };
    const onKey = e => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter' && !ok.disabled) close(true);
    };
    if (inp){
      inp.addEventListener('input', () => { ok.disabled = inp.value.trim() !== needText; });
      inp.focus();
    } else ok.focus();
    back.addEventListener('click', e => {
      if (e.target === back) close(false);
      const b = e.target.closest('[data-m]'); if (!b) return;
      close(b.dataset.m === 'ok');
    });
    document.addEventListener('keydown', onKey);
  });
}

// model.js가 던지는 오류 메시지를 그대로 토스트로. 성공하면 다시 그린다.
function run(fn, okMsg){
  try { const r = fn(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); render(); return r; }
  catch (e){ toast(e.message); return null; }
}

// ── 사이드 ──
// 메뉴 이름, 순서, 구분선 자리는 일반 설정에서 정한다(M.adminMenus).
function renderSide(){
  $side.innerHTML = `<div class="brand">${esc(M.getText('adminName'))}</div>` + M.adminMenus().map(m =>
    m.sep ? `<div class="side-sep"></div>`
    : `<div class="mi ${m.key === state.page ? 'on':''}" data-act="page" data-k="${m.key}">
      ${icon(m.icon,18)}<span>${esc(m.name)}</span></div>`).join('') +
    `<div class="mi side-logout" data-act="logout">${icon('log-out',18)}<span>로그아웃</span></div>`;
}

// ── 카테고리 줄(구분선) ──
// extra를 주면 줄 오른쪽 끝에 붙는다(학년도 줄의 "학년도 만들기" 칸).
function catline(items, active, act, allLabel, extra = '', cls = ''){
  // data-label: 켜진 탭은 굵은 글씨다. 굵어져도 폭이 안 늘게 CSS가 이 글자로 굵은 폭을 미리 잡아 둔다.
  const all = allLabel ? `<button class="cat ${active==null||active==='all'?'on':''}" data-act="${act}" data-v="all" data-label="${esc(allLabel)}">${esc(allLabel)}</button>` : '';
  // it.cls: 그 탭에만 붙는 색 이름(통과 cat-pass, 미흡 cat-fail). 선생님 지시 2026-10-29.
  const rest = items.map(it => `<button class="cat ${it.cls || ''} ${String(active)===String(it.v)?'on':''}" data-act="${act}" data-v="${esc(it.v)}" data-label="${esc(it.label)}">${esc(it.label)}</button>`).join('');
  return `<div class="catline ${cls}">${all}${rest}${extra}</div>`;
}

// ── 강의실 관리 ──
// 머리줄: 제목 + 학년도 고르개(드롭다운) + 추가 버튼(팝업). 창 넓이는 admin.css에서.
// 생성(학년도, 강의실)은 전부 추가 버튼의 팝업에 모았다(요구사항 5). 필터는 과목 한 줄만
// 남기고(요구사항 4), 보이는 것은 늘 있는 과목만(요구사항 3). 목록은 과목, 학년, 반 순.
// 수정 중인 강의실 줄: 그 자리에서 입력 칸이 된다(인라인, 요구사항 66). 목록, 상세 공용.
function roomEditRow(c){
  return `<div class="row">
    <input class="f w-md" id="e-subject" value="${esc(c.subject)}">
    <input class="f w-sm" id="e-grade" inputmode="numeric" value="${c.grade}"><span class="unit">학년</span>
    <input class="f w-sm" id="e-class" inputmode="numeric" value="${c.classNo}"><span class="unit">반</span>
    <div class="grow"></div>
    <div class="tools">
      <button class="ib ib-primary" data-act="room-save" data-id="${c.id}" title="저장" aria-label="저장">${icon('check',16)}</button>
      <button class="ib" data-act="room-cancel" title="취소" aria-label="취소">${icon('x',16)}</button>
    </div></div>`;
}

function pageRooms(){
  const years = M.getYears();
  const addBtn = `<button class="btn-add" data-act="add-open" title="추가" aria-label="추가">${icon('plus',16)}<span>추가</span></button>`;

  if (!years.length)
    return `<div class="pagehead"><h2>${esc(M.menuName('rooms'))}</h2>${addBtn}</div>
      <div class="empty">학년도가 없습니다.</div>`;

  const courses = M.getCourses(state.year);
  const byClass = state.roomGroup === 'class';

  const yearSel = `<select class="sel" id="year-sel" data-act="year-pick" aria-label="학년도">
    ${years.map(y => `<option value="${y.year}" ${y.year===state.year?'selected':''}>${y.year}학년도</option>`).join('')}
  </select>`;
  const head = `<div class="pagehead"><h2>${esc(M.menuName('rooms'))}</h2>${yearSel}${addBtn}</div>`;

  // 묶음 축 토글(과목별/반별): 필터 줄 오른쪽 끝에.
  const groupToggle = `<span class="line-end"><span class="seg seg-inline">
    <button class="seg-b ${byClass?'':'on'}" data-act="room-group" data-v="subject">과목별</button>
    <button class="seg-b ${byClass?'on':''}" data-act="room-group" data-v="class">반별</button>
  </span></span>`;

  // 필터 탭: 축에 따라 과목 또는 반. 늘 있는 것만(요구사항 3). 정렬도 축에 맞춘다.
  let filterLine, list = courses.slice();
  if (byClass){
    const roomNos = [...new Set(courses.map(c => M.roomNo(c)))].sort();
    if (state.fClass && !roomNos.includes(state.fClass)) state.fClass = null;
    if (state.fClass) list = list.filter(c => M.roomNo(c) === state.fClass);
    list.sort((a,b) => a.grade - b.grade || a.classNo - b.classNo || a.subject.localeCompare(b.subject,'ko'));
    filterLine = catline(roomNos.map(rn => ({ v:rn, label:rn })), state.fClass, 'set-class', '전체', groupToggle);
  } else {
    const subjects = [...new Set(courses.map(c => c.subject))].sort((a,b) => a.localeCompare(b,'ko'));
    if (state.fSubject && state.fSubject !== 'all' && !subjects.includes(state.fSubject)) state.fSubject = null;
    if (state.fSubject && state.fSubject !== 'all') list = list.filter(c => c.subject === state.fSubject);
    list.sort((a,b) => a.subject.localeCompare(b.subject,'ko') || a.grade - b.grade || a.classNo - b.classNo);
    filterLine = catline(subjects.map(s => ({ v:s, label:s })), state.fSubject, 'set-subject', '전체', groupToggle);
  }

  // 누르면 그 자리에서 아래로 펼쳐진다(인라인 아코디언). 묶음은 구분선만(요구사항 3).
  const showRow = c => {
    const open = c.id === state.roomDetailId;
    const row = `<div class="row ${open?'on':''}">
      <div class="grow rowlink" data-act="room-open" data-id="${c.id}">
        <div class="t"><span class="chev">${icon(open?'chevron-down':'chevron-right',16)}</span>${esc(M.roomName(c))}</div></div>
      <div class="tools">
        <button class="ib" data-act="room-edit" data-id="${c.id}" title="수정" aria-label="수정">${icon('pencil',16)}</button>
        <button class="ib ib-danger" data-act="room-del" data-id="${c.id}" title="삭제" aria-label="삭제">${icon('trash-2',16)}</button>
      </div></div>`;
    return open ? row + roomDetailPanel(c) : row;
  };

  if (!list.length) return `${head}${filterLine}<div class="empty">강의실이 없습니다.</div>`;

  const keyOf = c => byClass ? M.roomNo(c) : c.subject;
  const grouped = rowOf => {
    const out = []; let last = null, first = true;
    list.forEach(c => {
      const key = keyOf(c);
      if (key !== last){ if (!first) out.push(`<div class="group-sep"></div>`); last = key; first = false; }
      out.push(rowOf(c));
    });
    return out.join('');
  };

  if (!WIDE.matches)
    return `${head}${filterLine}${grouped(c => c.id === state.editRoomId ? roomEditRow(c) : showRow(c))}`;

  // 넓은 화면: 왼쪽 목록에서 고르면 오른쪽 상세가 바뀐다. 수정, 삭제는 상세 머리에.
  if (!list.some(c => c.id === state.roomDetailId)) state.roomDetailId = list[0].id;
  const left = grouped(c => `<div class="row ${c.id===state.roomDetailId?'on':''}">
      <div class="grow rowlink" data-act="room-open" data-id="${c.id}"><div class="t">${esc(M.roomName(c))}</div></div></div>`);
  const c = M.getCourse(state.roomDetailId);
  const paneHead = c.id === state.editRoomId ? roomEditRow(c)
    : `<div class="pane-head"><h3>${esc(M.roomName(c))}</h3><div class="tools">
        <button class="ib" data-act="room-edit" data-id="${c.id}" title="수정" aria-label="수정">${icon('pencil',16)}</button>
        <button class="ib ib-danger" data-act="room-del" data-id="${c.id}" title="삭제" aria-label="삭제">${icon('trash-2',16)}</button>
      </div></div>`;
  return `${head}${filterLine}<div class="split split-room"><div class="split-list">${left}</div>
    <div class="pane">${paneHead}<div class="two">${roomDetailCols(c)}</div></div></div>`;
}

/* 강의실 상세(요구사항 6): 줄 아래로 두 칸으로 펼쳐진다(요구사항 1).
   왼쪽: 강의 진도(강의차수, 제목, 수업일자, 최대 30강, 넘으면 더보기, 요구사항 1, 2).
   오른쪽: 학생 전원. 이름을 누르면 그 학생의 레벨, 경험치, 포트폴리오 성적이 펼쳐진다(요구사항 3). */
/* 강의 진도 줄 끝의 바로가기 둘(선생님 지시 2026-10-29).
   미션 활동: 이 강의에 연결한 앱의 어드민 탭을 연다. 연결한 앱이 없으면 눌리지 않는다(선생님 지시 2026-10-29).
   오늘의 질문: 이 강의, 이 반의 답변 화면으로 간다. 이 강의에 오늘의 질문이 없으면 눌리지 않는다. */
function lessonJumpBtns(c, cl){
  const app = M.getMissionApps().find(a => a.lessonId === cl.lessonId);
  const hasQ = !!M.getLesson(cl.lessonId)?.parts?.question;
  return `<button class="ib ib-sm" data-act="cl-mission" data-lid="${cl.lessonId}" ${app?'':'disabled'}
      title="${app ? `미션 활동 열기: ${esc(app.name)}` : '이 강의에 연결한 미션 활동이 없습니다.'}" aria-label="미션 활동">${icon(M.partDef('mission').icon,14)}</button>
    <button class="ib ib-sm" data-act="cl-question" data-id="${c.id}" data-lid="${cl.lessonId}" ${hasQ?'':'disabled'}
      title="${hasQ ? '오늘의 질문 답변 보기' : '이 강의에는 오늘의 질문이 없습니다.'}" aria-label="오늘의 질문 답변">${icon('message-square',14)}</button>`;
}

function roomDetailPanel(c){
  return `<div class="detail two">${roomDetailCols(c)}</div>`;
}
// 상세의 두 칸(강의 진도, 학생 명단). 좁은 화면의 펼침과 넓은 화면의 오른쪽 상세가 같이 쓴다.
function roomDetailCols(c){
  const students = M.getStudentsByCourse(c.id).slice().sort((a,b) => a.studentNo.localeCompare(b.studentNo));
  const lessons = M.getCourseLessons(c.id);          // order 순, 수업일자(date) 포함

  // ── 왼쪽: 강의 진도 ── 최신 강의가 맨 위(요구사항 112). 더보기는 그 아래 옛 강의를 편다
  const newest = numberedNewest(lessons);
  const shown = state.roomLessonsMore ? newest : newest.slice(0, MAX_LESSONS);
  const lessonRows = lessons.length ? shown.map(({ x:cl, no }) => {
    const st = M.dateStatus(cl.date);
    return `<div class="row compact plrow">
      <div class="plnum">${lnumPlain(cl.lesson, no)}</div>
      <div class="grow"><div class="t" title="${esc(cl.lesson?.title || '')}">${esc(cl.lesson?.title || '(삭제된 강의)')}</div></div>
      <input class="f dateinput ds-${st}" data-act="cl-date" data-id="${cl.id}" value="${esc(cl.date || '')}" inputmode="numeric" aria-label="수업일자">
      <button class="ib ib-sm ${cl.isOpen?'ib-primary':''}" data-act="cl-open" data-id="${cl.id}" title="${cl.isOpen?'공개 중 (누르면 숨김)':'숨김 (누르면 공개)'}" aria-label="공개 전환">${icon('eye',14)}</button>
      ${lessonJumpBtns(c, cl)}
    </div>`;
  }).join('') : `<div class="empty">개설된 강의가 없습니다.</div>`;
  const moreBtn = (!state.roomLessonsMore && lessons.length > MAX_LESSONS)
    ? `<button class="btn-link morebtn" data-act="room-lessons-more">더보기 (${lessons.length - MAX_LESSONS}강)</button>` : '';
  const left = `<div class="dcol">
    <div class="sectionlabel between">강의 진도<button class="btn-link" data-act="go-progress" data-id="${c.id}">진도 관리</button></div>
    <div class="dscroll">${lessonRows}${moreBtn}</div></div>`;

  // ── 오른쪽: 학생 명단 ──
  // 편집을 누르면 그 반(학번 앞 세 자리) 학생이 전부 뜨고, 체크가 곧 이 강의실 등록 여부다(선생님 지시 2026-10-29).
  // 등록 안 된 학생은 흐린 이름으로 같이 떠서 체크 한 번으로 다시 등록한다. 체크는 체크박스를 눌러야만 바뀌고
  // (줄이나 이름을 눌러도 안 바뀐다), 해제할 때는 확인 창을 한 번 더 띄운다(change 이벤트의 enroll 처리).
  const editing = state.roomStudentEdit;
  if (editing){
    const enrolled = new Set(students.map(s => s.studentNo));
    const roster = new Map(students.map(s => [s.studentNo, s.name]));
    M.getStudentsByYear(state.year).forEach(s => {
      if (s.studentNo.slice(0,3) === M.roomNo(c) && !roster.has(s.studentNo)) roster.set(s.studentNo, s.name);
    });
    const rows = [...roster].sort((a,b) => a[0].localeCompare(b[0])).map(([no, name]) => {
      const on = enrolled.has(no);
      return `<div class="row compact selrow ${on?'':'off'}">
        <input type="checkbox" data-act="enroll" data-id="${c.id}" data-no="${no}" ${on?'checked':''}
          aria-label="${esc(name)} ${on?'등록됨':'등록 안 됨'}">
        <span class="grow"><span class="t"><span class="mono">${esc(no)}</span> &nbsp;${esc(name)}</span></span></div>`;
    }).join('') || `<div class="empty">학생이 없습니다.</div>`;
    return left + `<div class="dcol"><div class="sectionlabel between">학생 명단
      <button class="btn-link" data-act="stu-edit-done">완료</button></div>
      <div class="dscroll">${rows}</div></div>`;
  }

  const stuRows = students.length ? students.map(s => {
    const open = state.openScore === `${c.id}_${s.studentNo}`;
    const row = `<div class="row compact rowlink" data-act="stu-score" data-no="${s.studentNo}" data-id="${c.id}">
      <div class="grow"><div class="t"><span class="chev">${icon(open?'chevron-down':'chevron-right',14)}</span><span class="mono">${esc(s.studentNo)}</span> &nbsp;${esc(s.name)}</div></div></div>`;
    return open ? row + studentCard(c.id, s.studentNo) : row;
  }).join('') : `<div class="empty">학생이 없습니다.</div>`;

  const stuHead = `<div class="sectionlabel between">학생 명단
         <span class="sec-acts">
           <button class="btn-link" data-act="stu-edit-mode">편집</button>
           <button class="btn-link" data-act="go-students" data-id="${c.id}">학생 관리</button>
         </span></div>`;

  const right = `<div class="dcol">${stuHead}<div class="dscroll">${stuRows}</div></div>`;

  return left + right;
}

// 한 학생 카드: 포트폴리오 성적(펼침 안쪽, 요구사항 3).
// 레벨, 경험치, 포인트 칸은 선생님 지시로 뺐다(2026-10-29).
function studentCard(courseId, studentNo){
  const sc = M.studentGrade(courseId, studentNo);

  let port;
  if (!sc.has){ port = `<div class="score-empty">반영된 강의가 없습니다.</div>`; }
  else {
    const lines = M.GRADE_AREAS.map(a => {
      const it = sc.areas[a.key];
      const detail = it.total ? `${it.score}점 <span class="gsub">${it.achieved}/${it.total} ${it.pct}%</span>` : '미실시';
      return `<div class="score-line"><span>${esc(a.name)}</span><span class="mono">${detail}</span></div>`;
    }).join('');
    const tot = `<div class="score-line tot"><span>총점</span><span class="mono">${sc.total} / ${sc.maxScore}점</span></div>`;
    port = lines + tot;
  }
  return `<div class="score-detail">
    <div class="sc-port"><div class="sc-k">포트폴리오 성적</div>${port}</div>
    <div class="sc-auth"><button class="btn-chip" data-act="stu-pw-reset" data-no="${studentNo}" data-name="${esc(M.getStudentsByCourse(courseId).find(s => s.studentNo === studentNo)?.name || '')}">${icon('rotate-ccw',13)}비밀번호 초기화</button></div>
  </div>`;
}

/* ── 진도 관리 (hoistory/lms "설정 - SCHEDULE 반별 수업 스케줄" 틀 이식) ─────
   선생님 지시 2026-10-28: "hoistory/lms의 진도 관리 메뉴를 차용해서 가지고 와 줘."
   hoistory 틀을 그대로 옮긴 것:
     - 머리줄 두 줄: 위는 반, 아래는 그 반의 수업 요일(자유 입력, courses.schedule)
     - 왼쪽 두 열: 강의 번호와 주제. 주제는 그 자리에서 고치면 강의 제목이 바뀐다
     - 가운데: 반마다 수업일자('M/D'). 오늘과 지난 날은 색으로 구분한다
     - 오른쪽 관리 열: 그 줄(강의)을 그 과목 강의실 전부에서 뺀다
     - 툴바의 [강의 추가]: 한 줄을 더하면 **그 과목 강의실 전부에 같이 연결된다**
   hoistory에서 안 가져온 것:
     [번호 자동 채우기]와 [주제 새로고침]은 hoistory가 번호와 주제를 손으로 적어
     따로 맞춰 줘야 했기 때문에 있던 단추다. 2027은 번호가 연결한 순서에서 저절로 나오고
     주제가 강의 제목 그 자체라 맞출 것이 없다.
   과목 탭은 어제 지시(요구사항 96)대로 그대로 둔다. */
/* 강의실들에 깔린 강의를 모은다: 어느 반에든 연결돼 있으면 한 줄이 선다.
   세우는 차례는 연결한 순서(order)가 가장 앞인 것 기준이다(반마다 순서가 어긋나도 한 줄로 선다).
   진도 관리와 질문 관리가 같이 쓴다. */
function placedLessons(rooms){
  const placed = {};                     // 강의실id -> 연결 강의 배열
  const firstOrder = new Map();          // 강의id -> 가장 앞선 order
  rooms.forEach(c => {
    placed[c.id] = M.getCourseLessons(c.id);
    placed[c.id].forEach(cl => {
      const cur = firstOrder.get(cl.lessonId);
      if (cur == null || cl.order < cur) firstOrder.set(cl.lessonId, cl.order);
    });
  });
  const lessons = M.getLessons()
    .filter(l => firstOrder.has(l.id))
    .sort((a,b) => firstOrder.get(a.id) - firstOrder.get(b.id));
  return { placed, lessons };
}

function pageProgress(){
  const years = M.getYears();
  const yearSel = `<select class="sel" id="year-sel" data-act="year-pick" aria-label="학년도">
    ${years.map(y => `<option value="${y.year}" ${y.year===state.year?'selected':''}>${y.year}학년도</option>`).join('')}
  </select>`;
  const head = `<div class="pagehead"><h2>${esc(M.menuName('progress'))}</h2>${years.length?yearSel:''}</div>`;
  if (!years.length) return `${head}<div class="empty">학년도가 없습니다.</div>`;

  const all = M.getCourses(state.year);
  if (!all.length) return `${head}<div class="empty">강의실이 없습니다.</div>`;

  // 과목 탭에서 그 과목의 반 탭으로 좁힌다. 둘 다 있는 것만(요구사항 3).
  const subjects = [...new Set(all.map(c => c.subject))].sort((a,b) => a.localeCompare(b,'ko'));
  if (!subjects.includes(state.progSubject)) state.progSubject = subjects[0];
  // hoistory의 [+ 강의 추가]는 과목 탭 줄 오른쪽 끝에 둔다(선생님 지시 2026-10-29).
  // 누르면 줄 아래에 제목 입력 줄이 열린다(요구사항 66 인라인).
  const addBtn = `<span class="line-end"><button class="btn-chip" data-act="prog-add-open">${icon('plus',13)}강의</button></span>`;
  const tabs = catline(subjects.map(s => ({ v:s, label:s })), state.progSubject, 'prog-subject', '', addBtn);

  const rooms = all.filter(c => c.subject === state.progSubject)
    .slice().sort((a,b) => a.grade - b.grade || a.classNo - b.classNo);

  const { placed, lessons } = placedLessons(rooms);
  const addRow = state.progAdding ? `<div class="row">
    <input class="f" id="prog-new-num" autocomplete="off" aria-label="강 번호" style="max-width:88px">
    <input class="f grow" id="prog-new-title" autocomplete="off" aria-label="강의 제목">
    <span class="unit">${esc(state.progSubject)} 강의실 ${rooms.length}개에 같이 연결합니다</span>
    <div class="tools">
      <button class="ib ib-primary" data-act="prog-add-save" title="추가" aria-label="추가">${icon('check',16)}</button>
      <button class="ib" data-act="prog-add-cancel" title="취소" aria-label="취소">${icon('x',16)}</button>
    </div></div>` : '';

  if (!lessons.length)
    return `${head}${tabs}${addRow}${addRow ? '' : `<div class="empty">개설된 강의가 없습니다.</div>`}`;

  // 머리줄 두 줄: 반 번호 / 그 반의 수업 요일
  const thead = `<tr>
      <th class="pl-num" rowspan="2">강의</th>
      <th class="lname" rowspan="2">주제</th>
      ${rooms.map(c => `<th title="${esc(M.roomName(c))}">${esc(M.roomNo(c))}</th>`).join('')}
      <th class="pl-manage" rowspan="2">관리</th>
    </tr>
    <tr>
      ${rooms.map(c => `<th class="pl-sch"><input class="f dateinput" data-act="prog-sch" data-id="${c.id}"
          value="${esc(c.schedule || '')}" aria-label="${esc(M.roomName(c))} 수업 요일"></th>`).join('')}
    </tr>`;

  const body = lessons.map((l, li) => {
    const cells = rooms.map(c => {
      const cl = placed[c.id].find(x => x.lessonId === l.id);
      if (!cl) return `<td class="na"><button class="pl-plus" data-act="prog-place" data-id="${c.id}" data-lid="${l.id}"
        title="${esc(M.roomName(c))}에 이 강의를 연결합니다" aria-label="연결">${icon('plus',12)}</button></td>`;
      const st = M.dateStatus(cl.date);
      return `<td class="ds-${st}"><input class="f dateinput" data-act="cl-date" data-id="${cl.id}"
        value="${esc(cl.date || '')}" inputmode="numeric" aria-label="${esc(M.roomName(c))} 수업일자"></td>`;
    }).join('');
    // 메모가 있으면 주제 칸에 마우스를 올릴 때 버블로 뜬다(data-memo, 아래 memo 버블).
    const row = `<tr>
      <td class="pl-num">${lnumPlain(l, li + 1)}</td>
      <td class="lname" ${l.memo ? `data-memo="${esc(l.memo)}"` : ''}><span class="lname-in">
        <input class="f" data-act="prog-topic" data-lid="${l.id}" value="${esc(l.title)}" aria-label="주제">
        ${l.memo ? `<span class="memo-mark" aria-label="메모 있음">${icon('file-text',14)}</span>` : ''}</span></td>
      ${cells}
      <td class="pl-manage"><span class="pl-tools">
        <button class="ib ib-sm" data-act="prog-memo" data-lid="${l.id}" title="메모" aria-label="메모">${icon('file-text',14)}</button>
        <button class="ib ib-sm ib-danger" data-act="prog-del" data-lid="${l.id}"
          title="이 줄을 과목 전체에서 빼기" aria-label="빼기">${icon('trash-2',14)}</button></span></td>
    </tr>`;
    // 메모 버튼을 누르면 그 줄 바로 아래에 메모 칸이 열린다(인라인, 요구사항 66).
    if (state.progMemoId !== l.id) return row;
    return row + `<tr class="pl-memo-row"><td colspan="${rooms.length + 3}"><div class="pl-memo">
      <textarea class="f" id="prog-memo-text" rows="3" aria-label="메모">${esc(l.memo || '')}</textarea>
      <div class="tools">
        <button class="ib ib-primary" data-act="prog-memo-save" data-lid="${l.id}" title="저장" aria-label="저장">${icon('check',16)}</button>
        <button class="ib" data-act="prog-memo-cancel" title="취소" aria-label="취소">${icon('x',16)}</button>
      </div></div></td></tr>`;
  }).join('');

  return `${head}${tabs}${addRow}
    <div class="prog-wrap"><table class="prog pltable">
      <thead>${thead}</thead><tbody>${body}</tbody>
    </table></div>`;
}

/* ── 성적 (hoistory/lms "성적 Check" 틀 이식) ───────────────────────────────
   선생님 지시 2026-10-28: 미션 활동, 오늘의 질문, 성적 전부 hoistory 기본 틀로.
   hoistory와 같이 서브 메뉴 셋으로 나눈다.
     성적 입력 : 강의를 고르고 불러오면 반 학생 표가 뜬다. 영역마다 달성 칸과 기한 칸을
                 체크한다. 미션 활동과 오늘의 질문은 제출물에서 자동으로 끌어오고(자동 감지),
                 교사가 누른 칸은 손으로 정한 것으로 표시돼 다시 끌어와도 덮이지 않는다.
                 이름을 누르면 결석(전부 미달성 고정). 끝에 피드백 칸과 템플릿 고르개.
                 영역 셋은 그 강의에 칸이 없어도 늘 선다: 제목 옆 스위치로 켜고 끈다
                 (선생님 지시 2026-10-28). 머리줄의 달성, 기한 체크표시는 그 열 전체를 켠다
     성적 설정 : 과목별로 성적에 반영할 강의 목록 + 포트폴리오 점수 급간 표 + 피드백 템플릿
     성적 조회 : 반별로 학생의 영역 점수, 달성률, 총점. 두 단이고 학생을 누르면 오른쪽에 강의별 내역
   계산은 model.js의 studentGrade 한 곳에서 한다(머리 주석 참고). */
function pageScores(){
  const years = M.getYears();
  const yearSel = `<select class="sel" id="year-sel" data-act="year-pick" aria-label="학년도">
    ${years.map(y => `<option value="${y.year}" ${y.year===state.year?'selected':''}>${y.year}학년도</option>`).join('')}
  </select>`;
  // 세 줄이던 고르개를 한 줄로 모았다(선생님 지시 2026-10-29).
  // 과목은 머리줄의 학년도 옆 드롭다운, 반은 카테고리 줄, 입력/설정/조회는 그 줄 오른쪽 끝 토글.
  const subSeg = `<span class="line-end"><span class="seg seg-inline">
    ${M.ADMIN_SUBMENUS.scores.map(t => `<button class="seg-b ${state.scTab===t.v?'on':''}" data-act="sc-tab" data-v="${t.v}">${esc(t.label)}</button>`).join('')}
  </span></span>`;
  if (!years.length) return `<div class="pagehead"><h2>${esc(M.menuName('scores'))}</h2></div><div class="empty">학년도가 없습니다.</div>`;

  const all = M.getCourses(state.year);
  if (!all.length) return `<div class="pagehead"><h2>${esc(M.menuName('scores'))}</h2>${yearSel}</div><div class="empty">강의실이 없습니다.</div>`;

  // 과목은 세 화면 공통이다(선생님 지시 2026-10-28: 성적 설정도 과목별로 뜨게).
  const subjects = [...new Set(all.map(c => c.subject))].sort((a,b) => a.localeCompare(b,'ko'));
  if (!subjects.includes(state.scSubject)) state.scSubject = subjects[0];
  const subjectSel = `<select class="sel" data-act="sc-subject-pick" aria-label="과목">
    ${subjects.map(s => `<option value="${esc(s)}" ${s===state.scSubject?'selected':''}>${esc(s)}</option>`).join('')}
  </select>`;
  const head = `<div class="pagehead"><h2>${esc(M.menuName('scores'))}</h2>${yearSel}${subjectSel}</div>`;

  const rooms = all.filter(c => c.subject === state.scSubject)
    .slice().sort((a,b) => a.grade - b.grade || a.classNo - b.classNo);

  // 성적 설정은 반을 고르지 않는다: 반영 강의와 급간 표는 과목 단위다. 줄에는 토글만 남는다.
  if (state.scTab === 'setting') return head + catline([], null, 'sc-room', '', subSeg) + scoreSettingPanel(rooms);

  if (!rooms.some(c => c.id === state.scCourseId)) state.scCourseId = rooms[0]?.id || null;
  const roomTabs = catline(rooms.map(c => ({ v:c.id, label:M.roomNo(c) })), state.scCourseId, 'sc-room', '', subSeg);

  const c = M.getCourse(state.scCourseId);
  if (!c) return `${head}${roomTabs}<div class="empty">강의실이 없습니다.</div>`;

  return head + roomTabs + (state.scTab === 'input' ? scoreInputPanel(c) : scoreViewPanel(c));
}

/* 성적 입력: 강의 고르개 줄(hoistory의 grade-config-card) + 통계 칩 + 학생 표.
   선생님 지시 2026-10-28로 셋을 고쳤다.
     1) 배수(1배, 2배) 고르개를 걷어내고 고르개 줄을 한 줄로 모았다
     2) 영역 셋(개념 노트, 미션 활동, 오늘의 질문)은 그 강의에 칸이 없어도 늘 선다.
        제목 옆 스위치로 켜고 끈다(끈 영역은 미실시, 적어 둔 내용은 되살려 둔다)
     3) 머리줄의 달성, 기한 옆 체크표시를 누르면 그 열이 모두 체크된다 */
function scoreInputPanel(c){
  const cls = M.getCourseLessons(c.id);
  if (!cls.length) return `<div class="empty">연결된 강의가 없습니다.</div>`;
  if (!cls.some(cl => cl.id === state.scClId)) state.scClId = cls[cls.length - 1].id;   // 처음엔 최신 강의
  const cl = cls.find(x => x.id === state.scClId);

  const lessonSel = `<select class="sel sel-lesson" data-act="sc-lesson" aria-label="강의">
    ${numberedNewest(cls).map(({ x, no }) => `<option value="${x.id}" ${x.id===state.scClId?'selected':''}>${lessonNo(x.lesson, no)} ${esc(x.lesson?.title || '(삭제된 강의)')}</option>`).join('')}
  </select>`;

  const students = M.getStudentsByCourse(c.id).slice().sort((a,b) => a.studentNo.localeCompare(b.studentNo));
  const nos = students.map(s => s.studentNo);
  const stats = M.gradeStats(cl.id, nos);
  const statChips = M.GRADE_AREAS.map(a => {
    const st = stats[a.key];
    return `<span class="gchip"><b>${esc(a.name)}</b>${st ? `${st.done} / ${st.all}` : '미실시'}</span>`;
  }).join('');

  const dateNote = cl.date
    ? `<span class="unit">수업일자 ${esc(cl.date)}</span>`
    : `<span class="unit">수업일자가 없어 기한을 따지지 않습니다</span>`;

  const pubBtn = `<button class="btn-chip ${cl.gradePublished?'on':''}" data-act="sc-publish" data-id="${cl.id}">
    ${icon(cl.gradePublished ? 'eye' : 'eye-off', 13)}${cl.gradePublished ? '반영 중' : '반영하기'}</button>`;
  const autoBtn = `<button class="btn-chip" data-act="sc-auto" data-id="${cl.id}">${icon('download',13)}자동 끌어오기</button>`;
  const inGrade = M.isGradeLesson(cl.lessonId);

  // 한 줄로 모았다(선생님 지시 2026-10-28). 반영 강의가 아닐 때만 오류 줄이 한 줄 더 선다.
  const bar = `<div class="gradebar">
    <div class="gradebar-line">${lessonSel}${dateNote}<div class="grow"></div>${autoBtn}${pubBtn}</div>
    ${inGrade ? '' : `<div class="m-err">이 강의는 성적 설정의 반영 강의 목록에 없어 최종 성적에 들어가지 않습니다.</div>`}
  </div>`;

  if (!students.length) return bar + `<div class="empty">학생이 없습니다.</div>`;

  // 영역 셋은 늘 다 선다. on이 꺼진 영역은 칸이 비고 체크를 못 한다(미실시).
  const areas = M.GRADE_AREAS.map(a => ({ ...a, on: !!M.partWeight(cl.lessonId, a.key) }));
  const recs = new Map(students.map(s => [s.studentNo, M.gradeRec(cl.id, s.studentNo)]));
  const auto = M.autoDetect(cl.id);
  const templates = M.getFeedbackTemplates();

  // 제목 옆 스위치로 그 강의의 칸을 켜고 끈다(그 강의를 연결한 모든 강의실에 같이 걸린다).
  const head1 = areas.map(a => `<th colspan="2" class="ga-${a.key} ${a.on?'':'ga-off'}">
      <span class="gahead">${esc(a.name)}
        <button class="sw sw-sm ${a.on?'on':''}" role="switch" aria-checked="${a.on}"
          data-act="sc-part-enable" data-lid="${cl.lessonId}" data-k="${a.key}"
          title="${esc(a.name)} ${a.on?'비활성화':'활성화'}" aria-label="${esc(a.name)} 활성화, 비활성화"><i></i></button>
      </span></th>`).join('');

  // 둘째 줄: 달성, 기한 옆 체크표시. 누르면 그 열의 모든 학생이 한 번에 체크된다.
  const colHead = (a, field, label) => {
    const on = a.on && students.every(st => {
      const g = recs.get(st.studentNo);
      return g.absent || (g[a.key]?.[field] || 0) >= 1;
    });
    return `<th class="ga-${a.key} ${a.on?'':'ga-off'}">
      <label class="colall">${label}<input type="checkbox" class="gcb" data-act="sc-col-all"
        data-id="${cl.id}" data-k="${a.key}" data-f="${field}" ${on?'checked':''} ${a.on?'':'disabled'}></label></th>`;
  };
  const head2 = areas.map(a => colHead(a, 'achievedN', '달성') + colHead(a, 'onTimeN', '기한')).join('');

  const body = students.map(s => {
    const g = recs.get(s.studentNo);
    const live = areas.filter(a => a.on);
    const rowAll = live.length > 0 &&
      live.every(a => (g[a.key]?.achievedN||0) >= 1 && (g[a.key]?.onTimeN||0) >= 1);
    const cells = areas.map(a => ['achievedN', 'onTimeN'].map(field =>
      `<td class="ga-${a.key} ${a.on?'':'ga-off'}">${a.on ? `<input type="checkbox" class="gcb" data-act="sc-cell" data-id="${cl.id}"
         data-no="${s.studentNo}" data-k="${a.key}" data-f="${field}" data-i="0"
         ${(g[a.key]?.[field]||0) >= 1 ? 'checked' : ''} ${g.absent ? 'disabled' : ''}>` : ''}</td>`).join('')).join('');
    const note = M.GRADE_AREAS.map(a => {
      const v = auto[s.studentNo]?.[a.key]; if (!v) return '';
      const manual = g.manual?.[a.key];
      return `<span class="gnote ${manual?'muted':''}" title="${manual?'손으로 정한 칸이라 자동 감지가 덮지 않습니다':'자동 감지 결과'}">${esc(v.note)}</span>`;
    }).filter(Boolean).join('');
    // 피드백 칸 옆 고르개: 템플릿을 고르면 그 글이 칸에 들어간다(선생님 지시 2026-10-28).
    // 글자 없이 화살표만 있는 드롭다운 단추다(선생님 지시 2026-10-29). 템플릿이 없으면 눌리지 않는다.
    const fbPick = `<select class="sel sel-sm fbpick" data-act="sc-fb-pick"
        data-id="${cl.id}" data-no="${s.studentNo}" aria-label="피드백 템플릿" ${templates.length?'':'disabled'}
        title="${templates.length?'피드백 템플릿':'성적 설정에서 피드백 템플릿을 적으면 고를 수 있습니다.'}">
        <option value=""></option>
        ${templates.map((t, i) => `<option value="${i}">${esc(t)}</option>`).join('')}</select>`;
    return `<tr class="${g.absent?'absent':''}">
      <td class="lname">
        <input type="checkbox" class="gcb" data-act="sc-row-all" data-id="${cl.id}" data-no="${s.studentNo}"
          ${rowAll?'checked':''} ${g.absent?'disabled':''} title="이 학생의 달성과 기한을 한 번에">
        <span class="mono">${esc(s.studentNo)}</span>
        <button class="gname" data-act="sc-absent" data-id="${cl.id}" data-no="${s.studentNo}"
          title="누르면 결석으로 표시하고 해제합니다">${esc(s.name)}</button>
        ${g.absent ? `<span class="gnote">결석</span>` : ''}
      </td>
      ${cells}
      <td class="gauto">${note}</td>
      <td class="gfb"><div class="fbcell"><input class="f" data-act="sc-feedback" data-id="${cl.id}" data-no="${s.studentNo}"
        value="${esc(g.feedback || '')}" aria-label="피드백">${fbPick}</div></td>
    </tr>`;
  }).join('');

  return bar + `<div class="gstats">${statChips}</div>
    <div class="prog-wrap"><table class="prog gradetable">
      <thead>
        <tr><th class="lname" rowspan="2">학생</th>${head1}<th rowspan="2">자동 감지</th><th class="gfb" rowspan="2">피드백</th></tr>
        <tr>${head2}</tr>
      </thead><tbody>${body}</tbody></table></div>`;
}

/* 성적 설정: 과목별 반영 강의 목록 + 포트폴리오 점수 급간 표 + 피드백 템플릿.
   급간 표와 템플릿은 과목을 가리지 않고 하나다(hoistory grade_settings/config 그대로).
   반영 강의 목록만 과목 탭에 따라 달라진다(선생님 지시 2026-10-28). */
function scoreSettingPanel(rooms){
  const { lessons } = placedLessons(rooms);
  const picked = new Set(M.getGradeLessons());
  const list = lessons.length ? numberedNewest(lessons).map(({ x:l, no }) => {
    const on = picked.has(l.id);
    const parts = M.GRADE_AREAS.filter(a => M.partWeight(l.id, a.key)).map(a => a.name).join(', ');
    return `<label class="row compact selrow ${on?'on':''}">
      <input type="checkbox" data-act="sc-pick-lesson" data-lid="${l.id}" ${on?'checked':''}>
      <span class="grow"><span class="t">${lessonNo(l, no)} ${esc(l.title)}</span>
        ${parts ? `<span class="s">${esc(parts)}</span>` : `<span class="s">성적에 드는 칸이 없습니다.</span>`}</span></label>`;
  }).join('') : `<div class="empty">깔린 강의가 없습니다.</div>`;

  const bands = M.getBands();
  const rows = bands.map((b, i) => {
    const next = i === 0 ? 100 : bands[i-1].min;
    const label = i === 0 ? `${b.min}% 이상` : `${b.min} ~ ${next}%`;
    const box = k => `<td class="num"><input class="f dateinput" data-band="${i}" data-k="${k}"
      value="${+b[k] || 0}" inputmode="numeric" aria-label="${label} ${esc(M.GRADE_AREAS.find(a=>a.key===k).name)} 점수"></td>`;
    return `<tr><td class="lname">${label}</td>${M.GRADE_AREAS.map(a => box(a.key)).join('')}</tr>`;
  }).join('');
  const top = bands[0] || {};
  const full = M.GRADE_AREAS.reduce((n, a) => n + (+top[a.key] || 0), 0);

  // 피드백 템플릿: 한 줄에 하나. 성적 입력의 피드백 칸 옆 고르개가 이 목록을 쓴다.
  const tmpl = `<div class="sectionlabel between">피드백 템플릿
      <button class="btn-link" data-act="sc-fb-save">저장</button></div>
    <textarea class="f fbtmpl" id="sc-fb-tmpl" rows="6" aria-label="피드백 템플릿">${esc(M.getFeedbackTemplates().join('\n'))}</textarea>`;

  return `<div class="sectionlabel">성적에 반영할 강의</div>${list}
    <div class="sectionlabel between">포트폴리오 점수 급간
      <button class="btn-link" data-act="sc-config-save">저장</button></div>
    <div class="prog-wrap"><table class="prog bandtable">
      <thead><tr><th class="lname">달성률</th>${M.GRADE_AREAS.map(a => `<th class="num">${esc(a.name)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td class="lname">만점</td><td class="num" colspan="${M.GRADE_AREAS.length}">${full}점</td></tr></tfoot>
    </table></div>` + tmpl;
}

/* 성적 조회: 반별로 학생의 영역 점수와 총점. 학생을 누르면 강의별 내역이 뜬다.
   두 단(선생님 지시 2026-10-29): 왼쪽은 표, 오른쪽은 고른 학생의 강의별 OX를 세로로 길게.
   표 내용은 전부 가운데 정렬이고, 오른쪽 칸은 강의 차수만 적어(제목은 빼고) 좁게 둔다.
   좁은 화면에서는 전처럼 그 줄 아래로 펼친다. */
function scoreViewPanel(c){
  const students = M.getStudentsByCourse(c.id).slice().sort((a,b) => a.studentNo.localeCompare(b.studentNo));
  if (!students.length) return `<div class="empty">학생이 없습니다.</div>`;
  const picked = M.getGradeLessons();
  if (!picked.length)
    return `<div class="empty">성적 설정에서 반영할 강의를 먼저 고르시길 바랍니다.</div>`;
  // 넓은 화면에서는 오른쪽 칸이 늘 하나 떠 있어야 하므로 고른 학생이 없으면 맨 위 학생을 고른다.
  if (!students.some(s => s.studentNo === state.scOpenNo))
    state.scOpenNo = WIDE.matches ? students[0].studentNo : null;

  const th = M.GRADE_AREAS.map(a => `<th class="num">${esc(a.name)}</th>`).join('');
  const body = students.map(s => {
    const g = M.studentGrade(c.id, s.studentNo);
    const open = state.scOpenNo === s.studentNo;
    // 점수는 크고 뚜렷하게, 달성률은 그 아래에 깐다(선생님 지시 2026-10-29)
    const cells = M.GRADE_AREAS.map(a => {
      const it = g.areas[a.key];
      return `<td class="num">${it.total
        ? `<span class="scnum">${it.score}</span><span class="gsub blk">${it.achieved}/${it.total} ${it.pct}%</span>`
        : '<span class="gsub">미실시</span>'}</td>`;
    }).join('');
    const row = `<tr class="scrow ${open?'on':''}" data-act="sc-open" data-no="${s.studentNo}">
      <td class="lname">${WIDE.matches ? '' : `<span class="chev">${icon(open?'chevron-down':'chevron-right',14)}</span>`}
        <span class="mono">${esc(s.studentNo)}</span> &nbsp;${esc(s.name)}</td>
      ${cells}<td class="num tot"><span class="scnum">${g.total}</span><span class="gsub blk">/ ${g.maxScore}</span></td></tr>`;
    // 좁은 화면만 줄 아래로 펼친다(넓은 화면은 오른쪽 칸이 받는다)
    return (open && !WIDE.matches) ? row + `<tr class="sc-lines"><td colspan="${M.GRADE_AREAS.length + 2}">
      <div class="detail">${scoreLines(g)}</div></td></tr>` : row;
  }).join('');

  const label = `<div class="sectionlabel">${esc(M.roomName(c))} 포트폴리오 성적</div>`;
  const table = `<div class="prog-wrap"><table class="prog scoretable">
      <thead><tr><th class="lname">학생</th>${th}<th class="num">총점</th></tr></thead>
      <tbody>${body}</tbody></table></div>`;
  if (!WIDE.matches) return label + table;

  const sel = students.find(s => s.studentNo === state.scOpenNo);
  const g = M.studentGrade(c.id, sel.studentNo);
  return label + `<div class="split split-scview">
      <div class="split-list">${table}</div>
      <div class="pane"><div class="pane-head"><h3>${esc(sel.name)}</h3></div>
        <div class="dscroll">${scoreLines(g)}</div></div></div>`;
}

/* 강의별 내역: 어디서 깎였는지 그대로 보인다(hoistory 2026-09-03과 같은 뜻).
   영역마다 표 하나다(선생님 지시 2026-10-29: "개념 미션 질문을 3개 표로 나누면 될거같아
   저렇게 나열식으로 하지말고"). 표마다 위에 영역 이름을 표제목으로 달고, 줄은 강의 차수,
   칸은 달성과 기한의 OX다. 강의 제목은 빼므로(같은 지시) 좁은 칸에도 들어간다.
   O는 초록, X는 빨강(판정 두 색과 같다). 피드백은 영역에 매이지 않아 맨 아래 따로 모은다. */
function scoreLines(g){
  if (!g.rows.length) return `<div class="empty">반영된 강의가 없습니다.</div>`;
  const mark = (n, w) => n >= w
    ? '<span class="ox good">O</span>'
    : (n > 0 ? '<span class="ox half">△</span>' : '<span class="ox bad">X</span>');
  const tables = M.GRADE_AREAS.map(a => {
    const head = `<div class="sectionlabel">${esc(a.name)}</div>`;
    const rows = g.rows.filter(r => r.areas[a.key]);
    if (!rows.length) return head + `<div class="empty">미실시</div>`;
    const body = rows.map(r => {
      const v = r.areas[a.key];
      return `<tr><td class="no">${lnumPlain(r, r.no)}</td>` + (r.absent
        ? `<td colspan="2"><span class="gnote bad">결석</span></td>`
        : `<td>${mark(v.achievedN, v.weight)}</td><td>${mark(v.onTimeN, v.weight)}</td>`) + `</tr>`;
    }).join('');
    return head + `<table class="prog oxtable">
      <thead><tr><th class="no">강의</th><th>달성</th><th>기한</th></tr></thead>
      <tbody>${body}</tbody></table>`;
  }).join('');
  const fb = g.rows.filter(r => r.feedback);
  if (!fb.length) return tables;
  return tables + `<div class="sectionlabel">피드백</div>` + fb.map(r => `<div class="row compact scvrow">
      <div class="plnum">${lnumPlain(r, r.no)}</div><div class="grow"><div class="s">${esc(r.feedback)}</div></div></div>`).join('');
}

/* 추가 팝업: 학년도 생성 / 강의실 생성을 한곳에 모았다(요구사항 5).
   과목은 따로 만드는 것이 아니라 강의실을 만들면 생긴다(있는 것만 보인다, 요구사항 3).
   위 세그먼트로 무엇을 만들지 고른다. 생성 폼은 팝업 안에서만 쓴다. */
function openAddModal(initial){
  const years = M.getYears();
  const subjects = [...new Set(M.getCourses(state.year).map(c => c.subject))];
  let tab = initial || (years.length ? 'room' : 'year');

  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="추가"></div>`;
  document.body.appendChild(back);
  const modal = back.querySelector('.modal');

  const draw = () => {
    const seg = `<div class="seg">
      <button class="seg-b ${tab==='year'?'on':''}" data-seg="year">학년도 생성</button>
      <button class="seg-b ${tab==='room'?'on':''}" data-seg="room" ${years.length?'':'disabled'}>강의실 생성</button>
    </div>`;
    const body = tab === 'year'
      ? `<div class="m-form">
          <label class="m-label">학년도</label>
          <input class="f" id="a-year" inputmode="numeric" autocomplete="off">
        </div>`
      : `<div class="m-form">
          <label class="m-label">과목</label>
          ${subjects.length
            ? `<select class="sel sel-full" id="a-subject-sel">
                 ${subjects.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
                 <option value="__new__">+ 새 과목 직접 입력</option>
               </select>
               <input class="f" id="a-subject-new" autocomplete="off" hidden>`
            : `<input class="f" id="a-subject-new" autocomplete="off">`}
          <div class="m-two">
            <div><label class="m-label">학년</label><input class="f" id="a-grade" inputmode="numeric"></div>
            <div><label class="m-label">반</label><input class="f" id="a-class" inputmode="numeric"></div>
          </div>
        </div>`;
    modal.innerHTML = `<h3>추가</h3>${seg}${body}
      <div class="m-err" id="a-err"></div>
      <div class="m-acts">
        <button class="btn-ghost" data-m="cancel">닫기</button>
        <button class="btn-text" data-m="ok">만들기</button>
      </div>`;
    modal.querySelector('.m-form .f')?.focus();
  };
  draw();

  const close = () => { document.removeEventListener('keydown', onKey); back.remove(); };
  const err = m => { const e = modal.querySelector('#a-err'); if (e) e.textContent = m; };
  const submit = () => {
    if (tab === 'year'){
      const y = (modal.querySelector('#a-year')?.value || '').trim();
      if (!y){ err('학년도를 적어 주세요.'); return; }
      try { const row = M.addYear(y); state.year = row.year; state.fSubject = null; state.editRoomId = null;
        toast(`${row.year}학년도를 만들었습니다.`); close(); render(); }
      catch(e){ err(e.message); }
    } else {
      const sel = modal.querySelector('#a-subject-sel');
      const subject = (sel && sel.value !== '__new__')
        ? sel.value
        : (modal.querySelector('#a-subject-new')?.value || '').trim();
      const grade = (modal.querySelector('#a-grade')?.value || '').trim();
      const classNo = (modal.querySelector('#a-class')?.value || '').trim();
      if (!subject || !grade || !classNo){ err('과목, 학년, 반을 적어 주세요.'); return; }
      try { const c = M.addCourse({ year:state.year, subject, grade, classNo });
        state.fSubject = c.subject; toast(`${M.roomName(c)} 강의실을 만들었습니다.`); close(); render(); }
      catch(e){ err(e.message); }
    }
  };
  const onKey = e => {
    if (e.key === 'Escape'){ close(); return; }
    if (e.key === 'Enter'){ e.preventDefault(); submit(); }
  };
  back.addEventListener('click', e => {
    if (e.target === back){ close(); return; }
    const s = e.target.closest('[data-seg]');
    if (s){ if (!s.disabled){ tab = s.dataset.seg; draw(); } return; }
    const m = e.target.closest('[data-m]'); if (!m) return;
    if (m.dataset.m === 'ok') submit(); else close();
  });
  // 과목 드롭다운에서 "직접 입력"을 고르면 글자 칸을 연다.
  back.addEventListener('change', e => {
    if (e.target.id !== 'a-subject-sel') return;
    const ni = modal.querySelector('#a-subject-new');
    const on = e.target.value === '__new__';
    if (ni){ ni.hidden = !on; if (on) ni.focus(); }
  });
  document.addEventListener('keydown', onKey);
}

// ── 학생 관리 ──
// 헤더는 강의실 관리와 같은 모양(제목 + 학년도 드롭다운 + 추가 버튼), 아래 반별 한 줄.
function pageStudents(){
  const years = M.getYears();
  const addBtn = `<button class="btn-add" data-act="stu-add-open" title="추가" aria-label="추가">${icon('plus',16)}<span>추가</span></button>`;
  if (!years.length)
    return `<div class="pagehead"><h2>${esc(M.menuName('students'))}</h2>${addBtn}</div><div class="empty">학년도가 없습니다.</div>`;

  const all = M.getStudentsByYear(state.year);
  const byRoom = {};
  all.forEach(s => { const r = s.studentNo.slice(0,3); (byRoom[r] ||= new Set()).add(s.studentNo); });
  const roomNos = Object.keys(byRoom).sort();
  if (state.studentClass !== 'all' && !roomNos.includes(state.studentClass)) state.studentClass = 'all';

  let snos = state.studentClass !== 'all' ? [...(byRoom[state.studentClass] || [])] : roomNos.flatMap(r => [...byRoom[r]]);
  snos = [...new Set(snos)].sort();
  // 학번 검색: 반 줄 오른쪽 끝 칸에 치는 대로 바로 거른다(선생님 지시 2026-10-29). 고른 반 안에서 거른다.
  const q = state.studentQuery.replace(/\D/g, '');
  if (q) snos = snos.filter(sno => sno.includes(q));

  const yearSel = `<select class="sel" id="year-sel" data-act="year-pick" aria-label="학년도">
    ${years.map(y => `<option value="${y.year}" ${y.year===state.year?'selected':''}>${y.year}학년도</option>`).join('')}
  </select>`;
  const head = `<div class="pagehead"><h2>${esc(M.menuName('students'))}</h2>${yearSel}${addBtn}</div>`;
  const search = `<span class="line-end"><label class="searchbox">${icon('search',15)}
    <input class="f" id="stu-search" data-act="stu-search" inputmode="numeric" autocomplete="off"
      value="${esc(state.studentQuery)}" aria-label="학번 검색"></label></span>`;
  const filterLine = catline(roomNos.map(r => ({ v:r, label:r })), state.studentClass, 'set-sclass', '전체', search);

  if (!snos.length) return `${head}${filterLine}<div class="empty">학생이 없습니다.</div>`;
  const nameOf = sno => all.find(s => s.studentNo === sno)?.name || '';
  const stuTools = sno => `<div class="tools">
        <button class="ib" data-act="stu-reset" data-no="${sno}" data-name="${esc(nameOf(sno))}" title="비밀번호 초기화" aria-label="비밀번호 초기화">${icon('rotate-ccw',16)}</button>
        <button class="ib ib-danger" data-act="stu-del" data-no="${sno}" title="삭제" aria-label="삭제">${icon('trash-2',16)}</button>
      </div>`;

  if (!WIDE.matches){
    const list = snos.map(sno => {
      const open = state.studentDetailNo === sno;
      const row = `<div class="row ${open?'on':''}">
        <div class="grow rowlink" data-act="stu-open" data-no="${sno}">
          <div class="t"><span class="chev">${icon(open?'chevron-down':'chevron-right',16)}</span><span class="mono">${esc(sno)}</span> &nbsp;${esc(nameOf(sno))}</div></div>
        ${stuTools(sno)}</div>`;
      return open ? row + `<div class="detail two">${studentDetailCols(sno)}</div>` : row;
    }).join('');
    return `${head}${filterLine}${list}`;
  }

  // 넓은 화면: 왼쪽 학생 목록, 오른쪽 상세(선생님 지시 2026-10-29, 시안 A).
  if (!snos.includes(state.studentDetailNo)) state.studentDetailNo = snos[0];
  const sel = state.studentDetailNo;
  const left = snos.map(sno => `<div class="row ${sno===sel?'on':''}">
      <div class="grow rowlink" data-act="stu-open" data-no="${sno}"><div class="t"><span class="mono">${esc(sno)}</span> &nbsp;${esc(nameOf(sno))}</div></div></div>`).join('');
  return `${head}${filterLine}<div class="split split-stu"><div class="split-list">${left}</div>
    <div class="pane"><div class="pane-head"><h3><span class="mono">${esc(sel)}</span> ${esc(nameOf(sel))}</h3>${stuTools(sel)}</div>
      <div class="two">${studentDetailCols(sel)}</div></div></div>`;
}

/* 학생 상세(요구사항 2): 줄 아래로 두 칸. 왼쪽: 수강 과목(강의실) 체크로 켜고 끄기 + 비밀번호.
   오른쪽: 과목(강의실)별 레벨, 경험치, 포트폴리오 성적. 한 학번이 여러 과목에 들 수 있어서 과목별로 본다. */
function studentDetailCols(sno){
  const grade = +sno.slice(0,1), classNo = +sno.slice(1,3);
  const classCourses = M.getCourses(state.year)
    .filter(c => c.grade === grade && c.classNo === classNo)
    .sort((a,b) => a.subject.localeCompare(b.subject,'ko'));
  const mine = M.getCoursesOfStudent(state.year, sno).sort((a,b) => a.subject.localeCompare(b.subject,'ko'));
  const enrolled = new Set(mine.map(c => c.id));

  // 성적을 볼 과목: 과목명 단추로 고른다(선생님 지시 2026-10-29). 고른 것이 없거나 빠졌으면 첫 수강 과목.
  if (!mine.some(c => c.id === state.stuScoreCourseId)) state.stuScoreCourseId = mine[0]?.id ?? null;

  // 체크는 체크박스를 눌러야만 바뀐다(줄을 label로 감싸지 않는다). 해제할 때는 확인 창을 띄운다.
  // 과목명은 단추: 누르면 오른쪽에 그 과목 성적이 뜬다. 수강하지 않는 과목은 성적이 없어 눌리지 않는다.
  const checks = classCourses.length ? classCourses.map(c => {
    const on = enrolled.has(c.id), picked = c.id === state.stuScoreCourseId;
    return `<div class="checkline ${on?'':'off'}">
    <input type="checkbox" data-act="enroll" data-id="${c.id}" data-no="${sno}" ${on?'checked':''} aria-label="${esc(M.roomName(c))} 수강">
    <button class="cl-name ${picked?'on':''}" data-act="stu-score-course" data-id="${c.id}" ${on?'':'disabled'}
      title="${on?'이 과목 성적 보기':'수강하지 않는 과목입니다.'}">${esc(M.roomName(c))}</button></div>`;
  }).join('')
    : `<div class="empty">${grade}${String(classNo).padStart(2,'0')} 반으로 만든 강의실이 없습니다.</div>`;

  // 비밀번호 초기화는 줄(좁은 화면)과 상세 머리줄(넓은 화면)의 아이콘 단추 하나로 끝낸다.
  // 여기 또 두면 같은 단추가 둘이라 낭비다(선생님 지시 2026-10-29).
  const left = `<div class="dcol">
    <div class="sectionlabel">수강 과목</div>
    <div class="dscroll">${checks}</div></div>`;

  // 고른 과목 하나만, 강의실 관리 상세의 학생 카드와 같은 모양으로(선생님 지시 2026-10-29):
  // 강의실 이름 줄 아래에 레벨, 경험치, 포인트 칸과 영역별 포트폴리오 성적, 총점.
  const sc = mine.find(c => c.id === state.stuScoreCourseId);
  const scoreRows = sc ? `<div class="row compact">
      <div class="grow"><div class="t">${esc(M.roomName(sc))}</div></div></div>${studentCard(sc.id, sno)}`
    : `<div class="empty">수강 중인 과목이 없습니다.</div>`;
  const right = `<div class="dcol">
    <div class="sectionlabel">과목별 성적</div>
    <div class="dscroll">${scoreRows}</div></div>`;

  return left + right;
}

/* 학생 추가 팝업(요구사항 1): 개별 추가 / 엑셀 명단. 개별은 학년, 반, 번호, 이름만 받는다.
   수강 과목은 추가한 뒤 학생을 눌러 수강 과목 체크로 고른다(여기선 그 반 강의실에 모두 등록). */
function openStudentModal(){
  let tab = 'one';
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="학생 추가"></div>`;
  document.body.appendChild(back);
  const modal = back.querySelector('.modal');

  const draw = () => {
    const seg = `<div class="seg">
      <button class="seg-b ${tab==='one'?'on':''}" data-seg="one">개별 추가</button>
      <button class="seg-b ${tab==='excel'?'on':''}" data-seg="excel">엑셀 명단</button>
    </div>`;
    const body = tab === 'one'
      ? `<div class="m-form">
          <div class="m-two">
            <div><label class="m-label">학년</label><input class="f" id="st-grade" inputmode="numeric"></div>
            <div><label class="m-label">반</label><input class="f" id="st-class" inputmode="numeric"></div>
            <div><label class="m-label">번호</label><input class="f" id="st-no" inputmode="numeric"></div>
          </div>
          <label class="m-label">이름</label>
          <input class="f" id="st-name" autocomplete="off">
        </div>`
      : `<div class="m-form">
          <button class="btn-ghost" data-m="upload" style="align-self:flex-start">엑셀 파일 고르기</button>
        </div>`;
    modal.innerHTML = `<h3>학생 추가</h3>${seg}${body}
      <div class="m-err" id="st-err"></div>
      <div class="m-acts">
        <button class="btn-ghost" data-m="cancel">닫기</button>
        ${tab==='one' ? `<button class="btn-text" data-m="ok">추가</button>` : ''}
      </div>`;
    modal.querySelector('.m-form .f')?.focus();
  };
  draw();

  const close = () => { document.removeEventListener('keydown', onKey); back.remove(); };
  const err = m => { const e = modal.querySelector('#st-err'); if (e) e.textContent = m; };
  const submit = () => {
    const grade = (modal.querySelector('#st-grade')?.value || '').trim();
    const classNo = (modal.querySelector('#st-class')?.value || '').trim();
    const n = (modal.querySelector('#st-no')?.value || '').trim();
    const nm = (modal.querySelector('#st-name')?.value || '').trim();
    if (!grade || !classNo || !n || !nm){ err('학년, 반, 번호, 이름을 적어 주세요.'); return; }
    const studentNo = `${grade}${String(classNo).padStart(2,'0')}${String(n).padStart(2,'0')}`;
    const { rooms, added } = M.addStudent({ year:state.year, grade, classNo, studentNo, name:nm });
    if (!rooms.length){ err('그 반으로 만든 강의실이 없습니다. 먼저 강의실을 만들어 주세요.'); return; }
    state.studentClass = `${grade}${String(classNo).padStart(2,'0')}`;
    toast(`${nm}(${studentNo})을 ${added.length}개 강의실에 등록했습니다.`); close(); render();
  };
  const onKey = e => {
    if (e.key === 'Escape'){ close(); return; }
    if (e.key === 'Enter' && tab === 'one'){ e.preventDefault(); submit(); }
  };
  back.addEventListener('click', e => {
    if (e.target === back){ close(); return; }
    const s = e.target.closest('[data-seg]');
    if (s){ tab = s.dataset.seg; draw(); return; }
    const m = e.target.closest('[data-m]'); if (!m) return;
    if (m.dataset.m === 'ok') submit();
    else if (m.dataset.m === 'upload') toast('엑셀 올리기는 다음 단계에서 만듭니다.');
    else close();
  });
  document.addEventListener('keydown', onKey);
}

/* 강의 번호표(목록, 머리줄, 고르개): 숫자형은 "29강."처럼 점을 찍어 제목과 구분하고(선생님 지시
   2026-10-30), 라벨형("[OT]")은 대괄호가 이미 구분하므로 점을 안 찍는다. 레드 글씨(.lnum)로 선다. */
function lnumTag(num){
  const b = M.lessonBadge(num);
  if (!b) return '';
  return `<span class="lnum">${esc(b)}${/^\d/.test(b) ? '.' : ''}</span> `;
}
/* 강의 번호 라벨(드롭다운, 목록의 글자): 강의 고유 번호(num)가 있으면 그걸로("29강."/"[OT]"),
   없으면 그 과목 강의실 연결 차례(no)로 "N강."(선생님 지시 2026-10-30: 질문 관리 등에서 1강이 아니라
   강의가 가진 번호 29강으로 보여야 한다). 번호도 연결도 없으면 빈 문자열. */
function lessonNo(l, no){
  const b = M.lessonBadge(l?.num);
  if (b) return /^\d/.test(b) ? `${b}.` : b;
  return no != null ? `${no}강.` : '';
}
/* 번호 상자(제목 없이 번호만 서는 칸: 진도표 차수 칸, 강의실 상세 차수, 성적 행). 마침표 없이
   "29강"/"[OT]"로. num 없으면 그 자리 차례(no)로 "N강"(진도·강의실은 연결 차례, 선생님 지시 2026-10-31). */
function lnumPlain(l, no){ return M.lessonBadge(l?.num) || (no != null ? `${no}강` : ''); }

// ── 강의 라이브러리 (개념 노트의 서브 메뉴, 선생님 지시 2026-10-28) ──
function pageLessons(){
  const lessons = M.getLessonsNewest();   // 새로 만든 강의가 맨 위(요구사항 112)
  const listSide = lessons.map(l => `<div class="row" style="cursor:pointer" data-act="lesson-open" data-id="${l.id}">
      <div class="grow"><div class="t">${lnumTag(l.num)}${esc(l.title)}</div>
        <div class="s">${(l.order||[]).map(k => M.partDef(k)?.name).filter(Boolean).join(', ') || '빈 강의'}</div></div>
      ${l.id === state.lessonId ? `<span class="badge">편집 중</span>` : ''}</div>`).join('') || `<div class="empty">강의가 없습니다.</div>`;

  /* 강의 만들기 (선생님 지시 2026-10-30): 기본은 활동지(슬라이드)로 바로 만드는 것이다.
     활동지에 있는 단계(미션, 질문 등)와 강 번호, 제목이 자동으로 들어간다. 빈 강의로 시작해
     직접 채울 수도 있다. 번호 칸에 숫자를 적으면 "N강", OT·수행 같은 말이면 "[OT]"로 붙는다. */
  const addForm = `<div class="formrow" style="margin-bottom:8px">
    <button class="btn-text" data-act="lesson-from-worksheet" style="display:flex;align-items:center;gap:8px"
      title="활동지(한글 .hwpx 권장)를 올리면 그 내용으로 강의가 만들어집니다">${icon('upload',16)}<span>활동지로 강의 만들기</span></button>
  </div>
  <div class="formrow">
    <input class="f" id="l-num" placeholder="번호" style="max-width:88px" aria-label="강의 번호"
      title="숫자면 N강, OT·수행 같은 말이면 [OT]로 표시됩니다">
    <input class="f grow" id="l-title" placeholder="빈 강의 제목(직접 채우기)">
    <button class="btn-text" data-act="lesson-add">빈 강의 만들기</button>
  </div>`;

  if (!state.lessonId)
    return `${addForm}${listSide}`;

  const l = M.getLesson(state.lessonId);
  const tabs = catline([{v:'edit',label:'강의 편집'},{v:'place',label:'강의실 연결 콘텐츠'}], state.lessonTab, 'lesson-tab');
  const body = state.lessonTab === 'edit' ? lessonEditor(l) : lessonPlacer(l);

  // 삭제는 머리줄 오른쪽에. 창고에서 지우는 것이라 강의실 상세와 같은 자리, 같은 모양으로 둔다
  return `<div class="pagehead">
      <button class="ib" data-act="lesson-close" title="목록" aria-label="목록">${icon('chevron-left',16)}</button>
      <h2>${lnumTag(l.num)}${esc(l.title)}</h2>
      <button class="ib ib-danger" data-act="lesson-del" data-id="${l.id}"
        title="강의 삭제" aria-label="강의 삭제">${icon('trash-2',16)}</button></div>${tabs}${body}`;
}

function lessonEditor(l){
  const order = l.order || [];
  const deck = order.length ? order.map((k,i) => {
    const d = M.partDef(k);
    return `<div class="partrow">
      <span class="dot" style="background:var(--${k})"></span>
      <div class="grow"><div class="t">${esc(d.name)}</div>
        <div class="s">${esc(l.parts[k]?.title || '')}${d.portfolio?'':' (성적 무관)'}</div></div>
      <div class="tools">
        <button class="ib" data-act="part-up" data-k="${k}" ${i===0?'disabled':''} title="위로" aria-label="위로">${icon('arrow-up',16)}</button>
        <button class="ib" data-act="part-down" data-k="${k}" ${i===order.length-1?'disabled':''} title="아래로" aria-label="아래로">${icon('arrow-down',16)}</button>
        <button class="ib" data-act="part-off" data-k="${k}" title="빼기" aria-label="빼기">${icon('x',16)}</button>
      </div></div>`;
  }).join('') : `<div class="placeholder">칸이 없습니다. 오른쪽에서 추가해 주세요.</div>`;

  const palette = M.PART_TYPES.map(p => {
    const has = order.includes(p.key);
    return `<div class="pchip ${has?'has':''}" data-act="part-toggle" data-k="${p.key}">
      <span class="dot" style="background:var(--${p.key})"></span>
      <span class="grow">${esc(p.name)}</span>${has ? icon('check',15) : icon('plus',15)}</div>`;
  }).join('');

  return `<div class="editor">
    <div class="deck">
      <div class="sectionlabel">강의 번호</div>
      <div class="formrow" style="margin-bottom:12px">
        <input class="f" data-act="lesson-num" data-id="${l.id}" value="${esc(l.num || '')}"
          placeholder="번호 (예: 1, OT, 수행)" style="max-width:220px" aria-label="강의 번호"
          title="숫자면 N강, OT·수행 같은 말이면 [OT]로 표시됩니다">
      </div>
      <div class="sectionlabel">이 강의의 칸 (순서 자유)</div>${deck}</div>
    <div class="palette"><div class="sectionlabel">칸 넣고 빼기</div>${palette}
      <div class="formrow" style="margin-top:10px;flex-direction:column;align-items:stretch">
        <button class="btn-text" data-act="lesson-import" data-id="${l.id}" style="display:flex;align-items:center;justify-content:center;gap:8px"
          title="활동지를 올려 개념 노트를 만듭니다 (한글 파일 .hwpx를 권합니다)">${icon('upload',16)}<span>활동지 올리기</span></button>
      </div>
    </div></div>`;
}

function lessonPlacer(l){
  const placed = new Set();
  M.getCourses(state.year).forEach(c => {
    if (M.getCourseLessons(c.id).some(cl => cl.lessonId === l.id)) placed.add(c.id);
  });
  const rows = M.getCourses(state.year).map(c => `<label class="checkline">
    <input type="checkbox" data-act="place-toggle" data-id="${c.id}" ${placed.has(c.id)?'checked':''}>
    <span>${esc(M.roomName(c))}</span></label>`).join('');
  return `<div class="sectionlabel">이 강의를 연결할 강의실</div>${rows}`;
}

/* ── 개념 노트 ──
   2026 lms의 개념 체크에서 가져오는 것은 콘텐츠 올리는 기능과 디자인 조절 기능뿐이다
   (요구사항 46, 47). 그래서 서브 메뉴도 콘텐츠와 디자인 둘뿐이다. */
function pageConcept(){
  const tabs = catline(M.ADMIN_SUBMENUS.concept, state.conceptTab, 'concept-tab');
  const head = `<div class="pagehead"><h2>${esc(M.menuName('concept'))}</h2></div>${tabs}`;

  if (state.conceptTab === 'library')
    return head + pageLessons();

  if (state.conceptTab === 'design')
    return head + pageDesign();

  // 콘텐츠 탭이 곧 강의 슬라이드 축 편집기다(선생님 지시 2026-10-30, 요구사항 125)
  return head + pageAxis();
}

/* ── 디자인 탭: 슬라이드 요소별 크기·자간·줄간격 (선생님 지시 2026-10-31) ──────
   전체 공통 설정이라 한 번 정하면 모든 강의 슬라이드에 걸린다(model.js의 getSlideDesign/designCss).
   큰 미리보기(위) + 조절(아래). 슬라이드 종류를 ◀▶로 넘기면 그 종류에 맞는 요소만 뜬다.
     - 전체(global): 자간·줄간격. 요소가 미설정이면 이 값을 상속한다.
     - 요소별: 크기·자간·줄간격. 개별로 바꾸면 그 요소만. 전체를 다시 움직이면 전체값이 다시 먹는다.
   크기·자간은 pt(한글·워드와 같은 단위. 1pt=2 design-px, 쪽 크기에 맞춰 함께 커진다), 줄간격은 배수(글자 크기의 몇 배).
   미리보기는 1920×1080 고정 렌더 + transform:scale로 축소 → 실제 투사와 분량이 같다(wireDesignStage).
   미리보기 쪽은 종류별 대표 샘플이다(설정이 전체 공통이라 특정 강의에 매이지 않는다). */
// 종류별 대표 샘플 쪽(디자인 미리보기 전용). 그 종류가 조절하는 요소가 다 보이게 짰다.
function designSampleSlide(g){
  switch (g.step){
    case 'cover': return { type:'cover', num:'29', title:'사림의 성장과 붕당', topic:'조선 전기의 정치 변화', unit:'Ⅱ-2 사림의 대두', pages:'72~79' };
    case 'objective': return { type:'numbered', step:'objective', items:['사림의 성장 과정을 설명할 수 있다.','4대 사화의 원인과 결과를 비교할 수 있다.','붕당 형성의 배경을 파악할 수 있다.'] };
    case 'question': return { type:'question', step:'question', question:'사림과 훈구의 대립은 오늘날 정치에 어떤 교훈을 줄까?', guide:'두 세력의 가치관 차이를 근거로 들어 서술해 보자.' };
  }
  if (g.group === '비교표') return { type:'page', step:'concept', title:'훈구와 사림', rows:[{ kind:'compare',
    left:{ label:'훈구', lines:['중앙 집권 강조','부국강병'] }, right:{ label:'사림', lines:['향촌 자치','왕도 정치'] } }] };
  if (g.group === '사료 인용') return { type:'page', step:'concept', kind:'source', title:'사료 조광조의 건의', rows:[{ kind:'source',
    lines:['임금은 마음을 바르게 하여 조정을 바르게 하고, 조정을 바르게 하여 백성을 바르게 하소서.','『중종실록』'] }] };
  return { type:'page', step:'concept', title:'성리학의 수용', rows:[{ label:'성리학', lines:[
    '1. 설립 : 16C 이후 발달','- 유입 : 성리학이 전래됨','· 안향이 소개','- 서적 편찬','· 소학'] }] };
}
/* 슬라이더 한 줄 = 막대 + 숫자 입력 칸 + 단위. 숫자 칸에 직접 쳐 넣을 수 있다(선생님 지시 2026-10-31).
   set=false면 전체값을 따르는 중(파랑). 막대와 숫자 칸은 같은 data-act라 저장·미리보기 핸들러가 둘 다 받는다. */
function dsSlider(act, k, label, val, min, max, set, unit = 'pt', step = 1){
  const d = `data-act="${act}" data-k="${k}" data-set="${set ? 1 : 0}"`;
  return `<div class="ds-ctl${set ? '' : ' g'}"><label>${label}</label>`
    + `<input type="range" ${d} min="${min}" max="${max}" step="${step}" value="${val}">`
    + `<input type="number" class="ds-num" ${d} min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${label} 값">`
    + `<span class="ds-unit">${unit}</span></div>`;
}
function pageDesign(){
  const groups = M.SLIDE_DESIGN, N = groups.length;
  if (!(state.designGroupIx >= 0 && state.designGroupIx < N)) state.designGroupIx = 0;
  const gi = state.designGroupIx, grp = groups[gi];
  const vals = M.getSlideDesign(), G = M.SLIDE_DESIGN_GLOBAL;
  const gLs = vals[G.ls.key] ?? G.ls.def, gLh = vals[G.lh.key] ?? G.lh.def;
  const lsR = G.ls, lhR = G.lh;

  const elems = grp.rows.map(r => {
    const fs = vals[r.key] ?? r.def;
    const lsSet = vals[r.key + 'Ls'] != null, lhSet = vals[r.key + 'Lh'] != null;
    return `<div class="ds-elem"><div class="ds-en">${esc(r.label)}</div>
      ${dsSlider('ds-fs', r.key, '크기',   fs,                          r.min, r.max, true)}
      ${dsSlider('ds-ls', r.key, '자간',   lsSet ? vals[r.key + 'Ls'] : gLs, lsR.min, lsR.max, lsSet)}
      ${dsSlider('ds-lh', r.key, '줄간격', lhSet ? vals[r.key + 'Lh'] : gLh, lhR.min, lhR.max, lhSet, '%', lhR.step)}
    </div>`;
  }).join('');

  return `<div class="ds2">
    <style id="dpv-style">${M.designVarsCss(vals)}</style>
    <div class="ds-stage" id="ds-stage"><div class="deckframe"><div class="deckpage">${renderSlide(designSampleSlide(grp))}</div></div></div>
    <div class="ds-panel">
      <div class="ds-top">
        <div class="ds-nav">
          <button data-act="ds-nav" data-d="-1" aria-label="이전 종류">◀</button>
          <span class="ds-nm">${esc(grp.group)} <small>${gi + 1}/${N}</small></span>
          <button data-act="ds-nav" data-d="1" aria-label="다음 종류">▶</button>
        </div>
        <div class="ds-gbox">
          <span class="ds-glabel">전체</span>
          ${dsSlider('ds-g', G.ls.key, '자간',   gLs, lsR.min, lsR.max, true)}
          ${dsSlider('ds-g', G.lh.key, '줄간격', gLh, lhR.min, lhR.max, true, '%', lhR.step)}
        </div>
        <button class="btn-link" data-act="design-reset">기본값으로</button>
      </div>
      <div class="sectionlabel">이 슬라이드 요소</div>
      <div class="ds-elems">${elems}</div>
    </div>
    <style>
      /* 디자인 탭: 내용은 너비를 다 쓰고(선생님 지시 2026-10-31), 미리보기 쪽은 가운데로 모은다.
         조절 칸 글자는 키웠고, 요소 조절은 4단 격자다. 숫자 칸에 직접 쳐 넣을 수 있다. */
      .ds2{display:flex;flex-direction:column;gap:18px;width:100%}
      .ds-stage{width:100%;max-width:1200px;margin:0 auto;background:#777;border-radius:12px;overflow:hidden}
      .ds-stage .deckframe{width:1920px;height:1080px;transform-origin:top left}
      .ds-panel{background:#fff;border:1px solid var(--line,#e2e8f0);border-radius:12px;padding:16px 20px}
      .ds-top{display:flex;align-items:center;gap:24px;flex-wrap:wrap;border-bottom:1px dashed var(--line,#e2e8f0);padding-bottom:14px;margin-bottom:14px}
      .ds-nav{display:flex;align-items:center;gap:8px}
      .ds-nav button{width:36px;height:36px;border:1px solid var(--line,#e2e8f0);background:#fff;border-radius:8px;font-size:16px;cursor:pointer}
      .ds-nm{min-width:130px;text-align:center;font-weight:700;font-size:16px}
      .ds-nm small{color:#64748b;font-weight:500}
      .ds-gbox{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
      .ds-glabel{font-size:14px;font-weight:700;color:#64748b}
      .ds-elems{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 28px}
      .ds-elem{padding:8px 0;min-width:0}
      .ds-en{font-weight:700;font-size:16px;margin-bottom:6px}
      .ds-ctl{display:grid;grid-template-columns:50px 1fr auto auto;align-items:center;gap:8px;margin:6px 0}
      .ds-ctl label{font-size:14px;color:#64748b}
      .ds-ctl input[type=range]{width:100%;min-width:0}
      .ds-num{width:58px;padding:3px 6px;border:1px solid var(--line,#e2e8f0);border-radius:6px;
        font-size:15px;text-align:right;font-variant-numeric:tabular-nums;font-family:inherit}
      .ds-ctl.g .ds-num{color:#2563eb;border-color:#bfdbfe}
      .ds-unit{font-size:13px;color:#64748b;min-width:18px}
      @media (max-width:1100px){ .ds-elems{grid-template-columns:repeat(2,minmax(0,1fr))} }
    </style>
  </div>`;
}
/* 미리보기를 1920×1080 고정 렌더로 두고 칸 너비에 맞춰 축소한다(실제 투사와 분량이 같아지도록). */
function wireDesignStage(){
  const stage = $main.querySelector('#ds-stage'); if (!stage) return;
  const frame = stage.querySelector('.deckframe'); if (!frame) return;
  const fit = () => { const s = stage.clientWidth / 1920; frame.style.transform = `scale(${s})`; stage.style.height = (1080 * s) + 'px'; };
  fit();
  requestAnimationFrame(fit);   // 글꼴이 늦게 와도 한 번 더 맞춘다
}


/* ── 강의 슬라이드 축 편집기 (선생님 지시 2026-10-30, 요구사항 125) ─────────
   "표지 - 전시학습확인(퀴즈 등) - 학습 목표 - 동기 유발 내용(사진, 영상류) -
    개념 노트(강의 내용) - 미션 활동 - 오늘의 질문 - 맺음말 이 순서야"

   화면 틀 (선생님 지시 2026-10-30, 요구사항 126)
     "개념 노트 콘텐츠는 강의를 드롭다운으로 선택하면 전체 너비로 편집창이 뜨게 해줘.
      맨 왼쪽에 편집해야 할 메뉴를 작게 두고 그걸 누르면 오른쪽에서 편집 상세 내용을 건들게 해줘."

   그래서 강의는 왼쪽 목록이 아니라 **머리줄 드롭다운**으로 고른다. 목록이 먹던 300px이 비어
   편집창이 화면 너비를 다 쓴다. 그 안이 다시 두 칸인데, 왼쪽은 축 여덟 단계를 **좁게**
   세운 줄자(--w-axis)고 오른쪽이 고른 단계의 편집 상세다.
   다른 두 단 화면(.split)과 달리 왼쪽이 "자료 목록"이 아니라 "단계 고르개"라서 훨씬 좁다.

   단계는 고정이라 더하고 빼고 섞는 단추를 두지 않는다. 내용이 빈 단계는 슬라이드에서
   그냥 빠지므로 켜고 끄는 스위치도 없다. 줄의 채움 표시가 그 자리를 대신한다.

   개념 노트와 오늘의 질문 단계는 이미 제자리가 있는 내용을 그대로 쓴다
   (shared/slide-axis.js의 from 참고). 같은 것을 두 군데 적지 않게 하려는 것이다.
   개념 노트는 여기서 바로 고치고, 오늘의 질문은 읽기만 하고 고치는 것은 그 메뉴에서 한다. */
function pageAxis(){
  const lessons = M.getLessonsWithPart('concept');
  if (!lessons.length) return `<div class="empty">개념 노트가 있는 강의가 없습니다.</div>`;
  // 고른 강의가 없거나 사라졌으면 맨 위(최신) 강의를 고른다. 편집창이 늘 하나 떠 있어야 한다
  if (!lessons.some(l => l.id === state.conceptLessonId)) state.conceptLessonId = lessons[0].id;
  const l = M.getLesson(state.conceptLessonId);
  // 단계도 늘 하나 열려 있다(오른쪽 칸이 비지 않게)
  if (!M.SLIDE_AXIS.some(a => a.key === state.axisStep)) state.axisStep = M.SLIDE_AXIS[0].key;
  const ax = M.axisStep(state.axisStep);

  /* 드롭다운은 어드민의 다른 고르개(.sel)와 같은 모양이다. 글자와 화살표 둘레에 여백이 있다.
     오른쪽은 아이콘 단추 넷(선생님 지시 2026-10-30: "문구를 넣은 버튼 말고 그냥 svg 이모지만
     써서 버튼 만들어줘"). 글씨를 뺀 까닭이 하나 더 있다: 머리줄이 고정 띠라서 낮아야 한다.
     색은 화면 규칙 그대로다. 주 동작만 레드(.ib-primary), 되돌릴 수 없는 것만 레드 테두리
     (.ib-danger), 나머지는 회색이다. 전에 넷 다 레드 채운 단추(.btn-text)였던 것은 미리보기가
     쓰던 클래스를 그대로 늘려 쓴 탓이고 뜻이 있던 것이 아니다("버튼이 다 빨간색인 이유가 있을까?").
       저장        : 알림용이다. 칸은 커서가 빠질 때 이미 저장되므로 눌러서 확인만 받는다(axis-save)
       미리보기    : 학생이 보는 슬라이드를 새 탭에
       활동지 올리기: 강의 라이브러리의 강의 편집에만 있던 것을 여기에도 둔 것이다
                     ("콘텐츠에서 활동지 올리는 기능이 없네?"). 같은 importWorksheet를 부른다
       활동지 지우기: 강의 내용을 전부 비운다(clearAxisContent. 요구사항 134) */
  const picker = `<div class="axhead">
    <select class="sel axpick" data-act="axis-lesson" aria-label="강의 고르기">
      ${lessons.map(x => { const b = M.lessonBadge(x.num);
        return `<option value="${esc(x.id)}" ${x.id===l.id?'selected':''}>${b ? esc(b) + (/^\d/.test(b)?'. ':' ') : ''}${esc(x.title)}</option>`; }).join('')}
    </select>
    <div class="tools">
      <button class="ib ib-primary" data-act="axis-save"
        title="저장" aria-label="저장">${icon('check',16)}</button>
      <button class="ib" data-act="axis-preview" data-id="${l.id}"
        title="슬라이드 미리보기" aria-label="슬라이드 미리보기">${icon('monitor',16)}</button>
      <button class="ib" data-act="lesson-import" data-id="${l.id}"
        title="활동지 올리기 (한글 파일 .hwpx를 권합니다)" aria-label="활동지 올리기. 한글 파일 .hwpx를 권합니다">${icon('upload',16)}</button>
      <button class="ib ib-danger" data-act="axis-clear" data-id="${l.id}"
        title="올린 활동지 지우기 (강의 내용을 모두 비웁니다)"
        aria-label="올린 활동지 지우기. 강의 내용을 모두 비웁니다">${icon('trash-2',16)}</button>
    </div>
  </div>`;

  return picker + `<div class="axwrap">
    <nav class="axrail">${axisRail(l)}</nav>
    <div class="axpane">
      <div class="axpane-head"><h3>${esc(ax.name)}</h3>${axisAddBtn(l, ax)}</div>
      <div class="axpane-body">${axisEditor(l, ax)}</div>
    </div></div>`;
}

/* 단계마다 제목 머리줄 오른쪽 끝에 서는 '추가' 단추(선생님 지시 2026-11-01: 추가 단추를 전부
   제목 우측 끝으로 통일). 버튼 이름은 '+'가 곧 '추가'라는 뜻이라 명사만 둔다(페이지, 문제, 줄).
     전시학습확인  → 페이지(마커를 넣어 새 페이지. deck-add-break)
     개념 노트/미션 → 페이지(pg-add. 전에는 편집창 맨 위에 있던 것을 머리줄로 옮겼다)
     동기 유발      → 페이지(항목 하나가 한 쪽이다. deck-add)
     학습 목표      → 줄(deck-add. 전에는 편집창 맨 아래에 있던 것을 머리줄로 옮겼다) */
function axisAddBtn(l, ax){
  if (ax.key === 'review')
    return `<button class="btn-chip" data-act="deck-add-break" data-id="${l.id}">${icon('plus',13)}페이지</button>`;
  if (ax.edit === 'pages')
    return `<button class="btn-chip" data-act="pg-add" data-id="${l.id}" data-k="${ax.key}">${icon('plus',13)}페이지</button>`;
  if (ax.edit === 'preview')
    return `<button class="btn-chip" data-act="deck-add" data-id="${l.id}" data-k="${ax.key}">${icon('plus',13)}페이지</button>`;
  if (ax.edit === 'lines')
    return `<button class="btn-chip" data-act="deck-add" data-id="${l.id}" data-k="${ax.key}">${icon('plus',13)}줄</button>`;
  return '';
}

/* 왼쪽 줄자: 축 여덟 단계. 단계 이름만 둔다.
   번호와 굵은 글씨는 걷었다(선생님 지시 2026-10-30: "번호 삭제, 글씨 굵기 해제, 각 개체끼리 간격 두기").
   안 채운 단계는 흐린 글씨다(켜고 끄는 스위치를 두지 않는 대신 여기서 어디가 비었는지 본다). */
function axisRail(l){
  return M.SLIDE_AXIS.map(ax => {
    const on = state.axisStep === ax.key;
    const filled = M.deckStepFilled(l.id, ax.key);
    return `<button class="axrow ${on?'on':''} ${filled?'':'off'}"
      data-act="axis-step" data-k="${ax.key}" aria-current="${on?'true':'false'}">
      <span class="axnm">${esc(ax.name)}</span></button>`;
  }).join('');
}

/* 단계 하나를 고치는 칸. 어떤 칸을 그릴지는 축 정의의 edit가 정한다
   (cover 표지 메타 / qa 문답 / lines 줄 목록 / preview 사진과 영상 / pages 페이지 / question 읽기만). */
function axisEditor(l, ax){
  const k = ax.key;

  /* 글배치(선생님 지시 2026-10-30: "글배치까지 한꺼번에 신경써야해")
     편집창이 넓어졌으니 칸마다 단위 글씨를 오른쪽에 매달지 않고, 이름표를 왼쪽에 세로로
     가지런히 세운다. 이미 쓰는 틀(.row.row-top + .gen-label)을 그대로 쓴다:
     일반 설정과 형성평가 문제 만들기가 같은 틀이라 어드민 안에서 폼 모양이 하나로 보인다. */
  const fld = (label, ctl) => `<div class="row row-top"><div class="t gen-label">${label}</div>${ctl}</div>`;

  if (ax.edit === 'cover'){
    const d = M.getDeck(l.id);
    // 강 번호와 강의 제목은 이미 있는 것에서 오므로 여기서 고치지 않는다.
    // 표지에 적는 것은 학습 주제, 단원, 교과서 쪽수 셋이다(선생님 지시 2026-10-30)
    return fld('학습 주제', `<input class="f grow" data-act="deck-cover" data-f="topic" data-id="${l.id}"
        value="${esc(d.cover.topic || '')}" aria-label="학습 주제">`)
      + fld('단원', `<input class="f grow" data-act="deck-cover" data-f="unit" data-id="${l.id}"
        value="${esc(d.cover.unit)}" aria-label="단원">`)
      + fld('교과서 쪽수', `<input class="f grow" data-act="deck-cover" data-f="pages" data-id="${l.id}"
        value="${esc(d.cover.pages)}" aria-label="교과서 쪽수">`);
  }

  if (ax.edit === 'pages')
    // 개념 노트와 미션 활동: 같은 페이지 편집기(2026 편집기가 둘을 같은 틀로 고쳤다)
    return pageEditor(l, k);

  if (ax.edit === 'question'){
    const q = l.parts?.question;
    if (!q) return `<div class="placeholder">이 강의에는 오늘의 질문 칸이 없습니다.</div>`;
    /* 슬라이드에서 질문을 바로 고친다(선생님 지시 2026-10-30). 전에는 읽기만 하고 오늘의 질문 메뉴에서
       고쳤는데, 활동지로 만든 강의는 강의실에 안 꽂혀 그 메뉴(과목·강의실 단위)에 안 떠서 고칠 길이
       없었다. 여기서 고친 것은 parts.question이라 강의실에 꽂으면 질문 관리 메뉴와 그대로 이어진다. */
    return fld('질문', `<textarea class="f grow" rows="2" data-act="axis-question" data-f="question"
        data-id="${l.id}" aria-label="오늘의 질문">${esc(q.question || '')}</textarea>`)
      + fld('설명문', `<textarea class="f grow" rows="5" data-act="axis-question" data-f="guide"
        data-id="${l.id}" aria-label="질문 설명문">${esc(q.guide || '')}</textarea>`);
  }

  if (ax.edit === 'closing'){
    // 맺음말: 슬라이드엔 'NEXT CLASS'가 고정으로 뜨고(편집 불가), 여기서 고치는 것은 그 아래 다음 학습 주제뿐이다
    const d = M.getDeck(l.id);
    return fld('다음 학습 주제', `<input class="f grow" data-act="deck-closing" data-id="${l.id}"
        value="${esc(d.closing.nextTopic || '')}" aria-label="다음 학습 주제">`);
  }

  const items = M.getDeck(l.id)[k]?.items || [];
  const tools = i => `<div class="tools">
    <button class="ib ib-sm" data-act="deck-up" data-id="${l.id}" data-k="${k}" data-i="${i}"
      ${i===0?'disabled':''} title="위로" aria-label="위로">${icon('arrow-up',14)}</button>
    <button class="ib ib-sm" data-act="deck-down" data-id="${l.id}" data-k="${k}" data-i="${i}"
      ${i===items.length-1?'disabled':''} title="아래로" aria-label="아래로">${icon('arrow-down',14)}</button>
    <button class="ib ib-sm ib-danger" data-act="deck-del" data-id="${l.id}" data-k="${k}" data-i="${i}"
      title="삭제" aria-label="삭제">${icon('trash-2',14)}</button></div>`;

  /* 줄 하나를 묶는 틀. 머리에 번호와 도구를 두고 그 아래에 이름표 붙은 칸을 쌓는다.
     번호는 콘텐츠 탭 어디서나 같은 모양(.axnum) 하나다(선생님 지시 2026-10-30:
     "번호를 표시하든 페이지를 표시하든 숫자가 있잖아 그거 하나로 통일"). */
  const card = (i, body, badge = '', num = i + 1) => `<div class="axitem">
    <div class="axitem-head"><span class="axnum">${num}</span>${badge}
      <span class="axitem-sp"></span>${tools(i)}</div>
    <div class="axitem-body">${body}</div></div>`;

  let rows = '';
  if (ax.edit === 'qa'){
    /* 전시학습확인(선생님 지시 2026-10-31): 페이지 안에 문항을 넣는 방식이다. 원래는 비어 있고,
       제목 우측 '페이지 추가'로 페이지를 먼저 만든 뒤, 페이지 안 '문제 추가'로 문항을 넣는다.
       저장은 평면 배열에 페이지 나누기 마커(pagebreak)를 섞어 둔 모양이다: 마커가 페이지를 열고,
       마커 없이 시작하는 앞 문항들은 첫 페이지다. 슬라이드(buildSlides)도 같은 기준으로 쪽을 가른다.
       문항 유형 셋(단답형/진위형/초성형)은 문항마다 고른다. 진위형만 답이 O/X 라디오다.
       초성은 선생님이 문제 글 끝 괄호에 적는다(슬라이드가 떼어 힌트로 세운다. pullChosung). */
    const pages = [];
    let cur = null;
    items.forEach((it, i) => {
      if (it && it.pagebreak){ cur = { bi:i, items:[] }; pages.push(cur); }
      else { if (!cur){ cur = { bi:-1, items:[] }; pages.push(cur); } cur.items.push({ it, i }); }
    });
    if (!pages.length)
      return `<div class="placeholder">아직 페이지가 없습니다. 오른쪽 위 ‘페이지 추가’를 눌러 페이지를 먼저 만드세요.</div>`;
    let qn = 0;   // 문항 번호: 페이지를 넘어 이어 센다(슬라이드 번호와 맞춘다)
    return pages.map((pg, p) => {
      // '문제 추가'가 끼울 자리: 이 페이지 마지막 문항 바로 뒤(비었으면 마커 바로 뒤)
      const insertAt = pg.items.length ? pg.items[pg.items.length - 1].i + 1 : pg.bi + 1;
      const qCards = pg.items.map(({ it, i }) => {
        qn++;
        const set = f => `data-act="deck-set" data-id="${l.id}" data-k="${k}" data-i="${i}" data-f="${f}"`;
        const type = `<select class="f axtype" ${set('type')} aria-label="문항 유형">
          ${M.REVIEW_TYPES.map(t => `<option value="${t.key}" ${it.type===t.key?'selected':''}>${esc(t.name)}</option>`).join('')}
        </select>`;
        const a = it.type === 'ox'
          ? `<div class="grow fmox">${['O','X'].map(v => `<label class="fmoxb">
              <input type="radio" class="fmradio" name="rv-${l.id}-${i}" value="${v}"
                ${String(it.a).toUpperCase()===v?'checked':''} ${set('a')}>${v}</label>`).join('')}</div>`
          : `<input class="f grow" ${set('a')} value="${esc(it.a)}" aria-label="정답">`;
        /* 번호는 한 줄을 통째로 먹지 않고 맨 왼쪽에 선다(선생님 지시 2026-10-31). 유형 줄과 같은 높이로
           왼쪽에 두고, 순서·삭제 버튼은 그 유형 줄 오른쪽에. 문제·정답은 그 아래로 들여 쓴다. */
        return `<div class="rvq">
          <span class="rvq-n">${qn}</span>
          <div class="rvq-main">
            <div class="rvq-top">${fld('유형', `<div class="grow">${type}</div>`)}${tools(i)}</div>
            ${fld('문제', `<textarea class="f grow ta" rows="2" ${set('q')} aria-label="문제">${esc(it.q)}</textarea>`)}
            ${fld('정답', a)}
          </div></div>`;
      }).join('') || `<div class="placeholder">문항이 없습니다. ‘문제 추가’를 누르세요.</div>`;
      return `<div class="rvpage">
        <div class="rvpage-head"><span class="rvpage-title">페이지 ${p + 1}</span>
          <span class="axitem-sp"></span>
          <button class="btn-chip" data-act="deck-add-q" data-id="${l.id}" data-at="${insertAt}">${icon('plus',13)}문제</button>
          <button class="ib ib-sm ib-danger" data-act="deck-del-page" data-id="${l.id}"
            data-bi="${pg.bi}" data-cnt="${pg.items.length}" title="페이지 삭제" aria-label="페이지 삭제">${icon('trash-2',14)}</button>
        </div>
        ${qCards}</div>`;
    }).join('');

  } else if (ax.edit === 'preview'){
    /* 동기 유발(선생님 지시 2026-11-01): 전시학습확인처럼 항목마다 '페이지 N'으로 표시한다
       (항목 하나가 한 쪽이다). 종류 셋: 사진, 영상, 글. 사진/영상은 주소와 설명, 글은 글 칸이다.
       글은 사료 인용과 같은 세리프 양쪽정렬이되 따옴표는 없다(슬라이드 slide-deck.js 참고). */
    if (!items.length)
      return `<div class="placeholder">아직 페이지가 없습니다. 오른쪽 위 ‘페이지’를 눌러 추가하세요.</div>`;
    return items.map((it, i) => {
      const set = f => `data-act="deck-set" data-id="${l.id}" data-k="${k}" data-i="${i}" data-f="${f}"`;
      const kind = it.kind || 'image';
      const kindSel = fld('종류', `<div class="grow"><select class="f axtype" ${set('kind')} aria-label="종류">
          <option value="image" ${kind==='image'?'selected':''}>사진</option>
          <option value="video" ${kind==='video'?'selected':''}>영상</option>
          <option value="text" ${kind==='text'?'selected':''}>글</option></select></div>`);
      const bodyFields = kind === 'text'
        ? fld('글', `<textarea class="f grow ta pgtext" rows="5" ${set('text')} aria-label="글">${esc(it.text || '')}</textarea>`)
        : fld(kind === 'video' ? '유튜브 주소' : '그림 주소',
              `<input class="f grow" ${set('url')} value="${esc(it.url || '')}" aria-label="주소">`)
          + fld('설명', `<input class="f grow" ${set('caption')} value="${esc(it.caption || '')}" aria-label="설명">`);
      return `<div class="rvpage">
        <div class="rvpage-head"><span class="rvpage-title">페이지 ${i + 1}</span>
          <span class="axitem-sp"></span>${tools(i)}</div>
        ${kindSel}${bodyFields}</div>`;
    }).join('');

  } else {
    /* 학습 목표, 맺음말: 줄 하나가 글자 하나다.
       줄이 길어지는 자리가 있어 한 칸짜리 입력이 아니라 늘어나는 글 칸을 쓴다. */
    rows = items.map((it, i) => `<div class="ce-line">
      <span class="axnum">${i + 1}</span>
      <textarea class="f grow ta ta1" rows="2" data-act="deck-set" data-id="${l.id}" data-k="${k}"
        data-i="${i}" aria-label="${esc(ax.name)} ${i + 1}번">${esc(it)}</textarea>${tools(i)}</div>`).join('');
  }

  // 줄 추가 단추는 제목 머리줄 오른쪽으로 옮겼다(axisAddBtn, 선생님 지시 2026-11-01).
  return rows || `<div class="placeholder">내용이 없습니다.</div>`;
}

/* ── 개념 노트와 미션 활동의 페이지 편집기 (선생님 지시 2026-10-30) ──
   "2026에 사용한 lms 콘텐츠 편집기를 참고하여 개념노트 페이지와 미션 활동 페이지 만들어줄것"

   2026 편집기(개념 Check, 미션 Check)에서 본뜬 틀: 페이지마다 제목 칸이 있고, 그 아래에
   묶음(라벨 칸 + 내용 글 칸)이 여럿 선다. 내용 글 칸은 한 줄이 한 항목이다.
   라벨과 내용은 세로로 쌓는다(선생님 지시 2026-10-30. 처음엔 2026처럼 가로였다).
   2026처럼 개념과 미션이 같은 편집기다(k가 'concept'이냐 'mission'이냐만 다르다).
   2026의 형식 고르기(연표, 비교표 등), 이미지 번호, 글자 크기 칸, 끌어서 옮기기는 가져오지
   않았다. 시킨 것이 아니다.

   내용 칸 안의 들여쓰기(선생님 지시: "수준이 떨어질 수록 들여쓰기"): 줄 앞 기호(1. / - / ·)로
   단계를 읽어 그만큼 빈칸을 넣어 보여 준다(M.indentText). 저장할 때는 빈칸을 걷는다(M.stripIndent).
   단계는 기호가 정하므로 빈칸은 보기용이다. 그래서 선생님이 빈칸을 손으로 맞출 필요가 없다. */
function pageEditor(l, k){
  const pages = M.getPages(l.id, k);
  const at = (act, p, r) => `data-act="${act}" data-id="${l.id}" data-k="${k}"`
    + (p != null ? ` data-p="${p}"` : '') + (r != null ? ` data-r="${r}"` : '');
  const btn = (act, p, r, ic, title, { danger = false, off = false } = {}) =>
    `<button class="ib ib-sm ${danger ? 'ib-danger' : ''}" ${at(act, p, r)} ${off ? 'disabled' : ''}
      title="${title}" aria-label="${title}">${icon(ic, 14)}</button>`;

  /* 묶음 유형 고르개 (선생님 지시 2026-10-30, 요구사항 139: "여러가지 유형의 페이지가 있을 수
     있으니 그 유형을 고르는 기능도 각 행마다 만들어줘"). 유형은 페이지가 아니라 묶음마다다
     (같은 지시: "페이지 내에서 다른 걸 적용 해야 하기도 함").
     모양은 전시학습확인의 문항 유형 고르개와 같은 것(.axtype) 하나다. 유형 목록은
     shared/slide-axis.js의 ROW_TYPES에 있다. 고르면 적은 글을 들고 모양만 바뀐다(M.convertRow). */
  const typeSel = (r, p, ri) => `<select class="f axtype" ${at('pg-row-type', p, ri)} aria-label="묶음 유형">
    ${M.ROW_TYPES.map(t => `<option value="${t.key}" ${M.rowKind(r) === t.key ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
  </select>`;

  const body = pages.map((pg, p) => {
    /* 묶음은 라벨이 위, 내용이 아래로 세로로 쌓인다(선생님 지시 2026-10-30:
       "행라벨과 내용은 가로로 쌓지 말고 세로로 쌓아줘"). 왼쪽 라벨 칸 격자로 되돌리지 않는다.
       "라벨" "내용"이라는 안내 글줄(옛 .pgcols)은 걷고 칸 안의 플레이스홀더로 넣었다
       (같은 지시: "라벨 내용 이라는 문구는 없애고 그걸 플레이스홀더로 잡아줘").
       왼쪽 들여쓰기(옛 --pg-in)도 걷었다: 라벨과 내용이 페이지 번호와 같은 선에서 시작한다
       (같은 지시: "시작하는 위치를 페이지 숫자랑 같은 위치에서"). 다시 들여 쓰지 않는다.
       삭제 단추는 라벨 줄 오른쪽이다: 내용 칸은 적은 만큼 아래로 길어져 거기 매달면 자리가 흔들린다. */
    /* 좌우 비교 묶음(요구사항 137): 왼쪽과 오른쪽이 각각 라벨과 내용을 든다. 보통 묶음과 같이
       라벨이 위, 내용이 아래로 쌓이고 그것이 두 칸으로 나란히 선다(.pgcmp). 칸 이름은
       data-f의 "left.label"처럼 쪽과 칸을 같이 적는다(pg-set이 갈라 읽는다). */
    const cmpRow = (r, ri) => {
      const side = (s, nm) => `<div class="pgcmp-col">
          <textarea class="f grow pglabel" rows="1" ${at('pg-set', p, ri)} data-f="${s}.label"
            placeholder="${nm} 라벨" aria-label="${nm} 라벨">${esc(r[s].label)}</textarea>
          <textarea class="f pgtext" rows="${Math.max(2, r[s].text.split('\n').length)}" ${at('pg-set', p, ri)}
            data-f="${s}.text" placeholder="${nm} 내용" aria-label="${nm} 내용">${esc(M.indentText(r[s].text))}</textarea></div>`;
      return `<div class="pgrow pgcmp">
        <div class="pgcmp-cols">${side('left', '왼쪽')}${side('right', '오른쪽')}</div>
        <div class="tools">${typeSel(r, p, ri)}
          ${btn('pg-row-del', p, ri, 'trash-2', '비교 묶음 삭제', { danger:true })}</div></div>`;
    };
    /* 행 나열과 사료 인용은 칸이 같다(라벨 + 내용). 플레이스홀더만 유형에 맞춘다:
       사료 인용에서는 라벨이 사료 제목, 내용이 원문이다. */
    const plainRow = (r, ri) => {
      const src = M.rowKind(r) === 'source';
      return `<div class="pgrow">
        <div class="pgrow-top">
          <textarea class="f grow pglabel" rows="1" ${at('pg-set', p, ri)} data-f="label"
            placeholder="${src ? '사료 제목' : '설명글 제목'}" aria-label="설명글 제목">${esc(r.label)}</textarea>
          <div class="tools">${typeSel(r, p, ri)}
            ${btn('pg-row-cut', p, ri, 'scissors', '커서를 둔 줄부터 새 페이지로')}
            ${btn('pg-row-del', p, ri, 'trash-2', '묶음 삭제', { danger:true })}</div>
        </div>
        <textarea class="f pgtext" rows="${Math.max(2, r.text.split('\n').length)}" ${at('pg-set', p, ri)}
          data-f="text" placeholder="${src ? '사료 원문' : '내용'}" aria-label="내용">${esc(M.indentText(r.text))}</textarea></div>`;
    };
    const rows = pg.rows.map((r, ri) => M.rowKind(r) === 'compare' ? cmpRow(r, ri) : plainRow(r, ri)).join('');
    /* 머리줄: 번호, 제목 칸, 그 다음 단추. 묶음 추가는 순서 바꾸기 다음 자리다
       (선생님 지시 2026-10-30: "페이지 제목란을 줄이고 순서바꾸는 버튼 다음에 추가버튼을 위치시켜줘").
       제목 칸은 그래서 늘어나지 않고 폭이 정해져 있다(.pgtitle).
       묶음 추가를 묶음 목록 아래로 되돌리지 않는다.
       비교 묶음 추가(layout-grid)는 걷었다: 유형 고르개가 그 일을 한다(요구사항 139).

       합치기와 나누기(요구사항 139): 원칙은 묶음 하나가 페이지 하나지만 내용이 적으면 같이 두고
       싶고 많으면 쪼개고 싶다(선생님 지시 2026-10-30). 그래서 셋을 둔다.
         위 페이지와 합치기(fold-vertical)   이 페이지의 묶음을 윗 페이지로 옮긴다. 첫 페이지는 끌 수 없다
         묶음마다 페이지 나누기(unfold-...)  묶음이 둘 이상인 페이지를 묶음마다 한 쪽으로 가른다
         커서 줄부터 나누기(가위, 묶음 머리) 묶음 하나가 너무 길 때 그 줄부터 새 페이지로
       나누기 단추는 묶음이 하나뿐이면 꺼 둔다. 그것이 "이 페이지는 원칙에 맞다"는 표시도 된다. */
    return `<section class="pgblock">
      <div class="pghead"><span class="axnum">${p + 1}</span>
        <input class="f pgtitle" ${at('pg-title', p)} value="${esc(pg.title)}" aria-label="페이지 제목">
        <div class="tools">
          ${btn('pg-up', p, null, 'arrow-up', '페이지 위로', { off: p === 0 })}
          ${btn('pg-down', p, null, 'arrow-down', '페이지 아래로', { off: p === pages.length - 1 })}
          ${btn('pg-row-add', p, null, 'plus', '묶음 추가')}
          ${btn('pg-merge-up', p, null, 'fold-vertical', '위 페이지와 합치기', { off: p === 0 })}
          ${btn('pg-split-rows', p, null, 'unfold-vertical', '묶음마다 페이지 나누기', { off: pg.rows.length < 2 })}
          ${btn('pg-del', p, null, 'trash-2', '페이지 삭제', { danger:true })}</div></div>
      ${rows}
    </section>`;
  }).join('');

  // 페이지 추가 단추는 제목 머리줄 오른쪽 끝으로 옮겼다(axisAddBtn, 선생님 지시 2026-11-01:
  // 전시학습확인처럼 제목 우측 끝으로 통일). 전에는 편집창 맨 위 안쪽(.ce-add.pgadd)에 있었다.
  return body || `<div class="placeholder">내용이 없습니다.</div>`;
}

/* 페이지 편집기의 단추와 칸이 부르는 길. 페이지 배열을 받아 고치고 통째로 저장한다(M.setPages).
   getPages는 부를 때마다 새 배열을 만들어 주므로 여기서 고쳐도 저장 전에는 아무것도 바뀌지 않는다. */
function editPages(el, fn){
  const { id, k } = el.dataset;
  const pages = M.getPages(id, k);
  if (fn(pages, +el.dataset.p, +el.dataset.r) === false) return;
  M.setPages(id, k, pages);
}

/* ── 활동지 올리기 (선생님 지시 2026-10-30, 요구사항 137) ──
   "토큰이 안드는 방향으로 변환해서 내용 인식해줄 것."
   AI를 거치지 않는다. 브라우저 안에서 파일을 열어 페이지와 묶음으로 나눈다
   (파일이 어디로도 나가지 않고 사용료도 없다). 받는 파일은 둘이다:
     .hwpx  한글 파일. 표 칸과 문단이 그대로 들어 있어 이쪽이 정확하다(좌우 비교표도 읽는다)
     .pdf   한글이 없을 때의 대비. 글자 자리로 어림한다
   어느 쪽인지는 shared/worksheet.js의 worksheetFromFile이 가른다. 여기서 직접 고르지 않는다.
   전시학습확인, 동기 유발, 맺음말을 뺀 나머지 단계를 다 채운다(선생님 지시 2026-10-30:
   "활동지를 올리면 슬라이드 만든 섹션에 다 채워져야 해"): 표지(학습 주제/단원/쪽수), 학습 목표,
   개념 노트, 미션 활동, 오늘의 질문. 이미 적힌 내용이 있으면 바꿀지 먼저 묻는다(덮어쓰면 못 되돌린다).
   다 넣으면 슬라이드 탭의 개념 노트 단계로 옮겨 가 바로 고칠 수 있게 한다. */
/* 파일 하나를 골라 활동지로 읽는다(한글 .hwpx 권장, PDF도 됨). 못 읽으면 토스트만 띄우고 null.
   worksheetFromFile이 확장자를 보고 한글/PDF를 가른다(여기서 직접 고르지 않는다). */
async function pickWorksheet(){
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.hwpx,application/pdf,.pdf';
    inp.addEventListener('change', async () => {
      const file = inp.files?.[0]; if (!file){ resolve(null); return; }
      toast('활동지에서 글자를 꺼내고 있습니다.');
      try {
        const { worksheetFromFile } = await import('./shared/worksheet.js?v=20261031e');
        resolve(await worksheetFromFile(file));
      } catch (e){ console.error(e); toast(e.message || '활동지를 읽지 못했습니다.'); resolve(null); }
    });
    inp.click();
  });
}
const worksheetEmpty = got => !got || (!got.concept?.length && !got.mission?.length
  && !got.objective?.length && !got.question
  && !(got.cover && (got.cover.topic || got.cover.unit || got.cover.pages)) && !got.num);

/* 활동지에서 꺼낸 것을 강의에 채운다. 활동지에 있는 단계만 자동으로 생긴다(선생님 지시 2026-10-30:
   "미션이란 말이 있으면 미션 활동이 자동으로 생기고 질문이라는 말이 있으면 질문이 생기고").
   강 번호도 활동지에서 가져온다(별도로 고칠 수 있다). 돌려주는 것은 넣은 단계 이름 목록이다. */
function applyWorksheet(lessonId, got){
  const l = M.getLesson(lessonId);
  const cover = got.cover || {}, objective = got.objective || [], question = got.question || null;
  const done = [];
  if (got.num) M.setLessonNum(lessonId, got.num);
  if (cover.topic || cover.unit || cover.pages){ M.deckSetCover(lessonId, cover); done.push('표지'); }
  if (objective.length){ M.deckSetItems(lessonId, 'objective', objective); done.push(`학습 목표 ${objective.length}줄`); }
  if (got.concept.length){
    if (!l.parts?.concept) M.setLessonPart(lessonId, 'concept', true);
    M.setPages(lessonId, 'concept', got.concept); done.push(`개념 노트 ${got.concept.length}페이지`);
  }
  if (got.mission.length){
    if (!l.parts?.mission) M.setLessonPart(lessonId, 'mission', true);   // "미션" 있으면 미션 활동 자동 생성
    M.setPages(lessonId, 'mission', got.mission); done.push(`미션 활동 ${got.mission.length}페이지`);
    /* 미션 미니앱 기본정보도 자동 등록한다(선생님 지시 2026-10-30: 웹앱 주소가 없어도 기본정보는
       등록된다). 이름은 활동지의 미션 이름, 강의와 연결(lessonId), 주소는 비워 두고 나중에 채운다.
       이미 이 강의에 연결된 앱이 있으면 두 번 만들지 않는다(활동지를 다시 올려도 중복 안 됨). */
    if (!M.getMissionApps().some(a => a.lessonId === lessonId)){
      M.addMissionApp({ name: got.mission[0]?.title || l.title || '미션', lessonId,
        archive:{ topic: cover.topic || '' } });
      done.push('미션 앱');
    }
  }
  if (question){
    if (!l.parts?.question) M.setQuestionEnabled(lessonId, true);         // "질문" 있으면 오늘의 질문 자동 생성
    M.setQuestion(lessonId, { question: question.question, guide: question.guide }); done.push('오늘의 질문');
  }
  return done;
}

/* 이미 있는 강의에 활동지를 올린다. 이미 적힌 내용이 있으면 바꿀지 먼저 묻는다(덮어쓰면 못 되돌린다).
   다 넣으면 슬라이드 탭으로 옮겨 가 바로 고칠 수 있게 한다. */
async function importWorksheet(lessonId){
  const got = await pickWorksheet();
  if (worksheetEmpty(got)){ if (got) toast('활동지에서 넣을 내용을 찾지 못했습니다.'); return; }

  // 지금 적힌 내용이 있는가(빈 페이지만 만들어 둔 것은 없는 것으로 본다. 비교 묶음은 네 칸까지)
  const has = k => M.pagesFilled(M.getPages(lessonId, k));
  const l = M.getLesson(lessonId);
  const willReplace = (got.concept.length && has('concept')) || (got.mission.length && has('mission'))
    || (got.objective.length && (M.getDeck(lessonId).objective.items || []).length)
    || (got.question && String(l.parts?.question?.question || '').trim());
  if (willReplace){
    const ok = await confirmDelete({ title:'이미 적힌 내용을 바꿀까요?', okText:'바꾸기',
      bodyHtml:`<p>활동지에서 꺼낸 내용으로 슬라이드 섹션을 채웁니다. 이미 적어 둔 표지, 학습 목표, 개념 노트, 미션 활동, 오늘의 질문은 지워집니다.</p>` });
    if (!ok) return;
  }
  const done = applyWorksheet(lessonId, got);
  state.conceptTab = 'content'; state.conceptLessonId = lessonId; state.axisStep = 'cover';
  render();
  toast(done.length ? `${done.join(', ')}을(를) 넣었습니다.` : '활동지에서 넣을 내용을 찾지 못했습니다.');
}

/* 강의 라이브러리에서 활동지 하나로 강의를 통째로 만든다(선생님 지시 2026-10-30:
   "강의 라이브러리에서 슬라이드 생성만 해도 강의가 만들어지게"). 제목은 학습 주제, 번호는 강 번호를
   활동지에서 가져오고, 미션/질문 같은 단계도 활동지에 있으면 자동으로 생긴다(applyWorksheet). */
async function createLessonFromWorksheet(){
  const got = await pickWorksheet();
  if (worksheetEmpty(got)){ if (got) toast('활동지에서 강의로 만들 내용을 찾지 못했습니다.'); return; }
  const title = (got.cover?.topic || got.concept?.[0]?.title || '새 강의').trim();
  // 강 번호는 필수다. 활동지에서 못 뽑았으면 교사에게 묻고, 그래도 없으면 만들지 않는다.
  let num = String(got.num || '').trim();
  if (!num){ num = (prompt('이 강의의 강 번호를 입력해 주세요 (예: 29, OT)') || '').trim();
    if (!num){ toast('강 번호가 없어 강의를 만들지 못했습니다.'); return; } }
  const l = M.addLesson(title, num);
  const done = applyWorksheet(l.id, got);
  /* 활동지로 만든 강의는 그 해 강의실 전부에 자동으로 꽂는다(선생님 지시 2026-10-30:
     "활동지 올리면 자동으로 강의랑 강의실이랑 연결"). 그래야 질문 관리, 미션 연결, 성적 메뉴에
     바로 뜬다. 필요 없는 반은 강의실 연결 콘텐츠 탭에서 체크를 풀면 된다. */
  const courses = M.getCourses(state.year);
  courses.forEach(c => M.placeLesson(c.id, l.id));
  state.lessonId = l.id; state.lessonTab = 'edit'; render();
  toast(`"${title}" 강의 생성 (${done.join(', ')})${courses.length ? ` · 강의실 ${courses.length}곳 연결` : ''}`);
}

/* ── 올린 활동지 지우기 (선생님 지시 2026-10-30, 요구사항 133, 134) ──
   "올린 활동지를 삭제하는 기능은 없네 그거 추가해줘."
   활동지 파일은 어디에도 저장하지 않는다(브라우저 안에서 글자만 꺼내 쓰고 버린다).
   그래서 "올린 활동지를 지운다"는 곧 그 내용으로 채운 것을 비우는 것이다.

   **비우는 범위는 강의 내용 전부다**(선생님 지시 2026-10-30, 요구사항 134:
   "활동지를 지웠는데 왜 강의는 그대로지? 강의 콘텐츠도 없어저야지").
   처음에는 개념 노트와 미션 활동 페이지만 비웠는데, 표지, 전시학습확인, 학습 목표, 동기 유발,
   맺음말이 남아 강의가 그대로인 것처럼 보였다. **다시 좁히지 않는다.**
   강의와 칸, 강의실 연결 콘텐츠, 성적과 진도, 오늘의 질문은 그대로다
   (무엇을 두고 무엇을 비우는지는 model.js의 clearLessonContent 머리 주석에 있다).
   무엇을 비우는지 단계 이름으로 먼저 보여 주고 묻는다(되돌릴 수 없다). */
function clearAxisContent(lessonId){
  const steps = M.lessonContentSteps(lessonId);
  if (!steps.length){ toast('비울 내용이 없습니다.'); return; }
  const names = steps.map(k => M.axisStep(k)?.name).filter(Boolean).join(', ');
  confirmDelete({ title:'올린 활동지 지우기', okText:'비우기',
    bodyHtml:`<p>이 강의의 내용을 모두 비웁니다: <b>${esc(names)}</b></p>`
      + `<ul><li>활동지에서 꺼내 넣은 것과 그 뒤에 손으로 고친 것이 함께 사라집니다</li>`
      + `<li>강의와 칸은 그대로 남습니다. 활동지를 다시 올리면 바로 채워집니다</li>`
      + `<li>오늘의 질문은 그 메뉴에서 고치는 것이라 그대로 둡니다</li>`
      + `<li>성적과 진도 기록은 지우지 않습니다</li></ul>` })
    .then(ok => {
      if (!ok) return;
      M.clearLessonContent(lessonId);
      toast('강의 내용을 비웠습니다.'); render();
    });
}
/* ── 미션 활동 (hoistory/lms "미션 Check" 카드 틀 이식) ─────────────────────
   선생님 지시 2026-10-28: 미션 활동도 hoistory 기본 틀로.
   hoistory 카드가 들고 있던 것을 그대로 옮겼다: 제목, 웹앱 주소, 어드민 주소, 아이콘,
   연결할 강의, 팝업으로 열기, 그리고 아카이브 세 칸(수업 주제, 활동 의도, 아카이브 내용).
   두 단(선생님 지시 2026-10-29): 왼쪽은 미션 이름 목록, 오른쪽은 고른 미션의 세부 내용을 고치는 칸.
   강의실 관리와 같은 .split 틀이고, 좁은 화면에서는 고른 줄 아래로 펼친다. 추가와 수정 팝업은 이 칸으로 대신했다.
   목록은 최신순이다(선생님 지시 2026-10-30, 요구사항 114). 전에 있던 위, 아래 단추는 걷었다.
   앱 어드민은 브라우저 새 탭으로 연다(선생님 지시 2026-10-29: 학생 활동을 보면서 성적을 매기려면
   어드민이 따로 떠 있어야 한다). 같은 창 안의 탭(요구사항 67)은 이 지시로 걷어냈다. */
function pageMission(){
  const head = `<div class="pagehead"><h2>${esc(M.menuName('mission'))}</h2>
    <button class="btn-add" data-act="mission-add-open" title="추가" aria-label="추가">${icon('plus',16)}<span>추가</span></button></div>`;

  const apps = M.getMissionApps();
  const isNew = state.missionSel === 'new';
  if (!apps.length && !isNew) return `${head}<div class="empty">연결한 앱이 없습니다.</div>`;
  // 넓은 화면에서는 오른쪽 칸이 늘 하나 떠 있어야 하므로 고른 것이 없으면 맨 위 앱을 고른다.
  if (!isNew && !apps.some(a => a.id === state.missionSel)) state.missionSel = WIDE.matches ? apps[0].id : null;

  const row = a => `<div class="row ${a.id===state.missionSel?'on':''}">
      <div class="grow rowlink" data-act="mission-sel" data-v="${esc(a.id)}"><div class="t">${esc(a.name)}</div></div></div>`;
  const app = isNew ? null : M.getMissionApp(state.missionSel);
  const newRow = isNew ? `<div class="row on"><div class="grow"><div class="t">새 미션</div></div></div>` : '';

  if (!WIDE.matches){
    const list = apps.map(a => a.id === state.missionSel
      ? row(a) + `<div class="detail">${missionTools(app)}${missionForm(app)}</div>` : row(a)).join('');
    return head + (isNew ? newRow + `<div class="detail">${missionTools(null)}${missionForm(null)}</div>` : '') + list;
  }
  return `${head}<div class="split split-mission">
      <div class="split-list">${newRow}${apps.map(row).join('')}</div>
      <div class="pane"><div class="pane-head"><h3>${esc(app ? app.name : '새 미션')}</h3>${missionTools(app)}</div>
        <div class="dscroll">${missionForm(app)}</div></div></div>`;
}
// 고른 미션의 단추: 앱 어드민(새 탭), 저장, 삭제. 새 미션이면 저장과 취소.
function missionTools(app){
  if (!app) return `<div class="tools">
      <button class="ib ib-primary" data-act="mission-save" title="추가" aria-label="추가">${icon('check',16)}</button>
      <button class="ib" data-act="mission-new-cancel" title="취소" aria-label="취소">${icon('x',16)}</button></div>`;
  return `<div class="tools">
      <button class="ib" data-act="mission-admin" data-v="${esc(app.id)}" ${app.adminUrl?'':'disabled'}
        title="${app.adminUrl ? '앱 어드민 (새 탭)' : '어드민 주소가 없습니다.'}" aria-label="앱 어드민">${icon('wrench',16)}</button>
      <button class="ib ib-primary" data-act="mission-save" data-v="${esc(app.id)}" title="저장" aria-label="저장">${icon('check',16)}</button>
      <button class="ib ib-danger" data-act="mission-del" data-v="${esc(app.id)}" title="삭제" aria-label="삭제">${icon('trash-2',16)}</button></div>`;
}
/* 세부 내용 칸. 이름표 + 입력 칸 한 줄씩(일반 설정과 같은 모양).
   앱 키는 문서 id다. 활동지로 자동 등록한 앱은 임시 키(app_...)로 서는데, 그런 앱은 키 칸을 비워
   보여 주고(placeholder) 교사가 적으면 그 키로 옮긴다(saveMission → setMissionAppKey). 선생님 지시
   2026-10-30: "비워놓고 내가 넣을 수 있게". 직접 만든 앱은 그 키를 그대로 보여 준다(고치면 옮겨진다). */
function missionForm(app){
  const arch = app?.archive || {};
  const line = (label, ctl, top) => `<div class="row ${top?'row-top':''}"><div class="t gen-label">${label}</div>${ctl}</div>`;
  const inp = (id, v, extra = '') => `<input class="f grow" id="${id}" value="${esc(v || '')}" ${extra}>`;
  const lessons = M.getLessons();
  const autoKey = app && /^app_/.test(app.id);   // 활동지가 자동으로 붙인 임시 키
  return line('제목', inp('ma-name', app?.name))
    + line('앱 키', inp('ma-key', app ? (autoKey ? '' : app.id) : '',
        autoKey ? 'placeholder="앱 키를 정해 주세요 (예: j_sahwa)"' : ''))
    + line('웹앱 주소', inp('ma-su', app?.studentUrl))
    + line('어드민 주소', inp('ma-au', app?.adminUrl))
    + line('연결할 강의', `<select class="sel grow" id="ma-lesson" aria-label="연결할 강의">
        <option value="">연결 없음</option>
        ${numberedLessons(lessons).map(x => `<option value="${x.l.id}" ${x.l.id===app?.lessonId?'selected':''}>${esc(x.label)}</option>`).join('')}
      </select>`)
    + line('팝업으로 열기', `<input type="checkbox" class="gcb" id="ma-modal" ${app?.modal?'checked':''} aria-label="팝업으로 열기">`)
    + `<div class="sectionlabel">아카이브</div>`
    + line('수업 주제', inp('ma-topic', arch.topic))
    + line('활동 의도', `<textarea class="f grow ta" id="ma-intent" rows="3">${esc(arch.intent || '')}</textarea>`, true)
    + line('아카이브 내용', `<textarea class="f grow ta" id="ma-content" rows="5">${esc(arch.content || '')}</textarea>`, true);
}
/* 강의에 차수를 붙인다("3강. 제목", 선생님 지시 2026-10-29. 차수 뒤에 마침표를 찍는다). 차수는 진도 관리와 같이 그 과목 강의실들에
   연결한 차례(placedLessons)에서 나온다. 과목이 둘 이상이면 앞에 과목을 붙이고, 어디에도 연결하지 않은 강의는 제목만 뒤에 둔다. */
function numberedLessons(lessons){
  const all = M.getCourses(state.year);
  const subjects = [...new Set(all.map(c => c.subject))].sort((a,b) => a.localeCompare(b,'ko'));
  const out = [], seen = new Set();
  // 과목 안에서는 최신 강의가 위, 연결하지 않은 강의도 새로 만든 것이 위(요구사항 112)
  subjects.forEach(s => {
    const rooms = all.filter(c => c.subject === s);
    numberedNewest(placedLessons(rooms).lessons).forEach(({ x:l, no }) => {
      if (seen.has(l.id)) return; seen.add(l.id);
      out.push({ l, placed:true, label:`${subjects.length > 1 ? s + ' ' : ''}${lessonNo(l, no)} ${l.title}` });
    });
  });
  M.newestFirst(lessons.filter(l => !seen.has(l.id)), 'L').forEach(l => {
    const pre = lessonNo(l, null);
    out.push({ l, placed:false, label:`${pre ? pre + ' ' : ''}${l.title}` });
  });
  return out;
}
// 저장 단추: 오른쪽 칸(좁으면 펼친 칸)의 값을 읽어 추가하거나 고친다.
function saveMission(id){
  const g = k => document.getElementById(k);
  const payload = {
    name: g('ma-name').value, studentUrl: g('ma-su').value, adminUrl: g('ma-au').value,
    lessonId: g('ma-lesson').value, modal: g('ma-modal').checked,
    archive: { topic:g('ma-topic').value.trim(), intent:g('ma-intent').value.trim(), content:g('ma-content').value.trim() },
  };
  try {
    if (id){
      // 키 칸에 적었고 지금 키와 다르면 그 키로 옮긴다(자동 등록 앱의 임시 키를 실제 키로 바꾸는 길)
      const newKey = g('ma-key').value.trim();
      let appId = id;
      if (newKey && newKey !== id){ appId = M.setMissionAppKey(id, newKey).id; state.missionSel = appId; }
      M.updateMissionApp(appId, payload); toast('앱을 저장했습니다.');
    } else { const a = M.addMissionApp({ ...payload, key:g('ma-key').value }); state.missionSel = a.id; toast('앱을 추가했습니다.'); }
    render();
  } catch(e){ toast(e.message); }
}
// 앱 어드민을 브라우저 새 탭으로 연다(미션 활동의 렌치 단추, 강의실 상세의 미션 활동 바로가기 공용).
function openMissionAdmin(app){
  if (!app?.adminUrl){ toast('어드민 주소가 없습니다.'); return; }
  window.open(new URL(app.adminUrl, location.href).href, '_blank', 'noopener');
}

/* ── 공지사항 (선생님 지시 2026-10-30, 요구사항 109) ──────────────────────────
   "공지사항은 일단 메뉴만 만들어 놓고 내용은 어드민 가서 다시 편집할게."
   미션 활동과 같은 두 단 틀: 왼쪽 글 제목 목록(최신순), 오른쪽 고른 글의 제목과 내용 칸.
   좁은 화면에서는 고른 줄 아래로 펼친다.
   과목마다 따로다(선생님 지시 2026-10-30, 요구사항 115): 오늘의 질문처럼 과목 탭을 두고, 쓴 글은
   그 과목 강의실(반) 전부의 맨 위에 뜬다(학생 화면). */
function pageNotice(){
  const head = `<div class="pagehead"><h2>${esc(M.menuName('notice'))}</h2>
    <button class="btn-add" data-act="notice-add-open" title="추가" aria-label="추가">${icon('plus',16)}<span>추가</span></button></div>`;

  const all = M.getCourses(state.year);
  if (!all.length) return head + `<div class="empty">강의실이 없습니다.</div>`;
  const subjects = [...new Set(all.map(c => c.subject))].sort((a,b) => a.localeCompare(b,'ko'));
  if (!subjects.includes(state.noticeSubject)) state.noticeSubject = subjects[0];
  const tabs = catline(subjects.map(s => ({ v:s, label:s })), state.noticeSubject, 'notice-subject');

  const list = M.getNotices(state.year, state.noticeSubject);
  const isNew = state.noticeSel === 'new';
  if (!list.length && !isNew) return `${head}${tabs}<div class="empty">공지사항이 없습니다.</div>`;
  if (!isNew && !list.some(n => n.id === state.noticeSel)) state.noticeSel = WIDE.matches ? list[0].id : null;

  const row = n => `<div class="row ${n.id===state.noticeSel?'on':''}">
      <div class="grow rowlink" data-act="notice-sel" data-v="${esc(n.id)}"><div class="t">${esc(n.title)}</div></div></div>`;
  const n = isNew ? null : M.getNotice(state.noticeSel);
  const newRow = isNew ? `<div class="row on"><div class="grow"><div class="t">새 글</div></div></div>` : '';

  if (!WIDE.matches){
    const rows = list.map(x => x.id === state.noticeSel
      ? row(x) + `<div class="detail">${noticeTools(n)}${noticeForm(n)}</div>` : row(x)).join('');
    return head + tabs + (isNew ? newRow + `<div class="detail">${noticeTools(null)}${noticeForm(null)}</div>` : '') + rows;
  }
  return `${head}${tabs}<div class="split split-notice">
      <div class="split-list">${newRow}${list.map(row).join('')}</div>
      <div class="pane"><div class="pane-head"><h3>${esc(n ? n.title : '새 글')}</h3>${noticeTools(n)}</div>
        <div class="dscroll">${noticeForm(n)}</div></div></div>`;
}
function noticeTools(n){
  if (!n) return `<div class="tools">
      <button class="ib ib-primary" data-act="notice-save" title="추가" aria-label="추가">${icon('check',16)}</button>
      <button class="ib" data-act="notice-new-cancel" title="취소" aria-label="취소">${icon('x',16)}</button></div>`;
  return `<div class="tools">
      <button class="ib ib-primary" data-act="notice-save" data-v="${esc(n.id)}" title="저장" aria-label="저장">${icon('check',16)}</button>
      <button class="ib ib-danger" data-act="notice-del" data-v="${esc(n.id)}" title="삭제" aria-label="삭제">${icon('trash-2',16)}</button></div>`;
}
// 이름표 + 칸 한 줄씩(미션 활동 세부 칸과 같은 모양)
function noticeForm(n){
  return `<div class="row"><div class="t gen-label">제목</div>
      <input class="f grow" id="nt-title" value="${esc(n?.title || '')}" aria-label="제목"></div>
    <div class="row row-top"><div class="t gen-label">내용</div>
      <textarea class="f grow ta" id="nt-body" rows="12" aria-label="내용">${esc(n?.body || '')}</textarea></div>`;
}
function saveNotice(id){
  const payload = { title: val('nt-title'), body: document.getElementById('nt-body')?.value ?? '' };
  try {
    if (id){ M.updateNotice(id, payload); toast('저장했습니다.'); }
    else { const n = M.addNotice(state.year, state.noticeSubject, payload); state.noticeSel = n.id; toast('글을 올렸습니다.'); }
    render();
  } catch(e){ toast(e.message); }
}

/* ── 오늘의 질문 (hoistory/lms "생각 Check" 틀 이식) ─────────────────────────
   서브 메뉴 셋. 셋 다 과목 탭 아래에서 움직인다(선생님 지시 2026-10-28).
     질문 관리 : 깔린 강의마다 카드 하나. 주제와 질문 두 줄, 누르면 설명문이 펼쳐진다.
                 편집 버튼을 눌러야 고칠 수 있고, 토글로 오늘의 질문 칸을 통째로 끈다
     답변       : 강의를 드롭다운으로 고르고 전체, 1~n반 중 하나를 누르면 그 답변 목록이 뜬다.
                 채점이 메인이고 통과, 미흡은 인원수를 붙인 탭이다. 세 탭 모두 답변 줄을
                 그대로 보여 준다(선생님 지시 2026-10-28: 명단만 뜨면 안 된다).
                 hoistory 채점 모달(thGradeBackdrop)을 옮긴 것.
                 이탈 탭은 학생 화면에 이탈 감시가 없어 뺐다
     PICK      : 같은 고르개로 공유로 켜 둔 답변만 모아 본다(수업 중 띄우는 자리, 요구사항 73) */
function pageQuestion(){
  const tabs = catline(M.ADMIN_SUBMENUS.question, state.questionTab, 'question-tab');
  const head = `<div class="pagehead"><h2>${esc(M.menuName('question'))}</h2></div>${tabs}`;

  const all = M.getCourses(state.year);
  if (!all.length) return head + `<div class="empty">강의실이 없습니다.</div>`;
  const subjects = [...new Set(all.map(c => c.subject))].sort((a,b) => a.localeCompare(b,'ko'));
  if (!subjects.includes(state.questionSubject)) state.questionSubject = subjects[0];
  const subTabs = catline(subjects.map(s => ({ v:s, label:s })), state.questionSubject, 'q-subject');
  const rooms = all.filter(c => c.subject === state.questionSubject)
    .slice().sort((a,b) => a.grade - b.grade || a.classNo - b.classNo);
  const { placed, lessons } = placedLessons(rooms);

  if (state.questionTab === 'manage') return head + subTabs + questionManage(lessons);
  return head + subTabs + questionAnswers(rooms, placed, lessons);
}

/* 질문 관리: 두 단(선생님 지시 2026-10-29). 왼쪽은 강의 줄(차수, 제목, 켜고 끄는 눈 단추),
   오른쪽은 고른 강의의 질문과 설명문을 고치는 칸. 미션 활동과 같은 .split 틀이고 좁으면 고른 줄 아래로 펼친다.
   편집 단추를 따로 누르지 않고 오른쪽 칸에서 바로 고쳐 저장한다. */
function questionManage(lessons){
  if (!lessons.length) return `<div class="empty">깔린 강의가 없습니다.</div>`;
  const items = numberedNewest(lessons);   // 최신 강의가 맨 위(요구사항 112)
  if (!lessons.some(l => l.id === state.questionSel)) state.questionSel = WIDE.matches ? items[0].x.id : null;

  const row = ({ x:l, no }) => {
    const on = !!l.parts?.question;
    // 켜고 끄기는 강의실 관리의 공개 단추와 같은 눈 모양(선생님 지시 2026-10-29). 켜져 있으면 레드.
    return `<div class="row compact ${l.id===state.questionSel?'on':''}">
      <div class="grow rowlink" data-act="q-sel" data-id="${l.id}"><div class="t">${lessonNo(l, no)} ${esc(l.title)}</div></div>
      <div class="tools"><button class="ib ib-sm ${on?'ib-primary':''}" aria-pressed="${on}" data-act="q-enable" data-id="${l.id}"
        title="${on?'공개 중 (누르면 숨김)':'숨김 (누르면 공개)'}" aria-label="오늘의 질문 공개 전환">${icon('eye',14)}</button></div></div>`;
  };
  const cur = items.find(it => it.x.id === state.questionSel);
  const sel = cur?.x;

  if (!WIDE.matches)
    return items.map(it => it.x.id === state.questionSel
      ? row(it) + `<div class="detail">${questionTools(sel)}${questionForm(sel)}</div>` : row(it)).join('');
  return `<div class="split split-question">
      <div class="split-list">${items.map(row).join('')}</div>
      <div class="pane"><div class="pane-head"><h3>${lessonNo(sel, cur.no)} ${esc(sel.title)}</h3>${questionTools(sel)}</div>
        <div class="dscroll">${questionForm(sel)}</div></div></div>`;
}
function questionTools(l){
  if (!l.parts?.question) return '';
  return `<div class="tools"><button class="ib ib-primary" data-act="q-save" data-id="${l.id}" title="저장" aria-label="저장">${icon('check',16)}</button></div>`;
}
/* 질문과 설명문 칸. 글 칸에는 테두리를 꼭 둔다(선생님 지시 2026-10-29, CSS .qform).
   설명문 글 칸 오른쪽 아래에 글자수가 희미하게 뜬다(선생님 지시 2026-10-29).
   치는 대로 바뀌어야 하는데 다시 그리면 커서가 날아가므로, 아래 input 핸들러가 이 칸만 글로 고쳐 쓴다. */
function questionForm(l){
  const q = l.parts?.question;
  if (!q) return `<div class="empty">오늘의 질문이 꺼져 있습니다.</div>`;
  // 미션 활동 세부 칸과 같은 모양: 이름표 + 글 칸 한 줄씩
  return `<div class="qform">
      <div class="row row-top"><div class="t gen-label">질문</div>
        <textarea class="f grow" id="q-ed-prompt" rows="3" aria-label="질문">${esc(q.question || '')}</textarea></div>
      <div class="row row-top"><div class="t gen-label">설명문</div>
        <div class="grow tacount-wrap">
          <textarea class="f" id="q-ed-guide" rows="10" aria-label="설명문">${esc(q.guide || '')}</textarea>
          <span class="tacount" id="q-ed-guide-n">${(q.guide || '').length}자</span>
        </div></div>
    </div>`;
}

/* 답변과 PICK의 고르개: 강의 드롭다운(오늘의 질문이 켜진 강의만) + 전체, 반 버튼.
   고른 반(또는 전체)의 연결 강의들을 targets로 돌려준다. */
function questionAnswers(rooms, placed, lessons){
  // 최신 강의가 맨 위, 처음 고르는 것도 최신 강의(요구사항 112)
  const qLessons = lessons.map((l, i) => ({ l, no:i + 1 })).filter(x => x.l.parts?.question).reverse();
  if (!qLessons.length) return `<div class="empty">오늘의 질문이 켜진 강의가 없습니다.</div>`;
  if (!qLessons.some(x => x.l.id === state.questionLessonId)) state.questionLessonId = qLessons[0].l.id;
  const lesson = M.getLesson(state.questionLessonId);

  // 이 강의를 연결한 반만 버튼이 된다
  const withCl = rooms.map(c => ({ c, cl:placed[c.id].find(x => x.lessonId === lesson.id) })).filter(x => x.cl);
  if (state.questionRoom !== 'all' && !withCl.some(x => x.c.id === state.questionRoom)) state.questionRoom = 'all';
  const targets = state.questionRoom === 'all' ? withCl : withCl.filter(x => x.c.id === state.questionRoom);

  const one = targets.length === 1 && state.questionRoom !== 'all' ? targets[0].cl : null;
  // 강의실 관리의 강의 진도 줄과 같은 눈 모양 단추(선생님 지시 2026-10-29: 글자 단추가 너무 컸다).
  const openBtn = one ? `<button class="ib ib-sm ${one.isOpen?'ib-primary':''}" data-act="cl-open" data-id="${one.id}"
      title="${one.isOpen?'공개 중 (누르면 숨김)':'숨김 (누르면 공개)'}" aria-label="공개 전환">${icon('eye',14)}</button>` : '';
  // 첫 줄: 강의 드롭다운 옆에 반 태그(선생님 지시 2026-10-28). 공개 토글은 줄 끝.
  const pickers = `<div class="qbar">
    <select class="sel sel-lesson" data-act="q-lesson" aria-label="강의">
      ${qLessons.map(x => `<option value="${x.l.id}" ${x.l.id===lesson.id?'selected':''}>${lessonNo(x.l, x.no)} ${esc(x.l.title)}</option>`).join('')}
    </select>
    ${catline(withCl.map(x => ({ v:x.c.id, label:`${x.c.classNo}반` })), state.questionRoom, 'q-room', '전체',
      openBtn ? `<span class="line-end">${openBtn}</span>` : '')}</div>`;

  const q = lesson.parts.question;
  // 질문과 안내문 묶음. 아래 탭 줄과 붙어 보이지 않게 .qinfo로 간격을 둔다(선생님 지시 2026-10-28).
  const info = q.question ? `<div class="qinfo"><div class="row"><div class="grow"><div class="t">${esc(q.question)}</div>
    ${q.guide ? `<div class="s">${esc(q.guide)}</div>` : ''}</div></div></div>` : '';

  const subs = targets.flatMap(x => M.getQuestionSubs(x.cl.id));
  const byNo = (a, b) => String(a.studentNo).localeCompare(String(b.studentNo), undefined, { numeric:true });

  if (state.questionTab === 'pick'){
    const picked = subs.filter(s => s.shared).sort(byNo);
    const body = picked.length ? picked.map(s => `<div class="row">
      <div class="grow"><div class="t"><span class="mono">${esc(s.studentNo)}</span> &nbsp;${esc(s.name)}</div>
        <div class="s ans">${esc(s.answer)}</div></div>
      <div class="tools">
        <button class="ib ib-sm ib-primary" data-act="q-share" data-id="${s.id}" title="PICK에서 내리기" aria-label="PICK에서 내리기">${icon('star',14)}</button>
      </div></div>`).join('') : `<div class="empty">공유로 켜 둔 답변이 없습니다.</div>`;
    // 답변 탭의 채점, 통과, 미흡 줄과 같은 자리라 같은 탭 줄 모양으로 둔다(선생님 지시 2026-10-29: 글씨 크기를 맞춘다)
    return pickers + info + catline([{ v:'pick', label:`PICK (${picked.length})` }], 'pick', 'q-pick-tab', null, '', 'gtabs') + body;
  }

  return pickers + info + questionGrade(targets, subs, one);
}

/* 채점 본문: hoistory 채점 모달(thUpdateGradeSummary, thRenderGradeBody)을 옮긴 것.
   판정은 언제나 M.questionVerdict 하나로 한다. 성적의 자동 끌어오기도 같은 함수를 쓰므로
   여기서 누른 통과/미흡과 AI 채점 결과가 성적에 그대로 이어진다.
   미흡 인원에는 미제출이 들어간다(hoistory와 같다).
   세 탭(채점, 통과, 미흡)이 모두 같은 답변 줄(answerRow)을 쓴다: 통과와 미흡에서 명단만
   보이던 것을 선생님 지시로 고쳤다(2026-10-28). 미제출 학생만 답변 없이 이름 줄로 선다. */
function answerRow(s, v){
  const res = s.graded
    ? `<span class="gnote ${verdictCls(s.aiVerdict)}">${esc(s.aiVerdict || '')} / ${s.aiPt ?? 0}pt</span>`
    : `<span class="gnote muted">미채점</span>`;
  return `<div class="row">
    <div class="grow"><div class="t"><span class="mono">${esc(s.studentNo)}</span> &nbsp;${esc(s.name)}${res}
        <span class="gsub">${v.length}자</span></div>
      <div class="s ans">${esc(s.answer)}</div></div>
    <div class="tools">
      <button class="btn-chip chip-pass ${v.achieved?'on':''}" data-act="q-verdict" data-id="${s.id}" data-v="pass">통과</button>
      <button class="btn-chip chip-fail ${v.achieved?'':'on'}" data-act="q-verdict" data-id="${s.id}" data-v="fail">미흡</button>
      <button class="ib ib-sm ${s.shared?'ib-primary':''}" data-act="q-share" data-id="${s.id}" title="${s.shared?'PICK에 올림 (누르면 내림)':'PICK에 올리기'}" aria-label="PICK 전환">${icon('star',14)}</button>
    </div></div>`;
}
/* 판정 문구의 색 (선생님 지시 2026-10-29: "통과는 초록, 미흡은 빨강. 모든 규칙에서 적용").
   문구로 가린다: 미흡 사유가 늘어도(50자 미만, 조금 미흡, 지연 제출, 교사) 여기를 고칠 일이 없다. */
function verdictCls(text){
  const t = String(text || '');
  if (t.includes('미흡')) return 'bad';
  if (t.includes('통과')) return 'good';
  return '';
}
// 미제출 학생 줄: 답변이 없어 통과, 미흡 버튼도 달지 않는다. 미제출도 미흡 사유라 빨강이다.
function absentRow(st){
  return `<div class="row">
    <div class="grow"><div class="t"><span class="mono">${esc(st.studentNo)}</span> &nbsp;${esc(st.name)}
      <span class="gnote bad">미제출</span></div></div></div>`;
}
function questionGrade(targets, subs, one){
  const byNo = (a, b) => String(a.studentNo).localeCompare(String(b.studentNo), undefined, { numeric:true });
  const absent = targets.flatMap(({ c, cl }) => {
    const done = new Set(M.getQuestionSubs(cl.id).map(s => s.studentNo));
    return M.getStudentsByCourse(c.id).filter(st => !done.has(st.studentNo));
  }).sort(byNo);
  const judged = subs.map(s => ({ s, v:M.questionVerdict(s) })).sort((a,b) => byNo(a.s, b.s));
  const failing = judged.filter(x => !x.v.achieved);
  const passing = judged.filter(x => x.v.achieved);

  // 셋째 줄: 채점, 통과, 미흡 탭과 AI 채점, 재채점 버튼을 한 줄에(선생님 지시 2026-10-28).
  const ungraded = subs.filter(s => !s.graded).length, graded = subs.length - ungraded;
  const busy = state.questionAiBusy;
  const actions = `<span class="line-end">
      ${state.questionAiStatus ? `<span class="gnote">${esc(state.questionAiStatus)}</span>` : ''}
      <button class="btn-chip" data-act="q-ai-run" ${ungraded && !busy ? '' : 'disabled'}>${icon('sparkles',13)}AI 채점${ungraded ? ` (미채점 ${ungraded})` : ''}</button>
      ${graded ? `<button class="btn-chip" data-act="q-ai-regrade" ${busy ? 'disabled' : ''}>${icon('rotate-ccw',13)}재채점 (${graded}명)</button>` : ''}
      ${one ? `<button class="btn-chip" data-act="q-go-scores" data-id="${one.id}">${icon('trophy',13)}성적 입력으로</button>` : ''}
    </span>`;
  const gtabs = catline([
    { v:'grade', label:'채점' },
    { v:'pass',  label:`통과 (${passing.length})`, cls:'cat-pass' },
    { v:'fail',  label:`미흡 (${absent.length + failing.length})`, cls:'cat-fail' },
  ], state.questionGradeTab, 'q-gtab', null, actions, 'gtabs');

  let body;
  if (state.questionGradeTab === 'pass'){
    body = passing.length
      ? passing.map(({ s, v }) => answerRow(s, v)).join('')
      : `<div class="empty">통과한 학생이 없습니다.</div>`;
  } else if (state.questionGradeTab === 'fail'){
    // 미흡 사유별로 묶는다(hoistory: 미제출, 50자 미만, AI 분석 미흡).
    const groups = [
      ['미제출', absent.map(st => absentRow(st))],
      ['50자 미만', failing.filter(x => x.v.verdict === '미흡(50자 미만)').map(({ s, v }) => answerRow(s, v))],
      ['AI 채점 미흡', failing.filter(x => x.v.verdict === '조금 미흡').map(({ s, v }) => answerRow(s, v))],
      ['선생님 미흡', failing.filter(x => x.v.verdict === '미흡(교사)').map(({ s, v }) => answerRow(s, v))],
    ].filter(g => g[1].length);
    body = groups.length
      ? groups.map(([label, rows]) => `<div class="sectionlabel bad">${label} (${rows.length})</div>${rows.join('')}`).join('')
      : `<div class="empty">미흡 학생이 없습니다.</div>`;
  } else {
    body = judged.length
      ? judged.map(({ s, v }) => answerRow(s, v)).join('')
      : `<div class="empty">제출된 답변이 없습니다.</div>`;
  }
  return gtabs + body;
}

// 지금 고른 강의와 반(또는 전체)의 연결 강의 id들. AI 채점이 이 단위로 돈다.
function questionTargetClIds(){
  const rooms = M.getCourses(state.year).filter(c => c.subject === state.questionSubject
    && (state.questionRoom === 'all' || c.id === state.questionRoom));
  return rooms.map(c => M.getCourseLessons(c.id).find(cl => cl.lessonId === state.questionLessonId)?.id).filter(Boolean);
}

// AI 채점과 재채점: 반마다 차례로 돈다. 끝나면 다시 그린다. 진행 문구는 버튼 줄 옆에 뜬다.
async function runQuestionAI(regrade){
  const clIds = questionTargetClIds(); if (!clIds.length || state.questionAiBusy) return;
  if (regrade){
    const n = clIds.reduce((t, id) => t + M.getQuestionSubs(id).filter(s => s.graded).length, 0);
    const ok = await confirmDelete({ title:'재채점',
      bodyHtml:`${n}명의 채점과 손으로 정한 통과, 미흡을 지우고 다시 채점합니다.`, okText:'재채점' });
    if (!ok) return;
  }
  state.questionAiBusy = true; render();
  const onStatus = msg => { state.questionAiStatus = msg; render(); };
  let n = 0;
  try {
    for (const id of clIds) n += await (regrade ? M.regradeQuestionsAI : M.gradeQuestionsAI)(id, onStatus);
    toast(`${n}명을 채점했습니다.`);
  } catch(e){ toast(e.message || '채점하지 못했습니다.'); }
  state.questionAiBusy = false; state.questionAiStatus = ''; render();
}

/* ── 형성평가 ──
   성적에 들어가지 않는다(요구사항 70). 문제 유형은 단답, OX, 초성, 선택형 넷(2026-10-27).
   오늘의 질문과 같이 **과목 탭 아래 연결 강의 전체**를 세운다(선생님 지시 2026-10-29:
   "형성평가는 강의랑 연동되어야 하니까 오늘의 질문처럼 연결된 강의에서 생성할 수 있게").
   전에는 형성평가가 이미 있는 강의만 보여 줘서 새로 만들 길이 없었다.
   서브 메뉴 둘:
     문제 관리   : 두 단. 왼쪽은 연결 강의 전체(눈 단추로 형성평가를 켜고 끈다),
                   오른쪽은 고른 강의의 문항 목록과 문제 만들기 칸
     성취도 관리 : 학생들이 푼 결과. 강의별과 전체 누적을 같은 드롭다운에서 고른다 */
function pageFormative(){
  const tabs = catline(M.ADMIN_SUBMENUS.formative, state.formativeTab, 'fm-tab');
  const head = `<div class="pagehead"><h2>${esc(M.menuName('formative'))}</h2></div>${tabs}`;

  const all = M.getCourses(state.year);
  if (!all.length) return head + `<div class="empty">강의실이 없습니다.</div>`;
  const subjects = [...new Set(all.map(c => c.subject))].sort((a,b) => a.localeCompare(b,'ko'));
  if (!subjects.includes(state.formativeSubject)) state.formativeSubject = subjects[0];
  const subTabs = catline(subjects.map(s => ({ v:s, label:s })), state.formativeSubject, 'fm-subject');
  const rooms = all.filter(c => c.subject === state.formativeSubject)
    .slice().sort((a,b) => a.grade - b.grade || a.classNo - b.classNo);
  const { placed, lessons } = placedLessons(rooms);

  if (state.formativeTab === 'result') return head + subTabs + formativeResultPanel(rooms, placed, lessons);
  return head + subTabs + formativeManage(lessons);
}

/* 문제 관리: 왼쪽은 연결 강의 전체(차수, 제목, 눈 단추), 오른쪽은 고른 강의의 문항.
   눈 단추가 형성평가 칸을 켜고 끈다(오늘의 질문 질문 관리와 같은 길, M.setFormativeEnabled).
   끈 강의의 문항은 partsOff에 맡겨 두었다가 다시 켜면 되살아난다. */
function formativeManage(lessons){
  if (!lessons.length) return `<div class="empty">연결된 강의가 없습니다.</div>`;
  const items = numberedNewest(lessons);   // 최신 강의가 맨 위(요구사항 112)
  if (!lessons.some(l => l.id === state.formativeLessonId))
    state.formativeLessonId = WIDE.matches ? items[0].x.id : null;

  const row = ({ x:l, no }) => {
    const on = !!l.parts?.formative;
    const n = on ? (l.parts.formative.items || []).length : 0;
    return `<div class="row compact ${l.id===state.formativeLessonId?'on':''}">
      <div class="grow rowlink" data-act="fm-open" data-id="${l.id}"><div class="t">${lessonNo(l, no)} ${esc(l.title)}${
        on && n ? `<span class="gsub">${n}문항</span>` : ''}</div></div>
      <div class="tools"><button class="ib ib-sm ${on?'ib-primary':''}" aria-pressed="${on}" data-act="fm-enable" data-id="${l.id}"
        title="${on?'형성평가 있음 (누르면 끕니다)':'없음 (누르면 켭니다)'}" aria-label="형성평가 켜고 끄기">${icon('eye',14)}</button></div></div>`;
  };
  const sel = lessons.find(l => l.id === state.formativeLessonId);

  if (!WIDE.matches)
    return items.map(it => it.x.id === state.formativeLessonId
      ? row(it) + `<div class="detail">${formativeEditor(it.x)}</div>` : row(it)).join('');
  return `<div class="split split-formative">
      <div class="split-list">${items.map(row).join('')}</div>
      <div class="pane"><div class="dscroll">${formativeEditor(sel)}</div></div></div>`;
}

/* 문항 목록과 문제 만들기. 꺼진 강의는 켜라는 말만 띄운다(왼쪽 눈 단추로 켠다).
   문제 유형은 가로 한 줄로 늘어놓고(선생님 지시 2026-10-29) 고르면 그 아래에 그 유형의 칸이 뜬다. */
function formativeEditor(l){
  if (!l.parts?.formative) return `<div class="empty">형성평가가 꺼져 있습니다.</div>`;
  const items = l.parts.formative.items || [];
  const deck = items.length ? items.map((it, i) => `<div class="partrow ${state.fmEditIdx===i?'on':''}">
      <span class="plnum">${i + 1}</span>
      <div class="grow"><div class="t">${esc(it.q || '')}</div>
        <div class="s">${esc(M.formativeTypeDef(it.type)?.name || '')} ${esc(fmAnswerText(it))}</div></div>
      <div class="tools">
        <button class="ib ib-sm" data-act="fm-it-up" data-id="${l.id}" data-k="${i}" ${i===0?'disabled':''} title="위로" aria-label="위로">${icon('arrow-up',14)}</button>
        <button class="ib ib-sm" data-act="fm-it-down" data-id="${l.id}" data-k="${i}" ${i===items.length-1?'disabled':''} title="아래로" aria-label="아래로">${icon('arrow-down',14)}</button>
        <button class="ib ib-sm" data-act="fm-it-edit" data-id="${l.id}" data-k="${i}" title="수정" aria-label="수정">${icon('pencil',14)}</button>
        <button class="ib ib-sm ib-danger" data-act="fm-it-del" data-id="${l.id}" data-k="${i}" title="삭제" aria-label="삭제">${icon('trash-2',14)}</button>
      </div></div>`).join('') : `<div class="empty">문항이 없습니다.</div>`;

  return `<div class="sectionlabel">문항</div>${deck}
    <div class="sectionlabel">${state.fmEditIdx == null ? '문제 만들기' : `${state.fmEditIdx + 1}번 문항 고치기`}</div>
    ${fmTypeLine()}${fmForm(l)}`;
}
// 문항 목록 줄에 답을 짧게 적는다(열지 않고도 무슨 문제인지 알게).
function fmAnswerText(it){
  if (it.type === 'choice' || it.type === 'combo') return `정답 ${(it.choices || [])[it.a] ?? ''}`;
  return `정답 ${it.a ?? ''}`;
}
/* 문제 유형 가로 줄(선생님 지시 2026-10-29: "문제 유형은 가로로 나열해서 선택할 수 있게").
   이미 있는 카테고리 줄(catline)을 그대로 쓴다: 가로 한 줄에 글자만, 켜진 것은 굵은 레드에 밑줄.
   유형 하나는 늘 골라 둔다. 처음에는 단답.
   고치는 중에 유형을 바꿔도 적어 둔 문제 글은 남는다(답만 유형에 맞게 비워진다). */
function fmTypeLine(){
  return catline(M.FORMATIVE_TYPES.map(t => ({ v:t.key, label:t.name })), fmCurType(), 'fm-type');
}
function fmCurType(){ return state.fmNewType || M.FORMATIVE_TYPES[0].key; }

/* 문제 만들기 칸(선생님 지시 2026-10-29: "문제 내는건 ZEP에서 하는 거처럼").
   유형을 고르면 그 유형의 칸이 뜨고 적어서 넣는다.
     진위형 : O와 X 중 하나
     초성형 : 정답 한 칸 (초성은 교사가 문제 글에 직접 적는다, 자동 생성 안 한다)
     단답형 : 정답 한 칸
     선택형 : 제시문(비워도 됨) + 선택지 다섯에 정답 라디오 (빈 선택지는 저장할 때 떨어진다)
     합답형 : 제시문 + 보기(ㄱㄴㄷㄹ 텍스트) + 선택지 다섯에 정답 라디오 */
const FM_NCHOICES = 5;
function fmForm(l){
  const t = fmCurType();
  const e = state.fmEditIdx == null ? null : (l.parts.formative.items || [])[state.fmEditIdx];
  const d = (e && e.type === t) ? e : null;   // 답은 유형이 같을 때만 되살린다
  const line = (label, ctl) => `<div class="row row-top"><div class="t gen-label">${label}</div>${ctl}</div>`;

  let extra = '', answer;
  if (t === 'ox'){
    answer = line('정답', `<div class="grow fmox">
      ${['O','X'].map(v => `<label class="fmoxb"><input type="radio" class="fmradio" name="fm-a" value="${v}" ${d?.a===v?'checked':''}>${v}</label>`).join('')}
    </div>`);
  } else if (t === 'choice' || t === 'combo'){
    const ch = d?.choices || [];
    if (t === 'combo')
      extra += line('보기', `<textarea class="f grow" id="fm-options" rows="4" aria-label="보기">${esc(d?.options || '')}</textarea>`);
    extra = line('제시문', `<textarea class="f grow" id="fm-passage" rows="3" aria-label="제시문">${esc(d?.passage || '')}</textarea>`) + extra;
    answer = `<div class="row row-top"><div class="t gen-label">선택지</div><div class="grow fmchoices">
      ${Array.from({ length:FM_NCHOICES }, (_, i) => `<div class="fmchoice">
        <input type="radio" class="fmradio" name="fm-a" value="${i}" ${d && d.a===i?'checked':''} aria-label="${i + 1}번이 정답">
        <input class="f grow" id="fm-c${i}" value="${esc(ch[i] || '')}" aria-label="선택지 ${i + 1}">
      </div>`).join('')}
    </div></div>`;
  } else {
    answer = line('정답', `<input class="f grow" id="fm-a" value="${esc(d?.a || '')}" aria-label="정답">`);
  }

  const tools = state.fmEditIdx == null
    ? `<button class="btn-add" data-act="fm-it-add" data-id="${l.id}" title="추가" aria-label="추가">${icon('plus',16)}<span>추가</span></button>`
    : `<button class="btn-add" data-act="fm-it-save" data-id="${l.id}" data-k="${state.fmEditIdx}" title="저장" aria-label="저장">${icon('check',16)}<span>저장</span></button>
       <button class="btn-chip" data-act="fm-it-cancel">취소</button>`;

  return `<div class="fmform">
      ${line('문제', `<textarea class="f grow" id="fm-q" rows="2" aria-label="문제">${esc(e?.q || '')}</textarea>`)}
      ${extra}
      ${answer}
      <div class="fmform-tools">${tools}</div>
    </div>`;
}
// 문제 만들기 칸에 적힌 것을 읽는다(유형마다 칸이 다르다). 다듬고 따지는 것은 model.js가 한다.
function fmReadForm(){
  const t = fmCurType();
  const q = val('fm-q');
  if (t === 'ox'){
    const picked = document.querySelector('input[name="fm-a"]:checked');
    return { type:t, q, a:picked?.value || '' };
  }
  if (t === 'choice' || t === 'combo'){
    const picked = document.querySelector('input[name="fm-a"]:checked');
    const raw = { type:t, q, a:picked ? +picked.value : -1,
      choices:Array.from({ length:FM_NCHOICES }, (_, i) => val(`fm-c${i}`)), passage:val('fm-passage') };
    if (t === 'combo') raw.options = val('fm-options');
    return raw;
  }
  return { type:t, q, a:val('fm-a') };
}

/* 성취도 관리 (선생님 지시 2026-10-29: "학생들이 푼 정답률, 오답률 이런거 확인하는거야 학생명단으로 끌고와서").
   같은 날 보강: "강의별, 전체 누적 이렇게 다양하게 볼수 있게." 드롭다운 맨 위가 전체 누적이다.
     전체 누적 : 그 과목에서 형성평가가 켜진 연결 강의를 다 더한다. 응시 열이 몇 개를 풀었는지 알려 준다
     강의별    : 그 강의를 연결한 반만 선다
   고르개 줄 모양은 오늘의 질문 답변과 같다(드롭다운 + 반 카테고리 줄, 전체 포함).
   맞고 틀림은 문제 안의 답(items[].a)과 견주어 M.formativeResult가 센다. 안 쓴 문항은 오답으로 센다. */
const FM_ALL = '__all__';
function formativeResultPanel(rooms, placed, lessons){
  // 형성평가가 켜진 연결 강의만. 차수는 진도 관리와 같이 연결한 차례에서 나온다
  const fmLessons = lessons.map((l, i) => ({ l, no:i + 1 })).filter(x => x.l.parts?.formative).reverse();   // 최신이 위
  if (!fmLessons.length) return `<div class="empty">형성평가가 켜진 강의가 없습니다.</div>`;
  const cum = state.formativeResultId === FM_ALL;
  if (!cum && !fmLessons.some(x => x.l.id === state.formativeResultId)) state.formativeResultId = FM_ALL;

  // 전체 누적은 그 과목 반을 다 세우고, 강의별은 그 강의를 연결한 반만 세운다
  const target = cum ? fmLessons : fmLessons.filter(x => x.l.id === state.formativeResultId);
  const withRooms = rooms
    .map(c => ({ c, cls:target.map(x => ({ x, cl:placed[c.id].find(p => p.lessonId === x.l.id) })).filter(y => y.cl) }))
    .filter(x => x.cls.length);
  if (state.formativeRoom !== 'all' && !withRooms.some(x => x.c.id === state.formativeRoom)) state.formativeRoom = 'all';
  const picked = state.formativeRoom === 'all' ? withRooms : withRooms.filter(x => x.c.id === state.formativeRoom);

  const pickers = `<div class="qbar">
    <select class="sel sel-lesson" data-act="fm-result-lesson" aria-label="볼 범위">
      <option value="${FM_ALL}" ${cum?'selected':''}>전체 누적</option>
      ${fmLessons.map(x => `<option value="${x.l.id}" ${x.l.id===state.formativeResultId?'selected':''}>${lessonNo(x.l, x.no)} ${esc(x.l.title)}</option>`).join('')}
    </select>
    ${catline(withRooms.map(x => ({ v:x.c.id, label:M.roomNo(x.c) })), state.formativeRoom, 'fm-room', '전체')}</div>`;

  // 학생마다 범위 안의 형성평가를 다 더한다
  const byNo = (a, b) => String(a.no).localeCompare(String(b.no), undefined, { numeric:true });
  const rows = picked.flatMap(({ c, cls }) => {
    const scan = cls.map(({ x, cl }) => ({ items:x.l.parts.formative.items || [], subs:M.getFormativeSubs(cl.id) }));
    return M.getStudentsByCourse(c.id).map(st => {
      let done = 0, correct = 0, total = 0;
      scan.forEach(({ items, subs }) => {
        const sub = subs.find(s => s.studentNo === st.studentNo);
        if (!sub) return;
        done++;
        const r = M.formativeResult(sub, items);
        correct += r.correct; total += r.total;
      });
      const pct = total ? Math.round(correct / total * 100) : 0;
      return { no:st.studentNo, name:st.name, taken:cls.length, done, correct, total, pct };
    });
  }).sort(byNo);
  if (!rows.length) return pickers + `<div class="empty">학생이 없습니다.</div>`;

  const body = rows.map(r => {
    const name = `<td class="lname"><span class="mono">${esc(r.no)}</span> &nbsp;${esc(r.name)}</td>`;
    const taken = cum ? `<td class="num">${r.done} / ${r.taken}</td>` : '';
    if (!r.done) return `<tr>${name}${taken}<td class="num"><span class="gnote muted">미제출</span></td><td class="num"></td><td class="num"></td></tr>`;
    return `<tr>${name}${taken}
      <td class="num">${r.correct} / ${r.total}</td>
      <td class="num"><span class="ox good">${r.pct}%</span></td>
      <td class="num"><span class="ox bad">${100 - r.pct}%</span></td></tr>`;
  }).join('');

  return pickers + `<div class="prog-wrap"><table class="prog scoretable">
      <thead><tr><th class="lname">학생</th>${cum ? '<th class="num">응시</th>' : ''}
        <th class="num">정답</th><th class="num">정답률</th><th class="num">오답률</th></tr></thead>
      <tbody>${body}</tbody></table></div>`;
}

/* ── 일반 설정 (선생님 지시 2026-10-28) ──
   화면 문구를 코드에 박지 않고 여기서 직접 심고 바꾼다(model.js의 TEXT_FIELDS 규칙 참고).
   비워 두면 기본값이 그대로 쓰인다. 칸마다 따로 저장하지 않고 저장 버튼 하나로 한 번에 쓴다. */
function pageGeneral(){
  const draft = state.genDraft || {};
  const textVal = key => draft[key] ?? M.getText(key);
  const groups = M.TEXT_FIELDS.map(g => `<div class="gen-col">
    <div class="sectionlabel">${esc(g.group)}</div>
    ${g.items.map(f => `<div class="row">
      <div class="t gen-label">${esc(f.label)}</div>
      <input class="f grow" data-text-key="${f.key}" value="${esc(textVal(f.key))}" aria-label="${esc(f.label)}">
    </div>`).join('')}</div>`).join('');

  // 어드민 메뉴: 이름을 고치고 위아래로 옮긴다. 구분선도 한 줄로 서서 같이 옮긴다(선생님 지시 2026-10-29).
  // 옮긴 순서와 고친 이름은 저장 버튼을 눌러야 왼쪽 메뉴에 들어간다.
  const order = state.menuDraft || M.getMenuOrder();
  const last = order.length - 1;
  const moveBtns = i => `<div class="tools">
      <button class="ib ib-sm" data-act="menu-move" data-i="${i}" data-v="-1" ${i===0?'disabled':''} title="위로" aria-label="위로">${icon('arrow-up',14)}</button>
      <button class="ib ib-sm" data-act="menu-move" data-i="${i}" data-v="1" ${i===last?'disabled':''} title="아래로" aria-label="아래로">${icon('arrow-down',14)}</button>
    </div>`;
  const menuRows = order.map((k, i) => {
    if (k === M.MENU_SEP) return `<div class="row menu-sep-row"><div class="grow"><div class="menu-sep-line"></div></div>${moveBtns(i)}</div>`;
    const m = M.ADMIN_MENUS.find(x => x.key === k);
    return `<div class="row">
      <span class="menu-ico">${icon(m.icon,16)}</span>
      <input class="f grow" data-text-key="menu_${k}" value="${esc(draft['menu_' + k] ?? M.menuName(k))}" aria-label="${esc(m.name)} 메뉴 이름">
      ${moveBtns(i)}</div>`;
  }).join('');

  return `<div class="pagehead"><h2>${esc(M.menuName('general'))}</h2>
      <button class="btn-add" data-act="general-save" title="저장" aria-label="저장">${icon('check',16)}<span>저장</span></button></div>
    <div class="gen-cols">${groups}
      <div class="gen-col"><div class="sectionlabel">어드민 메뉴</div>${menuRows}</div></div>`;
}
// 다시 그리기 전에 일반 설정 칸에 적던 글을 붙잡아 둔다(메뉴를 옮기면 화면을 다시 그리므로).
function keepGeneralDraft(){
  const d = state.genDraft || {};
  document.querySelectorAll('[data-text-key]').forEach(inp => { d[inp.dataset.textKey] = inp.value; });
  state.genDraft = d;
}

/* 안에서 내려가는 목록(.dscroll, .split-list)은 스크롤바를 감췄으므로, 더 있다는 것을 끝의 흐림으로
   알린다(선생님 지시 2026-10-29). 끝에 닿으면 그쪽 흐림은 걷히고, 내려갈 것이 없으면 아예 안 생긴다.
   좁은 화면의 펼침(.detail) 안 .dscroll은 스크롤 칸이 아니라 scrollHeight가 같아 그냥 지나간다. */
const FADE_SEL = '.dscroll, .split-list, .axpane-body';
function markFade(el){
  const more = el.scrollHeight - el.clientHeight;
  el.classList.toggle('fade-top', more > 1 && el.scrollTop > 1);
  el.classList.toggle('fade-bot', more > 1 && el.scrollTop < more - 1);
}
function wireFades(){
  $main.querySelectorAll(FADE_SEL).forEach(el => {
    markFade(el);
    el.addEventListener('scroll', () => markFade(el), { passive:true });
  });
  // 글꼴이 늦게 와서 줄 높이가 바뀌는 일이 있어 한 번 더 본다
  requestAnimationFrame(() => $main.querySelectorAll(FADE_SEL).forEach(el => markFade(el)));
}
addEventListener('resize', () => $main.querySelectorAll(FADE_SEL).forEach(el => markFade(el)), { passive:true });
addEventListener('resize', wireDesignStage, { passive:true });

// ── 렌더 ──
function render(){
  renderSide();
  const p = { rooms:pageRooms, students:pageStudents, progress:pageProgress, notice:pageNotice,
              concept:pageConcept, mission:pageMission, question:pageQuestion, formative:pageFormative,
              scores:pageScores, general:pageGeneral }[state.page];
  $main.innerHTML = p ? p() : '';
  wireFades();
  wireDesignStage();
}

// ── 이벤트 위임 ──
document.getElementById('shell').addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, k = el.dataset.k, id = el.dataset.id, v = el.dataset.v, no = el.dataset.no;
  switch (act){
    case 'page':
      state.page = k; state.lessonId = null; state.editRoomId = null; state.roomDetailId = null;
      state.studentDetailNo = null; state.roomStudentEdit = false;
      state.conceptLessonId = null; state.formativeLessonId = null; state.formativeTab = 'manage';
      state.fmEditIdx = null; state.fmNewType = null;
      state.progMemoId = null; state.genDraft = null; state.menuDraft = null; render(); break;
    case 'set-year': state.year = +v; state.editRoomId = null; render(); break;
    case 'set-subject': state.fSubject = v; render(); break;
    case 'set-class': state.fClass = v === 'all' ? null : v; render(); break;
    case 'room-group': state.roomGroup = v; render(); break;
    case 'prog-subject': state.progSubject = v; render(); break;
    case 'set-sclass': state.studentClass = v; render(); break;

    case 'add-open': openAddModal(); break;

    // 강의실 상세(요구사항 6): 줄 아래로 펼침/접음. 같은 줄을 다시 누르면 닫는다.
    case 'room-open':
      // 넓은 화면에서는 고르기만 한다(오른쪽 상세가 늘 하나 떠 있다).
      state.roomDetailId = (!WIDE.matches && state.roomDetailId === id) ? null : id;
      state.openScore = null; state.editRoomId = null; state.roomLessonsMore = false;
      state.roomStudentEdit = false; render(); break;
    case 'room-lessons-more': state.roomLessonsMore = true; render(); break;
    case 'stu-edit-mode': state.roomStudentEdit = true; state.openScore = null; render(); break;
    case 'stu-edit-done': state.roomStudentEdit = false; render(); break;
    case 'stu-score-course': state.stuScoreCourseId = id; render(); break;   // 학생 관리 상세: 성적을 볼 과목
    case 'cl-open': M.toggleCourseLessonOpen(id); render(); break;   // 공개 토글(진도 관리와 같이 맞물림)
    // 강의 진도 줄의 바로가기: 미션 활동(연결한 앱 열기), 오늘의 질문 답변
    case 'cl-mission':
      openMissionAdmin(M.getMissionApps().find(a => a.lessonId === el.dataset.lid)); break;
    case 'cl-question': {
      const c = M.getCourse(id); if (!c) break;
      Object.assign(state, { page:'question', questionTab:'answers', questionSubject:c.subject,
        questionLessonId:el.dataset.lid, questionRoom:c.id, roomDetailId:null });
      render(); break;
    }
    case 'stu-score': {
      const key = `${id}_${no}`;
      state.openScore = state.openScore === key ? null : key; render(); break;
    }
    // 강의실 상세에서 건너올 때는 그 강의실의 과목 탭이 열려 있게 한다.
    case 'go-progress':
      state.page = 'progress'; state.progSubject = M.getCourse(id)?.subject ?? null;
      state.roomDetailId = null; render(); break;
    case 'go-lessons':
      state.page = 'concept'; state.conceptTab = 'library'; state.roomDetailId = null; state.lessonId = null; render(); break;
    case 'go-students': state.page = 'students'; state.studentClass = M.roomNo(M.getCourse(id)); state.roomDetailId = null; render(); break;

    case 'room-edit': state.editRoomId = id; render(); break;
    case 'room-cancel': state.editRoomId = null; render(); break;
    case 'room-save': {
      const subject = val('e-subject'), grade = val('e-grade'), classNo = val('e-class');
      if (!subject || !grade || !classNo){ toast('과목, 학년, 반을 적어 주세요.'); return; }
      const c = run(() => M.updateCourse(id, { subject, grade, classNo }));
      if (c){ state.editRoomId = null; toast(`${M.roomName(c)} 강의실로 저장했습니다.`); render(); }
      break;
    }
    case 'room-del': {
      const c = M.getCourse(id); if (!c) return;
      const name = M.roomName(c), d = M.courseDeps(id);
      const gone = [
        d.students ? `학생 ${d.students}명의 이 강의실 등록` : '',
        d.lessons  ? `연결 강의 ${d.lessons}개` : '',
        d.quizzes  ? `걸린 복습 ${d.quizzes}개` : '',
        d.subs     ? `제출물과 성적 ${d.subs}건` : '',
      ].filter(Boolean);
      confirmDelete({
        title: `${name} 강의실 삭제`,
        // 목록 끝 낱말이 무엇이냐에 따라 조사가 달라지므로 아예 조사를 쓰지 않는다
        bodyHtml: (gone.length
          ? `같이 없어지는 것: ${gone.join(', ')}.<ul><li>강의 내용 자체는 창고에 남습니다</li><li>학생은 학생 관리에 남습니다</li></ul>`
          : `되돌릴 수 없습니다.`) + `<br>지우려면 <b>${esc(name)}</b>을 그대로 적어 주세요.`,
        needText: name,
      }).then(ok => {
        if (!ok) return;
        M.deleteCourse(id);
        if (state.editRoomId === id) state.editRoomId = null;
        if (state.roomDetailId === id) state.roomDetailId = null;
        toast(`${name} 강의실을 삭제했습니다.`); render();
      });
      break;
    }

    case 'stu-add-open': openStudentModal(); break;
    case 'stu-open':
      state.studentDetailNo = (!WIDE.matches && state.studentDetailNo === no) ? null : no; render(); break;
    case 'stu-reset':   // 학생 관리 페이지의 초기화 버튼 (강의실 상세의 stu-pw-reset과 같은 길)
    case 'stu-pw-reset': {
      const nm = el.dataset.name || '';
      confirmDelete({
        title: '비밀번호 초기화',
        bodyHtml: `<p><b>${esc(no)} ${esc(nm)}</b> 학생의 비밀번호를 초기화합니다.<br>학생은 다음 로그인 때 비밀번호를 새로 만듭니다.</p>`,
        okText: '초기화',
      }).then(ok => {
        if (!ok) return;
        M.resetPassword(state.year, no)
          .then(() => toast('비밀번호를 초기화했습니다.'))
          .catch(err => { console.error('resetPassword', err); toast('초기화에 실패했습니다. 콘솔에서 직접 삭제해야 할 수 있습니다.'); });
      });
      break;
    }
    // 학생 삭제: 학년도 명부와 모든 강의실에서 지운다. 확인 창을 거친다(2026-10-29, 모르고 눌러 학생이 사라졌다).
    case 'stu-del': {
      const name = M.getStudentsByYear(state.year).find(s => s.studentNo === no)?.name || '';
      confirmDelete({
        title: `${no} ${name} 삭제`,
        bodyHtml: `${state.year}학년도 학생 관리와 모든 강의실에서 이 학생을 지웁니다.`
          + `<ul><li>강의실에서만 빼려면 수강 과목의 체크를 푸시면 됩니다</li></ul>`,
      }).then(ok => { if (!ok) return;
        M.removeStudentEverywhere(state.year, no);
        if (state.studentDetailNo === no) state.studentDetailNo = null;
        toast('삭제했습니다.'); render(); });
      break;
    }

    case 'lesson-add': {
      const title = val('l-title'); if (!title){ toast('강의 제목을 적어 주세요.'); return; }
      const num = val('l-num'); if (!num){ toast('강 번호를 적어 주세요.'); return; }
      const l = M.addLesson(title, num); state.lessonId = l.id; state.lessonTab = 'edit'; render(); break;
    }
    case 'lesson-from-worksheet': createLessonFromWorksheet(); break;   // 활동지 하나로 강의 통째로 만들기
    case 'lesson-open': state.lessonId = id; state.lessonTab = 'edit'; render(); break;
    case 'lesson-close': state.lessonId = null; render(); break;
    /* 강의 삭제. 강의실 삭제와 달리 내용 자체가 없어지므로
       제목을 그대로 치게 한다. 지운 뒤에는 그 강의를 가리키던 화면 상태를 다 풀어야 한다:
       안 풀면 다음 그리기에서 없는 강의를 찾아 빈 화면이 된다. */
    case 'lesson-del': {
      const l = M.getLesson(id); if (!l) break;
      const name = l.title, u = M.lessonUsage(id);
      const gone = [
        u.links  ? `강의실 연결 ${u.links}개` : '',
        u.subs   ? `제출물 ${u.subs}건` : '',
        u.grades ? `성적 ${u.grades}건` : '',
        u.apps   ? `미션 앱 연결 ${u.apps}개` : '',
      ].filter(Boolean);
      confirmDelete({
        title: `${name} 강의 삭제`,
        // 목록 끝 낱말에 따라 조사가 달라지므로 아예 조사를 쓰지 않는다(강의실 삭제와 같은 꼴)
        bodyHtml: `개념 노트, 미션 활동, 오늘의 질문, 형성평가에 적은 내용이 모두 없어집니다.`
          + (gone.length ? `<br>같이 없어지는 것: ${gone.join(', ')}.` : '')
          + (u.inGrade ? `<ul><li>성적 반영 강의 목록에서도 빠집니다</li></ul>` : '')
          + `<br>지우려면 <b>${esc(name)}</b>을 그대로 적어 주세요.`,
        needText: name,
      }).then(ok => {
        if (!ok) return;
        const res = M.deleteLesson(id);
        ['lessonId', 'conceptLessonId', 'questionSel', 'questionLessonId',
         'formativeLessonId', 'formativeResultId']
          .forEach(key => { if (state[key] === id) state[key] = null; });
        // 성적 화면이 고른 연결 강의(state.scClId)는 그리는 쪽이 스스로 고친다(pageScores)
        if (res?.inGrade) M.saveGradeConfig().catch(() => toast('성적 설정을 저장하지 못했습니다.'));
        toast(`${name} 강의를 삭제했습니다.`); render();
      });
      break;
    }
    case 'lesson-tab': state.lessonTab = v; render(); break;
    case 'part-toggle': M.setLessonPart(state.lessonId, k, !(M.getLesson(state.lessonId).order||[]).includes(k)); render(); break;
    case 'part-off': M.setLessonPart(state.lessonId, k, false); render(); break;
    case 'part-up': M.moveLessonPart(state.lessonId, k, -1); render(); break;
    case 'part-down': M.moveLessonPart(state.lessonId, k, 1); render(); break;
    // 강의 라이브러리의 강의 편집과 콘텐츠 탭 머리줄 둘이 같이 쓴다(data-id로 강의를 받는다)
    case 'lesson-import': { const lid = id || state.lessonId; if (lid) importWorksheet(lid); break; }
    case 'place-toggle': {
      // 데모: 연결만(해제는 다음 단계). 연결돼 있지 않으면 연결한다.
      const already = M.getCourseLessons(id).some(cl => cl.lessonId === state.lessonId);
      if (!already){ M.placeLesson(id, state.lessonId); toast('강의실에 연결했습니다.'); }
      else toast('해제는 다음 단계에서 붙입니다.');
      render(); break;
    }
    // 개념 노트
    case 'concept-tab': state.conceptTab = v; state.conceptLessonId = null; render(); break;
    // 개념 노트와 미션 활동의 페이지 편집기(pageEditor). 새 묶음과 새 페이지는 빈 칸 하나씩으로 시작한다
    case 'pg-add': editPages(el, pages => { pages.push({ title:'', rows:[{ label:'', text:'' }] }); }); render(); break;
    case 'pg-up': case 'pg-down': editPages(el, (pages, p) => {
      const j = p + (act === 'pg-up' ? -1 : 1);
      if (j < 0 || j >= pages.length) return false;
      [pages[p], pages[j]] = [pages[j], pages[p]];
    }); render(); break;
    case 'pg-row-add': editPages(el, (pages, p) => { pages[p]?.rows.push({ label:'', text:'' }); }); render(); break;
    case 'pg-row-del': editPages(el, (pages, p, r) => { pages[p]?.rows.splice(r, 1); }); render(); break;

    /* 페이지 합치기와 나누기 (선생님 지시 2026-10-30, 요구사항 139).
       원칙은 묶음 하나가 페이지 하나지만(활동지 변환이 그렇게 나눈다. shared/worksheet.js)
       "내용이 적어서 2개의 행을 1페이지로 합치고 싶을 수도" 있고 너무 많으면 나누고 싶다.
       셋 다 하는 일은 같다: 페이지 배열에서 묶음을 옮긴다. 제목은 나눌 때 그대로 되쓴다. */
    case 'pg-merge-up': editPages(el, (pages, p) => {
      const up = pages[p - 1], pg = pages[p];
      if (!up || !pg) return false;
      // 윗 페이지에 제목이 없으면 이 페이지의 제목을 가져간다(둘 다 있으면 윗 제목이 남는다)
      if (!up.title.trim()) up.title = pg.title;
      up.rows.push(...pg.rows);
      pages.splice(p, 1);
    }); render(); break;
    case 'pg-split-rows': editPages(el, (pages, p) => {
      const pg = pages[p];
      if (!pg || pg.rows.length < 2) return false;
      pages.splice(p, 1, ...pg.rows.map(r => ({ title: pg.title, rows: [r] })));
    }); render(); break;
    /* 묶음 하나가 너무 길 때 커서를 둔 줄부터 새 페이지로(선생님 지시: "1행을 2페이지로 나누는 기능").
       자리는 내용 칸에서 움직일 때마다 적어 둔 것을 쓴다(state.pgCut. 단추를 누르는 순간에는
       칸에서 포커스가 빠져 있어 커서를 읽을 수 없다). 그 아래 묶음들도 새 페이지로 같이 넘어간다. */
    case 'pg-row-cut': {
      const c = state.pgCut;
      const mine = c && c.id === id && c.k === k && c.p === +el.dataset.p && c.r === +el.dataset.r;
      let done = false;
      if (mine) editPages(el, (pages, p, r) => {
        const pg = pages[p], row = pg?.rows[r];
        if (!row || M.rowKind(row) === 'compare') return false;
        const lines = String(row.text || '').split('\n');
        if (c.line < 1 || c.line >= lines.length) return false;
        row.text = lines.slice(0, c.line).join('\n');
        const rest = { ...row, text: lines.slice(c.line).join('\n') };
        pages.splice(p + 1, 0, { title: pg.title, rows: [rest, ...pg.rows.splice(r + 1)] });
        done = true;
      });
      if (!done){ toast('내용 칸에서 나눌 줄을 먼저 눌러 주세요.'); break; }
      state.pgCut = null; render(); break;
    }
    case 'pg-del': {
      // 내용이 든 페이지는 지우기 전에 묻는다(빈 페이지는 바로 지운다)
      const pg = M.getPages(id, k)[+el.dataset.p]; if (!pg) break;
      const full = pg.title.trim() || pg.rows.some(M.rowFilled);
      const drop = () => { editPages(el, (pages, p) => { pages.splice(p, 1); }); render(); };
      if (!full){ drop(); break; }
      confirmDelete({ title:'페이지 삭제',
        bodyHtml:`<b>${esc(pg.title.trim() || `${+el.dataset.p + 1}페이지`)}</b>의 내용을 모두 지웁니다. 되돌릴 수 없습니다.` })
        .then(ok => { if (ok) drop(); });
      break;
    }

    /* 강의 슬라이드 축 편집기(요구사항 125, 126). 강의 고르기는 드롭다운이라 change 쪽에 있다.
       단계는 늘 하나 열려 있다(오른쪽 편집창이 비지 않게). 같은 줄을 다시 눌러도 닫지 않는다. */
    case 'axis-step': state.axisStep = k; render(); break;
    /* 저장: 칸은 커서가 빠질 때 이미 모델에 들어가 있다(pg-set, pg-title, deck-set).
       아직 칸 안에 커서가 있을 수 있으니 그것부터 흘려 보내고(blur가 change를 띄운다) 알린다.
       여기서 다시 그리지 않는다: 화면에 보이는 글이 이미 저장된 글이라 그릴 것이 없고,
       그리면 방금 적던 자리만 잃는다 */
    case 'axis-save':
      document.activeElement?.blur?.();
      toast('저장했습니다.'); break;
    // 올린 활동지 지우기(요구사항 133, 134). 올리기와 짝이고 강의 내용 전부를 비운다
    case 'axis-clear': if (id) clearAxisContent(id); break;
    // 미리보기는 학생이 보는 그 슬라이드를 그대로 새 탭에 띄운다(같은 slide-deck.js를 쓴다)
    case 'axis-preview':
      window.open(`slide.html?lesson=${encodeURIComponent(id)}`, '_blank', 'noopener'); break;
    case 'deck-add': M.deckAddItem(id, k); render(); break;
    case 'deck-add-break': M.deckAddReviewBreak(id); render(); break;   // 전시학습확인 '페이지 추가'
    case 'deck-add-q': M.deckInsertReviewItem(id, +el.dataset.at); render(); break;   // 페이지 안 '문제 추가'
    case 'deck-del-page': {   // 전시학습확인 페이지 삭제(마커 + 그 안 문항). 문항이 있으면 확인을 받는다
      const bi = +el.dataset.bi, cnt = +el.dataset.cnt;
      if (cnt > 0) confirmDelete({ title:'페이지 삭제',
          bodyHtml:`이 페이지와 그 안의 문항 <b>${cnt}</b>개를 지웁니다.`, okText:'삭제' })
        .then(ok => { if (ok){ M.deckDelReviewPage(id, bi, cnt); render(); } });
      else { M.deckDelReviewPage(id, bi, cnt); render(); }
      break;
    }
    case 'deck-up': M.deckMoveItem(id, k, +el.dataset.i, -1); render(); break;
    case 'deck-down': M.deckMoveItem(id, k, +el.dataset.i, 1); render(); break;
    case 'deck-del': M.deckDelItem(id, k, +el.dataset.i); render(); break;

    // 미션 활동: 앱 어드민은 브라우저 새 탭으로. 목록은 최신순이라 순서 단추가 없다
    case 'mission-admin': openMissionAdmin(M.getMissionApp(v)); break;
    // 고르기: 좁은 화면에서는 같은 줄을 다시 누르면 접는다(넓은 화면은 오른쪽 칸이 늘 떠 있다)
    case 'mission-sel': state.missionSel = (!WIDE.matches && state.missionSel === v) ? null : v; render(); break;
    case 'mission-add-open': state.missionSel = 'new'; render(); document.getElementById('ma-name')?.focus(); break;
    case 'mission-new-cancel': state.missionSel = null; render(); break;
    case 'mission-save': saveMission(v); break;
    case 'mission-del': {
      const a = M.getMissionApp(v); if (!a) break;
      confirmDelete({ title:`${a.name} 삭제`, bodyHtml:`연결을 지웁니다. 되돌릴 수 없습니다.`, needText:a.name })
        .then(ok => { if (!ok) return;
          M.deleteMissionApp(v);
          toast(`${a.name}을 지웠습니다.`); render(); });
      break;
    }

    // 공지사항: 미션 활동과 같은 길(고르기, 새 글, 저장, 삭제)
    case 'notice-subject': state.noticeSubject = v; state.noticeSel = null; render(); break;
    case 'notice-sel': state.noticeSel = (!WIDE.matches && state.noticeSel === v) ? null : v; render(); break;
    case 'notice-add-open': state.noticeSel = 'new'; render(); document.getElementById('nt-title')?.focus(); break;
    case 'notice-new-cancel': state.noticeSel = null; render(); break;
    case 'notice-save': saveNotice(v); break;
    case 'notice-del': {
      const n = M.getNotice(v); if (!n) break;
      confirmDelete({ title:'공지사항 삭제', bodyHtml:`<b>${esc(n.title)}</b> 글을 지웁니다. 되돌릴 수 없습니다.` })
        .then(ok => { if (!ok) return;
          M.deleteNotice(v); state.noticeSel = null;
          toast('삭제했습니다.'); render(); });
      break;
    }

    // 오늘의 질문
    case 'question-tab': state.questionTab = v; render(); break;
    case 'q-subject':
      state.questionSubject = v; state.questionLessonId = null; state.questionRoom = 'all';
      state.questionSel = null; render(); break;
    case 'q-room': state.questionRoom = v; render(); break;
    case 'q-gtab': state.questionGradeTab = v; render(); break;
    // 질문 관리에서 강의 고르기: 좁은 화면에서는 같은 줄을 다시 누르면 접는다
    case 'q-sel': state.questionSel = (!WIDE.matches && state.questionSel === id) ? null : id; render(); break;
    case 'q-enable': {   // 오늘의 질문 켜고 끄기(끄면 그 강의에서 그 칸이 빠진다)
      const on = !M.getLesson(id)?.parts?.question;
      M.setQuestionEnabled(id, on);
      render(); break;
    }
    case 'q-save':
      run(() => M.setQuestion(id, { question:val('q-ed-prompt'), guide:val('q-ed-guide') }), '저장했습니다.');
      break;
    case 'q-ai-run': runQuestionAI(false); break;
    case 'q-ai-regrade': runQuestionAI(true); break;
    case 'q-go-scores': {   // hoistory "성적 체크로": 같은 강의실, 같은 강의의 성적 입력으로
      const cl = M.getCourseLessons(state.questionRoom).find(x => x.id === id);
      Object.assign(state, { page:'scores', scTab:'input', scSubject:state.questionSubject,
                             scCourseId:state.questionRoom, scClId:cl?.id ?? null });
      render(); break;
    }
    case 'q-share': M.toggleSubShared(id); render(); break;
    // 통과/미흡을 손으로 못박는다(같은 것을 다시 누르면 자동 판정으로 되돌아간다)
    case 'q-verdict': M.setSubVerdict(id, v); render(); break;

    // 형성평가
    case 'fm-tab': state.formativeTab = v; state.fmEditIdx = null; render(); break;
    case 'fm-subject': state.formativeSubject = v; state.formativeLessonId = null;
      state.formativeResultId = null; state.formativeRoom = 'all'; state.fmEditIdx = null; render(); break;
    case 'fm-room': state.formativeRoom = v; render(); break;
    case 'fm-open':
      state.formativeLessonId = (!WIDE.matches && state.formativeLessonId === id) ? null : id;
      state.fmEditIdx = null; render(); break;
    // 형성평가 칸을 켜고 끈다(오늘의 질문 질문 관리와 같은 길). 끈 문항은 partsOff에 남는다
    case 'fm-enable':
      state.formativeLessonId = id; state.fmEditIdx = null;
      run(() => M.setFormativeEnabled(id, !M.getLesson(id)?.parts?.formative)); break;
    // 문제 유형 가로 줄: 고르면 그 유형의 칸이 뜬다
    case 'fm-type': state.fmNewType = v; render(); break;
    case 'fm-it-add': run(() => M.addFormativeItem(id, fmReadForm()), '문항을 넣었습니다.'); break;
    case 'fm-it-save':
      try { M.setFormativeItem(id, +k, fmReadForm()); state.fmEditIdx = null; toast('문항을 고쳤습니다.'); render(); }
      catch (e){ toast(e.message); }
      break;
    case 'fm-it-cancel': state.fmEditIdx = null; render(); break;
    case 'fm-it-edit': {
      const it = (M.getLesson(id)?.parts?.formative?.items || [])[+k];
      if (!it) break;
      state.fmEditIdx = +k; state.fmNewType = it.type; render(); break;
    }
    case 'fm-it-up':   run(() => M.moveFormativeItem(id, +k, -1)); break;
    case 'fm-it-down': run(() => M.moveFormativeItem(id, +k, 1)); break;
    case 'fm-it-del': {
      const it = (M.getLesson(id)?.parts?.formative?.items || [])[+k];
      if (!it) break;
      confirmDelete({ title:'문항 삭제', bodyHtml:`<b>${esc(it.q || '')}</b> 문항을 지웁니다.`, okText:'삭제' })
        .then(ok => { if (!ok) return; state.fmEditIdx = null; run(() => M.delFormativeItem(id, +k), '문항을 지웠습니다.'); });
      break;
    }

    // 성적
    case 'sc-tab': state.scTab = v; state.scOpenNo = null; render(); break;
    case 'sc-room': state.scCourseId = v; state.scClId = null; state.scOpenNo = null; render(); break;
    case 'sc-open':
      state.scOpenNo = (!WIDE.matches && state.scOpenNo === no) ? null : no; render(); break;
    // 이름을 누르면 결석(전부 미달성 고정). hoistory와 같다.
    case 'sc-absent': run(() => M.toggleGradeAbsent(id, no)); break;
    // 제출물에서 달성과 기한을 끌어온다. 손으로 정한 칸과 결석 학생은 건드리지 않는다.
    case 'sc-auto': {
      const r = run(() => M.applyAutoDetect(id));
      if (r) toast(r.touched ? `${r.touched}명을 끌어왔습니다.` : '새로 끌어올 것이 없습니다.');
      break;
    }
    case 'sc-publish': {
      const cl = M.toggleGradePublished(id);
      toast(cl?.gradePublished ? '이 반에 성적을 반영했습니다.' : '성적 반영을 내렸습니다.');
      render(); break;
    }
    // 영역 머리줄의 스위치: 그 강의의 그 칸을 켜고 끈다(그 강의를 연결한 모든 강의실 공통).
    case 'sc-part-enable': {
      const lid = el.dataset.lid;
      const on = !M.getLesson(lid)?.parts?.[k];
      M.setPartEnabled(lid, k, on);
      toast(`${M.partDef(k)?.name || ''}을 ${on ? '활성화' : '비활성화'}했습니다.`);
      render(); break;
    }
    // 피드백 템플릿 저장(한 줄에 하나). 급간 표와 같은 settings/grade 문서에 들어간다.
    case 'sc-fb-save': {
      M.setFeedbackTemplates(document.getElementById('sc-fb-tmpl')?.value ?? '');
      M.saveGradeConfig()
        .then(() => { toast('저장했습니다.'); render(); })
        .catch(() => toast('저장하지 못했습니다. 다시 시도해 주세요.'));
      break;
    }
    // 급간 표와 반영 강의 목록을 한 번에 쓴다(일반 설정의 저장 버튼과 같은 방식).
    case 'sc-config-save': {
      const bands = M.getBands().map((b, i) => {
        const out = { min:b.min };
        M.GRADE_AREAS.forEach(a => {
          out[a.key] = document.querySelector(`[data-band="${i}"][data-k="${a.key}"]`)?.value ?? b[a.key];
        });
        return out;
      });
      M.saveGradeConfig(bands)
        .then(() => { toast('저장했습니다.'); render(); })
        .catch(() => toast('저장하지 못했습니다. 다시 시도해 주세요.'));
      break;
    }

    // 진도 관리 (hoistory 진도 계획 틀)
    case 'prog-add-open': state.progAdding = true; render();
      document.getElementById('prog-new-title')?.focus(); break;
    case 'prog-add-cancel': state.progAdding = false; render(); break;
    case 'prog-add-save': {
      const t = val('prog-new-title');
      const n = val('prog-new-num'); if (!n){ toast('강 번호를 적어 주세요.'); return; }
      const r = run(() => M.addLessonToSubject(state.year, state.progSubject, t, n));
      if (r){ state.progAdding = false; toast(`${state.progSubject} 강의실 ${r.rooms}개에 연결했습니다.`); render(); }
      break;
    }
    case 'prog-place': {   // 그 반에만 빠져 있던 강의를 연결한다
      M.placeLesson(id, el.dataset.lid); render(); break;
    }
    case 'prog-memo':   // 같은 강의의 메모 버튼을 다시 누르면 닫는다
      state.progMemoId = state.progMemoId === el.dataset.lid ? null : el.dataset.lid; render();
      document.getElementById('prog-memo-text')?.focus(); break;
    case 'prog-memo-cancel': state.progMemoId = null; render(); break;
    case 'prog-memo-save':
      M.setLessonMemo(el.dataset.lid, val('prog-memo-text'));
      state.progMemoId = null; toast('메모를 저장했습니다.'); render(); break;
    case 'prog-del': {
      const l = M.getLesson(el.dataset.lid); if (!l) break;
      confirmDelete({
        title: `${l.title} 빼기`,
        bodyHtml: `${esc(state.progSubject)} 강의실 전부에서 이 줄을 뺍니다. 그 강의의 성적 기록과 제출물도 같이 없어집니다.`
          + `<ul><li>강의 내용 자체는 창고에 남습니다</li></ul>`,
        okText: '빼기',
      }).then(ok => { if (!ok) return;
        const n = M.removeLessonFromSubject(state.year, state.progSubject, l.id);
        toast(`강의실 ${n}개에서 뺐습니다.`); render(); });
      break;
    }

    // 일반 설정: 칸마다 따로 안 쓰고 저장 버튼을 누를 때 전부 한 번에 쓴다.
    case 'general-save': {
      const patch = {};
      document.querySelectorAll('[data-text-key]').forEach(inp => { patch[inp.dataset.textKey] = inp.value; });
      const order = state.menuDraft || M.getMenuOrder();
      Promise.all([M.setTexts(patch), M.setMenuOrder(order)])
        .then(() => { state.genDraft = null; state.menuDraft = null; toast('저장했습니다.'); render(); })
        .catch(() => toast('저장하지 못했습니다. 다시 시도해 주세요.'));
      break;
    }
    // 어드민 메뉴 순서: 한 칸 위나 아래와 자리를 바꾼다. 저장 전까지는 menuDraft에만 둔다.
    case 'menu-move': {
      const order = (state.menuDraft || M.getMenuOrder()).slice();
      const i = +el.dataset.i, j = i + (+v);
      if (j < 0 || j >= order.length) break;
      [order[i], order[j]] = [order[j], order[i]];
      keepGeneralDraft(); state.menuDraft = order; render(); break;
    }

    case 'logout': signOut(auth); break;   // onAuthStateChanged가 로그인 화면으로 되돌린다

    case 'ds-nav':   // 디자인 탭: 슬라이드 종류 넘기기
      state.designGroupIx = (state.designGroupIx + (+el.dataset.d) + M.SLIDE_DESIGN.length) % M.SLIDE_DESIGN.length;
      render(); break;

    case 'design-reset':   // 디자인 탭: 크기·자간·줄간격을 전부 기본값으로
      M.resetSlideDesign().then(() => { toast('기본값으로 되돌렸습니다.'); render(); });
      break;

    case 'noop': toast('다음 단계에서 만듭니다.'); break;
  }
});

/* 드롭다운(학년도 고르개)은 click이 아니라 change로 받는다. */
document.getElementById('shell').addEventListener('change', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'year-pick'){
    state.year = +el.value; state.fSubject = null; state.editRoomId = null;
    state.roomDetailId = null; state.studentDetailNo = null;
    state.scCourseId = null; state.scOpenNo = null;
    state.roomStudentEdit = false; render();
  } else if (el.dataset.act === 'cl-date'){   // 수업일자 저장(진도 관리와 강의 진도가 같이 맞물림)
    M.setCourseLessonDate(el.dataset.id, el.value); render();
  } else if (el.dataset.act === 'prog-sch'){   // 반별 수업 요일(진도표 머리줄)
    M.setCourseSchedule(el.dataset.id, el.value);
  } else if (el.dataset.act === 'prog-topic'){   // 진도표의 주제 = 강의 제목
    run(() => M.setLessonTitle(el.dataset.lid, el.value));
  } else if (el.dataset.act === 'ds-fs'){   // 디자인 탭: 요소 크기(손 뗄 때 저장, 미리보기는 input이 이미 갱신)
    M.setSlideDesignValue(el.dataset.k, el.value);
  } else if (el.dataset.act === 'ds-ls'){   // 요소 자간
    M.setSlideDesignValue(el.dataset.k + 'Ls', el.value);
  } else if (el.dataset.act === 'ds-lh'){   // 요소 줄간격
    M.setSlideDesignValue(el.dataset.k + 'Lh', el.value);
  } else if (el.dataset.act === 'ds-g'){   // 전체 자간/줄간격: 그 축 개별값을 지우고 저장 후 다시 그린다
    M.setSlideDesignGlobal(el.dataset.k === M.SLIDE_DESIGN_GLOBAL.ls.key ? 'ls' : 'lh', el.value).then(render);
  } else if (el.dataset.act === 'sc-subject-pick'){   // 성적: 머리줄의 과목 드롭다운
    state.scSubject = el.value; state.scCourseId = null; state.scClId = null; state.scOpenNo = null; render();
  } else if (el.dataset.act === 'sc-lesson'){   // 성적 입력: 채점할 강의
    state.scClId = el.value; render();
  } else if (el.dataset.act === 'sc-cell'){   // 달성, 기한 칸 하나
    const n = el.checked ? (+el.dataset.i + 1) : (+el.dataset.i);
    run(() => M.setGradeCell(el.dataset.id, el.dataset.no, el.dataset.k, el.dataset.f, n));
  } else if (el.dataset.act === 'sc-row-all'){   // 이름 앞 체크: 그 학생의 실시 중인 칸 전부
    run(() => M.setGradeRowAll(el.dataset.id, el.dataset.no, el.checked));
  } else if (el.dataset.act === 'sc-col-all'){   // 머리줄 체크: 그 열의 모든 학생을 한 번에
    const nos = M.getStudentsByCourse(state.scCourseId).map(s => s.studentNo);
    run(() => M.setGradeColAll(el.dataset.id, nos, el.dataset.k, el.dataset.f, el.checked));
  } else if (el.dataset.act === 'sc-fb-pick'){   // 피드백 템플릿을 고르면 그 글이 칸에 들어간다
    const t = M.getFeedbackTemplates()[+el.value];
    if (t == null){ el.value = ''; return; }
    M.setGradeFeedback(el.dataset.id, el.dataset.no, t);
    render();
  } else if (el.dataset.act === 'sc-feedback'){
    M.setGradeFeedback(el.dataset.id, el.dataset.no, el.value);
  } else if (el.dataset.act === 'sc-pick-lesson'){   // 성적에 반영할 강의 목록
    M.toggleGradeLesson(el.dataset.lid, el.checked);
    M.saveGradeConfig().catch(() => toast('저장하지 못했습니다. 다시 시도해 주세요.'));
    render();
  } else if (el.dataset.act === 'q-lesson'){   // 오늘의 질문: 답변을 모아 볼 강의
    state.questionLessonId = el.value; render();
  } else if (el.dataset.act === 'fm-result-lesson'){   // 형성평가 성취도: 전체 누적 또는 한 강의
    state.formativeResultId = el.value; render();
  } else if (el.dataset.act === 'pg-title'){   // 페이지 제목: 포커스 빠질 때 저장(다시 그리지 않아 커서 유지)
    editPages(el, (pages, p) => { if (pages[p]) pages[p].title = el.value.trim(); });
  } else if (el.dataset.act === 'pg-row-type'){
    /* 묶음 유형(요구사항 139). 적은 글은 들고 모양만 바뀐다(M.convertRow).
       다시 그린다: 유형에 따라 칸이 둘(라벨, 내용)과 넷(왼쪽, 오른쪽)으로 갈린다. */
    editPages(el, (pages, p, r) => {
      const pg = pages[p]; if (!pg?.rows[r]) return false;
      pg.rows[r] = M.convertRow(pg.rows[r], el.value);
    });
    render();
  } else if (el.dataset.act === 'pg-set'){
    /* 묶음의 라벨과 내용. 다시 그리지 않는다(다른 칸을 눌러 포커스가 옮겨 가는 중이라 그리면 커서가 날아간다).
       내용은 들여쓰기 빈칸을 걷어 저장하고, 그 칸만 단계에 맞춰 다시 들여 써 보여 준다. */
    // 비교 묶음의 칸은 "left.text"처럼 쪽과 칸 이름을 같이 적어 둔다(pageEditor의 cmpRow)
    const [side, f] = el.dataset.f.includes('.') ? el.dataset.f.split('.') : [null, el.dataset.f];
    const v = f === 'text' ? M.stripIndent(el.value) : el.value.trim();
    editPages(el, (pages, p, r) => {
      const row = pages[p]?.rows[r]; const box = side ? row?.[side] : row;
      if (!box) return false; box[f] = v; });
    if (f === 'text'){ el.value = M.indentText(v); el.rows = Math.max(2, v.split('\n').length); }
  } else if (el.dataset.act === 'lesson-num'){   // 강의 번호/라벨(머리줄 번호표가 바뀌게 다시 그린다)
    M.setLessonNum(el.dataset.id, el.value); render();
  } else if (el.dataset.act === 'axis-question'){   // 슬라이드 오늘의 질문 편집(질문, 설명문)
    M.setQuestion(el.dataset.id, { [el.dataset.f]: el.value });
  } else if (el.dataset.act === 'deck-cover'){   // 축 편집기 표지: 학습 주제, 단원, 교과서 쪽수
    M.deckSetCover(el.dataset.id, { [el.dataset.f]: el.value });
  } else if (el.dataset.act === 'deck-closing'){   // 맺음말: 다음 학습 주제
    M.deckSetClosingTopic(el.dataset.id, el.value);
  } else if (el.dataset.act === 'axis-lesson'){   // 축 편집기: 강의 고르기 드롭다운
    state.conceptLessonId = el.value; render();
  } else if (el.dataset.act === 'deck-set'){
    /* 축 편집기의 줄: 포커스가 빠질 때 저장하고 다시 그리지 않는다(커서 유지).
       고르개 둘만 다시 그린다. 고른 것에 따라 아래 칸의 모양이 바뀌기 때문이다:
       문항 유형(type)은 정답 칸이 글자 한 칸과 OX 라디오로 갈리고,
       동기 유발 종류(kind)는 주소 칸의 이름표가 그림과 유튜브로 갈린다. */
    M.deckSetItem(el.dataset.id, el.dataset.k, +el.dataset.i, el.dataset.f || null, el.value);
    if (el.dataset.f === 'kind' || el.dataset.f === 'type') render();
  } else if (el.dataset.act === 'q-score'){   // 답변 점수 저장
    M.setSubScore(el.dataset.id, el.value);
  } else if (el.dataset.act === 'enroll'){
    /* 강의실 등록 체크(학생 관리의 수강 과목, 강의실 관리의 명단 편집 공용).
       체크하면 바로 등록한다. 해제는 확인 창을 거친다(선생님 지시 2026-10-29: 모르고 눌러 학생이 빠졌다).
       확인 전까지는 체크를 되돌려 둔다. 빼도 course_grades, course_submissions는 지우지 않으므로
       다시 등록하면 성적과 제출 기록이 그대로 돌아온다. */
    const courseId = el.dataset.id, sno = el.dataset.no;
    const name = M.getStudentsByYear(state.year).find(s => s.studentNo === sno)?.name || '';
    if (el.checked){
      M.enrollStudent(courseId, sno, name);
      toast(`${name} 학생을 ${M.roomName(M.getCourse(courseId))}에 등록했습니다.`);
      render(); return;
    }
    el.checked = true;
    const room = M.roomName(M.getCourse(courseId));
    confirmDelete({
      title: `${room} 수강 해제`,
      bodyHtml: `<b>${esc(sno)} ${esc(name)}</b> 학생을 ${esc(room)}에서 뺍니다.`
        + `<ul><li>성적과 제출 기록은 남아 있어 다시 등록하면 그대로 돌아옵니다</li></ul>`,
      okText: '빼기',
    }).then(ok => {
      if (!ok) return;
      M.unenrollStudent(courseId, sno);
      toast(`${name} 학생을 ${room}에서 뺐습니다.`); render();
    });
  }
});

document.getElementById('shell').addEventListener('input', e => {
  /* 디자인 탭 슬라이더: 끄는 대로 미리보기를 즉시 바꾼다(다시 그리지 않고 CSS만 갈아 끼운다).
     저장은 손을 뗄 때(change)만 한다. */
  const dsa = e.target.dataset.act;
  if (dsa === 'ds-fs' || dsa === 'ds-ls' || dsa === 'ds-lh' || dsa === 'ds-g'){
    const t = e.target;
    if (t.value === '') return;   // 숫자 칸을 비우는 중이면 기다린다
    const ctl = t.closest('.ds-ctl');
    // 한 줄 안의 막대와 숫자 칸을 같은 값으로 맞춘다(막대 범위를 벗어난 숫자는 막대만 끝에 걸린다)
    if (ctl) ctl.querySelectorAll('input').forEach(i => { if (i !== t) i.value = t.value; });
    // 자간/줄간격 요소를 건드리면 그 요소는 개별값(set=1)이 된다(파랑 해제)
    if ((dsa === 'ds-ls' || dsa === 'ds-lh') && ctl){
      ctl.classList.remove('g'); ctl.querySelectorAll('input').forEach(i => i.dataset.set = '1');
    }
    // 전체를 움직이면 그 축의 요소 개별값을 풀어(set=0) 전체값에 맞춘다(미리보기도 전체 우선)
    if (dsa === 'ds-g'){
      const axisAct = t.dataset.k === M.SLIDE_DESIGN_GLOBAL.ls.key ? 'ds-ls' : 'ds-lh';
      document.querySelectorAll(`[data-act="${axisAct}"]`).forEach(s => { s.dataset.set = '0'; s.value = t.value; });
      document.querySelectorAll(`.ds-ctl`).forEach(c => { if (c.querySelector(`[data-act="${axisAct}"]`)) c.classList.add('g'); });
    }
    // 미리보기 CSS 다시 깔기. 숫자 칸(ds-num) 기준으로 모은다(쳐 넣은 값이 그대로 반영되게)
    const v = {};
    document.querySelectorAll('.ds-num[data-act="ds-fs"]').forEach(s => { if (s.value !== '') v[s.dataset.k] = +s.value; });
    document.querySelectorAll('.ds-num[data-act="ds-g"]').forEach(s => { if (s.value !== '') v[s.dataset.k] = +s.value; });
    document.querySelectorAll('.ds-num[data-act="ds-ls"]').forEach(s => { if (s.dataset.set === '1' && s.value !== '') v[s.dataset.k + 'Ls'] = +s.value; });
    document.querySelectorAll('.ds-num[data-act="ds-lh"]').forEach(s => { if (s.dataset.set === '1' && s.value !== '') v[s.dataset.k + 'Lh'] = +s.value; });
    const st = document.getElementById('dpv-style');
    if (st) st.textContent = M.designVarsCss(v);
    return;
  }
  // 설명문 글자수: 다시 그리지 않고 숫자만 고쳐 쓴다(커서 유지)
  if (e.target.id === 'q-ed-guide'){
    const n = document.getElementById('q-ed-guide-n');
    if (n) n.textContent = `${e.target.value.length}자`;
    return;
  }
  /* 학번 검색: 치는 대로 목록을 다시 그린다. 다시 그리면 칸이 새로 생기므로 커서를 되살린다. */
  if (e.target.dataset.act !== 'stu-search') return;
  state.studentQuery = e.target.value;
  const pos = e.target.selectionStart;
  render();
  const box = document.getElementById('stu-search');
  if (box){ box.focus(); box.setSelectionRange(pos, pos); }
});

/* 묶음을 "커서를 둔 줄부터" 나누려면(pg-row-cut) 그 자리를 알아야 한다. 가위 단추를 누르는
   순간에는 칸에서 포커스가 이미 빠져 있어서(그 blur가 저장을 띄운다) 커서를 읽을 수 없다.
   그래서 내용 칸 안에서 움직일 때마다 "몇째 줄인가"를 적어 둔다.
   글자 수가 아니라 줄 번호를 적는 까닭: 칸에 보이는 글에는 단계만큼 빈칸이 들어가 있어
   (M.indentText) 저장된 글과 글자 수가 다르다. 줄 수는 같다. */
const pgCaret = e => {
  const el = e.target.closest?.('textarea.pgtext[data-act="pg-set"][data-f="text"]');
  if (!el) return;
  state.pgCut = { id: el.dataset.id, k: el.dataset.k, p: +el.dataset.p, r: +el.dataset.r,
    line: el.value.slice(0, el.selectionStart ?? 0).split('\n').length - 1 };
};
['keyup', 'click'].forEach(t => document.getElementById('shell').addEventListener(t, pgCaret));

/* 진도 관리의 강의 메모 버블: 메모가 있는 주제 칸(data-memo)에 마우스를 올리면 그 아래에 뜬다.
   진도표 칸(.prog-wrap)이 가로 스크롤 상자라 CSS ::after로 띄우면 잘리므로 body에 떠 있는 상자를 쓴다. */
const $bubble = document.createElement('div');
$bubble.className = 'memo-bubble'; $bubble.hidden = true;
document.body.appendChild($bubble);
document.getElementById('shell').addEventListener('mouseover', e => {
  const cell = e.target.closest('[data-memo]');
  if (!cell){ $bubble.hidden = true; return; }
  $bubble.textContent = cell.dataset.memo;
  $bubble.hidden = false;
  const r = cell.getBoundingClientRect();
  const top = r.bottom + 6 + $bubble.offsetHeight > innerHeight ? r.top - 6 - $bubble.offsetHeight : r.bottom + 6;
  $bubble.style.left = `${Math.max(8, Math.min(r.left, innerWidth - $bubble.offsetWidth - 8))}px`;
  $bubble.style.top = `${Math.max(8, top)}px`;
});
document.getElementById('shell').addEventListener('mouseleave', () => { $bubble.hidden = true; });
document.getElementById('main').addEventListener('scroll', () => { $bubble.hidden = true; }, { passive:true });

/* 인라인 폼에서 엔터를 치면 그 줄의 주 버튼을 누른 것으로 본다.
   줄마다 핸들러를 달지 않도록 같은 묶음 안의 .btn-text 또는 .ib-primary를 찾는다. */
document.getElementById('shell').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  const btn = e.target.closest('.formrow, .row, .catline')?.querySelector('.btn-text, .ib-primary');
  if (btn){ e.preventDefault(); btn.click(); }
});

boot();
