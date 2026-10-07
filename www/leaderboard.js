// 순위판 (웹 · 앱 공용) — 국기 · 세력 · 바다 점령전
//  · 주간 개인 순위 : scores_sN / plays_sN   (N = 주간 시즌 번호, 매주 월요일 00:00 KST 에 +1)
//  · 월간 점령전    : scores_sYYYYMMF        (F = 세력 1·2·3, 올린 점수 전부 누적)
//  웹과 앱이 같은 게시판을 씁니다.
(function () {
  const LB = {};
  const CFG = window.STO_CONFIG || {};
  const LOCAL_KEY = 'savetheocean_best';
  const P = 'savetheocean_next_';
  // 주간 시즌 번호는 날짜로 계산 (시즌 1 = 2026-09-28 월요일 00:00 KST 시작). 웹·앱이 같은 순간에 넘어간다.
  const weekN = Math.max(1, Math.floor((Date.now() - Date.UTC(2026, 8, 27, 15)) / (7 * 86400000)) + 1);
  const SUFFIX = '_s' + weekN;
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
  const COOLDOWN_SEC = 20;   // 한 계정의 연속 등록 최소 간격(초) — firestore.rules 와 같은 값
  const timeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  const z = n => String(n).padStart(2, '0');

  LB.formatToday = function () { const d = new Date(); return d.getFullYear() + '.' + z(d.getMonth() + 1) + '.' + z(d.getDate()); };
  const isoToday = () => { const d = new Date(); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
  // 점령전 시즌 = 한국 시간 기준 달
  LB.warMonth = function () { const k = new Date(Date.now() + 9 * 3600 * 1000); return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, key: '' + k.getUTCFullYear() + z(k.getUTCMonth() + 1) }; };
  const warCol = f => 'scores_s' + LB.warMonth().key + f;

  LB.localBest = function () { return Number(localStorage.getItem(LOCAL_KEY) || 0); };
  LB.saveLocal = function (score) { if (score > LB.localBest()) localStorage.setItem(LOCAL_KEY, String(score)); };

  // ---- 프로필 (아이디 · 국기 · 세력) : 로그인 도입 전까지는 이 기기에 저장 ----
  LB.profile = function () { try { const p = JSON.parse(localStorage.getItem(P + 'profile') || 'null'); return p && p.name && p.flag && p.faction ? p : null; } catch (e) { return null; } };
  LB.saveProfile = function (p) {
    const old = LB.profile() || {};
    const out = { name: String(p.name).trim().slice(0, 8), flag: p.flag, faction: p.faction, uid: authUid() || old.uid || (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)), fmonth: old.faction === p.faction && old.fmonth ? old.fmonth : LB.warMonth().key };
    localStorage.setItem(P + 'profile', JSON.stringify(out)); return out;
  };
  // 로그인한 계정이 있으면 그 계정의 uid 를 이 기기의 프로필에 묶는다 (앱)
  const authUid = () => { try { return (window.AUTH && AUTH.user() && AUTH.user().uid) || ''; } catch (e) { return ''; } };
  LB.bindUser = function () { const u = authUid(), p = LB.profile(); if (u && p && p.uid !== u) { p.uid = u; localStorage.setItem(P + 'profile', JSON.stringify(p)); } };
  LB.clearLocal = function () { ['profile', 'submits', 'warsub', 'week'].forEach(k => localStorage.removeItem(P + k)); };
  // 세력은 한 시즌(한 달) 동안 고정
  LB.factionLocked = function () { const p = LB.profile(); return !!(p && p.fmonth === LB.warMonth().key && localStorage.getItem(P + 'warsub') === p.fmonth); };

  // ---- 무료 등록 횟수 ----
  LB.submitCount = function () { return Number(localStorage.getItem(P + 'submits') || 0); };
  LB.freeLeft = function () { return CFG.OPEN_UNLIMITED ? Infinity : Math.max(0, (CFG.FREE_SUBMITS || 3) - LB.submitCount()); };

  function weekBest() { try { const w = JSON.parse(localStorage.getItem(P + 'week') || 'null'); return w && w.s === SUFFIX ? w.score : -1; } catch (e) { return -1; } }

  // ── 읽기 절약: 순위판과 점령전 합계는 한 번 불러오면 몇 분 동안 이 기기에 기억해 두고 다시 쓴다 ──
  //  · 기억하는 시간(분): 공지 문서(visits/notice…)의 cacheMin 값 → 없으면 STO_CONFIG.CACHE_MIN → 없으면 10분
  const ttlMs = () => { const v = Number(localStorage.getItem(P + 'ttl')) || Number((window.STO_CONFIG || {}).CACHE_MIN) || 10; return Math.max(1, Math.min(v, 240)) * 60000; };
  const cget = k => { try { const c = JSON.parse(localStorage.getItem(P + 'c_' + k) || 'null'); return c && Date.now() - c.t < ttlMs() && Date.now() >= c.t ? c.v : null; } catch (e) { return null; } };
  const cset = (k, v, keepTime) => { try { let t0 = Date.now(); if (keepTime) { const c = JSON.parse(localStorage.getItem(P + 'c_' + k) || 'null'); if (c) t0 = c.t; } localStorage.setItem(P + 'c_' + k, JSON.stringify({ t: t0, v })); } catch (e) {} };
  const BOARD_DOCS = 40;   // 순위판 한 번 불러올 때 읽는 문서 수 (읽기 1회 = 1건)
  let boardJob = null;
  // 이번 주 순위판 (한 사람은 최고 기록 하나만) → { rows, full }  full = 불러온 것보다 기록이 더 있을 수 있음
  function board() {
    const c = cget('board' + SUFFIX); if (c) return Promise.resolve(c);
    if (boardJob) return boardJob;
    boardJob = (async () => {
      try {
        const snap = await timeout(db.collection(SCORES).orderBy('score', 'desc').limit(BOARD_DOCS).get(), 15000);
        if (!snap) return null;
        const rows = [], seen = {}; let docs = 0;
        snap.forEach(d => {
          docs++; const v = d.data(); const k = v.uid || d.id;
          if (seen[k]) return; seen[k] = 1;
          rows.push({ id: d.id, uid: v.uid || '', name: v.name || t('anon'), score: v.score | 0, date: v.date || '', flag: v.flag || '', faction: v.faction | 0 });
        });
        const b = { rows, full: docs >= BOARD_DOCS }; cset('board' + SUFFIX, b); return b;
      } catch (e) { console.warn('top failed', e); return null; }
      finally { boardJob = null; }
    })();
    return boardJob;
  }
  LB.top = async function (n) { if (!LB.ready) return null; const b = await board(); return b ? b.rows.slice(0, n) : null; };
  // 내 순위: 기억해 둔 순위판에서 계산 (추가로 읽지 않는다). 순위판 밖이면 9999
  LB.rank = async function (score) {
    if (!LB.ready) return null; const b = await board(); if (!b) return null;
    const higher = b.rows.filter(r => r.score > score).length;
    return higher >= b.rows.length && b.full ? 9999 : higher + 1;
  };

  // 기록 올리기: 세력 점수에는 항상 누적, 개인 순위에는 이번 주 내 최고 기록일 때만
  LB.submit = async function (score, date) {
    let p = LB.profile(); score = Number(score) | 0;
    if (!p) return { ok: false, reason: 'no-profile' };
    if (!LB.ready) return { ok: false, reason: 'not-configured' };
    if (score <= 0) return { ok: false, reason: 'zero' };
    if (LB.freeLeft() <= 0) return { ok: false, reason: 'limit' };
    if (window.AUTH && AUTH.required() && !AUTH.user()) return { ok: false, reason: 'login' };
    LB.bindUser(); p = LB.profile();
    if (!authUid()) return { ok: false, reason: 'login' };   // 서버 규칙: 로그인한 계정만 기록을 올릴 수 있다
    // 연속 등록 막기: 한 계정은 COOLDOWN_SEC 초에 한 번만 (서버 규칙도 같은 간격을 검사)
    const lastAt = Number(localStorage.getItem(P + 'lastsub') || 0);
    if (Date.now() - lastAt < COOLDOWN_SEC * 1000) return { ok: false, reason: 'cooldown' };
    try {
      const base = { name: p.name, score, date, flag: p.flag, faction: p.faction, uid: p.uid };
      const best = score > weekBest();
      // 한 묶음(batch)으로 저장: 계정 기록(users/uid 의 마지막 등록 시각) + 점령전 + (주간 최고면) 개인 순위
      const batch = db.batch();
      batch.set(db.collection('users').doc(p.uid), { last: firebase.firestore.FieldValue.serverTimestamp() });
      batch.set(db.collection(warCol(p.faction)).doc(), base);
      if (best) batch.set(db.collection(SCORES).doc(), base);
      const r = await timeout(batch.commit().then(() => true), 15000);
      if (!r) return { ok: false, reason: 'timeout' };
      localStorage.setItem(P + 'lastsub', String(Date.now()));
      localStorage.setItem(P + 'submits', String(LB.submitCount() + 1));
      localStorage.setItem(P + 'warsub', LB.warMonth().key);
      if (best) localStorage.setItem(P + 'week', JSON.stringify({ s: SUFFIX, score }));
      // 기억해 둔 순위판·점령전 합계에 내 기록을 바로 반영 (다시 읽지 않는다)
      try {
        const b = cget('board' + SUFFIX);
        if (b && best) { b.rows = b.rows.filter(r => r.uid !== p.uid); b.rows.push({ id: 'me', uid: p.uid, name: p.name, score, date, flag: p.flag, faction: p.faction }); b.rows.sort((x, y) => y.score - x.score); cset('board' + SUFFIX, b, true); }
        const w = cget('war' + LB.warMonth().key);
        if (w) { w.forEach(x => { if (x.f === p.faction) { x.total += score; x.n += 1; } }); cset('war' + LB.warMonth().key, w, true); }
      } catch (e) {}
      return { ok: true, best };
    } catch (e) { console.warn('submit failed', e); return { ok: false, reason: e && e.code || 'error' }; }
  };

  // 판마다 남기던 통계 기록은 쓰기 사용량을 아끼려고 끔 (게임 오버마다 1건씩 쓰던 것)
  LB.recordPlay = function () {};

  // 세력별 이번 달 누적 점수 → [{f, total, n}] 또는 null
  LB.warTotals = async function () {
    const cfg = window.FIREBASE_CONFIG || {};
    if (!cfg.projectId) return null;
    const wk = 'war' + LB.warMonth().key, wc = cget(wk); if (wc) return wc;
    const url = 'https://firestore.googleapis.com/v1/projects/' + cfg.projectId + '/databases/(default)/documents:runAggregationQuery';
    const one = async f => {
      const body = { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: warCol(f) }] }, aggregations: [{ alias: 'total', sum: { field: { fieldPath: 'score' } } }, { alias: 'n', count: {} }] } };
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('war ' + res.status);
      const a = ((await res.json())[0] || {}).result; const g = a && a.aggregateFields || {};
      const num = v => v ? Number(v.integerValue || v.doubleValue || 0) : 0;
      return { f, total: num(g.total), n: num(g.n) };
    };
    try { const r = await timeout(Promise.all([1, 2, 3].map(one)), 15000); if (r) cset(wk, r); return r; } catch (e) { console.warn('war failed', e); return null; }
  };

  // 방문자 카운트 (페이지 로드마다 1회)
  // 방문자 수: 한 기기에서 하루 한 번만 센다 (쓰기 사용량 절약)
  LB.visit = async function () {
    if (!LB.ready) return null;
    try { if (localStorage.getItem(P + 'visited') === isoToday()) return null; localStorage.setItem(P + 'visited', isoToday()); } catch (e) {}
    try {
      const inc = firebase.firestore.FieldValue.increment(1), key = isoToday();
      const tRef = db.collection('visits').doc('total'), dRef = db.collection('visits').doc(key);
      await timeout(Promise.all([tRef.set({ count: inc }, { merge: true }), dRef.set({ count: inc, date: key }, { merge: true })]), 10000);
      return { ok: true };
    } catch (e) { return null; }
  };
  // 공지: visits/notice 문서 (앱은 visits/notice_app) → 없으면 DEFAULT_NOTICE
  LB.notice = async function () {
    let def = window.DEFAULT_NOTICE || null;
    if (def && window.I18N && def[I18N.lang]) def = Object.assign({}, def, def[I18N.lang]);
    if (!LB.ready) return def;
    try {
      const d = await timeout(db.collection('visits').doc(window.NOTICE_DOC || 'notice').get(), 8000);
      if (d && d.exists) {
        const v = d.data(), L = window.I18N ? I18N.lang : 'ko', sfx = L === 'ko' ? '' : '_' + L;
        try { if (Number(v.cacheMin) > 0) localStorage.setItem(P + 'ttl', String(Number(v.cacheMin))); else localStorage.removeItem(P + 'ttl'); } catch (e) {}
        if ((window.NOTICE_REPLACES || []).indexOf(v.title) >= 0) return def;   // 옛 공지면 기본 공지로 대체
        return { active: !!v.active, title: v['title' + sfx] || v.title || '', body: v['body' + sfx] || v.body || '', button: v['button' + sfx] || v.button || t('notice.ok') };
      }
    } catch (e) {}
    return def;
  };

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

  // 명예의 전당: 주간 1위(자동 기록) + 점령전 우승 세력(월간)
  LB.renderSeasons = function (el) {
    const list = (window.SEASONS_DATA || []).slice().reverse().slice(0, 6), wars = (window.WAR_SEASONS_DATA || []).slice().reverse().slice(0, 3);
    let h = '<div class="hall-h">' + t('hall.week') + '</div>';
    h += list.length ? '<ul class="lb seasons">' + list.map(s =>
      '<li><span class="lb-rank">' + t('lb.season', { n: s.n }) + '</span><span class="lb-date">' + LB.escape(s.range || '') + '</span><span class="lb-name">' + (s.name ? '👑 ' + LB.escape(s.name) : t('lb.season.none')) + '</span><span class="lb-score">' + (s.score ? I18N.num(s.score) : '') + '</span></li>'
    ).join('') + '</ul>' : '<div class="note">' + t('lb.season.first') + '</div>';
    h += '<div class="hall-h">' + t('hall.war') + '</div>';
    h += wars.length ? '<ul class="lb seasons">' + wars.map(w => { const f = window.WAR && WAR.byId(w.f); return '<li><span class="lb-rank">' + LB.escape(w.ym) + '</span><span class="lb-date"></span><span class="lb-name">' + (f ? '<img class="hall-ic" src="' + f.icon + '" alt=""> <b style="color:' + f.color + '">' + t('f.' + f.key) + '</b>' : t('lb.season.none')) + '</span><span class="lb-score">' + (w.pct ? w.pct + '%' : '') + '</span></li>'; }).join('') + '</ul>'
      : '<div class="note">' + t('hall.war.first') + '</div>';
    el.innerHTML = h;
  };

  window.LB = LB;
})();
