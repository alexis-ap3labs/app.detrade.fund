import { writable } from 'svelte/store';

// Interface pour l'état des transactions
interface PendingState {
  isTransactionPending: boolean;
  transactionHash: string | null;
}

// Store pour l'état des transactions
export const pendingTransaction = writable<PendingState>({
  isTransactionPending: false,
  transactionHash: null
});

// Fonctions pour mettre à jour l'état des transactions
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