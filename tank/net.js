/* TANK RUMBLE — 1:1 대전 (DIVINE GENESIS 공통 Firebase: save-the-ocean-a96f1, 익명 로그인)
   rooms/tank/CODE/meta    {state:'lobby'|'play', host, startAt, round}
   rooms/tank/CODE/players/{uid} {name, ready, over, msg, adv, joined, t}
   rooms/tank/CODE/inbox/{uid}/{push} {x, t}   ← 상대가 보낸 보병(열 번호). 받는 쪽이 읽고 지운다
*/
window.REALNET = window.NET = (function () {
  'use strict';
  var CFG = window.DG_FIREBASE;                                 /* /common/firebase-config.js */
  var $ = function (id) { return document.getElementById(id); };
  var db = null, app = null, authed = null, off = 0, uid = '', name = '', code = '', ref = null, players = {}, meta = {}, started = false, lastStart = 0, pubTimer = null, startTimer = null, resultUp = false;
  var AS = ''; try { AS = new URLSearchParams(location.search).get('as') || ''; } catch (e) { }   /* ?as=2 : 같은 브라우저에서 다른 플레이어로(시험용) */
  var UK = 'tank_uid' + (AS ? '_' + AS : '');
  try { uid = localStorage.getItem(UK) || ''; name = localStorage.getItem('tank_name') || ''; } catch (e) { }
  if (!uid) { uid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 12) : Date.now().toString(36) + Math.random().toString(36).slice(2, 8); try { localStorage.setItem(UK, uid); } catch (e) { } }
  window.addEventListener('error', function (ev) { try { var L = window.__errlog = window.__errlog || []; L.push(String(ev.message)); } catch (e) { } });
  function init() {
    if (db) return true;
    try { app = firebase.initializeApp(CFG, 'tank' + AS); db = app.database(); db.ref('.info/serverTimeOffset').on('value', function (s) { off = s.val() || 0; }); return true; }   /* ?as= 시험 시 앱 이름을 달리해 익명 계정도 분리 */
    catch (e) { db = null; return false; }
  }
  function login() {                                                            /* 익명 로그인 — 규칙이 auth 를 요구. uid 는 로그인 uid 로 */
    if (authed) return authed;
    authed = app.auth().signInAnonymously().then(function (c) { uid = c.user.uid; return uid; }).catch(function (e) { authed = null; throw e; });
    return authed;
  }
  function snow() { return Date.now() + off; }
  function show(id) { ['ov', 'lobby', 'room', 'count', 'result', 'rank'].forEach(function (k) { $(k).classList.toggle('hidden', k !== id); }); }
  function msg(id, t) { $(id).textContent = t || ''; }
  function oppId() { for (var k in players) if (k !== uid) return k; return null; }
  function opp() { var k = oppId(); return k ? players[k] : null; }
  function me() { return players[uid] || {}; }
  function path() { return 'rooms/tank/' + code; }

  // ---------- 로비 ----------
  function openLobby() {
    if (!init()) { msg('lbMsg', '온라인 연결에 실패했어요. 잠시 후 다시 시도해 주세요.'); }
    else login().then(function () { watchRooms(true); lobbyChat(true); }).catch(function (e) { msg('lbMsg', '로그인 실패: ' + (e.message || e)); });
    $('nm').value = name; show('lobby'); msg('lbMsg', '');
  }
  function saveName() { name = ($('nm').value || '').trim().slice(0, 10) || '병사' + uid.slice(0, 3); try { localStorage.setItem('tank_name', name); } catch (e) { } }
  var ROOMS = [['GEOJE', '거제'], ['JERUSALEM', '예루살렘'], ['SILICON', '실리콘밸리'], ['SEOUL', '서울']];   /* 공개 전장 4곳 */
  function roomName(c) { for (var i = 0; i < ROOMS.length; i++) if (ROOMS[i][0] === c) return ROOMS[i][1]; return null; }
  ROOMS.forEach(function (r) { var b = document.createElement('button'); b.type = 'button'; b.id = 'rm-' + r[0]; b.appendChild(document.createTextNode(r[1])); var sm = document.createElement('small'); sm.textContent = '…'; b.appendChild(sm);
    b.addEventListener('click', function () { joinPublic(r[0]); }); $('rooms').appendChild(b); });
  var roomRefs = [];
  function watchRooms(on) {                                   /* 로비에 있는 동안만 4개 방 인원·상태를 실시간으로 (규칙상 방마다 따로 읽음) */
    roomRefs.forEach(function (r) { r.off(); }); roomRefs = []; if (!on || !db) return;
    ROOMS.forEach(function (r) { var rf = db.ref('rooms/tank/' + r[0]); roomRefs.push(rf);
      rf.on('value', function (s) { var d = s.val() || {}, n = Object.keys(d.players || {}).length, playing = n >= 2 && (d.meta || {}).state === 'play', b = $('rm-' + r[0]);
        b.lastChild.textContent = n + '/2 · ' + (playing ? '대전 중' : n === 1 ? '상대 기다리는 중' : '비어 있음'); b.classList.toggle('full', n >= 2); b.classList.toggle('wait', n === 1); },
        function () { $('rm-' + r[0]).lastChild.textContent = '연결 실패'; }); });
  }
  var PHR = ['한 판 하자!', '나랑 할 사람?', '거제로 와', '예루살렘으로 와', '실리콘밸리로 와', '서울로 와', 'ㅋㅋㅋ', '잘했다!'], chatOn = false, lastSay = 0;
  PHR.forEach(function (t, i) { var b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.addEventListener('click', function () { say(i); }); $('phr').appendChild(b); });
  function lobbyChat(on) {                                    /* 로비: 접속자 수 + 정해진 문구만 보내는 채팅 */
    if (!db) return; var pres = db.ref('lobby/tank/pres/' + uid), chat = db.ref('lobby/tank/chat');
    if (!on) { if (!chatOn) return; chatOn = false; db.ref('lobby/tank/pres').off(); chat.off(); pres.onDisconnect().cancel(); pres.remove(); return; }
    if (chatOn) return; chatOn = true; pres.onDisconnect().remove(); pres.set(true);
    db.ref('lobby/tank/pres').on('value', function (s) { $('mpOn').textContent = '● 지금 1:1 대전 로비에 ' + s.numChildren() + '명'; }, function () { });
    $('chat').textContent = '';
    chat.limitToLast(20).on('child_added', function (s) { var v = s.val() || {}; if (typeof v.p !== 'number' || !PHR[v.p]) return;
      var d = document.createElement('div'), b = document.createElement('b'); b.textContent = String(v.n || '').slice(0, 12) + '  '; d.appendChild(b); d.appendChild(document.createTextNode(PHR[v.p]));
      var c = $('chat'); c.appendChild(d); while (c.children.length > 30) c.removeChild(c.firstChild); c.scrollTop = c.scrollHeight; }, function () { });
    chat.orderByChild('t').endAt(snow() - 600000).limitToFirst(20).once('value').then(function (s) { s.forEach(function (c) { c.ref.remove(); }); }).catch(function () { });   /* 10분 지난 말은 지움 */
  }
  function chatFlash(t) { var c = $('chat'), d = document.createElement('div'); d.className = 'chatflash'; d.textContent = t; c.appendChild(d); c.scrollTop = c.scrollHeight; setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1800); }
  function say(i) {
    if (!db || !authed) return; saveName();
    if (Date.now() - lastSay < 2000) { chatFlash('조금 천천히 보내 주세요'); return; } lastSay = Date.now();
    db.ref('lobby/tank/chat').push({ n: name, p: i, t: firebase.database.ServerValue.TIMESTAMP }).catch(function () { chatFlash('보내지 못했어요'); });
  }
  function joinPublic(c) {                                    /* 공개 방: 없으면 만들고(내가 방장), 있으면 들어감 */
    if (!init()) return; saveName(); msg('lbMsg', '들어가는 중…');
    login().then(function () { return db.ref('rooms/tank/' + c).once('value'); }).then(function (s) {
      var v = s.val() || {}, ps = v.players || {}, others = Object.keys(ps).filter(function (k) { return k !== uid; });
      if (others.length >= 2 || (others.length >= 1 && Object.keys(ps).length >= 2 && !ps[uid])) { msg('lbMsg', '이 전장은 꽉 찼어요. 다른 곳을 골라 주세요.'); return; }
      var host = v.meta && v.meta.host && ps[v.meta.host] ? v.meta.host : uid;   /* 방장이 나갔으면 내가 방장 */
      var m = v.meta && host !== uid ? null : { state: 'lobby', host: uid, startAt: 0, round: (v.meta && v.meta.round) || 0 };
      return (m ? db.ref('rooms/tank/' + c + '/meta').set(m) : Promise.resolve()).then(function () { joinNow(c); });
    }).catch(function (e) { msg('lbMsg', '입장 실패: ' + (e.message || e)); });
  }
  function mkCode() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function create() {
    if (!init()) return; saveName(); msg('lbMsg', '방 만드는 중…');
    login().then(function () { code = mkCode(); return db.ref('rooms/tank/' + code + '/meta').set({ state: 'lobby', host: uid, startAt: 0, round: 0 }); }).then(function () { join(code); }).catch(function (e) { msg('lbMsg', '방을 못 만들었어요: ' + (e.message || e)); });
  }
  function join(c) {
    if (!init()) return; saveName();
    c = (c || '').trim().toUpperCase(); if (c.length !== 4) { msg('lbMsg', '코드 4글자를 넣어 주세요.'); return; }
    login().then(function () { joinNow(c); }).catch(function (e) { msg('lbMsg', '로그인 실패: ' + (e.message || e)); });
  }
  function joinNow(c) {
    var r = db.ref('rooms/tank/' + c);
    r.once('value').then(function (s) {
      var v = s.val();
      if (!v || !v.meta) { msg('lbMsg', '그 코드의 방이 없어요.'); return; }
      var ps = v.players || {}, n = Object.keys(ps).filter(function (k) { return k !== uid; }).length;
      if (n >= 1 && !ps[uid] && Object.keys(ps).length >= 2) { msg('lbMsg', '방이 꽉 찼어요.'); return; }   /* 2명까지 */
      code = c; ref = r; players = {}; meta = v.meta; started = false; lastStart = v.meta.startAt || 0;
      var mine = ref.child('players/' + uid);
      mine.onDisconnect().remove();
      mine.set({ name: name, ready: false, over: false, msg: '', adv: 0, joined: firebase.database.ServerValue.TIMESTAMP });
      ref.child('players').on('value', onPlayers);
      ref.child('meta').on('value', onMeta);
      ref.child('inbox/' + uid).on('child_added', onInbox);
      try { window.tankCards(); } catch (e) { } watchRooms(false); lobbyChat(false); $('roomCode').textContent = roomName(code) || code; $('shareBtn').style.display = roomName(code) ? 'none' : ''; show('room'); renderRoom();
    }).catch(function (e) { msg('lbMsg', '입장 실패: ' + (e.message || e)); });
  }
  function leave() {
    if (ref) { var o0 = oppId(); if (roomName(code) && meta.host === uid) ref.child('meta').update(o0 ? { host: o0, state: 'lobby' } : { host: '', state: 'lobby' }); ref.child('players').off(); ref.child('meta').off(); ref.child('inbox/' + uid).off(); ref.child('players/' + uid).onDisconnect().cancel(); ref.child('players/' + uid).remove(); ref.child('inbox/' + uid).remove(); }
    ref = null; code = ''; players = {}; meta = {}; started = false; resultUp = false; clearInterval(pubTimer); clearInterval(lineTimer); clearTimeout(startTimer);
    try { history.replaceState(null, '', location.pathname); } catch (e) { }
    if (db && authed) { show('lobby'); msg('lbMsg', ''); watchRooms(true); lobbyChat(true); } else show('ov');
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
    if (started && o && (o.collapses | 0) > oppCollapses) { var dc = (o.collapses | 0) - oppCollapses; oppCollapses = o.collapses | 0; window.__tank.notice('💥 상대 보드 붕괴!'); if (isHost()) hostLine(-2 * dc); }
    if (started && o && o.scout && o.scout !== lastScout) { lastScout = o.scout; window.__tank.enemyScout(); }
    if (started && o && o.skill && o.skill.t && o.skill.t !== lastSkill) { lastSkill = o.skill.t; window.__tank.skillIn(o.skill.k); }
    if (started && o && o.fire && o.fire.t && o.fire.t !== lastFire) { lastFire = o.fire.t; window.__tank.revealOpp(o.fire.x | 0, o.fire.y | 0); if (o.fire.s) window.__tank.incomingShot(o.fire.x | 0); }
    if (started && o) {                                               // 상대 쪽 변화 알림
      var G0 = window.__tank.get();
      prevOpp = { inf: o.inf || 0, hp: o.hp == null ? 3 : o.hp, tank: o.tank };
    }
    if (roomName(code) && meta && !started && meta.host && !players[meta.host] && players[uid]) ref.child('meta').update({ host: uid, state: 'lobby' });   /* 방장이 끊겼으면 넘겨받음 */
    // 둘 다 준비 → 방장이 시작 시각을 정한다
    if (meta.host === uid && meta.state === 'lobby' && o && o.ready && me().ready) {
      ref.child('meta').update({ state: 'play', startAt: snow() + 3900, round: (meta.round || 0) + 1 });   /* 3·2·1 각 1.3초 */
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
  var lastClash = 0, myCollapses = 0, oppCollapses = 0;
  function collapsed() { if (!ref || !started) return; myCollapses++; ref.child('players/' + uid + '/collapses').set(myCollapses); if (isHost()) hostLine(2); }   // 내 보드 붕괴 → 전선이 내 쪽으로 2줄
  function onMeta(s) {
    meta = s.val() || {};
    if (started && meta.clash && meta.clash.at && meta.clash.at !== lastClash) { lastClash = meta.clash.at; var c = meta.clash; window.__tank.clash(isHost() ? c.h : c.o, isHost() ? c.o : c.h, isHost() ? c.d : -c.d); }
    if (started && meta.line != null) window.__tank.applyLine(isHost() ? (meta.line | 0) : -(meta.line | 0), meta.nextTick ? meta.nextTick - snow() : null);   // line 은 방장 기준(+ = 방장 쪽으로 밀림) → 상대는 부호 반대
    if (meta.state === 'play' && meta.startAt && meta.startAt !== lastStart) {
      lastStart = meta.startAt; resultUp = false;
      ref.child('players/' + uid).update({ ready: false, over: false, msg: '', t: 0, fire: null, scout: null, hp: 3, front: 0, sol: '', tank: '4,6', collapses: 0, skill: null, ult: 0, shield: 0 }); lastFire = 0; lastClash = 0; lastScout = 0; lastSkill = 0; myCollapses = 0; oppCollapses = 0;
      if (isHost()) ref.child('meta').update({ line: 0, nextTick: meta.startAt + 30000, clash: null });
      ref.child('inbox/' + uid).remove();
      try { window.tankCards(); } catch (e) { } show('count'); lastPub = ''; prevOpp = {}; tick();
    }
    if (meta.state === 'lobby' && !started) { show('room'); renderRoom(); }
  }
  function tick() {
    var left = meta.startAt - snow();
    if (left <= 0) { startGame(); return; }
    var c = Math.max(1, Math.min(3, Math.ceil(left / 1300))); if ($('countNum').textContent != c) { $('countNum').textContent = c; try { SFX.count(); } catch (e) { } }
    startTimer = setTimeout(tick, 100);
  }
  function startGame() {
    started = true; show('none'); window.__tank.newGame(true); pub(true); try { SFX.go(); SFX.ambientStart(); } catch (e) { }
    clearInterval(pubTimer); pubTimer = setInterval(pub, 1000);
    clearInterval(lineTimer); if (isHost()) lineTimer = setInterval(hostTick, 30000);
  }
  function onInbox(s) {
    var v = s.val(); s.ref.remove();
    if (!started) return; var G = window.__tank.get(); if (G.over) return;
    window.__tank.addEnemyInf(v.x | 0);
  }
  var lastFire = 0, prevOpp = {}, lastScout = 0, lastSkill = 0;
  function skill(k) { if (ref && started) ref.child('players/' + uid + '/skill').set({ k: k, t: firebase.database.ServerValue.TIMESTAMP }); }
  function scouted() { if (ref && started) ref.child('players/' + uid + '/scout').set(firebase.database.ServerValue.TIMESTAMP); }
  function fired(x, y, shot) { if (ref) ref.child('players/' + uid + '/fire').set({ x: x, y: y, s: shot ? 1 : 0, t: firebase.database.ServerValue.TIMESTAMP }); }
  function sendInf(x) { var o = oppId(); if (ref && o) ref.child('inbox/' + o).push({ x: x, t: firebase.database.ServerValue.TIMESTAMP }); }
  var lastPub = '';
  function pub(force) {                                                        // 바뀔 때만: 체력 · 내 탱크 위치 · 내 앞의 적 보병(상대에겐 '보낸 보병' 목록) · 최전방 수
    if (!ref || !started) return; var G = window.__tank.get();
    var sol = G.mySol.map(function (e) { return e.x + ':' + e.d; }).join(';'), front = G.mySol.filter(function (e) { return e.d === 1; }).length;
    var k = G.tank.x + ',' + G.tank.y + '/' + sol + '/' + G.tank.hp + '/' + G.ult + '/' + G.shield + '/' + G.board.map(function (r) { return r.filter(Boolean).length; }).join(''); if (k === lastPub && !force) return; lastPub = k;
    var empty = 0; for (var y = Math.max(0, G.adv); y < G.board.length; y++) for (var x = 0; x < G.board[0].length; x++) if (!G.board[y][x]) empty++;
    ref.child('players/' + uid).update({ tank: G.tank.x + ',' + G.tank.y, sol: sol, front: front, inf: G.mySol.length, hp: G.tank.hp, empty: empty, fac: G.fac, ult: G.ult, shield: G.shield });
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
    var rf = window.__tank.FAC && window.__tank.FAC[G.fac] ? G.fac : 'solar'; $('result').style.backgroundImage = 'linear-gradient(rgba(8,10,6,.35), rgba(8,10,6,.75)), url(assets/v2/res_' + rf + '_' + (r === 'win' ? 'win' : 'lose') + '.jpg)';   // 세력별 결과 배경
    $('resTitle').textContent = r === 'win' ? 'VICTORY' : r === 'lose' ? 'DEFEAT' : 'DRAW';
    $('resTitle').className = r;
    var cpu = window.NET === window.BOT; lastScore = G.score | 0; subDone = false; $('sub').style.display = cpu && lastScore > 0 ? '' : 'none'; $('subMsg').textContent = ''; $('subBtn').disabled = false; $('subName').value = name || '';
    $('resText').textContent = detail + ' · 점수 ' + G.score.toLocaleString('en-US') + ' · 지운 줄 ' + G.lines + ' · 격파 ' + G.kills + ' · 보낸 보병 ' + G.sent;
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

  // ---------- 스코어보드 (CPU 대전 점수) ----------
  var RANK_COL = 'tank_scores_test', lastScore = 0, subDone = false;
  function fs() { init(); return app.firestore(); }
  function openRank() {
    if (!init()) return; show('rank'); $('rankList').textContent = '불러오는 중…';
    login().then(function () { return fs().collection(RANK_COL).orderBy('score', 'desc').limit(30).get(); }).then(function (q) {
      var html = '', i = 0; q.forEach(function (d) { var v = d.data(); i++; var f = (window.DG_FAC_BY_ID || {})[v.faction] || 'solar';
        html += '<div class="rk' + (v.uid === uid ? ' me' : '') + '"><span class="n">' + i + '</span><img src="assets/v2/f_' + f + '.png" alt=""><span>' + esc(v.name) + '</span><span class="s">' + (v.score | 0).toLocaleString('en-US') + '</span></div>'; });
      $('rankList').innerHTML = html || '<div class="pl dim">아직 기록이 없어요. 첫 기록을 세워 보세요!</div>';
    }).catch(function (e) { $('rankList').textContent = '불러오지 못했어요: ' + (e.message || e); });
  }
  function submitScore() {
    if (subDone || !lastScore) return; var nm = ($('subName').value || '').trim().slice(0, 12); if (!nm) { $('subMsg').textContent = '이름을 넣어 주세요.'; return; }
    name = nm; try { localStorage.setItem('tank_name', nm); } catch (e) { } $('subBtn').disabled = true; $('subMsg').textContent = '등록 중…';
    if (!init()) return; login().then(function () {
      var f = (window.DG_FAC || {})[window.__tank.get().fac], d = new Date(), date = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      var b = fs().batch(), ts = firebase.firestore.FieldValue.serverTimestamp();
      b.set(fs().collection('users').doc(uid), { last: ts });
      b.set(fs().collection(RANK_COL).doc(), { name: nm, score: Math.min(1000000, lastScore | 0), date: date, flag: '', faction: f ? f.id : 3, uid: uid });
      return b.commit();
    }).then(function () { subDone = true; $('subMsg').textContent = '등록 완료! 🏆 스코어보드에서 확인하세요.'; $('sub').style.display = 'none'; })
      .catch(function (e) { $('subBtn').disabled = false; $('subMsg').textContent = (String(e.message || e).indexOf('permission') >= 0 ? '잠시 후 다시 시도해 주세요(20초에 한 번).' : '등록 실패: ' + (e.message || e)); });
  }
  // ---------- 버튼 ----------
  $('rankBtn').addEventListener('click', openRank);
  $('rankBack').addEventListener('click', function () { show('ov'); });
  $('subBtn').addEventListener('click', submitScore);
  $('vsBtn').addEventListener('click', function () { if (window.BOT) BOT.stop(); window.NET = window.REALNET; openLobby(); });
  $('mkBtn').addEventListener('click', create);
  $('joinBtn').addEventListener('click', function () { join($('code').value); });
  $('lbBack').addEventListener('click', function () { watchRooms(false); lobbyChat(false); show('ov'); });
  $('shareBtn').addEventListener('click', share);
  $('readyBtn').addEventListener('click', ready);
  $('leaveBtn').addEventListener('click', leave);
  $('againBtn').addEventListener('click', again);
  $('resLeave').addEventListener('click', leave);
  // 초대 링크로 들어온 경우
  try { var rq = new URLSearchParams(location.search).get('room'); if (rq) { openLobby(); $('code').value = rq.toUpperCase(); if (name) join(rq); else msg('lbMsg', '이름을 넣고 [참가]를 누르세요.'); } } catch (e) { }
  return { finish: finish, show: show, opp: opp, sendInf: sendInf, fired: fired, scouted: scouted, skill: skill, collapsed: collapsed, _hostTick: hostTick, pub: pub, over: over, uid: function () { return uid; }, _state: function () { return { code: code, players: players, meta: meta, started: started }; } };
})();
