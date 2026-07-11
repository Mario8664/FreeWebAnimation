import type { Camera, Scene, WebGLRenderer } from 'three';
import type { ThreePageSize } from '../ThreePage';

export type RenderPipelineContext = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  size: ThreePageSize;
};

export interface RenderFeature {
  setup?(context: RenderPipelineContext): void;
  resize?(context: RenderPipelineContext): void;
  prepareFrame?(context: RenderPipelineContext, deltaSeconds: number): void;
  renderOverride?(context: RenderPipelineContext, deltaSeconds: number): boolean;
  dispose?(): void;
}
