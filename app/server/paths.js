/**
 * 客户数据与上传文件统一放在仓库根 runtime/，与 app/server 代码分离，便于与新前端 app/web 并列备份与部署。
 * 覆盖路径：环境变量 ZHONGLIANG_RUNTIME=绝对路径（可选）。
 */
const fs = require('fs');
const path = require('path');

function getRepoRoot() {
  return path.join(__dirname, '..', '..');
}

function getRuntimeRoot() {
  const e = process.env.ZHONGLIANG_RUNTIME && String(process.env.ZHONGLIANG_RUNTIME).trim();
  if (e) return path.resolve(e);
  return path.join(getRepoRoot(), 'runtime');
}

const RUNTIME_ROOT = getRuntimeRoot();
const DATA_DIR = path.join(RUNTIME_ROOT, 'data');
const UPLOADS_SUPPORT_DIR = path.join(RUNTIME_ROOT, 'uploads', 'support');
const LEGACY_DATA_DIR = path.join(__dirname, 'data');
const LEGACY_UPLOADS_SUPPORT = path.join(__dirname, 'uploads', 'support');

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * 若 runtime/data 尚无业务 JSON，且旧版 app/server/data 下已有文件，则整目录复制一次（避免升级后变空库）。
 */
function migrateLegacyIfNeeded() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_SUPPORT_DIR, { recursive: true });
  const runtimeHasData =
    fs.existsSync(path.join(DATA_DIR, 'supportData.json')) ||
    fs.existsSync(path.join(DATA_DIR, 'tradeOrders.json')) ||
    fs.existsSync(path.join(DATA_DIR, 'store.json'));
  if (runtimeHasData) return;
  if (!fs.existsSync(LEGACY_DATA_DIR)) return;
  let legacyFiles = [];
  try {
    legacyFiles = fs.readdirSync(LEGACY_DATA_DIR);
  } catch {
    return;
  }
  if (!legacyFiles.length) return;
  console.warn(
    '[zhongliang] 检测到 app/server/data 有历史文件且 runtime/data 无业务库，正在复制到 runtime/data（一次性）…',
  );
  copyDirSync(LEGACY_DATA_DIR, DATA_DIR);
  if (fs.existsSync(LEGACY_UPLOADS_SUPPORT)) {
    let n = 0;
    try {
      n = fs.readdirSync(LEGACY_UPLOADS_SUPPORT).length;
    } catch {
      n = 0;
    }
    if (n > 0) {
      console.warn('[zhongliang] 正在复制 app/server/uploads/support → runtime/uploads/support …');
      copyDirSync(LEGACY_UPLOADS_SUPPORT, UPLOADS_SUPPORT_DIR);
    }
  }
}

migrateLegacyIfNeeded();

function ensureRuntimeDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_SUPPORT_DIR, { recursive: true });
}

module.exports = {
  repoRoot: getRepoRoot(),
  runtimeRoot: RUNTIME_ROOT,
  dataDir: DATA_DIR,
  uploadsSupportDir: UPLOADS_SUPPORT_DIR,
  legacyDataDir: LEGACY_DATA_DIR,
  legacyUploadsSupportDir: LEGACY_UPLOADS_SUPPORT,
  ensureRuntimeDirs,
};
