/**
 * 公开行情推送（与 skynet 思路一致）：服务端每秒推进演示报价，经 Socket 广播；
 * 数值为算法生成，非交易所撮合结果，但满足「每秒有数据」的展示需求。
 */

const state = new Map(); // id -> { price: number, prev: number }

let hooks = {
  getSimSettings: () => ({ priceVolatility: 0.65, priceDriftBias: 0.02 }),
  getListedProductRows: () => [],
  getStaticBase: (_id) => ({ basePrice: 100, high24: 101, low24: 99, volume24: 1e6 }),
};

function configure(h) {
  hooks = { ...hooks, ...h };
}

function ensureRow(id, seedPrice) {
  if (!state.has(id)) {
    const p = Number(seedPrice);
    const v = Number.isFinite(p) && p > 0 ? p : 100;
    state.set(id, { price: v, prev: v });
  }
}

function tick() {
  const rows = hooks.getListedProductRows();
  const sim = hooks.getSimSettings();
  const volBase = Number(sim.priceVolatility) || 0.65;
  const drift = Number(sim.priceDriftBias) || 0;

  for (const p of rows) {
    const id = p.id;
    const meta = hooks.getStaticBase(id);
    const seed = Number(meta.basePrice) || 100;
    ensureRow(id, seed);
    const row = state.get(id);
    if (!row) continue;

    const pv = Number(p.quoteVolatility);
    const volForProduct = Number.isFinite(pv) && pv > 0 ? pv : volBase;
    const amp = volForProduct * (0.012 + (id % 11) * 0.0011);
    const delta = (Math.random() - 0.5) * 2 * amp * row.price;
    const bias = drift * 0.00015 * row.price;
    let next = row.price + delta + bias;
    next = Math.max(seed * 0.3, Math.min(seed * 3, next));
    row.prev = row.price;
    row.price = +next.toFixed(4);
  }

  for (const k of [...state.keys()]) {
    if (!rows.some((r) => r.id === k)) state.delete(k);
  }
}

function getLive(id) {
  const row = state.get(id);
  if (!row) return null;
  const prev = row.prev || row.price;
  const changePct = prev > 0 ? ((row.price - prev) / prev) * 100 : 0;
  return { price: row.price, changePct: +changePct.toFixed(4) };
}

function getAllQuotes() {
  const rows = hooks.getListedProductRows();
  return rows.map((p) => {
    const q = getLive(p.id);
    return {
      productId: p.id,
      price: q ? q.price : Number(hooks.getStaticBase(p.id).basePrice) || 0,
      changePct: q ? q.changePct : 0,
    };
  });
}

module.exports = {
  configure,
  tick,
  getLive,
  getAllQuotes,
};
