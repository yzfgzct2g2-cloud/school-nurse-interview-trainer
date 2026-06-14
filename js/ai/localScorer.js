// ai/localScorer.js — 本地規則式評分 v1（不接任何外部 API、不含 LLM、不含金鑰）
// 依 Question Bank 的 keywords / quickAnswer / bonusPoints / commonMistakes 對逐字稿評分。
// Examiner Bank 尚未結構化成 JSON，故以 Question Bank 欄位為主要依據（符合本次規格）。
// 介面：scoreAnswer(question, transcript) → 規格指定的結果物件。

function norm(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

// 把一段中文片語拆成有意義的詞塊（依標點/數字/符號切分），保留長度 >= minLen 的片段。
function terms(phrase, minLen) {
  return String(phrase || '')
    .split(/[\s、，。；：・,.;:!！?？/／()（）「」『』【】《》〈〉~～\-—_…．·0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= minLen);
}

function levelOf(score) {
  if (score >= 90) return '優秀';
  if (score >= 80) return '良好';
  if (score >= 70) return '尚可';
  if (score >= 60) return '需加強';
  return '需重新練習';
}

const PROCESS_HINTS = ['評估', '處置', '步驟', '流程', '通報', '聯繫', '聯絡', '記錄', '紀錄', '首先', '接著', '再', '最後', '然後', '同時'];
const FOLLOWUP_HINTS = ['追蹤', '後續', '檢討', '預防', '持續關心', '轉介', '回診', '觀察'];

export function scoreAnswer(question, transcript) {
  const q = question || {};
  const t = norm(transcript);
  const keywords = Array.isArray(q.keywords) ? q.keywords : [];
  const bonus = Array.isArray(q.bonusPoints) ? q.bonusPoints : [];
  const mistakes = Array.isArray(q.commonMistakes) ? q.commonMistakes : [];

  // 1) 關鍵字命中：40 分（命中比例換算）
  const hitKeywords = [];
  const missedKeywords = [];
  keywords.forEach((k) => { (t.includes(norm(k)) ? hitKeywords : missedKeywords).push(k); });
  const keywordScore = keywords.length ? (hitKeywords.length / keywords.length) * 40 : 0;

  // 2) 加分重點命中：40 分（片語拆詞，任一有意義詞塊出現即視為命中）
  const hitBonusPoints = [];
  const missedBonusPoints = [];
  bonus.forEach((b) => {
    const sigTerms = terms(b, 2);
    const hit = sigTerms.some((term) => t.includes(norm(term)));
    (hit ? hitBonusPoints : missedBonusPoints).push(b);
  });
  const bonusScore = bonus.length ? (hitBonusPoints.length / bonus.length) * 40 : 0;

  // 3) 失分風險：偵測 commonMistakes 的較長詞塊（>=4 字，降低誤判），每命中扣 8 分，最多扣 20 分
  const possibleMistakes = [];
  mistakes.forEach((m) => {
    const sigTerms = terms(m, 4);
    if (sigTerms.some((term) => t.includes(norm(term)))) possibleMistakes.push(m);
  });
  const mistakeDeduction = Math.min(20, possibleMistakes.length * 8);

  // 4) 基礎完整度：20 分（長度 + 是否提到流程步驟 + 是否提到後續追蹤）
  const len = t.length;
  let baseScore = Math.min(10, (len / 120) * 10); // 約 120 字以上拿滿 10
  if (PROCESS_HINTS.some((h) => t.includes(h))) baseScore += 5;
  if (FOLLOWUP_HINTS.some((h) => t.includes(h))) baseScore += 5;
  baseScore = Math.min(20, baseScore);

  let totalScore = Math.round(keywordScore + bonusScore + baseScore - mistakeDeduction);
  totalScore = Math.max(0, Math.min(100, totalScore));
  const level = levelOf(totalScore);

  // 修正建議（actionable）
  const sugParts = [];
  if (!t) sugParts.push('目前沒有逐字稿內容，建議先完整說出你的回答再評分。');
  if (missedKeywords.length) sugParts.push(`可補上關鍵概念：${missedKeywords.slice(0, 5).join('、')}`);
  if (missedBonusPoints.length) sugParts.push(`可再加分的重點：${missedBonusPoints.slice(0, 2).join('；')}`);
  if (possibleMistakes.length) sugParts.push(`留意可能的失分：${possibleMistakes.slice(0, 2).join('；')}`);
  if (!FOLLOWUP_HINTS.some((h) => t.includes(h))) sugParts.push('結尾可補上後續追蹤／檢討預防，讓回答更完整。');
  const suggestion = sugParts.length ? sugParts.join('\n') : '回答相當完整，繼續保持！';

  // 可以這樣說（以題庫的 30 秒回答作為精簡示範方向，非取代你的作答）
  const revisedAnswerHint = q.quickAnswer || '';

  return {
    totalScore,
    level,
    hitKeywords,
    missedKeywords,
    hitBonusPoints,
    missedBonusPoints,
    possibleMistakes,
    suggestion,
    revisedAnswerHint,
  };
}
