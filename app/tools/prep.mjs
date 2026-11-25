// 앱 껍데기 만들기: node tools/prep.mjs ios|android
// 네이티브 폴더(ios/, android/)는 저장소에 두지 않고 매번 새로 만든다.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const plat = process.argv[2];
if (!['ios', 'android'].includes(plat)) { console.error('ios 또는 android'); process.exit(1); }
const sh = c => execSync(c, { stdio: 'inherit' });
const BUNDLE = process.env.BUNDLE_ID || 'com.divinegenesis.rumble';

// 번들 ID 는 환경값으로 바꿀 수 있게
const cfgPath = 'capacitor.config.json';
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
cfg.appId = BUNDLE;
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

fs.rmSync(plat, { recursive: true, force: true });
sh(`npx cap add ${plat}`);
sh(`npx capacitor-assets generate --${plat} --iconBackgroundColor '#05070f' --splashBackgroundColor '#05070f'`);

if (plat === 'ios') {
  // 세로 고정 · 상태바 숨김 · 암호화 신고 생략
  const p = 'ios/App/App/Info.plist';
  let s = fs.readFileSync(p, 'utf8');
  const arr = k => new RegExp(`<key>${k}</key>\\s*<array>[\\s\\S]*?</array>`);
  const portrait = k => `<key>${k}</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>`;
  for (const k of ['UISupportedInterfaceOrientations', 'UISupportedInterfaceOrientations~ipad'])
    s = arr(k).test(s) ? s.replace(arr(k), portrait(k)) : s;
  const add = x => { s = s.replace(/<\/dict>\s*<\/plist>\s*$/, x + '\n</dict>\n</plist>\n'); };
  s = s.replace(/(<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*)<true\/>/, '$1<false/>');
  if (!s.includes('UIStatusBarHidden')) add('\t<key>UIStatusBarHidden</key>\n\t<true/>');
  if (!s.includes('UIRequiresFullScreen')) add('\t<key>UIRequiresFullScreen</key>\n\t<true/>');
  if (!s.includes('ITSAppUsesNonExemptEncryption')) add('\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>');
  fs.writeFileSync(p, s);
} else {
  const p = 'android/app/src/main/AndroidManifest.xml';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('screenOrientation')) s = s.replace('<activity', '<activity\n            android:screenOrientation="portrait"');
  fs.writeFileSync(p, s);
}
sh(`npx cap sync ${plat}`);
console.log('준비 끝:', plat, BUNDLE);
