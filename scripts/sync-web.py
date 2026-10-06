#!/usr/bin/env python3
"""웹 버전(main 브랜치)의 게임 파일을 앱(www/)으로 옮긴다.
사용: python3 scripts/sync-web.py <main 브랜치를 받아둔 폴더>
 - 게임 코드·그림은 그대로 복사
 - index.html 은 앱용으로 바꿈: 글꼴·Firebase 를 앱 내장 파일로, 로그인(auth.js) 추가, 명예의 전당 자료는 온라인에서 받아옴
 - www/firebase-config.js, www/app-config.js 는 앱 전용이라 건드리지 않음
"""
import re, shutil, sys, os
M = sys.argv[1].rstrip('/') + '/'; A = os.path.join(os.path.dirname(__file__), '..', 'www') + '/'
for f in ['game.js', 'war.js', 'leaderboard.js', 'i18n.js', 'audio.js', 'auth.js']:
    shutil.copy(M + f, A + f)
for f in os.listdir(M + 'assets'):
    shutil.copy(M + 'assets/' + f, A + 'assets/' + f)
h = open(M + 'index.html', encoding='utf8').read()
def rep(a, b):
    global h
    assert a in h, a[:70]
    h = h.replace(a, b, 1)
ERRBOX = '''<!-- 테스트 빌드: 스크립트 오류를 화면 아래에 표시 (원인 파악용, 출시 전 제거) -->
<script>
  window.addEventListener('error', function (e) {
    if (e.target && e.target.getAttribute && e.target.getAttribute('data-opt')) return;   // 없어도 되는 온라인 자료
    var b = document.getElementById('__errbox');
    if (!b) { b = document.createElement('div'); b.id = '__errbox'; b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;pointer-events:none;background:rgba(120,0,0,.92);color:#fff;font:11px/1.4 monospace;padding:6px 8px;max-height:40%;overflow:auto;white-space:pre-wrap'; b.textContent = 'WebView: ' + ((navigator.userAgent.match(/Chrome\\/[\\d.]+|Version\\/[\\d.]+/) || [''])[0]) + '\\n'; document.body.appendChild(b); }
    b.textContent += (e.message || 'load error') + ' @ ' + ((e.filename || (e.target && (e.target.src || e.target.href)) || '').split('/').pop()) + ':' + (e.lineno || '') + '\\n';
  }, true);
</script>
'''
SHOW_ERRORS = '--errors' in sys.argv
rep('<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&display=swap" rel="stylesheet">', '<link href="vendor/fonts/orbitron.css" rel="stylesheet">')
rep('<script src="https://cdn.jsdelivr.net/npm/firebase@10.12.2/firebase-app-compat.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/firebase@10.12.2/firebase-firestore-compat.js"></script>',
    (ERRBOX if SHOW_ERRORS else '') + '<!-- 앱 내장 라이브러리 (CI 가 vendor/ 에 채움 — 오프라인에서도 로드됨) -->\n<script src="vendor/firebase-app-compat.js"></script>\n<script src="vendor/firebase-auth-compat.js"></script>\n<script src="vendor/firebase-firestore-compat.js"></script>\n<script src="vendor/native.js"></script>')
h = re.sub(r'(src="[\w.\-]+\.js)\?v=\w+"', r'\1"', h)
rep('<script src="firebase-config.js"></script>', '<script>window.FLAG_BASE = "vendor/flags/";</script>\n<script src="firebase-config.js"></script>')
rep('''<script>document.write('<script src="season.js?v=' + new Date().toISOString().slice(0, 10) + '"><\\/script><script src="war-seasons.js?v=' + new Date().toISOString().slice(0, 10) + '"><\\/script>');</script>\n''',
    '''<!-- 명예의 전당(지난 주간 1위·점령전 우승 세력)은 웹의 season.js / war-seasons.js 를 온라인일 때만 받아온다 -->
<script>['season.js', 'war-seasons.js'].forEach(function (f) { var s = document.createElement('script'); s.async = true; s.setAttribute('data-opt', '1'); s.src = 'https://bluecfdc-spec.github.io/save-the-ocean/' + f + '?d=' + new Date().toISOString().slice(0, 10); s.onload = function () { if (window.LB) document.querySelectorAll('.hall-pane').forEach(function (el) { LB.renderSeasons(el); }); }; document.head.appendChild(s); });</script>
''')
rep('<script src="war.js"></script>', '<script src="war.js"></script>\n<script src="auth.js"></script>')
assert 'jsdelivr' not in h and 'googleapis' not in h and '?v=' not in h
open(A + 'index.html', 'w', encoding='utf8').write(h)
print('www 갱신 완료', '(오류 표시 포함)' if SHOW_ERRORS else '')
