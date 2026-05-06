/**
 * 首页首屏右下角相册：优先 `public/video` 列表 API，其次 manifest；同步全屏背景。
 */
const VIDEO_LIST_API = '/api/public/videos';
const ACTIVE_MEDIA_API = '/api/site/active-media?pageKey=home&slotKey=hero-bg';
const MANIFEST_URL = '/media-gallery-manifest.json';
const AUTO_ADVANCE_MS = 5 * 60 * 1000;

function titleFromUrl(u) {
  try {
    const seg = String(u || '').split('/').pop().split('?')[0];
    const base = decodeURIComponent(seg).replace(/\.[^.]+$/, '');
    if (!base) return '媒体';
    return base.replace(/[-_]+/g, ' ').slice(0, 48);
  } catch {
    return '媒体';
  }
}

/** API 不可用时兜底：使用当前项目实际存在的轻量优先视频，避免 /video/* 404 */
const FALLBACK_VIDEO_SLIDES = [
  '9809102-hd_720_1280_30fps.mp4',
  '12534911_1080_1920_60fps.mp4',
  '14827961_1080_1920_60fps.mp4',
  '4475800-hd_1920_1080_30fps.mp4',
].map((name) => {
  const url = 'assets/videos/' + name;
  return { url, type: 'video', title: titleFromUrl(url), caption: '' };
});

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

function normalizeSlideUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  return s.startsWith('/') || /^https?:\/\//i.test(s) ? s : s.replace(/^\.\//, '');
}

function isVideoUrl(u) {
  return /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(String(u || '').split('#')[0]);
}

/** 根路径媒体在 /steris/index.html 下须用绝对 URL，否则易请求到 /steris/pexels… 导致 404 */
function absoluteMediaUrl(u) {
  const p = normalizeSlideUrl(u);
  try {
    return new URL(p, window.location.origin).href;
  } catch {
    return p;
  }
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function loadSlides() {
  const scheduled = [];
  try {
    const res = await fetch(ACTIVE_MEDIA_API, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const item = data && data.item;
      if (item && isVideoUrl(item.videoUrl)) {
        scheduled.push({
          url: normalizeSlideUrl(item.videoUrl),
          type: 'video',
          title: item.title || '当前推荐影像',
          caption: '',
        });
      }
    }
  } catch (_) {}

  try {
    const r = await fetch(VIDEO_LIST_API, { cache: 'no-store' });
    if (r.ok) {
      const data = await r.json();
      const raw = Array.isArray(data.items) ? data.items : [];
      const slides = raw
        .filter((it) => it && it.url && isVideoUrl(normalizeSlideUrl(it.url)))
        .map((it) => ({
          url: normalizeSlideUrl(it.url),
          type: 'video',
          title: (it.title && String(it.title)) || titleFromUrl(it.url),
          caption: (it.caption && String(it.caption)) || '',
        }));
      if (slides.length) return dedupeSlidesByUrl([...slides, ...scheduled]);
    }
  } catch (e) {
    console.warn('[banner-media-carousel] video list API failed', e);
  }

  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('empty manifest');
    const slides = data.items
      .filter((it) => it && it.url && isVideoUrl(normalizeSlideUrl(it.url)))
      .map((it) => ({
        url: normalizeSlideUrl(it.url),
        type: 'video',
        title: it.title || titleFromUrl(it.url),
        caption: it.caption || '',
      }));
    if (slides.length) return dedupeSlidesByUrl([...slides, ...scheduled]);
    throw new Error('no video entries in manifest');
  } catch (_) {}

  return dedupeSlidesByUrl([...FALLBACK_VIDEO_SLIDES, ...scheduled]);
}

function buildCarousel(slides) {
  const carousel = document.getElementById('pll-carousel');
  const dots = document.getElementById('pll-dots');
  if (!carousel || !dots) return;

  carousel.innerHTML = slides
    .map((s, i) => {
      const abs = escAttr(absoluteMediaUrl(s.url));
      const media =
        s.type === 'video'
          ? `<video src="${abs}" data-pll-video muted loop playsinline preload="auto"></video>`
          : `<img src="${abs}" alt="${escAttr(s.title)}" width="640" height="400" decoding="async" fetchpriority="low" />`;
      return `
      <div class="pll-carousel-slide ${i === 0 ? 'active' : ''}" data-index="${i}" role="tabpanel" id="pll-panel-${i + 1}" aria-labelledby="pll-dot-${i + 1}" ${i !== 0 ? 'inert' : ''}>
        ${media}
        <div class="pll-slide-content">
          <h3>${escAttr(s.title)}</h3>
          ${s.caption ? `<p>${escAttr(s.caption)}</p>` : ''}
        </div>
      </div>`;
    })
    .join('');

  dots.innerHTML = slides
    .map(
      (_, i) => `
    <button type="button" role="tab" aria-label="第 ${i + 1} 张" data-index="${i}" id="pll-dot-${i + 1}" aria-controls="pll-panel-${i + 1}" aria-selected="${i === 0 ? 'true' : 'false'}" tabindex="${i === 0 ? '0' : '-1'}" class="${i === 0 ? 'active' : ''}"></button>
  `,
    )
    .join('');
}

function syncVideos(slidesEl, activeIndex) {
  const slideEls = slidesEl.querySelectorAll('.pll-carousel-slide');
  slideEls.forEach((slide, i) => {
    const v = slide.querySelector('video[data-pll-video]');
    if (!v) return;
    if (i === activeIndex) {
      v.muted = true;
      v.loop = true;
      v.autoplay = true;
      v.setAttribute('muted', 'muted');
      v.setAttribute('loop', 'loop');
      v.setAttribute('playsinline', 'playsinline');
      v.setAttribute('webkit-playsinline', 'webkit-playsinline');
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
    }
  });
}

function forceHeroAutoplay(video) {
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('muted', 'muted');
  video.setAttribute('loop', 'loop');
  video.setAttribute('autoplay', 'autoplay');
  video.setAttribute('playsinline', 'playsinline');
  video.setAttribute('webkit-playsinline', 'webkit-playsinline');
  if (video.readyState >= 2) {
    video.play().catch(() => {});
  }
}

function syncHeroBackdrop(slide) {
  const video = document.getElementById('banner-hero-video');
  const cover = document.getElementById('banner-sync-cover');
  if (!video || !cover || !slide || !slide.url) return;

  const url = absoluteMediaUrl(slide.url);
  const isImage = slide.type === 'image';

  if (isImage) {
    try {
      video.pause();
    } catch (_) {}
    video.classList.remove('is-ready');
    video.style.opacity = '0';
    cover.style.backgroundImage = '';
    cover.classList.remove('is-visible');
    return;
  }

  // 视频：若 source 未改变且已就绪，避免重复 reload 导致闪烁
  const srcEl = video.querySelector('source');
  const nextSrc = normalizeSlideUrl(slide.url);
  const currentAbs = video.currentSrc || (srcEl && srcEl.src) || '';
  const nextAbs = absoluteMediaUrl(nextSrc);
  if (currentAbs === nextAbs && video.classList.contains('is-ready')) {
    // 同一段视频，只需确保继续播放
    forceHeroAutoplay(video);
    video.play().catch(() => {});
    return;
  }

  cover.classList.remove('is-visible');
  cover.style.backgroundImage = '';
  if (srcEl) srcEl.src = nextAbs;
  video.load();
  forceHeroAutoplay(video);
  video.play().catch(() => {});
  video.classList.remove('is-ready');
  video.style.opacity = '0';

  // 清除旧的 canplay 监听器，防止堆积
  if (video._bannerCanplayHandler) {
    video.removeEventListener('canplay', video._bannerCanplayHandler);
  }
  video._bannerCanplayHandler = function () {
    video.classList.add('is-ready');
    video.style.opacity = '1';
    forceHeroAutoplay(video);
  };
  video.addEventListener('canplay', video._bannerCanplayHandler, { once: true });
}

function revealDefaultHeroVideo() {
  const video = document.getElementById('banner-hero-video');
  if (!video) return;
  forceHeroAutoplay(video);
  video.classList.add('is-ready');
  video.style.opacity = '1';
}

async function init() {
  if (!document.querySelector('.banner-home') || !document.getElementById('pll-carousel-wrap')) return;

  const slides = await loadSlides();
  if (!slides.length) {
    revealDefaultHeroVideo();
    return;
  }

  buildCarousel(slides);

  const carousel = document.getElementById('pll-carousel');
  const dotsContainer = document.getElementById('pll-dots');
  const progressBar = document.getElementById('pll-progress');
  const prevBtn = document.getElementById('pll-prev');
  const nextBtn = document.getElementById('pll-next');

  if (!carousel || !dotsContainer) {
    revealDefaultHeroVideo();
    return;
  }

  const total = slides.length;
  let current = 0;
  let autoTimer = null;
  let progressTimer = null;
  let isHovering = false;
  const heroVideo = document.getElementById('banner-hero-video');
  if (heroVideo) {
    forceHeroAutoplay(heroVideo);
    heroVideo.addEventListener('ended', () => {
      heroVideo.currentTime = 0;
      forceHeroAutoplay(heroVideo);
    });
    heroVideo.addEventListener('pause', () => {
      if (document.visibilityState !== 'hidden') {
        window.setTimeout(() => forceHeroAutoplay(heroVideo), 120);
      }
    });
  }

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
    syncHeroBackdrop(slides[current]);
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

  if (prevBtn) prevBtn.addEventListener('click', () => goTo(current - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => goTo(current + 1));

  dotsContainer.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => goTo(parseInt(btn.dataset.index, 10)));
  });

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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pauseAutoAdvance();
      carousel.querySelectorAll('video[data-pll-video]').forEach((v) => v.pause());
    } else {
      scheduleAutoAdvance();
      syncVideos(carousel, current);
      syncHeroBackdrop(slides[current]);
      forceHeroAutoplay(heroVideo);
    }
  });

  syncVideos(carousel, current);
  syncHeroBackdrop(slides[current]);
  scheduleAutoAdvance();
  window.setInterval(() => {
    if (document.visibilityState !== 'hidden') {
      syncVideos(carousel, current);
      forceHeroAutoplay(heroVideo);
    }
  }, 3000);

  setTimeout(() => {
    const v = document.getElementById('banner-hero-video');
    const cover = document.getElementById('banner-sync-cover');
    if (!v || !cover) return;
    if (!v.classList.contains('is-ready') && !cover.classList.contains('is-visible')) {
      revealDefaultHeroVideo();
    }
  }, 1200);
}

init();
