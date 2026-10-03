// ============================================================================
//  시즌 넘기기 (주간 자동화)
//  - 현재 시즌(SEASON_SUFFIX) 게시판에서 1위를 읽어 SEASONS_DATA 에 박제
//  - 접미사를 다음 번호로 올려 새 게시판(scores_sN, plays_sN)으로 갈아탐
//  - season.js 를 다시 써서 커밋하면 GitHub Pages 가 자동 배포
//
//  실행: node tools/rollover.mjs            (5일 미만 된 시즌은 건너뜀)
//        node tools/rollover.mjs --force    (무조건 넘김)
//  Firestore 읽기는 공개 규칙(allow read)이라 인증이 필요 없습니다.
// ============================================================================
import fs from 'node:fs';
import vm from 'node:vm';

const PROJECT = 'save-the-ocean-a96f1';
const FILE = new URL('../season.js', import.meta.url);
const force = process.argv.includes('--force');
const MIN_DAYS = 5;

// ---- season.js 읽기 (브라우저용 파일이라 window 흉내) ----
const src = fs.readFileSync(FILE, 'utf8');
const ctx = { window: {} }; vm.runInNewContext(src, ctx);
const { SEASON_SUFFIX = '', SEASON_START = '', SEASONS_DATA = [] } = ctx.window;
const curN = Number((SEASON_SUFFIX.match(/_s(\d+)/) || [, 1])[1]);

// ---- KST 날짜 ----
const kst = d => new Date(d.getTime() + 9 * 3600 * 1000);
const now = kst(new Date());
const today = now.toISOString().slice(0, 10);
const yesterday = kst(new Date(Date.now() - 86400000)).toISOString().slice(0, 10);
const mmdd = s => s.slice(5).replace('-', '.');

if (!force && SEASON_START) {
  const days = (new Date(today) - new Date(SEASON_START)) / 86400000;
  if (days < MIN_DAYS) { console.log(`시즌 ${curN}은 ${days}일밖에 안 됐습니다 (최소 ${MIN_DAYS}일). 건너뜀.`); process.exit(0); }
}

// ---- 현재 시즌 1위 조회 ----
const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
const body = { structuredQuery: { from: [{ collectionId: 'scores' + SEASON_SUFFIX }], orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }], limit: 1 } };
const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
if (!res.ok) { console.error('Firestore 조회 실패', res.status, await res.text()); process.exit(1); }
const rows = (await res.json()).filter(r => r.document);
let winner = null;
if (rows.length) {
  const f = rows[0].document.fields;
  winner = { name: f.name?.stringValue || '익명', score: Number(f.score?.integerValue || f.score?.doubleValue || 0), date: f.date?.stringValue || '' };
}
console.log(`시즌 ${curN} 1위:`, winner ? `${winner.name} ${winner.score}점` : '기록 없음');

// ---- 박제 + 다음 시즌 ----
const entry = { n: curN, range: `${mmdd(SEASON_START || today)} ~ ${mmdd(yesterday)}`, name: winner ? winner.name : '', score: winner ? winner.score : 0 };
const data = [...SEASONS_DATA.filter(s => s.n !== curN), entry];
const nextN = curN + 1;

const out = `// ============================================================================
//  시즌 상태 — 이 파일은 GitHub Actions(.github/workflows/season.yml)가
//  매주 월요일 00:00(KST)에 tools/rollover.mjs 로 자동 갱신합니다. 손으로 고쳐도 됩니다.
// ============================================================================
//  SEASON_SUFFIX : 지금 점수가 쌓이는 게시판 접미사 (scores_s1, plays_s1 ...)
//  SEASON_START  : 현재 시즌 시작일 (YYYY-MM-DD)
//  SEASONS_DATA  : 끝난 시즌 1위 목록 (오래된 순). 시작 화면 "👑 시즌 1위"에 표시
window.SEASON_SUFFIX = "_s${nextN}";
window.SEASON_START = "${today}";
window.SEASONS_DATA = ${JSON.stringify(data, null, 2).replace(/^/gm, '').replace(/\n/g, '\n')};
`;
fs.writeFileSync(FILE, out);
console.log(`→ 시즌 ${nextN} 시작 (${today}). season.js 갱신 완료.`);
