jQuery(function ($) {

    function buildVideoSrc(rawUrl) {
        var u = String(rawUrl || '').trim();
        if (!u) return '';
        // 本地HTML广告页直接返回，不追加视频autoplay参数
        if (/\.html?$/i.test(u)) return u;
        if (/[?&]autoplay=/i.test(u) || /[?&]auto=1/i.test(u)) return u;
        return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'autoplay=1';
    }

    function isHtmlPageUrl(rawUrl) {
        return /\.html?(\?.*)?$/i.test(String(rawUrl || '').trim());
    }

    function setFrameHtml($frame, html) {
        if (!$frame || !$frame.length) return;
        $frame.attr('src', 'about:blank');
        $frame.attr('srcdoc', html || '');
    }

    async function openHtmlInModal($frame, pageUrl) {
        var u = String(pageUrl || '').trim();
        if (!u) return;
        try {
            var res = await fetch(u, { cache: 'no-store' });
            if (!res.ok) throw new Error('load-failed');
            var html = await res.text();
            setFrameHtml($frame, html);
        } catch (e) {
            setFrameHtml(
                $frame,
                '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:Arial,Microsoft YaHei,sans-serif;"><div>广告页面加载失败，请稍后重试。</div></body></html>'
            );
        }
    }

    $(document).on('click', '.request-loader', function () {
        var videoUrl = $(this).data('video');
        var $overlay = $('#modal-overlay');
        var $videoFrame = $('#my-video-frame');

        if (!videoUrl) return;

        $overlay.css('display', 'flex');
        if (isHtmlPageUrl(videoUrl)) {
            openHtmlInModal($videoFrame, String(videoUrl));
            return;
        }
        $videoFrame.removeAttr('srcdoc');
        $videoFrame.attr('src', buildVideoSrc(videoUrl));
    });

    $(document).on('click', '.my-close', function () {
        closeVideoModal();
    });

    $(document).on('click', '#modal-overlay', function (e) {
        if (e.target === this) {
            closeVideoModal();
        }
    });

    function closeVideoModal() {
        var $overlay = $('#modal-overlay');
        var $videoFrame = $('#my-video-frame');

        $overlay.hide();
        $videoFrame.removeAttr('srcdoc');
        $videoFrame.attr('src', '');
    }

});
