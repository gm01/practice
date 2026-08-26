# FC Online Lab

FC Online 경기 기록, 득점 흐름, 슈팅 위치, 선수 평점과 랭커 기록을 확인하는 Electron 데스크톱 앱입니다.

Data based on NEXON Open API

## 주요 기능

- 구단주명 기반 최근 경기 조회
- 경기 요약, 득점·도움 타임라인, 통계, 라인업, 슈팅 맵
- TOP 10,000 랭커 선수 평균 비교
- API 키 계정의 최근 거래 기록
- 최고 평점 선수를 활용한 대표 이미지

거래 API는 OUID를 지원하지 않으므로 임의 구단주의 거래 기록은 조회할 수 없습니다.

## 개발 실행

```bash
npm install
npm run dev
```

### Android / iOS 공통 앱

```bash
cd apps/mobile
npm install
npm run android  # Android
npm run ios      # iOS (macOS 필요)
```

모바일 앱은 Expo와 React Native를 사용하며 Android와 iOS가 하나의 화면·데이터 코드를 공유합니다.

## 품질 검사

```bash
npm test
npm run typecheck
npm run build
```

## 설치 파일 생성

```bash
npm run dist:mac
```

Windows와 Linux는 각각 `npm run dist:win`, `npm run dist:linux`를 사용합니다. 결과물은 `release/`에 생성됩니다.

## 개인정보 및 배포

API 키는 저장하지 않습니다. 구단주명만 사용자 기기의 Electron 애플리케이션 데이터 폴더에 저장합니다. 자세한 내용은 [PRIVACY.md](PRIVACY.md)를 확인하세요.

[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)의 미완료 항목을 확인하세요. 공개 배포 전 개인정보 문의 연락처와 플랫폼 코드 서명 설정이 필요합니다.

FC Online 및 NEXON은 각 권리자의 상표입니다. 본 프로젝트는 NEXON의 공식 애플리케이션이 아닙니다.
