import { lessons, notes as hangulNotes } from './hangul.js';
import { categories, notes as phraseNotes } from './phrases.js';

export default {
  id: 'ko',
  name: '韓文',
  ttsLang: 'ko-KR',
  lessons,
  categories,
  notes: [...hangulNotes, ...phraseNotes],
};
