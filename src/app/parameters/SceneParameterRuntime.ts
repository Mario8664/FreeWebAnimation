import type { AnimationClip, AnimationClipLibrary } from '../animation/AnimationClip';
import type { AnimationClipPreviewOptions } from '../animation/AnimationClipController';
import { sampleClipInto } from '../animation/AnimationSampler';
import {
  getParameterValue,
  setParameterValue,
  cloneParameterObject,
} from '../animation/ParameterPath';
import { SceneAnimationRecorder } from '../animation/SceneAnimationRecorder';
import { sampleTimelineInto } from '../animation/TimelineCompositionSampler';
import type { TimelineComposition } from '../animation/TimelineComposition';
import type {
  SceneParameterField,
  SceneParameterSection,
  SceneParameterValue,
} from '../SceneParameterPanel';
import { SceneParameterPanel } from '../SceneParameterPanel';

export type { SceneParameterValue } from '../SceneParameterPanel';

export type ParameterEditorSettings = {
  version: number;
  parameterPanel: {
    collapsed: boolean;
    sectionsCollapsed: Record<string, boolean>;
  };
};

export type ParameterGroupSchema = {
  id: string;
  title: string;
  defaultCollapsed?: boolean;
};

export type ParameterFieldSchema = {
  path: string;
  group: string;
  label: string;
  type: 'number' | 'range' | 'color' | 'checkbox' | 'select';
  step?: number;
  min?: number;
  max?: number;
  clamp?: boolean;
  options?: readonly string[];
  animatable?: boolean;
  visible?: boolean;
  draftPaths?: readonly string[];
};

export type ParameterApplyResult = {
  applied: boolean;
  draftPaths?: readonly string[];
};

type ParameterGroupClipboard = {
  kind: 'free-web-animation.scene-parameter-group';
  version: 1;
  groupId: string;
  values: Record<string, SceneParameterValue>;
};

export type SceneSettingsStore<TSettings extends object> = {
  load: () => Promise<TSettings>;
  save: (settings: TSettings) => Promise<void>;
};

type SceneParameterRuntimeOptions<TSettings extends object> = {
  sceneId: string;
  title: string;
  helpText?: string;
  groups: readonly ParameterGroupSchema[];
  fields: readonly ParameterFieldSchema[];
  createFallbackSettings: () => TSettings;
  sceneStore: SceneSettingsStore<TSettings>;
  applyParameter: (settings: TSettings, path: string, value: SceneParameterValue) => ParameterApplyResult;
  beforeRecord?: () => void;
  afterPreviewRestore?: () => void;
  onSettingsLoad?: (settings: TSettings) => void;
  onSettingsChange?: (settings: TSettings) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPanelSync?: () => void;
  onEditorChange?: (editorSettings: ParameterEditorSettings) => void | Promise<void>;
};

export class SceneParameterRuntime<TSettings extends object> {
  readonly editorSettings: ParameterEditorSettings;
  readonly animatablePaths: readonly string[];
  private readonly options: SceneParameterRuntimeOptions<TSettings>;
  private readonly fieldByPath: Map<string, ParameterFieldSchema>;
  private readonly fieldByDraftPath: Map<string, ParameterFieldSchema>;
  private readonly groupById: Map<string, ParameterGroupSchema>;
  private readonly recorder: SceneAnimationRecorder;
  private panel: SceneParameterPanel | null = null;
  private baseSettings: TSettings;
  private draftSettings: TSettings;
  private settings: TSettings;
  private dirty = false;

  constructor(options: SceneParameterRuntimeOptions<TSettings>, editorSettings: ParameterEditorSettings) {
    this.options = options;
    this.editorSettings = mergeParameterEditorSettings(
      createParameterEditorSettings(options.groups),
      editorSettings,
      options.groups,
    );
    this.fieldByPath = new Map(options.fields.map((field) => [field.path, field]));
    this.fieldByDraftPath = new Map();
    for (const field of options.fields) {
      this.fieldByDraftPath.set(field.path, field);
      for (const draftPath of field.draftPaths ?? []) {
        this.fieldByDraftPath.set(draftPath, this.fieldByPath.get(draftPath) ?? field);
      }
    }
    this.groupById = new Map(options.groups.map((group) => [group.id, group]));
    this.animatablePaths = options.fields
      .filter((field) => field.animatable)
      .map((field) => field.path);
    this.baseSettings = options.createFallbackSettings();
    this.draftSettings = cloneParameterObject(this.baseSettings);
    this.settings = cloneParameterObject(this.baseSettings);
    this.recorder = new SceneAnimationRecorder({
      sceneId: options.sceneId,
      animatablePaths: this.animatablePaths,
      readValue: (path) => getParameterValue(this.settings, path),
      beforeRecord: options.beforeRecord,
      applyClip: (clip, timeSeconds, previewOptions) => this.applyClipAtTime(clip, timeSeconds, previewOptions),
      applyTimeline: (library, composition, timeSeconds) => this.applyTimelineAtTime(library, composition, timeSeconds),
      onChange: () => this.sync(),
      onPreviewChange: (previewing) => this.handlePreviewChange(previewing),
    });
  }

  async load(): Promise<void> {
    this.baseSettings = await this.options.sceneStore.load();
    this.draftSettings = cloneParameterObject(this.baseSettings);
    this.settings = cloneParameterObject(this.baseSettings);
    this.dirty = false;
    this.options.onSettingsLoad?.(this.settings);
    this.options.onSettingsChange?.(this.settings);
    await this.recorder.load();
    exportRuntimeBySceneId.set(this.options.sceneId, this as unknown as SceneParameterRuntime<object>);
  }

  mount(parameterHost: HTMLElement, animationHost: HTMLElement, animationTabHost: HTMLElement): void {
    this.panel = new SceneParameterPanel({
      parent: parameterHost,
      title: this.options.title,
      panelCollapsed: this.editorSettings.parameterPanel.collapsed,
      sections: this.createSections(),
      helpText: this.options.helpText,
      onChange: (path, value) => this.update(path, value),
      onKeyAction: (path) => this.recorder.toggleParameterKey(path),
      onSectionSave: (sectionId) => {
        void this.saveGroup(sectionId);
      },
      onPanelCollapsedChange: (collapsed) => {
        this.editorSettings.parameterPanel.collapsed = collapsed;
        this.sync();
        void this.options.onEditorChange?.(this.editorSettings);
      },
      onSectionCollapsedChange: (sectionId, collapsed) => {
        this.editorSettings.parameterPanel.sectionsCollapsed[sectionId] = collapsed;
        this.sync();
        void this.options.onEditorChange?.(this.editorSettings);
      },
      onSectionCopy: (sectionId) => this.copyGroup(sectionId),
      onSectionPaste: (sectionId) => this.pasteGroup(sectionId),
      onSave: () => this.save(),
    });
    this.recorder.mount(animationHost, animationTabHost);
    this.sync();
  }

  dispose(): void {
    if (exportRuntimeBySceneId.get(this.options.sceneId) === this as unknown as SceneParameterRuntime<object>) {
      exportRuntimeBySceneId.delete(this.options.sceneId);
    }
    this.panel?.dispose();
    this.panel = null;
    this.recorder.dispose();
  }

  getSettings(): TSettings {
    return this.settings;
  }

  recordDraft(paths: readonly string[], options: { markDirty?: boolean } = {}): void {
    this.recordAnimationChange(paths);

    if (this.recorder.isPreviewing()) {
      this.sync();
      return;
    }

    this.copyPaths(this.settings, this.draftSettings, paths);
    this.refreshDirty(options.markDirty ?? true);
  }

  recordAnimationChange(paths: readonly string[]): void {
    this.recorder.recordRealtime(paths);
  }

  updatePlayback(deltaSeconds: number): void {
    this.recorder.update(deltaSeconds);
  }

  getTimelineDuration(): number {
    return this.recorder.getTimelineDuration();
  }

  setTimelineTime(timeSeconds: number): void {
    this.recorder.setTimelineTime(timeSeconds);
  }

  isPlaying(): boolean {
    return this.recorder.isPlaying();
  }

  isPreviewing(): boolean {
    return this.recorder.isPreviewing();
  }

  setDirty(dirty: boolean): void {
    if (dirty) {
      this.setDirtyInternal(true);
    } else {
      this.refreshDirty(false);
    }
  }

  isDirty(): boolean {
    return this.dirty;
  }

  setStatus(text: string): void {
    this.panel?.setStatus(text);
  }

  sync(): void {
    this.syncParameterPanel();
    this.recorder.syncPanel();
  }

  update(
    path: string,
    value: SceneParameterValue,
    options: { recordAnimation?: boolean; recordDraft?: boolean; markDirty?: boolean } = {},
  ): boolean {
    const result = this.options.applyParameter(this.settings, path, value);
    if (!result.applied) return false;

    this.options.onSettingsChange?.(this.settings);
    if (options.recordAnimation ?? true) {
      this.recordAnimationChange([path]);
    }

    const recordDraft = (options.recordDraft ?? true) && !this.recorder.isPreviewing();
    const markDirty = (options.markDirty ?? true) && !this.recorder.isPreviewing();

    if (recordDraft) {
      this.copyPaths(this.settings, this.draftSettings, result.draftPaths ?? this.getDraftPathsForField(path));
    }

    if (markDirty) {
      this.refreshDirty(true);
    } else {
      this.sync();
    }

    return true;
  }

  async save(): Promise<void> {
    if (this.recorder.isPreviewing()) {
      this.setStatus('Exit animation preview before saving');
      return;
    }

    if (!this.hasAnyUnsavedChanges()) {
      this.setStatus('No scene changes to save');
      return;
    }

    try {
      await this.options.sceneStore.save(this.draftSettings);
      this.baseSettings = cloneParameterObject(this.draftSettings);
      this.refreshDirty(false);
      this.setStatus('Saved scene JSON');
    } catch (error) {
      console.warn('Failed to save scene config.', error);
      this.setStatus('Save failed');
    }
  }

  private async saveGroup(groupId: string): Promise<void> {
    if (this.recorder.isPreviewing()) {
      this.setStatus('Exit animation preview before saving');
      return;
    }

    const group = this.groupById.get(groupId);
    if (!group) return;

    const paths = this.getGroupDraftPaths(groupId);
    if (!this.hasUnsavedPathChanges(paths)) {
      this.setStatus('No group changes to save');
      return;
    }

    const nextBase = cloneParameterObject(this.baseSettings);
    this.copyPaths(this.draftSettings, nextBase, paths);

    try {
      await this.options.sceneStore.save(nextBase);
      this.baseSettings = nextBase;
      this.refreshDirty(false);
      this.setStatus(`Saved ${group.title}`);
    } catch (error) {
      console.warn(`Failed to save ${group.title}.`, error);
      this.setStatus('Save failed');
    }
  }

  private syncParameterPanel(): void {
    this.panel?.sync({
      panelCollapsed: this.editorSettings.parameterPanel.collapsed,
      sections: this.createSections(),
    });
    this.panel?.setUnsaved(this.hasAnyUnsavedChanges());
    this.panel?.setSaveDisabled(
      this.recorder.isPreviewing(),
      this.recorder.isPreviewing() ? 'Exit animation preview before saving' : '',
    );
    this.options.onPanelSync?.();
  }

  private createSections(): SceneParameterSection[] {
    return this.options.groups.map((group) => {
      const paths = this.getGroupDraftPaths(group.id);
      const hasChanges = this.hasUnsavedPathChanges(paths);

      return {
        id: group.id,
        title: group.title,
        collapsed: this.editorSettings.parameterPanel.sectionsCollapsed[group.id] ?? group.defaultCollapsed ?? false,
        saveAction: {
          visible: hasChanges,
          disabled: this.recorder.isPreviewing(),
          title: this.recorder.isPreviewing()
            ? 'Exit animation preview before saving'
            : `Save ${group.title}`,
        },
        copyAction: {
          title: `Copy ${group.title}`,
        },
        pasteAction: {
          title: `Paste ${group.title}`,
        },
        fields: this.options.fields
          .filter((field) => field.group === group.id && field.visible !== false)
          .map((field) => this.createField(field)),
      };
    });
  }

  private createField(field: ParameterFieldSchema): SceneParameterField {
    const value = getParameterValue(this.settings, field.path);
    const keyAction = field.animatable
      ? this.recorder.createParameterKeyAction(field.path)
      : undefined;

    if (field.type === 'number') {
      return {
        type: 'number',
        key: field.path,
        label: field.label,
        value: typeof value === 'number' ? roundParameterValue(value) : 0,
        min: field.min,
        max: field.max,
        step: field.step,
        keyAction,
      };
    }

    if (field.type === 'range') {
      return {
        type: 'range',
        key: field.path,
        label: field.label,
        value: typeof value === 'number' ? roundParameterValue(value) : 0,
        min: field.min ?? 0,
        max: field.max ?? 1,
        step: field.step,
        keyAction,
      };
    }

    if (field.type === 'color') {
      return {
        type: 'color',
        key: field.path,
        label: field.label,
        value: typeof value === 'string' && isHexColor(value) ? value : '#ffffff',
        keyAction,
      };
    }

    if (field.type === 'checkbox') {
      return {
        type: 'checkbox',
        key: field.path,
        label: field.label,
        value: typeof value === 'boolean' ? value : false,
        keyAction,
      };
    }

    return {
      type: 'select',
      key: field.path,
      label: field.label,
      value: typeof value === 'string' ? value : field.options?.[0] ?? '',
      options: field.options ?? [],
      keyAction,
    };
  }

  private applyClipAtTime(clip: AnimationClip, timeSeconds: number, options?: AnimationClipPreviewOptions): void {
    const clipBaseSettings = options?.timelineBase
      ? sampleTimelineInto(
        this.baseSettings,
        options.timelineBase.library,
        options.timelineBase.composition,
        options.timelineBase.timeSeconds,
      )
      : this.baseSettings;
    const sampledSettings = sampleClipInto(clipBaseSettings, clip, timeSeconds);
    this.applyAnimationSnapshot(sampledSettings);
  }

  private applyTimelineAtTime(
    library: AnimationClipLibrary,
    composition: TimelineComposition,
    timeSeconds: number,
  ): void {
    const sampledSettings = sampleTimelineInto(this.baseSettings, library, composition, timeSeconds);
    this.applyAnimationSnapshot(sampledSettings);
  }

  private applyAnimationSnapshot(sampledSettings: TSettings): void {
    const wasDirty = this.dirty;

    for (const path of this.animatablePaths) {
      const value = getParameterValue(sampledSettings, path);
      if (value === undefined) continue;

      const currentValue = getParameterValue(this.settings, path);
      if (this.areValuesEqual(currentValue, value)) continue;

      this.update(path, value, { recordAnimation: false, recordDraft: false, markDirty: false });
    }

    this.dirty = wasDirty;
    this.sync();
  }

  private handlePreviewChange(previewing: boolean): void {
    if (!previewing) {
      this.settings = cloneParameterObject(this.baseSettings);
      this.options.onSettingsChange?.(this.settings);
      this.options.afterPreviewRestore?.();
    }
    this.syncParameterPanel();
  }

  private async copyGroup(groupId: string): Promise<void> {
    const group = this.groupById.get(groupId);
    if (!group) return;

    const values: Record<string, SceneParameterValue> = {};
    for (const field of this.getGroupFields(groupId)) {
      const value = getParameterValue(this.settings, field.path);
      if (value !== undefined) {
        values[field.path] = value;
      }
    }

    if (Object.keys(values).length === 0) {
      this.setStatus('No group parameters to copy');
      return;
    }

    const payload: ParameterGroupClipboard = {
      kind: 'free-web-animation.scene-parameter-group',
      version: 1,
      groupId,
      values,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      this.setStatus(`Copied ${group.title}`);
    } catch (error) {
      console.warn(`Failed to copy ${group.title}.`, error);
      this.setStatus('Copy failed');
    }
  }

  private async pasteGroup(groupId: string): Promise<void> {
    const group = this.groupById.get(groupId);
    if (!group) return;

    let rawText = '';
    try {
      rawText = await navigator.clipboard.readText();
    } catch (error) {
      console.warn(`Failed to read ${group.title} from clipboard.`, error);
      this.setStatus('Paste failed');
      return;
    }

    let payload: ParameterGroupClipboard;
    try {
      payload = parseParameterGroupClipboard(rawText);
    } catch (error) {
      console.warn('Invalid parameter group clipboard payload.', error);
      this.setStatus('Clipboard is not a parameter group');
      return;
    }

    const expectedPaths = this.getGroupFields(groupId).map((field) => field.path).sort();
    const actualPaths = Object.keys(payload.values).sort();
    if (!areStringArraysEqual(expectedPaths, actualPaths)) {
      this.setStatus('Parameter names do not match');
      return;
    }

    const fields = this.getGroupFields(groupId);
    const normalizedValues = new Map<string, SceneParameterValue>();
    for (const field of fields) {
      const normalizedValue = normalizeClipboardParameterValue(field, payload.values[field.path]);
      if (normalizedValue === undefined) {
        this.setStatus('Parameter values do not match');
        return;
      }
      normalizedValues.set(field.path, normalizedValue);
    }

    let applied = false;
    for (const field of fields) {
      const value = normalizedValues.get(field.path);
      if (value === undefined) continue;

      if (!this.update(field.path, value)) {
        this.setStatus('Paste rejected by scene');
        return;
      }

      applied = true;
    }

    if (!applied) {
      this.setStatus('No group parameters pasted');
      return;
    }

    this.setStatus(`Pasted ${group.title}`);
  }

  private refreshDirty(notify = true): void {
    this.setDirtyInternal(this.hasAnyUnsavedChanges(), notify);
  }

  private setDirtyInternal(dirty: boolean, notify = true): void {
    if (this.dirty !== dirty) {
      this.dirty = dirty;
      if (notify) {
        this.options.onDirtyChange?.(dirty);
      }
    }
    this.sync();
  }

  private hasAnyUnsavedChanges(): boolean {
    const allPaths = new Set<string>();
    for (const group of this.options.groups) {
      for (const path of this.getGroupDraftPaths(group.id)) {
        allPaths.add(path);
      }
    }
    return this.hasUnsavedPathChanges(Array.from(allPaths));
  }

  private hasUnsavedPathChanges(paths: readonly string[]): boolean {
    return paths.some((path) => {
      const baseValue = getParameterValue(this.baseSettings, path);
      const draftValue = getParameterValue(this.draftSettings, path);
      return !this.areValuesEqual(baseValue, draftValue, this.fieldByDraftPath.get(path));
    });
  }

  private areValuesEqual(left: unknown, right: unknown, field?: ParameterFieldSchema): boolean {
    if (field?.type === 'number' || field?.type === 'range') {
      return typeof left === 'number'
        && typeof right === 'number'
        && Number.isFinite(left)
        && Number.isFinite(right)
        && Math.abs(left - right) <= 0.000001;
    }

    if (field?.type === 'checkbox') {
      return typeof left === 'boolean' && typeof right === 'boolean' && left === right;
    }

    if (field?.type === 'color' || field?.type === 'select') {
      return typeof left === 'string' && typeof right === 'string' && left === right;
    }

    if (typeof left === 'number' || typeof right === 'number') {
      return typeof left === 'number'
        && typeof right === 'number'
        && Number.isFinite(left)
        && Number.isFinite(right)
        && Math.abs(left - right) <= 0.000001;
    }

    return left === right;
  }

  private getGroupDraftPaths(groupId: string): string[] {
    const paths = new Set<string>();

    for (const field of this.options.fields) {
      if (field.group !== groupId) continue;
      for (const path of this.getDraftPathsForField(field.path)) {
        paths.add(path);
      }
    }

    return Array.from(paths);
  }

  private getGroupFields(groupId: string): ParameterFieldSchema[] {
    return this.options.fields
      .filter((field) => field.group === groupId);
  }

  private getDraftPathsForField(path: string): readonly string[] {
    return this.fieldByPath.get(path)?.draftPaths ?? [path];
  }

  private copyPaths(source: TSettings, target: TSettings, paths: readonly string[]): void {
    for (const path of paths) {
      const value = getParameterValue(source, path);
      if (value !== undefined) {
        setParameterValue(target, path, value);
      }
    }
  }
}

function parseParameterGroupClipboard(rawText: string): ParameterGroupClipboard {
  const value = JSON.parse(rawText) as Partial<ParameterGroupClipboard>;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Clipboard payload must be an object.');
  }
  if (value.kind !== 'free-web-animation.scene-parameter-group' || value.version !== 1) {
    throw new Error('Clipboard payload is not a supported parameter group.');
  }
  if (typeof value.groupId !== 'string' || value.groupId.length === 0) {
    throw new Error('Clipboard payload is missing a group id.');
  }
  if (!isParameterValueRecord(value.values)) {
    throw new Error('Clipboard payload contains invalid values.');
  }

  return {
    kind: value.kind,
    version: value.version,
    groupId: value.groupId,
    values: value.values,
  };
}

function isParameterValueRecord(value: unknown): value is Record<string, SceneParameterValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.entries(value).every(([path, item]) => (
    typeof path === 'string'
    && path.length > 0
    && (
      typeof item === 'number' && Number.isFinite(item)
      || typeof item === 'string'
      || typeof item === 'boolean'
    )
  ));
}

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}

function normalizeClipboardParameterValue(
  field: ParameterFieldSchema,
  value: SceneParameterValue,
): SceneParameterValue | undefined {
  if (field.visible === false && field.type === 'select' && typeof value === 'string') {
    return value;
  }

  return normalizeParameterValue(field, value);
}

const exportRuntimeBySceneId = new Map<string, SceneParameterRuntime<object>>();

export function getExportSceneParameterRuntime(sceneId: string): SceneParameterRuntime<object> | null {
  return exportRuntimeBySceneId.get(sceneId) ?? null;
}

export function createParameterEditorSettings(groups: readonly ParameterGroupSchema[]): ParameterEditorSettings {
  return {
    version: 1,
    parameterPanel: {
      collapsed: false,
      sectionsCollapsed: Object.fromEntries(
        groups.map((group) => [group.id, group.defaultCollapsed ?? false]),
      ),
    },
  };
}

export function mergeParameterEditorSettings(
  base: ParameterEditorSettings,
  override: Partial<ParameterEditorSettings>,
  groups: readonly ParameterGroupSchema[],
): ParameterEditorSettings {
  const sectionsCollapsed: Record<string, boolean> = {};

  for (const group of groups) {
    sectionsCollapsed[group.id] = override.parameterPanel?.sectionsCollapsed?.[group.id]
      ?? base.parameterPanel.sectionsCollapsed[group.id]
      ?? group.defaultCollapsed
      ?? false;
  }

  return {
    version: override.version ?? base.version,
    parameterPanel: {
      collapsed: override.parameterPanel?.collapsed ?? base.parameterPanel.collapsed,
      sectionsCollapsed,
    },
  };
}

export function normalizeParameterValue(
  field: ParameterFieldSchema,
  value: SceneParameterValue,
): SceneParameterValue | undefined {
  if (field.type === 'number' || field.type === 'range') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return field.clamp ? clampNumber(value, field.min, field.max) : value;
  }

  if (field.type === 'color') {
    return typeof value === 'string' && isHexColor(value) ? value : undefined;
  }

  if (field.type === 'checkbox') {
    return typeof value === 'boolean' ? value : undefined;
  }

  if (field.type === 'select') {
    return typeof value === 'string' && field.options?.includes(value) ? value : undefined;
  }

  return undefined;
}

function clampNumber(value: number, min: number | undefined, max: number | undefined): number {
  let nextValue = value;
  if (min !== undefined) {
    nextValue = Math.max(min, nextValue);
  }
  if (max !== undefined) {
    nextValue = Math.min(max, nextValue);
  }
  return nextValue;
}

function roundParameterValue(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
