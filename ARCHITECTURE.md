# GIDEON: Architecture Contract v1 (MVP)

This document is the **binding specification** for implementation. All uniform names, channel layouts, texture formats, and resolutions defined here are exact. Implementers must match them precisely.

---

## Scope

MVP pipeline: 3 passes only. Depth/Light (Pass 3) and Fluid (Pass 4) are deferred.

```
  WEBCAM (VideoTexture)          GLYPH ATLAS (DataTexture)
         │                              │
         ▼                              │
  ┌──────────────────┐                  │
  │  PASS 1: ANALYSIS │                  │
  │  FBO-A (cell res) │                  │
  │  → luma + edges   │                  │
  └────────┬─────────┘                  │
           ▼                            │
  ┌──────────────────┐                  │
  │  PASS 2: ASCII    │◀────────────────┘
  │  FBO-B (cell res) │
  │  → glyph UV + meta│
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │  PASS 5: COMPOSITE│ ← also reads: GLYPH ATLAS, WEBCAM
  │  target: SCREEN   │
  │  (screen res)     │
  └──────────────────┘
```

---

## 1. Resolution Domains

### Cell Resolution

```
cellSize   = user-controlled, integer, range [6, 16], default 10 (pixels)
cellCols   = floor(screenWidth  / cellSize)
cellRows   = floor(screenHeight / cellSize)
```

All cell-resolution FBOs are sized exactly `cellCols x cellRows`. These are **recalculated** on window resize and when `cellSize` changes.

### Screen Resolution

```
screenWidth  = canvas.clientWidth  * devicePixelRatio
screenHeight = canvas.clientHeight * devicePixelRatio
```

The composite pass renders to the default framebuffer (screen) at this resolution.

---

## 2. Shared Textures (Inputs to Pipeline)

### 2.1 Webcam Texture

| Property | Value |
|----------|-------|
| Name in uniforms | `uWebcamTex` |
| Type | `THREE.VideoTexture` |
| Source | `getUserMedia` → `<video>` element |
| Resolution | Native webcam (ideal: 1280x720) |
| Format | `RGBA` (browser default) |
| Internal format | `RGBA8` (sRGB source) |
| Min filter | `LinearFilter` |
| Mag filter | `LinearFilter` |
| Wrap S/T | `ClampToEdgeWrapping` |
| Color space | `SRGBColorSpace` |
| Updated | Automatically by three.js each frame |

The webcam texture is **never** written to by the pipeline. It is read-only input.

### 2.2 Glyph Atlas Texture

| Property | Value |
|----------|-------|
| Name in uniforms | `uGlyphAtlas` |
| Type | `THREE.DataTexture` |
| Source | Canvas2D rendering at init time |
| Layout | Single row of glyphs, left-to-right, ordered by ascending visual density |
| Pixel format | `RedFormat` (`GL_RED`) |
| Data type | `UnsignedByteType` |
| Min filter | `NearestFilter` |
| Mag filter | `NearestFilter` |
| Wrap S/T | `ClampToEdgeWrapping` |
| Channel meaning | `R` = glyph opacity (0=background, 255=foreground) |

**Atlas geometry:**

```
glyphCount       = charset.length (e.g., 10 for " .:-=+*#%@")
atlasCellWidth   = ceil(fontSize * 0.6)   // monospace character width
atlasCellHeight  = fontSize               // character height
atlasWidth       = glyphCount * atlasCellWidth   (pixels)
atlasHeight      = atlasCellHeight               (pixels, single row)

// UV-space sizes (passed as uniforms):
uAtlasCellSize   = vec2(1.0 / glyphCount, 1.0)   // one cell in UV space
uAtlasGridSize   = vec2(glyphCount, 1.0)          // grid dimensions
```

**Default character sets** (ordered sparse → dense):

| Name | Characters | Count |
|------|-----------|-------|
| minimal | `" .:-=+*#%@"` | 10 |
| standard | `" .',:;!\\|/)(}{><*+-=~_?1iltfjrxnuvczXYUJCLQ0OZmwqpdbkhao#MW&8%B@$"` | 65 |

The first character (index 0) MUST be a space (empty). The last character MUST be the densest.

---

## 3. FBO Definitions

### 3.1 FBO-A: Analysis

| Property | Value |
|----------|-------|
| Name | `fboAnalysis` |
| Resolution | `cellCols x cellRows` |
| Internal format | `RGBA16F` (`HalfFloatType`) |
| Pixel format | `RGBAFormat` |
| Min filter | `LinearFilter` |
| Mag filter | `LinearFilter` |
| Wrap S/T | `ClampToEdgeWrapping` |
| Depth buffer | `false` |
| Stencil buffer | `false` |

**Channel layout (written by Pass 1, read by Pass 2):**

| Channel | Content | Range | Encoding |
|---------|---------|-------|----------|
| R | Luminance | [0.0, 1.0] | Linear, brightness/contrast applied |
| G | Sobel edge X | [0.0, 1.0] | Signed value mapped: `edgeX * 0.5 + 0.5` |
| B | Sobel edge Y | [0.0, 1.0] | Signed value mapped: `edgeY * 0.5 + 0.5` |
| A | Edge magnitude | [0.0, ~1.4] | `sqrt(edgeX^2 + edgeY^2)`, unclamped |

To decode signed edge values in downstream passes: `edgeX = G * 2.0 - 1.0`

### 3.2 FBO-B: ASCII Map

| Property | Value |
|----------|-------|
| Name | `fboAsciiMap` |
| Resolution | `cellCols x cellRows` |
| Internal format | `RGBA16F` (`HalfFloatType`) |
| Pixel format | `RGBAFormat` |
| Min filter | `NearestFilter` |
| Mag filter | `NearestFilter` |
| Wrap S/T | `ClampToEdgeWrapping` |
| Depth buffer | `false` |
| Stencil buffer | `false` |

**NEAREST filtering is critical** — this FBO stores per-cell glyph indices encoded as UV coordinates. Linear interpolation between cells would blend glyph UVs and produce garbage atlas lookups.

**Channel layout (written by Pass 2, read by Pass 5):**

| Channel | Content | Range | Encoding |
|---------|---------|-------|----------|
| R | Atlas glyph origin U | [0.0, 1.0) | `float(glyphIndex) / float(glyphCount)` |
| G | Atlas glyph origin V | 0.0 | Always 0.0 (single-row atlas) |
| B | Cell luminance | [0.0, 1.0] | Passed through from analysis (for color/glow) |
| A | Edge magnitude | [0.0, ~1.4] | Passed through from analysis |

---

## 4. Uniform Registry

All uniforms are owned by a central `uniforms` object on `GideonEngine` and shared across materials via reference. Each pass's `ShaderMaterial` receives only the subset it needs, but they all point to the same `{ value: ... }` objects.

### 4.1 Global Uniforms (shared across multiple passes)

| Uniform | GLSL Type | TS Type | Default | Description |
|---------|-----------|---------|---------|-------------|
| `uTime` | `float` | `number` | 0.0 | Elapsed time in seconds (monotonic) |
| `uDeltaTime` | `float` | `number` | 0.016 | Frame delta in seconds |

### 4.2 Video Uniforms

| Uniform | GLSL Type | TS Type | Default | Description |
|---------|-----------|---------|---------|-------------|
| `uWebcamTex` | `sampler2D` | `THREE.VideoTexture` | — | Live webcam feed |
| `uWebcamTexelSize` | `vec2` | `THREE.Vector2` | — | `1.0 / vec2(webcamWidth, webcamHeight)` |

### 4.3 Atlas Uniforms

| Uniform | GLSL Type | TS Type | Default | Description |
|---------|-----------|---------|---------|-------------|
| `uGlyphAtlas` | `sampler2D` | `THREE.DataTexture` | — | Glyph atlas texture |
| `uGlyphCount` | `float` | `number` | 10.0 | Number of glyphs in charset |
| `uAtlasCellSize` | `vec2` | `THREE.Vector2` | — | Size of one glyph cell in atlas UV space: `vec2(1/glyphCount, 1.0)` |
| `uAtlasGridSize` | `vec2` | `THREE.Vector2` | — | Grid dimensions: `vec2(glyphCount, 1.0)` |

### 4.4 Grid/Resolution Uniforms

| Uniform | GLSL Type | TS Type | Default | Description |
|---------|-----------|---------|---------|-------------|
| `uCellCount` | `vec2` | `THREE.Vector2` | — | `vec2(cellCols, cellRows)` |
| `uCellSize` | `vec2` | `THREE.Vector2` | — | `vec2(cellSizePx, cellSizePx)` in screen pixels |
| `uScreenResolution` | `vec2` | `THREE.Vector2` | — | `vec2(screenWidth, screenHeight)` in physical pixels |

### 4.5 Control Uniforms (user-adjustable)

| Uniform | GLSL Type | TS Type | Range | Default | Used By |
|---------|-----------|---------|-------|---------|---------|
| `uBrightness` | `float` | `number` | [-1, 1] | 0.0 | Pass 1 |
| `uContrast` | `float` | `number` | [0.5, 3.0] | 1.2 | Pass 1 |
| `uEdgeCharThreshold` | `float` | `number` | [0.0, 1.0] | 0.3 | Pass 2 |
| `uColorMix` | `float` | `number` | [0, 1] | 0.0 | Pass 5 |
| `uTintColor` | `vec3` | `THREE.Color` | — | (0, 1, 0.53) = #00ff88 | Pass 5 |
| `uVignetteStrength` | `float` | `number` | [0, 1] | 0.3 | Pass 5 |
| `uScanlineStrength` | `float` | `number` | [0, 1] | 0.15 | Pass 5 |
| `uGlowStrength` | `float` | `number` | [0, 1] | 0.2 | Pass 5 |

### 4.6 Inter-Pass Texture Uniforms

| Uniform | GLSL Type | Set By | Description |
|---------|-----------|--------|-------------|
| `uAnalysisTex` | `sampler2D` | Pipeline before Pass 2 | `fboAnalysis.texture` |
| `uAsciiMapTex` | `sampler2D` | Pipeline before Pass 5 | `fboAsciiMap.texture` |

These are set by `RenderPipeline.render()` each frame, wiring each pass's output to the next pass's input.

---

## 5. Pass Specifications

### 5.1 Pass 1: AnalysisPass

**Purpose:** Extract luminance and edge information from the raw webcam feed. One fragment = one ASCII cell.

**Renders to:** `fboAnalysis` (cell resolution)

**Shader files:** `fullscreen.vert` + `analysis.frag`

**Input uniforms:**

| Uniform | Source |
|---------|--------|
| `uWebcamTex` | WebcamSource.texture |
| `uWebcamTexelSize` | `1.0 / webcam native resolution` |
| `uBrightness` | Controls |
| `uContrast` | Controls |

**Algorithm:**

1. Compute sampling UV: `vec2(1.0 - vUv.x, vUv.y)` — horizontal flip for mirror effect
2. Sample webcam at center of current fragment
3. Compute luminance: `dot(rgb, vec3(0.2126, 0.7152, 0.0722))`
4. Apply brightness/contrast: `clamp((luma - 0.5) * contrast + 0.5 + brightness, 0.0, 1.0)`
5. Sample 3x3 neighborhood of webcam luminance (9 samples total, using `uWebcamTexelSize` for offsets)
6. Compute Sobel X: `-tl - 2*l - bl + tr + 2*r + br`
7. Compute Sobel Y: `-tl - 2*t - tr + bl + 2*b + br`
8. Compute edge magnitude: `sqrt(edgeX*edgeX + edgeY*edgeY)`

**Output:** `gl_FragColor = vec4(luma, edgeX * 0.5 + 0.5, edgeY * 0.5 + 0.5, edgeMag)`

**Texture sample count:** 9 (center + 8 neighbors)

---

### 5.2 Pass 2: AsciiMapPass

**Purpose:** Convert per-cell luminance/edge data into glyph atlas coordinates. One fragment = one ASCII cell.

**Renders to:** `fboAsciiMap` (cell resolution)

**Shader files:** `fullscreen.vert` + `asciimap.frag`

**Input uniforms:**

| Uniform | Source |
|---------|--------|
| `uAnalysisTex` | `fboAnalysis.texture` |
| `uGlyphCount` | GlyphAtlas.glyphCount |
| `uEdgeCharThreshold` | Controls |

**Algorithm:**

1. Sample `uAnalysisTex` at `vUv` (1:1 mapping, both are cell resolution)
2. Decode: `luma = sample.r`, `edgeMag = sample.a`
3. Invert luminance for density mapping: `mappedLuma = 1.0 - luma` (dark scene regions → dense characters)
4. Compute glyph index: `index = clamp(round(mappedLuma * (glyphCount - 1.0)), 0, glyphCount - 1)`
5. Edge-aware bias: if `edgeMag > uEdgeCharThreshold`, blend index toward denser end:
   - `edgeBias = smoothstep(threshold, threshold + 0.3, edgeMag)`
   - `index = mix(index, glyphCount - 1.0, edgeBias * 0.5)`
6. Compute atlas origin U: `float(index) / float(glyphCount)`
7. Atlas origin V: `0.0` (single-row atlas)

**Output:** `gl_FragColor = vec4(atlasOriginU, 0.0, luma, edgeMag)`

**Texture sample count:** 1

---

### 5.3 Pass 5: CompositePass (MVP — no depth/fluid)

**Purpose:** Render the final ASCII image to screen. Each screen pixel samples the appropriate glyph texel from the atlas, colored and lit. One fragment = one screen pixel.

**Renders to:** `null` (default framebuffer / screen, screen resolution)

**Shader files:** `fullscreen.vert` + `composite.frag`

**Input uniforms:**

| Uniform | Source |
|---------|--------|
| `uAsciiMapTex` | `fboAsciiMap.texture` |
| `uGlyphAtlas` | GlyphAtlas.texture |
| `uWebcamTex` | WebcamSource.texture |
| `uScreenResolution` | `vec2(screenWidth, screenHeight)` |
| `uCellCount` | `vec2(cellCols, cellRows)` |
| `uCellSize` | `vec2(cellSizePx, cellSizePx)` |
| `uAtlasCellSize` | `vec2(1.0 / glyphCount, 1.0)` |
| `uColorMix` | Controls |
| `uTintColor` | Controls |
| `uVignetteStrength` | Controls |
| `uScanlineStrength` | Controls |
| `uGlowStrength` | Controls |
| `uTime` | Engine |

**Algorithm:**

1. Compute pixel position: `pixelPos = vUv * uScreenResolution`
2. Compute cell index: `cellIndex = floor(pixelPos / uCellSize)`
3. Compute sub-cell fraction: `cellFract = fract(pixelPos / uCellSize)` — position within cell, [0,1]
4. Compute cell center UV: `cellCenterUV = (cellIndex + 0.5) / uCellCount` — for sampling cell-resolution FBOs
5. Clamp `cellCenterUV` to [0, 1]
6. Sample `uAsciiMapTex` at `cellCenterUV` → `vec4(atlasOriginU, atlasOriginV, luma, edgeMag)`
7. Compute glyph sample UV: `glyphUV = vec2(atlasOriginU, atlasOriginV) + cellFract * uAtlasCellSize`
8. Sample `uGlyphAtlas` at `glyphUV` → `float glyphAlpha` (R channel)
9. Sample `uWebcamTex` at `vec2(1.0 - cellCenterUV.x, cellCenterUV.y)` → webcam color (mirrored)
10. Compute mono color: `uTintColor * 1.0` (MVP: lighting = 1.0, no depth pass yet)
11. Compute color blend: `baseColor = mix(monoColor, webcamColor, uColorMix)`
12. Apply glyph mask: `fragColor = baseColor * glyphAlpha`
13. **Vignette:** `v = 1.0 - dot(vUv * 2.0 - 1.0, vUv * 2.0 - 1.0) * uVignetteStrength`; `fragColor *= clamp(v, 0, 1)`
14. **Scanlines:** `s = sin(pixelPos.y * PI) * 0.5 + 0.5`; `fragColor *= mix(1.0, s, uScanlineStrength)`
15. **Glow:** `fragColor += baseColor * glyphAlpha * luma * uGlowStrength * 0.3`

**Output:** `gl_FragColor = vec4(finalColor, 1.0)`

**Texture sample count:** 3 (asciiMap + atlas + webcam)

---

## 6. MVP Render Loop

```
each frame(time, dt):
  1. update uTime, uDeltaTime

  2. set renderer viewport to (cellCols, cellRows)
     set uAnalysisTex = (not yet needed)
     render AnalysisPass.material → fboAnalysis

  3. set uAnalysisTex = fboAnalysis.texture
     render AsciiMapPass.material → fboAsciiMap

  4. set renderer viewport to (screenWidth, screenHeight)
     set uAsciiMapTex = fboAsciiMap.texture
     render CompositePass.material → null (screen)
```

The viewport is set implicitly by `renderer.setRenderTarget(fbo)` — three.js auto-sizes to the FBO. When rendering to screen (`setRenderTarget(null)`), it uses the canvas size.

---

## 7. Fullscreen Quad Infrastructure

All passes share a single `THREE.Scene` containing one `THREE.Mesh`:

```
Geometry: PlaneGeometry(2, 2)
Camera:   OrthographicCamera(-1, 1, 1, -1, 0, 1)
```

Each pass is a `THREE.ShaderMaterial`. To render a pass:
1. Assign pass material to the quad mesh
2. `renderer.setRenderTarget(fbo | null)`
3. `renderer.render(scene, camera)`

The vertex shader uses three.js built-in `projectionMatrix * modelViewMatrix * vec4(position, 1.0)` which, with this ortho camera, produces identity-equivalent clip coordinates. `uv` attribute from `PlaneGeometry` provides `vUv` in [0,1].

---

## 8. Data Flow Summary

```
                    ┌───────────┐
                    │  Webcam   │
                    │  Texture  │
                    └─────┬─────┘
                          │ sampled by Pass 1 (9x) and Pass 5 (1x)
                          │
         ┌────────────────┼────────────────┐
         ▼                │                │
   ┌───────────┐          │                │
   │  Pass 1   │          │                │
   │  Analysis  │          │                │
   └─────┬─────┘          │                │
         │ writes                          │
         ▼                                 │
   ┌───────────┐                           │
   │  FBO-A    │                           │
   │  RGBA16F  │                           │
   │  cell res │                           │
   │  LINEAR   │                           │
   └─────┬─────┘                           │
         │ sampled by Pass 2 (1x)          │
         ▼                                 │
   ┌───────────┐    ┌───────────┐          │
   │  Pass 2   │◀───│  Glyph    │          │
   │  AsciiMap  │    │  Atlas    │          │
   └─────┬─────┘    └─────┬─────┘          │
         │ writes         │ sampled by     │
         ▼                │ Pass 5 (1x)    │
   ┌───────────┐          │                │
   │  FBO-B    │          │                │
   │  RGBA16F  │          │                │
   │  cell res │          │                │
   │  NEAREST  │          │                │
   └─────┬─────┘          │                │
         │ sampled by     │                │
         │ Pass 5 (1x)    │                │
         ▼                ▼                ▼
   ┌─────────────────────────────────────────┐
   │              Pass 5: Composite           │
   │         (screen resolution output)       │
   └─────────────────────────────────────────┘
```

---

## 9. Invariants and Constraints

1. **No CPU pixel processing.** All image operations happen in fragment shaders.
2. **FBO-B must use NEAREST filtering.** Linear filtering would interpolate atlas UV coordinates between adjacent cells, producing incorrect glyph lookups.
3. **Webcam UV is always horizontally flipped** (`1.0 - uv.x`) for mirror selfie behavior. This flip happens in Pass 1 and again in Pass 5 when sampling webcam for color.
4. **Glyph index 0 = space (empty).** The atlas character set MUST start with a space character so that `luminance = 1.0` (bright, inverted to 0.0) maps to an empty cell.
5. **Atlas uses NEAREST filtering.** Linear filtering would blur glyph edges — the sharp pixel aesthetic requires nearest-neighbor.
6. **Cell resolution FBOs are recreated** when `cellSize` changes or window resizes. They are not stretched/resampled.
7. **The composite pass reads FBO-B with NEAREST** implicitly (FBO-B's filter setting). It must sample at `(cellIndex + 0.5) / cellCount` to hit cell centers exactly — never at cell boundaries.
8. **All passes use the same vertex shader** (`fullscreen.vert`). No pass has custom vertex logic.
9. **HalfFloat fallback:** If `EXT_color_buffer_half_float` is unavailable, fall back to `FloatType` for FBOs. Check `renderer.extensions.get('EXT_color_buffer_half_float')`.

---

## 10. Future Pass Stubs

When Passes 3 and 4 are added, the composite pass will change its primary data source:

- **MVP (now):** Composite reads `uAsciiMapTex` (FBO-B) directly. Lighting = 1.0 (flat).
- **With Pass 3:** Composite reads both `uAsciiMapTex` and a new `uDepthLightTex` (FBO-C). Lighting comes from FBO-C.R.
- **With Pass 4:** Composite reads `uFluidTex` (FBO-D) instead of `uAsciiMapTex`. FBO-D contains the temporally-blended, flow-distorted version of the ASCII map + lighting data.

The composite shader should be written with a `uLightingEnabled` uniform (float, 0 or 1) or simply hardcode lighting = 1.0 for MVP and swap in the real value later. The uniform interface for the composite pass already reserves the slot — the pipeline just doesn't populate it yet.
