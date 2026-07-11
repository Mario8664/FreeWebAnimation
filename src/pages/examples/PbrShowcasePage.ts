import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  TorusKnotGeometry,
  type BufferGeometry,
} from 'three';
import { ThreePage, type ThreePageComponent, type ThreePageSize } from '../../app/ThreePage';
import type { PageContext } from '../../app/Page';
import { SceneConfigStore } from '../../app/SceneConfigStore';
import {
  createParameterEditorSettings,
  mergeParameterEditorSettings,
  normalizeParameterValue,
  SceneParameterRuntime,
  type ParameterApplyResult,
  type ParameterEditorSettings,
  type ParameterFieldSchema,
  type ParameterGroupSchema,
  type SceneParameterValue,
} from '../../app/parameters/SceneParameterRuntime';
import {
  cloneParameterObject,
  setParameterValue,
} from '../../app/animation/ParameterPath';
import { EnvironmentLighting } from '../../app/rendering/EnvironmentLighting';
import { MaterialRegistry } from '../../app/rendering/MaterialRegistry';
import {
  configurePbrRenderer,
  PbrRenderPipeline,
} from '../../app/rendering/PbrRenderPipeline';
import { createFreeCameraComponent } from '../../app/FreeCameraController';
import {
  createPbrGlobalSettingsFallback,
  type PbrGlobalSettings,
  type PbrGlobalSettingsConsumer,
} from '../../app/rendering/PbrGlobalSettings';

const SCENE_ID = 'pbr-showcase';

type PbrShowcaseSettings = {
  motion: {
    spinSpeed: number;
    bobAmount: number;
    bobSpeed: number;
  };
  layout: {
    spread: number;
    scale: number;
  };
  materials: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    roughness: number;
  };
};

const PARAMETER_GROUPS: readonly ParameterGroupSchema[] = [
  { id: 'motion', title: 'Motion', defaultCollapsed: false },
  { id: 'layout', title: 'Layout', defaultCollapsed: false },
  { id: 'materials', title: 'Materials', defaultCollapsed: false },
];

const PARAMETER_FIELDS: readonly ParameterFieldSchema[] = [
  {
    path: 'motion.spinSpeed',
    group: 'motion',
    label: 'spin speed',
    type: 'number',
    step: 0.05,
    min: -3,
    max: 3,
    clamp: true,
    animatable: true,
  },
  {
    path: 'motion.bobAmount',
    group: 'motion',
    label: 'bob amount',
    type: 'number',
    step: 0.02,
    min: 0,
    max: 1.2,
    clamp: true,
    animatable: true,
  },
  {
    path: 'motion.bobSpeed',
    group: 'motion',
    label: 'bob speed',
    type: 'number',
    step: 0.05,
    min: 0,
    max: 6,
    clamp: true,
    animatable: true,
  },
  {
    path: 'layout.spread',
    group: 'layout',
    label: 'spread',
    type: 'number',
    step: 0.05,
    min: 0.4,
    max: 2.8,
    clamp: true,
    animatable: true,
  },
  {
    path: 'layout.scale',
    group: 'layout',
    label: 'scale',
    type: 'number',
    step: 0.02,
    min: 0.35,
    max: 1.8,
    clamp: true,
    animatable: true,
  },
  {
    path: 'materials.primaryColor',
    group: 'materials',
    label: 'primary',
    type: 'color',
    animatable: true,
  },
  {
    path: 'materials.secondaryColor',
    group: 'materials',
    label: 'secondary',
    type: 'color',
    animatable: true,
  },
  {
    path: 'materials.accentColor',
    group: 'materials',
    label: 'accent',
    type: 'color',
    animatable: true,
  },
  {
    path: 'materials.roughness',
    group: 'materials',
    label: 'roughness',
    type: 'range',
    min: 0.12,
    max: 0.95,
    step: 0.01,
    clamp: true,
    animatable: true,
  },
];

const PARAMETER_FIELD_BY_PATH = new Map(PARAMETER_FIELDS.map((field) => [field.path, field]));

export class PbrShowcasePage extends ThreePage implements PbrGlobalSettingsConsumer {
  readonly usesPbrGlobalSettings = true;
  private readonly materialRegistry = new MaterialRegistry();
  private readonly showcaseGroup = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly store = new SceneConfigStore<PbrShowcaseSettings, ParameterEditorSettings>({
    sceneId: SCENE_ID,
    createSceneFallback: createPbrShowcaseSettingsFallback,
    createEditorFallback: () => createParameterEditorSettings(PARAMETER_GROUPS),
    mergeSceneConfig: mergePbrShowcaseSettings,
    mergeEditorConfig: (base, override) => mergeParameterEditorSettings(base, override, PARAMETER_GROUPS),
  });
  private lighting: EnvironmentLighting | null = null;
  private pipeline: PbrRenderPipeline | null = null;
  private parameterRuntime: SceneParameterRuntime<PbrShowcaseSettings> | null = null;
  private pbrSettings: PbrGlobalSettings = createPbrGlobalSettingsFallback();
  private showcaseSettings = createPbrShowcaseSettingsFallback();
  private primaryMaterial: MeshStandardMaterial | null = null;
  private secondaryMaterial: MeshStandardMaterial | null = null;
  private accentMaterial: MeshStandardMaterial | null = null;
  private knot: Mesh | null = null;
  private box: Mesh | null = null;
  private column: Mesh | null = null;
  private disposed = false;

  constructor() {
    super({
      id: SCENE_ID,
      title: 'PBR Showcase',
      subtitle: 'Shared PBR/GTAO rendering with animatable scene parameters.',
    }, new PerspectiveCamera(45, 16 / 9, 0.1, 100));

    this.camera.position.set(4.6, 3.2, 5.2);
    this.camera.lookAt(0, 0.7, 0);
  }

  protected get rootClassName(): string {
    return 'three-page pbr-showcase-page';
  }

  protected createComponents(): ThreePageComponent[] {
    return [
      createFreeCameraComponent({
        moveSpeed: 4,
        lookSpeed: 0.0024,
      }),
    ];
  }

  protected setupScene(_root: HTMLDivElement, _context: PageContext): void {
    if (!this.renderer) return;
    this.disposed = false;

    configurePbrRenderer(this.renderer);
    this.lighting = new EnvironmentLighting({
      renderer: this.renderer,
      scene: this.scene,
      materialRegistry: this.materialRegistry,
    });
    this.pipeline = new PbrRenderPipeline({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      size: this.size,
      targetName: 'PbrShowcase',
    });

    this.scene.add(this.showcaseGroup);
    this.createShowcaseObjects();
    this.applyPbrGlobalSettings(this.pbrSettings);
    this.applyShowcaseSettings(this.showcaseSettings);
    void this.mountParameters(_context);
  }

  applyPbrGlobalSettings(settings: PbrGlobalSettings): void {
    this.pbrSettings = settings;
    this.lighting?.apply(settings.lighting);
    this.pipeline?.applyAoSettings(settings.ao);
  }

  protected updateScene(timeSeconds: number, deltaSeconds: number): void {
    this.parameterRuntime?.updatePlayback(deltaSeconds);
    this.applyAnimatedTransforms(timeSeconds);
  }

  protected renderScene(deltaSeconds: number): void {
    this.pipeline?.render(deltaSeconds);
  }

  protected onResize(size: ThreePageSize): void {
    this.pipeline?.setSize(size);
  }

  protected disposeScene(): void {
    this.disposed = true;
    this.parameterRuntime?.dispose();
    this.parameterRuntime = null;
    this.pipeline?.dispose();
    this.pipeline = null;
    this.lighting?.dispose();
    this.lighting = null;
    this.materialRegistry.disposeAll();

    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    this.geometries.length = 0;
    this.primaryMaterial = null;
    this.secondaryMaterial = null;
    this.accentMaterial = null;
    this.knot = null;
    this.box = null;
    this.column = null;
  }

  private createShowcaseObjects(): void {
    const floorMaterial = this.trackMaterial(new MeshStandardMaterial({
      color: '#8aa0a6',
      metalness: 0,
      roughness: 0.68,
    }));
    this.primaryMaterial = this.trackMaterial(new MeshStandardMaterial({
      color: '#d97706',
      metalness: 0.08,
      roughness: 0.42,
      flatShading: true,
    }));
    this.secondaryMaterial = this.trackMaterial(new MeshStandardMaterial({
      color: '#0f766e',
      metalness: 0.02,
      roughness: 0.48,
    }));
    this.accentMaterial = this.trackMaterial(new MeshStandardMaterial({
      color: '#334155',
      metalness: 0.18,
      roughness: 0.36,
    }));

    const floor = new Mesh(this.trackGeometry(new PlaneGeometry(9, 9)), floorMaterial);
    floor.rotation.x = -Math.PI * 0.5;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.knot = new Mesh(
      this.trackGeometry(new TorusKnotGeometry(0.62, 0.18, 96, 16)),
      this.primaryMaterial,
    );
    this.knot.castShadow = true;
    this.knot.receiveShadow = true;
    this.showcaseGroup.add(this.knot);

    this.box = new Mesh(this.trackGeometry(new BoxGeometry(1.0, 1.0, 1.0)), this.secondaryMaterial);
    this.box.rotation.set(0.15, 0.32, -0.08);
    this.box.castShadow = true;
    this.box.receiveShadow = true;
    this.showcaseGroup.add(this.box);

    this.column = new Mesh(this.trackGeometry(new CylinderGeometry(0.42, 0.42, 1.8, 32)), this.accentMaterial);
    this.column.castShadow = true;
    this.column.receiveShadow = true;
    this.showcaseGroup.add(this.column);
  }

  private async mountParameters(context: PageContext): Promise<void> {
    const editorSettings = await this.store.loadEditorConfig();
    if (this.disposed) return;

    const runtime = new SceneParameterRuntime<PbrShowcaseSettings>({
      sceneId: SCENE_ID,
      title: 'PBR Showcase Parameters',
      groups: PARAMETER_GROUPS,
      fields: PARAMETER_FIELDS,
      createFallbackSettings: createPbrShowcaseSettingsFallback,
      sceneStore: {
        load: () => this.store.loadSceneConfig(),
        save: (settings) => this.store.saveSceneConfig(settings),
      },
      applyParameter: applyPbrShowcaseParameter,
      onSettingsLoad: (settings) => this.applyShowcaseSettings(settings),
      onSettingsChange: (settings) => this.applyShowcaseSettings(settings),
      onEditorChange: (settings) => this.store.saveEditorConfig(settings),
    }, editorSettings);

    this.parameterRuntime = runtime;
    await runtime.load();
    if (this.disposed || this.parameterRuntime !== runtime) {
      runtime.dispose();
      return;
    }

    runtime.mount(context.parameterHost, context.animationHost, context.animationTabHost);
  }

  private applyShowcaseSettings(settings: PbrShowcaseSettings): void {
    this.showcaseSettings = settings;

    this.showcaseGroup.scale.setScalar(settings.layout.scale);
    this.primaryMaterial?.color.set(settings.materials.primaryColor);
    this.secondaryMaterial?.color.set(settings.materials.secondaryColor);
    this.accentMaterial?.color.set(settings.materials.accentColor);
    this.setMaterialRoughness(settings.materials.roughness);
    this.applyAnimatedTransforms(performance.now() / 1000);
  }

  private setMaterialRoughness(roughness: number): void {
    for (const material of [this.primaryMaterial, this.secondaryMaterial, this.accentMaterial]) {
      if (!material) continue;

      material.roughness = roughness;
      material.needsUpdate = true;
    }
  }

  private applyAnimatedTransforms(timeSeconds: number): void {
    const { motion, layout } = this.showcaseSettings;
    const bob = Math.sin(timeSeconds * motion.bobSpeed) * motion.bobAmount;
    const spread = layout.spread;

    this.showcaseGroup.rotation.y = timeSeconds * motion.spinSpeed;
    this.knot?.position.set(-spread, 1.05 + bob, 0);
    this.box?.position.set(spread, 0.65 - bob * 0.32, -0.16);
    this.column?.position.set(0, 0.9 + bob * 0.18, spread * 0.86);
  }

  private trackGeometry<TGeometry extends BufferGeometry>(geometry: TGeometry): TGeometry {
    this.geometries.push(geometry);
    return geometry;
  }

  private trackMaterial<TMaterial extends MeshStandardMaterial>(material: TMaterial): TMaterial {
    return this.materialRegistry.track(material);
  }
}

export function createPbrShowcaseSettingsFallback(): PbrShowcaseSettings {
  return cloneParameterObject({
    motion: {
      spinSpeed: 0.32,
      bobAmount: 0.12,
      bobSpeed: 1.5,
    },
    layout: {
      spread: 1.05,
      scale: 1,
    },
    materials: {
      primaryColor: '#d97706',
      secondaryColor: '#0f766e',
      accentColor: '#334155',
      roughness: 0.46,
    },
  });
}

export function mergePbrShowcaseSettings(
  base: PbrShowcaseSettings,
  override: Partial<PbrShowcaseSettings>,
): PbrShowcaseSettings {
  const next = cloneParameterObject(base);

  next.motion.spinSpeed = finiteNumberOr(override.motion?.spinSpeed, next.motion.spinSpeed);
  next.motion.bobAmount = clampNumber(finiteNumberOr(override.motion?.bobAmount, next.motion.bobAmount), 0, 1.2);
  next.motion.bobSpeed = clampNumber(finiteNumberOr(override.motion?.bobSpeed, next.motion.bobSpeed), 0, 6);
  next.layout.spread = clampNumber(finiteNumberOr(override.layout?.spread, next.layout.spread), 0.4, 2.8);
  next.layout.scale = clampNumber(finiteNumberOr(override.layout?.scale, next.layout.scale), 0.35, 1.8);
  next.materials.primaryColor = hexColorOr(override.materials?.primaryColor, next.materials.primaryColor);
  next.materials.secondaryColor = hexColorOr(override.materials?.secondaryColor, next.materials.secondaryColor);
  next.materials.accentColor = hexColorOr(override.materials?.accentColor, next.materials.accentColor);
  next.materials.roughness = clampNumber(finiteNumberOr(override.materials?.roughness, next.materials.roughness), 0.12, 0.95);

  return next;
}

export function applyPbrShowcaseParameter(
  settings: PbrShowcaseSettings,
  path: string,
  value: SceneParameterValue,
): ParameterApplyResult {
  const field = PARAMETER_FIELD_BY_PATH.get(path);
  if (!field) return { applied: false };

  const normalized = normalizeParameterValue(field, value);
  if (normalized === undefined) return { applied: false };

  if (!setParameterValue(settings, path, normalized)) {
    return { applied: false };
  }

  return { applied: true };
}

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function hexColorOr(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    return fallback;
  }

  return value;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
