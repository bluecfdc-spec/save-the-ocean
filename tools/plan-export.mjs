// ============================================================================
//  제네시스 일정표(plan/) — 공개용 진행 현황 내보내기 (읽기 전용)
//  - genesis_tasks 를 읽어 ops/plan-status.json 에 "날짜·할 일·담당·분류·시간·비용·완료" 만 저장.
//  - 메모(memo)·상세(detail)·체크한 사람 이름(doneByName)은 넣지 않는다(저장소가 공개라서).
//  - 같은 컬렉션의 가계부·개발경비(kind: money·dev)는 통째로 뺀다.
//  - 목요일 브리핑이 로그인 없이 이 파일로 완료·밀림을 확인한다.
//  - 관리자 키는 GitHub 시크릿 FIREBASE_SA 에만 있다. Firestore 에는 아무것도 쓰지 않는다.
// ============================================================================
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SA;
if (!raw) { console.error('FIREBASE_SA 시크릿이 없습니다.'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const PUBLIC = ['date', 'order', 'who', 'cat', 'title', 'time', 'cost', 'done', 'doneAt'];
const snap = await db.collection('genesis_tasks').get();
// kind 가 있는 문서(가계부·개발경비)는 절대 내보내지 않는다 — 일정만.
const tasks = snap.docs.filter(d => !d.data().kind).map(d => {
  const src = d.data(), t = { id: d.id };
  for (const k of PUBLIC) if (k in src) t[k] = src[k];
  if (t.who === '아내') t.who = '시뇽';
  t.done = !!t.done;
  return t;
}).sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.order ?? 0) - (b.order ?? 0));

const out = { note: '제네시스 일정표 공개 사본(메모 제외). 매일 자동 갱신.', count: tasks.length,
  done: tasks.filter(t => t.done).length, tasks };
fs.mkdirSync('ops', { recursive: true });
fs.writeFileSync('ops/plan-status.json', JSON.stringify(out, null, 1) + '\n');
console.log(`${tasks.length}건 내보냄 (완료 ${out.done})`);
