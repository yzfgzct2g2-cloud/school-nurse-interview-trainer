// features/knowledge.js — 知識庫清單 + 題目詳情（記錄卡）
import {
  getCollections, isCollected, toggleCollection, pushRecent,
} from '../core/settings.js';
import { getNote, saveNote } from '../core/db.js';
import { search } from '../core/search.js';
import { groupByDimension, dimMeta } from '../core/content.js';
import { esc, appBar, IC } from '../core/dom.js';
import * as tts from '../speech/tts.js';

function dimChips(content, q) {
  return (q.dimensions || []).map((id) => {
    const d = dimMeta(content, id);
    return `<span class="chip" style="--dc:${esc(d.color)}">${esc(d.label)}</span>`;
  }).join('');
}

function listItem(content, q) {
  return `<li><a class="q-item" href="#/q/${encodeURIComponent(q.id)}">
    <div class="q-item-chips">${dimChips(content, q)}${isCollected(q.id) ? '<span class="star">★</span>' : ''}</div>
    <div class="q-item-title">${esc(q.title)}</div>
    <div class="q-item-hook">${esc(q.memoryHook || '')}</div>
  </a></li>`;
}

function resultsHtml(content, { query, fav }) {
  let items;
  if (query) items = search(query);
  else if (fav) items = getCollections().map((id) => content.byId[id]).filter(Boolean);
  else items = null; // 分組瀏覽

  if (items !== null) {
    if (!items.length) {
      return `<p class="empty">${query ? '找不到符合的題目，換個關鍵字試試。' : '還沒有收藏。在題目頁點「收藏」即可加入。'}</p>`;
    }
    return `<p class="result-count">${items.length} 筆</p><ul class="q-list">${items.map((q) => listItem(content, q)).join('')}</ul>`;
  }
  return groupByDimension(content).map((g) => `
    <section class="q-group">
      <h2 class="group-title"><span class="group-dot" style="--dc:${esc(g.dim.color)}"></span>${esc(g.dim.label)}<span class="group-count">${g.items.length}</span></h2>
      <ul class="q-list">${g.items.map((q) => listItem(content, q)).join('')}</ul>
    </section>`).join('');
}

export function renderKnowledgeList(outlet, { content, query = '', fav = false } = {}) {
  const heading = fav ? '我的收藏' : '知識庫';

  outlet.innerHTML = `
    ${appBar(heading)}
    <section class="view knowledge">
      <form class="searchbar searchbar-inline" id="kb-search" role="search" onsubmit="return false">
        <span class="searchbar-icon">${IC.search}</span>
        <input class="searchbar-input" id="kb-input" type="search" placeholder="即時搜尋題目、關鍵字、法規…" value="${esc(query)}" autocomplete="off" aria-label="搜尋題庫">
      </form>
      <div id="kb-results">${resultsHtml(content, { query: query.trim(), fav })}</div>
    </section>`;

  const input = outlet.querySelector('#kb-input');
  const results = outlet.querySelector('#kb-results');
  // 即時搜尋：邊打邊濾，不需按鍵；只重繪結果區，保留輸入焦點。
  input.addEventListener('input', () => {
    results.innerHTML = resultsHtml(content, { query: input.value.trim(), fav });
  });
}

function facet(label, tag, mod, bodyHtml) {
  return `<section class="facet facet--${mod}">
    <div class="facet-head"><span class="facet-label">${esc(label)}</span>${tag ? `<span class="facet-tag">${esc(tag)}</span>` : ''}</div>
    ${bodyHtml}
  </section>`;
}

function facetList(label, mod, arr) {
  const items = arr || [];
  return `<section class="facet facet--${mod}">
    <div class="facet-head"><span class="facet-label">${esc(label)}</span></div>
    ${items.length ? `<ul class="facet-ul">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="facet-body muted">—</p>'}
  </section>`;
}

export function renderQuestion(outlet, { content, id } = {}) {
  const q = content.byId[id];
  if (!q) {
    outlet.innerHTML = `${appBar('找不到題目')}<section class="view"><p class="empty">找不到這題（${esc(id)}）。<a href="#/knowledge">回知識庫</a></p></section>`;
    return;
  }
  pushRecent(q.id);
  const spine = dimMeta(content, (q.dimensions || [])[0]).color;
  const collected = isCollected(q.id);

  const speakBtnHtml = tts.isSupported()
    ? `<button class="tool-btn" id="speak-btn" type="button">${IC.speaker}<span>朗讀題目</span></button>`
    : '';

  const followupHtml = (q.followups || []).length
    ? `<ul class="followup-list">${q.followups.map((f) => `
        <li class="followup-item">
          <span class="followup-q">${esc(f.question)}</span>
          ${(f.triggerKeywords || []).length ? `<span class="followup-trig">觸發關鍵字：${esc((f.triggerKeywords || []).join('、'))}</span>` : ''}
        </li>`).join('')}</ul>`
    : '<p class="facet-body muted">尚無追問。</p>';

  outlet.innerHTML = `
    ${appBar(q.id)}
    <article class="view qcard" style="--spine:${esc(spine)}">
      <header class="qcard-head">
        <div class="q-item-chips">${dimChips(content, q)}</div>
        <h1 class="qcard-title">${esc(q.title)}</h1>
        <div class="qcard-tools">
          ${speakBtnHtml}
          <button class="tool-btn" id="fav-btn" type="button" aria-pressed="${collected}">
            <span class="tool-star">${collected ? '★' : '☆'}</span><span id="fav-label">${collected ? '已收藏' : '收藏'}</span>
          </button>
        </div>
      </header>

      ${facet('快速回答', '30 秒', 'quick', `<p class="facet-body">${esc(q.quickAnswer)}</p>`)}
      ${facet('一句記憶', '', 'hook', `<p class="facet-hook">${esc(q.memoryHook)}</p>`)}

      <section class="original">
        <span class="original-seal">正本・永久保存</span>
        <h2 class="original-title">完整原始資料</h2>
        <p class="original-body">${esc(q.original)}</p>
      </section>

      ${facet('委員真正想看', '', 'want', `<p class="facet-body">${esc(q.examinerWants)}</p>`)}
      ${facetList('加分重點', 'bonus', q.bonusPoints)}
      ${facetList('容易失分', 'mistake', q.commonMistakes)}
      ${facet('追問樹', `${(q.followups || []).length} 題`, 'followup', followupHtml)}
      ${facetList('法規重點', 'reg', q.regulations)}

      <section class="note-block">
        <label class="facet-label" for="note-area">個人筆記</label>
        <textarea id="note-area" class="note-area" placeholder="寫下你自己的版本、提醒或補充…（存在這台裝置，不會改到原始資料）"></textarea>
        <span class="note-status" id="note-status"></span>
      </section>
    </article>`;

  const speakBtn = outlet.querySelector('#speak-btn');
  if (speakBtn) {
    speakBtn.addEventListener('click', () => {
      if (tts.isSpeaking()) { tts.cancel(); speakBtn.classList.remove('speaking'); return; }
      tts.speak(q.title, {
        onstart: () => speakBtn.classList.add('speaking'),
        onend: () => speakBtn.classList.remove('speaking'),
      });
    });
  }

  const favBtn = outlet.querySelector('#fav-btn');
  favBtn.addEventListener('click', () => {
    const on = toggleCollection(q.id);
    favBtn.setAttribute('aria-pressed', String(on));
    favBtn.querySelector('.tool-star').textContent = on ? '★' : '☆';
    outlet.querySelector('#fav-label').textContent = on ? '已收藏' : '收藏';
  });

  const note = outlet.querySelector('#note-area');
  const status = outlet.querySelector('#note-status');
  // 非同步載入已存筆記（IndexedDB）
  getNote(q.id).then((saved) => { if (saved && !note.value) note.value = saved; });
  let timer;
  note.addEventListener('input', () => {
    clearTimeout(timer);
    status.textContent = '編輯中…';
    timer = setTimeout(() => {
      saveNote(q.id, note.value).then(() => {
        status.textContent = '已儲存';
        setTimeout(() => { status.textContent = ''; }, 1500);
      });
    }, 500);
  });
}
