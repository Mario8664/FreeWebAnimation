import type { DeckPage } from '../Page';
import {
  setParameterValue,
  cloneParameterObject,
} from '../animation/ParameterPath';
import {
  DEFAULT_SHARED_SCENE_SETTINGS,
  AO_PRESET_OPTIONS,
  getAoPresetSettings,
  createSharedParameterSections,
  mergeSharedSceneSettings,
  type AoSettings,
  type LightingSettings,
  type SharedSceneSettings,
} from '../parameters/SharedSceneSettings';
import { GlobalParameterRuntime } from '../parameters/GlobalParameterRuntime';
import { GlobalSettingsStore } from '../parameters/GlobalSettingsStore';
import {
  normalizeParameterValue,
  type ParameterApplyResult,
  type ParameterFieldSchema,
  type ParameterGroupSchema,
  type SceneParameterValue,
} from '../parameters/SceneParameterRuntime';

export const PBR_GLOBAL_PARAMETER_ID = 'pbr';
export const PBR_GLOBAL_FILE_NAME = 'pbr-global.json';

export type PbrGlobalSettings = {
  lighting: LightingSettings;
  ao: AoSettings;
};

export type PbrGlobalSettingsConsumer = DeckPage & {
  readonly usesPbrGlobalSettings: true;
  applyPbrGlobalSettings(settings: PbrGlobalSettings): void;
};

export const PBR_GLOBAL_PARAMETER_GROUPS: readonly ParameterGroupSchema[] = [
  { id: 'lighting', title: 'Lighting', defaultCollapsed: false },
  { id: 'gtao', title: 'GTAO', defaultCollapsed: false },
];

export const PBR_GLOBAL_PARAMETER_FIELDS: readonly ParameterFieldSchema[] = createPbrGlobalParameterFields();

const PBR_GLOBAL_FIELD_BY_PATH = new Map(PBR_GLOBAL_PARAMETER_FIELDS.map((field) => [field.path, field]));

export function createPbrGlobalParameterRuntime(): GlobalParameterRuntime<PbrGlobalSettings> {
  return new GlobalParameterRuntime<PbrGlobalSettings>({
    title: 'PBR Global Parameters',
    groups: PBR_GLOBAL_PARAMETER_GROUPS,
    fields: PBR_GLOBAL_PARAMETER_FIELDS,
    createFallbackSettings: createPbrGlobalSettingsFallback,
    store: new GlobalSettingsStore<PbrGlobalSettings>({
      fileName: PBR_GLOBAL_FILE_NAME,
      createFallbackSettings: createPbrGlobalSettingsFallback,
      mergeSettings: mergePbrGlobalSettings,
    }),
    applyParameter: applyPbrGlobalParameter,
    panelCollapsed: true,
  });
}

export function createPbrGlobalSettingsFallback(): PbrGlobalSettings {
  return cloneParameterObject({
    lighting: DEFAULT_SHARED_SCENE_SETTINGS.lighting,
    ao: DEFAULT_SHARED_SCENE_SETTINGS.ao,
  });
}

export function mergePbrGlobalSettings(
  base: PbrGlobalSettings,
  override: Partial<PbrGlobalSettings>,
): PbrGlobalSettings {
  const sharedBase = createSharedSettingsFromPbr(base);
  const merged = mergeSharedSceneSettings(sharedBase, {
    lighting: override.lighting,
    ao: override.ao,
  } as Partial<SharedSceneSettings>);

  return {
    lighting: merged.lighting,
    ao: merged.ao,
  };
}

export function applyPbrGlobalParameter(
  settings: PbrGlobalSettings,
  path: string,
  value: SceneParameterValue,
): ParameterApplyResult {
  const field = PBR_GLOBAL_FIELD_BY_PATH.get(path);
  if (!field) return { applied: false };

  const normalized = normalizeParameterValue(field, value);
  if (normalized === undefined) return { applied: false };

  if (path === 'ao.preset') {
    if (!AO_PRESET_OPTIONS.includes(normalized as AoSettings['preset'])) {
      return { applied: false };
    }

    settings.ao = {
      ...settings.ao,
      ...getAoPresetSettings(normalized as AoSettings['preset']),
    };
    return { applied: true, draftPaths: field.draftPaths };
  }

  if (!setParameterValue(settings, path, normalized)) {
    return { applied: false };
  }

  normalizeLinkedSettings(settings, path);
  return { applied: true, draftPaths: field.draftPaths };
}

export function isPbrGlobalSettingsConsumer(page: DeckPage): page is PbrGlobalSettingsConsumer {
  const candidate = page as Partial<PbrGlobalSettingsConsumer>;
  return candidate.usesPbrGlobalSettings === true
    && typeof candidate.applyPbrGlobalSettings === 'function';
}

function createPbrGlobalParameterFields(): ParameterFieldSchema[] {
  const sharedSettings = createSharedSettingsFromPbr(createPbrGlobalSettingsFallback());

  return createSharedParameterSections({
    settings: sharedSettings,
    collapsed: {
      camera: false,
      scene: false,
      lighting: false,
      gtao: false,
    },
    withKeyAction: (field) => field,
    sectionKeys: ['lighting', 'gtao'],
  }).flatMap((section) => section.fields.map((field) => ({
    path: field.key,
    group: section.id,
    label: field.label,
    type: field.type,
    step: 'step' in field ? field.step : undefined,
    min: getFieldMin(field.key),
    max: getFieldMax(field.key),
    options: field.type === 'select' ? field.options : undefined,
    animatable: false,
    clamp: field.type === 'number' || field.type === 'range',
    draftPaths: getDraftPaths(field.key),
  })));
}

function createSharedSettingsFromPbr(settings: PbrGlobalSettings): SharedSceneSettings {
  return {
    ...cloneParameterObject(DEFAULT_SHARED_SCENE_SETTINGS),
    lighting: cloneParameterObject(settings.lighting),
    ao: cloneParameterObject(settings.ao),
  };
}

function normalizeLinkedSettings(settings: PbrGlobalSettings, path: string): void {
  if (path === 'ao.strength' || path === 'ao.range' || path === 'ao.softness') {
    settings.ao.preset = 'Custom';
    return;
  }

  if (!path.startsWith('lighting.shadow.')) {
    return;
  }

  const shadow = settings.lighting.shadow;
  shadow.normalBias = Math.max(0, shadow.normalBias);
  shadow.radius = Math.max(0, shadow.radius);
  shadow.mapSize = Math.max(256, Math.round(shadow.mapSize));
  shadow.cameraSize = Math.max(0.1, shadow.cameraSize);
  shadow.near = Math.max(0.001, shadow.near);
  shadow.far = Math.max(shadow.near + 0.001, shadow.far);
}

function getDraftPaths(path: string): readonly string[] | undefined {
  if (path === 'ao.preset') {
    return ['ao.preset', 'ao.strength', 'ao.range', 'ao.softness'];
  }

  if (path === 'lighting.shadow.near') {
    return ['lighting.shadow.near', 'lighting.shadow.far'];
  }

  return undefined;
}

function getFieldMin(path: string): number | undefined {
  switch (path) {
    case 'lighting.main.intensity':
    case 'lighting.ambient.intensity':
    case 'lighting.environment.brightness':
    case 'lighting.shadow.normalBias':
    case 'lighting.shadow.radius':
    case 'ao.strength':
      return 0;
    case 'lighting.environment.sunSize':
    case 'lighting.shadow.cameraSize':
    case 'ao.range':
      return 0.001;
    case 'lighting.shadow.mapSize':
      return 256;
    case 'lighting.shadow.near':
      return 0.001;
    case 'ao.softness':
      return 0;
    default:
      return undefined;
  }
}

function getFieldMax(path: string): number | undefined {
  switch (path) {
    case 'lighting.shadow.mapSize':
      return 8192;
    case 'ao.softness':
      return 1;
    default:
      return undefined;
  }
}
