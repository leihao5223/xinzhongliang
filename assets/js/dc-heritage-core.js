/** 首页 / 关于页「核心数据」：产品名录与走势。 */
(function () {
  const root = document.getElementById('heritage-metrics');
  if (!root) return;

  const legacyRoot = root.querySelector('#dc-legacy-root');
  const titleEl = root.querySelector('#dc-trend-title');
  const iframe = root.querySelector('#dc-chart-frame');
  if (!legacyRoot || !iframe) return;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function tvEmbedUrl(symbol) {
    const sym = encodeURIComponent(String(symbol || 'SSE:600598').replace(/\s+/g, '').replace(/：/g, ':'));
    return (
      'https://www.tradingview.com/widgetembed/?frameElementId=dcTvEmbed&symbol=' +
      sym +
      '&interval=D&hidesidetoolbar=0&hidetoptoolbar=0&symboledit=0&saveimage=0&toolbarbg=1e293b&studies=%5B%5D&theme=dark&style=1&timezone=Asia%2FShanghai&locale=zh_CN'
    );
  }

  function formatLivePrice(p) {
    const v = Number(p.basePrice);
    if (Number.isFinite(v) && v > 0) return v.toFixed(4);
    return '—';
  }

  function formatTurnover(p) {
    const v = Number(p.turnoverPct);
    if (!Number.isFinite(v)) return '';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  /** 今日看涨/看跌占比（有涨跌幅则随 turnoverPct 倾斜；否则按 id 稳定示意） */
  function upDownSplit(p) {
    const t = Number(p.turnoverPct);
    if (Number.isFinite(t)) {
      const skew = Math.max(-28, Math.min(28, t * 5.5));
      const up = Math.round(50 + skew);
      const clamped = Math.max(12, Math.min(88, up));
      return { up: clamped, down: 100 - clamped };
    }
    const n = Number(p.id) || 1;
    const up = 32 + ((n * 37) % 37);
    return { up, down: 100 - up };
  }

  function setChartForProduct(p) {
    if (!p) return;
    if (titleEl) {
      titleEl.textContent = `${p.name} · 走势`;
    }
    const t = String(p.chartSourceType || 'tradingview').toLowerCase();
    const web = String(p.chartWebsiteUrl || '').trim();
    if (t === 'website' && web) {
      iframe.src = web;
      return;
    }
    iframe.src = tvEmbedUrl(p.marketSymbol);
  }

  function renderList(list) {
    legacyRoot.innerHTML = list
      .map(function (p, idx) {
        const last = idx === list.length - 1 ? ' dc-proj-block--last' : '';
        const price = formatLivePrice(p);
        const pctStr = formatTurnover(p);
        const pctCls =
          pctStr === ''
            ? ''
            : Number(p.turnoverPct) >= 0
              ? ' dc-proj-pct is-up'
              : ' dc-proj-pct is-down';
        const split = upDownSplit(p);
        return (
          '<div class="dc-proj-block' +
          (idx === 0 ? ' is-active' : '') +
          last +
          '" data-idx="' +
          idx +
          '" role="button" tabindex="0">' +
          '<h3 class="dc-proj-title">' +
          '<span class="dc-proj-name">' +
          esc(p.name) +
          '</span>' +
          '<span class="dc-proj-live" title="行情价">' +
          esc(price) +
          '</span>' +
          (pctStr ? '<span class="' + pctCls.trim() + '">' + esc(pctStr) + '</span>' : '') +
          '</h3>' +
          '<p class="dc-proj-desc">' +
          esc(p.summary) +
          '</p>' +
          '<div class="dc-proj-ratios" aria-label="涨跌占比">' +
          '<div class="dc-ratio-head">' +
          '<span class="dc-ratio-label dc-ratio-label--up">今日看涨</span>' +
          '<span class="dc-ratio-val">' +
          split.up +
          '%</span>' +
          '</div>' +
          '<div class="dc-ratio-track2" role="presentation">' +
          '<span class="dc-ratio-fill2 dc-ratio-fill2--green" style="width:' +
          split.up +
          '%"></span>' +
          '</div>' +
          '<div class="dc-ratio-head">' +
          '<span class="dc-ratio-label dc-ratio-label--down">今日看跌</span>' +
          '<span class="dc-ratio-val">' +
          split.down +
          '%</span>' +
          '</div>' +
          '<div class="dc-ratio-track2" role="presentation">' +
          '<span class="dc-ratio-fill2 dc-ratio-fill2--red" style="width:' +
          split.down +
          '%"></span>' +
          '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    legacyRoot.querySelectorAll('.dc-proj-block').forEach(function (el) {
      function activate() {
        legacyRoot.querySelectorAll('.dc-proj-block').forEach(function (x) {
          x.classList.remove('is-active');
        });
        el.classList.add('is-active');
        const i = Number(el.getAttribute('data-idx'));
        if (Number.isFinite(i) && list[i]) setChartForProduct(list[i]);
      }
      el.addEventListener('click', activate);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    });
  }

  function showLoadError(msg) {
    if (titleEl) titleEl.textContent = msg || '加载失败';
    if (legacyRoot) {
      legacyRoot.innerHTML =
        '<p class="dc-proj-desc" style="margin:0">' + (msg ? esc(msg) : '暂无法加载产品列表，请稍后重试。') + '</p>';
    }
  }

  async function loadList() {
    let list = [];
    const proto = window.location.protocol;
    const canApi = proto === 'http:' || proto === 'https:';
    if (canApi) {
      try {
        const u = new URL('/api/products', window.location.href);
        const r = await fetch(u.toString(), { credentials: 'same-origin' });
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j) && j.length) list = j;
        }
      } catch (_) {
        /* 跨域或网络 */
      }
    }
    if (!list.length) {
      try {
        const r2 = await fetch(new URL('assets/data/grain-products-enriched.json', window.location.href).toString(), {
          cache: 'no-store',
        });
        if (r2.ok) list = await r2.json();
      } catch (_) {}
    }
    if ((!Array.isArray(list) || !list.length) && Array.isArray(window.__GRAIN_PRODUCTS_ENRICHED__)) {
      list = window.__GRAIN_PRODUCTS_ENRICHED__;
    }
    if (!Array.isArray(list) || !list.length) {
      showLoadError(null);
      return;
    }
    renderList(list);
    setChartForProduct(list[0]);
  }

  loadList();
})();
