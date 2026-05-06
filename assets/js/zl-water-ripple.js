/**
 * 全站轻微水纹层（参考 D:\\crypto\\_template_finclix 液体位移质感，强度约 30%）
 * 使用低密度波方程近似，不引入 Three.js。
 */
(function () {
  'use strict';

  if (window.__zlWaterRippleStarted) return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.__zlWaterRippleStarted = true;
    return;
  }

  window.__zlWaterRippleStarted = true;

  var INTENSITY = 0.3;
  var DAMP = 0.988;
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

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var gw = 48;
  var gh = 28;
  var buf0 = new Float32Array(gw * gh);
  var buf1 = new Float32Array(gw * gh);
  var buf2 = new Float32Array(gw * gh);
  var img = ctx.createImageData(gw, gh);
  var frame = 0;
  var rafId = 0;
  var nextDrop = 40;

  function idx(x, y) {
    return y * gw + x;
  }

  function addDrop(ix, iy, power) {
    var r = 3;
    var p = power * INTENSITY;
    for (var dy = -r; dy <= r; dy += 1) {
      for (var dx = -r; dx <= r; dx += 1) {
        var x = ix + dx;
        var y = iy + dy;
        if (x < 1 || x >= gw - 1 || y < 1 || y >= gh - 1) continue;
        var d = Math.hypot(dx, dy);
        if (d > r) continue;
        var i = idx(x, y);
        buf1[i] += p * (1 - d / (r + 0.5));
      }
    }
  }

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
    var k = 920 * INTENSITY;
    var aScale = 55 * INTENSITY;
    var p = 0;
    for (var yy = 0; yy < gh; yy += 1) {
      for (var xx = 0; xx < gw; xx += 1) {
        i = idx(xx, yy);
        var h = buf1[i];
        var gx = buf1[Math.min(gw - 1, xx + 1) + yy * gw] - buf1[Math.max(0, xx - 1) + yy * gw];
        var gy = buf1[xx + Math.min(gh - 1, yy + 1) * gw] - buf1[xx + Math.max(0, yy - 1) * gw];
        var lite = 200 + gx * 0.14 * k + gy * 0.11 * k;
        lite = lite < 160 ? 160 : lite > 255 ? 255 : lite;
        var al = Math.min(220, Math.abs(h) * aScale + Math.min(90, (Math.abs(gx) + Math.abs(gy)) * 6 * INTENSITY));
        d[p] = lite * 0.92;
        d[p + 1] = 230 + gy * 0.04 * INTENSITY;
        d[p + 2] = 242;
        d[p + 3] = al;
        p += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function tick() {
    frame += 1;
    if (frame >= nextDrop) {
      frame = 0;
      nextDrop = 120 + Math.floor(Math.random() * 160);
      addDrop(2 + Math.floor(Math.random() * (gw - 4)), 2 + Math.floor(Math.random() * (gh - 4)), 2.2 + Math.random() * 2.4);
    }
    step();
    rafId = window.requestAnimationFrame(tick);
  }

  function resize() {
    if (window.innerWidth <= 600) {
      gw = 36;
      gh = 22;
    } else if (window.innerWidth <= 960) {
      gw = 42;
      gh = 26;
    } else {
      gw = 48;
      gh = 28;
    }
    buf0 = new Float32Array(gw * gh);
    buf1 = new Float32Array(gw * gh);
    buf2 = new Float32Array(gw * gh);
    img = ctx.createImageData(gw, gh);
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
