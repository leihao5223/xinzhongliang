const https = require('https');

const TV_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ZhongliangPlatform/1.0)',
  Origin: 'https://www.tradingview.com',
  Referer: 'https://www.tradingview.com/',
  Accept: 'application/json',
};

/** 中文 / 常用名 → 英文检索词（TradingView 对中文检索常为空） */
const NAME_TO_QUERY = {
  小麦: 'wheat',
  玉米: 'corn',
  大豆: 'soybean',
  豆粕: 'soybean',
  强麦: 'wheat',
  黄金: 'gold',
  白银: 'silver',
  原油: 'crude oil',
  铜: 'copper',
};

function stripHtml(s) {
  return String(s || '')
    .replace(/<\/?em>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function pickSearchQuery(companyName) {
  const raw = String(companyName || '').trim();
  if (!raw) return '';
  if (NAME_TO_QUERY[raw]) return NAME_TO_QUERY[raw];
  for (const [zh, en] of Object.entries(NAME_TO_QUERY)) {
    if (raw.includes(zh)) return en;
  }
  return raw;
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: TV_HEADERS }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        buf += c;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`TradingView 检索 HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(buf));
        } catch (e) {
          reject(new Error('TradingView 返回非 JSON，可能被拦截'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('TradingView 检索超时'));
    });
  });
}

function scoreItem(s) {
  const ex = `${s.exchange || ''} ${s.prefix || ''} ${s.source_id || ''}`.toUpperCase();
  let sc = 0;
  if (/AMEX|NYSE|NASDAQ|ARCA|CBOT|CME|COMEX|NYMEX|ICE/i.test(ex)) sc += 12;
  if (s.type === 'fund' || (s.typespecs || []).includes('etf')) sc += 8;
  if (s.type === 'futures' || s.type === 'commodity') sc += 6;
  if (s.type === 'stock') sc += 2;
  return sc;
}

function itemToTicker(s) {
  const sym = stripHtml(s.symbol).replace(/\s+/g, '');
  if (!sym) return null;
  const prefix = (s.prefix || s.source_id || '').trim();
  if (prefix) return `${prefix}:${sym}`.replace(/\s+/g, '');
  if (s.exchange && /^[A-Z0-9.]+$/i.test(String(s.exchange))) {
    return `${String(s.exchange).toUpperCase()}:${sym}`;
  }
  return sym;
}

/**
 * 根据展示名称在 TradingView 公共检索中取最优 ticker（如 AMEX:CORN）。
 * @param {string} companyName
 * @returns {Promise<string|null>}
 */
async function resolveTradingViewSymbol(companyName) {
  const q = pickSearchQuery(companyName);
  if (!q) return null;
  const url = `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(q)}&hl=1&lang=en&search_type=undefined&domain=production&sort_by_country=US`;
  let data;
  try {
    data = await httpsGetJson(url);
  } catch {
    return null;
  }
  const list = Array.isArray(data) ? data : data.symbols || data.results || [];
  if (!list.length) return null;
  const ranked = [...list].sort((a, b) => scoreItem(b) - scoreItem(a));
  for (const s of ranked) {
    const t = itemToTicker(s);
    if (t) return t.replace(/：/g, ':');
  }
  return null;
}

module.exports = {
  resolveTradingViewSymbol,
  pickSearchQuery,
};
