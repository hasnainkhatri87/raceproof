import type { JsonObject, JsonValue } from './types';

export class JsonCompatibilityError extends Error {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Value at ${path || '<root>'} is not JSON-compatible: ${reason}`);
    this.name = 'JsonCompatibilityError';
    this.path = path;
  }
}

function pointerSegment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function describeUnsupported(value: unknown): string {
  if (typeof value === 'number') return 'numbers must be finite';
  if (value === undefined) return 'undefined is not a JSON value';
  if (typeof value === 'object') return 'only plain objects and arrays are supported';
  return `${typeof value} is not a JSON value`;
}

function assertJsonInternal(value: unknown, path: string, ancestors: Set<object>): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;

  if (typeof value !== 'object') {
    throw new JsonCompatibilityError(path, describeUnsupported(value));
  }

  if (ancestors.has(value)) {
    throw new JsonCompatibilityError(path, 'cyclic references are not supported');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new JsonCompatibilityError(`${path}/${index}`, 'sparse array entries are not supported');
        }
        assertJsonInternal(value[index], `${path}/${index}`, ancestors);
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new JsonCompatibilityError(path, 'only plain objects and arrays are supported');
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new JsonCompatibilityError(path, 'symbol-keyed properties are not supported');
    }

    for (const [key, child] of Object.entries(value)) {
      assertJsonInternal(child, `${path}/${pointerSegment(key)}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

export function assertJsonValue(value: unknown): asserts value is JsonValue {
  assertJsonInternal(value, '', new Set<object>());
}

export function isJsonValue(value: unknown): value is JsonValue {
  try {
    assertJsonValue(value);
    return true;
  } catch {
    return false;
  }
}

function serialize(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((child) => serialize(child)).join(',')}]`;

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${serialize(value[key] as JsonValue)}`)
    .join(',')}}`;
}

/** Stable JSON serialization with recursively sorted object keys. */
export function canonicalSerialize(value: unknown): string {
  assertJsonValue(value);
  return serialize(value);
}

export const canonicalStateKey = canonicalSerialize;

function cloneInternal(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((child) => cloneInternal(child));

  const clone: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) clone[key] = cloneInternal(child);
  return clone;
}

/** Validate and deeply clone a JSON-compatible value. */
export function cloneJson<Value>(value: Value): Value {
  assertJsonValue(value);
  return cloneInternal(value) as Value;
}

function freezeInternal(value: JsonValue): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  if (Array.isArray(value)) {
    for (const child of value) freezeInternal(child);
  } else {
    for (const child of Object.values(value)) freezeInternal(child);
  }
  Object.freeze(value);
}

/** Deeply freeze an already JSON-compatible value after validating it. */
export function deepFreezeJson<Value>(value: Value): Readonly<Value> {
  assertJsonValue(value);
  freezeInternal(value);
  return value as Readonly<Value>;
}

export function cloneAndFreezeJson<Value>(value: Value): Readonly<Value> {
  return deepFreezeJson(cloneJson(value));
}

export function jsonEquals(left: unknown, right: unknown): boolean {
  return canonicalSerialize(left) === canonicalSerialize(right);
}

export function asJsonObject(value: JsonValue): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}
