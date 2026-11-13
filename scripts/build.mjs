// ساخت فایل‌های ثابت سایت: فونت، آیکون‌ها (فقط موارد استفاده‌شده)، آیکون اپ و CSS
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');
const nm = path.join(root, 'node_modules');
fs.mkdirSync(path.join(www, 'assets/fonts'), { recursive: true });
fs.mkdirSync(path.join(www, 'icons'), { recursive: true });

// 1) فونت وزیرمتن (variable)
fs.copyFileSync(path.join(nm, 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2'), path.join(www, 'assets/fonts/Vazirmatn-wght.woff2'));

// 2) آیکون‌های Phosphor — فقط کلاس‌های استفاده‌شده
const src = ['index.html', 'assets/app.js'].map(f => fs.readFileSync(path.join(www, f), 'utf8')).join('\n');
const used = new Set([...src.matchAll(/ph-([a-z0-9-]+)/g)].map(m => m[1]));
const weights = { regular: ['ph', 'Phosphor'], bold: ['ph-bold', 'Phosphor-Bold'], fill: ['ph-fill', 'Phosphor-Fill'], duotone: ['ph-duotone', 'Phosphor-Duotone'] };
const reEsc = s => s.replace(/[-.]/g, m => '\\' + m);
let css = '';
for (const [w, [cls, file]] of Object.entries(weights)) {
  const dir = path.join(nm, '@phosphor-icons/web/src', w);
  const style = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  fs.copyFileSync(path.join(dir, file + '.woff2'), path.join(www, 'assets/fonts', file + '.woff2'));
  css += `@font-face{font-family:"${file}";src:url("fonts/${file}.woff2") format("woff2");font-weight:normal;font-style:normal;font-display:block}\n`;
  css += style.match(new RegExp(`\\.${reEsc(cls)}\\s*{[\\s\\S]*?}`))[0] + '\n';
  if (w === 'duotone') {
    const extra = style.match(/\.ph-duotone:before\s*{[^}]*}/); if (extra) css += extra[0] + '\n';
    const extra2 = style.match(/\.ph-duotone:after\s*{[^}]*}/); if (extra2) css += extra2[0] + '\n';
  }
  const re = new RegExp(`\\.${reEsc(cls)}\\.ph-([a-z0-9-]+):(before|after)\\s*{[^}]*}`, 'g');
  for (const r of style.matchAll(re)) if (used.has(r[1])) css += r[0] + '\n';
}
fs.writeFileSync(path.join(www, 'assets/icons.css'), css);
console.log('icons used:', used.size);

// 3) آیکون اپ (لوگوی M داخل گوشی)
const logo = full => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#10b981"/><stop offset=".5" stop-color="#0ea5e9"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs>
  <rect width="512" height="512" rx="${full ? 0 : 112}" fill="url(#g)"/>
  <g transform="translate(256 256) scale(${full ? 0.62 : 0.8}) translate(-256 -256)">
    <rect x="166" y="86" width="180" height="340" rx="38" fill="none" stroke="#fff" stroke-width="26"/>
    <rect x="226" y="112" width="60" height="14" rx="7" fill="#fff"/>
    <path d="M206 330 V230 L256 290 L306 230 V330" fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  </g></svg>`;
for (const s of [192, 512]) await sharp(Buffer.from(logo(false))).resize(s, s).png().toFile(path.join(www, `icons/icon-${s}.png`));
await sharp(Buffer.from(logo(true))).resize(512, 512).png().toFile(path.join(www, 'icons/maskable-512.png'));
// منابع آیکون اندروید (برای @capacitor/assets)
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
await sharp(Buffer.from(logo(true))).resize(1024, 1024).png().toFile(path.join(root, 'assets/icon-only.png'));
await sharp(Buffer.from(logo(true))).resize(1024, 1024).png().toFile(path.join(root, 'assets/icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#0ea5e9' } }).png().toFile(path.join(root, 'assets/icon-background.png'));
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#060911' } })
  .composite([{ input: await sharp(Buffer.from(logo(false))).resize(560, 560).png().toBuffer(), gravity: 'center' }])
  .png().toFile(path.join(root, 'assets/splash.png'));

// 4) Tailwind
execSync('npx tailwindcss -c tailwind.config.js -i src/app.css -o www/assets/app.css --minify', { cwd: root, stdio: 'inherit' });
console.log('build done');
