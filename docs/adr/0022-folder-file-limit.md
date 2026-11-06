# ADR 0022: 폴더당 파일 10개 제한

- 상태: 채택
- 날짜: 2026-11-06
- 관련: [ADR 0007](0007-file-size-limit.md)의 파일당 400줄 제한, [ADR 0021](0021-layer-responsibilities.md)

## 배경

계층별 책임을 정리하며 큰 파일을 나누자 파일 수가 늘었다. `src/components`에 70개, `tests/unit`에 65개 파일이 한 폴더에 쌓여, 이름만으로 원하는 파일을 찾기 어려웠다. 사용자는 파일당 줄 수 제한과 함께 폴더에 파일이 10개를 넘으면 하위 폴더로 나누기를 요청했다.

## 결정

- 코드 폴더(`src`, `tests`, `scripts`)의 각 폴더에는 파일을 10개까지 직접 둔다. 11개부터 `npm run lint`가 실패한다. 하위 폴더와 숨김 파일(`.DS_Store` 등)은 세지 않는다.
- 검사는 `scripts/check-limits.mjs`가 맡는다. 같은 스크립트가 CSS의 400줄 제한도 검사한다.
- 문서(`docs/adr`의 번호 매긴 기록)와 이미지 자산(`public/manual/images`)은 순서대로 쌓는 평평한 목록이 목적이라 대상에서 뺀다.
- 하위 폴더는 이름이 아니라 주제로 나눈다. 레이어 경계(ADR 0001)는 `src` 바로 아래 폴더로 유지하므로 하위 폴더는 레이어 안에서만 만든다.
  - components: `canvas`(`view`·`gestures`·`node`), `rich-text`(`format`), `editor`(`find`), `menus`, `dialogs`(`node-tools`), `drive`, `shared`
  - app: `drive`(`auth`·`state`), `document`, `drafts`
  - domain: `commands`, `merge`, `style`, `rich-text`, `util`
  - engine: `layout` / adapters: `files`, `storage`, `drive` 등
- 테스트는 `src`의 레이어 구조를 따라 둔다(`tests/unit/domain/merge`, `tests/integration/app` 등). E2E는 기능별로 둔다(`drive`, `editing`, `layout`, `app`).

## 결과

파일을 옮겨도 레이어 규칙과 순환 참조 검사(ADR 0020)가 그대로 적용된다. 파일을 하나 추가해 폴더가 11개가 되면 린트가 실패해 하위 폴더를 만들게 한다. 경계 조건(10개 허용, 11개 거절, 하위 폴더·숨김 파일 제외)은 테스트로 검증한다.
