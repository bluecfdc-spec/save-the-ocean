#!/usr/bin/env bash
# 네이티브(android/, ios/) 프로젝트를 처음 생성하고 설정을 적용한다.
# GitHub Actions(bootstrap.yml)가 실행하며, Mac 에서 직접 실행해도 된다: bash scripts/bootstrap-native.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ npm install"
npm install --no-audit --no-fund

echo "▶ vendor + bundle (www/vendor)"
npm run build

echo "▶ capacitor add"
[ -d android ] || npx cap add android
[ -d ios ] || npx cap add ios

echo "▶ trapeze (세로 고정, 앱 이름, Apple 로그인 권한)"
npx trapeze run trapeze.config.yaml -y --android-project android --ios-project ios/App

echo "▶ android: google-services 플러그인 (google-services.json 이 있을 때만 적용)"
GS_CLASSPATH="classpath 'com.google.gms:google-services:4.4.2'"
if ! grep -q "google-services" android/build.gradle; then
  # buildscript.dependencies 블록에 classpath 추가
  perl -0pi -e "s/(dependencies\s*\{)/\$1\n        $GS_CLASSPATH/" android/build.gradle
fi
if ! grep -q "google-services.json" android/app/build.gradle; then
  cat >> android/app/build.gradle <<'EOF'

// Firebase (Google 로그인/App Check): android/app/google-services.json 이 있을 때만 활성화
if (file('google-services.json').exists()) {
    apply plugin: 'com.google.gms.google-services'
}
EOF
fi

echo "▶ android: 서명 설정 (CI 시크릿이 있을 때만 사용)"
if ! grep -q "RELEASE_KEYSTORE" android/app/build.gradle; then
  cat >> android/app/build.gradle <<'EOF'

// 릴리스 서명: 환경변수(RELEASE_KEYSTORE 등)가 있을 때만 서명 (android.yml 참고)
def rk = System.getenv("RELEASE_KEYSTORE")
if (rk != null && file(rk).exists()) {
    android {
        signingConfigs {
            release {
                storeFile file(rk)
                storePassword System.getenv("RELEASE_KEYSTORE_PASSWORD")
                keyAlias System.getenv("RELEASE_KEY_ALIAS")
                keyPassword System.getenv("RELEASE_KEY_PASSWORD")
            }
        }
        buildTypes { release { signingConfig signingConfigs.release } }
    }
}
// 빌드 번호를 CI 실행 번호로 (VERSION_CODE 환경변수)
def vc = System.getenv("VERSION_CODE")
if (vc != null) { android { defaultConfig { versionCode vc.toInteger() } } }
EOF
fi

echo "▶ ios: Xcode Cloud 스크립트 (ci_scripts/ci_post_clone.sh)"
mkdir -p ios/App/ci_scripts
cat > ios/App/ci_scripts/ci_post_clone.sh <<'EOF'
#!/bin/sh
# Xcode Cloud: 저장소 클론 직후 실행. 웹 리소스 빌드 + Capacitor 동기화 + CocoaPods
set -e
export HOMEBREW_NO_INSTALL_CLEANUP=1
brew install node cocoapods >/dev/null 2>&1 || true
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install --no-audit --no-fund
npm run build
npx cap sync ios
# Firebase 설정 파일: Xcode Cloud 환경변수 GOOGLE_SERVICE_INFO_PLIST(base64) 가 있으면 복원
if [ -n "${GOOGLE_SERVICE_INFO_PLIST:-}" ]; then
  echo "$GOOGLE_SERVICE_INFO_PLIST" | base64 --decode > ios/App/App/GoogleService-Info.plist
fi
EOF
chmod +x ios/App/ci_scripts/ci_post_clone.sh

echo "▶ ios: Firebase 설정 파일 자리(placeholder) 추가 — Firebase 콘솔에서 받은 GoogleService-Info.plist 로 교체하세요"
if [ ! -f ios/App/App/GoogleService-Info.plist ]; then
  node - <<'NODE'
const fs = require('fs');
const src = fs.readFileSync('www/firebase-config.js', 'utf8');
const g = k => (src.match(new RegExp(k + ':\\s*"([^"]+)"')) || [])[1] || '';
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>API_KEY</key><string>${g('apiKey')}</string>
<key>GCM_SENDER_ID</key><string>${g('messagingSenderId')}</string>
<key>PLIST_VERSION</key><string>1</string>
<key>BUNDLE_ID</key><string>com.bluecfdc.savetheocean</string>
<key>PROJECT_ID</key><string>${g('projectId')}</string>
<key>STORAGE_BUCKET</key><string>${g('storageBucket')}</string>
<key>IS_ADS_ENABLED</key><false/><key>IS_ANALYTICS_ENABLED</key><false/><key>IS_APPINVITE_ENABLED</key><true/><key>IS_GCM_ENABLED</key><true/><key>IS_SIGNIN_ENABLED</key><true/>
<key>GOOGLE_APP_ID</key><string>${g('appId')}</string>
</dict></plist>
`;
fs.writeFileSync('ios/App/App/GoogleService-Info.plist', plist);
NODE
fi
# Xcode 프로젝트에 파일 참조 추가 (이미 폴더 동기화 방식이면 건너뜀)
ruby - <<'RUBY' || echo "(xcodeproj 참조 추가 건너뜀)"
require 'xcodeproj'
p = Xcodeproj::Project.open('ios/App/App.xcodeproj')
t = p.targets.find { |x| x.name == 'App' }
g = p.main_group.find_subpath('App', false)
if g && g.respond_to?(:files) && !g.files.any? { |f| f.path == 'GoogleService-Info.plist' }
  ref = g.new_file('GoogleService-Info.plist')
  t.resources_build_phase.add_file_reference(ref)
  p.save
  puts 'GoogleService-Info.plist added to target'
end
RUBY

echo "▶ 앱 아이콘/스플래시 생성 (resources/icon.png, resources/splash.png)"
if [ -f resources/icon.png ]; then npm run assets || echo "(assets 생성 실패 — 나중에 다시)"; fi

echo "▶ cap sync"
npx cap sync

echo "✅ bootstrap 완료"
