
const KEY = "desk-gcal-token";
import { fromEvent, toEvent } from "./plansync.js";
// 읽기(내 다른 캘린더 보기) + 이 앱이 만든 캘린더만 쓰기(「교무수첩」 캘린더). 다른 캘린더는 고칠 수 없다.
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.app.created"];
const BASE = "https://www.googleapis.com/calendar/v3";
export const CAL_NAME = "교무수첩";
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
  if (/insufficient|insufficientPermissions|403/.test(c)) return { step: 3, msg: "캘린더 권한이 모자랍니다. 다시 연결해서 캘린더 보기와 「교무수첩」 캘린더 만들기를 허용해 주세요." };
  if (/401|invalid_token|Invalid Credentials/i.test(c)) return { step: 0, msg: "연결이 만료됐습니다. 다시 연결해 주세요." };
  return { step: 0, msg: "구글 캘린더에 이어 붙이지 못했습니다. " + (c || "까닭을 모르겠습니다") };
}

/* 창을 띄우므로 선생님이 누를 때만 부른다. */
export async function connect(FB) {
  if (!FB.GoogleAuthProvider) throw new Error("이 화면에서는 구글 연결을 쓸 수 없습니다.");
  const user = FB.auth.currentUser;
  if (!user) throw new Error("먼저 로그인해 주세요.");
  const provider = new FB.GoogleAuthProvider();
  for (const s of SCOPES) provider.addScope(s);
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

export async function listEvents(token, { days = 21, max = 30, start, end, cal = "primary" } = {}) {
  const from = start ? new Date(start + "T00:00:00+09:00") : new Date(); if (!start) from.setHours(0, 0, 0, 0);
  const to = end ? new Date(end + "T00:00:00+09:00") : new Date(from.getTime() + days * 86400000);
  const url = BASE + "/calendars/" + encodeURIComponent(cal) + "/events?" + new URLSearchParams({
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
  // 캘린더 여럿을 합치면 하루 안 차례가 섞인다. 종일 먼저, 그다음 시각 차례
  for (const list of map.values()) list.sort((a, b) => (a.allDay ? "" : a.time).localeCompare(b.allDay ? "" : b.time));
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([at, items]) => ({ at, items }));
}

/* ---------- 「교무수첩」 캘린더 주고받기(plansync.js 가 셈, 여기는 주고받기만) ---------- */
async function call(token, method, url, body) {
  const res = await fetch(url, { method, headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  if (method === "DELETE" && (res.status === 404 || res.status === 410)) return null;   // 이미 지워졌다
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = (j.error && (j.error.message || j.error.status)) || ""; } catch (e) {}
    const err = new Error(res.status + " " + detail);
    err.code = String(res.status) + " " + detail; err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}
const enc = encodeURIComponent;
/* 「교무수첩」 캘린더 id. 적어 둔 것이 없거나 지워졌으면 내 캘린더 목록에서 찾고, 없으면 만든다(기기마다 새로 만들지 않게). */
export async function ensureCalendar(token, id) {
  if (id) {
    try { await call(token, "GET", BASE + "/calendars/" + enc(id)); return id; }
    catch (e) { if (e.status !== 404 && e.status !== 403) throw e; }
  }
  const list = await call(token, "GET", BASE + "/users/me/calendarList?minAccessRole=owner&maxResults=250");
  const have = (list.items || []).find(c => c.summary === CAL_NAME && !c.deleted);
  if (have) return have.id;
  const made = await call(token, "POST", BASE + "/calendars", { summary: CAL_NAME, timeZone: "Asia/Seoul" });
  return made.id;
}
export async function listCal(token, cal, { from, to }) {
  const out = [];
  let page = "";
  do {
    const q = new URLSearchParams({ timeMin: from + "T00:00:00+09:00", timeMax: to + "T23:59:59+09:00", singleEvents: "true", maxResults: "2500" });
    if (page) q.set("pageToken", page);
    const j = await call(token, "GET", BASE + "/calendars/" + enc(cal) + "/events?" + q);
    for (const ev of j.items || []) if (ev.status !== "cancelled") out.push(fromEvent(ev));
    page = j.nextPageToken || "";
  } while (page);
  return out;
}
export async function insertEv(token, cal, p) { const j = await call(token, "POST", BASE + "/calendars/" + enc(cal) + "/events", toEvent(p)); return { gid: j.id, updated: Date.parse(j.updated) || Date.now() }; }
export async function patchEv(token, cal, gid, p) { const j = await call(token, "PATCH", BASE + "/calendars/" + enc(cal) + "/events/" + enc(gid), toEvent(p)); return { updated: Date.parse(j.updated) || Date.now() }; }
export async function deleteEv(token, cal, gid) { await call(token, "DELETE", BASE + "/calendars/" + enc(cal) + "/events/" + enc(gid)); }

/* 가져올 캘린더 고르기(선생님 지시 2026-11-14): 내 계정의 캘린더 목록. 「교무수첩」 캘린더는 계획으로 따로 주고받으니 뺀다. */
export async function listCalendars(token, skipId) {
  const j = await call(token, "GET", BASE + "/users/me/calendarList?maxResults=250");
  return (j.items || []).filter(c => !c.deleted && c.id !== skipId && c.summary !== CAL_NAME)
    .map(c => ({ id: c.id, name: String(c.summaryOverride || c.summary || c.id), color: c.backgroundColor || "", primary: !!c.primary }))
    .sort((a, b) => (b.primary - a.primary) || a.name.localeCompare(b.name, "ko"));
}
