import type { SystemDefinition, Transition } from '@raceproof/core';

export type PaymentState = {
  orderId: string;
  requestStarted: boolean;
  clientTimedOut: boolean;
  retryStarted: boolean;
  originalCompleted: boolean;
  retryCompleted: boolean;
  idempotencyRecorded: boolean;
  chargeCount: number;
};

const initialState: PaymentState = {
  orderId: 'order-1042',
  requestStarted: false,
  clientTimedOut: false,
  retryStarted: false,
  originalCompleted: false,
  retryCompleted: false,
  idempotencyRecorded: false,
  chargeCount: 0,
};

function beginRequest(): Transition<PaymentState> {
  return {
    id: 'payment.begin',
    label: 'Begin payment',
    actor: 'Client',
    description: 'Send the original payment request.',
    reads: ['requestStarted'],
    writes: ['requestStarted'],
    isEnabled: (state) => !state.requestStarted,
    apply: (state) => ({ ...state, requestStarted: true }),
  };
}

function observeTimeout(): Transition<PaymentState> {
  return {
    id: 'payment.timeout',
    label: 'Observe timeout',
    actor: 'Network',
    description: 'The client stops waiting, although the server may still finish the request.',
    reads: ['requestStarted', 'clientTimedOut'],
    writes: ['clientTimedOut'],
    isEnabled: (state) => state.requestStarted && !state.clientTimedOut,
    apply: (state) => ({ ...state, clientTimedOut: true }),
  };
}

function startRetry(): Transition<PaymentState> {
  return {
    id: 'payment.retry',
    label: 'Retry payment',
    actor: 'Client',
    description: 'Retry the same logical payment after the apparent timeout.',
    reads: ['clientTimedOut', 'retryStarted'],
    writes: ['retryStarted'],
    isEnabled: (state) => state.clientTimedOut && !state.retryStarted,
    apply: (state) => ({ ...state, retryStarted: true }),
  };
}

function completeOriginal(idempotent: boolean): Transition<PaymentState> {
  return {
    id: 'payment.complete-original',
    label: 'Complete original request',
    actor: 'Payment service',
    description: 'The original request reaches the charge operation.',
    reads: ['requestStarted', 'originalCompleted', 'idempotencyRecorded', 'chargeCount'],
    writes: ['originalCompleted', 'idempotencyRecorded', 'chargeCount'],
    isEnabled: (state) => state.requestStarted && !state.originalCompleted,
    apply: (state) => ({
      ...state,
      originalCompleted: true,
      idempotencyRecorded: idempotent ? true : state.idempotencyRecorded,
      chargeCount:
        idempotent && state.idempotencyRecorded ? state.chargeCount : state.chargeCount + 1,
    }),
  };
}

function completeRetry(idempotent: boolean): Transition<PaymentState> {
  return {
    id: 'payment.complete-retry',
    label: 'Complete retry',
    actor: 'Payment service',
    description: 'The retry reaches the charge operation independently of the original request.',
    reads: ['retryStarted', 'retryCompleted', 'idempotencyRecorded', 'chargeCount'],
    writes: ['retryCompleted', 'idempotencyRecorded', 'chargeCount'],
    isEnabled: (state) => state.retryStarted && !state.retryCompleted,
    apply: (state) => ({
      ...state,
      retryCompleted: true,
      idempotencyRecorded: idempotent ? true : state.idempotencyRecorded,
      chargeCount:
        idempotent && state.idempotencyRecorded ? state.chargeCount : state.chargeCount + 1,
    }),
  };
}

function paymentSystem(idempotent: boolean): SystemDefinition<PaymentState> {
  return {
    id: idempotent ? 'payment-fixed' : 'payment-buggy',
    title: `Duplicate Payment — ${idempotent ? 'Fixed' : 'Buggy'}`,
    description: idempotent
      ? 'An idempotency record makes original and retried delivery one logical charge.'
      : 'A timed-out original request and its retry can each create a charge.',
    initialState,
    transitions: [
      beginRequest(),
      observeTimeout(),
      startRetry(),
      completeOriginal(idempotent),
      completeRetry(idempotent),
    ],
    invariants: [
      {
        id: 'payment.single-charge',
        title: 'A single order can be charged no more than once',
        description: 'Every delivery of the same logical payment must share one charge result.',
        check: (state) => state.chargeCount <= 1,
      },
    ],
  };
}

export const paymentBuggy = paymentSystem(false);
export const paymentFixed = paymentSystem(true);
