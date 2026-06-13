// features/practice.js — 單題練習（看題 → 自答 → 看解答 → 自評 → 保存）
// 全程只用現有題庫內容；不錄音、不接 AI、不做 AI 評分。自評是使用者自己按的。
import { getCollections } from '../core/settings.js';
import { groupByDimension, dimMeta } from '../core/content.js';
import { addAttempt, genId } from '../core/db.js';
import { esc, appBar, IC } from '../core/dom.js';
import * as tts from '../speech/tts.js';

let session = null; // { queue:[q…], idx, results:[{id,rating}] }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQueue(content, scope, random) {
  let list;
  if (scope === 'all') list = content.questions.slice();
  else if (scope === 'fav') list = getCollections().map((id) => content.byId[id]).filter(Boolean);
  else list = content.questions.filter((q) => (q.dimensions || []).includes(scope));
  return random ? shuffle(list) : list;
}

function chips(content, q) {
  return (q.dimensions || []).map((id) => {
    const d = dimMeta(content, id);
    return `<span class="chip" style="--dc:${esc(d.color)}">${esc(d.label)}</span>`;
  }).join('');
}

function facet(label, mod, bodyHtml) {
  return `<section class="facet facet--${mod}"><div class="facet-head"><span class="facet-label">${esc(label)}</span></div>${bodyHtml}</section>`;
}
function listFacet(label, mod, arr) {
  const items = arr || [];
  return facet(label, mod, items.length ? `<ul class="facet-ul">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="facet-body muted">—</p>');
}

export function renderPractice(outlet, { content } = {}) {
  renderStart(outlet, content);
}

function renderStart(outlet, content) {
  const groups = groupByDimension(content);
  const favCount = getCollections().length;
  let scope = 'all';

  outlet.innerHTML = `${appBar('單題練習')}
    <section class="view practice-start">
      <p class="ps-lead">挑範圍，看到題目先自己回答一次，再看解答自評。練習結果會存起來，可在「成績紀錄」回顧。</p>
      <p class="field-label">練習範圍</p>
      <div class="chip-select" id="scope">
        <button class="select-chip is-active" data-scope="all" type="button">全部題目（${content.questions.length}）</button>
        ${favCount ? `<button class="select-chip" data-scope="fav" type="button">我的收藏（${favCount}）</button>` : ''}
        ${groups.map((g) => `<button class="select-chip" data-scope="${esc(g.dim.id)}" type="button">${esc(g.dim.label)}（${g.items.length}）</button>`).join('')}
      </div>
      <label class="switch-row"><input type="checkbox" id="rand" checked> 隨機出題</label>
      <p class="ps-warn" id="ps-warn" hidden>這個範圍目前沒有題目，換一個試試。</p>
      <button class="btn-primary btn-block" id="start" type="button">開始練習</button>
    </section>`;

  const scopeEl = outlet.querySelector('#scope');
  scopeEl.addEventListener('click', (e) => {
    const b = e.target.closest('.select-chip');
    if (!b) return;
    scopeEl.querySelectorAll('.select-chip').forEach((c) => c.classList.remove('is-active'));
    b.classList.add('is-active');
    scope = b.dataset.scope;
  });

  outlet.querySelector('#start').addEventListener('click', () => {
    const random = outlet.querySelector('#rand').checked;
    const queue = buildQueue(content, scope, random);
    if (!queue.length) { outlet.querySelector('#ps-warn').hidden = false; return; }
    session = { queue, idx: 0, results: [] };
    renderRun(outlet, content);
  });
}

function renderRun(outlet, content) {
  const q = session.queue[session.idx];
  const total = session.queue.length;
  const spine = dimMeta(content, (q.dimensions || [])[0]).color;
  const speak = tts.isSupported() ? `<button class="tool-btn" id="p-speak" type="button">${IC.speaker}<span>朗讀</span></button>` : '';

  outlet.innerHTML = `${appBar('單題練習')}
    <section class="view practice-run">
      <div class="p-progress"><span class="p-count">${session.idx + 1} / ${total}</span><div class="p-bar"><i style="width:${Math.round((session.idx / total) * 100)}%"></i></div></div>
      <article class="qcard" style="--spine:${esc(spine)}">
        <header class="qcard-head">
          <div class="q-item-chips">${chips(content, q)}</div>
          <h1 class="qcard-title">${esc(q.title)}</h1>
          <div class="qcard-tools">${speak}</div>
        </header>
        <section class="facet">
          <div class="facet-head"><span class="facet-label">你的回答</span><span class="facet-tag">先自己講一次</span></div>
          <textarea id="p-ans" class="note-area" placeholder="可以用講的，也可以打字抓重點…（這格不會被儲存，只幫你聚焦）"></textarea>
        </section>
        <div id="p-reveal"></div>
        <div id="p-actions"><button class="btn-primary btn-block" id="p-show" type="button">看解答</button></div>
      </article>
    </section>`;

  const speakBtn = outlet.querySelector('#p-speak');
  if (speakBtn) {
    speakBtn.addEventListener('click', () => {
      if (tts.isSpeaking()) { tts.cancel(); speakBtn.classList.remove('speaking'); return; }
      tts.speak(q.title, { onstart: () => speakBtn.classList.add('speaking'), onend: () => speakBtn.classList.remove('speaking') });
    });
  }
  outlet.querySelector('#p-show').addEventListener('click', () => revealAnswer(outlet, content, q));
}

function revealAnswer(outlet, content, q) {
  outlet.querySelector('#p-reveal').innerHTML = `
    ${facet('30 秒回答', 'quick', `<p class="facet-body">${esc(q.quickAnswer)}</p>`)}
    ${facet('一句記憶', 'hook', `<p class="facet-hook">${esc(q.memoryHook)}</p>`)}
    ${listFacet('加分重點', 'bonus', q.bonusPoints)}
    ${listFacet('容易失分', 'mistake', q.commonMistakes)}
    <a class="p-original-link" href="#/q/${encodeURIComponent(q.id)}">看完整原始資料與追問 ›</a>`;

  const actions = outlet.querySelector('#p-actions');
  actions.innerHTML = `
    <p class="p-rate-label">自我評估這一題</p>
    <div class="p-rate">
      <button class="p-rate-btn know" data-rate="know" type="button">✓ 會了</button>
      <button class="p-rate-btn review" data-rate="review" type="button">↻ 再練</button>
    </div>`;
  actions.addEventListener('click', (e) => {
    const b = e.target.closest('.p-rate-btn');
    if (!b) return;
    saveAndNext(outlet, content, q, b.dataset.rate);
  });
}

function saveAndNext(outlet, content, q, rating) {
  session.results.push({ id: q.id, rating });
  addAttempt({
    attemptId: genId(),
    questionId: q.id,
    mode: 'practice',
    selfRating: rating,
    createdAt: new Date().toISOString(),
  }).catch((e) => console.warn('練習紀錄儲存失敗', e));

  session.idx += 1;
  if (session.idx >= session.queue.length) renderSummary(outlet, content);
  else renderRun(outlet, content);
}

function renderSummary(outlet, content) {
  const total = session.results.length;
  const know = session.results.filter((r) => r.rating === 'know').length;
  const review = session.results.filter((r) => r.rating === 'review').length;
  const reviewIds = [...new Set(session.results.filter((r) => r.rating === 'review').map((r) => r.id))];

  outlet.innerHTML = `${appBar('練習完成')}
    <section class="view practice-summary">
      <div class="ps-card">
        <span class="action-tag ps-tag">本次練習</span>
        <h1 class="ps-big">${total} 題完成</h1>
        <div class="ps-stats">
          <div class="ps-stat"><span class="ps-n know">${know}</span>會了</div>
          <div class="ps-stat"><span class="ps-n review">${review}</span>再練</div>
        </div>
        ${reviewIds.length ? `<button class="btn-primary btn-block" id="redo" type="button">只練「再練」的 ${reviewIds.length} 題</button>` : ''}
        <a class="btn-ghost btn-block" href="#/records">看成績紀錄</a>
        <a class="btn-ghost btn-block" href="#/">回首頁</a>
      </div>
    </section>`;

  const redo = outlet.querySelector('#redo');
  if (redo) {
    redo.addEventListener('click', () => {
      session = { queue: reviewIds.map((id) => content.byId[id]).filter(Boolean), idx: 0, results: [] };
      renderRun(outlet, content);
    });
  }
}
