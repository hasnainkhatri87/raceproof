import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyTransitionSafely,
  canonicalSerialize,
  cloneJson,
  deepFreezeJson,
  diffStates,
  evaluateInvariantSafely,
  evaluateTransitionGuard,
  isJsonValue,
  JsonCompatibilityError,
  StateMutationError,
  validateSystemDefinition,
} from './index';
import type { Invariant, SystemDefinition, Transition } from './index';

type CounterState = { count: number; labels: string[] };

const increment: Transition<CounterState> = {
  id: 'increment',
  label: 'Increment',
  actor: 'worker',
  isEnabled: (state) => state.count < 3,
  apply: (state) => ({ ...state, count: state.count + 1 }),
};

const bounded: Invariant<CounterState> = {
  id: 'bounded',
  title: 'Counter stays bounded',
  description: 'The counter stays lower than four.',
  check: (state) => state.count < 4,
};

const validSystem: SystemDefinition<CounterState> = {
  id: 'counter',
  title: 'Counter',
  description: 'A small valid definition.',
  initialState: { count: 0, labels: [] },
  transitions: [increment],
  invariants: [bounded],
};

describe('JSON state utilities', () => {
  it('serializes object keys canonically regardless of insertion order', () => {
    expect(canonicalSerialize({ b: 2, a: { z: true, c: [3, 1] } })).toBe(canonicalSerialize({ a: { c: [3, 1], z: true }, b: 2 }));
  });

  it('keeps canonical serialization independent of generated key order', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), fc.oneof(fc.integer(), fc.boolean(), fc.string())), (record) => {
        const reversed: Record<string, string | number | boolean> = {};
        for (const key of Object.keys(record).reverse()) reversed[key] = record[key] as string | number | boolean;
        expect(canonicalSerialize(record)).toBe(canonicalSerialize(reversed));
      }),
    );
  });

  it('rejects non-JSON values and cycles', () => {
    expect(() => canonicalSerialize({ unsafe: undefined })).toThrow(JsonCompatibilityError);
    expect(() => canonicalSerialize({ date: new Date() })).toThrow(JsonCompatibilityError);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(isJsonValue(cyclic)).toBe(false);
  });

  it('clones and freezes nested state safely', () => {
    const original = { nested: { values: [1, 2] } };
    const copy = cloneJson(original);
    copy.nested.values.push(3);
    expect(original.nested.values).toEqual([1, 2]);
    const frozen = deepFreezeJson(original);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.nested)).toBe(true);
    expect(Object.isFrozen(frozen.nested.values)).toBe(true);
  });
});

describe('definition validation and safe execution', () => {
  it('accepts a valid typed definition and identifies duplicate IDs', () => {
    expect(validateSystemDefinition(validSystem).valid).toBe(true);
    const duplicate = {
      ...validSystem,
      transitions: [increment, { ...increment, label: 'Another increment' }],
      invariants: [bounded, { ...bounded, title: 'Another invariant' }],
    };
    const result = validateSystemDefinition(duplicate);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['duplicate-transition-id', 'duplicate-invariant-id']));
    }
  });

  it('detects non-JSON initial state and invalid callbacks', () => {
    const invalid = {
      ...validSystem,
      initialState: { unsupported: Number.NaN },
      transitions: [{ id: 'bad', label: 'Bad', actor: 'test', isEnabled: true }],
    };
    const result = validateSystemDefinition(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['non-json-state', 'invalid-transition']));
  });

  it('runs guards, transitions, and invariants immutably', () => {
    const initial: CounterState = { count: 0, labels: ['source'] };
    expect(evaluateTransitionGuard(increment, initial)).toBe(true);
    const next = applyTransitionSafely(increment, initial);
    expect(next).toEqual({ count: 1, labels: ['source'] });
    expect(initial).toEqual({ count: 0, labels: ['source'] });
    expect(evaluateInvariantSafely(bounded, next)).toMatchObject({ id: 'bounded', passed: true });
  });

  it('reports mutation attempts made through a transition or invariant', () => {
    const mutation: Transition<CounterState> = {
      id: 'mutation',
      label: 'Mutation',
      actor: 'bad worker',
      isEnabled: () => true,
      apply: (state) => {
        (state as unknown as { count: number }).count += 1;
        return state as CounterState;
      },
    };
    const mutatingInvariant: Invariant<CounterState> = {
      id: 'mutating-invariant',
      title: 'Mutating invariant',
      description: 'Deliberately invalid.',
      check: (state) => {
        (state as unknown as { labels: string[] }).labels.push('bad');
        return true;
      },
    };
    expect(() => applyTransitionSafely(mutation, { count: 0, labels: [] })).toThrow(StateMutationError);
    expect(() => evaluateInvariantSafely(mutatingInvariant, { count: 0, labels: [] })).toThrow(StateMutationError);
  });
});

describe('structured state diffs', () => {
  it('returns deterministic leaf changes with JSON pointers', () => {
    expect(diffStates({ a: 1, nested: { kept: true, removed: 'x' } }, { a: 2, nested: { kept: true, added: 'y' } })).toEqual([
      { path: '/a', kind: 'changed', before: 1, after: 2 },
      { path: '/nested/added', kind: 'added', after: 'y' },
      { path: '/nested/removed', kind: 'removed', before: 'x' },
    ]);
  });
});
