import { Deck } from './Deck';
import { EditorConfigStore } from './EditorConfigStore';
import type { DeckPage, GlobalParameterHandle, GlobalParameterRegistry } from './Page';
import {
  PBR_GLOBAL_PARAMETER_ID,
  createPbrGlobalParameterRuntime,
  isPbrGlobalSettingsConsumer,
  type PbrGlobalSettings,
} from './rendering/PbrGlobalSettings';
import { pageLoaders } from '../pages';

type AppOptions = {
  editorConfigStore: EditorConfigStore;
  initialPageIndex: number;
};

export class App {
  private readonly renderViewport: HTMLDivElement;
  private readonly renderFrame: HTMLDivElement;
  private readonly pageHost: HTMLDivElement;
  private readonly globalParameterHost: HTMLDivElement;
  private readonly parameterHost: HTMLDivElement;
  private readonly animationHost: HTMLDivElement;
  private readonly animationTabHost: HTMLDivElement;
  private readonly axisHost: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly subtitle: HTMLParagraphElement;
  private readonly pageNumber: HTMLSpanElement;
  private readonly previousButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly renderWidthInput: HTMLInputElement;
  private readonly renderHeightInput: HTMLInputElement;
  private readonly editorConfigStore: EditorConfigStore;
  private readonly pbrGlobalParameters = createPbrGlobalParameterRuntime();
  private readonly globalParameters: GlobalParameterRegistry;
  private readonly resizeObserver: ResizeObserver;
  private deck: Deck | null = null;
  private editorConfigLoaded = false;
  private renderWidth = 1920;
  private renderHeight = 1080;
  private frame = 0;
  private startedAt = performance.now();
  private lastFrameAt = this.startedAt;
  private activePage: DeckPage | null = null;
  private disposed = false;

  constructor(root: HTMLDivElement, options: AppOptions) {
    this.editorConfigStore = options.editorConfigStore;

    root.innerHTML = `
      <main class="deck-shell">
        <aside class="parameter-dock" aria-label="Parameter tools">
          <div class="global-parameter-host" hidden></div>
          <div class="parameter-host"></div>
        </aside>
        <section class="render-workspace" aria-label="Render workspace">
          <div class="render-viewport">
            <div class="render-frame">
              <div class="page-host"></div>
            </div>
          </div>
        </section>
        <footer class="deck-controls">
          <div class="deck-copy">
            <div class="deck-kicker">FreeWebAnimation</div>
            <h1></h1>
            <p></p>
          </div>
          <label class="resolution-field">
            <span>W</span>
            <input class="render-width-input" type="number" min="1" step="1" value="1920">
          </label>
          <label class="resolution-field">
            <span>H</span>
            <input class="render-height-input" type="number" min="1" step="1" value="1080">
          </label>
          <div class="deck-nav">
            <button class="previous-button" type="button" aria-label="Previous page">Prev</button>
            <span class="page-number"></span>
            <button class="next-button" type="button" aria-label="Next page">Next</button>
          </div>
        </footer>
        <aside class="tool-dock" aria-label="Animation and axis tools">
          <div class="axis-tools">
            <div class="axis-host"></div>
            <div class="animation-tab-host"></div>
          </div>
          <div class="animation-host"></div>
        </aside>
      </main>
    `;

    this.renderViewport = this.requireElement(root, '.render-viewport', HTMLDivElement);
    this.renderFrame = this.requireElement(root, '.render-frame', HTMLDivElement);
    this.pageHost = this.requireElement(root, '.page-host', HTMLDivElement);
    this.globalParameterHost = this.requireElement(root, '.global-parameter-host', HTMLDivElement);
    this.parameterHost = this.requireElement(root, '.parameter-host', HTMLDivElement);
    this.animationHost = this.requireElement(root, '.animation-host', HTMLDivElement);
    this.animationTabHost = this.requireElement(root, '.animation-tab-host', HTMLDivElement);
    this.axisHost = this.requireElement(root, '.axis-host', HTMLDivElement);
    this.title = this.requireElement(root, 'h1', HTMLHeadingElement);
    this.subtitle = this.requireElement(root, '.deck-copy p', HTMLParagraphElement);
    this.pageNumber = this.requireElement(root, '.page-number', HTMLSpanElement);
    this.previousButton = this.requireElement(root, '.previous-button', HTMLButtonElement);
    this.nextButton = this.requireElement(root, '.next-button', HTMLButtonElement);
    this.renderWidthInput = this.requireElement(root, '.render-width-input', HTMLInputElement);
    this.renderHeightInput = this.requireElement(root, '.render-height-input', HTMLInputElement);
    this.globalParameters = {
      get: <TSettings extends object>(id: string): GlobalParameterHandle<TSettings> | null => {
        if (id !== PBR_GLOBAL_PARAMETER_ID) return null;
        return this.pbrGlobalParameters as unknown as GlobalParameterHandle<TSettings>;
      },
    };
    this.pbrGlobalParameters.mount(this.globalParameterHost);
    this.pbrGlobalParameters.subscribe((settings) => this.applyPbrGlobalSettingsToActivePage(settings));
    this.syncLoadingUi();

    this.previousButton.addEventListener('click', () => this.deck?.previous());
    this.nextButton.addEventListener('click', () => this.deck?.next());
    this.renderWidthInput.addEventListener('input', () => this.setRenderSizeFromInputs(false));
    this.renderHeightInput.addEventListener('input', () => this.setRenderSizeFromInputs(false));
    this.renderWidthInput.addEventListener('change', () => this.setRenderSizeFromInputs(true));
    this.renderHeightInput.addEventListener('change', () => this.setRenderSizeFromInputs(true));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.renderViewport);
    window.addEventListener('resize', () => this.resize());

    void this.initializeDeck(options.initialPageIndex);
  }

  start(): void {
    this.resize();
    this.frame = requestAnimationFrame((now) => this.update(now));
  }

  private update(now: number): void {
    const deltaSeconds = Math.min(0.05, (now - this.lastFrameAt) / 1000);
    const timeSeconds = (now - this.startedAt) / 1000;
    this.lastFrameAt = now;
    this.deck?.update(timeSeconds, deltaSeconds);
    this.frame = requestAnimationFrame((nextNow) => this.update(nextNow));
  }

  private resize(): void {
    this.renderFrame.style.width = `${this.renderWidth}px`;
    this.renderFrame.style.height = `${this.renderHeight}px`;

    const rect = this.renderViewport.getBoundingClientRect();
    const scale = Math.min(
      rect.width / this.renderWidth,
      rect.height / this.renderHeight,
    );
    const displayScale = Math.max(0.01, scale);
    this.renderFrame.style.width = `${Math.floor(this.renderWidth * displayScale)}px`;
    this.renderFrame.style.height = `${Math.floor(this.renderHeight * displayScale)}px`;
    this.deck?.resize(this.renderWidth, this.renderHeight);
  }

  private setRenderSizeFromInputs(normalize: boolean): void {
    this.renderWidth = this.readDimensionInput(this.renderWidthInput) ?? this.renderWidth;
    this.renderHeight = this.readDimensionInput(this.renderHeightInput) ?? this.renderHeight;

    if (normalize) {
      this.renderWidthInput.value = String(this.renderWidth);
      this.renderHeightInput.value = String(this.renderHeight);
    }

    this.resize();
  }

  private syncUi(page: DeckPage, index: number, total: number): void {
    this.activePage = page;
    this.title.textContent = page.meta.title;
    this.subtitle.textContent = page.meta.subtitle;
    this.pageNumber.textContent = `${index + 1} / ${total}`;
    this.previousButton.disabled = index === 0;
    this.nextButton.disabled = index === total - 1;
    this.globalParameterHost.hidden = !isPbrGlobalSettingsConsumer(page);
    this.applyPbrGlobalSettingsToActivePage(this.pbrGlobalParameters.getSettings());

    if (this.editorConfigLoaded) {
      void this.editorConfigStore.save({ activePageIndex: index }).catch((error) => {
        console.warn('Failed to save active page index.', error);
      });
    }
  }

  private applyPbrGlobalSettingsToActivePage(settings: PbrGlobalSettings): void {
    if (!this.activePage || !isPbrGlobalSettingsConsumer(this.activePage)) {
      return;
    }

    this.activePage.applyPbrGlobalSettings(settings);
  }

  private syncLoadingUi(): void {
    this.title.textContent = 'Loading page';
    this.subtitle.textContent = '';
    this.pageNumber.textContent = '';
    this.previousButton.disabled = true;
    this.nextButton.disabled = true;
  }

  private async initializeDeck(initialPageIndex: number): Promise<void> {
    await this.pbrGlobalParameters.load();
    if (this.disposed) return;

    this.deck = new Deck({
      host: this.pageHost,
      parameterHost: this.parameterHost,
      animationHost: this.animationHost,
      animationTabHost: this.animationTabHost,
      axisHost: this.axisHost,
      globalParameters: this.globalParameters,
      pageLoaders,
      onPageChange: (page, index, total) => this.syncUi(page, index, total),
      initialRenderSize: {
        width: this.renderWidth,
        height: this.renderHeight,
      },
      initialPageIndex,
    });
    this.editorConfigLoaded = true;
    this.resize();
  }

  private readDimensionInput(input: HTMLInputElement): number | null {
    const value = Math.round(input.valueAsNumber);
    return Number.isFinite(value) ? Math.max(1, value) : null;
  }

  private requireElement<T extends HTMLElement>(
    root: ParentNode,
    selector: string,
    elementType: new () => T,
  ): T {
    const element = root.querySelector(selector);
    if (!(element instanceof elementType)) {
      throw new Error(`Missing required element: ${selector}`);
    }
    return element;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.pbrGlobalParameters.dispose();
    this.deck?.dispose();
    this.deck = null;
  }
}
