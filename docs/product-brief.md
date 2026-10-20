# 초기 제품 기획 (보관용)

이 문서는 최초 README의 제품 목표와 수용 기준을 보존한 기획 기록이다. 계획 단계의 대안·일정·미결정 사항이 포함되어 있으므로 현재 구현의 설명으로 사용하지 않는다. 현재 기능과 실행 방법은 [English README](../README.md) 또는 [한국어 README](../README.ko.md), 구현 범위는 [검증 기록](verification.md), 설계 결정은 [ADR](adr/)을 참고한다.

---

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

- 브라우저: 데스크톱 Google Chrome을 공식 지원하며 Chromium으로 키보드·접근성·편집·저장 흐름을 검증한다. Firefox·Safari·모바일 브라우저는 공식 지원 범위에서 제외하며 필요할 때 지원 대상과 E2E 프로젝트를 추가한다. [ADR 0012](adr/0012-desktop-chrome-support.md)를 따른다.

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
