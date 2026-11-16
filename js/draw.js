// 붕붕 — 2D/3D가 같이 쓰는 그리기 도구
(function () {
  const BB = window.BB;

  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function star(g, x, y, r) {
    g.save(); g.translate(x, y);
    g.fillStyle = '#ffd43b'; g.strokeStyle = '#f59f00'; g.lineWidth = Math.max(1, r * 0.15); g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.48 : r;
      g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(-r * 0.2, -r * 0.2, r * 0.18, 0, 7); g.fill();
    g.restore();
  }

  function bolt(g, x, y, r) {
    g.save(); g.translate(x, y);
    g.fillStyle = '#4dabf7'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(r * 0.15, -r * 0.75); g.lineTo(-r * 0.45, r * 0.1); g.lineTo(-r * 0.02, r * 0.1);
    g.lineTo(-r * 0.2, r * 0.75); g.lineTo(r * 0.45, -r * 0.12); g.lineTo(r * 0.02, -r * 0.12);
    g.closePath(); g.fill();
    g.restore();
  }

  function treeTop(g, x, y) {
    g.fillStyle = 'rgba(40,60,30,.22)'; g.beginPath(); g.arc(x + 5, y + 7, 27, 0, 7); g.fill();
    g.fillStyle = '#3f9a4a'; g.beginPath(); g.arc(x, y, 26, 0, 7); g.fill();
    g.fillStyle = '#56b45c'; g.beginPath(); g.arc(x - 7, y - 7, 14, 0, 7); g.fill();
    g.fillStyle = '#6cc46f'; g.beginPath(); g.arc(x + 8, y + 4, 8, 0, 7); g.fill();
  }

  // 위에서 본 둥근 차. 원점 = 차 중심, 위쪽 = 앞
  function carTop(g, color, steer, turbo) {
    const dark = BB.Render3D ? BB.Render3D.shade(color, -0.2) : color;
    const light = BB.Render3D ? BB.Render3D.shade(color, 0.45) : '#fff';
    g.fillStyle = 'rgba(40,30,60,.22)'; rr(g, -15, -20, 30, 46, 13); g.fill();
    g.fillStyle = '#3a3350';
    const wheel = (x, y, a) => { g.save(); g.translate(x, y); g.rotate(a); rr(g, -4, -7, 8, 14, 4); g.fill(); g.restore(); };
    wheel(-15, -12, steer * 0.45); wheel(15, -12, steer * 0.45); wheel(-15, 13, 0); wheel(15, 13, 0);
    if (turbo) {
      g.fillStyle = '#ffb347';
      g.beginPath(); g.moveTo(-7, 23); g.lineTo(0, 36 + Math.random() * 10); g.lineTo(7, 23); g.fill();
    }
    g.fillStyle = color; rr(g, -15, -24, 30, 48, 14); g.fill();
    g.strokeStyle = dark; g.lineWidth = 2; g.stroke();
    g.fillStyle = light; rr(g, -11, -6, 22, 20, 8); g.fill();
    g.fillStyle = '#bde0fe'; rr(g, -11, -10, 22, 8, 4); g.fill();
    for (const sx of [-7, 7]) {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, -17, 4.5, 0, 7); g.fill();
      g.fillStyle = '#3a3350'; g.beginPath(); g.arc(sx + steer * 1.6, -18, 2.2, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(-9, 19, 3, 0, 7); g.arc(9, 19, 3, 0, 7); g.fill();
  }

  BB.Draw = { rr, star, bolt, treeTop, carTop };
})();
