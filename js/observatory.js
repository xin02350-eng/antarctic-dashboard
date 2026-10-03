/* UI + real measurements. The 3D scene never supplies telemetry values. */
(function () {
  'use strict';
  var configs = {
    a01: { source: 'data.json', suffix: '', temperature: 't' },
    a02: { source: 'data02.json', suffix: '-a02', temperature: 'j' },
    a03: { source: 'data03.json', suffix: '-a03', temperature: 'j' }
  };
  var station = new URLSearchParams(location.search).get('station') || 'a01';
  if (!configs[station]) station = 'a01';
  var language = 'zh';
  try { language = localStorage.getItem('anx-lang') === 'en' ? 'en' : 'zh'; } catch (error) { /* Storage can be disabled. */ }
  var generation = 0, controller, latestTime = null, state = 'loading', polling;
  var $ = function (id) { return document.getElementById(id); };
  function text(zh, en) { return language === 'zh' ? zh : en; }
  function updateState() {
    var names = { loading: ['连接中', 'CONNECTING'], fresh: ['已更新', 'UPDATED'], stale: ['历史数据', 'HISTORICAL'], empty: ['等待首组数据', 'AWAITING DATA'], error: ['读取失败', 'UNAVAILABLE'] };
    $('dataState').dataset.state = state;
    $('dataState').textContent = names[state][language === 'zh' ? 0 : 1];
  }
  function applyLanguage() {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.language = language;
    document.querySelectorAll('[data-zh][data-en]').forEach(function (element) { element.textContent = element.dataset[language].replace(/\\n/g, '\n'); });
    $('languageButton').textContent = language === 'zh' ? 'EN' : '中';
    $('languageButton').setAttribute('aria-label', text('Switch to English', '切换为中文'));
    document.title = text('极境观测 · DMS', 'POLAR OBSERVATORY · DMS');
    $('temperatureTrend').setAttribute('aria-label', text('最近100条温度趋势', 'Temperature trend, latest 100 records'));
    if (window.matchMedia?.('(min-width:769px)')?.matches) window.ExpeditionIcons?.mount();
    updateMotion(); updateState();
  }
  function updateMotion() {
    var button = $('motionToggle'), stopped = button.getAttribute('aria-pressed') === 'true';
    var label = stopped ? text('继续场景动画', 'Resume scene animation') : text('暂停场景动画', 'Pause scene animation');
    button.querySelector('span').textContent = label;
    button.setAttribute('aria-label', label); button.setAttribute('title', label);
  }
  $('languageButton').addEventListener('click', function () { language = language === 'zh' ? 'en' : 'zh'; try { localStorage.setItem('anx-lang', language); } catch (error) {} applyLanguage(); });
  window.addEventListener('polar:motion', updateMotion);
  function parseTime(value) {
    // Match main.js: timestamps without an offset are interpreted in browser local time.
    if (typeof value !== 'string') return NaN;
    var normalized = value.trim().replace(' ', 'T');
    return Date.parse(normalized);
  }
  function number(value, digits) { return value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—'; }
  function clearData() {
    ['valueTemp', 'valueWind', 'valueVoltage', 'valuePressure', 'lastObservation'].forEach(function (id) { $(id).textContent = '—'; });
    $('lastObservation').removeAttribute('datetime');
    $('trendArea').setAttribute('d', ''); $('trendLine').setAttribute('d', ''); latestTime = null;
  }
  function drawTrend(rows) {
    var values = rows.slice().reverse().map(function (row) { var value = row[configs[station].temperature]; return value === null || value === '' || value === undefined ? NaN : Number(value); });
    var valid = values.filter(Number.isFinite);
    if (valid.length < 2) { $('trendArea').setAttribute('d', ''); $('trendLine').setAttribute('d', ''); return; }
    var min = Math.min.apply(null, valid), max = Math.max.apply(null, valid), range = max - min || 1;
    var line = '', area = '', started = false, firstX, lastX;
    values.forEach(function (value, index) {
      if (!Number.isFinite(value)) { if (started) area += ' L' + lastX + ',57 L' + firstX + ',57 Z '; started = false; return; }
      var x = (index / Math.max(1, values.length - 1) * 240).toFixed(2), y = (48 - (value - min) / range * 40).toFixed(2);
      var command = (started ? ' L' : ' M') + x + ',' + y;
      line += command; area += command; if (!started) firstX = x; started = true; lastX = x;
    });
    if (started) area += ' L' + lastX + ',57 L' + firstX + ',57 Z';
    $('trendLine').setAttribute('d', line); $('trendArea').setAttribute('d', area);
  }
  async function loadData() {
    var requestId = ++generation;
    if (controller) controller.abort();
    controller = new AbortController();
    var activeController = controller;
    var timeout = setTimeout(function () { activeController.abort(); }, 15000);
    try {
      var response = await fetch('./' + configs[station].source, { cache: 'no-store', signal: activeController.signal });
      if (!response.ok) throw new Error('Data unavailable');
      var data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid data');
      var excluded = ['2026-09-03 20:43', '2026-09-03 20:37', '2026-09-03 20:27'];
      var rows = data.filter(function (row) { return row && Number.isFinite(parseTime(row.time)) && !excluded.some(function (time) { return String(row.time).indexOf(time) === 0; }); })
        .sort(function (a, b) { return parseTime(b.time) - parseTime(a.time); }).slice(0, 100);
      if (requestId !== generation) return;
      if (!rows.length) { clearData(); state = 'empty'; updateState(); return; }
      var newest = rows[0]; latestTime = parseTime(newest.time);
      $('valueTemp').textContent = number(newest[configs[station].temperature], 1);
      $('valueWind').textContent = number(newest.wind, 2);
      $('valueVoltage').textContent = number(newest.v, 2);
      $('valuePressure').textContent = number(newest.b, 1);
      $('lastObservation').textContent = newest.time;
      $('lastObservation').setAttribute('datetime', new Date(latestTime).toISOString());
      state = Date.now() - latestTime < 30 * 60 * 1000 && latestTime <= Date.now() + 60000 ? 'fresh' : 'stale';
      drawTrend(rows); updateState();
    } catch (error) {
      if (requestId !== generation) return;
      clearData(); state = 'error'; updateState();
    } finally { clearTimeout(timeout); }
  }
  function selectStation(value) {
    station = value; clearData(); state = 'loading'; updateState();
    $('stationName').textContent = 'DMS–' + station.toUpperCase();
    document.querySelectorAll('[data-station]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.station === station)); });
    document.querySelectorAll('[data-destination]').forEach(function (link) { link.href = './' + link.dataset.destination + configs[station].suffix + '.html'; });
    var url = new URL(location.href); url.searchParams.set('station', station); history.replaceState(null, '', url);
    window.dispatchEvent(new CustomEvent('polar:station', { detail: station }));
    loadData();
  }
  document.querySelectorAll('[data-station]').forEach(function (button) { button.addEventListener('click', function () { if (button.dataset.station !== station) selectStation(button.dataset.station); }); });
  function clock() { $('utcClock').textContent = new Date().toISOString().slice(11, 19) + ' UTC'; }
  function startPolling() { clearInterval(polling); polling = setInterval(loadData, 60000); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) clearInterval(polling); else { loadData(); startPolling(); } });
  applyLanguage(); selectStation(station); clock(); setInterval(clock, 1000); startPolling();
})();
