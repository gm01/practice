# FC Online Lab 개발 인수인계

> 저장소: `https://github.com/gm01/practice.git`

<!-- AUTO_STATUS_START -->
- 마지막 자동 동기화: `2026-09-01 14:29:13 KST`
- 동기화 이벤트: `커밋`
- 작업 브랜치: `codex/fconline-dashboard-improvements`
- 문서 기준: 이 파일이 포함된 최신 Git 커밋 (정확한 해시는 `git log -1 -- PROJECT_STATUS.md`로 확인)
- 운영 API: `https://fc-online-lab-api.bebebe97.workers.dev`
- 마지막 API 배포 버전: `09b60104-bd6b-42ee-a37c-775d9173e4fe`
- 마지막 API 배포 시각: `2026-09-01 14:26:59 KST`
<!-- AUTO_STATUS_END -->

이 문서는 다른 컴퓨터, 다른 개발자 또는 다른 AI 개발 환경에서 FC Online Lab 개발을 바로 이어가기 위한 현재 상태 요약이다. 코드와 Git 커밋에 남지 않는 의사결정, 외부 서비스 설정, 실행 방법과 알려진 제약을 함께 기록한다.

## 1. 프로젝트 목표와 현재 상태

FC Online Lab은 구단주명을 기준으로 최근 경기와 선수 데이터를 분석하는 비공식 FC Online 도구다.

- Electron 데스크톱 앱
- Expo/React Native 기반 Android·iOS 공통 앱
- NEXON Open API 키를 보호하는 Cloudflare Workers 백엔드
- 선수 검색·상세 정보·팀컬러 적용·선수 비교 기능

현재 개발 브랜치는 GitHub에 푸시되어 있으며 Cloudflare API도 운영 주소에 배포되어 있다. iOS App Store, TestFlight, Google Play에는 아직 등록하지 않았다.

운영 API 정보는 문서 상단의 자동 상태 블록에서 관리한다.

- `https://fc-online-lab-api.bebebe97.workers.dev`
- 상태 확인: `GET /` 또는 `GET /health`

## 2. 저장소 구조

```text
FC04/
├── src/                    Electron 렌더러(React)
│   ├── App.tsx             데스크톱 화면과 전체 탐색 상태
│   ├── components/
│   │   ├── AnalysisReport.tsx
│   │   ├── PlayerDatabase.tsx
│   │   ├── PlayerDetail.tsx
│   │   └── PlayerPhoto.tsx
│   └── styles.css
├── electron/               Electron main/preload
├── apps/
│   ├── mobile/             Expo React Native Android/iOS 앱
│   │   ├── App.tsx
│   │   └── src/
│   │       ├── api.ts
│   │       ├── storage.ts
│   │       ├── styles.ts
│   │       └── types.ts
│   └── api/                Cloudflare Workers API
│       ├── src/
│       │   ├── index.ts
│       │   ├── dataCenterParser.ts
│       │   ├── observability.ts
│       │   ├── clientTelemetry.ts
│       │   ├── cors.ts
│       │   ├── playerFactCache.ts
│       │   ├── playerSearchPolicy.ts
│       │   └── runtimeProtection.ts
│       ├── migrations/       D1 선수 카탈로그 스키마
│       ├── scripts/          공식 메타데이터 초기 적재 도구
│       └── wrangler.jsonc
├── shared/                 데스크톱 공통 NEXON 변환 로직과 테스트
├── PRIVACY.md
├── RELEASE_CHECKLIST.md
└── PROJECT_STATUS.md
```

## 3. 구현 완료 기능

### 경기·구단주 조회

- 구단주명으로 `/fconline/v1/id`를 호출해 OUID 재조회
- 최근 공식경기 조회 및 추가 경기 불러오기
- 최근 검색, 즐겨찾기, 조회 상태 유지
- 승·무·패, 평균 득실, 연승·연패, 슈팅 효율 분석
- 시간대별 득점·실점과 규칙 기반 분석 문구
- 네트워크 오류 유형별 안내와 재시도
- 모바일 당겨서 새로고침과 키보드 대응

### 경기 상세

- 경기 요약, 득점자·도움 선수 표시
- 양 팀 통계 비교
- 세로 경기장 포메이션과 선수 배치
- 포메이션 계산을 수비부터 공격 순서로 표시
  - 예: `4-2-3-1`
- 슛맵 필터: 전체, 내 팀, 상대 팀, 득점, 실패
- 슈팅 지점 선택 시 선수·시간·도움 기록 표시
- 라인업 득점·도움 아이콘 중복 표시
- 최고 평점 선수를 구단주 대표 이미지로 사용
- 자책골 등 Open API에서 시간·선수가 누락되는 데이터 안내

### 플레이어 리포트

- 선수 누적 카드 선택 시 플레이어 리포트로 이동
- 출전 수, 평균 평점, 골·도움, 공격 포인트
- 슈팅·유효 슈팅, 패스 성공률
- 최근 평점 흐름과 출전 경기
- 결과별·포지션별·강화 단계별 기록
- 선수별 슈팅 위치
- 함께 뛸 때 성적이 좋은 선수
- 리포트 선수 사진에 시즌 아이콘 표시
- 리포트 상단 선수 사진 선택 시 해당 선수명 검색
- 모바일에서는 선수 검색 화면에서 뒤로가기 시 기존 플레이어 리포트 복귀

### 선수 정보

- 선수명 검색 및 OVR 내림차순 정렬
- 시즌별 선수 카드와 시즌 아이콘
- 검색 목록 정보
  - 선수명
  - 왼발·오른발 수치(왼발은 좌측, 오른발은 우측)
  - 주 포지션
  - 급여
  - OVR
  - 기본 강화 단계 `1강`
- 선수 사진, 국가, 신체 정보, 개인기
- 포지션별 OVR과 세부 능력치
- 능력치 구간별 색상
- 시세와 최근 가격 흐름
- 특성 및 클럽 경력
- 강화 단계 1~13 선택
- 적응도·강화·소속·관계/특성 팀컬러 적용
- 선수 즐겨찾기
- 시즌 아이콘을 사진 원형 마스크와 분리해 잘림 방지
- Cloudflare D1 선수 기본 정보 88,246장·시즌 152개 초기 저장
- 검색 결과 페이지 처리 및 모바일 가상 목록 적용
- 데이터센터 장애 시 D1 선수 기본 정보와 저장된 상세 능력치로 대체 조회
- 선수·시즌·팀컬러 매일 03:00 KST 자동 동기화
- 마지막 데이터 갱신 시각과 신규 시즌·선수 자동 감지 상태 제공

### 선수 비교

- 검색 결과에서 두 선수 선택
- 각 선수 강화 단계 독립 선택
- OVR과 전체 세부 능력치 좌우 비교
- 우세 능력치와 수치 차이 표시
- 모바일·데스크톱 공통 제공

### 서비스·보안

- 앱에 `Data based on NEXON Open API` 표기
- NEXON API 키는 클라이언트에 포함하지 않음
- Cloudflare Workers Secret으로 `NEXON_API_KEY` 관리
- 운영 앱은 Cloudflare Worker를 통해 NEXON API 호출
- 전체 API 요청 분당 60회, 외부 호출이 큰 경로는 IP·경로별 분당 20회로 Cloudflare Rate Limiting binding 적용
- 선수 검색 후보를 요청 결과 수에 따라 최대 60장으로 제한하고, 카드·강화 단계별 데이터센터 결과를 24시간 캐시
- 같은 Worker 인스턴스에서 동시에 들어온 동일 선수 카드 요청은 하나의 데이터센터 호출로 병합
- 구단주별 조회가 불가능한 거래 화면과 클라이언트 API 키 기반 독립 랭커 경로 제거
- 개인정보처리방침과 문의 이메일 등록
- 데스크톱·모바일·Worker 공통 계약, 포메이션, 선수 비교, 네트워크 오류 처리를 `shared/`로 분리
- Electron 서비스 API와 IPC 입력 검증, Worker 데이터센터 파서·관측·CORS 모듈 분리
- timeout·offline·429·재시도·취소·stale 응답 방지 공통 처리
- 파서 필수 필드 누락 감지, 부분 실패 안내, fixture 회귀 테스트
- 익명 request ID로 클라이언트 오류와 Worker/upstream/parser 로그 연결
- 앱/API/Worker 버전 표시 및 경로별 응답시간·오류율 Analytics Engine 기록

## 4. 중요한 화면 이동 규칙

다음 탐색 동작은 사용자 요구에 따라 확정된 상태다.

1. `선수 누적`의 사진을 포함한 카드 전체 선택
2. 해당 선수의 `PLAYER REPORT`로 이동
3. PLAYER REPORT 상단의 큰 선수 사진 선택
4. 해당 선수명으로 `선수 정보` 검색 결과 표시

선수 누적의 작은 사진을 곧바로 선수 정보 검색으로 연결하면 안 된다.

## 5. 백엔드 API

Cloudflare Worker는 다음 경로를 제공한다.

| 경로 | 용도 | 주요 파라미터 |
|---|---|---|
| `GET /` | 서비스 상태 | 없음 |
| `GET /health` | 상태 확인 | 없음 |
| `GET /v1/dashboard` | 구단주 프로필·최근 경기 | `nickname`, `matchtype`, `offset`, `limit` |
| `GET /v1/players/search` | 선수 시즌 카드 검색 | `q`, `seasonIds`, `page`, `pageSize`, 상세 조건 |
| `GET /v1/players/filters` | 시즌·포지션·팀컬러 검색 조건 | 없음 |
| `GET /v1/players/detail` | 선수 상세·팀컬러 적용 | `spid`, `grade`, `adaptation`, 팀컬러 ID |
| `GET /v1/catalog/status` | D1 동기화·신규 시즌 상태 | 없음 |
| `POST /v1/telemetry/client-error` | 익명 클라이언트 오류 수집 | JSON 오류 이벤트 |

모바일 기본 API 주소는 `apps/mobile/src/api.ts`에 운영 Worker 주소로 설정되어 있다. 필요하면 `EXPO_PUBLIC_API_BASE_URL` 환경변수로 변경할 수 있다.

### 선수 데이터 출처와 주의점

- 선수명, 포지션, 시즌 등 기본 메타데이터는 NEXON Open API 정적 메타데이터 사용
- 선수 이미지와 시즌 아이콘은 공식 데이터센터 리소스 URL 사용
- 세부 능력치·시세·클럽 경력·팀컬러 선택지는 EA SPORTS FC ONLINE 데이터센터 응답을 파싱
- 공식 데이터센터 HTML 구조가 바뀌면 `apps/api/src/index.ts`의 상세 파서가 깨질 수 있음
- 검색은 `page`, `pageSize`(최대 40)를 지원하고 응답에 `total`, `hasMore`, `catalog`, `degraded`를 포함
- D1 데이터베이스: `fc-online-lab-player-catalog` (APAC), Worker binding `PLAYER_DB`
- 정기 동기화 Cron: `0 18 * * *` UTC = 매일 03:00 KST
- 초기 재적재가 필요하면 `apps/api`에서 `node scripts/build-catalog-seed.mjs` 실행 후 `npx wrangler d1 execute fc-online-lab-player-catalog --remote --file .catalog-seed.sql`
- 자체 분석값을 공식 xG로 표기하지 말고 `예상 득점 확률` 또는 `슈팅 품질 지수`로 안내

## 6. 새 환경에서 시작하기

### 저장소 받기

```bash
git clone https://github.com/gm01/practice.git
cd practice
git switch codex/fconline-dashboard-improvements
```

### 데스크톱

```bash
npm install
npm run typecheck
npm run dev
```

프로덕션 빌드와 설치 파일:

```bash
npm run build
npm run dist:mac
npm run dist:win
npm run dist:linux
```

설치 파일은 `release/`에 생성된다.

### 모바일 공통

```bash
cd apps/mobile
npm install
npm run typecheck
npm start
```

네이티브 실행:

```bash
npm run android
npm run ios
```

특정 iOS 시뮬레이터에서 실행할 때:

```bash
cd apps/mobile
npx expo run:ios --device "iPhone 17 Pro"
```

iOS는 Xcode와 iOS Simulator Runtime이 필요하다. 실제 iPhone 설치는 Xcode의 Signing & Capabilities에서 개인 또는 유료 개발자 Team을 선택하고 단말의 Developer Mode를 켜야 한다.

Android는 Android Studio, Android SDK와 에뮬레이터 또는 USB 디버깅이 활성화된 단말이 필요하다.

### API 로컬 실행

```bash
cd apps/api
npm install
cp .dev.vars.example .dev.vars
# .dev.vars에 NEXON_API_KEY 입력
npm run typecheck
npm run dev
```

`.dev.vars`와 API 키는 절대 Git에 커밋하지 않는다.

## 7. 배포 방법

### Cloudflare Worker

Cloudflare 계정 인증 후:

```bash
cd apps/api
npx wrangler login
npx wrangler secret put NEXON_API_KEY
npm run deploy
```

저장소 루트에서는 다음 명령도 사용할 수 있다.

```bash
npm run api:typecheck
npm run api:deploy
```

운영 키는 이미 Cloudflare Secret에 등록되어 있다. 새 컴퓨터에서 앱을 실행하기 위해 키를 다시 받을 필요는 없지만, Worker를 다른 Cloudflare 계정에 새로 만들거나 Secret을 교체할 때는 필요하다.

### 모바일 스토어

- 아직 App Store/TestFlight/Google Play 배포 설정은 완료되지 않음
- iOS Bundle ID: `com.gm01.fconlinelab`
- Android Package: `com.gm01.fconlinelab`
- 스토어 출시 전 `RELEASE_CHECKLIST.md` 확인

## 8. 품질 검사

루트:

```bash
npm run typecheck
npm run build
npx vitest run shared/nexon.test.ts
git diff --check
```

모바일:

```bash
cd apps/mobile
npm run typecheck
```

API:

```bash
cd apps/api
npm run typecheck
```

2026-09-01 기준 결과:

- 데스크톱 TypeScript 검사 통과
- Electron 프로덕션 빌드 통과
- 모바일 TypeScript 검사 통과
- API TypeScript 검사 통과
- 전체 Vitest 56개 테스트 통과
- Wrangler 배포 dry-run에서 Rate Limiting 2개, Analytics Engine, Version Metadata binding과 Worker 번들 검증 통과
- 로컬 Worker `/health` 200 및 진단 헤더, CORS preflight 204, 오류 수집 202, 잘못된 오류 payload 400 확인
- 운영 Worker `87caa12a-ec2e-4e3f-afe6-0d6ec87dc799`에서 `/health` 200, 선수 필터 200, 오류 수집 202, Nexon Secret 경로 및 오류 원천 분류 확인

## 9. 외부 환경에만 존재하는 정보

다음 정보는 의도적으로 Git에 저장하지 않는다.

- `NEXON_API_KEY`: Cloudflare Worker Secret
- Cloudflare 로그인 세션과 배포 권한
- Apple 개발 인증서, Provisioning Profile, Team 선택
- Android 서명 키
- Xcode DerivedData와 시뮬레이터 설치 앱
- 임시 스크린샷
- Codex 대화 원문

같은 Codex 대화를 열 수 없는 환경에서도 이 문서와 Git 히스토리를 먼저 읽으면 현재 구현 의도와 작업 상태를 복원할 수 있다.

## 10. 알려진 제약과 위험

- 선수 상세 파서는 공식 데이터센터 HTML 구조 변경에 영향을 받음
- Open API 거래내역 API는 OUID 파라미터를 지원하지 않아 임의 구단주의 개인 거래내역 조회 용도로 사용할 수 없음
- Open API가 자책골의 시간·선수 정보를 제공하지 않는 경우 정확한 타임라인 복원이 불가능함
- 선발·교체 투입 시점을 별도로 제공하지 않아 포지션 코드 기반 참고 정보만 제공
- Cloudflare의 `ALLOWED_ORIGINS=*`는 공개 네이티브 API 정책이다. 웹 배포 시 정확한 Origin allowlist로 전환해야 함
- 코드 서명과 스토어 심사 준비가 완료되지 않음
- 실사용자·기록 없는 계정·긴 닉네임·작은 화면 회귀 테스트가 더 필요함

## 11. 다음 권장 작업

1. iOS·Android 실제 단말에서 선수 비교와 플레이어 리포트 탐색 회귀 테스트
2. 선수 비교 화면의 작은 화면·긴 선수명 레이아웃 검증
3. 실제 운영 트래픽에서 경로별 p95·오류율 경보 임계치 확정
4. 데이터센터 HTML 변경 시 fixture를 갱신하는 운영 절차 점검
5. 웹 클라이언트 공개 시 Cloudflare 허용 Origin 운영값 확정
6. 앱 아이콘·스토어 설명·스크린샷 최종 제작
7. iOS TestFlight 및 Android 내부 테스트 트랙 구성
8. `RELEASE_CHECKLIST.md`의 미완료 항목 처리

## 12. Git 작업 규칙

- 기본 작업 브랜치: `codex/fconline-dashboard-improvements`
- 작업 전 `git status -sb`로 사용자 파일과 미추적 파일 확인
- FC Online과 무관한 파일은 커밋하지 않음
- API 키나 `.dev.vars`를 커밋하지 않음
- 구현 후 타입 검사·빌드·테스트를 수행한 뒤 커밋
- 운영 배포 버전과 문서 상태는 자동화 스크립트로 갱신

최근 주요 커밋은 다음 명령으로 확인한다.

```bash
git log --oneline --decorate -20
```

## 13. 문서 자동화

저장소 루트에서 `npm install`을 실행하면 `prepare` 스크립트가 버전 관리되는 `.githooks`를 자동 설치한다. 기존 환경에서는 한 번만 다음 명령을 실행한다.

```bash
npm run hooks:install
```

자동 동작:

- `git commit`: 커밋 직전에 갱신 시각과 브랜치를 반영하고 `PROJECT_STATUS.md`를 자동 스테이징
- `git push`: 문서에 커밋되지 않은 변경이 있으면 푸시를 중단해 기록 누락 방지
- `npm run api:deploy` 또는 `apps/api`의 `npm run deploy`: 배포 성공 후 Cloudflare 버전과 시각을 기록하고 문서 커밋을 원격 브랜치에 푸시

수동 동기화가 필요하면 다음을 실행한다.

```bash
npm run status:sync
```

배포 자동화는 소스와 운영 버전을 일치시키기 위해 추적 파일이 커밋되지 않은 상태에서는 배포를 중단한다. 반드시 코드 커밋 후 배포한다.
