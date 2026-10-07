const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const app=read('js/expedition-app.js');
const start=app.indexOf('  function preloadNetworkIntent(e){');
const end=app.indexOf("  document.addEventListener('click'",start);
assert.ok(start>0&&end>start);
function harness({entry='sensors',connection,hidden=false,pointer=true,desktop=true,fieldPending=false}={}){
  const links=[],listeners={};
  const window={navigator:{connection},matchMedia:()=>({matches:desktop})};
  if(pointer)window.PointerEvent=function(){};
  const document={hidden,createElement:tag=>{assert.equal(tag,'link');return {};},
    head:{appendChild:link=>links.push(link)},addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const context={window,document,location:{search:'?view='+entry},URLSearchParams,active:entry,
    viewQuery:selector=>{assert.equal(selector,'.mission-stage:not(.is-ready)');return fieldPending?{}:null;}};
  vm.runInNewContext(read('expedition.html').match(/<script id="scenePreload">([\s\S]*?)<\/script>/)[1],context);
  vm.runInNewContext(app.slice(start,end),context);
  return {window,document,links,listeners,fieldReady(){fieldPending=false;},emit(type,route='network',extra={}){
    const target={closest:selector=>{assert.equal(selector,'a[data-route]');return route?{dataset:{route}}:null;}};
    listeners[type]({type,target,pointerType:'mouse',button:0,...extra});
  }};
}
test('no speculative downloads or renderer is created before navigation intent',()=>{
  const h=harness();assert.equal(h.links.length,0);
  for(const route of ['dashboard','hardware','sensors','telemetry','analysis','location','download',null])h.emit('pointerover',route);
  h.emit('focusin','network',{target:{}});assert.equal(h.links.length,0);
});
test('mouse, pen, touch press and keyboard intent warm the same original globe resources',()=>{
  for(const [type,pointerType] of [['pointerover','mouse'],['pointerover','pen'],['pointerdown','touch'],['focusin','']]){
    const h=harness();h.emit(type,'network',{pointerType});assert.equal(h.links.length,4);
    assert.ok(h.links.some(link=>link.href==='./assets/geo/earth-surface-v1.webp'));
    assert.ok(h.links.every(link=>link.rel==='preload'));
    h.emit(type,'globe',{pointerType});h.window.ExpeditionPreload('network');
    assert.equal(h.links.length,4,'intent, actual navigation and the other globe route share requests');
  }
});
test('homepage intent reuses Three without loading another field scene or adding duplicate requests',()=>{
  const h=harness({entry:'dashboard'});assert.equal(h.links.length,6);
  h.emit('focusin');assert.equal(h.links.length,9);
  for(let i=0;i<10;i++)h.emit('pointerover','network');
  assert.equal(h.links.length,9);assert.equal(h.links.filter(link=>link.href==='./assets/three.min.js').length,1);
});
test('hidden tabs, data saving and 2G skip only speculation; explicit navigation still works',()=>{
  for(const options of [{hidden:true},{connection:{saveData:true}},{connection:{effectiveType:'slow-2g'}},{connection:{effectiveType:'2g'}}]){
    const h=harness(options);h.emit('focusin');h.emit('pointerover');assert.equal(h.links.length,0);
    h.window.ExpeditionPreload('network');assert.equal(h.links.length,4);
  }
});
test('hover and keyboard speculation never compete with an unfinished homepage scene',()=>{
  const h=harness({entry:'dashboard',fieldPending:true});
  h.emit('focusin');h.emit('pointerover');assert.equal(h.links.length,6);
  h.fieldReady();h.emit('focusin');assert.equal(h.links.length,9);
  const clicked=harness({entry:'dashboard',fieldPending:true});
  clicked.emit('pointerdown');assert.equal(clicked.links.length,9,'an explicit press may prepare the requested destination');
});
test('touch hover and secondary buttons do not speculate; narrow legacy screens keep their route policy',()=>{
  const h=harness();h.emit('pointerover','network',{pointerType:'touch'});h.emit('pointerdown','network',{button:2});
  assert.equal(h.links.length,0);
  const narrow=harness({desktop:false});narrow.emit('focusin');assert.equal(narrow.links.length,0);
  narrow.window.ExpeditionClient={mobile:true};narrow.emit('focusin');assert.equal(narrow.links.length,4);
});
test('older mouse browsers and unavailable optional preload support stay functional',()=>{
  const h=harness({pointer:false});h.emit('mouseover','globe');assert.equal(h.links.length,4);
  delete h.window.ExpeditionPreload;assert.doesNotThrow(()=>h.emit('focusin'));
  assert.equal(harness().listeners.mouseover,undefined,'modern browsers register no duplicate mouse handler');
});
