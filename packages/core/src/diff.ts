import { assertJsonValue, cloneJson } from './json';
import type { JsonObject, JsonValue, StateDiffEntry } from './types';

function escapePointerSegment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function samePrimitive(left: JsonValue, right: JsonValue): boolean {
  return left === right || (typeof left === 'number' && typeof right === 'number' && Object.is(left, right));
}

function walk(before: JsonValue, after: JsonValue, path: string, entries: StateDiffEntry[]): void {
  if (samePrimitive(before, after)) return;

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      const childPath = `${path}/${index}`;
      if (index >= before.length) {
        entries.push({ path: childPath, kind: 'added', after: cloneJson(after[index] as JsonValue) });
      } else if (index >= after.length) {
        entries.push({ path: childPath, kind: 'removed', before: cloneJson(before[index] as JsonValue) });
      } else {
        walk(before[index] as JsonValue, after[index] as JsonValue, childPath, entries);
      }
    }
    return;
  }

  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      const childPath = `${path}/${escapePointerSegment(key)}`;
      if (!Object.hasOwn(before, key)) {
        entries.push({ path: childPath, kind: 'added', after: cloneJson(after[key] as JsonValue) });
      } else if (!Object.hasOwn(after, key)) {
        entries.push({ path: childPath, kind: 'removed', before: cloneJson(before[key] as JsonValue) });
      } else {
        walk(before[key] as JsonValue, after[key] as JsonValue, childPath, entries);
      }
    }
    return;
  }

  entries.push({ path, kind: 'changed', before: cloneJson(before), after: cloneJson(after) });
}

/** Return leaf-oriented changes as deterministic RFC 6901 JSON Pointers. */
export function diffStates(before: unknown, after: unknown): StateDiffEntry[] {
  assertJsonValue(before);
  assertJsonValue(after);
  const entries: StateDiffEntry[] = [];
  walk(before, after, '', entries);
  return entries;
}

export const createStateDiff = diffStates;
