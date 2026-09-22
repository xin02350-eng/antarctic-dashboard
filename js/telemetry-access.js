/* Presentation-only gate. Public JSON remains accessible without authentication. */
(function () {
  'use strict';
  var unlocked = false;
  var failed = false;
  var expanded = false;
  var box = document.getElementById('telemetryData');
  if (!box) return;
  var form = document.createElement('form');
  form.className = 'telemetry-access';
  form.innerHTML = '<p class="access-status" role="status" aria-live="polite"></p>' +
    '<button type="button" class="access-more" aria-expanded="false" aria-controls="historyPassword"></button>' +
    '<label for="historyPassword"></label>' +
    '<input id="historyPassword" type="password" autocomplete="off" required aria-describedby="historyAccessError">' +
    '<button type="submit"></button><button type="button" class="access-lock" hidden></button>' +
    '<p id="historyAccessError" role="alert"></p>';
  box.parentNode.insertBefore(form, box.nextSibling);
  var input = form.querySelector('input');
  var submit = form.querySelector('[type="submit"]');
  var lock = form.querySelector('.access-lock');
  var label = form.querySelector('label');
  var error = form.querySelector('#historyAccessError');
  var more = form.querySelector('.access-more');
  function translate() {
    var zh = document.documentElement.getAttribute('data-lang') === 'zh';
    form.querySelector('.access-status').textContent = unlocked
      ? (zh ? '已解锁全部记录 · 按时间从新到旧排列' : 'All records unlocked · Newest first')
      : (zh ? '当前可查看最新 100 条记录' : 'Latest 100 records available');
    more.textContent = zh ? '查看更早的数据' : 'View earlier records';
    more.hidden = unlocked || expanded;
    more.setAttribute('aria-expanded', String(expanded));
    label.textContent = zh ? '访问密码' : 'Access password';
    submit.textContent = zh ? '解锁全部数据' : 'Unlock all records';
    lock.textContent = zh ? '重新锁定' : 'Lock again';
    input.hidden = label.hidden = submit.hidden = unlocked || !expanded;
    input.disabled = unlocked || !expanded;
    input.placeholder = zh ? '输入密码查看全部' : 'Password to view all';
    lock.hidden = !unlocked;
    error.textContent = failed ? (zh ? '密码错误，请重试。' : 'Incorrect password. Please try again.') : '';
    input.setAttribute('aria-invalid', String(failed));
  }
  function timeOf(row) {
    var date = window.ANX_PARSE_TIME ? window.ANX_PARSE_TIME(row.time) : new Date(row.time);
    var value = date && date.getTime();
    return Number.isFinite(value) ? value : -Infinity;
  }
  window.DMS_TELEMETRY_ACCESS = {
    visibleRows: function (rows) {
      var ordered = rows.map(function (row, index) { return { row: row, index: index, time: timeOf(row) }; });
      ordered.sort(function (a, b) { return (b.time - a.time) || (b.index - a.index); });
      return (unlocked ? ordered : ordered.slice(0, 100)).map(function (entry) { return entry.row; });
    }
  };
  function changed() {
    translate();
    window.dispatchEvent(new CustomEvent('anx:telemetryaccess'));
  }
  more.addEventListener('click', function () {
    expanded = true;
    translate();
    input.focus();
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (input.value !== 'dbdnjxm') {
      failed = true;
      input.value = '';
      translate();
      input.focus();
      return;
    }
    unlocked = true;
    failed = false;
    input.value = '';
    changed();
    lock.focus();
  });
  lock.addEventListener('click', function () {
    unlocked = false;
    failed = false;
    expanded = false;
    changed();
    more.focus();
  });
  window.addEventListener('anx:langchange', translate);
  translate();
})();
