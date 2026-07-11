import {
  EMPTY_GLOBAL_PARAMETER_REGISTRY,
  type DeckPage,
  type DeckPageLoader,
  type GlobalParameterRegistry,
  type PageContext,
} from './Page';

type DeckOptions = {
  host: HTMLDivElement;
  parameterHost: HTMLDivElement;
  animationHost: HTMLDivElement;
  animationTabHost: HTMLDivElement;
  axisHost: HTMLDivElement;
  globalParameters?: GlobalParameterRegistry;
  pageLoaders: DeckPageLoader[];
  onPageChange: (page: DeckPage, index: number, total: number) => void;
  initialRenderSize: {
    width: number;
    height: number;
  };
  initialPageIndex?: number;
};

export class Deck {
  private readonly host: HTMLDivElement;
  private readonly parameterHost: HTMLDivElement;
  private readonly animationHost: HTMLDivElement;
  private readonly animationTabHost: HTMLDivElement;
  private readonly axisHost: HTMLDivElement;
  private readonly globalParameters: GlobalParameterRegistry;
  private readonly pageLoaders: DeckPageLoader[];
  private readonly onPageChange: (page: DeckPage, index: number, total: number) => void;
  private renderWidth: number;
  private renderHeight: number;
  private activeIndex = 0;
  private activePage: DeckPage | null = null;
  private loadId = 0;

  constructor(options: DeckOptions) {
    if (options.pageLoaders.length === 0) {
      throw new Error('Deck requires at least one page.');
    }

    this.host = options.host;
    this.parameterHost = options.parameterHost;
    this.animationHost = options.animationHost;
    this.animationTabHost = options.animationTabHost;
    this.axisHost = options.axisHost;
    this.globalParameters = options.globalParameters ?? EMPTY_GLOBAL_PARAMETER_REGISTRY;
    this.pageLoaders = options.pageLoaders;
    this.onPageChange = options.onPageChange;
    this.renderWidth = options.initialRenderSize.width;
    this.renderHeight = options.initialRenderSize.height;
    this.activeIndex = this.clampPageIndex(options.initialPageIndex ?? 0);
    void this.mountPage(this.activeIndex);
  }

  get currentIndex(): number {
    return this.activeIndex;
  }

  get total(): number {
    return this.pageLoaders.length;
  }

  goTo(index: number): void {
    const nextIndex = this.clampPageIndex(index);
    if (nextIndex === this.activeIndex) {
      return;
    }

    this.activePage?.unmount();
    this.activePage = null;
    this.host.replaceChildren();
    this.activeIndex = nextIndex;
    void this.mountPage(nextIndex);
  }

  next(): void {
    this.goTo(this.activeIndex + 1);
  }

  previous(): void {
    this.goTo(this.activeIndex - 1);
  }

  update(timeSeconds: number, deltaSeconds: number): void {
    this.activePage?.update(timeSeconds, deltaSeconds);
  }

  resize(width: number, height: number): void {
    this.renderWidth = Math.max(1, width);
    this.renderHeight = Math.max(1, height);
    this.activePage?.resize(this.renderWidth, this.renderHeight);
  }

  dispose(): void {
    this.loadId += 1;
    this.activePage?.unmount();
    this.activePage = null;
  }

  private async mountPage(index: number): Promise<void> {
    const currentLoadId = ++this.loadId;
    const page = await this.loadPage(index);
    if (currentLoadId !== this.loadId || index !== this.activeIndex) {
      return;
    }

    this.activePage = page;
    const context: PageContext = {
      host: this.host,
      parameterHost: this.parameterHost,
      animationHost: this.animationHost,
      animationTabHost: this.animationTabHost,
      axisHost: this.axisHost,
      globalParameters: this.globalParameters,
    };
    page.mount(context);
    this.onPageChange(page, this.activeIndex, this.pageLoaders.length);
    page.resize(this.renderWidth, this.renderHeight);
  }

  private async loadPage(index: number): Promise<DeckPage> {
    return this.pageLoaders[index]!();
  }

  private clampPageIndex(index: number): number {
    if (!Number.isFinite(index)) {
      return 0;
    }

    return Math.min(this.pageLoaders.length - 1, Math.max(0, Math.floor(index)));
  }
}
