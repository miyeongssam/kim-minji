# kim-minji — 인계장 PWA

충북대병원 인턴(김민지)용 인계장 앱. 관리자: miyeongssam(최미영). 답은 한국어, 쉬운 말로.

## 절대 규칙
- 인계 기록은 **휴대폰 IndexedDB 안에만**, PIN 키로 암호화해서 저장한다. 서버·구글 시트·드라이브·노션·분석 도구·외부 CDN 연결을 추가하지 않는다. (`index.html`의 CSP가 외부 스크립트를 막는다 — 풀지 않는다)
- 환자 이름·등록번호·생년월일·사진 칸을 만들지 않는다 (`hos:ProhibitedField`).
- 실제 인계 내용, 실제 백업 파일, 개인 연락처를 저장소에 커밋하지 않는다. 테스트는 가짜 기록만.
- 백업은 비밀번호 없이는 만들거나 열 수 없어야 한다. 글로 복사는 PIN 재확인 후에만.
- 사용자(민지·미영쌤)가 "만들어", "수정해", "시작해"라고 하기 전에는 계획만 보여 준다. 선택지는 번호와 추천안 표시.

## 파일 지도
| 파일 | 역할 |
|---|---|
| `index.html` | 시작 화면, CSP, 파일 버전(`?v=`) |
| `app.js` | 암호화·잠금·화면·백업 전부. 맨 위 `APP_VERSION`, `TAG_SUGGESTIONS` |
| `app.css` | 화면 모양(밝은/어두운) |
| `sw.js` | 앱 파일 오프라인 캐시(`VERSION`). 기록은 다루지 않음 |
| `ontology/` | 의미 모델: `handoff.ttl`(OWL), `procedures.jsonld`(술기 SKOS), `context.jsonld`(앱 칸↔개념) |
| `metadata/` | `project.jsonld`(프로젝트·근거 자료), `decisions.md`(결정 기록) |
| `docs/` | `HANDOFF.md`(다음 할 일), `semantic-view.md`(의미 지도), `guide-for-minji.md`(안내문) |
| `data/holidays-kr.json` | 공휴일 자료(근거 포함). `app.js` `HOLIDAYS`와 같아야 함 |
| `tests/` | `e2e.cjs`(휴대폰 화면 전체 흐름·달력), `check-vocab.cjs`(태그↔온톨로지, 공휴일↔자료 파일 일치) |

## 해마다 할 일
- 매년 6월 말 우주항공청이 다음 해 월력요항을 발표하면 `app.js` `HOLIDAYS`·`HOLIDAY_YEARS`와 `data/holidays-kr.json`에 다음 해 공휴일을 추가한다. 날짜는 공식 발표로 확인하고 지어내지 않는다. 임시공휴일이 새로 지정되면 그때 추가.

## 바꿀 때 순서
1. 계획을 보여 주고 허락받기.
2. 코드 수정. 데이터 칸을 바꾸면 `ontology/context.jsonld`·`handoff.ttl`·`docs/semantic-view.md` 표도 같이. 태그를 바꾸면 `app.js`의 `TAG_SUGGESTIONS`와 `procedures.jsonld`의 `appTag`를 같이.
3. 버전을 세 곳에서 똑같이 올리기: `app.js` `APP_VERSION`, `sw.js` `VERSION`, `index.html`의 `?v=` 두 개. (안 올리면 휴대폰에 옛 화면이 남는다)
4. 저장된 데이터 모양이 바뀌면 `normalizeData`/`normalizeEntry`가 옛 데이터를 읽을 수 있게 한다. 옛 백업 파일도 열려야 한다.
5. 테스트: 저장소 폴더에서 `python3 -m http.server 8765 &` → `node tests/e2e.cjs` → `node tests/check-vocab.cjs`. 둘 다 통과해야 한다.
6. `metadata/decisions.md`에 결정 추가, `docs/HANDOFF.md` 갱신, `metadata/project.jsonld` 버전 갱신.
7. 브랜치에 커밋 → `main`으로 PR. 합치면 GitHub Pages(`main` / root)가 자동 배포.
8. PR을 만들면 사용자에게 답할 때 **맨 위 첫 줄에 누를 수 있는 PR 주소**(`https://github.com/miyeongssam/kim-minji/pull/번호`)를 준다. "PR #3"처럼 번호만 말하지 않는다.

## 기록 규칙 (AI 레디, 매 작업 끝날 때 반드시)
작업이 하나 끝나면 아래 4곳을 같은 내용으로 함께 고친다. 사용자가 따로 말하지 않아도 한다.
| 파일 | 적는 것 |
|---|---|
| `docs/worklog.md` | 사람용 작업 표 한 줄 (번호·날짜·작업·한 사람·결과·커밋/PR·관련 결정) |
| `metadata/worklog.jsonld` | 같은 작업을 `prov:Activity` 하나로 (used·generated·after·decisions) |
| `docs/HANDOFF.md` | 「지금 위치」「다음 순서」 |
| `metadata/decisions.md` | 새로 정한 것이 있을 때 ADR 한 줄 |
배포·버전이 바뀌면 `metadata/project.jsonld`도. 개념·칸이 바뀌면 `ontology/`도. 실제 인계 내용·개인 연락처·이메일은 어디에도 적지 않는다.

자세한 단계는 `.claude/skills/handoff-app-release/SKILL.md`.
