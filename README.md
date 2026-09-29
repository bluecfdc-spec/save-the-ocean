# SAVE THE OCEAN — 군함 vs 잠수정

세로형 폰 브라우저 게임. GitHub Pages + Firestore(무로그인 실시간 리더보드) 구성.

## 파일
- `index.html` — 화면 구성/스타일
- `game.js` — 게임 로직 (이동·폭탄·어뢰·레이더·난이도·HP)
- `audio.js` — 사운드 (Web Audio 합성, 음원 파일 없음)
- `leaderboard.js` — Firestore 리더보드
- `firebase-config.js` — **Firebase 설정값 붙여넣는 곳**
- `assets/` — 배경·스프라이트·패널 이미지

## 올리기
1. GitHub 새 저장소에 이 폴더 내용을 그대로 업로드
2. Settings → Pages → Branch: `main` / (root) → Save
3. `firebase-config.js`에 Firebase 웹 앱 설정값 붙여넣기

## Firestore 규칙 (콘솔 → Firestore Database → 규칙)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 이름 있는 기록: scores, scores_s2, scores_s3 ...
    match /{col}/{doc} {
      allow read: if true;
      allow create: if col.matches('^scores(_s[0-9]+)?$')
                    && request.resource.data.name is string
                    && request.resource.data.name.size() >= 1
                    && request.resource.data.name.size() <= 8
                    && request.resource.data.score is int
                    && request.resource.data.score >= 0
                    && request.resource.data.score <= 999999;
      allow update, delete: if false;
    }
    // 10위 밖 무명 기록 (순위 계산용): plays, plays_s2 ...
    match /{col}/{doc} {
      allow create: if col.matches('^plays(_s[0-9]+)?$')
                    && request.resource.data.score is int
                    && request.resource.data.score >= 0
                    && request.resource.data.score <= 999999;
    }
    // 방문자 수
    match /visits/{doc} {
      allow read: if true;
      allow create, update: if request.resource.data.count is int;
    }
  }
}
```
부적절한 이름/점수는 콘솔에서 문서를 직접 삭제하면 됩니다.

## 시즌 운영
`firebase-config.js`의 `SEASON_SUFFIX`를 `"_s2"`로 바꾸면 새 컬렉션(scores_s2, plays_s2)에 기록이 쌓입니다.
끝난 시즌 1위는 `SEASONS_DATA`에 한 줄 추가하면 시작 화면 "👑 시즌 1위"에 표시됩니다.

## 아이템
- 🛡 쉴드: 잠수정 20척 격파마다 수면에 등장. 군함이 닿으면 10초 무적(어뢰가 튕겨나감)
- 🔩 드릴: 무작위 간격으로 수면에 등장. 먹으면 5발 장전(우측 상단 아이콘이 드릴로 바뀜). 잠수정을 뚫고 계속 내려가며 여러 대 격파

## 조작
- 좌/우 버튼: 누르고 있는 동안 이동 (버튼 3개가 한쪽에 모여 엄지 하나로 조작)
- 가운데 빨간 버튼: 폭탄 투하 (동시에 5개까지)
- LEFT-HAND MODE: 버튼 배치 좌우 교체 (기기에 저장됨)
- 🌊 배경음 / 💥 효과음 버튼: 따로 켜고 끔
- 세로 화면 전용 (가로로 돌리면 안내 표시)
- PC 테스트: ←/→ 이동, Space 폭탄, Enter 시작

## 규칙
- 흰 잠수정 100점, 빨간 잠수정 300점
- 어뢰 4번 피격 시 침몰 (HP 25%씩 감소)
- 18초마다 난이도 상승: 잠수정 속도 ↑, 동시 어뢰 수 ↑, 3단계부터 2척 동시 등장·연속 발사 등 패턴 꼬임
- 레이더: 점선 안이 실제 화면. 점선 밖 표시는 아직 화면에 안 보이지만 다가오는 잠수정
