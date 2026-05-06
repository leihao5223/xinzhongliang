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
    node.style.color = err ? '#dc2626' : '#0d5c2e';
  }
  function renderSummary(sum) {
    el('acc-available').textContent = money(sum.available);
    el('acc-total').textContent = money(sum.totalAsset);
    el('acc-frozen').textContent = money(sum.frozen);
    el('acc-credit').textContent = sum.creditScore == null ? '--' : String(sum.creditScore);
  }
  function renderOrders(rows) {
    var node = el('orders-list');
    if (!node) return;
    rows = Array.isArray(rows) ? rows : [];
    node.innerHTML = rows.length ? rows.slice(0, 50).map(function (o) {
      var direction = o.direction === 'short' ? '买跌' : o.direction === 'long' ? '买涨' : (o.direction || '--');
      var status = o.status === 'open' ? '进行中' : '已结算';
      return '<div class="account-row"><strong>' + (o.productName || o.id) + '</strong><br><span>' +
        direction + ' · ' + status + ' · 金额 ' + money(o.amount) + ' · 盈亏 ' + money(o.profitAmount) +
        '</span></div>';
    }).join('') : '<div class="account-row">暂无订单</div>';
  }
  function renderTx(rows) {
    var node = el('tx-list');
    if (!node) return;
    rows = Array.isArray(rows) ? rows : [];
    node.innerHTML = rows.length ? rows.slice(0, 50).map(function (t) {
      return '<div class="account-row"><strong>' + (t.title || t.type || '资金变动') + '</strong><br><span>' +
        (t.createdAt ? new Date(t.createdAt).toLocaleString('zh-CN') : '--') + ' · 可用 ' + money(t.deltaAvailable || t.amount || 0) +
        '</span></div>';
    }).join('') : '<div class="account-row">暂无资金流水</div>';
  }
  async function reload() {
    var sum = await api('/api/me/summary');
    renderSummary(sum);
    var orders = await api('/api/orders').catch(function () { return { list: [] }; });
    renderOrders(orders.list || []);
    var tx = await api('/api/me/transactions?limit=50').catch(function () { return { list: [] }; });
    renderTx(tx.list || []);
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
    if (user.nickname) el('profile-nickname').value = user.nickname;
    if (user.phone) el('profile-phone').value = user.phone;
    if (user.realName) el('profile-realname').value = user.realName;

    el('profile-save')?.addEventListener('click', async function () {
      try {
        await api('/api/me/profile', {
          method: 'PATCH',
          json: {
            nickname: el('profile-nickname').value,
            phone: el('profile-phone').value,
            realName: el('profile-realname').value,
          },
        });
        setMsg('profile-msg', '资料已保存');
        await reload();
      } catch (e) {
        setMsg('profile-msg', e.message || '保存失败', true);
      }
    });
    el('recharge-btn')?.addEventListener('click', async function () {
      try {
        var amount = Number(el('money-amount').value || 0);
        var res = await api('/api/intent/recharge', { method: 'POST', json: { amount: amount } });
        setMsg('money-msg', res.message || '充值申请已提交');
        await reload();
      } catch (e) {
        setMsg('money-msg', e.message || '提交失败', true);
      }
    });
    el('withdraw-btn')?.addEventListener('click', async function () {
      try {
        var amount = Number(el('money-amount').value || 0);
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
        setMsg('profile-msg', e.message || '加载失败', true);
      }
    });
  });
})();
