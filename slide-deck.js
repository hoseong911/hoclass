/* ════════════════════════════════════════════════════════════════════════
   강의 슬라이드 엔진: 덱(강의 하나) → 쪽 배열 → 쪽 HTML.

   축은 model.js의 SLIDE_AXIS 하나에서 온다(선생님 지시 2026-10-30, 요구사항 125).
     표지, 전시학습확인, 학습 목표, 동기 유발, 개념 노트, 미션 활동, 오늘의 질문, 맺음말

   학생 슬라이드(slide.html)와 어드민 미리보기가 이 파일 하나를 같이 불러써서 두 쪽이
   언제나 같게 보인다. 모양(색, 크기)은 slide-deck.css 한 곳에 있다.

   hoistory 2026의 slide-render.js를 그대로 들고 오지 않았다(선생님 지시 2026-10-30:
   "이식은 보고 따라하라는 뜻"). 거기서 가져온 생각은 셋이다:
     하나, 쪽 만들기와 쪽 그리기를 한 파일에 두어 두 화면이 어긋나지 않게 한다.
     둘,   빈칸 문법 {정답} 과 굵게 문법 **굵게** 를 본문에 둔다.
     셋,   유튜브 주소에서 영상 id와 시작 시각을 읽어 끼운다.
   2026의 글꼴 슬라이더, 장평, 디자인 설정 50여 칸은 가져오지 않았다. 아직 시킨 것이 아니다.
   ════════════════════════════════════════════════════════════════════════ */
// Firebase를 끌어오지 않는 축 파일만 쓴다: 혼자 도는 미리보기 문서도 이 엔진을 그대로 쓴다
import { SLIDE_AXIS, normalizeDeck, toPages, lineLevel, stripStepPrefix, SOURCE_RE, rowFilled, rowKind, lessonBadge } from './shared/slide-axis.js?v=20261101f';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

/* 본문 한 줄을 HTML로. 두 가지 문법만 둔다(2026에서 가져온 것).
     {정답}   빈칸. 레드 글씨로 늘 보인다
     **굵게** 강조. 네이비 굵게
   빈칸은 처음에 가려 두었다가 눌러서 여는 것이었는데 걷었다(선생님 지시 2026-10-30:
   "지금 빈칸들이 다 가려져 있는데 다 걷어내줘"). 활동지의 빈칸 자리라는 표시로 레드만 남긴다.

   빈칸을 먼저 떼어 두는 자리표는 NUL(눈에 안 보이는 0번 글자)로 둔다. 글 안에 우연히
   나올 수 없는 글자라야 "1 더하기 1 은" 같은 본문을 빈칸으로 잘못 읽지 않는다.
   소스에 NUL을 그대로 적으면 파일이 바이너리로 보여서 String.fromCharCode로 만든다. */
const NUL = String.fromCharCode(0);
const NUL_RE = new RegExp(NUL + '(\\d+)' + NUL, 'g');
export function inlineText(str){
  const blanks = [];
  let s = String(str ?? '').replace(/\{([^}]+)\}/g, (_, inner) => {
    blanks.push(inner);
    return NUL + (blanks.length - 1) + NUL;
  });
  s = esc(s).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  return s.replace(NUL_RE, (_, i) => `<span class="blank">${esc(blanks[+i])}</span>`);
}

/* 기호로 시작하는 줄(→ 같은 화살표·불릿)은 기호를 왼쪽으로 내어쓴다(선생님 지시 2026-11-01:
   "기호로 시작하는 건 다 기호를 앞으로 내어쓰기"). 1. - · 수준 기호는 이미 .pm/.pt가 내어쓰므로
   여기서는 수준이 아닌 기호만 본다(이어지는 줄 안에 흔하다). 기호를 제 칸(.hm)에 두고 나머지
   글(.ht)이 남는 폭을 차지해, 줄이 넘어가면 기호 뒤 글 시작 자리에 맞춰 내려온다. */
const LEAD_RE = /^([→⇒⟶⟹⇨▶▷►▸▹◦‣※☞☛➔➜➞➤➡✦✧∴∵]+)\s*(.+)$/s;
function leafHTML(raw){
  const m = String(raw ?? '').match(LEAD_RE);
  if (!m) return inlineText(raw);
  return `<span class="hang"><span class="hm">${esc(m[1])}</span><span class="ht">${inlineText(m[2])}</span></span>`;
}

/* 유튜브 주소에서 영상 id와 시작 시각(초)을 읽는다. watch?v=, youtu.be/, embed/, shorts/ 넷 다 받는다.
   시작 시각은 t=90, t=90s, t=1m30s, t=1h2m3s 모양을 초로 바꾼다. */
export function youTube(url){
  const u = String(url ?? '');
  const m = u.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  if (!m) return null;
  let start = 0;
  const t = u.match(/[?&#](?:t|start)=([0-9hms]+)/i);
  if (t){
    const raw = t[1].toLowerCase();
    if (/^\d+s?$/.test(raw)) start = parseInt(raw, 10) || 0;
    else {
      const h = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
      if (h) start = (+(h[1] || 0)) * 3600 + (+(h[2] || 0)) * 60 + (+(h[3] || 0));
    }
  }
  return { id: m[1], start };
}

/* 초성형: 물음 글 안의 초성(ㅁㅇㅅㅎ 같은 자음 둘 이상 연속)을 그 자리에서 찾는다(선생님 지시 2026-10-31:
   초성은 질문 글 안에 그대로 적고, 답이 바로 그 자리를 덮는다. 끝 괄호로 떼지 않는다).
   자음(ㄱ~ㅎ, U+3131~U+314E)이 둘 이상 이어진 첫 자리를 초성으로 본다. 찾으면 { before, hint, after },
   없으면 null(그땐 단답형처럼 오른쪽에 답 알약). */
const CHOSUNG_RUN = /[ㄱ-ㅎ]{2,}/;
export function splitChosung(q){
  const s = String(q ?? '');
  const m = s.match(CHOSUNG_RUN);
  if (!m) return null;
  return { before: s.slice(0, m.index), hint: m[0], after: s.slice(m.index + m[0].length) };
}

/* ── 덱을 쪽 배열로 편다 ──────────────────────────────────────────────────
   쪽 하나 = { type, step, 그 종류가 쓰는 칸들 }. step은 축 단계 key라 쪽마다
   어느 단계에서 나온 쪽인지 알 수 있다(위쪽 단계 이름표와 어드민 미리보기가 쓴다).

   내용이 빈 단계는 쪽을 만들지 않는다. 그래서 동기 유발을 안 쓰는 차시는 그 단계가
   슬라이드에서 그냥 빠진다. 끄는 스위치를 따로 두지 않는 까닭이다.

   no는 강 번호(그 강의실에서 몇 번째로 연결했는가)다. 강의 본체에는 차수가 없고
   강의실마다 다를 수 있어서 부르는 쪽이 넘겨 준다(index.js의 카드가 아는 값이다). */
export function buildSlides(lesson, no){
  if (!lesson) return [];
  const deck = normalizeDeck(lesson) || {};
  const out = [];
  const push = (step, slide) => out.push(Object.assign({ step }, slide));
  const lines = key => (deck[key]?.items || []).map(t => String(t ?? '').trim()).filter(Boolean);

  SLIDE_AXIS.forEach(ax => {
    if (ax.key === 'cover'){
      push('cover', { type:'cover', no, num:lesson.num || '', title:lesson.title || '',
        topic:deck.cover?.topic || '', unit:deck.cover?.unit || '', pages:deck.cover?.pages || '' });

    } else if (ax.key === 'review'){
      /* 페이지 나누기 마커(model.js의 deckAddReviewBreak)로 쪽을 가른다. 마커마다 새 쪽이 서고,
         번호는 쪽을 넘어 이어진다(startNum). 마커뿐이거나 비어 있는 쪽은 만들지 않는다. */
      const pages = [[]];
      (deck.review?.items || []).forEach(it => {
        if (it && it.pagebreak){ pages.push([]); return; }
        if (String(it?.q || '').trim()) pages[pages.length - 1].push(it);
      });
      let startNum = 0;
      pages.forEach(items => {
        if (!items.length) return;
        push('review', { type:'qa', items, startNum });
        startNum += items.length;
      });

    } else if (ax.key === 'objective'){
      const items = lines('objective');
      if (items.length) push('objective', { type:'numbered', items });

    } else if (ax.key === 'hook'){
      // 사진, 영상, 글은 한 쪽에 하나다: 교실 화면에 띄우는 것이라 크게 봐야 한다.
      // 글(선생님 지시 2026-11-01)은 사료와 같은 세리프 양쪽정렬이되 따옴표가 없다
      (deck.hook?.items || []).forEach(it => {
        if (it?.kind === 'text'){
          const t = String(it.text || '').trim();
          // 정렬은 어드민에서 고른다(양쪽이 기본, 가운데 선택 가능. 선생님 지시 2026-11-01)
          if (t) push('hook', { type:'preview', kind:'text', text:t, align:it.align === 'center' ? 'center' : 'justify' });
        } else if (String(it?.url || '').trim())
          push('hook', { type:'preview', kind:it.kind === 'video' ? 'video' : 'image',
            url:it.url, caption:it.caption || '' });
      });

    } else if (ax.key === 'concept'){
      // 개념 노트는 parts.concept.content를 쓴다. 페이지 하나가 쪽 하나다
      pageSlides(lesson.parts?.concept?.content, '').forEach(s => push('concept', s));

    } else if (ax.key === 'mission'){
      /* 미션 활동 페이지는 덱이 들고 있다. 페이지 제목을 비우면 미션 이름(parts.mission의 제목)이
         선다: 같은 이름을 두 군데 적지 않게. 페이지가 하나도 없어도 미션 이름이 있으면 쪽 하나가 선다
         (페이지 모양이 되기 전에도 그랬다). 이 기준은 model.js의 deckStepFilled와 같아야 한다. */
      const name = String(lesson.parts?.mission?.title || '').trim();
      const pages = pageSlides(deck.mission?.content, name);
      if (!pages.length && name) pages.push({ type:'page', title:name, rows:[] });
      pages.forEach(s => push('mission', s));

    } else if (ax.key === 'question'){
      const q = String(lesson.parts?.question?.question || '').trim();
      // no(강 번호)를 같이 넘긴다: 오늘의 질문 배지 옆에 강 번호를 띄운다(선생님 지시 2026-11-01)
      if (q) push('question', { type:'question', no, question:q,
        guide:String(lesson.parts?.question?.guide || '').trim() });

    } else if (ax.key === 'closing'){
      // 맺음말: 'NEXT CLASS'(슬라이드에 고정) + 다음 학습 주제. 주제가 있어야 쪽이 선다
      const nextTopic = String(deck.closing?.nextTopic || '').trim();
      if (nextTopic) push('closing', { type:'closing', nextTopic });
    }
  });
  return out;
}

/* 개념 노트와 미션 활동의 페이지를 쪽으로 편다(페이지 모양은 shared/slide-axis.js의 toPages).
   빈 줄은 떨어뜨리고, 줄도 제목도 없는 페이지는 쪽을 만들지 않는다.
   제목은 있는데 줄이 없는 페이지는 선다(제목만 세운 쪽을 일부러 두는 경우가 있다).
   fallback은 페이지 제목이 비었을 때 대신 쓸 제목이다(미션 이름). */
const splitLines = text => String(text || '').split('\n').map(t => t.trim()).filter(Boolean);
function pageSlides(content, fallback){
  return toPages(content).map(p => {
    // 제목의 단계 이름 머리("개념 노트 #1 : ")는 떼고 그린다(배지가 이미 말한다. slide-axis.js의 stripStepPrefix)
    const t = stripStepPrefix(p.title) || stripStepPrefix(fallback);
    const src = t.match(SOURCE_RE);
    return {
      type: 'page',
      kind: src ? 'source' : 'notes',
      title: src ? t.slice(src[0].length).trim() : t,
      // 비교 묶음은 왼쪽과 오른쪽이 각각 라벨과 내용 줄을 든다. 빈 묶음을 떨어뜨리는 기준은 rowFilled다
      // (model.js의 deckStepFilled와 같은 기준: 한쪽만 고치면 "채웠다는데 쪽이 없다"가 된다)
      // 묶음 유형(rowKind)은 그대로 들고 간다: 사료 인용 묶음은 그릴 때 모양이 다르다(요구사항 139)
      rows: p.rows.filter(rowFilled).map(r => rowKind(r) === 'compare'
        ? { kind: 'compare',
            left:  { label: r.left.label.trim(),  lines: splitLines(r.left.text) },
            right: { label: r.right.label.trim(), lines: splitLines(r.right.text) } }
        : { kind: rowKind(r), label: String(r.label || '').trim(), lines: splitLines(r.text) }),
    };
  }).filter(p => p.rows.length || p.title);
}

/* 사료 쪽 (선생님 지시 2026-10-30: "사료 : 이황의 사액 서원 건의 되어 있으면 제목 내용만 중앙정렬로
   위에 띄운 다음 내용이 나오면 되고, 사료나 글자료 같은 건 세리프체로 하고 좌측 상단 우측 하단에
   연하게 큰따옴표 박아줘. 그리고 출전은 무조건 우측 하단. 그리고 내용은 양쪽 정렬")
   페이지 제목이 "사료", "글자료", "읽기 자료"로 시작하면(뒤에 번호가 붙어도) 사료 쪽이다.
   그 머리는 쪽에 내지 않고 뒤의 제목만 가운데 위에 세운다. 저장된 제목은 머리를 그대로 들고 있다
   (그래야 사료 쪽인 줄 안다).
   출전: 사료의 마지막 줄이 『퇴계집』처럼 책 이름 괄호에 싸였거나 "출처"로 시작하거나 줄표로
   시작하는 짧은 줄이면 출전으로 보고 본문에서 떼어 오른쪽 아래에 둔다. */
// SOURCE_RE는 shared/slide-axis.js에 있다(활동지 변환과 같은 기준을 써야 해서 옮겼다)
const CITE_RE = /^(?:[『「《〈<(\[].{0,30}[』」》〉>)\]]|출처\s*[:：]?.{0,40}|[-–]\s*\S.{0,30})$/;

// 축 단계 이름(쪽 맨 위 배지). 표지에는 달지 않는다
const stepName = key => (SLIDE_AXIS.find(a => a.key === key) || {}).name || '';
/* 슬라이드 배지 이름. 미션 활동은 교실 화면 배지에 'H.C.A'(History Creative Activity)로 띄운다
   (선생님 지시 2026-11-01). 어드민 메뉴 이름은 '미션 활동' 그대로다(이름 통일 규칙은 슬라이드 배지 밖). */
const badgeName = key => key === 'mission' ? 'H.C.A' : stepName(key);

/* 항목 글 "설립 : 16C 이후 ..." 를 소제목(설립)과 내용으로 가른다(선생님 지시 2026-10-30:
   "1. 설립 : ~ 이렇게 되어 있으면 굵은 글씨로 설립 하고 그 내용 사이에 여백을 만들어줘.
    줄바꿈이 되는 경우에는 내어쓰기 해야 해.")
   쌍점은 지우고 그 자리를 여백으로 둔다(2026 슬라이드도 소제목 뒤 쌍점을 지웠다).
   내용 칸이 따로 서서 줄이 넘어가면 내용 시작 자리에 맞춰 내려온다(내어쓰기).
   잘못 가르지 않게 셋을 본다: 쌍점 뒤에 빈칸이 있고, 앞부분이 15자 이하이고,
   앞부분 안에서 빈칸 문법 {}의 괄호가 맞아야 한다("3:1" 같은 비율이나 긴 문장 속 쌍점은 그대로 둔다). */
const TERM_RE = /^(.{1,15}?)\s*:\s+(.+)$/;
const termOf = body => {
  const m = body.match(TERM_RE);
  return m && (m[1].match(/\{/g) || []).length === (m[1].match(/\}/g) || []).length
    ? { term: m[1].trim(), text: m[2] } : null;
};

/* 내용 줄을 나무 모양으로 묶는다(선생님 지시 2026-10-30).
   항목 하나 = { lv, mark, body, cont:[이어지는 줄], kids:[한 수준 낮은 항목] }.
     기호 있는 줄  바로 위에 저보다 높은 수준(숫자가 작은) 항목이 있으면 그 항목의 kids로 들어간다.
                   1. 밑의 - 줄, - 밑의 · 줄이 그렇다.
     기호 없는 줄  가장 최근 항목의 cont로 들어간다. 활동지에서 한글로 일부러 줄을 바꾼 줄이라
                   ("→ 사림이 동인과 서인으로 나뉨") 위 항목과 한 내용이다. */
function lineTree(lines){
  const root = { lv: 0, kids: [] }, stack = [root];
  let last = null;
  lines.forEach(t => {
    const L = lineLevel(t);
    if (!L.lv && last){ last.cont.push(L.body); return; }
    const it = { ...L, cont: [], kids: [] };
    if (it.lv) while (stack.length > 1 && stack[stack.length - 1].lv >= it.lv) stack.pop();
    stack[stack.length - 1].kids.push(it);
    if (it.lv) stack.push(it);
    last = it;
  });
  return root.kids;
}

/* 항목 하나를 그린다. 항목 글 = 소제목(.pk, 굵게) + 내용 칸(.pv).
   내용 칸 안에 이어지는 줄(.pc)과 한 수준 낮은 항목들이 차례로 들어간다. 그래서 그 줄들은 모두
   소제목 뒤 내용 시작선에 맞춰 선다(줄이 넘어가도 그 선으로 내려온다. 내어쓰기).

   소제목이 되는 것 둘(선생님 지시 2026-10-30):
     "1. 설립 : 내용"        쌍점 앞(설립)이 소제목, 뒤가 내용
     "1. 서적 편찬" + 밑줄   쌍점 뒤 내용이 없고 그 밑에 이어지는 줄이나 한 수준 낮은 항목이 오면
                             그 글(서적 편찬) 자체가 소제목이고 밑의 줄들이 내용이다
   dropNum: 1단계 번호(1. 2.)를 떼고 그린다(선생님 지시: "1. 설립 : 이렇게 있으면 1. 이런 말머리는
   떼고 보여줘"). 개념 노트만이다. 미션 활동의 1. 2.는 활동 순서라 남긴다. */
function itemHTML(it, dropNum){
  // -(2단계), ·(3단계) 레벨은 쌍점을 떼지 않고 입력 그대로 평문으로 둔다(선생님 지시 2026-11-01:
  // "-나 가운뎃점에서는 :을 살려줘"). 소제목 가르기(굵게+여백)는 1. 번호 레벨에서만 한다.
  const keepColon = it.lv >= 2;
  // 이어지는 줄도 "『소학』: 내용"처럼 제 소제목이 있으면 그 안에서 다시 가른다(단, -·레벨은 그대로)
  const contHTML = c => { const t = keepColon ? null : termOf(c);
    return t ? `<span class="pt"><span class="pk">${inlineText(t.term)}</span><span class="pv">${inlineText(t.text)}</span></span>`
      : leafHTML(c); };
  // 이어지는 줄(.pc)은 내용칸(.pv) 안에 남겨 내어쓰기를 살리고, 한 수준 낮은 항목(kids)은 .pv 밖으로
  // 빼 .pkids 블록으로 내린다. 그래야 자식 기호가 부모 내용 시작선이 아니라 소제목 시작선 아래로 온다(안 A).
  const contPart = it.cont.map(c => `<span class="pc">${contHTML(c)}</span>`).join('');
  const kidsPart = it.kids.map(k => itemHTML(k, dropNum)).join('');
  const kids = kidsPart ? `<span class="pkids">${kidsPart}</span>` : '';
  const t = keepColon ? null : termOf(it.body);
  const heading = !keepColon && !t && (it.cont.length || it.kids.length) && it.body.length <= 15;
  /* heading: 쌍점 없는 소제목("1. 서적 편찬")에 한 수준 낮은 항목이 달린 것. 소제목을 제 줄에 세우고
     하위 항목은 그 아래로 내린다(pt-head). 쌍점이 있는 묶음("설립 : 내용")만 소제목과 내용이 한 줄이다. */
  const pt = t
    ? `<span class="pk">${inlineText(t.term)}</span><span class="pv">${leafHTML(t.text)}${contPart}</span>${kids}`
    : heading
      ? `<span class="pk pk-head">${inlineText(it.body)}</span>${contPart ? `<span class="pv pv-head">${contPart}</span>` : ''}${kids}`
      : `<span class="pv">${leafHTML(it.body)}${contPart}</span>${kids}`;
  const mark = it.lv && !(dropNum && it.lv === 1);
  // 번호를 뗀 lv1(.nomark)은 자식을 한 글자 들여 대시가 소제목 2번째 글자 아래로 오게 한다(slide-deck.css).
  return `<div class="pl lv${it.lv}${mark ? '' : ' nomark'}">${mark ? `<span class="pm">${esc(it.mark)}</span>` : ''}<span class="pt${heading ? ' pt-head' : ''}">${pt}</span></div>`;
}

/* 내용 줄을 그린다. 단계는 줄 앞 기호가 정한다(1. 1단계, - 2단계, · 3단계. slide-axis.js의 lineLevel).
   "수준이 떨어질 수록 들여쓰기"는 나무 모양이 맡는다: 낮은 수준 항목이 위 항목의 내용 칸 안에 서므로
   위 항목 글 시작선만큼 저절로 들어간다.

   기호 없는 줄이 들여쓰기가 안 돼 보이던 까닭(선생님이 붕당의 형성 쪽에서 찾으셨다, 2026-10-30):
   그 줄을 따로 한 줄로 그려서 위 항목의 소제목 자리에 섰다. 위 항목의 내용 시작선은 소제목 폭에 따라
   위 줄 안에서만 정해지므로 따로 선 줄은 그 선을 알 수 없었다. 이제 위 항목의 내용 칸 안에 들어간다. */
function linesHTML(lines, dropNum = false){
  return lineTree(lines).map(it => itemHTML(it, dropNum)).join('');
}

/* ── 쪽 하나를 HTML로 ────────────────────────────────────────────────────
   돌려주는 것은 #page 안에 들어갈 속이다. 바깥 16:9 틀과 색은 slide-deck.css가 잡는다. */
export function renderSlide(s){
  if (!s) return '';
  /* 쪽 맨 위 배지(선생님 지시 2026-10-30: "2026 사용한 슬라이드에서는 최상단부에 배지가 있었음.
     그 배지로 전시학습 확인, 학습 목표, 개념노트 이런걸 설명했었음. 그거 살릴 것.")
     2026의 배지(개념 Check, 미션 Check)처럼 쪽이 축의 어느 단계인지 알린다. 글자는 축 단계 이름이다.
     2027 화면 규칙에 맞춰 알약 모양과 테두리 없이 연한 레드 바탕만 깐다(배지 규칙).
     페이지 제목이 있는 쪽(개념 노트, 미션 활동)은 배지 옆에 제목이 같은 줄로 선다. */
  const top = title => s.type === 'cover' ? ''
    : `<div class="s-top"><span class="s-badge">${esc(badgeName(s.step))}</span>${
        title ? `<h2 class="s-head">${inlineText(title)}</h2>` : ''}</div>`;
  const mark = top('');

  if (s.type === 'cover'){
    /* 표지: 2026 LMS의 무빙 포스터를 가져왔다(선생님 지시 2026-10-31: 색 빼고 디자인 차용).
       다크 바탕에 빛이 쓸고 지나가고, 강 번호는 오른쪽 위, 학습 주제가 태그라인, 강의 제목이 크게,
       단원과 쪽수가 맨 아래. 색은 HOCLASS 테마(레드 강조)를 쓴다. */
    const no = s.num ? lessonBadge(s.num)
      : (s.no != null && String(s.no).trim() !== '' ? `${esc(s.no)}강` : '');
    const meta = [s.unit, s.pages && `교과서 ${s.pages}`].filter(Boolean).map(esc);
    // 학습 주제는 제목과 다를 때만 태그라인으로(강의 이름을 주제로 지으면 겹쳐 보이지 않게)
    const tagline = s.topic && s.topic !== s.title ? s.topic : '';
    return `<div class="s-cover">
      <div class="intro-sweep"></div>
      ${no ? `<div class="cover-num">${esc(no)}</div>` : ''}
      <div class="cover-fg">
        ${tagline ? `<div class="cover-tagline">${esc(tagline)}</div>` : ''}
        <h1 class="cover-title">${esc(s.title)}</h1>
        ${meta.length ? `<div class="cover-meta">${meta.join('<span class="cover-sep"></span>')}</div>` : ''}
      </div>
    </div>`;
  }

  /* 전시학습확인: 학습 목표와 같은 다크 톤(선생님 지시 2026-10-31: "톤을 학습목표랑 같이 맞춰줘").
     쪽 전체를 덮는 자립 블록(.s-qa)이라 배지("지난 시간에는?")와 그 옆 제목("지난 시간 복습하기")도
     그 안에서 다크로 선다(선생님 지시 2026-10-31: 배지 옆에 제목). 글배치: 번호 + 물음은 한 줄 왼쪽, 답은 오른쪽.
       진위형 : O와 X 두 칸이 오른쪽에 서 있고, 답이 나올 때 정답 쪽이 켜진다
       단답형 : 답 알약이 오른쪽에 나온다(눌러야 보인다)
       초성형 : 물음 글 안의 초성(ㅁㅇㅅㅎ) 자리를 답이 덮는다(splitChosung). 오른쪽 별도 답은 없다
     유형 이름표(단답형/진위형/초성형)는 교실 화면에 띄우지 않는다. 번호는 쪽을 나눠도 이어진다(startNum). */
  if (s.type === 'qa'){
    const base = s.startNum || 0;
    return `<div class="s-qa">
      <div class="intro-sweep"></div>
      <div class="qa-top"><span class="qa-badge">REVIEW</span><h2 class="qa-title">지난 시간 복습하기</h2></div>
      <div class="qa-list">${s.items.map((it, i) => {
        const ans = String(it.a || '').trim();
        let qHtml = inlineText(it.q), slot = '';
        if (it.type === 'ox'){
          const on = ans.toUpperCase();
          slot = `<div class="qa-ox" ${on === 'O' || on === 'X' ? 'data-step' : ''}>${['O','X'].map(v =>
            `<span class="qa-oxb ${on === v ? 'is' : ''}">${v}</span>`).join('')}</div>`;
        } else if (it.type === 'initial'){
          // 초성을 물음 글 안에서 찾아 그 자리를 답이 덮게 한다(오른쪽 별도 답 없음).
          // 초성을 못 찾으면 단답형처럼 오른쪽 알약으로 답을 보인다.
          const sp = ans ? splitChosung(it.q) : null;
          if (sp) qHtml = inlineText(sp.before)
            + `<span class="qa-ini"><span class="qa-ini-hint">${esc(sp.hint)}</span>`
            + `<span class="qa-ini-ans" data-step>${inlineText(ans)}</span></span>`
            + inlineText(sp.after);
          else if (ans) slot = `<div class="qa-a" data-step>${inlineText(ans)}</div>`;
        } else if (ans){
          slot = `<div class="qa-a" data-step>${inlineText(ans)}</div>`;
        }
        return `<div class="qa">
          <span class="qa-n">${base + i + 1}</span>
          <span class="qa-txt">${qHtml}</span>
          ${slot ? `<div class="qa-slot">${slot}</div>` : ''}</div>`;
      }).join('')}</div>
    </div>`;
  }

  /* 학습 목표: 2026 LMS의 다크 빅넘버 스택(선생님 지시 2026-10-31). 표지와 같은 다크 인트로 톤.
     큰 레드 숫자 + 항목, 항목 사이는 얇은 구분선. 쪽 전체를 덮는 자립 블록이라(.s-objectives)
     배지도 그 안에서 다크로 선다(표지와 같은 까닭). */
  if (s.type === 'numbered')
    return `<div class="s-objectives">
      <div class="intro-sweep"></div>
      <div class="obj-badge">${esc(stepName(s.step))}</div>
      <div class="obj-list">${s.items.map((t, i) => `
        <div class="obj-item"><span class="obj-num">${i + 1}</span>
          <span class="obj-text">${inlineText(t)}</span></div>`).join('')}</div>
    </div>`;

  /* 동기 유발(사진, 영상): 표지·학습목표·전시학습확인과 같은 다크 톤의 자립 블록이다
     (선생님 지시 2026-10-31: 다크로, 레터박스까지, 배지는 없앤다). 배지 없이 사진/영상만 크게 띄운다. */
  if (s.type === 'preview'){
    /* 글(선생님 지시 2026-11-01): 사료 인용과 같은 세리프 양쪽정렬이되 따옴표는 없다.
       배경은 사진/영상 동기 유발과 같은 다크 톤으로 통일한다. 줄 하나가 한 문단이다. */
    if (s.kind === 'text'){
      const lines = String(s.text).split('\n').map(t => t.trim()).filter(Boolean);
      return `<div class="s-preview s-preview-text">
        <div class="intro-sweep"></div>
        <div class="pv-text${s.align === 'center' ? ' pv-center' : ''}">${lines.map(t => `<p>${inlineText(t)}</p>`).join('')}</div></div>`;
    }
    const yt = s.kind === 'video' ? youTube(s.url) : null;
    const frame = yt
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${esc(yt.id)}?rel=0${yt.start ? '&start=' + yt.start : ''}"
           title="영상" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
           allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
      : `<img src="${esc(s.url)}" alt="${esc(s.caption || '')}" loading="lazy">`;
    return `<div class="s-preview">
      <div class="intro-sweep"></div>
      <div class="pvframe ${s.kind === 'video' ? 'vid' : 'img'}">${frame}</div>
      ${s.caption ? `<div class="pvcap">${inlineText(s.caption)}</div>` : ''}</div>`;
  }

  /* 개념 노트, 미션 활동의 페이지. 묶음마다 라벨이 위에, 내용 줄이 그 아래에 선다
     (선생님 지시 2026-10-30: "행라벨은 상단 왼쪽 정렬로 위치해주고 그 아래 빨간색 구분선을 넣어줘.
      구분선 길이는 행라벨 글씨까지만"). 라벨이 없는 묶음은 내용 줄만 선다.
     사료 쪽(kind 'source')은 모양이 다르다: 배지만 맨 위에 두고, 제목은 가운데 위, 본문은 세리프체에
     양쪽 정렬, 왼쪽 위와 오른쪽 아래에 연한 큰따옴표, 출전은 오른쪽 아래(pageSlides 위 주석). */
  /* 사료 본문: 큰따옴표를 깐 글 상자와 오른쪽 아래 출전. 사료 쪽(쪽 하나가 통째로 사료)과
     사료 인용 묶음(쪽 안의 묶음 하나. 요구사항 139)이 같이 쓴다. 두 군데서 모양이 어긋나지 않게
     한 곳에 둔다(출전을 떼는 규칙도 하나다). */
  const srcBody = lines => {
    const ls = lines.slice();
    const cite = ls.length > 1 && CITE_RE.test(ls[ls.length - 1]) ? ls.pop() : '';
    return `<div class="src-quote">${ls.map(t => `<p>${inlineText(t)}</p>`).join('')}</div>`
      + (cite ? `<div class="src-cite">${inlineText(cite)}</div>` : '');
  };
  if (s.type === 'page' && s.kind === 'source'){
    // 사료 쪽에 비교 묶음을 손으로 넣었으면 왼쪽, 오른쪽 차례로 본문에 편다(사료는 한 덩어리 글이다)
    const lines = s.rows.flatMap(r => r.kind === 'compare' ? [...r.left.lines, ...r.right.lines] : r.lines);
    return `${top('')}<div class="s-body s-src">
      ${s.title ? `<h2 class="src-title">${inlineText(s.title)}</h2>` : ''}
      ${srcBody(lines)}</div>`;
  }
  /* 좌우 비교 묶음(요구사항 137). 2026 LMS의 비교표를 가져왔다(선생님 지시 2026-10-31, 색만 HOCLASS로):
     두 칸이 카드로 나란히 서고, 칸마다 머리(라벨)가 색 띠로, 내용이 그 아래 흰 칸에 선다. VS는 뺐다.
     내용은 보통 묶음과 같은 줄 그리기(linesHTML)라 1. - · 단계, 소제목, 빈칸이 똑같이 그려진다. */
  const compareHTML = (r, dropNum) => {
    const col = c => `<div class="cmp-col">
      ${c.label ? `<div class="cmp-head">${inlineText(c.label)}</div>` : ''}
      <div class="cmp-body">${linesHTML(c.lines, dropNum)}</div></div>`;
    return `<div class="prow pcmp">${col(r.left)}${col(r.right)}</div>`;
  };
  /* 사료 인용 묶음(요구사항 139): 쪽 하나가 통째로 사료인 사료 쪽과 달리 쪽 안의 묶음 하나다.
     제목은 묶음 라벨 자리에 그대로 서고(.plabel, 레드 밑줄) 본문만 사료 모양이다. 그래서
     같은 쪽에 보통 묶음과 나란히 서도 줄이 맞는다. */
  if (s.type === 'page')
    return `${top(s.title)}<div class="s-body s-page">${s.rows.map(r => {
      if (r.kind === 'compare') return compareHTML(r, s.step === 'concept');
      const label = r.label ? `<div class="plabel">${inlineText(r.label)}</div>` : '';
      if (r.kind === 'source') return `<div class="prow psrc">${label}${srcBody(r.lines)}</div>`;
      return `<div class="prow">${label}
        <div class="plines">${linesHTML(r.lines, s.step === 'concept')}</div></div>`;
    }).join('')}</div>`;

  if (s.type === 'question'){
    // 배지 '오늘의 질문' 옆에 강 번호를 늘 띄운다(선생님 지시 2026-11-01: "29강이면 29강").
    // lessonBadge가 "29강" 또는 "[OT]"를 만든다. 강 번호가 없으면(연결 전 강의) 제목 없이 배지만.
    const noBadge = s.no != null && String(s.no).trim() !== '' ? lessonBadge(s.no) : '';
    return `${top(noBadge)}<div class="s-body s-q">
      <div class="qbig">${inlineText(s.question)}</div>
      ${s.guide ? `<div class="qguide">${inlineText(s.guide)}</div>` : ''}</div>`;
  }

  /* 맺음말: 표지·학습목표처럼 다크 자립 블록, 배지 없음(선생님 지시 2026-10-31).
     'NEXT CLASS'는 필기체로 고정, 그 아래에 다음 학습 주제(어드민에서 고친 nextTopic)가 선다. */
  if (s.type === 'closing')
    return `<div class="s-close">
      <div class="intro-sweep"></div>
      <div class="close-fg">
        <div class="close-next">NEXT CLASS</div>
        <div class="close-topic">${inlineText(s.nextTopic)}</div>
      </div>
    </div>`;

  return mark;
}

/* ── 쪽 안의 단계(슬라이드 애니메이션) ──
   전시학습확인의 답처럼 나중에 나올 것에 data-step을 달아 둔다. 넘기기(오른쪽 화살표, PageDown,
   다음 단추)를 누르면 쪽을 넘기기 전에 아직 안 나온 것을 위에서부터 하나 꺼낸다(stepForward).
   되돌리기(왼쪽 화살표, PageUp, 이전 단추)는 마지막에 꺼낸 것부터 하나씩 도로 넣는다(stepBack).
   둘 다 할 일이 없으면 false를 돌려주고, 그때 부르는 쪽이 쪽을 넘긴다.
   뒤로 넘겨 이 쪽에 다시 들어오면 다 나온 모양으로 선다(showAllSteps). 발표 프로그램과 같은 순서다. */
export function stepForward(root){
  const el = root?.querySelector('[data-step]:not(.shown)');
  if (!el) return false;
  el.classList.remove('instant'); el.classList.add('shown');
  return true;
}
export function stepBack(root){
  const shown = root?.querySelectorAll('[data-step].shown') || [];
  if (!shown.length) return false;
  const el = shown[shown.length - 1];
  el.classList.remove('instant'); el.classList.remove('shown');
  return true;
}
export function stepsLeft(root){ return !!root?.querySelector('[data-step]:not(.shown)'); }
// 움직임 없이 한꺼번에(instant): 뒤로 들어왔을 때 답이 하나씩 날아드는 것을 다시 보이지 않게
export function showAllSteps(root){
  root?.querySelectorAll('[data-step]').forEach(el => el.classList.add('shown', 'instant'));
}
