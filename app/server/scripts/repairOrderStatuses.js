/**
 * 离线修复 tradeOrders.json 里订单的 status，与结算字段一致。
 * 典型问题：已结算订单仍带 status=open，导致列表/后台显示错乱。
 *
 * 用法（在 app/server 目录）：
 *   node scripts/repairOrderStatuses.js           # 只打印将要修改的内容
 *   node scripts/repairOrderStatuses.js --write  # 写回 tradeOrders.json
 *
 * 务必先备份 data/tradeOrders.json。
 */
const fs = require('fs');
const path = require('path');

const { dataDir } = require('../paths');
const dataPath = path.join(dataDir, 'tradeOrders.json');
const write = process.argv.includes('--write');

function readOrders() {
  if (!fs.existsSync(dataPath)) {
    throw new Error(`找不到文件: ${dataPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const orders = Array.isArray(raw.orders) ? raw.orders : [];
  return { raw, orders };
}

function looksSettled(o) {
  if (!o || typeof o !== 'object') return false;
  const sat = o.settledAt != null && String(o.settledAt).trim() !== '';
  const cp = o.closePrice != null && Number.isFinite(Number(o.closePrice));
  const rs = o.result === 'win' || o.result === 'lose';
  return sat && cp && rs;
}

function shouldBeOpen(o) {
  const st = (o.status || '').trim();
  const end = Number(o.endsAt);
  if (st === 'open') return true;
  if (!Number.isFinite(end)) return false;
  if (end > Date.now() && !looksSettled(o)) return true;
  return false;
}

function main() {
  const { raw, orders } = readOrders();
  const changes = [];

  for (const o of orders) {
    if (!o || typeof o !== 'object') continue;
    const before = o.status;
    if (looksSettled(o)) {
      if (o.status !== 'settled') {
        o.status = 'settled';
        changes.push({ id: o.id, before, after: 'settled', reason: '已有 settledAt/closePrice/result' });
      }
      continue;
    }

    if (before === 'settled' && !looksSettled(o)) {
      if (shouldBeOpen(o)) {
        o.status = 'open';
        changes.push({ id: o.id, before: 'settled', after: 'open', reason: '无完整结算字段且仍在锁仓期内或应视为持仓' });
      } else {
        changes.push({
          id: o.id,
          before,
          after: '(未改)',
          reason: '标记 settled 但缺少结算字段且已过期——需人工或跑 settleDueOrders，勿自动改',
        });
      }
    }
  }

  if (!changes.length) {
    console.log('[repairOrderStatuses] 无需修改');
    return;
  }

  console.log(`[repairOrderStatuses] 共 ${changes.length} 条变更:`);
  for (const c of changes) console.log(JSON.stringify(c));

  if (!write) {
    console.log('\n干跑结束。确认无误后加参数: node scripts/repairOrderStatuses.js --write');
    return;
  }

  fs.writeFileSync(dataPath, JSON.stringify(raw, null, 2), 'utf8');
  console.log(`\n已写回: ${dataPath}`);
}

main();
