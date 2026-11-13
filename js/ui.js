// Small helpers shared by the views.

export const app = document.getElementById('app');

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const shuffle = a => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const pick = a => a[Math.floor(Math.random() * a.length)];

export const bar = (title, back = '#/') => `<header class="bar"><a href="${back}" class="nav-back">‹</a><h2>${esc(title)}</h2><span></span></header>`;
