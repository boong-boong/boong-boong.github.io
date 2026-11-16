// 붕붕 — 같이 달리기 / 기록 순위
// claude.ai 아티팩트로 열었을 때만 켜진다 (room: 실시간 위치·경적, db: 최고 기록, user: 이름).
// 일반 웹페이지에서는 아무것도 하지 않고 혼자 하기로 동작.
(function () {
  const BB = window.BB || (window.BB = {});
  const O = {
    on: false,          // 같이 달리기 연결됨
    boardOn: false,     // 기록 순위 사용 가능
    myId: null,
    peers: [],          // [{key, x, y, h, c, s, f, name, horn}]
    names: {},          // id -> 이름
    records: [],        // [{id, t1.., st1..}]
    onHorn: null,       // (peerKey) => void
    onChange: null,     // 순위/이름 바뀜
  };
  let room = null, named = null, user = null, db = null;
  let curName = null, wantStage = null;
  let lastSend = 0;

  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

  async function init() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    try {
      const [r, u, d] = await Promise.all([
        window.claude.use('room').catch(() => null),
        window.claude.use('user').catch(() => null),
        window.claude.use('db').catch(() => null),
      ]);
      room = r; user = u; db = d;
    } catch (e) { return; }
    if (user) { try { O.myId = await user.id(); } catch (e) {} }
    if (db) subscribeBoard();
    if (room && wantStage != null) joinStage(wantStage);
  }

  async function joinStage(i) {
    wantStage = i;
    if (!room) return;
    const name = 'stage-' + (i + 1);
    if (curName === name) return;
    curName = name;
    const old = named; named = null; O.peers = []; O.on = false;
    if (old) { try { await old.leave(); } catch (e) {} }
    let nr;
    try { nr = await room.join(name); } catch (e) { return; }
    if (curName !== name) { try { nr.leave(); } catch (e) {} return; }
    named = nr; O.on = true;
    named.onPeers((ch) => {
      O.peers = ch.peers.filter((p) => !p.isMe).map((p) => {
        const pr = p.presence || {};
        const id = p.by || (typeof pr.uid === 'string' ? pr.uid : null);
        return {
          key: p.peer, id,
          x: num(pr.x), y: num(pr.y), h: num(pr.h) || 0, s: num(pr.s) || 0,
          c: typeof pr.c === 'string' && /^#[0-9a-f]{6}$/i.test(pr.c) ? pr.c : '#9b8cff',
          f: pr.f === 1, updatedAt: p.updatedAt,
        };
      }).filter((p) => p.x != null && p.y != null);
      resolveNames(O.peers.map((p) => p.id));
    }, () => {});
    named.on('horn', (m) => { if (!m.isMe && O.onHorn) O.onHorn(m.peer); }, () => {});
  }

  function sendState(car, color, finished) {
    if (!named) return;
    const now = performance.now();
    if (now - lastSend < 60) return;
    lastSend = now;
    named.presence({
      x: Math.round(car.x), y: Math.round(car.y), h: Math.round(car.h * 100) / 100,
      s: Math.round(car.s), c: color, f: finished ? 1 : 0, uid: O.myId,
    }).catch(() => {});
  }

  function horn() { if (named) named.emit('horn', {}).catch(() => {}); }

  async function resolveNames(ids) {
    if (!user || !user.profiles) return;
    const need = [...new Set(ids.filter((id) => id && !(id in O.names)))];
    if (!need.length) return;
    need.forEach((id) => (O.names[id] = ''));
    try {
      const ps = await user.profiles(need);
      need.forEach((id) => { O.names[id] = (ps && ps[id] && ps[id].name) || ''; });
      if (O.onChange) O.onChange();
    } catch (e) {}
  }

  function subscribeBoard() {
    try {
      db.collection('records').onSnapshot((snap) => {
        O.boardOn = true;
        O.records = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        resolveNames(O.records.map((r) => r.id));
        if (O.onChange) O.onChange();
      }, () => { O.boardOn = false; });
    } catch (e) {}
  }

  // 내 최고 기록 올리기 (더 빠를 때만)
  async function submit(stageIdx, time, stars) {
    if (!db || !O.myId) return false;
    const k = 't' + (stageIdx + 1), ks = 'st' + (stageIdx + 1);
    const mine = O.records.find((r) => r.id === O.myId) || {};
    const best = num(mine[k]);
    if (best != null && best <= time) return false;
    const next = {};
    Object.keys(mine).forEach((key) => { if (/^(t|st)\d+$/.test(key) && num(mine[key]) != null) next[key] = mine[key]; });
    next[k] = Math.round(time * 100) / 100; next[ks] = stars; next.at = Date.now();
    try { await db.doc('records/' + O.myId).set(next); return true; } catch (e) { return false; }
  }

  function top(stageIdx, n) {
    const k = 't' + (stageIdx + 1), ks = 'st' + (stageIdx + 1);
    return O.records
      .filter((r) => num(r[k]) != null && r[k] > 0)
      .sort((a, b) => a[k] - b[k])
      .slice(0, n || 5)
      .map((r) => ({ time: r[k], stars: num(r[ks]) || 0, me: r.id === O.myId, name: O.names[r.id] || '' }));
  }

  function nameOf(id) { return (id && O.names[id]) || ''; }

  Object.assign(O, { init, joinStage, sendState, horn, submit, top, nameOf });
  BB.Online = O;
})();
