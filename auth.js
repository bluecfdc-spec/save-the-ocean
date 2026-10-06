// 계정 로그인 (앱 전용) — 기록을 올릴 때 스토어 계정으로 로그인
//  · 아이폰: Apple 로 로그인 / 안드로이드: Google 로 로그인
//  · 네이티브 로그인 창은 Capacitor 플러그인이 띄우고, 받은 인증 정보를 Firebase 로그인에 넘긴다
//  · 웹에서는 이 파일을 불러오지 않는다 (window.AUTH 없음 = 로그인 없이 동작)
(function () {
  const A = {}, N = () => window.Native;
  const fbAuth = () => { try { return firebase.auth(); } catch (e) { return null; } };
  A.native = () => !!(N() && N().Capacitor && N().Capacitor.isNativePlatform());
  A.platform = () => A.native() ? N().Capacitor.getPlatform() : 'web';
  A.required = () => A.native() && !!fbAuth() && !!(N() && N().FirebaseAuthentication);
  A.provider = () => A.platform() === 'ios' ? 'apple' : 'google';
  A.user = () => { const a = fbAuth(); return a ? a.currentUser : null; };
  // 앱을 다시 켰을 때 이전 로그인 복원을 기다린다
  A.ready = new Promise(res => { const a = fbAuth(); if (!a) return res(null); const off = a.onAuthStateChanged(u => { off(); res(u); }); setTimeout(() => res(a.currentUser), 4000); });

  async function credential() {
    const F = N().FirebaseAuthentication;
    if (A.provider() === 'apple') {
      const r = await F.signInWithApple({ skipNativeAuth: true });
      return new firebase.auth.OAuthProvider('apple.com').credential({ idToken: r.credential.idToken, rawNonce: r.credential.nonce });
    }
    const r = await F.signInWithGoogle({ skipNativeAuth: true });
    return firebase.auth.GoogleAuthProvider.credential(r.credential.idToken, r.credential.accessToken);
  }
  A.signIn = async function () {
    try { const u = (await fbAuth().signInWithCredential(await credential())).user; return { ok: true, uid: u.uid }; }
    catch (e) { console.warn('sign-in failed', e); return { ok: false, reason: (e && (e.code || e.message)) || 'error' }; }
  };
  A.signOut = async function () { try { await fbAuth().signOut(); } catch (e) {} try { await N().FirebaseAuthentication.signOut(); } catch (e) {} };
  // 계정 삭제 (스토어 심사 요건): Firebase 계정을 지우고 이 기기의 프로필도 지운다
  A.deleteAccount = async function () {
    const u = A.user(); if (!u) return { ok: false, reason: 'no-user' };
    try {
      try { await u.delete(); }
      catch (e) {
        if (!e || e.code !== 'auth/requires-recent-login') throw e;
        await u.reauthenticateWithCredential(await credential());   // 오래된 로그인은 다시 확인 후 삭제
        await u.delete();
      }
      try { await N().FirebaseAuthentication.signOut(); } catch (e) {}
      return { ok: true };
    } catch (e) { console.warn('delete failed', e); return { ok: false, reason: (e && (e.code || e.message)) || 'error' }; }
  };
  window.AUTH = A;
})();
