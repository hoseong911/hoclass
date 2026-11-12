/* 화면에 나가는 한글을 훑어 자주 틀리는 것을 찾는다. desk.test.js 가 부른다.
   정규식이라 뜻까지 보지는 못한다. 걸린 자리를 사람이 보고 판단하라는 뜻이다. */
const fs = require("fs"), path = require("path");

const FILES = ["desk.js", "widget.js", "gcal.js", "hoclass.js", "grid.js",
               "index.html", "widget.html", "preview.html"];

/* [찾을 것, 왜] */
const RULES = [
  [/안되(?![가-힣])/g, "'안 되'로 띄어 쓴다"],
  [/안돼/g, "'안 돼'로 띄어 쓴다"],
  [/[^ ]되요/g, "'돼요'"],
  [/뭐에요|거에요|것이에요/g, "'예요'"],
  [/몇일/g, "'며칠'"],
  [/오랫만/g, "'오랜만'"],
  [/금새/g, "'금세'"],
  [/왠만/g, "'웬만'"],
  [/할수(?![가-힣])|갈께|줄께|할께/g, "'할 수', '갈게', '줄게', '할게'"],
  [/있슴|없슴|습니당/g, "'있음', '없음'"],
  [/바램/g, "'바람'"],
  [/들어나|들어낸/g, "'드러나', '드러낸'"],
  [/되어집|보여집|불려집|쓰여집/g, "이중 피동"],
  [/[가-힣]·[가-힣]/g, "가운뎃점을 쓰지 않는다(레포 규칙)"],
  [/[가-힣]—|—[가-힣]/g, "줄표를 쓰지 않는다(레포 규칙)"],
  [/[가-힣]→|→[가-힣]/g, "화살표로 잇지 않는다(레포 규칙)"],
  [/우젯/g, "'위젯'"],
  [/학사일정/g, "'학사 일정'으로 띄어 쓴다"],
  [/(?<![가-힣])갯수/g, "'개수'"],
  [/뵈요/g, "'봬요'"],
  [/어떻해/g, "'어떡해'"],
  [/[가-힣]함니다|[가-힣]읍니다/g, "'~습니다'"],
  [/[가-힣]구요(?![가-힣])/g, "'~고요'"],
  [/[0-9]개의 /g, "'개의'는 번역투다"],
  [/하실 수 있습니다/g, "'~할 수 있습니다'로 줄인다"],
];

function checkKorean(dir) {
  const bad = [];
  for (const f of FILES) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    fs.readFileSync(p, "utf8").split(/\r?\n/).forEach((line, i) => {
      for (const [re, why] of RULES) {
        re.lastIndex = 0;
        const m = re.exec(line);
        if (m) bad.push(f + ":" + (i + 1) + " «" + m[0] + "» " + why);
      }
    });
  }
  return bad;
}

module.exports = { checkKorean, RULES, FILES };
