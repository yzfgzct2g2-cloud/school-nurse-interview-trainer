// features/home.js — 首頁（候場區）
import { getProfile, getRecent } from '../core/settings.js';
import { esc, IC } from '../core/dom.js';

export function renderHome(outlet, { content } = {}) {
  const profile = getProfile() || { salutation: '老師' };
  const recent = getRecent().map((id) => content.byId[id]).filter(Boolean);

  outlet.innerHTML = `
  <section class="view home">
    <header class="hero">
      <p class="eyebrow">校護口試訓練・候場區</p>
      <h1 class="hero-greeting">${esc(profile.salutation)}，<br>準備好上場了嗎？</h1>
      <p class="hero-sub">搜尋題目、翻閱知識庫，或直接進場模擬。原始資料永遠都在，隨時回得去。</p>
      <form class="searchbar" id="home-search" role="search">
        <span class="searchbar-icon">${IC.search}</span>
        <input class="searchbar-input" name="q" type="search" placeholder="搜尋題目、關鍵字、法規…" autocomplete="off" aria-label="搜尋題庫">
        <button class="searchbar-btn" type="submit">搜尋</button>
      </form>
    </header>

    <div class="actions-primary">
      ${actionCard('正式口試', '完整模擬：自我介紹、委員提問、追問、評分', '#/soon/exam', 'Sprint 3')}
      ${actionCard('單題練習', '看題自答、看解答、自評、存進度', '#/practice', '')}
    </div>

    <nav class="grid-secondary" aria-label="功能">
      ${miniCard('知識庫', '瀏覽全部題目與正本', '#/knowledge')}
      ${miniCard('我的收藏', '標記的題目', '#/knowledge?fav=1')}
      ${miniCard('成績紀錄', '歷次練習與成長', '#/records')}
      ${miniCard('考前 5 分鐘', '一句記憶快閃複習', '#/cram')}
    </nav>

    <section class="recent">
      <h2 class="section-title">最近閱讀</h2>
      ${recent.length
        ? `<ul class="recent-list">${recent.map((q) => `
        <li><a class="recent-item" href="#/q/${encodeURIComponent(q.id)}">
          <span class="recent-title">${esc(q.title)}</span>
          <span class="recent-hook">${esc(q.memoryHook || '')}</span>
        </a></li>`).join('')}</ul>`
        : `<p class="empty">還沒有閱讀紀錄。從知識庫挑一題開始吧。</p>`}
    </section>
  </section>`;

  const form = outlet.querySelector('#home-search');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = form.q.value.trim();
    location.hash = q ? `#/knowledge?q=${encodeURIComponent(q)}` : '#/knowledge';
  });
}

function actionCard(title, desc, href, tag) {
  return `<a class="action-card" href="${href}">
    ${tag ? `<span class="action-tag">${esc(tag)}</span>` : ''}
    <span class="action-title">${esc(title)}</span>
    <span class="action-desc">${esc(desc)}</span>
  </a>`;
}

function miniCard(title, desc, href, tag) {
  return `<a class="mini-card" href="${href}">
    <span class="mini-title">${esc(title)}${tag ? `<span class="mini-tag">${esc(tag)}</span>` : ''}</span>
    <span class="mini-desc">${esc(desc)}</span>
  </a>`;
}
