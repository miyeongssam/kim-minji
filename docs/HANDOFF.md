# 작업 인계 메모 (다음 대화에서 이어가기)

> 새 대화를 시작하면 Claude에게 "docs/HANDOFF.md 읽고 이어서 하자"라고 말하면 돼요.
> 지난 작업 전체는 [`docs/worklog.md`](worklog.md), 결정 이유는 [`metadata/decisions.md`](../metadata/decisions.md).

## 지금 위치 (2026-10-16, 작업 004 끝)

| 번호 | 항목 | 상태 |
|---|---|---|
| 1 | 인계장 PWA 1.0.0 | `main`에 합침 (`13c5bc4`) |
| 2 | GitHub Pages | 켜짐: `main` / `(root)`, HTTPS 켜짐, 커스텀 도메인 없음 |
| 3 | 사이트 열림 확인 | **아직**: 휴대폰에서 주소를 열어 확인해야 함 (Claude 작업 환경에서는 github.io에 접속이 막혀 있음) |
| 4 | 기록 정리 PR #2 | 만듦. 합치기 기다리는 중 (앱 동작은 바뀌지 않음) |
| 5 | 온톨로지·메타데이터 | `ontology/`, `metadata/`(+ `worklog.jsonld`), `docs/semantic-view.md` |
| 6 | 민지 안내문 | `docs/guide-for-minji.md` 완성, 보낼 차례 |

## 다음 순서

| 번호 | 할 일 | 누가 |
|---|---|---|
| 1 | PR #2 합치기 | 미영쌤 |
| 2 | 휴대폰에서 https://miyeongssam.github.io/kim-minji/ 열기 → 잠금 화면이 뜨는지 확인 → 결과를 Claude에게 알려 주기 | 미영쌤 |
| 3 | 민지에게 안내문(`docs/guide-for-minji.md`) 보내기 | 미영쌤 |
| 4 | 설치 → PIN 정하기 → 가짜 기록으로 연습 → 백업 한 번 해 보기 | 민지 |
| 5 | 써 보고 고칠 점을 모아서 한 번에 전달 | 민지 → Claude |
| 6 | (보류) 인턴 술기 시뮬레이션 게임: 내과 인계장 Word를 「Google 문서로 저장」, 시술부위 PDF를 대화창에 첨부 | 미영쌤 → Claude |

## 시뮬레이션 게임 메모 (보류 중인 요청 원문 요약)

| 번호 | 자료 | 게임으로 만들 것 |
|---|---|---|
| 1 | IM 내과인계장 | 사망선언·기록, radial/femoral ABGA(검체 송부까지), C-line culture, chemoport needle change, line remove, Hickman lab·line 교체, 항암제 연결, PCPS 이후 끝까지 시나리오 |
| 2 | 인턴장 발표자료 | 용품 사진 참고해 물품 고르기 구현 (마지막 장 개인 연락처는 쓰지 않음) |
| 3 | 수술 시술부위 표시 매뉴얼 | 수술명 보고 인체 그림에 직접 표시, 틀리면 혼나는 방식 |

## 고칠 때 꼭 할 것

`CLAUDE.md`의 「바꿀 때 순서」와 「기록 규칙」을 따르세요 (버전 3곳 → 테스트 2개 → 기록 4곳 → PR).
