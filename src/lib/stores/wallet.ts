import { writable } from 'svelte/store';

// Interface for wallet state
interface WalletState {
  address: string | null;
  chainId: number | null;
  error: string | null;
  isConnecting: boolean;
}

// Store for wallet state
const walletState = writable<WalletState>({
  address: null,
  chainId: null,
  error: null,
  isConnecting: false
});

// Store for connection state
export const isConnected = writable<boolean>(false);

// Store for wallet address
export const address = writable<string | null>(null);

// Store for chain ID
export const chainId = writable<number | null>(null);

// Store for errors
export const error = writable<string | null>(null);

// Store for wallet state
export const wallet = {
  subscribe: walletState.subscribe,
  set: walletState.set,
  update: walletState.update,
  
  // Methods to update state
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