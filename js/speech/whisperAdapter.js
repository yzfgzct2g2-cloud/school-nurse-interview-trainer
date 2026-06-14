// speech/whisperAdapter.js — Whisper API 介面預留（stub）
// 本次不實作真正的 Whisper / OpenAI 呼叫，也「不」在前端放任何 API Key。
// 未來若要啟用，應透過自有後端代理呼叫 OpenAI，前端只呼叫自家後端，避免金鑰外洩。
// 介面：transcribeWithWhisper(audioBlob) → { text, confidence, raw }
export const whisperEnabled = false;

export async function transcribeWithWhisper(audioBlob) { // eslint-disable-line no-unused-vars
  throw new Error('Whisper API 尚未啟用');
}
