export type AnimationEase = 'auto' | 'linear' | 'step';

export type AnimationValue = number | string | boolean;

export type AnimationKeyframe = {
  id?: string;
  t: number;
  v: AnimationValue;
  ease?: AnimationEase;
};

export type AnimationTrack = AnimationKeyframe[];

export type AnimationClip = {
  id: string;
  name: string;
  duration: number;
  defaultEase: AnimationEase;
  tracks: Record<string, AnimationTrack>;
};

export type AnimationClipLibrary = {
  version: 1;
  sceneId: string;
  clips: AnimationClip[];
};

export const DEFAULT_ANIMATION_EASE: AnimationEase = 'auto';

export function createEmptyClip(id: string, name: string): AnimationClip {
  return {
    id,
    name,
    duration: 5,
    defaultEase: DEFAULT_ANIMATION_EASE,
    tracks: {},
  };
}

export function createEmptyClipLibrary(sceneId: string): AnimationClipLibrary {
  return {
    version: 1,
    sceneId,
    clips: [],
  };
}

export function cloneClipLibrary(library: AnimationClipLibrary): AnimationClipLibrary {
  return JSON.parse(JSON.stringify(library)) as AnimationClipLibrary;
}

export function normalizeClipLibrary(sceneId: string, value: Partial<AnimationClipLibrary>): AnimationClipLibrary {
  const fallback = createEmptyClipLibrary(sceneId);
  const clips = Array.isArray(value.clips)
    ? value.clips.map((clip, index) => normalizeClip(clip, index)).filter((clip) => clip !== null)
    : [];

  return {
    version: 1,
    sceneId,
    clips: clips.length > 0 ? clips : fallback.clips,
  };
}

export function normalizeClip(value: Partial<AnimationClip>, index = 0): AnimationClip | null {
  const id = typeof value.id === 'string' && value.id.length > 0
    ? value.id
    : `clip-${index + 1}`;
  const name = typeof value.name === 'string' && value.name.length > 0
    ? value.name
    : id;
  const duration = typeof value.duration === 'number' && Number.isFinite(value.duration)
    ? Math.max(0.1, value.duration)
    : 5;
  const defaultEase = isAnimationEase(value.defaultEase) ? value.defaultEase : DEFAULT_ANIMATION_EASE;
  const tracks = normalizeTracks(value.tracks);

  return {
    id,
    name,
    duration,
    defaultEase,
    tracks,
  };
}

export function isAnimationEase(value: unknown): value is AnimationEase {
  return value === 'auto' || value === 'linear' || value === 'step';
}

export function createKeyframe(timeSeconds: number, value: AnimationValue, ease?: AnimationEase): AnimationKeyframe {
  return {
    id: createKeyframeId(),
    t: Math.max(0, timeSeconds),
    v: value,
    ease,
  };
}

export function upsertKeyframe(
  clip: AnimationClip,
  path: string,
  keyframe: AnimationKeyframe,
  timeTolerance = 0.0001,
): void {
  const track = clip.tracks[path] ?? [];
  const existing = track.find((item) => Math.abs(item.t - keyframe.t) <= timeTolerance);

  if (existing) {
    existing.v = keyframe.v;
    existing.ease = keyframe.ease;
    if (!existing.id) {
      existing.id = keyframe.id ?? createKeyframeId();
    }
  } else {
    track.push({
      id: keyframe.id ?? createKeyframeId(),
      t: Math.max(0, keyframe.t),
      v: keyframe.v,
      ease: keyframe.ease,
    });
  }

  track.sort((a, b) => a.t - b.t);
  clip.tracks[path] = track;
  clip.duration = Math.max(clip.duration, keyframe.t);
}

export function removeKeyframesAtTime(clip: AnimationClip, timeSeconds: number, timeTolerance = 0.03): number {
  let removed = 0;

  for (const [path, track] of Object.entries(clip.tracks)) {
    const nextTrack = track.filter((keyframe) => {
      const shouldKeep = Math.abs(keyframe.t - timeSeconds) > timeTolerance;
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
  }

  return removed;
}

export function getTrackCount(clip: AnimationClip): number {
  return Object.keys(clip.tracks).length;
}

export function getKeyframeCount(clip: AnimationClip): number {
  return Object.values(clip.tracks).reduce((total, track) => total + track.length, 0);
}

function normalizeTracks(value: unknown): Record<string, AnimationTrack> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const tracks: Record<string, AnimationTrack> = {};
  for (const [path, rawTrack] of Object.entries(value)) {
    if (!isValidPath(path) || !Array.isArray(rawTrack)) continue;

    const track = rawTrack
      .map((keyframe) => normalizeKeyframe(keyframe))
      .filter((keyframe) => keyframe !== null)
      .sort((a, b) => a.t - b.t);

    if (track.length > 0) {
      tracks[path] = track;
    }
  }

  return tracks;
}

function normalizeKeyframe(value: unknown): AnimationKeyframe | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<AnimationKeyframe>;
  if (typeof raw.t !== 'number' || !Number.isFinite(raw.t) || !isAnimationValue(raw.v)) {
    return null;
  }

  return {
    id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : createKeyframeId(),
    t: Math.max(0, raw.t),
    v: raw.v,
    ease: isAnimationEase(raw.ease) ? raw.ease : undefined,
  };
}

function isAnimationValue(value: unknown): value is AnimationValue {
  return typeof value === 'number' && Number.isFinite(value)
    || typeof value === 'string'
    || typeof value === 'boolean';
}

function isValidPath(value: string): boolean {
  return /^[A-Za-z0-9_$]+(\.[A-Za-z0-9_$]+)*$/.test(value);
}

function createKeyframeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `kf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
