# 출시 체크리스트

## 필수

- [x] 개인정보처리방침의 문의 연락처 추가
- [ ] 애플리케이션 이름과 설명 최종 확인
- [ ] macOS Developer ID 서명 및 공증 또는 미서명 앱 안내 결정
- [ ] Windows 코드 서명 인증서 적용 여부 결정
- [ ] 운영 Worker를 통한 경기·선수 검색·선수 상세 조회 확인
- [ ] 다른 구단주명, 기록 없는 계정, 서버 인증 오류 확인
- [ ] 작은 화면 및 긴 닉네임 표시 확인
- [ ] NEXON Open API 출처 표기 확인
- [ ] 설치 파일 바이러스 검사
- [x] 익명 request ID와 앱/API/서버 버전 표시
- [x] 클라이언트 오류 전송 실패 시 20건 제한 큐 검증
- [x] Worker 경로·upstream·파서 지표 및 오류 원인 분류
- [x] 공개 네이티브 API/CORS 정책 문서화

## 배포 명령

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

생성된 설치 파일은 `release/` 폴더에 저장됩니다.
