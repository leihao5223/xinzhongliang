/**
 * 中粮天下 - 全站高级动画系统
 * 包含：页面加载、滚动入场、视差、鼠标跟随、文字特效、粒子背景
 */
(function() {
  'use strict';

  var isLoginPage = document.body.classList.contains('login-page') ||
                    location.pathname.toLowerCase().indexOf('login') !== -1;

  // ===================== 页面加载动画（已禁用） =====================
  function initPageLoader() {
    // 用户要求删除全屏加载页，保留页面内部动态特效
    return;
  }

  // ===================== 增强滚动入场动画 =====================
  function initRevealAnimations() {
    var revealClasses = [
      '.reveal', '.reveal-up', '.reveal-down', '.reveal-left',
      '.reveal-right', '.reveal-scale', '.reveal-rotate',
      '.reveal-blur', '.reveal-flip'
    ];
    var allTargets = [];
    revealClasses.forEach(function(cls) {
      var nodes = document.querySelectorAll(cls);
      nodes.forEach(function(n) { allTargets.push(n); });
    });

    if (allTargets.length === 0) return;

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          // stagger delay based on index among siblings
          var parent = entry.target.parentElement;
          var siblings = parent ? Array.from(parent.children) : [];
          var idx = siblings.indexOf(entry.target);
          var delay = (idx >= 0 ? idx : 0) * 80;
          entry.target.style.transitionDelay = delay + 'ms';
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    allTargets.forEach(function(el) {
      observer.observe(el);
    });
  }

  // ===================== 图片自动包装Hover效果 =====================
  function initImageHoverEffects() {
    var selectors = [
      '.about-image img', '.chooseus-image img', '.team-image img',
      '.product-image img', '.blog-image img', '.case-image img',
      '.case-image-wrapper img', '.image-container img',
      '.whychooseus-image-container img', '.footer-gallery-img img'
    ];
    selectors.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(img) {
        var parent = img.parentElement;
        if (!parent || parent.classList.contains('img-reveal-wrap')) return;
        parent.classList.add('img-reveal-wrap');
      });
    });
  }

  // ===================== 卡片自动添加3D悬浮 =====================
  function initCardLift() {
    var cardSelectors = [
      '.card-product', '.card-blog', '.card-testimonial',
      '.card-team', '.card-post', '.company-overview-card',
      '.card-product-category', '.card-contact'
    ];
    cardSelectors.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(card) {
        card.classList.add('card-3d-lift');
      });
    });
  }

  // ===================== 视差滚动 =====================
  function initParallax() {
    var parallaxEls = document.querySelectorAll('[data-parallax]');
    if (parallaxEls.length === 0) return;
    var ticking = false;
    window.addEventListener('scroll', function() {
      if (!ticking) {
        requestAnimationFrame(function() {
          var scrollY = window.scrollY;
          parallaxEls.forEach(function(el) {
            var speed = parseFloat(el.dataset.parallax) || 0.3;
            var rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
              el.style.transform = 'translateY(' + (scrollY * speed) + 'px)';
            }
          });
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // ===================== 鼠标跟随光斑 =====================
  function initCursorGlow() {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    var glow = document.createElement('div');
    glow.className = 'cursor-glow';
    document.body.appendChild(glow);

    var mx = -999, my = -999, cx = -999, cy = -999;
    document.addEventListener('mousemove', function(e) {
      mx = e.clientX;
      my = e.clientY;
    });

    function animate() {
      cx += (mx - cx) * 0.08;
      cy += (my - cy) * 0.08;
      glow.style.left = cx + 'px';
      glow.style.top = cy + 'px';
      requestAnimationFrame(animate);
    }
    animate();
  }

  // ===================== 浮动背景粒子 =====================
  function initFloatingParticles() {
    var containers = document.querySelectorAll('.effect-particles-bg');
    if (containers.length === 0) {
      // 不在首页banner添加，只在特定区域
      return;
    }
    containers.forEach(function(container) {
      var count = parseInt(container.dataset.count) || 18;
      for (var i = 0; i < count; i++) {
        var p = document.createElement('div');
        p.className = 'p';
        var size = 3 + Math.random() * 8;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = (Math.random() * 100) + '%';
        p.style.animationDuration = (12 + Math.random() * 20) + 's';
        p.style.animationDelay = (Math.random() * -20) + 's';
        p.style.opacity = 0.3 + Math.random() * 0.4;
        container.appendChild(p);
      }
    });
  }

  // ===================== 文字逐字显示 =====================
  function initTextReveal() {
    document.querySelectorAll('.text-reveal-auto').forEach(function(el) {
      var text = el.textContent.trim();
      el.innerHTML = '';
      text.split('').forEach(function(char, i) {
        var span = document.createElement('span');
        span.className = 'text-reveal-word';
        span.textContent = char === ' ' ? '\u00A0' : char;
        span.style.transitionDelay = (i * 40) + 'ms';
        el.appendChild(span);
      });
      // observe
      var obs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            Array.from(entry.target.children).forEach(function(c) {
              c.classList.add('is-visible');
            });
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      obs.observe(el);
    });
  }

  // ===================== 数字计数器动画 =====================
  function initCounterAnimation() {
    document.querySelectorAll('[data-count]').forEach(function(el) {
      var target = parseInt(el.dataset.count);
      var suffix = el.dataset.suffix || '';
      var duration = 2000;
      var obs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            var start = 0;
            var startTime = null;
            function step(t) {
              if (!startTime) startTime = t;
              var progress = Math.min((t - startTime) / duration, 1);
              var ease = 1 - Math.pow(1 - progress, 3);
              var current = Math.floor(ease * target);
              el.textContent = current + suffix;
              if (progress < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });
      obs.observe(el);
    });
  }

  // ===================== 导航链接下划线动画增强 =====================
  function initNavLinkAnimations() {
    document.querySelectorAll('.nav-link').forEach(function(link) {
      link.classList.add('nav-link-animated');
    });
  }

  // ===================== 全局扫光层已禁用 =====================
  function initGlobalEffects() {
    return;
  }

  // ===================== 自动为页面元素添加reveal类 =====================
  function autoReveal() {
    // helper: skip if already has animate.css classes
    function skipAnimate(el) {
      return el.classList.contains('animate-box') || el.classList.contains('animate__animated');
    }
    // Sections
    document.querySelectorAll('section:not(.banner-inner):not(.banner-home):not(.banner-notfound)').forEach(function(el) {
      if (skipAnimate(el)) return;
      if (!el.classList.contains('reveal') && !el.classList.contains('reveal-up')) {
        el.classList.add('reveal-up');
      }
    });
    // Headings
    document.querySelectorAll('h1:not(.banner-inner-title):not(.effect-glow-text), h2, h3').forEach(function(el) {
      if (skipAnimate(el)) return;
      if (!el.closest('.reveal') && !el.closest('.reveal-up')) {
        el.classList.add('reveal-blur');
      }
    });
    // Paragraphs in content areas
    document.querySelectorAll('p:not(.banner-inner-excerpt)').forEach(function(el) {
      if (skipAnimate(el)) return;
      if (el.closest('.hero-container') || el.closest('.section')) {
        if (!el.closest('.reveal') && !el.closest('.reveal-up') && !el.closest('.reveal-blur')) {
          el.classList.add('reveal-up');
        }
      }
    });
    // Images in content
    document.querySelectorAll('.about-image, .chooseus-image, .team-image, .product-image, .blog-image, .case-image, .case-image-wrapper, .whychooseus-image-container, .image-container').forEach(function(el) {
      if (skipAnimate(el)) return;
      if (!el.classList.contains('reveal') && !el.classList.contains('reveal-scale')) {
        el.classList.add('reveal-scale');
      }
    });
    // Cards / boxes
    document.querySelectorAll('.card-product, .card-blog, .card-testimonial, .card-team, .card-post, .company-overview-card, .card-product-category, .card-contact').forEach(function(el, i) {
      if (skipAnimate(el)) return;
      if (!el.classList.contains('reveal') && !el.classList.contains('reveal-up')) {
        el.classList.add('reveal-up');
        el.style.transitionDelay = ((i % 6) * 100) + 'ms';
      }
    });
    // Lists
    document.querySelectorAll('.list-group-item, .faq-item, .sidebar-dropdown').forEach(function(el, i) {
      if (skipAnimate(el)) return;
      if (!el.classList.contains('reveal') && !el.classList.contains('reveal-left') && !el.classList.contains('reveal-right')) {
        el.classList.add(i % 2 === 0 ? 'reveal-left' : 'reveal-right');
      }
    });
    // CTA / Buttons
    document.querySelectorAll('.btn:not(.btn-glow-flow)').forEach(function(btn) {
      btn.classList.add('btn-glow-flow');
    });
  }

  // ===================== 页面内部动态装饰元素 =====================
  function initDecorations() {
    var sections = document.querySelectorAll('section:not(.banner-home):not(.banner-inner):not(.banner-notfound)');
    sections.forEach(function(sec, idx) {
      if (sec.querySelector('.deco-orbit')) return;
      var style = window.getComputedStyle(sec);
      var pos = style.position;
      if (pos === 'static') sec.style.position = 'relative';
      sec.style.overflow = 'hidden';

      // 为每第2个section添加旋转轨道装饰
      if (idx % 2 === 0) {
        var orbit = document.createElement('div');
        orbit.className = 'deco-orbit';
        orbit.style.cssText = 'width:180px;height:180px;top:-60px;right:-40px;opacity:0.6;';
        sec.appendChild(orbit);
      }
      // 为每第3个section添加脉动环
      if (idx % 3 === 0) {
        var ring = document.createElement('div');
        ring.className = 'deco-pulse-ring';
        ring.style.cssText = 'width:120px;height:120px;bottom:20px;left:10%;opacity:0.5;';
        sec.appendChild(ring);
      }
      // 为每第2个section添加波浪线
      if (idx % 2 === 1) {
        var wave = document.createElement('div');
        wave.className = 'deco-wave-line';
        wave.style.cssText = 'width:60%;top:30px;left:20%;';
        sec.appendChild(wave);
      }
      // 为第1个内容section添加动态渐变背景
      if (idx === 0) {
        var grad = document.createElement('div');
        grad.className = 'deco-gradient-bg';
        sec.appendChild(grad);
      }
    });

    // 为统计数字区域添加发光
    document.querySelectorAll('.about-stat, .stat-number, .counter-number, [data-count]').forEach(function(el) {
      el.classList.add('stat-glow');
    });

    // 为子标题圆点添加脉动
    document.querySelectorAll('.sub-heading .fa-circle, .badge, .tag').forEach(function(el) {
      el.classList.add('badge-pulse');
    });
  }

  // ===================== 数据对比表格 + 条形图渐入动画 =====================
  function initDataComparison() {
    var cards = document.querySelectorAll('.data-comparison-card.dc-glass-trio');
    if (!cards.length) {
      cards = document.querySelectorAll('.data-comparison-card');
    }
    if (!cards.length) return;

    cards.forEach(function(card) {
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            card.classList.add('is-visible');

            var rows = card.querySelectorAll('.comparison-table tbody tr');
            rows.forEach(function(row, i) {
              setTimeout(function() {
                row.classList.add('is-visible');
              }, 300 + i * 120);
            });

            var items = card.querySelectorAll('.chart-item');
            items.forEach(function(item, i) {
              setTimeout(function() {
                item.classList.add('is-visible');
                var bar = item.querySelector('.chart-bar');
                var target = item.dataset.bar || '0';
                if (bar) bar.style.width = target + '%';
              }, 500 + i * 150);
            });

            observer.unobserve(card);
          }
        });
      }, { threshold: 0.15 });

      observer.observe(card);
    });
  }

  // ===================== 页面转场效果 =====================
  function initPageTransition() {
    if (isLoginPage) return;
    var transition = document.createElement('div');
    transition.className = 'page-transition';
    document.body.appendChild(transition);

    document.querySelectorAll('a[href]').forEach(function(link) {
      var href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel')) return;
      if (href.endsWith('.pdf') || href.endsWith('.zip')) return;

      link.addEventListener('click', function(e) {
        // skip if ctrl/cmd click
        if (e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        transition.classList.add('is-active');
        setTimeout(function() {
          window.location.href = href;
        }, 400);
      });
    });
  }

  // ===================== 初始化 =====================
  function boot() {
    initPageLoader();
    initGlobalEffects();
    initCursorGlow();
    initFloatingParticles();
    initNavLinkAnimations();

    // DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        autoReveal();
        initDecorations();
        initRevealAnimations();
        initImageHoverEffects();
        initCardLift();
        initParallax();
        initTextReveal();
        initCounterAnimation();
        initDataComparison();
        initPageTransition();
      });
    } else {
      autoReveal();
      initDecorations();
      initRevealAnimations();
      initImageHoverEffects();
      initCardLift();
      initParallax();
      initTextReveal();
      initCounterAnimation();
      initDataComparison();
      initPageTransition();
    }
  }

  boot();
})();
