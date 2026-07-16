import { useCallback, useEffect, useRef, useState } from 'react';
import { runBundledExploration } from './explorationAdapter';
import type {
  RunPhase,
  RunProgress,
  RunRequest,
  UiRunResult,
  WorkerResponse,
} from './types';

const EMPTY_PROGRESS: RunProgress = {
  visitedStates: 0,
  expandedStates: 0,
  transitionsEvaluated: 0,
  invariantChecks: 0,
  currentDepth: 0,
  durationMs: 0,
};

interface ExplorerState {
  phase: RunPhase;
  progress: RunProgress;
  result: UiRunResult | null;
  error: string | null;
  executionMode: 'worker' | 'direct';
}

interface ExplorerController extends ExplorerState {
  run(request: RunRequest): void;
  cancel(): void;
  reset(): void;
  load(result: UiRunResult): void;
}

export function useExplorer(): ExplorerController {
  const [state, setState] = useState<ExplorerState>({
    phase: 'ready',
    progress: EMPTY_PROGRESS,
    result: null,
    error: null,
    executionMode: typeof Worker === 'undefined' ? 'direct' : 'worker',
  });
  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef<number | null>(null);

  const disposeWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      disposeWorker();
      abortRef.current?.abort();
    };
  }, [disposeWorker]);

  const complete = useCallback((result: UiRunResult) => {
    const phase: RunPhase =
      result.reason === 'violation'
        ? 'violation'
        : result.reason === 'cancelled'
          ? 'cancelled'
          : result.reason === 'invalid-system'
            ? 'error'
            : 'bounded-success';
    activeRunRef.current = null;
    abortRef.current = null;
    setState((previous) => ({
      ...previous,
      phase,
      progress: result.metrics,
      result,
      error: result.reason === 'invalid-system' ? (result.message ?? 'The bundled system is invalid.') : null,
    }));
  }, []);

  const runDirect = useCallback(
    (request: RunRequest) => {
      const controller = new AbortController();
      abortRef.current = controller;
      void runBundledExploration(request, controller.signal, (progress) => {
        if (activeRunRef.current !== request.runId) return;
        setState((previous) => ({ ...previous, progress }));
      })
        .then((result) => {
          if (activeRunRef.current === request.runId) complete(result);
        })
        .catch((error: unknown) => {
          if (activeRunRef.current !== request.runId) return;
          activeRunRef.current = null;
          const message = error instanceof Error ? error.message : 'Exploration failed unexpectedly.';
          setState((previous) => ({ ...previous, phase: 'error', error: message }));
        });
    },
    [complete],
  );

  const run = useCallback(
    (request: RunRequest) => {
      disposeWorker();
      abortRef.current?.abort();
      activeRunRef.current = request.runId;
      setState((previous) => ({
        ...previous,
        phase: 'running',
        progress: EMPTY_PROGRESS,
        result: null,
        error: null,
      }));

      if (typeof Worker === 'undefined') {
        setState((previous) => ({ ...previous, executionMode: 'direct' }));
        runDirect(request);
        return;
      }

      try {
        const worker = new Worker(new URL('./explorer.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        setState((previous) => ({ ...previous, executionMode: 'worker' }));

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const response = event.data;
          if (response.runId !== activeRunRef.current) return;
          if (response.type === 'progress') {
            setState((previous) => ({ ...previous, progress: response.progress }));
          } else if (response.type === 'complete') {
            complete(response.result);
            disposeWorker();
          } else if (response.type === 'cancelled') {
            if (response.result) complete(response.result);
            disposeWorker();
          } else {
            activeRunRef.current = null;
            setState((previous) => ({ ...previous, phase: 'error', error: response.message }));
            disposeWorker();
          }
        };

        worker.onerror = (event) => {
          if (activeRunRef.current !== request.runId) return;
          activeRunRef.current = null;
          setState((previous) => ({
            ...previous,
            phase: 'error',
            error: event.message || 'The exploration worker stopped unexpectedly.',
          }));
          disposeWorker();
        };
        worker.postMessage({ type: 'run', payload: request });
      } catch {
        setState((previous) => ({ ...previous, executionMode: 'direct' }));
        runDirect(request);
      }
    },
    [complete, disposeWorker, runDirect],
  );

  const cancel = useCallback(() => {
    if (activeRunRef.current === null) return;
    const runId = activeRunRef.current;
    abortRef.current?.abort();
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'cancel', runId });
      // Termination makes cancellation immediate even if a bundled transition is CPU-bound.
      disposeWorker();
    }
    activeRunRef.current = null;
    setState((previous) => ({ ...previous, phase: 'cancelled', result: null, error: null }));
  }, [disposeWorker]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    disposeWorker();
    activeRunRef.current = null;
    setState((previous) => ({
      phase: 'ready',
      progress: EMPTY_PROGRESS,
      result: null,
      error: null,
      executionMode: previous.executionMode,
    }));
  }, [disposeWorker]);

  const load = useCallback((result: UiRunResult) => {
    abortRef.current?.abort();
    disposeWorker();
    activeRunRef.current = null;
    complete(result);
  }, [complete, disposeWorker]);

  return { ...state, run, cancel, reset, load };
}
