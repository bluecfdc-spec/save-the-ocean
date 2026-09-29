// 무로그인 실시간 리더보드 (GitHub Pages + Firestore) — 크림이 러너와 같은 체계
//  · scores{시즌접미사}: 이름 있는 기록 {name, score, date}
//  · plays{시즌접미사} : 10위 밖 무명 기록 {score, date}  (순위 계산용)
//  · visits            : 방문자 수 (total, YYYY-MM-DD)
(function () {
  const LB = {};
  const LOCAL_KEY = 'savetheocean_best';
  const SUFFIX = window.SEASON_SUFFIX || '';
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

  const SCORES = (window.SCORES_COLLECTION || 'scores') + SUFFIX;
  const PLAYS = 'plays' + SUFFIX;
  const timeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);

  LB.formatToday = function () {
    const d = new Date(); const z = n => String(n).padStart(2, '0');
    return d.getFullYear() + '.' + z(d.getMonth() + 1) + '.' + z(d.getDate());
  };
  const isoToday = () => { const d = new Date(); const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };

  LB.localBest = function () { return Number(localStorage.getItem(LOCAL_KEY) || 0); };
  LB.saveLocal = function (score) { if (score > LB.localBest()) localStorage.setItem(LOCAL_KEY, String(score)); };
  LB.lastName = function () { return localStorage.getItem('savetheocean_name') || ''; };

  // 상위 N개 (실패/지연 시 null)
  const authed = () => (window.Premium ? Premium.ensureAnon() : Promise.resolve(null));
  LB.top = async function (n) {
    if (!LB.ready) return null;
    try {
      await authed();
      const snap = await timeout(db.collection(SCORES).orderBy('score', 'desc').limit(n).get(), 15000);
      if (!snap) return null;
      const rows = []; snap.forEach(d => { const v = d.data(); rows.push({ id: d.id, name: v.name || t('anon'), score: v.score | 0, date: v.date || '', country: v.country || '' }); });
      return rows;
    } catch (e) { console.warn('top failed', e); return null; }
  };

  // 내 순위 = (나보다 높은 점수 수: scores + plays) + 1
  LB.rank = async function (score) {
    if (!LB.ready) return null;
    try {
      await authed();
      const c = col => timeout(db.collection(col).where('score', '>', score).count().get().then(s => s.data().count), 15000);
      const [a, b] = await Promise.all([c(SCORES), c(PLAYS)]);
      if (a === null) return null;
      return a + (b === null ? 0 : b) + 1;
    } catch (e) { console.warn('rank failed', e); return null; }
  };

  // 이름 있는 기록 등록 — 로그인(Apple/Google)한 사용자만, uid 를 함께 저장 (Firestore 규칙에서 검증)
  LB.submit = async function (name, score, date) {
    name = String(name || '').trim().slice(0, 8) || t('anon');
    localStorage.setItem('savetheocean_name', name);
    if (!LB.ready) return { ok: false, reason: 'not-configured' };
    const user = window.Premium && Premium.user();
    if (!user || user.isAnonymous) return { ok: false, reason: 'need-login' };
    try {
      const ref = db.collection(SCORES).doc();
      const r = await timeout(ref.set({ name, score: Number(score) | 0, date, uid: user.uid, country: LB.country() }).then(() => true), 15000);
      return r ? { ok: true, id: ref.id } : { ok: false, reason: 'timeout' };
    } catch (e) { console.warn('submit failed', e); return { ok: false, reason: e && e.code || 'error' }; }
  };

  // 10위 밖 무명 기록 (순위 계산용)
  LB.recordPlay = function (score, date) {
    if (!LB.ready) return;
    authed().then(() => db.collection(PLAYS).add({ score: Number(score) | 0, date, country: LB.country() })).catch(() => {});
  };
  // 국가 코드 (기기 지역 설정 기준, 2글자) — 순위판 국기 표시용
  LB.country = function () {
    try { const loc = Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || ''; const m = loc.match(/[-_]([A-Za-z]{2})\b/); if (m) return m[1].toUpperCase(); } catch (e) {}
    const l = (navigator.language || '').toLowerCase(); return l.startsWith('ko') ? 'KR' : l.startsWith('ja') ? 'JP' : l.startsWith('en') ? 'US' : '';
  };
  LB.flag = c => c && /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : '';

  // 방문자 카운트 (페이지 로드마다 1회) → {today, total} 또는 null
  LB.visit = async function () {
    if (!LB.ready) return null;
    try {
      await authed();
      const inc = firebase.firestore.FieldValue.increment(1);
      const key = isoToday();
      const tRef = db.collection('visits').doc('total');
      const dRef = db.collection('visits').doc(key);
      await timeout(Promise.all([
        tRef.set({ count: inc }, { merge: true }),
        dRef.set({ count: inc, date: key }, { merge: true })
      ]), 10000);
      const [t, d] = await Promise.all([tRef.get(), dRef.get()]);
      return { total: (t.exists && t.data().count) | 0, today: (d.exists && d.data().count) | 0 };
    } catch (e) { console.warn('visit failed', e); return null; }
  };
  // 공지: visits/notice 문서 → 없으면 DEFAULT_NOTICE
  LB.notice = async function () {
    let def = window.DEFAULT_NOTICE || null;
    if (def && window.I18N && I18N.lang === 'en' && def.en) def = Object.assign({}, def, def.en);
    if (!LB.ready) return def;
    try {
      await authed();
      const d = await timeout(db.collection('visits').doc('notice').get(), 8000);
      if (d && d.exists) {
        const v = d.data(); const en = window.I18N && I18N.lang === 'en';
        return { active: !!v.active, title: (en && v.title_en) || v.title || '', body: (en && v.body_en) || v.body || '', button: (en && v.button_en) || v.button || t('notice.ok') };
      }
    } catch (e) {}
    return def;
  };

  LB.fmtCount = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);

  LB.escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 순위 목록 렌더링 (크림이 러너와 같은 4칸: 순위 · 이름 · 점수 · 날짜)
  LB.renderList = function (el, rows, hl) {
    if (rows === null) { el.innerHTML = '<div class="note">' + (LB.ready ? t('lb.fail') : t('lb.notset')) + '</div>'; return; }
    if (!rows.length) { el.innerHTML = '<div class="note">' + t('lb.empty') + '</div>'; return; }
    el.innerHTML = '<ul class="lb">' + rows.map((r, i) => {
      const me = hl && r.score === hl.score && r.date === hl.date;
      return '<li' + (me ? ' class="me"' : '') + '><span class="lb-rank">' + t('lb.rank', { n: i + 1 }) + '</span><span class="lb-name">' + (r.country ? LB.flag(r.country) + ' ' : '') + LB.escape(r.name) + '</span><span class="lb-score">' + t('lb.pts', { n: I18N.num(r.score) }) + '</span><span class="lb-date">' + LB.escape(r.date) + '</span></li>';
    }).join('') + '</ul>';
  };

  // 지난 시즌 1위 (firebase-config.js 의 SEASONS_DATA)
  LB.renderSeasons = function (el) {
    const list = (window.SEASONS_DATA || []).slice().reverse();
    if (!list.length) { el.innerHTML = '<div class="note">' + t('lb.season.first') + '</div>'; return; }
    el.innerHTML = '<ul class="lb seasons">' + list.map(s =>
      '<li><span class="lb-rank">' + t('lb.season', { n: s.n }) + '</span><span class="lb-date">' + LB.escape(s.range || '') + '</span><span class="lb-name">' + (s.name ? '👑 ' + LB.escape(s.name) : t('lb.season.none')) + '</span><span class="lb-score">' + (s.score ? I18N.num(s.score) : '') + '</span></li>'
    ).join('') + '</ul>';
  };

  window.LB = LB;
})();
