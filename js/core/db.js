// core/db.js — 使用者層（IndexedDB）
// 存放錄音 Blob 與練習歷程。採 append-only：用 store.add 而非 put，
// 重複 attemptId 會被拒絕，從機制上保證舊紀錄不被覆蓋。
// Sprint 1 僅建立封裝與資料表；實際寫入由 Sprint 2 的單題練習啟用。

const DB_NAME = 'snit-db';
const DB_VERSION = 2;
let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('此瀏覽器不支援 IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // 全部以「存在才略過」方式建立，升級時只補缺少的 store，不動既有資料。
      if (!db.objectStoreNames.contains('attempts')) {
        const s = db.createObjectStore('attempts', { keyPath: 'attemptId' });
        s.createIndex('byQuestion', 'questionId', { unique: false });
        s.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'questionId' });
      }
      if (!db.objectStoreNames.contains('records')) {
        const s = db.createObjectStore('records', { keyPath: 'id' });
        s.createIndex('byQuestion', 'questionId', { unique: false });
        s.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('recordings')) {
        db.createObjectStore('recordings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function store(name, mode) {
  return openDB().then((db) => db.transaction(name, mode).objectStore(name));
}
function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function genId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// --- 練習歷程（append-only）---
export async function addAttempt(attempt) {
  const s = await store('attempts', 'readwrite');
  await reqAsPromise(s.add(attempt)); // add：key 重複會 reject，杜絕覆蓋
  return attempt.attemptId;
}
export async function getAttemptsByQuestion(questionId) {
  const s = await store('attempts', 'readonly');
  const out = [];
  await new Promise((resolve, reject) => {
    const cur = s.index('byQuestion').openCursor(IDBKeyRange.only(questionId));
    cur.onsuccess = (e) => {
      const c = e.target.result;
      if (c) { out.push(c.value); c.continue(); } else resolve();
    };
    cur.onerror = () => reject(cur.error);
  });
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
export async function getAllAttempts() {
  const s = await store('attempts', 'readonly');
  return reqAsPromise(s.getAll());
}

// --- 錄音 Blob ---
export async function saveRecording(key, blob) {
  const s = await store('recordings', 'readwrite');
  await reqAsPromise(s.put({ key, blob })); // 錄音以 key 寫入，key 由 genId 產生故不重複
  return key;
}
export async function getRecording(key) {
  const s = await store('recordings', 'readonly');
  const rec = await reqAsPromise(s.get(key));
  return rec ? rec.blob : null;
}

// 正式口試錄音：保存含 metadata 的完整錄音記錄（key 由 genId 產生，append-only 不覆蓋既有）。
export async function saveRecordingFull(rec) {
  const s = await store('recordings', 'readwrite');
  await reqAsPromise(s.put(rec)); // rec 須含 key 屬性
  return rec.key;
}

// --- 備份匯出（Sprint 2 會擴充為含錄音的完整匯出）---
export async function exportAttempts() {
  const attempts = await getAllAttempts();
  return { exportedAt: new Date().toISOString(), version: 1, attempts };
}

// --- 個人筆記（notes store；IndexedDB 失敗時退回 localStorage）---
const NOTE_LS = 'snit:note:';

export async function getNote(questionId) {
  try {
    const s = await store('notes', 'readonly');
    const rec = await reqAsPromise(s.get(questionId));
    if (rec) return rec.text || '';
    return localStorage.getItem(NOTE_LS + questionId) || '';
  } catch {
    return localStorage.getItem(NOTE_LS + questionId) || '';
  }
}

export async function saveNote(questionId, text) {
  const clean = (text || '').trim();
  try {
    const s = await store('notes', 'readwrite');
    if (clean) await reqAsPromise(s.put({ questionId, text, updatedAt: new Date().toISOString() }));
    else await reqAsPromise(s.delete(questionId));
  } catch {
    // 退回 localStorage，確保離線時筆記不遺失
    if (clean) localStorage.setItem(NOTE_LS + questionId, text);
    else localStorage.removeItem(NOTE_LS + questionId);
  }
}

// --- 成績紀錄（records store；Sprint 2 起寫入，append-only）---
export async function addRecord(record) {
  const s = await store('records', 'readwrite');
  await reqAsPromise(s.add(record));
  return record.id;
}
export async function getRecordsByQuestion(questionId) {
  const s = await store('records', 'readonly');
  const out = [];
  await new Promise((resolve, reject) => {
    const cur = s.index('byQuestion').openCursor(IDBKeyRange.only(questionId));
    cur.onsuccess = (e) => { const c = e.target.result; if (c) { out.push(c.value); c.continue(); } else resolve(); };
    cur.onerror = () => reject(cur.error);
  });
  return out;
}

// --- 儲存空間估計 ---
export async function estimateUsage() {
  if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
  return null;
}
