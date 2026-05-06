(function () {
  var TOKEN_KEYS = ['zhongliang_token', 'zl_token', 'token'];
  var USER_KEYS = ['zhongliang_user', 'zl_user', 'user'];
  var token = TOKEN_KEYS.map(function (k) { return localStorage.getItem(k); }).find(Boolean) || '';
  var user = {};
  try {
    user = JSON.parse(USER_KEYS.map(function (k) { return localStorage.getItem(k); }).find(Boolean) || '{}');
  } catch (_) {}

  function el(id) { return document.getElementById(id); }
  function money(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';
  }
  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text == null || text === '' ? '--' : String(text);
  }
  async function api(path, opt) {
    opt = opt || {};
    var headers = opt.headers || {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (opt.json) {
      headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(opt.json);
      delete opt.json;
    }
    var res = await fetch(path, { method: opt.method || 'GET', headers: headers, body: opt.body });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.message || ('请求失败 ' + res.status));
    return data;
  }
  function setMsg(id, text, err) {
    var node = el(id);
    if (!node) return;
    node.textContent = text || '';
    node.style.color = err ? '#dc2626' : '#64748b';
  }
  function renderSummary(sum) {
    setText('acc-available', money(sum.available));
    setText('acc-total', money(sum.totalAsset));
    setText('acc-pnl', money(sum.accountPnl));
    setText('acc-today-pnl', money(sum.todayPnl));
    setText('acc-credit-score', sum.creditScore == null ? 100 : sum.creditScore);
    setText('acc-payout-state', sum.hasPayoutMethod ? '已绑定提现卡' : '未绑定提现卡');
    if (user.nickname || sum.nameMask) setText('account-name', user.nickname || sum.nameMask);
  }
  function orderHtml(o) {
    var direction = o.direction === 'short' ? '买跌' : o.direction === 'long' ? '买涨' : (o.direction || '--');
    var status = o.status === 'open' ? '进行中' : '已结算';
    return '<article class="zl-live-order"><div class="zl-live-order-top"><strong>' + (o.productName || o.id) + '</strong><span>' +
      (o.createdAt ? new Date(o.createdAt).toLocaleString('zh-CN') : '--') + '</span></div><p class="zl-live-muted">' +
      '方向 ' + direction + ' · 金额 ' + money(o.amount) + ' · 盈亏 ' + money(o.profitAmount) + ' · 状态 ' + status +
      '</p></article>';
  }
  function renderOrders(rows) {
    rows = Array.isArray(rows) ? rows : [];
    var open = rows.filter(function (o) { return String(o.status || '') === 'open' || !String(o.status || '').includes('settled'); });
    var settled = rows.filter(function (o) { return String(o.status || '').includes('settled'); });
    setText('open-order-count', open.length);
    setText('settled-order-count', settled.length);
    window.__zltxOrders = rows;
  }
  function renderTx(rows) {
    window.__zltxTx = Array.isArray(rows) ? rows : [];
  }
  async function reload() {
    var sum = await api('/api/me/summary');
    renderSummary(sum);
    var orders = await api('/api/orders').catch(function () { return { list: [] }; });
    renderOrders(orders.list || []);
    var tx = await api('/api/me/transactions?limit=20').catch(function () { return { list: [] }; });
    renderTx(tx.list || []);
  }
  function activateTab(name) {
    if (name === 'home') window.location.href = 'index.html';
    else if (name === 'products') window.location.href = 'product.html';
  }
  function showFeature(name) {
    if (name === 'orders') {
      var rows = window.__zltxOrders || [];
      alert(rows.length ? rows.map(function (o) { return (o.productName || o.id) + ' · ' + money(o.amount) + ' · ' + (o.status || '--'); }).join('\n') : '暂无订单记录');
      return;
    }
    if (name === 'transactions' || name === 'deposits' || name === 'withdraws') {
      var tx = window.__zltxTx || [];
      alert(tx.length ? tx.slice(0, 20).map(function (t) { return (t.createdAt ? new Date(t.createdAt).toLocaleString('zh-CN') : '--') + ' · ' + (t.title || t.type || '资金变动'); }).join('\n') : '暂无资金明细');
      return;
    }
    if (name === 'payout') alert('请在提现流程中绑定本人名下储蓄卡。');
    else if (name === 'settings') alert('设置功能沿用旧版账户安全逻辑。');
    else if (name === 'password') window.location.href = 'forgot-login.html';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var auth = el('account-auth');
    var app = el('account-app');
    if (!app) return;
    if (!token) {
      app.style.display = 'none';
      if (auth) auth.style.display = '';
      return;
    }
    document.querySelectorAll('[data-bottom-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () { activateTab(btn.getAttribute('data-bottom-nav')); });
    });
    document.querySelectorAll('[data-open-feature]').forEach(function (btn) {
      btn.addEventListener('click', function () { showFeature(btn.getAttribute('data-open-feature')); });
    });
    el('recharge-btn')?.addEventListener('click', async function () {
      try {
        var input = window.prompt('请输入入金金额', el('money-amount') ? el('money-amount').value : '1000');
        var amount = Number(input || 0);
        var res = await api('/api/intent/recharge', { method: 'POST', json: { amount: amount } });
        setMsg('money-msg', res.message || '充值申请已提交');
        await reload();
      } catch (e) {
        setMsg('money-msg', e.message || '提交失败', true);
      }
    });
    el('withdraw-btn')?.addEventListener('click', async function () {
      try {
        var input = window.prompt('请输入出金金额', el('money-amount') ? el('money-amount').value : '1000');
        var amount = Number(input || 0);
        var res = await api('/api/intent/withdraw', { method: 'POST', json: { amount: amount } });
        setMsg('money-msg', res.message || '提现申请已提交');
        await reload();
      } catch (e) {
        setMsg('money-msg', e.message || '提交失败', true);
      }
    });
    reload().catch(function (e) {
      if (e.message && e.message.indexOf('登录') >= 0) {
        app.style.display = 'none';
        if (auth) auth.style.display = '';
      } else {
        setMsg('money-msg', e.message || '加载失败', true);
      }
    });
  });
})();
