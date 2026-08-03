/* =========================================================
   ANTARCTIC NEXUS · V0.4.2 AMBIENT BLIZZARD MODULE
   四层极地暴风雪（按 z 顺序：雪雾 → 远景雪 → 中景雪 → 前景雪）
   - 全部位于页面内容之下（z-index:-1），不遮挡文字/卡片/地图/图表
   - 每粒子随机：大小 / 速度 / 透明度 / 风向（左或右）
   - 部分雪花径向渐变：边缘柔和 + 轻微发光，电影暴风雪质感
   - 性能：rAF、页面隐藏暂停、DPR 上限、移动端自动降粒子
   不影响 main.js 数据逻辑。
========================================================= */
(function () {
  'use strict';

  /* 仅对启用极地氛围的页面生效 */
  if (!document.body || !document.body.classList.contains('polar-ambient')) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var dpr = Math.min(window.devicePixelRatio || 1, 1.25);        /* 限制 DPR，控制 CPU */
  var mobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var scale = mobile ? 0.35 : 1;                                  /* 移动端自动降低粒子数 */
  var running = true;
  var gustPhase = 0;
  var layers = [];

  /* 创建画布层（z-index 由 css/style.css 统一控制为 -1） */
  function makeCanvas(id) {
    var c = document.createElement('canvas');
    c.id = id;
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;';
    document.body.appendChild(c);
    return c;
  }

  /* 层顺序：雪雾 → 远景 → 中景 → 前景（同一 z 值下 DOM 顺序即绘制顺序） */
  var fogCanvas = makeCanvas('snowFog');
  var farCanvas = makeCanvas('snowFar');
  var midCanvas = makeCanvas('snowMid');
  var frontCanvas = makeCanvas('snowFront');

  /* 径向渐变：中心亮核 + 柔和边缘 + 轻微发光 */
  function makeGrad(ctx, r, a) {
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(236,250,255,' + (a * 0.95).toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(214,242,255,' + (a * 0.55).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(214,242,255,0)');
    return g;
  }

  function buildLayer(canvas, count, o) {
    var ctx = canvas.getContext('2d');
    var flakes = [];

    function init() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes = [];
      var n = Math.max(4, Math.round(count * scale));
      for (var i = 0; i < n; i++) {
        var r = o.sizeMin + Math.random() * (o.sizeMax - o.sizeMin);
        var a = o.alphaMin + Math.random() * (o.alphaMax - o.alphaMin);
        var dir = Math.random() < 0.5 ? -1 : 1;   /* 随机风向：左或右 */
        flakes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: r,
          vy: o.speedMin + Math.random() * (o.speedMax - o.speedMin),
          wind: dir * (o.windBase + Math.random() * 0.8),
          ph: Math.random() * 6.28,
          sw: 0.1 + Math.random() * 0.25,
          a: a,
          grad: o.glow ? makeGrad(ctx, r, a) : null,
          soft: o.glow || Math.random() < 0.4
        });
      }
    }

    function tick() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      /* 雪雾层：半透明漂移雾（极地暴风雪氛围） */
      if (o.fog) {
        var fogOffset = (gustPhase * 60) % 400 - 200;
        var fg = ctx.createLinearGradient(fogOffset, 0, fogOffset + 320, h);
        fg.addColorStop(0, 'rgba(220,242,255,.06)');
        fg.addColorStop(0.5, 'rgba(220,242,255,.025)');
        fg.addColorStop(1, 'rgba(220,242,255,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, w, h);
      }

      var gust = 1 + 0.25 * Math.sin(gustPhase);   /* 风速缓慢脉动 */
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.y += f.vy;
        f.x += f.wind * gust;                       /* 横风主导，非垂直下落 */
        f.ph += 0.006;
        f.x += Math.sin(f.ph) * f.sw;
        if (f.y > h + 10) { f.y = -10; f.x = Math.random() * w; }
        if (f.x > w + 12) f.x = -12;
        if (f.x < -12) f.x = w + 12;

        if (f.grad) {
          /* 柔和发光粒子 */
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.fillStyle = f.grad;
          ctx.beginPath();
          ctx.arc(0, 0, f.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          /* 远景细小粒子（简单圆点即可，尺寸极小） */
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

  /* 第一层：雪雾（细小雪粒 + 漂移雾） */
  layers.push(buildLayer(fogCanvas, 110, {
    sizeMin: 0.3, sizeMax: 0.9,
    speedMin: 0.08, speedMax: 0.2,
    alphaMin: 0.05, alphaMax: 0.12,
    windBase: 0.5, glow: false, fog: true
  }));
  /* 第二层：远景雪（低透明、缓慢） */
  layers.push(buildLayer(farCanvas, 90, {
    sizeMin: 0.5, sizeMax: 1.2,
    speedMin: 0.12, speedMax: 0.3,
    alphaMin: 0.06, alphaMax: 0.14,
    windBase: 0.9, glow: false, fog: false
  }));
  /* 第三层：中景主雪（150-250 粒区间，柔和发光，速度/大小/透明度分层） */
  layers.push(buildLayer(midCanvas, 190, {
    sizeMin: 0.8, sizeMax: 2.4,
    speedMin: 0.22, speedMax: 0.7,
    alphaMin: 0.08, alphaMax: 0.24,
    windBase: 1.6, glow: true, fog: false
  }));
  /* 第四层：前景大雪（大尺寸、更快、轻微模糊发光，镜头前暴雪） */
  layers.push(buildLayer(frontCanvas, 30, {
    sizeMin: 2.2, sizeMax: 4.2,
    speedMin: 0.6, speedMax: 1.5,
    alphaMin: 0.15, alphaMax: 0.35,
    windBase: 2.8, glow: true, fog: false
  }));

  function frame() {
    if (!running) return;
    gustPhase += 0.008;
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
