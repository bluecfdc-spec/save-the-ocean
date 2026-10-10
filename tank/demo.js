/* TANK RUMBLE — 게임 화면 안에서 손가락이 직접 움직이며 보여주는 튜토리얼 */
window.DEMO = (function () {
  'use strict';
  var T = window.__tank, G = null, hand = { x: 0, y: 0, on: false, press: 0 }, cap = '', sub = '', capAt = 0, step = 0, timers = [], running = false, L;
  function now() { return performance.now(); }
  function later(ms, fn) { var id = setTimeout(function () { if (running) fn(); }, ms); timers.push(id); return id; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function moveHand(x, y, ms, cb) {                                 // 손가락을 (x,y)로 ms 동안 부드럽게
    var sx = hand.x, sy = hand.y, t0 = now(); hand.on = true;
    (function f() { if (!running) return; var p = Math.min(1, (now() - t0) / ms); p = 1 - (1 - p) * (1 - p); hand.x = sx + (x - sx) * p; hand.y = sy + (y - sy) * p; if (p < 1) requestAnimationFrame(f); else if (cb) cb(); })();
  }
  function press(cb) { hand.press = now(); later(220, cb); }
  function cell(x, y) { return [T.BX(x) + L.S / 2, T.BYY(y) + L.S / 2]; }
  function btn(k) { var b = T.BTN()[k]; return [b.x + b.w / 2, b.y + b.h / 2]; }
  function say(s, s2) { cap = s; sub = s2 || ''; capAt = now(); }
  // ---------- 단계 ----------
  var STEPS = [
    function () {                                                   // 0. 목표(승리 조건)부터
      say('목표: 상대 탱크를 부숴라!', '미사일로 체력 3을 깎거나, 전선으로 덮치면 승리');
      G.oppTank = { x: 6 - G.tank.x, y: 3 }; G.reveal = { until: now() + 5200 }; G.soldiers = [];
      later(2600, function () { say('위는 상대, 아래는 나', '가운데 빨간 점선이 전선 — 보병으로 밀어낼 수 있어요'); T.applyLine(-1, 99000); later(1200, function () { T.applyLine(0, 99000); }); later(2600, next); });
    },
    function () {                                                   // 1. 블록 끌어 줄 채우기
      say('블록을 끌어 한 줄을 채워라', '줄이 터지면 아이템을 얻어요');
      for (var x = 0; x < 6; x++) G.board[8][x] = x === 2 ? 4 : x === 4 ? 3 : 1;      // 미사일·정찰 자원이 섞인 줄
      G.tray = [{ cells: [{ dx: 0, dy: 0, r: 5 }], w: 1, h: 1 }, T.makePiece(), T.makePiece()];
      var sl = T.traySlot(0); hand.x = sl.x + sl.w / 2; hand.y = sl.y + sl.h / 2 + 10; hand.on = true;
      later(600, function () {
        press(function () {
          var p = G.tray[0], tx = 6 * L.S + p.w * L.S / 2, ty = L.BY + 8 * L.S + 80 + p.h * L.S;
          G.drag = { i: 0, p: p, px: hand.x, py: hand.y, sx: hand.x, sy: hand.y, moved: true, ox: 0, oy: 0, gx: null, gy: null };
          (function track() { if (!running || !G.drag) return; var d = G.drag; d.px = hand.x; d.py = hand.y; d.ox = d.px - d.p.w * L.S / 2; d.oy = d.py - 80 - d.p.h * L.S; d.gx = Math.round(d.ox / L.S); d.gy = Math.round((d.oy - L.BY) / L.S); requestAnimationFrame(track); })();
          moveHand(tx, ty, 1400, function () { later(300, function () { G.drag = null; G.tray[0] = null; T.place(p, 6, 8); T.checkFit(); hand.on = false; say('줄 완성!', '미사일 🚀 정찰기 🔭 보병 🪖 획득'); later(2200, next); }); });
        });
      });
    },
    function () {                                                   // 2. 탱크 이동
      say('탱크는 움직인다', '탱크를 누르면 갈 수 있는 칸이 켜져요 → 칸을 누르면 이동');
      var c = cell(G.tank.x, G.tank.y); hand.x = c[0] + 40; hand.y = c[1] + 60; hand.on = true;
      moveHand(c[0], c[1], 700, function () { press(function () { G.sel = true; later(900, function () { var d = cell(G.tank.x, G.tank.y - 2); moveHand(d[0], d[1], 700, function () { press(function () { T.moveTank(G.tank.x, G.tank.y - 2); hand.on = false; later(1600, next); }); }); }); }); });
    },
    function () {                                                   // 3. 정찰
      say('정찰기로 상대를 찾아라', '5초 동안 숨은 상대 탱크·보병이 보여요');
      G.scout = Math.max(1, G.scout); G.oppTank = { x: 6 - G.tank.x, y: 3 }; G.soldiers = [{ x: 1, d: 1 }, { x: 1, d: 2 }, { x: 5, d: 2 }];
      var b = btn('scout'); hand.x = b[0]; hand.y = b[1] + 60; hand.on = true;
      moveHand(b[0], b[1], 600, function () { press(function () { T.useScout(); hand.on = false; later(1500, function () { say('상대 탱크 발견!', '내 탱크와 같은 세로줄에 있어요'); later(2200, next); }); }); });
    },
    function () {                                                   // 4. 미사일
      say('미사일 발사!', '내 탱크 세로줄로 날아가 맨 앞 적 보병, 없으면 상대 탱크를 맞혀요');
      G.missile = Math.max(1, G.missile); G.reveal = { until: now() + 6000 };
      var b = btn('missile'); hand.x = b[0]; hand.y = b[1] + 60; hand.on = true;
      moveHand(b[0], b[1], 600, function () { press(function () { T.useMissile(); hand.on = false; later(1100, function () { T.fx({ t: 'pop', text: '상대 탱크 명중! 체력 2', x: L.W / 2, y: 0, at: now(), big: true, col: '#9be37a' }); G.oppHpDemo = 2; later(1400, function () { say('쏘면 위치가 들킨다!', '쏘고 나서 바로 자리를 옮기세요'); later(2400, next); }); }); }); });
    },
    function () {                                                   // 5. 보병 + 교전
      say('보병을 투입하라', '탱크에서 뛰어나가 최전방에 서요');
      G.inf = Math.max(1, G.inf);
      var b = btn('inf'); hand.x = b[0]; hand.y = b[1] + 60; hand.on = true;
      moveHand(b[0], b[1], 600, function () { press(function () { T.useInfantry(); hand.on = false; later(1400, function () { say('30초마다 교전!', '최전방 보병이 많은 쪽이 전선을 밀어요'); G.soldiers = []; T.startClash(1, 0, -1); later(2600, function () { T.applyLine(-1, 99000); later(1800, next); }); }); }); });
    },
    function () {                                                   // 6. 필살기
      say('줄 10개 = 필살기', '문장이 빛나면 눌러서 발동!');
      G.ult = T.ULT_MAX; var u = T.ULTB(); if (!u) { later(500, next); return; }
      hand.x = u.x + u.w / 2; hand.y = u.y + u.h / 2 + 80; hand.on = true;
      moveHand(u.x + u.w / 2, u.y + u.w / 2, 700, function () { press(function () { T.useUlt(); hand.on = false; later(2600, function () { say('이제 시작!', '상대 탱크 체력 3을 깎거나, 전선으로 덮쳐라'); later(2600, finish); }); }); });
    }
  ];
  function next() { if (!running) return; clearTimers(); hand.on = false; G.drag = null; step++; if (step < STEPS.length) STEPS[step](); else finish(); }
  function finish() { running = false; clearTimers(); if (G) { G.demo = false; G.over = true; } localStorage.setItem('tank_tut', '1'); document.getElementById('ov').classList.remove('hidden'); }
  function start() {
    if (window.BOT) BOT.stop(); window.NET = window.REALNET;
    T.newGame(true); G = T.get(); G.demo = true; G.ult = 0; G.scout = 0; G.missile = 0; G.inf = 0; G.fuel = 6; L = T.L();
    document.getElementById('ov').classList.add('hidden'); running = true; step = 0; hand.on = false; STEPS[0]();
  }
  function tap() { if (!running) return; next(); }                   // 화면을 누르면 다음 단계
  function draw(t) {
    var ctx = L.ctx;
    // 자막 띠 (내 땅 위쪽): 큰 제목 + 작은 설명
    ctx.save(); var y = L.BY + 4, h = 78, ka = Math.min(1, (t - capAt) / 180), pop = 1 + 0.12 * (1 - ka);
    var gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(10,12,8,.9)'); gr.addColorStop(1, 'rgba(10,12,8,.78)'); ctx.fillStyle = gr; ctx.fillRect(0, y, L.W, h);
    ctx.fillStyle = '#ffd451'; ctx.fillRect(0, y, L.W, 3); ctx.fillRect(0, y + h - 3, L.W, 3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(L.W / 2, y + 28); ctx.scale(pop, pop); ctx.globalAlpha = ka;
    var fs = 26; ctx.font = '800 ' + fs + 'px Orbitron, system-ui'; while (ctx.measureText(cap).width > L.W - 16 && fs > 15) { fs -= 1; ctx.font = '800 ' + fs + 'px Orbitron, system-ui'; }
    ctx.lineWidth = 6; ctx.strokeStyle = '#2a1a00'; ctx.strokeText(cap, 0, 0); ctx.fillStyle = '#ffd451'; ctx.shadowColor = '#ff9a1f'; ctx.shadowBlur = 14; ctx.fillText(cap, 0, 0); ctx.restore();
    ctx.globalAlpha = ka; var fs2 = 15; ctx.font = '700 ' + fs2 + 'px system-ui'; while (ctx.measureText(sub).width > L.W - 16 && fs2 > 10) { fs2 -= 1; ctx.font = '700 ' + fs2 + 'px system-ui'; }
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(sub, L.W / 2, y + 58); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.font = '600 10px system-ui'; ctx.fillStyle = '#8a9477'; ctx.fillText('화면을 누르면 다음 ▶', L.W / 2, y + h + 10);
    ctx.font = '800 11px Orbitron, system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffd451'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('HOW TO PLAY  ' + (step + 1) + ' / ' + STEPS.length, 8, y - 12);
    ctx.restore();
    // 손가락
    if (hand.on) { var pr = Math.max(0, 1 - (t - hand.press) / 220), sc = 1 - 0.25 * pr; ctx.save(); ctx.translate(hand.x, hand.y);
      if (pr > 0) { ctx.strokeStyle = 'rgba(255,212,81,' + pr + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 14 + (1 - pr) * 22, 0, 7); ctx.stroke(); }
      ctx.scale(sc, sc); ctx.fillStyle = 'rgba(255,212,81,.35)'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1a1200'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill(); ctx.stroke();   // 터치 점
      ctx.font = '34px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.shadowColor = '#000'; ctx.shadowBlur = 8; ctx.fillText('👆', 0, 2); ctx.restore(); }
  }
  return { start: start, tap: tap, draw: draw, running: function () { return running; } };
})();
