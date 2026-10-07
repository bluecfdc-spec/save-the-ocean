/* SAVE THE OCEAN — 군함 vs 잠수정
 * 세로 폰 게임. 모든 좌표는 CSS 픽셀(논리 좌표) 기준.
 */
(function () {
  'use strict';

  // ───────────── DOM ─────────────
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('game-wrap');
  const hpFill = document.getElementById('hpFill');
  const hpText = document.getElementById('hpText');
  const scoreText = document.getElementById('scoreText');
  const bombN = document.getElementById('bombN');
  const startOverlay = document.getElementById('startOverlay');
  const overOverlay = document.getElementById('overOverlay');
  const finalScore = document.getElementById('finalScore');
  const nameInput = document.getElementById('nameInput');
  const nameRow = document.getElementById('nameRow');
  const recordMsg = document.getElementById('recordMsg');
  const top10El = document.getElementById('top10');
  const hudEl = document.getElementById('hud');
  const hudDrill = document.getElementById('hudDrill');
  const bombMax = document.getElementById('bombMax');
  const bestLine = document.getElementById('bestLine');
  const flash = document.getElementById('flash');
  const toast = document.getElementById('toast');
  const panel = document.getElementById('panel');

  // ───────────── 이미지 ─────────────
  const IMG = {};
  const files = { bg: 'assets/bg.jpg', ship: 'assets/ship.png', subW: 'assets/sub_white.png', subR: 'assets/sub_red.png', bomb: 'assets/bomb.png', torpedo: 'assets/torpedo.png', radar: 'assets/radar_frame.png', drill: 'assets/item_drill.png', shield: 'assets/item_shield.png' };
  // 세력별 그림: 1 서지(파랑) · 2 게일(보라) · 3 솔라(금색) — 군함 ship_fN, 일반 잠수함 sub_nN, 보스 잠수함 sub_bN
  for (const n of [1, 2, 3]) { files['ship_f' + n] = 'assets/ship_f' + n + '.png?v=2'; files['sub_n' + n] = 'assets/sub_n' + n + '.png?v=2'; files['sub_b' + n] = 'assets/sub_b' + n + '.png?v=2'; }
  let loaded = 0; const total = Object.keys(files).length;
  for (const k in files) { const im = new Image(); im.src = files[k]; im.onload = im.onerror = () => { loaded++; }; IMG[k] = im; }

  // ───────────── 상수 ─────────────
  const BG_W = 941, BG_H = 1176;        // 배경 원본 크기
  const SURFACE_FRAC = 158 / BG_H;      // 배경 안에서 수면(군함 흘수선) 위치
  const SEABED_FRAC = 1000 / BG_H;      // 해저 시작 위치 (대략)
  const MAX_BOMBS = 5;
  const MAX_HP = 100, HIT_DMG = 25;     // 어뢰 4방 = 침몰
  const SHIP_W = 59;
  const SUB_W = 46;
  const BOMB_W = 17;
  const TORP_W = 8;
  const WORLD_MARGIN = 1.0;             // 화면 밖 확장 폭 (화면 폭의 배수, 양쪽 각각)
  const SHIELD_EVERY = 20;              // 잠수정 20척 격파마다 쉴드 아이템
  const SHIELD_TIME = 10;               // 쉴드 지속(초)
  const DRILL_SHOTS = 5;                // 드릴 장전 수
  const DEEP_FRAC = 0.10;               // 잠수정 깊이 구간의 아래 10% = 심해 (격파 시 흰 500 / 빨강 1500)
  const DEEP_PTS = { white: 500, red: 1500 };
  // 테스트 모드 (주소 뒤에 ?test): 심해 출몰 ↑, 3~5척 동시 등장, 드릴 자주, 어뢰 없음, 기록 저장 안 함
  const TEST = new URLSearchParams(location.search).has('test');
  const DRILL_W = 15;

  // ───────────── 상태 ─────────────
  let W = 390, H = 600, DPR = 1;
  let bgScale = 1, bgX = 0, bgY = 0, surfaceY = 100, seabedY = 500;
  let radar = { x: 0, y: 0, w: 0, h: 0, ix: 0, iy: 0, iw: 0, ih: 0 };
  let state = 'idle';                   // idle | play | over
  let score = 0, hp = MAX_HP, time = 0, level = 0;
  let ship, bombs = [], subs = [], torps = [], fx = [], bubbles = [], texts = [], streaks = [];
  let spawnTimer = 0, shake = 0, radarAngle = 0, lastT = 0;
  let input = { left: false, right: false };
  let kills = 0, items = [], drillTimer = 0;
  let lastFinal = { score: 0, date: '' };

  // ───────────── 크기/배치 ─────────────
  // 전장(게임이 벌어지는 영역)은 어느 기기에서나 같은 크기: 가로 390 × 세로 500 논리 좌표.
  // 화면 가로를 꽉 채우도록 통째로 확대·축소하고, 세로가 남으면 위쪽에 하늘을 더 보여준다.
  // → 화면이 길든 짧든 수심(폭탄이 떨어지는 깊이)과 잠수정이 다니는 범위는 같다.
  const FIELD_W = 390, FIELD_H = 500;
  const MIN_RATIO = 0.1031 + FIELD_H / FIELD_W + 0.2572 + 0.012;   // 앱 전체(점수판 + 전장 + 조작판)의 최소 세로/가로 비
  const MAX_RATIO = 2.25;
  const appEl = document.getElementById('app');
  let viewH = FIELD_H, offY = 0;      // 화면에 보이는 세로 길이(논리 좌표)와, 전장이 그 안에서 시작하는 위치
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth, vh = window.innerHeight;
    const aw = Math.max(200, Math.min(vw, 560, vh / MIN_RATIO)), ah = Math.min(vh, aw * MAX_RATIO), top = Math.max(0, (vh - ah) / 2);
    appEl.style.width = aw + 'px'; appEl.style.height = ah + 'px'; appEl.style.bottom = 'auto'; appEl.style.top = top + 'px';
    document.documentElement.style.setProperty('--app-w', aw + 'px');
    document.documentElement.style.setProperty('--app-top', top + 'px');
    // 세로가 남는 화면에서는 먼저 조작판(버튼 영역)을 최대 1.65배까지 키우고, 그래도 남으면 하늘로 돌린다
    const basePanel = aw * 0.2572, spare = ah - aw * 0.1031 - basePanel - aw * FIELD_H / FIELD_W;
    document.documentElement.style.setProperty('--panel-h', Math.round(basePanel + Math.max(0, Math.min(spare * 0.4, aw * 0.05))) + 'px');
    const r = wrap.getBoundingClientRect(), k = r.width / FIELD_W;
    W = FIELD_W; H = FIELD_H;
    viewH = Math.max(FIELD_H, r.height / k); offY = Math.round(viewH - FIELD_H);   // 남는 세로는 전부 위쪽 하늘로 (아래는 조작판과 바로 맞닿게)
    canvas.width = Math.round(r.width * DPR); canvas.height = Math.round(r.height * DPR);
    canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
    ctx.setTransform(canvas.width / W, 0, 0, canvas.width / W, 0, 0);
    // 조작 방식 버튼(양손/한손)은 레이더 옆에 오도록, 아래 여백만큼 올린다
    document.documentElement.style.setProperty('--ctl-bottom', Math.round((viewH - offY - FIELD_H) * k + 12) + 'px');
    // 배경 cover
    bgScale = Math.max(W / BG_W, H / BG_H);
    bgX = (W - BG_W * bgScale) / 2; bgY = (H - BG_H * bgScale) / 2;
    surfaceY = bgY + SURFACE_FRAC * BG_H * bgScale;
    seabedY = Math.min(H - 10, bgY + SEABED_FRAC * BG_H * bgScale);
    // 레이더 (하단 중앙)
    radar.w = Math.round(W * 0.47); radar.h = Math.round(radar.w * 175 / 440);
    radar.x = Math.round((W - radar.w) / 2); radar.y = Math.round(H - radar.h - H * 0.02);
    const s = radar.w / 440;
    radar.ix = radar.x + 31 * s; radar.iy = radar.y + 29 * s; radar.iw = 378 * s; radar.ih = 120 * s;
    if (ship) ship.y = surfaceY;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ───────────── 게임 시작/종료 ─────────────
  function reset() {
    score = 0; hp = MAX_HP; time = 0; level = 0; spawnTimer = 0.8; shake = 0;
    bombs = []; subs = []; torps = []; fx = []; bubbles = []; texts = [];
    ship = { x: W / 2, y: surfaceY, w: SHIP_W, h: SHIP_W * 56 / 140, dir: 1, speed: 230, inv: 0, mv: 0, roll: 0, pitch: 0, wakeT: 0, shield: 0, drill: 0 };
    streaks = []; items = []; kills = 0; drillTimer = TEST ? 2 : 25 + Math.random() * 20;
    updateHud();
  }
  function start() {
    SFX.unlock(); SFX.wake(false); SFX.titleStop();
    document.getElementById('visits').style.display = 'none';
    resize(); reset();
    state = 'play';
    startOverlay.classList.add('hidden'); overOverlay.classList.add('hidden');
    document.body.classList.add('playing');
    document.body.classList.remove('over');
    SFX.startAmbient(); SFX.seaStart();
  }
  function gameOver() {
    state = 'over';
    document.body.classList.add('over'); renderFacSwitch();
    document.body.classList.remove('playing'); quitBtn.classList.remove('armed');
    SFX.wake(false);
    SFX.sink(); SFX.stopAmbient(); SFX.seaStop();
    shake = 18;
    fx.push(explosion(ship.x, ship.y, 60, true));
    if (!TEST) LB.saveLocal(score);
    lastFinal = { score: Math.floor(score), date: LB.formatToday() };
    setTimeout(showOver, 1300);
  }
  // ───────────── 게임 오버 · 기록 올리기 ─────────────
  const regRow = document.getElementById('regRow'), regBtn = document.getElementById('regBtn'), regNote = document.getElementById('regNote');
  const profLine = document.getElementById('profLine'), profEdit = document.getElementById('profEdit');
  // 한손 모드의 빈 칸에 내 세력 마크를 크게 보여 준다 (세력을 아직 안 골랐으면 원래 그림 그대로)
  function panelFaction() {
    const pn = document.getElementById('panel'), p = LB.profile(), f = p && WAR.byId(p.faction);
    pn.classList.toggle('has-fac', !!f);
    if (f) { pn.style.setProperty('--fac-img', 'url(' + (f.img || f.icon) + ')'); pn.style.setProperty('--fc', f.color); }
  }
  panelFaction();
  function renderReg() {
    const p = LB.profile(), f = p && WAR.byId(p.faction), left = LB.freeLeft();
    panelFaction();
    regRow.style.display = TEST ? 'none' : '';
    profLine.innerHTML = p ? '<span class="pf-flag">' + WAR.flagEmoji(p.flag) + '</span><b class="pf-name">' + LB.escape(p.name) + '</b><span class="pf-fac" style="--fc:' + f.color + '"><img src="' + f.icon + '" alt=""><i>' + t('f.' + f.key) + '</i></span>' : '';
    document.getElementById('recordBox').classList.toggle('has-prof', !!p);
    profEdit.style.display = p ? '' : 'none';
    const done = lastFinal.done, zero = lastFinal.score <= 0;
    regBtn.style.display = done || TEST ? 'none' : '';
    if (!(window.AUTH && AUTH.required())) { regBtn.style.display = 'none'; profEdit.style.display = 'none'; regNote.textContent = t('reg.app'); return; }   // 웹: 플레이와 순위 보기만 (기록 등록은 앱에서)
    if (loginRow && (done || !needLogin())) loginRow.style.display = 'none';
    regBtn.disabled = zero || !LB.ready || left <= 0;
    regBtn.textContent = left <= 0 ? t('reg.premium') : t('reg.btn');
    regNote.textContent = !LB.ready ? t('reg.offline') : zero ? t('reg.zero') : left === Infinity ? t('reg.open') : left > 0 ? t('reg.left', { n: left }) : t('reg.none');
  }
  async function showOver() {
    if (loginRow) loginRow.style.display = 'none';
    finalScore.textContent = I18N.num(lastFinal.score);
    recordMsg.textContent = lastFinal.msg || (LB.ready ? t('over.checking') : t('over.offline', { n: I18N.num(LB.localBest()) }));
    top10El.innerHTML = '<div class="note">' + t('loading') + '</div>';
    overOverlay.classList.remove('hidden');
    renderReg();
    if (TEST) { recordMsg.textContent = '🧪 TEST MODE — ' + ({ ko: '기록은 저장되지 않아요', ja: '記録は保存されません' }[I18N.lang] || 'nothing is saved'); top10El.innerHTML = ''; return; }
    WAR.repaint();
    if (!LB.ready) { LB.renderList(top10El, null); return; }
    const cur = lastFinal;
    const [rows, rank] = await Promise.all([LB.top(10), LB.rank(cur.score), WAR.refresh()]);
    if (cur !== lastFinal) return;
    LB.renderList(top10El, rows);
    if (!cur.done) recordMsg.textContent = rank === null ? '' : rank >= 9999 ? t('over.rank.far') : t('over.rank', { rank });
  }
  async function doSubmit() {
    const cur = lastFinal; if (cur.done || cur.busy) return;
    cur.busy = true; regBtn.disabled = true; regBtn.textContent = t('submitting');
    const r = await LB.submit(cur.score, cur.date);
    cur.busy = false;
    if (r.ok) {
      cur.done = true;
      const f = WAR.byId(LB.profile().faction);
      cur.msg = t('reg.done', { f: t('f.' + f.key), n: I18N.num(cur.score) }) + (r.best ? ' ' + t('reg.done.best') : '');
      recordMsg.textContent = cur.msg; SFX.click && SFX.click();
      renderReg();
      const [rows] = await Promise.all([LB.top(10), WAR.refresh()]);
      LB.renderList(top10El, rows); loadTop3();
    } else { renderReg(); showToast(t('toast.submitFail')); }
  }

  // ───────────── 프로필 (아이디 · 국기 · 세력) ─────────────
  const profEl = document.getElementById('profile'), profName = document.getElementById('profName');
  const flagGrid = document.getElementById('flagGrid'), facGrid = document.getElementById('facGrid');
  let draft = null, afterProfile = null;
  function openProfile(then) {
    const p = LB.profile() || {}; afterProfile = then || null;
    draft = { flag: p.flag || '', faction: p.faction || 0 };
    profName.value = p.name || '';
    const locked = LB.factionLocked();
    flagGrid.innerHTML = WAR.FLAGS.map(c => '<button type="button" data-c="' + c + '"' + (c === draft.flag ? ' class="on"' : '') + '>' + WAR.flagEmoji(c) + '</button>').join('');
    facGrid.innerHTML = WAR.FACTIONS.map(f => '<button type="button" data-f="' + f.id + '"' + (f.id === draft.faction ? ' class="on"' : '') + '><img src="' + f.icon + '" alt=""><span style="color:' + f.color + '">' + t('f.' + f.key) + '</span></button>').join('');
    facGrid.classList.toggle('locked', locked);
    document.getElementById('facLab').textContent = locked ? t('prof.locked') : t('prof.faction');
    delArmed = 0; delBtn.textContent = t('acct.delete'); delBtn.style.display = window.AUTH && AUTH.required() && AUTH.user() ? '' : 'none';
    profEl.classList.add('show');
  }
  flagGrid.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; draft.flag = b.dataset.c; flagGrid.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); SFX.click && SFX.click(); });
  facGrid.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || LB.factionLocked()) return; draft.faction = Number(b.dataset.f); facGrid.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); SFX.click && SFX.click(); });
  document.getElementById('profCancel').addEventListener('click', () => { profEl.classList.remove('show'); afterProfile = null; });
  document.getElementById('profOk').addEventListener('click', () => {
    const name = profName.value.trim();
    if (!name || !draft.flag || !draft.faction) { showToast(t('prof.need')); return; }
    LB.saveProfile({ name, flag: draft.flag, faction: draft.faction });
    profEl.classList.remove('show'); renderReg(); WAR.repaint(); if (state === 'over') renderFacSwitch();
    const next = afterProfile; afterProfile = null; if (next) next();
  });
  // 앱에서는 기록을 올리기 전에 스토어 계정 로그인이 필요하다 (웹은 window.AUTH 가 없어 그대로 진행)
  const loginRow = document.getElementById('loginRow'), loginBtn = document.getElementById('loginBtn');
  const needLogin = () => !!(window.AUTH && AUTH.required() && !AUTH.user());
  function afterLogin() { loginRow.style.display = 'none'; LB.bindUser(); renderReg(); if (LB.profile()) doSubmit(); else openProfile(doSubmit); }
  regBtn.addEventListener('click', () => {
    if (needLogin()) {
      loginBtn.textContent = t('over.login.' + AUTH.provider()); loginBtn.className = 'btn login ' + AUTH.provider();
      loginRow.style.display = ''; regBtn.style.display = 'none'; return;
    }
    if (LB.profile()) doSubmit(); else openProfile(doSubmit);
  });
  loginBtn.addEventListener('click', async () => {
    loginBtn.disabled = true;
    const r = await AUTH.signIn();
    loginBtn.disabled = false;
    if (r.ok) afterLogin(); else showToast(t('toast.loginFail'));
  });
  // 계정 삭제: 한 번 누르면 확인 문구로 바뀌고, 다시 누르면 삭제
  const delBtn = document.getElementById('acctDelete'); let delArmed = 0;
  delBtn.addEventListener('click', async () => {
    if (Date.now() - delArmed > 5000) { delArmed = Date.now(); delBtn.textContent = t('acct.delete.confirm'); return; }
    delBtn.disabled = true; const r = await AUTH.deleteAccount(); delBtn.disabled = false; delArmed = 0;
    if (r.ok) { LB.clearLocal(); profEl.classList.remove('show'); renderReg(); if (state === 'over') renderFacSwitch(); showToast(t('acct.deleted')); }
    else { delBtn.textContent = t('acct.delete'); showToast(t('acct.delete.fail')); }
  });
  // 탭 (점령전 / TOP 10) — 시작 화면과 게임 오버 화면이 같은 탭을 본다
  function setTab(name) {
    document.querySelectorAll('.tabs').forEach(tb => {
      tb.querySelectorAll('.tabbar button').forEach(x => x.classList.toggle('on', x.dataset.tab === name));
      tb.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === name));
      tb.querySelector('.tabbar').style.setProperty('--tabc', { war: '#35c7ff', top: '#b79bff', hall: '#ffd24a' }[name]);
    });
    WAR.repaint();
  }
  document.querySelectorAll('.tabbar').forEach(bar => bar.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { setTab(b.dataset.tab); SFX.click && SFX.click(); } }));
  profEdit.addEventListener('click', () => openProfile(null));

  // ───────────── 난이도 ─────────────
  // 원칙: 반응속도 싸움이 아니라, 리듬에 익숙해질 즈음 패턴이 꼬이게.
  function difficulty() {
    level = Math.floor(time / 24.5);                     // 24.5초마다 한 단계 (11단계 최고조 = 4분 30초)
    const rage = score >= 70000 || level >= 11;           // 최고조: 7만점 또는 11단계
    if (rage) level = Math.max(level, 11);
    // 단계별 동시 어뢰 상한: 처음엔 0 → 2,3 → 5,6 → 8,10 → 12,14,16 → 18,20
    const TORP_STAGES = [0, 2, 3, 5, 6, 8, 10, 12, 14, 16, 18, 20];
    // 흰 잠수정은 어뢰 1발, 빨간은 3발이라 어뢰 공급 = 잠수정 수 × 빨간 비율. 단계가 오를수록 둘 다 ↑
    const SPAWN_GAP  = [2.4, 1.9, 1.6, 1.3, 1.1, 0.95, 0.85, 0.75, 0.65, 0.55, 0.5, 0.45];
    const RED_CHANCE = [0.15, 0.22, 0.30, 0.36, 0.42, 0.46, 0.50, 0.54, 0.58, 0.60, 0.62, 0.65];
    const L = Math.min(level, 11);
    return {
      subSpeed: Math.min(58 + level * 9 + Math.min(level, 6) * 3, W / 1.8), // 잠수정 속도 (상한: 화면을 1.8초에 통과)
      maxTorps: TORP_STAGES[L],
      spawnGap: SPAWN_GAP[L],
      redChance: RED_CHANCE[L],
      twist: level >= 3,                                  // 3단계부터 '꼬임' 패턴
      rage
    };
  }

  // ───────────── 엔티티 ─────────────
  // 잠수정 깊이 구간 / 심해 경계선 (경계선 아래에 있는 잠수정은 보너스)
  const subMinY = () => surfaceY + 70, subMaxY = () => radar.y - 30;
  const deepLineY = () => subMaxY() - (subMaxY() - subMinY()) * DEEP_FRAC;
  const isDeep = s => s.y >= deepLineY();
  function spawnSub(d) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const startX = dir === 1 ? -W * WORLD_MARGIN - SUB_W : W + W * WORLD_MARGIN + SUB_W;
    const minY = subMinY(), maxY = subMaxY();
    // 이미 있는 잠수정과 깊이 겹치지 않게 시도
    let y = 0;
    for (let i = 0; i < 6; i++) {
      // 테스트 모드: 60% 확률로 심해 구역에서 등장
      y = (TEST && Math.random() < 0.6) ? deepLineY() + Math.random() * (maxY - deepLineY()) : minY + Math.random() * (maxY - minY);
      if (subs.every(s => Math.abs(s.y - y) > 26)) break;
    }
    const red = Math.random() < d.redChance;
    let speed = Math.min(d.subSpeed * (red ? 1.35 : 1) * (0.9 + Math.random() * 0.25), W / 1.8);
    // 적 잠수함: 내 세력이 있으면 나머지 두 세력 중 하나 (보스는 그 세력의 보스 잠수함)
    const mf = myFac(), foes = [1, 2, 3].filter(n => n !== mf), fac = mf ? foes[Math.floor(Math.random() * 2)] : 0;
    subs.push({ fac, x: startX, y, dir, red, speed, w: SUB_W, h: SUB_W * 0.43, ammo: TEST ? 0 : (red ? 3 : 1), fireCd: Math.random() * 0.15, hp: 1, wobble: Math.random() * 6.28, phase: 0 });
  }
  function dropBomb() { launch(); }
  function fireTorp(s) {
    if (torps.length >= 20) return;                    // 동시 어뢰 절대 상한
    torps.push({ x: s.x, y: s.y - 6, vy: 150 + level * 8, w: TORP_W, h: TORP_W * 52 / 11, alive: true, splashed: false });
  }
  function explosion(x, y, r, big) {
    const parts = [];
    const n = big ? 34 : 18;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = (big ? 60 : 40) + Math.random() * (big ? 160 : 100);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0.5 + Math.random() * 0.5, size: 2 + Math.random() * (big ? 5 : 3), hot: Math.random() < 0.5 });
    }
    return { x, y, r, t: 0, dur: big ? 1.1 : 0.7, parts, big };
  }
  function addBubble(x, y, big) {
    bubbles.push({ x: x + (Math.random() - 0.5) * 6, y, vy: -(18 + Math.random() * 28), life: 0.8 + Math.random() * 1.2, r: big ? 1.5 + Math.random() * 2.5 : 1 + Math.random() * 1.5 });
  }
  function popText(x, y, str, color) { texts.push({ x, y, str, color, t: 0 }); }
  const ITEM_LIFE = 5;                 // 아이템이 떠 있는 시간(초). 마지막 2초는 빠르게 깜빡인다
  function spawnItem(type) {
    // 군함 바로 옆이 아닌 곳에 나타나게 해서, 먹으려면 직접 가야 한다
    let x = 0, n = 0;
    do { x = 30 + Math.random() * (W - 60); n++; } while (ship && Math.abs(x - ship.x) < 90 && n < 12);
    items.push({ type, x, y: surfaceY, t: 0 });
    for (let k = 0; k < 10; k++) bubbles.push({ x: x + (Math.random() - 0.5) * 22, y: surfaceY + 4, vy: -(40 + Math.random() * 80), life: 0.4 + Math.random() * 0.3, r: 1.5 + Math.random() * 2 });
  }
  function onKill(s) {
    kills++;
    if (kills % SHIELD_EVERY === 0) spawnItem('shield');
  }
  function launch() {
    if (state !== 'play' || bombs.length >= MAX_BOMBS) return;
    if (ship.drill > 0) {
      ship.drill--;
      bombs.push({ type: 'drill', x: ship.x - ship.dir * 6, y: ship.y + 4, vy: 70, w: DRILL_W, h: DRILL_W * 240 / 102, rot: 0, hits: 0, pts: 0 });
      SFX.drill();
      if (ship.drill === 0) popText(ship.x, ship.y - 30, t('drill.end'), '#ffb347');
    } else {
      bombs.push({ type: 'bomb', x: ship.x - ship.dir * 6, y: ship.y + 4, vy: 40, w: BOMB_W, h: BOMB_W * 34 / 44, rot: 0 });
      SFX.drop();
    }
    updateHud();
  }

  // ───────────── 업데이트 ─────────────
  function update(dt) {
    if (state === 'play') time += dt;
    const d = difficulty();

    // 군함 이동
    if (state === 'play') {
      let mv = 0;
      if (input.left) mv -= 1;
      if (input.right) mv += 1;
      if (mv !== 0) { ship.dir = mv; ship.x += mv * ship.speed * dt; }
      SFX.wake(mv !== 0);
      ship.x = Math.max(ship.w * 0.45, Math.min(W - ship.w * 0.45, ship.x));
      if (ship.inv > 0) ship.inv -= dt;
      if (ship.shield > 0) { ship.shield -= dt; if (ship.shield <= 0) { ship.shield = 0; updateHud(); } }
      ship.mv = mv;
      const atEdge = ship.x < ship.w * 0.9 || ship.x > W - ship.w * 0.9;
      ship.campT = atEdge ? (ship.campT || 0) + dt : 0;
      // 드릴 아이템: 무작위 간격으로 등장 (장전 중이거나 이미 떠 있으면 대기)
      drillTimer -= dt;
      if (drillTimer <= 0) {
        if (ship.drill === 0 && !items.some(i => i.type === 'drill')) spawnItem('drill');
        drillTimer = TEST ? 5 + Math.random() * 4 : 30 + Math.random() * 25;
      }
      // 출렁임: 움직이면 진행 방향으로 기울고(롤), 앞뒤로 까딱임(피치) — 시각 효과만
      const targetRoll = -mv * 0.16 + (mv ? Math.sin(time * 7) * 0.05 : 0);
      ship.roll += (targetRoll - ship.roll) * Math.min(1, dt * 6);
      const targetPitch = mv ? Math.sin(time * 5.5) * 3.5 : 0;
      ship.pitch += (targetPitch - ship.pitch) * Math.min(1, dt * 5);
      if (mv !== 0) {
        // 뱃머리 물보라
        if (Math.random() < 0.9) bubbles.push({ x: ship.x + mv * ship.w * 0.5 + (Math.random() - 0.5) * 4, y: ship.y + 3 + Math.random() * 3, vy: -(25 + Math.random() * 45), vx: mv * (20 + Math.random() * 40), life: 0.35 + Math.random() * 0.3, r: 1.2 + Math.random() * 2, foam: true, grav: true });
        // 항적 거품 (뒤쪽)
        if (Math.random() < 0.8) bubbles.push({ x: ship.x - mv * ship.w * (0.3 + Math.random() * 0.25), y: ship.y + 7 + Math.random() * 3, vy: -3, vx: -mv * 12, life: 0.7 + Math.random() * 0.5, r: 1.5 + Math.random() * 2.5, foam: true });
        // 수면 물살 줄기 (배 반대 방향으로 흐름)
        ship.wakeT -= dt;
        if (ship.wakeT <= 0) { ship.wakeT = 0.06; streaks.push({ x: ship.x - mv * ship.w * 0.2, y: ship.y + 6 + Math.random() * 5, vx: -mv * (70 + Math.random() * 50), len: 8 + Math.random() * 14, life: 0.9 }); }
      }
    }

    // 잠수정 생성
    if (state === 'play') {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        if (TEST) {
          // 테스트 모드: 3~5척 동시 등장, 1.5초 간격
          const n = 3 + Math.floor(Math.random() * 3);
          for (let k = 0; k < n; k++) spawnSub(d);
          spawnTimer = 1.5;
        } else {
          spawnSub(d);
          spawnTimer = d.spawnGap * (0.8 + Math.random() * 0.4);
          // 꼬임 패턴: 가끔 반대 방향 2척 동시 등장
          if (d.twist && Math.random() < 0.25) { spawnSub(d); }
        }
      }
    }

    // 잠수정 이동/발사
    for (let i = subs.length - 1; i >= 0; i--) {
      const s = subs[i];
      s.x += s.dir * s.speed * dt;
      s.wobble += dt * 2;
      if (s.x < -W * WORLD_MARGIN - SUB_W * 2 || s.x > W + W * WORLD_MARGIN + SUB_W * 2) { subs.splice(i, 1); continue; }
      // 뒤쪽 거품
      if (s.x > -SUB_W && s.x < W + SUB_W && Math.random() < 0.5) addBubble(s.x - s.dir * s.w * 0.52, s.y + 2, false);
      // 발사: 화면 안에 있는 동안 무작위 시점에 (군함 위치와 무관). 남은 탄약을 화면을 지나는 동안 고르게 쓰도록 확률을 잡음
      if (state === 'play' && s.ammo > 0 && s.x > 0 && s.x < W) {
        s.fireCd -= dt;
        if (s.fireCd <= 0 && torps.length < d.maxTorps) {
          const remain = Math.max(0.3, (s.dir === 1 ? (W - s.x) : s.x) / s.speed); // 화면을 벗어나기까지 남은 시간
          const barrage = d.maxTorps >= 18 && torps.length < d.maxTorps - 3;   // 최고조: 난사
          let rate = (s.ammo / remain) * (barrage ? 3 : 1.6);                  // 초당 발사 기대 횟수
          // 구석 숨기 대응: 군함이 끝에 2.5초 이상 붙어 있으면, 군함 바로 아래를 지나는 잠수정은 즉시 발사
          if (ship.campT > 3 && Math.abs(s.x - ship.x) < ship.w * 0.5) rate *= 2;
          // Y축 겹침 회피: 바로 위에 어뢰가 있으면 잠깐 미룸
          const crowded = torps.some(t => Math.abs(t.x - s.x) < 34 && t.y < s.y && s.y - t.y < 90);
          if (!crowded && Math.random() < rate * dt) {
            fireTorp(s); s.ammo--;
            s.fireCd = s.ammo > 0 ? (barrage ? 0.2 : 0.35 + Math.random() * 0.4) : 0;
          }
        }
      }
    }

    // 아이템 (수면에 떠서 흘러감 → 군함이 닿으면 획득)
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.t += dt;
      if (it.t > ITEM_LIFE) { items.splice(i, 1); continue; }
      if (state === 'play' && Math.abs(it.x - ship.x) < ship.w * 0.5 + 10) {
        items.splice(i, 1);
        SFX.pickup();
        if (it.type === 'shield') { ship.shield = SHIELD_TIME; SFX.shieldOn(); popText(ship.x, ship.y - 34, 'SHIELD!', '#8fe3ff'); }
        else { ship.drill = DRILL_SHOTS; popText(ship.x, ship.y - 34, 'DRILL x' + DRILL_SHOTS, '#ffb347'); }
        updateHud();
      }
    }

    // 폭탄/드릴 낙하
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      const isDrill = b.type === 'drill';
      b.vy = isDrill ? Math.min(b.vy + 30 * dt, 120) : Math.min(b.vy + 22 * dt, 88);   // 천천히 가속, 상한
      b.y += b.vy * dt; b.rot += dt * (isDrill ? 14 : 0.8 * (i % 2 ? 1 : -1));
      if (Math.random() < (isDrill ? 1 : 0.7)) addBubble(b.x + (isDrill ? (Math.random() - 0.5) * 10 : 0), b.y - 8, true);
      let hit = false;
      for (let j = subs.length - 1; j >= 0; j--) {
        const s = subs[j];
        if (Math.abs(b.x - s.x) < s.w * 0.48 && Math.abs(b.y - s.y) < s.h * 0.6 + (isDrill ? 12 : 6)) {
          subs.splice(j, 1); hit = true;
          const deep = isDeep(s);
          const pts = deep ? (s.red ? DEEP_PTS.red : DEEP_PTS.white) : (s.red ? 300 : 100);
          if (isDrill) {
            // 드릴 연속 격파: 이 드릴이 잡은 점수 합계 × 격파 수 (누적 차액만큼 가산)
            const prevTotal = b.pts * b.hits;
            b.pts += pts; b.hits++;
            score += b.pts * b.hits - prevTotal; updateHud();
            if (b.hits >= 2) popText(s.x, s.y - 38, 'x' + b.hits + ' COMBO ' + (b.pts * b.hits).toLocaleString(), '#ffb347');
          } else score += pts;
          fx.push(explosion(s.x, s.y, s.red ? 46 : 36, s.red));
          popText(s.x, s.y - 20, '+' + pts + (deep ? ' DEEP' : ''), deep ? '#ffd77a' : (s.red ? '#ff5a4a' : '#ffffff'));
          if (s.red) { SFX.boom(true); SFX.points(); } else SFX.boom(false);
          for (let k = 0; k < 10; k++) addBubble(s.x + (Math.random() - 0.5) * 40, s.y, true);
          onKill(s);
          if (isDrill) { hit = false; continue; }   // 드릴은 뚫고 계속 내려감
          break;
        }
      }
      if (hit) { bombs.splice(i, 1); updateHud(); continue; }
      if (b.y > seabedY) {
        bombs.splice(i, 1);
        for (let k = 0; k < 8; k++) bubbles.push({ x: b.x + (Math.random() - 0.5) * 20, y: b.y, vy: -(10 + Math.random() * 20), life: 0.8, r: 1 + Math.random() * 2, dust: true });
        updateHud();
      }
    }

    // 어뢰 상승
    for (let i = torps.length - 1; i >= 0; i--) {
      const t = torps[i];
      t.y -= t.vy * dt;
      if (Math.random() < 0.8) addBubble(t.x, t.y + t.h * 0.5, false);
      if (state === 'play' && t.alive && Math.abs(t.y - ship.y) < ship.h * 0.5 && Math.abs(t.x - ship.x) < ship.w * 0.42) {
        // 군함 피격
        t.alive = false; torps.splice(i, 1);
        if (ship.shield > 0) {
          // 쉴드에 튕겨나감
          SFX.deflect();
          fx.push(explosion(t.x, ship.y + 6, 16, false));
          for (let k = 0; k < 10; k++) bubbles.push({ x: t.x + (Math.random() - 0.5) * 10, y: ship.y + 4, vy: -(60 + Math.random() * 100), vx: (Math.random() - 0.5) * 120, life: 0.5, r: 1.5 + Math.random() * 2, foam: true, grav: true });
          continue;
        }
        if (ship.inv <= 0) {
          hp = Math.max(0, hp - HIT_DMG); ship.inv = 0.6; shake = 12;
          fx.push(explosion(t.x, ship.y, 30, false));
          SFX.hit();
          flash.style.transition = 'none'; flash.style.opacity = 0.45;
          requestAnimationFrame(() => { flash.style.transition = 'opacity .5s'; flash.style.opacity = 0; });
          updateHud();
          if (hp <= 0) gameOver();
        }
        continue;
      }
      if (!t.splashed && t.y < surfaceY) {
        t.splashed = true;
        for (let k = 0; k < 14; k++) bubbles.push({ x: t.x + (Math.random() - 0.5) * 14, y: surfaceY, vy: -(60 + Math.random() * 120), life: 0.5 + Math.random() * 0.4, r: 1.5 + Math.random() * 2.5, foam: true, grav: true });
      }
      if (t.y < -t.h) torps.splice(i, 1);   // 하늘로 사라짐
    }

    // 효과
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i]; e.t += dt;
      for (const p of e.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 30 * dt; p.vx *= 0.96; p.life -= dt; }
      if (e.t > e.dur) fx.splice(i, 1);
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]; b.life -= dt; b.y += b.vy * dt; if (b.vx) { b.x += b.vx * dt; b.vx *= 0.95; }
      if (b.grav) b.vy += 260 * dt;
      b.x += Math.sin(b.life * 12) * 0.3;
      if (b.life <= 0 || (!b.grav && b.y < surfaceY - 2)) bubbles.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { texts[i].t += dt; if (texts[i].t > 1) texts.splice(i, 1); }
    for (let i = streaks.length - 1; i >= 0; i--) { const s = streaks[i]; s.life -= dt; s.x += s.vx * dt; s.vx *= 0.97; if (s.life <= 0) streaks.splice(i, 1); }
    if (shake > 0) shake = Math.max(0, shake - dt * 40);
    radarAngle += dt * 1.6;
    if (bubbles.length > 400) bubbles.splice(0, bubbles.length - 400);
  }

  // ───────────── HUD ─────────────
  function updateHud() {
    scoreText.textContent = String(Math.min(score, 999999)).padStart(6, '0');
    const drillMode = ship && ship.drill > 0;
    hudEl.classList.toggle('drill', !!drillMode);
    hudDrill.style.display = drillMode ? '' : 'none';
    bombN.textContent = drillMode ? ship.drill : (MAX_BOMBS - bombs.length);
    bombMax.textContent = drillMode ? DRILL_SHOTS : MAX_BOMBS;
    hpFill.style.boxShadow = (ship && ship.shield > 0) ? '0 0 12px #46c3ff, 0 0 4px #fff' : '';
    hpFill.style.width = hp + '%';
    hpFill.className = 'hp-fill' + (hp <= 25 ? ' danger' : hp <= 50 ? ' warn' : '');
    hpText.textContent = hp + '%';
  }

  // ───────────── 그리기 ─────────────
  // 내 세력 (아직 안 골랐으면 0 → 원래 그림)
  function myFac() { try { const p = LB.profile(); return (p && p.faction | 0) || 0; } catch (e) { return 0; } }
  function okImg(im) { return im && im.complete && im.naturalWidth; }
  // 군함: 세력이 있으면 세력 군함
  function drawShip(cy, flip, rot) {
    const f = myFac(), im = f && IMG['ship_f' + f];
    if (!okImg(im)) { drawSprite(IMG.ship, ship.x, cy, ship.w, ship.h, flip, rot); return; }
    drawSprite(im, ship.x, cy, ship.w, ship.h, flip, rot);   // 원래 군함과 같은 크기·자리 (판정 그대로)
  }
  function drawSprite(im, x, y, w, h, flip, rot) {
    if (!im.complete || !im.naturalWidth) return;
    ctx.save(); ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(im, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function render() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.translate(0, offY);   // 전장은 화면 안에서 offY 만큼 내려간 곳에 그린다
    // 배경
    if (IMG.bg.complete && IMG.bg.naturalWidth) {
      const bw = BG_W * bgScale, bh = BG_H * bgScale, below = viewH - offY - (bgY + bh);
      // 세로가 남는 화면: 위는 하늘, 아래는 해저를 배경 가장자리에서 늘려 채운다 (게임 영역은 그대로)
      if (offY + bgY > 0.5) { const sk = ctx.createLinearGradient(0, -offY, 0, bgY + 2); sk.addColorStop(0, '#1f5fb8'); sk.addColorStop(1, '#4194e6'); ctx.fillStyle = sk; ctx.fillRect(0, -offY - 20, W, offY + bgY + 21); }
      if (below > 0.5) { const gr = ctx.createLinearGradient(0, bgY + bh, 0, bgY + bh + below); gr.addColorStop(0, '#292928'); gr.addColorStop(1, '#04101c'); ctx.fillStyle = gr; ctx.fillRect(0, bgY + bh - 1, W, below + 21); }
      ctx.drawImage(IMG.bg, bgX, bgY, bw, bh);
      if (offY + bgY > 0.5) { const g1 = ctx.createLinearGradient(0, bgY, 0, bgY + 26); g1.addColorStop(0, '#4194e6'); g1.addColorStop(1, '#4194e600'); ctx.fillStyle = g1; ctx.fillRect(0, bgY - 1, W, 27); }
      if (below > 0.5) { const g2 = ctx.createLinearGradient(0, bgY + bh - 30, 0, bgY + bh); g2.addColorStop(0, '#29292800'); g2.addColorStop(1, '#292928'); ctx.fillStyle = g2; ctx.fillRect(0, bgY + bh - 30, W, 31); }
    } else { ctx.fillStyle = '#0b3a5e'; ctx.fillRect(0, -offY, W, viewH); }

    // 거품/물보라
    for (const b of bubbles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, b.life)) * (b.dust ? 0.5 : 0.85);
      ctx.fillStyle = b.dust ? '#c9c2a0' : '#e6f7ff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 심해 경계선 (아래쪽 잠수정 격파 시 보너스)
    {
      const dy = deepLineY();
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 215, 122, 0.55)'; ctx.lineWidth = 1; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(0, dy); ctx.lineTo(W, dy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 215, 122, 0.85)'; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText((window.I18N ? I18N.t('deep') : '심해') + ' +' + DEEP_PTS.white + ' / +' + DEEP_PTS.red, 6, dy + 12);
      ctx.restore();
    }
    // 잠수정
    for (const s of subs) {
      if (s.x < -s.w || s.x > W + s.w) continue;
      const yy = s.y + Math.sin(s.wobble) * 2;
      const sim = s.fac && IMG[(s.red ? 'sub_b' : 'sub_n') + s.fac];
      if (okImg(sim)) drawSprite(sim, s.x, yy, s.w, s.h, s.dir === -1, 0);   // 원래 잠수함과 같은 크기
      else drawSprite(s.red ? IMG.subR : IMG.subW, s.x, yy, s.w, s.h, s.dir === -1, 0);
      // 남은 어뢰 표시 (등 위에 작은 어뢰 아이콘)
      if (s.ammo > 0 && IMG.torpedo.complete && IMG.torpedo.naturalWidth) {
        const tw = 4, th = 13, gap = 2, n = s.ammo;
        const startX = s.x - s.dir * s.w * 0.05 - ((n - 1) * (tw + gap)) / 2;
        for (let k = 0; k < n; k++) ctx.drawImage(IMG.torpedo, startX + k * (tw + gap) - tw / 2, yy - s.h * 0.55 - th, tw, th);
      }
      // 잠망경 불빛
      ctx.fillStyle = s.red ? '#ff3b2f' : '#dff6ff';
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(s.wobble * 3);
      ctx.beginPath(); ctx.arc(s.x + s.dir * 2, yy - s.h * 0.62, 2.2, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 어뢰 (물속 + 하늘)
    for (const t of torps) {
      drawSprite(IMG.torpedo, t.x, t.y, t.w, t.h, false, 0);
      if (t.y > surfaceY) { // 분사 광선
        const g = ctx.createLinearGradient(0, t.y + t.h * 0.5, 0, t.y + t.h * 0.5 + 40);
        g.addColorStop(0, 'rgba(180,235,255,.8)'); g.addColorStop(1, 'rgba(180,235,255,0)');
        ctx.fillStyle = g; ctx.fillRect(t.x - 1.5, t.y + t.h * 0.5, 3, 40);
      }
    }

    // 폭탄 / 드릴
    for (const b of bombs) {
      if (b.type === 'drill') {
        // 회전하는 느낌: 좌우로 살짝 흔들림 + 주황 빛
        ctx.save(); ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 10;
        drawSprite(IMG.drill, b.x, b.y, b.w, b.h, Math.sin(b.rot) > 0, Math.sin(b.rot * 0.5) * 0.06);
        ctx.restore();
      } else drawSprite(IMG.bomb, b.x, b.y, b.w, b.h, false, Math.sin(b.rot) * 0.25);
    }
    // 아이템 (수면)
    for (const it of items) {
      const bob = Math.sin(it.t * 3) * 2.5;
      const im = it.type === 'shield' ? IMG.shield : IMG.drill;
      const w = it.type === 'shield' ? 30 : 18, h = it.type === 'shield' ? 32 : 42;
      const left = ITEM_LIFE - it.t, blink = left < 2 ? (Math.sin(it.t * 22) > 0 ? 1 : 0.25) : 0.85 + 0.15 * Math.sin(it.t * 6);
      const pop = Math.min(1, it.t / 0.18);   // 나타날 때 톡 튀어나오는 느낌
      ctx.save(); ctx.globalAlpha = blink;
      ctx.shadowColor = it.type === 'shield' ? '#46c3ff' : '#ffb347'; ctx.shadowBlur = 14;
      drawSprite(im, it.x, surfaceY - 8 + bob, w * pop, h * pop, false, Math.sin(it.t * 2) * 0.12);
      ctx.restore();
      // 물결
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#eaf9ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(it.x, surfaceY + 8, 14 + Math.sin(it.t * 3) * 3, 3, 0, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
    }

    // 수면 물살 줄기
    ctx.lineCap = 'round'; ctx.lineWidth = 1.5;
    for (const s of streaks) { ctx.globalAlpha = Math.max(0, s.life) * 0.7; ctx.strokeStyle = '#eaf9ff'; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.sign(s.vx || 1) * s.len, s.y + 0.5); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // 군함
    if (ship && state !== 'over') {
      const bob = Math.sin(time * 2.2) * 1.5 + (ship.mv ? Math.sin(time * 9) * 1.2 : 0) + ship.pitch * 0.3;
      const rot = Math.sin(time * 2.2) * 0.02 + ship.roll * (ship.dir === -1 ? -1 : 1);
      if (!(ship.inv > 0 && Math.floor(time * 20) % 2 === 0)) drawShip(ship.y - ship.h * 0.35 + bob, ship.dir === -1, rot);
      // 쉴드 보호막
      if (ship.shield > 0) {
        const ending = ship.shield < 2 && Math.floor(time * 8) % 2 === 0;
        const r = ship.w * 0.62;
        ctx.save(); ctx.globalAlpha = ending ? 0.25 : 0.55 + 0.15 * Math.sin(time * 6);
        const g = ctx.createRadialGradient(ship.x, ship.y - 4, r * 0.5, ship.x, ship.y - 4, r);
        g.addColorStop(0, 'rgba(70,195,255,0)'); g.addColorStop(0.8, 'rgba(70,195,255,.25)'); g.addColorStop(1, 'rgba(160,230,255,.9)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ship.x, ship.y - 4, r, r * 0.62, 0, 0, 6.283); ctx.fill();
        ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 1.5; ctx.shadowColor = '#46c3ff'; ctx.shadowBlur = 10; ctx.stroke();
        ctx.restore();
        ctx.font = '700 9px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#bfefff';
        ctx.fillText('SHIELD ' + Math.ceil(ship.shield), ship.x, ship.y - ship.h - 8);
      }
    } else if (ship && state === 'over') {
      const sink = Math.min(1, (fx.length ? 0.4 : 1));
      drawShip(ship.y - ship.h * 0.35 + sink * 30, ship.dir === -1, 0.35 * sink);
    }

    // 폭발
    for (const e of fx) {
      const k = e.t / e.dur;
      ctx.globalAlpha = (1 - k) * 0.9;
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * (0.4 + k));
      g.addColorStop(0, '#fff6d0'); g.addColorStop(0.35, '#ffb347'); g.addColorStop(0.7, 'rgba(255,90,40,.6)'); g.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.4 + k), 0, 6.283); ctx.fill();
      for (const p of e.parts) {
        if (p.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.hot ? '#ffd27a' : '#ff6a3a';
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;

    // 점수 팝업
    ctx.font = '800 16px Orbitron, sans-serif'; ctx.textAlign = 'center';
    for (const t of texts) {
      ctx.globalAlpha = 1 - t.t; ctx.fillStyle = t.color;
      ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
      ctx.fillText(t.str, t.x, t.y - t.t * 30);
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.restore();

    ctx.save(); ctx.translate(0, offY); drawRadar(); ctx.restore();   // 레이더도 전장과 함께 내려 그린다
    // 레벨 표시 (작게)
    if (state === 'play') {
      ctx.font = '600 10px Orbitron, sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(200,230,255,.75)';
      ctx.fillText('LV ' + (level + 1), W - 132, 20);
    }
  }

  // ───────────── 레이더 ─────────────
  function drawRadar() {
    const R = radar;
    // 화면: 레이더 가로 = 월드 전체 폭 (양옆 여백 포함)
    const worldL = -W * WORLD_MARGIN, worldW = W * (1 + 2 * WORLD_MARGIN);
    const mx = x => R.ix + ((x - worldL) / worldW) * R.iw;
    const depthMin = surfaceY, depthMax = radar.y;
    const my = y => R.iy + R.ih * (0.16 + 0.78 * Math.max(0, Math.min(1, (y - depthMin) / (depthMax - depthMin))));

    ctx.save();
    ctx.beginPath(); ctx.rect(R.ix, R.iy, R.iw, R.ih); ctx.clip();
    ctx.fillStyle = '#04140a'; ctx.fillRect(R.ix, R.iy, R.iw, R.ih);
    // 격자
    ctx.strokeStyle = 'rgba(60,200,90,.28)'; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) { const x = R.ix + R.iw * i / 6; ctx.beginPath(); ctx.moveTo(x, R.iy); ctx.lineTo(x, R.iy + R.ih); ctx.stroke(); }
    for (let i = 1; i < 4; i++) { const y = R.iy + R.ih * i / 4; ctx.beginPath(); ctx.moveTo(R.ix, y); ctx.lineTo(R.ix + R.iw, y); ctx.stroke(); }
    // 수면선
    ctx.strokeStyle = 'rgba(120,255,140,.8)'; ctx.beginPath(); ctx.moveTo(R.ix, my(surfaceY)); ctx.lineTo(R.ix + R.iw, my(surfaceY)); ctx.stroke();
    // 화면 경계 (점선) — 이 안쪽이 실제 보이는 영역
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(160,255,170,.9)'; ctx.lineWidth = 1.2;
    for (const x of [mx(0), mx(W)]) { ctx.beginPath(); ctx.moveTo(x, R.iy); ctx.lineTo(x, R.iy + R.ih); ctx.stroke(); }
    ctx.setLineDash([]);
    // 해저 실루엣
    ctx.fillStyle = 'rgba(40,160,70,.55)'; ctx.beginPath(); ctx.moveTo(R.ix, R.iy + R.ih);
    for (let i = 0; i <= 12; i++) { const x = R.ix + R.iw * i / 12; ctx.lineTo(x, R.iy + R.ih - R.ih * (0.06 + 0.07 * Math.abs(Math.sin(i * 1.7 + 0.5)))); }
    ctx.lineTo(R.ix + R.iw, R.iy + R.ih); ctx.closePath(); ctx.fill();
    // 스캔 (좌우로 훑는 부채꼴)
    const sx = R.ix + R.iw * (0.5 + 0.5 * Math.sin(radarAngle));
    const g = ctx.createLinearGradient(sx - 40, 0, sx, 0);
    g.addColorStop(0, 'rgba(80,255,120,0)'); g.addColorStop(1, 'rgba(80,255,120,.35)');
    ctx.fillStyle = g; ctx.fillRect(sx - 40, R.iy, 40, R.ih);
    ctx.strokeStyle = 'rgba(160,255,180,.9)'; ctx.beginPath(); ctx.moveTo(sx, R.iy); ctx.lineTo(sx, R.iy + R.ih); ctx.stroke();

    // 군함
    if (ship) {
      const x = mx(ship.x), y = my(surfaceY) - 3;
      ctx.fillStyle = '#7dff8a'; ctx.shadowColor = '#5cff70'; ctx.shadowBlur = 6;
      ctx.fillRect(x - 7, y - 2, 14, 3); ctx.fillRect(x - 3, y - 5, 6, 3); ctx.fillRect(x - 1, y - 8, 2, 3);
    }
    // 잠수정 (레이더 전체 범위, 화면 밖 포함)
    const blink = Math.floor(performance.now() / 180) % 2 === 0;
    for (const s of subs) {
      const x = mx(s.x), y = my(s.y);
      if (s.red && !blink) { ctx.fillStyle = '#ffb0a0'; } else ctx.fillStyle = s.red ? '#ff6a5a' : '#8dff9a';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
      ctx.fillRect(x - 5, y - 1.5, 10, 3); ctx.fillRect(x - 1.5, y - 4, 3, 3);
      ctx.fillRect(x + s.dir * 5, y - 1, 2, 2);
    }
    ctx.shadowBlur = 0;
    // 주사선 느낌
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = R.iy; y < R.iy + R.ih; y += 3) ctx.fillRect(R.ix, y, R.iw, 1);
    ctx.restore();
    // 틀
    if (IMG.radar.complete && IMG.radar.naturalWidth) ctx.drawImage(IMG.radar, R.x, R.y, R.w, R.h);
  }

  // ───────────── 루프 ─────────────
  function loop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
    if (state !== 'idle') update(dt); else radarAngle += dt * 1.6;
    render();
    requestAnimationFrame(loop);
  }

  // ───────────── 입력 ─────────────
  function bindHold(el, key) {
    const on = e => { e.preventDefault(); input[key] = true; el.classList.add('pressed'); SFX.unlock(); };
    const off = e => { input[key] = false; el.classList.remove('pressed'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  bindHold(document.getElementById('zLeft'), 'left');
  bindHold(document.getElementById('zRight'), 'right');
  const zBomb = document.getElementById('zBomb');
  zBomb.addEventListener('pointerdown', e => { e.preventDefault(); zBomb.classList.add('pressed'); dropBomb(); });
  const bombOff = () => zBomb.classList.remove('pressed');
  zBomb.addEventListener('pointerup', bombOff); zBomb.addEventListener('pointercancel', bombOff); zBomb.addEventListener('pointerleave', bombOff);
  zBomb.addEventListener('contextmenu', e => e.preventDefault());

  // 키보드 (PC 테스트용)
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
    if (e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); if (state === 'play') dropBomb(); }
    if (e.key === 'Enter' && state === 'idle') start();
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
  });

  // 조작 방식: 양손(기본) / 한손, 한손일 때 좌수·우수
  const ctlMode = document.getElementById('ctlMode'), ctlHand = document.getElementById('ctlHand');
  function applyCtl() {
    const one = localStorage.getItem('savetheocean_ctrl') === 'one';
    const left = localStorage.getItem('savetheocean_lefthand') === '1';
    panel.classList.toggle('one', one); panel.classList.toggle('left-hand', one && left);
    ctlMode.textContent = one ? t('ctl.one') : t('ctl.two');
    ctlHand.textContent = left ? t('ctl.left') : t('ctl.right');
    ctlHand.classList.toggle('show', one);
  }
  applyCtl();
  ctlMode.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const one = localStorage.getItem('savetheocean_ctrl') === 'one'; localStorage.setItem('savetheocean_ctrl', one ? 'two' : 'one'); applyCtl(); SFX.click(); showToast(one ? t('toast.two') : t('toast.one')); });
  ctlHand.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const left = localStorage.getItem('savetheocean_lefthand') === '1'; localStorage.setItem('savetheocean_lefthand', left ? '0' : '1'); applyCtl(); SFX.click(); showToast(left ? t('toast.right') : t('toast.left')); });

  // 사운드: 배경음(바다·심해) / 효과음 따로
  const bgmBtn = document.getElementById('bgmBtn'), sfxBtn = document.getElementById('sfxBtn');
  function applyBgm(m) { SFX.setBgmMuted(m); bgmBtn.classList.toggle('off', m); localStorage.setItem('savetheocean_bgm_muted', m ? '1' : '0'); }
  function applySfx(m) { SFX.setSfxMuted(m); sfxBtn.classList.toggle('off', m); localStorage.setItem('savetheocean_sfx_muted', m ? '1' : '0'); }
  applyBgm(localStorage.getItem('savetheocean_bgm_muted') === '1');
  applySfx(localStorage.getItem('savetheocean_sfx_muted') === '1');
  bgmBtn.addEventListener('click', () => { applyBgm(!SFX.isBgmMuted()); showToast(SFX.isBgmMuted() ? t('toast.bgmOff') : t('toast.bgmOn')); });
  sfxBtn.addEventListener('click', () => { applySfx(!SFX.isSfxMuted()); showToast(SFX.isSfxMuted() ? t('toast.sfxOff') : t('toast.sfxOn')); });

  // 시작/재시작/랭킹
  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('retryBtn').addEventListener('click', () => {
    // 올리지 않고 넘어간 판은 순위 계산용 무명 기록으로만 남김
    if (!TEST && lastFinal && !lastFinal.done && lastFinal.score > 0) { lastFinal.done = true; LB.recordPlay(lastFinal.score, lastFinal.date); }
    start();
  });

  let toastTimer = 0;
  // ───────────── 게임 오버 화면의 세력 변경 (조작판 자리) ─────────────
  //  STO_CONFIG.FACTION_SWITCH: 'free' = 지금은 누구나 바꿀 수 있음(시험용) / 'off' = 잠금 (나중에 결제·기록 보상으로 열 예정)
  const fsRow = document.querySelector('#facSwitch .fs-row'); let fsArmed = 0, fsT = 0;
  function renderFacSwitch() {
    const p = LB.profile(), cur = p ? p.faction : 0, open = (window.STO_CONFIG || {}).FACTION_SWITCH !== 'off';
    fsRow.innerHTML = WAR.FACTIONS.map(f => '<button type="button" data-f="' + f.id + '" style="--fc:' + f.color + '" class="' + (f.id === cur ? 'on' : '') + (f.id === fsArmed ? ' armed' : '') + '"' + (open ? '' : ' disabled') + '><img src="' + f.icon + '" alt=""><span>' + t('f.' + f.key) + '</span></button>').join('');
  }
  fsRow.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled || state !== 'over') return;
    const n = Number(b.dataset.f), p = LB.profile();
    if (!p) { openProfile(); return; }                       // 프로필이 없으면 프로필 만들기부터
    if (n === p.faction) { fsArmed = 0; renderFacSwitch(); return; }
    if (fsArmed !== n) {                                      // 실수로 바뀌지 않게: 한 번 더 눌러야 바뀐다
      fsArmed = n; renderFacSwitch(); showToast(t('fs.confirm', { f: t('f.' + WAR.byId(n).key) }));
      clearTimeout(fsT); fsT = setTimeout(() => { fsArmed = 0; renderFacSwitch(); }, 2500); return;
    }
    clearTimeout(fsT); fsArmed = 0;
    LB.saveProfile(Object.assign({}, p, { faction: n }));
    renderFacSwitch(); renderReg(); WAR.repaint();
    showToast(t('fs.done', { f: t('f.' + WAR.byId(n).key) }));
  });
  document.addEventListener('i18n:change', () => { if (state === 'over') renderFacSwitch(); });
  // 게임 그만하기: 한 번 누르면 확인, 2초 안에 한 번 더 누르면 바로 게임 오버(점수 등록 화면)
  const quitBtn = document.getElementById('quitBtn'); let quitT = 0;
  quitBtn.addEventListener('click', e => {
    e.stopPropagation(); if (state !== 'play') return;
    if (quitBtn.classList.contains('armed')) { clearTimeout(quitT); quitBtn.classList.remove('armed'); gameOver(); return; }
    quitBtn.classList.add('armed'); showToast(t('quit.confirm'));
    clearTimeout(quitT); quitT = setTimeout(() => quitBtn.classList.remove('armed'), 2000);
  });
  function showToast(msg) { toast.textContent = msg; toast.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.style.opacity = 0; }, 1600); }

  // 화면 전환 시 입력 리셋
  document.addEventListener('visibilitychange', () => { input.left = input.right = false; });

  // 테스트용 훅
  window.__savetheocean = { forceOver() { if (state === 'play') { hp = 0; updateHud(); gameOver(); } }, spawnItem, giveDrill() { ship.drill = DRILL_SHOTS; updateHud(); }, giveShield() { ship.shield = SHIELD_TIME; updateHud(); }, cheat(s, t) { score = s; time = t; updateHud(); }, get torps() { return torps.length; }, get subs() { return subs.length; }, get state() { return state; } };

  // ───────────── 초기화 ─────────────
  resize();
  reset();
  function renderBest() { const best = LB.localBest(); bestLine.textContent = best ? t('best', { n: I18N.num(best) }) : ''; }
  renderBest();
  const top3El = document.getElementById('top3');
  async function loadTop3() { LB.renderList(top3El, await LB.top(10)); }
  WAR.mount(document.getElementById('warStart')); WAR.mount(document.getElementById('warOver')); WAR.refresh();
  loadTop3();
  document.querySelectorAll('.hall-pane').forEach(el => LB.renderSeasons(el));
  // 언어 전환 (🌐): ko → en → ja
  document.getElementById('langBtn').addEventListener('click', () => { I18N.toggle(); });
  // 모든 버튼: 누를 때 '탁' 소리 / 시작 화면에서는 배경 음악
  document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('button')) SFX.click(); }, true);
  SFX.titleStart();
  document.addEventListener('i18n:change', () => { applyCtl(); renderBest(); loadTop3(); document.querySelectorAll('.hall-pane').forEach(el => LB.renderSeasons(el)); WAR.repaint(); if (state === 'over') showOver(); });
  // 공지 팝업 (오늘 하루 보지 않기: 내용 해시 + 날짜로 기억)
  LB.notice().then(n => {
    if (!n || !n.active) return;
    const key = 'savetheocean_notice_hide';
    let h = 0; const str = n.title + '|' + n.body; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(key) === h + '|' + today) return;
    document.getElementById('noticeTitle').textContent = n.title;
    document.getElementById('noticeBody').textContent = n.body;
    document.getElementById('noticeOk').textContent = n.button || t('notice.ok');
    const el = document.getElementById('notice'); el.classList.add('show');
    document.getElementById('noticeOk').addEventListener('click', () => {
      if (document.getElementById('noticeHide').checked) localStorage.setItem(key, h + '|' + today);
      el.classList.remove('show');
    });
  });
  const visitsEl = document.getElementById('visits');
  if (TEST) { visitsEl.textContent = '🧪 TEST MODE'; document.getElementById('hall').style.display = 'none'; }
  else LB.visit(); if (false) LB.visit().then(v => { visitsEl.textContent = v ? t('visits', { today: LB.fmtCount(v.today), total: LB.fmtCount(v.total) }) : t('visits.empty'); });
  requestAnimationFrame(t => { lastT = t; loop(t); });
})();
