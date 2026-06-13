// ai/scorer.js — 評分抽象層（介面定義）
// 介面：score(answerText, question) → { total, dimensions, coverage:{ hit, missed } }
//
// Sprint 1：尚未實作（依規格本階段不做評分）。
// Sprint 2：規則式評分——比對 answerText 是否命中 question.bonusPoints / keywords，
//           計算覆蓋率作為各能力面向分數。
// Sprint 4：可整碗替換為 LLM 評分，呼叫端不需改動。

export function isAvailable() {
  return false;
}

export async function score(/* answerText, question */) {
  throw new Error('scorer：Sprint 1 尚未實作評分，預定於 Sprint 2 啟用規則式評分。');
}
