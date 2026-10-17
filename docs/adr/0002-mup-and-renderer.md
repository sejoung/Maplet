# ADR 0002: 버전 보존 MUP 어댑터와 SVG 렌더러

- 상태: 채택, 사용자 실파일 검증 대기
- 날짜: 2026-10-17

## 조사

[공식 데이터 포맷](https://github.com/mindmup/mapjs/wiki/Data-Format)은 v1/v2 단일 루트와 v3 다중 루트 aggregate를 구분하며, signed numeric rank로 좌우와 순서를 나타낸다. [MapJS](https://github.com/mindmup/mapjs)는 MIT 라이선스이며 2019년 archive 되었고 jQuery/Underscore/Hotkeys/Hammer 통합을 포함한다. 소스·의존성 조사로 레거시 런타임 비용을 확인했다. MapJS 브라우저 실행 PoC를 완료했다고 주장하지 않는다.

## 결정

신규 React 앱에 MapJS를 이식하는 대신 순수 TypeScript 양방향 트리 레이아웃 + SVG 연결선 + HTML 노드를 사용한다. 레이아웃을 독립 단위 테스트하고 어댑터가 렌더러와 무관하게 원본 포맷을 보존하도록 한다. v3 다중 루트는 각각 독립 트리로 표시한다.

id의 원래 타입, rank 문자열, 알 수 없는 필드, attr/style/attachment/links/위치·리소스 데이터를 JSON 값으로 보존한다. 알려진 필드만 편집 시 덮어쓴다. 지원하지 않는 첨부/교차 링크는 삭제하지 않으며 렌더링 제한을 안내한다. 원본 문자열을 별도 다운로드할 수 있다.

입력 한도: 10MiB, 5,000 노드, 깊이 100, 제목 10,000자. JSON 유효성·중복 ID·잘못된 rank·객체 재참조·스키마를 검사한다. HTML은 실행하지 않고 외부 URL은 http/https/mailto만 허용한다.

## 검증과 한계

공식 포맷을 기준으로 직접 만든 익명 fixture로 v1/v2/v3/메타데이터/대형 트리를 검증한다. 제공된 실제 사용자 파일은 아직 없으므로 완전한 MindMup 호환성은 보장하지 않는다. `docs/compatibility.md`에 범위를 공개한다.
