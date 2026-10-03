// ============================================================================
//  시즌 상태 — 이 파일은 GitHub Actions(.github/workflows/season.yml)가
//  매주 월요일 00:00(KST)에 tools/rollover.mjs 로 자동 갱신합니다. 손으로 고쳐도 됩니다.
// ============================================================================
//  SEASON_SUFFIX : 지금 점수가 쌓이는 게시판 접미사 (scores_s1, plays_s1 ...)
//  SEASON_START  : 현재 시즌 시작일 (YYYY-MM-DD)
//  SEASONS_DATA  : 끝난 시즌 1위 목록 (오래된 순). 시작 화면 "👑 시즌 1위"에 표시
window.SEASON_SUFFIX = "_s1";
window.SEASON_START = "2026-09-29";
window.SEASONS_DATA = [];
