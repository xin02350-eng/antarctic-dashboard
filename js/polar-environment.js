/* Hybrid environment: original panoramic artwork + textured real 3D foreground. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PolarEnvironment = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function noise(x, z) {
    var ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    function hash(a, b) { var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); }
    var a = hash(ix, iz) * (1 - fx) + hash(ix + 1, iz) * fx;
    var b = hash(ix, iz + 1) * (1 - fx) + hash(ix + 1, iz + 1) * fx;
    return a * (1 - fz) + b * fz;
  }
  function fbm(x, z) {
    return noise(x, z) * 0.52 + noise(x * 2.07 + 7, z * 2.07) * 0.26 + noise(x * 4.17, z * 4.17 + 11) * 0.14 + noise(x * 8.31, z * 8.31) * 0.08;
  }
  function heightAt(x, z) {
    var r = Math.hypot(x, z), blend = Math.min(1, Math.max(0, (r - 0.5) / 3));
    var warp = fbm(x * 0.28, z * 0.28) * 2;
    var ridges = Math.pow(1 - Math.abs(noise(x * 0.6 + warp, z * 2.2) * 2 - 1), 4) * 0.17;
    var dunes = (fbm(x * 0.085, z * 0.13) - 0.48) * 1.9;
    return -0.055 + blend * (dunes + ridges);
  }
  function create(T, renderer, scene, onStatus, accumulationMaterial) {
    var group = new T.Group(); group.name = 'antarctic-environment'; scene.add(group);
    var loader = new T.TextureLoader(), reflectionTarget, panoramaTexture, detailStarted = false, reflectionPending = false;
    // Equal-size, lossless delivery copies: original PNGs remain the recovery path.
    // No detail is resampled, and a blocked/unsupported WebP never removes a texture.
    function loadTexture(name, onLoad, onError) {
      loader.load('./assets/polar/' + name + '.webp', onLoad, undefined, function () {
        loader.load('./assets/polar/' + name + '.png', onLoad, undefined, onError);
      });
    }
    var skyMaterial = new T.MeshBasicMaterial({ color: 0xe4edf6, side: T.BackSide, depthWrite: false, fog: false, toneMapped: false });
    var skyGeometry = new T.SphereGeometry(450, 100, 80), skyUV = skyGeometry.attributes.uv;
    // The generated plate is a wide-angle panorama, not a calibrated 180-degree vertical capture.
    // Remap the horizon band to avoid making distant ice cliffs loom over the instrument.
    for (var skyVertex = 0; skyVertex < skyUV.count; skyVertex++) {
      skyUV.setXY(skyVertex, (0.5 - skyUV.getX(skyVertex)) * 4.5 + 0.5, (skyUV.getY(skyVertex) - 0.472) * 4.7 + 0.5);
    }
    var sky = new T.Mesh(skyGeometry, skyMaterial);
    sky.name = 'original-polar-panorama'; sky.rotation.y = Math.PI / 2 + 0.65; sky.renderOrder = -10; group.add(sky);
    var resources = { panorama: 'loading', snow: 'loading', crust: accumulationMaterial ? 'loading' : 'ready' };
    function status(key, value) { resources[key] = value; if (onStatus) onStatus(Object.assign({}, resources)); }
    function rebuildReflection() {
      if (!panoramaTexture) return;
      if (reflectionTarget) reflectionTarget.dispose();
      var pmrem = new T.PMREMGenerator(renderer);
      reflectionTarget = pmrem.fromEquirectangular(panoramaTexture); scene.environment = reflectionTarget.texture; pmrem.dispose();
    }
    loadTexture('antarctic-glacier-storm-v4', function (texture) {
      texture.encoding = T.sRGBEncoding; texture.wrapS = T.MirroredRepeatWrapping; panoramaTexture = texture;
      skyMaterial.map = texture; skyMaterial.needsUpdate = true;
      reflectionPending = true; status('panorama', 'ready');
    }, function () { skyMaterial.color.setHex(0x10263e); status('panorama', 'error'); });
    function loadCrust() { if (accumulationMaterial) loadTexture('compacted-snow-crust-v2', function (texture) {
      texture.encoding = T.sRGBEncoding; texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(2.5, 2.5);
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      accumulationMaterial.map = texture;
      var bump = texture.clone(); bump.encoding = T.LinearEncoding; bump.needsUpdate = true;
      accumulationMaterial.bumpMap = bump; accumulationMaterial.bumpScale = 0.035;
      accumulationMaterial.needsUpdate = true; status('crust', 'ready');
    }, function () { status('crust', 'error'); }); }

    var groundGeometry = new T.PlaneGeometry(300, 300, 280, 280); groundGeometry.rotateX(-Math.PI / 2);
    var positions = groundGeometry.attributes.position, uv = groundGeometry.attributes.uv;
    for (var i = 0; i < positions.count; i++) {
      var x = positions.getX(i), z = positions.getZ(i);
      x = Math.sign(x) * 150 * Math.pow(Math.abs(x) / 150, 1.6);
      z = Math.sign(z) * 150 * Math.pow(Math.abs(z) / 150, 1.6);
      positions.setXYZ(i, x, heightAt(x, z), z); uv.setXY(i, x / 220 + 0.5, z / 220 + 0.5);
    }
    groundGeometry.computeVertexNormals();
    // The foreground is always opaque and depth-writing, at every camera angle.
    // A backdrop is never a substitute for the surface supporting the instrument.
    var snowMaterial = new T.MeshStandardMaterial({ color: new T.Color(0xa8b5c2).convertSRGBToLinear(), roughness: 0.98, metalness: 0.0, envMapIntensity: 0.16 });
    // Only the remote apron blends into the painted distance. The 35m core never fades.
    var coreIndices = [], apronIndices = [], indices = groundGeometry.index.array;
    for (i = 0; i < indices.length; i += 3) {
      var outside = false;
      for (var corner = 0; corner < 3; corner++) {
        var vertex = indices[i + corner];
        if (Math.hypot(positions.getX(vertex), positions.getZ(vertex)) > 35) outside = true;
      }
      var bucket = outside ? apronIndices : coreIndices;
      bucket.push(indices[i], indices[i + 1], indices[i + 2]);
    }
    var apronGeometry = new T.BufferGeometry();
    Object.keys(groundGeometry.attributes).forEach(function (key) { apronGeometry.setAttribute(key, groundGeometry.attributes[key]); });
    apronGeometry.setIndex(apronIndices); groundGeometry.setIndex(coreIndices);
    var apronMaterial = snowMaterial.clone(); apronMaterial.transparent = true; apronMaterial.depthWrite = false;
    apronMaterial.onBeforeCompile = function (shader) {
      shader.vertexShader = 'varying vec3 apronWorld;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\napronWorld=(modelMatrix*vec4(position,1.)).xyz;');
      shader.fragmentShader = 'varying vec3 apronWorld;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a*=1.-smoothstep(36.,115.,length(apronWorld.xz));');
    };
    var apron = new T.Mesh(apronGeometry, apronMaterial); apron.name = 'distant-snow-transition'; group.add(apron);
    var snow = new T.Mesh(groundGeometry, snowMaterial); snow.name = 'displaced-sastrugi-foreground'; snow.receiveShadow = true; group.add(snow);
    function loadSnow() { loadTexture('wind-carved-snow-v1', function (texture) {
      texture.encoding = T.sRGBEncoding; texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(23, 31);
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      snowMaterial.map = apronMaterial.map = texture;
      // Sample the same micro-relief in linear space for bumping, with separate color metadata.
      var bump = texture.clone(); bump.encoding = T.LinearEncoding; bump.needsUpdate = true;
      snowMaterial.bumpMap = bump; snowMaterial.bumpScale = 0.035; snowMaterial.needsUpdate = true;
      apronMaterial.bumpMap = bump; apronMaterial.bumpScale = 0.035; apronMaterial.needsUpdate = true;
      status('snow', 'ready');
    }, function () { status('snow', 'error'); }); }

    // Transparent low-lying snow haze, shaped by world-space noise; never a screen-white wash.
    var haze = new T.Mesh(new T.PlaneGeometry(110, 100), new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 p; void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 p;uniform float time;float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}float n(vec2 v){vec2 i=floor(v),f=fract(v);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}void main(){vec2 q=p*vec2(5.,34.)-vec2(time*.38,0.);float a=n(q)*.65+n(q*2.03)*.35;float edge=smoothstep(0.,.12,p.x)*(1.-smoothstep(.88,1.,p.x))*smoothstep(0.,.15,p.y)*(1.-smoothstep(.80,1.,p.y));gl_FragColor=vec4(.43,.55,.68,smoothstep(.25,.80,a)*edge*.52);}'
    }));
    haze.rotation.x = -Math.PI / 2; haze.position.set(0, 0.55, -20); haze.renderOrder = 2; group.add(haze);
    // Sparse, world-space wind plumes provide middle-distance parallax. Their soft edges
    // and low opacity avoid replacing the landscape with an opaque screen-space wash.
    var plumeTime = { value: 0 }, plumes = new T.Group(); plumes.name = 'layered-blowing-snow'; group.add(plumes);
    for (i = 0; i < 3; i++) {
      var plumeMaterial = new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide,
        uniforms: { time: plumeTime, seed: { value: i * 7.31 }, strength: { value: 0.20 + i * 0.035 } },
        vertexShader: 'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: [
          'varying vec2 p;uniform float time,seed,strength;',
          'float h(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}',
          'float n(vec2 v){vec2 a=floor(v),f=fract(v);f=f*f*(3.-2.*f);return mix(mix(h(a),h(a+vec2(1,0)),f.x),mix(h(a+vec2(0,1)),h(a+1.),f.x),f.y);}',
          'void main(){vec2 q=p*vec2(5.,3.)+vec2(-time*.24,seed);',
          'float billow=n(q)*.6+n(q*2.17)*.28+n(q*5.03)*.12;',
          'float bottom=.12+n(vec2(p.x*5.-time*.10,seed))*.2;',
          'float envelope=smoothstep(0.,.18,p.x)*(1.-smoothstep(.75,1.,p.x))*smoothstep(bottom,bottom+.15,p.y)*(1.-smoothstep(.48,.97,p.y));',
          'float gust=.65+.35*sin(time*.43+seed);',
          'gl_FragColor=vec4(.59,.66,.73,smoothstep(.28,.74,billow)*envelope*strength*gust);}'
        ].join('\n')
      });
      var plume = new T.Mesh(new T.PlaneGeometry(85 + i * 16, 5 + i * 2), plumeMaterial);
      plume.position.set(-8 + i * 6, 1.4 + i * 0.65, -14 - i * 21); plume.rotation.y = -0.21; plumes.add(plume);
    }
    // Called only after a meaningful panorama/device frame has been presented.
    // Detail downloads cannot compete with the panorama; PMREM cannot block its reveal.
    function afterFrame() {
      if (!detailStarted) { detailStarted = true; loadCrust(); loadSnow(); return; }
      if (reflectionPending) { reflectionPending = false; rebuildReflection(); }
    }
    return { group: group, heightAt: heightAt, afterFrame: afterFrame, restore: rebuildReflection, update: function (time, camera) {
      sky.position.copy(camera.position); haze.material.uniforms.time.value = time; plumeTime.value = time;
    } };
  }
  return { create: create, heightAt: heightAt, noise: noise };
});
