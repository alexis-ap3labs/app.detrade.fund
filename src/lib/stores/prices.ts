import { writable, get } from 'svelte/store';

interface PriceData {
  price: number;
  lastUpdated: number;
  source: 'coingecko' | 'coinmarketcap';
}

interface PricesState {
  [token: string]: PriceData;
}

// Durée de validité du cache en millisecondes (15 minutes)
const CACHE_DURATION = 15 * 60 * 1000;
// Délai entre les requêtes en millisecondes (1 seconde)
const REQUEST_DELAY = 1000;
// Intervalle de rafraîchissement automatique (5 minutes)
const REFRESH_INTERVAL = 5 * 60 * 1000;

// Store pour les prix
const pricesState = writable<PricesState>({});

// Map pour suivre les requêtes en cours
const pendingRequests = new Map<string, Promise<{ price: number; source: 'coingecko' | 'coinmarketcap' }>>();

// Fonction pour vérifier si le prix est toujours valide
function isPriceValid(lastUpdated: number): boolean {
  return Date.now() - lastUpdated < CACHE_DURATION;
}

// Fonction pour attendre un délai
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fonction pour récupérer le prix depuis CoinGecko
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

// Fonction pour récupérer le prix depuis CoinMarketCap
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

// Fonction pour récupérer le prix d'un token
async function fetchPrice(token: string): Promise<{ price: number; source: 'coingecko' | 'coinmarketcap' }> {
  // Si une requête est déjà en cours pour ce token, on attend son résultat
  if (pendingRequests.has(token)) {
    return pendingRequests.get(token)!;
  }

  const requestPromise = (async () => {
    try {
      // Essayer d'abord CoinGecko
      return await fetchFromCoinGecko(token);
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT') {
        console.log('CoinGecko rate limited, falling back to CoinMarketCap...');
        // Si CoinGecko rate limite, utiliser CoinMarketCap
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

// Fonction pour mettre à jour le prix d'un token
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

// Fonction pour rafraîchir tous les prix en parallèle
async function backgroundRefresh(tokens: string[]) {
  // Pour le chargement initial, on fait les requêtes en parallèle
  const initialLoad = !Object.keys(get(pricesState)).length;
  
  if (initialLoad) {
    // Chargement initial : requêtes parallèles
    await Promise.all(tokens.map(token => updateTokenPrice(token)));
  } else {
    // Rafraîchissement normal : requêtes séquentielles avec délai
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

// Démarrer le rafraîchissement automatique
let refreshInterval: NodeJS.Timeout | null = null;

function startBackgroundRefresh(tokens: string[]) {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // Commencer immédiatement le chargement initial
  backgroundRefresh(tokens);

  // Configurer l'intervalle de rafraîchissement
  refreshInterval = setInterval(() => {
    backgroundRefresh(tokens);
  }, REFRESH_INTERVAL);
}

// Store exporté avec les méthodes
export const prices = {
  subscribe: pricesState.subscribe,
  
  // Récupérer le prix d'un token (utilise le cache si valide)
  async getPrice(token: string): Promise<number> {
    const state = get(pricesState);
    const currentPrice = state[token];
    
    // Toujours retourner le prix en cache s'il existe
    if (currentPrice) {
      return currentPrice.price;
    }
    
    // Si pas de prix en cache du tout, on fait une requête
    try {
      const { price } = await fetchPrice(token);
      pricesState.update(state => ({
        ...state,
        [token]: {
          price,
          lastUpdated: Date.now(),
          source: 'coingecko'
        }
      }));
      return price;
    } catch (error) {
      throw error;
    }
  },
  
  // Initialiser le store avec une liste de tokens à suivre
  initialize(tokens: string[]) {
    startBackgroundRefresh(tokens);
  }
}; 