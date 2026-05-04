/**
 * 首页「全球港口与物流」嵌入：圆角卡片轮播相册
 * 5秒自动切换，支持图片与视频，进度条指示
 */

const MANIFEST_URL = '/media-gallery-manifest.json';
const AUTO_ADVANCE_MS = 5000;

/* 公共目录下媒体（与 manifest 一致、URL 互不重复） */
const FALLBACK_SLIDES = [
  { url: '/14595493_1920_1080_30fps.mp4', type: 'video', title: '全球港口枢纽', caption: '集装箱码头与多式联运协同作业。' },
  { url: '/4460023-hd_1920_1080_30fps.mp4', type: 'video', title: '田园与供应链', caption: '产地资源与港口网络无缝衔接。' },
  { url: '/4475800-hd_1920_1080_30fps.mp4', type: 'video', title: '储备与中转', caption: '粮仓与物流节点一体化调度。' },
  { url: '/5538178-uhd_4096_2160_25fps.mp4', type: 'video', title: '智慧物流网络', caption: '海内外贸易网络协同，提升交付效率。' },
  { url: '/pexels-14864945-29496200.jpg', type: 'image', title: '绿色生态田园', caption: '可持续农业与优质粮源基地。' },
  { url: '/pexels-cheng-shi-song-427082720-30011537.jpg', type: 'image', title: '现代化仓储', caption: '高标准粮仓与智能温湿控制。' },
  { url: '/pexels-jaqor-34439490.jpg', type: 'image', title: '丰收的季节', caption: '金色麦田与全产业链守护。' },
  { url: '/pexels-lywin-55237728-33148689.jpg', type: 'image', title: '田间到餐桌', caption: '从广袤田野到万家灯火的品质承诺。' },
  { url: '/pexels-pojianechu-285180919-13375797.jpg', type: 'image', title: '科技创新驱动', caption: '生物科技与绿色低碳转型升级。' },
  { url: '/12534911_1080_1920_60fps.mp4', type: 'video', title: '垂直农业探索', caption: '创新种植模式与高效产能实践。' },
  { url: '/12583636_2160_3840_30fps.mp4', type: 'video', title: '精细加工产线', caption: '油脂与食品加工全自动化流程。' },
  { url: '/5538176-uhd_2160_4096_25fps.mp4', type: 'video', title: '港口全景航拍', caption: '俯瞰全球贸易大通道的繁忙景象。' },
];

function titleFromUrl(u) {
  try {
    const seg = String(u || '').split('/').pop().split('?')[0];
    const base = seg.replace(/\.[^.]+$/, '');
    if (!base) return '媒体';
    return base.replace(/[-_]+/g, ' ').slice(0, 48);
  } catch {
    return '媒体';
  }
}

function dedupeSlidesByUrl(slides) {
  const seen = new Set();
  return slides.filter((s) => {
    const k = String(s.url || '')
      .split('?')[0]
      .toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function notifyParentBanner(slide) {
  if (!slide || !slide.url) return;
  try {
    if (!window.parent || window.parent === window) return;
    const target = window.location.origin || '*';
    window.parent.postMessage(
      {
        channel: 'zhongliang-banner-sync',
        url: slide.url,
        type: slide.type === 'image' ? 'image' : 'video',
      },
      target
    );
  } catch (_) {
    /* ignore */
  }
}

function normalizeSlideUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  return s.startsWith('/') ? s : '/' + s.replace(/^\.\//, '');
}

/** 整段嵌入区大背景与当前幻灯片一致（图片 / 视频） */
function syncShellBackdrop(slide) {
  const video = document.getElementById('pll-bg-video');
  const source = document.getElementById('pll-bg-source');
  const imgEl = document.getElementById('pll-bg-image');
  if (!video || !source || !imgEl || !slide || !slide.url) return;
  const path = normalizeSlideUrl(slide.url);

  if (slide.type === 'image') {
    try {
      video.pause();
    } catch (_) {}
    video.classList.add('pll-bg-video--hidden');
    let abs;
    try {
      abs = new URL(path, window.location.origin).href;
    } catch {
      abs = path;
    }
    imgEl.style.backgroundImage = 'url(' + JSON.stringify(abs) + ')';
    imgEl.hidden = false;
    imgEl.classList.add('is-visible');
    return;
  }

  imgEl.classList.remove('is-visible');
  imgEl.hidden = true;
  imgEl.style.backgroundImage = '';
  video.classList.remove('pll-bg-video--hidden');
  source.src = path;
  video.load();
  video.muted = true;
  video.play().catch(() => {});
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function loadSlidesFromManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('empty manifest');
    return dedupeSlidesByUrl(
      data.items.map((it) => ({
        url: it.url,
        type: it.type === 'video' ? 'video' : 'image',
        title: it.title || titleFromUrl(it.url),
        caption: it.caption || '',
      })),
    );
  } catch (e) {
    console.warn('[port-logistics-overlap] manifest load failed, using fallback', e);
    return dedupeSlidesByUrl(FALLBACK_SLIDES);
  }
}

function buildCarousel(slides) {
  const carousel = document.getElementById('pll-carousel');
  const dots = document.getElementById('pll-dots');
  if (!carousel || !dots) return;

  carousel.innerHTML = slides.map((s, i) => {
    const media = s.type === 'video'
      ? `<video src="${escAttr(s.url)}" data-pll-video muted playsinline loop preload="metadata"></video>`
      : `<img src="${escAttr(s.url)}" alt="${escAttr(s.title)}" loading="lazy" decoding="async" />`;
    return `
      <div class="pll-carousel-slide ${i === 0 ? 'active' : ''}" data-index="${i}" role="tabpanel" id="pll-panel-${i + 1}" aria-labelledby="pll-dot-${i + 1}" ${i !== 0 ? 'inert' : ''}>
        ${media}
        <div class="pll-slide-content">
          <h3>${escAttr(s.title)}</h3>
          ${s.caption ? `<p>${escAttr(s.caption)}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');

  dots.innerHTML = slides.map((_, i) => `
    <button type="button" role="tab" aria-label="第 ${i + 1} 张" data-index="${i}" id="pll-dot-${i + 1}" aria-controls="pll-panel-${i + 1}" aria-selected="${i === 0 ? 'true' : 'false'}" tabindex="${i === 0 ? '0' : '-1'}" class="${i === 0 ? 'active' : ''}"></button>
  `).join('');
}

function syncVideos(slidesEl, activeIndex) {
  const slideEls = slidesEl.querySelectorAll('.pll-carousel-slide');
  slideEls.forEach((slide, i) => {
    const v = slide.querySelector('video[data-pll-video]');
    if (!v) return;
    if (i === activeIndex) {
      v.muted = true;
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
    }
  });
}

async function init() {
  const slides = await loadSlidesFromManifest();
  if (!slides.length) return;
  buildCarousel(slides);

  const carousel = document.getElementById('pll-carousel');
  const dotsContainer = document.getElementById('pll-dots');
  const progressBar = document.getElementById('pll-progress');
  const prevBtn = document.getElementById('pll-prev');
  const nextBtn = document.getElementById('pll-next');

  if (!carousel || !dotsContainer) return;

  const total = slides.length;
  let current = 0;
  let autoTimer = null;
  let progressTimer = null;
  let isHovering = false;

  function goTo(index) {
    const slideEls = carousel.querySelectorAll('.pll-carousel-slide');
    const dotEls = dotsContainer.querySelectorAll('button');
    if (!slideEls.length) return;

    slideEls[current].classList.remove('active');
    dotEls[current].classList.remove('active');
    dotEls[current].setAttribute('aria-selected', 'false');
    dotEls[current].setAttribute('tabindex', '-1');
    slideEls[current].setAttribute('inert', '');

    current = (index + total) % total;

    slideEls[current].classList.add('active');
    dotEls[current].classList.add('active');
    dotEls[current].setAttribute('aria-selected', 'true');
    dotEls[current].setAttribute('tabindex', '0');
    slideEls[current].removeAttribute('inert');

    syncVideos(carousel, current);
    syncShellBackdrop(slides[current]);
    notifyParentBanner(slides[current]);
    scheduleAutoAdvance();
  }

  function scheduleAutoAdvance() {
    clearTimeout(autoTimer);
    clearInterval(progressTimer);
    if (progressBar) progressBar.style.width = '0%';

    if (isHovering) return;

    const start = performance.now();
    progressTimer = setInterval(() => {
      const elapsed = performance.now() - start;
      const pct = Math.min(100, (elapsed / AUTO_ADVANCE_MS) * 100);
      if (progressBar) progressBar.style.width = pct + '%';
    }, 50);

    autoTimer = setTimeout(() => {
      autoTimer = null;
      goTo(current + 1);
    }, AUTO_ADVANCE_MS);
  }

  function pauseAutoAdvance() {
    clearTimeout(autoTimer);
    clearInterval(progressTimer);
    if (progressBar) progressBar.style.width = '0%';
  }

  /* 事件绑定 */
  if (prevBtn) prevBtn.addEventListener('click', () => goTo(current - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => goTo(current + 1));

  dotsContainer.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => goTo(parseInt(btn.dataset.index, 10)));
  });

  /* 键盘导航 */
  dotsContainer.addEventListener('keydown', (e) => {
    const dots = Array.from(dotsContainer.querySelectorAll('button'));
    const idx = dots.findIndex((d) => d.getAttribute('aria-selected') === 'true');
    let newIdx = idx;
    if (e.key === 'ArrowLeft') newIdx = idx - 1 < 0 ? total - 1 : idx - 1;
    else if (e.key === 'ArrowRight') newIdx = idx + 1 >= total ? 0 : idx + 1;
    else if (e.key === 'Home') newIdx = 0;
    else if (e.key === 'End') newIdx = total - 1;
    else return;
    e.preventDefault();
    goTo(newIdx);
    dots[newIdx].focus();
  });

  /* 鼠标悬停暂停 */
  const wrap = document.getElementById('pll-carousel-wrap');
  if (wrap) {
    wrap.addEventListener('mouseenter', () => {
      isHovering = true;
      pauseAutoAdvance();
    });
    wrap.addEventListener('mouseleave', () => {
      isHovering = false;
      scheduleAutoAdvance();
    });
  }

  /* 页面可见性 */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pauseAutoAdvance();
      carousel.querySelectorAll('video[data-pll-video]').forEach((v) => v.pause());
    } else {
      scheduleAutoAdvance();
      syncVideos(carousel, current);
      syncShellBackdrop(slides[current]);
    }
  });

  /* 启动：嵌入区大背景 + 父页首屏与当前张一致 */
  syncVideos(carousel, current);
  syncShellBackdrop(slides[current]);
  notifyParentBanner(slides[current]);
  scheduleAutoAdvance();
}

init();
