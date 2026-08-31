# 운영 관측 및 오류 수집

FC Online Lab은 Cloudflare Workers Logs와 Analytics Engine을 사용한다. 외부 오류 수집 SDK나 별도 API 키는 클라이언트에 포함하지 않는다.

## 연결 방식

- 모든 요청에 익명 UUID `X-Request-ID`를 사용한다.
- 응답은 `X-Request-ID`, `X-Server-Version`, `X-App-API-Version`을 반환한다.
- 데스크톱과 모바일 하단에 앱/API/서버 버전과 최근 request ID 앞 8자리를 표시한다.
- 클라이언트 오류는 `POST /v1/telemetry/client-error`로 전송한다. 실패하면 기기에 최신 20건만 보관하고 다음 실행 때 재전송한다.
- 구단주명, 검색어, API 키, IP 주소, 기기 식별자는 클라이언트 오류 payload에 넣지 않는다. 서버는 알 수 없는 필드를 제거하고 로컬 사용자 경로 및 URL query를 마스킹한다.

## Analytics Engine 이벤트

`fc_online_lab_metrics` 데이터셋의 첫 번째 blob이 이벤트 종류다.

| 이벤트 | index | 주요 blob | doubles |
|---|---|---|---|
| `request` | API 경로 | 경로, 상태군, 오류 원인/코드, 캐시, 서버·클라이언트 버전, request ID | 응답시간 ms, HTTP 상태, 성공 여부 |
| `upstream` | `upstream:nexon` 또는 `upstream:data-center` | 원천, 단계, 성공 여부, 오류 코드, 경로, 버전, request ID | 응답시간 ms, 원천 HTTP 상태, 성공 여부 |
| `parser` | `parser:<이름>` | 파서, 성공/실패, 부분/완전, 누락 필드, HTML signature, 경로, 버전, request ID | 시도 1, 성공 여부, 부분 실패 여부 |
| `client_error` | `client:<platform>` | 플랫폼, 오류 코드, 화면, 앱·서버 버전, 서버/관련 request ID | 건수 1 |

경로별 p50/p95 응답시간과 오류율은 `request`, Nexon/데이터센터 장애는 `upstream`, 파서 성공률은 `parser`의 doubles를 집계한다. request ID로 Workers 구조화 로그와 클라이언트 보고를 연결한다.

## 장애 확인 순서

1. 사용자에게 화면 하단 request ID와 앱/API/서버 버전을 받는다.
2. Workers Logs에서 같은 request ID를 찾는다.
3. `errorSource`가 `nexon`, `data-center`, `parser`, `worker`, `client` 중 무엇인지 확인한다.
4. upstream 이벤트의 단계·상태·응답시간, parser 이벤트의 누락 필드와 signature를 확인한다.
5. 파서 오류라면 `apps/api/src/dataCenterParser.fixtures.ts`에 개인정보가 없는 재현 fixture를 추가한 뒤 테스트한다.

## 공개 API 및 CORS 정책

현재 Worker는 인증 없는 네이티브 클라이언트용 공개 읽기 API다. 전체 요청 분당 60회, 고비용 경로 분당 20회 제한을 적용한다. `ALLOWED_ORIGINS="*"`는 네이티브 앱과 개발 환경을 위한 명시적 현재 정책이며 접근 통제 수단이 아니다. 웹 클라이언트를 특정 도메인으로 배포하면 정확한 origin allowlist로 교체한다.
