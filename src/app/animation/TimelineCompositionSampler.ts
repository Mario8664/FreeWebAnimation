import type { AnimationClipLibrary, AnimationValue } from './AnimationClip';
import { sampleTrack } from './AnimationSampler';
import { interpolateHexColor, isHexColor } from './ColorInterpolation';
import { cloneParameterObject, setParameterValue } from './ParameterPath';
import {
  getClipInstanceSourceTime,
  getTimelineTrackItemsWithClips,
  type TimelineClipInstanceWithClip,
  type TimelineComposition,
} from './TimelineComposition';

type SampledTrackValues = Map<string, AnimationValue>;

type SampledTimelineTrack = {
  heldValues: SampledTrackValues;
  activeValues: SampledTrackValues;
};

export function sampleTimelineInto<T>(
  baseSettings: T,
  library: AnimationClipLibrary,
  composition: TimelineComposition,
  timeSeconds: number,
): T {
  const settings = cloneParameterObject(baseSettings);
  const trackSamples = composition.tracks.map((_, trackIndex) => (
    sampleTimelineTrackLayers(library, composition, trackIndex, timeSeconds)
  ));

  for (let trackIndex = composition.tracks.length - 1; trackIndex >= 0; trackIndex -= 1) {
    for (const [path, value] of trackSamples[trackIndex]!.heldValues) {
      setParameterValue(settings, path, value);
    }
  }

  for (let trackIndex = composition.tracks.length - 1; trackIndex >= 0; trackIndex -= 1) {
    for (const [path, value] of trackSamples[trackIndex]!.activeValues) {
      setParameterValue(settings, path, value);
    }
  }

  return settings;
}

export function sampleTimelineTrack(
  library: AnimationClipLibrary,
  composition: TimelineComposition,
  trackIndex: number,
  timeSeconds: number,
): SampledTrackValues {
  const { heldValues, activeValues } = sampleTimelineTrackLayers(
    library,
    composition,
    trackIndex,
    timeSeconds,
  );
  const values = new Map(heldValues);
  mergeTrackValues(values, activeValues);
  return values;
}

function sampleTimelineTrackLayers(
  library: AnimationClipLibrary,
  composition: TimelineComposition,
  trackIndex: number,
  timeSeconds: number,
): SampledTimelineTrack {
  const track = composition.tracks[trackIndex];
  if (!track) {
    return {
      heldValues: new Map(),
      activeValues: new Map(),
    };
  }

  const items = getTimelineTrackItemsWithClips(track, library);
  const activeItems = items.filter((item) => timeSeconds >= item.start && timeSeconds <= item.end);
  const heldValues = sampleHeldItems(items, timeSeconds);
  let activeValues = new Map<string, AnimationValue>();

  if (activeItems.length >= 2) {
    activeValues = sampleBlendArea(activeItems[0]!, activeItems[1]!, timeSeconds);
  } else if (activeItems.length === 1) {
    activeValues = sampleInstance(activeItems[0]!, timeSeconds);
  }

  return { heldValues, activeValues };
}

function sampleBlendArea(
  outgoing: TimelineClipInstanceWithClip,
  incoming: TimelineClipInstanceWithClip,
  timeSeconds: number,
): SampledTrackValues {
  const outgoingValues = sampleInstance(outgoing, timeSeconds);
  const incomingValues = sampleInstance(incoming, timeSeconds);
  const overlapStart = Math.max(outgoing.start, incoming.start);
  const overlapEnd = Math.min(outgoing.end, incoming.end);
  const rawProgress = overlapEnd <= overlapStart
    ? 1
    : (timeSeconds - overlapStart) / (overlapEnd - overlapStart);
  const progress = smoothstep(clamp01(rawProgress));
  const values = new Map<string, AnimationValue>();

  for (const [path, outgoingValue] of outgoingValues) {
    const incomingValue = incomingValues.get(path);
    if (incomingValue === undefined) {
      values.set(path, outgoingValue);
      continue;
    }

    values.set(path, blendAnimationValues(outgoingValue, incomingValue, progress));
  }

  for (const [path, incomingValue] of incomingValues) {
    if (!values.has(path)) {
      values.set(path, incomingValue);
    }
  }

  return values;
}

function sampleInstance(
  instance: TimelineClipInstanceWithClip,
  timelineTime: number,
): SampledTrackValues {
  const values = new Map<string, AnimationValue>();
  const sourceTime = getClipInstanceSourceTime(instance, instance.clip, timelineTime);

  for (const [path, track] of Object.entries(instance.clip.tracks)) {
    const value = sampleTrack(track, sourceTime, instance.clip.defaultEase);
    if (value !== undefined) {
      values.set(path, value);
    }
  }

  return values;
}

function sampleHeldItems(
  items: TimelineClipInstanceWithClip[],
  timeSeconds: number,
): SampledTrackValues {
  const values = new Map<string, AnimationValue>();

  const heldItems = items
    .filter((item) => item.end <= timeSeconds && item.postMode === 'hold')
    .sort((left, right) => left.end - right.end || left.start - right.start);

  for (const item of heldItems) {
    mergeTrackValues(values, sampleInstance(item, item.end));
  }

  return values;
}

function mergeTrackValues(
  target: SampledTrackValues,
  incoming: SampledTrackValues,
): void {
  for (const [path, value] of incoming) {
    target.set(path, value);
  }
}

function blendAnimationValues(
  outgoingValue: AnimationValue,
  incomingValue: AnimationValue,
  progress: number,
): AnimationValue {
  if (typeof outgoingValue === 'number' && typeof incomingValue === 'number') {
    return outgoingValue + (incomingValue - outgoingValue) * progress;
  }

  if (isHexColor(outgoingValue) && isHexColor(incomingValue)) {
    return interpolateHexColor(outgoingValue, incomingValue, progress);
  }

  return progress >= 0.5 ? incomingValue : outgoingValue;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
