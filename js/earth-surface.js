/* Adapted from index.html V49: original latitude palette, graticule,
   continental outlines, rivers and reference lines. Local geography only. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EarthSurface=api;})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  function project(lng,lat,w,h){return [(lng+180)/360*w,(lat+90)/180*h];}
  function lines(g){if(!g)return [];if(g.type==='Polygon'||g.type==='MultiLineString')return g.coordinates;if(g.type==='MultiPolygon')return g.coordinates.flat();return g.type==='LineString'?[g.coordinates]:[];}
  function configure(T,renderer,map){
    map.flipY=false;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;map.encoding=T.sRGBEncoding;return map;
  }
  function texture(T,renderer,geography){
    const canvas=document.createElement('canvas');canvas.width=4096;canvas.height=2048;
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,g=ctx.createLinearGradient(0,0,0,h);
    // V49 latitude colors are decorative, not measured temperature.
    [[0,'#040b16'],[.12,'#06111d'],[.30,'#081a29'],[.42,'#0b2030'],[.50,'#0d2434'],[.58,'#0b2030'],[.70,'#081a29'],[.88,'#06111d'],[1,'#040b16']].forEach(([p,c])=>g.addColorStop(p,c));
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    // Unwrap polygon rings and repeat across the seam, retaining Russia/Antarctica.
    for(const f of geography.countries?.features||[]){
      const polygons=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:f.geometry.type==='Polygon'?[f.geometry.coordinates]:[];
      ctx.fillStyle=f.properties?.ADM0_A3==='ATA'?'#29404b':'#193644';
      for(const polygon of polygons)for(const offset of [-w,0,w]){
        ctx.beginPath();for(const ring of polygon){let last=null;const polarCap=ring.some(p=>Math.abs(p[1])===90);for(let i=0;i<ring.length;i++){let [x,y]=project(...ring[i],w,h);if(last!==null&&!polarCap){while(x-last>w/2)x-=w;while(x-last<-w/2)x+=w;}if(i===0)ctx.moveTo(x+offset,y);else ctx.lineTo(x+offset,y);last=x;}ctx.closePath();}ctx.fill('evenodd');
      }
    }
    for(let i=0;i<=36;i++){ctx.strokeStyle=i%3?'#80bedb0b':'#80bedb20';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(i*w/36,0);ctx.lineTo(i*w/36,h);ctx.stroke();}
    for(let i=0;i<=18;i++){ctx.strokeStyle=i===9?'#a1d8ed35':'#80bedb12';ctx.beginPath();ctx.moveTo(0,i*h/18);ctx.lineTo(w,i*h/18);ctx.stroke();}
    function paint(features,color,width){ctx.lineWidth=width;ctx.lineJoin='round';ctx.strokeStyle=color;for(const f of features||[])for(const ring of lines(f.geometry)){ctx.beginPath();let last=null;for(const [lng,lat] of ring){const [x,y]=project(lng,lat,w,h);if(last===null||Math.abs(x-last)>w/2)ctx.moveTo(x,y);else ctx.lineTo(x,y);last=x;}ctx.stroke();}}
    paint(geography.countries?.features,'#76cad440',4.2);
    paint(geography.countries?.features,'#91ced5',1.15);paint(geography.geolines?.features,'#96d2f022',.8);paint(geography.rivers?.features,'#78beeb35',.9);
    return configure(T,renderer,new T.CanvasTexture(canvas));
  }
  return {project,lines,texture,configure};
});
