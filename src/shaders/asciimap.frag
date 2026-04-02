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

varying vec2 vUv;

void main() {
  vec2 cellCoord = floor(vUv * uCellResolution);
  vec2 cellCenter = (cellCoord + 0.5) / uCellResolution;
  vec4 analysis = texture2D(uAnalysisTex, cellCenter);
  float luma    = analysis.r;
  float edgeMag = analysis.a;

  // Invert luminance: dark regions → dense characters
  float mappedLuma = 1.0 - luma;

  // Base glyph index from luminance
  float index = floor(mappedLuma * (uGlyphCount - 1.0) + 0.5);
  index = clamp(index, 0.0, uGlyphCount - 1.0);

  // Edge-aware bias: push toward denser glyphs on edges
  float edgeBias = smoothstep(uEdgeCharThreshold, uEdgeCharThreshold + 0.3, edgeMag);
  index = mix(index, uGlyphCount - 1.0, edgeBias * 0.5);
  index = floor(index + 0.5);
  index = clamp(index, 0.0, uGlyphCount - 1.0);

  // Atlas UV origin
  float atlasOriginU = index / uGlyphCount;

  gl_FragColor = vec4(atlasOriginU, 0.0, luma, edgeMag);
}
