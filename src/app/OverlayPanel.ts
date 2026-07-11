export type OverlayPanelSize = {
  width: number;
  height: number;
  ppu: number;
  unitsWidth: number;
  unitsHeight: number;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export class OverlayPanel {
  readonly element: HTMLDivElement;
  readonly svg: SVGSVGElement;
  private size: OverlayPanelSize;

  constructor(options: { className?: string; ppu?: number } = {}) {
    const ppu = Math.max(1, options.ppu ?? 100);
    this.size = {
      width: 1,
      height: 1,
      ppu,
      unitsWidth: 1 / ppu,
      unitsHeight: 1 / ppu,
    };

    this.element = document.createElement('div');
    this.element.className = options.className ?? 'overlay-panel';

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('preserveAspectRatio', 'none');
    this.svg.setAttribute('aria-hidden', 'true');
    this.element.append(this.svg);

    this.resize(1, 1, ppu);
  }

  mount(parent: HTMLElement): void {
    parent.append(this.element);
  }

  resize(width: number, height: number, ppu = this.size.ppu): void {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const safePpu = Math.max(1, ppu);

    this.size = {
      width: safeWidth,
      height: safeHeight,
      ppu: safePpu,
      unitsWidth: safeWidth / safePpu,
      unitsHeight: safeHeight / safePpu,
    };

    this.svg.setAttribute('width', String(safeWidth));
    this.svg.setAttribute('height', String(safeHeight));
    this.svg.setAttribute('viewBox', `0 0 ${this.size.unitsWidth} ${this.size.unitsHeight}`);
  }

  setOpacity(opacity: number): void {
    this.element.style.opacity = String(clamp01(opacity));
  }

  clear(): void {
    this.svg.replaceChildren();
  }

  getSize(): OverlayPanelSize {
    return this.size;
  }

  dispose(): void {
    this.clear();
    this.element.remove();
  }
}

export function createSvgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
