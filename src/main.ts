import * as THREE from 'three';
import { WebcamSource } from './engine/WebcamSource';
import { GlyphAtlas } from './engine/GlyphAtlas';
import { RenderPipeline } from './engine/RenderPipeline';

const CHARSETS: Record<string, string> = {
  minimal:  ' .:-=+*#%@',
  standard: " .',:;!|/)(}{><*+-=~_?1iltfjrxnuvczXYUJCLQ0OZmwqpdbkhao#MW&8%B@$",
  dense:    " .'`^\",:;Il!i~+_-?][}{1)(|\\/*tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
};

async function main() {
  const canvas = document.getElementById('gideon-canvas') as HTMLCanvasElement;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.autoClear = false;

  const webcam = new WebcamSource();
  await webcam.start();

  const atlas = new GlyphAtlas();
  const pipeline = new RenderPipeline(renderer, webcam, atlas);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    pipeline.resize();
  });

  // UI controls
  const modeSelect = document.getElementById('ui-mode') as HTMLSelectElement;
  const charsetSelect = document.getElementById('ui-charset') as HTMLSelectElement;

  modeSelect.addEventListener('change', () => {
    const mode = modeSelect.value === 'raw' ? 1 : 0;
    pipeline.setMode(mode);
    console.log('[GIDEON] Mode:', modeSelect.value);
  });

  charsetSelect.addEventListener('change', () => {
    const charset = CHARSETS[charsetSelect.value] ?? CHARSETS.minimal;
    pipeline.updateCharset(charset);
    console.log('[GIDEON] Charset:', charsetSelect.value, `(${charset.length} glyphs)`);
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
