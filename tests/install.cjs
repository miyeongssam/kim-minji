// 설치 안내 확인: 휴대폰·브라우저 종류마다 배너 글자와 누르면 나오는 안내가 맞는지.
// 사용법: python3 -m http.server 8765 &  →  node tests/install.cjs [스크린샷 폴더]
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium, devices } = pw;
const OUT = process.argv[2] || require('os').tmpdir();
const AND = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko)';
const CASES = [
  { name: '안드로이드 크롬', ua: `${AND} Chrome/129.0.0.0 Mobile Safari/537.36`, bar: '홈 화면에 앱으로 설치', modal: '안드로이드에서 앱으로 설치하기', btn: null },
  { name: '아이폰 사파리', device: 'iPhone 13', bar: '홈 화면에 앱으로 설치', modal: '아이폰에서 앱으로 설치하기', btn: null },
  { name: '안드로이드 카톡', ua: `${AND} Chrome/129.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.8.0`, bar: '크롬에서 열어야', modal: '카카오톡', btn: '크롬으로 열기' },
  { name: '아이폰 카톡', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0', bar: '사파리에서 열어야', modal: '카카오톡', btn: '사파리로 열기' },
  { name: '안드로이드 슬랙', ua: `${AND} Chrome/129.0.0.0 Mobile Safari/537.36 Slack/24.10`, bar: '크롬에서 열어야', modal: '슬랙', btn: '크롬으로 열기' },
  { name: '삼성 인터넷', ua: `${AND} SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36`, bar: '크롬에서 열어야', modal: '삼성 인터넷', btn: '크롬으로 열기' },
  { name: '아이폰 크롬', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1', bar: '사파리에서 열어야', modal: '다른 브라우저', btn: null },
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
    await p.goto('http://localhost:8765/');
    await p.waitForSelector('.lock');
    const barText = await p.locator('#installBar .ib-go').innerText().catch(() => null);
    const gate = await p.locator('[data-action=skip-install]').count();
    let ok = c.bar ? (barText || '').includes(c.bar) && gate === 1 : barText === null && gate === 0;
    let modalText = '';
    let btnOk = true;
    if (c.bar) {
      await p.click('#installBar [data-ib=go]');
      await p.waitForSelector('.modal');
      modalText = await p.locator('.modal').innerText();
      ok = ok && modalText.includes(c.modal);
      if (c.btn) btnOk = (await p.locator(`.modal button:has-text("${c.btn}")`).count()) === 1;
      if (modalText.includes('주소 복사')) {
        await p.click('.modal [data-copy-url]');
        const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        btnOk = btnOk && clip === 'http://localhost:8765/';
      }
      await p.screenshot({ path: `${OUT}/install-${c.name.replace(/\s/g, '_')}.png` });
      // ✕ 는 이번에만 닫기 → 다시 열면 또 나온다
      await p.click('.modal [data-m=cancel]');
      await p.click('#installBar [data-ib=close]');
      const closed = await p.locator('#installBar').count();
      await p.reload(); await p.waitForSelector('.lock');
      const again = await p.locator('#installBar').count();
      ok = ok && closed === 0 && again === 1;
    }
    ok = ok && btnOk && !errors.length;
    if (!ok) fail++;
    console.log(`${ok ? 'OK ' : 'NG '} ${c.name.padEnd(10)} | 배너: ${barText || '없음'} | 먼저 설치 안내: ${gate ? '있음' : '없음'}${c.btn ? ` | 버튼 「${c.btn}」 ${btnOk ? '있음' : '없음'}` : ''}${errors.length ? ' | 오류: ' + errors.join('; ') : ''}`);
    await ctx.close();
  }
  await b.close();
  if (fail) { console.error(`실패 ${fail}건`); process.exit(1); }
  console.log('설치 안내 모두 통과');
})();
