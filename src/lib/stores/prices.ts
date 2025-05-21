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
    // Chargement initial : requêtes parallèles avec priorité pour WETH
    const sortedTokens = [...tokens].sort((a, b) => {
      if (a === 'WETH') return -1;
      if (b === 'WETH') return 1;
      return 0;
    });
    
    // Faire les requêtes en parallèle mais avec priorité pour WETH
    await Promise.all(sortedTokens.map(token => updateTokenPrice(token)));
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
    console.log('[prices] Getting price for', token);
    
    // Vérifier si le prix est déjà en cache et valide
    const cachedPrice = get(pricesState)[token];
    if (cachedPrice && isPriceValid(cachedPrice.lastUpdated)) {
      console.log('[prices] Using cached price for', token, ':', cachedPrice.price);
      return cachedPrice.price;
    }

    try {
      // Mettre à jour le prix
      await updateTokenPrice(token);
      
      // Vérifier que le prix a bien été mis à jour
      const updatedPrice = get(pricesState)[token];
      if (!updatedPrice) {
        throw new Error(`Failed to update price for ${token}`);
      }
      
      console.log('[prices] Price updated for', token, ':', updatedPrice.price);
      return updatedPrice.price;
    } catch (error) {
      console.error('[prices] Error getting price for', token, ':', error);
      // Si on a un prix en cache même expiré, on le retourne
      if (cachedPrice) {
        console.log('[prices] Using expired cached price for', token, ':', cachedPrice.price);
        return cachedPrice.price;
      }
      throw error;
    }
  },
  
  // Initialiser le store avec une liste de tokens à suivre
  initialize(tokens: string[]) {
    console.log('[prices] Initializing store with tokens:', tokens);
    
    // S'assurer que WETH est toujours présent pour le vault ETH
    if (!tokens.includes('WETH')) {
      tokens.push('WETH');
      console.log('[prices] Added WETH to token list');
    }
    
    // Démarrer le rafraîchissement automatique
    startBackgroundRefresh(tokens);
    
    // Faire un premier chargement immédiat des prix
    tokens.forEach(token => {
      console.log('[prices] Fetching initial price for', token);
      this.getPrice(token).catch(error => {
        console.error('[prices] Error fetching initial price for', token, ':', error);
      });
    });

    // Vérifier spécifiquement le prix WETH
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