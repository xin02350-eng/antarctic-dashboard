/* Project illustration, faithfully migrated from index.html NJ / NE / AN.
   These are presentation anchors, NOT live station GPS or communication links. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EarthNetwork=api;})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const nodes=[
    {id:'nanjing',code:'01 / NJ',lat:31.9,lng:118.8,zh:'南京',en:'NANJING',dx:30,dy:30},
    {id:'northeast',code:'02 / NE',lat:45.75,lng:126.65,zh:'东北 · 哈尔滨',en:'NORTHEAST / HARBIN',dx:38,dy:-36},
    {id:'antarctica',code:'03 / AN',lat:-82,lng:70,zh:'南极 · 应用场景',en:'ANTARCTIC SCENARIO',dx:30,dy:-30}
  ];
  const routes=[{from:'nanjing',to:'northeast',height:7},{from:'northeast',to:'antarctica',height:24}];
  function point(lat,lng,r=101){const a=lat*Math.PI/180,b=lng*Math.PI/180;return [r*Math.cos(a)*Math.sin(b),r*Math.sin(a),r*Math.cos(a)*Math.cos(b)];}
  function route(a,b,height=24,segments=160){
    const u=point(a.lat,a.lng,1),v=point(b.lat,b.lng,1),angle=Math.acos(Math.max(-1,Math.min(1,u.reduce((s,n,i)=>s+n*v[i],0))));
    return Array.from({length:segments+1},(_,i)=>{const t=i/segments,r=101.2+height*Math.sin(Math.PI*t),d=Math.sin(angle);return u.map((n,j)=>r*(angle<1e-8?n:(n*Math.sin((1-t)*angle)+v[j]*Math.sin(t*angle))/d));});
  }
  return {nodes,routes,point,route};
});
