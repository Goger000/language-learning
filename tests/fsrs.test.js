import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rating, newCard, schedule, introduce, nextInterval, retrievability, DAY } from '../js/fsrs.js';

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 10, 1);

test('interval equals stability at 90% retention', () => {
  assert.equal(nextInterval(10, 0.9), 10);
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
});

test('new card learning steps', () => {
  const c = newCard();
  assert.equal(schedule(c, Rating.Again, T0).due - T0, 1 * MIN);
  assert.equal(schedule(c, Rating.Hard, T0).due - T0, 5.5 * MIN);
  assert.equal(schedule(c, Rating.Good, T0).due - T0, 10 * MIN);
  const easy = schedule(c, Rating.Easy, T0);
  assert.equal(easy.state, 'review');
  assert.ok(easy.due - T0 >= 7 * DAY);
});

test('good, good graduates to review', () => {
  let c = schedule(newCard(), Rating.Good, T0);
  assert.equal(c.state, 'learning');
  c = schedule(c, Rating.Good, T0 + 10 * MIN);
  assert.equal(c.state, 'review');
  assert.ok(c.due > T0 + DAY);
});

test('review intervals are ordered Hard < Good < Easy and grow over time', () => {
  const card = introduce(T0);
  const now = card.due;
  const days = g => Math.round((schedule(card, g, now).due - now) / DAY);
  assert.ok(days(Rating.Hard) < days(Rating.Good));
  assert.ok(days(Rating.Good) < days(Rating.Easy));

  let c = card, t = now, last = 0;
  for (let i = 0; i < 5; i++) {
    c = schedule(c, Rating.Good, t);
    const ivl = c.due - t;
    assert.ok(ivl > last, `interval should grow (step ${i})`);
    last = ivl;
    t = c.due;
  }
});

test('lapse drops stability and goes to relearning', () => {
  let c = introduce(T0);
  for (let i = 0; i < 3; i++) c = schedule(c, Rating.Good, c.due);
  const before = c.s;
  const lapsed = schedule(c, Rating.Again, c.due);
  assert.equal(lapsed.state, 'relearning');
  assert.equal(lapsed.lapses, 1);
  assert.ok(lapsed.s < before);
  const back = schedule(lapsed, Rating.Good, lapsed.due);
  assert.equal(back.state, 'review');
});

test('difficulty stays within 1..10', () => {
  let c = introduce(T0);
  for (let i = 0; i < 30; i++) {
    c = schedule(c, Rating.Again, c.due);
    c = schedule(c, Rating.Good, c.due);
  }
  assert.ok(c.d >= 1 && c.d <= 10);
  for (let i = 0; i < 30; i++) c = schedule(c, Rating.Easy, c.due);
  assert.ok(c.d >= 1 && c.d <= 10);
});
