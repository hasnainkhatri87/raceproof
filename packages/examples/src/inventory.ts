import type { SystemDefinition, Transition } from '@raceproof/core';

export type InventoryState = {
  initialInventory: number;
  remainingInventory: number;
  aliceObserved: number | null;
  bobObserved: number | null;
  aliceAttempted: boolean;
  bobAttempted: boolean;
  confirmedOrders: string[];
  rejectedOrders: string[];
};

const initialState: InventoryState = {
  initialInventory: 1,
  remainingInventory: 1,
  aliceObserved: null,
  bobObserved: null,
  aliceAttempted: false,
  bobAttempted: false,
  confirmedOrders: [],
  rejectedOrders: [],
};

type Customer = 'alice' | 'bob';

function readInventory(customer: Customer): Transition<InventoryState> {
  const observedKey = customer === 'alice' ? 'aliceObserved' : 'bobObserved';
  const actor = customer === 'alice' ? 'Alice' : 'Bob';
  return {
    id: `inventory.${customer}-reads`,
    label: `${actor} reads inventory`,
    actor,
    description: 'Read the currently visible inventory before attempting a reservation.',
    reads: ['remainingInventory', observedKey],
    writes: [observedKey],
    isEnabled: (state) => state[observedKey] === null,
    apply: (state) => ({ ...state, [observedKey]: state.remainingInventory }),
  };
}

function attemptReservation(customer: Customer, atomic: boolean): Transition<InventoryState> {
  const actor = customer === 'alice' ? 'Alice' : 'Bob';
  const observedKey = customer === 'alice' ? 'aliceObserved' : 'bobObserved';
  const attemptedKey = customer === 'alice' ? 'aliceAttempted' : 'bobAttempted';
  return {
    id: `inventory.${customer}-reserves`,
    label: `${actor} attempts reservation`,
    actor: 'Inventory service',
    description: atomic
      ? 'Atomically accept the reservation only if inventory is still available.'
      : 'Confirm from the earlier read without atomically checking remaining inventory.',
    reads: [observedKey, attemptedKey, 'remainingInventory'],
    writes: [attemptedKey, 'remainingInventory', 'confirmedOrders', 'rejectedOrders'],
    isEnabled: (state) => state[observedKey] !== null && !state[attemptedKey],
    apply: (state) => {
      const observedAvailable = (state[observedKey] ?? 0) > 0;
      const canConfirm = observedAvailable && (!atomic || state.remainingInventory > 0);
      return {
        ...state,
        [attemptedKey]: true,
        remainingInventory: canConfirm ? state.remainingInventory - 1 : state.remainingInventory,
        confirmedOrders: canConfirm
          ? [...state.confirmedOrders, customer]
          : [...state.confirmedOrders],
        rejectedOrders:
          observedAvailable && !canConfirm
            ? [...state.rejectedOrders, customer]
            : [...state.rejectedOrders],
      };
    },
  };
}

function inventorySystem(atomic: boolean): SystemDefinition<InventoryState> {
  return {
    id: atomic ? 'inventory-fixed' : 'inventory-buggy',
    title: `Inventory Overselling — ${atomic ? 'Fixed' : 'Buggy'}`,
    description: atomic
      ? 'Reservation rechecks and decrements inventory as one atomic operation.'
      : 'Two customers can confirm from independent stale reads of the final item.',
    initialState,
    transitions: [
      readInventory('alice'),
      readInventory('bob'),
      attemptReservation('alice', atomic),
      attemptReservation('bob', atomic),
    ],
    invariants: [
      {
        id: 'inventory.no-oversell',
        title: 'Confirmed orders cannot exceed available inventory',
        description: 'At most the initially available number of items may be confirmed.',
        check: (state) => state.confirmedOrders.length <= state.initialInventory,
      },
    ],
  };
}

export const inventoryBuggy = inventorySystem(false);
export const inventoryFixed = inventorySystem(true);
