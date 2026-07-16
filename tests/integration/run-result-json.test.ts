import { describe, expect, it } from 'vitest';
import { MAX_RUN_RESULT_BYTES, parseRunResultJson, RunResultImportError, serializeRunResult } from '../../apps/web/src/runResultJson';
import type { UiRunResult } from '../../apps/web/src/types';

const result: UiRunResult = {
  reason: 'exhausted',
  bounds: { algorithm: 'bfs', maxDepth: 3, maxStates: 10, timeoutMs: 1_000, randomSeed: 42, stopOnFirstViolation: true },
  metrics: {
    visitedStates: 2, expandedStates: 2, duplicateStatesSkipped: 0, transitionsEvaluated: 1, invariantChecks: 2,
    currentDepth: 1, durationMs: 1.2, deepestExploredLevel: 1, statesPerSecond: 1_666, algorithm: 'bfs', randomSeed: 42,
  },
};

describe('run-result JSON boundary', () => {
  it('round-trips schema-valid local result data', () => {
    expect(parseRunResultJson(serializeRunResult(result))).toEqual(result);
  });

  it('rejects malformed, executable-looking, and oversized data', () => {
    expect(() => parseRunResultJson('{')).toThrow(RunResultImportError);
    expect(() => parseRunResultJson(JSON.stringify({ version: 1, result: { ...result, bounds: { ...result.bounds, algorithm: 'eval' } } }))).toThrow('schema');
    expect(() => parseRunResultJson('x'.repeat(MAX_RUN_RESULT_BYTES + 1))).toThrow('exceeds');
  });
});
