import { lessons, notes as hangulNotes } from './hangul.js';
import { categories, notes as phraseNotes } from './phrases.js';
import { contrasts } from './contrasts.js';

export default {
  id: 'ko',
  name: '韓文',
  ttsLang: 'ko-KR',
  lessons,
  categories,
  contrasts,
  notes: [...hangulNotes, ...phraseNotes],
};
