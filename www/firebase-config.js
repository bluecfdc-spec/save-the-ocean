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
  active: false,   // 출시 날 켜기 (또는 Firestore visits/notice_app 문서로 띄우기)
  title: "🌊 바다 점령전 시작!",
  body: "이제 세 세력 — 서지 · 게일 · 솔라 — 으로 나뉘어 싸웁니다.\n\n· 처음 기록을 올릴 때 세력을 고르세요.\n· 올린 점수는 모두 우리 세력에 한 달 동안 누적됩니다.\n· 누적 점수가 많을수록 지도의 바다를 더 넓게 차지합니다.\n· 매달 1일, 가장 넓은 바다를 차지한 세력이 명예의 전당에 오릅니다.\n\n개인 순위는 따로 겨룹니다.\n주간 TOP 10 은 매주 월요일에 새로 시작하고, 주간 1위도 명예의 전당에 기록됩니다.\n\n우리 세력의 바다를 넓혀보세요!",
  button: "출격",
  en: { title: "🌊 Ocean War begins!", body: "Players now fight as three factions — Surge, Gale and Solar.\n\n· Pick your faction the first time you post a score.\n· Every score you post adds to your faction's total for the month.\n· The bigger the total, the more ocean your faction holds on the map.\n· On the 1st of each month, the faction holding the most ocean enters the Hall of Fame.\n\nPersonal rankings are separate.\nThe weekly TOP 10 resets every Monday, and each weekly champion is recorded in the Hall of Fame too.\n\nClaim the ocean for your faction!", button: "Deploy" },
  ja: { title: "🌊 海域争奪戦、開幕！", body: "これからは三つの勢力 — サージ・ゲイル・ソーラー — に分かれて戦います。\n\n· 初めてスコアを登録するときに勢力を選びます。\n· 登録したスコアはすべて、1か月間その勢力に加算されます。\n· 合計が多いほど、地図の海を広く占領できます。\n· 毎月1日、最も広い海を占領した勢力が殿堂入りします。\n\n個人ランキングは別に競います。\n週間TOP 10は毎週月曜日にリセットされ、週間1位も殿堂に記録されます。\n\n自分の勢力の海を広げよう！", button: "出撃" }
};

// 앱 공지는 웹과 분리된 문서를 읽습니다 (Firestore visits/notice_app)
window.NOTICE_DOC = "notice_app";
