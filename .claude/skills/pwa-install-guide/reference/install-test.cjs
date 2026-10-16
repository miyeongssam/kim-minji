// 설치 안내 8종 자동 테스트 (Playwright). 휴대폰 없이 안드로이드·아이폰·카톡·슬랙 등을 흉내 낸다.
// 사용법: 정적 서버를 켜고  node install-test.cjs <페이지 주소>
//   예) python3 -m http.server 8799 --directory .claude/skills/pwa-install-guide/reference
//       node .claude/skills/pwa-install-guide/reference/install-test.cjs http://localhost:8799/demo.html
// 앱에 직접 넣었다면 BAR·GO·X·MODAL·CLOSE 선택자를 그 앱 것으로 바꾼다.
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium, devices } = pw;
const URL = process.argv[2] || 'http://localhost:8799/demo.html';
const S = { BAR: '#igBar', GO: '#igBar [data-ig=go]', X: '#igBar [data-ig=x]', MODAL: '.ig-modal', CLOSE: '.ig-modal [data-ig=close]', COPY: '.ig-modal [data-copy]' };
const AND = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko)';
const CASES = [
  { name: '안드로이드 크롬', ua: `${AND} Chrome/129.0.0.0 Mobile Safari/537.36`, bar: '홈 화면에 앱으로 설치', modal: '안드로이드에서 앱으로 설치하기' },
  { name: '아이폰 사파리', device: 'iPhone 13', bar: '홈 화면에 앱으로 설치', modal: '아이폰에서 앱으로 설치하기' },
  { name: '안드로이드 카톡', ua: `${AND} Chrome/129.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.8.0`, bar: '크롬에서 열어야', modal: '카카오톡', btn: '크롬으로 열기' },
  { name: '아이폰 카톡', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0', bar: '사파리에서 열어야', modal: '카카오톡', btn: '사파리로 열기' },
  { name: '안드로이드 슬랙', ua: `${AND} Chrome/129.0.0.0 Mobile Safari/537.36 Slack/24.10`, bar: '크롬에서 열어야', modal: '슬랙', btn: '크롬으로 열기' },
  { name: '삼성 인터넷', ua: `${AND} SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36`, bar: '크롬에서 열어야', modal: '삼성 인터넷', btn: '크롬으로 열기' },
  { name: '아이폰 크롬', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1', bar: '사파리에서 열어야', modal: '다른 브라우저' },
  { name: '컴퓨터', ua: null, bar: null }
];
(async () => {
  const b = await chromium.launch();
  let fail = 0;
  for (const c of CASES) {
    const opt = c.device ? { ...devices[c.device] } : (c.ua ? { userAgent: c.ua, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 800 } });
    const ctx = await b.newContext({ ...opt, locale: 'ko-KR', permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL); await p.waitForTimeout(200);
    const barText = await p.locator(S.GO).innerText().catch(() => null);
    let ok = c.bar ? (barText || '').includes(c.bar) : barText === null;
    if (c.bar) {
      await p.click(S.GO); await p.waitForSelector(S.MODAL);
      ok = ok && (await p.locator(S.MODAL).innerText()).includes(c.modal);
      if (c.btn) ok = ok && (await p.locator(`${S.MODAL} button:has-text("${c.btn}")`).count()) === 1;
      if (await p.locator(S.COPY).count()) { await p.click(S.COPY); ok = ok && (await p.evaluate(() => navigator.clipboard.readText())) === URL.split('?')[0].replace(/#.*$/, ''); }
      await p.click(S.CLOSE); await p.click(S.X);
      const closed = await p.locator(S.BAR).count();
      await p.reload(); await p.waitForTimeout(200);
      ok = ok && closed === 0 && (await p.locator(S.BAR).count()) === 1;
    }
    if (c.name === '안드로이드 크롬') { // 크롬이 설치 신호를 주면 안내 창 대신 크롬 설치 창
      await p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__p = true; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
      await p.click(S.GO); await p.waitForTimeout(150);
      ok = ok && (await p.evaluate(() => window.__p === true));
      await p.evaluate(() => window.dispatchEvent(new Event('appinstalled'))); await p.waitForTimeout(100);
      ok = ok && (await p.locator(S.BAR).count()) === 0;
    }
    ok = ok && !errors.length;
    if (!ok) fail++;
    console.log(`${ok ? 'OK ' : 'NG '} ${c.name.padEnd(10)} | 배너: ${barText || '없음'}${errors.length ? ' | 오류: ' + errors.join('; ') : ''}`);
    await ctx.close();
  }
  await b.close();
  if (fail) { console.error(`실패 ${fail}건`); process.exit(1); }
  console.log('설치 안내 8종 모두 통과');
})();
