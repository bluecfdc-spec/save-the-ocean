// ============================================================================
//  가계부 숫자 → Firestore (genesis_tasks/budget_data) 반영
//  - 가계부 숫자는 공개 저장소에 평문으로 두지 않는다. 로그인한 홍균·시뇽만 Firestore 에서 읽는다.
//  - Claude 가 갱신할 때: 가계부 JSON 을 ops/budget/pubkey.pem(공개키)로 암호화해
//    ops/budget/<이름>.enc 로 올리면, 이 스크립트가 풀어서 Firestore 에 넣고 파일을 지운다.
//      .enc 형식(JSON): { k: RSA-OAEP(SHA-256)로 감싼 AES 키, iv, tag, ct }  — 모두 base64, 본문은 AES-256-GCM
//  - 푸는 열쇠는 GitHub 시크릿 FIREBASE_SA(서비스 계정 개인키)에만 있다. 채팅·코드에 쓰지 않는다.
//  - 로그에는 금액을 절대 찍지 않는다(Actions 로그도 공개라서).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SA;
if (!raw) { console.error('FIREBASE_SA 시크릿이 없습니다. 반영을 건너뜁니다.'); process.exit(1); }
const sa = JSON.parse(raw);
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const ref = db.collection('genesis_tasks').doc('budget_data');
const DIR = 'ops/budget';
const LEGACY = 'plan/budget.json';   // 옛 평문 파일 — 한 번 옮기고 나면 저장소에서 지운다

function valid(text) {
  const d = JSON.parse(text);
  if (!d || typeof d !== 'object' || !d.assets || !Array.isArray(d.months) || !d.months.length) throw new Error('가계부 형식이 아닙니다');
  return d;
}
async function put(text, from) {
  const d = valid(text);
  await ref.set({ kind: 'budget_data', json: JSON.stringify(d), updated: String(d.updated || ''), at: Date.now() });
  console.log(`${from}: 반영 완료 (${d.months.length}개월치, 기준일 ${d.updated || '-'})`);
}
function decrypt(file) {
  const e = JSON.parse(fs.readFileSync(file, 'utf8'));
  const b = s => Buffer.from(s, 'base64');
  const key = crypto.privateDecrypt({ key: sa.private_key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, b(e.k));
  const dec = crypto.createDecipheriv('aes-256-gcm', key, b(e.iv));
  dec.setAuthTag(b(e.tag));
  return Buffer.concat([dec.update(b(e.ct)), dec.final()]).toString('utf8');
}

fs.mkdirSync(DIR, { recursive: true });
// 암호화에 쓰는 공개키(공개해도 되는 값)를 항상 최신으로 둔다
const pub = crypto.createPublicKey(sa.private_key).export({ type: 'spki', format: 'pem' });
fs.writeFileSync(path.join(DIR, 'pubkey.pem'), pub);

const encs = fs.readdirSync(DIR).filter(f => f.endsWith('.enc')).sort();
for (const f of encs) {
  const p = path.join(DIR, f);
  await put(decrypt(p), f);
  fs.unlinkSync(p);
}
// 옛 평문 파일이 아직 있고, 새로 받은 암호화 파일이 없을 때만 한 번 옮긴다
if (!encs.length && fs.existsSync(LEGACY)) await put(fs.readFileSync(LEGACY, 'utf8'), '옛 파일');
for (const f of fs.readdirSync(DIR)) if (f.endsWith('.flag')) fs.unlinkSync(path.join(DIR, f));

// 확인: 다시 읽어서 들어갔는지 본다(금액은 찍지 않음)
const back = await ref.get();
if (!back.exists) { console.error('Firestore 에 가계부 문서가 없습니다.'); process.exit(1); }
const chk = valid(back.data().json);
console.log(`확인: Firestore 에 ${chk.months.length}개월치 저장됨, 글자 수 ${back.data().json.length}`);
