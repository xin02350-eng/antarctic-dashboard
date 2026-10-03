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
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,.1,1600);scene.add(new T.AmbientLight(0xb8d3e3,.52));const key=new T.DirectionalLight(0xe2f3fc,1.08);key.position.set(-180,220,260);scene.add(key);
  const fill=new T.DirectionalLight(0x507da8,.24);fill.position.set(160,-40,-100);scene.add(fill);
  const material=new T.MeshPhongMaterial({color:0x112630,shininess:30,specular:0x04080a});
  // Match the previous globe's radius, tessellation and UV orientation exactly.
  // Routes and controls already belong to us; no second globe engine is needed.
  const earth=new T.Group(),surface=new T.Mesh(new T.SphereGeometry(100,75,75),material);
  surface.rotation.y=-Math.PI/2;earth.add(surface);scene.add(earth);
  const rim=new T.Mesh(new T.SphereGeometry(100.7,96,64),new T.ShaderMaterial({
    vertexShader:'varying vec3 n;varying vec3 eye;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);eye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec3 n;varying vec3 eye;void main(){float edge=1.0-max(0.0,dot(normalize(n),normalize(eye)));float veil=pow(edge,3.0)*0.08;float line=pow(edge,12.0)*0.52;vec3 ice=mix(vec3(0.20,0.46,0.68),vec3(0.73,0.89,1.0),pow(edge,6.0));gl_FragColor=vec4(ice,veil+line);}',
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
    el.hidden=true;document.getElementById('earthLabels').append(el);labels.push({el,local:point(p.lat,p.lng,102),dx:p.dx,dy:p.dy,width:0,height:0});
  });
  const streams=N.routes.map((route,i)=>{
    const a=N.nodes.find(n=>n.id===route.from),b=N.nodes.find(n=>n.id===route.to),arc=N.route(a,b,route.height).map(p=>new T.Vector3(...p));
    const curve=new T.CatmullRomCurve3(arc);
    earth.add(new T.Mesh(new T.TubeGeometry(curve,160,.07,5,false),new T.MeshBasicMaterial({color:0xc2edf7,transparent:true,opacity:.84})));
    earth.add(new T.Mesh(new T.TubeGeometry(curve,160,.22,5,false),new T.MeshBasicMaterial({color:0x7bbde8,transparent:true,opacity:.07,depthWrite:false,blending:T.AdditiveBlending})));
    const tail=Array.from({length:16},(_,j)=>{const mesh=new T.Mesh(new T.SphereGeometry(j===0?.7:.26,8,6),new T.MeshBasicMaterial({color:j===0?0xf0fffc:0x91e7e4,transparent:true,opacity:(1-j/16)*.9,depthWrite:false}));earth.add(mesh);return mesh;});
    return {arc,tail,phase:i*.47};
  });
  const orbit=new T.Group();scene.add(orbit);
  function circle(radius,opacity){const points=[];for(let i=0;i<=180;i++){const a=i/180*Math.PI*2;points.push(new T.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));}const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0x77b3d1,transparent:true,opacity}));line.rotation.set(.42,0,.22);orbit.add(line);}
  circle(127,.21);circle(130,.06);const ticks=[];for(let i=0;i<72;i++){const a=i/72*Math.PI*2,r=i%6?130.8:133.8;ticks.push(Math.cos(a)*130,0,Math.sin(a)*130,Math.cos(a)*r,0,Math.sin(a)*r);}const tickGeo=new T.BufferGeometry();tickGeo.setAttribute('position',new T.Float32BufferAttribute(ticks,3));const tickLines=new T.LineSegments(tickGeo,new T.LineBasicMaterial({color:0xa4c8dd,transparent:true,opacity:.26}));tickLines.rotation.set(.42,0,.22);orbit.add(tickLines);
  let distance=390,dragging=false,x=0,y=0,inView=true,contextLost=false,disposed=false,target=null;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),orbitSpeed=Math.PI*2/60;earth.rotation.set(.48,-2.05,0);
  let raf=0,last=0,time=0;const world=new T.Vector3(),normal=new T.Vector3(),toCamera=new T.Vector3();
  // Resolve label collisions in screen space without hiding a visible project anchor.
  // There are only three labels; measured dimensions are cached until a resize.
  function layoutLabels(items,w,h){
    const gutter=16,top=28,bottom=Math.max(top+60,h-112),gap=12;
    items.sort((a,b)=>a.preferredY-b.preferredY);
    const overlaps=(a,b)=>a.left<b.left+b.width+gap&&b.left<a.left+a.width+gap;
    items.forEach((item,i)=>{
      const minLeft=w>=768?w*.43:gutter,maxLeft=Math.max(gutter,w-gutter-item.width);
      item.left=Math.min(maxLeft,Math.max(Math.min(minLeft,maxLeft),item.anchorX+item.dx));
      item.top=Math.max(top,Math.min(bottom-item.height,item.preferredY-item.height/2));
      for(let j=0;j<i;j++)if(overlaps(item,items[j]))item.top=Math.max(item.top,items[j].top+items[j].height+gap);
    });
    for(let i=items.length-1;i>=0;i--){
      const item=items[i];item.top=Math.min(item.top,bottom-item.height);
      for(let j=i+1;j<items.length;j++)if(overlaps(item,items[j]))item.top=Math.min(item.top,items[j].top-item.height-gap);
      item.top=Math.max(top,item.top);
    }
  }
  function resize(){const w=innerWidth,h=innerHeight;labels.forEach(label=>{label.width=0;label.height=0;});camera.aspect=w/h;camera.setViewOffset(w,h,-w*.16,0,w,h);camera.updateProjectionMatrix();renderer.setSize(w,h);wake();}
  function focusView(view){target=view==='polar'?{x:-1.43,y:-1.22}:{x:.48,y:-2.05};const delta=target.y-earth.rotation.y;target.y=earth.rotation.y+Math.atan2(Math.sin(delta),Math.cos(delta));distance=390;document.querySelectorAll('[data-earth-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.earthView===view)));wake();}
  document.querySelectorAll('[data-earth-view]').forEach(b=>b.addEventListener('click',()=>focusView(b.dataset.earthView)));
  const canvas=renderer.domElement;canvas.addEventListener('pointerdown',e=>{dragging=true;target=null;x=e.clientX;y=e.clientY;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!dragging)return;earth.rotation.y+=(e.clientX-x)*.005;earth.rotation.x=Math.max(-1.5,Math.min(1.5,earth.rotation.x+(e.clientY-y)*.005));x=e.clientX;y=e.clientY;wake();});['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,()=>{dragging=false;last=0;wake();}));canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(300,Math.min(520,distance+e.deltaY*.12));wake();},{passive:false});
  viewport.addEventListener('keydown',e=>{const moves={ArrowLeft:[0,-.08],ArrowRight:[0,.08],ArrowUp:[-.08,0],ArrowDown:[.08,0]};if(moves[e.key]){e.preventDefault();target=null;earth.rotation.x=Math.max(-1.5,Math.min(1.5,earth.rotation.x+moves[e.key][0]));earth.rotation.y+=moves[e.key][1];wake();}if(['+','=','-'].includes(e.key)){e.preventDefault();distance=Math.max(300,Math.min(520,distance+(e.key==='-'?12:-12)));wake();}});
  function frame(now){raf=0;if(disposed||document.hidden||!inView||contextLost||!map)return;const dt=last?Math.min((now-last)/1000,.05):0;last=now;time+=reduced.matches?0:dt;
    if(target){const blend=reduced.matches?1:1-Math.exp(-dt*5);earth.rotation.x+=(target.x-earth.rotation.x)*blend;earth.rotation.y+=(target.y-earth.rotation.y)*blend;if(Math.abs(target.x-earth.rotation.x)+Math.abs(target.y-earth.rotation.y)<.001)target=null;}else if(!dragging&&!reduced.matches)earth.rotation.y+=dt*orbitSpeed;
    streams.forEach(s=>s.tail.forEach((p,j)=>p.position.copy(s.arc[Math.floor(((time*.1+s.phase-j*.004+1)%1)*(s.arc.length-1))])));beacons.forEach(b=>{const f=(time*.28+b.phase)%1;b.ring.scale.setScalar(1+f*1.6);b.ring.material.opacity=(1-f)*.32;});camera.position.set(0,0,distance);camera.lookAt(0,0,0);camera.updateMatrixWorld();earth.updateMatrixWorld();
    const visibleLabels=[];
    labels.forEach(label=>{
      world.copy(label.local).applyMatrix4(earth.matrixWorld);normal.copy(label.local).normalize().transformDirection(earth.matrixWorld);toCamera.copy(camera.position).sub(world).normalize();const facing=normal.dot(toCamera)>.18;world.project(camera);label.el.hidden=!facing||Math.abs(world.x)>.93||Math.abs(world.y)>.9;
      if(!label.el.hidden){label.width=label.width||label.el.offsetWidth||192;label.height=label.height||label.el.offsetHeight||54;label.anchorX=(world.x+1)/2*innerWidth;label.anchorY=(1-world.y)/2*innerHeight;label.preferredY=label.anchorY+label.dy;visibleLabels.push(label);}
    });
    layoutLabels(visibleLabels,innerWidth,innerHeight);
    visibleLabels.forEach(label=>{
      const middle=label.top+label.height/2,origin=label.anchorX>label.left+label.width/2?label.width:0,dx=label.anchorX-label.left-origin,dy=label.anchorY-middle;
      label.el.style.left=label.left+'px';label.el.style.top=middle+'px';label.el.style.setProperty('--leader-origin',origin+'px');label.el.style.setProperty('--leader-length',Math.hypot(dx,dy).toFixed(2)+'px');label.el.style.setProperty('--leader-angle',Math.atan2(dy,dx).toFixed(4)+'rad');
    });
    renderer.render(scene,camera);if(!viewport.dataset.firstDrawMs)viewport.dataset.firstDrawMs=startupClock().toFixed(1);
    if(map&&!viewport.dataset.visibleFrameMs){renderer.domElement.style.opacity='1';viewport.setAttribute('aria-busy','false');viewport.dataset.visibleFrameMs=startupClock().toFixed(1);}
    if(!reduced.matches||target||dragging)raf=requestAnimationFrame(frame);
  }
  function wake(){viewport.dataset.runtimeActive=String(!disposed&&inView&&!document.hidden&&!contextLost);if(!raf&&!disposed&&inView&&!document.hidden&&!contextLost)raf=requestAnimationFrame(frame);}
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{last=0;wake();});window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='dms:earth-visibility')return;inView=e.data.visible===true;last=0;wake();});reduced.addEventListener('change',()=>{last=0;wake();});canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;fallback.hidden=false;cancelAnimationFrame(raf);raf=0;});canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;fallback.hidden=true;last=0;wake();});
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
