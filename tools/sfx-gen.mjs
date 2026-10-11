// ElevenLabs Sound Effects 로 효과음 주문서의 44개를 후보 N개씩 뽑아 sfx/candidates/ 에 저장
// 사용: ELEVEN_API_KEY=... node tools/sfx-gen.mjs [후보수=3] [게임필터: 공통|탱크|스카이|오션|all]
import fs from 'fs';
const KEY = process.env.ELEVEN_API_KEY; if (!KEY) { console.error('ELEVEN_API_KEY 없음'); process.exit(1); }
const N = +(process.argv[2] || 3), FILTER = process.argv[3] || 'all';
const md = fs.readFileSync('효과음_주문서.md', 'utf8');
const rows = [];
for (const line of md.split('\n')) {
  const m = line.match(/^\|\s*(공통|탱크|스카이|오션)_(\d\d)\s*\|\s*([^|]+?)\s*\|\s*([\d.]+)\s*\|\s*([^|]+?)\s*\|/);
  if (m) rows.push({ game: m[1], num: m[2], name: m[3], sec: +m[4], prompt: m[5] });
}
const list = rows.filter(r => FILTER === 'all' || r.game === FILTER);
console.log('항목', list.length, '× 후보', N);
fs.mkdirSync('sfx/candidates', { recursive: true });
const manifest = fs.existsSync('sfx/manifest.json') ? JSON.parse(fs.readFileSync('sfx/manifest.json', 'utf8')) : {};
for (const r of list) {
  const id = r.game + '_' + r.num; manifest[id] = { game: r.game, num: r.num, name: r.name, sec: r.sec, prompt: r.prompt, files: manifest[id]?.files || [] };
  for (let k = 1; k <= N; k++) {
    const file = `sfx/candidates/${id}_${k}.mp3`;
    if (fs.existsSync(file)) { if (!manifest[id].files.includes(file)) manifest[id].files.push(file); continue; }
    const body = { text: r.prompt, duration_seconds: Math.max(0.5, Math.min(22, r.sec)), prompt_influence: 0.75 };
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { console.error(id, k, res.status, (await res.text()).slice(0, 200)); continue; }
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer())); manifest[id].files.push(file); console.log('ok', file);
    } catch (e) { console.error(id, k, e.message); }
    await new Promise(r => setTimeout(r, 400));
  }
}
import('crypto').then(({createHash}) => { for (const id in manifest) { manifest[id].ver = {}; for (const f of manifest[id].files) if (fs.existsSync(f)) manifest[id].ver[f] = createHash('md5').update(fs.readFileSync(f)).digest('hex').slice(0, 8); } fs.writeFileSync('sfx/manifest.json', JSON.stringify(manifest, null, 1)); console.log('manifest ok'); });
console.log('완료');
