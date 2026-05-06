/**
 * 订单结算逻辑自检测试脚本
 * 运行: node scripts/testOrderSettlement.js
 *
 * 测试内容:
 * 1. 盈利订单结算逻辑
 * 2. 亏损订单结算逻辑
 * 3. 委买模式结算逻辑
 * 4. 数值计算正确性验证
 */

const path = require('path');

// 模拟 store 模块
const mockStore = {
  effectiveSettlementResult: () => null, // 无全局控盘
  activeEntrustControlRule: () => null,  // 无委买控盘
};

// 模拟 supportData 模块
const mockSupportData = {
  users: new Map(),
  accounts: new Map(),
  ledgers: [],

  getUserById(userId) {
    return this.users.get(userId) || null;
  },

  ensureAccount(user) {
    if (!this.accounts.has(user.id)) {
      this.accounts.set(user.id, {
        userId: user.id,
        available: 10000, // 初始余额10000
        totalAsset: 10000,
        frozen: 0,
        accountPnl: 0,
        todayPnl: 0,
      });
    }
    return this.accounts.get(user.id);
  },

  snapshotAccount(userId) {
    const acc = this.accounts.get(userId);
    return acc ? { ...acc } : null;
  },

  save() {
    // 模拟保存
  },

  appendLedger(userId, entry) {
    const ledgerEntry = {
      id: `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      ...entry,
      createdAt: new Date().toISOString(),
    };
    this.ledgers.push(ledgerEntry);
    return ledgerEntry;
  },
};

// 结算函数（从 tradeOrders.js 复制并简化）
function settleOrder(order, user, product, forced = null, entrustRule = null) {
  const a = Number(order.amount);
  const rawRate = Number(order.profitRate);
  const rate = Math.min(10, Math.max(0.0001, Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 0.95));

  // 确定输赢
  const entrustForced = entrustRule ? (entrustRule.mode === 'lose' ? 'lose' : 'win') : null;
  const naturalWin = Math.random() < 0.48;
  const win = entrustForced === 'win' ? true :
              entrustForced === 'lose' ? false :
              forced === 'win' ? true :
              forced === 'lose' ? false : naturalWin;

  // 计算结算价格
  const baseP = Number(order.openPrice);
  const jitter = Math.max(0.0001, baseP * (0.0005 + Math.random() * 0.002));
  const direction = order.direction === 'short' ? 'short' : 'long';
  let closePrice;
  if (win) {
    closePrice = direction === 'long'
      ? +(baseP + jitter * (0.6 + Math.random() * 0.8)).toFixed(4)
      : +(baseP - jitter * (0.6 + Math.random() * 0.8)).toFixed(4);
  } else {
    closePrice = direction === 'long'
      ? +(baseP - jitter * (0.6 + Math.random() * 0.8)).toFixed(4)
      : +(baseP + jitter * (0.6 + Math.random() * 0.8)).toFixed(4);
  }

  // 计算盈亏和返还
  const entrustLoseRate = Number(entrustRule?.loseRatePct);
  const entrustWinRate = Number(entrustRule?.winRatePct);
  const loseRatePct = Number.isFinite(entrustLoseRate) ? Math.max(0, Math.min(100, entrustLoseRate)) : 100;
  const winRatePct = Number.isFinite(entrustWinRate) ? Math.max(0, entrustWinRate) : rate * 100;

  const gain = win
    ? +(a * (entrustRule ? winRatePct / 100 : rate)).toFixed(2)
    : -(entrustRule ? +(a * (loseRatePct / 100)).toFixed(2) : a);

  // 结算前账户状态
  const acc = mockSupportData.ensureAccount(user);
  const beforeAvail = +Number(acc.available || 0).toFixed(2);
  const beforeTotal = +Number(acc.totalAsset || 0).toFixed(2);

  // 计算返还金额
  let settleBack;
  if (win) {
    settleBack = entrustRule ? +(a + a * (winRatePct / 100)).toFixed(2) : +(a * (1 + rate)).toFixed(2);
  } else {
    settleBack = entrustRule ? +(a - a * (loseRatePct / 100)).toFixed(2) : 0;
  }

  // 更新账户
  acc.available = +(beforeAvail + settleBack).toFixed(2);
  acc.totalAsset = +(beforeTotal + settleBack).toFixed(2);
  acc.accountPnl = +(Number(acc.accountPnl || 0) + gain).toFixed(2);
  acc.todayPnl = +(Number(acc.todayPnl || 0) + gain).toFixed(2);

  // 更新订单
  order.closePrice = closePrice;
  order.result = win ? 'win' : 'lose';
  order.profitAmount = +gain.toFixed(2);
  order.settlementReturnAmount = settleBack;
  order.settledAt = new Date().toISOString();
  order.status = 'settled';
  order.balanceBeforeSettle = beforeAvail;
  order.balanceAfterSettle = +Number(acc.available || 0).toFixed(2);

  return {
    order,
    beforeAvail,
    afterAvail: order.balanceAfterSettle,
    settleBack,
    gain,
    win,
  };
}

// 验证函数
function verifySettlement(result, testCase) {
  const { order, beforeAvail, afterAvail, settleBack, gain, win } = result;
  const a = Number(order.amount);
  const errors = [];

  // 1. 验证余额变化
  const expectedAfter = +(beforeAvail + settleBack).toFixed(2);
  if (Math.abs(afterAvail - expectedAfter) > 0.02) {
    errors.push(`余额变化错误: 期望${expectedAfter}, 实际${afterAvail}`);
  }

  // 2. 验证盈亏与返还的关系: gain = settleBack - amount
  const expectedGain = +(settleBack - a).toFixed(2);
  if (Math.abs(gain - expectedGain) > 0.02) {
    errors.push(`盈亏计算错误: 盈亏=${gain}, 期望=${expectedGain} (返还${settleBack} - 本金${a})`);
  }

  // 3. 验证输赢与盈亏符号一致
  if (win && gain < 0) {
    errors.push(`盈利但盈亏为负: ${gain}`);
  }
  if (!win && gain > 0) {
    errors.push(`亏损但盈亏为正: ${gain}`);
  }

  // 4. 验证返还金额非负
  if (settleBack < 0) {
    errors.push(`返还金额为负: ${settleBack}`);
  }

  // 5. 验证盈利时返还 > 本金
  if (win && settleBack <= a) {
    errors.push(`盈利但返还<=本金: 返还${settleBack}, 本金${a}`);
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

// 测试用例
function runTests() {
  console.log('=== 订单结算逻辑自检测试 ===\n');

  const testCases = [
    {
      name: '普通盈利订单',
      order: {
        id: 'test_1',
        userId: 'user_1',
        productId: 1,
        productName: '北大荒',
        direction: 'long',
        amount: 1000,
        profitRate: 0.95,
        openPrice: 100.00,
        durationSec: 60,
        status: 'open',
      },
      forced: 'win', // 强制赢
      entrustRule: null,
    },
    {
      name: '普通亏损订单',
      order: {
        id: 'test_2',
        userId: 'user_2',
        productId: 1,
        productName: '北大荒',
        direction: 'long',
        amount: 2000,
        profitRate: 0.88,
        openPrice: 200.00,
        durationSec: 300,
        status: 'open',
      },
      forced: 'lose', // 强制输
      entrustRule: null,
    },
    {
      name: '委买盈利订单(80%收益率)',
      order: {
        id: 'test_3',
        userId: 'user_3',
        productId: 1,
        productName: '北大荒',
        direction: 'short',
        amount: 5000,
        profitRate: 0.95,
        openPrice: 500.00,
        durationSec: 600,
        status: 'open',
        orderKind: 'entrust',
      },
      forced: null,
      entrustRule: { mode: 'win', winRatePct: 80 },
    },
    {
      name: '委买亏损订单(只亏50%)',
      order: {
        id: 'test_4',
        userId: 'user_4',
        productId: 1,
        productName: '北大荒',
        direction: 'short',
        amount: 10000,
        profitRate: 0.95,
        openPrice: 1000.00,
        durationSec: 60,
        status: 'open',
        orderKind: 'entrust',
      },
      forced: null,
      entrustRule: { mode: 'lose', loseRatePct: 50 }, // 只亏50%
    },
  ];

  let totalPassed = 0;
  let totalFailed = 0;

  for (const testCase of testCases) {
    console.log(`\n--- ${testCase.name} ---`);

    // 创建用户
    const user = { id: testCase.order.userId, nickname: `用户${testCase.order.userId}` };
    mockSupportData.users.set(user.id, user);

    // 初始化账户余额
    const acc = mockSupportData.ensureAccount(user);
    acc.available = 20000;
    acc.totalAsset = 20000;

    // 模拟下单扣款
    const orderAmount = testCase.order.amount;
    acc.available -= orderAmount;
    acc.totalAsset -= orderAmount;

    console.log(`  下单前余额: ${acc.available + orderAmount}`);
    console.log(`  下单金额: ${orderAmount}`);
    console.log(`  下单后余额: ${acc.available}`);

    // 执行结算
    const result = settleOrder(
      { ...testCase.order },
      user,
      { id: 1, name: '北大荒' },
      testCase.forced,
      testCase.entrustRule
    );

    // 验证结果
    const verifyResult = verifySettlement(result, testCase);

    console.log(`  结算结果: ${result.win ? '盈利' : '亏损'}`);
    console.log(`  开仓价格: ${result.order.openPrice}`);
    console.log(`  结算价格: ${result.order.closePrice}`);
    console.log(`  返还金额: ${result.settleBack}`);
    console.log(`  盈亏金额: ${result.gain > 0 ? '+' : ''}${result.gain}`);
    console.log(`  结算后余额: ${result.afterAvail}`);

    if (verifyResult.passed) {
      console.log(`  ✅ 测试通过`);
      totalPassed++;
    } else {
      console.log(`  ❌ 测试失败:`);
      verifyResult.errors.forEach(e => console.log(`     - ${e}`));
      totalFailed++;
    }
  }

  console.log(`\n=== 测试结果汇总 ===`);
  console.log(`  通过: ${totalPassed}`);
  console.log(`  失败: ${totalFailed}`);
  console.log(`  总计: ${totalPassed + totalFailed}`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

// 运行测试
runTests();
