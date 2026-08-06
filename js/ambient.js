/* =========================================================
   ANTARCTIC NEXUS · 雪花加载桥（ambient.js）
   页面已引用本文件；此处仅负责加载独立雪花系统 js/snow.js，
   不再包含任何雪花绘制逻辑（HTML 保持零改动）。
========================================================= */
(function () {
  'use strict';
  if (window.__antSnowLoaded) return;
  window.__antSnowLoaded = true;
  var s = document.createElement('script');
  s.src = './js/snow.js?v=20260806';
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
})();
