// 무로그인 실시간 리더보드 (GitHub Pages + Firestore)
(function () {
  const LB = {};
  const LOCAL_KEY = 'savetheocean_best';
  let db = null, unsub = null;

  LB.ready = false;
  try {
    const cfg = window.FIREBASE_CONFIG || {};
    if (cfg.apiKey && cfg.projectId && window.firebase) {
      firebase.initializeApp(cfg);
      db = firebase.firestore();
      // 제한된 환경(임베드/프록시)에서도 통신되도록 롱폴링 자동 감지
      try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
      LB.ready = true;
    }
  } catch (e) { console.warn('Firebase init failed', e); }

  LB.localBest = function () { return Number(localStorage.getItem(LOCAL_KEY) || 0); };
  LB.saveLocal = function (score) {
    if (score > LB.localBest()) localStorage.setItem(LOCAL_KEY, String(score));
  };

  LB.lastName = function () { return localStorage.getItem('savetheocean_name') || ''; };

  // 점수 등록
  LB.submit = async function (name, score) {
    name = String(name || '').trim().slice(0, 8);
    localStorage.setItem('savetheocean_name', name);
    if (!LB.ready) return { ok: false, reason: 'not-configured' };
    try {
      const col = db.collection(window.SCORES_COLLECTION || 'scores');
      const ref = col.doc();               // id를 먼저 만들고
      const p = ref.set({
        name, score: Number(score) | 0,
        ts: firebase.firestore.FieldValue.serverTimestamp(),
        ua: (navigator.userAgent || '').slice(0, 80)
      });
      // 서버 응답이 8초 넘게 없으면 '보낸 것으로' 처리 (Firestore가 백그라운드에서 계속 전송)
      await Promise.race([p, new Promise(r => setTimeout(r, 8000))]);
      return { ok: true, id: ref.id };
    } catch (e) {
      console.warn('submit failed', e);
      return { ok: false, reason: e && e.code || 'error' };
    }
  };

  // 실시간 Top N 구독 — 콜백에 [{id,name,score}] 전달
  LB.watchTop = function (n, cb) {
    if (unsub) { unsub(); unsub = null; }
    if (!LB.ready) { cb(null); return; }
    unsub = db.collection(window.SCORES_COLLECTION || 'scores')
      .orderBy('score', 'desc').limit(n)
      .onSnapshot(snap => {
        const rows = [];
        snap.forEach(d => { const v = d.data(); rows.push({ id: d.id, name: v.name || '???', score: v.score | 0 }); });
        cb(rows);
      }, err => { console.warn('watch failed', err); cb(null); });
  };
  LB.stop = function () { if (unsub) { unsub(); unsub = null; } };

  // 보드 렌더링
  LB.render = function (el, rows, myId) {
    if (rows === null) {
      const best = LB.localBest();
      el.innerHTML = `<div class="note">${LB.ready ? '랭킹을 불러오지 못했습니다 (네트워크 확인)' : '온라인 랭킹 미설정 — 이 기기 최고 기록'}</div>` +
        `<table><tr><td class="rank">★</td><td>BEST</td><td class="score">${best.toLocaleString()}</td></tr></table>`;
      return;
    }
    if (!rows.length) { el.innerHTML = '<div class="note">아직 기록이 없습니다. 첫 번째 주인공이 되어보세요!</div>'; return; }
    let html = '<table>';
    rows.forEach((r, i) => {
      const cls = r.id === myId ? ' class="me"' : '';
      html += `<tr${cls}><td class="rank">${i + 1}</td><td>${escapeHtml(r.name)}</td><td class="score">${r.score.toLocaleString()}</td></tr>`;
    });
    html += '</table>';
    el.innerHTML = html;
  };

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  window.LB = LB;
})();
