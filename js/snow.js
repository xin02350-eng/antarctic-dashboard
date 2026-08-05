/* =========================================================
   ANTARCTIC NEXUS · 独立全站雪花系统（snow.js）
   - 不依赖任何既有雪花代码 / main.js / 数据
   - DOMContentLoaded 自动初始化（或文档就绪时立即执行）
   - 350 粒左右：细雪 100 + 普通雪 200 + 大雪 50
   - 每粒子随机：x / y / size / speed / opacity / wind
   - 运动：向下 + 横向风漂移（左右随机），模拟南极强风
   - 视觉：半透明冰蓝白、径向渐变柔和边缘、景深层次
   - 性能：rAF、页面隐藏暂停、DPR 上限、移动端自动降载
========================================================= */
(function () {
  'use strict';

  function boot() {
    /* 防止重复创建 */
    if (document.getElementById('snowCanvas')) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    /* 创建独立画布：fixed 全屏，位于背景之上、页面内容之下（CSS 控制层叠） */
    var c = document.createElement('canvas');
    c.id = 'snowCanvas';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    document.body.appendChild(c);

    var ctx = c.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 1.25); /* CPU 控制 */
  var mobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var scale = (mobile || window.innerWidth < 768) ? 0.35 : 1; /* 手机/窄屏自动降载 */
    var particles = [];
    var running = true;
    var gustPhase = 0;

    /* 径向渐变：亮核 + 柔和边缘（轻微模糊 / 发光） */
    function makeGrad(r, a) {
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(240,251,255,' + (a * 0.95).toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(222,244,255,' + (a * 0.55).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(222,244,255,0)');
      return g;
    }

    function addBatch(count, rMin, rMax, spMin, spMax, aMin, aMax, windMin, windMax, softRatio) {
      var n = Math.max(2, Math.round(count * scale));
      for (var i = 0; i < n; i++) {
        var r = rMin + Math.random() * (rMax - rMin);
        var a = aMin + Math.random() * (aMax - aMin);
        var dir = Math.random() < 0.5 ? -1 : 1;             /* 随机风向：左或右 */
        particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          r: r,
          vy: spMin + Math.random() * (spMax - spMin),
          wind: dir * (windMin + Math.random() * (windMax - windMin)),
          ph: Math.random() * 6.28,
          sw: 0.1 + Math.random() * 0.3,
          a: a,
          grad: Math.random() < softRatio ? makeGrad(r, a) : null
        });
      }
    }

    function init() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = [];
      /* 细雪 100：小、半透明、略慢 */
      addBatch(100, 1.0, 2.5, 0.4, 1.2, 0.30, 0.60, 0.8, 2.2, 0.15);
      /* 普通雪 200：中等大小、明显可见 */
      addBatch(200, 2.5, 6.0, 0.8, 2.2, 0.45, 0.80, 1.5, 3.8, 0.45);
      /* 大雪 50：前景大粒、更快、柔和模糊 */
      addBatch(50, 7.0, 13.0, 1.5, 3.2, 0.50, 0.90, 2.5, 5.5, 1.0);
    }

    function tick() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      var gust = 1 + 0.22 * Math.sin(gustPhase); /* 风速缓慢脉动 */
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.y += p.vy;
        p.x += p.wind * gust;                     /* 横向风漂移 */
        p.ph += 0.007;
        p.x += Math.sin(p.ph) * p.sw;
        if (p.y > h + 16) { p.y = -16; p.x = Math.random() * w; }
        if (p.x > w + 20) p.x = -20;
        if (p.x < -20) p.x = w + 20;

        if (p.grad) {
          /* 柔和发光粒子（边缘渐变） */
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.fillStyle = p.grad;
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(224,246,255,' + p.a.toFixed(3) + ')';
          ctx.fill();
        }
      }
    }

    function frame() {
      if (!running) return;
      gustPhase += 0.008;
      tick();
      window.requestAnimationFrame(frame);
    }

    window.addEventListener('resize', init);
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) window.requestAnimationFrame(frame);
    });

    init();
    frame();
  }

  /* 页面加载后自动执行，不等待 main.js / 数据 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
