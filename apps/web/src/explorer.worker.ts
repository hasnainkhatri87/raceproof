/// <reference lib="webworker" />

import { runBundledExploration } from './explorationAdapter';
import type { WorkerRequest, WorkerResponse } from './types';

const scope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
const controllers = new Map<number, AbortController>();

function post(response: WorkerResponse): void {
  scope.postMessage(response);
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'cancel') {
    controllers.get(message.runId)?.abort();
    return;
  }

  const { payload } = message;
  const controller = new AbortController();
  controllers.set(payload.runId, controller);

  void runBundledExploration(payload, controller.signal, (progress) => {
    post({ type: 'progress', runId: payload.runId, progress });
  })
    .then((result) => {
      post({ type: result.reason === 'cancelled' ? 'cancelled' : 'complete', runId: payload.runId, result });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Exploration failed unexpectedly.';
      post({ type: 'error', runId: payload.runId, message });
    })
    .finally(() => {
      controllers.delete(payload.runId);
    });
};

export {};
