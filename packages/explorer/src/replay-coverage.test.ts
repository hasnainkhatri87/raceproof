import { describe, expect, it } from 'vitest';
import type { SystemDefinition } from '@raceproof/core';
import { reconstructTrace, replayTrace } from './index';

describe('replay execution failure coverage', () => {
  it('returns a structured failure when apply or post-step invariant execution throws', () => {
    const applyThrows: SystemDefinition<{ value: number }> = {
      id: 'apply-throws', title: 'Apply throws', description: 'Transition errors are contained.', initialState: { value: 0 },
      transitions: [{ id: 'go', label: 'Go', actor: 'test', isEnabled: () => true, apply: () => { throw new Error('apply exploded'); } }],
      invariants: [{ id: 'safe', title: 'Safe', description: 'Safe.', check: () => true }],
    };
    expect(replayTrace(applyThrows, ['go']).failure).toMatchObject({ kind: 'execution-error', transitionId: 'go' });

    const invariantThrows: SystemDefinition<{ value: number }> = {
      id: 'invariant-throws', title: 'Invariant throws', description: 'Invariant errors are contained.', initialState: { value: 0 },
      transitions: [{ id: 'go', label: 'Go', actor: 'test', isEnabled: () => true, apply: () => ({ value: 1 }) }],
      invariants: [{ id: 'safe', title: 'Safe', description: 'Safe.', check: (state) => {
        if (state.value === 1) throw new Error('invariant exploded');
        return true;
      } }],
    };
    expect(replayTrace(invariantThrows, ['go']).failure).toMatchObject({ kind: 'execution-error', transitionId: 'go' });
  });

  it('rejects duplicate persisted trace-record keys', () => {
    expect(() => reconstructTrace([
      { key: 'same', state: { value: 0 }, depth: 0 },
      { key: 'same', state: { value: 1 }, depth: 1, parentKey: 'same', transitionId: 'go' },
    ], 'same')).toThrow('duplicate key');
  });
});
