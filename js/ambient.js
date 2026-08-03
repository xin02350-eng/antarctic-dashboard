/* =========================================================
   ANTARCTIC NEXUS · V0.4.1 AMBIENT BLIZZARD MODULE
   三层极地暴风雪：
   - 远景雪雾层（细小粒子 + 半透明雾，内容之下）
   - 中景主雪层（正常大小，速度分层）
   - 前景大粒层（近镜头大粒、径向柔化、稀疏低透明）
   方向：强横风（非垂直下落）；纯 Canvas，页面隐藏暂停。
   不影响 main.js 数据逻辑。
========================================================= */
(function () {
  'use strict';

  /* 仅对启用极地氛围的页面生效 */
  if (!document.body || !document.body.classList.contains('polar-ambient')) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var dpr = Math.min(window.devicePixelRatio || 1, 1.25); /* DPR 上限，保证地图/图表性能 */
  var running = true;
  var layers = [];
  var gustPhase = 0;

  function makeCanvas(id, z, opacity) {
    var c = document.createElement('canvas');
    c.id = id;
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;' +
      'z-index:' + z + ';pointer-events:none;opacity:' + opacity + ';';
    document.body.appendChild(c);
    return c;
  }

  /* 背景层：远景雪雾 + 中景主雪（位于内容之下，文字不被覆盖） */
  var backCanvas = makeCanvas('snowBack', 1, 0.95);
  /* 前景层：近镜头大粒雪（稀疏低透明，仅氛围） */
  var frontCanvas = makeCanvas('snowFront', 1200, 0.4);

  function buildLayer(canvas, count, sizeMin, sizeMax, speedMin, speedMax, alphaMin, alphaMax, windBase, soft, fog, clear) {
    var ctx = canvas.getContext('2d');
    var flakes = [];

    function makeGrad(r, a) {
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(224,246,255,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(224,246,255,0)');
      return g;
    }

    function init() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes = [];
      for (var i = 0; i < count; i++) {
        var r = sizeMin + Math.random() * (sizeMax - sizeMin);
        var a = alphaMin + Math.random() * (alphaMax - alphaMin);
        flakes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: r,
          vy: speedMin + Math.random() * (speedMax - speedMin),
          vx: windBase + Math.random() * 0.9,
          ph: Math.random() * 6.28,
          sw: 0.12 + Math.random() * 0.25,
          a: a,
          grad: soft ? makeGrad(r, a) : null,
          streak: !soft && Math.random() < 0.25
        });
      }
    }

    function tick() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      if (clear) ctx.clearRect(0, 0, w, h);

      /* 远景雪雾：半透明雾层（缓慢漂移的白色渐变） */
      if (fog) {
        var fogX = (gustPhase * 40) % 200 - 100;
        var fg = ctx.createLinearGradient(fogX, 0, fogX + 300, h);
        fg.addColorStop(0, 'rgba(220,242,255,.05)');
        fg.addColorStop(0.5, 'rgba(220,242,255,.02)');
        fg.addColorStop(1, 'rgba(220,242,255,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, w, h);
      }

      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.y += f.vy;
        f.x += f.vx;               /* 横向强风，非垂直下落 */
        f.ph += 0.006;
        f.x += Math.sin(f.ph) * f.sw;
        if (f.y > h + 8) { f.y = -8; f.x = Math.random() * w; }
        if (f.x > w + 10) f.x = -10;
        if (f.x < -10) f.x = w + 10;

        if (soft && f.grad) {
          /* 前景大粒：径向柔化（模拟近镜头轻微模糊） */
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.fillStyle = f.grad;
          ctx.beginPath();
          ctx.arc(0, 0, f.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (f.streak && f.r > 1.4) {
          /* 风雪方向感：短斜线 */
          ctx.strokeStyle = 'rgba(222,244,255,' + (f.a * 0.5).toFixed(3) + ')';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x - 10, f.y + 12);
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

  /* 远景雪雾：细小粒子多、慢、淡 + 半透明雾层（内容之下） */
  layers.push(buildLayer(backCanvas, 140, 0.3, 1.0, 0.10, 0.28, 0.06, 0.16, 0.8, false, true, true));
  /* 中景主雪：80-150 粒，正常大小，速度分层（内容之下） */
  layers.push(buildLayer(backCanvas, 120, 0.8, 2.2, 0.24, 0.62, 0.10, 0.26, 1.6, false, false, false));
  /* 前景大粒：20-40 粒，大、快、柔化模糊（内容之上，稀疏低透明） */
  layers.push(buildLayer(frontCanvas, 30, 2.0, 4.0, 0.7, 1.5, 0.16, 0.34, 3.2, true, false, true));

  function frame() {
    if (!running) return;
    gustPhase += 0.008; /* 缓慢的风速脉动 */
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
