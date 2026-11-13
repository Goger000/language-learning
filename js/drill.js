// Listening discrimination drill (high-variability phonetic training):
// hear one item from a minimal-pair set, pick it, get instant feedback, compare.

import { state, save, todayStats } from './store.js';
import { speak, voicesFor } from './tts.js';
import { app, esc, shuffle, pick, bar } from './ui.js';

const ROUND = 20;       // questions per round
const RECENT = 30;      // accuracy is measured over the last N answers per group
const MIN_SAMPLES = 5;  // below this, treat a group's accuracy as unknown (50%)

function recent(id) {
  return state.drill[id]?.recent || [];
}

function accuracy(id) {
  const r = recent(id);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}

function record(id, ok) {
  const s = (state.drill[id] ??= { n: 0, ok: 0, recent: [] });
  s.n += 1;
  s.ok += ok ? 1 : 0;
  s.recent = [...s.recent, ok ? 1 : 0].slice(-RECENT);
  const t = todayStats();
  t.drill = (t.drill || 0) + 1;
  save();
}

// Weak groups get more questions; a small floor keeps strong groups in rotation.
function weightedGroup(groups) {
  const weights = groups.map(g => 1 - (recent(g.id).length < MIN_SAMPLES ? 0.5 : accuracy(g.id)) + 0.15);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < groups.length; i++) {
    r -= weights[i];
    if (r <= 0) return groups[i];
  }
  return groups[groups.length - 1];
}

// Struggling groups are played slowly at a steady pitch; once accuracy recovers,
// vary voice, speed and pitch so the ear learns the sound category, not one recording.
const isStruggling = id => recent(id).length >= MIN_SAMPLES && accuracy(id) < 0.6;

function randomDelivery(lang, groupId) {
  const voice = pick(voicesFor(lang)) || null;
  if (isStruggling(groupId)) return { voice, rate: pick([0.6, 0.7]), pitch: 1 };
  return { voice, rate: pick([0.75, 0.9, 1.05]), pitch: pick([0.85, 1, 1.15]) };
}

export function drillListView(pack) {
  const nVoices = voicesFor(pack.ttsLang).length;
  app.innerHTML = `${bar('辨音訓練')}
    <p class="muted small">聽一個音，從相近的音裡選出正確的。每題會隨機換語音、語速和音高，訓練耳朵抓住真正的差別。</p>
    <a class="btn primary big" href="#/drill/mix">綜合練習（弱項多出題）</a>
    <section class="list">${pack.contrasts.map(g => {
      const n = recent(g.id).length;
      return `<a class="btn row" href="#/drill/${g.id}"><span class="ko">${esc(g.name)}</span>
        <span class="muted">${n ? `近 ${n} 題 ${Math.round(accuracy(g.id) * 100)}%` : '未練習'}</span></a>`;
    }).join('')}</section>
    <p class="muted small">手機上的韓文語音：${nVoices} 個${nVoices < 2 ? '。到手機的文字轉語音設定多裝幾個韓文語音，練習效果更好。' : ''}</p>`;
}

export function drillView(pack, arg) {
  const groups = arg === 'mix' ? pack.contrasts : pack.contrasts.filter(g => g.id === arg);
  if (!groups.length) return drillListView(pack);
  const title = arg === 'mix' ? '綜合練習' : groups[0].name;
  const play = (text, delivery) => speak(text, { lang: pack.ttsLang, ...delivery });
  let count = 0, correct = 0, prev = null;

  function next() {
    if (count >= ROUND) return summary();
    const g = groups.length > 1 ? weightedGroup(groups) : groups[0];
    let set, target;
    for (let tries = 0; tries < 5 && (!target || target === prev); tries++) {
      set = pick(g.sets);
      target = pick(set);
    }
    prev = target;
    const delivery = randomDelivery(pack.ttsLang, g.id);
    const options = shuffle(set);
    const tags = [groups.length > 1 ? g.name : '', isStruggling(g.id) ? '慢速' : ''].filter(Boolean);

    app.innerHTML = `${bar(title, '#/drill')}
      <div class="progress"><div style="width:${count / ROUND * 100}%"></div></div>
      <section class="card">
        <div class="prompt">聽到的是哪一個？${tags.length ? `（${esc(tags.join('・'))}）` : ''}</div>
        <div class="center"><button class="say" id="replay">🔊 再聽一次</button></div>
        <div class="options cols${options.length}">${options.map(o => `<button class="btn opt ko" data-opt="${esc(o)}">${esc(o)}</button>`).join('')}</div>
        <div id="feedback"></div>
      </section>`;
    app.querySelector('#replay').onclick = () => play(target, delivery);
    app.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => answer(b.dataset.opt));
    play(target, delivery);

    function answer(choice) {
      const ok = choice === target;
      count += 1;
      if (ok) correct += 1;
      record(g.id, ok);
      app.querySelectorAll('[data-opt]').forEach(b => {
        if (b.dataset.opt === target) b.classList.add('correct');
        else if (b.dataset.opt === choice) b.classList.add('wrong');
        // After answering, each option plays in the same voice so the pair can be compared.
        b.onclick = () => play(b.dataset.opt, delivery);
      });
      app.querySelector('#feedback').innerHTML = `
        <p class="${ok ? 'ok' : 'bad'}">${ok ? '答對了！' : `正確是 <span class="ko">${esc(target)}</span>`}</p>
        <p class="muted small">點選項可以比較發音。${ok ? '' : esc(g.tip)}</p>
        <button class="btn primary" id="cont">下一題</button>`;
      app.querySelector('#cont').onclick = next;
      if (!ok) play(target, delivery);
    }
  }

  function summary() {
    app.innerHTML = `${bar(title, '#/drill')}
      <section class="panel center">
        <div class="hero">${correct >= ROUND * 0.9 ? '🎯' : '👂'}</div>
        <p>這一輪答對 ${correct} / ${ROUND} 題</p>
        <button class="btn primary" id="again">再一輪</button>
        <a class="btn" href="#/drill">回列表</a>
      </section>`;
    app.querySelector('#again').onclick = next;
    count = 0;
    correct = 0;
  }

  // Familiarization: hear every set side by side before being tested on it.
  function intro() {
    const g = groups[0];
    app.innerHTML = `${bar(title, '#/drill')}
      <section class="card intro">
        <div class="prompt">先點著聽，比較差別</div>
        <p class="tip">${esc(g.tip)}</p>
        ${g.sets.map(set => `<div class="options cols${set.length}">${set.map(s =>
          `<button class="btn opt ko" data-say="${esc(s)}">${esc(s)}</button>`).join('')}</div>`).join('')}
        <button class="btn primary big" id="start">開始測驗</button>
      </section>`;
    app.querySelector('#start').onclick = next;
  }

  if (groups.length === 1) intro();
  else next();
}
