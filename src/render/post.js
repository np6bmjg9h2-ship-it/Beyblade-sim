// Post-processing for the realistic style (three.js's own passes): the scene
// renders into an HDR target (multisampled on High), then bloom (glows,
// sparks and hot highlights), the output pass (tone mapping, sRGB) and, on
// Medium, an FXAA edge filter. Ambient occlusion (GTAO) is available but off:
// it re-renders the scene for normals, and with it High ran at about 20 fps at
// 1080p on an Intel UHD 620 (40 fps without it).

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

export class PostFX {
  // opts: { quality: 'low'|'medium'|'high', ao: bool, bloom: bool }
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    const q = opts.quality || 'high';
    const size = renderer.getSize(new THREE.Vector2());
    const dpr = renderer.getPixelRatio();
    const w = Math.max(1, Math.round(size.x * dpr)), h = Math.max(1, Math.round(size.y * dpr));
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 0 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(size.x, size.y);
    this.render0 = new RenderPass(scene, camera);
    this.composer.addPass(this.render0);
    if (opts.ao) {
      this.ao = new GTAOPass(scene, camera, w, h);
      this.ao.output = GTAOPass.OUTPUT.Default;
      this.ao.blendIntensity = 0.85;
      this.ao.updateGtaoMaterial({ radius: 0.012, distanceExponent: 1.5, thickness: 0.01, scale: 1, samples: 12 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 12 });
      this.composer.addPass(this.ao);
    }
    if (opts.bloom ?? q !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.45, 0.35, 0.92);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    // Medium skips multisampling: a cheap edge filter after tone mapping instead
    if (q === 'medium') {
      this.fxaa = new ShaderPass(FXAAShader);
      this.fxaa.material.uniforms.resolution.value.set(1 / w, 1 / h);
      this.composer.addPass(this.fxaa);
    }
  }

  setSize(w, h, dpr) {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.fxaa?.material.uniforms.resolution.value.set(1 / (w * dpr), 1 / (h * dpr));
  }

  render(dt) { this.composer.render(dt); }

  dispose() {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    for (const p of this.composer.passes) p.dispose?.();
  }
}
