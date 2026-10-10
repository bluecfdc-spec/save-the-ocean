/* TANK RUMBLE — 1:1 대전 (Firebase Realtime Database, Space Survivor 와 같은 DB)
   rooms/tk_CODE/meta    {state:'lobby'|'play', host, startAt, round}
   rooms/tk_CODE/players/{uid} {name, ready, over, msg, adv, joined, t}
   rooms/tk_CODE/inbox/{uid}/{push} {x, t}   ← 상대가 보낸 보병(열 번호). 받는 쪽이 읽고 지운다
*/
window.REALNET = window.NET = (function () {
  'use strict';
  var CFG = { databaseURL: 'https://space-survivor-c7efe-default-rtdb.asia-southeast1.firebasedatabase.app', apiKey: 'AIzaSyCdo9ftAg6FdHUd2M0EKbwANrtfm4qlP6w', authDomain: 'space-survivor-c7efe.firebaseapp.com', projectId: 'space-survivor-c7efe' };
  var $ = function (id) { return document.getElementById(id); };
  var db = null, off = 0, uid = '', name = '', code = '', ref = null, players = {}, meta = {}, started = false, lastStart = 0, pubTimer = null, startTimer = null, resultUp = false;
  try { uid = localStorage.getItem('tank_uid') || ''; name = localStorage.getItem('tank_name') || ''; } catch (e) { }
  if (!uid) { uid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 12) : Date.now().toString(36) + Math.random().toString(36).slice(2, 8); try { localStorage.setItem('tank_uid', uid); } catch (e) { } }
  function init() {
    if (db) return true;
    try { if (!firebase.apps.length) firebase.initializeApp(CFG); db = firebase.database(); db.ref('.info/serverTimeOffset').on('value', function (s) { off = s.val() || 0; }); return true; }
    catch (e) { db = null; return false; }
  }
  function snow() { return Date.now() + off; }
  function show(id) { ['ov', 'lobby', 'room', 'count', 'result'].forEach(function (k) { $(k).classList.toggle('hidden', k !== id); }); }
  function msg(id, t) { $(id).textContent = t || ''; }
  function oppId() { for (var k in players) if (k !== uid) return k; return null; }
  function opp() { var k = oppId(); return k ? players[k] : null; }
  function me() { return players[uid] || {}; }
  function path() { return 'rooms/tk_' + code; }

  // ---------- 로비 ----------
  function openLobby() {
    if (!init()) { msg('lbMsg', '온라인 연결에 실패했어요. 잠시 후 다시 시도해 주세요.'); }
    $('nm').value = name; show('lobby'); msg('lbMsg', '');
  }
  function saveName() { name = ($('nm').value || '').trim().slice(0, 10) || '병사' + uid.slice(0, 3); try { localStorage.setItem('tank_name', name); } catch (e) { } }
  function mkCode() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function create() {
    if (!init()) return; saveName(); code = mkCode();
    db.ref('rooms/tk_' + code + '/meta').set({ state: 'lobby', host: uid, startAt: 0, round: 0 }).then(function () { join(code); }).catch(function (e) { msg('lbMsg', '방을 못 만들었어요: ' + (e.message || e)); });
  }
  function join(c) {
    if (!init()) return; saveName();
    c = (c || '').trim().toUpperCase(); if (c.length !== 4) { msg('lbMsg', '코드 4글자를 넣어 주세요.'); return; }
    var r = db.ref('rooms/tk_' + c);
    r.once('value').then(function (s) {
      var v = s.val();
      if (!v || !v.meta) { msg('lbMsg', '그 코드의 방이 없어요.'); return; }
      var ps = v.players || {}, n = Object.keys(ps).filter(function (k) { return k !== uid; }).length;
      if (n >= 2) { msg('lbMsg', '방이 꽉 찼어요.'); return; }
      code = c; ref = r; players = {}; meta = v.meta; started = false; lastStart = v.meta.startAt || 0;
      var mine = ref.child('players/' + uid);
      mine.onDisconnect().remove();
      mine.set({ name: name, ready: false, over: false, msg: '', adv: 0, joined: firebase.database.ServerValue.TIMESTAMP });
      ref.child('players').on('value', onPlayers);
      ref.child('meta').on('value', onMeta);
      ref.child('inbox/' + uid).on('child_added', onInbox);
      $('roomCode').textContent = code; show('room'); renderRoom();
    }).catch(function (e) { msg('lbMsg', '입장 실패: ' + (e.message || e)); });
  }
  function leave() {
    if (ref) { ref.child('players').off(); ref.child('meta').off(); ref.child('inbox/' + uid).off(); ref.child('players/' + uid).onDisconnect().cancel(); ref.child('players/' + uid).remove(); ref.child('inbox/' + uid).remove(); }
    ref = null; code = ''; players = {}; meta = {}; started = false; resultUp = false; clearInterval(pubTimer); clearInterval(lineTimer); clearTimeout(startTimer);
    try { history.replaceState(null, '', location.pathname); } catch (e) { }
    show('ov');
  }
  function link() { return location.origin + location.pathname + '?room=' + code; }
  function share() {
    var l = link();
    if (navigator.share) navigator.share({ title: 'TANK RUMBLE 대전', text: '탱크 럼블 1:1 대전 초대 — 코드 ' + code, url: l }).catch(function () { });
    else if (navigator.clipboard) navigator.clipboard.writeText(l).then(function () { msg('roomMsg', '초대 링크를 복사했어요.'); });
    else prompt('초대 링크', l);
  }
  function ready() { if (!ref) return; ref.child('players/' + uid + '/ready').set(!me().ready); }

  // ---------- 동기화 ----------
  function onPlayers(s) {
    players = s.val() || {};
    renderRoom();
    var o = opp();
    if (started && o) window.__tank.setOpp(o);                                  // 상대 탱크 위치·내 보병 목록(상대가 보는 그대로)
    if (started && o && o.scout && o.scout !== lastScout) { lastScout = o.scout; window.__tank.enemyScout(); }
    if (started && o && o.fire && o.fire.t && o.fire.t !== lastFire) { lastFire = o.fire.t; window.__tank.revealOpp(o.fire.x | 0, o.fire.y | 0); if (o.fire.s) window.__tank.incomingShot(o.fire.x | 0); }
    if (started && o) {                                               // 상대 쪽 변화 알림
      var G0 = window.__tank.get();
      if (prevOpp.inf != null && (o.inf || 0) < prevOpp.inf) window.__tank.notice('적 보병 격파!');
      if (prevOpp.tank != null && o.tank !== prevOpp.tank && !window.__tank.get().scoutUntil) { }
      if (prevOpp.hp != null && o.hp != null && o.hp < prevOpp.hp) window.__tank.notice('명중! 상대 체력 ' + o.hp);
      prevOpp = { inf: o.inf || 0, hp: o.hp == null ? 3 : o.hp, tank: o.tank };
    }
    // 둘 다 준비 → 방장이 시작 시각을 정한다
    if (meta.host === uid && meta.state === 'lobby' && o && o.ready && me().ready) {
      ref.child('meta').update({ state: 'play', startAt: snow() + 4000, round: (meta.round || 0) + 1 });
    }
    // 게임 중 상대가 졌거나 나갔다 → 승리
    if (started && !resultUp) {
      var G = window.__tank.get();
      if (!o) finish('win', '상대가 나갔어요');
      else if (o.over && !G.over) finish('win', '상대: ' + (o.msg || '격파'));
      else if (o.over && G.over) finish(o.t && players[uid] && players[uid].t && o.t < players[uid].t ? 'win' : 'draw', '동시에 끝났어요');
    }
  }
  function isHost() { return meta.host === uid; }
  var lineTimer = null;
  function hostLine(delta) {                                                     // 방장: 전선 이동. delta>0 = 내 쪽으로(내가 밀림), <0 = 상대 쪽으로
    var L = (meta.line | 0) + delta; L = Math.max(-8, Math.min(9, L));
    ref.child('meta').update({ line: L, nextTick: snow() + 30000 });
  }
  function hostTick() {                                                          // 방장: 30초마다 교전 — 최전방 보병이 많은 쪽이 민다(차이 3 이상이면 2줄). 같으면 교착
    if (!started || !isHost()) return; var G = window.__tank.get(), o = opp() || {};
    var h = G.mySol.filter(function (e) { return e.d === 1; }).length, of = o.front | 0, diff = h - of;
    var delta = diff === 0 ? 0 : (Math.abs(diff) >= 3 ? 2 : 1) * (diff > 0 ? -1 : 1);   // 음수 = 상대 쪽으로(방장이 전진)
    ref.child('meta').update({ clash: { at: snow(), h: h, o: of, d: delta } });
    setTimeout(function () { if (started) hostLine(delta); }, 2600);
  }
  var lastClash = 0;
  function onMeta(s) {
    meta = s.val() || {};
    if (started && meta.clash && meta.clash.at && meta.clash.at !== lastClash) { lastClash = meta.clash.at; var c = meta.clash; window.__tank.clash(isHost() ? c.h : c.o, isHost() ? c.o : c.h, isHost() ? c.d : -c.d); }
    if (started && meta.line != null) window.__tank.applyLine(isHost() ? (meta.line | 0) : -(meta.line | 0), meta.nextTick ? meta.nextTick - snow() : null);   // line 은 방장 기준(+ = 방장 쪽으로 밀림) → 상대는 부호 반대
    if (meta.state === 'play' && meta.startAt && meta.startAt !== lastStart) {
      lastStart = meta.startAt; resultUp = false;
      ref.child('players/' + uid).update({ ready: false, over: false, msg: '', t: 0, fire: null, scout: null, hp: 3, front: 0, sol: '', tank: '3,6' }); lastFire = 0; lastClash = 0; lastScout = 0;
      if (isHost()) ref.child('meta').update({ line: 0, nextTick: meta.startAt + 30000, clash: null });
      ref.child('inbox/' + uid).remove();
      show('count'); lastPub = ''; prevOpp = {}; tick();
    }
    if (meta.state === 'lobby' && !started) { show('room'); renderRoom(); }
  }
  function tick() {
    var left = meta.startAt - snow();
    if (left <= 0) { startGame(); return; }
    var c = Math.ceil(left / 1000); if ($('countNum').textContent != c) { $('countNum').textContent = c; try { SFX.count(); } catch (e) { } }
    startTimer = setTimeout(tick, 100);
  }
  function startGame() {
    started = true; show('none'); window.__tank.newGame(true); try { SFX.go(); SFX.ambientStart(); } catch (e) { }
    clearInterval(pubTimer); pubTimer = setInterval(pub, 1000);
    clearInterval(lineTimer); if (isHost()) lineTimer = setInterval(hostTick, 30000);
  }
  function onInbox(s) {
    var v = s.val(); s.ref.remove();
    if (!started) return; var G = window.__tank.get(); if (G.over) return;
    window.__tank.addEnemyInf(v.x | 0);
  }
  var lastFire = 0, prevOpp = {}, lastScout = 0;
  function scouted() { if (ref && started) ref.child('players/' + uid + '/scout').set(firebase.database.ServerValue.TIMESTAMP); }
  function fired(x, y, shot) { if (ref) ref.child('players/' + uid + '/fire').set({ x: x, y: y, s: shot ? 1 : 0, t: firebase.database.ServerValue.TIMESTAMP }); }
  function sendInf(x) { var o = oppId(); if (ref && o) ref.child('inbox/' + o).push({ x: x, t: firebase.database.ServerValue.TIMESTAMP }); }
  var lastPub = '';
  function pub(force) {                                                        // 바뀔 때만: 체력 · 내 탱크 위치 · 내 앞의 적 보병(상대에겐 '보낸 보병' 목록) · 최전방 수
    if (!ref || !started) return; var G = window.__tank.get();
    var sol = G.mySol.map(function (e) { return e.x + ':' + e.d; }).join(';'), front = G.mySol.filter(function (e) { return e.d === 1; }).length;
    var k = G.tank.x + ',' + G.tank.y + '/' + sol + '/' + G.tank.hp + '/' + G.board.map(function (r) { return r.filter(Boolean).length; }).join(''); if (k === lastPub && !force) return; lastPub = k;
    var empty = 0; for (var y = Math.max(0, G.adv); y < 9; y++) for (var x = 0; x < 7; x++) if (!G.board[y][x]) empty++;
    ref.child('players/' + uid).update({ tank: G.tank.x + ',' + G.tank.y, sol: sol, front: front, inf: G.mySol.length, hp: G.tank.hp, empty: empty });
  }   // 바뀔 때만 보냄
  function over(m) {
    if (!ref) return; var G = window.__tank.get();
    ref.child('players/' + uid).update({ over: true, msg: m, adv: G.adv, t: firebase.database.ServerValue.TIMESTAMP });
    var o = opp();
    if (!resultUp) { if (o && o.over) finish('draw', '동시에 끝났어요'); else finish('lose', m); }
  }
  function finish(r, detail) {
    resultUp = true; started = false; clearInterval(pubTimer); clearInterval(lineTimer);
    var G = window.__tank.get(); G.over = true; if (r === 'win') G.overMsg = '승리';
    try { SFX.sweepStop(); SFX.ambientStop(); setTimeout(function () { SFX[r === 'win' ? 'win' : 'over'](); }, 400); } catch (e) { }
    $('resTitle').textContent = r === 'win' ? 'VICTORY' : r === 'lose' ? 'DEFEAT' : 'DRAW';
    $('resTitle').className = r;
    $('resText').textContent = detail + ' · 지운 줄 ' + G.lines + ' · 격파 ' + G.kills + ' · 보낸 보병 ' + G.sent;
    show('result');
  }
  function again() { if (!ref) return; ref.child('players/' + uid).update({ ready: false, over: false }); if (meta.state !== 'lobby') ref.child('meta/state').set('lobby'); show('room'); renderRoom(); }
  function renderRoom() {
    var ks = Object.keys(players), html = '';
    ks.forEach(function (k) { var p = players[k]; html += '<div class="pl' + (p.ready ? ' rd' : '') + '">' + (k === uid ? '나' : '상대') + ' · ' + esc(p.name) + (p.ready ? ' — 준비 완료' : ' — 대기') + '</div>'; });
    if (ks.length < 2) html += '<div class="pl dim">상대를 기다리는 중… 초대 링크나 코드를 보내 주세요</div>';
    $('plist').innerHTML = html;
    $('readyBtn').textContent = me().ready ? '준비 취소' : '준비!';
    $('readyBtn').disabled = ks.length < 2;
  }
  function esc(s) { return String(s || '').replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

  // ---------- 버튼 ----------
  $('vsBtn').addEventListener('click', function () { if (window.BOT) BOT.stop(); window.NET = window.REALNET; openLobby(); });
  $('mkBtn').addEventListener('click', create);
  $('joinBtn').addEventListener('click', function () { join($('code').value); });
  $('lbBack').addEventListener('click', function () { show('ov'); });
  $('shareBtn').addEventListener('click', share);
  $('readyBtn').addEventListener('click', ready);
  $('leaveBtn').addEventListener('click', leave);
  $('againBtn').addEventListener('click', again);
  $('resLeave').addEventListener('click', leave);
  // 초대 링크로 들어온 경우
  try { var rq = new URLSearchParams(location.search).get('room'); if (rq) { openLobby(); $('code').value = rq.toUpperCase(); if (name) join(rq); else msg('lbMsg', '이름을 넣고 [참가]를 누르세요.'); } } catch (e) { }
  return { finish: finish, show: show, opp: opp, sendInf: sendInf, fired: fired, scouted: scouted, _hostTick: hostTick, pub: pub, over: over, uid: function () { return uid; }, _state: function () { return { code: code, players: players, meta: meta, started: started }; } };
})();
