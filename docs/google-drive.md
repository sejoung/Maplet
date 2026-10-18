# 선택적 Google Drive 연결

기본 앱은 자격 증명·로그인 없이 로컬 `.maplet` 편집과 `.mup` 가져오기·내보내기가 가능하다. Drive 연결은 배포 운영자가 다음 설정을 제공한 경우에만 활성화된다.

1. 같은 Google Cloud 프로젝트에서 Drive API와 Google Picker API를 활성화한다.
2. OAuth 동의 화면을 설정하고 `drive.file` 범위의 공개 정책을 확인한다. 테스트 모드라면 테스트 사용자를 등록한다.
3. 웹 애플리케이션 OAuth 클라이언트의 authorized JavaScript origin에 로컬 `http://127.0.0.1:5173`과 실제 배포 origin을 등록한다. 경로는 origin에 포함하지 않는다.
4. 브라우저 API 키에 웹사이트 referrer 제한과 Drive/Picker API 제한을 적용한다. Picker 공식 안내에 따라 `https://docs.google.com/*` referrer도 확인한다.
5. `.env.example`을 `.env.local`로 복사하고 Client ID, API key, 프로젝트 번호(App ID)를 입력한 뒤 재시작/재빌드한다. 세 값은 공개 브라우저 설정이다. client secret은 절대 포함하지 않는다.
6. UI에서 Drive → Google에 연결 → Drive에서 열기를 선택한다. 파일 갱신, 새 사본 저장, 연결 해제를 지원한다.

Drive 저장의 기본 형식은 `.maplet`이다. Drive에서 연 `.mup` 파일은 저장할 때 새 `.maplet` 사본을 만들고 원래 파일을 보존한다. 기존 `.maplet` 파일은 버전과 ETag를 검사해 갱신한다. 로컬 MUP 호환 파일은 파일 메뉴의 `.mup 내보내기`로 다운로드한다.

SDK는 Drive 화면을 열 때만 로드하며 기본 로컬 사용 중 맵 콘텐츠를 전송하지 않는다. OAuth 토큰은 메모리에만 유지하며 새로고침 후 재연결한다. 만료·거절·오프라인 오류는 로컬 초안을 유지한다. 충돌 시 새 사본, 로컬 다운로드, 명시적 덮어쓰기를 선택할 수 있다. ETag가 응답에 노출되지 않으면 안전한 자동 갱신을 거절한다.

## 운영 검증

실제 Cloud 설정이 제공되지 않아 현재 검증은 HTTP 계약과 OAuth/Picker 모킹 범위다. 공개 origin에서 로그인 허용·팝업 차단·권한 거절·토큰 만료·ETag 헤더 노출·버전 충돌을 실제 계정으로 검증해야 한다. CI에는 실제 토큰을 넣지 않는다.

공식 근거: [Picker 설정](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample), [token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [drive.file 권한](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
