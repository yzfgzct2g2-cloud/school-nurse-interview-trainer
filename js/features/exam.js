// features/exam.js — 正式口試模式（v1.5.0：Speech To Text v1）
// 流程：開場 → 自我介紹題(固定 SELF-001) → 依序 EMG/INF/PARENT/MENT/ADMIN 各 1 題（該類無題則從全部補齊）
//        每題：朗讀題目(TTS) → 開始錄音(同時嘗試即時語音辨識) → 口頭回答 → 我回答完了(停止錄音/辨識、保存錄音) →
//              逐字稿步驟(自動帶入或手動輸入、可編輯) → 確認/略過 → 展開 委員真正想看／30秒／完整／加分／失分／三追問
//              (並朗讀第一追問) → 標記 會了/再練 → 下一題
//        最後補充 → 結束頁。
// 語音：SpeechSynthesis(朗讀)、MediaRecorder(錄音)、Web Speech(即時辨識)；皆有不支援/失敗時的優雅退場，不阻擋口試。
// 不含：AI 評分、真正 Whisper/OpenAI 呼叫、AI 委員、即時追問、雷達圖等。
import { getProfile } from '../core/settings.js';
import { dimMeta } from '../core/content.js';
import { addAttempt, genId, saveRecordingFull } from '../core/db.js';
import { esc, appBar } from '../core/dom.js';
import { speak, cancel as cancelTTS, isSupported as ttsSupported } from '../speech/tts.js';
import { recorderSupported, startRecording } from '../speech/recorder.js';
import { isSupported as sttSupported, startLiveTranscription } from '../speech/stt.js';
import { scoreAnswer } from '../ai/localScorer.js';

let exam = null;

function salutation() {
  return (getProfile() || {}).salutation || '王小姐';
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

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
    if (!one.length) one = takeOne(content.questions);
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

async function stopAndSaveRecording(q, statusEl) {
  if (!exam.recorder) return;
  const rec = exam.recorder; exam.recorder = null;
  try {
    const { blob, mimeType, durationSec } = await rec.stop();
    if (blob && blob.size) {
      const recordingId = genId();
      await saveRecordingFull({
        key: recordingId, recordingId, attemptId: exam.curAttemptId, questionId: q.id,
        mode: 'exam', createdAt: new Date().toISOString(), audioBlob: blob, blob, mimeType, durationSec,
      });
      exam.curHasRecording = true;
      if (statusEl) statusEl.textContent = `已保存錄音（約 ${durationSec} 秒）`;
    } else if (statusEl) { statusEl.textContent = '錄音內容為空，未保存。'; }
  } catch (e) {
    console.warn('錄音保存失敗', e);
    if (statusEl) statusEl.textContent = '錄音保存失敗，仍可繼續口試。';
  }
}

// 停止即時辨識，回傳逐字稿字串（失敗或不支援回空字串）。
async function stopLiveSTT() {
  if (!exam.sttController) return '';
  const ctl = exam.sttController; exam.sttController = null;
  try {
    const r = await ctl.stop();
    return (r && r.transcript) || '';
  } catch (_) { return ''; }
}

export function renderExam(outlet, { content } = {}) {
  exam = {
    questions: pickExamQuestions(content), idx: 0, ratings: {}, supplement: '',
    curAttemptId: null, curHasRecording: false, curTranscript: '', curScore: null,
    recorder: null, sttController: null, sttAttempted: false, liveTranscript: '',
  };
  renderIntro(outlet, content);
}

function renderIntro(outlet, content) {
  const salu = salutation();
  const openText = `${salu}您好。歡迎參加本次校護甄試。請先進行一分鐘自我介紹。`;
  outlet.innerHTML = `${appBar('正式口試')}
    <section class="view exam-intro">
      <p class="eyebrow">正式口試・開場</p>
      <h1 class="exam-greet">${esc(salu)}您好。<br>歡迎參加本次校護甄試。<br>請先進行一分鐘自我介紹。</h1>
      ${ttsSupported() ? `<button class="btn-ghost btn-block" id="ex-tts" type="button">🔊 重新朗讀開場</button>` : ''}
      <button class="btn-primary btn-block" id="ex-start" type="button">開始口試</button>
    </section>`;
  if (ttsSupported()) {
    speak(openText);
    const t = outlet.querySelector('#ex-tts');
    if (t) t.addEventListener('click', () => speak(openText));
  }
  outlet.querySelector('#ex-start').addEventListener('click', () => { cancelTTS(); exam.idx = 0; renderQuestion(outlet, content); });
}

function renderQuestion(outlet, content) {
  const q = exam.questions[exam.idx];
  const total = exam.questions.length;
  const last = exam.idx === total - 1;
  const spine = dimMeta(content, (q.dimensions || [])[0]).color;
  const chosen = exam.ratings[q.id] || '';
  const stageTag = exam.idx === 0 ? '自我介紹題' : `第 ${exam.idx} 題`;

  exam.curAttemptId = genId();
  exam.curHasRecording = false;
  exam.curTranscript = '';
  exam.curScore = null;
  exam.recorder = null;
  exam.sttController = null;
  exam.sttAttempted = false;
  exam.liveTranscript = '';

  const canRec = recorderSupported();
  const canTTS = ttsSupported();

  outlet.innerHTML = `${appBar('正式口試')}
    <section class="view exam-run">
      <div class="p-progress"><span class="p-count">${stageTag}（${exam.idx + 1} / ${total}）</span><div class="p-bar"><i style="width:${Math.round((exam.idx / total) * 100)}%"></i></div></div>
      <article class="qcard" style="--spine:${esc(spine)}">
        <header class="qcard-head">
          <div class="q-item-chips">${chips(content, q)}</div>
          <h1 class="qcard-title">${esc(q.title)}</h1>
        </header>

        <div id="ex-answer-phase">
          <p class="exam-cue" id="ex-cue">委員正在朗讀題目，請聽完後口頭回答；可先按「開始錄音」。</p>
          <div class="exam-voice">
            ${canTTS ? `<button class="btn-ghost exam-vbtn" id="ex-tts" type="button">🔊 重新朗讀題目</button>` : ''}
            ${canRec
              ? `<button class="btn-ghost exam-vbtn" id="ex-rec-start" type="button">● 開始錄音</button>
                 <button class="btn-ghost exam-vbtn" id="ex-rec-stop" type="button" hidden>■ 停止錄音</button>
                 <span class="exam-rec-status" id="ex-rec-status"></span>`
              : `<p class="exam-rec-unsupported">此裝置暫不支援錄音，仍可進行口試練習。</p>`}
          </div>
          <button class="btn-primary btn-block" id="ex-done" type="button">我回答完了</button>
        </div>

        <div id="ex-transcript" hidden>
          <p class="p-rate-label">逐字稿（可修改後確認）</p>
          <p class="exam-tx-status" id="ex-tx-status"></p>
          <textarea id="ex-tx-area" class="note-area exam-tx-area" placeholder="逐字稿：可自動產生或手動輸入你的回答重點…"></textarea>
          <div class="exam-tx-actions">
            <button class="btn-primary btn-block" id="ex-tx-confirm" type="button">確認逐字稿，查看參考答案</button>
            <button class="btn-ghost" id="ex-tx-skip" type="button">略過逐字稿</button>
            <button class="btn-ghost" id="ex-tx-redo" type="button">重新錄音</button>
          </div>
        </div>

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

  const statusEl = outlet.querySelector('#ex-rec-status');

  if (canTTS) {
    speak(q.title);
    const t = outlet.querySelector('#ex-tts');
    if (t) t.addEventListener('click', () => speak(q.title));
  }

  if (canRec) {
    const startBtn = outlet.querySelector('#ex-rec-start');
    const stopBtn = outlet.querySelector('#ex-rec-stop');
    startBtn.addEventListener('click', async () => {
      statusEl.textContent = '準備中…';
      try {
        exam.recorder = await startRecording();
        // 同步嘗試即時語音辨識（支援時）；失敗不影響錄音
        if (sttSupported()) {
          try { exam.sttController = startLiveTranscription({ lang: 'zh-TW' }); exam.sttAttempted = !!exam.sttController; } catch (_) { exam.sttController = null; }
        }
        startBtn.hidden = true; stopBtn.hidden = false;
        statusEl.textContent = sttSupported() ? '🔴 錄音中…（同時辨識）' : '🔴 錄音中…';
      } catch (e) {
        console.warn('無法開始錄音', e);
        exam.recorder = null;
        startBtn.hidden = false; stopBtn.hidden = true;
        statusEl.textContent = '無法取得麥克風權限，仍可繼續口試。';
      }
    });
    stopBtn.addEventListener('click', async () => {
      stopBtn.hidden = true; startBtn.hidden = false;
      await stopAndSaveRecording(q, statusEl);
      exam.liveTranscript = await stopLiveSTT();
    });
  }

  // 我回答完了 → 停止錄音/辨識 → 進入逐字稿步驟
  outlet.querySelector('#ex-done').addEventListener('click', async () => {
    cancelTTS();
    if (exam.recorder) { if (statusEl) statusEl.textContent = '儲存錄音中…'; await stopAndSaveRecording(q, statusEl); }
    if (exam.sttController) { exam.liveTranscript = await stopLiveSTT(); }
    showTranscriptStep(outlet, content, q);
  });

  // 會了 / 再練
  const rateEl = outlet.querySelector('#ex-rate');
  rateEl.addEventListener('click', (e) => {
    const b = e.target.closest('.exam-rate-btn');
    if (!b) return;
    exam.ratings[q.id] = b.dataset.rate;
    rateEl.querySelectorAll('.exam-rate-btn').forEach((x) => x.classList.remove('is-chosen'));
    b.classList.add('is-chosen');
  });

  // 下一題：存一筆 attempt（含 transcript、hasRecording）
  outlet.querySelector('#ex-next').addEventListener('click', () => {
    cancelTTS();
    if (exam.recorder) { try { exam.recorder.cancel(); } catch (_) {} exam.recorder = null; }
    if (exam.sttController) { try { exam.sttController.abort(); } catch (_) {} exam.sttController = null; }
    const rating = exam.ratings[q.id] || 'review';
    exam.ratings[q.id] = rating;
    addAttempt({
      attemptId: exam.curAttemptId, questionId: q.id, mode: 'exam', selfRating: rating,
      createdAt: new Date().toISOString(), hasRecording: !!exam.curHasRecording, transcript: exam.curTranscript || '',
      score: exam.curScore || null,
    }).catch((err) => console.warn('口試紀錄儲存失敗', err));
    exam.idx += 1;
    if (exam.idx >= exam.questions.length) renderClosing(outlet, content);
    else renderQuestion(outlet, content);
  });
}

// 逐字稿步驟：自動帶入即時辨識結果或手動輸入，可編輯，再確認/略過/重新錄音
function showTranscriptStep(outlet, content, q) {
  const phase = outlet.querySelector('#ex-answer-phase');
  const box = outlet.querySelector('#ex-transcript');
  const area = outlet.querySelector('#ex-tx-area');
  const status = outlet.querySelector('#ex-tx-status');
  if (phase) phase.hidden = true;

  area.value = exam.liveTranscript || '';
  if (!sttSupported()) {
    status.textContent = '此裝置暫不支援自動語音辨識，請手動輸入回答逐字稿。';
  } else if (exam.sttAttempted && exam.liveTranscript) {
    status.textContent = '已自動產生逐字稿，可修改後確認。';
  } else if (exam.sttAttempted && !exam.liveTranscript) {
    status.textContent = '語音辨識失敗，請手動輸入或略過逐字稿。';
  } else {
    status.textContent = '可手動輸入回答逐字稿，或直接略過。';
  }

  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const proceed = () => {
    exam.curTranscript = (area.value || '').trim();
    exam.curScore = exam.curTranscript ? scoreAnswer(q, exam.curTranscript) : null;
    revealAnswer(outlet, content, q);
  };
  outlet.querySelector('#ex-tx-confirm').addEventListener('click', proceed);
  outlet.querySelector('#ex-tx-skip').addEventListener('click', () => { exam.curTranscript = ''; exam.curScore = null; revealAnswer(outlet, content, q); });
  outlet.querySelector('#ex-tx-redo').addEventListener('click', () => { renderQuestion(outlet, content); });
}

function scoreLevelClass(level) {
  return { '優秀': 'lv-great', '良好': 'lv-good', '尚可': 'lv-ok', '需加強': 'lv-low', '需重新練習': 'lv-bad' }[level] || 'lv-ok';
}

function renderScore(s) {
  if (!s) return '';
  const chipList = (arr, empty) => (arr && arr.length)
    ? `<div class="score-chips">${arr.map((x) => `<span class="score-chip">${esc(x)}</span>`).join('')}</div>`
    : `<p class="facet-body muted">${esc(empty)}</p>`;
  const hits = [...(s.hitKeywords || []), ...((s.hitBonusPoints || []).map((b) => (b.length > 16 ? b.slice(0, 16) + '…' : b)))];
  const misses = [...(s.missedKeywords || []), ...((s.missedBonusPoints || []).map((b) => (b.length > 16 ? b.slice(0, 16) + '…' : b)))];
  return `<section class="score-card">
      <div class="score-head">
        <span class="score-total">${s.totalScore}<small> / 100</small></span>
        <span class="score-level ${scoreLevelClass(s.level)}">${esc(s.level)}</span>
      </div>
      <div class="score-block"><span class="score-label">命中重點</span>${chipList(hits, '尚未命中重點')}</div>
      <div class="score-block"><span class="score-label">缺少重點</span>${chipList(misses, '沒有明顯缺漏')}</div>
      <div class="score-block"><span class="score-label">可能失分</span>${chipList(s.possibleMistakes, '無明顯失分')}</div>
      <div class="score-block"><span class="score-label">修正建議</span><p class="facet-body score-suggest">${esc(s.suggestion).replace(/\n/g, '<br>')}</p></div>
      ${s.revisedAnswerHint ? `<div class="score-block"><span class="score-label">可以這樣說（30 秒示範）</span><p class="facet-body">${esc(s.revisedAnswerHint)}</p></div>` : ''}
    </section>`;
}

function revealAnswer(outlet, content, q) {
  const txBox = outlet.querySelector('#ex-transcript');
  if (txBox) txBox.hidden = true;

  const fus = (q.followups || []).filter((f) => f && f.question);
  const followupSections = fus.length
    ? fus.slice(0, 3).map((f, i) =>
        facet(['第一追問', '第二追問', '第三追問'][i] || '追問', '', 'followup', `<p class="facet-body">${esc(f.question)}</p>`)
      ).join('')
    : facet('追問', '', 'followup', '<p class="facet-body muted">本題暫無延伸追問。</p>');

  const box = outlet.querySelector('#ex-answer');
  box.innerHTML =
    renderScore(exam.curScore) +
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
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (ttsSupported() && fus[0]) speak(fus[0].question);
}

function renderClosing(outlet, content) {
  cancelTTS();
  if (exam.recorder) { try { exam.recorder.cancel(); } catch (_) {} exam.recorder = null; }
  if (exam.sttController) { try { exam.sttController.abort(); } catch (_) {} exam.sttController = null; }
  const salu = salutation();
  outlet.innerHTML = `${appBar('正式口試・最後補充')}
    <section class="view exam-closing">
      <p class="eyebrow">正式口試・最後補充</p>
      <h1 class="exam-greet">${esc(salu)}，今天的口試問題到這裡。<br>請問還有沒有需要補充的內容？</h1>
      <textarea id="ex-supp" class="note-area" placeholder="可在這裡補充想說的話，或直接完成口試"></textarea>
      <button class="btn-primary btn-block" id="ex-finish" type="button">完成口試</button>
    </section>`;
  outlet.querySelector('#ex-finish').addEventListener('click', () => { exam.supplement = outlet.querySelector('#ex-supp').value; renderSummary(outlet, content); });
}

function renderSummary(outlet, content) {
  const total = exam.questions.length;
  const knowQs = exam.questions.filter((q) => exam.ratings[q.id] === 'know');
  const reviewQs = exam.questions.filter((q) => exam.ratings[q.id] !== 'know');
  const listItem = (q, i) => {
    const r = exam.ratings[q.id] === 'know' ? 'know' : 'review';
    const label = r === 'know' ? '會了' : '再練';
    return `<li class="exam-li"><span class="exam-li-n">${i + 1}</span><span class="exam-li-title">${esc(q.title)}</span><span class="rec-last ${r}">${label}</span></li>`;
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
