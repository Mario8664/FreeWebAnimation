import { BufferAttribute, BufferGeometry } from 'three';

export function createFullscreenTriangleGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([
      -1, -1, 0,
      3, -1, 0,
      -1, 3, 0,
    ]), 3),
  );
  geometry.setAttribute(
    'uv',
    new BufferAttribute(new Float32Array([
      0, 0,
      2, 0,
      0, 2,
    ]), 2),
  );
  return geometry;
}

export const FULLSCREEN_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
