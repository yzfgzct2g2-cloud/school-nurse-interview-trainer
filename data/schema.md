# 題庫資料契約（v1）

本檔定義「內容層」與「使用者層」的資料格式。

## 核心原則

- **內容層唯讀**：`data/` 下的所有 JSON 隨 App 出貨，App 程式碼中**沒有任何寫回它的路徑**。AI 與使用者都不能覆蓋原始資料。
- **使用者層只新增**：練習歷程存於 IndexedDB，採 append-only（`store.add` 而非 `put`，重複 key 會被拒絕）。個人筆記與收藏存於 localStorage，由使用者自行編輯，不影響題庫。

---

## 一、內容層：題目（`data/questions/*.json`）

每個檔案是一個「題目物件」陣列。依能力面向分檔（如 `emergency.json`、`infectious.json`），新增分類時於 `js/core/content.js` 的 `QUESTION_FILES` 加入檔名。

```jsonc
{
  "id": "EMG-001",              // 唯一代號，前綴對應分類
  "dimensions": ["emergency"],  // 能力面向 id 陣列，對應 dimensions.json
  "keywords": ["CPR", "AED"],   // 搜尋與（未來）規則評分用關鍵字
  "title": "題目全文",           // 委員提問
  "original": "原始資料全文",     // 正本，永久保存，永不改寫
  "quickAnswer": "30 秒快答",
  "memoryHook": "一句記憶",
  "examinerWants": "委員真正想看的點",
  "bonusPoints": ["加分重點1", "加分重點2"],     // 陣列；未來評分依此計算覆蓋率
  "commonMistakes": ["容易失分1", "容易失分2"],   // 陣列
  "regulations": ["法規重點1", "法規重點2"],       // 陣列
  "followups": [                                  // 追問樹（Sprint 3 啟用）
    {
      "id": "EMG-001-F1",
      "triggerKeywords": ["AED"],                 // 逐字稿命中即觸發
      "question": "追問題目",
      "children": []                              // 可巢狀更深層追問
    }
  ]
}
```

**個人筆記不在此檔。** 筆記屬使用者資料，存於 localStorage（`snit:note:<id>`），以 questionId 關聯，確保題庫正本不被改寫。

---

## 二、內容層：能力面向（`data/dimensions.json`）

```jsonc
{
  "version": 1,
  "dimensions": [
    { "id": "emergency", "label": "緊急傷病", "color": "#B23A2E", "desc": "..." }
  ]
}
```

`color` 用於 UI 的色脊與標籤；`id` 是題目 `dimensions` 欄位引用的值。

---

## 三、使用者層：練習紀錄（IndexedDB，Sprint 2 起寫入）

object store `attempts`，keyPath `attemptId`，append-only。

```jsonc
{
  "attemptId": "uuid",
  "questionId": "EMG-001",
  "mode": "single",                 // single | exam
  "createdAt": "2026-06-12T10:30:00+08:00",
  "audioKey": "rec-uuid",           // 指向 recordings store 的錄音 Blob
  "transcript": "逐字稿",
  "durationSec": 58,
  "scores": {                       // Sprint 2 規則評分填入
    "total": 82,
    "dimensions": { "emergency": 85 },
    "coverage": { "hit": [...], "missed": [...] }
  },
  "aiSuggestion": "建議",
  "userRevision": "使用者修正版",
  "nextReminder": "下次提醒"
}
```

object store `recordings`，keyPath `key`，值為 `{ key, blob }`。
