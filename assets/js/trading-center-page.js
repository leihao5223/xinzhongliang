(() => {
  const main = document.querySelector('main');
  if (!main || !/product\.html$/i.test(location.pathname)) return;

  const TOKEN_KEYS = ['zhongliang_token', 'zl_token', 'token'];
  const token = TOKEN_KEYS.map((k) => localStorage.getItem(k)).find((v) => v && v.trim());

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
      return { ...p, livePrice: base, changePct: change };
    });
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

  main.innerHTML = `
    <section class="section data-comparison-section data-comparison-section--dark-glass" id="heritage-metrics">
      <div class="hero-container">
        <div class="sub-heading animate-box animated-delay-slow animate__animated" data-animate="animate__fadeIn" style="margin-bottom:1.5rem;">
          <i class="fa-solid fa-circle"></i>
          <h4 class="accent-color">实时行情</h4>
        </div>
        <h2 class="animate-box animated animate__animated" data-animate="animate__fadeInLeft" style="margin-bottom:2.5rem;">精选农产品行情与交易</h2>

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
  `;

  const style = document.createElement('style');
  style.textContent = `
    .tc-trade-modal{position:fixed;inset:0;background:rgba(3,8,16,.72);display:none;align-items:center;justify-content:center;z-index:50;padding:1rem}
    .tc-trade-modal.is-open{display:flex}
    .tc-trade-dialog{position:relative;width:min(460px,100%);background:#e8f9eb;border-radius:14px;padding:1rem 1rem 1.1rem;border:1px solid rgba(26,122,62,.25)}
    .tc-trade-dialog h3{font-size:1.05rem;margin:0 0 .4rem;color:#123a2b}
    .tc-balance{margin:0 0 .7rem;color:#1f5d46;font-size:.84rem}
    .tc-modal-close{position:absolute;right:.6rem;top:.5rem;border:0;background:transparent;font-size:1.6rem;line-height:1;color:#194f39;cursor:pointer}
    .tc-form{display:flex;flex-direction:column;gap:.55rem}
    .tc-quick-amounts{display:grid;grid-template-columns:repeat(3,1fr);gap:.45rem}
    .tc-quick-amounts button{border:1px solid rgba(148,211,255,.3);background:rgba(4,22,42,.45);color:#d7ebff;border-radius:10px;padding:.45rem;font-size:.8rem;cursor:pointer}
    .tc-form input{background:#fff;color:#163323;border:1px solid rgba(26,122,62,.25);border-radius:10px;padding:.55rem}
    .tc-form button{border:0;border-radius:10px;padding:.6rem;color:#fff;background:linear-gradient(135deg,#0d5c2e,#1a7a3e,#2ecc71);cursor:pointer}
    .tc-msg{margin:.55rem 0 0;color:#1f5d46;font-size:.82rem}
    .tc-grid{display:grid;grid-template-columns:minmax(240px,1fr) minmax(420px,1.9fr);gap:1rem}
    .tc-list-panel,.tc-detail-panel{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:.95rem}
    .tc-list-panel{max-height:620px;overflow:auto}
    .tc-product-desc{margin:0 0 .8rem;color:#9db3cf;font-size:.88rem}
    .dc-proj-block{position:relative;padding:.85rem .9rem;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);margin-bottom:.7rem;cursor:pointer;transition:all .35s ease}
    .dc-proj-block:hover{border-color:rgba(255,255,255,.25);background:rgba(255,255,255,.1)}
    .dc-proj-block.is-active{border-color:rgba(255,255,255,.35);background:rgba(255,255,255,.12);box-shadow:0 12px 40px rgba(0,0,0,.25)}
    .dc-proj-title{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:0 0 .25rem}
    .dc-proj-name{font-size:.95rem;color:#f0f4f8;font-weight:600}
    .dc-proj-live{font-size:.9rem;color:#90d9ff;font-weight:700}
    .dc-proj-pct{font-size:.82rem;font-weight:700;margin-left:auto}
    .dc-proj-pct.is-up{color:#34d399}
    .dc-proj-pct.is-down{color:#f87171}
    .dc-proj-desc{font-size:.82rem;color:#9ab;margin:0 0 .5rem}
    .dc-proj-ratios{display:flex;flex-direction:column;gap:.35rem}
    .dc-ratio-head{display:flex;justify-content:space-between;font-size:.75rem;color:#cbd5e1}
    .dc-ratio-track2{height:4px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden}
    .dc-ratio-fill2{display:block;height:100%;border-radius:2px}
    .dc-ratio-fill2--green{background:linear-gradient(90deg,#34d399,#22c55e)}
    .dc-ratio-fill2--red{background:linear-gradient(90deg,#f87171,#ef4444)}
    .tc-action-bar{display:grid;grid-template-columns:repeat(3,1fr);gap:.55rem;margin-top:.85rem}
    .tc-action-bar button{border:0;border-radius:999px;padding:.52rem .6rem;font-size:.82rem;color:#fff;cursor:pointer}
    .tc-action-bar button[data-direction="long"][data-order-kind="market"]{background:linear-gradient(135deg,#0d5c2e,#1a7a3e,#2ecc71)}
    .tc-action-bar button[data-direction="short"]{background:linear-gradient(135deg,#6b1f1f,#ef4444,#f97316)}
    .tc-action-bar button[data-order-kind="entrust"]{background:linear-gradient(135deg,#164f8b,#2563eb,#38bdf8)}
    @media (max-width: 992px){
      .tc-grid{grid-template-columns:1fr}
      .tc-list-panel{max-height:none}
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
  let active = null;
  let products = [];
  let summary = null;
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
    modalTitle.textContent = `${active.name || active.id} · 交易`;
    balanceEl.textContent = `可用余额：${formatNum(summary?.available)} 元`;
    msg.textContent = '';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeTradeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
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
      setTimeout(closeTradeModal, 650);
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
    } catch (err) {
      if (listRoot) listRoot.innerHTML = `<p style="color:#ffd6d6;padding:1rem;">${esc(err.message)}</p>`;
    }
  })();
})();
