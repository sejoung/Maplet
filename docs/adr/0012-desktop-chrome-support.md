# ADR 0012: 데스크톱 Chrome 지원과 Chromium E2E

- 상태: 채택
- 날짜: 2026-10-20

## 배경

제한된 CI 환경에서 전체 E2E 275개를 worker 2개로 실행하는 데 3분 15초가 걸렸다. 같은 UI 시나리오를 Chromium·Firefox·WebKit·모바일 WebKit에서 반복하는 비용이 크다. 사용자는 현재 Chrome만 지원하고, 모바일은 맵 가독성 때문에 공식 지원하지 않기로 결정했다.

## 결정

공식 지원 브라우저는 데스크톱 Google Chrome으로 제한한다. 자동 E2E는 Playwright의 Desktop Chrome 설정을 사용하는 Chromium으로 실행한다. 설치된 Google Chrome 채널을 직접 검증하는 구성은 아니다.

Playwright 프로젝트는 `drive-contract`, `drive-behavior`, `chromium`을 유지한다. Drive SDK·HTTP 계약, 상태 조합과 편집 UI를 분리하되 모든 프로젝트는 데스크톱 Chromium을 사용한다. Firefox·WebKit·모바일 프로젝트를 제거하고 CI와 Pages workflow도 Chromium만 설치한다. CI의 전체 worker 상한은 2개를 유지한다.

모바일 터치 분기를 제거하고 파일명·서식 번역 검사는 데스크톱 화면에서 유지한다. 자동 배치의 편집 중 제목 확정 검사는 데스크톱 화면에서 수행하고 툴바 너비 조합은 1024·1280·1440px와 한국어·영어로 제한한다. 저장·복구·Drive·접근성·키보드·포인터 편집 흐름은 유지한다. 운영 앱의 기존 반응형 스타일은 유지한다.

## 결과와 검증

다른 브라우저와 모바일의 호환성은 공식 보장하지 않는다. 필요할 때 지원 정책을 수정하고 해당 Playwright 프로젝트와 workflow 설치 대상을 함께 추가한다. ADR 0004의 모바일 UI 검증 결정은 이 지원 정책으로 대체한다.

변경 전후를 같은 로컬 환경에서 `CI=true npm run test:e2e -- --workers=2`로 실행해 비교한다. 이 수치는 실제 원격 CI runner의 성능과 구분한다. 전체 품질 검증과 Chromium E2E를 통과시키고 실행별 결과·시간 보고서를 보관한다.
