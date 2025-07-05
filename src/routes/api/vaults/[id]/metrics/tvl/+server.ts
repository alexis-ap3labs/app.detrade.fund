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
  // Convert to BigInt to avoid precision issues
  const valueBigInt = BigInt(value);
  const divisor = BigInt(10) ** BigInt(decimals);
  
  // Calculate integer and decimal parts
  const integerPart = valueBigInt / divisor;
  const decimalPart = valueBigInt % divisor;
  
  // Format the decimal part with the correct number of zeros
  const decimalStr = decimalPart.toString().padStart(decimals, '0');
  
  // Return the complete number with all decimals
  return `${integerPart}.${decimalStr}`;
}

function isValidTimestamp(timestamp: number): boolean {
  return !isNaN(timestamp) && 
         timestamp > 0 && 
         timestamp < 2147483647 && // Max 32-bit integer
         timestamp < Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // Not more than a year in the future
}

function formatISODate(timestamp: number): string {
  if (!isValidTimestamp(timestamp)) {
    console.error('Invalid timestamp:', timestamp);
    return new Date().toISOString(); // Return current date on error
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
    
    // Check if vault exists
    const vault = ALL_VAULTS.find(v => v.id === id);
    if (!vault) {
      return json({ error: 'Vault not found' }, { status: 404 });
    }

    // Get underlying token decimals
    const decimals = vault.underlyingTokenDecimals;
    if (!decimals) {
      console.error(`No decimals found for vault ${id}`);
      return json({ error: 'Invalid vault configuration' }, { status: 500 });
    }

    // Check MongoDB URI
    if (!env.MONGO_URI) {
      return json({ error: 'Database configuration error' }, { status: 500 });
    }

    // Connect to MongoDB
    const client = await clientPromise;
    const db = client.db(id);
    const collection = db.collection('subgraph');
    
    // Get relevant events
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

    // Transform events
    const rawEvents: RawEvent[] = events
      .filter(event => event.blockTimestamp && event.totalAssets && isValidTimestamp(event.blockTimestamp))
      .reduce((acc: RawEvent[], event) => {
        const existingEvent = acc.find(e => e.blockTimestamp === event.blockTimestamp);
        
        console.log(`Processing event: type=${event.type}, timestamp=${event.blockTimestamp}, totalAssets=${event.totalAssets}`);
        
        if (existingEvent) {
          console.log(`Found existing event at same timestamp: type=${existingEvent.type}, totalAssets=${existingEvent.totalAssets}`);
          
          // If we already have an event at this timestamp, we need to decide which one to keep
          // Priority: settleRedeem > settleDeposit > totalAssetsUpdated
          // (Settlement events reflect the final state after the transaction)
          let shouldReplace = false;
          
          if (event.type === 'settleRedeem') {
            // settleRedeem has priority over everything
            shouldReplace = true;
            console.log('Replacing with settleRedeem (highest priority)');
          } else if (event.type === 'settleDeposit' && existingEvent.type === 'totalAssetsUpdated') {
            // settleDeposit has priority over totalAssetsUpdated
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
          // New timestamp, add the event
          acc.push({
            blockTimestamp: event.blockTimestamp,
            totalAssets: parseFloat(divideBigNumber(event.totalAssets || '0', decimals)),
            type: event.type
          });
          console.log(`Added new event. totalAssets: ${parseFloat(divideBigNumber(event.totalAssets || '0', decimals))}`);
        }
        return acc;
      }, []);

    // If latest=true, return only the last TVL
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

    // Filter events according to timeFilter
    const startTimestamp = getStartTimestamp(timeFilter);
    const filteredEvents = rawEvents.filter(event => event.blockTimestamp >= startTimestamp);

    // DO NOT interpolate, just deduplicate by timestamp
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