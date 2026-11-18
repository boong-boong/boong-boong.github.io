const { chromium } = require('playwright');
// 화면 글 검사: 320·375·412px 폭에서 넘침, 외톨이 줄(1~2글자), 「·」로 시작하는 줄을 찾음
// 사용법: (저장소에서) python3 -m http.server 8768 & 띄운 뒤  node tools/textcheck.js [스크린샷폴더]
const S = process.argv[2];
const TITLE = ['방장이 출발해요!\n「시작」을 눌러 줘','설치했어요!\n홈 화면의 붕붕 아이콘으로 열어 봐','링크를 복사했어요!\n친구에게 붙여 넣어 보내 줘','입으로 하는 게임이라\n마이크가 있어야 해요\n\n주소창 왼쪽 자물쇠 → 권한\n→ 마이크 허용 후 다시 「시작」','입으로 하는 게임이라\n마이크가 있어야 해요\n\n설정 → Safari(또는 붕붕 앱)\n→ 마이크 → 허용 후 다시 「시작」','마이크를 쓸 수 없는 주소예요\nboong-boong.github.io 로 열어 주세요','방 ABCD에 들어왔어요!\n「시작」을 눌러 줘'];
const BUB = ['방장을 기다려요','이어폰을 찾았어요\n잘 안 되면 「엔진 조정」','마이크가 바뀌었어요\n잘 안 되면 「엔진 조정」','지난번 엔진 조정 그대로\n바꾸려면 「엔진 조정」','소리가 잘 안 들렸어요\n「엔진 조정」을 다시 해도 돼요','밤이에요!\n소리 내면 깜깜해져','더 빨리 들어와서 굴러가 봐','앗, 깼다! 조용히 다시','지름길: ▶ 꺾고 끼익!','끼었네! 다시 해 보자','더 크게 붕!!'];
(async () => {
  const b = await chromium.launch();
  const issues = [];
  for (const w of [320, 375, 412]) {
    const p = await b.newPage({ viewport: { width: w, height: 680 } });
    await p.goto('http://localhost:8768/'); await p.waitForTimeout(700);
    const check = async (label) => {
      const r = await p.evaluate(() => {
        const out = [];
        document.querySelectorAll('.msg, #bubble, .calibText, .tip, .sheetCard p, .installSteps p, .roomInfo').forEach((e) => {
          if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return;
          const r = e.getBoundingClientRect(); if (!r.width) return;
          if (r.left < 0 || r.right > innerWidth + 0.5) out.push('넘침 ' + (e.id || e.className) + ' ' + e.textContent.slice(0, 20));
          // 마지막 줄 길이 검사: 글자별 위치로 줄 나눔
          const rg = document.createRange(); const lines = {};
          const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
          let n; while ((n = walk.nextNode())) for (let i = 0; i < n.length; i++) { rg.setStart(n, i); rg.setEnd(n, i + 1); const rr = rg.getBoundingClientRect(); if (!rr.width) continue; const k = Math.round(rr.top / 6); (lines[k] = lines[k] || []).push(n.data[i]); }
          const ls = Object.keys(lines).sort((a, b) => a - b).map((k) => lines[k].join('').trim()).filter(Boolean);
          ls.forEach((l, j) => { if (j > 0 && l.startsWith('·')) out.push('「·」로 시작하는 줄 in ' + ls.join(' / ')); if (ls.length > 1 && l.replace(/\s/g, '').length <= 2) out.push('외톨이 줄 「' + l + '」 in ' + ls.join(' / ')); });
        });
        return out;
      });
      r.forEach((x) => issues.push(w + ' ' + label + ': ' + x));
    };
    for (let i = 0; i < TITLE.length; i++) {
      await p.evaluate((t) => { document.getElementById('titleMsg').textContent = t; }, TITLE[i]);
      await check('title' + i); if (S && w === 320) await p.screenshot({ path: `${S}/txt/t${i}.png` });
    }
    await p.evaluate(() => { document.getElementById('titleMsg').textContent = ''; });
    for (const id of ['help', 'installSheet', 'roomSheet']) {
      await p.evaluate((id) => { document.querySelectorAll('.sheet').forEach((s) => s.classList.add('hidden')); const s = document.getElementById(id); s.classList.remove('hidden'); s.querySelectorAll('.installSteps').forEach((x) => x.classList.remove('hidden')); if (id === 'roomSheet') document.getElementById('roomMsg').textContent = '내가 방장이에요 👑\n친구에게 링크를 보내 줘'; }, id);
      await p.waitForTimeout(150); await check(id); if (S && w === 320) await p.screenshot({ path: `${S}/txt/${id}.png` });
    }
    await p.evaluate(() => document.querySelectorAll('.sheet').forEach((s) => s.classList.add('hidden')));
    await p.evaluate(() => BBdebug.startPlay('buttons')); await p.waitForTimeout(300);
    for (let i = 0; i < BUB.length; i++) {
      await p.evaluate((t) => { const e = document.getElementById('bubble'); e.classList.remove('hidden'); e.textContent = t; }, BUB[i]);
      await p.waitForTimeout(100); await check('bubble' + i); if (S && w === 320) await p.screenshot({ path: `${S}/txt/b${i}.png`, clip: { x: 0, y: 100, width: 320, height: 220 } });
    }
    await p.close();
  }
  console.log(issues.length ? issues.join('\n') : '문제 없음');
  await b.close();
})();
