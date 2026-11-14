// 계획 <-> 구글 「교무수첩」 캘린더 맞추기 셈 시험 (cd desk && npm test)
const fs = require("fs"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "plansync.js"), "utf8").replace(/^export /gm, "");
const M = new Function(src + "; return { fromEvent, toEvent, mergePlans, reconcile, livePlans, unsent, addDaysUtc };")();
const W = { now: 5000, from: "2026-09-01", to: "2027-12-31" };
const ev = (gid, d, text, updated, extra = {}) => ({ gid, d, t: "", dur: 0, text, done: false, updated, ...extra });

// API 모양 오가기
{
  const all = M.fromEvent({ id: "a", summary: "✓ 교과협의회", start: { date: "2026-11-20" }, end: { date: "2026-11-21" }, updated: "2026-11-14T00:00:00Z" });
  assert.strictEqual(all.done, true); assert.strictEqual(all.text, "교과협의회"); assert.strictEqual(all.d, "2026-11-20"); assert.strictEqual(all.t, "");
  const timed = M.fromEvent({ id: "b", summary: "학부모 상담", start: { dateTime: "2026-11-20T15:30:00+09:00" }, end: { dateTime: "2026-11-20T16:00:00+09:00" }, updated: "x" });
  assert.strictEqual(timed.t, "15:30"); assert.strictEqual(timed.dur, 30);
  const b1 = M.toEvent({ d: "2026-11-30", text: "보고", done: true });
  assert.deepStrictEqual(b1, { summary: "✓ 보고", start: { date: "2026-11-30" }, end: { date: "2026-12-01" } });
  const b2 = M.toEvent({ d: "2026-11-20", t: "23:30", dur: 60, text: "늦게", done: false });
  assert.strictEqual(b2.start.dateTime, "2026-11-20T23:30:00+09:00"); assert.strictEqual(b2.end.dateTime, "2026-11-21T00:30:00+09:00");
}
// 새 계획은 구글로, 구글에만 있는 일정은 여기로
{
  const r = M.mergePlans([{ id: "p1", d: "2026-11-20", text: "새 계획", done: false, at: 100 }], [ev("g9", "2026-11-21", "구글에서 넣음", 300)], W);
  assert.deepStrictEqual(r.ops, [{ op: "insert", id: "p1" }]);
  const got = r.plans.find(p => p.gid === "g9");
  assert(got && got.text === "구글에서 넣음" && got.sat === got.at, "구글 일정이 계획으로 들어오고 보낼 것으로 치지 않는다");
}
// 한쪽만 고친 것, 둘 다 고친 것
{
  const base = { id: "p1", d: "2026-11-20", text: "옛", done: false, gid: "g1", gat: 100, at: 50, sat: 50 };
  let r = M.mergePlans([{ ...base, text: "여기서 고침", at: 200 }], [ev("g1", "2026-11-20", "옛", 100)], W);
  assert.deepStrictEqual(r.ops, [{ op: "patch", id: "p1" }]); assert.strictEqual(r.plans[0].text, "여기서 고침");
  r = M.mergePlans([base], [ev("g1", "2026-11-22", "구글에서 고침", 300, { done: true })], W);
  assert.deepStrictEqual(r.ops, []); assert.strictEqual(r.plans[0].text, "구글에서 고침"); assert.strictEqual(r.plans[0].d, "2026-11-22"); assert(r.plans[0].done);
  r = M.mergePlans([{ ...base, text: "여기 나중", at: 400 }], [ev("g1", "2026-11-20", "구글 먼저", 300)], W);
  assert.strictEqual(r.plans[0].text, "여기 나중", "둘 다 고치면 나중 것"); assert.deepStrictEqual(r.ops, [{ op: "patch", id: "p1" }]);
  r = M.mergePlans([{ ...base, text: "여기 먼저", at: 200 }], [ev("g1", "2026-11-20", "구글 나중", 300)], W);
  assert.strictEqual(r.plans[0].text, "구글 나중"); assert.deepStrictEqual(r.ops, []);
}
// 지우기: 여기서 지우면 구글에서도, 구글에서 지우면 여기서도. 구간 밖은 건드리지 않는다
{
  const base = { id: "p1", d: "2026-11-20", text: "x", done: false, gid: "g1", gat: 100, at: 50, sat: 50 };
  let r = M.mergePlans([{ ...base, del: true, at: 90 }], [ev("g1", "2026-11-20", "x", 100)], W);
  assert.deepStrictEqual(r.ops, [{ op: "delete", id: "p1" }]);
  r = M.mergePlans([{ id: "p2", d: "2026-11-20", text: "안 보낸 것", del: true }], [], W);
  assert.strictEqual(r.plans.length, 0, "구글에 안 간 것은 그냥 걷는다"); assert.deepStrictEqual(r.ops, []);
  r = M.mergePlans([base], [], W);
  assert.strictEqual(r.plans.length, 0, "구글에서 지운 것은 여기서도 지운다");
  r = M.mergePlans([{ ...base, text: "그 사이 고침", at: 200 }], [], W);
  assert.deepStrictEqual(r.ops, [{ op: "insert", id: "p1" }], "구글에서 지웠어도 그 사이 고쳤으면 다시 보낸다"); assert(!r.plans[0].gid);
  r = M.mergePlans([{ ...base, d: "2025-01-01" }], [], W);
  assert.strictEqual(r.plans.length, 1, "구간 밖은 모르니 그대로");
}
// 맞추는 사이에 고친 것을 잃지 않는다
{
  const live = [
    { id: "a", d: "2026-11-20", text: "그 사이 고침", at: 900 },
    { id: "b", d: "2026-11-21", text: "그대로", at: 10 },
    { id: "c", d: "2026-11-22", text: "그 사이 새로", at: 950 },
  ];
  const done = [
    { id: "a", d: "2026-11-20", text: "보낸 것", gid: "ga", gat: 500, at: 10, sat: 10 },
    { id: "b", d: "2026-11-21", text: "그대로", gid: "gb", gat: 500, at: 10, sat: 10 },
    { id: "g_x", d: "2026-11-23", text: "구글 새것", gid: "x", gat: 500, at: 800, sat: 800 },
  ];
  const out = M.reconcile(live, done, 800);
  const a = out.find(p => p.id === "a");
  assert(a.text === "그 사이 고침" && a.gid === "ga", "고친 글은 남기고 구글 id 는 받는다(안 그러면 두 번 보낸다)");
  assert(out.find(p => p.id === "b").gid === "gb");
  assert(out.find(p => p.id === "c"), "그 사이 새로 적은 것");
  assert(out.find(p => p.id === "g_x"), "구글에서 새로 온 것");
  assert.strictEqual(M.unsent(out), 2, "보낼 것: 고친 a, 새 c");
}
console.log("계획 맞추기 셈 통과");
