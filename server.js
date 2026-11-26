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
// YAGONA BOSH ADMIN (Bot yaratilgan asosiy Telegram hisob: G'ulomjon Xoliqulov)
const OWNER_ADMIN_ID = '1972059053';
const DEFAULT_DATA = {
  admin_ids: [OWNER_ADMIN_ID],
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
  // Faqat yagona Bosh Admin (OWNER_ADMIN_ID) admin bo'ladi!
  data.admin_ids = [OWNER_ADMIN_ID];
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
    return [OWNER_ADMIN_ID];
  },
  isAdmin(chatId) {
    return String(chatId).trim() === OWNER_ADMIN_ID;
  },
  addAdmin(chatId) {
    return String(chatId).trim() === OWNER_ADMIN_ID;
  },
  removeAdmin(chatId) {
    return false;
  },
  getAllUsers() {
    const data = loadData();
    return Object.entries(data.users || {}).map(([id, u]) => ({ chat_id: id, ...u }));
  },
  addCredits(chatId, count = 1) {
    const cid = String(chatId).trim();
    const data = loadData();
    if (!data.users[cid]) {
      data.users[cid] = {
        name: '',
        username: '',
        free_used: false,
        credits: 0,
        premium_until: 0,
        videos_created: 0,
        created_at: Math.floor(Date.now() / 1000)
      };
    }
    data.users[cid].credits = Math.max(0, (parseInt(data.users[cid].credits || 0, 10) || 0) + count);
    saveData(data);
    return data.users[cid];
  },
  grantPremiumDays(chatId, days = 30) {
    const cid = String(chatId).trim();
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
    const base = Math.max(now, parseInt(data.users[cid].premium_until || 0, 10) || 0);
    data.users[cid].premium_until = days > 0 ? base + days * 86400 : 0;
    saveData(data);
    return data.users[cid];
  },
  resetFreeTrial(chatId) {
    const cid = String(chatId).trim();
    const data = loadData();
    if (data.users[cid]) {
      data.users[cid].free_used = false;
      saveData(data);
      return true;
    }
    return false;
  },
  claimAdminIfEmpty(chatId) {
    return String(chatId).trim() === OWNER_ADMIN_ID;
  },
  ensureUser(chatId, name = '', username = '', referredBy = null) {
    const cid = String(chatId);
    const data = loadData();
    let u = data.users[cid];
    let changed = false;
    let isNewUser = false;
    let referrerRewarded = false;
    if (!u) {
      isNewUser = true;
      u = {
        name: name || '',
        username: username || '',
        free_used: false,
        credits: 0,
        premium_until: 0,
        videos_created: 0,
        score: 0,
        quiz_correct: 0,
        quiz_streak: 0,
        games_won: 0,
        daily_claimed_at: 0,
        referred_by: null,
        referrals_count: 0,
        created_at: Math.floor(Date.now() / 1000)
      };
      if (referredBy && String(referredBy) !== cid && data.users[String(referredBy)]) {
        const refId = String(referredBy);
        u.referred_by = refId;
        const refUser = data.users[refId];
        refUser.referrals_count = (parseInt(refUser.referrals_count || 0, 10) || 0) + 1;
        refUser.score = (parseInt(refUser.score || 0, 10) || 0) + 35;
        if (refUser.referrals_count % 3 === 0) {
          refUser.credits = (parseInt(refUser.credits || 0, 10) || 0) + 1;
          referrerRewarded = true;
        }
      }
      data.users[cid] = u;
      changed = true;
    } else {
      if (name && u.name !== name) { u.name = name; changed = true; }
      if (username && u.username !== username) { u.username = username; changed = true; }
      if (typeof u.score !== 'number') { u.score = parseInt(u.score || 0, 10) || 0; changed = true; }
      if (typeof u.referrals_count !== 'number') { u.referrals_count = parseInt(u.referrals_count || 0, 10) || 0; changed = true; }
    }
    if (changed) saveData(data);
    return { ...u, isNewUser, referrerRewarded };
  },
  addScore(chatId, pts = 10, winType = '') {
    const cid = String(chatId);
    const data = loadData();
    if (!data.users[cid]) this.ensureUser(cid);
    const u = data.users[cid];
    const oldScore = parseInt(u.score || 0, 10) || 0;
    const newScore = Math.max(0, oldScore + pts);
    u.score = newScore;
    if (winType === 'quiz') {
      u.quiz_correct = (parseInt(u.quiz_correct || 0, 10) || 0) + 1;
      u.quiz_streak = (parseInt(u.quiz_streak || 0, 10) || 0) + 1;
    } else if (winType === 'quiz_wrong') {
      u.quiz_streak = 0;
    } else if (winType === 'game') {
      u.games_won = (parseInt(u.games_won || 0, 10) || 0) + 1;
    }
    // Every 100 points crossed grants +1 free video credit!
    const oldHundreds = Math.floor(oldScore / 100);
    const newHundreds = Math.floor(newScore / 100);
    let bonusCreditEarned = 0;
    if (newHundreds > oldHundreds) {
      bonusCreditEarned = newHundreds - oldHundreds;
      u.credits = (parseInt(u.credits || 0, 10) || 0) + bonusCreditEarned;
    }
    saveData(data);
    return { score: newScore, bonusCreditEarned, credits: u.credits, streak: u.quiz_streak || 0 };
  },
  claimDailyBonus(chatId) {
    const cid = String(chatId);
    const now = Math.floor(Date.now() / 1000);
    const data = loadData();
    if (!data.users[cid]) this.ensureUser(cid);
    const u = data.users[cid];
    const last = parseInt(u.daily_claimed_at || 0, 10) || 0;
    const cooldown = 20 * 3600; // 20 hours
    if (now - last < cooldown) {
      const leftSec = cooldown - (now - last);
      const hours = Math.floor(leftSec / 3600);
      const mins = Math.ceil((leftSec % 3600) / 60);
      return { ok: false, hours, mins };
    }
    u.daily_claimed_at = now;
    const prizePts = [15, 20, 25, 30, 40, 50][Math.floor(Math.random() * 6)];
    const luckyVideo = Math.random() < 0.12; // 12% chance to win an instant video credit!
    const oldScore = parseInt(u.score || 0, 10) || 0;
    const newScore = oldScore + prizePts;
    u.score = newScore;
    let bonusCredits = Math.floor(newScore / 100) - Math.floor(oldScore / 100);
    if (luckyVideo) bonusCredits += 1;
    if (bonusCredits > 0) {
      u.credits = (parseInt(u.credits || 0, 10) || 0) + bonusCredits;
    }
    saveData(data);
    return { ok: true, prizePts, luckyVideo, bonusCredits, totalScore: newScore, credits: u.credits };
  },
  getTopUsers(limit = 10) {
    const data = loadData();
    return Object.entries(data.users || {})
      .map(([id, u]) => ({
        chat_id: id,
        name: u.name || 'Foydalanuvchi',
        username: u.username || '',
        score: parseInt(u.score || 0, 10) || 0,
        videos_created: parseInt(u.videos_created || 0, 10) || 0,
        referrals_count: parseInt(u.referrals_count || 0, 10) || 0
      }))
      .sort((a, b) => (b.score - a.score) || (b.videos_created - a.videos_created))
      .slice(0, limit);
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
        score: 0,
        quiz_correct: 0,
        quiz_streak: 0,
        games_won: 0,
        referrals_count: 0,
        created_at: now
      };
      data.users[cid] = u;
      saveData(data);
    }
    const isAdm = cid === OWNER_ADMIN_ID;
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
      score: parseInt(u.score || 0, 10) || 0,
      quiz_correct: parseInt(u.quiz_correct || 0, 10) || 0,
      quiz_streak: parseInt(u.quiz_streak || 0, 10) || 0,
      games_won: parseInt(u.games_won || 0, 10) || 0,
      referrals_count: parseInt(u.referrals_count || 0, 10) || 0,
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
    const isAdm = cid === OWNER_ADMIN_ID;
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
      approved_payments: payments.filter(p => p && p.status === 'approved').length,
      total_revenue: payments.filter(p => p && p.status === 'approved').reduce((acc, p) => acc + (parseInt(p.amount || 0, 10) || 0), 0)
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
      `✦ Glow Trace Art PRO — rasmingizdan 18 xil yorqin 3D gologramma, Matrix 0/1, Kiber Lazer, DNK Spiral, Qora Tuynuk va neon kontur video-animatsiyalar tayyorlab beruvchi bot!\n` +
      `🎁 1-chi rasm va animatsiya BEPUL!`;
    await tgCall('setMyShortDescription', { short_description: shortDesc.slice(0, 120) }, 10000);
    await tgCall('setMyDescription', { description: fullDesc.slice(0, 512) }, 10000);
  } catch (e) {}
}

async function setupBotMenu(webappUrl) {
  if (!webappUrl || !webappUrl.startsWith('https://')) return;
  const st = store.getStats();
  const publicCommands = [
    { command: 'start', description: `🏠 Asosiy menyu va 6 ta bo‘lim (👥 ${st.total_users} ta)` },
    { command: 'studio', description: '🎬 1-Bo‘lim: 3D & Neon Video Studiya' },
    { command: 'quiz', description: '🧠 2-Bo‘lim: Intellektual Viktorina (+Bepul Video)' },
    { command: 'games', description: '🎮 3-Bo‘lim: Mini-O‘yinlar va Duel Arena' },
    { command: 'tools', description: '🪄 4-Bo‘lim: Kreativ Ustaxona (Ism, QR, Shifr)' },
    { command: 'fun', description: '🌟 5-Bo‘lim: Psixologik Test, Fakt va Yosh' },
    { command: 'profile', description: '👤 6-Bo‘lim: Profil, Referal va Top Reyting' },
    { command: 'tarif', description: '💎 Tariflar va to‘lov' },
    { command: 'help', description: '📖 Foydalanish qo‘llanmasi' }
  ];
  await tgCall('setMyCommands', {
    commands: publicCommands
  }, 10000);
  await tgCall('setMyCommands', {
    commands: [
      ...publicCommands,
      { command: 'admin', description: '⚙️ Admin panel (Faqat Bosh Admin)' }
    ],
    scope: { type: 'chat', chat_id: Number(OWNER_ADMIN_ID) }
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

// ==================== MULTI-SECTION CONTENT BANKS ====================
const QUIZ_QUESTIONS = [
  // 🌍 Dunyo & Geografiya (world)
  { cat: 'world', q: 'Dunyodagi eng katta okean qaysi?', opts: ['Tinch okeani', 'Atlantika okeani', 'Hind okeani', 'Shimoliy Muz okeani'], ans: 0, info: 'Tinch okeani yer yuzining qariyb 30% qismini egallaydi.' },
  { cat: 'world', q: 'Quyosh tizimidagi eng katta sayyora qaysi?', opts: ['Mars', 'Saturn', 'Yupiter', 'Neptun'], ans: 2, info: 'Yupiter Yerdan 1300 barobar katta hajmga ega!' },
  { cat: 'world', q: 'Qaysi davlat «Kun chiqar mamlakat» deb ataladi?', opts: ['Xitoy', 'Yaponiya', 'Janubiy Koreya', 'Tailand'], ans: 1, info: 'Yaponiyaning «Nihon» nomi «Quyosh manbai» degan ma’noni anglatadi.' },
  { cat: 'world', q: 'Dunyodagi eng baland sharshara (Anxel) qaysi davlatda joylashgan?', opts: ['Braziliya', 'Kanada', 'Venesuela', 'JAR'], ans: 2, info: 'Anxel sharsharasining balandligi 979 metr bo‘lib, Venesuelada joylashgan.' },
  { cat: 'world', q: 'Olmosning kimyoviy tarkibi qaysi elementdan iborat?', opts: ['Kremniy', 'Uglerod', 'Titan', 'Kvars'], ans: 1, info: 'Olmos yuqori bosim ostida hosil bo‘lgan sof ugleroddir.' },
  { cat: 'world', q: 'Inson tanasidagi eng katta ichki a’zo qaysi?', opts: ['Yurak', 'O‘pka', 'Jigar', 'Buyrak'], ans: 2, info: 'Jigar eng katta ichki a’zo bo‘lib, 500 dan ortiq vazifani bajaradi.' },

  // 💻 IT, AI & Texnologiya (it)
  { cat: 'it', q: 'Telegram messenjeri nechanchi yilda ishga tushirilgan?', opts: ['2011-yil', '2013-yil', '2015-yil', '2016-yil'], ans: 1, info: 'Telegram 2013-yil avgust oyida Pavel va Nikolay Durovlar tomonidan yaratilgan.' },
  { cat: 'it', q: '1 Bayt (Byte) necha bitga teng?', opts: ['4 bit', '8 bit', '16 bit', '32 bit'], ans: 1, info: 'Kompyuter arxitekturasida 1 Bayt = 8 bit (0 va 1 lardan iborat).' },
  { cat: 'it', q: 'Python dasturlash tilining asoschisi kim?', opts: ['Gvido van Rossum', 'Brendan Eyx', 'Linus Torvalds', 'Jeyms Gosling'], ans: 0, info: 'Gvido van Rossum 1991-yilda Python tilini yaratgan.' },
  { cat: 'it', q: 'Veb-sahifalarga dizayn va rang berish uchun qaysi texnologiya ishlatiladi?', opts: ['HTML', 'SQL', 'CSS', 'PHP'], ans: 2, info: 'CSS (Cascading Style Sheets) veb-sahifalarning ko‘rinishi va animatsiyalarini boshqaradi.' },
  { cat: 'it', q: 'Dunyodagi birinchi kriptovalyuta qaysi?', opts: ['Ethereum', 'Toncoin', 'Bitcoin', 'Solana'], ans: 2, info: 'Bitcoin 2009-yilda Satoshi Nakamoto taxallusi ostida ishga tushirilgan.' },
  { cat: 'it', q: 'Sun’iy intellektdagi «GPT» qisqartmasida «T» harfi nimani anglatadi?', opts: ['Technology', 'Transformer', 'Terminal', 'Tensor'], ans: 1, info: 'GPT — Generative Pre-trained Transformer arxitekturasidir.' },

  // 🇺🇿 O‘zbekiston & Tarix (uzb)
  { cat: 'uzb', q: 'Sohibqiron Amir Temur nechanchi yilda tavallud topgan?', opts: ['1336-yil 9-aprel', '1340-yil 12-mart', '1441-yil 9-fevral', '1483-yil 14-fevral'], ans: 0, info: 'Amir Temur 1336-yil 9-aprelda Kesh (Shahrisabz) yaqinidagi Xoja Ilg‘or qishlog‘ida tug‘ilgan.' },
  { cat: 'uzb', q: 'Yulduzlar jadvali — «Ziji jadidi Ko‘ragoniy» asarini kim yaratgan?', opts: ['Ibn Sino', 'Mirzo Ulug‘bek', 'Al-Xorazmiy', 'Al-Farg‘oniy'], ans: 1, info: 'Mirzo Ulug‘bek Samarqand rasadxonasida 1018 ta yulduzning aniq koordinatalarini tuzgan.' },
  { cat: 'uzb', q: '«Algoritm» atamasi qaysi buyuk bobokalonimiz nomidan kelib chiqqan?', opts: ['Abu Rayhon Beruniy', 'Muhammad al-Xorazmiy', 'Abu Ali ibn Sino', 'Ahmad al-Farg‘oniy'], ans: 1, info: 'Al-Xorazmiyning lotincha «Algoritmi» nomi zamonaviy IT va matematikadagi «Algoritm» so‘ziga asos bo‘lgan.' },
  { cat: 'uzb', q: 'O‘zbekiston Respublikasining Davlat bayrog‘i qachon qabul qilingan?', opts: ['1991-yil 31-avgust', '1991-yil 18-noyabr', '1992-yil 2-iyul', '1992-yil 8-dekabr'], ans: 1, info: 'O‘zbekiston Davlat bayrog‘i 1991-yil 18-noyabrda qabul qilingan.' },
  { cat: 'uzb', q: 'Alisher Navoiyning mashhur «Xamsa» asari nechta dostondan iborat?', opts: ['4 ta', '5 ta', '6 ta', '7 ta'], ans: 1, info: '«Xamsa» arabcha «Beshlik» degani bo‘lib, 5 ta buyuk dostondan tashkil topgan.' },
  { cat: 'uzb', q: 'Toshkent metropoliteni nechanchi yilda ishga tushirilgan?', opts: ['1972-yil', '1977-yil', '1981-yil', '1985-yil'], ans: 1, info: 'Toshkent metrosi 1977-yil noyabrda ochilgan bo‘lib, Markaziy Osiyodagi birinchi metro hisoblanadi.' },

  // ⚽ Futbol, Sport & Kino (sport)
  { cat: 'sport', q: 'Futbol bo‘yicha 2022-yilgi Jahon chempionatida qaysi davlat g‘olib bo‘ldi?', opts: ['Fransiya', 'Braziliya', 'Argentina', 'Xorvatiya'], ans: 2, info: 'Lionel Messi boshchiligidagi Argentina finalda Fransiyani penaltilar seriyasida mag‘lub etdi.' },
  { cat: 'sport', q: 'Shaxmat taxtasida jami nechta katak bor?', opts: ['32 ta', '48 ta', '64 ta', '81 ta'], ans: 2, info: 'Shaxmat taxtasi 8x8 o‘lchamda bo‘lib, 32 ta oq va 32 ta qora (jami 64 ta) katakdan iborat.' },
  { cat: 'sport', q: 'Olimpiya bayrog‘ida nechta halqa tasvirlangan?', opts: ['4 ta', '5 ta', '6 ta', '7 ta'], ans: 1, info: '5 ta halqa yer yuzidagi 5 qit’aning birligini anglatadi.' },
  { cat: 'sport', q: '«Oltin to‘p» (Ballon d’Or) sovrinini eng ko‘p qo‘lga kiritgan futbolchi kim?', opts: ['Krishtianu Ronaldu', 'Lionel Messi', 'Zinedin Zidan', 'Ronaldino'], ans: 1, info: 'Lionel Messi 8 marta «Oltin to‘p» sohibiga aylangan.' },
  { cat: 'sport', q: '«Titanik» va «Avatar» filmlarining rejissyori kim?', opts: ['Kristofer Nolan', 'Stiven Spilberg', 'Jeyms Kemeron', 'Martin Skorseze'], ans: 2, info: 'Jeyms Kemeron kino tarixidagi eng kassabop filmlarni suratga olgan.' },

  // 🧩 Mantiqiy Topishmoqlar (logic)
  { cat: 'logic', q: 'Nimani ko‘z yumilgan holatda ham ko‘rish mumkin?', opts: ['Soyani', 'Tushni', 'Oynani', 'Zulmatni'], ans: 1, info: 'Inson uxlaganda ko‘zi yumiq holda tush ko‘radi!' },
  { cat: 'logic', q: 'Qaysi oyda 28 kun bor?', opts: ['Faqat fevralda', 'Barcha 12 oyda', 'Kabisa yilida', 'Hech qaysi oyda'], ans: 1, info: 'Yilning barcha 12 oyida ham 28-sana (28 kun) mavjud!' },
  { cat: 'logic', q: 'Stolda 4 ta olma bor edi. Siz 3 tasini oldingiz. Sizda nechta olma bor?', opts: ['1 ta', '3 ta', '4 ta', '0 ta'], ans: 1, info: 'Siz 3 ta olmani o‘zingizga oldingiz, demak sizning qo‘lingizda 3 ta olma bor!' },
  { cat: 'logic', q: 'Qanchalik ko‘p olsangiz, u shunchalik kattalashib boradi. U nima?', opts: ['Chuqur (o‘ra)', 'Bulut', 'Vaqt', 'Suv'], ans: 0, info: 'Yerdan tuproqni qanchalik ko‘p olsangiz, chuqur shunchalik kattalashadi.' },
  { cat: 'logic', q: 'Til va og‘zi yo‘q, lekin barcha tillarda aniq javob qaytaradi. U nima?', opts: ['Kitob', 'Aks-sado (Exo)', 'Shamol', 'Soat'], ans: 1, info: 'Tog‘dagi aks-sado qaysi tilda gapirsangiz, o‘sha tilda qaytaradi.' }
];

const FUN_FACTS = [
  '🌌 <b>Koinot siri:</b> Koinotdagi yulduzlar soni Yer yuzidagi barcha plyaj va cho‘llardagi qum zarralaridan ham ko‘proq!',
  '🐙 <b>Sakkizoyoq mo‘jizasi:</b> Sakkizoyoqda 3 ta yurak, 9 ta miya bor va uning qoni moviy (ko‘k) rangda bo‘ladi.',
  '⚡ <b>Chaqmoq kuchi:</b> Bitta chaqmoq zarbasining harorati Quyosh yuzasidan 5 barobar issiqroq (30 000°C gacha) bo‘ladi.',
  '🍯 <b>Abadiy mahsulot:</b> Tabiiy asal hech qachon aynimaydi. Misr ehromlaridan topilgan 3000 yillik asal ham iste’molga yaroqli bo‘lgan!',
  '🧠 <b>Inson miyasi:</b> Miyangiz uyg‘oq paytda 25 Vattgacha elektr energiyasi ishlab chiqaradi — bu bitta LED lampochkani yoqishga yetadi.',
  '💎 <b>Olmos yomg‘iri:</b> Saturn va Yupiter sayyoralarida atmosferadagi yuqori bosim tufayli haqiqiy olmos yomg‘irlari yog‘adi!',
  '🦈 <b>Akulalar tarixi:</b> Akulalar Yer yuzida daraxtlardan va hattoki dinozavrlardan ham 50 million yil oldin paydo bo‘lgan.',
  '🌍 <b>Venera kuni:</b> Venera sayyorasida 1 kun (o‘z o‘qi atrofida aylanishi) uning 1 yilidan (Quyosh atrofida aylanishidan) uzunroq davom etadi!',
  '🧬 <b>DNK uzunligi:</b> Bitta inson tanasidagi barcha DNK tolalarini ulab chiqilsa, Quyoshdan Plutongacha borib-qaytishga yetadi.',
  '🍌 <b>Banan siri:</b> Botanika nuqtai nazaridan banan — rezavor meva, qulupnay esa rezavor emas!'
];

const MOTIVATION_QUOTES = [
  '🔥 <b>«Bugun qiyin bo‘lgan narsa — ertaga sizning eng katta kuchingizga aylanadi. To‘xtamang!»</b>',
  '🚀 <b>«Orzularingiz ustida ishlashni bugundan boshlang. Bir yildan keyin bugungi harakatingiz uchun o‘zingizga rahmat aytasiz!»</b>',
  '👑 <b>«G‘oliblar hech qachon taslim bo‘lmaydi, taslim bo‘lganlar esa hech qachon g‘olib bo‘lmaydi.»</b>',
  '⚡ <b>«Katta natijalar kichik, ammo har kuni to‘xtovsiz qilinadigan qadamlardan boshlanadi.»</b>',
  '💎 <b>«Olmos ham oddiy ko‘mir edi, faqat u yuqori bosimga bardosh bera oldi. Sabr va mehnat — muvaffaqiyat kaliti!»</b>',
  '🌟 <b>«O‘zingizga ishoning! Sizning ichingizda hali kashf etilmagan ulkan imkoniyatlar bor.»</b>',
  '🦅 <b>«Burgut bo‘rondan qochmaydi — u bo‘ron shamolidan yanada balandroq ko‘tarilish uchun foydalanadi.»</b>',
  '🎯 <b>«Maqsadingiz aniq bo‘lsa, yo‘ldagi har bir to‘siq shunchaki yangi tajriba zinapoyasidir.»</b>'
];

const PSY_QUESTIONS = [
  {
    q: '1/4. Dam olish kuni kutilmaganda bo‘sh vaqtingiz paydo bo‘ldi. Nimani tanlaysiz?',
    opts: [
      { t: '🚀 Yangi loyiha yoki g‘oyani sinab ko‘raman', type: 'leader' },
      { t: '🎨 Musiqa, kino yoki ijod bilan shug‘ullanaman', type: 'creator' },
      { t: '📚 Kitob o‘qiyman yoki qiziqarli narsa o‘rganaman', type: 'thinker' },
      { t: '🎉 Do‘stlar bilan uchrashib, suhbatlashaman', type: 'charisma' }
    ]
  },
  {
    q: '2/4. Murakkab vaziyatga tushib qolsangiz, birinchi qadamingiz qanday bo‘ladi?',
    opts: [
      { t: '⚡ Tezkor qaror qabul qilib, mas’uliyatni olaman', type: 'leader' },
      { t: '💡 Noodatiy va kreativ yechim qidiraman', type: 'creator' },
      { t: '🔍 Barcha faktlarni chuqur tahlil qilib reja tuzaman', type: 'thinker' },
      { t: '🤝 Odamlarni birlashtirib, maslahatlashib hal qilaman', type: 'charisma' }
    ]
  },
  {
    q: '3/4. Qaysi tabiat hodisasi sizning ichki olamingizga eng yaqin?',
    opts: [
      { t: '🔥 Olov va chaqmoq — kuch va shijoat', type: 'leader' },
      { t: '🌌 Shimol yog‘dusi (Aurora) — sirli va go‘zal', type: 'creator' },
      { t: '🌊 Tinch va chuqur okean — tafakkur', type: 'thinker' },
      { t: '☀️ Yorqin quyosh — iliqlik va quvnoqlik', type: 'charisma' }
    ]
  },
  {
    q: '4/4. Hayotda siz uchun eng muhim qadriyat nima?',
    opts: [
      { t: '🏆 G‘alaba, erkinlik va yuqori natija', type: 'leader' },
      { t: '✨ O‘ziga xoslik, go‘zallik va ilhom', type: 'creator' },
      { t: '🧠 Haqiqat, bilim va aniqlik', type: 'thinker' },
      { t: '❤️ Samimiylik, do‘stlik va baxt ulashish', type: 'charisma' }
    ]
  }
];

function getUserRankTitle(score) {
  if (score >= 500) return '👑 Glow Afsonasi (VIP)';
  if (score >= 250) return '🔥 Kiber Ustoz';
  if (score >= 100) return '⚡ Mahoratli Ishtirokchi';
  if (score >= 30) return '🌟 Faol Bilimdon';
  return '🌱 Yangi Ishtirokchi';
}

function generateFancyNames(raw) {
  const clean = String(raw || 'Glow Art').trim().slice(0, 28) || 'Glow Art';
  const maps = [
    {
      label: '👑 Royal Bold',
      fn: (s) => s.replace(/[A-Za-z]/g, (c) => {
        const code = c.charCodeAt(0);
        return code >= 65 && code <= 90 ? String.fromCodePoint(0x1D400 + (code - 65)) : String.fromCodePoint(0x1D41A + (code - 97));
      })
    },
    {
      label: '✨ Script VIP',
      fn: (s) => s.replace(/[A-Za-z]/g, (c) => {
        const code = c.charCodeAt(0);
        return code >= 65 && code <= 90 ? String.fromCodePoint(0x1D4D0 + (code - 65)) : String.fromCodePoint(0x1D4EA + (code - 97));
      })
    },
    {
      label: '🔮 Gothic Dark',
      fn: (s) => s.replace(/[A-Za-z]/g, (c) => {
        const code = c.charCodeAt(0);
        return code >= 65 && code <= 90 ? String.fromCodePoint(0x1D56C + (code - 65)) : String.fromCodePoint(0x1D586 + (code - 97));
      })
    },
    {
      label: '🧊 Double Struck',
      fn: (s) => s.replace(/[A-Za-z]/g, (c) => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) {
          const specials = { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' };
          return specials[c] || String.fromCodePoint(0x1D538 + (code - 65));
        }
        return String.fromCodePoint(0x1D552 + (code - 97));
      })
    },
    {
      label: '💻 Monospace Cyber',
      fn: (s) => s.replace(/[A-Za-z]/g, (c) => {
        const code = c.charCodeAt(0);
        return code >= 65 && code <= 90 ? String.fromCodePoint(0x1D670 + (code - 65)) : String.fromCodePoint(0x1D68A + (code - 97));
      })
    },
    {
      label: '⚡ Aesthetic Spaced',
      fn: (s) => s.toUpperCase().split('').join(' ')
    }
  ];

  const results = [];
  for (const m of maps) {
    const styled = m.fn(clean);
    results.push(`<code>${styled}</code>`);
  }
  const bold = maps[0].fn(clean);
  const script = maps[1].fn(clean);
  results.push(`<code>꧁༺ ${bold} ༻꧂</code>`);
  results.push(`<code>✦ ${script} ✦</code>`);
  results.push(`<code>⚡『 ${clean.toUpperCase()} 』⚡</code>`);
  results.push(`<code>👑 彡[${bold}]彡 👑</code>`);
  results.push(`<code>❖ ── ✦ ${script} ✦ ── ❖</code>`);
  results.push(`<code>𓆩🖤𓆪 ${bold} 𓆩🖤𓆪</code>`);
  return results;
}

const MORSE_MAP = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', ' ': ' / '
};

function encodeCipherFormats(rawText) {
  const clean = String(rawText || '').trim().slice(0, 80);
  const morse = clean.toUpperCase().split('').map(ch => MORSE_MAP[ch] || ch).join(' ');
  const binary = clean.slice(0, 24).split('').map(ch => ch.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
  const reversed = clean.split('').reverse().join('');
  const emojiAlpha = ['🔥','⚡','💎','🌌','🚀','👑','🔮','🧬','🧊','☄️','🌸','🎭','🌊','🎆','🛡️','⭐','🎯','🍀','🦊','🐉','🪐','⚔️','🧿','💫','🕹️','🏆'];
  const emojiCode = clean.toUpperCase().split('').map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) return emojiAlpha[code - 65];
    if (ch === ' ') return '▫️';
    return ch;
  }).join('');
  return { morse, binary, reversed, emojiCode };
}

async function sendStart(chatId, firstName = '', username = '', referredBy = null) {
  const ensured = store.ensureUser(chatId, firstName, username, referredBy);
  if (ensured.isNewUser && referredBy && String(referredBy) !== String(chatId)) {
    const refStatus = store.getUserStatus(referredBy);
    let refMsg = `🎉 <b>Sizning taklif havolangiz orqali yangi do‘stingiz (${firstName || 'Foydalanuvchi'}) botga qo‘shildi!</b>\n\n` +
      `🏆 Sizga <b>+35 ball</b> berildi! Jami takliflaringiz: <b>${refStatus.referrals_count} ta</b>.`;
    if (ensured.referrerRewarded) {
      refMsg += `\n\n🎁 <b>TABRIKLAYMIZ! 3 ta do‘st taklif qilganingiz uchun sizga +1 ta BEPUL VIDEO tayyorlash huquqi qo‘shildi!</b>`;
    } else {
      const left = 3 - (refStatus.referrals_count % 3);
      refMsg += `\n💡 Yana <b>${left} ta</b> do‘st taklif qilsangiz, <b>+1 ta BEPUL VIDEO</b> olasiz!`;
    }
    tgCall('sendMessage', { chat_id: referredBy, text: refMsg, parse_mode: 'HTML' }).catch(() => {});
  }

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
    planLine = `🎬 <b>Balans:</b> ${status.credits} ta bepul video huquqi bor`;
  } else {
    const s = status.settings;
    planLine = `💎 1 ta video: <b>${fmtSum(s.video_price)}</b> | 1 oy Premium: <b>${fmtSum(s.premium_price)}</b>`;
  }

  const text =
    `👥 <b>Foydalanuvchilar: ${st.total_users} ta</b> | 🎬 <b>Videolar: ${st.total_videos} ta</b>\n` +
    `🏆 <b>Ballaringiz: ${status.score} ball</b> (${getUserRankTitle(status.score)})\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✦ <b>${greeting}Glow Trace Art PRO Super-Botiga</b> xush kelibsiz!\n\n` +
    `${planLine}\n\n` +
    `🌟 <b>Botdagi 6 ta ajoyib bo‘lim bilan mazza qilib foydalaning:</b>\n` +
    `1️⃣ <b>🎬 3D & Neon Video Studiya</b> — Rasm va Ismlardan 18 xil yorqin MP4 video-animatsiya!\n` +
    `2️⃣ <b>🧠 Intellektual Viktorina</b> — Savollarga javob topib, har 100 ballda <b>+1 BEPUL VIDEO</b> yuting!\n` +
    `3️⃣ <b>🎮 Mini-O‘yinlar & Duel</b> — X-O, Tosh-Qaychi-Qog‘oz, Yashirin Son, Jonli Kazino va Kunlik Sandiq!\n` +
    `4️⃣ <b>🪄 Kreativ Ustaxona</b> — Chiroyli VIP Ismlar, QR-Kod, Kiber-Shifr va Parol Generator!\n` +
    `5️⃣ <b>🌟 Qiziqarli Olam</b> — Psixologik Хarakter Testi, Faktlar, Motivatsiya va Kosmik Yosh!\n` +
    `6️⃣ <b>👤 Profil & Referal</b> — Do‘stlarni taklif qilib <b>Bepul Video</b> olish va Top-10 Reyting!`;

  const inlineKb = [
    [{ text: '🎬 1. Glow 3D & Neon Video Studiya (Ochish)', web_app: { url: personalUrl } }],
    [
      { text: '✨ Ismdan 3D Video Yaratish', web_app: { url: `${personalUrl}&tab=name` } },
      { text: '🌐 Brauzerda ochish', url: personalUrl }
    ],
    [
      { text: '🧠 2. Viktorina (Quiz)', callback_data: 'sec_quiz' },
      { text: '🎮 3. Mini-O‘yinlar', callback_data: 'sec_games' }
    ],
    [
      { text: '🪄 4. Kreativ Ustaxona', callback_data: 'sec_tools' },
      { text: '🌟 5. Qiziqarli Olam', callback_data: 'sec_fun' }
    ],
    [
      { text: '👤 6. Profil & Bepul Video', callback_data: 'sec_profile' },
      { text: '🏆 Top-10 Reyting', callback_data: 'sec_leaderboard' }
    ],
    [
      { text: '🎁 Kunlik Omad Sandig‘i', callback_data: 'daily_bonus' },
      { text: '💎 Tariflar / To‘lov', callback_data: 'tarifs' }
    ]
  ];
  if (status.is_admin) {
    inlineKb.push([{ text: '⚙️ Admin panel (Bosh Admin)', callback_data: 'admin_home' }]);
  }

  const replyRows = [
    [{ text: '✦ Glow Trace Art ochish', web_app: { url: personalUrl } }],
    [{ text: '🧠 Viktorina & Quiz' }, { text: '🎮 Mini-O‘yinlar' }],
    [{ text: '🪄 Kreativ Ustaxona' }, { text: '🌟 Qiziqarli Olam' }],
    [{ text: '👤 Profil & Bonus' }, { text: '🏆 Top Reyting' }],
    [{ text: '💎 Tariflar / To‘lov' }, { text: '📖 Qo‘llanma' }]
  ];
  if (status.is_admin) {
    replyRows.push([{ text: '⚙️ Admin panel' }]);
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
      text: '👇 Pastdagi menyudan istalgan bo‘limni tanlang:',
      reply_markup: { keyboard: replyRows, resize_keyboard: true }
    })
  ]);
}

async function sendOrEdit(chatId, messageId, text, inlineKeyboard) {
  if (messageId) {
    const r = await tgCall('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
    if (r && r.ok) return;
  }
  await tgCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: inlineKeyboard }
  });
}

// ==================== SECTION 1: STUDIO HUB ====================
async function sendStudioSection(chatId, messageId = null) {
  const status = store.getUserStatus(chatId);
  const personalUrl = `${LIVE_WEBAPP_URL}/?chat_id=${chatId}`;
  const text =
    `🎬 <b>1-BO‘LIM: GLOW TRACE ART 3D & NEON STUDIYA</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✨ Rasmingizdan yoki Ismingizdan <b>18 xil professional 3D gologramma, Matrix 0/1, Kiber Lazer, DNK Spiral, Qora Tuynuk</b> va neon kontur MP4 videolar tayyorlang!\n\n` +
    `🎁 <b>Sizning holatingiz:</b> ${status.is_premium ? `👑 Premium (${status.premium_days_left} kun)` : (status.free_remaining > 0 ? '🎁 1-urinish BEPUL' : `🎬 ${status.credits} ta video huquqi`)}\n\n` +
    `👇 Quyidagi studiya rejimlaridan birini tanlang:`;

  const kb = [
    [{ text: '🖼 Rasm Yuklash va 18 xil Animatsiya', web_app: { url: personalUrl } }],
    [{ text: '✨ Ism & Logodan 3D Neon Video Yaratish', web_app: { url: `${personalUrl}&tab=name` } }],
    [{ text: '🎨 Tayyor 3D Shablonlar (Kiber / Toj / Koinot)', web_app: { url: `${personalUrl}&tab=templates` } }],
    [{ text: '🌐 Tashqi Brauzerda Ochish (Chrome / Safari)', url: personalUrl }],
    [{ text: '🏠 Asosiy menyuga qaytish', callback_data: 'home_menu' }]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

// ==================== SECTION 2: QUIZ ARENA ====================
async function sendQuizMenu(chatId, messageId = null) {
  const status = store.getUserStatus(chatId);
  const toNextCredit = 100 - (status.score % 100);
  const text =
    `🧠 <b>2-BO‘LIM: INTELLEKTUAL VIKTORINA (QUIZ ARENA)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 <b>Sizning ballaringiz:</b> <b>${status.score} ball</b>\n` +
    `✅ <b>To‘g‘ri javoblar:</b> ${status.quiz_correct} ta | 🔥 <b>Seriya (Streak):</b> ${status.quiz_streak} ta\n` +
    `🎁 <b>Keyingi BEPUL VIDEO gacha:</b> yana <b>${toNextCredit} ball</b> qoldi!\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 <i>Har bir to‘g‘ri javob uchun +10 ball (seriyali javoblarga +15 ballgacha!) beriladi. Har 100 ball to‘plaganingizda avtomatik +1 ta BEPUL VIDEO qo‘shiladi!</i>\n\n` +
    `👇 Savollar yo‘nalishini tanlang:`;

  const kb = [
    [
      { text: '🌍 Dunyo & Tabiat', callback_data: 'quiz_cat:world' },
      { text: '💻 IT, AI & Texnologiya', callback_data: 'quiz_cat:it' }
    ],
    [
      { text: '🇺🇿 O‘zbekiston & Tarix', callback_data: 'quiz_cat:uzb' },
      { text: '⚽ Futbol, Sport & Kino', callback_data: 'quiz_cat:sport' }
    ],
    [
      { text: '🧩 Mantiqiy Topishmoqlar', callback_data: 'quiz_cat:logic' },
      { text: '🎲 Aralash (Barchasi)', callback_data: 'quiz_cat:all' }
    ],
    [
      { text: '🏆 Top-10 Bilimdonlar', callback_data: 'sec_leaderboard' },
      { text: '🏠 Asosiy menyu', callback_data: 'home_menu' }
    ]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

async function sendQuizQuestion(chatId, cat = 'all', messageId = null) {
  const pool = cat === 'all'
    ? QUIZ_QUESTIONS.map((item, idx) => ({ ...item, idx }))
    : QUIZ_QUESTIONS.map((item, idx) => ({ ...item, idx })).filter(item => item.cat === cat);

  const chosen = pool[Math.floor(Math.random() * pool.length)] || { ...QUIZ_QUESTIONS[0], idx: 0 };
  const status = store.getUserStatus(chatId);
  const catNames = {
    world: '🌍 Dunyo & Tabiat',
    it: '💻 IT, AI & Texnologiya',
    uzb: '🇺🇿 O‘zbekiston & Tarix',
    sport: '⚽ Futbol, Sport & Kino',
    logic: '🧩 Mantiqiy Topishmoq',
    all: '🎲 Aralash Viktorina'
  };

  const text =
    `🧠 <b>${catNames[cat] || catNames.all}</b>\n` +
    `🏆 Ball: <b>${status.score}</b> | 🔥 Streak: <b>${status.quiz_streak}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `❓ <b>Savol:</b>\n<b>${chosen.q}</b>\n\n` +
    `👇 To‘g‘ri javobni tanlang:`;

  const letters = ['A', 'B', 'C', 'D'];
  const kb = chosen.opts.map((opt, optIdx) => ([{
    text: `${letters[optIdx]}) ${opt}`,
    callback_data: `quiz_ans:${chosen.idx}:${optIdx}:${cat}`
  }]));
  kb.push([
    { text: '🔄 Boshqa savol', callback_data: `quiz_cat:${cat}` },
    { text: '⬅️ Yo‘nalishlar', callback_data: 'sec_quiz' }
  ]);
  await sendOrEdit(chatId, messageId, text, kb);
}

async function handleQuizAnswer(chatId, messageId, qIdx, optIdx, cat) {
  const qItem = QUIZ_QUESTIONS[qIdx];
  if (!qItem) return sendQuizMenu(chatId, messageId);

  const isCorrect = optIdx === qItem.ans;
  let resultText = '';
  if (isCorrect) {
    const curStatus = store.getUserStatus(chatId);
    const streakBonus = curStatus.quiz_streak >= 2 ? 5 : 0;
    const pts = 10 + streakBonus;
    const res = store.addScore(chatId, pts, 'quiz');
    resultText =
      `✅ <b>TO‘G‘RI JAVOB! (+${pts} ball)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `❓ <i>${qItem.q}</i>\n` +
      `🎯 Javob: <b>${qItem.opts[qItem.ans]}</b>\n\n` +
      `💡 <b>Izoh:</b> ${qItem.info}\n\n` +
      `🏆 Jami ball: <b>${res.score} ball</b> | 🔥 Seriya: <b>${res.streak} ta</b>`;
    if (res.bonusCreditEarned > 0) {
      resultText += `\n\n🎁 <b>TABRIKLAYMIZ! 100 ballik marrani bosib o‘tganingiz uchun sizga +${res.bonusCreditEarned} ta BEPUL VIDEO huquqi berildi!</b>`;
    }
  } else {
    store.addScore(chatId, 0, 'quiz_wrong');
    const st = store.getUserStatus(chatId);
    resultText =
      `❌ <b>Afsus, noto‘g‘ri javob!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `❓ <i>${qItem.q}</i>\n` +
      `✅ To‘g‘ri javob: <b>${qItem.opts[qItem.ans]}</b>\n\n` +
      `💡 <b>Izoh:</b> ${qItem.info}\n\n` +
      `🏆 Jami ball: <b>${st.score} ball</b>`;
  }

  const kb = [
    [{ text: '➡️ Keyingi savol', callback_data: `quiz_cat:${cat}` }],
    [
      { text: '📚 Yo‘nalishni o‘zgartirish', callback_data: 'sec_quiz' },
      { text: '🏠 Asosiy menyu', callback_data: 'home_menu' }
    ]
  ];
  await sendOrEdit(chatId, messageId, resultText, kb);
}

// ==================== SECTION 3: MINI-GAMES & DUEL ARENA ====================
async function sendGamesMenu(chatId, messageId = null) {
  const status = store.getUserStatus(chatId);
  const text =
    `🎮 <b>3-BO‘LIM: MINI-O‘YINLAR VA DUEL ARENA</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 <b>Ballaringiz:</b> <b>${status.score} ball</b> | 🎯 <b>G‘alabalar:</b> <b>${status.games_won} ta</b>\n` +
    `🎁 <i>O‘yinlarda g‘alaba qozonib ball to‘plang — har 100 ballda avtomatik <b>+1 ta BEPUL VIDEO</b> beriladi!</i>\n\n` +
    `👇 O‘ynamoqchi bo‘lgan o‘yiningizni tanlang:`;

  const kb = [
    [
      { text: '❌⭕ X-O (Tic-Tac-Toe) Strategiya', callback_data: 'xo_start' },
      { text: '✂️ Tosh-Qaychi-Qog‘oz Duel', callback_data: 'rps_menu' }
    ],
    [
      { text: '🔢 Yashirin Sonni Top (1-100)', callback_data: 'num_start' },
      { text: '🎁 Kunlik Omad Sandig‘i', callback_data: 'daily_bonus' }
    ],
    [
      { text: '🎰 Jonli Slot (777)', callback_data: 'dice_play:🎰' },
      { text: '🎯 Darts Nishoni', callback_data: 'dice_play:🎯' }
    ],
    [
      { text: '🏀 Basketbol', callback_data: 'dice_play:🏀' },
      { text: '⚽ Futbol Penalti', callback_data: 'dice_play:⚽' }
    ],
    [
      { text: '🎳 Bouling Zarbasi', callback_data: 'dice_play:🎳' },
      { text: '🎲 Omadli Zar', callback_data: 'dice_play:🎲' }
    ],
    [
      { text: '🏆 Top-10 O‘yinchilar', callback_data: 'sec_leaderboard' },
      { text: '🏠 Asosiy menyu', callback_data: 'home_menu' }
    ]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

// --- Game 3.1: X-O (Tic-Tac-Toe) against Smart Bot AI ---
const XO_WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function checkXoWinner(board) {
  for (const [a, b, c] of XO_WIN_LINES) {
    if (board[a] !== '.' && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return board.includes('.') ? null : 'D';
}

function chooseBotXoMove(board) {
  const empty = [];
  for (let i = 0; i < 9; i++) if (board[i] === '.') empty.push(i);
  if (!empty.length) return -1;

  // 1. Check if bot (O) can win in 1 move
  for (const idx of empty) {
    const copy = [...board];
    copy[idx] = 'O';
    if (checkXoWinner(copy) === 'O') return idx;
  }
  // 2. Block player (X) if they can win in 1 move
  for (const idx of empty) {
    const copy = [...board];
    copy[idx] = 'X';
    if (checkXoWinner(copy) === 'X') return idx;
  }
  // 3. Take center or corners with slight randomness so player can beat it with clever tactics
  if (board[4] === '.' && Math.random() < 0.75) return 4;
  const corners = [0, 2, 6, 8].filter(i => board[i] === '.');
  if (corners.length && Math.random() < 0.7) {
    return corners[Math.floor(Math.random() * corners.length)];
  }
  return empty[Math.floor(Math.random() * empty.length)];
}

function buildXoKeyboard(board, finished = false) {
  const sym = { '.': '⬜', 'X': '❌', 'O': '⭕' };
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = [];
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      row.push({
        text: sym[board[idx]] || '⬜',
        callback_data: finished || board[idx] !== '.' ? 'xo_noop' : `xo_m:${board.join('')}:${idx}`
      });
    }
    rows.push(row);
  }
  rows.push([
    { text: '🔄 Yangi o‘yin', callback_data: 'xo_start' },
    { text: '⬅️ O‘yinlarga qaytish', callback_data: 'sec_games' }
  ]);
  return rows;
}

async function startXoGame(chatId, messageId = null) {
  const board = Array(9).fill('.');
  const text =
    `❌⭕ <b>X-O (TIC-TAC-TOE) STRATEGIYA O‘YINI</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Siz: <b>❌ (X)</b> | Bot AI: <b>⭕ (O)</b>\n` +
    `🏆 G‘alaba uchun: <b>+15 ball</b> (Durang: +5 ball)\n\n` +
    `👇 Bo‘sh kataklardan birini bosing:`;
  await sendOrEdit(chatId, messageId, text, buildXoKeyboard(board, false));
}

async function handleXoMove(chatId, messageId, boardStr, pos) {
  const board = boardStr.split('');
  if (board.length !== 9 || board[pos] !== '.') return;

  board[pos] = 'X';
  let winner = checkXoWinner(board);

  if (!winner) {
    const botIdx = chooseBotXoMove(board);
    if (botIdx >= 0) board[botIdx] = 'O';
    winner = checkXoWinner(board);
  }

  let statusLine = '👇 Navbat sizda — keyingi katakni tanlang:';
  let finished = false;

  if (winner === 'X') {
    finished = true;
    const res = store.addScore(chatId, 15, 'game');
    statusLine = `🎉 <b>G‘ALABA! Siz Bot AI ni mag‘lub etdingiz! (+15 ball)</b>\n🏆 Jami ball: <b>${res.score} ball</b>`;
    if (res.bonusCreditEarned > 0) {
      statusLine += `\n🎁 <b>+1 ta BEPUL VIDEO huquqi qo‘shildi!</b>`;
    }
  } else if (winner === 'O') {
    finished = true;
    statusLine = `🤖 <b>Bot AI g‘alaba qozondi!</b> Yana urinib ko‘ring!`;
  } else if (winner === 'D') {
    finished = true;
    const res = store.addScore(chatId, 5);
    statusLine = `🤝 <b>DURANG! (+5 ball)</b>\n🏆 Jami ball: <b>${res.score} ball</b>`;
  }

  const text =
    `❌⭕ <b>X-O (TIC-TAC-TOE) STRATEGIYA O‘YINI</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Siz: <b>❌ (X)</b> | Bot AI: <b>⭕ (O)</b>\n\n` +
    `${statusLine}`;

  await sendOrEdit(chatId, messageId, text, buildXoKeyboard(board, finished));
}

// --- Game 3.2: Rock Paper Scissors (Tosh-Qaychi-Qog'oz) ---
async function sendRpsMenu(chatId, messageId = null, resultBanner = '') {
  const st = store.getUserStatus(chatId);
  const text =
    `✂️ <b>TOSH — QAYCHI — QOG‘OZ DUELI</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 Jami ballaringiz: <b>${st.score} ball</b>\n` +
    (resultBanner ? `\n${resultBanner}\n` : '') +
    `\n👇 Qurolingizni tanlang va Bot bilan bellashing:`;

  const kb = [
    [
      { text: '🪨 Tosh', callback_data: 'rps_p:rock' },
      { text: '✂️ Qaychi', callback_data: 'rps_p:scissors' },
      { text: '📄 Qog‘oz', callback_data: 'rps_p:paper' }
    ],
    [{ text: '⬅️ O‘yinlar menyusi', callback_data: 'sec_games' }]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

async function handleRpsPlay(chatId, messageId, userPick) {
  const choices = ['rock', 'scissors', 'paper'];
  const labels = { rock: '🪨 Tosh', scissors: '✂️ Qaychi', paper: '📄 Qog‘oz' };
  const botPick = choices[Math.floor(Math.random() * choices.length)];

  let banner = `👤 Siz: <b>${labels[userPick]}</b>  ⚡  🤖 Bot: <b>${labels[botPick]}</b>\n`;
  if (userPick === botPick) {
    const r = store.addScore(chatId, 3);
    banner += `🤝 <b>DURANG! (+3 ball)</b>`;
    if (r.bonusCreditEarned > 0) banner += `\n🎁 <b>+1 ta BEPUL VIDEO qo‘shildi!</b>`;
  } else if (
    (userPick === 'rock' && botPick === 'scissors') ||
    (userPick === 'scissors' && botPick === 'paper') ||
    (userPick === 'paper' && botPick === 'rock')
  ) {
    const r = store.addScore(chatId, 10, 'game');
    banner += `🎉 <b>SIZ YUTDINGIZ! (+10 ball)</b>`;
    if (r.bonusCreditEarned > 0) banner += `\n🎁 <b>+1 ta BEPUL VIDEO qo‘shildi!</b>`;
  } else {
    banner += `😅 <b>Bot yutdi!</b> Yana bitta revansh oling!`;
  }
  await sendRpsMenu(chatId, messageId, banner);
}

// --- Game 3.3: Guess The Secret Number (1 - 100) ---
async function startNumberGuessGame(chatId, messageId = null) {
  const secret = Math.floor(Math.random() * 100) + 1;
  USER_STATES.set(String(chatId), {
    action: 'game_guess_number',
    secret,
    attempts: 0,
    maxAttempts: 7,
    low: 1,
    high: 100
  });
  const text =
    `🔢 <b>YASHIRIN SONNI TOP (1 dan 100 gacha)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖 Men <b>1 dan 100 gacha</b> bo‘lgan bitta sirli son o‘yladim!\n` +
    `🎯 Sizda <b>7 ta urinish</b> bor. Topganingiz uchun <b>+25 ball</b> olasiz!\n\n` +
    `✍️ <b>Taxminingizni chatga son bilan yozib yuboring</b> yoki pastdagi tezkor tugmalardan foydalaning:`;

  const kb = [
    [
      { text: '🎯 25', callback_data: 'num_g:25' },
      { text: '🎯 50', callback_data: 'num_g:50' },
      { text: '🎯 75', callback_data: 'num_g:75' }
    ],
    [{ text: '⬅️ O‘yinlarga qaytish', callback_data: 'sec_games' }]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

async function processNumberGuess(chatId, guessVal, messageId = null) {
  const cid = String(chatId);
  const st = USER_STATES.get(cid);
  if (!st || st.action !== 'game_guess_number') {
    return startNumberGuessGame(chatId, messageId);
  }
  const n = parseInt(guessVal, 10);
  if (isNaN(n) || n < 1 || n > 100) {
    await tgCall('sendMessage', { chat_id: cid, text: '⚠️ Iltimos, 1 dan 100 gacha bo‘lgan son kiriting!' });
    return;
  }
  st.attempts += 1;
  const left = st.maxAttempts - st.attempts;

  if (n === st.secret) {
    USER_STATES.delete(cid);
    const pts = Math.max(15, 30 - (st.attempts - 1) * 3);
    const res = store.addScore(cid, pts, 'game');
    let msg =
      `🎉 <b>QOYIL! TOPDINGIZ! (+${pts} ball)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 Yashirin son haqiqatan ham <b>${st.secret}</b> edi!\n` +
      `⚡ Urinishlar soni: <b>${st.attempts} ta</b>\n` +
      `🏆 Jami ballaringiz: <b>${res.score} ball</b>`;
    if (res.bonusCreditEarned > 0) {
      msg += `\n\n🎁 <b>TABRIKLAYMIZ! Sizga +1 ta BEPUL VIDEO huquqi qo‘shildi!</b>`;
    }
    const kb = [
      [{ text: '🔄 Yana o‘ynash', callback_data: 'num_start' }],
      [{ text: '⬅️ O‘yinlar menyusi', callback_data: 'sec_games' }]
    ];
    return sendOrEdit(cid, messageId, msg, kb);
  }

  if (left <= 0) {
    const secretWas = st.secret;
    USER_STATES.delete(cid);
    const msg =
      `💥 <b>Urinishlar tugadi!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🤖 Men o‘ylagan yashirin son <b>${secretWas}</b> edi.\n` +
      `Yana bir bor omadingizni sinab ko‘ring!`;
    const kb = [
      [{ text: '🔄 Qayta o‘ynash', callback_data: 'num_start' }],
      [{ text: '⬅️ O‘yinlar menyusi', callback_data: 'sec_games' }]
    ];
    return sendOrEdit(cid, messageId, msg, kb);
  }

  if (n < st.secret) {
    st.low = Math.max(st.low, n + 1);
  } else {
    st.high = Math.min(st.high, n - 1);
  }
  const hint = n < st.secret ? '⬆️ <b>KATTAROQ</b> son kiriting!' : '⬇️ <b>KICHIKROQ</b> son kiriting!';
  const mid1 = Math.round((st.low + st.high) / 2);
  const mid2 = Math.max(st.low, Math.min(st.high, Math.round((st.low + mid1) / 2)));
  const mid3 = Math.max(st.low, Math.min(st.high, Math.round((mid1 + st.high) / 2)));
  const candidates = Array.from(new Set([mid2, mid1, mid3])).sort((a, b) => a - b);

  const msg =
    `🔢 <b>Sizning taxminingiz: ${n}</b>\n` +
    `${hint}\n\n` +
    `📏 Oraliq: <b>${st.low} — ${st.high}</b>\n` +
    `⏳ Qolgan urinishlar: <b>${left} ta</b>\n\n` +
    `✍️ Son yozib yuboring yoki pastdagi taxminlardan birini bosing:`;

  const kb = [
    candidates.map(c => ({ text: `🎯 ${c}`, callback_data: `num_g:${c}` })),
    [{ text: '⬅️ O‘yinlarga qaytish', callback_data: 'sec_games' }]
  ];
  await sendOrEdit(cid, messageId, msg, kb);
}

// --- Game 3.4: Telegram Native Animated Dice / Casino ---
async function playTelegramDiceGame(chatId, emoji = '🎰') {
  const diceResp = await tgCall('sendDice', { chat_id: chatId, emoji });
  const val = diceResp?.result?.dice?.value || 1;

  // Wait 3.2s for Telegram dice animation to finish before showing reward
  await new Promise(r => setTimeout(r, 3200));

  let wonPts = 3;
  let title = '';
  if (emoji === '🎰') {
    if (val === 64) { wonPts = 50; title = '💎 JACKPOT 777! DAHSHATLI YUTUQ!'; }
    else if ([1, 22, 43].includes(val)) { wonPts = 30; title = '🔥 SUPER KOMBINATSIYA! 3 ta bir xil!'; }
    else if (val % 5 === 0) { wonPts = 12; title = '✨ Omadli aylanish!'; }
    else { wonPts = 4; title = '🎰 Yaxshi urinish! Yana aylantirib ko‘ring!'; }
  } else if (emoji === '🎯') {
    if (val === 6) { wonPts = 20; title = '🎯 MARKAZGA (BULLSEYE) TEGDI!'; }
    else if (val >= 4) { wonPts = 10; title = '👏 Juda yaqin zarba!'; }
    else { wonPts = 3; title = '🎯 Keyingi safar aniq markazga tegadi!'; }
  } else if (emoji === '🏀') {
    if (val >= 4) { wonPts = 15; title = '🏀 TO‘P SAVATGA TUSHDI! (3 ochko!)'; }
    else { wonPts = 3; title = '🏀 Halqaga tegib qaytdi!'; }
  } else if (emoji === '⚽') {
    if (val >= 3) { wonPts = 15; title = '⚽ GOOOOL! Darvozabon ojiz qoldi!'; }
    else { wonPts = 3; title = '⚽ Ustunga tegdi!'; }
  } else if (emoji === '🎳') {
    if (val === 6) { wonPts = 20; title = '🎳 STRIKE! Barcha keglilar yiqildi!'; }
    else if (val >= 4) { wonPts = 10; title = '🎳 Ajoyib zarba!'; }
    else { wonPts = 3; title = '🎳 Yana bir bor urinib ko‘ring!'; }
  } else {
    wonPts = val * 3;
    title = `🎲 Zar natijasi: ${val} tushdi!`;
  }

  const res = store.addScore(chatId, wonPts, wonPts >= 10 ? 'game' : '');
  let text =
    `${title}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 Sizga <b>+${wonPts} ball</b> qo‘shildi!\n` +
    `🏆 Jami ballaringiz: <b>${res.score} ball</b>`;
  if (res.bonusCreditEarned > 0) {
    text += `\n\n🎉 <b>100 ball to‘plaganingiz uchun +1 ta BEPUL VIDEO huquqi berildi!</b>`;
  }

  await tgCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: `🔄 Yana ${emoji} o‘ynash`, callback_data: `dice_play:${emoji}` },
          { text: '🎮 Boshqa o‘yinlar', callback_data: 'sec_games' }
        ]
      ]
    }
  });
}

// --- Game 3.5: Daily Lucky Chest ---
async function handleDailyBonus(chatId, messageId = null) {
  const res = store.claimDailyBonus(chatId);
  let text = '';
  if (!res.ok) {
    text =
      `⏳ <b>Kunlik Omad Sandig‘ini bugun ochib bo‘lgansiz!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🕒 Keyingi sandiq <b>${res.hours} soat ${res.mins} daqiqadan</b> so‘ng ochiladi.\n\n` +
      `💡 Ungacha <b>🧠 Viktorina</b> yoki <b>🎮 Mini-O‘yinlar</b> o‘ynab ball va bepul video yutishingiz mumkin!`;
  } else {
    text =
      `🎁 <b>KUNLIK OMAD SANDIG‘I OCHILDI!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `✨ Sizga <b>+${res.prizePts} ball</b> chiqdi!\n` +
      `🏆 Jami ballaringiz: <b>${res.totalScore} ball</b>`;
    if (res.luckyVideo) {
      text += `\n\n💎 <b>SUPER OMAD! Sandiq ichidan +1 ta BEPUL VIDEO tayyorlash huquqi ham chiqdi!</b>`;
    } else if (res.bonusCredits > 0) {
      text += `\n\n🎉 <b>100 ballik marradan o‘tganingiz uchun +1 ta BEPUL VIDEO qo‘shildi!</b>`;
    }
  }

  const kb = [
    [
      { text: '🧠 Viktorina o‘ynash', callback_data: 'sec_quiz' },
      { text: '🎮 Mini-O‘yinlar', callback_data: 'sec_games' }
    ],
    [{ text: '🏠 Asosiy menyu', callback_data: 'home_menu' }]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

// ==================== SECTION 4: CREATIVE WORKSHOP ====================
async function sendToolsMenu(chatId, messageId = null) {
  const personalUrl = `${LIVE_WEBAPP_URL}/?chat_id=${chatId}&tab=name`;
  const text =
    `🪄 <b>4-BO‘LIM: KREATIV USTAXONA (FOTO, QR, ISM & SHIFR)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Bu bo‘limda bir soniyada foydali va kreativ narsalar yarating:\n\n` +
    `1️⃣ <b>✨ Chiroyli Ism & VIP Nik Dizayner</b> — Ismingizni 12 xil VIP shrift va bezakda chiqarib beradi!\n` +
    `2️⃣ <b>🎬 Ismdan 3D Neon Video Yaratish</b> — Ismingizni 3D gologramma va neon video qilib chiqaradi!\n` +
    `3️⃣ <b>🔳 QR-Kod Generator</b> — Istalgan ssilka, matn yoki Telegram profil uchun yuqori sifatli QR-kod rasm!\n` +
    `4️⃣ <b>🔐 Kiber-Shifrlash (Morze / Binary / Emoji)</b> — Maxfiy xabarlarni kodlash!\n` +
    `5️⃣ <b>🛡 Buzilmas Parol Generator</b> — Xavfsiz parollar to‘plami!`;

  const kb = [
    [
      { text: '✨ Chiroyli Ism & Nik Yaratish', callback_data: 'tool_fancy' },
      { text: '🔳 QR-Kod Yaratish', callback_data: 'tool_qr' }
    ],
    [{ text: '🎬 Ismdan 3D & Neon Video Yaratish (Studiya)', web_app: { url: personalUrl } }],
    [
      { text: '🔐 Kiber-Shifrlash (Morze/01)', callback_data: 'tool_cipher' },
      { text: '🛡 Kuchli Parol Generator', callback_data: 'tool_pass' }
    ],
    [{ text: '🏠 Asosiy menyu', callback_data: 'home_menu' }]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

async function sendPasswordGenerator(chatId, messageId = null) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const syms = '!@#$%^&*+-=';
  const gen = (len, useSym = true) => {
    const pool = useSym ? chars + syms : chars;
    let out = '';
    for (let i = 0; i < len; i++) out += pool[Math.floor(Math.random() * pool.length)];
    return out;
  };
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const text =
    `🛡 <b>BUZILMAS PAROLLAR GENERATORI</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Nusxalash uchun istalgan parol ustiga bir marta bosing:</i>\n\n` +
    `🔑 <b>Standart (10 belgi):</b> <code>${gen(10, false)}</code>\n` +
    `🔥 <b>Kuchli VIP (14 belgi):</b> <code>${gen(14, true)}</code>\n` +
    `💻 <b>Kiber-Xavfsiz (18 belgi):</b> <code>${gen(18, true)}</code>\n` +
    `📶 <b>Wi-Fi uchun qulay:</b> <code>${gen(12, false)}</code>\n` +
    `🔢 <b>6 xonali Maxfiy PIN:</b> <code>${pin}</code>`;

  const kb = [
    [{ text: '🔄 Yangi parollar yaratish', callback_data: 'tool_pass' }],
    [{ text: '⬅️ Kreativ Ustaxonaga qaytish', callback_data: 'sec_tools' }]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

// ==================== SECTION 5: FUN & PSYCHOLOGY WORLD ====================
async function sendFunMenu(chatId, messageId = null) {
  const text =
    `🌟 <b>5-BO‘LIM: QIZIQARLI OLAM (PSIXOLOGIYA, FAKT & YOSH)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `1️⃣ <b>🧬 Psixologik Хarakter Testi</b> — 4 ta savol orqali shaxsiyat arxetipingiz va kuchli jihatlaringizni aniqlang!\n` +
    `2️⃣ <b>💡 Aql Bovar Qilmas Faktlar</b> — Dunyo va koinot haqida eng qiziqarli faktlar!\n` +
    `3️⃣ <b>🔥 Kunlik Motivatsiya & Statuslar</b> — Ruhlantiruvchi aforizmlar!\n` +
    `4️⃣ <b>🎂 Kosmik Yosh & Tug‘ilgan Kun Tahlili</b> — Necha kun, soat va soniya yashaganingizni hisoblang!`;

  const kb = [
    [
      { text: '🧬 Psixologik Хarakter Testi', callback_data: 'psy_start' },
      { text: '🎂 Kosmik Yosh Tahlili', callback_data: 'fun_age' }
    ],
    [
      { text: '💡 Ajoyib Faktlar', callback_data: 'fun_fact' },
      { text: '🔥 Kunlik Motivatsiya', callback_data: 'fun_quote' }
    ],
    [{ text: '🏠 Asosiy menyu', callback_data: 'home_menu' }]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

async function sendRandomFact(chatId, messageId = null) {
  const fact = FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
  const res = store.addScore(chatId, 2);
  const text =
    `💡 <b>BILASIZMI? (QIZIQARLI FAKT)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${fact}\n\n` +
    `✨ <i>Fakt o‘qiganingiz uchun +2 ball! (Jami: ${res.score} ball)</i>`;
  const kb = [
    [{ text: '🔄 Yana boshqa fakt', callback_data: 'fun_fact' }],
    [{ text: '⬅️ Qiziqarli Olamga qaytish', callback_data: 'sec_fun' }]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

async function sendRandomQuote(chatId, messageId = null) {
  const quote = MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)];
  const text =
    `🔥 <b>KUNLIK MOTIVATSIYA VA STATUS</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${quote}\n\n` +
    `💡 <i>Telegram bio yoki story uchun ajoyib fikr!</i>`;
  const kb = [
    [{ text: '🔄 Yana motivatsiya', callback_data: 'fun_quote' }],
    [{ text: '⬅️ Qiziqarli Olamga qaytish', callback_data: 'sec_fun' }]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

async function sendPsyQuestion(chatId, step = 0, scoresStr = '0,0,0,0', messageId = null) {
  if (step >= PSY_QUESTIONS.length) {
    const [l, c, t, ch] = scoresStr.split(',').map(x => parseInt(x, 10) || 0);
    const maxVal = Math.max(l, c, t, ch);
    let profile = '';
    if (maxVal === l) {
      profile =
        `🦁 <b>Sizning arxetipingiz: TUG‘MA LIDER VA STRATEG!</b>\n\n` +
        `✨ Siz qat’iyatli, maqsadga intiluvchan va qiyinchiliklardan qo‘rqmaydigan insonsiz. Odamlar sizning ortingizdan ergashishga va maslahatingizga quloq solishga moyil.\n` +
        `💪 <b>Kuchli tomoningiz:</b> Tezkor qaror qabul qilish, jasorat va yuqori energiya!`;
    } else if (maxVal === c) {
      profile =
        `🎨 <b>Sizning arxetipingiz: KREATIV IJODKOR VA VIZIONER!</b>\n\n` +
        `✨ Siz dunyoni boshqalar ko‘ra olmaydigan ranglar va go‘zallik orqali his qilasiz. Oddiy narsalardan ham san’at va yangilik yarata olasiz.\n` +
        `💪 <b>Kuchli tomoningiz:</b> Boy tasavvur, nozik did va original g‘oyalar!`;
    } else if (maxVal === t) {
      profile =
        `🧠 <b>Sizning arxetipingiz: CHUQUR MUTAFAKKIR VA ANALITIK!</b>\n\n` +
        `✨ Siz har bir ishni yetti o‘lchab bir kesadigan, mantiq va bilimni hamma narsadan ustun qo‘yadigan donishmand insonsiz.\n` +
        `💪 <b>Kuchli tomoningiz:</b> Yuqori intellekt, xotirjamlik va uzoqni ko‘ra bilish!`;
    } else {
      profile =
        `🌟 <b>Sizning arxetipingiz: XARIZMATIK DIPLOMAT VA QALB INSONI!</b>\n\n` +
        `✨ Siz davralarning ruhi, insonlarga tez til topa oladigan va atrofdagilarga pozitiv energiya ulashuvchi insonsiz.\n` +
        `💪 <b>Kuchli tomoningiz:</b> Samimiylik, kuchli kommunikatsiya va liderlik jozibasi!`;
    }

    const res = store.addScore(chatId, 15);
    const text =
      `🧬 <b>PSIXOLOGIK TEST NATIJASI (+15 ball)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${profile}\n\n` +
      `🏆 Jami ballaringiz: <b>${res.score} ball</b>`;

    const kb = [
      [{ text: '🔄 Testni qayta topshirish', callback_data: 'psy_start' }],
      [{ text: '⬅️ Qiziqarli Olamga qaytish', callback_data: 'sec_fun' }]
    ];
    return sendOrEdit(chatId, messageId, text, kb);
  }

  const item = PSY_QUESTIONS[step];
  const text =
    `🧬 <b>PSIXOLOGIK ХARAKTER TESTI</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `❓ <b>${item.q}</b>\n\n` +
    `👇 O‘zingizga eng yaqin javobni tanlang:`;

  const idxMap = { leader: 0, creator: 1, thinker: 2, charisma: 3 };
  const kb = item.opts.map(o => {
    const arr = scoresStr.split(',').map(x => parseInt(x, 10) || 0);
    arr[idxMap[o.type]] += 1;
    return [{
      text: o.t,
      callback_data: `psy_n:${step + 1}:${arr.join(',')}`
    }];
  });
  kb.push([{ text: '⬅️ Ortga', callback_data: 'sec_fun' }]);
  await sendOrEdit(chatId, messageId, text, kb);
}

// ==================== SECTION 6: PROFILE, REFERRAL & LEADERBOARD ====================
async function sendProfileSection(chatId, messageId = null) {
  const status = store.getUserStatus(chatId);
  const rawU = loadData().users[String(chatId)] || {};
  const refLink = `https://t.me/quiz15_testbot?start=ref_${chatId}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('✦ Rasmingizdan 18 xil 3D Gologramma, Matrix 0/1, Kiber Lazer video yasaydigan va ichida Viktorina + Mini-O‘yinlari bor super bot ekan! 1-video BEPUL:')}`;
  const toNextCredit = 100 - (status.score % 100);
  const refsToNextVideo = 3 - (status.referrals_count % 3);

  const text =
    `👤 <b>6-BO‘LIM: SHAXSIY PROFIL VA BEPUL VIDEO</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 <b>ID:</b> <code>${chatId}</code>\n` +
    `👤 <b>Ism:</b> <b>${rawU.name || 'Foydalanuvchi'}</b>\n` +
    `🎖 <b>Daraja:</b> <b>${getUserRankTitle(status.score)}</b>\n` +
    `🏆 <b>To‘plangan ballar:</b> <b>${status.score} ball</b> (Yana ${toNextCredit} ballda +1 bepul video!)\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👑 <b>Premium:</b> ${status.is_premium ? `Faol (${status.premium_days_left} kun qoldi)` : 'Faol emas'}\n` +
    `🎬 <b>Video balansi:</b> <b>${status.credits + status.free_remaining} ta</b> bepul video\n` +
    `📊 <b>Yasalgan videolar:</b> <b>${status.videos_created} ta</b>\n` +
    `👥 <b>Taklif qilgan do‘stlaringiz:</b> <b>${status.referrals_count} ta</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 <b>QANDAY QILIB BEPUL VIDEO OLISH MUMKIN?</b>\n` +
    `1️⃣ Har <b>3 ta do‘stingizni</b> shaxsiy havolangiz orqali taklif qilsangiz — avtomatik <b>+1 ta BEPUL VIDEO</b> va <b>+105 ball</b> olasiz! (Yana <b>${refsToNextVideo} ta</b> do‘st qoldi)\n` +
    `2️⃣ Viktorina va O‘yinlarda har <b>100 ball</b> to‘plaganingizda — avtomatik <b>+1 ta BEPUL VIDEO</b> beriladi!\n\n` +
    `🔗 <b>Sizning shaxsiy referal havolangiz:</b>\n<code>${refLink}</code>`;

  const kb = [
    [{ text: '📤 Do‘stlarga ulashish (+Bepul Video)', url: shareUrl }],
    [
      { text: '🎁 Kunlik Omad Sandig‘i', callback_data: 'daily_bonus' },
      { text: '🏆 Top-10 Reyting', callback_data: 'sec_leaderboard' }
    ],
    [
      { text: '💎 Tariflar va To‘lov', callback_data: 'tarifs' },
      { text: '🏠 Asosiy menyu', callback_data: 'home_menu' }
    ]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
}

async function sendLeaderboardSection(chatId, messageId = null) {
  const top = store.getTopUsers(10);
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  let listTxt = '';
  top.forEach((u, idx) => {
    const safeName = String(u.name || 'Foydalanuvchi').replace(/[<>&]/g, '');
    listTxt += `${medals[idx] || '▪️'} <b>${safeName}</b> — 🏆 <b>${u.score} ball</b> | 🎬 ${u.videos_created} video\n`;
  });
  if (!listTxt) listTxt = 'Hozircha reyting shakllanmoqda.';

  const myStatus = store.getUserStatus(chatId);
  const text =
    `🏆 <b>TOP-10 ENG FAOL FOYDALANUVCHILAR REYTINGI</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${listTxt}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Sizning natijangiz:</b> 🏆 <b>${myStatus.score} ball</b> | 🎬 <b>${myStatus.videos_created} video</b>\n` +
    `💡 <i>Viktorina, Mini-O‘yinlar va Do‘stlar taklifi orqali ball to‘plab TOP-1 ga chiqing!</i>`;

  const kb = [
    [
      { text: '🧠 Viktorina (+Ball)', callback_data: 'sec_quiz' },
      { text: '🎮 Mini-O‘yinlar (+Ball)', callback_data: 'sec_games' }
    ],
    [
      { text: '👤 Mening Profilim', callback_data: 'sec_profile' },
      { text: '🏠 Asosiy menyu', callback_data: 'home_menu' }
    ]
  ];
  await sendOrEdit(chatId, messageId, text, kb);
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

async function sendAdminPanel(chatId, messageId = null) {
  if (!store.claimAdminIfEmpty(chatId)) {
    return tgCall('sendMessage', { chat_id: chatId, text: '⛔ Bu bo‘lim faqat bot admini uchun!' });
  }
  const s = store.getSettings();
  const st = store.getStats();
  const admins = store.getAdminIds();
  const dbStatus = pgPool ? '🟢 Neon PostgreSQL ulangan' : '🟡 Local JSON';
  const text =
    `⚙️ <b>YANGILANGAN ADMIN PANEL — @quiz15_testbot</b>\n` +
    `🗄 <b>Baza holati:</b> ${dbStatus}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💳 <b>Karta raqami:</b> <code>${s.card_number}</code>\n` +
    `👤 <b>Karta egasi:</b> <b>${s.card_holder}</b>\n` +
    `🎬 <b>1 ta video narxi:</b> <b>${fmtSum(s.video_price)}</b>\n` +
    `👑 <b>Premium (1 oy):</b> <b>${fmtSum(s.premium_price)}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 <b>Foydalanuvchilar:</b> <b>${st.total_users}</b> ta\n` +
    `👑 <b>Faol Premium:</b> <b>${st.active_premium}</b> ta\n` +
    `🎬 <b>Yasalgan videolar:</b> <b>${st.total_videos}</b> ta\n` +
    `⏳ <b>Kutayotgan cheklar:</b> <b>${st.pending_payments}</b> ta\n` +
    `✅ <b>Tasdiqlangan to‘lovlar:</b> <b>${st.approved_payments}</b> ta (<b>${fmtSum(st.total_revenue)}</b>)\n` +
    `🛡 <b>Adminlar (${admins.length}):</b> <code>${admins.join(', ')}</code>`;

  // Arranged cleanly in 2 columns inside Telegram!
  const kb = {
    inline_keyboard: [
      [
        { text: '💳 Karta raqami', callback_data: 'adm_set_card' },
        { text: '👤 Karta egasi', callback_data: 'adm_set_holder' }
      ],
      [
        { text: '🎬 Video narxi', callback_data: 'adm_set_video_price' },
        { text: '👑 Premium narxi', callback_data: 'adm_set_prem_price' }
      ],
      [
        { text: `⏳ Cheklar (${st.pending_payments})`, callback_data: 'adm_pending' },
        { text: `👥 Userlar (${st.total_users})`, callback_data: 'adm_users_list' }
      ],
      [
        { text: '🎁 Limit / Bonus berish', callback_data: 'adm_give_credit' },
        { text: '👑 Premium berish', callback_data: 'adm_give_prem' }
      ],
      [
        { text: '🔍 User tekshirish', callback_data: 'adm_check_user' },
        { text: '📢 Rassilka (E’lon)', callback_data: 'adm_broadcast' }
      ],
      [
        { text: '🔄 Yangilash', callback_data: 'admin_home' }
      ]
    ]
  };
  if (messageId) {
    const res = await tgCall('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: kb
    });
    if (res && res.ok) return;
  }
  await tgCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: kb });
}

async function sendAdminUsersList(chatId) {
  if (!store.isAdmin(chatId)) return;
  const users = store.getAllUsers().sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const now = Math.floor(Date.now() / 1000);
  const slice = users.slice(0, 25);
  let lines = `👥 <b>So‘nggi foydalanuvchilar (${users.length} tadan ${slice.length} tasi):</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
  slice.forEach((u, idx) => {
    const isPrem = (parseInt(u.premium_until || 0, 10) || 0) > now;
    const badge = isPrem ? '👑' : (u.credits > 0 ? `🎬(${u.credits})` : (u.free_used ? '⚪' : '🎁'));
    const uname = u.username ? ` (@${u.username})` : '';
    lines += `${idx + 1}. ${badge} <code>${u.chat_id}</code> — <b>${u.name || 'Noma’lum'}</b>${uname} | 🎬 ${u.videos_created || 0}\n`;
  });
  lines += `\n💡 <i>Istalgan foydalanuvchi ID raqamini nusxalab «🎁 Limit berish» yoki «👑 Premium berish» tugmasi orqali boshqarishingiz mumkin.</i>`;
  await tgCall('sendMessage', {
    chat_id: chatId,
    text: lines,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🎁 Limit berish', callback_data: 'adm_give_credit' },
          { text: '👑 Premium berish', callback_data: 'adm_give_prem' }
        ],
        [{ text: '⬅️ Admin panelga qaytish', callback_data: 'admin_home' }]
      ]
    }
  });
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
    `📖 <b>SUPER-BOT FOYDALANISH QO‘LLANMASI</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `1️⃣ <b>🎬 1-Bo‘lim: 3D & Neon Video Studiya</b>\n` +
    `   • Rasmingizni yuklang yoki Ismingizni yozing va 18 ta super animatsiyadan birini tanlab MP4 video oling!\n` +
    `   • 1-rasmingiz BEPUL! Keyingilari: 1 ta video <b>${fmtSum(s.video_price)}</b> yoki 1 oy Premium <b>${fmtSum(s.premium_price)}</b>.\n\n` +
    `2️⃣ <b>🧠 2-Bo‘lim: Intellektual Viktorina (Quiz)</b>\n` +
    `   • 5 xil yo‘nalishda savollarga javob bering (+10 ball). Har 100 ballda avtomatik <b>+1 ta BEPUL VIDEO</b> beriladi!\n\n` +
    `3️⃣ <b>🎮 3-Bo‘lim: Mini-O‘yinlar & Duel Arena</b>\n` +
    `   • X-O strategiya, Tosh-Qaychi-Qog‘oz, Yashirin Son (1-100), Jonli Kazino/Sport va Kunlik Omad Sandig‘i!\n\n` +
    `4️⃣ <b>🪄 4-Bo‘lim: Kreativ Ustaxona</b>\n` +
    `   • Chiroyli VIP Ismlar, QR-Kod rasm generator, Kiber-Shifr (Morze/01) va Parollar!\n\n` +
    `5️⃣ <b>🌟 5-Bo‘lim: Qiziqarli Olam</b>\n` +
    `   • Psixologik Хarakter Testi, Ajoyib Faktlar, Motivatsiya va Kosmik Yosh Tahlili!\n\n` +
    `6️⃣ <b>👤 6-Bo‘lim: Profil & Referal (Bepul Video)</b>\n` +
    `   • Har 3 ta do‘stingizni taklif qilib <b>+1 ta BEPUL VIDEO</b> oling va Top-10 Reytingda bellashing!`;

  await tgCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '🏠 Asosiy menyuni ochish', callback_data: 'home_menu' }]]
    }
  });
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
  if (action === 'adm_give_credit') {
    const parts = text.trim().split(/\s+/);
    const targetId = parts[0];
    const count = parts[1] !== undefined ? parseInt(parts[1], 10) : 1;
    if (!/^-?\d+$/.test(targetId) || isNaN(count)) {
      await tgCall('sendMessage', { chat_id: cid, text: '⚠️ Format: <code>ID SONI</code> (masalan: <code>1972059053 5</code>):', parse_mode: 'HTML' });
      return true;
    }
    const u = store.addCredits(targetId, count);
    store.resetFreeTrial(targetId);
    USER_STATES.delete(cid);
    await tgCall('sendMessage', {
      chat_id: cid,
      text: `✅ Foydalanuvchi <code>${targetId}</code> balansiga <b>+${count} ta video</b> qo‘shildi! (Hozirgi balansi: <b>${u.credits} ta</b>)`,
      parse_mode: 'HTML'
    });
    await tgCall('sendMessage', {
      chat_id: targetId,
      text: `🎁 <b>Admin sizga +${count} ta video tayyorlash huquqi (bonus) taqdim etdi!</b>\nIlovaga kirib rasmingizni yuklashingiz mumkin.`,
      parse_mode: 'HTML'
    }).catch(() => {});
    await sendAdminPanel(cid);
    return true;
  }
  if (action === 'adm_give_prem') {
    const parts = text.trim().split(/\s+/);
    const targetId = parts[0];
    const days = parts[1] !== undefined ? parseInt(parts[1], 10) : 30;
    if (!/^-?\d+$/.test(targetId) || isNaN(days)) {
      await tgCall('sendMessage', { chat_id: cid, text: '⚠️ Format: <code>ID KUN</code> (masalan: <code>1972059053 30</code>, bekor qilish uchun <code>ID 0</code>):', parse_mode: 'HTML' });
      return true;
    }
    store.grantPremiumDays(targetId, days);
    USER_STATES.delete(cid);
    await tgCall('sendMessage', {
      chat_id: cid,
      text: days > 0
        ? `✅ Foydalanuvchi <code>${targetId}</code> ga <b>${days} kunlik Premium</b> berildi!`
        : `✅ Foydalanuvchi <code>${targetId}</code> ning Premium obunasi bekor qilindi.`,
      parse_mode: 'HTML'
    });
    if (days > 0) {
      await tgCall('sendMessage', {
        chat_id: targetId,
        text: `👑 <b>Tabriklaymiz! Admin sizga ${days} kunlik CHEKSIZ PREMIUM taqdim etdi!</b>`,
        parse_mode: 'HTML'
      }).catch(() => {});
    }
    await sendAdminPanel(cid);
    return true;
  }
  if (action === 'adm_check_user') {
    const targetId = text.trim();
    if (!/^-?\d+$/.test(targetId)) {
      await tgCall('sendMessage', { chat_id: cid, text: '⚠️ Foydalanuvchi Telegram ID raqamini yuboring:' });
      return true;
    }
    const uStat = store.getUserStatus(targetId);
    const rawU = loadData().users[targetId] || {};
    USER_STATES.delete(cid);
    await tgCall('sendMessage', {
      chat_id: cid,
      text:
        `🔍 <b>Foydalanuvchi ma’lumotlari:</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 <b>ID:</b> <code>${targetId}</code>\n` +
        `👤 <b>Ism:</b> ${rawU.name || 'Noma’lum'} ${rawU.username ? `(@${rawU.username})` : ''}\n` +
        `👑 <b>Premium:</b> ${uStat.is_premium ? `Faol (${uStat.premium_days_left} kun qoldi)` : 'Yo‘q'}\n` +
        `🎬 <b>Video limiti (kredit):</b> ${uStat.credits} ta\n` +
        `🎁 <b>Bepul urinish:</b> ${uStat.free_used ? 'Ishlatilgan' : 'Mavjud (1 ta)'}\n` +
        `📊 <b>Yasalgan videolar:</b> ${uStat.videos_created} ta`,
      parse_mode: 'HTML'
    });
    await sendAdminPanel(cid);
    return true;
  }
  if (action === 'adm_add_admin') {
    const targetId = text.trim();
    if (!/^-?\d+$/.test(targetId)) {
      await tgCall('sendMessage', { chat_id: cid, text: '⚠️ Yangi admin Telegram ID raqamini kiriting:' });
      return true;
    }
    store.addAdmin(targetId);
    USER_STATES.delete(cid);
    await tgCall('sendMessage', { chat_id: cid, text: `✅ Yangi admin qo‘shildi: <code>${targetId}</code>`, parse_mode: 'HTML' });
    await sendAdminPanel(cid);
    return true;
  }
  if (action === 'adm_broadcast') {
    USER_STATES.delete(cid);
    const users = store.getAllUsers();
    let okCount = 0;
    let failCount = 0;
    await tgCall('sendMessage', { chat_id: cid, text: `📢 Rassilka boshlandi (${users.length} ta foydalanuvchiga)...` });
    for (const u of users) {
      const r = await tgCall('sendMessage', {
        chat_id: u.chat_id,
        text: `📢 <b>Yangilik / E’lon:</b>\n\n${text}`,
        parse_mode: 'HTML'
      });
      if (r && r.ok) okCount++;
      else failCount++;
    }
    await tgCall('sendMessage', {
      chat_id: cid,
      text: `✅ <b>Rassilka yakunlandi!</b>\n\n🟢 Yetib bordi: <b>${okCount}</b> ta\n🔴 Yetib bormadi: <b>${failCount}</b> ta`,
      parse_mode: 'HTML'
    });
    await sendAdminPanel(cid);
    return true;
  }
  return false;
}

async function handleUserInteractiveInput(chatId, text) {
  const cid = String(chatId);
  const st = USER_STATES.get(cid);
  if (!st) return false;

  if (st.action === 'game_guess_number') {
    await processNumberGuess(cid, text);
    return true;
  }

  if (st.action === 'tool_fancy_wait') {
    USER_STATES.delete(cid);
    const clean = text.trim().slice(0, 32);
    const styles = generateFancyNames(clean);
    const res = store.addScore(cid, 5);
    const personalNameUrl = `${LIVE_WEBAPP_URL}/?chat_id=${cid}&tab=name&name=${encodeURIComponent(clean)}`;
    const reply =
      `✨ <b>«${clean.replace(/[<>&]/g, '')}» UCHUN VIP DIZAYNLAR (+5 ball)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Nusxalash uchun istalgan variant ustiga bosing:</i>\n\n` +
      styles.map((s, i) => `${i + 1}. ${s}`).join('\n') +
      `\n\n🎬 <b>Shu ismni 3D Gologramma va Neon Video qilishni xohlaysizmi? Pastdagi tugmani bosing!</b>`;

    await tgCall('sendMessage', {
      chat_id: cid,
      text: reply,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: `🎬 «${clean.slice(0, 14)}» ismidan 3D Neon Video Yaratish`, web_app: { url: personalNameUrl } }],
          [
            { text: '✨ Boshqa ism yozish', callback_data: 'tool_fancy' },
            { text: '⬅️ Kreativ Ustaxona', callback_data: 'sec_tools' }
          ]
        ]
      }
    });
    return true;
  }

  if (st.action === 'tool_qr_wait') {
    USER_STATES.delete(cid);
    const raw = text.trim().slice(0, 500);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=18&color=08050f&bgcolor=eef2ff&data=${encodeURIComponent(raw)}`;
    const res = store.addScore(cid, 5);
    const caption =
      `🔳 <b>QR-KOD TAYYOR! (+5 ball)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📝 <b>Ma’lumot:</b> <code>${raw.replace(/[<>&]/g, '').slice(0, 120)}</code>\n` +
      `🏆 Ballaringiz: <b>${res.score} ball</b>\n\n` +
      `✦ @quiz15_testbot Kreativ Ustaxonasi`;

    const kb = {
      inline_keyboard: [
        [
          { text: '🔳 Yangi QR-Kod yaratish', callback_data: 'tool_qr' },
          { text: '⬅️ Kreativ Ustaxona', callback_data: 'sec_tools' }
        ]
      ]
    };
    const photoResp = await tgCall('sendPhoto', {
      chat_id: cid,
      photo: qrUrl,
      caption,
      parse_mode: 'HTML',
      reply_markup: kb
    });
    if (!photoResp || !photoResp.ok) {
      await tgCall('sendMessage', {
        chat_id: cid,
        text: `${caption}\n\n🔗 <a href="${qrUrl}">QR-Kodni yuklab olish</a>`,
        parse_mode: 'HTML',
        reply_markup: kb
      });
    }
    return true;
  }

  if (st.action === 'tool_cipher_wait') {
    USER_STATES.delete(cid);
    const { morse, binary, reversed, emojiCode } = encodeCipherFormats(text);
    const res = store.addScore(cid, 5);
    const msg =
      `🔐 <b>KIBER-SHIFRLASH NATIJASI (+5 ball)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📡 <b>Morze alifbosi:</b>\n<code>${morse}</code>\n\n` +
      `💻 <b>Matrix Binary (0/1):</b>\n<code>${binary}</code>\n\n` +
      `🎭 <b>Maxfiy Emoji-Shifr:</b>\n<code>${emojiCode}</code>\n\n` +
      `🪞 <b>Ko‘zgu (Teskari) matn:</b>\n<code>${reversed.replace(/[<>&]/g, '')}</code>`;

    await tgCall('sendMessage', {
      chat_id: cid,
      text: msg,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔐 Boshqa matn shifrlash', callback_data: 'tool_cipher' },
            { text: '⬅️ Kreativ Ustaxona', callback_data: 'sec_tools' }
          ]
        ]
      }
    });
    return true;
  }

  if (st.action === 'fun_age_wait') {
    const m = text.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!m) {
      await tgCall('sendMessage', {
        chat_id: cid,
        text: '⚠️ Iltimos, tug‘ilgan sanani <b>KK.OO.YYYY</b> formatida yuboring (masalan: <code>15.05.2003</code>):',
        parse_mode: 'HTML'
      });
      return true;
    }
    USER_STATES.delete(cid);
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const birth = new Date(year, month - 1, day);
    const now = new Date();
    const diffMs = Math.max(0, now - birth);
    const totalDays = Math.floor(diffMs / 86400000);
    const totalHours = totalDays * 24;
    const totalMins = totalHours * 60;
    const heartbeats = totalMins * 72;

    let nextBday = new Date(now.getFullYear(), month - 1, day);
    if (nextBday < now) nextBday = new Date(now.getFullYear() + 1, month - 1, day);
    const daysToBday = Math.ceil((nextBday - now) / 86400000);

    const seasons = {
      12: '❄️ Qish farzandi — vazmin, irodali va chuqur fikrlovchi',
      1: '❄️ Qish farzandi — qat’iyatli, lider va maqsadga eltuvchi',
      2: '❄️ Qish farzandi — kreativ, erkin va noodatiy tafakkur sohibi',
      3: '🌸 Bahor farzandi — ilhomlantiruvchi, mehribon va yangilik yaratuvchi',
      4: '🌸 Bahor farzandi — shijoatli, jasur va g‘alabaga intiluvchan',
      5: '🌸 Bahor farzandi — barqaror, ishonchli va go‘zallik shaydosi',
      6: '☀️ Yoz farzandi — quvnoq, kirishimli va tez til topuvchi',
      7: '☀️ Yoz farzandi — samimiy, sadoqatli va kuchli intuitsiya egasi',
      8: '☀️ Yoz farzandi — yorqin, xarizmatik va tug‘ma yetakchi',
      9: '🍂 Kuz farzandi — tartibli, dono va mukammallikka intiluvchi',
      10: '🍂 Kuz farzandi — adolatli, diplomat va nozik did sohibi',
      11: '🍂 Kuz farzandi — kuchli xarakterli, sirli va magnit kabi tortuvchi'
    };

    const res = store.addScore(cid, 10);
    const msg =
      `🎂 <b>KOSMIK YOSH VA TUG‘ILGAN KUN TAHLILI (+10 ball)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📅 <b>Tug‘ilgan sana:</b> ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}\n` +
      `🌍 <b>Yashagan kunlaringiz:</b> <b>${totalDays.toLocaleString('en-US').replace(/,/g, ' ')} kun</b>\n` +
      `⏱ <b>Soatlarda:</b> <b>${totalHours.toLocaleString('en-US').replace(/,/g, ' ')} soat</b>\n` +
      `❤️ <b>Yurak urishlari:</b> ~<b>${heartbeats.toLocaleString('en-US').replace(/,/g, ' ')} marta</b>\n` +
      `🎉 <b>Keyingi tug‘ilgan kungacha:</b> <b>${daysToBday} kun</b> qoldi!\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🌟 <b>Tabiat ta’rifi:</b>\n${seasons[month] || seasons[1]}`;

    await tgCall('sendMessage', {
      chat_id: cid,
      text: msg,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🎂 Boshqa sanani hisoblash', callback_data: 'fun_age' },
            { text: '⬅️ Qiziqarli Olam', callback_data: 'sec_fun' }
          ]
        ]
      }
    });
    return true;
  }

  return false;
}

async function handleUpdate(upd) {
  if (upd.callback_query) {
    const cq = upd.callback_query;
    const cqId = cq.id;
    const chatId = cq.message?.chat?.id;
    const msgId = cq.message?.message_id;
    const data = cq.data || '';
    tgCall('answerCallbackQuery', { callback_query_id: cqId }, 8000).catch(() => {});
    if (!chatId) return;
    const cid = String(chatId);

    if (data === 'xo_noop') return;
    if (data === 'cancel_state') {
      USER_STATES.delete(cid);
      await tgCall('sendMessage', { chat_id: cid, text: '❌ Bekor qilindi.' });
    } else if (data === 'home_menu') {
      USER_STATES.delete(cid);
      const u = cq.from || {};
      await sendStart(cid, u.first_name || '', u.username || '');
    } else if (data === 'sec_studio') {
      USER_STATES.delete(cid);
      await sendStudioSection(cid, msgId);
    } else if (data === 'sec_quiz') {
      USER_STATES.delete(cid);
      await sendQuizMenu(cid, msgId);
    } else if (data.startsWith('quiz_cat:')) {
      const cat = data.split(':')[1] || 'all';
      await sendQuizQuestion(cid, cat, msgId);
    } else if (data.startsWith('quiz_ans:')) {
      const parts = data.split(':');
      const qIdx = parseInt(parts[1], 10);
      const optIdx = parseInt(parts[2], 10);
      const cat = parts[3] || 'all';
      await handleQuizAnswer(cid, msgId, qIdx, optIdx, cat);
    } else if (data === 'sec_games') {
      USER_STATES.delete(cid);
      await sendGamesMenu(cid, msgId);
    } else if (data === 'xo_start') {
      await startXoGame(cid, msgId);
    } else if (data.startsWith('xo_m:')) {
      const parts = data.split(':');
      await handleXoMove(cid, msgId, parts[1], parseInt(parts[2], 10));
    } else if (data === 'rps_menu') {
      await sendRpsMenu(cid, msgId);
    } else if (data.startsWith('rps_p:')) {
      const pick = data.split(':')[1];
      await handleRpsPlay(cid, msgId, pick);
    } else if (data === 'num_start') {
      await startNumberGuessGame(cid, msgId);
    } else if (data.startsWith('num_g:')) {
      const gVal = parseInt(data.split(':')[1], 10);
      await processNumberGuess(cid, gVal, msgId);
    } else if (data.startsWith('dice_play:')) {
      const emoji = data.split(':')[1] || '🎰';
      await playTelegramDiceGame(cid, emoji);
    } else if (data === 'daily_bonus') {
      await handleDailyBonus(cid, msgId);
    } else if (data === 'sec_tools') {
      USER_STATES.delete(cid);
      await sendToolsMenu(cid, msgId);
    } else if (data === 'tool_fancy') {
      USER_STATES.set(cid, { action: 'tool_fancy_wait' });
      await tgCall('sendMessage', {
        chat_id: cid,
        text: '✨ <b>Chiroyli VIP uslubda yozmoqchi bo‘lgan Ismingiz yoki Nik (Nickname) ni yozib yuboring:</b>\n\nNamuna: <code>Xoliqulov</code> yoki <code>Glow King</code>',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'cancel_state' }]] }
      });
    } else if (data === 'tool_qr') {
      USER_STATES.set(cid, { action: 'tool_qr_wait' });
      await tgCall('sendMessage', {
        chat_id: cid,
        text: '🔳 <b>QR-Kod qilmoqchi bo‘lgan havola (link), Telegram @username, telefon raqam yoki matnni yuboring:</b>',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'cancel_state' }]] }
      });
    } else if (data === 'tool_cipher') {
      USER_STATES.set(cid, { action: 'tool_cipher_wait' });
      await tgCall('sendMessage', {
        chat_id: cid,
        text: '🔐 <b>Morze, Binary (0/1) va Maxfiy Emoji-Shifrga o‘tkazish uchun istalgan so‘z yoki jumlani yozib yuboring:</b>',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'cancel_state' }]] }
      });
    } else if (data === 'tool_pass') {
      await sendPasswordGenerator(cid, msgId);
    } else if (data === 'sec_fun') {
      USER_STATES.delete(cid);
      await sendFunMenu(cid, msgId);
    } else if (data === 'fun_fact') {
      await sendRandomFact(cid, msgId);
    } else if (data === 'fun_quote') {
      await sendRandomQuote(cid, msgId);
    } else if (data === 'psy_start') {
      await sendPsyQuestion(cid, 0, '0,0,0,0', msgId);
    } else if (data.startsWith('psy_n:')) {
      const parts = data.split(':');
      await sendPsyQuestion(cid, parseInt(parts[1], 10), parts[2], msgId);
    } else if (data === 'fun_age') {
      USER_STATES.set(cid, { action: 'fun_age_wait' });
      await tgCall('sendMessage', {
        chat_id: cid,
        text: '🎂 <b>Tug‘ilgan sanangizni <code>KK.OO.YYYY</code> formatida yozib yuboring:</b>\n\nNamuna: <code>25.08.2002</code>',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'cancel_state' }]] }
      });
    } else if (data === 'sec_profile') {
      USER_STATES.delete(cid);
      await sendProfileSection(cid, msgId);
    } else if (data === 'sec_leaderboard') {
      USER_STATES.delete(cid);
      await sendLeaderboardSection(cid, msgId);
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
      await sendAdminPanel(cid, cq.message?.message_id);
    } else if (data === 'adm_pending') {
      await sendPendingPayments(cid);
    } else if (data === 'adm_users_list') {
      await sendAdminUsersList(cid);
    } else if ([
      'adm_set_card',
      'adm_set_holder',
      'adm_set_video_price',
      'adm_set_prem_price',
      'adm_give_credit',
      'adm_give_prem',
      'adm_check_user',
      'adm_add_admin',
      'adm_broadcast'
    ].includes(data)) {
      if (!store.isAdmin(cid)) return;
      USER_STATES.set(cid, { action: data });
      const prompts = {
        adm_set_card: '💳 Yangi <b>karta raqamini</b> yuboring (masalan: <code>8600 1234 5678 9012</code>):',
        adm_set_holder: '👤 <b>Karta egasining ism familiyasini</b> yuboring (masalan: <code>Ali Valiyev</code>):',
        adm_set_video_price: '🎬 <b>1 ta video tayyorlash narxini</b> so‘mda kiriting (masalan: <code>3000</code>):',
        adm_set_prem_price: '👑 <b>1 oylik cheksiz Premium narxini</b> so‘mda kiriting (masalan: <code>25000</code>):',
        adm_give_credit: '🎁 Foydalanuvchi <b>Telegram ID</b> raqami va beriladigan <b>video sonini</b> yuboring:\n\nNamuna: <code>1972059053 5</code>',
        adm_give_prem: '👑 Foydalanuvchi <b>Telegram ID</b> raqami va <b>Premium kunlar sonini</b> yuboring:\n\nNamuna: <code>1972059053 30</code> (bekor qilish uchun <code>ID 0</code>)',
        adm_check_user: '🔍 Tekshirmoqchi bo‘lgan foydalanuvchining <b>Telegram ID</b> raqamini yuboring:',
        adm_add_admin: '➕ Yangi admin qilmoqchi bo‘lgan foydalanuvchining <b>Telegram ID</b> raqamini yuboring:',
        adm_broadcast: '📢 Barcha foydalanuvchilarga yuboriladigan <b>xabar matnini</b> yozib yuboring:'
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
    const refId = arg.startsWith('ref_') ? arg.slice(4) : null;
    store.ensureUser(chatId, firstName, username, refId);
    if (arg === 'buy_video') return promptPaymentReceipt(chatId, 'video');
    if (arg === 'buy_premium') return promptPaymentReceipt(chatId, 'premium');
    return sendStart(chatId, firstName, username, refId);
  }
  if (text.startsWith('/studio') || text.includes('3D & Neon')) {
    USER_STATES.delete(String(chatId));
    return sendStudioSection(chatId);
  }
  if (text.startsWith('/quiz') || text.includes('Viktorina')) {
    USER_STATES.delete(String(chatId));
    return sendQuizMenu(chatId);
  }
  if (text.startsWith('/games') || text.includes('Mini-O‘yinlar')) {
    USER_STATES.delete(String(chatId));
    return sendGamesMenu(chatId);
  }
  if (text.startsWith('/tools') || text.includes('Kreativ Ustaxona')) {
    USER_STATES.delete(String(chatId));
    return sendToolsMenu(chatId);
  }
  if (text.startsWith('/fun') || text.includes('Qiziqarli Olam')) {
    USER_STATES.delete(String(chatId));
    return sendFunMenu(chatId);
  }
  if (text.startsWith('/profile') || text.includes('Profil & Bonus')) {
    USER_STATES.delete(String(chatId));
    return sendProfileSection(chatId);
  }
  if (text.startsWith('/top') || text.includes('Top Reyting')) {
    USER_STATES.delete(String(chatId));
    return sendLeaderboardSection(chatId);
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
  if (text && (await handleUserInteractiveInput(chatId, text))) return;

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
