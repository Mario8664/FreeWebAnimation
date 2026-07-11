import { Vector3, type Camera } from 'three';
import type { PageComponent, PageComponentContext } from './PageComponent';

const AXIS_VECTORS = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

export type AxisDebugOverlayComponentContext = PageComponentContext & {
  three: {
    camera: Camera;
  };
};

export function createAxisDebugOverlayComponent(): PageComponent<AxisDebugOverlayComponentContext> {
  return new AxisDebugOverlayComponent();
}

class AxisDebugOverlayComponent implements PageComponent<AxisDebugOverlayComponentContext> {
  readonly id = 'axis-debug-overlay';
  private overlay: AxisDebugOverlay | null = null;

  mount(context: AxisDebugOverlayComponentContext): void {
    this.overlay = new AxisDebugOverlay(context.pageContext.axisHost);
  }

  lateUpdate(
    _timeSeconds: number,
    _deltaSeconds: number,
    context: AxisDebugOverlayComponentContext,
  ): void {
    this.overlay?.render(context.three.camera);
  }

  resize(): void {
    this.overlay?.resize();
  }

  unmount(): void {
    this.overlay?.dispose();
    this.overlay = null;
  }
}

export class AxisDebugOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'axis-debug-canvas';
    parent.append(this.canvas);

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create axis debug canvas context.');
    }

    this.context = context;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio));
    this.canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio));
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  render(camera: Camera): void {
    const ctx = this.context;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    if (width <= 0 || height <= 0) {
      return;
    }

    const origin = { x: width * 0.5, y: height * 0.56 };
    const length = Math.min(width, height) * 0.32;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(248, 250, 252, 0.78)';
    roundRect(ctx, 0.5, 0.5, width - 1, height - 1, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText('Axis', 12, 18);

    const inverseCameraRotation = camera.quaternion.clone().invert();
    this.drawAxis(ctx, origin, AXIS_VECTORS.x.clone().applyQuaternion(inverseCameraRotation), length, '#ef4444', 'X');
    this.drawAxis(ctx, origin, AXIS_VECTORS.y.clone().applyQuaternion(inverseCameraRotation), length, '#22c55e', 'Y');
    this.drawAxis(ctx, origin, AXIS_VECTORS.z.clone().applyQuaternion(inverseCameraRotation), length, '#3b82f6', 'Z');
  }

  dispose(): void {
    this.canvas.remove();
  }

  private drawAxis(
    ctx: CanvasRenderingContext2D,
    origin: { x: number; y: number },
    direction: Vector3,
    length: number,
    color: string,
    label: string,
  ): void {
    const screenDirection = new Vector3(direction.x, -direction.y, 0);
    if (screenDirection.lengthSq() < 0.0001) {
      screenDirection.set(0, -1, 0);
    }
    screenDirection.normalize();

    const depthAlpha = 0.58 + Math.max(-0.25, Math.min(0.35, -direction.z)) * 0.9;
    const end = {
      x: origin.x + screenDirection.x * length,
      y: origin.y + screenDirection.y * length,
    };

    ctx.save();
    ctx.globalAlpha = depthAlpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    const angle = Math.atan2(end.y - origin.y, end.x - origin.x);
    ctx.translate(end.x, end.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -5);
    ctx.lineTo(-8, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = depthAlpha;
    ctx.fillStyle = color;
    ctx.font = '800 12px Inter, sans-serif';
    ctx.fillText(label, end.x + 6, end.y + 4);
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
