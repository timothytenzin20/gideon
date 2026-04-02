import * as THREE from 'three';

export class WebcamSource {
  readonly texture: THREE.VideoTexture;
  readonly texelSize: THREE.Vector2;
  private video: HTMLVideoElement;
  private ready = false;

  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;

    this.texture = new THREE.VideoTexture(this.video);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.texelSize = new THREE.Vector2(1 / 1280, 1 / 720);
  }

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });

    this.video.srcObject = stream;
    await this.video.play();

    const w = this.video.videoWidth;
    const h = this.video.videoHeight;
    this.texelSize.set(1 / w, 1 / h);
    this.ready = true;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get width(): number {
    return this.video.videoWidth;
  }

  get height(): number {
    return this.video.videoHeight;
  }

  dispose(): void {
    const stream = this.video.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this.texture.dispose();
  }
}
