// app.js — 路由與啟動
import { loadContent } from './core/content.js';
import { buildIndex } from './core/search.js';
import { openDB } from './core/db.js';
import { getProfile, setProfile, getUI, setUI } from './core/settings.js';
import { renderSetup } from './features/setup.js';
import { renderHome } from './features/home.js';
import { renderKnowledgeList, renderQuestion } from './features/knowledge.js';
import { renderPractice } from './features/practice.js';
import { renderExam } from './features/exam.js';
import { renderCram } from './features/cram.js';
import { renderNotes } from './features/notes.js';
import { renderSettings } from './features/settings.js';
import { renderRecords } from './features/records.js';
import { renderPlaceholder } from './features/placeholder.js';

const outlet = document.getElementById('app');
let content = null;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path, params: new URLSearchParams(qs || '') };
}

function route() {
  // 首次使用：先完成稱呼設定才進入其他頁
  if (!getProfile()) {
    renderSetup(outlet, {
      onDone: () => {
        if (location.hash && location.hash !== '#/') location.hash = '#/';
        else route();
      },
    });
    return;
  }

  const { path, params } = parseHash();
  const parts = path.split('/').filter(Boolean);
  window.scrollTo(0, 0);

  try {
    if (parts.length === 0) return renderHome(outlet, { content });
    if (parts[0] === 'knowledge') {
      return renderKnowledgeList(outlet, {
        content,
        query: params.get('q') || '',
        fav: params.get('fav') === '1',
      });
    }
    if (parts[0] === 'q' && parts[1]) {
      return renderQuestion(outlet, { content, id: decodeURIComponent(parts.slice(1).join('/')) });
    }
    if (parts[0] === 'practice') return renderPractice(outlet, { content });
    if (parts[0] === 'exam') return renderExam(outlet, { content });
    if (parts[0] === 'cram') return renderCram(outlet, { content });
    if (parts[0] === 'notes') return renderNotes(outlet, { content });
    if (parts[0] === 'settings') return renderSettings(outlet, { content });
    if (parts[0] === 'records') return renderRecords(outlet, { content });
    if (parts[0] === 'soon') return renderPlaceholder(outlet, { key: parts[1] });
    return renderHome(outlet, { content });
  } catch (err) {
    console.error(err);
    outlet.innerHTML = `<div class="error">畫面載入發生問題：${err.message}</div>`;
  }
}

// v1.3.0：本次版本統一稱呼為「王小姐」，自動覆蓋 localStorage 內的舊稱呼（例如房先生）。
// 僅執行一次（以 ui:saluMigration 旗標記錄），之後使用者仍可在「設定」自行修改並保留。
function migrateSalutationV130() {
  if (getUI('saluMigration', '') === 'v1.3.0') return;
  const p = getProfile();
  if (p) setProfile({ ...p, salutation: '王小姐' });
  setUI('saluMigration', 'v1.3.0');
}

async function boot() {
  migrateSalutationV130();
  openDB().catch((e) => console.warn('IndexedDB 初始化警告', e));

  try {
    content = await loadContent();
    buildIndex(content.questions);
  } catch (err) {
    outlet.innerHTML = `<div class="error">
      <strong>題庫載入失敗。</strong><br>
      請以網頁伺服器（http://）開啟，不要用 file:// 直接打開，否則瀏覽器會擋住載入題庫與 Service Worker。<br><br>
      在專案資料夾執行：<br>
      <code>python3 -m http.server</code><br>
      再開啟 http://localhost:8000<br><br>
      <small>${err.message}</small>
    </div>`;
    return;
  }

  window.addEventListener('hashchange', route);
  route();
}

boot();
