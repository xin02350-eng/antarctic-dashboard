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
  try{
    if(!T||!N||!window.EarthSurface)throw Error('runtime');
    try{renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}
    catch(error){renderer=new T.WebGLRenderer({alpha:true,antialias:false});viewport.dataset.contextMode='compatible';}
  }
  catch(e){fallback.hidden=false;status.textContent=tr('三维场景不可用','3D unavailable');document.querySelectorAll('button').forEach(b=>b.disabled=true);return;}
  const budget=window.PolarRenderBudget?.create({navigator:window.navigator,mode:'globe'});
  function pixelRatio(w,h){return budget?.pixelRatio(w,h,devicePixelRatio||1)??Math.min(devicePixelRatio||1,1.5,Math.sqrt(2000000/Math.max(1,w*h)));}
  function applyRenderSize(w=innerWidth,h=innerHeight){const ratio=pixelRatio(w,h);renderer.setPixelRatio(ratio);renderer.setSize(w,h);viewport.dataset.renderDpr=ratio.toFixed(2);viewport.dataset.renderTier=budget?.profile().tier||'balanced';}
  renderer.outputEncoding=T.sRGBEncoding;viewport.append(renderer.domElement);
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
  const locations=N.nodes,labels=[],beacons=[],visibleLabels=[];
  viewport.setAttribute('aria-label',tr('三维地球：南京、东北哈尔滨、南极；方向键旋转，加减键缩放','3D Earth: Nanjing, Northeast Harbin, Antarctica; arrows rotate, plus/minus zoom'));
  locations.forEach((p,i)=>{
    const dot=new T.Mesh(new T.SphereGeometry(.65,16,12),new T.MeshBasicMaterial({color:0xe4ffff}));dot.position.copy(point(p.lat,p.lng,101.4));earth.add(dot);
    for(let j=0;j<2;j++){const ring=new T.Mesh(new T.RingGeometry(1.65+j*.95,1.85+j*.95,64),new T.MeshBasicMaterial({color:0x9bf1ec,side:T.DoubleSide,transparent:true,opacity:j?.25:.8,depthWrite:false}));ring.position.copy(point(p.lat,p.lng,101.4));ring.lookAt(point(p.lat,p.lng,150));earth.add(ring);if(j)beacons.push({ring,phase:i*.33});}
    const el=document.createElement('span');el.className='earth-label';el.dataset.node=p.id;
    el.innerHTML=`<small>${p.code}</small><b>${p[en?'en':'zh']}</b><em>${Math.abs(p.lat).toFixed(2)}°${p.lat<0?'S':'N'} / ${p.lng.toFixed(2)}°E</em>`;
    el.hidden=true;el.style.left='0px';el.style.top='0px';document.getElementById('earthLabels').append(el);labels.push({el,local:point(p.lat,p.lng,102),dx:p.dx,dy:p.dy,width:0,height:0,paint:{}});
  });
  // Thirty-two independently moving trail beads used to require thirty-two
  // draw calls. Instance opacity preserves their original fade, unlike merely
  // darkening an opaque instanced color. WebGL1 without ANGLE retains meshes.
  const canInstance=typeof T.InstancedMesh==='function'&&!!(renderer.capabilities.isWebGL2||renderer.extensions?.has('ANGLE_instanced_arrays'));
  const tailGeometry=new T.SphereGeometry(.26,8,6),headGeometry=new T.SphereGeometry(.7,8,6),instanceMatrix=new T.Matrix4();
  const trailOpacities=Float32Array.from({length:16},(_,i)=>(i+1)/16*.9);
  if(canInstance)tailGeometry.setAttribute('instanceOpacity',new T.InstancedBufferAttribute(trailOpacities,1));
  const trailMaterial=new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,depthWrite:false});
  trailMaterial.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float instanceOpacity;varying float vInstanceOpacity;').replace('#include <begin_vertex>','#include <begin_vertex>\nvInstanceOpacity=instanceOpacity;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vInstanceOpacity;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vInstanceOpacity;');
  };
  trailMaterial.customProgramCacheKey=()=> 'dms-instance-opacity-v1';
  const fallbackTrailMaterials=canInstance?[]:Array.from({length:16},(_,j)=>new T.MeshBasicMaterial({color:j===0?0xf0fffc:0x91e7e4,transparent:true,opacity:(1-j/16)*.9,depthWrite:false}));
  const streams=N.routes.map((route,i)=>{
    const a=N.nodes.find(n=>n.id===route.from),b=N.nodes.find(n=>n.id===route.to),arc=N.route(a,b,route.height).map(p=>new T.Vector3(...p));
    const curve=new T.CatmullRomCurve3(arc);
    earth.add(new T.Mesh(new T.TubeGeometry(curve,160,.07,5,false),new T.MeshBasicMaterial({color:0xc2edf7,transparent:true,opacity:.84})));
    earth.add(new T.Mesh(new T.TubeGeometry(curve,160,.22,5,false),new T.MeshBasicMaterial({color:0x7bbde8,transparent:true,opacity:.07,depthWrite:false,blending:T.AdditiveBlending})));
    let instances,tail;
    if(canInstance){instances=new T.InstancedMesh(tailGeometry,trailMaterial,16);instances.instanceMatrix.setUsage(T.DynamicDrawUsage);instances.frustumCulled=false;for(let j=0;j<16;j++)instances.setColorAt(15-j,new T.Color(j===0?0xf0fffc:0x91e7e4));earth.add(instances);}
    else tail=Array.from({length:16},(_,j)=>{const mesh=new T.Mesh(j===0?headGeometry:tailGeometry,fallbackTrailMaterials[j]);earth.add(mesh);return mesh;});
    return {arc,tail,instances,phase:i*.47};
  });
  const orbit=new T.Group();scene.add(orbit);
  function circle(radius,opacity){const points=[];for(let i=0;i<=180;i++){const a=i/180*Math.PI*2;points.push(new T.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));}const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0x77b3d1,transparent:true,opacity}));line.rotation.set(.42,0,.22);orbit.add(line);}
  circle(127,.21);circle(130,.06);const ticks=[];for(let i=0;i<72;i++){const a=i/72*Math.PI*2,r=i%6?130.8:133.8;ticks.push(Math.cos(a)*130,0,Math.sin(a)*130,Math.cos(a)*r,0,Math.sin(a)*r);}const tickGeo=new T.BufferGeometry();tickGeo.setAttribute('position',new T.Float32BufferAttribute(ticks,3));const tickLines=new T.LineSegments(tickGeo,new T.LineBasicMaterial({color:0xa4c8dd,transparent:true,opacity:.26}));tickLines.rotation.set(.42,0,.22);orbit.add(tickLines);
  let distance=390,dragging=false,x=0,y=0,inView=true,pageActive=true,contextLost=false,disposed=false,target=null;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),orbitSpeed=Math.PI*2/60;earth.rotation.set(.48,-2.05,0);
  let raf=0,last=0,time=0,renderPhase=0,lastRenderAt=0,metricsStart=0,metricsFrames=0;
  const world=new T.Vector3(),normal=new T.Vector3(),toCamera=new T.Vector3();
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
  function resize(){const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);labels.forEach(label=>{label.width=0;label.height=0;});camera.aspect=w/h;camera.setViewOffset(w,h,-w*.16,0,w,h);camera.updateProjectionMatrix();applyRenderSize(w,h);resetClock();wake();}
  function focusView(view){target=view==='polar'?{x:-1.43,y:-1.22}:{x:.48,y:-2.05};const delta=target.y-earth.rotation.y;target.y=earth.rotation.y+Math.atan2(Math.sin(delta),Math.cos(delta));distance=390;document.querySelectorAll('[data-earth-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.earthView===view)));wake();}
  document.querySelectorAll('[data-earth-view]').forEach(b=>b.addEventListener('click',()=>focusView(b.dataset.earthView)));
  const canvas=renderer.domElement;
  const touchControls=window.SceneTouch&&(document.documentElement.dataset?.client==='mobile'||q.get('client')==='mobile')?window.SceneTouch.create(canvas,{
    active(active){dragging=active;if(active)target=null;resetClock();wake();},
    rotate(dx,dy){earth.rotation.y+=dx*.005;earth.rotation.x=Math.max(-1.5,Math.min(1.5,earth.rotation.x+dy*.005));wake();},
    zoom(ratio){distance=Math.max(300,Math.min(520,distance*ratio));wake();}
  }):null;
  canvas.addEventListener('pointerdown',e=>{if(touchControls?.down(e))return;dragging=true;target=null;x=e.clientX;y=e.clientY;budget?.reset();try{canvas.setPointerCapture?.(e.pointerId);}catch(error){/* Window exit listeners also release unsupported pointer capture. */}});canvas.addEventListener('pointermove',e=>{if(touchControls?.move(e))return;if(!dragging)return;earth.rotation.y+=(e.clientX-x)*.005;earth.rotation.x=Math.max(-1.5,Math.min(1.5,earth.rotation.x+(e.clientY-y)*.005));x=e.clientX;y=e.clientY;wake();});
  function endDrag(event){if(touchControls){if(!event||event.type==='blur')touchControls.clear();else if(touchControls.up(event))return;}if(!dragging)return;dragging=false;resetClock();wake();}
  ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,endDrag));['pointerup','pointercancel','blur'].forEach(name=>window.addEventListener(name,endDrag));
  canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(300,Math.min(520,distance+e.deltaY*.12));wake();},{passive:false});
  viewport.addEventListener('keydown',e=>{const moves={ArrowLeft:[0,-.08],ArrowRight:[0,.08],ArrowUp:[-.08,0],ArrowDown:[.08,0]};if(moves[e.key]){e.preventDefault();target=null;earth.rotation.x=Math.max(-1.5,Math.min(1.5,earth.rotation.x+moves[e.key][0]));earth.rotation.y+=moves[e.key][1];wake();}if(['+','=','-'].includes(e.key)){e.preventDefault();distance=Math.max(300,Math.min(520,distance+(e.key==='-'?12:-12)));wake();}});
  function frame(now){raf=0;if(disposed||!pageActive||document.hidden||!inView||contextLost||!map)return;
    const frameInterval=1000/(budget?.profile().maxFps||60);
    const elapsed=now-renderPhase;
    // Keep the remainder: resetting phase to now would turn a 144 Hz screen
    // into 48 fps. Interaction and orbit integrate accepted-paint timestamps.
    if(!reduced.matches&&renderPhase&&elapsed<frameInterval-.75){raf=requestAnimationFrame(frame);return;}
    renderPhase=now-(elapsed>=frameInterval?elapsed%frameInterval:0);
    if(lastRenderAt&&!reduced.matches&&budget?.sample(now-lastRenderAt,now))applyRenderSize();lastRenderAt=now;
    const dt=last?Math.min((now-last)/1000,.1):0;last=now;time+=reduced.matches?0:dt;
    if(target){const blend=reduced.matches?1:1-Math.exp(-dt*5);earth.rotation.x+=(target.x-earth.rotation.x)*blend;earth.rotation.y+=(target.y-earth.rotation.y)*blend;if(Math.abs(target.x-earth.rotation.x)+Math.abs(target.y-earth.rotation.y)<.001)target=null;}else if(!dragging&&!reduced.matches)earth.rotation.y+=dt*orbitSpeed;
    streams.forEach(s=>{
      for(let j=0;j<16;j++){const p=s.arc[Math.floor(((time*.1+s.phase-j*.004+1)%1)*(s.arc.length-1))];
        if(s.instances){const scale=j===0?.7/.26:1;instanceMatrix.makeScale(scale,scale,scale);instanceMatrix.setPosition(p);s.instances.setMatrixAt(15-j,instanceMatrix);}
        else s.tail[j].position.copy(p);
      }
      if(s.instances)s.instances.instanceMatrix.needsUpdate=true;
    });beacons.forEach(b=>{const f=(time*.28+b.phase)%1;b.ring.scale.setScalar(1+f*1.6);b.ring.material.opacity=(1-f)*.32;});
    if(camera.position.z!==distance){camera.position.set(0,0,distance);camera.lookAt(0,0,0);camera.updateMatrixWorld();}earth.updateMatrixWorld();
    visibleLabels.length=0;
    labels.forEach(label=>{
      world.copy(label.local).applyMatrix4(earth.matrixWorld);normal.copy(label.local).normalize().transformDirection(earth.matrixWorld);toCamera.copy(camera.position).sub(world).normalize();const facing=normal.dot(toCamera)>.18;world.project(camera);const hidden=!facing||Math.abs(world.x)>.93||Math.abs(world.y)>.9;if(label.el.hidden!==hidden)label.el.hidden=hidden;
      if(!hidden){label.anchorX=(world.x+1)/2*innerWidth;label.anchorY=(1-world.y)/2*innerHeight;label.preferredY=label.anchorY+label.dy;visibleLabels.push(label);}
    });
    // All visibility writes precede all measurements, then all final writes.
    // Dimensions only need reading on the first reveal or a viewport resize.
    visibleLabels.forEach(label=>{if(!label.width)label.width=label.el.offsetWidth||192;if(!label.height)label.height=label.el.offsetHeight||54;});
    layoutLabels(visibleLabels,innerWidth,innerHeight);
    visibleLabels.forEach(label=>{
      const middle=label.top+label.height/2,origin=label.anchorX>label.left+label.width/2?label.width:0,dx=label.anchorX-label.left-origin,dy=label.anchorY-middle;
      const transform=`translate3d(${label.left.toFixed(2)}px,${middle.toFixed(2)}px,0) translateY(-50%)`;
      if(label.paint.transform!==transform){label.el.style.transform=transform;label.paint.transform=transform;}
      setLabelProperty(label,'--leader-origin',origin+'px');setLabelProperty(label,'--leader-length',Math.hypot(dx,dy).toFixed(2)+'px');setLabelProperty(label,'--leader-angle',Math.atan2(dy,dx).toFixed(4)+'rad');
    });
    try{renderer.render(scene,camera);}catch(error){contextLost=true;fallback.hidden=false;status.textContent=tr('三维场景不可用','3D unavailable');viewport.dataset.runtimeActive='false';document.querySelectorAll('button').forEach(b=>b.disabled=true);return;}
    // A DOM-readable rolling sample for real-browser acceptance, never a
    // per-frame dataset write or a second timer/render loop.
    if(!metricsStart)metricsStart=now;else metricsFrames++;
    if(now-metricsStart>=1000){viewport.dataset.renderFps=(metricsFrames*1000/(now-metricsStart)).toFixed(1);const calls=renderer.info?.render?.calls;viewport.dataset.renderCalls=Number.isFinite(calls)?String(calls):'unavailable';metricsStart=now;metricsFrames=0;}
    if(!viewport.dataset.firstDrawMs)viewport.dataset.firstDrawMs=startupClock().toFixed(1);
    if(map&&!viewport.dataset.visibleFrameMs){renderer.domElement.style.opacity='1';viewport.setAttribute('aria-busy','false');viewport.dataset.visibleFrameMs=startupClock().toFixed(1);}
    if(!reduced.matches||target||dragging)raf=requestAnimationFrame(frame);
  }
  function setLabelProperty(label,key,value){if(label.paint[key]!==value){label.el.style.setProperty(key,value);label.paint[key]=value;}}
  function resetClock(){last=0;renderPhase=0;lastRenderAt=0;metricsStart=0;metricsFrames=0;budget?.reset();}
  function wake(){const active=!disposed&&pageActive&&inView&&!document.hidden&&!contextLost;viewport.dataset.runtimeActive=String(active);if(!active){cancelAnimationFrame(raf);raf=0;return;}if(!raf)raf=requestAnimationFrame(frame);}
  function visibility(){if(!pageActive||document.hidden||!inView||contextLost){touchControls?.clear();dragging=false;}resetClock();wake();}
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='dms:earth-visibility')return;inView=e.data.visible===true;visibility();});
  if(reduced.addEventListener)reduced.addEventListener('change',visibility);else reduced.addListener?.(visibility);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;fallback.hidden=false;visibility();});canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;fallback.hidden=!!map;document.querySelectorAll('button').forEach(b=>b.disabled=false);visibility();});
  const abort=typeof AbortController==='function'?new AbortController():null,releasedTextures=new WeakSet();let map,pendingMap,mapMode='',primarySettled=false,surfaceDeadline=0,geographyDeadline=0,geographyStarted=false;
  function delay(callback,ms){if(typeof setTimeout!=='function')return 0;const timer=setTimeout(callback,ms);timer?.unref?.();return timer;}
  function clearDelay(timer){if(timer&&typeof clearTimeout==='function')clearTimeout(timer);}
  function releaseTexture(texture){if(texture&&!releasedTextures.has(texture)){releasedTextures.add(texture);texture.dispose();}}
  function installMap(texture,complete,mode){
    if(disposed||mapMode==='precompiled'&&mode!=='precompiled'){releaseTexture(texture);return;}
    const previous=map||material.map;map=texture;mapMode=mode;material.map=map;
    // A timed-out image may still arrive. Keep its pending Texture alive until
    // the callback, so fallback disposal cannot break a later full-quality map.
    if(previous!==map&&(previous!==pendingMap||primarySettled))releaseTexture(previous);
    material.color.set(0xffffff);material.needsUpdate=true;viewport.dataset.surfaceSource=mode;
    status.textContent=complete?tr('蓝线地球 / 本地地理数据','BLUE-LINE EARTH / LOCAL GEOGRAPHY'):tr('地理边界暂未加载','GEOGRAPHIC BOUNDARIES UNAVAILABLE');
    fallback.hidden=contextLost?false:true;wake();
  }
  function stalledSurface(){
    if(disposed||map)return;
    fallback.hidden=false;viewport.setAttribute('aria-busy','false');
    status.textContent=tr('地理背景加载较慢，正在尝试本地数据','Geographic background delayed; trying local data');
  }
  function geographyFallback(){
    if(disposed||geographyStarted||mapMode==='precompiled')return;geographyStarted=true;
    const geography={};let previewed=false;
    function paintGeography(){
      if(disposed||mapMode==='precompiled')return;
      try{installMap(EarthSurface.texture(T,renderer,geography),!!geography.countries,'runtime');}
      catch(error){if(!map){fallback.hidden=false;viewport.setAttribute('aria-busy','false');status.textContent=tr('地理背景暂不可用，数据与导航仍可使用','Geographic background unavailable; data and navigation remain accessible');}}
    }
    // One stalled JSON must not block an otherwise valid country map. A late
    // complete response may refine this bounded preview, but never replace a
    // successfully loaded lossless precompiled surface.
    geographyDeadline=delay(()=>{previewed=true;paintGeography();},2500);
    Promise.all(['countries','geolines','rivers'].map(async name=>{
      try{const r=await fetch('./assets/geo/'+name+'.json',abort?{signal:abort.signal}:{});if(!r.ok)throw Error('geography');geography[name]=await r.json();if(previewed&&name==='countries')paintGeography();}
      catch(e){geography[name]=null;}
    })).then(()=>{clearDelay(geographyDeadline);geographyDeadline=0;if(!previewed||Object.values(geography).some(Boolean))paintGeography();});
  }
  // The same lossless 4096 × 2048 painter output is built once, not on every visit.
  surfaceDeadline=delay(()=>{surfaceDeadline=0;stalledSurface();geographyFallback();},6000);
  pendingMap=new T.TextureLoader().load('./assets/geo/earth-surface-v1.webp',texture=>{
    primarySettled=true;clearDelay(surfaceDeadline);surfaceDeadline=0;clearDelay(geographyDeadline);geographyDeadline=0;
    installMap(EarthSurface.configure(T,renderer,texture),true,'precompiled');
  },undefined,()=>{primarySettled=true;clearDelay(surfaceDeadline);surfaceDeadline=0;geographyFallback();});
  // Warm exactly the mapped material variant during the download/decode window.
  // compile() creates programs only: no empty Earth is drawn or texture uploaded.
  if(pendingMap){material.map=EarthSurface.configure(T,renderer,pendingMap);material.color.set(0xffffff);material.needsUpdate=true;try{renderer.compile(scene,camera);viewport.dataset.shaderWarmMs=startupClock().toFixed(1);}catch(error){viewport.dataset.shaderWarmMs='unavailable';}}
  window.addEventListener('pagehide',(event={})=>{
    pageActive=false;visibility();
    // A BFCache page keeps its WebGL state. Destroy only a genuine navigation;
    // the back button must be able to resume the same globe without a reload.
    if(event.persisted)return;
    disposed=true;abort?.abort();clearDelay(surfaceDeadline);clearDelay(geographyDeadline);
    const geometries=new Set([tailGeometry,headGeometry]),materials=new Set([trailMaterial,...fallbackTrailMaterials]);scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());releaseTexture(map);releaseTexture(pendingMap);renderer.dispose();
  });
  window.addEventListener('pageshow',()=>{if(disposed)return;pageActive=true;visibility();});resize();
})();
