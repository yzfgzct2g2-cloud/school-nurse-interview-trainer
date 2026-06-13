// ai/examiner.js — 委員追問抽象層（介面定義）
// 介面：nextFollowup(transcript, question, askedIds) → followup | null
//
// Sprint 1：尚未啟用。
// Sprint 3：規則式追問樹——掃描 transcript 是否命中 followups[].triggerKeywords，
//           回傳尚未問過的追問（可巢狀走訪 children），模擬「委員記得你說過什麼」。
// Sprint 4：可替換為 LLM 委員，產生真正依上下文的追問，介面不變。

export function isAvailable() {
  return false;
}

export function nextFollowup(transcript, question, askedIds = []) {
  // 預留 Sprint 3 實作；先回傳 null 表示無追問。
  void transcript; void question; void askedIds;
  return null;
}
