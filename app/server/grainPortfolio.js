/**
 * 30 个中国粮食 / 农产产业链相关标的（沪深 A 股为主，少量港股中资农食企业），用于演示行情。
 * marketSymbol 为 TradingView 常见写法（SSE:/SZSE:/HKEX:）；实际展示价由 liveQuotes 每秒推进。
 * 格式：[productCode, 中文名, 类型副标题, TradingView 代码, 参考价(人民币或港币), 市场]
 */
const RAW = [
  ['cn001', '北大荒', '商品粮基地 · 种植业', 'SSE:600598', 13.2, 'CN'],
  ['cn002', '隆平高科', '杂交水稻种业', 'SZSE:000998', 15.8, 'CN'],
  ['cn003', '大北农', '饲料与生猪养殖', 'SZSE:002385', 4.35, 'CN'],
  ['cn004', '登海种业', '玉米种业', 'SZSE:002041', 9.2, 'CN'],
  ['cn005', '苏垦农发', '农垦 · 粮食种植', 'SSE:601952', 9.65, 'CN'],
  ['cn006', '荃银高科', '水稻与种业', 'SZSE:300087', 12.4, 'CN'],
  ['cn007', '农发种业', '种业综合服务', 'SSE:600313', 6.8, 'CN'],
  ['cn008', '亚盛集团', '农业综合 · 土地资源', 'SSE:600108', 2.95, 'CN'],
  ['cn009', '万向德农', '玉米种业', 'SSE:600371', 9.1, 'CN'],
  ['cn010', '丰乐种业', '种子与农化', 'SZSE:000713', 6.5, 'CN'],
  ['cn011', '神农科技', '种业与农业服务', 'SZSE:300189', 4.1, 'CN'],
  ['cn012', '金健米业', '大米与粮油', 'SSE:600127', 6.7, 'CN'],
  ['cn013', '京粮控股', '粮油仓储物流', 'SZSE:000505', 6.2, 'CN'],
  ['cn014', '深粮控股', '粮食储备与贸易', 'SZSE:000019', 6.9, 'CN'],
  ['cn015', '东方集团', '粮油加工与流通', 'SSE:600811', 2.45, 'CN'],
  ['cn016', '中粮科技', '玉米深加工 · 中粮系', 'SZSE:000930', 8.3, 'CN'],
  ['cn017', '梅花生物', '氨基酸 · 农产品深加工', 'SSE:600873', 10.5, 'CN'],
  ['cn018', '道道全', '菜籽油', 'SZSE:002852', 8.9, 'CN'],
  ['cn019', '西王食品', '食用油与健康食品', 'SZSE:000639', 3.2, 'CN'],
  ['cn020', '新赛股份', '棉花 · 农业综合', 'SSE:600540', 4.8, 'CN'],
  ['cn021', '新农开发', '新疆农业种植', 'SSE:600359', 7.1, 'CN'],
  ['cn022', '辉隆股份', '农资流通', 'SZSE:002556', 5.4, 'CN'],
  ['cn023', '冠农股份', '番茄制糖 · 新疆农产', 'SSE:600251', 7.8, 'CN'],
  ['cn024', '大禹节水', '节水灌溉 · 智慧农业', 'SZSE:300021', 4.6, 'CN'],
  ['cn025', '金龙鱼', '粮油加工龙头', 'SZSE:300999', 31.5, 'CN'],
  ['cn026', '新希望', '饲料与畜禽养殖', 'SZSE:000876', 9.2, 'CN'],
  ['cn027', '海大集团', '水产畜禽饲料', 'SZSE:002311', 45.0, 'CN'],
  ['cn028', '唐人神', '生猪 · 饲料', 'SZSE:002567', 5.8, 'CN'],
  ['cn029', '中粮家佳康', '肉类 · 中粮系（港股）', 'HKEX:1610', 2.15, 'HK'],
  ['cn030', '蒙牛乳业', '乳制品（港股）', 'HKEX:2319', 25.6, 'HK'],
];

const imgs = [
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&q=80',
  'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400&q=80',
  'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=400&q=80',
  'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&q=80',
  'https://images.unsplash.com/photo-1500937386664-56d1df385ed9?w=400&q=80',
];

const GRAIN_META = {};
for (let i = 0; i < RAW.length; i++) {
  const [code, name, line, sym, base] = RAW[i];
  const id = i + 1;
  const bp = Number(base);
  const hi = +(bp * 1.015).toFixed(4);
  const lo = +(bp * 0.985).toFixed(4);
  GRAIN_META[id] = {
    tradeName: name,
    marketSymbol: sym.replace(/\s+/g, ''),
    basePrice: bp,
    high24: hi,
    low24: lo,
    volume24: 800000 + id * 137000,
    turnoverPct: ((id % 7) - 3) * 0.03,
  };
}

function buildDefaultGrainProducts() {
  return RAW.map((row, i) => {
    const id = i + 1;
    const [code, name, line] = row;
    return {
      id,
      productCode: code,
      name,
      tag: '中国农业',
      yieldLabel: '买涨 / 买跌',
      periodDays: 0,
      minAmount: 500,
      riskLevel: 'R3',
      summary: line,
      sortOrder: i,
      categoryId: 'cat_grain',
      status: 'listed',
      imageUrl: imgs[i % imgs.length],
      displayVolatility: 1,
      displayParamA: 0,
      sourceRegion: row[5] != null ? row[5] : 'CN',
      chartSourceType: 'tradingview',
      chartWebsiteUrl: '',
      chartVendor: 'tradingview',
      chartBindMode: 'manual',
    };
  });
}

function mergeGrainMetaWithOverrides(productMeta, productId) {
  const base = GRAIN_META[productId] || null;
  if (!base) return null;
  const ov = (productMeta && productMeta[String(productId)]) || {};
  return { ...base, ...ov };
}

module.exports = {
  GRAIN_META,
  RAW,
  buildDefaultGrainProducts,
  mergeGrainMetaWithOverrides,
};
