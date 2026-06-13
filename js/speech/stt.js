// speech/stt.js — 語音轉逐字稿抽象層
// v1：偵測 Web Speech API。Chrome／Edge／Android 可用；iOS Safari 多半不支援，
//     此時 isSupported() 回傳 false，UI 應改走「手動輸入逐字稿」。
// v2：改接 Whisper API 補齊 iPhone 的語音辨識，介面不變。

const SR = (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition);

export function isSupported() {
  return !!SR;
}

// 建立一個辨識器控制器；不支援時回傳 null（呼叫端據此 fallback 到手動輸入）。
export function createRecognizer({ lang = 'zh-TW', onResult, onError, onEnd } = {}) {
  if (!SR) return null;
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = true;
  let finalText = '';

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const seg = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += seg;
      else interim += seg;
    }
    if (onResult) onResult(finalText, interim);
  };
  rec.onerror = (e) => { if (onError) onError(e); };
  rec.onend = () => { if (onEnd) onEnd(finalText); };

  return {
    start: () => rec.start(),
    stop: () => rec.stop(),
    abort: () => rec.abort(),
    getText: () => finalText,
  };
}
