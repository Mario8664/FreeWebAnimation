import { Euler, PerspectiveCamera, Vector3, type Camera, type WebGLRenderer } from 'three';
import type { PageComponent, PageComponentContext } from './PageComponent';

export type FreeCameraControllerOptions = {
  domElement: HTMLElement;
  camera: PerspectiveCamera;
  moveSpeed?: number;
  lookSpeed?: number;
};

export type FreeCameraComponentOptions = Omit<FreeCameraControllerOptions, 'domElement' | 'camera'>;

export type FreeCameraComponentContext = PageComponentContext & {
  three: {
    renderer: WebGLRenderer;
    camera: Camera;
  };
};

export function createFreeCameraComponent(options: FreeCameraComponentOptions = {}): FreeCameraComponent {
  return new FreeCameraComponent(options);
}

export class FreeCameraComponent implements PageComponent<FreeCameraComponentContext> {
  readonly id = 'free-camera';
  private readonly options: FreeCameraComponentOptions;
  private controller: FreeCameraController | null = null;

  constructor(options: FreeCameraComponentOptions = {}) {
    this.options = options;
  }

  get cameraController(): FreeCameraController | null {
    return this.controller;
  }

  mount(context: FreeCameraComponentContext): void {
    if (!(context.three.camera instanceof PerspectiveCamera)) {
      return;
    }

    this.controller = new FreeCameraController({
      domElement: context.three.renderer.domElement,
      camera: context.three.camera,
      moveSpeed: this.options.moveSpeed,
      lookSpeed: this.options.lookSpeed,
    });
  }

  update(_timeSeconds: number, deltaSeconds: number): void {
    this.controller?.update(deltaSeconds);
  }

  unmount(): void {
    this.controller?.dispose();
    this.controller = null;
  }
}

const FORWARD = new Vector3();
const RIGHT = new Vector3();
const UP = new Vector3(0, 1, 0);

export class FreeCameraController {
  moveSpeed: number;
  lookSpeed: number;
  private readonly domElement: HTMLElement;
  private readonly camera: PerspectiveCamera;
  private readonly pressedKeys = new Set<string>();
  private dragging = false;
  private activePointerId: number | null = null;
  private yaw = 0;
  private pitch = 0;

  constructor(options: FreeCameraControllerOptions) {
    this.domElement = options.domElement;
    this.camera = options.camera;
    this.moveSpeed = options.moveSpeed ?? 8;
    this.lookSpeed = options.lookSpeed ?? 0.0024;
    this.syncFromCamera();

    this.domElement.addEventListener('contextmenu', this.handleContextMenu);
    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.domElement.addEventListener('pointercancel', this.handlePointerCancel);
    this.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  update(deltaSeconds: number): void {
    if (!this.dragging) return;

    const distance = this.moveSpeed * deltaSeconds;
    this.camera.getWorldDirection(FORWARD);
    FORWARD.y = 0;
    if (FORWARD.lengthSq() > 0.0001) {
      FORWARD.normalize();
    }

    RIGHT.crossVectors(FORWARD, UP).normalize();

    if (this.pressedKeys.has('KeyW')) {
      this.camera.position.addScaledVector(FORWARD, distance);
    }

    if (this.pressedKeys.has('KeyS')) {
      this.camera.position.addScaledVector(FORWARD, -distance);
    }

    if (this.pressedKeys.has('KeyD')) {
      this.camera.position.addScaledVector(RIGHT, distance);
    }

    if (this.pressedKeys.has('KeyA')) {
      this.camera.position.addScaledVector(RIGHT, -distance);
    }

    if (this.pressedKeys.has('KeyE')) {
      this.camera.position.y += distance;
    }

    if (this.pressedKeys.has('KeyQ')) {
      this.camera.position.y -= distance;
    }
  }

  syncFromCamera(): void {
    const euler = new Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = euler.y;
    this.pitch = euler.x;
  }

  dispose(): void {
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.domElement.removeEventListener('pointercancel', this.handlePointerCancel);
    this.domElement.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.pressedKeys.clear();
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 2) return;

    event.preventDefault();
    this.dragging = true;
    this.activePointerId = event.pointerId;
    this.domElement.setPointerCapture(event.pointerId);
    this.syncFromCamera();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    if (event.pointerId !== this.activePointerId) return;

    this.yaw -= event.movementX * this.lookSpeed;
    this.pitch -= event.movementY * this.lookSpeed;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.activePointerId) return;

    this.stopDragging(event.pointerId);
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.activePointerId) return;

    this.stopDragging(event.pointerId);
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.dragging) return;

    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const factor = direction > 0 ? 1.18 : 1 / 1.18;
    this.moveSpeed = Math.max(0.02, Math.min(500, this.moveSpeed * factor));
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.dragging) return;

    if (isMovementKey(event.code)) {
      event.preventDefault();
      this.pressedKeys.add(event.code);
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.stopDragging();
  };

  private stopDragging(pointerId = this.activePointerId): void {
    this.dragging = false;
    this.activePointerId = null;
    this.pressedKeys.clear();

    if (pointerId !== null && this.domElement.hasPointerCapture(pointerId)) {
      this.domElement.releasePointerCapture(pointerId);
    }
  }
}

function isMovementKey(code: string): boolean {
  return code === 'KeyW'
    || code === 'KeyA'
    || code === 'KeyS'
    || code === 'KeyD'
    || code === 'KeyQ'
    || code === 'KeyE';
}
