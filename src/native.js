// 네이티브 플러그인 묶음 — CI 에서 esbuild 로 www/vendor/native.js 로 번들됨.
// 브라우저(웹)에서는 이 파일이 없어도 게임이 동작하도록 premium.js 가 window.Native 부재를 처리함.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

window.Native = { Capacitor, App, StatusBar, SplashScreen, Purchases, FirebaseAuthentication };

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  if (Capacitor.getPlatform() === 'android') StatusBar.setBackgroundColor({ color: '#04101c' }).catch(() => {});
  // 게임 로딩 후 스플래시 닫기
  window.addEventListener('load', () => setTimeout(() => SplashScreen.hide().catch(() => {}), 300));
  // 안드로이드 뒤로가기: 게임 중이면 무시, 시작 화면이면 앱 종료
  App.addListener('backButton', () => {
    const g = window.__savetheocean;
    if (g && g.state === 'play') return;
    App.exitApp();
  });
}
