# ADR 0023: Maplet 전용 MIME 타입과 Drive 열기 범위

2026-11-11 · 채택

## 배경

`.maplet`을 일반 `application/json`으로 저장하면 Google Picker에서 다른 JSON 문서와 구분할 수 없다. Drive 열기를 Maplet 문서로 제한하되, 사용자가 직접 업로드해 `application/octet-stream`으로 등록된 네이티브 파일도 열어야 한다.

## 결정

- 네이티브 다운로드와 Drive 저장에 `application/x-maplet+json`을 사용한다. `.maplet` JSON 스키마와 문서 버전은 바꾸지 않는다.
- 파일 Picker는 전용 타입과 `application/octet-stream`을 허용한다. 폴더 Picker는 기존 폴더 타입과 탐색을 유지한다.
- 선택 결과는 Drive에서 조회한 MIME 타입·확장자를 다시 확인하고 네이티브 Maplet 파서로 본문을 검증한 뒤 반영한다. 이름을 바꾼 MUP와 손상 문서는 현재 문서를 교체하지 못한다.
- 일반 바이너리 파일도 Picker 목록에 나타날 수 있다. 확장자 검사는 표시 후 앱에서 수행하며, MIME 필터를 확장자 필터로 설명하지 않는다.
- 이전 타입의 연결된 작업·초안은 계속 복구한다. 실제 저장 시 기존 파일 ID에 MIME 메타데이터와 새 revision의 내용을 함께 보내며 버전·ETag 검사를 유지한다. 변경 없는 문서의 저장 생략과 파일 열기만으로 업로드하지 않는 정책도 유지한다.
- 기존 `application/json` 파일을 새로 고르려면 다운로드·로컬 가져오기 후 Drive에 저장한다. 로컬 MUP·개요 가져오기는 유지한다. 추가 OAuth 범위나 전체 Drive 일괄 변환은 도입하지 않는다.

## 근거와 결과

Google Picker의 [setMimeTypes](https://developers.google.com/workspace/drive/picker/reference/picker.view.setmimetypes)는 MIME 타입을 제한한다. Drive의 [파일 메타데이터](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)는 MIME 변경에 새 revision 업로드가 필요하며, [multipart 업로드](https://developers.google.com/workspace/drive/api/guides/manage-uploads#multipart)는 메타데이터와 본문을 함께 전달한다.

메타데이터 파트는 JSON 타입을, 파일 본문은 전용 타입을 사용한다. 전용 타입으로 이미 저장된 파일은 이후 내용 갱신에도 같은 타입을 유지한다. 기존 파일이 필터에서 사라질 수 있으므로 README·사용 설명서·Drive 가이드에 이전 파일 처리 방법을 안내한다.

전송 계약 테스트로 생성·타입 갱신·후속 갱신·충돌 거절을, 통합 테스트로 전용/바이너리 파일 열기와 잘못된 타입·이름·본문 거절을 검사한다. 브라우저 검증은 SDK의 MIME 필터 설정, 직접 업로드 파일의 열기·저장 변환, 오류 시 현재 문서 유지를 확인한다. 실제 Google Picker와 운영 계정 검증은 모킹 검사와 구분한다.
