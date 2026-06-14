// speech/stt.js — 語音轉逐字稿抽象層
// v1：偵測 Web Speech API。Chrome／Edge／Android 可用；iOS Safari 多半不支援，
//     此時 isSupported() 回傳 false，UI 應改走「手動輸入逐字稿」。
// v2：改接 Whisper API 補齊 iPhone 的語音辨識，介面不變。

import { transcribeWithWhisper } from './whisperAdapter.js';

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

// 即時語音辨識控制器：在使用者回答期間擷取逐字稿；stop() 回傳統一結果物件。
// 不支援時回傳 null（呼叫端 fallback 到手動輸入）。
export function startLiveTranscription({ lang = 'zh-TW' } = {}) {
  if (!isSupported()) return null;
  let finalText = '';
  let errored = false;
  let onEndCb = null;
  const ctl = createRecognizer({
    lang,
    onResult: (final) => { finalText = final; },
    onError: () => { errored = true; },
    onEnd: (txt) => { finalText = txt || finalText; if (onEndCb) onEndCb(); },
  });
  if (!ctl) return null;
  try { ctl.start(); } catch (_) { /* 啟動失敗：交由 stop() 回空字串 */ }

  return {
    stop() {
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve({ transcript: (finalText || '').trim(), provider: 'webspeech', confidence: null, raw: { errored } });
        };
        onEndCb = finish;
        try { ctl.stop(); } catch (_) { finish(); }
        setTimeout(finish, 1500); // 保險：onend 未觸發時仍結束
      });
    },
    abort() { try { ctl.abort(); } catch (_) {} },
  };
}

// 可抽換的「由錄音 Blob 產生逐字稿」介面。
// v1：Web Speech 無法處理 Blob，故此路徑委派 Whisper adapter（目前為 stub，會丟出錯誤）；
//     呼叫端應 try/catch 後 fallback 到即時辨識結果或手動輸入。未來接上 Whisper 時介面不變。
export async function transcribeAudio(audioBlob) {
  const raw = await transcribeWithWhisper(audioBlob); // stub：throw「尚未啟用」
  return { transcript: raw.text || '', provider: 'whisper', confidence: raw.confidence ?? null, raw };
}
