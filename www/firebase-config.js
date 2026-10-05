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

// 주간 시즌 번호는 leaderboard.js 가 날짜로 계산합니다 (앱 업데이트 없이 매주 월요일 00:00 KST 에 넘어감)
window.SEASONS_DATA = [];

// 기본 공지 (Firebase 콘솔의 visits/notice_app 문서가 있으면 그 내용이 우선 — 웹의 notice 와 분리)
//  · Firestore > visits 컬렉션 > 문서 ID "notice_app" > 필드: active(boolean), title(string), body(string), button(string)
//  · 영어 사용자용 필드: title_en / body_en / button_en (없으면 한국어 표시)
window.DEFAULT_NOTICE = {
  active: false,
  title: "🌊 시즌 1 시작!",
  body: "전 세계 플레이어와 순위를 겨뤄보세요.",
  button: "확인",
  en: { title: "🌊 Season 1 begins!", body: "Compete with players around the world.", button: "OK" }
};

// 앱 공지는 웹과 분리된 문서를 읽습니다 (Firestore visits/notice_app)
window.NOTICE_DOC = "notice_app";
