import { writable, get } from 'svelte/store';

interface PriceData {
  price: number;
  lastUpdated: number;
  source: 'coingecko' | 'coinmarketcap';
}

interface PricesState {
  [token: string]: PriceData;
}

// Cache validity duration in milliseconds (15 minutes)
const CACHE_DURATION = 15 * 60 * 1000;
// Delay between requests in milliseconds (1 second)
const REQUEST_DELAY = 1000;
// Automatic refresh interval (5 minutes)
const REFRESH_INTERVAL = 5 * 60 * 1000;

// Store for prices
const pricesState = writable<PricesState>({});

// Map to track pending requests
const pendingRequests = new Map<string, Promise<{ price: number; source: 'coingecko' | 'coinmarketcap' }>>();

// Function to check if price is still valid
function isPriceValid(lastUpdated: number): boolean {
  return Date.now() - lastUpdated < CACHE_DURATION;
}

// Function to wait for a delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Function to fetch price from CoinGecko
async function fetchFromCoinGecko(token: string): Promise<{ price: number; source: 'coingecko' }> {
  const response = await fetch(`/api/price/${token.toLowerCase()}`);
  if (response.status === 429) {
    throw new Error('RATE_LIMIT');
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch price: ${response.status}`);
  }
  const data = await response.json();
  
  if (!data[token]?.usd) {
    throw new Error('Invalid price data received');
  }
  return { price: data[token].usd, source: 'coingecko' };
}

// Function to fetch price from CoinMarketCap
async function fetchFromCoinMarketCap(token: string): Promise<{ price: number; source: 'coinmarketcap' }> {
  const response = await fetch(`/api/price/cmc/${token.toLowerCase()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch price from CMC: ${response.status}`);
  }
  const data = await response.json();
  
  if (!data[token]?.usd) {
    throw new Error('Invalid price data from CMC');
  }
  return { price: data[token].usd, source: 'coinmarketcap' };
}

// Function to fetch price of a token
async function fetchPrice(token: string): Promise<{ price: number; source: 'coingecko' | 'coinmarketcap' }> {
  // If a request is already in progress for this token, wait for its result
  if (pendingRequests.has(token)) {
    return pendingRequests.get(token)!;
  }

  const requestPromise = (async () => {
    try {
      // Try CoinGecko first
      return await fetchFromCoinGecko(token);
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT') {
        console.log('CoinGecko rate limited, falling back to CoinMarketCap...');
        // If CoinGecko rate limits, use CoinMarketCap
        return await fetchFromCoinMarketCap(token);
      }
      throw error;
    } finally {
      pendingRequests.delete(token);
    }
  })();

  pendingRequests.set(token, requestPromise);
  return requestPromise;
}

// Function to update a token's price
async function updateTokenPrice(token: string): Promise<void> {
  try {
    const { price, source } = await fetchPrice(token);
    pricesState.update(state => ({
      ...state,
      [token]: {
        price,
        lastUpdated: Date.now(),
        source
      }
    }));
  } catch (error) {
    console.error(`Error updating price for ${token}:`, error);
  }
}

// Function to refresh all prices in parallel
async function backgroundRefresh(tokens: string[]) {
  // For initial load, we make parallel requests
  const initialLoad = !Object.keys(get(pricesState)).length;
  
  if (initialLoad) {
    // Initial load: parallel requests with priority for WETH
    const sortedTokens = [...tokens].sort((a, b) => {
      if (a === 'WETH') return -1;
      if (b === 'WETH') return 1;
      return 0;
    });
    
    // Make parallel requests but with priority for WETH
    await Promise.all(sortedTokens.map(token => updateTokenPrice(token)));
  } else {
    // Normal refresh: sequential requests with delay
    for (const token of tokens) {
      try {
        await updateTokenPrice(token);
        await delay(REQUEST_DELAY);
      } catch (error) {
        console.error(`Error in background refresh for ${token}:`, error);
      }
    }
  }
}

// Start automatic refresh
let refreshInterval: NodeJS.Timeout | null = null;

function startBackgroundRefresh(tokens: string[]) {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // Start initial load immediately
  backgroundRefresh(tokens);

  // Set up refresh interval
  refreshInterval = setInterval(() => {
    backgroundRefresh(tokens);
  }, REFRESH_INTERVAL);
}

// Exported store with methods
export const prices = {
  subscribe: pricesState.subscribe,
  
  // Get token price (uses cache if valid)
  async getPrice(token: string): Promise<number> {
    console.log('[prices] Getting price for', token);
    
    // Check if price is already cached and valid
    const cachedPrice = get(pricesState)[token];
    if (cachedPrice && isPriceValid(cachedPrice.lastUpdated)) {
      console.log('[prices] Using cached price for', token, ':', cachedPrice.price);
      return cachedPrice.price;
    }

    try {
      // Update the price
      await updateTokenPrice(token);
      
      // Verify that the price has been updated
      const updatedPrice = get(pricesState)[token];
      if (!updatedPrice) {
        throw new Error(`Failed to update price for ${token}`);
      }
      
      console.log('[prices] Price updated for', token, ':', updatedPrice.price);
      return updatedPrice.price;
    } catch (error) {
      console.error('[prices] Error getting price for', token, ':', error);
      // If we have a cached price even if expired, return it
      if (cachedPrice) {
        console.log('[prices] Using expired cached price for', token, ':', cachedPrice.price);
        return cachedPrice.price;
      }
      throw error;
    }
  },
  
  // Initialize the store with a list of tokens to track
  initialize(tokens: string[]) {
    console.log('[prices] Initializing store with tokens:', tokens);
    
    // Ensure WETH is always present for ETH vault
    if (!tokens.includes('WETH')) {
      tokens.push('WETH');
      console.log('[prices] Added WETH to token list');
    }
    
    // Start automatic refresh
    startBackgroundRefresh(tokens);
    
    // Fetch initial prices immediately
    tokens.forEach(token => {
      console.log('[prices] Fetching initial price for', token);
      this.getPrice(token).catch(error => {
        console.error('[prices] Error fetching initial price for', token, ':', error);
      });
    });

    // Specifically check WETH price
    if (tokens.includes('WETH')) {
      console.log('[prices] Ensuring WETH price is fetched');
      this.getPrice('WETH').then(price => {
        console.log('[prices] WETH price fetched successfully:', price);
      }).catch(error => {
        console.error('[prices] Error fetching WETH price:', error);
      });
    }
  }
}; 