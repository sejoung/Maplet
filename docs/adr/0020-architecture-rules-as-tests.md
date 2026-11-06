# ADR 0020: 아키텍처 규칙을 테스트로 강제

- 상태: 채택
- 날짜: 2026-11-06
- 관련: [ADR 0001](0001-layered-local-first.md)의 계층과 강제 방법

## 배경

ADR 0001의 계층 규칙과 순환 참조 검사는 직접 만든 AST 검사기(`tests/architecture/rules.ts`)가 맡았다. 이 검사기는 import 그래프 수집, 경로 해석, 순환 탐지, 계층 판정을 모두 직접 구현했다. 그래서 고아 파일(아무도 import하지 않는 죽은 코드), 해석되지 않는 import, 개발 의존성의 운영 코드 유입처럼 흔한 규칙을 추가할 때마다 검사기 자체를 키워야 했다. 계층 표도 검사기 코드 안에 있어 사람이 읽을 보고서나 의존 그래프를 따로 볼 수 없었다. 전체 코드 리뷰에서 계층 경계 안쪽의 설계 문제(어댑터를 아무 곳에서나 생성, 순수 계층 밖의 훅 등)도 지적되어, 이를 회귀 테스트로 막을 장치가 필요했다.

## 결정

- 모듈 단위 규칙은 [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)(ArchUnit 계열의 TypeScript 의존성 규칙 도구)로 옮긴다. 규칙은 `.dependency-cruiser.cjs` 한 곳에 둔다.
  - 계층별 허용 의존(ADR 0001), 계층별 허용 npm 패키지(순수 계층은 없음), 순환 참조 금지, 고아 파일 금지(`main.tsx` 제외), 테스트·개발 의존성 import 금지, 해석되지 않는 import 금지.
  - 계층 표와 패키지 표는 `scripts/architecture.cjs`에 두고 설정과 테스트가 함께 읽는다. 표를 바꾸면 규칙과 증명 테스트가 같이 바뀐다.
  - 모든 레이어로 갈 수 있는 `app`처럼 절대 위반될 수 없는 규칙은 만들지 않는다.
- 문법 트리가 필요한 코드 수준 규칙은 `tests/architecture/code-rules.ts`의 순수 함수로 둔다.
  - 순수 계층(domain·application·engine)의 브라우저 전역 사용 금지, 리터럴이 아닌 동적 import 금지.
  - 상태를 가진 어댑터 클래스(adapters에서 export하고 상속이 없는 클래스)는 조립 지점(`main.tsx`, `app/drive/driveConnection.ts`)에서만 생성한다. 나머지 코드는 전달받은 객체에 의존한다(DIP).
  - `use…` 훅은 React가 도는 계층(components·app, `i18n/react.ts`)에서만 선언한다.
- 두 종류 모두 Vitest(`tests/architecture/architecture.test.ts`)에서 실행해 `npm run verify`에 포함한다. 각 규칙이 실제로 위반을 잡는지 증명한다.
  - 모듈 규칙: 테스트가 저장소 안 임시 폴더에 모든 규칙을 한 번씩 어기는 프로젝트를 생성하고, 설정된 규칙 이름 전체가 위반으로 보고되는지 확인한다. 레이어를 추가하면 위반 사례도 자동으로 생성된다.
  - 코드 규칙: 위반 예제 문자열을 검사기에 넣어 기대한 위반 목록과 비교한다.
- 사람이 읽는 보고서는 `npm run arch`, 계층 단위 의존 그래프는 `npm run arch:graph`(Mermaid)로 본다.

## 결과

새 설계 규칙은 설정 한 줄 또는 순수 함수 한 곳으로 추가한다. 기존 자체 검사기의 그래프 수집·순환 탐지 코드는 삭제했다. 리팩터링으로 생긴 고아 파일과 잘못된 방향의 의존은 테스트에서 바로 실패한다. dependency-cruiser는 개발 의존성 하나로 추가되며 운영 번들에는 포함되지 않는다.
