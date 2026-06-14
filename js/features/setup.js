// features/setup.js — 首次稱呼設定（口試前的「報到」）
import { setProfile } from '../core/settings.js';
import { esc } from '../core/dom.js';

const PRESETS = ['王小姐', '王先生', '護理師', '老師'];

export function renderSetup(outlet, { onDone } = {}) {
  outlet.innerHTML = `
  <section class="view setup">
    <p class="eyebrow">校護口試訓練・報到</p>
    <h1 class="setup-title">開始之前，<br>委員該怎麼稱呼您？</h1>
    <p class="setup-sub">這個稱呼會用在模擬口試的開場與全程。之後可隨時修改。</p>

    <label class="field-label" for="name-input">您的姓名（選填）</label>
    <input id="name-input" class="text-input" type="text" placeholder="例如：房怡君" autocomplete="off">

    <p class="field-label">口試時的稱呼</p>
    <div class="chip-select" id="salu-presets">
      ${PRESETS.map((p, i) => `<button type="button" class="select-chip${i === 0 ? ' is-active' : ''}" data-val="${esc(p)}">${esc(p)}</button>`).join('')}
      <button type="button" class="select-chip" data-custom="1">自訂…</button>
    </div>
    <input id="salu-custom" class="text-input" type="text" placeholder="輸入自訂稱呼，例如：房護理師" style="display:none;margin-top:8px" autocomplete="off">

    <button id="setup-start" class="btn-primary btn-block" type="button">進入訓練平台</button>
  </section>`;

  const presets = outlet.querySelector('#salu-presets');
  const custom = outlet.querySelector('#salu-custom');
  let salutation = PRESETS[0];

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

  outlet.querySelector('#setup-start').addEventListener('click', () => {
    const name = outlet.querySelector('#name-input').value.trim();
    const finalSalu = (salutation && salutation.trim()) || name || '老師';
    setProfile({ name, salutation: finalSalu, createdAt: new Date().toISOString() });
    if (onDone) onDone();
  });
}
