// Web Audio 합성 사운드 — 외부 음원 파일 없이 동작 (오프라인 OK)
(function () {
  const S = {};
  let ctx = null, master = null, ambient = null, muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    return true;
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ── 심해 배경음: 저역 노이즈 + 낮은 드론 + 느린 파동 ──
  S.startAmbient = function () {
    if (!ensure() || ambient) return;
    const g = ctx.createGain(); g.gain.value = 0.0; g.connect(master);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(4); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 0.7;
    const ng = ctx.createGain(); ng.gain.value = 0.55;
    src.connect(lp); lp.connect(ng); ng.connect(g);

    // 느린 파동 (LFO → 필터 주파수)
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain(); lfoG.gain.value = 120;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);

    // 낮은 드론
    const drone = ctx.createOscillator(); drone.type = 'sine'; drone.frequency.value = 46;
    const dg = ctx.createGain(); dg.gain.value = 0.12;
    const drone2 = ctx.createOscillator(); drone2.type = 'triangle'; drone2.frequency.value = 69.3;
    const dg2 = ctx.createGain(); dg2.gain.value = 0.05;
    drone.connect(dg); dg.connect(g); drone2.connect(dg2); dg2.connect(g);

    // 이따금 나는 소나 '핑'
    const pingTimer = setInterval(() => {
      if (!ambient || muted) return;
      if (Math.random() < 0.45) S.sonar();
    }, 6500);

    src.start(); lfo.start(); drone.start(); drone2.start();
    g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5);
    ambient = { g, stop() { clearInterval(pingTimer); g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1); setTimeout(() => { try { src.stop(); lfo.stop(); drone.stop(); drone2.stop(); } catch (e) {} }, 1200); } };
  };
  S.stopAmbient = function () { if (ambient) { ambient.stop(); ambient = null; } };

  S.sonar = function () {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1180;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.7);
  };

  // ── 폭탄 투하 "똥~" : 물방울 떨어지는 느낌의 피치 다운 ──
  S.drop = function () {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.65);
    // 퐁 — 짧은 물 튀는 소리
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(0.2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 2;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.18, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(bp); bp.connect(ng); ng.connect(master); n.start(t); n.stop(t + 0.2);
  };

  // ── 잠수정 격파 : 물속 둔탁한 폭발 ──
  S.boom = function (big) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(0.8);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(big ? 900 : 600, t); lp.frequency.exponentialRampToValueAtTime(80, t + 0.7);
    const g = ctx.createGain(); g.gain.setValueAtTime(big ? 0.9 : 0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    n.connect(lp); lp.connect(g); g.connect(master); n.start(t); n.stop(t + 0.8);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.5);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.7, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.6);
  };

  // ── 빨간 잠수정 격파 : 포인트 올라가는 상승 아르페지오 ──
  S.points = function () {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const g = ctx.createGain();
      const st = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.16, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.16);
      o.connect(g); g.connect(master); o.start(st); o.stop(st + 0.18);
    });
  };

  // ── 군함 피격 "콰직" : 금속 찢어지는 노이즈 + 저음 충격 ──
  S.hit = function () {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(300, t + 0.35);
    const g = ctx.createGain(); g.gain.setValueAtTime(1.0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    const dist = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
    dist.curve = curve;
    n.connect(bp); bp.connect(dist); dist.connect(g); g.connect(master); n.start(t); n.stop(t + 0.5);
    // 우지끈 — 짧은 딱딱 소리 3번
    for (let i = 0; i < 3; i++) {
      const c = ctx.createBufferSource(); c.buffer = noiseBuffer(0.04);
      const cg = ctx.createGain(); const st = t + 0.05 + i * 0.06;
      cg.gain.setValueAtTime(0.6, st); cg.gain.exponentialRampToValueAtTime(0.0001, st + 0.04);
      c.connect(cg); cg.connect(master); c.start(st); c.stop(st + 0.05);
    }
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.4);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.5);
  };

  // ── 침몰 : 길고 낮은 붕괴음 ──
  S.sink = function () {
    if (!ensure()) return;
    const t = ctx.currentTime;
    S.hit();
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(160, t + 0.2); o.frequency.exponentialRampToValueAtTime(30, t + 2.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    o.connect(lp); lp.connect(g); g.connect(master); o.start(t + 0.2); o.stop(t + 2.4);
  };

  S.click = function () {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 880;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.07);
  };

  // ── 파도/물살 : 수면 소리. 게임 중 상시 잔잔하게, 이동 시 커짐 ──
  let sea = null;
  S.seaStart = function () {
    if (!ensure() || sea) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(5); src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 1.5);
    // 느린 파도 너울 (볼륨·필터 동시에)
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.45;
    const lg = ctx.createGain(); lg.gain.value = 0.03; lfo.connect(lg); lg.connect(g.gain);
    const lf = ctx.createGain(); lf.gain.value = 180; lfo.connect(lf); lf.connect(lp.frequency);
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master);
    src.start(); lfo.start();
    sea = { src, lfo, g, lp, moving: false };
  };
  S.seaStop = function () {
    if (!sea) return; const s = sea; sea = null; const t = ctx.currentTime;
    s.g.gain.cancelScheduledValues(t); s.g.gain.setValueAtTime(Math.max(0.0001, s.g.gain.value), t);
    s.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    setTimeout(() => { try { s.src.stop(); s.lfo.stop(); } catch (e) {} }, 900);
  };
  // 이동 중이면 물살이 커지고 조금 더 밝아짐
  S.wake = function (on) {
    if (!sea || sea.moving === on) return;
    sea.moving = on; const t = ctx.currentTime;
    sea.g.gain.cancelScheduledValues(t); sea.g.gain.setValueAtTime(Math.max(0.0001, sea.g.gain.value), t);
    sea.g.gain.linearRampToValueAtTime(on ? 0.26 : 0.07, t + (on ? 0.25 : 0.6));
    sea.lp.frequency.cancelScheduledValues(t);
    sea.lp.frequency.linearRampToValueAtTime(on ? 900 : 520, t + 0.3);
  };

  S.setMuted = function (m) { muted = m; if (master) master.gain.value = m ? 0 : 0.9; };
  S.isMuted = () => muted;
  S.unlock = ensure;

  window.SFX = S;
})();
