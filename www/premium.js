// ─────────────────────────────────────────────────────────────
//  프리미엄(글로벌 순위판) · 결제(RevenueCat) · 로그인(Firebase Auth)
//  · 무료: 로컬 최고 기록만. 글로벌 순위판/이름 등록 없음
//  · 프리미엄: 글로벌 순위판 열람 + 이름 등록(등록 시 Apple/Google 로그인 필수)
//  · 네이티브 플러그인은 vendor/native.js (CI에서 esbuild로 묶음) 가 window.Native 로 노출
//  · 브라우저(웹)에서는 결제 불가 → 안내만
// ─────────────────────────────────────────────────────────────
(function () {
  const CFG = window.APP_CONFIG || {};
  const N = () => window.Native || null;
  const isNative = () => { const n = N(); return !!(n && n.Capacitor && n.Capacitor.isNativePlatform()); };
  const platform = () => { const n = N(); return n && n.Capacitor ? n.Capacitor.getPlatform() : 'web'; };

  const CACHE_KEY = 'savetheocean_premium';   // 오프라인일 때 마지막으로 확인된 상태
  let premium = localStorage.getItem(CACHE_KEY) === '1';
  let priceStr = null;
  let pkg = null;                               // RevenueCat package
  let authReady = null;

  const P = {};
  P.isNative = isNative;
  P.platform = platform;

  // ── 프리미엄 여부 ──
  P.isPremium = function () {
    if (CFG.allowDevOverride && localStorage.getItem('sto_dev_premium') === '1') return true;
    return premium;
  };
  function setPremium(v) { premium = !!v; localStorage.setItem(CACHE_KEY, premium ? '1' : '0'); document.dispatchEvent(new CustomEvent('premium:change', { detail: { premium } })); }

  P.price = function () {
    if (priceStr) return priceStr;
    const fb = CFG.fallbackPrice || {};
    return (window.I18N && fb[I18N.lang]) || fb.ko || '';
  };

  // ── RevenueCat ──
  async function initPurchases() {
    const n = N(); if (!isNative() || !n.Purchases) return;
    const key = platform() === 'ios' ? CFG.rcAppleKey : CFG.rcGoogleKey;
    if (!key) { console.warn('RevenueCat key not set'); return; }
    try {
      await n.Purchases.configure({ apiKey: key });
      await refreshEntitlement();
      const off = await n.Purchases.getOfferings();
      const cur = off && off.current;
      if (cur && cur.availablePackages && cur.availablePackages.length) {
        pkg = cur.availablePackages.find(p => p.product && p.product.identifier === CFG.productId) || cur.availablePackages[0];
        priceStr = pkg.product.priceString || null;
      }
    } catch (e) { console.warn('Purchases init failed', e); }
  }
  async function refreshEntitlement() {
    const n = N(); if (!n || !n.Purchases) return;
    try {
      const { customerInfo } = await n.Purchases.getCustomerInfo();
      const ent = customerInfo && customerInfo.entitlements && customerInfo.entitlements.active;
      setPremium(!!(ent && ent[CFG.entitlement || 'premium']));
    } catch (e) { console.warn('customerInfo failed', e); }
  }
  P.purchase = async function () {
    const n = N();
    if (!isNative() || !n.Purchases) return { ok: false, reason: 'web' };
    try {
      if (!pkg) { const off = await n.Purchases.getOfferings(); pkg = off.current && off.current.availablePackages[0]; }
      if (!pkg) return { ok: false, reason: 'no-product' };
      const { customerInfo } = await n.Purchases.purchasePackage({ aPackage: pkg });
      const ent = customerInfo.entitlements.active;
      setPremium(!!(ent && ent[CFG.entitlement || 'premium']));
      return { ok: P.isPremium() };
    } catch (e) {
      if (e && (e.code === '1' || /cancel/i.test(String(e.message || e)))) return { ok: false, reason: 'cancelled' };
      console.warn('purchase failed', e); return { ok: false, reason: 'error' };
    }
  };
  P.restore = async function () {
    const n = N();
    if (!isNative() || !n.Purchases) return { ok: false, reason: 'web' };
    try {
      const { customerInfo } = await n.Purchases.restorePurchases();
      const ent = customerInfo.entitlements.active;
      const found = !!(ent && ent[CFG.entitlement || 'premium']);
      setPremium(found);
      return { ok: true, found };
    } catch (e) { console.warn('restore failed', e); return { ok: false, reason: 'error' }; }
  };

  // ── Firebase Auth ──
  //  · 앱 시작 시 익명 로그인(Firestore 읽기/무명 기록용)
  //  · 이름 등록 시 Apple/Google 로 승격(link). 이미 있는 계정이면 그 계정으로 전환
  function auth() { return (window.firebase && firebase.auth) ? firebase.auth() : null; }
  P.user = function () { const a = auth(); return a ? a.currentUser : null; };
  P.isSignedIn = function () { const u = P.user(); return !!(u && !u.isAnonymous); };
  P.ensureAnon = function () {
    if (authReady) return authReady;
    const a = auth(); if (!a) return Promise.resolve(null);
    authReady = new Promise(resolve => {
      const off = a.onAuthStateChanged(async u => {
        off();
        if (u) return resolve(u);
        try { const r = await a.signInAnonymously(); resolve(r.user); } catch (e) { console.warn('anon sign-in failed', e); resolve(null); }
      });
    });
    return authReady;
  };
  async function credentialFor(provider) {
    const n = N();
    if (isNative() && n.FirebaseAuthentication) {
      if (provider === 'apple') {
        const r = await n.FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
        const p = new firebase.auth.OAuthProvider('apple.com');
        return p.credential({ idToken: r.credential.idToken, rawNonce: r.credential.nonce });
      }
      const r = await n.FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
      return firebase.auth.GoogleAuthProvider.credential(r.credential.idToken, r.credential.accessToken);
    }
    // 웹(테스트용): 팝업 로그인
    const p = provider === 'apple' ? new firebase.auth.OAuthProvider('apple.com') : new firebase.auth.GoogleAuthProvider();
    const r = await auth().signInWithPopup(p);
    return r.credential;
  }
  P.signIn = async function (provider) {
    const a = auth(); if (!a) return { ok: false, reason: 'no-auth' };
    try {
      const cred = await credentialFor(provider);
      const cur = a.currentUser;
      let user;
      if (cur && cur.isAnonymous) {
        try { user = (await cur.linkWithCredential(cred)).user; }
        catch (e) {
          if (e && e.code === 'auth/credential-already-in-use') user = (await a.signInWithCredential(cred)).user;
          else throw e;
        }
      } else user = (await a.signInWithCredential(cred)).user;
      // 구매 기록을 계정에 묶기 (기기 바꿔도 복원)
      const n = N();
      if (isNative() && n && n.Purchases && user) { try { await n.Purchases.logIn({ appUserID: user.uid }); await refreshEntitlement(); } catch (e) {} }
      return { ok: true, user };
    } catch (e) { console.warn('sign-in failed', e); return { ok: false, reason: e && e.code || 'error' }; }
  };

  // ── App Check (Firebase 콘솔에서 앱 등록 후 자동 동작) ──
  async function initAppCheck() {
    const n = N(); if (!isNative() || !n.FirebaseAppCheck) return;
    try { await n.FirebaseAppCheck.initialize({ isTokenAutoRefreshEnabled: true }); } catch (e) { console.warn('AppCheck init failed', e); }
  }

  // ── 프리미엄 안내 팝업 ──
  P.showPaywall = function () {
    return new Promise(resolve => {
      const el = document.getElementById('paywall'); if (!el) return resolve(false);
      const buy = document.getElementById('pwBuy'), cancel = document.getElementById('pwCancel'), restore = document.getElementById('pwRestore');
      buy.textContent = t('premium.buy', { price: P.price() });
      const close = v => { el.classList.remove('show'); buy.onclick = cancel.onclick = restore.onclick = null; resolve(v); };
      buy.onclick = async () => {
        if (!isNative()) { P.toast(t('toast.webOnly')); return; }
        buy.disabled = true; const r = await P.purchase(); buy.disabled = false;
        if (r.ok) close(true); else if (r.reason !== 'cancelled') P.toast(t('toast.purchaseFail'));
      };
      restore.onclick = async () => {
        if (!isNative()) { P.toast(t('toast.webOnly')); return; }
        const r = await P.restore();
        if (r.ok && r.found) { P.toast(t('toast.restored')); close(true); } else P.toast(t('toast.restoreNone'));
      };
      cancel.onclick = () => close(false);
      el.classList.add('show');
    });
  };
  P.toast = function (msg) { if (window.__toast) window.__toast(msg); else console.log(msg); };

  P.init = async function () {
    await Promise.all([initAppCheck(), initPurchases(), P.ensureAnon()]);
    const n = N();
    if (isNative() && n.App) { try { n.App.addListener('resume', refreshEntitlement); } catch (e) {} }
    document.dispatchEvent(new CustomEvent('premium:ready'));
  };
  window.Premium = P;
})();
