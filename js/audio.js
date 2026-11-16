// 붕붕 — 마이크 소리 분석
// 단어를 알아듣는 게 아니라 "소리의 모양"(크기 + 높이)만 본다.
//   크기: 파형 RMS를 dB로
//   높이: 주변 소음을 뺀 스펙트럼의 무게중심(Hz)을 log2로 (옥타브 단위)
// 낮고 울리는 소리 → 붕(가속), 높고 날카로운 소리 → 끼익(드리프트)
(function () {
  const BB = window.BB || (window.BB = {});

  const F_LO = 70, F_HI = 8000;          // 분석할 주파수 범위
  const PITCH_MIN = Math.log2(100);      // 막대 표시 범위
  const PITCH_MAX = Math.log2(5000);

  let ctx = null, analyser = null, stream = null;
  let td = null, fd = null, noiseSpec = null;
  let binHz = 0, iLo = 0, iHi = 0;

  // 보정값 (보정 전에도 쓸 수 있게 기본값)
  const cal = {
    noiseDb: -70,
    boongDb: -30, kkiikDb: -30,
    boongPitch: Math.log2(400), kkiikPitch: Math.log2(2200),
    thrOn: -55,
    split: Math.log2(950),
    good: false,
  };

  // 매 프레임 결과
  const out = {
    ready: false,
    db: -100, pitch: Math.log2(300),   // 지금 소리 (부드럽게)
    type: 'none',                       // 'none' | 'boong' | 'kkiik'
    intensity: 0,                       // 붕 세기 0..1.4
    holdT: 0,                           // 지금 소리를 낸 지 몇 초
    silentT: 0,                         // 조용해진 지 몇 초
  };

  // 분류 상태 (짧은 끊김/떨림에 흔들리지 않게)
  let activeRaw = false, offT = 0;
  let cand = 'none', candT = 0;

  // 키보드 대체 입력 (마이크 없을 때/컴퓨터 테스트용)
  const keys = { boong: false, kkiik: false };

  // aec: 친구 목소리를 들을 때는 반향 제거를 켜서, 스피커로 나온 친구 소리가 내 차를 움직이지 않게
  let aecOn = false, src = null;
  async function init(opts) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') await ctx.resume();
    aecOn = !!(opts && opts.aec);
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: aecOn, noiseSuppression: false, autoGainControl: false },
    });
    src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.25;
    src.connect(analyser);
    td = new Float32Array(analyser.fftSize);
    fd = new Float32Array(analyser.frequencyBinCount);
    noiseSpec = new Float32Array(analyser.frequencyBinCount);
    binHz = ctx.sampleRate / analyser.fftSize;
    iLo = Math.max(1, Math.ceil(F_LO / binHz));
    iHi = Math.min(fd.length - 1, Math.floor(F_HI / binHz));
    out.ready = true;
  }

  function resume() { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}); }

  // 반향 제거 설정을 바꿔 마이크 다시 열기 (보정값·소음 스펙트럼은 유지)
  let reopening = null;
  async function reopen(aec) {
    if (reopening) await reopening;              // 이미 다시 여는 중이면 끝날 때까지
    if (!stream || aecOn === !!aec) return stream;
    reopening = (async () => {
      const ns = noiseSpec;
      stopRecording(true);
      try { src && src.disconnect(); } catch (e) {}
      stream.getTracks().forEach((t) => t.stop());
      await init({ aec });
      noiseSpec.set(ns);
    })();
    try { await reopening; } finally { reopening = null; }
    return stream;
  }

  // 날 것의 측정값 하나
  function measure() {
    analyser.getFloatTimeDomainData(td);
    let s = 0;
    for (let i = 0; i < td.length; i++) s += td[i] * td[i];
    const rms = Math.sqrt(s / td.length);
    const db = 20 * Math.log10(rms + 1e-9);

    analyser.getFloatFrequencyData(fd);
    let sum = 0, sumF = 0;
    for (let i = iLo; i <= iHi; i++) {
      let m = Math.pow(10, fd[i] / 20) - noiseSpec[i];  // 소음 빼기
      if (m <= 0) continue;
      sum += m; sumF += m * i * binHz;
    }
    const hz = sum > 0 ? sumF / sum : 300;
    return { db, pitch: Math.log2(Math.max(60, hz)) };
  }

  // 보정 1단계: 조용할 때 소음 스펙트럼/크기 기록
  function captureNoiseFrame(acc) {
    analyser.getFloatFrequencyData(fd);
    if (!acc.spec) acc.spec = new Float32Array(fd.length), acc.n = 0;
    for (let i = 0; i < fd.length; i++) acc.spec[i] += Math.pow(10, fd[i] / 20);
    acc.n++;
  }

  function median(a) {
    if (!a.length) return NaN;
    const b = a.slice().sort((x, y) => x - y);
    return b[Math.floor(b.length / 2)];
  }
  function pct(a, p) {
    if (!a.length) return NaN;
    const b = a.slice().sort((x, y) => x - y);
    return b[Math.min(b.length - 1, Math.floor(b.length * p))];
  }

  // 보정 결과 적용. sm: { boong:[{db,pitch}], kkiik:[...] }
  // 보정 1단계가 끝나면 바로 소음 스펙트럼을 적용 (이후 측정값이 게임 중과 같은 조건이 되게)
  function setNoise(acc, dbs) {
    noiseSpec.fill(0);
    if (acc && acc.n) {
      for (let i = 0; i < noiseSpec.length; i++) noiseSpec[i] = (acc.spec[i] / acc.n) * 1.2;
    }
    cal.noiseDb = dbs.length ? median(dbs) : -70;
  }

  function applyCalibration(sm) {
    const noiseDb = cal.noiseDb;

    const pick = (arr) => arr.filter((x) => x.db > noiseDb + 8);
    const b = pick(sm.boong), k = pick(sm.kkiik);
    let ok = true;

    if (b.length >= 8) {
      cal.boongDb = pct(b.map((x) => x.db), 0.6);
      cal.boongPitch = median(b.map((x) => x.pitch));
    } else ok = false;
    if (k.length >= 8) {
      cal.kkiikDb = pct(k.map((x) => x.db), 0.6);
      cal.kkiikPitch = median(k.map((x) => x.pitch));
    } else ok = false;

    // 소리 차이가 너무 작으면 기본 간격을 강제로 벌린다
    if (cal.kkiikPitch - cal.boongPitch < 0.35) {
      ok = false;
      const mid = (cal.kkiikPitch + cal.boongPitch) / 2;
      cal.boongPitch = Math.min(cal.boongPitch, mid - 0.4);
      cal.kkiikPitch = Math.max(cal.kkiikPitch, mid + 0.4);
    }
    cal.split = (cal.boongPitch + cal.kkiikPitch) / 2;

    const loud = Math.min(cal.boongDb, cal.kkiikDb);
    cal.thrOn = noiseDb + Math.max(6, (loud - noiseDb) * 0.35);
    cal.good = ok;
    return ok;
  }

  // 매 프레임: 측정 → 분류
  function update(dt) {
    let raw = null;
    // 게임 효과음이 나는 중엔 마이크 판단을 잠깐 멈춤 (스피커 소리가 다시 들어오니까)
    const muted = BB.Sfx && BB.Sfx.micMuted() && !keys.boong && !keys.kkiik;
    if (out.ready && muted) {
      if (out.type === 'none') out.silentT += dt; else out.holdT += dt;
      return null;
    }
    if (out.ready) {
      raw = measure();
      // 크기: 빨리 올라가고 천천히 내려가게
      const a = raw.db > out.db ? 0.6 : 0.18;
      out.db += (raw.db - out.db) * a;
      if (raw.db > cal.thrOn - 6) out.pitch += (raw.pitch - out.pitch) * 0.35;
    }

    // 소리 남/안 남 (히스테리시스 + 짧은 끊김 허용)
    if (out.ready) {
      if (out.db > cal.thrOn) { activeRaw = true; offT = 0; }
      else if (out.db < cal.thrOn - 4) {
        offT += dt;
        if (offT > 0.15) activeRaw = false;
      }
    }

    // 종류 판단: 경계 근처에선 이전 판단 유지, 바뀌려면 잠깐 버텨야
    let want = 'none';
    if (activeRaw) {
      const m = 0.08;
      if (out.pitch > cal.split + m) want = 'kkiik';
      else if (out.pitch < cal.split - m) want = 'boong';
      else want = out.type !== 'none' ? out.type : (out.pitch > cal.split ? 'kkiik' : 'boong');
    }
    // 키보드가 있으면 우선
    if (keys.kkiik) want = 'kkiik';
    else if (keys.boong) want = 'boong';

    if (want === out.type) { cand = want; candT = 0; }
    else {
      if (cand !== want) { cand = want; candT = 0; }
      candT += dt;
      const need = want === 'none' ? 0 : (out.type === 'none' ? 0.03 : 0.07);
      if (candT >= need) { out.type = want; out.holdT = 0; }
    }

    if (out.type === 'none') { out.silentT += dt; out.intensity = 0; }
    else {
      out.silentT = 0;
      out.holdT += dt;
      if (keys.boong || keys.kkiik) out.intensity = 1;
      else {
        const span = Math.max(6, cal.boongDb - cal.thrOn);
        out.intensity = Math.max(0.15, Math.min(1.4, (out.db - cal.thrOn) / span));
      }
    }
    return raw;
  }

  // ---- 보정값 저장/불러오기 (다음엔 10초 보정 건너뛰기) ----
  function exportCal() {
    const o = {};
    ['noiseDb', 'boongDb', 'kkiikDb', 'boongPitch', 'kkiikPitch', 'thrOn', 'split', 'good'].forEach((k) => (o[k] = cal[k]));
    if (noiseSpec) o.noise = Array.from(noiseSpec, (v) => +v.toPrecision(3));
    o.v = 1;
    return o;
  }
  function importCal(o) {
    if (!o || o.v !== 1) return false;
    const keys = ['noiseDb', 'boongDb', 'kkiikDb', 'boongPitch', 'kkiikPitch', 'thrOn', 'split'];
    if (!keys.every((k) => typeof o[k] === 'number' && isFinite(o[k]))) return false;
    keys.forEach((k) => (cal[k] = o[k]));
    cal.good = !!o.good;
    if (noiseSpec && Array.isArray(o.noise) && o.noise.length === noiseSpec.length) noiseSpec.set(o.noise.map((v) => +v || 0));
    return true;
  }

  // ---- 녹음: 한 판 동안 낸 소리를 저장했다가 도착하면 들려주기 ----
  let rec = null, chunks = [], recUrl = null;
  function startRecording() {
    stopRecording(true);
    if (!stream || !window.MediaRecorder) return false;
    try {
      const mine = (chunks = []);
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) mine.push(e.data); };
      rec.start(500);
      return true;
    } catch (e) { rec = null; return false; }
  }
  function stopRecording(discard) {
    return new Promise((resolve) => {
      if (!rec || rec.state === 'inactive') { rec = null; resolve(discard ? null : recUrl); return; }
      const r = rec, mine = chunks; rec = null;   // 이 녹음의 조각 (다음 녹음이 바로 시작돼도 안 섞이게)
      r.onstop = () => {
        if (discard) { resolve(null); return; }
        if (recUrl) URL.revokeObjectURL(recUrl);
        recUrl = mine.length ? URL.createObjectURL(new Blob(mine, { type: r.mimeType || 'audio/webm' })) : null;
        resolve(recUrl);
      };
      try { r.stop(); } catch (e) { resolve(null); }
    });
  }

  // 막대 표시용 0..1
  function pitchNorm(p) { return Math.max(0, Math.min(1, (p - PITCH_MIN) / (PITCH_MAX - PITCH_MIN))); }
  function dbNorm(d) {
    const lo = cal.noiseDb - 6, hi = Math.max(cal.boongDb, cal.kkiikDb) + 10;
    return Math.max(0, Math.min(1, (d - lo) / Math.max(10, hi - lo)));
  }

  BB.Audio = { init, resume, reopen, exportCal, importCal, stream: () => stream, aec: () => aecOn, ctx: () => ctx, hasMic: () => !!stream, startRecording, stopRecording, update, measure, captureNoiseFrame, setNoise, applyCalibration, cal, out, keys, pitchNorm, dbNorm };
})();
