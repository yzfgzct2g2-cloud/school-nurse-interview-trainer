// core/search.js — 記憶體內全文搜尋（v1）
// 對標題、關鍵字、快答、記憶、加分、原始資料做加權子字串比對。
// 中文不需斷詞即可子字串比對；模糊比對與排名優化留待後續。

let _index = null;

export function buildIndex(questions) {
  _index = questions.map((q) => ({
    q,
    fields: [
      [q.title, 3],
      [(q.keywords || []).join(' '), 3],
      [q.quickAnswer, 2],
      [q.memoryHook, 2],
      [(q.bonusPoints || []).join(' '), 1],
      [(q.commonMistakes || []).join(' '), 1],
      [q.examinerWants, 1],
      [(q.followups || []).map((f) => `${f.question || ''} ${(f.triggerKeywords || []).join(' ')}`).join(' '), 1],
      [q.original, 1],
    ],
  }));
}

export function search(query) {
  if (!_index) return [];
  const term = (query || '').trim().toLowerCase();
  if (!term) return [];
  const results = [];
  for (const entry of _index) {
    let score = 0;
    for (const [text, weight] of entry.fields) {
      if (text && text.toLowerCase().includes(term)) score += weight;
    }
    if (score > 0) results.push({ q: entry.q, score });
  }
  return results.sort((a, b) => b.score - a.score).map((r) => r.q);
}
