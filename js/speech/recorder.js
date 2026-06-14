// speech/recorder.js — 錄音抽象層（v1：瀏覽器內建 MediaRecorder，不接外部 API）
// 介面：recorderSupported() / startRecording() → controller{ stop():Promise<{blob,mimeType,durationSec}>, cancel() }

export function recorderSupported() {
  return typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function pickMimeType() {
  const prefs = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
    for (const t of prefs) { if (MediaRecorder.isTypeSupported(t)) return t; }
  }
  return '';
}

// 需在使用者手勢（按鈕）中呼叫；會向使用者要求麥克風權限。
export async function startRecording() {
  if (!recorderSupported()) throw new Error('MediaRecorder 不支援');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  let mr;
  try {
    mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch (_) {
    mr = new MediaRecorder(stream); // 退回預設格式
  }
  const chunks = [];
  const startedAt = Date.now();
  mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.start();

  const cleanup = () => { try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {} };

  return {
    stop() {
      return new Promise((resolve) => {
        const finish = () => {
          const type = (mr && mr.mimeType) || mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type });
          cleanup();
          resolve({ blob, mimeType: type, durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)) });
        };
        mr.onstop = finish;
        if (mr.state !== 'inactive') mr.stop(); else finish();
      });
    },
    cancel() {
      try { if (mr.state !== 'inactive') mr.stop(); } catch (_) {}
      cleanup();
    },
  };
}
