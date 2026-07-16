import { describe, expect, it } from 'vitest';
import {
  applyTransitionSafely,
  asJsonObject,
  DefinitionExecutionError,
  evaluateInvariantSafely,
  evaluateTransitionGuard,
  jsonEquals,
  validateSystemDefinition,
} from './index';
import type { Invariant, Transition } from './index';

type State = { value: number };

describe('definition edge cases', () => {
  it('reports structural field and callback validation errors', () => {
    const validation = validateSystemDefinition({
      id: '',
      title: '',
      description: '',
      initialState: { value: 0 },
      transitions: [{ id: '', label: '', actor: '', isEnabled: 'no', apply: 'no' }],
      invariants: [{ id: '', title: '', description: '', check: 'no' }],
    });
    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['invalid-id', 'invalid-title', 'invalid-description', 'invalid-transition', 'invalid-invariant']));
    }
    expect(validateSystemDefinition(null).valid).toBe(false);
    expect(validateSystemDefinition({ id: 'x', title: 'x', description: 'x', initialState: {}, transitions: [], invariants: [] }).valid).toBe(false);
  });

  it('wraps bad callback return values and thrown errors with useful execution errors', () => {
    const invalidGuard: Transition<State> = {
      id: 'guard', label: 'Guard', actor: 'test', isEnabled: () => 'yes' as unknown as boolean, apply: (state) => state,
    };
    const throwingTransition: Transition<State> = {
      id: 'throw', label: 'Throw', actor: 'test', isEnabled: () => true, apply: () => { throw new Error('boom'); },
    };
    const nonJsonTransition: Transition<State> = {
      id: 'non-json', label: 'Non JSON', actor: 'test', isEnabled: () => true, apply: () => new Date() as unknown as State,
    };
    const invalidInvariant: Invariant<State> = {
      id: 'invariant', title: 'Invariant', description: 'Invalid return.', check: () => 1 as unknown as boolean,
    };
    expect(() => evaluateTransitionGuard(invalidGuard, { value: 0 })).toThrow(DefinitionExecutionError);
    expect(() => applyTransitionSafely(throwingTransition, { value: 0 })).toThrow('boom');
    expect(() => applyTransitionSafely(nonJsonTransition, { value: 0 })).toThrow('not JSON-compatible');
    expect(() => evaluateInvariantSafely(invalidInvariant, { value: 0 })).toThrow(DefinitionExecutionError);
  });

  it('provides equality and object narrowing helpers', () => {
    expect(jsonEquals({ b: 1, a: [true] }, { a: [true], b: 1 })).toBe(true);
    expect(jsonEquals({ a: 1 }, { a: 2 })).toBe(false);
    expect(asJsonObject({ ok: true })).toEqual({ ok: true });
    expect(asJsonObject(['not', 'an', 'object'])).toBeUndefined();
  });
});
