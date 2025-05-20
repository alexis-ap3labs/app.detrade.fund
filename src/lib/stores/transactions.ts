import { writable } from 'svelte/store';

interface TransactionState {
  isPending: boolean;
  hash?: string;
}

function createTransactionStore() {
  const { subscribe, set, update } = writable<TransactionState>({
    isPending: false
  });

  return {
    subscribe,
    setPending: (hash?: string) => update(state => ({ ...state, isPending: true, hash })),
    setComplete: () => update(state => ({ ...state, isPending: false, hash: undefined })),
    reset: () => set({ isPending: false })
  };
}

export const transactions = createTransactionStore(); 