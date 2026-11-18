// 붕붕 — 친구랑 같이 (마이크 버전, GitHub Pages)
// Supabase Realtime 채널 하나 = 방 하나 (방 코드 4자리).
//   presence: 방에 누가 있는지 (이름, 색, 목소리 준비됨)
//   broadcast: 차 위치(초당 약 12번), 경적, 같이 출발, 도착 기록, 목소리 연결 신호
// 목소리: 친구끼리 WebRTC로 직접 연결 (STUN만 사용. 일부 모바일 데이터망에선 연결이 안 될 수 있음)
(function () {
  const BB = window.BB || (window.BB = {});
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

  const myId = (() => {
    try {
      let v = sessionStorage.getItem('bb_net_id');
      if (!v) { v = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('bb_net_id', v); }
      return v;
    } catch (e) { return Math.random().toString(36).slice(2, 10); }
  })();

  const N = {
    on: false, code: null, myId,
    members: [],              // [{id, name, color, ready}]
    results: [],              // 이번 경주 도착 기록 [{id, name, time, stars, race}]
    race: null,               // 지금 경주 id (같이 출발할 때마다 새로)
    voice: true,              // 친구 목소리 듣기
    onHorn: null, onStart: null, onChange: null,
    get peers() { return peerList(); },
  };
  let client = null, ch = null, lastSend = 0, me = { name: '', color: '#ff6b6b', ready: false };
  let localStream = null, voiceReady = false;
  const cars = new Map();     // id -> 마지막 위치
  let sinceFixed = false;     // 들어온 시각을 먼저 있던 사람들 뒤로 맞췄는지
  const loudAt = new Map();    // id -> 친구가 마지막으로 소리 낸 시각
  // 친구 중 누가 방금(0.5초 안) 소리를 냈나
  function friendSound() { const now = performance.now(); for (const t of loudAt.values()) if (now - t < 500) return true; return false; }
  const rtc = new Map();      // id -> { pc, audio, pending: [] }
  // 방 인원은 Supabase 접속자 목록 + 2초마다 오는 안부(hello)를 합쳐서 판단
  // (접속자 목록은 상태를 자주 바꾸면 잠깐 어긋날 때가 있어서)
  const lastSeen = new Map(); // id -> 마지막으로 소식(접속자 목록/안부/위치/신호)이 온 때
  const known = new Map();    // id -> 안부로 받은 정보
  let presenceList = [];
  const seen = (id) => lastSeen.set(id, performance.now());
  function rebuildMembers() {
    const now = performance.now(), map = new Map();
    presenceList.forEach((m) => map.set(m.id, m));
    known.forEach((k, id) => { if (now - k.t < 8000) map.set(id, { ...(map.get(id) || {}), ...k, id }); });
    if (N.on) map.set(myId, { id: myId, name: me.name, color: me.color, ready: me.ready, st: me.st || 'title', stage: me.stage ?? null, hat: me.hat || '', since: me.since });
    N.members = [...map.values()];
  }
  function sendHello() { if (N.on) send('hello', { id: myId, name: me.name, color: me.color, ready: !!me.ready, st: me.st || 'title', stage: me.stage ?? null, hat: me.hat || '', since: me.since }); }
  // 방장: 방에 가장 먼저 들어온 사람 (방 만든 사람). 나가면 그다음에 들어온 사람
  function hostId() {
    let best = null;
    for (const m of N.members) {
      const a = m.since ?? Infinity, b = best ? (best.since ?? Infinity) : Infinity;
      if (!best || a < b || (a === b && m.id < best.id)) best = m;
    }
    return best ? best.id : myId;
  }
  function isHost() { return !N.on || hostId() === myId; }
  setInterval(() => {
    if (!N.on) return;
    sendHello();
    const now = performance.now();
    presenceList.forEach((m) => lastSeen.set(m.id, now));
    for (const id of [...rtc.keys()]) if (now - (lastSeen.get(id) || 0) > 8000) closePeer(id);
    for (const id of [...cars.keys()]) if (now - (lastSeen.get(id) || 0) > 8000) cars.delete(id);
    for (const id of [...known.keys()]) if (now - known.get(id).t > 8000) known.delete(id);
    const before = N.members.length;
    rebuildMembers();
    syncVoice();
    if (before !== N.members.length) changed();
  }, 2000);

  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const changed = () => { if (N.onChange) N.onChange(); };

  function makeCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  }
  function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }

  let joining = null;
  async function join(code, name, color) {
    if (joining) await joining.catch(() => {});
    joining = joinInner(code, name, color);
    try { return await joining; } finally { joining = null; }
  }
  async function joinInner(code, name, color) {
    if (N.test) await leave();
    code = cleanCode(code);
    if (code.length !== 4) return { ok: false, why: '방 코드는 4글자예요' };
    if (!window.supabase || !BB.NET_CONFIG) return { ok: false, why: '연결 준비가 안 됐어요\n인터넷을 확인해 줘' };
    await leave();
    me = { name: str(name, 12) || '친구', color, ready: voiceReady, since: Date.now() };
    sinceFixed = false;
    if (!client) client = window.supabase.createClient(BB.NET_CONFIG.url, BB.NET_CONFIG.anonKey, { realtime: { params: { eventsPerSecond: 40 } } });
    ch = client.channel('boong-' + code, { config: { broadcast: { self: false }, presence: { key: myId } } });

    ch.on('broadcast', { event: 'car' }, ({ payload: p }) => {
      if (!p || typeof p.id !== 'string' || p.id === myId) return;
      const x = num(p.x), y = num(p.y);
      if (x == null || y == null) return;
      // 받은 위치 두 개로 속도를 구해 두고, 그리는 사이에는 조금 앞으로 예측 (초당 10번만 받으니 부드럽게)
      seen(p.id);
      const now = performance.now(), prev = cars.get(p.id);
      let vx = 0, vy = 0;
      if (prev && now - prev.t > 20 && now - prev.t < 500) { vx = (x - prev.x) / ((now - prev.t) / 1000); vy = (y - prev.y) / ((now - prev.t) / 1000); }
      cars.set(p.id, { x, y, vx, vy, h: num(p.h) || 0, s: num(p.s) || 0, z: num(p.z) || 0, st: num(p.st), f: p.f === 1, t: now });
      if (p.v === 1 || p.v === 2) loudAt.set(p.id, now);
    });
    ch.on('broadcast', { event: 'horn' }, ({ payload: p }) => { if (p && typeof p.id === 'string' && N.onHorn) N.onHorn(p.id); });
    ch.on('broadcast', { event: 'start' }, ({ payload: p }) => {
      const st = num(p && p.stage), wait = num(p && p.wait);
      if (st == null || wait == null) return;
      N.race = str(p.race, 12); N.results = []; N.raceStage = Math.floor(st);
      if (N.onStart) N.onStart({ stage: Math.max(0, Math.min(99, Math.floor(st))), wait: Math.max(0, Math.min(5000, wait)) });
      changed();
    });
    ch.on('broadcast', { event: 'finish' }, ({ payload: p }) => {
      const t = num(p && p.time);
      if (t == null || typeof p.id !== 'string') return;
      if (!N.race || p.race !== N.race || num(p.stage) !== N.raceStage) return;
      N.results = N.results.filter((r) => r.id !== p.id);
      N.results.push({ id: p.id, name: str(p.name, 12) || '친구', time: t, stars: num(p.stars) || 0 });
      changed();
    });
    ch.on('broadcast', { event: 'sig' }, ({ payload: p }) => { if (p && p.to === myId && typeof p.from === 'string') { seen(p.from); onSignal(p); } });
    ch.on('broadcast', { event: 'hello' }, ({ payload: p }) => {
      if (!p || typeof p.id !== 'string' || p.id === myId) return;
      seen(p.id);
      known.set(p.id, {
        name: str(p.name, 12) || '친구', color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#9b8cff', ready: !!p.ready,
        st: ['title', 'calib', 'play', 'count', 'arrived', 'wait'].includes(p.st) ? p.st : 'title', stage: num(p.stage), hat: str(p.hat, 10), since: num(p.since), t: performance.now(),
      });
      const had = N.members.some((m) => m.id === p.id);
      rebuildMembers(); syncVoice();
      if (!had) sendHello();     // 새로 온 친구에게 나도 바로 알림
      changed();
    });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      presenceList = Object.entries(st).map(([id, arr]) => {
        const m = (arr && arr[0]) || {};
        return { id, name: str(m.name, 12) || '친구', color: /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : '#9b8cff', ready: !!m.ready,
          st: ['title', 'calib', 'play', 'count', 'arrived', 'wait'].includes(m.st) ? m.st : 'title', stage: num(m.stage), hat: str(m.hat, 10), since: num(m.since) };
      });
      const now = performance.now();
      presenceList.forEach((m) => lastSeen.set(m.id, now));
      // 방장 정하기는 들어온 시각 순서. 폰 시계가 늦어도 먼저 있던 사람보다 앞서지 않게, 처음 한 번 맞춤
      if (!sinceFixed) {
        sinceFixed = true;
        const others = presenceList.filter((m) => m.id !== myId && m.since != null);
        if (others.length) {
          const mx = Math.max(...others.map((m) => m.since));
          if (me.since <= mx) { me.since = mx + 1; ch.track(me).catch(() => {}); sendHello(); }
        }
      }
      rebuildMembers();
      syncVoice();
      changed();
    });

    const ok = await new Promise((res) => {
      const timer = setTimeout(() => res(false), 8000);
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); try { await ch.track(me); } catch (e) {} res(true); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); res(false); }
      });
    });
    if (!ok) { await leave(); return { ok: false, why: '방에 연결하지 못했어요' }; }
    N.on = true; N.code = code;
    rebuildMembers(); sendHello();
    try { history.replaceState(null, '', '#room-' + code); } catch (e) {}
    changed();
    return { ok: true };
  }

  // ---------- 시험판: 봇 친구 ----------
  // 주소에 ?test 를 붙이면 진짜 방 없이, 트랙을 따라 달리는 봇 친구들과 같이 하기 (나는 방장)
  let bots = [];
  const BOT_DEF = [
    { id: 'bot-minji', name: '민지', color: '#4dabf7', skill: 0.66, lane: -24 },
    { id: 'bot-dasol', name: '다솔', color: '#51cf66', skill: 0.57, lane: 24 },
    { id: 'bot-junho', name: '준호', color: '#b197fc', skill: 0.62, lane: -8 },
    { id: 'bot-seoyeon', name: '서연', color: '#ffd43b', skill: 0.7, lane: 8 },
  ];
  function startBots(n, name, color) {
    if (N.on) return;
    N.on = true; N.test = true; N.code = 'TEST';
    me = { name: str(name, 12) || '나', color, ready: false, since: Date.now() };
    bots = BOT_DEF.slice(0, Math.max(1, Math.min(4, n))).map((d, i) => ({ ...d, since: me.since + 1 + i, st: 'wait', s: 0, v: 0, ph: Math.random() * 6, x: 0, y: 0, h: 0 }));
    botsKnown();
    rebuildMembers(); changed();
  }
  function stopBots() {
    bots.forEach((b) => { known.delete(b.id); cars.delete(b.id); lastSeen.delete(b.id); });
    bots = []; N.test = false;
  }
  function botsKnown() {
    const now = performance.now();
    bots.forEach((b) => {
      known.set(b.id, { name: b.name, color: b.color, ready: false, st: b.st === 'count' ? 'play' : b.st, stage: b.stage ?? N.stage, hat: '', since: b.since, t: now });
      lastSeen.set(b.id, now);
    });
  }
  function botsStart(stage) {
    const now = performance.now();
    bots.forEach((b) => { b.st = 'count'; b.stage = stage; b.s = 0; b.v = 0; b.goAt = now + 3500 + Math.random() * 350; });
  }
  // 매 프레임 (게임에서 부름): 트랙을 따라 굽은 곳에선 느리게
  function tickBots(dt, track, pointAt, vmax) {
    if (!N.test || !track) return;
    const now = performance.now();
    let chg = false;
    for (const b of bots) {
      if (b.st === 'wait') { b.stage = N.stage; b.s = 0; }
      if (b.st === 'count' && now >= b.goAt) { b.st = 'play'; b.t0 = b.goAt; chg = true; }
      if (b.st === 'play') {
        const p1 = pointAt(track, b.s), p2 = pointAt(track, b.s + 140);
        let dh = p2.h - p1.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
        const want = vmax * b.skill * (1 - Math.min(0.55, Math.abs(dh) * 0.9)) * (0.9 + 0.18 * Math.sin(now / 1400 + b.ph));
        b.v += (want - b.v) * Math.min(1, dt * 2);
        b.s += b.v * dt;
        if (b.s >= track.total) {
          b.s = track.total; b.st = 'arrived'; chg = true;
          const time = Math.round(((now - b.t0) / 1000) * 100) / 100;
          if (N.race) N.results.push({ id: b.id, name: b.name, time, stars: Math.floor(Math.random() * 4) });
        }
      }
      const p = pointAt(track, b.s);
      const x = p.x + Math.cos(p.h) * b.lane, y = p.y + Math.sin(p.h) * b.lane;
      const vx = dt > 0 ? (x - b.x) / dt : 0, vy = dt > 0 ? (y - b.y) / dt : 0;
      b.x = x; b.y = y; b.h = p.h;
      cars.set(b.id, { x, y, vx: b.st === 'play' ? vx : 0, vy: b.st === 'play' ? vy : 0, h: p.h, s: b.s, z: 0, st: b.stage ?? N.stage, f: b.st === 'arrived', t: now });
    }
    botsKnown();
    if (chg) { rebuildMembers(); changed(); }
  }
  // 봇 목소리: 달릴 때 붕붕 하는 것처럼 오르내림
  function botLevel(b) {
    if (b.st !== 'play') return 0;
    const t = performance.now() / 1000 + b.ph;
    return Math.sin(t * 0.9) > -0.3 ? Math.max(0, Math.min(1, 0.55 + 0.35 * Math.sin(t * 7) * Math.sin(t * 2.3))) : 0;
  }

  async function leave() {
    if (N.test) stopBots();
    for (const id of [...rtc.keys()]) closePeer(id);
    cars.clear(); lastSeen.clear(); known.clear(); presenceList = [];
    if (ch) { try { await ch.untrack(); } catch (e) {} try { await client.removeChannel(ch); } catch (e) {} }
    ch = null; N.on = false; N.code = null; N.members = []; N.results = []; N.race = null;
    try { if (location.hash.startsWith('#room-')) history.replaceState(null, '', location.pathname); } catch (e) {}
    changed();
  }

  function send(event, payload) { if (ch && N.on) ch.send({ type: 'broadcast', event, payload }).catch(() => {}); }

  // v: 내가 지금 소리 내는 중인지 (0 조용, 1 붕, 2 끼익) → 친구 쪽에서 내 목소리가 친구 차를 움직이지 않게 씀
  let lastV = 0;
  function sendState(car, stage, finished, v) {
    if (!N.on) return;
    const now = performance.now();
    v = v | 0;
    // 소리를 막 내기 시작했으면 기다리지 않고 바로 알림 (너무 잦지 않게 40ms 간격은 둠)
    const urgent = v !== lastV && v > 0 && now - lastSend > 40;
    if (now - lastSend < 100 && !urgent) return;
    lastSend = now; lastV = v;
    send('car', { id: myId, x: Math.round(car.x), y: Math.round(car.y), h: Math.round(car.h * 100) / 100, s: Math.round(car.s), z: Math.round(car.z || 0), st: stage, f: finished ? 1 : 0, v });
  }
  function horn() { send('horn', { id: myId }); }
  // 같이 출발: 3.5초 뒤 출발 (보낸 사람도 같은 시간)
  function startRace(stage) {
    const race = Math.random().toString(36).slice(2, 8);
    N.race = race; N.results = []; N.raceStage = stage;
    send('start', { stage, wait: 3500, race });
    botsStart(stage);
    changed();
    return { stage, wait: 3500 };
  }
  function finish(stage, time, stars) {
    if (!N.on || !N.race || stage !== N.raceStage) return;
    N.results = N.results.filter((r) => r.id !== myId);
    N.results.push({ id: myId, name: me.name, time, stars, me: true });
    send('finish', { id: myId, name: me.name, time: Math.round(time * 100) / 100, stars, race: N.race, stage });
    changed();
  }

  // 혼자 다시 하기·다음 스테이지·처음 화면: 같이 하던 경주는 끝 (다음 기록이 그 순위에 섞이지 않게)
  // 내 상태(처음 화면/보정 중/게임 중)와 스테이지, 모자를 방 사람들에게 (바뀔 때만)
  function setStatus(st, stage, hat) {
    if (me.st === st && me.stage === stage && me.hat === hat) return;
    me.st = st; me.stage = stage; me.hat = hat;
    if (N.on) { rebuildMembers(); sendHello(); changed(); }
  }
  function endRace() { if (N.race) { N.race = null; N.results = []; changed(); } }

  function peerList() {
    const now = performance.now(), out = [];
    cars.forEach((c, id) => {
      if (now - c.t > 4000) return;
      if (c.st !== N.stage) return;
      const m = N.members.find((mm) => mm.id === id);
      const ahead = Math.min(0.2, (now - c.t) / 1000);
      out.push({ key: 'n:' + id, id: null, pid: id, x: c.x + c.vx * ahead, y: c.y + c.vy * ahead, h: c.h, s: c.s, z: c.z, c: m ? m.color : '#9b8cff', name: m ? m.name : '친구', f: c.f, hat: m ? m.hat : '' });
    });
    return out;
  }

  // ---------- 목소리 (WebRTC) ----------
  // stream: 내 마이크 (없으면 듣기만)
  async function enableVoice(stream) {
    const prev = localStream;
    localStream = stream || null;
    if (prev !== localStream) {
      const track = localStream ? localStream.getAudioTracks()[0] : null;
      for (const [id, r] of [...rtc]) {
        const sender = r.pc.getSenders().find((sd) => sd.track);
        if (sender && sender.track && track) sender.replaceTrack(track).catch(() => {});
        else closePeer(id);   // 듣기만 하던 연결은 다시 맺음
      }
    }
    voiceReady = true;
    me.ready = true;
    if (ch && N.on) { try { await ch.track(me); } catch (e) {} rebuildMembers(); sendHello(); }
    syncVoice();
  }
  function syncVoice() {
    if (!voiceReady || !N.on) return;
    for (const m of N.members) {
      if (m.id === myId || !m.ready || rtc.has(m.id)) continue;
      if (myId < m.id) createPeer(m.id, true);   // id가 작은 쪽이 먼저 연결 요청
    }
  }
  function createPeer(id, initiator) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const audio = document.createElement('audio');
    audio.autoplay = true; audio.setAttribute('playsinline', ''); audio.muted = !N.voice;
    document.body.appendChild(audio);
    const r = { pc, audio, pending: [] };
    rtc.set(id, r);
    if (localStream) localStream.getAudioTracks().forEach((t) => pc.addTrack(t, localStream));
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.ontrack = (e) => { audio.srcObject = r.stream = e.streams[0] || new MediaStream([e.track]); audio.play().catch(() => {}); changed(); };
    pc.onicecandidate = (e) => { if (e.candidate) send('sig', { to: id, from: myId, type: 'ice', c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'failed') { closePeer(id); setTimeout(syncVoice, 1500); }
      else if (st === 'disconnected') {
        // 잠깐 끊김일 수 있으니 4초 기다렸다가 그대로면 다시 연결
        setTimeout(() => { const cur = rtc.get(id); if (cur && cur.pc === pc && pc.connectionState !== 'connected') { closePeer(id); syncVoice(); } }, 4000);
      }
      changed();
    };
    // 6초 안에 안 이어지면 (신호 메시지가 빠졌을 수 있음) 끊고 다시 시도
    setTimeout(() => {
      const cur = rtc.get(id);
      if (cur && cur.pc === pc && pc.connectionState !== 'connected') { closePeer(id); syncVoice(); }
    }, 6000);
    if (initiator) {
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => {
        send('sig', { to: id, from: myId, type: 'offer', sdp: pc.localDescription.toJSON() });
      }).catch(() => {});
    }
    return r;
  }
  async function onSignal(p) {
    let r = rtc.get(p.from);
    try {
      if (p.type === 'offer') {
        if (!voiceReady) return;
        if (r) closePeer(p.from);
        r = createPeer(p.from, false);
        await r.pc.setRemoteDescription(p.sdp);
        const a = await r.pc.createAnswer();
        await r.pc.setLocalDescription(a);
        send('sig', { to: p.from, from: myId, type: 'answer', sdp: r.pc.localDescription.toJSON() });
        for (const c of r.pending.splice(0)) await r.pc.addIceCandidate(c).catch(() => {});
      } else if (p.type === 'answer' && r) {
        await r.pc.setRemoteDescription(p.sdp);
        for (const c of r.pending.splice(0)) await r.pc.addIceCandidate(c).catch(() => {});
      } else if (p.type === 'ice' && r) {
        if (r.pc.remoteDescription) await r.pc.addIceCandidate(p.c).catch(() => {});
        else r.pending.push(p.c);
      }
    } catch (e) {}
  }
  function closePeer(id) {
    const r = rtc.get(id);
    if (!r) return;
    try { r.pc.close(); } catch (e) {}
    try { r.audio.srcObject = null; r.audio.remove(); } catch (e) {}
    rtc.delete(id);
  }
  function kickAudio() {
    if (!N.voice) return;
    rtc.forEach((r) => { if (r.audio.srcObject && r.audio.paused) r.audio.play().catch(() => {}); });
  }
  function setVoice(on) {
    N.voice = on;
    rtc.forEach((r) => { r.audio.muted = !on; if (on) r.audio.play().catch(() => {}); });
    changed();
  }
  // 친구 목소리 크기 (친구 목록의 마이크 표시용): id -> { on: 목소리 연결됨, lv: 0..1 }
  function voiceLevels() {
    const o = {};
    rtc.forEach((r, id) => {
      const tr = r.stream && r.stream.getAudioTracks()[0];
      const on = r.pc.connectionState === 'connected' && !!tr && tr.readyState === 'live';
      let lv = 0;
      if (on) {
        // 받는 쪽 소리 크기 (브라우저가 재 준 값, 0~1)
        try {
          const rc = r.pc.getReceivers().find((x) => x.track && x.track.kind === 'audio');
          const src = rc && rc.getSynchronizationSources ? rc.getSynchronizationSources()[0] : null;
          if (src && typeof src.audioLevel === 'number') {
            const db = 20 * Math.log10(src.audioLevel + 1e-9);
            lv = Math.max(0, Math.min(1, (db + 50) / 40));
          }
        } catch (e) {}
      }
      // 소리 크기를 못 재면 '소리 내는 중' 신호로라도
      if (on && lv < 0.05 && loudAt.has(id) && performance.now() - loudAt.get(id) < 300) lv = 0.7;
      o[id] = { on, lv };
    });
    bots.forEach((b) => (o[b.id] = { on: true, lv: botLevel(b) }));
    return o;
  }
  function voiceStates() { const o = {}; rtc.forEach((r, id) => (o[id] = r.pc.connectionState + '/' + r.pc.signalingState)); return { me: myId, ready: voiceReady, hasStream: !!localStream, members: N.members.map((m) => m.id + ':' + m.ready + ':' + m.st), rtc: o }; }
  function voiceCount() {
    let n = 0;
    rtc.forEach((r) => { if (r.pc.connectionState === 'connected') n++; });
    return n;
  }

  Object.assign(N, { startBots, tickBots, voiceLevels, hostId, isHost, friendSound, makeCode, cleanCode, join, leave, sendState, horn, startRace, finish, endRace, setStatus, enableVoice, setVoice, kickAudio, voiceCount, voiceStates, stage: 0, raceStage: null });
  BB.Net = N;
})();
