const https = require('https');
const iconv = require('iconv-lite');

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Referer: 'https://finance.sina.com.cn/',
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }
      )
      .on('error', reject);
  });
}

function toDisplayCode(sinaLower) {
  const s = String(sinaLower || '').trim().toLowerCase();
  if (!/^(sh|sz|bj)\d{5,6}$/.test(s)) return '';
  const num = s.slice(2);
  if (s.startsWith('sh')) return `${num}.SH`;
  if (s.startsWith('sz')) return `${num}.SZ`;
  if (s.startsWith('bj')) return `${num}.BJ`;
  return '';
}

function toTradingViewSymbol(sinaLower) {
  const s = String(sinaLower || '').trim().toLowerCase();
  if (!/^(sh|sz|bj)\d{5,6}$/.test(s)) return '';
  const num = s.slice(2);
  if (s.startsWith('sh')) return `SSE:${num}`;
  if (s.startsWith('sz')) return `SZSE:${num}`;
  if (s.startsWith('bj')) return `BSE:${num}`;
  return '';
}

/**
 * 新浪「个股」PC 页 realstock/company/{代码}/nc.shtml 仅对部分证券返回 200；
 * 上交所/深交所上市 ETF（如 sz159xxx、sh51xxxx）用该路径常为 404，应走基金页或前端 TradingView。
 */
function isSinaRealstockNcLikely404(symLower, type) {
  const s = String(symLower || '').trim().toLowerCase();
  const t = String(type || '').trim();
  if (t === '203') return true;
  if (/^sz159\d{3}$/.test(s)) return true;
  if (/^sh51\d{4}$/.test(s) || /^sh56\d{4}$/.test(s) || /^sh58\d{4}$/.test(s)) return true;
  if (/^sz15\d{4}$/.test(s) || /^sz16\d{4}$/.test(s)) return true;
  return false;
}

/**
 * 调用新浪公开联想接口（suggest3.sinajs.cn），解析 A 股等代码。
 * 说明：接口为新浪前端常用能力，返回 GBK；与「整站 iframe 裁剪」不同，此处仅取结构化结果列表。
 */
async function searchSinaSuggest(keyword) {
  const raw = String(keyword || '').trim().slice(0, 48);
  if (!raw) return [];
  const url = `https://suggest3.sinajs.cn/suggest/type=&key=${encodeURIComponent(raw)}&name=suggestdata`;
  const buf = await fetchBuffer(url);
  const text = iconv.decode(buf, 'gb18030');
  const m = text.match(/var\s+suggestdata\s*=\s*"([\s\S]*?)"\s*;/);
  if (!m || !String(m[1]).trim()) return [];

  const inner = m[1];
  const seen = new Set();
  const out = [];

  for (const seg of inner.split(';')) {
    if (!seg.trim()) continue;
    const p = seg.split(',');
    if (p.length < 4) continue;
    const name = String(p[0] || '').trim();
    const type = String(p[1] || '').trim();
    const numeric = String(p[2] || '').trim();
    const sym = String(p[3] || '').trim().toLowerCase();
    if (!name || !sym) continue;
    if (!/^(sh|sz|bj)\d{5,6}$/.test(sym)) continue;
    if (seen.has(sym)) continue;
    seen.add(sym);

    const etfLike = isSinaRealstockNcLikely404(sym, type);
    const detailUrl = etfLike
      ? ''
      : `https://finance.sina.com.cn/realstock/company/${sym}/nc.shtml`;
    out.push({
      name,
      type,
      numericCode: numeric,
      sinaSymbol: sym,
      productCodeSuggestion: toDisplayCode(sym),
      /** 新浪 PC 个股页；ETF 等品种该路径常为 404，留空由前端只用 TradingView */
      chartPageUrl: detailUrl,
      /** 上市 ETF 等：true 表示不要用新浪个股 iframe */
      sinaRealstockEmbedUnsupported: etfLike,
      /** 若嵌入不可用，可用 TradingView 同标的公开行情 */
      tradingViewSymbol: toTradingViewSymbol(sym),
    });
    if (out.length >= 50) break;
  }
  return out;
}

module.exports = {
  searchSinaSuggest,
  toDisplayCode,
  toTradingViewSymbol,
  isSinaRealstockNcLikely404,
};
