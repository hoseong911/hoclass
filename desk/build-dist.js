// 타우리 앱에 넣을 dist 폴더를 만든다 (2026-11-11).
// 웹판은 깃허브 페이지가 레포를 그대로 서비스하므로 빌드가 필요 없다.
// 앱판은 수첩이 쓰는 파일만 골라 담는다. 경로를 그대로 지켜서 import 가 깨지지 않게 한다.
//
//   dist/desk/...    수첩 화면
//   dist/shared/...  호클래스와 같이 쓰는 파베 초기화
//   dist/vendor/...  (있으면) 파베 라이브러리 사본 — 인터넷 없이도 열리게
//
// 라이브러리 사본을 받는 법:  node build-dist.js --vendor
const fs = require("fs"), path = require("path"), https = require("https");

const DESK = __dirname;                       // .../hoclass/desk
const ROOT = path.join(DESK, "..");           // .../hoclass
const DIST = path.join(DESK, "dist");
const VENDOR = path.join(DESK, "vendor", "firebase");
const SDK = "10.12.2";
const SDK_FILES = ["firebase-app.js", "firebase-firestore.js", "firebase-auth.js"];
const CDN = (f) => `https://www.gstatic.com/firebasejs/${SDK}/${f}`;

const copy = (rel) => {
  const from = path.join(ROOT, rel), to = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

function get(url) {
  return new Promise((ok, no) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { no(new Error(url + " → " + res.statusCode)); return; }
      let b = "";
      res.setEncoding("utf8");
      res.on("data", (d) => b += d);
      res.on("end", () => ok(b));
    }).on("error", no);
  });
}
// CDN 주소를 글자 그대로 찾아 바꾼다(정규식을 안 써서 escape 사고가 없다).
const swapAll = (text, to) => text.split(CDN("")).join(to);

async function vendor() {
  fs.mkdirSync(VENDOR, { recursive: true });
  for (const f of SDK_FILES) {
    let body = await get(CDN(f));
    // 사본끼리 서로를 가리키게 고친다. 안 고치면 인터넷이 없을 때 못 불러온다.
    body = swapAll(body, "./");
    fs.writeFileSync(path.join(VENDOR, f), body);
    console.log("받음:", f, (body.length / 1024).toFixed(0) + "KB");
  }
}

async function main() {
  if (process.argv.includes("--vendor")) { await vendor(); return; }

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  for (const rel of [
    "desk/index.html", "desk/widget.html", "desk/desk.css",
    "desk/desk.js", "desk/widget.js", "desk/fb-desk.js", "desk/hoclass.js",
    "shared/fb.js", "shared/firebase-config.js",
  ]) copy(rel);

  // 라이브러리 사본이 있으면 그걸 쓰도록 import 주소를 바꾼다(인터넷 없이도 열린다).
  const have = fs.existsSync(VENDOR) && SDK_FILES.every(f => fs.existsSync(path.join(VENDOR, f)));
  if (have) {
    fs.cpSync(VENDOR, path.join(DIST, "vendor", "firebase"), { recursive: true });
    const swap = (rel, up) => {
      const p = path.join(DIST, rel);
      const s = fs.readFileSync(p, "utf8"), out = swapAll(s, up);
      if (out !== s) fs.writeFileSync(p, out);
    };
    swap("shared/fb.js", "../vendor/firebase/");
    swap("desk/fb-desk.js", "../vendor/firebase/");
    console.log("파베 라이브러리 사본을 넣었습니다 (인터넷 없이도 열립니다)");
  } else {
    console.log("라이브러리 사본이 없어 CDN을 씁니다. 인터넷 없이 열려면: node build-dist.js --vendor");
  }

  console.log("dist 만들었습니다:", DIST);
}
main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
