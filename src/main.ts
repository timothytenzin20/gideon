import * as THREE from 'three';
import { WebcamSource } from './engine/WebcamSource';
import { GlyphAtlas } from './engine/GlyphAtlas';
import { RenderPipeline } from './engine/RenderPipeline';

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
