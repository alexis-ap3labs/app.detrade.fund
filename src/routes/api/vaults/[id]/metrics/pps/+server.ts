import { json } from '@sveltejs/kit';
import { ALL_VAULTS } from '$lib/vaults';
import clientPromise from '$lib/mongodb';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

interface PpsEvent {
  timestamp: string;
  blockTimestamp: number;
  transactionHash: string;
  pps: string;
  ppsFormatted: number;
  relatedEvents: {
    type: string;
    blockTimestamp: string | number;
    id: string;
    [key: string]: any;
  }[];
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

function extractTransactionHashFromId(id: string): string | null {
  // L'ID est au format: 0x...hash...000000 ou 0x...hash...aa010000
  const match = id.match(/^(0x[a-f0-9]{64})/);
  return match ? match[1] : null;
}

function formatPps(pps: string): number {
  // Always divide by 1e18 to get the formatted value
  return Number(pps) / Math.pow(10, 18);
}

function calculatePps(event: any, relatedEvents: any[], decimals: number): { raw: string, formatted: number } | null {
  let rawPps: string;
  
  // Look for settleDeposit event first
  const settleDepositEvent = relatedEvents.find(e => e.type === 'settleDeposit');
  if (settleDepositEvent?.totalAssets && settleDepositEvent?.totalSupply) {
    console.log('Calculating PPS from settleDeposit:', {
      totalAssets: settleDepositEvent.totalAssets,
      totalSupply: settleDepositEvent.totalSupply,
      decimals
    });
    
    try {
      // Calculate PPS as totalAssets/totalSupply
      const totalAssets = BigInt(settleDepositEvent.totalAssets);
      const totalSupply = BigInt(settleDepositEvent.totalSupply);
      
      // Normalize totalAssets to 18 decimals if needed (for USDC)
      const normalizedAssets = totalAssets * BigInt(Math.pow(10, 18 - decimals));
      
      // Calculate PPS: (normalizedAssets * 1e18) / totalSupply
      const ppsValue = (normalizedAssets * BigInt(Math.pow(10, 18))) / totalSupply;
      
      console.log('PPS calculation result:', {
        totalAssets: totalAssets.toString(),
        normalizedAssets: normalizedAssets.toString(),
        totalSupply: totalSupply.toString(),
        ppsValue: ppsValue.toString()
      });
      
      rawPps = ppsValue.toString();
    } catch (error) {
      console.error('Error calculating PPS:', error);
      // Fallback to 1e18 if calculation fails
      rawPps = Math.pow(10, 18).toString();
    }
  } else {
    // If no settleDeposit, look for settleRedeem event
    const settleRedeemEvent = relatedEvents.find(e => e.type === 'settleRedeem');
    if (settleRedeemEvent?.totalAssets && settleRedeemEvent?.totalSupply) {
      console.log('Calculating PPS from settleRedeem:', {
        totalAssets: settleRedeemEvent.totalAssets,
        totalSupply: settleRedeemEvent.totalSupply,
        decimals
      });
      
      try {
        // Calculate PPS as totalAssets/totalSupply
        const totalAssets = BigInt(settleRedeemEvent.totalAssets);
        const totalSupply = BigInt(settleRedeemEvent.totalSupply);
        
        // Normalize totalAssets to 18 decimals if needed (for USDC)
        const normalizedAssets = totalAssets * BigInt(Math.pow(10, 18 - decimals));
        
        // Calculate PPS: (normalizedAssets * 1e18) / totalSupply
        const ppsValue = (normalizedAssets * BigInt(Math.pow(10, 18))) / totalSupply;
        
        console.log('PPS calculation result:', {
          totalAssets: totalAssets.toString(),
          normalizedAssets: normalizedAssets.toString(),
          totalSupply: totalSupply.toString(),
          ppsValue: ppsValue.toString()
        });
        
        rawPps = ppsValue.toString();
      } catch (error) {
        console.error('Error calculating PPS:', error);
        // Fallback to 1e18 if calculation fails
        rawPps = Math.pow(10, 18).toString();
      }
    } else {
      // If no settleRedeem, look for highWaterMarkUpdated event
      const highWaterMarkEvent = relatedEvents.find(e => e.type === 'highWaterMarkUpdated');
      if (highWaterMarkEvent?.newHighWaterMark) {
        console.log('Using highWaterMarkUpdated value:', highWaterMarkEvent.newHighWaterMark);
        // Convert highWaterMark to wei (multiply by 1e18)
        // For tokens with 6 decimals, divide by 1e6 then multiply by 1e18
        // For tokens with 18 decimals, multiply directly by 1e18
        const highWaterMarkValue = Number(highWaterMarkEvent.newHighWaterMark) / Math.pow(10, decimals);
        rawPps = (BigInt(Math.floor(highWaterMarkValue * Math.pow(10, 18)))).toString();
      } else {
        // If we only have totalAssetsUpdated, we ignore it
        return null;
      }
    }
  }

  const formatted = formatPps(rawPps);
  console.log('Final PPS values:', { raw: rawPps, formatted });
  
  return {
    raw: rawPps,
    formatted
  };
}

export const GET: RequestHandler = async ({ url, params }) => {
  try {
    const { id } = params;
    const timeFilter = (url.searchParams.get('time') || 'all') as TimeFilter;
    const latest = url.searchParams.get('latest') === 'true';
    
    console.log('Fetching PPS data for vault:', id, 'with time filter:', timeFilter, 'latest:', latest);
    
    // Check if vault exists
    const vault = ALL_VAULTS.find(v => v.id === id);
    if (!vault) {
      return json({ error: 'Vault not found' }, { status: 404 });
    }

    // Check that vault has either 6 or 18 decimals
    if (vault.underlyingTokenDecimals !== 6 && vault.underlyingTokenDecimals !== 18) {
      return json({ error: 'PPS calculation is only supported for vaults with 6 or 18 decimals' }, { status: 400 });
    }

    // Check MongoDB URI
    if (!env.MONGO_URI) {
      return json({ error: 'Database configuration error' }, { status: 500 });
    }

    // Connect to MongoDB
    const client = await clientPromise;
    const db = client.db(id);
    const collection = db.collection('subgraph');

    // Get all totalAssetsUpdated events
    const totalAssetsEvents = await collection
      .find({ 
        type: 'totalAssetsUpdated',
        blockTimestamp: { $exists: true, $ne: null }
      })
      .sort({ blockTimestamp: -1 })
      .toArray();

    console.log('Found', totalAssetsEvents.length, 'totalAssetsUpdated events');

    // Transform events and get associated events
    const allEvents: PpsEvent[] = [];
    
    for (const event of totalAssetsEvents) {
      // Get transaction hash
      let transactionHash = '';
      if ('transactionHash' in event && event.transactionHash) {
        transactionHash = event.transactionHash;
      } else {
        const hashFromId = extractTransactionHashFromId(event.id);
        if (hashFromId) {
          transactionHash = hashFromId;
        }
      }

      if (transactionHash) {
        console.log(`Fetching related events for hash: ${transactionHash}`);
        
        // Get all events with this hash
        const relatedEvents = await collection
          .find({
            $or: [
              { transactionHash },
              { id: { $regex: `^${transactionHash}` } }
            ]
          })
          .toArray();

        console.log(`Found ${relatedEvents.length} related events for hash ${transactionHash}`);

        const ppsResult = calculatePps(event, relatedEvents, vault.underlyingTokenDecimals);
        if (ppsResult) {
          allEvents.push({
            timestamp: formatISODate(parseInt(event.blockTimestamp)),
            blockTimestamp: parseInt(event.blockTimestamp),
            transactionHash,
            pps: ppsResult.raw,
            ppsFormatted: ppsResult.formatted,
            relatedEvents: relatedEvents.map(e => ({
              type: e.type,
              blockTimestamp: e.blockTimestamp,
              id: e.id,
              ...e
            }))
          });
        }
      }
    }

    // If latest=true, return only the last event
    if (latest) {
      const lastEvent = allEvents[0];
      if (!lastEvent) {
        return json({ error: 'No PPS data available' }, { status: 404 });
      }

      return json({
        latestPps: {
          timestamp: lastEvent.timestamp,
          pps: lastEvent.ppsFormatted.toString()
        }
      });
    }

    // Filter events according to timeFilter
    const startTimestamp = getStartTimestamp(timeFilter);
    const filteredEvents = allEvents
      .filter(event => event.blockTimestamp >= startTimestamp)
      .sort((a, b) => a.blockTimestamp - b.blockTimestamp);

    return json({ pps: filteredEvents });
  } catch (error) {
    console.error('Error fetching PPS data:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 