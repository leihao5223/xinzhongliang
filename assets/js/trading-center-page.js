(() => {
  const main = document.querySelector('main');
  if (!main || !/product\.html$/i.test(location.pathname)) return;

  const TOKEN_KEYS = ['zhongliang_token', 'zl_token', 'token'];
  const token = TOKEN_KEYS.map((k) => localStorage.getItem(k)).find((v) => v && v.trim()) || '';

  async function api(url, opt = {}) {
    const headers = { ...(opt.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opt.json) {
      headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(opt.json);
      delete opt.json;
    }
    const res = await fetch(url, { ...opt, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `请求失败(${res.status})`);
    return data;
  }

  function formatNum(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '--';
    return x.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function tvEmbedUrl(symbol) {
    const sym = encodeURIComponent(String(symbol || 'SSE:600598').replace(/\s+/g, '').replace(/：/g, ':'));
    return 'https://www.tradingview.com/widgetembed/?frameElementId=dcTvEmbed&symbol=' + sym + '&interval=D&hidesidetoolbar=0&hidetoptoolbar=0&symboledit=0&saveimage=0&toolbarbg=1e293b&studies=%5B%5D&theme=dark&style=1&timezone=Asia%2FShanghai&locale=zh_CN';
  }

  function enrichProducts(list) {
    return list.map((p) => {
      const seed = Number(p.id || 1) * 997;
      const base = 10 + (seed % 500);
      const change = ((seed * 13) % 1000) / 100 - 5;
      return { ...p, livePrice: base, changePct: change, _base: base };
    });
  }

  function tickPrice(p) {
    // 随机游走：每秒在 [-0.08, +0.08] 之间波动，保留两位小数
    const delta = (Math.random() - 0.5) * 0.16;
    let next = Number(p.livePrice) + delta;
    // 围绕基准价做有界波动，防止漂移太远
    const min = p._base * 0.92;
    const max = p._base * 1.08;
    if (next < min) next = min + Math.random() * 0.05;
    if (next > max) next = max - Math.random() * 0.05;
    p.livePrice = next;
    // 同步微调涨跌幅
    const drift = ((next - p._base) / p._base) * 100;
    p.changePct = Number((drift + (Math.random() - 0.5) * 0.3).toFixed(2));
    return p;
  }

  function startLiveTicks() {
    setInterval(() => {
      if (!products.length) return;
      products.forEach(tickPrice);
      // 更新列表中各卡片的价格与涨跌幅
      listRoot.querySelectorAll('.dc-proj-block').forEach((el) => {
        const idx = Number(el.getAttribute('data-idx'));
        const p = products[idx];
        if (!p) return;
        const liveEl = el.querySelector('.dc-proj-live');
        const pctEl = el.querySelector('.dc-proj-pct');
        if (liveEl) liveEl.textContent = formatNum(p.livePrice);
        if (pctEl) {
          const pctStr = (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%';
          pctEl.textContent = pctStr;
          pctEl.className = p.changePct >= 0 ? 'dc-proj-pct is-up' : 'dc-proj-pct is-down';
        }
      });
      // 更新详情面板的价格描述
      if (active && descEl) {
        descEl.textContent = `${active.summary || ''} · 最新价 ${formatNum(active.livePrice)}，涨跌幅 ${(active.changePct >= 0 ? '+' : '') + active.changePct.toFixed(2)}%`;
      }
      // 每 3 秒刷新一次走势图 iframe，避免每秒刷新造成闪烁与性能问题
      if (active && Date.now() - (window._lastChartRefresh || 0) > 3000) {
        window._lastChartRefresh = Date.now();
        const t = String(active.chartSourceType || 'tradingview').toLowerCase();
        const web = String(active.chartWebsiteUrl || '').trim();
        const newSrc = t === 'website' && web ? web : tvEmbedUrl(active.marketSymbol);
        // 加随机参数强制刷新
        const separator = newSrc.includes('?') ? '&' : '?';
        iframe.src = newSrc + separator + '_t=' + Date.now();
      }
    }, 1000);
  }

  function upDownSplit(p) {
    const t = Number(p.changePct);
    if (Number.isFinite(t)) {
      const skew = Math.max(-28, Math.min(28, t * 5.5));
      const up = Math.round(50 + skew);
      return { up: Math.max(12, Math.min(88, up)), down: 100 - up };
    }
    const n = Number(p.id) || 1;
    const up = 32 + ((n * 37) % 37);
    return { up, down: 100 - up };
  }

  function classifyOrders(list) {
    const settled = [];
    const running = [];
    (list || []).forEach((o) => {
      const s = String(o.status || '').toLowerCase();
      if (s.includes('settled') || s.includes('closed') || s.includes('done')) settled.push(o);
      else running.push(o);
    });
    return { running, settled };
  }

  function orderDirectionText(order) {
    const d = String(order.direction || '').toLowerCase();
    if (d === 'short') return '买跌';
    return '买涨';
  }

  main.innerHTML = `
    <section class="section data-comparison-section data-comparison-section--dark-glass" id="trade-hub">
      <div class="hero-container">
        <div class="sub-heading animate-box animated-delay-slow animate__animated" data-animate="animate__fadeIn" style="margin-bottom:1.5rem;">
          <i class="fa-solid fa-circle"></i>
          <h4 class="accent-color">实时行情</h4>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;">
          <h2 class="animate-box animated animate__animated" data-animate="animate__fadeInLeft" style="margin:0;"></h2>
          <button id="tc-open-orders" class="tc-order-entry">订单记录</button>
        </div>

        <div class="tc-grid">
          <div class="tc-list-panel animate-box animated animate__animated" data-animate="animate__fadeInUp">
            <div id="tc-product-list"></div>
          </div>
          <div class="tc-detail-panel animate-box animated animate__animated" data-animate="animate__fadeInUp">
            <h3 id="tc-trend-title" class="dc-trend-title">加载中…</h3>
            <p id="tc-product-desc" class="tc-product-desc"></p>
            <div class="dc-chart-shell">
              <iframe id="dc-chart-frame" class="dc-chart-frame" title="产品走势" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
            </div>
            <div class="tc-action-bar">
              <button type="button" data-order-kind="market" data-direction="long">买涨</button>
              <button type="button" data-order-kind="market" data-direction="short">买跌</button>
              <button type="button" data-order-kind="entrust" data-direction="long">委买</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div id="tc-detail-sheet" class="tc-detail-sheet" aria-hidden="true">
      <div class="tc-detail-body">
        <div class="tc-detail-head">
          <strong id="tc-sheet-title">产品详情</strong>
          <button type="button" id="tc-close-detail">关闭</button>
        </div>
        <p id="tc-sheet-desc" class="tc-product-desc" style="margin:0 0 .65rem;"></p>
        <div class="dc-chart-shell">
          <iframe id="tc-sheet-chart" class="dc-chart-frame" title="产品详情走势" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>
        <div class="tc-action-bar">
          <button type="button" data-order-kind="market" data-direction="long">买涨</button>
          <button type="button" data-order-kind="market" data-direction="short">买跌</button>
          <button type="button" data-order-kind="entrust" data-direction="long">委买</button>
        </div>
      </div>
    </div>

    <div id="tc-trade-modal" class="tc-trade-modal" aria-hidden="true">
      <div class="tc-trade-dialog">
        <button type="button" id="tc-close-modal" class="tc-modal-close" aria-label="关闭">&times;</button>
        <h3 id="tc-modal-title">产品交易</h3>
        <p id="tc-balance" class="tc-balance">可用余额：--</p>
        <form id="tc-order-form" class="tc-form">
          <div class="tc-quick-amounts" id="tc-quick-amounts"></div>
          <input id="tc-amount" type="number" min="100" step="100" placeholder="金额（元）" required />
          <input id="tc-trade-pw" type="password" placeholder="交易密码" required />
          <button type="submit">确认交易</button>
        </form>
        <p id="tc-msg" class="tc-msg"></p>
      </div>
    </div>

    <div id="tc-orders-modal" class="tc-trade-modal" aria-hidden="true">
      <div class="tc-trade-dialog tc-orders-dialog">
        <button type="button" id="tc-close-orders" class="tc-modal-close" aria-label="关闭">&times;</button>
        <h3>订单记录</h3>
        <p id="tc-orders-balance" class="tc-balance">当前可用余额：--</p>
        <div class="tc-orders-tabs">
          <button type="button" data-tab="running" class="is-active">进行中</button>
          <button type="button" data-tab="settled">已结算</button>
        </div>
        <div id="tc-orders-list" class="tc-orders-list"></div>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .tc-trade-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:60;padding:1rem}
    .tc-trade-modal.is-open{display:flex}
    .tc-trade-dialog{position:relative;width:min(460px,100%);background:#ffffff;border-radius:14px;padding:1rem 1rem 1.1rem;border:1px solid rgba(0,0,0,.1);box-shadow:0 8px 32px rgba(0,0,0,.12)}
    .tc-trade-dialog h3{font-size:1.05rem;margin:0 0 .4rem;color:#1a1a1a}
    .tc-balance{margin:0 0 .7rem;color:#555555;font-size:.84rem}
    .tc-modal-close{position:absolute;right:.6rem;top:.5rem;border:0;background:transparent;font-size:1.6rem;line-height:1;color:#777777;cursor:pointer}
    .tc-form{display:flex;flex-direction:column;gap:.55rem}
    .tc-quick-amounts{display:grid;grid-template-columns:repeat(3,1fr);gap:.45rem}
    .tc-quick-amounts button{border:1px solid rgba(0,0,0,.1);background:#f0f0f0;color:#333333;border-radius:10px;padding:.45rem;font-size:.8rem;cursor:pointer}
    .tc-form input{background:#ffffff;color:#1a1a1a;border:1px solid rgba(0,0,0,.15);border-radius:10px;padding:.55rem}
    .tc-form button{border:0;border-radius:10px;padding:.6rem;color:#fff;background:linear-gradient(135deg,#0d5c2e,#1a7a3e,#2ecc71);cursor:pointer}
    .tc-msg{margin:.55rem 0 0;color:#555555;font-size:.82rem}
    .tc-order-entry{border:1px solid rgba(0,0,0,.15);background:#f0f0f0;color:#333333;border-radius:999px;padding:.42rem .9rem;font-size:.82rem;cursor:pointer}
    .tc-grid{display:grid;grid-template-columns:minmax(240px,1fr) minmax(420px,1.9fr);gap:1rem}
    .tc-list-panel,.tc-detail-panel{background:#ffffff;border:1px solid rgba(0,0,0,.08);border-radius:16px;padding:.95rem;box-shadow:0 2px 8px rgba(0,0,0,.04)}
    .tc-list-panel{max-height:620px;overflow:auto}
    .tc-product-desc{margin:0 0 .8rem;color:#555555;font-size:.88rem}
    .dc-proj-block{position:relative;padding:.85rem .9rem;border-radius:14px;background:#ffffff;border:1px solid rgba(0,0,0,.08);margin-bottom:.7rem;cursor:pointer;transition:all .35s ease}
    .dc-proj-block:hover{border-color:rgba(0,0,0,.15);background:#fafafa}
    .dc-proj-block.is-active{border-color:rgba(0,0,0,.2);background:#f5f5f5;box-shadow:0 4px 16px rgba(0,0,0,.08)}
    .dc-proj-title{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:0 0 .25rem}
    .dc-proj-name{font-size:.95rem;color:#1a1a1a;font-weight:600}
    .dc-proj-live{font-size:.9rem;color:#00796b;font-weight:700}
    .dc-proj-pct{font-size:.82rem;font-weight:700;margin-left:auto}
    .dc-proj-pct.is-up{color:#22c55e}
    .dc-proj-pct.is-down{color:#ef4444}
    .dc-proj-desc{font-size:.82rem;color:#555555;margin:0 0 .5rem}
    .dc-proj-ratios{display:flex;flex-direction:column;gap:.35rem}
    .dc-ratio-head{display:flex;justify-content:space-between;font-size:.75rem;color:#666666}
    .dc-ratio-track2{height:4px;border-radius:2px;background:rgba(0,0,0,.08);overflow:hidden}
    .dc-ratio-fill2{display:block;height:100%;border-radius:2px}
    .dc-ratio-fill2--green{background:linear-gradient(90deg,#34d399,#22c55e)}
    .dc-ratio-fill2--red{background:linear-gradient(90deg,#f87171,#ef4444)}
    .tc-card-actions{display:flex;gap:.45rem;margin-top:.65rem}
    .tc-card-actions button{border:0;border-radius:999px;padding:.35rem .8rem;font-size:.76rem;color:#fff;cursor:pointer}
    .tc-card-actions .tc-open-detail{background:linear-gradient(135deg,#1d4ed8,#2563eb,#38bdf8)}
    .tc-card-actions .tc-open-buy{background:linear-gradient(135deg,#0d5c2e,#1a7a3e,#2ecc71)}
    .tc-card-pop{margin-top:.6rem;border:1px solid rgba(0,0,0,.1);background:#f8f9fa;border-radius:12px;padding:.55rem}
    .tc-card-pop .dc-chart-shell{border:1px solid rgba(0,0,0,.08);border-radius:10px;overflow:hidden}
    .tc-card-pop .dc-chart-frame{height:180px}
    .tc-card-pop .tc-open-detail{display:block;margin-top:.55rem;width:100%}
    .tc-detail-sheet{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:58;align-items:flex-end}
    .tc-detail-sheet.is-open{display:flex}
    .tc-detail-body{width:100%;max-height:92vh;overflow:auto;background:#ffffff;border-top-left-radius:18px;border-top-right-radius:18px;padding:1rem;box-shadow:0 -4px 24px rgba(0,0,0,.12)}
    .tc-detail-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;color:#1a1a1a}
    .tc-detail-head button{border:0;background:transparent;color:#777777}
    .tc-action-bar{display:grid;grid-template-columns:repeat(3,1fr);gap:.55rem;margin-top:.85rem}
    .tc-action-bar button{border:0;border-radius:999px;padding:.52rem .6rem;font-size:.82rem;color:#fff;cursor:pointer}
    .tc-action-bar button[data-direction="long"][data-order-kind="market"]{background:linear-gradient(135deg,#0d5c2e,#1a7a3e,#2ecc71)}
    .tc-action-bar button[data-direction="short"]{background:linear-gradient(135deg,#6b1f1f,#ef4444,#f97316)}
    .tc-action-bar button[data-order-kind="entrust"]{background:linear-gradient(135deg,#164f8b,#2563eb,#38bdf8)}
    .tc-orders-dialog{width:min(620px,100%);background:#ffffff}
    .tc-orders-tabs{display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem;margin:.7rem 0}
    .tc-orders-tabs button{border:1px solid #c6ced9;background:#fff;color:#4a5d75;border-radius:14px;padding:.52rem}
    .tc-orders-tabs button.is-active{border-color:#b98a1f;color:#b98a1f;background:#f6efe0}
    .tc-orders-list{max-height:56vh;overflow:auto;display:flex;flex-direction:column;gap:.6rem}
    .tc-order-item{background:#fff;border:1px solid #dbe2eb;border-radius:14px;padding:.65rem .8rem}
    .tc-order-item h4{margin:0 0 .2rem;font-size:.95rem;color:#1a1a1a}
    .tc-order-item p{margin:0;color:#555555;font-size:.8rem;line-height:1.5}
    .tc-order-item .tc-order-pnl{font-size:1.08rem;font-weight:700;margin-top:.32rem}
    .tc-order-item .tc-order-pnl.is-win{color:#22c55e}
    .tc-order-item .tc-order-pnl.is-loss{color:#ef4444}
    @media (max-width: 992px){
      .tc-grid{grid-template-columns:1fr}
      .tc-list-panel{max-height:none}
      .tc-detail-panel{display:none}
    }
  `;
  document.head.appendChild(style);

  const listRoot = document.getElementById('tc-product-list');
  const titleEl = document.getElementById('dc-trend-title');
  const descEl = document.getElementById('tc-product-desc');
  const iframe = document.getElementById('dc-chart-frame');
  const modal = document.getElementById('tc-trade-modal');
  const closeModalBtn = document.getElementById('tc-close-modal');
  const modalTitle = document.getElementById('tc-modal-title');
  const balanceEl = document.getElementById('tc-balance');
  const quickAmountsEl = document.getElementById('tc-quick-amounts');
  const orderForm = document.getElementById('tc-order-form');
  const msg = document.getElementById('tc-msg');
  const detailSheet = document.getElementById('tc-detail-sheet');
  const detailSheetTitle = document.getElementById('tc-sheet-title');
  const detailSheetDesc = document.getElementById('tc-sheet-desc');
  const detailSheetChart = document.getElementById('tc-sheet-chart');
  const detailSheetClose = document.getElementById('tc-close-detail');
  const openOrdersBtn = document.getElementById('tc-open-orders');
  const ordersModal = document.getElementById('tc-orders-modal');
  const ordersCloseBtn = document.getElementById('tc-close-orders');
  const ordersBalance = document.getElementById('tc-orders-balance');
  const ordersList = document.getElementById('tc-orders-list');
  const ordersTabs = ordersModal.querySelectorAll('.tc-orders-tabs button');
  let active = null;
  let products = [];
  let summary = null;
  let ordersCache = [];
  let currentOrdersTab = 'running';
  const quickAmountOptions = [1000, 2000, 5000, 10000, 20000, 50000];

  function renderList(list) {
    listRoot.innerHTML = list.map((p, idx) => {
      const last = idx === list.length - 1 ? ' dc-proj-block--last' : '';
      const price = formatNum(p.livePrice);
      const pctStr = (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%';
      const pctCls = p.changePct >= 0 ? 'dc-proj-pct is-up' : 'dc-proj-pct is-down';
      const split = upDownSplit(p);
      return `
        <div class="dc-proj-block${idx === 0 ? ' is-active' : ''}${last}" data-idx="${idx}" role="button" tabindex="0">
          <h3 class="dc-proj-title">
            <span class="dc-proj-name">${esc(p.name)}</span>
            <span class="dc-proj-live" title="行情价">${esc(price)}</span>
            <span class="${pctCls}">${esc(pctStr)}</span>
          </h3>
          <p class="dc-proj-desc">${esc(p.summary)} · ${esc(p.productCode || '')}</p>
          <div class="dc-proj-ratios" aria-label="涨跌占比">
            <div class="dc-ratio-head">
              <span class="dc-ratio-label dc-ratio-label--up">今日看涨</span>
              <span class="dc-ratio-val">${split.up}%</span>
            </div>
            <div class="dc-ratio-track2" role="presentation">
              <span class="dc-ratio-fill2 dc-ratio-fill2--green" style="width:${split.up}%"></span>
            </div>
            <div class="dc-ratio-head">
              <span class="dc-ratio-label dc-ratio-label--down">今日看跌</span>
              <span class="dc-ratio-val">${split.down}%</span>
            </div>
            <div class="dc-ratio-track2" role="presentation">
              <span class="dc-ratio-fill2 dc-ratio-fill2--red" style="width:${split.down}%"></span>
            </div>
          </div>
          <div class="tc-card-actions">
            <button type="button" class="tc-open-detail" data-id="${p.id}">查看详情</button>
            <button type="button" class="tc-open-buy" data-id="${p.id}">购买</button>
          </div>
          ${active && active.id === p.id ? `
            <div class="tc-card-pop">
              <div class="dc-chart-shell">
                <iframe class="dc-chart-frame tc-pop-chart" data-id="${p.id}" title="产品弹层走势" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
              </div>
              <button type="button" class="tc-open-detail tc-open-detail-inline" data-id="${p.id}">查看详情</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    listRoot.querySelectorAll('.dc-proj-block').forEach((el) => {
      function activate() {
        listRoot.querySelectorAll('.dc-proj-block').forEach((x) => x.classList.remove('is-active'));
        el.classList.add('is-active');
        const i = Number(el.getAttribute('data-idx'));
        if (Number.isFinite(i) && list[i]) setChartForProduct(list[i]);
      }
      el.addEventListener('click', () => {
        activate();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
    });

    listRoot.querySelectorAll('.tc-open-buy').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = products.find((x) => String(x.id) === String(btn.getAttribute('data-id')));
        if (!p) return;
        active = p;
        openTradeModal();
      });
    });

    listRoot.querySelectorAll('.tc-open-detail,.tc-open-detail-inline').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = products.find((x) => String(x.id) === String(btn.getAttribute('data-id')));
        if (!p) return;
        active = p;
        openDetailSheet();
      });
    });

    listRoot.querySelectorAll('.tc-pop-chart').forEach((frame) => {
      const p = products.find((x) => String(x.id) === String(frame.getAttribute('data-id')));
      if (!p) return;
      const t = String(p.chartSourceType || 'tradingview').toLowerCase();
      const web = String(p.chartWebsiteUrl || '').trim();
      frame.src = t === 'website' && web ? web : tvEmbedUrl(p.marketSymbol);
    });
  }

  function setChartForProduct(p) {
    if (!p) return;
    if (titleEl) titleEl.textContent = `${p.name} · 走势`;
    if (descEl) descEl.textContent = `${p.summary || ''} · 最新价 ${formatNum(p.livePrice)}，涨跌幅 ${(p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2)}%`;
    const t = String(p.chartSourceType || 'tradingview').toLowerCase();
    const web = String(p.chartWebsiteUrl || '').trim();
    if (t === 'website' && web) { iframe.src = web; return; }
    iframe.src = tvEmbedUrl(p.marketSymbol);
  }

  function openDetailSheet() {
    if (!active) return;
    detailSheetTitle.textContent = active.name + ' · 详情';
    detailSheetDesc.textContent = `${active.summary || ''} · 最新价 ${formatNum(active.livePrice)}，涨跌幅 ${(active.changePct >= 0 ? '+' : '') + active.changePct.toFixed(2)}%`;
    const t = String(active.chartSourceType || 'tradingview').toLowerCase();
    const web = String(active.chartWebsiteUrl || '').trim();
    detailSheetChart.src = t === 'website' && web ? web : tvEmbedUrl(active.marketSymbol);
    detailSheet.classList.add('is-open');
    detailSheet.setAttribute('aria-hidden', 'false');
  }

  function closeDetailSheet() {
    detailSheet.classList.remove('is-open');
    detailSheet.setAttribute('aria-hidden', 'true');
  }

  function renderQuickAmounts() {
    quickAmountsEl.innerHTML = quickAmountOptions.map((v) => `<button type="button" data-val="${v}">${v}</button>`).join('');
    quickAmountsEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('tc-amount').value = btn.getAttribute('data-val');
      });
    });
  }

  function openTradeModal() {
    if (!active) return;
    const kind = orderForm.getAttribute('data-order-kind') === 'entrust' ? '委买' : (orderForm.getAttribute('data-direction') === 'short' ? '买跌' : '买涨');
    modalTitle.textContent = `${active.name || active.id} · ${kind}`;
    balanceEl.textContent = `可用余额：${formatNum(summary?.available)} 元`;
    msg.textContent = '';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeTradeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function renderOrders() {
    const split = classifyOrders(ordersCache);
    const list = currentOrdersTab === 'settled' ? split.settled : split.running;
    ordersList.innerHTML = list.length
      ? list.map((o) => {
          const pnl = Number(o.profit || o.pnl || 0);
          const pnlCls = pnl >= 0 ? 'is-win' : 'is-loss';
          const statusText = currentOrdersTab === 'settled' ? '已结算' : '进行中';
          return `
            <article class="tc-order-item">
              <h4>${esc(o.productName || o.productId || '产品')} · ${orderDirectionText(o)}</h4>
              <p>${statusText} · ${esc(o.createdAt || o.created_at || '--')}</p>
              <p>本金 ${formatNum(o.amount || o.principal || 0)} 元</p>
              <p class="tc-order-pnl ${pnlCls}">${pnl >= 0 ? '盈利' : '亏损'} ${formatNum(pnl)} 元</p>
            </article>
          `;
        }).join('')
      : `<article class="tc-order-item"><p>暂无订单记录</p></article>`;
  }

  async function refreshOrders() {
    try {
      const res = await api('/api/orders');
      ordersCache = Array.isArray(res) ? res : (res.list || []);
    } catch (_) {
      ordersCache = [];
    }
    renderOrders();
  }

  function openOrdersModal() {
    ordersBalance.textContent = `当前可用余额：${formatNum(summary?.available)} 元`;
    ordersModal.classList.add('is-open');
    ordersModal.setAttribute('aria-hidden', 'false');
    refreshOrders();
  }

  function closeOrdersModal() {
    ordersModal.classList.remove('is-open');
    ordersModal.setAttribute('aria-hidden', 'true');
  }

  orderForm && orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!active) return;
    msg.textContent = '提交中...';
    try {
      const amount = Number(document.getElementById('tc-amount').value || 0);
      const tradePassword = document.getElementById('tc-trade-pw').value;
      const orderKind = orderForm.getAttribute('data-order-kind') || 'market';
      const direction = orderForm.getAttribute('data-direction') || 'long';
      const data = await api('/api/trade/order', {
        method: 'POST',
        json: { productId: active.id, amount, direction, orderKind, tradePassword, durationSec: 600 },
      });
      msg.textContent = data.message || '下单成功';
      if (token) summary = await api('/api/me/summary');
      await refreshOrders();
      setTimeout(() => {
        closeTradeModal();
        openOrdersModal();
      }, 550);
    } catch (err) {
      msg.textContent = err.message;
    }
  });

  closeModalBtn && closeModalBtn.addEventListener('click', closeTradeModal);
  modal && modal.addEventListener('click', (e) => { if (e.target === modal) closeTradeModal(); });
  renderQuickAmounts();

  document.querySelectorAll('.tc-action-bar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      orderForm.setAttribute('data-order-kind', btn.getAttribute('data-order-kind') || 'market');
      orderForm.setAttribute('data-direction', btn.getAttribute('data-direction') || 'long');
      openTradeModal();
    });
  });
  detailSheetClose && detailSheetClose.addEventListener('click', closeDetailSheet);
  detailSheet && detailSheet.addEventListener('click', (e) => { if (e.target === detailSheet) closeDetailSheet(); });
  openOrdersBtn && openOrdersBtn.addEventListener('click', openOrdersModal);
  ordersCloseBtn && ordersCloseBtn.addEventListener('click', closeOrdersModal);
  ordersModal && ordersModal.addEventListener('click', (e) => { if (e.target === ordersModal) closeOrdersModal(); });
  ordersTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      ordersTabs.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentOrdersTab = btn.getAttribute('data-tab') || 'running';
      renderOrders();
    });
  });

  (async () => {
    try {
      let raw = [];
      try {
        raw = await api('/api/products');
      } catch (_) {
        const res = await fetch('assets/data/grain-products-enriched.json');
        raw = await res.json();
      }
      products = enrichProducts(raw);
      if (token) {
        try { summary = await api('/api/me/summary'); } catch (_) {}
      }
      active = products[0] || null;
      renderList(products);
      if (active) setChartForProduct(active);
      if (token) refreshOrders();
      startLiveTicks();
    } catch (err) {
      if (listRoot) listRoot.innerHTML = `<p style="color:#ffd6d6;padding:1rem;">${esc(err.message)}</p>`;
    }
  })();
})();
