import {
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Uniform,
  type PerspectiveCamera,
} from 'three';
import type { MaterialRegistry } from '../MaterialRegistry';
import type { RenderFeature, RenderPipelineContext } from '../RenderFeature';
import { FULLSCREEN_VERTEX_SHADER, createFullscreenTriangleGeometry } from '../FullscreenShaders';
import type { DepthPrepassFeature } from './DepthPrepassFeature';

export type DepthDebugSettings = {
  enabled: boolean;
  remapMin: number;
  remapMax: number;
};

export class DepthDebugFeature implements RenderFeature {
  private readonly prepass: DepthPrepassFeature;
  private readonly registry: MaterialRegistry;
  private readonly getSettings: () => DepthDebugSettings;
  private scene: Scene | null = null;
  private camera: OrthographicCamera | null = null;
  private material: ShaderMaterial | null = null;
  private quad: Mesh | null = null;

  constructor(options: {
    prepass: DepthPrepassFeature;
    materialRegistry: MaterialRegistry;
    getSettings: () => DepthDebugSettings;
  }) {
    this.prepass = options.prepass;
    this.registry = options.materialRegistry;
    this.getSettings = options.getSettings;
  }

  setup(): void {
    this.dispose();
    this.material = this.registry.track(new ShaderMaterial({
      name: 'DepthDebugMaterial',
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDepth: new Uniform(null),
        cameraNear: new Uniform(0.1),
        cameraFar: new Uniform(100),
        remapMin: new Uniform(0),
        remapMax: new Uniform(1),
      },
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: DEPTH_DEBUG_FRAGMENT_SHADER,
    }));

    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(createFullscreenTriangleGeometry(), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  renderOverride(context: RenderPipelineContext): boolean {
    const settings = this.getSettings();
    if (!settings.enabled) return false;
    if (!this.scene || !this.camera || !this.material) return false;

    const depthTarget = this.prepass.sceneDepthTarget;
    if (!depthTarget?.depthTexture) return false;

    const uniforms = this.material.uniforms;
    uniforms.tDepth.value = depthTarget.depthTexture;
    if ('near' in context.camera && 'far' in context.camera) {
      const camera = context.camera as PerspectiveCamera;
      uniforms.cameraNear.value = camera.near;
      uniforms.cameraFar.value = camera.far;
    }
    uniforms.remapMin.value = clamp01(settings.remapMin);
    uniforms.remapMax.value = clamp01(settings.remapMax);

    context.renderer.render(this.scene, this.camera);
    return true;
  }

  dispose(): void {
    if (this.material) {
      this.registry.delete(this.material);
      this.material.dispose();
    }
    this.quad?.geometry.dispose();
    this.scene = null;
    this.camera = null;
    this.material = null;
    this.quad = null;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const DEPTH_DEBUG_FRAGMENT_SHADER = `
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;
uniform float remapMin;
uniform float remapMax;

varying vec2 vUv;

float perspectiveDepthToViewZ(float depth, float near, float far) {
  return (near * far) / ((far - near) * depth - far);
}

float viewZToLinearDepth(float viewZ, float near, float far) {
  return (viewZ + near) / (near - far);
}

float readLinearDepth(vec2 uv) {
  float depth = texture2D(tDepth, uv).x;
  float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  return clamp(viewZToLinearDepth(viewZ, cameraNear, cameraFar), 0.0, 1.0);
}

void main() {
  float linearDepth = readLinearDepth(vUv);
  float value = clamp((linearDepth - remapMin) / max(0.0001, remapMax - remapMin), 0.0, 1.0);
  gl_FragColor = vec4(vec3(value), 1.0);
}
`;
