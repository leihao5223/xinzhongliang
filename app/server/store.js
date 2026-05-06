const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { resolveTradingViewSymbol } = require('./chartResolve');
const { buildDefaultGrainProducts, mergeGrainMetaWithOverrides } = require('./grainPortfolio');
const paths = require('./paths');

const dataDir = paths.dataDir;
const storePath = path.join(dataDir, 'store.json');

/** 每秒行情引擎：(id) => { price, changePct } | null */
let liveEngineFn = null;

const STORE_VERSION = 10;
const NOTICE_FEED_TARGET = 200;

const defaultCompanyInfo = {
  siteName: '中粮天下',
  logoUrl: '',
  slogan: '财富陪伴 · 安心之选',
  footerText: '投资有风险，入市需谨慎；产品信息以官方披露与合同约定为准。',
  aboutHtml: '<p>中粮优品致力于为用户提供透明、稳健的资产配置与财富陪伴服务。</p>',
  /** 完整 URL 或本站路径，如 https://xxx/app.apk 或 /downloads/app.apk；首页 Banner 中央图标点击后下载 */
  appDownloadUrl: '',
  /** 最新 APP 版本号（如 4.0.19.1），用于个人主页版本校验提示 */
  appLatestVersion: '',
};

const defaultProductCategories = [
  { id: 'cat_grain', name: '粮食农产', sortOrder: 0 },
  { id: 'cat_metal', name: '贵金属', sortOrder: 1 },
  { id: 'cat_mixed', name: '综合', sortOrder: 2 },
];

const defaultSettlementOverride = {
  active: false,
  mode: null,
  untilMs: 0,
};

const defaultTradeConfig = {
  balance: 0,
  /** 全站仅 600 秒锁仓；收益率可由后台「默认档」或各产品单独覆盖 */
  durationOptions: [{ durationSec: 600, profitRate: 0.95 }],
  amountPresets: [1000, 2000, 5000, 10000, 20000, 50000],
};

const defaultSimSettings = {
  /** 行情模拟：随机游走强度系数 */
  priceVolatility: 0.65,
  /** 行情模拟：价格漂移偏移（略大于 0 偏多头上行） */
  priceDriftBias: 0.02,
  /** 行情模拟：多空倾向（略大于 0 偏多） */
  longShortBias: 0,
  note: '用于前端行情动画参数，不代表真实撮合结果。',
};

const defaultMediaSchedules = [
  {
    id: 'media_login_default',
    pageKey: 'login',
    slotKey: 'login-bg',
    title: '登录动态背景',
    videoUrl: '/assets/videos/intro.mp4',
    posterUrl: '/assets/images/zhongliang-wheat-field.jpg',
    startsAt: '',
    endsAt: '',
    priority: 10,
    enabled: true,
  },
  {
    id: 'media_home_default',
    pageKey: 'home',
    slotKey: 'hero-bg',
    title: '首页顶部背景',
    videoUrl: '/assets/videos/intro.mp4',
    posterUrl: '/assets/images/zhongliang-wheat-field.jpg',
    startsAt: '',
    endsAt: '',
    priority: 10,
    enabled: true,
  },
  {
    id: 'media_advert_default',
    pageKey: 'advert',
    slotKey: 'brand-ad',
    title: '品牌广告',
    videoUrl: '/assets/videos/intro.mp4',
    posterUrl: '/assets/images/zhongliang-wheat-field.jpg',
    startsAt: '',
    endsAt: '',
    priority: 10,
    enabled: true,
  },
];

const defaultSiteSections = {
  homeHero: {
    eyebrow: 'COFCO DIGITAL AGRI PLATFORM',
    title: '忠于国计 良于民生',
    outline: '数字中粮',
    lead: '中粮天下以农粮产业链为根基，融合数字交易、资产服务、客户运营与智能风控，构建面向用户与产业伙伴的一体化服务平台。',
    primaryCta: '进入交易中心',
    secondaryCta: '播放品牌广告',
  },
  about: {
    eyebrow: '产业根基',
    title: '从田间到餐桌，连接粮源、加工、仓储、物流与消费场景',
    desc: '平台围绕粮油食品主业与数字化服务能力，展示产业协同、交易服务、客户支持与内容运营，让品牌表达、业务交易和服务保障形成统一闭环。',
  },
  business: {
    eyebrow: '平台能力',
    title: '交易、资产、订单、服务一体化连接',
    desc: '平台围绕产品行情、交易下单、订单记录、个人资产、资金明细和在线客服形成完整闭环，让用户在一个入口完成关键操作。',
  },
  contact: {
    title: '登录中粮天下，进入数字农粮服务平台',
    desc: '立即登录或注册账号，查看产品行情、交易中心、个人资产、订单记录与客户服务。',
  },
};

function buildCompanyContentSeed() {
  const base = new Date('2018-01-15T10:00:00+08:00').getTime();
  const now = Date.now();
  const span = Math.max(1, now - base);
  const realtime = Array.from({ length: 100 }).map((_, i) => {
    const ts = base + Math.floor((span / 100) * i);
    return {
      id: `company_rt_${String(i + 1).padStart(3, '0')}`,
      title: `实时资讯第${i + 1}期`,
      publishedAt: new Date(ts).toISOString(),
      body: '此处为占位正文，支持后台编辑后发布。',
    };
  });
  const future = Array.from({ length: 10 }).map((_, i) => ({
    id: `company_fw_${String(i + 1).padStart(2, '0')}`,
    title: `展望未来专题 ${i + 1}`,
    publishedAt: new Date(now - (i + 1) * 86400000 * 27).toISOString(),
    body: '围绕产业链协同、交易风控和服务体验持续升级，形成可执行的年度路线图。',
  }));
  const notices = [
    { id: 'notice_001', category: 'system', title: '系统维护公告', publishedAt: new Date(now - 86400000 * 3).toISOString(), body: '夜间维护窗口已完成。' },
    { id: 'notice_002', category: 'activity', title: '活动通知', publishedAt: new Date(now - 86400000 * 9).toISOString(), body: '节假日福利活动开放领取。' },
    { id: 'notice_003', category: 'holiday', title: '节假日安排', publishedAt: new Date(now - 86400000 * 16).toISOString(), body: '审核时段调整公告。' },
  ];
  return { realtime, future, notices };
}

function createSeededRng(seed = 20260414) {
  let x = seed >>> 0;
  return function next() {
    x += 0x6d2b79f5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng(arr, rand) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildDefaultNoticeFeed(targetCount = NOTICE_FEED_TARGET) {
  const rnd = createSeededRng();
  const rows = [];
  let seq = 1;
  const now = Date.now();
  const mkId = () => `nt_${String(seq++).padStart(4, '0')}`;

  const activityTopic = ['春耕助农', '金穗计划', '丰收季回馈', '稳健之选', '客户回访周', '夏季礼包', '秋收礼遇'];
  const maintenanceTopic = ['订单撮合', '结算引擎', '行情推送', '风控校验', '充值链路', '提现审核', '客服系统'];
  const productTopic = ['北大荒主题', '粮油组合', '农机产业链', '仓储物流', '玉米深加工', '种业精选', '生猪饲料'];
  const cityList = ['上海', '北京', '深圳', '杭州', '苏州', '武汉', '成都', '重庆', '青岛', '厦门'];

  const total = Math.max(55, Math.floor(Number(targetCount) || NOTICE_FEED_TARGET));
  const activityCount = Math.max(10, Math.round(total * 0.2));
  const maintenanceCount = Math.max(20, Math.round(total * 0.36));
  const productCount = Math.max(15, Math.round(total * 0.27));
  const topProfitCount = Math.max(10, total - activityCount - maintenanceCount - productCount);

  for (let i = 0; i < activityCount; i += 1) {
    const topic = activityTopic[Math.floor(rnd() * activityTopic.length)];
    const amount = 500 + Math.floor(rnd() * 20) * 50;
    rows.push({
      id: mkId(),
      type: 'activity',
      title: `${topic}活动第${i + 1}期上线`,
      summary: `完成实名认证与交易安全设置即可参与，最高可得 ${amount} 元体验金，活动名额每日更新。`,
      source: '运营中心',
    });
  }

  for (let i = 0; i < maintenanceCount; i += 1) {
    const topic = maintenanceTopic[Math.floor(rnd() * maintenanceTopic.length)];
    const min = 5 + Math.floor(rnd() * 25);
    rows.push({
      id: mkId(),
      type: 'maintenance',
      title: `${topic}维护与修复公告 #${i + 1}`,
      summary: `已完成稳定性优化与兼容修复，短时窗口约 ${min} 分钟，期间个别功能可能出现延迟，已逐步恢复。`,
      source: '技术运维部',
    });
  }

  for (let i = 0; i < productCount; i += 1) {
    const topic = productTopic[Math.floor(rnd() * productTopic.length)];
    const rate = (0.9 + rnd() * 0.25).toFixed(2);
    rows.push({
      id: mkId(),
      type: 'product',
      title: `${topic}产品预告（第${i + 1}批）`,
      summary: `预告期内可提前关注标的信息与风控提示，预计默认收益率区间 ${rate}，以实际上线配置为准。`,
      source: '产品委员会',
    });
  }

  for (let i = 0; i < topProfitCount; i += 1) {
    const city = cityList[Math.floor(rnd() * cityList.length)];
    const amountWan = (12 + rnd() * 88).toFixed(1);
    rows.push({
      id: mkId(),
      type: 'top-profit',
      title: `${city}客户收益榜更新（第${i + 1}期）`,
      summary: `本期盈利领先客户为“${city}·${Math.floor(1000 + rnd() * 9000)}号”，阶段累计收益约 ${amountWan} 万元。`,
      source: '结算统计组',
    });
  }

  const mixed = shuffleWithRng(rows, rnd);
  const count = mixed.length;
  const start = new Date('2017-01-01T08:00:00+08:00').getTime();
  const span = Math.max(1, now - start);
  const step = span / count;
  for (let i = 0; i < mixed.length; i += 1) {
    const base = start + i * step;
    const jitter = Math.floor((rnd() - 0.5) * step * 0.6);
    const ts = Math.max(start, Math.min(now, base + jitter));
    mixed[i].publishedAt = new Date(ts).toISOString();
  }
  mixed.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return mixed;
}

const defaultStore = {
  storeVersion: STORE_VERSION,
  banners: [
    { id: 1, title: '粮安优选', subtitle: '稳健配置 · 透明运作', colorFrom: '#1e3a5f', colorTo: '#c9a962', sortOrder: 0 },
    { id: 2, title: '丰收计划', subtitle: '农业产业链主题', colorFrom: '#1e293b', colorTo: '#d4b87a', sortOrder: 1 },
    { id: 3, title: '金穗理财', subtitle: '中短期灵活', colorFrom: '#334155', colorTo: '#b8923a', sortOrder: 2 },
    { id: 4, title: '绿野千里', subtitle: '生态农业 · 稳产安心', colorFrom: '#1e3a5f', colorTo: '#94a3b8', sortOrder: 3 },
    { id: 5, title: '丰登季', subtitle: '产区直联 · 品质可溯', colorFrom: '#422006', colorTo: '#d4b87a', sortOrder: 4 },
    { id: 6, title: '田园优选', subtitle: '长期配置 · 灵活申赎', colorFrom: '#14532d', colorTo: '#c9a962', sortOrder: 5 },
  ],
  announcements: [
    '理性投资，量力而行；请关注官方渠道发布的产品信息与风险揭示。',
    '请通过官方渠道核实产品信息，谨防诈骗。',
    '客服服务时间：每日 9:00—21:00。',
  ],
  noticeFeed: buildDefaultNoticeFeed(NOTICE_FEED_TARGET),
  companyInfo: { ...defaultCompanyInfo },
  productCategories: JSON.parse(JSON.stringify(defaultProductCategories)),
  settlementOverride: { ...defaultSettlementOverride },
  /** 按产品 + 时间窗的输赢控盘（毫秒时间戳，与服务器解析 Date.now() 一致） */
  productSettlementRules: [],
  /** 委买控盘：按产品在时间窗内强制输/赢，并按百分比结算 */
  entrustControlRules: [],
  products: buildDefaultGrainProducts(),
  articles: [
    {
      id: 'a1',
      title: '风险提示与适当性说明',
      slug: 'risk-notice',
      excerpt: '参与交易前请充分了解风险。',
      body: '参与任何投资前，请充分了解产品性质、风险等级与自身风险承受能力。过往业绩不代表未来表现，不构成投资建议。',
      coverImage: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
      published: true,
      sortOrder: 0,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'a2',
      title: '平台服务与客服时间',
      slug: 'service-hours',
      excerpt: '每日 9:00—21:00 在线客服为您解答。',
      body: '您可通过首页客服入口发起会话，工作人员将协助您完成充值、提现及产品咨询等操作。',
      coverImage: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&q=80',
      published: true,
      sortOrder: 1,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'a3',
      title: '如何阅读行情与波动',
      slug: 'how-to-read-quotes',
      excerpt: '了解价格、波动与风险揭示，有助于做出更审慎的决策。',
      body: '产品详情页中的行情与走势仅供展示与说明用途。实际交易规则、费用与风险以产品合同及监管披露为准；若对条款有疑问，请联系在线客服或您的服务顾问。',
      coverImage: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&q=80',
      published: true,
      sortOrder: 2,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'a4',
      title: '农业主题资产配置思路',
      slug: 'agri-allocation',
      excerpt: '产业链视角下的分散与节奏。',
      body: '粮食、软商品与相关金融工具在不同周期中表现各异。本文仅供一般性知识介绍，不构成对任何具体品种或时点的买卖建议。',
      coverImage: 'https://images.unsplash.com/photo-1500937386664-56d1df385ed9?w=1200&q=80',
      published: true,
      sortOrder: 3,
      updatedAt: new Date().toISOString(),
    },
  ],
  productMeta: {},
  simSettings: { ...defaultSimSettings },
  tradeConfig: JSON.parse(JSON.stringify(defaultTradeConfig)),
  companyContent: buildCompanyContentSeed(),
  mediaSchedules: JSON.parse(JSON.stringify(defaultMediaSchedules)),
  siteSections: JSON.parse(JSON.stringify(defaultSiteSections)),
};

function fallbackMeta(p) {
  return {
    tradeName: p?.name || '品种',
    marketSymbol: 'OANDA:XAUUSD',
    basePrice: 2000,
    high24: 2020,
    low24: 1980,
    volume24: 1000000,
    turnoverPct: 0,
  };
}

function persist() {
  try {
    store.storeVersion = STORE_VERSION;
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('[store] persist failed', e);
  }
}

function enrichProduct(p) {
  if (!p) return null;
  const base = mergeGrainMetaWithOverrides(store.productMeta, p.id) || fallbackMeta(p);
  const ov = (store.productMeta && store.productMeta[String(p.id)]) || {};
  const m = { ...base, ...ov };
  const x = { ...m, ...p };
  x.basePrice = Number(x.basePrice);
  x.high24 = Number(x.high24);
  x.low24 = Number(x.low24);
  x.volume24 = Number(x.volume24);
  x.turnoverPct = Number(x.turnoverPct);
  x.tradeName = x.tradeName || x.name;
  x.marketSymbol = (x.marketSymbol || 'OANDA:XAUUSD').replace(/\s+/g, '').replace('：', ':');
  const live = liveEngineFn ? liveEngineFn(p.id) : null;
  if (live && Number.isFinite(live.price)) {
    x.basePrice = live.price;
    x.turnoverPct = Number(live.changePct);
    x.high24 = Math.max(Number(x.high24), live.price);
    x.low24 = Math.min(Number(x.low24), live.price);
  }
  const cats = store.productCategories || [];
  const cid = p.categoryId || x.categoryId;
  const cat = cats.find((c) => c.id === cid);
  x.categoryId = cid || '';
  x.categoryName = cat?.name || '';
  x.productCode = p.productCode || `p${p.id}`;
  x.status = p.status || 'listed';
  x.imageUrl = p.imageUrl || null;
  x.displayVolatility = p.displayVolatility != null ? Number(p.displayVolatility) : 1;
  x.displayParamA = p.displayParamA != null ? Number(p.displayParamA) : 0;
  x.sourceRegion = p.sourceRegion || 'CN';
  x.chartSourceType = p.chartSourceType === 'website' ? 'website' : 'tradingview';
  x.chartWebsiteUrl = String(p.chartWebsiteUrl || '').trim();
  x.chartVendor = p.chartVendor === 'tradingview' ? 'tradingview' : 'tradingview';
  x.chartBindMode = p.chartBindMode === 'manual' ? 'manual' : 'auto';
  const riseRate = activeDirectionalProfitRate(p.id, 'long');
  const fallRate = activeDirectionalProfitRate(p.id, 'short');
  if (Number.isFinite(riseRate)) x.activeRiseProfitRate = riseRate;
  if (Number.isFinite(fallRate)) x.activeFallProfitRate = fallRate;
  return x;
}

function patchProductRow(p) {
  if (!p || typeof p !== 'object') return;
  if (!p.productCode) p.productCode = `p${p.id}`;
  if (!p.categoryId) p.categoryId = 'cat_grain';
  if (!p.status) p.status = 'listed';
  if (p.imageUrl === undefined) p.imageUrl = '';
  if (p.displayVolatility === undefined) p.displayVolatility = 1;
  if (p.displayParamA === undefined) p.displayParamA = 0;
  if (!p.sourceRegion) p.sourceRegion = 'CN';
  if (!p.chartSourceType) p.chartSourceType = 'tradingview';
  if (p.chartWebsiteUrl === undefined) p.chartWebsiteUrl = '';
  if (p.chartSourceType !== 'website') p.chartWebsiteUrl = '';
  if (!p.chartVendor) p.chartVendor = 'tradingview';
  if (p.chartBindMode !== 'manual' && p.chartBindMode !== 'auto') p.chartBindMode = 'auto';
}

/** 网站嵌入：允许 TradingView 官方域 + 新浪财经行情域（https） */
function assertAllowedChartEmbedUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) throw new Error('网站行情须填写 https 嵌入地址');
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error('嵌入地址不是合法 URL');
  }
  if (u.protocol !== 'https:') throw new Error('嵌入地址须使用 https');
  const h = u.hostname.toLowerCase().replace(/^www\./, '');
  const okSina = h === 'sina.com.cn' || h.endsWith('.sina.com.cn') || h === 'sina.cn' || h.endsWith('.sina.cn');
  const okTv = h.endsWith('tradingview.com');
  if (!okTv && !okSina) {
    throw new Error('网站行情仅支持 TradingView 官方域名或新浪财经（*.sina.com.cn / *.sina.cn）的 https 地址');
  }
}

const CATALOG_ID_MAX = 30;

/**
 * 产品列表固定为 grainPortfolio 内置 30 条；丢弃其余 id，仅合并可保留的展示字段。
 */
/** 交易配置：时长固定 600 秒，仅保留一条收益率（与旧数据兼容时取原 600 档或首条） */
function normalizeTradeDurationOptions(input) {
  const arr = Array.isArray(input) ? input : [];
  const hit600 = arr.find((o) => o && Number(o.durationSec) === 600);
  const pr = Number(hit600?.profitRate);
  if (Number.isFinite(pr)) return [{ durationSec: 600, profitRate: pr }];
  const first = arr.find((o) => o && Number.isFinite(Number(o?.profitRate)));
  const pr2 = Number(first?.profitRate);
  if (Number.isFinite(pr2)) return [{ durationSec: 600, profitRate: pr2 }];
  return [{ durationSec: 600, profitRate: 0.95 }];
}

function normalizeProductCatalogRows(savedRows) {
  const canon = buildDefaultGrainProducts();
  const byId = new Map(
    (Array.isArray(savedRows) ? savedRows : [])
      .filter((p) => p && Number(p.id) >= 1 && Number(p.id) <= CATALOG_ID_MAX)
      .map((p) => [Number(p.id), p]),
  );
  return canon.map((row) => {
    const s = byId.get(row.id);
    if (!s) return { ...row };
    const out = { ...row };
    const img = s.imageUrl;
    if (img != null && String(img).trim() !== '') out.imageUrl = img;
    const minA = Number(s.minAmount);
    if (Number.isFinite(minA) && minA > 0) out.minAmount = minA;
    const so = Number(s.sortOrder);
    if (Number.isFinite(so)) out.sortOrder = so;
    if (Object.prototype.hasOwnProperty.call(s, 'quoteVolatility')) {
      const qv = s.quoteVolatility;
      if (qv === null || qv === '' || qv === undefined) {
        delete out.quoteVolatility;
      } else {
        const n = Number(qv);
        if (Number.isFinite(n) && n > 0 && n <= 5) out.quoteVolatility = n;
      }
    }
    if (Object.prototype.hasOwnProperty.call(s, 'tradeProfitRate')) {
      const tr = s.tradeProfitRate;
      if (tr === null || tr === '' || tr === undefined) {
        delete out.tradeProfitRate;
      } else {
        const n = Number(tr);
        if (Number.isFinite(n)) out.tradeProfitRate = n;
      }
    }
    return out;
  });
}

function pruneProductMetaToCatalog(meta) {
  if (!meta || typeof meta !== 'object') return;
  for (const k of Object.keys(meta)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1 || n > CATALOG_ID_MAX) delete meta[k];
  }
}

/** 内置 30 只的行情代码以 grainPortfolio 为准，不允许 productMeta 覆盖 */
function stripCatalogProductMetaEntries(meta) {
  if (!meta || typeof meta !== 'object') return;
  for (let i = 1; i <= CATALOG_ID_MAX; i += 1) {
    delete meta[String(i)];
  }
}

function migrateLoaded(data) {
  const d = data;
  if (!Array.isArray(d.banners)) d.banners = [...defaultStore.banners];
  if (!Array.isArray(d.announcements)) d.announcements = [...defaultStore.announcements];
  if (!Array.isArray(d.noticeFeed) || d.noticeFeed.length < NOTICE_FEED_TARGET) {
    d.noticeFeed = buildDefaultNoticeFeed(NOTICE_FEED_TARGET);
  }
  if (!Array.isArray(d.products)) d.products = [...defaultStore.products];
  else (d.products || []).forEach(patchProductRow);
  if (!Array.isArray(d.articles)) d.articles = JSON.parse(JSON.stringify(defaultStore.articles));
  else {
    for (const a of d.articles) {
      if (a.coverImage === undefined) a.coverImage = '';
    }
    const wantIds = ['a1', 'a2', 'a3', 'a4'];
    for (const row of defaultStore.articles) {
      if (!wantIds.includes(row.id)) continue;
      if (!d.articles.some((x) => x.id === row.id)) d.articles.push(JSON.parse(JSON.stringify(row)));
    }
  }
  if (!d.companyInfo || typeof d.companyInfo !== 'object') d.companyInfo = { ...defaultCompanyInfo };
  else d.companyInfo = { ...defaultCompanyInfo, ...d.companyInfo };
  if (!Array.isArray(d.productCategories) || !d.productCategories.length) {
    d.productCategories = JSON.parse(JSON.stringify(defaultProductCategories));
  }
  if (!d.settlementOverride || typeof d.settlementOverride !== 'object') {
    d.settlementOverride = { ...defaultSettlementOverride };
  }
  if (!Array.isArray(d.productSettlementRules)) d.productSettlementRules = [];
  if (!Array.isArray(d.entrustControlRules)) d.entrustControlRules = [];
  if (!d.productMeta || typeof d.productMeta !== 'object') d.productMeta = {};
  if (!d.simSettings || typeof d.simSettings !== 'object') d.simSettings = { ...defaultSimSettings };
  else d.simSettings = { ...defaultSimSettings, ...d.simSettings };
  if (!d.tradeConfig || typeof d.tradeConfig !== 'object') d.tradeConfig = JSON.parse(JSON.stringify(defaultTradeConfig));
  else {
    d.tradeConfig = {
      ...JSON.parse(JSON.stringify(defaultTradeConfig)),
      ...d.tradeConfig,
      durationOptions: normalizeTradeDurationOptions(d.tradeConfig.durationOptions),
      amountPresets: d.tradeConfig.amountPresets || defaultTradeConfig.amountPresets,
    };
  }
  if (!d.companyContent || typeof d.companyContent !== 'object') d.companyContent = buildCompanyContentSeed();
  else {
    const seed = buildCompanyContentSeed();
    d.companyContent = {
      realtime: Array.isArray(d.companyContent.realtime) ? d.companyContent.realtime : seed.realtime,
      future: Array.isArray(d.companyContent.future) ? d.companyContent.future : seed.future,
      notices: Array.isArray(d.companyContent.notices) ? d.companyContent.notices : seed.notices,
    };
  }
  if (!Array.isArray(d.mediaSchedules)) d.mediaSchedules = JSON.parse(JSON.stringify(defaultMediaSchedules));
  else d.mediaSchedules = normalizeMediaSchedules(d.mediaSchedules);
  if (!d.siteSections || typeof d.siteSections !== 'object' || Array.isArray(d.siteSections)) {
    d.siteSections = JSON.parse(JSON.stringify(defaultSiteSections));
  } else {
    d.siteSections = { ...JSON.parse(JSON.stringify(defaultSiteSections)), ...d.siteSections };
  }
  /** 固定目录：仅保留内置 30 个中国农产标的，其余产品一律移除 */
  d.products = normalizeProductCatalogRows(d.products);
  (d.products || []).forEach(patchProductRow);
  pruneProductMetaToCatalog(d.productMeta);
  stripCatalogProductMetaEntries(d.productMeta);
  d.storeVersion = STORE_VERSION;
  return d;
}

function load() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    const init = JSON.parse(JSON.stringify(defaultStore));
    fs.writeFileSync(storePath, JSON.stringify(init, null, 2), 'utf8');
    return init;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch {
    data = JSON.parse(JSON.stringify(defaultStore));
  }
  migrateLoaded(data);
  try {
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {
    /* 只读环境 */
  }
  return data;
}

let store = load();

function getBanners() {
  return [...store.banners].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

function getAnnouncements() {
  return [...store.announcements];
}

function getNoticeFeed({ type, limit = 200, offset = 0 } = {}) {
  let list = Array.isArray(store.noticeFeed) ? [...store.noticeFeed] : [];
  if (type) {
    const t = String(type);
    list = list.filter((x) => String(x.type) === t);
  }
  list.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
  return {
    total: list.length,
    list: list.slice(safeOffset, safeOffset + safeLimit),
    offset: safeOffset,
    limit: safeLimit,
  };
}

function getProducts() {
  return [...store.products]
    .filter((p) => (p.status || 'listed') === 'listed')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map(enrichProduct);
}

function getListedProductsRaw() {
  const list = Array.isArray(store.products) ? store.products : [];
  return [...list]
    .filter((p) => p && typeof p === 'object' && (p.status || 'listed') === 'listed')
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || Number(a.id) - Number(b.id));
}

function getStaticQuoteBaseForId(id) {
  return mergeGrainMetaWithOverrides(store.productMeta, Number(id)) || null;
}

function setLiveMarketEngine(fn) {
  liveEngineFn = typeof fn === 'function' ? fn : null;
}

function getProductById(id) {
  const n = Number(id);
  const p = store.products.find((x) => x.id === n);
  if (!p || (p.status || 'listed') !== 'listed') return null;
  return enrichProduct(p);
}

function getArticlesPublic() {
  return [...(store.articles || [])]
    .filter((a) => a.published)
    .sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0) || String(x.id).localeCompare(String(y.id)));
}

function getArticleBySlug(slug) {
  const s = String(slug || '');
  return (store.articles || []).find((a) => a.slug === s && a.published) || null;
}

function getSimSettings() {
  return { ...store.simSettings };
}

function getTradeConfig() {
  return JSON.parse(JSON.stringify(store.tradeConfig));
}

function getCmsSnapshot() {
  return {
    storeVersion: store.storeVersion,
    companyInfo: JSON.parse(JSON.stringify(store.companyInfo || defaultCompanyInfo)),
    productCategories: JSON.parse(JSON.stringify(store.productCategories || defaultProductCategories)),
    banners: JSON.parse(JSON.stringify(store.banners)),
    announcements: JSON.parse(JSON.stringify(store.announcements)),
    products: JSON.parse(JSON.stringify(store.products)),
    articles: JSON.parse(JSON.stringify(store.articles || [])),
    productMeta: JSON.parse(JSON.stringify(store.productMeta || {})),
    simSettings: JSON.parse(JSON.stringify(store.simSettings)),
    tradeConfig: JSON.parse(JSON.stringify(store.tradeConfig)),
    companyContent: JSON.parse(JSON.stringify(store.companyContent || buildCompanyContentSeed())),
    settlementOverride: JSON.parse(JSON.stringify(store.settlementOverride || defaultSettlementOverride)),
    productSettlementRules: JSON.parse(JSON.stringify(store.productSettlementRules || [])),
    mediaSchedules: JSON.parse(JSON.stringify(store.mediaSchedules || defaultMediaSchedules)),
    siteSections: JSON.parse(JSON.stringify(store.siteSections || defaultSiteSections)),
  };
}

function getSiteSections() {
  return JSON.parse(JSON.stringify({ ...defaultSiteSections, ...(store.siteSections || {}) }));
}

function normalizeMediaSchedule(row, index = 0) {
  if (!row || typeof row !== 'object') return null;
  const pageKey = String(row.pageKey || '').trim() || 'home';
  const slotKey = String(row.slotKey || '').trim() || 'hero-bg';
  const videoUrl = String(row.videoUrl || '').trim();
  const posterUrl = String(row.posterUrl || '').trim();
  if (!videoUrl && !posterUrl) return null;
  return {
    id: String(row.id || `media_${Date.now()}_${index}`),
    pageKey,
    slotKey,
    title: String(row.title || '').trim() || `${pageKey}/${slotKey}`,
    videoUrl,
    posterUrl,
    startsAt: String(row.startsAt || '').trim(),
    endsAt: String(row.endsAt || '').trim(),
    priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : 0,
    enabled: row.enabled !== false,
  };
}

function normalizeMediaSchedules(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => normalizeMediaSchedule(row, index))
    .filter(Boolean);
}

function mediaScheduleIsActive(row, nowMs = Date.now()) {
  if (!row || row.enabled === false) return false;
  const start = row.startsAt ? new Date(row.startsAt).getTime() : 0;
  const end = row.endsAt ? new Date(row.endsAt).getTime() : 0;
  if (Number.isFinite(start) && start > 0 && nowMs < start) return false;
  if (Number.isFinite(end) && end > 0 && nowMs > end) return false;
  return true;
}

function getMediaSchedules() {
  return JSON.parse(JSON.stringify(store.mediaSchedules || defaultMediaSchedules));
}

function getActiveMediaSchedule(pageKey, slotKey) {
  const page = String(pageKey || '').trim();
  const slot = String(slotKey || '').trim();
  const rows = normalizeMediaSchedules(store.mediaSchedules || defaultMediaSchedules)
    .filter((row) => (!page || row.pageKey === page) && (!slot || row.slotKey === slot))
    .filter((row) => mediaScheduleIsActive(row))
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  return rows[0] ? JSON.parse(JSON.stringify(rows[0])) : null;
}

function getCompanyContent() {
  return JSON.parse(JSON.stringify(store.companyContent || buildCompanyContentSeed()));
}

function getCompanyInfo() {
  const cur = store.companyInfo && typeof store.companyInfo === 'object' ? store.companyInfo : {};
  return { ...JSON.parse(JSON.stringify(defaultCompanyInfo)), ...JSON.parse(JSON.stringify(cur)) };
}

function refreshSettlementOverride() {
  const o = store.settlementOverride || defaultSettlementOverride;
  if (!o.active) return;
  if (Date.now() >= (o.untilMs || 0)) {
    store.settlementOverride = { ...defaultSettlementOverride };
    persist();
  }
}

function getSettlementOverrideState() {
  refreshSettlementOverride();
  const o = store.settlementOverride || defaultSettlementOverride;
  const sec = o.active && o.untilMs > Date.now() ? Math.ceil((o.untilMs - Date.now()) / 1000) : 0;
  const active = Boolean(o.active && sec > 0 && (o.mode === 'win' || o.mode === 'lose'));
  return {
    active,
    mode: active ? o.mode : null,
    untilMs: o.untilMs || 0,
    secondsLeft: active ? sec : 0,
    label: active ? (o.mode === 'win' ? '全赢控盘' : '全输控盘') : '正常结算',
  };
}

function startSettlementOverride(minutes, mode) {
  const m = Math.max(1, Math.floor(Number(minutes) || 1));
  const untilMs = Date.now() + m * 60000;
  const mo = mode === 'lose' ? 'lose' : 'win';
  store.settlementOverride = { active: true, mode: mo, untilMs };
  persist();
  return getSettlementOverrideState();
}

function clearSettlementOverride() {
  store.settlementOverride = { ...defaultSettlementOverride };
  persist();
  return getSettlementOverrideState();
}

/** 下单结算：若控盘生效则返回强制结果，否则 null 走随机 */
function effectiveSettlementResult() {
  refreshSettlementOverride();
  const st = getSettlementOverrideState();
  if (!st.active || !st.mode) return null;
  return st.mode;
}

function pruneExpiredProductSettlementRules() {
  const list = store.productSettlementRules;
  if (!Array.isArray(list) || !list.length) return;
  const grace = 7 * 86400000;
  const cutoff = Date.now() - grace;
  const next = list.filter((r) => {
    if (r?.dailyRecurring === true) return true; // 每日执行规则长期保留
    const b = Number(r?.untilMs);
    if (!Number.isFinite(b) || b <= 0) return true; // 时间不限
    return b >= cutoff;
  });
  if (next.length !== list.length) {
    store.productSettlementRules = next;
    persist();
  }
}

function ruleWindowState(r, now = Date.now()) {
  const aRaw = Number(r?.startMs);
  const bRaw = Number(r?.untilMs);
  const a = Number.isFinite(aRaw) ? aRaw : 0;
  const dailyRecurring = r?.dailyRecurring === true;
  const hasEnd = Number.isFinite(bRaw) && bRaw > 0;
  if (hasEnd && bRaw <= a) return { active: false, startMs: a, untilMs: bRaw, noLimit: false };
  if (dailyRecurring && hasEnd) {
    if (now < a) return { active: false, startMs: a, untilMs: bRaw, noLimit: false, dailyRecurring: true };
    const sd = new Date(a);
    const ed = new Date(bRaw);
    const nd = new Date(now);
    const sSec = sd.getHours() * 3600 + sd.getMinutes() * 60 + sd.getSeconds();
    const eSec = ed.getHours() * 3600 + ed.getMinutes() * 60 + ed.getSeconds();
    const nSec = nd.getHours() * 3600 + nd.getMinutes() * 60 + nd.getSeconds();
    const active = eSec > sSec ? nSec >= sSec && nSec < eSec : nSec >= sSec || nSec < eSec;
    return { active, startMs: a, untilMs: bRaw, noLimit: false, dailyRecurring: true };
  }
  const active = hasEnd ? now >= a && now < bRaw : now >= a;
  return { active, startMs: a, untilMs: hasEnd ? bRaw : null, noLimit: !hasEnd, dailyRecurring: false };
}

/**
 * 指定产品在当前时刻是否被控盘；仅看 productSettlementRules（与全局 settlementOverride 独立）。
 * @returns {'win'|'lose'|null}
 */
function effectiveSettlementResultForProduct(productId) {
  pruneExpiredProductSettlementRules();
  const pid = Number(productId);
  if (!Number.isFinite(pid)) return null;
  const rules = store.productSettlementRules || [];
  let hit = null;
  for (const r of rules) {
    if (Number(r.productId) !== pid) continue;
    if (ruleWindowState(r).active) hit = r;
  }
  if (!hit) return null;
  return hit.mode === 'lose' ? 'lose' : 'win';
}

function activeDirectionalProfitRate(productId, direction) {
  pruneExpiredProductSettlementRules();
  const pid = Number(productId);
  if (!Number.isFinite(pid)) return null;
  const targetMode = direction === 'short' ? 'lose' : 'win'; // short=跌, long=涨
  const rules = store.productSettlementRules || [];
  let hit = null;
  for (const r of rules) {
    if (Number(r.productId) !== pid) continue;
    const mode = r.mode === 'lose' ? 'lose' : 'win';
    if (mode !== targetMode) continue;
    if (ruleWindowState(r).active) hit = r;
  }
  if (!hit) return null;
  const pr = Number(hit.profitRate);
  return Number.isFinite(pr) ? pr : null;
}

function listProductSettlementRules() {
  pruneExpiredProductSettlementRules();
  const rules = store.productSettlementRules || [];
  // 确保每个规则都有 profitRate 和 volatility 字段
  return JSON.parse(JSON.stringify(rules.map(r => ({
    ...r,
    ...ruleWindowState(r),
    profitRate: r.profitRate ?? 0.95,
    volatility: r.volatility ?? 0.65,
  }))));
}

function addProductSettlementRule({ productId, mode, startMs, untilMs, profitRate, volatility, dailyRecurring }) {
  const pid = Math.floor(Number(productId));
  if (!Number.isFinite(pid) || pid < 1) throw new Error('产品无效');
  const aRaw = Number(startMs);
  const bRaw = Number(untilMs);
  const a = Number.isFinite(aRaw) ? aRaw : Date.now();
  const daily = dailyRecurring === true;
  const hasEnd = Number.isFinite(bRaw) && bRaw > 0;
  const b = hasEnd ? bRaw : null;
  if (daily && !hasEnd) throw new Error('每日执行需填写开始和结束时间');
  if (hasEnd && b <= a) throw new Error('结束时间须晚于开始时间');
  const mo = mode === 'lose' ? 'lose' : 'win';
  const pr = Number(profitRate);
  const vol = Number(volatility);
  const row = {
    id: `psr_${crypto.randomUUID()}`,
    productId: pid,
    mode: mo,
    startMs: a,
    untilMs: b,
    dailyRecurring: daily,
    profitRate: Number.isFinite(pr) ? pr : 0.95,
    volatility: Number.isFinite(vol) && vol >= 0 && vol <= 5 ? vol : 0.65,
    createdAt: new Date().toISOString(),
  };
  if (!Array.isArray(store.productSettlementRules)) store.productSettlementRules = [];
  store.productSettlementRules.push(row);
  persist();
  return row;
}

function listEntrustControlRules() {
  const list = Array.isArray(store.entrustControlRules) ? store.entrustControlRules : [];
  return JSON.parse(
    JSON.stringify(
      list.map((r) => ({
        ...r,
        ...ruleWindowState(r),
        loseRatePct: Number.isFinite(Number(r.loseRatePct)) ? Number(r.loseRatePct) : 100,
        winRatePct: Number.isFinite(Number(r.winRatePct)) ? Number(r.winRatePct) : 95,
      }))
    )
  );
}

function addEntrustControlRule({ productId, mode, startMs, untilMs, loseRatePct, winRatePct, dailyRecurring }) {
  const pid = Math.floor(Number(productId));
  if (!Number.isFinite(pid) || pid < 1) throw new Error('产品无效');
  const aRaw = Number(startMs);
  const bRaw = Number(untilMs);
  const a = Number.isFinite(aRaw) ? aRaw : Date.now();
  const daily = dailyRecurring === true;
  const hasEnd = Number.isFinite(bRaw) && bRaw > 0;
  const b = hasEnd ? bRaw : null;
  if (daily && !hasEnd) throw new Error('每日执行需填写开始和结束时间');
  if (hasEnd && b <= a) throw new Error('结束时间须晚于开始时间');
  const mo = mode === 'lose' ? 'lose' : 'win';
  const lose = Number(loseRatePct);
  const win = Number(winRatePct);
  const row = {
    id: `ecr_${crypto.randomUUID()}`,
    productId: pid,
    mode: mo,
    startMs: a,
    untilMs: b,
    dailyRecurring: daily,
    loseRatePct: Number.isFinite(lose) ? Math.max(0, Math.min(100, lose)) : 100,
    winRatePct: Number.isFinite(win) ? Math.max(0, Math.min(500, win)) : 95,
    createdAt: new Date().toISOString(),
  };
  if (!Array.isArray(store.entrustControlRules)) store.entrustControlRules = [];
  store.entrustControlRules.push(row);
  persist();
  return row;
}

function removeEntrustControlRule(ruleId) {
  const id = String(ruleId || '');
  const list = store.entrustControlRules || [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error('规则不存在');
  list.splice(idx, 1);
  persist();
}

function activeEntrustControlRule(productId) {
  const pid = Number(productId);
  if (!Number.isFinite(pid)) return null;
  const list = store.entrustControlRules || [];
  let hit = null;
  for (const r of list) {
    if (Number(r.productId) !== pid) continue;
    if (ruleWindowState(r).active) hit = r;
  }
  return hit;
}

function getAdminEntrustControlPage() {
  let rules = [];
  try {
    rules = listEntrustControlRules().map((r) => ({
      id: String(r.id || ''),
      productId: Number(r.productId),
      mode: r.mode === 'lose' ? 'lose' : 'win',
      startMs: Number(r.startMs),
      untilMs: Number.isFinite(Number(r.untilMs)) && Number(r.untilMs) > 0 ? Number(r.untilMs) : null,
      noLimit: !Number.isFinite(Number(r.untilMs)) || Number(r.untilMs) <= 0,
      dailyRecurring: r.dailyRecurring === true,
      loseRatePct: Number.isFinite(Number(r.loseRatePct)) ? Number(r.loseRatePct) : 100,
      winRatePct: Number.isFinite(Number(r.winRatePct)) ? Number(r.winRatePct) : 95,
      createdAt: r.createdAt != null ? String(r.createdAt) : undefined,
    }));
  } catch {
    rules = [];
  }
  let products = [];
  try {
    products = getListedProductsRaw().map((p) => ({
      id: Number(p.id),
      name: String(p.name || p.tradeName || `产品${p.id}`),
    }));
  } catch {
    products = [];
  }
  return { rules, products };
}

function removeProductSettlementRule(ruleId) {
  const id = String(ruleId || '');
  const list = store.productSettlementRules || [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error('规则不存在');
  list.splice(idx, 1);
  persist();
}

/**
 * 管理端「按产品控盘」页：规则列表 + 上架产品下拉（不经 enrichProduct，避免行情引擎等副作用导致接口 500）。
 * 各步独立容错，避免异常数据导致 JSON 序列化失败整页 500。
 */
function getAdminProductSettlementPage() {
  try {
    pruneExpiredProductSettlementRules();
  } catch (e) {
    console.error('[store] pruneExpiredProductSettlementRules', e);
  }

  let rules = [];
  try {
    const raw = Array.isArray(store.productSettlementRules) ? store.productSettlementRules : [];
    rules = raw.map((r) => {
      if (!r || typeof r !== 'object') return null;
      return {
        id: String(r.id || ''),
        productId: Number(r.productId),
        mode: r.mode === 'lose' ? 'lose' : 'win',
        startMs: Number(r.startMs),
        untilMs: Number.isFinite(Number(r.untilMs)) && Number(r.untilMs) > 0 ? Number(r.untilMs) : null,
        noLimit: !Number.isFinite(Number(r.untilMs)) || Number(r.untilMs) <= 0,
        dailyRecurring: r.dailyRecurring === true,
        profitRate: Number.isFinite(Number(r.profitRate)) ? Number(r.profitRate) : 0.95,
        volatility: Number.isFinite(Number(r.volatility)) ? Number(r.volatility) : 0.65,
        createdAt: r.createdAt != null ? String(r.createdAt) : undefined,
      };
    }).filter((x) => x && x.id && Number.isFinite(x.productId));
  } catch (e) {
    console.error('[store] getAdminProductSettlementPage rules', e);
    rules = [];
  }

  let products = [];
  try {
    products = getListedProductsRaw().map((p) => ({
      id: Number(p.id),
      name: String(p.name || p.tradeName || `产品${p.id}`),
    })).filter((x) => Number.isFinite(x.id));
  } catch (e) {
    console.error('[store] getAdminProductSettlementPage products', e);
    products = [];
  }

  return { rules, products };
}

/**
 * 保存产品列表，并在「自动绑定」模式下按名称调用 TradingView 公共检索写入 marketSymbol。
 */
async function updateCmsSectionProductsAsync(data) {
  if (!Array.isArray(data)) throw new Error('products 须为数组');
  const rows = normalizeProductCatalogRows(data);
  for (const p of rows) {
    patchProductRow(p);
    const t = p.chartSourceType === 'website' ? 'website' : 'tradingview';
    p.chartSourceType = t;
    if (t === 'website') {
      const url = String(p.chartWebsiteUrl || '').trim();
      if (!url) throw new Error(`产品「${p.name || p.id}」：选择网站嵌入时须填写 TradingView 嵌入页地址`);
      assertAllowedChartEmbedUrl(url);
      p.chartWebsiteUrl = url;
    } else {
      p.chartWebsiteUrl = '';
    }
  }
  store.products = rows;
  pruneProductMetaToCatalog(store.productMeta);
  stripCatalogProductMetaEntries(store.productMeta);

  if (!store.productMeta || typeof store.productMeta !== 'object') store.productMeta = {};
  for (const p of rows) {
    const id = String(p.id);
    if (p.chartSourceType === 'website') continue;

    const vendor = String(p.chartVendor || 'tradingview').toLowerCase();
    const bind = p.chartBindMode === 'manual' ? 'manual' : 'auto';

    if (vendor !== 'tradingview') {
      throw new Error(`产品「${p.name || p.id}」：暂不支持该行情网站（当前仅支持 TradingView 自动检索）`);
    }
    if (bind === 'manual') continue;

    const name = String(p.name || '').trim();
    if (!name) throw new Error(`产品 ${p.productCode || p.id}：请填写名称/公司或品种名以便检索行情`);
    const sym = await resolveTradingViewSymbol(name);
    if (!sym) {
      throw new Error(
        `产品「${name}」：无法在 TradingView 匹配到标的。请尝试更明确的名称，或在「高级」中改用手动代码。`
      );
    }
    store.productMeta[id] = {
      ...(store.productMeta[id] || {}),
      marketSymbol: sym.replace(/\s+/g, '').replace(/：/g, ':'),
    };
  }
  persist();
}

function updateCmsSection(section, data) {
  if (section === 'banners') {
    if (!Array.isArray(data)) throw new Error('banners 须为数组');
    store.banners = data;
  } else if (section === 'announcements') {
    if (!Array.isArray(data)) throw new Error('announcements 须为数组');
    store.announcements = data.map((x) => String(x));
  } else if (section === 'articles') {
    if (!Array.isArray(data)) throw new Error('articles 须为数组');
    store.articles = data;
  } else if (section === 'productMeta') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('productMeta 须为对象');
    store.productMeta = data;
    pruneProductMetaToCatalog(store.productMeta);
    stripCatalogProductMetaEntries(store.productMeta);
  } else if (section === 'simSettings') {
    if (!data || typeof data !== 'object') throw new Error('simSettings 须为对象');
    store.simSettings = { ...defaultSimSettings, ...store.simSettings, ...data };
  } else if (section === 'tradeConfig') {
    if (!data || typeof data !== 'object') throw new Error('tradeConfig 须为对象');
    store.tradeConfig = {
      ...JSON.parse(JSON.stringify(defaultTradeConfig)),
      ...data,
      durationOptions: normalizeTradeDurationOptions(
        data.durationOptions !== undefined ? data.durationOptions : store.tradeConfig.durationOptions,
      ),
      amountPresets: data.amountPresets || store.tradeConfig.amountPresets,
    };
  } else if (section === 'companyInfo') {
    if (!data || typeof data !== 'object') throw new Error('companyInfo 须为对象');
    store.companyInfo = { ...defaultCompanyInfo, ...store.companyInfo, ...data };
  } else if (section === 'productCategories') {
    if (!Array.isArray(data)) throw new Error('productCategories 须为数组');
    store.productCategories = data;
  } else if (section === 'companyContent') {
    if (!data || typeof data !== 'object') throw new Error('companyContent 须为对象');
    const cur = store.companyContent || buildCompanyContentSeed();
    store.companyContent = {
      realtime: Array.isArray(data.realtime) ? data.realtime : cur.realtime,
      future: Array.isArray(data.future) ? data.future : cur.future,
      notices: Array.isArray(data.notices) ? data.notices : cur.notices,
    };
  } else if (section === 'mediaSchedules') {
    const rows = normalizeMediaSchedules(data);
    if (!rows.length) throw new Error('mediaSchedules 至少需要一条有效媒体规则');
    store.mediaSchedules = rows;
  } else if (section === 'siteSections') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('siteSections 须为对象');
    store.siteSections = { ...JSON.parse(JSON.stringify(defaultSiteSections)), ...data };
  } else {
    throw new Error('未知 section');
  }
  persist();
}

module.exports = {
  getBanners,
  getAnnouncements,
  getNoticeFeed,
  getProducts,
  getListedProductsRaw,
  getStaticQuoteBaseForId,
  setLiveMarketEngine,
  getProductById,
  getArticlesPublic,
  getArticleBySlug,
  getSimSettings,
  getTradeConfig,
  getCmsSnapshot,
  updateCmsSection,
  updateCmsSectionProductsAsync,
  getCompanyInfo,
  getCompanyContent,
  getSiteSections,
  getMediaSchedules,
  getActiveMediaSchedule,
  getSettlementOverrideState,
  startSettlementOverride,
  clearSettlementOverride,
  effectiveSettlementResult,
  effectiveSettlementResultForProduct,
  listProductSettlementRules,
  addProductSettlementRule,
  removeProductSettlementRule,
  activeDirectionalProfitRate,
  getAdminProductSettlementPage,
  refreshSettlementOverride,
  listEntrustControlRules,
  addEntrustControlRule,
  removeEntrustControlRule,
  activeEntrustControlRule,
  getAdminEntrustControlPage,
};
