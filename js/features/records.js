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
      const hasRec = list.some((a) => a.hasRecording);
      const isExam = list.some((a) => a.mode === 'exam');
      const txAttempt = list.find((a) => a.transcript && a.transcript.trim());
      const hasTx = !!txAttempt;
      const txSnippet = hasTx ? (txAttempt.transcript.trim().length > 24 ? txAttempt.transcript.trim().slice(0, 24) + '…' : txAttempt.transcript.trim()) : '';
      // 評分顯示：優先 AI 委員（aiScore.score），否則本地評分（score.totalScore）
      const aiAttempt = list.find((a) => a.aiScore && typeof a.aiScore.score === 'number');
      const localAttempt = list.find((a) => a.score && typeof a.score.totalScore === 'number');
      const hasScore = !!(aiAttempt || localAttempt);
      const useAi = !!aiAttempt;
      const scoreTotal = useAi ? aiAttempt.aiScore.score : (localAttempt ? localAttempt.score.totalScore : null);
      const scoreLevel = useAi ? (aiAttempt.aiScore.level || '') : (localAttempt ? (localAttempt.score.level || '') : '');
      const aiSource = useAi ? 'OpenAI' : (hasScore ? '本地評分' : '');
      const missArr = useAi
        ? (aiAttempt.aiScore.missedPoints || [])
        : (localAttempt ? [...(localAttempt.score.missedKeywords || []), ...(localAttempt.score.missedBonusPoints || [])] : []);
      const missedSummary = missArr.slice(0, 2).map((m) => (m.length > 14 ? m.slice(0, 14) + '…' : m)).join('、');
      const followAttempt = list.find((a) => a.aiFollowUpQuestion && a.aiFollowUpQuestion.trim());
      const aiFollowUp = followAttempt ? followAttempt.aiFollowUpQuestion.trim() : '';
      const sugSrc = useAi ? (aiAttempt.aiScore.suggestion || '') : (localAttempt ? (localAttempt.score.suggestion || '') : '');
      const suggestionSummary = sugSrc ? (sugSrc.split('\n')[0].length > 30 ? sugSrc.split('\n')[0].slice(0, 30) + '…' : sugSrc.split('\n')[0]) : '';
      return { q, qid, count: list.length, know, review, last, hasRec, isExam, hasTx, txSnippet, hasScore, scoreTotal, scoreLevel, aiSource, missedSummary, aiFollowUp, suggestionSummary, d: dimMeta(content, (q.dimensions || [])[0]) };
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
            ${r.isExam ? '<span class="rec-tag exam">正式口試</span>' : ''}
            ${r.hasScore ? `<span class="rec-tag score">${r.scoreTotal} 分・${esc(r.scoreLevel)}</span>` : ''}
            ${r.hasScore && r.aiSource ? `<span class="rec-tag aisrc">${esc(r.aiSource)}</span>` : ''}
            ${r.hasRec ? '<span class="rec-tag rec">🎙 有錄音</span>' : ''}
            ${r.hasTx ? '<span class="rec-tag tx">📝 有逐字稿</span>' : ''}
            <span class="rec-last ${r.last.selfRating === 'know' ? 'know' : 'review'}">${r.last.selfRating === 'know' ? '會了' : '再練'}</span>
          </div>
          <div class="q-item-title">${esc(r.q.title)}</div>
          <div class="rec-meta">練習 ${r.count} 次 · 會了 ${r.know} · 再練 ${r.review}</div>
          ${r.hasScore && r.missedSummary ? `<div class="rec-tx">缺少：${esc(r.missedSummary)}</div>` : ''}
          ${r.suggestionSummary ? `<div class="rec-tx">修正建議：${esc(r.suggestionSummary)}</div>` : ''}
          ${r.aiFollowUp ? `<div class="rec-tx">AI 追問：${esc(r.aiFollowUp)}</div>` : ''}
          ${r.hasTx ? `<div class="rec-tx">逐字稿摘要：「${esc(r.txSnippet)}」</div>` : ''}
        </a></li>`).join('')}</ul>`;
  }).catch((e) => {
    console.warn('讀取成績紀錄失敗', e);
    const view = outlet.querySelector('.records');
    if (view) view.innerHTML = '<p class="empty">目前無法讀取紀錄。</p>';
  });
}
