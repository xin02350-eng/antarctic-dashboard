/* Domain model for the rebuilt desktop client. No generated telemetry. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExpeditionData = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const sources = { a01: 'data.json', a02: 'data02.json', a03: 'data03.json' };
  const excluded = ['2026-09-03 20:43', '2026-09-03 20:37', '2026-09-03 20:27'];
  const valid = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const time = value => typeof value === 'string' ? Date.parse(value.trim().replace(' ', 'T')) : NaN;
  function normalize(data) {
    if (!Array.isArray(data)) throw new TypeError('Expected a telemetry array');
    return data.filter(row => row && Number.isFinite(time(row.time)) && !excluded.some(x => row.time.startsWith(x)))
      .map((row, order) => ({ ...row, _order: order })).sort((a,b) => time(b.time) - time(a.time) || b._order - a._order);
  }
  function channels(station) {
    const other = station !== 'a01';
    return [
      [other ? 't' : 'j', '舱内温度', 'Cabin temperature', '°C', '#b9dce8'],
      ['k', '舱内湿度', 'Cabin humidity', '%RH', '#a8d6c3'],
      [other ? 'j' : 't', '环境温度', 'Air temperature', '°C', '#b9dce8'],
      ['h', '环境湿度', 'Air humidity', '%RH', '#a8d6c3'],
      [other ? 's' : 'l', '太阳辐射', 'Solar irradiance', 'W/m²', '#d9c6a0'],
      ['a', '系统电流', 'System current', 'mA', '#b9c3ed'],
      ['v', '系统电压', 'System voltage', 'V', '#a8d6c3'],
      ['wind', '风速', 'Wind speed', 'm/s', '#b9dce8'],
      ['b', '大气压强', 'Air pressure', 'hPa', '#b9c3ed'],
      ['d', '风向', 'Wind direction', '°', '#d9c6a0']
    ].map(([key,zh,en,unit,color]) => ({key,zh,en,unit,color}));
  }
  function voltageToSoc(value) {
    if (!valid(value)) return null;
    const thresholds = [[13.5,100],[13.4,99],[13.3,98],[13.1,97],[13,96],[12.9,95],[12.8,93],[12.7,91],[12.6,89],[12.5,87],[12.4,85],[12.3,83],[12.2,81],[12.1,79],[12,76],[11.9,74],[11.8,70],[11.7,68],[11.6,64],[11.5,60],[11.4,55],[11.3,49],[11.2,42],[11.1,33],[11,25],[10.9,17],[10.8,11],[10.7,6],[10.6,3],[10.5,2]];
    return (thresholds.find(([v]) => Number(value) >= v) || [0,0])[1];
  }
  function summary(rows, station, now = Date.now()) {
    const latest = rows[0] || {}, first = rows[rows.length-1] || {};
    const gps = rows.find(r => valid(r.x) && valid(r.y) && Math.abs(r.x) <= 90 && Math.abs(r.y) <= 180);
    const battery = rows.find(r => valid(r.soc) || ['v','voltage','batt','battery'].some(k => valid(r[k]))) || {};
    const voltageKey = ['v','voltage','batt','battery'].find(k => valid(battery[k]));
    const voltage = voltageKey ? Number(battery[voltageKey]) : null;
    const coverage = channels(station).map(c => ({...c, count:rows.filter(r=>valid(r[c.key])).length}));
    return { latest, first, gps, voltage, soc:valid(battery.soc) ? Number(battery.soc) : voltageToSoc(voltage),
      total:rows.length, days:rows.length ? Math.max(1,Math.round((time(latest.time)-time(first.time))/86400000)) : null,
      state:!rows.length ? 'empty' : now-time(latest.time)>86400000 ? 'historical' : 'updated', coverage,
      channels:coverage.filter(c=>c.count).length+(gps?1:0),
      firstS:rows.slice().reverse().find(r=>String(r.mode).toUpperCase()==='S'),
      firstE:rows.slice().reverse().find(r=>String(r.mode).toUpperCase()==='E') };
  }
  function tableKeys(rows, station) {
    const known=['mode','v','a',...channels(station).map(c=>c.key),'x','y','n'];
    const present=new Set(rows.flatMap(r=>Object.keys(r).filter(k=>!['time','g','_order'].includes(k))));
    return [...new Set(known.filter(k=>present.has(k)))].concat([...present].filter(k=>!known.includes(k)).sort());
  }
  function route(file, query='') {
    let view=file.replace(/\.html$/,'').replace(/-a0[23]$/,'');
    if (view==='a02') view='dashboard';
    if (view==='index') view=new URLSearchParams(query).get('view')==='globe'?'globe':'dashboard';
    if (!['dashboard','location','network','sensors','telemetry','hardware','analysis','download','globe'].includes(view)) return null;
    return {view,station:/a02/.test(file)?'a02':/a03/.test(file)?'a03':'a01'};
  }
  return {sources,valid,time,normalize,channels,summary,voltageToSoc,tableKeys,route};
});
