import { json } from '@sveltejs/kit';
import { ALL_VAULTS } from '$lib/vaults';
import clientPromise from '$lib/mongodb';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, params }) => {
  try {
    const { id } = params;
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    console.log('Debug: Fetching recent events for vault:', id, 'limit:', limit);
    
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
    
    // Récupérer les événements récents
    const events = await collection
      .find({ 
        $or: [
          { type: 'settleDeposit' },
          { type: 'settleRedeem' },
          { type: 'totalAssetsUpdated' }
        ],
        blockTimestamp: { $exists: true, $ne: null }
      })
      .sort({ blockTimestamp: -1 })
      .limit(limit)
      .toArray();

    // Formater les événements pour l'affichage
    const formattedEvents = events.map(event => ({
      type: event.type,
      blockTimestamp: event.blockTimestamp,
      totalAssets: event.totalAssets,
      totalSupply: event.totalSupply,
      date: new Date(event.blockTimestamp * 1000).toISOString(),
      // Ajouter d'autres champs utiles selon le type d'événement
      ...(event.type === 'settleDeposit' && {
        sharesMinted: event.sharesMinted,
        assets: event.assets
      }),
      ...(event.type === 'settleRedeem' && {
        sharesBurned: event.sharesBurned,
        assets: event.assets
      })
    }));

    return json({ 
      vaultId: id,
      totalEvents: events.length,
      events: formattedEvents 
    });
  } catch (error) {
    console.error('Error fetching debug events:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 