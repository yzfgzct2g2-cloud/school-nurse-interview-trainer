// workers/openai-interview-worker.js
// Cloudflare Worker：作為 OpenAI API 的後端代理。前端（GitHub Pages）只呼叫本 Worker，
// 絕不接觸 OpenAI API Key。金鑰只存在 Worker 環境變數 OPENAI_API_KEY（不得寫死於程式碼）。
//
// Endpoint：POST /api/interview-score
// 接收：{ question:{}, examinerBank:{}, transcript:"", candidateName:"王小姐" }
// 回傳：{ score, level, strengths[], missedPoints[], riskPoints[], suggestion,
//        revisedAnswer, followUpQuestion, committeeComment }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

function levelOf(score) {
  if (score >= 90) return '優秀';
  if (score >= 80) return '良好';
  if (score >= 70) return '尚可';
  if (score >= 60) return '需加強';
  return '需重新練習';
}

const SYSTEM_PROMPT = `你是一位台灣校護甄試口試委員。
你熟悉：校護工作、緊急傷病、傳染病防治、兒少保護、心理健康、家長溝通、健康促進、行政管理、校園實務情境。

請根據：1. 題目 2. 使用者逐字稿 3. 題庫標準答案 4. Examiner Bank 5. 加分重點 6. 容易失分，
給出符合口試委員角度的評分。

評分總分 100 分，請綜合以下面向：流程完整性、學生安全、專業判斷、溝通合作、後續追蹤、口試表達。
等級對應：90-100 優秀；80-89 良好；70-79 尚可；60-69 需加強；59 以下 需重新練習。

要求：
- 請用繁體中文，使用台灣校園語境。
- 不得空泛鼓勵；講評要具體、針對逐字稿內容。
- 不得編造法規；若不確定法規名稱，請用「依校內相關流程與主管機關規定」表述。
- 只輸出 JSON，不要輸出 markdown，不要加任何說明文字或程式碼框。

輸出 JSON 結構（鍵名固定）：
{
  "score": 數字0到100,
  "level": "優秀/良好/尚可/需加強/需重新練習",
  "strengths": ["優點..."],
  "missedPoints": ["缺少或可補強的重點..."],
  "riskPoints": ["可能失分或風險..."],
  "suggestion": "具體修正建議",
  "revisedAnswer": "一段修正版的示範回答",
  "followUpQuestion": "一個延伸追問",
  "committeeComment": "口試委員整體講評"
}`;

function buildUserPrompt({ question, examinerBank, transcript, candidateName }) {
  const q = question || {};
  const eb = examinerBank || {};
  const arr = (a) => (Array.isArray(a) ? a.map((x) => `- ${x}`).join('\n') : '');
  return `【考生】${candidateName || '王小姐'}

【題目】
${q.title || ''}

【題庫標準答案（完整）】
${q.original || ''}

【30 秒精簡答法】
${q.quickAnswer || ''}

【關鍵字】
${Array.isArray(q.keywords) ? q.keywords.join('、') : ''}

【委員真正想看（Examiner Bank）】
${eb.examinerWants || q.examinerWants || ''}

【加分重點】
${arr(eb.bonusPoints || q.bonusPoints)}

【容易失分】
${arr(eb.commonMistakes || q.commonMistakes)}

【可延伸追問參考】
${arr(eb.followups || (Array.isArray(q.followups) ? q.followups.map((f) => f.question) : []))}

【考生逐字稿（請依此評分）】
${transcript || '（考生未提供逐字稿）'}

請依上述資料，以口試委員角度評分並只輸出指定 JSON。`;
}

function normalize(parsed) {
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  const arr = (a) => (Array.isArray(a) ? a.map((x) => String(x)).filter(Boolean) : []);
  return {
    score,
    level: parsed.level || levelOf(score),
    strengths: arr(parsed.strengths),
    missedPoints: arr(parsed.missedPoints),
    riskPoints: arr(parsed.riskPoints),
    suggestion: parsed.suggestion ? String(parsed.suggestion) : '',
    revisedAnswer: parsed.revisedAnswer ? String(parsed.revisedAnswer) : '',
    followUpQuestion: parsed.followUpQuestion ? String(parsed.followUpQuestion) : '',
    committeeComment: parsed.committeeComment ? String(parsed.committeeComment) : '',
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    if (request.method !== 'POST' || !url.pathname.endsWith('/api/interview-score')) {
      return json({ error: 'Not found' }, 404);
    }
    if (!env || !env.OPENAI_API_KEY) {
      return json({ error: 'Server not configured: missing OPENAI_API_KEY' }, 500);
    }

    let body;
    try { body = await request.json(); } catch (_) { return json({ error: 'Invalid JSON body' }, 400); }

    const payload = {
      model: (env.OPENAI_MODEL || 'gpt-4o-mini'),
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(body || {}) },
      ],
    };

    let aiText = '';
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 300);
        return json({ error: 'OpenAI API error', detail }, 502);
      }
      const data = await r.json();
      aiText = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    } catch (e) {
      return json({ error: 'Upstream request failed' }, 502);
    }

    let parsed;
    try { parsed = JSON.parse(aiText); } catch (_) { return json({ error: 'AI returned non-JSON output' }, 502); }

    return json(normalize(parsed), 200);
  },
};
