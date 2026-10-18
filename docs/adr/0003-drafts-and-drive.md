# ADR 0003: 로컬 복구와 명시적 Drive 저장

후속 결정: 초안·Drive의 기본 내용은 [ADR 0009](0009-native-maplet-format.md)의 `.maplet` 형식으로 전환한다. 기존 MUP 초안의 복구와 원본 보존은 유지한다.

- 상태: 채택, 실제 OAuth 환경 검증 대기
- 날짜: 2026-10-17

## 결정

편집 후 250ms debounce로 IndexedDB 한 슬롯에 문서, 원본 백업, 파일명, 마지막 다운로드 내용, 시각을 원자적으로 저장한다. 쓰기는 직렬화하여 오래된 비동기 작업이 새 문서를 덮지 않게 한다. 다운로드하지 않은 변경이 있는 초안만 다음 방문에 복구를 제안한다. 읽기/쓰기 실패 시 저장 성공으로 표시하지 않는다. 다운로드 전 변경은 beforeunload와 파일 교체 확인으로 보호한다.

Google 연결은 공개 환경 변수 3개가 있을 때만 활성화한다. 연결 UI를 열 때 SDK를 지연 로드하고 사용자 클릭에서 OAuth를 요청한다. 토큰은 메모리에만 보관하며 drive.file 범위만 사용한다. Google Picker가 선택한 파일을 읽으며, 파일 갱신 전 version을 비교하고 ETag가 있으면 If-Match를 보낸다. HTTP 412와 버전 변경은 충돌이다. ETag가 없으면 자동 갱신을 거절하고 새 사본 또는 명시적 덮어쓰기를 제공한다. 네트워크·토큰 실패가 로컬 문서를 지우지 않는다.

Drive 성공과 로컬 다운로드는 독립 상태다. 로컬 다운로드 경고는 사용자가 로컬 사본을 요청할 때 해제한다. 브라우저 다운로드 API는 실제 디스크 기록 성공을 확인할 수 없어 UI에서 다운로드 요청과 폴더 확인을 안내한다.

## 근거

- [Google token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Picker 구성](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample)
- [Drive 업로드](https://developers.google.com/workspace/drive/api/guides/manage-uploads)

## 한계

브라우저 저장소 삭제·사생활 모드·강제 종료 직전 debounce 구간은 완전한 복구를 보장하지 않는다. 탭 간 실시간 공동 편집은 비목표이며 한 기기의 마지막 초안만 보관한다. Google 응답 헤더 노출과 실 OAuth 승인 흐름은 배포 origin 및 Cloud 프로젝트에서 추가 검증해야 한다.
