// features/exam.js — 正式口試模式（凍結規格 V1.0）
// 流程：開場（讀稱呼＋一分鐘自我介紹）→ 抽 6 題（固定順序 SELF→EMG→EMG→MENT→INF→ADM，不足從全部補齊）
//        每題：顯示題目 → 考生口頭回答 → 按「我回答完了」→ 一次展開：30秒回答／完整回答／委員真正想看／
//              加分重點／容易失分／追問(followups[0]) → 標記 會了/再練 → 下一題
//        結尾：請問還有沒有需要補充 → 完成 → 總結
// 每題以 addAttempt(mode:'exam') 存入 IndexedDB。
// 不含：AI、Whisper、語音辨識、雷達圖。
import { getProfile } from '../core/settings.js';
import { dimMeta } from '../core/content.js';
import { addAttempt, genId } from '../core/db.js';
import { esc, appBar } from '../core/dom.js';

let exam = null; // { questions:[6], idx, ratings:{id:rating}, intro, supplement }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 固定組成：SELF×1, EMG×2, MENT×1, INF×1, ADM×1（共 6 題，依此順序）；不足從全部題庫補齊、不重複。
// 以題號前綴（題目類別／來源檔）為準，確保每一格剛好取自該類別。
function pickExamQuestions(content) {
  const cat = (q) => (q.id.split('-')[0] || '').toUpperCase();
  const inCat = (c) => content.questions.filter((q) => cat(q) === c);
  const used = new Set();
  const take = (pool, n) => {
    const out = shuffle(pool.filter((q) => !used.has(q.id))).slice(0, n);
    out.forEach((q) => used.add(q.id));
    return out;
  };
  const plan = [['SELF', 1], ['EMG', 2], ['MENT', 1], ['INF', 1], ['ADM', 1]];
  let chosen = [];
  for (const [c, n] of plan) chosen = chosen.concat(take(inCat(c), n));
  if (chosen.length < 6) chosen = chosen.concat(take(content.questions, 6 - chosen.length));
  return chosen.slice(0, 6);
}

function chips(content, q) {
  return (q.dimensions || []).map((id) => {
    const d = dimMeta(content, id);
    return `<span class="chip" style="--dc:${esc(d.color)}">${esc(d.label)}</span>`;
  }).join('');
}

// 與知識庫一致的面向卡片
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

export function renderExam(outlet, { content } = {}) {
  exam = { questions: pickExamQuestions(content), idx: 0, ratings: {}, intro: '', supplement: '' };
  renderIntro(outlet, content);
}

function renderIntro(outlet, content) {
  const salu = (getProfile() || {}).salutation || '老師';
  outlet.innerHTML = `${appBar('正式口試')}
    <section class="view exam-intro">
      <p class="eyebrow">正式口試・開場</p>
      <h1 class="exam-greet">${esc(salu)}您好，歡迎參加本次校護甄試，請先進行一分鐘自我介紹。</h1>
      <textarea id="ex-intro" class="note-area" placeholder="可在這裡打草稿練習自我介紹，也可以直接略過（留白即可）"></textarea>
      <button class="btn-primary btn-block" id="ex-start" type="button">開始口試（共 ${exam.questions.length} 題）</button>
    </section>`;

  outlet.querySelector('#ex-start').addEventListener('click', () => {
    exam.intro = outlet.querySelector('#ex-intro').value;
    exam.idx = 0;
    renderQuestion(outlet, content);
  });
}

function renderQuestion(outlet, content) {
  const q = exam.questions[exam.idx];
  const total = exam.questions.length;
  const last = exam.idx === total - 1;
  const spine = dimMeta(content, (q.dimensions || [])[0]).color;
  const chosen = exam.ratings[q.id] || '';

  outlet.innerHTML = `${appBar('正式口試')}
    <section class="view exam-run">
      <div class="p-progress"><span class="p-count">第 ${exam.idx + 1} 題 / ${total}</span><div class="p-bar"><i style="width:${Math.round((exam.idx / total) * 100)}%"></i></div></div>
      <article class="qcard" style="--spine:${esc(spine)}">
        <header class="qcard-head">
          <div class="q-item-chips">${chips(content, q)}</div>
          <h1 class="qcard-title">${esc(q.title)}</h1>
        </header>

        <p class="exam-cue" id="ex-cue">請先自行口頭回答這一題，回答完再展開參考解答。</p>
        <button class="btn-primary btn-block" id="ex-done" type="button">我回答完了，展開解答</button>

        <div id="ex-answer" hidden></div>

        <div id="ex-after" hidden>
          <p class="p-rate-label">自我評估這一題</p>
          <div class="exam-rate" id="ex-rate">
            <button class="exam-rate-btn know${chosen === 'know' ? ' is-chosen' : ''}" data-rate="know" type="button">✓ 會了</button>
            <button class="exam-rate-btn review${chosen === 'review' ? ' is-chosen' : ''}" data-rate="review" type="button">↻ 再練</button>
          </div>
          <button class="btn-primary btn-block" id="ex-next" type="button">${last ? '進入結尾' : '下一題'}</button>
        </div>
      </article>
    </section>`;

  const followupHtml = (q.followups && q.followups[0])
    ? `<p class="facet-body">${esc(q.followups[0].question)}</p>`
    : '<p class="facet-body muted">這題沒有預設追問。</p>';

  // 「我回答完了」→ 一次展開全部解答
  outlet.querySelector('#ex-done').addEventListener('click', () => {
    const box = outlet.querySelector('#ex-answer');
    box.innerHTML =
      facet('30 秒回答', '30 秒', 'quick', `<p class="facet-body">${esc(q.quickAnswer)}</p>`) +
      `<section class="original">
        <span class="original-seal">正本・永久保存</span>
        <h2 class="original-title">完整回答</h2>
        <p class="original-body">${esc(q.original)}</p>
      </section>` +
      facet('委員真正想看', '', 'want', `<p class="facet-body">${esc(q.examinerWants)}</p>`) +
      facetList('加分重點', 'bonus', q.bonusPoints) +
      facetList('容易失分', 'mistake', q.commonMistakes) +
      facet('委員追問', '', 'followup', followupHtml);
    box.hidden = false;
    outlet.querySelector('#ex-after').hidden = false;
    outlet.querySelector('#ex-done').hidden = true;
    outlet.querySelector('#ex-cue').hidden = true;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // 會了 / 再練（單選）
  const rateEl = outlet.querySelector('#ex-rate');
  rateEl.addEventListener('click', (e) => {
    const b = e.target.closest('.exam-rate-btn');
    if (!b) return;
    exam.ratings[q.id] = b.dataset.rate;
    rateEl.querySelectorAll('.exam-rate-btn').forEach((x) => x.classList.remove('is-chosen'));
    b.classList.add('is-chosen');
  });

  // 下一題：存一筆 attempt（mode:'exam'）後前進
  outlet.querySelector('#ex-next').addEventListener('click', () => {
    const rating = exam.ratings[q.id] || 'review'; // 未評者預設「再練」
    exam.ratings[q.id] = rating;
    addAttempt({
      attemptId: genId(),
      questionId: q.id,
      mode: 'exam',
      selfRating: rating,
      createdAt: new Date().toISOString(),
    }).catch((err) => console.warn('口試紀錄儲存失敗', err));

    exam.idx += 1;
    if (exam.idx >= exam.questions.length) renderClosing(outlet, content);
    else renderQuestion(outlet, content);
  });
}

function renderClosing(outlet, content) {
  outlet.innerHTML = `${appBar('正式口試・結尾')}
    <section class="view exam-closing">
      <p class="eyebrow">正式口試・結尾</p>
      <h1 class="exam-greet">今天的口試到這裡，請問還有沒有需要補充的內容？</h1>
      <textarea id="ex-supp" class="note-area" placeholder="可在這裡補充想說的話，或直接完成"></textarea>
      <button class="btn-primary btn-block" id="ex-finish" type="button">完成並看總結</button>
    </section>`;

  outlet.querySelector('#ex-finish').addEventListener('click', () => {
    exam.supplement = outlet.querySelector('#ex-supp').value;
    renderSummary(outlet, content);
  });
}

function renderSummary(outlet, content) {
  const total = exam.questions.length;
  const know = exam.questions.filter((q) => exam.ratings[q.id] === 'know').length;
  const review = total - know;

  const list = exam.questions.map((q, i) => {
    const r = exam.ratings[q.id] === 'know' ? 'know' : 'review';
    const label = r === 'know' ? '會了' : '再練';
    return `<li class="exam-li">
      <span class="exam-li-n">${i + 1}</span>
      <span class="exam-li-title">${esc(q.title)}</span>
      <span class="rec-last ${r}">${label}</span>
    </li>`;
  }).join('');

  const supp = (exam.supplement || '').trim();

  outlet.innerHTML = `${appBar('口試完成')}
    <section class="view exam-summary">
      <div class="ps-card">
        <span class="action-tag ps-tag">本次正式口試</span>
        <h1 class="ps-big">${total} 題完成</h1>
        <div class="ps-stats">
          <div class="ps-stat"><span class="ps-n know">${know}</span>會了</div>
          <div class="ps-stat"><span class="ps-n review">${review}</span>再練</div>
        </div>
        <p class="exam-saved">已存入成績紀錄 ${total} 筆</p>
      </div>

      <h2 class="section-title">本次題目</h2>
      <ul class="exam-list">${list}</ul>

      ${supp ? `<h2 class="section-title">你的補充</h2><p class="exam-supp">${esc(supp)}</p>` : ''}

      <a class="btn-primary btn-block" href="#/records">查看成績</a>
      <a class="btn-ghost btn-block" href="#/">返回首頁</a>
    </section>`;
}
