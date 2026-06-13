// core/content.js — 內容層（唯讀）
// 載入題庫與能力面向定義。App 永不寫回這些 JSON。
// 新增題目分類檔時，在 QUESTION_FILES 加入檔名即可。

const QUESTION_FILES = ['self', 'emergency', 'infectious', 'parent', 'mental', 'promotion', 'admin'];

let _cache = null;

async function fetchJSON(relPath) {
  const url = new URL(relPath, document.baseURI);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`載入失敗（${res.status}）：${relPath}`);
  return res.json();
}

export async function loadContent() {
  if (_cache) return _cache;

  const dimData = await fetchJSON('data/dimensions.json');
  const dimensions = dimData.dimensions || [];
  const dimById = Object.fromEntries(dimensions.map((d) => [d.id, d]));

  const lists = await Promise.all(QUESTION_FILES.map((f) => fetchJSON(`data/questions/${f}.json`)));
  const questions = lists.flat();
  const byId = Object.fromEntries(questions.map((q) => [q.id, q]));

  _cache = { questions, dimensions, dimById, byId };
  return _cache;
}

export function dimMeta(content, id) {
  return content.dimById[id] || { id, label: id, color: '#5F5E5A', desc: '' };
}

export function groupByDimension(content) {
  const groups = content.dimensions.map((d) => ({
    dim: d,
    items: content.questions.filter((q) => (q.dimensions || []).includes(d.id)),
  }));
  return groups.filter((g) => g.items.length > 0);
}
