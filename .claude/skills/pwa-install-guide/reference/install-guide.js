/*
 * PWA 홈 화면 설치 안내 (재사용 모듈, 프레임워크 없음, 외부 연결 없음)
 * 출처: kim-minji(인계장) 1.2.0 app.js의 설치 안내 부분을 떼어 낸 것.
 *
 * 쓰는 법:
 *   <link rel="stylesheet" href="install-guide.css">
 *   <script src="install-guide.js"></script>
 *   <script>InstallGuide.init({ appName: '앱이름', bottomOffset: 0 });</script>
 *   설정 화면 버튼에서는 InstallGuide.help(), 상태는 InstallGuide.state()
 */
(function () {
  'use strict';
  const UA = navigator.userAgent;
  const APP_URL = location.origin + location.pathname;
  const IN_APP = [[/KAKAOTALK/i, '카카오톡'], [/Slack/i, '슬랙'], [/NAVER\(inapp/i, '네이버 앱'], [/Instagram/i, '인스타그램'],
    [/FBAN|FBAV|FB_IAB/i, '페이스북'], [/\bLine\//i, '라인'], [/BAND\//i, '밴드'], [/DaumApps/i, '다음 앱'], [/Telegram/i, '텔레그램'], [/everytimeApp/i, '에브리타임']];
  const opt = { appName: '앱', closeOnce: true };
  let deferred = null;
  let closed = false;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function state() {
    if (isStandalone()) return { kind: 'app' };
    const ios = isIOS();
    const android = /Android/i.test(UA);
    if (!ios && !android) return { kind: 'desktop' };
    const hit = IN_APP.find(([re]) => re.test(UA));
    if (hit) return { kind: 'inapp', name: hit[1], ios, android, kakao: /KAKAOTALK/i.test(UA) };
    if (ios) {
      if (/CriOS|FxiOS|EdgiOS|OPiOS|Whale/i.test(UA)) return { kind: 'other', name: '다른 브라우저', ios };
      if (!/Safari\//.test(UA)) return { kind: 'inapp', name: '앱 안 화면', ios };
      return { kind: 'safari', ios };
    }
    if (/; wv\)/.test(UA)) return { kind: 'inapp', name: '앱 안 화면', android };
    const other = UA.match(/SamsungBrowser|EdgA|OPR|Whale|YaBrowser|Firefox|UCBrowser|MiuiBrowser|HuaweiBrowser/i);
    if (other || !/Chrome\//.test(UA)) return { kind: 'other', name: other && /Samsung/i.test(other[0]) ? '삼성 인터넷' : '다른 브라우저', android };
    return { kind: 'chrome', android };
  }

  function modal(inner, onMount) {
    const wrap = document.createElement('div');
    wrap.className = 'ig-wrap';
    wrap.innerHTML = `<div class="ig-modal" role="dialog" aria-modal="true">${inner}</div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-ig=close]')) close(); });
    if (onMount) onMount(wrap, close);
  }
  const okBtn = '<div class="ig-btns"><button type="button" class="ig-btn ig-primary" data-ig="close">알겠어요</button></div>';
  function androidGuide() {
    modal(`<h2>📲 안드로이드에서 앱으로 설치하기</h2>
      <ol class="ig-steps"><li>크롬 오른쪽 위 <b>⋮</b>(점 세 개)를 누르세요</li><li><b>「앱 설치」</b> 또는 <b>「홈 화면에 추가 → 설치」</b>를 누르세요</li><li>홈 화면에 생긴 <b>${esc(opt.appName)}</b> 아이콘으로 여세요</li></ol>
      <div class="ig-note">「바로가기 만들기」는 고르지 마세요. 앱이 아니라 크롬 안에서 열리는 바로가기예요.</div>
      <p class="ig-small">"이미 설치되어 있다"는데 앱 목록에 없으면: 휴대폰 설정 → 애플리케이션에서 「${esc(opt.appName)}」을 지우고, 크롬을 완전히 닫았다가 다시 해 보세요.</p>${okBtn}`);
  }
  function iosGuide() {
    modal(`<h2>📲 아이폰에서 앱으로 설치하기</h2>
      <ol class="ig-steps"><li>화면 아래 가운데 <b>공유 버튼(□↑)</b>을 누르세요</li><li>메뉴를 내려 <b>「홈 화면에 추가」</b> → <b>추가</b>를 누르세요</li><li>홈 화면에 생긴 <b>${esc(opt.appName)}</b> 아이콘으로 여세요</li></ol>
      <div class="ig-note">사파리에서만 돼요. 사파리에서 적은 내용은 설치한 앱으로 옮겨지지 않으니, 설치한 앱에서 시작하세요.</div>${okBtn}`);
  }
  function openInBrowserGuide(st) {
    const target = st.ios ? '사파리' : '크롬';
    modal(`<h2>⚠️ 이 화면에서는 설치가 안 돼요</h2>
      <p>지금 <b>${esc(st.name || '다른 화면')}</b>에서 열려 있어요. <b>${target}</b>에서 열어야 설치돼요.</p>
      ${st.android ? '<button type="button" class="ig-btn ig-primary ig-block" data-open="chrome">크롬으로 열기</button>' : ''}
      ${st.ios && st.kakao ? '<button type="button" class="ig-btn ig-primary ig-block" data-open="kakao">사파리로 열기</button>' : ''}
      <input class="ig-input" id="igUrl" readonly value="${esc(APP_URL)}" aria-label="앱 주소">
      <button type="button" class="ig-btn ig-block" data-copy>📋 주소 복사</button>
      <p class="ig-small">버튼이 안 되면: 주소를 복사해서 <b>${target} 주소창</b>에 붙여넣고 여세요.</p>
      <div class="ig-btns"><button type="button" class="ig-btn" data-ig="close">닫기</button></div>`, (w) => {
      w.addEventListener('click', async (e) => {
        const o = e.target.closest('[data-open]');
        if (o && o.dataset.open === 'chrome') location.href = `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(APP_URL)};end`;
        if (o && o.dataset.open === 'kakao') location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(APP_URL)}`;
        if (e.target.closest('[data-copy]')) {
          let ok = false;
          try { await navigator.clipboard.writeText(APP_URL); ok = true; } catch { const i = w.querySelector('#igUrl'); i.select(); ok = document.execCommand('copy'); }
          e.target.closest('[data-copy]').textContent = ok ? `복사했어요. ${target} 주소창에 붙여넣으세요` : '주소를 길게 눌러 직접 복사하세요';
        }
      });
    });
  }

  async function help() {
    const st = state();
    if (st.kind === 'app' || st.kind === 'desktop') return;
    if (st.kind === 'chrome' && deferred) {
      const evt = deferred;
      deferred = null;
      evt.prompt();
      try { await evt.userChoice; } catch { /* 취소 */ }
      return;
    }
    if (st.kind === 'chrome') return androidGuide();
    if (st.kind === 'safari') return iosGuide();
    return openInBrowserGuide(st);
  }

  function updateBar() {
    const st = state();
    const show = !['app', 'desktop'].includes(st.kind) && !closed;
    document.body.classList.toggle('ig-on', show);
    let bar = document.getElementById('igBar');
    if (!show) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'igBar';
      bar.className = 'ig-bar';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', '앱 설치 안내');
      bar.addEventListener('click', (e) => {
        if (e.target.closest('[data-ig=x]')) { closed = true; updateBar(); } else if (e.target.closest('[data-ig=go]')) help();
      });
      document.body.appendChild(bar);
    }
    const ok = st.kind === 'chrome' || st.kind === 'safari';
    bar.classList.toggle('ig-warn', !ok);
    bar.innerHTML = `<button type="button" class="ig-go" data-ig="go">${ok ? '📲 홈 화면에 앱으로 설치' : `⚠️ ${st.ios ? '사파리' : '크롬'}에서 열어야 설치돼요`}</button><button type="button" class="ig-x" data-ig="x" aria-label="이번에만 닫기">✕</button>`;
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { deferred = null; closed = true; updateBar(); });

  window.InstallGuide = {
    init(o) { Object.assign(opt, o || {}); if (opt.bottomOffset) document.documentElement.style.setProperty('--ig-bottom', opt.bottomOffset + 'px'); updateBar(); },
    state, help, updateBar,
    url: APP_URL
  };
})();
