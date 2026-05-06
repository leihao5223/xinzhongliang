process.env.TZ = process.env.TZ || 'Asia/Shanghai';

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const paths = require('./paths');
paths.ensureRuntimeDirs();

const store = require('./store');
const liveQuotes = require('./liveQuotes');
const { searchSinaSuggest } = require('./sinaSearch');
const sd = require('./supportData');
const securityPresets = require('./securityPresets');

/** 与 supportData.userKindIsReal 一致；线上若只更新了 index.js 未同步 supportData.js 时避免崩溃 */
function isRealUserId(userId) {
  if (typeof sd.userKindIsReal === 'function') return sd.userKindIsReal(userId);
  const u = sd.getUserById(userId);
  if (!u) return true;
  return u.userKind !== 'sales';
}
const tradeOrders = require('./tradeOrders');
const { CHINESE_BANKS } = require('./chineseBanks');

function pubMsg(m) {
  if (!m) return null;
  return {
    id: m.id,
    session_id: m.sessionId,
    sender_role: m.senderRole,
    sender_id: m.senderId,
    content: m.content,
    read_at: m.readAt ?? null,
    created_at: m.createdAt,
  };
}

const app = express();
const server = http.createServer(app);
/** Socket.IO 实例；在文件后部初始化，供较早注册的路由（如客服开会话）在请求时安全使用 */
let io;
const PORT = Number(process.env.PORT) || 3001;
/** 部署后访问 GET /api/health 可核对与本仓库是否一致；更新后端时顺手改一位字母/数字即可 */
const SERVER_RELEASE_TAG = '20260502a';
const isProd = process.env.NODE_ENV === 'production';
/** 用户端静态资源根：xinzhongliang 默认直接托管仓库根静态页；可用 CLIENT_DIST 覆盖为 app/<path>。 */
const clientDistRelRaw = String(process.env.CLIENT_DIST || '__repo_root__').replace(/\\/g, '/');
const clientDistParts = clientDistRelRaw.split('/').filter((p) => p && p !== '.' && p !== '..');
const distDir =
  clientDistRelRaw === '__repo_root__' ? paths.repoRoot : path.join(__dirname, '..', ...clientDistParts);
const distIndexExists = fs.existsSync(path.join(distDir, 'index.html'));
/** systemd 常直接 ExecStart=node index.js，未走 npm start 则无 NODE_ENV；不挂载 dist 时 /admin/* 会 Cannot GET */
const serveClientDist =
  isProd || (distIndexExists && process.env.NODE_ENV !== 'development');
/** 生产环境默认仅本机监听，配合 Nginx 反代；需直连时可设 LISTEN_HOST=0.0.0.0 */
const LISTEN_HOST =
  process.env.LISTEN_HOST !== undefined && process.env.LISTEN_HOST !== ''
    ? process.env.LISTEN_HOST
    : isProd
      ? '127.0.0.1'
      : undefined;

const JWT_SECRET = process.env.JWT_SECRET || 'zhongliang_dev_jwt_change_me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const uploadsDir = paths.uploadsSupportDir;
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '8mb' }));

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  if (xf) return xf.slice(0, 80);
  const xr = String(req.headers['x-real-ip'] || '').trim();
  if (xr) return xr.slice(0, 80);
  const rip = req.socket && req.socket.remoteAddress;
  return String(rip || '')
    .replace(/^::ffff:/, '')
    .slice(0, 80);
}

const ipGeoCache = new Map();
const IP_GEO_TTL_MS = 6 * 3600000;
const PRIVATE_IP_RE = /^(10\.|127\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|localhost$)/i;

async function resolveIpLocation(ip) {
  const raw = String(ip || '').trim();
  if (!raw || PRIVATE_IP_RE.test(raw)) return '';
  const hit = ipGeoCache.get(raw);
  if (hit && Date.now() - hit.ts < IP_GEO_TTL_MS) return hit.loc;
  const saveLoc = (loc) => {
    const s = String(loc || '').trim();
    if (!s) return '';
    ipGeoCache.set(raw, { loc: s, ts: Date.now() });
    return s;
  };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const rsp = await fetch(`https://ipwho.is/${encodeURIComponent(raw)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (rsp.ok) {
      const j = await rsp.json();
      if (j && j.success !== false) {
        const country = String(j.country || '').trim();
        const region = String(j.region || '').trim();
        const city = String(j.city || '').trim();
        const loc = [region, city].filter(Boolean).join(' ') || country || '';
        if (loc) return saveLoc(loc);
      }
    }
  } catch {
    /* try fallback */
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const rsp = await fetch(`https://ipapi.co/${encodeURIComponent(raw)}/json/`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!rsp.ok) return '';
    const j = await rsp.json();
    const country = String(j.country_name || '').trim();
    const region = String(j.region || '').trim();
    const city = String(j.city || '').trim();
    const loc = [region, city].filter(Boolean).join(' ') || country || '';
    return saveLoc(loc);
  } catch {
    return '';
  }
}

/** 经 Nginx 等反代时设为 1，以便识别 HTTPS 并下发 HSTS（仅安全连接启用） */
const TRUST_PROXY = Number(process.env.TRUST_PROXY || 0);
if (TRUST_PROXY > 0) {
  app.set('trust proxy', TRUST_PROXY);
}

if (isProd) {
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    const xfProto = String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const secure = Boolean(req.secure || xfProto === 'https');
    if (secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
}

function expectedUserSessionVersion(u) {
  if (!u) return null;
  const v = Number(u.sessionVersion);
  if (Number.isFinite(v) && v >= 1) return v;
  return 1;
}

function signUserAccessToken(user) {
  const sv = expectedUserSessionVersion(user);
  return jwt.sign({ sub: user.id, role: 'user', typ: 'access', sv }, JWT_SECRET, { expiresIn: '30d' });
}

function authUser(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, message: '未登录' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (p.role === 'admin' || p.typ === 'admin') return res.status(403).json({ success: false, message: '请使用用户端登录' });
    const u = sd.getUserById(p.sub);
    if (!u) return res.status(401).json({ success: false, message: '登录已失效' });
    const need = expectedUserSessionVersion(u);
    const tokenSv = Number(p.sv);
    const legacyNoSv = p.sv === undefined && need === 1;
    if (!legacyNoSv && (!Number.isFinite(tokenSv) || tokenSv !== need)) {
      return res.status(401).json({ success: false, message: '登录已失效，请重新登录' });
    }
    req.user = { id: p.sub };
    next();
  } catch {
    return res.status(401).json({ success: false, message: '登录已失效' });
  }
}

function authAdmin(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, message: '未登录' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (p.role !== 'admin') return res.status(403).json({ success: false, message: '需要管理员' });
    req.admin = { id: p.sub };
    next();
  } catch {
    return res.status(401).json({ success: false, message: '登录已失效' });
  }
}

const rateBucket = new Map();
/** 返回给前端的用户对象，去掉哈希与密保敏感字段 */
function userForAuthResponse(user) {
  if (!user) return null;
  const {
    passwordHash,
    passwordSalt,
    tradePasswordHash,
    tradePasswordSalt,
    securityQuestions,
    sessionVersion,
    ...safe
  } = user;
  return safe;
}

function rateLimitUser(userId, max = 40, winMs = 60000) {
  const now = Date.now();
  let b = rateBucket.get(userId);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + winMs };
    rateBucket.set(userId, b);
  }
  b.count += 1;
  if (b.count > max) return false;
  return true;
}

// --- 公开 ---
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'zhongliang-api',
    support: 'socket.io',
    env: isProd ? 'production' : 'development',
    serveClientDist,
    serverReleaseTag: SERVER_RELEASE_TAG,
    timezone: process.env.TZ || 'system-default',
    serverTimeCn: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
    /** false 表示仍在跑旧版 store.js，控盘产品下拉会失败；请同步 store.js 并 restart */
    storeProductSettlementV2: typeof store.getAdminProductSettlementPage === 'function',
    clientDist: clientDistParts.join('/') || 'web/dist',
    runtimeRoot: paths.runtimeRoot,
    runtimeDataDir: paths.dataDir,
  });
});

/** 运行环境 + dist 路径是否存在（排查 systemd 未注入 NODE_ENV、dist 未生成） */
app.get('/api/health/server-meta', (_req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV || null,
    isProd,
    serveClientDist,
    listenHost: LISTEN_HOST ?? null,
    port: PORT,
    distDir,
    distIndexExists,
    distAssetsDirExists: fs.existsSync(path.join(distDir, 'assets')),
    cwd: process.cwd(),
    serverDir: __dirname,
    runtimeRoot: paths.runtimeRoot,
    runtimeDataDir: paths.dataDir,
    runtimeUploadsSupport: paths.uploadsSupportDir,
  });
});

/** 排查白屏：index.html 里引用的 /assets/*.js 是否真实存在（只传了 server 没重新 build 时常为 false） */
app.get('/api/health/front-bundle', (_req, res) => {
  const d = distDir;
  const ih = path.join(d, 'index.html');
  if (!fs.existsSync(ih)) {
    return res.json({ ok: false, reason: 'no_index_html', dist: d });
  }
  const html = fs.readFileSync(ih, 'utf8');
  const jsMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
  const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
  const mainJs = jsMatch ? jsMatch[1] : null;
  const mainCss = cssMatch ? cssMatch[1] : null;
  const jsFs = mainJs ? path.join(d, mainJs.replace(/^\//, '')) : null;
  const cssFs = mainCss ? path.join(d, mainCss.replace(/^\//, '')) : null;
  const assetsDir = path.join(d, 'assets');
  let assetsCount = 0;
  try {
    if (fs.existsSync(assetsDir)) assetsCount = fs.readdirSync(assetsDir).length;
  } catch {
    /* ignore */
  }
  res.json({
    ok: Boolean(mainJs && jsFs && fs.existsSync(jsFs)),
    mainJsHref: mainJs,
    mainJsExists: jsFs ? fs.existsSync(jsFs) : false,
    mainCssHref: mainCss,
    mainCssExists: cssFs ? fs.existsSync(cssFs) : false,
    assetsDirExists: fs.existsSync(assetsDir),
    assetsFileCount: assetsCount,
    hint:
      mainJs && jsFs && !fs.existsSync(jsFs)
        ? 'index.html 与 dist/assets 不一致：请在服务器执行 cd /srv/zhongliang/app && npm run build 后重启服务'
        : null,
  });
});

app.post('/api/auth/guest', (req, res) => {
  try {
    const nickname = String(req.body?.nickname || '').trim().slice(0, 24) || `访客${String(Date.now()).slice(-4)}`;
    const user = sd.createUser({ nickname });
    const token = signUserAccessToken(user);
    res.json({ success: true, token, user: userForAuthResponse(user) });
  } catch (e) {
    console.error('[api/auth/guest]', e);
    res.status(500).json({ success: false, message: e?.message || '访客会话创建失败', code: 'GUEST_FAIL' });
  }
});

app.get('/api/auth/security-question-presets', (_req, res) => {
  res.json({ success: true, list: securityPresets.listPresets() });
});

app.post('/api/auth/register', (req, res) => {
  try {
    const nickname = String(req.body?.nickname || '').trim();
    const password = String(req.body?.password || '');
    const passwordConfirm = String(req.body?.passwordConfirm ?? req.body?.password_confirm ?? '');
    const tradePassword = String(req.body?.tradePassword || '');
    const security = req.body?.security;
    if (password !== passwordConfirm) {
      return res.status(400).json({ success: false, message: '两次输入的登录密码不一致' });
    }
    const user = sd.createRegisteredUser({ nickname, password, tradePassword, security });
    const token = signUserAccessToken(user);
    res.json({ success: true, token, user: userForAuthResponse(user) });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || '注册失败' });
  }
});

/** 忘记密码：根据账号返回密保题干；未设密保时返回 tradePasswordOnly（账号无效时统一文案） */
app.post('/api/auth/recovery-preview', (req, res) => {
  const nickname = String(req.body?.nickname || '').trim();
  const preview = sd.getPublicRecoveryPreview(nickname);
  if (!preview) {
    return res.status(400).json({ success: false, message: '账号不存在或无法使用该流程找回' });
  }
  res.json({
    success: true,
    questions: preview.questions,
    tradePasswordOnly: Boolean(preview.tradePasswordOnly),
  });
});

/** 公开：凭交易密码 + 密保重设登录密码 */
app.post('/api/auth/reset-login-password', (req, res) => {
  try {
    const nickname = String(req.body?.nickname || '').trim();
    const tradePassword = String(req.body?.tradePassword || '');
    const securityAnswers = req.body?.securityAnswers;
    const newPassword = String(req.body?.newPassword || '');
    const passwordConfirm = String(req.body?.passwordConfirm ?? req.body?.password_confirm ?? '');
    if (newPassword !== passwordConfirm) {
      return res.status(400).json({ success: false, message: '两次输入的新密码不一致' });
    }
    sd.resetLoginPasswordPublic({ nickname, tradePassword, securityAnswers, newPassword });
    res.json({ success: true, message: '登录密码已重置，请使用新密码登录' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || '重置失败' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const nickname = String(req.body?.nickname || '').trim();
  const password = String(req.body?.password || '');
  const user = sd.verifyLogin(nickname, password);
  if (!user) return res.status(401).json({ success: false, message: '用户名或密码错误' });
  const token = signUserAccessToken(user);
  res.json({ success: true, token, user: userForAuthResponse(user) });
});

app.post('/api/admin/login', (req, res) => {
  const pw = String(req.body?.password || '');
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ success: false, message: '密码错误' });
  const token = jwt.sign({ sub: 'admin', role: 'admin', typ: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token });
});

app.get('/api/banners', (_req, res) => res.json(store.getBanners()));
app.get('/api/announcements', (_req, res) => res.json(store.getAnnouncements()));
app.get('/api/products', (_req, res) => res.json(store.getProducts()));
app.get('/api/site/active-media', (req, res) => {
  const pageKey = String(req.query.pageKey || req.query.page || '').trim();
  const slotKey = String(req.query.slotKey || req.query.slot || '').trim();
  const item = store.getActiveMediaSchedule(pageKey, slotKey);
  res.json({ success: true, item });
});

/** Steris 首页相册：扫描公共视频目录与 assets/videos，供首页背景轮播 */
const VIDEO_GALLERY_DIR = path.join(__dirname, '..', 'web', 'public', 'video');
const ASSET_VIDEO_DIR = path.join(paths.repoRoot, 'assets', 'videos');
const VIDEO_GALLERY_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v']);
app.get('/api/public/videos', (_req, res) => {
  try {
    const items = [];
    const sources = [
      { dir: VIDEO_GALLERY_DIR, urlPrefix: '/video/' },
      { dir: ASSET_VIDEO_DIR, urlPrefix: '/assets/videos/' },
    ];
    for (const source of sources) {
      if (!fs.existsSync(source.dir)) continue;
      const entries = fs.readdirSync(source.dir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (!VIDEO_GALLERY_EXT.has(ext)) continue;
        const safeBase = path.basename(ent.name);
        if (safeBase !== ent.name) continue;
        items.push({
          url: source.urlPrefix + encodeURIComponent(safeBase),
          type: 'video',
          title: safeBase.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
        });
      }
    }
    items.sort((a, b) => a.url.localeCompare(b.url, 'en', { numeric: true }));
    res.json({ items });
  } catch (e) {
    console.error('[api/public/videos]', e);
    res.status(500).json({ items: [], error: 'read_failed' });
  }
});

app.get('/api/articles', (_req, res) => res.json(store.getArticlesPublic()));
app.get('/api/articles/:slug', (req, res) => {
  const row = store.getArticleBySlug(req.params.slug);
  if (!row) return res.status(404).json({ message: '文章不存在' });
  res.json(row);
});
app.get('/api/sim-settings', (_req, res) => res.json(store.getSimSettings()));
app.get('/api/products/:id', (req, res) => {
  const row = store.getProductById(req.params.id);
  if (!row) return res.status(404).json({ message: '产品不存在' });
  res.json(row);
});

app.get('/api/me/summary', authUser, (req, res) => {
  const row = sd.getAccountSummaryForUser(req.user.id);
  if (!row) {
    return res.status(404).json({ message: '用户不存在' });
  }
  res.json(row);
});

/** 已登录：修改登录密码前展示密保题干 */
app.get('/api/me/security-questions', authUser, (req, res) => {
  const list = sd.getSecurityQuestionsForUserPublic(req.user.id);
  res.json({ success: true, questions: list });
});

/** 已登录：验证交易密码 + 密保后修改登录密码 */
app.post('/api/auth/change-login-password', authUser, (req, res) => {
  try {
    const tradePassword = String(req.body?.tradePassword || '');
    const securityAnswers = req.body?.securityAnswers;
    const newPassword = String(req.body?.newPassword || '');
    const passwordConfirm = String(req.body?.passwordConfirm ?? req.body?.password_confirm ?? '');
    if (newPassword !== passwordConfirm) {
      return res.status(400).json({ success: false, message: '两次输入的新密码不一致' });
    }
    sd.changeLoginPasswordForUser(req.user.id, { tradePassword, securityAnswers, newPassword });
    res.json({ success: true, message: '登录密码已修改，请重新登录' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || '修改失败' });
  }
});

function mapDepositIntentClient(d) {
  const statusMap = { pending: '审核中', approved: '已入账', rejected: '已驳回' };
  const amt = Number(d.amount) || 0;
  return {
    id: d.id,
    channel: '线上充值申请',
    amount: `¥ ${amt.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    status: statusMap[d.status] || d.status,
    createdAt: new Date(d.createdAt).toLocaleString('zh-CN'),
    remark: d.remark || '',
  };
}

/** 入金申请记录（待后台审核入账） */
app.get('/api/me/deposit-orders', authUser, (req, res) => {
  const list = sd.listDepositIntentsForUser(req.user.id).map(mapDepositIntentClient);
  res.json(list);
});

/** 资金流水（余额变动账本） */
app.get('/api/me/transactions', authUser, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const before = req.query.before ? String(req.query.before) : undefined;
  const list = sd.listLedgerForUser(req.user.id, { limit, before });
  res.json({ success: true, list });
});

app.patch('/api/me/profile', authUser, (req, res) => {
  try {
    const body = req.body || {};
    sd.updateOwnProfile(req.user.id, {
      nickname: body.nickname,
      phone: body.phone,
      realName: body.realName,
    });
    const row = sd.getAccountSummaryForUser(req.user.id);
    res.json({ success: true, summary: row });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '更新失败' });
  }
});

app.get('/api/banks/catalog', (_req, res) => {
  res.json({ success: true, list: CHINESE_BANKS });
});

app.get('/api/me/payout-methods', authUser, (req, res) => {
  res.json({ success: true, list: sd.listPayoutMethods(req.user.id) });
});

app.post('/api/me/payout-methods', authUser, (req, res) => {
  try {
    const item = sd.addPayoutMethod(req.user.id, req.body || {});
    res.json({ success: true, item });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '绑定失败' });
  }
});

app.delete('/api/me/payout-methods/:id', authUser, (req, res) => {
  const ok = sd.removePayoutMethod(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: '记录不存在' });
  res.json({ success: true });
});

app.get('/api/me/withdraw-intents', authUser, (req, res) => {
  res.json({ success: true, list: sd.listWithdrawIntents(req.user.id) });
});

/** 充值：登记入金申请并记流水，入账需后台审核 */
app.post('/api/intent/recharge', authUser, (req, res) => {
  try {
    const raw = req.body?.amount;
    const amt = Number(raw);
    if (raw == null || raw === '' || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: '请填写有效充值金额' });
    }
    const remark = String(req.body?.remark || '').trim().slice(0, 200);
    const row = sd.createDepositIntent(req.user.id, amt, remark);
    res.json({
      ok: true,
      id: row.id,
      message: '充值申请已登记。请继续在客服会话中说明付款方式并上传凭证，坐席核对后为您入账。',
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '提交失败' });
  }
});

app.post('/api/intent/withdraw', authUser, (req, res) => {
  try {
    const { amount, payoutMethodId } = req.body || {};
    const row = sd.createWithdrawIntent(req.user.id, amount, payoutMethodId || '');
    res.json({
      ok: true,
      message: `提现申请已提交（单号 ${row.id.slice(-8)}），审核通过后将划入尾号 ${row.cardMask.slice(-4)} 的银行卡`,
      id: row.id,
    });
  } catch (e) {
    if (e.code === 'NEED_BIND_CARD' || e.message === 'NEED_BIND_CARD') {
      return res.status(400).json({
        success: false,
        code: 'NEED_BIND_CARD',
        message: '请先绑定本人名下中国大陆储蓄卡作为提现账户',
      });
    }
    return res.status(400).json({ success: false, message: e.message || '提交失败' });
  }
});
app.get('/api/orders', authUser, (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.json({ success: true, list: tradeOrders.listForUser(req.user.id) });
});

app.get('/api/site/company', (_req, res) => {
  res.json({ success: true, data: store.getCompanyInfo() });
});
app.get('/api/site/company-content', (_req, res) => {
  res.json({ success: true, data: store.getCompanyContent() });
});
app.get('/api/site/sections', (_req, res) => {
  res.json({ success: true, data: store.getSiteSections() });
});

app.get('/api/trade/config', (_req, res) => {
  const c = store.getTradeConfig();
  res.json({ success: true, ...c });
});

app.post('/api/trade/order', authUser, (req, res) => {
  const { productId, direction, amount, durationSec, orderKind, tradePassword } = req.body || {};
  if (!productId || !direction || amount == null) return res.status(400).json({ success: false, message: '参数不全' });
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return res.status(400).json({ success: false, message: '金额无效' });
  const tpCheck = sd.verifyTradePassword(req.user.id, tradePassword);
  if (tpCheck.required && !tpCheck.ok) {
    return res.status(400).json({ success: false, message: '交易密码错误' });
  }
  const summary = sd.getAccountSummaryForUser(req.user.id);
  if (!summary) return res.status(401).json({ success: false, message: '用户不存在' });
  if (a > summary.available) {
    return res.status(400).json({ success: false, message: '可用余额不足（提现冻结金额不可用于下单）' });
  }
  const product = store.getProductById(productId);
  if (!product) return res.status(400).json({ success: false, message: '产品不存在或已下架' });
  const cfg = store.getTradeConfig();
  const ds = Number(durationSec);
  if (!Number.isFinite(ds) || ds !== 600) {
    return res.status(400).json({ success: false, message: '交易锁仓时长固定为 600 秒' });
  }
  const hit = durationOptions => (Array.isArray(durationOptions) ? durationOptions.find((o) => Number(o?.durationSec) === 600) : null);
  const pRate = Number(product.tradeProfitRate);
  const cRate = Number(hit(cfg.durationOptions)?.profitRate);
  const baseRate =
    Number.isFinite(pRate) && pRate > 0 ? pRate : Number.isFinite(cRate) && cRate > 0 ? cRate : 0.95;
  const directionalRate =
    typeof store.activeDirectionalProfitRate === 'function'
      ? Number(store.activeDirectionalProfitRate(Number(productId), direction === 'short' ? 'short' : 'long'))
      : NaN;
  const rate =
    Number.isFinite(directionalRate) && directionalRate > 0 ? directionalRate : baseRate;
  const durSec = 600;
  const u = sd.getUserById(req.user.id);
  if (!u) return res.status(401).json({ success: false, message: '用户不存在' });
  const snapBefore = sd.snapshotAccount(req.user.id);
  const acc = sd.ensureAccount(u);
  acc.available = +(Number(acc.available || 0) - a).toFixed(2);
  acc.totalAsset = +(Number(acc.totalAsset || 0) - a).toFixed(2);
  sd.save();
  const baseP = Number(product.basePrice);
  const jitter = Math.max(0.0001, baseP * (0.0005 + Math.random() * 0.002));
  const openPrice = +(baseP + (Math.random() - 0.5) * jitter * 0.3).toFixed(4);
  const snapAfterOpen = sd.snapshotAccount(req.user.id);
  const balanceAfterOpen = snapAfterOpen ? +Number(snapAfterOpen.available).toFixed(2) : null;
  const endsAt = Date.now() + durSec * 1000;
  const orderRow = {
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: req.user.id,
    productId: Number(productId),
    productName: product.name || product.tradeName,
    direction: direction === 'short' ? 'short' : 'long',
    amount: a,
    durationSec: durSec,
    profitRate: rate,
    orderKind: orderKind === 'entrust' ? 'entrust' : 'market',
    status: 'open',
    openPrice,
    closePrice: null,
    result: null,
    profitAmount: null,
    settlementNote: null,
    createdAt: new Date().toISOString(),
    endsAt,
    settledAt: null,
    balanceAfterOpen,
  };
  tradeOrders.insertOrder(orderRow);
  try {
    sd.appendLedger(req.user.id, {
      type: 'trade_open',
      title: `交易开仓 · ${orderRow.productName}（${orderRow.direction === 'short' ? '买跌' : '买涨'}）`,
      deltaAvailable: -a,
      deltaTotal: -a,
      deltaFrozen: 0,
      refType: 'order',
      refId: orderRow.id,
      meta: {
        direction: orderRow.direction,
        stake: a,
        durationSec: durSec,
        profitRate: rate,
        balanceBefore: snapBefore ? +Number(snapBefore.available || 0).toFixed(2) : null,
        balanceAfterOpen: balanceAfterOpen,
      },
    });
  } catch (e) {
    console.error('[trade/order] appendLedger trade_open', e);
  }
  res.json({
    success: true,
    message: orderKind === 'entrust' ? '委买单已提交，持仓倒计时结束后自动结算' : '订单已提交，持仓倒计时结束后自动结算',
    order: orderRow,
  });
});

// --- 客服：用户 ---
app.get('/api/support/faq', (_req, res) => {
  res.json({ success: true, list: sd.getFaq() });
});

app.post('/api/support/session/open', authUser, async (req, res) => {
  const ip = clientIp(req);
  const ipLoc = await resolveIpLocation(ip);
  const session = sd.openOrCreateSession(req.user.id, ip, ipLoc);
  const u = sd.getUserById(req.user.id);
  if (io) {
    io.to('support_admin_room').emit('support:session_updated', {
      session: {
        id: session.id,
        user_id: session.userId,
        client_ip: session.clientIp || null,
        client_ip_location: session.clientIpLocation || null,
        last_message_at: session.lastMessageAt,
      },
      username: u?.nickname || '用户',
    });
  }
  const pub = { ...session };
  delete pub.clientIp;
  delete pub.clientIpLocation;
  delete pub.ipSeenAt;
  res.json({ success: true, session: pub });
});

app.post('/api/support/upload-image', authUser, (req, res) => {
  const imageBase64 = String(req.body?.imageBase64 || '');
  if (!imageBase64) return res.status(400).json({ message: '图片不能为空' });
  const match = imageBase64.match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,([a-zA-Z0-9+/=\n\r]+)$/);
  if (!match) return res.status(400).json({ message: '仅支持 PNG/JPG/WEBP/GIF' });
  const ext = match[2].includes('png') ? 'png' : match[2].includes('webp') ? 'webp' : match[2].includes('gif') ? 'gif' : 'jpg';
  const raw = Buffer.from(match[3], 'base64');
  if (!raw.length || raw.length > 5 * 1024 * 1024) return res.status(400).json({ message: '图片无效或超过 5MB' });
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const full = path.join(uploadsDir, name);
  fs.writeFileSync(full, raw);
  res.json({ success: true, url: `/uploads/support/${name}` });
});

app.use('/uploads/support', express.static(uploadsDir));

app.get('/api/support/messages', authUser, (req, res) => {
  const { session_id, before, limit } = req.query;
  if (!session_id) return res.status(400).json({ message: 'session_id 必填' });
  const sess = sd.getSessionById(session_id);
  if (!sess || sess.userId !== req.user.id) return res.status(404).json({ message: '会话不存在' });
  const list = sd.listMessages(session_id, { before: before || undefined, limit: Math.min(Number(limit) || 80, 200) });
  res.json({ success: true, list: list.map(pubMsg) });
});

app.post('/api/support/messages/send', authUser, (req, res) => {
  if (!rateLimitUser(req.user.id)) return res.status(429).json({ success: false, message: '发送过于频繁，请稍后再试' });
  const { session_id, content } = req.body || {};
  const text = String(content || '').trim();
  if (!session_id || !text) return res.status(400).json({ message: '参数错误' });
  const sess = sd.getSessionById(session_id);
  if (!sess || sess.userId !== req.user.id) return res.status(404).json({ message: '会话不存在' });
  const msg = sd.insertUserMessage(session_id, req.user.id, text);
  const payload = { session_id, user_id: req.user.id, message: pubMsg(msg), from: 'user' };
  io.to('support_admin_room').emit('support:new_message', payload);
  res.json({ success: true, message: pubMsg(msg) });
});

app.post('/api/support/messages/read', authUser, (req, res) => {
  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ message: 'session_id 必填' });
  const sess = sd.getSessionById(session_id);
  if (!sess || sess.userId !== req.user.id) return res.status(404).json({ message: '会话不存在' });
  sd.markUserRead(session_id, req.user.id);
  res.json({ success: true });
});

// --- 客服：管理 ---
app.get('/api/admin/support/sessions', authAdmin, async (_req, res) => {
  const sessions = sd.listSessionsForAdmin();
  let touched = false;
  for (const s of sessions) {
    if (!s.clientIp || s.clientIpLocation) continue;
    const loc = await resolveIpLocation(s.clientIp);
    if (loc) {
      s.clientIpLocation = loc;
      touched = true;
    }
  }
  if (touched) sd.save();
  const list = sessions.map((s) => {
    const u = sd.getUserById(s.userId);
    return {
      id: s.id,
      user_id: s.userId,
      status: s.status,
      unread_for_admin: s.unreadForAdmin,
      unread_for_user: s.unreadForUser,
      last_message_at: s.lastMessageAt,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
      username: u?.nickname || '用户',
      email: '',
      client_ip: s.clientIp || null,
      client_ip_location: s.clientIpLocation || null,
    };
  });
  res.json({ success: true, list });
});

app.get('/api/admin/support/session/:id/detail', authAdmin, async (req, res) => {
  const d = sd.sessionDetailForAdmin(req.params.id);
  if (!d) return res.status(404).json({ message: '会话不存在' });
  if (d.session?.clientIp && !d.session?.clientIpLocation) {
    const loc = await resolveIpLocation(d.session.clientIp);
    if (loc) {
      d.session.clientIpLocation = loc;
      sd.save();
    }
  }
  const notes = (d.notes || []).map((n) => ({
    id: n.id,
    session_id: n.sessionId,
    admin_id: n.adminId,
    content: n.content,
    created_at: n.createdAt,
  }));
  res.json({
    success: true,
    session: d.session,
    messages: (d.messages || []).map(pubMsg),
    notes,
    userOverview: d.user
      ? {
          id: d.user.id,
          username: d.user.nickname,
          email: '',
          balance: sd.ensureAccount(d.user).available,
          frozen_balance: Math.max(0, sd.ensureAccount(d.user).totalAsset - sd.ensureAccount(d.user).available),
          role: 'user',
          created_at: d.user.createdAt,
          account: { ...sd.ensureAccount(d.user) },
          payout_methods: sd.listPayoutMethodsAdmin(d.user.id),
          client_ip: d.session?.clientIp || null,
          client_ip_location: d.session?.clientIpLocation || null,
        }
      : {},
    orders: d.user ? tradeOrders.listByUserId(d.user.id, { limit: 40 }) : [],
    transactions: d.user ? sd.listLedgerForUser(d.user.id, { limit: 60 }) : [],
  });
});

app.post('/api/admin/support/session/:id/reply', authAdmin, (req, res) => {
  const text = String(req.body?.content || '').trim();
  if (!text) return res.status(400).json({ message: '回复不能为空' });
  const sess = sd.getSessionById(req.params.id);
  if (!sess) return res.status(404).json({ message: '会话不存在' });
  const msg = sd.insertAdminMessage(req.params.id, req.admin.id, text);
  io.to(`support_user_${sess.userId}`).emit('support:new_message', {
    session_id: req.params.id,
    user_id: sess.userId,
    message: pubMsg(msg),
    from: 'admin',
  });
  res.json({ success: true, message: pubMsg(msg) });
});

app.post('/api/admin/support/session/:id/read', authAdmin, (req, res) => {
  sd.markAdminRead(req.params.id);
  res.json({ success: true });
});

app.post('/api/admin/support/session/:id/note', authAdmin, (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ message: '备注不能为空' });
  sd.addNote(req.params.id, req.admin.id, content);
  res.json({ success: true });
});

app.get('/api/admin/support/quick-replies', authAdmin, (_req, res) => {
  res.json({ success: true, list: sd.listQuickReplies() });
});

app.post('/api/admin/support/quick-replies', authAdmin, (req, res) => {
  const title = String(req.body?.title || '').trim();
  const content = String(req.body?.content || '').trim();
  if (!title || !content) return res.status(400).json({ message: '标题和内容必填' });
  const q = sd.addQuickReply(title, content);
  res.json({ success: true, item: q });
});

/** CMS：读取全量可编辑数据（Skynet 式后台） */
app.get('/api/admin/cms', authAdmin, (_req, res) => {
  res.json({ success: true, data: store.getCmsSnapshot() });
});

app.get('/api/admin/media-schedules', authAdmin, (_req, res) => {
  res.json({ success: true, list: store.getMediaSchedules() });
});

app.put('/api/admin/media-schedules', authAdmin, (req, res) => {
  try {
    store.updateCmsSection('mediaSchedules', req.body?.list || req.body?.data || []);
    res.json({ success: true, list: store.getMediaSchedules() });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '保存媒体排期失败' });
  }
});

/** 新浪财经资源库：服务端代理联想搜索（非整页 iframe，避免跨域与无法裁剪新浪页面） */
function handleSinaResourceSearch(req, res) {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ success: true, list: [] });
  searchSinaSuggest(q)
    .then((list) => res.json({ success: true, list }))
    .catch((e) => {
      console.error('[sina-resource]', e);
      res.status(502).json({ success: false, message: e.message || '新浪检索失败' });
    });
}
app.get('/api/admin/sina-resource/search', authAdmin, handleSinaResourceSearch);
/** 备用路径（避免个别代理/缓存对带连字符路径处理异常） */
app.get('/api/admin/sina/search', authAdmin, handleSinaResourceSearch);

/** CMS：按区块保存（banners | announcements | products | articles | productMeta | simSettings | tradeConfig） */
app.put('/api/admin/cms/:section', authAdmin, async (req, res) => {
  const section = String(req.params.section || '').trim();
  const data = req.body?.data;
  try {
    if (section === 'products') {
      await store.updateCmsSectionProductsAsync(data);
      res.json({ success: true, productMeta: store.getCmsSnapshot().productMeta });
    } else {
      store.updateCmsSection(section, data);
      res.json({ success: true });
    }
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '保存失败' });
  }
});

app.get('/api/admin/users', authAdmin, (_req, res) => {
  res.json({ success: true, list: sd.listUsersForAdmin() });
});

app.patch('/api/admin/users/:id/account', authAdmin, (req, res) => {
  try {
    const uid = req.params.id;
    const before = sd.snapshotAccount(uid);
    const acc = sd.updateUserAccount(uid, req.body || {});
    const after = sd.snapshotAccount(uid);
    if (
      before &&
      after &&
      (before.available !== after.available ||
        before.totalAsset !== after.totalAsset ||
        before.frozen !== after.frozen)
    ) {
      sd.appendLedger(uid, {
        type: 'admin_adjust',
        title: '后台账户调整',
        deltaAvailable: +(after.available - before.available).toFixed(2),
        deltaTotal: +(after.totalAsset - before.totalAsset).toFixed(2),
        deltaFrozen: +(after.frozen - before.frozen).toFixed(2),
        meta: { source: 'admin_patch' },
      });
    }
    res.json({ success: true, account: acc });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '更新失败' });
  }
});

app.get('/api/admin/dashboard', authAdmin, (_req, res) => {
  const users = sd.listUsersForAdmin();
  const isReal = (uid) => isRealUserId(uid);
  const realUsers = users.filter((u) => isReal(u.id));
  const orderAgg = tradeOrders.aggregateStats(isReal);
  let platformBalance = 0;
  let frozenTotal = 0;
  for (const u of realUsers) {
    platformBalance += Number(u.account?.totalAsset || 0);
    frozenTotal += Number(u.account?.frozen || 0);
  }
  const realUserIds = new Set(realUsers.map((u) => u.id));
  const active10 = tradeOrders.activeUserCountInDays(10, isReal);
  const inactiveUsers10d = Math.max(0, realUserIds.size - active10);
  const today = sd.ledgerTotalsToday({ onlyRealUsers: true });
  res.json({
    success: true,
    data: {
      userCount: realUsers.length,
      staffUserCount: Math.max(0, users.length - realUsers.length),
      platformBalance,
      frozenTotal,
      volume30d: orderAgg.volume30d,
      profit30d: orderAgg.profitSum30d,
      orderCount: orderAgg.orderCount,
      withdrawPending: sd.countPendingWithdrawIntents(),
      depositPending: sd.countPendingDepositIntents(),
      inactiveUsers10d,
      todayDeposit: today.deposit,
      todayWithdraw: today.withdraw,
      todayNetFlow: today.net,
      volumeSeries30d: tradeOrders.volumeSeriesLastDays(30, isReal),
    },
  });
});

/** 资金审核：待处理提现 / 充值 */
app.get('/api/admin/treasury/pending', authAdmin, (_req, res) => {
  res.json({
    success: true,
    withdrawals: sd.listWithdrawIntentsAdmin({ limit: 200 }),
    deposits: sd.listDepositIntentsAdmin({ limit: 200 }),
  });
});

app.post('/api/admin/treasury/withdrawals/:id', authAdmin, (req, res) => {
  const action = String(req.body?.action || '');
  const note = String(req.body?.note || '');
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ success: false, message: 'action 须为 approve 或 reject' });
  }
  try {
    const row = sd.resolveWithdrawIntent(req.params.id, action, note);
    res.json({ success: true, row });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '处理失败' });
  }
});

app.post('/api/admin/treasury/deposits/:id', authAdmin, (req, res) => {
  const action = String(req.body?.action || '');
  const note = String(req.body?.note || '');
  try {
    if (action === 'approve') {
      const row = sd.approveDepositIntent(req.params.id, note);
      return res.json({ success: true, row });
    }
    if (action === 'reject') {
      const row = sd.rejectDepositIntent(req.params.id, note);
      return res.json({ success: true, row });
    }
    return res.status(400).json({ success: false, message: 'action 须为 approve 或 reject' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '处理失败' });
  }
});

app.get('/api/admin/settlement-override', authAdmin, (_req, res) => {
  res.json({ success: true, data: store.getSettlementOverrideState() });
});

app.post('/api/admin/settlement-override', authAdmin, (req, res) => {
  const action = String(req.body?.action || '');
  if (action === 'clear' || action === 'stop') {
    return res.json({ success: true, data: store.clearSettlementOverride() });
  }
  if (action === 'start') {
    const minutes = Number(req.body?.minutes || 5);
    const mode = req.body?.mode === 'lose' ? 'lose' : 'win';
    return res.json({ success: true, data: store.startSettlementOverride(minutes, mode) });
  }
  return res.status(400).json({ success: false, message: '无效操作' });
});

/** 按产品与时间窗的输赢控盘（结算以服务器当前时间为准；后台填写的起止时间由浏览器转为时间戳上传） */
app.get('/api/admin/product-settlement', authAdmin, (_req, res) => {
  try {
    if (typeof store.getAdminProductSettlementPage !== 'function') {
      return res.status(500).json({
        success: false,
        message: '服务端 store 未更新：缺少 getAdminProductSettlementPage',
        hint: '请将仓库中的 server/store.js 与 server/index.js 一并部署到服务器后重启 Node',
      });
    }
    const payload = store.getAdminProductSettlementPage();
    res.json({ success: true, rules: payload.rules, products: payload.products });
  } catch (e) {
    console.error('[admin/product-settlement]', e);
    res.status(500).json({
      success: false,
      message: e?.message || '加载控盘数据失败',
      hint: '请查看服务器日志；确认 server/store.js 已同步且 store.json 可读写',
    });
  }
});

app.post('/api/admin/product-settlement', authAdmin, (req, res) => {
  try {
    if (typeof store.addProductSettlementRule !== 'function') {
      return res.status(500).json({
        success: false,
        message: '服务端 store 未更新',
        hint: '请部署最新 server/store.js 并重启',
      });
    }
    const rule = store.addProductSettlementRule(req.body || {});
    res.json({ success: true, rule });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '保存失败' });
  }
});

app.delete('/api/admin/product-settlement/:id', authAdmin, (req, res) => {
  try {
    if (typeof store.removeProductSettlementRule !== 'function') {
      return res.status(500).json({
        success: false,
        message: '服务端 store 未更新',
        hint: '请部署最新 server/store.js 并重启',
      });
    }
    store.removeProductSettlementRule(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '删除失败' });
  }
});

app.get('/api/admin/entrust-control', authAdmin, (_req, res) => {
  try {
    if (typeof store.getAdminEntrustControlPage !== 'function') {
      return res.status(500).json({ success: false, message: '服务端 store 未更新：缺少 getAdminEntrustControlPage' });
    }
    const payload = store.getAdminEntrustControlPage();
    res.json({ success: true, rules: payload.rules, products: payload.products });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || '加载委买控盘失败' });
  }
});

app.post('/api/admin/entrust-control', authAdmin, (req, res) => {
  try {
    if (typeof store.addEntrustControlRule !== 'function') {
      return res.status(500).json({ success: false, message: '服务端 store 未更新' });
    }
    const rule = store.addEntrustControlRule(req.body || {});
    res.json({ success: true, rule });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '保存失败' });
  }
});

app.delete('/api/admin/entrust-control/:id', authAdmin, (req, res) => {
  try {
    if (typeof store.removeEntrustControlRule !== 'function') {
      return res.status(500).json({ success: false, message: '服务端 store 未更新' });
    }
    store.removeEntrustControlRule(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '删除失败' });
  }
});

app.get('/api/admin/trade-orders', authAdmin, (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const page = tradeOrders.listForAdmin({
    limit,
    offset,
    status: req.query.status,
    userId: req.query.userId,
    openedFrom: req.query.openedFrom,
    openedTo: req.query.openedTo,
    direction: req.query.direction,
    orderKind: req.query.orderKind,
  });
  res.json({ success: true, ...page });
});

app.get('/api/admin/users/:id/detail', authAdmin, (req, res) => {
  const d = sd.getUserDetailForAdmin(req.params.id);
  if (!d) return res.status(404).json({ message: '用户不存在' });
  res.json({ success: true, data: d, orders: tradeOrders.listByUserId(req.params.id, { limit: 80 }) });
});

app.post('/api/admin/users', authAdmin, (req, res) => {
  try {
    const u = sd.adminCreateUser(req.body || {});
    res.json({ success: true, user: userForAuthResponse(u) });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '创建失败' });
  }
});

app.patch('/api/admin/users/:id', authAdmin, (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    if (body.profile && typeof body.profile === 'object') sd.adminUpdateUserProfile(id, body.profile);
    if (body.account && typeof body.account === 'object') sd.updateUserAccount(id, body.account);
    if (body.loginPassword) sd.adminSetLoginPassword(id, String(body.loginPassword));
    if (body.tradePassword) sd.adminSetTradePassword(id, String(body.tradePassword));
    const d = sd.getUserDetailForAdmin(id);
    res.json({ success: true, data: d });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '更新失败' });
  }
});

// --- Socket.IO ---
io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

tradeOrders.setOnOrderSettled((userId, { ledger }) => {
  const summary = sd.getAccountSummaryForUser(userId);
  if (summary && ledger) {
    io.to(`support_user_${userId}`).emit('account:trade_settled', { summary, ledger });
  }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('UNAUTHORIZED'));
    const p = jwt.verify(token, JWT_SECRET);
    if (p.role === 'admin' || p.typ === 'admin') {
      socket.uid = p.sub;
      socket.role = 'admin';
      return next();
    }
    const u = sd.getUserById(p.sub);
    if (!u) return next(new Error('UNAUTHORIZED'));
    const need = expectedUserSessionVersion(u);
    const tokenSv = Number(p.sv);
    const legacyNoSv = p.sv === undefined && need === 1;
    if (!legacyNoSv && (!Number.isFinite(tokenSv) || tokenSv !== need)) return next(new Error('UNAUTHORIZED'));
    socket.uid = p.sub;
    socket.role = p.role || 'user';
    next();
  } catch {
    next(new Error('UNAUTHORIZED'));
  }
});

io.on('connection', (socket) => {
  if (socket.role === 'admin') {
    socket.join('support_admin_room');
  } else {
    socket.join(`support_user_${socket.uid}`);
  }

  socket.on('support:typing', ({ sessionId }) => {
    if (socket.role === 'admin') return;
    io.to('support_admin_room').emit('support:typing', { sessionId, userId: socket.uid });
  });
});

/** 公开行情频道（无需登录）：定时推送行情报价 */
const marketIo = io.of('/market');
marketIo.on('connection', (socket) => {
  socket.emit('market:quotes', { quotes: liveQuotes.getAllQuotes(), ts: Date.now() });
});

liveQuotes.configure({
  getSimSettings: () => store.getSimSettings(),
  getListedProductRows: () => store.getListedProductsRaw(),
  getStaticBase: (id) => {
    const m = store.getStaticQuoteBaseForId(id);
    if (!m) return { basePrice: 100, high24: 101, low24: 99, volume24: 1e6 };
    return m;
  },
});
store.setLiveMarketEngine((id) => liveQuotes.getLive(id));

setInterval(() => {
  liveQuotes.tick();
  marketIo.emit('market:quotes', { quotes: liveQuotes.getAllQuotes(), ts: Date.now() });
}, 1000);

/** APK 等：开发与未挂载整站 dist 时也需要可用；优先 dist，其次源码 public */
{
  const downloadsCandidates = [
    path.join(distDir, 'downloads'),
    path.join(__dirname, '..', 'client', 'public', 'downloads'),
  ];
  const downloadsDir = downloadsCandidates.find((p) => fs.existsSync(p));
  if (downloadsDir) {
    app.use(
      '/downloads',
      express.static(downloadsDir, {
        fallthrough: true,
        maxAge: 86400000,
        setHeaders: (res, filePath) => {
          if (String(filePath).endsWith('.apk')) {
            res.setHeader('Content-Type', 'application/vnd.android.package-archive');
            res.setHeader('Content-Disposition', 'attachment');
          }
          res.setHeader('X-Content-Type-Options', 'nosniff');
        },
      }),
    );
  }
}

/** Steris 静态站（核心数据等）：与 API 同源便于 /api/products；勿被 SPA catch-all 吞掉 */
const sterisPublicDir = path.join(__dirname, '..', 'web', 'public', 'steris');
if (fs.existsSync(sterisPublicDir)) {
  app.use(
    '/steris',
    express.static(sterisPublicDir, {
      fallthrough: true,
      maxAge: 0,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
}

const echofyTemplateDir = path.join(__dirname, '..', 'web', 'vendor', 'echofy');
if (fs.existsSync(echofyTemplateDir)) {
  app.use(
    '/echofy-template',
    express.static(echofyTemplateDir, {
      fallthrough: true,
      maxAge: 0,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
}

/** 相册专用目录：`/video/<文件名>` → `web/public/video` */
const videoGalleryStaticDir = path.join(__dirname, '..', 'web', 'public', 'video');
if (fs.existsSync(videoGalleryStaticDir)) {
  app.use(
    '/video',
    express.static(videoGalleryStaticDir, {
      fallthrough: true,
      maxAge: 0,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
}

/** Steris 首页/advert 等引用 public 根目录大视频（如 /14595493_1920_1080_30fps.mp4），仅 basename、防路径穿越 */
const webPublicRootDir = path.join(__dirname, '..', 'web', 'public');
app.use((req, res, next) => {
  const m = typeof req.path === 'string' && req.path.match(/^\/([^/]+\.(?:mp4|webm|mov))$/i);
  if (!m) return next();
  const base = path.basename(m[1]);
  const filePath = path.join(webPublicRootDir, base);
  if (!filePath.startsWith(webPublicRootDir) || !fs.existsSync(filePath)) return next();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath, (err) => err && next(err));
});

if (serveClientDist) {
  const assetsDir = path.join(distDir, 'assets');
  const productIconsDir = path.join(distDir, 'product-icons');

  /** 仅挂载 /assets 与 /product-icons，避免 express.static(整个 dist) 抢先返回 index.html 导致缓存与 SPA 行为异常 */
  app.use(
    '/assets',
    express.static(assetsDir, {
      /** 勿 immutable+超长 maxAge：发版后用户端会长期钉死旧主题/旧逻辑，只能清站点数据才恢复 */
      maxAge: 0,
      fallthrough: true,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );
  if (fs.existsSync(productIconsDir)) {
    app.use('/product-icons', express.static(productIconsDir, { fallthrough: true }));
  }

  const iconsDir = path.join(distDir, 'icons');
  if (fs.existsSync(iconsDir)) {
    app.use(
      '/icons',
      express.static(iconsDir, {
        fallthrough: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        setHeaders(res) {
          res.setHeader('X-Content-Type-Options', 'nosniff');
        },
      })
    );
  }

  app.get('/favicon.svg', (_req, res) => {
    res.sendFile(path.join(distDir, 'favicon.svg'));
  });

  app.get('/manifest.webmanifest', (_req, res) => {
    const p = path.join(distDir, 'manifest.webmanifest');
    if (!fs.existsSync(p)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('application/manifest+json');
    res.sendFile(p);
  });

  app.get('/sw.js', (_req, res) => {
    const p = path.join(distDir, 'sw.js');
    if (!fs.existsSync(p)) return res.status(404).end();
    res.setHeader('Cache-Control', 'no-cache');
    res.type('application/javascript');
    res.sendFile(p);
  });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/uploads')) return next();
    if (req.path.startsWith('/assets/')) {
      return res.status(404).type('text/plain').send('Not found');
    }
    if (req.path.startsWith('/product-icons/')) {
      return res.status(404).end();
    }
    if (req.path.startsWith('/icons/')) {
      return res.status(404).type('text/plain').send('Not found');
    }
    if (req.path.startsWith('/downloads/')) {
      return res.status(404).type('text/plain').send('Not found');
    }
    if (req.path.startsWith('/steris')) {
      return res.status(404).type('text/plain').send('Not found');
    }
    if (req.path === '/video' || (req.path.startsWith('/video/') && !path.extname(req.path))) {
      return res.status(404).type('text/plain').send('Not found');
    }
    const ext = path.extname(req.path);
    if (ext && ext !== '.html') {
      return res.status(404).type('text/plain').send('Not found');
    }
    if (req.path === '/') {
      const loginPath = path.join(distDir, 'login.html');
      if (fs.existsSync(loginPath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.type('html');
        return res.sendFile(loginPath, (err) => err && next(err));
      }
    }
    if (ext === '.html') {
      const htmlFile = path.join(distDir, path.basename(req.path));
      if (htmlFile.startsWith(distDir) && fs.existsSync(htmlFile)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.type('html');
        return res.sendFile(htmlFile, (err) => err && next(err));
      }
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.type('html');
    res.sendFile(path.join(distDir, 'index.html'), (err) => err && next(err));
  });
}

function onListen() {
  const hostLabel = LISTEN_HOST || '0.0.0.0';
  try {
    tradeOrders.settleDueOrders();
  } catch (_) {
    /* ignore */
  }
  console.log(
    `[zhongliang] http://${hostLabel}:${PORT}  API + Socket.IO${serveClientDist ? ' + static' : ''}`
  );
}

/** 未捕获异常时，/api 一律返回 JSON，避免管理端只看到 HTML「Internal Server Error」 */
app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const p = req.path || '';
  if (p.startsWith('/api')) {
    console.error('[api]', req.method, p, err);
    res.status(500).json({
      success: false,
      message: err && err.message ? String(err.message) : '服务器内部错误',
      hint: '请查看 journalctl / 控制台日志；确认已部署 server/index.js 与 server/store.js 并重启',
    });
    return;
  }
  res.status(500).type('text/plain').send('Internal Server Error');
});

setInterval(() => {
  try {
    tradeOrders.settleDueOrders();
  } catch (e) {
    console.error('[tradeOrders] settleDueOrders', e);
  }
}, 2000);

if (LISTEN_HOST) {
  server.listen(PORT, LISTEN_HOST, onListen);
} else {
  server.listen(PORT, onListen);
}
