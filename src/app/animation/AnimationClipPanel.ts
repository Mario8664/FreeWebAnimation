import type { AnimationClip, AnimationClipLibrary, AnimationEase } from './AnimationClip';
import {
  KEYFRAME_FIT_AXES,
  KEYFRAME_FIT_MAX_TOLERANCE_RATIO,
  KEYFRAME_FIT_MIN_TOLERANCE_RATIO,
  KEYFRAME_FIT_TOLERANCE_STEP_RATIO,
  normalizeKeyframeFitToleranceRatio,
  type KeyframeFitAxis,
  type KeyframeFitAxisSelection,
} from './KeyframeFit';
import {
  getTimelineClipInstanceEnd,
  getTimelineDuration,
  type TimelineClipInstance,
  type TimelineComposition,
  type TimelineTag,
  type TimelineTrack,
} from './TimelineComposition';

export type AnimationPanelTab = 'clips' | 'timeline';

export type TimelineKeyframeGroup = {
  id: string;
  time: number;
  count: number;
  selected: boolean;
};

export type SelectedKeyframeDetail = {
  path: string;
  ease: AnimationEase | 'mixed';
  disabled: boolean;
};

export type AnimationClipPanelOptions = {
  parent: HTMLElement;
  tabParent: HTMLElement;
  activeTab: AnimationPanelTab;
  library: AnimationClipLibrary;
  timeline: TimelineComposition;
  activeClipId: string | null;
  currentTime: number;
  timelineTime: number;
  playing: boolean;
  previewing: boolean;
  clipPreviewUsesTimelineBase: boolean;
  realtimeRecording: boolean;
  timelineStart: number;
  timelineSpan: number;
  compositionStart: number;
  compositionSpan: number;
  durationTintEnd: number | null;
  keyframeGroups: TimelineKeyframeGroup[];
  selectedKeyTime: number | null;
  selectedKeyTimes: number[];
  selectedTimelineInstanceId: string | null;
  selectedKeyDetails: SelectedKeyframeDetail[];
  keyframeFitPaths: string[];
  keyframeFitOpen: boolean;
  keyframeFitAxes: KeyframeFitAxisSelection;
  keyframeFitUniformSpeed: boolean;
  keyframeFitToleranceRatio: number;
  keyframeFitCanRestore: boolean;
  statusText: string;
  onTabSelect: (tab: AnimationPanelTab) => void;
  onClipSelect: (clipId: string) => void;
  onClipCreate: () => void;
  onClipRename: (clipId: string, name: string) => void;
  onClipDelete: (clipId: string) => void;
  onPlayToggle: () => void;
  onPreviewChange: (previewing: boolean) => void;
  onClipPreviewBaseChange: (enabled: boolean) => void;
  onTimeChange: (time: number, selectedKeyTime?: number | null) => void;
  onTimelinePan: (deltaSeconds: number) => void;
  onTimelineZoom: (factor: number, anchorTime?: number) => void;
  onAddAllKey: () => void;
  onDeleteAllKey: () => void;
  onKeySelect: (time: number) => void;
  onKeySelectionChange: (times: readonly number[]) => void;
  onKeyMove: (fromTimes: readonly number[], primaryFromTime: number, primaryToTime: number) => void;
  onKeyParameterEaseChange: (path: string, ease: AnimationEase) => void;
  onKeyframeFitOpenChange: (open: boolean) => void;
  onKeyframeFitAxisChange: (axis: KeyframeFitAxis, path: string | null) => void;
  onKeyframeFitUniformSpeedChange: (uniformSpeed: boolean) => void;
  onKeyframeFitToleranceRatioChange: (toleranceRatio: number) => void;
  onKeyframeFitApply: () => void;
  onKeyframeFitRestore: () => void;
  onTimelineTimeChange: (time: number) => void;
  onCompositionPan: (deltaSeconds: number) => void;
  onCompositionZoom: (factor: number, anchorTime?: number) => void;
  onTimelineInstanceAdd: (clipId: string, trackId: string, start: number) => void;
  onTimelineInstancePreviewMove: (instanceId: string, trackId: string, start: number) => void;
  onTimelineInstanceMove: (instanceId: string, trackId: string, start: number) => void;
  onTimelineInstanceSelect: (instanceId: string) => void;
  onTimelineInstanceDelete: (instanceId: string) => void;
  onTimelineInstancePreviewUpdate: (instanceId: string, patch: Partial<TimelineClipInstance>) => void;
  onTimelineInstanceUpdate: (instanceId: string, patch: Partial<TimelineClipInstance>) => void;
  onTimelineTagAdd: (time: number) => void;
  onTimelineTagMove: (tagId: string, time: number) => void;
  onTimelineTagDelete: (tagId: string) => void;
};

type KeyDragState = {
  sourceTime: number;
  sourceTimes: number[];
  markers: KeyDragMarker[];
  startClientX: number;
  lastClientX: number;
  moved: boolean;
  targetTime: number;
  targetTimes: number[];
  snapTime: number | null;
};

type KeyDragMarker = {
  sourceTime: number;
  marker: HTMLButtonElement;
};

type KeyBoxSelectState = {
  pointerId: number;
  overlay: HTMLDivElement;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
  moved: boolean;
};

type KeyframeFitDragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  sourceLeft: number;
  sourceTop: number;
};

type ClipInstanceDragState = {
  instanceId: string;
  block: HTMLButtonElement;
  sourceTrackId: string;
  targetTrackId: string;
  sourceStart: number;
  sourceDuration: number;
  grabOffset: number;
  targetStart: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  moved: boolean;
};

type ClipInstanceResizeEdge = 'start' | 'end';

type ClipInstanceResizeState = {
  instanceId: string;
  block: HTMLButtonElement;
  clip: AnimationClip;
  edge: ClipInstanceResizeEdge;
  sourceStart: number;
  sourceDuration: number;
  targetStart: number;
  targetDuration: number;
  clipDuration: number;
  speed: number;
  loop: boolean;
  reverse: boolean;
  startClientX: number;
  lastClientX: number;
  moved: boolean;
};

type SourceClipDragState = {
  clipId: string;
  ghost: HTMLDivElement;
  source: HTMLButtonElement;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  targetTrackId: string | null;
  moved: boolean;
};

type TimelineTagDragState = {
  tagId: string;
  marker: HTMLButtonElement;
  pointerId: number;
  sourceTime: number;
  targetTime: number;
  startClientX: number;
  lastClientX: number;
  moved: boolean;
};

export class AnimationClipPanel {
  readonly element: HTMLDivElement;
  readonly tabElement: HTMLDivElement;
  private readonly tabBar: HTMLDivElement;
  private readonly clipTabButton: HTMLButtonElement;
  private readonly timelineTabButton: HTMLButtonElement;
  private readonly clipsView: HTMLDivElement;
  private readonly timelineView: HTMLDivElement;
  private readonly clipList: HTMLDivElement;
  private readonly timelineSourceList: HTMLDivElement;
  private readonly clipNameInput: HTMLInputElement;
  private readonly playButton: HTMLButtonElement;
  private readonly previewCheckbox: HTMLInputElement;
  private readonly timelineBaseCheckbox: HTMLInputElement;
  private readonly timelineBaseToggle: HTMLLabelElement;
  private readonly addAllKeyButton: HTMLButtonElement;
  private readonly deleteAllKeyButton: HTMLButtonElement;
  private readonly timelineViewport: HTMLDivElement;
  private readonly timelineContent: HTMLDivElement;
  private readonly compositionViewport: HTMLDivElement;
  private readonly compositionContent: HTMLDivElement;
  private readonly timeInput: HTMLInputElement;
  private readonly selectedTitle: HTMLDivElement;
  private readonly selectedList: HTMLDivElement;
  private readonly timelineInspector: HTMLDivElement;
  private readonly clipTimelineStack: HTMLDivElement;
  private readonly compositionStack: HTMLDivElement;
  private readonly timelineControls: HTMLDivElement;
  private readonly clipKeyActions: HTMLDivElement;
  private readonly keyframeFitCheckbox: HTMLInputElement;
  private readonly keyframeFitToggle: HTMLLabelElement;
  private readonly keyframeFitPanel: HTMLDivElement;
  private readonly statusText: HTMLDivElement;
  private options: AnimationClipPanelOptions;
  private clipListSignature: string | null = null;
  private timelineSourceSignature: string | null = null;
  private timelineSignature: string | null = null;
  private compositionSignature: string | null = null;
  private selectedKeyframeSignature: string | null = null;
  private keyframeFitSignature: string | null = null;
  private timelineInspectorSignature: string | null = null;
  private draggingPlayhead = false;
  private draggingCompositionPlayhead = false;
  private playheadClientX: number | null = null;
  private keyDrag: KeyDragState | null = null;
  private keyBoxSelect: KeyBoxSelectState | null = null;
  private keyframeFitDrag: KeyframeFitDragState | null = null;
  private keyframeFitPosition: { left: number; top: number } | null = null;
  private instanceDrag: ClipInstanceDragState | null = null;
  private instanceResize: ClipInstanceResizeState | null = null;
  private sourceClipDrag: SourceClipDragState | null = null;
  private tagDrag: TimelineTagDragState | null = null;

  constructor(options: AnimationClipPanelOptions) {
    this.options = options;

    this.element = document.createElement('div');
    this.element.className = 'animation-clip-panel';
    options.parent.append(this.element);

    this.tabBar = document.createElement('div');
    this.tabBar.className = 'animation-tabs';
    this.tabElement = this.tabBar;
    this.clipTabButton = this.createButton('Clips', () => this.options.onTabSelect('clips'));
    this.timelineTabButton = this.createButton('Timeline', () => this.options.onTabSelect('timeline'));
    this.clipTabButton.className = 'animation-tab-button';
    this.timelineTabButton.className = 'animation-tab-button';
    this.tabBar.append(this.clipTabButton, this.timelineTabButton);
    options.tabParent.append(this.tabBar);

    this.clipList = document.createElement('div');
    this.clipList.className = 'animation-clip-list';
    this.timelineSourceList = document.createElement('div');
    this.timelineSourceList.className = 'animation-timeline-source-list';

    const addClipButton = this.createButton('+ Clip', () => this.options.onClipCreate());
    addClipButton.className = 'animation-secondary-button';

    this.clipNameInput = document.createElement('input');
    this.clipNameInput.type = 'text';
    this.clipNameInput.placeholder = 'Clip name';
    this.clipNameInput.addEventListener('change', () => this.renameActiveClip());
    this.clipNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.renameActiveClip();
        this.clipNameInput.blur();
      }
    });

    const clipSection = this.createSection(
      'Clips',
      this.createActions(addClipButton, this.createClipNameField()),
      this.clipList,
    );
    clipSection.classList.add('animation-clips-section');

    this.playButton = this.createButton('', () => this.options.onPlayToggle());
    this.playButton.className = 'animation-play-button';

    this.timelineViewport = document.createElement('div');
    this.timelineViewport.className = 'animation-timeline-viewport';
    this.timelineContent = document.createElement('div');
    this.timelineContent.className = 'animation-timeline-content';
    this.timelineViewport.append(this.timelineContent);
    this.timelineViewport.addEventListener('pointerdown', (event) => this.startPlayheadDrag(event));
    this.timelineViewport.addEventListener('wheel', (event) => this.zoomTimelineFromWheel(event), { passive: false });

    this.compositionViewport = document.createElement('div');
    this.compositionViewport.className = 'animation-composition-viewport';
    this.compositionContent = document.createElement('div');
    this.compositionContent.className = 'animation-composition-content';
    this.compositionViewport.append(this.compositionContent);
    this.compositionViewport.addEventListener('pointerdown', (event) => this.startCompositionPlayheadDrag(event));
    this.compositionViewport.addEventListener('dblclick', (event) => this.addTimelineTagFromEvent(event));
    this.compositionViewport.addEventListener('wheel', (event) => this.zoomCompositionFromWheel(event), { passive: false });

    const panLeftButton = this.createButton('<', () => this.panActiveTimeline(-0.25));
    const panRightButton = this.createButton('>', () => this.panActiveTimeline(0.25));
    const zoomInButton = this.createButton('+', () => this.zoomActiveTimeline(0.75));
    const zoomOutButton = this.createButton('-', () => this.zoomActiveTimeline(1.35));

    this.timeInput = document.createElement('input');
    this.timeInput.type = 'number';
    this.timeInput.min = '0';
    this.timeInput.step = '0.01';
    this.timeInput.addEventListener('input', () => this.changeActiveTime());
    this.timeInput.addEventListener('change', () => this.changeActiveTime());

    this.previewCheckbox = document.createElement('input');
    this.previewCheckbox.type = 'checkbox';
    this.previewCheckbox.addEventListener('change', () => this.options.onPreviewChange(this.previewCheckbox.checked));

    this.timelineBaseCheckbox = document.createElement('input');
    this.timelineBaseCheckbox.type = 'checkbox';
    this.timelineBaseCheckbox.addEventListener('change', () => {
      this.options.onClipPreviewBaseChange(this.timelineBaseCheckbox.checked);
    });
    this.timelineBaseToggle = this.createCheckboxLabel('Timeline Base', this.timelineBaseCheckbox);
    this.timelineBaseToggle.classList.add('animation-timeline-base-toggle');
    this.timelineBaseToggle.title = 'Use the current scene timeline as the clip preview base';

    this.addAllKeyButton = this.createButton('', () => this.options.onAddAllKey());
    this.addAllKeyButton.className = 'animation-primary-button';
    this.addAllKeyButton.title = 'Start realtime recording';
    this.addAllKeyButton.setAttribute('aria-label', 'Start realtime recording');
    this.deleteAllKeyButton = this.createButton('⌫', () => this.options.onDeleteAllKey());
    this.deleteAllKeyButton.className = 'animation-secondary-button';
    this.deleteAllKeyButton.title = 'Delete selected keyframe';
    this.deleteAllKeyButton.setAttribute('aria-label', 'Delete selected keyframe');
    this.clipKeyActions = this.createActions(this.addAllKeyButton, this.deleteAllKeyButton);

    this.keyframeFitCheckbox = document.createElement('input');
    this.keyframeFitCheckbox.type = 'checkbox';
    this.keyframeFitCheckbox.addEventListener('change', () => {
      this.options.onKeyframeFitOpenChange(this.keyframeFitCheckbox.checked);
    });
    this.keyframeFitToggle = this.createCheckboxLabel('Fit', this.keyframeFitCheckbox);
    this.keyframeFitToggle.classList.add('animation-fit-toggle');

    this.keyframeFitPanel = document.createElement('div');
    this.keyframeFitPanel.className = 'animation-keyframe-fit-panel';
    this.keyframeFitPanel.hidden = true;
    this.keyframeFitPanel.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.keyframeFitPanel.addEventListener('click', (event) => event.stopPropagation());
    document.body.append(this.keyframeFitPanel);

    this.timelineControls = document.createElement('div');
    this.timelineControls.className = 'animation-timeline-controls';
    this.timelineControls.append(
      this.playButton,
      this.createLabel('Time', this.timeInput),
      this.createCheckboxLabel('Preview', this.previewCheckbox),
      this.timelineBaseToggle,
      this.createActions(panLeftButton, panRightButton, zoomInButton, zoomOutButton),
      this.keyframeFitToggle,
      this.clipKeyActions,
    );

    this.selectedTitle = document.createElement('div');
    this.selectedTitle.className = 'animation-selected-title';
    this.selectedList = document.createElement('div');
    this.selectedList.className = 'animation-selected-list';
    const selectedPanel = document.createElement('div');
    selectedPanel.className = 'animation-selected-panel';
    selectedPanel.append(this.selectedTitle, this.selectedList);
    const keyframeSection = this.createSection('Keyframe', selectedPanel);
    keyframeSection.classList.add('animation-keyframe-section');

    this.clipTimelineStack = document.createElement('div');
    this.clipTimelineStack.className = 'animation-timeline-stack';
    this.clipTimelineStack.append(this.timelineControls, this.timelineViewport);
    const recordSection = this.createSection('Record Timeline', this.clipTimelineStack);

    this.clipsView = document.createElement('div');
    this.clipsView.className = 'animation-tab-view animation-clips-view';
    this.clipsView.append(clipSection, keyframeSection, recordSection);

    const sourceSection = this.createSection('Source Clips', this.timelineSourceList);
    sourceSection.classList.add('animation-timeline-source-section');

    this.timelineInspector = document.createElement('div');
    this.timelineInspector.className = 'animation-timeline-inspector';
    this.timelineInspector.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.timelineInspector.addEventListener('click', (event) => event.stopPropagation());
    const inspectorSection = this.createSection('Instance', this.timelineInspector);
    inspectorSection.classList.add('animation-timeline-inspector-section');

    this.compositionStack = document.createElement('div');
    this.compositionStack.className = 'animation-timeline-stack';
    this.compositionStack.append(this.compositionViewport);
    const compositionSection = this.createSection('Scene Timeline', this.compositionStack);
    compositionSection.classList.add('animation-composition-section');

    this.timelineView = document.createElement('div');
    this.timelineView.className = 'animation-tab-view animation-timeline-view';
    this.timelineView.append(sourceSection, inspectorSection, compositionSection);

    this.statusText = document.createElement('div');
    this.statusText.className = 'animation-clip-status';

    this.element.append(this.clipsView, this.timelineView, this.statusText);
    window.addEventListener('pointermove', this.handlePointerDrag);
    window.addEventListener('pointerup', this.stopPointerDrag);
    window.addEventListener('pointercancel', this.stopPointerDrag);
    window.addEventListener('keydown', this.refreshDragModifier);
    window.addEventListener('keyup', this.refreshDragModifier);

    this.sync(options);
  }

  sync(options: AnimationClipPanelOptions): void {
    this.options = options;
    const clip = this.getActiveClip();
    const hasClip = clip !== null;
    const hasTimeline = getTimelineDuration(options.timeline) > 0 || options.timeline.tracks.length > 0;

    this.renderClipList();
    this.renderTimelineSourceList();
    this.syncTabs();
    this.clipNameInput.disabled = !hasClip;
    if (document.activeElement !== this.clipNameInput) {
      this.clipNameInput.value = clip?.name ?? '';
    }
    this.playButton.disabled = options.activeTab === 'clips' ? !hasClip : !hasTimeline;
    this.playButton.classList.toggle('is-playing', options.playing);
    this.playButton.setAttribute('aria-label', options.playing ? 'Pause' : 'Play');
    this.playButton.title = options.playing ? 'Pause' : 'Play';
    this.timeInput.disabled = options.activeTab === 'clips' ? !hasClip : !hasTimeline;
    this.previewCheckbox.disabled = options.activeTab === 'clips' ? !hasClip : !hasTimeline;
    this.previewCheckbox.checked = options.previewing;
    this.timelineBaseToggle.hidden = options.activeTab !== 'timeline';
    this.timelineBaseCheckbox.disabled = options.activeTab !== 'timeline';
    this.timelineBaseCheckbox.checked = options.clipPreviewUsesTimelineBase;
    this.addAllKeyButton.disabled = options.activeTab !== 'clips' || !hasClip;
    this.addAllKeyButton.classList.toggle('is-recording', options.realtimeRecording);
    this.addAllKeyButton.title = options.realtimeRecording
      ? 'Stop realtime recording'
      : 'Start realtime recording';
    this.addAllKeyButton.setAttribute(
      'aria-label',
      options.realtimeRecording ? 'Stop realtime recording' : 'Start realtime recording',
    );
    this.deleteAllKeyButton.disabled = options.activeTab !== 'clips' || !hasClip || options.selectedKeyTimes.length === 0;
    this.keyframeFitToggle.hidden = options.activeTab === 'timeline';
    this.keyframeFitCheckbox.disabled = options.activeTab !== 'clips' || !hasClip;
    this.keyframeFitCheckbox.checked = options.activeTab === 'clips' && options.keyframeFitOpen;
    this.keyframeFitPanel.hidden = options.activeTab !== 'clips' || !options.keyframeFitOpen;
    this.timeInput.removeAttribute('max');
    this.timeInput.value = formatTime(options.activeTab === 'clips' ? options.currentTime : options.timelineTime);
    this.mountTimelineControlsForActiveTab();
    this.renderTimeline();
    this.renderComposition();
    this.renderSelectedKeyframe();
    this.renderKeyframeFitPanel();
    this.syncKeyframeFitPanelPlacement();
    this.renderTimelineInspector();
    this.statusText.textContent = options.statusText;
    this.statusText.hidden = options.statusText.length === 0;
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.handlePointerDrag);
    window.removeEventListener('pointerup', this.stopPointerDrag);
    window.removeEventListener('pointercancel', this.stopPointerDrag);
    window.removeEventListener('keydown', this.refreshDragModifier);
    window.removeEventListener('keyup', this.refreshDragModifier);
    this.tabBar.remove();
    this.keyframeFitPanel.remove();
    this.element.remove();
  }

  private syncTabs(): void {
    this.clipTabButton.classList.toggle('is-active', this.options.activeTab === 'clips');
    this.timelineTabButton.classList.toggle('is-active', this.options.activeTab === 'timeline');
    this.clipsView.hidden = this.options.activeTab !== 'clips';
    this.timelineView.hidden = this.options.activeTab !== 'timeline';
    this.element.classList.toggle('is-timeline-tab', this.options.activeTab === 'timeline');
  }

  private mountTimelineControlsForActiveTab(): void {
    const target = this.options.activeTab === 'timeline' ? this.compositionStack : this.clipTimelineStack;
    if (this.timelineControls.parentElement !== target) {
      target.prepend(this.timelineControls);
    }
    this.addAllKeyButton.hidden = this.options.activeTab === 'timeline';
    this.deleteAllKeyButton.hidden = this.options.activeTab === 'timeline';
    this.clipKeyActions.hidden = this.options.activeTab === 'timeline';
    this.keyframeFitToggle.hidden = this.options.activeTab === 'timeline';
    this.timelineBaseToggle.hidden = this.options.activeTab !== 'timeline';
    this.keyframeFitPanel.hidden = this.options.activeTab !== 'clips' || !this.options.keyframeFitOpen;
  }

  private renderClipList(): void {
    const signature = this.createClipListSignature();
    if (this.clipListSignature === signature) {
      this.syncClipListState();
      return;
    }

    this.clipListSignature = signature;
    this.clipList.replaceChildren();

    if (this.options.library.clips.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'animation-empty-state';
      empty.textContent = 'No clips yet';
      this.clipList.append(empty);
      return;
    }

    for (const clip of this.options.library.clips) {
      const item = document.createElement('div');
      item.className = 'animation-clip-item';
      item.dataset.clipId = clip.id;

      const selectButton = this.createButton(clip.name, () => this.options.onClipSelect(clip.id));
      selectButton.className = 'animation-clip-select-button';

      const deleteButton = this.createButton('Delete', () => this.options.onClipDelete(clip.id));
      deleteButton.className = 'animation-clip-delete-button';
      item.append(selectButton, deleteButton);
      this.clipList.append(item);
    }

    this.syncClipListState();
  }

  private renderTimelineSourceList(): void {
    const signature = this.createClipListSignature();
    if (this.timelineSourceSignature === signature) {
      return;
    }

    this.timelineSourceSignature = signature;
    this.timelineSourceList.replaceChildren();

    if (this.options.library.clips.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'animation-empty-state';
      empty.textContent = 'No source clips';
      this.timelineSourceList.append(empty);
      return;
    }

    for (const clip of this.options.library.clips) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'animation-source-clip';
      item.dataset.clipId = clip.id;
      item.title = 'Drag into a track';
      item.textContent = clip.name;
      item.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.startSourceClipDrag(event, item, clip.id, clip.name);
      });
      item.addEventListener('dblclick', () => {
        const firstTrack = this.options.timeline.tracks[0];
        if (firstTrack) {
          this.options.onTimelineInstanceAdd(clip.id, firstTrack.id, this.options.timelineTime);
        }
      });
      this.timelineSourceList.append(item);
    }
  }

  private createClipListSignature(): string {
    return this.options.library.clips.map((clip) => `${clip.id}\n${clip.name}`).join('\n\n');
  }

  private syncClipListState(): void {
    for (const item of Array.from(this.clipList.querySelectorAll<HTMLElement>('.animation-clip-item'))) {
      item.classList.toggle('is-active', item.dataset.clipId === this.options.activeClipId);
    }
  }

  private renameActiveClip(): void {
    const clip = this.getActiveClip();
    if (!clip) return;

    const nextName = this.clipNameInput.value.trim();
    if (nextName.length === 0) {
      this.clipNameInput.value = clip.name;
      return;
    }

    this.options.onClipRename(clip.id, nextName);
  }

  private renderTimeline(): void {
    const signature = this.createRecordTimelineSignature();
    if (this.timelineSignature === signature) {
      this.updateRecordPlayheadPosition();
      return;
    }

    this.timelineSignature = signature;
    this.timelineContent.replaceChildren();

    const start = this.options.timelineStart;
    const span = Math.max(0.1, this.options.timelineSpan);
    this.renderDurationTint(start, span);
    this.renderTicks(this.timelineContent, this.timelineViewport, start, span);

    for (const group of this.options.keyframeGroups) {
      if (group.time < start || group.time > start + span) continue;

      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'animation-key-marker';
      marker.dataset.keyTime = String(group.time);
      marker.classList.toggle('is-selected', group.selected);
      marker.style.left = `${((group.time - start) / span) * 100}%`;
      marker.title = `${formatTime(group.time)} (${group.count})`;
      marker.addEventListener('pointerdown', (event) => {
        this.startKeyDrag(event, marker, group.time);
        event.stopPropagation();
      });
      this.timelineContent.append(marker);
    }

    const playhead = document.createElement('div');
    playhead.className = 'animation-record-playhead';
    playhead.style.left = `${((this.options.currentTime - start) / span) * 100}%`;
    this.timelineContent.append(playhead);
  }

  private renderComposition(): void {
    const signature = this.createCompositionSignature();
    if (this.compositionSignature === signature) {
      this.updateCompositionPlayheadPosition(
        this.options.timelineTime,
        this.options.compositionStart,
        Math.max(0.1, this.options.compositionSpan),
      );
      return;
    }

    if (this.instanceDrag || this.instanceResize || this.sourceClipDrag || this.tagDrag) {
      this.updateCompositionPlayheadPosition(
        this.options.timelineTime,
        this.options.compositionStart,
        Math.max(0.1, this.options.compositionSpan),
      );
      return;
    }

    this.compositionSignature = signature;
    this.compositionContent.replaceChildren();

    const start = this.options.compositionStart;
    const span = Math.max(0.1, this.options.compositionSpan);
    this.renderCompositionTicks(start, span);
    this.renderTimelineTags(start, span);

    for (const track of this.options.timeline.tracks) {
      this.renderCompositionTrack(track, start, span);
    }

    const playhead = document.createElement('div');
    playhead.className = 'animation-record-playhead animation-composition-playhead';
    playhead.style.left = this.getCompositionLaneCssPosition(this.options.timelineTime, start, span);
    this.compositionContent.append(playhead);
  }

  private createRecordTimelineSignature(): string {
    return [
      this.options.activeClipId ?? '',
      this.options.timelineStart,
      this.options.timelineSpan,
      this.options.durationTintEnd ?? '',
      this.options.keyframeGroups.map((group) => `${group.time}:${group.count}:${group.selected}`).join(','),
    ].join('|');
  }

  private createCompositionSignature(): string {
    return [
      this.options.compositionStart,
      this.options.compositionSpan,
      this.options.selectedTimelineInstanceId ?? '',
      this.options.timeline.tags.map((tag) => `${tag.id}:${tag.time}:${tag.color}`).join(','),
      this.options.timeline.tracks.map((track) => [
        track.id,
        track.name,
        track.items.map((item) => [
          item.id,
          item.clipId,
          item.trackId,
          item.start,
          item.duration,
          item.speed,
          item.loop,
          item.reverse,
          item.postMode,
        ].join(':')).join(','),
      ].join('=')).join('|'),
      this.options.library.clips.map((clip) => `${clip.id}:${clip.name}:${clip.duration}`).join(','),
    ].join('|');
  }

  private updateRecordPlayheadPosition(): void {
    const playhead = this.timelineContent.querySelector<HTMLElement>('.animation-record-playhead');
    if (!playhead) return;

    const start = this.options.timelineStart;
    const span = Math.max(0.1, this.options.timelineSpan);
    playhead.style.left = `${((this.options.currentTime - start) / span) * 100}%`;
  }

  private renderCompositionTrack(track: TimelineTrack, start: number, span: number): void {
    const row = document.createElement('div');
    row.className = 'animation-composition-track';
    row.dataset.trackId = track.id;

    const label = document.createElement('div');
    label.className = 'animation-composition-track-label';
    label.textContent = track.name;
    row.append(label);

    const lane = document.createElement('div');
    lane.className = 'animation-composition-lane';

    for (const item of track.items) {
      const clip = this.options.library.clips.find((candidate) => candidate.id === item.clipId);
      if (!clip) continue;

      const end = getTimelineClipInstanceEnd(item);
      if (end < start || item.start > start + span) continue;

      const visibleStart = Math.max(start, item.start);
      const visibleEnd = Math.min(start + span, end);
      const block = document.createElement('button');
      block.type = 'button';
      block.className = 'animation-composition-clip';
      block.classList.toggle('is-selected', item.id === this.options.selectedTimelineInstanceId);
      block.style.left = this.getLanePercentCss(visibleStart, start, span);
      block.style.width = `${Math.max(2, ((visibleEnd - visibleStart) / span) * 100)}%`;
      block.title = `${clip.name} ${formatTime(item.start)}-${formatTime(end)}`;
      this.renderCompositionClipContent(block, item, clip, visibleStart, visibleEnd);
      block.addEventListener('pointerdown', (event) => {
        this.startInstanceDrag(event, block, item, track.id);
        event.stopPropagation();
      });
      lane.append(block);
    }

    row.append(lane);
    this.compositionContent.append(row);
  }

  private renderCompositionClipContent(
    block: HTMLButtonElement,
    instance: TimelineClipInstance,
    clip: AnimationClip,
    visibleStart: number,
    visibleEnd: number,
  ): void {
    const renderer = document.createElement('div');
    renderer.className = 'animation-composition-clip-renderer';
    this.renderClipPlaybackRegions(renderer, instance, clip, visibleStart, visibleEnd);

    const label = document.createElement('span');
    label.className = 'animation-composition-clip-label';
    label.textContent = clip.name;

    const leftHandle = document.createElement('span');
    leftHandle.className = 'animation-composition-clip-handle is-left';
    leftHandle.title = 'Resize start';
    leftHandle.addEventListener('pointerdown', (event) => {
      this.startInstanceResize(event, block, instance, clip, 'start');
      event.stopPropagation();
    });

    const rightHandle = document.createElement('span');
    rightHandle.className = 'animation-composition-clip-handle is-right';
    rightHandle.title = 'Resize end';
    rightHandle.addEventListener('pointerdown', (event) => {
      this.startInstanceResize(event, block, instance, clip, 'end');
      event.stopPropagation();
    });

    block.append(renderer, label, leftHandle, rightHandle);
  }

  private renderClipPlaybackRegions(
    renderer: HTMLDivElement,
    instance: TimelineClipInstance,
    clip: AnimationClip,
    visibleStart: number,
    visibleEnd: number,
  ): void {
    const visibleDuration = Math.max(0.0001, visibleEnd - visibleStart);
    const instanceEnd = instance.start + instance.duration;
    const speed = Math.max(0.01, instance.speed);
    const sourceDuration = Math.max(0.0001, clip.duration);
    const playableDuration = Math.max(0.01, sourceDuration / speed);

    if (!instance.loop) {
      const playStart = instance.start;
      const playEnd = Math.min(instanceEnd, instance.start + playableDuration);
      this.appendClipPlaybackRegion(renderer, 'is-play', playStart, playEnd, visibleStart, visibleDuration);
      this.appendClipPlaybackRegion(renderer, 'is-hold', playEnd, instanceEnd, visibleStart, visibleDuration);
      return;
    }

    for (let segmentStart = instance.start; segmentStart < instanceEnd - 0.0001; segmentStart += playableDuration) {
      const segmentEnd = Math.min(instanceEnd, segmentStart + playableDuration);
      this.appendClipPlaybackRegion(renderer, 'is-play is-loop-segment', segmentStart, segmentEnd, visibleStart, visibleDuration);
    }
  }

  private appendClipPlaybackRegion(
    renderer: HTMLDivElement,
    className: string,
    start: number,
    end: number,
    visibleStart: number,
    visibleDuration: number,
  ): void {
    const regionStart = Math.max(start, visibleStart);
    const regionEnd = Math.min(end, visibleStart + visibleDuration);
    if (regionEnd <= regionStart) return;

    const region = document.createElement('span');
    region.className = `animation-composition-clip-region ${className}`;
    region.style.left = `${((regionStart - visibleStart) / visibleDuration) * 100}%`;
    region.style.width = `${((regionEnd - regionStart) / visibleDuration) * 100}%`;
    renderer.append(region);
  }

  private renderDurationTint(start: number, span: number): void {
    if (!this.getActiveClip() || this.options.durationTintEnd === null) return;

    const end = this.options.durationTintEnd;
    const visibleStart = Math.max(start, 0);
    const visibleEnd = Math.min(start + span, end);
    if (visibleEnd <= visibleStart) return;

    const tint = document.createElement('div');
    tint.className = 'animation-duration-tint';
    tint.style.left = `${((visibleStart - start) / span) * 100}%`;
    tint.style.width = `${((visibleEnd - visibleStart) / span) * 100}%`;
    this.timelineContent.append(tint);
  }

  private renderTicks(content: HTMLElement, viewport: HTMLElement, start: number, span: number): void {
    const step = getTickStep(span, viewport.clientWidth);
    const firstTick = Math.ceil(start / step) * step;

    for (let tick = firstTick; tick <= start + span + 0.0001; tick += step) {
      const position = ((tick - start) / span) * 100;
      const item = document.createElement('div');
      item.className = 'animation-timeline-tick';
      item.style.left = `${position}%`;

      const label = document.createElement('span');
      label.textContent = formatTime(tick);
      item.append(label);
      content.append(item);
    }
  }

  private renderSelectedKeyframe(): void {
    const signature = this.createSelectedKeyframeSignature();
    if (this.selectedKeyframeSignature === signature && !this.isSelectedKeyframeEditing()) {
      return;
    }

    if (this.isSelectedKeyframeEditing()) {
      return;
    }

    this.selectedKeyframeSignature = signature;
    this.selectedList.replaceChildren();

    if (this.options.selectedKeyTimes.length === 0) {
      this.selectedTitle.textContent = this.getActiveClip() ? 'No keyframe selected' : 'Create a clip to record keys';
      return;
    }

    this.selectedTitle.textContent = this.options.selectedKeyTimes.length === 1
      ? `Keyframe ${formatTime(this.options.selectedKeyTimes[0]!)}`
      : `${this.options.selectedKeyTimes.length} keyframes selected`;

    if (this.options.selectedKeyDetails.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'animation-selected-empty';
      empty.textContent = this.options.selectedKeyTimes.length === 1
        ? 'Empty keyframe'
        : 'No shared parameters';
      this.selectedList.append(empty);
      return;
    }

    for (const detail of this.options.selectedKeyDetails) {
      const row = document.createElement('div');
      row.className = 'animation-selected-row';

      const path = document.createElement('div');
      path.className = 'animation-selected-path';
      path.textContent = detail.path;

      const easeSelect = document.createElement('select');
      easeSelect.className = 'animation-selected-ease';
      easeSelect.classList.toggle('is-mixed', detail.ease === 'mixed');
      easeSelect.title = `Transition into ${detail.path}`;
      easeSelect.setAttribute('aria-label', `Transition into ${detail.path}`);
      easeSelect.disabled = detail.disabled;
      if (detail.ease === 'mixed') {
        const mixedOption = document.createElement('option');
        mixedOption.value = 'mixed';
        mixedOption.textContent = 'Mixed';
        mixedOption.disabled = true;
        easeSelect.append(mixedOption);
      }
      for (const [value, label] of ANIMATION_EASE_OPTIONS) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        easeSelect.append(option);
      }
      easeSelect.value = detail.ease;
      easeSelect.addEventListener('pointerdown', (event) => event.stopPropagation());
      easeSelect.addEventListener('click', (event) => event.stopPropagation());
      easeSelect.addEventListener('change', () => {
        if (easeSelect.value !== 'mixed') {
          this.options.onKeyParameterEaseChange(detail.path, easeSelect.value as AnimationEase);
        }
      });

      row.append(path, easeSelect);
      this.selectedList.append(row);
    }
  }

  private createSelectedKeyframeSignature(): string {
    return [
      this.options.activeClipId ?? '',
      this.options.selectedKeyTime ?? '',
      this.options.selectedKeyTimes.join(','),
      this.options.selectedKeyDetails
        .map((detail) => `${detail.path}:${detail.ease}:${detail.disabled}`)
        .join('\n'),
    ].join('|');
  }

  private isSelectedKeyframeEditing(): boolean {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !this.selectedList.contains(active)) {
      return false;
    }

    return active instanceof HTMLSelectElement
      || active instanceof HTMLInputElement
      || active instanceof HTMLTextAreaElement;
  }

  private renderKeyframeFitPanel(): void {
    const signature = this.createKeyframeFitSignature();
    if (this.keyframeFitSignature === signature) {
      return;
    }

    this.keyframeFitSignature = signature;
    this.keyframeFitPanel.replaceChildren();
    if (!this.options.keyframeFitOpen) return;

    const availablePaths = this.options.keyframeFitPaths;
    const availablePathSet = new Set(availablePaths);
    const selectedAxisCount = KEYFRAME_FIT_AXES.filter((axis) => {
      const path = this.options.keyframeFitAxes[axis];
      return path !== null && availablePathSet.has(path);
    }).length;

    const header = document.createElement('div');
    header.className = 'animation-keyframe-fit-header';
    header.title = 'Drag fit panel';
    header.addEventListener('pointerdown', (event) => this.startKeyframeFitDrag(event));

    const title = document.createElement('div');
    title.className = 'animation-keyframe-fit-title';
    title.textContent = 'Fit Cleanup';

    const meta = document.createElement('div');
    meta.className = 'animation-keyframe-fit-meta';
    meta.textContent = `${this.options.selectedKeyTimes.length} keys / ${selectedAxisCount}D`;
    header.append(title, meta);

    const axisList = document.createElement('div');
    axisList.className = 'animation-keyframe-fit-axis-list';
    for (const axis of KEYFRAME_FIT_AXES) {
      axisList.append(this.createKeyframeFitAxisRow(axis, availablePaths, availablePathSet));
    }

    const toleranceControl = this.createKeyframeFitToleranceControl(availablePaths.length > 0);
    const uniformSpeedToggle = this.createKeyframeFitUniformSpeedToggle(availablePaths.length > 0);

    const actions = document.createElement('div');
    actions.className = 'animation-keyframe-fit-actions';

    const fitButton = this.createButton('Fit', () => this.options.onKeyframeFitApply());
    fitButton.className = 'animation-keyframe-fit-button is-primary';
    fitButton.disabled = this.options.selectedKeyTimes.length < 2 || selectedAxisCount === 0;
    fitButton.title = 'Fit selected keyframes';

    const restoreButton = this.createButton('Restore', () => this.options.onKeyframeFitRestore());
    restoreButton.className = 'animation-keyframe-fit-button';
    restoreButton.disabled = !this.options.keyframeFitCanRestore;
    restoreButton.title = 'Restore keyframes before fit';

    actions.append(fitButton, restoreButton);

    if (availablePaths.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'animation-selected-empty';
      empty.textContent = this.options.selectedKeyTimes.length === 0
        ? 'Select keyframes'
        : 'No numeric variables';
      this.keyframeFitPanel.append(header, empty, axisList, toleranceControl, uniformSpeedToggle, actions);
      return;
    }

    this.keyframeFitPanel.append(header, axisList, toleranceControl, uniformSpeedToggle, actions);
  }

  private createKeyframeFitToleranceControl(enabled: boolean): HTMLLabelElement {
    const ratio = normalizeKeyframeFitToleranceRatio(this.options.keyframeFitToleranceRatio);
    const row = document.createElement('label');
    row.className = 'animation-keyframe-fit-range-row';
    row.title = 'Higher values keep fewer keys';

    const label = document.createElement('span');
    label.textContent = 'Simplify';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(KEYFRAME_FIT_MIN_TOLERANCE_RATIO * 100);
    input.max = String(KEYFRAME_FIT_MAX_TOLERANCE_RATIO * 100);
    input.step = String(KEYFRAME_FIT_TOLERANCE_STEP_RATIO * 100);
    input.value = String(ratio * 100);
    input.disabled = !enabled;
    input.setAttribute('aria-label', 'Simplify tolerance');
    input.addEventListener('pointerdown', (event) => event.stopPropagation());

    const value = document.createElement('span');
    value.className = 'animation-keyframe-fit-range-value';
    value.textContent = formatToleranceRatio(ratio);

    input.addEventListener('input', () => {
      value.textContent = formatToleranceRatio(Number(input.value) / 100);
    });
    input.addEventListener('change', () => {
      this.options.onKeyframeFitToleranceRatioChange(Number(input.value) / 100);
    });

    row.append(label, input, value);
    return row;
  }

  private createKeyframeFitUniformSpeedToggle(enabled: boolean): HTMLLabelElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.options.keyframeFitUniformSpeed;
    input.disabled = !enabled;
    input.addEventListener('change', () => {
      this.options.onKeyframeFitUniformSpeedChange(input.checked);
    });

    const label = this.createCheckboxLabel('Uniform speed', input);
    label.classList.add('animation-keyframe-fit-option');
    label.title = 'Redistribute kept keys by path length';
    return label;
  }

  private createKeyframeFitAxisRow(
    axis: KeyframeFitAxis,
    availablePaths: readonly string[],
    availablePathSet: Set<string>,
  ): HTMLElement {
    const row = document.createElement('label');
    row.className = 'animation-keyframe-fit-axis-row';

    const label = document.createElement('span');
    label.textContent = axis.toUpperCase();

    const select = document.createElement('select');
    select.className = 'animation-keyframe-fit-select';
    select.title = `${axis.toUpperCase()} axis parameter`;
    select.setAttribute('aria-label', `${axis.toUpperCase()} axis parameter`);
    select.disabled = availablePaths.length === 0;

    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'None';
    select.append(noneOption);

    for (const path of availablePaths) {
      const option = document.createElement('option');
      option.value = path;
      option.textContent = path;
      select.append(option);
    }

    const selectedPath = this.options.keyframeFitAxes[axis];
    select.value = selectedPath && availablePathSet.has(selectedPath) ? selectedPath : '';
    select.addEventListener('pointerdown', (event) => event.stopPropagation());
    select.addEventListener('click', (event) => event.stopPropagation());
    select.addEventListener('change', () => {
      this.options.onKeyframeFitAxisChange(axis, select.value.length > 0 ? select.value : null);
    });

    row.append(label, select);
    return row;
  }

  private createKeyframeFitSignature(): string {
    return [
      this.options.activeClipId ?? '',
      this.options.keyframeFitOpen ? 'open' : 'closed',
      this.options.keyframeFitCanRestore ? 'restore' : '',
      this.options.keyframeFitUniformSpeed ? 'uniform' : '',
      this.options.keyframeFitToleranceRatio.toFixed(4),
      this.options.selectedKeyTimes.join(','),
      KEYFRAME_FIT_AXES.map((axis) => `${axis}:${this.options.keyframeFitAxes[axis] ?? ''}`).join(','),
      this.options.keyframeFitPaths.join('\n'),
    ].join('|');
  }

  private syncKeyframeFitPanelPlacement(): void {
    if (this.options.activeTab !== 'clips' || !this.options.keyframeFitOpen) {
      this.keyframeFitPanel.hidden = true;
      return;
    }

    this.keyframeFitPanel.hidden = false;
    if (!this.keyframeFitPosition) {
      this.keyframeFitPosition = this.getDefaultKeyframeFitPosition();
    }

    this.keyframeFitPosition = this.constrainKeyframeFitPosition(this.keyframeFitPosition);
    this.applyKeyframeFitPosition();
  }

  private getDefaultKeyframeFitPosition(): { left: number; top: number } {
    const toggleRect = this.keyframeFitToggle.getBoundingClientRect();
    const panelRect = this.keyframeFitPanel.getBoundingClientRect();
    const margin = 10;
    const width = Math.max(1, panelRect.width);
    const height = Math.max(1, panelRect.height);
    const belowTop = toggleRect.bottom + margin;
    const aboveTop = toggleRect.top - height - margin;

    return this.constrainKeyframeFitPosition({
      left: toggleRect.right - width,
      top: aboveTop >= margin ? aboveTop : belowTop,
    });
  }

  private constrainKeyframeFitPosition(position: { left: number; top: number }): { left: number; top: number } {
    const margin = 8;
    const rect = this.keyframeFitPanel.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);

    return {
      left: Math.max(margin, Math.min(maxLeft, position.left)),
      top: Math.max(margin, Math.min(maxTop, position.top)),
    };
  }

  private applyKeyframeFitPosition(): void {
    const position = this.keyframeFitPosition;
    if (!position) return;

    this.keyframeFitPanel.style.left = `${position.left}px`;
    this.keyframeFitPanel.style.top = `${position.top}px`;
  }

  private startKeyframeFitDrag(event: PointerEvent): void {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    const rect = this.keyframeFitPanel.getBoundingClientRect();
    this.keyframeFitDrag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      sourceLeft: rect.left,
      sourceTop: rect.top,
    };
    this.keyframeFitPosition = { left: rect.left, top: rect.top };
    this.keyframeFitPanel.setPointerCapture(event.pointerId);
    this.keyframeFitPanel.classList.add('is-dragging');
    document.body.classList.add('is-animation-fit-dragging');
  }

  private renderTimelineInspector(): void {
    const selected = this.getSelectedTimelineInstance();
    const signature = this.createTimelineInspectorSignature(selected);
    const editing = this.isTimelineInspectorEditing();
    if (this.timelineInspectorSignature === signature && !editing) {
      return;
    }

    if (editing && selected) {
      return;
    }

    this.timelineInspectorSignature = signature;
    this.timelineInspector.replaceChildren();
    if (!selected) {
      const empty = document.createElement('div');
      empty.className = 'animation-selected-empty';
      empty.textContent = 'Select or drag a clip instance';
      this.timelineInspector.append(empty);
      return;
    }

    const startField = this.createNumberField('Start', selected.start, (value) => {
      this.options.onTimelineInstanceUpdate(selected.id, { start: value });
    });
    const durationField = this.createNumberField('Length', selected.duration, (value) => {
      this.options.onTimelineInstanceUpdate(selected.id, { duration: value });
    });
    const speedField = this.createNumberField('Speed', selected.speed, (value) => {
      this.options.onTimelineInstanceUpdate(selected.id, { speed: value });
    }, { min: 0.01 });
    const loopField = this.createCheckboxField('Loop', selected.loop, (value) => {
      this.options.onTimelineInstanceUpdate(selected.id, { loop: value });
    });
    const reverseField = this.createCheckboxField('Reverse', selected.reverse, (value) => {
      this.options.onTimelineInstanceUpdate(selected.id, { reverse: value });
    });
    const postModeField = this.createPostModeField(selected);
    const deleteButton = this.createButton('Delete', () => {
      this.blurTimelineInspectorFocus();
      this.options.onTimelineInstanceDelete(selected.id);
    });
    deleteButton.className = 'animation-secondary-button';
    const deleteField = document.createElement('div');
    deleteField.className = 'animation-timeline-inspector-action';
    deleteField.append(deleteButton);

    const fields = document.createElement('div');
    fields.className = 'animation-timeline-inspector-grid';
    fields.append(
      startField,
      durationField,
      speedField,
      loopField,
      reverseField,
      postModeField,
      deleteField,
    );

    this.timelineInspector.append(fields);
  }

  private createTimelineInspectorSignature(selected = this.getSelectedTimelineInstance()): string {
    if (!selected) return 'empty';
    return [
      selected.id,
      selected.clipId,
      selected.start,
      selected.duration,
      selected.speed,
      selected.loop,
      selected.reverse,
      selected.postMode,
    ].join('|');
  }

  private isTimelineInspectorEditing(): boolean {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !this.timelineInspector.contains(active)) {
      return false;
    }
    if (active instanceof HTMLInputElement) {
      return active.type !== 'checkbox';
    }
    return active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement;
  }

  private blurTimelineInspectorFocus(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.timelineInspector.contains(active)) {
      active.blur();
    }
  }

  private createNumberField(
    label: string,
    value: number,
    onChange: (value: number) => void,
    options: { min?: number } = {},
  ): HTMLLabelElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    if (typeof options.min === 'number') {
      input.min = String(options.min);
    }
    input.value = formatTime(value);
    input.addEventListener('change', () => {
      if (Number.isFinite(input.valueAsNumber)) {
        onChange(input.valueAsNumber);
      }
    });
    return this.createLabel(label, input);
  }

  private createCheckboxField(label: string, value: boolean, onChange: (value: boolean) => void): HTMLLabelElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => onChange(input.checked));
    return this.createCheckboxLabel(label, input);
  }

  private createPostModeField(instance: TimelineClipInstance): HTMLLabelElement {
    const select = document.createElement('select');
    select.className = 'animation-selected-ease';
    for (const [value, label] of POST_MODE_OPTIONS) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = instance.postMode;
    select.addEventListener('change', () => {
      this.options.onTimelineInstanceUpdate(instance.id, { postMode: select.value as TimelineClipInstance['postMode'] });
    });
    return this.createLabel('Post', select);
  }

  private startPlayheadDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (event.shiftKey) {
      this.startKeyBoxSelect(event);
      return;
    }

    event.preventDefault();
    this.draggingPlayhead = true;
    this.playheadClientX = event.clientX;
    this.timelineViewport.setPointerCapture(event.pointerId);
    this.updateTimeFromClientX(event.clientX, event.ctrlKey);
  }

  private startCompositionPlayheadDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (this.shouldIgnoreCompositionPlayheadPointer(event)) {
      return;
    }

    event.preventDefault();
    this.draggingCompositionPlayhead = true;
    this.compositionViewport.setPointerCapture(event.pointerId);
    this.options.onTimelineTimeChange(this.getCompositionTimeFromClientX(event.clientX));
  }

  private addTimelineTagFromEvent(event: MouseEvent): void {
    if (this.options.activeTab !== 'timeline') return;
    if (this.instanceDrag || this.instanceResize || this.sourceClipDrag || this.tagDrag) return;

    const target = event.target;
    if (target instanceof Element && target.closest([
      '.animation-composition-clip',
      '.animation-source-clip',
      '.animation-timeline-inspector',
      '.animation-timeline-tag',
      'button',
      'input',
      'select',
      'textarea',
      'label',
    ].join(','))) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.options.onTimelineTagAdd(this.getCompositionTimeFromClientX(event.clientX));
  }

  private shouldIgnoreCompositionPlayheadPointer(event: PointerEvent): boolean {
    if (this.instanceDrag || this.instanceResize || this.sourceClipDrag || this.keyDrag || this.tagDrag) return true;
    const target = event.target;
    if (!(target instanceof Element)) return false;
    return target.closest(
      [
        '.animation-composition-clip',
        '.animation-source-clip',
        '.animation-timeline-inspector',
        '.animation-timeline-tag',
        'button',
        'input',
        'select',
        'textarea',
        'label',
      ].join(','),
    ) !== null;
  }

  private startSourceClipDrag(event: PointerEvent, source: HTMLButtonElement, clipId: string, clipName: string): void {
    if (event.button !== 0) return;

    event.preventDefault();
    source.setPointerCapture(event.pointerId);
    const ghost = document.createElement('div');
    ghost.className = 'animation-source-clip-ghost';
    ghost.textContent = clipName;
    document.body.append(ghost);
    this.sourceClipDrag = {
      clipId,
      ghost,
      source,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      targetTrackId: this.getTrackIdFromClientY(event.clientY),
      moved: false,
    };
    this.updateSourceClipGhost(event.clientX, event.clientY);
    document.body.classList.add('is-animation-source-dragging');
  }

  private startKeyBoxSelect(event: PointerEvent): void {
    if (event.button !== 0) return;

    event.preventDefault();
    const overlay = document.createElement('div');
    overlay.className = 'animation-timeline-selection-box';
    this.timelineViewport.append(overlay);

    this.keyBoxSelect = {
      pointerId: event.pointerId,
      overlay,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      moved: false,
    };

    try {
      this.timelineViewport.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail when the browser already retargeted the pointer.
    }
    this.updateKeyBoxSelect(event);
    document.body.classList.add('is-animation-key-box-selecting');
  }

  private getVisibleKeyDragMarkers(sourceTimes: readonly number[]): KeyDragMarker[] {
    const markers: KeyDragMarker[] = [];
    const sourceTimeSet = new Set(sourceTimes.map((time) => formatTimeKey(time)));

    for (const marker of Array.from(this.timelineContent.querySelectorAll<HTMLButtonElement>('.animation-key-marker'))) {
      const sourceTime = Number(marker.dataset.keyTime);
      if (!Number.isFinite(sourceTime) || !sourceTimeSet.has(formatTimeKey(sourceTime))) continue;

      markers.push({ sourceTime, marker });
    }

    return markers;
  }

  private isKeyTimeSelected(time: number): boolean {
    return this.options.selectedKeyTimes.some((selectedTime) => Math.abs(selectedTime - time) <= 0.0001);
  }

  private startKeyDrag(event: PointerEvent, marker: HTMLButtonElement, sourceTime: number): void {
    if (event.button !== 0) return;
    if (event.shiftKey) {
      this.startKeyBoxSelect(event);
      return;
    }

    event.preventDefault();
    marker.setPointerCapture(event.pointerId);
    const sourceTimes = this.options.selectedKeyTimes.length > 1 && this.isKeyTimeSelected(sourceTime)
      ? [...this.options.selectedKeyTimes]
      : [sourceTime];
    const markers = this.getVisibleKeyDragMarkers(sourceTimes);
    for (const item of markers) {
      item.marker.classList.add('is-dragging');
    }
    document.body.classList.add('is-animation-key-dragging');
    this.keyDrag = {
      sourceTime,
      sourceTimes,
      markers,
      startClientX: event.clientX,
      lastClientX: event.clientX,
      moved: false,
      targetTime: sourceTime,
      targetTimes: sourceTimes,
      snapTime: null,
    };
  }

  private startInstanceDrag(
    event: PointerEvent,
    block: HTMLButtonElement,
    instance: TimelineClipInstance,
    trackId: string,
  ): void {
    if (event.button !== 0) return;

    event.preventDefault();
    block.setPointerCapture(event.pointerId);
    block.classList.add('is-dragging');
    document.body.classList.add('is-animation-instance-dragging');
    this.instanceDrag = {
      instanceId: instance.id,
      block,
      sourceTrackId: trackId,
      targetTrackId: trackId,
      sourceStart: instance.start,
      sourceDuration: instance.duration,
      grabOffset: this.getCompositionTimeFromClientX(event.clientX) - instance.start,
      targetStart: instance.start,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      moved: false,
    };
  }

  private startInstanceResize(
    event: PointerEvent,
    block: HTMLButtonElement,
    instance: TimelineClipInstance,
    clip: AnimationClip,
    edge: ClipInstanceResizeEdge,
  ): void {
    if (event.button !== 0) return;

    event.preventDefault();
    block.setPointerCapture(event.pointerId);
    block.classList.add('is-resizing');
    document.body.classList.add('is-animation-instance-resizing');
    this.instanceResize = {
      instanceId: instance.id,
      block,
      clip,
      edge,
      sourceStart: instance.start,
      sourceDuration: instance.duration,
      targetStart: instance.start,
      targetDuration: instance.duration,
      clipDuration: clip.duration,
      speed: Math.max(0.01, instance.speed),
      loop: instance.loop,
      reverse: instance.reverse,
      startClientX: event.clientX,
      lastClientX: event.clientX,
      moved: false,
    };
  }

  private startTimelineTagDrag(event: PointerEvent, marker: HTMLButtonElement, tag: TimelineTag): void {
    if (event.button !== 0) return;

    event.preventDefault();
    marker.setPointerCapture(event.pointerId);
    marker.classList.add('is-dragging');
    document.body.classList.add('is-animation-tag-dragging');
    this.tagDrag = {
      tagId: tag.id,
      marker,
      pointerId: event.pointerId,
      sourceTime: tag.time,
      targetTime: tag.time,
      startClientX: event.clientX,
      lastClientX: event.clientX,
      moved: false,
    };
  }

  private readonly handlePointerDrag = (event: PointerEvent): void => {
    if (this.keyframeFitDrag) {
      this.updateKeyframeFitDrag(event);
      return;
    }

    if (this.keyBoxSelect) {
      this.updateKeyBoxSelect(event);
      return;
    }

    if (this.keyDrag) {
      this.updateKeyDrag(event);
      return;
    }

    if (this.instanceDrag) {
      this.updateInstanceDrag(event);
      return;
    }

    if (this.instanceResize) {
      this.updateInstanceResize(event);
      return;
    }

    if (this.sourceClipDrag) {
      this.updateSourceClipDrag(event);
      return;
    }

    if (this.tagDrag) {
      this.updateTimelineTagDrag(event);
      return;
    }

    if (this.draggingCompositionPlayhead) {
      event.preventDefault();
      this.options.onTimelineTimeChange(this.getCompositionTimeFromClientX(event.clientX));
      return;
    }

    if (!this.draggingPlayhead) return;

    event.preventDefault();
    this.playheadClientX = event.clientX;
    this.updateTimeFromClientX(event.clientX, event.ctrlKey);
  };

  private readonly stopPointerDrag = (): void => {
    if (this.keyframeFitDrag) {
      this.finishKeyframeFitDrag();
      return;
    }

    if (this.keyBoxSelect) {
      this.finishKeyBoxSelect();
      return;
    }

    if (this.keyDrag) {
      this.finishKeyDrag();
      return;
    }

    if (this.instanceDrag) {
      this.finishInstanceDrag();
      return;
    }

    if (this.instanceResize) {
      this.finishInstanceResize();
      return;
    }

    if (this.sourceClipDrag) {
      this.finishSourceClipDrag();
      return;
    }

    if (this.tagDrag) {
      this.finishTimelineTagDrag();
      return;
    }

    this.draggingPlayhead = false;
    this.draggingCompositionPlayhead = false;
    this.playheadClientX = null;
  };

  private readonly refreshDragModifier = (event: KeyboardEvent): void => {
    if (event.key !== 'Control') return;

    if (this.keyDrag) {
      this.updateKeyDragFromClientX(this.keyDrag.lastClientX, event.ctrlKey);
    } else if (this.instanceDrag) {
      this.updateInstanceDragFromClientPosition(
        this.instanceDrag.lastClientX,
        this.instanceDrag.lastClientY,
        event.ctrlKey,
      );
    } else if (this.instanceResize) {
      this.updateInstanceResizeFromClientX(this.instanceResize.lastClientX, event.ctrlKey);
    } else if (this.tagDrag) {
      this.updateTimelineTagDragFromClientX(this.tagDrag.lastClientX, event.ctrlKey);
    } else if (this.draggingPlayhead) {
      this.updateTimeFromClientX(this.playheadClientX ?? this.getCurrentPlayheadClientX(), event.ctrlKey);
    }
  };

  private updateKeyframeFitDrag(event: PointerEvent): void {
    const drag = this.keyframeFitDrag;
    if (!drag) return;

    event.preventDefault();
    const nextPosition = {
      left: drag.sourceLeft + event.clientX - drag.startClientX,
      top: drag.sourceTop + event.clientY - drag.startClientY,
    };
    this.keyframeFitPosition = this.constrainKeyframeFitPosition(nextPosition);
    this.applyKeyframeFitPosition();
  }

  private finishKeyframeFitDrag(): void {
    const drag = this.keyframeFitDrag;
    if (!drag) return;

    this.keyframeFitDrag = null;
    if (this.keyframeFitPanel.hasPointerCapture(drag.pointerId)) {
      this.keyframeFitPanel.releasePointerCapture(drag.pointerId);
    }
    this.keyframeFitPanel.classList.remove('is-dragging');
    document.body.classList.remove('is-animation-fit-dragging');
  }

  private updateKeyBoxSelect(event: PointerEvent): void {
    const selection = this.keyBoxSelect;
    if (!selection) return;

    event.preventDefault();
    selection.currentClientX = event.clientX;
    selection.currentClientY = event.clientY;
    selection.moved ||= getPointerDistance(
      selection.startClientX,
      selection.startClientY,
      event.clientX,
      event.clientY,
    ) >= 3;

    this.updateKeyBoxOverlay(selection);
    const selectedTimes = this.getKeyTimesInSelection(selection);
    const selectedSet = new Set(selectedTimes.map((time) => formatTimeKey(time)));

    for (const marker of Array.from(this.timelineContent.querySelectorAll<HTMLButtonElement>('.animation-key-marker'))) {
      const time = Number(marker.dataset.keyTime);
      marker.classList.toggle(
        'is-box-selected',
        Number.isFinite(time) && selectedSet.has(formatTimeKey(time)),
      );
    }
  }

  private finishKeyBoxSelect(): void {
    const selection = this.keyBoxSelect;
    if (!selection) return;

    const selectedTimes = this.getKeyTimesInSelection(selection);
    this.keyBoxSelect = null;
    selection.overlay.remove();
    document.body.classList.remove('is-animation-key-box-selecting');

    if (this.timelineViewport.hasPointerCapture(selection.pointerId)) {
      this.timelineViewport.releasePointerCapture(selection.pointerId);
    }

    for (const marker of Array.from(this.timelineContent.querySelectorAll<HTMLButtonElement>('.animation-key-marker'))) {
      marker.classList.remove('is-box-selected');
    }

    this.options.onKeySelectionChange(selectedTimes);
  }

  private updateKeyBoxOverlay(selection: KeyBoxSelectState): void {
    const viewportRect = this.timelineViewport.getBoundingClientRect();
    const left = Math.max(0, Math.min(selection.startClientX, selection.currentClientX) - viewportRect.left);
    const top = Math.max(0, Math.min(selection.startClientY, selection.currentClientY) - viewportRect.top);
    const right = Math.min(viewportRect.width, Math.max(selection.startClientX, selection.currentClientX) - viewportRect.left);
    const bottom = Math.min(viewportRect.height, Math.max(selection.startClientY, selection.currentClientY) - viewportRect.top);

    selection.overlay.style.left = `${left}px`;
    selection.overlay.style.top = `${top}px`;
    selection.overlay.style.width = `${Math.max(1, right - left)}px`;
    selection.overlay.style.height = `${Math.max(1, bottom - top)}px`;
  }

  private getKeyTimesInSelection(selection: KeyBoxSelectState): number[] {
    const selectRect = createClientRect(
      selection.startClientX,
      selection.startClientY,
      selection.currentClientX,
      selection.currentClientY,
    );
    const pointSelect = Math.abs(selectRect.right - selectRect.left) < 2
      && Math.abs(selectRect.bottom - selectRect.top) < 2;
    const selectedTimes: number[] = [];

    for (const marker of Array.from(this.timelineContent.querySelectorAll<HTMLButtonElement>('.animation-key-marker'))) {
      const time = Number(marker.dataset.keyTime);
      if (!Number.isFinite(time)) continue;

      const markerRect = marker.getBoundingClientRect();
      const selected = pointSelect
        ? containsClientPoint(markerRect, selection.currentClientX, selection.currentClientY)
        : clientRectsIntersect(selectRect, markerRect);
      if (selected) {
        selectedTimes.push(roundClipTime(time));
      }
    }

    return Array.from(new Set(selectedTimes)).sort((left, right) => left - right);
  }

  private updateKeyDrag(event: PointerEvent): void {
    event.preventDefault();
    this.updateKeyDragFromClientX(event.clientX, event.ctrlKey);
  }

  private updateKeyDragFromClientX(clientX: number, ctrlKey: boolean): void {
    const drag = this.keyDrag;
    if (!drag) return;

    drag.lastClientX = clientX;
    drag.moved ||= Math.abs(clientX - drag.startClientX) >= 3;

    const minSourceTime = Math.min(...drag.sourceTimes);
    const minTargetTime = drag.sourceTime - minSourceTime;
    const pointerTime = Math.max(minTargetTime, this.getTimeFromClientX(clientX));
    const snap = this.getSnappedTime(pointerTime, ctrlKey, drag.sourceTimes);
    drag.targetTime = Math.max(minTargetTime, snap.time);
    drag.snapTime = snap.snapTime;
    const delta = drag.targetTime - drag.sourceTime;
    drag.targetTimes = drag.sourceTimes.map((time) => Math.max(0, time + delta));

    const start = this.options.timelineStart;
    const span = Math.max(0.1, this.options.timelineSpan);
    const merging = this.isKeyDragMerging(drag);
    for (const item of drag.markers) {
      const targetTime = Math.max(0, item.sourceTime + delta);
      item.marker.style.left = `${((targetTime - start) / span) * 100}%`;
      item.marker.classList.toggle('is-merging', merging);
    }
  }

  private isKeyDragMerging(drag: KeyDragState): boolean {
    const sourceSet = new Set(drag.sourceTimes.map((time) => formatTimeKey(time)));

    for (const targetTime of drag.targetTimes) {
      for (const group of this.options.keyframeGroups) {
        if (sourceSet.has(formatTimeKey(group.time))) continue;
        if (Math.abs(group.time - targetTime) <= 0.0001) {
          return true;
        }
      }
    }

    return false;
  }

  private updateInstanceDrag(event: PointerEvent): void {
    event.preventDefault();
    this.updateInstanceDragFromClientPosition(event.clientX, event.clientY, event.ctrlKey);
  }

  private updateInstanceDragFromClientPosition(clientX: number, clientY: number, ctrlKey: boolean): void {
    const drag = this.instanceDrag;
    if (!drag) return;

    drag.lastClientX = clientX;
    drag.lastClientY = clientY;
    drag.moved ||= getPointerDistance(drag.startClientX, drag.startClientY, clientX, clientY) >= 3;

    const targetStart = Math.max(0, this.getCompositionTimeFromClientX(clientX) - drag.grabOffset);
    const targetTrackId = this.getTrackIdFromClientY(clientY) ?? drag.targetTrackId;
    drag.targetStart = this.getSnappedTimelineInstanceDragStart(drag, targetStart, targetTrackId, ctrlKey);
    drag.targetTrackId = targetTrackId;
    this.moveInstanceBlockToTrack(drag.block, drag.targetTrackId);
    const start = this.options.compositionStart;
    const span = Math.max(0.1, this.options.compositionSpan);
    drag.block.style.left = this.getLanePercentCss(drag.targetStart, start, span);
    this.options.onTimelineInstancePreviewMove(drag.instanceId, drag.targetTrackId, drag.targetStart);
  }

  private getSnappedTimelineInstanceDragStart(
    drag: ClipInstanceDragState,
    targetStart: number,
    targetTrackId: string,
    ctrlKey: boolean,
  ): number {
    if (!ctrlKey) return targetStart;

    const threshold = this.getCompositionSnapThresholdSeconds(true);
    const duration = Math.max(0.01, drag.sourceDuration);
    const targetEnd = targetStart + duration;
    let nearestStart = targetStart;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const track of this.options.timeline.tracks) {
      for (const item of track.items) {
        if (item.id === drag.instanceId) continue;

        const otherStart = item.start;
        const otherEnd = getTimelineClipInstanceEnd(item);

        const leftToRightDistance = Math.abs(targetStart - otherEnd);
        if (leftToRightDistance <= threshold && leftToRightDistance < nearestDistance) {
          nearestStart = otherEnd;
          nearestDistance = leftToRightDistance;
        }

        const rightToLeftDistance = Math.abs(targetEnd - otherStart);
        const rightToLeftStart = targetStart + otherStart - targetEnd;
        if (rightToLeftStart >= 0 && rightToLeftDistance <= threshold && rightToLeftDistance < nearestDistance) {
          nearestStart = rightToLeftStart;
          nearestDistance = rightToLeftDistance;
        }

        if (track.id === targetTrackId) continue;

        const leftToLeftDistance = Math.abs(targetStart - otherStart);
        if (leftToLeftDistance <= threshold && leftToLeftDistance < nearestDistance) {
          nearestStart = otherStart;
          nearestDistance = leftToLeftDistance;
        }

        const rightToRightDistance = Math.abs(targetEnd - otherEnd);
        const rightToRightStart = targetStart + otherEnd - targetEnd;
        if (rightToRightStart >= 0 && rightToRightDistance <= threshold && rightToRightDistance < nearestDistance) {
          nearestStart = rightToRightStart;
          nearestDistance = rightToRightDistance;
        }
      }
    }

    return Math.max(0, nearestStart);
  }

  private updateInstanceResize(event: PointerEvent): void {
    event.preventDefault();
    this.updateInstanceResizeFromClientX(event.clientX, event.ctrlKey);
  }

  private updateInstanceResizeFromClientX(clientX: number, ctrlKey: boolean): void {
    const drag = this.instanceResize;
    if (!drag) return;

    drag.lastClientX = clientX;
    drag.moved ||= Math.abs(clientX - drag.startClientX) >= 3;

    const pointerTime = this.getCompositionTimeFromClientX(clientX);
    const snappedTime = this.getSnappedClipResizeTime(drag, pointerTime, ctrlKey);
    const sourceEnd = drag.sourceStart + drag.sourceDuration;

    if (drag.edge === 'start') {
      drag.targetStart = Math.min(Math.max(0, snappedTime), sourceEnd - 0.01);
      drag.targetDuration = Math.max(0.01, sourceEnd - drag.targetStart);
    } else {
      const targetEnd = Math.max(drag.sourceStart + 0.01, snappedTime);
      drag.targetStart = drag.sourceStart;
      drag.targetDuration = Math.max(0.01, targetEnd - drag.sourceStart);
    }

    const start = this.options.compositionStart;
    const span = Math.max(0.1, this.options.compositionSpan);
    const visibleStart = Math.max(start, drag.targetStart);
    const visibleEnd = Math.min(start + span, drag.targetStart + drag.targetDuration);
    drag.block.style.left = this.getLanePercentCss(visibleStart, start, span);
    drag.block.style.width = `${Math.max(2, ((visibleEnd - visibleStart) / span) * 100)}%`;
    drag.block.replaceChildren();
    this.renderCompositionClipContent(drag.block, {
      id: drag.instanceId,
      clipId: drag.clip.id,
      trackId: '',
      start: drag.targetStart,
      duration: drag.targetDuration,
      speed: drag.speed,
      loop: drag.loop,
      reverse: drag.reverse,
      postMode: 'hold',
    }, drag.clip, visibleStart, visibleEnd);
    this.options.onTimelineInstancePreviewUpdate(drag.instanceId, {
      start: drag.targetStart,
      duration: drag.targetDuration,
    });
  }

  private getSnappedClipResizeTime(
    drag: ClipInstanceResizeState,
    pointerTime: number,
    ctrlKey: boolean,
  ): number {
    if (!ctrlKey) return pointerTime;

    const threshold = this.getCompositionSnapThresholdSeconds(true);
    const playableDuration = Math.max(0.01, drag.clipDuration / drag.speed);
    const sourceEnd = drag.sourceStart + drag.sourceDuration;
    const snapTimes: number[] = [];

    if (drag.edge === 'start') {
      if (drag.loop) {
        for (let time = sourceEnd - playableDuration; time > 0; time -= playableDuration) {
          snapTimes.push(time);
        }
      } else {
        snapTimes.push(sourceEnd - playableDuration);
      }
    } else {
      if (drag.loop) {
        for (let time = drag.sourceStart + playableDuration; time <= pointerTime + threshold + playableDuration; time += playableDuration) {
          snapTimes.push(time);
        }
      } else {
        snapTimes.push(drag.sourceStart + playableDuration);
      }
    }

    let nearestTime = pointerTime;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const snapTime of snapTimes) {
      if (snapTime < 0) continue;
      const distance = Math.abs(pointerTime - snapTime);
      if (distance <= threshold && distance < nearestDistance) {
        nearestTime = snapTime;
        nearestDistance = distance;
      }
    }

    return nearestTime;
  }

  private getSnappedTimelineTagTime(time: number, ctrlKey: boolean, excludeTagId: string): number {
    if (!ctrlKey) return Math.max(0, time);

    const threshold = this.getCompositionSnapThresholdSeconds(true);
    let nearestTime = time;
    let nearestDistance = Number.POSITIVE_INFINITY;

    const consider = (snapTime: number): void => {
      const distance = Math.abs(snapTime - time);
      if (distance <= threshold && distance < nearestDistance) {
        nearestTime = snapTime;
        nearestDistance = distance;
      }
    };

    for (const tag of this.options.timeline.tags) {
      if (tag.id !== excludeTagId) {
        consider(tag.time);
      }
    }

    for (const track of this.options.timeline.tracks) {
      for (const item of track.items) {
        consider(item.start);
        consider(getTimelineClipInstanceEnd(item));
      }
    }

    return Math.max(0, nearestTime);
  }

  private getCompositionSnapThresholdSeconds(ctrlKey: boolean): number {
    const lane = this.getCompositionLaneMetrics();
    const secondsPerPixel = this.options.compositionSpan / Math.max(1, lane.width);
    return secondsPerPixel * (ctrlKey ? 10 : 0.8);
  }

  private updateSourceClipDrag(event: PointerEvent): void {
    const drag = this.sourceClipDrag;
    if (!drag) return;

    event.preventDefault();
    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    drag.moved ||= getPointerDistance(drag.startClientX, drag.startClientY, event.clientX, event.clientY) >= 3;
    drag.targetTrackId = this.getTrackIdFromClientY(event.clientY);
    this.updateSourceClipGhost(event.clientX, event.clientY);
    this.syncDropTargetHighlight(drag.targetTrackId);
  }

  private updateTimelineTagDrag(event: PointerEvent): void {
    event.preventDefault();
    this.updateTimelineTagDragFromClientX(event.clientX, event.ctrlKey);
  }

  private updateTimelineTagDragFromClientX(clientX: number, ctrlKey: boolean): void {
    const drag = this.tagDrag;
    if (!drag) return;

    drag.lastClientX = clientX;
    drag.moved ||= Math.abs(clientX - drag.startClientX) >= 3;
    const pointerTime = this.getCompositionTimeFromClientX(clientX);
    drag.targetTime = this.getSnappedTimelineTagTime(pointerTime, ctrlKey, drag.tagId);

    const start = this.options.compositionStart;
    const span = Math.max(0.1, this.options.compositionSpan);
    drag.marker.style.left = this.getCompositionLaneCssPosition(drag.targetTime, start, span);
  }

  private finishKeyDrag(): void {
    const drag = this.keyDrag;
    if (!drag) return;

    for (const item of drag.markers) {
      item.marker.classList.remove('is-dragging', 'is-merging');
    }
    document.body.classList.remove('is-animation-key-dragging');
    this.keyDrag = null;

    if (!drag.moved) {
      this.options.onKeySelect(drag.sourceTime);
      return;
    }

    const targetTime = drag.snapTime ?? roundClipTime(drag.targetTime);
    if (Math.abs(targetTime - drag.sourceTime) <= 0.0001) {
      if (drag.sourceTimes.length > 1) {
        this.options.onKeySelectionChange(drag.sourceTimes);
      } else {
        this.options.onKeySelect(drag.sourceTime);
      }
      return;
    }

    this.options.onKeyMove(drag.sourceTimes, drag.sourceTime, targetTime);
  }

  private finishInstanceDrag(): void {
    const drag = this.instanceDrag;
    if (!drag) return;

    drag.block.classList.remove('is-dragging');
    document.body.classList.remove('is-animation-instance-dragging');
    this.instanceDrag = null;

    if (!drag.moved) {
      this.options.onTimelineInstanceSelect(drag.instanceId);
      return;
    }

    this.options.onTimelineInstanceMove(drag.instanceId, drag.targetTrackId, roundClipTime(drag.targetStart));
  }

  private finishInstanceResize(): void {
    const drag = this.instanceResize;
    if (!drag) return;

    drag.block.classList.remove('is-resizing');
    document.body.classList.remove('is-animation-instance-resizing');
    this.instanceResize = null;

    if (!drag.moved) {
      this.options.onTimelineInstanceSelect(drag.instanceId);
      return;
    }

    this.options.onTimelineInstanceUpdate(drag.instanceId, {
      start: roundClipTime(drag.targetStart),
      duration: roundClipTime(drag.targetDuration),
    });
  }

  private finishSourceClipDrag(): void {
    const drag = this.sourceClipDrag;
    if (!drag) return;

    this.sourceClipDrag = null;
    if (drag.source.hasPointerCapture(drag.pointerId)) {
      drag.source.releasePointerCapture(drag.pointerId);
    }
    drag.ghost.remove();
    document.body.classList.remove('is-animation-source-dragging');
    this.syncDropTargetHighlight(null);

    if (!drag.moved || !drag.targetTrackId) {
      return;
    }

    this.options.onTimelineInstanceAdd(
      drag.clipId,
      drag.targetTrackId,
      roundClipTime(this.getCompositionTimeFromClientX(drag.lastClientX)),
    );
  }

  private finishTimelineTagDrag(): void {
    const drag = this.tagDrag;
    if (!drag) return;

    drag.marker.classList.remove('is-dragging');
    document.body.classList.remove('is-animation-tag-dragging');
    this.tagDrag = null;
    if (drag.marker.hasPointerCapture(drag.pointerId)) {
      drag.marker.releasePointerCapture(drag.pointerId);
    }

    if (!drag.moved) return;

    const targetTime = roundClipTime(drag.targetTime);
    if (Math.abs(targetTime - drag.sourceTime) <= 0.0001) return;

    this.options.onTimelineTagMove(drag.tagId, targetTime);
  }

  private updateTimeFromClientX(clientX: number, ctrlKey: boolean): void {
    const pointerTime = this.getTimeFromClientX(clientX);
    const snap = this.getSnappedTime(pointerTime, ctrlKey);
    this.options.onTimeChange(snap.time, snap.snapTime);
  }

  private getTimeFromClientX(clientX: number): number {
    const rect = this.timelineViewport.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return this.options.timelineStart + progress * this.options.timelineSpan;
  }

  private getCompositionTimeFromClientX(clientX: number): number {
    const lane = this.getCompositionLaneMetrics();
    const progress = Math.max(0, Math.min(1, (clientX - lane.left) / lane.width));
    return this.options.compositionStart + progress * this.options.compositionSpan;
  }

  private getCompositionLaneMetrics(): { left: number; width: number } {
    const lane = this.compositionViewport.querySelector<HTMLElement>('.animation-composition-lane');
    if (lane) {
      const rect = lane.getBoundingClientRect();
      return { left: rect.left, width: Math.max(1, rect.width) };
    }

    const rect = this.compositionContent.getBoundingClientRect();
    return {
      left: rect.left + COMPOSITION_LABEL_WIDTH,
      width: Math.max(1, rect.width - COMPOSITION_LABEL_WIDTH),
    };
  }

  private getCompositionLaneCssPosition(time: number, start: number, span: number): string {
    const progress = ((time - start) / span) * 100;
    const labelOffset = COMPOSITION_LABEL_WIDTH * (1 - progress / 100);
    return `calc(${progress}% + ${labelOffset}px)`;
  }

  private getLanePercentCss(time: number, start: number, span: number): string {
    return `${((time - start) / span) * 100}%`;
  }

  private updateCompositionPlayheadPosition(time: number, start: number, span: number): void {
    const playhead = this.compositionContent.querySelector<HTMLElement>('.animation-composition-playhead');
    if (playhead) {
      playhead.style.left = this.getCompositionLaneCssPosition(time, start, span);
    }
  }

  private getTrackIdFromClientY(clientY: number): string | null {
    const rows = Array.from(this.compositionViewport.querySelectorAll<HTMLElement>('.animation-composition-track'));
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return row.dataset.trackId ?? null;
      }
    }

    return null;
  }

  private moveInstanceBlockToTrack(block: HTMLButtonElement, trackId: string): void {
    const lane = this.getCompositionLaneByTrackId(trackId);
    if (lane && block.parentElement !== lane) {
      lane.append(block);
    }
  }

  private getCompositionLaneByTrackId(trackId: string): HTMLElement | null {
    const rows = Array.from(this.compositionViewport.querySelectorAll<HTMLElement>('.animation-composition-track'));
    for (const row of rows) {
      if (row.dataset.trackId === trackId) {
        return row.querySelector<HTMLElement>('.animation-composition-lane');
      }
    }

    return null;
  }

  private renderCompositionTicks(start: number, span: number): void {
    const laneWidth = Math.max(1, this.compositionViewport.clientWidth - COMPOSITION_LABEL_WIDTH);
    const step = getTickStep(span, laneWidth);
    const firstTick = Math.ceil(start / step) * step;

    for (let tick = firstTick; tick <= start + span + 0.0001; tick += step) {
      const item = document.createElement('div');
      item.className = 'animation-timeline-tick';
      item.style.left = this.getCompositionLaneCssPosition(tick, start, span);

      const label = document.createElement('span');
      label.textContent = formatTime(tick);
      item.append(label);
      this.compositionContent.append(item);
    }
  }

  private renderTimelineTags(start: number, span: number): void {
    for (const tag of this.options.timeline.tags) {
      if (tag.time < start || tag.time > start + span) continue;

      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'animation-timeline-tag';
      marker.style.setProperty('--tag-color', tag.color);
      marker.style.left = this.getCompositionLaneCssPosition(tag.time, start, span);
      marker.title = `${formatTime(tag.time)} - drag to move, right click to delete`;
      marker.setAttribute('aria-label', `Timeline tag at ${formatTime(tag.time)}`);
      marker.addEventListener('pointerdown', (event) => {
        this.startTimelineTagDrag(event, marker, tag);
        event.stopPropagation();
      });
      marker.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.options.onTimelineTagDelete(tag.id);
      });
      this.compositionContent.append(marker);
    }
  }

  private getSnappedTime(
    time: number,
    ctrlKey: boolean,
    excludeTimes: readonly number[] = [],
  ): { time: number; snapTime: number | null } {
    const threshold = this.getSnapThresholdSeconds(ctrlKey);
    let nearestTime: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const excludeSet = new Set(excludeTimes.map((excludeTime) => formatTimeKey(excludeTime)));

    for (const group of this.options.keyframeGroups) {
      if (excludeSet.has(formatTimeKey(group.time))) continue;

      const distance = Math.abs(group.time - time);
      if (distance <= threshold && distance < nearestDistance) {
        nearestTime = group.time;
        nearestDistance = distance;
      }
    }

    return nearestTime === null
      ? { time, snapTime: null }
      : { time: nearestTime, snapTime: nearestTime };
  }

  private getSnapThresholdSeconds(ctrlKey: boolean): number {
    const rect = this.timelineViewport.getBoundingClientRect();
    const secondsPerPixel = this.options.timelineSpan / Math.max(1, rect.width);
    return secondsPerPixel * (ctrlKey ? 6 : 0.6);
  }

  private getCurrentPlayheadClientX(): number {
    const rect = this.timelineViewport.getBoundingClientRect();
    const progress = (this.options.currentTime - this.options.timelineStart) / Math.max(0.0001, this.options.timelineSpan);
    return rect.left + clamp01(progress) * rect.width;
  }

  private zoomTimelineFromWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 0.82 : 1.22;
    this.options.onTimelineZoom(factor, this.options.currentTime);
  }

  private zoomCompositionFromWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 0.82 : 1.22;
    this.options.onCompositionZoom(factor, this.options.timelineTime);
  }

  private panActiveTimeline(factor: number): void {
    if (this.options.activeTab === 'timeline') {
      this.options.onCompositionPan(this.options.compositionSpan * factor);
      return;
    }

    this.options.onTimelinePan(this.options.timelineSpan * factor);
  }

  private zoomActiveTimeline(factor: number): void {
    if (this.options.activeTab === 'timeline') {
      this.options.onCompositionZoom(factor);
      return;
    }

    this.options.onTimelineZoom(factor);
  }

  private changeActiveTime(): void {
    if (!Number.isFinite(this.timeInput.valueAsNumber)) return;

    if (this.options.activeTab === 'timeline') {
      this.options.onTimelineTimeChange(this.timeInput.valueAsNumber);
      return;
    }

    this.options.onTimeChange(this.timeInput.valueAsNumber);
  }

  private getSelectedTimelineInstance(): TimelineClipInstance | null {
    const instanceId = this.options.selectedTimelineInstanceId;
    if (!instanceId) return null;

    for (const track of this.options.timeline.tracks) {
      const instance = track.items.find((item) => item.id === instanceId);
      if (instance) return instance;
    }

    return null;
  }

  private createSection(titleText: string, ...children: HTMLElement[]): HTMLElement {
    const section = document.createElement('section');
    section.className = 'animation-section';

    const title = document.createElement('div');
    title.className = 'animation-section-title';
    title.textContent = titleText;

    section.append(title, ...children);
    return section;
  }

  private createActions(...items: HTMLElement[]): HTMLDivElement {
    const actions = document.createElement('div');
    actions.className = 'animation-actions';
    actions.append(...items);
    return actions;
  }

  private createLabel(labelText: string, control: HTMLElement): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'animation-field';

    const text = document.createElement('span');
    text.textContent = labelText;
    label.append(text, control);
    return label;
  }

  private createCheckboxLabel(labelText: string, control: HTMLInputElement): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'animation-preview-field';

    const text = document.createElement('span');
    text.textContent = labelText;
    label.append(control, text);
    return label;
  }

  private createClipNameField(): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'animation-clip-name-field';

    const text = document.createElement('span');
    text.textContent = 'Name';
    label.append(text, this.clipNameInput);
    return label;
  }

  private createButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  private updateSourceClipGhost(clientX: number, clientY: number): void {
    const drag = this.sourceClipDrag;
    if (!drag) return;

    drag.ghost.style.left = `${clientX + 10}px`;
    drag.ghost.style.top = `${clientY + 10}px`;
    drag.ghost.classList.toggle('is-over-track', drag.targetTrackId !== null);
  }

  private syncDropTargetHighlight(trackId: string | null): void {
    for (const lane of Array.from(this.compositionViewport.querySelectorAll<HTMLElement>('.animation-composition-lane'))) {
      const row = lane.closest<HTMLElement>('.animation-composition-track');
      lane.classList.toggle('is-drop-target', row?.dataset.trackId === trackId);
    }
  }

  private getActiveClip(): AnimationClip | null {
    return this.options.library.clips.find((clip) => clip.id === this.options.activeClipId) ?? null;
  }
}

const ANIMATION_EASE_OPTIONS: readonly [AnimationEase, string][] = [
  ['auto', 'Auto'],
  ['linear', 'Linear'],
  ['step', 'Step'],
];

const POST_MODE_OPTIONS: readonly [TimelineClipInstance['postMode'], string][] = [
  ['hold', 'Hold'],
  ['none', 'None'],
];

const COMPOSITION_LABEL_WIDTH = 74;

function formatTime(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function roundClipTime(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function formatTimeKey(value: number): string {
  return roundClipTime(value).toFixed(2);
}

function formatToleranceRatio(value: number): string {
  return `${(normalizeKeyframeFitToleranceRatio(value) * 100).toFixed(1)}%`;
}

function createClientRect(
  startClientX: number,
  startClientY: number,
  currentClientX: number,
  currentClientY: number,
): DOMRect {
  const left = Math.min(startClientX, currentClientX);
  const top = Math.min(startClientY, currentClientY);
  const right = Math.max(startClientX, currentClientX);
  const bottom = Math.max(startClientY, currentClientY);
  return new DOMRect(left, top, right - left, bottom - top);
}

function clientRectsIntersect(left: DOMRect, right: DOMRect): boolean {
  return left.left <= right.right
    && left.right >= right.left
    && left.top <= right.bottom
    && left.bottom >= right.top;
}

function containsClientPoint(rect: DOMRect, clientX: number, clientY: number): boolean {
  return clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top
    && clientY <= rect.bottom;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getPointerDistance(startX: number, startY: number, currentX: number, currentY: number): number {
  return Math.hypot(currentX - startX, currentY - startY);
}

function getTickStep(span: number, width: number): number {
  const minLabelGap = 54;
  const maxTickCount = Math.max(2, Math.floor(Math.max(1, width) / minLabelGap));
  const rawStep = span / maxTickCount;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(0.0001, rawStep)));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}
