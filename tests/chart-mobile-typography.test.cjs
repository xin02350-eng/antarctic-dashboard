const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/expedition-charts.js'), 'utf8');

function configure({ mobile = false, rootMobile = false, width = 844, height = 390, mini = false, xLimit = 6, yLimit = 5 } = {}) {
  const window = {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: 3,
    ExpeditionClient: { mobile },
    document: { documentElement: { getAttribute: name => name === 'data-client' && rootMobile ? 'mobile' : null } }
  };
  const context = vm.createContext({ window, module: { exports: {} } });
  vm.runInContext(source, context);
  const observations = [-39.95, null, 0, 12.5];
  const labels = ['2026-10-08 03:20', '2026-10-08 03:25', '2026-10-08 03:30', '2026-10-08 03:35'];
  const tickCallback = function (value) { return this.getLabelForValue(value); };
  const tooltipCallback = point => point.raw + ' °C';
  const events = ['mousemove', 'mouseout', 'touchstart', 'touchmove'];
  const config = {
    data: { labels, datasets: [{ label: '环境温度 / °C', data: observations, spanGaps: false }] },
    options: {
      events,
      plugins: { tooltip: { callbacks: { label: tooltipCallback } } },
      scales: {
        x: { title: { text: '采集时间' }, ticks: { maxTicksLimit: xLimit, maxRotation: 0, callback: tickCallback } },
        y: { min: -45, max: 20, beginAtZero: false, title: { text: '环境温度 (°C)' }, ticks: { maxTicksLimit: yLimit } }
      }
    }
  };
  return { result: context.module.exports.configure(config, 'j', mini), observations, labels, tickCallback, tooltipCallback, events };
}

test('phone landscape charts balance axes and tooltips while keeping observations and units intact', () => {
  const h = configure({ mobile: true });
  const { options, data } = h.result;
  assert.equal(data.labels, h.labels);
  assert.equal(data.datasets[0].data, h.observations);
  assert.equal(data.datasets[0].label, '环境温度 / °C');
  assert.equal(data.datasets[0].spanGaps, false);
  for (const axis of ['x', 'y']) {
    assert.equal(options.scales[axis].ticks.font.size, 12);
    assert.equal(options.scales[axis].title.font.size, 13);
    assert.equal(options.scales[axis].title.display, true);
    assert.equal(options.scales[axis].ticks.maxTicksLimit, 4);
  }
  assert.equal(options.scales.x.title.text, '采集时间');
  assert.equal(options.scales.y.title.text, '环境温度 (°C)');
  assert.equal(options.scales.y.min, -45);
  assert.equal(options.scales.y.max, 20);
  assert.equal(options.scales.y.beginAtZero, false);
  assert.equal(options.scales.x.ticks.maxRotation, 0);
  assert.equal(options.scales.x.ticks.callback, h.tickCallback);
  assert.equal(options.plugins.tooltip.callbacks.label, h.tooltipCallback);
  assert.equal(options.plugins.tooltip.titleFont.size, 13);
  assert.equal(options.plugins.tooltip.bodyFont.size, 14);
  assert.equal(options.events, h.events);
  assert.equal(options.animation, false);
  assert.equal(options.resizeDelay, 120);
  assert.equal(options.devicePixelRatio(), 1.5);
});

test('mobile root marker works without a mobile API flag and compact charts preserve stricter tick budgets', () => {
  const { options } = configure({ rootMobile: true, xLimit: 3, yLimit: 2 }).result;
  assert.equal(options.scales.x.ticks.font.size, 12);
  assert.equal(options.scales.x.ticks.maxTicksLimit, 3);
  assert.equal(options.scales.y.ticks.maxTicksLimit, 2);
  assert.equal(options.scales.x.ticks.padding, 8);
  assert.equal(options.scales.x.title.padding.top, 6);
  assert.equal(options.layout.padding.top, 6);
});

test('tablet-height mobile charts retain the existing tick budgets with readable text', () => {
  const { options } = configure({ mobile: true, height: 768 }).result;
  assert.equal(options.scales.x.ticks.font.size, 12);
  assert.equal(options.scales.x.ticks.maxTicksLimit, 6);
  assert.equal(options.scales.y.ticks.maxTicksLimit, 5);
  assert.equal(options.scales.x.title.padding.top, 8);
  assert.equal(options.layout.padding.top, 8);
});

test('narrow landscape phones prevent long date-time labels overlapping without rewriting their callback', () => {
  for (const [width, expected] of [[568, 2], [640, 2], [667, 3], [800, 3], [844, 4]]) {
    const h = configure({ mobile: true, width, height: 320 });
    const { x, y } = h.result.options.scales;
    assert.equal(x.ticks.maxTicksLimit, expected, 'horizontal tick budget at ' + width);
    assert.equal(x.ticks.autoSkipPadding, 14);
    assert.equal(x.ticks.callback, h.tickCallback);
    assert.equal(x.ticks.font.size, 12);
    assert.equal(x.title.text, '采集时间');
    assert.equal(y.ticks.maxTicksLimit, 4);
  }
  assert.equal(configure({ mobile: true, width: 568, xLimit: 1 }).result.options.scales.x.ticks.maxTicksLimit, 1);
});

test('desktop charts keep their existing type sizes and spacing even in short windows', () => {
  const { options } = configure().result;
  for (const axis of ['x', 'y']) {
    assert.equal(options.scales[axis].ticks.font.size, 11);
    assert.equal(options.scales[axis].title.font.size, 12);
    assert.equal(options.scales[axis].ticks.padding, 10);
  }
  assert.equal(options.scales.x.ticks.maxTicksLimit, 6);
  assert.equal(options.scales.y.ticks.maxTicksLimit, 5);
  assert.equal(options.plugins.tooltip.titleFont.size, 12);
  assert.equal(options.plugins.tooltip.bodyFont.size, 13);
  assert.equal(options.layout.padding.top, 8);
  assert.equal(options.scales.x.ticks.autoSkipPadding, undefined);
  assert.equal(configure({ width: 568 }).result.options.scales.x.ticks.maxTicksLimit, 6);
});

test('miniature charts stay axis-free, tooltip-free and low-cost on mobile', () => {
  const { options } = configure({ mobile: true, mini: true }).result;
  for (const axis of ['x', 'y']) {
    assert.equal(options.scales[axis].display, false);
    assert.equal(options.scales[axis].title.display, false);
  }
  assert.equal(options.plugins.tooltip.enabled, false);
  assert.equal(options.events.length, 0);
  assert.equal(options.devicePixelRatio(), 1.25);
  assert.equal(options.layout.padding.top, 2);
  assert.equal(options.scales.x.ticks.autoSkipPadding, undefined);
});
