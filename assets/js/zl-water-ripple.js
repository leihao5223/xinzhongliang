/**
 * 全局水纹：参考 crypto liquid 的“触碰激起波纹”交互；强度约为参考 WebGL 版本的 30% 量级。
 * pointer-events: none 由 CSS 控制，此处用 window 捕获触摸/点击坐标，不阻挡页面操作。
 */
(function () {
  'use strict';

  if (window.__zlWaterRippleStarted) return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.__zlWaterRippleStarted = true;
    return;
  }

  window.__zlWaterRippleStarted = true;

  /** 相对参考 liquid 约 30% 体感强度 */
  var INTENSITY = 0.32;
  var DAMP = 0.986;
  var TOUCH_POWER = 4.2;
  var AUTO_POWER = 2.4;
  var POINTER_THROTTLE_MS = 48;

  var host = document.createElement('div');
  host.className = 'zl-water-ripple-host';
  host.setAttribute('aria-hidden', 'true');
  if (document.body.firstChild) {
    document.body.insertBefore(host, document.body.firstChild);
  } else {
    document.body.appendChild(host);
  }

  var canvas = document.createElement('canvas');
  canvas.className = 'zl-water-ripple-canvas';
  host.appendChild(canvas);

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var gw = 64;
  var gh = 38;
  var buf0;
  var buf1;
  var buf2;
  var img;
  var frame = 0;
  var rafId = 0;
  var nextAuto = 80;
  var lastPtr = 0;

  function alloc() {
    buf0 = new Float32Array(gw * gh);
    buf1 = new Float32Array(gw * gh);
    buf2 = new Float32Array(gw * gh);
    img = ctx.createImageData(gw, gh);
  }

  function idx(x, y) {
    return y * gw + x;
  }

  function addDrop(ix, iy, power, radius) {
    var r = radius || 4;
    var p = power * INTENSITY;
    for (var dy = -r; dy <= r; dy += 1) {
      for (var dx = -r; dx <= r; dx += 1) {
        var x = ix + dx;
        var y = iy + dy;
        if (x < 1 || x >= gw - 1 || y < 1 || y >= gh - 1) continue;
        var d = Math.hypot(dx, dy);
        if (d > r) continue;
        var i = idx(x, y);
        buf1[i] += p * (1 - d / (r + 0.6));
      }
    }
  }

  function clientToGrid(clientX, clientY) {
    var w = window.innerWidth || 1;
    var h = window.innerHeight || 1;
    var gx = Math.round((clientX / w) * (gw - 3)) + 1;
    var gy = Math.round((clientY / h) * (gh - 3)) + 1;
    return [
      Math.max(1, Math.min(gw - 2, gx)),
      Math.max(1, Math.min(gh - 2, gy)),
    ];
  }

  function onPointer(ev) {
    var now = Date.now();
    if (ev.type === 'pointermove' && now - lastPtr < POINTER_THROTTLE_MS) return;
    lastPtr = now;
    var g = clientToGrid(ev.clientX, ev.clientY);
    var rad = ev.type === 'pointerdown' || ev.type === 'pointerup' ? 5 : 3;
    var pow = ev.type === 'pointerdown' ? TOUCH_POWER * 1.15 : TOUCH_POWER * 0.55;
    addDrop(g[0], g[1], pow, rad);
  }

  window.addEventListener('pointerdown', onPointer, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });

  function step() {
    var i;
    for (var y = 1; y < gh - 1; y += 1) {
      for (var x = 1; x < gw - 1; x += 1) {
        i = idx(x, y);
        var s = buf1[i - 1] + buf1[i + 1] + buf1[i - gw] + buf1[i + gw];
        buf2[i] = (s * 0.5 - buf0[i]) * DAMP;
      }
    }
    var tmp = buf0;
    buf0 = buf1;
    buf1 = buf2;
    buf2 = tmp;

    var d = img.data;
    var k = 620 * INTENSITY;
    var aScale = 72 * INTENSITY;
    var p = 0;
    for (var yy = 0; yy < gh; yy += 1) {
      for (var xx = 0; xx < gw; xx += 1) {
        i = idx(xx, yy);
        var h = buf1[i];
        var gx =
          buf1[Math.min(gw - 1, xx + 1) + yy * gw] - buf1[Math.max(0, xx - 1) + yy * gw];
        var gy =
          buf1[xx + Math.min(gh - 1, yy + 1) * gw] - buf1[xx + Math.max(0, yy - 1) * gw];
        var lite = 188 + gx * 0.16 * k + gy * 0.13 * k;
        lite = lite < 120 ? 120 : lite > 255 ? 255 : lite;
        var al = Math.min(
          240,
          Math.abs(h) * aScale + Math.min(120, (Math.abs(gx) + Math.abs(gy)) * 7.5 * INTENSITY),
        );
        d[p] = lite * 0.88;
        d[p + 1] = 218 + gy * 0.06 * INTENSITY;
        d[p + 2] = 248;
        d[p + 3] = al;
        p += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function tick() {
    frame += 1;
    if (frame >= nextAuto) {
      frame = 0;
      nextAuto = 140 + Math.floor(Math.random() * 200);
      addDrop(2 + Math.floor(Math.random() * (gw - 4)), 2 + Math.floor(Math.random() * (gh - 4)), AUTO_POWER, 4);
    }
    step();
    rafId = window.requestAnimationFrame(tick);
  }

  function resize() {
    var w = window.innerWidth;
    if (w <= 520) {
      gw = 52;
      gh = 30;
    } else if (w <= 900) {
      gw = 58;
      gh = 34;
    } else {
      gw = 64;
      gh = 38;
    }
    alloc();
    canvas.width = gw;
    canvas.height = gh;
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (!rafId) {
      rafId = window.requestAnimationFrame(tick);
    }
  });

  rafId = window.requestAnimationFrame(tick);
}());
