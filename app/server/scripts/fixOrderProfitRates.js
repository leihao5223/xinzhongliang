/**
 * 修正 tradeOrders.json 中 profitRate<=0 或不合法的订单快照（仅展示/统计字段，不改结算结果与资金）。
 *
 * 推导规则：
 * - 盈利且本金有效：优先用 settlementReturnAmount 反推 r = (返还/本金) - 1；否则用 profitAmount/本金。
 * - 其余（亏损、数据不全等）：使用默认 0.95（与市况单结算兜底收益率一致）。
 *
 * 用法（在 app/server 目录）：
 *   node scripts/fixOrderProfitRates.js
 *   node scripts/fixOrderProfitRates.js --write
 */
const fs = require('fs');
const path = require('path');

const { dataDir } = require('../paths');
const dataPath = path.join(dataDir, 'tradeOrders.json');
const DEFAULT = 0.95;
const write = process.argv.includes('--write');

function deriveRate(o) {
  const a = Number(o.amount);
  if (!Number.isFinite(a) || a <= 0) return DEFAULT;
  const win = o.result === 'win';
  if (!win) return DEFAULT;

  const ret = Number(o.settlementReturnAmount);
  if (Number.isFinite(ret) && ret >= a) {
    const r = (ret - a) / a;
    if (Number.isFinite(r) && r > 0 && r <= 10) return +r.toFixed(6);
  }

  const prof = Number(o.profitAmount);
  if (Number.isFinite(prof) && prof > 0) {
    const r = prof / a;
    if (Number.isFinite(r) && r > 0 && r <= 10) return +r.toFixed(6);
  }

  return DEFAULT;
}

function main() {
  if (!fs.existsSync(dataPath)) {
    console.error('[fixOrderProfitRates] 找不到文件:', dataPath);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const orders = Array.isArray(raw.orders) ? raw.orders : [];
  const changes = [];

  for (const o of orders) {
    if (!o || typeof o !== 'object') continue;
    const pr = Number(o.profitRate);
    if (Number.isFinite(pr) && pr > 0) continue;

    const before = o.profitRate;
    const next = deriveRate(o);
    o.profitRate = next;
    changes.push({ id: o.id, before, after: next });
  }

  if (!changes.length) {
    console.log('[fixOrderProfitRates] 无需修改');
    return;
  }

  console.log(`[fixOrderProfitRates] 共 ${changes.length} 条:`);
  for (const c of changes) console.log(JSON.stringify(c));

  if (!write) {
    console.log('\n干跑结束。确认后: node scripts/fixOrderProfitRates.js --write');
    return;
  }

  fs.writeFileSync(dataPath, JSON.stringify(raw, null, 2), 'utf8');
  console.log(`\n已写回: ${dataPath}`);
}

main();
