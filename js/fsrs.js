// FSRS-4.5 scheduler (https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm)
// with Anki-style short-term learning steps for new and lapsed cards.

const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031,
  1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const MIN = 60 * 1000;
export const DAY = 24 * 60 * MIN;

const LEARN_STEPS = [1, 10];   // minutes
const RELEARN_STEPS = [10];    // minutes
const MAX_INTERVAL = 36500;    // days

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };

export function newCard() {
  return { state: 'new', s: 0, d: 0, due: 0, last: 0, reps: 0, lapses: 0, step: 0 };
}

export function retrievability(elapsedDays, s) {
  return Math.pow(1 + FACTOR * elapsedDays / s, DECAY);
}

export function nextInterval(s, retention = 0.9) {
  const days = s / FACTOR * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(Math.max(1, Math.round(days)), MAX_INTERVAL);
}

const clampD = d => Math.min(10, Math.max(1, d));
const initS = g => W[g - 1];
const initD = g => clampD(W[4] - (g - 3) * W[5]);

function nextD(d, g) {
  const d1 = d - W[6] * (g - 3);
  return clampD(W[7] * initD(3) + (1 - W[7]) * d1);
}

function recallS(d, s, r, g) {
  const hard = g === Rating.Hard ? W[15] : 1;
  const easy = g === Rating.Easy ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy);
}

function forgetS(d, s, r) {
  return Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
}

function graduate(c, now, days) {
  c.state = 'review';
  c.step = 0;
  c.due = now + days * DAY;
  return c;
}

// Short-term steps: Again -> first step, Hard -> repeat step, Good -> next step (graduate after last).
function stepCard(c, g, steps, now, retention) {
  if (g === Rating.Easy) return graduate(c, now, nextInterval(c.s, retention) + 1);
  if (g === Rating.Again) c.step = 0;
  else if (g === Rating.Good) c.step += 1;
  if (c.step >= steps.length) return graduate(c, now, nextInterval(c.s, retention));
  const delay = g === Rating.Hard && c.step === 0 && steps.length > 1
    ? (steps[0] + steps[1]) / 2
    : steps[c.step];
  c.due = now + delay * MIN;
  return c;
}

export function schedule(card, g, now = Date.now(), retention = 0.9) {
  const c = { ...card, reps: card.reps + 1, last: now };

  if (card.state === 'new') {
    c.s = initS(g);
    c.d = initD(g);
    c.state = 'learning';
    c.step = 0;
    if (g === Rating.Easy) return graduate(c, now, nextInterval(c.s, retention));
    return stepCard(c, g, LEARN_STEPS, now, retention);
  }

  c.d = nextD(card.d, g);
  if (card.state === 'learning') return stepCard(c, g, LEARN_STEPS, now, retention);
  if (card.state === 'relearning') return stepCard(c, g, RELEARN_STEPS, now, retention);

  // review
  const elapsed = Math.max(0, (now - card.last) / DAY);
  const r = retrievability(elapsed, card.s);
  if (g === Rating.Again) {
    c.s = forgetS(card.d, card.s, r);
    c.lapses += 1;
    c.state = 'relearning';
    c.step = 0;
    c.due = now + RELEARN_STEPS[0] * MIN;
    return c;
  }
  c.s = recallS(card.d, card.s, r, g);
  let days = nextInterval(c.s, retention);
  // Keep Hard < Good < Easy so the buttons always mean something different.
  const ivl = rating => nextInterval(recallS(card.d, card.s, r, rating), retention);
  if (g >= Rating.Good) days = Math.max(days, ivl(Rating.Hard) + 1);
  if (g === Rating.Easy) days = Math.max(days, Math.max(ivl(Rating.Good), ivl(Rating.Hard) + 1) + 1);
  return graduate(c, now, days);
}

// A card already taught in a lesson: enters review directly, first check tomorrow.
export function introduce(now = Date.now(), firstTryCorrect = true) {
  const g = firstTryCorrect ? Rating.Good : Rating.Hard;
  return { state: 'review', s: initS(g), d: initD(g), due: now + DAY, last: now, reps: 1, lapses: 0, step: 0 };
}

export function formatInterval(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${Math.max(1, m)}分`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}小時`;
  const d = Math.round(ms / DAY);
  if (d < 30) return `${d}天`;
  if (d < 365) return `${Math.round(d / 30)}個月`;
  return `${(d / 365).toFixed(1)}年`;
}
