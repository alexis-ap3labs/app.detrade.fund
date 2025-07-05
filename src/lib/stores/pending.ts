import { writable } from 'svelte/store';

// Interface for transaction state
interface PendingState {
  isTransactionPending: boolean;
  transactionHash: string | null;
}

// Store for transaction state
export const pendingTransaction = writable<PendingState>({
  isTransactionPending: false,
  transactionHash: null
});

// Functions to update transaction state
export function setTransactionPending(hash: string) {
  pendingTransaction.set({
    isTransactionPending: true,
    transactionHash: hash
  });
}

export function clearTransactionPending() {
  pendingTransaction.set({
    isTransactionPending: false,
    transactionHash: null
  });
} 