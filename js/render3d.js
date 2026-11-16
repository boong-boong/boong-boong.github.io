// 붕붕 — 뒤에서 보는 3D 시점 (라이브러리 없이 캔버스 원근 투영)
// 길 중앙선 점들을 따라 잔디·길·점선을 사각형으로 만들어 멀리서부터 그린다(화가 알고리즘).
(function () {
  const BB = window.BB;
  const T = BB.Track;

  const CAM_BACK = 150, CAM_H = 110, NEAR = 6;
  const CAR_K = 0.55;   // 차 그림(54칸 너비)을 실제 차 너비(30px)에 맞춤

  function draw(g, cw, ch, S) {
    const out = { x: cw / 2, y: ch * 0.6, k: 1 };
    const { track, car, camA } = S;
    const W = BB.ROAD_W, G = BB.GRASS_W;
    const F = cw * 0.9;
    const pitch = Math.atan((ch * 0.2) / F);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const hy = ch * 0.54;
    const fx = Math.sin(camA), fy = -Math.cos(camA), rx = Math.cos(camA), ry = Math.sin(camA);
    const camX = car.x - fx * CAM_BACK, camY = car.y - fy * CAM_BACK;

    // 월드 → 카메라 공간
    function cam(wx, wy, wz) {
      const dx = wx - camX, dy = wy - camY;
      const z0 = dx * fx + dy * fy, x0 = dx * rx + dy * ry, y0 = wz - CAM_H;
      return [x0, y0 * cp + z0 * sp, z0 * cp - y0 * sp];
    }
    const scr = (c) => [cw / 2 + (c[0] * F) / c[2], hy - (c[1] * F) / c[2]];

    // 가까운 면(NEAR)으로 다각형 자르기
    function clip(poly) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ina = a[2] >= NEAR, inb = b[2] >= NEAR;
        if (ina) out.push(a);
        if (ina !== inb) {
          const t = (NEAR - a[2]) / (b[2] - a[2]);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]);
        }
      }
      return out;
    }

    const list = [];
    // 화면 밖·너무 먼 조각은 아예 안 그림 (느린 폰 대비)
    function quad(ws, fill, bias) {
      const cs = ws.map((p) => cam(p[0], p[1], p[2] || 0));
      if (cs.every((q) => q[2] < NEAR) || cs.every((q) => q[2] > 2200)) return;
      const c = clip(cs);
      if (c.length < 3) return;
      const pts = c.map(scr);
      if (pts.every((q) => q[0] < -10) || pts.every((q) => q[0] > cw + 10) || pts.every((q) => q[1] > ch + 10) || pts.every((q) => q[1] < -10)) return;
      let z = 0; c.forEach((p) => (z += p[2])); z /= c.length;
      list.push({ z: z + (bias || 0), fill, pts });
    }
    function sprite(wx, wy, wz, fn, bias) {
      const c = cam(wx, wy, wz);
      if (c[2] < NEAR + 4) return;
      const p = scr(c);
      list.push({ z: c[2] + (bias || 0), sprite: fn, x: p[0], y: p[1], k: F / c[2] });
    }

    // 길 조각
    const P = track.pts;
    const mainI = S.mainI != null ? S.mainI : car.segI;
    const i0 = Math.max(0, mainI - 16), i1 = Math.min(P.length - 1, mainI + 210);
    const surfOf = (ss) => { for (const q of track.surf) if (ss >= q.s0 && ss <= q.s1) return q.kind; return null; };
    const quietOf = (ss) => track.quiet.some((q) => ss >= q.s0 && ss <= q.s1);
    // 가까운 곳은 촘촘히(2칸), 멀수록 듬성듬성(4·8칸). 이음새는 다음 조각과 2px 겹쳐 메움
    function strip(PP, a0, a1, isMain, near) {
      let i = a0;
      while (i < a1) {
        const far = Math.abs(i - near);
        const step = far < 50 ? 2 : far < 120 ? 4 : 8;
        const a = PP[i], bi = Math.min(a1, i + step), b0 = PP[bi];
        i = bi;
        if (a.gap || b0.gap) continue;
        const fb = T.fwd(b0.h), b = { x: b0.x + fb.x * 2, y: b0.y + fb.y * 2, h: b0.h };
        const ra = T.right(a.h), rb = T.right(b.h);
        const edge = (p, r, o, z) => [p.x + r.x * o, p.y + r.y * o, z || 0];
        const band = Math.floor(a.s / 48) % 2;
        if (far < 90) for (const sd of [-1, 1]) {
          const o = sd * (W / 2 + G);
          quad([edge(a, ra, o, 0), edge(b, rb, o, 0), edge(b, rb, o, -40), edge(a, ra, o, -40)], '#5d9a4a', 3);
        }
        quad([edge(a, ra, -(W / 2 + G)), edge(b, rb, -(W / 2 + G)), edge(b, rb, W / 2 + G), edge(a, ra, W / 2 + G)], band ? '#8fd16f' : '#84c764', 2);
        quad([edge(a, ra, -(W / 2 + 5)), edge(b, rb, -(W / 2 + 5)), edge(b, rb, W / 2 + 5), edge(a, ra, W / 2 + 5)], '#ffffff', 1);
        const sf = isMain ? surfOf(a.s) : null;
        let col = band ? '#bab4c7' : '#b3adc1';
        if (sf === 'ice') col = band ? '#d6f0ff' : '#c8eaff';
        else if (sf === 'mud') col = band ? '#9c7650' : '#8f6b47';
        else if (isMain && quietOf(a.s)) col = band ? '#c5b3e0' : '#bba8d8';
        quad([edge(a, ra, -W / 2), edge(b, rb, -W / 2), edge(b, rb, W / 2), edge(a, ra, W / 2)], col, 0);
        if (!sf && far < 120 && Math.floor(a.s / 25) % 2 === 0) quad([edge(a, ra, -3), edge(b, rb, -3), edge(b, rb, 3), edge(a, ra, 3)], 'rgba(255,255,255,.8)', -1);
      }
    }
    strip(P, i0, i1, true, mainI);
    const B = track.branch;
    if (B && car.s > B.sA - 1600 && car.s < B.sB + 400) strip(B.pts, 0, B.pts.length - 1, false, car.pi ? car.segI : 0);

    // 점프대: 앞쪽이 올라간 경사면
    for (const gp of track.gaps) {
      if (gp.s0 < P[i0].s || gp.ramp0 > P[i1].s) continue;
      const a = T.pointAt(track, gp.ramp0), b = T.pointAt(track, gp.s0);
      const ra = T.right(a.h), rb = T.right(b.h), hw = W / 2 - 12;
      quad([[a.x - ra.x * hw, a.y - ra.y * hw, 1], [b.x - rb.x * hw, b.y - rb.y * hw, 20], [b.x + rb.x * hw, b.y + rb.y * hw, 20], [a.x + ra.x * hw, a.y + ra.y * hw, 1]], '#ffd43b', -2);
      quad([[b.x - rb.x * hw, b.y - rb.y * hw, 0], [b.x + rb.x * hw, b.y + rb.y * hw, 0], [b.x + rb.x * hw, b.y + rb.y * hw, 20], [b.x - rb.x * hw, b.y - rb.y * hw, 20]], '#f59f00', -2.5);
    }

    // 출발/도착선
    for (const [ss, rows] of [[track.startS, 2], [track.finishS, 3]]) {
      if (ss < P[i0].s - 20 || ss > P[i1].s) continue;
      const p = T.pointAt(track, ss), r = T.right(p.h), f = T.fwd(p.h);
      const sq = 15, n = Math.ceil(W / sq);
      for (let row = 0; row < rows; row++) for (let k = 0; k < n; k++) {
        if ((k + row) % 2 === 0) continue;
        const o0 = -W / 2 + k * sq, o1 = o0 + sq, d0 = row * sq, d1 = d0 + sq;
        const pt = (o, d) => [p.x + r.x * o + f.x * d, p.y + r.y * o + f.y * d, 0];
        quad([pt(o0, d0), pt(o1, d0), pt(o1, d1), pt(o0, d1)], '#3a3350', -2);
      }
    }

    // 벽: 40px 토막으로 나눠 세움
    for (const w of track.walls) {
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), n = Math.max(1, Math.ceil(L / 40));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const ax = w.x1 + (w.x2 - w.x1) * t0, ay = w.y1 + (w.y2 - w.y1) * t0;
        const bx = w.x1 + (w.x2 - w.x1) * t1, by = w.y1 + (w.y2 - w.y1) * t1;
        quad([[ax, ay, 0], [bx, by, 0], [bx, by, 22], [ax, ay, 22]], k % 2 ? '#ffffff' : '#e55858', -3);
      }
    }

    // 끼익 문: 기둥 2개 + 차단봉 (열리면 위로 들림)
    for (const d of track.doors) {
      const r = T.right(d.h), hw = W / 2 + G;
      const lx = d.x - r.x * hw, ly = d.y - r.y * hw, rx2 = d.x + r.x * hw, ry2 = d.y + r.y * hw;
      for (const [px, py] of [[lx, ly], [rx2, ry2]]) {
        quad([[px - r.x * 5, py - r.y * 5, 0], [px + r.x * 5, py + r.y * 5, 0], [px + r.x * 5, py + r.y * 5, 34], [px - r.x * 5, py - r.y * 5, 34]], '#6b6178', -3);
      }
      const L = hw * 2 * (1 - 0.85 * d.lift), up = d.lift * 40;
      const n = 6;
      for (let k = 0; k < n; k++) {
        const a0 = (L * k) / n, a1 = (L * (k + 1)) / n;
        const z0 = 22 + up * (a0 / Math.max(1, L)), z1 = 22 + up * (a1 / Math.max(1, L));
        quad([[lx + r.x * a0, ly + r.y * a0, z0 - 5], [lx + r.x * a1, ly + r.y * a1, z1 - 5], [lx + r.x * a1, ly + r.y * a1, z1 + 5], [lx + r.x * a0, ly + r.y * a0, z0 + 5]], k % 2 ? '#ffffff' : '#e55858', -3.5);
      }
    }
    // 곰 (작은 섬 위)
    const now = performance.now() / 1000;
    for (const q of track.quiet) {
      sprite(q.x, q.y, 0, (g2, x, y, k) => {
        g2.fillStyle = '#6aa84f'; g2.beginPath(); g2.ellipse(x, y, 52 * k, 16 * k, 0, 0, 7); g2.fill();
        BB.Draw.bear(g2, x, y - 26 * k, k * 0.9, q.awake > 0, now);
      }, -4);
    }
    // 나무, 아이템
    for (const t of track.trees) sprite(t.x, t.y, 0, (g2, x, y, k) => drawTree(g2, x, y, k), -4);
    const bob = Math.sin(performance.now() / 250) * 4;
    for (const it of track.items) {
      if (it.taken) continue;
      sprite(it.x, it.y, 16 + bob, (g2, x, y, k) => (it.kind === 'star' ? BB.Draw.star(g2, x, y, 13 * k) : BB.Draw.bolt(g2, x, y, 14 * k)), -4);
    }
    // 연기
    for (const p of S.particles) {
      const a = p.life / p.max;
      sprite(p.x, p.y, 8, (g2, x, y, k) => { g2.globalAlpha = a * 0.7; g2.fillStyle = p.color; g2.beginPath(); g2.arc(x, y, p.r * k * 0.6 * (1.6 - a * 0.6), 0, 7); g2.fill(); g2.globalAlpha = 1; }, -4);
    }
    // 친구 차
    for (const pe of S.peers) {
      sprite(pe.x, pe.y, 0, (g2, x, y, k) => {
        drawCarRear(g2, x, y, k * CAR_K, pe.c, wrap(pe.h - camA), 0, pe.alpha || 0.85, false, pe.hat);
        if (pe.label) label(g2, x, y - 64 * k * CAR_K, pe.label, k);
        if (pe.horn > 0) label(g2, x, y - 90 * k * CAR_K, '빵!', k, '#e8673c');
      }, -5);
    }
    // 내 차
    if (car.fallT < 0 || car.fallT < 0.75) {
      const drop = car.fallT >= 0 ? car.fallT * car.fallT * 160 : 0;
      sprite(car.x, car.y, (car.z || 0) - drop, (g2, x, y, k) => {
        out.x = x; out.y = y; out.k = k;
        const blinkA = car.blink > 0 && Math.floor(car.blink * 10) % 2 === 0 ? 0.35 : 1;
        drawCarRear(g2, x, y, k * CAR_K, S.color, wrap(car.h - camA), car.steer, blinkA, car.turbo > 0, S.hat);
        if (S.myHorn > 0) label(g2, x, y - 90 * k * CAR_K, '빵!', k, '#e8673c');
      }, -6);
    }

    // 하늘
    const horizon = hy - F * Math.tan(pitch);
    const sky = g.createLinearGradient(0, 0, 0, ch);
    if (track.night) { sky.addColorStop(0, '#0b1030'); sky.addColorStop(Math.max(0.01, Math.min(0.99, horizon / ch)), '#2b2f63'); sky.addColorStop(1, '#151a40'); }
    else { sky.addColorStop(0, '#8fd0f7'); sky.addColorStop(Math.max(0.01, Math.min(0.99, horizon / ch)), '#dff3ff'); sky.addColorStop(1, '#bfe6ff'); }
    g.fillStyle = sky; g.fillRect(0, 0, cw, ch);
    // 먼 구름: 카메라 방향 따라 옆으로 흐름
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 6; i++) {
      const ang = i * 1.05;
      let d = wrap(ang - camA);
      const x = cw / 2 + d * cw * 0.9;
      if (x < -120 || x > cw + 120) continue;
      const y = horizon - 30 - (i % 3) * 22, r = 22 + (i % 2) * 10;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.arc(x + r, y + 6, r * 0.7, 0, 7); g.arc(x - r, y + 8, r * 0.6, 0, 7); g.fill();
    }

    list.sort((a, b) => b.z - a.z);
    for (const it of list) {
      if (it.sprite) { it.sprite(g, it.x, it.y, it.k); continue; }
      g.fillStyle = it.fill;
      g.beginPath();
      g.moveTo(it.pts[0][0], it.pts[0][1]);
      for (let i = 1; i < it.pts.length; i++) g.lineTo(it.pts[i][0], it.pts[i][1]);
      g.closePath(); g.fill();
    }
    return out;
  }

  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  function label(g, x, y, text, k, color) {
    const fs = Math.max(11, Math.min(18, 9 * k));
    g.font = fs + 'px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(text).width + 12;
    g.fillStyle = 'rgba(255,255,255,.9)';
    BB.Draw.rr(g, x - w / 2, y - fs * 0.75, w, fs * 1.5, fs * 0.6); g.fill();
    g.fillStyle = color || '#3a3350'; g.fillText(text, x, y);
  }

  function drawTree(g, x, y, k) {
    g.fillStyle = 'rgba(40,60,30,.25)';
    g.beginPath(); g.ellipse(x, y, 26 * k, 8 * k, 0, 0, 7); g.fill();
    g.fillStyle = '#8a5a3b'; g.fillRect(x - 5 * k, y - 34 * k, 10 * k, 34 * k);
    g.fillStyle = '#3f9a4a'; g.beginPath(); g.arc(x, y - 52 * k, 28 * k, 0, 7); g.fill();
    g.fillStyle = '#56b45c'; g.beginPath(); g.arc(x - 8 * k, y - 60 * k, 15 * k, 0, 7); g.fill();
  }

  // 뒤에서 본 둥근 차
  function drawCarRear(g, x, y, k, color, yaw, steer, alpha, turbo, hat) {
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(x, y);
    g.scale(k, k);
    const side = Math.max(-1, Math.min(1, yaw * 1.5)); // 옆모습이 보이는 정도
    g.rotate(steer * 0.06 + side * 0.08);
    g.fillStyle = 'rgba(40,30,60,.25)';
    g.beginPath(); g.ellipse(0, 0, 30, 7, 0, 0, 7); g.fill();
    // 바퀴
    g.fillStyle = '#3a3350';
    BB.Draw.rr(g, -29, -14, 11, 15, 4); g.fill();
    BB.Draw.rr(g, 18, -14, 11, 15, 4); g.fill();
    // 몸통 (옆으로 틀어진 만큼 옆면)
    const dark = shade(color, -0.22);
    g.fillStyle = dark; BB.Draw.rr(g, -27 + side * 6, -34, 54, 26, 12); g.fill();
    g.fillStyle = color; BB.Draw.rr(g, -27 - side * 4, -36, 54, 28, 13); g.fill();
    // 지붕/뒷유리
    g.fillStyle = shade(color, 0.35); BB.Draw.rr(g, -17 - side * 7, -52, 34, 20, 9); g.fill();
    g.fillStyle = '#bde0fe'; BB.Draw.rr(g, -13 - side * 7, -49, 26, 11, 5); g.fill();
    // 후미등
    g.fillStyle = '#ffe066';
    g.beginPath(); g.arc(-18 - side * 4, -22, 4, 0, 7); g.arc(18 - side * 4, -22, 4, 0, 7); g.fill();
    // 번호판 자리 웃는 입
    g.strokeStyle = 'rgba(58,51,80,.6)'; g.lineWidth = 2;
    g.beginPath(); g.arc(-side * 4, -20, 5, 0.2, Math.PI - 0.2); g.stroke();
    if (turbo) {
      g.fillStyle = '#ffb347';
      g.beginPath(); g.moveTo(-8, -8); g.lineTo(0, 10 + Math.random() * 8); g.lineTo(8, -8); g.fill();
    }
    if (hat) { g.save(); g.translate(-side * 7, 0); BB.Draw.hatRear(g, hat, -52); g.restore(); }
    g.restore();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
    return '#' + ((1 << 24) + (f(r) << 16) + (f(gg) << 8) + f(b)).toString(16).slice(1);
  }

  BB.Render3D = { draw, shade };
})();
