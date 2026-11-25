/* DIVINE GENESIS: RUMBLE — 통합 홈 로직
 *  · 전장 화면(index.html 안의 그림 코드, window.WF) 위에서: 투입 → 세력 선택 → 게임(iframe) → 결과 → 전장 복귀
 *  · 게임 파일은 고치지 않는다. 같은 주소(origin)라서 iframe 안의 게임이 끝나는 순간만 밖에서 지켜본다.
 *  · 체험 9판(9번째 판만 세력 기여) → 이후 이용권(매 판 기여) 또는 무료 하루 3판(기여 없음)
 *  · 점수: 게임별 기록 → 등급(1~10) → 보급. 약세 세력은 보급 보너스.
 *  · 저장: 출시 전 테스트 칸({game}_scores_test, 익명 로그인)만 쓴다. flag = 'H' + 달 + 보너스 단계.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const TRIAL = 9, FREE_DAY = 3, BASE = 30, BONUS = [1, 1.2, 1.5], CACHE_MS = 3 * 60000;
  const num = v => Math.round(v).toLocaleString('en-US');
  const GAMES = [
    { key: 'sky',   z: 0, name: '공중전', title: 'SPACE RUMBLE', url: '../sky/index.html',  unit: '초', units: ['폭격기', '요격기'], th: [5, 10, 15, 20, 30, 40, 50, 60, 80, 100],
      fmt: v => v.toFixed(2), toInt: v => Math.round(v * 100), fromInt: v => v / 100, cap: 60000 },
    { key: 'ocean', z: 1, name: '해상전', title: 'OCEAN RUMBLE', url: '../index.html',      unit: '점', units: ['순양함', '고속정'], th: [500, 1500, 3000, 5000, 8000, 12000, 17000, 23000, 30000, 40000],
      fmt: num, toInt: v => Math.round(v), fromInt: v => v, cap: 3000000 },
    { key: 'tank',  z: 2, name: '지상전', title: 'TANK RUMBLE',  url: '../tank/index.html', unit: '점', units: ['중전차', '경전차'], th: [300, 800, 1500, 2500, 4000, 6000, 8500, 11500, 15000, 20000],
      fmt: num, toInt: v => Math.round(v), fromInt: v => v, cap: 1000000 }
  ];
  const FACS = [
    { key: 'surge', id: 1, name: '서지', en: 'SURGE', col: '#2e8bff', side: '인간', nm: ['푸른파도', '깊은해류', '은빛물결'] },
    { key: 'gale',  id: 2, name: '게일', en: 'GALE',  col: '#a94dff', side: 'AI',   nm: ['보라폭풍', '검은번개', '질풍'] },
    { key: 'solar', id: 3, name: '솔라', en: 'SOLAR', col: '#f5c22e', side: '천사', nm: ['금빛태양', '새벽빛', '불새'] }
  ];
  const gameOfZone = z => GAMES.find(g => g.z === z);

  /* ───────── 날짜(한국 시간) ───────── */
  function kst() { return new Date(Date.now() + 9 * 3600000); }
  function today() { const d = kst(); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function ymKey() { return today().slice(0, 7).replace('-', ''); }
  function monthChar() { const d = kst(); return (((d.getUTCFullYear() - 2026) * 12 + d.getUTCMonth()) % 36).toString(36); }
  function flags() { const c = 'H' + monthChar(); return [c + '0', c + '1', c + '2']; }
  function daysLeft() { const d = kst(), last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); return last - d.getUTCDate(); }

  /* ───────── 이 기기에 남기는 상태 ───────── */
  const KEY = 'dg_hub_v1', CKEY = 'dg_hub_cache_v1';
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
  st = Object.assign({ plays: 0, paid: false, day: '', dayPlays: 0, fac: -1, names: {}, ym: '', mine: [], local: [] }, st || {});
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } }
  if (st.ym !== ymKey()) { st.ym = ymKey(); st.mine = []; st.local = []; }   // 새 달 = 새 심판
  if (st.day !== today()) { st.day = today(); st.dayPlays = 0; }
  save();
  const inTrial = () => st.plays < TRIAL;
  const freeLeft = () => Math.max(0, FREE_DAY - st.dayPlays);
  function canPlay() { if (inTrial() || st.paid) return true; if (st.day !== today()) { st.day = today(); st.dayPlays = 0; save(); } return st.dayPlays < FREE_DAY; }
  function myName(f) { if (!st.names[f]) { const n = FACS[f].nm; st.names[f] = n[Math.random() * n.length | 0] + ' #' + (1000 + Math.random() * 9000 | 0); save(); } return st.names[f]; }

  /* ───────── 등급 · 보급 ───────── */
  function gradeOf(g, v) { if (!(v > 0)) return 0; return Math.max(1, g.th.filter(t => v >= t).length); }
  let shares = [[34, 33, 33], [34, 33, 33], [34, 33, 33]];
  function bonusIdx(z, f) { const s = shares[z], mx = Math.max.apply(0, s), mn = Math.min.apply(0, s); if (mx - mn < 4 || s[f] === mx) return 0; /* 거의 비슷하면 보너스 없음 */ return s[f] === mn ? 2 : 1; }
  function toPct(t) {   // 보급 합계 3개 → 합이 100인 정수 3개
    const raw = t.map(v => v + BASE), sum = raw[0] + raw[1] + raw[2];
    let p = raw.map(v => Math.max(8, Math.floor(v / sum * 100))), d = 100 - (p[0] + p[1] + p[2]);
    const order = [0, 1, 2].sort((a, b) => raw[b] - raw[a]);
    for (let i = 0; d !== 0 && i < 60; i++) { const k = order[d > 0 ? i % 3 : 2 - (i % 3)]; if (d > 0) { p[k]++; d--; } else if (p[k] > 8) { p[k]--; d++; } }
    return p;
  }

  /* ───────── 서버(Firestore) ───────── */
  let app = null, authP = null, uid = '';
  function fb() { if (app) return app; try { if (window.firebase && window.DG_FIREBASE) app = firebase.initializeApp(window.DG_FIREBASE, 'hub'); } catch (e) { app = null; } return app; }
  function login() { if (authP) return authP; authP = fb().auth().signInAnonymously().then(c => { uid = c.user.uid; return uid; }).catch(e => { authP = null; throw e; }); return authP; }
  const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  let rows = [];   // [{id, g(게임 번호), f(0~2), s(기록 정수), b(보너스 단계), n(이름)}]
  function readCache() { try { const c = JSON.parse(localStorage.getItem(CKEY) || 'null'); if (c && c.ym === ymKey()) return c; } catch (e) { } return null; }
  async function fetchAll(force) {
    const c = readCache();
    if (c) rows = c.rows;
    if (c && !force && Date.now() - c.t < CACHE_MS && Date.now() >= c.t) return true;
    if (!fb()) return false;
    try {
      const fl = flags(), out = [];
      const snaps = await timeout(Promise.all(GAMES.map(g => app.firestore().collection(g.key + '_scores_test').where('flag', 'in', fl).limit(500).get())), 8000);
      snaps.forEach((q, gi) => q.forEach(d => { const v = d.data(); if (v.faction >= 1 && v.faction <= 3) out.push({ id: d.id, g: gi, f: v.faction - 1, s: v.score | 0, b: +String(v.flag).slice(2) || 0, n: String(v.name || '').slice(0, 12) }); }));
      rows = out;
      try { localStorage.setItem(CKEY, JSON.stringify({ t: Date.now(), ym: ymKey(), rows: out })); } catch (e) { }
      return true;
    } catch (e) { console.warn('hub: 점수 불러오기 실패', e); return false; }
  }
  function apply() {   // 서버 기록 + 아직 서버에 안 보이는 내 기록 → 점유율·1등 이름을 전장에 반영
    const seen = {}; rows.forEach(r => { seen[r.id] = 1; });
    const all = rows.concat(st.local.filter(r => !seen[r.id]));
    const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], best = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], names = [['', '', ''], ['', '', ''], ['', '', '']];
    all.forEach(r => { const g = GAMES[r.g]; if (!g) return; const z = g.z, gr = gradeOf(g, g.fromInt(r.s));
      T[z][r.f] += Math.max(1, Math.round(gr * (BONUS[r.b] || 1)));
      if (r.s > best[z][r.f]) { best[z][r.f] = r.s; names[z][r.f] = r.n; } });
    shares = T.map(toPct);
    if (window.WF && WF.ready) { WF.setShares(shares); WF.setNames(names); }
  }
  async function send(entry) {   // 내 기록 한 건 올리기 (20초에 한 번만 받아 준다 — 실패하면 다음에 다시)
    if (!fb()) return false;
    try {
      await timeout(login(), 8000);
      const g = GAMES[entry.g], fs = app.firestore(), b = fs.batch();
      b.set(fs.collection('users').doc(uid), { last: firebase.firestore.FieldValue.serverTimestamp() });
      b.set(fs.collection(g.key + '_scores_test').doc(entry.id), { name: entry.n, score: entry.s, date: today(), flag: 'H' + monthChar() + entry.b, faction: entry.f + 1, uid: uid });
      await timeout(b.commit(), 8000);
      entry.sent = 1; save(); return true;
    } catch (e) { console.warn('hub: 기록 올리기 실패', e); return false; }
  }
  function newId() { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (let i = 0; i < 20; i++) s += c[Math.random() * c.length | 0]; return s; }
  function contribute(g, f, rec) {
    const gr = gradeOf(g, rec); if (!gr) return { supply: 0, grade: 0, b: 0 };
    const gi = GAMES.indexOf(g), b = bonusIdx(g.z, f), supply = Math.max(1, Math.round(gr * BONUS[b]));
    const entry = { id: newId(), g: gi, f: f, s: Math.min(g.cap, Math.max(1, g.toInt(rec))), b: b, n: myName(f) };
    st.local.push(entry); if (st.local.length > 200) st.local.shift();
    const t = gr >= 7 ? 1 : 2; st.mine = st.mine.filter(m => !(m.z === g.z && m.t === t)); st.mine.push({ z: g.z, t: t }); if (st.mine.length > 6) st.mine.shift();
    save(); apply(); send(entry);
    return { supply: supply, grade: gr, b: b, tier: t };
  }
  function flushOne() { const e = st.local.find(r => !r.sent); if (e) send(e); }

  /* ───────── 화면 조각 ───────── */
  const sheet = $('sheet'), res = $('res'), play = $('play'), gf = $('gf'), quit = $('quit');
  function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; }
  function openSheet(html) { sheet.innerHTML = '<div class="card">' + html + '</div>'; sheet.hidden = false; }
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  const facName = f => '<em style="color:' + FACS[f].col + ';font-style:normal">' + FACS[f].name + '</em>';

  function pickFaction(g, done) {
    let sel = st.fac >= 0 ? st.fac : 0;
    const ninth = st.plays === TRIAL - 1;
    const head = ninth ? '<h2>9번째 판 — 세력을 정하세요</h2><p>이 판의 보급은 고른 세력에 <b style="color:#ffd872">실제로 전달</b>되고, 세력이 이것으로 고정됩니다.</p>'
      : '<h2>' + g.name + ' — 어느 세력으로?</h2><p>체험 ' + (st.plays + 1) + '/' + TRIAL + '판 · 체험 중에는 판마다 바꿀 수 있습니다.</p>';
    function draw() {
      openSheet(head + '<div class="facs">' + FACS.map((F, i) => { const b = bonusIdx(g.z, i);
        return '<button class="fac' + (i === sel ? ' on' : '') + '" data-f="' + i + '" style="--c:' + F.col + '"><img src="../common/f_' + F.key + '.png" alt=""><b>' + F.name + '</b><small>' + F.side + ' · ' + shares[g.z][i] + '%</small><span class="bonus">' + (b ? '보급 ×' + BONUS[b] : '') + '</span></button>'; }).join('')
        + '</div><button class="btn gold" id="pfGo">' + FACS[sel].name + ' 세력으로 출격</button>');
      sheet.querySelectorAll('.fac').forEach(b => b.addEventListener('click', () => { sel = +b.dataset.f; draw(); }));
      $('pfGo').addEventListener('click', () => { closeSheet(); done(sel); });
    }
    draw();
  }
  function storeSheet(msg) {
    openSheet('<h2>이용권 5,000원</h2><p>' + (msg ? msg + '<br><br>' : '') + '· 세 게임 무제한<br>· 매 판 내 세력에 보급 기여<br>· 세력 고정</p>'
      + '<div class="row"><button class="btn" disabled>결제는 앱 출시 때 열립니다</button></div>'
      + '<div class="row"><button class="btn ghost" id="stTest">' + (st.paid ? '테스트: 이용권 끄기' : '테스트: 결제한 것으로 보기') + '</button></div>'
      + '<p class="tiny">출시 전 확인용 버튼입니다. 실제 결제가 아닙니다.</p>');
    $('stTest').addEventListener('click', () => { st.paid = !st.paid; save(); closeSheet(); WF.toast(st.paid ? '이용권 켜짐 (테스트)' : '이용권 꺼짐 (테스트)'); refreshMenu(); });
  }
  function settingsSheet() {
    openSheet('<h2>설정</h2><p class="sub">출시 전 확인용 도구입니다.</p>'
      + '<div class="setrow"><span>체험 ' + Math.min(st.plays, TRIAL) + '/' + TRIAL + '판 · ' + (st.paid ? '이용권 있음' : inTrial() ? '체험 중' : '무료(오늘 ' + freeLeft() + '판 남음)') + '</span></div>'
      + '<div class="setrow"><span>체험을 처음부터 다시</span><button id="seReset">초기화</button></div>'
      + '<div class="setrow"><span>전장 점수 새로 불러오기</span><button id="seLoad">불러오기</button></div>'
      + '<div class="row"><button class="btn ghost" id="seClose">닫기</button></div>');
    $('seReset').addEventListener('click', () => { st.plays = 0; st.paid = false; st.dayPlays = 0; st.fac = -1; save(); closeSheet(); refreshMenu(); WF.toast('체험을 처음으로 돌렸습니다'); });
    $('seLoad').addEventListener('click', () => { closeSheet(); fetchAll(true).then(ok => { apply(); WF.toast(ok ? '전장 점수를 새로 불러왔습니다' : '서버에 닿지 못했습니다'); }); });
    $('seClose').addEventListener('click', closeSheet);
  }
  function refreshMenu() {
    $('mFacT').innerHTML = st.fac >= 0 ? '내 세력 · ' + FACS[st.fac].name + (inTrial() ? ' (체험)' : '') : '내 세력 · 미정';
    const d = daysLeft(); $('demo').textContent = d > 0 ? '심판까지 ' + d + '일' : '오늘 심판';
    if (window.WF && WF.ready && st.fac >= 0) WF.setMe(st.fac);
  }

  /* ───────── 투입 → 게임 ───────── */
  let cur = null;   // {g, f, ended}
  function deploy(z) {
    $('menu').classList.remove('on');
    const g = gameOfZone(z); if (!g) return;
    if (!canPlay()) { storeSheet('오늘 무료 ' + FREE_DAY + '판을 모두 썼습니다. 내일 다시 ' + FREE_DAY + '판이 열립니다.'); return; }
    if (inTrial() || st.fac < 0) pickFaction(g, f => launch(g, f)); else launch(g, st.fac);
  }
  function launch(g, f) {
    st.fac = f; save(); refreshMenu();
    try { localStorage.setItem('dg_fac', FACS[f].key); localStorage.setItem('tank_fac', FACS[f].key); localStorage.setItem('savetheocean_next_pfac', String(FACS[f].id)); } catch (e) { }
    cur = { g: g, f: f, ended: false };
    WF.pause(true); res.hidden = true; play.hidden = false; quit.classList.remove('arm'); quit.textContent = '✕';
    quit.style.top = g.key === 'ocean' ? 'calc(104px + env(safe-area-inset-top))' : '';   // 오션은 맨 위가 전부 HUD 라서 그 아래로
    gf.src = g.url;
  }
  function report(v) { if (!cur || cur.ended) return; cur.ended = true; const c = cur; setTimeout(() => { if (cur === c) finish(c, v); }, c.g.key === 'tank' ? 1300 : 500); }
  function watch() {   // 게임이 끝나는 순간을 밖에서 지켜본다 (게임 파일은 그대로)
    if (!cur) return; const c = cur, g = c.g; let tries = 0;
    (function hook() {
      if (cur !== c) return; let cw, cd;
      try { cw = gf.contentWindow; cd = gf.contentDocument; } catch (e) { return; }
      try {
        if (g.key === 'tank' && cw.TR_RANK && !cw.TR_RANK.__hub) {
          const o = cw.TR_RANK.onEnd; cw.TR_RANK.onEnd = function (sc) { try { o.apply(this, arguments); } catch (e) { } report(+sc || 0); }; cw.TR_RANK.__hub = 1; return;
        }
        if (g.key === 'sky' && cd && cd.getElementById('ovT') && cd.getElementById('ovS') && !cw.__hub) {   // 결과 창에 GAME OVER 와 버틴 시간이 뜨는 순간
          const tEl = cd.getElementById('ovT'), sEl = cd.getElementById('ovS');
          const chk = () => { if (cur === c && !c.ended && /GAME OVER/i.test(tEl.textContent) && !sEl.hidden) { const v = parseFloat(sEl.textContent); if (v >= 0) report(v); } };
          new cw.MutationObserver(chk).observe(tEl.parentNode, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
          cw.__hub = 1; return;
        }
        if (g.key === 'ocean' && cd && cd.getElementById('overOverlay') && cd.getElementById('finalScore') && !cw.__hub) {
          const ov = cd.getElementById('overOverlay'), fsEl = cd.getElementById('finalScore');
          new cw.MutationObserver(() => { if (!ov.classList.contains('hidden') && cur === c && !c.ended) report(+String(fsEl.textContent).replace(/[^0-9]/g, '') || 0); }).observe(ov, { attributes: true, attributeFilter: ['class'] });
          // 게임 안에서 '다시 하기'를 누르면 새 판으로 본다
          cw.__hub = 1; return;
        }
      } catch (e) { }
      if (++tries < 80) setTimeout(hook, 250);
    })();
  }
  gf.addEventListener('load', watch);
  quit.addEventListener('click', () => {
    if (!quit.classList.contains('arm')) { quit.classList.add('arm'); quit.textContent = '전장으로 나가기'; setTimeout(() => { quit.classList.remove('arm'); quit.textContent = '✕'; }, 2500); return; }
    backHome(null);
  });

  /* ───────── 결과 ───────── */
  function finish(c, v) {
    const g = c.g, f = c.f, F = FACS[f];
    st.plays++; const n = st.plays, wasTrial = n <= TRIAL;
    if (!wasTrial && !st.paid) st.dayPlays++;
    const gives = n === TRIAL || (n > TRIAL && st.paid);
    const gr = gradeOf(g, v);
    let out = null; if (gives) out = contribute(g, f, v);
    save(); refreshMenu();
    let box;
    if (gives && out && out.supply) {
      box = '<div class="rs-box go" style="--c:' + F.col + '"><b>' + (n === TRIAL ? '9번째 판 — ' : '') + '<em>' + F.name + '</em>에 보급 전달!</b><div class="rs-supply">+' + out.supply + '</div>'
        + '<span>' + (out.b ? '약세 세력 보너스 ×' + BONUS[out.b] + ' · ' : '') + '내 ' + g.units[out.tier - 1] + '가 전장에 출격합니다</span></div>';
    } else if (gives) {
      box = '<div class="rs-box"><b>기록이 없어 보급을 보내지 못했습니다</b><span>다음 판에 다시 도전하세요.</span></div>';
    } else if (wasTrial) {
      box = '<div class="rs-box"><b>이번 판은 기록만 남습니다</b><span><b style="display:inline;font-size:13px;color:#ffd872">9번째 판</b>은 세력에 기여됩니다 · ' + (TRIAL - n) + '판 남음</span></div>';
    } else {
      box = '<div class="rs-box"><b>무료 이용 · 오늘 ' + freeLeft() + '판 남음</b><span>세력에 보급을 보내려면 이용권이 필요합니다.</span></div>';
    }
    const trial = wasTrial ? '<div class="trial">' + Array.from({ length: TRIAL }, (_, i) => '<i class="' + (i < n ? 'on' : '') + (i === TRIAL - 1 ? ' last' : '') + '"></i>').join('') + '</div>' : '';
    const again = canPlay();
    res.innerHTML = '<div class="card"><div class="rs-game">' + g.title + '</div><div class="rs-score">' + g.fmt(v) + '<small>' + g.unit + '</small></div>'
      + '<div class="stars">' + Array.from({ length: 10 }, (_, i) => '<i class="' + (i < gr ? 'on' : '') + '"></i>').join('') + '</div><div class="rs-grade">등급 ' + gr + ' / 10</div>'
      + box + trial
      + (n === TRIAL && !st.paid ? '<p class="tiny">체험이 끝났습니다. 이용권이 있으면 매 판 세력에 기여하고, 없으면 하루 ' + FREE_DAY + '판을 무료로 즐길 수 있습니다.</p>' : '')
      + '<div class="row"><button class="btn ghost" id="rsHome">전장으로</button><button class="btn gold" id="rsAgain"' + (again ? '' : ' disabled') + '>한 판 더</button></div>'
      + (!gives && !wasTrial || (n === TRIAL && !st.paid) ? '<div class="row"><button class="btn" id="rsStore">이용권 5,000원</button></div>' : '') + '</div>';
    res.hidden = false;
    const done = gives && out && out.supply ? { g: g, f: f, out: out } : null;
    $('rsHome').addEventListener('click', () => backHome(done));
    $('rsAgain').addEventListener('click', () => {
      res.hidden = true; if (done) pending = done;
      if (!canPlay()) { backHome(done); return; }
      if (inTrial()) { backHome(done); pickFaction(g, ff => launch(g, ff)); } else launch(g, st.fac);
    });
    const rs = $('rsStore'); if (rs) rs.addEventListener('click', () => { backHome(done); storeSheet(''); });
  }
  let pending = null;   // 전장으로 돌아가면 보여 줄 내 출격
  function backHome(done) {
    cur = null; res.hidden = true; play.hidden = true; gf.src = 'about:blank'; WF.pause(false);
    const d = done || pending; pending = null;
    if (d) {
      WF.setMe(d.f); WF.mine(d.g.z, d.f, d.out.tier, true);
      WF.toast(d.g.name + ' 보급 +' + d.out.supply + '<small>내 ' + d.g.units[d.out.tier - 1] + ' 출격! (' + (d.out.tier + 1) + '등급)</small>');
    }
    fetchAll(false).then(apply);
  }

  /* ───────── 시작 ───────── */
  function boot() {
    document.querySelectorAll('.dep').forEach(b => b.addEventListener('click', () => deploy(+b.dataset.z)));
    [0, 1, 2].forEach(z => $('zl' + z).addEventListener('click', () => deploy(z)));
    $('mbtn').addEventListener('click', () => $('menu').classList.toggle('on'));
    $('mStore').addEventListener('click', () => { $('menu').classList.remove('on'); storeSheet(''); });
    $('mSet').addEventListener('click', () => { $('menu').classList.remove('on'); settingsSheet(); });
    $('mFac').addEventListener('click', () => { $('menu').classList.remove('on');
      if (st.fac < 0) { openSheet('<h2>내 세력</h2><p>아직 세력이 없습니다. 아래 투입 버튼으로 첫 판을 시작하면 고를 수 있습니다.</p>'); return; }
      openSheet('<h2>내 세력 · ' + facName(st.fac) + '</h2><p>' + (inTrial() ? '체험 중에는 판을 시작할 때마다 세력을 바꿀 수 있습니다. 9번째 판에 고른 세력으로 고정됩니다.' : '세력이 고정되었습니다. 세력 변경권은 앱 출시 때 열립니다.') + '</p><p class="tiny">전장 이름: ' + myName(st.fac) + '</p>'); });
    refreshMenu(); apply();
    if (st.fac >= 0) st.mine.forEach(m => WF.mine(m.z, st.fac, m.t, false));
    const sync = () => fetchAll(false).then(() => { apply(); flushOne(); });
    if (fb()) sync(); else window.addEventListener('load', sync);   // Firebase 는 화면이 뜬 뒤에 불러온다
  }
  if (window.WF && WF.ready) boot(); else document.addEventListener('wf:ready', boot);
  window.DG_HUB = { state: () => st, games: GAMES, report: report };   // 확인용
})();
