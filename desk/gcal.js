
const KEY = "desk-gcal-token";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
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

/* 창을 띄우므로 선생님이 누를 때만 부른다. */
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

export function byDay(events) {
  const map = new Map();
  for (const ev of events) {
    if (!map.has(ev.at)) map.set(ev.at, []);
    map.get(ev.at).push(ev);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([at, items]) => ({ at, items }));
}
