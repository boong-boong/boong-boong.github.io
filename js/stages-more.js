// 붕붕 — 스테이지 11~30
// 조각 안에서 상대 위치로 요소를 붙여 쓰고, compile()이 출발점부터의 거리(s)로 바꿔 줌.
//   직선 { s: 길이, gap: [시작, 길이], gaps: [[..],[..]], quiet: [시작, 길이, 곰 쪽], surf: [시작, 길이, 종류],
//          trees: [[위치, 옆(+오른쪽)]], bolt: 위치 | [위치..], fork: 'R'|'L' (여기서 U자 갈림길 시작) }
//   커브 { t: 각도, r: 반지름, surf: 'ice'|'mud' (커브 전체), quiet: [..] }
// 난이도: 11~15 중급(요소 2개) → 16~20 상급(3개) → 21~25 고급(연속·얼음 급커브·긴 점프) → 26~30 최고(전부)
(function () {
  const BB = window.BB;

  // U자 갈림길: 본길은 반지름 320 U턴(먼 길), 지름길은 150° 급커브로 가로지름.
  // 갈라지는 곳 앞 직선 300px 이상, U턴 뒤 직선 1300px 이상 필요 (합류 지점 = U턴 끝 + 1232)
  const FORK = (dir) => ({ t: 180 * dir, r: 320 });
  const forkBranch = (dir) => [{ t: 150 * dir, r: 95 }, { s: 842 }, { t: 30 * dir, r: 300 }];

  function compile(id, name, parts, opt) {
    opt = opt || {};
    const def = { id, name, parts: [], stars: opt.stars || { every: 190 }, bolts: [], trees: [], gaps: [], quiet: [], surf: [], doors: [], night: !!opt.night };
    let s = 0;
    parts.forEach((p) => {
      const len = p.s != null ? p.s : (Math.abs(p.t) * Math.PI / 180) * p.r;
      const part = p.s != null ? { s: p.s } : { t: p.t, r: p.r };
      if (p.noWall) part.noWall = true;
      def.parts.push(part);
      if (p.gap) def.gaps.push([s + p.gap[0], p.gap[1]]);
      if (p.gaps) p.gaps.forEach((g) => def.gaps.push([s + g[0], g[1]]));
      if (p.quiet) def.quiet.push([s + p.quiet[0], p.quiet[1], p.quiet[2] || 1]);
      if (p.surf) {
        if (typeof p.surf === 'string') def.surf.push([s, len, p.surf]);
        else if (Array.isArray(p.surf[0])) p.surf.forEach((q) => def.surf.push([s + q[0], q[1], q[2]]));
        else def.surf.push([s + p.surf[0], p.surf[1], p.surf[2]]);
      }
      if (p.trees) p.trees.forEach(([a, off]) => def.trees.push([s + a, off]));
      if (p.doors) p.doors.forEach((a) => def.doors.push(s + a));
      if (p.bolt != null) [].concat(p.bolt).forEach((a) => def.bolts.push(s + a));
      if (p.fork) def.branch = { at: s + p.forkAt, parts: forkBranch(p.fork === 'L' ? -1 : 1), trees: p.forkTrees || [] };
      s += len;
    });
    if (opt.wave) def.stars.wave = opt.wave;
    return def;
  }

  const R = 1, L = -1;
  const more = [
    // ---------- 중급 11~15: 요소 2개씩 ----------
    compile(11, 'S자 끼익', [
      { s: 600 }, { t: 160, r: 95 }, { s: 450 }, { t: -160, r: 95 }, { s: 450 }, { t: 160, r: 95 }, { s: 450 }, { t: -160, r: 95 }, { s: 650, bolt: 250 },
    ]),
    compile(12, '점프 숲', [
      { s: 700, trees: [[300, -48], [550, 48]] }, { t: -40, r: 550 },
      { s: 950, gap: [520, 210] }, { t: 50, r: 550 },
      { s: 1400, trees: [[200, 48]], gap: [650, 230] },
    ], { wave: 30 }),
    compile(13, '얼음 커브', [
      { s: 500 }, { t: 40, r: 800, surf: 'ice' }, { s: 600, surf: [0, 250, 'ice'] }, { t: 165, r: 100 },
      { s: 600, surf: [250, 350, 'ice'] }, { t: -40, r: 800, surf: 'ice' }, { s: 700 },
    ]),
    compile(14, '곰 세 마리', [
      { s: 900, quiet: [550, 340, 1] }, { t: -45, r: 550 },
      { s: 950, quiet: [480, 380, -1] }, { t: 55, r: 550 },
      { s: 1300, quiet: [480, 400, 1] },
    ]),
    compile(15, '진흙 점프', [
      { s: 1300, surf: [150, 250, 'mud'], gap: [850, 200] }, { t: 45, r: 550 },
      { s: 1500, surf: [150, 300, 'mud'], gap: [900, 220] }, { t: -45, r: 550 }, { s: 600 },
    ]),
    // ---------- 상급 16~20: 요소 3개 ----------
    compile(16, '두 갈래 숲', [
      { s: 750, trees: [[150, -45]], fork: 'R', forkAt: 400 }, FORK(R),
      { s: 1800, trees: [[300, 48], [650, -48]], surf: [900, 260, 'mud'] },
    ]),
    compile(17, '얼음 점프', [
      { s: 1300, surf: [300, 450, 'ice'], gap: [850, 220] }, { t: -50, r: 550, surf: 'ice' },
      { s: 1050, gap: [500, 240] }, { t: 160, r: 95 }, { s: 900, surf: [0, 450, 'ice'] },
    ]),
    compile(18, '조용한 머리핀', [
      { s: 950, quiet: [500, 305, 1] }, { t: 160, r: 95 },
      { s: 950, quiet: [500, 305, -1] }, { t: -160, r: 95 },
      { s: 950, quiet: [500, 305, 1] }, { t: 160, r: 95 }, { s: 600 },
    ]),
    compile(19, '번개 점프', [
      { s: 2100, bolt: 600, gap: [1150, 380] }, { t: -45, r: 700 },
      { s: 2100, bolt: 600, gap: [1150, 400] }, { t: 50, r: 700 }, { s: 700 },
    ]),
    compile(20, '중간 보스', [
      { s: 700, surf: [200, 300, 'ice'] }, { t: 160, r: 95 },
      { s: 950, gap: [470, 230] }, { t: -160, r: 95 },
      { s: 1000, quiet: [520, 310, 1] }, { t: 50, r: 550 }, { s: 900, trees: [[300, -48], [600, 48]] },
    ]),
    // ---------- 고급 21~25 ----------
    compile(21, '지그재그', [
      { s: 550 }, { t: 160, r: 95 }, { s: 400 }, { t: -160, r: 95 }, { s: 400 }, { t: 160, r: 95 },
      { s: 400 }, { t: -160, r: 95 }, { s: 400 }, { t: 160, r: 95 }, { s: 400 }, { t: -160, r: 95 }, { s: 650 },
    ]),
    compile(22, '미끄럼틀', [
      { s: 600, surf: [250, 350, 'ice'] }, { t: 160, r: 100, surf: 'ice' },
      { s: 700, surf: 'ice', trees: [[350, 45]] }, { t: -160, r: 100, surf: 'ice' },
      { s: 800, surf: [0, 400, 'ice'] }, { t: 60, r: 520, surf: 'ice' }, { s: 700 },
    ]),
    compile(23, '징검다리', [
      { s: 2900, gaps: [[650, 200], [1250, 230], [1850, 250], [2450, 260]] },
      { t: 40, r: 600 }, { s: 1300, gap: [550, 270] },
    ]),
    compile(24, '숲속 곰', [
      { s: 1050, trees: [[250, -50]], quiet: [600, 370, 1] }, { t: -50, r: 550 },
      { s: 1100, quiet: [500, 380, -1] }, { t: 160, r: 95 },
      { s: 1000, trees: [[700, 50]], quiet: [520, 310, 1] }, { t: -40, r: 550 }, { s: 500 },
    ]),
    compile(25, '진흙 갈림길', [
      { s: 750, fork: 'L', forkAt: 400, forkTrees: [[480, -45], [760, 45]] }, FORK(L),
      { s: 1800, surf: [200, 300, 'mud'], quiet: [850, 265, -1] }, { t: 160, r: 95 },
      { s: 1300, gap: [550, 250] },
    ]),
    // ---------- 최고 26~30 ----------
    compile(26, '얼음 머리핀', [
      { s: 600, surf: [200, 400, 'ice'] }, { t: 165, r: 100, surf: 'ice' },
      { s: 500, surf: 'ice' }, { t: -165, r: 100, surf: 'ice' },
      { s: 500, surf: 'ice' }, { t: 165, r: 100, surf: 'ice' }, { s: 1200, gap: [480, 240] },
    ]),
    compile(27, '큰 점프', [
      { s: 2000, bolt: 700, gap: [1250, 420] }, { t: 160, r: 95 },
      { s: 1200, gap: [650, 300] }, { t: -50, r: 650 },
      { s: 2200, bolt: 600, gap: [1150, 430] }, { t: 40, r: 700 }, { s: 500 },
    ]),
    compile(28, '고요한 숲길', [
      { s: 1350, quiet: [700, 400, 1], trees: [[880, 50]] }, { t: 165, r: 100 },
      { s: 1250, quiet: [650, 350, -1], trees: [[850, -50]] }, { t: -50, r: 550 },
      { s: 1350, surf: [100, 250, 'mud'], gap: [800, 200] },
    ]),
    compile(29, '미로', [
      { s: 750, fork: 'R', forkAt: 400, forkTrees: [[450, 45], [700, -45], [950, 45]] }, FORK(R),
      { s: 1800, surf: [100, 300, 'ice'], quiet: [700, 360, 1], trees: [[1300, -45]] }, { t: -160, r: 95 },
      { s: 1000, gap: [450, 260] }, { t: 160, r: 95 }, { s: 900, trees: [[250, 45], [500, -45]] },
    ]),
    compile(30, '최종 보스', [
      { s: 750, fork: 'L', forkAt: 400, forkTrees: [[450, -48], [680, 48], [910, -48]] }, FORK(L),
      { s: 1800, surf: [150, 280, 'mud'], quiet: [800, 260, -1] }, { t: 165, r: 100, surf: 'ice' },
      { s: 1150, surf: [0, 300, 'ice'], gap: [600, 260] }, { t: -160, r: 95 },
      { s: 2100, bolt: 600, gap: [1150, 400] }, { t: 50, r: 700 },
      { s: 1100, trees: [[250, -48], [500, 48], [750, -48]] },
    ]),
  ];
  // ---------- 보너스 31~33: 새 요소 (밤길 · 끼익 문) ----------
  more.push(
    compile(31, '밤길', [
      { s: 900 }, { t: -50, r: 550 }, { s: 800, trees: [[400, 48]] }, { t: 160, r: 95 },
      { s: 900, trees: [[450, -48]] }, { t: 50, r: 600 }, { s: 800 },
    ], { night: true }),
    compile(32, '끼익 문', [
      { s: 1000, doors: [550] }, { t: 45, r: 600 },
      { s: 1300, doors: [380], gap: [850, 200] }, { t: -160, r: 95 },
      { s: 1000, doors: [500] }, { t: 40, r: 600 }, { s: 900, doors: [350] },
    ]),
    compile(33, '한밤의 곰', [
      { s: 1250, quiet: [650, 330, 1] }, { t: -45, r: 600 },
      { s: 1000, doors: [450] }, { t: 160, r: 95 },
      { s: 1250, quiet: [700, 320, -1] }, { t: 40, r: 600 }, { s: 900, doors: [350] },
    ], { night: true }),
  );
  // ---------- 도전 34~36: 진짜 어려운 맵 / 긴 맵 / 길고 어려운 맵 ----------
  more.push(
    // 34 극한: 짧지만 밤 + 얼음 급커브 연속 + 번개 점프 + 쉿 + 나무 줄
    compile(34, '극한', [
      { s: 550 }, { t: 165, r: 95, surf: 'ice' }, { s: 400, surf: 'ice' }, { t: -165, r: 95, surf: 'ice' },
      { s: 1250, bolt: 220, gap: [700, 330] }, { t: 160, r: 95 },
      { s: 950, quiet: [520, 300, 1] }, { t: -160, r: 95 },
      { s: 400 }, { t: 160, r: 95, surf: 'ice' },
      { s: 1000, trees: [[250, -50], [450, 50], [650, -50]] },
    ], { night: true }),
    // 35 대장정: 아주 긴 맵, 모든 요소가 차례로
    compile(35, '대장정', [
      { s: 900 }, { t: -50, r: 600 }, { s: 900, gap: [450, 220] }, { t: 160, r: 95 },
      { s: 1100, quiet: [550, 310, 1] }, { t: -45, r: 600 },
      { s: 900, surf: [150, 400, 'ice'] }, { t: -160, r: 95 },
      { s: 1000, doors: [500] }, { t: 50, r: 600 },
      { s: 1000, surf: [100, 300, 'mud'], trees: [[650, 48]] }, { t: 160, r: 95 },
      { s: 1500, bolt: 450, gap: [900, 360] }, { t: -40, r: 650 },
      { s: 1100, quiet: [550, 310, -1] }, { t: -160, r: 95 },
      { s: 1000, trees: [[300, -48], [600, 48]] }, { t: 45, r: 600 },
      { s: 900, doors: [450] }, { t: 160, r: 95 }, { s: 900 },
    ], { stars: { every: 220 } }),
    // 36 끝판왕: 길고 어려움 — 갈림길(지름길 나무 4그루) + 얼음 급커브 + 긴 점프 + 문 + 쉿 + 밤 없이 촘촘하게
    compile(36, '끝판왕', [
      { s: 750, fork: 'R', forkAt: 400, forkTrees: [[400, 48], [600, -48], [800, 48], [1000, -48]] }, FORK(R),
      { s: 1800, surf: [100, 300, 'mud'], quiet: [780, 265, 1], trees: [[1300, -50]] }, { t: -165, r: 95, surf: 'ice' },
      { s: 1300, bolt: 220, gap: [700, 330] }, { t: 165, r: 95, surf: 'ice' },
      { s: 400, surf: 'ice' }, { t: -165, r: 95, surf: 'ice' },
      { s: 1000, doors: [550] }, { t: 40, r: 650 },
      { s: 1400, gaps: [[400, 240], [900, 260]] }, { t: 160, r: 95 },
      { s: 950, quiet: [520, 300, -1] }, { t: -160, r: 95 },
      { s: 1250, trees: [[200, 50], [400, -50], [600, 50]], gap: [800, 200] }, { t: 165, r: 95 },
      { s: 900, doors: [500] },
    ]),
  );
  // ---------- 헬 37: 급커브 12연속 ----------
  // 직선 300px 안팎뿐 → 끼익·붕·끼익이 쉴 틈 없이. 얼음 급커브 섞기, 짧은 직선 가운데 나무, 각도 160~170° 들쭉날쭉
  {
    const P = [{ s: 650 }];
    const angles = [165, 170, 160, 170, 165, 160, 170, 165, 170, 160, 170, 165];
    const ice = [2, 4, 5, 8, 9, 11];            // 몇 번째 커브가 얼음인지
    const tree = { 3: -50, 7: 50, 10: -50 };     // 몇 번째 커브 뒤 직선에 나무
    angles.forEach((a, i) => {
      P.push({ t: a * (i % 2 ? -1 : 1), r: 90, surf: ice.includes(i) ? 'ice' : undefined });
      const len = i === angles.length - 1 ? 700 : [290, 310, 280, 330][i % 4];
      P.push(tree[i] != null ? { s: len, trees: [[len / 2, tree[i]]] } : { s: len });
    });
    more.push(compile(37, '헬', P, { stars: { every: 150 } }));
  }
  more.forEach((d) => BB.STAGES.push(d));

  // 난이도 묶음 (시작 화면 표시용)
  BB.tierOf = (id) => id <= 5 ? '입문' : id <= 10 ? '새 요소' : id <= 15 ? '중급' : id <= 20 ? '상급' : id <= 25 ? '고급' : id <= 30 ? '최고' : id <= 33 ? '보너스' : id <= 36 ? '도전' : '헬';
})();
