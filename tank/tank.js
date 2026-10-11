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
  var W = COLS * S, TOP = 22, HUD = 26, TRAY = 118, BBAR = 48, FS = 44;   // FS: 위쪽(적진) 한 줄 높이       // 위: 진격 타이머 띠. 보드 아래: 연료·점수 한 줄(HUD) → 블록 받침(TRAY) → 맨 바닥 넓고 얇은 버튼 띠(BBAR)
  var EY, BY, HY, TY, OY, H, ADV_MIN, SLOTS = 13, PW = 60, WT, OFFY = 0, OFFX = 0, HL = 0;   // PW: 오른쪽 정보 패널 폭(화면 남는 만큼 늘어남), WT: 전체 폭, OFFY: 세로 남는 공간을 위아래로 나눈 여백            // SLOTS: 대전 사거리 칸 수 = 안개 4 + 상대 진영 9
  var VS_MODE = false;
  function layout(vs) {
    VS_MODE = !!vs;
    if (vs) { COLS = 9; S = 56; FS = 40; EROWS = 9; TOP = 44; HUD = 48; TRAY = 104; BBAR = 64; } else { COLS = 7; S = 68; FS = 44; EROWS = 4; TOP = 22; HUD = 26; TRAY = 110; BBAR = 64; }   // 대전: 9×9 (폰 비율에 맞춰 가로를 넓힘)
    relayout(); }
  function relayout() { W = COLS * S; WT = W + PW; groundImg = null; EY = TOP; BY = TOP + EROWS * FS; HY = BY + ROWS * S; TY = HY + HUD; OY = TY + TRAY; H = OY + BBAR; ADV_MIN = -(EROWS - 1); }
  layout(false);
  var FUEL_PER = 3, FUEL_MAX = 15, SCOUT_MS = 5000, ADV_MS = 30000, ADV_STEP = 5000, ADV_FLOOR = 20000, ADV_EVERY = 180000, HP_MAX = 3;
  function advMs(t) { return G.vs ? ADV_MS : Math.max(ADV_FLOOR, ADV_MS - ADV_STEP * Math.floor((t - G.start) / ADV_EVERY)); }   // 3분마다 5초씩 빨라짐, 최저 20초
  var SCOUT_MAX = 5, MISSILE_MAX = 5, INF_MAX = 5, FLIGHT_MS = 1500;                   // 대전 포탄 비행 시간(이 동안 양쪽 정지)
  var ULT_MAX = 10, STORM_MS = 20000, SHIELD_HP = 1, SOLAR_MS = 5000, BOLTS = 3;                       // 필살기: 줄 10개 = 게이지 100%(넘침 없음)
  var FAC = {
    surge: { name: '서지', skill: '폭풍우', col: '#4fd8ff', img: 'f_surge', desc: '내 땅 전체에 폭풍우 20초. 상대 정찰기는 뜨자마자 추락, 상대가 아는 내 마지막 위치도 지워짐' },
    gale:  { name: '게일', skill: '낙뢰',   col: '#c58bff', img: 'f_gale',  desc: '적 보병 3명에게 벼락(최전방부터)' },
    solar: { name: '솔라', skill: '태양 방패', col: '#ffd451', img: 'f_solar', desc: '5초 동안 내 전장에 햇살 — 탱크 방패 1번, 모든 보병에 방패' }
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
    // 보드가 화면 폭의 78%를 차지하도록 배율을 정하고, 세로가 모자라면 상대 진영 줄 높이(FS)를 22~40 사이에서 줄인다. 그래도 모자라면 배율을 낮춘다(패널이 넓어짐)
    var fixed = TOP + ROWS * S + HUD + TRAY + BBAR;
    scale = iw * (VS_MODE ? 0.76 : 0.82) / W;   /* 대전: 오른쪽 패널에 24% */
    if (VS_MODE) {                                               /* 세로가 남으면 검은 띠로 버리지 않고 적진·받침·버튼·연료창에 나눠 준다 */
      TOP = 44; HUD = 48; TRAY = 104; BBAR = 64; FS = 20; relayout();
      var spare = ih / scale - H;
      if (spare > 0) { var add = Math.min(spare, 8 * EROWS); FS += add / EROWS; spare -= add; }           /* 적진 줄 20→28 */
      if (spare > 0) { var a2 = Math.min(spare, 70); TRAY += a2; spare -= a2; }                            /* 블록 받침 최대 174 */
      if (spare > 0) { var a3 = Math.min(spare, 30); BBAR += a3; spare -= a3; }                            /* 버튼 띠 최대 94 */
      if (spare > 0) { var a4 = Math.min(spare, 20); HUD += a4; spare -= a4; }                             /* 연료창 최대 68 */
      if (spare > 0) { var a5 = Math.min(spare, 20); TOP += a5; spare -= a5; }                             /* 타이머 띠 최대 64 */
      if (spare > 0) { var a6 = Math.min(spare, 12 * EROWS); FS += a6 / EROWS; spare -= a6; }              /* 그래도 남으면 적진 최대 40 */
      if (spare > 0) { var a7 = Math.min(spare, 40); TRAY += a7; spare -= a7; } if (spare > 0) { FS += spare / EROWS; spare = 0; }   /* 마지막까지 남으면 적진이 가져감 */                                /* 끝까지 남는 건 받침·연료창이 가져감 → 검은 띠 없음 */
      relayout();
    }
    if (H * scale > ih) scale = ih / H;
    scaleY = scale;
    PW = iw / scale - W; var pwMax = W * 0.45; OFFX = 0; if (PW > pwMax) { OFFX = (PW - pwMax) / 2; PW = pwMax; }   /* PC 넓은 창: 패널은 보드 폭의 45%까지만, 나머지는 좌우 여백 */
    WT = W + PW; HL = ih / scale; OFFY = Math.max(0, (HL - H) / 2);
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
  // ---------- 새 그림(v2, 2026-10-11 GPT 시트) ----------
  var V2 = {}, V2_PNG = ['b_bonus', 'b_fuel', 'b_inf', 'b_missile', 'b_plain', 'b_scout', 'ban_gold', 'ban_green', 'ban_red', 'bolt1', 'bolt2', 'bolt3', 'bolt_flash', 'btn_inf_off', 'btn_inf_on', 'btn_guide_on', 'btn_guide_off', 'btn_reroll_on', 'btn_reroll_off', 'btn_missile_off', 'btn_missile_on', 'btn_scout_off', 'btn_scout_on', 'cr_crack1', 'cr_crack2', 'cr_debris', 'cr_vignette', 'd_barrel', 'd_crater', 'd_pole', 'd_sandbag', 'd_trench1', 'd_trench2', 'd_trench3', 'd_wire1', 'd_wire2', 'e_gale', 'e_gale_dead', 'e_gale_hit', 'e_solar', 'e_solar_dead', 'e_solar_hit', 'e_surge', 'e_surge_dead', 'e_surge_hit', 'em_down', 'em_top', 'em_up', 'f_gale', 'f_gale_glow', 'f_solar', 'f_solar_glow', 'f_surge', 'f_surge_glow', 'fx_dust1', 'fx_dust2', 'fx_flash1', 'fx_flash2', 'fx_smoke', 'fx_smoke2', 'icon_1024', 'icon_180', 'icon_64', 'm_down', 'm_top', 'm_up', 'o_bad', 'o_dot', 'o_ok', 'o_sel', 'p_gale', 'p_gale_crash', 'p_solar', 'p_solar_crash', 'p_surge', 'p_surge_crash', 's_gale_dead', 's_gale_run1', 's_gale_run2', 's_gale_stand', 's_solar_dead', 's_solar_run1', 's_solar_run2', 's_solar_stand', 's_surge_dead', 's_surge_run1', 's_surge_run2', 's_surge_stand', 's_surge_front', 's_gale_front', 's_solar_front', 's_surge_frun1', 's_gale_frun1', 's_solar_frun1', 's_surge_frun2', 's_gale_frun2', 's_solar_frun2', 's_surge_fdead', 's_gale_fdead', 's_solar_fdead', 'sh_1', 'sh_2', 'sh_break', 'st_cloud', 'st_rain', 'st_splash', 'st_vortex', 't_gale', 't_gale_dead', 't_gale_hit', 't_solar', 't_solar_dead', 't_solar_hit', 't_surge', 't_surge_dead', 't_surge_hit', 'ui_card', 'ui_divider', 'ui_fuel', 'ui_hp_off', 'ui_hp_on', 'ui_score', 'ui_vgauge', 'x_b1', 'x_b2', 'x_b3', 'x_b4', 'x_b5', 'x_b6', 'x_b7', 'x_b8', 'x_s1', 'x_s2', 'x_s3', 'x_s4', 'x_s5', 'x_s6', 'x_s7', 'x_s8'], V2_JPG = ['bg_enemy', 'bg_mine', 'keyart', 'res_gale_lose', 'res_gale_win', 'res_solar_lose', 'res_solar_win', 'res_surge_lose', 'res_surge_win', 'solar_rays', 'tile_g00', 'tile_g01', 'tile_g02', 'tile_g03', 'tile_g04', 'tile_g05', 'tile_g06', 'tile_g07', 'tile_g08', 'tile_g09', 'tile_g10', 'tile_g11', 'tile_g12', 'tile_g13', 'tile_g14', 'tile_g15', 'tile_r00', 'tile_r01', 'tile_r02', 'tile_r03', 'tile_r04', 'tile_r05', 'tile_r06', 'tile_r07', 'tile_r08', 'tile_r09', 'tile_r10', 'tile_r11', 'tile_r12', 'tile_r13', 'tile_r14', 'tile_r15', 'title'], v2n = 0;
  V2_PNG.forEach(function (n) { var i = new Image(); i.onload = function () { V2[n] = i; v2n++; applySkin(); }; i.src = 'assets/v2/' + n + '.png?v=2'; });
  V2_JPG.forEach(function (n) { var i = new Image(); i.onload = function () { V2[n] = i; }; i.src = 'assets/v2/' + n + '.jpg?v=1'; });
  function oppFacKey() { var o = (window.NET && NET.opp && NET.opp()) || {}; return FAC[o.fac] ? o.fac : (G && G.oppFacGuess) || 'gale'; }
  function applySkin() {                                   // 세력에 맞는 그림을 옛 이름(IMG.u_*)에 꽂아 넣는다 — 그리기 코드는 그대로
    if (!G) return; var f = G.fac || 'solar', e = oppFacKey();
    function dmg(pre, hp) { return V2[pre + (hp <= 1 ? '_dead' : hp === 2 ? '_hit' : '')] || V2[pre]; }   /* 맞을 때마다 탱크가 점점 부서짐 */
    if (V2['t_' + f]) IMG.u_tank_p = dmg('t_' + f, G.tank ? G.tank.hp : HP_MAX);
    var oo = (window.NET && NET.opp && NET.opp()) || {}; if (V2['e_' + e]) IMG.u_tank_e = dmg('e_' + e, oo.hp == null ? HP_MAX : oo.hp);
    if (V2['s_' + f + '_stand']) IMG.u_soldier_p = V2['s_' + f + '_stand'];
    if (V2['s_' + e + '_frun1']) IMG.u_soldier_e = V2['s_' + e + '_frun1']; else if (V2['s_' + e + '_front']) IMG.u_soldier_e = V2['s_' + e + '_front']; else if (V2['s_' + e + '_stand']) IMG.u_soldier_e = V2['s_' + e + '_stand'];   /* 26번(정면) 시트가 오면 적 보병은 나를 바라봄 */
    if (V2['p_' + f]) IMG.u_plane = V2['p_' + f];
    if (V2['p_' + e]) { if (IMG.u_plane_e !== V2['p_' + e]) planeE = null; IMG.u_plane_e = V2['p_' + e]; }
    ['b_plain', 'b_fuel', 'b_scout', 'b_missile', 'b_inf'].forEach(function (k) { if (V2[k]) IMG[k] = V2[k]; });
    ['f_surge', 'f_gale', 'f_solar'].forEach(function (k) { if (V2[k]) IMG[k] = V2[k]; if (V2[k + '_glow']) IMG[k + '_glow'] = V2[k + '_glow']; });
    if (V2.m_up) { IMG.m_big = V2.m_up; IMG.m_top = V2.m_top; IMG.m_down = V2.m_down; IMG.em_up = V2.em_up; IMG.em_top = V2.em_top; IMG.em_down = V2.em_down; }
  }
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
      tank: { x: Math.floor(COLS / 2), y: 6, hp: HP_MAX, path: [], moveAt: 0, fx: Math.floor(COLS / 2), fy: 6 }, combo: 0, shake: 0, shakeUntil: 0, aim: null, incoming: [], sweepUnits: null,
      soldiers: [], mySol: [], oppTank: null, clash: null, missileReady: 0, enemyScoutUntil: 0,
      fuel: 2 * FUEL_PER, scout: 1, missile: 0, inf: 0,
      scoutUntil: 0, nextAdv: t + ADV_MS, start: t,
      missiles: [], fx: [],
      tray: [makePiece(), makePiece(), makePiece()], drag: null, dragInf: null, reach: null, sweep: false, reveal: null, reroll: 3, freezeUntil: 0, lastT: t,
      fac: (window.TANK_FAC || localStorage.getItem('tank_fac') || 'solar'), ult: 0, /* 필살기 게이지는 0에서 시작 — 줄 10개 지우면 가득 */ shield: 0, stormMine: 0, stormOpp: 0, bolts: [], oppFac: null, oppUlt: 0, oppShield: 0
    };
    for (var y = 0; y < ROWS; y++) { G.board.push([]); for (var x = 0; x < COLS; x++) G.board[y].push(0); }
    groundImg = null;
    G.tray = [makePiece(), makePiece(), makePiece()];      // 모드가 정해진 뒤 다시 뽑음(대전이면 보병 자원 포함)
    if (!G.vs) spawnFront();
    calcReach(); applySkin(); if (G.vs) G.intro = { at: t };   /* 매 판 시작: 이기는 방법 안내 */
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
      addScore(pts, W / 2, BY + (top() + ROWS) / 2 * S, mult > 1 ? 'COMBO ×' + mult : (n > 1 ? n + '줄!' : '')); G.lines += n;
      if (G.vs && G.ult < ULT_MAX) { G.ult = Math.min(ULT_MAX, G.ult + n); if (G.ult >= ULT_MAX) { G.fx.push({ t: 'pop', text: fac().name + ' 필살기 준비 완료!', x: W / 2, y: 0, at: now(), big: true, col: fac().col }); sfx('ultReady'); } }
      G.shake = 4 + n * 3 + mult * 2; G.shakeUntil = now() + 250 + n * 80;
      G.fuel = Math.min(FUEL_MAX, G.fuel + got[2] * FUEL_PER);
      G.scout = Math.min(SCOUT_MAX, G.scout + got[3]);
      G.missile = Math.min(MISSILE_MAX, G.missile + got[4]);
      G.inf = Math.min(INF_MAX, G.inf + got[5]);
      var msg = '' + (got[2] ? '  ⛽' + got[2] : '') + (got[3] ? '  🔭' + got[3] : '') + (got[4] ? '  🚀' + got[4] : '') + (got[5] ? '  🪖' + got[5] : '');
      if (msg) G.fx.push({ t: 'pop', text: msg.trim(), x: W / 2, y: BY + (top() + ROWS) / 2 * S + 34, at: now(), big: false });
      G.fx.push({ t: 'flash', at: now(), rows: rows, cols: cols });
      sfx('clear', n + mult - 1); [2, 3, 4, 5].forEach(function (k, i) { if (got[k]) setTimeout(function () { sfx('gain', k); }, 350 + i * 120); });
    } else {
      G.combo = 0;
    }
    calcReach();
  }
  function resetRound() {                                   // CPU 무한 모드: 다음 전장. 점수·세력·탱크 체력·교체 횟수는 그대로, 전장·보병·블록은 새로
    var t = now();
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) G.board[y][x] = 0;
    G.adv = 0; G.nextAdv = t + ADV_MS; G.soldiers = []; G.mySol = []; G.missiles = []; G.incoming = []; G.bolts = []; G.fx = []; G.msgQ = []; G.msg = null; G.craters = [];
    G.tray = [makePiece(), makePiece(), makePiece()]; G.combo = 0; G.sel = false; G.drag = null; G.dragInf = null; G.aim = null; G.freezeUntil = 0; G.lastSeen = null; G.oppTank = null; G.reveal = null;
    G.scoutUntil = 0; G.enemyScoutUntil = 0; G.stormMine = 0; G.stormOpp = 0; G.shield = 0; G.solarUntil = 0; G.oppShield = 0; G.oppSolarUntil = 0; G.collapsing = null; G.sweep = false; G.crash = null; G.clash = null; G.shotWait = null; G.lockUntil = 0;
    G.fuel = Math.max(G.fuel, 2 * FUEL_PER); G.tank.x = Math.floor(COLS / 2); G.tank.y = 6; G.tank.fx = G.tank.x; G.tank.fy = G.tank.y; G.tank.path = []; G.tank.ang = 0; G.missileReady = 0;
    calcReach(); applySkin();
  }
  // ---------- 플레이 중 가이드: 상황이 생기면 그 자리를 가리키는 말풍선 (게임은 안 멈춤, 한 번 본 건 다시 안 나옴) ----------
  function guideOn() { try { return localStorage.getItem('tank_guide') !== '0'; } catch (e) { return true; } }
  function setGuide(on) { try { localStorage.setItem('tank_guide', on ? '1' : '0'); } catch (e) { } if (!on && G) { G.hint = null; G.hintQ = []; } }
  function muted() { try { return localStorage.getItem('tank_mute') === '1'; } catch (e) { return false; } }
  function setMute(on) { try { localStorage.setItem('tank_mute', on ? '1' : '0'); } catch (e) { } try { SFX.mute(on); } catch (e) { } }
  try { if (muted()) setTimeout(function () { try { SFX.mute(true); } catch (e) { } }, 0); } catch (e) { }
  function hint(id, text, pt, cool) {                        // pt: 가리킬 곳 { x, y }. cool: 다시 보여줄 간격(ms) — 없으면 한 판에 한 번
    if (!G || !G.vs || G.demo || G.bot || !guideOn()) return; G.hintLast = G.hintLast || {}; var last = G.hintLast[id];
    if (last != null && (cool == null || now() - last < cool)) return;
    G.hintQ = G.hintQ || []; if (G.hintQ.some(function (h) { return h.id === id; }) || (G.hint && G.hint.id === id)) return;
    G.hintQ.push({ id: id, text: text, pt: pt }); G.hintLast[id] = now();
  }
  function guideTick(t) {
    if (G.intro && t - G.intro.at > 5200) G.intro = null;
    return;   /* 상세 말풍선 가이드는 쓰지 않음 — 시작 안내(intro)만 */
    if (!G.vs || G.demo || G.bot || !guideOn()) return;
    var el = t - G.start; layoutBtns();
    if (el > 900) hint('blocks', '블록을 끌어다 놓아 줄을 채우면 아이템이 나와요', function () { return { x: W / 2, y: TY + 10 }; });
    if (el > 6000) hint('move', '초록 칸을 누르면 이동해요. 탱크를 누르면 칸마다 드는 기름이 보여요', function () { return { x: BX(G.tank.fx) + S / 2, y: BYY(G.tank.fy) }; });
    if (el > 11000) hint('front', '최전방 보병이 많은 쪽이 30초마다 전선을 밀어요', function () { return { x: W / 2, y: BYY(G.adv) }; });
    if (el > 16000 && G.scout > 0) hint('scout', '정찰기를 띄우면 안개가 걷혀 적 탱크가 보여요', function () { return { x: BTN.scout.x + BTN.scout.w / 2, y: BTN.scout.y }; });
    if (G.inf > 0) hint('inf', '보병 투입! 내 탱크가 있는 줄 맨 앞으로 나가요', function () { return { x: BTN.inf.x + BTN.inf.w / 2, y: BTN.inf.y }; }, 30000);
    if (G.missile > 0) hint('missile', '미사일은 내 탱크가 있는 세로줄로 날아가요 — 적 탱크와 같은 줄에서 쏘세요', function () { return { x: BTN.missile.x + BTN.missile.w / 2, y: BTN.missile.y }; }, 30000);
    if (G.ult >= ULT_MAX && ULTB) hint('ult', '필살기 준비! 문장을 누르세요', function () { return { x: ULTB.x + ULTB.w / 2, y: ULTB.y }; }, 30000);
    if (G.fuel <= 0) hint('fuel', '기름이 없어요 — ⛽ 블록이 든 줄을 지우면 채워져요', function () { return { x: 60, y: HY + 4 }; }, 30000);
    if (el > 45000) hint('reroll', '블록이 마음에 안 들면 교체 (한 판에 3번)', function () { return REROLLB ? { x: REROLLB.x + REROLLB.w / 2, y: REROLLB.y } : { x: W, y: TY }; });
    if (G.hint && t - G.hint.at > 4200) G.hint = null;
    if (!G.hint && G.hintQ && G.hintQ.length && !G.roundFx) { G.hint = G.hintQ.shift(); G.hint.at = t; G.hintLast[G.hint.id] = t; }
  }
  var HINTB = null, TGL = null, INTROB = null;
  function showIntro() { if (G && G.vs) G.intro = { at: now() }; }
  function drawIntro(t) {                                       /* 게임 시작마다: 이기는 두 가지 방법 (5초, 누르면 닫힘) */
    INTROB = null; var it = G.intro; if (!it) return; var a = t - it.at, al = Math.min(1, a / 250) * Math.min(1, (5200 - a) / 400); if (al <= 0) return;
    var y0 = EY, h0 = HY - EY; ctx.save(); ctx.globalAlpha = al * 0.78; ctx.fillStyle = '#05070a'; ctx.fillRect(0, y0, W, h0); ctx.globalAlpha = al;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; var cy = y0 + h0 * 0.22;
    ctx.font = '800 26px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText('이기는 방법 두 가지', W / 2, cy); ctx.fillStyle = '#ffd451'; ctx.fillText('이기는 방법 두 가지', W / 2, cy);
    function card(n, y, img, l1, l2, col) {
      var cw = W - 28, ch = 104, cx = 14, cy2 = y; ctx.fillStyle = 'rgba(20,24,16,.92)'; rr(cx, cy2, cw, ch, 14); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; rr(cx, cy2, cw, ch, 14); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx + 30, cy2 + ch / 2, 20, 0, 7); ctx.fill(); ctx.fillStyle = '#1a1000'; ctx.font = '800 24px Black Han Sans, system-ui'; ctx.fillText(n, cx + 30, cy2 + ch / 2 + 1);
      if (img) fitImg(img, cx + 86, cy2 + ch / 2, 62, 74, 1, 0);
      ctx.textAlign = 'left'; ctx.font = '800 20px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(l1, cx + 128, cy2 + ch * 0.36); ctx.fillStyle = '#fff'; ctx.fillText(l1, cx + 128, cy2 + ch * 0.36);
      ctx.font = '700 15px Do Hyeon, system-ui'; ctx.lineWidth = 3; ctx.strokeText(l2, cx + 128, cy2 + ch * 0.68); ctx.fillStyle = '#d8e8c8'; ctx.fillText(l2, cx + 128, cy2 + ch * 0.68); ctx.textAlign = 'center';
    }
    var pop = function (d) { return Math.min(1, Math.max(0, (a - d) / 300)); };
    ctx.save(); ctx.globalAlpha = al * pop(250); card('1', y0 + h0 * 0.34, IMG.u_soldier_p, '최전방에 보병을 더 많이!', '30초마다 교전 — 많은 쪽이 전선을 밀어 적진 점령', '#9be37a'); ctx.restore();
    ctx.save(); ctx.globalAlpha = al * pop(900); card('2', y0 + h0 * 0.34 + 120, IMG.u_plane, '정찰해서 적 탱크 격파!', '정찰기로 위치를 찾고, 같은 줄에서 미사일 3발', '#ffb13d'); ctx.restore();
    ctx.font = '600 13px Do Hyeon, system-ui'; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText('화면을 누르면 시작', W / 2, y0 + h0 * 0.34 + 250);
    ctx.restore(); INTROB = { x: 0, y: y0, w: W, h: h0 };
  }
  function drawHint(t) {
    HINTB = null; var h = G.hint; if (!h) return; var a = t - h.at, al = Math.min(1, a / 200) * Math.min(1, (4200 - a) / 300); if (al <= 0) return;
    var p = h.pt(); ctx.save(); ctx.globalAlpha = al;
    var pr = 10 + 6 * Math.sin(t / 140); ctx.strokeStyle = '#ffd451'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, pr + 8, 0, 7); ctx.stroke();   /* 가리키는 곳 반짝 링 */
    ctx.font = '700 15px Do Hyeon, system-ui'; var maxW = Math.min(W * 0.86, 320), words = h.text.split(' '), lines = [], cur = '';
    words.forEach(function (w) { var tr = cur ? cur + ' ' + w : w; if (ctx.measureText(tr).width > maxW - 24 && cur) { lines.push(cur); cur = w; } else cur = tr; }); if (cur) lines.push(cur);
    var bw = Math.min(maxW, Math.max.apply(null, lines.map(function (l) { return ctx.measureText(l).width; })) + 28), bh = lines.length * 20 + 18;
    var above = p.y > EY + bh + 40, by = above ? p.y - 22 - bh - 12 : p.y + 22 + 12, bx = Math.max(6, Math.min(W + PW - bw - 6, p.x - bw / 2));
    var bob = Math.sin(t / 220) * 2; by += bob;
    ctx.fillStyle = 'rgba(14,16,10,.92)'; rr(bx, by, bw, bh, 10); ctx.fill(); ctx.strokeStyle = '#ffd451'; ctx.lineWidth = 2; rr(bx, by, bw, bh, 10); ctx.stroke();
    ctx.beginPath(); var ax = Math.max(bx + 14, Math.min(bx + bw - 14, p.x)); if (above) { ctx.moveTo(ax - 9, by + bh); ctx.lineTo(ax, p.y - 14); ctx.lineTo(ax + 9, by + bh); } else { ctx.moveTo(ax - 9, by); ctx.lineTo(ax, p.y + 14); ctx.lineTo(ax + 9, by); } ctx.closePath(); ctx.fillStyle = '#ffd451'; ctx.fill();
    ctx.fillStyle = '#fff3c0'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; lines.forEach(function (l, i) { ctx.fillText(l, bx + 14, by + 10 + i * 20); });
    ctx.font = '600 11px Do Hyeon, system-ui'; ctx.fillStyle = 'rgba(255,233,160,.6)'; ctx.textAlign = 'right'; ctx.fillText('💡 가이드 · 누르면 닫힘 (위 💡로 끄기)', bx + bw - 8, by + bh - 14);
    ctx.restore(); HINTB = { x: bx, y: by, w: bw, h: bh };
  }
  function addScore(n, x, y, label) {                      // 점수 + 연출: 그 자리에서 숫자가 튀어 오른 뒤 점수판으로 날아가 꽂힌다
    if (!n) return; G.score += n; G.fx.push({ t: 'score', n: n, x: x, y: y, label: label || '', at: now(), life: 1000 });
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
    G.missiles.push({ x: tx, y: G.tank.y, y0: G.tank.y, y1: ty0, target: best, pred: G.vs && !!best, at: now(), fl: G.vs ? FLIGHT_MS : 1000 }); sfx('launch');
    if (G.vs) { G.freezeUntil = now() + FLIGHT_MS; G.sel = false; G.drag = null; }   /* 포격 중엔 양쪽 다 정지 */
    if (G.vs && window.NET) { NET.fired(tx, G.tank.y, true);              // 대전: 명중 판정은 맞는 쪽(병사·탱크 주인)이 한다
      var o0 = NET.opp() || {}; G.shotWait = { at: now(), until: now() + 1000 + 2500, hp: o0.hp == null ? HP_MAX : o0.hp, sol: G.soldiers.length, x: tx, scored: !!best }; }   // 결과(상대 체력·보병 수 변화)를 기다렸다가 명중/빗나감 표시
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
    else if (G.fac === 'solar') { G.shield = SHIELD_HP; G.solarUntil = t + SOLAR_MS; G.mySol.forEach(function (e) { e.sh = 1; }); }
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
      setTimeout(function () { if (G.over) return; vict = vict.filter(function (e) { if (e.sh) { e.sh = 0; G.fx.push({ t: 'shieldHit', px: BX(e.x) + S / 2, py: BYY(myRow(e.d)) + S * 0.6, sz: 0.7, at: now() }); return false; } return true; }); vict.forEach(function (e) { var i = G.mySol.indexOf(e); if (i >= 0) { G.fx.push({ t: 'dead', px: BX(e.x) + S / 2, py: rowC(myRow(e.d)), at: now(), life: 1500 }); G.mySol.splice(i, 1); } });
        while (G.mySol.length && !G.mySol.some(function (e) { return e.d === 1; })) G.mySol.forEach(function (e) { e.d--; });
        if (vict.length) G.fx.push({ t: 'pop', text: '내 보병 ' + vict.length + '명 벼락 사망', x: W / 2, y: 0, at: now(), big: true, col: '#ff8a7a' });
        if (window.NET) NET.pub(true); }, 600);
    }
    else if (k === 'solar') { G.oppShield = SHIELD_HP; G.oppSolarUntil = t + SOLAR_MS; }
  }
  function incomingShot(x) {                                // 대전: 상대 미사일이 내 세로줄로 날아옴. 0.9초 뒤 그 줄 맨 앞 내 보병이 죽고, 보병이 없으면 거기 내 탱크가 있을 때 피격
    if (!G.vs || G.over) return;
    var mx = COLS - 1 - x;
    var vict = null; G.mySol.forEach(function (e) { if (e.x === mx && (!vict || e.d < vict.d)) vict = e; });
    var landY = vict ? myRow(vict.d) : (G.tank.x === mx ? G.tank.y : Math.max(top(), 1));                 // 떨어질 칸(판정과 같은 규칙)
    var hitTank = !vict && G.tank.x === mx;
    G.freezeUntil = now() + FLIGHT_MS; G.sel = false; G.drag = null; G.dragInf = null; G.aim = null;   /* 포격 중엔 양쪽 다 정지 */
    G.incoming.push({ x: mx, at: now() + FLIGHT_MS, start: now(), y0: G.oppTank ? -1 - G.oppTank.y : -EROWS + 1, y1: landY, trail: [], vict: vict, hitTank: hitTank });   // 판정은 쏜 순간에 확정
    G.fx.push({ t: 'pop', text: '적 포격! 포탄 날아온다', x: W / 2, y: 0, at: now(), big: true, col: '#ff5a4a' }); sfx('siren');
    hint('incoming', '적이 쏘면 위치가 드러나요 — 그 줄로 가서 반격!', function () { return G.oppTank ? { x: BX(COLS - 1 - G.oppTank.x) + S / 2, y: rowC(-1 - G.oppTank.y) } : { x: W / 2, y: EY + 30 }; }, 30000);
    G.alarmUntil = now() + FLIGHT_MS;
  }
  var planeE = null;
  function enemyPlane() {                                   // 적 정찰기: 비행기 그림을 붉게 물들인 사본(한 번만 생성)
    var src = IMG.u_plane_e || IMG.u_plane; if (planeE || !src) return planeE;
    var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; var g = c.getContext('2d');
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,40,30,.45)'; g.fillRect(0, 0, c.width, c.height);
    return planeE = c;
  }
  function enemyScout() {                                   // 대전: 상대 정찰기가 내 진영 위를 돈다 → 내 위치가 발각됨
    if (!G.vs || G.over) return; G.enemyScoutUntil = now() + SCOUT_MS; sfx('radar');
    G.fx.push({ t: 'pop', text: '적 정찰기 출현 — 탐색 중', x: W / 2, y: BYY(top()) + S * 1.5, at: now(), big: false, col: '#ffb3a8' });
  }
  function myRow(d) { return G.adv + d - 1; }                // 내 보병 d(1=최전방) 가 서는 내 보드 줄
  function startClash(mine, theirs, delta) {                // 대전: 전선 교전 연출 (2.5초) — 최전방 보병 수 비교, 많은 쪽이 민다
    G.clash = { mine: mine, theirs: theirs, delta: delta, at: now(), until: now() + 2500, puffs: [] };
    if (delta < 0) setTimeout(function () { if (G && !G.over) addScore(500 * -delta, W / 2, BYY(G.adv), '전선 돌파'); }, 1600);   /* 교전 승리 */
    for (var i = 0; i < 14; i++) G.clash.puffs.push({ x: Math.random() * W, dy: (Math.random() - 0.5) * 30, r: 14 + Math.random() * 22, sp: 0.5 + Math.random() });
    sfx('clash');
  }
  function useInfantry(col) {                             // 대전: 내 탱크 세로줄의 최전방(전선 바로 너머)에 보병을 세워 밀고 들어간다. 같은 줄이면 뒤로 쌓임
    if (!G.vs || G.inf <= 0 || G.over) return;
    if (col == null) col = G.tank.x;
    G.inf--; G.sent++;
    var d = 1; G.mySol.forEach(function (e) { if (e.x === col) d = Math.max(d, e.d + 1); }); G.mySol.push({ x: col, d: d, runAt: now(), fromX: G.tank.x, fromY: G.tank.y, sh: now() < (G.solarUntil || 0) ? 1 : 0 });   // 탱크 해치에서 뛰어나가는 연출
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
    G.collapsing = { at: t, step: 0, sec: -1, cracks: [] }; for (var ck = 0; ck < 5; ck++) G.collapsing.cracks.push({ x: rnd(COLS), y: top() + rnd(Math.max(1, ROWS - top())), k: ck % 2, r: Math.random() * 6, d: ck * 350 });
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
      for (var db = 0; db < 8; db++) G.fx.push({ t: 'debris', px: Math.random() * W, py: BYY(top()) + Math.random() * (ROWS - top()) * S, at: t + db * 60, life: 900, rot: Math.random() * 6 });
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
    if (G.demo) { G.nextAdv = t + 99000; G.missileReady = 0; }   // 튜토리얼: 시간 흐름 멈춤
    var tk = G.tank, dtF = t - (G.lastT || t); G.lastT = t;
    var frozen = G.freezeUntil && t < G.freezeUntil;
    if (frozen) {                                                     /* 포격 중 정지: 타이머·이동은 그 시간만큼 뒤로 미루고, 포탄 비행·효과만 진행 */
      G.nextAdv += dtF; G.missileReady += dtF; tk.moveAt += dtF; if (G.scoutUntil) G.scoutUntil += dtF; if (G.enemyScoutUntil) G.enemyScoutUntil += dtF; if (G.stormMine) G.stormMine += dtF; if (G.stormOpp) G.stormOpp += dtF; if (G.lockUntil) G.lockUntil += dtF;
    }
    /* 탱크 머리 방향: 이동 중엔 가는 쪽으로, 멈추면 다시 정면(위) */
    var angT = 0; if (tk.path.length) { var nx = tk.path[0][0] - tk.x, ny = tk.path[0][1] - tk.y; angT = Math.atan2(nx, -ny); }
    if (tk.ang == null) tk.ang = 0; var dA = angT - tk.ang; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2; tk.ang += Math.max(-0.22, Math.min(0.22, dA)); if (Math.abs(dA) < 0.01) tk.ang = angT;
    if (!frozen && tk.path.length && t - tk.moveAt >= 150) {
      var c = tk.path.shift(); tk.x = c[0]; tk.y = c[1]; tk.moveAt = t; if (tk.path.length) sfx('step');
      if (!tk.path.length) { calcReach(); if (G.vs && window.NET) NET.pub(); }
    }
    if (tk.path.length) { var p = Math.min(1, (t - tk.moveAt) / 150); tk.fx = tk.x + (tk.path[0][0] - tk.x) * p; tk.fy = tk.y + (tk.path[0][1] - tk.y) * p; }
    else { tk.fx = tk.x; tk.fy = tk.y; }
    // 미사일
    var dt = 1 / 60, fr = front();
    G.missiles = G.missiles.filter(function (m) {
      m.y = m.y0 - (m.y0 - m.y1) * Math.min(1, (t - m.at) / (m.fl || 1000));   // 거리와 상관없이 일정 시간 비행(곡사)
      var ty = m.target ? G.adv - m.target.d : -99;
      if (G.vs && m.y <= m.y1) {                                      // 대전: 착탄 연출만. 병사가 죽는지·탱크가 맞는지는 상대 쪽이 판정해 목록/체력으로 알려줌
        G.fx.push({ t: 'boomv', px: BX(m.x) + S / 2, py: rowC(m.y1), at: t, big: true }); sfx('boom', false);
        if (m.pred) { G.kills++; addScore(300, BX(m.x) + S / 2, rowC(m.y1), '보병 격파'); }
        return false;
      }
      if (m.target && G.soldiers.indexOf(m.target) >= 0 && m.y <= ty) {
        G.soldiers.splice(G.soldiers.indexOf(m.target), 1);
        G.kills++; addScore(300, BX(m.target.x) + S / 2, slotY(m.target.d));
        G.fx.push({ t: 'boomv', px: BX(m.target.x) + S / 2, py: slotY(m.target.d), at: t, big: true });
        sfx('boom', false);
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
      if (vict && vict.sh) { vict.sh = 0; var vpx = BX(sh.x) + S / 2, vpy = BYY(myRow(vict.d)) + S - 4; G.fx.push({ t: 'shieldHit', px: vpx, py: vpy - S * 0.35, sz: 0.7, at: t }); G.fx.push({ t: 'boomv', px: vpx, py: vpy - S * 0.5, at: t, big: false }); sfx('shieldHit'); G.fx.push({ t: 'pop', text: '태양 방패가 보병을 지켰다', x: vpx, y: vpy - S, at: t, big: false, col: '#ffd451' }); return false; }
      if (vict) {                                                     // 맨 앞 내 보병이 대신 맞는다 (발사 순간에 정해진 보병)
        G.mySol.splice(G.mySol.indexOf(vict), 1); G.fx.push({ t: 'dead', px: BX(sh.x) + S / 2, py: rowC(myRow(vict.d)), at: t, life: 1500 });
        G.fx.push({ t: 'boom', x: sh.x, y: myRow(vict.d), at: t, big: false }); sfx('boom', false);
        G.fx.push({ t: 'pop', text: '보병 전사', x: BX(sh.x) + S / 2, y: rowC(myRow(vict.d)) - 20, at: t, big: false });
        if (!G.mySol.some(function (e) { return e.d === 1; })) G.mySol.forEach(function (e) { e.d--; });   // 최전방이 비면 뒷줄이 앞으로
        if (window.NET) NET.pub(true);
        return false;
      }
      var hitT = sh.hitTank, hy = hitT ? tk.y : Math.max(top(), 1), hx = hitT ? tk.x : sh.x;   // 탱크가 표적이었으면 지금 어디 있든 맞는다
      G.fx.push({ t: 'boom', x: hx, y: hy, at: t, big: true }); sfx('boom', true); G.shake = 10; G.shakeUntil = t + 300;
      if (hitT && G.shield > 0) { G.shield--; G.fx.push({ t: 'shieldHit', at: t }); G.fx.push({ t: 'pop', text: '태양 방패가 막아냈다!', x: W / 2, y: 0, at: t, big: true, col: '#ffd451' }); sfx('shieldHit'); if (window.NET) NET.pub(true); return false; }
      if (hitT) { tk.hp--; applySkin(); G.fx.push({ t: 'pop', text: '탱크 피격! 체력 ' + tk.hp, x: W / 2, y: 0, at: t, big: true, col: '#ff5a4a' }); if (window.NET) NET.pub(true); if (tk.hp <= 0) killTank('상대 미사일에 격파'); }
      else G.fx.push({ t: 'pop', text: '빗나감', x: BX(hx) + S / 2, y: BYY(hy) - 10, at: t, big: false });
      return false;
    });
    // 진격 (대전: 전선은 방장이 30초마다 계산해 내려줌 → applyLine. 여기서는 혼자 모드와 '놓을 곳 없음' 쓸림만)
    if (!frozen && t >= G.nextAdv && (!G.vs || G.sweep)) {
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
    if (G.solarUntil && t > G.solarUntil) { G.solarUntil = 0; G.shield = 0; G.mySol.forEach(function (e) { e.sh = 0; }); if (window.NET) NET.pub(true); }   /* 솔라 5초 끝 */
    if (G.oppSolarUntil && t > G.oppSolarUntil) { G.oppSolarUntil = 0; G.oppShield = 0; }
    guideTick(t);
    if (G.roundFx) { var ra = t - G.roundFx.at; if (ra > 1700 && !G.roundFx.reset) { G.roundFx.reset = 1; if (G.roundFx.onReset) G.roundFx.onReset(); } if (ra > 2400) G.roundFx = null; }
    if (G.collapsing) collapseTick(t);
    if (G.crash && t - G.crash.at > 1600) G.crash = null;
    G.bolts = G.bolts.filter(function (b) { return t - b.at < 700; });
    if (G.shotWait && t > G.shotWait.at + 1000) {                       // 내가 쏜 결과: 착탄 뒤 상대 쪽 판정이 오면 표시
      var sw = G.shotWait, o2 = (window.NET && NET.opp()) || {}, ohp2 = o2.hp == null ? HP_MAX : o2.hp;
      if (ohp2 < sw.hp) { G.shotWait = null; addScore(800, BX(sw.x) + S / 2, EY + 40, '탱크 명중'); G.fx.push({ t: 'pop', text: '상대 탱크 명중! 체력 ' + ohp2, x: W / 2, y: 0, at: t, big: true, col: '#9be37a' }); sfx('gain'); }
      else if (G.soldiers.length < sw.sol) { G.shotWait = null; if (!sw.scored) addScore(300, BX(sw.x) + S / 2, BYY(G.adv) - 20, '보병 격파'); G.fx.push({ t: 'pop', text: '명중! 적 보병 격파', x: W / 2, y: 0, at: t, big: true, col: '#9be37a' }); }
      else if (t > sw.until) { G.shotWait = null; G.fx.push({ t: 'pop', text: '빗나감', x: BX(sw.x) + S / 2, y: BYY(G.adv) - 14, at: t, big: false, col: '#cfd6bf' }); }
    }
    G.craters = G.craters || []; G.fx.forEach(function (f) { if (f.t === 'boom' && f.big && !f.cr && f.y >= 0) { f.cr = 1; G.craters.push({ x: f.x, y: f.y, r: Math.random() * 6 }); } }); if (G.craters.length > 8) G.craters.splice(0, G.craters.length - 8);
    // 큰 팝업은 큐로 모아 한 번에 하나씩 띠 배너로(겹침 방지). 밀리면 오래된 건 버림
    G.msgQ = G.msgQ || [];
    G.fx = G.fx.filter(function (f) { if (f.t === 'pop' && f.big) { G.msgQ.push(f); return false; } return true; });
    while (G.msgQ.length > 2) G.msgQ.shift();
    if (G.msg && t - G.msg.at > 1150) G.msg = null;
    if (!G.msg && G.msgQ.length) { G.msg = G.msgQ.shift(); G.msg.at = t; }
    var smalls = G.fx.filter(function (f) { return f.t === 'pop'; }); while (smalls.length > 3) { var oldest = smalls.shift(); G.fx.splice(G.fx.indexOf(oldest), 1); }
    if (G.vs && G.oppTank && t < G.scoutUntil) G.lastSeen = { x: G.oppTank.x, y: G.oppTank.y, t: t, how: '정찰' };   // 정찰 중 본 위치를 기억
    if (G.clash && t > G.clash.until + 400) G.clash = null;
    G.fx = G.fx.filter(function (f) { return t - f.at < (f.life || (f.t === 'pop' ? 1000 : 700)); });
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
    if (RES[r]) { ctx.font = Math.round(s * 0.5) + 'px Do Hyeon, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(RES[r], px + s / 2, py + s / 2 + 1); }
    ctx.restore();
  }
  function drawTank(px, py, s, col, turretUp, hp, ang) {
    if (IMG.u_tank_p) { fitImg(IMG.u_tank_p, px + s / 2, py + s / 2 - s * 0.06, s * 1.25, s * 1.4, 1, ang || 0); return; }
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
  function headW(img) {                                          // 그림 위쪽 28%(머리·헬멧)에서 가장 넓은 불투명 폭(px). 한 번만 계산
    if (img.__hw) return img.__hw;
    try { var c = document.createElement('canvas'); c.width = img.width; c.height = img.height; var g = c.getContext('2d'); g.drawImage(img, 0, 0); var d = g.getImageData(0, 0, c.width, c.height).data, w = c.width, h = c.height, top = -1, bot = -1;
      for (var y = 0; y < h && top < 0; y++) for (var x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 60) { top = y; break; }
      for (var y2 = h - 1; y2 >= 0 && bot < 0; y2--) for (var x2 = 0; x2 < w; x2++) if (d[(y2 * w + x2) * 4 + 3] > 60) { bot = y2; break; }
      var best = 1, lim = top + (bot - top) * 0.28; for (var y3 = top; y3 < lim; y3++) { var l = -1, r = -1; for (var x3 = 0; x3 < w; x3++) if (d[(y3 * w + x3) * 4 + 3] > 60) { if (l < 0) l = x3; r = x3; } if (r - l > best) best = r - l; }
      img.__hw = best; } catch (e) { img.__hw = img.width * 0.6; }
    return img.__hw;
  }
  var SOL_CASE = (function () { try { var q = /[?&]sol=([ABCD])/.exec(location.search); if (q) { localStorage.setItem('tank_sol', q[1]); return q[1]; } return localStorage.getItem('tank_sol') || 'D'; } catch (e) { return 'A'; } })();   /* 보병 크기 시안 */
  var SOL_NORM = (function () { try { var q = /[?&]norm=(head|height)/.exec(location.search); if (q) { localStorage.setItem('tank_norm', q[1]); return q[1]; } return localStorage.getItem('tank_norm') || 'head'; } catch (e) { return 'head'; } })();   /* 보병 크기 기준 */
  var SOL_BOX = { A: [0.8, 1.05], B: [1.1, 1.3], C: [0.95, 1.18], D: [1.35, 1.6] };   /* 상자 [가로, 세로] 배수 */
  function solK(mine, s) {                                        // 화면 1px 당 그림 배율. 한 시트 안에선 같은 배율(뒷모습·정면·쓰러짐 비율 유지), 세력끼리는 키를 같게
    var f = G.fac || 'solar', refM = V2['s_' + f + '_stand'] || IMG.u_soldier_p; if (!refM) return 1;
    var bx = SOL_BOX[SOL_CASE] || SOL_BOX.A, kM = Math.min(s * bx[0] / refM.width, s * bx[1] / refM.height);
    var kMine = kM * 1.2 * 0.8; if (mine) return kMine;   /* 양쪽 다 80% */                  /* 아군(뒷모습) */
    var ef = oppFacKey(), refE = V2['s_' + ef + '_frun1'] || V2['s_' + ef + '_front']; if (!refE) return kMine;
    if (SOL_NORM === 'height') { var refEb = V2['s_' + ef + '_stand'] || refE; return kMine * refM.height / refEb.height * 0.95; }   /* 키를 같게 */
    return kMine * headW(refM) / headW(refE) * 0.95;                /* 머리 폭을 같게, 적은 5% 작게 */
  }
  function drawSoldier(px, py, s, mine, feetY) {
    var im = mine ? IMG.u_soldier_p : IMG.u_soldier_e;
    if (im) {
      var k = solK(mine, s), dw = im.width * k, dh = im.height * k;
      if (mine) ctx.drawImage(im, px + s / 2 - dw / 2, py + s / 2 - dh / 2, dw, dh);                         /* 아군: 칸 가운데 */
      else { var fy = feetY != null ? feetY : py + s; ctx.drawImage(im, px + s / 2 - dw / 2, fy - dh, dw, dh); }   /* 적군: 발이 자기 줄 바닥(전선을 안 넘음) */
      return;
    }
    ctx.save(); ctx.translate(px + s / 2, py + s / 2);
    ctx.fillStyle = mine ? '#4f6a2e' : '#7a2a2a'; rr(-s * 0.16, -s * 0.05, s * 0.32, s * 0.4, 6); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s * 0.14, s * 0.05); ctx.lineTo(s * 0.14, s * 0.44); ctx.stroke();
    ctx.fillStyle = '#e8c39e'; ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = mine ? '#3a4a22' : '#5a1f1f'; ctx.beginPath(); ctx.arc(0, -s * 0.24, s * 0.16, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.13, 0, 7); ctx.stroke();
    ctx.restore();
  }
  function draw(t) {
    if (G.vs) applySkin();                                         /* 체력에 맞는 탱크 그림 */
    ctx.setTransform(scale * dpr, 0, 0, scaleY * dpr, 0, 0);
    ctx.fillStyle = '#0b0d0a'; ctx.fillRect(0, 0, WT + OFFX * 2, HL);
    ctx.translate(OFFX, OFFY);
    if (t < G.shakeUntil) { var sk = G.shake * (G.shakeUntil - t) / 400; ctx.translate((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk); }
    // 땅: 대전은 새 전장 그림(격자 없음), 혼자 모드는 흙 타일
    function cover(img, x, y, w, h, alpha) { var r = Math.max(w / img.width, h / img.height), sw = w / r, sh = h / r; ctx.save(); if (alpha != null) ctx.globalAlpha = alpha; ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h); ctx.restore(); }
    var newBg = G.vs && V2.bg_mine && V2.bg_enemy;
    if (newBg) { cover(V2.bg_mine, 0, BY, W, ROWS * S); cover(V2.bg_enemy, 0, EY, W, BY - EY); }
    else if (IMG.b_ground) { if (!groundImg) { groundImg = document.createElement('canvas'); groundImg.width = COLS * S; groundImg.height = ROWS * S; var gg = groundImg.getContext('2d'); for (var gy = 0; gy < ROWS; gy++) for (var gx = 0; gx < COLS; gx++) gg.drawImage(IMG.b_ground, gx * S, gy * S, S, S); gg.fillStyle = 'rgba(0,0,0,.18)'; gg.fillRect(0, 0, groundImg.width, groundImg.height); } ctx.drawImage(groundImg, 0, BY); }
    else ctx.drawImage(ground, 0, 0, ground.width, ground.height, 0, BY, COLS * S, ROWS * S);
    // 안개(적 진영 + 점령된 줄)
    var fogRows = EROWS + G.adv, scouting = t < G.scoutUntil, fr = front();
    function drawForest(alpha) { if (!IMG.b_forest) return; ctx.save(); ctx.globalAlpha = alpha; for (var fy = BYY(G.adv) - FS; fy > EY - FS; fy -= FS) for (var fx = 0; fx < COLS; fx++) ctx.drawImage(IMG.b_forest, BX(fx), fy, S, FS); ctx.restore(); }
    if (G.vs && IMG.b_ground && !newBg) {                                    // 대전(옛 그림): 위쪽 9줄 = 상대 진영(땅 타일)
      ctx.save(); ctx.globalAlpha = 0.55; for (var oy = -1; oy >= -EROWS; oy--) for (var ox = 0; ox < COLS; ox++) ctx.drawImage(IMG.b_ground, BX(ox), BYY(oy), S, FS); ctx.restore();
      if (G.adv < 0) { ctx.fillStyle = 'rgba(120,200,255,.10)'; ctx.fillRect(0, BYY(G.adv), W, -G.adv * FS); }
    }
    if (!newBg) { ctx.save(); ctx.beginPath(); ctx.rect(0, EY, W, fogH()); ctx.clip(); drawForest(1); ctx.restore(); }   // 전선 너머 = 숲(옛 그림)
    if (newBg && G.adv !== 0) { ctx.fillStyle = G.adv > 0 ? 'rgba(120,20,20,.28)' : 'rgba(120,200,255,.14)'; if (G.adv > 0) ctx.fillRect(0, BY, W, G.adv * S); else ctx.fillRect(0, BYY(G.adv), W, -G.adv * FS); }   // 빼앗긴/차지한 줄 표시
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
    } else {                                                                 // 대전: 상대 땅은 짙은 안개. 정찰기가 떠 있는 동안만 걷힌다
      var sIn = scouting ? Math.min(1, (t - (G.scoutUntil - SCOUT_MS)) / 450) : 0, sOut = scouting ? Math.min(1, (G.scoutUntil - t) / 450) : 0, clear = Math.min(sIn, sOut), fa = 1 - clear * 0.92;
      ctx.save(); ctx.beginPath(); ctx.rect(0, EY, W, fogH()); ctx.clip();
      ctx.fillStyle = 'rgba(18,22,20,' + (0.72 * fa) + ')'; ctx.fillRect(0, EY, W, fogH());
      if (IMG.fog_a && IMG.fog_b) { ctx.globalAlpha = 0.75 * fa; for (var fi = 0; fi < 8; fi++) { var fim = fi % 2 ? IMG.fog_a : IMG.fog_b, fw = W * (0.6 + (fi % 3) * 0.15), fx0 = ((fi * 173 + t / (50 + fi * 9)) % (W + fw)) - fw / 2, fy0 = EY + 10 + ((fi * 67) % Math.max(30, fogH() - 20)); ctx.drawImage(fim, fx0 - fw / 2, fy0 - fw * 0.22, fw, fw * 0.45); } }
      ctx.restore();
      if (clear > 0) { ctx.save(); ctx.font = '800 13px Black Han Sans, Do Hyeon, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; var stx = '정찰 중 — 적진이 보인다 ' + Math.ceil((G.scoutUntil - t) / 1000) + 's'; ctx.globalAlpha = clear; ctx.strokeText(stx, W / 2, EY + 4); ctx.fillStyle = '#c8f5b0'; ctx.fillText(stx, W / 2, EY + 4); ctx.restore(); }
      else { ctx.save(); ctx.font = '700 12px Do Hyeon, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(220,230,220,.55)'; ctx.fillText('안개 — 정찰기를 띄우면 적 탱크와 뒷줄이 보인다', W / 2, EY + 14); ctx.restore(); }
    }
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
      if (IMG.u_plane) { ctx.save(); ctx.translate(p0[0], p0[1]); ctx.rotate(head + Math.PI / 2); ctx.scale(1 - Math.abs(bank) * 0.35, 1); fitImg(IMG.u_plane, 0, 0, 120, 92, 1, 0); ctx.restore(); }
      else { ctx.fillStyle = '#eaf7ff'; ctx.beginPath(); ctx.arc(pxp, pyp, 12, 0, 7); ctx.fill(); }
    }
    // 진격 임박: 안개가 붉게 물듦(10초 전부터)
    var left = G.nextAdv - t;
    if (left < 10000 && !G.over && !G.sweep && !(G.vs && !G.soldiers.length)) { ctx.fillStyle = 'rgba(255,30,30,' + (0.04 + 0.06 * (1 - left / 10000)) + ')'; ctx.fillRect(0, EY, W, fogH()); }
    if (left < 6000 && !G.over) { ctx.fillStyle = 'rgba(255,40,40,' + (0.25 + 0.25 * Math.sin(t / 90)) + ')'; ctx.fillRect(0, BYY(G.adv), W, G.adv >= 0 ? S : FS); }
    if (G.vs && V2.d_wire1) { var wh = Math.min(FS * 1.25, S * 0.85), ww = wh * V2.d_wire1.width / V2.d_wire1.height; for (var wx = -ww * 0.2, wi = 0; wx < W; wx += ww * 0.92, wi++) ctx.drawImage(wi % 2 ? V2.d_wire2 : V2.d_wire1, wx, BYY(G.adv) - wh * 0.85, ww, wh); }   /* 전선 철조망 */
    ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(0, BYY(G.adv)); ctx.lineTo(W, BYY(G.adv)); ctx.stroke(); ctx.setLineDash([]);
    // 격자: 블록을 끌거나 탱크를 골랐을 때만 (새 배경일 때)
    if (newBg && ((G.drag && G.drag.moved) || G.sel)) { ctx.save(); ctx.strokeStyle = 'rgba(255,230,170,.22)'; ctx.lineWidth = 1; ctx.beginPath(); for (var gx2 = 0; gx2 <= COLS; gx2++) { ctx.moveTo(gx2 * S, BYY(top())); ctx.lineTo(gx2 * S, BY + ROWS * S); } for (var gy2 = top(); gy2 <= ROWS; gy2++) { ctx.moveTo(0, BYY(gy2)); ctx.lineTo(W, BYY(gy2)); } ctx.stroke(); ctx.restore(); }
    if (G.craters && V2.d_crater) G.craters.forEach(function (c) { if (c.y >= top()) fitImg(V2.d_crater, BX(c.x) + S / 2, BYY(c.y) + S / 2, S * 1.15, S * 0.95, 0.85, c.r); });   /* 폭발 구덩이 */
    // 블록
    for (var y = top(); y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x]) drawBlock(BX(x), BYY(y), S, G.board[y][x]);
    if (t < (G.solarUntil || 0)) drawSun(BYY(top()), HY - BYY(top()), t, G.solarUntil, true);         // 내 땅에 햇살(솔라)
    if (t < (G.oppSolarUntil || 0)) drawSun(EY, fogH(), t, G.oppSolarUntil, false);                   // 상대 땅에 햇살
    // 적 병사 (정찰 중에만 보임) · 내 보병(대전, 항상 보임) · 상대 탱크(대전, 정찰 중·발사 직후)
    var cj = G.clash && t < G.clash.until ? 1 : 0;                                   // 교전 중엔 병사들이 떨림
    var keepSE = IMG.u_soldier_e, keepSP = IMG.u_soldier_p, rf = Math.floor(t / 110) % 2, oe = oppFacKey(), mf2 = G.fac || 'solar';
    if (cj) { if (V2['s_' + oe + '_frun2']) IMG.u_soldier_e = V2['s_' + oe + (rf ? '_frun2' : '_frun1')]; if (V2['s_' + mf2 + '_run2']) IMG.u_soldier_p = V2['s_' + mf2 + (rf ? '_run2' : '_run1')]; }   /* 교전: 양쪽 달리기 2프레임 */
    if (scouting || G.vs) G.soldiers.slice().sort(function (a, b) { return b.d - a.d; }).forEach(function (e, i) { if (G.vs && !scouting && e.d !== 1) return;   /* 최전방은 늘 보이고, 뒷줄은 정찰할 때만 */ var ss = G.vs ? S * 0.8 : FS * 1.05; ctx.save(); ctx.globalAlpha = (!G.vs || scouting || cj) ? 1 : 0.45;   /* 안개 속 최전방 적: 흐릿 */ /* 대전: 최전방 보병만 항상 보이고 뒷줄·탱크는 정찰 중에만. 크기는 내 보병과 같게, 흔들림 없음 */ var ejx = cj * (Math.random() - 0.5) * 6; drawSoldier(BX(e.x) + (S - ss) / 2 + ejx, slotY(e.d) - ss / 2, ss, false, slotY(e.d) + FS * 0.45); if (t < (G.oppSolarUntil || 0)) drawSolDome(BX(e.x) + S / 2 + ejx, slotY(e.d) + FS * 0.45, t); ctx.restore(); });
    if (G.vs) {
      G.mySol.slice().sort(function (a, b) { return b.d - a.d; }).forEach(function (e, i) { var ss = S * 0.8, ry = myRow(e.d); if (ry >= ROWS) return;
        var dx = BX(e.x) + (S - ss) / 2, dy = rowC(ry) - ss / 2, bob = 0;
        if (e.runAt && t - e.runAt < 900) {                                                    // 탱크에서 튀어나와 최전방까지 달려감
          var rp = t - e.runAt, sx = BX(e.fromX) + (S - ss) / 2, sy = BYY(e.fromY) + (S - ss) / 2;
          if (rp < 220) { var hop = rp / 220; dx = sx; dy = sy - Math.sin(hop * Math.PI) * 26; bob = 0; ss *= 0.6 + 0.4 * hop; }          // 해치에서 폴짝
          else { var q = Math.min(1, (rp - 220) / 680); q = 1 - (1 - q) * (1 - q); dx = sx + (dx - sx) * q; dy = sy + (dy - sy) * q; bob = -Math.abs(Math.sin(rp / 45)) * 7;
            ctx.fillStyle = 'rgba(120,90,50,.35)'; for (var di = 0; di < 3; di++) { ctx.beginPath(); ctx.arc(dx + ss / 2 - di * 8 + (Math.random() - 0.5) * 4, dy + ss - 2 + di * 2, 3 + di, 0, 7); ctx.fill(); } }   // 흙먼지
        } else dx += cj * (Math.random() - 0.5) * 6;
        var keepP = IMG.u_soldier_p; if (e.runAt && t - e.runAt < 900 && V2['s_' + mf2 + '_run1']) IMG.u_soldier_p = V2['s_' + mf2 + (rf ? '_run2' : '_run1')]; var runN = e.runAt && t - e.runAt < 900, fyM = runN ? dy + bob + ss : BYY(ry) + S - 4; drawSoldier(dx, dy + bob, ss, true, fyM); IMG.u_soldier_p = keepP; if (e.sh) drawSolDome(dx + ss / 2, fyM, t); });
      IMG.u_soldier_e = keepSE; IMG.u_soldier_p = keepSP;
      var liveSee = G.oppTank && (scouting || (G.reveal && t < G.reveal.until));
      if (!liveSee && G.lastSeen) {                                            // 마지막으로 확인된 상대 탱크 자리(잔상) — 다음 정찰/발사까지 남는다
        var ls = G.lastSeen, lx = BX(COLS - 1 - ls.x) + S / 2, lyy = rowC(-1 - ls.y), ago = Math.floor((t - ls.t) / 1000);
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,120,100,.7)'; ctx.lineWidth = 2; ctx.strokeRect(BX(COLS - 1 - ls.x) + 2, lyy - S * 0.6, S - 4, S * 1.2); ctx.setLineDash([]); ctx.restore();
        if (IMG.u_tank_e) fitImg(IMG.u_tank_e, lx, lyy, S * 1.05, S * 1.15, 0.42);
        ctx.save(); ctx.font = '700 11px Do Hyeon, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,200,190,.85)'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('마지막 위치(' + ls.how + ') ' + ago + '초 전', lx, lyy + S * 0.62); ctx.restore();
      }
      if (liveSee) {
        var otx = BX(COLS - 1 - G.oppTank.x) + S / 2, oty = rowC(-1 - G.oppTank.y), oa = scouting ? 1 : Math.min(1, (G.reveal.until - t) / 1200);
        ctx.fillStyle = 'rgba(255,60,60,' + (0.18 * oa) + ')'; ctx.fillRect(BX(COLS - 1 - G.oppTank.x) + 2, EY, S - 4, BYY(0) - EY);
        if (IMG.ui_cross) fitImg(IMG.ui_cross, otx, oty, S * 1.75, S * 1.75, oa * 0.55, t / 900);   /* 조준 표시는 탱크 뒤에 크게 */
        if (IMG.u_tank_e) fitImg(IMG.u_tank_e, otx, oty, S * 1.15, S * 1.25, oa);   /* 내 탱크와 같은 크기 */
        ctx.save(); ctx.font = '700 12px Do Hyeon, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,220,220,' + oa + ')'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(scouting ? '상대 탱크' : '상대 탱크 발사 위치', otx, oty + FS * 0.8); ctx.restore();
      }
    }
    if (G.vs) drawSkillFx(t);
    if (G.vs && G.warnOpp) { ctx.strokeStyle = 'rgba(255,60,60,' + (0.35 + 0.3 * Math.sin(t / 160)) + ')'; ctx.lineWidth = 3; ctx.strokeRect(2, EY + 2, W - 4, BYY(0) - EY - 4); }
    if (G.vs) {                                                            // 위쪽 안내 글씨
      ctx.save(); ctx.font = '600 11px Do Hyeon, system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3; ctx.fillText('▲ 상대 진영', 6, EY + 3); ctx.restore();
    }
    // 갈 수 있는 칸
    var showReach = !G.drag && !G.tank.path.length && !G.over && !G.sweep && !G.collapsing && !(G.freezeUntil && t < G.freezeUntil);   /* 탱크를 누르지 않아도 갈 수 있는 칸은 늘 보인다 */
    if (showReach) for (var k in G.reach) if (G.reach[k].d) { var c = k.split(','), rcx = BX(+c[0]) + S / 2, rcy = BYY(+c[1]) + S / 2, rd = G.reach[k].d, pulse = 0.8 + 0.2 * Math.sin(t / 220 + rd);
      ctx.save(); if (V2.o_ok) fitImg(V2.o_ok, rcx, rcy, S - 6, S - 6, (G.sel ? 0.18 : 0.08) + 0.1 * pulse); else { ctx.fillStyle = 'rgba(57,255,106,' + (0.18 * pulse) + ')'; ctx.fillRect(BX(+c[0]) + 3, BYY(+c[1]) + 3, S - 6, S - 6); } if (G.sel) { } else if (V2.o_dot) fitImg(V2.o_dot, rcx, rcy, S * 0.34, S * 0.34, 0.9); else { ctx.fillStyle = 'rgba(200,255,210,.9)'; ctx.beginPath(); ctx.arc(rcx, rcy, 6, 0, 7); ctx.fill(); }
      if (G.sel) {                                                    /* 탱크를 누르면: 그 칸까지 드는 기름을 크게. 가까우면 초록 → 기름을 거의 다 쓰면 주황 */
        var fr2 = rd / Math.max(1, G.fuel), pc = fr2 <= 0.34 ? '#7dff7a' : fr2 <= 0.67 ? '#ffe066' : '#ff9a3a';
        ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(rcx - S * 0.3, rcy - S * 0.2, S * 0.6, S * 0.4, 7); ctx.fill(); ctx.strokeStyle = pc; ctx.lineWidth = 1.5; rr(rcx - S * 0.3, rcy - S * 0.2, S * 0.6, S * 0.4, 7); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 ' + Math.round(S * 0.32) + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.fillStyle = pc; ctx.fillText('-' + rd, rcx, rcy + 1); }
      ctx.restore(); }
    // 드래그 미리보기
    if (G.drag && G.drag.moved) {
      var d = G.drag, ok = d.gx != null && canPlace(d.p, d.gx, d.gy);
      if (d.gx != null) d.p.cells.forEach(function (c) { var x = d.gx + c.dx, y = d.gy + c.dy; if (x >= 0 && x < COLS && y >= 0 && y < ROWS) { var oi = ok ? V2.o_ok : V2.o_bad; if (oi) fitImg(oi, BX(x) + S / 2, BYY(y) + S / 2, S - 2, S - 2, 0.9); else { ctx.fillStyle = ok ? 'rgba(255,230,120,.35)' : 'rgba(255,60,60,.35)'; ctx.fillRect(BX(x) + 3, BYY(y) + 3, S - 6, S - 6); } } });
    }
    // 위험: 빈 칸이 적을수록 보드 가장자리가 붉게
    var empty = 0, total = (ROWS - top()) * COLS; for (var yy = top(); yy < ROWS; yy++) for (var xx = 0; xx < COLS; xx++) if (!G.board[yy][xx]) empty++;
    var danger = 1 - empty / Math.max(1, total);
    if (danger > 0.6 && !G.over) { var dg = ctx.createRadialGradient(W / 2, BYY((top() + ROWS) / 2), W * 0.35, W / 2, BYY((top() + ROWS) / 2), W * 0.75); dg.addColorStop(0, 'rgba(255,0,0,0)'); dg.addColorStop(1, 'rgba(255,20,20,' + ((danger - 0.6) * 1.2 + 0.08 * Math.sin(t / 200)) + ')'); ctx.fillStyle = dg; ctx.fillRect(0, BYY(top()), W, (ROWS - top()) * S); }
    if (G.freezeUntil && t < G.freezeUntil && !G.over) {                   /* 포격 중 정지 표시 */
      ctx.save(); ctx.strokeStyle = 'rgba(255,200,80,' + (0.5 + 0.4 * Math.sin(t / 90)) + ')'; ctx.lineWidth = 4; ctx.strokeRect(2, EY + 2, W - 4, HY - EY - 4);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 15px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 4; ctx.strokeStyle = '#1a0a00'; ctx.strokeText('포격 중 — 정지', W / 2, EY + 22); ctx.fillStyle = '#ffd451'; ctx.fillText('포격 중 — 정지', W / 2, EY + 22); ctx.restore();
    }
    if (G.alarmUntil && t < G.alarmUntil) { ctx.fillStyle = 'rgba(255,30,30,' + (0.12 + 0.12 * Math.sin(t / 50)) + ')'; ctx.fillRect(0, BYY(top()), W, (ROWS - top()) * S); }   // 적 포격 경보: 붉게 번쩍
    // 붕괴 경보: 보드가 붉게 번쩍이고 3초 카운트다운 (조작 불가)
    if (G.collapsing && G.collapsing.cracks) G.collapsing.cracks.forEach(function (c) { var ce = t - G.collapsing.at - c.d; if (ce < 0 || c.y < top()) return; var cimg = V2[c.k ? 'cr_crack2' : 'cr_crack1']; if (cimg) fitImg(cimg, BX(c.x) + S / 2, BYY(c.y) + S / 2, S * 2.4 * Math.min(1, ce / 500), S * 2.4 * Math.min(1, ce / 500), 0.9, c.r); });   /* 땅 균열이 번짐 */
    if (G.collapsing && G.collapsing.step === 0 && V2.cr_vignette) { ctx.save(); ctx.globalAlpha = 0.55 + 0.4 * Math.sin(t / 90); ctx.drawImage(V2.cr_vignette, 0, BYY(top()), W, (ROWS - top()) * S); ctx.restore(); }
    if (G.collapsing && G.collapsing.step === 0) {
      var cel = t - G.collapsing.at, csec = Math.max(1, Math.ceil((3000 - cel) / 1000)), cfl = 0.5 + 0.5 * Math.sin(t / 70);
      ctx.fillStyle = 'rgba(255,20,20,' + (0.18 + 0.22 * cfl) + ')'; ctx.fillRect(0, BYY(top()), W, (ROWS - top()) * S);
      ctx.strokeStyle = 'rgba(255,60,60,' + (0.5 + 0.5 * cfl) + ')'; ctx.lineWidth = 6; ctx.strokeRect(3, BYY(top()) + 3, W - 6, (ROWS - top()) * S - 6);
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = '#000'; ctx.shadowBlur = 10;
      var cy = BYY(top()) + (ROWS - top()) * S / 2, pop = 1 + 0.25 * Math.max(0, 1 - ((3000 - cel) % 1000) / 250);
      ctx.font = '800 ' + Math.round(86 * pop) + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 8; ctx.strokeStyle = '#3a0000'; ctx.strokeText(String(csec), W / 2, cy); ctx.fillStyle = '#ff4040'; ctx.fillText(String(csec), W / 2, cy);
      ctx.font = '800 15px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 5; ctx.strokeText('⚠ 보드 붕괴 ⚠', W / 2, cy - 70); ctx.fillStyle = '#ffd451'; ctx.fillText('⚠ 보드 붕괴 ⚠', W / 2, cy - 70);
      ctx.font = '700 14px Do Hyeon, system-ui'; ctx.lineWidth = 4; ctx.strokeText('전선 2줄 밀림 → 블록 전부 폭파', W / 2, cy + 62); ctx.fillStyle = '#fff'; ctx.fillText('전선 2줄 밀림 → 블록 전부 폭파', W / 2, cy + 62);
      ctx.restore();
    }
    if (G.roundFx && !G.roundFx.reset) { var rp = Math.min(1, (t - G.roundFx.at) / 1700); G.tank.fy = G.tank.y - rp * rp * 9; G.tank.ang = 0; }   /* 적진 점령: 탱크가 전진해 화면 위로 */
    // 탱크
    if (G.lockUntil && t < G.lockUntil) { var lk = 0.6 + 0.4 * Math.sin(t / 60); ctx.save(); ctx.strokeStyle = 'rgba(255,60,50,' + lk + ')'; ctx.lineWidth = 3; ctx.strokeRect(BX(G.tank.fx) + 2, BYY(G.tank.fy) + 2, S - 4, S - 4); if (IMG.ui_cross) fitImg(IMG.ui_cross, BX(G.tank.fx) + S / 2, BYY(G.tank.fy) + S / 2, S * 1.3, S * 1.3, lk); ctx.restore(); }   // 조준당함 표시
    if (G.sel) { if (V2.o_sel) fitImg(V2.o_sel, BX(G.tank.fx) + S / 2, BYY(G.tank.fy) + S / 2, S + 4, S + 4, 0.9); else { ctx.save(); ctx.strokeStyle = 'rgba(200,255,210,.9)'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(BX(G.tank.fx) + 2, BYY(G.tank.fy) + 2, S - 4, S - 4); ctx.setLineDash([]); ctx.restore(); } }
    drawTank(BX(G.tank.fx), BYY(G.tank.fy), S, ['#5f7a3a', '#9bbd55'], true, null, G.tank.ang || 0);
    /* 탱크 밑 체력 막대는 없앰 — 체력은 탱크 그림(부서짐)과 오른쪽 패널로 */
    if (!G.over && !G.roundFx) {                                              /* 탱크 밑: 남은 기름 */
      var bx6 = BX(G.tank.fx) + S / 2, by6 = BYY(G.tank.fy) + S - 2, lab6 = '⛽ ' + G.fuel; ctx.save(); ctx.font = '800 ' + Math.round(S * 0.27) + 'px Black Han Sans, Do Hyeon, system-ui'; var w6 = ctx.measureText(lab6).width + 14, h6 = S * 0.34;
      ctx.fillStyle = G.fuel <= 0 ? 'rgba(120,0,0,.85)' : 'rgba(10,12,8,.85)'; rr(bx6 - w6 / 2, by6 - h6 / 2, w6, h6, h6 / 2); ctx.fill(); ctx.strokeStyle = G.fuel <= 3 ? '#ff7a5a' : '#ffd451'; ctx.lineWidth = 1.5; rr(bx6 - w6 / 2, by6 - h6 / 2, w6, h6, h6 / 2); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = G.fuel <= 3 ? '#ffb3a0' : '#ffe9a0'; ctx.fillText(lab6, bx6, by6 + 1); ctx.restore();
    }
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
      var pe = enemyPlane(); if (pe) { ctx.save(); ctx.translate(e0[0], e0[1]); ctx.rotate(ehead + Math.PI / 2); fitImg(pe, 0, 0, 120, 92, 1, 0); ctx.restore(); }
      ctx.save(); ctx.font = '700 13px Do Hyeon, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#ffb3a8'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('적 정찰기 (탐색 중)', Math.max(58, Math.min(W - 58, e0[0])), e0[1] + 52); ctx.restore();
    }
    // 대전: 전선 교전 연출
    if (G.clash) {
      var cl = G.clash, ca = Math.min(1, (t - cl.at) / 250) * Math.max(0, Math.min(1, (cl.until + 400 - t) / 400)), ly = BYY(G.adv);
      cl.puffs.forEach(function (pf, i) { var ph = ((t - cl.at) / 900 * pf.sp + i) % 1, dimg3 = V2[i % 2 ? 'fx_dust2' : 'fx_dust1']; if (dimg3) fitImg(dimg3, pf.x + Math.sin(t / 300 + i) * 12, ly + pf.dy - ph * 22, pf.r * 3 * (0.6 + ph * 0.6), pf.r * 2.6 * (0.6 + ph * 0.6), 0.75 * ca * (1 - ph * 0.5)); else { ctx.fillStyle = 'rgba(190,170,140,' + (0.55 * ca * (1 - ph * 0.5)) + ')'; ctx.beginPath(); ctx.arc(pf.x, ly + pf.dy - ph * 22, pf.r * (0.6 + ph * 0.6), 0, 7); ctx.fill(); } });
      for (var fi2 = 0; fi2 < 7; fi2++) { var fx2 = ((fi2 * 137 + Math.floor(t / 140) * 53) % W), fy2 = ly + (fi2 % 2 ? -FS * 0.5 : S * 0.4), fon = Math.abs(Math.sin(t / 55 + fi2 * 1.7)); var fim2 = V2[fi2 % 2 ? 'fx_flash2' : 'fx_flash1']; if (fim2 && fon > 0.55) fitImg(fim2, fx2, fy2, S * 0.7, S * 0.7, ca * fon, fi2 % 2 ? Math.PI : 0); else if (!fim2) { ctx.fillStyle = 'rgba(255,220,120,' + (0.9 * ca * fon) + ')'; ctx.beginPath(); ctx.arc(fx2, fy2, 3, 0, 7); ctx.fill(); } }   // 총구 섬광(적은 아래로, 나는 위로)
      if (V2.fx_smoke) for (var sm = 0; sm < 3; sm++) { var smp = ((t - cl.at) / 1600 + sm / 3) % 1; fitImg(V2.fx_smoke, W * (0.2 + sm * 0.3), ly - smp * S * 1.4, S * 0.9, S * 1.9, 0.5 * ca * (1 - smp)); }   // 연기 기둥
      ctx.save(); ctx.globalAlpha = ca; ctx.font = '800 16px Black Han Sans, Do Hyeon, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 5; ctx.strokeStyle = '#1a0a00';
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
      var img = enemy ? (IMG.em_down || IMG.m_down) : (IMG.m_big || IMG.m_down);   // 탄두 방향 고정: 내 포탄은 위(적진), 적 포탄은 아래(내 쪽). 높이는 크기로만 표현
      if (enemy) {                                      // 적 포탄: 떨어질 자리에 붉은 표적이 점점 또렷해진다
        ctx.save(); ctx.globalAlpha = 0.25 + 0.65 * p; ctx.strokeStyle = '#ff4a3a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(BX(m.x) + S / 2, BYY(m.y1) + S / 2, S * (0.5 - 0.15 * p), 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(BX(m.x) + S / 2 - 8, BYY(m.y1) + S / 2); ctx.lineTo(BX(m.x) + S / 2 + 8, BYY(m.y1) + S / 2); ctx.moveTo(BX(m.x) + S / 2, BYY(m.y1) + S / 2 - 8); ctx.lineTo(BX(m.x) + S / 2, BYY(m.y1) + S / 2 + 8); ctx.stroke(); ctx.restore();
      }
      if (img) fitImg(img, px, ry, S * 1.1 * sc, S * 1.7 * sc, 1, (enemy && !IMG.em_down && IMG.m_down == null) ? Math.PI : 0);
      else { ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.arc(px, ry, 8 * sc, 0, 7); ctx.fill(); }
    }
    G.missiles.forEach(function (m) { drawMissile(m, Math.max(0, Math.min(1, (m.y0 - m.y) / Math.max(0.01, m.y0 - m.y1))), t, false); });
    G.incoming.forEach(function (m) { if (m.start) { if (m.hitTank) { m.x = G.tank.x; m.y1 = G.tank.y; } drawMissile(m, Math.max(0, Math.min(1, (t - m.start) / (m.at - m.start))), t, true); } });   // 탱크 표적이면 포탄이 탱크를 따라감
    // 효과
    G.fx.forEach(function (f) {
      var a = Math.max(0, t - f.at);
      if (f.t === 'cell') { var p = a / 700; ctx.fillStyle = 'rgba(255,220,120,' + (0.9 * (1 - p)) + ')'; ctx.fillRect(BX(f.x) + 4 + p * 26, BYY(f.y) + 4 + p * 26, (S - 8) * (1 - p), (S - 8) * (1 - p)); }
      else if ((f.t === 'boomv' || f.t === 'boom') && V2.x_b8) { var fr8 = Math.min(7, Math.floor(a / 90)), key = (f.big ? 'x_b' : 'x_s') + (fr8 + 1), fim = V2[key], bsz = (f.big ? 2.4 : 1.5) * S, bal3 = a > 560 ? Math.max(0, 1 - (a - 560) / 160) : 1, bx3 = f.t === 'boomv' ? f.px : BX(f.x) + S / 2, by3 = f.t === 'boomv' ? f.py : BYY(f.y) + S / 2; if (fim) fitImg(fim, bx3, by3 - bsz * 0.15, bsz, bsz, bal3); }
      else if (f.t === 'boomv' && IMG.boom) { var bs2 = (f.big ? 2 : 1.3) * S * (0.5 + 0.5 * Math.min(1, a / 200)), bal2 = Math.max(0, 1 - a / 700); fitImg(IMG.boom, f.px, f.py, bs2, bs2 * 0.6, bal2); }
      else if (f.t === 'boom' && IMG.boom) { var bs = (f.big ? 2.6 : 1.6) * S * (0.5 + 0.5 * Math.min(1, a / 200)), bal = Math.max(0, 1 - a / 700); fitImg(IMG.boom, BX(f.x) + S / 2, BYY(f.y) + S / 2, bs, bs * 0.6, bal); }
      else if (f.t === 'flash' && IMG.fx_line) { var fal = Math.max(0, 1 - a / 600); f.rows.forEach(function (ry) { fitImg(IMG.fx_line, W / 2, BYY(ry) + S / 2, W * 1.05, S * 1.6, fal); }); f.cols.forEach(function (cx) { fitImg(IMG.fx_line, BX(cx) + S / 2, BYY((top() + ROWS) / 2), ROWS * S, S * 1.6, fal, Math.PI / 2); }); }
      else if (f.t === 'boom') { var r = (f.big ? 50 : 26) * Math.min(1, a / 250), al = 1 - a / 700; ctx.fillStyle = 'rgba(255,140,30,' + al * 0.8 + ')'; ctx.beginPath(); ctx.arc(BX(f.x) + S / 2, BYY(f.y) + S / 2, r, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,240,180,' + al + ')'; ctx.beginPath(); ctx.arc(BX(f.x) + S / 2, BYY(f.y) + S / 2, r * 0.45, 0, 7); ctx.fill(); }
      else if (f.t === 'shieldHit') { var sal = Math.max(0, 1 - a / 650), scx = f.px != null ? f.px : BX(G.tank.fx) + S / 2, scy = f.py != null ? f.py : BYY(G.tank.fy) + S / 2, ssz = f.sz || 1; if (V2.sh_break) fitImg(V2.sh_break, scx, scy - S * 0.12, S * ssz * (1.65 + a / 500), S * ssz * (1.2 + a / 700), sal); else { ctx.save(); ctx.strokeStyle = 'rgba(255,212,81,' + sal + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(scx, scy, S * (0.7 + a / 500), 0, 7); ctx.stroke(); ctx.restore(); } }
      else if (f.t === 'score') {                                                       /* 0~420ms: 숫자가 0부터 굴러 올라가며 쾅 튀어 오름 + 별가루 → 420~1050ms: 꼬리 반짝이 끌며 점수판으로 */
        var sp2 = scorePos(), tier = f.n >= 800 ? 3 : f.n >= 300 ? 2 : 1, fsz = [0, 30, 40, 52][tier], px2, py2, scl, al2 = 1, rot = 0, shown = f.n;
        if (a < 420) { var q0 = a / 420, bounce = q0 < 0.35 ? q0 / 0.35 * 1.6 : 1.6 - Math.sin((q0 - 0.35) / 0.65 * Math.PI) * 0.25 - (q0 - 0.35) * 0.55; scl = Math.max(0.3, bounce); px2 = f.x; py2 = f.y - q0 * 34; rot = Math.sin(a / 40) * 0.08 * (1 - q0); shown = Math.min(f.n, Math.round(f.n * Math.min(1, q0 * 1.6))); }
        else { var q1 = Math.min(1, (a - 420) / 630), e1 = q1 * q1 * (3 - 2 * q1); scl = 1.05 - e1 * 0.6; px2 = f.x + (sp2.x - 30 - f.x) * e1; py2 = (f.y - 34) + (sp2.y - (f.y - 34)) * e1 - Math.sin(e1 * Math.PI) * 60; al2 = 1 - Math.max(0, q1 - 0.88) / 0.12;
          f.tr = f.tr || []; if (!f.lt || t - f.lt > 25) { f.tr.push({ x: px2, y: py2, at: t }); f.lt = t; }
          if (q1 >= 1 && !f.hit) { f.hit = 1; G.scorePulse = t; G.scoreTier = tier; sfx('gain', 3); } }
        if (f.tr) f.tr.forEach(function (q) { var qa = 1 - (t - q.at) / 300; if (qa > 0) { ctx.fillStyle = 'rgba(255,' + (200 + Math.round(55 * qa)) + ',90,' + qa + ')'; ctx.beginPath(); ctx.arc(q.x + (Math.random() - 0.5) * 6, q.y + (Math.random() - 0.5) * 6, 2 + 3 * qa * tier / 2, 0, 7); ctx.fill(); } });   /* 날아가는 꼬리 */
        if (a < 650) { var nb = 8 + tier * 6; for (var bi = 0; bi < nb; bi++) { var ang = bi / nb * Math.PI * 2 + f.n, rr2 = (14 + a / (5 - tier)) * (0.7 + 0.3 * ((bi * 7) % 3)); ctx.fillStyle = bi % 3 ? 'rgba(255,215,90,' + (1 - a / 650) + ')' : 'rgba(255,255,230,' + (1 - a / 650) + ')'; var bx5 = f.x + Math.cos(ang) * rr2, by5 = f.y - 10 + Math.sin(ang) * rr2 * 0.75; ctx.save(); ctx.translate(bx5, by5); ctx.rotate(a / 90 + bi); ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore(); } }   /* 별가루 폭발 */
        if (tier === 3 && a < 260) { ctx.save(); ctx.globalAlpha = 0.35 * (1 - a / 260); ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.arc(f.x, f.y - 10, 30 + a / 2, 0, 7); ctx.fill(); ctx.restore(); }   /* 큰 점수: 번쩍 */
        ctx.save(); ctx.globalAlpha = al2; ctx.translate(px2, py2); ctx.rotate(rot); ctx.scale(scl, scl); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '800 ' + fsz + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 6; ctx.strokeStyle = '#2a1400'; ctx.shadowColor = '#ffb020'; ctx.shadowBlur = 10 + tier * 6; ctx.strokeText('+' + shown, 0, 0); var g5 = ctx.createLinearGradient(0, -fsz / 2, 0, fsz / 2); g5.addColorStop(0, '#ffffff'); g5.addColorStop(0.45, '#ffe680'); g5.addColorStop(1, '#ff9a10'); ctx.fillStyle = g5; ctx.fillText('+' + shown, 0, 0);
        if (f.label && a < 750) { ctx.shadowBlur = 6; ctx.font = '800 ' + (14 + tier * 3) + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 4; ctx.strokeText(f.label, 0, -fsz * 0.9); ctx.fillStyle = tier === 3 ? '#ff8a5a' : '#ffe9a0'; ctx.fillText(f.label, 0, -fsz * 0.9); }
        ctx.restore();
      }
      else if (f.t === 'deny') { var dp2 = a / 600, jx = Math.sin(a / 22) * 5 * (1 - dp2), dx2 = BX(f.x) + jx, dy2 = BYY(f.y); ctx.save(); ctx.globalAlpha = 1 - dp2; ctx.fillStyle = 'rgba(255,40,30,.35)'; ctx.fillRect(dx2 + 3, dy2 + 3, S - 6, S - 6); ctx.strokeStyle = '#ff4a3a'; ctx.lineWidth = 3; ctx.strokeRect(dx2 + 3, dy2 + 3, S - 6, S - 6); ctx.beginPath(); ctx.moveTo(dx2 + S * 0.3, dy2 + S * 0.3); ctx.lineTo(dx2 + S * 0.7, dy2 + S * 0.7); ctx.moveTo(dx2 + S * 0.7, dy2 + S * 0.3); ctx.lineTo(dx2 + S * 0.3, dy2 + S * 0.7); ctx.stroke(); ctx.restore(); }
      else if (f.t === 'dead') { var dimg2 = f.enemy ? V2['s_' + oppFacKey() + '_fdead'] : V2['s_' + (G.fac || 'solar') + '_dead']; if (dimg2) { var dk = solK(!f.enemy, S * 0.8), ddw = dimg2.width * dk, ddh = dimg2.height * dk; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, a - 900) / 600); ctx.drawImage(dimg2, f.px - ddw / 2, f.py - ddh / 2, ddw, ddh); ctx.restore(); } }
      else if (f.t === 'debris') { var dp = Math.min(1, a / (f.life || 900)); if (V2.cr_debris) fitImg(V2.cr_debris, f.px, f.py - dp * 30, S * (1 + dp * 1.4), S * (1 + dp * 1.4), 1 - dp, f.rot + dp * 1.5); }
      else if (f.t === 'pop') { ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (a - 550) / 450); ctx.font = '700 ' + (f.size || 15) + 'px Do Hyeon, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; var fy = f.y - a / 40; ctx.strokeText(f.text, f.x, fy); ctx.fillStyle = f.col || '#fff'; ctx.fillText(f.text, f.x, fy); ctx.restore(); }
    });
    // 배너: 큰 사건은 보드 가운데 어두운 띠 위에 하나씩
    if (G.msg) {
      var mA = t - G.msg.at, mIn = Math.min(1, mA / 120), mOut = Math.max(0, Math.min(1, (1150 - mA) / 250)), mal = mIn * mOut, by2 = BYY(top()) + (ROWS - top()) * S * 0.38;
      ctx.save(); ctx.globalAlpha = mal; var bcol = G.msg.col || '#ffd451', bimg2 = V2[bcol === '#ff5a4a' || bcol === '#ff8a7a' ? 'ban_red' : bcol === '#9be37a' ? 'ban_green' : 'ban_gold'];
      if (bimg2) ctx.drawImage(bimg2, -6, by2 - 30, W + 12, 60); else { ctx.fillStyle = 'rgba(8,10,6,.72)'; ctx.fillRect(0, by2 - 24, W, 48); ctx.fillStyle = bcol; ctx.fillRect(0, by2 - 24, W, 2); ctx.fillRect(0, by2 + 22, W, 2); }
      ctx.font = '800 20px Black Han Sans, Do Hyeon, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = G.msg.col || '#ffd451'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
      ctx.save(); ctx.translate(W / 2, by2); ctx.scale(1 + 0.08 * (1 - mIn), 1 + 0.08 * (1 - mIn)); ctx.fillText(G.msg.text, 0, 0); ctx.restore(); ctx.restore();
    }
    if (G.roundFx) {                                                        /* 다음 전장으로: 어두워졌다 밝아짐 + 글씨 */
      var ra2 = t - G.roundFx.at, ov = ra2 < 1200 ? Math.max(0, (ra2 - 700) / 500) : ra2 < 1900 ? 1 : Math.max(0, 1 - (ra2 - 1900) / 500);
      ctx.save(); ctx.globalAlpha = ov * 0.92; ctx.fillStyle = '#05060a'; ctx.fillRect(0, EY, W, HY - EY); ctx.restore();
      if (ov > 0.2) { ctx.save(); ctx.globalAlpha = Math.min(1, ov); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 30px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(G.roundFx.title || '다음 전장', W / 2, (EY + HY) / 2 - 16); ctx.fillStyle = '#ffd451'; ctx.fillText(G.roundFx.title || '다음 전장', W / 2, (EY + HY) / 2 - 16);
        ctx.font = '700 15px Do Hyeon, system-ui'; ctx.lineWidth = 4; ctx.strokeText(G.roundFx.sub || '', W / 2, (EY + HY) / 2 + 18); ctx.fillStyle = '#fff'; ctx.fillText(G.roundFx.sub || '', W / 2, (EY + HY) / 2 + 18); ctx.restore(); }
    }
    drawHud(t); drawScore(t); drawTray(t); if (G.demo && window.DEMO) DEMO.draw(t); try { drawPanel(t); drawReroll(t); } catch (e) { ctx.setTransform(scale * dpr, 0, 0, scaleY * dpr, 0, 0); ctx.translate(OFFX, OFFY); }   // 패널 그리기 오류가 게임을 멈추지 않게
    drawHint(t); drawIntro(t);
    if (G.drag && G.drag.px != null) { var d2 = G.drag; d2.p.cells.forEach(function (c) { drawBlock(d2.ox + c.dx * S, d2.oy + c.dy * S, S, c.r, 0.85); }); }
    if (G.dragInf) {
      var di = G.dragInf;
      if (di.col != null) { ctx.fillStyle = 'rgba(160,255,160,.22)'; ctx.fillRect(BX(di.col) + 2, EY, S - 4, HY - EY); ctx.fillStyle = 'rgba(255,230,120,.5)'; ctx.fillRect(BX(di.col) + 2, EY, S - 4, 6); }
      ctx.save(); ctx.globalAlpha = 0.9; drawSoldier(di.px - S / 2, di.py - S - 20, S, true); ctx.restore();
    }
  }
  var vortexRot = 0;
  function drawStorm(y0, h, t, strong) {                        // 폭풍우: 어두운 하늘 + 소용돌이 + 비 + 구름 + 물보라 + 번쩍임 (y0~y0+h 구역)
    ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, h); ctx.clip();
    ctx.fillStyle = 'rgba(10,30,60,' + (strong ? 0.42 : 0.36) + ')'; ctx.fillRect(0, y0, W, h);
    var vx = V2.st_vortex || IMG.x_vortex;
    if (vx) { ctx.save(); ctx.globalAlpha = 0.45; ctx.translate(W / 2, y0 + h / 2); ctx.rotate(t / 700); var vs = Math.min(W, h) * 1.05; ctx.drawImage(vx, -vs / 2, -vs * 0.42, vs, vs * 0.84); ctx.restore(); }
    if (V2.st_rain) { var rw = W / 2, rh = rw * V2.st_rain.height / V2.st_rain.width, off = (t / 2.2) % rh; ctx.save(); ctx.globalAlpha = 0.7; for (var ry = y0 - rh + off; ry < y0 + h; ry += rh) for (var rx = 0; rx < W; rx += rw) ctx.drawImage(V2.st_rain, rx, ry, rw, rh); ctx.restore(); }
    else { ctx.strokeStyle = 'rgba(190,220,255,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (var i = 0; i < 60; i++) { var rx2 = ((i * 97 + t / 3) % (W + 40)) - 20, ry2 = y0 + ((i * 53 + t / 1.6) % (h + 30)) - 15; ctx.moveTo(rx2, ry2); ctx.lineTo(rx2 - 6, ry2 + 18); } ctx.stroke(); }
    if (V2.st_splash) for (var si = 0; si < 5; si++) { var slot = Math.floor(t / 380) + si * 7, sp = ((t / 380) % 1), sx = ((slot * 137) % 97) / 97 * W, sy = y0 + h * (0.2 + (((slot * 61) % 89) / 89) * 0.75); fitImg(V2.st_splash, sx, sy, S * (0.6 + sp * 0.5), S * (0.6 + sp * 0.5), 0.75 * (1 - sp)); }
    if (V2.st_cloud) for (var ci = 0; ci < 4; ci++) { var cw = W * 0.55, cxp = ((t / 40 + ci * W * 0.38) % (W + cw)) - cw / 2; fitImg(V2.st_cloud, cxp, y0 + 10 + (ci % 2) * 18, cw, cw * 0.6, 0.85); }
    var fl = Math.sin(t / 130) > 0.97 || Math.sin(t / 311) > 0.985; if (fl) { ctx.fillStyle = 'rgba(220,235,255,.35)'; ctx.fillRect(0, y0, W, h); }
    ctx.restore();
  }
  function drawBolt(x, py, a) {                                  // 벼락: 위에서 (x열, py) 로 내리꽂힘 + 바닥 섬광 (그림 3종 중 열마다 다른 것)
    var px = BX(x) + S / 2, k = Math.min(1, a / 110), fade = Math.max(0, 1 - Math.max(0, a - 250) / 450), bimg = V2['bolt' + (1 + (x % 3))] || IMG.x_bolt;
    ctx.save(); ctx.globalAlpha = fade;
    if (bimg) { var bh = (py - EY + 20) * k, bw = Math.min(S * 1.4, bh * bimg.width / bimg.height * 1.2); ctx.drawImage(bimg, px - bw / 2 + Math.sin(a / 40) * 3, py - bh, bw, bh); }
    else { ctx.strokeStyle = '#e8d8ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, EY); ctx.lineTo(px, py); ctx.stroke(); }
    if (a > 90) { if (V2.bolt_flash) { var fs2 = S * (1.2 + 0.9 * Math.min(1, (a - 90) / 220)); fitImg(V2.bolt_flash, px, py, fs2 * 1.4, fs2, 1); } else { var br = S * (0.4 + 0.6 * Math.min(1, (a - 100) / 200)); var g = ctx.createRadialGradient(px, py, 0, px, py, br); g.addColorStop(0, 'rgba(240,225,255,.9)'); g.addColorStop(1, 'rgba(160,90,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, br, 0, 7); ctx.fill(); } }
    ctx.restore();
  }
  function drawShield(cx, cy, hp, t, alpha) {                    // 태양 방패: 2겹=또렷한 돔, 1겹=금 간 돔
    if (hp <= 0) return; var a = (alpha == null ? 1 : alpha) * (0.82 + 0.18 * Math.sin(t / 180)), dimg = V2.sh_2 || IMG.x_dome;
    if (dimg) fitImg(dimg, cx, cy - S * 0.12, S * 1.65, S * 1.2, a * 0.95);
    else { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ffd451'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, S * 0.62, 0, 7); ctx.stroke(); ctx.restore(); }
  }
  function drawSolDome(cx, footY, t) { var im = V2.sh_2 || IMG.x_dome; if (im) fitImg(im, cx, footY - S * 0.42, S * 0.95, S * 0.8, 0.75 + 0.15 * Math.sin(t / 160)); }
  function drawSun(y0, h, t, until, strong) {                    // 솔라 햇살: 금빛으로 물들고 위에서 빛줄기가 쏟아짐 (오션 럼블과 같은 그림)
    var left = until - t, a = Math.min(1, (SOLAR_MS - left) / 300) * Math.min(1, left / 500); if (a <= 0) return;
    ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, h); ctx.clip();
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = (strong ? 0.5 : 0.35) * a; ctx.fillStyle = '#ffb000'; ctx.fillRect(0, y0, W, h);
    ctx.globalCompositeOperation = 'lighter';
    if (V2.solar_rays) { var rw = W * 1.3, rh = Math.max(rw * V2.solar_rays.height / V2.solar_rays.width, h + 120), sway = Math.sin(t / 900) * 12; ctx.globalAlpha = a * (strong ? 0.6 : 0.4) * (0.85 + 0.15 * Math.sin(t / 300)); ctx.drawImage(V2.solar_rays, (W - rw) / 2 + sway, y0 - 60, rw, rh); }
    for (var i = 0; i < 18; i++) { var q = ((t / 1800 + i / 18) % 1), sx = ((i * 97) % 89) / 89 * W, sy = y0 + h * (1 - q); ctx.globalAlpha = a * 0.8 * Math.sin(q * Math.PI); ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(sx + Math.sin(t / 400 + i) * 8, sy, 1.6 + (i % 3), 0, 7); ctx.fill(); }   /* 떠오르는 빛 알갱이 */
    ctx.restore();
  }
  function drawSkillFx(t) {
    if (t < G.stormMine) drawStorm(BYY(top()), (ROWS - top()) * S, t, true);                      // 내 땅의 폭풍우(서지)
    if (t < G.stormOpp) { drawStorm(EY, fogH(), t, false); ctx.save(); ctx.font = '700 12px Do Hyeon, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#bfe3ff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('폭풍우 — 정찰 불가 ' + Math.ceil((G.stormOpp - t) / 1000) + 's', W / 2, EY + 4); ctx.restore(); }
    G.bolts.forEach(function (b) { if (t >= b.at) drawBolt(b.x, b.py, t - b.at); });
    if (G.shield > 0) drawShield(BX(G.tank.fx) + S / 2, BYY(G.tank.fy) + S / 2, G.shield, t);
    if (G.oppShield > 0 && G.oppTank && (t < G.scoutUntil || (G.reveal && t < G.reveal.until))) drawShield(BX(COLS - 1 - G.oppTank.x) + S / 2, rowC(-1 - G.oppTank.y), G.oppShield, t, 0.8);
    if (G.crash) {                                                                                   // 내 정찰기 추락: 폭풍우 속으로 들어서자마자 그 자리에서 폭발
      var ca = t - G.crash.at, cx0 = W * 0.3 + Math.min(ca, 450) / 450 * W * 0.12, cy0 = BYY(G.adv) - 20 - Math.sin(Math.min(1, ca / 450) * Math.PI / 2) * 60;
      if (ca < 450) { var pimg = IMG.u_plane; if (pimg) { ctx.save(); ctx.translate(cx0, cy0); ctx.rotate(Math.sin(ca / 60) * 0.12); fitImg(pimg, 0, 0, 110, 84, 1, 0); ctx.restore(); } }
      else if (!G.crash.boom) { G.crash.boom = 1; G.fx.push({ t: 'boomv', px: cx0, py: cy0, at: t, big: true }); G.shake = 6; G.shakeUntil = t + 250; sfx('boom', false); }
    }
    if (G.ultFx && t - G.ultFx.at < 700) { var ua = 1 - (t - G.ultFx.at) / 700; ctx.fillStyle = G.ultFx.col; ctx.save(); ctx.globalAlpha = 0.35 * ua; ctx.fillRect(0, EY, W, HY - EY); ctx.restore(); }
  }
  var ULTB = null, HELPB = null, REROLLB = null;                  // 내 문장(필살기 버튼) 영역 / 도움말 버튼 / 블록 교체 버튼
  function useReroll() {                                          // 블록 3개를 전부 새로 뽑음 (한 게임 3번)
    if (G.over || G.drag || G.collapsing || G.sweep) return;
    if (G.reroll <= 0) { sfx('bad'); G.fx.push({ t: 'pop', text: '교체 횟수 없음', x: W / 2, y: TY + TRAY / 2, at: now(), big: false, col: '#ff8a7a' }); return; }
    G.reroll--; G.tray = [makePiece(), makePiece(), makePiece()]; sfx('pick'); G.fx.push({ t: 'pop', text: '블록 교체 (남은 ' + G.reroll + '회)', x: W / 2, y: TY + TRAY / 2, at: now(), big: false, col: '#ffd451' }); checkFit();
  }
  var PANEL_STYLE = (function () { try { var q = /[?&]panel=([ABC])/.exec(location.search); if (q) { localStorage.setItem('tank_panel', q[1]); return q[1]; } return localStorage.getItem('tank_panel') || 'C'; } catch (e) { return 'A'; } })();   /* ?panel=B 로 시안 고르기 */
  function drawReroll(t) {                                        // 블록 교체 버튼: 패널 맨 아래(바닥 버튼 띠와 같은 높이)
    var bw = PW - 16, bh = Math.min(BBAR + 12, bw / 2.44, 80), bx = W + 8, by = OY + (BBAR - bh) / 2; REROLLB = { x: bx, y: by, w: bw, h: bh };
    var on = G.reroll > 0 && !G.over;
    if (V2.btn_reroll_on) { ctx.drawImage(on ? V2.btn_reroll_on : V2.btn_reroll_off, bx, by, bw, bh); }
    else { var gg = ctx.createLinearGradient(bx, by, bx, by + bh); gg.addColorStop(0, on ? '#ffe284' : '#6b6f60'); gg.addColorStop(1, on ? '#e8a21a' : '#3e4138'); rr(bx, by, bw, bh, 10); ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = on ? '#ffd451' : '#2a2c24'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(255,220,120,.6)'; ctx.shadowBlur = on ? 6 : 0;
    var fsz = Math.round(V2.btn_reroll_on ? Math.min(bh * 0.36, bw / 9) : Math.min(bh * 0.5, bw / 6.5));
    ctx.font = '800 ' + fsz + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 4; ctx.strokeStyle = '#1a1000'; var lbl = (bw < 150 ? '교체 ×' : '블록 교체  ×') + G.reroll, lx = V2.btn_reroll_on ? bx + bw * 0.62 : bx + bw / 2; ctx.strokeText(lbl, lx, by + bh / 2 + 1); ctx.fillStyle = on ? '#ffe28a' : '#777'; ctx.fillText(lbl, lx, by + bh / 2 + 1); ctx.restore();
  }
  // ---------- 오른쪽 패널 부품 ----------
  function pFrame(y, h) { if (V2.ui_card) { ctx.save(); ctx.globalAlpha = 0.92; ctx.drawImage(V2.ui_card, W + 3, y, PW - 6, h); ctx.restore(); } else { ctx.fillStyle = 'rgba(0,0,0,.3)'; rr(W + 4, y, PW - 8, h, 8); ctx.fill(); ctx.strokeStyle = '#8a7a3a'; ctx.lineWidth = 2; ctx.stroke(); } }
  function pTitle(txt, y, col, size) { ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '800 ' + (size || 13) + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(txt, W + PW / 2, y); ctx.fillStyle = col; ctx.fillText(txt, W + PW / 2, y); ctx.restore(); }
  function pHp(cx, y, w, hp, horizontal, sh) {                    // 체력 3칸: 금테 바 그림. 방패(sh)가 있으면 맨 위 남은 칸이 금색
    var n = HP_MAX, gap = 4;
    function seg(i, x, yy, ww, hh) {
      var on = i < hp, gold = sh > 0 && i === hp - 1;
      if (V2.ui_hp_on) { ctx.drawImage(on && !gold ? V2.ui_hp_on : V2.ui_hp_off, x, yy, ww, hh); if (gold) { var gg = ctx.createLinearGradient(0, yy, 0, yy + hh); gg.addColorStop(0, '#fff2a8'); gg.addColorStop(1, '#e0a21a'); ctx.fillStyle = gg; rr(x + ww * 0.1, yy + hh * 0.25, ww * 0.8, hh * 0.5, 3); ctx.fill(); ctx.save(); ctx.shadowColor = '#ffd451'; ctx.shadowBlur = 8; ctx.strokeStyle = 'rgba(255,230,140,.9)'; ctx.lineWidth = 1.5; rr(x + ww * 0.1, yy + hh * 0.25, ww * 0.8, hh * 0.5, 3); ctx.stroke(); ctx.restore(); } }
      else { ctx.fillStyle = gold ? '#ffd451' : on ? '#ff5050' : 'rgba(0,0,0,.5)'; rr(x, yy, ww, hh, 4); ctx.fill(); }
    }
    if (horizontal) { var sw = (w - gap * (n - 1)) / n, shh = Math.min(sw / 3, 22); for (var i = 0; i < n; i++) seg(i, cx - w / 2 + i * (sw + gap), y, sw, shh); return shh; }
    var sh2 = Math.min(w / 3, 18); for (var j = 0; j < n; j++) seg(j, cx - w / 2, y + (n - 1 - j) * (sh2 + gap), w, sh2); return (sh2 + gap) * n - gap;
  }
  function pEmblem(f, cx, cy, E, ult, mine, t) {                  // 문장 = 필살기 게이지(아래서 차오름). 가득 차면 빛남. 눌림 영역을 돌려줌
    var full = ult >= ULT_MAX, fr = Math.min(1, ult / ULT_MAX);
    if (f && IMG[f.img]) {
      var pulse = full ? 0.5 + 0.5 * Math.sin(t / 160) : 0;
      fitImg(IMG[f.img], cx, cy, E, E, 0.2, 0);
      ctx.save(); ctx.beginPath(); ctx.rect(cx - E / 2, cy + E / 2 - E * fr, E, E * fr); ctx.clip(); fitImg(IMG[f.img], cx, cy, E, E, 1, 0); ctx.restore();
      if (fr > 0 && fr < 1) { ctx.fillStyle = f.col; ctx.globalAlpha = 0.8; ctx.fillRect(cx - E / 2, cy + E / 2 - E * fr - 1, E, 2); ctx.globalAlpha = 1; }
      if (full && IMG[f.img + '_glow']) fitImg(IMG[f.img + '_glow'], cx, cy, E + 12 + 8 * pulse, E + 12 + 8 * pulse, 1, 0);
      else if (full) { ctx.save(); ctx.shadowColor = f.col; ctx.shadowBlur = 16 + 10 * pulse; ctx.strokeStyle = f.col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, E / 2 + 4, 0, 7); ctx.stroke(); ctx.restore(); }
      var lab = full ? (mine ? '▶ ' + f.skill : f.skill + ' 준비됨') : (f.skill + ' ' + ult + '/' + ULT_MAX);
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = (full ? '800 ' : '600 ') + Math.round(Math.max(11, Math.min(15, E * 0.13))) + 'px ' + (full ? 'Black Han Sans, ' : '') + 'Do Hyeon, system-ui'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(lab, cx, cy + E / 2 + 6); ctx.fillStyle = full ? f.col : '#cfd6bf'; ctx.fillText(lab, cx, cy + E / 2 + 6); ctx.restore();
    } else { ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 12px Do Hyeon, system-ui'; ctx.fillStyle = '#6b7a52'; ctx.fillText('세력 ?', cx, cy); ctx.restore(); }
    return { x: cx - E / 2 - 8, y: cy - E / 2 - 8, w: E + 16, h: E + 34 };
  }
  function pGauge(y0, gh, t) {                                    // 전선 게이지: 넓은 세로 막대, 위 붉은(상대 땅) 아래 초록(내 땅), 퍼센트는 막대 안에
    var tot = EROWS + ROWS, lineRow = EROWS + G.adv, myPct = Math.round((ROWS - G.adv) / tot * 100), oppPct = 100 - myPct, cx = W + PW / 2;
    var gw = Math.min(PW - 24, gh * 0.29 * 2.2), gx0 = cx - gw / 2, inset = gw * 0.2, iy0 = y0 + gh * 0.075, ih = gh * 0.85, lineY = iy0 + ih * (lineRow / tot), ix = gx0 + inset, iw = gw - inset * 2;
    var gr = ctx.createLinearGradient(0, iy0, 0, lineY); gr.addColorStop(0, '#5a1410'); gr.addColorStop(1, '#ff5a4a'); ctx.fillStyle = gr; ctx.fillRect(ix, iy0, iw, lineY - iy0);
    var gg2 = ctx.createLinearGradient(0, lineY, 0, iy0 + ih); gg2.addColorStop(0, '#9be37a'); gg2.addColorStop(1, '#1f4a14'); ctx.fillStyle = gg2; ctx.fillRect(ix, lineY, iw, iy0 + ih - lineY);
    for (var gi = 1; gi < tot; gi++) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(ix, iy0 + ih * gi / tot, iw, 1); }
    ctx.fillStyle = '#fff'; ctx.fillRect(ix - 2, lineY - 1.5, iw + 4, 3);
    if (V2.ui_vgauge) ctx.drawImage(V2.ui_vgauge, gx0, y0, gw, gh); else { ctx.strokeStyle = '#8a7a3a'; ctx.lineWidth = 2; ctx.strokeRect(gx0, y0, gw, gh); }
    var fs = Math.round(Math.max(13, Math.min(22, iw * 0.3)));
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = '#000';
    ctx.font = '800 ' + fs + 'px Black Han Sans, Do Hyeon, system-ui';
    ctx.strokeText(oppPct + '%', cx, iy0 + ih * 0.1); ctx.fillStyle = '#ffd9d3'; ctx.fillText(oppPct + '%', cx, iy0 + ih * 0.1);
    ctx.strokeText(myPct + '%', cx, iy0 + ih * 0.9); ctx.fillStyle = '#e4ffd6'; ctx.fillText(myPct + '%', cx, iy0 + ih * 0.9);
    ctx.font = '700 ' + Math.round(fs * 0.62) + 'px Do Hyeon, system-ui'; ctx.lineWidth = 3;
    ctx.strokeText('적 영역', cx, iy0 + ih * 0.1 + fs * 0.9); ctx.fillStyle = '#ffb3a8'; ctx.fillText('적 영역', cx, iy0 + ih * 0.1 + fs * 0.9);
    ctx.strokeText('아군 영역', cx, iy0 + ih * 0.9 - fs * 0.9); ctx.fillStyle = '#c8f5b0'; ctx.fillText('아군 영역', cx, iy0 + ih * 0.9 - fs * 0.9); ctx.restore();
  }
  function drawPanel(t) {                                         // 오른쪽 정보 패널 (PANEL_STYLE A/B/C)
    var x0 = W, g = ctx.createLinearGradient(x0, 0, x0 + PW, 0); g.addColorStop(0, '#15170f'); g.addColorStop(1, '#23261b'); ctx.fillStyle = g; ctx.fillRect(x0, -OFFY, PW, HL);
    ctx.fillStyle = '#3a3e32'; ctx.fillRect(x0, -OFFY, 2, HL);
    if (OFFY > 0) { ctx.fillStyle = '#1b1d16'; ctx.fillRect(0, -OFFY, W, OFFY); ctx.fillRect(0, H, W, OFFY + 1); }
    if (OFFX > 0) { ctx.fillStyle = '#0b0d0a'; ctx.fillRect(-OFFX, -OFFY, OFFX, HL); ctx.fillRect(WT, -OFFY, OFFX + 2, HL); }
    var o = (window.NET && NET.opp()) || {}, ohp = o.hp == null ? HP_MAX : o.hp, of = FAC[o.fac] || null, oult = o.ult | 0, cx = x0 + PW / 2;
    var gbH = Math.max(34, Math.min(56, EY + OFFY - 8)), gbY = Math.max(-OFFY + 4, EY - gbH - 4);   /* 상대 카드 위 빈 칸: 가이드(HOW TO PLAY) 켜기/끄기 */
    TGL = TGL || {}; TGL.gd = { x: x0 + 6, y: gbY, w: PW - 12, h: gbH }; var gon = true, gb2 = TGL.gd;
    if (V2.btn_guide_on && V2.btn_guide_off) ctx.drawImage(gon ? V2.btn_guide_on : V2.btn_guide_off, gb2.x, gb2.y, gb2.w, gb2.h);
    else { var gg8 = ctx.createLinearGradient(0, gb2.y, 0, gb2.y + gb2.h); gg8.addColorStop(0, gon ? '#ffe284' : '#5e6152'); gg8.addColorStop(1, gon ? '#e8a21a' : '#33362c'); ctx.save(); if (gon) { ctx.shadowColor = 'rgba(255,212,81,' + (0.5 + 0.4 * Math.sin(t / 300)) + ')'; ctx.shadowBlur = 12; } rr(gb2.x, gb2.y, gb2.w, gb2.h, 10); ctx.fillStyle = gg8; ctx.fill(); ctx.restore(); ctx.strokeStyle = gon ? '#fff2a8' : '#777'; ctx.lineWidth = 2; rr(gb2.x, gb2.y, gb2.w, gb2.h, 10); ctx.stroke(); }
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; function fitTxt(tx, max, sz, wt, fam) { var z = sz; do { ctx.font = wt + ' ' + z + 'px ' + fam; if (ctx.measureText(tx).width <= max) break; z--; } while (z > 8); }
    fitTxt('💡 HOW TO PLAY', gb2.w - 12, Math.round(gb2.h * 0.36), '800', 'Black Han Sans, Do Hyeon, system-ui'); ctx.fillStyle = gon ? '#2a1a00' : '#bbb'; ctx.fillText('💡 HOW TO PLAY', gb2.x + gb2.w / 2, gb2.y + gb2.h * 0.36);
    fitTxt('이기는 방법 보기', gb2.w - 12, Math.round(gb2.h * 0.3), '700', 'Do Hyeon, system-ui'); ctx.fillStyle = '#5a3b00'; ctx.fillText('이기는 방법 보기', gb2.x + gb2.w / 2, gb2.y + gb2.h * 0.73); ctx.restore();
    var top0 = EY + 4, bot0 = OY - 8, avail = bot0 - top0, inner = PW - 24;   // 패널 쓸 수 있는 세로 (교체 버튼은 바닥 띠에)
    ULTB = null;
    var ttl = 28;                                                // 제목 띠 높이. 카드 높이는 내용물 크기에서 계산하고 남는 세로는 전선 게이지가 가져감
    if (PANEL_STYLE === 'B') {                                    // B: 상대(탱크+체력+작은 문장) / 나(큰 문장) / 전선(아래)
      var twB = Math.min(inner * 0.42, 64), eOB = Math.min(inner * 0.42, 70), hO = ttl + Math.max(twB * 1.2, 60) + eOB + 36;
      pFrame(top0, hO); pTitle('상대 ' + (o.name || ''), top0 + 10, '#ff8a7a');
      if (IMG.u_tank_e) fitImg(IMG.u_tank_e, x0 + 14 + twB / 2, top0 + ttl + twB * 0.6, twB, twB * 1.15, 1, 0);
      pHp(x0 + 14 + twB + 8 + (inner - twB - 8) / 2, top0 + ttl + 2, inner - twB - 8, ohp, false, o.shield | 0);
      pEmblem(of, cx, top0 + hO - eOB / 2 - 26, eOB, oult, false, t);
      var EB = Math.min(inner * 0.84, 150), hM = ttl + 22 + 12 + EB + 40, yM = top0 + hO + 10;
      pFrame(yM, hM); pTitle('나 · ' + fac().name, yM + 10, '#9be37a');
      var shB = pHp(cx, yM + ttl, inner * 0.8, G.tank.hp, true, G.shield); ULTB = pEmblem(fac(), cx, yM + ttl + shB + 12 + EB / 2, EB, G.ult, true, t);
      var yG = yM + hM + 10, hG = bot0 - yG; if (hG > 60) pGauge(yG, hG, t);
    } else if (PANEL_STYLE === 'C') {                             // C: 문장 둘만 크게(위 상대·아래 나), 사이에 전선. 탱크 그림 없음
      var E1 = Math.min(inner * 0.72, 120), hC = ttl + 22 + 10 + E1 + 40;
      pFrame(top0, hC); pTitle('상대 ' + (o.name || ''), top0 + 10, '#ff8a7a'); var shO = pHp(cx, top0 + ttl, inner * 0.8, ohp, true, o.shield | 0);
      pEmblem(of, cx, top0 + ttl + shO + 10 + E1 / 2, E1, oult, false, t);
      var E2 = Math.min(inner * 0.84, 150), hC2 = ttl + 22 + 10 + E2 + 40, yC = bot0 - hC2;
      pFrame(yC, hC2); pTitle('나 · ' + fac().name, yC + 10, '#9be37a'); var shM = pHp(cx, yC + ttl, inner * 0.8, G.tank.hp, true, G.shield);
      ULTB = pEmblem(fac(), cx, yC + ttl + shM + 10 + E2 / 2, E2, G.ult, true, t);
      var yG2 = top0 + hC + 10, hG2 = yC - 10 - yG2; if (hG2 > 60) pGauge(yG2, hG2, t);
    } else {                                                      // A: 상대(탱크+체력+작은 문장) / 전선(넓게) / 나(탱크+체력, 큰 문장)
      var tw2 = Math.min(inner * 0.42, 64), eO2 = Math.min(inner * 0.42, 70), hO2 = ttl + Math.max(tw2 * 1.2, 60) + eO2 + 36;
      pFrame(top0, hO2); pTitle('상대 ' + (o.name || ''), top0 + 10, '#ff8a7a');
      if (IMG.u_tank_e) fitImg(IMG.u_tank_e, x0 + 14 + tw2 / 2, top0 + ttl + tw2 * 0.6, tw2, tw2 * 1.15, 1, 0);
      pHp(x0 + 14 + tw2 + 8 + (inner - tw2 - 8) / 2, top0 + ttl + 2, inner - tw2 - 8, ohp, false, o.shield | 0);
      pEmblem(of, cx, top0 + hO2 - eO2 / 2 - 26, eO2, oult, false, t);
      var tw3 = tw2, E3 = Math.min(inner * 0.84, 150), hM2 = ttl + Math.max(tw3 * 1.2, 60) + E3 + 44, yM2 = bot0 - hM2;
      pFrame(yM2, hM2); pTitle('나 · ' + fac().name, yM2 + 10, '#9be37a');
      if (IMG.u_tank_p) fitImg(IMG.u_tank_p, x0 + 14 + tw3 / 2, yM2 + ttl + tw3 * 0.6, tw3, tw3 * 1.15, 1, 0);
      if (G.shield > 0) drawShield(x0 + 14 + tw3 / 2, yM2 + ttl + tw3 * 0.6, G.shield, t, 0.9);
      pHp(x0 + 14 + tw3 + 8 + (inner - tw3 - 8) / 2, yM2 + ttl + 2, inner - tw3 - 8, G.tank.hp, false, G.shield);
      ULTB = pEmblem(fac(), cx, yM2 + hM2 - E3 / 2 - 34, E3, G.ult, true, t);
      var yG3 = top0 + hO2 + 10, hG3 = yM2 - 10 - yG3; if (hG3 > 60) pGauge(yG3, hG3, t);
    }
  }
  function wrap(txt, w) { var out = [], cur = ''; ctx.font = '500 10px Do Hyeon, system-ui'; txt.split(' ').forEach(function (wd) { var tr = cur ? cur + ' ' + wd : wd; if (ctx.measureText(tr).width > w && cur) { out.push(cur); cur = wd; } else cur = tr; }); if (cur) out.push(cur); return out.slice(0, 6); }
  var BTN = {};
  function layoutBtns() {
    var keys = G && G.vs ? ['scout', 'missile', 'inf'] : ['scout', 'missile'], n = keys.length, gap = 6, w = (W - gap * (n + 1)) / n;
    var h = Math.min(BBAR - 10, w / 3.26);   /* 버튼 그림 비율(395×121) 유지 */
    BTN = {}; keys.forEach(function (k, i) { BTN[k] = { x: gap + i * (w + gap), y: OY + (BBAR - h) / 2, w: w, h: h }; });
  }
  var SCORE_AT = null;
  function scorePos() { if (G.vs && SCORE_AT) return { x: SCORE_AT.x + 30, y: SCORE_AT.y }; return G.vs ? { x: W - 12, y: TOP / 2 - 3 } : { x: W - 10, y: HY + HUD / 2 }; }   /* 날아가는 점수는 별 메달로 */
  function drawScore(t) {                                    // 점수판: 숫자가 굴러 올라가고, 점수가 들어오면 반짝
    var pend = 0; G.fx.forEach(function (f) { if (f.t === 'score' && !f.hit) pend += f.n; }); var tgt = G.score - pend;   /* 날아가는 중인 점수는 도착한 뒤에 더함 */
    G.scoreShown = G.scoreShown == null ? tgt : G.scoreShown; var d = tgt - G.scoreShown; if (d > 0) G.scoreShown += Math.max(1, Math.ceil(d * 0.18)); else if (d < 0) G.scoreShown = tgt;
    var sp = scorePos(), pa = G.scorePulse ? Math.max(0, 1 - (t - G.scorePulse) / 520) : 0, pt = G.scoreTier || 1, sc = 1 + (0.25 + 0.15 * pt) * pa, fs = G.vs ? Math.round(Math.min(26, TOP * 0.5)) : 20;
    if (G.vs && V2.ui_score) {                                   /* 금테 점수판(별 메달) 위에 숫자 */
      var ph = Math.min(TOP - 16, 40), pw = ph * V2.ui_score.width / V2.ui_score.height; if (pw > W * 0.42) { pw = W * 0.42; ph = pw * V2.ui_score.height / V2.ui_score.width; }
      var px0 = W / 2 - pw / 2, py0 = (TOP - (G.vs ? 12 : 6)) / 2 - ph / 2 + 1; ctx.save(); if (pa > 0) { ctx.shadowColor = 'rgba(255,200,60,' + pa + ')'; ctx.shadowBlur = (14 + 10 * pt) * pa; ctx.translate(Math.sin(t / 25) * 2 * pa * pt, 0); } ctx.drawImage(V2.ui_score, px0, py0, pw, ph); if (pa > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * pa; ctx.drawImage(V2.ui_score, px0, py0, pw, ph); } ctx.restore();
      var fs3 = Math.round(ph * 0.56), tx3 = G.scoreShown.toLocaleString('en-US'), cx3 = px0 + pw * 0.6, cy3 = py0 + ph / 2 + 1;
      ctx.save(); ctx.translate(cx3, cy3); ctx.scale(1 + (0.25 + 0.12 * pt) * pa, 1 + (0.25 + 0.12 * pt) * pa); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 ' + fs3 + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 3; ctx.strokeStyle = '#120a00'; ctx.strokeText(tx3, 0, 0); var g7 = ctx.createLinearGradient(0, -fs3 / 2, 0, fs3 / 2); g7.addColorStop(0, '#fff3b0'); g7.addColorStop(1, '#ffb020'); ctx.fillStyle = g7; ctx.fillText(tx3, 0, 0); ctx.restore();
      SCORE_AT = { x: px0 + pw * 0.11, y: py0 + ph / 2 }; return;
    }
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.scale(sc, sc); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '800 ' + fs + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.lineWidth = 4; ctx.strokeStyle = '#1a0e00'; ctx.shadowColor = 'rgba(255,200,60,' + (0.4 + 0.6 * pa) + ')'; ctx.shadowBlur = 6 + 14 * pa;
    var txt = G.scoreShown.toLocaleString('en-US'); ctx.strokeText(txt, 0, 0); var gg = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2); gg.addColorStop(0, '#fff3b0'); gg.addColorStop(1, '#ffb020'); ctx.fillStyle = gg; ctx.fillText(txt, 0, 0);
    var tw0 = ctx.measureText(txt).width; ctx.shadowBlur = 0; ctx.font = '700 ' + Math.round(fs * 0.45) + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.fillStyle = '#cfd6bf'; ctx.fillText('SCORE', -tw0 - 6, 1);
    ctx.restore();
  }
  function drawHud(t) {
    var g = ctx.createLinearGradient(0, HY, 0, HY + HUD); g.addColorStop(0, '#3a3e32'); g.addColorStop(1, '#1b1d16'); ctx.fillStyle = g; ctx.fillRect(0, HY, W, HUD);
    ctx.fillStyle = '#0a0b08'; ctx.fillRect(0, HY, W, 3);
    // 맨 위 띠(진격 타이머)
    var g2 = ctx.createLinearGradient(0, 0, 0, TOP); g2.addColorStop(0, '#2a2d24'); g2.addColorStop(1, '#141610'); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, TOP);
    function btn(b, icon, n, label, on) {
      var bk = { '🔭': 'scout', '🚀': 'missile', '🪖': 'inf' }[icon], bimg = V2['btn_' + bk + (on ? '_on' : '_off')];
      if (bimg) { ctx.drawImage(bimg, b.x, b.y, b.w, b.h); }
      else { var gg = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h); gg.addColorStop(0, on ? '#ffe284' : '#6b6f60'); gg.addColorStop(1, on ? '#e8a21a' : '#3e4138');
        rr(b.x, b.y, b.w, b.h, 10); ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = on ? '#ffd451' : '#2a2c24'; ctx.lineWidth = 2; ctx.stroke();
        var bim = IMG[{ '🔭': 'b_scout', '🚀': 'b_missile', '🪖': 'b_inf' }[icon]]; if (bim) fitImg(bim, b.x + 24, b.y + b.h / 2, b.h - 8, b.h - 8, on ? 1 : 0.5); }
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';   /* 그림의 아이콘 자리(왼쪽 30%) 다음에 숫자, 오른쪽 끝에 이름 */
      var fs1 = Math.round(b.h * 0.46), fs2 = Math.round(b.h * 0.26);
      ctx.font = '800 ' + fs1 + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.fillStyle = on ? '#2a1a00' : '#aaa'; ctx.fillText('×' + n, b.x + b.w * 0.36, b.y + b.h / 2 + 1);
      ctx.font = '600 ' + fs2 + 'px Do Hyeon, system-ui'; ctx.textAlign = 'right'; ctx.fillStyle = on ? '#5a3b00' : '#888'; ctx.fillText(label, b.x + b.w * 0.9, b.y + b.h / 2 + 1);   /* 그림 판(30~93%) 안에 */
    }
    layoutBtns();
    var g3 = ctx.createLinearGradient(0, OY, 0, H); g3.addColorStop(0, '#1b1d16'); g3.addColorStop(1, '#0d0e0a'); ctx.fillStyle = g3; ctx.fillRect(0, OY, W, BBAR);
    btn(BTN.scout, '🔭', G.scout, '정찰', G.scout > 0);
    var rl = Math.max(0, G.missileReady - t); btn(BTN.missile, '🚀', G.missile, rl > 0 ? (rl / 1000).toFixed(1) + 's' : '미사일', G.missile > 0 && rl <= 0);
    if (rl > 0) { var mb = BTN.missile, rp = 1 - rl / 3000; ctx.save(); rr(mb.x, mb.y, mb.w, mb.h, 10); ctx.clip(); ctx.fillStyle = 'rgba(255,200,80,.45)'; ctx.fillRect(mb.x, mb.y, mb.w * rp, mb.h); ctx.restore(); }
    if (G.vs) btn(BTN.inf, '🪖', G.inf, '보병 투입', G.inf > 0);
    // 연료
    var hy = HY, cy = hy + HUD / 2;
    var fw = Math.min(W * 0.58, 300), fh = Math.min(HUD - 8, 44), fx0 = 6, fy0 = cy - fh / 2;          /* 연료: 큰 숫자 + 굵은 15칸 게이지 (금테) */
    var lab = '⛽ ' + G.fuel, lf = Math.round(fh * 0.72); ctx.font = '800 ' + lf + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var lw = ctx.measureText(lab).width + 10, ix = fx0 + lw, iw2 = fw - lw, iy = fy0, ih2 = fh, segW = iw2 / FUEL_MAX;
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(lab, fx0, cy); ctx.fillStyle = G.fuel <= 3 ? '#ff8a7a' : '#ffe28a'; ctx.fillText(lab, fx0, cy);
    ctx.fillStyle = '#0a0b08'; rr(ix - 3, iy - 3, iw2 + 6, ih2 + 6, 6); ctx.fill(); ctx.strokeStyle = '#c9a34a'; ctx.lineWidth = 2; rr(ix - 3, iy - 3, iw2 + 6, ih2 + 6, 6); ctx.stroke();
    for (var i = 0; i < FUEL_MAX; i++) { var onF = i < G.fuel; var fg = ctx.createLinearGradient(0, iy, 0, iy + ih2); fg.addColorStop(0, onF ? (G.fuel <= 3 ? '#ff8a6a' : '#ffd86a') : '#2a2d24'); fg.addColorStop(1, onF ? (G.fuel <= 3 ? '#c0301a' : '#d9821a') : '#15170f'); ctx.fillStyle = fg; rr(ix + i * segW + 1.5, iy + 2, segW - 3, ih2 - 4, 3); ctx.fill(); }
    // 점수 / 상대
    ctx.textAlign = 'right';
    if (G.vs) {
      var o = (window.NET && NET.opp()) || {};
      var mf = G.mySol.filter(function (e) { return e.d === 1; }).length, ef = G.soldiers.filter(function (e) { return e.d === 1; }).length;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '600 14px Do Hyeon, system-ui'; ctx.fillStyle = '#cfd6bf'; ctx.fillText('최전방 보병', fx0 + fw + 10, cy);
      ctx.font = '800 20px Black Han Sans, Do Hyeon, system-ui'; var seeE = true; ctx.fillStyle = !seeE ? '#fff' : mf > ef ? '#9be37a' : mf < ef ? '#ff8a7a' : '#fff'; ctx.fillText(mf + ' : ' + (seeE ? ef : '?'), fx0 + fw + 10 + ctx.measureText('최전방 보병 ').width + 4, cy);
    }
    else { /* 점수는 drawScore */ ctx.font = '800 20px Black Han Sans, Do Hyeon, system-ui'; ctx.font = '600 11px Black Han Sans, Do Hyeon, system-ui'; ctx.fillStyle = '#cfd6bf'; ctx.fillText('BEST ' + best(), W - 10 - ctx.measureText(String(G.score)).width * 2.4 - 12, cy); }
    // 진격 타이머
    var left = Math.max(0, G.nextAdv - t), p = left / advMs(t);
    var barH = G.vs ? 12 : 6; ctx.fillStyle = '#111'; ctx.fillRect(0, TOP - barH, W, barH); ctx.fillStyle = left < 6000 ? '#ff3b3b' : '#9bbd55'; ctx.fillRect(0, TOP - barH, W * p, barH); if (G.vs) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, TOP - barH, W * p, 3); }
    var tb = Math.max(30, Math.min(44, TOP - barH - 4)), ty0 = (TOP - barH - tb) / 2; TGL = TGL || {}; TGL.snd = { x: 6, y: ty0, w: tb * 1.7, h: tb };   /* 게임 안: 소리 켜기/끄기(크게) */
    (function () { var b = TGL.snd, on = !muted(); ctx.save(); var gs = ctx.createLinearGradient(0, b.y, 0, b.y + b.h); gs.addColorStop(0, on ? '#ffe284' : '#5e6152'); gs.addColorStop(1, on ? '#e8a21a' : '#33362c'); rr(b.x, b.y, b.w, b.h, 8); ctx.fillStyle = gs; ctx.fill(); ctx.strokeStyle = on ? '#fff2a8' : '#777'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = Math.round(b.h * 0.5) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(on ? '🔊' : '🔇', b.x + b.w * 0.34, b.y + b.h / 2 + 1); ctx.font = '800 ' + Math.round(b.h * 0.3) + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.fillStyle = on ? '#2a1a00' : '#ccc'; ctx.fillText(on ? 'ON' : 'OFF', b.x + b.w * 0.74, b.y + b.h / 2 + 1); ctx.restore(); })();
    if (G.vs && G.wave) { ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '800 14px Black Han Sans, Do Hyeon, system-ui'; ctx.fillStyle = '#ffd451'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('전투 ' + G.wave, 14 + tb * 1.7, (TOP - barH) / 2); ctx.restore(); }
    ctx.textAlign = G.vs ? 'right' : 'center'; ctx.font = '800 ' + (G.vs ? 17 : 13) + 'px Black Han Sans, Do Hyeon, system-ui'; ctx.fillStyle = left < 6000 && G.vs ? '#ffb3a8' : '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(G.sweep ? '적군 돌파!' : G.vs ? ('교전까지 ' + Math.ceil(Math.max(0, left) / 1000) + 's') : ('적 진격까지 ' + Math.ceil(left / 1000) + 's (' + (advMs(t) / 1000) + '초 간격)  ·  적 병사 ' + G.soldiers.length), G.vs ? W - 8 : W / 2, G.vs ? (TOP - barH) / 2 : 10); ctx.shadowBlur = 0;
  }
  function traySlot(i) { var w = (W - 40) / 3 - 10; return { x: 20 + i * (w + 15), y: TY + 8, w: w, h: TRAY - 16 }; }
  function drawTray(t) {
    var g = ctx.createLinearGradient(0, TY, 0, H); g.addColorStop(0, '#1b1d16'); g.addColorStop(1, '#3a3e32'); ctx.fillStyle = g; ctx.fillRect(0, TY, W, TRAY);
    for (var i = 0; i < 3; i++) {
      var sl = traySlot(i), p = G.tray[i];
      rr(sl.x, sl.y, sl.w, sl.h, 10); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill(); ctx.strokeStyle = '#4a4e40'; ctx.lineWidth = 2; ctx.stroke();
      if (!p || (G.drag && G.drag.i === i)) continue;
      var s = Math.floor(Math.min(44, (sl.h - 8) / p.h, (sl.w - 8) / p.w)), ox = sl.x + (sl.w - p.w * s) / 2, oy = sl.y + (sl.h - p.h * s) / 2;   /* 긴 블록도 받침 안에 들어오게 칸 크기를 줄임 */
      var fits = anyFit(p);
      p.cells.forEach(function (c) { drawBlock(ox + c.dx * s, oy + c.dy * s, s, c.r, fits ? 1 : 0.35); });
    }
  }
  function best() { try { return +localStorage.getItem('tank_best') || 0; } catch (e) { return 0; } }

  // ---------- 입력 ----------
  function pos(ev) { var r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / scale - OFFX, y: (ev.clientY - r.top) / scaleY - OFFY }; }
  function inB(b, p) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }
  var down = null;
  cv.addEventListener('pointerdown', function (ev) {
    if (!G || G.over || G.sweep || G.collapsing) return;
    var p = pos(ev); if (G.demo) { if (window.DEMO) DEMO.tap(p); return; }
    if (TGL && TGL.snd && inB(TGL.snd, p)) { setMute(!muted()); return; }
    if (TGL && TGL.gd && inB(TGL.gd, p)) { showIntro(); return; }
    if (false) { setGuide(!guideOn()); G.fx.push({ t: 'pop', text: guideOn() ? '💡 가이드 켜짐' : '💡 가이드 꺼짐', x: W / 2, y: EY + 40, at: now(), big: false, col: '#ffd451' }); return; }
    if (G.intro && INTROB) { G.intro = null; INTROB = null; return; }   /* 시작 안내 닫기 */
    if (HINTB && G.hint && inB(HINTB, p)) { G.hint = null; HINTB = null; return; }   /* 가이드 닫기 */
    if (G.freezeUntil && now() < G.freezeUntil) return;              /* 포격 중: 양쪽 다 정지 */
    if (G.roundFx) return;
    if (p.x >= W) { if (HELPB && inB(HELPB, p) && window.showTut) { showTut(); return; } if (REROLLB && inB(REROLLB, p)) { useReroll(); return; } if (G.vs && ULTB && inB(ULTB, p)) useUlt(); return; } down = p; cv.setPointerCapture(ev.pointerId);
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
    if (G.collapsing || (G.freezeUntil && now() < G.freezeUntil)) { G.drag = null; G.dragInf = null; G.aim = null; down = null; return; }
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
      else if (G.reach && G.reach[cx2 + ',' + cy2] && G.reach[cx2 + ',' + cy2].d) { G.sel = false; moveTank(cx2, cy2); }   /* 탱크를 먼저 안 눌러도 바로 이동 */
      else if (cy2 >= top() && !G.tank.path.length) {                                                   /* 못 가는 칸: 빨갛게 덜컹 + 이유 */
        var why = G.board[cy2][cx2] ? '블록이 막고 있어 이동할 수 없습니다' : G.fuel <= 0 ? '기름이 없습니다 — 이동할 수 없습니다' : '기름이 모자랍니다 — 거기까지 못 갑니다';
        G.fx.push({ t: 'deny', x: cx2, y: cy2, at: now(), life: 600 }); G.fx.push({ t: 'pop', text: why, x: Math.max(110, Math.min(W - 110, BX(cx2) + S / 2)), y: BYY(cy2) - 8, at: now(), big: false, col: '#ff7a6a', size: 18 }); G.shake = 3; G.shakeUntil = now() + 160; sfx('bad'); G.sel = false;
      }
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
  setInterval(function () { if (document.hidden && G && G.vs && !G.over) update(now()); }, 250);   /* 화면이 숨겨져도(다른 앱 잠깐 보기) 대전 진행은 멈추지 않게 */
  newGame(false); G.over = true;   // 시작 전 배경 표시용
  loop();
  window.__tank = { get: function () { return G; }, set: function (g) { G = g; }, fns: { canPlace: canPlace, place: place, anyFit: anyFit, calcReach: calcReach, checkFit: checkFit, top: top, makePiece: makePiece }, notice: function (txt) { if (G) { G.fx.push({ t: 'pop', text: txt, x: W / 2, y: EY + 40, at: now(), big: false }); } }, revealOpp: function (x, y) { if (!G || !G.vs) return; G.oppTank = { x: x, y: y }; G.reveal = { until: now() + 3500 }; G.lastSeen = { x: x, y: y, t: now(), how: '발사' }; sfx('warn'); }, incomingShot: incomingShot, applyLine: applyLine, setOpp: function (o) { if (!G || !G.vs) return; if (o.fac && FAC[o.fac] && G.oppFacGuess !== o.fac) { G.oppFacGuess = o.fac; applySkin(); } if (o.tank) { var tp = o.tank.split(','); G.oppTank = { x: +tp[0], y: +tp[1] }; } if (o.sol != null) { var oldS = G.soldiers, cnt0 = {}, minD = {}; oldS.forEach(function (e) { cnt0[e.x] = (cnt0[e.x] || 0) + 1; if (minD[e.x] == null || e.d < minD[e.x]) minD[e.x] = e.d; });
        G.soldiers = o.sol ? o.sol.split(';').map(function (q) { var a = q.split(':'); return { x: COLS - 1 - (+a[0]), d: +a[1] }; }) : [];
        var cnt1 = {}; G.soldiers.forEach(function (e) { cnt1[e.x] = (cnt1[e.x] || 0) + 1; }); for (var cx in cnt0) if ((cnt1[cx] || 0) < cnt0[cx] && !G.over) G.fx.push({ t: 'dead', enemy: true, px: BX(+cx) + S / 2, py: slotY(minD[cx]), at: now(), life: 1500 }); } }, clash: startClash, enemyScout: enemyScout, BTN: function () { layoutBtns(); return BTN; }, newGame: newGame, addEnemyInf: addEnemyInf, useInfantry: useInfantry, forceOver: function (m) { G.over = true; G.overMsg = m || '테스트'; showOver(); }, place: place, canPlace: canPlace, moveTank: moveTank, useScout: useScout, useMissile: useMissile, makePiece: makePiece, checkFit: checkFit, useUlt: useUlt, skillIn: skillIn, FAC: FAC, ULT_MAX: ULT_MAX, V2: V2, applySkin: applySkin, useScout: useScout, startClash: startClash, traySlot: traySlot, ULTB: function () { return ULTB; }, L: function () { return { W: W, S: S, BY: BY, FS: FS, EY: EY, HY: HY, TY: TY, PW: PW, OFFY: OFFY, ctx: ctx }; }, drawSoldier: drawSoldier, fitImg: fitImg, IMG: IMG, BX: BX, BYY: BYY, rowC: rowC, myRow: myRow, slotY: slotY, fx: function (f) { G.fx.push(f); }, addScore: addScore, resetRound: resetRound, killTank: killTank };
})();
