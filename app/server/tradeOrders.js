/**
 * 交易订单（JSON 持久化）
 * 支持持仓中（open）到期结算（settled），与后台订单列表、用户端倒计时一致。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const sd = require('./supportData');
const paths = require('./paths');

const dataPath = path.join(paths.dataDir, 'tradeOrders.json');

function defaultData() {
  return { orders: [] };
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

/** @type {((userId: string, payload: { order: object; ledger: object | null }) => void) | null} */
let onOrderSettled = null;

function setOnOrderSettled(fn) {
  onOrderSettled = typeof fn === 'function' ? fn : null;
}

function migrateOrderShapes() {
  let changed = false;
  for (const o of cache.orders || []) {
    if (!o || typeof o !== 'object') continue;
    if (o.status === undefined || o.status === null) {
      o.status = 'settled';
      changed = true;
    }
  }
  if (changed) save();
}

migrateOrderShapes();

function rowLooksSettled(o) {
  if (!o || typeof o !== 'object') return false;
  const sat = o.settledAt != null && String(o.settledAt).trim() !== '';
  const cp = o.closePrice != null && Number.isFinite(Number(o.closePrice));
  const rs = o.result === 'win' || o.result === 'lose';
  return sat && cp && rs;
}

/** 仅用于 API 输出；不写盘、不改内存 cache */
function normalizeOrderForApi(o) {
  if (!o || typeof o !== 'object') return o;
  const out = { ...o };
  const amt = Number(out.amount);
  const hasResult = out.result === 'win' || out.result === 'lose';
  if (hasResult) out.status = 'settled';
  else if (rowLooksSettled(out)) out.status = 'settled';

  if (out.result === 'lose' && Number.isFinite(amt) && amt > 0) {
    const p = Number(out.profitAmount);
    if (!Number.isFinite(p) || p === 0) out.profitAmount = +(-amt).toFixed(2);
    if (!Number.isFinite(Number(out.settlementReturnAmount))) out.settlementReturnAmount = 0;
  }
  if (out.result === 'win' && Number.isFinite(amt) && amt > 0) {
    const p = Number(out.profitAmount);
    const back = Number(out.settlementReturnAmount);
    if (Number.isFinite(back) && (!Number.isFinite(p) || p === 0)) {
      out.profitAmount = +(back - amt).toFixed(2);
    }
  }
  return out;
}

function save() {
  fs.writeFileSync(dataPath, JSON.stringify(cache, null, 2), 'utf8');
}

function insertOrder(row) {
  cache.orders.push(row);
  save();
  return row;
}

function sortAdminOrders(a, b) {
  const as = a.status || 'settled';
  const bs = b.status || 'settled';
  if (as === 'open' && bs !== 'open') return -1;
  if (as !== 'open' && bs === 'open') return 1;
  if (as === 'open' && bs === 'open') return Number(a.endsAt) - Number(b.endsAt);
  const tb = new Date(b.settledAt || b.createdAt).getTime();
  const ta = new Date(a.settledAt || a.createdAt).getTime();
  return tb - ta;
}

function listForUser(userId) {
  const mine = (cache.orders || []).filter((o) => o && o.userId === userId);
  const norm = mine.map(normalizeOrderForApi);
  // 唯一规则：只有明确 status==='open' 算进行中，其余（含 undefined）全部进已结算区，避免漏单、双空
  const open = norm
    .filter((o) => o.status === 'open')
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const done = norm
    .filter((o) => o.status !== 'open')
    .sort((a, b) => new Date(b.settledAt || b.createdAt) - new Date(a.settledAt || a.createdAt));
  return [...open, ...done];
}

function listForAdmin(opts = {}) {
  const {
    limit = 100,
    offset = 0,
    status,
    userId,
    openedFrom,
    openedTo,
    direction,
    orderKind,
  } = opts;
  let rows = [...(cache.orders || [])].filter((o) => o && typeof o === 'object');
  const st = status && String(status).trim() && String(status) !== 'all' ? String(status).trim() : '';
  if (st) {
    rows = rows.filter((o) => (o.status || 'settled') === st);
  }
  if (userId && String(userId).trim()) {
    const uq = String(userId).trim().toLowerCase();
    rows = rows.filter((o) => String(o.userId).toLowerCase().includes(uq));
  }
  if (openedFrom) {
    const t = new Date(openedFrom).getTime();
    if (Number.isFinite(t)) rows = rows.filter((o) => new Date(o.createdAt).getTime() >= t);
  }
  if (openedTo) {
    const t = new Date(openedTo).getTime();
    if (Number.isFinite(t)) rows = rows.filter((o) => new Date(o.createdAt).getTime() <= t);
  }
  if (direction === 'long' || direction === 'short') {
    rows = rows.filter((o) => o.direction === direction);
  }
  if (orderKind === 'entrust' || orderKind === 'market') {
    rows = rows.filter((o) => (o.orderKind || 'market') === orderKind);
  }
  rows.sort(sortAdminOrders);
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const off = Math.max(0, Number(offset) || 0);
  const slice = rows.slice(off, off + lim);
  const userCache = new Map();
  function uRow(uid) {
    if (!userCache.has(uid)) userCache.set(uid, sd.getUserById(uid));
    return userCache.get(uid);
  }
  const list = slice.map((o) => {
    const u = uRow(o.userId);
    return normalizeOrderForApi({
      ...o,
      userDisplay: u ? String(u.nickname || u.phone || u.id || o.userId) : String(o.userId),
      userRealName: u && u.realName ? String(u.realName) : '',
    });
  });
  return {
    list,
    total: rows.length,
    limit: lim,
    offset: off,
  };
}

function listByUserId(userId, opts = {}) {
  const lim = Math.min(500, Math.max(1, Number(opts.limit) || 100));
  const all = listForUser(userId);
  return all.slice(0, lim);
}

/** 仪表盘：订单统计（含持仓中） */
function aggregateStats(isRealUser) {
  const pred = typeof isRealUser === 'function' ? isRealUser : () => true;
  const orders = cache.orders || [];
  const now = Date.now();
  const dayMs = 86400000;
  const inRange = (t, days) => new Date(t).getTime() > now - days * dayMs;
  let volume30d = 0;
  let profitSum30d = 0;
  let orderCount = 0;
  for (const o of orders) {
    if (!pred(o.userId)) continue;
    orderCount += 1;
    if (!inRange(o.createdAt, 30)) continue;
    volume30d += Number(o.amount) || 0;
    profitSum30d += Number(o.profitAmount) || 0;
  }
  return { orderCount, volume30d, profitSum30d };
}

function volumeSeriesLastDays(days = 30, isRealUser) {
  const pred = typeof isRealUser === 'function' ? isRealUser : () => true;
  const n = Math.max(1, Math.min(90, Number(days) || 30));
  const now = Date.now();
  const dayMs = 86400000;
  const series = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const start = new Date(now - i * dayMs);
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + dayMs;
    let vol = 0;
    for (const o of cache.orders || []) {
      if (!pred(o.userId)) continue;
      const t = new Date(o.createdAt).getTime();
      if (t >= start.getTime() && t < end) vol += Number(o.amount) || 0;
    }
    series.push(+vol.toFixed(2));
  }
  return series;
}

function activeUserCountInDays(days = 10, isRealUser) {
  const pred = typeof isRealUser === 'function' ? isRealUser : () => true;
  const cutoff = Date.now() - Math.max(1, Number(days) || 10) * 86400000;
  const set = new Set();
  for (const o of cache.orders || []) {
    if (!pred(o.userId)) continue;
    if (new Date(o.createdAt).getTime() >= cutoff) set.add(o.userId);
  }
  return set.size;
}

function settleOpenOrderId(id) {
  const order = (cache.orders || []).find((o) => o && o.id === id);
  if (!order || order.status !== 'open') return null;
  const endMs = Number(order.endsAt);
  const createdMs = new Date(order.createdAt || 0).getTime();
  if (!Number.isFinite(endMs) || endMs <= 0) {
    console.error('[tradeOrders] skip settle: invalid endsAt', order.id, order.endsAt);
    return null;
  }
  if (!Number.isFinite(createdMs) || endMs <= createdMs) {
    console.error('[tradeOrders] skip settle: endsAt not after createdAt', order.id);
    return null;
  }
  if (Date.now() < endMs) return null;

  const u = sd.getUserById(order.userId);
  if (!u) throw new Error('用户不存在');
  /** 产品已从 store 下架或未写入时，用订单快照结算，避免永久卡在「持仓中」 */
  let product = store.getProductById(order.productId);
  if (!product) {
    product = {
      id: Number(order.productId) || order.productId,
      name: order.productName || String(order.productId),
      tradeName: order.productName || String(order.productId),
      basePrice: Number(order.openPrice) || 0,
      tradeProfitRate: Number(order.profitRate) || 0,
      status: 'listed',
    };
  }

  const forced = store.effectiveSettlementResult();
  const productForced =
    typeof store.effectiveSettlementResultForProduct === 'function'
      ? store.effectiveSettlementResultForProduct(order.productId)
      : null;
  const entrustRule =
    order.orderKind === 'entrust' && typeof store.activeEntrustControlRule === 'function'
      ? store.activeEntrustControlRule(order.productId)
      : null;
  const entrustForced = entrustRule ? (entrustRule.mode === 'lose' ? 'lose' : 'win') : null;
  const naturalWin = Math.random() < 0.48;
  const win =
    entrustForced === 'win'
      ? true
      : entrustForced === 'lose'
        ? false
        : forced === 'win'
          ? true
          : forced === 'lose'
            ? false
            : productForced === 'win'
              ? true
              : productForced === 'lose'
                ? false
                : naturalWin;

  const baseP = Number(order.openPrice);
  const jitter = Math.max(0.0001, baseP * (0.0005 + Math.random() * 0.002));
  const direction = order.direction === 'short' ? 'short' : 'long';
  let closePrice;
  if (win) {
    closePrice =
      direction === 'long'
        ? +(baseP + jitter * (0.6 + Math.random() * 0.8)).toFixed(4)
        : +(baseP - jitter * (0.6 + Math.random() * 0.8)).toFixed(4);
  } else {
    closePrice =
      direction === 'long'
        ? +(baseP - jitter * (0.6 + Math.random() * 0.8)).toFixed(4)
        : +(baseP + jitter * (0.6 + Math.random() * 0.8)).toFixed(4);
  }

  const a = Number(order.amount);
  const rawRate = Number(order.profitRate);
  const rate = Math.min(10, Math.max(0.0001, Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 0.95));
  const entrustLoseRate = Number(entrustRule?.loseRatePct);
  const entrustWinRate = Number(entrustRule?.winRatePct);
  const loseRatePct = Number.isFinite(entrustLoseRate) ? Math.max(0, Math.min(100, entrustLoseRate)) : 100;
  const winRatePct = Number.isFinite(entrustWinRate) ? Math.max(0, entrustWinRate) : rate * 100;
  const gain = win
    ? +(a * (entrustRule ? winRatePct / 100 : rate)).toFixed(2)
    : -(entrustRule ? +(a * (loseRatePct / 100)).toFixed(2) : a);

  const acc = sd.ensureAccount(u);
  const beforeAvail = +Number(acc.available || 0).toFixed(2);
  const beforeTotal = +Number(acc.totalAsset || 0).toFixed(2);
  const beforeFrozen = +Number(acc.frozen || 0).toFixed(2);
  let deltaAvailable = 0;
  let deltaTotal = 0;
  let deltaFrozen = 0;
  if (win) {
    const settleBack = entrustRule ? +(a + a * (winRatePct / 100)).toFixed(2) : +(a * (1 + rate)).toFixed(2);
    deltaAvailable = settleBack;
    deltaTotal = settleBack;
    acc.available = +(beforeAvail + deltaAvailable).toFixed(2);
    acc.totalAsset = +(beforeTotal + deltaTotal).toFixed(2);
    acc.accountPnl = +(Number(acc.accountPnl || 0) + gain).toFixed(2);
    acc.todayPnl = +(Number(acc.todayPnl || 0) + gain).toFixed(2);
    order.settlementReturnAmount = settleBack;
  } else {
    const settleBack = entrustRule ? +(a - a * (loseRatePct / 100)).toFixed(2) : 0;
    deltaAvailable = settleBack;
    deltaTotal = settleBack;
    acc.available = +(beforeAvail + deltaAvailable).toFixed(2);
    acc.totalAsset = +(beforeTotal + deltaTotal).toFixed(2);
    acc.accountPnl = +(Number(acc.accountPnl || 0) + gain).toFixed(2);
    acc.todayPnl = +(Number(acc.todayPnl || 0) + gain).toFixed(2);
    order.settlementReturnAmount = settleBack;
  }
  sd.save();

  order.closePrice = closePrice;
  order.result = win ? 'win' : 'lose';
  order.profitAmount = +gain.toFixed(2);
  order.settlementNote = entrustForced
    ? `委买控盘:${entrustForced}(产品${order.productId})`
    : forced
      ? `全局控盘:${forced}(产品${order.productId})`
      : productForced
        ? `产品控盘:${productForced}(产品${order.productId})`
        : '正常';
  order.settledAt = new Date().toISOString();
  order.status = 'settled';
  order.balanceBeforeSettle = beforeAvail;
  order.balanceAfterSettle = +Number(acc.available || 0).toFixed(2);
  save();

  let ledgerEntry = null;
  ledgerEntry = sd.appendLedger(order.userId, {
    type: 'trade',
    title: `交易结算 · ${order.productName}（${win ? '盈' : '亏'}）`,
    deltaAvailable: +deltaAvailable.toFixed(2),
    deltaTotal: +deltaTotal.toFixed(2),
    deltaFrozen: +deltaFrozen.toFixed(2),
    refType: 'order',
    refId: order.id,
    meta: {
      direction: order.direction,
      result: order.result,
      stake: a,
      profitAmount: order.profitAmount,
      settlementReturnAmount: order.settlementReturnAmount,
      durationSec: order.durationSec,
      balanceBeforeSettle: beforeAvail,
      balanceAfterSettle: order.balanceAfterSettle,
    },
  });
  if (onOrderSettled && ledgerEntry) {
    try {
      onOrderSettled(order.userId, { order: { ...order }, ledger: ledgerEntry });
    } catch (e) {
      console.error('[tradeOrders] onOrderSettled', e);
    }
  }
  return order;
}

function settleDueOrders() {
  const now = Date.now();
  const ids = [];
  for (const o of cache.orders || []) {
    if (o && o.status === 'open' && Number(o.endsAt) <= now) ids.push(o.id);
  }
  for (const id of ids) {
    try {
      settleOpenOrderId(id);
    } catch (e) {
      console.error('[tradeOrders] settleOpenOrderId', id, e && e.message);
    }
  }
}

module.exports = {
  insertOrder,
  listForUser,
  listForAdmin,
  listByUserId,
  aggregateStats,
  volumeSeriesLastDays,
  activeUserCountInDays,
  settleDueOrders,
  settleOpenOrderId,
  setOnOrderSettled,
};
