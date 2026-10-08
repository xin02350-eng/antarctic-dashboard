const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {expandedScriptSources,assertCurrentBundle}=require('./helpers/runtime.cjs');
const budget=require('../js/render-budget.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

function device({search='',width=844,height=390,touch=5,coarse=true,screen=true}={}){
  return {location:{search},innerWidth:width,innerHeight:height,
    navigator:{maxTouchPoints:touch,hardwareConcurrency:8,deviceMemory:8},
    screen:screen?{width,height}:undefined,matchMedia:query=>{assert.equal(query,'(pointer: coarse)');return {matches:coarse};}};
}

test('explicit mobile iframe starts in the existing low tier and bounds high DPR before its first render',()=>{
  for(const [width,height,dpr] of [[667,375,2],[844,390,3],[932,430,4],[1366,1024,3]]){
    const environment=device({search:'?station=a01&client=mobile',width,height});
    const policy=budget.create({environment,navigator:environment.navigator});
    assert.equal(policy.profile().tier,'low');assert.equal(policy.profile().maxFps,60);
    const ratio=policy.pixelRatio(width,height,dpr);
    assert.ok(ratio<=1&&width*height*ratio*ratio<=1100001);
    assert.equal(policy.profile().shadowSize,512);assert.equal(policy.profile().particleScale,.5);
  }
});

test('coarse touch phones and tablets are detected in landscape even above the old desktop breakpoint',()=>{
  for(const [width,height] of [[667,375],[844,390],[932,430],[1024,768],[1366,1024]]){
    const environment=device({width,height});
    assert.equal(budget.isMobile({environment}),true);
    assert.equal(budget.create({environment}).profile().tier,'low');
  }
});

test('desktop, mouse-first touch laptops and missing capability hints keep the original balanced budget',()=>{
  const variants=[device({width:1440,height:900,touch:0,coarse:false}),device({width:1440,height:900,coarse:false}),device({width:3840,height:2160}),{}];
  for(const environment of variants){assert.equal(budget.isMobile({environment}),false);assert.equal(budget.create({environment}).profile().tier,'balanced');}
  const desktop=budget.create({environment:device({search:'?client=desktop'})});
  assert.equal(desktop.profile().tier,'balanced');assert.equal(desktop.pixelRatio(1280,720,2),Math.min(1.5,Math.sqrt(2000000/(1280*720))));
});

test('explicit client selection is exact and overrides touch hints without accepting lookalike query values',()=>{
  for(const search of ['?notclient=mobile','?client=mobile-ish','?client=desktop&other=mobile']){
    assert.equal(budget.isMobile({environment:device({search,touch:0,coarse:false})}),false);
  }
  assert.equal(budget.isMobile({client:'mobile',environment:{}}),true);
  assert.equal(budget.isMobile({client:'desktop',environment:device()}),false);
  assert.equal(budget.isMobile({environment:device({search:'?client=mobile&lang=en',touch:0,coarse:false})}),true);
});

test('missing screen and unsupported pointer queries remain safe without assuming a mobile GPU',()=>{
  assert.equal(budget.isMobile({environment:device({screen:false})}),true);
  const blocked=device();blocked.matchMedia=()=>{throw Error('media unavailable');};
  assert.doesNotThrow(()=>budget.create({environment:blocked}));
  assert.equal(budget.create({environment:blocked}).profile().tier,'balanced');
  assert.equal(budget.create({environment:blocked,client:'mobile'}).profile().tier,'low');
});

test('mobile pressure can still enter economy while healthy mobile animation remains 60 fps',()=>{
  for(const interval of [16.67,50]){
    const policy=budget.create({client:'mobile'});let changes=0;
    for(let now=0;now<9000;now+=interval)if(policy.sample(interval,now))changes++;
    assert.equal(changes,interval>44?1:0);
    assert.equal(policy.profile().tier,interval>44?'economy':'low');
    assert.equal(policy.profile().maxFps,interval>44?30:60);
  }
});

test('browser budget stamps both iframe types before their renderer starts without mutating desktop DOM',()=>{
  for(const mobile of [false,true]){
    const environment=device({search:mobile?'?client=mobile':'',touch:0,coarse:false}),writes=[];
    environment.document={documentElement:{setAttribute:(...args)=>writes.push(args)}};
    vm.runInNewContext(read('js/render-budget.js'),{window:environment});
    assert.equal(typeof environment.PolarRenderBudget.create,'function');
    assert.deepEqual(writes,mobile?[['data-client','mobile']]:[]);
  }
});

test('explicit mobile HTML stamp is parse-safe before modern libraries and does not label ordinary desktop frames',()=>{
  for(const file of ['field-frame.html','globe-frame.html']){
    const html=read(file),source=html.match(/<script id="scene-client">([\s\S]*?)<\/script>/)[1];
    const bundle=assertCurrentBundle(file,file==='field-frame.html'?'field':'earth');
    assert.ok(html.indexOf('id="scene-client"')<html.indexOf(bundle.src));
    for(const query of ['?client=mobile','?lang=en&client=mobile&station=a03','?client=desktop','?notclient=mobile','']){
      const writes=[];
      vm.runInNewContext(source,{location:{search:query},document:{documentElement:{setAttribute:(...args)=>writes.push(args)}}});
      assert.deepEqual(writes,/(?:^|[?&])client=mobile(?:&|$)/.test(query)?[['data-client','mobile']]:[]);
    }
    assert.match(html,/viewport-fit=cover/);assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
    assert.ok(expandedScriptSources(file).includes('./js/render-budget.js'));
  }
});

test('mobile field localizes view buttons, loading and failure states while retaining station dispatch',()=>{
  for(const lang of ['zh','en']){
    const events=[],root={dataset:{},setAttribute(name,value){this[name]=value;}},views=[{textContent:'全景'},{textContent:'近景'},{textContent:'俯瞰'}];
    const controls={setAttribute(name,value){this[name]=value;}},fallback={},environment={dataset:{en:'Partial texture unavailable',zh:'部分环境未加载'},setAttribute(name,value){this[name]=value;}};
    vm.runInNewContext(read('js/field-frame.js'),{URLSearchParams,location:{search:'?station=a03&lang='+lang+'&client=mobile'},
      CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
      document:{documentElement:root,querySelector:()=>controls,querySelectorAll:()=>views,getElementById:id=>({sceneFallback:fallback,environmentStatus:environment})[id]||null},
      window:{dispatchEvent:event=>events.push(event),addEventListener:()=>assert.fail('no obsolete motion listener')}});
    assert.equal(root['data-client'],'mobile');assert.equal(root.lang,lang==='en'?'en':'zh-CN');
    assert.equal(events[0].type,'polar:station');assert.equal(events[0].detail,'a03');
    assert.equal(environment.role,'status');assert.equal(environment.textContent,environment.dataset[lang]);
    assert.equal(controls['aria-label'],lang==='en'?'Choose instrument view':'选择装置视角');
    assert.match(fallback.textContent,lang==='en'?/Observation records and data remain accessible/:/观测记录与数据功能仍可正常使用/);
  }
});

function rule(source,selector){const start=source.indexOf(selector+' {');assert.ok(start>=0,selector);return source.slice(start,source.indexOf('}',start)+1);}

test('both mobile control rails have 48px touch targets, 8px spacing and safe-area offsets without live blur',()=>{
  for(const [file,selector] of [['css/field-finish.css','.controls'],['css/earth-frame.css','.earth-toolbar']]){
    const css=read(file),rail=rule(css,'html[data-client=mobile] '+selector),button=rule(css,'html[data-client=mobile] '+selector+' button');
    assert.match(button,/min-width: 3rem; min-height: 3rem/);assert.match(button,/font-size: \.875rem/);assert.match(button,/touch-action: manipulation/);
    assert.match(rail,/gap: \.5rem/);assert.match(rail,/backdrop-filter: none/);assert.match(rail,/env\(safe-area-inset-right/);assert.match(rail,/env\(safe-area-inset-bottom/);
    assert.ok(rail.indexOf('right: .75rem')<rail.indexOf('env('),'ordinary offsets survive engines without env()');
    assert.doesNotMatch(css.slice(css.indexOf('html[data-client=mobile] .')),/requestAnimationFrame|animation:|@keyframes/);
  }
});

test('short scenes keep localized feedback and controls usable while preserving drag input and all three globe anchors',()=>{
  const field=read('css/field-finish.css'),earth=read('css/earth-frame.css');
  assert.match(field,/html\[data-client=mobile\] #environmentStatus[^}]*max-height: 3\.25rem; overflow: auto/s);
  assert.match(field,/html\[data-client=mobile\]\[data-profile=hero\] #sceneFallback[^}]*max-height: calc\(100% - 7rem\); overflow: auto/s);
  assert.match(earth,/html\[data-client=mobile\] #globeFallback[^}]*max-height: calc\(100% - 7rem\); overflow: auto/s);
  assert.match(earth,/@media \(max-height: 320px\)[^]*\.earth-touch-hint \{ display: none; \}/);
  assert.match(read('field-frame.html'),/canvas\{display:block;touch-action:none\}/);
  assert.match(earth,/canvas \{[^}]*touch-action: none/);
  assert.doesNotMatch(field+earth,/html\[data-client=mobile\][^{]*(?:canvas|#earthViewport)[^{]*\{[^}]*pointer-events: none/s);
  const html=read('globe-frame.html');assert.match(html,/class="earth-touch-hint"[^>]*data-zh="拖动旋转 · 双指缩放"/);
  for(const name of ['南京','东北','南极'])assert.ok(html.includes(name));
  assert.match(html,/PINCH TO ZOOM/);
  assert.match(read('js/expedition-globe.js'),/window\.SceneTouch\.create\(canvas/,'advertised pinch gesture has an installed renderer adapter');
});
