// composite.frag — Pass 5: Final ASCII composite to screen
// Renders at screen resolution. One fragment = one screen pixel.
//
// Output: vec4(finalColor, 1.0)

precision highp float;

uniform sampler2D uAsciiMapTex;
uniform sampler2D uGlyphAtlas;
uniform sampler2D uWebcamTex;
uniform vec2 uScreenResolution;
uniform vec2 uCellResolution;
uniform float uGlyphCount;
uniform float uColorMix;
uniform vec3 uTintColor;
uniform float uVignetteStrength;
uniform float uScanlineStrength;
uniform float uGlowStrength;
uniform float uTime;
uniform float uDebugMode; // 0=normal, 1=luminance, 2=ascii map
uniform int uMode;        // 0=ascii, 1=raw webcam

varying vec2 vUv;

const float PI = 3.14159265359;

void main() {
  // Raw webcam passthrough
  if (uMode == 1) {
    vec2 mirrorUV = vec2(1.0 - vUv.x, vUv.y);
    gl_FragColor = vec4(texture2D(uWebcamTex, mirrorUV).rgb, 1.0);
    return;
  }

  // 1. Cell coordinate and sub-cell position
  vec2 cellCoord = floor(vUv * uCellResolution);
  vec2 cellUV = fract(vUv * uCellResolution);
  vec2 cellCenter = (cellCoord + 0.5) / uCellResolution;

  // 2. Sample ASCII map at cell center
  vec4 asciiData = texture2D(uAsciiMapTex, cellCenter);
  float atlasU = asciiData.r;
  float luma   = asciiData.b;

  // Debug: show luminance
  if (uDebugMode == 1.0) {
    gl_FragColor = vec4(vec3(luma), 1.0);
    return;
  }
  // Debug: show ascii map raw data
  if (uDebugMode == 2.0) {
    gl_FragColor = vec4(atlasU, asciiData.a * 0.5, luma, 1.0);
    return;
  }

  // 3. Sample glyph from atlas
  vec2 glyphUV = vec2(
    atlasU + cellUV.x * (1.0 / uGlyphCount),
    cellUV.y
  );
  float glyphAlpha = texture2D(uGlyphAtlas, glyphUV).r;

  // 4. Sample webcam for color (mirrored)
  vec2 webcamUV = vec2(1.0 - cellCenter.x, cellCenter.y);
  vec3 webcamColor = texture2D(uWebcamTex, webcamUV).rgb;

  // 5. Color blend
  vec3 monoColor = uTintColor;
  vec3 baseColor = mix(monoColor, webcamColor, uColorMix);

  // 6. Apply glyph mask
  vec3 fragColor = baseColor * glyphAlpha;

  // 7. Vignette
  vec2 vigUV = vUv * 2.0 - 1.0;
  float v = 1.0 - dot(vigUV, vigUV) * uVignetteStrength;
  fragColor *= clamp(v, 0.0, 1.0);

  // 8. Scanlines
  vec2 pixelPos = vUv * uScreenResolution;
  float s = sin(pixelPos.y * PI) * 0.5 + 0.5;
  fragColor *= mix(1.0, s, uScanlineStrength);

  // 9. Glow
  fragColor += baseColor * glyphAlpha * luma * uGlowStrength * 0.3;

  gl_FragColor = vec4(fragColor, 1.0);
}
