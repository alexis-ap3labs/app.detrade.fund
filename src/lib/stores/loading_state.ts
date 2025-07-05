import { writable } from 'svelte/store';

interface LoadingState {
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
  readyToDisplay: boolean;
  dataCount: number;
  expectedDataCount: number;
  isGlobalDataReady: boolean;
}

function createLoadingStateStore() {
  const { subscribe, set, update } = writable<LoadingState>({
    isLoading: false,
    error: null,
    lastUpdated: null,
    readyToDisplay: false,
    dataCount: 0,
    expectedDataCount: 0,
    isGlobalDataReady: false
  });

  return {
    subscribe,
    setLoading: (isLoading: boolean) => {
      update(state => ({
        ...state,
        isLoading,
        error: isLoading ? null : state.error,
        readyToDisplay: false,
        dataCount: 0
      }));
    },
    setError: (error: string | null) => {
      update(state => ({
        ...state,
        error,
        isLoading: false,
        readyToDisplay: false
      }));
    },
    setLastUpdated: (timestamp: number) => {
      update(state => ({
        ...state,
        lastUpdated: timestamp
      }));
    },
    setExpectedDataCount: (count: number) => {
      update(state => ({
        ...state,
        expectedDataCount: count
      }));
    },
    incrementDataCount: () => {
      update(state => {
        const newCount = state.dataCount + 1;
        return {
          ...state,
          dataCount: newCount,
          readyToDisplay: newCount >= state.expectedDataCount
        };
      });
    },
    setGlobalDataReady: (isReady: boolean) => {
      update(state => ({
        ...state,
        isGlobalDataReady: isReady
      }));
    },
    reset: () => set({
      isLoading: false,
      error: null,
      lastUpdated: null,
      readyToDisplay: false,
      dataCount: 0,
      expectedDataCount: 0,
      isGlobalDataReady: false
    })
  };
}

export const loadingState = createLoadingStateStore(); 