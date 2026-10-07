# 아버지 명의 계정으로 다시 세팅할 때 할 일 (2026-10-07 결정)

배경: 홍균 개인 Apple Developer 멤버십은 환불 요청. 출시·수익화는 아버지 명의(개인사업자)로 처음부터 진행.
지금 저장소의 iOS 설정(팀 자동 감지, CI 인증서, API 키)은 홍균 계정 기준이라 그대로는 쓸 수 없다.

## 그대로 쓰는 것
- 게임 코드·웹(main 브랜치), Firebase 프로젝트(save-the-ocean-a96f1), 순위판·점령전 기록
- 앱 이름 Ocean Rumble, 아이콘·타이틀 그림

## 다시 할 것 — iOS (아버지 Apple 계정)
1. 아버지 Apple 계정 생성 → Apple Developer Program **개인**으로 가입(본인 인증 필요, 연 99달러)
2. 새 번들 ID 등록 (예: com.<새이름>.oceanrumble, Sign In with Apple 포함)
   - 옛 번들 ID com.bluecfdc.savetheocean 은 홍균 팀에 묶여 있어 재사용이 안 될 수 있음
3. App Store Connect에 앱 생성(이름 Ocean Rumble) — 홍균 계정 쪽에서 이 이름을 쓰지 않았는지 확인
4. App Store Connect API 키 발급 → Issuer ID / Key ID 는 ios/signing.env, .p8 은 GitHub 시크릿 ASC_KEY_P8 교체
5. ios/signing/dist.p12.enc 삭제 → CI가 새 팀 인증서를 다시 만든다
6. Firebase에 새 번들 ID로 iOS 앱 등록 → GoogleService-Info.plist 교체
7. 코드의 번들 ID 교체: capacitor.config.json appId, ios pbxproj PRODUCT_BUNDLE_IDENTIFIER, trapeze.config.yaml
8. 홍균을 App Store Connect 사용자(관리자)로 초대
9. 유료 앱 계약·계좌·세금 정보 → 결제(5천원 무제한 등록) 기능

## 다시 할 것 — Android (아버지 Google 계정, 조직)
1. 아버지 사업자로 D-U-N-S 번호 발급
2. Play Console **조직** 계정 생성(25달러) → 테스터 12명·14일 면제
3. 홍균 초대, 서명 키(업로드 키) 새로 만들고 AAB 업로드 파이프라인 연결
4. Firebase에 Android 앱 등록(google-services.json), Google 로그인 연결

## 홍균 계정 쪽 정리
- 환불 확정 후: App Store Connect API 키 폐기, GitHub 시크릿 ASC_KEY_P8 삭제
- Google 개인 계정은 연회비가 없어 그대로 둬도 됨
