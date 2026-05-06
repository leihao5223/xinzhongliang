(() => {
  if (!/blog\.html$/i.test(location.pathname)) return;

  const cards = Array.from(document.querySelectorAll('.card-blog'));
  if (!cards.length) return;

  const fallbackLogo = 'assets/images/zhongliang-logo-light.svg';
  const fallbackName = '中粮天下';

  cards.forEach((card) => {
    card.classList.add('blog-glass-card');
    const img = card.querySelector('.blog-image img');
    const src = img && img.getAttribute('src') ? img.getAttribute('src') : '';
    if (src) {
      card.style.setProperty('--blog-cover', `url("${src}")`);
      card.classList.add('has-cover');
      return;
    }
    card.classList.add('is-fallback');
    const fallback = document.createElement('div');
    fallback.className = 'blog-fallback-brand';
    fallback.innerHTML = `<img src="${fallbackLogo}" alt="${fallbackName}"><span>${fallbackName}</span>`;
    card.prepend(fallback);
  });

  if (document.getElementById('blog-glass-layout-style')) return;
  const style = document.createElement('style');
  style.id = 'blog-glass-layout-style';
  style.textContent = `
    .blog-glass-card{
      position: relative;
      min-height: 370px;
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid rgba(129,199,132,.35);
      box-shadow: 0 14px 40px rgba(11,27,45,.22);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }
    .blog-glass-card .blog-image{display:none}
    .blog-glass-card::before{
      content:"";
      position:absolute;
      inset:0;
      background: radial-gradient(120% 90% at 50% 0%, rgba(232,245,233,.28), rgba(15,23,42,.58));
      z-index:1;
    }
    .blog-glass-card.has-cover::after{
      content:"";
      position:absolute;
      inset:0;
      background-image: var(--blog-cover);
      background-size: cover;
      background-position: center;
      transform: scale(1.04);
      z-index:0;
    }
    .blog-glass-card .blog-content,
    .blog-glass-card .blog-footer,
    .blog-glass-card .blog-fallback-brand{
      position:relative;
      z-index:2;
    }
    .blog-glass-card .blog-link{color:#f5fbff}
    .blog-glass-card p,.blog-glass-card .blog-meta{color:rgba(234,244,255,.9)}
    .blog-fallback-brand{
      min-height: 190px;
      display:flex;
      align-items:center;
      justify-content:center;
      flex-direction:column;
      gap:.7rem;
      background: linear-gradient(135deg, rgba(6,78,59,.82), rgba(15,23,42,.88));
    }
    .blog-fallback-brand img{
      width:76px;
      height:auto;
      filter: drop-shadow(0 5px 16px rgba(0,0,0,.25));
    }
    .blog-fallback-brand span{
      color:#fff;
      font-size:1.05rem;
      letter-spacing:.18em;
      font-weight:700;
    }
  `;
  document.head.appendChild(style);
})();
