// 인계장 앱 전체 흐름 확인(휴대폰 화면). 사용법:
//   python3 -m http.server 8765   (저장소 폴더에서)
//   node tests/e2e.cjs [스크린샷 폴더]
// 가짜 기록만 쓴다. 실제 환자 정보를 넣지 않는다.
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium, devices } = pw;
const OUT = process.argv[2] || require('os').tmpdir();
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ko-KR', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
  await page.goto('http://localhost:8765/');
  await page.fill('#pin1', '1234'); await page.fill('#pin2', '1234'); await shot('01-setup');
  await page.click('button[type=submit]');
  await page.waitForSelector('.fab'); await shot('02-day-empty');
  await page.click('.fab');
  await page.fill('#fWard', '71병동'); await page.fill('#fBed', '701-3');
  await page.fill('#fTitle', 'POD#2, NPO');
  await page.click('[data-tag="ABGA"]');
  await page.fill('#fBody', '06시 ABGA f/u\nO2 3L NC 유지');
  await page.click('[data-action=add-todo]'); await page.fill('#todoList .todo-row:last-child .todo-text', 'ABGA 결과 확인');
  await page.click('[data-action=add-todo]'); await page.fill('#todoList .todo-row:last-child .todo-text', 'dressing');
  await page.check('#fImportant');
  await shot('03-edit');
  await page.click('.save-bar .btn.primary');
  await page.waitForSelector('.detail'); await shot('04-entry');
  // 등록번호 경고
  await page.click('a[href^="#/edit/"]');
  await page.fill('#fBody', '06시 ABGA f/u 12345678');
  await page.click('.save-bar .btn.primary');
  await page.waitForSelector('.modal'); await shot('05-id-warning');
  await page.click('.modal [data-m=cancel]');
  await page.fill('#fBody', '06시 ABGA f/u\nO2 3L NC 유지');
  await page.click('.save-bar .btn.primary'); await page.waitForSelector('.detail');
  // 글로 복사 (PIN 재확인)
  await page.click('[data-action=copy-entry]');
  await page.fill('.modal .pin-input', '9999'); await page.click('.modal [type=submit]');
  await page.waitForSelector('.modal .err:has-text("맞지 않아요")');
  await page.fill('.modal .pin-input', '1234'); await page.click('.modal [type=submit]');
  await page.waitForSelector('.copy-area'); await shot('06-copy');
  await page.click('[data-copy]'); await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  console.log('CLIP:\n' + clip);
  // 날짜별
  await page.click('.tabs a[href^="#/day"]'); await page.waitForSelector('.card'); await shot('07-day');
  // 다음날 이어받기
  await page.click('[aria-label=다음날]'); await page.waitForSelector('[data-action=carry]'); await page.click('[data-action=carry]');
  await page.click('.modal [data-ok]'); await page.waitForSelector('.card');
  console.log('carry cards:', await page.locator('.card').count());
  // 검색
  await page.click('.tabs a[href="#/search"]'); await page.fill('#q', 'abga 701'); await page.waitForTimeout(200); await shot('08-search');
  console.log('search results:', await page.locator('#results .card').count());
  // 백업
  await page.click('.tabs a[href="#/settings"]'); await page.waitForSelector('#exportForm');
  await page.fill('#expPw', '123'); await page.click('#exportForm [type=submit]'); await page.waitForTimeout(200);
  console.log('short pw toast:', await page.textContent('#toast'));
  await page.fill('#expPw', 'backup-pw'); await page.fill('#expPw2', 'backup-pw'); await page.click('#exportForm [type=submit]');
  await page.waitForSelector('#exportReady:not([hidden])'); await shot('09-settings-export');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action=export-save]')]);
  const bpath = `${OUT}/backup.json`; await dl.saveAs(bpath);
  console.log('download name:', dl.suggestedFilename());
  const raw = require('fs').readFileSync(bpath, 'utf8');
  console.log('backup has plaintext ABGA?', raw.includes('ABGA'), 'keys:', Object.keys(JSON.parse(raw)).join(','));
  // 잠금 → 다시 열기
  await page.click('[data-action=lock]'); await page.waitForSelector('#pin1');
  const idb = await page.evaluate(() => new Promise(r => { const q = indexedDB.open('kim-minji-handoff'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('vault'); g.onsuccess = () => r(JSON.stringify(g.result)); }; }));
  console.log('IDB has plaintext?', idb.includes('ABGA') || idb.includes('71병동'));
  await page.fill('#pin1', '0000'); await page.click('button[type=submit]'); await page.waitForTimeout(800);
  console.log('wrong pin msg:', await page.textContent('#lockErr'));
  await page.fill('#pin1', '1234'); await page.click('button[type=submit]'); await page.waitForSelector('.tabs'); console.log('after unlock hash:', await page.evaluate(()=>location.hash));
  // 모두 지우기 → 새로 설정 → 가져오기
  await page.goto('http://localhost:8765/#/settings'); await page.waitForSelector('[data-action=wipe]');
  await page.click('[data-action=wipe]'); await page.fill('.modal .pin-input', '1234'); await page.click('.modal [type=submit]');
  await page.waitForSelector('.modal [data-ok]'); await page.click('.modal [data-ok]');
  await page.waitForSelector('#pin2');
  await page.fill('#pin1', '5678'); await page.fill('#pin2', '5678'); await page.click('button[type=submit]'); await page.waitForSelector('.fab');
  await page.click('.tabs a[href="#/settings"]');
  await page.setInputFiles('#impFile', bpath);
  await page.fill('#impPw', 'wrong'); await page.click('#importForm [data-mode=merge]'); await page.waitForTimeout(1500);
  console.log('wrong backup pw:', await page.textContent('#toast'));
  await page.setInputFiles('#impFile', bpath);
  await page.fill('#impPw', 'backup-pw'); await page.click('#importForm [data-mode=merge]'); await page.waitForTimeout(1500);
  console.log('import:', await page.textContent('#toast'));
  // 쓰는 중 잠금 → 이어쓰기
  await page.click('.tabs a[href^="#/day"]'); await page.click('.fab'); await page.fill('#fBed', '702-1'); await page.fill('#fBody', '쓰던 글'); await page.waitForTimeout(1000);
  await page.click('[data-action=lock]'); await page.fill('#pin1', '5678'); await page.click('button[type=submit]');
  await page.waitForSelector('#editForm');
  console.log('draft restored:', await page.inputValue('#fBody'));
  await page.emulateMedia({ colorScheme: 'dark' }); await page.click('[data-action=cancel-edit]'); await page.waitForSelector('.card'); await shot('10-dark-day');
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
