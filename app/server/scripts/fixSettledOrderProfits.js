/**
 * 修复 tradeOrders.json 中「result=亏损但 profitAmount 为 0 / 缺失」等不一致，避免界面显示亏损却盈亏 +0。
 *
 *   node scripts/fixSettledOrderProfits.js
 *   node scripts/fixSettledOrderProfits.js --write
 */
const fs = require('fs');
const path = require('path');

const { dataDir } = require('../paths');
const ordersPath = path.join(dataDir, 'tradeOrders.json');
const write = process.argv.includes('--write');

function main() {
  if (!fs.existsSync(ordersPath)) {
    throw new Error(`找不到 ${ordersPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
  const orders = Array.isArray(raw.orders) ? raw.orders : [];
  const changes = [];

  for (const o of orders) {
    if (!o || typeof o !== 'object') continue;
    if ((o.status || 'settled') !== 'settled') continue;
    const amt = Number(o.amount);
    const p = Number(o.profitAmount);
    const lose = o.result === 'lose';
    const win = o.result === 'win';
    if (lose && (!Number.isFinite(p) || p === 0) && Number.isFinite(amt) && amt > 0) {
      changes.push({ id: o.id, field: 'profitAmount', before: o.profitAmount, after: -amt });
      o.profitAmount = +(-amt).toFixed(2);
      const back = Number(o.settlementReturnAmount);
      if (!Number.isFinite(back)) {
        changes.push({ id: o.id, field: 'settlementReturnAmount', before: o.settlementReturnAmount, after: 0 });
        o.settlementReturnAmount = 0;
      }
    }
    if (win && (!Number.isFinite(p) || p === 0) && Number.isFinite(amt) && amt > 0) {
      const back = Number(o.settlementReturnAmount);
      if (Number.isFinite(back)) {
        const g = +(back - amt).toFixed(2);
        changes.push({ id: o.id, field: 'profitAmount', before: o.profitAmount, after: g });
        o.profitAmount = g;
      }
    }
  }

  if (!changes.length) {
    console.log('[fixSettledOrderProfits] 无需修改');
    return;
  }
  console.log(`[fixSettledOrderProfits] 将修改 ${changes.length} 处:`);
  for (const c of changes) console.log(JSON.stringify(c));

  if (!write) {
    console.log('\n干跑结束。确认后加 --write（先备份 tradeOrders.json）');
    return;
  }
  fs.writeFileSync(ordersPath, JSON.stringify(raw, null, 2), 'utf8');
  console.log(`\n已写回 ${ordersPath}`);
}

main();
