import * as THREE from 'three';

const DEFAULT_CHARSET = ' .:-=+*#%@';

export class GlyphAtlas {
  readonly texture: THREE.DataTexture;
  readonly glyphCount: number;
  readonly cellWidth: number;
  readonly cellHeight: number;

  constructor(fontSize = 20, charset = DEFAULT_CHARSET) {
    this.glyphCount = charset.length;
    this.cellWidth = Math.ceil(fontSize * 0.6);
    this.cellHeight = fontSize;

    const atlasWidth = this.glyphCount * this.cellWidth;
    const atlasHeight = this.cellHeight;

    const canvas = document.createElement('canvas');
    canvas.width = atlasWidth;
    canvas.height = atlasHeight;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, atlasWidth, atlasHeight);

    ctx.fillStyle = '#fff';
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = 'top';

    for (let i = 0; i < this.glyphCount; i++) {
      ctx.fillText(charset[i], i * this.cellWidth, 0);
    }

    const imageData = ctx.getImageData(0, 0, atlasWidth, atlasHeight);
    const redChannel = new Uint8Array(atlasWidth * atlasHeight);
    for (let i = 0; i < redChannel.length; i++) {
      redChannel[i] = imageData.data[i * 4];
    }

    this.texture = new THREE.DataTexture(
      redChannel,
      atlasWidth,
      atlasHeight,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
