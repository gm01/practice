# 출시 체크리스트

## 필수

- [x] 개인정보처리방침의 문의 연락처 추가
- [ ] 애플리케이션 이름과 설명 최종 확인
- [ ] macOS Developer ID 서명 및 공증 또는 미서명 앱 안내 결정
- [ ] Windows 코드 서명 인증서 적용 여부 결정
- [ ] 실제 사용자 API 키로 경기·거래·랭커 조회 확인
- [ ] 다른 구단주명, 기록 없는 계정, 잘못된 API 키 확인
- [ ] 작은 화면 및 긴 닉네임 표시 확인
- [ ] NEXON Open API 출처 표기 확인
- [ ] 설치 파일 바이러스 검사

## 배포 명령

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

생성된 설치 파일은 `release/` 폴더에 저장됩니다.
