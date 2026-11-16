// 붕붕 — 스테이지(길) 만들기
// 길은 "직진 몇 px / 몇 도 커브(반지름)" 조각을 이어서 중앙선 점들로 만든다.
// 중앙선에서 떨어진 거리로 땅 종류를 판단:
//   ROAD_W/2 안: 길, 그 밖 GRASS_W까지: 잔디(느려짐), 더 밖: 낭떠러지(떨어짐)
(function () {
  const BB = window.BB || (window.BB = {});

  BB.ROAD_W = 150;
  BB.GRASS_W = 30;
  const STEP = 8;

  // 각도: 0 = 위쪽(북), 양수 = 오른쪽(시계방향) 커브
  // 일반 회전 반지름(300)으로는 못 돌고 끼익(드리프트)해야 도는 급커브는 r 100 안팎.
  // r 350 이상 완만한 커브는 핸들(기울기)만으로 돎.
  // items: 별(모으기)·번개(잠깐 터보). s = 출발점부터 거리, off = 가운데서 오른쪽(+)으로 px
  // trees: 길 위 나무(부딪히면 튕김)
  BB.STAGES = [
    { id: 1, name: '붕~', parts: [{ s: 2400 }],
      stars: { every: 200, wave: 45 }, bolts: [1300] },
    { id: 2, name: '끼익!', parts: [{ s: 750 }, { t: 165, r: 100 }, { s: 820 }],
      stars: { every: 170 }, bolts: [] },
    { id: 3, name: '구불구불', parts: [{ s: 550 }, { t: 160, r: 95 }, { s: 560 }, { t: -160, r: 95 }, { s: 520 }, { t: 155, r: 95 }, { s: 600 }],
      stars: { every: 180 }, bolts: [2500] },
    { id: 4, name: '숲길', parts: [{ s: 450 }, { t: -45, r: 520 }, { s: 400 }, { t: 70, r: 520 }, { s: 420 }, { t: -40, r: 550 }, { s: 650 }],
      stars: { every: 150, wave: 40 }, bolts: [2700],
      trees: [[300, -48], [1000, 48], [1950, -48], [2350, 48]] },
    { id: 5, name: '끝판', parts: [{ s: 500 }, { t: -60, r: 500 }, { s: 300 }, { t: 165, r: 100 }, { s: 520 }, { t: -160, r: 95 }, { s: 520 }, { t: 60, r: 500 }, { s: 520 }],
      stars: { every: 170 }, bolts: [3350],
      trees: [[1000, 45], [1750, -45], [2500, 40]] },
    // ---- 새 요소: 점프대·끊긴 길 / 쉿 구간 / 얼음·진흙 / 갈림길 ----
    // gaps: [끊긴 곳 s, 길이] 앞 80px이 점프대 · quiet: [s, 길이, 곰 쪽] · surf: [s, 길이, 'ice'|'mud']
    // branch: { at: 갈라지는 s, parts: 지름길 조각 } (끝은 본길에 다시 합류)
    { id: 6, name: '점프!', parts: [{ s: 1300 }, { t: 40, r: 600 }, { s: 1500 }],
      stars: { every: 200 }, bolts: [],
      gaps: [[750, 190], [2050, 240]] },
    { id: 7, name: '쉿!', parts: [{ s: 900 }, { t: -50, r: 550 }, { s: 900 }, { t: 60, r: 550 }, { s: 800 }],
      stars: { every: 190 }, bolts: [],
      quiet: [[650, 380, 1], [2000, 420, -1]] },
    { id: 8, name: '꽁꽁 얼음', parts: [{ s: 700 }, { t: 45, r: 600 }, { s: 800 }, { t: -60, r: 600 }, { s: 900 }],
      stars: { every: 180, wave: 35 }, bolts: [],
      surf: [[350, 650, 'ice'], [1700, 380, 'mud'], [2550, 420, 'ice']] },
    { id: 9, name: '갈림길', parts: [{ s: 700 }, { t: 180, r: 320 }, { s: 1800 }],
      stars: { every: 220 }, bolts: [],
      branch: { at: 300, parts: [{ t: 150, r: 95 }, { s: 842 }, { t: 30, r: 300 }] } },
    { id: 10, name: '대모험', parts: [{ s: 700 }, { t: 180, r: 320 }, { s: 1500 }, { t: -160, r: 95 }, { s: 1300 }],
      stars: { every: 200 }, bolts: [],
      branch: { at: 300, parts: [{ t: 150, r: 95 }, { s: 842 }, { t: 30, r: 300 }] },
      surf: [[1800, 260, 'mud']],
      quiet: [[2500, 290, -1]],
      gaps: [[3900, 220]] },
  ];

  const fwd = (h) => ({ x: Math.sin(h), y: -Math.cos(h) });
  const right = (h) => ({ x: Math.cos(h), y: Math.sin(h) });

  // 조각(parts)을 이어 중앙선 점들을 만든다. 급커브 안쪽엔 섬 벽.
  function buildPath(parts, x, y, h) {
    const pts = [];
    const turns = [];
    const walls = [];
    let s = 0;
    pts.push({ x, y, h, s });
    parts.forEach((p, idx) => {
      if (p.s != null) {
        const n = Math.max(1, Math.round(p.s / STEP));
        const d = p.s / n;
        for (let i = 0; i < n; i++) {
          const f = fwd(h);
          x += f.x * d; y += f.y * d; s += d;
          pts.push({ x, y, h, s });
        }
      } else {
        const th = (p.t * Math.PI) / 180;
        const dir = Math.sign(th);
        const len = Math.abs(th) * p.r;
        const n = Math.max(2, Math.round(len / STEP));
        const dth = th / n, d = len / n;
        const rv = right(h);
        const cx = x + rv.x * p.r * dir, cy = y + rv.y * p.r * dir;
        const hIn = h, s0 = s;
        for (let i = 0; i < n; i++) {
          h += dth / 2;
          const f = fwd(h);
          x += f.x * d; y += f.y * d; s += d;
          h += dth / 2;
          pts.push({ x, y, h, s });
        }
        turns.push({ s0, s1: s, dir, cx, cy, hIn, hOut: h, deg: Math.abs(p.t) });
        // 급커브 안쪽 섬에 벽: 두 길 사이 잔디를 가로질러 지름길 못 가게
        if (Math.abs(p.t) >= 140 && !p.noWall) {
          const fi = fwd(hIn), fo = fwd(h);
          let dx = -fi.x + fo.x, dy = -fi.y + fo.y;
          const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
          const prev = parts[idx - 1], next = parts[idx + 1];
          const legs = Math.min(prev && prev.s || 300, next && next.s || 300);
          const wl = Math.min(420, legs * 0.8);
          walls.push({ x1: cx + dx * 12, y1: cy + dy * 12, x2: cx + dx * wl, y2: cy + dy * wl });
        }
      }
    });
    return { pts, turns, walls, total: s };
  }

  function build(def) {
    const main = buildPath(def.parts, 0, 0, 0);
    const pts = main.pts, turns = main.turns, walls = main.walls.slice();
    let s = main.total;

    const total = s;
    const startS = 70;
    const finishS = total - 230;

    // 출발 뒤쪽 막는 벽
    {
      const p0 = pts[0], rv = right(p0.h), f = fwd(p0.h);
      const bx = p0.x - f.x * 30, by = p0.y - f.y * 30, hw = BB.ROAD_W / 2 + BB.GRASS_W;
      walls.push({ x1: bx - rv.x * hw, y1: by - rv.y * hw, x2: bx + rv.x * hw, y2: by + rv.y * hw });
    }

    // 별: 일정 간격, 커브 위는 길 가운데, 일부 스테이지는 좌우로 물결
    const items = [];
    const at = (ss, off) => { const p = pointAtPts(pts, ss), rv = right(p.h); return { x: p.x + rv.x * off, y: p.y + rv.y * off }; };
    if (def.stars) {
      let k = 0;
      for (let ss = startS + 160; ss < finishS - 60; ss += def.stars.every, k++) {
        const inTurn = turns.some((t) => ss > t.s0 - 20 && ss < t.s1 + 20);
        const nearTree = (def.trees || []).some(([ts]) => Math.abs(ts - ss) < 70);
        if (nearTree) continue;
        const off = !inTurn && def.stars.wave ? Math.sin(k * 1.3) * def.stars.wave : 0;
        items.push({ kind: 'star', ...at(ss, off), s: ss });
      }
    }
    (def.bolts || []).forEach((ss) => items.push({ kind: 'bolt', ...at(ss, 0), s: ss }));
    const trees = (def.trees || []).map(([ss, off]) => ({ ...at(ss, off), s: ss }));

    // 끊긴 길: [시작 s, 길이]. 바로 앞 80px이 점프대. 끊긴 구간 점은 gap 표시(길로 안 침)
    const gaps = (def.gaps || []).map(([g0, len]) => ({ s0: g0, s1: g0 + len, ramp0: g0 - 80 }));
    pts.forEach((p) => { p.gap = gaps.some((gp) => p.s > gp.s0 + 1 && p.s < gp.s1 - 1); });
    // 쉿 구간: [시작 s, 길이, 곰 위치(-1 왼쪽 / 1 오른쪽)]
    const quiet = (def.quiet || []).map(([q0, len, side]) => {
      const p = pointAtPts(pts, q0 + len / 2), rv = right(p.h), sd = side || 1;
      const off = BB.ROAD_W / 2 + BB.GRASS_W + 48;
      return { s0: q0, s1: q0 + len, x: p.x + rv.x * off * sd, y: p.y + rv.y * off * sd, side: sd };
    });
    // 끼익 문: 길을 막은 차단기. 문 앞(320px 안)에서 끼익 하면 잠깐 열림
    const doors = (def.doors || []).map((ds) => {
      const p = pointAtPts(pts, ds), rv = right(p.h), hw = BB.ROAD_W / 2 + BB.GRASS_W;
      return { s: ds, h: p.h, x: p.x, y: p.y, x1: p.x - rv.x * hw, y1: p.y - rv.y * hw, x2: p.x + rv.x * hw, y2: p.y + rv.y * hw, open: 0, lift: 0 };
    });
    // 바닥: [시작 s, 길이, 'ice' | 'mud']
    const surf = (def.surf || []).map(([a, len, kind]) => ({ s0: a, s1: a + len, kind }));

    // 갈림길: 본길 s=at 에서 갈라져 나갔다가 본길 다른 곳에 다시 합류하는 두 번째 길
    let branch = null;
    if (def.branch) {
      const A = pointAtPts(pts, def.branch.at);
      const bp = buildPath(def.branch.parts, A.x, A.y, A.h);
      const E = bp.pts[bp.pts.length - 1];
      let best = { d: Infinity, s: 0, h: 0 };
      for (let i = 0; i < pts.length; i++) {
        const d = Math.hypot(pts[i].x - E.x, pts[i].y - E.y);
        if (d < best.d && pts[i].s > def.branch.at + 100) best = { d, s: pts[i].s, h: pts[i].h };
      }
      const sA = def.branch.at, sB = best.s;
      branch = {
        pts: bp.pts, turns: bp.turns, total: bp.total, sA, sB,
        err: { d: best.d, h: Math.abs(((E.h - best.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI) },
        map: (ls) => sA + ((sB - sA) * ls) / bp.total,
      };
      bp.walls.forEach((w) => walls.push(w));
      // 지름길 위 나무 [지름길 안 거리, 옆]
      const bTrees = def.branch.trees || [];
      bTrees.forEach(([ls, off]) => {
        const p = pointAtPts(bp.pts, ls), rv = right(p.h);
        trees.push({ x: p.x + rv.x * off, y: p.y + rv.y * off, s: branch.map(ls), ls, onBranch: true });
      });
      // 지름길 위 별 (보상), 나무 근처는 빼고
      for (let ls = 120; ls < bp.total - 100; ls += 110) {
        if (bTrees.some(([t]) => Math.abs(t - ls) < 60)) continue;
        const p = pointAtPts(bp.pts, ls);
        items.push({ kind: 'star', x: p.x, y: p.y, s: branch.map(ls), onBranch: true });
      }
    }
    // 끊긴 구간/점프대 위 별은 빼기 (공중에서 먹기 애매하니)
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.onBranch && gaps.some((gp) => it.s > gp.ramp0 - 30 && it.s < gp.s1 + 30)) items.splice(i, 1);
    }

    const allPts = branch ? pts.concat(branch.pts) : pts;

    // 꾸밈: 잔디 위 작은 꽃 (장애물 아님)
    const flowers = [];
    let seed = def.id * 9973;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < allPts.length; i += 3) {
      if (rnd() < 0.55) continue;
      const p = allPts[i], rv = right(p.h);
      if (p.gap) continue;
      const side = rnd() < 0.5 ? -1 : 1;
      const off = BB.ROAD_W / 2 + 6 + rnd() * (BB.GRASS_W - 10);
      flowers.push({ x: p.x + rv.x * off * side, y: p.y + rv.y * off * side, c: Math.floor(rnd() * 3) });
    }

    // 꾸밈: 구름 (낭떠러지 아래 하늘)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    const clouds = [];
    const pad = 700;
    const area = (maxX - minX + pad * 2) * (maxY - minY + pad * 2);
    const nc = Math.min(120, Math.floor(area / 160000));
    for (let i = 0; i < nc; i++) {
      clouds.push({ x: minX - pad + rnd() * (maxX - minX + pad * 2), y: minY - pad + rnd() * (maxY - minY + pad * 2), r: 30 + rnd() * 40 });
    }

    return { def, pts, turns, walls, total, startS, finishS, flowers, clouds, items, trees, gaps, quiet, surf, branch, doors, night: !!def.night };
  }

  // 점-선분 거리
  function segProj(ax, ay, bx, by, px, py) {
    const vx = bx - ax, vy = by - ay;
    const L2 = vx * vx + vy * vy || 1;
    let t = ((px - ax) * vx + (py - ay) * vy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + vx * t, qy = ay + vy * t;
    return { t, qx, qy, d: Math.hypot(px - qx, py - qy) };
  }

  function nearestIn(P, x, y, best) {
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (a.gap || b.gap) continue;                 // 끊긴 구간은 길이 아님
      if (Math.abs(a.x - x) > best + 20 && Math.abs(b.x - x) > best + 20) continue;
      const r = segProj(a.x, a.y, b.x, b.y, x, y);
      if (r.d < best) best = r.d;
    }
    return best;
  }
  // 모든 길(본길 + 갈림길)에서 가장 가까운 거리 (땅 종류 판단용)
  function nearestDist(tr, x, y) {
    let best = nearestIn(tr.pts, x, y, Infinity);
    if (tr.branch) best = nearestIn(tr.branch.pts, x, y, best);
    return best;
  }

  // 지금 진행 위치 근처에서만 찾기 (머리핀 커브에서 옆 길로 튀지 않게)
  // P를 주면 그 길(갈림길)에서, 아니면 본길에서
  function localProgress(tr, x, y, iHint, P) {
    P = P || tr.pts;
    iHint = Math.max(0, Math.min(P.length - 2, iHint));
    const i0 = Math.max(0, iHint - 20), i1 = Math.min(P.length - 2, iHint + 30);
    let best = { d: Infinity, i: iHint, s: P[iHint].s };
    for (let i = i0; i <= i1; i++) {
      const a = P[i], b = P[i + 1];
      const r = segProj(a.x, a.y, b.x, b.y, x, y);
      if (r.d < best.d) best = { d: r.d, i, s: a.s + (b.s - a.s) * r.t };
    }
    return best;
  }
  // 한 길 전체에서 가장 가까운 곳 (갈림길로 갈아탔는지 볼 때)
  function fullProgress(P, x, y) {
    let best = { d: Infinity, i: 0, s: 0 };
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (Math.abs(a.x - x) > best.d + 20 && Math.abs(b.x - x) > best.d + 20) continue;
      const r = segProj(a.x, a.y, b.x, b.y, x, y);
      if (r.d < best.d) best = { d: r.d, i, s: a.s + (b.s - a.s) * r.t };
    }
    return best;
  }

  function pointAt(tr, s) { return pointAtPts(tr.pts, s, tr.total); }
  function pointAtPts(P, s, total) {
    if (total == null) total = P[P.length - 1].s;
    s = Math.max(0, Math.min(total, s));
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
    const a = P[lo], b = P[hi];
    const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    let dh = b.h - a.h;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: a.h + dh * t, i: lo };
  }

  BB.Track = { build, nearestDist, localProgress, fullProgress, pointAt, pointAtPts, segProj, fwd, right };
})();
