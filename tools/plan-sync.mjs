// ============================================================================
//  제네시스 일정표(plan/) — Claude 가 채팅에서 받은 "끝났어" 를 Firestore 에 반영
//  - ops/plan/*.json 파일(작업 목록)을 읽어 genesis_tasks 컬렉션에 적용한 뒤 파일을 지운다.
//  - 파일 형식: [{ "op": "update"|"set"|"delete", "id": "t12", "data": { "done": true } }]
//  - 관리자 키는 GitHub 시크릿 FIREBASE_SA(서비스 계정 JSON)에만 있다. 채팅·코드에 쓰지 않는다.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SA;
if (!raw) { console.error('FIREBASE_SA 시크릿이 없습니다. 반영을 건너뜁니다.'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();
const COL = 'genesis_tasks';
const DIR = 'ops/plan';
const KEEP = ['date', 'order', 'who', 'cat', 'title', 'detail', 'time', 'cost', 'done', 'doneAt', 'doneByName', 'memo'];

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort() : [];
let applied = 0;
for (const f of files) {
  const p = path.join(DIR, f);
  const ops = JSON.parse(fs.readFileSync(p, 'utf8'));
  const batch = db.batch();
  for (const o of ops) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(o.id || '')) continue;
    const ref = db.collection(COL).doc(o.id);
    const data = {};
    for (const k of KEEP) if (o.data && k in o.data) data[k] = o.data[k];
    if (o.op === 'delete') batch.delete(ref);
    else if (o.op === 'set') batch.set(ref, data);
    else batch.set(ref, data, { merge: true });
    applied++;
  }
  await batch.commit();
  fs.unlinkSync(p);
  console.log(`${f}: ${ops.length}건 반영`);
}
console.log(`총 ${applied}건 반영`);
