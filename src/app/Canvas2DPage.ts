import type { DeckPage, PageContext, PageMeta } from './Page';
import {
  PageComponentHost,
  type PageComponent,
  type PageComponentContext,
} from './PageComponent';

export type Canvas2DSize = {
  width: number;
  height: number;
  pixelRatio: number;
};

export type Canvas2DPageComponentContext = PageComponentContext & {
  root: HTMLDivElement;
  size: Canvas2DSize;
  canvas2d: {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
  };
};

export type Canvas2DPageComponent = PageComponent<Canvas2DPageComponentContext>;

export abstract class Canvas2DPage implements DeckPage {
  readonly meta: PageMeta;
  protected canvas: HTMLCanvasElement | null = null;
  protected context: CanvasRenderingContext2D | null = null;
  protected size: Canvas2DSize = { width: 1, height: 1, pixelRatio: 1 };
  private readonly componentHost = new PageComponentHost<Canvas2DPageComponentContext>();
  private root: HTMLDivElement | null = null;

  protected constructor(meta: PageMeta) {
    this.meta = meta;
  }

  mount(pageContext: PageContext): void {
    this.root = document.createElement('div');
    this.root.className = this.rootClassName;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'page-canvas';
    this.root.append(this.canvas);
    pageContext.host.append(this.root);

    this.context = this.canvas.getContext('2d');
    if (!this.context) {
      throw new Error('Unable to create 2D canvas context.');
    }

    this.onMount(this.root, this.canvas);
    this.componentHost.mount(this.createComponents(), this.createComponentContext(pageContext));
  }

  update(timeSeconds: number, deltaSeconds: number): void {
    if (!this.context) return;
    this.componentHost.update(timeSeconds, deltaSeconds);
    this.render2D(this.context, this.size, timeSeconds, deltaSeconds);
    this.componentHost.lateUpdate(timeSeconds, deltaSeconds);
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.context) return;

    const pixelRatio = 1;
    this.size = {
      width: Math.max(1, width),
      height: Math.max(1, height),
      pixelRatio,
    };

    this.canvas.width = Math.floor(this.size.width * pixelRatio);
    this.canvas.height = Math.floor(this.size.height * pixelRatio);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.onResize(this.size);
    this.componentHost.resize(this.size);
  }

  unmount(): void {
    this.componentHost.unmount();
    this.onUnmount();
    this.root?.remove();
    this.root = null;
    this.canvas = null;
    this.context = null;
  }

  protected get rootClassName(): string {
    return 'canvas-page';
  }

  protected toCanvasPoint(event: PointerEvent): { x: number; y: number } {
    if (!this.canvas) {
      throw new Error('Canvas is not mounted.');
    }

    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  protected onMount(_root: HTMLDivElement, _canvas: HTMLCanvasElement): void {}

  protected onResize(_size: Canvas2DSize): void {}

  protected onUnmount(): void {}

  protected createComponents(): Canvas2DPageComponent[] {
    return [];
  }

  protected abstract render2D(
    context: CanvasRenderingContext2D,
    size: Canvas2DSize,
    timeSeconds: number,
    deltaSeconds: number,
  ): void;

  private createComponentContext(pageContext: PageContext): Canvas2DPageComponentContext {
    if (!this.root || !this.canvas || !this.context) {
      throw new Error('Canvas2DPage components cannot mount before the page is ready.');
    }

    return {
      page: this,
      root: this.root,
      pageContext,
      size: this.size,
      canvas2d: {
        canvas: this.canvas,
        context: this.context,
      },
    };
  }
}
