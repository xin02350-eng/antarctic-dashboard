const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const vendor = fs.readFileSync(path.join(__dirname, '../assets/chart.umd.min.js'), 'utf8');
const optics = fs.readFileSync(path.join(__dirname, '../js/expedition-charts.js'), 'utf8');

function harness(guarded = true) {
  let sequence = 0;
  const pending = new Map();
  const context = vm.createContext({
    console,
    setTimeout(callback, delay, ...args) {
      const id = ++sequence;
      pending.set(id, { callback, delay, args });
      return id;
    },
    clearTimeout(id) { pending.delete(id); }
  });
  vm.runInContext(vendor, context);
  vm.runInContext(optics, context);
  const Chart = context.Chart;
  const canvas = {
    width: 480, height: 240, style: {}, parentNode: {},
    addEventListener() {}, removeEventListener() {}
  };
  const ctx = new Proxy({
    canvas,
    measureText: text => ({ width: String(text).length * 8 }),
    setLineDash() {}, getLineDash: () => []
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  canvas.getContext = () => ctx;
  class Platform extends Chart.BasicPlatform {
    isAttached(element) { return !!element.parentNode; }
    addEventListener(chart, type, listener) { chart.canvas.addEventListener(type, listener); }
    removeEventListener(chart, type, listener) { chart.canvas.removeEventListener(type, listener); }
  }
  const config = {
    type: 'line', platform: Platform,
    data: { labels: [], datasets: [] },
    plugins: guarded ? [context.ExpeditionCharts.finish()] : [],
    options: {
      animation: false, responsive: true, maintainAspectRatio: false, resizeDelay: 120,
      plugins: { legend: false, tooltip: false },
      scales: { x: { display: false }, y: { display: false } }
    }
  };
  const chart = new Chart(canvas, config);
  return {
    chart, pending,
    flush() {
      const work = Array.from(pending.entries());
      for (const [id, job] of work) {
        if (!pending.delete(id)) continue;
        job.callback(...job.args);
      }
    }
  };
}

test('pinned Chart.js reproduces its uncancelled resize callback after chart destruction', () => {
  const h = harness(false);
  h.chart.resize(600, 300);
  assert.equal(h.pending.size, 1);
  h.chart.destroy();
  assert.equal(h.chart.canvas, null);
  assert.equal(h.pending.size, 1, 'vendor destroy leaves its delayed resize update pending');
  assert.throws(() => h.flush(), /null.*(?:parentNode|addEventListener)/);
});

test('polar chart lifecycle cancels a delayed resize before releasing the canvas', () => {
  const h = harness();
  h.chart.resize(600, 300);
  assert.equal(h.pending.size, 1);
  assert.equal(Array.from(h.pending.values())[0].delay, 120);
  h.chart.destroy();
  assert.equal(h.chart.canvas, null);
  assert.equal(h.pending.size, 0);
  assert.doesNotThrow(() => h.flush());
});

test('live chart resizing remains coalesced and does not hide genuine update failures', () => {
  const h = harness();
  const modes = [];
  h.chart.update = mode => modes.push(mode);
  h.chart.resize(600, 300);
  h.chart.resize(620, 310);
  h.chart.resize(640, 320);
  assert.equal(h.pending.size, 1);
  h.flush();
  assert.deepEqual(modes, ['resize']);
  h.chart.update = () => { throw new Error('genuine live-chart error'); };
  h.chart.resize(660, 330);
  assert.throws(() => h.flush(), /genuine live-chart error/);
  h.chart.destroy();
});
