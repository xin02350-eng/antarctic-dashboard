(function(){
  const query=new URLSearchParams(location.search), station=query.get('station');
  if (/^a0[123]$/.test(station)) window.dispatchEvent(new CustomEvent('polar:station',{detail:station}));
  const en=query.get('lang')==='en';
  if(query.get('client')==='mobile')document.documentElement.setAttribute('data-client','mobile');
  document.documentElement.lang=en?'en':'zh-CN';
  document.documentElement.dataset.language=en?'en':'zh';
  document.querySelectorAll('[data-view]').forEach((b,i)=>{if(en)b.textContent=['Wide','Detail','Above'][i];});
  const controls=document.querySelector('.view-controls');
  if(controls)controls.setAttribute('aria-label',en?'Choose instrument view':'选择装置视角');
  const fallback=document.getElementById('sceneFallback');
  if(fallback)fallback.textContent=en?'3D is temporarily unavailable. Observation records and data remain accessible.':'三维场景暂不可用。观测记录与数据功能仍可正常使用。';
  const environment=document.getElementById('environmentStatus');
  if(environment){environment.setAttribute('role','status');environment.textContent=environment.dataset[en?'en':'zh']||(en?'Loading polar environment…':'正在加载极地环境…');}
  const motion=document.getElementById('motionToggle');
  if(motion){const update=()=>{const paused=motion.getAttribute('aria-pressed')==='true';const label=en?(paused?'Resume scene':'Pause scene'):(paused?'继续场景动画':'暂停场景动画');motion.setAttribute('aria-label',label);motion.setAttribute('title',label);};
  window.addEventListener('polar:motion',update);update();}
})();
