import * as THREE from 'three';
import vertexShader from '../shaders/fullscreen.vert';
import fragmentShader from '../shaders/asciimap.frag';

export interface AsciiMapUniforms {
  [key: string]: THREE.IUniform;
  uAnalysisTex: { value: THREE.Texture | null };
  uGlyphCount: { value: number };
  uEdgeCharThreshold: { value: number };
  uCellResolution: { value: THREE.Vector2 };
  uAlgorithm: { value: number };
  uEdgeCharIndices: { value: THREE.Vector4 };
}

export class AsciiMapPass {
  readonly material: THREE.ShaderMaterial;

  constructor(uniforms: AsciiMapUniforms) {
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
