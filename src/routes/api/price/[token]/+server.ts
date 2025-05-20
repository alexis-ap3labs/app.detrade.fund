import { json } from '@sveltejs/kit';
import { ALL_VAULTS } from '$lib/vaults';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

type Vault = typeof ALL_VAULTS[0];

// Cache pour les prix
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_DURATION = 60 * 1000; // 1 minute
const RATE_LIMIT_DELAY = 1000; // 1 seconde entre les requêtes
let lastRequestTime = 0;

// Fonction pour attendre si nécessaire pour respecter les limites de taux
async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

// Fonction pour récupérer le prix depuis CoinGecko
async function fetchFromCoinGecko(vault: Vault) {
  console.log(`Fetching price for ${vault.underlyingToken} (${vault.coingeckoId}) from CoinGecko`);
  
  // Vérifier le cache
  const cachedData = priceCache.get(vault.coingeckoId);
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
    console.log('Using cached price for', vault.coingeckoId);
    return {
      [vault.underlyingToken]: {
        usd: cachedData.price
      }
    };
  }

  await waitForRateLimit();
  
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${vault.coingeckoId}&vs_currencies=usd`
  );

  console.log(`CoinGecko response status: ${response.status}`);
  
  if (response.status === 429) {
    console.log('CoinGecko rate limit hit');
    throw new Error('RATE_LIMIT');
  }

  if (!response.ok) {
    console.error(`CoinGecko error: ${response.status} ${response.statusText}`);
    throw new Error(`Failed to fetch price from CoinGecko: ${response.status}`);
  }

  const data = await response.json();
  console.log('CoinGecko response data:', data);
  
  if (!data[vault.coingeckoId]) {
    console.error(`No price data found for ${vault.coingeckoId} in response:`, data);
    throw new Error(`No price data found for ${vault.coingeckoId}`);
  }

  const price = data[vault.coingeckoId].usd;
  
  // Mettre à jour le cache
  priceCache.set(vault.coingeckoId, {
    price,
    timestamp: Date.now()
  });

  return {
    [vault.underlyingToken]: {
      usd: price
    }
  };
}

// Fonction pour récupérer le prix depuis CoinMarketCap
async function fetchFromCoinMarketCap(vault: Vault) {
  if (!env.COINMARKETCAP_API_KEY) {
    throw new Error('CoinMarketCap API key not configured');
  }

  // Vérifier le cache
  const cachedData = priceCache.get(vault.underlyingToken);
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
    console.log('Using cached price for', vault.underlyingToken);
    return {
      [vault.underlyingToken]: {
        usd: cachedData.price
      }
    };
  }

  await waitForRateLimit();

  const response = await fetch(
    `https://pro-api.coinmarketcap.com/v2/tools/price-conversion?symbol=${vault.underlyingToken}&amount=1&convert=USD`,
    {
      headers: {
        'X-CMC_PRO_API_KEY': env.COINMARKETCAP_API_KEY,
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch price from CoinMarketCap: ${response.status}`);
  }

  const data = await response.json();
  
  // Trouver le token principal (celui avec l'ID 1 ou le premier avec un prix valide)
  const mainToken = data.data.find((token: any) => token.id === 1) || 
                   data.data.find((token: any) => token.quote?.USD?.price != null);
  
  if (!mainToken || !mainToken.quote?.USD?.price) {
    throw new Error('No valid price found in CoinMarketCap response');
  }

  const price = mainToken.quote.USD.price;
  
  // Mettre à jour le cache
  priceCache.set(vault.underlyingToken, {
    price,
    timestamp: Date.now()
  });

  return {
    [vault.underlyingToken]: {
      usd: price
    }
  };
}

export const GET: RequestHandler = async ({ params }) => {
  try {
    const { token } = params;
    
    // Trouver le vault correspondant au token
    const vault = ALL_VAULTS.find(v => v.underlyingToken.toLowerCase() === token.toLowerCase());
    
    if (!vault) {
      return json(
        { error: 'Token not found' },
        { status: 404 }
      );
    }

    // Vérifier que le vault est du bon type
    if (!vault.coingeckoId || !vault.underlyingToken) {
      return json(
        { error: 'Invalid vault configuration' },
        { status: 400 }
      );
    }

    try {
      // Essayer d'abord CoinGecko
      const result = await fetchFromCoinGecko(vault as Vault);
      return json(result);
    } catch (error) {
      console.log('CoinGecko failed, trying CoinMarketCap as fallback:', error);
      
      try {
        // Si CoinGecko échoue pour n'importe quelle raison, utiliser CoinMarketCap
        const result = await fetchFromCoinMarketCap(vault as Vault);
        return json(result);
      } catch (cmcError) {
        console.error('Both CoinGecko and CoinMarketCap failed:', cmcError);
        throw new Error('All price sources failed');
      }
    }
  } catch (error) {
    console.error('Error fetching price:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}; 