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
window.SEASON_SUFFIX = "_s1";

// 지난 시즌 1위 목록 — 시즌이 끝날 때마다 한 줄씩 추가
// 예: { n: 1, range: "09.29 ~ 10.05", name: "바다의수호자", score: 12480 }
window.SEASONS_DATA = [];

// 기본 공지 (Firebase 콘솔의 visits/notice 문서가 있으면 그 내용이 우선)
//  · Firestore > visits 컬렉션 > 문서 ID "notice" > 필드: active(boolean), title(string), body(string), button(string)
window.DEFAULT_NOTICE = {
  active: true,
  title: "📢 시즌 1 시작!",
  body: "게임 밸런스 조정을 마치고 기록을 새로 시작합니다.\n이전 기록은 초기화되었습니다.\n\n어뢰는 시간이 갈수록 늘어나 4분 30초에 최고조!\n쉴드(20척 격파)와 드릴 아이템을 활용해 보세요.",
  button: "확인"
};
