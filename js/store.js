// All progress lives in localStorage on the phone. Export/import gives a manual backup.

const KEY = 'll.v1';
const DAY_CUTOFF_HOURS = 4; // studying at 1am still counts as "yesterday"

const DEFAULTS = {
  settings: { newPerDay: 20, retention: 0.9, ttsRate: 0.9, showRoman: true, tripDate: '' },
  cards: {},   // cardId -> FSRS card state
  lessons: {}, // lessonId -> { done: 'YYYY-MM-DD' }
  daily: {},   // 'YYYY-MM-DD' -> { new, reviews }
  custom: {},  // noteId -> { id, ko, zh, roman, note, listenOnly, created } user-made cards
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) return { ...structuredClone(DEFAULTS), ...raw, settings: { ...DEFAULTS.settings, ...raw.settings } };
  } catch { /* corrupted or unavailable: start fresh */ }
  return structuredClone(DEFAULTS);
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    alert('儲存失敗：' + e.message);
  }
}

export function today(now = Date.now()) {
  const d = new Date(now - DAY_CUTOFF_HOURS * 3600 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStats() {
  return (state.daily[today()] ??= { new: 0, reviews: 0 });
}

export function exportData() {
  return JSON.stringify({ app: 'language-learning', version: 1, exported: new Date().toISOString(), ...state }, null, 2);
}

export function importData(text) {
  const d = JSON.parse(text);
  if (!d || typeof d.cards !== 'object' || typeof d.settings !== 'object') throw new Error('檔案格式不正確');
  state.cards = d.cards;
  state.lessons = d.lessons || {};
  state.daily = d.daily || {};
  state.custom = d.custom || {};
  state.settings = { ...DEFAULTS.settings, ...d.settings };
  save();
}

export function resetAll() {
  localStorage.removeItem(KEY);
  location.reload();
}

// Ask the browser not to evict our data (matters most on iOS).
navigator.storage?.persist?.().catch(() => {});
