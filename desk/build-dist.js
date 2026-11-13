// 타우리 앱에 넣을 dist 만들기. 사본 받기: node build-dist.js --vendor
const fs = require("fs"), path = require("path"), https = require("https");

const DESK = __dirname;
const ROOT = path.join(DESK, "..");
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
      if (res.statusCode !== 200) { no(new Error(url + " 응답 " + res.statusCode)); return; }
      let b = "";
      res.setEncoding("utf8");
      res.on("data", (d) => b += d);
      res.on("end", () => ok(b));
    }).on("error", no);
  });
}
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
    "desk/desk.js", "desk/widget.js", "desk/fb-desk.js", "desk/hoclass.js", "desk/grid.js", "desk/gcal.js", "desk/neis.js",
    "shared/theme.css", "shared/fb.js", "shared/firebase-config.js", "shared/icons.js",
  ]) copy(rel);

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
