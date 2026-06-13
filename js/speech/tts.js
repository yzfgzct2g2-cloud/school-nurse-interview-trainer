// speech/tts.js — 朗讀抽象層
// v1：使用瀏覽器內建 SpeechSynthesis（iPhone 與桌機 Chrome 皆支援）。
// v2：可替換為雲端 TTS API，介面 speak() / cancel() / isSupported() 不變。

export function isSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices() || [];
  return (
    voices.find((v) => /zh[-_]?TW/i.test(v.lang)) ||
    voices.find((v) => /zh[-_]?(HK|Hant)/i.test(v.lang)) ||
    voices.find((v) => /^zh/i.test(v.lang)) ||
    null
  );
}

export function speak(text, { lang = 'zh-TW', rate = 1, onstart, onend } = {}) {
  if (!isSupported() || !text) return false;
  cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  const v = pickVoice();
  if (v) u.voice = v;
  if (onstart) u.onstart = onstart;
  if (onend) u.onend = onend;
  window.speechSynthesis.speak(u);
  return true;
}

export function cancel() {
  if (isSupported()) window.speechSynthesis.cancel();
}

export function isSpeaking() {
  return isSupported() && window.speechSynthesis.speaking;
}
