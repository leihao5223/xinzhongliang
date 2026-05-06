/**
 * 关闭「全局结算控盘」（全赢/全输），写入 data/store.json。
 * 若后台误开了「全输控盘」，会出现一买就亏、结算 note 带「控盘:lose」。
 *
 * 在服务器 app/server 目录执行：
 *   node scripts/clearSettlementControl.js           # 干跑，只打印当前 settlementOverride
 *   node scripts/clearSettlementControl.js --write # 写回 store.json
 *
 * 执行前请备份：cp data/store.json data/store.json.bak
 */
const fs = require('fs');
const path = require('path');
const { dataDir } = require('../paths');
const storePath = path.join(dataDir, 'store.json');
const write = process.argv.includes('--write');

function main() {
  if (!fs.existsSync(storePath)) {
    throw new Error(`找不到 ${storePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const cur = raw.settlementOverride || {};
  console.log('[clearSettlementControl] 当前 settlementOverride:', JSON.stringify(cur));
  const pr = Array.isArray(raw.productSettlementRules) ? raw.productSettlementRules : [];
  if (pr.length) {
    console.log(
      `[clearSettlementControl] 另有 productSettlementRules ${pr.length} 条（按产品控盘，本脚本不自动删；需后台「产品结算控盘」里关或改 store.json）`,
    );
  }

  if (!write) {
    console.log('\n干跑结束。确认后加 --write 写回（务必先备份 store.json）');
    return;
  }

  raw.settlementOverride = { active: false, mode: null, untilMs: 0 };
  fs.writeFileSync(storePath, JSON.stringify(raw, null, 2), 'utf8');
  console.log('[clearSettlementControl] 已关闭全局控盘并写回 store.json');
}

main();
