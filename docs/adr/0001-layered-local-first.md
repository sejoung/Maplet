# ADR 0001: 로컬 우선 계층 아키텍처와 테스트 경계

- 상태: 채택
- 날짜: 2026-10-17

## 결정

React + TypeScript + Vite 정적 앱. 서버·계정·분석 SDK를 두지 않는다. `domain`은 순수 모델/명령, `application`은 히스토리/유스케이스, `adapters`는 MUP/IndexedDB/Drive, `engine`은 순수 레이아웃, `components`는 UI, `app`은 조립과 수명주기를 담당한다.

의존 방향: domain ← application / engine / adapters ← components ← app. components는 adapters에 직접 의존하지 않는다. app이 어댑터를 주입한다. domain/application/engine에는 DOM·React·브라우저 저장소가 없다. 운영 코드는 `src`, 테스트는 `tests`로 완전히 분리한다.

## 강제 방법

TypeScript AST로 실제 import/export/dynamic import를 수집하는 아키텍처 테스트에서 허용 계층·외부 패키지·테스트 의존·순환 참조를 검사한다. 검사기 자체도 의도적으로 잘못된 그래프로 검증한다. ESLint, TypeScript strict, Vitest, Playwright를 CI 필수 관문으로 둔다. 새 동작은 실패 테스트→최소 구현→리팩터링 순서로 개발한다.

## 결과

라이브러리 교체와 파일 포맷 변경이 도메인에 전파되지 않는다. 브라우저 어댑터는 실제 IndexedDB 테스트와 Drive HTTP 계약 테스트를 추가로 필요로 한다. 원본은 별도 문자열로 유지하고 초안은 다운로드와 다른 상태로 표현한다.
