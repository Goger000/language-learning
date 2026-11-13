import { Rating, newCard, schedule, introduce, formatInterval, DAY } from './fsrs.js';
import { state, save, today, todayStats, exportData, importData, resetAll } from './store.js';
import { speak, hasVoice } from './tts.js';
import { packs } from '../lang/index.js';

const pack = packs.ko;
const CUSTOM = { id: 'custom', name: '我的卡片' };

// Custom cards come first so words picked up at work are learned before the built-in deck.
let allNotes = [];
let noteById = new Map();
function refreshNotes() {
  const custom = Object.values(state.custom)
    .sort((a, b) => a.created - b.created)
    .map(c => ({ ...c, type: 'phrase', deck: 'phrases', category: CUSTOM.id, dirs: c.listenOnly ? ['listen'] : ['listen', 'recall'] }));
  allNotes = [...custom, ...pack.notes];
  noteById = new Map(allNotes.map(n => [n.id, n]));
}
refreshNotes();
const LEARN_AHEAD = 20 * 60 * 1000; // show learning cards up to 20 min early when nothing else is left
const app = document.getElementById('app');

// ---------- helpers ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cardId = (note, dir) => `${note.id}#${dir}`;
const parseId = id => { const i = id.lastIndexOf('#'); return [id.slice(0, i), id.slice(i + 1)]; };
const isLearning = c => c.state === 'learning' || c.state === 'relearning';
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const say = text => speak(text, { lang: pack.ttsLang, rate: state.settings.ttsRate });
const sayBtn = (text, label = '🔊') => `<button class="say" data-say="${esc(text)}" aria-label="播放">${esc(label)}</button>`;
const bar = (title, back = '#/') => `<header class="bar"><a href="${back}" class="nav-back">‹</a><h2>${esc(title)}</h2><span></span></header>`;

document.addEventListener('click', e => {
  const b = e.target.closest('[data-say]');
  if (b) say(b.dataset.say);
});

// ---------- scheduling queue ----------

function liveCards() {
  return Object.entries(state.cards).filter(([id]) => {
    const [nid, dir] = parseId(id);
    return noteById.get(nid)?.dirs.includes(dir);
  });
}

function dueCards(now) {
  return liveCards().filter(([, c]) => c.due <= now);
}

// New cards come only from the phrase deck (Hangul cards enter via lessons).
// A note's later direction (recall) unlocks once the earlier one (listen) has graduated.
function newCandidates(limit) {
  const out = [];
  if (limit <= 0) return out;
  for (const note of allNotes) {
    if (note.deck !== 'phrases') continue;
    for (let i = 0; i < note.dirs.length; i++) {
      const id = cardId(note, note.dirs[i]);
      if (state.cards[id]) continue;
      if (i > 0 && state.cards[cardId(note, note.dirs[i - 1])]?.state !== 'review') break;
      out.push(id);
      break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

const newLeftToday = () => Math.max(0, state.settings.newPerDay - todayStats().new);

function pickNext(session) {
  const now = Date.now();
  const byDue = (a, b) => a[1].due - b[1].due;
  const due = dueCards(now);
  const learning = due.filter(([, c]) => isLearning(c)).sort(byDue);
  if (learning.length) return learning[0][0];

  const reviews = due.filter(([, c]) => c.state === 'review').sort(byDue);
  const news = newCandidates(Math.min(1, newLeftToday()));
  // Mix one new card in every three so reviews and new material interleave.
  if (reviews.length && (!news.length || session.count % 3 !== 2)) return reviews[0][0];
  if (news.length) return news[0];

  const ahead = liveCards().filter(([, c]) => isLearning(c) && c.due <= now + LEARN_AHEAD).sort(byDue);
  if (!ahead.length) return null;
  const notSame = ahead.find(([id]) => id !== session.last);
  return (notSame || ahead[0])[0];
}

// ---------- card templates ----------

const roman = s => s && state.settings.showRoman ? `<div class="roman">${esc(s)}</div>` : '';
const phraseBack = n => `
  <div class="ko big">${esc(n.ko)} ${sayBtn(n.ko)}</div>
  ${roman(n.roman)}
  <div class="meaning">${esc(n.zh)}</div>
  ${n.note ? `<div class="tip">💡 ${esc(n.note)}</div>` : ''}`;

const templates = {
  jamo: {
    read: {
      front: n => `<div class="prompt">這個怎麼念？</div><div class="hero ko">${esc(n.jamo)}</div>`,
      back: n => `<div class="answer">${esc(n.roman)}</div><div class="tip">${esc(n.tip)}</div>
        <div class="example">例：<span class="ko">${esc(n.ex)}</span> ${sayBtn(n.ex)}</div>`,
      sayBack: n => n.ex,
    },
  },
  word: {
    read: {
      front: n => `<div class="prompt">念念看，是什麼意思？</div><div class="hero ko">${esc(n.ko)}</div>`,
      back: n => `${n.pron ? `<div class="pron">實際發音 [${esc(n.pron)}]</div>` : ''}
        <div class="answer">${esc(n.roman)} ${sayBtn(n.ko)}</div><div class="meaning">${esc(n.zh)}</div>`,
      sayBack: n => n.ko,
    },
  },
  phrase: {
    listen: {
      front: n => `<div class="prompt">聽聽看，是什麼意思？</div>
        <div class="center">${sayBtn(n.ko, '🔊 再聽一次')}</div>
        <div class="center"><button class="link" data-hint>看韓文提示</button></div>
        <div class="ko big hint hidden">${esc(n.ko)}</div>`,
      sayFront: n => n.ko,
      back: phraseBack,
    },
    recall: {
      front: n => `<div class="prompt">用韓文怎麼說？先說出口再看答案</div><div class="hero zh">${esc(n.zh)}</div>`,
      back: phraseBack,
      sayBack: n => n.ko,
    },
  },
};

// ---------- views ----------

function countdown() {
  if (!state.settings.tripDate) return '';
  const days = Math.ceil((new Date(state.settings.tripDate + 'T00:00') - Date.now()) / DAY);
  if (days > 0) return `距離出發還有 ${days} 天`;
  if (days > -30) return '旅途愉快！🇰🇷';
  return '';
}

function voiceWarning() {
  if (hasVoice(pack.ttsLang) !== false) return '';
  return `<div class="warn">找不到韓文語音。Android：設定 → 文字轉語音 → 安裝韓文語音資料；iPhone：設定 → 輔助使用 → 朗讀內容 → 聲音 → 韓文。</div>`;
}

function home() {
  const now = Date.now();
  const due = dueCards(now).length;
  const newAvail = newCandidates(newLeftToday()).length;
  const done = pack.lessons.filter(l => state.lessons[l.id]).length;
  const stats = todayStats();
  const hint = done < pack.lessons.length
    ? `<p class="muted small">建議先完成字母課程，再把重心放在會話卡。會話卡可以同時開始。</p>` : '';
  app.innerHTML = `
    <header class="title"><h1>한국어</h1><p class="muted">${esc(countdown())}</p></header>
    ${voiceWarning()}
    <section class="panel">
      <div class="stats">
        <div><b>${due}</b><span>待複習</span></div>
        <div><b>${newAvail}</b><span>今日新卡</span></div>
        <div><b>${stats.reviews}</b><span>今日已練</span></div>
      </div>
      <a class="btn primary big" href="#/review">${due + newAvail ? '開始練習' : '今天完成了 ✓'}</a>
    </section>
    <nav class="menu">
      <a class="btn" href="#/hangul">한글 字母課程 <span class="muted">${done}/${pack.lessons.length}</span></a>
      <a class="btn" href="#/custom">${CUSTOM.name} <span class="muted">${Object.keys(state.custom).length}</span></a>
      <a class="btn" href="#/browse">會話本</a>
      <a class="btn" href="#/settings">設定</a>
    </nav>
    ${hint}`;
  // Voices load asynchronously; re-check once they arrive.
  if (hasVoice(pack.ttsLang) === null) setTimeout(() => { if (location.hash.replace(/^#\/?/, '') === '') home(); }, 1500);
}

function reviewView() {
  const session = { count: 0, last: null };

  function next() {
    const id = pickNext(session);
    if (!id) return finished();
    const [nid, dir] = parseId(id);
    const note = noteById.get(nid);
    const tpl = templates[note.type][dir];
    const card = state.cards[id];
    let revealed = false;

    function render() {
      const now = Date.now();
      const left = dueCards(now).length + newCandidates(newLeftToday()).length;
      app.innerHTML = `
        <header class="bar"><a href="#/" class="nav-back">‹</a><h2>練習</h2><span class="muted">剩 ${left}</span></header>
        <section class="card">
          ${card ? '' : '<span class="tag">新卡</span>'}
          <div class="front">${tpl.front(note)}</div>
          ${revealed ? `<hr><div class="back">${tpl.back(note)}</div>` : ''}
        </section>
        <footer class="actions">${revealed ? ratingButtons(card, now) : '<button class="btn primary big" id="reveal">顯示答案</button>'}</footer>`;
      app.querySelector('[data-hint]')?.addEventListener('click', e => {
        e.target.remove();
        app.querySelector('.hint').classList.remove('hidden');
      });
      if (!revealed) {
        app.querySelector('#reveal').onclick = () => {
          revealed = true;
          render();
          if (tpl.sayBack) say(tpl.sayBack(note));
        };
      } else {
        app.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => rate(Number(b.dataset.rate)));
      }
    }

    function rate(g) {
      const now = Date.now();
      state.cards[id] = schedule(card || newCard(), g, now, state.settings.retention);
      const stats = todayStats();
      if (!card) stats.new += 1;
      stats.reviews += 1;
      save();
      session.count += 1;
      session.last = id;
      next();
    }

    render();
    if (tpl.sayFront) say(tpl.sayFront(note));
  }

  function ratingButtons(card, now) {
    const labels = [[Rating.Again, '忘了'], [Rating.Hard, '困難'], [Rating.Good, '記得'], [Rating.Easy, '簡單']];
    return `<div class="ratings">${labels.map(([g, label]) => {
      const due = schedule(card || newCard(), g, now, state.settings.retention).due;
      return `<button class="btn rate r${g}" data-rate="${g}"><span>${label}</span><small>${formatInterval(due - now)}</small></button>`;
    }).join('')}</div>`;
  }

  function finished() {
    const upcoming = liveCards().filter(([, c]) => isLearning(c)).sort((a, b) => a[1].due - b[1].due)[0];
    const more = upcoming ? `<p class="muted">${formatInterval(upcoming[1].due - Date.now())}後還有卡片要再練一次</p>` : '';
    app.innerHTML = `${bar('練習')}
      <section class="panel center">
        <div class="hero">🎉</div>
        <p>今天的練習完成了！共練習 ${todayStats().reviews} 次。</p>
        ${more}
        <a class="btn primary" href="#/">回首頁</a>
      </section>`;
  }

  next();
}

function hangulView() {
  const firstUndone = pack.lessons.findIndex(l => !state.lessons[l.id]);
  app.innerHTML = `${bar('한글 字母課程')}
    <section class="list">${pack.lessons.map((l, i) => {
      const done = !!state.lessons[l.id];
      const open = done || i === firstUndone;
      const mark = done ? '✓' : open ? '▶' : '🔒';
      return open
        ? `<a class="btn row ${done ? 'done' : 'current'}" href="#/lesson/${i}"><span>${i + 1}. ${esc(l.title)}</span><span>${mark}</span></a>`
        : `<div class="btn row locked"><span>${i + 1}. ${esc(l.title)}</span><span>${mark}</span></div>`;
    }).join('')}</section>`;
}

function lessonView(arg) {
  const idx = Number(arg);
  const lesson = pack.lessons[idx];
  if (!lesson) return hangulView();
  const items = lesson.items.map(id => noteById.get(id));
  const words = lesson.words.map(id => noteById.get(id));
  const pages = [{ kind: 'intro' }, ...items.map(n => ({ kind: 'item', n })), { kind: 'words' }];
  let page = 0;

  function learn() {
    const p = pages[page];
    let body = '';
    if (p.kind === 'intro') {
      body = `<h3>${esc(lesson.title)}</h3><p>${esc(lesson.intro)}</p>`;
    } else if (p.kind === 'item') {
      body = `<div class="hero ko">${esc(p.n.jamo)}</div><div class="answer">${esc(p.n.roman)}</div>
        <div class="tip">${esc(p.n.tip)}</div>
        <div class="example">例：<span class="ko big">${esc(p.n.ex)}</span> ${sayBtn(p.n.ex)}</div>`;
    } else {
      body = `<h3>練習單字</h3><p class="muted small">點 🔊 聽發音，邊聽邊看字母怎麼拼。</p>
        <ul class="words">${words.map(w => `<li><span class="ko">${esc(w.ko)}</span>
          <span class="roman">${esc(w.roman)}${w.pron ? ` [${esc(w.pron)}]` : ''}</span>
          <span class="meaning">${esc(w.zh)}</span>${sayBtn(w.ko)}</li>`).join('')}</ul>`;
    }
    const last = page === pages.length - 1;
    app.innerHTML = `${bar(`第 ${idx + 1} 課`, '#/hangul')}
      <div class="progress"><div style="width:${(page + 1) / pages.length * 100}%"></div></div>
      <section class="card">${body}</section>
      <footer class="actions row2">
        <button class="btn" id="prev" ${page === 0 ? 'disabled' : ''}>上一步</button>
        <button class="btn primary" id="next">${last ? '開始測驗' : '下一步'}</button>
      </footer>`;
    app.querySelector('#prev').onclick = () => { page -= 1; learn(); };
    app.querySelector('#next').onclick = () => { if (last) quiz(); else { page += 1; learn(); if (pages[page].kind === 'item') say(pages[page].n.ex); } };
  }

  function quiz() {
    const prior = pack.lessons.slice(0, idx + 1);
    const itemPool = prior.flatMap(l => l.items).map(id => noteById.get(id).roman);
    const wordPool = prior.flatMap(l => l.words).map(id => noteById.get(id));
    const opts = (answer, pool) => shuffle([answer, ...shuffle([...new Set(pool)].filter(x => x !== answer)).slice(0, 3)]);

    let queue = [
      ...items.map(n => ({ id: n.id, prompt: n.jamo, answer: n.roman, options: opts(n.roman, itemPool), say: n.ex })),
      ...words.map(w => ({ id: w.id, prompt: w.ko, answer: w.roman, options: opts(w.roman, wordPool.map(x => x.roman)), say: w.ko })),
      ...shuffle(words).slice(0, 4).map(w => ({ listen: true, prompt: w.ko, answer: w.ko, options: opts(w.ko, wordPool.map(x => x.ko)), say: w.ko })),
      ...lesson.contrasts.flatMap(group => shuffle(group).slice(0, 2).map(s => ({ listen: true, prompt: s, answer: s, options: shuffle(group), say: s }))),
    ];
    queue = shuffle(queue);
    const total = queue.length;
    const missed = new Set(); // note ids answered wrong at least once
    let firstTry = 0, answered = 0;

    function ask() {
      if (!queue.length) return finish();
      const q = queue[0];
      app.innerHTML = `${bar(`第 ${idx + 1} 課測驗`, '#/hangul')}
        <div class="progress"><div style="width:${answered / total * 100}%"></div></div>
        <section class="card">
          ${q.listen
            ? `<div class="prompt">聽到的是哪一個？</div><div class="center">${sayBtn(q.say, '🔊 再聽一次')}</div>`
            : `<div class="prompt">怎麼念？</div><div class="hero ko">${esc(q.prompt)}</div>`}
          <div class="options">${q.options.map(o => `<button class="btn opt ${q.listen ? 'ko' : ''}" data-opt="${esc(o)}">${esc(o)}</button>`).join('')}</div>
          <div id="feedback"></div>
        </section>`;
      if (q.listen) say(q.say);
      app.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => answer(q, b.dataset.opt));
    }

    function answer(q, choice) {
      const ok = choice === q.answer;
      app.querySelectorAll('[data-opt]').forEach(b => {
        b.disabled = true;
        if (b.dataset.opt === q.answer) b.classList.add('correct');
        else if (b.dataset.opt === choice) b.classList.add('wrong');
      });
      if (!q.listen) say(q.say);
      queue.shift();
      if (ok) {
        if (!q.retry) firstTry += 1;
        answered += 1;
      } else {
        if (q.id) missed.add(q.id);
        queue.push({ ...q, retry: true, options: shuffle(q.options) }); // ask again until correct
      }
      app.querySelector('#feedback').innerHTML = `
        <p class="${ok ? 'ok' : 'bad'}">${ok ? '答對了！' : `正確答案：${esc(q.listen ? q.answer : `${q.prompt} = ${q.answer}`)}`}</p>
        <button class="btn primary" id="cont">繼續</button>`;
      app.querySelector('#cont').onclick = ask;
    }

    function finish() {
      const now = Date.now();
      for (const n of [...items, ...words]) {
        const id = cardId(n, 'read');
        if (!state.cards[id]) state.cards[id] = introduce(now, !missed.has(n.id));
      }
      state.lessons[lesson.id] = { done: today() };
      save();
      const hasNext = idx + 1 < pack.lessons.length;
      app.innerHTML = `${bar('完成', '#/hangul')}
        <section class="panel center">
          <div class="hero">👏</div>
          <p>第 ${idx + 1} 課完成！一次答對 ${firstTry} / ${total} 題。</p>
          <p class="muted small">這課的字母和單字已加入複習，明天會出現。</p>
          ${hasNext ? `<a class="btn primary" href="#/lesson/${idx + 1}">下一課</a>` : ''}
          <a class="btn" href="#/hangul">回課程列表</a>
        </section>`;
    }

    ask();
  }

  learn();
}

function customView() {
  const list = allNotes.filter(n => n.category === CUSTOM.id).reverse();
  app.innerHTML = `${bar(CUSTOM.name)}
    <a class="btn primary" href="#/edit">＋ 新增卡片</a>
    <p class="muted small">工作上或路上聽到的新詞，馬上加進來。自訂卡片會比內建卡片優先出現。</p>
    ${list.length
      ? `<ul class="phrases">${list.map(n => `<li><a href="#/edit/${encodeURIComponent(n.id)}">
          <div class="ko">${esc(n.ko)}</div>${n.roman ? `<div class="roman">${esc(n.roman)}</div>` : ''}
          <div class="meaning">${esc(n.zh)}</div></a></li>`).join('')}</ul>`
      : '<p class="muted center">還沒有自訂卡片</p>'}`;
}

function editView(arg) {
  const id = arg ? decodeURIComponent(arg) : null;
  const c = id ? state.custom[id] : null;
  if (id && !c) return customView();
  app.innerHTML = `${bar(c ? '編輯卡片' : '新增卡片', '#/custom')}
    <form class="panel form" id="f" autocomplete="off">
      <label class="stack">韓文<input name="ko" lang="ko" required value="${esc(c?.ko)}"></label>
      <button type="button" class="btn" id="test">🔊 聽聽看</button>
      <label class="stack">中文意思<input name="zh" required value="${esc(c?.zh)}"></label>
      <label class="stack">羅馬拼音（可留空）<input name="roman" value="${esc(c?.roman)}"></label>
      <label class="stack">備註（可留空）<input name="note" value="${esc(c?.note)}"></label>
      <label class="check"><input type="checkbox" name="listenOnly" ${c?.listenOnly ? 'checked' : ''}>只練聽懂（不練說出口）</label>
      <button class="btn primary">${c ? '儲存' : '新增'}</button>
      ${c ? '<button type="button" class="btn danger" id="del">刪除這張卡片</button>' : ''}
      <p id="msg" class="ok center"></p>
    </form>`;
  const f = app.querySelector('#f');
  const field = name => f.elements[name];
  app.querySelector('#test').onclick = () => say(field('ko').value);
  f.onsubmit = e => {
    e.preventDefault();
    const data = {
      ko: field('ko').value.trim(), zh: field('zh').value.trim(), roman: field('roman').value.trim(),
      note: field('note').value.trim(), listenOnly: field('listenOnly').checked,
    };
    if (!data.ko || !data.zh) return;
    if (c) {
      Object.assign(c, data);
    } else {
      const nid = `${pack.id}.c.${Date.now().toString(36)}`;
      state.custom[nid] = { id: nid, created: Date.now(), ...data };
    }
    save();
    refreshNotes();
    if (c) {
      location.hash = '#/custom';
    } else {
      // Stay on the form so several words can be added in a row.
      f.reset();
      app.querySelector('#msg').textContent = `已新增：${data.ko}`;
      field('ko').focus();
    }
  };
  app.querySelector('#del')?.addEventListener('click', () => {
    if (!confirm(`刪除「${c.ko}」和它的學習紀錄？`)) return;
    delete state.custom[id];
    for (const cid of Object.keys(state.cards)) if (parseId(cid)[0] === id) delete state.cards[cid];
    save();
    refreshNotes();
    location.hash = '#/custom';
  });
}

function browseView() {
  const phrases = allNotes.filter(n => n.deck === 'phrases');
  const categories = [CUSTOM, ...pack.categories];
  app.innerHTML = `${bar('會話本')}
    <input class="search" type="search" id="q" placeholder="搜尋中文或韓文…">
    <div id="results"></div>`;
  const results = app.querySelector('#results');
  function render(q) {
    q = q.trim().toLowerCase();
    results.innerHTML = categories.map(cat => {
      const list = phrases.filter(n => n.category === cat.id && (!q || [n.ko, n.zh, n.roman].some(s => s.toLowerCase().includes(q))));
      if (!list.length) return '';
      return `<h3>${esc(cat.name)}</h3><ul class="phrases">${list.map(n => {
        const learned = n.dirs.some(d => state.cards[cardId(n, d)]);
        return `<li data-say="${esc(n.ko)}" class="${learned ? 'learned' : ''}">
          <div class="ko">${esc(n.ko)}</div><div class="roman">${esc(n.roman)}</div><div class="meaning">${esc(n.zh)}</div></li>`;
      }).join('')}</ul>`;
    }).join('') || '<p class="muted center">找不到符合的句子</p>';
  }
  app.querySelector('#q').oninput = e => render(e.target.value);
  render('');
}

function settingsView() {
  const s = state.settings;
  app.innerHTML = `${bar('設定')}
    <section class="panel form">
      <label>每日新卡上限<input type="number" id="newPerDay" min="0" max="200" value="${s.newPerDay}"></label>
      <label>目標記憶率<select id="retention">${[0.8, 0.85, 0.9, 0.95].map(v => `<option value="${v}" ${v === s.retention ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></label>
      <p class="muted small">記憶率越高，複習越頻繁。90% 是研究建議的平衡點。</p>
      <label>語速 <span id="rateVal">${s.ttsRate}</span><input type="range" id="ttsRate" min="0.5" max="1.2" step="0.1" value="${s.ttsRate}"></label>
      <label class="check"><input type="checkbox" id="showRoman" ${s.showRoman ? 'checked' : ''}>會話卡顯示羅馬拼音</label>
      <p class="muted small">學完字母後建議關掉，改用韓文字閱讀。</p>
      <label>出發日期<input type="date" id="tripDate" value="${esc(s.tripDate)}"></label>
      <button class="btn" data-say="안녕하세요. 만나서 반갑습니다.">🔊 測試語音</button>
    </section>
    <section class="panel form">
      <button class="btn" id="export">匯出備份</button>
      <label class="btn center">匯入備份<input type="file" id="import" accept="application/json,.json" hidden></label>
      <button class="btn danger" id="reset">清除所有進度</button>
    </section>`;
  const $ = id => app.querySelector('#' + id);
  $('newPerDay').onchange = e => { s.newPerDay = Math.max(0, Number(e.target.value) || 0); save(); };
  $('retention').onchange = e => { s.retention = Number(e.target.value); save(); };
  $('ttsRate').oninput = e => { s.ttsRate = Number(e.target.value); $('rateVal').textContent = s.ttsRate; save(); };
  $('showRoman').onchange = e => { s.showRoman = e.target.checked; save(); };
  $('tripDate').onchange = e => { s.tripDate = e.target.value; save(); };
  $('export').onclick = () => {
    const url = URL.createObjectURL(new Blob([exportData()], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `language-learning-${today()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('import').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      importData(await file.text());
      alert('匯入完成');
      location.hash = '#/';
    } catch (err) {
      alert('匯入失敗：' + err.message);
    }
  };
  $('reset').onclick = () => { if (confirm('確定要清除所有學習進度？這無法復原。建議先匯出備份。')) resetAll(); };
}

// ---------- router ----------

const routes = { '': home, review: reviewView, hangul: hangulView, lesson: lessonView, browse: browseView, settings: settingsView, custom: customView, edit: editView };

function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  window.speechSynthesis?.cancel();
  (routes[name] || home)(arg);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
