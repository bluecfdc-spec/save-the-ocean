// ─────────────────────────────────────────────────────────────
//  Firebase 설정 (프로젝트: save-the-ocean)
// ─────────────────────────────────────────────────────────────
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBZKvHoZeBovOURFrkT_H3BTcJ6495zUvM",
  authDomain: "save-the-ocean-a96f1.firebaseapp.com",
  projectId: "save-the-ocean-a96f1",
  storageBucket: "save-the-ocean-a96f1.firebasestorage.app",
  messagingSenderId: "1047701817156",
  appId: "1:1047701817156:web:923b1374f715b79e787911",
  measurementId: "G-PJRDY47RH8"
};

// 점수 컬렉션 기본 이름
window.SCORES_COLLECTION = "scores";

// 시즌 접미사 — 새 시즌을 시작하려면 "_s2", "_s3" 처럼 바꾸면
// scores_s2 / plays_s2 컬렉션에 새로 쌓입니다 (이전 시즌 기록은 그대로 보존).
window.SEASON_SUFFIX = "";

// 지난 시즌 1위 목록 — 시즌이 끝날 때마다 한 줄씩 추가
// 예: { n: 1, range: "09.29 ~ 10.05", name: "바다의수호자", score: 12480 }
window.SEASONS_DATA = [];
