---
name: handoff-app-release
description: 인계장 PWA(kim-minji)를 고치고 내보내는 순서 — 버전 3곳 올리기, 온톨로지 동기화, 휴대폰 화면 테스트, 결정 기록, PR. "인계장 앱 고쳐", "인계장 기능 추가", "앱 업데이트", "새 버전", "태그 추가", "PR 만들어" 요청 때 사용.
---

# 인계장 앱 고치기·내보내기

## 0. 시작 전
- `docs/HANDOFF.md`와 `metadata/decisions.md`를 읽고 지금 상태를 파악한다.
- 사용자가 고칠 점을 주면 **계획표만** 먼저 보여 준다 (번호, 추천안 표시). "만들어/수정해" 전에는 코드를 고치지 않는다.

## 1. 수정
- 개인정보 규칙(`CLAUDE.md` 절대 규칙)을 어기는 요청이면 이유를 말하고 대안을 제시한다.
- 데이터 칸 추가·변경 → `ontology/context.jsonld`, `ontology/handoff.ttl`, `docs/semantic-view.md` 3번 표, `normalizeEntry`.
- 분류 태그 추가 → `app.js` `TAG_SUGGESTIONS` + `ontology/procedures.jsonld`에 개념(`id`, `prefLabel`, `broader`, `appTag`, `sourcedFrom`; 근거 미확인이면 `sourceStatus`).

## 2. 버전 (세 곳 모두 같은 값)
| 파일 | 위치 |
|---|---|
| `app.js` | `const APP_VERSION = 'x.y.z'` |
| `sw.js` | `const VERSION = 'x.y.z'` |
| `index.html` | `app.css?v=x.y.z`, `app.js?v=x.y.z` |
고친 것만 있으면 z, 기능 추가면 y를 올린다. `metadata/project.jsonld`의 `schema:version`도 맞춘다.

## 3. 테스트
```bash
cd /home/user/kim-minji   # 저장소 폴더
python3 -m http.server 8765 >/dev/null 2>&1 &
node tests/e2e.cjs <스크린샷폴더>   # 휴대폰(iPhone 13) 화면으로 PIN·쓰기·복사·검색·백업·가져오기·이어쓰기
node tests/check-vocab.cjs          # 태그 ↔ 온톨로지 일치
```
- 새 기능은 `tests/e2e.cjs`에 확인 단계를 더한다.
- 스크린샷을 직접 열어 보고, 사용자에게 보여 줄 때는 "휴대폰 화면으로 확인했다"는 근거를 말한다.

## 4. 기록
- `metadata/decisions.md`에 ADR 한 줄 추가.
- `docs/HANDOFF.md`의 「지금 위치」「다음 순서」 갱신.

## 5. 올리기
- `main`이 아니라 작업 브랜치에 커밋 → `main`으로 PR. PR 본문에 바뀐 점·테스트 결과·휴대폰에서 확인할 점을 표로.
- 합친 뒤 휴대폰에서는 앱을 완전히 닫았다가 다시 열면 「새 버전이 준비됐어요」가 뜬다.
