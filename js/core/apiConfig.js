// core/apiConfig.js — 前端只保存 Worker 代理 URL（localStorage），絕不保存任何 API Key。
// AI 委員評分一律經由使用者自建的 Cloudflare Worker 代理，金鑰只存在 Worker 環境變數。
const URL_KEY = 'openaiWorkerUrl';

export function getWorkerUrl() {
  return (localStorage.getItem(URL_KEY) || '').trim();
}
export function setWorkerUrl(url) {
  const v = (url || '').trim();
  if (v) localStorage.setItem(URL_KEY, v);
  else localStorage.removeItem(URL_KEY);
}
export function hasWorkerUrl() {
  return !!getWorkerUrl();
}
// 把使用者輸入的 Worker 基底 URL 正規化成評分 endpoint。
export function interviewScoreEndpoint() {
  const base = getWorkerUrl().replace(/\/+$/, '');
  if (!base) return '';
  return base.endsWith('/api/interview-score') ? base : base + '/api/interview-score';
}
