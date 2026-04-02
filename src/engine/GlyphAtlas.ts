import * as THREE from 'three';

const DEFAULT_CHARSET = ' .:-=+*#%@';

export class GlyphAtlas {
  readonly texture: THREE.DataTexture;
  glyphCount: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  private fontSize: number;

  constructor(fontSize = 20, charset = DEFAULT_CHARSET) {
    this.fontSize = fontSize;
    this.glyphCount = charset.length;
    this.cellWidth = Math.ceil(fontSize * 0.6);
    this.cellHeight = fontSize;

    const { data, width, height } = this.renderAtlas(charset);

    this.texture = new THREE.DataTexture(
      data as unknown as BufferSource,
      width,
      height,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  private renderAtlas(charset: string): { data: Uint8Array; width: number; height: number } {
    const count = charset.length;
    const atlasWidth = count * this.cellWidth;
    const atlasHeight = this.cellHeight;

    const canvas = document.createElement('canvas');
    canvas.width = atlasWidth;
    canvas.height = atlasHeight;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, atlasWidth, atlasHeight);

    ctx.fillStyle = '#fff';
    ctx.font = `${this.fontSize}px monospace`;
    ctx.textBaseline = 'top';

    for (let i = 0; i < count; i++) {
      ctx.fillText(charset[i], i * this.cellWidth, 0);
    }

    const imageData = ctx.getImageData(0, 0, atlasWidth, atlasHeight);
    const redChannel = new Uint8Array(atlasWidth * atlasHeight);
    for (let i = 0; i < redChannel.length; i++) {
      redChannel[i] = imageData.data[i * 4];
    }

    return { data: redChannel, width: atlasWidth, height: atlasHeight };
  }

  update(charset: string): void {
    this.glyphCount = charset.length;
    const { data, width, height } = this.renderAtlas(charset);

    this.texture.image.data = data;
    this.texture.image.width = width;
    this.texture.image.height = height;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
