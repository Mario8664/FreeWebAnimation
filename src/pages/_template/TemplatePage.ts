import type { DeckPage, PageContext } from '../../app/Page';

export class TemplatePage implements DeckPage {
  readonly meta = {
    id: 'template-page',
    title: 'Template Page',
    subtitle: 'Copy this folder when starting a new scene/page.',
  };

  private root: HTMLDivElement | null = null;

  mount({ host }: PageContext): void {
    this.root = document.createElement('div');
    this.root.className = 'template-page';
    this.root.innerHTML = `
      <div class="page-placeholder">
        <strong>New page</strong>
        <span>Put DOM, Canvas, or Three.js setup here.</span>
      </div>
    `;
    host.append(this.root);
  }

  update(_timeSeconds: number, _deltaSeconds: number): void {}

  resize(_width: number, _height: number): void {}

  unmount(): void {
    this.root?.remove();
    this.root = null;
  }
}
