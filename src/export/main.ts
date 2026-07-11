import '../style.css';
import {
  type DeckPage,
  type GlobalParameterHandle,
  type GlobalParameterRegistry,
  type PageContext,
} from '../app/Page';
import { getExportSceneParameterRuntime } from '../app/parameters/SceneParameterRuntime';
import {
  PBR_GLOBAL_PARAMETER_ID,
  createPbrGlobalParameterRuntime,
  isPbrGlobalSettingsConsumer,
  type PbrGlobalSettings,
} from '../app/rendering/PbrGlobalSettings';
import { pageRegistry, type PageRegistryEntry } from '../pages';

type ExportSceneManifest = {
  id: string;
  title: string;
  subtitle: string;
  defaultDuration: number;
  defaultFps: number;
  defaultSize: {
    width: number;
    height: number;
  };
  exportable: boolean;
};

type ExportApi = {
  ready: () => Promise<void>;
  listScenes: () => ExportSceneManifest[];
  getScene: () => ExportSceneManifest;
  getDuration: () => number;
  setTime: (seconds: number) => Promise<void>;
};

declare global {
  interface Window {
    __freeWebAnimationExport?: ExportApi;
  }
}

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const FALLBACK_DURATION = 8;
const STABLE_FRAME_COUNT = 12;

class BrowserExportRunner {
  readonly api: ExportApi;
  private readonly root: HTMLDivElement;
  private readonly sceneEntry: PageRegistryEntry;
  private readonly width: number;
  private readonly height: number;
  private readonly renderFrame: HTMLDivElement;
  private readonly pageHost: HTMLDivElement;
  private readonly hiddenToolsHost: HTMLDivElement;
  private readonly pbrGlobalParameters = createPbrGlobalParameterRuntime();
  private readonly globalParameters: GlobalParameterRegistry;
  private page: DeckPage | null = null;
  private lastTime = 0;
  private readyPromise: Promise<void> | null = null;
  private pbrGlobalSettingsDelivered = false;

  constructor(
    root: HTMLDivElement,
    sceneEntry: PageRegistryEntry,
    size: { width: number; height: number },
  ) {
    this.root = root;
    this.sceneEntry = sceneEntry;
    this.width = size.width;
    this.height = size.height;

    this.root.innerHTML = `
      <main class="export-shell">
        <div class="render-frame export-render-frame">
          <div class="page-host"></div>
        </div>
        <div class="export-hidden-tools" aria-hidden="true">
          <div class="export-global-parameter-host"></div>
          <div class="export-parameter-host"></div>
          <div class="export-animation-tab-host"></div>
          <div class="export-animation-host"></div>
          <div class="export-axis-host"></div>
        </div>
      </main>
    `;

    this.renderFrame = this.requireElement('.render-frame', HTMLDivElement);
    this.pageHost = this.requireElement('.page-host', HTMLDivElement);
    this.hiddenToolsHost = this.requireElement('.export-hidden-tools', HTMLDivElement);
    this.renderFrame.style.width = `${this.width}px`;
    this.renderFrame.style.height = `${this.height}px`;
    this.globalParameters = {
      get: <TSettings extends object>(id: string): GlobalParameterHandle<TSettings> | null => {
        if (id !== PBR_GLOBAL_PARAMETER_ID) return null;

        return {
          getSettings: () => this.pbrGlobalParameters.getSettings() as unknown as TSettings,
          subscribe: (listener) => this.pbrGlobalParameters.subscribe((settings: PbrGlobalSettings) => {
            listener(settings as unknown as TSettings);
            this.pbrGlobalSettingsDelivered = true;
          }),
        };
      },
    };

    this.api = {
      ready: () => this.ready(),
      listScenes: () => listExportScenes(),
      getScene: () => createManifest(this.sceneEntry),
      getDuration: () => this.getDuration(),
      setTime: (seconds: number) => this.setTime(seconds),
    };
  }

  async mount(): Promise<void> {
    this.pbrGlobalParameters.mount(this.requireHiddenElement('.export-global-parameter-host'));
    await this.pbrGlobalParameters.load();

    this.page = await this.sceneEntry.load();
    const context: PageContext = {
      host: this.pageHost,
      parameterHost: this.requireHiddenElement('.export-parameter-host'),
      animationHost: this.requireHiddenElement('.export-animation-host'),
      animationTabHost: this.requireHiddenElement('.export-animation-tab-host'),
      axisHost: this.requireHiddenElement('.export-axis-host'),
      globalParameters: this.globalParameters,
    };
    this.page.mount(context);
    if (isPbrGlobalSettingsConsumer(this.page)) {
      this.page.applyPbrGlobalSettings(this.pbrGlobalParameters.getSettings());
      this.pbrGlobalSettingsDelivered = true;
    }
    this.page.resize(this.width, this.height);
    this.readyPromise = this.waitForStableFrame();
    await this.readyPromise;
  }

  async ready(): Promise<void> {
    await (this.readyPromise ?? Promise.resolve());
  }

  getDuration(): number {
    const timelineDuration = getExportSceneParameterRuntime(this.sceneEntry.id)?.getTimelineDuration() ?? 0;
    return timelineDuration > 0 ? timelineDuration : this.sceneEntry.defaultDuration || FALLBACK_DURATION;
  }

  async setTime(seconds: number): Promise<void> {
    await this.ready();
    const nextTime = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const deltaSeconds = Math.max(0, nextTime - this.lastTime);
    this.lastTime = nextTime;
    getExportSceneParameterRuntime(this.sceneEntry.id)?.setTimelineTime(nextTime);
    this.page?.update(nextTime, deltaSeconds);
    await nextAnimationFrame();
    this.page?.update(nextTime, 0);
    await nextAnimationFrame();
  }

  private async waitForStableFrame(): Promise<void> {
    await waitForExportRuntime(this.sceneEntry.id);
    if (this.page && isPbrGlobalSettingsConsumer(this.page)) {
      await this.waitForPbrGlobalSettingsDelivery();
    }
    for (let frame = 0; frame < STABLE_FRAME_COUNT; frame += 1) {
      this.page?.update(0, 0);
      await nextAnimationFrame();
    }
  }

  private async waitForPbrGlobalSettingsDelivery(): Promise<void> {
    const startedAt = performance.now();
    while (!this.pbrGlobalSettingsDelivered) {
      if (performance.now() - startedAt > 5000) {
        throw new Error(`PBR global settings were not applied before export: ${this.sceneEntry.id}`);
      }
      await nextAnimationFrame();
    }
  }

  private requireElement<T extends HTMLElement>(selector: string, elementType: new () => T): T {
    const element = this.root.querySelector(selector);
    if (!(element instanceof elementType)) {
      throw new Error(`Missing required export element: ${selector}`);
    }
    return element;
  }

  private requireHiddenElement(selector: string): HTMLDivElement {
    const element = this.hiddenToolsHost.querySelector(selector);
    if (!(element instanceof HTMLDivElement)) {
      throw new Error(`Missing required export tool element: ${selector}`);
    }
    return element;
  }
}

function listExportScenes(): ExportSceneManifest[] {
  return pageRegistry
    .filter((entry) => entry.exportable)
    .map((entry) => createManifest(entry));
}

function createManifest(entry: PageRegistryEntry): ExportSceneManifest {
  return {
    id: entry.id,
    title: entry.title,
    subtitle: entry.subtitle,
    defaultDuration: entry.defaultDuration,
    defaultFps: entry.defaultFps,
    defaultSize: entry.defaultSize,
    exportable: entry.exportable,
  };
}

function readPositiveInteger(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForExportRuntime(sceneId: string): Promise<void> {
  const startedAt = performance.now();
  while (!getExportSceneParameterRuntime(sceneId)) {
    if (performance.now() - startedAt > 5000) {
      return;
    }
    await nextAnimationFrame();
  }
}

async function startExport(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('#export-app');

  if (!root) {
    throw new Error('Missing #export-app root element.');
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('manifest') === '1') {
    window.__freeWebAnimationExport = {
      ready: async () => {},
      listScenes: () => listExportScenes(),
      getScene: () => listExportScenes()[0] ?? createManifest(pageRegistry[0]!),
      getDuration: () => FALLBACK_DURATION,
      setTime: async () => {},
    };
    root.innerHTML = '<main class="export-shell"></main>';
    return;
  }

  const sceneId = params.get('scene') ?? pageRegistry.find((entry) => entry.exportable)?.id ?? '';
  const width = readPositiveInteger(params.get('w'), DEFAULT_WIDTH);
  const height = readPositiveInteger(params.get('h'), DEFAULT_HEIGHT);
  const sceneEntry = pageRegistry.find((entry) => entry.id === sceneId && entry.exportable);

  if (!sceneEntry) {
    throw new Error(`Unknown export scene: ${sceneId}`);
  }

  const runner = new BrowserExportRunner(root, sceneEntry, { width, height });
  window.__freeWebAnimationExport = runner.api;
  await runner.mount();
}

await startExport();
