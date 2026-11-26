const crypto = require('crypto');
const { spawn } = require('child_process');
const axios = require('axios');
let MsEdgeTTS = null;
let OUTPUT_FORMAT = null;
try {
  ({ MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts'));
} catch (e) {
  console.warn('msedge-tts not available:', e.message);
}

// ==================== KNOWLEDGE BASE & MEMORY HELPERS ====================
function normalizeBunnyStore(data) {
  if (!data.bunny || typeof data.bunny !== 'object') {
    data.bunny = {};
  }
  if (!Array.isArray(data.bunny.knowledge)) {
    data.bunny.knowledge = [];
  }
  if (!data.bunny.aiConfig || typeof data.bunny.aiConfig !== 'object') {
    data.bunny.aiConfig = {};
  }
  data.bunny.aiConfig = {
    provider: data.bunny.aiConfig.provider || 'auto',
    geminiKey: data.bunny.aiConfig.geminiKey || '',
    openaiKey: data.bunny.aiConfig.openaiKey || '',
    groqKey: data.bunny.aiConfig.groqKey || '',
    voicePreset: data.bunny.aiConfig.voicePreset || 'cartoon',
    bunnyName: data.bunny.aiConfig.bunnyName || 'Quvonch',
    customPersona: data.bunny.aiConfig.customPersona || '',
  };
  return data.bunny;
}

function normalizeTextForSearch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ʻ’'`´]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const norm = normalizeTextForSearch(text);
  if (!norm) return [];
  const stop = new Set([
    'va', 'ham', 'bu', 'u', 'men', 'sen', 'biz', 'siz', 'ular', 'bilan', 'uchun',
    'haqida', 'nima', 'qanday', 'qayerda', 'kim', 'nechchi', 'necha', 'bor', 'yoq',
    'yo\'q', 'deb', 'edi', 'ekan', 'bir', 'har', 'juda', 'eng', 'ko\'p', 'oz', 'the', 'is', 'a', 'to', 'of', 'in', 'and',
    'и', 'в', 'на', 'с', 'что', 'как', 'это', 'для', 'или', 'но'
  ]);
  return norm.split(' ').filter((w) => w.length >= 2 && !stop.has(w));
}

function splitIntoChunks(text, maxChars = 650) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = '';

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      if (buf) {
        chunks.push(buf.trim());
        buf = '';
      }
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if ((buf + ' ' + s).trim().length > maxChars && buf) {
          chunks.push(buf.trim());
          buf = s;
        } else {
          buf = (buf ? buf + ' ' : '') + s;
        }
      }
      if (buf) {
        chunks.push(buf.trim());
        buf = '';
      }
    } else if ((buf + '\n\n' + para).trim().length > maxChars && buf) {
      chunks.push(buf.trim());
      buf = para;
    } else {
      buf = (buf ? buf + '\n\n' : '') + para;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

function retrieveRelevantKnowledge(knowledgeList, query, history = [], userId = '', maxItems = 10) {
  if (!Array.isArray(knowledgeList) || knowledgeList.length === 0) return [];

  const recentUserText = (Array.isArray(history) ? history : [])
    .filter((h) => h && h.role === 'user')
    .slice(-3)
    .map((h) => h.text || '')
    .join(' ');

  const queryTokens = tokenize(query + ' ' + recentUserText);
  const queryNorm = normalizeTextForSearch(query);

  const scored = knowledgeList.map((item, idx) => {
    const fullText = `${item.title || ''} ${item.content || ''}`;
    const itemNorm = normalizeTextForSearch(fullText);
    const itemTokens = new Set(tokenize(fullText));

    let score = 0;
    for (const qt of queryTokens) {
      if (itemTokens.has(qt)) {
        score += 4;
      } else if (qt.length >= 4 && itemNorm.includes(qt)) {
        score += 2.2;
      }
    }
    if (queryNorm.length >= 4 && itemNorm.includes(queryNorm)) {
      score += 8;
    }
    // Slight preference for user's own auto-learned memories and newest knowledge
    if (userId && item.userId && String(item.userId) === String(userId)) {
      score += 1.2;
    }
    if (item.source === 'learned') {
      score += 0.6;
    }
    // Recency nudge so very recently taught knowledge is remembered immediately
    const recency = idx / Math.max(1, knowledgeList.length);
    score += recency * 0.8;

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Always include top scored items; if query had few matches, still include latest core facts
  const selected = [];
  const seen = new Set();
  for (const s of scored) {
    if (selected.length >= maxItems) break;
    if (s.score >= 1.5 || selected.length < 5) {
      selected.push(s.item);
      seen.add(s.item.id);
    }
  }
  return selected;
}

// ==================== SYSTEM PROMPT & RESPONSE PARSER ====================
function buildBunnySystemPrompt({ bunnyName, userName, relevantKnowledge, totalKnowledgeCount, customPersona }) {
  const name = bunnyName || 'Quvonch';
  const kbBlock = relevantKnowledge.length > 0
    ? `\n\nSIZGA O'RGATILGAN BILIM VA XOTIRALAR (jami bazada ${totalKnowledgeCount} ta bilim bor; eng moslari quyida):\n` +
      relevantKnowledge
        .map((k, i) => `${i + 1}. ${k.title ? `[${k.title}] ` : ''}${k.content}`)
        .join('\n') +
      `\nMUHIM: Agar foydalanuvchi savoli yuqoridagi o'rgatilgan ma'lumotlarga tegishli bo'lsa, albatta shu aniq ma'lumotlarga tayangan holda javob ber!`
    : `\n\nHozircha senga maxsus bilim yuklanmagan, lekin sen umumiy sun'iy intellekt sifatida hamma mavzuda bilimli, aqlli va qiziqarli javob berasan.`;

  const extraPersona = customPersona ? `\nQo'shimcha xarakter ko'rsatmasi: ${customPersona}` : '';
  const userLine = userName ? `\nHozir gaplashayotgan foydalanuvchi ismi: ${userName}.` : '';

  return (
    `Sening isming ${name} — sen haqiqiy sun'iy intellekt bilan ishlaydigan, jonli, nihoyatda aqlli, quvnoq va mehribon multfilm quyonchasan! ` +
    `Foydalanuvchi sen bilan xuddi Gemini Live ovozli rejimidek jonli ovoz orqali suhbatlashyapti.\n\n` +
    `QOIDALAR:\n` +
    `1. Foydalanuvchi qaysi tilda gapirsa (asosan o'zbek tilida, kerak bo'lsa rus yoki ingliz tilida), o'sha tilda sof, tabiiy, chiroyli jonli nutqda javob ber.\n` +
    `2. Har qanday savolga (fan, texnologiya, dasturlash, tarix, matematika, maslahat, hayotiy suhbat, hazil, ijod) aniq, aqlli va foydali javob ber! Hech qachon mavzudan qochma yoki quruq shablon gap aytma.\n` +
    `3. Javobing OVOZDA o'qib eshittiriladi! Shuning uchun markdown belgilarini (*, **, #, -, \`, ro'yxat raqamlari) ISHLATMA. Oddiy, ravon, jonli gaplar bilan gapir. Odatda 2-4 ta mazmunli gap yetarli (foydalanuvchi batafsil tushuntir demasa).\n` +
    `4. Birinchi qatorda faqat bitta kayfiyat tegini yoz: [mood:happy] yoki [mood:curious] yoki [mood:excited] yoki [mood:laughing] yoki [mood:shy] yoki [mood:wise].\n` +
    `5. AVTOMATIK O'RGANISH: Agar foydalanuvchi senga yangi ma'lumot, fakt, qoida, o'zi haqida biror narsa (ismi, kasbi, qiziqishi, loyihasi, yoqtirgan narsasi) aytsa yoki "eslab qol / bilib ol / yozib qo'y / o'rgan" desa, javobingning ENG OXIRIDA alohida qatorda [LEARN: eslab qolinadigan qisqa aniq fakt] yoz! Oddiy savol-javobda [LEARN:] yozma, faqat yangi foydali ma'lumot/fakt berilganda yoz.` +
    extraPersona +
    userLine +
    kbBlock
  );
}

function parseAIResponse(rawText) {
  let text = String(rawText || '').trim();
  let mood = 'happy';
  const learned = [];

  const moodMatch = text.match(/\[mood:(happy|curious|excited|laughing|shy|wise|thinking)\]/i);
  if (moodMatch) {
    mood = moodMatch[1].toLowerCase();
    text = text.replace(moodMatch[0], '').trim();
  }

  const learnRegex = /\[LEARN:\s*([^\]]+)\]/gi;
  let m;
  while ((m = learnRegex.exec(text)) !== null) {
    const fact = m[1].trim();
    if (fact.length >= 4) learned.push(fact);
  }
  text = text.replace(learnRegex, '').trim();

  // Strip leftover markdown formatting so voice TTS sounds crisp and natural
  text = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { reply: text, mood, learned };
}

// ==================== MULTI-PROVIDER REAL AI CALLS ====================
async function callGemini(apiKey, systemPrompt, history, message, audioBase64 = null, audioMime = 'audio/webm') {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  const contents = (Array.isArray(history) ? history.slice(-12) : []).map((h) => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: String(h.text || '') }],
  }));

  const userParts = [];
  if (audioBase64) {
    userParts.push({ inlineData: { mimeType: audioMime || 'audio/webm', data: audioBase64 } });
    userParts.push({
      text: message
        ? message
        : "Foydalanuvchining ovozli savolini diqqat bilan tingla va javob ber. Javobing boshida foydalanuvchi nima deganini [HEARD: ...] ko'rinishida yoz, keyin [mood:...] va javobingni yoz.",
    });
  } else {
    userParts.push({ text: String(message || '') });
  }
  contents.push({ role: 'user', parts: userParts });

  let lastErr = null;
  for (const model of models) {
    try {
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.85, maxOutputTokens: 420 },
        },
        { timeout: 18000 }
      );
      const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { text, provider: `gemini:${model}` };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Gemini unavailable');
}

async function callOpenAICompatible({ url, apiKey, model, systemPrompt, history, message, timeout = 18000 }) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...(Array.isArray(history) ? history.slice(-12) : []).map((h) => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: String(h.text || ''),
    })),
    { role: 'user', content: String(message || '') },
  ];

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const r = await axios.post(
    url,
    {
      model,
      messages,
      temperature: 0.82,
      max_tokens: 420,
    },
    { headers, timeout }
  );

  const text = r.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty AI response');
  return text;
}

async function askBunnyAI({ message, history, userName, userId, bunnyStore, audioBase64, audioMime }) {
  const cfg = bunnyStore.aiConfig || {};
  const geminiKey = cfg.geminiKey || process.env.GEMINI_API_KEY || '';
  const groqKey = cfg.groqKey || process.env.GROQ_API_KEY || '';
  const openaiKey = cfg.openaiKey || process.env.OPENAI_API_KEY || '';

  const relevantKnowledge = retrieveRelevantKnowledge(
    bunnyStore.knowledge,
    message || '',
    history,
    userId,
    10
  );

  const systemPrompt = buildBunnySystemPrompt({
    bunnyName: cfg.bunnyName || 'Quvonch',
    userName,
    relevantKnowledge,
    totalKnowledgeCount: bunnyStore.knowledge.length,
    customPersona: cfg.customPersona || '',
  });

  // 1. Gemini (also handles direct audio input!)
  if (geminiKey && (cfg.provider === 'auto' || cfg.provider === 'gemini' || audioBase64)) {
    try {
      const res = await callGemini(geminiKey, systemPrompt, history, message, audioBase64, audioMime);
      let raw = res.text;
      let heard = '';
      const hm = raw.match(/\[HEARD:\s*([^\]]+)\]/i);
      if (hm) {
        heard = hm[1].trim();
        raw = raw.replace(hm[0], '').trim();
      }
      return { ...parseAIResponse(raw), provider: res.provider, heard, usedKnowledgeCount: relevantKnowledge.length };
    } catch (e) {
      console.warn('Gemini call failed:', e.response?.status || e.message);
    }
  }

  if (audioBase64 && !message) {
    return {
      reply: "Ovozni tushunish uchun brauzeringiz mikrofoni yoki Gemini API kaliti kerak bo'ladi. Keling, qaytadan aniqroq gapirib ko'ring!",
      mood: 'curious',
      learned: [],
      provider: 'audio-fallback',
      heard: '',
      usedKnowledgeCount: 0,
    };
  }

  // 2. Groq (ultra-fast Llama 3.3 70B)
  if (groqKey && (cfg.provider === 'auto' || cfg.provider === 'groq')) {
    try {
      const raw = await callOpenAICompatible({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: groqKey,
        model: 'llama-3.3-70b-versatile',
        systemPrompt,
        history,
        message,
        timeout: 14000,
      });
      return { ...parseAIResponse(raw), provider: 'groq:llama-3.3-70b', usedKnowledgeCount: relevantKnowledge.length };
    } catch (e) {
      console.warn('Groq call failed:', e.response?.status || e.message);
    }
  }

  // 3. OpenAI
  if (openaiKey && (cfg.provider === 'auto' || cfg.provider === 'openai')) {
    try {
      const raw = await callOpenAICompatible({
        url: 'https://api.openai.com/v1/chat/completions',
        apiKey: openaiKey,
        model: 'gpt-4o-mini',
        systemPrompt,
        history,
        message,
        timeout: 16000,
      });
      return { ...parseAIResponse(raw), provider: 'openai:gpt-4o-mini', usedKnowledgeCount: relevantKnowledge.length };
    } catch (e) {
      console.warn('OpenAI call failed:', e.response?.status || e.message);
    }
  }

  // 4. Built-in FREE Real AI (Pollinations OpenAI-compatible gateway — works out of the box!)
  const freeModels = ['openai', 'openai-fast', 'mistral'];
  for (let i = 0; i < freeModels.length; i++) {
    const model = freeModels[i];
    try {
      const raw = await callOpenAICompatible({
        url: 'https://text.pollinations.ai/openai',
        apiKey: '',
        model,
        systemPrompt,
        history,
        message,
        timeout: 22000,
      });
      return { ...parseAIResponse(raw), provider: `ai:${model}`, usedKnowledgeCount: relevantKnowledge.length };
    } catch (e) {
      console.warn(`Free AI (${model}) failed:`, e.response?.status || e.message);
      if (i === 0) await new Promise((r) => setTimeout(r, 900));
    }
  }

  // 5. Smart fallback: still extract explicit teaching & answer from Knowledge Base if free gateway is busy
  const cleanMsg = String(message || '').trim();
  const teachMatch = cleanMsg.match(/(?:eslab qol|esingda tut|bilib ol|yozib qo['‘’]?y|o['‘’]?rgan(?:ib ol)?)\s*[,:\-–]?\s*(.+)/i);
  if (teachMatch && teachMatch[1] && teachMatch[1].trim().length >= 4) {
    const fact = teachMatch[1].trim();
    return {
      reply: `Albatta! Buni xotiramga mahkam saqlab qo'ydim: ${fact}. Endi buni har doim eslab turaman!`,
      mood: 'excited',
      learned: [fact],
      provider: 'kb-learn',
      usedKnowledgeCount: relevantKnowledge.length,
    };
  }
  if (relevantKnowledge.length > 0 && cleanMsg) {
    const top = relevantKnowledge[0];
    const qTokens = tokenize(cleanMsg);
    const kNorm = normalizeTextForSearch(`${top.title || ''} ${top.content || ''}`);
    const hits = qTokens.filter((t) => kNorm.includes(t)).length;
    if (hits >= 1) {
      return {
        reply: `Menga o'rgatgan bilimingiz bo'yicha aytsam: ${top.content}`,
        mood: 'wise',
        learned: [],
        provider: 'kb-direct',
        usedKnowledgeCount: 1,
      };
    }
  }

  return {
    reply: "Hozir bepul sun'iy intellekt serveri biroz band bo'lib qoldi. Bir necha soniyadan keyin qayta so'rang yoki Sozlamalar bo'limiga bepul Gemini API kalitini kiriting!",
    mood: 'curious',
    learned: [],
    provider: 'fallback',
    usedKnowledgeCount: 0,
  };
}

// ==================== CARTOON VOICE TTS STUDIO ====================
const ttsCache = new Map();
const TTS_CACHE_MAX = 40;

function cleanTextForSpeech(text) {
  return String(text || '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .replace(/[*_`#~<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 650);
}

function detectSpeechVoice(text, preset) {
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const uzMarkers = /(o'|g'|sh|ch|man\b|san\b|miz\b|siz\b|ning\b|dagi\b|salom|qanday|yaxshi|rahmat|quvonch|quyon)/i.test(text);

  if (cyrillic > latin && cyrillic > 4) {
    return preset === 'sardor' ? 'ru-RU-DmitryNeural' : 'ru-RU-SvetlanaNeural';
  }
  if (!uzMarkers && latin > 12 && /\b(the|and|you|what|how|hello|bunny|is|are)\b/i.test(text)) {
    return 'en-US-AnaNeural'; // Built-in cute cartoon child voice in English!
  }
  return preset === 'sardor' ? 'uz-UZ-SardorNeural' : 'uz-UZ-MadinaNeural';
}

const VOICE_PRESETS = {
  cartoon: {
    // Pixar / Multfilm Quyoncha: bright, lively, adorable, crystal-clear Uzbek!
    pitch: '+14Hz',
    rate: '+4%',
    ffmpegFilter: 'asetrate=24000*1.20,aresample=24000,atempo=0.87,equalizer=f=3000:t=q:w=1.2:g=3,acompressor=threshold=-16dB:ratio=2.5',
  },
  pixar: {
    // Shirin Ertak Quyonchasi: warmer, sweeter, animated character feel
    pitch: '+22Hz',
    rate: '+2%',
    ffmpegFilter: 'asetrate=24000*1.13,aresample=24000,atempo=0.90,equalizer=f=2600:t=q:w=1.4:g=2.5,acompressor=threshold=-16dB:ratio=2.2',
  },
  sardor: {
    // Quvnoq Do'st: energetic cartoon boy bunny
    pitch: '+20Hz',
    rate: '+5%',
    ffmpegFilter: 'asetrate=24000*1.23,aresample=24000,atempo=0.85,equalizer=f=2800:t=q:w=1.2:g=2.5,acompressor=threshold=-16dB:ratio=2.5',
  },
  natural: {
    // Pure natural Uzbek neural voice (minimal touch)
    pitch: '+6Hz',
    rate: '+3%',
    ffmpegFilter: '',
  },
};

function runFfmpegAudioFilter(ffmpegPath, inputBuf, filterStr) {
  return new Promise((resolve) => {
    if (!filterStr || !ffmpegPath) return resolve(inputBuf);
    let proc;
    try {
      proc = spawn(ffmpegPath, [
        '-loglevel', 'error',
        '-i', 'pipe:0',
        '-af', filterStr,
        '-f', 'mp3',
        '-b:a', '64k',
        'pipe:1',
      ]);
    } catch (e) {
      return resolve(inputBuf);
    }
    const chunks = [];
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (e) {}
      resolve(inputBuf);
    }, 12000);

    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', () => {});
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(inputBuf);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks);
      if (code === 0 && out.length > 512) resolve(out);
      else resolve(inputBuf);
    });
    proc.stdin.on('error', () => {});
    proc.stdin.end(inputBuf);
  });
}

async function synthesizeEdgeRaw(text, voice, { pitch, rate }) {
  if (!MsEdgeTTS) throw new Error('msedge-tts not installed');
  return new Promise(async (resolve, reject) => {
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 9000, synthesisTimeoutMs: 15000 });
    const timer = setTimeout(() => {
      try { tts.close(); } catch (e) {}
      reject(new Error('Edge TTS timeout'));
    }, 15000);
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text, { pitch, rate });
      const chunks = [];
      audioStream.on('data', (c) => chunks.push(c));
      audioStream.on('end', () => {
        clearTimeout(timer);
        try { tts.close(); } catch (e) {}
        const buf = Buffer.concat(chunks);
        if (buf.length > 200) resolve(buf);
        else reject(new Error('Empty TTS audio'));
      });
      audioStream.on('error', (err) => {
        clearTimeout(timer);
        try { tts.close(); } catch (e) {}
        reject(err);
      });
    } catch (err) {
      clearTimeout(timer);
      try { tts.close(); } catch (e) {}
      reject(err);
    }
  });
}

async function synthesizeCartoonVoice(rawText, presetName = 'cartoon', ffmpegPath = 'ffmpeg') {
  const clean = cleanTextForSpeech(rawText);
  if (!clean) throw new Error('Empty speech text');

  const presetKey = VOICE_PRESETS[presetName] ? presetName : 'cartoon';
  const preset = VOICE_PRESETS[presetKey];
  const voice = detectSpeechVoice(clean, presetKey);

  const cacheKey = crypto.createHash('sha1').update(`${voice}|${presetKey}|${clean}`).digest('hex');
  if (ttsCache.has(cacheKey)) {
    return ttsCache.get(cacheKey);
  }

  const rawMp3 = await synthesizeEdgeRaw(clean, voice, { pitch: preset.pitch, rate: preset.rate });

  // English AnaNeural is already cartoon-child pitched; keep milder shift for Ana
  const filter = voice === 'en-US-AnaNeural'
    ? (presetKey === 'natural' ? '' : 'asetrate=24000*1.08,aresample=24000,atempo=0.94')
    : preset.ffmpegFilter;

  const finalMp3 = await runFfmpegAudioFilter(ffmpegPath, rawMp3, filter);

  if (ttsCache.size >= TTS_CACHE_MAX) {
    const firstKey = ttsCache.keys().next().value;
    ttsCache.delete(firstKey);
  }
  ttsCache.set(cacheKey, finalMp3);
  return finalMp3;
}

// ==================== EXPRESS ROUTES REGISTRATION ====================
function registerBunnyRoutes(app, { loadData, saveData, ffmpegPath, OWNER_ADMIN_ID }) {
  const getBunny = () => normalizeBunnyStore(loadData());

  const addKnowledgeItems = (title, content, source = 'manual', userId = '') => {
    const data = loadData();
    const bunny = normalizeBunnyStore(data);
    const chunks = splitIntoChunks(content, 650);
    const added = [];
    const now = Math.floor(Date.now() / 1000);

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      // Prevent exact duplicates
      const normNew = normalizeTextForSearch(chunkText);
      const dup = bunny.knowledge.find((k) => normalizeTextForSearch(k.content) === normNew);
      if (dup) continue;

      const item = {
        id: crypto.randomBytes(5).toString('hex'),
        title: chunks.length > 1
          ? `${title || 'Bilim'} (${i + 1}/${chunks.length})`
          : (title || ''),
        content: chunkText,
        source,
        userId: String(userId || ''),
        createdAt: now,
      };
      bunny.knowledge.push(item);
      added.push(item);
    }

    // Keep up to 1000 knowledge chunks cleanly
    if (bunny.knowledge.length > 1000) {
      bunny.knowledge = bunny.knowledge.slice(-1000);
    }
    if (added.length > 0) saveData(data);
    return { added, total: bunny.knowledge.length };
  };

  // 1. Live AI Chat Endpoint (with RAG knowledge + automatic learning!)
  app.post('/api/bunny-chat', async (req, res) => {
    try {
      const { message = '', history = [], userName = '', userId = '', audioBase64 = '', audioMime = '' } = req.body || {};
      const cleanMsg = String(message || '').trim();
      if (!cleanMsg && !audioBase64) {
        return res.json({
          ok: true,
          mood: 'happy',
          reply: "Salom! Quloqlarim senda — menga istalgan savol berishing yoki yangi bilim o'rgatishing mumkin!",
          learned: [],
          knowledgeCount: getBunny().knowledge.length,
        });
      }

      const bunny = getBunny();
      const aiRes = await askBunnyAI({
        message: cleanMsg,
        history,
        userName,
        userId,
        bunnyStore: bunny,
        audioBase64: audioBase64 || null,
        audioMime,
      });

      const savedLearned = [];
      if (Array.isArray(aiRes.learned) && aiRes.learned.length > 0) {
        for (const fact of aiRes.learned.slice(0, 3)) {
          const r = addKnowledgeItems('Suhbatdan o‘rganilgan', fact, 'learned', userId);
          if (r.added.length > 0) savedLearned.push(fact);
        }
      }

      const freshBunny = getBunny();
      return res.json({
        ok: true,
        reply: aiRes.reply,
        mood: aiRes.mood || 'happy',
        heard: aiRes.heard || cleanMsg,
        provider: aiRes.provider || 'ai',
        learned: savedLearned,
        usedKnowledgeCount: aiRes.usedKnowledgeCount || 0,
        knowledgeCount: freshBunny.knowledge.length,
      });
    } catch (err) {
      console.error('/api/bunny-chat error:', err.message);
      return res.json({
        ok: true,
        mood: 'curious',
        reply: "Voy, aloqa bir lahza uzilib qoldi! Yana bir marta aytib ko'r-chi, quloqlarim senda!",
        learned: [],
        knowledgeCount: getBunny().knowledge.length,
      });
    }
  });

  // 2. Cartoon Voice Neural TTS Endpoint
  app.post('/api/bunny-tts', async (req, res) => {
    try {
      const { text = '', preset = '' } = req.body || {};
      const bunny = getBunny();
      const usePreset = preset || bunny.aiConfig.voicePreset || 'cartoon';
      const mp3 = await synthesizeCartoonVoice(text, usePreset, ffmpegPath);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(mp3);
    } catch (err) {
      console.warn('/api/bunny-tts error:', err.message);
      return res.status(503).json({ ok: false, error: err.message });
    }
  });

  // 3. Knowledge Base — List & Status
  app.get('/api/bunny-knowledge', (req, res) => {
    const bunny = getBunny();
    const cfg = bunny.aiConfig;
    const hasGemini = Boolean(cfg.geminiKey || process.env.GEMINI_API_KEY);
    const hasGroq = Boolean(cfg.groqKey || process.env.GROQ_API_KEY);
    const hasOpenai = Boolean(cfg.openaiKey || process.env.OPENAI_API_KEY);
    res.json({
      ok: true,
      total: bunny.knowledge.length,
      items: bunny.knowledge.slice().reverse().slice(0, 200),
      config: {
        provider: cfg.provider,
        voicePreset: cfg.voicePreset,
        bunnyName: cfg.bunnyName,
        customPersona: cfg.customPersona,
        hasGemini,
        hasGroq,
        hasOpenai,
      },
    });
  });

  // 4. Knowledge Base — Add new knowledge (text, notes, uploaded file content)
  app.post('/api/bunny-knowledge', (req, res) => {
    const { title = '', content = '', source = 'manual', userId = '' } = req.body || {};
    const clean = String(content || '').trim();
    if (clean.length < 2) {
      return res.status(400).json({ ok: false, error: "Ma'lumot matni bo'sh bo'lmasligi kerak" });
    }
    const result = addKnowledgeItems(String(title || '').trim().slice(0, 80), clean.slice(0, 40000), source, userId);
    res.json({ ok: true, addedCount: result.added.length, total: result.total, items: result.added });
  });

  // 5. Knowledge Base — Delete item
  app.delete('/api/bunny-knowledge/:id', (req, res) => {
    const id = String(req.params.id || '').trim();
    const data = loadData();
    const bunny = normalizeBunnyStore(data);
    const before = bunny.knowledge.length;
    bunny.knowledge = bunny.knowledge.filter((k) => k.id !== id);
    if (bunny.knowledge.length !== before) saveData(data);
    res.json({ ok: true, total: bunny.knowledge.length });
  });

  // 6. Bunny AI & Voice Settings
  app.post('/api/bunny-settings', (req, res) => {
    const body = req.body || {};
    const data = loadData();
    const bunny = normalizeBunnyStore(data);
    const cfg = bunny.aiConfig;

    if (typeof body.voicePreset === 'string' && VOICE_PRESETS[body.voicePreset]) {
      cfg.voicePreset = body.voicePreset;
    }
    if (typeof body.bunnyName === 'string' && body.bunnyName.trim()) {
      cfg.bunnyName = body.bunnyName.trim().slice(0, 32);
    }
    if (typeof body.customPersona === 'string') {
      cfg.customPersona = body.customPersona.trim().slice(0, 600);
    }
    if (typeof body.provider === 'string' && ['auto', 'gemini', 'groq', 'openai', 'free'].includes(body.provider)) {
      cfg.provider = body.provider;
    }
    // Optional API keys (only update if explicitly provided)
    if (typeof body.geminiKey === 'string') {
      cfg.geminiKey = body.geminiKey.trim();
    }
    if (typeof body.groqKey === 'string') {
      cfg.groqKey = body.groqKey.trim();
    }
    if (typeof body.openaiKey === 'string') {
      cfg.openaiKey = body.openaiKey.trim();
    }

    saveData(data);
    res.json({
      ok: true,
      config: {
        provider: cfg.provider,
        voicePreset: cfg.voicePreset,
        bunnyName: cfg.bunnyName,
        customPersona: cfg.customPersona,
        hasGemini: Boolean(cfg.geminiKey || process.env.GEMINI_API_KEY),
        hasGroq: Boolean(cfg.groqKey || process.env.GROQ_API_KEY),
        hasOpenai: Boolean(cfg.openaiKey || process.env.OPENAI_API_KEY),
      },
    });
  });

  return { addKnowledgeItems, getBunny };
}

module.exports = {
  normalizeBunnyStore,
  registerBunnyRoutes,
  synthesizeCartoonVoice,
};
