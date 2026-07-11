export type SceneParameterValue = number | string | boolean;

export type SceneParameterKeyAction = {
  active: boolean;
  disabled?: boolean;
  title?: string;
};

type SceneParameterFieldBase = {
  key: string;
  label: string;
  keyAction?: SceneParameterKeyAction;
};

export type SceneParameterField =
  | (SceneParameterFieldBase & {
    type: 'number';
    value: number;
    min?: number;
    max?: number;
    step?: number;
  })
  | (SceneParameterFieldBase & {
    type: 'color';
    value: string;
  })
  | (SceneParameterFieldBase & {
    type: 'checkbox';
    value: boolean;
  })
  | (SceneParameterFieldBase & {
    type: 'range';
    value: number;
    min: number;
    max: number;
    step?: number;
  })
  | (SceneParameterFieldBase & {
    type: 'select';
    value: string;
    options: readonly string[];
  });

export type SceneParameterSection = {
  id: string;
  title: string;
  collapsed: boolean;
  copyAction?: {
    disabled?: boolean;
    title?: string;
  };
  pasteAction?: {
    disabled?: boolean;
    title?: string;
  };
  saveAction?: {
    visible: boolean;
    disabled?: boolean;
    title?: string;
  };
  fields: SceneParameterField[];
};

export type SceneParameterPanelOptions = {
  parent: HTMLElement;
  title: string;
  panelCollapsed: boolean;
  sections: SceneParameterSection[];
  helpText?: string;
  onChange: (key: string, value: SceneParameterValue) => void;
  onPanelCollapsedChange: (collapsed: boolean) => void;
  onSectionCollapsedChange: (sectionId: string, collapsed: boolean) => void;
  onSectionCopy?: (sectionId: string) => void | Promise<void>;
  onSectionPaste?: (sectionId: string) => void | Promise<void>;
  onSectionSave?: (sectionId: string) => void;
  onKeyAction?: (key: string) => void;
  onSave: () => void | Promise<void>;
};

type NumberInputBinding = {
  input: HTMLInputElement;
  step: number;
};

type DragState = {
  pointerId: number;
  key: string;
  startX: number;
  startValue: number;
  step: number;
};

let nextPanelControlId = 0;

export class SceneParameterPanel {
  readonly element: HTMLDivElement;
  private readonly controlIdPrefix = `scene-param-${nextPanelControlId++}`;
  private readonly numberInputs = new Map<string, NumberInputBinding>();
  private readonly valueInputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  private readonly keyButtons = new Map<string, HTMLButtonElement>();
  private readonly sectionElements = new Map<string, HTMLElement>();
  private readonly sectionHeaders = new Map<string, HTMLElement>();
  private readonly sectionButtons = new Map<string, HTMLButtonElement>();
  private readonly sectionCopyButtons = new Map<string, HTMLButtonElement>();
  private readonly sectionPasteButtons = new Map<string, HTMLButtonElement>();
  private readonly sectionSaveButtons = new Map<string, HTMLButtonElement>();
  private readonly saveButton: HTMLButtonElement;
  private readonly statusText: HTMLDivElement;
  private readonly onChange: (key: string, value: SceneParameterValue) => void;
  private readonly onPanelCollapsedChange: (collapsed: boolean) => void;
  private readonly onSectionCollapsedChange: (sectionId: string, collapsed: boolean) => void;
  private readonly onSectionCopy?: (sectionId: string) => void | Promise<void>;
  private readonly onSectionPaste?: (sectionId: string) => void | Promise<void>;
  private readonly onSectionSave?: (sectionId: string) => void;
  private readonly onKeyAction?: (key: string) => void;
  private dragState: DragState | null = null;

  constructor(options: SceneParameterPanelOptions) {
    this.onChange = options.onChange;
    this.onPanelCollapsedChange = options.onPanelCollapsedChange;
    this.onSectionCollapsedChange = options.onSectionCollapsedChange;
    this.onSectionCopy = options.onSectionCopy;
    this.onSectionPaste = options.onSectionPaste;
    this.onSectionSave = options.onSectionSave;
    this.onKeyAction = options.onKeyAction;

    this.element = document.createElement('div');
    this.element.className = 'scene-params-panel';
    options.parent.append(this.element);

    const toggle = document.createElement('button');
    toggle.className = 'scene-params-toggle';
    toggle.type = 'button';
    toggle.textContent = options.title;
    toggle.addEventListener('click', () => this.setPanelCollapsed(!this.element.classList.contains('is-collapsed')));
    this.element.append(toggle);

    const body = document.createElement('div');
    body.className = 'scene-params-body';
    this.element.append(body);

    for (const section of options.sections) {
      body.append(this.createSection(section));
    }

    if (options.helpText) {
      const help = document.createElement('div');
      help.className = 'scene-params-help';
      help.textContent = options.helpText;
      body.append(help);
    }

    const actions = document.createElement('div');
    actions.className = 'scene-params-actions';
    this.saveButton = this.createActionButton('保存', options.onSave);
    actions.append(this.saveButton);
    body.append(actions);

    this.statusText = document.createElement('div');
    this.statusText.className = 'scene-params-status';
    body.append(this.statusText);

    this.setPanelCollapsed(options.panelCollapsed, false);
    this.sync(options);
  }

  dispose(): void {
    this.stopDrag();
    this.element.remove();
    this.numberInputs.clear();
    this.valueInputs.clear();
    this.keyButtons.clear();
    this.sectionElements.clear();
    this.sectionHeaders.clear();
    this.sectionButtons.clear();
    this.sectionCopyButtons.clear();
    this.sectionPasteButtons.clear();
    this.sectionSaveButtons.clear();
  }

  sync(options: { panelCollapsed: boolean; sections: SceneParameterSection[] }): void {
    this.setPanelCollapsed(options.panelCollapsed, false);

    for (const section of options.sections) {
      this.setSectionCollapsed(section.id, section.collapsed, false);
      this.syncSectionSaveButton(section);
      this.syncSectionTransferButtons(section);

      for (const field of section.fields) {
        this.syncField(field);
      }
    }
  }

  setStatus(text: string): void {
    this.statusText.textContent = text;
    window.setTimeout(() => {
      if (this.statusText.textContent === text) {
        this.statusText.textContent = '';
      }
    }, 1600);
  }

  setUnsaved(unsaved: boolean): void {
    this.saveButton.textContent = unsaved ? '保存*' : '保存';
    this.saveButton.classList.toggle('has-unsaved-changes', unsaved);
  }

  setSaveDisabled(disabled: boolean, title = ''): void {
    this.saveButton.disabled = disabled;
    this.saveButton.title = title;
  }

  private createSection(section: SceneParameterSection): HTMLElement {
    const element = document.createElement('section');
    element.className = 'scene-params-section';
    element.dataset.parameterSection = section.id;
    this.sectionElements.set(section.id, element);

    const header = document.createElement('div');
    header.className = 'scene-params-section-header';
    this.sectionHeaders.set(section.id, header);

    const saveButton = document.createElement('button');
    saveButton.className = 'scene-params-section-save';
    saveButton.type = 'button';
    saveButton.textContent = '💾';
    saveButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onSectionSave?.(section.id);
    });
    header.append(saveButton);
    this.sectionSaveButtons.set(section.id, saveButton);

    const copyButton = document.createElement('button');
    copyButton.className = 'scene-params-section-tool';
    copyButton.type = 'button';
    copyButton.textContent = '📋';
    copyButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.onSectionCopy?.(section.id);
    });
    header.append(copyButton);
    this.sectionCopyButtons.set(section.id, copyButton);

    const pasteButton = document.createElement('button');
    pasteButton.className = 'scene-params-section-tool';
    pasteButton.type = 'button';
    pasteButton.textContent = '📥';
    pasteButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.onSectionPaste?.(section.id);
    });
    header.append(pasteButton);
    this.sectionPasteButtons.set(section.id, pasteButton);

    const toggle = document.createElement('button');
    toggle.className = 'scene-params-section-toggle';
    toggle.type = 'button';
    toggle.addEventListener('click', () => this.setSectionCollapsed(section.id, !element.classList.contains('is-collapsed')));

    const title = document.createElement('span');
    title.textContent = section.title;
    const marker = document.createElement('span');
    marker.className = 'scene-params-section-marker';
    marker.textContent = 'v';
    toggle.append(title, marker);
    header.append(toggle);

    const body = document.createElement('div');
    body.className = 'scene-params-section-body';

    const gridFields = section.fields.filter((field) => field.type === 'number' || field.type === 'color');
    const fullFields = section.fields.filter((field) => field.type === 'checkbox' || field.type === 'select' || field.type === 'range');

    for (const field of fullFields) {
      body.append(this.createField(field));
    }

    if (gridFields.length > 0) {
      const grid = document.createElement('div');
      grid.className = 'scene-params-grid';
      for (const field of gridFields) {
        grid.append(this.createField(field));
      }
      body.append(grid);
    }

    element.append(header, body);
    this.sectionButtons.set(section.id, toggle);
    this.setSectionCollapsed(section.id, section.collapsed, false);
    this.syncSectionSaveButton(section);
    this.syncSectionTransferButtons(section);
    return element;
  }

  private createField(field: SceneParameterField): HTMLElement {
    if (field.type === 'checkbox') {
      const label = document.createElement('label');
      label.className = 'scene-params-checkbox';

      const input = document.createElement('input');
      input.id = this.createControlId(field.key);
      input.type = 'checkbox';
      input.checked = field.value;
      input.addEventListener('change', () => this.onChange(field.key, input.checked));
      this.valueInputs.set(field.key, input);

      const text = document.createElement('span');
      text.textContent = field.label;
      label.htmlFor = input.id;
      label.append(input, text);
      this.appendKeyButton(label, field);
      return label;
    }

    if (field.type === 'select') {
      const label = document.createElement('label');
      label.className = 'scene-params-select-label';

      const text = document.createElement('span');
      text.textContent = field.label;
      const header = this.createFieldHeader(field, text);
      const select = document.createElement('select');
      select.id = this.createControlId(field.key);
      for (const option of field.options) {
        const item = document.createElement('option');
        item.value = option;
        item.textContent = option;
        select.append(item);
      }
      select.value = field.value;
      select.addEventListener('change', () => this.onChange(field.key, select.value));
      this.valueInputs.set(field.key, select);

      label.htmlFor = select.id;
      label.append(header, select);
      return label;
    }

    if (field.type === 'range') {
      const label = document.createElement('label');
      label.className = 'scene-params-range-label';

      const top = document.createElement('span');
      top.className = 'scene-params-range-top';
      const text = document.createElement('span');
      text.textContent = field.label;
      const valueText = document.createElement('span');
      valueText.textContent = String(field.value);
      top.append(text, valueText);
      this.appendKeyButton(top, field);

      const input = document.createElement('input');
      input.id = this.createControlId(field.key);
      input.type = 'range';
      input.min = String(field.min);
      input.max = String(field.max);
      input.step = String(field.step ?? 0.01);
      input.value = String(field.value);
      input.addEventListener('input', () => {
        valueText.textContent = input.value;
        this.onChange(field.key, input.valueAsNumber);
      });
      this.valueInputs.set(field.key, input);

      label.htmlFor = input.id;
      label.append(top, input);
      return label;
    }

    const label = document.createElement('label');
    const text = document.createElement('span');
    text.textContent = field.label;

    const input = document.createElement('input');
    input.id = this.createControlId(field.key);
    input.dataset.parameterKey = field.key;

    if (field.type === 'color') {
      input.type = 'color';
      input.value = field.value;
      input.addEventListener('input', () => this.onChange(field.key, input.value));
      this.valueInputs.set(field.key, input);
    } else {
      const step = field.step ?? 0.1;
      text.className = 'scene-params-drag-label';
      text.addEventListener('pointerdown', (event) => this.startNumberDrag(event, field.key, step));

      input.type = 'number';
      input.step = String(step);
      if (field.min !== undefined) {
        input.min = String(field.min);
      }
      if (field.max !== undefined) {
        input.max = String(field.max);
      }
      input.value = String(field.value);
      input.addEventListener('input', () => this.onChange(field.key, input.valueAsNumber));
      input.addEventListener('blur', () => this.onChange(field.key, input.valueAsNumber));
      this.numberInputs.set(field.key, { input, step });
      this.valueInputs.set(field.key, input);
    }

    label.htmlFor = input.id;
    label.append(this.createFieldHeader(field, text), input);
    return label;
  }

  private createFieldHeader(field: SceneParameterField, text: HTMLSpanElement): HTMLSpanElement {
    const header = document.createElement('span');
    header.className = 'scene-params-field-header';
    header.append(text);
    this.appendKeyButton(header, field);
    return header;
  }

  private appendKeyButton(parent: HTMLElement, field: SceneParameterField): void {
    if (!field.keyAction) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scene-params-key-button';
    button.setAttribute('aria-label', field.keyAction.active ? `Delete key: ${field.label}` : `Add key: ${field.label}`);
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onKeyAction?.(field.key);
    });
    this.keyButtons.set(field.key, button);
    this.syncKeyButton(field);
    parent.append(button);
  }

  private createActionButton(label: string, onClick: () => void | Promise<void>): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      void onClick();
    });
    return button;
  }

  private createControlId(key: string): string {
    return `${this.controlIdPrefix}-${key.replace(/[^a-z0-9_-]+/gi, '-')}`;
  }

  private setPanelCollapsed(collapsed: boolean, notify = true): void {
    this.element.classList.toggle('is-collapsed', collapsed);

    if (notify) {
      this.onPanelCollapsedChange(collapsed);
    }
  }

  private setSectionCollapsed(sectionId: string, collapsed: boolean, notify = true): void {
    const element = this.sectionElements.get(sectionId);
    const button = this.sectionButtons.get(sectionId);
    if (!element || !button) return;

    element.classList.toggle('is-collapsed', collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));

    if (notify) {
      this.onSectionCollapsedChange(sectionId, collapsed);
    }
  }

  private syncSectionSaveButton(section: SceneParameterSection): void {
    const header = this.sectionHeaders.get(section.id);
    const button = this.sectionSaveButtons.get(section.id);
    if (!header || !button) return;

    const visible = section.saveAction?.visible ?? false;
    header.classList.toggle('has-section-save', visible);
    button.hidden = !visible;
    button.disabled = section.saveAction?.disabled ?? false;
    button.title = section.saveAction?.title ?? 'Save this group';
  }

  private syncSectionTransferButtons(section: SceneParameterSection): void {
    const copyButton = this.sectionCopyButtons.get(section.id);
    const pasteButton = this.sectionPasteButtons.get(section.id);

    if (copyButton) {
      copyButton.disabled = (section.copyAction?.disabled ?? false) || !this.onSectionCopy;
      copyButton.title = section.copyAction?.title ?? `Copy ${section.title}`;
      copyButton.setAttribute('aria-label', `Copy ${section.title}`);
    }

    if (pasteButton) {
      pasteButton.disabled = (section.pasteAction?.disabled ?? false) || !this.onSectionPaste;
      pasteButton.title = section.pasteAction?.title ?? `Paste ${section.title}`;
      pasteButton.setAttribute('aria-label', `Paste ${section.title}`);
    }
  }

  private syncField(field: SceneParameterField): void {
    this.syncKeyButton(field);

    const control = this.valueInputs.get(field.key);
    if (!control || document.activeElement === control) return;

    if (field.type === 'checkbox' && control instanceof HTMLInputElement) {
      control.checked = field.value;
      return;
    }

    if (field.type === 'range' && control instanceof HTMLInputElement) {
      control.value = String(field.value);
      const valueText = control.closest('.scene-params-range-label')?.querySelector('.scene-params-range-top span:last-child');
      if (valueText) {
        valueText.textContent = String(field.value);
      }
      return;
    }

    control.value = String(field.value);
  }

  private syncKeyButton(field: SceneParameterField): void {
    const button = this.keyButtons.get(field.key);
    if (!button || !field.keyAction) return;

    button.classList.toggle('is-active', field.keyAction.active);
    button.disabled = field.keyAction.disabled ?? false;
    button.title = field.keyAction.title ?? (field.keyAction.active ? 'Delete Key' : 'Add Key');
    button.setAttribute('aria-label', field.keyAction.active ? `Delete key: ${field.label}` : `Add key: ${field.label}`);
  }

  private startNumberDrag(event: PointerEvent, key: string, step: number): void {
    if (event.button !== 0) return;

    const binding = this.numberInputs.get(key);
    if (!binding) return;

    event.preventDefault();
    this.stopDrag();
    this.dragState = {
      pointerId: event.pointerId,
      key,
      startX: event.clientX,
      startValue: binding.input.valueAsNumber,
      step,
    };
    document.body.classList.add('is-parameter-dragging');
    window.addEventListener('pointermove', this.handleDragMove);
    window.addEventListener('pointerup', this.handleDragEnd);
    window.addEventListener('pointercancel', this.handleDragEnd);
  }

  private readonly handleDragMove = (event: PointerEvent): void => {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;

    event.preventDefault();
    const delta = event.clientX - this.dragState.startX;
    const value = this.dragState.startValue + delta * this.dragState.step * 0.1;
    this.onChange(this.dragState.key, value);
  };

  private readonly handleDragEnd = (event: PointerEvent): void => {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;

    this.stopDrag();
  };

  private stopDrag(): void {
    if (!this.dragState) return;

    this.dragState = null;
    document.body.classList.remove('is-parameter-dragging');
    window.removeEventListener('pointermove', this.handleDragMove);
    window.removeEventListener('pointerup', this.handleDragEnd);
    window.removeEventListener('pointercancel', this.handleDragEnd);
  }
}
