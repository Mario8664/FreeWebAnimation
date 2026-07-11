import {
  createEmptyClip,
  createEmptyClipLibrary,
  createKeyframe,
  getKeyframeCount,
  upsertKeyframe,
  type AnimationEase,
  type AnimationClip,
  type AnimationClipLibrary,
  type AnimationKeyframe,
  type AnimationValue,
} from './AnimationClip';
import type {
  AnimationClipPanelOptions,
  SelectedKeyframeDetail,
  TimelineKeyframeGroup,
} from './AnimationClipPanel';
import {
  createTimelineClipInstance,
  getTimelineDuration,
  roundTimelineTime,
  type TimelineClipInstance,
  type TimelineComposition,
  type TimelineTrack,
} from './TimelineComposition';
import {
  cloneAnimationClip,
  createEmptyKeyframeFitAxes,
  fitSelectedKeyframes as fitSelectedKeyframesInClip,
  KEYFRAME_FIT_DEFAULT_TOLERANCE_RATIO,
  getKeyframeFitPaths,
  getNumericKeyframeFitPaths,
  KEYFRAME_FIT_AXES,
  normalizeKeyframeFitAxes,
  normalizeKeyframeFitToleranceRatio,
  type KeyframeFitAxis,
  type KeyframeFitAxisSelection,
} from './KeyframeFit';

export type AnimationParameterKeyAction = {
  active: boolean;
  disabled?: boolean;
  title?: string;
};

export type AnimationPanelTab = 'clips' | 'timeline';

let sharedAnimationPanelTab: AnimationPanelTab = 'clips';

export type AnimationClipPreviewOptions = {
  timelineBase?: {
    library: AnimationClipLibrary;
    composition: TimelineComposition;
    timeSeconds: number;
  };
};

type AnimationClipControllerOptions = {
  sceneId: string;
  animatablePaths: readonly string[];
  readValue: (path: string) => AnimationValue | undefined;
  beforeRecord?: () => void;
  applyClip: (clip: AnimationClip, timeSeconds: number, options?: AnimationClipPreviewOptions) => void;
  applyTimeline: (library: AnimationClipLibrary, composition: TimelineComposition, timeSeconds: number) => void;
  saveLibrary: (library: AnimationClipLibrary) => Promise<void>;
  saveTimeline: (composition: TimelineComposition) => Promise<void>;
  onChange?: () => void;
  onPreviewChange?: (previewing: boolean) => void;
};

export class AnimationClipController {
  private readonly options: AnimationClipControllerOptions;
  private readonly animatablePathSet: Set<string>;
  private library: AnimationClipLibrary;
  private timeline: TimelineComposition;
  private activeClipId: string | null = null;
  private activeTab: AnimationPanelTab = sharedAnimationPanelTab;
  private currentTime = 0;
  private timelineTime = 0;
  private playing = false;
  private previewing = false;
  private clipPreviewUsesTimelineBase = false;
  private timelineStart = 0;
  private timelineSpan = 6;
  private compositionStart = 0;
  private compositionSpan = 8;
  private selectedKeyTime: number | null = null;
  private selectedKeyTimes: number[] = [];
  private keyframeFitOpen = false;
  private keyframeFitAxes: KeyframeFitAxisSelection = createEmptyKeyframeFitAxes();
  private keyframeFitUniformSpeed = false;
  private keyframeFitToleranceRatio = KEYFRAME_FIT_DEFAULT_TOLERANCE_RATIO;
  private keyframeFitBackup: {
    clipId: string;
    clip: AnimationClip;
    selectedKeyTimes: number[];
    currentTime: number;
  } | null = null;
  private selectedTimelineInstanceId: string | null = null;
  private statusText = '';
  private realtimeRecording = false;
  private realtimeRecordStartTime = 0;
  private realtimeRecordedKeyCount = 0;
  private readonly realtimeValueSnapshot = new Map<string, AnimationValue>();

  constructor(options: AnimationClipControllerOptions) {
    this.options = options;
    this.animatablePathSet = new Set(options.animatablePaths);
    this.library = createEmptyClipLibrary(options.sceneId);
    this.timeline = {
      version: 1,
      sceneId: options.sceneId,
      tags: [],
      tracks: [],
    };
  }

  setLibrary(library: AnimationClipLibrary): void {
    this.library = library;
    this.updateAllClipDurationsFromKeys();
    this.activeClipId = this.library.clips[0]?.id ?? null;
    this.currentTime = 0;
    this.playing = false;
    this.realtimeRecording = false;
    this.setPreviewing(false, false);
    this.clearSelectedKeyframes();
    this.clearKeyframeFitSession();
  }

  setTimeline(timeline: TimelineComposition): void {
    this.timeline = timeline;
    this.timelineTime = 0;
    this.selectedTimelineInstanceId = null;
  }

  getTimelineDuration(): number {
    return getTimelineDuration(this.timeline);
  }

  isPlaying(): boolean {
    return this.playing;
  }

  isPreviewing(): boolean {
    return this.previewing;
  }

  isRealtimeRecording(): boolean {
    return this.realtimeRecording;
  }

  recordRealtime(paths: readonly string[]): void {
    if (!this.realtimeRecording || this.activeTab !== 'clips') return;

    const clip = this.getActiveClip();
    if (!clip) return;

    const time = roundClipTime(this.currentTime);
    let keyCount = 0;

    for (const path of new Set(paths)) {
      if (!this.animatablePathSet.has(path)) continue;

      const value = this.options.readValue(path);
      if (value === undefined) continue;

      const previousValue = this.realtimeValueSnapshot.get(path);
      if (previousValue !== undefined && areAnimationValuesEqual(previousValue, value)) {
        continue;
      }

      const trackWasEmpty = !clip.tracks[path] || clip.tracks[path]!.length === 0;
      if (
        trackWasEmpty
        && previousValue !== undefined
        && time > this.realtimeRecordStartTime + 0.0001
      ) {
        upsertKeyframe(
          clip,
          path,
          createKeyframe(this.realtimeRecordStartTime, previousValue, clip.defaultEase),
        );
      }

      upsertKeyframe(clip, path, createKeyframe(time, value, clip.defaultEase));
      this.realtimeValueSnapshot.set(path, value);
      keyCount += 1;
    }

    if (keyCount === 0) return;

    this.realtimeRecordedKeyCount += keyCount;
    this.updateClipDurationFromKeys(clip, { preserveCurrentTime: true });
    this.setSelectedKeyTimes([time]);
    this.statusText = `Recording... ${this.realtimeRecordedKeyCount} keys`;
    this.notifyChanged();
  }

  updatePlayback(deltaSeconds: number): void {
    if (this.realtimeRecording) {
      this.updateRealtimeRecording(deltaSeconds);
      return;
    }

    if (!this.playing) return;

    if (this.activeTab === 'timeline') {
      this.updateTimelinePlayback(deltaSeconds);
      return;
    }

    this.updateClipPlayback(deltaSeconds);
  }

  createPanelOptions(parent: HTMLElement, tabParent: HTMLElement): AnimationClipPanelOptions {
    const clip = this.getActiveClip();
    const selectedKeyDetails = this.createSelectedKeyDetails();
    const keyframeFitPaths = clip ? this.createKeyframeFitPaths(clip) : [];
    const keyframeFitAxes = normalizeKeyframeFitAxes(this.keyframeFitAxes, keyframeFitPaths);

    return {
      parent,
      tabParent,
      activeTab: this.activeTab,
      library: this.library,
      timeline: this.timeline,
      activeClipId: this.activeClipId,
      currentTime: this.currentTime,
      timelineTime: this.timelineTime,
      playing: this.playing,
      previewing: this.previewing,
      clipPreviewUsesTimelineBase: this.clipPreviewUsesTimelineBase,
      realtimeRecording: this.realtimeRecording,
      timelineStart: this.timelineStart,
      timelineSpan: this.timelineSpan,
      compositionStart: this.compositionStart,
      compositionSpan: this.compositionSpan,
      durationTintEnd: clip ? this.getKeyedDuration(clip) : null,
      keyframeGroups: this.createKeyframeGroups(),
      selectedKeyTime: this.selectedKeyTime,
      selectedKeyTimes: this.getSelectedKeyTimes(),
      selectedTimelineInstanceId: this.selectedTimelineInstanceId,
      selectedKeyDetails,
      keyframeFitPaths,
      keyframeFitOpen: this.keyframeFitOpen,
      keyframeFitAxes,
      keyframeFitUniformSpeed: this.keyframeFitUniformSpeed,
      keyframeFitToleranceRatio: this.keyframeFitToleranceRatio,
      keyframeFitCanRestore: this.keyframeFitBackup?.clipId === this.activeClipId,
      statusText: this.statusText,
      onTabSelect: (tab) => this.selectTab(tab),
      onClipSelect: (clipId) => this.selectClip(clipId),
      onClipCreate: () => this.createNewClip(),
      onClipRename: (clipId, name) => this.renameClip(clipId, name),
      onClipDelete: (clipId) => this.deleteClip(clipId),
      onPlayToggle: () => this.togglePlayback(),
      onPreviewChange: (previewing) => this.setPreviewingFromPanel(previewing),
      onClipPreviewBaseChange: (enabled) => this.setClipPreviewUsesTimelineBase(enabled),
      onTimeChange: (time, selectedKeyTime) => this.setCurrentTime(time, selectedKeyTime),
      onTimelinePan: (deltaSeconds) => this.panTimeline(deltaSeconds),
      onTimelineZoom: (factor, anchorTime) => this.zoomTimeline(factor, anchorTime),
      onAddAllKey: () => this.toggleRealtimeRecording(),
      onDeleteAllKey: () => this.deleteSelectedKeyframe(),
      onKeySelect: (time) => this.selectKeyframe(time),
      onKeySelectionChange: (times) => this.selectKeyframes(times),
      onKeyMove: (fromTimes, primaryFromTime, primaryToTime) => this.moveKeyframeGroups(fromTimes, primaryFromTime, primaryToTime),
      onKeyParameterEaseChange: (path, ease) => this.updateSelectedKeyParameterEase(path, ease),
      onKeyframeFitOpenChange: (open) => this.setKeyframeFitOpen(open),
      onKeyframeFitAxisChange: (axis, path) => this.updateKeyframeFitAxis(axis, path),
      onKeyframeFitUniformSpeedChange: (uniformSpeed) => this.setKeyframeFitUniformSpeed(uniformSpeed),
      onKeyframeFitToleranceRatioChange: (toleranceRatio) => this.setKeyframeFitToleranceRatio(toleranceRatio),
      onKeyframeFitApply: () => this.applyKeyframeFit(),
      onKeyframeFitRestore: () => this.restoreKeyframeFitBackup(),
      onTimelineTimeChange: (time) => this.setTimelineTime(time),
      onCompositionPan: (deltaSeconds) => this.panComposition(deltaSeconds),
      onCompositionZoom: (factor, anchorTime) => this.zoomComposition(factor, anchorTime),
      onTimelineInstanceAdd: (clipId, trackId, start) => this.addTimelineInstance(clipId, trackId, start),
      onTimelineInstancePreviewMove: (instanceId, trackId, start) => this.previewTimelineInstanceMove(instanceId, trackId, start),
      onTimelineInstanceMove: (instanceId, trackId, start) => this.moveTimelineInstance(instanceId, trackId, start),
      onTimelineInstanceSelect: (instanceId) => this.selectTimelineInstance(instanceId),
      onTimelineInstanceDelete: (instanceId) => this.deleteTimelineInstance(instanceId),
      onTimelineInstancePreviewUpdate: (instanceId, patch) => this.previewTimelineInstanceUpdate(instanceId, patch),
      onTimelineInstanceUpdate: (instanceId, patch) => this.updateTimelineInstance(instanceId, patch),
      onTimelineTagAdd: (time) => this.addTimelineTag(time),
      onTimelineTagMove: (tagId, time) => this.moveTimelineTag(tagId, time),
      onTimelineTagDelete: (tagId) => this.deleteTimelineTag(tagId),
    };
  }

  createParameterKeyAction(path: string): AnimationParameterKeyAction {
    const clip = this.getActiveClip();
    const keyTime = clip ? this.getParameterKeyActionTime(clip, path) : null;

    return {
      active: keyTime !== null,
      disabled: !clip,
      title: !clip
        ? 'Create a clip to add keys'
        : keyTime !== null
          ? 'Delete Key'
          : 'Add Key',
    };
  }

  toggleParameterKey(path: string): void {
    const clip = this.getActiveClip();
    if (!clip || !this.animatablePathSet.has(path)) return;

    const keyTime = this.getParameterKeyActionTime(clip, path);
    if (keyTime !== null) {
      const removed = this.deleteParameterKeyAtTime(clip, path, keyTime);
      if (removed === 0) return;

      this.updateClipDurationFromKeys(clip, { preserveCurrentTime: true });
      if (this.getSelectedKeyTimes().length > 0 && this.createSelectedKeyDetails().length === 0) {
        this.clearSelectedKeyframes();
      }
      this.statusText = `Deleted ${path}`;
      this.notifyChanged();
      this.saveClipLibrary();
      return;
    }

    this.addParameterKeyAtCurrentTime(path);
  }

  private updateClipPlayback(deltaSeconds: number): void {
    const clip = this.getActiveClip();
    if (!clip) return;

    const previousTime = this.currentTime;
    this.currentTime = Math.min(clip.duration, this.currentTime + Math.max(0, deltaSeconds));
    if (this.currentTime >= clip.duration) {
      this.playing = false;
    }

    if (Math.abs(this.currentTime - previousTime) > 0.0001) {
      this.clearSelectedKeyframes();
    }

    this.ensureTimelineContains(this.currentTime);
    this.applyClipPreview(clip);
    this.notifyChanged();
  }

  private updateTimelinePlayback(deltaSeconds: number): void {
    const duration = getTimelineDuration(this.timeline);
    const previousTime = this.timelineTime;
    this.timelineTime = Math.min(duration, this.timelineTime + Math.max(0, deltaSeconds));
    if (this.timelineTime >= duration) {
      this.playing = false;
    }

    if (Math.abs(this.timelineTime - previousTime) > 0.0001) {
      this.selectedTimelineInstanceId = null;
    }

    this.ensureCompositionContains(this.timelineTime);
    this.options.applyTimeline(this.library, this.timeline, this.timelineTime);
    this.notifyChanged();
  }

  private setClipPreviewUsesTimelineBase(enabled: boolean): void {
    if (this.clipPreviewUsesTimelineBase === enabled) return;

    this.clipPreviewUsesTimelineBase = enabled;
    const clip = this.getActiveClip();
    if (this.previewing && this.activeTab === 'clips' && clip) {
      this.applyClipPreview(clip);
    }
    this.notifyChanged();
  }

  private applyClipPreview(clip: AnimationClip): void {
    this.options.applyClip(clip, this.currentTime, this.createClipPreviewOptions());
  }

  private createClipPreviewOptions(): AnimationClipPreviewOptions | undefined {
    if (!this.clipPreviewUsesTimelineBase || (!this.previewing && !this.realtimeRecording)) {
      return undefined;
    }

    return {
      timelineBase: {
        library: this.library,
        composition: this.timeline,
        timeSeconds: this.timelineTime,
      },
    };
  }

  private updateRealtimeRecording(deltaSeconds: number): void {
    const clip = this.getActiveClip();
    if (!clip) {
      this.stopRealtimeRecording({ save: false });
      return;
    }

    const previousTime = this.currentTime;
    this.currentTime = Math.max(0, this.currentTime + Math.max(0, deltaSeconds));

    if (Math.abs(this.currentTime - previousTime) > 0.0001) {
      this.clearSelectedKeyframes();
    }

    this.ensureTimelineContains(this.currentTime);
    this.notifyChanged();
  }

  private getActiveClip(): AnimationClip | null {
    if (this.activeClipId === null) return null;

    return this.library.clips.find((clip) => clip.id === this.activeClipId) ?? null;
  }

  private getSelectedKeyTimes(): number[] {
    if (this.selectedKeyTimes.length > 0) {
      return [...this.selectedKeyTimes];
    }

    return this.selectedKeyTime === null ? [] : [this.selectedKeyTime];
  }

  private setSelectedKeyTimes(times: readonly number[]): void {
    const normalized = Array.from(new Set(
      times
        .filter((time) => Number.isFinite(time))
        .map((time) => roundClipTime(time)),
    )).sort((left, right) => left - right);

    this.selectedKeyTimes = normalized;
    this.selectedKeyTime = normalized.length === 1 ? normalized[0]! : null;
  }

  private clearSelectedKeyframes(): void {
    this.selectedKeyTimes = [];
    this.selectedKeyTime = null;
  }

  private clearKeyframeFitSession(): void {
    this.keyframeFitOpen = false;
    this.keyframeFitAxes = createEmptyKeyframeFitAxes();
    this.keyframeFitUniformSpeed = false;
    this.keyframeFitToleranceRatio = KEYFRAME_FIT_DEFAULT_TOLERANCE_RATIO;
    this.keyframeFitBackup = null;
  }

  private setKeyframeFitOpen(open: boolean): void {
    this.stopRealtimeRecording({ save: true });
    this.setActiveTab('clips');
    if (this.keyframeFitOpen === open) return;

    this.keyframeFitOpen = open;
    if (!open) {
      this.keyframeFitBackup = null;
    }
    this.notifyChanged();
  }

  private setKeyframeFitUniformSpeed(uniformSpeed: boolean): void {
    if (this.keyframeFitUniformSpeed === uniformSpeed) return;

    this.keyframeFitUniformSpeed = uniformSpeed;
    this.notifyChanged();
  }

  private setKeyframeFitToleranceRatio(toleranceRatio: number): void {
    const normalized = normalizeKeyframeFitToleranceRatio(toleranceRatio);
    if (Math.abs(this.keyframeFitToleranceRatio - normalized) <= 0.000001) return;

    this.keyframeFitToleranceRatio = normalized;
    this.notifyChanged();
  }

  private updateKeyframeFitAxis(axis: KeyframeFitAxis, path: string | null): void {
    if (!KEYFRAME_FIT_AXES.includes(axis)) return;

    const clip = this.getActiveClip();
    const availablePaths = clip ? this.createKeyframeFitPaths(clip) : [];
    const availablePathSet = new Set(availablePaths);
    const nextAxes = normalizeKeyframeFitAxes(this.keyframeFitAxes, availablePaths);
    const nextPath = path && availablePathSet.has(path) ? path : null;

    if (nextPath) {
      for (const candidateAxis of KEYFRAME_FIT_AXES) {
        if (candidateAxis !== axis && nextAxes[candidateAxis] === nextPath) {
          nextAxes[candidateAxis] = null;
        }
      }
    }

    nextAxes[axis] = nextPath;
    this.keyframeFitAxes = nextAxes;
    this.notifyChanged();
  }

  private applyKeyframeFit(): void {
    const clip = this.getActiveClip();
    if (!clip) return;

    this.stopRealtimeRecording({ save: true });
    this.setActiveTab('clips');

    const selectedTimes = this.getSelectedKeyTimes();
    const availablePaths = this.createKeyframeFitPaths(clip);
    const axes = normalizeKeyframeFitAxes(this.keyframeFitAxes, availablePaths);
    const paths = getKeyframeFitPaths(axes);
    this.keyframeFitAxes = axes;

    if (selectedTimes.length < 2) {
      this.statusText = 'Select at least two keyframes';
      this.notifyChanged();
      return;
    }

    if (paths.length === 0) {
      this.statusText = 'Choose at least one fit axis';
      this.notifyChanged();
      return;
    }

    const backupWasEmpty = this.keyframeFitBackup === null || this.keyframeFitBackup.clipId !== clip.id;
    if (backupWasEmpty) {
      this.keyframeFitBackup = {
        clipId: clip.id,
        clip: cloneAnimationClip(clip),
        selectedKeyTimes: this.getSelectedKeyTimes(),
        currentTime: this.currentTime,
      };
    }

    const outcome = fitSelectedKeyframesInClip(clip, selectedTimes, axes, {
      uniformSpeed: this.keyframeFitUniformSpeed,
      toleranceRatio: this.keyframeFitToleranceRatio,
    });
    if (!outcome.ok) {
      if (backupWasEmpty) {
        this.keyframeFitBackup = null;
      }
      this.statusText = outcome.reason;
      this.notifyChanged();
      return;
    }

    const { result } = outcome;
    this.setSelectedKeyTimes(result.keptTimes);
    this.playing = false;
    this.setPreviewing(true, false);
    this.updateClipDurationFromKeys(clip, { preserveCurrentTime: true });
    this.ensureTimelineContains(this.currentTime);
    this.applyClipPreview(clip);
    this.statusText = this.keyframeFitUniformSpeed
      ? `Fit uniform ${result.dimension}D: ${result.removedKeyCount} -> ${result.insertedKeyCount} keys`
      : `Fit ${result.dimension}D: ${result.removedKeyCount} -> ${result.insertedKeyCount} keys`;
    this.notifyChanged();
    this.saveClipLibrary();
  }

  private restoreKeyframeFitBackup(): void {
    const backup = this.keyframeFitBackup;
    if (!backup) return;

    const index = this.library.clips.findIndex((clip) => clip.id === backup.clipId);
    if (index < 0) {
      this.keyframeFitBackup = null;
      this.statusText = 'Nothing to restore';
      this.notifyChanged();
      return;
    }

    const restoredClip = cloneAnimationClip(backup.clip);
    this.library.clips[index] = restoredClip;
    this.activeClipId = restoredClip.id;
    this.currentTime = backup.currentTime;
    this.setSelectedKeyTimes(backup.selectedKeyTimes);
    this.playing = false;
    this.setPreviewing(true, false);
    this.updateClipDurationFromKeys(restoredClip, { preserveCurrentTime: true });
    this.ensureTimelineContains(this.currentTime);
    this.applyClipPreview(restoredClip);
    this.keyframeFitBackup = null;
    this.statusText = 'Restored keyframes before fit';
    this.notifyChanged();
    this.saveClipLibrary();
  }

  private selectClip(clipId: string): void {
    if (!this.library.clips.some((clip) => clip.id === clipId)) return;

    this.stopRealtimeRecording({ save: true });
    if (this.activeClipId !== clipId) {
      this.clearKeyframeFitSession();
    }
    this.setActiveTab('clips');
    this.activeClipId = clipId;
    this.currentTime = Math.max(0, this.currentTime);
    this.clearSelectedKeyframes();
    this.playing = false;
    this.setPreviewing(true, false);
    const clip = this.getActiveClip();
    if (clip) {
      this.applyClipPreview(clip);
    }
    this.notifyChanged();
  }

  private createNewClip(): void {
    this.stopRealtimeRecording({ save: true });
    this.clearKeyframeFitSession();
    const index = this.library.clips.length + 1;
    const id = createUniqueClipId(this.library, `clip-${index}`);
    const clip = createEmptyClip(id, `Clip ${index}`);
    this.updateClipDurationFromKeys(clip, { preserveCurrentTime: true });
    this.library.clips.push(clip);
    this.activeClipId = clip.id;
    this.currentTime = 0;
    this.clearSelectedKeyframes();
    this.playing = false;
    this.statusText = `Created ${clip.name}`;
    this.notifyChanged();
    this.saveClipLibrary();
  }

  private deleteClip(clipId: string): void {
    this.stopRealtimeRecording({ save: true });
    const index = this.library.clips.findIndex((clip) => clip.id === clipId);
    if (index < 0) return;

    if (this.activeClipId === clipId || this.keyframeFitBackup?.clipId === clipId) {
      this.clearKeyframeFitSession();
    }
    this.library.clips.splice(index, 1);
    const removedTimelineInstances = this.removeTimelineInstancesForClip(clipId);
    if (this.activeClipId === clipId) {
      this.activeClipId = this.library.clips[Math.max(0, index - 1)]?.id ?? null;
      this.currentTime = 0;
      this.clearSelectedKeyframes();
      this.setPreviewing(false, false);
      const clip = this.getActiveClip();
      if (clip) {
        this.applyClipPreview(clip);
      }
    }

    this.statusText = removedTimelineInstances > 0
      ? `Deleted clip and ${removedTimelineInstances} timeline instance${removedTimelineInstances === 1 ? '' : 's'}`
      : 'Deleted clip';
    this.notifyChanged();
    this.saveClipLibrary();
    if (removedTimelineInstances > 0) {
      this.saveTimeline();
    }
  }

  private renameClip(clipId: string, name: string): void {
    const clip = this.library.clips.find((item) => item.id === clipId);
    const nextName = name.trim();
    if (!clip || nextName.length === 0 || clip.name === nextName) return;

    clip.name = nextName;
    this.statusText = `Renamed ${clip.name}`;
    this.notifyChanged();
    this.saveClipLibrary();
  }

  private setCurrentTime(time: number, selectedKeyTime: number | null = null): void {
    const clip = this.getActiveClip();
    if (!clip || !Number.isFinite(time)) return;

    this.stopRealtimeRecording({ save: true });
    this.setActiveTab('clips');
    this.currentTime = Math.max(0, time);
    this.playing = false;
    this.setPreviewing(true, false);
    this.setSelectedKeyTimes(selectedKeyTime === null ? [] : [selectedKeyTime]);
    this.ensureTimelineContains(this.currentTime);
    this.applyClipPreview(clip);
    this.notifyChanged();
  }

  private togglePlayback(): void {
    this.stopRealtimeRecording({ save: true });

    if (this.activeTab === 'timeline') {
      this.toggleTimelinePlayback();
      return;
    }

    const clip = this.getActiveClip();
    if (!clip) return;
    if (this.currentTime >= clip.duration) {
      this.currentTime = 0;
      this.clearSelectedKeyframes();
    }

    this.setPreviewing(true, false);
    this.playing = !this.playing;
    this.notifyChanged();
  }

  private panTimeline(deltaSeconds: number): void {
    this.setActiveTab('clips');
    this.timelineStart = Math.max(0, this.timelineStart + deltaSeconds);
    this.setPreviewing(true, false);
    this.notifyChanged();
  }

  private zoomTimeline(factor: number, anchorTime = this.currentTime): void {
    if (!Number.isFinite(factor) || factor <= 0) return;

    this.setActiveTab('clips');
    const center = Math.max(0, anchorTime);
    const nextSpan = Math.max(0.5, Math.min(120, this.timelineSpan * factor));
    const progress = (center - this.timelineStart) / Math.max(0.0001, this.timelineSpan);
    this.timelineSpan = nextSpan;
    this.timelineStart = Math.max(0, center - nextSpan * clamp01(progress));
    this.setPreviewing(true, false);
    this.notifyChanged();
  }

  private toggleRealtimeRecording(): void {
    if (this.realtimeRecording) {
      this.stopRealtimeRecording({ save: true });
      return;
    }

    this.startRealtimeRecording();
  }

  private startRealtimeRecording(): void {
    const clip = this.getActiveClip();
    if (!clip) {
      this.statusText = 'Create a clip before recording';
      this.notifyChanged();
      return;
    }

    this.setActiveTab('clips');
    this.playing = false;
    this.setPreviewing(false, false);
    this.clearSelectedKeyframes();
    this.realtimeRecording = true;
    this.realtimeRecordStartTime = roundClipTime(this.currentTime);
    this.realtimeRecordedKeyCount = 0;
    this.realtimeValueSnapshot.clear();
    if (this.clipPreviewUsesTimelineBase) {
      this.applyClipPreview(clip);
    }
    this.options.beforeRecord?.();

    for (const path of this.options.animatablePaths) {
      const value = this.options.readValue(path);
      if (value !== undefined) {
        this.realtimeValueSnapshot.set(path, value);
      }
    }

    this.statusText = 'Recording...';
    this.notifyChanged();
  }

  private stopRealtimeRecording(options: { save: boolean }): void {
    if (!this.realtimeRecording) return;

    const recordedCount = this.realtimeRecordedKeyCount;
    this.realtimeRecording = false;
    this.realtimeValueSnapshot.clear();
    this.realtimeRecordedKeyCount = 0;
    this.statusText = recordedCount > 0
      ? `Stopped recording, added ${recordedCount} keys`
      : 'Stopped recording, no changes';
    this.notifyChanged();

    if (options.save && recordedCount > 0) {
      this.saveClipLibrary();
    }
  }

  private selectKeyframe(time: number): void {
    this.selectKeyframes([time]);
  }

  private selectKeyframes(times: readonly number[]): void {
    this.setActiveTab('clips');
    this.setSelectedKeyTimes(times);
    this.playing = false;
    this.setPreviewing(true, false);
    this.notifyChanged();
  }

  private updateSelectedKeyParameterEase(path: string, ease: AnimationEase): void {
    const clip = this.getActiveClip();
    const selectedTimes = this.getSelectedKeyTimes();
    if (!clip || selectedTimes.length === 0) return;

    const track = clip.tracks[path];
    if (!track) return;

    let changed = 0;
    for (const selectedTime of selectedTimes) {
      const keyframe = this.findKeyframeAtTime(track, selectedTime);
      if (!keyframe || keyframe.ease === ease) continue;

      keyframe.ease = ease;
      changed += 1;
    }

    if (changed === 0) return;

    this.statusText = selectedTimes.length > 1
      ? `Set ${path} transition on ${changed} keys`
      : `Set ${path} transition to ${ease}`;
    this.notifyChanged();
    this.saveClipLibrary();
  }

  private moveKeyframeGroups(
    fromTimes: readonly number[],
    primaryFromTime: number,
    primaryToTime: number,
  ): void {
    const clip = this.getActiveClip();
    if (!clip) return;

    this.setActiveTab('clips');
    const sourceTimes = Array.from(new Set(
      fromTimes
        .map((time) => this.getKeyGroupTimeNear(clip, time) ?? roundClipTime(time))
        .filter((time) => this.hasAnyKeyAtTime(clip, time)),
    )).sort((left, right) => left - right);
    if (sourceTimes.length === 0) return;

    const primarySourceTime = this.getKeyGroupTimeNear(clip, primaryFromTime) ?? roundClipTime(primaryFromTime);
    const minSourceTime = Math.min(...sourceTimes);
    const targetPrimaryTime = Math.max(
      primarySourceTime - minSourceTime,
      this.getKeyGroupTimeNear(clip, primaryToTime, sourceTimes) ?? roundClipTime(primaryToTime),
    );
    const delta = targetPrimaryTime - primarySourceTime;
    if (Math.abs(delta) <= 0.0001) {
      this.selectKeyframes(sourceTimes);
      return;
    }

    const sourceTimeSet = new Set(sourceTimes.map((time) => formatTimeKey(time)));
    const movingKeys: Array<{ path: string; keyframe: AnimationKeyframe; targetTime: number }> = [];
    const targetTimes: number[] = [];

    for (const [path, track] of Object.entries(clip.tracks)) {
      for (const keyframe of track) {
        const keyTime = roundClipTime(keyframe.t);
        if (!sourceTimeSet.has(formatTimeKey(keyTime))) continue;

        const targetTime = roundClipTime(Math.max(0, keyTime + delta));
        movingKeys.push({ path, keyframe: { ...keyframe, t: targetTime }, targetTime });
        targetTimes.push(targetTime);
      }
    }

    if (movingKeys.length === 0) return;

    const uniqueTargetTimes = Array.from(new Set(targetTimes)).sort((left, right) => left - right);
    const willMerge = uniqueTargetTimes.some((targetTime) => this.hasAnyKeyAtTime(clip, targetTime, sourceTimes));
    const affectedPaths = new Set(movingKeys.map((item) => item.path));
    for (const path of affectedPaths) {
      const pathTargetTimes = Array.from(new Set(
        movingKeys
          .filter((item) => item.path === path)
          .map((item) => item.targetTime),
      ));
      for (const sourceTime of sourceTimes) {
        this.deleteParameterKeyAtTime(clip, path, sourceTime);
      }
      for (const targetTime of pathTargetTimes) {
        this.deleteParameterKeyAtTime(clip, path, targetTime);
      }
    }

    for (const { path, keyframe } of movingKeys) {
      const track = clip.tracks[path] ?? [];
      track.push(keyframe);
      track.sort((a, b) => a.t - b.t);
      clip.tracks[path] = track;
    }

    this.currentTime = roundClipTime(Math.max(0, primarySourceTime + delta));
    this.setSelectedKeyTimes(uniqueTargetTimes);
    this.playing = false;
    this.setPreviewing(true, false);
    this.updateClipDurationFromKeys(clip, { preserveCurrentTime: true });
    this.ensureTimelineContains(this.currentTime);
    this.applyClipPreview(clip);
    this.statusText = willMerge
      ? `Merged ${movingKeys.length} parameter keys`
      : `Moved ${movingKeys.length} parameter keys`;
    this.notifyChanged();
    this.saveClipLibrary();
  }

  private addParameterKeyAtCurrentTime(path: string): void {
    const clip = this.getActiveClip();
    if (!clip || !this.animatablePathSet.has(path)) return;

    this.options.beforeRecord?.();
    const value = this.options.readValue(path);
    if (value === undefined) return;

    const time = this.getKeyGroupTimeNear(clip, this.currentTime) ?? roundClipTime(this.currentTime);
    this.deleteParameterKeyAtTime(clip, path, time);
    upsertKeyframe(clip, path, createKeyframe(time, value, clip.defaultEase));
    this.updateClipDurationFromKeys(clip, { preserveCurrentTime: true });
    this.setSelectedKeyTimes([time]);
    this.statusText = `Added ${path}`;
    this.notifyChanged();
    this.saveClipLibrary();
  }

  private selectTab(tab: AnimationPanelTab): void {
    this.stopRealtimeRecording({ save: true });
    this.setActiveTab(tab);
    this.playing = false;
    if (tab === 'timeline') {
      this.clearSelectedKeyframes();
      this.setPreviewing(true, false);
      this.options.applyTimeline(this.library, this.timeline, this.timelineTime);
    }
    this.notifyChanged();
  }

  private toggleTimelinePlayback(): void {
    const duration = getTimelineDuration(this.timeline);
    if (duration <= 0) return;

    if (this.timelineTime >= duration) {
      this.timelineTime = 0;
      this.selectedTimelineInstanceId = null;
    }

    this.setPreviewing(true, false);
    this.playing = !this.playing;
    this.notifyChanged();
  }

  setTimelineTime(time: number): void {
    if (!Number.isFinite(time)) return;

    this.stopRealtimeRecording({ save: true });
    this.setActiveTab('timeline');
    this.timelineTime = Math.max(0, time);
    this.playing = false;
    this.setPreviewing(true, false);
    this.selectedTimelineInstanceId = null;
    this.ensureCompositionContains(this.timelineTime);
    this.options.applyTimeline(this.library, this.timeline, this.timelineTime);
    this.notifyChanged();
  }

  private panComposition(deltaSeconds: number): void {
    this.setActiveTab('timeline');
    this.compositionStart = Math.max(0, this.compositionStart + deltaSeconds);
    this.setPreviewing(true, false);
    this.notifyChanged();
  }

  private zoomComposition(factor: number, anchorTime = this.timelineTime): void {
    if (!Number.isFinite(factor) || factor <= 0) return;

    this.setActiveTab('timeline');
    const center = Math.max(0, anchorTime);
    const nextSpan = Math.max(1, Math.min(180, this.compositionSpan * factor));
    const progress = (center - this.compositionStart) / Math.max(0.0001, this.compositionSpan);
    this.compositionSpan = nextSpan;
    this.compositionStart = Math.max(0, center - nextSpan * clamp01(progress));
    this.setPreviewing(true, false);
    this.notifyChanged();
  }

  private addTimelineInstance(clipId: string, trackId: string, start: number): void {
    const clip = this.library.clips.find((item) => item.id === clipId);
    const track = this.timeline.tracks.find((item) => item.id === trackId);
    if (!clip || !track) return;

    const instance = createTimelineClipInstance(clip, track.id, start);
    track.items.push(instance);
    this.sortTimelineTrack(track);
    this.setActiveTab('timeline');
    this.selectedTimelineInstanceId = instance.id;
    this.setPreviewing(true, false);
    this.options.applyTimeline(this.library, this.timeline, this.timelineTime);
    this.statusText = `Added ${clip.name} to ${track.name}`;
    this.notifyChanged();
    this.saveTimeline();
  }

  private moveTimelineInstance(instanceId: string, trackId: string, start: number): void {
    this.applyTimelineInstancePatch(instanceId, { trackId, start }, {
      save: true,
      statusText: 'Moved clip instance',
    });
  }

  private previewTimelineInstanceMove(instanceId: string, trackId: string, start: number): void {
    this.applyTimelineInstancePatch(instanceId, { trackId, start }, { save: false });
  }

  private selectTimelineInstance(instanceId: string): void {
    if (!this.findTimelineInstance(instanceId)) return;

    this.setActiveTab('timeline');
    this.selectedTimelineInstanceId = instanceId;
    this.playing = false;
    this.setPreviewing(true, false);
    this.notifyChanged();
  }

  private deleteTimelineInstance(instanceId: string): void {
    const found = this.findTimelineInstance(instanceId);
    if (!found) return;

    found.track.items.splice(found.index, 1);
    if (this.selectedTimelineInstanceId === instanceId) {
      this.selectedTimelineInstanceId = null;
    }
    this.setActiveTab('timeline');
    this.playing = false;
    this.setPreviewing(true, false);
    this.options.applyTimeline(this.library, this.timeline, this.timelineTime);
    this.statusText = 'Deleted clip instance';
    this.notifyChanged();
    this.saveTimeline();
  }

  private updateTimelineInstance(instanceId: string, patch: Partial<TimelineClipInstance>): void {
    this.applyTimelineInstancePatch(instanceId, patch, {
      save: true,
      statusText: 'Updated clip instance',
    });
  }

  private previewTimelineInstanceUpdate(instanceId: string, patch: Partial<TimelineClipInstance>): void {
    this.applyTimelineInstancePatch(instanceId, patch, { save: false });
  }

  private addTimelineTag(time: number): void {
    if (!Number.isFinite(time)) return;

    this.setActiveTab('timeline');
    this.timeline.tags.push({
      id: createTimelineTagId(),
      time: roundTimelineTime(time),
      color: createRandomTimelineTagColor(),
    });
    this.sortTimelineTags();
    this.statusText = 'Added timeline tag';
    this.notifyChanged();
    this.saveTimeline();
  }

  private moveTimelineTag(tagId: string, time: number): void {
    if (!Number.isFinite(time)) return;

    const tag = this.timeline.tags.find((item) => item.id === tagId);
    if (!tag) return;

    const nextTime = roundTimelineTime(time);
    if (Math.abs(tag.time - nextTime) <= 0.0001) return;

    tag.time = nextTime;
    this.setActiveTab('timeline');
    this.sortTimelineTags();
    this.statusText = 'Moved timeline tag';
    this.notifyChanged();
    this.saveTimeline();
  }

  private deleteTimelineTag(tagId: string): void {
    const index = this.timeline.tags.findIndex((tag) => tag.id === tagId);
    if (index < 0) return;

    this.timeline.tags.splice(index, 1);
    this.setActiveTab('timeline');
    this.statusText = 'Deleted timeline tag';
    this.notifyChanged();
    this.saveTimeline();
  }

  private applyTimelineInstancePatch(
    instanceId: string,
    patch: Partial<TimelineClipInstance>,
    options: { save: boolean; statusText?: string },
  ): void {
    const found = this.findTimelineInstance(instanceId);
    if (!found) return;

    let track = found.track;
    let instance = found.instance;
    if (typeof patch.trackId === 'string' && patch.trackId.length > 0 && patch.trackId !== found.track.id) {
      const targetTrack = this.timeline.tracks.find((item) => item.id === patch.trackId);
      if (!targetTrack) return;

      const [movedInstance] = found.track.items.splice(found.index, 1);
      if (!movedInstance) return;

      instance = movedInstance;
      instance.trackId = targetTrack.id;
      targetTrack.items.push(instance);
      this.sortTimelineTrack(found.track);
      track = targetTrack;
    } else if (typeof patch.trackId === 'string' && patch.trackId.length > 0) {
      instance.trackId = track.id;
    }

    if (typeof patch.start === 'number') {
      instance.start = roundTimelineTime(patch.start);
    }
    if (typeof patch.duration === 'number') {
      instance.duration = Math.max(0.01, roundTimelineTime(patch.duration));
    }
    if (typeof patch.speed === 'number' && Number.isFinite(patch.speed)) {
      instance.speed = Math.max(0.01, patch.speed);
    }
    if (typeof patch.loop === 'boolean') {
      instance.loop = patch.loop;
    }
    if (typeof patch.reverse === 'boolean') {
      instance.reverse = patch.reverse;
    }
    if (patch.postMode === 'hold' || patch.postMode === 'none') {
      instance.postMode = patch.postMode;
    }
    this.sortTimelineTrack(track);
    this.setActiveTab('timeline');
    this.selectedTimelineInstanceId = instance.id;
    this.setPreviewing(true, false);
    this.options.applyTimeline(this.library, this.timeline, this.timelineTime);
    if (options.statusText) {
      this.statusText = options.statusText;
    }
    this.notifyChanged();
    if (options.save) {
      this.saveTimeline();
    }
  }

  private deleteSelectedKeyframe(): void {
    const clip = this.getActiveClip();
    const selectedTimes = this.getSelectedKeyTimes();
    if (!clip || selectedTimes.length === 0) return;

    let removed = 0;
    for (const path of Object.keys(clip.tracks)) {
      for (const keyTime of selectedTimes) {
        removed += this.deleteParameterKeyAtTime(clip, path, keyTime);
      }
    }

    if (removed === 0) return;

    this.updateClipDurationFromKeys(clip, { preserveCurrentTime: true });
    this.clearSelectedKeyframes();
    this.statusText = `Deleted ${removed} parameter keys`;
    this.notifyChanged();
    this.saveClipLibrary();
  }

  private createKeyframeGroups(): TimelineKeyframeGroup[] {
    const clip = this.getActiveClip();
    if (!clip) return [];

    const groups = new Map<string, TimelineKeyframeGroup>();
    const selectedTimeSet = new Set(this.getSelectedKeyTimes().map((time) => formatTimeKey(time)));
    for (const track of Object.values(clip.tracks)) {
      for (const keyframe of track) {
        const time = roundClipTime(keyframe.t);
        const id = time.toFixed(2);
        const group = groups.get(id) ?? {
          id,
          time,
          count: 0,
          selected: selectedTimeSet.has(formatTimeKey(time)),
        };
        group.count += 1;
        groups.set(id, group);
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.time - b.time);
  }

  private createSelectedKeyDetails(): SelectedKeyframeDetail[] {
    const clip = this.getActiveClip();
    const selectedTimes = this.getSelectedKeyTimes();
    if (!clip || selectedTimes.length === 0) return [];

    const [firstSelectedTime, ...remainingSelectedTimes] = selectedTimes;
    if (firstSelectedTime === undefined) return [];

    const commonPaths = new Set<string>();
    for (const [path, track] of Object.entries(clip.tracks)) {
      if (this.findKeyframeAtTime(track, firstSelectedTime)) {
        commonPaths.add(path);
      }
    }

    for (const selectedTime of remainingSelectedTimes) {
      for (const path of Array.from(commonPaths)) {
        const track = clip.tracks[path];
        if (!track || !this.findKeyframeAtTime(track, selectedTime)) {
          commonPaths.delete(path);
        }
      }
    }

    const details: SelectedKeyframeDetail[] = [];
    for (const path of commonPaths) {
      const track = clip.tracks[path];
      if (!track) continue;

      const keyframes = selectedTimes
        .map((time) => ({ time, keyframe: this.findKeyframeAtTime(track, time) }))
        .filter((item): item is { time: number; keyframe: AnimationKeyframe } => item.keyframe !== undefined);
      if (keyframes.length !== selectedTimes.length) continue;

      const easeValues = keyframes.map((item) => item.keyframe.ease ?? clip.defaultEase);
      const firstEase = easeValues[0]!;
      const ease = easeValues.every((value) => value === firstEase) ? firstEase : 'mixed';
      const disabled = keyframes.every((item) => !track.some((keyframe) => roundClipTime(keyframe.t) < item.time - 0.0001));
      details.push({ path, ease, disabled });
    }

    return details.sort((a, b) => a.path.localeCompare(b.path));
  }

  private createKeyframeFitPaths(clip: AnimationClip): string[] {
    return getNumericKeyframeFitPaths(clip, this.options.animatablePaths);
  }

  private getParameterKeyActionTime(clip: AnimationClip, path: string): number | null {
    if (this.selectedKeyTime !== null && this.hasParameterKeyAtTime(clip, path, this.selectedKeyTime)) {
      return this.selectedKeyTime;
    }

    const currentTime = roundClipTime(this.currentTime);
    return this.hasParameterKeyAtTime(clip, path, currentTime) ? currentTime : null;
  }

  private hasParameterKeyAtTime(clip: AnimationClip, path: string, time: number): boolean {
    return clip.tracks[path]?.some((keyframe) => Math.abs(roundClipTime(keyframe.t) - time) <= 0.0001) ?? false;
  }

  private findKeyframeAtTime(track: readonly AnimationKeyframe[], time: number): AnimationKeyframe | undefined {
    return track.find((keyframe) => Math.abs(roundClipTime(keyframe.t) - time) <= 0.0001);
  }

  private getKeyGroupTimeNear(
    clip: AnimationClip,
    time: number,
    excludeTimes: number | readonly number[] | null = null,
  ): number | null {
    const roundedTime = roundClipTime(time);
    let nearestTime: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const excludedTimeSet = createTimeSet(
      excludeTimes === null
        ? []
        : Array.isArray(excludeTimes)
          ? excludeTimes
          : [excludeTimes],
    );

    for (const track of Object.values(clip.tracks)) {
      for (const keyframe of track) {
        const keyTime = roundClipTime(keyframe.t);
        if (excludedTimeSet.has(formatTimeKey(keyTime))) continue;

        const distance = Math.abs(keyTime - roundedTime);
        if (distance <= 0.0001 && distance < nearestDistance) {
          nearestTime = keyTime;
          nearestDistance = distance;
        }
      }
    }

    return nearestTime;
  }

  private hasAnyKeyAtTime(
    clip: AnimationClip,
    time: number,
    excludeTimes: number | readonly number[] | null = null,
  ): boolean {
    return this.getKeyGroupTimeNear(clip, time, excludeTimes) !== null;
  }

  private deleteParameterKeyAtTime(clip: AnimationClip, path: string, time: number): number {
    const track = clip.tracks[path];
    if (!track) return 0;

    let removed = 0;
    const nextTrack = track.filter((keyframe) => {
      const shouldKeep = Math.abs(roundClipTime(keyframe.t) - time) > 0.0001;
      if (!shouldKeep) {
        removed += 1;
      }
      return shouldKeep;
    });

    if (nextTrack.length === 0) {
      delete clip.tracks[path];
    } else {
      clip.tracks[path] = nextTrack;
    }

    return removed;
  }

  private getKeyedDuration(clip: AnimationClip): number | null {
    if (getKeyframeCount(clip) === 0) return null;

    let duration = 0;
    for (const track of Object.values(clip.tracks)) {
      for (const keyframe of track) {
        duration = Math.max(duration, keyframe.t);
      }
    }

    return roundClipTime(duration);
  }

  private updateClipDurationFromKeys(clip: AnimationClip, options: { preserveCurrentTime?: boolean } = {}): void {
    const previousTime = this.currentTime;
    const duration = this.getKeyedDuration(clip);
    clip.duration = Math.max(0.01, duration ?? 0.01);

    if (options.preserveCurrentTime) {
      this.currentTime = previousTime;
    } else {
      this.currentTime = Math.min(this.currentTime, clip.duration);
    }
  }

  private updateAllClipDurationsFromKeys(): void {
    for (const clip of this.library.clips) {
      this.updateClipDurationFromKeys(clip, { preserveCurrentTime: true });
    }
  }

  private ensureTimelineContains(time: number): void {
    if (time < this.timelineStart) {
      this.timelineStart = Math.max(0, time - this.timelineSpan * 0.1);
      return;
    }

    if (time > this.timelineStart + this.timelineSpan) {
      this.timelineStart = Math.max(0, time - this.timelineSpan * 0.9);
    }
  }

  private ensureCompositionContains(time: number): void {
    if (time < this.compositionStart) {
      this.compositionStart = Math.max(0, time - this.compositionSpan * 0.1);
      return;
    }

    if (time > this.compositionStart + this.compositionSpan) {
      this.compositionStart = Math.max(0, time - this.compositionSpan * 0.9);
    }
  }

  private saveClipLibrary(): void {
    void this.options.saveLibrary(this.library).catch((error) => {
      console.warn('Failed to save animation clips.', error);
      this.statusText = 'Failed to save clip';
      this.notifyChanged();
    });
  }

  private saveTimeline(): void {
    void this.options.saveTimeline(this.timeline).catch((error) => {
      console.warn('Failed to save timeline composition.', error);
      this.statusText = 'Failed to save timeline';
      this.notifyChanged();
    });
  }

  private setPreviewing(previewing: boolean, notify = true): void {
    if (this.previewing === previewing) return;

    if (previewing) {
      this.stopRealtimeRecording({ save: true });
    } else if (this.realtimeRecording) {
      this.stopRealtimeRecording({ save: true });
    }

    this.previewing = previewing;
    if (!previewing) {
      this.playing = false;
      this.clearSelectedKeyframes();
    }
    this.options.onPreviewChange?.(previewing);
    if (notify) {
      this.notifyChanged();
    }
  }

  private notifyChanged(): void {
    this.options.onChange?.();
  }

  private setActiveTab(tab: AnimationPanelTab): void {
    this.activeTab = tab;
    sharedAnimationPanelTab = tab;
  }

  private setPreviewingFromPanel(previewing: boolean): void {
    this.setPreviewing(previewing, false);

    const clip = this.getActiveClip();
    if (previewing && this.activeTab === 'timeline') {
      this.options.applyTimeline(this.library, this.timeline, this.timelineTime);
    } else if (previewing && clip) {
      this.applyClipPreview(clip);
    }

    this.notifyChanged();
  }

  private findTimelineInstance(instanceId: string): {
    track: TimelineTrack;
    instance: TimelineClipInstance;
    index: number;
  } | null {
    for (const track of this.timeline.tracks) {
      const index = track.items.findIndex((item) => item.id === instanceId);
      if (index >= 0) {
        return { track, instance: track.items[index]!, index };
      }
    }

    return null;
  }

  private sortTimelineTrack(track: TimelineTrack): void {
    track.items.sort((left, right) => left.start - right.start);
  }

  private sortTimelineTags(): void {
    this.timeline.tags.sort((left, right) => left.time - right.time);
  }

  private removeTimelineInstancesForClip(clipId: string): number {
    let removed = 0;

    for (const track of this.timeline.tracks) {
      track.items = track.items.filter((item) => {
        if (item.clipId !== clipId) return true;

        removed += 1;
        if (this.selectedTimelineInstanceId === item.id) {
          this.selectedTimelineInstanceId = null;
        }
        return false;
      });
    }

    return removed;
  }
}

function createUniqueClipId(library: AnimationClipLibrary, baseId: string): string {
  const existingIds = new Set(library.clips.map((clip) => clip.id));
  let candidate = baseId;
  let index = 2;

  while (existingIds.has(candidate)) {
    candidate = `${baseId}-${index}`;
    index += 1;
  }

  return candidate;
}

function roundClipTime(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatTimeKey(value: number): string {
  return roundClipTime(value).toFixed(2);
}

function createTimeSet(times: readonly number[]): Set<string> {
  return new Set(times.map((time) => formatTimeKey(time)));
}

function createTimelineTagId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `tag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createRandomTimelineTagColor(): string {
  return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function areAnimationValuesEqual(left: AnimationValue, right: AnimationValue): boolean {
  if (typeof left === 'number' || typeof right === 'number') {
    return typeof left === 'number'
      && typeof right === 'number'
      && Number.isFinite(left)
      && Number.isFinite(right)
      && Math.abs(left - right) <= 0.000001;
  }

  return left === right;
}
