/* TANK RUMBLE — CPU 대전: 사람 대신 봇이 상대 자리에 앉는다. 대전 규칙을 그대로 쓰고 통신은 없다.
   봇도 자기 보드 7×9 에 블록을 놓아 자원을 얻고, 탱크(체력 3)를 움직이고, 정찰·미사일·보병을 쓴다.
   tank.js 의 함수들은 전역 G 를 쓰므로, 봇 차례에는 잠깐 G 를 봇 상태로 바꿔 끼운 뒤(withBot) 되돌린다. */
window.BOT = (function () {
  'use strict';
  var T = window.__tank, $ = function (id) { return document.getElementById(id); };
  var COLS = 7, ROWS = 9, SCOUT_MS = 5000;
  var bot = null, me = null, active = false, think = null, clashTimer = null, known = null, nextTick = 0, level = 'normal';
  var SPEED = { easy: 3400, normal: 2600, hard: 1600 };
  function withBot(fn) { var real = T.get(); T.set(bot); try { return fn(); } finally { T.set(real); } }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function now() { return performance.now(); }
  function mirror(x) { return COLS - 1 - x; }
  // ---------- 시작/종료 ----------
  function start() {
    stop(); active = true; window.NET = BOT;
    T.newGame(true); bot = T.get(); bot.bot = true; bot.name = 'CPU'; bot.fac = ['surge', 'gale', 'solar'][rnd(3)]; bot.ult = 0; bot.shield = 0;   // 먼저 만든 판이 봇, 두 번째가 나. 세력은 랜덤
    T.newGame(true); me = T.get();
    known = null; nextTick = now() + 30000;
    T.applyLine(0, 30000);
    syncToPlayer();
    think = setInterval(step, SPEED[level]);
    clashTimer = setInterval(clash, 30000);
  }
  function stop() { active = false; clearInterval(think); clearInterval(clashTimer); think = clashTimer = null; }
  function end(r, detail) { if (!active) return; stop(); window.REALNET.finish(r, detail); }
  // ---------- 내 쪽으로 보이는 봇 정보 ----------
  function syncToPlayer() {
    if (!active) return;
    T.setOpp({ tank: bot.tank.x + ',' + bot.tank.y, sol: bot.mySol.map(function (e) { return e.x + ':' + e.d; }).join(';') });
  }
  function opp() { if (!bot) return null; var empty = 0; for (var y = Math.max(0, bot.adv); y < ROWS; y++) for (var x = 0; x < COLS; x++) if (!bot.board[y][x]) empty++; return { name: 'CPU', empty: empty, hp: bot.tank.hp, over: bot.over, front: bot.mySol.filter(function (e) { return e.d === 1; }).length, inf: bot.mySol.length, tank: bot.tank.x + ',' + bot.tank.y, fac: bot.fac, ult: bot.ult, shield: bot.shield }; }
  // ---------- 봇 한 수 ----------
  function step() {
    if (!active || !me || me.over || bot.over) return;
    var seeAll = now() < bot.scoutUntil;                                              // 봇도 사람과 같은 눈: 내 최전방 보병만 보이고, 뒷줄은 자기 정찰기가 떠 있는 동안만
    bot.soldiers = me.mySol.filter(function (e) { return seeAll || e.d === 1; }).map(function (e) { return { x: mirror(e.x), d: e.d }; });
    withBot(function () {
      if (bot.sweep || bot.collapsing) return;
      placeBest();                                        // 블록 하나
      if (bot.sweep) return;
      // 정찰: 내 위치를 모르거나 오래됐으면
      if (bot.scout > 0 && (!known || now() - known.t > 12000) && Math.random() < 0.6) {
        bot.scout--;
        if (now() < me.stormMine) { setTimeout(function () { if (active) T.notice('상대 정찰기가 폭풍우에 추락!'); }, 0); }   // 내 서지 폭풍우 → 봇 정찰기 추락
        else { known = { x: me.tank.x, y: me.tank.y, t: now() }; bot.scoutUntil = now() + SCOUT_MS; setTimeout(function () { if (active) T.enemyScout(); }, 0); }
      }
      // 필살기: 게이지가 차면 상황 봐서 발동 (게일은 내 보병이 있을 때, 솔라는 체력이 깎였거나 내 위치가 알려졌을 때, 서지는 바로)
      if (bot.ult >= T.ULT_MAX) {
        var ok = bot.fac === 'gale' ? bot.soldiers.length >= 2 || Math.random() < 0.15 : bot.fac === 'solar' ? (bot.tank.hp < 3 || bot.shield === 0) : true;
        if (ok) T.useUlt();
      }
      // 미사일: 내 보병이 봇 앞에 있으면 그 줄, 아니면 알고 있는 내 탱크 줄
      if (bot.missile > 0 && now() >= bot.missileReady) {
        var target = null;
        var front = bot.soldiers.filter(function (e) { return e.d === 1; });     // 봇 눈에 보이는 내 보병(봇 좌표)
        if (front.length && Math.random() < 0.7) target = front[rnd(front.length)].x;
        else if (known && now() - known.t < 9000) target = mirror(known.x);
        if (target != null && goTo(target)) {
          bot.missile--; bot.missileReady = now() + 3000;
          setTimeout(function () { if (active) { T.revealOpp(bot.tank.x, bot.tank.y); T.incomingShot(bot.tank.x); } }, 0);   // 내 쪽 판정: 맨 앞 내 보병 → 없으면 내 탱크. 쏜 순간 1초 노출
        }
      }
      // 보병: 있으면 투입 (탱크 줄). 쌓이지 않게 가끔 열을 옮김
      if (bot.inf > 0 && Math.random() < 0.8) {
        var col = bot.tank.x; if (bot.mySol.some(function (e) { return e.x === col; }) && bot.fuel >= 1 && Math.random() < 0.5) { var nc = Math.max(0, Math.min(COLS - 1, col + (Math.random() < 0.5 ? -1 : 1))); if (goTo(nc)) col = bot.tank.x; }
        var d = 1; bot.mySol.forEach(function (e) { if (e.x === col) d = Math.max(d, e.d + 1); }); bot.mySol.push({ x: col, d: d }); bot.inf--;
      }
      // 탱크가 전선에 너무 가까우면 뒤로
      if (bot.tank.y < T.fns.top() + 2 && bot.fuel >= 2) { var k = bot.tank.x + ',' + (bot.tank.y + 2); if (bot.reach[k]) { bot.fuel -= bot.reach[k].d; bot.tank.y += 2; T.fns.calcReach(); } }
    });
    syncToPlayer();
  }
  function goTo(col) {                                     // 같은 열의 가장 가까운 칸으로 (연료 안에서). 이미 그 열이면 true
    if (bot.tank.x === col) return true;
    var best = null; for (var k in bot.reach) { var c = k.split(','); if (+c[0] === col && bot.reach[k].d > 0 && (!best || bot.reach[k].d < best.d)) best = { x: +c[0], y: +c[1], d: bot.reach[k].d }; }
    if (!best || best.d > bot.fuel) return false;
    bot.fuel -= best.d; bot.tank.x = best.x; bot.tank.y = best.y; bot.tank.fx = best.x; bot.tank.fy = best.y; T.fns.calcReach(); return true;
  }
  function placeBest() {                                   // 줄을 많이 지우는 자리 > 낮은 자리. 자원 블록이면 가산
    var F = T.fns, top = F.top(), bestS = -1e9, best = null, cands = [];
    for (var i = 0; i < 3; i++) { var p = bot.tray[i]; if (!p) continue;
      for (var gy = top; gy < ROWS; gy++) for (var gx = 0; gx < COLS; gx++) {
        if (!F.canPlace(p, gx, gy)) continue;
        var sc = gy * 3 + lines(p, gx, gy) * 120 + nearFull(p, gx, gy) * 10 + (level === 'easy' ? Math.random() * 60 : Math.random() * 6);
        p.cells.forEach(function (c) { if (c.r >= 2) sc += 6; });
        cands.push({ i: i, gx: gx, gy: gy, sc: sc });
      }
    }
    if (!cands.length) { botCollapse(); return; }
    cands.sort(function (a, c) { return c.sc - a.sc; });
    var topN = cands.slice(0, level === 'easy' ? 1 : 6);                 // 상위 후보만 한 수 앞까지 본다
    topN.forEach(function (c) {
      var p = bot.tray[c.i], saved = p.cells.map(function (q) { return bot.board[c.gy + q.dy][c.gx + q.dx]; });
      p.cells.forEach(function (q) { bot.board[c.gy + q.dy][c.gx + q.dx] = q.r; });
      var fut = 0, other = 0;
      for (var j = 0; j < 3; j++) { var p2 = bot.tray[j]; if (!p2 || j === c.i) continue; other++; var bestL = -1;
        for (var y2 = top; y2 < ROWS; y2++) for (var x2 = 0; x2 < COLS; x2++) if (F.canPlace(p2, x2, y2)) bestL = Math.max(bestL, lines(p2, x2, y2));
        fut += bestL < 0 ? -200 : bestL * 70; }                         // 다음 블록을 놓을 곳이 없으면 큰 감점
      p.cells.forEach(function (q, k) { bot.board[c.gy + q.dy][c.gx + q.dx] = saved[k]; });
      c.sc += fut;
    });
    topN.sort(function (a, c) { return c.sc - a.sc; }); best = topN[0];
    var p = bot.tray[best.i]; bot.tray[best.i] = null; F.place(p, best.gx, best.gy);
    var live = bot.tray.filter(Boolean); if (!live.length) bot.tray = [F.makePiece(), F.makePiece(), F.makePiece()];
    if (!bot.tray.filter(Boolean).some(F.anyFit)) botCollapse();
  }
  function nearFull(p, gx, gy) {                           // 놓은 뒤 6칸 이상 찬 줄 수(다음에 지우기 쉬움)
    var b = bot.board, top = T.fns.top(), n = 0, cells = {}; p.cells.forEach(function (c) { cells[(gx + c.dx) + ',' + (gy + c.dy)] = 1; });
    for (var y = top; y < ROWS; y++) { var k = 0; for (var x = 0; x < COLS; x++) if (b[y][x] || cells[x + ',' + y]) k++; if (k >= COLS - 1) n++; }
    for (var x2 = 0; x2 < COLS; x2++) { var k2 = 0; for (var y2 = top; y2 < ROWS; y2++) if (b[y2][x2] || cells[x2 + ',' + y2]) k2++; if (k2 >= ROWS - top - 1) n++; }
    return n;
  }
  function botCollapse() {                                 // CPU 보드 붕괴: 3초 경보 → 전선이 CPU 쪽으로 한 줄씩 두 번 → 블록 전부 비움 (사람 쪽과 같은 순서)
    if (bot.collapsing) return; bot.collapsing = true; var g = bot;
    setTimeout(function () { if (active && bot === g) T.notice('⚠ CPU 보드 붕괴 임박! (3초)'); }, 0);
    setTimeout(function () { if (active && bot === g) shiftLine(-1); }, 3000);
    setTimeout(function () { if (active && bot === g) shiftLine(-1); }, 3800);
    setTimeout(function () { if (!active || bot !== g) return;
      withBot(function () { var F = T.fns; for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) bot.board[y][x] = 0; bot.tray = [F.makePiece(), F.makePiece(), F.makePiece()]; F.calcReach(); });
      bot.collapsing = false; T.notice('💥 CPU 보드 붕괴! 전선 전진'); }, 4700);
  }
  function shiftLine(delta) {                              // 내 기준 delta(음수 = 내가 전진). 봇 쪽은 반대로
    if (!active) return;
    var L = Math.max(-8, Math.min(9, me.adv + delta)); T.applyLine(L, Math.max(1000, nextTick - now()));
    var badv = -L;
    withBot(function () { if (badv > bot.adv) { for (var y = Math.max(0, bot.adv); y < Math.min(ROWS, badv); y++) for (var x = 0; x < COLS; x++) bot.board[y][x] = 0; } bot.adv = badv; T.fns.calcReach(); });
    if (bot.tank.y < badv) { bot.over = true; end('win', 'CPU 탱크가 전선에 깔렸다'); return; }
    if (badv >= ROWS) { bot.over = true; end('win', 'CPU 가 전장을 잃었다'); return; }
    syncToPlayer();
  }
  function skill(k) {                                      // 봇이 쓴 필살기(useUlt 가 NET.skill 로 호출) → 내 쪽에 전달
    if (!active) return;
    if (k && bot === T.get()) { setTimeout(function () { if (active) T.skillIn(k); }, 0); return; }
    // 내가 쓴 필살기 → 봇 쪽 판정
    if (k === 'gale') { var v = bot.mySol.slice().sort(function (a, b) { return a.d - b.d; }).slice(0, 3); setTimeout(function () { if (!active) return; v.forEach(function (e) { var i = bot.mySol.indexOf(e); if (i >= 0) bot.mySol.splice(i, 1); }); while (bot.mySol.length && !bot.mySol.some(function (e) { return e.d === 1; })) bot.mySol.forEach(function (e) { e.d--; }); if (v.length) T.notice('적 보병 ' + v.length + '명 벼락 사망'); syncToPlayer(); }, 600); }
    else if (k === 'surge') { bot.stormOpp = now() + 20000; known = null; }
  }
  function collapsed() { if (!active) return; shiftLine(0); }   // 내 보드 붕괴: 전선은 내 쪽(tank.js)이 이미 두 줄 밀었으니 봇 쪽만 맞춘다
  function lines(p, gx, gy) {                              // 이 자리에 놓으면 지워지는 줄 수
    var b = bot.board, top = T.fns.top(), n = 0, cells = {}; p.cells.forEach(function (c) { cells[(gx + c.dx) + ',' + (gy + c.dy)] = 1; });
    for (var y = top; y < ROWS; y++) { var full = true; for (var x = 0; x < COLS; x++) if (!b[y][x] && !cells[x + ',' + y]) { full = false; break; } if (full) n++; }
    for (var x2 = 0; x2 < COLS; x2++) { var f2 = true; for (var y2 = top; y2 < ROWS; y2++) if (!b[y2][x2] && !cells[x2 + ',' + y2]) { f2 = false; break; } if (f2) n++; }
    return n;
  }
  // ---------- 전선 교전 (방장 역할) ----------
  function clash() {
    if (!active || !me || me.over || bot.over) return;
    var mine = me.mySol.filter(function (e) { return e.d === 1; }).length, theirs = bot.mySol.filter(function (e) { return e.d === 1; }).length, diff = mine - theirs;
    var delta = diff === 0 ? 0 : (Math.abs(diff) >= 3 ? 2 : 1) * (diff > 0 ? -1 : 1);        // 내 기준: 음수 = 내가 전진
    T.clash(mine, theirs, delta); nextTick = now() + 30000;
    setTimeout(function () { if (active) shiftLine(delta); }, 2600);
  }
  // ---------- 내가 쏜 것: 봇 쪽 판정 ----------
  function fired(x, y, shot) {
    if (!active) return; var mx = mirror(x);
    known = { x: x, y: y, t: now() };                                                 // 사람과 똑같이: 내가 쏘면 내 탱크 위치가 상대(봇)에게 노출된다
    setTimeout(function () {
      if (!active || bot.over) return;
      var v = null; bot.mySol.forEach(function (e) { if (e.x === mx && (!v || e.d < v.d)) v = e; });
      if (v) { bot.mySol.splice(bot.mySol.indexOf(v), 1); if (!bot.mySol.some(function (e) { return e.d === 1; })) bot.mySol.forEach(function (e) { e.d--; }); T.notice('적 보병 격파!'); }
      else if (bot.tank.x === mx && bot.shield > 0) { bot.shield--; T.notice(bot.shield ? 'CPU 태양 방패가 막았다 (1겹 남음)' : 'CPU 태양 방패가 깨졌다'); }
      else if (bot.tank.x === mx) { bot.tank.hp--; if (bot.tank.hp <= 0) { bot.over = true; end('win', 'CPU 탱크 격파'); return; } }
      syncToPlayer();
    }, 900);
  }
  function scouted() { /* 내 정찰: 봇 탱크는 setOpp 로 이미 보임 */ }
  function pub() { }
  function sendInf() { }
  function over(m) { if (!active) return; end('lose', m); }
  // 결과 화면의 [다시 대전] → CPU 다시
  $('againBtn').addEventListener('click', function () { if (window.NET === BOT) { window.REALNET.show('none'); start(); try { SFX.go(); SFX.ambientStart(); } catch (e) { } } });
  $('resLeave').addEventListener('click', function () { if (window.NET === BOT) stop(); });
  return { start: start, stop: stop, opp: opp, fired: fired, scouted: scouted, skill: skill, collapsed: collapsed, pub: pub, sendInf: sendInf, over: over, setLevel: function (l) { level = l; }, _bot: function () { return bot; }, _clash: clash, _step: step };
})();
