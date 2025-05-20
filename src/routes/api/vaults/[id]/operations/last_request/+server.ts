import { json } from '@sveltejs/kit';
import { ALL_VAULTS } from '$lib/vaults';
import clientPromise from '$lib/mongodb';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, params }) => {
  try {
    const { id } = params;
    const userAddress = url.searchParams.get('userAddress');
    
    if (!userAddress) {
      return json({ error: 'User address is required' }, { status: 400 });
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

    return json({
      lastDepositRequestId: lastDeposit?.requestId || null,
      lastRedeemRequestId: lastRedeem?.requestId || null
    });
  } catch (error) {
    console.error('Error fetching last request IDs:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 