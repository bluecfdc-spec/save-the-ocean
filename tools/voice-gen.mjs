// ElevenLabs TTS 로 군용 대사 후보 생성 → sfx/candidates/목소리_NN_k_hash.mp3, manifest 에 '목소리' 항목으로 추가
import fs from 'fs'; import { createHash } from 'crypto';
const KEY = process.env.ELEVEN_API_KEY; if (!KEY) { console.error('no key'); process.exit(1); }
const LINES = [
  { num: '01', name: '보병 출격 — "Go go go!"', text: '[gruff] [cocky] [shouting] Go go go!' },
  { num: '02', name: '교전 — "Contact! Open fire!"', text: 'Contact! Open fire!' },
  { num: '03', name: '전선 전진 — "Push forward! Advance!"', text: 'Push forward! Advance!' },
  { num: '04', name: '전선 밀림 — "Fall back! Fall back!"', text: 'Fall back! Fall back!' },
  { num: '05', name: '붕괴 경보 — "Warning. Defensive line collapsing."', text: 'Warning. Defensive line collapsing.' }
];
const VOICES = [ ['2EiwWnXFnvU5JabPnv8n', '거친 베테랑'], ['N2lVS1w4EtoT3dr4eOWO', '걸걸한 중사'], ['pNInz6obpgDQGcFmaJgB', '굵은 미군'] ];   // 더 거칠고 급박하게
const manifest = JSON.parse(fs.readFileSync('sfx/manifest.json', 'utf8'));
for (const L of LINES) {
  const id = '목소리_' + L.num; manifest[id] = manifest[id] || { game: '목소리', num: L.num, name: L.name, sec: 2, prompt: L.text, files: [], ver: {} };
  const have = (manifest[id].files || []).filter(f => fs.existsSync(f)); manifest[id].files = have;
  for (let k = 0; k < VOICES.length; k++) {
    if (have.length > k) continue;
    const [vid, label] = VOICES[k];
    const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + vid + '?output_format=mp3_44100_128', { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: L.text, model_id: 'eleven_v3', voice_settings: { stability: 0.0, similarity_boost: 0.8, use_speaker_boost: true } }) });
    if (!res.ok) { console.error(id, label, res.status, (await res.text()).slice(0, 200)); continue; }
    const buf = Buffer.from(await res.arrayBuffer()); const h = createHash('md5').update(buf).digest('hex').slice(0, 6);
    const file = `sfx/candidates/${id}_${k + 1}_${h}.mp3`; fs.writeFileSync(file, buf); manifest[id].files.push(file); manifest[id].ver[file] = h; console.log('ok', file, label);
    await new Promise(r => setTimeout(r, 300));
  }
}
fs.writeFileSync('sfx/manifest.json', JSON.stringify(manifest, null, 1)); console.log('done');
