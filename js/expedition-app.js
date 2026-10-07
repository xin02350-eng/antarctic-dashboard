/* Desktop application: route-driven views and explicit lifecycle ownership. */
(function () {
  'use strict';
  const client=window.ExpeditionClient;
  const clientQuery=client?.mobile?'&client=mobile':'';
  let viewRoot=null;
  const D=window.ExpeditionData, globalIds=new Set(['view','content','appHeader','appFooter','stationSelect','clock','recordWorkspace','telemetryData','mapStyle']);
  const $=id=>globalIds.has(id)?document.getElementById(id):viewRoot?.querySelector('#'+id);
  const viewQuery=selector=>viewRoot?.querySelector(selector);
  const views=['dashboard','network','location','sensors','telemetry','hardware','analysis','globe','download'];
  const labels={dashboard:['任务现场','Mission'],network:['观测网络','Network'],location:['节点定位','Location'],sensors:['环境趋势','Trends'],telemetry:['观测档案','Records'],hardware:['实物展示','Hardware'],analysis:['任务分析','Analysis'],globe:['全球视野','Globe'],download:['客户端','Client']};
  let lang='zh';try{lang=localStorage.getItem('anx-lang')==='en'?'en':'zh';}catch(e){}
  let active='dashboard', station='a01', channel=null, range='100', photo=0, deviceView='photos', instrumentSeen=false;
  let rows=[],status='loading',generation=0,controller,charts=[],map, networkRows={}, refreshing=false,paintFrame,earthObserver,fieldObserver;
  let tableRenderJob=null,tableRenderGeneration=0;
  let renderedView=null,chartRenderJob=null,chartRenderGeneration=0;
  const chartStates=new WeakMap();
  const t=(zh,en)=>lang==='zh'?zh:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=(v,d=1)=>D.valid(v)?Number(v).toLocaleString(lang==='zh'?'zh-CN':'en-US',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
  const date=(v,full=false)=>v?esc(String(v).replace('T',' ').slice(0,full?19:16)):'—';
  const url=(view,node=station)=>'./expedition.html?view='+view+'&station='+node+clientQuery;
  const link=(view,text,cls='')=>`<a class="${cls}" href="${url(view)}" data-route="${view}">${text}</a>`;
  const pageNames={sensors:['环境监测','Environment'],telemetry:['观测档案','Records'],network:['观测网络','Network'],location:['节点定位','Location'],hardware:['实物展示','Hardware'],analysis:['任务分析','Analysis'],globe:['全球视野','Global view']};
  const title=()=>`<header class="page-title"><div><span class="eyebrow">${labels[active][1].toUpperCase()}</span><h1>${pageNames[active][lang==='zh'?0:1]}</h1></div><span class="page-node">DMS—${station.toUpperCase()}</span></header>`;
  const note=()=> status==='error'?t('数据读取失败，请重试','Data unavailable — retry'):status==='loading'?t('读取观测记录…','Loading observations…'):client?.offline(station)?t('离线快照 · 非实时','Offline snapshot · Not live'):({empty:t('等待首组观测','Awaiting first observation'),historical:t('历史观测数据','Historical observations'),updated:t('最近已更新','Recently updated')})[!rows.length?'empty':Date.now()-D.time(rows[0].time)>86400000?'historical':'updated'];
  const badge=()=>`<span class="data-badge ${status==='error'?'error':''}"><i></i>${note()}</span>`;
  const metric=(name,value,unit='',small='')=>`<div class="metric"><span>${name}</span><strong>${value}<small>${unit}</small></strong>${small?`<p>${small}</p>`:''}</div>`;
  function header() {
    const navItem=(v,i)=>`<a href="${url(v)}" data-route="${v}" ${active===v||(v==='network'&&active==='location')?'aria-current="page"':''}><span class="nav-index" aria-hidden="true">${String(i+1).padStart(2,'0')}</span><span>${labels[v][lang==='zh'?0:1]}</span><span class="nav-arrow" aria-hidden="true">→</span></a>`;
    $('appHeader').innerHTML=`<div class="navigation-rail"><a class="wordmark" href="${url('dashboard')}" data-route="dashboard"><b>DMS<span>POLAR SYSTEMS</span></b></a><nav class="primary-nav" aria-label="${t('主导航','Main navigation')}">${['dashboard','network','sensors','telemetry','analysis','hardware'].map(navItem).join('')}</nav><div class="header-end"><label class="station-select"><span class="sr-only">${t('观测节点','Observation node')}</span><select id="stationSelect">${['a01','a02','a03'].map(s=>`<option value="${s}" ${s===station?'selected':''}>DMS–${s.toUpperCase()}</option>`).join('')}</select></label><button class="language" data-action="language" aria-label="${t('Switch to English','切换中文')}">${t('EN','中')}</button></div></div>`;
    $('appFooter').innerHTML=`<span>DMS / POLAR</span><div>${link('globe',t('全球视野','Global view'))}${link('download',t('客户端下载','Download app'))}<a href="${client?.mobile?'./field-frame.html?profile=instrument&client=mobile&lang='+lang+'&station='+station:'./observatory.html?station='+station}">${t('沉浸现场','Immersive field')} →</a></div><time id="clock"></time>`;
    $('stationSelect').addEventListener('change',e=>navigate(active,e.target.value));
    document.title=`${labels[active][lang==='zh'?0:1]} / DMS`;
    document.documentElement.lang=lang==='zh'?'zh-CN':'en';document.documentElement.dataset.lang=lang;
    document.body.dataset.view=active;
  }
  function scene(profile='instrument',hidden=false) {return `<iframe class="field-frame"${hidden?' hidden':''} title="${t('原创极地监测装置交互场景','Interactive polar instrument scene')}" src="./field-frame.html?station=${station}&lang=${lang}&profile=${profile}${clientQuery}&v=20261004m" loading="eager"></iframe>`;}
  function earthScene(){return `<iframe class="earth-frame" title="${t('蓝线三维地球，可旋转与缩放','Interactive blue-line Earth, rotate and zoom')}" src="./globe-frame.html?lang=${lang}${clientQuery}&v=20261004m" loading="eager"></iframe>`;}
  function orbitalNetwork(){return `${earthScene()}<div class="orbital-copy"><div class="orbital-heading"><h1>${t('观测<em>网络</em>','Observation<em>network</em>')}</h1></div><div class="orbital-actions">${link('location',t('实际定位','Location')+' →','solid-link')}</div><small>${t('南京 → 东北（哈尔滨）→ 南极<br>示意链路 · 非实际部署','Nanjing → Northeast China → Antarctica<br>Illustrative route · Not actual deployment')}</small></div>`;}
  function overview() {
    const s=D.summary(rows,station),c=D.channels(station),r=s.latest;
    return `<section class="field-hero" aria-label="${t('极地监测任务现场','Polar monitoring field')}"><div class="mission-stage">${scene('hero')}</div><div class="field-vignette"></div><div class="hero-copy"><h1>${t('始于监测，<br><em>走向未知</em>','From Monitoring,<br><em>Toward the Unknown</em>')}</h1><div class="hero-actions">${link('sensors',t('开启探索','Start Exploration')+' <span aria-hidden="true">→</span>','solid-link hero-enter')}</div></div><div class="hero-field-notes"><p class="hero-manifesto">${t('未知之境，需要探索者的脚步；<br>无人之地，需要第一组观测数据。','The unknown requires explorers;<br>Uninhabited lands require the first set of observations.')}</p><div class="hero-telemetry"><div class="field-readout"><span>${t('环境温度 · 最近采集','TEMPERATURE · LAST OBSERVATION')}</span><strong>${n(r[c[2].key])}<small>°C</small></strong></div><div class="hero-status">${badge()}<time>${date(r.time)}</time></div></div></div><div class="field-foot">${t('原创概念场景 · 非实时天气','ORIGINAL CONCEPT · NOT LIVE WEATHER')}</div><a class="hero-scroll" href="#observations" aria-label="${t('向下查看观测数据','Scroll to observations')}"><span>${t('观测数据','OBSERVATIONS')}</span><span aria-hidden="true">↓</span></a></section>
    <section id="observations" class="mission-ribbon" aria-label="${t('任务摘要','Mission summary')}"><div class="ribbon-identity"><b>DMS—${station.toUpperCase()}</b>${link('location',t('定位与链路','Location & link')+' →')}</div>${metric(t('风速','Wind speed'),n(r.wind,2),'m/s')}${metric(t('系统电压','System voltage'),n(r.v,3),'V')}${metric(t('累计记录','Records'),s.total.toLocaleString(),'')}${metric(t('任务跨度','Mission span'),s.days??'—',t('天','days'))}</section>
    <section class="overview-lower"><div class="observation-intro"><h2>${t('最近观测','Latest observations')}</h2><p>${badge()}</p><time>${date(r.time)}</time><div class="observation-links">${link('telemetry',t('全部记录','All records')+' →','quiet-link')}${link('hardware',t('监测装置','Instrument')+' →','quiet-link')}</div></div><div class="overview-chart"><div class="section-heading"><span>${t('环境温度 / 最近100条','Air temperature / latest 100')}</span><b>${n(r[c[2].key])} °C</b></div><div class="chart-box"><canvas id="overviewChart" aria-label="${t('最近100条环境温度曲线','Air temperature trend')}" role="img"></canvas></div></div></section>
    <section class="detail-strip">${metric(t('舱内温度','Cabin temperature'),n(r[c[0].key]),'°C')}${metric(t('舱内湿度','Cabin humidity'),n(r.k),'%RH')}${metric(t('环境湿度','Air humidity'),n(r.h),'%RH')}${metric(t('太阳辐射','Solar irradiance'),n(r[c[4].key],0),'W/m²')}${metric(t('运行模式','Operating mode'),mode(r.mode),'')}</section>`;
  }
  function mode(v){return ({N:t('正常','Normal'),S:t('待机','Standby'),E:t('应急','Emergency')})[String(v).toUpperCase()]|| (v?esc(v):t('等待数据','Awaiting data'));}
  function sensors() {
    const defs=D.channels(station);if(!defs.some(c=>c.key===channel))channel=defs[2].key;
    const selected=defs.find(c=>c.key===channel),values=visibleTrend().map(r=>r[channel]).filter(D.valid).map(Number);
    return `${title()}<div class="trend-workspace"><aside class="channel-list" aria-label="${t('选择观测通道','Select a channel')}">${defs.map((c,i)=>`<button data-channel="${c.key}" aria-pressed="${c.key===channel}"><span class="channel-index">${String(i+1).padStart(2,'0')}</span><span>${c[lang]}<small>${c.unit}</small></span><b>${n((rows[0]||{})[c.key],c.key==='v'?3:1)}</b></button>`).join('')}</aside><section class="signal-stage"><div class="signal-top"><div class="signal-identity"><h2>${selected[lang]}</h2><div class="signal-value">${n((rows[0]||{})[channel],channel==='v'?3:1)}<small>${selected.unit}</small></div></div><div class="range-control" role="group" aria-label="${t('曲线范围','Chart range')}">${[['100',t('最近100','Last 100')],['24h',t('最近24小时','Last 24h')],['all',t('全部趋势','Full trend')]].map(([v,l])=>`<button data-range="${v}" aria-pressed="${range===v}">${l}</button>`).join('')}</div></div><div class="chart-box featured-chart"><canvas id="signalChart" role="img" aria-label="${selected[lang]}"></canvas>${values.length?'':`<p class="chart-empty">${t('等待有效观测数据','Awaiting valid observations')}</p>`}</div><div class="signal-stats">${metric(t('区间最低','Minimum'),values.length?n(Math.min(...values),channel==='v'?3:1):'—',selected.unit)}${metric(t('区间最高','Maximum'),values.length?n(Math.max(...values),channel==='v'?3:1):'—',selected.unit)}${metric(t('有效采样','Valid samples'),values.length.toLocaleString())}<span>${badge()}</span></div></section></div>`;
  }
  function archive() {
    return `${title()}<div class="archive-toolbar"><div>${badge()}<span id="recordCount"></span></div><button class="outline-button" data-action="refresh">${refreshing?'…':'↻'} ${t('刷新记录','Refresh')}</button></div>`;
  }
  function cancelTableRender(){
    tableRenderGeneration++;
    if(!tableRenderJob)return;
    if(tableRenderJob.idle)window.cancelIdleCallback(tableRenderJob.id);else clearTimeout(tableRenderJob.id);
    tableRenderJob=null;
  }
  function tableRows(list,keys){
    return list.map(r=>`<tr><th scope="row">${date(r.time,true)}</th>${keys.map(k=>`<td>${k==='mode'?`<span class="mode-label">${mode(r[k])}</span>`:r[k]===null||r[k]===undefined||r[k]===''?'—':esc(r[k])}</td>`).join('')}</tr>`).join('');
  }
  function renderTable() {
    cancelTableRender();
    const allowed=window.DMS_TELEMETRY_ACCESS.visibleRows(rows),keys=D.tableKeys(rows,station);
    const meta=Object.fromEntries(D.channels(station).map(c=>[c.key,c]));
    Object.assign(meta,{mode:{zh:'模式',en:'Mode'},x:{zh:'纬度',en:'Latitude',unit:'°'},y:{zh:'经度',en:'Longitude',unit:'°'},n:{zh:'卫星数',en:'Satellites'}});
    const count=$('recordCount');if(count)count.textContent=t(`可查看 ${allowed.length} 条 / 共 ${rows.length} 条`,`Available ${allowed.length} / ${rows.length} records`);
    // The complete public allowance is present immediately in one continuous table.
    let cursor=Math.min(100,allowed.length);
    const host=$('telemetryData'),revision=tableRenderGeneration;
    host.innerHTML=`<div class="table-scroll" tabindex="0" role="region" aria-label="${t('观测数据表，支持上下及横向滚动','Observation table, vertically and horizontally scrollable')}"><table aria-rowcount="${allowed.length+1}" aria-busy="${cursor<allowed.length}"><thead><tr><th scope="col">${t('采集时间','Observed at')}<small>↓ ${t('最新优先','Newest first')}</small></th>${keys.map(k=>`<th scope="col">${esc(meta[k]?.[lang]||k.toUpperCase())}<small>${esc(meta[k]?.unit||'')}</small></th>`).join('')}</tr></thead><tbody>${tableRows(allowed.slice(0,cursor),keys)}</tbody></table>${!allowed.length?`<div class="empty-state">${note()}<p>${t('不会用模拟记录填充表格。','The table is never filled with simulated records.')}</p></div>`:''}</div>`;
    if(cursor===allowed.length)return;
    const table=host.querySelector('table'),body=host.querySelector('tbody');
    const schedule=()=>{
      const idle=typeof window.requestIdleCallback==='function'&&typeof window.cancelIdleCallback==='function';
      tableRenderJob={idle,id:idle?window.requestIdleCallback(append,{timeout:120}):setTimeout(append,16)};
    };
    const append=()=>{
      if(revision!==tableRenderGeneration||active!=='telemetry'||!body.isConnected)return;
      tableRenderJob=null;
      // Yield between small batches after unlocking thousands of observations.
      const end=Math.min(cursor+200,allowed.length);
      body.insertAdjacentHTML('beforeend',tableRows(allowed.slice(cursor,end),keys));cursor=end;
      if(cursor<allowed.length)schedule();else table.setAttribute('aria-busy','false');
    };
    schedule();
  }
  function network() {
    const s=D.summary(rows,station),gps=s.gps;
    return `${active==='network'?'':title()}<div class="network-toolbar"><div class="view-tabs">${link('network',t('观测网络','Network'),active==='network'?'selected':'')}${link('location',t('节点定位','Position'),active==='location'?'selected':'')}${link('globe',t('全球视野','Globe'))}</div>${badge()}</div><section class="atlas"><div id="atlasMap" aria-label="${t('实际观测节点地图','Actual observation locations')}"></div><div class="atlas-dossier"><span class="eyebrow">DEPLOYMENT COORDINATES</span><h2>DMS—${station.toUpperCase()}</h2><div class="coordinates"><b>${gps?n(gps.x,6):'—'}<small>LATITUDE</small></b><b>${gps?n(gps.y,6):'—'}<small>LONGITUDE</small></b></div><p>${t('卫星数','Satellites')} <strong>${gps?.n??'—'}</strong></p><p class="muted">${t('最近有效定位','Latest valid position')}<br>${date(gps?.time)}</p>${link('dashboard',t('进入任务现场','Open mission')+' →','solid-link')}</div><span class="map-caption">${t('可拖动 / 滚轮缩放 · 地理底图','DRAG / SCROLL TO ZOOM · GEOGRAPHIC BASEMAP')}</span></section><section class="node-roster">${['a01','a02','a03'].map((id,i)=>{const data=networkRows[id]||[],sum=D.summary(data,id);return `<a href="${url(active,id)}" data-route="${active}" data-node="${id}" class="node-entry ${id===station?'selected':''}"><span class="node-number">0${i+1}</span><div><h3>DMS—${id.toUpperCase()}</h3><p>${networkRows[id]===null?t('读取失败','Unavailable'):sum.total?t('已有观测记录','Observations archived'):t('等待首组数据','Awaiting first data')}</p></div><div><b>${sum.total.toLocaleString()}</b><small>${t('记录','RECORDS')}</small></div><span>→</span></a>`;}).join('')}</section>`;
  }
  function hardware() {
    const s=D.summary(rows,station),r=s.latest,c=D.channels(station);
    if(deviceView==='concept')instrumentSeen=true;
    const photoName=i=>i===0?t('实物全貌','Exterior view'):t('内部细节','Interior detail');
    const photoSource=i=>'./assets/hardware/01-'+(i===0?'2':'3')+'.jpg';
    const gallery=station==='a01'?`<div class="hardware-photo"><div class="photo-stage"><a class="photo-original" href="${photoSource(photo)}" target="_blank" rel="noopener" aria-label="${t('查看原图','Open original photograph')} · ${photoName(photo)}"><img class="hardware-main-image" src="${photoSource(photo)}" alt="DMS-A01 ${t('硬件实拍','hardware photograph')} ${photo+1}" width="1279" height="1706" decoding="async"><span class="photo-open">${t('查看原图','Original')} ↗</span></a><div class="photo-caption"><span class="photo-serial">0${photo+1}</span><span>${photoName(photo)}</span></div></div><div class="photo-rail" role="group" aria-label="${t('选择实物照片','Choose a hardware photograph')}">${[0,1].map(i=>`<button data-photo="${i}" aria-pressed="${photo===i}" aria-label="${t('查看实物照片','View hardware photograph')} ${i+1}"><span class="photo-preview"><img src="${photoSource(i)}" alt="" width="1279" height="1706" decoding="async"></span><span class="photo-caption"><span class="photo-serial">0${i+1}</span><span>${photoName(i)}</span><span class="photo-select" aria-hidden="true">→</span></span></button>`).join('')}</div><div class="photo-controls"><button data-action="previous-photo" aria-label="${t('上一张','Previous photo')}">←</button><span class="photo-index" aria-live="polite">0${photo+1} / 02</span><button data-action="next-photo" aria-label="${t('下一张','Next photo')}">→</button><span class="photo-provenance">${t('原始实拍','ORIGINAL PHOTOGRAPHS')}</span></div></div>`:`<div class="empty-state"><span class="eyebrow">DMS—${station.toUpperCase()}</span><h2>${t('实物档案待补充','Hardware photographs pending')}</h2><p>${t('不使用其他节点的照片代替。','Other nodes’ photographs are not used as substitutes.')}</p></div>`;
    return `${title()}<div class="device-tabs view-tabs"><button data-device="photos" aria-pressed="${deviceView==='photos'}">${t('实物照片','Hardware photographs')}</button><button data-device="concept" aria-pressed="${deviceView==='concept'}">${t('三维结构','3D structure')}</button></div><div class="hardware-showcase ${deviceView==='photos'?'photo-layout':'concept-layout'}"><section class="instrument-stage ${deviceView==='photos'?'photo-mode':''}">${instrumentSeen?scene('instrument',deviceView!=='concept'):''}${deviceView==='photos'?gallery:`<div class="instrument-legend"><ol><li><b>01</b><span>${t('三面光伏','Tri-face solar')}</span></li><li><b>02</b><span>${t('环境监测舱','Environmental enclosure')}</span></li><li><b>03</b><span>${t('通信与地面锚定','Communication & foundation')}</span></li></ol><p>${t('概念结构示意，实物以档案照片为准。','Concept geometry. Refer to photographs for actual hardware.')}</p></div>`}</section><div class="engineering-sheet"><section class="hardware-file"><h2>${t('工程档案','Engineering file')}</h2><dl>${[[t('设备编号','Designation'),'DMS–'+station.toUpperCase()],[t('防护等级','Enclosure'),'IP66'],[t('电池','Battery'),t('钛酸锂电池','Lithium titanate')],[t('通信','Communication'),'GPS / LoRa'],[t('部署记录','Deployment'),t('地面测试场地 · 地面锚定','Ground test site · Ground anchor')]].map(([a,b])=>`<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl></section><section class="hardware-telemetry"><h2>${t('装置遥测','Instrument telemetry')}</h2><div class="hardware-metrics">${metric(t('电压','Voltage'),n(r.v,3),'V')}${metric(t('电流','Current'),n(r.a),'mA')}${metric(t('舱内温度','Cabin temperature'),n(r[c[0].key]),'°C')}${metric(t('太阳辐射','Solar irradiance'),n(r[c[4].key],0),'W/m²')}</div><p>${badge()} · ${date(r.time)}</p></section></div></div>`;
  }
  function analysis() {
    const s=D.summary(rows,station),groups=[{keys:[station==='a01'?'j':'t','k'],zh:'舱内温湿度',en:'Cabin environment'},{keys:[station==='a01'?'t':'j','h'],zh:'外部环境',en:'Outside environment'},{keys:[station==='a01'?'l':'s'],zh:'太阳辐射',en:'Solar irradiance'},{keys:['v','a'],zh:'电源状态',en:'Power system'},{keys:['x','y'],zh:'GPS定位',en:'GPS position'},{keys:['wind'],zh:'风速监测',en:'Wind speed'},{keys:['b'],zh:'大气压强',en:'Air pressure'},{keys:['d'],zh:'风向',en:'Wind direction'}];
    return `${title()}<section class="analysis-summary"><div class="analysis-total"><strong>${s.total.toLocaleString()}</strong><p>${t('累计记录','Archived records')}</p></div><div>${metric(t('任务跨度','Mission span'),s.days??'—',t('天','days'))}${metric(t('有效数据类别','Recorded data types'),s.channels,'')}${metric(t('最近采集','Last observation'),date(s.latest.time),'')}</div></section><section class="analysis-body"><div class="coverage"><div class="section-heading"><h2>${t('数据覆盖率','Data coverage')}</h2><span>${t('有效 / 总记录','Valid / total')}</span></div>${groups.map((g,i)=>{const count=rows.filter(r=>g.keys.some(k=>D.valid(r[k]))).length,pct=s.total?count/s.total*100:0;return `<div class="coverage-row"><span>0${i+1}</span><b>${g[lang]}</b><div class="coverage-track"><i style="width:${pct}%"></i></div><small>${count} / ${s.total}</small><strong>${s.total?n(pct)+'%':'—'}</strong></div>`;}).join('')}</div><aside class="energy-panel"><div class="energy-ring" style="--charge:${s.soc??0}%"><div><strong>${s.soc??'—'}</strong><span>% SOC</span></div></div><h3>${s.soc===null?t('等待电源数据','Awaiting power data'):s.soc>=60?t('电量正常','Battery normal'):t('低电量','Low battery')}</h3><p>${n(s.voltage,3)} V · ${t('太阳能 + 电池','Solar + battery')}</p><small>${t('电压估算 · 非实测 SOC','Voltage estimate · Not measured SOC')}</small></aside></section><section class="chronology"><div class="section-heading"><h2>${t('任务时间线','Mission chronology')}</h2><span>${s.days??'—'} ${t('天观测跨度','days observed')}</span></div><div class="timeline">${[[s.first,t('任务启动','First observation')],[s.firstS,t('首次待机 S','First standby S')],[s.firstE,t('首次应急 E','First emergency E')],[s.latest,t('最新记录','Latest observation')]].map(([r,l],i)=>`<div><span class="event-point ${r?.time?'recorded':''}"></span><small>0${i+1}</small><h3>${l}</h3><time>${date(r?.time)}</time></div>`).join('')}</div></section>`;
  }
  function globe() {
    return `<section class="globe-stage">${earthScene()}<div class="globe-copy"><h1>${t('全球<br><em>视野</em>','Global<br><em>perspective</em>')}</h1><p>${t('南京 → 东北（哈尔滨）→ 南极','Nanjing → Northeast China → Antarctica')}</p>${link('network',t('观测网络','Network')+' →','solid-link')}<small>${t('示意链路 · 非实际部署','Illustrative route · Not actual deployment')}</small></div></section>`;
  }
  function download() {
    if(client?.native)return `<section class="download-story"><div><h1>DMS<br><em>${t('极地任务客户端','Polar field client')}</em></h1><a class="solid-link" href="https://xin02350-eng.github.io/antarctic-dashboard/expedition.html?client=mobile">${t('打开在线网页版','Open online website')} →</a><dl><div><dt>ANDROID</dt><dd>2.0.1 ${t('预览版','Preview')}</dd></div><div><dt>${t('界面','INTERFACE')}</dt><dd>${t('本地加载','Bundled locally')}</dd></div><div><dt>${t('显示方式','DISPLAY')}</dt><dd>${t('横屏','Landscape')}</dd></div></dl><details class="download-help"><summary>${t('版本说明','About this version')}</summary><p>${t('新版界面已随客户端安装。联网读取最新观测；连接失败时显示标注为离线快照的数据。此预览包使用新签名，不能覆盖旧版安装。','The new interface is bundled with the client. Observations load online; connection failures use a labelled offline snapshot. This preview has a new signing identity and cannot update the old app in place.')}</p></details></div><div class="download-art" aria-hidden="true"><div class="orbit-line"></div><span>DMS</span></div></section>`;
    return `<section class="download-story"><div><h1>${t('DMS<br><em>自主观测系统</em>','DMS<br><em>Autonomous observation system</em>')}</h1><a class="solid-link" href="./apk/DMS-antarctic-2.0.1-preview.apk">${t('下载 Android 2.0.1 测试版','Download Android 2.0.1 preview')} ⇩</a><a class="quiet-link" href="./expedition.html?view=dashboard&station=${station}&client=mobile">${t('体验横屏网页版','Open landscape web app')} →</a><dl><div><dt>ANDROID</dt><dd>5.1+</dd></div><div><dt>${t('安装包','PACKAGE')}</dt><dd>8.69 MiB</dd></div><div><dt>${t('显示方式','DISPLAY')}</dt><dd>${t('横屏 / 全屏','Landscape / Full screen')}</dd></div></dl><p class="muted">${t('可更新 2.0.0 测试版，不能覆盖原 1.7。','Updates the 2.0.0 preview, not the original 1.7 app.')}</p><details class="download-help"><summary>${t('安装与兼容说明','Installation and compatibility')}</summary><p>${t('需要 Chrome / Android System WebView 90+。此包为调试签名测试版，尚未完成真机兼容验证。原版用户请保留旧应用，优先在测试设备安装。微信内请先“在浏览器打开”，下载后按系统提示安装。','Requires Chrome / Android System WebView 90+. This debug-signed preview has not completed physical-device compatibility testing. Keep the original app and use a test device when possible. In WeChat, open this page in your browser before downloading and follow system installation prompts.')}</p><p><a href="./apk/DMS-antarctic.apk">${t('原版 1.7 安装包','Original 1.7 APK')}</a> · <a href="https://cdn.jsdelivr.net/gh/xin02350-eng/antarctic-dashboard@bb40a21/apk/DMS-antarctic.apk">${t('原版镜像','Original mirror')}</a></p></details></div><div class="download-art" aria-hidden="true"><div class="orbit-line"></div><span>DMS</span></div></section>`;
  }
  function cancelChartRender(){
    chartRenderGeneration++;
    if(!chartRenderJob)return;
    if(chartRenderJob.idle)window.cancelIdleCallback(chartRenderJob.id);else clearTimeout(chartRenderJob.id);
    chartRenderJob=null;
  }
  function preserveChartSurfaces(draft){
    // The DOM patcher removes attributes absent from its draft. Keep Chart's
    // backing-store dimensions so updating copy cannot clear a live canvas.
    charts.forEach(chart=>{
      const canvas=chart.canvas,next=canvas?.id&&draft.querySelector('#'+canvas.id);
      if(!next)return;
      ['width','height','style'].forEach(name=>{const value=canvas.getAttribute(name);if(value!==null)next.setAttribute(name,value);});
    });
  }
  function destroyView(preserveCharts=false){
    cancelTableRender();
    window.ExpeditionDependencies?.cancelCharts();
    // A fully unlocked archive can contain tens of thousands of cells. It has
    // no scene state to preserve and must not burden every later route scan.
    if(active!=='telemetry')$('telemetryData')?.replaceChildren();
    cancelChartRender();
    viewQuery('.field-frame')?.contentWindow?.postMessage({type:'dms:field-visibility',visible:false},location.origin);
    viewQuery('.earth-frame')?.contentWindow?.postMessage({type:'dms:earth-visibility',visible:false},location.origin);
    window.ExpeditionActions?.destroy();window.ExpeditionSpecular?.destroy();earthObserver?.disconnect();earthObserver=null;fieldObserver?.disconnect();fieldObserver=null;
    if(!preserveCharts){charts.forEach(c=>c.destroy());charts=[];}
    if(map){map.remove();map=null;}
  }
  function finishSurfaces(){window.ExpeditionIcons?.mount();window.ExpeditionSpecular?.mount();window.ExpeditionActions?.mount();}
  function observeEarth(){
    const frame=viewQuery('.earth-frame');if(!frame)return;
    const send=visible=>frame.contentWindow?.postMessage({type:'dms:earth-visibility',visible},location.origin);
    const sync=()=>{const r=frame.getBoundingClientRect();send(!document.hidden&&document.documentElement.dataset.clientPortrait!=='true'&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight);};
    frame.onload=sync;sync();
    if('IntersectionObserver' in window){earthObserver=new IntersectionObserver(sync,{threshold:0});earthObserver.observe(frame);}
  }
  function fieldVisibility(frame){
    const r=frame.getBoundingClientRect(), coveredTop=$('appHeader').getBoundingClientRect().bottom;
    frame.contentWindow?.postMessage({type:'dms:field-visibility',visible:!document.hidden&&document.documentElement.dataset.clientPortrait!=='true'&&r.width>0&&r.height>0&&r.bottom>coveredTop&&r.top<innerHeight},location.origin);
  }
  function observeField(){
    const frame=viewQuery('.field-frame');if(!frame)return;
    const sync=()=>{
      fieldVisibility(frame);
      const doc=frame.contentDocument, state=doc?.getElementById('polarScene')?.dataset.readyState;
      if(['ready','degraded','unavailable'].includes(state)||doc?.getElementById('sceneFallback')?.hidden===false)frame.closest('.mission-stage')?.classList.add('is-ready');
    };
    frame.onload=sync;sync();
    if('IntersectionObserver' in window){fieldObserver=new IntersectionObserver(()=>fieldVisibility(frame),{threshold:0,rootMargin:`-${Math.ceil($('appHeader').getBoundingClientRect().height)}px 0px 0px 0px`});fieldObserver.observe(frame);}
  }
  function instrumentChannels(){
    const gps=D.summary(rows,station).gps;
    return `<section class="instrument-channels"><div><h2>${t('观测能力','Observation capability')}</h2><p>${D.channels(station).map(c=>c[lang]).join(' / ')} / GPS</p></div><div><h2>${t('最近有效定位','Latest valid position')}</h2><p class="gps-reading">${gps?n(gps.x,6)+'° / '+n(gps.y,6)+'°':'—'}</p><p>${date(gps?.time)} · ${t('卫星数','Satellites')} ${gps?.n??'—'}</p>${link('location',t('查看部署位置','View deployment')+' →')}</div></section>`;
  }
  function networkSummary(){
    const s=D.summary(rows,station),r=s.latest,c=D.channels(station);
    return `<section class="network-summary">${metric(t('舱内温度','Cabin temperature'),n(r[c[0].key]),'°C')}${metric(t('系统电压','System voltage'),n(r.v,3),'V')}${metric(t('电量估算','Charge estimate'),s.soc??'—','%')}${metric(t('观测跨度','Observation span'),s.days??'—',t('天','days'))}<div class="network-trend"><span>${t('舱内温度 · 最近48次采集','CABIN · LAST 48 OBSERVATIONS')}</span><div><canvas id="networkTrend" role="img" aria-label="${t('舱内温度趋势','Cabin temperature trend')}"></canvas></div></div></section>`;
  }
  function render() {
    const preserveCharts=active===renderedView;
    cancelAnimationFrame(paintFrame);destroyView(preserveCharts);header();
    const renderers={dashboard:overview,sensors,telemetry:archive,network,location:network,hardware,analysis,globe,download};
    // Finish the detached draft first; connected scene frames must never be removed just to update a readout.
    const draft=document.createElement('div');draft.innerHTML=renderers[active]();
    if(active==='network'){const atlas=draft.querySelector('.atlas');atlas.classList.add('orbital-atlas');atlas.innerHTML=orbitalNetwork();}
    if(active==='hardware')draft.insertAdjacentHTML('beforeend',instrumentChannels());
    if(['network','location'].includes(active))draft.querySelector('.atlas').insertAdjacentHTML('afterend',networkSummary());
    if(status==='ready'&&client?.offline(station)&&active!=='dashboard')draft.insertAdjacentHTML('afterbegin',`<div class="offline-banner" role="status">${t('离线快照 · 非实时','Offline snapshot · Not live')} <time>${date(rows[0]?.time)}</time><button data-action="refresh">${t('重新连接','Reconnect')}</button></div>`);
    if(status==='error')draft.insertAdjacentHTML('afterbegin',`<div class="error-banner" role="alert">${t('未能读取观测数据，当前不展示过期读数。','Could not read data. Stale readings have been cleared.')} <button data-action="refresh">${t('重试','Retry')}</button></div>`);
    if(preserveCharts)preserveChartSurfaces(draft);
    viewRoot=window.ExpeditionView.route($('view'),active);
    window.ExpeditionView.render(viewRoot,draft.innerHTML);
    renderedView=active;
    observeEarth();observeField();
    $('recordWorkspace').hidden=active!=='telemetry';
    if(active==='telemetry')renderTable();
    paintFrame=requestAnimationFrame(()=>{if(active==='location')drawMap();drawVisibleCharts();});
    finishSurfaces();
    window.ExpeditionAtmosphere?.setView(active);
    tick();
  }
  function chartLoadState(canvas,state){
    const host=canvas?.parentElement;if(!host)return;
    let message=host.querySelector('.chart-load-state');
    if(state==='ready'){message?.remove();host.removeAttribute('aria-busy');return;}
    if(!message){message=document.createElement('div');message.className='chart-load-state';message.setAttribute('role','status');host.appendChild(message);}
    host.setAttribute('aria-busy',String(state==='loading'));
    message.replaceChildren(document.createTextNode(state==='error'?t('曲线暂未加载','Chart unavailable'):t('正在读取曲线…','Loading chart…')));
    if(state==='error'){const button=document.createElement('button');button.className='outline-button';button.dataset.action='retry-charts';button.textContent=t('重试','Retry');message.appendChild(button);}
  }
  function requestCharts(retry=false){
    const canvas=$({dashboard:'overviewChart',sensors:'signalChart',network:'networkTrend',location:'networkTrend'}[active]);
    if(!canvas)return;
    if(!window.ExpeditionDependencies){chartLoadState(canvas,'error');return;}
    window.ExpeditionDependencies.watchCharts(canvas,state=>{
      chartLoadState(canvas,state);
      if(state==='ready')drawVisibleCharts();
    },{immediate:active==='sensors',retry});
  }
  function drawVisibleCharts(){
      cancelChartRender();
      // Keep unchanged plots. Selecting a channel reuses the one main graph.
      charts=charts.filter(chart=>{if(viewRoot?.contains(chart.canvas))return true;chart.destroy();return false;});
      if(document.hidden)return;
      if(!window.Chart){requestCharts();return;}
      viewRoot?.querySelectorAll?.('.chart-load-state').forEach(message=>{message.parentElement?.removeAttribute('aria-busy');message.remove();});
      if(active==='dashboard')drawChart('overviewChart',D.channels(station)[2],rows.slice(0,100));
      if(active==='sensors'){
        const defs=D.channels(station),trend=visibleTrend(),ordered=trend.slice().reverse(),labels=ordered.map(r=>String(r.time).slice(0,16));
        drawChart('signalChart',defs.find(c=>c.key===channel),trend,false,ordered,labels);
      }
      if(active==='network'||active==='location')drawChart('networkTrend',D.channels(station)[0],rows.slice(0,48),true);
  }
  function visibleTrend(){if(range==='all')return rows;if(range==='24h'){const end=D.time(rows[0]?.time);return rows.filter(r=>D.time(r.time)>=end-86400000);}return rows.slice(0,100);}
  function drawChart(id,c,list,mini=false,preparedRows,preparedLabels) {
    const canvas=$(id);if(!canvas||!window.Chart||!c)return;
    const axisTime=lang==='zh'?'采集时间':'Observation time',axisValue=c[lang]+(c.unit?' ('+c.unit+')':'');
    canvas.setAttribute?.('aria-label',mini?c[lang]:c[lang]+(lang==='zh'?'折线图；横轴：':' trend; horizontal axis: ')+axisTime+(lang==='zh'?'；纵轴：':'; vertical axis: ')+axisValue);
    const existing=charts.find(chart=>chart.canvas===canvas),signature=[station,lang,range,c.key,mini].join(':');
    const previous=existing&&chartStates.get(existing);
    if(previous?.rows===rows&&previous.signature===signature)return;
    const ordered=preparedRows||list.slice().reverse();
    const config={type:'line',plugins:window.ExpeditionCharts?[window.ExpeditionCharts.finish(mini)]:[],
      data:{labels:preparedLabels||ordered.map(r=>String(r.time).slice(0,16)),datasets:[{
        label:c[lang]+' / '+c.unit,data:ordered.map(r=>D.valid(r[c.key])?Number(r[c.key]):null),
        borderColor:c.color,backgroundColor:context=>window.ExpeditionCharts?window.ExpeditionCharts.fill(context,c.color):c.color+'0c',
        borderWidth:mini?1.4:1.8,pointRadius:0,pointHoverRadius:4,pointHoverBackgroundColor:'#e2fffa',pointHoverBorderColor:c.color,
        pointHoverBorderWidth:2,pointHitRadius:12,fill:'start',spanGaps:false,tension:.12
      }]},
      options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false},tooltip:{enabled:!mini,backgroundColor:'#111e2af5',titleColor:'#adbfca',bodyColor:'#e1ebf1',padding:12,cornerRadius:9,borderColor:'#d3e5ef2e',borderWidth:1,titleFont:{family:'Consolas',size:11,weight:'normal'},bodyFont:{family:'Segoe UI',size:13}}},
        scales:{x:{display:!mini,title:{display:!mini,text:axisTime},grid:{display:false},ticks:{color:'#9bb0be',maxTicksLimit:6,maxRotation:0,callback:function(value){return this.getLabelForValue(value).slice(5,16);}}},
          y:{display:!mini,title:{display:!mini,text:axisValue},grid:{color:'#bbd4e610'},border:{display:false},ticks:{color:'#9bb0be',maxTicksLimit:5}}}
      }
    };
    if(existing){
      const next=window.ExpeditionCharts?.configure(config,c.key,mini)||config;
      existing.data=next.data;existing.options=next.options;existing.update('none');
      chartStates.set(existing,{rows,signature});
    }else{
      const chart=new Chart(canvas,window.ExpeditionCharts?.configure(config,c.key,mini)||config);
      charts.push(chart);chartStates.set(chart,{rows,signature});
    }
  }
  function mapLoadState(host,state){
    host.setAttribute('aria-busy',String(state==='loading'));
    host.innerHTML=`<div class="empty-state" role="status">${state==='error'?t('地图暂不可用，坐标与记录仍可查看。','Map unavailable. Coordinates and records remain accessible.'):t('正在读取地理底图…','Loading geographic map…')}${state==='error'?`<p><button class="outline-button" data-action="retry-map">${t('重试地图','Retry map')}</button></p>`:''}</div>`;
  }
  function drawMap(retry=false){
    const host=$('atlasMap');if(active!=='location'||!host||map)return;
    const dependencies=window.ExpeditionDependencies;
    if(!dependencies){mapLoadState(host,'error');return;}
    if(dependencies.state('map')!=='ready'){
      if(dependencies.state('map')==='error'&&!retry){mapLoadState(host,'error');return;}
      mapLoadState(host,'loading');
      dependencies.load('map',{retry}).then(()=>{if(active==='location'&&$('atlasMap')===host&&!map)drawMap();},()=>{if(active==='location'&&$('atlasMap')===host&&!map)mapLoadState(host,'error');});
      return;
    }
    if(!window.L){mapLoadState(host,'error');return;}
    host.removeAttribute('aria-busy');
    host.replaceChildren();
    const gps=D.summary(rows,station).gps, center=gps?[Number(gps.x),Number(gps.y)]:[-75,0];
    try{
      map=L.map(host,{zoomControl:true,scrollWheelZoom:true});map.setView(center,gps?7:2);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(map);
      Object.entries({...networkRows,[station]:rows}).forEach(([id,data])=>{const p=D.summary(data||[],id).gps;if(!p)return;L.circleMarker([Number(p.x),Number(p.y)],{radius:id===station?9:5,color:'#bdedda',weight:2,fillColor:'#9bd5c0',fillOpacity:.6}).addTo(map).bindPopup(`<strong>DMS–${id.toUpperCase()}</strong><br>${date(p.time)}<br><a href="${url('dashboard',id)}">${t('进入任务现场','Open mission')}</a>`);});
      if(!gps)host.insertAdjacentHTML('beforeend',`<div class="map-empty-note">${t('此节点暂无有效GPS记录，底图显示项目应用区域，不代表已部署。','No GPS observations for this node. Map shows the application region, not a deployment.')}</div>`);
    }catch(e){try{map?.remove();}catch(ignore){}map=null;mapLoadState(host,'error');}
  }
  function sameObservations(left,right){
    if(left===right)return true;
    if(!Array.isArray(left)||!Array.isArray(right)||left.length!==right.length)return false;
    for(let i=0;i<left.length;i++){
      const a=left[i],b=right[i];if(a===b)continue;
      if(!a||!b)return false;
      const keys=Object.keys(a);if(keys.length!==Object.keys(b).length)return false;
      for(const key of keys){
        if(!Object.prototype.hasOwnProperty.call(b,key))return false;
        const value=a[key],other=b[key];
        if(value!==other&&(!(value&&other&&typeof value==='object'&&typeof other==='object')||JSON.stringify(value)!==JSON.stringify(other)))return false;
      }
    }
    return true;
  }
  async function fetchObservations(id,signal){
    if(client?.native)return D.normalize(await client.readObservations(D.sources[id],signal));
    let timer;
    const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Observation request timed out')),15000);});
    const read=(async()=>{
      const options={cache:'no-store'};if(signal)options.signal=signal;
      const response=await fetch('./'+D.sources[id],options);if(!response.ok)throw Error('HTTP '+response.status);
      return D.normalize(await response.json());
    })();
    try{return await Promise.race([read,timeout]);}finally{clearTimeout(timer);}
  }
  async function load(quiet=false){
    const request=++generation,requestStation=station;if(controller)controller.abort();controller=typeof AbortController==='function'?new AbortController():null;const localController=controller;
    if(!quiet){status='loading';rows=[];render();}refreshing=true;
    try{
      const wasOffline=client?.offline(requestStation);
      const next=await fetchObservations(requestStation,localController?.signal);if(request!==generation)return;
      const unchanged=quiet&&status==='ready'&&wasOffline===client?.offline(requestStation)&&sameObservations(next,rows);
      if(!unchanged)rows=next;networkRows[requestStation]=rows;status='ready';refreshing=false;if(!unchanged)render();
      if(active==='network'||active==='location'){
        let networkChanged=false;
        await Promise.all(Object.keys(D.sources).filter(id=>id!==requestStation).map(async id=>{try{const other=await fetchObservations(id,localController?.signal);if(request===generation&&!sameObservations(other,networkRows[id])){networkRows[id]=other;networkChanged=true;}}catch(e){if(request===generation&&networkRows[id]!==null){networkRows[id]=null;networkChanged=true;}}}));
        if(request===generation&&networkChanged)render();
      }
    }catch(e){if(request!==generation)return;localController?.abort();rows=[];status='error';refreshing=false;render();}
  }
  function readRoute(){const p=new URLSearchParams(location.search);active=views.includes(p.get('view'))?p.get('view'):'dashboard';station=Object.prototype.hasOwnProperty.call(D.sources,p.get('station'))?p.get('station'):'a01';}
  function navigate(view,node=station){
    if(view==='hardware'&&active!=='hardware')deviceView='photos';
    const changed=node!==station;active=view;station=node;
    history.pushState({},'',url(view,node));
    if(changed){channel=null;const lock=document.querySelector('.access-lock');if(lock&&!lock.hidden)lock.click();load();}
    else{render();if(['network','location'].includes(view))load(true);}
    $('content').focus({preventScroll:true});window.scrollTo({top:0,left:0,behavior:'instant'});
  }
  document.addEventListener('click',e=>{
    const a=e.target.closest('[data-route]');if(a&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&e.button===0){e.preventDefault();navigate(a.dataset.route,a.dataset.node||station);return;}
    const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.channel&&b.dataset.channel!==channel){channel=b.dataset.channel;render();window.scrollTo({top:0,behavior:'smooth'});}
    if(b.dataset.range&&b.dataset.range!==range){range=b.dataset.range;render();}
    if(b.dataset.device){deviceView=b.dataset.device;render();}
    if(b.dataset.photo!==undefined){photo=Number(b.dataset.photo)===1?1:0;render();viewQuery('.photo-original')?.focus({preventScroll:true});}
    if(b.dataset.action==='language'){lang=lang==='zh'?'en':'zh';try{localStorage.setItem('anx-lang',lang);}catch(e){}document.documentElement.dataset.lang=lang;window.dispatchEvent(new Event('anx:langchange'));render();}
    if(b.dataset.action==='refresh')load(true);
    if(b.dataset.action==='retry-charts')requestCharts(true);
    if(b.dataset.action==='retry-map')drawMap(true);
    if(['previous-photo','next-photo'].includes(b.dataset.action)){photo=photo===0?1:0;render();}
  });
  document.addEventListener('visibilitychange',()=>{const frame=viewQuery('.field-frame');if(frame)fieldVisibility(frame);if(document.hidden)cancelChartRender();else drawVisibleCharts();});
  window.addEventListener('dms:client-orientation',()=>{const frame=viewQuery('.field-frame');if(frame)fieldVisibility(frame);earthObserver?.disconnect();observeEarth();});
  window.addEventListener('message',e=>{
    const frame=viewQuery('.field-hero .field-frame');
    if(e.origin!==location.origin||!frame||e.source!==frame.contentWindow)return;
    if(e.data?.type==='dms:field-ready'&&['ready','degraded','unavailable'].includes(e.data.state))frame.closest('.mission-stage')?.classList.add('is-ready');
    if(e.data?.type==='dms:field-scroll'){const delta=e.data.deltaY;if(Number.isFinite(delta))window.scrollBy({top:Math.max(-innerHeight,Math.min(innerHeight,delta)),left:0,behavior:'instant'});}
  });
  window.addEventListener('anx:telemetryaccess',()=>{if(active==='telemetry'){renderTable();finishSurfaces();}});
  window.addEventListener('popstate',()=>{const before=station;readRoute();if(before!==station){channel=null;const lock=document.querySelector('.access-lock');if(lock&&!lock.hidden)lock.click();load();}else{render();if(['network','location'].includes(active))load(true);}});
  function tick(){const clock=$('clock');if(clock)clock.textContent=new Date().toISOString().slice(11,19)+' UTC';}
  setInterval(tick,1000);setInterval(()=>{if(!document.hidden&&!refreshing)load(true);},60000);
  function useMobileLayout(){
    if(client?.mobile)return false;
    if(window.matchMedia('(min-width:769px)').matches)return false;
    const family=['dashboard','location','sensors','telemetry','hardware','analysis'].includes(active);
    const destination=active==='globe'?'index.html?view=globe':family?active+(station==='a01'?'':'-'+station)+'.html':active+'.html';
    location.replace('./'+destination);return true;
  }
  readRoute();if(useMobileLayout())return;
  const desktopMedia=window.matchMedia('(min-width:769px)');
  if(typeof desktopMedia.addEventListener==='function')desktopMedia.addEventListener('change',useMobileLayout);
  else desktopMedia.addListener?.(useMobileLayout);
  document.documentElement.dataset.lang=lang;window.dispatchEvent(new Event('anx:langchange'));load();
})();
