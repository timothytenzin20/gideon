// analysis.frag — Pass 1: Luminance extraction + Sobel edge detection
// Renders at cell resolution. One fragment = one ASCII cell.
//
// Output: vec4(luma, edgeX_encoded, edgeY_encoded, edgeMagnitude)
//   R: luminance [0,1] with brightness/contrast applied
//   G: Sobel X mapped to [0,1] via edgeX * 0.5 + 0.5
//   B: Sobel Y mapped to [0,1] via edgeY * 0.5 + 0.5
//   A: edge magnitude sqrt(edgeX^2 + edgeY^2), unclamped

precision highp float;

uniform sampler2D uWebcamTex;
uniform vec2 uWebcamTexelSize;
uniform float uBrightness;
uniform float uContrast;

varying vec2 vUv;

float calcLuminance(vec3 rgb) {
  return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  // Mirror horizontally for selfie view
  vec2 mirrorUV = vec2(1.0 - vUv.x, vUv.y);

  // Sample center pixel luminance
  vec3 centerRGB = texture2D(uWebcamTex, mirrorUV).rgb;
  float luma = calcLuminance(centerRGB);

  // Apply brightness/contrast
  luma = clamp((luma - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0);

  // 3x3 neighborhood luminance samples for Sobel
  float tl = calcLuminance(texture2D(uWebcamTex, mirrorUV + vec2(-uWebcamTexelSize.x,  uWebcamTexelSize.y)).rgb);
  float t  = calcLuminance(texture2D(uWebcamTex, mirrorUV + vec2(               0.0,  uWebcamTexelSize.y)).rgb);
  float tr = calcLuminance(texture2D(uWebcamTex, mirrorUV + vec2( uWebcamTexelSize.x,  uWebcamTexelSize.y)).rgb);
  float l  = calcLuminance(texture2D(uWebcamTex, mirrorUV + vec2(-uWebcamTexelSize.x,                0.0)).rgb);
  float r  = calcLuminance(texture2D(uWebcamTex, mirrorUV + vec2( uWebcamTexelSize.x,                0.0)).rgb);
  float bl = calcLuminance(texture2D(uWebcamTex, mirrorUV + vec2(-uWebcamTexelSize.x, -uWebcamTexelSize.y)).rgb);
  float b  = calcLuminance(texture2D(uWebcamTex, mirrorUV + vec2(               0.0, -uWebcamTexelSize.y)).rgb);
  float br = calcLuminance(texture2D(uWebcamTex, mirrorUV + vec2( uWebcamTexelSize.x, -uWebcamTexelSize.y)).rgb);

  // Sobel operators
  float edgeX = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float edgeY = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edgeMag = sqrt(edgeX * edgeX + edgeY * edgeY);

  // Encode signed edge values to [0,1] range
  gl_FragColor = vec4(luma, edgeX * 0.5 + 0.5, edgeY * 0.5 + 0.5, edgeMag);
}
