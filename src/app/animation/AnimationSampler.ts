import type { AnimationClip, AnimationEase, AnimationKeyframe, AnimationValue } from './AnimationClip';
import { interpolateHexColor, isHexColor } from './ColorInterpolation';
import { cloneParameterObject, setParameterValue } from './ParameterPath';

export function sampleClipInto<T>(baseSettings: T, clip: AnimationClip, timeSeconds: number): T {
  const settings = cloneParameterObject(baseSettings);
  const time = Math.max(0, Math.min(clip.duration, timeSeconds));

  for (const [path, track] of Object.entries(clip.tracks)) {
    const value = sampleTrack(track, time, clip.defaultEase);
    if (value !== undefined) {
      setParameterValue(settings, path, value);
    }
  }

  return settings;
}

export function sampleTrack(
  track: AnimationKeyframe[],
  timeSeconds: number,
  defaultEase: AnimationEase,
): AnimationValue | undefined {
  if (track.length === 0) {
    return undefined;
  }

  const sortedTrack = track;
  const first = sortedTrack[0]!;
  const last = sortedTrack[sortedTrack.length - 1]!;

  if (timeSeconds <= first.t) {
    return first.v;
  }

  if (timeSeconds >= last.t) {
    return last.v;
  }

  for (let index = 1; index < sortedTrack.length; index += 1) {
    const previous = sortedTrack[index - 1]!;
    const next = sortedTrack[index]!;
    if (timeSeconds <= next.t) {
      return interpolateKeyframes(previous, next, timeSeconds, next.ease ?? defaultEase);
    }
  }

  return last.v;
}

function interpolateKeyframes(
  previous: AnimationKeyframe,
  next: AnimationKeyframe,
  timeSeconds: number,
  ease: AnimationEase,
): AnimationValue {
  if (timeSeconds >= next.t) {
    return next.v;
  }

  if (ease === 'step') {
    return previous.v;
  }

  const span = Math.max(0.0001, next.t - previous.t);
  const rawProgress = Math.max(0, Math.min(1, (timeSeconds - previous.t) / span));
  const progress = ease === 'auto' ? smoothstep(rawProgress) : rawProgress;

  if (typeof previous.v === 'number' && typeof next.v === 'number') {
    return previous.v + (next.v - previous.v) * progress;
  }

  if (isHexColor(previous.v) && isHexColor(next.v)) {
    return interpolateHexColor(previous.v, next.v, progress);
  }

  return previous.v;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}
