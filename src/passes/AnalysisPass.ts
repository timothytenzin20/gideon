import * as THREE from 'three';
import vertexShader from '../shaders/fullscreen.vert';
import fragmentShader from '../shaders/analysis.frag';

export interface AnalysisUniforms {
  [key: string]: THREE.IUniform;
  uWebcamTex: { value: THREE.Texture };
  uWebcamTexelSize: { value: THREE.Vector2 };
  uBrightness: { value: number };
  uContrast: { value: number };
}

export class AnalysisPass {
  readonly material: THREE.ShaderMaterial;

  constructor(uniforms: AnalysisUniforms) {
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
