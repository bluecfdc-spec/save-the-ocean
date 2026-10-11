// ─────────────────────────────────────────────────────────────
//  세력 정의 — 세 게임·허브 공통. 번호(1~3)는 오션의 기존 저장 값과 같다
// ─────────────────────────────────────────────────────────────
window.DG_FAC = {
  surge: { id: 1, key: 'surge', name: '서지', en: 'SURGE', jp: 'サージ', col: '#4fd8ff', glow: 'rgba(79,216,255,',  img: 'f_surge.png', side: '인간', symbol: '파도·물' },
  gale:  { id: 2, key: 'gale',  name: '게일', en: 'GALE',  jp: 'ゲイル', col: '#c58bff', glow: 'rgba(197,139,255,', img: 'f_gale.png',  side: 'AI',   symbol: '폭풍·번개' },
  solar: { id: 3, key: 'solar', name: '솔라', en: 'SOLAR', jp: 'ソーラ', col: '#ffd451', glow: 'rgba(255,212,81,',  img: 'f_solar.png', side: '천사', symbol: '태양·빛' }
};
window.DG_FAC_LIST = ['surge', 'gale', 'solar'];
window.DG_FAC_BY_ID = { 1: 'surge', 2: 'gale', 3: 'solar' };
// 저장 키 하나로 세 게임이 같은 세력을 본다
window.dgGetFac = function () { try { var f = localStorage.getItem('dg_fac') || localStorage.getItem('tank_fac'); return window.DG_FAC[f] ? f : null; } catch (e) { return null; } };
window.dgSetFac = function (f) { try { localStorage.setItem('dg_fac', f); localStorage.setItem('tank_fac', f); } catch (e) { } };
