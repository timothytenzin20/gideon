
# GIDEON: Implementation Plan

## System Architecture

```
                         GIDEON RENDERING PIPELINE
  ┌─────────────────────────────────────────────────────────────────────┐
  │                                                                     │
  │  ┌──────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
  │  │  WEBCAM   │───▶│ VideoTexture │    │  GLYPH ATLAS (init)     │  │
  │  │  STREAM   │    │ (three.js)   │    │  Canvas2D → GPU texture │  │
  │  └──────────┘    └──────┬───────┘    └────────────┬─────────────┘  │
  │                         │                         │                 │
  │                         ▼                         │                 │
  │  ┌──────────────────────────────────┐             │                 │
  │  │  PASS 1: ANALYSIS (FBO-A)        │             │                 │
  │  │  · Luminance extraction          │             │                 │
  │  │  · Sobel edge detection          │             │                 │
  │  │  · Local contrast                │             │                 │
  │  │  → vec4(luma, edgeX, edgeY,      │             │                 │
  │  │         edgeMagnitude)           │             │                 │
  │  └──────────────┬───────────────────┘             │                 │
  │                 ▼                                 │                 │
  │  ┌──────────────────────────────────┐             │                 │
  │  │  PASS 2: ASCII MAPPING (FBO-B)   │◀────────────┘                 │
  │  │  · Downsample to cell grid       │                              │
  │  │  · Luminance → glyph index       │                              │
  │  │  · Atlas UV lookup               │                              │
  │  │  → vec4(atlasU, atlasV,          │                              │
  │  │         cellLuma, edgeMag)       │                              │
  │  └──────────────┬───────────────────┘                              │
  │                 ▼                                                   │
  │  ┌──────────────────────────────────┐                              │
  │  │  PASS 3: DEPTH + LIGHTING (FBO-C)│                              │
  │  │  · Luminance → heightfield       │                              │
  │  │  · Central-diff → normals        │                              │
  │  │  · Directional light (N·L)       │                              │
  │  │  · Parallax UV offset            │                              │
  │  │  → vec4(lighting, depth,         │                              │
  │  │         parallaxU, parallaxV)    │                              │
  │  └──────────────┬───────────────────┘                              │
  │                 ▼                                                   │
  │  ┌──────────────────────────────────┐  ┌─────────────────────┐     │
  │  │  PASS 4: FLUID MOTION (FBO-D)   │◀─│ PREV FRAME (FBO-E)  │     │
  │  │  · Curl noise flow field         │  │ (ping-pong buffer)  │     │
  │  │  · UV distortion + advection     │  └─────────────────────┘     │
  │  │  · Temporal smoothing (lerp)     │                              │
  │  │  · Character drift               │                              │
  │  │  → vec4(atlasU, atlasV,          │                              │
  │  │         lighting, luminance)     │                              │
  │  └──────────────┬───────────────────┘                              │
  │                 ▼                                                   │
  │  ┌──────────────────────────────────┐                              │
  │  │  PASS 5: COMPOSITE (SCREEN)     │                              │
  │  │  · Cell→pixel glyph sampling     │                              │
  │  │  · Apply lighting + color tint   │                              │
  │  │  · Vignette, scanlines, glow     │                              │
  │  │  → SCREEN OUTPUT                 │                              │
  │  └──────────────────────────────────┘                              │
  └─────────────────────────────────────────────────────────────────────┘
```

**Two resolution domains:**
- Passes 1–4 run at **cell resolution** (e.g., 192×108 = ~20K fragments) — extremely cheap
- Pass 5 runs at **screen resolution** (e.g., 1920×1080) — the only real cost

---

## Project Structure

```
W:\dev\gideon\
├── index.html                  # Entry point, canvas + UI overlay
├── package.json                # three.js, vite, lil-gui, typescript
├── vite.config.js              # vite-plugin-glsl for GLSL imports
├── tsconfig.json
├── src/
│   ├── main.ts                 # Bootstrap engine + render loop
│   ├── engine/
│   │   ├── GideonEngine.ts     # Top-level orchestrator
│   │   ├── WebcamSource.ts     # getUserMedia → VideoTexture
│   │   ├── GlyphAtlas.ts       # Canvas2D atlas → DataTexture
│   │   ├── RenderPipeline.ts   # Multi-pass FBO chain manager
│   │   ├── PassManager.ts      # Fullscreen quad + FBO helpers
│   │   └── Controls.ts         # Uniforms ↔ UI state binding
│   ├── passes/
│   │   ├── AnalysisPass.ts     # Pass 1: luminance + edge
│   │   ├── AsciiMapPass.ts     # Pass 2: glyph lookup
│   │   ├── DepthLightPass.ts   # Pass 3: pseudo-3D + lighting
│   │   ├── FluidPass.ts        # Pass 4: noise distortion + temporal
│   │   └── CompositePass.ts    # Pass 5: final output
│   ├── shaders/
│   │   ├── common.glsl         # Noise, luminance, remap helpers
│   │   ├── fullscreen.vert     # Shared fullscreen quad vertex shader
│   │   ├── analysis.frag       # Pass 1
│   │   ├── asciimap.frag       # Pass 2
│   │   ├── depthlight.frag     # Pass 3
│   │   ├── fluid.frag          # Pass 4
│   │   └── composite.frag      # Pass 5
│   ├── ui/
│   │   ├── ControlPanel.ts     # lil-gui panel
│   │   └── FPSMeter.ts         # Performance overlay
│   └── utils/
│       └── constants.ts        # Default params, character sets
└── public/
```

---

## Build Order (10 Steps)

| Step | What | Test |
|------|------|------|
| 1 | Scaffolding: `package.json`, vite config, tsconfig, `index.html` | `npm run dev` serves blank page |
| 2 | `GlyphAtlas.ts` — Canvas2D → DataTexture | Render atlas to screen as debug view |
| 3 | `WebcamSource.ts` — getUserMedia → VideoTexture | Render raw video to screen |
| 4 | `PassManager.ts` — fullscreen quad, FBO creation | Render video through passthrough shader |
| 5 | Pass 1: `analysis.frag` — luminance + Sobel edges | Visualize luminance/edge FBO |
| 6 | Pass 2: `asciimap.frag` — glyph index selection | Debug view of glyph UVs as colors |
| 7 | Pass 5: `composite.frag` — skip 3+4, basic ASCII output | **First ASCII rendering visible** |
| 8 | Pass 3: `depthlight.frag` — pseudo-3D lighting | Wire into composite, see lit ASCII |
| 9 | Pass 4: `fluid.frag` + ping-pong buffers | Motion trails + flow visible |
| 10 | UI: `ControlPanel.ts` with lil-gui, FPS meter, resize | Full interactive playground |

---

## Shader Details

### Glyph Atlas Strategy

Generated once at init via Canvas2D, uploaded as GPU texture:

1. Character set ordered by visual density (dark → light): `" .:-=+*#%@"`
2. Offscreen canvas: single row, `cellWidth = fontSize * 0.6`, `cellHeight = fontSize`
3. White glyphs on black background, monospace font
4. Extract red channel only → `THREE.DataTexture` with `RedFormat`, `NEAREST` filtering

**Atlas UV math in the shader:**
```glsl
// Given luminance L ∈ [0,1] and N glyphs:
int index = clamp(int(floor((1.0 - L) * (N - 1.0) + 0.5)), 0, N-1);
vec2 glyphOrigin = vec2(float(index) / N, 0.0);

// In composite pass, sub-cell position selects which texel of the glyph:
vec2 glyphUV = glyphOrigin + cellFract * vec2(1.0/N, 1.0);
float alpha = texture2D(uGlyphAtlas, glyphUV).r;
```

### Pass 1 — Analysis (`analysis.frag`)

- Samples webcam (horizontally flipped for mirror)
- Computes luminance with brightness/contrast controls
- 3×3 Sobel for edge detection (9 texture samples)
- Outputs: `vec4(luma, edgeX_encoded, edgeY_encoded, edgeMagnitude)`

### Pass 2 — ASCII Map (`asciimap.frag`)

- Maps luminance → glyph index via `floor(invertedLuma * (glyphCount - 1))`
- Edge magnitude biases toward denser glyphs (edge emphasis)
- Outputs: `vec4(atlasOriginU, atlasOriginV, luminance, edgeMag)`

### Pass 3 — Depth + Lighting (`depthlight.frag`)

Three techniques stacked:

1. **Heightfield**: `height = luminance * depthIntensity` (bright = raised)
2. **Normal reconstruction**: Central differences on height field → `normalize(vec3(dH/dx, dH/dy, 1.0))`
3. **Directional lighting**: `ambient + max(dot(normal, lightDir), 0.0) * strength` — light direction is user-controllable (angle → vec2)
4. **Edge rim light**: `+= edgeMag * 0.3 * lightStrength`
5. **Parallax offset**: `lightDir * height * 0.02` — subtle UV shift for depth illusion

### Pass 4 — Fluid Motion (`fluid.frag`)

Three layered motion techniques:

1. **Curl noise flow field**: Simplex noise evaluated at each cell, curl derivative gives divergence-free flow vectors → UV distortion
2. **Temporal smoothing**: Ping-pong FBO pair, `mix(current, previous, smoothFactor)` — previous frame sampled with flow offset for advection trails
3. **Character drift**: Separate slow noise (5-10s cycles) offsets cells by sub-cell amounts

Ping-pong management:
```
Frame N:   Read FBO_A → Write FBO_B
Frame N+1: Read FBO_B → Write FBO_A
Toggle: currentFBO ^= 1
```

### Pass 5 — Composite (`composite.frag`)

Runs at full screen resolution. For each pixel:
1. Determine cell index: `floor(pixelPos / cellSize)`
2. Compute sub-cell position: `fract(pixelPos / cellSize)`
3. Sample fluid FBO at cell center → get glyph atlas UV + lighting
4. Sample glyph atlas at `glyphOrigin + cellFract * glyphCellSize` → alpha mask
5. Color = `mix(tintColor, webcamColor, colorMix) * lighting * glyphAlpha`
6. Post-effects: vignette, scanlines, glow

---

## FBO Configuration

| FBO | Resolution | Format | Filter | Content |
|-----|-----------|--------|--------|---------|
| analysis | cellW × cellH | RGBA16F | LINEAR | Luma + edges |
| asciiMap | cellW × cellH | RGBA16F | NEAREST | Glyph UVs + meta |
| depthLight | cellW × cellH | RGBA16F | LINEAR | Lighting + depth |
| fluidA | cellW × cellH | RGBA16F | LINEAR | Ping-pong A |
| fluidB | cellW × cellH | RGBA16F | LINEAR | Ping-pong B |

For 1920×1080 @ 10px cells: 192×108 = **20,736 fragments** per cell-resolution pass. Trivial.

---

## Render Loop (Pipeline Orchestration)

```typescript
render(time: number, dt: number): void {
  // Pass 1: Webcam → Analysis FBO
  renderPass(analysisMaterial, fbo.analysis);

  // Pass 2: Analysis → ASCII Map FBO
  renderPass(asciiMapMaterial, fbo.asciiMap);

  // Pass 3: ASCII Map → Depth+Light FBO
  renderPass(depthLightMaterial, fbo.depthLight);

  // Pass 4: ASCII+Depth+PrevFrame → Fluid FBO (ping-pong)
  const [readFBO, writeFBO] = pingPongPair();
  renderPass(fluidMaterial, writeFBO);
  togglePingPong();

  // Pass 5: Fluid → Screen (null target = screen)
  renderPass(compositeMaterial, null);
}
```

---

## User Controls (lil-gui)

| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| ASCII Resolution | 6–16 px | 10 | Cell size → grid density |
| Character Set | minimal/standard/extended | standard | Glyph variety |
| Brightness | -1 to 1 | 0 | Luminance offset |
| Contrast | 0.5 to 3.0 | 1.2 | Luminance scaling |
| Temporal Smooth | 0 to 0.95 | 0.7 | Motion trail persistence |
| Fluid Intensity | 0 to 1 | 0.3 | Noise distortion strength |
| Flow Speed | 0.1 to 2.0 | 0.5 | Flow field animation rate |
| Drift Amount | 0 to 0.02 | 0.005 | Character wander magnitude |
| Depth Intensity | 0 to 2 | 0.8 | Heightfield scale |
| Light Angle | 0–360° | 45 | Directional light heading |
| Light Strength | 0 to 2 | 1.0 | Diffuse light multiplier |
| Color Mode | mono/tinted/full | mono | Grayscale vs webcam color |
| Tint Color | hex | #00ff88 | Monochrome base color |
| Vignette | 0 to 1 | 0.3 | Edge darkening |
| Scanlines | 0 to 1 | 0.15 | CRT scanline effect |
| Glow | 0 to 1 | 0.2 | Bloom around bright chars |
| FPS Cap | 30/60/uncapped | 60 | Frame rate limiter |

---

## Performance Budget

| Pass | Resolution | Texture Samples | Cost |
|------|-----------|----------------|------|
| Analysis | cell (~20K) | 9 (Sobel) | Negligible |
| ASCII Map | cell | 1 | Negligible |
| Depth/Light | cell | 5 | Negligible |
| Fluid | cell | 4 | Negligible |
| **Composite** | **screen (~2M)** | **3** | **~90% of GPU time** |

Total: ~22 samples at cell res + 3 at screen res per frame. Comfortable for 60 FPS on integrated GPUs.

---

## Future Upgrade Paths

**WebGPU**: Each pass is already an isolated shader with explicit I/O — maps directly to WebGPU render/compute passes. Bind groups replace uniform blocks. Feature-detect `navigator.gpu` for dual codepath.

**Instanced 3D ASCII**: Replace composite pass with `InstancedBufferGeometry`. Each cell = instanced quad with per-instance `(position.xyz, glyphIndex, color, scale)`. Depth value becomes real Z-displacement. Enables camera orbit. ~20K instances is trivial.

**SDF Characters**: Replace bitmap atlas with MSDF atlas. Shader: `smoothstep(0.5 - fwidth(d), 0.5 + fwidth(d), texture(atlas, uv).r)`. Enables infinite zoom, outlines, glow halos.

**Particle Systems**: Spawn GPU particles at high-edge locations, advect along flow field, render as tiny ASCII. Transform feedback (WebGL2) or compute shaders (WebGPU).

**Audio Reactivity**: FFT data as 1D texture → modulate depth pulse (bass), flow speed (mids), char density (highs).
