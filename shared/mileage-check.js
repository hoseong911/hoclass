// 열공 마일리지 검증 엔진 (hismile 재설계 이식 3단계, 2026-11-08)
// ───────────────────────────────────────────────────────────────────────────
// 학생이 낸 인증 한 건을 통과(pass) 또는 보류(pending, 교사 검토)로 가린다. 실패는 없다.
// hismile의 과오(AI가 날짜를 yes/no로 판정해 멀쩡한 인증을 떨어뜨리고, 내용 인식을 자주 놓침)를
// 다음 원칙으로 고친다:
//   - 날짜: AI는 사진에 보이는 날짜 '글자만' 읽어 준다. 통과/보류 판정은 코드가 한다
//           (형식 정규화 + 자정·시차 하루 여유). 글자를 아예 못 읽으면 날짜로는 떨어뜨리지 않는다.
//   - 사진 범위: 손글씨 필기뿐 아니라 학습지·교재도 인정(느슨). 컴퓨터·폰 화면 캡처만 뺀다.
//   - 내용 일치: 글이 사진에 그대로 안 보여도, 주제가 그 과목 범위에 맞고 글이 그 주제와
//                이어지면 통과(느슨). 범위는 그 과목·학기 강의 제목을 AI에 실마리로 넘긴다.
//   - AI 2단계: 먼저 사진을 묘사하게 한 뒤(describe) 판정 항목을 받는다(인식률↑).
// 중복(사진 재사용·글 복붙)은 코드가 기존 인증과 대 봐서 걸러 보류로 돌린다.
// 자동 검증에 실패하면(네트워크·API) 떨어뜨리지 않고 보류로 둬서 교사가 본다.

import { CLAUDE_PROXY_URL } from './util.js?v=20261028f';

const DUP_PHOTO_BITS = 6;   // 평균해시 해밍거리 이 이하면 같은 사진으로 본다(64비트 중)
const DUP_TEXT_SIM   = 0.82; // 3-그램 자카드 유사도 이 이상이면 같은 글로 본다
const DATE_TOLER_DAY = 1;    // 사진 날짜가 오늘에서 이 날수 안이면 통과(자정·시차 여유)

/* 평균 해시(aHash) 해밍거리. 두 16진수 문자열의 비트 차이 수.
   한쪽이 비었거나 길이가 다르면 비교 불가(Infinity)로 둬서 중복으로 안 센다. */
export function photoHamming(a, b){
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++){
    let x = (parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 0xf;
    while (x){ d += x & 1; x >>= 1; }
  }
  return d;
}

/* 글 유사도: 공백·문장부호를 걷고 3글자씩 묶어(자카드) 비교. 짧은 글은 0으로 둔다. */
export function textSim(a, b){
  const norm = s => String(s || '').toLowerCase().replace(/[\s\p{P}]/gu, '');
  const tri = s => { const g = new Set(); for (let i = 0; i < s.length - 2; i++) g.add(s.slice(i, i + 3)); return g; };
  const A = tri(norm(a)), B = tri(norm(b));
  if (A.size < 3 || B.size < 3) return 0;
  let inter = 0; A.forEach(g => { if (B.has(g)) inter++; });
  return inter / (A.size + B.size - inter);
}

/* 사진에서 AI가 읽어 온 날짜 글자를 YYYY-MM-DD로 정규화. 연도가 없으면 오늘 연도를 쓴다.
   못 읽으면 null(날짜로는 떨어뜨리지 않는다). 시각·요일 따위는 무시한다. */
export function normalizePhotoDate(text, todayYmd){
  if (!text) return null;
  const year0 = +todayYmd.slice(0, 4);
  const s = String(text);
  let m = s.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);  // 2026-11-08, 2026년 11월 8일
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/);                        // 11-08, 11월 8일
  if (m) return ymd(year0, +m[1], +m[2]);
  return null;
}
function ymd(y, mo, d){
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function diffDays(a, b){
  const t = s => Date.parse(s + 'T00:00:00Z');
  return Math.round(Math.abs(t(a) - t(b)) / 86400000);
}

/* 인증 한 건을 검증한다. 돌려주는 모양은 model.saveMileageCert가 그대로 받는다:
     { result:'pass'|'pending', reason, checks, photoDate }
   입력:
     today        : 오늘 YYYY-MM-DD (KST)
     photoBase64  : data URL 접두 없는 base64, mediaType : 'image/jpeg' 등
     content, feeling : 학생이 쓴 공부 내용·느낀 점
     photoHash    : 이 사진의 aHash(중복 비교용)
     scopeTitles  : 범위 강의 제목 배열, scopeNote : 교사 메모
     subject, grade : 프롬프트 말투용
     existingCerts: 같은 과목 기존 인증 [{ date, studentNo, content, photoHash }] (중복 비교용) */
export async function verifyMileageCert(opts){
  const {
    today, photoBase64, mediaType = 'image/jpeg', content = '', feeling = '',
    photoHash = '', scopeTitles = [], scopeNote = '', subject = '', grade = '',
    existingCerts = [], studentNo = '',
  } = opts;
  const checks = {};

  // 1) 중복(코드): 다른 날·다른 학생의 인증과 사진이 같거나 글이 거의 같으면 보류.
  for (const e of existingCerts){
    if (e.date === today && String(e.studentNo) === String(studentNo)) continue; // 같은 자리는 덮어쓰기(내 오늘 것)
    if (photoHash && photoHamming(photoHash, e.photoHash) <= DUP_PHOTO_BITS){
      checks.dupPhoto = true;
      return { result:'pending', reason:'이전에 올린 사진과 거의 같아요. 오늘 공부한 사진으로 다시 올려 주세요.', checks, photoDate:'' };
    }
    if (content && textSim(content, e.content) >= DUP_TEXT_SIM){
      checks.dupText = true;
      return { result:'pending', reason:'이전에 쓴 내용과 거의 같아요. 오늘 공부한 내용을 적어 주세요.', checks, photoDate:'' };
    }
  }

  // 2) AI 2단계: 먼저 묘사 → 판정 항목(JSON). 범위 강의 제목을 실마리로 넘긴다.
  const scope = scopeTitles.length
    ? scopeTitles.slice(0, 40).map((t, i) => `${i + 1}. ${t}`).join('\n')
    : '(범위가 따로 지정되지 않음)';
  const who = subject ? `${subject}${grade ? ` 중학교 ${grade}학년` : ''} 공부` : '공부';
  const prompt = `너는 중학생의 '열공(열심히 공부) 인증'을 살펴보는 선생님이다. 학생이 공부한 사진 한 장과, 오늘 공부한 내용·느낀 점을 냈다. 너그럽게 보되 장난·복붙·전혀 무관한 사진만 걸러낸다.

먼저 사진을 눈에 보이는 대로 묘사한 뒤, 아래 JSON 하나만 출력해라(다른 말 없이).
- describe: 사진에 보이는 것 한두 문장 묘사(무엇을, 손글씨인지 인쇄물인지, 날짜·시각 글자가 있으면 포함)
- dateText: 사진 안에 날짜나 촬영 시각 글자가 보이면 그 글자 그대로. 없으면 "" (네가 날짜의 맞고틀림을 판정하지 마라. 글자만 옮겨라)
- isScreenCapture: 컴퓨터·태블릿·폰의 화면을 그대로 캡처(스크린샷)한 이미지면 true, 실제로 찍은 사진이면 false
- isStudyEvidence: 손글씨 필기, 문제 푼 학습지, 교재·노트·책 등 '공부한 흔적'이 보이면 true, 공부와 무관하면 false
- topicInScope: 공부한 흔적이나 학생 글의 주제가 아래 '학기 범위'와 이어지면 true. 범위가 지정 안 됐으면 공부 흔적만 있으면 true
- contentConsistent: 학생이 쓴 공부 내용이 사진·주제와 자연스럽게 이어지면 true(사진에 그 글자가 그대로 없어도, 주제만 맞으면 true)

${who}. 학기 범위(강의 제목):
${scope}${scopeNote ? `\n교사 메모: ${scopeNote}` : ''}

학생이 쓴 공부 내용: "${String(content).slice(0, 600)}"
학생이 쓴 느낀 점: "${String(feeling).slice(0, 300)}"

출력(JSON만): {"describe":"...","dateText":"...","isScreenCapture":false,"isStudyEvidence":true,"topicInScope":true,"contentConsistent":true}`;

  let ai;
  try {
    const res = await fetch(CLAUDE_PROXY_URL, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        model:'claude-sonnet-4-6', max_tokens:600,
        messages:[{ role:'user', content:[
          { type:'image', source:{ type:'base64', media_type:mediaType, data:photoBase64 } },
          { type:'text', text:prompt },
        ] }],
      }),
    });
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();
    const raw = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
    ai = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch (e){
    // 자동 검증 실패: 떨어뜨리지 않고 보류로 둔다(교사가 본다).
    checks.aiError = true;
    return { result:'pending', reason:'지금은 자동 확인을 못 했어요. 선생님이 직접 확인할게요.', checks, photoDate:'' };
  }

  // 3) 판정(코드). 보류 사유를 모은다. 하나라도 걸리면 보류, 없으면 통과.
  const photoDate = normalizePhotoDate(ai.dateText, today);
  checks.describe = String(ai.describe || '').slice(0, 300);
  checks.dateText = String(ai.dateText || '').slice(0, 60);
  checks.isScreenCapture = !!ai.isScreenCapture;
  checks.isStudyEvidence = ai.isStudyEvidence !== false;
  checks.topicInScope = ai.topicInScope !== false;
  checks.contentConsistent = ai.contentConsistent !== false;

  const why = [];
  if (ai.isScreenCapture) why.push('화면을 캡처한 이미지로 보여요. 실제로 찍은 공부 사진을 올려 주세요.');
  if (ai.isStudyEvidence === false) why.push('공부한 흔적을 찾기 어려워요. 필기나 교재가 보이게 다시 찍어 주세요.');
  // 날짜: 읽은 날짜가 오늘에서 하루를 넘게 벗어나면 보류. 못 읽으면 통과(느슨).
  if (photoDate && diffDays(photoDate, today) > DATE_TOLER_DAY)
    why.push('사진 날짜가 오늘과 많이 달라요. 오늘 공부한 사진인지 확인해 주세요.');
  // 범위·내용: 둘 다 어긋날 때만 보류(느슨).
  if (ai.topicInScope === false && ai.contentConsistent === false)
    why.push('공부 내용이 이번 학기 범위와 이어지는지 분명하지 않아요.');

  return why.length
    ? { result:'pending', reason:why.join(' '), checks, photoDate: photoDate || '' }
    : { result:'pass',    reason:'', checks, photoDate: photoDate || '' };
}
