// 붕붕 — 효과음 (파일 없이 Web Audio로 합성)
// 마이크 모드에서는 효과음이 마이크로 다시 들어가 붕/끼익으로 오인되지 않게,
// 소리가 나는 동안 잠깐 마이크 판단을 멈춘다 (micMuted).
(function () {
  const BB = window.BB || (window.BB = {});
  let ctx = null, master = null, eng = null;
  let muteUntil = 0;

  function ensure() {
    if (!ctx) {
      const shared = BB.Audio && BB.Audio.ctx && BB.Audio.ctx();
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = shared || new AC();
      master = ctx.createGain();
      master.gain.value = Sfx.volume;
      master.connect(ctx.destination);
    }
    if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
    return ctx;
  }

  function duck(sec) { muteUntil = Math.max(muteUntil, performance.now() + sec * 1000 + 150); }

  function tone(o) {
    const c = ensure(); if (!c || !Sfx.on) return;
    const t = c.currentTime + (o.delay || 0), dur = o.dur || 0.2;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const v = o.vol == null ? 0.25 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
    duck((o.delay || 0) + dur);
  }

  function noise(o) {
    const c = ensure(); if (!c || !Sfx.on) return;
    const t = c.currentTime + (o.delay || 0), dur = o.dur || 0.2;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.f || 800; bp.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t);
    duck((o.delay || 0) + dur);
  }

  const Sfx = {
    on: true,
    volume: 0.5,
    unlock() { ensure(); },
    micMuted() { return performance.now() < muteUntil; },
    // 자동차 경적: 두 음(약 370·465Hz, 장3도)이 동시에 + 살짝 찌그러뜨리고 경적 울림통처럼 대역 필터
    horn() {
      const c = ensure(); if (!c || !Sfx.on) return;
      const t = c.currentTime, dur = 0.42;
      const mix = c.createGain(); mix.gain.value = 0.5;
      [370, 466].forEach((f, i) => {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.97, t);
        o.frequency.linearRampToValueAtTime(f, t + 0.04);          // 누르는 순간 살짝 올라가며 붙는 느낌
        o.detune.value = i ? 6 : -6;
        o.connect(mix); o.start(t); o.stop(t + dur + 0.08);
      });
      const shaper = c.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; curve[i] = Math.tanh(x * 3); }
      shaper.curve = curve;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const env = c.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
      env.gain.setValueAtTime(0.35, t + dur - 0.06);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      mix.connect(shaper); shaper.connect(bp); bp.connect(lp); lp.connect(env); env.connect(master);
      duck(dur);
    },
    bump() {
      // 벽을 따라 긁을 때 연달아 나지 않게 0.5초에 한 번
      const now = performance.now();
      if (now - (Sfx._bumpAt || 0) < 500) return;
      Sfx._bumpAt = now;
      tone({ type: 'sine', f0: 140, f1: 45, dur: 0.18, vol: 0.4 });
      noise({ dur: 0.08, vol: 0.15, f: 400 });
    },
    star() {
      tone({ type: 'triangle', f0: 1046, dur: 0.09, vol: 0.18 });
      tone({ type: 'triangle', f0: 1568, dur: 0.14, vol: 0.18, delay: 0.07 });
    },
    turbo() { tone({ type: 'sawtooth', f0: 180, f1: 900, dur: 0.45, vol: 0.12 }); },
    fall() { tone({ type: 'sine', f0: 700, f1: 110, dur: 0.6, vol: 0.2 }); },
    respawn() { tone({ type: 'triangle', f0: 523, dur: 0.08, vol: 0.15 }); tone({ type: 'triangle', f0: 784, dur: 0.1, vol: 0.15, delay: 0.08 }); },
    arrive() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: i === 3 ? 0.5 : 0.14, vol: 0.2, delay: i * 0.12 }));
    },
    record() {
      [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.12, vol: 0.08, delay: 0.7 + i * 0.09 }));
    },
    // 버튼 모드 전용 엔진 소리 (마이크 모드에선 마이크로 들어가니 끔)
    engine(speed01, on) {
      const c = ensure(); if (!c) return;
      if (!eng) {
        const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
        o.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 500;
        g.gain.value = 0;
        o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
        o.start(); o2.start();
        eng = { o, o2, g };
      }
      const t = c.currentTime;
      const f = 55 + speed01 * 110;
      eng.o.frequency.setTargetAtTime(f, t, 0.08);
      eng.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
      eng.g.gain.setTargetAtTime(on && Sfx.on ? 0.035 + speed01 * 0.03 : 0, t, 0.1);
    },
  };
  BB.Sfx = Sfx;
})();
