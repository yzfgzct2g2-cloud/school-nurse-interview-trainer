// core/settings.js — 使用者層（localStorage）
// 存放小型、可由使用者編輯的資料：稱呼設定、收藏、最近閱讀、個人筆記、UI 偏好。
// 不存放題庫正本，也不存放錄音／歷程（後者在 IndexedDB）。

const NS = 'snit:';
const k = (s) => NS + s;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(k(key));
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try { localStorage.setItem(k(key), JSON.stringify(value)); } catch (e) { console.warn('localStorage 寫入失敗', e); }
}

// --- 稱呼設定 ---
export function getProfile() { return readJSON('profile', null); }
export function setProfile(profile) { writeJSON('profile', profile); }

// --- 收藏 ---
export function getCollections() { return readJSON('collections', []); }
export function isCollected(id) { return getCollections().includes(id); }
export function toggleCollection(id) {
  const c = getCollections();
  const i = c.indexOf(id);
  if (i >= 0) c.splice(i, 1); else c.unshift(id);
  writeJSON('collections', c);
  return c.includes(id);
}

// --- 最近閱讀 ---
export function getRecent() { return readJSON('recent', []); }
export function pushRecent(id) {
  let r = getRecent().filter((x) => x !== id);
  r.unshift(id);
  writeJSON('recent', r.slice(0, 12));
}

// --- 個人筆記（以 questionId 關聯，不影響題庫正本）---
export function getNote(id) {
  try { return localStorage.getItem(k('note:' + id)) || ''; } catch { return ''; }
}
export function setNote(id, text) {
  try {
    if (text && text.trim()) localStorage.setItem(k('note:' + id), text);
    else localStorage.removeItem(k('note:' + id));
  } catch (e) { console.warn('筆記儲存失敗', e); }
}

// --- UI 偏好 ---
export function getUI(key, fallback) {
  const v = localStorage.getItem(k('ui:' + key));
  return v === null ? fallback : v;
}
export function setUI(key, value) { localStorage.setItem(k('ui:' + key), value); }

// --- 正式口試：回答提醒秒數（localStorage key 固定為 oralExamReminderSec；預設 30）---
const REMINDER_KEY = 'oralExamReminderSec';
export function getReminderSec() {
  const v = parseInt(localStorage.getItem(REMINDER_KEY), 10);
  return Number.isFinite(v) && v > 0 ? v : 30;
}
export function setReminderSec(sec) {
  const n = parseInt(sec, 10);
  if (Number.isFinite(n) && n > 0) {
    try { localStorage.setItem(REMINDER_KEY, String(n)); } catch (e) { console.warn('提醒秒數寫入失敗', e); }
  }
}
