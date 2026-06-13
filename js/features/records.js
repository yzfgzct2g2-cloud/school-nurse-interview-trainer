// features/records.js — 成績紀錄（讀 IndexedDB attempts，依題目彙整）
import { getAllAttempts } from '../core/db.js';
import { dimMeta } from '../core/content.js';
import { esc, appBar } from '../core/dom.js';

export function renderRecords(outlet, { content } = {}) {
  outlet.innerHTML = `${appBar('成績紀錄')}<section class="view records"><p class="empty">讀取中…</p></section>`;

  getAllAttempts().then((attempts) => {
    const view = outlet.querySelector('.records');
    if (!attempts.length) {
      view.innerHTML = '<p class="empty">還沒有練習紀錄。<a href="#/practice">開始單題練習</a></p>';
      return;
    }

    const byQ = {};
    for (const a of attempts) (byQ[a.questionId] = byQ[a.questionId] || []).push(a);

    const today = new Date().toISOString().slice(0, 10);
    const todayCount = attempts.filter((a) => (a.createdAt || '').slice(0, 10) === today).length;

    const rows = Object.entries(byQ).map(([qid, list]) => {
      const q = content.byId[qid];
      if (!q) return null;
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const last = list[0];
      const know = list.filter((a) => a.selfRating === 'know').length;
      const review = list.filter((a) => a.selfRating === 'review').length;
      return { q, qid, count: list.length, know, review, last, d: dimMeta(content, (q.dimensions || [])[0]) };
    }).filter(Boolean).sort((a, b) => (a.last.createdAt < b.last.createdAt ? 1 : -1));

    view.innerHTML = `
      <div class="rec-summary">
        <div class="rec-kpi"><span class="rec-n">${attempts.length}</span>總練習次數</div>
        <div class="rec-kpi"><span class="rec-n">${rows.length}</span>練過題數</div>
        <div class="rec-kpi"><span class="rec-n">${todayCount}</span>今日練習</div>
      </div>
      <ul class="q-list">${rows.map((r) => `
        <li><a class="q-item" href="#/q/${encodeURIComponent(r.qid)}">
          <div class="q-item-chips">
            <span class="chip" style="--dc:${esc(r.d.color)}">${esc(r.d.label)}</span>
            <span class="rec-last ${r.last.selfRating === 'know' ? 'know' : 'review'}">${r.last.selfRating === 'know' ? '會了' : '再練'}</span>
          </div>
          <div class="q-item-title">${esc(r.q.title)}</div>
          <div class="rec-meta">練習 ${r.count} 次 · 會了 ${r.know} · 再練 ${r.review}</div>
        </a></li>`).join('')}</ul>`;
  }).catch((e) => {
    console.warn('讀取成績紀錄失敗', e);
    const view = outlet.querySelector('.records');
    if (view) view.innerHTML = '<p class="empty">目前無法讀取紀錄。</p>';
  });
}
