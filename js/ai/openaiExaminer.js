// ai/openaiExaminer.js — 透過 Cloudflare Worker 代理呼叫 OpenAI AI 委員評分。
// 前端不含任何 API Key；只把逐字稿等資料送到使用者設定的 Worker URL。
// 成功回傳評分物件；任何失敗（未設定 URL、網路錯誤、非 2xx、格式不符）一律回傳 null，
// 由呼叫端 fallback 到本地 localScorer.js。
import { interviewScoreEndpoint, hasWorkerUrl } from '../core/apiConfig.js';

export { hasWorkerUrl };

export async function scoreWithOpenAI({ question, examinerBank, transcript, candidateName } = {}) {
  const endpoint = interviewScoreEndpoint();
  if (!endpoint) return null; // 未設定 Worker URL → 用本地評分
  if (!transcript || !transcript.trim()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000); // 30s 逾時保護
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question || {},
        examinerBank: examinerBank || {},
        transcript: String(transcript || ''),
        candidateName: candidateName || '王小姐',
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.score !== 'number') return null;
    // 正規化欄位，確保前端使用安全
    return {
      score: Math.max(0, Math.min(100, Math.round(data.score))),
      level: data.level || '',
      strengths: Array.isArray(data.strengths) ? data.strengths : [],
      missedPoints: Array.isArray(data.missedPoints) ? data.missedPoints : [],
      riskPoints: Array.isArray(data.riskPoints) ? data.riskPoints : [],
      suggestion: data.suggestion || '',
      revisedAnswer: data.revisedAnswer || '',
      followUpQuestion: data.followUpQuestion || '',
      committeeComment: data.committeeComment || '',
    };
  } catch (e) {
    clearTimeout(timer);
    console.warn('AI 委員評分失敗，改用本地評分', e);
    return null;
  }
}
