import {
  createKeyframe,
  type AnimationClip,
  type AnimationKeyframe,
} from './AnimationClip';
import { sampleTrack } from './AnimationSampler';

export type KeyframeFitAxis = 'x' | 'y' | 'z';

export type KeyframeFitAxisSelection = Record<KeyframeFitAxis, string | null>;

export type KeyframeFitResult = {
  keptTimes: number[];
  removedKeyCount: number;
  insertedKeyCount: number;
  dimension: number;
  paths: string[];
};

export type KeyframeFitOutcome =
  | { ok: true; result: KeyframeFitResult }
  | { ok: false; reason: string };

export type KeyframeFitOptions = {
  uniformSpeed?: boolean;
  toleranceRatio?: number;
};

type FitSample = {
  time: number;
  point: number[];
};

export const KEYFRAME_FIT_AXES: readonly KeyframeFitAxis[] = ['x', 'y', 'z'];
export const KEYFRAME_FIT_DEFAULT_TOLERANCE_RATIO = 0.025;
export const KEYFRAME_FIT_MIN_TOLERANCE_RATIO = 0.005;
export const KEYFRAME_FIT_MAX_TOLERANCE_RATIO = 0.12;
export const KEYFRAME_FIT_TOLERANCE_STEP_RATIO = 0.005;

export function createEmptyKeyframeFitAxes(): KeyframeFitAxisSelection {
  return { x: null, y: null, z: null };
}

export function getKeyframeFitPaths(axes: KeyframeFitAxisSelection): string[] {
  const paths: string[] = [];
  for (const axis of KEYFRAME_FIT_AXES) {
    const path = axes[axis];
    if (path && !paths.includes(path)) {
      paths.push(path);
    }
  }

  return paths;
}

export function getNumericKeyframeFitPaths(
  clip: AnimationClip,
  animatablePaths: readonly string[],
): string[] {
  const animatablePathSet = new Set(animatablePaths);
  return Object.entries(clip.tracks)
    .filter(([path, track]) => {
      return animatablePathSet.has(path)
        && track.length > 0
        && track.every((keyframe) => typeof keyframe.v === 'number' && Number.isFinite(keyframe.v));
    })
    .map(([path]) => path)
    .sort((left, right) => left.localeCompare(right));
}

export function normalizeKeyframeFitAxes(
  axes: KeyframeFitAxisSelection,
  availablePaths: readonly string[],
): KeyframeFitAxisSelection {
  const availablePathSet = new Set(availablePaths);
  const normalized = createEmptyKeyframeFitAxes();
  const usedPaths = new Set<string>();

  for (const axis of KEYFRAME_FIT_AXES) {
    const path = axes[axis];
    if (!path || !availablePathSet.has(path) || usedPaths.has(path)) continue;

    normalized[axis] = path;
    usedPaths.add(path);
  }

  return normalized;
}

export function normalizeKeyframeFitToleranceRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return KEYFRAME_FIT_DEFAULT_TOLERANCE_RATIO;
  }

  return Math.max(
    KEYFRAME_FIT_MIN_TOLERANCE_RATIO,
    Math.min(KEYFRAME_FIT_MAX_TOLERANCE_RATIO, value),
  );
}

export function cloneAnimationClip(clip: AnimationClip): AnimationClip {
  return JSON.parse(JSON.stringify(clip)) as AnimationClip;
}

export function fitSelectedKeyframes(
  clip: AnimationClip,
  selectedTimes: readonly number[],
  axes: KeyframeFitAxisSelection,
  options: KeyframeFitOptions = {},
): KeyframeFitOutcome {
  const times = normalizeTimes(selectedTimes);
  if (times.length < 2) {
    return { ok: false, reason: 'Select at least two keyframes' };
  }

  const paths = getKeyframeFitPaths(axes);
  if (paths.length === 0) {
    return { ok: false, reason: 'Choose at least one fit axis' };
  }

  const samples: FitSample[] = [];
  for (const time of times) {
    const point: number[] = [];
    for (const path of paths) {
      const track = clip.tracks[path];
      const value = track ? sampleTrack(track, time, clip.defaultEase) : undefined;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, reason: `${path} cannot be sampled as numeric` };
      }

      point.push(value);
    }
    samples.push({ time, point });
  }

  const toleranceRatio = normalizeKeyframeFitToleranceRatio(
    options.toleranceRatio ?? KEYFRAME_FIT_DEFAULT_TOLERANCE_RATIO,
  );
  const keptIndexes = simplifySamples(samples, toleranceRatio);
  const keptTimes = options.uniformSpeed
    ? getUniformSpeedTimes(samples, keptIndexes)
    : keptIndexes.map((index) => samples[index]!.time);
  const selectedTimeSet = new Set(times.map((time) => formatTimeKey(time)));
  const outputEase = options.uniformSpeed ? 'linear' : 'auto';
  let removedKeyCount = 0;
  let insertedKeyCount = 0;

  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    const path = paths[pathIndex]!;
    const track = clip.tracks[path] ?? [];
    const nextTrack = track.filter((keyframe) => {
      const selected = selectedTimeSet.has(formatTimeKey(keyframe.t));
      if (selected) {
        removedKeyCount += 1;
      }
      return !selected;
    });

    for (let keptPosition = 0; keptPosition < keptIndexes.length; keptPosition += 1) {
      const sampleIndex = keptIndexes[keptPosition]!;
      const sample = samples[sampleIndex]!;
      upsertFitKeyframe(nextTrack, keptTimes[keptPosition]!, sample.point[pathIndex]!, outputEase);
      insertedKeyCount += 1;
    }

    nextTrack.sort((left, right) => left.t - right.t);
    if (nextTrack.length === 0) {
      delete clip.tracks[path];
    } else {
      clip.tracks[path] = nextTrack;
    }
  }

  return {
    ok: true,
    result: {
      keptTimes,
      removedKeyCount,
      insertedKeyCount,
      dimension: paths.length,
      paths,
    },
  };
}

function getUniformSpeedTimes(samples: readonly FitSample[], keptIndexes: readonly number[]): number[] {
  const start = samples[0];
  const end = samples[samples.length - 1];
  if (!start || !end || keptIndexes.length === 0) {
    return [];
  }

  const duration = end.time - start.time;
  if (duration <= 0.0001) {
    return keptIndexes.map((index) => samples[index]!.time);
  }

  const distances = getCumulativeDistances(samples);
  const totalDistance = distances[distances.length - 1] ?? 0;
  if (totalDistance <= 0.000001) {
    return keptIndexes.map((index) => samples[index]!.time);
  }

  return keptIndexes.map((sampleIndex, keptIndex) => {
    if (keptIndex === 0) return start.time;
    if (keptIndex === keptIndexes.length - 1) return end.time;

    const progress = (distances[sampleIndex] ?? 0) / totalDistance;
    return roundClipTime(start.time + duration * progress);
  });
}

function getCumulativeDistances(samples: readonly FitSample[]): number[] {
  const distances: number[] = [0];
  for (let index = 1; index < samples.length; index += 1) {
    distances[index] = distances[index - 1]! + getPointDistance(samples[index - 1]!.point, samples[index]!.point);
  }

  return distances;
}

function getPointDistance(left: readonly number[], right: readonly number[]): number {
  let sum = 0;
  const dimensions = Math.min(left.length, right.length);
  for (let index = 0; index < dimensions; index += 1) {
    const delta = right[index]! - left[index]!;
    sum += delta * delta;
  }

  return Math.sqrt(sum);
}

function upsertFitKeyframe(
  track: AnimationKeyframe[],
  time: number,
  value: number,
  ease: 'auto' | 'linear',
): void {
  const existing = track.find((keyframe) => Math.abs(roundClipTime(keyframe.t) - roundClipTime(time)) <= 0.0001);
  if (existing) {
    existing.t = Math.max(0, time);
    existing.v = value;
    existing.ease = ease;
    return;
  }

  track.push(createKeyframe(time, value, ease));
}

function normalizeTimes(times: readonly number[]): number[] {
  return Array.from(new Set(
    times
      .filter((time) => Number.isFinite(time))
      .map((time) => roundClipTime(time)),
  )).sort((left, right) => left - right);
}

function simplifySamples(samples: readonly FitSample[], toleranceRatio: number): number[] {
  if (samples.length <= 2) {
    return samples.map((_, index) => index);
  }

  const tolerance = getFitTolerance(samples, toleranceRatio);
  const keptIndexes = new Set<number>([0, samples.length - 1]);
  simplifyRange(samples, 0, samples.length - 1, tolerance, keptIndexes);

  return Array.from(keptIndexes).sort((left, right) => left - right);
}

function simplifyRange(
  samples: readonly FitSample[],
  startIndex: number,
  endIndex: number,
  tolerance: number,
  keptIndexes: Set<number>,
): void {
  if (endIndex <= startIndex + 1) return;

  let maxDistance = -1;
  let maxIndex = -1;
  const start = samples[startIndex]!;
  const end = samples[endIndex]!;

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const distance = getSampleDistance(samples[index]!, start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance <= tolerance || maxIndex < 0) return;

  keptIndexes.add(maxIndex);
  simplifyRange(samples, startIndex, maxIndex, tolerance, keptIndexes);
  simplifyRange(samples, maxIndex, endIndex, tolerance, keptIndexes);
}

function getSampleDistance(sample: FitSample, start: FitSample, end: FitSample): number {
  const span = Math.max(0.0001, end.time - start.time);
  const rawProgress = Math.max(0, Math.min(1, (sample.time - start.time) / span));
  const progress = smoothstep(rawProgress);
  let sum = 0;

  for (let index = 0; index < sample.point.length; index += 1) {
    const startValue = start.point[index]!;
    const endValue = end.point[index]!;
    const interpolated = startValue + (endValue - startValue) * progress;
    const error = sample.point[index]! - interpolated;
    sum += error * error;
  }

  return Math.sqrt(sum);
}

function getFitTolerance(samples: readonly FitSample[], toleranceRatio: number): number {
  const dimensions = samples[0]?.point.length ?? 0;
  if (dimensions === 0) return 0;

  let diagonalSquared = 0;
  for (let dimension = 0; dimension < dimensions; dimension += 1) {
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;
    for (const sample of samples) {
      minValue = Math.min(minValue, sample.point[dimension]!);
      maxValue = Math.max(maxValue, sample.point[dimension]!);
    }
    const range = maxValue - minValue;
    diagonalSquared += range * range;
  }

  const diagonal = Math.sqrt(diagonalSquared);
  if (diagonal <= 0.000001) {
    return 0;
  }

  return Math.max(0.0001, diagonal * toleranceRatio);
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function roundClipTime(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function formatTimeKey(value: number): string {
  return roundClipTime(value).toFixed(2);
}
