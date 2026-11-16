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
  const rtc = new Map();      // id -> { pc, audio, pending: [] }

  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const changed = () => { if (N.onChange) N.onChange(); };

  function makeCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  }
  function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }

  async function join(code, name, color) {
    code = cleanCode(code);
    if (code.length !== 4) return { ok: false, why: '방 코드는 4글자예요' };
    if (!window.supabase || !BB.NET_CONFIG) return { ok: false, why: '연결 준비가 안 됐어요 (인터넷 확인)' };
    await leave();
    me = { name: str(name, 12) || '친구', color, ready: voiceReady };
    if (!client) client = window.supabase.createClient(BB.NET_CONFIG.url, BB.NET_CONFIG.anonKey, { realtime: { params: { eventsPerSecond: 30 } } });
    ch = client.channel('boong-' + code, { config: { broadcast: { self: false }, presence: { key: myId } } });

    ch.on('broadcast', { event: 'car' }, ({ payload: p }) => {
      if (!p || typeof p.id !== 'string' || p.id === myId) return;
      const x = num(p.x), y = num(p.y);
      if (x == null || y == null) return;
      cars.set(p.id, { x, y, h: num(p.h) || 0, s: num(p.s) || 0, z: num(p.z) || 0, st: num(p.st), f: p.f === 1, t: performance.now() });
    });
    ch.on('broadcast', { event: 'horn' }, ({ payload: p }) => { if (p && typeof p.id === 'string' && N.onHorn) N.onHorn(p.id); });
    ch.on('broadcast', { event: 'start' }, ({ payload: p }) => {
      const st = num(p && p.stage), wait = num(p && p.wait);
      if (st == null || wait == null) return;
      N.race = str(p.race, 12); N.results = [];
      if (N.onStart) N.onStart({ stage: Math.max(0, Math.min(99, Math.floor(st))), wait: Math.max(0, Math.min(5000, wait)) });
      changed();
    });
    ch.on('broadcast', { event: 'finish' }, ({ payload: p }) => {
      const t = num(p && p.time);
      if (t == null || typeof p.id !== 'string') return;
      if (p.race !== N.race) return;
      N.results = N.results.filter((r) => r.id !== p.id);
      N.results.push({ id: p.id, name: str(p.name, 12) || '친구', time: t, stars: num(p.stars) || 0 });
      changed();
    });
    ch.on('broadcast', { event: 'sig' }, ({ payload: p }) => { if (p && p.to === myId && typeof p.from === 'string') onSignal(p); });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      N.members = Object.entries(st).map(([id, arr]) => {
        const m = (arr && arr[0]) || {};
        return { id, name: str(m.name, 12) || '친구', color: /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : '#9b8cff', ready: !!m.ready };
      });
      // 나간 친구 정리
      for (const id of [...rtc.keys()]) if (!N.members.some((m) => m.id === id)) closePeer(id);
      for (const id of [...cars.keys()]) if (!N.members.some((m) => m.id === id)) cars.delete(id);
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
    try { history.replaceState(null, '', '#room-' + code); } catch (e) {}
    changed();
    return { ok: true };
  }

  async function leave() {
    for (const id of [...rtc.keys()]) closePeer(id);
    cars.clear();
    if (ch) { try { await ch.untrack(); } catch (e) {} try { await client.removeChannel(ch); } catch (e) {} }
    ch = null; N.on = false; N.code = null; N.members = []; N.results = []; N.race = null;
    try { if (location.hash.startsWith('#room-')) history.replaceState(null, '', location.pathname); } catch (e) {}
    changed();
  }

  function send(event, payload) { if (ch && N.on) ch.send({ type: 'broadcast', event, payload }).catch(() => {}); }

  function sendState(car, stage, finished) {
    if (!N.on) return;
    const now = performance.now();
    if (now - lastSend < 80) return;
    lastSend = now;
    send('car', { id: myId, x: Math.round(car.x), y: Math.round(car.y), h: Math.round(car.h * 100) / 100, s: Math.round(car.s), z: Math.round(car.z || 0), st: stage, f: finished ? 1 : 0 });
  }
  function horn() { send('horn', { id: myId }); }
  // 같이 출발: 3.5초 뒤 출발 (보낸 사람도 같은 시간)
  function startRace(stage) {
    const race = Math.random().toString(36).slice(2, 8);
    N.race = race; N.results = [];
    send('start', { stage, wait: 3500, race });
    changed();
    return { stage, wait: 3500 };
  }
  function finish(stage, time, stars) {
    if (!N.on || !N.race) return;
    N.results = N.results.filter((r) => r.id !== myId);
    N.results.push({ id: myId, name: me.name, time, stars, me: true });
    send('finish', { id: myId, name: me.name, time: Math.round(time * 100) / 100, stars, race: N.race, stage });
    changed();
  }

  function peerList() {
    const now = performance.now(), out = [];
    cars.forEach((c, id) => {
      if (now - c.t > 4000) return;
      if (c.st !== N.stage) return;
      const m = N.members.find((mm) => mm.id === id);
      out.push({ key: 'n:' + id, id: null, x: c.x, y: c.y, h: c.h, s: c.s, z: c.z, c: m ? m.color : '#9b8cff', name: m ? m.name : '친구', f: c.f });
    });
    return out;
  }

  // ---------- 목소리 (WebRTC) ----------
  // stream: 내 마이크 (없으면 듣기만)
  async function enableVoice(stream) {
    localStream = stream || null;
    voiceReady = true;
    me.ready = true;
    if (ch && N.on) { try { await ch.track(me); } catch (e) {} }
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
    pc.ontrack = (e) => { audio.srcObject = e.streams[0] || new MediaStream([e.track]); audio.play().catch(() => {}); changed(); };
    pc.onicecandidate = (e) => { if (e.candidate) send('sig', { to: id, from: myId, type: 'ice', c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') { closePeer(id); setTimeout(syncVoice, 1500); }
      changed();
    };
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
  function setVoice(on) {
    N.voice = on;
    rtc.forEach((r) => { r.audio.muted = !on; if (on) r.audio.play().catch(() => {}); });
    changed();
  }
  function voiceCount() {
    let n = 0;
    rtc.forEach((r) => { if (r.pc.connectionState === 'connected') n++; });
    return n;
  }

  Object.assign(N, { makeCode, cleanCode, join, leave, sendState, horn, startRace, finish, enableVoice, setVoice, voiceCount, stage: 0 });
  BB.Net = N;
})();
