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
  var W = COLS * S, TOP = 22, HUD = 26, TRAY = 96, BOT = 48, FS = 44;   // FS: 위쪽(적진) 한 줄 높이       // 위: 진격 타이머 띠. 보드 아래: 연료·점수 한 줄(HUD) → 블록 받침(TRAY) → 맨 바닥 넓고 얇은 버튼 띠(BOT)
  var EY, BY, HY, TY, OY, H, ADV_MIN, SLOTS = 13;            // SLOTS: 대전 사거리 칸 수 = 안개 4 + 상대 진영 9
  function layout(vs) {
    if (vs) { S = 60; FS = 26; EROWS = 9; TOP = 20; HUD = 24; TRAY = 80; BOT = 44; } else { S = 68; FS = 44; EROWS = 4; TOP = 22; HUD = 26; TRAY = 96; BOT = 48; }
    W = COLS * S; groundImg = null; EY = TOP; BY = TOP + EROWS * FS; HY = BY + ROWS * S; TY = HY + HUD; OY = TY + TRAY; H = OY + BOT; ADV_MIN = -(EROWS - 1); }
  layout(false);
  var FUEL_PER = 3, FUEL_MAX = 15, SCOUT_MS = 5000, ADV_MS = 30000, ADV_STEP = 5000, ADV_FLOOR = 20000, ADV_EVERY = 180000, HP_MAX = 3;
  function advMs(t) { return G.vs ? ADV_MS : Math.max(ADV_FLOOR, ADV_MS - ADV_STEP * Math.floor((t - G.start) / ADV_EVERY)); }   // 3분마다 5초씩 빨라짐, 최저 20초
  var SCOUT_MAX = 5, MISSILE_MAX = 5, INF_MAX = 5;
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

  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), scale = 1, dpr = 1;
  function fit() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    cv.style.width = (W * scale) + 'px'; cv.style.height = (H * scale) + 'px';
    cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
  }
  window.addEventListener('resize', fit); fit();
  function rowC(y) { return BYY(y) + (y >= 0 ? S : FS) / 2; }      // 줄 y 의 세로 중심
  function slotY(d) { return rowC(G.adv - d); }                  // 전선에서 d 줄 앞(적 쪽)   // 사거리 d(1..) 의 화면 y (대전은 안개를 13칸으로 압축)

  // ---------- 상태 ----------
  var G = null, groundImg = null;
  // ---------- 그림 (시안 시트에서 잘라낸 조각) ----------
  var IMG = {}, IMG_LIST = ['u_tank_p', 'u_tank_e', 'u_soldier_e', 'u_soldier_p', 'u_plane', 'b_plain', 'b_fuel', 'b_scout', 'b_missile', 'b_inf', 'b_ground', 'b_forest', 'm_big', 'm_down', 'boom', 'fx_line', 'fog_a', 'fog_b', 'ui_warn', 'ui_cross'];
  IMG_LIST.forEach(function (n) { var i = new Image(); i.onload = function () { IMG[n] = i; }; i.src = 'assets/' + (/^(u|b|m)_/.test(n) ? '' : 'c_') + n + '.png?v=3'; });
  var BLK_IMG = { 1: 'b_plain', 2: 'b_fuel', 3: 'b_scout', 4: 'b_missile', 5: 'b_inf' };   // 정찰 = 정찰기, 보병 = 파란 병사
  function fitImg(img, cx, cy, w, h, alpha, rot) {              // 비율 유지해서 (cx,cy) 중심, w×h 안에 맞춰 그림
    var r = Math.min(w / img.width, h / img.height), dw = img.width * r, dh = img.height * r;
    ctx.save(); if (alpha != null) ctx.globalAlpha = alpha; ctx.translate(cx, cy); if (rot) ctx.rotate(rot); ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh); ctx.restore();
  }
  function sfx(n, a) { try { if (window.SFX && SFX[n]) SFX[n](a); } catch (e) { } }
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
      soldiers: [], mySol: [], oppTank: null,
      fuel: 2 * FUEL_PER, scout: 1, missile: 1, inf: vs ? 1 : 0,
      scoutUntil: 0, nextAdv: t + ADV_MS, start: t,
      missiles: [], fx: [],
      tray: [makePiece(), makePiece(), makePiece()], drag: null, dragInf: null, reach: null, sweep: false, reveal: null
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
    G.fx.push({ t: 'pop', text: '⚠ 적 보병 출현', x: W / 2, y: EY + EROWS * FS / 2, at: now(), big: true }); sfx('inf');
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
    if (G.tank.path.length) return;
    var k = x + ',' + y, n = G.reach[k];
    if (!n || !n.d) return;
    var path = [], c = [x, y];
    while (c && !(c[0] === G.tank.x && c[1] === G.tank.y)) { path.unshift(c); c = G.reach[c[0] + ',' + c[1]].from; }
    G.fuel -= path.length; G.tank.path = path; G.tank.moveAt = now(); sfx('step');
  }
  function useScout() { if (G.scout <= 0 || G.over) return; G.scout--; G.scoutUntil = now() + SCOUT_MS; sfx('scout'); G.fx.push({ t: 'pop', text: '🔭 정찰!', x: W / 2, y: EY + EROWS * FS / 2, at: now(), big: true }); }
  function useMissile() {                                  // 같은 세로줄에서 가장 앞에 있는 적 병사를 맞춘다. 대전에서 병사가 없으면 상대 진영 끝까지 날아가 그 줄의 상대 탱크를 맞춘다
    if (G.missile <= 0 || G.over || G.tank.path.length) return;
    var tx = G.tank.x, best = null;
    G.soldiers.forEach(function (e) { if (e.x === tx && (!best || e.d < best.d)) best = e; });
    var ty0 = best ? G.adv - best.d : (G.vs && G.oppTank && COLS - 1 - G.oppTank.x === tx) ? -1 - G.oppTank.y : -EROWS;
    G.missile--;
    G.missiles.push({ x: tx, y: G.tank.y, y0: G.tank.y, y1: ty0, target: best, shot: G.vs && !best, at: now() }); sfx('launch');
    if (G.vs && window.NET) NET.fired(tx, G.tank.y, !best);
  }
  function incomingShot(x) {                                // 대전: 상대 미사일이 내 쪽으로 넘어옴. 0.9초 뒤 그 세로줄에 내 탱크가 있으면 피격(옮기면 빗나감)
    if (!G.vs || G.over) return;
    var mx = COLS - 1 - x;
    G.incoming.push({ x: mx, at: now() + 900 });
    G.fx.push({ t: 'pop', text: '⚠ 포탄 날아온다!', x: BX(mx) + S / 2, y: BYY(0) + S, at: now(), big: false }); sfx('warn');
  }
  function useInfantry(col) {                             // 대전: 내 탱크 세로줄의 최전방(전선 바로 너머)에 보병을 세워 밀고 들어간다. 같은 줄이면 뒤로 쌓임
    if (!G.vs || G.inf <= 0 || G.over) return;
    if (col == null) col = G.tank.x;
    G.inf--; G.sent++;
    var d = 1; G.mySol.forEach(function (e) { if (e.x === col) d = Math.max(d, e.d + 1); }); G.mySol.push({ x: col, d: d });
    if (window.NET) NET.sendInf(col); sfx('send');
    G.fx.push({ t: 'pop', text: '🪖 보병 출격!', x: BX(col) + S / 2, y: BYY(top()) + S / 2, at: now(), big: true });
    for (var i = 0; i < 4; i++) G.fx.push({ t: 'cell', x: col, y: top() + i, at: now() + i * 60 });
  }
  function applyLine(L, nextTickIn) {                      // 대전: 방장이 정한 전선 위치 L(양수 = 내 땅이 그만큼 밀림, 음수 = 상대 땅을 그만큼 차지)
    var t = now(); if (nextTickIn != null && !G.sweep) G.nextAdv = t + nextTickIn;
    if (L === G.adv || G.sweep || G.over) return;
    var old = G.adv;
    if (L > old) {
      for (var y = Math.max(0, old); y < Math.min(ROWS, L); y++) for (var x = 0; x < COLS; x++) { if (G.board[y][x]) G.fx.push({ t: 'cell', x: x, y: y, at: t }); G.board[y][x] = 0; }
      G.fx.push({ t: 'pop', text: '⚠ 전선이 밀렸다!', x: W / 2, y: rowC(L - 1), at: t, big: true }); sfx('advance');
      G.adv = L;
      if (G.tank.y < L) { killTank('적에게 밟혔다'); return; }
      if (L >= ROWS) { G.over = true; G.overMsg = '전장을 잃었다'; sfx('ambientStop'); sfx('over'); setTimeout(showOver, 900); return; }
    } else {
      G.adv = L; G.fx.push({ t: 'pop', text: '전선 전진!', x: W / 2, y: rowC(L), at: t, big: true }); sfx('retreat');
    }
    calcReach(); checkFit();
  }
  function killTank(msg) { if (G.over) return; G.over = true; G.overMsg = msg; G.fx.push({ t: 'boom', x: G.tank.x, y: G.tank.y, at: now(), big: true }); sfx('sweepStop'); sfx('boom', true); sfx('ambientStop'); setTimeout(function () { if (!G.vs) sfx('over'); }, 600); setTimeout(showOver, 1200); }
  function checkFit() {
    var live = G.tray.filter(Boolean);
    if (!live.length) { G.tray = [makePiece(), makePiece(), makePiece()]; live = G.tray; }
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
      if (G.vs && !m.target && m.y <= m.y1) {                         // 대전: 병사 없으면 상대 진영으로 넘어가 착탄(명중 여부는 상대 쪽에서 판정)
        G.fx.push({ t: 'boomv', px: BX(m.x) + S / 2, py: rowC(m.y1), at: t, big: true }); sfx('boom', false);
        return false;
      }
      if (m.target && G.soldiers.indexOf(m.target) >= 0 && m.y <= ty) {
        G.soldiers.splice(G.soldiers.indexOf(m.target), 1);
        G.score += 300; G.kills++;
        G.fx.push({ t: 'boomv', px: BX(m.target.x) + S / 2, py: slotY(m.target.d), at: t, big: true });
        sfx('boom', false);
        G.fx.push({ t: 'pop', text: '+300', x: BX(m.target.x) + S / 2, y: slotY(m.target.d), at: t, big: true });
        if (!G.soldiers.some(function (e) { return e.d === 1; })) {   // 최전방 줄 전멸 → 전선이 한 줄 물러남, 뒷줄이 앞으로
          G.soldiers.forEach(function (e) { e.d--; });
          if (G.vs) { if (window.NET) NET.wiped(); }                   // 대전: 전선은 방장이 계산해서 내려줌
          else { if (G.adv > ADV_MIN) { G.adv--; G.nextAdv = Math.max(G.nextAdv, t + 8000); calcReach(); } spawnFront(); G.fx.push({ t: 'pop', text: '적 후퇴!', x: W / 2, y: BYY(front()) + S / 2, at: t + 300, big: true }); setTimeout(function () { sfx('retreat'); }, 250); }
        }
        if (G.vs && window.NET) NET.pub();
        return false;
      }
      return m.y > -EROWS - 1;
    });
    // 날아오는 상대 포탄 착탄
    G.incoming = G.incoming.filter(function (sh) {
      if (t < sh.at) return true;
      var hy = tk.x === sh.x ? tk.y : Math.max(top(), 1);
      G.fx.push({ t: 'boom', x: sh.x, y: hy, at: t, big: true }); sfx('boom', true); G.shake = 10; G.shakeUntil = t + 300;
      if (tk.x === sh.x) { tk.hp--; G.fx.push({ t: 'pop', text: '피격! 체력 ' + tk.hp, x: BX(tk.x) + S / 2, y: BYY(tk.y) - 24, at: t, big: true }); if (window.NET) NET.pub(true); if (tk.hp <= 0) killTank('상대 미사일에 격파'); }
      else G.fx.push({ t: 'pop', text: '빗나감', x: BX(sh.x) + S / 2, y: BYY(hy) - 10, at: t, big: false });
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
    G.fx = G.fx.filter(function (f) { return t - f.at < (f.t === 'pop' ? 1300 : 700); });
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
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.fillStyle = '#0b0d0a'; ctx.fillRect(0, 0, W, H);
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
    ctx.save(); ctx.globalAlpha = scouting ? 0.74 : 0.84;
    ctx.drawImage(fogC, 0, ((t / 60) % S) | 0, COLS * S, fogH(), 0, EY, COLS * S, fogH());
    if (IMG.fog_a && IMG.fog_b) {
      ctx.beginPath(); ctx.rect(0, EY, W, fogH()); ctx.clip(); ctx.globalAlpha = scouting ? 0.25 : 0.5;
      for (var fi = 0; fi < 7; fi++) { var fim = fi % 2 ? IMG.fog_a : IMG.fog_b, fw = 260 + (fi % 3) * 60, fx0 = ((fi * 173 + t / (60 + fi * 9)) % (W + fw)) - fw / 2, fy0 = EY + 20 + (fi * 67) % Math.max(40, fogH() - 40); ctx.drawImage(fim, fx0 - fw / 2, fy0 - fw * 0.22, fw, fw * 0.45); }
    }
    ctx.restore();
    if (plane) {                                                             // 정찰기 아래는 숲이 또렷하게(서치라이트)
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
    if (left < 10000 && !G.over && !G.sweep && !(G.vs && !G.soldiers.length)) { ctx.fillStyle = 'rgba(255,30,30,' + (0.08 + 0.1 * (1 - left / 10000) + 0.05 * Math.sin(t / 150)) + ')'; ctx.fillRect(0, EY, W, fogH()); }
    if (left < 6000 && !G.over) { ctx.fillStyle = 'rgba(255,40,40,' + (0.25 + 0.25 * Math.sin(t / 90)) + ')'; ctx.fillRect(0, BYY(G.adv), W, G.adv >= 0 ? S : FS); }
    ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(0, BYY(G.adv)); ctx.lineTo(W, BYY(G.adv)); ctx.stroke(); ctx.setLineDash([]);
    // 적 병사 (정찰 중에만 보임) · 내 보병(대전, 항상 보임) · 상대 탱크(대전, 정찰 중·발사 직후)
    if (scouting) G.soldiers.forEach(function (e, i) { var ss = G.vs ? FS * 1.15 : FS * 1.05, ox2 = G.vs && G.mySol.some(function (m) { return m.x === e.x && m.d === e.d; }) ? S * 0.22 : 0; drawSoldier(BX(e.x) + (S - ss) / 2 + ox2 + Math.sin(t / 170 + i * 2) * 2, slotY(e.d) - ss / 2 + Math.abs(Math.sin(t / 140 + i)) * -3, ss); });
    if (G.vs) {
      G.mySol.forEach(function (e, i) { var ss = FS * 1.15, ox2 = G.soldiers.some(function (m) { return m.x === e.x && m.d === e.d; }) ? -S * 0.22 : 0; drawSoldier(BX(e.x) + (S - ss) / 2 + ox2 + Math.sin(t / 190 + i) * 2, slotY(e.d) - ss / 2 + Math.abs(Math.sin(t / 150 + i)) * -3, ss, true); });
      if (G.oppTank && (scouting || (G.reveal && t < G.reveal.until))) {
        var otx = BX(COLS - 1 - G.oppTank.x) + S / 2, oty = rowC(-1 - G.oppTank.y), oa = scouting ? 1 : Math.min(1, (G.reveal.until - t) / 300);
        ctx.fillStyle = 'rgba(255,60,60,' + (0.18 * oa) + ')'; ctx.fillRect(BX(COLS - 1 - G.oppTank.x) + 2, EY, S - 4, BYY(0) - EY);
        if (IMG.u_tank_e) fitImg(IMG.u_tank_e, otx, oty, S * 0.95, FS * 1.5, oa);
        if (IMG.ui_cross) fitImg(IMG.ui_cross, otx, oty, FS * 1.6, FS * 1.6, oa * 0.8);
        ctx.save(); ctx.font = '700 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,220,220,' + oa + ')'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('상대 탱크', otx, oty + FS * 0.8); ctx.restore();
      }
    }
    if (G.vs) {                                                            // 위쪽 안내 글씨
      ctx.save(); ctx.font = '600 9px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3; ctx.fillText('▲ 상대 진영', 6, EY + 3); ctx.restore();
    }
    // 블록
    for (var y = top(); y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x]) drawBlock(BX(x), BYY(y), S, G.board[y][x]);
    // 갈 수 있는 칸
    if (!G.drag && !G.tank.path.length && !G.over && !G.sweep) for (var k in G.reach) if (G.reach[k].d) { var c = k.split(','), rcx = BX(+c[0]) + S / 2, rcy = BYY(+c[1]) + S / 2, pulse = 0.75 + 0.25 * Math.sin(t / 220 + G.reach[k].d);
      ctx.save(); ctx.shadowColor = '#39ff6a'; ctx.shadowBlur = 12 * pulse; ctx.fillStyle = 'rgba(57,255,106,' + (0.85 * pulse) + ')'; ctx.beginPath(); ctx.arc(rcx, rcy, 6, 0, 7); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(225,255,230,.95)'; ctx.beginPath(); ctx.arc(rcx, rcy, 2.5, 0, 7); ctx.fill(); ctx.restore(); }
    // 드래그 미리보기
    if (G.drag && G.drag.moved) {
      var d = G.drag, ok = d.gx != null && canPlace(d.p, d.gx, d.gy);
      if (d.gx != null) d.p.cells.forEach(function (c) { var x = d.gx + c.dx, y = d.gy + c.dy; if (x >= 0 && x < COLS && y >= 0 && y < ROWS) { ctx.fillStyle = ok ? 'rgba(255,230,120,.35)' : 'rgba(255,60,60,.35)'; ctx.fillRect(BX(x) + 3, BYY(y) + 3, S - 6, S - 6); } });
    }
    // 위험: 빈 칸이 적을수록 보드 가장자리가 붉게
    var empty = 0, total = (ROWS - top()) * COLS; for (var yy = top(); yy < ROWS; yy++) for (var xx = 0; xx < COLS; xx++) if (!G.board[yy][xx]) empty++;
    var danger = 1 - empty / Math.max(1, total);
    if (danger > 0.6 && !G.over) { var dg = ctx.createRadialGradient(W / 2, BYY((top() + ROWS) / 2), W * 0.35, W / 2, BYY((top() + ROWS) / 2), W * 0.75); dg.addColorStop(0, 'rgba(255,0,0,0)'); dg.addColorStop(1, 'rgba(255,20,20,' + ((danger - 0.6) * 1.2 + 0.08 * Math.sin(t / 200)) + ')'); ctx.fillStyle = dg; ctx.fillRect(0, BYY(top()), W, (ROWS - top()) * S); }
    // 탱크
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
    // 미사일
    G.missiles.forEach(function (m) {
      // 곡사포를 위에서 내려다봄: 발사 직후 작게 → 꼭대기에서 가장 크게(카메라에 가까움) → 떨어지며 작아짐.
      // 오르는 동안은 꼬리 불꽃이 아래로(m_up), 정점을 지나면 기수가 땅을 향해 꽂히는 모습(m_down, 불꽃이 위)으로 바뀜.
      var p = Math.max(0, Math.min(1, (m.y0 - m.y) / Math.max(0.01, m.y0 - m.y1))), h = Math.sin(p * Math.PI), px = BX(m.x) + S / 2;
      var gy0 = rowC(m.y0), gy1 = rowC(m.y1), gy = gy0 + (gy1 - gy0) * p;   // 땅 위의 위치(그림자 자리)
      var sc = 0.3 + h * 1.05, lift = h * 60, ry = gy - lift;
      m.trail = m.trail || []; if (!m.lastT || t - m.lastT > 40) { m.trail.push({ x: px + (Math.random() - 0.5) * 4, y: ry + 10 * sc, s: sc, at: t }); m.lastT = t; }
      m.trail = m.trail.filter(function (q) { return t - q.at < 700; });
      m.trail.forEach(function (q) { var a = 1 - (t - q.at) / 700; ctx.fillStyle = 'rgba(150,140,130,' + (0.35 * a) + ')'; ctx.beginPath(); ctx.arc(q.x, q.y, (6 + (1 - a) * 14) * q.s, 0, 7); ctx.fill(); });   // 연기 꼬리
      ctx.fillStyle = 'rgba(0,0,0,' + (0.45 - h * 0.3) + ')'; ctx.beginPath(); ctx.ellipse(px + h * 22, gy + 6 + h * 8, 5 + 9 * (1 - h), 3 + 4 * (1 - h), 0, 0, 7); ctx.fill();   // 땅 그림자
      var img = p < 0.55 ? IMG.m_big : IMG.m_down;   // 오를 땐 큰 해상도 그림(m_big), 정점 지나면 기수가 땅을 향함(m_down)
      if (img) fitImg(img, px, ry, S * 0.7 * sc, S * 1.7 * sc, 1, (0.5 - p) * 0.25);
      else { ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.arc(px, ry, 8 * sc, 0, 7); ctx.fill(); }
    });
    // 효과
    G.fx.forEach(function (f) {
      var a = Math.max(0, t - f.at);
      if (f.t === 'cell') { var p = a / 700; ctx.fillStyle = 'rgba(255,220,120,' + (0.9 * (1 - p)) + ')'; ctx.fillRect(BX(f.x) + 4 + p * 26, BYY(f.y) + 4 + p * 26, (S - 8) * (1 - p), (S - 8) * (1 - p)); }
      else if (f.t === 'boomv' && IMG.boom) { var bs2 = (f.big ? 2 : 1.3) * S * (0.5 + 0.5 * Math.min(1, a / 200)), bal2 = Math.max(0, 1 - a / 700); fitImg(IMG.boom, f.px, f.py, bs2, bs2 * 0.6, bal2); }
      else if (f.t === 'boom' && IMG.boom) { var bs = (f.big ? 2.6 : 1.6) * S * (0.5 + 0.5 * Math.min(1, a / 200)), bal = Math.max(0, 1 - a / 700); fitImg(IMG.boom, BX(f.x) + S / 2, BYY(f.y) + S / 2, bs, bs * 0.6, bal); }
      else if (f.t === 'flash' && IMG.fx_line) { var fal = Math.max(0, 1 - a / 600); f.rows.forEach(function (ry) { fitImg(IMG.fx_line, W / 2, BYY(ry) + S / 2, W * 1.05, S * 1.6, fal); }); f.cols.forEach(function (cx) { fitImg(IMG.fx_line, BX(cx) + S / 2, BYY((top() + ROWS) / 2), ROWS * S, S * 1.6, fal, Math.PI / 2); }); }
      else if (f.t === 'boom') { var r = (f.big ? 50 : 26) * Math.min(1, a / 250), al = 1 - a / 700; ctx.fillStyle = 'rgba(255,140,30,' + al * 0.8 + ')'; ctx.beginPath(); ctx.arc(BX(f.x) + S / 2, BYY(f.y) + S / 2, r, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,240,180,' + al + ')'; ctx.beginPath(); ctx.arc(BX(f.x) + S / 2, BYY(f.y) + S / 2, r * 0.45, 0, 7); ctx.fill(); }
      else if (f.t === 'pop') { ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (a - 700) / 600); ctx.font = (f.big ? '800 26px' : '600 20px') + ' Orbitron, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 5; ctx.strokeStyle = '#2a1a00'; ctx.strokeText(f.text, f.x, f.y - a / 30); ctx.fillStyle = '#ffd451'; ctx.fillText(f.text, f.x, f.y - a / 30); ctx.restore(); }
    });
    drawHud(t); drawTray(t);
    if (G.drag && G.drag.px != null) { var d2 = G.drag; d2.p.cells.forEach(function (c) { drawBlock(d2.ox + c.dx * S, d2.oy + c.dy * S, S, c.r, 0.85); }); }
    if (G.dragInf) {
      var di = G.dragInf;
      if (di.col != null) { ctx.fillStyle = 'rgba(160,255,160,.22)'; ctx.fillRect(BX(di.col) + 2, EY, S - 4, HY - EY); ctx.fillStyle = 'rgba(255,230,120,.5)'; ctx.fillRect(BX(di.col) + 2, EY, S - 4, 6); }
      ctx.save(); ctx.globalAlpha = 0.9; drawSoldier(di.px - S / 2, di.py - S - 20, S, true); ctx.restore();
    }
  }
  var BTN = {};
  function layoutBtns() {
    var keys = G && G.vs ? ['scout', 'missile', 'inf'] : ['scout', 'missile'], n = keys.length, gap = 6, w = (W - gap * (n + 1)) / n;
    BTN = {}; keys.forEach(function (k, i) { BTN[k] = { x: gap + i * (w + gap), y: OY + 5, w: w, h: BOT - 10 }; });
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
    var g3 = ctx.createLinearGradient(0, OY, 0, H); g3.addColorStop(0, '#1b1d16'); g3.addColorStop(1, '#0d0e0a'); ctx.fillStyle = g3; ctx.fillRect(0, OY, W, BOT);
    btn(BTN.scout, '🔭', G.scout, '정찰', G.scout > 0);
    btn(BTN.missile, '🚀', G.missile, '미사일', G.missile > 0);
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
      ctx.font = '600 10px system-ui'; ctx.fillStyle = '#cfd6bf';
      ctx.fillText('VS ' + (o.name || '?') + (o.over ? ' (격파됨)' : ' 체력 ' + '♥'.repeat(Math.max(0, o.hp == null ? HP_MAX : o.hp)) + '♡'.repeat(Math.max(0, HP_MAX - (o.hp == null ? HP_MAX : o.hp)))) + ' · 내 보병 ' + G.mySol.length + ' · 적 보병 ' + G.soldiers.length, W - 8, cy - 8);
      // 상대가 밀린 줄: 작은 막대(최대 9칸)
      ctx.textAlign = 'right'; ctx.font = '600 9px system-ui'; ctx.fillStyle = G.adv > 0 ? '#ff8a7a' : G.adv < 0 ? '#9be37a' : '#cfd6bf'; ctx.fillText('전선: ' + (G.adv > 0 ? '내 땅 ' + G.adv + '줄 밀림' : G.adv < 0 ? '상대 땅 ' + (-G.adv) + '줄 차지' : '중앙'), W - 8, cy + 8);
    }
    else { ctx.font = '800 20px Orbitron'; ctx.fillStyle = '#ffd451'; ctx.fillText(String(G.score), W - 10, cy); ctx.font = '600 9px Orbitron'; ctx.fillStyle = '#cfd6bf'; ctx.fillText('BEST ' + best(), W - 10 - ctx.measureText(String(G.score)).width * 2.4 - 12, cy); }
    // 진격 타이머
    var left = Math.max(0, G.nextAdv - t), p = left / advMs(t);
    ctx.fillStyle = '#111'; ctx.fillRect(0, TOP - 6, W, 6); ctx.fillStyle = left < 6000 ? '#ff3b3b' : '#9bbd55'; ctx.fillRect(0, TOP - 6, W * p, 6);
    ctx.textAlign = 'center'; ctx.font = '600 11px Orbitron'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(G.sweep ? '⚠ 적군 돌파!' : G.vs ? ('전선 이동까지 ' + Math.ceil(Math.max(0, left) / 1000) + 's  ·  보병 있는 쪽이 민다') : ('적 진격까지 ' + Math.ceil(left / 1000) + 's (' + (advMs(t) / 1000) + '초 간격)  ·  적 병사 ' + G.soldiers.length), W / 2, 10); ctx.shadowBlur = 0;
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
  function pos(ev) { var r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale }; }
  function inB(b, p) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }
  var down = null;
  cv.addEventListener('pointerdown', function (ev) {
    if (!G || G.over || G.sweep) return;
    var p = pos(ev); down = p; cv.setPointerCapture(ev.pointerId);
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
    if (down && Math.abs(p.x - down.x) < 12 && Math.abs(p.y - down.y) < 12 && p.y >= BY && p.y < BY + ROWS * S) moveTank(Math.floor(p.x / S), Math.floor((p.y - BY) / S));
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
  startBtn.addEventListener('click', function () { ov.classList.add('hidden'); newGame(false); sfx('go'); sfx('ambientStart'); });
  document.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { sfx('click'); }); });
  function loop() { var t = now(); if (G) { update(t); draw(t); } requestAnimationFrame(loop); }
  newGame(false); G.over = true;   // 시작 전 배경 표시용
  loop();
  window.__tank = { get: function () { return G; }, notice: function (txt) { if (G) { G.fx.push({ t: 'pop', text: txt, x: W / 2, y: EY + 40, at: now(), big: false }); } }, revealOpp: function (x, y) { if (!G || !G.vs) return; G.oppTank = { x: x, y: y }; G.reveal = { until: now() + 1000 }; sfx('warn'); }, incomingShot: incomingShot, applyLine: applyLine, setOpp: function (o) { if (!G || !G.vs) return; if (o.tank) { var tp = o.tank.split(','); G.oppTank = { x: +tp[0], y: +tp[1] }; } if (o.enemy != null) G.mySol = o.enemy ? o.enemy.split(';').map(function (q) { var a = q.split(':'); return { x: COLS - 1 - (+a[0]), d: +a[1] }; }) : []; }, BTN: function () { layoutBtns(); return BTN; }, newGame: newGame, addEnemyInf: addEnemyInf, useInfantry: useInfantry, forceOver: function (m) { G.over = true; G.overMsg = m || '테스트'; showOver(); }, place: place, canPlace: canPlace, moveTank: moveTank, useScout: useScout, useMissile: useMissile, makePiece: makePiece, checkFit: checkFit };
})();
