// 새 버전(시험용) 순위판 — 국기 · 세력 · 바다 점령전
//  · 주간 개인 순위 : scores_s9NNN / plays_s9NNN   (NNN = 현재 주간 시즌 번호, 시험용 게시판)
//  · 월간 점령전    : scores_s9YYYYMMF              (F = 세력 1·2·3, 올린 점수 전부 누적)
//  운영 중인 게시판(scores_sN)과 완전히 분리되어 있습니다.
(function () {
  const LB = {};
  const CFG = window.STO_CONFIG || {};
  const LOCAL_KEY = 'savetheocean_best';
  const P = 'savetheocean_next_';
  const weekN = Number(((window.SEASON_SUFFIX || '').match(/_s(\d+)/) || [, 1])[1]);
  const SUFFIX = '_s9' + String(weekN).padStart(3, '0');
  let db = null;

  LB.ready = false;
  try {
    const cfg = window.FIREBASE_CONFIG || {};
    if (cfg.apiKey && cfg.projectId && window.firebase) {
      firebase.initializeApp(cfg);
      db = firebase.firestore();
      try { db.settings({ experimentalAutoDetectLongPolling: true, useFetchStreams: false, merge: true }); } catch (e) {}
      LB.ready = true;
    }
  } catch (e) { console.warn('Firebase init failed', e); }

  const SCORES = 'scores' + SUFFIX;
  const PLAYS = 'plays' + SUFFIX;
  const timeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  const z = n => String(n).padStart(2, '0');

  LB.formatToday = function () { const d = new Date(); return d.getFullYear() + '.' + z(d.getMonth() + 1) + '.' + z(d.getDate()); };
  const isoToday = () => { const d = new Date(); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
  // 점령전 시즌 = 한국 시간 기준 달
  LB.warMonth = function () { const k = new Date(Date.now() + 9 * 3600 * 1000); return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, key: '' + k.getUTCFullYear() + z(k.getUTCMonth() + 1) }; };
  const warCol = f => 'scores_s9' + LB.warMonth().key + f;

  LB.localBest = function () { return Number(localStorage.getItem(LOCAL_KEY) || 0); };
  LB.saveLocal = function (score) { if (score > LB.localBest()) localStorage.setItem(LOCAL_KEY, String(score)); };

  // ---- 프로필 (아이디 · 국기 · 세력) : 로그인 도입 전까지는 이 기기에 저장 ----
  LB.profile = function () { try { const p = JSON.parse(localStorage.getItem(P + 'profile') || 'null'); return p && p.name && p.flag && p.faction ? p : null; } catch (e) { return null; } };
  LB.saveProfile = function (p) {
    const old = LB.profile() || {};
    const out = { name: String(p.name).trim().slice(0, 8), flag: p.flag, faction: p.faction, uid: old.uid || (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)), fmonth: old.faction === p.faction && old.fmonth ? old.fmonth : LB.warMonth().key };
    localStorage.setItem(P + 'profile', JSON.stringify(out)); return out;
  };
  // 세력은 한 시즌(한 달) 동안 고정
  LB.factionLocked = function () { const p = LB.profile(); return !!(p && p.fmonth === LB.warMonth().key && localStorage.getItem(P + 'warsub') === p.fmonth); };

  // ---- 무료 등록 횟수 ----
  LB.submitCount = function () { return Number(localStorage.getItem(P + 'submits') || 0); };
  LB.freeLeft = function () { return CFG.OPEN_UNLIMITED ? Infinity : Math.max(0, (CFG.FREE_SUBMITS || 3) - LB.submitCount()); };

  function weekBest() { try { const w = JSON.parse(localStorage.getItem(P + 'week') || 'null'); return w && w.s === SUFFIX ? w.score : -1; } catch (e) { return -1; } }

  // 상위 N명 (한 사람은 최고 기록 하나만 보이게)
  LB.top = async function (n) {
    if (!LB.ready) return null;
    try {
      const snap = await timeout(db.collection(SCORES).orderBy('score', 'desc').limit(Math.min(n * 4, 60)).get(), 15000);
      if (!snap) return null;
      const rows = [], seen = {};
      snap.forEach(d => {
        const v = d.data(); const k = v.uid || d.id;
        if (seen[k] || rows.length >= n) return; seen[k] = 1;
        rows.push({ id: d.id, uid: v.uid || '', name: v.name || t('anon'), score: v.score | 0, date: v.date || '', flag: v.flag || '', faction: v.faction | 0 });
      });
      return rows;
    } catch (e) { console.warn('top failed', e); return null; }
  };

  LB.rank = async function (score) {
    if (!LB.ready) return null;
    try {
      const c = col => timeout(db.collection(col).where('score', '>', score).count().get().then(s => s.data().count), 15000);
      const [a, b] = await Promise.all([c(SCORES), c(PLAYS)]);
      if (a === null) return null;
      return a + (b === null ? 0 : b) + 1;
    } catch (e) { console.warn('rank failed', e); return null; }
  };

  // 기록 올리기: 세력 점수에는 항상 누적, 개인 순위에는 이번 주 내 최고 기록일 때만
  LB.submit = async function (score, date) {
    const p = LB.profile(); score = Number(score) | 0;
    if (!p) return { ok: false, reason: 'no-profile' };
    if (!LB.ready) return { ok: false, reason: 'not-configured' };
    if (score <= 0) return { ok: false, reason: 'zero' };
    if (LB.freeLeft() <= 0) return { ok: false, reason: 'limit' };
    try {
      const base = { name: p.name, score, date, flag: p.flag, faction: p.faction, uid: p.uid };
      const jobs = [db.collection(warCol(p.faction)).add(base)];
      const best = score > weekBest();
      if (best) jobs.push(db.collection(SCORES).add(base));
      const r = await timeout(Promise.all(jobs).then(() => true), 15000);
      if (!r) return { ok: false, reason: 'timeout' };
      localStorage.setItem(P + 'submits', String(LB.submitCount() + 1));
      localStorage.setItem(P + 'warsub', LB.warMonth().key);
      if (best) localStorage.setItem(P + 'week', JSON.stringify({ s: SUFFIX, score }));
      return { ok: true, best };
    } catch (e) { console.warn('submit failed', e); return { ok: false, reason: e && e.code || 'error' }; }
  };

  LB.recordPlay = function (score, date) {
    if (!LB.ready) return;
    try { db.collection(PLAYS).add({ score: Number(score) | 0, date }).catch(() => {}); } catch (e) {}
  };

  // 세력별 이번 달 누적 점수 → [{f, total, n}] 또는 null
  LB.warTotals = async function () {
    const cfg = window.FIREBASE_CONFIG || {};
    if (!cfg.projectId) return null;
    const url = 'https://firestore.googleapis.com/v1/projects/' + cfg.projectId + '/databases/(default)/documents:runAggregationQuery';
    const one = async f => {
      const body = { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: warCol(f) }] }, aggregations: [{ alias: 'total', sum: { field: { fieldPath: 'score' } } }, { alias: 'n', count: {} }] } };
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('war ' + res.status);
      const a = ((await res.json())[0] || {}).result; const g = a && a.aggregateFields || {};
      const num = v => v ? Number(v.integerValue || v.doubleValue || 0) : 0;
      return { f, total: num(g.total), n: num(g.n) };
    };
    try { return await timeout(Promise.all([1, 2, 3].map(one)), 15000); } catch (e) { console.warn('war failed', e); return null; }
  };

  LB.visit = async function () {
    if (!LB.ready) return null;
    try {
      const tRef = db.collection('visits').doc('total'), dRef = db.collection('visits').doc(isoToday());
      const [a, d] = await timeout(Promise.all([tRef.get(), dRef.get()]), 10000) || [];
      return a ? { total: (a.exists && a.data().count) | 0, today: (d.exists && d.data().count) | 0 } : null;
    } catch (e) { return null; }
  };
  LB.notice = async function () { return null; };   // 시험 주소에서는 공지 팝업 없음

  LB.fmtCount = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
  LB.escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  LB.renderList = function (el, rows) {
    if (rows === null) { el.innerHTML = '<div class="note">' + (LB.ready ? t('lb.fail') : t('lb.notset')) + '</div>'; return; }
    if (!rows.length) { el.innerHTML = '<div class="note">' + t('lb.empty') + '</div>'; return; }
    const me = (LB.profile() || {}).uid;
    el.innerHTML = '<ul class="lb">' + rows.map((r, i) => {
      const fc = window.WAR && WAR.byId(r.faction);
      return '<li' + (me && r.uid === me ? ' class="me"' : '') + '><span class="lb-rank">' + t('lb.rank', { n: i + 1 }) + '</span><span class="lb-name">' + (fc ? '<i class="fdot" style="background:' + fc.color + '"></i>' : '') + (window.WAR ? WAR.flagEmoji(r.flag) + ' ' : '') + LB.escape(r.name) + '</span><span class="lb-score">' + t('lb.pts', { n: I18N.num(r.score) }) + '</span><span class="lb-date">' + LB.escape(r.date.slice(5)) + '</span></li>';
    }).join('') + '</ul>';
  };

  LB.renderSeasons = function (el) {
    const list = (window.SEASONS_DATA || []).slice().reverse();
    if (!list.length) { el.innerHTML = '<div class="note">' + t('lb.season.first') + '</div>'; return; }
    el.innerHTML = '<ul class="lb seasons">' + list.map(s =>
      '<li><span class="lb-rank">' + t('lb.season', { n: s.n }) + '</span><span class="lb-date">' + LB.escape(s.range || '') + '</span><span class="lb-name">' + (s.name ? '👑 ' + LB.escape(s.name) : t('lb.season.none')) + '</span><span class="lb-score">' + (s.score ? I18N.num(s.score) : '') + '</span></li>'
    ).join('') + '</ul>';
  };

  window.LB = LB;
})();
