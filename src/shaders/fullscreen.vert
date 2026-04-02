// fullscreen.vert — Shared fullscreen quad vertex shader for all passes
// Receives position and uv from PlaneGeometry(2,2) + OrthographicCamera(-1,1,1,-1,0,1)

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
