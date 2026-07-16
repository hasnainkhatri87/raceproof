import type { SystemDefinition, Transition } from '@raceproof/core';

const ORIGINAL_TEXT = 'Ship it at 4 PM';
const EDITED_TEXT = 'Ship it at 5 PM';

export type ChatState = {
  messageId: string;
  createDelivered: boolean;
  editDelivered: boolean;
  pendingEdit: boolean;
  renderedText: string | null;
  settled: boolean;
};

const initialState: ChatState = {
  messageId: 'message-7',
  createDelivered: false,
  editDelivered: false,
  pendingEdit: false,
  renderedText: null,
  settled: false,
};

function deliverCreate(reconcile: boolean): Transition<ChatState> {
  return {
    id: 'chat.deliver-create',
    label: 'Deliver message creation',
    actor: 'Delivery worker',
    description: 'Deliver the original message after an arbitrary network delay.',
    reads: ['createDelivered', 'pendingEdit'],
    writes: ['createDelivered', 'pendingEdit', 'renderedText'],
    isEnabled: (state) => !state.createDelivered && !state.settled,
    apply: (state) => ({
      ...state,
      createDelivered: true,
      pendingEdit: reconcile ? false : state.pendingEdit,
      renderedText: reconcile && state.pendingEdit ? EDITED_TEXT : ORIGINAL_TEXT,
    }),
  };
}

function deliverEdit(reconcile: boolean): Transition<ChatState> {
  return {
    id: 'chat.deliver-edit',
    label: 'Deliver edit',
    actor: 'Delivery worker',
    description: 'Deliver the newer edit, which may arrive before message creation.',
    reads: ['editDelivered', 'createDelivered', 'renderedText'],
    writes: ['editDelivered', 'pendingEdit', 'renderedText'],
    isEnabled: (state) => !state.editDelivered && !state.settled,
    apply: (state) => ({
      ...state,
      editDelivered: true,
      pendingEdit: reconcile && !state.createDelivered,
      renderedText: state.createDelivered ? EDITED_TEXT : state.renderedText,
    }),
  };
}

function settle(): Transition<ChatState> {
  return {
    id: 'chat.settle',
    label: 'Settle deliveries',
    actor: 'Chat service',
    description: 'Mark the finite delivery window as quiescent and check the final projection.',
    reads: ['createDelivered', 'editDelivered', 'settled'],
    writes: ['settled'],
    isEnabled: (state) => state.createDelivered && state.editDelivered && !state.settled,
    apply: (state) => ({ ...state, settled: true }),
  };
}

function chatSystem(reconcile: boolean): SystemDefinition<ChatState> {
  return {
    id: reconcile ? 'chat-fixed' : 'chat-buggy',
    title: `Out-of-Order Chat Events — ${reconcile ? 'Fixed' : 'Buggy'}`,
    description: reconcile
      ? 'An early edit is buffered and reconciled when message creation arrives.'
      : 'An edit delivered before creation is discarded, leaving stale text after settlement.',
    initialState,
    transitions: [deliverCreate(reconcile), deliverEdit(reconcile), settle()],
    invariants: [
      {
        id: 'chat.edit-reflected',
        title: 'A delivered edit must eventually be reflected in the message',
        description:
          'Once all bundled delivery events settle, a delivered edit must be the rendered value.',
        check: (state) => !state.settled || !state.editDelivered || state.renderedText === EDITED_TEXT,
      },
    ],
  };
}

export const chatBuggy = chatSystem(false);
export const chatFixed = chatSystem(true);

export const CHAT_TEXT = { original: ORIGINAL_TEXT, edited: EDITED_TEXT } as const;
