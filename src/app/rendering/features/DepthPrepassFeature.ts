import {
  DepthTexture,
  HalfFloatType,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Mesh,
  type WebGLRenderer,
} from 'three';
import type { RenderFeature, RenderPipelineContext } from '../RenderFeature';

export class DepthPrepassFeature implements RenderFeature {
  private readonly name: string;
  private readonly getExcludedMeshes: () => readonly Mesh[];
  private sceneDepthRenderTarget: WebGLRenderTarget | null = null;
  private depthWithoutExcludedRenderTarget: WebGLRenderTarget | null = null;

  constructor(options: {
    name: string;
    getExcludedMeshes?: () => readonly Mesh[];
  }) {
    this.name = options.name;
    this.getExcludedMeshes = options.getExcludedMeshes ?? (() => []);
  }

  get sceneDepthTarget(): WebGLRenderTarget | null {
    return this.sceneDepthRenderTarget;
  }

  get depthWithoutExcludedTarget(): WebGLRenderTarget | null {
    return this.depthWithoutExcludedRenderTarget;
  }

  setup(context: RenderPipelineContext): void {
    this.createTargets(context);
  }

  resize(context: RenderPipelineContext): void {
    const size = this.getDepthTargetSize(context.renderer);
    this.resizeTarget(this.sceneDepthRenderTarget, size.width, size.height);
    this.resizeTarget(this.depthWithoutExcludedRenderTarget, size.width, size.height);
  }

  prepareFrame(context: RenderPipelineContext): void {
    this.render(context);
  }

  render(context: RenderPipelineContext, camera: Camera = context.camera): void {
    if (!this.sceneDepthRenderTarget || !this.depthWithoutExcludedRenderTarget) return;

    const renderer = context.renderer;
    renderer.state.buffers.depth.setClear(1);
    renderer.state.buffers.depth.setMask(true);
    renderer.state.buffers.depth.setTest(true);

    renderer.setRenderTarget(this.sceneDepthRenderTarget);
    renderer.clear();
    renderer.render(context.scene, camera);

    const hiddenMeshes = this.getExcludedMeshes().filter((mesh) => mesh.visible);
    for (const mesh of hiddenMeshes) {
      mesh.visible = false;
    }

    renderer.setRenderTarget(this.depthWithoutExcludedRenderTarget);
    renderer.clear();
    renderer.render(context.scene, camera);
    renderer.setRenderTarget(null);

    for (const mesh of hiddenMeshes) {
      mesh.visible = true;
    }
  }

  dispose(): void {
    this.sceneDepthRenderTarget?.dispose();
    this.depthWithoutExcludedRenderTarget?.dispose();
    this.sceneDepthRenderTarget = null;
    this.depthWithoutExcludedRenderTarget = null;
  }

  private createTargets(context: RenderPipelineContext): void {
    const size = this.getDepthTargetSize(context.renderer);
    this.sceneDepthRenderTarget = this.createDepthRenderTarget(size.width, size.height, `${this.name}SceneDepth`);
    this.depthWithoutExcludedRenderTarget = this.createDepthRenderTarget(
      size.width,
      size.height,
      `${this.name}DepthWithoutExcluded`,
    );
  }

  private createDepthRenderTarget(width: number, height: number, name: string): WebGLRenderTarget {
    const renderTarget = new WebGLRenderTarget(width, height, {
      samples: 0,
      type: HalfFloatType,
    });
    renderTarget.texture.name = `${name}.color`;
    renderTarget.depthTexture = new DepthTexture(width, height, UnsignedIntType);
    renderTarget.depthTexture.name = `${name}.depth`;
    return renderTarget;
  }

  private resizeTarget(renderTarget: WebGLRenderTarget | null, width: number, height: number): void {
    if (!renderTarget) return;

    renderTarget.setSize(width, height);
    if (renderTarget.depthTexture) {
      renderTarget.depthTexture.image.width = width;
      renderTarget.depthTexture.image.height = height;
      renderTarget.depthTexture.needsUpdate = true;
    }
  }

  private getDepthTargetSize(renderer: WebGLRenderer): { width: number; height: number } {
    const drawingBufferSize = renderer.getDrawingBufferSize(new Vector2());
    return {
      width: Math.max(1, Math.floor(drawingBufferSize.x)),
      height: Math.max(1, Math.floor(drawingBufferSize.y)),
    };
  }
}
