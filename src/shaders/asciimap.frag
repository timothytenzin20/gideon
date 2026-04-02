// asciimap.frag — Pass 2: Glyph index selection from luminance + edge data
// Renders at cell resolution. One fragment = one ASCII cell.
//
// Output: vec4(atlasOriginU, 0.0, luma, edgeMag)
//   R: atlas glyph origin U [0, 1)  = float(index) / float(glyphCount)
//   G: atlas glyph origin V = 0.0   (single-row atlas)
//   B: cell luminance [0,1]         (passthrough from analysis)
//   A: edge magnitude               (passthrough from analysis)

precision highp float;

uniform sampler2D uAnalysisTex;
uniform float uGlyphCount;
uniform float uEdgeCharThreshold;
uniform vec2 uCellResolution;
uniform float uAlgorithm;      // 0=luminance, 1=edge
uniform vec4 uEdgeCharIndices;  // atlas U for: x=|, y=-, z=/, w=\  (-1 if missing)

varying vec2 vUv;

const float PI = 3.14159265359;

// Luminance-based glyph selection (shared by both algorithms)
float lumaIndex(float luma) {
  float mappedLuma = 1.0 - luma;
  float idx = floor(mappedLuma * (uGlyphCount - 1.0) + 0.5);
  return clamp(idx, 0.0, uGlyphCount - 1.0);
}

void main() {
  vec2 cellCoord = floor(vUv * uCellResolution);
  vec2 cellCenter = (cellCoord + 0.5) / uCellResolution;
  vec4 analysis = texture2D(uAnalysisTex, cellCenter);
  float luma    = analysis.r;
  float edgeMag = analysis.a;

  float atlasOriginU;

  if (uAlgorithm == 1.0) {
    // --- Edge-based algorithm ---
    // Decode signed Sobel from analysis G/B channels
    float edgeX = analysis.g * 2.0 - 1.0;
    float edgeY = analysis.b * 2.0 - 1.0;

    if (edgeMag > uEdgeCharThreshold) {
      // Gradient angle → edge direction (perpendicular)
      // Collapse to [0, PI) since edges are symmetric
      float gradAngle = atan(edgeY, edgeX);
      float a = mod(gradAngle + PI, PI);
      float sector = a * 4.0 / PI; // [0, 4)

      // Map gradient direction to edge character:
      //   sector 0 (~0°):   gradient horizontal → vertical edge   → |
      //   sector 1 (~45°):  gradient diagonal   → diagonal edge   → backslash
      //   sector 2 (~90°):  gradient vertical   → horizontal edge → -
      //   sector 3 (~135°): gradient diagonal   → diagonal edge   → /
      float edgeAtlasU;
      if (sector < 1.0)      edgeAtlasU = uEdgeCharIndices.x; // |
      else if (sector < 2.0) edgeAtlasU = uEdgeCharIndices.w; // backslash
      else if (sector < 3.0) edgeAtlasU = uEdgeCharIndices.y; // -
      else                   edgeAtlasU = uEdgeCharIndices.z; // /

      if (edgeAtlasU >= 0.0) {
        atlasOriginU = edgeAtlasU;
        gl_FragColor = vec4(atlasOriginU, 0.0, luma, edgeMag);
        return;
      }
    }

    // Low edge magnitude or missing char: fall back to luminance
    float index = lumaIndex(luma);
    atlasOriginU = index / uGlyphCount;

  } else {
    // --- Luminance algorithm (original) ---
    float index = lumaIndex(luma);

    // Edge-aware bias: push toward denser glyphs on edges
    float edgeBias = smoothstep(uEdgeCharThreshold, uEdgeCharThreshold + 0.3, edgeMag);
    index = mix(index, uGlyphCount - 1.0, edgeBias * 0.5);
    index = floor(index + 0.5);
    index = clamp(index, 0.0, uGlyphCount - 1.0);

    atlasOriginU = index / uGlyphCount;
  }

  gl_FragColor = vec4(atlasOriginU, 0.0, luma, edgeMag);
}
