// Text-to-speech via the phone's built-in voices (Web Speech API).

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
const voices = new Map(); // lang prefix -> SpeechSynthesisVoice
let loaded = false;

function refresh() {
  if (!synth) return;
  const list = synth.getVoices();
  if (!list.length) return;
  loaded = true;
  voices.clear();
  for (const v of list) {
    const prefix = v.lang.toLowerCase().replace('_', '-').split('-')[0];
    // Prefer local (offline) voices.
    if (!voices.has(prefix) || (v.localService && !voices.get(prefix).localService)) voices.set(prefix, v);
  }
}

if (synth) {
  refresh();
  synth.addEventListener?.('voiceschanged', refresh);
}

export function speak(text, { lang = 'ko-KR', rate = 0.9 } = {}) {
  if (!synth) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  const v = voices.get(lang.split('-')[0]);
  if (v) u.voice = v;
  synth.speak(u);
  return true;
}

// null = can't tell yet (voices still loading), true/false otherwise.
export function hasVoice(lang = 'ko-KR') {
  if (!synth) return false;
  if (!loaded) return null;
  return voices.has(lang.split('-')[0]);
}
