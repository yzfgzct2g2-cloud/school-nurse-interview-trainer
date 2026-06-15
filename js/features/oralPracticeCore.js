// features/oralPracticeCore.js — 單題 AI 口語練習（v1.8.0）
// 任一題目 → AI朗讀 → 錄音(碼表+提醒) → 逐字稿編輯 → AI委員評分 → 追問(最多三輪) → 委員總結 → 保存。
// 共用既有模組：SpeechSynthesis/MediaRecorder/STT/回答碼表/提醒時間/逐字稿/Cloudflare Worker/OpenAI/本地fallback/IndexedDB。
// mode = 'single-oral'。不重新開發既有功能、不改 JSON Schema、不改題庫。
import { getProfile, getReminderSec } from '../core/settings.js';
import { dimMeta } from '../core/content.js';
import { addAttempt, genId, saveRecordingFull } from '../core/db.js';
import { esc, appBar } from '../core/dom.js';
import { speak, cancel as cancelTTS, isSupported as ttsSupported } from '../speech/tts.js';
import { recorderSupported, startRecording } from '../speech/recorder.js';
import { isSupported as sttSupported, startLiveTranscription } from '../speech/stt.js';
import { scoreAnswer } from '../ai/localScorer.js';
import { scoreWithOpenAI, hasWorkerUrl } from '../ai/openaiExaminer.js';

const ROUND_TYPES = ['main', 'followup1', 'followup2', 'followup3'];
const ROUND_LABELS = ['主題回答', '第一追問', '第二追問', '第三追問'];

let sess = null;

function salutation() { return (getProfile() || {}).salutation || '王小姐'; }
function fmtTime(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function levelOf(n) { return n >= 90 ? '優秀' : n >= 80 ? '良好' : n >= 70 ? '尚可' : n >= 60 ? '需加強' : '需重新練習'; }
function levelClass(l) { return { 優秀: 'lv-great', 良好: 'lv-good', 尚可: 'lv-ok', 需加強: 'lv-low', 需重新練習: 'lv-bad' }[l] || 'lv-ok'; }

// ---- 回答碼表 ----
function startTimer(outlet) {
  stopTimer();
  sess.timerStartMs = Date.now();
  sess.reminderFired = false;
  const disp = outlet.querySelector('#so-timer');
  const remEl = outlet.querySelector('#so-remind');
  const tick = () => {
    const sec = Math.floor((Date.now() - sess.timerStartMs) / 1000);
    sess.curDurationSec = sec;
    if (disp) disp.textContent = fmtTime(sec);
    if (!sess.reminderFired && sec >= sess.reminderSec) {
      sess.reminderFired = true;
      if (remEl) { remEl.textContent = '已達提醒時間，請準備收尾，但仍可繼續回答。'; remEl.hidden = false; }
      try { if (navigator.vibrate) navigator.vibrate(200); } catch (_) {}
    }
  };
  tick();
  sess.timerInterval = setInterval(tick, 250);
}
function stopTimer() { if (sess && sess.timerInterval) { clearInterval(sess.timerInterval); sess.timerInterval = null; } }

async function stopAndSaveRecording(statusEl) {
  if (!sess.recorder) return;
  const rec = sess.recorder; sess.recorder = null;
  try {
    const { blob, mimeType, durationSec } = await rec.stop();
    sess.curDurationSec = durationSec;
    if (blob && blob.size) {
      const recordingId = genId();
      await saveRecordingFull({
        key: recordingId, recordingId, attemptId: sess.attemptId, questionId: sess.q.id,
        mode: 'single-oral', round: ROUND_TYPES[sess.roundIdx], createdAt: new Date().toISOString(),
        audioBlob: blob, blob, mimeType, durationSec,
      });
      sess.curHasRecording = true;
      sess.anyRecording = true;
      sess.totalDurationSec += durationSec;
      if (statusEl) statusEl.textContent = `已完整保存錄音（${fmtTime(durationSec)}）`;
    } else if (statusEl) { statusEl.textContent = '錄音內容為空，未保存。'; }
  } catch (e) {
    console.warn('錄音保存失敗', e);
    if (statusEl) statusEl.textContent = '錄音保存失敗，仍可繼續。';
  }
}
async function stopLiveSTT() {
  if (!sess.sttController) return '';
  const ctl = sess.sttController; sess.sttController = null;
  try { const r = await ctl.stop(); return (r && r.transcript) || ''; } catch (_) { return ''; }
}

// 對本輪逐字稿評分：先試 OpenAI，失敗用本地。回傳統一結構。
async function scoreRound(askedQuestion, transcript, statusEl) {
  const q = sess.q;
  const examinerBank = {
    examinerWants: q.examinerWants, bonusPoints: q.bonusPoints,
    commonMistakes: q.commonMistakes, followups: (q.followups || []).map((f) => f && f.question).filter(Boolean),
  };
  if (hasWorkerUrl() && transcript) {
    if (statusEl) statusEl.textContent = 'AI 委員評分中…（若失敗將改用本地評分）';
    const ai = await scoreWithOpenAI({
      question: { ...q, title: askedQuestion }, examinerBank, transcript, candidateName: salutation(),
    });
    if (ai) {
      sess.anyAi = true;
      return { provider: 'openai', value: ai.score, score: ai, aiFollowUp: ai.followUpQuestion || '', committee: ai.committeeComment || '' };
    }
  }
  const local = scoreAnswer(q, transcript);
  return { provider: 'local', value: local.totalScore, score: local, aiFollowUp: '', committee: '' };
}

// ===== 進入點 =====
export function renderSingleOral(outlet, { content, id } = {}) {
  const q = content.byId[id];
  if (!q) {
    outlet.innerHTML = `${appBar('找不到題目')}<section class="view"><p class="empty">找不到這題（${esc(id)}）。<a href="#/knowledge">回知識庫</a></p></section>`;
    return;
  }
  sess = {
    q, content, outlet, attemptId: genId(), reminderSec: getReminderSec(),
    roundIdx: 0, rounds: [], ebFollowups: (q.followups || []).map((f) => f && f.question).filter(Boolean),
    currentQuestionText: q.title,
    recorder: null, sttController: null, sttAttempted: false, liveTranscript: '',
    timerInterval: null, timerStartMs: 0, reminderFired: false,
    curTranscript: '', curDurationSec: 0, curHasRecording: false,
    totalDurationSec: 0, anyRecording: false, anyAi: false,
  };
  renderRound(outlet, content);
}

// 每輪：朗讀題目 → 錄音(碼表) → 我回答完了
function renderRound(outlet, content) {
  stopTimer();
  const q = sess.q;
  const r = sess.roundIdx;
  const spine = dimMeta(content, (q.dimensions || [])[0]).color;
  const asked = sess.currentQuestionText;
  sess.curTranscript = ''; sess.curDurationSec = 0; sess.curHasRecording = false;
  sess.recorder = null; sess.sttController = null; sess.sttAttempted = false; sess.liveTranscript = '';
  sess.reminderFired = false;
  const canRec = recorderSupported();
  const canTTS = ttsSupported();

  outlet.innerHTML = `${appBar('單題 AI 口語')}
    <section class="view exam-run">
      <div class="p-progress"><span class="p-count">${ROUND_LABELS[r]}（第 ${r + 1} 輪 / 最多 4 輪）</span><div class="p-bar"><i style="width:${Math.round((r / 4) * 100)}%"></i></div></div>
      <article class="qcard" style="--spine:${esc(spine)}">
        <header class="qcard-head">
          <div class="q-item-chips">${(q.dimensions || []).map((d) => { const m = dimMeta(content, d); return `<span class="chip" style="--dc:${esc(m.color)}">${esc(m.label)}</span>`; }).join('')}${r === 0 ? '' : '<span class="rec-tag aisrc">AI 追問</span>'}</div>
          <h1 class="qcard-title">${esc(asked)}</h1>
        </header>

        <div id="so-answer-phase">
          <div class="exam-timer-row">
            <span class="exam-timer-label">回答時間</span>
            <span class="exam-timer" id="so-timer">00:00</span>
            <span class="exam-timer-rem">提醒 ${sess.reminderSec} 秒</span>
          </div>
          <p class="exam-remind" id="so-remind" hidden></p>
          <p class="exam-cue" id="so-cue">委員正在朗讀題目，聽完後口頭回答；可先按「開始錄音」。</p>
          <div class="exam-voice">
            ${canTTS ? `<button class="btn-ghost exam-vbtn" id="so-tts" type="button">🔊 重新朗讀題目</button>` : ''}
            ${canRec
              ? `<button class="btn-ghost exam-vbtn" id="so-rec-start" type="button">● 開始錄音</button>
                 <button class="btn-ghost exam-vbtn" id="so-rec-stop" type="button" hidden>■ 停止錄音</button>
                 <span class="exam-rec-status" id="so-rec-status"></span>`
              : `<p class="exam-rec-unsupported">此裝置暫不支援錄音，仍可進行口語練習。</p>`}
          </div>
          <button class="btn-primary btn-block" id="so-done" type="button">我回答完了</button>
        </div>

        <div id="so-transcript" hidden>
          <p class="p-rate-label">逐字稿（可修改後確認）</p>
          <p class="exam-tx-help">系統已完整保存錄音；若自動逐字稿不完整，可在下方手動補上後再確認。評分會以你最後確認的逐字稿為準。</p>
          <p class="exam-tx-status" id="so-tx-status"></p>
          <textarea id="so-tx-area" class="note-area exam-tx-area" placeholder="逐字稿：可自動產生或手動輸入你的回答重點…"></textarea>
          <div class="exam-tx-actions">
            <button class="btn-primary btn-block" id="so-tx-confirm" type="button">確認逐字稿，進行 AI 評分</button>
            <button class="btn-ghost" id="so-tx-redo" type="button">重新錄音</button>
          </div>
        </div>

        <div id="so-result" hidden></div>
      </article>
    </section>`;

  const statusEl = outlet.querySelector('#so-rec-status');
  if (canTTS) { speak(asked); const t = outlet.querySelector('#so-tts'); if (t) t.addEventListener('click', () => speak(asked)); }

  if (canRec) {
    const startBtn = outlet.querySelector('#so-rec-start');
    const stopBtn = outlet.querySelector('#so-rec-stop');
    startBtn.addEventListener('click', async () => {
      statusEl.textContent = '準備中…';
      try {
        sess.recorder = await startRecording();
        if (sttSupported()) { try { sess.sttController = startLiveTranscription({ lang: 'zh-TW' }); sess.sttAttempted = !!sess.sttController; } catch (_) { sess.sttController = null; } }
        startTimer(outlet);
        startBtn.hidden = true; stopBtn.hidden = false;
        statusEl.textContent = sttSupported() ? '🔴 錄音中…（同時辨識）' : '🔴 錄音中…';
      } catch (e) {
        sess.recorder = null; startBtn.hidden = false; stopBtn.hidden = true;
        statusEl.textContent = '無法取得麥克風權限，仍可繼續。';
      }
    });
    stopBtn.addEventListener('click', async () => {
      stopBtn.hidden = true; startBtn.hidden = false; stopTimer();
      await stopAndSaveRecording(statusEl);
      sess.liveTranscript = await stopLiveSTT();
    });
  }

  outlet.querySelector('#so-done').addEventListener('click', async () => {
    cancelTTS(); stopTimer();
    if (sess.recorder) { if (statusEl) statusEl.textContent = '儲存錄音中…'; await stopAndSaveRecording(statusEl); }
    if (sess.sttController) { sess.liveTranscript = await stopLiveSTT(); }
    showTranscript(outlet, content, asked);
  });
}

function showTranscript(outlet, content, asked) {
  const phase = outlet.querySelector('#so-answer-phase');
  const box = outlet.querySelector('#so-transcript');
  const area = outlet.querySelector('#so-tx-area');
  const status = outlet.querySelector('#so-tx-status');
  if (phase) phase.hidden = true;
  area.value = sess.liveTranscript || '';
  if (!sttSupported()) status.textContent = '此裝置暫不支援自動語音辨識，請手動輸入回答逐字稿。';
  else if (sess.sttAttempted && sess.liveTranscript) status.textContent = '已自動產生逐字稿（可能不完整），請確認或補上後再評分。';
  else if (sess.sttAttempted) status.textContent = '語音辨識失敗或未取得文字，請手動輸入。';
  else status.textContent = '可手動輸入回答逐字稿。';
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });

  outlet.querySelector('#so-tx-redo').addEventListener('click', () => renderRound(outlet, content));
  outlet.querySelector('#so-tx-confirm').addEventListener('click', async () => {
    const transcript = (area.value || '').trim();
    const btn = outlet.querySelector('#so-tx-confirm');
    if (btn) { btn.disabled = true; btn.textContent = '評分中…'; }
    const result = await scoreRound(asked, transcript, status);
    // 保存本輪
    sess.rounds.push({ type: ROUND_TYPES[sess.roundIdx], question: sess.roundIdx === 0 ? '' : asked, transcript, score: result.score });
    showRoundResult(outlet, content, asked, transcript, result);
  });
}

function scoreCardHtml(result) {
  const s = result.score;
  const chips = (arr, empty) => (arr && arr.length)
    ? `<div class="score-chips">${arr.map((x) => `<span class="score-chip">${esc(x)}</span>`).join('')}</div>`
    : `<p class="facet-body muted">${esc(empty)}</p>`;
  if (result.provider === 'openai') {
    return `<section class="score-card ai-card">
      <div class="score-head"><span class="score-total">${s.score}<small> / 100</small></span><span class="score-level ${levelClass(s.level)}">${esc(s.level)}</span><span class="ai-source-tag">AI 委員（OpenAI）</span></div>
      ${s.committeeComment ? `<div class="score-block"><span class="score-label">委員講評</span><p class="facet-body">${esc(s.committeeComment)}</p></div>` : ''}
      <div class="score-block"><span class="score-label">優點</span>${chips(s.strengths, '—')}</div>
      <div class="score-block"><span class="score-label">缺少重點</span>${chips(s.missedPoints, '沒有明顯缺漏')}</div>
      <div class="score-block"><span class="score-label">可能失分</span>${chips(s.riskPoints, '無明顯失分')}</div>
      ${s.suggestion ? `<div class="score-block"><span class="score-label">修正建議</span><p class="facet-body">${esc(s.suggestion)}</p></div>` : ''}
      ${s.revisedAnswer ? `<div class="score-block"><span class="score-label">修正版回答</span><p class="facet-body">${esc(s.revisedAnswer)}</p></div>` : ''}
    </section>`;
  }
  const hits = [...(s.hitKeywords || []), ...((s.hitBonusPoints || []).map((b) => (b.length > 16 ? b.slice(0, 16) + '…' : b)))];
  const miss = [...(s.missedKeywords || []), ...((s.missedBonusPoints || []).map((b) => (b.length > 16 ? b.slice(0, 16) + '…' : b)))];
  return `<section class="score-card">
    <div class="score-head"><span class="score-total">${s.totalScore}<small> / 100</small></span><span class="score-level ${levelClass(s.level)}">${esc(s.level)}</span><span class="ai-source-tag">本地評分</span></div>
    <div class="score-block"><span class="score-label">命中重點</span>${chips(hits, '尚未命中重點')}</div>
    <div class="score-block"><span class="score-label">缺少重點</span>${chips(miss, '沒有明顯缺漏')}</div>
    <div class="score-block"><span class="score-label">可能失分</span>${chips(s.possibleMistakes, '無明顯失分')}</div>
    ${s.suggestion ? `<div class="score-block"><span class="score-label">修正建議</span><p class="facet-body score-suggest">${esc(s.suggestion).replace(/\n/g, '<br>')}</p></div>` : ''}
  </section>`;
}

function showRoundResult(outlet, content, asked, transcript, result) {
  // 決定下一輪追問：AI 生成優先，否則用 Examiner Bank 對應追問
  const r = sess.roundIdx;
  const nextQ = (result.aiFollowUp && result.aiFollowUp.trim()) || sess.ebFollowups[r] || '';
  const hasNext = r < 3 && !!nextQ;

  const box = outlet.querySelector('#so-result');
  const txBox = outlet.querySelector('#so-transcript');
  if (txBox) txBox.hidden = true;
  box.innerHTML = `${scoreCardHtml(result)}
    ${hasNext
      ? `<section class="facet facet--followup"><div class="facet-head"><span class="facet-label">${ROUND_LABELS[r + 1]}</span><span class="facet-tag">委員追問</span></div><p class="facet-body">${esc(nextQ)}</p></section>
         <button class="btn-primary btn-block" id="so-next" type="button">回答這個追問</button>
         <button class="btn-ghost btn-block" id="so-finish" type="button">結束並看委員總結</button>`
      : `<button class="btn-primary btn-block" id="so-finish" type="button">看委員總結</button>`}`;
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (ttsSupported() && hasNext) speak(nextQ);

  const next = outlet.querySelector('#so-next');
  if (next) next.addEventListener('click', () => { sess.roundIdx += 1; sess.currentQuestionText = nextQ; renderRound(outlet, content); });
  outlet.querySelector('#so-finish').addEventListener('click', () => renderCommittee(outlet, content));
}

async function renderCommittee(outlet, content) {
  cancelTTS(); stopTimer();
  if (sess.recorder) { try { sess.recorder.cancel(); } catch (_) {} sess.recorder = null; }
  const q = sess.q;
  const values = sess.rounds.map((r) => (r.score && (typeof r.score.score === 'number' ? r.score.score : r.score.totalScore)) || 0);
  const finalScore = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  const finalLevel = levelOf(finalScore);
  const aiProvider = sess.anyAi ? 'openai' : 'local';
  // 委員總評：取最後一輪 AI 講評；若無則用本地綜合說明
  let committeeSummary = '';
  for (let i = sess.rounds.length - 1; i >= 0; i--) {
    const s = sess.rounds[i].score;
    if (s && s.committeeComment) { committeeSummary = s.committeeComment; break; }
  }
  if (!committeeSummary) {
    committeeSummary = `本場以本地規則式評分綜合，平均 ${finalScore} 分（${finalLevel}）。建議對照題庫的「委員真正想看」「加分重點」「容易失分」再練一次，並補強結尾的後續追蹤與轉介。`;
  }

  // 保存整場紀錄（mode: single-oral）
  addAttempt({
    attemptId: sess.attemptId, questionId: q.id, mode: 'single-oral',
    rounds: sess.rounds.map((r) => ({ type: r.type, question: r.question || '', transcript: r.transcript || '', score: r.score || null })),
    finalScore, committeeSummary, aiProvider,
    createdAt: new Date().toISOString(), hasRecording: !!sess.anyRecording, durationSec: sess.totalDurationSec || 0,
    selfRating: finalScore >= 70 ? 'know' : 'review',
  }).catch((e) => console.warn('單題口語紀錄儲存失敗', e));

  const roundsHtml = sess.rounds.map((r, i) => {
    const v = (r.score && (typeof r.score.score === 'number' ? r.score.score : r.score.totalScore)) || 0;
    const lv = (r.score && r.score.level) || levelOf(v);
    const tx = (r.transcript || '').trim();
    const snip = tx ? (tx.length > 40 ? tx.slice(0, 40) + '…' : tx) : '（無逐字稿）';
    return `<section class="facet">
      <div class="facet-head"><span class="facet-label">${ROUND_LABELS[i]}</span><span class="facet-tag">${v} 分・${esc(lv)}</span></div>
      ${i > 0 && r.question ? `<p class="facet-body"><strong>追問：</strong>${esc(r.question)}</p>` : ''}
      <p class="facet-body">逐字稿：${esc(snip)}</p>
    </section>`;
  }).join('');

  outlet.innerHTML = `${appBar('委員總結')}
    <section class="view exam-summary">
      <div class="ps-card">
        <span class="action-tag ps-tag">單題 AI 口語・完成</span>
        <h1 class="ps-big">${finalScore} 分</h1>
        <div class="ps-stats"><div class="ps-stat"><span class="ps-n">${esc(finalLevel)}</span>等級</div><div class="ps-stat"><span class="ps-n">${sess.rounds.length}</span>輪</div></div>
        <p class="exam-saved">AI 來源：${aiProvider === 'openai' ? 'OpenAI 委員' : '本地評分'}・已存入成績紀錄</p>
      </div>
      <section class="score-card ${aiProvider === 'openai' ? 'ai-card' : ''}">
        <div class="score-head"><span class="score-label">委員總評</span></div>
        <p class="facet-body">${esc(committeeSummary)}</p>
      </section>
      <h2 class="section-title">各輪內容</h2>
      ${roundsHtml}
      <button class="btn-primary btn-block" id="so-redo" type="button">再練一次</button>
      <a class="btn-ghost btn-block" href="#/q/${encodeURIComponent(q.id)}">返回題目</a>
      <a class="btn-ghost btn-block" href="#/records">查看成績</a>
    </section>`;

  const redo = outlet.querySelector('#so-redo');
  if (redo) redo.addEventListener('click', () => renderSingleOral(outlet, { content, id: q.id }));
}
