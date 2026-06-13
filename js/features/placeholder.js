// features/placeholder.js — 尚未開放功能的佔位頁（誠實標示路線圖）
import { esc, appBar } from '../core/dom.js';

const INFO = {
  exam: { title: '正式口試', sprint: 'Sprint 3', desc: '完整模擬：候場 → 自我介紹 → 委員提問 → 追問樹 → 最後補充 → 評分。AI 委員會記得你前面說過的內容。' },
  practice: { title: '單題練習', sprint: 'Sprint 2', desc: '朗讀題目、錄音作答、轉逐字稿、保存成績與修正版，可反覆磨同一題。' },
  records: { title: '成績紀錄', sprint: 'Sprint 2', desc: '每次作答只新增不覆蓋：日期、錄音、逐字稿、分數、建議、修正版，看見自己的成長。' },
  cram: { title: '考前 5 分鐘', sprint: 'Sprint 2', desc: '把每題的「一句記憶」串成最後衝刺的快速複習。' },
};

export function renderPlaceholder(outlet, { key } = {}) {
  const info = INFO[key] || { title: '即將推出', sprint: '', desc: '' };
  outlet.innerHTML = `
    ${appBar(info.title)}
    <section class="view placeholder">
      <div class="placeholder-card">
        ${info.sprint ? `<span class="action-tag">${esc(info.sprint)}</span>` : ''}
        <h1 class="placeholder-title">${esc(info.title)}</h1>
        <p class="placeholder-desc">${esc(info.desc)}</p>
        <p class="placeholder-note">此功能依開發路線圖將於 ${esc(info.sprint || '後續 Sprint')} 推出。Sprint 1 已完成知識庫、搜尋、稱呼設定、離線與儲存基礎。</p>
        <a class="btn-primary btn-block" href="#/knowledge">先去知識庫看題目</a>
      </div>
    </section>`;
}
