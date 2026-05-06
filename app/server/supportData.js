/**
 * JSON 持久化客服数据（单进程安全；高并发可换 SQLite）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getBankByCode } = require('./chineseBanks');
const securityPresets = require('./securityPresets');
const paths = require('./paths');

const dataPath = path.join(paths.dataDir, 'supportData.json');

function defaultData() {
  return {
    users: [],
    sessions: [],
    messages: [],
    notes: [],
    quickReplies: [
      { id: 'q1', title: '充值多久到账', content: '充值提交后由人工核对，一般当日处理，请保持在线。' },
      { id: 'q2', title: '提现规则', content: '提现需在工作日 9:00—21:00 发起，具体以风控审核为准。' },
      { id: 'q3', title: '修改银行卡', content: '请发送开户名与卡号后四位，我们将引导您完成核验。' },
    ],
    faq: [
      { id: 'f1', q: '如何充值？', a: '点击「快捷充值」进入在线客服，由专属坐席为您提供收款账户并协助入账确认。' },
      { id: 'f2', q: '提现多久到？', a: '请先绑定本人储蓄卡；审核通过后预计 2 小时内划入绑定卡，节假日顺延。' },
      { id: 'f3', q: '买涨买跌规则？', a: '请在产品页阅读产品说明与风险揭示；具体规则以合同约定及官方披露为准。' },
    ],
    withdrawIntents: [],
    depositIntents: [],
    ledger: [],
  };
}

function load() {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dataPath)) {
    const d = defaultData();
    fs.writeFileSync(dataPath, JSON.stringify(d, null, 2), 'utf8');
    return d;
  }
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch {
    return defaultData();
  }
}

let cache = load();

function save() {
  fs.writeFileSync(dataPath, JSON.stringify(cache, null, 2), 'utf8');
}

function defaultAccount() {
  return {
    currency: 'CNY',
    creditScore: 100,
    totalAsset: 0,
    available: 0,
    frozen: 0,
    accountPnl: 0,
    todayPnl: 0,
  };
}

function ensureAccount(u) {
  if (!u.account || typeof u.account !== 'object') {
    u.account = defaultAccount();
  } else {
    u.account = { ...defaultAccount(), ...u.account };
  }
  return u.account;
}

function migrateDataShape() {
  let changed = false;
  for (const u of cache.users || []) {
    if (!Array.isArray(u.payoutMethods)) {
      u.payoutMethods = [];
      changed = true;
    }
    for (const pm of u.payoutMethods || []) {
      if (pm && pm.openingBank === undefined) {
        pm.openingBank = '';
        changed = true;
      }
      if (pm && pm.cardFirst4 === undefined) {
        pm.cardFirst4 = String(pm.cardBin6 || '')
          .replace(/\D/g, '')
          .slice(0, 4)
          .padEnd(4, '*');
        changed = true;
      }
    }
    if (!u.account || typeof u.account !== 'object') {
      u.account = defaultAccount();
      changed = true;
    }
    if (u.phone === undefined) {
      u.phone = '';
      changed = true;
    }
    if (u.realName === undefined) {
      u.realName = '';
      changed = true;
    }
    if (!Array.isArray(u.securityQuestions)) {
      u.securityQuestions = [];
      changed = true;
    }
    const sv = Number(u.sessionVersion);
    if (!Number.isFinite(sv) || sv < 1) {
      u.sessionVersion = 1;
      changed = true;
    }
    if (u.userKind === undefined) {
      u.userKind = 'real';
      changed = true;
    }
  }
  if (!Array.isArray(cache.withdrawIntents)) {
    cache.withdrawIntents = [];
    changed = true;
  }
  if (!Array.isArray(cache.depositIntents)) {
    cache.depositIntents = [];
    changed = true;
  }
  if (!Array.isArray(cache.ledger)) {
    cache.ledger = [];
    changed = true;
  }
  for (const u of cache.users || []) {
    const a = ensureAccount(u);
    if (a.frozen === undefined || a.frozen === null) {
      a.frozen = 0;
      changed = true;
    }
  }
  if (changed) save();
}

migrateDataShape();

function maskAccountNameForAdmin(name) {
  const s = String(name || '').trim();
  if (s.length <= 1) return '*';
  if (s.length === 2) return `${s[0]}*`;
  return `${s[0]}*${s.slice(-1)}`;
}

function maskCardNumber(pm) {
  const first4Raw = String(pm.cardFirst4 || pm.cardBin6 || '')
    .replace(/\D/g, '')
    .slice(0, 4);
  const last4Raw = String(pm.cardLast4 || '')
    .replace(/\D/g, '')
    .slice(-4);
  const first4 = first4Raw.padEnd(4, '*');
  const last4 = last4Raw.padStart(4, '*');
  return `${first4}*****${last4}`;
}

function payoutToClient(pm) {
  return {
    id: pm.id,
    bankCode: pm.bankCode,
    bankName: pm.bankName,
    openingBank: String(pm.openingBank || ''),
    accountName: pm.accountName,
    cardMask: maskCardNumber(pm),
    cardBin6: pm.cardBin6,
    isDefault: !!pm.isDefault,
    createdAt: pm.createdAt,
  };
}

function listPayoutMethods(userId) {
  const u = getUserById(userId);
  if (!u?.payoutMethods?.length) return [];
  return u.payoutMethods.map(payoutToClient);
}

function listPayoutMethodsAdmin(userId) {
  const u = getUserById(userId);
  if (!u?.payoutMethods?.length) return [];
  return u.payoutMethods.map((pm) => ({
    id: pm.id,
    bankName: pm.bankName,
    openingBank: String(pm.openingBank || ''),
    cardMask: maskCardNumber(pm),
    accountNameMask: maskAccountNameForAdmin(pm.accountName),
    createdAt: pm.createdAt,
  }));
}

function addPayoutMethod(userId, { bankCode, openingBank, accountName, cardNumber }) {
  const bankMeta = getBankByCode(String(bankCode || '').trim());
  if (!bankMeta) throw new Error('请选择列表中的银行');
  const rawCard = String(cardNumber || '').trim();
  if (!rawCard) throw new Error('请填写银行卡号');
  const digits = rawCard.replace(/\D/g, '');
  const normalized = digits || rawCard.replace(/\s+/g, '');
  if (!normalized) throw new Error('请填写银行卡号');
  const u = getUserById(userId);
  if (!u) throw new Error('用户不存在');
  if (!Array.isArray(u.payoutMethods)) u.payoutMethods = [];
  if (u.payoutMethods.length >= 5) throw new Error('最多绑定 5 张储蓄卡');
  const name = String(accountName || '').trim();
  if (name.length < 2 || name.length > 32) throw new Error('请填写开户姓名（2–32 个字符）');
  const openBank = String(openingBank || '').trim();
  if (openBank.length < 2 || openBank.length > 64) throw new Error('请填写开户行（2–64 个字符）');
  const cardBin6 = digits.slice(0, 6);
  const cardFirst4 = normalized.slice(0, 4).padEnd(4, '*');
  const cardLast4 = normalized.slice(-4).padStart(4, '*');
  const pm = {
    id: uid('pm_'),
    bankCode: bankMeta.code,
    bankName: bankMeta.name,
    openingBank: openBank,
    accountName: name,
    cardFirst4,
    cardLast4,
    cardBin6,
    /** 完整卡号数字串，仅存服务端 JSON；用户 API 不返回 */
    cardDigits: digits,
    isDefault: u.payoutMethods.length === 0,
    createdAt: new Date().toISOString(),
  };
  u.payoutMethods.push(pm);
  save();
  return payoutToClient(pm);
}

function removePayoutMethod(userId, pmId) {
  const u = getUserById(userId);
  if (!u?.payoutMethods?.length) return false;
  const idx = u.payoutMethods.findIndex((p) => p.id === pmId);
  if (idx < 0) return false;
  u.payoutMethods.splice(idx, 1);
  if (u.payoutMethods.length && !u.payoutMethods.some((p) => p.isDefault)) {
    u.payoutMethods[0].isDefault = true;
  }
  save();
  return true;
}

function appendLedger(userId, row) {
  const u = getUserById(userId);
  if (!u) return null;
  const a = ensureAccount(u);
  const entry = {
    id: uid('tx_'),
    userId,
    type: String(row.type || 'misc'),
    title: String(row.title || '').slice(0, 120),
    deltaAvailable: Number(row.deltaAvailable) || 0,
    deltaTotal: Number(row.deltaTotal) || 0,
    deltaFrozen: Number(row.deltaFrozen) || 0,
    afterAvailable: +Number(a.available).toFixed(2),
    afterTotal: +Number(a.totalAsset).toFixed(2),
    afterFrozen: +Number(a.frozen || 0).toFixed(2),
    refType: row.refType != null ? String(row.refType) : null,
    refId: row.refId != null ? String(row.refId) : null,
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
    createdAt: new Date().toISOString(),
  };
  if (!Array.isArray(cache.ledger)) cache.ledger = [];
  cache.ledger.push(entry);
  if (cache.ledger.length > 50000) cache.ledger.splice(0, cache.ledger.length - 50000);
  save();
  return entry;
}

function listLedgerForUser(userId, { limit = 40, before } = {}) {
  let list = (cache.ledger || []).filter((x) => x.userId === userId);
  list.sort((p, q) => new Date(q.createdAt).getTime() - new Date(p.createdAt).getTime());
  if (before) {
    const t = new Date(before).getTime();
    list = list.filter((x) => new Date(x.createdAt).getTime() < t);
  }
  return list.slice(0, Math.min(200, limit));
}

function countPendingWithdrawIntents() {
  return (cache.withdrawIntents || []).filter((w) => w.status === 'pending').length;
}

function withdrawIntentRowForAdmin(row) {
  const u = getUserById(row.userId);
  const pm = u?.payoutMethods?.find((p) => p.id === row.payoutMethodId) || null;
  const digits = pm?.cardDigits != null ? String(pm.cardDigits).replace(/\D/g, '') : '';
  return {
    ...row,
    bankCode: pm?.bankCode || '',
    openingBank: pm ? String(pm.openingBank || '') : '',
    accountName: pm ? String(pm.accountName || '') : '',
    /** 管理端专用：有则返回完整卡号，历史绑卡可能为空 */
    cardNumberFull: digits,
  };
}

function listWithdrawIntentsAdmin({ limit = 100 } = {}) {
  return [...(cache.withdrawIntents || [])]
    .filter((w) => w.status === 'pending')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
    .map(withdrawIntentRowForAdmin);
}

function resolveWithdrawIntent(intentId, action, adminNote) {
  const list = cache.withdrawIntents || [];
  const row = list.find((w) => w.id === intentId);
  if (!row) throw new Error('提现记录不存在');
  if (row.status !== 'pending') throw new Error('该提现已处理');
  const u = getUserById(row.userId);
  if (!u) throw new Error('用户不存在');
  const a = ensureAccount(u);
  const amt = Number(row.amount);
  const frozen = Number(a.frozen) || 0;
  if (frozen < amt) throw new Error('冻结资金异常，请人工核对账务');
  if (action === 'reject') {
    a.frozen = +(frozen - amt).toFixed(2);
    a.available = +(Number(a.available) + amt).toFixed(2);
    row.status = 'rejected';
    row.reviewedAt = new Date().toISOString();
    row.adminNote = String(adminNote || '').slice(0, 500);
    save();
    appendLedger(row.userId, {
      type: 'withdraw_reject',
      title: `提现驳回 · 退回 ¥${amt.toFixed(2)}`,
      deltaAvailable: amt,
      deltaTotal: 0,
      deltaFrozen: -amt,
      refType: 'withdraw_intent',
      refId: row.id,
      meta: { note: row.adminNote },
    });
    return row;
  }
  if (action === 'approve') {
    a.frozen = +(frozen - amt).toFixed(2);
    a.totalAsset = +(Number(a.totalAsset) - amt).toFixed(2);
    row.status = 'approved';
    row.reviewedAt = new Date().toISOString();
    row.adminNote = String(adminNote || '').slice(0, 500);
    save();
    appendLedger(row.userId, {
      type: 'withdraw_complete',
      title: `提现完成 · 出账 ¥${amt.toFixed(2)}`,
      deltaAvailable: 0,
      deltaTotal: -amt,
      deltaFrozen: -amt,
      refType: 'withdraw_intent',
      refId: row.id,
      meta: { bankName: row.bankName, cardMask: row.cardMask },
    });
    return row;
  }
  throw new Error('无效操作');
}

function createDepositIntent(userId, amount, remark) {
  const u = getUserById(userId);
  if (!u) throw new Error('用户不存在');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('金额无效');
  if (!Array.isArray(cache.depositIntents)) cache.depositIntents = [];
  const row = {
    id: uid('dep_'),
    userId,
    amount: amt,
    remark: String(remark || '').slice(0, 200),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  cache.depositIntents.push(row);
  save();
  appendLedger(userId, {
    type: 'deposit_apply',
    title: `充值申请 · ¥${amt.toFixed(2)}（待入账）`,
    deltaAvailable: 0,
    deltaTotal: 0,
    deltaFrozen: 0,
    refType: 'deposit_intent',
    refId: row.id,
    meta: { remark: row.remark },
  });
  return row;
}

function listDepositIntentsForUser(userId) {
  return [...(cache.depositIntents || [])]
    .filter((d) => d.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);
}

function listDepositIntentsAdmin({ limit = 100 } = {}) {
  return [...(cache.depositIntents || [])]
    .filter((d) => d.status === 'pending')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

function countPendingDepositIntents() {
  return (cache.depositIntents || []).filter((d) => d.status === 'pending').length;
}

function approveDepositIntent(intentId, adminNote) {
  const list = cache.depositIntents || [];
  const row = list.find((d) => d.id === intentId);
  if (!row) throw new Error('充值记录不存在');
  if (row.status !== 'pending') throw new Error('该记录已处理');
  const u = getUserById(row.userId);
  if (!u) throw new Error('用户不存在');
  const a = ensureAccount(u);
  const amt = Number(row.amount);
  a.available = +(Number(a.available) + amt).toFixed(2);
  a.totalAsset = +(Number(a.totalAsset) + amt).toFixed(2);
  row.status = 'approved';
  row.reviewedAt = new Date().toISOString();
  row.adminNote = String(adminNote || '').slice(0, 500);
  save();
  appendLedger(row.userId, {
    type: 'deposit_credit',
    title: `充值入账 · +¥${amt.toFixed(2)}`,
    deltaAvailable: amt,
    deltaTotal: amt,
    deltaFrozen: 0,
    refType: 'deposit_intent',
    refId: row.id,
    meta: { note: row.adminNote },
  });
  return row;
}

function rejectDepositIntent(intentId, adminNote) {
  const list = cache.depositIntents || [];
  const row = list.find((d) => d.id === intentId);
  if (!row) throw new Error('充值记录不存在');
  if (row.status !== 'pending') throw new Error('该记录已处理');
  row.status = 'rejected';
  row.reviewedAt = new Date().toISOString();
  row.adminNote = String(adminNote || '').slice(0, 500);
  save();
  appendLedger(row.userId, {
    type: 'deposit_reject',
    title: `充值申请已驳回 · ¥${Number(row.amount).toFixed(2)}`,
    deltaAvailable: 0,
    deltaTotal: 0,
    deltaFrozen: 0,
    refType: 'deposit_intent',
    refId: row.id,
    meta: { note: row.adminNote },
  });
  return row;
}

function userKindIsReal(userId) {
  const u = getUserById(userId);
  if (!u) return true;
  return u.userKind !== 'sales';
}

function ledgerTotalsToday(opts = {}) {
  const onlyReal = opts.onlyRealUsers === true;
  const day = new Date().toISOString().slice(0, 10);
  let deposit = 0;
  let withdraw = 0;
  for (const x of cache.ledger || []) {
    if (onlyReal && !userKindIsReal(x.userId)) continue;
    if (String(x.createdAt).slice(0, 10) !== day) continue;
    if (x.type === 'deposit_credit') deposit += Math.abs(Number(x.deltaTotal) || 0);
    if (x.type === 'withdraw_complete') withdraw += Math.abs(Number(x.deltaTotal) || 0);
  }
  return { deposit, withdraw, net: deposit - withdraw };
}

function verifyTradePassword(userId, plain) {
  const u = getUserById(userId);
  if (!u || !u.tradePasswordSalt) return { ok: true, required: false };
  const h = hashPassword(String(plain || ''), u.tradePasswordSalt);
  const ok = h === u.tradePasswordHash;
  return { ok, required: true };
}

function updateOwnProfile(userId, patch) {
  const u = getUserById(userId);
  if (!u) throw new Error('用户不存在');
  if (patch.nickname !== undefined) {
    const n = String(patch.nickname).trim().slice(0, 32);
    if (n.length >= 2) u.nickname = n;
  }
  if (patch.phone !== undefined) u.phone = String(patch.phone).trim().slice(0, 20);
  if (patch.realName !== undefined) u.realName = String(patch.realName).trim().slice(0, 32);
  save();
}

function snapshotAccount(userId) {
  const u = getUserById(userId);
  if (!u) return null;
  const a = ensureAccount(u);
  return {
    available: Number(a.available),
    totalAsset: Number(a.totalAsset),
    frozen: Number(a.frozen) || 0,
  };
}

function listWithdrawIntents(userId) {
  return [...(cache.withdrawIntents || [])]
    .filter((w) => w.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);
}

function createWithdrawIntent(userId, amount, payoutMethodId) {
  const u = getUserById(userId);
  const methods = u?.payoutMethods || [];
  if (!methods.length) {
    const err = new Error('NEED_BIND_CARD');
    err.code = 'NEED_BIND_CARD';
    throw err;
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('金额无效');
  const a = ensureAccount(u);
  const frozen = Number(a.frozen) || 0;
  if (amt > Number(a.available)) throw new Error('可用余额不足（含冻结中的提现金额）');
  let pm = payoutMethodId ? methods.find((p) => p.id === payoutMethodId) : null;
  if (!pm) pm = methods.find((p) => p.isDefault) || methods[0];
  if (!pm) throw new Error('请选择提现银行卡');
  if (!Array.isArray(cache.withdrawIntents)) cache.withdrawIntents = [];
  a.available = +(Number(a.available) - amt).toFixed(2);
  a.frozen = +(frozen + amt).toFixed(2);
  const row = {
    id: uid('wd_'),
    userId,
    amount: amt,
    payoutMethodId: pm.id,
    bankName: pm.bankName,
    cardMask: maskCardNumber(pm),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  cache.withdrawIntents.push(row);
  save();
  appendLedger(userId, {
    type: 'withdraw_freeze',
    title: `提现申请 · 冻结 ¥${amt.toFixed(2)}`,
    deltaAvailable: -amt,
    deltaTotal: 0,
    deltaFrozen: amt,
    refType: 'withdraw_intent',
    refId: row.id,
    meta: { bankName: pm.bankName, cardLast4: pm.cardLast4 },
  });
  return row;
}

function uid(prefix = '') {
  return prefix + crypto.randomUUID();
}

// --- Users ---
/** 登录会话版本：修改登录密码后递增，使旧 JWT 失效 */
function bumpLoginSessionVersion(u) {
  if (!u) return;
  const cur = Number(u.sessionVersion);
  u.sessionVersion = Number.isFinite(cur) && cur >= 1 ? cur + 1 : 2;
  save();
}

function createUser({ nickname }) {
  const user = {
    id: uid('u_'),
    nickname: String(nickname || '访客').slice(0, 32) || '访客',
    role: 'user',
    sessionVersion: 1,
    payoutMethods: [],
    account: defaultAccount(),
    phone: '',
    realName: '',
    userKind: 'real',
    createdAt: new Date().toISOString(),
  };
  cache.users.push(user);
  save();
  return user;
}

function getUserById(id) {
  return cache.users.find((u) => u.id === id) || null;
}

function findUserByNickname(nick) {
  const n = String(nick).trim().toLowerCase();
  if (!n) return null;
  return (
    cache.users.find((u) => String(u.loginName || u.nickname || '')
      .trim()
      .toLowerCase() === n) || null
  );
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 12000, 64, 'sha512').toString('hex');
}

function normalizeSecurityAnswer(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function buildSecurityStorage(security) {
  const rows = Array.isArray(security) ? security : [];
  const qids = rows.map((r) => String(r.questionId || '').trim());
  if (!securityPresets.validateTwoQuestionIds(qids)) {
    throw new Error('请选择两道不同的密保问题');
  }
  if (rows.length !== 2) throw new Error('请完整填写两道密保及答案');
  const out = [];
  for (const row of rows) {
    const ans = normalizeSecurityAnswer(row.answer);
    if (ans.length < 1) throw new Error('密保答案不能为空');
    const salt = crypto.randomBytes(16).toString('hex');
    out.push({
      questionId: String(row.questionId).trim(),
      answerSalt: salt,
      answerHash: hashPassword(ans, salt),
    });
  }
  return out;
}

/** 注册：不传密保或全部留空则 `securityQuestions` 为空；若填写则须两道完整且有效。 */
function resolveRegisterSecurity(security) {
  const raw = Array.isArray(security) ? security : [];
  const filled = [];
  for (const r of raw) {
    const q = String(r?.questionId || '').trim();
    const a = String(r?.answer || '').trim();
    if (!q && !a) continue;
    if (!q || !a) throw new Error('密保须同时填写两道不同问题及答案，或全部留空');
    filled.push({ questionId: q, answer: a });
  }
  if (filled.length === 0) return [];
  if (filled.length === 2) return buildSecurityStorage(filled);
  throw new Error('密保须同时填写两道不同问题及答案，或全部留空');
}

function createRegisteredUser({ nickname, password, tradePassword, security }) {
  const nick = String(nickname).trim().slice(0, 32);
  if (nick.length < 2) throw new Error('用户名至少 2 个字符');
  if (String(password).length < 6) throw new Error('密码至少 6 位');
  const tp = String(tradePassword || '').trim();
  if (tp.length < 6) throw new Error('交易密码至少 6 位');
  if (findUserByNickname(nick)) throw new Error('用户名已存在');
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const ts = crypto.randomBytes(16).toString('hex');
  const tradePasswordHash = hashPassword(tp, ts);
  const securityQuestions = resolveRegisterSecurity(security);
  const user = {
    id: uid('u_'),
    nickname: nick,
    loginName: nick,
    passwordHash,
    passwordSalt: salt,
    tradePasswordSalt: ts,
    tradePasswordHash,
    securityQuestions,
    role: 'user',
    sessionVersion: 1,
    payoutMethods: [],
    account: defaultAccount(),
    phone: '',
    realName: '',
    userKind: 'real',
    createdAt: new Date().toISOString(),
  };
  cache.users.push(user);
  save();
  return user;
}

function verifySecurityAnswersForUser(u, submitted) {
  const stored = u?.securityQuestions;
  if (!Array.isArray(stored) || stored.length < 2) return false;
  const list = Array.isArray(submitted) ? submitted : [];
  for (const st of stored) {
    const row = list.find((x) => String(x.questionId || '').trim() === st.questionId);
    if (!row) return false;
    const h = hashPassword(normalizeSecurityAnswer(row.answer), st.answerSalt);
    if (h !== st.answerHash) return false;
  }
  return true;
}

function getRecoveryQuestionPreview(nickname) {
  const u = findUserByNickname(nickname);
  if (!u || !Array.isArray(u.securityQuestions) || u.securityQuestions.length < 2) return null;
  return u.securityQuestions.map((s) => ({
    questionId: s.questionId,
    text: securityPresets.getText(s.questionId),
  }));
}

/** 忘记密码第一步：账号存在则返回密保题干，或未设密保时仅允许凭交易密码重置。 */
function getPublicRecoveryPreview(nickname) {
  const u = findUserByNickname(String(nickname || '').trim());
  if (!u) return null;
  const stored = u.securityQuestions;
  if (!Array.isArray(stored) || stored.length < 2) {
    return { tradePasswordOnly: true, questions: [] };
  }
  return {
    tradePasswordOnly: false,
    questions: stored.map((s) => ({
      questionId: s.questionId,
      text: securityPresets.getText(s.questionId),
    })),
  };
}

function resetLoginPasswordPublic({ nickname, tradePassword, securityAnswers, newPassword }) {
  const u = findUserByNickname(String(nickname || '').trim());
  if (!u) throw new Error('账号不存在或验证信息不匹配');
  if (!u.tradePasswordSalt || !u.tradePasswordHash) throw new Error('该账号未设置交易密码，请联系客服');
  if (String(newPassword).length < 6) throw new Error('新密码至少 6 位');
  const tp = hashPassword(String(tradePassword || ''), u.tradePasswordSalt);
  if (tp !== u.tradePasswordHash) throw new Error('交易密码错误');
  const hasSec = Array.isArray(u.securityQuestions) && u.securityQuestions.length >= 2;
  if (hasSec && !verifySecurityAnswersForUser(u, securityAnswers)) throw new Error('密保答案错误');
  const ns = crypto.randomBytes(16).toString('hex');
  u.passwordSalt = ns;
  u.passwordHash = hashPassword(newPassword, ns);
  bumpLoginSessionVersion(u);
}

function changeLoginPasswordForUser(userId, { tradePassword, securityAnswers, newPassword }) {
  const u = getUserById(userId);
  if (!u) throw new Error('用户不存在');
  if (!u.tradePasswordSalt || !u.tradePasswordHash) throw new Error('请先设置交易密码');
  if (!Array.isArray(u.securityQuestions) || u.securityQuestions.length < 2) {
    throw new Error('未设置密保，请联系客服后再修改登录密码');
  }
  if (String(newPassword).length < 6) throw new Error('新密码至少 6 位');
  const tp = hashPassword(String(tradePassword || ''), u.tradePasswordSalt);
  if (tp !== u.tradePasswordHash) throw new Error('交易密码错误');
  if (!verifySecurityAnswersForUser(u, securityAnswers)) throw new Error('密保答案错误');
  const ns = crypto.randomBytes(16).toString('hex');
  u.passwordSalt = ns;
  u.passwordHash = hashPassword(newPassword, ns);
  bumpLoginSessionVersion(u);
}

function getSecurityQuestionsForUserPublic(userId) {
  const u = getUserById(userId);
  if (!u?.securityQuestions?.length) return [];
  return u.securityQuestions.map((s) => ({
    questionId: s.questionId,
    text: securityPresets.getText(s.questionId),
  }));
}

function adminCreateUser({ nickname, password, tradePassword, phone, realName, userKind }) {
  const nick = String(nickname).trim().slice(0, 32);
  if (nick.length < 2) throw new Error('用户名至少 2 个字符');
  if (String(password).length < 6) throw new Error('登录密码至少 6 位');
  if (findUserByNickname(nick)) throw new Error('用户名已存在');
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const uk = String(userKind || 'real').trim();
  const user = {
    id: uid('u_'),
    nickname: nick,
    loginName: nick,
    passwordHash,
    passwordSalt: salt,
    role: 'user',
    sessionVersion: 1,
    payoutMethods: [],
    account: defaultAccount(),
    phone: String(phone || '').trim().slice(0, 20),
    realName: String(realName || '').trim().slice(0, 32),
    securityQuestions: [],
    userKind: uk === 'sales' ? 'sales' : 'real',
    createdAt: new Date().toISOString(),
  };
  const tp = String(tradePassword || '').trim();
  if (tp.length >= 6) {
    const ts = crypto.randomBytes(16).toString('hex');
    user.tradePasswordSalt = ts;
    user.tradePasswordHash = hashPassword(tp, ts);
  }
  cache.users.push(user);
  save();
  return user;
}

function adminSetLoginPassword(userId, newPassword) {
  const u = getUserById(userId);
  if (!u) throw new Error('用户不存在');
  if (String(newPassword).length < 6) throw new Error('登录密码至少 6 位');
  const salt = crypto.randomBytes(16).toString('hex');
  u.passwordSalt = salt;
  u.passwordHash = hashPassword(newPassword, salt);
  bumpLoginSessionVersion(u);
}

function adminSetTradePassword(userId, newPassword) {
  const u = getUserById(userId);
  if (!u) throw new Error('用户不存在');
  if (String(newPassword).length < 6) throw new Error('交易密码至少 6 位');
  const salt = crypto.randomBytes(16).toString('hex');
  u.tradePasswordSalt = salt;
  u.tradePasswordHash = hashPassword(newPassword, salt);
  save();
}

function adminUpdateUserProfile(userId, patch) {
  const u = getUserById(userId);
  if (!u) throw new Error('用户不存在');
  if (patch.nickname !== undefined) {
    const n = String(patch.nickname).trim().slice(0, 32);
    if (n.length >= 2) u.nickname = n;
  }
  if (patch.phone !== undefined) u.phone = String(patch.phone).trim().slice(0, 20);
  if (patch.realName !== undefined) u.realName = String(patch.realName).trim().slice(0, 32);
  if (patch.loginName !== undefined) {
    const ln = String(patch.loginName).trim().slice(0, 32);
    if (ln.length >= 2) u.loginName = ln;
  }
  if (patch.userKind !== undefined) {
    const k = String(patch.userKind).trim();
    if (k === 'sales' || k === 'real') u.userKind = k;
  }
  save();
}

function getUserDetailForAdmin(userId) {
  const u = getUserById(userId);
  if (!u) return null;
  const a = ensureAccount(u);
  return {
    id: u.id,
    nickname: u.nickname,
    loginName: u.loginName || null,
    phone: u.phone || '',
    realName: u.realName || '',
    createdAt: u.createdAt,
    account: { ...a },
    hasLoginPassword: Boolean(u.passwordSalt),
    hasTradePassword: Boolean(u.tradePasswordSalt),
    userKind: u.userKind === 'sales' ? 'sales' : 'real',
  };
}

function verifyLogin(nickname, password) {
  const u = findUserByNickname(nickname);
  if (!u || !u.passwordSalt) return null;
  const h = hashPassword(password, u.passwordSalt);
  return h === u.passwordHash ? u : null;
}

// --- Sessions ---
function findOpenSession(userId) {
  return cache.sessions.find((s) => s.userId === userId && s.status === 'open') || null;
}

function openOrCreateSession(userId, clientIp, clientIpLocation) {
  const ip = String(clientIp || '')
    .trim()
    .slice(0, 80);
  const ipLoc = String(clientIpLocation || '')
    .trim()
    .slice(0, 120);
  const nowIso = new Date().toISOString();
  let s = findOpenSession(userId);
  if (s) {
    if (ip || ipLoc) {
      s.clientIp = ip;
      s.clientIpLocation = ipLoc || null;
      s.ipSeenAt = nowIso;
      s.updatedAt = nowIso;
      save();
    }
    return s;
  }
  s = {
    id: uid('s_'),
    userId,
    status: 'open',
    priority: 'normal',
    unreadForAdmin: 0,
    unreadForUser: 0,
    lastMessageAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    clientIp: ip || null,
    clientIpLocation: ipLoc || null,
    ipSeenAt: ip ? nowIso : null,
  };
  cache.sessions.push(s);
  save();
  return s;
}

function getSessionById(id) {
  return cache.sessions.find((s) => s.id === id) || null;
}

function listSessionsForAdmin() {
  return [...cache.sessions]
    .sort((a, b) => {
      if (b.unreadForAdmin !== a.unreadForAdmin) return b.unreadForAdmin - a.unreadForAdmin;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    })
    .slice(0, 500);
}

function sessionDetailForAdmin(sessionId) {
  const s = getSessionById(sessionId);
  if (!s) return null;
  const user = getUserById(s.userId);
  const messages = cache.messages
    .filter((m) => m.sessionId === sessionId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const notes = cache.notes
    .filter((n) => n.sessionId === sessionId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);
  return { session: s, user, messages, notes };
}

// --- Messages ---
function listMessages(sessionId, { before, limit = 80 } = {}) {
  let list = cache.messages.filter((m) => m.sessionId === sessionId);
  list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (before) {
    const idx = list.findIndex((m) => m.id === before);
    if (idx > 0) list = list.slice(0, idx);
    else if (idx === 0) list = [];
  }
  if (list.length > limit) list = list.slice(-limit);
  return list;
}

function insertUserMessage(sessionId, userId, content) {
  const session = getSessionById(sessionId);
  if (!session || session.userId !== userId) throw new Error('会话无效');
  const msg = {
    id: uid('m_'),
    sessionId,
    senderRole: 'user',
    senderId: userId,
    content: String(content).slice(0, 8000),
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  cache.messages.push(msg);
  session.unreadForAdmin = (session.unreadForAdmin || 0) + 1;
  session.unreadForUser = 0;
  session.lastMessageAt = msg.createdAt;
  session.updatedAt = msg.createdAt;
  save();
  return msg;
}

function insertAdminMessage(sessionId, adminId, content) {
  const session = getSessionById(sessionId);
  if (!session) throw new Error('会话不存在');
  const msg = {
    id: uid('m_'),
    sessionId,
    senderRole: 'admin',
    senderId: adminId,
    content: String(content).slice(0, 8000),
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  cache.messages.push(msg);
  session.unreadForUser = (session.unreadForUser || 0) + 1;
  session.unreadForAdmin = 0;
  session.lastMessageAt = msg.createdAt;
  session.updatedAt = msg.createdAt;
  save();
  return msg;
}

function markUserRead(sessionId, userId) {
  const session = getSessionById(sessionId);
  if (!session || session.userId !== userId) return;
  cache.messages.forEach((m) => {
    if (m.sessionId === sessionId && m.senderRole === 'admin' && !m.readAt) {
      m.readAt = new Date().toISOString();
    }
  });
  session.unreadForUser = 0;
  session.updatedAt = new Date().toISOString();
  save();
}

function markAdminRead(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return;
  cache.messages.forEach((m) => {
    if (m.sessionId === sessionId && m.senderRole === 'user' && !m.readAt) {
      m.readAt = new Date().toISOString();
    }
  });
  session.unreadForAdmin = 0;
  session.updatedAt = new Date().toISOString();
  save();
}

function addNote(sessionId, adminId, content) {
  const n = {
    id: uid('n_'),
    sessionId,
    adminId,
    content: String(content).slice(0, 2000),
    createdAt: new Date().toISOString(),
  };
  cache.notes.push(n);
  save();
  return n;
}

function listQuickReplies() {
  return [...cache.quickReplies].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

function addQuickReply(title, content) {
  const q = { id: uid('qr_'), title: title.slice(0, 64), content: content.slice(0, 2000), createdAt: new Date().toISOString() };
  cache.quickReplies.push(q);
  save();
  return q;
}

function getFaq() {
  return cache.faq || defaultData().faq;
}

function listUsersForAdmin() {
  return (cache.users || []).map((u) => {
    const a = ensureAccount(u);
    return {
      id: u.id,
      nickname: u.nickname,
      loginName: u.loginName || null,
      phone: u.phone || '',
      realName: u.realName || '',
      createdAt: u.createdAt,
      userKind: u.userKind === 'sales' ? 'sales' : 'real',
      account: { ...a },
    };
  });
}

function updateUserAccount(userId, patch) {
  const u = getUserById(userId);
  if (!u) throw new Error('用户不存在');
  const a = ensureAccount(u);
  const numKeys = ['totalAsset', 'available', 'frozen', 'accountPnl', 'todayPnl', 'creditScore'];
  for (const k of numKeys) {
    if (patch[k] !== undefined && patch[k] !== null && patch[k] !== '') {
      const n = Number(patch[k]);
      if (Number.isFinite(n)) a[k] = n;
    }
  }
  if (patch.currency !== undefined && patch.currency !== null) {
    a.currency = String(patch.currency).slice(0, 8) || 'CNY';
  }
  save();
  return { ...a };
}

function getAccountSummaryForUser(userId) {
  const u = getUserById(userId);
  if (!u) return null;
  const a = ensureAccount(u);
  const mask = u.nickname ? `${String(u.nickname).slice(0, 1)}**` : '用**';
  return {
    nameMask: mask,
    creditScore: a.creditScore,
    currency: a.currency,
    totalAsset: a.totalAsset,
    accountPnl: a.accountPnl,
    todayPnl: a.todayPnl,
    available: a.available,
    frozen: Number(a.frozen) || 0,
    userId: u.id,
    hasPayoutMethod: (u.payoutMethods || []).length > 0,
    payoutMethodCount: (u.payoutMethods || []).length,
    hasTradePassword: Boolean(u.tradePasswordSalt),
    /** 已注册正式账号（相对访客） */
    isRegistered: Boolean(u.passwordSalt),
    hasSecurityQuestions: Array.isArray(u.securityQuestions) && u.securityQuestions.length >= 2,
  };
}

module.exports = {
  load,
  save,
  createUser,
  getUserById,
  findUserByNickname,
  createRegisteredUser,
  verifyLogin,
  appendLedger,
  listLedgerForUser,
  countPendingWithdrawIntents,
  countPendingDepositIntents,
  listWithdrawIntentsAdmin,
  resolveWithdrawIntent,
  createDepositIntent,
  listDepositIntentsForUser,
  listDepositIntentsAdmin,
  approveDepositIntent,
  rejectDepositIntent,
  ledgerTotalsToday,
  userKindIsReal,
  verifyTradePassword,
  updateOwnProfile,
  snapshotAccount,
  listPayoutMethods,
  listPayoutMethodsAdmin,
  addPayoutMethod,
  removePayoutMethod,
  createWithdrawIntent,
  listWithdrawIntents,
  findOpenSession,
  openOrCreateSession,
  getSessionById,
  listSessionsForAdmin,
  sessionDetailForAdmin,
  listMessages,
  insertUserMessage,
  insertAdminMessage,
  markUserRead,
  markAdminRead,
  addNote,
  listQuickReplies,
  addQuickReply,
  getFaq,
  listUsersForAdmin,
  updateUserAccount,
  ensureAccount,
  getAccountSummaryForUser,
  getRecoveryQuestionPreview,
  getPublicRecoveryPreview,
  resetLoginPasswordPublic,
  changeLoginPasswordForUser,
  getSecurityQuestionsForUserPublic,
  adminCreateUser,
  adminSetLoginPassword,
  adminSetTradePassword,
  adminUpdateUserProfile,
  getUserDetailForAdmin,
};
