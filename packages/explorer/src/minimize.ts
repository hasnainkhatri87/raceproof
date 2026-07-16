import { replayTrace } from './replay';
import type { CounterexampleMinimization, ReplayResult } from './types';
import type { SystemDefinition } from '@raceproof/core';

function hasTargetFailure<State>(replay: ReplayResult<State>, invariantId: string): boolean {
  return replay.ok && replay.violations.some((violation) => violation.invariant.id === invariantId);
}

/**
 * Guard-aware delta debugging for a reported counterexample. A candidate is
 * accepted only when replay can execute every retained transition and the same
 * invariant still fails. This deliberately rejects tempting but invalid
 * subsequences whose omitted setup leaves a transition disabled.
 */
export function minimizeCounterexample<State>(
  definition: SystemDefinition<State>,
  trace: readonly string[],
  invariantId: string,
): CounterexampleMinimization<State> {
  const originalTrace = [...trace];
  let current = [...trace];
  let granularity = 2;
  let replay = replayTrace<State>(definition, current);

  if (!hasTargetFailure(replay, invariantId)) {
    return {
      originalTrace,
      minimizedTrace: originalTrace,
      originalLength: originalTrace.length,
      minimizedLength: originalTrace.length,
      replay,
    };
  }

  while (current.length > 0) {
    const chunkSize = Math.ceil(current.length / granularity);
    let reduced = false;

    for (let start = 0; start < current.length; start += chunkSize) {
      const end = Math.min(current.length, start + chunkSize);
      const candidate = [...current.slice(0, start), ...current.slice(end)];
      const candidateReplay = replayTrace<State>(definition, candidate);

      if (hasTargetFailure(candidateReplay, invariantId)) {
        current = candidate;
        replay = candidateReplay;
        granularity = Math.max(2, granularity - 1);
        reduced = true;
        break;
      }
    }

    if (reduced) continue;
    if (granularity >= current.length) break;
    granularity = Math.min(current.length, granularity * 2);
  }

  return {
    originalTrace,
    minimizedTrace: current,
    originalLength: originalTrace.length,
    minimizedLength: current.length,
    replay,
  };
}
