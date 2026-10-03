/* Original blue-line Earth: isolated from data UI, one bounded render loop. */
(function(){
  'use strict';
  const T=window.THREE,N=window.EarthNetwork,q=new URLSearchParams(location.search),en=q.get('lang')==='en';
  const fallback=document.getElementById('globeFallback'),status=document.getElementById('globeStatus'),tr=(zh,eng)=>en?eng:zh;
  document.documentElement.lang=en?'en':'zh-CN';document.querySelectorAll('[data-zh]').forEach(e=>e.textContent=e.dataset[en?'en':'zh']);
  const viewport=document.getElementById('earthViewport');viewport.setAttribute('aria-label',tr('三维地球，方向键旋转，加减键缩放','3D Earth. Arrow keys rotate, plus and minus zoom.'));
  const startupClock=typeof performance!=='undefined'?()=>performance.now():()=>0;
  viewport.dataset.runtimeStartMs=startupClock().toFixed(1);
  let renderer;
  try{if(!T||!N||!window.EarthSurface)throw Error('runtime');renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}
  catch(e){fallback.hidden=false;status.textContent=tr('三维场景不可用','3D unavailable');document.querySelectorAll('button').forEach(b=>b.disabled=true);return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputEncoding=T.sRGBEncoding;viewport.append(renderer.domElement);
  renderer.domElement.style.opacity='0';viewport.setAttribute('aria-busy','true');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,.1,1600);scene.add(new T.AmbientLight(0xa7cee0,.48));const key=new T.DirectionalLight(0xcde9ef,.85);key.position.set(-160,180,220);scene.add(key);
  const material=new T.MeshPhongMaterial({color:0x112630,shininess:2,specular:0x020609});
  // Match the previous globe's radius, tessellation and UV orientation exactly.
  // Routes and controls already belong to us; no second globe engine is needed.
  const earth=new T.Group(),surface=new T.Mesh(new T.SphereGeometry(100,75,75),material);
  surface.rotation.y=-Math.PI/2;earth.add(surface);scene.add(earth);
  const rim=new T.Mesh(new T.SphereGeometry(100.7,96,64),new T.ShaderMaterial({
    vertexShader:'varying vec3 n;varying vec3 eye;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);eye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec3 n;varying vec3 eye;void main(){float f=pow(1.0-max(0.0,dot(normalize(n),normalize(eye))),4.5);gl_FragColor=vec4(0.24,0.68,0.82,f*0.46);}',
    transparent:true,depthWrite:false,blending:T.AdditiveBlending
  }));earth.add(rim);
  function point(lat,lng,r=101){const a=lat*Math.PI/180,b=lng*Math.PI/180;return new T.Vector3(r*Math.cos(a)*Math.sin(b),r*Math.sin(a),r*Math.cos(a)*Math.cos(b));}
  const locations=N.nodes,labels=[],beacons=[];
  viewport.setAttribute('aria-label',tr('三维地球：南京、东北哈尔滨、南极；方向键旋转，加减键缩放','3D Earth: Nanjing, Northeast Harbin, Antarctica; arrows rotate, plus/minus zoom'));
  locations.forEach((p,i)=>{
    const dot=new T.Mesh(new T.SphereGeometry(.65,16,12),new T.MeshBasicMaterial({color:0xe4ffff}));dot.position.copy(point(p.lat,p.lng,101.4));earth.add(dot);
    for(let j=0;j<2;j++){const ring=new T.Mesh(new T.RingGeometry(1.65+j*.95,1.85+j*.95,64),new T.MeshBasicMaterial({color:0x9bf1ec,side:T.DoubleSide,transparent:true,opacity:j?.25:.8,depthWrite:false}));ring.position.copy(point(p.lat,p.lng,101.4));ring.lookAt(point(p.lat,p.lng,150));earth.add(ring);if(j)beacons.push({ring,phase:i*.33});}
    const el=document.createElement('span');el.className='earth-label';el.dataset.node=p.id;
    el.innerHTML=`<small>${p.code}</small><b>${p[en?'en':'zh']}</b><em>${Math.abs(p.lat).toFixed(2)}°${p.lat<0?'S':'N'} / ${p.lng.toFixed(2)}°E</em>`;
    el.hidden=true;document.getElementById('earthLabels').append(el);labels.push({el,local:point(p.lat,p.lng,102),dx:p.dx,dy:p.dy});
  });
  const streams=N.routes.map((route,i)=>{
    const a=N.nodes.find(n=>n.id===route.from),b=N.nodes.find(n=>n.id===route.to),arc=N.route(a,b,route.height).map(p=>new T.Vector3(...p));
    const curve=new T.CatmullRomCurve3(arc);
    earth.add(new T.Mesh(new T.TubeGeometry(curve,160,.055,5,false),new T.MeshBasicMaterial({color:0x8ee9e0,transparent:true,opacity:.8})));
    earth.add(new T.Mesh(new T.TubeGeometry(curve,160,.24,5,false),new T.MeshBasicMaterial({color:0x56dbe5,transparent:true,opacity:.09,depthWrite:false,blending:T.AdditiveBlending})));
    const tail=Array.from({length:16},(_,j)=>{const mesh=new T.Mesh(new T.SphereGeometry(j===0?.7:.26,8,6),new T.MeshBasicMaterial({color:j===0?0xf0fffc:0x91e7e4,transparent:true,opacity:(1-j/16)*.9,depthWrite:false}));earth.add(mesh);return mesh;});
    return {arc,tail,phase:i*.47};
  });
  const orbit=new T.Group();scene.add(orbit);
  function circle(radius,opacity){const points=[];for(let i=0;i<=180;i++){const a=i/180*Math.PI*2;points.push(new T.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));}const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0x77b3d1,transparent:true,opacity}));line.rotation.set(.42,0,.22);orbit.add(line);}
  circle(127,.23);circle(130,.08);const ticks=[];for(let i=0;i<120;i++){const a=i/120*Math.PI*2,r=i%10?131.5:135;ticks.push(Math.cos(a)*130,0,Math.sin(a)*130,Math.cos(a)*r,0,Math.sin(a)*r);}const tickGeo=new T.BufferGeometry();tickGeo.setAttribute('position',new T.Float32BufferAttribute(ticks,3));const tickLines=new T.LineSegments(tickGeo,new T.LineBasicMaterial({color:0x82bfd9,transparent:true,opacity:.35}));tickLines.rotation.set(.42,0,.22);orbit.add(tickLines);
  let distance=390,dragging=false,x=0,y=0,paused=false,inView=true,contextLost=false,disposed=false,target=null;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');paused=reduced.matches;earth.rotation.set(.48,-2.05,0);
  let raf=0,last=0,time=0;const world=new T.Vector3(),normal=new T.Vector3(),toCamera=new T.Vector3();
  function resize(){const w=innerWidth,h=innerHeight;camera.aspect=w/h;camera.setViewOffset(w,h,-w*.16,0,w,h);camera.updateProjectionMatrix();renderer.setSize(w,h);wake();}
  const spin=document.getElementById('spinEarth');function updateSpin(){spin.textContent=paused?tr('开启自转','Auto orbit'):tr('停止自转','Stop orbit');spin.setAttribute('aria-pressed',String(!paused));}updateSpin();spin.addEventListener('click',()=>{paused=!paused;updateSpin();wake();});
  function focusView(view){target=view==='polar'?{x:-1.43,y:-1.22}:{x:.48,y:-2.05};distance=390;document.querySelectorAll('[data-earth-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.earthView===view)));wake();}
  document.querySelectorAll('[data-earth-view]').forEach(b=>b.addEventListener('click',()=>focusView(b.dataset.earthView)));document.getElementById('resetGlobe').addEventListener('click',()=>focusView('network'));
  const canvas=renderer.domElement;canvas.addEventListener('pointerdown',e=>{dragging=true;target=null;x=e.clientX;y=e.clientY;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!dragging)return;earth.rotation.y+=(e.clientX-x)*.005;earth.rotation.x=Math.max(-1.5,Math.min(1.5,earth.rotation.x+(e.clientY-y)*.005));x=e.clientX;y=e.clientY;wake();});['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,()=>dragging=false));canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(300,Math.min(520,distance+e.deltaY*.12));wake();},{passive:false});
  viewport.addEventListener('keydown',e=>{const moves={ArrowLeft:[0,-.08],ArrowRight:[0,.08],ArrowUp:[-.08,0],ArrowDown:[.08,0]};if(moves[e.key]){e.preventDefault();target=null;earth.rotation.x=Math.max(-1.5,Math.min(1.5,earth.rotation.x+moves[e.key][0]));earth.rotation.y+=moves[e.key][1];wake();}if(['+','=','-'].includes(e.key)){e.preventDefault();distance=Math.max(300,Math.min(520,distance+(e.key==='-'?12:-12)));wake();}});
  function frame(now){raf=0;if(disposed||document.hidden||!inView||contextLost||!map)return;const dt=last?Math.min((now-last)/1000,.05):0;last=now;time+=paused||reduced.matches?0:dt;
    if(target){const blend=reduced.matches?1:1-Math.exp(-dt*5);earth.rotation.x+=(target.x-earth.rotation.x)*blend;earth.rotation.y+=(target.y-earth.rotation.y)*blend;if(Math.abs(target.x-earth.rotation.x)+Math.abs(target.y-earth.rotation.y)<.001)target=null;}else if(!paused&&!dragging&&!reduced.matches)earth.rotation.y+=dt*.008;
    streams.forEach(s=>s.tail.forEach((p,j)=>p.position.copy(s.arc[Math.floor(((time*.1+s.phase-j*.004+1)%1)*(s.arc.length-1))])));beacons.forEach(b=>{const f=(time*.28+b.phase)%1;b.ring.scale.setScalar(1+f*1.6);b.ring.material.opacity=(1-f)*.32;});camera.position.set(0,0,distance);camera.lookAt(0,0,0);camera.updateMatrixWorld();earth.updateMatrixWorld();
    labels.forEach(label=>{world.copy(label.local).applyMatrix4(earth.matrixWorld);normal.copy(label.local).normalize().transformDirection(earth.matrixWorld);toCamera.copy(camera.position).sub(world).normalize();const facing=normal.dot(toCamera)>.18;world.project(camera);label.el.hidden=!facing||Math.abs(world.x)>.93||Math.abs(world.y)>.9;if(!label.el.hidden){label.el.style.left=Math.min(innerWidth-165,Math.max(innerWidth*.43,(world.x+1)/2*innerWidth+label.dx))+'px';label.el.style.top=Math.max(75,Math.min(innerHeight-130,(1-world.y)/2*innerHeight+label.dy))+'px';}});
    renderer.render(scene,camera);if(!viewport.dataset.firstDrawMs)viewport.dataset.firstDrawMs=startupClock().toFixed(1);
    if(map&&!viewport.dataset.visibleFrameMs){renderer.domElement.style.opacity='1';viewport.setAttribute('aria-busy','false');viewport.dataset.visibleFrameMs=startupClock().toFixed(1);}
    if(!paused&&!reduced.matches||target||dragging)raf=requestAnimationFrame(frame);
  }
  function wake(){viewport.dataset.runtimeActive=String(!disposed&&inView&&!document.hidden&&!contextLost);if(!raf&&!disposed&&inView&&!document.hidden&&!contextLost)raf=requestAnimationFrame(frame);}
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{last=0;wake();});window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='dms:earth-visibility')return;inView=e.data.visible===true;last=0;wake();});reduced.addEventListener('change',()=>{if(reduced.matches)paused=true;updateSpin();wake();});canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;fallback.hidden=false;cancelAnimationFrame(raf);raf=0;});canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;fallback.hidden=true;wake();});
  const abort=new AbortController();let map;
  function installMap(texture,complete,mode){if(disposed){texture.dispose();return;}map=texture;material.map=map;material.color.set(0xffffff);material.needsUpdate=true;viewport.dataset.surfaceSource=mode;status.textContent=complete?tr('蓝线地球 / 本地地理数据','BLUE-LINE EARTH / LOCAL GEOGRAPHY'):tr('地理边界暂未加载','GEOGRAPHIC BOUNDARIES UNAVAILABLE');wake();}
  function geographyFallback(){if(disposed)return;Promise.all(['countries','geolines','rivers'].map(async name=>{try{const r=await fetch('./assets/geo/'+name+'.json',{signal:abort.signal});if(!r.ok)throw Error('geography');return [name,await r.json()];}catch(e){return [name,null];}})).then(entries=>{if(disposed)return;const geography=Object.fromEntries(entries);installMap(EarthSurface.texture(T,renderer,geography),!!geography.countries,'runtime');});}
  // The same lossless 4096 × 2048 painter output is built once, not on every visit.
  const pendingMap=new T.TextureLoader().load('./assets/geo/earth-surface-v1.webp',texture=>installMap(EarthSurface.configure(T,renderer,texture),true,'precompiled'),undefined,geographyFallback);
  // Warm exactly the mapped material variant during the download/decode window.
  // compile() creates programs only: no empty Earth is drawn or texture uploaded.
  if(pendingMap){material.map=EarthSurface.configure(T,renderer,pendingMap);material.color.set(0xffffff);material.needsUpdate=true;renderer.compile(scene,camera);viewport.dataset.shaderWarmMs=startupClock().toFixed(1);}
  window.addEventListener('pagehide',()=>{disposed=true;abort.abort();cancelAnimationFrame(raf);scene.traverse(o=>{o.geometry?.dispose();if(o.material){const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});map?.dispose();renderer.dispose();});resize();
})();
