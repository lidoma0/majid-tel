// سرور ساده برای تست محلی: node scripts/serve.mjs  →  http://localhost:5173
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const www = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../www');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.apk': 'application/vnd.android.package-archive' };
const port = Number(process.env.PORT) || 5173;
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(www, path.normalize(p));
  if (!file.startsWith(www) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}`));
