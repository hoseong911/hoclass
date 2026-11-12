/* 진짜 파이어스토어가 거부하는 값을 가짜 파베도 거부하게 한다.
   가짜가 너무 관대하면 시험은 통과하는데 실제로는 한 글자도 안 올라간다.
   (2026-11-12: 주간 시간표가 배열 안의 배열이라 실제 저장이 통째로 막혀 있었는데 시험은 통과했다.) */
function checkFirestoreValue(v, path, inArray) {
  if (v === undefined) throw Object.assign(new Error("값이 undefined 다: " + path), { code: "invalid-argument" });
  if (typeof v === "function") throw Object.assign(new Error("함수는 못 담는다: " + path), { code: "invalid-argument" });
  if (Array.isArray(v)) {
    if (inArray) throw Object.assign(new Error("배열 안에 배열은 못 담는다: " + path), { code: "invalid-argument" });
    v.forEach((x, i) => checkFirestoreValue(x, path + "[" + i + "]", true));
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k.includes("/") || k === "" || k.startsWith("__")) {
        throw Object.assign(new Error("못 쓰는 칸 이름: " + path + "." + k), { code: "invalid-argument" });
      }
      checkFirestoreValue(x, path + "." + k, false);
    }
  }
}
module.exports = { checkFirestoreValue };
