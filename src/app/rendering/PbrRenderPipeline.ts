import {
  ACESFilmicToneMapping,
  HalfFloatType,
  MeshNormalMaterial,
  PCFSoftShadowMap,
  SRGBColorSpace,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { AoSettings } from '../parameters/SharedSceneSettings';
import type { ThreePageSize } from '../ThreePage';
import type { RenderFeature, RenderPipelineContext } from './RenderFeature';

export function configurePbrRenderer(renderer: WebGLRenderer): void {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
}

export class PbrRenderPipeline {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: Camera;
  private readonly features: RenderFeature[] = [];
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly gtaoPass: GTAOPass;
  private readonly outputPass: OutputPass;
  private readonly fxaaPass: FXAAPass;
  private size: ThreePageSize;

  constructor(options: {
    renderer: WebGLRenderer;
    scene: Scene;
    camera: Camera;
    size: ThreePageSize;
    targetName?: string;
  }) {
    this.renderer = options.renderer;
    this.scene = options.scene;
    this.camera = options.camera;
    this.size = options.size;

    const renderTarget = new WebGLRenderTarget(this.size.width, this.size.height, {
      samples: 4,
      type: HalfFloatType,
    });
    renderTarget.texture.name = `${options.targetName ?? 'PbrComposer'}.msaa`;

    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.gtaoPass = new GTAOPass(this.scene, this.camera, this.size.width, this.size.height);
    this.composer.addPass(this.gtaoPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.fxaaPass = new FXAAPass();
    this.composer.addPass(this.fxaaPass);
    this.composer.setSize(this.size.width, this.size.height);
  }

  use(feature: RenderFeature): void {
    this.features.push(feature);
    feature.setup?.(this.createContext());
  }

  setSize(size: ThreePageSize): void {
    this.size = size;
    this.composer.setSize(size.width, size.height);
    const context = this.createContext();

    for (const feature of this.features) {
      feature.resize?.(context);
    }
  }

  applyAoSettings(settings: AoSettings): void {
    configureGtaoPass(this.gtaoPass, settings);
  }

  configureAoNormalMaterial(configure: (material: MeshNormalMaterial) => void): void {
    configure(this.gtaoPass.normalMaterial);
    this.gtaoPass.normalMaterial.needsUpdate = true;
  }

  render(deltaSeconds: number): void {
    const context = this.createContext();

    for (const feature of this.features) {
      feature.prepareFrame?.(context, deltaSeconds);
    }

    for (const feature of this.features) {
      if (feature.renderOverride?.(context, deltaSeconds)) {
        return;
      }
    }

    this.composer.render(deltaSeconds);
  }

  dispose(): void {
    for (const feature of this.features) {
      feature.dispose?.();
    }

    this.features.length = 0;
    this.gtaoPass.dispose();
    this.fxaaPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
  }

  private createContext(): RenderPipelineContext {
    return {
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      size: this.size,
    };
  }
}

export function configureGtaoPass(pass: GTAOPass | null, settings: AoSettings): void {
  if (!pass) return;

  const quality = getAoQualitySettings(settings.quality);
  const softness = clamp01(settings.softness);

  pass.enabled = settings.enabled;
  pass.output = getAoOutputValue(settings.view);
  pass.blendIntensity = Math.max(0, settings.strength);
  pass.updateGtaoMaterial({
    radius: Math.max(0.001, settings.range),
    distanceExponent: 1,
    thickness: 0.72 + softness * 0.56,
    distanceFallOff: 1,
    scale: 1,
    samples: quality.samples,
  });
  pass.updatePdMaterial({
    radius: 3 + softness * 10,
    samples: quality.denoiseSamples,
    rings: quality.denoiseRings,
  });
}

function getAoOutputValue(view: AoSettings['view']): number {
  switch (view) {
    case 'Final':
      return GTAOPass.OUTPUT.Default;
    case 'AO Mask':
      return GTAOPass.OUTPUT.AO;
    case 'Denoised Mask':
      return GTAOPass.OUTPUT.Denoise;
    case 'Depth':
      return GTAOPass.OUTPUT.Depth;
    case 'Normal':
      return GTAOPass.OUTPUT.Normal;
    case 'Scene':
      return GTAOPass.OUTPUT.Diffuse;
    case 'Off':
      return GTAOPass.OUTPUT.Off;
  }
}

function getAoQualitySettings(quality: AoSettings['quality']): {
  samples: number;
  denoiseSamples: number;
  denoiseRings: number;
} {
  switch (quality) {
    case 'Low':
      return { samples: 8, denoiseSamples: 8, denoiseRings: 1 };
    case 'Medium':
      return { samples: 16, denoiseSamples: 16, denoiseRings: 2 };
    case 'High':
      return { samples: 32, denoiseSamples: 24, denoiseRings: 3 };
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
