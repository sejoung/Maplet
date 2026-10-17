# 개발과 검증

Node.js 24 LTS를 권장한다. 운영 코드 `src`, 테스트 `tests`, 설계 `docs`를 분리한다.

```sh
npm ci
npm run dev
```

```sh
npm run lint
npm run typecheck
npm test
npm run test:architecture
npm run test:coverage
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

`npm run verify`는 포맷 → lint → 타입 → 단위/통합/아키텍처 및 커버리지 → 빌드를 순서대로 실행한다. E2E는 별도 브라우저가 필요하므로 독립 명령으로 운영한다. CI는 둘 다 수행한다. 문장 85%, 분기 75%, 함수 90%, 줄 85% 미만이면 실패한다. 외부 Google SDK 브리지의 실제 동작은 실 Cloud 환경에서 추가 검증한다. [구현 범위와 검증 기록](verification.md)을 함께 관리한다.

## 테스트 결과

위 npm 명령은 매번 `test-results/2026-10-17T14-41-40-254Z-unit-고유값/`처럼 UTC 시각·테스트 종류·고유값으로 별도 폴더를 만든다. 같은 시각에 병렬 실행해도 겹치지 않고 이전 결과는 보존한다. `npm run verify`의 테스트 결과 종류는 coverage다.

```text
test-results/
  <UTC 시각>-unit-<고유값>/
    summary.json       # 실행 명령, 상태, 시각, 소요 시간, 종료 코드
    run.log            # stdout + stderr
    results.json
    junit.xml
  <UTC 시각>-coverage-<고유값>/
    coverage/          # index.html 및 커버리지 원본
    ...
  <UTC 시각>-e2e-<고유값>/
    html/index.html
    artifacts/         # 실패 시 trace.zip 등
    ...
  latest -> 가장 최근에 종료된 실행 폴더
  latest-unit -> 가장 최근 unit 실행 폴더
  latest-coverage -> 가장 최근 coverage 실행 폴더
  latest-e2e -> 가장 최근 e2e 실행 폴더
```

architecture·watch도 같은 규칙으로 링크를 만든다. `latest`에는 실패·정상 중단도 포함하므로 `summary.json`의 status를 확인한다. 실행 중에는 앞선 완료 결과를 가리키고 종료 후 링크를 원자적으로 교체한다. watch는 한 세션이 한 폴더이며 세션 종료 후 링크를 갱신한다. 이력은 자동 삭제하지 않고 결과와 링크 모두 Git에서 제외한다. CI는 성공·실패 결과를 artifact로 보관한다.

필터와 도구 옵션은 npm 뒤에 전달한다. 시간별 이력이 필요하면 직접 `npx vitest`/`npx playwright test` 대신 다음 명령을 사용한다. 직접 실행은 `test-results/unmanaged/`에 고정 출력한다.

```sh
npm test -- tests/unit/positions.test.ts
npm run test:e2e -- --project=chromium
npx playwright show-report test-results/latest-e2e/html
```

최근 실행 정보는 `test-results/latest/summary.json`, 커버리지 화면은 `test-results/latest-coverage/coverage/index.html`에서 확인한다. [ADR 0006](adr/0006-test-run-artifacts.md)에 저장 정책을 기록한다.

## TDD 변경 절차

코드 파일은 빈 줄·주석을 포함해 최대 400줄이다. TypeScript·TSX·JavaScript·MJS는 ESLint `max-lines`로, `src/**/*.css`는 별도 줄 수 검사로 `npm run lint`에서 강제한다. 운영·테스트·스크립트·설정 파일에 같은 기준을 적용하고 문서·fixture·생성 결과는 제외한다. 초과하면 책임별로 모듈을 분리하며 줄 압축이나 예외 설정으로 우회하지 않는다. [ADR 0007](adr/0007-file-size-limit.md)을 참고한다.

1. 수용 기준을 `tests/unit`, `tests/integration` 또는 `tests/e2e`에서 실패하는 테스트로 먼저 작성한다.
2. 대상 테스트의 실패 원인이 의도한 미구현/회귀인지 확인한다.
3. 필요한 최소 운영 코드를 작성하고 대상 테스트를 통과시킨다.
4. 구조를 정리하고 `npm run verify` 및 관련 E2E를 통과시킨다.
5. 구조·포맷·저장 정책 변경은 새 ADR에 배경/결정/결과를 기록한다.

테스트 옆에 운영 코드를 두거나 src에서 테스트를 import하지 않는다. 도메인은 React/DOM/저장소를 참조하지 않는다. `tests/architecture/rules.ts`는 TypeScript AST로 import/export/동적 import 경로를 읽고 계층과 순환 참조를 검사한다. 규칙 검사기가 위반을 놓치지 않는지 고의 위반 그래프로 자체 검증한다. ESLint 접근성/Hook 규칙과 HTML 직접 삽입 금지도 필수다. React Compiler는 사용하지 않으므로 compiler 전용 lint 규칙 대신 Hook 사용·의존성 규칙을 적용한다.

## GitHub Pages

Vite base는 상대 경로여서 저장소 하위 경로에서도 자산을 찾는다. `.github/workflows/ci.yml`은 PR/push 품질 관문이다. 저장소 Settings → Pages → Source를 GitHub Actions로 선택하고 `Pages` workflow를 수동 실행하면 검증된 빌드를 배포한다. 외부 배포나 Google 프로젝트 생성은 로컬 코드 작업과 별도의 운영 작업이다. OAuth 설정은 Pages workflow의 저장소 Variables에 공개 값으로 등록한다.
