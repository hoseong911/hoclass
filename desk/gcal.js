// 구글 캘린더 읽어 오기 (2026-11-11).
// 선생님 지시: "구글캘린더랑 연동되는 캘린더도 하나 설정해줘" → 진짜 연동(구글 로그인)으로 간다.
//
// 어떻게 되는가
//   1) 파베 Auth 로 이미 들어와 있는 계정에 구글을 이어 붙인다(linkWithPopup).
//      이미 이어져 있으면 다시 확인만 한다(reauthenticateWithPopup).
//   2) 그때 구글이 주는 열쇠(access token)로 캘린더 API 를 부른다.
//   3) 그 열쇠는 한 시간쯤 지나면 못 쓴다. 파베는 그걸 되살려 주지 않으므로,
//      만료되면 "다시 연결"을 눌러 받는다. 열쇠는 이 탭에만 둔다(sessionStorage).
//
// 세 가지가 켜져 있어야 한다. 2026-11-11에 ①과 ③은 관리 API로 켜 두었다.
//   ① 승인된 도메인에 hoseong911.github.io            → 켜 둠
//   ③ Google Calendar API                              → 켜 둠
//   ② Authentication → Sign-in method → Google 켜기    → 콘솔에서만 된다(남음)
// ②가 API로 안 되는 까닭: 구글 로그인을 켜려면 OAuth 클라이언트(아이디·비밀값)가 필요하고,
// 그 클라이언트를 만드는 공개 API가 없다. 파베 콘솔은 그걸 한 번에 만들어 준다.
// 무엇이 빠졌는지는 아래 why() 가 오류를 걸러 알려 준다.

const KEY = "desk-gcal-token";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
// 바로 그 설정 화면
export const CONSOLE_URL = "https://console.firebase.google.com/project/ho0911seong-56638/authentication/providers";

export function savedToken() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && o.token && o.until > Date.now() ? o : null;
  } catch (e) { return null; }
}
function keepToken(token, seconds) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token, until: Date.now() + (Number(seconds) || 3300) * 1000 }));
  } catch (e) {}
}
export function forgetToken() { try { sessionStorage.removeItem(KEY); } catch (e) {} }

/* 무엇이 빠졌는지 알아내 쉬운 말로 바꾼다. */
export function why(e) {
  const c = (e && e.code) || (e && e.message) || "";
  if (/unauthorized-domain/.test(c)) return { step: 1, msg: "이 주소가 파베에 등록돼 있지 않습니다. 승인된 도메인에 hoseong911.github.io 를 넣어 주세요." };
  if (/operation-not-allowed|provider-disabled|configuration-not-found/.test(c)) return { step: 2, msg: "파베에서 구글 로그인이 아직 꺼져 있습니다. 아래 주소에서 Google 을 켜 주세요(한 번만 하면 됩니다)." };
  if (/popup-blocked/.test(c)) return { step: 0, msg: "브라우저가 창 띄우기를 막았습니다. 주소줄 오른쪽에서 허용해 주세요." };
  if (/popup-closed-by-user|cancelled-popup-request/.test(c)) return { step: 0, msg: "연결을 취소했습니다." };
  if (/credential-already-in-use|account-exists/.test(c)) return { step: 0, msg: "그 구글 계정이 다른 곳에 이미 이어져 있습니다." };
  if (/calendar.*not been used|accessNotConfigured|SERVICE_DISABLED/i.test(c)) return { step: 3, msg: "구글 클라우드에서 Calendar API 가 꺼져 있습니다. 켜고 1~2분 뒤에 다시 해 주세요." };
  if (/insufficient|insufficientPermissions|403/.test(c)) return { step: 3, msg: "캘린더를 읽을 권한이 없습니다. 연결할 때 캘린더 보기를 허용해 주세요." };
  if (/401|invalid_token|Invalid Credentials/i.test(c)) return { step: 0, msg: "연결이 만료됐습니다. 다시 연결해 주세요." };
  return { step: 0, msg: "구글 캘린더에 이어 붙이지 못했습니다. " + (c || "까닭을 모르겠습니다") };
}

/* 구글을 이어 붙이고 열쇠를 받는다. 창을 띄우므로 반드시 선생님이 누를 때만 부른다. */
export async function connect(FB) {
  if (!FB.GoogleAuthProvider) throw new Error("이 화면에서는 구글 연결을 쓸 수 없습니다.");
  const user = FB.auth.currentUser;
  if (!user) throw new Error("먼저 로그인해 주세요.");
  const provider = new FB.GoogleAuthProvider();
  provider.addScope(SCOPE);
  provider.setCustomParameters({ login_hint: user.email || "", prompt: "consent" });

  const linked = (user.providerData || []).some(p => p && p.providerId === "google.com");
  const result = linked
    ? await FB.reauthenticateWithPopup(user, provider)
    : await FB.linkWithPopup(user, provider);
  const cred = FB.GoogleAuthProvider.credentialFromResult(result);
  const token = cred && cred.accessToken;
  if (!token) throw new Error("구글이 열쇠를 주지 않았습니다.");
  keepToken(token, 3300);
  return token;
}

/* 오늘부터 앞으로의 일정을 받아 온다. 되돌려 주는 모양:
   [{ at: "2027-03-02", allDay: false, time: "09:00", title: "..." }] */
export async function listEvents(token, { days = 21, max = 30 } = {}) {
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + days * 86400000);
  const url = API + "?" + new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(max),
  });
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = (j.error && (j.error.message || j.error.status)) || ""; } catch (e) {}
    const err = new Error(res.status + " " + detail);
    err.code = String(res.status) + " " + detail;
    throw err;
  }
  const j = await res.json();
  return (j.items || []).map(ev => {
    const s = ev.start || {};
    const allDay = !!s.date;
    const at = allDay ? s.date : String(s.dateTime || "").slice(0, 10);
    const time = allDay ? "" : String(s.dateTime || "").slice(11, 16);
    return { at, allDay, time, title: String(ev.summary || "(제목 없음)").slice(0, 80) };
  }).filter(x => x.at);
}

/* 날짜별로 묶는다. [{ at, items: [...] }] */
export function byDay(events) {
  const map = new Map();
  for (const ev of events) {
    if (!map.has(ev.at)) map.set(ev.at, []);
    map.get(ev.at).push(ev);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([at, items]) => ({ at, items }));
}
