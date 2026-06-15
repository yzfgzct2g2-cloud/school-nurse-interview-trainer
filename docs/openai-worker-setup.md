# OpenAI AI 委員：Cloudflare Worker 設定說明

正式口試的「AI 委員評分」是把**使用者確認後的逐字稿**送到 OpenAI，產生評分、講評、追問與修正版回答。
為了安全，前端（GitHub Pages）**不會**保存或接觸 OpenAI API Key；金鑰只放在你自建的 Cloudflare Worker 環境變數裡，前端只呼叫 Worker 網址。

如果不設定 Worker，正式口試會自動使用**本地規則式評分**，一切功能照常運作。

---

## 1. 建立 Cloudflare Worker

1. 登入 <https://dash.cloudflare.com> →左側選單 **Workers & Pages** → **Create** → **Create Worker**。
2. 為 Worker 取個名字（例如 `school-nurse-examiner`），按 **Deploy** 先建立一個預設 Worker。
3. 建立後點 **Edit code**（編輯程式碼）。

## 2. 貼上 Worker 程式碼

1. 打開本專案的 `workers/openai-interview-worker.js`，全選複製。
2. 回到 Cloudflare 編輯器，刪除預設內容，貼上剛剛複製的程式碼。
3. 按 **Deploy** 部署。

> 程式碼使用 `export default { fetch }` 的 Module Worker 格式，並從環境變數 `OPENAI_API_KEY` 讀取金鑰，**不會**把金鑰寫死在程式碼中。

## 3. 設定 OPENAI_API_KEY（環境變數）

1. 在該 Worker 頁面 → **Settings** → **Variables and Secrets**（變數與機密）。
2. 新增一個 **Secret**（機密／加密變數）：
   - Name：`OPENAI_API_KEY`
   - Value：你的 OpenAI API Key（`sk-...`）
3. （選用）可再加一個一般變數 `OPENAI_MODEL`，例如 `gpt-4o-mini`（預設即為 `gpt-4o-mini`）。
4. 儲存後重新 **Deploy**，讓變數生效。

> 請務必使用 **Secret/Encrypted** 形式存放金鑰，不要寫在程式碼或前端。

## 4. 取得 Worker URL

部署成功後，Worker 會有一個網址，例如：

```
https://school-nurse-examiner.你的帳號.workers.dev
```

實際評分的 endpoint 是 `POST /api/interview-score`。前端會自動補上這段路徑，所以你只要填**基底網址**即可（填完整 endpoint 也可以）。

## 5. 在系統設定頁貼上 Worker URL

1. 打開本平台 → **設定**頁。
2. 找到「AI 委員 API（選用）」區塊，把上一步的 Worker 網址貼到 **OpenAI Worker URL** 欄位。
3. 按 **儲存 Worker URL**。網址只存到瀏覽器的 localStorage（key：`openaiWorkerUrl`），不含任何金鑰。

## 6. 測試 AI 委員評分

1. 進入 **正式口試**，回答任一題並錄音 / 輸入逐字稿。
2. 按 **確認逐字稿，進行評分**。
3. 若 Worker 正常，會看到「AI 委員（OpenAI）」評分卡：總分、等級、委員講評、優點、缺少重點、可能失分、修正建議、修正版回答、AI 追問。
4. 若 Worker 未設定或呼叫失敗，系統會自動改用**本地規則式評分**，並在逐字稿步驟顯示提示，口試流程不會中斷。

### 快速用 curl 測試 Worker

```bash
curl -X POST "https://你的-worker.workers.dev/api/interview-score" \
  -H "Content-Type: application/json" \
  -d '{"question":{"title":"學生在操場昏倒，您如何處置？"},"transcript":"我會先評估意識與呼吸，必要時CPR並通知119與家長，事後追蹤。","candidateName":"王小姐"}'
```

預期會回傳含 `score`、`level`、`committeeComment` 等欄位的 JSON。

---

## 疑難排解

- **回傳 500 missing OPENAI_API_KEY**：環境變數沒設定或沒重新部署。
- **回傳 502 OpenAI API error**：金鑰錯誤、額度不足或模型名稱錯誤；可改用 `gpt-4o-mini`。
- **前端一直顯示本地評分**：確認設定頁的 Worker URL 正確、可公開存取，且瀏覽器主控台沒有 CORS 錯誤（本 Worker 已開放 CORS）。
- **安全提醒**：絕不要把 `sk-...` 金鑰貼到前端設定頁或任何 js 檔；前端只填 Worker 網址。
