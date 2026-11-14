// 교무수첩 계획 <-> 구글 「교무수첩」 캘린더 주고받기(선생님 지시 2026-11-14: 양쪽 다 오가야 한다).
// 화면도 네트워크도 모르는 셈만 둔다. 시험은 test/plansync.test.js.
//
// 계획 한 건: { id, d: "YYYY-MM-DD", text, done, t?: "HH:MM", dur?: 분,
//              gid?: 구글 일정 id, gat?: 마지막으로 맞춘 때 구글 쪽 updated(ms),
//              at?: 여기서 고친 때(ms), sat?: 마지막으로 맞춘 때의 at, del?: 지운 표시(구글에서도 지운 뒤 걷는다) }
// 다 했음은 구글 쪽 제목 앞 "✓ " 로 주고받는다. 구글에서 ✓ 를 붙여도 여기서 다 했음이 된다.

export const DONE_MARK = "✓ ";
export function addDaysUtc(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// 한국 시각 글자로("2026-11-14T10:30:00+09:00")
function kstIso(ms) { return new Date(ms + 9 * 3600000).toISOString().slice(0, 19) + "+09:00"; }

/* 구글 일정(API 모양) → 계획 쪽 모양 */
export function fromEvent(ev) {
  const s = ev.start || {}, e = ev.end || {};
  const allDay = !!s.date;
  const d = allDay ? s.date : String(s.dateTime || "").slice(0, 10);
  const t = allDay ? "" : String(s.dateTime || "").slice(11, 16);
  const dur = !allDay && s.dateTime && e.dateTime ? Math.max(0, Math.round((Date.parse(e.dateTime) - Date.parse(s.dateTime)) / 60000)) : 0;
  let text = String(ev.summary || "").trim();
  const done = /^✓/.test(text);
  if (done) text = text.replace(/^✓\s*/, "");
  return { gid: String(ev.id), d, t, dur, text: (text || "(제목 없음)").slice(0, 100), done, updated: Date.parse(ev.updated) || 0 };
}

/* 계획 → 구글 일정 본문. 시각이 없으면 종일 일정 */
export function toEvent(p) {
  const summary = (p.done ? DONE_MARK : "") + p.text;
  if (p.t) {
    const start = Date.parse(`${p.d}T${p.t}:00+09:00`);
    return { summary, start: { dateTime: kstIso(start), timeZone: "Asia/Seoul" },
      end: { dateTime: kstIso(start + (p.dur || 60) * 60000), timeZone: "Asia/Seoul" } };
  }
  return { summary, start: { date: p.d }, end: { date: addDaysUtc(p.d, 1) } };
}

/* 양쪽을 맞춘다. events 는 [from, to] 사이 구글 일정(fromEvent 모양)이다.
   돌려주는 plans 는 맞춘 뒤의 계획, ops 는 구글에 할 일({ op: insert|patch|delete, id }).
   - 여기서만 고쳤으면 구글로, 구글에서만 고쳤으면 여기로, 둘 다 고쳤으면 나중에 고친 쪽.
   - 구글에서 지운 일정은 여기서도 지운다. 단 구간 밖이면 몰라서 그대로 둔다. */
export function mergePlans(plans, events, { now, from, to }) {
  const byG = new Map(events.map(e => [e.gid, e]));
  const used = new Set(), out = [], ops = [];
  for (const p0 of plans) {
    const p = { ...p0 };
    const ev = p.gid ? byG.get(p.gid) : null;
    if (ev) used.add(p.gid);
    const local = (p.at || 0) > (p.sat || 0);
    if (p.del) {
      if (p.gid) { out.push(p); ops.push({ op: "delete", id: p.id }); }
      continue;
    }
    if (!p.gid) { out.push(p); ops.push({ op: "insert", id: p.id }); continue; }
    if (!ev) {
      if (p.d < from || p.d > to) { out.push(p); continue; }
      // 구글에서 지웠다. 그 사이 여기서 고쳤으면 다시 보내고, 아니면 여기서도 지운다.
      if (local) { delete p.gid; delete p.gat; out.push(p); ops.push({ op: "insert", id: p.id }); }
      continue;
    }
    const remote = ev.updated > (p.gat || 0);
    if (remote && (!local || ev.updated >= (p.at || 0))) {
      Object.assign(p, { d: ev.d, t: ev.t, dur: ev.dur, text: ev.text, done: ev.done, gat: ev.updated, at: now, sat: now });
      out.push(p); continue;
    }
    out.push(p);
    if (local) ops.push({ op: "patch", id: p.id });
  }
  for (const ev of events) {
    if (used.has(ev.gid)) continue;
    out.push({ id: "g_" + ev.gid, d: ev.d, t: ev.t, dur: ev.dur, text: ev.text, done: ev.done,
      gid: ev.gid, gat: ev.updated, at: now, sat: now });
  }
  return { plans: out, ops };
}

/* 맞추는 동안(구글에 묻고 기다리는 사이) 선생님이 고친 것을 잃지 않게, 맞춘 결과를 지금 목록에 얹는다.
   live: 지금 목록, done: 맞춘 결과(ops 까지 끝낸 것), startedAt: 맞추기 시작한 때. */
export function reconcile(live, done, startedAt) {
  const byId = new Map(done.map(p => [p.id, p]));
  const out = [];
  for (const p of live) {
    const m = byId.get(p.id);
    const touched = (p.at || 0) > startedAt;
    if (!m) { if (touched && !p.del) out.push(p); continue; }   // 맞추며 걷힌 것. 그 사이 고쳤으면 남긴다
    byId.delete(p.id);
    if (touched) { out.push({ ...p, gid: m.gid || p.gid, gat: m.gat || p.gat }); continue; }
    out.push(m);
  }
  for (const m of byId.values()) out.push(m);                    // 구글에서 새로 온 것
  return out;
}

export const livePlans = (plans) => (plans || []).filter(p => !p.del);
export const unsent = (plans) => (plans || []).filter(p => !p.gid || p.del || (p.at || 0) > (p.sat || 0)).length;
