# Maplet
Your mind maps belong to you.

# 1. 제품 목표

- 기존 MindMup .mup 파일을 로그인 없이 열람하고 편집·저장할 수 있는 무료 오픈소스 웹 앱.

- 정적 호스팅(GitHub Pages), 로컬 우선, 사용자 파일 소유권 보장. Google Drive는 선택적 확장.

- 비목표: 실시간 공동 편집, AI, 자체 회원 관리, 서버 DB, 모든 MindMup 고급 기능의 즉각적 재현.

# 2. 사용자 흐름

- 첫 방문 → .mup 드래그/선택 → 포맷 검증 → 마인드맵 렌더링 → 편집 → .mup 다운로드.

- 새 맵 생성 → 중심 노드 입력 → Enter/Tab으로 확장 → 저장.

- 후속 버전: Google 로그인 → Picker로 파일 선택 → 편집 → Drive 업데이트; 충돌 시 사용자 선택.

# 3. MVP 기능 및 수용 기준

- P0 열기: 유효한 .mup JSON을 파싱하고 오류 시 원본을 변경하지 않으며 안내한다.

- P0 보기: 계층·노드 텍스트·좌우 배치·확대/축소·팬·접기/펼치기를 지원한다(실제 파일 검증).

- P1 편집: 노드 추가/삭제/이름 변경/부모 변경, 키보드 Enter/Tab, Undo/Redo.

- P1 저장: .mup 내보내기와 재가져오기 왕복 테스트에서 편집한 내용 및 알 수 없는 원본 속성을 보존한다.

- P1 복구: 편집 중 IndexedDB 임시 저장, 복구 UI, 다운로드 전 이탈 경고.

- P2 Google Drive: 최소 권한 drive.file + Google Picker, 명시적 저장 상태 표시, 실패 시 로컬 사본 유지.

# 4. 기술 아키텍처

- React + TypeScript + Vite → GitHub Pages 정적 배포.

- File Adapter(.mup parser/serializer) ↔ 정규화된 내부 트리 모델 ↔ Editor UI / Layout Engine.

- Persistence Adapter: 브라우저 파일 입출력, IndexedDB 초안, 선택적 Drive API.

- 렌더링 선택: MapJS 재사용 PoC 우선; 호환성과 유지보수 문제 시 현대적 엔진 대체. 선택은 샘플 파일 테스트 후 확정.

# 5. 데이터 모델·호환 정책

- 내부 노드: id, title, children, parentId, side, collapsed, style, notes, links, rawExtensions.

- MindMup 원본은 ideas 객체의 순서 키, id, title 및 부가 메타데이터를 포함할 수 있으므로 실제 파일로 스키마 확정.

- 파싱 시 미인식 필드는 rawExtensions에 보존하고, 직렬화 시 충돌 없이 재병합. 원본 백업을 유지한다.

- 버전별 .mup 차이, 첨부 리소스, 링크/메모, 스타일, 위치, 순서의 호환성 매트릭스를 작성한다.

- 파일 확장자만 신뢰하지 않고 JSON 유효성·크기·노드 수·순환 참조·중복 ID를 검사한다.

# 6. 화면 구성

- 상단: 로고 / 새로 만들기 / 열기 / 저장 / 실행 취소 / 다시 실행 / Drive(추후).

- 중앙: 마인드맵 캔버스, 선택 노드 편집, 키보드 탐색, 줌/팬.

- 하단: 저장 상태, 줌 비율, 단축키 도움말.

- 파일 열기 실패·지원하지 않는 속성·복구 가능 초안·Drive 충돌은 명확한 메시지로 표시.

# 7. Google Drive 연동 설계(P2)

- Google Cloud 프로젝트에서 Drive API, Picker API, OAuth 클라이언트 및 허용 JavaScript origin 설정.

- 브라우저 기반 OAuth 토큰 사용; client secret을 정적 사이트에 포함하지 않는다.

- drive.file 범위와 Picker를 우선 검토; 앱 검증·공개 범위·API 정책은 배포 시점 공식 문서 재확인.

- Drive 파일 ID, revision/ETag 등 버전 정보를 관리해 덮어쓰기 충돌 감지. 오프라인/토큰 만료 시 로컬 임시 저장.

- 개인정보 최소화: 서버로 맵 콘텐츠를 전송하지 않으며 분석 도구 기본 비활성.

# 8. 보안·안정성

- 노드 텍스트·메모는 HTML로 무분별하게 삽입하지 않고 이스케이프/정화한다(XSS 방지).

- 외부 링크는 안전한 URL 스킴만 허용; 첨부 리소스 및 대용량 JSON은 크기 제한.

- 토큰은 가능한 메모리 보관; 민감 정보 콘솔 기록 금지; CSP 설정 검토.

- 원본 파일은 불변으로 취급하고 저장 실패·탭 종료·네트워크 단절 시 복구 경로 제공.

# 9. 테스트 계획

- 실제 보유 .mup 파일 3~5개 확보(단순/대형/스타일/메모 포함). 민감 내용은 익명화.

- 골든 파일 비교: 열기→저장→재열기 후 노드 수·관계·텍스트·스타일·미인식 필드 검증.

- 편집 테스트: Enter/Tab/삭제/드래그/Undo/Redo/접기/확대축소.

- 예외 테스트: 잘못된 JSON, 빈 맵, 중복 ID, 매우 큰 맵, 잘못된 링크, Drive 권한 취소.

- 브라우저: Chrome, Safari(Mac), Firefox; 키보드 접근성 및 모바일 읽기 검증.

# 10. 개발 단계·완료 조건

- Sprint 0 (기술검증): 샘플 파일 분석, MapJS 구동 및 라이선스/의존성 점검, 호환성 결정.

- Sprint 1 (뷰어): 파일 열기, 렌더링, 줌/팬, 접기, 오류 처리, GitHub Pages 공개.

- Sprint 2 (편집기): 노드 CRUD, 키보드, Undo/Redo, .mup 왕복 저장, IndexedDB 복구.

- Sprint 3 (선택): Drive 로그인/Picker/저장/충돌 처리, 공개 OAuth 설정.

- MVP 출시 기준: 샘플 파일 정상 열기, 수정 후 재열기 성공, 데이터 손실 회귀 테스트 통과, 서버 없는 공개 배포.

# 11. 저장소 구조 예시

- src/components/ — Toolbar, Canvas, Dialog

- src/domain/ — MindMap 모델과 편집 명령

- src/adapters/mup/ — parser, serializer, compatibility tests

- src/adapters/storage/ — local, indexeddb, drive

- src/engine/ — MapJS wrapper 또는 대체 렌더러

- tests/fixtures/ — 익명화된 .mup 샘플

- docs/ — 포맷 조사, 아키텍처 결정 기록(ADR), 기여 가이드

# 12. 미결정 사항

- 프로젝트명 Maplet은 가칭: GitHub 저장소명·상표·도메인 중복 확인 필요.

- 실제 .mup 샘플을 확보하기 전에는 완전한 MindMup 호환을 보장하지 않는다.

- MapJS는 오래된 코드이므로 현행 브라우저·라이선스·의존성·유지보수 비용을 PoC로 확인.

- Drive 연결은 공개 OAuth 설정/검증 조건 확인 후 일정 확정.

# 13. 참고 링크

- MindMup MapJS: https://github.com/mindmup/mapjs

- MindMup 데이터 포맷 문서: https://github.com/mindmup/mapjs/wiki/Data-Format

- GitHub Pages: https://docs.github.com/en/pages

- Google Drive API: https://developers.google.com/workspace/drive/api/guides/about-sdk

- Google Picker: https://developers.google.com/workspace/drive/picker/guides/overview

# 14. 구현체 실행과 검증

Node.js 24 LTS 권장. 기본 사용에는 서버·로그인·환경 변수 설정이 필요하지 않습니다.

```sh
npm ci
npm run dev
```

http://127.0.0.1:5173 에서 중심 노드 하나로 시작하거나 파일 메뉴/드롭으로 `.mup` 파일을 여세요. F2 또는 더블클릭으로 노드 안에서 제목을 편집하고 Enter로 적용, Esc로 취소합니다. Tab/Enter로 자식·형제를 추가할 수 있습니다. 메모·링크·서식·검색은 상단 툴바에서 필요할 때 열고, 부모·방향은 노드 작업 메뉴에서 바꿉니다. 저장은 `.mup` 다운로드이며 초안은 IndexedDB에 별도로 보관합니다.

노드를 끌어 원하는 위치에 놓으면 연결선의 길이와 방향이 실시간으로 바뀝니다. 부모 관계와 다른 노드의 위치는 유지하며 이동 한 번을 실행 취소 한 번으로 되돌립니다. 배치는 Maplet 전용 `.mup` 확장으로 저장·복구합니다. 전체 초기화는 노드 작업 → 맵 자동 정렬을 사용하세요.

```sh
npm run verify
npx playwright install chromium firefox webkit
npm run test:e2e
```

- [디자인 가이드](docs/design-guide.md) · [데스크톱 화면](docs/screenshots/desktop.png) · [모바일 화면](docs/screenshots/mobile.png)
- [ADR: 계층과 테스트 경계](docs/adr/0001-layered-local-first.md)
- [ADR: 포맷과 렌더러](docs/adr/0002-mup-and-renderer.md)
- [ADR: 초안과 Drive](docs/adr/0003-drafts-and-drive.md)
- [ADR: 단순한 에디터 UI](docs/adr/0004-minimal-editor-interface.md)
- [ADR: 자유 배치와 연결선 길이](docs/adr/0005-manual-node-positions.md)
- [ADR: 실행별 테스트 결과와 최신 링크](docs/adr/0006-test-run-artifacts.md)
- [ADR: 파일당 400줄 제한](docs/adr/0007-file-size-limit.md)
- [호환성 범위](docs/compatibility.md) · [개발/TDD/CI/Pages](docs/contributing.md) · [Google Drive 설정](docs/google-drive.md)

운영 코드는 `src/`, 모든 테스트는 `tests/`에 분리되어 있습니다. 순환 참조·계층 역전·운영 코드의 테스트 의존을 아키텍처 테스트로 차단합니다. GitHub Actions 품질 검사와 수동 Pages 배포 workflow가 포함되어 있습니다.

테스트 결과는 `test-results/<UTC 실행시각>-<종류>-<고유값>/`에 로그·JSON·JUnit·커버리지·브라우저 보고서를 모아 보관합니다. `test-results/latest`는 최근 종료 결과, `latest-coverage`와 `latest-e2e`는 종류별 최근 결과를 가리키는 심볼릭 링크입니다. 실패 결과도 이력에 남으며 결과 폴더 전체는 Git에서 제외합니다. 자세한 경로와 조회 명령은 [개발 가이드](docs/contributing.md#테스트-결과)를 참고하세요.

Google Drive는 공개 Client ID/API key/App ID 설정 후 활성화됩니다. 실제 OAuth 프로젝트·배포 origin 검증과 사용자 실파일 검증은 별도로 필요합니다. 현재 fixture는 공식 포맷을 기준으로 만든 합성 샘플이며 완전한 MindMup 호환성을 보장하지 않습니다. 첨부 이미지·HTML·교차 연결의 원본 데이터는 보존하지만 전용 렌더링은 제공하지 않습니다.
