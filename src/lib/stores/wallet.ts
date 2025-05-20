import { writable } from 'svelte/store';

// Interface pour l'état du wallet
interface WalletState {
  address: string | null;
  chainId: number | null;
  error: string | null;
  isConnecting: boolean;
}

// Store pour l'état du wallet
const walletState = writable<WalletState>({
  address: null,
  chainId: null,
  error: null,
  isConnecting: false
});

// Store pour l'état de connexion
export const isConnected = writable<boolean>(false);

// Store pour l'adresse du wallet
export const address = writable<string | null>(null);

// Store pour le chainId
export const chainId = writable<number | null>(null);

// Store pour les erreurs
export const error = writable<string | null>(null);

// Store pour l'état du wallet
export const wallet = {
  subscribe: walletState.subscribe,
  set: walletState.set,
  update: walletState.update,
  
  // Méthodes pour mettre à jour l'état
  updateAddress: (newAddress: string | null) => {
    walletState.update(state => ({
      ...state,
      address: newAddress
    }));
    address.set(newAddress);
    isConnected.set(!!newAddress);
  },
  
  updateChainId: (newChainId: number | null) => {
    walletState.update(state => ({
      ...state,
      chainId: newChainId
    }));
    chainId.set(newChainId);
  },
  
  setError: (newError: string | null) => {
    walletState.update(state => ({
      ...state,
      error: newError
    }));
    error.set(newError);
  },
  
  disconnect: () => {
    walletState.set({
      address: null,
      chainId: null,
      error: null,
      isConnecting: false
    });
    isConnected.set(false);
    address.set(null);
    chainId.set(null);
    error.set(null);
  },
  
  clearError: () => {
    walletState.update(state => ({
      ...state,
      error: null
    }));
    error.set(null);
  }
}; 