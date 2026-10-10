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
  var COLS = 8, ROWS = 10, EROWS = 4, S = 60;              // 칸 크기 60
  var W = 480, TOP = 26, HUD = 30, TRAY = 120, BOT = 52;       // 위: 진격 타이머 띠. 보드 아래: 연료·점수 한 줄(HUD) → 블록 받침(TRAY) → 맨 바닥 넓고 얇은 버튼 띠(BOT)
  var EY = TOP, BY = TOP + EROWS * S, HY = BY + ROWS * S, TY = HY + HUD, OY = TY + TRAY, H = OY + BOT;
  var FUEL_PER = 3, FUEL_MAX = 15, SCOUT_MS = 5000, ADV_MS = 40000, ADV_STEP = 5000, ADV_FLOOR = 20000, ADV_EVERY = 180000, HP_MAX = 3, ADV_MIN = -(EROWS - 1);
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

  // ---------- 상태 ----------
  var G = null;
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
    var t = now();
    G = {
      vs: !!vs, board: [], adv: 0, score: 0, lines: 0, kills: 0, over: false, overMsg: '', result: '', sent: 0,
      tank: { x: 3, y: 7, hp: HP_MAX, path: [], moveAt: 0, fx: 3, fy: 7 },
      soldiers: [],
      fuel: 2 * FUEL_PER, scout: 1, missile: 1, inf: vs ? 1 : 0,
      scoutUntil: 0, nextAdv: t + ADV_MS, start: t,
      missiles: [], fx: [],
      tray: [makePiece(), makePiece(), makePiece()], drag: null, dragInf: null, reach: null, sweep: false
    };
    for (var y = 0; y < ROWS; y++) { G.board.push([]); for (var x = 0; x < COLS; x++) G.board[y].push(0); }
    G.tray = [makePiece(), makePiece(), makePiece()];      // 모드가 정해진 뒤 다시 뽑음(대전이면 보병 자원 포함)
    if (!G.vs) spawnFront();
    calcReach();
  }
  function addEnemyInf(x) {                               // 대전: 상대가 보낸 보병이 내 안개 구역에 선다(열은 좌우 반전, 같은 열이면 뒤로 쌓임)
    var xm = COLS - 1 - x, d = 1;
    G.soldiers.forEach(function (e) { if (e.x === xm) d = Math.max(d, e.d + 1); });
    G.soldiers.push({ x: xm, d: d });
    if (G.soldiers.length === 1) G.nextAdv = now() + ADV_MS;   // 보병이 처음 생기면 그때부터 40초
    G.fx.push({ t: 'pop', text: '⚠ 적 보병 출현', x: W / 2, y: EY + EROWS * S / 2, at: now(), big: true }); sfx('inf');
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
    for (y = top(); y < ROWS; y++) { full = true; for (x = 0; x < COLS; x++) if (!cellFilled(x, y)) { full = false; break; } if (full) rows.push(y); }
    for (x = 0; x < COLS; x++) { full = true; for (y = top(); y < ROWS; y++) if (!cellFilled(x, y)) { full = false; break; } if (full) cols.push(x); }
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
      var pts = n * 100 + (n - 1) * 100;
      G.score += pts; G.lines += n;
      G.fuel = Math.min(FUEL_MAX, G.fuel + got[2] * FUEL_PER);
      G.scout = Math.min(SCOUT_MAX, G.scout + got[3]);
      G.missile = Math.min(MISSILE_MAX, G.missile + got[4]);
      G.inf = Math.min(INF_MAX, G.inf + got[5]);
      var msg = '+' + pts + (got[2] ? '  ⛽' + got[2] : '') + (got[3] ? '  🔭' + got[3] : '') + (got[4] ? '  🚀' + got[4] : '') + (got[5] ? '  🪖' + got[5] : '');
      G.fx.push({ t: 'pop', text: msg, x: W / 2, y: BY + (top() + ROWS) / 2 * S, at: now(), big: n > 1 });
      G.fx.push({ t: 'flash', at: now(), rows: rows, cols: cols });
      sfx('clear', n); [2, 3, 4, 5].forEach(function (k, i) { if (got[k]) setTimeout(function () { sfx('gain', k); }, 350 + i * 120); });
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
  function useScout() { if (G.scout <= 0 || G.over) return; G.scout--; G.scoutUntil = now() + SCOUT_MS; sfx('scout'); G.fx.push({ t: 'pop', text: '🔭 정찰!', x: W / 2, y: EY + EROWS * S / 2, at: now(), big: true }); }
  function useMissile() {
    if (G.missile <= 0 || G.over || G.tank.path.length) return;
    G.missile--;
    var tx = G.tank.x, best = null;
    G.soldiers.forEach(function (e) { if (e.x === tx && (!best || e.d < best.d)) best = e; });
    G.missiles.push({ x: tx, y: G.tank.y, target: best, at: now() }); sfx('launch');
  }
  function useInfantry(col) {                             // 대전: 고른 열의 최전방(상대 쪽 안개)에 보병을 세운다
    if (!G.vs || G.inf <= 0 || G.over) return;
    if (col == null) col = G.tank.x;
    G.inf--; G.sent++;
    if (window.NET) NET.sendInf(col); sfx('send');
    G.fx.push({ t: 'pop', text: '🪖 보병 출격!', x: BX(col) + S / 2, y: BYY(top()) + S / 2, at: now(), big: true });
    for (var i = 0; i < 4; i++) G.fx.push({ t: 'cell', x: col, y: top() + i, at: now() + i * 60 });
  }
  function killTank(msg) { if (G.over) return; G.over = true; G.overMsg = msg; G.fx.push({ t: 'boom', x: G.tank.x, y: G.tank.y, at: now(), big: true }); sfx('sweepStop'); sfx('boom', true); sfx('ambientStop'); setTimeout(function () { if (!G.vs) sfx('over'); }, 600); setTimeout(showOver, 1200); }
  function checkFit() {
    var live = G.tray.filter(Boolean);
    if (!live.length) { G.tray = [makePiece(), makePiece(), makePiece()]; live = G.tray; }
    if (!live.some(anyFit) && !G.sweep) { G.sweep = true; G.nextAdv = now() + 900; sfx('sweepStart'); G.fx.push({ t: 'pop', text: '놓을 곳이 없다!', x: W / 2, y: BY + ROWS * S / 2, at: now(), big: true }); }
  }

  // ---------- 진행 ----------
  function update(t) {
    if (G.over) return;
    var tk = G.tank;
    if (tk.path.length && t - tk.moveAt >= 110) {
      var c = tk.path.shift(); tk.x = c[0]; tk.y = c[1]; tk.moveAt = t; if (tk.path.length) sfx('step');
      if (!tk.path.length) calcReach();
    }
    if (tk.path.length) { var p = Math.min(1, (t - tk.moveAt) / 110); tk.fx = tk.x + (tk.path[0][0] - tk.x) * p; tk.fy = tk.y + (tk.path[0][1] - tk.y) * p; }
    else { tk.fx = tk.x; tk.fy = tk.y; }
    // 미사일
    var dt = 1 / 60, fr = front();
    G.missiles = G.missiles.filter(function (m) {
      m.y -= 11 * dt;
      var ty = m.target ? G.adv - m.target.d : -99;
      if (m.target && G.soldiers.indexOf(m.target) >= 0 && m.y <= ty) {
        G.soldiers.splice(G.soldiers.indexOf(m.target), 1);
        G.score += 300; G.kills++;
        G.fx.push({ t: 'boom', x: m.target.x, y: ty, at: t, big: true }); sfx('boom', false);
        G.fx.push({ t: 'pop', text: '+300', x: BX(m.target.x) + S / 2, y: BYY(ty), at: t, big: true });
        if (!G.soldiers.some(function (e) { return e.d === 1; })) {   // 최전방 줄 전멸 → 한 줄 후퇴, 뒷줄이 앞으로
          if (G.adv > ADV_MIN) { G.adv--; G.nextAdv = Math.max(G.nextAdv, t + 8000); calcReach(); }
          G.soldiers.forEach(function (e) { e.d--; });
          if (!G.vs) spawnFront();
          G.fx.push({ t: 'pop', text: '적 후퇴!', x: W / 2, y: BYY(front()) + S / 2, at: t + 300, big: true }); setTimeout(function () { sfx('retreat'); }, 250);
        }
        return false;
      }
      return m.y > -EROWS - 1;
    });
    // 진격 (대전: 적 보병이 없으면 안 밀림)
    if (G.vs && !G.soldiers.length && !G.sweep) G.nextAdv = t + ADV_MS;
    if (t >= G.nextAdv) {
      G.nextAdv = t + (G.sweep ? 420 : advMs(t));
      var y = G.adv; G.adv++;
      if (y >= 0) for (var x = 0; x < COLS; x++) { if (G.board[y][x]) G.fx.push({ t: 'cell', x: x, y: y, at: t }); G.board[y][x] = 0; }
      if (!G.sweep) { G.fx.push({ t: 'pop', text: '⚠ 적 진격!', x: W / 2, y: BYY(y) + S / 2, at: t, big: true }); sfx('advance'); } else sfx('place');
      if (y >= 0 && tk.y === y) { killTank(G.sweep ? '놓을 곳이 없어 쓸려 나갔다' : '적에게 밟혔다'); return; }
      if (G.adv >= ROWS) { G.over = true; G.overMsg = '전장을 잃었다'; sfx('sweepStop'); sfx('ambientStop'); sfx('over'); setTimeout(showOver, 900); return; }
      if (G.vs && window.NET) NET.pub();
      if (!G.sweep) { calcReach(); checkFit(); }
    }
    if (!G.sweep && !(G.vs && !G.soldiers.length) && G.nextAdv - t < 6000 && Math.floor((G.nextAdv - t) / 1000) !== G.warnSec) { G.warnSec = Math.floor((G.nextAdv - t) / 1000); if (G.warnSec % 2 === 1) sfx('warn'); }
    G.fx = G.fx.filter(function (f) { return t - f.at < (f.t === 'pop' ? 1300 : 700); });
  }

  // ---------- 그리기 ----------
  function BX(x) { return x * S; }
  function BYY(y) { return BY + y * S; }
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
    var c = document.createElement('canvas'); c.width = COLS * S; c.height = (EROWS + ROWS) * S; var g = c.getContext('2d');
    g.fillStyle = '#07080a'; g.fillRect(0, 0, c.width, c.height);
    for (var i = 0; i < 260; i++) { var r = 20 + rnd(50); var gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(60,65,70,.35)'); gr.addColorStop(1, 'rgba(10,12,14,0)'); g.save(); g.translate(rnd(c.width), rnd(c.height)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.restore(); }
    return c;
  })();
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawBlock(px, py, s, r, alpha) {
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    var g = ctx.createLinearGradient(px, py, px, py + s); g.addColorStop(0, '#8d9a62'); g.addColorStop(1, '#4f5a33');
    rr(px + 2, py + 2, s - 4, s - 4, 7); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#1f2414'; ctx.lineWidth = 2; ctx.stroke();
    rr(px + 5, py + 5, s - 10, s * 0.3, 5); ctx.fillStyle = 'rgba(255,255,230,.18)'; ctx.fill();
    if (RES[r]) { ctx.font = Math.round(s * 0.5) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(RES[r], px + s / 2, py + s / 2 + 1); }
    ctx.restore();
  }
  function drawTank(px, py, s, col, turretUp, hp) {
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
  function drawSoldier(px, py, s, mine) {
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
    // 땅
    ctx.drawImage(ground, 0, BY);
    // 안개(적 진영 + 점령된 줄)
    var fogRows = EROWS + G.adv, scouting = t < G.scoutUntil, fr = front();
    ctx.save(); ctx.globalAlpha = scouting ? 0.55 : 1;
    ctx.drawImage(fogC, 0, ((t / 60) % S) | 0, COLS * S, fogRows * S, 0, EY, COLS * S, fogRows * S);
    ctx.restore();
    if (scouting) { ctx.fillStyle = 'rgba(120,255,140,' + (0.05 + 0.04 * Math.sin(t / 120)) + ')'; ctx.fillRect(0, EY, W, fogRows * S); }
    // 진격 경고
    var left = G.nextAdv - t;
    if (left < 6000 && !G.over) { ctx.fillStyle = 'rgba(255,40,40,' + (0.25 + 0.25 * Math.sin(t / 90)) + ')'; ctx.fillRect(0, BYY(G.adv), W, S); }
    ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(0, BYY(G.adv)); ctx.lineTo(W, BYY(G.adv)); ctx.stroke(); ctx.setLineDash([]);
    // 최전방 병사 (정찰 중에만 보임)
    if (scouting) G.soldiers.forEach(function (e) { drawSoldier(BX(e.x), BYY(G.adv - e.d), S); });
    // 블록
    for (var y = top(); y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x]) drawBlock(BX(x), BYY(y), S, G.board[y][x]);
    // 갈 수 있는 칸
    if (!G.drag && !G.tank.path.length && !G.over && !G.sweep) for (var k in G.reach) if (G.reach[k].d) { var c = k.split(','); ctx.fillStyle = 'rgba(160,255,160,.28)'; ctx.beginPath(); ctx.arc(BX(+c[0]) + S / 2, BYY(+c[1]) + S / 2, 4, 0, 7); ctx.fill(); }
    // 드래그 미리보기
    if (G.drag) {
      var d = G.drag, ok = d.gx != null && canPlace(d.p, d.gx, d.gy);
      if (d.gx != null) d.p.cells.forEach(function (c) { var x = d.gx + c.dx, y = d.gy + c.dy; if (x >= 0 && x < COLS && y >= 0 && y < ROWS) { ctx.fillStyle = ok ? 'rgba(255,230,120,.35)' : 'rgba(255,60,60,.35)'; ctx.fillRect(BX(x) + 3, BYY(y) + 3, S - 6, S - 6); } });
    }
    // 탱크
    drawTank(BX(G.tank.fx), BYY(G.tank.fy), S, ['#5f7a3a', '#9bbd55'], true, null);
    // 미사일
    G.missiles.forEach(function (m) { var px = BX(m.x) + S / 2, py = BYY(m.y) + S / 2; ctx.fillStyle = 'rgba(255,170,60,.5)'; ctx.beginPath(); ctx.arc(px, py + 18, 10, 0, 7); ctx.fill(); ctx.fillStyle = '#5ab4ff'; rr(px - 6, py - 16, 12, 30, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(px, py - 22); ctx.lineTo(px - 6, py - 12); ctx.lineTo(px + 6, py - 12); ctx.fill(); });
    // 효과
    G.fx.forEach(function (f) {
      var a = Math.max(0, t - f.at);
      if (f.t === 'cell') { var p = a / 700; ctx.fillStyle = 'rgba(255,220,120,' + (0.9 * (1 - p)) + ')'; ctx.fillRect(BX(f.x) + 4 + p * 26, BYY(f.y) + 4 + p * 26, (S - 8) * (1 - p), (S - 8) * (1 - p)); }
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
      ctx.font = '24px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(icon, b.x + 10, b.y + b.h / 2 + 1);
      ctx.font = '800 22px Orbitron'; ctx.fillStyle = on ? '#2a1a00' : '#aaa'; ctx.fillText('×' + n, b.x + 44, b.y + b.h / 2 + 1);
      ctx.font = '600 11px system-ui'; ctx.textAlign = 'right'; ctx.fillStyle = on ? '#5a3b00' : '#888'; ctx.fillText(label, b.x + b.w - 10, b.y + b.h / 2 + 1);
    }
    layoutBtns();
    var g3 = ctx.createLinearGradient(0, OY, 0, H); g3.addColorStop(0, '#1b1d16'); g3.addColorStop(1, '#0d0e0a'); ctx.fillStyle = g3; ctx.fillRect(0, OY, W, BOT);
    btn(BTN.scout, '🔭', G.scout, '정찰', G.scout > 0);
    btn(BTN.missile, '🚀', G.missile, '미사일', G.missile > 0);
    if (G.vs) btn(BTN.inf, '🪖', G.inf, '보병 끌기', G.inf > 0);
    // 연료
    var hy = HY, cy = hy + HUD / 2;
    ctx.font = '18px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('⛽', 8, cy);
    ctx.fillStyle = '#111'; rr(32, cy - 9, 130, 18, 5); ctx.fill();
    for (var i = 0; i < FUEL_MAX; i++) { ctx.fillStyle = i < G.fuel ? (i % 3 === 2 ? '#ff6a3d' : '#ffb13d') : '#2a2a2a'; ctx.fillRect(35 + i * 8.4, cy - 6, 6.5, 12); }
    ctx.font = '600 10px Orbitron'; ctx.fillStyle = '#cfd6bf'; ctx.fillText(G.fuel + '/' + FUEL_MAX, 168, cy);
    // 점수 / 상대
    ctx.textAlign = 'right';
    if (G.vs) { var o = (window.NET && NET.opp()) || {}; ctx.font = '600 10px Orbitron'; ctx.fillStyle = '#cfd6bf'; ctx.fillText('VS ' + (o.name || '?') + ' · 상대 밀린 줄 ' + (o.adv || 0) + ' · 보낸 보병 ' + G.sent, W - 8, cy); }
    else { ctx.font = '800 20px Orbitron'; ctx.fillStyle = '#ffd451'; ctx.fillText(String(G.score), W - 10, cy); ctx.font = '600 9px Orbitron'; ctx.fillStyle = '#cfd6bf'; ctx.fillText('BEST ' + best(), W - 10 - ctx.measureText(String(G.score)).width * 2.4 - 12, cy); }
    // 진격 타이머
    var left = Math.max(0, G.nextAdv - t), p = left / advMs(t);
    ctx.fillStyle = '#111'; ctx.fillRect(0, TOP - 6, W, 6); ctx.fillStyle = left < 6000 ? '#ff3b3b' : '#9bbd55'; ctx.fillRect(0, TOP - 6, W * p, 6);
    ctx.textAlign = 'center'; ctx.font = '600 11px Orbitron'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(G.sweep ? '⚠ 적군 돌파!' : (G.vs && !G.soldiers.length) ? '적 보병 없음 — 줄이 밀리지 않는다' : ('적 진격까지 ' + Math.ceil(left / 1000) + 's' + (G.vs ? '' : ' (' + (advMs(t) / 1000) + '초 간격)') + '  ·  적 병사 ' + G.soldiers.length), W / 2, 10); ctx.shadowBlur = 0;
  }
  function traySlot(i) { return { x: 20 + i * 150, y: TY + 8, w: 130, h: TRAY - 16 }; }
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
    if (inB(BTN.missile, p)) { if (G.missile <= 0) sfx('bad'); useMissile(); down = null; return; }
    if (G.vs && inB(BTN.inf, p)) { if (G.inf <= 0) { sfx('bad'); down = null; return; } G.dragInf = { px: p.x, py: p.y, col: null }; sfx('pick'); down = null; return; }
    for (var i = 0; i < 3; i++) if (G.tray[i] && inB(traySlot(i), p)) { G.drag = { i: i, p: G.tray[i], px: null }; dragTo(p); sfx('pick'); return; }
  });
  function dragTo(p) {
    var d = G.drag; d.px = p.x; d.py = p.y;
    d.ox = p.x - d.p.w * S / 2; d.oy = p.y - 80 - d.p.h * S;
    var gx = Math.round(d.ox / S), gy = Math.round((d.oy - BY) / S);
    d.gx = gx; d.gy = gy;
  }
  cv.addEventListener('pointermove', function (ev) { if (!G) return; if (G.drag) dragTo(pos(ev)); else if (G.dragInf) { var p = pos(ev); G.dragInf.px = p.x; G.dragInf.py = p.y; G.dragInf.col = (p.y < HY && p.x >= 0 && p.x < W) ? Math.floor(p.x / S) : null; } });
  cv.addEventListener('pointerup', function (ev) {
    if (!G || G.over) return;
    var p = pos(ev);
    if (G.dragInf) { var di = G.dragInf; G.dragInf = null; if (di.col != null) useInfantry(di.col); else sfx('bad'); return; }
    if (G.drag) {
      var d = G.drag; G.drag = null;
      if (d.gx != null && canPlace(d.p, d.gx, d.gy)) { G.tray[d.i] = null; sfx('place'); place(d.p, d.gx, d.gy); checkFit(); }
      else if (d.gx != null && d.gy >= 0 && d.gy < ROWS) sfx('bad');
      return;
    }
    if (down && Math.abs(p.x - down.x) < 12 && Math.abs(p.y - down.y) < 12 && p.y >= BY && p.y < BY + ROWS * S) moveTank(Math.floor(p.x / S), Math.floor((p.y - BY) / S));
    down = null;
  });
  cv.addEventListener('pointercancel', function () { if (G) { G.drag = null; G.dragInf = null; } down = null; });

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
  window.__tank = { get: function () { return G; }, BTN: function () { layoutBtns(); return BTN; }, newGame: newGame, addEnemyInf: addEnemyInf, useInfantry: useInfantry, forceOver: function (m) { G.over = true; G.overMsg = m || '테스트'; showOver(); }, place: place, canPlace: canPlace, moveTank: moveTank, useScout: useScout, useMissile: useMissile, makePiece: makePiece, checkFit: checkFit };
})();
