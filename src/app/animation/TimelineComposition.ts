import type { AnimationClip, AnimationClipLibrary } from './AnimationClip';

export type TimelinePostMode = 'hold' | 'none';

export type TimelineClipInstance = {
  id: string;
  clipId: string;
  trackId: string;
  start: number;
  duration: number;
  speed: number;
  loop: boolean;
  reverse: boolean;
  postMode: TimelinePostMode;
};

export type TimelineTrack = {
  id: string;
  name: string;
  items: TimelineClipInstance[];
};

export type TimelineTag = {
  id: string;
  time: number;
  color: string;
};

export type TimelineComposition = {
  version: 1;
  sceneId: string;
  tags: TimelineTag[];
  tracks: TimelineTrack[];
};

export type TimelineClipInstanceWithClip = TimelineClipInstance & {
  clip: AnimationClip;
  end: number;
};

const DEFAULT_TRACK_COUNT = 3;

export function createEmptyTimelineComposition(sceneId: string): TimelineComposition {
  return {
    version: 1,
    sceneId,
    tags: [],
    tracks: Array.from({ length: DEFAULT_TRACK_COUNT }, (_, index) => createTimelineTrack(index)),
  };
}

export function cloneTimelineComposition(composition: TimelineComposition): TimelineComposition {
  return JSON.parse(JSON.stringify(composition)) as TimelineComposition;
}

export function normalizeTimelineComposition(
  sceneId: string,
  value: Partial<TimelineComposition>,
): TimelineComposition {
  const fallback = createEmptyTimelineComposition(sceneId);
  const tracks = Array.isArray(value.tracks)
    ? value.tracks
      .map((track, index) => normalizeTimelineTrack(track, index))
      .filter((track) => track !== null)
    : [];
  const tags = Array.isArray(value.tags)
    ? value.tags
      .map((tag) => normalizeTimelineTag(tag))
      .filter((tag) => tag !== null)
      .sort((left, right) => left.time - right.time)
    : [];

  return {
    version: 1,
    sceneId,
    tags,
    tracks: tracks.length > 0 ? tracks : fallback.tracks,
  };
}

export function createTimelineClipInstance(
  clip: AnimationClip,
  trackId: string,
  start: number,
): TimelineClipInstance {
  return {
    id: createTimelineInstanceId(),
    clipId: clip.id,
    trackId,
    start: roundTimelineTime(start),
    duration: Math.max(0.01, roundTimelineTime(clip.duration)),
    speed: 1,
    loop: false,
    reverse: false,
    postMode: 'hold',
  };
}

export function getTimelineDuration(composition: TimelineComposition): number {
  let duration = 0;
  for (const track of composition.tracks) {
    for (const item of track.items) {
      duration = Math.max(duration, item.start + item.duration);
    }
  }
  return roundTimelineTime(duration);
}

export function getTimelineClipInstanceEnd(instance: TimelineClipInstance): number {
  return instance.start + instance.duration;
}

export function getClipInstanceSourceTime(
  instance: TimelineClipInstance,
  clip: AnimationClip,
  timelineTime: number,
): number {
  const localTime = Math.max(0, Math.min(instance.duration, timelineTime - instance.start));
  const speed = Math.max(0.01, instance.speed);
  const rawTime = localTime * speed;
  const clipDuration = Math.max(0.0001, clip.duration);
  let sourceTime: number;

  if (instance.loop) {
    sourceTime = wrapTime(rawTime, clipDuration);
  } else {
    sourceTime = Math.max(0, Math.min(clipDuration, rawTime));
  }

  return instance.reverse ? clipDuration - sourceTime : sourceTime;
}

export function getTimelineTrackItemsWithClips(
  track: TimelineTrack,
  library: AnimationClipLibrary,
): TimelineClipInstanceWithClip[] {
  const clipById = new Map(library.clips.map((clip) => [clip.id, clip]));
  return track.items
    .map((item) => {
      const clip = clipById.get(item.clipId);
      if (!clip) return null;

      return {
        ...item,
        clip,
        end: getTimelineClipInstanceEnd(item),
      };
    })
    .filter((item) => item !== null)
    .sort((left, right) => left.start - right.start);
}

export function roundTimelineTime(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value) * 100) / 100;
}

function normalizeTimelineTrack(value: Partial<TimelineTrack>, index: number): TimelineTrack | null {
  const id = typeof value.id === 'string' && value.id.length > 0
    ? value.id
    : `track-${index + 1}`;
  const name = typeof value.name === 'string' && value.name.length > 0
    ? value.name
    : `Track ${index + 1}`;
  const items = Array.isArray(value.items)
    ? value.items
      .map((item) => normalizeTimelineClipInstance(item, id))
      .filter((item) => item !== null)
      .sort((left, right) => left.start - right.start)
    : [];

  return { id, name, items };
}

function normalizeTimelineTag(value: Partial<TimelineTag>): TimelineTag | null {
  if (typeof value.time !== 'number' || !Number.isFinite(value.time)) {
    return null;
  }

  return {
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : createTimelineInstanceId(),
    time: roundTimelineTime(value.time),
    color: isTimelineTagColor(value.color) ? value.color : DEFAULT_TIMELINE_TAG_COLOR,
  };
}

const DEFAULT_TIMELINE_TAG_COLOR = '#f97316';

function isTimelineTagColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeTimelineClipInstance(
  value: Partial<TimelineClipInstance>,
  fallbackTrackId: string,
): TimelineClipInstance | null {
  if (typeof value.clipId !== 'string' || value.clipId.length === 0) {
    return null;
  }

  const duration = typeof value.duration === 'number' && Number.isFinite(value.duration)
    ? Math.max(0.01, roundTimelineTime(value.duration))
    : 0.01;
  const speed = typeof value.speed === 'number' && Number.isFinite(value.speed)
    ? Math.max(0.01, value.speed)
    : 1;

  return {
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : createTimelineInstanceId(),
    clipId: value.clipId,
    trackId: typeof value.trackId === 'string' && value.trackId.length > 0 ? value.trackId : fallbackTrackId,
    start: typeof value.start === 'number' && Number.isFinite(value.start) ? roundTimelineTime(value.start) : 0,
    duration,
    speed,
    loop: value.loop === true,
    reverse: value.reverse === true,
    postMode: value.postMode === 'none' ? 'none' : 'hold',
  };
}

function createTimelineTrack(index: number): TimelineTrack {
  return {
    id: `track-${index + 1}`,
    name: `Track ${index + 1}`,
    items: [],
  };
}

function createTimelineInstanceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function wrapTime(value: number, duration: number): number {
  const wrapped = value % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}
