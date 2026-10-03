/* Optical chart treatment. Labels, observations, units and numeric scales are never rewritten. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExpeditionCharts=api;})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const palette=Object.freeze({t:'#b8d2df',j:'#b8d2df',k:'#adbec8',h:'#adbec8',s:'#cbd6dc',l:'#cbd6dc',a:'#b7c5d4',v:'#b8cbd5',wind:'#a9cbdc',b:'#aebecf',d:'#c2ced8'});
  const gradients=new WeakMap();
  const color=value=>typeof value==='string'&&/^#[\da-f]{6}$/i.test(value)?value:'#b8d2df';
  const can=(ctx,names)=>ctx&&names.every(name=>typeof ctx[name]==='function');
  const finiteArea=area=>area&&['left','right','top','bottom'].every(key=>Number.isFinite(area[key]))&&area.right>area.left&&area.bottom>area.top;
  const clip=(ctx,area)=>{ctx.beginPath();ctx.rect(area.left,area.top,area.right-area.left,area.bottom-area.top);ctx.clip();};
  function fill(context,lineColor,mini=false){
    const ink=color(lineColor),chart=context&&context.chart,ctx=chart&&chart.ctx,area=chart&&chart.chartArea;
    if(!area||!Number.isFinite(area.top)||!Number.isFinite(area.bottom)||area.bottom<=area.top||!can(ctx,['createLinearGradient']))return ink+'10';
    // The scriptable fill runs repeatedly during hover. Reuse its optical layer until the plot resizes.
    let cached=gradients.get(chart);
    const dpr=Number.isFinite(chart.currentDevicePixelRatio)&&chart.currentDevicePixelRatio>0?chart.currentDevicePixelRatio:1;
    const key=[area.top,area.bottom,dpr,ink,mini?1:0].join(':');
    if(cached&&cached.ctx===ctx&&cached.key===key)return cached.value;
    const value=ctx.createLinearGradient(0,area.top,0,area.bottom);
    if(!value||typeof value.addColorStop!=='function')return ink+'10';
    value.addColorStop(0,ink+(mini?'18':'24'));value.addColorStop(.55,ink+(mini?'06':'09'));value.addColorStop(1,ink+'00');
    cached={ctx,key,value};gradients.set(chart,cached);return value;
  }
  function configure(config,channelKey,mini=false){
    if(!config||typeof config!=='object')return config;
    const ink=palette[channelKey]||palette.t;
    for(const dataset of config.data?.datasets||[]){
      if(!dataset||typeof dataset!=='object')continue;
      Object.assign(dataset,{borderColor:ink,backgroundColor:context=>fill(context,ink,mini),borderWidth:mini?1.25:1.6,borderCapStyle:'round',borderJoinStyle:'round',pointRadius:0,pointHoverRadius:mini?0:2.4,pointHoverBackgroundColor:'#e1ebf1',pointHoverBorderColor:ink,pointHoverBorderWidth:1,pointHitRadius:12});
    }
    const options=config.options||(config.options={});
    options.animation=false;options.responsive=true;options.maintainAspectRatio=false;
    const layout=options.layout||(options.layout={});
    layout.padding={top:mini?2:8,right:mini?2:7,bottom:0,left:0};
    const plugins=options.plugins||(options.plugins={});
    const tooltip=plugins.tooltip||(plugins.tooltip={});
    Object.assign(tooltip,{enabled:!mini,backgroundColor:'#111e2af5',titleColor:'#adbfca',bodyColor:'#e1ebf1',padding:12,cornerRadius:9,borderColor:'#d3e5ef2e',borderWidth:1,displayColors:false,caretSize:4,caretPadding:9,bodySpacing:6,titleMarginBottom:8,titleFont:{family:'Consolas, monospace',size:11,weight:'normal'},bodyFont:{family:'Segoe UI, sans-serif',size:13,weight:'500'}});
    const scales=options.scales||(options.scales={});
    for(const key of ['x','y']){
      const scale=scales[key]||(scales[key]={});scale.display=!mini;
      const grid=scale.grid||(scale.grid={});
      Object.assign(grid,{color:'#bbd4e610',drawTicks:false});if(key==='x')grid.display=false;
      const border=scale.border||(scale.border={});border.display=false;
      const ticks=scale.ticks||(scale.ticks={});
      Object.assign(ticks,{color:'#9bb0be',padding:10,font:{family:'Consolas, monospace',size:11,weight:'normal'}});
    }
    return config;
  }
  function finish(mini=false){return {id:'polarOptics',afterDatasetsDraw(chart){
    const ctx=chart&&chart.ctx,area=chart&&chart.chartArea;
    if(!finiteArea(area)||!can(ctx,['save','restore','beginPath','rect','clip','arc','fill','stroke']))return;
    const datasets=chart.data?.datasets;if(!datasets||typeof chart.getDatasetMeta!=='function')return;
    const dataset=datasets[0],meta=chart.getDatasetMeta(0);
    if(!dataset||!meta||meta.hidden)return;
    const samples=dataset.data,tail=meta.data&&meta.data[meta.data.length-1],last=samples&&samples[samples.length-1];
    // Never search backwards for a point: a missing final sample must remain visibly missing.
    if(tail&&!tail.skip&&Number.isFinite(last)){
      const position=typeof tail.getProps==='function'?tail.getProps(['x','y'],true):tail;
      const x=position?.x,y=position?.y;
      if(Number.isFinite(x)&&Number.isFinite(y)&&x>=area.left&&x<=area.right&&y>=area.top&&y<=area.bottom){
        const ink=color(dataset.borderColor);ctx.save();
        try{
          clip(ctx,area);ctx.shadowBlur=0;ctx.lineWidth=.75;
          if(!mini){ctx.strokeStyle=ink+'78';ctx.beginPath();ctx.arc(x,y,3.1,0,Math.PI*2);ctx.stroke();}
          ctx.fillStyle=mini?ink:'#e1ebf1';ctx.beginPath();ctx.arc(x,y,mini?1.2:1.55,0,Math.PI*2);ctx.fill();
        }finally{ctx.restore();}
      }
    }
    if(mini||typeof chart.getActiveElements!=='function'||!can(ctx,['moveTo','lineTo','setLineDash']))return;
    const active=chart.getActiveElements();if(!Array.isArray(active))return;
    const item=active.find(item=>{
      const index=item?.datasetIndex??0,series=datasets[index],point=item?.element;
      return point&&!point.skip&&Number.isFinite(series?.data?.[item.index]);
    });
    if(!item)return;
    const x=item.element.x,y=item.element.y;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<area.left||x>area.right||y<area.top||y>area.bottom)return;
    const dpr=Number.isFinite(chart.currentDevicePixelRatio)&&chart.currentDevicePixelRatio>0?chart.currentDevicePixelRatio:1;
    const opticalX=(Math.round(x*dpr)+.5)/dpr,opticalY=(Math.round(y*dpr)+.5)/dpr;
    ctx.save();
    try{
      clip(ctx,area);ctx.shadowBlur=0;ctx.lineWidth=.75;ctx.strokeStyle='#d2e2ea46';ctx.setLineDash([2,5]);
      ctx.beginPath();ctx.moveTo(opticalX,area.top);ctx.lineTo(opticalX,area.bottom);ctx.stroke();
      ctx.strokeStyle='#d2e2ea26';ctx.beginPath();ctx.moveTo(area.left,opticalY);ctx.lineTo(opticalX,opticalY);ctx.stroke();
      ctx.setLineDash([]);ctx.strokeStyle='#cfdee9a6';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(opticalX,area.bottom-4);ctx.lineTo(opticalX,area.bottom);ctx.moveTo(area.left,opticalY);ctx.lineTo(area.left+4,opticalY);ctx.stroke();
    }finally{ctx.restore();}
  }};}
  return {fill,finish,configure,palette};
});
