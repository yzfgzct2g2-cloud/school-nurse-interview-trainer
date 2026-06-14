// features/settings.js — 設定（修改口試稱呼與姓名）
// 重用 setup 的 chip-select 樣式；儲存沿用 core/settings.setProfile，不改資料結構。
import { getProfile, setProfile } from '../core/settings.js';
import { esc, appBar } from '../core/dom.js';

const PRESETS = ['王小姐', '王先生', '護理師', '老師'];

export function renderSettings(outlet) {
  const profile = getProfile() || { name: '', salutation: '老師' };
  const isPreset = PRESETS.includes(profile.salutation);

  outlet.innerHTML = `${appBar('設定')}
    <section class="view setup settings-view">
      <p class="eyebrow">設定</p>
      <h1 class="setup-title">口試稱呼與姓名</h1>
      <p class="setup-sub">這個稱呼會用在正式口試的開場與全程。修改後立即生效。</p>

      <label class="field-label" for="name-input">您的姓名（選填）</label>
      <input id="name-input" class="text-input" type="text" placeholder="例如：房怡君" autocomplete="off" value="${esc(profile.name || '')}">

      <p class="field-label">口試時的稱呼</p>
      <div class="chip-select" id="salu-presets">
        ${PRESETS.map((p) => `<button type="button" class="select-chip${p === profile.salutation ? ' is-active' : ''}" data-val="${esc(p)}">${esc(p)}</button>`).join('')}
        <button type="button" class="select-chip${isPreset ? '' : ' is-active'}" data-custom="1">自訂…</button>
      </div>
      <input id="salu-custom" class="text-input" type="text" placeholder="輸入自訂稱呼，例如：房護理師" style="${isPreset ? 'display:none;' : ''}margin-top:8px" autocomplete="off" value="${isPreset ? '' : esc(profile.salutation || '')}">

      <button id="settings-save" class="btn-primary btn-block" type="button">儲存設定</button>
      <p class="note-status" id="settings-status"></p>
    </section>`;

  const presets = outlet.querySelector('#salu-presets');
  const custom = outlet.querySelector('#salu-custom');
  const status = outlet.querySelector('#settings-status');
  let salutation = profile.salutation || '老師';

  presets.addEventListener('click', (e) => {
    const b = e.target.closest('.select-chip');
    if (!b) return;
    presets.querySelectorAll('.select-chip').forEach((c) => c.classList.remove('is-active'));
    b.classList.add('is-active');
    if (b.dataset.custom) {
      custom.style.display = 'block';
      custom.focus();
      salutation = custom.value.trim();
    } else {
      custom.style.display = 'none';
      salutation = b.dataset.val;
    }
  });
  custom.addEventListener('input', () => { salutation = custom.value.trim(); });

  outlet.querySelector('#settings-save').addEventListener('click', () => {
    const name = outlet.querySelector('#name-input').value.trim();
    const finalSalu = (salutation && salutation.trim()) || name || '老師';
    const prev = getProfile() || {};
    setProfile({ ...prev, name, salutation: finalSalu });
    status.textContent = `已儲存，口試將稱呼您為「${finalSalu}」。`;
  });
}
