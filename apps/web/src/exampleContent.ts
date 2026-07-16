import type { ExampleId, RunOptions } from './types';

export interface ExampleContent {
  id: ExampleId;
  eyebrow: string;
  title: string;
  summary: string;
  invariant: string;
  ordinaryTests: string;
  failureOrder: string;
  fixedApproach: string;
  actors: string[];
  bounds: Pick<RunOptions, 'maxDepth' | 'maxStates' | 'timeoutMs'>;
}

export const EXAMPLES: ExampleContent[] = [
  {
    id: 'payment',
    eyebrow: 'Retries + duplicate completion',
    title: 'Duplicate Payment',
    summary: 'A timed-out payment is retried while the original request is still in flight.',
    invariant: 'A single order can be charged no more than once.',
    ordinaryTests:
      'A happy-path test waits for each request to finish. It never schedules the retry between the original request and its late completion.',
    failureOrder:
      'Begin payment → observe timeout → retry payment → complete original → complete retry. Both completions charge the same order.',
    fixedApproach:
      'The fixed system records an idempotency key and makes charge completion a single, durable decision.',
    actors: ['Client', 'Gateway', 'Ledger'],
    bounds: { maxDepth: 8, maxStates: 5_000, timeoutMs: 5_000 },
  },
  {
    id: 'inventory',
    eyebrow: 'Stale reads + competing writes',
    title: 'Inventory Overselling',
    summary: 'Two customers see the last item and independently try to reserve it.',
    invariant: 'Confirmed orders cannot exceed available inventory.',
    ordinaryTests:
      'Sequential tests let the first customer update stock before the second reads it, hiding the shared stale snapshot.',
    failureOrder:
      'Customer A reads stock → Customer B reads stock → A reserves → B reserves. Both confirmations rely on the same item.',
    fixedApproach:
      'The fixed system combines the stock check and reservation into one atomic transition.',
    actors: ['Customer A', 'Customer B', 'Inventory'],
    bounds: { maxDepth: 7, maxStates: 5_000, timeoutMs: 5_000 },
  },
  {
    id: 'chat',
    eyebrow: 'Out-of-order delivery',
    title: 'Out-of-Order Chat',
    summary: 'A message edit arrives before the message it belongs to is created locally.',
    invariant: 'A delivered edit must eventually be reflected in the message.',
    ordinaryTests:
      'Typical tests deliver create then edit. Real networks can reverse those events without changing either payload.',
    failureOrder:
      'Deliver edit → deliver create → settle. The buggy handler discards the early edit and renders stale content.',
    fixedApproach:
      'The fixed system buffers unmatched edits and reconciles them when the create event arrives.',
    actors: ['Network', 'Message store', 'Reconciler'],
    bounds: { maxDepth: 7, maxStates: 5_000, timeoutMs: 5_000 },
  },
];

export function getExampleContent(id: ExampleId): ExampleContent {
  const example = EXAMPLES.find((candidate) => candidate.id === id);
  if (!example) {
    throw new Error(`Unknown bundled example: ${id}`);
  }
  return example;
}
