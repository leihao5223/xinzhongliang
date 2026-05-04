jQuery(function ($) {
    initProjectSwiper();
    initTestimonialSwiper();
    initPartnerSwiper();
    initGallerySwiper();
});

/* =====================
   Project Swiper
===================== */
function initProjectSwiper() {
    if (!$('.swiper-project').length) return;

    new Swiper('.swiper-project', {
        loop: true,
        speed: 1000,
        slidesPerView: 1,
        spaceBetween: 20,
        autoplay: {
            delay: 3000,
            disableOnInteraction: false,
            pauseOnMouseEnter: true,
        },
        breakpoints: {
            1023: {
                slidesPerView: 2,
                spaceBetween: 20,
            }
        },
        navigation: {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
        },
        pagination: {
            el: '.swiper-pagination',
            clickable: true,
        }
    });
}

/* =====================
   Testimonial Swiper
===================== */
function initTestimonialSwiper() {
    if (!$('.swiper-testimonial').length) return;

    new Swiper('.swiper-testimonial', {
        loop: true,
        speed: 600,
        slidesPerView: 1,
        spaceBetween: 20,
        autoplay: {
            delay: 3000,
            disableOnInteraction: false,
            pauseOnMouseEnter: true,
        },
        breakpoints: {
            1200: {
                slidesPerView: 2,
                spaceBetween: 20,
            }
        },
    });
}

/* =====================
   Partner Swiper
===================== */
function initPartnerSwiper() {
    if (!$('.swiper-partner').length) return;

    new Swiper('.swiper-partner', {
        loop: true,
        speed: 600,
        slidesPerView: 2,
        spaceBetween: 20,
        autoplay: {
            delay: 3000,
            disableOnInteraction: false,
            pauseOnMouseEnter: true,
        },
        breakpoints: {
            767: {
                slidesPerView: 4,
                spaceBetween: 20,
            },
            1200: {
                slidesPerView: 5,
                spaceBetween: 20,
            }
        },
    });
}

/* =====================
   Gallery Swiper
===================== */
function initGallerySwiper() {
    if (!$('.swiper-gallery').length) return;

    new Swiper('.swiper-gallery', {
        loop: true,
        speed: 600,
        slidesPerView: 2,
        spaceBetween: 20,
        autoplay: {
            delay: 3000,
            disableOnInteraction: false,
            pauseOnMouseEnter: true,
        },
        breakpoints: {
            992: {
                slidesPerView: 4,
                spaceBetween: 20,
            },
        },
    });
}
