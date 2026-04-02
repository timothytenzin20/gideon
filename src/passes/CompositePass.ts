import * as THREE from 'three';
import vertexShader from '../shaders/fullscreen.vert';
import fragmentShader from '../shaders/composite.frag';

export interface CompositeUniforms {
  [key: string]: THREE.IUniform;
  uAsciiMapTex: { value: THREE.Texture | null };
  uGlyphAtlas: { value: THREE.Texture };
  uWebcamTex: { value: THREE.Texture };
  uScreenResolution: { value: THREE.Vector2 };
  uCellResolution: { value: THREE.Vector2 };
  uGlyphCount: { value: number };
  uColorMix: { value: number };
  uTintColor: { value: THREE.Color };
  uVignetteStrength: { value: number };
  uScanlineStrength: { value: number };
  uGlowStrength: { value: number };
  uTime: { value: number };
}

export class CompositePass {
  readonly material: THREE.ShaderMaterial;

  constructor(uniforms: CompositeUniforms) {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
  }

  dispose(): void {
    this.material.dispose();
  }
}
