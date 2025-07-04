import { json } from '@sveltejs/kit';
import { ALL_VAULTS } from '$lib/vaults';
import clientPromise from '$lib/mongodb';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// Cache mémoire pour les requêtes last_request (clé: `${id}_${userAddress}`)
const lastRequestCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 30 * 1000; // 30 secondes

export const GET: RequestHandler = async ({ url, params }) => {
  try {
    const { id } = params;
    const userAddress = url.searchParams.get('userAddress');
    
    if (!userAddress) {
      return json({ error: 'User address is required' }, { status: 400 });
    }
    
    const cacheKey = `${id}_${userAddress}`;
    const cached = lastRequestCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      return json(cached.data);
    }
    
    console.log('Fetching last request IDs for vault:', id, 'user:', userAddress);
    
    // Vérifier si le vault existe
    const vault = ALL_VAULTS.find(v => v.id === id);
    if (!vault) {
      return json({ error: 'Vault not found' }, { status: 404 });
    }

    // Vérifier l'URI MongoDB
    if (!env.MONGO_URI) {
      return json({ error: 'Database configuration error' }, { status: 500 });
    }

    // Connexion à MongoDB
    const client = await clientPromise;
    const db = client.db(id);
    const collection = db.collection('subgraph');
    
    // Récupérer le dernier deposit request
    const lastDeposit = await collection
      .findOne(
        { 
          type: 'depositRequest',
          controller: userAddress.toLowerCase()
        },
        { sort: { blockTimestamp: -1 } }
      );

    // Récupérer le dernier redeem request
    const lastRedeem = await collection
      .findOne(
        { 
          type: 'redeemRequest',
          controller: userAddress.toLowerCase()
        },
        { sort: { blockTimestamp: -1 } }
      );

    const responseData = {
      lastDepositRequestId: lastDeposit?.requestId || null,
      lastRedeemRequestId: lastRedeem?.requestId || null
    };
    lastRequestCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    return json(responseData);
  } catch (error) {
    console.error('Error fetching last request IDs:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 