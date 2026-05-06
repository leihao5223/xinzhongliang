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
  canvas.style.opacity = '0.78';
  canvas.style.mixBlendMode = 'screen';
  canvas.style.contain = 'strict';

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var points = [];
  var rafId = 0;
  var mouse = { x: -9999, y: -9999, isDown: false };
  var timeAcc = 0;

  var cfg = {
    cohesionRadius: 108,
    separationRadius: 30,
    alignmentRadius: 92,
    predatorRadius: 150,
    cohesionWeight: 0.62,
    separationWeight: 1.05,
    alignmentWeight: 0.72,
    predatorWeight: 1.85,
    boundaryMargin: 72,
    boundaryForce: 0.68,
    maxSpeed: 2.9,
    maxForce: 0.12,
    minCruiseSpeed: 0.32,
    wanderForce: 0.055,
    trailLength: 12
  };
  var palette = ['#e3e9f2', '#cfdbe9', '#f4f7fc', '#7fd9b5', '#6bc8ff', '#89e0c0'];

  function getParticleCount() {
    var area = window.innerWidth * window.innerHeight;
    var doubledCount = Math.floor(area / 5200);

    if (window.innerWidth <= 768) {
      return Math.max(105, Math.min(165, Math.floor(area / 3900)));
    }

    return Math.max(150, Math.min(360, doubledCount));
  }

  function limitVector(vx, vy, max) {
    var mag = Math.hypot(vx, vy);
    if (mag > max && mag > 0) return [(vx / mag) * max, (vy / mag) * max];
    return [vx, vy];
  }

  function sampleActivity() {
    var roll = Math.random();
    if (roll < 0.82) {
      return 0.3 + ((Math.random() + Math.random()) / 2) * 0.4;
    }
    if (roll < 0.91) {
      return 0.02 + Math.random() * 0.28;
    }
    return 0.7 + Math.random() * 0.3;
  }

  function createPoint() {
    var activity = sampleActivity();
    var angle = Math.random() * Math.PI * 2;
    var startSpeed = 0.38 + activity * 0.92;

    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: Math.cos(angle) * startSpeed,
      vy: Math.sin(angle) * startSpeed,
      r: 1.6 + Math.random() * 3.2,
      color: palette[Math.floor(Math.random() * palette.length)],
      trail: [],
      activity: activity,
      phase: Math.random() * Math.PI * 2,
      maxSpeed: 1.25 + activity * 2.25,
      minSpeed: cfg.minCruiseSpeed + activity * 0.42,
      wander: 0.72 + activity * 1.28,
      reaction: 0.62 + activity * 1.18,
      glow: 0.58 + activity * 0.72,
      pulseSpeed: 0.55 + activity * 1.35 + Math.random() * 0.28
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

  function updatePoint(point, index) {
    var activity = point.activity || 0.5;
    var maxSpeed = point.maxSpeed || cfg.maxSpeed;
    var maxForce = cfg.maxForce * (0.72 + activity * 0.7);
    var cohesionX = 0;
    var cohesionY = 0;
    var cohesionCount = 0;
    var separationX = 0;
    var separationY = 0;
    var separationCount = 0;
    var alignmentX = 0;
    var alignmentY = 0;
    var alignmentCount = 0;

    for (var j = 0; j < points.length; j += 1) {
      if (j === index) continue;
      var other = points[j];
      var dx = other.x - point.x;
      var dy = other.y - point.y;
      var dist = Math.hypot(dx, dy);
      if (dist < cfg.cohesionRadius && dist > 0.01) {
        cohesionX += other.x;
        cohesionY += other.y;
        cohesionCount += 1;
      }
      if (dist < cfg.separationRadius && dist > 0.01) {
        var sepForce = 1.3 / dist;
        separationX -= (dx / dist) * sepForce;
        separationY -= (dy / dist) * sepForce;
        separationCount += 1;
      }
      if (dist < cfg.alignmentRadius && dist > 0.01) {
        alignmentX += other.vx;
        alignmentY += other.vy;
        alignmentCount += 1;
      }
    }

    if (cohesionCount > 0) {
      var targetX = cohesionX / cohesionCount;
      var targetY = cohesionY / cohesionCount;
      var cfX = targetX - point.x;
      var cfY = targetY - point.y;
      var limitedC = limitVector(cfX, cfY, maxSpeed);
      cfX = limitedC[0] - point.vx;
      cfY = limitedC[1] - point.vy;
      limitedC = limitVector(cfX, cfY, maxForce);
      point.vx += limitedC[0] * cfg.cohesionWeight * (0.86 + activity * 0.24);
      point.vy += limitedC[1] * cfg.cohesionWeight * (0.86 + activity * 0.24);
    }

    if (separationCount > 0) {
      var limitedS = limitVector(separationX, separationY, maxSpeed);
      var sfX = limitedS[0] - point.vx;
      var sfY = limitedS[1] - point.vy;
      limitedS = limitVector(sfX, sfY, maxForce);
      point.vx += limitedS[0] * cfg.separationWeight * (0.9 + activity * 0.28);
      point.vy += limitedS[1] * cfg.separationWeight * (0.9 + activity * 0.28);
    }

    if (alignmentCount > 0) {
      var afX = alignmentX / alignmentCount - point.vx;
      var afY = alignmentY / alignmentCount - point.vy;
      var limitedA = limitVector(afX, afY, maxForce);
      point.vx += limitedA[0] * cfg.alignmentWeight * (0.82 + activity * 0.32);
      point.vy += limitedA[1] * cfg.alignmentWeight * (0.82 + activity * 0.32);
    }

    var wanderTime = timeAcc * (0.82 + activity * 1.85) + point.phase;
    point.vx += (
      Math.sin(wanderTime) * 0.75 +
      Math.sin(wanderTime * 0.43 + point.phase) * 0.42
    ) * cfg.wanderForce * point.wander;
    point.vy += (
      Math.cos(wanderTime * 0.92) * 0.75 +
      Math.cos(wanderTime * 0.39 + point.phase) * 0.42
    ) * cfg.wanderForce * point.wander;

    var mouseActive = mouse.x > 0 && mouse.x < window.innerWidth && mouse.y > 0 && mouse.y < window.innerHeight;
    if (mouseActive) {
      var mdx = point.x - mouse.x;
      var mdy = point.y - mouse.y;
      var md = Math.hypot(mdx, mdy);
      if (md < cfg.predatorRadius && md > 0.5) {
        var strength = ((cfg.predatorRadius - md) / cfg.predatorRadius) * cfg.predatorWeight * point.reaction * (mouse.isDown ? 2.35 : 1.18);
        var angle = Math.atan2(mdy, mdx);
        if (mouse.isDown) {
          point.vx += (mdx / md) * strength * 1.08 - Math.sin(angle) * strength * 0.74;
          point.vy += (mdy / md) * strength * 1.08 + Math.cos(angle) * strength * 0.74;
        } else {
          point.vx += (mdx / md) * strength;
          point.vy += (mdy / md) * strength;
        }
      }
    }

    if (Math.random() < 0.03) {
      var swirl = (timeAcc + point.phase) * 1.35;
      var vortex = (mouse.isDown ? 1.45 : 0.48) * (0.62 + activity * 0.85);
      point.vx += Math.sin(swirl) * 0.1 * vortex;
      point.vy += Math.cos(swirl * 0.92) * 0.1 * vortex;
    }

    var margin = cfg.boundaryMargin;
    if (point.x < margin) point.vx += cfg.boundaryForce * (margin - point.x) / margin;
    if (point.x > window.innerWidth - margin) point.vx -= cfg.boundaryForce * (point.x - (window.innerWidth - margin)) / margin;
    if (point.y < margin) point.vy += cfg.boundaryForce * (margin - point.y) / margin;
    if (point.y > window.innerHeight - margin) point.vy -= cfg.boundaryForce * (point.y - (window.innerHeight - margin)) / margin;

    var speed = Math.hypot(point.vx, point.vy);
    var minSpeed = point.minSpeed || cfg.minCruiseSpeed;
    if (speed < minSpeed && speed > 0.001) {
      point.vx = (point.vx / speed) * minSpeed;
      point.vy = (point.vy / speed) * minSpeed;
    } else if (speed <= 0.001) {
      point.vx = Math.cos(point.phase) * minSpeed;
      point.vy = Math.sin(point.phase) * minSpeed;
    }

    var limited = limitVector(point.vx, point.vy, maxSpeed);
    point.vx = limited[0];
    point.vy = limited[1];

    point.trail.push({ x: point.x, y: point.y });
    while (point.trail.length > cfg.trailLength) point.trail.shift();

    point.x += point.vx * 0.98;
    point.y += point.vy * 0.98;
    if (point.x < -50) point.x = window.innerWidth + 50;
    if (point.x > window.innerWidth + 50) point.x = -50;
    if (point.y < -50) point.y = window.innerHeight + 50;
    if (point.y > window.innerHeight + 50) point.y = -50;
  }

  function drawPoint(point) {
    if (point.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(point.trail[0].x, point.trail[0].y);
      for (var i = 1; i < point.trail.length; i += 1) ctx.lineTo(point.trail[i].x, point.trail[i].y);
      ctx.strokeStyle = point.color + (point.activity > 0.72 ? 'c2' : point.activity < 0.24 ? '66' : '99');
      ctx.lineWidth = point.r * (0.34 + point.activity * 0.24);
      ctx.stroke();
    }

    var pulse = 0.82 + Math.sin(Date.now() * 0.004 * point.pulseSpeed + point.phase) * 0.24;
    var glowSize = point.r * (1 + pulse * 0.3 * point.glow);

    ctx.beginPath();
    ctx.arc(point.x, point.y, point.r * (0.78 + point.activity * 0.24), 0, Math.PI * 2);
    ctx.fillStyle = point.color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(point.x, point.y, glowSize * 1.35, 0, Math.PI * 2);
    ctx.fillStyle = point.color + (point.activity > 0.72 ? '66' : point.activity < 0.24 ? '38' : '55');
    ctx.fill();

    ctx.beginPath();
    ctx.arc(point.x, point.y, glowSize * 2.05, 0, Math.PI * 2);
    ctx.fillStyle = point.color + (point.activity > 0.72 ? '2d' : point.activity < 0.24 ? '18' : '24');
    ctx.fill();
  }

  function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    timeAcc += 0.016;

    points.forEach(function (point, index) {
      updatePoint(point, index);
      drawPoint(point);
    });

    if (mouse.x > 5 && mouse.x < window.innerWidth - 5 && mouse.y > 5 && mouse.y < window.innerHeight - 5) {
      var grad = ctx.createRadialGradient(mouse.x, mouse.y, 8, mouse.x, mouse.y, 54);
      grad.addColorStop(0, mouse.isDown ? 'rgba(255, 170, 100, 0.62)' : 'rgba(210, 230, 255, 0.5)');
      grad.addColorStop(1, 'rgba(30, 40, 100, 0)');
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 54, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    rafId = requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', function (event) {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  }, { passive: true });
  window.addEventListener('pointerdown', function (event) {
    mouse.isDown = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  }, { passive: true });
  window.addEventListener('pointerup', function () {
    mouse.isDown = false;
  }, { passive: true });
  window.addEventListener('pointerleave', function () {
    mouse.x = -9999;
    mouse.y = -9999;
    mouse.isDown = false;
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
