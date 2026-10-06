#!/usr/bin/env python3
"""iOS 배포 서명 준비 (CI 전용, Mac 없이) — App Store Connect API 로 인증서와 프로비저닝 프로파일을 마련한다.

 1) 배포 인증서: 처음 한 번 만들고, 개인 키와 함께 암호화해서 ios/signing/dist.p12.enc 로 저장소에 보관한다.
    (암호화 열쇠는 ASC_KEY_P8 시크릿에서 만들어지므로, 그 시크릿 없이는 풀 수 없다.)
    다음 빌드부터는 그 파일을 풀어서 다시 쓴다 → 인증서가 빌드마다 늘어나지 않는다.
 2) 프로비저닝 프로파일(App Store 용): 빌드할 때마다 새로 받아 설치한다.
 출력: GITHUB_ENV 에 P12_PATH, P12_PASSWORD, PROFILE_NAME, PROFILE_UUID, APPLE_TEAM_ID, SIGNING_CHANGED
"""
import base64, hashlib, json, os, sys, time, pathlib, plistlib, secrets, subprocess
import jwt, requests
from cryptography import x509
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

BUNDLE = 'com.bluecfdc.savetheocean'
PROFILE_NAME = 'SaveTheOcean AppStore CI'
KEY_ID, ISSUER, KEY_PATH = os.environ['ASC_KEY_ID'], os.environ['ASC_ISSUER_ID'], os.environ['KEY_PATH']
P8 = open(KEY_PATH, 'rb').read()
STORE = pathlib.Path('ios/signing/dist.p12.enc')
API = 'https://api.appstoreconnect.apple.com/v1'

def fail(msg):
    print('::error::' + str(msg).replace('\n', ' ')[:900]); sys.exit(1)

def token():
    now = int(time.time())
    return jwt.encode({'iss': ISSUER, 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'}, P8.decode(), algorithm='ES256', headers={'kid': KEY_ID})

def call(method, path, **kw):
    r = requests.request(method, API + path, headers={'Authorization': 'Bearer ' + token()}, timeout=60, **kw)
    if r.status_code >= 300:
        fail('App Store Connect %s %s → %s: %s' % (method, path, r.status_code, r.text[:500]))
    return r.json() if r.text else {}

fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(b'sto-ios-signing|' + P8.strip()).digest()))

# ---- 번들 ID / 팀 ID ----
bids = [b for b in call('GET', '/bundleIds', params={'filter[identifier]': BUNDLE})['data'] if b['attributes']['identifier'] == BUNDLE]
if not bids: fail('번들 ID %s 가 개발자 계정에 없습니다' % BUNDLE)
bundle_id, team = bids[0]['id'], bids[0]['attributes']['seedId']

# ---- 1) 배포 인증서 ----
changed = False
bundle = None
if STORE.exists():
    try:
        bundle = json.loads(fernet.decrypt(STORE.read_bytes()))
        live = [c['id'] for c in call('GET', '/certificates', params={'filter[certificateType]': 'DISTRIBUTION', 'limit': 50})['data']]
        if bundle['cert_id'] not in live:
            print('저장된 인증서가 계정에 없어 새로 만듭니다'); bundle = None
    except (InvalidToken, ValueError, KeyError):
        print('저장된 인증서를 풀 수 없어 새로 만듭니다 (API 키가 바뀌었을 수 있음)'); bundle = None
if bundle is None:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    csr = x509.CertificateSigningRequestBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Save the Ocean CI')])).sign(key, hashes.SHA256())
    res = call('POST', '/certificates', json={'data': {'type': 'certificates', 'attributes': {'certificateType': 'DISTRIBUTION', 'csrContent': csr.public_bytes(serialization.Encoding.PEM).decode()}}})
    bundle = {'cert_id': res['data']['id'], 'cert_der': res['data']['attributes']['certificateContent'],
              'key_pem': key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()}
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_bytes(fernet.encrypt(json.dumps(bundle).encode()))
    changed = True
    print('배포 인증서를 새로 만들었습니다:', bundle['cert_id'])
cert = x509.load_der_x509_certificate(base64.b64decode(bundle['cert_der']))
key = serialization.load_pem_private_key(bundle['key_pem'].encode(), None)
p12_pw = secrets.token_hex(12)
tmp = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'keys'; tmp.mkdir(parents=True, exist_ok=True)
# macOS 의 security 도구가 읽을 수 있는 예전 방식(3DES) 암호화로 묶는다
enc = serialization.PrivateFormat.PKCS12.encryption_builder().kdf_rounds(2048).key_cert_algorithm(pkcs12.PBES.PBESv1SHA1And3KeyTripleDESCBC).hmac_hash(hashes.SHA1()).build(p12_pw.encode())
(tmp / 'dist.p12').write_bytes(pkcs12.serialize_key_and_certificates(b'sto-dist', key, cert, None, enc))

# ---- 2) 프로비저닝 프로파일 ----
for p in call('GET', '/profiles', params={'filter[name]': PROFILE_NAME, 'limit': 50})['data']:
    if p['attributes']['name'] == PROFILE_NAME: call('DELETE', '/profiles/' + p['id'])
prof = call('POST', '/profiles', json={'data': {'type': 'profiles', 'attributes': {'name': PROFILE_NAME, 'profileType': 'IOS_APP_STORE'},
    'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bundle_id}}, 'certificates': {'data': [{'type': 'certificates', 'id': bundle['cert_id']}]}}}})
content = base64.b64decode(prof['data']['attributes']['profileContent']); uuid = prof['data']['attributes']['uuid']
for d in ['Library/MobileDevice/Provisioning Profiles', 'Library/Developer/Xcode/UserData/Provisioning Profiles']:
    pd = pathlib.Path.home() / d; pd.mkdir(parents=True, exist_ok=True); (pd / (uuid + '.mobileprovision')).write_bytes(content)
print('프로파일 설치:', PROFILE_NAME, uuid)

with open(os.environ['GITHUB_ENV'], 'a') as f:
    f.write('P12_PATH=%s\nP12_PASSWORD=%s\nPROFILE_NAME=%s\nPROFILE_UUID=%s\nAPPLE_TEAM_ID=%s\nSIGNING_CHANGED=%s\n' % (tmp / 'dist.p12', p12_pw, PROFILE_NAME, uuid, team, '1' if changed else ''))
