// Cel-shading toolkit: stepped-light "anime" materials and ink outlines.
//
// Materials are MeshToonMaterial with hard gradient ramps, plus a shader
// patch that adds a crisp specular band (shiny plastic / polished metal) and
// a rim light. Outlines are inverted hulls: a back-face copy of a mesh pushed
// out along smoothed normals by a few pixels (capped in world units so tiny
// parts don't drown in ink), drawn on their own layer so they can be toggled
// with the camera's layer mask. Hulls share their source geometry.

import * as THREE from 'three';

export const MM = 0.001;
export const INK = '#120b1e';
export const INK_LAYER = 1;

// ------------------------------------------------------------ colour helpers

const _c1 = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

// Lightness/saturation shift in HSL, returns a hex string.
export function tone(hex, dl = 0, ds = 0, dh = 0) {
  _c1.set(hex).getHSL(_hsl);
  _c1.setHSL((_hsl.h + dh + 1) % 1, Math.min(1, Math.max(0, _hsl.s + ds)), Math.min(1, Math.max(0, _hsl.l + dl)));
  return '#' + _c1.getHexString();
}
// Ink colour for a fill: a very dark, saturated version of it (anime line art
// is rarely pure black), or the global ink.
export function inkFor(hex, k = 0.75) {
  _c1.set(hex).getHSL(_hsl);
  _c1.setHSL(_hsl.h, Math.min(1, _hsl.s * 0.8 + 0.2), Math.max(0.04, _hsl.l * (1 - k) * 0.5));
  return '#' + _c1.getHexString();
}
export function mix(a, b, t) { return '#' + _c1.set(a).lerp(new THREE.Color(b), t).getHexString(); }

// ------------------------------------------------------------ gradient ramps

const ramps = new Map();
// Hard light bands. `levels` are the brightness of each band from shadow to
// lit, as 0..255.
export function gradientRamp(levels = [96, 176, 255]) {
  const key = levels.join(',');
  if (ramps.has(key)) return ramps.get(key);
  const data = new Uint8Array(levels);
  const tex = new THREE.DataTexture(data, levels.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  ramps.set(key, tex);
  return tex;
}

export const RAMPS = {
  plastic: [92, 178, 255],
  metal: [60, 120, 190, 255],
  rubber: [70, 150],
  clear: [140, 210, 255],
  gem: [110, 190, 255],
  flat: [190, 255],
};

// ------------------------------------------------------------ render style

// 'ink': cel shading with ink outlines (the default look). 'realistic':
// physically based plastic, metal and rubber lit by the stadium environment
// (render/environment.js), no outlines. Set before building models; the
// renderer rebuilds the stadium and tops when it changes.
let STYLE = 'ink';
export function setRenderStyle(s) { STYLE = s === 'realistic' ? 'realistic' : 'ink'; }
export const renderStyle = () => STYLE;
// What is being built: 'top' gets full physically based finishes (clearcoat,
// iridescence); 'arena' covers most of the screen, so it uses the cheaper
// standard material.
let CONTEXT = 'top';
export function setMaterialContext(c) { CONTEXT = c; }

// Physically based versions of the cel finishes.
const PBR = {
  plastic: { roughness: 0.4, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.22 },
  gloss: { roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06 },
  metal: { roughness: 0.3, metalness: 1 },
  chrome: { roughness: 0.06, metalness: 1 },
  rubber: { roughness: 0.92, metalness: 0 },
  clear: { roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 },
  gem: { roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.7, iridescenceIOR: 1.5 },
  matte: { roughness: 0.82, metalness: 0 },
};

function physicalMaterial(color, opts, finish) {
  let f = PBR[finish] || PBR.plastic;
  // clearcoat and iridescence cost shader time: plain Standard where they're
  // off, and always for the stadium (it fills the screen)
  if (CONTEXT === 'arena') f = { roughness: Math.min(1, f.roughness + 0.12), metalness: f.metalness };
  const Mat = f.clearcoat || f.iridescence ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const mat = new Mat({
    color, ...f,
    emissive: opts.emissive || '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? (opts.emissive ? 1 : 0),
    transparent: opts.opacity != null && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    map: opts.map || null,
    emissiveMap: opts.emissiveMap || null,
  });
  if (opts.flatShading) mat.flatShading = true;
  if (mat.transparent) mat.depthWrite = opts.depthWrite ?? false;
  mat.userData.ink = opts.ink ?? inkFor(color);
  mat.userData.finish = finish;
  return mat;
}

// ------------------------------------------------------------ toon material

// Finish presets: band ramp, specular band size/strength, rim strength.
const FINISH = {
  plastic: { ramp: 'plastic', spec: 0.55, specEdge: 0.965, rim: 0.32 },
  gloss: { ramp: 'plastic', spec: 0.9, specEdge: 0.94, rim: 0.42 },
  metal: { ramp: 'metal', spec: 1.15, specEdge: 0.9, rim: 0.55 },
  chrome: { ramp: 'metal', spec: 1.6, specEdge: 0.86, rim: 0.75 },
  rubber: { ramp: 'rubber', spec: 0.0, specEdge: 0.99, rim: 0.18 },
  clear: { ramp: 'clear', spec: 1.0, specEdge: 0.93, rim: 0.7 },
  gem: { ramp: 'gem', spec: 1.3, specEdge: 0.9, rim: 0.8 },
  matte: { ramp: 'plastic', spec: 0.0, specEdge: 0.99, rim: 0.22 },
};

const sharedUniforms = { uSpecBoost: { value: 1 } };

function patchToon(mat) {
  const u = mat.userData.toonUniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, sharedUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uSpec; uniform float uSpecEdge; uniform float uRim; uniform vec3 uRimColor; uniform float uSpecBoost;`)
      .replace('#include <opaque_fragment>', `{
  vec3 vdir = normalize( vViewPosition );
  float ndv = clamp( dot( normal, vdir ), 0.0, 1.0 );
  #if NUM_DIR_LIGHTS > 0
    vec3 hdir = normalize( directionalLights[ 0 ].direction + vdir );
    float sb = smoothstep( uSpecEdge - 0.012, uSpecEdge, dot( normal, hdir ) );
    outgoingLight += sb * uSpec * uSpecBoost * 0.55 * directionalLights[ 0 ].color;
  #endif
  float rimv = smoothstep( 0.68, 0.74, 1.0 - ndv );
  outgoingLight += uRimColor * rimv * uRim;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'toon-x';
}

// Cel-shaded material. opts:
//   finish: plastic | gloss | metal | chrome | rubber | clear | gem | matte
//   emissive, emissiveIntensity, opacity, side, flatShading, map,
//   rim (override strength), rimColor, spec (override), outline: false to skip
export function toonMaterial(color, opts = {}) {
  if (STYLE === 'realistic') return physicalMaterial(color, opts, opts.finish || 'plastic');
  const f = FINISH[opts.finish || 'plastic'] || FINISH.plastic;
  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap: gradientRamp(RAMPS[f.ramp]),
    emissive: opts.emissive || '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? (opts.emissive ? 1 : 0),
    transparent: opts.opacity != null && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    map: opts.map || null,
    emissiveMap: opts.emissiveMap || null,
  });
  if (opts.flatShading) mat.flatShading = true;
  if (mat.transparent) mat.depthWrite = opts.depthWrite ?? false;
  mat.userData.toonUniforms = {
    uSpec: { value: opts.spec ?? f.spec },
    uSpecEdge: { value: opts.specEdge ?? f.specEdge },
    uRim: { value: opts.rim ?? f.rim },
    uRimColor: { value: new THREE.Color(opts.rimColor || tone(color, 0.35, -0.1)) },
  };
  mat.userData.ink = opts.ink ?? inkFor(color);
  patchToon(mat);
  return mat;
}

// Global specular multiplier (e.g. dimmer on low quality).
export function setSpecBoost(v) { sharedUniforms.uSpecBoost.value = v; }

// ------------------------------------------------------------ ink outlines

const inkUniforms = {
  uRes: { value: new THREE.Vector2(1280, 720) },
  uInkScale: { value: 1 },
};
export function setInkResolution(w, h, pixelRatio = 1) {
  inkUniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
  // keep line weight consistent across render scales: thickness is in CSS px
  inkUniforms.uInkScale.value = pixelRatio;
}

const INK_VERT = `
uniform vec2 uRes;
uniform float uInkScale;
uniform float uPx;
uniform float uMaxWorld;
attribute vec3 inkNormal;
#include <common>
#include <fog_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  vec3 n = normalize( normalMatrix * inkNormal );
  // world size of one pixel at this depth
  float pxWorld = 2.0 * max( -mv.z, 1e-4 ) / ( uRes.y * projectionMatrix[ 1 ][ 1 ] );
  if ( projectionMatrix[ 3 ][ 3 ] > 0.5 ) pxWorld = 2.0 / ( uRes.y * projectionMatrix[ 1 ][ 1 ] );
  float off = min( uPx * uInkScale * pxWorld, uMaxWorld );
  mv.xyz += n * off;
  vec4 mvPosition = mv;
  gl_Position = projectionMatrix * mv;
  // nudge the hull slightly back so it never paints over its own surface
  gl_Position.z += 2e-5 * gl_Position.w;
  #include <clipping_planes_vertex>
  #include <fog_vertex>
}`;
const INK_FRAG = `
uniform vec3 uInk;
uniform float uAlpha;
#include <common>
#include <fog_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  gl_FragColor = vec4( uInk, uAlpha );
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const inkMats = new Map();
// Shared ink material per (colour, width, cap, alpha).
export function inkMaterial(color = INK, px = 2, maxWorld = 0.7 * MM, alpha = 1) {
  const key = `${color}|${px}|${maxWorld}|${alpha}`;
  if (inkMats.has(key)) return inkMats.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uInk: { value: new THREE.Color(color) }, uPx: { value: px }, uMaxWorld: { value: maxWorld }, uAlpha: { value: alpha },
    }]),
    vertexShader: INK_VERT,
    fragmentShader: INK_FRAG,
    side: THREE.BackSide,
    fog: true,
    transparent: alpha < 1,
  });
  // share the resolution uniforms by reference
  m.uniforms.uRes = inkUniforms.uRes;
  m.uniforms.uInkScale = inkUniforms.uInkScale;
  m.userData.shared = true;
  inkMats.set(key, m);
  return m;
}

// Average normals over coincident vertices so hulls close at hard edges.
// Stored as a separate attribute; the lit surface keeps its crisp normals.
export function ensureInkNormals(geo) {
  if (geo.attributes.inkNormal) return geo;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const n = pos.count;
  const acc = new Map();
  const keys = new Array(n);
  const q = 1e7; // 0.1 µm grid
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * q)},${Math.round(pos.getY(i) * q)},${Math.round(pos.getZ(i) * q)}`;
    keys[i] = k;
    let a = acc.get(k);
    if (!a) { a = [0, 0, 0]; acc.set(k, a); }
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i);
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = acc.get(keys[i]);
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  geo.setAttribute('inkNormal', new THREE.BufferAttribute(out, 3));
  return geo;
}

// Give a mesh an ink outline (child hull on INK_LAYER). opts: color, px, maxMm, alpha.
export function addInk(mesh, opts = {}) {
  if (STYLE === 'realistic') return mesh; // no outlines in the realistic style
  if (!mesh.isMesh || mesh.userData.inkHull) return mesh;
  ensureInkNormals(mesh.geometry);
  const color = opts.color || mesh.material?.userData?.ink || INK;
  const hull = new THREE.Mesh(mesh.geometry, inkMaterial(color, opts.px ?? 2, (opts.maxMm ?? 0.7) * MM, opts.alpha ?? 1));
  hull.layers.set(INK_LAYER);
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.matrixAutoUpdate = false; // identity relative to its source mesh
  hull.userData.isInk = true;
  hull.raycast = () => {};
  mesh.add(hull);
  mesh.userData.inkHull = hull;
  return mesh;
}

// Mesh + material + ink in one call.
export function inked(geo, mat, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.castShadow ?? true;
  if (opts.ink !== false) addInk(m, opts);
  return m;
}

// Outline every mesh under an object that doesn't have one yet and isn't
// opted out (userData.noInk).
export function inkAll(obj, opts = {}) {
  obj.traverse((o) => { if (o.isMesh && !o.userData.isInk && !o.userData.noInk && !o.userData.inkHull) addInk(o, opts); });
  return obj;
}

// Dispose geometries and non-shared materials/textures under an object.
export function disposeTree(obj) {
  const seenGeo = new Set();
  obj.traverse((o) => {
    if (o.geometry && !seenGeo.has(o.geometry)) { seenGeo.add(o.geometry); o.geometry.dispose(); }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData?.shared) continue;
      for (const k of ['map', 'emissiveMap', 'alphaMap']) if (m[k] && !m[k].userData?.shared) m[k].dispose();
      m.dispose();
    }
  });
}

// ------------------------------------------------------------ small helpers

// Canvas texture with sRGB colour space.
export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Segment counts by quality.
export function segs(quality, high, medium = Math.round(high * 0.66), low = Math.round(high * 0.4)) {
  return quality === 'low' ? Math.max(6, low) : quality === 'medium' ? Math.max(8, medium) : high;
}
