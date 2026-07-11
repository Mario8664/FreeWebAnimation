import type { AnimationClip, AnimationClipLibrary } from './AnimationClip';
import { AnimationClipController, type AnimationClipPreviewOptions } from './AnimationClipController';
import { AnimationClipPanel } from './AnimationClipPanel';
import { AnimationClipStore } from './AnimationClipStore';
import type { AnimationValue } from './AnimationClip';
import { TimelineCompositionStore } from './TimelineCompositionStore';
import type { TimelineComposition } from './TimelineComposition';

export class SceneAnimationRecorder {
  private readonly clipStore: AnimationClipStore;
  private readonly timelineStore: TimelineCompositionStore;
  private readonly controller: AnimationClipController;
  private panel: AnimationClipPanel | null = null;

  constructor(options: {
    sceneId: string;
    animatablePaths: readonly string[];
    readValue: (path: string) => AnimationValue | undefined;
    beforeRecord?: () => void;
    applyClip: (clip: AnimationClip, timeSeconds: number, options?: AnimationClipPreviewOptions) => void;
    applyTimeline: (library: AnimationClipLibrary, composition: TimelineComposition, timeSeconds: number) => void;
    onChange?: () => void;
    onPreviewChange?: (previewing: boolean) => void;
  }) {
    this.clipStore = new AnimationClipStore(options.sceneId);
    this.timelineStore = new TimelineCompositionStore(options.sceneId);
    this.controller = new AnimationClipController({
      sceneId: options.sceneId,
      animatablePaths: options.animatablePaths,
      readValue: options.readValue,
      beforeRecord: options.beforeRecord,
      applyClip: options.applyClip,
      applyTimeline: options.applyTimeline,
      saveLibrary: (library) => this.clipStore.saveClipLibrary(library),
      saveTimeline: (composition) => this.timelineStore.saveTimeline(composition),
      onChange: () => {
        this.syncPanel();
        options.onChange?.();
      },
      onPreviewChange: (previewing) => options.onPreviewChange?.(previewing),
    });
  }

  async load(): Promise<void> {
    const [library, timeline] = await Promise.all([
      this.clipStore.loadClipLibrary(),
      this.timelineStore.loadTimeline(),
    ]);
    this.controller.setLibrary(library);
    this.controller.setTimeline(timeline);
  }

  mount(parent: HTMLElement, tabParent: HTMLElement): void {
    this.panel = new AnimationClipPanel(this.controller.createPanelOptions(parent, tabParent));
  }

  update(deltaSeconds: number): void {
    this.controller.updatePlayback(deltaSeconds);
  }

  getTimelineDuration(): number {
    return this.controller.getTimelineDuration();
  }

  setTimelineTime(timeSeconds: number): void {
    this.controller.setTimelineTime(timeSeconds);
  }

  isPlaying(): boolean {
    return this.controller.isPlaying();
  }

  isPreviewing(): boolean {
    return this.controller.isPreviewing();
  }

  recordRealtime(paths: readonly string[]): void {
    this.controller.recordRealtime(paths);
  }

  createParameterKeyAction(path: string): ReturnType<AnimationClipController['createParameterKeyAction']> {
    return this.controller.createParameterKeyAction(path);
  }

  toggleParameterKey(path: string): void {
    this.controller.toggleParameterKey(path);
  }

  syncPanel(): void {
    if (!this.panel) return;

    this.panel.sync(this.controller.createPanelOptions(
      this.panel.element.parentElement ?? document.body,
      this.panel.tabElement.parentElement ?? document.body,
    ));
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = null;
  }
}
