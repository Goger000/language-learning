// Text-to-speech via the phone's built-in voices (Web Speech API).

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
const voices = new Map(); // lang prefix -> [SpeechSynthesisVoice], offline voices first
let loaded = false;

const prefixOf = lang => lang.toLowerCase().replace('_', '-').split('-')[0];

function refresh() {
  if (!synth) return;
  const list = synth.getVoices();
  if (!list.length) return;
  loaded = true;
  voices.clear();
  for (const v of list) {
    const p = prefixOf(v.lang);
    if (!voices.has(p)) voices.set(p, []);
    voices.get(p).push(v);
  }
  for (const vs of voices.values()) vs.sort((a, b) => b.localService - a.localService);
}

if (synth) {
  refresh();
  synth.addEventListener?.('voiceschanged', refresh);
}

export function voicesFor(lang) {
  return voices.get(prefixOf(lang)) || [];
}

export function speak(text, { lang = 'ko-KR', rate = 0.9, pitch = 1, voice = null } = {}) {
  if (!synth) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  u.pitch = pitch;
  const v = voice || voicesFor(lang)[0];
  if (v) u.voice = v;
  synth.speak(u);
  return true;
}

// null = can't tell yet (voices still loading), true/false otherwise.
export function hasVoice(lang = 'ko-KR') {
  if (!synth) return false;
  if (!loaded) return null;
  return voicesFor(lang).length > 0;
}
