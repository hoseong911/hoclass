/* ══ 활동지 파일을 개념 노트와 미션 활동 페이지로 바꾸기 (공통 규칙) ══════════
 *
 * "활동지를 pdf로 올려서 편집하는데 pdf를 md로 바꿔서 인식하는건지?
 *  토큰이 안드는 방향으로 변환해서 내용 인식해줄 것." (선생님 지시 2026-10-30)
 *
 * AI를 거치지 않는다. 브라우저 안에서 파일을 열어 글자와 표를 꺼낸다.
 * 사용료가 나가지 않고 파일이 어디로도 나가지 않는다.
 *
 * ── 파일 두 가지 (선생님 지시 2026-10-30, 요구사항 137) ──
 *   .hwpx  한글 파일 그대로. **이쪽이 낫다.** 안에 표 칸과 문단이 그대로 들어 있어서
 *          라벨 칸, 좌우 비교 칸, 줄바꿈을 자리로 어림하지 않고 그대로 읽는다.
 *          2026 lms가 쓰던 길을 가져왔다(선생님 지시: "문자 인식하는건 거기에서 적용한걸 참고해봐").
 *   .pdf   한글이 없을 때를 위한 대비. 글자 자리를 재서 줄과 칸을 어림한다(worksheet-pdf.js).
 *          스캔한 PDF(종이를 사진으로 찍은 것)는 안에 글자가 없어 안 된다.
 * **선생님께는 .hwpx를 먼저 권한다.** 한글에서 "다른 이름으로 저장"하면 바로 나온다.
 *
 * ── 활동지 모양을 읽는 규칙 (두 길이 같이 쓴다) ──
 *   - 쪽 제목: 괄호로 감싼 줄. "[ 개념 노트 #1 : 성리학적 질서의 확산 ]", "< 사료 : ... >".
 *             선생님 활동지는 묶음 머리를 큰 글씨가 아니라 이 괄호로 알린다(2026-10-30 확인).
 *   - 개념/미션 쪽에 넣지 않는 것: 첫 제목 위의 줄(활동지 머리: 학교 이름, 학번 칸),
 *             제목에 "질문"이나 "생각 Check"가 든 쪽, 제목에 "학습 목표"가 든 쪽, 내용이 없는 쪽.
 *   - 다만 전시학습확인, 동기 유발, 맺음말을 뺀 나머지 단계는 다 채운다(선생님 지시 2026-10-30:
 *             "활동지를 올리면 슬라이드 만든 섹션에 다 채워져야 해"). 쪽이 아닌 단계는 meta로 모은다:
 *             머리 표의 학습 단원/학습 주제/교과서 쪽수 → 표지(cover), 학습 목표 → objective,
 *             생각 Check 쪽의 질문과 설명문 → 오늘의 질문(question). 모으는 것은 hwpx/pdf 길이 한다.
 *   - **묶음 하나가 페이지 하나다**(요구사항 139). 활동지 한 쪽에 라벨이 여럿이면 라벨마다
 *             페이지를 따로 만든다(제목은 그 쪽 제목을 그대로 되쓴다). 사료 쪽은 쪼개지 않는다.
 *   - 미션: 제목에 "미션"이 든 쪽부터는 미션 활동 쪽으로 간다.
 *   - 제목의 단계 이름 머리("개념 노트 #1 : ")는 뗀다(slide-axis.js의 stripStepPrefix).
 *             "사료 : "는 떼지 않는다. 그 머리로 사료 쪽인 줄 알기 때문이다(SOURCE_RE).
 */
import { stripStepPrefix, SOURCE_RE, rowFilled } from './slide-axis.js?v=20261101b';

export const SHORT = 10;   // 라벨로 볼 수 있는 가장 긴 글자 수

/* 묶음 머리를 감싼 괄호. 괄호는 떼고 안쪽 글만 제목으로 쓴다.
   머리가 아니면 null을 돌려준다. */
const WRAP_RE = /^[\[【〔<〈]\s*([^\]】〕>〉]+?)\s*[\]】〕>〉]$/;
export const unwrapTitle = t => {
  const m = WRAP_RE.exec(String(t ?? '').trim());
  return m ? m[1].trim() : null;
};

// 축의 다른 단계에 따로 있는 쪽이라 개념/미션 페이지로 넣지 않는다(대신 meta로 따로 뽑는다)
export const SKIP_TITLE_RE = /질문|생각\s*Check|학습\s*목표/i;

/* 머리 표(또는 PDF의 머리 줄)에서 쪽이 아닌 단계를 가리는 라벨. hwpx와 pdf가 같이 쓴다.
   PAGE_RE는 교과서 쪽수("p.117~119"), LECNO_RE는 강 번호("29강", 강의에 이미 있어 버린다),
   QUESTION_RE는 오늘의 질문 쪽 제목("생각 Check", "오늘의 질문"). */
export const UNIT_RE     = /^(?:학습\s*)?단원/;
export const TOPIC_RE    = /^(?:학습\s*)?주제/;
export const OBJ_RE      = /^(?:학습\s*)?목표/;
export const PAGE_RE     = /(?:^p\.?\s*\d|쪽|페이지|\d+\s*[~∼－-]\s*\d)/i;
export const LECNO_RE    = /^\d+\s*강$/;
export const QUESTION_RE = /질문|생각\s*Check/i;

/* 군더더기: 쪽 번호("1/2", "- 3 -", 숫자만), 그리고 화살표나 기호만 있는 글.
   기호만 있는 것은 활동지에서 그림으로 쓴 것이라(붕당이 갈라지는 ⇙ ⇘ 같은 것) 글로 옮길 것이 없다.
   PDF는 그런 줄을, 한글 파일은 그런 칸을 버린다. */
export const JUNK_RE = /^(?:\d+\s*\/\s*\d+|-\s*\d+\s*-|\d+|[\s⇙⇘⇐⇒⇑⇓→←↑↓↔⇨⇦▶◀▲▼◆◇■□●○※*]+)$/;

/* 쪽을 모으는 일꾼. 두 길(hwpx, pdf)이 같은 모양을 만들도록 여기 한 곳에 둔다.
   돌려주는 것은 slide-axis.js의 fromPages가 받는 페이지 배열이다:
   [{ title, rows:[{ label, text } 또는 { kind:'compare', left, right }] }] */
export function makeCollector(){
  const concept = [], mission = [];
  let target = concept, page = null, row = null;
  let skip = true;          // 첫 제목을 만나기 전까지는 활동지 머리라 넣지 않는다
  let parentTitle = '';     // 사료 쪽이 끝나고 표로 돌아올 때 다시 쓸 제목
  let inSource = false;
  /* 개념 노트와 미션 활동 밖의 단계(표지, 학습 목표, 오늘의 질문)도 활동지에서 가져온다
     (선생님 지시 2026-10-30: "활동지를 올리면 슬라이드 만든 섹션에 다 채워져야 해").
     이것들은 쪽(page)이 아니라 머리 표의 라벨/값이나 생각 Check 쪽에서 오므로, 쪽 모으기와
     따로 여기 meta에 담는다. 두 길(hwpx, pdf)이 같은 모양으로 채운다(아래 setter). */
  const meta = { cover:{ topic:'', unit:'', pages:'' }, objective:[], question:null, num:'' };

  /* 같은 제목으로 다음 페이지를 연다(묶음 하나가 페이지 하나라는 원칙. 아래 newRow).
     newPage와 달리 제목을 다시 읽지 않는다: 미션인지, 넣지 않을 쪽인지, 사료 쪽인지는
     이미 가려 둔 그대로 이어 간다. */
  const contPage = () => { page = { title: page.title, rows: [] }; if (!skip) target.push(page); };

  const api = {
    get pages(){ return { concept, mission }; },
    get meta(){ return meta; },       // 표지, 학습 목표, 오늘의 질문(쪽이 아닌 단계)
    get row(){ return row; },        // 지금 채우는 묶음(PDF 길이 줄을 이을 때 앞 글을 본다)
    get inSource(){ return inSource; },
    get parentTitle(){ return parentTitle; },
    get skipping(){ return skip; },

    /* 머리의 학습 단원, 학습 주제, 교과서 쪽수를 표지(cover)에 담는다. 이미 든 것은 덮지 않는다
       (머리에 같은 라벨이 여러 번 나와도 처음 것을 쓴다). */
    setCover(patch){
      for (const k of ['topic', 'unit', 'pages']){
        const v = String(patch?.[k] ?? '').trim();
        if (v && !meta.cover[k]) meta.cover[k] = v;
      }
    },
    // 학습 목표 한 줄. 슬라이드가 번호를 매기므로 "1." 머리는 떼고 담는다(objective는 줄 글자 배열)
    addObjective(line){
      const t = String(line ?? '').replace(/^\s*\d{1,2}\.\s*/, '').trim();
      if (t) meta.objective.push(t);
    },
    // 오늘의 질문. 첫 문단이 질문, 나머지가 설명문이다. 처음 채운 것을 쓴다
    setQuestion(question, guide){
      const q = String(question ?? '').trim();
      if (q && !meta.question) meta.question = { question: q, guide: String(guide ?? '').trim() };
    },
    // 강 번호. 머리 표의 "29강" 같은 칸에서 숫자만 떼어 담는다(강의 라이브러리 번호표가 "N강"으로 보인다)
    setNum(n){ const s = String(n ?? '').trim(); if (s && !meta.num) meta.num = s; },

    /* 제목이 없는 활동지(괄호 머리를 하나도 안 쓴 것)는 처음부터 다 담는다.
       두 길 다 줄을 다 읽어 본 뒤 이것을 불러 준다. */
    noTitles(){ skip = false; },

    newPage(title){
      if (/미션/.test(title)) target = mission;
      skip = SKIP_TITLE_RE.test(title);
      // "사료 : "는 떼지 않는다. 그 머리로 사료 쪽인 줄 안다(SOURCE_RE)
      page = { title: stripStepPrefix(title), rows: [] };
      row = null;
      inSource = SOURCE_RE.test(page.title);
      if (!inSource && !skip) parentTitle = page.title;
      if (!skip) target.push(page);
    },
    ensurePage(){ if (!page) api.newPage(''); },

    /* 원칙: 묶음 하나가 페이지 하나다 (선생님 지시 2026-10-30, 요구사항 139).
       "한 페이지에서 행라벨이 2개 이상 들어오는 경우가 있어. 원칙은 1행라벨 당 1페이지가
        원칙인데 지금 그 원칙이 없어서 이렇게 된거 같거든? 원칙을 저렇게 세우자."
       활동지 한 쪽(괄호 제목 하나)에 라벨이 여럿 있으면 전에는 한 페이지에 다 들어왔다.
       이제는 묶음이 새로 열릴 때마다 **같은 제목으로 다음 페이지를 연다**(contPage).
       그래서 슬라이드도 묶음마다 한 쪽이 된다(2026 lms의 enforceOnePerSlide가 하던 일이다).
       내용이 적어 한 쪽에 같이 두고 싶으면 편집기에서 합친다(어드민의 "위 페이지와 합치기").

       사료 쪽(inSource)은 쪼개지 않는다. 사료는 한 덩어리 글이라 줄마다 쪽이 되면 안 된다. */
    newRow(){
      api.ensurePage();
      if (!inSource && page.rows.some(rowHasText)) contPage();
      row = { label:'', text:'' }; page.rows.push(row); return row;
    },
    // 라벨은 여러 조각으로 쪼개져 올 수 있다("유교" "윤리의" "보급"). 그 묶음의 라벨에 이어 붙인다.
    // 비교나 사료 묶음 뒤에 라벨이 오면 새 묶음이 시작된 것이다(그 라벨을 사료 제목에 잘못 붙이지 않게)
    addLabel(t){
      if (!row || row.kind === 'compare' || row.kind === 'source') api.newRow();
      row.label = row.label ? `${row.label} ${t}` : t;
    },

    /* 사료 인용 묶음 (선생님 지시 2026-10-30). "< 사료 : 이황의 사액 서원 건의 >"처럼 개념 노트 안에
       든 사료는 쪽을 따로 떼지 않는다: 쪽 제목은 부모(개념 노트 #1: 성리학적 질서의 확산) 제목을
       그대로 두고, 사료는 그 쪽의 사료 인용 유형(kind:'source') 묶음으로 들어간다. 라벨이 사료
       제목("이황의 사액 서원 건의")이고 본문은 뒤따르는 줄이다(addText가 이 묶음에 이어 붙인다).
       한 묶음 한 쪽 원칙이라 제 쪽을 갖되, 제목은 부모 제목이다. */
    addSource(label){
      api.ensurePage();
      if (page.rows.some(rowHasText)) contPage();   // 앞 묶음이 있으면 다음 쪽으로(제목은 그대로)
      if (parentTitle) page.title = parentTitle;
      inSource = false;
      row = { kind:'source', label: String(label || '').trim(), text:'' };
      page.rows.push(row);
      return row;
    },
    addText(t, glue = '\n'){
      if (skip || !String(t).trim()) return;
      api.ensurePage();
      if (!row || row.kind === 'compare') api.newRow();
      row.text += row.text ? glue + t : t;
    },
    // 좌우 비교 묶음(2026 lms의 compare를 본떴다). 왼쪽과 오른쪽이 각각 라벨과 내용을 들고 있다
    addCompare(left, right){
      if (skip) return;
      api.ensurePage();
      if (!inSource && page.rows.some(rowHasText)) contPage();   // 비교표도 묶음 하나라 제 쪽을 갖는다
      row = { kind:'compare', label:'', text:'',
        left:  { label: String(left.label  || '').trim(), text: String(left.text  || '').trim() },
        right: { label: String(right.label || '').trim(), text: String(right.text || '').trim() } };
      page.rows.push(row);
      row = null;   // 비교 묶음 뒤의 줄은 새 묶음으로 간다
    },
    // 지금 묶음을 닫는다(다음 글은 새 묶음으로)
    endRow(){ row = null; },
  };
  return api;
}

/* 내용이 든 묶음인가. 빈 묶음만 있는 쪽은 쪽을 만들지 않는다.
   보통 묶음은 라벨만 있고 내용이 없으면 없는 것으로 친다(라벨만 덩그러니 선 쪽을 만들지 않게).
   비교 묶음은 네 칸 중 하나라도 있으면 있는 것이다(slide-axis.js의 rowFilled). */
export const rowHasText = r => !!r && (r.kind === 'compare' ? rowFilled(r) : !!String(r.text || '').trim());

export const tidyPages = pages => pages.filter(p => p.rows.some(rowHasText));

/* 어드민이 부르는 하나뿐인 길. 확장자를 보고 한글 파일과 PDF를 갈라 보낸다.
   읽는 쪽은 그때 불러온다(한글 파일만 올릴 때 PDF.js까지 받아 오지 않게). */
export async function worksheetFromFile(file){
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.hwpx')){
    const { worksheetFromHwpx } = await import('./worksheet-hwpx.js?v=20261031e');
    return worksheetFromHwpx(file);
  }
  if (name.endsWith('.pdf')){
    const { worksheetFromPdf } = await import('./worksheet-pdf.js?v=20261031e');
    return worksheetFromPdf(file);
  }
  throw new Error('한글 파일(.hwpx)이나 PDF만 올릴 수 있습니다.');
}
