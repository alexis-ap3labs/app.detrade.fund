import { json } from '@sveltejs/kit';
import { ALL_VAULTS } from '$lib/vaults';
import clientPromise from '$lib/mongodb';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

interface TotalAssetsEvent {
  timestamp: string;
  totalAssets: string;
}

interface RawEvent {
  blockTimestamp: number;
  totalAssets: number;
  type: string;
}

type TimeFilter = 'all' | '3m' | '1m' | '1w';

function divideBigNumber(value: string, decimals: number): string {
  // Convertir en BigInt pour éviter les problèmes de précision
  const valueBigInt = BigInt(value);
  const divisor = BigInt(10) ** BigInt(decimals);
  
  // Calculer la partie entière et décimale
  const integerPart = valueBigInt / divisor;
  const decimalPart = valueBigInt % divisor;
  
  // Formater la partie décimale avec le bon nombre de zéros
  const decimalStr = decimalPart.toString().padStart(decimals, '0');
  
  // Retourner le nombre complet avec toutes les décimales
  return `${integerPart}.${decimalStr}`;
}

function isValidTimestamp(timestamp: number): boolean {
  return !isNaN(timestamp) && 
         timestamp > 0 && 
         timestamp < 2147483647 && // Max 32-bit integer
         timestamp < Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // Pas plus d'un an dans le futur
}

function formatISODate(timestamp: number): string {
  if (!isValidTimestamp(timestamp)) {
    console.error('Invalid timestamp:', timestamp);
    return new Date().toISOString(); // Retourne la date actuelle en cas d'erreur
  }
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
    const latest = url.searchParams.get('latest') === 'true';
    
    console.log('Fetching TVL data for vault:', id, 'with time filter:', timeFilter, 'latest:', latest);
    
    // Vérifier si le vault existe
    const vault = ALL_VAULTS.find(v => v.id === id);
    if (!vault) {
      return json({ error: 'Vault not found' }, { status: 404 });
    }

    // Récupérer les décimales du token sous-jacent
    const decimals = vault.underlyingTokenDecimals;
    if (!decimals) {
      console.error(`No decimals found for vault ${id}`);
      return json({ error: 'Invalid vault configuration' }, { status: 500 });
    }

    // Vérifier l'URI MongoDB
    if (!env.MONGO_URI) {
      return json({ error: 'Database configuration error' }, { status: 500 });
    }

    // Connexion à MongoDB
    const client = await clientPromise;
    const db = client.db(id);
    const collection = db.collection('subgraph');
    
    // Récupérer les événements pertinents
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
      .toArray();

    // Transformer les événements
    const rawEvents: RawEvent[] = events
      .filter(event => event.blockTimestamp && event.totalAssets && isValidTimestamp(event.blockTimestamp))
      .reduce((acc: RawEvent[], event) => {
        const existingEvent = acc.find(e => e.blockTimestamp === event.blockTimestamp);
        
        console.log(`Processing event: type=${event.type}, timestamp=${event.blockTimestamp}, totalAssets=${event.totalAssets}`);
        
        if (existingEvent) {
          console.log(`Found existing event at same timestamp: type=${existingEvent.type}, totalAssets=${existingEvent.totalAssets}`);
          
          // Si on a déjà un événement à ce timestamp, on doit décider lequel garder
          // Priorité : settleRedeem > settleDeposit > totalAssetsUpdated
          // (Les événements de règlement reflètent l'état final après la transaction)
          let shouldReplace = false;
          
          if (event.type === 'settleRedeem') {
            // settleRedeem a la priorité sur tout
            shouldReplace = true;
            console.log('Replacing with settleRedeem (highest priority)');
          } else if (event.type === 'settleDeposit' && existingEvent.type === 'totalAssetsUpdated') {
            // settleDeposit a la priorité sur totalAssetsUpdated
            shouldReplace = true;
            console.log('Replacing totalAssetsUpdated with settleDeposit');
          }
          
          if (shouldReplace) {
            acc = acc.filter(e => e.blockTimestamp !== event.blockTimestamp);
            acc.push({
              blockTimestamp: event.blockTimestamp,
              totalAssets: parseFloat(divideBigNumber(event.totalAssets || '0', decimals)),
              type: event.type
            });
            console.log(`Replaced event. New totalAssets: ${parseFloat(divideBigNumber(event.totalAssets || '0', decimals))}`);
          } else {
            console.log('Keeping existing event (higher or equal priority)');
          }
        } else {
          // Nouveau timestamp, on ajoute l'événement
          acc.push({
            blockTimestamp: event.blockTimestamp,
            totalAssets: parseFloat(divideBigNumber(event.totalAssets || '0', decimals)),
            type: event.type
          });
          console.log(`Added new event. totalAssets: ${parseFloat(divideBigNumber(event.totalAssets || '0', decimals))}`);
        }
        return acc;
      }, []);

    // Si latest=true, retourner uniquement le dernier TVL
    if (latest) {
      const lastEvent = rawEvents[0];
      if (!lastEvent) {
        return json({ error: 'No TVL data found' }, { status: 404 });
      }
      return json({
        latestTvl: {
          timestamp: formatISODate(lastEvent.blockTimestamp),
          totalAssets: lastEvent.totalAssets.toString()
        }
      });
    }

    // Filtrer les événements selon le timeFilter
    const startTimestamp = getStartTimestamp(timeFilter);
    const filteredEvents = rawEvents.filter(event => event.blockTimestamp >= startTimestamp);

    // NE PAS interpoler, juste dédupliquer par timestamp
    const sortedEvents = [...filteredEvents].sort((a, b) => a.blockTimestamp - b.blockTimestamp);
    const uniqueEventsMap = new Map<number, number>();
    for (const event of sortedEvents) {
      uniqueEventsMap.set(event.blockTimestamp, event.totalAssets);
    }
    const uniqueEvents: TotalAssetsEvent[] = Array.from(uniqueEventsMap.entries()).map(([blockTimestamp, totalAssets]) => ({
      timestamp: formatISODate(blockTimestamp),
      totalAssets: totalAssets.toString()
    }));

    return json({ tvl: uniqueEvents });
  } catch (error) {
    console.error('Error fetching TVL data:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 