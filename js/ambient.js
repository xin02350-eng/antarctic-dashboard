/* =========================================================
   ANTARCTIC NEXUS · V0.4 AMBIENT BLIZZARD MODULE
   全站极地暴风雪：三层粒子（远景/中景/近景）+ 风雪方向感
   - 纯原生 JS，模块化，不影响 main.js 数据逻辑
   - 文字不遮挡：远景/中景画布在内容之下，近景画布稀疏低透明
========================================================= */
(function () {
  'use strict';

  /* 仅对启用极地氛围的页面生效 */
  if (!document.body || !document.body.classList.contains('polar-ambient')) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var dpr = Math.min(window.devicePixelRatio || 1, 1.5); /* 限制 DPR，保证性能 */
  var running = true;
  var layers = [];

  /* 创建全屏画布层 */
  function makeCanvas(id, z, opacity) {
    var c = document.createElement('canvas');
    c.id = id;
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;' +
      'z-index:' + z + ';pointer-events:none;opacity:' + opacity + ';';
    document.body.appendChild(c);
    return c;
  }

  /* 背景层：位于内容之下，雪不会盖住文字 */
  var backCanvas = makeCanvas('snowBack', 1, 0.9);
  /* 前景层：少量大粒近景雪 + 风雪线，低透明，不干扰阅读 */
  var frontCanvas = makeCanvas('snowFront', 1200, 0.45);

  /* 构建一层粒子（clear=true 时先清空画布；同画布多图层只有首层清空） */
  function buildLayer(canvas, count, sizeMin, sizeMax, speedMin, speedMax, alphaMin, alphaMax, streaks, clear) {
    var ctx = canvas.getContext('2d');
    var flakes = [];

    function init() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes = [];
      for (var i = 0; i < count; i++) {
        flakes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: sizeMin + Math.random() * (sizeMax - sizeMin),
          vy: speedMin + Math.random() * (speedMax - speedMin),
          vx: (streaks ? 1.1 : 0.18) + Math.random() * 0.7,
          ph: Math.random() * 6.28,
          sw: 0.1 + Math.random() * 0.2,
          a: alphaMin + Math.random() * (alphaMax - alphaMin),
          streak: streaks && Math.random() < 0.35
        });
      }
    }

    function tick() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      if (clear) ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.y += f.vy;
        f.x += f.vx + Math.sin(f.ph) * f.sw;
        f.ph += 0.004;
        if (f.y > h + 6) { f.y = -6; f.x = Math.random() * w; }
        if (f.x > w + 8) f.x = -8;
        if (f.x < -8) f.x = w + 8;
        if (f.streak && f.r > 1.6) {
          /* 风雪方向感：短斜线 */
          ctx.strokeStyle = 'rgba(220,245,255,' + (f.a * 0.5).toFixed(3) + ')';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x - 9, f.y + 11);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(214,242,255,' + f.a.toFixed(3) + ')';
          ctx.fill();
        }
      }
    }

    init();
    return { init: init, tick: tick };
  }

  /* 远景：多、小、慢、淡（在内容下方） */
  layers.push(buildLayer(backCanvas, 110, 0.5, 1.4, 0.10, 0.28, 0.08, 0.22, false, true));
  /* 中景：与远景同画布叠加（不重复清空） */
  layers.push(buildLayer(backCanvas, 70, 0.8, 2.0, 0.22, 0.45, 0.12, 0.30, false, false));
  /* 近景：少、大、快、带风雪线（内容上方，稀疏低透明） */
  layers.push(buildLayer(frontCanvas, 26, 1.6, 3.2, 0.5, 1.0, 0.22, 0.42, true, true));

  function frame() {
    if (!running) return;
    for (var i = 0; i < layers.length; i++) layers[i].tick();
    window.requestAnimationFrame(frame);
  }

  window.addEventListener('resize', function () {
    for (var i = 0; i < layers.length; i++) layers[i].init();
  });
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) window.requestAnimationFrame(frame);
  });
  frame();
})();
