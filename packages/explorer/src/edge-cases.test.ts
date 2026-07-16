import { describe, expect, it } from 'vitest';
import type { SystemDefinition } from '@raceproof/core';
import { explore, minimizeCounterexample, reconstructTrace, replayTrace } from './index';

type State = { phase: 'start' | 'bad'; source?: string };

const failureSystem: SystemDefinition<State> = {
  id: 'failure', title: 'Failure', description: 'Two independent unsafe successor states.', initialState: { phase: 'start' },
  transitions: [
    { id: 'bad-a', label: 'Bad A', actor: 'A', isEnabled: (state) => state.phase === 'start', apply: () => ({ phase: 'bad', source: 'a' }) },
    { id: 'bad-b', label: 'Bad B', actor: 'B', isEnabled: (state) => state.phase === 'start', apply: () => ({ phase: 'bad', source: 'b' }) },
  ],
  invariants: [{ id: 'safe', title: 'Safe', description: 'Bad is unsafe.', check: (state) => state.phase !== 'bad' }],
};

describe('explorer edge cases', () => {
  it('collects multiple unique violations and tolerates display callback failures', async () => {
    const result = await explore(failureSystem, {
      maxDepth: 2,
      maxStates: 10,
      timeoutMs: 5_000,
      stopOnFirstViolation: false,
      collectMultipleViolations: true,
    }, { onProgress: () => { throw new Error('display disconnected'); }, yieldEvery: 1 });
    expect(result.reason).toBe('violation');
    expect(result.violations).toHaveLength(2);
  });

  it('checks initial-state violations and invalid algorithm values safely', async () => {
    const initialFailure: SystemDefinition<{ broken: boolean }> = {
      id: 'initial', title: 'Initial', description: 'Unsafe initially.', initialState: { broken: true },
      transitions: [{ id: 'noop', label: 'Noop', actor: 'test', isEnabled: () => false, apply: (state) => state }],
      invariants: [{ id: 'not-broken', title: 'Not broken', description: 'Must start safe.', check: (state) => !state.broken }],
    };
    const result = await explore(initialFailure, { maxDepth: 1, maxStates: 5, timeoutMs: 5_000 });
    expect(result.counterexample?.transitionIds).toEqual([]);
    expect(result.counterexample?.steps).toEqual([]);
    await expect(explore(initialFailure, { algorithm: 'sideways' as never, timeoutMs: 5_000 })).resolves.toMatchObject({ reason: 'invalid-system' });
  });
});

describe('replay edge cases', () => {
  it('returns structured failures for invalid definitions and callback execution', () => {
    expect(replayTrace({} as unknown, []).failure).toMatchObject({ kind: 'invalid-system', stepIndex: -1 });
    const throwing: SystemDefinition<{ value: number }> = {
      id: 'throwing', title: 'Throwing', description: 'A guard throws.', initialState: { value: 0 },
      transitions: [{ id: 'throw', label: 'Throw', actor: 'test', isEnabled: () => { throw new Error('guard exploded'); }, apply: (state) => state }],
      invariants: [{ id: 'safe', title: 'Safe', description: 'Always safe.', check: () => true }],
    };
    expect(replayTrace(throwing, ['throw']).failure).toMatchObject({ kind: 'execution-error', transitionId: 'throw' });
  });

  it('records initial invariant failures, invalid minimization input, and malformed parent records', () => {
    const replay = replayTrace({
      id: 'initial', title: 'Initial', description: 'Fails at start.', initialState: { value: 0 },
      transitions: [{ id: 'noop', label: 'Noop', actor: 'test', isEnabled: () => false, apply: (state: { value: number }) => state }],
      invariants: [{ id: 'fail', title: 'Fail', description: 'Fails.', check: () => false }],
    }, []);
    expect(replay.ok).toBe(true);
    expect(replay.violations[0]).toMatchObject({ stepIndex: -1 });
    const minimized = minimizeCounterexample(failureSystem, ['bad-a'], 'not-the-invariant');
    expect(minimized.minimizedTrace).toEqual(['bad-a']);

    expect(() => reconstructTrace([{ key: 'root', state: {}, depth: 0, transitionId: 'bad' }], 'root')).toThrow('must not have a transition');
    expect(() => reconstructTrace([{ key: 'child', state: {}, depth: 1, parentKey: 'missing', transitionId: 'go' }], 'child')).toThrow('missing');
    expect(() => reconstructTrace([{ key: 'child', state: {}, depth: 1, parentKey: 'root' }], 'child')).toThrow('missing its transition');
  });
});
