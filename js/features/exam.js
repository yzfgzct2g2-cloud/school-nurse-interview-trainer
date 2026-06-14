// features/exam.js — 正式口試模式（v1.3.0）
// 流程：開場 → 自我介紹題(固定 SELF-001) → 依序抽 EMG/INF/PARENT/MENT/ADMIN 各 1 題（該類無題則從全部補齊）
//        每題：顯示題目 → 考生口頭回答 → 按「我回答完了」→ 一次展開：30秒回答／完整原始資料／委員真正想看／
//              加分重點／容易失分／追問(followups[0]，無則提示) → 標記 會了/再練 → 下一題
//        最後補充 → 結束頁。每題以 addAttempt(mode:'exam') 存入既有 IndexedDB attempts。
// 不含：AI、Whisper、語音辨識、雷達圖等。
import { getProfile } from '../core/settings.js';
import { dimMeta } from '../core/content.js';
import { addAttempt, genId } from '../core/db.js';
import { esc, appBar } from '../core/dom.js';

let exam = null; // { questions:[], idx, ratings:{id:rating}, supplement }

function salutation() {
  return (getProfile() || {}).salutation || '王小姐';
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 自我介紹題固定 SELF-001；其後依序 EMG→INF→PARENT(PAR)→MENT→ADMIN(ADM) 各 1 題。
// 某分類沒有題目時，從全部題庫補齊、不重複。
function pickExamQuestions(content) {
  const cat = (q) => (q.id.split('-')[0] || '').toUpperCase();
  const inCat = (c) => content.questions.filter((q) => cat(q) === c);
  const used = new Set();
  const takeOne = (pool) => {
    const av = shuffle(pool.filter((q) => !used.has(q.id)));
    if (av[0]) { used.add(av[0].id); return [av[0]]; }
    return [];
  };

  let chosen = [];
  const self001 = (content.byId && content.byId['SELF-001']) || null;
  if (self001) { chosen.push(self001); used.add(self001.id); }
  else chosen = chosen.concat(takeOne(inCat('SELF')));

  for (const c of ['EMG', 'INF', 'PAR', 'MENT', 'ADM']) {
    let one = takeOne(inCat(c));
    if (!one.length) one = takeOne(content.questions); // 該類無題則從全部補齊
    chosen = chosen.concat(one);
  }
  return chosen;
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
  exam = { questions: pickExamQuestions(content), idx: 0, ratings: {}, supplement: '' };
  renderIntro(outlet, content);
}

// 第一階段：開場
function renderIntro(outlet, content) {
  const salu = salutation();
  outlet.innerHTML = `${appBar('正式口試')}
    <section class="view exam-intro">
      <p class="eyebrow">正式口試・開場</p>
      <h1 class="exam-greet">${esc(salu)}您好。<br>歡迎參加本次校護甄試。<br>請先進行一分鐘自我介紹。</h1>
      <button class="btn-primary btn-block" id="ex-start" type="button">開始口試</button>
    </section>`;

  outlet.querySelector('#ex-start').addEventListener('click', () => {
    exam.idx = 0;
    renderQuestion(outlet, content);
  });
}

// 第二、三階段：題目（含自我介紹題 SELF-001 與抽題）
function renderQuestion(outlet, content) {
  const q = exam.questions[exam.idx];
  const total = exam.questions.length;
  const last = exam.idx === total - 1;
  const spine = dimMeta(content, (q.dimensions || [])[0]).color;
  const chosen = exam.ratings[q.id] || '';
  const stageTag = exam.idx === 0 ? '自我介紹題' : `第 ${exam.idx} 題`;

  outlet.innerHTML = `${appBar('正式口試')}
    <section class="view exam-run">
      <div class="p-progress"><span class="p-count">${stageTag}（${exam.idx + 1} / ${total}）</span><div class="p-bar"><i style="width:${Math.round((exam.idx / total) * 100)}%"></i></div></div>
      <article class="qcard" style="--spine:${esc(spine)}">
        <header class="qcard-head">
          <div class="q-item-chips">${chips(content, q)}</div>
          <h1 class="qcard-title">${esc(q.title)}</h1>
        </header>

        <p class="exam-cue" id="ex-cue">請先自行口頭回答這一題，回答完再展開參考解答。</p>
        <button class="btn-primary btn-block" id="ex-done" type="button">我回答完了</button>

        <div id="ex-answer" hidden></div>

        <div id="ex-after" hidden>
          <p class="p-rate-label">標記這一題</p>
          <div class="exam-rate" id="ex-rate">
            <button class="exam-rate-btn know${chosen === 'know' ? ' is-chosen' : ''}" data-rate="know" type="button">✓ 會了</button>
            <button class="exam-rate-btn review${chosen === 'review' ? ' is-chosen' : ''}" data-rate="review" type="button">↻ 再練</button>
          </div>
          <button class="btn-primary btn-block" id="ex-next" type="button">${last ? '進入最後補充' : '下一題'}</button>
        </div>
      </article>
    </section>`;

  const fus = (q.followups || []).filter((f) => f && f.question);
  const followupSections = fus.length
    ? fus.slice(0, 3).map((f, i) =>
        facet(['第一追問', '第二追問', '第三追問'][i] || '追問', '', 'followup', `<p class="facet-body">${esc(f.question)}</p>`)
      ).join('')
    : facet('追問', '', 'followup', '<p class="facet-body muted">本題暫無延伸追問。</p>');

  // 「我回答完了」→ 一次依序展開全部解答（委員真正想看 → 30秒 → 完整 → 加分 → 失分 → 三個追問）
  outlet.querySelector('#ex-done').addEventListener('click', () => {
    const box = outlet.querySelector('#ex-answer');
    box.innerHTML =
      facet('委員真正想看', '', 'want', `<p class="facet-body">${esc(q.examinerWants)}</p>`) +
      facet('30 秒回答', '30 秒', 'quick', `<p class="facet-body">${esc(q.quickAnswer)}</p>`) +
      `<section class="original">
        <span class="original-seal">正本・永久保存</span>
        <h2 class="original-title">完整回答</h2>
        <p class="original-body">${esc(q.original)}</p>
      </section>` +
      facetList('加分重點', 'bonus', q.bonusPoints) +
      facetList('容易失分', 'mistake', q.commonMistakes) +
      followupSections;
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

// 第四階段：最後補充
function renderClosing(outlet, content) {
  const salu = salutation();
  outlet.innerHTML = `${appBar('正式口試・最後補充')}
    <section class="view exam-closing">
      <p class="eyebrow">正式口試・最後補充</p>
      <h1 class="exam-greet">${esc(salu)}，今天的口試問題到這裡。<br>請問還有沒有需要補充的內容？</h1>
      <textarea id="ex-supp" class="note-area" placeholder="可在這裡補充想說的話，或直接完成口試"></textarea>
      <button class="btn-primary btn-block" id="ex-finish" type="button">完成口試</button>
    </section>`;

  outlet.querySelector('#ex-finish').addEventListener('click', () => {
    exam.supplement = outlet.querySelector('#ex-supp').value;
    renderSummary(outlet, content);
  });
}

// 第五階段：結束頁
function renderSummary(outlet, content) {
  const total = exam.questions.length;
  const knowQs = exam.questions.filter((q) => exam.ratings[q.id] === 'know');
  const reviewQs = exam.questions.filter((q) => exam.ratings[q.id] !== 'know');

  const listItem = (q, i) => {
    const r = exam.ratings[q.id] === 'know' ? 'know' : 'review';
    const label = r === 'know' ? '會了' : '再練';
    return `<li class="exam-li">
      <span class="exam-li-n">${i + 1}</span>
      <span class="exam-li-title">${esc(q.title)}</span>
      <span class="rec-last ${r}">${label}</span>
    </li>`;
  };

  const simpleList = (arr) => arr.length
    ? `<ul class="exam-list">${arr.map((q) => `<li class="exam-li"><span class="exam-li-title">${esc(q.title)}</span></li>`).join('')}</ul>`
    : '<p class="empty">（無）</p>';

  const supp = (exam.supplement || '').trim();

  outlet.innerHTML = `${appBar('口試完成')}
    <section class="view exam-summary">
      <div class="ps-card">
        <span class="action-tag ps-tag">本次正式口試完成</span>
        <h1 class="ps-big">${total} 題完成</h1>
        <div class="ps-stats">
          <div class="ps-stat"><span class="ps-n know">${knowQs.length}</span>會了</div>
          <div class="ps-stat"><span class="ps-n review">${reviewQs.length}</span>再練</div>
        </div>
        <p class="exam-saved">已存入成績紀錄 ${total} 筆</p>
      </div>

      <h2 class="section-title">本次題目清單</h2>
      <ul class="exam-list">${exam.questions.map(listItem).join('')}</ul>

      <h2 class="section-title">會了題目</h2>
      ${simpleList(knowQs)}

      <h2 class="section-title">再練題目</h2>
      ${simpleList(reviewQs)}

      <h2 class="section-title">最後補充內容</h2>
      ${supp ? `<p class="exam-supp">${esc(supp)}</p>` : '<p class="empty">（無）</p>'}

      <a class="btn-ghost btn-block" href="#/">返回首頁</a>
      <a class="btn-primary btn-block" href="#/records">查看成績紀錄</a>
    </section>`;
}
