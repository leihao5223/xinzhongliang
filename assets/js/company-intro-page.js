(() => {
  const main = document.querySelector('main');
  if (!main || !/about\.html$/i.test(location.pathname)) return;

  function fmtDate(date) {
    return new Date(date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  function monthBack(base, n) {
    const d = new Date(base);
    d.setMonth(d.getMonth() - n);
    return d;
  }

  const now = new Date();
  const realtimeTopics = [
    '全球粮源调度', '港口仓储联动', '油脂加工升级', '玉米深加工链路', '供应链金融协同',
    '食品安全追溯', '数字风控中台', '进口采购窗口', '产销平衡策略', '绿色低碳工厂',
  ];

  const fallbackRealtime = Array.from({ length: 100 }).map((_, i) => {
    const issue = i + 1;
    const topic = realtimeTopics[i % realtimeTopics.length];
    const date = monthBack(now, Math.floor(i * 0.75));
    return {
      id: `rt-${issue}`,
      title: `${topic}周报第${issue}期`,
      date: fmtDate(date),
      excerpt: '该资讯用于首页与公司介绍联动展示，正文由后台编辑后即时发布。当前为占位内容，便于你后续替换成真实稿件。',
    };
  });

  const fallbackFuture = Array.from({ length: 10 }).map((_, i) => {
    const idx = i + 1;
    return {
      id: `fw-${idx}`,
      title: `展望未来：产业升级路线图 ${idx}`,
      date: fmtDate(monthBack(now, i + 2)),
      excerpt: `围绕“稳粮源、强加工、优渠道、重风控”四条主线，规划未来 12~24 个月的落地节奏，持续提升全链路效率与韧性。`,
    };
  });

  const fallbackNotices = [
    { title: '系统维护通知：交易中心夜间升级', date: '2026-04-26', excerpt: '预计维护 23:30-00:30，期间部分查询接口可能延迟，交易结算不受影响。' },
    { title: '活动公告：五一节客户回馈礼包', date: '2026-04-20', excerpt: '登录并完成风险测评可领取活动礼包，详情以活动页规则为准。' },
    { title: '温馨提示：节假日期间审核时效调整', date: '2026-04-15', excerpt: '充值提现审核时段略有调整，请提前安排资金计划。' },
    { title: '风险提示：谨防非官方渠道诈骗', date: '2026-04-11', excerpt: '请仅通过本平台官方客服与公告渠道获取信息，勿向陌生账户转账。' },
    { title: '系统公告：行情服务节点扩容完成', date: '2026-04-03', excerpt: '行情推送稳定性与高峰时段响应已完成优化。' },
    { title: '活动通知：季度客户调研计划启动', date: '2026-03-29', excerpt: '欢迎反馈使用建议，优先改进交易与个人中心体验。' },
  ];

  function card(item) {
    return `
      <article class="ci-card">
        <header>
          <h3>${item.title}</h3>
          <time>${item.date}</time>
        </header>
        <p>${item.excerpt}</p>
      </article>
    `;
  }

  main.innerHTML = `
    <section class="ci-shell">
      <div class="hero-container">
        <div class="ci-head">
          <div class="sub-heading justify-content-center"><i class="fa-solid fa-circle"></i><h4 class="accent-color">公司介绍</h4></div>
          <h1>公司介绍与文章中心</h1>
          <p>分为实时资讯、展望未来、公告详情三类；均采用玻璃拟态分区，方便后续在后台持续维护与发布。</p>
        </div>
        <div class="ci-tabs">
          <button class="ci-tab is-active" data-tab="realtime">实时资讯（100）</button>
          <button class="ci-tab" data-tab="future">展望未来（10）</button>
          <button class="ci-tab" data-tab="notice">公告详情</button>
        </div>
        <div class="ci-panel is-active" data-panel="realtime">
          <div class="ci-grid ci-grid--long" id="ci-realtime"></div>
        </div>
        <div class="ci-panel" data-panel="future">
          <div class="ci-grid" id="ci-future"></div>
        </div>
        <div class="ci-panel" data-panel="notice">
          <div class="ci-grid" id="ci-notice"></div>
        </div>
      </div>
    </section>
  `;

  const style = document.createElement('style');
  style.textContent = `
  .ci-shell{padding:4rem 0;background:#ffffff}
  .ci-head{text-align:center;margin-bottom:1.2rem}
  .ci-head h1{color:#1a1a1a;font-size:2rem;margin:.8rem 0}
  .ci-head p{color:#555555;max-width:760px;margin:0 auto}
  .ci-tabs{display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center;margin:1.3rem 0 1.5rem}
  .ci-tab{border:1px solid rgba(0,0,0,.15);background:#f0f0f0;color:#333333;padding:.45rem .95rem;border-radius:999px}
  .ci-tab.is-active{background:linear-gradient(135deg,#0d5c2e,#1a7a3e,#2ecc71);border-color:rgba(200,255,220,.45);color:#fff}
  .ci-panel{display:none}.ci-panel.is-active{display:block}
  .ci-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:.9rem}
  .ci-grid--long{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
  .ci-card{background:rgba(232,245,233,.88);border:1px solid rgba(129,199,132,.35);border-radius:14px;padding:1rem;box-shadow:0 2px 8px rgba(0,0,0,.04)}
  @media(min-width:769px){.ci-card{backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}}
  .ci-card h3{font-size:1rem;color:#1a1a1a;margin:0 0 .35rem}
  .ci-card time{font-size:.75rem;color:#888888}
  .ci-card p{font-size:.86rem;color:#555555;margin:.65rem 0 0;line-height:1.6}
  .ci-card header{display:flex;justify-content:space-between;gap:.6rem}
  `;
  document.head.appendChild(style);

  document.querySelectorAll('.ci-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const key = tab.getAttribute('data-tab');
      document.querySelectorAll('.ci-tab').forEach((x) => x.classList.remove('is-active'));
      document.querySelectorAll('.ci-panel').forEach((x) => x.classList.remove('is-active'));
      tab.classList.add('is-active');
      document.querySelector(`.ci-panel[data-panel="${key}"]`)?.classList.add('is-active');
    });
  });

  function renderSections(source) {
    const rt = (source && Array.isArray(source.realtime) ? source.realtime : fallbackRealtime).map((x) => ({
      title: x.title,
      date: fmtDate(x.publishedAt || x.date || Date.now()),
      excerpt: x.body || x.excerpt || '',
    }));
    const fw = (source && Array.isArray(source.future) ? source.future : fallbackFuture).map((x) => ({
      title: x.title,
      date: fmtDate(x.publishedAt || x.date || Date.now()),
      excerpt: x.body || x.excerpt || '',
    }));
    const nt = (source && Array.isArray(source.notices) ? source.notices : fallbackNotices).map((x) => ({
      title: x.title,
      date: fmtDate(x.publishedAt || x.date || Date.now()),
      excerpt: x.body || x.excerpt || '',
    }));
    document.getElementById('ci-realtime').innerHTML = rt.map(card).join('');
    document.getElementById('ci-future').innerHTML = fw.map(card).join('');
    document.getElementById('ci-notice').innerHTML = nt.map(card).join('');
  }

  renderSections();
  fetch('/api/site/company-content')
    .then((r) => r.json())
    .then((j) => { if (j && j.success && j.data) renderSections(j.data); })
    .catch(() => {});
})();
