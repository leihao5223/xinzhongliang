(() => {
  const pageSet = new Set(['about.html', 'product.html', 'blog.html']);
  const fileName = (location.pathname.split('/').pop() || '').toLowerCase();
  if (!pageSet.has(fileName)) return;

  const main = document.querySelector('main');
  if (!main) return;

  // 用户要求：三个页面删除“顶栏下方、正文上方”的共享横幅区域
  main.querySelector('.banner-inner')?.remove();
  main.querySelector('.page-shared-hero')?.remove();
  document.getElementById('shared-page-hero-style')?.remove();
  document.body.classList.remove('has-shared-page-hero');
  main.style.paddingTop = '';
})();
