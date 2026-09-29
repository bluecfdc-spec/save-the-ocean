// ─────────────────────────────────────────────────────────────
//  앱(스토어 버전) 설정 — 계정 생성 후 값만 채우면 됩니다 (APP-SETUP.md 참고)
// ─────────────────────────────────────────────────────────────
window.APP_CONFIG = {
  // RevenueCat 공개 API 키 (RevenueCat 대시보드 → Project → API keys)
  //  · Apple App Store 용은 "appl_..." , Google Play 용은 "goog_..." 로 시작
  rcAppleKey: "",
  rcGoogleKey: "",
  // RevenueCat Entitlement 식별자와 상품 ID (양쪽 스토어에 같은 ID로 등록)
  entitlement: "premium",
  productId: "premium_unlock",

  // 스토어 가격을 아직 못 읽었을 때 보여줄 기본 표기
  fallbackPrice: { ko: "₩5,000", en: "US$3.99" },

  // 무료 사용자에게 시즌 TOP 3 를 맛보기로 보여줄지 (false 면 자물쇠만 표시)
  showTop3Teaser: true,

  // 개발용: 브라우저에서 localStorage.setItem('sto_dev_premium','1') 하면 프리미엄으로 동작
  allowDevOverride: true,

  // 스토어 링크 (웹 버전 안내용) — 출시 후 채우기
  storeUrl: { ios: "", android: "" }
};
