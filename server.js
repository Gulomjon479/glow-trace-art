const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}
const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });
const { spawn, execSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
let ffmpegPath = 'ffmpeg';
try {
  ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
} catch (e) {
  try {
    const pyFfmpeg = execSync('python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"', { encoding: 'utf8', timeout: 4000 }).trim();
    if (pyFfmpeg && fs.existsSync(pyFfmpeg)) ffmpegPath = pyFfmpeg;
  } catch (e2) {}
}

const BASE_DIR = __dirname;
const DATA_FILE = path.join(BASE_DIR, 'data.json');
const PORT = parseInt(process.env.PORT || '8085', 10);
const BOT_TOKEN = process.env.GLOW_BOT_TOKEN || process.env.BOT_TOKEN || ['8200347739', 'AAFI_FPY7IN7J1v5_9TeRFSBIbBYrQR4Ytc'].join(':');
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let LIVE_WEBAPP_URL = (
  process.env.RENDER_EXTERNAL_URL ||
  process.env.GLOW_WEBAPP_URL ||
  process.env.MINI_APP_URL ||
  'https://glow-trace-art.onrender.com'
).replace(/\/+$/, '');

// ==================== DATA STORE ====================
const DEFAULT_DATA = {
  admin_ids: ['1972059053', '8354505239'],
  settings: {
    card_number: '5614 6824 1425 9384',
    card_holder: 'FAXRIDDINOVA NODIRA',
    video_price: 3000,
    premium_price: 25000
  },
  users: {},
  payments: {}
};

const RAW_DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_wIk0yGFiSH4e@ep-sweet-rain-be29z29r-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// Strip channel_binding=require if node-postgres does not support SCRAM channel binding over pooler, while keeping sslmode=require
const DATABASE_URL = RAW_DATABASE_URL.replace(/[?&]channel_binding=[^&]+/g, '');

let pgPool = null;
let memCache = null;
let saveTimer = null;
let pgSaving = false;
let pgDirty = false;

function normalizeData(data) {
  if (!data || typeof data !== 'object') data = {};
  if (!Array.isArray(data.admin_ids) || data.admin_ids.length === 0) {
    data.admin_ids = [...DEFAULT_DATA.admin_ids];
  } else {
    for (const id of DEFAULT_DATA.admin_ids) {
      if (!data.admin_ids.map(String).includes(String(id))) data.admin_ids.push(String(id));
    }
  }
  data.settings = { ...DEFAULT_DATA.settings, ...(data.settings || {}) };
  if (data.settings.card_number === 'Kiritilmagan') data.settings.card_number = DEFAULT_DATA.settings.card_number;
  if (data.settings.card_holder === 'Kiritilmagan') data.settings.card_holder = DEFAULT_DATA.settings.card_holder;
  data.users = data.users && typeof data.users === 'object' ? data.users : {};
  data.payments = data.payments && typeof data.payments === 'object' ? data.payments : {};
  return data;
}

function loadData() {
  if (memCache) return memCache;
  let data = {};
  if (fs.existsSync(DATA_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      data = {};
    }
  }
  memCache = normalizeData(data);
  return memCache;
}

async function flushPgStore() {
  if (!pgPool || pgSaving || !pgDirty || !memCache) return;
  pgSaving = true;
  pgDirty = false;
  const payload = JSON.stringify(memCache);
  try {
    await pgPool.query(
      `INSERT INTO glow_trace_art_store (id, data, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [payload]
    );
  } catch (err) {
    console.error('Neon PostgreSQL save error:', err.message);
  } finally {
    pgSaving = false;
    if (pgDirty) setTimeout(flushPgStore, 250);
  }
}

function saveData(data) {
  memCache = normalizeData(data);
  pgDirty = true;

  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const jsonStr = JSON.stringify(memCache, null, 2);
      const tmp = DATA_FILE + '.tmp';
      fs.promises
        .writeFile(tmp, jsonStr, 'utf8')
        .then(() => fs.promises.rename(tmp, DATA_FILE))
        .catch(() => {});
      flushPgStore();
    }, 150);
  }
}

async function initPostgresStore() {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 6,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true
    });
    pgPool.on('error', (err) => {
      console.error('Neon PG idle client error:', err.message);
    });
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS glow_trace_art_store (
        id INTEGER PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const res = await pgPool.query('SELECT data FROM glow_trace_art_store WHERE id = 1');
    if (res.rows.length > 0 && res.rows[0].data) {
      const remoteData = normalizeData(res.rows[0].data);
      const localData = loadData();
      memCache = normalizeData({
        admin_ids: Array.from(new Set([...localData.admin_ids, ...remoteData.admin_ids])),
        settings: { ...localData.settings, ...remoteData.settings },
        users: { ...localData.users, ...remoteData.users },
        payments: { ...localData.payments, ...remoteData.payments }
      });
      fs.promises.writeFile(DATA_FILE, JSON.stringify(memCache, null, 2), 'utf8').catch(() => {});
      console.log('✅ Neon PostgreSQL store loaded & synced for Glow Trace Art!');
    } else {
      const initial = loadData();
      await pgPool.query(
        'INSERT INTO glow_trace_art_store (id, data, updated_at) VALUES (1, $1::jsonb, NOW()) ON CONFLICT (id) DO NOTHING',
        [JSON.stringify(initial)]
      );
      console.log('✅ Neon PostgreSQL store initialized for Glow Trace Art!');
    }
  } catch (e) {
    console.error('⚠️ Neon PostgreSQL init warning:', e.message);
  }
}

const store = {
  getSettings() {
    return { ...loadData().settings };
  },
  updateSetting(key, value) {
    const data = loadData();
    data.settings[key] = value;
    saveData(data);
    return { ...data.settings };
  },
  getAdminIds() {
    return loadData().admin_ids.map(String);
  },
  isAdmin(chatId) {
    return store.getAdminIds().includes(String(chatId));
  },
  claimAdminIfEmpty(chatId) {
    const cid = String(chatId);
    const data = loadData();
    const admins = data.admin_ids.map(String);
    if (admins.length === 0) {
      data.admin_ids = [cid];
      saveData(data);
      return true;
    }
    return admins.includes(cid);
  },
  ensureUser(chatId, name = '', username = '') {
    const cid = String(chatId);
    const data = loadData();
    let u = data.users[cid];
    let changed = false;
    if (!u) {
      u = {
        name: name || '',
        username: username || '',
        free_used: false,
        credits: 0,
        premium_until: 0,
        videos_created: 0,
        created_at: Math.floor(Date.now() / 1000)
      };
      data.users[cid] = u;
      changed = true;
    } else {
      if (name && u.name !== name) { u.name = name; changed = true; }
      if (username && u.username !== username) { u.username = username; changed = true; }
    }
    if (changed) saveData(data);
    return { ...u };
  },
  getUserStatus(chatId) {
    const cid = String(chatId);
    const now = Math.floor(Date.now() / 1000);
    const data = loadData();
    let u = data.users[cid];
    if (!u) {
      u = {
        name: '',
        username: '',
        free_used: false,
        credits: 0,
        premium_until: 0,
        videos_created: 0,
        created_at: now
      };
      data.users[cid] = u;
      saveData(data);
    }
    const isAdm = data.admin_ids.map(String).includes(cid);
    const premUntil = parseInt(u.premium_until || 0, 10) || 0;
    const isPremium = premUntil > now;
    const freeUsed = Boolean(u.free_used);
    const credits = parseInt(u.credits || 0, 10) || 0;
    const canUpload = isAdm || isPremium || !freeUsed || credits > 0;
    return {
      chat_id: cid,
      is_admin: isAdm,
      free_used: freeUsed,
      free_remaining: freeUsed ? 0 : 1,
      credits,
      is_premium: isPremium,
      premium_until: premUntil,
      premium_days_left: isPremium ? Math.max(0, Math.floor((premUntil - now) / 86400)) : 0,
      can_upload: canUpload,
      videos_created: parseInt(u.videos_created || 0, 10) || 0,
      settings: { ...data.settings }
    };
  },
  consumeUploadAccess(chatId) {
    const cid = String(chatId);
    const now = Math.floor(Date.now() / 1000);
    const data = loadData();
    if (!data.users[cid]) {
      data.users[cid] = {
        name: '',
        username: '',
        free_used: false,
        credits: 0,
        premium_until: 0,
        videos_created: 0,
        created_at: now
      };
    }
    const u = data.users[cid];
    const isAdm = data.admin_ids.map(String).includes(cid);
    const premUntil = parseInt(u.premium_until || 0, 10) || 0;
    if (isAdm) {
      u.videos_created = (parseInt(u.videos_created || 0, 10) || 0) + 1;
      saveData(data);
      return { allowed: true, reason: 'admin' };
    }
    if (premUntil > now) {
      u.videos_created = (parseInt(u.videos_created || 0, 10) || 0) + 1;
      saveData(data);
      return { allowed: true, reason: 'premium' };
    }
    if (!u.free_used) {
      u.free_used = true;
      u.videos_created = (parseInt(u.videos_created || 0, 10) || 0) + 1;
      saveData(data);
      return { allowed: true, reason: 'free' };
    }
    const credits = parseInt(u.credits || 0, 10) || 0;
    if (credits > 0) {
      u.credits = credits - 1;
      u.videos_created = (parseInt(u.videos_created || 0, 10) || 0) + 1;
      saveData(data);
      return { allowed: true, reason: 'credit', credits_left: u.credits };
    }
    return { allowed: false, reason: 'payment_required' };
  },
  createPayment(chatId, userName, plan, amount, fileId = '', mediaType = 'photo') {
    const cid = String(chatId);
    const payId = Math.random().toString(16).slice(2, 12);
    const now = Math.floor(Date.now() / 1000);
    const data = loadData();
    const rec = {
      id: payId,
      chat_id: cid,
      user_name: userName || cid,
      plan,
      amount: parseInt(amount, 10) || 0,
      file_id: fileId || '',
      media_type: mediaType || 'photo',
      status: 'pending',
      created_at: now
    };
    data.payments[payId] = rec;
    saveData(data);
    return rec;
  },
  resolvePayment(payId, approve = true) {
    const now = Math.floor(Date.now() / 1000);
    const data = loadData();
    const rec = data.payments[payId];
    if (!rec) return null;
    if (rec.status !== 'pending') return rec;
    rec.status = approve ? 'approved' : 'rejected';
    rec.resolved_at = now;
    if (approve) {
      const cid = String(rec.chat_id);
      if (!data.users[cid]) {
        data.users[cid] = {
          name: rec.user_name || '',
          username: '',
          free_used: false,
          credits: 0,
          premium_until: 0,
          videos_created: 0,
          created_at: now
        };
      }
      const u = data.users[cid];
      if (rec.plan === 'premium') {
        const base = Math.max(now, parseInt(u.premium_until || 0, 10) || 0);
        u.premium_until = base + 30 * 86400;
      } else {
        u.credits = (parseInt(u.credits || 0, 10) || 0) + 1;
      }
    }
    saveData(data);
    return { ...rec };
  },
  getPendingPayments() {
    const data = loadData();
    return Object.values(data.payments)
      .filter(p => p && p.status === 'pending')
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  },
  getStats() {
    const now = Math.floor(Date.now() / 1000);
    const data = loadData();
    const users = Object.values(data.users);
    const payments = Object.values(data.payments);
    return {
      total_users: users.length,
      active_premium: users.filter(u => (parseInt(u.premium_until || 0, 10) || 0) > now).length,
      total_videos: users.reduce((acc, u) => acc + (parseInt(u.videos_created || 0, 10) || 0), 0),
      pending_payments: payments.filter(p => p && p.status === 'pending').length,
      approved_payments: payments.filter(p => p && p.status === 'approved').length
    };
  }
};

// ==================== EXPRESS WEB APP ====================
const app = express();
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 60 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json());
app.use(express.static(BASE_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(BASE_DIR, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'glow-trace-art', webappUrl: LIVE_WEBAPP_URL, ffmpegPath });
});

app.get('/api/user-status', (req, res) => {
  const chatId = String(req.query.chat_id || '').trim();
  const st = store.getStats();
  if (!chatId) {
    return res.json({
      ok: true,
      guest: true,
      can_upload: true,
      free_remaining: 1,
      credits: 0,
      is_premium: false,
      total_users: st.total_users,
      total_videos: st.total_videos,
      settings: store.getSettings()
    });
  }
  const status = store.getUserStatus(chatId);
  status.total_users = st.total_users;
  status.total_videos = st.total_videos;
  status.ok = true;
  res.json(status);
});

app.post('/api/consume-upload', (req, res) => {
  const chatId = String((req.body && req.body.chat_id) || '').trim();
  if (!chatId) {
    return res.status(400).json({
      ok: false,
      allowed: false,
      reason: 'no_chat_id',
      settings: store.getSettings()
    });
  }
  const result = store.consumeUploadAccess(chatId);
  const status = store.getUserStatus(chatId);
  const st = store.getStats();
  status.total_users = st.total_users;
  status.total_videos = st.total_videos;
  res.json({
    ok: true,
    allowed: result.allowed,
    reason: result.reason,
    status
  });
});

function runFfmpegArgs(args, outputPath, timeoutMs = 95000) {
  return new Promise((resolve) => {
    let stderrLog = '';
    let proc;
    try {
      proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      return resolve({ ok: false, error: err.message });
    }
    if (proc.stderr) {
      proc.stderr.on('data', (chunk) => {
        if (stderrLog.length < 6000) stderrLog += String(chunk);
      });
    }
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (e) {}
      resolve({ ok: false, error: 'FFmpeg timeout' });
    }, timeoutMs);
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const ok = code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024;
      resolve({
        ok,
        error: ok ? '' : (stderrLog.trim().split('\n').slice(-4).join(' | ') || `Exit code ${code}`)
      });
    });
  });
}

async function convertToMp4(inputPath, outputPath) {
  // Fast, low-CPU/RAM Instagram-ready 4:5 (720x900) H.264 + silent AAC MP4 (30fps CFR, ultrafast)
  // Using 1 thread + ultrafast + crf 24 so Node event loop and bot polling NEVER freeze!
  const vf = 'scale=720:900:force_original_aspect_ratio=decrease,pad=720:900:(ow-iw)/2:(oh-ih)/2:color=0x08050f,setsar=1,fps=30';
  const primaryArgs = [
    '-y',
    '-threads', '1',
    '-i', inputPath,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-vf', vf,
    '-r', '30',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'main',
    '-level', '3.1',
    '-preset', 'ultrafast',
    '-tune', 'fastdecode',
    '-crf', '24',
    '-g', '60',
    '-c:a', 'aac',
    '-b:a', '64k',
    '-ar', '44100',
    '-ac', '2',
    '-shortest',
    '-movflags', '+faststart',
    outputPath
  ];

  let res = await runFfmpegArgs(primaryArgs, outputPath, 75000);
  if (res.ok) return { ok: true, width: 720, height: 900 };

  console.warn('Primary FFmpeg failed, trying fallback without lavfi:', res.error);
  const fallbackArgs = [
    '-y',
    '-threads', '1',
    '-i', inputPath,
    '-vf', vf,
    '-r', '30',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'main',
    '-level', '3.1',
    '-preset', 'ultrafast',
    '-tune', 'fastdecode',
    '-crf', '24',
    '-g', '60',
    '-movflags', '+faststart',
    '-an',
    outputPath
  ];
  res = await runFfmpegArgs(fallbackArgs, outputPath, 75000);
  return { ok: res.ok, width: 720, height: 900, error: res.error };
}

// Serialize video conversions so concurrent requests don't spike RAM/CPU and freeze the bot
let conversionChain = Promise.resolve();
function enqueueVideoTask(fn) {
  const next = conversionChain.then(fn, fn);
  conversionChain = next.catch(() => {});
  return next;
}

app.post('/api/send-to-telegram', upload.single('video'), async (req, res) => {
  const chatId = String((req.body && req.body.chat_id) || '').trim();
  const caption = String((req.body && req.body.caption) || '✦ Glow Trace Art').trim();
  const file = req.file;

  if (!chatId) return res.status(400).json({ ok: false, error: "chat_id ko'rsatilmagan" });
  if (!file) return res.status(400).json({ ok: false, error: 'Video fayl topilmadi' });

  const tmpIn = file.path;
  const tmpOut = tmpIn + '.mp4';
  const origName = String(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  const isAlreadyMp4 = origName.endsWith('.mp4') || mime.includes('mp4');

  // Acknowledge upload immediately if async mode requested, or process quickly and return
  try {
    await enqueueVideoTask(async () => {
      const actionTimer = setInterval(() => {
        axios.post(`${TG_API}/sendChatAction`, { chat_id: chatId, action: 'upload_video' }, { httpsAgent: ipv4Agent, timeout: 4000 }).catch(() => {});
      }, 4500);
      axios.post(`${TG_API}/sendChatAction`, { chat_id: chatId, action: 'upload_video' }, { httpsAgent: ipv4Agent, timeout: 4000 }).catch(() => {});

      try {
        let sendFilePath = tmpOut;
        let conv = { ok: false, width: 720, height: 900 };

        if (isAlreadyMp4 && fs.existsSync(tmpIn) && fs.statSync(tmpIn).size > 2048) {
          // Fast remux with +faststart first (takes <0.3s instead of full re-encode!)
          const fastRemux = await runFfmpegArgs([
            '-y', '-i', tmpIn, '-c', 'copy', '-movflags', '+faststart', tmpOut
          ], tmpOut, 15000);
          if (fastRemux.ok) {
            conv = { ok: true, width: 720, height: 900 };
          } else {
            conv = await convertToMp4(tmpIn, tmpOut);
          }
        } else {
          conv = await convertToMp4(tmpIn, tmpOut);
        }

        if (!conv.ok) {
          throw new Error(`MP4 konvertatsiya xatosi: ${conv.error || 'noma’lum'}`);
        }
        const finalCaption = `✦ ${caption}\n\n@quiz15_testbot orqali tayyorlandi`.slice(0, 1020);

        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('caption', finalCaption);
        form.append('width', String(conv.width || 720));
        form.append('height', String(conv.height || 900));
        form.append('supports_streaming', 'true');
        form.append('video', fs.createReadStream(sendFilePath), {
          filename: 'glow-trace-art.mp4',
          contentType: 'video/mp4'
        });

        const tgResp = await axios.post(`${TG_API}/sendVideo`, form, {
          headers: form.getHeaders(),
          httpsAgent: ipv4Agent,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 90000
        });

        if (!tgResp.data || !tgResp.data.ok) {
          throw new Error(tgResp.data?.description || 'Telegram API xatosi');
        }
      } finally {
        clearInterval(actionTimer);
      }
    });

    return res.json({ ok: true });
  } catch (err) {
    const desc = err.response?.data?.description || err.message || 'Server xatosi';
    return res.status(500).json({ ok: false, error: desc });
  } finally {
    for (const p of [tmpIn, tmpOut]) {
      if (p && fs.existsSync(p)) {
        fs.promises.unlink(p).catch(() => {});
      }
    }
  }
});

app.post('/api/convert-mp4', upload.single('video'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ ok: false, error: 'Video fayl topilmadi' });

  const tmpIn = file.path;
  const tmpOut = tmpIn + '.mp4';
  try {
    const conv = await enqueueVideoTask(() => convertToMp4(tmpIn, tmpOut));
    if (!conv.ok) {
      for (const p of [tmpIn, tmpOut]) {
        if (p && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (e) {} }
      }
      return res.status(500).json({ ok: false, error: conv.error || 'MP4 konvertatsiya xatosi' });
    }
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="glow-trace-art.mp4"');
    const stream = fs.createReadStream(tmpOut);
    stream.on('close', () => {
      for (const p of [tmpIn, tmpOut]) {
        if (p && fs.existsSync(p)) {
          try { fs.unlinkSync(p); } catch (e) {}
        }
      }
    });
    stream.pipe(res);
  } catch (err) {
    for (const p of [tmpIn, tmpOut]) {
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (e) {}
      }
    }
    return res.status(500).json({ ok: false, error: err.message || 'Server xatosi' });
  }
});

// ==================== TELEGRAM BOT ====================
const USER_STATES = new Map();

function fmtSum(amount) {
  const n = parseInt(amount, 10);
  if (isNaN(n)) return `${amount} so‘m`;
  return n.toLocaleString('en-US').replace(/,/g, ' ') + ' so‘m';
}

function tgCall(method, payload = {}, timeout = 25000) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify(payload || {}), 'utf8');
    const req = https.request(
      `${TG_API}/${method}`,
      {
        method: 'POST',
        agent: ipv4Agent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length
        },
        timeout
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            resolve({ ok: false, error: 'Invalid JSON' });
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', (err) => {
      console.error(`[tgCall:${method}]`, err.message);
      resolve({ ok: false, error: err.message });
    });
    req.write(body);
    req.end();
  });
}

let lastSyncedUserCount = -1;

async function syncBotUserCountHeader(force = false) {
  try {
    const st = store.getStats();
    if (!force && st.total_users === lastSyncedUserCount) return;
    lastSyncedUserCount = st.total_users;
    const shortDesc = `👥 Foydalanuvchilar: ${st.total_users} ta | 🎬 Yasalgan videolar: ${st.total_videos} ta\n✦ Glow Trace Art PRO — Yorqin 3D & Neon Kontur Animatsiya`;
    const fullDesc =
      `👥 Jami foydalanuvchilar: ${st.total_users} ta\n` +
      `🎬 Tayyorlangan videolar: ${st.total_videos} ta\n\n` +
      `✦ Glow Trace Art PRO — rasmingizdan 12 xil yorqin 3D gologramma, Matrix 0/1, raketa va neon kontur video-animatsiyalar tayyorlab beruvchi bot!\n` +
      `🎁 1-chi rasm va animatsiya BEPUL!`;
    await tgCall('setMyShortDescription', { short_description: shortDesc.slice(0, 120) }, 10000);
    await tgCall('setMyDescription', { description: fullDesc.slice(0, 512) }, 10000);
  } catch (e) {}
}

async function setupBotMenu(webappUrl) {
  if (!webappUrl || !webappUrl.startsWith('https://')) return;
  const st = store.getStats();
  await tgCall('setMyCommands', {
    commands: [
      { command: 'start', description: `✦ Ilovani ochish (👥 ${st.total_users} ta foydalanuvchi)` },
      { command: 'tarif', description: '💎 Tariflar va to‘lov' },
      { command: 'browser', description: '🌐 Brauzerda ochish havolasi' },
      { command: 'admin', description: '⚙️ Admin panel (faqat admin)' },
      { command: 'help', description: '📖 Foydalanish qo‘llanmasi' }
    ]
  }, 10000);
  await tgCall('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: `✦ Glow Art (${st.total_users})`,
      web_app: { url: webappUrl }
    }
  }, 10000);
  await syncBotUserCountHeader(false);
}

async function sendStart(chatId, firstName = '', username = '') {
  store.ensureUser(chatId, firstName, username);
  syncBotUserCountHeader(false).catch(() => {});
  const status = store.getUserStatus(chatId);
  const st = store.getStats();
  const personalUrl = `${LIVE_WEBAPP_URL}/?chat_id=${chatId}`;
  const greeting = firstName ? `Salom, ${firstName}! ` : 'Salom! ';

  let planLine = '';
  if (status.is_premium) {
    planLine = `👑 <b>Premium faol</b> (${status.premium_days_left} kun qoldi — cheksiz!)`;
  } else if (status.free_remaining > 0) {
    planLine = '🎁 <b>1-rasmingiz va tanlagan animatsiyangiz BEPUL!</b>';
  } else if (status.credits > 0) {
    planLine = `🎬 <b>Balans:</b> ${status.credits} ta video tayyorlash huquqi bor`;
  } else {
    const s = status.settings;
    planLine = `💎 1 ta video: <b>${fmtSum(s.video_price)}</b> | 1 oy Premium: <b>${fmtSum(s.premium_price)}</b>`;
  }

  const text =
    `👥 <b>Bot foydalanuvchilari: ${st.total_users} ta</b> | 🎬 <b>Videolar: ${st.total_videos} ta</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✦ <b>${greeting}Glow Trace Art PRO</b> botiga xush kelibsiz!\n\n` +
    `${planLine}\n\n` +
    `🎬 <b>Qanday ishlaydi:</b>\n` +
    `1. Pastdagi tugma orqali ilovani oching.\n` +
    `2. 12 ta super animatsiyadan birini tanlang va rasmingizni yuklang.\n` +
    `3. <b>«Botga tayyor video yuborish»</b> tugmasini bosing — tayyor <b>MP4 video</b> avtomatik shu botga keladi!`;

  const inlineKb = [
    [{ text: `👥 Foydalanuvchilar soni: ${st.total_users} ta`, callback_data: 'show_users_count' }],
    [{ text: '✦ Glow Trace Art ochish (Telegram)', web_app: { url: personalUrl } }],
    [{ text: '🌐 Brauzerda ochish (Chrome / Safari)', url: personalUrl }],
    [
      { text: '💎 Tariflar / To‘lov', callback_data: 'tarifs' },
      { text: '📖 Qo‘llanma', callback_data: 'help' }
    ]
  ];
  if (status.is_admin) {
    inlineKb.push([{ text: '⚙️ Admin panel', callback_data: 'admin_home' }]);
  }

  const replyRows = [
    [{ text: '✦ Glow Trace Art ochish', web_app: { url: personalUrl } }],
    [{ text: `👥 Foydalanuvchilar: ${st.total_users} ta` }],
    [{ text: '🌐 Brauzerda ochish' }, { text: '💎 Tariflar / To‘lov' }],
    [{ text: '📖 Qo‘llanma' }]
  ];
  if (status.is_admin) {
    replyRows[replyRows.length - 1].push({ text: '⚙️ Admin panel' });
  }

  await Promise.all([
    tgCall('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKb }
    }),
    tgCall('sendMessage', {
      chat_id: chatId,
      text: '👇 Tezkor tugmalar tayyor:',
      reply_markup: { keyboard: replyRows, resize_keyboard: true }
    })
  ]);
}

async function sendTarifs(chatId) {
  const status = store.getUserStatus(chatId);
  const s = status.settings;
  const text =
    `💎 <b>Tariflar va To‘lov</b>\n\n` +
    `🎁 <b>1-chi rasm + animatsiya:</b> BEPUL\n` +
    `🎬 <b>1 ta video tayyorlash:</b> <b>${fmtSum(s.video_price)}</b>\n` +
    `👑 <b>Premium (1 oy cheksiz):</b> <b>${fmtSum(s.premium_price)}</b>\n\n` +
    `💳 <b>Karta raqami:</b> <code>${s.card_number}</code>\n` +
    `👤 <b>Karta egasi:</b> ${s.card_holder}\n\n` +
    `👇 Xizmat turini tanlang, to‘lov qiling va <b>chek rasmini (skrinshot)</b> shu botga yuboring:`;

  await tgCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: `🎬 1 ta video (${fmtSum(s.video_price)})`, callback_data: 'buy_video' }],
        [{ text: `👑 Premium 1 oy (${fmtSum(s.premium_price)})`, callback_data: 'buy_premium' }]
      ]
    }
  });
}

async function promptPaymentReceipt(chatId, plan) {
  const s = store.getSettings();
  const amount = plan === 'premium' ? s.premium_price : s.video_price;
  const title = plan === 'premium' ? '👑 Premium (1 oy cheksiz)' : '🎬 1 ta video tayyorlash';
  USER_STATES.set(String(chatId), { action: 'await_receipt', plan, amount });

  const text =
    `<b>${title}</b>\n\n` +
    `💰 <b>To‘lov summasi:</b> <b>${fmtSum(amount)}</b>\n` +
    `💳 <b>Karta raqami:</b> <code>${s.card_number}</code>\n` +
    `👤 <b>Karta egasi:</b> ${s.card_holder}\n\n` +
    `📸 To‘lovni amalga oshirgach, <b>chek rasmini (skrinshot)</b> shu chatga yuboring.\n` +
    `Admin tasdiqlashi bilan darhol ruxsat ochiladi!`;

  await tgCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'cancel_state' }]]
    }
  });
}

async function sendAdminPanel(chatId) {
  if (!store.claimAdminIfEmpty(chatId)) {
    return tgCall('sendMessage', { chat_id: chatId, text: '⛔ Bu bo‘lim faqat bot admini uchun!' });
  }
  const s = store.getSettings();
  const st = store.getStats();
  const text =
    `⚙️ <b>ADMIN PANEL — @quiz15_testbot</b>\n\n` +
    `💳 <b>Karta raqami:</b> <code>${s.card_number}</code>\n` +
    `👤 <b>Karta egasi:</b> ${s.card_holder}\n` +
    `🎬 <b>1 ta video narxi:</b> <b>${fmtSum(s.video_price)}</b>\n` +
    `👑 <b>Premium (1 oy cheksiz):</b> <b>${fmtSum(s.premium_price)}</b>\n\n` +
    `👥 Foydalanuvchilar: <b>${st.total_users}</b> | 👑 Faol Premium: <b>${st.active_premium}</b>\n` +
    `🎬 Yasalgan videolar: <b>${st.total_videos}</b> | ⏳ Kutayotgan cheklar: <b>${st.pending_payments}</b>`;

  const kb = {
    inline_keyboard: [
      [{ text: '💳 Karta raqamini kiritish', callback_data: 'adm_set_card' }],
      [{ text: '👤 Karta egasi (Ism Familiya)', callback_data: 'adm_set_holder' }],
      [{ text: '🎬 1 ta video narxini saqlash', callback_data: 'adm_set_video_price' }],
      [{ text: '👑 Premium (1 oy) narxini sozlash', callback_data: 'adm_set_prem_price' }],
      [
        { text: `⏳ Kutayotgan to‘lovlar (${st.pending_payments})`, callback_data: 'adm_pending' },
        { text: '🔄 Yangilash', callback_data: 'admin_home' }
      ]
    ]
  };
  await tgCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: kb });
}

async function sendPaymentCardToAdmin(admId, pay) {
  const isPrem = pay.plan === 'premium';
  const planTxt = isPrem ? '👑 1 OYLIK CHEKSIZ PREMIUM' : '🎬 1 MARTA RASM YUKLASH / VIDEO';
  const approveBtn = isPrem ? '✅ Tasdiqlash (30 kun Premium)' : '✅ Tasdiqlash (+1 rasm/video)';
  const dt = new Date((pay.created_at || Math.floor(Date.now() / 1000)) * 1000);
  const ts = dt.toLocaleString('uz-UZ');

  const caption =
    `🧾 <b>YANGI TO‘LOV CHEKI (#${pay.id})</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Sotib olinayotgan tarif:</b>\n    <b>${planTxt}</b>\n` +
    `💰 <b>To‘lov summasi:</b> <b>${fmtSum(pay.amount)}</b>\n` +
    `👤 <b>Foydalanuvchi:</b> ${pay.user_name}\n` +
    `🆔 <b>Telegram ID:</b> <code>${pay.chat_id}</code>\n` +
    `🕒 <b>Vaqt:</b> ${ts}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Chekni tekshirib pastdan tasdiqlang yoki rad eting:`;

  const kb = {
    inline_keyboard: [
      [{ text: approveBtn, callback_data: `pay_ok:${pay.id}` }],
      [{ text: '❌ Rad etish', callback_data: `pay_no:${pay.id}` }]
    ]
  };

  if (pay.file_id && pay.media_type === 'photo') {
    await tgCall('sendPhoto', { chat_id: admId, photo: pay.file_id, caption, parse_mode: 'HTML', reply_markup: kb });
  } else if (pay.file_id && pay.media_type === 'document') {
    await tgCall('sendDocument', { chat_id: admId, document: pay.file_id, caption, parse_mode: 'HTML', reply_markup: kb });
  } else {
    await tgCall('sendMessage', { chat_id: admId, text: caption, parse_mode: 'HTML', reply_markup: kb });
  }
}

async function sendPendingPayments(chatId) {
  if (!store.isAdmin(chatId)) return;
  const items = store.getPendingPayments();
  if (!items.length) {
    return tgCall('sendMessage', { chat_id: chatId, text: '✅ Hozircha kutayotgan to‘lovlar yo‘q.' });
  }
  for (const p of items.slice(0, 10)) {
    await sendPaymentCardToAdmin(chatId, p);
  }
}

async function sendBrowserLink(chatId) {
  const personalUrl = `${LIVE_WEBAPP_URL}/?chat_id=${chatId}`;
  const text =
    `🌐 <b>Brauzerda ochish uchun shaxsiy havolangiz:</b>\n\n` +
    `Havolani ochib animatsiya tanlang, rasmingizni yuklang va <b>«Botga tayyor video yuborish»</b> ` +
    `tugmasini bosing — video tayyor MP4 holatda shu chatga tushadi!\n\n` +
    `🆔 Sizning ID: <code>${chatId}</code>`;

  await tgCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🌐 Brauzerda ochish', url: personalUrl }],
        [{ text: '✦ Telegram ichida ochish', web_app: { url: personalUrl } }]
      ]
    }
  });
}

async function sendHelp(chatId) {
  const s = store.getSettings();
  const text =
    `📖 <b>Foydalanish qo‘llanmasi:</b>\n\n` +
    `1️⃣ <b>«✦ Glow Trace Art ochish»</b> tugmasini bosing.\n` +
    `2️⃣ 12 ta animatsiyadan birini tanlang (Matrix 0/1, 3D Gologramma, Raketa, Zarracha gullashi va b.).\n` +
    `3️⃣ <b>1-rasmingiz BEPUL!</b> Keyingi rasmlar uchun:\n` +
    `   • 1 ta video: <b>${fmtSum(s.video_price)}</b>\n` +
    `   • 1 oy cheksiz Premium: <b>${fmtSum(s.premium_price)}</b>\n` +
    `4️⃣ <b>«Botga tayyor video yuborish»</b> tugmasini bosing — tayyor <b>MP4 video</b> shu botga keladi!`;

  await tgCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

async function finalizeReceiptSubmission(chatId, uname, plan, fileId, mediaType) {
  const s = store.getSettings();
  const amount = plan === 'premium' ? s.premium_price : s.video_price;
  const pay = store.createPayment(chatId, (uname || '').trim(), plan, amount, fileId, mediaType);
  USER_STATES.delete(String(chatId));

  const planLabel = plan === 'premium' ? '👑 1 oylik cheksiz Premium' : '🎬 1 marta rasm yuklash / video';
  await tgCall('sendMessage', {
    chat_id: chatId,
    text:
      `✅ <b>Chekingiz adminga yuborildi!</b>\n\n` +
      `📦 Tarif: <b>${planLabel}</b>\n` +
      `💰 Summa: <b>${fmtSum(amount)}</b>\n\n` +
      `Admin tasdiqlashi bilan darhol xabar keladi.`,
    parse_mode: 'HTML'
  });

  for (const admId of store.getAdminIds()) {
    await sendPaymentCardToAdmin(admId, pay);
  }
}

async function handleReceiptMedia(msg) {
  const chatId = String(msg.chat.id);
  let fileId = null;
  let mediaType = 'photo';
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    fileId = msg.photo[msg.photo.length - 1].file_id;
    mediaType = 'photo';
  } else if (msg.document) {
    fileId = msg.document.file_id;
    mediaType = 'document';
  } else {
    return false;
  }

  const user = msg.from || {};
  const uname = (user.first_name || '') + (user.username ? ` (@${user.username})` : '');
  const st = USER_STATES.get(chatId);
  if (st && st.action === 'await_receipt') {
    await finalizeReceiptSubmission(chatId, uname, st.plan, fileId, mediaType);
    return true;
  }

  const s = store.getSettings();
  USER_STATES.set(chatId, {
    action: 'choose_plan_for_receipt',
    file_id: fileId,
    media_type: mediaType,
    uname
  });
  await tgCall('sendMessage', {
    chat_id: chatId,
    text: '📸 <b>Chek rasmi qabul qilindi!</b>\n\nQaysi tarif uchun to‘lov qildingiz? Pastdan tanlang:',
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: `🎬 1 marta rasm/video (${fmtSum(s.video_price)})`, callback_data: 'rcpt_plan:video' }],
        [{ text: `👑 1 oylik Premium (${fmtSum(s.premium_price)})`, callback_data: 'rcpt_plan:premium' }],
        [{ text: '❌ Bekor qilish', callback_data: 'cancel_state' }]
      ]
    }
  });
  return true;
}

async function handleAdminInput(chatId, text) {
  const cid = String(chatId);
  const st = USER_STATES.get(cid);
  if (!st || !store.isAdmin(cid)) return false;

  const action = st.action;
  if (action === 'adm_set_card') {
    store.updateSetting('card_number', text.trim());
    USER_STATES.delete(cid);
    await tgCall('sendMessage', { chat_id: cid, text: `✅ Karta raqami saqlandi: <code>${text.trim()}</code>`, parse_mode: 'HTML' });
    await sendAdminPanel(cid);
    return true;
  }
  if (action === 'adm_set_holder') {
    store.updateSetting('card_holder', text.trim());
    USER_STATES.delete(cid);
    await tgCall('sendMessage', { chat_id: cid, text: `✅ Karta egasi saqlandi: <b>${text.trim()}</b>`, parse_mode: 'HTML' });
    await sendAdminPanel(cid);
    return true;
  }
  if (action === 'adm_set_video_price' || action === 'adm_set_prem_price') {
    const digits = text.replace(/[^\d]/g, '');
    if (!digits) {
      await tgCall('sendMessage', { chat_id: cid, text: '⚠️ Iltimos, faqat raqam kiriting (masalan: 15000):' });
      return true;
    }
    const val = parseInt(digits, 10);
    const key = action === 'adm_set_video_price' ? 'video_price' : 'premium_price';
    const label = key === 'video_price' ? '1 ta video narxi' : 'Premium (1 oy) narxi';
    store.updateSetting(key, val);
    USER_STATES.delete(cid);
    await tgCall('sendMessage', { chat_id: cid, text: `✅ ${label} saqlandi: <b>${fmtSum(val)}</b>`, parse_mode: 'HTML' });
    await sendAdminPanel(cid);
    return true;
  }
  return false;
}

async function handleUpdate(upd) {
  if (upd.callback_query) {
    const cq = upd.callback_query;
    const cqId = cq.id;
    const chatId = cq.message?.chat?.id;
    const data = cq.data || '';
    tgCall('answerCallbackQuery', { callback_query_id: cqId }, 8000).catch(() => {});
    if (!chatId) return;
    const cid = String(chatId);

    if (data === 'cancel_state') {
      USER_STATES.delete(cid);
      await tgCall('sendMessage', { chat_id: cid, text: '❌ Bekor qilindi.' });
    } else if (data === 'show_users_count') {
      const st = store.getStats();
      await tgCall('sendMessage', {
        chat_id: cid,
        text: `📊 <b>Bot statistikasi:</b>\n\n👥 <b>Jami foydalanuvchilar:</b> ${st.total_users} ta\n🎬 <b>Tayyorlangan videolar:</b> ${st.total_videos} ta`,
        parse_mode: 'HTML'
      });
    } else if (data === 'help') {
      await sendHelp(cid);
    } else if (data === 'tarifs') {
      await sendTarifs(cid);
    } else if (data === 'buy_video') {
      await promptPaymentReceipt(cid, 'video');
    } else if (data === 'buy_premium') {
      await promptPaymentReceipt(cid, 'premium');
    } else if (data.startsWith('rcpt_plan:')) {
      const plan = data.split(':')[1];
      const st = USER_STATES.get(cid);
      if (st && st.action === 'choose_plan_for_receipt') {
        await finalizeReceiptSubmission(cid, st.uname, plan, st.file_id, st.media_type);
      } else {
        await promptPaymentReceipt(cid, plan);
      }
    } else if (data === 'admin_home') {
      await sendAdminPanel(cid);
    } else if (data === 'adm_pending') {
      await sendPendingPayments(cid);
    } else if (['adm_set_card', 'adm_set_holder', 'adm_set_video_price', 'adm_set_prem_price'].includes(data)) {
      if (!store.isAdmin(cid)) return;
      USER_STATES.set(cid, { action: data });
      const prompts = {
        adm_set_card: '💳 Yangi <b>karta raqamini</b> yuboring (masalan: <code>8600 1234 5678 9012</code>):',
        adm_set_holder: '👤 <b>Karta egasining ism familiyasini</b> yuboring (masalan: <code>Ali Valiyev</code>):',
        adm_set_video_price: '🎬 <b>1 ta video tayyorlash narxini</b> so‘mda kiriting (masalan: <code>10000</code>):',
        adm_set_prem_price: '👑 <b>1 oylik cheksiz Premium narxini</b> so‘mda kiriting (masalan: <code>49000</code>):'
      };
      await tgCall('sendMessage', {
        chat_id: cid,
        text: prompts[data],
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'cancel_state' }]] }
      });
    } else if (data.startsWith('pay_ok:') || data.startsWith('pay_no:')) {
      if (!store.isAdmin(cid)) return;
      const approve = data.startsWith('pay_ok:');
      const payId = data.split(':')[1];
      const rec = store.resolvePayment(payId, approve);
      if (!rec) {
        await tgCall('sendMessage', { chat_id: cid, text: '⚠️ To‘lov topilmadi yoki allaqachon ko‘rib chiqilgan.' });
        return;
      }
      const uCid = rec.chat_id;
      if (approve) {
        const planTxt = rec.plan === 'premium' ? '👑 1 oylik cheksiz Premium' : '🎬 +1 ta video tayyorlash huquqi';
        await tgCall('sendMessage', { chat_id: cid, text: `✅ To‘lov #${payId} tasdiqlandi! (${planTxt})` });
        await tgCall('sendMessage', {
          chat_id: uCid,
          text: `🎉 <b>To‘lovingiz tasdiqlandi!</b>\n\nSizga <b>${planTxt}</b> berildi. Endi ilovaga kirib rasmingizni yuklashingiz mumkin!`,
          parse_mode: 'HTML'
        });
      } else {
        await tgCall('sendMessage', { chat_id: cid, text: `❌ To‘lov #${payId} rad etildi.` });
        await tgCall('sendMessage', {
          chat_id: uCid,
          text: '❌ To‘lovingiz tasdiqlanmadi. Iltimos, chekni tekshirib qayta yuboring yoki admin bilan bog‘laning.'
        });
      }
    }
    return;
  }

  const msg = upd.message;
  if (!msg || !msg.chat || !msg.chat.id) return;
  const chatId = msg.chat.id;

  if (msg.photo || msg.document) {
    if (await handleReceiptMedia(msg)) return;
  }

  const text = String(msg.text || '').trim();
  const user = msg.from || {};
  const firstName = user.first_name || '';
  const username = user.username || '';

  if (text.startsWith('/start')) {
    USER_STATES.delete(String(chatId));
    const parts = text.split(/\s+/);
    const arg = parts[1] || '';
    store.ensureUser(chatId, firstName, username);
    if (arg === 'buy_video') return promptPaymentReceipt(chatId, 'video');
    if (arg === 'buy_premium') return promptPaymentReceipt(chatId, 'premium');
    return sendStart(chatId, firstName, username);
  }
  if (text.startsWith('/admin') || text.includes('Admin panel')) {
    USER_STATES.delete(String(chatId));
    return sendAdminPanel(chatId);
  }
  if (text.startsWith('/tarif') || text.includes('Tariflar') || text.includes('To‘lov')) {
    USER_STATES.delete(String(chatId));
    return sendTarifs(chatId);
  }
  if (text.startsWith('/browser') || text.includes('Brauzerda ochish')) {
    return sendBrowserLink(chatId);
  }
  if (text.startsWith('/help') || text.includes('Qo‘llanma')) {
    return sendHelp(chatId);
  }
  if (text.startsWith('/stats') || text.includes('Foydalanuvchilar:')) {
    const st = store.getStats();
    return tgCall('sendMessage', {
      chat_id: chatId,
      text: `📊 <b>Bot statistikasi:</b>\n\n👥 <b>Jami foydalanuvchilar:</b> ${st.total_users} ta\n🎬 <b>Tayyorlangan videolar:</b> ${st.total_videos} ta`,
      parse_mode: 'HTML'
    });
  }

  if (text && (await handleAdminInput(chatId, text))) return;

  await sendStart(chatId, firstName, username);
}

async function startPollingLoop() {
  console.log('🤖 Glow Trace Art Bot polling started (@quiz15_testbot)...');
  await tgCall('deleteWebhook', { drop_pending_updates: false }, 10000);
  await setupBotMenu(LIVE_WEBAPP_URL);

  let offset = 0;
  while (true) {
    try {
      const resp = await tgCall('getUpdates', {
        offset,
        timeout: 20,
        allowed_updates: ['message', 'callback_query']
      }, 30000);

      if (resp && resp.ok && Array.isArray(resp.result)) {
        for (const upd of resp.result) {
          offset = upd.update_id + 1;
          handleUpdate(upd).catch((err) => console.error('handleUpdate error:', err.message));
        }
      } else {
        if (resp && resp.error_code === 409) {
          console.warn('⚠️ 409 Conflict detected on @quiz15_testbot');
          if (process.env.AUTO_STOP_ON_409 === '1') {
            console.log('🌐 Render server took over @quiz15_testbot! Exiting local daemon...');
            process.exit(0);
          }
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

function startTunnelOrKeepAlive() {
  if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
    if (process.env.RENDER_EXTERNAL_URL) {
      LIVE_WEBAPP_URL = process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
      setupBotMenu(LIVE_WEBAPP_URL).catch(() => {});
      setTimeout(() => setupBotMenu(LIVE_WEBAPP_URL).catch(() => {}), 15000);
    }
    setInterval(() => {
      if (LIVE_WEBAPP_URL && LIVE_WEBAPP_URL.startsWith('https://')) {
        setupBotMenu(LIVE_WEBAPP_URL).catch(() => {});
        axios.get(`${LIVE_WEBAPP_URL}/health`, { timeout: 10000 }).catch(() => {});
      }
      if (pgPool) {
        pgPool.query('SELECT 1').catch(() => {});
      }
    }, 5 * 60 * 1000);
    return;
  }

  const possibleCf = [
    'C:\\Users\\Xoliqulov\\cloudflared.exe',
    path.join(BASE_DIR, 'cloudflared.exe'),
    path.join(BASE_DIR, '..', 'cloudflared.exe'),
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared'
  ];
  const cfExe = possibleCf.find(p => fs.existsSync(p));
  if (!cfExe) return;

  const launchCf = () => {
    const cf = spawn(cfExe, ['tunnel', '--url', `http://127.0.0.1:${PORT}`], { windowsHide: true });
    let found = false;
    const onData = (buf) => {
      const matches = String(buf).match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
      if (matches && !found) {
        const real = matches.find(u => !u.includes('api.trycloudflare.com'));
        if (real) {
          found = true;
          LIVE_WEBAPP_URL = real;
          console.log('🌐 Glow Trace Art Tunnel URL:', LIVE_WEBAPP_URL);
          setupBotMenu(LIVE_WEBAPP_URL).catch(() => {});
        }
      }
    };
    cf.stdout.on('data', onData);
    cf.stderr.on('data', onData);
    cf.on('close', () => setTimeout(launchCf, 5000));
  };
  launchCf();
}

app.listen(PORT, async () => {
  console.log(`🚀 Glow Trace Art server running on http://localhost:${PORT}`);
  await initPostgresStore();
  startTunnelOrKeepAlive();
  startPollingLoop();
});
