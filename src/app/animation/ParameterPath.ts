import type { AnimationValue } from './AnimationClip';

export type ParameterRecord = Record<string, unknown>;

export function getParameterValue(source: unknown, path: string): AnimationValue | undefined {
  const target = resolvePath(source, path);
  if (!target) return undefined;

  const value = target.parent[target.key];
  if (typeof value === 'number' && Number.isFinite(value)
    || typeof value === 'string'
    || typeof value === 'boolean') {
    return value;
  }

  return undefined;
}

export function setParameterValue(target: unknown, path: string, value: AnimationValue): boolean {
  const resolved = resolvePath(target, path);
  if (!resolved) return false;

  resolved.parent[resolved.key] = value;
  return true;
}

export function cloneParameterObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolvePath(source: unknown, path: string): { parent: ParameterRecord; key: string } | null {
  const keys = path.split('.');
  if (keys.length === 0 || keys.some((key) => key.length === 0)) {
    return null;
  }

  let cursor: unknown = source;
  for (const key of keys.slice(0, -1)) {
    if (!isRecord(cursor)) {
      return null;
    }

    cursor = cursor[key];
  }

  if (!isRecord(cursor)) {
    return null;
  }

  return {
    parent: cursor,
    key: keys[keys.length - 1]!,
  };
}

function isRecord(value: unknown): value is ParameterRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
