(() => {
  const pageSet = new Set(['about.html', 'product.html', 'blog.html']);
  const fileName = (location.pathname.split('/').pop() || '').toLowerCase();
  if (!pageSet.has(fileName)) return;

  const main = document.querySelector('main');
  if (!main) return;

  // 用户要求：三个页面删除“顶栏下方、正文上方”的共享横幅区域
  const oldBanner = main.querySelector('.banner-inner');
  if (oldBanner && oldBanner.parentNode) oldBanner.parentNode.removeChild(oldBanner);
  const sharedHero = main.querySelector('.page-shared-hero');
  if (sharedHero && sharedHero.parentNode) sharedHero.parentNode.removeChild(sharedHero);
  const styleNode = document.getElementById('shared-page-hero-style');
  if (styleNode && styleNode.parentNode) styleNode.parentNode.removeChild(styleNode);
  document.body.classList.remove('has-shared-page-hero');
  main.style.paddingTop = '';
})();
