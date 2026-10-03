(function(){
  const query=new URLSearchParams(location.search), station=query.get('station');
  if (/^a0[123]$/.test(station)) window.dispatchEvent(new CustomEvent('polar:station',{detail:station}));
  const en=query.get('lang')==='en';
  document.documentElement.dataset.language=en?'en':'zh';
  document.querySelectorAll('[data-view]').forEach((b,i)=>{if(en)b.textContent=['Wide','Detail','Above'][i];});
  const motion=document.getElementById('motionToggle');
  if(motion){const update=()=>{const paused=motion.getAttribute('aria-pressed')==='true';const label=en?(paused?'Resume scene':'Pause scene'):(paused?'继续场景动画':'暂停场景动画');motion.setAttribute('aria-label',label);motion.setAttribute('title',label);};
  window.addEventListener('polar:motion',update);update();}
})();
