jQuery(function ($) {
    initAnimate();
    initSidebar();
    initSidebarDropdown();
    initUnifiedTopNav();
    initMobileVideoAutoplay();
    initNavLink();
    initCounterCount();
    initHeaderScroll();
});

/* =====================
   Animate on Scroll �������أ�https://www.bootstrapmb.com 
===================== */
function initAnimate() {
    var $elements = $('[data-animate]');

    var observer = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                var $el = $(entry.target);
                var delay = $el.attr('data-delay') || 0;

                setTimeout(function () {
                    $el.addClass($el.attr('data-animate'));
                    $el.css('opacity', 1);
                    observer.unobserve(entry.target);
                }, delay);
            }
        });
    }, { threshold: 0.1 });

    $elements.each(function () {
        observer.observe(this);
    });
}

/* =====================
   Sidebar
===================== */
function initSidebar() {
    $(document).on('click', '.nav-btn', function () {
        $('.sidebar-overlay').addClass('active');
        setTimeout(function () {
            $('.sidebar').addClass('active');
        }, 200);
    });

    $(document).on('click', '.close-btn, .sidebar-overlay', function () {
        $('.sidebar').removeClass('active');
        setTimeout(function () {
            $('.sidebar-overlay').removeClass('active');
        }, 200);
    });
}

/* =====================
   Sidebar Dropdown
===================== */
function initSidebarDropdown() {
    $(document).on('click', '.sidebar-dropdown-btn', function () {
        var $dropdownMenu = $(this)
            .parent()
            .next('.sidebar-dropdown-menu');

        var isOpen = $dropdownMenu.hasClass('active');

        $('.sidebar-dropdown-menu').not($dropdownMenu).removeClass('active');
        $dropdownMenu.toggleClass('active', !isOpen);
    });
}

/* =====================
   Unified Top Nav (no dropdown)
===================== */
function initUnifiedTopNav() {
    var directLinkMap = {
        '交易中心': 'product.html',
        '资讯': 'blog.html',
        '个人主页': 'personal-home.html'
    };
    var homeUrl = '/';

    $('.navbar-nav .nav-link').each(function () {
        var $link = $(this);
        var label = $.trim($link.text()).replace(/\s+/g, ' ');
        if (label === '首页') {
            $link.attr('href', homeUrl);
        }
    });

    $('.menu > li > a').each(function () {
        var $link = $(this);
        var label = $.trim($link.text()).replace(/\s+/g, ' ');
        if (label === '首页') {
            $link.attr('href', homeUrl);
        }
    });

    $('.navbar-nav .dropdown').each(function () {
        var $dropdown = $(this);
        var $toggle = $dropdown.find('> .nav-link.dropdown-toggle');
        if (!$toggle.length) return;

        var label = $.trim($toggle.text()).replace(/\s+/g, ' ');
        var href = directLinkMap[label];
        if (!href) return;

        $toggle
            .attr('href', href)
            .removeAttr('data-bs-toggle')
            .removeAttr('role')
            .removeAttr('aria-expanded')
            .removeClass('dropdown-toggle');

        $toggle.find('.fa-angle-down, .fa-chevron-down').remove();
        $dropdown.find('> .dropdown-menu').remove();
        $dropdown.removeClass('dropdown');
    });

    $('.menu .sidebar-dropdown').each(function () {
        var $group = $(this);
        var $header = $group.find('> .dropdown-header');
        var $anchor = $header.find('a').first();
        if (!$anchor.length) return;

        var label = $.trim($anchor.text()).replace(/\s+/g, ' ');
        var href = directLinkMap[label];
        if (!href) return;

        $anchor.attr('href', href);
        $group.find('> .sidebar-dropdown-menu').remove();
        $group.find('> .dropdown-header .sidebar-dropdown-btn').remove();
        $group.removeClass('sidebar-dropdown');
        $header.replaceWith($anchor);
    });
}

/* =====================
   Mobile Video Autoplay
===================== */
function initMobileVideoAutoplay() {
    var videos = Array.prototype.slice.call(
        document.querySelectorAll('video[autoplay][muted], video[autoplay][playsinline]')
    );
    if (!videos.length) return;

    function tryPlayAll() {
        videos.forEach(function (v) {
            try {
                v.muted = true;
                v.setAttribute('muted', 'muted');
                var p = v.play && v.play();
                if (p && typeof p.catch === 'function') p.catch(function () {});
            } catch (_) {}
        });
    }

    tryPlayAll();
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) tryPlayAll();
    });
    document.addEventListener('touchstart', tryPlayAll, { passive: true });
    document.addEventListener('click', tryPlayAll, { passive: true });
}

/* =====================
   Counter
===================== */
function initCounterCount() {
    var $counters = $('.counter');

    function formatCount(num) {
        if (num >= 1000000)
            return (num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1) + 'M';
        if (num >= 1000)
            return (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + 'K';
        return num;
    }

    function updateCount($counter) {
        var target = $counter.data('target');
        var current = $counter.data('current') || 0;

        var duration = 1500;
        var steps = 30;
        var increment = Math.max(1, Math.ceil(target / steps));

        var nextCount = Math.min(target, current + increment);
        $counter.data('current', nextCount);
        $counter.text(formatCount(nextCount));

        if (nextCount < target) {
            setTimeout(function () {
                updateCount($counter);
            }, duration / steps);
        }
    }

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting && !$(entry.target).data('counted')) {
                var $counter = $(entry.target);
                $counter.data('counted', true);
                updateCount($counter);
            }
        });
    }, { threshold: 0.5 });

    $counters.each(function () {
        $(this).data({
            counted: false,
            current: 0
        });
        observer.observe(this);
    });
}

/* =====================
   Active Nav Link
===================== */
function initNavLink() {
    var currentUrl = window.location.href;

    $('.navbar-nav .nav-link').each(function () {
        if (this.href === currentUrl) {
            $(this).addClass('active');
        }
    });

    $('.navbar-nav .dropdown-menu .dropdown-item').each(function () {
        if (this.href === currentUrl) {
            $(this)
                .addClass('active')
                .closest('.dropdown')
                .find('.nav-link.dropdown-toggle')
                .addClass('active');
        }
    });
}

/* =====================
   Header Scroll
===================== */
function initHeaderScroll() {
    var $header = $('.header-container');
    var scrollThreshold = 50;

    function handleScroll() {
        $header.toggleClass('scrolled', $(window).scrollTop() > scrollThreshold);
    }

    handleScroll();
    $(window).on('scroll', handleScroll);
}