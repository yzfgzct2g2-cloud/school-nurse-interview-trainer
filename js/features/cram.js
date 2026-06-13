// features/cram.js — 考前 5 分鐘（一句記憶快閃卡）
// 用現有 memoryHook 做翻卡複習；點卡片在「題目 ↔ 一句記憶」之間切換。
import { dimMeta } from '../core/content.js';
import { esc, appBar } from '../core/dom.js';

let deck = null;
let pos = 0;
let flipped = false;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function renderCram(outlet, { content } = {}) {
  deck = shuffle(content.questions.slice());
  pos = 0;
  flipped = false;
  renderCard(outlet, content);
}

function renderCard(outlet, content) {
  const q = deck[pos];
  const d = dimMeta(content, (q.dimensions || [])[0]);

  outlet.innerHTML = `${appBar('考前 5 分鐘')}
    <section class="view cram">
      <div class="p-progress"><span class="p-count">${pos + 1} / ${deck.length}</span><div class="p-bar"><i style="width:${Math.round(((pos + 1) / deck.length) * 100)}%"></i></div></div>
      <button class="cram-card${flipped ? ' is-flipped' : ''}" id="card" type="button" style="--dc:${esc(d.color)}">
        <span class="chip" style="--dc:${esc(d.color)}">${esc(d.label)}</span>
        <span class="cram-q">${esc(q.title)}</span>
        <span class="cram-hook">${esc(q.memoryHook || '')}</span>
        <span class="cram-hint">${flipped ? '點一下看題目' : '點一下看「一句記憶」'}</span>
      </button>
      <div class="cram-nav">
        <button class="btn-ghost" id="prev" type="button">‹ 上一張</button>
        <button class="btn-ghost" id="next" type="button">下一張 ›</button>
      </div>
    </section>`;

  outlet.querySelector('#card').addEventListener('click', () => { flipped = !flipped; renderCard(outlet, content); });
  outlet.querySelector('#prev').addEventListener('click', () => { pos = (pos - 1 + deck.length) % deck.length; flipped = false; renderCard(outlet, content); });
  outlet.querySelector('#next').addEventListener('click', () => { pos = (pos + 1) % deck.length; flipped = false; renderCard(outlet, content); });
}
