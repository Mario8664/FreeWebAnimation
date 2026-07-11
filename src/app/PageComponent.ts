import type { DeckPage, PageContext } from './Page';

export type PageComponentSize = {
  width: number;
  height: number;
};

export type PageComponentContext = {
  page: DeckPage;
  root: HTMLElement;
  pageContext: PageContext;
  size: PageComponentSize;
};

export interface PageComponent<TContext extends PageComponentContext = PageComponentContext> {
  readonly id: string;
  mount(context: TContext): void;
  update?(timeSeconds: number, deltaSeconds: number, context: TContext): void;
  lateUpdate?(timeSeconds: number, deltaSeconds: number, context: TContext): void;
  resize?(size: TContext['size'], context: TContext): void;
  unmount?(): void;
}

export class PageComponentHost<TContext extends PageComponentContext> {
  private readonly components: PageComponent<TContext>[] = [];
  private context: TContext | null = null;

  mount(components: PageComponent<TContext>[], context: TContext): void {
    this.unmount();
    this.context = context;

    for (const component of components) {
      component.mount(context);
      this.components.push(component);
    }
  }

  update(timeSeconds: number, deltaSeconds: number): void {
    if (!this.context) return;

    for (const component of this.components) {
      component.update?.(timeSeconds, deltaSeconds, this.context);
    }
  }

  lateUpdate(timeSeconds: number, deltaSeconds: number): void {
    if (!this.context) return;

    for (const component of this.components) {
      component.lateUpdate?.(timeSeconds, deltaSeconds, this.context);
    }
  }

  resize(size: TContext['size']): void {
    if (!this.context) return;

    this.context.size = size;

    for (const component of this.components) {
      component.resize?.(size, this.context);
    }
  }

  get<TComponent extends PageComponent<TContext>>(id: string): TComponent | null {
    return (this.components.find((component) => component.id === id) as TComponent | undefined) ?? null;
  }

  unmount(): void {
    for (let index = this.components.length - 1; index >= 0; index -= 1) {
      this.components[index].unmount?.();
    }

    this.components.length = 0;
    this.context = null;
  }
}
