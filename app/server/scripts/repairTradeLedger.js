const fs = require('fs');
const path = require('path');
const { dataDir } = require('../paths');

const supportPath = path.join(dataDir, 'supportData.json');
const ordersPath = path.join(dataDir, 'tradeOrders.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function round2(v) {
  return +n(v).toFixed(2);
}

function orderReturnAmount(order) {
  if (!order || order.status !== 'settled') return null;
  const amount = n(order.amount);
  const rawRate = n(order.profitRate);
  const rate = rawRate > 0 && rawRate <= 1 ? rawRate : 0.88;
  const win = order.result === 'win';
  return win ? round2(amount * (1 + rate)) : 0;
}

function main() {
  if (!fs.existsSync(supportPath) || !fs.existsSync(ordersPath)) {
    throw new Error('缺少数据文件：supportData.json 或 tradeOrders.json');
  }

  const support = readJson(supportPath);
  const ordersData = readJson(ordersPath);
  const orders = Array.isArray(ordersData.orders) ? ordersData.orders : [];
  const orderById = new Map(orders.map((o) => [String(o.id || ''), o]));

  const ledger = Array.isArray(support.ledger) ? support.ledger : [];
  const ledgerByUser = new Map();
  ledger.forEach((row, idx) => {
    const uid = String(row.userId || '');
    if (!ledgerByUser.has(uid)) ledgerByUser.set(uid, []);
    ledgerByUser.get(uid).push({ row, idx });
  });

  let touchedTradeRows = 0;
  let touchedOrders = 0;
  let touchedUsers = 0;

  for (const [userId, list] of ledgerByUser.entries()) {
    list.sort((a, b) => {
      const ta = new Date(a.row.createdAt || 0).getTime();
      const tb = new Date(b.row.createdAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return a.idx - b.idx;
    });

    let avail = 0;
    let total = 0;
    let frozen = 0;
    if (list.length) {
      const f = list[0].row;
      avail = round2(n(f.afterAvailable) - n(f.deltaAvailable));
      total = round2(n(f.afterTotal) - n(f.deltaTotal));
      frozen = round2(n(f.afterFrozen) - n(f.deltaFrozen));
    }

    for (const item of list) {
      const row = item.row;
      let da = round2(n(row.deltaAvailable));
      let dt = round2(n(row.deltaTotal));
      let df = round2(n(row.deltaFrozen));

      if (String(row.type || '') === 'trade' && row.refId) {
        const order = orderById.get(String(row.refId));
        if (order && order.userId === userId && order.status === 'settled') {
          const amount = n(order.amount);
          const ret = orderReturnAmount(order);
          if (ret != null) {
            da = round2(ret);
            dt = round2(ret);
            df = 0;
            const beforeSettle = avail;
            avail = round2(avail + da);
            total = round2(total + dt);
            frozen = round2(frozen + df);

            row.deltaAvailable = da;
            row.deltaTotal = dt;
            row.deltaFrozen = df;
            row.afterAvailable = avail;
            row.afterTotal = total;
            row.afterFrozen = frozen;
            touchedTradeRows += 1;

            order.balanceBeforeSettle = beforeSettle;
            order.balanceAfterSettle = avail;
            order.settlementReturnAmount = ret;
            order.profitAmount = order.result === 'win' ? round2(amount * ((n(order.profitRate) > 0 && n(order.profitRate) <= 1) ? n(order.profitRate) : 0.88)) : -round2(amount);
            touchedOrders += 1;
            continue;
          }
        }
      }

      avail = round2(avail + da);
      total = round2(total + dt);
      frozen = round2(frozen + df);
      row.afterAvailable = avail;
      row.afterTotal = total;
      row.afterFrozen = frozen;
    }

    const user = (support.users || []).find((u) => String(u.id) === userId);
    if (user && user.account && typeof user.account === 'object') {
      user.account.available = avail;
      user.account.totalAsset = total;
      user.account.frozen = frozen;
      const settled = orders.filter((o) => o && o.userId === userId && o.status === 'settled');
      user.account.accountPnl = round2(settled.reduce((s, o) => s + n(o.profitAmount), 0));
      const today = new Date().toISOString().slice(0, 10);
      user.account.todayPnl = round2(
        settled.reduce((s, o) => (String(o.settledAt || '').slice(0, 10) === today ? s + n(o.profitAmount) : s), 0)
      );
      touchedUsers += 1;
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(supportPath, `${supportPath}.${stamp}.bak`);
  fs.copyFileSync(ordersPath, `${ordersPath}.${stamp}.bak`);
  writeJson(supportPath, support);
  writeJson(ordersPath, ordersData);

  console.log(
    `[repair-trade-ledger] done. tradeRows=${touchedTradeRows}, orders=${touchedOrders}, users=${touchedUsers}`
  );
}

main();
