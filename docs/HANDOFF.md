# 작업 인계 메모 (다음 대화에서 이어가기)

> 새 대화를 시작하면 Claude에게 "docs/HANDOFF.md 읽고 이어서 하자"라고 말하면 돼요.
> 지난 작업 전체는 [`docs/worklog.md`](worklog.md), 결정 이유는 [`metadata/decisions.md`](../metadata/decisions.md).

## 지금 위치 (2026-10-16, 작업 015 끝)

> 대화 전체 요약은 [`docs/conversation-handoff-20261016.md`](conversation-handoff-20261016.md)

| 번호 | 항목 | 상태 |
|---|---|---|
| 1 | 앱 1.2.2 | 배포됨(`160241f`). 미영쌤 안드로이드에 홈 화면 앱으로 설치됨 |
| 2 | 저장 모양 | vault v2 (DEK + PIN·복구 코드로 감싸기) |
| 3 | 재사용 스킬 | `pwa-install-guide` 저장소에 있고 Claude 설정에도 올림 |
| 4 | GitHub Pages | `main` / `(root)`, HTTPS 켜짐, 커스텀 도메인 없음 |
| 5 | 안내문·공지 | `docs/guide-for-minji.md`, `docs/slack-announcement.md` 완성, 보낼 차례 |

## 다음 순서

| 번호 | 할 일 | 누가 |
|---|---|---|
| 1 | 휴대폰 앱 새로고침 → PIN 정하기 → 복구 코드 종이에 적기 | 미영쌤 |
| 2 | 슬랙 공지, 민지에게 안내문 보내기 | 미영쌤 |
| 3 | 민지가 써 보고 고칠 점 모아서 전달 | 민지 → Claude |
| 4 | (보류) 인턴 술기 시뮬레이션 게임: 내과 인계장 Word를 「Google 문서로 저장」, 시술부위 PDF·물품 사진 첨부 | 미영쌤 → Claude |
| 5 | (2027년 6월 말) 2028년 공휴일 추가 | Claude |
| 6 | (선택) 아래 탭 달력 아이콘(📅)이 늘 17일로 보이는 것 → 오늘 날짜 아이콘으로 | 요청 시 |

## 시뮬레이션 게임 메모 (보류 중인 요청 원문 요약)

| 번호 | 자료 | 게임으로 만들 것 |
|---|---|---|
| 1 | IM 내과인계장 | 사망선언·기록, radial/femoral ABGA(검체 송부까지), C-line culture, chemoport needle change, line remove, Hickman lab·line 교체, 항암제 연결, PCPS 이후 끝까지 시나리오 |
| 2 | 인턴장 발표자료 | 용품 사진 참고해 물품 고르기 구현 (마지막 장 개인 연락처는 쓰지 않음) |
| 3 | 수술 시술부위 표시 매뉴얼 | 수술명 보고 인체 그림에 직접 표시, 틀리면 혼나는 방식 |

## 고칠 때 꼭 할 것

`CLAUDE.md`의 「바꿀 때 순서」와 「기록 규칙」을 따르세요 (버전 3곳 → 테스트 2개 → 기록 4곳 → PR).
