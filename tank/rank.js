/* 탱크럼블 순위판 — Firestore tank_scores_test (탱크대전 테스트 기록과 같은 칸, flag:'TR' 로 구분) · 익명 로그인 */
window.TR_RANK = (function () {
  'use strict';
  var COL = 'tank_scores_test', TAG = 'TR', FID = { surge: 1, gale: 2, solar: 3 }, FBY = { 1: 'surge', 2: 'gale', 3: 'solar' };
  var app = null, authed = null, uid = '', last = 0, lastFac = 'solar', done = false;
  var $ = function (id) { return document.getElementById(id); };
  function init() { if (app) return true; try { app = firebase.initializeApp(window.DG_FIREBASE, 'tankrumble'); return true; } catch (e) { return false; } }
  function login() { if (authed) return authed; authed = app.auth().signInAnonymously().then(function (c) { uid = c.user.uid; return uid; }).catch(function (e) { authed = null; throw e; }); return authed; }
  function fs() { return app.firestore(); }
  function esc(s) { return String(s || '').replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }
  function load(box) {
    var el = $(box); if (!el) return; if (!init()) { el.textContent = '순위판을 열 수 없어요'; return; } el.textContent = '불러오는 중…';
    login().then(function () { return fs().collection(COL).orderBy('score', 'desc').limit(150).get(); }).then(function (q) {
      var html = '', i = 0; q.forEach(function (d) { var v = d.data(); if (v.flag !== TAG || i >= 10) return; i++;
        html += '<div class="rk' + (v.uid === uid ? ' me' : '') + '"><span class="n">' + i + '</span><img src="assets/v2/f_' + (FBY[v.faction] || 'solar') + '.png" alt=""><span>' + esc(v.name) + '</span><span class="s">' + (v.score | 0).toLocaleString('en-US') + '</span></div>'; });
      el.innerHTML = html || '<div class="rk"><span></span><span></span><span>아직 기록이 없어요. 첫 기록을 세워 보세요!</span><span></span></div>';
    }).catch(function (e) { el.textContent = '불러오지 못했어요'; });
  }
  function submit() {
    if (done || !last) return; var nm = ($('subName').value || '').trim().slice(0, 12); if (!nm) { $('subMsg').textContent = '이름을 넣어 주세요'; return; }
    try { localStorage.setItem('tank_name', nm); } catch (e) { } $('subBtn').disabled = true; $('subMsg').textContent = '등록 중…';
    if (!init()) return; login().then(function () {
      var d = new Date(), date = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2), b = fs().batch();
      b.set(fs().collection('users').doc(uid), { last: firebase.firestore.FieldValue.serverTimestamp() });
      b.set(fs().collection(COL).doc(), { name: nm, score: Math.min(1000000, last | 0), date: date, flag: TAG, faction: FID[lastFac] || 3, uid: uid });
      return b.commit();
    }).then(function () { done = true; $('subMsg').textContent = '등록 완료!'; $('sub').style.display = 'none'; load('endRank'); })
      .catch(function (e) { $('subBtn').disabled = false; $('subMsg').textContent = String(e.message || e).indexOf('permission') >= 0 ? '잠시 후 다시 눌러 주세요 (20초에 한 번)' : '등록 실패'; });
  }
  function onEnd(score, fac) {
    last = score | 0; lastFac = fac; done = false; $('subMsg').textContent = ''; $('subBtn').disabled = false;
    try { $('subName').value = localStorage.getItem('tank_name') || ''; } catch (e) { }
    $('sub').style.display = last > 0 ? '' : 'none'; $('endRank').style.display = ''; load('endRank');
  }
  document.addEventListener('DOMContentLoaded', function () {
    $('subBtn').addEventListener('click', submit);
    $('rankBtn').addEventListener('click', function () { $('rank').classList.remove('hidden'); load('rankList'); });
    $('rankBack').addEventListener('click', function () { $('rank').classList.add('hidden'); });
  });
  return { onEnd: onEnd, load: load };
})();
