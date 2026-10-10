/* TANK RUMBLE — 테스트 빌드 (1인 점수 모드)
   규칙 요약
   - 보드 8×10. 위 4줄은 적 진영(안개). 블록을 끌어 놓고 가로/세로 줄을 채우면 지워진다(탱크 칸은 채워진 것으로 친다).
   - 지워진 칸의 자원 아이콘을 얻는다: ⛽연료(1개=3칸, 최대 15칸) 🔭정찰(5초 전체 공개) 🚀미사일(탱크 세로줄 위 가장 가까운 적 1대)
   - 탱크는 빈 칸으로만, 가고 싶은 칸을 누르면 최단 경로로 이동(칸 수만큼 연료 소모). 병사는 쏘지 않는다.
   - 최전방 줄에 병사 1~2명이 정해진 열에 서 있다(좌우 이동 없음). 40초마다 줄 전체가 한 칸 내려온다: 그 줄의 블록은 사라지고 탱크가 있으면 격파.
   - 최전방 줄의 병사를 전부 잡으면 줄이 한 칸 뒤로 물러나고 새 병사가 선다.
   - 게임오버: 남은 블록을 놓을 곳이 없거나, 탱크 격파.
   - 점수: 줄 100, 여러 줄 동시에 +100씩 추가, 적 격파 300.
*/
(function () {
  'use strict';
  var COLS = 7, ROWS = 9, EROWS = 4, S = 68, FOG_MAX = 9;  // 7×9. 혼자: 칸 68, 안개 4줄. 대전: 칸 60, 위쪽은 상대 진영 9줄(한 줄 26px) — 한 전장을 위아래로 나눠 씀
  var W = COLS * S, TOP = 22, HUD = 26, TRAY = 96, BBAR = 48, FS = 44;   // FS: 위쪽(적진) 한 줄 높이       // 위: 진격 타이머 띠. 보드 아래: 연료·점수 한 줄(HUD) → 블록 받침(TRAY) → 맨 바닥 넓고 얇은 버튼 띠(BBAR)
  var EY, BY, HY, TY, OY, H, ADV_MIN, SLOTS = 13, PW = 60, WT, OFFY = 0, HL = 0;   // PW: 오른쪽 정보 패널 폭(화면 남는 만큼 늘어남), WT: 전체 폭, OFFY: 세로 남는 공간을 위아래로 나눈 여백            // SLOTS: 대전 사거리 칸 수 = 안개 4 + 상대 진영 9
  function layout(vs) {
    if (vs) { S = 60; FS = 40; EROWS = 9; TOP = 20; HUD = 24; TRAY = 80; BBAR = 44; } else { S = 68; FS = 44; EROWS = 4; TOP = 22; HUD = 26; TRAY = 96; BBAR = 48; }
    W = COLS * S; WT = W + PW; groundImg = null; EY = TOP; BY = TOP + EROWS * FS; HY = BY + ROWS * S; TY = HY + HUD; OY = TY + TRAY; H = OY + BBAR; ADV_MIN = -(EROWS - 1); }
  layout(false);
  var FUEL_PER = 3, FUEL_MAX = 15, SCOUT_MS = 5000, ADV_MS = 30000, ADV_STEP = 5000, ADV_FLOOR = 20000, ADV_EVERY = 180000, HP_MAX = 3;
  function advMs(t) { return G.vs ? ADV_MS : Math.max(ADV_FLOOR, ADV_MS - ADV_STEP * Math.floor((t - G.start) / ADV_EVERY)); }   // 3분마다 5초씩 빨라짐, 최저 20초
  var SCOUT_MAX = 5, MISSILE_MAX = 5, INF_MAX = 5;
  var ULT_MAX = 10, STORM_MS = 20000, SHIELD_HP = 2, BOLTS = 3;                       // 필살기: 줄 10개 = 게이지 100%(넘침 없음)
  var FAC = {
    surge: { name: '서지', skill: '폭풍우', col: '#4fd8ff', img: 'f_surge', desc: '내 땅 전체에 폭풍우 20초. 상대 정찰기는 뜨자마자 추락, 상대가 아는 내 마지막 위치도 지워짐' },
    gale:  { name: '게일', skill: '낙뢰',   col: '#c58bff', img: 'f_gale',  desc: '적 보병 3명에게 벼락(최전방부터)' },
    solar: { name: '솔라', skill: '태양 방패', col: '#ffd451', img: 'f_solar', desc: '탱크에 보호막 — 미사일 2발을 막아냄' }
  };
  function fac() { return FAC[G.fac] || FAC.solar; }
  var RES = { 0: null, 1: null, 2: '⛽', 3: '🔭', 4: '🚀', 5: '🪖' };     // 칸 값: 0 빈칸 1 블록 2 연료 3 정찰 4 미사일 5 보병(대전)
  var SHAPES = [
    [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [2, 0], [1, 1]], [[1, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [0, 1], [1, 1], [0, 2]], [[1, 0], [0, 1], [1, 1], [1, 2]],
    [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 0], [0, 1], [1, 1], [1, 2]], [[1, 0], [0, 1], [1, 1], [0, 2]],
    [[0, 0], [0, 1], [1, 1], [2, 1]], [[2, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [1, 0], [0, 1], [0, 2]], [[1, 0], [1, 1], [0, 2], [1, 2]],
    [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]]
  ];

  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), scale = 1, scaleY = 1, dpr = 1;
  function fit() {                                             // 비율 유지하되 화면 전체를 씀: 오른쪽 남는 폭은 정보 패널이, 세로 남는 높이는 위아래 여백이 가져감
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var iw = window.innerWidth, ih = window.innerHeight;
    scale = Math.min(iw / (W + 60), ih / H); scaleY = scale;
    PW = iw / scale - W; WT = W + PW; HL = ih / scale; OFFY = Math.max(0, (HL - H) / 2);
    cv.style.width = iw + 'px'; cv.style.height = ih + 'px';
    cv.width = Math.round(iw * dpr); cv.height = Math.round(ih * dpr);
  }
  window.addEventListener('resize', fit); fit();
  function rowC(y) { return BYY(y) + (y >= 0 ? S : FS) / 2; }      // 줄 y 의 세로 중심
  function slotY(d) { return rowC(G.adv - d); }                  // 전선에서 d 줄 앞(적 쪽)   // 사거리 d(1..) 의 화면 y (대전은 안개를 13칸으로 압축)

  // ---------- 상태 ----------
  var G = null, groundImg = null;
  // ---------- 그림 (시안 시트에서 잘라낸 조각) ----------
  var IMG = {}, IMG_LIST = ['u_tank_p', 'u_tank_e', 'u_soldier_e', 'u_soldier_p', 'u_plane', 'b_plain', 'b_fuel', 'b_scout', 'b_missile', 'b_inf', 'b_ground', 'b_forest', 'm_big', 'm_down', 'boom', 'fx_line', 'fog_a', 'fog_b', 'ui_warn', 'ui_cross', 'f_surge', 'f_gale', 'f_solar', 'x_dome', 'x_bolt', 'x_vortex'];
  IMG_LIST.forEach(function (n) { var i = new Image(); i.onload = function () { IMG[n] = i; }; i.src = 'assets/' + (/^(u|b|m|f|x)_/.test(n) ? '' : 'c_') + n + '.png?v=3'; });
  var BLK_IMG = { 1: 'b_plain', 2: 'b_fuel', 3: 'b_scout', 4: 'b_missile', 5: 'b_inf' };   // 정찰 = 정찰기, 보병 = 파란 병사
  function fitImg(img, cx, cy, w, h, alpha, rot) {              // 비율 유지해서 (cx,cy) 중심, w×h 안에 맞춰 그림
    var r = Math.min(w / img.width, h / img.height), dw = img.width * r, dh = img.height * r;
    ctx.save(); if (alpha != null) ctx.globalAlpha = alpha; ctx.translate(cx, cy); if (rot) ctx.rotate(rot); ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh); ctx.restore();
  }
  function sfx(n, a) { if (G && G.bot) return; try { if (window.SFX && SFX[n]) SFX[n](a); } catch (e) { } }   // 봇 상태로 계산 중일 땐 소리 없음
  function rnd(n) { return Math.floor(Math.random() * n); }
  function now() { return performance.now(); }
  function makePiece() {
    var sh = SHAPES[rnd(SHAPES.length)], cells = sh.map(function (c) {
      var r = 1, p = Math.random();
      if (G && G.vs) { if (p < 0.2) r = 2; else if (p < 0.3) r = 3; else if (p < 0.4) r = 4; else if (p < 0.5) r = 5; }
      else { if (p < 0.22) r = 2; else if (p < 0.33) r = 3; else if (p < 0.44) r = 4; }
      return { dx: c[0], dy: c[1], r: r };
    });
    var w = 0, h = 0; cells.forEach(function (c) { w = Math.max(w, c.dx + 1); h = Math.max(h, c.dy + 1); });
    return { cells: cells, w: w, h: h };
  }
  function newGame(vs) {
    var t = now(); layout(!!vs); fit();
    G = {
      vs: !!vs, board: [], adv: 0, score: 0, lines: 0, kills: 0, over: false, overMsg: '', result: '', sent: 0,
      tank: { x: 3, y: 6, hp: HP_MAX, path: [], moveAt: 0, fx: 3, fy: 6 }, combo: 0, shake: 0, shakeUntil: 0, aim: null, incoming: [], sweepUnits: null,
      soldiers: [], mySol: [], oppTank: null, clash: null, missileReady: 0, enemyScoutUntil: 0,
      fuel: 2 * FUEL_PER, scout: 1, missile: 0, inf: 0,
      scoutUntil: 0, nextAdv: t + ADV_MS, start: t,
      missiles: [], fx: [],
      tray: [makePiece(), makePiece(), makePiece()], drag: null, dragInf: null, reach: null, sweep: false, reveal: null,
      fac: (window.TANK_FAC || localStorage.getItem('tank_fac') || 'solar'), ult: ULT_MAX, /* 테스트: 필살기 게이지 가득 찬 채로 시작 (정식에선 0) */ shield: 0, stormMine: 0, stormOpp: 0, bolts: [], oppFac: null, oppUlt: 0, oppShield: 0
    };
    for (var y = 0; y < ROWS; y++) { G.board.push([]); for (var x = 0; x < COLS; x++) G.board[y].push(0); }
    groundImg = null;
    G.tray = [makePiece(), makePiece(), makePiece()];      // 모드가 정해진 뒤 다시 뽑음(대전이면 보병 자원 포함)
    if (!G.vs) spawnFront();
    calcReach();
  }
  function addEnemyInf(x) {                               // 대전: 상대가 보낸 보병이 내 안개 구역에 선다(열은 좌우 반전, 같은 열이면 뒤로 쌓임)
    var xm = COLS - 1 - x, d = 1;
    G.soldiers.forEach(function (e) { if (e.x === xm) d = Math.max(d, e.d + 1); });
    G.soldiers.push({ x: xm, d: d });
    G.fx.push({ t: 'pop', text: '적 보병 출현', x: W / 2, y: 0, at: now(), big: true, col: '#ff8a7a' }); sfx('inf');
  }
  function spawnFront() {                                 // 최전방 줄(adv-1)에 병사 1~2명, 열은 고정
    var n = 1 + rnd(2), xs = [];
    while (xs.length < n) { var x = rnd(COLS); if (xs.indexOf(x) < 0) xs.push(x); }
    G.soldiers = xs.map(function (x) { return { x: x, d: 1 }; });
  }
  function front() { return G.adv - 1; }                  // 최전방 줄(보드 기준, 음수 = 보드 위)
  function top() { return Math.max(0, G.adv); }           // 블록을 놓을 수 있는 첫 줄
  function cellFilled(x, y) { return G.board[y][x] !== 0 || (G.tank.x === x && G.tank.y === y); }
  function canPlace(p, gx, gy) {
    for (var i = 0; i < p.cells.length; i++) {
      var x = gx + p.cells[i].dx, y = gy + p.cells[i].dy;
      if (x < 0 || x >= COLS || y < top() || y >= ROWS) return false;
      if (cellFilled(x, y)) return false;
    }
    return true;
  }
  function anyFit(p) {
    for (var y = top(); y < ROWS; y++) for (var x = 0; x < COLS; x++) if (canPlace(p, x, y)) return true;
    return false;
  }
  function place(p, gx, gy) {
    p.cells.forEach(function (c) { G.board[gy + c.dy][gx + c.dx] = c.r; });
    // 줄 검사
    var rows = [], cols = [], y, x, full;
    for (y = top(); y < ROWS; y++) { full = true; for (x = 0; x < COLS; x++) if (!G.board[y][x]) { full = false; break; } if (full) rows.push(y); }   // 탱크 칸은 채운 칸으로 치지 않음
    for (x = 0; x < COLS; x++) { full = true; for (y = top(); y < ROWS; y++) if (!G.board[y][x]) { full = false; break; } if (full) cols.push(x); }
    var n = rows.length + cols.length;
    if (n) {
      var got = { 2: 0, 3: 0, 4: 0, 5: 0 }, cleared = {};
      function clr(x, y) {
        var k = x + ',' + y; if (cleared[k]) return; cleared[k] = 1;
        var v = G.board[y][x]; if (v >= 2) got[v]++;
        G.board[y][x] = 0;
        G.fx.push({ t: 'cell', x: x, y: y, at: now() });
      }
      rows.forEach(function (y) { for (var x = 0; x < COLS; x++) clr(x, y); });
      cols.forEach(function (x) { for (var y = top(); y < ROWS; y++) clr(x, y); });
      G.combo++;
      var mult = Math.min(5, G.combo), pts = (n * 100 + (n - 1) * 100) * mult;
      G.score += pts; G.lines += n;
      if (G.vs && G.ult < ULT_MAX) { G.ult = Math.min(ULT_MAX, G.ult + n); if (G.ult >= ULT_MAX) { G.fx.push({ t: 'pop', text: fac().name + ' 필살기 준비 완료!', x: W / 2, y: 0, at: now(), big: true, col: fac().col }); sfx('ultReady'); } }
      G.shake = 4 + n * 3 + mult * 2; G.shakeUntil = now() + 250 + n * 80;
      G.fuel = Math.min(FUEL_MAX, G.fuel + got[2] * FUEL_PER);
      G.scout = Math.min(SCOUT_MAX, G.scout + got[3]);
      G.missile = Math.min(MISSILE_MAX, G.missile + got[4]);
      G.inf = Math.min(INF_MAX, G.inf + got[5]);
      var msg = (mult > 1 ? 'COMBO ×' + mult + '  ' : '') + '+' + pts + (got[2] ? '  ⛽' + got[2] : '') + (got[3] ? '  🔭' + got[3] : '') + (got[4] ? '  🚀' + got[4] : '') + (got[5] ? '  🪖' + got[5] : '');
      G.fx.push({ t: 'pop', text: msg, x: W / 2, y: BY + (top() + ROWS) / 2 * S, at: now(), big: n > 1 });
      G.fx.push({ t: 'flash', at: now(), rows: rows, cols: cols });
      sfx('clear', n + mult - 1); [2, 3, 4, 5].forEach(function (k, i) { if (got[k]) setTimeout(function () { sfx('gain', k); }, 350 + i * 120); });
    } else {
      G.combo = 0;
    }
    calcReach();
  }
  function calcReach() {                                  // 탱크가 연료로 갈 수 있는 칸(BFS)
    var r = {}, q = [[G.tank.x, G.tank.y]], key = G.tank.x + ',' + G.tank.y; r[key] = { d: 0, from: null };
    while (q.length) {
      var c = q.shift(), d = r[c[0] + ',' + c[1]].d;
      if (d >= G.fuel) continue;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (v) {
        var x = c[0] + v[0], y = c[1] + v[1], k = x + ',' + y;
        if (x < 0 || x >= COLS || y < top() || y >= ROWS || G.board[y][x] !== 0 || r[k]) return;
        r[k] = { d: d + 1, from: c }; q.push([x, y]);
      });
    }
    G.reach = r;
  }
  function moveTank(x, y) {
    G.sel = false;
    if (G.tank.path.length) return;
    if (G.lockUntil && now() < G.lockUntil) { sfx('bad'); G.fx.push({ t: 'pop', text: '조준당함 — 이동 불가', x: BX(G.tank.x) + S / 2, y: BYY(G.tank.y) - 12, at: now(), big: false, col: '#ff8a7a' }); return; }
    var k = x + ',' + y, n = G.reach[k];
    if (!n || !n.d) return;
    var path = [], c = [x, y];
    while (c && !(c[0] === G.tank.x && c[1] === G.tank.y)) { path.unshift(c); c = G.reach[c[0] + ',' + c[1]].from; }
    G.fuel -= path.length; G.tank.path = path; G.tank.moveAt = now(); sfx('step');
  }
  function useScout() { if (G.scout <= 0 || G.over) return; G.scout--;
    if (G.vs && now() < G.stormOpp) {                                   // 상대 땅에 폭풍우 → 정찰기가 뜨자마자 벼락 맞고 추락(아이템 소모)
      G.crash = { at: now() }; sfx('crash'); G.fx.push({ t: 'pop', text: '정찰기 추락! 폭풍우 속으로 들어갈 수 없다', x: W / 2, y: 0, at: now(), big: true, col: '#ff8a7a' }); return; }
    G.scoutUntil = now() + SCOUT_MS; sfx('scout'); if (G.vs && window.NET) NET.scouted(); G.fx.push({ t: 'pop', text: '정찰기 출격', x: W / 2, y: EY + EROWS * FS / 2, at: now(), big: false }); }
  function useMissile() {                                  // 같은 세로줄에서 가장 앞에 있는 적 병사를 맞춘다. 대전에서 병사가 없으면 상대 진영 끝까지 날아가 그 줄의 상대 탱크를 맞춘다
    if (G.missile <= 0 || G.over || G.tank.path.length) return;
    if (now() < G.missileReady) { sfx('bad'); return; }               // 재장전 중(3초에 한 발)
    G.missileReady = now() + 3000;
    var tx = G.tank.x, best = null;
    G.soldiers.forEach(function (e) { if (e.x === tx && (!best || e.d < best.d)) best = e; });
    var ty0 = best ? G.adv - best.d : (G.vs && G.oppTank && COLS - 1 - G.oppTank.x === tx) ? -1 - G.oppTank.y : -EROWS;
    G.missile--;
    G.missiles.push({ x: tx, y: G.tank.y, y0: G.tank.y, y1: ty0, target: best, pred: G.vs && !!best, at: now() }); sfx('launch');
    if (G.vs && window.NET) { NET.fired(tx, G.tank.y, true);              // 대전: 명중 판정은 맞는 쪽(병사·탱크 주인)이 한다
      var o0 = NET.opp() || {}; G.shotWait = { at: now(), until: now() + 1000 + 2500, hp: o0.hp == null ? HP_MAX : o0.hp, sol: G.soldiers.length, x: tx }; }   // 결과(상대 체력·보병 수 변화)를 기다렸다가 명중/빗나감 표시
  }
  function useUlt() {                                      // 필살기 발동 (게이지 가득 찼을 때, 문장 버튼)
    if (!G.vs || G.over || G.ult < ULT_MAX || G.collapsing) { if (G.ult < ULT_MAX) sfx('bad'); return; }
    var f = fac(), t = now(); G.ult = 0; G.ultFx = { at: t, col: f.col };
    G.fx.push({ t: 'pop', text: f.name + ' — ' + f.skill + ' 발동!', x: W / 2, y: 0, at: t, big: true, col: f.col }); sfx('ult', G.fac);
    if (G.fac === 'surge') { G.stormMine = t + STORM_MS; }
    else if (G.fac === 'gale') {                           // 내 화면: 보이는 적 보병 중 최전방부터 3명에게 벼락 연출(실제 제거는 상대 판정 → 목록 갱신)
      var tg = G.soldiers.slice().sort(function (a, b) { return a.d - b.d; }).slice(0, BOLTS);
      tg.forEach(function (e, i) { G.bolts.push({ x: e.x, py: slotY(e.d), at: t + i * 180 }); });
      if (!tg.length) G.bolts.push({ x: rnd(COLS), py: BYY(G.adv) - FS, at: t });
    }
    else if (G.fac === 'solar') { G.shield = SHIELD_HP; }
    if (window.NET) { NET.skill(G.fac); NET.pub(true); }
  }
  function skillIn(k) {                                    // 상대 필살기를 받음
    if (!G.vs || G.over) return; var f = FAC[k] || FAC.solar, t = now();
    G.fx.push({ t: 'pop', text: '상대 ' + f.name + ' — ' + f.skill + '!', x: W / 2, y: 0, at: t, big: true, col: '#ff8a7a' }); sfx('ultIn');
    if (k === 'surge') { G.stormOpp = t + STORM_MS; G.lastSeen = null; if (t < G.scoutUntil) { G.scoutUntil = 0; G.crash = { at: t }; sfx('crash'); } }
    else if (k === 'gale') {                               // 내 보병 중 최전방부터 3명 사망 (내가 판정, 목록을 올림)
      var vict = G.mySol.slice().sort(function (a, b) { return a.d - b.d; }).slice(0, BOLTS);
      vict.forEach(function (e, i) { G.bolts.push({ x: e.x, py: rowC(myRow(e.d)), at: t + i * 180, mine: true }); });
      if (!vict.length) G.bolts.push({ x: rnd(COLS), py: rowC(top() + 1), at: t, mine: true });
      setTimeout(function () { if (G.over) return; vict.forEach(function (e) { var i = G.mySol.indexOf(e); if (i >= 0) G.mySol.splice(i, 1); });
        while (G.mySol.length && !G.mySol.some(function (e) { return e.d === 1; })) G.mySol.forEach(function (e) { e.d--; });
        if (vict.length) G.fx.push({ t: 'pop', text: '내 보병 ' + vict.length + '명 벼락 사망', x: W / 2, y: 0, at: now(), big: true, col: '#ff8a7a' });
        if (window.NET) NET.pub(true); }, 600);
    }
    else if (k === 'solar') { G.oppShield = SHIELD_HP; }
  }
  function incomingShot(x) {                                // 대전: 상대 미사일이 내 세로줄로 날아옴. 0.9초 뒤 그 줄 맨 앞 내 보병이 죽고, 보병이 없으면 거기 내 탱크가 있을 때 피격
    if (!G.vs || G.over) return;
    var mx = COLS - 1 - x;
    var vict = null; G.mySol.forEach(function (e) { if (e.x === mx && (!vict || e.d < vict.d)) vict = e; });
    var landY = vict ? myRow(vict.d) : (G.tank.x === mx ? G.tank.y : Math.max(top(), 1));                 // 떨어질 칸(판정과 같은 규칙)
    var hitTank = !vict && G.tank.x === mx;
    G.incoming.push({ x: mx, at: now() + 380, start: now(), y0: G.oppTank ? -1 - G.oppTank.y : -EROWS + 1, y1: landY, trail: [], vict: vict, hitTank: hitTank });   // 판정은 쏜 순간에 확정
    G.fx.push({ t: 'pop', text: '적 포격! 포탄 날아온다', x: W / 2, y: 0, at: now(), big: true, col: '#ff5a4a' }); sfx('siren');
    G.alarmUntil = now() + 900;
  }
  var planeE = null;
  function enemyPlane() {                                   // 적 정찰기: 비행기 그림을 붉게 물들인 사본(한 번만 생성)
    if (planeE || !IMG.u_plane) return planeE;
    var c = document.createElement('canvas'); c.width = IMG.u_plane.width; c.height = IMG.u_plane.height; var g = c.getContext('2d');
    g.drawImage(IMG.u_plane, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,40,30,.7)'; g.fillRect(0, 0, c.width, c.height);
    return planeE = c;
  }
  function enemyScout() {                                   // 대전: 상대 정찰기가 내 진영 위를 돈다 → 내 위치가 발각됨
    if (!G.vs || G.over) return; G.enemyScoutUntil = now() + SCOUT_MS; sfx('radar');
    G.fx.push({ t: 'pop', text: '적 정찰기 출현 — 탐색 중', x: W / 2, y: BYY(top()) + S * 1.5, at: now(), big: false, col: '#ffb3a8' });
  }
  function myRow(d) { return G.adv + d - 1; }                // 내 보병 d(1=최전방) 가 서는 내 보드 줄
  function startClash(mine, theirs, delta) {                // 대전: 전선 교전 연출 (2.5초) — 최전방 보병 수 비교, 많은 쪽이 민다
    G.clash = { mine: mine, theirs: theirs, delta: delta, at: now(), until: now() + 2500, puffs: [] };
    for (var i = 0; i < 14; i++) G.clash.puffs.push({ x: Math.random() * W, dy: (Math.random() - 0.5) * 30, r: 14 + Math.random() * 22, sp: 0.5 + Math.random() });
    sfx('clash');
  }
  function useInfantry(col) {                             // 대전: 내 탱크 세로줄의 최전방(전선 바로 너머)에 보병을 세워 밀고 들어간다. 같은 줄이면 뒤로 쌓임
    if (!G.vs || G.inf <= 0 || G.over) return;
    if (col == null) col = G.tank.x;
    G.inf--; G.sent++;
    var d = 1; G.mySol.forEach(function (e) { if (e.x === col) d = Math.max(d, e.d + 1); }); G.mySol.push({ x: col, d: d, runAt: now(), fromX: G.tank.x, fromY: G.tank.y });   // 탱크 해치에서 뛰어나가는 연출
    if (window.NET) NET.pub(true); sfx('send');
    G.fx.push({ t: 'pop', text: '보병 배치', x: BX(col) + S / 2, y: rowC(myRow(d)) - S * 0.6, at: now(), big: false });
  }
  function applyLine(L, nextTickIn) {                      // 대전: 방장이 정한 전선 위치 L(양수 = 내 땅이 그만큼 밀림, 음수 = 상대 땅을 그만큼 차지)
    var t = now(); if (nextTickIn != null && !G.sweep) G.nextAdv = t + nextTickIn;
    if (L === G.adv || G.sweep || G.over) return;
    var old = G.adv;
    if (L > old) {
      for (var y = Math.max(0, old); y < Math.min(ROWS, L); y++) for (var x = 0; x < COLS; x++) { if (G.board[y][x]) G.fx.push({ t: 'cell', x: x, y: y, at: t }); G.board[y][x] = 0; }
      G.fx.push({ t: 'pop', text: '전선이 밀렸다', x: W / 2, y: 0, at: t, big: true, col: '#ff8a7a' }); sfx('advance');
      G.adv = L;
      if (G.tank.y < L) { killTank('적에게 밟혔다'); return; }
      if (L >= ROWS) { G.over = true; G.overMsg = '전장을 잃었다'; sfx('ambientStop'); sfx('over'); setTimeout(showOver, 900); return; }
    } else {
      G.adv = L; G.fx.push({ t: 'pop', text: '전선 전진!', x: W / 2, y: 0, at: t, big: true, col: '#9be37a' }); sfx('retreat');
    }
    calcReach(); checkFit();
  }
  function killTank(msg) { if (G.over) return; G.over = true; G.overMsg = msg; G.fx.push({ t: 'boom', x: G.tank.x, y: G.tank.y, at: now(), big: true }); sfx('sweepStop'); sfx('boom', true); sfx('ambientStop'); setTimeout(function () { if (!G.vs) sfx('over'); }, 600); setTimeout(showOver, 1200); }
  function collapse() {                                     // 대전: 보드 붕괴 — 3초 경보(조작 불가) → 전선이 한 줄씩 두 번 밀림 → 남은 블록 폭파. 게임은 계속
    if (G.collapsing || G.over) return;
    var t = now();
    G.collapsing = { at: t, step: 0, sec: -1 };
    G.drag = null; G.dragInf = null; G.aim = null;
    sfx('warn'); G.fx.push({ t: 'pop', text: '놓을 곳이 없다 — 보드 붕괴', x: W / 2, y: 0, at: t, big: true, col: '#ff5a4a' });
  }
  function collapseTick(t) {                                // 붕괴 진행 (update 에서 매 프레임)
    var c = G.collapsing, el = t - c.at;
    if (el < 3000) { var sec = Math.ceil((3000 - el) / 1000); if (sec !== c.sec) { c.sec = sec; sfx('warn'); G.shake = 5; G.shakeUntil = t + 220; } return; }
    if (c.step === 0) { c.step = 1; applyLine(G.adv + 1, null);  return; }
    if (c.step === 1 && el >= 3800) { c.step = 2; applyLine(G.adv + 1, null);  return; }
    if (c.step === 2 && el >= 4700) {
      c.step = 3;
      for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x]) { G.fx.push({ t: 'cell', x: x, y: y, at: t + (y * 40) }); G.fx.push({ t: 'boom', x: x, y: y, at: t + y * 40 + rnd(120), big: false }); G.board[y][x] = 0; }
      G.tray = [makePiece(), makePiece(), makePiece()]; G.combo = 0; G.collapses = (G.collapses || 0) + 1;
      G.shake = 16; G.shakeUntil = t + 900; sfx('boom', true);
      G.fx.push({ t: 'pop', text: '보드 붕괴', x: W / 2, y: 0, at: t, big: true, col: '#ff5a4a' });
      calcReach();
      if (window.NET) NET.collapsed(); return;
    }
    if (c.step === 3 && el >= 5600) { G.collapsing = null; calcReach(); checkFit(); }
  }
  function checkFit() {
    var live = G.tray.filter(Boolean);
    if (!live.length) { G.tray = [makePiece(), makePiece(), makePiece()]; live = G.tray; }
    if (G.collapsing) return;
    if (G.vs && !live.some(anyFit)) { collapse(); return; }
    if (!live.some(anyFit) && !G.sweep) { G.sweep = true; G.nextAdv = now() + 900; sfx('sweepStart'); var used = {}; G.sweepUnits = [{ kind: 'tank', x: G.tank.x }]; used[G.tank.x] = 1; while (G.sweepUnits.length < 4) { var sx = rnd(COLS); if (used[sx]) continue; used[sx] = 1; G.sweepUnits.push({ kind: 'sol', x: sx }); } G.fx.push({ t: 'pop', text: '놓을 곳이 없다!', x: W / 2, y: BY + ROWS * S / 2, at: now(), big: true }); }
  }

  // ---------- 진행 ----------
  function update(t) {
    if (G.over) return;
    var tk = G.tank;
    if (tk.path.length && t - tk.moveAt >= 110) {
      var c = tk.path.shift(); tk.x = c[0]; tk.y = c[1]; tk.moveAt = t; if (tk.path.length) sfx('step');
      if (!tk.path.length) { calcReach(); if (G.vs && window.NET) NET.pub(); }
    }
    if (tk.path.length) { var p = Math.min(1, (t - tk.moveAt) / 110); tk.fx = tk.x + (tk.path[0][0] - tk.x) * p; tk.fy = tk.y + (tk.path[0][1] - tk.y) * p; }
    else { tk.fx = tk.x; tk.fy = tk.y; }
    // 미사일
    var dt = 1 / 60, fr = front();
    G.missiles = G.missiles.filter(function (m) {
      m.y = m.y0 - (m.y0 - m.y1) * Math.min(1, (t - m.at) / 1000);   // 거리와 상관없이 1초 비행(곡사)
      var ty = m.target ? G.adv - m.target.d : -99;
      if (G.vs && m.y <= m.y1) {                                      // 대전: 착탄 연출만. 병사가 죽는지·탱크가 맞는지는 상대 쪽이 판정해 목록/체력으로 알려줌
        G.fx.push({ t: 'boomv', px: BX(m.x) + S / 2, py: rowC(m.y1), at: t, big: true }); sfx('boom', false);
        if (m.pred) { G.score += 300; G.kills++; G.fx.push({ t: 'pop', text: '+300', x: BX(m.x) + S / 2, y: rowC(m.y1), at: t, big: false, col: '#ffd451' }); }
        return false;
      }
      if (m.target && G.soldiers.indexOf(m.target) >= 0 && m.y <= ty) {
        G.soldiers.splice(G.soldiers.indexOf(m.target), 1);
        G.score += 300; G.kills++;
        G.fx.push({ t: 'boomv', px: BX(m.target.x) + S / 2, py: slotY(m.target.d), at: t, big: true });
        sfx('boom', false);
        G.fx.push({ t: 'pop', text: '+300', x: BX(m.target.x) + S / 2, y: slotY(m.target.d), at: t, big: false, col: '#ffd451' });
        if (!G.soldiers.some(function (e) { return e.d === 1; })) {   // 최전방 줄 전멸 → 전선이 한 줄 물러남, 뒷줄이 앞으로
          G.soldiers.forEach(function (e) { e.d--; });
          if (G.adv > ADV_MIN) { G.adv--; G.nextAdv = Math.max(G.nextAdv, t + 8000); calcReach(); } spawnFront(); G.fx.push({ t: 'pop', text: '적 후퇴!', x: W / 2, y: 0, at: t + 300, big: true, col: '#9be37a' }); setTimeout(function () { sfx('retreat'); }, 250);
        }
        return false;
      }
      return m.y > -EROWS - 1;
    });
    // 날아오는 상대 포탄 착탄
    G.incoming = G.incoming.filter(function (sh) {
      if (t < sh.at) return true;
      var vict = sh.vict && G.mySol.indexOf(sh.vict) >= 0 ? sh.vict : null;
      if (vict) {                                                     // 맨 앞 내 보병이 대신 맞는다 (발사 순간에 정해진 보병)
        G.mySol.splice(G.mySol.indexOf(vict), 1);
        G.fx.push({ t: 'boom', x: sh.x, y: myRow(vict.d), at: t, big: false }); sfx('boom', false);
        G.fx.push({ t: 'pop', text: '보병 전사', x: BX(sh.x) + S / 2, y: rowC(myRow(vict.d)) - 20, at: t, big: false });
        if (!G.mySol.some(function (e) { return e.d === 1; })) G.mySol.forEach(function (e) { e.d--; });   // 최전방이 비면 뒷줄이 앞으로
        if (window.NET) NET.pub(true);
        return false;
      }
      var hitT = sh.hitTank, hy = hitT ? tk.y : Math.max(top(), 1), hx = hitT ? tk.x : sh.x;   // 탱크가 표적이었으면 지금 어디 있든 맞는다
      G.fx.push({ t: 'boom', x: hx, y: hy, at: t, big: true }); sfx('boom', true); G.shake = 10; G.shakeUntil = t + 300;
      if (hitT && G.shield > 0) { G.shield--; G.fx.push({ t: 'shieldHit', at: t }); G.fx.push({ t: 'pop', text: G.shield ? '태양 방패가 막아냈다! (1겹 남음)' : '태양 방패가 깨졌다', x: W / 2, y: 0, at: t, big: true, col: '#ffd451' }); sfx('shieldHit'); if (window.NET) NET.pub(true); return false; }
      if (hitT) { tk.hp--; G.fx.push({ t: 'pop', text: '탱크 피격! 체력 ' + tk.hp, x: W / 2, y: 0, at: t, big: true, col: '#ff5a4a' }); if (window.NET) NET.pub(true); if (tk.hp <= 0) killTank('상대 미사일에 격파'); }
      else G.fx.push({ t: 'pop', text: '빗나감', x: BX(hx) + S / 2, y: BYY(hy) - 10, at: t, big: false });
      return false;
    });
    // 진격 (대전: 전선은 방장이 30초마다 계산해 내려줌 → applyLine. 여기서는 혼자 모드와 '놓을 곳 없음' 쓸림만)
    if (t >= G.nextAdv && (!G.vs || G.sweep)) {
      G.nextAdv = t + (G.sweep ? 420 : advMs(t));
      var y = G.adv; G.adv++;
      if (y >= 0) for (var x = 0; x < COLS; x++) { if (G.board[y][x]) G.fx.push({ t: 'cell', x: x, y: y, at: t }); G.board[y][x] = 0; }
      if (!G.sweep) { G.fx.push({ t: 'pop', text: '⚠ 적 진격!', x: W / 2, y: BYY(y) + S / 2, at: t, big: true }); sfx('advance'); } else sfx('place');
      if (y >= 0 && tk.y === y) { killTank(G.sweep ? '놓을 곳이 없어 적 전차에 깔렸다' : '적에게 밟혔다'); return; }
      if (G.adv >= ROWS) { G.over = true; G.overMsg = '전장을 잃었다'; sfx('sweepStop'); sfx('ambientStop'); sfx('over'); setTimeout(showOver, 900); return; }
      if (!G.sweep) { calcReach(); checkFit(); }
    }
    var quiet = G.vs ? !(G.soldiers.some(function (e) { return e.d === 1; }) || G.mySol.some(function (e) { return e.d === 1; })) : false;
    if (!G.sweep && !quiet && G.nextAdv - t < 6000 && Math.floor((G.nextAdv - t) / 1000) !== G.warnSec) { G.warnSec = Math.floor((G.nextAdv - t) / 1000); if (G.warnSec % 2 === 1) sfx('warn'); }
    if (!G.sweep && !quiet && G.nextAdv - t < 10000 && Math.floor((G.nextAdv - t) / 2000) !== G.drumSec) { G.drumSec = Math.floor((G.nextAdv - t) / 2000); sfx('drum'); }
    if (G.vs) {
      var oE = (window.NET && NET.opp() || {}).empty, myE = 0; for (var ey = top(); ey < ROWS; ey++) for (var ex = 0; ex < COLS; ex++) if (!G.board[ey][ex]) myE++;
      if (oE != null && oE < 15 && !G.warnOpp) { G.warnOpp = true; G.fx.push({ t: 'pop', text: '상대 보드 붕괴 임박', x: W / 2, y: 0, at: t, big: true, col: '#9be37a' }); sfx('warn'); } else if (oE != null && oE >= 20) G.warnOpp = false;
      if (myE < 12 && !G.warnMe) { G.warnMe = true; G.fx.push({ t: 'pop', text: '내 보드 붕괴 임박', x: W / 2, y: 0, at: t, big: true, col: '#ff8a7a' }); sfx('warn'); } else if (myE >= 18) G.warnMe = false;
    }
    if (G.collapsing) collapseTick(t);
    if (G.crash && t - G.crash.at > 1600) G.crash = null;
    G.bolts = G.bolts.filter(function (b) { return t - b.at < 700; });
    if (G.shotWait && t > G.shotWait.at + 1000) {                       // 내가 쏜 결과: 착탄 뒤 상대 쪽 판정이 오면 표시
      var sw = G.shotWait, o2 = (window.NET && NET.opp()) || {}, ohp2 = o2.hp == null ? HP_MAX : o2.hp;
      if (ohp2 < sw.hp) { G.shotWait = null; G.fx.push({ t: 'pop', text: '상대 탱크 명중! 체력 ' + ohp2, x: W / 2, y: 0, at: t, big: true, col: '#9be37a' }); sfx('gain'); }
      else if (G.soldiers.length < sw.sol) { G.shotWait = null; G.fx.push({ t: 'pop', text: '명중! 적 보병 격파', x: W / 2, y: 0, at: t, big: true, col: '#9be37a' }); }
      else if (t > sw.until) { G.shotWait = null; G.fx.push({ t: 'pop', text: '빗나감', x: BX(sw.x) + S / 2, y: BYY(G.adv) - 14, at: t, big: false, col: '#cfd6bf' }); }
    }
    // 큰 팝업은 큐로 모아 한 번에 하나씩 띠 배너로(겹침 방지). 밀리면 오래된 건 버림
    G.msgQ = G.msgQ || [];
    G.fx = G.fx.filter(function (f) { if (f.t === 'pop' && f.big) { G.msgQ.push(f); return false; } return true; });
    while (G.msgQ.length > 2) G.msgQ.shift();
    if (G.msg && t - G.msg.at > 1150) G.msg = null;
    if (!G.msg && G.msgQ.length) { G.msg = G.msgQ.shift(); G.msg.at = t; }
    var smalls = G.fx.filter(function (f) { return f.t === 'pop'; }); while (smalls.length > 3) { var oldest = smalls.shift(); G.fx.splice(G.fx.indexOf(oldest), 1); }
    if (G.vs && G.oppTank && t < G.scoutUntil) G.lastSeen = { x: G.oppTank.x, y: G.oppTank.y, t: t, how: '정찰' };   // 정찰 중 본 위치를 기억
    if (G.clash && t > G.clash.until + 400) G.clash = null;
    G.fx = G.fx.filter(function (f) { return t - f.at < (f.t === 'pop' ? 1000 : 700); });
  }

  // ---------- 그리기 ----------
  function BX(x) { return x * S; }
  function BYY(y) { return BY + (y >= 0 ? y * S : y * FS); }   // 음수 줄(안개)은 낮은 줄 높이
  function fogH() { return BYY(G.adv) - EY; }                    // 안개 구역 높이(픽셀)
  var ground = (function () {                            // 땅 무늬(한 번만 만들어 둠)
    var c = document.createElement('canvas'); c.width = COLS * S; c.height = ROWS * S; var g = c.getContext('2d');
    g.fillStyle = '#4a3f2b'; g.fillRect(0, 0, c.width, c.height);
    for (var i = 0; i < 2600; i++) { g.fillStyle = 'rgba(' + (60 + rnd(60)) + ',' + (50 + rnd(45)) + ',' + (25 + rnd(30)) + ',.5)'; g.fillRect(rnd(c.width), rnd(c.height), 2 + rnd(5), 2 + rnd(4)); }
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(x * S + 1, y * S + 1, S - 2, S - 2);
      g.strokeStyle = 'rgba(255,230,170,.08)'; g.lineWidth = 1; g.strokeRect(x * S + 3, y * S + 3, S - 6, S - 6);
    }
    return c;
  })();
  var fogC = (function () {
    var c = document.createElement('canvas'); c.width = COLS * S; c.height = (FOG_MAX + ROWS) * S; var g = c.getContext('2d');
    g.fillStyle = '#07080a'; g.fillRect(0, 0, c.width, c.height);
    for (var i = 0; i < 260; i++) { var r = 20 + rnd(50); var gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(60,65,70,.35)'); gr.addColorStop(1, 'rgba(10,12,14,0)'); g.save(); g.translate(rnd(c.width), rnd(c.height)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.restore(); }
    return c;
  })();
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawBlock(px, py, s, r, alpha) {
    var im = IMG[BLK_IMG[r]];
    if (im) { fitImg(im, px + s / 2, py + s / 2, s - 1, s - 1, alpha == null ? 1 : alpha); return; }
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    var g = ctx.createLinearGradient(px, py, px, py + s); g.addColorStop(0, '#8d9a62'); g.addColorStop(1, '#4f5a33');
    rr(px + 2, py + 2, s - 4, s - 4, 7); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#1f2414'; ctx.lineWidth = 2; ctx.stroke();
    rr(px + 5, py + 5, s - 10, s * 0.3, 5); ctx.fillStyle = 'rgba(255,255,230,.18)'; ctx.fill();
    if (RES[r]) { ctx.font = Math.round(s * 0.5) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(RES[r], px + s / 2, py + s / 2 + 1); }
    ctx.restore();
  }
  function drawTank(px, py, s, col, turretUp, hp) {
    if (IMG.u_tank_p) { fitImg(IMG.u_tank_p, px + s / 2, py + s / 2 - s * 0.04, s * 1.1, s * 1.2); return; }
    ctx.save(); ctx.translate(px + s / 2, py + s / 2);
    ctx.fillStyle = '#1b1d14'; rr(-s * 0.42, -s * 0.4, s * 0.16, s * 0.8, 4); ctx.fill(); rr(s * 0.26, -s * 0.4, s * 0.16, s * 0.8, 4); ctx.fill();
    ctx.strokeStyle = '#3a3d2c'; ctx.lineWidth = 2; for (var i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.42, i * s * 0.11); ctx.lineTo(-s * 0.26, i * s * 0.11); ctx.moveTo(s * 0.26, i * s * 0.11); ctx.lineTo(s * 0.42, i * s * 0.11); ctx.stroke(); }
    var g = ctx.createLinearGradient(-s * 0.3, 0, s * 0.3, 0); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    rr(-s * 0.3, -s * 0.34, s * 0.6, s * 0.68, 6); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#0d0f08'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#2a2d1c'; ctx.fillRect(-s * 0.05, turretUp ? -s * 0.5 : 0, s * 0.1, s * 0.5);
    ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, 7); ctx.fillStyle = col[1]; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-s * 0.05, -s * 0.05, s * 0.07, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
    if (hp != null) for (var h = 0; h < HP_MAX; h++) { ctx.fillStyle = h < hp ? '#ff5050' : 'rgba(0,0,0,.5)'; ctx.fillRect(-s * 0.27 + h * s * 0.2, s * 0.38, s * 0.16, s * 0.08); }
    ctx.restore();
  }
  function burstDust(t, y) { for (var i = 0; i < 10; i++) { var q = ((t / 7 + i * 61) % 100) / 100; ctx.fillStyle = 'rgba(160,130,90,' + (0.35 * (1 - q)) + ')'; ctx.beginPath(); ctx.arc(((i * 97 + t / 9) % W), y - q * 30, 6 + q * 14, 0, 7); ctx.fill(); } }
  function drawSoldier(px, py, s, mine) {
    if (!mine && IMG.u_soldier_e) { fitImg(IMG.u_soldier_e, px + s / 2, py + s / 2, s * 0.8, s * 1.05); return; }
    if (mine && IMG.u_soldier_p) { fitImg(IMG.u_soldier_p, px + s / 2, py + s / 2, s * 0.8, s * 1.05); return; }
    ctx.save(); ctx.translate(px + s / 2, py + s / 2);
    ctx.fillStyle = mine ? '#4f6a2e' : '#7a2a2a'; rr(-s * 0.16, -s * 0.05, s * 0.32, s * 0.4, 6); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s * 0.14, s * 0.05); ctx.lineTo(s * 0.14, s * 0.44); ctx.stroke();
    ctx.fillStyle = '#e8c39e'; ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = mine ? '#3a4a22' : '#5a1f1f'; ctx.beginPath(); ctx.arc(0, -s * 0.24, s * 0.16, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.13, 0, 7); ctx.stroke();
    ctx.restore();
  }
  function draw(t) {
    ctx.setTransform(scale * dpr, 0, 0, scaleY * dpr, 0, 0);
    ctx.fillStyle = '#0b0d0a'; ctx.fillRect(0, 0, WT, HL);
    ctx.translate(0, OFFY);
    if (t < G.shakeUntil) { var sk = G.shake * (G.shakeUntil - t) / 400; ctx.translate((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk); }
    // 땅: 칸마다 흙 타일
    if (IMG.b_ground) { if (!groundImg) { groundImg = document.createElement('canvas'); groundImg.width = COLS * S; groundImg.height = ROWS * S; var gg = groundImg.getContext('2d'); for (var gy = 0; gy < ROWS; gy++) for (var gx = 0; gx < COLS; gx++) gg.drawImage(IMG.b_ground, gx * S, gy * S, S, S); gg.fillStyle = 'rgba(0,0,0,.18)'; gg.fillRect(0, 0, groundImg.width, groundImg.height); } ctx.drawImage(groundImg, 0, BY); }
    else ctx.drawImage(ground, 0, 0, ground.width, ground.height, 0, BY, COLS * S, ROWS * S);
    // 안개(적 진영 + 점령된 줄)
    var fogRows = EROWS + G.adv, scouting = t < G.scoutUntil, fr = front();
    function drawForest(alpha) { if (!IMG.b_forest) return; ctx.save(); ctx.globalAlpha = alpha; for (var fy = BYY(G.adv) - FS; fy > EY - FS; fy -= FS) for (var fx = 0; fx < COLS; fx++) ctx.drawImage(IMG.b_forest, BX(fx), fy, S, FS); ctx.restore(); }
    if (G.vs && IMG.b_ground) {                                              // 대전: 위쪽 9줄 = 상대 진영(땅 타일). 내가 차지한 줄은 또렷, 나머지는 숲+안개
      ctx.save(); ctx.globalAlpha = 0.55; for (var oy = -1; oy >= -EROWS; oy--) for (var ox = 0; ox < COLS; ox++) ctx.drawImage(IMG.b_ground, BX(ox), BYY(oy), S, FS); ctx.restore();
      if (G.adv < 0) { ctx.fillStyle = 'rgba(120,200,255,.10)'; ctx.fillRect(0, BYY(G.adv), W, -G.adv * FS); }
    }
    ctx.save(); ctx.beginPath(); ctx.rect(0, EY, W, fogH()); ctx.clip(); drawForest(1); ctx.restore();   // 전선 너머 = 숲
    var plane = null;
    if (scouting) { var sp0 = 1 - (G.scoutUntil - t) / SCOUT_MS, fh0 = fogH(); plane = [-70 + (W + 140) * sp0, EY + fh0 * 0.5 + Math.sin(sp0 * Math.PI * 2.2) * fh0 * 0.32]; }
    if (!G.vs) {                                                             // 혼자 모드만 안개. 대전은 숲 지형이 또렷하고 유닛만 숨는다
      ctx.save(); ctx.globalAlpha = scouting ? 0.74 : 0.84;
      ctx.drawImage(fogC, 0, ((t / 60) % S) | 0, COLS * S, fogH(), 0, EY, COLS * S, fogH());
      if (IMG.fog_a && IMG.fog_b) {
        ctx.beginPath(); ctx.rect(0, EY, W, fogH()); ctx.clip(); ctx.globalAlpha = scouting ? 0.25 : 0.5;
        for (var fi = 0; fi < 7; fi++) { var fim = fi % 2 ? IMG.fog_a : IMG.fog_b, fw = 260 + (fi % 3) * 60, fx0 = ((fi * 173 + t / (60 + fi * 9)) % (W + fw)) - fw / 2, fy0 = EY + 20 + (fi * 67) % Math.max(40, fogH() - 40); ctx.drawImage(fim, fx0 - fw / 2, fy0 - fw * 0.22, fw, fw * 0.45); }
      }
      ctx.restore();
    } else { ctx.fillStyle = 'rgba(10,14,8,' + (scouting ? 0.12 : 0.3) + ')'; ctx.fillRect(0, EY, W, fogH()); }   // 대전: 상대 땅은 살짝 어둡게만
    if (plane && !G.vs) {                                                    // 정찰기 아래는 숲이 또렷하게(서치라이트)
      ctx.save(); ctx.beginPath(); ctx.rect(0, EY, W, fogH()); ctx.clip();
      ctx.beginPath(); ctx.arc(plane[0], plane[1], S * 1.9, 0, 7); ctx.clip(); drawForest(0.85);
      var sl = ctx.createRadialGradient(plane[0], plane[1], S * 0.6, plane[0], plane[1], S * 1.9); sl.addColorStop(0, 'rgba(200,255,200,.12)'); sl.addColorStop(1, 'rgba(0,0,0,.55)'); ctx.fillStyle = sl; ctx.fillRect(plane[0] - S * 2, plane[1] - S * 2, S * 4, S * 4);
      ctx.restore();
    }
    if (scouting) {
      ctx.fillStyle = 'rgba(120,255,140,' + (0.05 + 0.04 * Math.sin(t / 120)) + ')'; ctx.fillRect(0, EY, W, fogH());
      var sp = 1 - (G.scoutUntil - t) / SCOUT_MS, fh = fogH();                 // 정찰기: S자로 지형을 훑으며 기수를 돌림
      function ppos(q) { return [-70 + (W + 140) * q, EY + fh * 0.5 + Math.sin(q * Math.PI * 2.2) * fh * 0.32]; }
      var p0 = ppos(sp), p1 = ppos(Math.min(1, sp + 0.01)), head = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), bank = Math.cos(sp * Math.PI * 2.2) * 0.35;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p0[0] + 16, p0[1] + 44, 30, 9, 0, 0, 7); ctx.fill();
      if (IMG.u_plane) { ctx.save(); ctx.translate(p0[0], p0[1]); ctx.rotate(head + Math.PI / 2); ctx.scale(1 - Math.abs(bank) * 0.35, 1); fitImg(IMG.u_plane, 0, 0, 78, 60, 1, 0); ctx.restore(); }
      else { ctx.fillStyle = '#eaf7ff'; ctx.beginPath(); ctx.arc(pxp, pyp, 12, 0, 7); ctx.fill(); }
    }
    // 진격 임박: 안개가 붉게 물듦(10초 전부터)
    var left = G.nextAdv - t;
    if (left < 10000 && !G.over && !G.sweep && !(G.vs && !G.soldiers.length)) { ctx.fillStyle = 'rgba(255,30,30,' + (0.04 + 0.06 * (1 - left / 10000)) + ')'; ctx.fillRect(0, EY, W, fogH()); }
    if (left < 6000 && !G.over) { ctx.fillStyle = 'rgba(255,40,40,' + (0.25 + 0.25 * Math.sin(t / 90)) + ')'; ctx.fillRect(0, BYY(G.adv), W, G.adv >= 0 ? S : FS); }
    ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(0, BYY(G.adv)); ctx.lineTo(W, BYY(G.adv)); ctx.stroke(); ctx.setLineDash([]);
    // 적 병사 (정찰 중에만 보임) · 내 보병(대전, 항상 보임) · 상대 탱크(대전, 정찰 중·발사 직후)
    var cj = G.clash && t < G.clash.until ? 1 : 0;                                   // 교전 중엔 병사들이 떨림
    if (scouting || G.vs) G.soldiers.forEach(function (e, i) { if (G.vs && !scouting && e.d !== 1) return; var ss = G.vs ? FS * 1.15 : FS * 1.05; ctx.save(); ctx.globalAlpha = 1; /* 대전: 최전방 보병만 항상 보이고 뒷줄·탱크는 정찰 중에만 */ drawSoldier(BX(e.x) + (S - ss) / 2 + Math.sin(t / 170 + i * 2) * 2 + cj * (Math.random() - 0.5) * 6, slotY(e.d) - ss / 2 + Math.abs(Math.sin(t / 140 + i)) * -3 + cj * (Math.random() - 0.5) * 4, ss); ctx.restore(); });
    if (G.vs) {
      G.mySol.forEach(function (e, i) { var ss = S * 0.8, ry = myRow(e.d); if (ry >= ROWS) return;
        var dx = BX(e.x) + (S - ss) / 2, dy = rowC(ry) - ss / 2, bob = Math.abs(Math.sin(t / 150 + i)) * -3;
        if (e.runAt && t - e.runAt < 900) {                                                    // 탱크에서 튀어나와 최전방까지 달려감
          var rp = t - e.runAt, sx = BX(e.fromX) + (S - ss) / 2, sy = BYY(e.fromY) + (S - ss) / 2;
          if (rp < 220) { var hop = rp / 220; dx = sx; dy = sy - Math.sin(hop * Math.PI) * 26; bob = 0; ss *= 0.6 + 0.4 * hop; }          // 해치에서 폴짝
          else { var q = Math.min(1, (rp - 220) / 680); q = 1 - (1 - q) * (1 - q); dx = sx + (dx - sx) * q; dy = sy + (dy - sy) * q; bob = -Math.abs(Math.sin(rp / 45)) * 7;
            ctx.fillStyle = 'rgba(120,90,50,.35)'; for (var di = 0; di < 3; di++) { ctx.beginPath(); ctx.arc(dx + ss / 2 - di * 8 + (Math.random() - 0.5) * 4, dy + ss - 2 + di * 2, 3 + di, 0, 7); ctx.fill(); } }   // 흙먼지
        } else dx += Math.sin(t / 190 + i) * 2 + cj * (Math.random() - 0.5) * 6;
        drawSoldier(dx, dy + bob, ss, true); });
      var liveSee = G.oppTank && (scouting || (G.reveal && t < G.reveal.until));
      if (!liveSee && G.lastSeen) {                                            // 마지막으로 확인된 상대 탱크 자리(잔상) — 다음 정찰/발사까지 남는다
        var ls = G.lastSeen, lx = BX(COLS - 1 - ls.x) + S / 2, lyy = rowC(-1 - ls.y), ago = Math.floor((t - ls.t) / 1000);
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,120,100,.7)'; ctx.lineWidth = 2; ctx.strokeRect(BX(COLS - 1 - ls.x) + 4, lyy - FS * 0.7, S - 8, FS * 1.4); ctx.setLineDash([]); ctx.restore();
        if (IMG.u_tank_e) fitImg(IMG.u_tank_e, lx, lyy, S * 0.85, FS * 1.35, 0.42);
        ctx.save(); ctx.font = '700 9px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,200,190,.85)'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('마지막 위치(' + ls.how + ') ' + ago + '초 전', lx, lyy + FS * 0.75); ctx.restore();
      }
      if (liveSee) {
        var otx = BX(COLS - 1 - G.oppTank.x) + S / 2, oty = rowC(-1 - G.oppTank.y), oa = scouting ? 1 : Math.min(1, (G.reveal.until - t) / 1200);
        ctx.fillStyle = 'rgba(255,60,60,' + (0.18 * oa) + ')'; ctx.fillRect(BX(COLS - 1 - G.oppTank.x) + 2, EY, S - 4, BYY(0) - EY);
        if (IMG.u_tank_e) fitImg(IMG.u_tank_e, otx, oty, S * 0.95, FS * 1.5, oa);
        if (IMG.ui_cross) fitImg(IMG.ui_cross, otx, oty, FS * 1.6, FS * 1.6, oa * 0.8);
        ctx.save(); ctx.font = '700 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,220,220,' + oa + ')'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(scouting ? '상대 탱크' : '상대 탱크 발사 위치', otx, oty + FS * 0.8); ctx.restore();
      }
    }
    if (G.vs) drawSkillFx(t);
    if (G.vs && G.warnOpp) { ctx.strokeStyle = 'rgba(255,60,60,' + (0.35 + 0.3 * Math.sin(t / 160)) + ')'; ctx.lineWidth = 3; ctx.strokeRect(2, EY + 2, W - 4, BYY(0) - EY - 4); }
    if (G.vs) {                                                            // 위쪽 안내 글씨
      ctx.save(); ctx.font = '600 9px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3; ctx.fillText('▲ 상대 진영', 6, EY + 3); ctx.restore();
    }
    // 블록
    for (var y = top(); y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x]) drawBlock(BX(x), BYY(y), S, G.board[y][x]);
    // 갈 수 있는 칸
    if (G.sel && !G.drag && !G.tank.path.length && !G.over && !G.sweep && !G.collapsing) for (var k in G.reach) if (G.reach[k].d) { var c = k.split(','), rcx = BX(+c[0]) + S / 2, rcy = BYY(+c[1]) + S / 2, pulse = 0.8 + 0.2 * Math.sin(t / 220 + G.reach[k].d);
      ctx.save(); ctx.fillStyle = 'rgba(57,255,106,' + (0.22 * pulse) + ')'; ctx.fillRect(BX(+c[0]) + 3, BYY(+c[1]) + 3, S - 6, S - 6); ctx.fillStyle = 'rgba(200,255,210,.9)'; ctx.beginPath(); ctx.arc(rcx, rcy, 4, 0, 7); ctx.fill(); ctx.restore(); }
    // 드래그 미리보기
    if (G.drag && G.drag.moved) {
      var d = G.drag, ok = d.gx != null && canPlace(d.p, d.gx, d.gy);
      if (d.gx != null) d.p.cells.forEach(function (c) { var x = d.gx + c.dx, y = d.gy + c.dy; if (x >= 0 && x < COLS && y >= 0 && y < ROWS) { ctx.fillStyle = ok ? 'rgba(255,230,120,.35)' : 'rgba(255,60,60,.35)'; ctx.fillRect(BX(x) + 3, BYY(y) + 3, S - 6, S - 6); } });
    }
    // 위험: 빈 칸이 적을수록 보드 가장자리가 붉게
    var empty = 0, total = (ROWS - top()) * COLS; for (var yy = top(); yy < ROWS; yy++) for (var xx = 0; xx < COLS; xx++) if (!G.board[yy][xx]) empty++;
    var danger = 1 - empty / Math.max(1, total);
    if (danger > 0.6 && !G.over) { var dg = ctx.createRadialGradient(W / 2, BYY((top() + ROWS) / 2), W * 0.35, W / 2, BYY((top() + ROWS) / 2), W * 0.75); dg.addColorStop(0, 'rgba(255,0,0,0)'); dg.addColorStop(1, 'rgba(255,20,20,' + ((danger - 0.6) * 1.2 + 0.08 * Math.sin(t / 200)) + ')'); ctx.fillStyle = dg; ctx.fillRect(0, BYY(top()), W, (ROWS - top()) * S); }
    if (G.alarmUntil && t < G.alarmUntil) { ctx.fillStyle = 'rgba(255,30,30,' + (0.12 + 0.12 * Math.sin(t / 50)) + ')'; ctx.fillRect(0, BYY(top()), W, (ROWS - top()) * S); }   // 적 포격 경보: 붉게 번쩍
    // 붕괴 경보: 보드가 붉게 번쩍이고 3초 카운트다운 (조작 불가)
    if (G.collapsing && G.collapsing.step === 0) {
      var cel = t - G.collapsing.at, csec = Math.max(1, Math.ceil((3000 - cel) / 1000)), cfl = 0.5 + 0.5 * Math.sin(t / 70);
      ctx.fillStyle = 'rgba(255,20,20,' + (0.18 + 0.22 * cfl) + ')'; ctx.fillRect(0, BYY(top()), W, (ROWS - top()) * S);
      ctx.strokeStyle = 'rgba(255,60,60,' + (0.5 + 0.5 * cfl) + ')'; ctx.lineWidth = 6; ctx.strokeRect(3, BYY(top()) + 3, W - 6, (ROWS - top()) * S - 6);
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = '#000'; ctx.shadowBlur = 10;
      var cy = BYY(top()) + (ROWS - top()) * S / 2, pop = 1 + 0.25 * Math.max(0, 1 - ((3000 - cel) % 1000) / 250);
      ctx.font = '800 ' + Math.round(86 * pop) + 'px Orbitron, system-ui'; ctx.lineWidth = 8; ctx.strokeStyle = '#3a0000'; ctx.strokeText(String(csec), W / 2, cy); ctx.fillStyle = '#ff4040'; ctx.fillText(String(csec), W / 2, cy);
      ctx.font = '800 15px Orbitron, system-ui'; ctx.lineWidth = 5; ctx.strokeText('⚠ 보드 붕괴 ⚠', W / 2, cy - 70); ctx.fillStyle = '#ffd451'; ctx.fillText('⚠ 보드 붕괴 ⚠', W / 2, cy - 70);
      ctx.font = '700 12px system-ui'; ctx.lineWidth = 4; ctx.strokeText('전선 2줄 밀림 → 블록 전부 폭파', W / 2, cy + 62); ctx.fillStyle = '#fff'; ctx.fillText('전선 2줄 밀림 → 블록 전부 폭파', W / 2, cy + 62);
      ctx.restore();
    }
    // 탱크
    if (G.lockUntil && t < G.lockUntil) { var lk = 0.6 + 0.4 * Math.sin(t / 60); ctx.save(); ctx.strokeStyle = 'rgba(255,60,50,' + lk + ')'; ctx.lineWidth = 3; ctx.strokeRect(BX(G.tank.fx) + 2, BYY(G.tank.fy) + 2, S - 4, S - 4); if (IMG.ui_cross) fitImg(IMG.ui_cross, BX(G.tank.fx) + S / 2, BYY(G.tank.fy) + S / 2, S * 1.3, S * 1.3, lk); ctx.restore(); }   // 조준당함 표시
    if (G.sel) { ctx.save(); ctx.strokeStyle = 'rgba(200,255,210,.9)'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(BX(G.tank.fx) + 2, BYY(G.tank.fy) + 2, S - 4, S - 4); ctx.setLineDash([]); ctx.restore(); }
    drawTank(BX(G.tank.fx), BYY(G.tank.fy), S, ['#5f7a3a', '#9bbd55'], true, null);
    if (G.vs) for (var hh = 0; hh < HP_MAX; hh++) { ctx.fillStyle = hh < G.tank.hp ? '#ff5050' : 'rgba(0,0,0,.55)'; rr(BX(G.tank.fx) + 8 + hh * 18, BYY(G.tank.fy) + S - 9, 14, 6, 2); ctx.fill(); }
    // 놓을 곳 없음 → 적 전차·보병이 전선과 함께 밀고 내려옴 (안개 밖으로 드러남)
    if (G.sweep && G.sweepUnits) {
      var lp = 1 - Math.max(0, Math.min(1, (G.nextAdv - t) / 420)), ly = BYY(G.adv - 1) + lp * S;   // 다음 줄로 내려가는 중간 위치
      G.sweepUnits.forEach(function (u, i) {
        var ux = BX(u.x) + S / 2, uy = ly + S / 2 + Math.sin(t / 60 + i) * 2;
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(ux, uy + S * 0.42, S * 0.4, S * 0.12, 0, 0, 7); ctx.fill();
        if (u.kind === 'tank') { if (IMG.u_tank_e) fitImg(IMG.u_tank_e, ux, uy, S * 1.15, S * 1.25); }
        else if (IMG.u_soldier_e) fitImg(IMG.u_soldier_e, ux, uy, S * 0.8, S * 1.05);
      });
      burstDust(t, ly + S);
    }
    // 대전: 적 정찰기가 내 보드 위를 돌며 내 탱크를 찾는다
    if (G.vs && t < G.enemyScoutUntil) {
      var esp = 1 - (G.enemyScoutUntil - t) / SCOUT_MS, bh = ROWS * S, by0 = BY;
      function epos(q) { return [W + 70 - (W + 140) * q, by0 + bh * 0.45 + Math.sin(q * Math.PI * 2.2) * bh * 0.3]; }   // 오른쪽→왼쪽(상대 쪽에서 날아옴)
      var e0 = epos(esp), e1 = epos(Math.min(1, esp + 0.01)), ehead = Math.atan2(e1[1] - e0[1], e1[0] - e0[0]);
            var sl2 = ctx.createRadialGradient(e0[0], e0[1], S * 0.4, e0[0], e0[1], S * 2.2); sl2.addColorStop(0, 'rgba(255,70,50,.22)'); sl2.addColorStop(1, 'rgba(255,70,50,0)'); ctx.fillStyle = sl2; ctx.fillRect(e0[0] - S * 2.3, e0[1] - S * 2.3, S * 4.6, S * 4.6);   // 탐색 서치라이트(초록)
      var tr = S * (0.9 + 0.15 * Math.sin(t / 110)); ctx.strokeStyle = 'rgba(255,80,60,.85)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(BX(G.tank.fx) + S / 2, BYY(G.tank.fy) + S / 2, tr, 0, 7); ctx.stroke(); ctx.setLineDash([]);   // 내 탱크 주변 붉은 점선 링(탐색당하는 중)
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(e0[0] + 16, e0[1] + 44, 30, 9, 0, 0, 7); ctx.fill();
      var pe = enemyPlane(); if (pe) { ctx.save(); ctx.translate(e0[0], e0[1]); ctx.rotate(ehead + Math.PI / 2); fitImg(pe, 0, 0, 78, 60, 1, 0); ctx.restore(); }
      ctx.save(); ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#ffb3a8'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('적 정찰기 (탐색 중)', Math.max(58, Math.min(W - 58, e0[0])), e0[1] + 36); ctx.restore();
    }
    // 대전: 전선 교전 연출
    if (G.clash) {
      var cl = G.clash, ca = Math.min(1, (t - cl.at) / 250) * Math.max(0, Math.min(1, (cl.until + 400 - t) / 400)), ly = BYY(G.adv);
      cl.puffs.forEach(function (pf, i) { var ph = ((t - cl.at) / 900 * pf.sp + i) % 1; ctx.fillStyle = 'rgba(190,170,140,' + (0.55 * ca * (1 - ph * 0.5)) + ')'; ctx.beginPath(); ctx.arc(pf.x + Math.sin(t / 300 + i) * 12, ly + pf.dy - ph * 22, pf.r * (0.6 + ph * 0.6), 0, 7); ctx.fill(); });
      for (var fi2 = 0; fi2 < 6; fi2++) { var fx2 = ((t / 11 + fi2 * 137) % W), fy2 = ly + Math.sin(t / 70 + fi2) * 10; ctx.fillStyle = 'rgba(255,220,120,' + (0.9 * ca * Math.abs(Math.sin(t / 60 + fi2 * 1.7))) + ')'; ctx.beginPath(); ctx.arc(fx2, fy2, 3, 0, 7); ctx.fill(); }   // 총격 섬광
      ctx.save(); ctx.globalAlpha = ca; ctx.font = '800 16px Orbitron, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 5; ctx.strokeStyle = '#1a0a00';
      var txt = '⚔ 내 보병 ' + cl.mine + '  :  적 보병 ' + cl.theirs, res = cl.delta < 0 ? '▲ 전선 전진!' : cl.delta > 0 ? '▼ 밀린다!' : '= 교착';
      ctx.strokeText(txt, W / 2, ly - 30); ctx.fillStyle = '#fff'; ctx.fillText(txt, W / 2, ly - 30);
      if (t - cl.at > 1500) { ctx.strokeText(res, W / 2, ly + 30); ctx.fillStyle = cl.delta < 0 ? '#9be37a' : cl.delta > 0 ? '#ff8a7a' : '#ffd451'; ctx.fillText(res, W / 2, ly + 30); }
      ctx.restore();
    }
    // 미사일 (내 것 + 적진에서 날아오는 것)
    function drawMissile(m, p, t, enemy) {
      // 곡사포를 위에서 내려다봄: 발사 직후 작게 → 꼭대기에서 가장 크게(카메라에 가까움) → 떨어지며 작아짐.
      // 오르는 동안은 꼬리 불꽃이 아래로(m_up), 정점을 지나면 기수가 땅을 향해 꽂히는 모습(m_down, 불꽃이 위)으로 바뀜.
      var h = Math.sin(p * Math.PI), px = BX(m.x) + S / 2;
      var gy0 = rowC(m.y0), gy1 = rowC(m.y1), gy = gy0 + (gy1 - gy0) * p;   // 땅 위의 위치(그림자 자리)
      var sc = 0.3 + h * 1.05, lift = h * 60, ry = gy - lift;
      m.trail = m.trail || []; if (!m.lastT || t - m.lastT > 40) { m.trail.push({ x: px + (Math.random() - 0.5) * 4, y: ry + 10 * sc, s: sc, at: t }); m.lastT = t; }
      m.trail = m.trail.filter(function (q) { return t - q.at < 700; });
      m.trail.forEach(function (q) { var a = 1 - (t - q.at) / 700; ctx.fillStyle = 'rgba(150,140,130,' + (0.35 * a) + ')'; ctx.beginPath(); ctx.arc(q.x, q.y, (6 + (1 - a) * 14) * q.s, 0, 7); ctx.fill(); });   // 연기 꼬리
      ctx.fillStyle = 'rgba(0,0,0,' + (0.45 - h * 0.3) + ')'; ctx.beginPath(); ctx.ellipse(px + h * 22, gy + 6 + h * 8, 5 + 9 * (1 - h), 3 + 4 * (1 - h), 0, 0, 7); ctx.fill();   // 땅 그림자
      var img = p < 0.55 ? IMG.m_big : IMG.m_down;   // 오를 땐 큰 해상도 그림(m_big), 정점 지나면 기수가 땅을 향함(m_down)
      if (enemy) {                                      // 적 포탄: 떨어질 자리에 붉은 표적이 점점 또렷해진다
        ctx.save(); ctx.globalAlpha = 0.25 + 0.65 * p; ctx.strokeStyle = '#ff4a3a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(BX(m.x) + S / 2, BYY(m.y1) + S / 2, S * (0.5 - 0.15 * p), 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(BX(m.x) + S / 2 - 8, BYY(m.y1) + S / 2); ctx.lineTo(BX(m.x) + S / 2 + 8, BYY(m.y1) + S / 2); ctx.moveTo(BX(m.x) + S / 2, BYY(m.y1) + S / 2 - 8); ctx.lineTo(BX(m.x) + S / 2, BYY(m.y1) + S / 2 + 8); ctx.stroke(); ctx.restore();
      }
      if (img) fitImg(img, px, ry, S * 0.7 * sc, S * 1.7 * sc, 1, (0.5 - p) * 0.25 + (enemy && p < 0.55 ? Math.PI : 0));   // 적 포탄은 기수가 늘 내 쪽(아래)
      else { ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.arc(px, ry, 8 * sc, 0, 7); ctx.fill(); }
    }
    G.missiles.forEach(function (m) { drawMissile(m, Math.max(0, Math.min(1, (m.y0 - m.y) / Math.max(0.01, m.y0 - m.y1))), t, false); });
    G.incoming.forEach(function (m) { if (m.start) { if (m.hitTank) { m.x = G.tank.x; m.y1 = G.tank.y; } drawMissile(m, Math.max(0, Math.min(1, (t - m.start) / (m.at - m.start))), t, true); } });   // 탱크 표적이면 포탄이 탱크를 따라감
    // 효과
    G.fx.forEach(function (f) {
      var a = Math.max(0, t - f.at);
      if (f.t === 'cell') { var p = a / 700; ctx.fillStyle = 'rgba(255,220,120,' + (0.9 * (1 - p)) + ')'; ctx.fillRect(BX(f.x) + 4 + p * 26, BYY(f.y) + 4 + p * 26, (S - 8) * (1 - p), (S - 8) * (1 - p)); }
      else if (f.t === 'boomv' && IMG.boom) { var bs2 = (f.big ? 2 : 1.3) * S * (0.5 + 0.5 * Math.min(1, a / 200)), bal2 = Math.max(0, 1 - a / 700); fitImg(IMG.boom, f.px, f.py, bs2, bs2 * 0.6, bal2); }
      else if (f.t === 'boom' && IMG.boom) { var bs = (f.big ? 2.6 : 1.6) * S * (0.5 + 0.5 * Math.min(1, a / 200)), bal = Math.max(0, 1 - a / 700); fitImg(IMG.boom, BX(f.x) + S / 2, BYY(f.y) + S / 2, bs, bs * 0.6, bal); }
      else if (f.t === 'flash' && IMG.fx_line) { var fal = Math.max(0, 1 - a / 600); f.rows.forEach(function (ry) { fitImg(IMG.fx_line, W / 2, BYY(ry) + S / 2, W * 1.05, S * 1.6, fal); }); f.cols.forEach(function (cx) { fitImg(IMG.fx_line, BX(cx) + S / 2, BYY((top() + ROWS) / 2), ROWS * S, S * 1.6, fal, Math.PI / 2); }); }
      else if (f.t === 'boom') { var r = (f.big ? 50 : 26) * Math.min(1, a / 250), al = 1 - a / 700; ctx.fillStyle = 'rgba(255,140,30,' + al * 0.8 + ')'; ctx.beginPath(); ctx.arc(BX(f.x) + S / 2, BYY(f.y) + S / 2, r, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,240,180,' + al + ')'; ctx.beginPath(); ctx.arc(BX(f.x) + S / 2, BYY(f.y) + S / 2, r * 0.45, 0, 7); ctx.fill(); }
      else if (f.t === 'shieldHit') { var sr = S * (0.7 + a / 500), sal = Math.max(0, 1 - a / 500); ctx.save(); ctx.strokeStyle = 'rgba(255,212,81,' + sal + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(BX(G.tank.fx) + S / 2, BYY(G.tank.fy) + S / 2, sr, 0, 7); ctx.stroke(); ctx.restore(); }
      else if (f.t === 'pop') { ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (a - 550) / 450); ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; var fy = f.y - a / 40; ctx.strokeText(f.text, f.x, fy); ctx.fillStyle = f.col || '#fff'; ctx.fillText(f.text, f.x, fy); ctx.restore(); }
    });
    // 배너: 큰 사건은 보드 가운데 어두운 띠 위에 하나씩
    if (G.msg) {
      var mA = t - G.msg.at, mIn = Math.min(1, mA / 120), mOut = Math.max(0, Math.min(1, (1150 - mA) / 250)), mal = mIn * mOut, by2 = BYY(top()) + (ROWS - top()) * S * 0.38;
      ctx.save(); ctx.globalAlpha = mal; ctx.fillStyle = 'rgba(8,10,6,.72)'; ctx.fillRect(0, by2 - 24, W, 48);
      ctx.fillStyle = G.msg.col || '#ffd451'; ctx.fillRect(0, by2 - 24, W, 2); ctx.fillRect(0, by2 + 22, W, 2);
      ctx.font = '800 20px Orbitron, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = G.msg.col || '#ffd451'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
      ctx.save(); ctx.translate(W / 2, by2); ctx.scale(1 + 0.08 * (1 - mIn), 1 + 0.08 * (1 - mIn)); ctx.fillText(G.msg.text, 0, 0); ctx.restore(); ctx.restore();
    }
    drawHud(t); drawTray(t); try { drawPanel(t); } catch (e) { ctx.setTransform(scale * dpr, 0, 0, scaleY * dpr, 0, 0); ctx.translate(0, OFFY); }   // 패널 그리기 오류가 게임을 멈추지 않게
    if (G.drag && G.drag.px != null) { var d2 = G.drag; d2.p.cells.forEach(function (c) { drawBlock(d2.ox + c.dx * S, d2.oy + c.dy * S, S, c.r, 0.85); }); }
    if (G.dragInf) {
      var di = G.dragInf;
      if (di.col != null) { ctx.fillStyle = 'rgba(160,255,160,.22)'; ctx.fillRect(BX(di.col) + 2, EY, S - 4, HY - EY); ctx.fillStyle = 'rgba(255,230,120,.5)'; ctx.fillRect(BX(di.col) + 2, EY, S - 4, 6); }
      ctx.save(); ctx.globalAlpha = 0.9; drawSoldier(di.px - S / 2, di.py - S - 20, S, true); ctx.restore();
    }
  }
  var vortexRot = 0;
  function drawStorm(y0, h, t, strong) {                        // 폭풍우: 어두운 비 + 소용돌이 + 번쩍임 (y0~y0+h 구역)
    ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, h); ctx.clip();
    ctx.fillStyle = 'rgba(10,30,60,' + (strong ? 0.5 : 0.42) + ')'; ctx.fillRect(0, y0, W, h);
    if (IMG.x_vortex) { ctx.save(); ctx.globalAlpha = 0.5; ctx.translate(W / 2, y0 + h / 2); ctx.rotate(t / 900); var vs = Math.max(W, h) * 1.1; ctx.drawImage(IMG.x_vortex, -vs / 2, -vs / 2, vs, vs); ctx.restore(); }
    ctx.strokeStyle = 'rgba(190,220,255,.35)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (var i = 0; i < 60; i++) { var rx = ((i * 97 + t / 3) % (W + 40)) - 20, ry = y0 + ((i * 53 + t / 1.6) % (h + 30)) - 15; ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 18); }
    ctx.stroke();
    var fl = Math.sin(t / 130) > 0.97 || Math.sin(t / 311) > 0.985; if (fl) { ctx.fillStyle = 'rgba(220,235,255,.35)'; ctx.fillRect(0, y0, W, h); }
    ctx.restore();
  }
  function drawBolt(x, py, a) {                                  // 벼락: 위에서 (x열, py) 로 내리꽂힘 + 섬광
    var px = BX(x) + S / 2, k = Math.min(1, a / 120), fade = Math.max(0, 1 - Math.max(0, a - 250) / 450);
    ctx.save(); ctx.globalAlpha = fade;
    if (IMG.x_bolt) { var bh = (py - EY + 20) * k, bw = S * 1.3; ctx.drawImage(IMG.x_bolt, px - bw / 2 + Math.sin(a / 40) * 3, py - bh, bw, bh); }
    else { ctx.strokeStyle = '#e8d8ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, EY); ctx.lineTo(px, py); ctx.stroke(); }
    if (a > 100) { var br = S * (0.4 + 0.6 * Math.min(1, (a - 100) / 200)); var g = ctx.createRadialGradient(px, py, 0, px, py, br); g.addColorStop(0, 'rgba(240,225,255,.9)'); g.addColorStop(1, 'rgba(160,90,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, br, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function drawShield(cx, cy, hp, t, alpha) {                    // 태양 방패: 탱크 위 노란 돔(남은 겹수만큼 또렷)
    if (hp <= 0) return; var a = (hp >= 2 ? 0.95 : 0.6) * (alpha == null ? 1 : alpha) * (0.85 + 0.15 * Math.sin(t / 180));
    if (IMG.x_dome) fitImg(IMG.x_dome, cx, cy - S * 0.1, S * 1.5, S * 1.1, a);
    else { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ffd451'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, S * 0.62, 0, 7); ctx.stroke(); ctx.restore(); }
  }
  function drawSkillFx(t) {
    if (t < G.stormMine) drawStorm(BYY(top()), (ROWS - top()) * S, t, true);                      // 내 땅의 폭풍우(서지)
    if (t < G.stormOpp) { drawStorm(EY, fogH(), t, false); ctx.save(); ctx.font = '700 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#bfe3ff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('폭풍우 — 정찰 불가 ' + Math.ceil((G.stormOpp - t) / 1000) + 's', W / 2, EY + 4); ctx.restore(); }
    G.bolts.forEach(function (b) { if (t >= b.at) drawBolt(b.x, b.py, t - b.at); });
    if (G.shield > 0) drawShield(BX(G.tank.fx) + S / 2, BYY(G.tank.fy) + S / 2, G.shield, t);
    if (G.oppShield > 0 && G.oppTank && (t < G.scoutUntil || (G.reveal && t < G.reveal.until))) drawShield(BX(COLS - 1 - G.oppTank.x) + S / 2, rowC(-1 - G.oppTank.y), G.oppShield, t, 0.8);
    if (G.crash) {                                                                                   // 내 정찰기 추락: 전선 위로 조금 올라가다 벼락 맞고 빙글 떨어짐
      var ca = t - G.crash.at, cp = Math.min(1, ca / 1600), cx0 = W * 0.3 + cp * W * 0.25, cy0 = BYY(G.adv) - 20 - Math.sin(Math.min(1, ca / 500) * Math.PI / 2) * 60 + Math.max(0, ca - 500) * 0.18;
      if (ca > 350 && ca < 900) drawBolt(Math.floor(cx0 / S), cy0, ca - 350);
      ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (ca - 1200) / 400); ctx.translate(cx0, cy0); ctx.rotate(ca > 400 ? (ca - 400) / 120 : 0);
      if (IMG.u_plane) fitImg(IMG.u_plane, 0, 0, 70 * (1 - cp * 0.4), 54 * (1 - cp * 0.4), 1, 0); ctx.restore();
      if (ca > 400) { ctx.fillStyle = 'rgba(80,80,80,' + (0.5 - cp * 0.3) + ')'; for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(cx0 - i * 9 - ca / 40, cy0 - i * 7 - 10, 6 + i * 2, 0, 7); ctx.fill(); } }
    }
    if (G.ultFx && t - G.ultFx.at < 700) { var ua = 1 - (t - G.ultFx.at) / 700; ctx.fillStyle = G.ultFx.col; ctx.save(); ctx.globalAlpha = 0.35 * ua; ctx.fillRect(0, EY, W, HY - EY); ctx.restore(); }
  }
  var ULTB = null;                                                // 내 문장(필살기 버튼) 영역
  function drawPanel(t) {                                         // 오른쪽 정보 패널: [상대] 탱크+체력 / 문장 게이지 · 전선 게이지 · [나] 탱크+체력 / 문장 게이지(버튼)
    var x0 = W, g = ctx.createLinearGradient(x0, 0, x0 + PW, 0); g.addColorStop(0, '#15170f'); g.addColorStop(1, '#23261b'); ctx.fillStyle = g; ctx.fillRect(x0, -OFFY, PW, HL);
    ctx.fillStyle = '#3a3e32'; ctx.fillRect(x0, -OFFY, 2, HL);
    if (OFFY > 0) { ctx.fillStyle = '#1b1d16'; ctx.fillRect(0, -OFFY, W, OFFY); ctx.fillRect(0, H, W, OFFY + 1); }
    var o = (window.NET && NET.opp()) || {}, ohp = o.hp == null ? HP_MAX : o.hp, of = FAC[o.fac] || null, oult = o.ult | 0;
    function card(y0, hgt, title, tankImg, hp, shield, f, ult, mine, col) {
      var pad = 6, th = Math.max(30, Math.min(hgt * 0.4, (PW - 20) * 0.58 * 1.1)), tw = th / 1.1;   // 탱크: 왼쪽에, 오른쪽엔 체력 막대 3단(패널 끝까지)
      ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '700 11px system-ui'; ctx.fillStyle = col; ctx.shadowColor = '#000'; ctx.shadowBlur = 3; ctx.fillText(title, x0 + pad, y0); ctx.restore();
      var ty = y0 + 16, tcx = x0 + pad + tw / 2, tcy = ty + th / 2;
      if (tankImg) fitImg(tankImg, tcx, tcy, tw, th, 1, 0);
      if (shield > 0) drawShield(tcx, tcy, shield, t, 0.9);
      var bx = x0 + pad + tw + 8, bw = Math.max(14, x0 + PW - 6 - bx), segH = Math.min(14, (th - 12) / 3), gap = 5, by = tcy - (segH * 3 + gap * 2) / 2;
      for (var i = 0; i < HP_MAX; i++) { var on = i < hp, sy = by + (HP_MAX - 1 - i) * (segH + gap);
        ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(bx, sy, bw, segH, 4); ctx.fill();
        if (on) { var hg = ctx.createLinearGradient(bx, sy, bx, sy + segH); hg.addColorStop(0, '#ff8a7a'); hg.addColorStop(1, '#d81f10'); ctx.fillStyle = hg; rr(bx + 1, sy + 1, bw - 2, segH - 2, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.3)'; rr(bx + 3, sy + 2, bw - 6, segH * 0.3, 2); ctx.fill(); }
        ctx.strokeStyle = on ? '#ff5050' : '#3a3e32'; ctx.lineWidth = 1; rr(bx, sy, bw, segH, 4); ctx.stroke(); }
      if (shield > 0) { ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '700 9px system-ui'; ctx.fillStyle = '#ffd451'; ctx.fillText('방패 ' + shield, bx, by + segH * 3 + gap * 2 + 3); ctx.restore(); }
      // 문장 = 필살기 게이지(아래에서 차오름)
      var E = Math.max(24, Math.min(PW - 16, hgt - th - 44)), ex = x0 + PW / 2, ey = ty + th + 12 + E / 2, full = ult >= ULT_MAX, fr = Math.min(1, ult / ULT_MAX);
      if (f && IMG[f.img]) {
        var pulse = full ? 0.5 + 0.5 * Math.sin(t / 160) : 0;
        fitImg(IMG[f.img], ex, ey, E, E, 0.22, 0);                                                                                 // 바탕: 흐린 문장
        ctx.save(); ctx.beginPath(); ctx.rect(ex - E / 2, ey + E / 2 - E * fr, E, E * fr); ctx.clip(); fitImg(IMG[f.img], ex, ey, E, E, 1, 0); ctx.restore();   // 찬 만큼 또렷
        if (fr > 0 && fr < 1) { ctx.fillStyle = f.col; ctx.globalAlpha = 0.7; ctx.fillRect(ex - E / 2, ey + E / 2 - E * fr - 1, E, 2); ctx.globalAlpha = 1; }
        if (full) { ctx.save(); ctx.shadowColor = f.col; ctx.shadowBlur = 14 + 10 * pulse; ctx.strokeStyle = f.col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(ex, ey, E / 2 + 3, 0, 7); ctx.stroke(); ctx.restore(); }
        else { ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ex, ey, E / 2 + 3, 0, 7); ctx.stroke(); }
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = full ? '800 10px Orbitron, system-ui' : '600 9px system-ui'; ctx.fillStyle = full ? f.col : '#cfd6bf'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
        ctx.fillText(full ? (mine ? '▶ ' + f.skill : f.skill + ' 준비됨') : (f.skill + ' ' + ult + '/' + ULT_MAX), ex, ey + E / 2 + 7); ctx.restore();
      } else if (!f) { ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 9px system-ui'; ctx.fillStyle = '#6b7a52'; ctx.fillText('세력 ?', ex, ey); ctx.restore(); }
      return { x: ex - E / 2 - 6, y: ey - E / 2 - 6, w: E + 12, h: E + 26 };
    }
    // 상대 카드
    var oH = Math.min(250, BY + 36 - EY - 125);                       // 상대 카드도 내 카드처럼 문장이 크게
    card(EY + 6, oH, '상대 ' + (o.name || ''), IMG.u_tank_e, ohp, o.shield | 0, of, oult, false, '#ff8a7a');
    // 전선 게이지
    ctx.fillStyle = '#3a3e32'; ctx.fillRect(x0 + 8, EY + 6 + oH + 6, PW - 16, 1);
    var gy0 = EY + 6 + oH + 28, gh = BY + 40 - gy0 - 6, tot = EROWS + ROWS, rh = gh / tot, gx0 = x0 + 8, gw = PW - 16, lineRow = EROWS + G.adv, myPct = Math.round((ROWS - G.adv) / tot * 100);
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '700 9px system-ui'; ctx.fillStyle = '#cfd6bf'; ctx.fillText('전선', x0 + PW / 2, gy0 - 13);
    ctx.fillStyle = 'rgba(255,80,70,.32)'; ctx.fillRect(gx0, gy0, gw, rh * lineRow); ctx.fillStyle = 'rgba(120,230,110,.32)'; ctx.fillRect(gx0, gy0 + rh * lineRow, gw, gh - rh * lineRow);
    for (var gi = 1; gi < tot; gi++) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(gx0, gy0 + gi * rh, gw, 1); }
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(gx0, gy0 + rh * EROWS - 1, gw, 2);
    ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(gx0 - 3, gy0 + rh * lineRow); ctx.lineTo(gx0 + gw + 3, gy0 + rh * lineRow); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#4a4e40'; ctx.lineWidth = 1; ctx.strokeRect(gx0, gy0, gw, gh);
    var ts = Math.min(gw * 0.4, rh * 2.2);
    if (IMG.u_tank_e) fitImg(IMG.u_tank_e, x0 + PW / 2, gy0 + rh * 1.3, ts, rh * 2.2, 0.85, 0);
    if (IMG.u_tank_p) fitImg(IMG.u_tank_p, x0 + PW / 2, gy0 + gh - rh * 1.3, ts, rh * 2.2, 0.85, 0);
    ctx.font = '800 10px Orbitron, system-ui'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
    var oy1 = gy0 + rh * 2.6 + (rh * lineRow - rh * 2.6) / 2, my1 = gy0 + rh * lineRow + (gh - rh * lineRow - rh * 2.6) / 2;
    ctx.strokeText((100 - myPct) + '%', x0 + PW / 2, oy1); ctx.fillStyle = '#ffb3a8'; ctx.fillText((100 - myPct) + '%', x0 + PW / 2, oy1);
    ctx.strokeText(myPct + '%', x0 + PW / 2, my1); ctx.fillStyle = '#c8f5b0'; ctx.fillText(myPct + '%', x0 + PW / 2, my1);
    ctx.restore();
    ctx.fillStyle = '#3a3e32'; ctx.fillRect(x0 + 8, BY + 44, PW - 16, 1);
    // 내 카드 (문장 = 필살기 버튼)
    var mH = HY - (BY + 54) - 64;                                       // 내 카드는 패널 바닥까지(문장이 크게)
    ULTB = card(BY + 54, mH, '나 · ' + fac().name, IMG.u_tank_p, G.tank.hp, G.shield, fac(), G.ult, true, '#9be37a');
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '500 8px system-ui'; ctx.fillStyle = '#8a9477';
    wrap(fac().desc, PW - 10).forEach(function (l, i) { ctx.fillText(l, x0 + PW / 2, ULTB.y + ULTB.h + 8 + i * 11); }); ctx.restore();
  }
  function wrap(txt, w) { var out = [], cur = ''; ctx.font = '500 8px system-ui'; txt.split(' ').forEach(function (wd) { var tr = cur ? cur + ' ' + wd : wd; if (ctx.measureText(tr).width > w && cur) { out.push(cur); cur = wd; } else cur = tr; }); if (cur) out.push(cur); return out.slice(0, 6); }
  var BTN = {};
  function layoutBtns() {
    var keys = G && G.vs ? ['scout', 'missile', 'inf'] : ['scout', 'missile'], n = keys.length, gap = 6, w = (W - gap * (n + 1)) / n;
    BTN = {}; keys.forEach(function (k, i) { BTN[k] = { x: gap + i * (w + gap), y: OY + 5, w: w, h: BBAR - 10 }; });
  }
  function drawHud(t) {
    var g = ctx.createLinearGradient(0, HY, 0, HY + HUD); g.addColorStop(0, '#3a3e32'); g.addColorStop(1, '#1b1d16'); ctx.fillStyle = g; ctx.fillRect(0, HY, W, HUD);
    ctx.fillStyle = '#0a0b08'; ctx.fillRect(0, HY, W, 3);
    // 맨 위 띠(진격 타이머)
    var g2 = ctx.createLinearGradient(0, 0, 0, TOP); g2.addColorStop(0, '#2a2d24'); g2.addColorStop(1, '#141610'); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, TOP);
    function btn(b, icon, n, label, on) {
      var gg = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h); gg.addColorStop(0, on ? '#ffe284' : '#6b6f60'); gg.addColorStop(1, on ? '#e8a21a' : '#3e4138');
      rr(b.x, b.y, b.w, b.h, 10); ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = on ? '#ffd451' : '#2a2c24'; ctx.lineWidth = 2; ctx.stroke();
      var bim = IMG[{ '🔭': 'b_scout', '🚀': 'b_missile', '🪖': 'b_inf' }[icon]];
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      if (bim) fitImg(bim, b.x + 24, b.y + b.h / 2, b.h - 8, b.h - 8, on ? 1 : 0.5); else { ctx.font = '24px system-ui'; ctx.fillText(icon, b.x + 10, b.y + b.h / 2 + 1); }
      ctx.font = '800 22px Orbitron'; ctx.fillStyle = on ? '#2a1a00' : '#aaa'; ctx.fillText('×' + n, b.x + 44, b.y + b.h / 2 + 1);
      ctx.font = '600 11px system-ui'; ctx.textAlign = 'right'; ctx.fillStyle = on ? '#5a3b00' : '#888'; ctx.fillText(label, b.x + b.w - 10, b.y + b.h / 2 + 1);
    }
    layoutBtns();
    var g3 = ctx.createLinearGradient(0, OY, 0, H); g3.addColorStop(0, '#1b1d16'); g3.addColorStop(1, '#0d0e0a'); ctx.fillStyle = g3; ctx.fillRect(0, OY, W, BBAR);
    btn(BTN.scout, '🔭', G.scout, '정찰', G.scout > 0);
    var rl = Math.max(0, G.missileReady - t); btn(BTN.missile, '🚀', G.missile, rl > 0 ? (rl / 1000).toFixed(1) + 's' : '미사일', G.missile > 0 && rl <= 0);
    if (rl > 0) { var mb = BTN.missile, rp = 1 - rl / 3000; ctx.save(); rr(mb.x, mb.y, mb.w, mb.h, 10); ctx.clip(); ctx.fillStyle = 'rgba(255,200,80,.45)'; ctx.fillRect(mb.x, mb.y, mb.w * rp, mb.h); ctx.restore(); }
    if (G.vs) btn(BTN.inf, '🪖', G.inf, '보병 투입', G.inf > 0);
    // 연료
    var hy = HY, cy = hy + HUD / 2;
    ctx.font = '18px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('⛽', 8, cy);
    ctx.fillStyle = '#111'; rr(32, cy - 9, 130, 18, 5); ctx.fill();
    for (var i = 0; i < FUEL_MAX; i++) { ctx.fillStyle = i < G.fuel ? (i % 3 === 2 ? '#ff6a3d' : '#ffb13d') : '#2a2a2a'; ctx.fillRect(35 + i * 8.4, cy - 6, 6.5, 12); }
    ctx.font = '600 10px Orbitron'; ctx.fillStyle = '#cfd6bf'; ctx.fillText(G.fuel + '/' + FUEL_MAX, 168, cy);
    // 점수 / 상대
    ctx.textAlign = 'right';
    if (G.vs) {
      var o = (window.NET && NET.opp()) || {};
      var mf = G.mySol.filter(function (e) { return e.d === 1; }).length, ef = G.soldiers.filter(function (e) { return e.d === 1; }).length;
      ctx.textAlign = 'left'; ctx.font = '600 11px system-ui'; ctx.fillStyle = '#cfd6bf'; ctx.fillText('최전방 보병', 215, cy);
      ctx.font = '800 15px Orbitron'; ctx.fillStyle = mf > ef ? '#9be37a' : mf < ef ? '#ff8a7a' : '#fff'; ctx.fillText(mf + ' : ' + ef, 290, cy);
    }
    else { ctx.font = '800 20px Orbitron'; ctx.fillStyle = '#ffd451'; ctx.fillText(String(G.score), W - 10, cy); ctx.font = '600 9px Orbitron'; ctx.fillStyle = '#cfd6bf'; ctx.fillText('BEST ' + best(), W - 10 - ctx.measureText(String(G.score)).width * 2.4 - 12, cy); }
    // 진격 타이머
    var left = Math.max(0, G.nextAdv - t), p = left / advMs(t);
    ctx.fillStyle = '#111'; ctx.fillRect(0, TOP - 6, W, 6); ctx.fillStyle = left < 6000 ? '#ff3b3b' : '#9bbd55'; ctx.fillRect(0, TOP - 6, W * p, 6);
    ctx.textAlign = 'center'; ctx.font = '600 11px Orbitron'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(G.sweep ? '적군 돌파!' : G.vs ? ('교전까지 ' + Math.ceil(Math.max(0, left) / 1000) + 's') : ('적 진격까지 ' + Math.ceil(left / 1000) + 's (' + (advMs(t) / 1000) + '초 간격)  ·  적 병사 ' + G.soldiers.length), W / 2, 10); ctx.shadowBlur = 0;
  }
  function traySlot(i) { var w = (W - 40) / 3 - 10; return { x: 20 + i * (w + 15), y: TY + 8, w: w, h: TRAY - 16 }; }
  function drawTray(t) {
    var g = ctx.createLinearGradient(0, TY, 0, H); g.addColorStop(0, '#1b1d16'); g.addColorStop(1, '#3a3e32'); ctx.fillStyle = g; ctx.fillRect(0, TY, W, TRAY);
    for (var i = 0; i < 3; i++) {
      var sl = traySlot(i), p = G.tray[i];
      rr(sl.x, sl.y, sl.w, sl.h, 10); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill(); ctx.strokeStyle = '#4a4e40'; ctx.lineWidth = 2; ctx.stroke();
      if (!p || (G.drag && G.drag.i === i)) continue;
      var s = 26, ox = sl.x + (sl.w - p.w * s) / 2, oy = sl.y + (sl.h - p.h * s) / 2;
      var fits = anyFit(p);
      p.cells.forEach(function (c) { drawBlock(ox + c.dx * s, oy + c.dy * s, s, c.r, fits ? 1 : 0.35); });
    }
  }
  function best() { try { return +localStorage.getItem('tank_best') || 0; } catch (e) { return 0; } }

  // ---------- 입력 ----------
  function pos(ev) { var r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scaleY - OFFY }; }
  function inB(b, p) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }
  var down = null;
  cv.addEventListener('pointerdown', function (ev) {
    if (!G || G.over || G.sweep || G.collapsing) return;
    var p = pos(ev); if (p.x >= W) { if (G.vs && ULTB && inB(ULTB, p)) useUlt(); return; } down = p; cv.setPointerCapture(ev.pointerId);
    if (inB(BTN.scout, p)) { if (G.scout <= 0) sfx('bad'); useScout(); down = null; return; }
    if (inB(BTN.missile, p)) { if (G.missile <= 0) { sfx('bad'); down = null; return; } useMissile(); down = null; return; }
    if (G.vs && inB(BTN.inf, p)) { if (G.inf <= 0) { sfx('bad'); down = null; return; } useInfantry(); down = null; return; }
    for (var i = 0; i < 3; i++) if (G.tray[i] && inB(traySlot(i), p)) { G.drag = { i: i, p: G.tray[i], px: null, sx: p.x, sy: p.y, moved: false }; dragTo(p); sfx('pick'); return; }
  });
  function dragTo(p) {
    var d = G.drag; d.px = p.x; d.py = p.y; if (Math.abs(p.x - d.sx) > 14 || Math.abs(p.y - d.sy) > 14) d.moved = true;
    d.ox = p.x - d.p.w * S / 2; d.oy = p.y - 80 - d.p.h * S;
    var gx = Math.round(d.ox / S), gy = Math.round((d.oy - BY) / S);
    d.gx = gx; d.gy = gy;
  }
  cv.addEventListener('pointermove', function (ev) { if (!G) return; if (G.drag) dragTo(pos(ev)); else if (G.aim) { var p = pos(ev), fh = fogH(); G.aim.dist = (p.y < BYY(G.adv) + S * 0.3 && p.y >= EY - 10) ? Math.max(1, Math.min(SLOTS, Math.ceil((BYY(G.adv) - Math.max(EY, p.y)) / (fh / SLOTS)))) : null; } else if (G.dragInf) { var p = pos(ev); G.dragInf.px = p.x; G.dragInf.py = p.y; G.dragInf.col = (p.y < HY && p.x >= 0 && p.x < W) ? Math.floor(p.x / S) : null; } });
  cv.addEventListener('pointerup', function (ev) {
    if (!G || G.over) return;
    if (G.collapsing) { G.drag = null; G.dragInf = null; G.aim = null; down = null; return; }
    var p = pos(ev);
    if (G.aim) { var am = G.aim; G.aim = null; if (am.dist) useMissile(am.dist); else sfx('bad'); return; }
    if (G.dragInf) { var di = G.dragInf; G.dragInf = null; if (di.col != null) useInfantry(di.col); else sfx('bad'); return; }
    if (G.drag) {
      var d = G.drag; G.drag = null;
      if (!d.moved) return;                                         // 탭만 한 경우: 제자리로
      if (d.gx != null && canPlace(d.p, d.gx, d.gy)) { G.tray[d.i] = null; sfx('place'); place(d.p, d.gx, d.gy); checkFit(); }
      else if (d.gx != null && d.gy >= 0 && d.gy < ROWS) sfx('bad');
      return;
    }
    if (down && Math.abs(p.x - down.x) < 12 && Math.abs(p.y - down.y) < 12 && p.y >= BY && p.y < BY + ROWS * S) {
      var cx2 = Math.floor(p.x / S), cy2 = Math.floor((p.y - BY) / S);
      if (cx2 === G.tank.x && cy2 === G.tank.y) { if (G.lockUntil && now() < G.lockUntil) { sfx('bad'); } else { G.sel = !G.sel; sfx(G.sel ? 'pick' : 'click'); } }           // 탱크 탭 → 갈 수 있는 칸 표시 토글
      else if (G.sel) { G.sel = false; moveTank(cx2, cy2); }
    }
    down = null;
  });
  cv.addEventListener('pointercancel', function () { if (G) { G.drag = null; G.dragInf = null; G.aim = null; } down = null; });

  // ---------- 화면 전환 ----------
  var ov = document.getElementById('ov'), ovText = document.getElementById('ovText'), ovScore = document.getElementById('ovScore'), startBtn = document.getElementById('startBtn');
  function showOver() {
    if (G.vs) { if (window.NET) NET.over(G.overMsg); return; }     // 대전은 NET 가 결과 화면을 띄운다
    try { if (G.score > best()) localStorage.setItem('tank_best', G.score); } catch (e) { }
    ovText.innerHTML = '<b>' + G.overMsg + '</b><br>지운 줄 ' + G.lines + ' · 격파 ' + G.kills + ' · ' + Math.round((now() - G.start) / 1000) + '초 버팀';
    ovScore.textContent = G.score; ovScore.classList.remove('hidden');
    startBtn.textContent = 'RETRY'; ov.classList.remove('hidden');
  }
  startBtn.addEventListener('click', function () { ov.classList.add('hidden'); if (window.BOT) { BOT.start(); } else { newGame(false); } sfx('go'); sfx('ambientStart'); });
  document.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { sfx('click'); }); });
  function loop() { var t = now(); if (G) { update(t); draw(t); } requestAnimationFrame(loop); }
  newGame(false); G.over = true;   // 시작 전 배경 표시용
  loop();
  window.__tank = { get: function () { return G; }, set: function (g) { G = g; }, fns: { canPlace: canPlace, place: place, anyFit: anyFit, calcReach: calcReach, checkFit: checkFit, top: top, makePiece: makePiece }, notice: function (txt) { if (G) { G.fx.push({ t: 'pop', text: txt, x: W / 2, y: EY + 40, at: now(), big: false }); } }, revealOpp: function (x, y) { if (!G || !G.vs) return; G.oppTank = { x: x, y: y }; G.reveal = { until: now() + 3500 }; G.lastSeen = { x: x, y: y, t: now(), how: '발사' }; sfx('warn'); }, incomingShot: incomingShot, applyLine: applyLine, setOpp: function (o) { if (!G || !G.vs) return; if (o.tank) { var tp = o.tank.split(','); G.oppTank = { x: +tp[0], y: +tp[1] }; } if (o.sol != null) G.soldiers = o.sol ? o.sol.split(';').map(function (q) { var a = q.split(':'); return { x: COLS - 1 - (+a[0]), d: +a[1] }; }) : []; }, clash: startClash, enemyScout: enemyScout, BTN: function () { layoutBtns(); return BTN; }, newGame: newGame, addEnemyInf: addEnemyInf, useInfantry: useInfantry, forceOver: function (m) { G.over = true; G.overMsg = m || '테스트'; showOver(); }, place: place, canPlace: canPlace, moveTank: moveTank, useScout: useScout, useMissile: useMissile, makePiece: makePiece, checkFit: checkFit, useUlt: useUlt, skillIn: skillIn, FAC: FAC, ULT_MAX: ULT_MAX };
})();
