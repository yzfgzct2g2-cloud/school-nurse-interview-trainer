// features/notes.js — 個人筆記（彙整有寫筆記的題目）
// 讀取與題目詳情頁相同的 notes 儲存（db.getNote），列出有筆記的題目並可點入。
// 不改資料結構，純讀取。
import { getNote } from '../core/db.js';
import { dimMeta } from '../core/content.js';
import { esc, appBar } from '../core/dom.js';

export async function renderNotes(outlet, { content } = {}) {
  outlet.innerHTML = `${appBar('個人筆記')}
    <section class="view notes">
      <p class="eyebrow">個人筆記</p>
      <h1 class="page-title">你寫過的筆記</h1>
      <p class="page-sub">這裡彙整所有你在題目頁寫下的筆記，點進去可繼續編輯。筆記只存在這台裝置，不會改到原始資料。</p>
      <div id="notes-list"><p class="empty">載入中…</p></div>
    </section>`;

  const listEl = outlet.querySelector('#notes-list');

  // 逐題讀取筆記（題庫僅 40 題，成本可接受），收集非空者。
  const found = [];
  for (const q of content.questions) {
    try {
      const text = await getNote(q.id);
      if (text && text.trim()) found.push({ q, text: text.trim() });
    } catch (_) { /* 忽略單題讀取失敗 */ }
  }

  if (!found.length) {
    listEl.innerHTML = `<p class="empty">還沒有任何筆記。到任一題目頁的「個人筆記」寫下你自己的版本，就會出現在這裡。<br><a href="#/knowledge">前往知識庫</a></p>`;
    return;
  }

  listEl.innerHTML = `<ul class="notes-ul">${found.map(({ q, text }) => {
    const color = dimMeta(content, (q.dimensions || [])[0]).color;
    const snippet = text.length > 60 ? text.slice(0, 60) + '…' : text;
    return `<li class="note-card" style="--dc:${esc(color)}">
      <a href="#/q/${encodeURIComponent(q.id)}">
        <span class="note-card-id">${esc(q.id)}</span>
        <span class="note-card-title">${esc(q.title)}</span>
        <span class="note-card-snippet">${esc(snippet)}</span>
      </a>
    </li>`;
  }).join('')}</ul>`;
}
