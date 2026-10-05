// node_modules 에서 앱에 내장할 파일을 www/vendor 로 복사 (Firebase compat SDK, Orbitron 폰트)
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { join } from 'node:path';
const out = 'www/vendor', fonts = join(out, 'fonts');
mkdirSync(fonts, { recursive: true });
// Firebase 는 최신 문법(?. ?? 등)을 써서 오래된 WebView(Chrome 79 이하)에서 읽지 못함 → es2017 로 낮춰서 내장
for (const f of ['firebase-app-compat.js', 'firebase-firestore-compat.js'])
  writeFileSync(join(out, f), transformSync(readFileSync(join('node_modules/firebase', f), 'utf8'), { target: 'es2017', minify: true, legalComments: 'none' }).code);
const src = 'node_modules/@fontsource/orbitron/files';
const css = [];
for (const w of [600, 800]) {
  const file = readdirSync(src).find(n => n.includes(`latin-${w}-normal`) && n.endsWith('.woff2'));
  copyFileSync(join(src, file), join(fonts, file));
  css.push(`@font-face{font-family:'Orbitron';font-style:normal;font-weight:${w};font-display:swap;src:url(${file}) format('woff2');}`);
}
writeFileSync(join(fonts, 'orbitron.css'), css.join('\n') + '\n');
// 국기 그림 (프로필·순위판) — war.js 의 FLAGS 와 같은 목록
const flags = join(out, 'flags'); mkdirSync(flags, { recursive: true });
for (const c of ['kr', 'jp', 'us', 'gb', 'ca', 'au', 'de', 'fr', 'it', 'es', 'br', 'in'])
  copyFileSync(join('node_modules/flag-icons/flags/4x3', c + '.svg'), join(flags, c + '.svg'));
console.log('vendor ok');
