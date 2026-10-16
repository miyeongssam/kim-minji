// 복구 코드·「PIN을 잊었어요」·옛 데이터 옮겨 담기·백업 알림 확인. 가짜 기록만 쓴다.
// 사용법: python3 -m http.server 8765 &  →  node tests/recovery.cjs
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;
const URL = 'http://localhost:8765/';
let fail = 0;
const check = (label, ok) => { if (!ok) fail++; console.log(`${ok ? 'OK ' : 'NG '} ${label}`); };

async function setup(p, pin) {
  await p.fill('#pin1', pin); await p.fill('#pin2', pin); await p.click('button[type=submit]');
  await p.waitForSelector('#rcShow', { timeout: 15000 }).catch(async (e) => {
    throw new Error(`복구 코드 창이 안 뜸. 화면 글: ${await p.locator('#lockErr').innerText().catch(() => '-')} | pin1=${await p.inputValue('#pin1').catch(() => '-')} | ${e.message.split('\n')[0]}`);
  });
  const code = await p.inputValue('#rcShow');
  await p.check('#rcOk'); await p.click('[data-rc=done]');
  await p.waitForSelector('.fab');
  return code;
}
async function addEntry(p, bed) {
  await p.click('.fab'); await p.fill('#fWard', '71병동'); await p.fill('#fBed', bed); await p.fill('#fTitle', '가짜 기록');
  await p.click('.save-bar .btn.primary'); await p.waitForSelector('.detail');
  await p.click('.tabs a[data-action=tab-day]'); await p.waitForSelector('.fab'); // 잠그기 전 화면 = 날짜 화면
}
async function unlock(p, pin) {
  await p.fill('#pin1', pin); await p.click('button[type=submit]');
}
const lock = (p) => p.click('[data-action=lock]').then(() => p.waitForSelector('#pin1'));
const vaultVersion = (p) => p.evaluate(() => new Promise((r) => { const q = indexedDB.open('kim-minji-handoff'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('vault'); g.onsuccess = () => r(g.result && g.result.v); }; }));

(async () => {
  const b = await chromium.launch();
  const errors = [];

  // 1) 복구 코드로 PIN 되찾기
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL);
    const code = await setup(p, '1234');
    check(`복구 코드 형식 ${code}`, /^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){4}$/.test(code));
    check('저장 모양이 v2', (await vaultVersion(p)) === 2);
    await addEntry(p, '701-3');
    await lock(p);
    await p.click('[data-action=forgot-pin]');
    await p.fill('#rcIn', 'AAAA-BBBB-CCCC-DDDD-EEEE'); await p.click('.modal [type=submit]');
    await p.waitForSelector('.modal .err:has-text("맞지 않아요")');
    check('틀린 복구 코드는 막힘', true);
    await p.fill('#rcIn', code.toLowerCase().replace(/-/g, ' ')); await p.click('.modal [type=submit]');
    await p.waitForSelector('#np1');
    await p.fill('#np1', '9999'); await p.fill('#np2', '9999'); await p.click('.modal [type=submit]');
    await p.waitForSelector('.fab');
    check('복구 코드(소문자·띄어쓰기)로 열고 새 PIN 정하기', true);
    check('기록 그대로 있음', (await p.locator('.card:has-text("701-3")').count()) === 1);
    await lock(p); await unlock(p, '1234'); await p.waitForTimeout(800);
    check('옛 PIN은 안 됨', (await p.locator('#lockErr').innerText()).includes('맞지 않아요'));
    await unlock(p, '9999'); await p.waitForSelector('.fab');
    check('새 PIN으로 열림', true);

    // 2) 복구 코드 새로 만들기 → 옛 코드는 안 됨
    await p.goto(URL + '#/settings'); await p.waitForSelector('[data-action=renew-recovery]');
    await p.click('[data-action=renew-recovery]');
    await p.fill('.modal .pin-input', '9999'); await p.click('.modal [type=submit]');
    await p.waitForSelector('#rcShow');
    const code2 = await p.inputValue('#rcShow');
    await p.check('#rcOk'); await p.click('[data-rc=done]');
    check('새 복구 코드는 예전과 다름', code2 !== code);
    await lock(p);
    await p.click('[data-action=forgot-pin]');
    await p.fill('#rcIn', code); await p.click('.modal [type=submit]');
    await p.waitForSelector('.modal .err:has-text("맞지 않아요")');
    check('예전 복구 코드는 안 됨', true);
    await p.fill('#rcIn', code2); await p.click('.modal [type=submit]');
    await p.waitForSelector('#np1'); await p.fill('#np1', '2468'); await p.fill('#np2', '2468'); await p.click('.modal [type=submit]');
    await p.waitForSelector('.tabs'); // 잠그기 전 화면(설정)으로 돌아온다
    check('새 복구 코드로 열림', true);

    // 3) 복구 코드도 없을 때: 모두 지우고 새로 시작
    await lock(p);
    await p.click('[data-action=forgot-pin]'); await p.click('.modal [data-wipe]');
    check('「모두 지우기」 입력 전에는 버튼 꺼짐', await p.locator('.modal [data-ok]').isDisabled());
    await p.fill('#wipeWord', '모두 지우기'); await p.click('.modal [data-ok]');
    await p.waitForSelector('#pin2');
    check('지운 뒤 새 PIN 정하기 화면 + 안내', (await p.locator('#lockErr').innerText()).includes('백업 가져오기'));
    await ctx.close();
  }

  // 4) 옛 저장 모양(v1)을 v2로 옮겨 담기
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL); await p.waitForSelector('#pin2');
    await p.evaluate(async () => {
      const te = new TextEncoder();
      const b64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u)));
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const base = await crypto.subtle.importKey('raw', te.encode('4321'), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const now = Date.now();
      const data = { entries: [{ id: 'old1', date: '2026-10-16', ward: '72병동', bed: '720-1', title: '옛 기록', body: '', todos: [], tags: [], important: false, createdAt: now, updatedAt: now }], settings: { lockMin: 3, lastBackupAt: now } };
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(data)));
      const vault = { v: 1, salt: b64(salt), iter: 250000, iv: b64(iv), ct: b64(ct) };
      await new Promise((r) => { const q = indexedDB.open('kim-minji-handoff', 1); q.onsuccess = () => { const tx = q.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(vault, 'vault'); tx.oncomplete = r; }; });
    });
    await p.reload(); await p.waitForSelector('[data-action=forgot-pin]');
    await unlock(p, '4321');
    await p.waitForSelector('#rcShow');
    check('옛 데이터: PIN으로 열리고 복구 코드 창이 뜸', true);
    await p.check('#rcOk'); await p.click('[data-rc=done]');
    await p.goto(URL + '#/day/2026-10-16'); await p.waitForSelector('.cal');
    check('옛 기록 그대로 보임', (await p.locator('.card:has-text("720-1")').count()) === 1);
    check('저장 모양이 v2로 바뀜', (await vaultVersion(p)) === 2);
    await ctx.close();
  }

  // 5) 백업 알림: 첫 기록 하루 뒤 → 「나중에」는 하루 미룸 → 백업하면 7일 동안 안 뜸
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', acceptDownloads: true });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
    const T0 = new Date('2026-10-16T09:00:00+09:00').getTime();
    await p.clock.install({ time: T0 });
    await p.goto(URL);
    await setup(p, '1357');
    await addEntry(p, '705-2');
    await lock(p);
    await unlock(p, '1357'); await p.waitForSelector('.fab'); await p.waitForTimeout(300);
    check('같은 날에는 백업 알림 없음', (await p.locator('.modal').count()) === 0);
    await lock(p);
    await p.clock.setSystemTime(T0 + 2 * 864e5);
    await unlock(p, '1357'); await p.waitForSelector('.modal:has-text("지금 백업할까요")');
    check('이틀 뒤 열면 「지금 백업할까요?」', true);
    await p.click('.modal [data-m=cancel]');
    await lock(p); await unlock(p, '1357'); await p.waitForSelector('.fab'); await p.waitForTimeout(300);
    check('「나중에」 누르면 그날은 다시 안 뜸', (await p.locator('.modal').count()) === 0);
    await lock(p);
    await p.clock.setSystemTime(T0 + 3.5 * 864e5);
    await unlock(p, '1357'); await p.waitForSelector('.modal:has-text("지금 백업할까요")');
    await p.fill('#bpw1', 'backup-pw'); await p.fill('#bpw2', 'backup-pw'); await p.click('.modal [type=submit]');
    await p.waitForSelector('.modal [data-b=save]');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.modal [data-b=save]')]);
    check(`알림 창에서 바로 백업 저장 (${dl.suggestedFilename()})`, /^handoff-backup_\d{8}_\d{4}\.json$/.test(dl.suggestedFilename()));
    await lock(p);
    await p.clock.setSystemTime(T0 + 6 * 864e5);
    await unlock(p, '1357'); await p.waitForSelector('.fab'); await p.waitForTimeout(300);
    check('백업한 뒤 7일 안에는 안 뜸', (await p.locator('.modal').count()) === 0);
    await ctx.close();
  }

  await b.close();
  check(`페이지 오류 없음${errors.length ? ': ' + errors.join('; ') : ''}`, errors.length === 0);
  if (fail) { console.error(`실패 ${fail}건`); process.exit(1); }
  console.log('복구·백업 알림 모두 통과');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
