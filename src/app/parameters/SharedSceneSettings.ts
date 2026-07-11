import type {
  SceneParameterField,
  SceneParameterSection,
  SceneParameterValue,
} from '../SceneParameterPanel';

export type Number3 = {
  x: number;
  y: number;
  z: number;
};

export type CameraSettings = {
  position: Number3;
  rotation: Number3;
  fov: number;
  near: number;
  far: number;
};

export type CameraControlsSettings = {
  moveSpeed: number;
  lookSpeed: number;
};

export type ModelSettings = {
  url: string;
  scale: number;
};

export type LightSettings = {
  color: string;
  intensity: number;
};

export type EnvironmentLightingSettings = {
  brightness: number;
  skyColor: string;
  groundColor: string;
  sunSize: number;
};

export type ShadowSettings = {
  bias: number;
  normalBias: number;
  radius: number;
  mapSize: number;
  cameraSize: number;
  near: number;
  far: number;
};

export type LightingSettings = {
  main: LightSettings;
  ambient: LightSettings;
  environment: EnvironmentLightingSettings;
  shadow: ShadowSettings;
};

export const AO_VIEW_OPTIONS = ['Final', 'AO Mask', 'Denoised Mask', 'Depth', 'Normal', 'Scene', 'Off'] as const;
export const AO_PRESET_OPTIONS = ['Subtle', 'Balanced', 'Debug', 'Custom'] as const;
export const AO_QUALITY_OPTIONS = ['Low', 'Medium', 'High'] as const;

export type AoViewMode = (typeof AO_VIEW_OPTIONS)[number];
export type AoPreset = (typeof AO_PRESET_OPTIONS)[number];
export type AoQuality = (typeof AO_QUALITY_OPTIONS)[number];

export type AoSettings = {
  enabled: boolean;
  preset: AoPreset;
  view: AoViewMode;
  quality: AoQuality;
  strength: number;
  range: number;
  softness: number;
};

export type SharedSceneSettings = {
  camera: CameraSettings;
  cameraControls: CameraControlsSettings;
  lighting: LightingSettings;
  model: ModelSettings;
  ao: AoSettings;
};

export type SharedParameterSectionKey = 'camera' | 'scene' | 'lighting' | 'gtao';

export const SHARED_ANIMATABLE_CAMERA_PATHS = [
  'camera.position.x',
  'camera.position.y',
  'camera.position.z',
  'camera.rotation.x',
  'camera.rotation.y',
  'camera.rotation.z',
  'camera.fov',
  'camera.near',
  'camera.far',
] as const;

export const SHARED_ANIMATABLE_PARAMETER_PATHS = [
  ...SHARED_ANIMATABLE_CAMERA_PATHS,
  'lighting.main.color',
  'lighting.main.intensity',
  'lighting.ambient.color',
  'lighting.ambient.intensity',
  'lighting.environment.brightness',
  'lighting.environment.skyColor',
  'lighting.environment.groundColor',
  'lighting.environment.sunSize',
  'lighting.shadow.bias',
  'lighting.shadow.normalBias',
  'lighting.shadow.radius',
  'lighting.shadow.mapSize',
  'lighting.shadow.cameraSize',
  'lighting.shadow.near',
  'lighting.shadow.far',
  'ao.enabled',
  'ao.preset',
  'ao.view',
  'ao.quality',
  'ao.strength',
  'ao.range',
  'ao.softness',
] as const;

export const DEFAULT_SHARED_SCENE_SETTINGS: SharedSceneSettings = {
  camera: {
    position: { x: 62, y: 24, z: 62 },
    rotation: { x: -0.2437, y: 0.7854, z: 0 },
    fov: 45,
    near: 0.1,
    far: 10000,
  },
  cameraControls: {
    moveSpeed: 1,
    lookSpeed: 0.0024,
  },
  lighting: {
    main: {
      color: '#fff3df',
      intensity: 3.2,
    },
    ambient: {
      color: '#ffffff',
      intensity: 0.22,
    },
    environment: {
      brightness: 0.45,
      skyColor: '#d9e7eb',
      groundColor: '#b9cf93',
      sunSize: 8,
    },
    shadow: {
      bias: 0.0001,
      normalBias: 0.02,
      radius: 1,
      mapSize: 2048,
      cameraSize: 8,
      near: 0.5,
      far: 28,
    },
  },
  model: {
    url: '',
    scale: 0.01,
  },
  ao: {
    enabled: false,
    preset: 'Subtle',
    view: 'Final',
    quality: 'Medium',
    strength: 0.55,
    range: 0.18,
    softness: 0.55,
  },
};

export type SharedSettingApplyResult =
  | { handled: true; shouldApplyCamera: boolean; draftPaths?: readonly string[] }
  | { handled: false };

export function createSharedParameterSections(options: {
  settings: SharedSceneSettings;
  collapsed: Record<SharedParameterSectionKey, boolean>;
  withKeyAction: (field: SceneParameterField) => SceneParameterField;
  sectionKeys?: readonly SharedParameterSectionKey[];
}): SceneParameterSection[] {
  const field = options.withKeyAction;
  const settings = options.settings;

  const sections: SceneParameterSection[] = [
    {
      id: 'camera',
      title: 'Camera',
      collapsed: options.collapsed.camera,
      fields: [
        field(numberField('camera.position.x', 'pos x', settings.camera.position.x)),
        field(numberField('camera.position.y', 'pos y', settings.camera.position.y)),
        field(numberField('camera.position.z', 'pos z', settings.camera.position.z)),
        field(numberField('camera.rotation.x', 'rot x', settings.camera.rotation.x)),
        field(numberField('camera.rotation.y', 'rot y', settings.camera.rotation.y)),
        field(numberField('camera.rotation.z', 'rot z', settings.camera.rotation.z)),
        field(numberField('camera.fov', 'fov', settings.camera.fov)),
        field(numberField('camera.near', 'near', settings.camera.near)),
        field(numberField('camera.far', 'far', settings.camera.far)),
      ],
    },
    {
      id: 'scene',
      title: 'Scene',
      collapsed: options.collapsed.scene,
      fields: [
        numberField('cameraControls.moveSpeed', 'move', settings.cameraControls.moveSpeed),
        numberField('cameraControls.lookSpeed', 'look', settings.cameraControls.lookSpeed),
        numberField('model.scale', 'model', settings.model.scale),
      ],
    },
    {
      id: 'lighting',
      title: 'Lighting',
      collapsed: options.collapsed.lighting,
      fields: [
        field({ type: 'color', key: 'lighting.main.color', label: 'main color', value: settings.lighting.main.color }),
        field(numberField('lighting.main.intensity', 'main', settings.lighting.main.intensity)),
        field({ type: 'color', key: 'lighting.ambient.color', label: 'amb color', value: settings.lighting.ambient.color }),
        field(numberField('lighting.ambient.intensity', 'ambient', settings.lighting.ambient.intensity)),
        field(numberField('lighting.environment.brightness', 'env', settings.lighting.environment.brightness)),
        field({ type: 'color', key: 'lighting.environment.skyColor', label: 'sky', value: settings.lighting.environment.skyColor }),
        field({
          type: 'color',
          key: 'lighting.environment.groundColor',
          label: 'ground',
          value: settings.lighting.environment.groundColor,
        }),
        field(numberField('lighting.environment.sunSize', 'sun size', settings.lighting.environment.sunSize)),
        field(numberField('lighting.shadow.bias', 'shadow bias', settings.lighting.shadow.bias)),
        field(numberField('lighting.shadow.normalBias', 'normal bias', settings.lighting.shadow.normalBias)),
        field(numberField('lighting.shadow.radius', 'shadow radius', settings.lighting.shadow.radius)),
        field(numberField('lighting.shadow.mapSize', 'map size', settings.lighting.shadow.mapSize)),
        field(numberField('lighting.shadow.cameraSize', 'camera size', settings.lighting.shadow.cameraSize)),
        field(numberField('lighting.shadow.near', 'shadow near', settings.lighting.shadow.near)),
        field(numberField('lighting.shadow.far', 'shadow far', settings.lighting.shadow.far)),
      ],
    },
    {
      id: 'gtao',
      title: 'GTAO',
      collapsed: options.collapsed.gtao,
      fields: [
        field({ type: 'checkbox', key: 'ao.enabled', label: 'Enable GTAO', value: settings.ao.enabled }),
        field({ type: 'select', key: 'ao.preset', label: 'preset', value: settings.ao.preset, options: AO_PRESET_OPTIONS }),
        field({ type: 'select', key: 'ao.view', label: 'view', value: settings.ao.view, options: AO_VIEW_OPTIONS }),
        field({ type: 'select', key: 'ao.quality', label: 'quality', value: settings.ao.quality, options: AO_QUALITY_OPTIONS }),
        field(numberField('ao.strength', 'strength', settings.ao.strength)),
        field(numberField('ao.range', 'range', settings.ao.range)),
        field(numberField('ao.softness', 'softness', settings.ao.softness)),
      ],
    },
  ];

  if (options.sectionKeys) {
    return sections.filter((section) => options.sectionKeys?.includes(section.id as SharedParameterSectionKey));
  }

  return sections;
}

export function applySharedSettingUpdate(
  settings: SharedSceneSettings,
  key: string,
  value: SceneParameterValue,
  hooks: {
    applyLightingSettings: () => void;
    applyEnvironmentIntensity: () => void;
    applyModelSettings: () => void;
    applyAoSettings: () => void;
    updateCameraControls: (settings: CameraControlsSettings) => void;
  },
): SharedSettingApplyResult {
  switch (key) {
    case 'camera.position.x':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.camera.position.x = value;
      break;
    case 'camera.position.y':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.camera.position.y = value;
      break;
    case 'camera.position.z':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.camera.position.z = value;
      break;
    case 'camera.rotation.x':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.camera.rotation.x = value;
      break;
    case 'camera.rotation.y':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.camera.rotation.y = value;
      break;
    case 'camera.rotation.z':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.camera.rotation.z = value;
      break;
    case 'camera.fov':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.camera.fov = Math.min(100, Math.max(10, value));
      break;
    case 'camera.near':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.camera.near = Math.max(0.001, value);
      break;
    case 'camera.far':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.camera.far = Math.max(settings.camera.near + 1, value);
      break;
    case 'cameraControls.moveSpeed':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.cameraControls.moveSpeed = Math.max(0.02, value);
      hooks.updateCameraControls(settings.cameraControls);
      return { handled: true, shouldApplyCamera: false };
    case 'cameraControls.lookSpeed':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.cameraControls.lookSpeed = Math.max(0.0001, value);
      hooks.updateCameraControls(settings.cameraControls);
      return { handled: true, shouldApplyCamera: false };
    case 'model.scale':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.model.scale = Math.max(0.0001, value);
      hooks.applyModelSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.main.color':
      if (!isHexColor(value)) return { handled: false };
      settings.lighting.main.color = value;
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.main.intensity':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.lighting.main.intensity = Math.max(0, value);
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.ambient.color':
      if (!isHexColor(value)) return { handled: false };
      settings.lighting.ambient.color = value;
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.ambient.intensity':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.lighting.ambient.intensity = Math.max(0, value);
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.environment.brightness':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.lighting.environment.brightness = Math.max(0, value);
      hooks.applyEnvironmentIntensity();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.environment.skyColor':
      if (!isHexColor(value)) return { handled: false };
      settings.lighting.environment.skyColor = value;
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.environment.groundColor':
      if (!isHexColor(value)) return { handled: false };
      settings.lighting.environment.groundColor = value;
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.environment.sunSize':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.lighting.environment.sunSize = Math.max(0.01, value);
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.shadow.bias':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.lighting.shadow.bias = value;
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.shadow.normalBias':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.lighting.shadow.normalBias = Math.max(0, value);
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.shadow.radius':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.lighting.shadow.radius = Math.max(0, value);
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.shadow.mapSize':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.lighting.shadow.mapSize = Math.max(256, Math.round(value));
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.shadow.cameraSize':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.lighting.shadow.cameraSize = Math.max(0.1, value);
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'lighting.shadow.near':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.lighting.shadow.near = Math.max(0.001, value);
      if (settings.lighting.shadow.near > settings.lighting.shadow.far - 0.001) {
        settings.lighting.shadow.far = settings.lighting.shadow.near + 0.001;
      }
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false, draftPaths: ['lighting.shadow.near', 'lighting.shadow.far'] };
    case 'lighting.shadow.far':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.lighting.shadow.far = Math.max(settings.lighting.shadow.near + 0.001, value);
      hooks.applyLightingSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'ao.enabled':
      if (typeof value !== 'boolean') return { handled: false };
      settings.ao.enabled = value;
      hooks.applyAoSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'ao.preset':
      if (!isAoPreset(value)) return { handled: false };
      settings.ao = {
        ...settings.ao,
        ...getAoPresetSettings(value),
      };
      hooks.applyAoSettings();
      return {
        handled: true,
        shouldApplyCamera: false,
        draftPaths: ['ao.preset', 'ao.strength', 'ao.range', 'ao.softness'],
      };
    case 'ao.view':
      if (!isAoViewMode(value)) return { handled: false };
      settings.ao.view = value;
      hooks.applyAoSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'ao.quality':
      if (!isAoQuality(value)) return { handled: false };
      settings.ao.quality = value;
      hooks.applyAoSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'ao.strength':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.ao.preset = 'Custom';
      settings.ao.strength = Math.max(0, value);
      hooks.applyAoSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'ao.range':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.ao.preset = 'Custom';
      settings.ao.range = Math.max(0.001, value);
      hooks.applyAoSettings();
      return { handled: true, shouldApplyCamera: false };
    case 'ao.softness':
      if (!isFiniteNumber(value)) return { handled: false };
      settings.ao.preset = 'Custom';
      settings.ao.softness = clamp01(value);
      hooks.applyAoSettings();
      return { handled: true, shouldApplyCamera: false };
    default:
      return { handled: false };
  }

  return { handled: true, shouldApplyCamera: true };
}

export function mergeSharedSceneSettings<T extends SharedSceneSettings>(base: T, override: Partial<T>): T {
  return {
    ...base,
    camera: {
      position: { ...base.camera.position, ...override.camera?.position },
      rotation: { ...base.camera.rotation, ...override.camera?.rotation },
      fov: override.camera?.fov ?? base.camera.fov,
      near: override.camera?.near ?? base.camera.near,
      far: override.camera?.far ?? base.camera.far,
    },
    cameraControls: {
      moveSpeed: override.cameraControls?.moveSpeed ?? base.cameraControls.moveSpeed,
      lookSpeed: override.cameraControls?.lookSpeed ?? base.cameraControls.lookSpeed,
    },
    lighting: {
      main: {
        color: override.lighting?.main?.color ?? base.lighting.main.color,
        intensity: override.lighting?.main?.intensity ?? base.lighting.main.intensity,
      },
      ambient: {
        color: override.lighting?.ambient?.color ?? base.lighting.ambient.color,
        intensity: override.lighting?.ambient?.intensity ?? base.lighting.ambient.intensity,
      },
      environment: mergeEnvironmentLightingSettings(base.lighting.environment, override.lighting?.environment),
      shadow: mergeShadowSettings(base.lighting.shadow, override.lighting?.shadow),
    },
    model: {
      url: override.model?.url ?? base.model.url,
      scale: override.model?.scale ?? base.model.scale,
    },
    ao: mergeAoSettings(base.ao, override.ao),
  };
}

export function getAoPresetSettings(preset: AoPreset): Pick<AoSettings, 'preset' | 'strength' | 'range' | 'softness'> {
  switch (preset) {
    case 'Subtle':
      return { preset, strength: 0.55, range: 0.18, softness: 0.55 };
    case 'Balanced':
      return { preset, strength: 0.82, range: 0.24, softness: 0.62 };
    case 'Debug':
      return { preset, strength: 1.25, range: 0.34, softness: 0.35 };
    case 'Custom':
      return { preset, strength: 0.55, range: 0.18, softness: 0.55 };
  }
}

export function numberField(key: string, label: string, value: number): SceneParameterSection['fields'][number] {
  return {
    type: 'number',
    key,
    label,
    value,
    step: getInputStep(key),
  };
}

export function getInputStep(key: string): number {
  if (key === 'cameraControls.lookSpeed') return 0.0001;
  if (key === 'model.scale') return 0.001;
  if (key === 'lighting.environment.brightness') return 0.01;
  if (key === 'lighting.environment.sunSize') return 0.1;
  if (key === 'lighting.shadow.bias') return 0.0001;
  if (key === 'lighting.shadow.normalBias') return 0.001;
  if (key === 'lighting.shadow.radius') return 0.1;
  if (key === 'lighting.shadow.mapSize') return 1;
  if (key === 'lighting.shadow.cameraSize') return 0.1;
  if (key === 'lighting.shadow.near') return 0.01;
  if (key === 'lighting.shadow.far') return 0.1;
  if (key.includes('samples') || key.includes('Rings')) return 1;
  if (key.startsWith('ao.')) return 0.01;
  if (key.includes('rotation')) return 0.01;
  if (key === 'camera.far') return 10;
  if (key === 'camera.near') return 0.01;
  return 0.1;
}

export function isFiniteNumber(value: number | string | boolean): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isHexColor(value: number | string | boolean): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function isAoViewMode(value: unknown): value is AoViewMode {
  return typeof value === 'string' && AO_VIEW_OPTIONS.includes(value as AoViewMode);
}

export function isAoPreset(value: unknown): value is AoPreset {
  return typeof value === 'string' && AO_PRESET_OPTIONS.includes(value as AoPreset);
}

export function isAoQuality(value: unknown): value is AoQuality {
  return typeof value === 'string' && AO_QUALITY_OPTIONS.includes(value as AoQuality);
}

function mergeEnvironmentLightingSettings(
  base: EnvironmentLightingSettings,
  override?: Partial<EnvironmentLightingSettings>,
): EnvironmentLightingSettings {
  const skyColor = override?.skyColor;
  const groundColor = override?.groundColor;

  return {
    brightness: Math.max(0, override?.brightness ?? base.brightness),
    skyColor: typeof skyColor === 'string' && isHexColor(skyColor) ? skyColor : base.skyColor,
    groundColor: typeof groundColor === 'string' && isHexColor(groundColor) ? groundColor : base.groundColor,
    sunSize: Math.max(0.01, override?.sunSize ?? base.sunSize),
  };
}

function mergeShadowSettings(base: ShadowSettings, override?: Partial<ShadowSettings>): ShadowSettings {
  const near = Math.max(0.001, override?.near ?? base.near);
  const far = Math.max(near + 0.001, override?.far ?? base.far);

  return {
    bias: override?.bias ?? base.bias,
    normalBias: Math.max(0, override?.normalBias ?? base.normalBias),
    radius: Math.max(0, override?.radius ?? base.radius),
    mapSize: Math.max(256, Math.round(override?.mapSize ?? base.mapSize)),
    cameraSize: Math.max(0.1, override?.cameraSize ?? base.cameraSize),
    near,
    far,
  };
}

type LegacyAoSettings = {
  output?: unknown;
  blendIntensity?: number;
  radius?: number;
  samples?: number;
  denoiseRadius?: number;
};

function mergeAoSettings(base: AoSettings, override?: Partial<AoSettings> & LegacyAoSettings): AoSettings {
  const view = isAoViewMode(override?.view)
    ? override.view
    : legacyOutputToView(override?.output) ?? base.view;
  const preset = isAoPreset(override?.preset) ? override.preset : base.preset;
  const quality = isAoQuality(override?.quality) ? override.quality : legacySamplesToQuality(override?.samples) ?? base.quality;

  return {
    enabled: override?.enabled ?? base.enabled,
    preset,
    view,
    quality,
    strength: override?.strength ?? override?.blendIntensity ?? base.strength,
    range: override?.range ?? override?.radius ?? base.range,
    softness: override?.softness ?? legacyDenoiseToSoftness(override?.denoiseRadius) ?? base.softness,
  };
}

function legacyOutputToView(output: unknown): AoViewMode | null {
  switch (output) {
    case 'Default':
      return 'Final';
    case 'AO':
      return 'AO Mask';
    case 'Denoise':
      return 'Denoised Mask';
    case 'Depth':
      return 'Depth';
    case 'Normal':
      return 'Normal';
    case 'Diffuse':
      return 'Scene';
    case 'Off':
      return 'Off';
    default:
      return null;
  }
}

function legacySamplesToQuality(samples: unknown): AoQuality | null {
  if (typeof samples !== 'number') return null;
  if (samples <= 8) return 'Low';
  if (samples >= 32) return 'High';
  return 'Medium';
}

function legacyDenoiseToSoftness(radius: unknown): number | null {
  if (typeof radius !== 'number' || !Number.isFinite(radius)) return null;
  return clamp01((radius - 3) / 10);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
