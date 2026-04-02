import * as THREE from 'three';
import { PassManager } from './PassManager';
import { WebcamSource } from './WebcamSource';
import { GlyphAtlas } from './GlyphAtlas';
import { AnalysisPass } from '../passes/AnalysisPass';
import { AsciiMapPass } from '../passes/AsciiMapPass';
import { CompositePass } from '../passes/CompositePass';

const CELL_SIZE_PX = 8;

export class RenderPipeline {
  private renderer: THREE.WebGLRenderer;
  private passManager: PassManager;
  private analysisPass: AnalysisPass;
  private asciiMapPass: AsciiMapPass;
  private compositePass: CompositePass;

  private fboAnalysis!: THREE.WebGLRenderTarget;
  private fboAsciiMap!: THREE.WebGLRenderTarget;

  private uTime: { value: number };
  private uAnalysisTex: { value: THREE.Texture | null };
  private uAsciiMapTex: { value: THREE.Texture | null };
  private uScreenResolution: { value: THREE.Vector2 };
  private uCellCount: { value: THREE.Vector2 };
  private uDebugMode: { value: number };
  private uMode: { value: number };
  private uGlyphCount: { value: number };
  private atlas: GlyphAtlas;

  constructor(
    renderer: THREE.WebGLRenderer,
    webcam: WebcamSource,
    atlas: GlyphAtlas,
  ) {
    this.renderer = renderer;
    this.passManager = new PassManager(renderer);

    // Shared uniform refs
    this.uTime = { value: 0.0 };
    this.uAnalysisTex = { value: null };
    this.uAsciiMapTex = { value: null };
    this.uScreenResolution = { value: new THREE.Vector2() };
    this.uCellCount = { value: new THREE.Vector2() };
    this.uDebugMode = { value: 0.0 };
    this.uMode = { value: 0 };
    this.uGlyphCount = { value: atlas.glyphCount };
    this.atlas = atlas;

    // Create FBOs at initial size
    this.createFBOs();

    // Pass 1: Analysis
    this.analysisPass = new AnalysisPass({
      uWebcamTex: { value: webcam.texture },
      uWebcamTexelSize: { value: webcam.texelSize },
      uBrightness: { value: 0.0 },
      uContrast: { value: 1.2 },
    });

    // Pass 2: ASCII Map
    this.asciiMapPass = new AsciiMapPass({
      uAnalysisTex: this.uAnalysisTex,
      uGlyphCount: this.uGlyphCount,
      uEdgeCharThreshold: { value: 0.3 },
      uCellResolution: this.uCellCount,
    });

    // Pass 5: Composite
    this.compositePass = new CompositePass({
      uAsciiMapTex: this.uAsciiMapTex,
      uGlyphAtlas: { value: atlas.texture },
      uWebcamTex: { value: webcam.texture },
      uScreenResolution: this.uScreenResolution,
      uCellResolution: this.uCellCount,
      uGlyphCount: this.uGlyphCount,
      uColorMix: { value: 0.0 },
      uTintColor: { value: new THREE.Color(0x00ff88) },
      uVignetteStrength: { value: 0.3 },
      uScanlineStrength: { value: 0.15 },
      uGlowStrength: { value: 0.2 },
      uTime: this.uTime,
      uDebugMode: this.uDebugMode,
      uMode: this.uMode,
    });
  }

  private getCellDims(): { screenW: number; screenH: number; cols: number; rows: number } {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const screenW = size.x;
    const screenH = size.y;
    return {
      screenW,
      screenH,
      cols: Math.floor(screenW / CELL_SIZE_PX),
      rows: Math.floor(screenH / CELL_SIZE_PX),
    };
  }

  private createFBOs(): void {
    const { screenW, screenH, cols, rows } = this.getCellDims();
    console.log('[GIDEON] FBO sizing — screen:', screenW, 'x', screenH, '| cells:', cols, 'x', rows);

    this.fboAnalysis = this.passManager.createFBO({
      width: cols,
      height: rows,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this.fboAsciiMap = this.passManager.createFBO({
      width: cols,
      height: rows,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });

    this.uAnalysisTex.value = this.fboAnalysis.texture;
    this.uAsciiMapTex.value = this.fboAsciiMap.texture;
    this.uScreenResolution.value.set(screenW, screenH);
    this.uCellCount.value.set(cols, rows);
  }

  resize(): void {
    this.fboAnalysis.dispose();
    this.fboAsciiMap.dispose();
    this.createFBOs();
  }

  render(dt: number): void {
    this.uTime.value += dt;

    // Pass 1: Analysis — webcam → fboAnalysis (cell resolution)
    this.passManager.renderPass(this.analysisPass.material, this.fboAnalysis);

    // Pass 2: ASCII Map — fboAnalysis → fboAsciiMap (cell resolution)
    this.passManager.renderPass(this.asciiMapPass.material, this.fboAsciiMap);

    // Pass 5: Composite — fboAsciiMap → screen (screen resolution)
    this.passManager.renderPass(this.compositePass.material, null);
  }

  /** Debug mode: 0=normal, 1=luminance, 2=ascii map */
  setDebugMode(mode: number): void {
    this.uDebugMode.value = mode;
  }

  /** Render mode: 0=ascii, 1=raw webcam */
  setMode(mode: number): void {
    this.uMode.value = mode;
  }

  /** Rebuild glyph atlas with a new charset */
  updateCharset(charset: string): void {
    this.atlas.update(charset);
    this.uGlyphCount.value = this.atlas.glyphCount;
  }

  dispose(): void {
    this.fboAnalysis.dispose();
    this.fboAsciiMap.dispose();
    this.analysisPass.dispose();
    this.asciiMapPass.dispose();
    this.compositePass.dispose();
    this.passManager.dispose();
  }
}
