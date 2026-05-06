(function () {
  function absoluteUrl(url) {
    var s = String(url || '').trim();
    if (!s) return '';
    try {
      return new URL(s, window.location.origin).href;
    } catch (_) {
      return s;
    }
  }

  function applyVideo(video, item) {
    if (!video || !item || !item.videoUrl) return;
    var next = absoluteUrl(item.videoUrl);
    if (!next) return;
    var current = video.currentSrc || video.getAttribute('src') || '';
    var source = video.querySelector('source');
    if (source && source.src !== next) source.src = next;
    else if (!source && current !== next) video.src = next;
    if (item.posterUrl) video.setAttribute('poster', absoluteUrl(item.posterUrl));
    if (current !== next) video.load();
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.autoplay = true;
    video.setAttribute('muted', 'muted');
    video.setAttribute('loop', 'loop');
    video.setAttribute('autoplay', 'autoplay');
    video.setAttribute('playsinline', 'playsinline');
    video.setAttribute('webkit-playsinline', 'webkit-playsinline');
    video.addEventListener('ended', function () {
      video.currentTime = 0;
      var replay = video.play && video.play();
      if (replay && typeof replay.catch === 'function') replay.catch(function () {});
    });
    var p = video.play && video.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }

  async function hydrateScheduledVideo(video, pageKey, slotKey) {
    try {
      var qs = new URLSearchParams({ pageKey: pageKey, slotKey: slotKey });
      var res = await fetch('/api/site/active-media?' + qs.toString(), { cache: 'no-store' });
      if (!res.ok) return;
      var data = await res.json();
      if (data && data.item) applyVideo(video, data.item);
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('video[data-media-page][data-media-slot]').forEach(function (video) {
      hydrateScheduledVideo(video, video.getAttribute('data-media-page'), video.getAttribute('data-media-slot'));
    });
  });
})();
