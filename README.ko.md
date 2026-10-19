<p align="center">
  <img src="public/icon.svg" alt="Maplet" width="72" height="72" />
</p>

<h1 align="center">Maplet</h1>

<p align="center">MindMup 호환을 지원하는 로컬 우선 마인드맵 에디터.</p>

<p align="center">
  <a href="README.md" lang="en">English</a> · <strong>한국어</strong>
</p>

[![Quality](https://github.com/sejoung/Maplet/actions/workflows/ci.yml/badge.svg)](https://github.com/sejoung/Maplet/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-236b58.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white)](.nvmrc)
[![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](package.json)

`.maplet` 문서를 만들거나 `.mup` 파일을 가져와 생각을 정리하고 수정한 파일을 다운로드하세요. Maplet은 간단한 툴바와 읽기 쉬운 캔버스에서 브라우저 안의 파일을 편집합니다. 로컬 파일 편집에는 계정이나 백엔드가 필요하지 않으며, Google Drive는 선택적으로 연결합니다.

![자유롭게 배치한 예제 마인드맵이 열린 Maplet 에디터](docs/screenshots/free-positioning.png)

[빠른 시작](#빠른-시작) · [주요 기능](#주요-기능) · [개발](#개발) · [기여](#기여) · [모바일 화면](docs/screenshots/mobile.png)

## 주요 기능

- **전용 문서:** 계층·좌표·메모·스타일을 버전이 있는 JSON 모델로 `.maplet` 파일에 저장합니다.
- **MindMup 호환:** `.mup` 파일을 가져오고 호환 사본을 내보내며, 가져온 MindMup 원본 백업을 그대로 다운로드합니다.
- **직접 편집:** 노드 추가·이름 변경·삭제·부모 변경을 지원하며 메모·링크·배경색은 툴바에서 필요할 때 설정합니다.
- **가지 단위 이동:** 부모를 끌면 모든 하위 노드가 상대 위치를 유지하며 함께 이동하고 연결선도 따라옵니다. 다른 가지의 위치는 유지합니다.
- **맵 탐색:** 검색, 가지 접기, 확대·축소, 팬, 화면에 맞추기, 자동 정렬을 지원합니다.
- **노드 크기:** 선택한 노드의 오른쪽 아래 모서리를 드래그해 크기를 바꾸고, 모서리 더블클릭으로 자동 크기를 복원합니다. 접기·펼치기는 작은 −/+ 버튼을 사용합니다.
- **기본 서식:** 왼쪽 정렬을 기본으로, 서식 창에서 정렬 3종·글자 크기 3단계·시스템 글꼴 3종과 배경색을 선택합니다.
- **실행 취소와 복구:** 드래그 한 번을 한 단계로 실행 취소·다시 실행하고, IndexedDB 초안을 복구하며, 다시 연 파일의 수동 배치를 유지합니다.
- **선택적 Google Drive:** 처음 `.maplet` 저장 위치를 정하면 이후 변경을 자동 저장합니다. `.mup` 원본은 보존하며, 버전 충돌은 자동 저장을 멈추고 사용자가 해결합니다.

현재 앱 UI는 한국어이며, 두 언어의 README에서 동일한 기능과 명령을 안내합니다.

## 빠른 시작

**Node.js 24**와 npm을 사용합니다.

```sh
git clone https://github.com/sejoung/Maplet.git
cd Maplet
npm ci
npm run dev
```

[http://127.0.0.1:5173](http://127.0.0.1:5173)에 접속하세요. 중심 주제 하나로 시작하거나 **파일 → 열기**로 기존 파일을 엽니다. 노드를 더블클릭해 제목을 편집하고, 드래그해 가지를 이동하고, **.maplet 저장**으로 문서를 다운로드합니다. MindMup 호환 사본은 **파일 → .mup 내보내기**를 사용합니다.

기본 편집에는 환경 변수가 필요하지 않습니다. Drive를 연결하려면 [`.env.example`](.env.example)을 `.env.local`로 복사해 공개 Google 설정을 입력하고 [Drive 설정 가이드](docs/google-drive.md)를 따르세요. 브라우저 빌드에 client secret을 포함하면 안 됩니다.

한국어·영어를 지원하며 처음에는 브라우저 언어를 따릅니다. 상단 오른쪽 **설정 → 언어**에서 변경하면 즉시 적용되고 다음 방문에도 유지됩니다. 하단 언어 선택에서도 바로 바꿀 수 있습니다. 언어를 바꿔도 문서 내용은 변하지 않습니다. 번역은 한국어 기준 문구를 키로 사용하는 [`src/i18n/locales/en.json`](src/i18n/locales/en.json)에서 관리합니다.

## 단축키

| 단축키                       | 동작                       |
| ---------------------------- | -------------------------- |
| `Tab`                        | 하위 노드 추가             |
| `Enter`                      | 형제 노드 추가             |
| `F2` / 더블클릭              | 제목 편집                  |
| 방향키                       | 계층 탐색                  |
| `Delete` / `Backspace`       | 노드와 모든 하위 노드 삭제 |
| `Ctrl` / `⌘` + `Z`           | 실행 취소                  |
| `Ctrl` / `⌘` + `Shift` + `Z` | 다시 실행                  |
| `Ctrl` / `⌘` + `S`           | 파일 다운로드              |
| `Space` + 드래그             | 캔버스 이동                |
| `Ctrl` + 휠 / 핀치           | 확대·축소                  |

제목 편집 중에는 `Enter`로 적용하고, `Shift` + `Enter`로 줄바꿈하고, `Escape`로 취소합니다. `Tab`은 제목을 적용한 뒤 자식 노드를 만들고 편집을 이어갑니다. 드래그 중 `Escape`를 누르면 가지 전체의 이동을 취소합니다.

## 파일 형식

기본 [`.maplet` 형식](docs/maplet-format.md)은 노드 좌표와 계층을 버전이 있는 JSON 문서에 직접 저장합니다. 알 수 없는 네이티브 문서·노드 필드를 보존하고, 기존 브라우저 초안은 복구할 때 이전합니다.

가져오기·내보내기는 MindMup v1·v2·v3와 v3의 다중 루트를 지원합니다. 원본 메타데이터와 가져온 텍스트는 별도 호환 영역에 보존합니다. MUP 내보내기의 수동 위치는 **Maplet 전용** `attr["maplet:position"]` 확장에 담으므로 다른 편집기에서 같은 배치로 표시되지 않을 수 있습니다. 네이티브 저장과 MUP 내보내기는 별개 동작입니다.

이미지·HTML 첨부·교차 연결은 데이터를 보존하지만 전용 렌더링은 제공하지 않습니다. 현재 호환성 테스트는 합성 fixture를 사용하며 모든 MindMup 파일과의 완전한 호환을 보장하지 않습니다. 자세한 범위는 [호환성 매트릭스](docs/compatibility.md)와 [검증 기록](docs/verification.md)을 참고하세요.

가져오기 한도는 **`.maplet` 50 MiB**, **`.mup` 10 MiB**, **5,000개 노드**, **100단계**, **제목당 10,000자**입니다. 다른 기기로 옮기거나 작업 원본을 보관하려면 `.maplet` 파일을 다운로드하세요. 브라우저 초안은 현재 기기에 별도로 저장됩니다. Drive에서 연 `.mup`은 저장할 때 새 `.maplet` 파일을 만들어 원래 파일을 보존합니다.

## 개발

React·TypeScript·Vite와 SVG 레이아웃 렌더러를 사용합니다. 테스트 도구는 Vitest와 Playwright입니다.

```sh
# 포맷, 린트, 타입, 단위/통합/아키텍처 테스트, 커버리지, 빌드
npm run verify

# 브라우저 회귀 테스트
npx playwright install chromium firefox webkit
npm run test:e2e

# 개발 중 테스트 감시
npm run test:watch
```

품질 검사 workflow에서 전체 검증과 Chromium·Firefox·WebKit·모바일 WebKit E2E를 실행하고 접근성도 검사합니다. 아키텍처 테스트로 계층 의존성과 순환 참조를 검사합니다. 코드 파일은 빈 줄·주석을 포함해 **400줄**로 제한하며 운영 CSS에도 같은 상한을 적용합니다.

각 npm 테스트 명령은 `test-results/<UTC 실행시각>-<종류>-<고유값>/`에 로그와 보고서를 저장합니다. 상대 심볼릭 링크로 실패를 포함한 최근 종료 결과에 접근할 수 있습니다.

| 경로                                               | 내용                               |
| -------------------------------------------------- | ---------------------------------- |
| `test-results/latest/summary.json`                 | 최근 실행 상태·명령·시각·종료 코드 |
| `test-results/latest-coverage/coverage/index.html` | 최근 커버리지 보고서               |
| `test-results/latest-e2e/html/index.html`          | 최근 브라우저 보고서               |

결과는 Git에서 제외하고 CI artifact로 보관합니다. 최근 브라우저 보고서는 다음 명령으로 엽니다.

```sh
npx playwright show-report test-results/latest-e2e/html
```

### 프로젝트 구조

```text
src/
  app/           앱 조립, 문서 수명주기, Drive 연동
  components/    툴바, 캔버스, 노드 편집, 대화상자
  domain/        맵 모델과 편집 명령
  application/   히스토리와 유스케이스
  adapters/      Maplet/MindMup 변환, 파일 입출력, IndexedDB, Google Drive
  engine/        레이아웃과 연결선 좌표 계산
  styles/        기본 요소, 에디터, 캔버스, 대화상자, 반응형 스타일
tests/
  unit/          도메인, 레이아웃, 포맷 변환, 어댑터 테스트
  integration/   초안 저장소와 개발 도구 테스트
  architecture/  의존성 경계와 순환 참조 검사
  e2e/           브라우저 시나리오
  fixtures/      네이티브 및 합성 MindMup 샘플
docs/            가이드, 화면 캡처, 아키텍처 결정 기록
```

### 직접 호스팅

```sh
npm run build
npm run preview
```

`dist/`를 정적 호스팅에 배포합니다. 자산 경로는 상대 경로여서 저장소 하위 경로도 지원합니다. [Pages workflow](.github/workflows/pages.yml)로 GitHub Pages에 수동 배포할 수 있습니다. 먼저 저장소 Pages의 배포 원본을 GitHub Actions로 설정하세요. Drive를 사용한다면 배포 origin 설정과 재빌드가 필요합니다.

## 문서

상세 가이드는 현재 한국어로 작성되어 있습니다.

| 문서                                    | 내용                                       |
| --------------------------------------- | ------------------------------------------ |
| [디자인 가이드](docs/design-guide.md)   | 가독성, 색상, 조작, 접근성                 |
| [개발 가이드](docs/contributing.md)     | TDD, 품질 검사, 테스트 결과, 배포          |
| [전용 형식](docs/maplet-format.md)      | `.maplet` 버전·스키마·메타데이터·이전 정책 |
| [호환성](docs/compatibility.md)         | 지원 포맷과 원본 보존 정책                 |
| [Google Drive](docs/google-drive.md)    | 선택적 연결 설정과 운영 검증               |
| [검증 기록](docs/verification.md)       | 구현 범위, 검증 근거, 남은 검증            |
| [아키텍처 결정 기록](docs/adr/)         | 계층, 포맷, UI, 드래그, 개발 도구          |
| [초기 제품 기획](docs/product-brief.md) | 최초 제품 목표와 수용 기준 보관            |

## 기여

버그 제보, 수정, 접근성 개선, 문서 번역을 환영합니다. 문제를 재현할 수 있는 순서와 함께 [이슈](https://github.com/sejoung/Maplet/issues)를 남겨 주세요. 맵 파일이 필요하다면 민감한 내용을 제거한 샘플을 사용하세요.

코드를 변경할 때는 실패하는 회귀 테스트를 먼저 추가하고, 테스트는 `tests/`, 운영 코드는 `src/`에 분리합니다. PR 전에 `npm run verify`와 관련 E2E를 실행하고 아키텍처 변경은 `docs/adr/`에 기록해 주세요. 자세한 절차는 [개발 가이드](docs/contributing.md)를 참고하세요.

README를 수정할 때는 [English](README.md)와 [한국어](README.ko.md)를 함께 갱신합니다.

## 라이선스

[MIT](LICENSE) © 2026 sejoung kim.
