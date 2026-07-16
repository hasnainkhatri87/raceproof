import { assertJsonValue, cloneJson } from './json';
import type { Invariant, InvariantResult, Transition } from './types';

export type StateCallbackKind = 'transition guard' | 'transition apply' | 'invariant';

export class StateMutationError extends Error {
  readonly path: string;
  readonly callbackKind: StateCallbackKind;
  readonly callbackId: string;

  constructor(callbackKind: StateCallbackKind, callbackId: string, path: string) {
    super(`${callbackKind} "${callbackId}" attempted to mutate its input at ${path || '<root>'}.`);
    this.name = 'StateMutationError';
    this.callbackKind = callbackKind;
    this.callbackId = callbackId;
    this.path = path;
  }
}

export class DefinitionExecutionError extends Error {
  readonly callbackKind: StateCallbackKind;
  readonly callbackId: string;
  readonly cause: unknown;

  constructor(callbackKind: StateCallbackKind, callbackId: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`${callbackKind} "${callbackId}" failed: ${detail}`);
    this.name = 'DefinitionExecutionError';
    this.callbackKind = callbackKind;
    this.callbackId = callbackId;
    this.cause = cause;
  }
}

interface MutationTracker {
  attemptedPath?: string;
}

function pointerSegment(value: PropertyKey): string {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function createReadonlyProxy<Value extends object>(
  value: Value,
  path: string,
  tracker: MutationTracker,
  cache: WeakMap<object, object>,
): Value {
  const cached = cache.get(value);
  if (cached !== undefined) return cached as Value;

  const mutation = (property: PropertyKey): never => {
    const attemptedPath = `${path}/${pointerSegment(property)}`;
    tracker.attemptedPath ??= attemptedPath;
    throw new TypeError(`State is read-only at ${attemptedPath}.`);
  };

  const proxy = new Proxy(value, {
    get(target, property, receiver) {
      const child = Reflect.get(target, property, receiver) as unknown;
      if (child !== null && typeof child === 'object') {
        return createReadonlyProxy(child, `${path}/${pointerSegment(property)}`, tracker, cache);
      }
      return child;
    },
    set(_target, property) {
      return mutation(property);
    },
    deleteProperty(_target, property) {
      return mutation(property);
    },
    defineProperty(_target, property) {
      return mutation(property);
    },
    setPrototypeOf() {
      return mutation('__proto__');
    },
    preventExtensions() {
      tracker.attemptedPath ??= path;
      throw new TypeError(`State is read-only at ${path || '<root>'}.`);
    },
  });
  cache.set(value, proxy);
  return proxy;
}

function guardedInput<State>(state: State): { readonly value: Readonly<State>; readonly tracker: MutationTracker } {
  const cloned = cloneJson(state);
  const tracker: MutationTracker = {};
  if (cloned !== null && typeof cloned === 'object') {
    return {
      value: createReadonlyProxy(cloned, '', tracker, new WeakMap<object, object>()) as Readonly<State>,
      tracker,
    };
  }
  return { value: cloned as Readonly<State>, tracker };
}

function rethrow(
  callbackKind: StateCallbackKind,
  callbackId: string,
  tracker: MutationTracker,
  error?: unknown,
): never {
  if (tracker.attemptedPath !== undefined) {
    throw new StateMutationError(callbackKind, callbackId, tracker.attemptedPath);
  }
  throw new DefinitionExecutionError(callbackKind, callbackId, error);
}

export function evaluateTransitionGuard<State>(transition: Transition<State>, state: State): boolean {
  const input = guardedInput(state);
  let enabled: boolean;
  try {
    enabled = transition.isEnabled(input.value);
  } catch (error) {
    rethrow('transition guard', transition.id, input.tracker, error);
  }
  if (input.tracker.attemptedPath !== undefined) {
    rethrow('transition guard', transition.id, input.tracker);
  }
  if (typeof enabled !== 'boolean') {
    throw new DefinitionExecutionError(
      'transition guard',
      transition.id,
      new TypeError('isEnabled must return a boolean.'),
    );
  }
  return enabled;
}

export function applyTransitionSafely<State>(transition: Transition<State>, state: State): State {
  const input = guardedInput(state);
  let nextState: State;
  try {
    nextState = transition.apply(input.value);
  } catch (error) {
    rethrow('transition apply', transition.id, input.tracker, error);
  }
  if (input.tracker.attemptedPath !== undefined) {
    rethrow('transition apply', transition.id, input.tracker);
  }
  try {
    assertJsonValue(nextState);
  } catch (error) {
    throw new DefinitionExecutionError('transition apply', transition.id, error);
  }
  return cloneJson(nextState);
}

export function evaluateInvariantSafely<State>(invariant: Invariant<State>, state: State): InvariantResult {
  const input = guardedInput(state);
  let passed: boolean;
  try {
    passed = invariant.check(input.value);
  } catch (error) {
    rethrow('invariant', invariant.id, input.tracker, error);
  }
  if (input.tracker.attemptedPath !== undefined) rethrow('invariant', invariant.id, input.tracker);
  if (typeof passed !== 'boolean') {
    throw new DefinitionExecutionError('invariant', invariant.id, new TypeError('check must return a boolean.'));
  }
  return {
    id: invariant.id,
    title: invariant.title,
    description: invariant.description,
    passed,
  };
}

export function evaluateInvariantsSafely<State>(
  invariants: readonly Invariant<State>[],
  state: State,
): InvariantResult[] {
  return invariants.map((invariant) => evaluateInvariantSafely(invariant, state));
}
