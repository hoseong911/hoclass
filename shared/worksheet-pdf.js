/* ══ 활동지 PDF를 개념 노트와 미션 활동 페이지로 바꾸기 (선생님 지시 2026-10-30) ══════
 *
 * "활동지를 pdf로 올려서 편집하는데 pdf를 md로 바꿔서 인식하는건지?
 *  토큰이 안드는 방향으로 변환해서 내용 인식해줄 것."
 *
 * 그래서 AI(Claude)를 거치지 않는다. 브라우저 안에서 PDF.js(파이어폭스가 PDF를 띄울 때
 * 쓰는 무료 도구)로 PDF 안에 든 글자만 꺼내고, 줄을 나누고 단계를 가리는 것은 아래 규칙이
 * 한다. 사용료가 나가지 않고 파일이 어디로도 나가지 않는다.
 *
 * 한계 둘
 *   하나, 글자만 꺼내므로 표 칸, 상자, 음영, 그림은 사라진다.
 *   둘,   스캔한 PDF(종이를 사진으로 찍은 것)는 안에 글자가 없어 꺼낼 것이 없다.
 *         한글에서 바로 PDF로 저장한 활동지는 된다.
 *
 * 나누는 규칙 (활동지 모양에 맞춘 어림이다. 틀린 곳은 편집기에서 고친다)
 *   - 페이지 제목: 괄호로 감싼 줄("[ 개념 노트 #1 : ... ]", "< 사료 : ... >") 또는 본문보다
 *           글자가 뚜렷하게 큰 줄(1.15배 이상). 거기서 새 페이지다. 선생님 활동지는 괄호 쪽이다.
 *   - 묶음: 내용이 "1."로 시작하는 줄에서 새 묶음이다(활동지 표는 칸마다 1.부터 다시 센다).
 *   - 라벨: 표의 왼쪽 칸. 내용 칸보다 뚜렷하게 왼쪽에 선 짧은 조각이다(자리로 가린다).
 *           여러 줄로 쪼개져 내용 줄 사이에 끼어 있으면("유교" "윤리의" "보급") 이어 붙인다.
 *   - 사료: 제목이 사료로 시작하면 쪽 하나를 따로 차지한다. 그 뒤에 다시 "1." 줄이 오면
 *           표로 돌아온 것이라 본문 쪽을 같은 제목으로 다시 연다.
 *   - 단계: 줄 앞 기호가 "1."이면 1단계, "-"이면 2단계, "·"이면 3단계(slide-axis.js의 lineLevel).
 *           단계는 줄 글자에 기호가 그대로 남아 있어서 따로 적어 두지 않는다.
 *   - 미션: 제목에 "미션"이 든 페이지부터는 미션 활동 쪽으로 간다.
 *   - 제목의 단계 이름 머리("개념 노트 #1 : ")는 떼고 가져온다(slide-axis.js의 stripStepPrefix).
 *   - 개념/미션에 넣지 않는 것: 머리 줄(강의 제목, 반 번호 이름 칸), 질문·생각 Check 쪽,
 *           학습 목표 쪽, 내용 줄이 없는 페이지. 이 가운데 머리의 단원/주제/쪽수와 학습 목표,
 *           생각 Check의 질문은 표지·학습목표·오늘의 질문 단계로 따로 뽑는다(fillMetaPdf, fillQuestionPdf).
 *
 * 이 파일은 Firebase도 화면도 모른다. 노드에서도 같은 함수로 시험한다(pdfjs를 넘겨준다).
 */
import { lineLevel, SOURCE_RE } from './slide-axis.js?v=20261101a';
import { SHORT, JUNK_RE, unwrapTitle, makeCollector, tidyPages,
  UNIT_RE, TOPIC_RE, OBJ_RE, PAGE_RE, LECNO_RE, QUESTION_RE } from './worksheet.js?v=20261031e';

// 브라우저는 CDN에서 PDF.js를 불러온다. 판 번호를 못박아 둔다(바뀌면 꺼내는 결과가 달라질 수 있다)
const PDFJS_VER = '4.10.38';
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}`;

/* PDF 파일(ArrayBuffer)에서 줄을 꺼낸다.
   돌려주는 줄 하나 = { text, size, segs:[{ text, x }] }.
   segs는 같은 높이에 있지만 멀리 떨어진 조각들이다(표의 왼쪽 칸과 오른쪽 칸 같은 것).
   size는 그 줄에서 가장 많이 쓰인 글자 크기다(페이지 제목을 가릴 때 쓴다).

   한글 PDF는 글꼴 안의 글자 번호를 유니코드로 바꾸는 표(CMap)가 있어야 제대로 나온다.
   그 표를 CDN에서 같이 받게 cMapUrl을 준다. */
export async function pdfLines(data, pdfjs, opts = {}){
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl: opts.cMapUrl ?? `${PDFJS_CDN}/cmaps/`, cMapPacked: true,
    standardFontDataUrl: opts.fontUrl ?? `${PDFJS_CDN}/standard_fonts/`,
    isEvalSupported: false,
  }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++){
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const lines = pageLines(items);
    /* 오른쪽 끝까지 꽉 찬 줄인가(full). 꽉 찬 줄 다음의 기호 없는 줄은 활동지에서 칸이 모자라 저절로
       넘어간 줄이라 한 줄로 다시 잇는다(linesToParts). 꽉 차지 않았는데 다음 줄로 간 것은 한글에서
       일부러 줄을 바꾼 것이라 그대로 둔다(선생님 말씀 2026-10-30: "보기 좋으라고 일부러 줄바꿈을 한거").
       기준은 그 쪽에서 가장 오른쪽까지 간 줄의 끝이다. 글자 두 칸 안쪽이면 꽉 찬 것으로 본다. */
    const maxRight = Math.max(...lines.map(l => l.right));
    lines.forEach(l => { l.full = l.right >= maxRight - l.size * 2; });
    out.push(...lines);
  }
  return out;
}

/* 한 쪽의 글자 조각을 줄로 묶는다.
   PDF 안의 글자는 줄 단위가 아니라 조각 단위로 흩어져 있다. 조각마다 x, y 자리와 크기가 있으니
   y가 거의 같은 조각끼리 한 줄로 모으고 x 순서로 늘어놓는다.
   조각 사이가 글자 한 칸보다 넓게 벌어지면 다른 칸(segs)으로 본다. 낱말 사이 빈칸은 글자 4분의 1 칸
   남짓이고, 표의 칸 사이(라벨 칸 "붕당 형성"과 내용 칸 "1. 사림 집권")는 칸 안쪽 여백 둘이 더해져
   그보다 넓다. 처음에는 두 칸으로 잡았는데, 라벨이 칸을 거의 채우면 틈이 두 칸이 안 돼 라벨이
   내용에 붙었다(2026-10-30). 칸으로 갈려도 글은 빈칸으로 다시 이어 붙이므로 너무 잘게 갈려도
   글이 망가지지는 않는다(갈린 칸은 라벨을 가릴 때만 쓴다). */
function pageLines(items){
  /* 빈칸만 든 조각은 버린다. 한글에서 만든 PDF는 표의 칸과 칸 사이를 빈칸 조각 하나로 메우는데,
     그 조각을 살려 두면 왼쪽 칸(라벨)과 오른쪽 칸(내용)이 한 덩어리로 붙어 버린다.
     낱말 사이의 빈칸은 아래에서 조각 사이 간격을 보고 다시 넣는다. */
  const parts = items
    .filter(it => it.str && it.str.trim() !== '')
    .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5],
      w: it.width, size: Math.round(Math.hypot(it.transform[2], it.transform[3]) * 10) / 10 }))
    .filter(it => it.size > 0);
  // 위에서 아래로(PDF는 y가 아래에서 위로 커진다), 같은 줄 안에서는 왼쪽에서 오른쪽으로
  parts.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows = [];
  parts.forEach(it => {
    const row = rows.find(r => Math.abs(r.y - it.y) <= Math.max(2, it.size * 0.35));
    if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
  });
  rows.sort((a, b) => b.y - a.y);

  return rows.map(r => {
    r.items.sort((a, b) => a.x - b.x);
    const segs = [];
    let cur = null, end = 0;
    r.items.forEach(it => {
      const gap = it.x - end;
      if (!cur || gap > it.size){ cur = { text: '', x: it.x }; segs.push(cur); }
      else if (gap > it.size * 0.2 && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) cur.text += ' ';
      cur.text += it.str;
      end = it.x + it.w;
    });
    segs.forEach(s => { s.text = s.text.replace(/\s+/g, ' ').trim(); });
    const kept = segs.filter(s => s.text);
    // 줄 크기: 글자 수로 무게를 단 최빈값. 큰 글씨 한두 자(번호 동그라미 같은 것)에 끌려가지 않게
    const tally = {};
    r.items.forEach(it => { tally[it.size] = (tally[it.size] || 0) + it.str.length; });
    const size = +Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    return { text: kept.map(s => s.text).join(' '), size, segs: kept, right: end };
  }).filter(l => l.text);
}

/* 군더더기 줄(JUNK_RE), 라벨 길이(SHORT), 묶음 머리 괄호(unwrapTitle)는 한글 파일 길과 같이 쓰므로
   worksheet.js에 있다. 괄호 규칙이 생긴 까닭: 선생님 활동지는 묶음 머리를 큰 글씨가 아니라
   "[ 개념 노트 #1 : ... ]", "< 사료 : ... >" 같은 괄호로 알린다(2026-10-30 29강 활동지에서 확인).
   처음에는 글자 크기만 보고 제목을 가렸는데 머리가 본문과 같은 11pt라 하나도 안 잡혔고,
   활동지 한 장이 통째로 한 페이지 한 묶음이 되어 버렸다. */

/* 저절로 넘어간 줄을 앞 줄에 이을 때 빈칸을 넣는가 (2026-10-30 고침).
   한글은 낱말 가운데서도 줄이 넘어간다("그 효과를 어찌 서" + "원과 같다 하겠습니까").
   늘 빈칸으로 이으면 "서 원과"가 되어 낱말이 깨진다. 거꾸로 낱말이 끝나는 자리에서
   넘어간 것이면 빈칸이 있어야 한다("… 서원" + "교육이 크게" → "서원 교육이").
   줄 끝에서 먹힌 빈칸은 PDF에 남지 않아 둘을 가릴 길이 없다. 그래서 어림을 쓴다:
   **앞 줄의 마지막 낱말이 한 글자뿐이면 낱말이 갈린 것으로 보고 그냥 붙인다.**
   한글 낱말은 보통 두 글자가 넘고, 글자 단위로 넘어갈 때 끝에 한 글자만 남는 일이 잦다.
   29강 활동지의 사료 두 쪽에 있는 여섯 자리가 이 규칙으로 다 맞았다. 틀리면 편집기에서 고친다. */
const HANGUL_RE = /[가-힣]/;
function wrapGlue(prev, next){
  const tail = String(prev).split(/[\s　]+/).pop() || '';
  const head = String(next)[0] || '';
  return (tail.length === 1 && HANGUL_RE.test(tail) && HANGUL_RE.test(head)) ? '' : ' ';
}

/* 꺼낸 줄을 { concept, mission, cover, objective, question }으로 나눈다. concept/mission은
   slide-axis.js의 fromPages가 받는 페이지 배열이고([{ title, rows:[{ label, text }] }]),
   cover/objective/question은 머리 줄과 생각 Check 쪽에서 뽑은 것이다(fillMetaPdf, fillQuestionPdf). */
export function linesToParts(lines){
  const clean = lines.filter(l => !JUNK_RE.test(l.text.trim()));
  if (!clean.length) return { concept: [], mission: [] };

  // 본문 크기: 글자 수로 무게를 단 최빈값. 제목은 이보다 뚜렷하게 크다
  const tally = {};
  clean.forEach(l => { tally[l.size] = (tally[l.size] || 0) + l.text.length; });
  const body = +Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  /* 묶음 머리인가. 둘 중 하나면 머리다: 괄호로 감쌌거나(선생님 활동지가 쓰는 방식),
     본문보다 글자가 뚜렷하게 크거나. 머리면 괄호를 뗀 제목을, 아니면 null을 돌려준다. */
  const titleOf = l => unwrapTitle(l.text)
    ?? (l.size >= body * 1.15 && l.text.length <= 60 ? l.text : null);

  /* 표의 라벨 칸을 자리로 가린다 (2026-10-30 고침).
     활동지 표는 왼쪽이 라벨 칸("서원", "향약", "유교 윤리의 보급"), 오른쪽이 내용 칸이다.
     내용 칸의 왼쪽 끝(contentX)은 단계 기호(1. - ·)로 시작하는 줄들의 왼쪽 자리 최빈값이다.
     그보다 뚜렷하게 왼쪽에 있는 짧은 조각이 라벨이다.
     전에는 "짧은 낱말 다음에 1. 줄이 오면 라벨"이라는 글만 보는 어림이었는데,
     라벨이 "1."이 아닌 줄 옆에 서거나(2. 기능 옆의 "서원") 홀로 서거나(향약) 여러 줄로
     쪼개지면("유교" "윤리의" "보급") 다 놓쳤고, 사료의 출전(『퇴계집』)을 라벨로 잘못 봤다. */
  const xs = {};
  clean.forEach(l => {
    const s = l.segs[0];
    if (s && lineLevel(s.text).lv) xs[Math.round(s.x)] = (xs[Math.round(s.x)] || 0) + 1;
  });
  const hit = Object.entries(xs).sort((a, b) => b[1] - a[1])[0];
  const labelX = hit ? +hit[0] - body * 1.5 : -Infinity;   // 이보다 왼쪽이면 라벨 칸
  const isLabel = s => s.x < labelX && s.text.length <= SHORT && !lineLevel(s.text).lv;

  /* 쪽과 묶음을 모으는 것은 한글 파일 길과 같은 일꾼이다(worksheet.js의 makeCollector).
     첫 머리 위의 활동지 머리 버리기, 질문과 학습 목표 쪽 버리기, 미션 쪽 가르기, 제목 머리 떼기,
     사료 쪽과 되돌아오기가 다 거기 있다. 여기에는 PDF만의 것(자리로 라벨 가리기, 줄 잇기)만 남는다. */
  const col = makeCollector();
  if (!clean.some(l => titleOf(l) !== null)) col.noTitles();

  let prevFull = false;   // 바로 앞에 넣은 줄이 오른쪽 끝까지 꽉 찼는가(pdfLines의 full)
  const newRow = () => { col.newRow(); prevFull = false; };
  const addLine = (t, full) => {
    if (!col.row) newRow();
    // 꽉 찬 줄 다음의 기호 없는 줄은 저절로 넘어간 줄이라 앞 줄에 잇는다(줄바꿈 대신 빈칸이나 그냥 붙이기)
    const prev = col.row.text;
    col.addText(t, prevFull && prev && !lineLevel(t).lv ? wrapGlue(prev, t) : '\n');
    prevFull = !!full;
  };

  clean.forEach(l => {
    const t = titleOf(l);
    if (t !== null){
      /* "사료 : 이황의 사액 서원 건의"는 쪽을 떼지 않고 부모(개념 노트) 쪽에 사료 인용 묶음으로 넣는다:
         쪽 제목은 부모 그대로, 사료 제목이 묶음 라벨이다(선생님 지시 2026-10-30). 뒤따르는 줄은
         아래 일반 경로로 이 사료 묶음에 이어 붙는다(사료 묶음은 kind가 source라 라벨이 오기 전까지 이어진다). */
      const src = SOURCE_RE.exec(t);
      if (src && !col.skipping && col.parentTitle){ col.addSource(t.slice(src[0].length).trim()); prevFull = false; return; }
      col.newPage(t); prevFull = false; return;
    }
    if (col.skipping) return;

    const labels = l.segs.filter(isLabel);
    const text = l.segs.filter(s => !isLabel(s)).map(s => s.text).join(' ');
    const { lv, mark } = lineLevel(text);

    // "1."로 시작하는 줄에서 새 묶음이 시작된다: 활동지 표는 칸마다 1.부터 다시 센다
    if (lv === 1 && mark === '1.') newRow();
    // 라벨은 여러 줄로 쪼개져 내용 줄 사이사이에 끼어 있다("유교" "윤리의" "보급"). 그 묶음의 라벨에 이어 붙인다
    labels.forEach(s => { if (!col.row) newRow(); col.addLabel(s.text); });
    if (text) addLine(text, l.full);
  });

  /* 쪽이 아닌 단계(표지, 학습 목표, 오늘의 질문)도 채운다(선생님 지시 2026-10-30).
     PDF는 표 칸이 사라져 어림이라, 한글 파일(worksheet-hwpx.js)의 표 기반 뽑기보다 성기다.
     머리 줄(첫 괄호 머리 앞)의 조각(segs)을 한글 파일의 칸처럼 라벨 + 값으로 본다. */
  fillMetaPdf(clean, titleOf, col);
  fillQuestionPdf(clean, titleOf, col);

  // 내용 줄이 없는 페이지(제목만 덩그러니 선 것)는 뺀다
  const { concept, mission } = col.pages;
  const { cover, objective, question, num } = col.meta;
  return { concept: tidyPages(concept), mission: tidyPages(mission), cover, objective, question, num };
}

/* 머리 줄에서 표지(학습 단원/주제/교과서 쪽수)와 학습 목표를 뽑는다. 첫 괄호 머리를 만나면 멈춘다.
   학습 목표는 라벨 줄 뒤에 "1." "2." 줄로 이어지므로, 목표 라벨을 본 뒤의 번호 줄을 거둔다. */
function fillMetaPdf(clean, titleOf, col){
  let objMode = false;
  for (const l of clean){
    if (titleOf(l) !== null) return;
    const segs = l.segs.map(s => s.text.trim()).filter(Boolean);
    const label = segs[0] || '';
    const rest = segs.slice(1);
    if (UNIT_RE.test(label)){
      objMode = false;
      rest.flatMap(t => t.split(/\s{2,}/)).map(s => s.trim()).filter(Boolean).forEach(t => {
        if (LECNO_RE.test(t)) col.setNum(t.replace(/\s*강\s*$/, ''));   // "29강" → 번호 29
        else if (PAGE_RE.test(t)) col.setCover({ pages: t });
        else col.setCover({ unit: t });
      });
    } else if (TOPIC_RE.test(label)){
      objMode = false;
      if (rest.length) col.setCover({ topic: rest.join(' ') });
    } else if (OBJ_RE.test(label)){
      objMode = true;
      rest.forEach(t => col.addObjective(t));
    } else if (objMode && lineLevel(l.text).lv === 1){
      col.addObjective(l.text);                 // 목표 라벨 뒤로 이어지는 "1." "2." 줄
    } else {
      objMode = false;
    }
  }
}

/* "[ 생각 Check ]" 쪽을 찾아 첫 문장을 질문, 뒤따르는 문장을 설명문으로 담는다.
   확인란(개념/미션/질문 체크표)과 군더더기 줄은 뺀다. */
function fillQuestionPdf(clean, titleOf, col){
  let active = false;
  const guide = [];
  let question = '';
  for (const l of clean){
    const t = titleOf(l);
    if (t !== null){ if (active) break; active = QUESTION_RE.test(t); continue; }
    if (!active) continue;
    const s = l.text.trim();
    if (!s || JUNK_RE.test(s) || s === '확인란' || /^(개념|미션|질문)$/.test(s)) continue;
    if (!question){ if (s.length > SHORT) question = s; }
    else guide.push(s);
  }
  if (question) col.setQuestion(question, guide.join(' '));
}

// 브라우저에서 PDF.js를 한 번만 불러 둔다
let pdfjsP = null;
function loadPdfjs(){
  if (!pdfjsP) pdfjsP = import(`${PDFJS_CDN}/build/pdf.min.mjs`).then(lib => {
    lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/build/pdf.worker.min.mjs`;
    return lib;
  });
  return pdfjsP;
}

// 어드민이 부르는 길: 고른 파일 하나를 받아 { concept, mission } 페이지 배열을 돌려준다
export async function worksheetFromPdf(file){
  const lib = await loadPdfjs();
  const lines = await pdfLines(await file.arrayBuffer(), lib);
  if (!lines.length) throw new Error('PDF 안에서 글자를 찾지 못했습니다. 스캔한 PDF는 글자를 꺼낼 수 없습니다.');
  return linesToParts(lines);
}
