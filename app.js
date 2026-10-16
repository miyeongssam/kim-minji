/*
 * 인계장 (kim-minji)
 * - 모든 기록은 이 기기의 IndexedDB 안에 PIN으로 암호화(AES-256-GCM, PBKDF2-SHA256)해서 저장한다.
 * - 서버·클라우드로 보내는 코드는 없다. 네트워크는 앱 파일을 받을 때만 쓴다.
 * - 데이터 구조는 ontology/ 폴더의 정의(context.jsonld, handoff.ttl)와 맞춘다. 고치면 둘 다 고친다.
 */
'use strict';
(() => {
  const APP_VERSION = '1.1.0';
  const BACKUP_FORMAT = 'kim-minji/handoff-backup';
  const CONTEXT_URL = 'https://miyeongssam.github.io/kim-minji/ontology/context.jsonld';
  const PBKDF2_ITER = 250000;
  const MAX_FAILS = 5;
  const LOCK_OPTIONS = [[0, '앱을 벗어나면 바로'], [1, '1분'], [3, '3분'], [5, '5분'], [10, '10분']];
  const BACKUP_REMIND_DAYS = 7;

  // 분류 태그 추천 목록 — ontology/procedures.jsonld 의 술기 개념과 같은 이름을 쓴다.
  const TAG_SUGGESTIONS = [
    'ABGA', 'PCPS ABGA', 'C-line culture', 'C-line remove', 'Chemoport needle change', 'C-port',
    'Hickman', '항암제', '수혈', 'Dressing', 'L-tube', 'Foley', 'Tube irrigation', 'Paracentesis',
    'PCD·PTBD·PTGBD remove', 'Sputum culture', 'T-tube change', 'CTD change', 'Enema',
    'CT·MRI keep', 'BM bx assist', '동의서', 'CPR', '사망선언', '검사 f/u', '노티'
  ];

  // 공휴일 — data/holidays-kr.json 과 같아야 한다(tests/check-vocab.cjs 로 확인).
  // 근거: 우주항공청 월력요항, 관공서의 공휴일에 관한 규정(2026.4.28 개정: 노동절·제헌절 추가). [이름, 달력 칸 표시]
  const HOLIDAYS = {
    '2026-01-01': ['신정', '신정'],
    '2026-02-16': ['설날 연휴', '설 연휴'], '2026-02-17': ['설날', '설날'], '2026-02-18': ['설날 연휴', '설 연휴'],
    '2026-03-01': ['삼일절', '삼일절'], '2026-03-02': ['삼일절 대체공휴일', '대체휴일'],
    '2026-05-01': ['노동절', '노동절'],
    '2026-05-05': ['어린이날', '어린이날'],
    '2026-05-24': ['부처님오신날', '석가탄신'], '2026-05-25': ['부처님오신날 대체공휴일', '대체휴일'],
    '2026-06-03': ['전국동시지방선거일', '지방선거'],
    '2026-06-06': ['현충일', '현충일'],
    '2026-07-17': ['제헌절', '제헌절'],
    '2026-08-15': ['광복절', '광복절'], '2026-08-17': ['광복절 대체공휴일', '대체휴일'],
    '2026-09-24': ['추석 연휴', '추석 연휴'], '2026-09-25': ['추석', '추석'], '2026-09-26': ['추석 연휴', '추석 연휴'],
    '2026-10-03': ['개천절', '개천절'], '2026-10-05': ['개천절 대체공휴일', '대체휴일'],
    '2026-10-09': ['한글날', '한글날'],
    '2026-12-25': ['성탄절', '성탄절'],
    '2027-01-01': ['신정', '신정'],
    '2027-02-06': ['설날 연휴', '설 연휴'], '2027-02-07': ['설날', '설날'], '2027-02-08': ['설날 연휴', '설 연휴'], '2027-02-09': ['설날 대체공휴일', '대체휴일'],
    '2027-03-01': ['삼일절', '삼일절'],
    '2027-05-01': ['노동절', '노동절'], '2027-05-03': ['노동절 대체공휴일', '대체휴일'],
    '2027-05-05': ['어린이날', '어린이날'],
    '2027-05-13': ['부처님오신날', '석가탄신'],
    '2027-06-06': ['현충일', '현충일'],
    '2027-07-17': ['제헌절', '제헌절'], '2027-07-19': ['제헌절 대체공휴일', '대체휴일'],
    '2027-08-15': ['광복절', '광복절'], '2027-08-16': ['광복절 대체공휴일', '대체휴일'],
    '2027-09-14': ['추석 연휴', '추석 연휴'], '2027-09-15': ['추석', '추석'], '2027-09-16': ['추석 연휴', '추석 연휴'],
    '2027-10-03': ['개천절', '개천절'], '2027-10-04': ['개천절 대체공휴일', '대체휴일'],
    '2027-10-09': ['한글날', '한글날'], '2027-10-11': ['한글날 대체공휴일', '대체휴일'],
    '2027-12-25': ['성탄절', '성탄절'], '2027-12-27': ['성탄절 대체공휴일', '대체휴일']
  };
  const HOLIDAY_YEARS = [2026, 2027];

  const app = document.getElementById('app');
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const S = {
    vault: null,          // IndexedDB 에 저장된 암호문 묶음
    key: null,            // 잠금 해제 동안만 메모리에 있는 암호 키
    data: null,           // 잠금 해제 동안만 메모리에 있는 평문 데이터
    curDate: null,
    lastActive: Date.now(),
    hiddenAt: 0,
    externalUntil: 0,     // 파일 고르기·공유 창이 떠 있는 동안 자동 잠금을 미룬다
    installEvt: null,
    q: '',
    openOnly: false,
    backupBlob: null,
    draftTimer: null
  };

  // ---------------------------------------------------------------- 공통 도구
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => ymd(new Date());
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(parseDate(s)) === s;
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return ymd(d); };
  const WD = '일월화수목금토';
  const fmtDate = (s, withYear) => { const d = parseDate(s); return `${withYear ? d.getFullYear() + '년 ' : ''}${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
  const fmtStamp = (ms) => { const d = new Date(ms); return `${ymd(d).replace(/-/g, '.')} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const coll = new Intl.Collator('ko', { numeric: true });
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // 등록번호(7자리 이상 숫자)나 주민번호 모양
  const looksLikeId = (text) => /\d{7,}|\d{6}\s*-\s*[1-8]\d{6}/.test(text);

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('on-lock', !S.key);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------------------------------------------------------------- 기기 안 저장소(IndexedDB)
  let dbPromise;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('kim-minji-handoff', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function kv(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  const kvGet = (k) => kv('readonly', (st) => st.get(k));
  const kvSet = (k, v) => kv('readwrite', (st) => st.put(v, k));
  const kvDel = (k) => kv('readwrite', (st) => st.delete(k));

  // ---------------------------------------------------------------- 암호화
  const te = new TextEncoder();
  const td = new TextDecoder();
  function toB64(buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(s) {
    const bin = atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
  async function deriveKey(secret, salt, iter) {
    const base = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptJSON(key, obj) {
    const iv = randomBytes(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
    return { iv: toB64(iv), ct: toB64(ct) };
  }
  async function decryptJSON(key, iv, ct) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct));
    return JSON.parse(td.decode(pt));
  }

  // ---------------------------------------------------------------- 데이터 모양 맞추기
  function normalizeEntry(e) {
    if (!e || typeof e !== 'object' || !isDate(e.date)) return null;
    const str = (v, max) => (typeof v === 'string' ? v : '').slice(0, max);
    return {
      id: typeof e.id === 'string' && e.id ? e.id.slice(0, 64) : uid(),
      date: e.date,
      ward: str(e.ward, 40).trim(),
      bed: str(e.bed, 40).trim(),
      title: str(e.title, 200),
      body: str(e.body, 20000),
      todos: (Array.isArray(e.todos) ? e.todos : [])
        .filter((t) => t && typeof t.t === 'string' && t.t.trim())
        .slice(0, 100)
        .map((t) => ({ t: t.t.slice(0, 500), done: !!t.done })),
      tags: [...new Set((Array.isArray(e.tags) ? e.tags : []).filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 40)))].slice(0, 20),
      important: !!e.important,
      createdAt: Number(e.createdAt) || Date.now(),
      updatedAt: Number(e.updatedAt) || Date.now()
    };
  }
  function normalizeData(o) {
    o = o && typeof o === 'object' ? o : {};
    const st = o.settings || {};
    return {
      schema: 1,
      entries: (Array.isArray(o.entries) ? o.entries : []).map(normalizeEntry).filter(Boolean),
      settings: {
        lockMin: LOCK_OPTIONS.some(([v]) => v === st.lockMin) ? st.lockMin : 3,
        lastBackupAt: Number(st.lastBackupAt) || 0
      },
      draft: o.draft && typeof o.draft === 'object' ? o.draft : null
    };
  }

  // ---------------------------------------------------------------- 저장(항상 암호화해서)
  let saveChain = Promise.resolve();
  function save() {
    const snapshot = clone(S.data);
    const key = S.key;
    const { salt, iter } = S.vault;
    saveChain = saveChain
      .then(async () => {
        const { iv, ct } = await encryptJSON(key, snapshot);
        const vault = { v: 1, salt, iter, iv, ct };
        await kvSet('vault', vault);
        S.vault = vault;
      })
      .catch((err) => toast('저장하지 못했어요: ' + err.message));
    return saveChain;
  }

  // ---------------------------------------------------------------- PIN 실패 횟수
  async function registerFail() {
    const lo = (await kvGet('lockout')) || { fails: 0, until: 0 };
    lo.fails += 1;
    if (lo.fails >= MAX_FAILS) lo.until = Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (lo.fails - MAX_FAILS));
    await kvSet('lockout', lo);
    return lo;
  }
  const resetFails = () => kvSet('lockout', { fails: 0, until: 0 });

  async function verifyPin(pin) {
    if (!/^\d{4,8}$/.test(pin)) return false;
    await saveChain;
    try {
      const key = await deriveKey(pin, fromB64(S.vault.salt), S.vault.iter);
      await decryptJSON(key, S.vault.iv, S.vault.ct);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- 잠금 화면
  function renderLock(message) {
    const setup = !S.vault;
    document.title = '인계장';
    app.innerHTML = `
      <div class="lock">
        <div class="lock-box">
          <img src="icons/icon-192.png" alt="" class="lock-icon">
          <h1>인계장</h1>
          <p class="muted">${setup ? '처음 쓰시는군요. 앱을 잠글 PIN(숫자 4~8자리)을 정해 주세요.' : 'PIN을 입력하세요'}</p>
          <form id="lockForm" autocomplete="off">
            <input id="pin1" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="PIN" aria-label="PIN" autocomplete="off">
            ${setup ? '<input id="pin2" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="PIN 한 번 더" aria-label="PIN 한 번 더" autocomplete="off">' : ''}
            <button class="btn primary block" type="submit">${setup ? '시작하기' : '열기'}</button>
          </form>
          <p class="err" id="lockErr">${esc(message || '')}</p>
          ${setup ? `<div class="notice">
            · 기록은 이 휴대폰 안에만 암호화되어 저장돼요. 인터넷으로 나가지 않아요.<br>
            · PIN을 잊으면 아무도 복구할 수 없어요. 설정에서 백업을 해 두세요.<br>
            · 꼭 「홈 화면에 추가」로 설치해서 쓰세요.
          </div>` : ''}
        </div>
      </div>`;
    const form = $('#lockForm');
    const pin1 = $('#pin1');
    const err = $('#lockErr');
    setTimeout(() => pin1.focus(), 60);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = $('button[type=submit]', form);
      const p1 = pin1.value.trim();
      if (!/^\d{4,8}$/.test(p1)) { err.textContent = 'PIN은 숫자 4~8자리예요'; return; }
      if (setup) {
        const p2 = $('#pin2').value.trim();
        if (p1 !== p2) { err.textContent = '두 PIN이 서로 달라요'; return; }
      }
      btn.disabled = true;
      err.textContent = '확인 중…';
      try {
        if (setup) {
          const salt = randomBytes(16);
          S.key = await deriveKey(p1, salt, PBKDF2_ITER);
          S.vault = { v: 1, salt: toB64(salt), iter: PBKDF2_ITER };
          S.data = normalizeData({});
          await save();
          await resetFails();
          try { await navigator.storage?.persist?.(); } catch { /* 지원하지 않는 브라우저 */ }
          afterUnlock();
        } else {
          const lo = (await kvGet('lockout')) || { fails: 0, until: 0 };
          if (Date.now() < lo.until) {
            err.textContent = `잠시 후 다시 시도하세요 (${Math.ceil((lo.until - Date.now()) / 1000)}초)`;
            btn.disabled = false;
            return;
          }
          try {
            const key = await deriveKey(p1, fromB64(S.vault.salt), S.vault.iter);
            const data = await decryptJSON(key, S.vault.iv, S.vault.ct);
            S.key = key;
            S.data = normalizeData(data);
            await resetFails();
            afterUnlock();
          } catch {
            const f = await registerFail();
            err.textContent = f.fails >= MAX_FAILS
              ? `PIN이 ${f.fails}번 틀렸어요. ${Math.ceil((f.until - Date.now()) / 1000)}초 뒤에 다시 시도하세요`
              : `PIN이 맞지 않아요 (${f.fails}/${MAX_FAILS})`;
            pin1.value = '';
            pin1.focus();
            btn.disabled = false;
          }
        }
      } catch (e2) {
        err.textContent = '문제가 생겼어요: ' + e2.message;
        btn.disabled = false;
      }
    });
  }

  function afterUnlock() {
    S.lastActive = Date.now();
    const d = S.data.draft;
    if (d && d.resume) {
      d.resume = false;
      history.replaceState(null, '', d.id ? `#/edit/${d.id}` : `#/new/${isDate(d.form?.date) ? d.form.date : todayStr()}`);
    }
    route();
  }

  async function lock() {
    if (!S.key) return;
    closeModals();
    if ($('#editForm')) {
      S.data.draft = { id: $('#editForm').dataset.id || null, form: collectForm(), resume: true };
      save();
    }
    await saveChain;
    S.key = null;
    S.data = null;
    S.backupBlob = null;
    renderLock();
  }

  // ---------------------------------------------------------------- 대화 상자
  function closeModals() { $$('.modal-wrap').forEach((m) => m.remove()); }
  function openModal(inner, onMount) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${inner}</div>`;
      document.body.appendChild(wrap);
      const close = (v) => { wrap.remove(); resolve(v); };
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-m=cancel]')) close(null);
      });
      onMount?.(wrap, close);
    });
  }
  function confirmBox(message, okText = '확인', danger = false) {
    return openModal(`
      <p class="m-msg">${esc(message).replace(/\n/g, '<br>')}</p>
      <div class="m-btns">
        <button type="button" class="btn" data-m="cancel">취소</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okText)}</button>
      </div>`, (w, close) => {
      $('[data-ok]', w).addEventListener('click', () => close(true));
    });
  }
  function askPin(message) {
    return openModal(`
      <h2>PIN 확인</h2>
      <p class="muted small">${esc(message)}</p>
      <form class="m-form" autocomplete="off">
        <input class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" aria-label="PIN" autocomplete="off">
        <p class="err"></p>
        <div class="m-btns">
          <button type="button" class="btn" data-m="cancel">취소</button>
          <button type="submit" class="btn primary">확인</button>
        </div>
      </form>`, (w, close) => {
      const input = $('input', w);
      const err = $('.err', w);
      const btn = $('[type=submit]', w);
      setTimeout(() => input.focus(), 60);
      $('form', w).addEventListener('submit', async (e) => {
        e.preventDefault();
        btn.disabled = true;
        err.textContent = '확인 중…';
        if (await verifyPin(input.value.trim())) {
          await resetFails();
          close(true);
          return;
        }
        const f = await registerFail();
        if (f.fails >= MAX_FAILS) { close(false); toast('PIN이 여러 번 틀려서 앱을 잠갔어요'); lock(); return; }
        err.textContent = `PIN이 맞지 않아요 (${f.fails}/${MAX_FAILS})`;
        input.value = '';
        input.focus();
        btn.disabled = false;
      });
    });
  }
  // 글로 복사: PIN을 한 번 더 확인한 뒤, 보여 주고 「복사하기」를 눌러야 복사된다.
  async function copyWithPin(text) {
    if (!(await askPin('글로 복사하려면 PIN을 한 번 더 입력하세요.'))) return;
    await openModal(`
      <h2>글로 복사</h2>
      <p class="muted small">복사한 글은 꼭 필요한 곳에만 붙여 넣으세요. 단톡방에는 올리지 마세요.</p>
      <textarea class="in copy-area" readonly rows="10" aria-label="복사할 글"></textarea>
      <div class="m-btns">
        <button type="button" class="btn" data-m="cancel">닫기</button>
        <button type="button" class="btn primary" data-copy>복사하기</button>
      </div>`, (w, close) => {
      const ta = $('textarea', w);
      ta.value = text;
      $('[data-copy]', w).addEventListener('click', () => {
        copyText(text, ta).then((ok) => {
          toast(ok ? '복사했어요' : '복사하지 못했어요. 글을 길게 눌러 직접 복사하세요');
          if (ok) close(true);
        });
      });
    });
  }
  function copyText(text, ta) {
    const fallback = () => {
      try {
        ta.removeAttribute('readonly');
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy');
        ta.setAttribute('readonly', '');
        return ok;
      } catch { return false; }
    };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, fallback);
    return Promise.resolve(fallback());
  }

  // ---------------------------------------------------------------- 글로 만들기
  function entryText(e) {
    const lines = [];
    const loc = [e.ward, e.bed].filter(Boolean).join(' ');
    lines.push(`■ ${loc || '(위치 없음)'}${e.important ? ' ★중요' : ''}`);
    if (e.title) lines.push(`요약: ${e.title}`);
    if (e.tags.length) lines.push(`분류: ${e.tags.join(', ')}`);
    if (e.body) lines.push('내용:', e.body);
    if (e.todos.length) {
      lines.push('할 일:');
      e.todos.forEach((t) => lines.push(`${t.done ? '☑' : '☐'} ${t.t}`));
    }
    return lines.join('\n');
  }
  const dayText = (date, list) => `[인계] ${fmtDate(date, true)} · ${list.length}건\n\n${list.map(entryText).join('\n\n')}`;

  // ---------------------------------------------------------------- 화면 틀
  function shell({ title, back, tab, body, fab }) {
    document.title = `${title} · 인계장`;
    app.innerHTML = `
      <header class="top">
        ${back ? `<a class="btn ghost icon-btn" href="${esc(back)}" aria-label="뒤로">‹</a>` : ''}
        <h1>${esc(title)}</h1>
        <button type="button" class="btn small" data-action="lock">🔒 잠금</button>
      </header>
      <main id="view">${body}</main>
      ${fab ? '<button type="button" class="fab" data-action="new">＋ 새 인계</button>' : ''}
      <nav class="tabs" aria-label="메뉴">
        ${tabLink('day', '📅', '날짜별', tab)}
        ${tabLink('search', '🔍', '검색', tab)}
        ${tabLink('settings', '⚙️', '설정', tab)}
      </nav>`;
    window.scrollTo(0, 0);
  }
  function tabLink(name, icon, label, tab) {
    const href = name === 'day' ? `#/day/${todayStr()}` : `#/${name}`;
    return `<a href="${href}" class="${tab === name ? 'on' : ''}"${name === 'day' ? ' data-action="tab-day"' : ''}${tab === name ? ' aria-current="page"' : ''}><span class="ti" aria-hidden="true">${icon}</span>${label}</a>`;
  }
  function hl(text, terms) {
    text = String(text ?? '');
    if (!terms || !terms.length) return esc(text);
    const re = new RegExp('(' + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    return text.split(re).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
  }
  function card(e, { showDate, showWard, terms } = {}) {
    const total = e.todos.length;
    const done = e.todos.filter((t) => t.done).length;
    const loc = showWard ? [e.ward, e.bed].filter(Boolean).join(' ') : e.bed;
    const firstLines = e.body.split('\n').filter(Boolean).slice(0, 2).join(' · ');
    return `
      <button type="button" class="card" data-action="open" data-id="${esc(e.id)}">
        ${showDate ? `<div class="res-date">${esc(fmtDate(e.date, true))}</div>` : ''}
        <div class="c-top">
          ${e.important ? '<span class="star" aria-label="중요">★</span>' : ''}
          ${loc ? `<span class="loc">${hl(loc, terms)}</span>` : ''}
          <span class="ttl">${hl(e.title || (loc ? '' : '(요약 없음)'), terms)}</span>
        </div>
        ${firstLines ? `<div class="c-sub">${hl(firstLines, terms)}</div>` : ''}
        ${total || e.tags.length ? `<div class="c-meta">
          ${total ? `<span class="pill ${done === total ? 'done' : ''}">할 일 ${done}/${total}</span>` : ''}
          ${e.tags.slice(0, 3).map((t) => `<span class="pill tag">${hl(t, terms)}</span>`).join('')}
        </div>` : ''}
      </button>`;
  }
  const findEntry = (id) => S.data.entries.find((e) => e.id === id);
  function countByDate() {
    const m = {};
    S.data.entries.forEach((e) => { m[e.date] = (m[e.date] || 0) + 1; });
    return m;
  }
  function sortInGroup(a, b) {
    return (b.important - a.important) || coll.compare(a.bed, b.bed) || (a.createdAt - b.createdAt);
  }
  function notFound() {
    shell({ title: '찾을 수 없어요', tab: 'day', back: `#/day/${S.curDate || todayStr()}`, body: '<div class="empty">이 인계는 지워졌거나 없어요.</div>' });
  }

  // ---------------------------------------------------------------- 날짜별 보기(한 달 달력 + 고른 날 목록)
  // 일요일 시작. 달력 칸: 날짜, 공휴일 이름, 인계 건수(할 일이 남았으면 주황).
  function monthCells(y, m) {
    const first = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0).getDate();
    const weeks = Math.ceil((first.getDay() + lastDay) / 7);
    const cells = [];
    for (let i = 0; i < weeks * 7; i++) cells.push(new Date(y, m, 1 - first.getDay() + i));
    return cells;
  }
  // 달을 옮기면: 그 달에 오늘이 있으면 오늘, 아니면 1일을 고른다.
  function monthTarget(y, m) {
    const d = new Date(y, m, 1);
    const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() ? todayStr() : ymd(d);
  }
  function viewDay(date) {
    S.curDate = date;
    const sel = parseDate(date);
    const y = sel.getFullYear();
    const m = sel.getMonth();
    const today = todayStr();
    const list = S.data.entries.filter((e) => e.date === date);
    const counts = countByDate();
    const openDays = new Set(S.data.entries.filter((e) => e.todos.some((t) => !t.done)).map((e) => e.date));
    const hol = HOLIDAYS[date];

    const cells = monthCells(y, m).map((d) => {
      const ds = ymd(d);
      const h = HOLIDAYS[ds];
      const n = counts[ds] || 0;
      const cls = ['cal-day'];
      if (d.getMonth() !== m) cls.push('out');
      if (d.getDay() === 0 || h) cls.push('red'); else if (d.getDay() === 6) cls.push('blue');
      if (ds === today) cls.push('today');
      if (ds === date) cls.push('sel');
      const label = `${fmtDate(ds, true)}${h ? ' ' + h[0] : ''}${n ? ` 인계 ${n}건` : ''}`;
      return `<button type="button" class="${cls.join(' ')}" data-action="pick-day" data-date="${ds}" aria-label="${esc(label)}"${ds === date ? ' aria-pressed="true"' : ''}>
          <span class="cd-n">${d.getDate()}</span>
          ${h ? `<span class="cd-h">${esc(h[1])}</span>` : ''}
          ${n ? `<span class="cd-c ${openDays.has(ds) ? 'open' : ''}">${n}</span>` : ''}
        </button>`;
    }).join('');

    const groups = new Map();
    list.forEach((e) => {
      if (!groups.has(e.ward)) groups.set(e.ward, []);
      groups.get(e.ward).push(e);
    });
    const wards = [...groups.keys()].sort((a, b) => ((a === '') - (b === '')) || coll.compare(a, b));

    const banners = [];
    if (!isStandalone()) banners.push(`<div class="banner">📲 「홈 화면에 추가」로 설치해서 쓰세요. 설치하지 않으면 기록이 지워질 수 있어요.<a href="#/settings">방법 보기</a></div>`);
    const lb = S.data.settings.lastBackupAt;
    if (S.data.entries.length && (!lb || Date.now() - lb > BACKUP_REMIND_DAYS * 864e5)) {
      banners.push(`<div class="banner">💾 마지막 백업: ${lb ? esc(fmtStamp(lb)) : '없음'}<a href="#/settings">백업하기</a></div>`);
    }

    let content;
    if (list.length) {
      content = wards.map((w) => `
        <div class="group-h">${esc(w || '병동 미지정')} · ${groups.get(w).length}건</div>
        <div class="list">${groups.get(w).sort(sortInGroup).map((e) => card(e)).join('')}</div>`).join('')
        + `<div class="row day-actions"><button type="button" class="btn grow" data-action="copy-day">📋 이 날 전체 글로 복사</button></div>`;
    } else {
      const prev = Object.keys(counts).filter((d) => d < date).sort().pop();
      content = `<div class="empty">
          이 날 인계가 없어요.<br>
          <button type="button" class="btn primary" data-action="new">＋ 새 인계 쓰기</button>
          ${prev ? `<br><button type="button" class="btn" data-action="carry" data-from="${prev}">↪ ${esc(fmtDate(prev))} 인계 ${counts[prev]}건 이어받기</button>
          <p class="small">끝나지 않은 할 일만 가져와요.</p>` : ''}
        </div>`;
    }

    shell({
      title: date === today ? '오늘 인계' : '날짜별 인계',
      tab: 'day',
      fab: true,
      body: `
        ${banners.join('')}
        <section class="cal" aria-label="달력">
          <div class="cal-head">
            <button type="button" class="btn icon-btn" data-action="month" data-dir="-1" aria-label="이전 달">◀</button>
            <label class="cal-title">${y}년 ${m + 1}월
              <input type="month" value="${y}-${pad(m + 1)}" data-change="pick-month" aria-label="달 고르기">
            </label>
            <button type="button" class="btn icon-btn" data-action="month" data-dir="1" aria-label="다음 달">▶</button>
            ${date !== today ? `<button type="button" class="btn small" data-action="goto" data-date="${today}">오늘</button>` : ''}
          </div>
          <div class="cal-week" aria-hidden="true"><span class="red">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span class="blue">토</span></div>
          <div class="cal-grid" id="calGrid">${cells}</div>
          <p class="cal-legend">숫자 = 인계 건수 · <span class="dot-open"></span> 남은 할 일 · <span class="red">빨간 날</span> = 일요일·공휴일${HOLIDAY_YEARS.includes(y) ? '' : ` · ${y}년 공휴일 정보는 아직 없어요`}</p>
        </section>
        <div class="sel-head">
          <h2>${esc(fmtDate(date))}${hol ? ` <span class="hol">${esc(hol[0])}</span>` : ''}</h2>
          <span class="small muted">인계 ${list.length}건</span>
        </div>
        ${content}`
    });

    // 달력을 좌우로 밀면 이전·다음 달
    const grid = $('#calGrid');
    let sx = 0;
    let sy = 0;
    grid.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    grid.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        S.swiped = Date.now();
        location.replace(`#/day/${monthTarget(y, m + (dx < 0 ? 1 : -1))}`);
      }
    }, { passive: true });
  }

  // ---------------------------------------------------------------- 인계 보기
  function viewEntry(id) {
    const e = findEntry(id);
    if (!e) return notFound();
    S.curDate = e.date;
    const loc = [e.ward, e.bed].filter(Boolean).join(' ');
    shell({
      title: loc || '인계',
      tab: 'day',
      back: `#/day/${e.date}`,
      body: `
        <article class="detail">
          <h2>${e.important ? '<span class="star" aria-label="중요">★</span> ' : ''}${esc(loc || '(위치 없음)')}</h2>
          <div class="d-sub">${esc(fmtDate(e.date, true))}</div>
          ${e.title ? `<p class="d-title">${esc(e.title)}</p>` : ''}
          ${e.tags.length ? `<div class="c-meta">${e.tags.map((t) => `<span class="pill tag">${esc(t)}</span>`).join('')}</div>` : ''}
          ${e.body ? `<div class="body">${esc(e.body)}</div>` : ''}
          ${e.todos.length ? `<h3>할 일</h3>${e.todos.map((t, i) => `
            <label class="todo-view ${t.done ? 'done' : ''}">
              <input type="checkbox" data-change="toggle-todo" data-id="${esc(e.id)}" data-i="${i}" ${t.done ? 'checked' : ''}>
              <span>${esc(t.t)}</span>
            </label>`).join('')}` : ''}
          <div class="stamp">처음 쓴 때 ${esc(fmtStamp(e.createdAt))} · 고친 때 ${esc(fmtStamp(e.updatedAt))}</div>
        </article>
        <div class="actions">
          <a class="btn primary" href="#/edit/${esc(e.id)}">✏️ 고치기</a>
          <button type="button" class="btn" data-action="copy-entry" data-id="${esc(e.id)}">📋 글로 복사</button>
          <div class="full">
            <div class="copy-to">
              <input class="in" type="date" id="copyDate" value="${addDays(e.date, 1)}" aria-label="복사할 날짜">
              <button type="button" class="btn" data-action="copy-to" data-id="${esc(e.id)}">다른 날로 복사</button>
            </div>
            <p class="small muted">끝나지 않은 할 일만 함께 복사돼요.</p>
          </div>
          <button type="button" class="btn danger full" data-action="delete" data-id="${esc(e.id)}">🗑 지우기</button>
        </div>`
    });
  }

  // ---------------------------------------------------------------- 쓰기·고치기
  function todoRow(t = { t: '', done: false }) {
    return `<div class="todo-row">
      <input type="checkbox" class="todo-done" ${t.done ? 'checked' : ''} aria-label="끝남">
      <input class="in todo-text" value="${esc(t.t)}" placeholder="할 일" maxlength="500">
      <button type="button" class="btn icon-btn ghost" data-action="del-todo" aria-label="할 일 지우기">✕</button>
    </div>`;
  }
  function viewEdit(id, date) {
    const existing = id ? findEntry(id) : null;
    if (id && !existing) return notFound();
    const lastWard = S.data.entries.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0]?.ward || '';
    let f = existing ? clone(existing) : { date: date || todayStr(), ward: lastWard, bed: '', title: '', body: '', todos: [], tags: [], important: false };
    let restored = false;
    const d = S.data.draft;
    if (d && (d.id || null) === (id || null) && d.form) {
      f = { ...f, ...normalizeEntry({ ...f, ...d.form, id: f.id || 'draft' }) };
      restored = true;
    }
    S.curDate = f.date;
    const wards = [...new Set(S.data.entries.map((e) => e.ward).filter(Boolean))].sort(coll.compare);
    shell({
      title: existing ? '인계 고치기' : '새 인계',
      tab: 'day',
      back: existing ? `#/entry/${existing.id}` : `#/day/${f.date}`,
      body: `
        <form id="editForm" data-id="${existing ? esc(existing.id) : ''}" autocomplete="off">
          <div class="notice warn">⚠️ 환자 이름·등록번호·생년월일은 적지 마세요. 병실·침상 번호로 구분해요.</div>
          ${restored ? '<div class="notice">쓰던 내용을 불러왔어요. <button type="button" class="btn small" data-action="discard-draft">비우고 새로 쓰기</button></div>' : ''}
          <label class="f" for="fDate">날짜</label>
          <input class="in" id="fDate" type="date" value="${esc(f.date)}" required>
          <div class="two">
            <div>
              <label class="f" for="fWard">병동</label>
              <input class="in" id="fWard" value="${esc(f.ward)}" list="wardList" placeholder="예: 71병동" maxlength="40">
              <datalist id="wardList">${wards.map((w) => `<option value="${esc(w)}">`).join('')}</datalist>
            </div>
            <div>
              <label class="f" for="fBed">병실·침상</label>
              <input class="in" id="fBed" value="${esc(f.bed)}" placeholder="예: 701-3" maxlength="40">
            </div>
          </div>
          <label class="f" for="fTitle">요약 (진단·상태 한 줄)</label>
          <input class="in" id="fTitle" value="${esc(f.title)}" placeholder="예: POD#2, NPO, V/S stable" maxlength="200">
          <label class="f" for="fTags">분류 (쉼표로 구분)</label>
          <input class="in" id="fTags" value="${esc(f.tags.join(', '))}" placeholder="예: ABGA, 항암제" maxlength="400">
          <div class="chips tag-suggest">${TAG_SUGGESTIONS.map((t) => `<button type="button" class="chip" data-action="add-tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          <label class="f" for="fBody">내용</label>
          <textarea class="in" id="fBody" placeholder="경과, 오늘 한 처치, 주의할 점" maxlength="20000">${esc(f.body)}</textarea>
          <label class="f">할 일</label>
          <div id="todoList">${f.todos.map(todoRow).join('')}</div>
          <button type="button" class="btn small" data-action="add-todo">＋ 할 일 추가</button>
          <label class="check"><input type="checkbox" id="fImportant" ${f.important ? 'checked' : ''}> <span class="star">★</span> 중요 표시</label>
        </form>
        <div class="save-bar">
          <button type="button" class="btn" data-action="cancel-edit">취소</button>
          <button type="submit" class="btn primary" form="editForm">저장</button>
        </div>`
    });
    const body = $('#fBody');
    const grow = () => { body.style.height = 'auto'; body.style.height = Math.max(140, body.scrollHeight + 2) + 'px'; };
    body.addEventListener('input', grow);
    grow();
    $('#editForm').addEventListener('input', scheduleDraft);
    if (!existing && !restored) setTimeout(() => $(f.ward ? '#fBed' : '#fWard').focus(), 80);
  }
  function collectForm() {
    const todos = $$('#todoList .todo-row')
      .map((r) => ({ t: $('.todo-text', r).value.trim(), done: $('.todo-done', r).checked }))
      .filter((t) => t.t);
    return {
      date: $('#fDate').value,
      ward: $('#fWard').value.trim(),
      bed: $('#fBed').value.trim(),
      title: $('#fTitle').value.trim(),
      body: $('#fBody').value.replace(/\s+$/, ''),
      tags: [...new Set($('#fTags').value.split(/[,，]/).map((t) => t.trim()).filter(Boolean))],
      todos,
      important: $('#fImportant').checked
    };
  }
  // 쓰는 중인 글은 잠깐마다 (암호화해서) 임시 저장한다. 잠기거나 다른 화면으로 가도 이어 쓸 수 있다.
  function scheduleDraft() {
    clearTimeout(S.draftTimer);
    S.draftTimer = setTimeout(() => {
      const form = $('#editForm');
      if (!form || !S.key) return;
      S.data.draft = { id: form.dataset.id || null, form: collectForm(), resume: false };
      save();
    }, 800);
  }
  function clearDraft() {
    clearTimeout(S.draftTimer);
    if (S.data.draft) { S.data.draft = null; save(); }
  }
  async function submitEdit() {
    const form = $('#editForm');
    const v = collectForm();
    if (!isDate(v.date)) { toast('날짜를 확인해 주세요'); return; }
    if (!v.ward && !v.bed && !v.title && !v.body && !v.todos.length) { toast('내용을 입력해 주세요'); return; }
    const allText = [v.ward, v.bed, v.title, v.body, ...v.tags, ...v.todos.map((t) => t.t)].join(' ');
    if (looksLikeId(allText) && !(await confirmBox('등록번호나 주민번호처럼 보이는 숫자가 있어요.\n환자를 알아볼 수 있는 정보는 적지 않아요.\n그래도 저장할까요?', '그대로 저장'))) return;
    const now = Date.now();
    let id = form.dataset.id;
    if (id) {
      const e = findEntry(id);
      if (!e) { notFound(); return; }
      Object.assign(e, normalizeEntry({ ...e, ...v, updatedAt: now }));
    } else {
      id = uid();
      S.data.entries.push(normalizeEntry({ ...v, id, createdAt: now, updatedAt: now }));
    }
    clearTimeout(S.draftTimer);
    S.data.draft = null;
    await save();
    toast('저장했어요');
    location.replace(`#/entry/${id}`);
  }

  // ---------------------------------------------------------------- 검색
  function viewSearch() {
    shell({
      title: '검색',
      tab: 'search',
      body: `
        <div class="search-box">
          <input id="q" class="in" type="search" placeholder="병동, 침상, 내용, 할 일, 분류" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search" aria-label="검색어">
          <label class="check small"><input type="checkbox" id="openOnly" ${S.openOnly ? 'checked' : ''}> 끝나지 않은 할 일이 있는 것만</label>
        </div>
        <div id="results"></div>`
    });
    const q = $('#q');
    q.addEventListener('input', () => { S.q = q.value; renderResults(); });
    $('#openOnly').addEventListener('change', (e) => { S.openOnly = e.target.checked; renderResults(); });
    renderResults();
    if (!S.q) setTimeout(() => q.focus(), 80);
  }
  function renderResults() {
    const box = $('#results');
    if (!box) return;
    const terms = S.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length && !S.openOnly) {
      box.innerHTML = `<div class="empty">검색어를 입력하세요.<br><span class="small">띄어 쓰면 모든 낱말이 들어간 것만 찾아요.</span></div>`;
      return;
    }
    let list = S.data.entries;
    if (S.openOnly) list = list.filter((e) => e.todos.some((t) => !t.done));
    if (terms.length) {
      list = list.filter((e) => {
        const hay = [e.ward, e.bed, e.title, e.body, ...e.tags, ...e.todos.map((t) => t.t)].join('\n').toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    list = list.slice().sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0) || coll.compare(a.ward, b.ward) || sortInGroup(a, b));
    const shown = list.slice(0, 200);
    box.innerHTML = list.length
      ? `<p class="small muted">${list.length}건${list.length > shown.length ? ` 중 최근 ${shown.length}건` : ''}</p><div class="list">${shown.map((e) => card(e, { showDate: true, showWard: true, terms })).join('')}</div>`
      : '<div class="empty">찾는 인계가 없어요.</div>';
  }

  // ---------------------------------------------------------------- 설정
  function viewSettings() {
    const st = S.data.settings;
    const canShare = !!(navigator.canShare && window.File && (() => { try { return navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] }); } catch { return false; } })());
    const standalone = isStandalone();
    shell({
      title: '설정',
      tab: 'settings',
      body: `
        <section class="sec">
          <h2>📲 설치</h2>
          ${standalone
            ? '<p class="small muted">홈 화면 앱으로 쓰고 있어요. 앞으로도 홈 화면 아이콘으로만 여세요.</p>'
            : `<div class="notice warn">아직 설치하지 않았어요. 설치하지 않으면 (특히 아이폰에서) 기록이 지워질 수 있어요.</div>
               ${S.installEvt ? '<div class="row"><button type="button" class="btn primary grow" data-action="install">앱 설치하기</button></div>' : ''}
               <p class="small">${isIOS()
                 ? '아이폰: 사파리 아래쪽 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b> → 추가.<br>설치한 뒤에는 홈 화면 아이콘으로만 여세요. 사파리에서 쓰던 기록은 앱으로 옮겨지지 않아요.'
                 : '안드로이드: 크롬 오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b>(또는 앱 설치) → 설치.<br>설치한 뒤에는 홈 화면 아이콘으로만 여세요.'}</p>`}
        </section>

        <section class="sec">
          <h2>🔒 잠금</h2>
          <label class="f" for="lockMin">자동 잠금</label>
          <select class="in" id="lockMin" data-change="lock-min">
            ${LOCK_OPTIONS.map(([v, label]) => `<option value="${v}" ${v === st.lockMin ? 'selected' : ''}>${label}${v ? ' 동안 쓰지 않으면' : ''}</option>`).join('')}
          </select>
          <form id="pinForm" autocomplete="off">
            <label class="f">PIN 바꾸기</label>
            <input class="in" id="pinOld" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="지금 PIN" aria-label="지금 PIN">
            <div class="two m-top">
              <input class="in" id="pinNew" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="새 PIN (4~8자리)" aria-label="새 PIN">
              <input class="in" id="pinNew2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="새 PIN 한 번 더" aria-label="새 PIN 한 번 더">
            </div>
            <div class="row"><button type="submit" class="btn grow">PIN 바꾸기</button></div>
          </form>
        </section>

        <section class="sec">
          <h2>💾 백업 내보내기</h2>
          <p class="small muted">마지막 백업: ${st.lastBackupAt ? esc(fmtStamp(st.lastBackupAt)) : '없음'} · 기록 ${S.data.entries.length}건</p>
          <form id="exportForm" autocomplete="off">
            <input class="in" id="expPw" type="password" placeholder="백업 비밀번호 (6자 이상)" aria-label="백업 비밀번호" autocomplete="new-password">
            <input class="in m-top" id="expPw2" type="password" placeholder="비밀번호 한 번 더" aria-label="백업 비밀번호 한 번 더" autocomplete="new-password">
            <div class="row"><button type="submit" class="btn primary grow">🔐 잠긴 백업 파일 만들기</button></div>
          </form>
          <div id="exportReady" class="export-ready" hidden>
            <p class="small"><b id="expName"></b> 파일을 만들었어요.</p>
            <div class="row">
              <button type="button" class="btn grow" data-action="export-save">휴대폰에 저장</button>
              ${canShare ? '<button type="button" class="btn grow" data-action="export-share">보내기(공유)</button>' : ''}
            </div>
          </div>
          <div class="notice">
            · 비밀번호 없이는 파일이 만들어지지 않고, 열리지도 않아요.<br>
            · 파일은 휴대폰 안에만 두세요. (아이폰: 파일 앱 「나의 iPhone」, 안드로이드: 다운로드 폴더)<br>
            · 다음 사람에게 넘길 때만 파일을 보내고, 비밀번호는 같은 메시지로 보내지 말고 말로 따로 알려 주세요.<br>
            · 일주일에 한 번은 백업해 두세요.
          </div>
        </section>

        <section class="sec">
          <h2>📥 백업 가져오기</h2>
          <form id="importForm" autocomplete="off">
            <input class="in" id="impFile" type="file" accept=".json,application/json" aria-label="백업 파일" data-action="pick-file">
            <input class="in m-top" id="impPw" type="password" placeholder="백업 비밀번호" aria-label="백업 비밀번호" autocomplete="off">
            <div class="row">
              <button type="submit" class="btn primary grow" data-mode="merge">합치기</button>
              <button type="submit" class="btn grow" data-mode="replace">바꾸기</button>
            </div>
          </form>
          <p class="small muted">합치기: 지금 기록은 두고 백업의 기록을 더해요(같은 인계는 더 나중에 고친 쪽을 남겨요).<br>바꾸기: 지금 기록을 모두 지우고 백업으로 바꿔요(새 휴대폰으로 옮길 때).</p>
        </section>

        <section class="sec">
          <h2>ℹ️ 정보</h2>
          <div class="kv"><span>저장 위치</span><span>이 휴대폰 안 (암호화)</span></div>
          <div class="kv"><span>기록</span><span>${S.data.entries.length}건</span></div>
          <div class="kv"><span>저장 공간 보호</span><span id="persistState">확인 중…</span></div>
          <div class="kv"><span>버전</span><span>${APP_VERSION}</span></div>
          <p class="small muted">브라우저 기록·사이트 데이터를 지우거나 앱을 삭제하면 기록도 지워져요.</p>
        </section>

        <section class="sec">
          <h2>⚠️ 모든 기록 지우기</h2>
          <p class="small muted">PIN과 기록이 모두 지워지고 처음 상태가 돼요. 되돌릴 수 없어요.</p>
          <div class="row"><button type="button" class="btn danger grow" data-action="wipe">모든 기록 지우기</button></div>
        </section>`
    });
    S.backupBlob = null;
    const ps = $('#persistState');
    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then((p) => { ps.textContent = p ? '켜짐' : '꺼짐 (홈 화면에 설치하면 안전해요)'; }).catch(() => { ps.textContent = '알 수 없음'; });
    } else ps.textContent = '알 수 없음';
  }

  async function changePin() {
    const oldPin = $('#pinOld').value.trim();
    const p1 = $('#pinNew').value.trim();
    const p2 = $('#pinNew2').value.trim();
    if (!/^\d{4,8}$/.test(p1)) { toast('새 PIN은 숫자 4~8자리예요'); return; }
    if (p1 !== p2) { toast('새 PIN 두 개가 서로 달라요'); return; }
    if (!(await verifyPin(oldPin))) {
      const f = await registerFail();
      if (f.fails >= MAX_FAILS) { toast('PIN이 여러 번 틀려서 앱을 잠갔어요'); lock(); return; }
      toast(`지금 PIN이 맞지 않아요 (${f.fails}/${MAX_FAILS})`);
      return;
    }
    await resetFails();
    const salt = randomBytes(16);
    S.key = await deriveKey(p1, salt, PBKDF2_ITER);
    S.vault = { v: 1, salt: toB64(salt), iter: PBKDF2_ITER };
    await save();
    $('#pinForm').reset();
    toast('PIN을 바꿨어요');
  }

  async function makeBackup() {
    const pw = $('#expPw').value;
    if (pw.length < 6) { toast('백업 비밀번호는 6자 이상이어야 해요'); return; }
    if (pw !== $('#expPw2').value) { toast('비밀번호 두 개가 서로 달라요'); return; }
    if (!S.data.entries.length) { toast('내보낼 기록이 없어요'); return; }
    const btn = $('#exportForm button[type=submit]');
    btn.disabled = true;
    btn.textContent = '만드는 중…';
    try {
      const salt = randomBytes(16);
      const key = await deriveKey(pw, salt, PBKDF2_ITER);
      const payload = {
        '@context': CONTEXT_URL,
        '@type': 'HandoffBackup',
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        entries: S.data.entries
      };
      const { iv, ct } = await encryptJSON(key, payload);
      const file = { format: BACKUP_FORMAT, version: 1, kdf: 'PBKDF2-SHA256', iter: PBKDF2_ITER, cipher: 'AES-256-GCM', salt: toB64(salt), iv, ct };
      const d = new Date();
      S.backupName = `handoff-backup_${ymd(d).replace(/-/g, '')}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
      S.backupBlob = new Blob([JSON.stringify(file)], { type: 'application/json' });
      $('#exportForm').reset();
      $('#expName').textContent = S.backupName;
      $('#exportReady').hidden = false;
    } catch (e) {
      toast('백업 파일을 만들지 못했어요: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔐 잠긴 백업 파일 만들기';
    }
  }
  function markBackedUp() {
    S.data.settings.lastBackupAt = Date.now();
    save();
  }
  function exportSave() {
    if (!S.backupBlob) return;
    const url = URL.createObjectURL(S.backupBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = S.backupName;
    document.body.appendChild(a);
    S.externalUntil = Date.now() + 120e3;
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60e3);
    markBackedUp();
    toast('저장했어요. 파일 앱(다운로드)에서 확인하세요');
  }
  function exportShare() {
    if (!S.backupBlob) return;
    const f = new File([S.backupBlob], S.backupName, { type: 'application/json' });
    S.externalUntil = Date.now() + 120e3;
    navigator.share({ files: [f], title: '인계장 백업' })
      .then(() => { markBackedUp(); toast('보냈어요. 비밀번호는 말로 따로 알려 주세요'); })
      .catch((e) => { if (e.name !== 'AbortError') toast('보내지 못했어요: ' + e.message); })
      .finally(() => { S.externalUntil = 0; });
  }

  async function importBackup(mode) {
    const file = $('#impFile').files[0];
    const pw = $('#impPw').value;
    S.externalUntil = 0;
    if (!file) { toast('백업 파일을 골라 주세요'); return; }
    if (!pw) { toast('백업 비밀번호를 입력해 주세요'); return; }
    if (file.size > 30e6) { toast('파일이 너무 커요'); return; }
    let entries;
    try {
      let j;
      try { j = JSON.parse(await file.text()); } catch { throw new Error('인계장 백업 파일이 아니에요'); }
      if (!j || j.format !== BACKUP_FORMAT) throw new Error('인계장 백업 파일이 아니에요');
      const iter = Number(j.iter);
      if (!(iter >= 100000 && iter <= 5000000)) throw new Error('파일 형식이 맞지 않아요');
      toast('여는 중…');
      let payload;
      try {
        const key = await deriveKey(pw, fromB64(j.salt), iter);
        payload = await decryptJSON(key, j.iv, j.ct);
      } catch { throw new Error('비밀번호가 맞지 않거나 파일이 손상됐어요'); }
      entries = (Array.isArray(payload.entries) ? payload.entries : []).map(normalizeEntry).filter(Boolean);
    } catch (e) {
      toast(e.message);
      return;
    }
    if (mode === 'replace') {
      if (!(await confirmBox(`지금 기록 ${S.data.entries.length}건을 모두 지우고\n백업의 ${entries.length}건으로 바꿀까요?`, '바꾸기', true))) return;
      S.data.entries = entries;
      await save();
      toast(`백업으로 바꿨어요 (${entries.length}건)`);
    } else {
      const map = new Map(S.data.entries.map((e) => [e.id, e]));
      let added = 0;
      let updated = 0;
      entries.forEach((e) => {
        const cur = map.get(e.id);
        if (!cur) { map.set(e.id, e); added++; } else if (e.updatedAt > cur.updatedAt) { map.set(e.id, e); updated++; }
      });
      S.data.entries = [...map.values()];
      await save();
      toast(`합쳤어요: 새로 ${added}건, 바뀜 ${updated}건`);
    }
    viewSettings();
  }

  async function wipeAll() {
    if (!(await askPin('모든 기록을 지우려면 PIN을 입력하세요.'))) return;
    if (!(await confirmBox('PIN과 모든 인계 기록을 지울까요?\n되돌릴 수 없어요.', '모두 지우기', true))) return;
    await saveChain;
    await kvDel('vault');
    await kvDel('lockout');
    S.vault = null;
    S.key = null;
    S.data = null;
    history.replaceState(null, '', '#/');
    renderLock('모든 기록을 지웠어요');
  }

  // ---------------------------------------------------------------- 길 찾기(화면 전환)
  function route() {
    if (!S.key) return;
    closeModals();
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    switch (name) {
      case 'entry': return viewEntry(arg);
      case 'edit': return viewEdit(arg);
      case 'new': return viewEdit(null, isDate(arg) ? arg : todayStr());
      case 'search': return viewSearch();
      case 'settings': return viewSettings();
      case 'day': if (isDate(arg)) return viewDay(arg);
      // falls through
      default:
        history.replaceState(null, '', `#/day/${todayStr()}`);
        return viewDay(todayStr());
    }
  }

  // ---------------------------------------------------------------- 버튼 동작
  const actions = {
    lock: () => lock(),
    new: () => { location.hash = `#/new/${S.curDate || todayStr()}`; },
    open: (el) => { location.hash = `#/entry/${el.dataset.id}`; },
    goto: (el) => { location.replace(`#/day/${el.dataset.date}`); },
    'pick-day': (el) => {
      if (Date.now() - (S.swiped || 0) < 400) return;
      if (el.dataset.date !== S.curDate) location.replace(`#/day/${el.dataset.date}`);
    },
    month: (el) => {
      const d = parseDate(S.curDate || todayStr());
      location.replace(`#/day/${monthTarget(d.getFullYear(), d.getMonth() + Number(el.dataset.dir))}`);
    },
    'tab-day': (el, ev) => {
      ev.preventDefault();
      const target = `#/day/${todayStr()}`;
      if (location.hash === target) { viewDay(todayStr()); window.scrollTo({ top: 0, behavior: 'smooth' }); } else location.hash = target;
    },
    'copy-day': () => {
      const list = S.data.entries.filter((e) => e.date === S.curDate)
        .sort((a, b) => ((a.ward === '') - (b.ward === '')) || coll.compare(a.ward, b.ward) || sortInGroup(a, b));
      copyWithPin(dayText(S.curDate, list));
    },
    'copy-entry': (el) => { const e = findEntry(el.dataset.id); if (e) copyWithPin(entryText(e)); },
    carry: async (el) => {
      const from = el.dataset.from;
      const to = S.curDate;
      const src = S.data.entries.filter((e) => e.date === from);
      if (!(await confirmBox(`${fmtDate(from)} 인계 ${src.length}건을\n${fmtDate(to)}로 이어받을까요?`, '이어받기'))) return;
      const now = Date.now();
      src.forEach((e) => S.data.entries.push(normalizeEntry({ ...clone(e), id: uid(), date: to, todos: e.todos.filter((t) => !t.done), createdAt: now, updatedAt: now })));
      await save();
      toast(`${src.length}건을 이어받았어요`);
      viewDay(to);
    },
    'copy-to': async (el) => {
      const e = findEntry(el.dataset.id);
      const to = $('#copyDate').value;
      if (!e || !isDate(to)) { toast('날짜를 골라 주세요'); return; }
      const now = Date.now();
      const id = uid();
      S.data.entries.push(normalizeEntry({ ...clone(e), id, date: to, todos: e.todos.filter((t) => !t.done), createdAt: now, updatedAt: now }));
      await save();
      toast(`${fmtDate(to)}로 복사했어요`);
      location.hash = `#/entry/${id}`;
    },
    delete: async (el) => {
      const e = findEntry(el.dataset.id);
      if (!e) return;
      if (!(await confirmBox('이 인계를 지울까요?\n되돌릴 수 없어요.', '지우기', true))) return;
      S.data.entries = S.data.entries.filter((x) => x.id !== e.id);
      await save();
      toast('지웠어요');
      location.replace(`#/day/${e.date}`);
    },
    'add-todo': () => {
      $('#todoList').insertAdjacentHTML('beforeend', todoRow());
      $('#todoList .todo-row:last-child .todo-text').focus();
      scheduleDraft();
    },
    'del-todo': (el) => { el.closest('.todo-row').remove(); scheduleDraft(); },
    'add-tag': (el) => {
      const input = $('#fTags');
      const tags = input.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
      if (!tags.includes(el.dataset.tag)) tags.push(el.dataset.tag);
      input.value = tags.join(', ');
      scheduleDraft();
    },
    'cancel-edit': () => {
      const id = $('#editForm').dataset.id;
      clearDraft();
      location.replace(id ? `#/entry/${id}` : `#/day/${S.curDate || todayStr()}`);
    },
    'discard-draft': () => {
      const id = $('#editForm').dataset.id;
      S.data.draft = null;
      save();
      viewEdit(id || null, id ? undefined : S.curDate);
    },
    install: async () => {
      if (!S.installEvt) return;
      S.installEvt.prompt();
      try { await S.installEvt.userChoice; } catch { /* 취소 */ }
      S.installEvt = null;
      viewSettings();
    },
    'export-save': () => exportSave(),
    'export-share': () => exportShare(),
    'pick-file': () => { S.externalUntil = Date.now() + 120e3; },
    wipe: () => wipeAll()
  };

  app.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || !app.contains(el)) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, ev);
  });
  app.addEventListener('change', async (ev) => {
    const el = ev.target;
    const kind = el.dataset.change;
    if (el.id === 'impFile') S.externalUntil = 0;
    if (!kind) return;
    if (kind === 'pick-month' && /^\d{4}-\d{2}$/.test(el.value)) {
      const [yy, mm] = el.value.split('-').map(Number);
      location.replace(`#/day/${monthTarget(yy, mm - 1)}`);
    }
    if (kind === 'lock-min') {
      S.data.settings.lockMin = Number(el.value);
      save();
      toast('자동 잠금을 바꿨어요');
    }
    if (kind === 'toggle-todo') {
      const e = findEntry(el.dataset.id);
      const t = e?.todos[Number(el.dataset.i)];
      if (!t) return;
      t.done = el.checked;
      e.updatedAt = Date.now();
      el.closest('.todo-view').classList.toggle('done', t.done);
      save();
    }
  });
  app.addEventListener('submit', (ev) => {
    const form = ev.target;
    ev.preventDefault();
    if (form.id === 'editForm') submitEdit();
    else if (form.id === 'pinForm') changePin();
    else if (form.id === 'exportForm') makeBackup();
    else if (form.id === 'importForm') importBackup(ev.submitter?.dataset.mode === 'replace' ? 'replace' : 'merge');
  });
  window.addEventListener('hashchange', route);

  // ---------------------------------------------------------------- 자동 잠금
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((t) => document.addEventListener(t, () => { S.lastActive = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (!S.key || Date.now() < S.externalUntil) return;
    const idleMin = Math.max(1, S.data.settings.lockMin);
    if (Date.now() - S.lastActive > idleMin * 60e3) { lock(); toast('오래 쓰지 않아서 잠갔어요'); }
  }, 10e3);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.body.classList.add('privacy');
      S.hiddenAt = Date.now();
      if (S.key && S.data.settings.lockMin === 0 && Date.now() >= S.externalUntil) lock();
    } else {
      document.body.classList.remove('privacy');
      if (S.key && Date.now() >= S.externalUntil && Date.now() - S.hiddenAt >= S.data.settings.lockMin * 60e3) lock();
      S.lastActive = Date.now();
    }
  });

  // ---------------------------------------------------------------- 설치·업데이트
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; });
  window.addEventListener('appinstalled', () => { S.installEvt = null; toast('설치했어요. 이제 홈 화면 아이콘으로 여세요'); });

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'activated' && hadController) showUpdateBar();
        });
      });
    }).catch(() => { /* 오프라인 등 */ });
  }
  function showUpdateBar() {
    if ($('.update-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = '<span>새 버전이 준비됐어요</span><button type="button" class="btn small">새로고침</button>';
    $('button', bar).addEventListener('click', async () => { if (S.key) await lock(); location.reload(); });
    document.body.appendChild(bar);
  }

  // ---------------------------------------------------------------- 시작
  async function boot() {
    if (!window.isSecureContext || !crypto.subtle || !window.indexedDB) {
      app.innerHTML = '<div class="lock"><div class="lock-box"><h1>인계장</h1><p class="err">이 브라우저에서는 안전하게 저장할 수 없어요.<br>https 주소에서 사파리나 크롬으로 열어 주세요.</p></div></div>';
      return;
    }
    registerSW();
    try {
      S.vault = (await kvGet('vault')) || null;
    } catch (e) {
      app.innerHTML = `<div class="lock"><div class="lock-box"><h1>인계장</h1><p class="err">저장 공간을 열지 못했어요.<br>${esc(e.message)}</p><p class="small muted">사생활 보호(시크릿) 모드에서는 쓸 수 없어요.</p></div></div>`;
      return;
    }
    renderLock();
  }
  boot();
})();
