import * as THREE from 'three';

export interface FBOOptions {
  width: number;
  height: number;
  minFilter?: THREE.MinificationTextureFilter;
  magFilter?: THREE.MagnificationTextureFilter;
  type?: THREE.TextureDataType;
}

export class PassManager {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;
  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene.add(this.quad);
  }

  createFBO(opts: FBOOptions): THREE.WebGLRenderTarget {
    const useHalfFloat = this.renderer.extensions.has('EXT_color_buffer_half_float');
    const dataType = useHalfFloat ? THREE.HalfFloatType : THREE.FloatType;

    return new THREE.WebGLRenderTarget(opts.width, opts.height, {
      minFilter: opts.minFilter ?? THREE.LinearFilter,
      magFilter: opts.magFilter ?? THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat,
      type: opts.type ?? dataType,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  renderPass(
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget | null,
  ): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    (this.quad.geometry as THREE.BufferGeometry).dispose();
  }
}
