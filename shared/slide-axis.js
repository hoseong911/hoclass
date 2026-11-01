/* ══ 강의 슬라이드의 축 (선생님 지시 2026-10-30, 요구사항 125) ══════════════
 *
 * "표지 - 전시학습확인(퀴즈 등) - 학습 목표 - 동기 유발 내용(사진, 영상류) -
 *  개념 노트(강의 내용) - 미션 활동 - 오늘의 질문 - 맺음말 이 순서야"
 *
 * 수업 한 차시의 흐름이라 순서와 단계가 고정이다. 선생님이 더하고 빼고 섞는 것이 아니다.
 * (hoistory 2026은 섹션을 자유롭게 짜는 틀이었다. 2027은 선생님이 쓰는 수업 흐름 하나로 못박았다.)
 * 단계마다 내용이 없으면 그 단계는 슬라이드에서 그냥 빠진다. 끄고 켜는 스위치를 따로 두지 않는다.
 *
 * ── 이 파일이 model.js 밖에 따로 있는 까닭 ──
 * model.js는 맨 위에서 Firebase를 불러온다. 축과 덱의 모양만 알면 되는 쪽(슬라이드 엔진,
 * 활동지 변환 도구, 혼자 도는 미리보기 문서)이 Firebase까지 끌어오지 않게 갈라 두었다.
 * model.js가 이 파일을 불러 그대로 다시 내보내므로 어드민과 학생 화면은 M.SLIDE_AXIS로 쓴다.
 *
 * 내용이 어디서 오는가(from)
 *   null        그 단계가 덱(lesson.deck)에 직접 들고 있다
 *   'concept'   parts.concept.content 를 그대로 쓴다(아래 toPages의 페이지 모양)
 *   'mission'   페이지는 덱(deck.mission.content)이 들고 있고, 페이지 제목을 비우면
 *               parts.mission 의 제목(미션 활동 메뉴의 이름)을 쓴다
 *   'question'  parts.question 의 질문과 설명문을 그대로 쓴다
 * 같은 내용을 두 군데 적지 않게 하려고 이렇게 갈랐다. 미션 활동 메뉴에서 제목을 고치면
 * 슬라이드 제목도 같이 바뀐다.
 *
 * edit 는 어드민 편집기가 그 단계를 어떤 칸으로 그릴지다(admin.js의 deckStepEditor).
 *   cover 표지 메타 / qa 문답 / lines 줄 목록(학습 목표) / preview 사진과 영상 / pages 페이지 / question 읽기만 / closing 다음 학습 주제
 * 개념 노트와 미션 활동은 둘 다 pages다(2026 편집기가 둘을 같은 틀로 고쳤다).
 */
export const SLIDE_AXIS = [
  { key:'cover',     name:'표지',         edit:'cover',    from:null },
  { key:'review',    name:'전시학습확인',  edit:'qa',       from:null },
  { key:'objective', name:'학습 목표',     edit:'lines',    from:null },
  { key:'hook',      name:'동기 유발',     edit:'preview',    from:null },
  { key:'concept',   name:'개념 노트',     edit:'pages',    from:'concept' },
  { key:'mission',   name:'미션 활동',     edit:'pages',    from:'mission' },
  { key:'question',  name:'오늘의 질문',   edit:'question', from:'question' },
  { key:'closing',   name:'맺음말',        edit:'closing',  from:null },
];
export const AXIS_ORDER = SLIDE_AXIS.map(s => s.key);
export function axisStep(key){ return SLIDE_AXIS.find(s => s.key === key) || null; }

/* 강의 번호표 (선생님 지시 2026-10-30): 강의마다 적는 번호/라벨을 어떻게 보일지.
   숫자만 적으면 "N강"(1 → 1강), 그 밖의 말(OT, 수행 등)이면 대괄호로 "[OT]".
   빈 값이면 아무것도 안 보인다. 강의 라이브러리 목록, 축 고르개, 슬라이드 표지가 같이 쓴다. */
export function lessonBadge(num){
  const s = String(num ?? '').trim();
  if (!s) return '';
  return /^\d+$/.test(s) ? `${s}강` : `[${s}]`;
}

/* ══ 슬라이드 디자인 설정 (디자인 탭, 선생님 지시 2026-10-31) ══════════════
 * 전체 공통(강의 무관) 설정이다. 값은 1080 높이 기준 px. slide-deck.css의 --fs- / --ls- / --lh- 기본값을 덮어쓴다.
 * 요소마다 크기(fs)·자간(ls)·줄간격(lh) 셋을 조절한다. 크기·자간은 pt(한글·워드와 같은 단위.
 * 1pt=2 design-px, 쪽 높이 1080=540pt. --px를 곱해 쪽 크기에 맞춰 함께 커진다), 줄간격은 퍼센트다
 * (글자 크기의 몇 %. 160이면 1.6배. 선생님 지시 2026-10-31: 크기·자간은 pt, 줄간격은 퍼센트).
 *   저장 키: 크기=key, 자간=key+'Ls', 줄간격=key+'Lh'.
 * 자간·줄간격은 "전체(global)"가 기본이라 요소값이 없으면(미설정) 쪽 전체값(gLs/gLh)을 그대로 상속한다.
 *   그래서 요소를 건드리지 않은 학생 화면은 slide-deck.css의 후크 기본값(현재 모양) 그대로다.
 * 적용은 designVarsCss가 만든 한 줄 CSS(.deckpage{…})를 슬라이드 문서가 <style>로 끼운다.
 * 어드민 디자인 탭과 슬라이드가 이 한 곳을 같이 본다(스펙이 어긋나지 않게). */
export const SLIDE_DESIGN_LS = { min:-4, max:7 };      // 자간 pt 범위(크기와 같은 pt 단위)
export const SLIDE_DESIGN_LH = { min:100, max:250, step:5 };  // 줄간격은 퍼센트(글자 크기의 몇 %). 160=1.6배
/* 전체(global): 모든 슬라이드 공통 자간·줄간격. 기본값은 지금 모양(자간 0pt, 줄간격 180%=1.8배)과 같다.
   자간은 pt, 줄간격은 퍼센트다(선생님 지시 2026-10-31: 1.6이면 160%로 적게). */
export const SLIDE_DESIGN_GLOBAL = {
  ls: { key:'gLs', cssVar:'--ls-global', label:'자간',   def:0,   ...SLIDE_DESIGN_LS },
  lh: { key:'gLh', cssVar:'--lh-global', label:'줄간격', def:180, ...SLIDE_DESIGN_LH },
};
// 요소 한 줄: 크기 변수(cssVar)+기본/범위, 자간 변수(lsVar), 줄간격 변수(lhVar)
const E = (key, cssVar, label, def, min, max, lsVar, lhVar) => ({ key, cssVar, label, def, min, max, lsVar, lhVar });
/* 크기는 pt다(한글·워드와 같은 단위. 선생님 지시 2026-10-31). 1pt = 2 design-px(쪽 높이 1080 = 540pt,
   16:9 표준 슬라이드 높이). 값은 정수로 둔다(선생님이 다시 고른다). designVarsCss가 적용할 때 ×2 한다. */
export const SLIDE_DESIGN = [
  { group:'표지', step:'cover', rows:[
    E('coverTitle',   '--fs-cover-title',   '제목',     60, 20, 110, '--ls-cover-title',   '--lh-cover-title'),
    E('coverTagline', '--fs-cover-tagline', '학습 주제', 22, 10,  45, '--ls-cover-tagline', '--lh-cover-tagline'),
    E('coverMeta',    '--fs-cover-meta',    '단원/쪽수', 20, 10,  40, '--ls-cover-meta',    '--lh-cover-meta'),
    E('coverNum',     '--fs-cover-num',     '강 번호',   50, 15, 100, '--ls-cover-num',     '--lh-cover-num'),
  ]},
  { group:'학습 목표', step:'objective', rows:[
    E('obj',    '--fs-obj',     '항목',    30, 12, 55, '--ls-obj',    '--lh-obj'),
    E('objNum', '--fs-obj-num', '큰 번호', 65, 20,120, '--ls-objnum', '--lh-objnum'),
  ]},
  { group:'공통(쪽 제목·본문)', step:'concept', rows:[
    E('slideTitle', '--fs-slide-title', '쪽 제목·배지', 22, 10, 45, '--ls-title', '--lh-title'),
    E('body',       '--fs-body',        '본문',         28, 12, 50, '--ls-body',  '--lh-body'),
  ]},
  { group:'비교표', step:null, rows:[
    E('cmpHead', '--fs-cmp-head', '머리', 22, 10, 45, '--ls-cmphead', '--lh-cmphead'),
    E('cmpBody', '--fs-cmp-body', '내용', 28, 12, 50, '--ls-cmpbody', '--lh-cmpbody'),
  ]},
  { group:'사료 인용', step:null, rows:[
    E('src', '--fs-src', '본문', 25, 12, 50, '--ls-src', '--lh-src'),
  ]},
  { group:'오늘의 질문', step:'question', rows:[
    E('question',   '--fs-question',    '질문',   33, 14, 60, '--ls-question', '--lh-question'),
    E('thinkGuide', '--fs-think-guide', '안내문', 28, 12, 50, '--ls-guide',    '--lh-guide'),
  ]},
];
export const SLIDE_DESIGN_ROWS = SLIDE_DESIGN.flatMap(g => g.rows);
/* 기본값: 크기와 전체(global) 자간·줄간격만 둔다. 요소별 자간·줄간격은 기본이 "전체 상속"이라 넣지 않는다. */
export function slideDesignDefault(){
  const o = {};
  SLIDE_DESIGN_ROWS.forEach(r => o[r.key] = r.def);
  o[SLIDE_DESIGN_GLOBAL.ls.key] = SLIDE_DESIGN_GLOBAL.ls.def;
  o[SLIDE_DESIGN_GLOBAL.lh.key] = SLIDE_DESIGN_GLOBAL.lh.def;
  return o;
}
/* 설정값을 슬라이드에 걸 CSS 한 줄로. 기본값과 같은 항목은 빼서 slide-deck.css 기본(현재 모양)을 그대로 둔다.
   자간·줄간격은 요소값이 있을 때만 변수를 낸다(없으면 후크의 inherit로 전체값을 따른다). */
export function designVarsCss(values){
  // 크기·자간은 pt라 1pt=2 design-px로 적용한다(--px 곱하기 값의 2배). 줄간격(lh)은 퍼센트라 100으로 나눠
  // 배수로 적는다(line-height는 단위 없는 배수). 10 미만이면 옛 배수값(1.8 등)이라 그대로 배수로 본다.
  const v = values || {}, g = SLIDE_DESIGN_GLOBAL, pt = n => `calc(var(--px) * ${n * 2})`;
  const lh = n => (+n > 0 && +n < 10 ? +n : +n / 100);   // 퍼센트→배수(옛 배수값은 그대로)
  const decls = [];
  SLIDE_DESIGN_ROWS.forEach(r => {
    if (v[r.key] != null && +v[r.key] !== r.def) decls.push(`${r.cssVar}:${pt(+v[r.key])}`);
    if (v[r.key + 'Ls'] != null) decls.push(`${r.lsVar}:${pt(+v[r.key + 'Ls'])}`);
    if (v[r.key + 'Lh'] != null) decls.push(`${r.lhVar}:${lh(v[r.key + 'Lh'])}`);
  });
  if (v[g.ls.key] != null && +v[g.ls.key] !== g.ls.def) decls.push(`${g.ls.cssVar}:${pt(+v[g.ls.key])}`);
  if (v[g.lh.key] != null && +v[g.lh.key] !== g.lh.def) decls.push(`${g.lh.cssVar}:${lh(v[g.lh.key])}`);
  return decls.length ? `.deckpage{${decls.join(';')}}` : '';
}

/* 전시학습확인 문항의 유형 셋 (선생님 지시 2026-10-30: "단답형 OX 초성형 3개 유형").
   말씀하신 순서 그대로다. 키도 이름도 형성평가(model.js의 FORMATIVE_TYPES)와 같다:
   ox를 전시학습확인에서만 "OX"로 부르던 것을 선생님 지시로 진위형으로 맞췄다
   (2026-10-30: "전시 학습 확인에서 ox를 진위형으로 바꿔주고"). 같은 것을 두 이름으로 부르지 않는다.

   유형이 슬라이드에서 가르는 것은 "학생이 어떻게 답하는가"다.
     short   단답형  답을 말이나 글로
     ox      진위형  O인지 X인지 (답 칸은 O와 X 라디오 그대로다. 이름만 진위형이다)
     initial 초성형  초성을 보고 낱말을
   초성은 선생님이 문제 글에 직접 적는다(형성평가와 같은 규칙. 자동으로 만들지 않는다). */
export const REVIEW_TYPES = [
  { key:'short',   name:'단답형' },
  { key:'ox',      name:'진위형' },
  { key:'initial', name:'초성형' },
];
export function reviewTypeDef(key){ return REVIEW_TYPES.find(t => t.key === key) || REVIEW_TYPES[0]; }

/* 덱(lesson.deck): 축 단계마다 칸 하나. 덱이 직접 들고 있는 것만 여기 있다.
   개념 노트와 오늘의 질문은 parts 쪽에 있으므로 덱에 칸을 두지 않는다. */
export function blankDeck(){
  return {
    cover:     { topic:'', unit:'', pages:'' },   // 학습 주제, 단원, 교과서 쪽수
    review:    { items:[] },            // [{ q, a }]
    objective: { items:[] },            // ['목표 한 줄', ...]
    hook:      { items:[] },            // [{ kind:'image'|'video', url, caption } 또는 { kind:'text', text }]
    mission:   { content:[] },          // 개념 노트와 같은 페이지 모양(아래 toPages)
    closing:   { items:[], nextTopic:'' },  // 맺음말: 'NEXT CLASS'(필기체 고정) + 다음 학습 주제(nextTopic)
  };
}

/* 모양을 맞춰 준다: 옛 문서에 deck이 없거나 칸이 빠져 있어도 화면이 깨지지 않게.
   받은 강의 객체를 그 자리에서 고치고 덱을 돌려준다(저장은 부르는 쪽이 한다). */
export function normalizeDeck(lesson){
  if (!lesson) return null;
  const base = blankDeck();
  if (!lesson.deck || typeof lesson.deck !== 'object') lesson.deck = base;
  else Object.keys(base).forEach(k => {
    if (!lesson.deck[k] || typeof lesson.deck[k] !== 'object') lesson.deck[k] = base[k];
    else if (Array.isArray(base[k].items) && !Array.isArray(lesson.deck[k].items)) lesson.deck[k].items = [];
  });
  /* 전시학습확인에 유형이 생기기 전(2026-10-30 낮)에 적어 둔 문항은 유형 칸이 없다.
     그런 문항은 단답형으로 본다: 그때 적을 수 있던 것이 묻는 줄과 답 줄뿐이었다. */
  lesson.deck.review.items.forEach(it => {
    // 페이지 나누기 마커(선생님 지시 2026-10-31: 전시학습확인을 여러 쪽으로)는 문항이 아니라
    // 쪽을 가르는 표시라 유형을 매기지 않는다. 슬라이드(buildSlides)가 이 마커에서 쪽을 나눈다.
    if (it && typeof it === 'object' && !it.pagebreak && !REVIEW_TYPES.some(t => t.key === it.type)) it.type = 'short';
  });
  /* 미션 활동이 페이지 모양이 되기 전(2026-10-30 낮)에는 안내 줄 목록(items)이었다.
     그 줄들을 제목 없는 페이지 하나, 라벨 없는 묶음 하나로 옮긴다
     (페이지 제목이 비면 슬라이드에는 미션 이름이 선다). */
  const ms = lesson.deck.mission;
  if (!Array.isArray(ms.content)){
    const old = (Array.isArray(ms.items) ? ms.items : []).map(t => String(t ?? '').trim()).filter(Boolean);
    ms.content = old.length ? [{ type:'divider', title:'' }, { type:'row', label:'', text:old.join('\n') }] : [];
  }
  delete ms.items;
  // 맺음말: 'NEXT CLASS'(고정) 아래에 적는 다음 학습 주제. 옛 문서엔 없으니 빈 글자로 채운다
  if (typeof lesson.deck.closing.nextTopic !== 'string') lesson.deck.closing.nextTopic = '';
  return lesson.deck;
}

/* ══ 개념 노트와 미션 활동의 페이지 (선생님 지시 2026-10-30) ═══════════════════
 *
 * "2026에 사용한 lms 콘텐츠 편집기를 참고하여 개념노트 페이지와 미션 활동 페이지 만들어줄것"
 *
 * 2026 편집기(개념 Check, 미션 Check)의 틀을 보고 따랐다: 페이지마다 제목이 있고,
 * 페이지 안은 "라벨 + 내용" 묶음 여러 개다. 내용은 한 줄이 한 항목이다.
 * 2026은 개념과 미션을 같은 편집기로 고쳤다. 2027도 둘이 같은 모양, 같은 편집기다.
 *
 * 저장 모양은 예전 개념 노트 줄 배열을 그대로 잇는다(옛 강의를 옮기지 않아도 되게):
 *   { type:'divider', title }        페이지 제목. 여기서 새 페이지
 *   { type:'row', label, text }      묶음 하나. text는 여러 줄(줄바꿈으로 나눈다)
 *
 *   { type:'compare', left:{ label, text }, right:{ label, text } }
 *                                    좌우 비교 묶음(선생님 지시 2026-10-30, 요구사항 137:
 *                                    "기존 lms에서 좌우 비교하는 내용이 있거든? 그거를 참고해봐").
 *                                    2026의 compare처럼 왼쪽과 오른쪽이 각각 라벨과 내용을 든다.
 *                                    서인과 동인을 견주는 두 칸 표가 그 예다.
 *
 *   { type:'source', label, text }   사료 인용 묶음(선생님 지시 2026-10-30, 요구사항 139).
 *                                    라벨이 사료 제목, 내용이 원문이다. 칸은 보통 묶음과 같고
 *                                    그리는 모양만 사료 쪽을 따른다(ROW_TYPES 주석).
 *
 * **원칙: 묶음 하나가 페이지 하나다**(선생님 지시 2026-10-30, 요구사항 139:
 * "원칙은 1행라벨 당 1페이지"). 활동지에서 가져올 때 그렇게 나눈다(worksheet.js의 newRow).
 * 내용이 적어 한 쪽에 같이 두고 싶으면 편집기에서 합치고(pg-merge-up), 많으면 나눈다
 * (pg-split-rows, pg-row-cut). 그래서 저장 모양은 한 페이지에 묶음 여럿을 그대로 담는다.
 * 개념 노트는 parts.concept.content, 미션 활동은 deck.mission.content 에 든다.
 *
 * 페이지로 펴면 비교 묶음은 { kind:'compare', label:'', text:'', left, right }다.
 * label과 text를 빈 글자로 같이 두는 까닭: 묶음을 다루는 옛 코드가 r.label.trim()을 그냥 부른다.
 * 그래도 "적힌 것이 있는가"는 rowFilled 한 곳으로 묻는다(비교 묶음은 네 칸을 다 봐야 한다).
 *
 * 예전 줄(label 칸이 아예 없는 row)은 한 줄이 row 하나였다. 그런 줄이 이어지면
 * 페이지로 펼 때 한 묶음으로 합친다(보이는 모양은 같고 편집기에서 칸이 줄줄이 서지 않게).
 * 새로 만든 묶음은 label 칸을 늘 들고 있어서(빈 글자라도) 합쳐지지 않는다.
 */
const side = s => ({ label: String(s?.label ?? ''), text: String(s?.text ?? '') });
export const blankCompare = () => ({ kind:'compare', label:'', text:'', left: side(), right: side() });

/* ── 묶음의 유형 (선생님 지시 2026-10-30, 요구사항 139) ──
 * "여러가지 유형의 페이지가 있을 수 있으니 그 유형을 고르는 기능도 각 행마다
 *  (페이지 내에서 다른 걸 적용 해야 하기도 함) 만들어줘"
 *
 * 유형은 페이지가 아니라 묶음마다 고른다. 한 페이지 안에서 묶음마다 다를 수 있다.
 *   rows     설명글      설명글 제목 + 내용 줄 (지금까지의 보통 묶음. 선생님 지시 2026-11-01에
 *                        화면 이름을 '행 나열'에서 '설명글', '라벨'에서 '설명글 제목'으로 바꿨다)
 *   compare  좌우 비교   왼쪽과 오른쪽이 각각 라벨과 내용 (서인과 동인)
 *   source   사료 인용   라벨이 사료 제목, 내용이 원문. 세리프체 양쪽 정렬에 큰따옴표
 * 저장 모양에서 유형은 type('row' / 'compare' / 'source')이고, 페이지로 펴면 kind다.
 * 2026 lms에는 연표와 플로우도 있었지만 가져오지 않았다(선생님이 고른 것은 이 셋이다).
 *
 * 사료 쪽(SOURCE_RE: 제목이 "사료 : "로 시작하는 페이지)은 그대로 둔다. 그쪽은 쪽 하나가
 * 통째로 사료인 것이고, 이 유형은 쪽 안의 묶음 하나가 사료인 것이다. 활동지 변환은 여전히
 * 제목으로 사료 쪽을 가린다(쪽 하나를 통째로 떼는 편이 활동지 모양에 맞다). */
export const ROW_TYPES = [
  { key:'rows',    name:'설명글' },
  { key:'compare', name:'좌우 비교' },
  { key:'source',  name:'사료 인용' },
];
// 옛 묶음은 kind 칸이 아예 없다(한 줄이 한 묶음이던 때의 것). 그런 묶음은 행 나열이다
export const rowKind = r => (r && ROW_TYPES.some(t => t.key === r.kind) ? r.kind : 'rows');

/* 묶음의 유형을 바꾼다. **적은 글을 잃지 않는 것이 규칙이다**(편집기에서 잘못 골라도
   되돌리면 글이 돌아와야 한다).
   행 나열 ↔ 사료 인용은 칸이 같아서(라벨, 내용) 그대로 옮긴다.
   행 나열, 사료 → 좌우 비교는 적은 것을 왼쪽 칸에 넣는다(오른쪽은 빈 칸).
   좌우 비교 → 둘은 왼쪽 라벨만 라벨로 남고, 나머지 셋은 내용 줄로 이어 붙인다. */
export function convertRow(row, kind){
  const to = ROW_TYPES.some(t => t.key === kind) ? kind : 'rows';
  const from = rowKind(row);
  if (from === to) return row;
  if (to === 'compare'){
    const c = blankCompare();
    c.left = side({ label: row?.label, text: row?.text });
    return c;
  }
  const keep = (label, text) => to === 'source' ? { kind:'source', label, text } : { label, text };
  if (from === 'compare'){
    const parts = [row.left?.text, row.right?.label, row.right?.text]
      .map(t => String(t ?? '').trim()).filter(Boolean);
    return keep(String(row.left?.label ?? ''), parts.join('\n'));
  }
  return keep(String(row?.label ?? ''), String(row?.text ?? ''));
}

export function toPages(content){
  const pages = [];
  let cur = null, lastLegacy = false;
  (Array.isArray(content) ? content : []).forEach(ln => {
    if (!ln || typeof ln !== 'object') return;
    if (ln.type === 'divider'){
      cur = { title: String(ln.title ?? ''), rows: [] }; pages.push(cur); lastLegacy = false; return;
    }
    if (!cur){ cur = { title: '', rows: [] }; pages.push(cur); }
    if (ln.type === 'compare'){
      cur.rows.push({ ...blankCompare(), left: side(ln.left), right: side(ln.right) });
      lastLegacy = false; return;
    }
    if (ln.type === 'source'){
      cur.rows.push({ kind:'source', label: String(ln.label ?? ''), text: String(ln.text ?? '') });
      lastLegacy = false; return;
    }
    const legacy = !('label' in ln);
    const text = String(ln.text ?? '');
    if (legacy && lastLegacy) cur.rows[cur.rows.length - 1].text += '\n' + text;
    else cur.rows.push({ label: String(ln.label ?? ''), text });
    lastLegacy = legacy;
  });
  return pages;
}
export function fromPages(pages){
  const out = [];
  (pages || []).forEach(p => {
    out.push({ type:'divider', title: String(p.title ?? '') });
    (p.rows || []).forEach(r => out.push(rowKind(r) === 'compare'
      ? { type:'compare', left: side(r.left), right: side(r.right) }
      : { type: rowKind(r) === 'source' ? 'source' : 'row',
          label: String(r.label ?? ''), text: String(r.text ?? '') }));
  });
  return out;
}

/* 묶음, 페이지에 적힌 것이 있는가. 어드민 채움 표시(deckStepFilled), 비울 것 세기(stepHasContent),
   활동지를 덮어쓸지 묻기(importWorksheet)가 같이 쓴다. 비교 묶음이 생겨 칸이 넷이 되었으므로
   곳곳에서 label과 text만 보던 것을 여기 한 곳으로 모았다(어긋나면 "비었다는데 내용이 있다"가 된다). */
const filled = v => !!String(v ?? '').trim();
export const rowFilled = r => !!r && (r.kind === 'compare'
  ? filled(r.left?.label) || filled(r.left?.text) || filled(r.right?.label) || filled(r.right?.text)
  : filled(r.label) || filled(r.text));
export const pagesFilled = pages => (pages || []).some(p => filled(p.title) || p.rows.some(rowFilled));

/* ── 내용 줄의 단계 (선생님 지시 2026-10-30) ──
 * "내용 수준 단계는 총 3단계로 1. , -, · 임. 활동지에서 수준이 떨어질 수록 들여쓰기를 해야 함."
 *
 *   1단계  1. 2. 3.   (숫자와 마침표)
 *   2단계  -
 *   3단계  ·          (가운뎃점. 한글 자판의 ㆍ, 일본식 ・, 동그라미 • 도 같이 받는다)
 *   0      기호 없는 줄. 바로 위 항목에 이어지는 줄로 본다
 *
 * 기호는 선생님이 활동지에 쓴 글자 그대로라 줄 글자에 남겨 둔다. 단계를 따로 적어 두지 않는다.
 * 그래서 이 함수가 슬라이드(들여쓰기), 편집기(칸 안 들여쓰기), 활동지 변환(라벨 가리기)의
 * 공통 기준이다. 여기만 고치면 셋이 같이 바뀐다.
 *
 * "1.5배", "-5도"처럼 기호가 내용인 줄을 잘못 읽지 않게 숫자가 바로 붙으면 기호로 보지 않는다.
 * (글머리 기호를 가려내는 정규식이라 가운뎃점 글자 자체가 자료다. 화면 규칙의 예외 자리)
 */
const LEVEL_RES = [
  [1, /^(\d{1,2}\.)(?!\d)\s*/],
  [2, /^([-–])(?!\s*\d)\s*/],
  [3, /^([·ㆍ・•∙])\s*/],
];
export function lineLevel(line){
  const s = String(line ?? '').replace(/^[\s　]+/, '');
  for (const [lv, re] of LEVEL_RES){
    const m = s.match(re);
    if (m && s.length > m[0].length) return { lv, mark: m[1], body: s.slice(m[0].length) };
  }
  return { lv: 0, mark: '', body: s };
}

/* 편집기 글 칸에서 단계가 보이게 줄 앞에 빈칸을 넣고(indentText), 저장할 때 걷는다(stripIndent).
   저장되는 글에는 들여쓰기 빈칸이 없다. 단계는 기호가 정하므로 빈칸은 보기용일 뿐이다.
   기호 없는 줄은 바로 위 항목의 글 시작 자리에 맞춘다(기호 폭만큼 더 민다). */
const IND = 4;
export function indentText(text){
  let prev = 0, prevMark = 0;
  return String(text ?? '').split('\n').map(raw => {
    const t = raw.replace(/^[\s　]+/, '');
    if (!t) return '';
    const { lv, mark } = lineLevel(t);
    if (lv){ prev = (lv - 1) * IND; prevMark = mark.length + 1; return ' '.repeat(prev) + t; }
    return ' '.repeat(prev + prevMark) + t;
  }).join('\n');
}
export function stripIndent(text){
  return String(text ?? '').split('\n').map(t => t.replace(/^[\s　]+/, '').replace(/\s+$/, ''))
    .join('\n').replace(/^\n+|\n+$/g, '');
}

/* ── 페이지 제목의 단계 이름 머리 (선생님 지시 2026-10-30) ──
 * "개념 노트 #1 : 성리학적 질서의 확산이면 성리학적 질서의 확산 이렇게만"
 * 배지가 이미 단계 이름을 말하므로 제목에 같은 말을 또 두지 않는다. 떼는 것은 단계 이름 꼴의
 * 머리뿐이다(개념 노트, 개념 Check, 미션 활동, 미션 Check, 뒤에 #번호가 붙어도).
 * "사료 : ..."의 사료는 단계 이름이 아니라 쪽의 종류라 여기서 떼지 않는다(slide-deck.js가 사료 쪽으로 그린다).
 * 활동지 변환(worksheet-pdf.js)이 가져올 때 떼고, 슬라이드(slide-deck.js)도 그릴 때 한 번 더 뗀다
 * (손으로 적은 제목이나 예전에 가져온 제목에 머리가 남아 있어도 쪽에는 서지 않게). */
export const STEP_PREFIX_RE = /^(?:개념\s*노트|개념\s*Check|미션\s*활동|미션\s*Check)\s*(?:#\s*\d+)?\s*:\s*/i;
export const stripStepPrefix = t => String(t ?? '').trim().replace(STEP_PREFIX_RE, '').trim();

/* 사료 쪽인가: 제목이 "사료", "글자료", "읽기 자료"로 시작하면 사료 쪽이다.
   슬라이드(slide-deck.js)가 사료 모양으로 그리고, 활동지 변환(worksheet-pdf.js)이 그 쪽을
   따로 떼어 낼 때 같은 기준을 쓴다. 두 곳이 어긋나면 "변환은 사료로 뗐는데 사료처럼 안 그려진다"가
   되므로 여기 한 곳에 둔다(STEP_PREFIX_RE를 여기로 옮긴 것과 같은 까닭). */
export const SOURCE_RE = /^(?:사료|글\s*자료|읽기\s*자료)\s*\d*\s*(?::\s*|$)/;
