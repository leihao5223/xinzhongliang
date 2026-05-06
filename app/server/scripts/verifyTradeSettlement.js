/**
 * 纯函数自检：与 tradeOrders.settleOpenOrderId 中非委买的盈亏/返还公式一致
 * 运行：node scripts/verifyTradeSettlement.js
 */
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function expectWin(a, rate) {
  const gain = +(a * rate).toFixed(2);
  const back = +(a * (1 + rate)).toFixed(2);
  return { gain, back };
}

function expectLoseFull(a) {
  return { gain: +(-a).toFixed(2), back: 0 };
}

function run() {
  const a = 10000;
  const rate = 0.95;
  const w = expectWin(a, rate);
  assert(w.gain === 9500, `盈利盈亏 ${w.gain}`);
  assert(w.back === 19500, `盈利返还 ${w.back}`);
  assert(Math.abs(w.back - a - w.gain) < 0.01, '盈利：返还 - 本金 ≈ 盈亏');

  const l = expectLoseFull(a);
  assert(l.gain === -10000, `全亏盈亏 ${l.gain}`);
  assert(l.back === 0, '全亏返还为 0');
  assert(Math.abs(l.gain + a) < 0.01, '全亏：盈亏约 -本金');

  const availBefore = 5000;
  const availAfterWin = +(availBefore + w.back).toFixed(2);
  assert(availAfterWin === 24500, '结算后可用 = 结算前 + 返还');

  const availAfterLose = +(availBefore + l.back).toFixed(2);
  assert(availAfterLose === 5000, '全亏结算后可用不变（本金已在开仓扣除）');

  console.log('[verifyTradeSettlement] OK — 盈亏与返还、余额关系校验通过');
}

run();
