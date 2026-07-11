import {
  getParameterValue,
  setParameterValue,
  cloneParameterObject,
} from '../animation/ParameterPath';
import type {
  SceneParameterField,
  SceneParameterSection,
  SceneParameterValue,
} from '../SceneParameterPanel';
import { SceneParameterPanel } from '../SceneParameterPanel';
import type {
  GlobalParameterHandle,
  GlobalParameterListener,
} from '../Page';
import type {
  ParameterApplyResult,
  ParameterFieldSchema,
  ParameterGroupSchema,
} from './SceneParameterRuntime';

export type GlobalParameterSettingsStore<TSettings extends object> = {
  load: () => Promise<TSettings>;
  save: (settings: TSettings) => Promise<void>;
};

export type GlobalParameterRuntimeOptions<TSettings extends object> = {
  title: string;
  groups: readonly ParameterGroupSchema[];
  fields: readonly ParameterFieldSchema[];
  createFallbackSettings: () => TSettings;
  store: GlobalParameterSettingsStore<TSettings>;
  applyParameter: (settings: TSettings, path: string, value: SceneParameterValue) => ParameterApplyResult;
  panelCollapsed?: boolean;
  helpText?: string;
};

export class GlobalParameterRuntime<TSettings extends object> implements GlobalParameterHandle<TSettings> {
  private readonly options: GlobalParameterRuntimeOptions<TSettings>;
  private readonly listeners = new Set<GlobalParameterListener<TSettings>>();
  private readonly panelState: {
    collapsed: boolean;
    sectionsCollapsed: Record<string, boolean>;
  };
  private panel: SceneParameterPanel | null = null;
  private baseSettings: TSettings;
  private draftSettings: TSettings;
  private settings: TSettings;

  constructor(options: GlobalParameterRuntimeOptions<TSettings>) {
    this.options = options;
    this.panelState = {
      collapsed: options.panelCollapsed ?? true,
      sectionsCollapsed: Object.fromEntries(
        options.groups.map((group) => [group.id, group.defaultCollapsed ?? false]),
      ),
    };
    this.baseSettings = options.createFallbackSettings();
    this.draftSettings = cloneParameterObject(this.baseSettings);
    this.settings = cloneParameterObject(this.baseSettings);
  }

  async load(): Promise<void> {
    this.baseSettings = await this.options.store.load();
    this.draftSettings = cloneParameterObject(this.baseSettings);
    this.settings = cloneParameterObject(this.baseSettings);
    this.notify();
    this.sync();
  }

  mount(parent: HTMLElement): void {
    this.panel = new SceneParameterPanel({
      parent,
      title: this.options.title,
      panelCollapsed: this.panelState.collapsed,
      sections: this.createSections(),
      helpText: this.options.helpText,
      onChange: (path, value) => this.update(path, value),
      onPanelCollapsedChange: (collapsed) => {
        this.panelState.collapsed = collapsed;
        this.sync();
      },
      onSectionCollapsedChange: (sectionId, collapsed) => {
        this.panelState.sectionsCollapsed[sectionId] = collapsed;
        this.sync();
      },
      onSave: () => this.save(),
    });
    this.sync();
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = null;
    this.listeners.clear();
  }

  getSettings(): TSettings {
    return this.settings;
  }

  subscribe(listener: GlobalParameterListener<TSettings>): () => void {
    this.listeners.add(listener);
    listener(this.settings);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(path: string, value: SceneParameterValue): void {
    const result = this.options.applyParameter(this.settings, path, value);
    if (!result.applied) return;

    this.copyPaths(this.settings, this.draftSettings, result.draftPaths ?? [path]);
    this.notify();
    this.sync();
  }

  private async save(): Promise<void> {
    if (!this.hasUnsavedChanges()) {
      this.panel?.setStatus('No global changes to save');
      return;
    }

    try {
      await this.options.store.save(this.draftSettings);
      this.baseSettings = cloneParameterObject(this.draftSettings);
      this.sync();
      this.panel?.setStatus('Saved global JSON');
    } catch (error) {
      console.warn('Failed to save global settings.', error);
      this.panel?.setStatus('Save failed');
    }
  }

  private sync(): void {
    this.panel?.sync({
      panelCollapsed: this.panelState.collapsed,
      sections: this.createSections(),
    });
    this.panel?.setUnsaved(this.hasUnsavedChanges());
    this.panel?.setSaveDisabled(false);
  }

  private createSections(): SceneParameterSection[] {
    return this.options.groups.map((group) => ({
      id: group.id,
      title: group.title,
      collapsed: this.panelState.sectionsCollapsed[group.id] ?? group.defaultCollapsed ?? false,
      saveAction: {
        visible: this.hasUnsavedPathChanges(this.getGroupPaths(group.id)),
        disabled: false,
        title: `Save ${group.title}`,
      },
      fields: this.options.fields
        .filter((field) => field.group === group.id)
        .map((field) => this.createField(field)),
    }));
  }

  private createField(field: ParameterFieldSchema): SceneParameterField {
    const value = getParameterValue(this.settings, field.path);

    if (field.type === 'number') {
      return {
        type: 'number',
        key: field.path,
        label: field.label,
        value: typeof value === 'number' ? roundParameterValue(value) : 0,
        min: field.min,
        max: field.max,
        step: field.step,
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
      };
    }

    if (field.type === 'color') {
      return {
        type: 'color',
        key: field.path,
        label: field.label,
        value: typeof value === 'string' && isHexColor(value) ? value : '#ffffff',
      };
    }

    if (field.type === 'checkbox') {
      return {
        type: 'checkbox',
        key: field.path,
        label: field.label,
        value: typeof value === 'boolean' ? value : false,
      };
    }

    return {
      type: 'select',
      key: field.path,
      label: field.label,
      value: typeof value === 'string' ? value : field.options?.[0] ?? '',
      options: field.options ?? [],
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.settings);
    }
  }

  private hasUnsavedChanges(): boolean {
    return this.hasUnsavedPathChanges(this.options.fields.flatMap((field) => field.draftPaths ?? [field.path]));
  }

  private hasUnsavedPathChanges(paths: readonly string[]): boolean {
    return paths.some((path) => {
      const baseValue = getParameterValue(this.baseSettings, path);
      const draftValue = getParameterValue(this.draftSettings, path);
      return !areValuesEqual(baseValue, draftValue);
    });
  }

  private getGroupPaths(groupId: string): string[] {
    const paths = new Set<string>();

    for (const field of this.options.fields) {
      if (field.group !== groupId) continue;
      for (const path of field.draftPaths ?? [field.path]) {
        paths.add(path);
      }
    }

    return Array.from(paths);
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

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (typeof left === 'number' || typeof right === 'number') {
    return typeof left === 'number'
      && typeof right === 'number'
      && Number.isFinite(left)
      && Number.isFinite(right)
      && Math.abs(left - right) <= 0.000001;
  }

  return left === right;
}

function roundParameterValue(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
