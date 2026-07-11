import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Camera,
  type WebGLRendererParameters,
} from 'three';
import { createAxisDebugOverlayComponent } from './AxisDebugOverlay';
import type { DeckPage, PageContext, PageMeta } from './Page';
import {
  PageComponentHost,
  type PageComponent,
  type PageComponentContext,
} from './PageComponent';

export type ThreePageSize = {
  width: number;
  height: number;
};

export type ThreePageComponentContext = PageComponentContext & {
  root: HTMLDivElement;
  size: ThreePageSize;
  three: {
    renderer: WebGLRenderer;
    scene: Scene;
    camera: Camera;
    canvas: HTMLCanvasElement;
  };
};

export type ThreePageComponent = PageComponent<ThreePageComponentContext>;

export abstract class ThreePage implements DeckPage {
  readonly meta: PageMeta;
  protected readonly scene = new Scene();
  protected readonly camera: Camera;
  protected renderer: WebGLRenderer | null = null;
  protected size: ThreePageSize = { width: 1, height: 1 };
  private readonly componentHost = new PageComponentHost<ThreePageComponentContext>();
  private root: HTMLDivElement | null = null;

  protected constructor(meta: PageMeta, camera: Camera = new PerspectiveCamera(48, 1, 0.1, 100)) {
    this.meta = meta;
    this.camera = camera;
  }

  mount(context: PageContext): void {
    this.root = document.createElement('div');
    this.root.className = this.rootClassName;
    context.host.append(this.root);

    this.renderer = new WebGLRenderer(this.rendererParameters);
    this.renderer.setPixelRatio(1);
    this.root.append(this.renderer.domElement);

    this.setupScene(this.root, context);
    this.componentHost.mount(this.createMountedComponents(), this.createComponentContext(context));
  }

  update(timeSeconds: number, deltaSeconds: number): void {
    if (!this.renderer) return;
    this.componentHost.update(timeSeconds, deltaSeconds);
    this.updateScene(timeSeconds, deltaSeconds);
    this.componentHost.lateUpdate(timeSeconds, deltaSeconds);
    this.renderScene(deltaSeconds);
  }

  resize(width: number, height: number): void {
    if (!this.renderer) return;

    this.size = {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };

    this.renderer.setSize(this.size.width, this.size.height, false);
    this.updateCameraProjection(this.size);
    this.onResize(this.size);
    this.componentHost.resize(this.size);
  }

  unmount(): void {
    this.componentHost.unmount();
    this.disposeScene();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.root?.remove();
    this.root = null;
    this.scene.clear();
  }

  protected get rootClassName(): string {
    return 'three-page';
  }

  protected get rendererParameters(): WebGLRendererParameters {
    return { antialias: true };
  }

  protected get axisOverlayEnabled(): boolean {
    return true;
  }

  protected createComponents(): ThreePageComponent[] {
    return [];
  }

  protected setupScene(_root: HTMLDivElement, _context: PageContext): void {}

  protected updateScene(_timeSeconds: number, _deltaSeconds: number): void {}

  protected renderScene(_deltaSeconds: number): void {
    this.renderer?.render(this.scene, this.camera);
  }

  protected onResize(_size: ThreePageSize): void {}

  protected disposeScene(): void {}

  protected updateCameraProjection(size: ThreePageSize): void {
    if (this.camera instanceof PerspectiveCamera) {
      this.camera.aspect = size.width / size.height;
      this.camera.updateProjectionMatrix();
    }
  }

  private createMountedComponents(): ThreePageComponent[] {
    const components = this.createComponents();

    if (!this.axisOverlayEnabled) {
      return components;
    }

    return [
      createAxisDebugOverlayComponent(),
      ...components,
    ];
  }

  private createComponentContext(pageContext: PageContext): ThreePageComponentContext {
    if (!this.root || !this.renderer) {
      throw new Error('ThreePage components cannot mount before the page is ready.');
    }

    return {
      page: this,
      root: this.root,
      pageContext,
      size: this.size,
      three: {
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        canvas: this.renderer.domElement,
      },
    };
  }
}
