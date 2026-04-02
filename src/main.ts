import * as THREE from 'three';
import { WebcamSource } from './engine/WebcamSource';
import { GlyphAtlas } from './engine/GlyphAtlas';
import { RenderPipeline } from './engine/RenderPipeline';

const CHARSETS: Record<string, string> = {
  minimal:  ' .:-=+*#%@',
  standard: " .',:;!|/)(}{><*+-=~_?1iltfjrxnuvczXYUJCLQ0OZmwqpdbkhao#MW&8%B@$",
  dense:    " .'`^\",:;Il!i~+_-?][}{1)(|\\/*tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
};

const MIN_WIDTH = 320;
const MAX_WIDTH = 1920;

/** Compute canvas CSS size that fits the window while preserving webcam aspect ratio */
function fitCanvas(
  canvas: HTMLCanvasElement,
  aspect: number,
  renderer: THREE.WebGLRenderer,
  pipeline: RenderPipeline,
) {
  const winW = window.innerWidth;
  const winH = window.innerHeight;

  // Fit inside window, preserving aspect ratio
  let w = winW;
  let h = Math.round(w / aspect);
  if (h > winH) {
    h = winH;
    w = Math.round(h * aspect);
  }

  // Clamp to min/max
  w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
  h = Math.round(w / aspect);

  // Set CSS display size
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  // Set renderer drawing buffer to device-pixel size
  renderer.setSize(w, h, false);
  pipeline.resize();
}

async function main() {
  const canvas = document.getElementById('gideon-canvas') as HTMLCanvasElement;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.autoClear = false;

  const webcam = new WebcamSource();
  await webcam.start();

  const atlas = new GlyphAtlas();
  const pipeline = new RenderPipeline(renderer, webcam, atlas);

  const aspect = webcam.aspectRatio;

  // Initial sizing
  fitCanvas(canvas, aspect, renderer, pipeline);

  window.addEventListener('resize', () => {
    fitCanvas(canvas, aspect, renderer, pipeline);
  });

  // UI controls
  const modeSelect = document.getElementById('ui-mode') as HTMLSelectElement;
  const charsetSelect = document.getElementById('ui-charset') as HTMLSelectElement;
  const colorSelect = document.getElementById('ui-color') as HTMLSelectElement;
  const customInput = document.getElementById('ui-custom-charset') as HTMLInputElement;

  modeSelect.addEventListener('change', () => {
    const mode = modeSelect.value === 'raw' ? 1 : 0;
    pipeline.setMode(mode);
    console.log('[GIDEON] Mode:', modeSelect.value);
  });

  charsetSelect.addEventListener('change', () => {
    const charset = CHARSETS[charsetSelect.value] ?? CHARSETS.minimal;
    pipeline.updateCharset(charset);
    customInput.value = '';
    console.log('[GIDEON] Charset:', charsetSelect.value, `(${charset.length} glyphs)`);
  });

  const COLOR_VALUES: Record<string, number> = { mono: 0.0, full: 1.0 };
  colorSelect.addEventListener('change', () => {
    pipeline.setColorMix(COLOR_VALUES[colorSelect.value] ?? 0.0);
    console.log('[GIDEON] Color:', colorSelect.value);
  });

  const algorithmSelect = document.getElementById('ui-algorithm') as HTMLSelectElement;
  algorithmSelect.addEventListener('change', () => {
    const algo = algorithmSelect.value === 'edge' ? 1 : 0;
    pipeline.setAlgorithm(algo);
    console.log('[GIDEON] Algorithm:', algorithmSelect.value);
  });

  customInput.addEventListener('input', () => {
    const chars = customInput.value;
    if (chars.length >= 2) {
      const charset = chars.startsWith(' ') ? chars : ' ' + chars;
      pipeline.updateCharset(charset);
      charsetSelect.value = '';
      console.log('[GIDEON] Custom charset:', `(${charset.length} glyphs)`);
    }
  });

  // Debug toggle: press 'D' to cycle modes (0=normal, 1=luminance, 2=ascii map)
  let debugMode = 0;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
      debugMode = (debugMode + 1) % 3;
      pipeline.setDebugMode(debugMode);
      console.log('[GIDEON] Debug mode:', ['normal', 'luminance', 'ascii map'][debugMode]);
    }
  });

  let lastTime = performance.now();

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = (now - lastTime) * 0.001;
    lastTime = now;
    pipeline.render(dt);
  }

  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error('GIDEON failed to start:', err);
  document.body.style.color = '#f44';
  document.body.style.padding = '2rem';
  document.body.style.fontFamily = 'monospace';
  document.body.textContent = `GIDEON init error: ${err.message}`;
});
