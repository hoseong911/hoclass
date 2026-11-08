// 2027 LMS 학생 화면: 제로베이스 뼈대 (2026-10-26, 큰 틀 2026-10-27)
// 로그인 → 강의실 고르기 → 강의실(두 배치) → 칸 보기.
//
// 선생님 지시 2026-10-27 (요구사항 84~87):
//  - 강의실 고르기에 반 번호를 띄우지 않는다. 학생은 자기 반밖에 없으므로 "사회", "역사"로 끝낸다
//  - 강의실 안은 배치 둘: 강의별(1강, 2강 고르기)과 메뉴별(개념노트만, 미션만 모아 보기).
//    둘은 같은 내용으로 들어가는 두 길이다. 둘 다 필요하다
//    (2026-10-30 바뀜: 탭을 걷고 메뉴 한 화면만 둔다. 강의별은 그 안의 "강의 보기" 메뉴가 됐다. viewHome 참고)
//  - 학생은 폰과 패드로 들어온다. 화면은 모바일과 PC가 같은 것을 쓴다
//  - 개념노트(강의 슬라이드)만 예외로 새 탭 전체화면으로 연다
//
// 지금은 데모 데이터로 돈다(model.js). 로그인도 데모: 학번만 맞으면 입장.
// 규칙: 인라인 onclick/window 노출 없이 data-act + 이벤트 위임. 상태는 state 하나.

import * as M from './model.js?v=20261108b';
import { icon } from './shared/icons.js?v=20261102a';
import { verifyMileageCert } from './shared/mileage-check.js?v=20261108b';

const YEAR = 2027;
const $app = document.getElementById('app');

const state = {
  view: 'login',          // login | rooms | home | menu | lesson | part
  sno: '', name: '',
  courseId: null,
  lessonId: null,         // 강의 보기에서 고른 강의
  partKey: null,          // 보고 있는 칸
  menuKey: null,          // 고른 메뉴(강의 보기도 메뉴 하나다)
  noticeAll: false,       // 공지사항 더보기를 눌렀는가(강의실을 새로 열면 다시 5개)
  noticeId: null,         // 모달로 띄운 공지사항 글(없으면 null)

  // 로그인 화면 (선생님 지시 2026-10-28)
  loginStep: 'check',     // 'check'(학번, 이름, 비밀번호) | 'setup'(첫 접속: 비밀번호 만들기)
  loginErr: '',           // 지금 보일 빨간 오류 문구(없으면 '')
  loginBusy: false,       // Firestore 확인 중: 중복 제출 막기
  pending: null,          // setup으로 넘어갈 때 쥐고 있는 { sno, name, courseId }
  formSno: '', formName: '',  // 오류로 다시 그릴 때도 학번, 이름은 남겨 둔다(비밀번호만 새로 친다)

  // 형성평가: 한 문제씩 푼다. { lessonId, idx, result:{given,correct}|null }
  fm: null,

  // 열공 마일리지(인증 화면, 2026-11-08). 전체 재그림에도 사진·글이 안 날아가게 state에 쥔다.
  mlDraft: null,          // 고른 사진 { dataUrl, base64, mediaType, hash } (없으면 null)
  mlForm: { content:'', feeling:'' },  // 입력 중인 글(재그림 사이 보존)
  mlBusy: false,          // 검증 중(제출 막고 안내)
  mlEdit: false,          // 오늘 인증이 있어도 '다시 올리기'로 폼을 열었는가

  // 자동 로그인 (선생님 지시 2026-10-30)
  saved: null,            // 이 기기에 저장된 학생 { sno, name } (없으면 null)
  formAuto: true,         // 로그인 폼의 자동 로그인 체크 상태(오류로 다시 그려도 남긴다)
};

/* ── 로그인 기억하기 (선생님 지시 2026-10-30) ──
   "기존 lms는 로그인이 자동 저장되어 나중에 기존 정보로 로그인할 수 있었다. 그 시스템을 만들어 달라."
   2026 hoistory/lms/index.js의 틀을 그대로 옮겼다. 두 겹이다.

   세션(sessionStorage): 이 탭에서 로그인한 학생. 새로고침하면 다시 묻지 않고 그대로 들어간다.
   기기(localStorage): 자동 로그인을 켜 두면 다음에 와서 [저장된 정보로 입장하기] 한 번으로 들어간다.
     2026과 같이 이때 비밀번호를 다시 묻지 않는다. 학생 본인 기기에 켠 것이기 때문이다.
     로그아웃은 세션만 지우고 기기에 저장한 것은 남긴다(그래서 로그아웃하면 저장 카드가 보인다).
     [다른 학생으로 로그인]을 누르면 기기에서 지운다.

   키 이름은 shared/lms-session.js의 규약과 똑같아야 한다. 미션 앱이 이 키들로 학생을 알아내므로
   한쪽을 고치면 다른 쪽도 고친다. 강의실(lms_cid)은 세션에만 둔다(규약 그대로). */
const SS = { sid:'lms_sid', sname:'lms_sname', cid:'lms_cid', year:'lms_year' };
const LS = { sid:'lms_autosave_sid', sname:'lms_autosave_sname', year:'lms_autosave_year' };

// 사생활 보호 모드나 저장 공간이 꽉 찬 기기에서는 읽기만 해도 예외가 난다.
function stGet(store, key){ try { return store.getItem(key) || ''; } catch (e) { return ''; } }
function stSet(store, key, val){ try { store.setItem(key, val); } catch (e) {} }
function stDel(store, key){ try { store.removeItem(key); } catch (e) {} }

// 이 기기에 저장된 학생. 둘 다 있어야 쓴다.
function readSaved(){
  const sno = stGet(localStorage, LS.sid).trim();
  const name = stGet(localStorage, LS.sname).trim();
  return (sno && name) ? { sno, name } : null;
}
function writeSaved(sno, name){
  stSet(localStorage, LS.sid, sno); stSet(localStorage, LS.sname, name);
  stSet(localStorage, LS.year, String(YEAR));
}
function forgetSaved(){ for (const k of Object.values(LS)) stDel(localStorage, k); }

// 로그인을 통과한 뒤 들어가는 단 하나의 문. 세션에 남기고 강의실 고르기로 보낸다.
// remember가 true면 기기에도 저장하고, false면 기기에서 지운다(체크를 풀고 로그인한 경우).
function enterStudent(sno, name, remember){
  state.sno = sno; state.name = name; state.courseId = null;
  stSet(sessionStorage, SS.sid, sno); stSet(sessionStorage, SS.sname, name);
  stSet(sessionStorage, SS.year, String(YEAR)); stDel(sessionStorage, SS.cid);
  if (remember) writeSaved(sno, name); else if (remember === false) forgetSaved();
  state.saved = readSaved();
  state.formSno = ''; state.formName = ''; state.loginErr = ''; state.loginStep = 'check';
  state.view = 'rooms'; render();
}

// ── 부트 가드 ──
// Firestore를 먼저 읽고 화면을 연다. 이게 없으면 메모리가 빈 채로 로그인을 판정해
// 맞는 학번을 넣어도 "그 학번으로 든 강의실이 없다"가 된다.
async function boot(){
  const ok = getComputedStyle(document.documentElement).getPropertyValue('--lms-css-ok').trim() === '1';
  if (!ok){ document.getElementById('boot').textContent = '화면을 불러오지 못했습니다. 새로고침해 주세요.'; return; }
  try {
    await M.loadCore();
  } catch (e) {
    console.error('loadCore', e);
    document.getElementById('boot').textContent = '자료를 불러오지 못했습니다. 새로고침해 주세요.';
    return;
  }
  document.title = M.getText('browserTitle');
  document.documentElement.classList.add('lms-ready');
  $app.hidden = false;
  restoreLogin();
  render();
}

/* 들어올 때 로그인을 되살린다. 명단은 loadCore 뒤에야 메모리에 있으므로 여기서 본다.
   1) 이 탭에 로그인이 남아 있으면(새로고침) 바로 강의실 고르기로 들어간다
   2) 아니면 기기에 저장된 학생이 있는지만 봐 둔다(로그인 화면이 저장 카드를 그린다) */
function restoreLogin(){
  const sno = stGet(sessionStorage, SS.sid).trim();
  const name = stGet(sessionStorage, SS.sname).trim();
  if (sno && name && M.getCoursesOfStudent(YEAR, sno).length){
    state.sno = sno; state.name = name;
    state.saved = readSaved();
    state.view = 'rooms';
    return;
  }
  // 명단에서 빠진 학번이 세션에 남아 있으면 지운다(다음 새로고침에서 또 되살리지 않게)
  if (sno || name) for (const k of Object.values(SS)) stDel(sessionStorage, k);
  state.saved = readSaved();
}

// ── 공통 조각 ──
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// 학생에게 보이는 강의실 이름은 과목만(요구사항 84). 어드민은 "사회 301"을 그대로 쓴다.
const roomLabel = c => c?.subject || '';

function topbar(title, backAct){
  return `<div class="topbar">
    ${backAct ? `<button class="iconbtn" data-act="${backAct}" aria-label="뒤로" title="뒤로">${icon('chevron-left',20)}</button>` : ''}
    <h1>${esc(title)}</h1>
    ${state.sno ? `<span class="who">${esc(state.name)} ${esc(state.sno)}</span>
      <button class="iconbtn" data-act="logout" aria-label="로그아웃" title="로그아웃">${icon('log-out',18)}</button>` : ''}
  </div>`;
}

/* ── 로그인 (선생님 지시 2026-10-28) ──
   순서: 제목 → 부제목 → 안내문구 → 학번 → 이름 → 비밀번호 → 입장하기 → (틀렸을 때) 빨간 문구
         → 오픈카톡 / 홈 화면에 추가.
   로그인 화면 문구와 오류 문구는 코드에 바로 적는다(선생님 지시 2026-10-29: 일반 설정에서 바꿀 일이 없다).
   일반 설정에 남은 것(탭 제목, 사이트 이름, 링크)만 M.getText로 읽는다. 부제목이 사이트 이름이다(2026-10-29). */
function viewLogin(){
  if (state.loginStep === 'setup') return viewLoginSetup();
  if (state.saved) return viewLoginSaved();
  return `<div class="login">
    <h1>HOCLASS</h1>
    <p class="lead">${esc(M.getText('siteName'))}</p>
    <p class="guide">호성쌤 수업에 대한 학습 관리 시스템에 오신 것을 환영합니다.</p>
    <input class="field" id="f-sno" inputmode="numeric" placeholder="학번" value="${esc(state.formSno)}">
    <input class="field" id="f-name" placeholder="이름" value="${esc(state.formName)}">
    <input class="field" id="f-pw" type="password" placeholder="비밀번호">
    <label class="autoline"><input type="checkbox" id="f-auto" ${state.formAuto ? 'checked' : ''}>
      <span>이 기기에서 자동 로그인</span></label>
    <button class="primary" data-act="login" ${state.loginBusy ? 'disabled' : ''}>로그인</button>
    ${state.loginErr ? `<p class="err">${esc(state.loginErr)}</p>` : ''}
    ${loginExtras()}
  </div>`;
}

/* 학번, 이름을 다 넣으면 첫 접속인지 보고 비밀번호 칸 안내 문구(placeholder)를 바꾼다
   (선생님 지시 2026-11-08). 비밀번호 문서가 없으면 첫 접속이라 "비밀번호를 설정하세요",
   있으면 두 번째 이상이라 "비밀번호를 입력하세요"로 둔다.
   화면을 다시 그리면 치던 값이 날아가므로 render() 대신 placeholder만 직접 고친다.
   읽기가 끝나는 사이 학번을 또 바꿀 수 있어 토큰으로 마지막 요청만 반영한다. */
let pwHintToken = 0;
async function updatePwHint(){
  const pwEl = document.getElementById('f-pw'); if (!pwEl) return;
  const sno = (document.getElementById('f-sno')?.value || '').trim();
  const name = (document.getElementById('f-name')?.value || '').trim();
  // 둘 다 채워졌고 명단과 맞을 때만 조회한다(아니면 기본값 그대로)
  if (!sno || !name || !M.getCoursesOfStudent(YEAR, sno).length
      || !M.matchesRosterName(YEAR, sno, name)){ pwEl.placeholder = '비밀번호'; return; }
  const my = ++pwHintToken;
  try {
    const rec = await M.getAuthRecord(YEAR, sno);
    if (my !== pwHintToken) return;                 // 그 사이 또 바뀌었으면 버린다
    const el = document.getElementById('f-pw');       // 다시 그렸을 수 있으니 다시 찾는다
    if (el) el.placeholder = rec ? '비밀번호를 입력하세요' : '비밀번호를 설정하세요';
  } catch { /* 못 읽으면 기본 안내 그대로 둔다 */ }
}

// 이 기기에 저장된 학생이 있을 때(자동 로그인을 켜 두고 간 경우). 비밀번호를 다시 묻지 않는다.
function viewLoginSaved(){
  const s = state.saved;
  return `<div class="login">
    <h1>HOCLASS</h1>
    <p class="lead">${esc(M.getText('siteName'))}</p>
    <div class="savedcard">
      <span class="ava">${esc(s.name.charAt(0))}</span>
      <div class="body"><div class="t">${esc(s.name)}</div><div class="s">${esc(s.sno)}</div></div>
    </div>
    <button class="primary" data-act="saved-enter">저장된 정보로 입장하기</button>
    <button class="plainbtn" data-act="saved-other">다른 학생으로 로그인</button>
    ${state.loginErr ? `<p class="err">${esc(state.loginErr)}</p>` : ''}
    ${loginExtras()}
  </div>`;
}

// 처음 접속(비밀번호 문서가 없음): 학번, 이름은 이미 맞혀 둔 채 비밀번호만 새로 만든다.
function viewLoginSetup(){
  return `<div class="login">
    <h1>HOCLASS</h1>
    <p class="lead">${esc(M.getText('siteName'))}</p>
    <p class="guide">LMS에 처음 접속하셨습니다. 사용하실 비밀번호를 생성하시길 바랍니다.</p>
    <div class="fieldlabel">새 비밀번호</div>
    <input class="field" id="f-pw1" type="password">
    <div class="fieldlabel">비밀번호 확인</div>
    <input class="field" id="f-pw2" type="password">
    <button class="primary" data-act="setup-pw" ${state.loginBusy ? 'disabled' : ''}>비밀번호 생성</button>
    ${state.loginErr ? `<p class="err">${esc(state.loginErr)}</p>` : ''}
  </div>`;
}

// 입장하기 아래: 오픈카톡 / 홈 화면에 추가 (선생님 지시 2026-10-28). 링크는 일반 설정에서.
function loginExtras(){
  return `<div class="login-extra">
    <button class="extrabtn" data-act="go-kakao">${icon('message-circle',20)}<span>호성T와 연락하기</span></button>
    <button class="extrabtn" data-act="go-install">${icon('home',20)}<span>홈 화면에 추가</span></button>
  </div>`;
}
function openExternal(url){
  if (!url){ alertBox('링크가 아직 설정되지 않았습니다.'); return; }
  window.open(url, '_blank', 'noopener');
}

/* 미션 앱을 새 탭으로 연다 (선생님 지시 2026-10-30).
   새 탭은 보통 "자기를 열어 준 탭과 아무 관계도 없다"는 표시(noopener)를 달고 열었다.
   그러면 브라우저가 **세션을 새 탭에 복사해 주지 않아** 미션 앱이 학생이 누군지 모른다
   (자동 로그인을 켠 학생만 기기에 저장된 것으로 겨우 알고, 강의실은 못 읽었다).
   그래서 우리 주소일 때만 그 표시를 떼서 세션을 물려준다. 세션은 주소(도메인)마다 따로 있으므로
   남의 주소에는 떼어도 어차피 넘어가지 않는다. 남의 주소는 표시를 그대로 달아 둔다(우리 창을 못 건드리게).
   표시를 뗀 자리는 열린 탭이 window.opener로 우리 창에 닿을 수 있는데, 우리가 만든 앱이라 괜찮다. */
function openMissionApp(url){
  if (!url){ alertBox('링크가 아직 설정되지 않았습니다.'); return; }
  if (isOurUrl(url)) window.open(url, '_blank');
  else window.open(url, '_blank', 'noopener');
}

// 우리 주소인가(같은 도메인). 잘못된 주소면 아니라고 본다.
function isOurUrl(url){
  try { return new URL(url, location.href).origin === location.origin; }
  catch (e) { return false; }
}

// ── 강의실 고르기 ── 과목만 보인다(요구사항 84)
function viewRooms(){
  const rooms = M.getCoursesOfStudent(YEAR, state.sno);
  const body = rooms.length
    ? `<div class="grid">${rooms.map(c => `<div class="card room" data-act="open-room" data-id="${c.id}">
        <span class="ic" style="background:var(--concept)">${icon('graduation-cap',22)}</span>
        <div class="body"><div class="t">${esc(roomLabel(c))}</div></div>
        <span class="chev">${icon('chevron-right',18)}</span></div>`).join('')}</div>`
    : `<div class="empty">든 강의실이 없습니다.</div>`;
  // 맨 위 제목은 일반 설정의 사이트 이름(선생님 지시 2026-10-29)
  return topbar(M.getText('siteName')) + body;
}

/* ── 강의실 안 ── 메뉴 한 화면 (선생님 지시 2026-10-30, 요구사항 108)
   전에는 배치 셋(강의 보기 / 메뉴 / 콘텐츠)을 탭으로 넘겼다. 이제 탭 없이 이 한 화면이다.
     맨 위   : 공지사항 글 목록(최대 5개, 더보기와 접기). 버튼이 아니라 글이 바로 보인다(요구사항 110, 117)
     첫 묶음 : 강의 보기, 성적
     둘째 묶음: 개념 노트, 미션 활동, 오늘의 질문, 형성평가 (복습은 일단 뺐다, 요구사항 120)
   콘텐츠(뽑기, 게임)는 강의실 밖으로 옮길 자리라 여기서 뺐다. */
const NOTICE_MAX = 5;
function viewHome(){
  const c = M.getCourse(state.courseId);
  return topbar(roomLabel(c), 'back-rooms') + noticeList(c) + menuGrid('main') + menuGrid('part');
}

// 공지사항 글 목록. 그 강의실 과목의 글만(과목마다 따로, 요구사항 115).
// 제목만 보이고 누르면 그 글이 모달로 뜬다(요구사항 118). 늘 최신순(M.getNotices).
// 5개가 넘으면 [더보기], 편 뒤에는 [접기](요구사항 117).
function noticeList(c){
  const all = M.getNotices(YEAR, c?.subject);
  const shown = state.noticeAll ? all : all.slice(0, NOTICE_MAX);
  // 상단 고정한 글은 핀을 같이 보여 준다(선생님 지적 2026-11-02: 학생 화면에서 핀이 안 보인다).
  // getNotices가 이미 고정 글을 맨 위로 올려 주는데, 왜 위에 있는지 알 길이 없었다.
  const rows = shown.map(n => `<div class="nrow" data-act="open-notice" data-id="${esc(n.id)}">
      ${n.pinned ? `<span class="npin">${icon('pin',14)}</span>` : ''}
      <span class="t">${esc(n.title)}</span><span class="chev">${icon('chevron-right',16)}</span></div>`).join('')
    || `<div class="nempty">공지사항이 없습니다.</div>`;
  // 더보기 옆 괄호는 "아직 안 보인 글이 몇 개 더 있는지"다(선생님 지시 2026-10-30).
  const rest = all.length - NOTICE_MAX;
  const toggle = all.length > NOTICE_MAX
    ? (state.noticeAll
        ? `<button class="morebtn" data-act="notice-less">접기</button>`
        : `<button class="morebtn" data-act="notice-more">더보기 (${rest})</button>`)
    : '';
  return `<section class="notices"><div class="sechead">공지사항</div>${rows}${toggle}</section>`;
}

/* 공지사항 글 하나: 화면을 바꾸지 않고 모달로 띄운다(선생님 지시 2026-10-30, 요구사항 118).
   흰 바탕은 모달이라 쓴다(화면 규칙). 덮개를 누르거나, X를 누르거나, Esc로 닫는다.
   render()가 state.noticeId를 보고 화면 끝에 붙인다. */
function noticeModal(){
  const n = state.noticeId && M.getNotice(state.noticeId);
  if (!n) return '';
  const liked = M.isNoticeLiked(n.id, state.sno);
  const st = M.noticeStats(n.id);
  const comments = M.getNoticeComments(n.id);
  const banned = M.isCommentBanned(state.sno);
  const cm = c => `<div class="ncm">
      <div class="ncm-who">${esc(c.name || c.studentNo)}</div>
      <div class="ncm-text">${esc(c.text)}</div>
      ${c.studentNo === state.sno ? `<button class="ncm-del" data-act="notice-comment-del" data-id="${esc(c.id)}" aria-label="댓글 삭제">${icon('trash-2',14)}</button>` : ''}</div>`;
  return `<div class="modal-back" data-act="close-notice">
    <div class="modal notice" role="dialog" aria-modal="true" aria-label="${esc(n.title)}">
      <div class="mhead"><h2>${esc(n.title)}</h2>
        <button class="iconbtn" data-act="close-notice" aria-label="닫기" title="닫기">${icon('x',18)}</button></div>
      <!-- 글 내용은 서식(굵게, 정렬, 글자색)이 든 HTML 조각이다(2026-11-02). 아는 태그만
           남기고 걸러 내는 일은 M.noticeBodyHtml이 맡는다. 편집기가 생기기 전에 올린 글은
           그냥 글자라서 그쪽도 같은 함수가 escape하고 줄바꿈만 <br>로 바꾼다 -->
      <div class="nbody">${M.noticeBodyHtml(n)}</div>
      <div class="nlike-row">
        <button class="nlike ${liked?'on':''}" data-act="notice-like" data-id="${esc(n.id)}" aria-pressed="${liked}">
          ${icon('heart',18)}<span>좋아요 ${st.likes}</span></button>
        <span class="nstat">${icon('eye',15)} ${st.reads}</span>
      </div>
      <div class="ncm-wrap">
        <div class="ncm-head">댓글 ${st.comments}</div>
        <div class="ncm-list">${comments.map(cm).join('') || '<div class="ncm-empty">첫 댓글을 남겨 보세요.</div>'}</div>
        ${n.commentsOff ? '<div class="ncm-off">댓글을 받지 않는 글입니다.</div>'
          : banned ? '<div class="ncm-off">댓글 작성이 제한되어 있습니다.</div>'
          : `<div class="ncm-form">
              <input class="ncm-input" id="ncm-input" maxlength="300" placeholder="댓글 달기" aria-label="댓글">
              <button class="ncm-send" data-act="notice-comment-submit" data-id="${esc(n.id)}" aria-label="등록">${icon('message-circle',18)}</button>
            </div>`}
      </div>
    </div></div>`;
}
// 모달을 그대로 두고 안쪽만 새로 그린다(좋아요·댓글 갱신). 덮개 요소를 통째로 바꾼다.
function refreshNoticeModal(){
  const back = $app.querySelector('.modal-back');
  if (back) back.outerHTML = noticeModal();
}

/* 메뉴 카드 묶음 하나. 묶음 이름을 격자에 클래스로 달아 둔다(menus-main / menus-part):
   index.css가 이 클래스로 아이콘 바탕색을 가른다(첫 묶음 네이비, 나머지 레드.
   선생님 지시 2026-10-30). 색은 index.css 한 곳에서 주고 여기서는 색을 쓰지 않는다. */
function menuGrid(group){
  const counts = {};
  M.PART_TYPES.forEach(p => counts[p.key] = M.getPartItems(state.courseId, p.key).length);
  return `<div class="grid menus menus-${group}">${M.STUDENT_MENUS.filter(m => m.group === group).map(m => {
    const sub = m.kind === 'part' ? `${counts[m.key]}개` : '';
    return `<div class="card menu" data-act="open-menu" data-k="${m.key}">
      <span class="ic">${icon(m.icon,22)}</span>
      <div class="body"><div class="t">${esc(m.name)}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>
      <span class="chev">${icon('chevron-right',18)}</span></div>`;
  }).join('')}</div>`;
}

/* 강의 보기: 예전 "강의 보기" 배치를 메뉴 하나로 연다(요구사항 111).
   1강, 2강을 고르면 그 강의의 칸이 차례로 이어진다. 차수는 연결한 차례 그대로 매기고,
   늘어놓는 것은 최신순이라 마지막 강의가 맨 위다(요구사항 112). */
function lessonCards(){
  const cls = M.getCourseLessons(state.courseId).filter(cl => cl.isOpen && cl.lesson);
  if (!cls.length) return `<div class="empty">열린 강의가 없습니다.</div>`;
  return `<div class="grid">${cls.slice().reverse().map(cl => {
    const tags = (cl.lesson.order || []).map(k =>
      `<span class="tag" style="--c:var(--${k})">${esc(M.partDef(k)?.name || k)}</span>`).join('');
    return `<div class="card" data-act="open-lesson" data-lid="${cl.lessonId}">
      <span class="no">${esc(lnum(cl.lesson))}</span>
      <div class="body"><div class="t">${esc(cl.lesson.title)}</div><div class="tags">${tags}</div></div>
      <span class="chev">${icon('chevron-right',18)}</span></div>`;
  }).join('')}</div>`;
}

// ── 메뉴 하나를 고른 화면 ──
function viewMenu(){
  const c = M.getCourse(state.courseId);
  const m = M.STUDENT_MENUS.find(x => x.key === state.menuKey);
  if (!m) return topbar(roomLabel(c), 'back-home') + `<div class="empty">메뉴를 찾지 못했습니다.</div>`;
  const head = topbar(m.name, 'back-home');

  if (m.kind === 'lessons') return head + lessonCards();
  if (m.kind === 'score')   return head + scoreCard(c);
  if (m.kind === 'mileage') return head + mileageView(c);

  // 칸 모아 보기: 강의마다 그 칸 하나씩. 최신 강의가 맨 위(요구사항 112)
  const items = M.getPartItems(state.courseId, m.key).reverse();
  if (!items.length) return head + `<div class="empty">아직 없습니다.</div>`;

  // 규칙(선생님 지시 2026-10-29): 오늘의 질문과 형성평가는 목록 모양이 똑같다.
  //   큰 강의 차수 + 강의명만. 칸 이름(질문노트 등 부제목)은 띄우지 않는다.
  if (m.key === 'question' || m.key === 'formative')
    return head + `<div class="grid">${items.map(bigLessonCard).join('')}</div>`;

  // 미션 활동: 카드를 누르면 아이프레임이 아니라 바로 새 탭으로 미니앱을 연다(선생님 지시 2026-10-29).
  if (m.key === 'mission')
    return head + `<div class="grid">${items.map(it => {
      const app = M.getMissionApps().find(a => a.lessonId === it.lesson.id && a.studentUrl);
      const act = app ? `data-act="open-ext" data-url="${esc(app.studentUrl)}"` : 'data-act="noop"';
      return `<div class="card" ${act}>
        <span class="no">${esc(lnum(it.lesson))}</span>
        <div class="body"><div class="t">${esc(it.lesson.title)}</div></div>
        <span class="chev">${icon('globe',18)}</span></div>`;
    }).join('')}</div>`;

  /* 개념 노트: 누르면 화면을 거치지 않고 바로 새 탭에 슬라이드가 열린다(선생님 지시 2026-10-30, 요구사항 121).
     제목 밑의 부제목(강의 제목)은 걷었다(요구사항 119). 제목은 다른 메뉴처럼 강의 제목 하나다
     (칸 제목은 기본값이 "개념 노트"라 그대로 쓰면 카드가 다 같은 글자가 된다). */
  return head + `<div class="grid">${items.map(it => `
    <div class="card" data-act="open-slide" data-lid="${it.lesson.id}">
      <span class="no">${esc(lnum(it.lesson))}</span>
      <div class="body"><div class="t">${esc(it.lesson.title)}</div></div>
      <span class="chev">${icon('monitor',18)}</span></div>`).join('')}</div>`;
}

// 오늘의 질문·형성평가 공용 목록 카드(규칙: 둘은 목록이 똑같다). 큰 차수 + 강의명.
// 차수 글씨는 학생 화면의 모든 목록이 같은 .no 하나를 쓴다(요구사항 119).
function bigLessonCard(it){
  return `<div class="card bigcard" data-act="open-part" data-lid="${it.lesson.id}" data-k="${state.menuKey}">
    <span class="no">${esc(lnum(it.lesson))}</span>
    <div class="body"><div class="t big">${esc(it.lesson.title)}</div></div>
    <span class="chev">${icon('chevron-right',18)}</span></div>`;
}

/* 성적(요구사항 4의 성적 창구): model.js studentGrade로 그 자리에서 계산한다.
   선생님이 성적 입력에서 체크하고 그 반에 [반영하기]를 누른 강의만 들어온다.
   영역마다 급간 표로 환산한 점수와 달성률을 같이 보여 준다. */
function scoreCard(c){
  const sc = M.studentGrade(c.id, state.sno);
  if (!sc.has)
    return `<div class="score"><div class="h">실시간 성적</div>
      <div class="empty-inline">아직 반영된 강의가 없습니다.</div></div>`;
  // 총점 달성 바(Heritage Blue). 비율은 이미 계산된 총점/만점에서 바로 뽑는다(새 데이터가 아니다).
  const pct = sc.maxScore ? Math.round(sc.total / sc.maxScore * 100) : 0;
  const rows = M.GRADE_AREAS.map(a => {
    const it = sc.areas[a.key];
    const v = it.total ? `${it.score}점 <small>${it.pct}%</small>` : '<span class="na">미실시</span>';
    return `<div class="row"><span>${esc(a.name)}</span><b>${v}</b></div>`;
  }).join('');
  return `<div class="score"><div class="h">실시간 성적</div>
    <div class="score-hero">
      <div class="score-total">${sc.total}<span class="of">/ ${sc.maxScore}</span></div>
      <div class="score-track"><span style="width:${pct}%"></span></div>
    </div>
    <div class="score-rows">${rows}</div></div>`;
}

/* ── 열공 마일리지(학생 인증 화면, 2026-11-08) ──
   과목(강의실)마다 돈다. 공부한 사진 한 장 + 오늘 공부한 내용 + 느낀 점을 내면
   검증 엔진(shared/mileage-check.js)이 통과/보류로 가린다(실패 없음). 하루 1건(덮어쓰기).
   시간대 게이트(평일 15~24, 주말·공휴일 6~24)는 model.mileageGateReason이 본다.
   누적·연속 '일수'만 보여 준다(포인트 환산은 추후 연동). */
function mileageView(c){
  const subject = c.subject;
  const today = M.mileageToday();
  const cert = M.getMileageCert(subject, state.sno, today);
  const st = M.mileageStats(subject, state.sno);
  const gate = M.mileageGateReason();

  // 머리 띠: 연속·누적 일수.
  const stats = `<div class="ml-stats">
      <div class="ml-stat"><b>${st.streak}</b><span>연속 일수</span></div>
      <div class="ml-stat"><b>${st.days}</b><span>누적 일수</span></div>
    </div>`;

  // 검증 중.
  if (state.mlBusy)
    return stats + `<div class="ml-busy">${icon('hourglass',20)}<span>사진과 내용을 확인하고 있어요…</span></div>`;

  // 오늘 이미 냈고 '다시 올리기'를 누르지 않았으면 결과를 보여 준다.
  if (cert && !state.mlEdit) return stats + mileageResultCard(cert);

  // 시간대가 닫혀 있으면 폼 대신 안내만(일수는 위에 보인다).
  if (gate) return stats + `<div class="ml-closed">${icon('clock',18)}<span>${esc(gate)}</span></div>`;

  // 인증 폼.
  const photo = state.mlDraft
    ? `<img class="ml-preview" src="${state.mlDraft.dataUrl}" alt="고른 사진">`
    : `<div class="ml-pick-ph">${icon('image',26)}<span>오늘 공부한 사진을 올려요</span></div>`;
  const resub = cert ? `<p class="ml-note">오늘 이미 인증했어요. 다시 올리면 새 사진·내용으로 바뀝니다.</p>` : '';
  return stats + `<div class="ml-form">
    ${resub}
    <label class="ml-pick">
      <input type="file" id="ml-file" accept="image/*" capture="environment" hidden>
      ${photo}
    </label>
    <label class="ml-field"><span>오늘 공부한 내용</span>
      <textarea id="ml-content" rows="3" placeholder="">${esc(state.mlForm.content)}</textarea></label>
    <label class="ml-field"><span>느낀 점</span>
      <textarea id="ml-feeling" rows="2" placeholder="">${esc(state.mlForm.feeling)}</textarea></label>
    <button class="primary wide" data-act="ml-submit">${icon('check',18)}<span>인증하기</span></button>
  </div>`;
}

/* 오늘 낸 인증의 결과 카드. 학생 화면 상태는 셋뿐이다(애매는 통과로 숨긴다. M.mileageStudentResult):
   통과 → 통과 뱃지, 반려 → 사유+다시 올리기, 보류 → 선생님 확인 대기. '다시 올리기'로 폼을 다시 연다. */
function mileageResultCard(cert){
  const st = M.mileageStudentResult(cert);   // 'pass' | 'rejected' | 'pending'
  const badge = st === 'pass'
    ? `<div class="ml-badge pass">${icon('circle-check',18)}<span>오늘 인증 통과</span></div>`
    : st === 'rejected'
    ? `<div class="ml-badge rejected">${icon('circle-x',18)}<span>다시 올려 주세요</span></div>`
    : `<div class="ml-badge pending">${icon('clock',18)}<span>선생님 확인을 기다려요</span></div>`;
  const reason = (st !== 'pass' && cert.reason) ? `<p class="ml-reason">${esc(cert.reason)}</p>` : '';
  const photo = cert.photoURL ? `<img class="ml-preview" src="${esc(cert.photoURL)}" alt="오늘 인증 사진">` : '';
  return `<div class="ml-result">
    ${badge}${reason}
    ${photo}
    ${cert.content ? `<p class="ml-said">${esc(cert.content)}</p>` : ''}
    <button class="plainbtn" data-act="ml-edit">다시 올리기</button>
  </div>`;
}

/* 고른 사진 파일을 인증용으로 다듬는다: 장변 1024로 줄여 JPEG(0.7) base64로 만들고(문서에 바로 담고 AI에도 보냄),
   평균 해시(aHash)로 중복 비교용 지문을 뽑는다. 큰 원본을 그대로 담아 Firestore 1MB를 넘기지 않게 한다. */
function fileToMileagePhoto(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('img'));
      img.onload = () => {
        const max = 1024, scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = cv.toDataURL('image/jpeg', 0.7);
        resolve({ dataUrl, base64: dataUrl.split(',')[1], mediaType:'image/jpeg', hash: aHash(img) });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
// 평균 해시: 8x8 흑백으로 줄여 평균보다 밝으면 1. 64비트를 16진수 16자리로.
function aHash(img){
  const n = 8, cv = document.createElement('canvas'); cv.width = n; cv.height = n;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, n, n);
  const d = cx.getImageData(0, 0, n, n).data, g = [];
  for (let i = 0; i < n * n; i++) g.push(0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2]);
  const avg = g.reduce((a, b) => a + b, 0) / g.length;
  let hex = '';
  for (let i = 0; i < 64; i += 4){ let nib = 0; for (let j = 0; j < 4; j++) nib = (nib << 1) | (g[i+j] > avg ? 1 : 0); hex += nib.toString(16); }
  return hex;
}

// 지금 폼에 쳐 둔 글을 state에 담아 둔다(재그림에도 안 날아가게). 사진 고를 때·제출할 때 부른다.
function captureMileageForm(){
  const cEl = document.getElementById('ml-content'), fEl = document.getElementById('ml-feeling');
  if (cEl) state.mlForm.content = cEl.value;
  if (fEl) state.mlForm.feeling = fEl.value;
}

// 인증 제출: 검증 엔진을 돌려 통과/보류를 받고 저장한다. 검증 중에는 안내를 띄운다.
async function submitMileage(){
  const c = M.getCourse(state.courseId); if (!c) return;
  captureMileageForm();
  const content = state.mlForm.content.trim(), feeling = state.mlForm.feeling.trim();
  if (!state.mlDraft){ alertBox('오늘 공부한 사진을 올려 주세요.'); return; }
  if (content.length < 30){ alertBox('오늘 공부한 내용을 30자 이상 적어 주세요.'); return; }
  if (feeling.length < 30){ alertBox('느낀 점을 30자 이상 적어 주세요.'); return; }
  const gate = M.mileageGateReason(); if (gate){ alertBox(gate); return; }

  const subject = c.subject, today = M.mileageToday(), draft = state.mlDraft;
  state.mlBusy = true; render();

  const existing = M.getMileageCerts(subject)
    .map(x => ({ date:x.date, studentNo:x.studentNo, content:x.content, photoHash:x.photoHash }));
  let v;
  try {
    v = await verifyMileageCert({
      today, photoBase64:draft.base64, mediaType:draft.mediaType, content, feeling,
      photoHash:draft.hash, scopeNote:M.mileageScopeNote(subject),
      subject, grade:c.grade, existingCerts:existing, studentNo:state.sno,
    });
  } catch (e){
    v = { result:'pending', reason:'지금은 자동 확인을 못 했어요. 선생님이 직접 확인할게요.', checks:{}, photoDate:'' };
  }
  M.saveMileageCert({
    subject, year:c.year, studentNo:state.sno, name:state.name, date:today,
    photoURL:draft.dataUrl, content, feeling, photoHash:draft.hash,
    result:v.result, checks:v.checks, reason:v.reason, photoDate:v.photoDate,
  });
  state.mlBusy = false; state.mlDraft = null; state.mlEdit = false;
  state.mlForm = { content:'', feeling:'' };
  render();
}

/* 강의 하나를 연 화면의 제목은 "N강. 강의 주제"다(선생님 지시 2026-10-30, 요구사항 123).
   차수는 목록 카드와 같은 셈이다: 이 강의실에 연결돼 공개된 강의 중 몇 번째인가(M.getPartItems의 no와 같다).
   못 찾으면 제목만 쓴다. */
/* 그 강의실에서 몇 번째로 연결한 강의인가(1강, 2강). 연결돼 공개된 것만 센다.
   화면 제목(lessonHead)과 슬라이드 주소의 no가 같은 값을 써야 해서 셈을 여기 하나로 모았다. */
// 차수는 강의 고정 번호(lesson.num)로 표시한다(선생님 지시 2026-10-31: 반마다 세는 순번이 아니라
// 어디서나 같은 고정 번호). lessonBadge가 숫자면 "29강", OT 같은 말이면 "[OT]"로 만든다.
const lnum = l => M.lessonBadge(l?.num);
function lessonHead(l){ const b = lnum(l); return b ? `${b}. ${l.title}` : l.title; }

// ── 강의 하나를 고른 화면(배치 1): 칸을 탭으로 넘긴다 ──
function viewLesson(){
  const l = M.getLesson(state.lessonId);
  if (!l) return topbar('강의', 'back-menu') + `<div class="empty">강의를 찾지 못했습니다.</div>`;
  const order = l.order || [];
  if (!state.partKey || !order.includes(state.partKey)) state.partKey = order[0] || null;

  const tabs = order.map(k => {
    const d = M.partDef(k);
    return `<button class="lessontab ${k === state.partKey ? 'on':''}" data-act="part" data-k="${k}">
      ${icon(d.icon,16)}<span>${esc(d.name)}</span></button>`;
  }).join('');

  const idx = order.indexOf(state.partKey);
  const nav = `<div class="lessonnav">
    <button class="navbtn" data-act="part-prev" ${idx<=0?'disabled':''}>이전</button>
    <button class="navbtn" data-act="part-next" ${idx>=order.length-1?'disabled':''}>다음</button></div>`;

  // 강의 보기 메뉴에서 들어오므로 뒤로 가면 강의 목록이다
  return topbar(lessonHead(l), 'back-menu')
    + `<div class="lessontabs">${tabs}</div>`
    + `<div class="partview">${partView(l, state.partKey)}</div>` + nav;
}

// ── 칸 하나만 보는 화면(배치 2에서 들어옴) ──
function viewPart(){
  const l = M.getLesson(state.lessonId);
  const d = M.partDef(state.partKey);
  if (!l || !d) return topbar('', 'back-menu') + `<div class="empty">찾지 못했습니다.</div>`;
  return topbar(lessonHead(l), 'back-menu') + `<div class="partview">${partView(l, state.partKey)}</div>`;
}

/* 칸 하나의 알맹이.
   개념노트만 여기서 안 펼친다: 강의 슬라이드는 늘 새 탭 전체화면이다(요구사항 87). */
function partView(l, k){
  const d = M.partDef(k); if (!d) return '';
  const p = l.parts?.[k] || {};

  if (k === 'concept')
    return `<div class="pt">${icon(d.icon,15)} ${esc(d.name)}</div>
      <div class="bigt">${esc(p.title || d.name)}</div>
      <button class="primary wide" data-act="open-slide" data-lid="${l.id}">
        ${icon('monitor',18)}<span>슬라이드 열기</span></button>`;

  if (k === 'mission'){
    // 미션은 아이프레임 없이 늘 새 탭으로 연다(선생님 지시 2026-10-29).
    const app = M.getMissionApps().find(a => a.lessonId === l.id && a.studentUrl);
    if (!app) return `<div class="placeholder">아직 연결된 미션 활동이 없습니다.</div>`;
    return `<div class="bigt">${esc(app.name)}</div>
      <button class="primary wide" data-act="open-ext" data-url="${esc(app.studentUrl)}">
        ${icon('globe',18)}<span>미션 활동 열기</span></button>`;
  }

  if (k === 'question') return questionView(p);
  if (k === 'formative') return formativeStep(l, p);
  return '';
}

/* 오늘의 질문(학생): 본 질문을 큰 글씨로, 설명문, 답 칸, 글자수(공백 제외), 작은 제출 단추. */
function questionView(p){
  const guide = p.guide ? `<div class="q-guide">${esc(p.guide)}</div>` : '';
  return `<div class="q-big">${esc(p.question || '질문이 아직 없습니다.')}</div>${guide}
    <textarea id="q-answer" aria-label="내 생각"></textarea>
    <div class="q-foot"><span class="q-count" id="q-count">0자</span>
      <button class="btn-mini" data-act="submit-demo">제출</button></div>`;
}

/* ── 형성평가 퀴즈(학생): 한 문제씩 ── 어드민 다섯 유형을 그대로 받는다.
   문제 하나 → 답 → [정답 확인]으로 정답/오답 표시 → [다음]으로 넘어가고,
   마지막 문제의 확인 뒤 [끝내기]를 누르면 형성평가 목록(메인)으로 돌아온다. */
const FM_LETTERS = ['①','②','③','④','⑤','⑥','⑦','⑧'];
const fmNorm = v => String(v ?? '').replace(/\s+/g, '').toLowerCase();
function fmIsCorrect(it, g){
  if (g == null || g === '') return false;
  return (it.type === 'choice' || it.type === 'combo') ? +g === +it.a : fmNorm(g) === fmNorm(it.a);
}
function fmAnswerText(it){
  return (it.type === 'choice' || it.type === 'combo') ? ((it.choices || [])[it.a] ?? '') : (it.a ?? '');
}

function formativeStep(l, p){
  const items = p.items || [];
  if (!items.length) return `<div class="placeholder">아직 출제된 문항이 없습니다.</div>`;
  if (!state.fm || state.fm.lessonId !== l.id) state.fm = { lessonId:l.id, idx:0, result:null };
  const { idx, result } = state.fm;
  const it = items[idx];
  const last = idx === items.length - 1;

  let foot;
  if (!result){
    foot = `<button class="primary wide" data-act="fm-check" data-lid="${l.id}">정답 확인</button>`;
  } else {
    const mark = `<div class="fm-mark ${result.correct?'ok':'no'}">${result.correct ? '정답' : '오답'}</div>`;
    const reveal = result.correct ? '' : `<div class="fm-reveal">정답: ${esc(fmAnswerText(it))}</div>`;
    foot = `${mark}${reveal}
      <button class="primary wide" data-act="fm-next" data-lid="${l.id}">${last ? '끝내기' : '다음'}</button>`;
  }
  return `<div class="fmstep">
    <div class="fm-progress">${idx + 1} / ${items.length}</div>
    <div class="fm-q"><span class="fm-qnum">${idx + 1}</span><span class="fm-qtext">${esc(it.q || '')}</span></div>
    ${fmField(it, result)}${foot}</div>`;
}

// 한 문제의 입력칸(유형별). result가 있으면(확인 후) 잠그고 고른 답/정답을 표시한다.
function fmField(it, result){
  const g = result ? result.given : null;
  const dis = result ? 'disabled' : '';
  if (it.type === 'ox')
    return `<div class="fm-ox">${['O','X'].map(v =>
      `<label class="fm-oxb"><input type="radio" name="fmq" value="${v}" ${result && v===g?'checked':''} ${dis}>${v}</label>`).join('')}</div>`;
  if (it.type === 'choice' || it.type === 'combo'){
    const passage = it.passage ? `<div class="fm-passage">${esc(it.passage)}</div>` : '';
    const options = it.type === 'combo' && it.options ? `<div class="fm-options">${esc(it.options)}</div>` : '';
    const choices = (it.choices || []).map((c, ci) => {
      const sel = result && String(ci) === String(g);
      const isAns = result && ci === it.a;
      return `<label class="fm-choice ${sel?'sel':''} ${isAns?'ans':''}">
        <input type="radio" name="fmq" value="${ci}" ${sel?'checked':''} ${dis}>
        <span class="fm-letter">${FM_LETTERS[ci] || ci + 1}</span><span class="fm-ctext">${esc(c)}</span></label>`;
    }).join('');
    return `${passage}${options}<div class="fm-choices">${choices}</div>`;
  }
  return `<input class="fm-input" id="fmq" value="${esc(result ? (g || '') : '')}" ${dis} autocomplete="off">`;
}
// 지금 화면의 한 문제 답을 읽는다.
function fmReadOne(it){
  if (it.type === 'ox' || it.type === 'choice' || it.type === 'combo'){
    const picked = document.querySelector('input[name="fmq"]:checked');
    return picked ? picked.value : '';
  }
  const el = document.getElementById('fmq');
  return el ? el.value.trim() : '';
}

// ── 렌더 ──
function render(){
  const v = { login:viewLogin, rooms:viewRooms, home:viewHome,
              lesson:viewLesson, menu:viewMenu, part:viewPart }[state.view];
  state.noticeId = null;   // 다시 그리면 모달은 사라진다
  $app.innerHTML = v ? v() : '';
  window.scrollTo(0, 0);
}

function closeNoticeModal(){
  state.noticeId = null;
  $app.querySelector('.modal-back')?.remove();
}
// 댓글 달기(학생). 차단·댓글막기면 모델이 막고 안내한다.
function submitNoticeComment(noticeId){
  const inp = document.getElementById('ncm-input');
  const text = (inp?.value || '').trim();
  if (!text) return;
  try { M.addNoticeComment(noticeId, state.sno, state.name, text); refreshNoticeModal(); }
  catch(e){ alertBox(e.message); }
}
// Esc로 공지 모달을 닫는다. 댓글칸에서 Enter면 등록한다.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.noticeId) closeNoticeModal();
  else if (e.key === 'Enter' && e.target.id === 'ncm-input'){ e.preventDefault(); submitNoticeComment(state.noticeId); }
});

// ── 이벤트 위임 ──
$app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  switch (el.dataset.act){
    case 'login': {
      if (state.loginBusy) return;
      const sno = (document.getElementById('f-sno').value || '').trim();
      const name = (document.getElementById('f-name').value || '').trim();
      const pw = (document.getElementById('f-pw').value || '').trim();
      state.formSno = sno; state.formName = name;   // 오류로 다시 그려도 학번, 이름은 남긴다
      // 체크 상태는 지금 읽어 둔다. 다시 그리면 DOM이 사라지고, 비밀번호 생성 화면에도 이 칸이 없다
      state.formAuto = document.getElementById('f-auto')?.checked !== false;
      const rooms = M.getCoursesOfStudent(YEAR, sno);
      if (!rooms.length){ state.loginErr = '학번에 해당하는 강의실이 개설되지 않았습니다.'; render(); return; }
      if (!M.matchesRosterName(YEAR, sno, name)){ state.loginErr = '이름이 학생 명단과 일치하지 않습니다.'; render(); return; }
      state.loginBusy = true; state.loginErr = ''; render();
      (async () => {
        try {
          const rec = await M.getAuthRecord(YEAR, sno);
          if (!rec){   // 첫 접속: 비밀번호를 아직 안 만들었다
            state.loginBusy = false; state.pending = { sno, name, courseId: rooms[0].id };
            state.loginStep = 'setup'; render(); return;
          }
          if (!pw){ state.loginBusy = false; state.loginErr = '비밀번호를 입력하시길 바랍니다.'; render(); return; }
          const ok = await M.verifyPassword(YEAR, sno, pw);
          state.loginBusy = false;
          if (!ok){ state.loginErr = '비밀번호가 일치하지 않습니다.'; render(); return; }
          enterStudent(sno, name, state.formAuto);
        } catch (e) {
          console.error('login', e);
          state.loginBusy = false; state.loginErr = '연결이 원활하지 않습니다.'; render();
        }
      })();
      break;
    }
    case 'setup-pw': {
      if (state.loginBusy) return;
      const pw1 = (document.getElementById('f-pw1').value || '').trim();
      const pw2 = (document.getElementById('f-pw2').value || '').trim();
      if (pw1.length < 4){ state.loginErr = '비밀번호는 4자 이상이어야 합니다.'; render(); return; }
      if (pw1 !== pw2){ state.loginErr = '비밀번호가 일치하지 않습니다.'; render(); return; }
      state.loginBusy = true; state.loginErr = ''; render();
      (async () => {
        try {
          await M.createPassword(YEAR, state.pending.sno, pw1, state.pending.courseId);
          const { sno, name } = state.pending;
          state.pending = null; state.loginBusy = false;
          enterStudent(sno, name, state.formAuto);
        } catch (e) {
          console.error('setup-pw', e);
          state.loginBusy = false; state.loginErr = '연결이 원활하지 않습니다.'; render();
        }
      })();
      break;
    }
    // 저장된 정보로 입장. 명단이 바뀌어 더는 맞지 않으면 저장한 것을 지우고 폼으로 돌아간다
    case 'saved-enter': {
      const { sno, name } = state.saved || {};
      if (!sno) return;
      if (!M.getCoursesOfStudent(YEAR, sno).length || !M.matchesRosterName(YEAR, sno, name)){
        forgetSaved(); state.saved = null; state.formAuto = true;
        state.loginErr = '저장된 정보로 입장할 수 없습니다. 다시 로그인하시길 바랍니다.';
        render(); return;
      }
      enterStudent(sno, name, true);
      break;
    }
    case 'saved-other':
      forgetSaved();
      state.saved = null; state.loginErr = ''; state.formAuto = true;
      render(); break;

    case 'go-kakao': openExternal(M.getText('kakaoUrl')); break;
    case 'go-install': openExternal(M.getText('installUrl')); break;

    // 로그아웃은 이 탭의 세션만 지운다. 기기에 저장한 것은 남기므로 저장 카드가 다시 보인다
    case 'logout':
      for (const k of Object.values(SS)) stDel(sessionStorage, k);
      Object.assign(state, { view:'login', sno:'', name:'', courseId:null, noticeAll:false, noticeId:null,
        loginStep:'check', loginErr:'', loginBusy:false, pending:null, formSno:'', formName:'', fm:null,
        saved: readSaved() });
      render(); break;

    // 고른 강의실을 세션에 남긴다. 미션 앱이 shared/lms-session.js로 이 값을 읽는다
    case 'open-room':
      state.courseId = el.dataset.id;
      stSet(sessionStorage, SS.cid, state.courseId);
      state.noticeAll = false; state.view = 'home'; render(); break;
    case 'back-rooms': state.view = 'rooms'; render(); break;
    case 'back-home': state.view = 'home'; render(); break;
    case 'back-menu': state.view = 'menu'; render(); break;
    // 더보기, 접기는 목록만 다시 그린다(render는 맨 위로 스크롤하므로 쓰지 않는다)
    case 'notice-more': case 'notice-less': {
      state.noticeAll = el.dataset.act === 'notice-more';
      const sec = $app.querySelector('.notices');
      if (sec) sec.outerHTML = noticeList(M.getCourse(state.courseId));
      break;
    }
    // 공지 글은 모달로. 화면은 그대로 두고 위에 얹었다가 닫으면 걷는다(요구사항 118)
    case 'open-notice':
      state.noticeId = el.dataset.id;
      // 글을 열면 열람 기록을 남긴다(조회수). 실패해도 보기는 그대로(규칙 미배포 등).
      try { M.markNoticeRead(state.noticeId, state.sno, state.name); } catch(_){}
      $app.insertAdjacentHTML('beforeend', noticeModal());
      break;
    case 'close-notice':
      // 덮개 안(모달 본문)을 누른 것은 닫지 않는다. 덮개 자체나 X 단추만 닫는다
      if (el.classList.contains('modal-back') && e.target !== el) break;
      closeNoticeModal(); break;
    case 'notice-like':   // 좋아요 토글(학생)
      try { M.toggleNoticeLike(el.dataset.id, state.sno, state.name); } catch(_){}
      refreshNoticeModal(); break;
    case 'notice-comment-submit': submitNoticeComment(el.dataset.id); break;
    case 'notice-comment-del':
      try { M.deleteNoticeComment(el.dataset.id); } catch(_){}
      refreshNoticeModal(); break;

    case 'open-lesson': state.lessonId = el.dataset.lid; state.partKey = null; state.fm = null; state.view = 'lesson'; render(); break;
    case 'open-menu':
      state.menuKey = el.dataset.k; state.fm = null;
      state.mlDraft = null; state.mlEdit = false; state.mlBusy = false; state.mlForm = { content:'', feeling:'' };
      state.view = 'menu'; render(); break;
    case 'open-part':
      state.lessonId = el.dataset.lid; state.partKey = el.dataset.k; state.fm = null; state.view = 'part'; render(); break;

    case 'part': state.partKey = el.dataset.k; render(); break;
    case 'part-prev': shiftPart(-1); break;
    case 'part-next': shiftPart(1); break;

    // 강의 슬라이드는 늘 새 탭 전체화면(요구사항 87). 교실 화면에 투사하는 것이 주 용도다.
    case 'open-slide': {
      // URL은 랜덤 id 대신 연도+과목+강 번호로 연다(선생님 지시 2026-10-31). num/과목을 못 구하면 id로 폴백.
      const lesson = M.getLesson(el.dataset.lid), course = M.getCourse(state.courseId);
      const num = String(lesson?.num || '').trim();
      const url = (course && num)
        ? `slide.html?y=${encodeURIComponent(course.year)}&s=${encodeURIComponent(course.subject)}&n=${encodeURIComponent(num)}`
        : `slide.html?lesson=${encodeURIComponent(el.dataset.lid)}`;
      window.open(url, '_blank', 'noopener');
      break;
    }

    case 'submit-demo': alertBox('제출되었습니다. (데모)'); break;
    case 'open-ext': openMissionApp(el.dataset.url); break;

    // 열공 마일리지
    case 'ml-submit': submitMileage(); break;
    case 'ml-edit': state.mlEdit = true; render(); break;

    case 'fm-check': {
      const items = M.getLesson(el.dataset.lid)?.parts?.formative?.items || [];
      const it = items[state.fm.idx];
      const given = fmReadOne(it);
      if (given === '' || given == null){ alertBox('답을 입력해 주세요.'); break; }
      state.fm.result = { given, correct: fmIsCorrect(it, given) };
      render(); break;
    }
    case 'fm-next': {
      const items = M.getLesson(el.dataset.lid)?.parts?.formative?.items || [];
      if (state.fm.idx >= items.length - 1){   // 마지막 문제 → 형성평가 메인으로
        state.fm = null;
        if (state.view === 'part') state.view = 'menu';
      } else {
        state.fm.idx++; state.fm.result = null;
      }
      render(); break;
    }

    case 'noop': break;
  }
});

// 오늘의 질문 답 칸 글자수(공백 제외)를 실시간으로 센다.
$app.addEventListener('input', e => {
  if (e.target.id !== 'q-answer') return;
  const n = e.target.value.replace(/\s/g, '').length;
  const c = document.getElementById('q-count'); if (c) c.textContent = `${n}자`;
});

// 열공 마일리지 사진 고르기: 줄이고 base64·지문을 뽑아 쥔 뒤 미리보기로 다시 그린다.
// 다시 그리기 전에 쳐 둔 글을 state에 담아(captureMileageForm) 글이 날아가지 않게 한다.
$app.addEventListener('change', async e => {
  // 로그인 화면에서 학번, 이름을 다 넣고 칸을 벗어나면 비밀번호 칸 안내를 맞춰 준다.
  if (e.target.id === 'f-sno' || e.target.id === 'f-name'){ updatePwHint(); return; }
  if (e.target.id !== 'ml-file') return;
  const file = e.target.files && e.target.files[0]; if (!file) return;
  captureMileageForm();
  try {
    state.mlDraft = await fileToMileagePhoto(file);
  } catch (err){ alertBox('사진을 읽지 못했어요. 다른 사진으로 해 주세요.'); return; }
  render();
});

function shiftPart(dir){
  const l = M.getLesson(state.lessonId); if (!l) return;
  const order = l.order || []; const i = order.indexOf(state.partKey) + dir;
  if (i >= 0 && i < order.length){ state.partKey = order[i]; render(); }
}

// 아주 단순한 알림(브라우저 기본 대화상자 대신). 뼈대용.
function alertBox(msg){
  let t = document.getElementById('snack');
  if (!t){ t = document.createElement('div'); t.id = 'snack'; document.body.appendChild(t); }
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 1800);
}

boot();
