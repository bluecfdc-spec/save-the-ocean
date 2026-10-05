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

// 시즌 접미사·지난 시즌 1위 목록은 season.js 로 이동 (자동 갱신)

// 기본 공지 (Firebase 콘솔의 visits/notice 문서가 있으면 그 내용이 우선)
//  · Firestore > visits 컬렉션 > 문서 ID "notice" > 필드: active(boolean), title(string), body(string), button(string)
window.DEFAULT_NOTICE = {
  active: false,   // 베타 안내는 끝남. 공지는 Firestore visits/notice 문서로 띄웁니다
  title: "☕ 베타 테스트 중!",
  body: "지금은 베타 기간입니다.\n이번 주 금요일(10/2) 00시에 완성본을 배포할 예정이에요.\n\n그 전까지 의견을 주시는 분께는\n커피 쿠폰을 드립니다! ☕\n\n불편한 점, 아이디어, 버그 뭐든 환영합니다.",
  button: "확인",
  en: { title: "☕ Beta test in progress!", body: "This is the beta period.\nThe full release is scheduled for Friday (10/2) at 00:00 KST.\n\nFeedback of any kind — bugs, ideas, annoyances — is welcome!", button: "OK" },
  ja: { title: "☕ ベータテスト中！", body: "現在はベータ期間です。\n今週金曜日(10/2) 0時に完成版を公開予定です。\n\n不具合・アイデア・気になる点など、ご意見をお待ちしています！", button: "OK" }
};
