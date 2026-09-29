# Save the Ocean — 앱 출시 준비 가이드 (홍균님용)

코드는 `app` 브랜치에 준비돼 있습니다. 아래는 **계정과 키 값** 관련이라 홍균님이 직접 해야 하는 것들이고,
순서대로 하나씩 끝내면 됩니다. 각 단계에서 나온 값은 GitHub 저장소의
**Settings → Secrets and variables → Actions → New repository secret** 에 넣습니다.

---

## 0. 지금 구조 한눈에

| 구성 | 담당 | 비용 |
|---|---|---|
| 게임 코드 (`www/`) | 저장소 `app` 브랜치 | 무료 |
| Android 빌드 (APK/AAB) | GitHub Actions (`android.yml`) | 무료 (공개 저장소) |
| iOS 빌드 + TestFlight 업로드 | **Xcode Cloud** (App Store Connect 웹에서 설정, Mac 불필요) | 월 25시간 무료 |
| 순위판 DB / 로그인 | Firebase (기존 프로젝트 `save-the-ocean-a96f1`) | 무료 플랜 |
| 인앱결제 (₩5,000) | RevenueCat (양쪽 스토어 영수증 처리·복원) | 무료 (월 매출 $2,500 까지) |

---

## 1. 스토어 개발자 계정 (제일 먼저 — 승인까지 며칠 걸림)

### Google Play Console — US$25 (1회)
1. https://play.google.com/console 접속 → 개인 계정으로 등록
2. 본인 인증(신분증) 완료
3. **주의**: 2023년 11월 이후 신규 개인 계정은 앱을 정식 출시하기 전에
   **비공개 테스트에 테스터 12명 이상, 14일 연속** 참여가 필요합니다. 지인 테스터 그룹 이메일을 모아두세요.

### Apple Developer Program — US$99 (연간)
1. 아이패드에서 App Store → **"Apple Developer"** 앱 설치 → 로그인 → Enroll
2. 개인(Individual)로 등록, 결제
3. 승인 메일이 오면 https://appstoreconnect.apple.com 접속 가능

---

## 2. Firebase 콘솔 설정 (https://console.firebase.google.com → 프로젝트 `save-the-ocean`)

### 2-1. 로그인 방식 켜기 — Authentication → Sign-in method
- **익명** : 사용 설정 (앱이 시작할 때 자동 로그인, 순위판 읽기용)
- **Google** : 사용 설정 (지원 이메일 선택)
- **Apple** : 사용 설정 (Apple 개발자 계정 승인 후. Services ID 등은 iOS 앱만 쓰면 비워도 됨)

### 2-2. 앱 등록 — 프로젝트 설정 → 일반 → "앱 추가"
- **Android** 앱 추가: 패키지 이름 `com.bluecfdc.savetheocean`
  - **SHA-1 지문**이 필요합니다 (Google 로그인용). 값은 GitHub Actions 의 Android 빌드 로그 맨 위 "Signing SHA-1" 에 출력됩니다 (서명 키를 만든 뒤 — 4단계).
  - `google-services.json` 다운로드 → 아래 명령으로 base64 로 바꿔 시크릿 `GOOGLE_SERVICES_JSON` 에 저장
    - Mac/리눅스: `base64 -i google-services.json | pbcopy`
    - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json")) | Set-Clipboard`
- **iOS** 앱 추가: 번들 ID `com.bluecfdc.savetheocean`
  - `GoogleService-Info.plist` 다운로드 → base64 로 바꿔 **Xcode Cloud 환경변수** `GOOGLE_SERVICE_INFO_PLIST` 에 저장 (5단계)

### 2-3. Firestore 규칙 교체 — Firestore Database → 규칙
- 저장소의 `firestore.rules` 내용을 그대로 붙여넣고 게시
- 바뀌는 점: 모든 접근에 로그인 필요(앱은 자동 익명 로그인), 이름 있는 기록은 Apple/Google 로그인 사용자만 본인 uid 로 등록
- ⚠️ 이 규칙을 게시하면 **기존 웹 버전은 순위판을 못 읽습니다** (웹 종료 시점에 맞춰 게시)

### 2-4. App Check — 빌드 및 출시 → App Check
- Android 앱: **Play Integrity** 등록 / iOS 앱: **App Attest** 등록
- 처음엔 "모니터링" 상태로 두고, 앱 출시 후 Firestore 에 대해 **"적용"** 을 켜면 앱 밖에서 오는 요청이 차단됩니다

---

## 3. RevenueCat (https://app.revenuecat.com — 무료 가입)
1. 새 Project 생성 → **Apps** 에 App Store 앱과 Play Store 앱 각각 추가
   - App Store: 번들 ID + App Store Connect **In-App Purchase Key** 업로드 (RevenueCat 화면의 안내대로)
   - Play Store: 패키지 이름 + Google Cloud **서비스 계정 JSON** (안내대로)
2. **Products**: 양쪽 스토어에 만든 상품 ID `premium_unlock` 을 각각 등록
3. **Entitlements**: `premium` 생성 → 위 두 상품 연결
4. **Offerings**: `default` 오퍼링에 `premium_unlock` 패키지 추가
5. **API keys** 에서 Apple 용(`appl_...`), Google 용(`goog_...`) 공개 키를 복사 → `www/app-config.js` 의 `rcAppleKey`, `rcGoogleKey` 에 붙여넣기 (공개 키라 저장소에 있어도 됩니다)

### 스토어 쪽 상품 등록
- **App Store Connect** → 앱 → 인앱 구입 → **비소모성**, 제품 ID `premium_unlock`, 가격 티어 ₩5,000 근처 (Apple 은 국가별 가격을 자동 환산)
- **Play Console** → 앱 → 수익 창출 → 인앱 상품 → ID `premium_unlock`, 가격 ₩5,000

---

## 4. Android 서명 키 (한 번 만들면 영구 보관 — 잃어버리면 앱 업데이트 불가)
Java 가 있는 컴퓨터에서 (또는 GitHub Actions 로 만들어 드릴 수 있음):
```
keytool -genkeypair -v -keystore release.keystore -alias savetheocean -keyalg RSA -keysize 2048 -validity 10000
```
- 시크릿 4개: `ANDROID_KEYSTORE_BASE64` (파일을 base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (=savetheocean), `ANDROID_KEY_PASSWORD`
- 시크릿이 들어가면 Actions 가 Play 업로드용 **AAB** 를 만들어 줍니다 (Actions → 해당 실행 → Artifacts 에서 다운로드 → Play Console 에 업로드)
- Play Console 에서 "Google Play 앱 서명" 사용 (기본값) → 콘솔이 알려주는 **앱 서명 SHA-1** 도 Firebase Android 앱에 추가

---

## 5. iOS: Xcode Cloud 설정 (Mac 없이 TestFlight 까지)
1. App Store Connect → 나의 앱 → **+ 새로운 앱** (번들 ID `com.bluecfdc.savetheocean` 은 먼저 developer.apple.com → Identifiers 에서 만들고 **Sign in with Apple** 체크)
2. 앱 → **Xcode Cloud** 탭 → 시작하기 → GitHub 연결 → 저장소 `bluecfdc-spec/save-the-ocean`, 브랜치 `app`, 워크플로 기본값(Archive → TestFlight 내부 테스트)
3. 워크플로 → **Environment** → 환경변수 추가: `GOOGLE_SERVICE_INFO_PLIST` = plist 파일 base64 (Secret 체크)
4. 저장 → Start Build. 빌드가 끝나면 TestFlight 에 자동 등록 → 아이패드/아이폰의 TestFlight 앱으로 설치
   - 저장소의 `ios/App/ci_scripts/ci_post_clone.sh` 가 npm 설치·웹 빌드·Capacitor 동기화를 자동으로 합니다

---

## 6. 스토어 등록 시 주의
- 설명/키워드에 **"딥스캔", "SEGA" 를 쓰지 마세요** (이름·아트가 독자적이므로 언급만 안 하면 됩니다)
- 개인정보처리방침 URL 필수 (로그인·결제가 있어서). GitHub Pages 에 한 페이지 올리면 됩니다 — 요청하시면 작성해 드립니다
- 연령 등급: 만화적 폭력(경미) 로 답변
- Apple 심사: Google 로그인을 제공하므로 **Sign in with Apple 도 반드시 제공** (이미 구현됨)

---

## 7. 앱 안의 설정값 위치
| 파일 | 내용 |
|---|---|
| `www/app-config.js` | RevenueCat 키, 상품 ID, 기본 가격 표기, TOP3 맛보기 여부 |
| `www/firebase-config.js` | Firebase 설정, 시즌 접미사, 공지(한/영) |
| `www/i18n.js` | 한국어/영어 문구 전부 |
| `capacitor.config.json` | 앱 ID·이름·색상 |
| `trapeze.config.yaml` | 버전 번호(1.0.0), 세로 고정 등 네이티브 설정 |
| `firestore.rules` | Firestore 보안 규칙 |
