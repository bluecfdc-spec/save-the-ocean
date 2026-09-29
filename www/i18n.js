// ─────────────────────────────────────────────────────────────
//  다국어 (ko / en) — 기기 언어 자동 선택, 🌐 버튼으로 수동 전환
//  · HTML: data-i18n="key" (textContent), data-i18n-ph="key" (placeholder), data-i18n-label="key" (aria-label)
//  · JS  : I18N.t('key', {n: 3})
// ─────────────────────────────────────────────────────────────
(function () {
  const DICT = {
    ko: {
      'app.title': 'SAVE THE OCEAN — 군함 vs 잠수정',
      'rotate': '세로로 돌려주세요',
      'rotate.sub': '이 게임은 세로 화면 전용입니다',
      'notice.ok': '확인',
      'notice.hide': '오늘 하루 보지 않기',
      'sound.bgm': '배경음 켜기/끄기',
      'sound.sfx': '효과음 켜기/끄기',
      'ctl.two': '🤲 양손',
      'ctl.one': '☝️ 한손',
      'ctl.right': '▶ 우수',
      'ctl.left': '◀ 좌수',
      'toast.two': '양손 모드',
      'toast.one': '한손 모드',
      'toast.right': '우수 (오른손)',
      'toast.left': '좌수 (왼손)',
      'toast.bgmOff': '배경음 끔',
      'toast.bgmOn': '배경음 켬',
      'toast.sfxOff': '효과음 끔',
      'toast.sfxOn': '효과음 켬',
      'toast.submitFail': '등록에 실패했어요. 잠시 후 다시 시도해주세요.',
      'toast.loginFail': '로그인이 취소되었거나 실패했어요.',
      'toast.purchaseFail': '결제가 완료되지 않았어요.',
      'toast.restored': '구매 내역을 복원했어요!',
      'toast.restoreNone': '복원할 구매 내역이 없어요.',
      'toast.webOnly': '앱에서만 구매할 수 있어요.',
      'start': '작전 시작',
      'visits': '오늘 {today} · 누적 {total}',
      'visits.empty': '오늘 – · 누적 –',
      'hall': '🏆 명예의 전당',
      'hall.top3': '⚓ 이번 시즌 TOP 3',
      'hall.season': '👑 시즌 1위',
      'hall.locked': '🔒 글로벌 순위판은 프리미엄에서 열려요',
      'hall.premium': '🌍 글로벌 순위판 보기',
      'loading': '불러오는 중...',
      'best': '이 기기 최고 기록: {n}',
      'over': '침몰…',
      'over.score': '이번 점수',
      'over.checking': '순위 확인 중...',
      'over.offline': '온라인 랭킹 미설정 — 이 기기 최고 기록 {n}',
      'over.top10': '🎉 {rank}위! 이름을 남겨보세요.',
      'over.top10.norank': '🎉 TOP 10 진입! 이름을 남겨보세요.',
      'over.rank': '{rank}등이에요!',
      'over.rank.far': '1000위 밖이에요!',
      'over.rank.sub': '10위 안에 들면 이름을 남길 수 있어요.',
      'over.free': '이 기기 최고 기록: {n}',
      'over.free.sub': '프리미엄이면 전 세계 순위와 비교하고 이름을 남길 수 있어요.',
      'over.premiumBtn': '🌍 글로벌 순위판 열기 · {price}',
      'over.restore': '구매 복원',
      'over.needLogin': '순위 등록은 계정 로그인이 필요해요.',
      'over.login.apple': ' Apple로 로그인',
      'over.login.google': 'G  Google로 로그인',
      'name.ph': '이름 입력',
      'submit': '등록',
      'submitting': '등록 중...',
      'submitted': '✅ 등록 완료!',
      'board': '🏆 명예의 전당 TOP 10',
      'retry': '다시 하기',
      'lb.fail': '순위를 불러오지 못했어요.',
      'lb.notset': '온라인 랭킹 미설정',
      'lb.empty': '아직 기록이 없어요. 첫 기록의 주인공이 되어보세요!',
      'lb.rank': '{n}위',
      'lb.pts': '{n}점',
      'lb.season': '시즌 {n}',
      'lb.season.none': '기록 없음',
      'lb.season.first': '시즌 1 진행 중 — 첫 시즌의 1위는 누가 될까요?',
      'anon': '익명',
      'aria.start': '작전 시작',
      'aria.left': '왼쪽으로 이동',
      'aria.right': '오른쪽으로 이동',
      'aria.bomb': '폭탄 투하',
      'aria.ctl': '조작 방식 전환',
      'aria.hand': '사용 손 전환',
      'lang': '🌐 EN',
      'drill.end': 'DRILL 종료',
      'credit': 'AI와 함께 만든 게임입니다',
      'deep': '심해',
      'premium.title': '🌍 프리미엄',
      'premium.body': '· 전 세계 플레이어와 순위 경쟁\n· 시즌 순위판 전체 열람\n· 한 번 결제, 영구 이용',
      'premium.buy': '{price}에 열기',
      'premium.cancel': '나중에',
      'premium.restore': '이미 구매했어요 (복원)',
      'premium.active': '🌍 프리미엄 이용 중'
    },
    en: {
      'app.title': 'SAVE THE OCEAN — Warship vs Submarines',
      'rotate': 'Please rotate to portrait',
      'rotate.sub': 'This game is portrait-only',
      'notice.ok': 'OK',
      'notice.hide': "Don't show again today",
      'sound.bgm': 'Toggle ambient sound',
      'sound.sfx': 'Toggle sound effects',
      'ctl.two': '🤲 Two hands',
      'ctl.one': '☝️ One hand',
      'ctl.right': '▶ Right',
      'ctl.left': '◀ Left',
      'toast.two': 'Two-hand mode',
      'toast.one': 'One-hand mode',
      'toast.right': 'Right-handed',
      'toast.left': 'Left-handed',
      'toast.bgmOff': 'Ambient off',
      'toast.bgmOn': 'Ambient on',
      'toast.sfxOff': 'SFX off',
      'toast.sfxOn': 'SFX on',
      'toast.submitFail': 'Could not submit. Please try again later.',
      'toast.loginFail': 'Sign-in was cancelled or failed.',
      'toast.purchaseFail': 'Purchase was not completed.',
      'toast.restored': 'Purchase restored!',
      'toast.restoreNone': 'No purchase to restore.',
      'toast.webOnly': 'Available in the app only.',
      'start': 'START',
      'visits': 'Today {today} · Total {total}',
      'visits.empty': 'Today – · Total –',
      'hall': '🏆 HALL OF FAME',
      'hall.top3': '⚓ Season TOP 3',
      'hall.season': '👑 Season champions',
      'hall.locked': '🔒 Global leaderboard unlocks with Premium',
      'hall.premium': '🌍 View global leaderboard',
      'loading': 'Loading...',
      'best': 'Best on this device: {n}',
      'over': 'SUNK…',
      'over.score': 'Your score',
      'over.checking': 'Checking rank...',
      'over.offline': 'Online ranking not set — best on this device {n}',
      'over.top10': '🎉 Rank #{rank}! Leave your name.',
      'over.top10.norank': '🎉 TOP 10! Leave your name.',
      'over.rank': 'You ranked #{rank}!',
      'over.rank.far': 'Outside the top 1000!',
      'over.rank.sub': 'Reach the top 10 to leave your name.',
      'over.free': 'Best on this device: {n}',
      'over.free.sub': 'Go Premium to compete worldwide and leave your name.',
      'over.premiumBtn': '🌍 Unlock global leaderboard · {price}',
      'over.restore': 'Restore purchase',
      'over.needLogin': 'Sign in to submit your score.',
      'over.login.apple': ' Sign in with Apple',
      'over.login.google': 'G  Sign in with Google',
      'name.ph': 'Your name',
      'submit': 'Submit',
      'submitting': 'Submitting...',
      'submitted': '✅ Submitted!',
      'board': '🏆 HALL OF FAME TOP 10',
      'retry': 'PLAY AGAIN',
      'lb.fail': 'Could not load the leaderboard.',
      'lb.notset': 'Online ranking not set',
      'lb.empty': 'No records yet. Be the first!',
      'lb.rank': '#{n}',
      'lb.pts': '{n} pts',
      'lb.season': 'Season {n}',
      'lb.season.none': 'No record',
      'lb.season.first': 'Season 1 in progress — who will be the first champion?',
      'anon': 'Anonymous',
      'aria.start': 'Start',
      'aria.left': 'Move left',
      'aria.right': 'Move right',
      'aria.bomb': 'Drop bomb',
      'aria.ctl': 'Toggle control layout',
      'aria.hand': 'Toggle handedness',
      'lang': '🌐 한국어',
      'drill.end': 'OUT OF DRILLS',
      'credit': 'Made with AI',
      'deep': 'DEEP ZONE',
      'premium.title': '🌍 PREMIUM',
      'premium.body': '· Compete with players worldwide\n· Full season leaderboard\n· One-time purchase, yours forever',
      'premium.buy': 'Unlock for {price}',
      'premium.cancel': 'Later',
      'premium.restore': 'Already bought (restore)',
      'premium.active': '🌍 Premium active'
    }
  };

  const KEY = 'savetheocean_lang';
  function detect() {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ko' || saved === 'en') return saved;
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  }
  let lang = detect();

  const I18N = {
    get lang() { return lang; },
    t(key, vars) {
      let s = (DICT[lang] && DICT[lang][key]) || DICT.ko[key] || key;
      if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
      return s;
    },
    set(l) { lang = l === 'ko' ? 'ko' : 'en'; localStorage.setItem(KEY, lang); I18N.apply(); },
    toggle() { I18N.set(lang === 'ko' ? 'en' : 'ko'); },
    // data-i18n 속성이 붙은 요소 전부 갱신
    apply() {
      document.documentElement.lang = lang;
      document.title = I18N.t('app.title');
      document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = I18N.t(el.getAttribute('data-i18n')); });
      document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = I18N.t(el.getAttribute('data-i18n-ph')); });
      document.querySelectorAll('[data-i18n-label]').forEach(el => { el.setAttribute('aria-label', I18N.t(el.getAttribute('data-i18n-label'))); });
      document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
    },
    // 숫자 표기 (1,234 / 1.2K)
    num(n) { return Number(n).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US'); }
  };
  window.I18N = I18N;
  window.t = I18N.t;
})();
