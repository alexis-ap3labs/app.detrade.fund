import { json } from '@sveltejs/kit';
import { ALL_VAULTS } from '$lib/vaults';
import clientPromise from '$lib/mongodb';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

interface SettlementEvent {
  timestamp: string;
  pps: string;
  blockTimestamp: number;
  totalSupply: string;
  totalAssets: string;
  sequence: number;
}

type TimeFilter = 'all' | '3m' | '1m' | '1w';

function formatISODate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function getStartTimestamp(timeFilter: TimeFilter): number {
  const now = Math.floor(Date.now() / 1000);
  switch (timeFilter) {
    case '3m':
      return now - (90 * 24 * 60 * 60);
    case '1m':
      return now - (30 * 24 * 60 * 60);
    case '1w':
      return now - (7 * 24 * 60 * 60);
    case 'all':
    default:
      return 0;
  }
}

export const GET: RequestHandler = async ({ url, params }) => {
  try {
    const { id } = params;
    const timeFilter = (url.searchParams.get('time') || 'all') as TimeFilter;
    
    console.log('Fetching settlements for vault:', id, 'with time filter:', timeFilter);
    
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
    
    // Récupérer les événements de règlement
    const startTimestamp = getStartTimestamp(timeFilter);
    const events = await collection
      .find({ 
        type: { $in: ['settleDeposit', 'settleRedeem'] },
        blockTimestamp: { $exists: true, $ne: null, $gte: startTimestamp }
      })
      .sort({ blockTimestamp: -1 })
      .toArray();

    // Transformer les événements
    const settlements: SettlementEvent[] = events.map(event => ({
      timestamp: formatISODate(event.blockTimestamp),
      pps: event.pps || '0',
      blockTimestamp: event.blockTimestamp,
      totalSupply: event.totalSupply || '0',
      totalAssets: event.totalAssets || '0',
      sequence: event.sequence || 0
    }));

    return json({ settlements });
  } catch (error) {
    console.error('Error fetching settlements:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 