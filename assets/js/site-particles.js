(function () {
  'use strict';

  if (window.__zlSiteParticlesStarted) return;
  window.__zlSiteParticlesStarted = true;

  var canvas = document.getElementById('zl-particle-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'zl-particle-canvas';
    canvas.className = 'zl-particle-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    if (document.body.firstChild) {
      document.body.insertBefore(canvas, document.body.firstChild);
    } else {
      document.body.appendChild(canvas);
    }
  } else if (canvas.dataset.zlParticlesReady === 'true') {
    return;
  }

  canvas.dataset.zlParticlesReady = 'true';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.display = 'block';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '2';
  canvas.style.opacity = '0.46';
  canvas.style.mixBlendMode = 'screen';
  canvas.style.contain = 'strict';

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var points = [];
  var rafId = 0;
  var mouse = { x: -9999, y: -9999 };

  function getParticleCount() {
    var area = window.innerWidth * window.innerHeight;
    var doubledCount = Math.floor(area / 7500);

    if (window.innerWidth <= 768) {
      return Math.max(72, Math.min(110, Math.floor(area / 6000)));
    }

    return Math.max(84, Math.min(220, doubledCount));
  }

  function createPoint() {
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.55,
      vy: (Math.random() - 0.5) * 0.55,
      r: 0.9 + Math.random() * 2
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var nextCount = getParticleCount();
    if (points.length > nextCount) {
      points.length = nextCount;
    }
    while (points.length < nextCount) {
      points.push(createPoint());
    }
  }

  function drawPoint(point) {
    var glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, point.r * 4.6);
    glow.addColorStop(0, 'rgba(125, 211, 252, 0.46)');
    glow.addColorStop(0.38, 'rgba(45, 212, 191, 0.18)');
    glow.addColorStop(1, 'rgba(125, 211, 252, 0)');

    ctx.beginPath();
    ctx.fillStyle = glow;
    ctx.arc(point.x, point.y, point.r * 4.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = 'rgba(186, 230, 253, 0.72)';
    ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
    ctx.fill();
  }

  function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    points.forEach(function (point, index) {
      var dx = point.x - mouse.x;
      var dy = point.y - mouse.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 130) {
        var force = (130 - dist) / 130;
        point.vx += (dx / Math.max(dist, 1)) * force * 0.04;
        point.vy += (dy / Math.max(dist, 1)) * force * 0.04;
      }

      point.x += point.vx;
      point.y += point.vy;
      point.vx *= 0.992;
      point.vy *= 0.992;

      if (point.x < 0 || point.x > window.innerWidth) point.vx *= -1;
      if (point.y < 0 || point.y > window.innerHeight) point.vy *= -1;
      point.x = Math.max(0, Math.min(window.innerWidth, point.x));
      point.y = Math.max(0, Math.min(window.innerHeight, point.y));

      drawPoint(point);

      for (var j = index + 1; j < points.length; j += 1) {
        var other = points[j];
        var lx = point.x - other.x;
        var ly = point.y - other.y;
        var lineDist = Math.sqrt(lx * lx + ly * ly);
        if (lineDist < 118) {
          ctx.strokeStyle = 'rgba(103, 232, 249, ' + (0.12 * (1 - lineDist / 118)).toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          ctx.lineTo(other.x, other.y);
          ctx.stroke();
        }
      }
    });

    rafId = requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', function (event) {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  }, { passive: true });
  window.addEventListener('pointerleave', function () {
    mouse.x = -9999;
    mouse.y = -9999;
  }, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (!document.hidden && !rafId) {
      rafId = requestAnimationFrame(tick);
    }
  });

  resize();
  rafId = requestAnimationFrame(tick);
}());
