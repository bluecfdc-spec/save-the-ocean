/* TANK RUMBLE — 효과음 (Web Audio 합성, 음원 파일 없음)
   SFX.click / pick / place / bad / clear(n) / gain(kind) / step / scout / launch / boom(big) / warn / advance / retreat /
   sweepStart·sweepStop / send / inf / over / win / lose / count / go / ambientStart·ambientStop / mute(on)
*/
window.SFX = (function () {
  'use strict';
  var ctx = null, master, sfx, bgm, muted = false, ambient = null, sweepNode = null, engine = null;
  // iOS 무음 스위치 우회 + 첫 터치에 오디오 깨우기
  var silentEl = null, unmuted = false;
  function iosUnmute() {
    if (unmuted) return; unmuted = true;
    try { silentEl = document.createElement('audio'); silentEl.setAttribute('playsinline', ''); silentEl.loop = true; silentEl.volume = 0.01;
      silentEl.src = 'data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      var p = silentEl.play(); if (p && p.catch) p.catch(function () { unmuted = false; }); } catch (e) { unmuted = false; }
  }
  function revive() { try { if (ctx && ctx.state !== 'running') { var p = ctx.resume(); if (p && p.catch) p.catch(function () { }); } } catch (e) { } }
  document.addEventListener('pointerdown', function () { iosUnmute(); ensure(); revive(); }, { passive: true });
  document.addEventListener('touchend', function () { iosUnmute(); revive(); }, { passive: true });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) revive(); });
  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
    bgm = ctx.createGain(); bgm.gain.value = 1; bgm.connect(master);
    return true;
  }
  function noise(sec) { var n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }
  function env(g, t, a, peak, d, end) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end || 0.0001, t + d); }
  function tone(type, f0, f1, dur, peak, t, dest, a) {           // 간단한 오실레이터 한 방
    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; t = t == null ? ctx.currentTime : t;
    o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, a || 0.01, peak, dur); o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  function burst(dur, peak, lp, hp, t, dest, q) {                 // 노이즈 한 방 (필터)
    var s = ctx.createBufferSource(); s.buffer = noise(dur + 0.05); t = t == null ? ctx.currentTime : t;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 4000; f.Q.value = q || 0.7;
    var h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp || 60;
    var g = ctx.createGain(); env(g, t, 0.005, peak, dur);
    s.connect(f); f.connect(h); h.connect(g); g.connect(dest || sfx); s.start(t); s.stop(t + dur + 0.1); return { f: f, g: g };
  }
  var S = {};
  // 배경음악 (mp3 반복). 첫 터치 때 켜고, 화면을 내렸다 올리면 되살림
  var bgmEl = null, bgmOn = false;
  S.bgmStart = function () {
    bgmOn = true;
    if (!bgmEl) { bgmEl = new Audio('assets/bgm.mp3'); bgmEl.loop = true; bgmEl.volume = 0.45; bgmEl.setAttribute('playsinline', ''); bgmEl.preload = 'auto'; }
    bgmEl.muted = muted; var p = bgmEl.play(); if (p && p.catch) p.catch(function () { });
  };
  S.bgmStop = function () { bgmOn = false; if (bgmEl) bgmEl.pause(); };
  document.addEventListener('pointerdown', function () { if (!bgmOn) S.bgmStart(); else if (bgmEl && bgmEl.paused) S.bgmStart(); }, { passive: true });
  document.addEventListener('visibilitychange', function () { if (!bgmEl) return; if (document.hidden) bgmEl.pause(); else if (bgmOn) { var p = bgmEl.play(); if (p && p.catch) p.catch(function () { }); } });
  S.mute = function (on) { muted = on; if (master) master.gain.value = on ? 0 : 0.9; if (bgmEl) bgmEl.muted = on; };
  S.click = function () { if (!ensure()) return; tone('square', 900, 700, 0.06, 0.08); };
  S.pick = function () { if (!ensure()) return; tone('triangle', 500, 760, 0.07, 0.12); };
  S.place = function () {                                          // 묵직한 "쿵"
    if (!ensure()) return; var t = ctx.currentTime;
    tone('sine', 160, 55, 0.22, 0.6, t); burst(0.12, 0.35, 900, 80, t); burst(0.05, 0.25, 6000, 1500, t);
  };
  S.bad = function () { if (!ensure()) return; var t = ctx.currentTime; tone('sawtooth', 160, 120, 0.18, 0.12, t); tone('sawtooth', 165, 118, 0.18, 0.1, t + 0.02); };
  S.clear = function (n) {                                         // 금빛 아르페지오, 줄 수만큼 길어짐
    if (!ensure()) return; var t = ctx.currentTime, notes = [523, 659, 784, 1047, 1319, 1568];
    var k = Math.min(notes.length, 3 + (n || 1));
    for (var i = 0; i < k; i++) { tone('triangle', notes[i], notes[i], 0.35, 0.22, t + i * 0.07); tone('sine', notes[i] * 2, notes[i] * 2, 0.25, 0.08, t + i * 0.07); }
    var b = burst(0.5, 0.18, 8000, 1500, t); b.f.frequency.setValueAtTime(1200, t); b.f.frequency.exponentialRampToValueAtTime(9000, t + 0.4);
  };
  S.gain = function (kind) {                                       // 자원 획득 '띠링' (종류별 음높이)
    if (!ensure()) return; var t = ctx.currentTime, f = { 2: 880, 3: 1175, 4: 1480, 5: 1760 }[kind] || 988;
    tone('sine', f, f, 0.18, 0.14, t); tone('sine', f * 1.5, f * 1.5, 0.22, 0.1, t + 0.06);
  };
  S.step = function () {                                           // 탱크 한 칸 이동: 엔진 부르릉 + 캐터필러 철컥
    if (!ensure()) return; var t = ctx.currentTime;
    tone('sawtooth', 70, 95, 0.14, 0.18, t); tone('square', 48, 60, 0.14, 0.1, t);
    burst(0.06, 0.12, 2500, 800, t + 0.03);
  };
  S.scout = function () {                                          // 레이더 핑 3번 + 스윕
    if (!ensure()) return; var t = ctx.currentTime;
    for (var i = 0; i < 3; i++) tone('sine', 1500, 1400, 0.5, 0.14, t + i * 0.28, sfx, 0.01);
    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
    env(g, t, 0.05, 0.08, 1.0); o.connect(g); g.connect(sfx); o.start(t); o.stop(t + 1.1);
  };
  S.launch = function () {                                         // 미사일 발사 슈욱
    if (!ensure()) return; var t = ctx.currentTime;
    var b = burst(0.6, 0.35, 3000, 300, t, sfx, 2); b.f.frequency.setValueAtTime(400, t); b.f.frequency.exponentialRampToValueAtTime(5000, t + 0.5);
    tone('sawtooth', 220, 900, 0.5, 0.1, t);
  };
  S.boom = function (big) {                                        // 폭발
    if (!ensure()) return; var t = ctx.currentTime, d = big ? 1.1 : 0.55;
    tone('sine', big ? 110 : 150, 30, d * 0.8, big ? 0.6 : 0.4, t);
    var b = burst(d, big ? 0.5 : 0.35, 2500, 40, t); b.f.frequency.setValueAtTime(3000, t); b.f.frequency.exponentialRampToValueAtTime(150, t + d);
    burst(0.08, 0.4, 8000, 2000, t);
    if (big) tone('square', 60, 35, 0.9, 0.2, t + 0.05);
  };
  S.warn = function () {                                           // 진격 임박: 낮은 북 + 쇠붙이 긁힘 (엄숙하게)
    if (!ensure()) return; var t = ctx.currentTime;
    tone('sine', 110, 50, 0.4, 0.4, t); burst(0.08, 0.25, 700, 80, t);
    var m = burst(0.35, 0.08, 5000, 1800, t + 0.05, sfx, 6); m.f.frequency.setValueAtTime(2200, t + 0.05); m.f.frequency.exponentialRampToValueAtTime(900, t + 0.4);
  };
  S.advance = function () {                                        // 적 진격: 전차가 밀고 지나가는 땅울림 + 캐터필러 + 낮은 단조 화음
    if (!ensure()) return; var t = ctx.currentTime;
    tone('sine', 60, 26, 1.6, 0.8, t, sfx, 0.03);                                                     // 지반 울림
    var r = burst(1.8, 0.45, 260, 30, t, sfx, 0.8); r.f.frequency.setValueAtTime(140, t); r.f.frequency.linearRampToValueAtTime(320, t + 0.9); r.f.frequency.linearRampToValueAtTime(120, t + 1.8);   // 구르는 소음
    for (var i = 0; i < 9; i++) burst(0.05, 0.14, 2200, 400, t + 0.15 + i * 0.17);                     // 캐터필러 철컥
    [[110, 0.0], [130.8, 0.05], [164.8, 0.1], [82.4, 0.0]].forEach(function (n) { tone('triangle', n[0], n[0] * 0.985, 1.7, 0.09, t + n[1], sfx, 0.25); tone('sawtooth', n[0] / 2, n[0] / 2 * 0.985, 1.7, 0.025, t + n[1], sfx, 0.3); });   // Am 저음 화음
  };
  function taiko(t, f, peak) {                                     // 큰 북: 낮은 몸통 + 가죽 타격음
    tone('sine', f, f * 0.42, 0.55, peak, t, sfx, 0.004);
    tone('triangle', f * 1.6, f * 0.6, 0.18, peak * 0.35, t, sfx, 0.003);
    burst(0.09, peak * 0.5, 1400, 90, t);
  }
  function brass(t, f, dur, peak) {                                // 낮은 금관 스탭: 톱니파 + 필터가 열렸다 닫힘
    [1, 1.5, 2].forEach(function (k, i) {
      var o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f * k; o.detune.value = (i - 1) * 7;
      lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(1600, t + 0.06); lp.frequency.exponentialRampToValueAtTime(260, t + dur);
      env(g, t, 0.02, peak / (i + 1), dur); o.connect(lp); lp.connect(g); g.connect(sfx); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  S.retreat = function () {                                        // 적 후퇴: 전장 북 비트(둥-둥-둥 두둥!) + 낮은 금관 D 파워코드 + 심벌
    if (!ensure()) return; var t = ctx.currentTime;
    taiko(t, 70, 0.55); taiko(t + 0.16, 70, 0.4); taiko(t + 0.32, 74, 0.5);
    taiko(t + 0.56, 62, 0.7); taiko(t + 0.64, 62, 0.75);
    brass(t + 0.56, 73.4, 1.1, 0.16);                                // D2 + A2 + D3
    var c = burst(1.4, 0.16, 9000, 3000, t + 0.56); c.f.frequency.setValueAtTime(9000, t + 0.56); c.f.frequency.exponentialRampToValueAtTime(3500, t + 1.9);   // 심벌 크래시
    tone('sine', 36.7, 30, 1.3, 0.35, t + 0.56, sfx, 0.01);          // 서브 저음
  };
  S.sweepStart = function () {                                     // 놓을 곳 없음 → 쓸려 나가는 동안 경보 + 땅울림
    if (!ensure() || sweepNode) return; var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 50;
    var l = ctx.createOscillator(), lg = ctx.createGain(); l.type = 'sine'; l.frequency.value = 9; lg.gain.value = 20; l.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.3); o.connect(g); g.connect(sfx); o.start(t); l.start(t);
    var a = ctx.createOscillator(), ag = ctx.createGain(); a.type = 'square'; a.frequency.value = 700;
    var al = ctx.createOscillator(), alg = ctx.createGain(); al.type = 'square'; al.frequency.value = 4; alg.gain.value = 250; al.connect(alg); alg.connect(a.frequency);
    ag.gain.value = 0.06; a.connect(ag); ag.connect(sfx); a.start(t); al.start(t);
    sweepNode = { stop: function () { var e = ctx.currentTime; g.gain.exponentialRampToValueAtTime(0.0001, e + 0.3); ag.gain.setValueAtTime(0, e); setTimeout(function () { try { o.stop(); l.stop(); a.stop(); al.stop(); } catch (x) { } }, 400); } };
  };
  S.sweepStop = function () { if (sweepNode) { sweepNode.stop(); sweepNode = null; } };
  S.send = function () {                                           // 보병 출격: 호루라기 + 북
    if (!ensure()) return; var t = ctx.currentTime;
    tone('square', 2200, 2600, 0.25, 0.12, t); tone('square', 2600, 2000, 0.25, 0.1, t + 0.25);
    for (var i = 0; i < 4; i++) { tone('sine', 120, 60, 0.12, 0.35, t + 0.5 + i * 0.16); burst(0.05, 0.2, 2000, 300, t + 0.5 + i * 0.16); }
  };
  S.inf = function () { if (!ensure()) return; var t = ctx.currentTime; tone('sawtooth', 220, 180, 0.3, 0.12, t); tone('square', 440, 440, 0.12, 0.06, t + 0.1); tone('square', 440, 440, 0.12, 0.06, t + 0.3); };
  S.over = function () {                                           // 패배/게임오버: 내려가는 화음
    if (!ensure()) return; var t = ctx.currentTime;
    [[392, 0], [311, 0.3], [262, 0.6], [196, 0.9]].forEach(function (p) { tone('triangle', p[0], p[0] * 0.97, 0.9, 0.2, t + p[1]); tone('sawtooth', p[0] / 2, p[0] / 2 * 0.97, 0.9, 0.06, t + p[1]); });
  };
  S.lose = S.over;
  S.win = function () {                                            // 승리 팡파르
    if (!ensure()) return; var t = ctx.currentTime, n = [523, 523, 523, 659, 784, 1047];
    n.forEach(function (f, i) { var d = i === 5 ? 0.9 : 0.16; tone('square', f, f, d, 0.14, t + i * 0.17); tone('triangle', f / 2, f / 2, d, 0.12, t + i * 0.17); tone('sine', f * 2, f * 2, d, 0.04, t + i * 0.17); });
    burst(0.8, 0.12, 8000, 2000, t + 0.85);
  };
  S.drum = function () { if (!ensure()) return; var t = ctx.currentTime; tone('sine', 95, 45, 0.35, 0.5, t); burst(0.12, 0.3, 900, 60, t); tone('sine', 95, 45, 0.3, 0.35, t + 0.22); };
  S.clash = function () {                                          // 전선 교전: 2.5초 총격·함성 느낌 (노이즈 따닥 + 낮은 북)
    if (!ensure()) return; var t = ctx.currentTime;
    for (var i = 0; i < 18; i++) { var tt = t + Math.random() * 2.2; burst(0.05, 0.16, 3500, 500, tt, sfx, 2); if (i % 3 === 0) tone('square', 160 + Math.random() * 60, 90, 0.08, 0.05, tt); }
    for (var k = 0; k < 5; k++) tone('sine', 80, 40, 0.3, 0.3, t + k * 0.5);
  };
  S.count = function () { if (!ensure()) return; tone('square', 660, 660, 0.12, 0.12); };
  S.go = function () { if (!ensure()) return; var t = ctx.currentTime; tone('square', 1047, 1047, 0.45, 0.16, t); tone('square', 1319, 1319, 0.45, 0.1, t); };
  S.ambientStart = function () {                                   // 전장 배경음: 바람 + 멀리서 포성
    if (!ensure() || ambient) return;
    var g = ctx.createGain(); g.gain.value = 0; g.connect(bgm);
    var s = ctx.createBufferSource(); s.buffer = noise(4); s.loop = true;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 0.8;
    var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.type = 'sine'; lfo.frequency.value = 0.11; lg.gain.value = 220; lfo.connect(lg); lg.connect(f.frequency);
    var ng = ctx.createGain(); ng.gain.value = 0.35; s.connect(f); f.connect(ng); ng.connect(g);
    var dr = ctx.createOscillator(), dg = ctx.createGain(); dr.type = 'triangle'; dr.frequency.value = 55; dg.gain.value = 0.05; dr.connect(dg); dg.connect(g);
    s.start(); lfo.start(); dr.start(); g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);
    var timer = setInterval(function () { if (!ambient) return; if (Math.random() < 0.5) { var t = ctx.currentTime; tone('sine', 70, 35, 1.2, 0.18, t, bgm); burst(1.0, 0.1, 500, 40, t, bgm); } }, 5000);
    ambient = { stop: function () { clearInterval(timer); g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1); setTimeout(function () { try { s.stop(); lfo.stop(); dr.stop(); } catch (e) { } }, 1200); } };
  };
  S.ambientStop = function () { if (ambient) { ambient.stop(); ambient = null; } };
  return S;
})();
