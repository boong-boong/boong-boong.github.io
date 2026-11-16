// 붕붕 — 게임 본체 (상태, 조작, 물리, 그리기, 화면)
(function () {
  const BB = window.BB;
  const A = BB.Audio, T = BB.Track, D = BB.Draw, Sfx = BB.Sfx, On = BB.Online, Net = BB.Net;
  const { fwd, right } = T;

  // ---------- 조정값 ----------
  const P = BB.TUNE = {
    VMAX: 460,          // 최고 속도 (px/s)
    GRASS_V: 120,       // 잔디 위 최고 속도
    COAST_TIME: 2.2,    // 소리 멈춘 뒤 서서히 멈추기까지 (초)
    R_NORMAL: 300,      // 평소 최소 회전 반지름 → 급커브는 못 돎
    R_DRIFT: 70,        // 끼익 중 최소 회전 반지름
    W_NORMAL: 1.7, W_DRIFT: 5,   // 최대 회전 속도 (rad/s)
    GRIP_NORMAL: 14, GRIP_GRASS: 7, GRIP_ICE: 2.2,
    DRIFT_DECEL: 150,   // 끼익 중 속도 줄어듦 (미끄러지며 감속)
    DRIFT_SLIP: 0.6,    // 끼익 중 차 머리가 더 꺾여 보이는 정도 (rad)
    TURBO_TIME: 2.5, TURBO_V: 1.35,   // 번개: 2.5초 동안 최고 속도 1.35배
  };
  const CAR_R = 15, WALL_HW = 7, TREE_R = 17, ITEM_R = 30;
  const CALIB = { quiet: 1.0, boong: 4.5, kkiik: 4.5, ok: 0.9 }; // 합 10초 + 확인
  const COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#51cf66', '#b197fc'];
  // 별을 모으면 열리는 모자 (스테이지별 최고 별 수의 합)
  const HATS = [{ id: '', name: '없음', need: 0 }, { id: 'ribbon', name: '리본', need: 20 }, { id: 'shades', name: '선글라스', need: 60 }, { id: 'party', name: '고깔', need: 120 }, { id: 'crown', name: '왕관', need: 200 }];

  // ---------- 저장 (이 브라우저에만) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bb_' + k); if (v == null) return d; const o = JSON.parse(v); return o == null ? d : o; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bb_' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('bb_' + k); } catch (e) {} },
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'), g = canvas.getContext('2d');
  const ui = {
    hud: $('hud'), stage: $('stageLabel'), timer: $('timer'), starCount: $('starCount'), friends: $('friends'),
    horn: $('hornBtn'), view: $('viewBtn'), recal: $('recalBtn'), home: $('homeBtn'),
    pad: $('pad'), padL: $('padLeft'), padR: $('padRight'), padB: $('padBoong'), padK: $('padKkiik'),
    bubble: $('bubble'),
    title: $('title'), colors: $('colors'), hats: $('hats'), starTotal: $('starTotal'), decoMsg: $('decoMsg'), roomLine: $('roomLine'), stages: $('stages'), stTier: $('stTier'), stName: $('stName'), stBest: $('stBest'), stPrev: $('stPrev'), stNext: $('stNext'), start: $('startBtn'), titleMsg: $('titleMsg'),
    calib: $('calib'), calibText: $('calibText'), calibFill: $('calibFill'), calibSub: $('calibSub'),
    roomBox: $('roomBox'), roomOut: $('roomOut'), roomIn: $('roomIn'), roomInfo: $('roomInfo'), roomMsg: $('roomMsg'),
    nick: $('nick'), roomCode: $('roomCode'), roomMake: $('roomMake'), roomJoin: $('roomJoin'), roomCopy: $('roomCopy'), roomLeave: $('roomLeave'),
    roomHud: $('roomHud'), raceBtn: $('raceBtn'), voiceBtn: $('voiceBtn'),
    arrive: $('arrive'), stats: $('arriveStats'), board: $('board'), playback: $('playbackBtn'), retry: $('retryBtn'), next: $('nextBtn'),
  };
  const show = (el, on) => el.classList.toggle('hidden', !on);

  let cw = 0, ch = 0, dpr = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cw = r.width; ch = r.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 상태 ----------
  let state = 'title';     // title | calib | play | arrived
  let stateBeforeCalib = 'play';
  let stageIdx = 0, track = null, trackPath = null;
  let micOk = false, calibrated = false;
  let mode = 'mic';        // mic | buttons
  let view = store.get('view', '2d');
  let color = store.get('color', COLORS[0]);
  const car = {};
  let cam = { x: 0, y: 0, a: 0, z: 1 };
  let particles = [], skids = [], shake = 0;
  let curveSuccess = 0, passedTurns = new Set();
  let steerHintT = 0, steerHintShown = false;
  let runT = 0, running = false, stars = 0, starTotal = 0;
  let myHorn = 0;
  const peerHorn = new Map();
  let recUrl = null, playing = null;
  // 고스트: 내 최고 기록 주행 (초당 15번 위치)
  const GHOST_DT = 1 / 15;
  let ghost = null, ghostRec = [], ghostRecT = 0;
  function recordGhost(dt) {
    ghostRecT += dt;
    while (ghostRecT >= GHOST_DT && ghostRec.length < 3 * 15 * 300) {
      ghostRecT -= GHOST_DT;
      ghostRec.push(Math.round(car.x), Math.round(car.y), Math.round(car.h * 100) / 100);
    }
  }
  function ghostAt(t) {
    if (!ghost) return null;
    const n = ghost.p.length / 3, f = t / ghost.dt, i = Math.floor(f);
    if (i >= n - 1) return null;
    const u = f - i, P = ghost.p;
    const a = i * 3, b = a + 3;
    return { x: P[a] + (P[b] - P[a]) * u, y: P[a + 1] + (P[b + 1] - P[a + 1]) * u, h: P[a + 2] + wrap(P[b + 2] - P[a + 2]) * u };
  }
  const totalStars = () => Object.values(store.get('bestStars', {})).reduce((a, b) => a + (+b || 0), 0);
  const colorOk = (c) => COLORS.includes(c);
  if (!colorOk(color)) color = COLORS[0];
  let hat = store.get('hat', '');
  if (!HATS.some((h) => h.id === hat && totalStars() >= h.need)) hat = '';

  function loadStage(i) {
    stageIdx = i;
    track = T.build(BB.STAGES[i]);
    // 길 그림: 끊긴 구간은 비우고, 갈림길도 같이
    trackPath = new Path2D();
    const addPoly = (P) => { let on = false; for (const p of P) { if (p.gap) { on = false; continue; } if (on) trackPath.lineTo(p.x, p.y); else { trackPath.moveTo(p.x, p.y); on = true; } } };
    addPoly(track.pts);
    if (track.branch) addPoly(track.branch.pts);
    // 바닥(얼음/진흙)·쉿 구간 그림
    const sub = (s0, s1) => { const pa = new Path2D(); let on = false; for (const p of track.pts) { if (p.s < s0 || p.s > s1) continue; if (on) pa.lineTo(p.x, p.y); else { pa.moveTo(p.x, p.y); on = true; } } return pa; };
    track.surf.forEach((q) => (q.path = sub(q.s0, q.s1)));
    track.quiet.forEach((q) => (q.path = sub(q.s0, q.s1)));
    iceHinted = false; iceHintT = 0; flashT = 0;
    light = 1;

    particles = []; skids = []; passedTurns = new Set();
    ui.stage.textContent = String(BB.STAGES[i].id);
    placeCar(track.startS - 30);
    cam.x = car.x; cam.y = car.y; cam.a = car.h;
    runT = 0; running = false; stars = 0;
    ghostRec = []; ghostRecT = GHOST_DT;   // 출발 순간(0초) 위치부터 기록
    ghost = store.get('ghost_' + BB.STAGES[i].id, null);
    if (!ghost || !Array.isArray(ghost.p) || !(ghost.dt > 0)) ghost = null;
    starTotal = track.items.filter((it) => it.kind === 'star').length;
    updateHud(true);
    On.joinStage(i);
    if (mode === 'mic' && micOk && state !== 'title') A.startRecording();
  }

  // pi: 0 = 본길, 1 = 갈림길(지름길). 갈림길이면 ls(그 길 안의 거리)로 놓음
  function placeCar(s, pi, ls) {
    pi = pi && track.branch ? 1 : 0;
    const P = pi ? track.branch.pts : track.pts;
    const local = pi ? ls : s;
    const p = T.pointAtPts(P, local);
    const gs = pi ? track.branch.map(local) : local;
    Object.assign(car, {
      x: p.x, y: p.y, h: p.h, vx: 0, vy: 0, steer: 0,
      s: gs, ls: local, pi, segI: p.i, lastRoadS: gs, lastRoad: { pi, ls: local }, zone: 'road',
      coastV0: -1, fallT: -1, blink: 0, stillT: 0, drifting: false, slip: 0, turbo: 0,
      air: null, z: 0, peakI: 0, wake: 0, wakeTo: 0, zoneStill: 0, fork: false, forkHinted: false,
    });
    track.quiet.forEach((q) => (q.noise = 0));
  }
  const curPts = () => (car.pi ? track.branch.pts : track.pts);
  const curTurns = () => (car.pi ? track.branch.turns : track.turns);
  // 지금 길에서 dist 앞의 점 (갈림길 끝을 넘으면 본길로 이어서)
  function aheadPoint(dist) {
    const Bf = track.branch;
    // 갈림길 입구에서 지름길 쪽으로 핸들을 꺾었으면 지름길을 따라감
    if (!car.pi && Bf && car.fork && car.s > Bf.sA - 80 && car.s < Bf.sA + 450) {
      const ob = T.fullProgress(Bf.pts, car.x, car.y);
      return T.pointAtPts(Bf.pts, ob.s + dist);
    }
    if (car.pi) {
      const B = track.branch, ls = car.ls + dist;
      if (ls <= B.total) return T.pointAtPts(B.pts, ls);
      return T.pointAt(track, B.sB + (ls - B.total));
    }
    return T.pointAt(track, car.s + dist);
  }
  const surfAt = () => { if (car.pi) return null; const q = track.surf.find((q) => car.s >= q.s0 && car.s <= q.s1); return q ? q.kind : null; };
  let jumpOK = 0, quietOK = 0, iceHintT = 0, iceHinted = false, forkHint = 0, doorOK = 0;
  let light = 1;   // 밤길 헤드라이트 밝기 0..1.2

  // ---------- 조작: 기울이기 / 키보드 / 터치 / 버튼 ----------
  let tilt = 0, tiltSeen = false;
  function onOrient(e) {
    if (e.gamma == null) return;
    tiltSeen = true;
    let gm = e.gamma;
    const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    if (ang === 180) gm = -gm;
    const dz = 3, full = 24;
    const a = Math.abs(gm) < dz ? 0 : (Math.abs(gm) - dz) * Math.sign(gm);
    tilt = Math.max(-1, Math.min(1, a / (full - dz)));
  }
  window.addEventListener('deviceorientation', onOrient);

  const keyDir = { l: false, r: false };
  const KEYS = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'b', w: 'b', W: 'b', ArrowDown: 'k', s: 'k', S: 'k', ' ': 'k' };
  function setKey(k, on) {
    // 목소리 모드에선 키보드로 붕/끼익 못 함 (방향키 핸들만)
    if (mode === 'mic' && micOk && (k === 'b' || k === 'k')) return;
    if (k === 'l') keyDir.l = on; else if (k === 'r') keyDir.r = on;
    else if (k === 'b') A.keys.boong = on; else if (k === 'k') A.keys.kkiik = on;
  }
  const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;                       // 이름·방 코드 칸에 글자 입력 중
    if (e.key === 'h' || e.key === 'H') { if (!e.repeat) honk(); return; }
    const k = KEYS[e.key]; if (!k) return;
    setKey(k, true); e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (typing(e)) return; const k = KEYS[e.key]; if (k) setKey(k, false); });

  // 기울기 센서가 없는 폰(마이크 모드): 화면 왼쪽/오른쪽 누르고 있기
  let touchDir = 0;
  const pointers = new Map();
  function recomputeTouch() {
    let d = 0;
    pointers.forEach((x) => { d += x < cw / 2 ? -1 : 1; });
    touchDir = Math.max(-1, Math.min(1, d));
  }
  canvas.addEventListener('pointerdown', (e) => {
    // 목소리 모드: 기울기 센서가 있으면 터치 핸들 없음 (센서 없는 폰에서만 비상용)
    if (mode === 'buttons' || tiltSeen || !matchMedia('(pointer: coarse)').matches) return; const r = canvas.getBoundingClientRect(); pointers.set(e.pointerId, e.clientX - r.left); recomputeTouch(); });
  canvas.addEventListener('pointermove', (e) => { if (!pointers.has(e.pointerId)) return; const r = canvas.getBoundingClientRect(); pointers.set(e.pointerId, e.clientX - r.left); recomputeTouch(); });
  const up = (e) => { pointers.delete(e.pointerId); recomputeTouch(); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  // 버튼 모드 조작판 (여러 손가락 동시에)
  const padState = { l: false, r: false, b: false, k: false };
  function bindPad(el, k) {
    const on = (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) {} padState[k] = true; el.classList.add('on'); Sfx.unlock(); };
    const off = () => { padState[k] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  bindPad(ui.padL, 'l'); bindPad(ui.padR, 'r'); bindPad(ui.padB, 'b'); bindPad(ui.padK, 'k');

  function steerInput() {
    const k = (keyDir.r || padState.r ? 1 : 0) - (keyDir.l || padState.l ? 1 : 0);
    if (k) return k;
    if (touchDir) return touchDir;
    return mode === 'buttons' ? 0 : tilt;
  }

  // ---------- 시작 화면 ----------
  function buildTitle() {
    const have = totalStars();
    ui.starTotal.textContent = '· 지금 ★' + have;
    ui.colors.innerHTML = '';
    COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch' + (c === color ? ' sel' : '');
      b.style.background = c; b.setAttribute('aria-label', '차 색깔');
      b.onclick = () => { color = c; store.set('color', c); buildTitle(); };
      ui.colors.appendChild(b);
    });
    ui.hats.innerHTML = '';
    HATS.forEach((h) => {
      const b = document.createElement('button');
      const open = have >= h.need;
      b.type = 'button'; b.className = 'hatBtn' + (h.id === hat ? ' sel' : '') + (open ? '' : ' locked');
      b.textContent = open ? h.name : h.name + ' ★' + h.need;
      b.onclick = () => {
        if (!open) { ui.decoMsg.textContent = '별 ' + h.need + '개를 모으면 열려요 (지금 ' + have + '개)'; return; }
        ui.decoMsg.textContent = '';
        hat = h.id; store.set('hat', hat); buildTitle();
      };
      ui.hats.appendChild(b);
    });
    drawPreview();
    renderStagePick();
  }
  function drawPreview() {
    const cv = $('carPreview'); if (!cv) return;
    const pg = cv.getContext('2d');
    pg.clearRect(0, 0, cv.width, cv.height);
    pg.save(); pg.translate(cv.width / 2, cv.height / 2 + 4); pg.scale(1.9, 1.9);
    D.carTop(pg, color, 0, false, hat);
    pg.restore();
  }
  // 따로 열리는 창: 꾸미기 / 친구랑 / 놀이 방법
  const openSheet = (id) => { ['decoSheet', 'roomSheet', 'help'].forEach((x) => show($(x), x === id)); if (id === 'decoSheet') buildTitle(); };
  $('decoBtn').addEventListener('click', () => openSheet('decoSheet'));
  $('roomBtn').addEventListener('click', () => openSheet('roomSheet'));
  $('helpBtn').addEventListener('click', () => openSheet('help'));
  document.querySelectorAll('.sheetClose').forEach((b) => b.addEventListener('click', () => { openSheet(null); renderRoom(); }));
  function renderStagePick() {
    const st = BB.STAGES[stageIdx], best = store.get('best', {}), bs = store.get('bestStars', {});
    const tier = BB.tierOf ? BB.tierOf(st.id) : '';
    ui.stTier.textContent = tier; ui.stTier.dataset.t = tier;
    ui.stName.textContent = st.id + '. ' + st.name;
    ui.stBest.textContent = best[st.id] ? '최고 ' + fmt(best[st.id]) + '  ★' + (bs[st.id] || 0) : '아직 안 해 봤어요';
  }
  function pickStage(d) {
    const n = BB.STAGES.length;
    loadStage((stageIdx + d + n) % n);
    renderStagePick();
  }
  ui.stPrev.addEventListener('click', () => pickStage(-1));
  ui.stNext.addEventListener('click', () => pickStage(1));

  async function begin(forceButtons) {
    ui.start.disabled = true;
    ui.titleMsg.textContent = '';
    Sfx.unlock();

    // iOS: 기울기 권한은 탭 안에서 바로 요청해야 함
    let orientReq = null;
    if (!forceButtons && window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      orientReq = DeviceOrientationEvent.requestPermission().catch(() => 'denied');
    }
    try {
      const el = document.documentElement;
      if (matchMedia('(pointer: coarse)').matches && el.requestFullscreen && !document.fullscreenElement) {
        el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait').catch(() => {})).catch(() => {});
      }
    } catch (e) {}

    if (!forceButtons && !micOk) {
      // 권한 묻는 창에 답할 때까지 기다림 (막힌 곳에선 바로 실패로 돌아옴)
      try { await A.init({ aec: Net.on }); micOk = true; }
      catch (e) { micOk = false; }
    }
    if (orientReq) await orientReq;
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
    ui.start.disabled = false;

    mode = !forceButtons && micOk ? 'mic' : 'buttons';
    started = true;
    // 지난번 보정값이 있으면 10초 보정 건너뛰기 (「보정」 버튼으로 언제든 다시)
    let usedSaved = false;
    if (mode === 'mic' && !calibrated && A.importCal(store.get('cal', null))) { calibrated = true; usedSaved = true; }
    setupVoice();
    show(ui.title, false);
    if (mode === 'mic' && (!calibrated || usedSaved)) startCalibration('play', usedSaved);
    else {
      if (mode === 'buttons' && !forceButtons) flash('마이크를 쓸 수 없어서 버튼으로 해요', 2.6);
      startPlay();
    }
  }
  ui.start.addEventListener('click', () => begin(false));

  // 버튼 모드는 마이크를 못 쓸 때만 자동으로 (목소리 되면 터치 조작 없음)

  function nightIntro() { if (track.night) flash('밤이에요! 소리 내면 깜깜해져', 2.2); }
  function startPlay() {
    show(ui.title, false); show(ui.calib, false); show(ui.arrive, false);
    show(ui.hud, true);
    show(ui.pad, mode === 'buttons');
    show(ui.recal, mode === 'mic');
    loadStage(stageIdx);
    state = 'play';
    if (mode === 'mic') A.startRecording();
    renderRoom();
    nightIntro();
  }

  // ---------- 친구랑 같이 (방) ----------
  let started = false, countT = 0;
  async function setupVoice() {
    if (!Net.on || !started) return;
    if (mode === 'mic' && micOk) {
      const wasRec = state === 'play';
      await A.reopen(true);              // 친구 목소리가 내 마이크로 다시 들어가지 않게
      if (wasRec) A.startRecording();
      Net.enableVoice(A.stream());
    } else Net.enableVoice(null);
  }
  function renderRoom() {
    const inRoom = Net.on;
    show(ui.roomLine, inRoom);
    if (inRoom) ui.roomLine.textContent = '방 ' + Net.code + ' · ' + Net.members.length + '명';
    show(ui.roomOut, !inRoom); show(ui.roomIn, inRoom);
    show(ui.roomHud, inRoom && (state === 'play' || state === 'arrived' || state === 'count'));
    if (inRoom) {
      ui.roomInfo.innerHTML = '';
      const a = document.createElement('div'); a.append('방 '); const b = document.createElement('b'); b.textContent = Net.code; a.append(b);
      const stN = (m) => ((m.stage ?? 0) + 1) + '번';
      const stLabel = (m) => (m.st === 'calib' ? '보정 중' : m.st === 'title' ? '처음 화면' : m.st === 'arrived' ? '도착 · ' + stN(m) : '달리는 중 · ' + stN(m));
      const c = document.createElement('div'); c.className = 'roomList';
      Net.members.forEach((m) => {
        const row = document.createElement('div');
        const dot = document.createElement('span'); dot.className = 'dot ' + (m.st === 'calib' || m.st === 'title' ? 'wait' : 'ok');
        row.append(dot, (m.id === Net.myId ? m.name + '(나)' : m.name) + ' — ' + stLabel(m));
        c.appendChild(row);
      });
      ui.roomInfo.append(a, c);
      const n = Net.members.length - 1;
      const waitN = Net.members.filter((m) => m.id !== Net.myId && (m.st === 'calib' || m.st === 'title')).length;
      show(ui.friends, n > 0 || (On.on && On.peers.length > 0));
      if (n > 0) ui.friends.textContent = '친구 ' + n + '명' + (waitN ? ' (' + waitN + '명 아직 준비 중)' : '') + (Net.voiceCount() ? ' · 목소리 ' + Net.voiceCount() : '');
      ui.raceBtn.textContent = '같이 출발 · ' + (stageIdx + 1) + '번';
    }
    ui.voiceBtn.textContent = Net.voice ? '친구 소리 켬' : '친구 소리 끔';
    ui.voiceBtn.classList.toggle('off', !Net.voice);
  }
  Net.onChange = () => { renderRoom(); if (state === 'arrived') renderBoard(); };
  Net.onHorn = (id) => { peerHorn.set('n:' + id, 0.9); Sfx.horn(); };
  let pendingStart = null;   // 보정 중에 받은 같이 출발
  Net.onStart = ({ stage, wait }) => {
    stage = Math.min(stage, BB.STAGES.length - 1);
    if (!started) { ui.roomMsg.textContent = ui.titleMsg.textContent = '친구가 출발해요! 「시작」을 눌러 줘'; stageIdx = stage; loadStage(stage); buildTitle(); return; }
    if (state === 'calib') { pendingStart = { stage, at: performance.now() + wait }; return; }
    beginCount(stage, wait);
  };
  function beginCount(stage, wait) {
    stopPlayback();
    show(ui.arrive, false); show(ui.calib, false); show(ui.title, false);
    show(ui.hud, true); show(ui.pad, mode === 'buttons');
    stageIdx = stage;
    loadStage(stage);
    state = 'count';
    countT = wait / 1000;
    renderRoom();
  }
  const nickVal = () => { const v = ui.nick.value.trim().slice(0, 8); store.set('nick', v); return v || '친구'; };
  let joining = false;
  async function joinRoom(code) {
    if (joining) return;
    joining = true; ui.roomMake.disabled = ui.roomJoin.disabled = true;
    ui.roomMsg.textContent = '연결하는 중…';
    const r = await Net.join(code, nickVal(), color);
    joining = false; ui.roomMake.disabled = ui.roomJoin.disabled = false;
    ui.roomMsg.textContent = r.ok ? '친구에게 링크를 보내 줘. 다 모이면 게임 안에서 「같이 출발」!' : r.why;
    // 친구 방에 들어간 거면 창을 닫고 바로 「시작」 누를 수 있게
    if (r.ok && joinedByCode) { openSheet(null); ui.titleMsg.textContent = '방 ' + Net.code + '에 들어왔어요! 「시작」을 눌러 줘'; }
    renderRoom();
    if (r.ok) setupVoice();
  }
  ui.nick.value = store.get('nick', '');
  let joinedByCode = false;
  ui.roomMake.addEventListener('click', () => { joinedByCode = false; joinRoom(Net.makeCode()); });
  ui.roomJoin.addEventListener('click', () => { joinedByCode = true; joinRoom(ui.roomCode.value); });
  ui.roomCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') { joinedByCode = true; joinRoom(ui.roomCode.value); } });
  ui.roomLeave.addEventListener('click', async () => { await Net.leave(); ui.roomMsg.textContent = ''; renderRoom(); });
  ui.roomCopy.addEventListener('click', () => {
    const link = location.origin + location.pathname + '#room-' + Net.code;
    const done = () => (ui.roomMsg.textContent = '링크를 복사했어요');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => (ui.roomMsg.textContent = link));
    else ui.roomMsg.textContent = link;
  });
  ui.raceBtn.addEventListener('click', () => { const r = Net.startRace(stageIdx); beginCount(r.stage, r.wait); });
  ui.voiceBtn.addEventListener('click', () => Net.setVoice(!Net.voice));
  if (BB.ARTIFACT) { show(ui.roomBox, false); show($('roomBtn'), false); }   // 아티팩트에선 아티팩트 자체 같이 달리기 사용
  else {
    const m = location.hash.match(/^#room-([A-Za-z0-9]{4})$/);
    if (m) { ui.roomCode.value = m[1].toUpperCase(); ui.roomMsg.textContent = '친구 방 ' + m[1].toUpperCase() + ' — 이름 쓰고 「들어가기」'; openSheet('roomSheet'); }
  }

  function goTitle() {
    state = 'title';
    stopPlayback(); Net.endRace(); pendingStart = null;
    A.stopRecording(true);
    show(ui.hud, false); show(ui.pad, false); show(ui.arrive, false); show(ui.calib, false);
    setBubble('', '');
    buildTitle();
    show(ui.title, true);
    renderRoom();
  }
  ui.home.addEventListener('click', goTitle);

  // ---------- 보정 (10초) ----------
  let calib = null;
  // quick: 저장된 보정을 쓰되 주변 소음만 1초 다시 재기
  function startCalibration(after, quick) {
    stateBeforeCalib = after;
    state = 'calib';
    show(ui.arrive, false); show(ui.hud, false); show(ui.pad, false); setBubble('', '');
    show(ui.calib, true);
    calib = { t: 0, noiseAcc: {}, noiseDb: [], boong: [], kkiik: [], noiseSet: false, done: false, ok: true, quick: !!quick };
    A.keys.boong = A.keys.kkiik = false;
  }
  ui.recal.addEventListener('click', () => {
    if (!micOk || state === 'count') return;
    startCalibration(state === 'arrived' ? 'arrived' : 'play');
  });

  function updateCalib(dt, raw) {
    const c = calib;
    c.t += dt;
    const t1 = CALIB.quiet, t2 = t1 + CALIB.boong, t3 = t2 + CALIB.kkiik;
    let text, cls = '';
    if (c.quick && c.t >= t1) {
      // 소음만 다시: 소음이 커졌으면 "소리 났다" 기준도 그만큼 올림
      const old = A.cal.noiseDb;
      A.setNoise(c.noiseAcc, c.noiseDb);
      const d = A.cal.noiseDb - old;
      if (d > 0) A.cal.thrOn += d;
      show(ui.calib, false);
      startPlay();
      flash('지난번 보정을 써요 · 「보정」으로 다시', 2.4);
      return;
    }
    if (c.t < t1) {
      text = '쉿, 잠깐 조용히';
      if (raw) { A.captureNoiseFrame(c.noiseAcc); c.noiseDb.push(raw.db); }
    } else if (c.t < t2) {
      if (!c.noiseSet) { A.setNoise(c.noiseAcc, c.noiseDb); c.noiseSet = true; }
      text = '붕~ 한 번 해 봐'; cls = 'boong';
      if (raw) c.boong.push(raw);
    } else if (c.t < t3) {
      text = '끼익! 한 번 해 봐'; cls = 'kkiik';
      if (raw) c.kkiik.push(raw);
    } else {
      if (!c.done) { c.done = true; c.ok = A.applyCalibration({ boong: c.boong, kkiik: c.kkiik }); calibrated = true; if (c.ok) store.set('cal', A.exportCal()); }
      text = '좋아!';
      ui.calibSub.textContent = c.ok ? '' : '소리가 잘 안 들렸어요. 「보정」을 눌러 다시 해도 돼요';
      if (c.t > t3 + CALIB.ok + (c.ok ? 0 : 1.5)) {
        show(ui.calib, false);
        ui.calibSub.textContent = '';
        if (pendingStart) {
          // 보정하는 동안 친구가 출발 눌렀으면 남은 시간만큼(최소 1.5초) 세고 같이 출발
          const ps = pendingStart; pendingStart = null;
          beginCount(ps.stage, Math.max(1500, ps.at - performance.now()));
        }
        else if (stateBeforeCalib === 'arrived') { show(ui.hud, true); show(ui.arrive, true); state = 'arrived'; }
        else if (running || runT > 0) { show(ui.hud, true); state = 'play'; }
        else startPlay();
        car.coastV0 = -1;
      }
    }
    if (ui.calibText.textContent !== text) ui.calibText.textContent = text;
    ui.calibText.style.color = cls === 'boong' ? '#e8673c' : cls === 'kkiik' ? '#1597b8' : '';
    ui.calibFill.style.width = Math.min(100, (c.t / (c.quick ? t1 : t3)) * 100) + '%';
  }

  // ---------- 경적 ----------
  function honk() {
    if (state !== 'play' && state !== 'arrived') return;
    Sfx.horn(); myHorn = 0.7; On.horn(); Net.horn();
  }
  ui.horn.addEventListener('click', honk);
  On.onHorn = (key) => { peerHorn.set(key, 0.9); Sfx.horn(); };

  // ---------- 시점 ----------
  function applyView() { ui.view.textContent = view === '3d' ? '위' : '3D'; ui.view.setAttribute('aria-label', view === '3d' ? '위에서 보기' : '뒤에서 보기'); }
  ui.view.addEventListener('click', () => { view = view === '3d' ? '2d' : '3d'; store.set('view', view); applyView(); });
  applyView();

  // ---------- 도착 ----------
  const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };

  async function arrive() {
    state = 'arrived';
    running = false;
    Sfx.arrive();
    const id = BB.STAGES[stageIdx].id;
    const best = store.get('best', {});
    const prev = best[id];
    const isNew = !prev || runT < prev;
    if (isNew) {
      best[id] = Math.round(runT * 100) / 100; store.set('best', best);
      if (ghostRec.length > 6 && !store.set('ghost_' + id, { dt: GHOST_DT, p: ghostRec })) store.del('ghost_' + id);
    }
    const bs = store.get('bestStars', {});
    bs[id] = Math.max(bs[id] || 0, stars); store.set('bestStars', bs);
    if (isNew && prev) Sfx.record();

    ui.stats.innerHTML = '';
    const l1 = document.createElement('div'); l1.textContent = `${fmt(runT)}  ·  ★ ${stars}/${starTotal}`;
    const l2 = document.createElement('div');
    if (isNew && prev) { l2.className = 'new'; l2.textContent = '새 기록!'; }
    else if (prev) l2.textContent = '최고 ' + fmt(prev);
    ui.stats.append(l1, l2);

    const last = stageIdx === BB.STAGES.length - 1;
    ui.next.textContent = last ? '처음부터' : '다음 스테이지';
    show(ui.playback, false);
    renderBoard();
    setTimeout(() => { if (state === 'arrived') show(ui.arrive, true); }, 350);

    On.submit(stageIdx, runT, stars).then(renderBoard);
    if (Net.on && Net.race) Net.finish(stageIdx, runT, stars);
    if (mode === 'mic') {
      recUrl = await A.stopRecording(false);
      if (recUrl && state === 'arrived') show(ui.playback, true);
    }
  }
  ui.next.addEventListener('click', () => {
    stopPlayback(); Net.endRace();
    show(ui.arrive, false);
    stageIdx = (stageIdx + 1) % BB.STAGES.length;
    loadStage(stageIdx);
    state = 'play';
    nightIntro();
  });
  ui.retry.addEventListener('click', () => {
    stopPlayback(); Net.endRace();
    show(ui.arrive, false);
    loadStage(stageIdx);
    state = 'play';
    nightIntro();
  });
  ui.playback.addEventListener('click', () => {
    if (!recUrl) return;
    if (playing) { stopPlayback(); return; }
    playing = new window.Audio(recUrl);
    ui.playback.textContent = '그만 듣기';
    playing.onended = stopPlayback;
    playing.play().catch(stopPlayback);
  });
  function stopPlayback() {
    if (playing) { try { playing.pause(); } catch (e) {} playing = null; }
    ui.playback.textContent = '내 소리 듣기';
  }

  function renderBoard() {
    // 방에서 같이 출발했으면 이번 경주 순위
    if (Net.on && Net.race && Net.results.length) {
      ui.board.innerHTML = '';
      const h = document.createElement('h3'); h.textContent = '같이 달린 순위';
      const ol = document.createElement('ol');
      Net.results.slice().sort((a, b) => a.time - b.time).forEach((r) => {
        const li = document.createElement('li'); if (r.id === Net.myId) li.className = 'me';
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.id === Net.myId ? '나' : r.name;
        const tm = document.createElement('span'); tm.textContent = fmt(r.time) + ' ★' + r.stars;
        li.append(nm, tm); ol.appendChild(li);
      });
      ui.board.append(h, ol);
      show(ui.board, true);
      return;
    }
    const rows = On.top(stageIdx, 5);
    if (!On.boardOn || !rows.length) { show(ui.board, false); return; }
    ui.board.innerHTML = '';
    const h = document.createElement('h3'); h.textContent = '스테이지 ' + BB.STAGES[stageIdx].id + ' 순위';
    const ol = document.createElement('ol');
    rows.forEach((r) => {
      const li = document.createElement('li'); if (r.me) li.className = 'me';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.me ? '나' : (r.name || '친구');
      const tm = document.createElement('span'); tm.textContent = fmt(r.time);
      li.append(nm, tm); ol.appendChild(li);
    });
    ui.board.append(h, ol);
    show(ui.board, true);
  }
  On.onChange = () => { if (state === 'arrived') renderBoard(); };

  // ---------- 물리 ----------
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  function inputType() {
    if (state !== 'play') return 'none';
    if (mode === 'buttons') return padState.k || A.keys.kkiik ? 'kkiik' : padState.b || A.keys.boong ? 'boong' : 'none';
    return A.out.type;
  }
  function inputIntensity() {
    return mode === 'buttons' ? 1 : A.out.intensity;
  }
  let btnHold = 0;

  function stepCar(dt) {
    if (car.fallT >= 0) { stepFall(dt); return; }
    // 곰이 깼음: 잠깐 멈췄다가 쉿 구간 앞으로 되돌아감
    if (car.wake > 0) {
      car.wake -= dt;
      car.vx *= Math.exp(-dt * 5); car.vy *= Math.exp(-dt * 5);
      car.x += car.vx * dt; car.y += car.vy * dt;
      if (car.wake <= 0) { placeCar(safeS(car.wakeTo)); car.blink = 1.2; Sfx.respawn(); }
      return;
    }

    const type = inputType();
    const inten = inputIntensity();
    // 갈림길 입구: 지름길 방향으로 꺾고 있으면 지름길 선택
    const Bk = track.branch;
    if (Bk && !car.pi) {
      if (car.s > Bk.sA - 150 && car.s < Bk.sA + 150) {
        const dir = Bk.turns.length ? Bk.turns[0].dir : 1;
        if (car.steer * dir > 0.25) car.fork = true;
        else if (car.steer * dir < -0.25) car.fork = false;
      } else if (car.s > Bk.sA + 450 || car.s < Bk.sA - 150) car.fork = false;
    }
    // 점프대에서 쓸 "방금 얼마나 크게 붕 했나" (0.7초쯤 남음)
    car.peakI = Math.max(type === 'boong' ? Math.min(1.4, inten) : 0, car.peakI - dt * 1.5);
    if (car.air) { stepAir(dt, type); return; }
    const surf = surfAt();
    const onIce = surf === 'ice', onMud = surf === 'mud';
    if (mode === 'buttons') btnHold = type === 'boong' ? btnHold + dt : 0;
    const holdT = mode === 'buttons' ? btnHold : A.out.holdT;
    const onGrass = car.zone === 'grass';
    if (car.turbo > 0) car.turbo -= dt;

    let f = fwd(car.h), r = right(car.h);
    let vf = car.vx * f.x + car.vy * f.y;
    let vl = car.vx * r.x + car.vy * r.y;

    // 엔진
    if (vf < 0) vf = Math.min(0, vf + 300 * dt);           // 벽에 튕겨 뒤로 밀린 것 회복
    else if (state === 'arrived') vf = Math.max(0, vf - 520 * dt);   // 도착: 부드럽게 브레이크
    else if (type === 'boong') {
      car.coastV0 = -1;
      const k = Math.min(1, inten);
      let tgt = P.VMAX * (0.35 + 0.4 * k + 0.25 * Math.min(1, holdT / 2)) * (onGrass ? 0.4 : 1);
      let acc = (260 + 220 * k) * (onGrass ? 0.6 : 1);
      // 진흙: 크게 붕 할수록 빨리 빠져나옴
      if (onMud) { tgt = P.VMAX * (0.08 + 0.5 * Math.min(1.4, inten)); acc *= 0.5; }
      vf = vf < tgt ? Math.min(tgt, vf + acc * dt) : Math.max(tgt, vf - (onMud ? 260 : 90) * dt);
    } else if (type === 'kkiik') {
      car.coastV0 = -1;
      vf = Math.max(0, vf - P.DRIFT_DECEL * (onMud ? 2 : 1) * dt);
    } else {
      // 소리 멈춤: 약 2초 굴러가다 멈춤
      if (car.coastV0 < 0) car.coastV0 = Math.max(vf, 1);
      // 얼음: 잘 안 멈춤 / 진흙: 금방 멈춤
      const k = onIce ? 0.35 : onMud ? 3 : 1;
      vf = Math.max(0, vf - Math.max(car.coastV0 / P.COAST_TIME, 35) * k * dt);
    }
    // 번개(터보): 무조건 앞으로 쭉
    if (car.turbo > 0 && state === 'play' && type !== 'kkiik') {
      vf = Math.min(P.VMAX * P.TURBO_V, vf + 700 * dt);
      car.coastV0 = -1;
    }
    if (onGrass && vf > P.GRASS_V) vf = Math.max(P.GRASS_V, vf - vf * 2.5 * dt);

    // 핸들
    const drifting = type === 'kkiik' && vf > 40;
    car.drifting = drifting;
    let st = car.steer;
    if (drifting) {
      // 드리프트: 진행 방향을 직접 돌리고, 차 머리는 그보다 더 꺾여 미끄러지는 모습
      const v = Math.hypot(car.vx, car.vy);
      let va = v > 1 ? Math.atan2(car.vx, -car.vy) : car.h;
      {
        // 끼익만 해도 길 따라 돌게 도와주고, 핸들(기울기)은 거기에 살짝 더하거나 빼는 정도
        const p = aheadPoint(170);
        const d = wrap(Math.atan2(p.x - car.x, -(p.y - car.y)) - va);
        const assist = Math.abs(d) > 0.08 ? Math.max(-1, Math.min(1, d * 1.6)) : 0;
        st = Math.max(-1, Math.min(1, assist + st * 0.45));
      }
      va += st * Math.min(P.W_DRIFT, v / P.R_DRIFT) * (onIce ? 0.7 : 1) * dt;
      const nv = Math.max(0, v - P.DRIFT_DECEL * dt);
      car.vx = Math.sin(va) * nv; car.vy = -Math.cos(va) * nv;
      car.slip += (st * P.DRIFT_SLIP - car.slip) * Math.min(1, dt * 8);
      car.h = va + car.slip;
    } else {
      // 드리프트가 끝나면 꺾여 있던 차 머리를 진행 방향으로 되돌림 (자동 카운터)
      const ns = car.slip * Math.exp(-dt * 7);
      car.h -= car.slip - ns; car.slip = ns;
      car.h += st * Math.min(P.W_NORMAL, Math.abs(vf) / P.R_NORMAL) * (onIce ? 0.7 : 1) * dt;

      // 차 방향과 실제 움직임 방향의 차이를 grip만큼 줄임
      const vx = f.x * vf + r.x * vl, vy = f.y * vf + r.y * vl;
      f = fwd(car.h); r = right(car.h);
      let nf = vx * f.x + vy * f.y, nl = vx * r.x + vy * r.y;
      const grip = onGrass ? P.GRIP_GRASS : onIce ? P.GRIP_ICE : P.GRIP_NORMAL;
      const nl2 = nl * Math.exp(-grip * dt);
      // 옆으로 잃은 속도의 일부를 앞으로 돌려줌 (커브에서 속도가 뚝 떨어지지 않게, 에너지는 늘지 않게)
      if (nf > 0) nf = Math.sqrt(nf * nf + (nl * nl - nl2 * nl2) * 0.9);
      car.vx = f.x * nf + r.x * nl2;
      car.vy = f.y * nf + r.y * nl2;
    }

    car.x += car.vx * dt; car.y += car.vy * dt;

    collideWalls();
    collideTrees();
    collideDoors(dt, type);
    pickItems();

    // 어디 있나
    const prevS = car.s;
    const d = T.nearestDist(track, car.x, car.y);
    const half = BB.ROAD_W / 2;
    car.zone = d <= half ? 'road' : d <= half + BB.GRASS_W ? 'grass' : 'void';
    updateProgress();
    if (car.zone === 'road') { car.lastRoadS = car.s; car.lastRoad = { pi: car.pi, ls: car.ls }; }

    // 점프대 끝을 지나면 날아오름: 방금 낸 붕이 클수록 오래(멀리)
    if (state === 'play' && car.pi === 0 && car.zone !== 'void') {
      for (const g of track.gaps) {
        if (prevS < g.s0 - 2 && car.s >= g.s0 - 2) { takeOff(); return; }
      }
    }

    if (d > half + BB.GRASS_W + 4 && state === 'play') { car.fallT = 0; Sfx.fall(); return; }

    if (state === 'play') stepQuiet(dt, type);

    // 커브 통과 기록 (끼익 안내를 언제까지 보여줄지)
    track.turns.forEach((tn, i) => {
      if (tn.deg >= 120 && !passedTurns.has(i) && car.s > tn.s1 + 20) { passedTurns.add(i); curveSuccess++; }
    });

    if (state === 'play' && car.s >= track.finishS) arrive();

    // 효과
    const speed = Math.hypot(car.vx, car.vy);
    if (type === 'boong' && Math.random() < 0.25 + inten * 0.25) puff(-24, 0, '#ffffff', 0.55, 5 + 4 * inten);
    if (drifting && speed > 60) {
      if (Math.random() < 0.7) puff(-16, (Math.random() < 0.5 ? -1 : 1) * 13, '#f4f4f4', 0.7, 8);
      addSkid();
    }
    if (car.turbo > 0 && Math.random() < 0.8) puff(-26, (Math.random() - 0.5) * 8, '#ffb347', 0.35, 6);
    if (onGrass && speed > 40 && Math.random() < 0.4) puff(-14, 0, '#6fbf5a', 0.4, 3);
    if (onMud && speed > 20 && Math.random() < 0.6) puff(-12, (Math.random() - 0.5) * 24, '#8a6440', 0.45, 4);
    if (onIce && speed > 120 && Math.random() < 0.25) puff(-14, (Math.random() - 0.5) * 20, '#e8f7ff', 0.5, 4);
  }

  // 본길/갈림길 진행 위치 갱신 (갈라지는 곳·합류하는 곳에서 더 가까운 길로 갈아탐)
  function updateProgress() {
    let lp = T.localProgress(track, car.x, car.y, car.segI, curPts());
    const B = track.branch;
    if (B) {
      if (car.pi === 0 && car.s > B.sA - 40 && car.s < B.sA + 600) {
        const ob = T.fullProgress(B.pts, car.x, car.y);
        if (ob.s < 600 && ob.d + 6 < lp.d) { car.pi = 1; lp = ob; }
      } else if (car.pi === 1 && (car.ls > B.total - 600 || car.ls < 300)) {
        const near = car.ls < 300 ? B.sA : B.sB;
        const om = T.localProgress(track, car.x, car.y, T.pointAt(track, near).i, track.pts);
        if (om.d + 6 < lp.d) { car.pi = 0; lp = om; }
      }
    }
    car.segI = lp.i; car.ls = lp.s;
    car.s = car.pi ? B.map(lp.s) : lp.s;
  }

  function takeOff() {
    const I = car.peakI;
    const T_ = 0.3 + 0.5 * Math.min(1.4, I);
    car.air = { t: 0, T: T_, H: 30 + 40 * I };
    // 점프대가 차를 길 방향으로 60% 바로잡아 줌
    const th = T.pointAt(track, car.s).h, v = Math.hypot(car.vx, car.vy);
    const va = th + wrap(Math.atan2(car.vx, -car.vy) - th) * 0.4;
    car.vx = Math.sin(va) * v; car.vy = -Math.cos(va) * v;
    car.drifting = false;
    for (let i = 0; i < 5; i++) puff(-10, (Math.random() - 0.5) * 30, '#ffffff', 0.5, 6);
  }

  function stepAir(dt, type) {
    const a = car.air;
    a.t += dt;
    const u = Math.min(1, a.t / a.T);
    car.z = 4 * a.H * u * (1 - u);
    // 공중에선 핸들이 조금만 먹고, 속도는 그대로
    const st = car.steer * 0.25;
    const v = Math.hypot(car.vx, car.vy);
    let va = Math.atan2(car.vx, -car.vy) + st * 0.6 * dt;
    car.vx = Math.sin(va) * v; car.vy = -Math.cos(va) * v;
    car.h += wrap(va - car.h) * Math.min(1, dt * 6);
    car.x += car.vx * dt; car.y += car.vy * dt;
    updateProgress();
    pickItems();
    if (u >= 1) {
      car.air = null; car.z = 0;
      shake = Math.min(0.3, shake + 0.15);
      Sfx.bump();
      const d = T.nearestDist(track, car.x, car.y);
      if (d > BB.ROAD_W / 2 + BB.GRASS_W + 4) { car.fallT = 0; Sfx.fall(); return; }
      jumpOK++;
      for (let i = 0; i < 6; i++) puff(-6, (Math.random() - 0.5) * 30, '#ffffff', 0.5, 7);
    }
  }

  // 쉿 구간: 소리가 0.3초 넘게 쌓이면 곰이 깸
  function stepQuiet(dt, type) {
    for (const q of track.quiet) {
      const inside = car.pi === 0 && car.s >= q.s0 && car.s <= q.s1;
      if (q.awake > 0) q.awake -= dt;
      if (!inside) {
        q.noise = Math.max(0, (q.noise || 0) - dt);
        if (!q.passed && car.pi === 0 && car.s > q.s1) { q.passed = true; quietOK++; Sfx.star(); }
        continue;
      }
      const noisy = type !== 'none' || myHorn > 0.5;
      q.noise = noisy ? (q.noise || 0) + dt : Math.max(0, (q.noise || 0) - dt * 0.4);
      const speed = Math.hypot(car.vx, car.vy);
      car.zoneStill = speed < 4 ? car.zoneStill + dt : 0;
      if (q.noise > 0.3 || car.zoneStill > 1.2) {
        const woke = q.noise > 0.3;
        q.awake = 2.2; q.noise = 0;
        car.wake = 1.0; car.wakeTo = Math.max(track.startS - 30, q.s0 - 600);
        Sfx.bump();
        flash(woke ? '앗, 깼다! 조용히 다시' : '더 빨리 들어와서 굴러가 봐', 1.8);
        return;
      }
    }
  }

  function stepFall(dt) {
    car.fallT += dt;
    car.x += car.vx * dt * 0.5; car.y += car.vy * dt * 0.5;
    car.vx *= 0.96; car.vy *= 0.96;
    if (car.fallT > 0.75) {
      // 떨어진 근처(마지막으로 길 위에 있던 곳 조금 뒤)에서 부활.
      // 급커브 안이면 커브 시작 전으로 — 다시 속도 붙여서 끼익할 수 있게
      const lr = car.lastRoad;
      if (lr.pi === 1 && track.branch) {
        let ls = lr.ls - 60;
        for (const tn of track.branch.turns) if (tn.deg >= 120 && ls > tn.s0 - 120 && ls < tn.s1) ls = tn.s0 - 260;
        if (ls >= 0) placeCar(0, 1, ls);
        else placeCar(Math.max(track.startS - 30, track.branch.sA + ls));
      } else {
        placeCar(safeS(lr.ls - 60));
      }
      car.blink = 1.2;
      Sfx.respawn();
    }
  }

  // 다시 시작할 안전한 곳: 규칙을 더 안 바뀔 때까지 반복 (급커브·점프·쉿이 연달아 있어도)
  function safeS(s) {
    for (let k = 0; k < 8; k++) {
      const before = s;
      // 끊긴 길 근처: 점프대 한참 앞에서 (다시 속도 붙여서 뛰게)
      for (const g of track.gaps) if (s > g.s0 - 450 && s < g.s1 + 40) s = g.s0 - 520;
      for (const tn of track.turns) if (tn.deg >= 120 && s > tn.s0 - 120 && s < tn.s1 + 40) s = tn.s0 - 260;
      for (const q of track.quiet) if (s > q.s0 - 60 && s < q.s1) s = q.s0 - 600;
      if (s === before) break;
    }
    return Math.max(track.startS - 30, s);
  }

  function bounce(nx, ny, power) {
    const vn = car.vx * nx + car.vy * ny;
    if (vn < 0) {
      car.vx -= power * vn * nx; car.vy -= power * vn * ny;
      car.vx *= 0.85; car.vy *= 0.85;
      if (vn < -60) { shake = Math.min(0.35, shake + 0.2); Sfx.bump(); }
    }
  }
  function collideWalls() {
    for (const w of track.walls) {
      const q = T.segProj(w.x1, w.y1, w.x2, w.y2, car.x, car.y);
      const min = CAR_R + WALL_HW;
      if (q.d < min) {
        const nx = (car.x - q.qx) / (q.d || 1), ny = (car.y - q.qy) / (q.d || 1);
        car.x = q.qx + nx * min; car.y = q.qy + ny * min;
        bounce(nx, ny, 1.6);
      }
    }
  }
  // 끼익 문: 문 앞 DOOR_RANGE(320px) 안에서 끼익 하면 1.6초 열림. 닫혀 있으면 벽처럼 튕김
  const DOOR_RANGE = 320;
  function collideDoors(dt, type) {
    for (const d of track.doors) {
      const before = car.pi === 0 && car.s > d.s - DOOR_RANGE && car.s < d.s + 10;
      if (before && type === 'kkiik' && state === 'play') {
        if (d.open <= 0) { Sfx.star(); if (!d.used) { d.used = true; doorOK++; } }
        d.open = 1.6;
      }
      if (d.open > 0) continue;
      const q = T.segProj(d.x1, d.y1, d.x2, d.y2, car.x, car.y);
      const min = CAR_R + 6;
      if (q.d < min) {
        const nx = (car.x - q.qx) / (q.d || 1), ny = (car.y - q.qy) / (q.d || 1);
        car.x = q.qx + nx * min; car.y = q.qy + ny * min;
        bounce(nx, ny, 1.5);
      }
    }
  }
  function stepDoors(dt) {
    for (const d of track.doors) {
      if (d.open > 0) d.open -= dt;
      d.lift += ((d.open > 0 ? 1 : 0) - d.lift) * Math.min(1, dt * 8);
    }
  }

  function collideTrees() {
    for (const t of track.trees) {
      const dx = car.x - t.x, dy = car.y - t.y, d = Math.hypot(dx, dy), min = CAR_R + TREE_R;
      if (d < min) {
        const nx = dx / (d || 1), ny = dy / (d || 1);
        car.x = t.x + nx * min; car.y = t.y + ny * min;
        bounce(nx, ny, 1.7);
        t.wobble = 0.5;
      }
    }
  }
  function pickItems() {
    for (const it of track.items) {
      if (it.taken) continue;
      if (Math.hypot(car.x - it.x, car.y - it.y) > ITEM_R) continue;
      it.taken = true;
      if (it.kind === 'star') {
        stars++; Sfx.star();
        for (let i = 0; i < 6; i++) particles.push({ x: it.x, y: it.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.5, max: 0.5, r: 3, color: '#ffd43b' });
      } else {
        car.turbo = P.TURBO_TIME; Sfx.turbo();
      }
      updateHud(true);
    }
  }

  // ---------- 효과 ----------
  function puff(back, side, col, life, r) {
    if (particles.length > 220) return;
    const f = fwd(car.h), rt = right(car.h);
    particles.push({
      x: car.x + f.x * back + rt.x * side, y: car.y + f.y * back + rt.y * side,
      vx: -f.x * 30 + (Math.random() - 0.5) * 40, vy: -f.y * 30 + (Math.random() - 0.5) * 40,
      life, max: life, r, color: col,
    });
  }
  function addSkid() {
    const f = fwd(car.h), rt = right(car.h);
    for (const side of [-1, 1]) {
      const x = car.x - f.x * 14 + rt.x * 12 * side, y = car.y - f.y * 14 + rt.y * 12 * side;
      const key = side < 0 ? 'lastL' : 'lastR';
      const last = car[key];
      if (last && Math.hypot(x - last.x, y - last.y) < 40 && last.t === car.skidTick - 1) skids.push({ x1: last.x, y1: last.y, x2: x, y2: y });
      car[key] = { x, y, t: (car.skidTick || 0) };
    }
    car.skidTick = (car.skidTick || 0) + 1;
    if (skids.length > 700) skids.splice(0, skids.length - 700);
  }
  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  // ---------- 2D 그리기 ----------
  function drawWorld2D() {
    const W = BB.ROAD_W, G = BB.GRASS_W;
    g.lineJoin = 'round'; g.lineCap = 'round';

    g.fillStyle = track.night ? 'rgba(120,130,200,.25)' : 'rgba(255,255,255,.75)';
    for (const c of track.clouds) {
      g.beginPath();
      g.arc(c.x, c.y, c.r, 0, 7); g.arc(c.x + c.r * 0.9, c.y + c.r * 0.2, c.r * 0.7, 0, 7); g.arc(c.x - c.r * 0.9, c.y + c.r * 0.25, c.r * 0.6, 0, 7);
      g.fill();
    }

    g.strokeStyle = 'rgba(40,90,140,.18)'; g.lineWidth = W + 2 * G + 26;
    g.save(); g.translate(0, 14); g.stroke(trackPath); g.restore();
    g.strokeStyle = '#4e9a43'; g.lineWidth = W + 2 * G + 10; g.stroke(trackPath);
    g.strokeStyle = '#8fd16f'; g.lineWidth = W + 2 * G; g.stroke(trackPath);
    g.strokeStyle = '#ffffff'; g.lineWidth = W + 8; g.stroke(trackPath);
    g.strokeStyle = '#b9b3c6'; g.lineWidth = W; g.stroke(trackPath);

    // 쉿 구간 곰이 사는 작은 섬
    for (const q of track.quiet) {
      g.fillStyle = '#4e9a43'; g.beginPath(); g.arc(q.x, q.y, 52, 0, 7); g.fill();
      g.fillStyle = '#8fd16f'; g.beginPath(); g.arc(q.x, q.y, 46, 0, 7); g.fill();
    }
    // 바닥: 얼음 / 진흙
    g.lineCap = 'butt';
    for (const q of track.surf) {
      if (q.kind === 'ice') {
        g.strokeStyle = '#d3efff'; g.lineWidth = W; g.stroke(q.path);
        g.setLineDash([40, 70]); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 6;
        for (const o of [-40, 30]) { g.save(); g.translate(o * 0.1, o * 0.1); g.stroke(q.path); g.restore(); }
        g.setLineDash([]);
      } else {
        g.strokeStyle = '#9c7650'; g.lineWidth = W; g.stroke(q.path);
        g.setLineDash([8, 30]); g.strokeStyle = '#7d5a39'; g.lineWidth = W * 0.6; g.stroke(q.path); g.setLineDash([]);
      }
    }
    // 쉿 구간: 보라빛 길
    for (const q of track.quiet) { g.strokeStyle = 'rgba(150,120,210,.32)'; g.lineWidth = W; g.stroke(q.path); }
    g.lineCap = 'round';

    const fc = ['#ffffff', '#ffd84d', '#ff9ec4'];
    for (const f of track.flowers) { g.fillStyle = fc[f.c]; g.beginPath(); g.arc(f.x, f.y, 3, 0, 7); g.fill(); }

    g.setLineDash([26, 24]); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 5; g.stroke(trackPath); g.setLineDash([]);

    g.strokeStyle = 'rgba(70,60,90,.25)'; g.lineWidth = 5;
    g.beginPath();
    for (const s of skids) { g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); }
    g.stroke();

    checkerLine(track.startS, 2, false);
    checkerLine(track.finishS, 3, true);

    // 갈림길 표지: 지름길 입구에 화살표
    if (track.branch) {
      const B = track.branch, p = T.pointAt(track, B.sA - 90), rv = right(p.h), dir = B.turns.length ? B.turns[0].dir : 1;
      const x = p.x + rv.x * dir * 36, y = p.y + rv.y * dir * 36;
      g.save(); g.translate(x, y); g.rotate(cam.a);
      g.fillStyle = '#fff'; D.rr(g, -36, -16, 72, 32, 10); g.fill();
      g.fillStyle = '#e8673c'; g.font = '16px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(dir > 0 ? '지름길 ▶' : '◀ 지름길', 0, 1);
      g.restore();
    }
    // 점프대
    for (const gp of track.gaps) {
      const p = T.pointAt(track, (gp.ramp0 + gp.s0) / 2);
      g.save(); g.translate(p.x, p.y); g.rotate(p.h); D.ramp(g, gp.s0 - gp.ramp0, BB.ROAD_W - 24); g.restore();
    }
    // 곰
    const now = performance.now() / 1000;
    for (const q of track.quiet) {
      g.save(); g.translate(q.x, q.y); g.rotate(cam.a); D.bear(g, 0, 0, 1, q.awake > 0, now); g.restore();
    }

    for (const w of track.walls) {
      g.strokeStyle = '#e55858'; g.lineWidth = WALL_HW * 2;
      g.beginPath(); g.moveTo(w.x1, w.y1); g.lineTo(w.x2, w.y2); g.stroke();
      g.setLineDash([12, 12]); g.strokeStyle = '#fff'; g.lineWidth = WALL_HW * 2 - 4;
      g.beginPath(); g.moveTo(w.x1, w.y1); g.lineTo(w.x2, w.y2); g.stroke(); g.setLineDash([]);
    }

    const bob = Math.sin(performance.now() / 250) * 2;
    for (const it of track.items) {
      if (it.taken) continue;
      g.save(); g.translate(it.x, it.y); g.rotate(cam.a);
      if (it.kind === 'star') D.star(g, 0, bob, 13); else D.bolt(g, 0, bob, 14);
      g.restore();
    }
  }

  function drawDoors2D() {
    for (const d of track.doors) {
      g.save(); g.translate(d.x, d.y); g.rotate(d.h);
      const hw = BB.ROAD_W / 2 + BB.GRASS_W;
      // 기둥
      g.fillStyle = '#6b6178';
      g.beginPath(); g.arc(-hw, 0, 9, 0, 7); g.arc(hw, 0, 9, 0, 7); g.fill();
      // 차단봉: 열리면 왼쪽 기둥 쪽으로 접힘
      const L = hw * 2 * (1 - 0.85 * d.lift);
      g.lineCap = 'round';
      g.strokeStyle = '#e55858'; g.lineWidth = 12;
      g.beginPath(); g.moveTo(-hw, 0); g.lineTo(-hw + L, 0); g.stroke();
      g.setLineDash([14, 14]); g.strokeStyle = '#fff'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(-hw, 0); g.lineTo(-hw + L, 0); g.stroke(); g.setLineDash([]);
      if (d.lift < 0.5) {
        g.rotate(-d.h + cam.a);
        g.fillStyle = '#fff'; D.rr(g, -26, -36, 52, 22, 10); g.fill();
        g.fillStyle = '#1597b8'; g.font = '14px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('끼익!', 0, -25);
      }
      g.restore();
    }
  }
  function nightOverlay(cx, cy, R) {
    const gr = g.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
    gr.addColorStop(0, 'rgba(10,12,40,0)');
    gr.addColorStop(0.6, 'rgba(10,12,40,.35)');
    gr.addColorStop(1, 'rgba(10,12,40,.94)');
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
  }

  function drawTrees2D() {
    for (const t of track.trees) {
      const w = t.wobble > 0 ? Math.sin(t.wobble * 40) * t.wobble * 6 : 0;
      D.treeTop(g, t.x + w, t.y);
    }
  }

  function checkerLine(s, rows, flag) {
    const p = T.pointAt(track, s);
    const sq = 15, n = Math.ceil(BB.ROAD_W / sq);
    g.save(); g.translate(p.x, p.y); g.rotate(p.h);
    for (let row = 0; row < rows; row++) for (let i = 0; i < n; i++) {
      g.fillStyle = (i + row) % 2 ? '#3a3350' : '#ffffff';
      g.fillRect(-BB.ROAD_W / 2 + i * sq, -row * sq, sq, sq);
    }
    if (flag) {
      const fx = BB.ROAD_W / 2 + 14;
      g.fillStyle = '#6b6178'; g.beginPath(); g.arc(fx, 0, 5, 0, 7); g.fill();
      g.fillStyle = '#ff6b6b';
      g.beginPath(); g.moveTo(fx, 0); g.lineTo(fx + 30, -10); g.lineTo(fx, -22); g.closePath(); g.fill();
    }
    g.restore();
  }

  function drawCar2D(x, y, h, col, steer, opts) {
    opts = opts || {};
    g.save();
    g.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    g.translate(x, y); g.rotate(h + (opts.spin || 0)); g.scale(opts.sc || 1, opts.sc || 1);
    D.carTop(g, col, steer, opts.turbo, opts.hat);
    g.restore();
  }

  function drawParticles2D() {
    for (const p of particles) {
      const k = p.life / p.max;
      g.globalAlpha = k * 0.8;
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.r * (1.6 - k * 0.6), 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }

  // 월드 좌표 → 화면 좌표 (2D 시점)
  function w2s(x, y) {
    const dx = x - cam.x, dy = y - cam.y;
    const c = Math.cos(-cam.a), s = Math.sin(-cam.a);
    return [cw / 2 + (dx * c - dy * s) * cam.z, ch * 0.68 + (dx * s + dy * c) * cam.z];
  }

  function tag(x, y, text, col) {
    g.font = '14px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(text).width + 14;
    g.fillStyle = 'rgba(255,255,255,.92)'; D.rr(g, x - w / 2, y - 11, w, 22, 11); g.fill();
    g.fillStyle = col || '#3a3350'; g.fillText(text, x, y);
  }

  // 소리 막대: 높이(낮음↔높음), 크기
  function drawMeter() {
    const out = A.out, cal = A.cal;
    const w = 66, h = 200;
    const x = cw - w - 10, y = Math.max(70, ch * 0.24);
    const col = out.type === 'boong' ? '#ff8a4c' : out.type === 'kkiik' ? '#2bb3d9' : '#b8b3c4';

    g.fillStyle = 'rgba(255,255,255,.62)'; D.rr(g, x, y, w, h + 54, 16); g.fill();
    g.fillStyle = col; g.font = '20px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(out.type === 'boong' ? '붕' : out.type === 'kkiik' ? '끼익' : '·', x + w / 2, y + 18);

    const by = y + 34, bh = h - 10, bw = 16;
    const bars = [
      { bx: x + 12, v: out.ready ? A.pitchNorm(out.pitch) : 0, label: '높이' },
      { bx: x + w - 12 - bw, v: out.ready ? A.dbNorm(out.db) : 0, label: '크기' },
    ];
    for (const b of bars) {
      g.fillStyle = '#ebe7f2'; D.rr(g, b.bx, by, bw, bh, 8); g.fill();
      const fh = Math.max(0, b.v * bh);
      if (fh > 1) { g.fillStyle = out.type === 'none' && b.label === '높이' ? '#d4d0dc' : col; D.rr(g, b.bx, by + bh - fh, bw, fh, Math.min(8, fh / 2)); g.fill(); }
      g.fillStyle = '#6b6178'; g.font = '13px Jua, sans-serif';
      g.fillText(b.label, b.bx + bw / 2, by + bh + 12);
    }
    const mark = (bx, v, c, dash) => {
      const yy = by + bh - v * bh;
      g.strokeStyle = c; g.lineWidth = 3; g.setLineDash(dash ? [3, 3] : []);
      g.beginPath(); g.moveTo(bx - 4, yy); g.lineTo(bx + bw + 4, yy); g.stroke(); g.setLineDash([]);
    };
    mark(bars[0].bx, A.pitchNorm(cal.kkiikPitch), '#2bb3d9');
    mark(bars[0].bx, A.pitchNorm(cal.split), '#8a8299', true);
    mark(bars[0].bx, A.pitchNorm(cal.boongPitch), '#ff8a4c');
    mark(bars[1].bx, A.dbNorm(cal.thrOn), '#8a8299', true);
  }

  // ---------- HUD / 안내 ----------
  let hudT = 0;
  function updateHud(force) {
    ui.timer.textContent = fmt(runT);
    ui.starCount.textContent = '★ ' + stars + '/' + starTotal;
    const n = On.peers.length;
    if (Net.on) renderRoom();
    else { show(ui.friends, On.on && n > 0); if (n) ui.friends.textContent = '같이 달리는 친구 ' + n; }
    hudT = 0;
  }

  let bubbleText = '', bubbleCls = '', flashT = 0, flashText = '';
  function flash(text, sec) { flashText = text; flashT = sec; }
  function setBubble(text, cls) {
    if (text === bubbleText && cls === bubbleCls) return;
    bubbleText = text; bubbleCls = cls;
    ui.bubble.textContent = text;
    ui.bubble.className = cls || '';
    show(ui.bubble, !!text);
  }
  function updateHints(dt) {
    if (state === 'count') { setBubble(countT > 3 ? '준비' : String(Math.ceil(countT)), 'boong'); return; }
    if (flashT > 0) { flashT -= dt; setBubble(flashText, ''); return; }
    if (state !== 'play' || car.fallT >= 0) { setBubble('', ''); return; }
    const speed = Math.hypot(car.vx, car.vy);
    const btn = mode === 'buttons';
    car.stillT = speed < 3 && inputType() !== 'boong' ? car.stillT + dt : 0;

    if (car.wake > 0 || car.air) { setBubble('', ''); return; }
    if (curveSuccess < 2 && !car.drifting) {
      for (const tn of curTurns()) {
        if (tn.deg < 120) continue;
        if (car.ls > tn.s0 - 280 && car.ls < tn.s0 + (tn.s1 - tn.s0) * 0.6 && speed > 30) { setBubble(btn ? '끼익 꾹!' : '끼익!', 'kkiik'); return; }
      }
    }
    if (car.pi === 0) {
      // 점프대 앞: 크게 붕!!
      if (jumpOK < 2) for (const g of track.gaps) {
        if (car.s > g.ramp0 - 320 && car.s < g.s0) { setBubble(btn ? '붕 꾹 눌러 점프!' : '크게 붕!!', 'boong'); return; }
      }
      // 끼익 문 앞
      for (const d of track.doors) {
        // 처음 두 번은 다가갈 때, 그 뒤로도 닫힌 문 앞에서 느려지면 항상
        if (d.open <= 0 && car.s > d.s - DOOR_RANGE && car.s < d.s && (doorOK < 2 || speed < 60)) { setBubble(btn ? '끼익 꾹! 문 열기' : '끼익! 문 열기', 'kkiik'); return; }
      }
      // 쉿 구간 앞·안
      if (quietOK < 2) for (const q of track.quiet) {
        if (car.s > q.s0 - 320 && car.s < q.s1) { setBubble(car.s < q.s0 - 120 ? '곧 쉿! 미리 붕~' : '쉿! 조용히…', 'quiet'); return; }
      }
      // 갈림길 앞 (처음 두 번)
      const Bh = track.branch;
      if (Bh && forkHint < 2 && car.s > Bh.sA - 330 && car.s < Bh.sA - 20) {
        const dir = Bh.turns.length ? Bh.turns[0].dir : 1;
        setBubble(dir > 0 ? '지름길: ▶ 꺾고 끼익!' : '지름길: ◀ 꺾고 끼익!', 'kkiik');
        if (car.s > Bh.sA - 40 && !car.forkHinted) { car.forkHinted = true; forkHint++; }
        return;
      }
      const sf = surfAt();
      if (sf === 'mud' && speed < 160) { setBubble(btn ? '붕 꾹!' : '크게 붕!', 'boong'); return; }
      if (sf === 'ice' && !iceHinted) { iceHinted = true; iceHintT = 1.6; }
    }
    if (iceHintT > 0) { iceHintT -= dt; setBubble('미끄러워!', 'kkiik'); return; }
    if (car.stillT > 0.6) { setBubble(btn ? '붕 버튼 꾹!' : '붕~ 해 봐', 'boong'); return; }

    if (stageIdx === 0 && !steerHintShown && speed > 80) { steerHintShown = true; steerHintT = 3; }
    if (steerHintT > 0) {
      steerHintT -= dt;
      const touch = matchMedia('(pointer: coarse)').matches;
      setBubble(btn ? '◀ ▶ 방향' : touch ? '기울이면 방향' : '← → 방향', '');
      return;
    }
    setBubble('', '');
  }

  // ---------- 루프 ----------
  const dbg = { paused: false };
  function simStep(dt) {
    A.update(dt);
    const tgt = state === 'play' ? steerInput() : 0;
    car.steer += (tgt - car.steer) * Math.min(1, dt * 10);
    if (state === 'play' || state === 'arrived') stepCar(dt);
    stepDoors(dt);
    if (state === 'play' && running) { runT += dt; recordGhost(dt); }
    if (state === 'play' && !running && Math.hypot(car.vx, car.vy) > 5) running = true;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (dbg.paused) { requestAnimationFrame(frame); return; }

    const raw = A.update(dt);
    if (state === 'calib') updateCalib(dt, raw);

    const tgt = state === 'play' ? steerInput() : 0;
    car.steer += (tgt - car.steer) * Math.min(1, dt * 10);

    if (state === 'count') {
      countT -= dt;
      if (countT <= 0) { state = 'play'; flash(track.night ? '붕! 소리 내면 깜깜해져' : '붕!', track.night ? 1.6 : 0.7); if (mode === 'mic') A.startRecording(); renderRoom(); }
    }
    if (state === 'play' || state === 'arrived') stepCar(dt);
    if (state === 'play') {
      if (!running && Math.hypot(car.vx, car.vy) > 5) running = true;
      if (running) { runT += dt; recordGhost(dt); }
    }
    stepParticles(dt);
    stepDoors(dt);
    if (track.night) {
      // 소리를 낼수록 밝게 (켜질 땐 빠르게, 꺼질 땐 천천히)
      // 밤: 소리를 내면 불이 어두워지고(빠르게), 조용히 해야 다시 밝아짐(천천히)
      const ty = inputType(), want = state !== 'play' || ty === 'none' ? 1 : Math.max(0.03, 0.3 - 0.3 * Math.min(1, inputIntensity()));
      light += (want - light) * Math.min(1, dt * (want < light ? 9 : 0.9));
    }
    if (car.blink > 0) car.blink -= dt;
    if (myHorn > 0) myHorn -= dt;
    peerHorn.forEach((v, k) => { if (v - dt <= 0) peerHorn.delete(k); else peerHorn.set(k, v - dt); });
    track.trees.forEach((t) => { if (t.wobble > 0) t.wobble -= dt; });
    updateHints(dt);
    hudT += dt;
    if (state === 'play' && hudT > 0.1) updateHud();
    const speed = Math.hypot(car.vx, car.vy);
    if (mode === 'buttons' && state !== 'title') Sfx.engine(Math.min(1, speed / P.VMAX), state === 'play' || state === 'arrived');
    else if (mode === 'buttons') Sfx.engine(0, false);
    if (state === 'play' || state === 'arrived') On.sendState(car, color, state === 'arrived');
    Net.stage = stageIdx;
    Net.setStatus(state, stageIdx, hat);
    if (state === 'play' || state === 'arrived' || state === 'count') Net.sendState(car, stageIdx, state === 'arrived');

    // 카메라: 진행 방향을 위로
    const moveA = speed > 60 ? Math.atan2(car.vx, -car.vy) : car.h;
    const wantA = car.drifting ? moveA : wrap(car.h + wrap(moveA - car.h) * 0.5);
    cam.a += wrap(wantA - cam.a) * Math.min(1, dt * 3);
    cam.x += (car.x - cam.x) * Math.min(1, dt * 8);
    cam.y += (car.y - cam.y) * Math.min(1, dt * 8);
    const zWant = (cw / 400) * (1 - 0.18 * Math.min(1, speed / P.VMAX));
    cam.z += (zWant - cam.z) * Math.min(1, dt * 2);
    shake = Math.max(0, shake - dt);

    // 친구 차 (같은 스테이지)
    const peers = On.peers.map((p) => ({ ...p, horn: peerHorn.get(p.key) || 0, label: On.nameOf(p.id) || '친구' }))
      .concat(Net.peers.map((p) => ({ ...p, horn: peerHorn.get(p.key) || 0, label: p.name })));
    // 내 최고 기록 고스트 (같이 하는 경주 중엔 안 보임)
    if (state === 'play' && running && !Net.race) {
      const gp = ghostAt(runT);
      if (gp) peers.push({ key: 'ghost', ...gp, c: color, alpha: 0.32, label: '내 최고', hat, horn: 0 });
    }

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = shake ? (Math.random() - 0.5) * 16 * shake : 0, sy = shake ? (Math.random() - 0.5) * 16 * shake : 0;
    if (view === '3d' && state !== 'title') {
      g.save(); g.translate(sx, sy);
      const r3 = BB.Render3D.draw(g, cw, ch, { track, car, camA: cam.a, particles, peers, color, hat, myHorn, mainI: car.pi ? T.pointAt(track, car.s).i : car.segI });
      g.restore();
      if (track.night && r3) nightOverlay(r3.x, r3.y - 110, (cw / 400) * (80 + 280 * light));
    } else {
      g.fillStyle = track.night ? '#1d2252' : '#bfe6ff'; g.fillRect(0, 0, cw, ch);
      g.save();
      g.translate(cw / 2 + sx, ch * 0.68 + sy);
      g.scale(cam.z, cam.z);
      g.rotate(-cam.a);
      g.translate(-cam.x, -cam.y);
      drawWorld2D();
      drawParticles2D();
      for (const p of peers) drawCar2D(p.x, p.y, p.h, p.c, 0, { alpha: p.alpha || 0.75, hat: p.hat });
      let sc = 1, spin = 0, alpha = 1;
      if (car.fallT >= 0) { sc = Math.max(0.05, 1 - car.fallT / 0.75); spin = car.fallT * 6; }
      if (car.blink > 0 && Math.floor(car.blink * 10) % 2 === 0) alpha = 0.35;
      if (car.z > 0) {
        g.save(); g.translate(car.x + car.z * 0.35, car.y + car.z * 0.35); g.rotate(car.h);
        g.fillStyle = 'rgba(40,30,60,.25)'; D.rr(g, -15, -22, 30, 46, 13); g.fill(); g.restore();
        sc *= 1 + car.z / 110;
      }
      drawDoors2D();
      drawCar2D(car.x, car.y, car.h, color, car.steer, { sc, spin, alpha, turbo: car.turbo > 0, hat });
      drawTrees2D();
      g.restore();
      if (track.night) {
        const [cx, cy] = w2s(car.x + Math.sin(car.h) * 60, car.y - Math.cos(car.h) * 60);
        nightOverlay(cx, cy, (65 + 270 * light) * cam.z);
      }
      // 이름표 / 빵!
      for (const p of peers) {
        const [x, y] = w2s(p.x, p.y);
        tag(x, y - 34, p.label);
        if (p.horn > 0) tag(x, y - 58, '빵!', '#e8673c');
      }
      if (myHorn > 0) { const [x, y] = w2s(car.x, car.y); tag(x, y - 40, '빵!', '#e8673c'); }
    }
    if (state !== 'title' && mode === 'mic') drawMeter();

    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) { A.resume(); Sfx.unlock(); last = performance.now(); } });
  // iOS는 전화·시리 뒤 오디오가 'interrupted'로 멈춤 → 화면을 누르면 다시 살림 (친구 목소리 재생도 다시 시도)
  document.addEventListener('pointerdown', () => { A.resume(); Sfx.unlock(); Net.kickAudio(); }, { capture: true });

  loadStage(0);
  buildTitle();
  renderRoom();
  On.init();
  // 홈 화면에 추가했을 때 오프라인에서도 열리게 (아티팩트 안에선 안 씀)
  if (!BB.ARTIFACT && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  requestAnimationFrame(frame);

  // 테스트/디버그용
  window.BBdebug = {
    dbg, simStep, keyDir, padState, setTilt(v) { tilt = v; }, aheadPoint, get jumpOK() { return jumpOK; }, get quietOK() { return quietOK; }, get light() { return light; },
    get state() { return state; }, car, get track() { return track; }, loadStage,
    startPlay(m) { mode = m || 'buttons'; startPlay(); }, startCalibration, get stageIdx() { return stageIdx; },
    get runT() { return runT; }, get stars() { return stars; }, setView(v) { view = v; applyView(); },
  };
})();
