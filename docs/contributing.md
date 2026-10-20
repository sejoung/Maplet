# 개발과 검증

Node.js 24 LTS를 권장한다. 운영 코드 `src`, 테스트 `tests`, 설계 `docs`를 분리한다. 공식 지원 브라우저는 데스크톱 Google Chrome이다. 자동 E2E는 Chromium으로 실행하며 Firefox·Safari·모바일은 지원 범위에서 제외한다. 지원 대상 변경은 [ADR 0012](adr/0012-desktop-chrome-support.md)를 따른다.

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
npx playwright install chromium
npm run test:e2e
```

`npm run verify`는 포맷 → lint → 타입 → 단위/통합/아키텍처 및 커버리지 → 빌드를 순서대로 실행한다. E2E는 별도 브라우저가 필요하므로 독립 명령으로 운영한다. CI는 둘 다 수행한다. 문장 85%, 분기 75%, 함수 90%, 줄 85% 미만이면 실패한다. 외부 Google SDK 브리지의 실제 동작은 실 Cloud 환경에서 추가 검증한다. [구현 범위와 검증 기록](verification.md)을 함께 관리한다.

Vitest는 기본적으로 Node 환경에서 실행한다. CI에서는 단위·통합·아키텍처·커버리지 테스트의 worker도 최대 2개로 제한한다. DOM·브라우저 저장소·React가 필요한 테스트 파일에는 첫 줄에 `// @vitest-environment jsdom`을 지정한다. DOM matcher와 React cleanup은 이 환경에서만 불러오며, IndexedDB 모방은 사용하는 테스트에서 직접 import한다. Node의 실험적 Web Storage는 테스트 worker에서 꺼서 jsdom 저장소와 충돌하지 않게 한다.

드래그·크기 조절의 좌표·충돌·배율·너비 경계 조합은 단위 테스트와 jsdom의 실제 Canvas/Hook 통합 테스트로 검증한다. 통합 테스트에서는 글꼴 측정과 포인터 캡처를 테스트 더블로 제공한다. 실제 포인터 입력·취소·연결선·Undo/Redo·초안 및 파일 저장 흐름은 데스크톱 Chromium의 대표 E2E로 유지한다. 같은 문서에서 독립적으로 복구 가능한 취소 방식은 `test.step`으로 묶어 파일 가져오기를 반복하지 않는다. 가지 간격 입력 픽스처는 `tests/support/drag-fixture.ts`를 단위·통합·E2E가 공유한다.

E2E는 실행마다 `scripts/serve-e2e.mjs`로 앱을 한 번 빌드한 뒤 Vite preview로 제공한다. 페이지마다 개발 서버의 소스 모듈을 다시 읽는 비용을 줄이고 배포용 번들을 검증한다. 빌드는 해당 실행의 `site/`에 저장해 기존 `dist/`와 분리하며, 4173 포트의 기존 서버를 재사용하지 않으므로 테스트 시작 전 이 포트를 비워 둔다. 공식 지원 대상인 데스크톱 Chrome을 Chromium으로 검증하며 실패 trace·결과 reporter를 유지한다. Firefox·WebKit·모바일 프로젝트는 실행하지 않는다. 전체 worker 상한은 로컬 CPU의 75%, 프로젝트별 상한은 CPU의 25%다. 8코어에서는 전체 6개·프로젝트당 2개로 Drive 계약·Drive 상태·편집 UI 프로젝트가 전체 상한을 나눠 쓴다. CI는 전체·프로젝트 모두 2개다. `npm run test:e2e -- --workers=4`는 전체 상한을 덮어쓰며 프로젝트별 상한도 계속 적용된다.

CI의 검증·E2E·빌드 명령은 같은 job에서 순차 실행한다. 프로젝트가 여러 개여도 E2E의 전체 동시 worker는 2개를 넘지 않는다. `timings.json`의 `workerProcesses`는 전체 실행 동안 시작된 프로세스의 누적 수이며 동시 실행 상한을 뜻하지 않는다. 로컬 4/6 worker 측정 시간은 CI 성능 수치로 사용하지 않는다.

전체 편집기와 설정 화면의 접근성은 데스크톱 Chromium에서 axe 규칙 전체로 검사한다. 프레임이 하나면 `tests/e2e/support/accessibility.ts`가 같은 페이지에서 `axe.run`을 사용하는 모드를 선택해 결과 집계용 빈 페이지 생성을 줄인다. 하위 프레임이 있거나 검사 중 추가되면 교차 출처 프레임을 포함하는 기본 모드를 사용한다. 규칙과 검사 영역은 줄이지 않는다. 도우미의 정상 화면·이름 없는 버튼·교차 출처 프레임 오류 검출은 Chromium에서 한 번 별도 검증한다.

Drive 연결·Picker·브라우저 HTTP 계약은 `drive-contract` 프로젝트에서 Chromium으로 한 번 실행한다. 자동 저장·수동 저장 대기열·버퍼링·병합·재시도·세션·복구의 상태 조합은 `drive-behavior` 프로젝트에서 Chromium으로 한 번 검증한다. 이 시나리오들은 `seedDriveWorkspace` 픽스처로 폴더·파일 메타데이터를 준비하고, 테스트 전용 초기화 모듈에서 모킹된 Google SDK로 메모리 인증을 완료한 뒤 앱을 시작한다. 픽스처 인수 `null`은 인증만 완료하고 저장 위치는 선택하지 않은 상태를 준비한다. 각 테스트의 Drive HTTP 더블과 브라우저 저장소는 독립적이며, 새로고침 때는 픽스처 인증을 반복하지 않아 재연결·초안 복구 검사를 유지한다.

저장 버튼·단축키·동기화 상태·충돌 선택 UI는 같은 픽스처를 사용해 데스크톱 Chromium에서 검증한다. Drive 계약·상태 조합·UI 검사를 서로 다른 프로젝트로 관리한다. 테스트 전용 초기화 모듈은 E2E 빌드에만 포함되고 `npm run build`의 `dist/`에는 들어가지 않는다.

자동 파일명 규칙은 실제 App·파일명 입력·이력·파일 파서·초안 저장 및 복구를 실행하는 jsdom 통합 테스트로 검증한다. Editor는 실제 DocumentName을 표시하고 콜백을 전달하는 테스트 더블로 대체하며 IndexedDB는 `fake-indexeddb`를 사용한다. 한글 조합 입력·단축키 저장·실제 초안 복구는 데스크톱 Chromium의 대표 E2E로 유지한다. 초안 보관 설정 E2E는 저장 지연을 `page.clock.fastForward(250)`으로 진행하고 실제 IndexedDB 저장 완료를 확인한다. 브라우저를 다시 불러오는 검사와 실제 탭 간 설정 전파·접근성 검사는 유지한다. 저장 예약의 취소·직렬 실행·실패 후 재시도는 Hook 통합 테스트에서 가상 시계와 저장소 더블로 검사한다.

자동 배치 E2E는 같은 문서에서 배치·Undo/Redo·초안 복구·네이티브 파일 왕복을 이어 검사한다. 편집 중인 제목을 확정하는 검사는 데스크톱 화면에서 원래의 겹친 입력을 다시 가져와 시작한다. 새 문서는 파일명·수동 좌표로 가져오기 완료를 확인하며, 같은 노드 개수만으로 준비됐다고 판단하지 않는다. 데스크톱 화면 폭 1024·1280·1440px × 언어 2종을 Chromium에서 검사하고 각 단계와 조합은 `test.step`으로 구분한다. 저장 지연은 가상 시계로 진행하며 실제 IndexedDB·다운로드·레이아웃 측정·화면 캡처를 사용한다.

```sh
npm run test:e2e -- --project=drive-contract
npm run test:e2e -- --project=drive-behavior
npm run test:e2e -- --project=chromium
```

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
    site/              # 이 실행에서 검증한 앱 빌드
    artifacts/         # 실패 시 trace.zip 등
    timings.json       # worker, 준비/정리, 측정 단계 및 나머지 실행 시간
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

E2E `timings.json`은 각 검사와 재시도의 worker 번호·프로젝트·결과·총시간을 보관한다. `setupMs`/`teardownMs`는 Playwright의 Before/After Hooks 전체이므로 사용자 Hook과 브라우저·context·page 준비/정리가 포함된다. `firstInWorker`는 해당 worker의 첫 검사다. `phasesMs`는 `timing:`으로 시작하는 명시적인 `test.step` 시간이며 편집·노드 조작·초안 보관 검사에 로딩·가져오기·접근성·새로고침 등을 표시한다. 부모 단계와 하위 단계 시간을 중복 합산하지 않으며 `remainingMs`는 그 외 실행 시간이다. 병렬 검사 시간을 합한 값은 전체 대기 시간과 다르므로 설정 비교에는 같은 검사 목록을 실행한 `summary.json`의 `durationMs`를 사용한다.

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
