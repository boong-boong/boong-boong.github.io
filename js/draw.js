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
  // 모자: 위에서 본 모습 (차 지붕 가운데 기준)
  function hatTop(g, hat) {
    if (!hat) return;
    g.save(); g.translate(0, 4);
    if (hat === 'ribbon') {
      g.fillStyle = '#ff6fae';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-10, -6); g.lineTo(-10, 6); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(10, -6); g.lineTo(10, 6); g.closePath(); g.fill();
      g.fillStyle = '#e64980'; g.beginPath(); g.arc(0, 0, 3.5, 0, 7); g.fill();
    } else if (hat === 'shades') {
      g.translate(0, -18);
      g.fillStyle = '#212529'; rr(g, -12, -4, 10, 7, 3); g.fill(); rr(g, 2, -4, 10, 7, 3); g.fill();
      g.fillRect(-2, -2, 4, 2);
    } else if (hat === 'party') {
      g.fillStyle = '#4dabf7'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
      g.strokeStyle = '#ffd43b'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 5.5, 0, 7); g.stroke();
      g.fillStyle = '#ff6b6b'; g.beginPath(); g.arc(0, 0, 3, 0, 7); g.fill();
    } else if (hat === 'crown') {
      g.fillStyle = '#ffd43b'; g.strokeStyle = '#f59f00'; g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5, r = i % 2 ? 6 : 10; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#e03131'; g.beginPath(); g.arc(0, 0, 2.5, 0, 7); g.fill();
    }
    g.restore();
  }
  // 모자: 뒤에서 본 모습 (지붕 위 y = top)
  function hatRear(g, hat, top) {
    if (!hat) return;
    g.save(); g.translate(0, top);
    if (hat === 'ribbon') {
      g.fillStyle = '#ff6fae';
      g.beginPath(); g.moveTo(0, -4); g.lineTo(-13, -12); g.lineTo(-13, 4); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, -4); g.lineTo(13, -12); g.lineTo(13, 4); g.closePath(); g.fill();
      g.fillStyle = '#e64980'; g.beginPath(); g.arc(0, -4, 4, 0, 7); g.fill();
    } else if (hat === 'shades') {
      g.fillStyle = '#212529'; rr(g, -15, -6, 30, 5, 2); g.fill();
    } else if (hat === 'party') {
      g.fillStyle = '#4dabf7'; g.beginPath(); g.moveTo(-10, 0); g.lineTo(0, -26); g.lineTo(10, 0); g.closePath(); g.fill();
      g.strokeStyle = '#ffd43b'; g.lineWidth = 3; g.beginPath(); g.moveTo(-6, -8); g.lineTo(6, -8); g.moveTo(-3, -16); g.lineTo(3, -16); g.stroke();
      g.fillStyle = '#ff6b6b'; g.beginPath(); g.arc(0, -27, 4, 0, 7); g.fill();
    } else if (hat === 'crown') {
      g.fillStyle = '#ffd43b'; g.strokeStyle = '#f59f00'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-13, 0); g.lineTo(-13, -14); g.lineTo(-6, -7); g.lineTo(0, -17); g.lineTo(6, -7); g.lineTo(13, -14); g.lineTo(13, 0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#e03131'; g.beginPath(); g.arc(0, -5, 2.5, 0, 7); g.fill();
    }
    g.restore();
  }

  function carTop(g, color, steer, turbo, hat) {
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
    hatTop(g, hat);
  }

  // 잠자는 곰 (awake면 눈 뜨고 '!'), 원점 = 얼굴 가운데, 위쪽 = 화면 위
  function bear(g, x, y, k, awake, t) {
    g.save(); g.translate(x, y); g.scale(k, k);
    const breathe = awake ? 0 : Math.sin(t * 2) * 1.2;
    g.fillStyle = '#9a6a45';
    g.beginPath(); g.ellipse(0, 18, 30, 16 + breathe, 0, 0, 7); g.fill();               // 몸
    g.beginPath(); g.arc(-15, -16, 8, 0, 7); g.arc(15, -16, 8, 0, 7); g.fill();       // 귀
    g.beginPath(); g.arc(0, 0, 20, 0, 7); g.fill();                                   // 얼굴
    g.fillStyle = '#e8c9a8'; g.beginPath(); g.ellipse(0, 7, 10, 7, 0, 0, 7); g.fill(); // 입 주변
    g.fillStyle = '#3a3350'; g.beginPath(); g.arc(0, 4, 3, 0, 7); g.fill();           // 코
    g.strokeStyle = '#3a3350'; g.lineWidth = 2; g.lineCap = 'round';
    if (awake) {
      g.beginPath(); g.arc(-7, -5, 3, 0, 7); g.arc(7, -5, 3, 0, 7); g.fillStyle = '#3a3350'; g.fill();
      g.fillStyle = '#e8673c'; g.font = 'bold 26px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('!', 0, -38);
    } else {
      g.beginPath(); g.arc(-7, -5, 3.5, 0.2, Math.PI - 0.2); g.stroke();
      g.beginPath(); g.arc(7, -5, 3.5, 0.2, Math.PI - 0.2); g.stroke();
      g.fillStyle = '#7a5cc4'; g.font = '15px Jua, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      const z = (t * 0.8) % 1;
      g.globalAlpha = 1 - z; g.fillText('z', 18 + z * 10, -22 - z * 18);
      g.globalAlpha = 1 - ((z + 0.5) % 1); g.fillText('Z', 22 + ((z + 0.5) % 1) * 10, -26 - ((z + 0.5) % 1) * 18);
      g.globalAlpha = 1;
    }
    g.restore();
  }

  // 점프대: 원점 = 점프대 가운데, 위쪽 = 진행 방향, len = 길이, w = 너비
  function ramp(g, len, w) {
    g.fillStyle = '#f59f00'; rr(g, -w / 2, -len / 2, w, len, 6); g.fill();
    g.fillStyle = '#ffd43b'; rr(g, -w / 2 + 5, -len / 2 + 4, w - 10, len - 8, 4); g.fill();
    g.strokeStyle = '#f08c00'; g.lineWidth = 5; g.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const y = len / 2 - 16 - i * 22;
      g.beginPath(); g.moveTo(-18, y); g.lineTo(0, y - 12); g.lineTo(18, y); g.stroke();
    }
  }

  BB.Draw = { rr, star, bolt, treeTop, carTop, bear, ramp, hatTop, hatRear };
})();
