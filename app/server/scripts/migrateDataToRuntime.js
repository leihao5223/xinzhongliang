/**
 * 手动将 app/server/data 与 app/server/uploads/support 复制到 runtime/（与 paths.js 自动迁移一致）。
 * 一般无需执行：启动服务时若 runtime 为空会自动复制。
 *
 *   cd app/server && node scripts/migrateDataToRuntime.js
 */
const fs = require('fs');
const path = require('path');
const paths = require('../paths');

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.log('[migrate] 跳过（不存在）:', src);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
  console.log('[migrate] 已复制', src, '→', dest);
}

paths.ensureRuntimeDirs();
const runtimeHasData =
  fs.existsSync(path.join(paths.dataDir, 'supportData.json')) ||
  fs.existsSync(path.join(paths.dataDir, 'tradeOrders.json')) ||
  fs.existsSync(path.join(paths.dataDir, 'store.json'));
if (runtimeHasData) {
  console.log('[migrate] runtime/data 已有业务文件，不覆盖。目标目录:', paths.dataDir);
  process.exit(0);
}
copyDirSync(paths.legacyDataDir, paths.dataDir);
copyDirSync(paths.legacyUploadsSupportDir, paths.uploadsSupportDir);
console.log('[migrate] 完成。请启动一次服务验证后，再考虑清空 app/server/data 与 app/server/uploads。');
