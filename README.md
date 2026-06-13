# 校護口試訓練平台（衝刺版 MVP）

考前衝刺用的離線小工具：可搜尋、可閱讀、可保存。純前端（vanilla JS + PWA），無框架、無外部字型，題庫離線可讀。

## 在電腦上執行（localhost）

因為用到 ES modules、fetch 題庫與 Service Worker，**必須用網頁伺服器開啟，不能用 `file://` 直接點開**。

```bash
cd school-nurse-interview-trainer
python3 -m http.server 8000
```

開啟瀏覽器： <http://localhost:8000>

第一次會先請你設定姓名與稱呼（存在這台裝置），之後進入首頁。

## 裝到 iPhone（加到主畫面）

1. 先把整個資料夾放到任一可用 https 的空間（例如 GitHub Pages、Netlify、Cloudflare Pages），或在同網段電腦跑上面的 server。
2. iPhone Safari 開啟該網址 → 分享 → 「加入主畫面」。
3. 之後從主畫面圖示開啟，第二次起即可離線使用。

> Service Worker 需要 https 或 localhost 才會註冊；用區網 IP（http）開啟時功能正常，但不會啟用離線快取。

## 資料夾結構

```
index.html              App 殼層
manifest.webmanifest    PWA manifest
sw.js                   Service Worker（離線快取）
css/                    tokens / base / components
js/
  app.js                路由與啟動
  core/                 settings(localStorage) · db(IndexedDB) · content · search · dom
  speech/               tts(朗讀) · stt(語音辨識偵測)
  ai/                   scorer · examiner（介面預留，Sprint 2+ 才實作）
  features/             home · knowledge · setup · placeholder
data/
  schema.md             資料契約
  dimensions.json       能力面向
  questions/            self · emergency · infectious · mental
assets/icons/           PWA 圖示
```

## 設計原則

- **content layer 唯讀**：`data/` 隨 App 出貨，程式不寫回，AI 不覆蓋 original。
- **user layer 只新增**：練習歷程走 IndexedDB（append-only）；姓名、稱呼、收藏、最近閱讀、UI 設定走 localStorage；個人筆記走 IndexedDB `notes`。
- 任何 AI 建議未來都以 `revised` / `suggestion` 形式新增，不改 original。

## 部署到 GitHub Pages

專案的 `index.html` 在根目錄、所有路徑皆為相對路徑，可直接部署，毋須改任何設定。雜湊路由（`#/...`）不會打到伺服器，因此 GitHub Pages 不需要 SPA 轉址設定。已附 `.nojekyll`，避免 Jekyll 處理檔案。

**方式 A：用分支根目錄（最簡單）**
1. 在 GitHub 建一個 repo（例如 `school-nurse`）。
2. 把這個資料夾「內容」（含 `index.html`、`.nojekyll`、`css/`、`js/`、`data/`、`assets/`…）推到 `main` 分支根目錄。
3. repo → Settings → Pages → Source 選 `Deploy from a branch`，分支選 `main`、資料夾選 `/ (root)`，存檔。
4. 約一分鐘後開 `https://你的帳號.github.io/school-nurse/`。

**方式 B：用 `/docs` 資料夾**
把整個資料夾放到 repo 的 `docs/` 下，Pages 的資料夾選 `/docs` 即可。

部署後在 iPhone Safari 開該網址 → 分享 → 加入主畫面，即可離線使用（GitHub Pages 為 https，Service Worker 會正常註冊）。

> 路徑相容性：因為 `start_url`、`scope` 與所有引用都用相對路徑，無論部署在 `帳號.github.io/repo/` 子路徑或自訂網域根目錄都能運作。
