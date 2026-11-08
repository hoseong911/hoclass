// 개발용 정적 서버(2026-11-08): ES 모듈 앱은 file://에서 안 떠서 http로 띄운다.
// 쓰기: node dev-server.js  (멈춤: Ctrl+C). 배포 대상 아님.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = 8777;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/dev-launch.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('no'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log('serving hoclass on http://localhost:' + PORT));
