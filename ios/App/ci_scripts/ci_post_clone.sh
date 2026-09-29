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
