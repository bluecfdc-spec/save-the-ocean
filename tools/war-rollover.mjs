// ============================================================================
//  바다 점령전 월간 마감 (자동화)
//  - 지난달 세 세력의 누적 점수(scores_sYYYYMM1·2·3)를 읽어 우승 세력을 정하고
//    war-seasons.js 의 WAR_SEASONS_DATA 에 기록 → 게임의 "명예의 전당"에 표시
//  - 새 달의 점령전은 게임이 날짜로 알아서 새 게시판을 쓰므로 따로 넘길 것은 없음
//
//  실행: node tools/war-rollover.mjs            (한국 시간 1일에만 동작, 지난달을 마감)
//        node tools/war-rollover.mjs --force    (날짜와 상관없이 지난달을 마감)
//        node tools/war-rollover.mjs --month=202610   (특정 달을 마감)
//  Firestore 읽기는 공개 규칙(allow read)이라 인증이 필요 없습니다.
// ============================================================================
import fs from 'node:fs';
import vm from 'node:vm';

const PROJECT = 'save-the-ocean-a96f1';
const BASE = 30000;                       // 게임(index.html 의 WAR_BASE)과 같은 값: 세력별 기본 점수
const FILE = new URL('../war-seasons.js', import.meta.url);
const force = process.argv.includes('--force');
const monthArg = (process.argv.find(a => a.startsWith('--month=')) || '').slice(8);

const kst = new Date(Date.now() + 9 * 3600 * 1000);
if (!force && !monthArg && kst.getUTCDate() !== 1) { console.log(`오늘은 ${kst.getUTCDate()}일(KST) — 1일이 아니라 건너뜀.`); process.exit(0); }
// 마감할 달 = 지난달
const prev = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1));
const key = monthArg || `${prev.getUTCFullYear()}${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
if (!/^\d{6}$/.test(key)) { console.error('달 형식은 YYYYMM'); process.exit(1); }
const ym = key.slice(0, 4) + '.' + key.slice(4);

const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runAggregationQuery`;
async function total(f) {
  const body = { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: `scores_s${key}${f}` }] }, aggregations: [{ alias: 'total', sum: { field: { fieldPath: 'score' } } }, { alias: 'n', count: {} }] } };
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { console.error('Firestore 조회 실패', res.status, await res.text()); process.exit(1); }
  const g = ((await res.json())[0] || {}).result?.aggregateFields || {};
  const num = v => v ? Number(v.integerValue || v.doubleValue || 0) : 0;
  return { f, total: num(g.total), n: num(g.n) };
}
const rows = await Promise.all([1, 2, 3].map(total));
console.log(`${ym} 점령전:`, rows.map(r => `세력${r.f} ${r.total}점(${r.n}회)`).join(', '));

const sum = rows.reduce((a, r) => a + r.total + BASE, 0);
const top = Math.max(...rows.map(r => r.total));
const winners = rows.filter(r => r.total === top);
// 아무도 점수를 올리지 않았거나 공동 1위면 우승 세력 없음(f: 0)
const win = top > 0 && winners.length === 1 ? winners[0] : null;
const entry = { ym, f: win ? win.f : 0, pct: win ? Math.round((win.total + BASE) / sum * 100) : 0, totals: rows.map(r => r.total) };

let data = [];
if (fs.existsSync(FILE)) { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(FILE, 'utf8'), ctx); data = ctx.window.WAR_SEASONS_DATA || []; }
data = [...data.filter(d => d.ym !== ym), entry].sort((a, b) => a.ym.localeCompare(b.ym));

fs.writeFileSync(FILE, `// ============================================================================
//  바다 점령전 지난 시즌 결과 — GitHub Actions(.github/workflows/war-season.yml)가
//  매달 1일 00:10(KST)에 tools/war-rollover.mjs 로 자동 갱신합니다. 손으로 고쳐도 됩니다.
// ============================================================================
//  ym: 시즌(연.월) · f: 우승 세력(1 서지, 2 게일, 3 솔라, 0 없음) · pct: 우승 세력 점유율 · totals: 세력별 누적 점수
window.WAR_SEASONS_DATA = ${JSON.stringify(data, null, 2)};
`);
console.log(`→ ${ym} 우승: ${win ? '세력' + win.f + ' (' + entry.pct + '%)' : '없음'}. war-seasons.js 갱신 완료.`);
