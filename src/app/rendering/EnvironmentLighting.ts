import {
  AmbientLight,
  BackSide,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Texture,
  type Material,
  type WebGLRenderer,
} from 'three';
import {
  DEFAULT_SHARED_SCENE_SETTINGS,
  type LightingSettings,
  type ShadowSettings,
} from '../parameters/SharedSceneSettings';
import type { MaterialRegistry } from './MaterialRegistry';
import { disposeMaterial, disposeSceneResources } from './ResourceDisposal';

export class EnvironmentLighting {
  readonly ambientLight = new AmbientLight(0xffffff, 0.22);
  readonly mainLight = new DirectionalLight(0xfff3df, 3.2);
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly materialRegistry: MaterialRegistry;
  private environmentTexture: Texture | null = null;
  private environmentKey = '';

  constructor(options: {
    renderer: WebGLRenderer;
    scene: Scene;
    materialRegistry: MaterialRegistry;
  }) {
    this.renderer = options.renderer;
    this.scene = options.scene;
    this.materialRegistry = options.materialRegistry;

    this.mainLight.position.set(-4.5, 7.5, 4.5);
    this.mainLight.castShadow = true;
    this.mainLight.shadow.mapSize.set(2048, 2048);
    this.mainLight.shadow.camera.near = 0.5;
    this.mainLight.shadow.camera.far = 28;
    this.mainLight.shadow.camera.left = -8;
    this.mainLight.shadow.camera.right = 8;
    this.mainLight.shadow.camera.top = 8;
    this.mainLight.shadow.camera.bottom = -8;
    applyDirectionalShadowSettings(this.mainLight, DEFAULT_SHARED_SCENE_SETTINGS.lighting.shadow);

    this.scene.add(this.ambientLight);
    this.scene.add(this.mainLight);
  }

  apply(settings: LightingSettings): void {
    this.ambientLight.color.set(settings.ambient.color);
    this.ambientLight.intensity = settings.ambient.intensity;
    this.mainLight.color.set(settings.main.color);
    this.mainLight.intensity = settings.main.intensity;
    applyDirectionalShadowSettings(this.mainLight, settings.shadow);
    this.scene.background = new Color(settings.environment.skyColor);
    if (this.getEnvironmentKey(settings) !== this.environmentKey) {
      this.rebuildEnvironmentTexture(settings);
    }
    this.applyEnvironmentIntensity(settings.environment.brightness);
  }

  applyEnvironmentIntensity(brightness: number): void {
    this.materialRegistry.forEach((material) => {
      if (material instanceof MeshStandardMaterial) {
        material.envMapIntensity = Math.max(0, brightness);
        material.needsUpdate = true;
      }
    });
  }

  dispose(): void {
    this.ambientLight.removeFromParent();
    this.mainLight.removeFromParent();
    this.environmentTexture?.dispose();
    this.environmentTexture = null;
  }

  private rebuildEnvironmentTexture(settings: LightingSettings): void {
    const environmentScene = this.createEnvironmentScene(settings);
    const generator = new PMREMGenerator(this.renderer);
    const nextTexture = generator.fromScene(environmentScene, 0.04, 0.1, 120, { size: 128 }).texture;

    this.environmentTexture?.dispose();
    this.environmentTexture = nextTexture;
    this.scene.environment = nextTexture;
    this.environmentKey = this.getEnvironmentKey(settings);

    generator.dispose();
    disposeSceneResources(environmentScene);
  }

  private getEnvironmentKey(settings: LightingSettings): string {
    return [
      settings.main.color,
      settings.environment.skyColor,
      settings.environment.groundColor,
      settings.environment.sunSize,
    ].join('|');
  }

  private createEnvironmentScene(settings: LightingSettings): Scene {
    const environmentScene = new Scene();
    environmentScene.background = new Color(settings.environment.skyColor);

    const skySphere = new Mesh(
      new SphereGeometry(80, 32, 16),
      new MeshBasicMaterial({
        color: settings.environment.skyColor,
        side: BackSide,
      }),
    );
    environmentScene.add(skySphere);

    const ground = new Mesh(
      new PlaneGeometry(220, 220),
      new MeshBasicMaterial({ color: settings.environment.groundColor }),
    );
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.04;
    environmentScene.add(ground);

    const sunDirection = this.mainLight.position.clone().normalize();
    const sunDistance = 68;
    const sun = new Mesh(
      new SphereGeometry(Math.max(0.01, settings.environment.sunSize) * 0.5, 16, 8),
      new MeshBasicMaterial({
        color: settings.main.color,
        toneMapped: false,
      }),
    );
    sun.position.copy(sunDirection.multiplyScalar(sunDistance));
    environmentScene.add(sun);

    return environmentScene;
  }
}

export function applyDirectionalShadowSettings(light: DirectionalLight, settings: ShadowSettings): void {
  const mapSize = Math.max(256, Math.round(settings.mapSize));
  const cameraSize = Math.max(0.1, settings.cameraSize);
  const near = Math.max(0.001, settings.near);
  const far = Math.max(near + 0.001, settings.far);

  light.shadow.bias = settings.bias;
  light.shadow.normalBias = Math.max(0, settings.normalBias);
  light.shadow.radius = Math.max(0, settings.radius);
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.map?.setSize(mapSize, mapSize);
  light.shadow.camera.near = near;
  light.shadow.camera.far = far;
  light.shadow.camera.left = -cameraSize;
  light.shadow.camera.right = cameraSize;
  light.shadow.camera.top = cameraSize;
  light.shadow.camera.bottom = -cameraSize;
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.needsUpdate = true;
}

export function createPbrMaterialFromSource(source: Material, envMapIntensity: number): MeshStandardMaterial {
  const color = 'color' in source && source.color instanceof Color
    ? source.color.clone()
    : new Color(0x7c8f57);

  return new MeshStandardMaterial({
    color,
    metalness: 0,
    roughness: getSourceRoughness(source),
    envMapIntensity: Math.max(0, envMapIntensity),
    flatShading: true,
  });
}

export function disposeMaterialSource(material: Material | Material[], onDispose?: (material: Material) => void): void {
  disposeMaterial(material, onDispose);
}

function getSourceRoughness(source: Material): number {
  if ('roughness' in source && typeof source.roughness === 'number' && Number.isFinite(source.roughness)) {
    return clamp01(source.roughness);
  }

  if ('shininess' in source && typeof source.shininess === 'number' && Number.isFinite(source.shininess)) {
    return clamp01(1 - Math.sqrt(clamp01(source.shininess / 100)));
  }

  return 0.78;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
