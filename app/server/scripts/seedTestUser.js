/**
 * 生成本地测试账号（可用+总资产均为指定金额）
 * 用法：node scripts/seedTestUser.js [余额，默认 10000]
 */
const http = require('http');
const sd = require('../supportData');

const balance = Math.max(0, Number(process.argv[2]) || 10000);
const nickname = `test_${String(Date.now()).slice(-8)}`;
const password = 'Test123456';
const tradePassword = '123456';

const user = sd.adminCreateUser({
  nickname,
  password,
  tradePassword,
  phone: '',
  realName: '测试',
  userKind: 'real',
});

sd.updateUserAccount(user.id, {
  available: balance,
  totalAsset: balance,
  accountPnl: 0,
  todayPnl: 0,
});

sd.appendLedger(user.id, {
  type: 'deposit_credit',
  title: `测试入账 · ¥${balance.toFixed(2)}`,
  deltaAvailable: balance,
  deltaTotal: balance,
  deltaFrozen: 0,
  refType: 'seed_test',
  refId: user.id,
  meta: { source: 'scripts/seedTestUser.js' },
});

function tryHotReloadServer() {
  const port = Number(process.env.PORT) || 3001;
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/__debug/reload-support-data',
        method: 'POST',
        timeout: 2500,
      },
      (r) => {
        r.resume();
        resolve(r.statusCode === 200);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

(async () => {
  const reloaded = await tryHotReloadServer();
  console.log(JSON.stringify(
    {
      message: reloaded
        ? '已写入 runtime/data/supportData.json，并已通知本机服务重新加载用户数据，可直接登录。'
        : '已写入 runtime/data/supportData.json。若本机 node 服务已在运行，请重启一次后再登录；或保持服务开启时重新执行本脚本以触发热加载。',
      loginName: nickname,
      password,
      tradePassword,
      userId: user.id,
      available: balance,
      totalAsset: balance,
    },
    null,
    2,
  ));
})();
