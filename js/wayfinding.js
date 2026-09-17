(function () {
  "use strict";

  var menu = document.querySelector(".sidebar-menu");
  if (!menu) return;

  var items = Array.prototype.slice.call(menu.querySelectorAll(".nav-item"));
  if (!items.length || menu.querySelector(".mission-guide")) return;

  var route = [
    { en: "Mission overview", zh: "任务总览" },
    { en: "Node position", zh: "节点定位" },
    { en: "Live channels", zh: "实时通道" },
    { en: "Records archive", zh: "数据档案" },
    { en: "System build", zh: "系统构成" },
    { en: "Mission findings", zh: "任务结论" }
  ];

  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function label(item, lang) {
    var node = item.querySelector('[data-lang="' + lang + '"]');
    return node ? node.textContent.trim() : item.textContent.trim();
  }

  var activeIndex = items.findIndex(function (item) {
    return item.classList.contains("active");
  });
  if (activeIndex < 0) activeIndex = 0;

  items.forEach(function (item, index) {
    item.setAttribute("data-step", pad(index + 1));
    if (index === activeIndex) item.setAttribute("aria-current", "page");

    var intent = document.createElement("span");
    intent.className = "nav-intent";
    intent.innerHTML =
      '<span data-lang="en">' + route[index].en + "</span>" +
      '<span data-lang="zh">' + route[index].zh + "</span>";
    item.appendChild(intent);
  });

  var nextIndex = activeIndex === items.length - 1 ? 0 : activeIndex + 1;
  var nextItem = items[nextIndex];
  var nextHref = nextItem.getAttribute("href") || items[0].getAttribute("href") || "./dashboard.html";
  var progress = Math.round(((activeIndex + 1) / items.length) * 100);

  var guide = document.createElement("div");
  guide.className = "mission-guide";
  guide.setAttribute("aria-label", "Mission navigation");
  guide.style.setProperty("--mission-progress", progress + "%");
  guide.innerHTML =
    '<div class="mission-guide-head">' +
      '<span data-lang="en">MISSION PATH</span><span data-lang="zh">任务路径</span>' +
      '<b>' + pad(activeIndex + 1) + " / " + pad(items.length) + "</b>" +
    "</div>" +
    '<div class="mission-guide-track" aria-hidden="true"><i></i></div>' +
    '<div class="mission-guide-current">' +
      '<span data-lang="en">CURRENT · ' + route[activeIndex].en + "</span>" +
      '<span data-lang="zh">当前 · ' + route[activeIndex].zh + "</span>" +
    "</div>" +
    '<a class="mission-guide-next" href="' + nextHref + '">' +
      '<span class="mission-guide-action"><small data-lang="en">' + (nextIndex === 0 ? "RETURN TO" : "CONTINUE TO") + '</small><small data-lang="zh">' + (nextIndex === 0 ? "返回" : "继续前往") + "</small>" +
      '<strong data-lang="en">' + label(nextItem, "en") + '</strong><strong data-lang="zh">' + label(nextItem, "zh") + "</strong></span>" +
      '<span class="mission-guide-arrow" aria-hidden="true">&#8594;</span>' +
    "</a>";

  menu.appendChild(guide);

  function syncLanguage() {
    var lang = document.documentElement.getAttribute("data-lang") === "zh" ? "zh" : "en";
    guide.querySelectorAll("[data-lang]").forEach(function (node) {
      node.style.display = node.getAttribute("data-lang") === lang ? "" : "none";
    });
    items.forEach(function (item, index) {
      item.setAttribute("aria-label", pad(index + 1) + " " + label(item, lang) + " — " + route[index][lang]);
    });
    guide.setAttribute("aria-label", lang === "zh" ? "任务导航" : "Mission navigation");
  }

  syncLanguage();
  window.addEventListener("anx:langchange", syncLanguage);
})();
