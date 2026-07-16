import { chatBuggy, chatFixed } from './chat';
import { inventoryBuggy, inventoryFixed } from './inventory';
import { paymentBuggy, paymentFixed } from './payment';

export { CHAT_TEXT, chatBuggy, chatFixed, type ChatState } from './chat';
export { inventoryBuggy, inventoryFixed, type InventoryState } from './inventory';
export { paymentBuggy, paymentFixed, type PaymentState } from './payment';

export const EXAMPLE_IDS = ['payment', 'inventory', 'chat'] as const;
export const EXAMPLE_VARIANTS = ['buggy', 'fixed'] as const;

export type ExampleId = (typeof EXAMPLE_IDS)[number];
export type ExampleVariant = (typeof EXAMPLE_VARIANTS)[number];
export type ExampleSystem =
  | typeof paymentBuggy
  | typeof inventoryBuggy
  | typeof chatBuggy;

export type DocumentedBounds = {
  maxDepth: number;
  maxStates: number;
  timeoutMs: number;
};

export type ExampleMetadata = {
  id: ExampleId;
  title: string;
  shortDescription: string;
  description: string;
  bugExplanation: string;
  failureOrder: string;
  fixExplanation: string;
  invariantTitle: string;
  documentedBounds: DocumentedBounds;
};

export const EXAMPLE_CATALOG: readonly ExampleMetadata[] = [
  {
    id: 'payment',
    title: 'Duplicate Payment',
    shortDescription: 'A timeout retry races the original charge.',
    description:
      'A customer retries an apparently timed-out payment while the original request is still running.',
    bugExplanation:
      'An ordinary test usually finishes either the original request or the retry. It misses the timeline where both independently charge the same order.',
    failureOrder:
      'Begin the payment, observe a timeout, start a retry, then let both the original and retry complete.',
    fixExplanation:
      'Both deliveries share an idempotency record, so whichever completes second reuses the first result instead of charging again.',
    invariantTitle: 'A single order can be charged no more than once',
    documentedBounds: { maxDepth: 8, maxStates: 500, timeoutMs: 2_000 },
  },
  {
    id: 'inventory',
    title: 'Inventory Overselling',
    shortDescription: 'Two stale reads compete for the final item.',
    description:
      'Alice and Bob each see one item available before either reservation reaches the inventory write.',
    bugExplanation:
      'A sequential test reads and reserves for one customer at a time. It misses two successful decisions made from the same stale stock value.',
    failureOrder:
      'Alice reads one item, Bob reads the same item, then both reservation attempts are processed.',
    fixExplanation:
      'The reservation attempt atomically checks and decrements remaining inventory; the later attempt is cleanly rejected.',
    invariantTitle: 'Confirmed orders cannot exceed available inventory',
    documentedBounds: { maxDepth: 6, maxStates: 250, timeoutMs: 2_000 },
  },
  {
    id: 'chat',
    title: 'Out-of-Order Chat',
    shortDescription: 'An edit arrives before its message exists.',
    description:
      'Network delivery reorders a message creation and a later edit for the same message.',
    bugExplanation:
      'An ordinary test delivers creation before edit. It never exercises the receiver path that sees an edit for an unknown message.',
    failureOrder:
      'Deliver the edit first, deliver message creation second, then settle the delivery window.',
    fixExplanation:
      'The receiver buffers an early edit and reconciles it as soon as the corresponding creation arrives.',
    invariantTitle: 'A delivered edit must eventually be reflected in the message',
    documentedBounds: { maxDepth: 5, maxStates: 100, timeoutMs: 2_000 },
  },
] as const;

const systems = {
  payment: { buggy: paymentBuggy, fixed: paymentFixed },
  inventory: { buggy: inventoryBuggy, fixed: inventoryFixed },
  chat: { buggy: chatBuggy, fixed: chatFixed },
} as const;

export function isExampleId(value: string): value is ExampleId {
  return (EXAMPLE_IDS as readonly string[]).includes(value);
}

export function isExampleVariant(value: string): value is ExampleVariant {
  return (EXAMPLE_VARIANTS as readonly string[]).includes(value);
}

export function getExampleMetadata(id: ExampleId): ExampleMetadata {
  const metadata = EXAMPLE_CATALOG.find((entry) => entry.id === id);
  if (!metadata) {
    throw new Error(`Unknown bundled example: ${id}`);
  }
  return metadata;
}

export function getExampleSystem(id: 'payment', variant: ExampleVariant): typeof paymentBuggy;
export function getExampleSystem(id: 'inventory', variant: ExampleVariant): typeof inventoryBuggy;
export function getExampleSystem(id: 'chat', variant: ExampleVariant): typeof chatBuggy;
export function getExampleSystem(id: ExampleId, variant: ExampleVariant): ExampleSystem;
export function getExampleSystem(id: ExampleId, variant: ExampleVariant): ExampleSystem {
  return systems[id][variant];
}
